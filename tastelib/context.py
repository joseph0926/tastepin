"""`/tastepin` 적용 모드가 에이전트에게 넘기는 취향.

사용자가 화면 작업을 시작하며 `/tastepin`를 부르면 스킬이 `taste.py apply-context`를 실행하고 이 문구를 그대로 읽는다.
규칙, 전역 시편, 컴포넌트 시편, 예외 사이의 우선순위는 여기서 미리 풀어 한 항목에 값 하나만 나가게 한다.
- 화면 전체 값과 모션 기본값은 전역 시편에서 고른 값이다.
- 요청에 나온 컴포넌트만 그 컴포넌트에서 고른 값을 붙인다. 나머지는 이름만 알려 필요할 때 더 받게 한다.
- 규칙은 값이 다루지 않는 판단(템플릿 구성, 형용사 번역 등)을 맡는다. 숫자가 겹치면 고른 값이 앞선다.
"""

import json
import os
import re

from . import inject, lab, store

# 곡선을 비교하지 않은 컴포넌트 값의 곡선 표기는 시편 구현의 기본값이다
CURVE_MENTION = re.compile(r"cubic-bezier|ease", re.I)
DECIDED = ("확정", "관찰")


def _value_line(dimension, pref):
    label, text = lab._value_label(dimension, pref["value"])
    notes = []
    if pref["status"] == "관찰":
        notes.append("관찰 중")
    if pref["changed"]:
        notes.append("구현을 고쳐 다시 확인 전")
    suffix = f" ({', '.join(notes)})" if notes else ""
    lines = [f"- {dimension['label']}: {label}. {text}{suffix}"]
    # 재확인에서 기준과 다른 값을 고른 조건만 따로 적는다
    for key, variant in sorted(pref["variants"].items()):
        if variant["status"] in DECIDED and variant["value"] != pref["value"]:
            v_label, v_text = lab._value_label(dimension, variant["value"])
            lines.append(f"  - {lab.condition_label(key)}에서는: {v_label}. {v_text}")
    return lines


def _decided_lines(component, prefs):
    """고른 값 줄과, 고른 값이 하나라도 있을 때만 상관없음과 아직 모름 차원을 덧붙인다."""
    lines, free, unknown = [], [], []
    for dimension in component["dimensions"]:
        pref = prefs[dimension["id"]]
        if pref["status"] in DECIDED:
            lines += _value_line(dimension, pref)
        elif pref["status"] == "무관":
            free.append(dimension["label"])
        elif pref["status"] == "새 값 필요":
            lines.append(f"- {dimension['label']}: 비교한 값이 모두 별로였다. 시편의 값들과 다른 방향을 고른다")
        elif pref["status"] == "미평가":
            unknown.append(dimension["label"])
    if lines and free:
        lines.append(f"- 상관없음: {', '.join(free)}")
    if lines and unknown:
        lines.append(f"- 아직 모름: {', '.join(unknown)}. 위 값과 어울리는 쪽을 고르고 결과 보고에 적는다")
    return lines


def _global_lines(catalog, judgments, axis, exceptions):
    lines, undecided = [], []
    globals_ = [c for c in catalog["components"] if lab.is_global(c) and c.get("axis") == axis]
    for component in globals_:
        decided = _decided_lines(component, lab.component_preferences(component, judgments))
        if decided:
            lines += decided
        else:
            undecided.append(component)
    if undecided:
        labels = ", ".join(c["label"] for c in undecided)
        lines.append(
            f"- 아직 고른 값 없음: {labels}. 아래 규칙 안에서 고르고, 결과 끝에 이 시편을 1분 평가하면 다음부터 "
            f"취향대로 맞춘다고 한 줄로 제안한다(`{lab.LAB_COMMAND} {undecided[0]['id']}`)"
        )
    ids = {c["id"] for c in globals_}
    known = {c["id"]: c for c in catalog["components"]}
    # 컴포넌트 규칙의 overrides는 그 컴포넌트에서 이 전역 값을 쓰지 말라는 예외다. 요청에 컴포넌트가 없어도 알린다
    for rule in exceptions:
        if rule["overrides"] in ids:
            target = known.get(rule["component"], {"label": rule["component"]})
            lines.append(f"- 예외 {target['label']}: {rule['title']}: 피할 것 {rule['avoid']} / 할 것 {rule['do']}")
    return lines


def _component_block(component, judgments, rules, verdicts, portable=False):
    prefs = lab.component_preferences(component, judgments)
    lines = [f"### 컴포넌트: {component['label']}"]
    scoped = [
        f"- 규칙 {rule['title']}: 피할 것 {rule['avoid']} / 할 것 {rule['do']}"
        for rule in rules if rule.get("component") == component["id"] and rule["status"] == "확정"
    ]
    decided = _decided_lines(component, prefs)
    if not decided:
        lines.append(
            "- 아직 고른 값이 없다. 흔한 기본 모양으로 수렴하지 말고 위 값과 규칙에 맞춰 만든 뒤, 결과 끝에 "
            f"'{component['label']} 시편을 1분 평가하면 다음부터 취향대로 만든다'를 한 줄로 제안한다"
            f"(`{lab.LAB_COMMAND} {component['id']}`)"
        )
        return lines + scoped
    lines += decided
    curve = lab._curve_dimension(component, prefs)
    if curve:
        lines.append(f"- 곡선과 길이: 이 컴포넌트는 '{curve['label']}' 값을 쓴다. 다른 줄의 길이와 곡선보다 앞선다")
    elif any(CURVE_MENTION.search(line) for line in decided):
        lines.append("- 곡선: 모션 기본값의 곡선을 쓴다. 위 줄의 곡선 표기는 비교하지 않은 시편 기본값이다")
    lines += scoped
    mentioned = [v for v in verdicts if v["status"] != "ignored" and component["id"] in v.get("components", [])]
    for verdict in mentioned[-2:]:
        quote = re.sub(r"\s+", " ", verdict["text"])[:80]
        lines.append(f"- 이 컴포넌트에 나온 판정 {verdict['ts'][:10]}: \"{quote}\"")
    if component.get("file"):
        path = os.path.join(lab.LABS_DIR, component["file"]).replace(lab.HOME, "~")
        params = json.dumps(lab.current_params(component, prefs), ensure_ascii=False)
        where = " (로컬에 labs가 있을 때)" if portable else ""
        lines.append(
            f"- 참고 구현{where}: `{path}`를 params {params}로 읽는다. 모양과 모션 값만 옮기고 동작은 프로젝트의 프리미티브를 따른다"
        )
    if lab.next_comparison(component, prefs):
        lines.append(f"- 남은 비교가 있다. 결과 끝에 `{lab.LAB_COMMAND} {component['id']}`로 이어서 평가할 수 있다고 한 줄로 알린다")
    return lines


