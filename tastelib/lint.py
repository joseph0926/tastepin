"""화면을 브라우저로 열어 취향 규칙 중 값으로 잴 수 있는 것을 점검한다.

측정은 probe.js가 페이지 안에서 하고, 여기서는 화면 조건(라이트, 다크, 휴대폰)별로 실행해 결과를 합치고
증상의 수정법과 관련 규칙을 붙여 보고한다. playwright가 필요하므로 taste.py 본체와 달리 uv가 만든 격리
환경에서 실행된다(진입점은 lint.py). 실패가 하나라도 있으면 종료 코드 1, 점검을 못 하면 2를 돌려준다.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

from . import lab, lintpolicy, store

PROBE = (Path(__file__).with_name("probe.js")).read_text(encoding="utf-8")

SCENARIOS = {
    "light": ("데스크톱 라이트", {"viewport": {"width": 1440, "height": 900}, "color_scheme": "light"}),
    "dark": ("데스크톱 다크", {"viewport": {"width": 1440, "height": 900}, "color_scheme": "dark"}),
    "mobile": ("휴대폰", {
        "viewport": {"width": 390, "height": 844}, "device_scale_factor": 3,
        "is_mobile": True, "has_touch": True, "color_scheme": "light",
    }),
}
LEVELS = ("skip", "pass", "warn", "fail")
SETTLE_MS = 1200

# 증상의 일반 수정법보다 좁은 수정법이 정해진 점검. 규칙은 증상으로 찾지 않고 id로 직접 잇는다
CHECK_LINKS = {
    "accent-bar": {"rule": "surface-grouping", "fix": "막대를 지우고 표면 톤 차이와 여백으로 구분한다."},
}

# 브라우저가 시스템 서체를 고를 때 쓰는 별칭. 선언에 이 이름이 있으면 시스템 서체도 의도한 것으로 본다
SYSTEM_ALIASES = {"-apple-system", "system-ui", "blinkmacsystemfont", "sans-serif", "serif", "ui-sans-serif", "ui-serif"}


def _families(declared):
    return [name.strip().strip("\"'").lower() for name in declared.split(",") if name.strip()]


def _rendered_fonts(cdp, selector):
    root = cdp.send("DOM.getDocument", {"depth": 0})["root"]["nodeId"]
    node = cdp.send("DOM.querySelector", {"nodeId": root, "selector": selector})["nodeId"]
    if not node:
        return []
    fonts = cdp.send("CSS.getPlatformFontsForNode", {"nodeId": node})["fonts"]
    return sorted(fonts, key=lambda font: -font["glyphCount"])


def _font_checks(context, page, probes, policy):
    """선언한 서체가 실제로 그려졌는지 CDP로 확인한다. 웹 서체 로드 실패와 한글의 시스템 서체 대체를 잡는다."""
    cdp = context.new_cdp_session(page)
    cdp.send("DOM.enable")
    cdp.send("CSS.enable")
    missing, korean = [], None
    for probe in probes:
        fonts = _rendered_fonts(cdp, probe["selector"])
        if not fonts:
            continue
        main = fonts[0]
        declared = _families(probe["declared"])
        named = main["isCustomFont"] or main["familyName"].lower() in declared
        if probe["role"] == "korean":
            # 한글은 범용 이름(sans-serif)으로 떨어진 시스템 대체도 의도하지 않은 것으로 본다
            korean = (main, declared, named)
        elif not (named or SYSTEM_ALIASES.intersection(declared)):
            missing.append(f"{probe['role']}: 선언 {declared[0]} → 실제 {main['familyName']}")
    checks = [{
        "id": "rendered-font", "symptom": "type-default-font", "title": "선언 서체 적용",
        "level": "fail" if missing else "pass",
        "summary": "선언한 서체가 로드되지 않아 다른 서체로 그려졌다" if missing else "제목과 본문이 선언한 서체로 그려졌다",
        "samples": missing,
        "fix": "선언한 서체 파일의 로드와 적용 여부를 확인한다.",
        "rule_ids": [],
    }]
    if korean:
        main, declared, intended = korean
        selected = policy["checks"].get("korean-font", {})
        selected_families = set(_families(selected.get("family", "")))
        if selected_families and not selected_families.difference(SYSTEM_ALIASES):
            intended = intended or bool(SYSTEM_ALIASES.intersection(declared))
        summary = f"한글을 {main['familyName']}{'(웹 서체)' if main['isCustomFont'] else ''}로 그렸다"
        if not intended:
            summary += f". 선언({', '.join(declared[:3])})에 한글 서체가 없어 시스템이 대신 골랐다"
        checks.append({
            "id": "korean-font", "symptom": "type-ko-readability", "title": "한글 서체",
            "level": ("pass" if intended else "warn") if selected else "skip", "summary": summary, "samples": [],
            "fix": f"고른 본문 서체({selected['family']})의 한글 글리프와 실제 적용 여부를 확인한다." if selected else None,
            "rule_ids": [],
        })
    for check in checks:
        check["kind"] = policy["checks"].get(check["id"], {}).get("kind", "taste")
        if check["level"] == "skip":
            check["summary"] = "고른 한글 서체가 없어 취향을 판정하지 않았다"
    return checks


def _run_scenario(browser, url, options, shot_path, policy):
    from playwright.sync_api import TimeoutError as PlaywrightTimeout

    context = browser.new_context(**options)
    try:
        page = context.new_page()
        page.goto(url, wait_until="load", timeout=30_000)
        page.evaluate(PROBE, {"phase": "early", "policy": policy})
        try:
            page.wait_for_load_state("networkidle", timeout=5_000)
        except PlaywrightTimeout:
            pass  # 계속 폴링하는 개발 서버도 있다. 가라앉기를 더 기다리지 않고 잰다
        page.wait_for_timeout(SETTLE_MS)
        page.evaluate("document.fonts.ready.then(() => true)")
        result = page.evaluate(PROBE, {"phase": "late", "policy": policy})
        result["checks"] += _font_checks(context, page, result["meta"]["fontProbes"], policy)
        if shot_path:
            page.screenshot(path=shot_path, full_page=True)
        return result
    finally:
        context.close()


def _launch(playwright):
    """보안 수정된 시스템 Chrome만 사용하며 페이지를 열기 전에 버전을 확인한다."""
    browser = playwright.chromium.launch(channel="chrome", chromium_sandbox=True)
    try:
        version = browser.version
        if not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", version) or tuple(map(int, version.split("."))) < (156, 0, 8078, 79):
            raise RuntimeError(f"Chrome 156.0.8078.79 이상이 필요합니다. 설치된 버전: {version}")
        return browser
    except Exception:
        browser.close()
        raise


def measure(url, scenario_ids, shots_dir=None, *, catalog=None, judgments=None, rules_doc=None):
    """조건별 측정 결과 [(id, 이름, 결과)]와 건너뛴 조건의 설명을 돌려준다."""
    from playwright.sync_api import sync_playwright

    catalog = lab.load_catalog() if catalog is None else catalog
    judgments = lab.load_judgments() if judgments is None else judgments
    rules_doc = store.load_rules() if rules_doc is None else rules_doc
    results, notes = [], []
    previous_policy = None
    with sync_playwright() as playwright:
        browser = _launch(playwright)
        try:
            for scenario_id in scenario_ids:
                label, options = SCENARIOS[scenario_id]
                view = {"theme": options["color_scheme"], "frame": "mobile" if options.get("is_mobile") else "desktop"}
                policy = lintpolicy.build(catalog, judgments, rules_doc, view)
                shot = os.path.join(shots_dir, f"{scenario_id}.png") if shots_dir else None
                result = _run_scenario(browser, url, options, shot, policy)
                if policy["manual_components"]:
                    notes.append(f"{label}: 컴포넌트별 선택은 직접 확인한다: {', '.join(policy['manual_components'])}")
                light = next((r for sid, _, r in results if sid == "light"), None)
                # 다크 설정에 반응하지 않는 화면은 라이트와 같은 결과를 두 번 세지 않는다
                if (
                    scenario_id == "dark" and light and policy == previous_policy
                    and not result["meta"]["respondsToColorScheme"]
                    and result["meta"]["pageBackground"] == light["meta"]["pageBackground"]
                ):
                    notes.append("다크 설정에 반응하지 않아 다크 결과는 라이트와 같다고 보고 뺐다")
                    continue
                results.append((scenario_id, label, result))
                if scenario_id == "light":
                    previous_policy = policy
        finally:
            browser.close()
    return results, notes


def merge(results):
    """같은 점검의 조건별 결과를 가장 나쁜 것 하나로 합치고, 걸린 조건을 함께 남긴다."""
    merged = {}
    for _, label, result in results:
        for check in result["checks"]:
            entry = merged.setdefault(check["id"], {**check, "scenarios": [], "skipped_scenarios": []})
            if check["level"] == "skip":
                entry["skipped_scenarios"].append(label)
            if check["level"] in ("warn", "fail"):
                entry["scenarios"].append(label)
            if LEVELS.index(check["level"]) > LEVELS.index(entry["level"]):
                entry.update({key: value for key, value in check.items() if key not in ("scenarios", "skipped_scenarios")})
    return list(merged.values())


def annotate(checks, symptoms_doc, rules_doc):
    """점검마다 증상의 이름과 수정법, 관련 규칙을 붙이고, 값으로 재지 않은 확정 규칙을 고른다."""
    symptoms = {s["id"]: s for s in symptoms_doc["symptoms"]}
    rules = rules_doc["rules"]
    measured = {c["symptom"] for c in checks if c["symptom"] and c["level"] != "skip"}
    for check in checks:
        symptom = symptoms.get(check["symptom"])
        link = CHECK_LINKS.get(check["id"])
        linked_rules = [r for r in rules if link and r.get("id") == link["rule"]]
        check["symptom_label"] = symptom["label"] if symptom else None
        check["fix"] = None if check["level"] == "skip" else (
            check.get("fix") or (link["fix"] if link else symptom["fix"] if symptom else None)
        )
        if "rule_ids" in check:
            check["rules"] = [r["title"] for r in rules if r.get("id") in check["rule_ids"]]
        else:
            check["rules"] = [r["title"] for r in linked_rules] or [
                r["title"] for r in rules if check["symptom"] in r.get("symptoms", [])
            ]
    unmeasured = [
        r["title"] for r in rules
        if r["status"] == "확정" and not measured.intersection(r.get("symptoms", []))
    ]
    return checks, unmeasured


def format_report(url, labels, checks, unmeasured, notes):
    counts = {level: sum(1 for c in checks if c["level"] == level) for level in LEVELS}
    lines = [
        f"취향 점검 {url}",
        f"화면: {', '.join(labels)}",
        f"실패 {counts['fail']}, 주의 {counts['warn']}, 통과 {counts['pass']}, 미판정 {counts['skip']}",
    ]
    lines += [f"참고: {note}" for note in notes]

    def detail(check):
        where = f" ({', '.join(check['scenarios'])})" if check["scenarios"] and len(labels) > 1 else ""
        out = [f"- {check['title']}{where}: {check['summary']}"]
        out += [f"    {sample}" for sample in check["samples"]]
        if check["symptom_label"]:
            related = f" / 규칙: {', '.join(check['rules'])}" if check["rules"] else ""
            out.append(f"    증상: {check['symptom_label']}{related}")
            out.append(f"    수정: {check['fix']}")
        return out

    taste_checks = [c for c in checks if c["symptom"] and c.get("kind") != "basic"]
    hygiene = [c for c in checks if (not c["symptom"] or c.get("kind") == "basic") and c["level"] in ("warn", "fail")]
    for level, heading in (("fail", "실패"), ("warn", "주의")):
        group = [c for c in taste_checks if c["level"] == level]
        if group:
            lines += ["", heading]
            for check in group:
                lines += detail(check)
    passed = [c["title"] for c in taste_checks if c["level"] == "pass"]
    if passed:
        lines += ["", f"통과: {', '.join(passed)}"]
    if hygiene:
        lines += ["", "기본 위생"]
        for check in hygiene:
            lines += detail(check)
    skipped = [c["title"] for c in checks if c["level"] == "skip"]
    if skipped:
        lines += ["", "미판정 (선택값이 없거나 자동 검사로 연결하지 못한 항목):", ", ".join(skipped)]
    partial = [c for c in checks if c["level"] != "skip" and c.get("skipped_scenarios")]
    if partial:
        lines += ["", "일부 화면 조건은 미판정:"]
        lines += [f"- {c['title']}: {', '.join(c['skipped_scenarios'])}" for c in partial]
    lines += ["", "값으로 재지 않는 것 (화면을 보고 확인):", "- 휴대폰 화면 전체. 통과해도 좁은 화면 붕괴는 스크린숏으로 본다(--shots)"]
    lines += [f"- {title}" for title in unmeasured]
    return "\n".join(lines) + "\n"


def _target_url(target):
    if os.path.exists(target):
        return Path(target).resolve().as_uri()
    if "://" not in target:
        return "http://" + target
    return target


def main(argv=None):
    parser = argparse.ArgumentParser(prog="taste.py lint", description="화면의 취향 위반을 값으로 점검")
    parser.add_argument("target", help="URL, localhost:3000 같은 주소나 HTML 파일 경로")
    parser.add_argument("--only", choices=tuple(SCENARIOS), action="append", help="특정 화면 조건만 (여러 번 지정 가능)")
    parser.add_argument("--shots", metavar="DIR", help="조건별 전체 스크린숏을 저장할 폴더")
    parser.add_argument("--json", action="store_true", help="합친 결과를 JSON으로 출력")
    parser.add_argument("--session", default="", help="/taste로 취향을 받은 세션 id. 적용률을 세는 데 쓴다")
    parser.add_argument("--no-log", action="store_true", help="state/lint.jsonl에 남기지 않는다")
    args = parser.parse_args(argv)

    url = _target_url(args.target)
    scenario_ids = args.only or list(SCENARIOS)
    if args.shots:
        os.makedirs(args.shots, exist_ok=True)
    try:
        results, notes = measure(url, scenario_ids, args.shots)
    except Exception as error:  # noqa: BLE001
        print(f"점검하지 못했습니다: {error}", file=sys.stderr)
        print("Google Chrome을 설치하거나 최신 안정판으로 업데이트하세요. Playwright의 Chromium 캐시로 대체하지 않습니다.", file=sys.stderr)
        return 2

    checks, unmeasured = annotate(merge(results), store.load_symptoms(), store.load_rules())
    labels = [label for _, label, _ in results]
    if args.json:
        payload = {"url": url, "scenarios": labels, "notes": notes, "checks": checks, "unmeasured_rules": unmeasured}
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(format_report(url, labels, checks, unmeasured, notes), end="")
    if args.shots:
        print(f"스크린숏: {os.path.abspath(args.shots)}", file=sys.stderr)
    if not args.no_log:
        store.log_lint(lint_record(url, labels, checks, args.session))
    return 1 if any(c["level"] == "fail" for c in checks) else 0


def lint_record(url, labels, checks, session=""):
    # 치환되지 않은 ${CLAUDE_SESSION_ID} 같은 자리표시자는 세션 id가 아니다
    session = "" if "$" in session else session.strip()
    failed = {c["symptom"] or c["id"] for c in checks if c["level"] == "fail"}
    return {
        "ts": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "session": session,
        "project": os.getcwd().replace(os.path.expanduser("~"), "~"),
        "target": url,
        "scenarios": labels,
        "fail": sorted(failed),
        # 같은 증상의 다른 점검이 실패했으면 주의에는 다시 적지 않는다
        "warn": sorted({c["symptom"] or c["id"] for c in checks if c["level"] == "warn"} - failed),
    }
