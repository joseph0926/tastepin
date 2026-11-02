"""프롬프트 제출 훅의 판정 기록과, 효과 측정이 함께 쓰는 화면 작업 판별.

훅은 대화에 아무것도 넣지 않는다. 취향은 사용자가 화면 작업을 시작하며 `/tastepin`로 부를 때
`taste.py apply-context`가 넣는다(tastelib/context.py). 훅은 프롬프트가 화면에 대한 판정이면 원장에 분류 전으로
기록만 한다. 진단과 수정법은 `/taste <판정>`이 보여 준다.

훅은 매 프롬프트마다 실행되므로 원장 수집이나 서버 호출 없이 파일 몇 개만 읽는다.
"""

import datetime as dt
import os
import re

from . import harvest, lab, store

# 영어 단어는 앞이 영문자가 아닐 때만 센다. 2026-10-21에 "promotions.json"의 motion이 화면 작업으로 잡혀
# 모션 규칙이 주입됐다. 뒤는 열어 두어 animations, colors 같은 복수형은 그대로 센다
UI_WORK = re.compile(
    r"디자인|리디자인|uiux|ui/ux|\bui\b|\bux\b|애니메이션|모션|레이아웃|타이포|폰트|색상|컬러|시안|목업|랜딩|"
    r"다크 ?모드|호버|스타일링|예쁘|이쁘|촌스|라디우스|드로어|모달|"
    r"(?<![a-z])(redesign|animation|motion|layout|typography|font|color|tailwind|stylex|shadcn|css|mockup|landing|"
    r"hover|transition|border|radius|drawer)",
    re.I,
)
# 판정 기록에서 화면을 가리키는 말. 판정 신호어("어색", "답답")와 함께 나올 때만 판정으로 기록한다.
# "색"은 어색, 검색, 탐색 같은 낱말 속에서는 세지 않는다
VISUAL_WORK = re.compile(
    r"디자인|리디자인|uiux|ui/ux|\bui\b|\bux\b|모던|스타일링|다크 ?모드|목업|"
    r"레이아웃|타이포|폰트|(?<![어검탐모기사])색|컬러|라디우스|카드|여백|간격|시안|랜딩|예쁘|이쁘|촌스|"
    r"화면|페이지|글씨|글자|버튼|아이콘|헤더|모바일|애니메이션|모션|전환|"
    r"(?<![a-z])(redesign|modern|mockup|layout|font|color|border|radius|animation|motion|transition)",
    re.I,
)
OPT_OUT = re.compile(r"취향 ?무시|no-taste")
# 경로와 스킬, 저장소 이름(/example/uiux, uiux-lab, ui-library-picker)에 든 단어는 화면 작업 요청으로 세지 않는다.
NAME_TOKEN = re.compile(r"[~\w./-]*[/_-][~\w./-]*")
# 취향 원장 자체를 말하는 프롬프트는 화면 작업이 아니라 도구 관리다. /taste의 판정은 스킬이 record로 기록한다
TOOL_MENTION = re.compile(r"\btaste(?:pin)?\b|취향 ?원장", re.I)
# Claude Code는 백그라운드 서브에이전트 보고, 예약 작업, 다른 세션의 메시지에도 이 훅을 실행하고
# 출처를 알리는 입력 필드가 없다. 작업 중 대기열로 들어온 작업 알림이 접두어 검사를 지나 주입된 일이
# 있었으므로(2026-10-03), 하네스 표식이 본문 어디에 있든 사람의 입력이 아닌 것으로 본다.
HARNESS_MARKERS = re.compile(
    r"<task-notification>|\[SYSTEM NOTIFICATION - NOT USER INPUT\]|\[MESSAGE FROM NON-USER SOURCE"
    r"|\[SCHEDULED TASK - AUTOMATED FIRING|<cross-session-message\b|<teammate-message\b"
)
def feedback_section(symptom_ids, symptoms_doc, rules, verdicts):
    by_id = {s["id"]: s for s in symptoms_doc["symptoms"]}
    lines = [
        "## 사용자 피드백 해석 (취향 원장)",
        "방금 프롬프트의 판정을 아래 증상으로 읽었다. 사용자의 말이 우선이며, 해석이 맞지 않으면 무시한다.",
    ]
    for symptom_id in symptom_ids:
        symptom = by_id[symptom_id]
        liked = store.is_liked(symptom)
        # 좋아한 패턴은 칭찬을, 나머지는 지적을 센다
        past = sum(
            1 for v in verdicts
            if v["status"] != "ignored" and v["polarity"] != ("negative" if liked else "positive")
            and symptom_id in v["symptoms"]
        )
        if liked:
            lines.append(f"- 좋아한 패턴 {symptom['label']}: {symptom['term']}" + (f", 이전에도 {past}회 칭찬" if past else ""))
            lines.append(f"  유지: {symptom['fix']}")
        else:
            lines.append(f"- {symptom['label']}: {symptom['term']}" + (f", 이전에도 {past}회 지적" if past else ""))
            lines.append(f"  수정: {symptom['fix']}")
        lines.append(f"  확인: {symptom['check']}")
        owners = [r["title"] for r in rules if symptom_id in r.get("symptoms", [])]
        if owners:
            lines.append(f"  관련 취향 규칙: {', '.join(owners)}")
    if store.LINT_SYMPTOMS.intersection(symptom_ids):
        lines.append(f"고친 뒤 `{store.LINT_COMMAND}`로 같은 증상이 값으로도 사라졌는지 확인한다.")
    return "\n".join(lines)


