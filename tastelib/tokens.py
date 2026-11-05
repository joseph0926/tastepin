"""확정한 시편 값을 프로젝트가 import할 토큰 파일로 내보낸다.

카탈로그 값의 `tokens`(labs가 소유)에서 지금 고른 값의 토큰을 모아 세 파일을 만든다.
- taste.css: `--taste-*` CSS 변수. 바탕색은 라이트와 다크를 나눈다
- taste.tailwind.css: Tailwind v4 `@theme`. taste.css의 변수를 Tailwind 이름에 잇는다
- taste.motion.ts: Motion(motion/react) 프리셋
관찰 중인 값도 지금 값으로 내보내고, 고른 적 없는 차원은 내보내지 않는다. 뒤 차원이 앞 차원과 같은 토큰을 가지면
(제목 굵기가 제목 위계의 굵기를 덮는 경우) 카탈로그 순서대로 뒤 값이 이긴다.
"""

import re

from . import lab

HEADER = "생성: taste.py tokens. 직접 고치지 않는다. 원장에서 값을 고르면 다시 생성한다"
# CSS 변수로 내보내지 않는 토큰. Motion 프리셋에만 쓴다
MOTION_ONLY = {"physics", "physics-ease", "swap-mode"}
DECIDED = ("확정", "관찰")


def collect(catalog, judgments):
    """지금 고른 값의 토큰 이름과 값. 같은 이름은 카탈로그 뒤쪽 차원이 이긴다."""
    tokens = {}
    for component in catalog["components"]:
        prefs = lab.component_preferences(component, judgments)
        for dimension in component["dimensions"]:
            pref = prefs[dimension["id"]]
            if pref["status"] not in DECIDED:
                continue
            value = lab._find(dimension["values"], pref["value"])
            tokens.update((value or {}).get("tokens", {}))
    return tokens


def render_css(tokens):
    light = {k[:-len("-light")]: v for k, v in tokens.items() if k.endswith("-light")}
    dark = {k[:-len("-dark")]: v for k, v in tokens.items() if k.endswith("-dark")}
    plain = {
        k: v for k, v in tokens.items()
        if not k.endswith(("-light", "-dark")) and k not in MOTION_ONLY
    }
    lines = [f"/* {HEADER} */", ":root {"]
    lines += [f"  --taste-{k}: {v};" for k, v in sorted(plain.items())]
    lines += [f"  --taste-{k}: {v};" for k, v in sorted(light.items())]
    lines.append("}")
    if dark:
        dark_lines = [f"    --taste-{k}: {v};" for k, v in sorted(dark.items())]
        lines += ["", "@media (prefers-color-scheme: dark) {", '  :root:not([data-theme="light"]) {']
        lines += dark_lines + ["  }", "}", "", '[data-theme="dark"],', ".dark {"]
        lines += [line[2:] for line in dark_lines] + ["}"]
    return "\n".join(lines) + "\n"


# Tailwind v4 테마 이름 -> taste 토큰. 토큰이 없으면 그 줄을 내보내지 않는다
TAILWIND = (
    ("--color-ground", "bg"),
    ("--color-accent", "accent"),
    ("--color-on-accent", "on-accent"),
    ("--font-sans", "font-family-base"),
    ("--font-title", "font-family-title"),
    ("--text-body", "font-size-body"),
    ("--text-body--line-height", "line-height-body"),
    ("--text-title", "font-size-title"),
    ("--text-title--font-weight", "font-weight-title"),
    ("--text-title--letter-spacing", "letter-spacing-title"),
    ("--text-subtitle", "font-size-subtitle"),
    ("--text-subtitle--font-weight", "font-weight-title"),
    ("--radius-surface", "radius-surface"),
    ("--radius-control", "radius-control"),
    ("--radius-check", "radius-check"),
    ("--spacing-block", "space-block"),
    ("--spacing-row", "space-row-y"),
    ("--container-content", "content-width"),
    ("--ease-taste", "ease"),
    ("--default-transition-duration", "duration"),
    ("--default-transition-timing-function", "ease"),
)


