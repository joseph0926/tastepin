"""labs 시편 평가를 컴포넌트 단위 취향으로 바꾼다.

시편은 저장소의 `lab/`가 소유하고, 카탈로그(`src/specimens/catalog.json`)가 컴포넌트마다 비교할 차원과
값을 정한다. `"scope": "global"`인 시편(화면 표면, 글과 밀도, 모션 성격 등)은 컴포넌트가 아니라 화면 전체의 값이라 별칭이 없고,
요청에 컴포넌트가 나오지 않아도 화면 작업마다 전역 취향과 함께 주입된다. 전역 시편의 `axis`(visual, motion)는 요청이
시각과 모션 중 어느 쪽을 건드릴 때 넣을지 정한다. 사용자가 한 차원만 다른 변형을 비교해 고르면 `state/judgments.jsonl`에 쌓이고, 차원별 선호는
저장하지 않고 이 원장에서 매번 계산한다. 다음 비교도 같은 계산에서 나오므로 바퀴마다 새 코드를 만들 필요가 없다.

선호 상태(차원 하나 기준):
- 미평가: 고른 적 없음. 기본값(카탈로그의 첫 값)을 현재 값으로 쓴다
- 관찰: 한 번 이상 골랐지만 마지막 두 선택이 같지 않다
- 확정: 마지막 두 선택이 같다. 다시 묻지 않는다. 고른 값의 구현 설명(spec)이 마지막으로 고를 때와 달라졌으면
  지금 구현을 본 판단이 아니므로 관찰로 돌려 한 번 더 묻는다
- 무관: 고른 적 없이 "차이 없음"이 두 번. 주입할 때 자유롭게 고르라고 알린다
- 새 값 필요: 마지막 평가가 "다 별로". 에이전트가 새 값을 시편에 더할 때까지 묻지 않는다. 거절한 비교에 없던 값이
  둘 이상 더해지면 그 값들만으로 미평가부터 다시 묻는다

화면 조건(테마, 휴대폰 폭):
차원이 처음 확정될 때까지 고른 테마와 폭이 그 차원의 기준 조건이고, 그 뒤로는 넓히지 않는다. 확정 뒤 기준 밖의 조건에서 고른 판정은 기준 선호를
바꾸지 않고 그 조건(예: "mobile", "light+mobile")의 재확인으로 따로 센다. 재확인도 같은 상태 규칙을 따른다. 평가 화면은
연 컴포넌트를 지금 보고 있는 조건에서만 다시 묻고, 주입 문구는 재확인에서 다른 값을 고른 조건을 따로 적는다.
"""

import datetime as dt
import json
import os
import re
import shutil
import subprocess
import time
import urllib.request

from . import store

HOME = os.path.expanduser("~")
LABS_DIR = os.environ.get("TASTE_LABS_DIR", os.path.join(store.ROOT, "lab"))
CATALOG_RELATIVE = os.path.join("src", "specimens", "catalog.json")
JUDGMENTS_PATH = os.path.join(store.STATE_DIR, "judgments.jsonl")
LABS_PORT = 5181
LABS_PID_PATH = os.path.join(store.STATE_DIR, "labs.pid")
LABS_LOG_PATH = os.path.join(store.STATE_DIR, "labs.log")
LAB_COMMAND = store.CLI + " lab"

OUTCOMES = ("chose", "same", "none")
GLOBAL_AXES = ("visual", "motion")
THEMES = ("light", "dark")
FRAMES = ("desktop", "mobile")
CONDITION_LABELS = {"light": "라이트", "dark": "다크", "desktop": "데스크톱", "mobile": "휴대폰 폭"}
STATUS_ORDER = ("미평가", "관찰", "확정", "무관", "새 값 필요")
DEMAND_DAYS = 14
DORMANT_DAYS = 30


def labs_url(component=""):
    query = f"?c={component}" if component else ""
    return f"http://127.0.0.1:{LABS_PORT}/specimens{query}"


def catalog_path():
    return os.path.join(LABS_DIR, CATALOG_RELATIVE)