def _mentioned_components(text):
    """요청에 나온 시편 컴포넌트와 카탈로그. labs는 별도 저장소라 편집 중일 수 있어, 읽지 못하면 이 부분만 건너뛴다."""
    try:
        catalog = lab.load_catalog()
        return lab.component_matcher(catalog)(text), catalog
    except (OSError, ValueError, re.error) as error:
        try:
            with open(os.path.join(store.STATE_DIR, "server.log"), "a", encoding="utf-8") as log:
                log.write(f"hook catalog error: {error!r}\n")
        except OSError:
            pass
        return [], {"components": []}


# Codex 메모리 정리처럼 사람이 아닌 작업이 이 경로에서 대화 요약을 프롬프트로 넣는다. agent_id가 없어 경로로 거른다
BACKGROUND_WORKSPACES = (os.path.expanduser("~/.codex/memories"),)


def _is_background_workspace(cwd):
    return bool(cwd) and os.path.realpath(cwd).startswith(BACKGROUND_WORKSPACES)


def skips_prompt(prompt, cwd):
    """훅이 다루지 않는 입력. 효과 측정이 지난 기록을 다시 판별할 때도 같은 기준을 쓴다."""
    # 백그라운드 작업 알림처럼 하네스가 넣은 메시지도 이 훅을 거치므로 사람의 입력만 본다
    return (
        not prompt
        or bool(OPT_OUT.search(prompt))
        or prompt.startswith(harvest.INJECTED_PREFIXES)
        or bool(HARNESS_MARKERS.search(prompt))
        or bool(TOOL_MENTION.search(prompt))
        or _is_background_workspace(cwd)
    )


def without_names(prompt):
    return NAME_TOKEN.sub(" ", prompt)


def is_screen_work(text_without_names, components):
    # 컴포넌트 별칭은 화면 요소를 가리킬 때만 맞게 좁게 써 두었으므로 컴포넌트 언급도 화면 작업으로 본다
    return bool(UI_WORK.search(text_without_names)) or bool(components)


def _taste_session(session):
    """/taste로 취향을 받은 세션. 화면 단어가 없는 짧은 판정("뚝뚝 끊겨요")도 이 세션에서는 판정으로 본다."""
    if not session:
        return False
    return any(d["session"] == session for d in store.load_deliveries())


def record_prompt(prompt, session, cwd, source):
    """훅 입력 하나가 화면에 대한 판정이면 원장에 분류 전으로 기록한다. 대화에는 아무것도 넣지 않는다."""
    prompt = prompt.replace("\ufffd", "").strip()
    if skips_prompt(prompt, cwd):
        return False
    is_verdict = (
        len(prompt) <= harvest.MAX_VERDICT_CHARS
        and harvest.VERDICT_WORDS.search(prompt)
        and not harvest.REQUEST_MARKERS.search(prompt)
    )
    if not is_verdict:
        return False
    stripped = without_names(prompt)
    components, _ = _mentioned_components(stripped)
    about_screen = UI_WORK.search(stripped) or VISUAL_WORK.search(stripped) or components
    if not about_screen and not _taste_session(session):
        return False
    return store.append_verdict({
        "id": harvest.verdict_id(source, session, prompt),
        "ts": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": source,
        "session": session,
        "project": cwd.replace(harvest.HOME, "~") if cwd else "",
        "text": prompt,
        "context": "",
        "symptoms": store.symptom_matcher(store.load_symptoms())(prompt),
        "components": components,
        "polarity": harvest.polarity(prompt),
        "origin": "hook",
        "status": "new",
    })