def render_tailwind(tokens):
    names = {k[:-len("-light")] if k.endswith("-light") else k for k in tokens}
    lines = [
        f"/* {HEADER} */",
        "/* Tailwind v4: 전역 CSS에서 @import \"tailwindcss\"; 뒤에 이 파일을 import한다 */",
        '@import "./taste.css";',
        "",
        "@theme inline {",
    ]
    lines += [f"  {theme}: var(--taste-{token});" for theme, token in TAILWIND if token in names]
    lines.append("}")
    return "\n".join(lines) + "\n"


def _seconds(value):
    match = re.fullmatch(r"([\d.]+)ms", value or "")
    return round(float(match.group(1)) / 1000, 3) if match else None


def _bezier(value):
    match = re.fullmatch(r"cubic-bezier\(([^)]*)\)", value or "")
    return "[" + ", ".join(part.strip() for part in match.group(1).split(",")) + "]" if match else None


def _px(value):
    match = re.fullmatch(r"(-?[\d.]+)px", value or "")
    return match.group(1) if match else None


def render_motion(tokens):
    ease = _bezier(tokens.get("ease"))
    duration = _seconds(tokens.get("duration"))
    lines = [f"// {HEADER}", "// motion/react에서 쓰는 기본 전환. 컴포넌트에서 고른 값이 따로 있으면 그쪽을 쓴다", ""]
    if ease:
        lines.append(f"export const tasteEase = {ease} as const;")
    if duration is not None:
        lines.append(f"export const tasteDuration = {duration};")
    if ease and duration is not None:
        lines.append("export const tasteTransition = { duration: tasteDuration, ease: tasteEase };")
    if {"enter-scale", "enter-y", "enter-blur"} <= tokens.keys():
        hidden = (
            f"{{ opacity: 0, scale: {tokens['enter-scale']}, y: {_px(tokens['enter-y'])}, "
            f"filter: \"blur({tokens['enter-blur']})\" }}"
        )
        lines += [
            "// 등장과 퇴장은 같은 길을 같은 길이로 되돌린다",
            "export const tasteEnter = {",
            f"  initial: {hidden},",
            '  animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },',
            f"  exit: {hidden},",
            "};",
        ]
    if "press-scale" in tokens:
        press = _seconds(tokens.get("press-duration")) or 0.12
        lines.append(
            f"export const tastePress = {{ whileTap: {{ scale: {tokens['press-scale']} }}, "
            f"transition: {{ duration: {press} }} }};"
        )
    if "stagger" in tokens:
        lines.append(f"export const tasteStagger = {_seconds(tokens['stagger'])};")
    physics_duration = _seconds(tokens.get("physics-duration"))
    if tokens.get("physics") == "spring" and physics_duration is not None:
        bounce = tokens.get("spring-bounce", "0")
        lines.append(
            f'export const tasteSpring = {{ type: "spring", visualDuration: {physics_duration}, bounce: {bounce} }} as const;'
        )
    elif tokens.get("physics") == "tween" and physics_duration is not None:
        lines.append(
            f"export const tasteSpring = {{ duration: {physics_duration}, ease: {_bezier(tokens.get('physics-ease'))} }};"
        )
    if "swap-distance" in tokens:
        distance = _px(tokens["swap-distance"])
        lines.append(
            "export const tasteSwap = { "
            f"distance: {distance if distance is not None else repr(tokens['swap-distance'])}, "
            f"blur: {_px(tokens.get('swap-blur')) or 0}, "
            f"mode: \"{tokens.get('swap-mode', 'popLayout')}\" }} as const;"
        )
    if "icon-swap-scale" in tokens:
        lines.append(f"export const tasteIconSwapScale = {tokens['icon-swap-scale']};")
    return "\n".join(lines) + "\n"


def render_all(catalog, judgments):
    tokens = collect(catalog, judgments)
    return {
        "taste.css": render_css(tokens),
        "taste.tailwind.css": render_tailwind(tokens),
        "taste.motion.ts": render_motion(tokens),
    }
