"""취향 적용 전후의 대화 기록을 같은 기준으로 다시 세어 지적 빈도를 비교한다.

수집 방식이 바뀌면 원장 건수만으로 비교할 수 없다. CLI의 --since로 사용 시작일을
지정하고 두 구간의 원문을 같은 판별기로 읽는다. 표본이 모자라면 판단을 보류한다.
"""

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
from dataclasses import dataclass, field

from . import harvest, inject, lab, store

try:
    from compression import zstd  # Python 3.14 표준 라이브러리
except ImportError:
    zstd = None

# CLI가 사용자가 지정한 시작일을 넣는다. 다른 사용자의 도입일을 기본값으로 쓰지 않는다.
INTRODUCED = None
INTERVENTIONS = ()
CONSUMPTION_VIAS = ("hook", "skill")
BASELINE_WEEKS = 12
WINDOW_DAYS = 28
MIN_SESSIONS = 20
BASELINE_PATH = os.path.join(store.STATE_DIR, "effect-baseline.json")


@dataclass
class ScreenSession:
    source: str
    session: str
    started: dt.datetime  # 세션의 첫 화면 작업 요청 시각
    complaints: list = field(default_factory=list)

    @property
    def day(self):
        return self.started.astimezone().date()


def _catalog_aliases():
    """화면 작업 판별에 쓰는 카탈로그 별칭. 재생과 같이 카탈로그를 읽지 못하면 별칭이 없는 것으로 본다."""
    try:
        components = lab.load_catalog()["components"]
    except (OSError, ValueError):
        return []
    return sorted([c["id"], c.get("aliases", [])] for c in components if c.get("aliases"))


def classifier_version():
    """화면 작업 판별과 판정 수집 기준의 해시. 고정한 기준선과 지금 기준이 같은지 확인한다.

    판별과 수집 코드 세 파일에 더해, 컴포넌트 언급도 화면 작업으로 세므로 카탈로그 별칭을 넣는다.
    시편 설명과 값은 판별에 쓰지 않으므로 넣지 않는다."""
    digest = hashlib.sha1()
    for module in (inject, harvest):
        with open(module.__file__, "rb") as handle:
            digest.update(handle.read())
    digest.update(Path(__file__).read_bytes())
    digest.update(json.dumps(_catalog_aliases(), ensure_ascii=False).encode("utf-8"))
    return digest.hexdigest()[:10]


def _is_tool_session(source, record):
    """사람이 아니라 도구가 연 세션. 훅도 사람의 요청에만 주입하므로 분모에서 뺀다."""
    if source == "claude":
        return str(record.get("entrypoint", "")).startswith("sdk")
    if record.get("type") != "session_meta":
        return False
    payload = record.get("payload") or {}
    return payload.get("source") == "exec" or payload.get("thread_source") not in (None, "user")


def replay_files():
    """수집기와 같은 기록 파일. Codex가 끝난 세션을 압축해 둔 .jsonl.zst도 들어 있다."""
    return harvest.session_files()


def _open_lines(path):
    return zstd.open(path, "rb") if path.endswith(".zst") else open(path, "rb")


def _first_screen_work(path, source, match_components):
    """기록 파일에서 훅이 화면 작업으로 봤을 첫 사람 요청의 (시각, 세션 id). 없거나 도구 세션이면 None."""
    state = {}
    with _open_lines(path) as lines:
        for line in lines:
            try:
                record = json.loads(line)
            except ValueError:
                continue
            if _is_tool_session(source, record):
                return None
            if source == "claude":
                event = harvest.claude_event(record)
            else:
                event = harvest.codex_event(record, state)
                if state.get("is_subagent"):
                    return None
            if not event or event[0] != "user":
                continue
            _, text, ts_raw, cwd = event
            text = text.replace("\ufffd", "").strip()
            if inject.skips_prompt(text, cwd):
                continue
            stripped = inject.without_names(text)
            if not inject.is_screen_work(stripped, match_components(stripped)):
                continue
            ts = harvest.parse_ts(ts_raw)
            if ts is None or ts.tzinfo is None:
                continue
            session = state.get("session_id") or harvest.file_session(path)
            return ts, session
    return None