def component_doc(component, judgments, rules, verdicts):
    """저장소 사본의 `.taste/components/<id>.md`. 이동식 적용 문구가 필요할 때 읽으라고 안내한다."""
    return "\n".join(_component_block(component, judgments, rules, verdicts, portable=True)) + "\n"


def build(catalog, judgments, rules_doc, verdicts, symptoms_doc, request="", component_ids=(), portable=False):
    """적용 문구와 기록할 내용(규칙 id, 컴포넌트 id, 전역 시편 id)을 돌려준다.

    portable은 `taste.py apply`가 저장소에 남기는 사본(`.taste/AGENT.md`)이다. 원장이 없는 클라우드 세션에서도 읽히도록
    다른 컴포넌트는 `.taste/components/`에서, lint는 로컬에 원장이 있을 때만 쓰게 안내한다."""
    rules = rules_doc["rules"]
    known = {c["id"]: c for c in catalog["components"] if not lab.is_global(c)}
    requested = list(dict.fromkeys(
        [c for c in component_ids if c in known]
        + (lab.component_matcher(catalog)(inject.without_names(request)) if request else [])
    ))
    global_ids = {c["id"] for c in catalog["components"] if lab.is_global(c)}
    exceptions = [r for r in rules if r.get("overrides") in global_ids and r.get("component") and r["status"] == "확정"]

    lines = [
        "## 디자인 취향 (/tastepin)",
        "사용자가 실제 화면을 보고 내린 판정과 labs 시편 비교로 고른 값이다. 이번 화면 작업의 기본값으로 쓴다. "
        "요청, 채택 시안, 프로젝트의 기존 디자인 시스템과 충돌하면 그쪽을 따르고 결과 보고에 한 줄로 알린다. "
        "숫자가 겹치면 컴포넌트 값, 화면 전체 값, 모션 기본값, 규칙 순서로 앞선다.",
    ]
    visual = _global_lines(catalog, judgments, "visual", exceptions)
    if visual:
        lines += ["", "### 화면 전체 값"] + visual
    motion = _global_lines(catalog, judgments, "motion", exceptions)
    if motion:
        lines += ["", "### 모션 기본값"] + motion
    for component_id in requested:
        lines += [""] + _component_block(known[component_id], judgments, rules, verdicts, portable)

    confirmed = [r for r in rules if r["status"] == "확정" and not r.get("component")]
    confirmed.sort(key=lambda r: -len(store.rule_evidence(r, verdicts)))
    lines += ["", "### 규칙"]
    lines += [f"- {r['title']}: 피할 것 {r['avoid']} / 할 것 {r['do']}" for r in confirmed]
    for symptom, _ in store.liked_patterns(symptoms_doc, verdicts):
        lines.append(f"- 좋아한 패턴 {symptom['label']}: 맞는 자리가 있으면 쓴다. {symptom['fix']}")

    others = [c for c in known.values() if c["id"] not in requested]
    if others:
        names = ", ".join(f"{c['label']}({c['id']})" for c in others)
        how = (
            "`.taste/components/<id>.md`를 읽는다" if portable
            else f"`{store.CLI} apply-context --no-log --components <id>`로 고른 값을 더 받는다"
        )
        lines += ["", "### 다른 컴포넌트", f"작업에 다음 컴포넌트가 나오면 {how}: {names}"]
    if portable:
        lines += [
            "",
            "### 토큰",
            "`.taste/taste.css`(CSS 변수), `.taste/taste.tailwind.css`(Tailwind v4 `@theme`), `.taste/taste.motion.ts`(Motion 프리셋)에 "
            "위 값이 들어 있다. 프로젝트가 쓰는 쪽을 import해 숫자를 다시 적지 않는다.",
            "",
            "### 끝나면",
            f"로컬에 취향 원장(`{store.shell_path(store.ENTRY)}`)이 있으면: {store.LINT_GUIDE} "
            "없으면(클라우드 세션 등) 위 값과 규칙을 화면에서 직접 확인하고 확인한 범위를 보고한다.",
        ]
    else:
        lines += ["", "### 끝나면", store.LINT_GUIDE]
    used_rules = [r["id"] for r in confirmed] + [r["id"] for r in exceptions] + [
        r["id"] for r in rules if r.get("component") in requested and r["status"] == "확정"
    ]
    specimens = [c["id"] for c in catalog["components"] if lab.is_global(c)]
    return "\n".join(lines) + "\n", {"rules": used_rules, "components": requested, "specimens": specimens}
