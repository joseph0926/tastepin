"""현재 선택을 화면 조건별 검사 기준으로 바꾼다. 설명 문장에서 숫자를 추측하지 않는다."""

import math
import re

from . import lab

DECIDED = ("확정", "관찰")
BASIC_CHECKS = {"text-contrast", "rendered-font", "overflow", "squashed-text", "reduced-motion", "content-first"}

# 숫자 선택과 무관한 기존 규칙의 검사. 확정된 전역 규칙이 있을 때만 켠다.
RULE_CHECKS = {
    "surface-grouping": ("box-borders", "cards", "shadows", "accent-bar"),
    "no-effect-translation": ("glow", "gradients", "glass"),
    "color-neutral-one-accent": ("accent-count",),
    "no-default-font": ("font-count",),
    "motion-purpose": ("motion-loop",),
}


def _number(value, unit=""):
    match = re.fullmatch(r"(\d+(?:\.\d+)?)" + re.escape(unit), str(value))
    number = float(match[1]) if match else None
    return number if number is not None and math.isfinite(number) else None


def build(catalog, judgments, rules_doc, view):
    """검사 기준과 직접 확인할 선택. 컴포넌트 값을 화면 전체 값으로 퍼뜨리지 않는다."""
    checks = {name: {"kind": "basic"} for name in BASIC_CHECKS}
    for rule in rules_doc["rules"]:
        if rule.get("status") == "확정" and not rule.get("component"):
            for name in RULE_CHECKS.get(rule.get("id"), ()):
                checks[name] = {"kind": "taste", "rules": [rule["id"]]}

    values, selected, manual = {}, {}, []
    for component in catalog["components"]:
        # requires는 기준 조건이 아니라 지금 검사하는 테마와 화면 폭에서 판정한다.
        own = [j for j in judgments if j["component"] == component["id"]]
        prefs = {
            d["id"]: lab._dimension_entry(d, [j for j in own if j["dimension"] == d["id"]])
            for d in component["dimensions"]
        }
        params = lab.current_params(component, prefs, view)
        for dimension in component["dimensions"]:
            pref = prefs[dimension["id"]]
            variant = lab._variant_for(pref, view)
            if variant and variant["status"] in DECIDED:
                pref = variant
            if pref["status"] not in DECIDED or not lab._requires_met(dimension, params):
                continue
            value = lab._find(dimension["values"], pref["value"])
            if value is None:
                continue
            selected[(component["id"], dimension["id"])] = value
            if lab.is_global(component):
                values.update(value.get("tokens", {}))
            else:
                manual.append(component.get("label", component["id"]))

    def numeric(token, unit=""):
        return _number(values.get(token), unit)

    def configure(name, **settings):
        settings = {key: value for key, value in settings.items() if value is not None}
        if settings:
            checks[name] = {"kind": "taste", **settings}

    configure("radius", surface=numeric("radius-surface", "px"), control=numeric("radius-control", "px"))
    if ("button", "radius") in selected and "radius" in checks:
        # 버튼 시편은 아직 숫자 토큰 없이 구현 설명만 있다. 전역 버튼 값으로 오판하지 않는다.
        checks["radius"]["skipButtons"] = True
    configure("warm-background", color=values.get("bg-" + view["theme"]))
    configure("korean-body", size=numeric("font-size-body", "px"), leading=numeric("line-height-body"))
    title, body = numeric("font-size-title", "px"), numeric("font-size-body", "px")
    if title is not None and body and body > 0:
        configure("hierarchy", ratio=title / body, weight=numeric("font-weight-title"))
    base_font = values.get("font-family-base")
    configure("default-font", body=base_font, heading=values.get("font-family-title", base_font))
    configure("korean-font", family=base_font)
    durations = [numeric(name, "ms") for name in ("duration", "physics-duration", "press-duration")]
    durations = [value for value in durations if value is not None]
    if durations:
        configure("motion-slow", seconds=max(durations) / 1000)

    # 글로만 표현된 선택은 고정된 개인 기준으로 대신 검사하지 않는다.
    grouping = selected.get(("surface", "grouping"))
    if grouping and grouping["id"] != "space":
        for name in ("box-borders", "cards", "shadows"):
            checks.pop(name, None)
    if selected.get(("selection", "row"), {}).get("id") == "bar":
        checks.pop("accent-bar", None)
    if selected.get(("dialog", "backdrop"), {}).get("id") == "blur":
        checks.pop("glass", None)
    if selected.get(("tooltip", "look"), {}).get("id") == "raised":
        checks.pop("shadows", None)
    # 곡선을 직접 고른 컴포넌트는 전역 길이보다 우선한다. DOM에서 그 구현을 식별할 계약은 아직 없다.
    for component in catalog["components"]:
        if not lab.is_global(component) and any(
            d.get("curve") and (component["id"], d["id"]) in selected for d in component["dimensions"]
        ):
            checks.pop("motion-slow", None)

    return {"checks": checks, "manual_components": list(dict.fromkeys(manual))}