def replay(since, until):
    """since부터 until까지(현지 날짜) 시작한 화면 작업 세션과, 첫 화면 작업 요청 뒤에 나온 지적을 다시 계산한다.

    지적은 수집기 기준(harvest)으로만 센다. 사용자가 원장에서 무시로 분류한 발화는 뺀다. 칭찬은 지적이 아니다.
    원장 파일과 수집 cursor는 읽기만 한다.
    """
    match_components = lab.safe_component_matcher()
    match_symptoms = store.symptom_matcher(store.load_symptoms())
    ignored = [v for v in store.load_verdicts() if v["status"] == "ignored"]
    ignored_ids = {v["id"] for v in ignored}
    ignored_keys = {store.utterance_key(v) for v in ignored}
    since_utc = dt.datetime.combine(since, dt.time()).astimezone(dt.timezone.utc)
    sessions = []
    for path, source in replay_files():
        try:
            if os.stat(path).st_mtime < since_utc.timestamp():
                continue
            found = _first_screen_work(path, source, match_components)
        except (*harvest.READ_ERRORS, ValueError):
            # 지금 쓰는 중이거나 압축이 덜 된 파일은 건너뛴다
            continue
        if found is None:
            continue
        started, session_id = found
        screen = ScreenSession(source=source, session=session_id, started=started)
        if not since <= screen.day <= until:
            continue
        file_state = {"offset": 0, "design_score": 0, "last_assistant": ""}
        try:
            with _open_lines(path) as lines:
                verdicts = harvest.scan_lines(lines, harvest.file_session(path), source, file_state, started, match_symptoms)
        except (*harvest.READ_ERRORS, ValueError):
            continue
        for verdict in verdicts:
            if verdict["polarity"] == "positive":
                continue
            if verdict["id"] in ignored_ids or store.utterance_key(verdict) in ignored_keys:
                continue
            screen.complaints.append(verdict)
        sessions.append(screen)
    return sessions


def summarize(sessions, start, end):
    count = len(sessions)
    complaints = sum(len(s.complaints) for s in sessions)
    with_complaint = sum(1 for s in sessions if s.complaints)
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "sessions": count,
        "complaints": complaints,
        "per_session": round(complaints / count, 3) if count else None,
        "share_with_complaint": round(with_complaint / count, 3) if count else None,
    }


def baseline_period():
    return INTRODUCED - dt.timedelta(weeks=BASELINE_WEEKS), INTRODUCED - dt.timedelta(days=1)


def current_period(today):
    return max(INTRODUCED, today - dt.timedelta(days=WINDOW_DAYS - 1)), today


def load_baseline():
    if not os.path.exists(BASELINE_PATH):
        return None
    with open(BASELINE_PATH, encoding="utf-8") as handle:
        return json.load(handle)