def load_catalog():
    """labs가 없거나 카탈로그가 없으면 빈 카탈로그. 형식이 틀리면 ValueError로 알린다."""
    path = catalog_path()
    if not os.path.exists(path):
        return {"components": []}
    with open(path, encoding="utf-8") as handle:
        catalog = json.load(handle)
    for component in catalog.get("components", []):
        if not component.get("id") or not component.get("dimensions"):
            raise ValueError(f"시편 카탈로그 항목에 id나 dimensions가 없습니다: {component.get('id')}")
        if component.get("scope") not in (None, "global"):
            raise ValueError(f"{component['id']}: scope는 생략하거나 global이어야 합니다")
        if is_global(component) and component.get("aliases"):
            raise ValueError(f"{component['id']}: 전역 시편은 화면 작업마다 주입되므로 별칭을 두지 않습니다")
        if is_global(component) and component.get("axis") not in GLOBAL_AXES:
            raise ValueError(f"{component['id']}: 전역 시편의 axis는 {', '.join(GLOBAL_AXES)} 중 하나여야 합니다")
        for dimension in component["dimensions"]:
            if len(dimension.get("values", [])) < 2:
                raise ValueError(f"{component['id']}.{dimension.get('id')}: 비교할 값이 두 개 이상 필요합니다")
    return catalog


def is_global(component):
    return component.get("scope") == "global"


def load_judgments():
    return store.read_jsonl(JUDGMENTS_PATH)


def _save_judgments(judgments):
    store.write_jsonl(JUDGMENTS_PATH, judgments)


def _now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def _find(items, item_id):
    return next((item for item in items if item["id"] == item_id), None)


def component_matcher(catalog):
    compiled = [
        (component["id"], re.compile("|".join(component["aliases"]), re.I))
        for component in catalog["components"]
        if component.get("aliases")
    ]

    def match(text):
        return [component_id for component_id, pattern in compiled if pattern.search(text)]

    return match


def safe_component_matcher():
    """판정에 컴포넌트 태그를 붙이는 함수. 카탈로그를 읽지 못해도 판정 기록은 막지 않도록 빈 태그를 돌려준다."""
    try:
        return component_matcher(load_catalog())
    except (OSError, ValueError, re.error):
        return lambda text: []


# 선호 계산

def dimension_preference(dimension, judgments):
    """차원 하나의 판정 목록(시간순)에서 현재 값, 상태, 다음에 비교할 값(offer)을 계산한다."""
    values = [value["id"] for value in dimension["values"]]
    offer, considered = values[:3], judgments
    # "다 별로" 뒤에 카탈로그에 더한 값이 둘 이상이면 그 값들로 처음부터 다시 묻는다. 거절한 비교와 그 전 선택은 세지 않는다
    rejected_at = max((i for i, j in enumerate(judgments) if j["outcome"] == "none"), default=None)
    if rejected_at is not None:
        fresh = [v for v in values if v not in judgments[rejected_at]["options"]]
        if len(fresh) >= 2:
            offer, considered = fresh[:3], judgments[rejected_at + 1:]
    decisive = [j for j in considered if j["outcome"] == "chose"]
    same = sum(1 for j in considered if j["outcome"] == "same")
    value = decisive[-1]["choice"] if decisive else offer[0]
    if considered and considered[-1]["outcome"] == "none":
        status = "새 값 필요"
    elif len(decisive) >= 2 and decisive[-1]["choice"] == decisive[-2]["choice"]:
        status = "확정"
    elif decisive:
        status = "관찰"
    elif same >= 2:
        status = "무관"
    else:
        status = "미평가"
    # 지적을 받고 고른 값의 구현을 고치면 이전 확정은 지금 구현을 본 판단이 아니다. 판정의 specs 스냅숏과 비교한다
    current = _find(dimension["values"], value)
    changed = bool(decisive) and current is not None and (
        decisive[-1].get("specs", {}).get(value, current["spec"]) != current["spec"]
    )
    if status == "확정" and changed:
        status = "관찰"
    chosen = sum(1 for j in decisive if j["choice"] == value)
    return {
        "status": status,
        "changed": changed,
        "value": value,
        "offer": offer,
        "chosen": chosen,
        "judged": len(judgments),
        "last": judgments[-1]["ts"] if judgments else None,
        "notes": [j["note"] for j in judgments if j.get("note")][-3:],
    }


def variant_key(theme, frame, base):
    """기준 조건 밖의 축만 이은 재확인 조건 이름. 기준 안이면 빈 문자열이다."""
    parts = [theme] if theme not in base["theme"] else []
    parts += [frame] if frame not in base["frame"] else []
    return "+".join(parts)


def condition_label(key):
    return ", ".join(CONDITION_LABELS.get(part, part) for part in key.split("+"))


