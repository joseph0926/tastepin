"""개인 원장과 분리한 검사 선택 예시. 단위 검사와 실제 브라우저 검사에서 함께 쓴다."""

def dimension(name, first, second, **fields):
    return {"id": name, "label": name, **fields, "values": [
        {"id": "a", "label": "a", "spec": "첫 선택", "tokens": first},
        {"id": "b", "label": "b", "spec": "다른 선택", "tokens": second},
    ]}


CATALOG = {"components": [{
    "id": "surface", "label": "화면", "scope": "global", "axis": "visual",
    "dimensions": [
        dimension("radius", {"radius-surface": "6px", "radius-control": "6px"}, {"radius-surface": "12px", "radius-control": "12px"}),
        dimension("ground", {"bg-light": "#ffffff", "bg-dark": "#0f0f0f"}, {"bg-light": "#f7efdc", "bg-dark": "#241d10"}),
        dimension("body", {"font-size-body": "15px", "line-height-body": "1.55"}, {"font-size-body": "18px", "line-height-body": "1.8"}),
        dimension("heading", {"font-size-title": "21px", "font-weight-title": "650"}, {"font-size-title": "30px", "font-weight-title": "750"}),
        dimension("face", {"font-family-base": "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif", "font-family-title": "Georgia, serif"}, {"font-family-base": "Arial, sans-serif", "font-family-title": "Arial, sans-serif"}),
        dimension("tempo", {"duration": "300ms"}, {"duration": "1000ms"}),
    ],
}]}

RULES = {"rules": [
    {"id": "surface-grouping", "title": "그룹은 여백과 글자 굵기로 나눈다", "status": "확정", "symptoms": ["border-heavy", "box-heavy", "shadow-heavy"]},
    {"id": "no-effect-translation", "title": "장식 효과 금지", "status": "확정", "symptoms": ["neon-glow", "gradient-glass"]},
    {"id": "color-neutral-one-accent", "title": "강조색 하나", "status": "확정", "symptoms": ["color-too-many"]},
    {"id": "motion-purpose", "title": "장식 루프 금지", "status": "확정", "symptoms": ["motion-too-much"]},
]}


def choice(dimension_id, value="a", *, component="surface", theme="light", frame="desktop", index=1):
    return {
        "id": str(index), "ts": f"2026-01-{index:02d}T00:00:00Z", "component": component,
        "dimension": dimension_id, "outcome": "chose", "choice": value, "options": ["a", "b"],
        "conditions": {"theme": theme, "frame": frame},
    }


JUDGMENTS = [choice(d["id"]) for d in CATALOG["components"][0]["dimensions"]]