def freeze_baseline(now=None):
    """도입 전 구간을 계산해 고정한다. 이미 있으면 덮어쓰지 않고 그대로 돌려준다."""
    existing = load_baseline()
    if existing is not None:
        return existing, False
    start, end = baseline_period()
    sessions = replay(start, end)
    payload = {
        "computed_at": (now or dt.datetime.now(dt.timezone.utc)).isoformat(timespec="seconds"),
        "classifier": classifier_version(),
        "earliest_session": min((s.day for s in sessions), default=start).isoformat(),
        "summary": summarize(sessions, start, end),
    }
    os.makedirs(os.path.dirname(BASELINE_PATH), exist_ok=True)
    with open(BASELINE_PATH, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    return payload, True


def save_baseline_version(reason):
    """최초 기준선은 그대로 두고 현재 정의로 재생한 기준선을 별도 보존한다."""
    if not reason.strip() or zstd is None:
        raise ValueError("비교 이유와 compression.zstd를 지원하는 Python이 필요하다")
    version = classifier_version()
    path = Path(BASELINE_PATH).parent / "effect-baselines" / f"{version}.json"
    if path.exists():
        return path, json.loads(path.read_text(encoding="utf-8")), False
    start, end = baseline_period()
    payload = {
        "computed_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "classifier": version,
        "reason": reason.strip(),
        "scope": "이 머신의 Claude Code와 Codex 사람 화면 작업, 현재 판별기로 두 구간 재생",
        "summary": summarize(replay(start, end), start, end),
        "previous": load_baseline(),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    except FileExistsError:
        return path, json.loads(path.read_text(encoding="utf-8")), False
    return path, payload, True


def intervention_segments(start, end):
    """구간 안에서 소비 방식이 같은 날들의 조각. 방식이 바뀐 날이 없으면 한 조각이다."""
    starts = [(day, label) for day, label in INTERVENTIONS if day <= end]
    segments = []
    for index, (day, label) in enumerate(starts):
        seg_end = starts[index + 1][0] - dt.timedelta(days=1) if index + 1 < len(starts) else end
        seg_start = max(day, start)
        if seg_start <= seg_end:
            segments.append((seg_start, seg_end, label))
    return segments


def repeated_after_delivery(verdicts, deliveries, rules, start, end):
    """같은 세션에서 취향을 전달한 뒤에 그 규칙의 증상이 다시 지적된 판정. 대시보드 흐름 탭과 같은 기준이다."""
    rules_by_id = {r["id"]: r for r in rules}
    hook = [d for d in deliveries if d["via"] in CONSUMPTION_VIAS and d["session"]]
    found = []
    for verdict in verdicts:
        if verdict["status"] == "ignored" or verdict["polarity"] == "positive":
            continue
        day = dt.datetime.fromisoformat(verdict["ts"]).astimezone().date()
        if not start <= day <= end:
            continue
        delivery = next((d for d in hook if d["session"] == verdict["session"] and d["ts"] < verdict["ts"]), None)
        if delivery is None:
            continue
        matched = [
            rules_by_id[rule_id]["title"] for rule_id in delivery["rules"]
            if rule_id in rules_by_id and set(rules_by_id[rule_id].get("symptoms", [])) & set(verdict["symptoms"])
        ]
        if matched:
            found.append({"verdict": verdict, "rules": matched})
    return found


def _rate(summary):
    if not summary["sessions"]:
        return "화면 작업 세션 없음"
    return (
        f"화면 작업 세션 {summary['sessions']}개, 지적 {summary['complaints']}건, "
        f"세션당 {summary['per_session']:.2f}건, 지적이 나온 세션 {summary['share_with_complaint']:.0%}"
    )


def report(today):
    """판정에 쓸 재료를 사람이 읽는 줄로 돌려준다."""
    lines = [f"taste 효과 측정 (기준일 {today.isoformat()})"]
    baseline = load_baseline()
    version = classifier_version()
    if baseline is None:
        start, end = baseline_period()
        live = summarize(replay(start, end), start, end)
        lines.append(f"기준선 {start} ~ {end} (고정 전, 지금 계산): {_rate(live)}")
        lines.append("  `taste.py effect --freeze`로 기준선을 고정한다. 대화 기록은 오래되면 지워질 수 있다.")
    else:
        summary = baseline["summary"]
        lines.append(f"기준선 {summary['start']} ~ {summary['end']} (고정 {baseline['computed_at'][:10]}): {_rate(summary)}")
        if baseline["classifier"] != version:
            start, end = baseline_period()
            live = summarize(replay(start, end), start, end)
            lines.append(f"  판정 기준이 고정 뒤 바뀌었다. 지금 기준으로 다시 센 기준선: {_rate(live)}")
            lines.append("  전후 비교에는 위 재계산값을 쓴다. 최초 고정값은 당시 관찰로 보존한다.")

    start, end = current_period(today)
    current = summarize(replay(start, end), start, end)
    lines.append(f"이번 구간 {start} ~ {end}: {_rate(current)}")
    segments = intervention_segments(start, end)
    if len(segments) > 1:
        for seg_start, seg_end, label in segments:
            part = summarize(replay(seg_start, seg_end), seg_start, seg_end)
            lines.append(f"  {label} {seg_start} ~ {seg_end}: {_rate(part)}")

    deliveries = store.load_deliveries()
    repeated = repeated_after_delivery(
        store.load_verdicts(), deliveries, store.load_rules()["rules"], start, end,
    )
    delivered_sessions = {
        d["session"] for d in deliveries
        if d["via"] in CONSUMPTION_VIAS and d["session"]
        and start <= dt.datetime.fromisoformat(d["ts"]).astimezone().date() <= end
    }
    lines.append(f"전달한 규칙과 같은 증상의 재지적: {len(repeated)}건 (취향 전달 세션 {len(delivered_sessions)}개)")
    for item in repeated:
        text = " ".join(item["verdict"]["text"].split())[:50]
        lines.append(f"  {item['verdict']['ts'][:10]} {', '.join(item['rules'])}: {text}")

    applied_sessions = {
        d["session"] for d in deliveries
        if d["via"] == "skill" and d["session"]
        and start <= dt.datetime.fromisoformat(d["ts"]).astimezone().date() <= end
    }
    lints = [
        r for r in store.load_lint_log()
        if start <= dt.datetime.fromisoformat(r["ts"]).astimezone().date() <= end
    ]
    if applied_sessions or lints:
        linted = {r["session"] for r in lints if r["session"]} & applied_sessions
        failed = sum(1 for r in lints if r["fail"])
        lines.append(
            f"/taste 적용 세션 {len(applied_sessions)}개 중 lint를 돌린 세션 {len(linted)}개, "
            f"lint {len(lints)}회 중 실패가 있던 회 {failed}회"
        )
    if current["sessions"] < MIN_SESSIONS:
        lines.append(f"판정: 보류. 화면 작업 세션 {current['sessions']}개로 최소 {MIN_SESSIONS}개에 못 미친다.")
    else:
        lines.append("판정: 유지, 고치기, 줄이기 중 하나를 사람이 정한다. 관리 시간은 `loop.py effect`가 보여 준다.")
    if zstd is None:
        lines.append("주의: 이 Python에는 compression.zstd가 없어 압축된 Codex 기록을 빼고 셌다. Python 3.14 이상으로 실행한다.")
    lines.append(
        "한계: 이 머신의 Claude Code와 Codex 기록만 다시 센다(Copilot과 다른 머신 제외). 지적은 정규식 수집 기준이라 "
        "메타 발화가 섞이고, 작업 종류와 일정의 변화는 배제하지 못한다."
    )
    return "\n".join(lines)