def split_by_condition(dimension, judgments):
    """판정을 기준 판정과 조건별 재확인으로 나누고 기준 조건을 돌려준다.
    처음 확정될 때까지 고른 조건이 기준 조건이고, 그 뒤 기준이 확정인 동안 기준 밖 조건에서 고른 판정만 재확인이 된다.
    기준이 관찰로 돌아가면 평가 화면이 기준 비교를 묻으므로 어느 조건의 판정이든 기준으로 세지만, 기준 조건은 넓히지 않는다."""
    base, variants = [], {}
    seen = {"theme": set(), "frame": set()}
    confirmed_once = False
    for judgment in judgments:
        conditions = judgment.get("conditions") or {}
        theme, frame = conditions.get("theme", "light"), conditions.get("frame", "desktop")
        key = variant_key(theme, frame, seen)
        if key and confirmed_once and dimension_preference(dimension, base)["status"] == "확정":
            variants.setdefault(key, []).append(judgment)
            continue
        base.append(judgment)
        if not confirmed_once:
            seen["theme"].add(theme)
            seen["frame"].add(frame)
            confirmed_once = dimension_preference(dimension, base)["status"] == "확정"
    return base, variants, {axis: sorted(values) for axis, values in seen.items()}


def _dimension_entry(dimension, judgments):
    base, variants, conditions = split_by_condition(dimension, judgments)
    pref = dimension_preference(dimension, base)
    pref["conditions"] = conditions
    pref["variants"] = {key: dimension_preference(dimension, items) for key, items in variants.items()}
    return pref


def component_preferences(component, judgments):
    """차원 id별 선호. requires 조건이 현재 값과 맞지 않는 차원은 '해당 없음'으로 바꾼다."""
    own = [j for j in judgments if j["component"] == component["id"]]
    prefs = {
        dimension["id"]: _dimension_entry(dimension, [j for j in own if j["dimension"] == dimension["id"]])
        for dimension in component["dimensions"]
    }
    current = {dim_id: pref["value"] for dim_id, pref in prefs.items()}
    for dimension in component["dimensions"]:
        if not _requires_met(dimension, current):
            prefs[dimension["id"]]["status"] = "해당 없음"
    return prefs


def _requires_met(dimension, current):
    return all(current.get(dim_id) in allowed for dim_id, allowed in dimension.get("requires", {}).items())


def _variant_for(pref, view):
    """보고 있는 조건에서 이 차원이 쓰는 재확인 선호. 기준 조건 안이거나 재확인이 없으면 None."""
    key = variant_key(view["theme"], view["frame"], pref["conditions"]) if view else ""
    return pref["variants"].get(key) if key else None


def current_params(component, prefs, view=None):
    """지금 값. 보고 있는 조건을 주면 그 조건에서 고른 재확인 값을 앞세운다."""
    params = {}
    for dim_id, pref in prefs.items():
        variant = _variant_for(pref, view)
        decided = variant is not None and variant["status"] in ("확정", "관찰")
        params[dim_id] = variant["value"] if decided else pref["value"]
    return params


def next_comparison(component, prefs):
    """한 차원만 바꾼 다음 비교. 처음 보는 차원을 카탈로그 순서로, 그다음 관찰 중인 차원을 오래된 순서로 묻는다."""
    pending = [d for d in component["dimensions"] if prefs[d["id"]]["status"] in ("미평가", "관찰")]
    if not pending:
        return None
    # "차이 없음" 한 번으로 미평가에 남은 차원은 아직 안 본 차원 뒤로 보내 같은 비교가 바로 반복되지 않게 한다
    unseen = sorted((d for d in pending if prefs[d["id"]]["status"] == "미평가"), key=lambda d: prefs[d["id"]]["judged"])
    dimension = unseen[0] if unseen else min(pending, key=lambda d: prefs[d["id"]]["last"] or "")
    params = current_params(component, prefs)
    return {
        "component": component["id"],
        "dimension": dimension["id"],
        "options": prefs[dimension["id"]]["offer"],
        "params": {dim_id: value for dim_id, value in params.items() if dim_id != dimension["id"]},
    }


