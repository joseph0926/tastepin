"""원장 파일 입출력과 규칙 근거 계산, 붙여넣기용 취향 블록 생성.

판정(verdict)은 state/verdicts.jsonl, 취향 규칙은 data/rules.json, 증상 카탈로그는
data/symptoms.json이 소유한다. 규칙의 근거는 저장하지 않고 판정의 증상 태그에서 매번 계산한다.
"""

import datetime as dt
import hashlib
import json
import os
import re
import shlex
import tempfile
from contextlib import contextmanager

try:
    import fcntl
except ImportError:  # Windows에는 없다. 이 원장은 mac에서만 쓰므로 잠금 없이 둔다
    fcntl = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 개인 기록(판정, 선택, 규칙, 생성 문서)을 둘 폴더. TASTEPIN_DATA로 설치 밖 폴더를 고를 수 있고, 그 안의 구조는
# 설치 폴더와 같다(state/, data/rules.json, TASTE.md). 증상 카탈로그는 코드와 함께 배포하므로 설치 폴더에 남는다.
DATA_ROOT = os.path.abspath(os.path.expanduser(os.environ.get("TASTEPIN_DATA") or ROOT))
DATA_DIR = os.path.join(ROOT, "data")
STATE_DIR = os.path.join(DATA_ROOT, "state")
SYMPTOMS_PATH = os.path.join(DATA_DIR, "symptoms.json")
RULES_PATH = os.path.join(DATA_ROOT, "data", "rules.json")
VERDICTS_PATH = os.path.join(STATE_DIR, "verdicts.jsonl")
CURSOR_PATH = os.path.join(STATE_DIR, "cursor.json")
EXPORT_PATH = os.path.join(DATA_ROOT, "TASTE.md")
DELIVERIES_PATH = os.path.join(STATE_DIR, "deliveries.jsonl")
LINT_LOG_PATH = os.path.join(STATE_DIR, "lint.jsonl")


def shell_path(path):
    """안내 명령에 넣을 경로. 홈 아래는 ~로 줄이고, 공백 같은 셸 문자가 있으면 인용한다(~ 뒤는 인용해도 펼쳐진다)."""
    home = os.path.expanduser("~")
    if path.startswith(home + os.sep):
        return "~/" + shlex.quote(os.path.relpath(path, home))
    return shlex.quote(path)


# 안내 문구에 넣는 실행 명령. 에이전트가 안내대로 새로 실행한 명령도 같은 기록 폴더를 써야 한다.
# 기록 폴더를 정해 주는 실행 파일은 TASTEPIN_ENTRY로 자기 경로를 알리고, 그런 파일 없이 TASTEPIN_DATA만
# 받았으면 명령 앞에 그 값을 붙인다.
ENTRY = os.path.abspath(os.path.expanduser(os.environ.get("TASTEPIN_ENTRY") or os.path.join(ROOT, "taste.py")))
DATA_PREFIX = (
    f"TASTEPIN_DATA={shell_path(DATA_ROOT)} " if DATA_ROOT != ROOT and not os.environ.get("TASTEPIN_ENTRY") else ""
)
CLI = DATA_PREFIX + "python3 -B " + shell_path(ENTRY)
LINT_COMMAND = CLI + " lint <url>"
# probe.js와 lint.py가 값으로 재는 증상. tests/test_lint.py가 두 파일과 어긋나지 않는지 확인한다
LINT_SYMPTOMS = frozenset({
    "color-dated", "color-too-many", "contrast-low", "border-heavy", "box-heavy", "radius-heavy",
    "shadow-heavy", "neon-glow", "gradient-glass", "sticky-blur", "type-default-font",
    "type-hierarchy-weak", "type-ko-readability", "motion-slow", "motion-too-much", "motion-first-missing",
})

VERDICT_STATUSES = ("new", "kept", "ignored")
POLARITIES = ("negative", "mixed", "positive")


def _write_atomic(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)
    os.replace(tmp, path)