def recheck_comparison(component, prefs, view):
    """보고 있는 조건이 기준 조건 밖인 확정 차원을 그 조건에서 다시 묻는다. 처음 묻는 차원을 카탈로그 순서로,
    그다음 재확인 중 관찰인 차원을 오래된 순서로 고른다."""
    if not view:
        return None
    candidates = []
    # 그 조건에서 고른 값 때문에 쓰이지 않는 차원(requires)은 묻지 않는다
    viewed = current_params(component, prefs, view)
    for dimension in component["dimensions"]:
        pref = prefs[dimension["id"]]
        key = variant_key(view["theme"], view["frame"], pref["conditions"])
        if pref["status"] != "확정" or not key or not _requires_met(dimension, viewed):
            continue
        variant = pref["variants"].get(key)
        if variant is None or variant["status"] in ("미평가", "관찰"):
            candidates.append((dimension, key, variant))
    if not candidates:
        return None
    dimension, key, variant = min(
        candidates, key=lambda c: (c[2] is not None and c[2]["status"] == "관찰", (c[2] or {}).get("last") or "")
    )
    pref = prefs[dimension["id"]]
    # 재확인에서 "다 별로"를 받기 전에는 기준과 같은 값들로 묻는다
    rejected = variant is not None and variant["offer"] != [v["id"] for v in dimension["values"]][:3]
    return {
        "component": component["id"],
        "dimension": dimension["id"],
        "options": variant["offer"] if rejected else pref["offer"],
        "params": {dim_id: value for dim_id, value in viewed.items() if dim_id != dimension["id"]},
        "recheck": {"key": key, "label": condition_label(key), "base": pref["value"]},
    }


def _view(raw):
    """평가 화면이 보고 있는 조건. 테마와 폭이 모두 있어야 재확인을 묻는다."""
    if not isinstance(raw, dict) or raw.get("theme") not in THEMES or raw.get("frame") not in FRAMES:
        return None
    return {"theme": raw["theme"], "frame": raw["frame"]}


def _recent(iso, days):
    if not iso:
        return False
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)
    return dt.datetime.fromisoformat(iso) >= cutoff


def component_demand(component_id, deliveries, verdicts, days=DEMAND_DAYS):
    """최근 실제 작업에서 이 컴포넌트가 나온 횟수. 훅의 컴포넌트 주입과 판정 태그를 센다."""
    mentioned = sum(
        1 for d in deliveries if component_id in d.get("components", []) and _recent(d["ts"], days)
    )
    judged = sum(
        1 for v in verdicts
        if v["status"] != "ignored" and component_id in v.get("components", []) and _recent(v["ts"], days)
    )
    return mentioned + judged


def lab_state(requested="", view=None):
    """평가 화면과 대시보드가 쓰는 전체 상태. 다음 비교 목록은 우선순위 순서다.
    view(평가 화면의 테마와 폭)를 주면 요청한 컴포넌트의 기준 비교가 끝난 뒤 그 조건의 재확인을 묻는다."""
    view = _view(view)
    catalog = load_catalog()
    judgments = load_judgments()
    deliveries = store.load_deliveries()
    verdicts = store.load_verdicts()
    components = []
    for order, component in enumerate(catalog["components"]):
        prefs = component_preferences(component, judgments)
        upcoming = next_comparison(component, prefs)
        if upcoming is None and component["id"] == requested:
            upcoming = recheck_comparison(component, prefs, view)
        components.append({
            "id": component["id"],
            "label": component["label"],
            "scope": component.get("scope", ""),
            "file": component.get("file", ""),
            "order": order,
            "demand": component_demand(component["id"], deliveries, verdicts),
            "judged": sum(1 for j in judgments if j["component"] == component["id"]),
            "preferences": prefs,
            "params": current_params(component, prefs, view),
            "next": upcoming,
            "verdicts": [
                {"ts": v["ts"], "text": v["text"], "polarity": v["polarity"]}
                for v in verdicts if v["status"] != "ignored" and component["id"] in v.get("components", [])
            ][-5:],
        })
    # 요청한 컴포넌트, 최근 실제 작업에서 많이 나온 컴포넌트, 덜 평가한 컴포넌트 순서
    ranked = sorted(
        (c for c in components if c["next"]),
        key=lambda c: (c["id"] != requested, -c["demand"], c["judged"], c["order"]),
    )
    return {
        "catalog": catalog,
        "components": components,
        "queue": [c["next"] for c in ranked],
        "judgments": judgments[-50:],
        "labs_url": labs_url(),
    }


# 평가 기록

def _clean_conditions(raw):
    raw = raw if isinstance(raw, dict) else {}
    return {
        "theme": "dark" if raw.get("theme") == "dark" else "light",
        "frame": "mobile" if raw.get("frame") == "mobile" else "desktop",
        "slow": bool(raw.get("slow")),
    }


def record_judgment(body):
    """평가 화면에서 보낸 판정 하나를 카탈로그와 대조해 검증한 뒤 기록한다."""
    catalog = load_catalog()
    component = _find(catalog["components"], body.get("component"))
    if component is None:
        raise ValueError("카탈로그에 없는 컴포넌트입니다")
    dimension = _find(component["dimensions"], body.get("dimension"))
    if dimension is None:
        raise ValueError("카탈로그에 없는 차원입니다")
    values = {value["id"]: value for value in dimension["values"]}
    options = [str(option) for option in body.get("options", [])]
    if len(options) < 2 or any(option not in values for option in options):
        raise ValueError("비교한 값이 카탈로그와 맞지 않습니다")
    outcome = body.get("outcome")
    if outcome not in OUTCOMES:
        raise ValueError("판정은 chose, same, none 중 하나여야 합니다")
    choice = body.get("choice") if outcome == "chose" else None
    if outcome == "chose" and choice not in options:
        raise ValueError("고른 값이 비교한 값에 없습니다")
    shown = [str(option) for option in body.get("shown", options)]
    judgment = {
        "id": os.urandom(6).hex(),
        "ts": _now(),
        "component": component["id"],
        "dimension": dimension["id"],
        "options": options,
        "shown": shown if sorted(shown) == sorted(options) else options,
        "outcome": outcome,
        "choice": choice,
        "params": {str(k): str(v) for k, v in (body.get("params") or {}).items()},
        "conditions": _clean_conditions(body.get("conditions")),
        "note": str(body.get("note", "")).strip()[:400],
        # 카탈로그 문장이 나중에 바뀌어도 당시 무엇을 비교했는지 남긴다
        "specs": {option: values[option]["spec"] for option in options},
    }
    judgments = load_judgments()
    judgments.append(judgment)
    _save_judgments(judgments)
    return judgment


def undo_judgment(judgment_id):
    judgments = load_judgments()
    remaining = [j for j in judgments if j["id"] != judgment_id]
    if len(remaining) == len(judgments):
        raise LookupError("되돌릴 평가를 찾을 수 없습니다")
    _save_judgments(remaining)
    return {"undone": judgment_id}


# 블록과 /taste 적용 문구가 함께 쓰는 값 문장

def _value_label(dimension, value_id):
    """에이전트에게 보일 값 이름과 설명. 다른 차원이 덮은 숫자나 비교 맥락이 든 spec 대신 쓰도록
    카탈로그 값에 brief가 있으면 그것을 쓴다. spec은 판정 스냅숏과 재확인 계산의 기준이라 고치지 않는다."""
    value = _find(dimension["values"], value_id)
    return (value["label"], value.get("brief") or value["spec"]) if value else (value_id, "")


def _curve_dimension(component, prefs):
    """카탈로그에서 `curve: true`인 차원은 그 컴포넌트의 곡선과 길이를 직접 비교한다. 고른 값이 있으면 그 차원을 돌려준다."""
    return next(
        (d for d in component["dimensions"] if d.get("curve") and prefs[d["id"]]["status"] in ("확정", "관찰")),
        None,
    )


def _variant_lines(dimension, pref):
    """재확인 결과. 같은 값을 고른 조건은 기준 줄 끝에 붙이고, 다른 값을 고른 조건은 아래 줄로 따로 적는다."""
    same, other = [], []
    for key, variant in sorted(pref["variants"].items()):
        where = condition_label(key)
        if variant["status"] == "새 값 필요":
            other.append(f"  - {where}에서는 비교한 값이 모두 별로였다. 이 조건에서는 시편의 값들과 다른 방향을 고른다")
        elif variant["status"] in ("확정", "관찰"):
            if variant["value"] == pref["value"]:
                same.append(f"{where}({variant['status']})")
            else:
                label, spec = _value_label(dimension, variant["value"])
                other.append(f"  - {where}에서는: {label} ({variant['status']}, {variant['chosen']}번 고름). {spec}")
    return (f" {', '.join(same)}에서도 같은 값을 골랐다." if same else ""), other