@contextmanager
def ledger_lock():
    """원장을 읽고 고쳐 통째로 다시 쓰는 동안 다른 프로세스(여러 세션의 훅, CLI, 대시보드 서버)를 막는다.
    flock은 연 파일마다 따로 걸리므로 같은 프로세스의 스레드끼리도 막힌다."""
    if fcntl is None:
        yield
        return
    # 테스트가 STATE_DIR만 바꿔도 임시 폴더에 잠그도록 부를 때 경로를 만든다
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(os.path.join(STATE_DIR, ".lock"), "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def _split_jsonl(path):
    """(읽은 행, 읽지 못한 원문 줄). 손으로 고치다 깨진 줄이나 merge 충돌 표식 한 줄 때문에
    원장 전체를 못 읽으면 훅이 조용히 기록을 멈추므로, 그 줄만 빼고 읽는다."""
    if not os.path.exists(path):
        return [], []
    rows, broken = [], []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except ValueError:
                broken.append(line if line.endswith("\n") else line + "\n")
                continue
            if isinstance(row, dict):
                rows.append(row)
            else:
                broken.append(line if line.endswith("\n") else line + "\n")
    return rows, broken


def read_jsonl(path):
    return _split_jsonl(path)[0]


def broken_line_count(path):
    return len(_split_jsonl(path)[1])


def broken_path(path):
    return path + ".broken"


def write_jsonl(path, rows):
    """통째로 다시 쓴다. 지금 파일에서 읽지 못한 줄은 지우지 않고 <파일>.broken에 옮겨 둔다."""
    _, broken = _split_jsonl(path)
    if broken:
        with open(broken_path(path), "a", encoding="utf-8") as handle:
            handle.writelines(broken)
    _write_atomic(path, "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))


def location_problems():
    """환경변수로 받은 기록 폴더와 실행 경로가 실제로 있는지 본다. 오타 난 경로에 빈 원장을 새로 만들거나
    없는 실행 파일을 안내하지 않게 명령 실행 전에 멈춘다."""
    problems = []
    if os.environ.get("TASTEPIN_DATA") and not os.path.isdir(DATA_ROOT):
        problems.append(f"TASTEPIN_DATA 폴더가 없습니다: {DATA_ROOT}")
    if os.environ.get("TASTEPIN_ENTRY") and not os.path.isfile(ENTRY):
        problems.append(f"TASTEPIN_ENTRY 실행 파일이 없습니다: {ENTRY}")
    return problems


def _read_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def load_symptoms():
    return _read_json(SYMPTOMS_PATH, {"axes": [], "symptoms": []})


def load_rules():
    return _read_json(RULES_PATH, {"rules": []})


def unknown_symptoms(rules_doc, symptoms_doc):
    """규칙이 참조하지만 증상 카탈로그에 없는 증상. 없는 증상은 판정에 붙지 않아 규칙의 근거가 늘지 않는다."""
    known = {symptom["id"] for symptom in symptoms_doc["symptoms"]}
    unknown = {}
    for rule in rules_doc["rules"]:
        missing = [symptom for symptom in rule.get("symptoms", []) if symptom not in known]
        if missing:
            unknown[rule["id"]] = missing
    return unknown


def save_rules(rules_doc):
    _write_atomic(RULES_PATH, json.dumps(rules_doc, ensure_ascii=False, indent=2) + "\n")


def load_cursor():
    return _read_json(CURSOR_PATH, {"files": {}})


def save_cursor(cursor):
    _write_atomic(CURSOR_PATH, json.dumps(cursor, ensure_ascii=False))


def load_verdicts():
    return read_jsonl(VERDICTS_PATH)


def save_verdicts(verdicts):
    """호출하는 쪽이 읽기부터 이 저장까지 ledger_lock()을 잡고 있어야 다른 프로세스의 기록을 덮어쓰지 않는다."""
    write_jsonl(VERDICTS_PATH, sorted(verdicts, key=lambda v: v.get("ts", "")))


def utterance_key(verdict):
    return (verdict["session"], re.sub(r"\s+", " ", verdict["text"]).strip()[:200])


def merge_verdicts(existing, incoming):
    """이미 있는 판정은 사용자가 정한 상태와 태그를 지키기 위해 덮어쓰지 않는다.

    훅이 프롬프트 시점에 먼저 기록한 판정을 수집기가 다시 찾으면 공백 차이로 id가 달라질 수 있어,
    같은 세션의 같은 발화도 이미 있는 것으로 본다.
    """
    known_ids = {v["id"] for v in existing}
    known_keys = {utterance_key(v) for v in existing}
    added = []
    for verdict in incoming:
        key = utterance_key(verdict)
        if verdict["id"] in known_ids or key in known_keys:
            continue
        known_ids.add(verdict["id"])
        known_keys.add(key)
        added.append(verdict)
    return existing + added, len(added)


def append_verdict(verdict):
    """훅처럼 원장 전체를 다시 쓰기엔 가벼워야 하는 호출용. 중복이면 False."""
    with ledger_lock():
        merged, added = merge_verdicts(load_verdicts(), [verdict])
        if added:
            save_verdicts(merged)
    return bool(added)


def load_deliveries():
    return read_jsonl(DELIVERIES_PATH)


def rules_version():
    """규칙 파일 내용의 짧은 해시. 저장소 커밋은 하루 단위라 규칙 문장이 바뀐 시점을 가르지 못한다. 파일이 없으면 빈 값."""
    try:
        with open(RULES_PATH, "rb") as handle:
            return hashlib.sha1(handle.read()).hexdigest()[:10]
    except OSError:
        return ""


def log_delivery(via, session="", project="", rule_ids=(), components=(), specimens=(), surface=""):
    """취향이 어디로 전달됐는지 남긴다. 흐름 탭이 전달 뒤에도 나온 지적을 찾는 근거다.

    components는 훅이 요청에서 알아본 시편 컴포넌트다. 최근 실제 작업 수요로 시편 평가 순서를 정하는 데 쓴다.
    specimens는 전역 취향과 함께 넣은 전역 시편이다. 화면 작업마다 들어가므로 수요와 휴면 계산에는 세지 않는다.
    rules_hash는 전달 당시 규칙 파일의 버전, surface는 훅이 받은 실행면(claude, codex, copilot)이다.
    효과를 판정할 때 규칙을 고친 전후와 실행면별 전달을 나눠 보는 데 쓴다.
    """
    os.makedirs(STATE_DIR, exist_ok=True)
    record = {
        "ts": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "via": via,
        "session": session,
        "project": project,
        "rules": list(rule_ids),
        "rules_hash": rules_version(),
    }
    if surface:
        record["surface"] = surface
    if components:
        record["components"] = list(components)
    if specimens:
        record["specimens"] = list(specimens)
    with open(DELIVERIES_PATH, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def log_lint(record):
    """lint 한 번의 결과. 취향을 받은 세션이 화면을 실제로 점검했는지(적용률)와 자주 걸리는 증상을 본다."""
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(LINT_LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def load_lint_log():
    return read_jsonl(LINT_LOG_PATH)


def symptom_matcher(symptoms_doc):
    compiled = [
        (symptom["id"], re.compile("|".join(symptom["aliases"]), re.I))
        for symptom in symptoms_doc["symptoms"]
        if symptom.get("aliases")
    ]

    def match(text):
        return [symptom_id for symptom_id, pattern in compiled if pattern.search(text)]

    return match


def rule_evidence(rule, verdicts):
    """규칙의 증상과 겹치는 판정 중 무시하지 않은 것. 긍정 판정은 근거로 세지 않는다."""
    wanted = set(rule.get("symptoms", []))
    return [
        v for v in verdicts
        if v["status"] != "ignored" and v["polarity"] != "positive" and wanted.intersection(v["symptoms"])
    ]


CODE_REVIEW_GUIDE = (
    "변경한 코드와 관련 스타일, 공통 컴포넌트를 위 선택 값과 규칙에 대조한다. "
    "서체, 색상, 모서리, 모션 설정과 문구, 컨트롤 구성을 확인하고 위반이 있으면 위치와 근거를 짚어 고친다. "
    "관련된 기존 정적 검사나 테스트가 있으면 화면을 띄우지 않는 범위에서 실행한다. "
    "취향 검증을 위해 개발 서버, 브라우저, 스크린숏이나 화면 lint를 실행하지 않는다. "
    "실제 넘침, 서체 로딩, 깜빡임과 움직임의 체감처럼 코드만으로 확인할 수 없는 항목은 미검증으로 보고한다. "
    "화면 검사는 사용자가 별도로 명시한 경우에만 수행한다."
)


def is_liked(symptom):
    """kind가 like인 증상은 피할 것이 아니라 사용자가 칭찬한 패턴이다. 지적 수와 규칙 근거에는 세지 않는다."""
    return symptom.get("kind") == "like"


def liked_patterns(symptoms_doc, verdicts, axes=None):
    """무시하지 않은 칭찬(또는 칭찬과 지적이 섞인) 판정이 붙은 좋아한 패턴과 그 횟수. 많이 칭찬한 순서."""
    patterns = []
    for symptom in symptoms_doc["symptoms"]:
        if not is_liked(symptom) or (axes is not None and symptom["axis"] not in axes):
            continue
        praised = sum(
            1 for v in verdicts
            if v["status"] != "ignored" and v["polarity"] != "negative" and symptom["id"] in v["symptoms"]
        )
        if praised:
            patterns.append((symptom, praised))
    return sorted(patterns, key=lambda pair: -pair[1])


def _liked_lines(patterns):
    return [f"- {symptom['label']} (칭찬 {count}회): {symptom['fix']}" for symptom, count in patterns]


def _today():
    return dt.date.today().isoformat()


def _rule_lines(rules, verdicts):
    lines = []
    for rule in rules:
        hits = len(rule_evidence(rule, verdicts))
        weight = f" (지적 {hits}회)" if hits else ""
        lines.append(f"- {rule['title']}{weight}")
        lines.append(f"  - 피할 것: {rule['avoid']}")
        lines.append(f"  - 할 것: {rule['do']}")
    return lines


def _symptom_fix_lines(verdicts, symptoms_doc, limit=8):
    counts = {}
    for verdict in verdicts:
        if verdict["status"] == "ignored" or verdict["polarity"] == "positive":
            continue
        for symptom_id in verdict["symptoms"]:
            counts[symptom_id] = counts.get(symptom_id, 0) + 1
    by_id = {s["id"]: s for s in symptoms_doc["symptoms"] if not is_liked(s)}
    ranked = sorted((sid for sid in counts if sid in by_id), key=lambda sid: -counts[sid])[:limit]
    lines = []
    for symptom_id in ranked:
        symptom = by_id[symptom_id]
        lines.append(f"- {symptom['label']} ({symptom['term']}, 지적 {counts[symptom_id]}회)")
        lines.append(f"  - 수정: {symptom['fix']}")
        lines.append(f"  - 확인: {symptom['check']}")
    return lines


def _scoped_rule_lines(rules_doc):
    """component가 있는 규칙. 전역 규칙 목록 대신 컴포넌트 절에 넣는다."""
    return [
        f"- {r['component']} 규칙 {r['title']}: 피할 것 {r['avoid']} / 할 것 {r['do']}"
        for r in rules_doc["rules"] if r.get("component") and r["status"] == "확정"
    ]


def build_block(rules_doc, verdicts, audience, symptoms_doc, component_lines=()):
    """Claude Design 요청서(audience='design')나 코딩 에이전트(audience='agent')에 붙일 블록.

    에이전트용은 구현 단계에서 바로 쓸 수 있게 자주 지적한 증상의 수정법과 확인 방법을 더한다.
    component_lines는 lab.block_lines가 만든 컴포넌트별 선택 값이다.
    """
    rules = [r for r in rules_doc["rules"] if not r.get("component")]
    confirmed = [r for r in rules if r["status"] == "확정"]
    watching = [r for r in rules if r["status"] == "관찰"]

    def by_strength(rule):
        return -len(rule_evidence(rule, verdicts))

    confirmed.sort(key=by_strength)
    watching.sort(key=by_strength)
    header = "## 개인 디자인 취향" if audience == "design" else "## 사용자 디자인 취향 (구현 규칙)"
    intro = (
        "아래는 사용자가 실제 화면을 보고 반복해서 내린 판정에서 정리한 취향이다. "
        "레퍼런스나 요청서의 지시와 충돌하면 요청서를 우선하고 충돌을 짧게 알린다."
    )
    lines = [header, "", intro, "", "### 반드시 지킬 것", ""]
    lines += _rule_lines(confirmed, verdicts)
    if watching:
        lines += ["", "### 참고할 경향", ""]
        lines += _rule_lines(watching, verdicts)
    liked = liked_patterns(symptoms_doc, verdicts)
    if liked:
        lines += ["", "### 좋아한 패턴 (맞는 자리가 있으면 더 쓴다)", ""] + _liked_lines(liked)
    component_lines = list(component_lines) + _scoped_rule_lines(rules_doc)
    if component_lines:
        lines += ["", "### 컴포넌트별로 고른 값 (labs 시편 비교)", ""] + component_lines
    if audience == "agent":
        fixes = _symptom_fix_lines(verdicts, symptoms_doc)
        if fixes:
            lines += ["", "### 자주 지적한 증상과 고치는 법", ""] + fixes
        lines += ["", "### 코드 검토", "", CODE_REVIEW_GUIDE]
    lines += ["", f"_취향 원장 기준일 {_today()}_"]
    return "\n".join(lines) + "\n"


def export_markdown(rules_doc, verdicts, symptoms_doc, component_lines=()):
    """TASTE.md: 규칙과 근거 인용을 함께 담아 사람과 에이전트가 모두 읽는 문서."""
    axis_labels = {axis["id"]: axis["label"] for axis in symptoms_doc["axes"]}
    lines = [
        "# 디자인 취향 원장",
        "",
        f"기준일 {_today()}. `python3 -B taste.py export`가 생성한다. 직접 고치지 말고 대시보드에서 규칙을 수정한다.",
        "",
    ]
    for axis_id, label in axis_labels.items():
        rules = [r for r in rules_doc["rules"] if r["axis"] == axis_id]
        if not rules:
            continue
        lines += [f"## {label}", ""]
        for rule in rules:
            evidence = sorted(rule_evidence(rule, verdicts), key=lambda v: v["ts"], reverse=True)
            lines += [
                f"### {rule['title']}",
                "",
                f"- 상태: {rule['status']}, 지적 {len(evidence)}회",
                f"- 피할 것: {rule['avoid']}",
                f"- 할 것: {rule['do']}",
            ]
            for source in rule.get("sources", []):
                lines.append(f"- 선언 출처: {source}")
            for verdict in evidence[:3]:
                quote = re.sub(r"\s+", " ", verdict["text"])[:140]
                lines.append(f"- 인용 {verdict['ts'][:10]} {verdict['project']}: \"{quote}\"")
            lines.append("")
    liked = liked_patterns(symptoms_doc, verdicts)
    if liked:
        lines += ["## 좋아한 패턴", ""] + _liked_lines(liked) + [""]
    if component_lines:
        lines += ["## 컴포넌트별로 고른 값", "", "labs 시편에서 한 차원만 다른 변형을 비교해 고른 값이다.", ""]
        lines += list(component_lines) + [""]
    _write_atomic(EXPORT_PATH, "\n".join(lines))
    return EXPORT_PATH