def block_lines(catalog, judgments):
    """취향 블록과 TASTE.md에 넣는 컴포넌트별 확정, 관찰 값. 고른 적 있는 컴포넌트만."""
    lines = []
    for component in catalog["components"]:
        prefs = component_preferences(component, judgments)
        picked = []
        for dimension in component["dimensions"]:
            pref = prefs[dimension["id"]]
            if pref["status"] in ("확정", "관찰"):
                label, spec = _value_label(dimension, pref["value"])
                same, other = _variant_lines(dimension, pref)
                picked.append(f"  - {dimension['label']}: {label} ({pref['status']}). {spec}{same}")
                picked += ["  " + line for line in other]
        if picked:
            lines.append(f"- {component['label']}" + (" (전역, 모든 화면)" if is_global(component) else ""))
            lines += picked
    return lines


def safe_block_lines():
    """블록과 TASTE.md는 labs 상태와 무관하게 만들어져야 하므로 카탈로그 오류는 빈 목록으로 넘긴다."""
    try:
        return block_lines(load_catalog(), load_judgments())
    except (OSError, ValueError):
        return []


def summary(catalog, judgments, deliveries):
    """status 명령의 한 줄 요약과 휴면 여부."""
    dims = confirmed = pending = 0
    for component in catalog["components"]:
        prefs = component_preferences(component, judgments)
        for pref in prefs.values():
            if pref["status"] == "해당 없음":
                continue
            dims += 1
            confirmed += pref["status"] in ("확정", "무관")
            pending += pref["status"] in ("미평가", "관찰")
    last = max((j["ts"] for j in judgments), default=None)
    mentioned = any(d.get("components") and _recent(d["ts"], DORMANT_DAYS) for d in deliveries)
    # 시편을 새로 만들거나 고친 직후에는 평가가 없어도 휴면이 아니다
    edited = _file_time(catalog_path())
    dormant = bool(catalog["components"]) and not any(
        (_recent(last, DORMANT_DAYS), mentioned, _recent(edited, DORMANT_DAYS))
    )
    return {"dimensions": dims, "settled": confirmed, "pending": pending, "last": last, "dormant": dormant}


def _file_time(path):
    if not os.path.exists(path):
        return None
    return dt.datetime.fromtimestamp(os.path.getmtime(path), dt.timezone.utc).isoformat(timespec="seconds")


# labs 개발 서버

def _labs_running():
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{LABS_PORT}/tastepin/ping", timeout=0.5) as response:
            return json.load(response).get("root") == os.path.realpath(LABS_DIR)
    except (OSError, ValueError, AttributeError):
        return False


def _pnpm():
    """pnpm 실행 명령. 설치된 pnpm을 먼저 쓰고, 없으면 Corepack으로 lab의 packageManager 판을 받는다."""
    pnpm = shutil.which("pnpm")
    if pnpm:
        return [pnpm]
    # Node.js 25부터 Corepack이 Node에 포함되지 않으므로 대체 경로로만 쓴다
    corepack = shutil.which("corepack")
    if corepack:
        return [corepack, "pnpm"]
    raise FileNotFoundError("pnpm이 필요합니다. pnpm을 설치하거나 Corepack을 준비하세요. README의 설치 조건을 확인하세요.")


def ensure_labs_server():
    """labs 시편 화면을 고정 포트에 띄운다. 이미 떠 있으면 그대로 쓴다."""
    if _labs_running():
        return labs_url()
    if not os.path.exists(catalog_path()):
        raise FileNotFoundError(f"labs 시편 카탈로그가 없습니다: {catalog_path()}")
    pnpm = _pnpm()
    os.makedirs(store.STATE_DIR, exist_ok=True)
    with open(LABS_LOG_PATH, "a") as log:
        if not os.path.isdir(os.path.join(LABS_DIR, "node_modules")):
            raise FileNotFoundError("lab 의존성이 없습니다. lab/에서 pnpm install --frozen-lockfile을 먼저 실행하세요.")
        process = subprocess.Popen(
            [*pnpm, "exec", "vite", "--host", "127.0.0.1", "--port", str(LABS_PORT), "--strictPort"],
            cwd=LABS_DIR,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    with open(LABS_PID_PATH, "w") as handle:
        handle.write(str(process.pid))
    for _ in range(100):
        if _labs_running():
            return labs_url()
        if process.poll() is not None:
            break
        time.sleep(0.1)
    raise RuntimeError(f"labs 개발 서버를 시작하지 못했습니다. 로그: {LABS_LOG_PATH}")
