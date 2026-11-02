"""lint의 측정 계약과 결과 합치기를 검사한다. 브라우저 점검은 uv와 Chromium이 있을 때만 실행한다."""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TASTE_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).with_name("fixtures")
sys.path.insert(0, str(TASTE_ROOT))

from tastelib import lint, store
from lint_choices import CATALOG, JUDGMENTS, RULES, choice


def _check(check_id, level, symptom="color-dated", summary="", samples=()):
    return {"id": check_id, "symptom": symptom, "title": check_id, "level": level,
            "summary": summary, "samples": list(samples)}


class LintContractTests(unittest.TestCase):
    def test_measured_symptoms_match_probe_and_catalog(self):
        probe = (TASTE_ROOT / "tastelib" / "probe.js").read_text(encoding="utf-8")
        runner = (TASTE_ROOT / "tastelib" / "lint.py").read_text(encoding="utf-8")
        measured = set(re.findall(r'add\("[\w-]+", "([\w-]+)"', probe))
        measured |= set(re.findall(r'"symptom": "([\w-]+)"', runner))
        self.assertEqual(measured, set(store.LINT_SYMPTOMS))
        catalog = {s["id"] for s in store.load_symptoms()["symptoms"]}
        self.assertEqual(measured - catalog, set())

    def test_merge_keeps_worst_level_and_where_it_happened(self):
        results = [
            ("light", "라이트", {"checks": [_check("contrast", "pass", summary="ok")]}),
            ("dark", "다크", {"checks": [_check("contrast", "fail", summary="bad", samples=["p 2.1:1"])]}),
            ("mobile", "휴대폰", {"checks": [_check("contrast", "warn", summary="meh")]}),
        ]
        merged, = lint.merge(results)
        self.assertEqual(merged["level"], "fail")
        self.assertEqual(merged["summary"], "bad")
        self.assertEqual(merged["samples"], ["p 2.1:1"])
        self.assertEqual(merged["scenarios"], ["다크", "휴대폰"])

    def test_unmeasured_confirmed_rules_are_listed_for_visual_review(self):
        rules = {"rules": [
            {"title": "무채색 바탕", "status": "확정", "symptoms": ["color-dated"]},
            {"title": "템플릿 피하기", "status": "확정", "symptoms": ["generic-template"]},
            {"title": "관찰 중", "status": "관찰", "symptoms": ["motion-none"]},
        ]}
        symptoms = {"symptoms": [{"id": "color-dated", "label": "누리끼리", "fix": "무채색으로"}]}
        checks, unmeasured = lint.annotate([_check("warm", "fail")], symptoms, rules)
        self.assertEqual(unmeasured, ["템플릿 피하기"])
        self.assertEqual(checks[0]["rules"], ["무채색 바탕"])
        self.assertEqual(checks[0]["fix"], "무채색으로")

    def test_accent_bar_links_its_own_rule_and_fix(self):
        rules = {"rules": [
            {"id": "surface-grouping", "title": "여백으로 묶기", "status": "확정", "symptoms": ["border-heavy"]},
            {"id": "other", "title": "다른 테두리 규칙", "status": "확정", "symptoms": ["border-heavy"]},
        ]}
        symptoms = {"symptoms": [{"id": "border-heavy", "label": "border가 많다", "fix": "border를 줄인다"}]}
        checks, _ = lint.annotate(
            [_check("accent-bar", "fail", symptom="border-heavy"), _check("box-borders", "fail", symptom="border-heavy")],
            symptoms, rules,
        )
        bar, boxes = checks
        self.assertEqual(bar["symptom_label"], "border가 많다")
        self.assertEqual(bar["rules"], ["여백으로 묶기"])
        self.assertIn("표면 톤 차이와 여백", bar["fix"])
        self.assertEqual(boxes["rules"], ["여백으로 묶기", "다른 테두리 규칙"])
        self.assertEqual(boxes["fix"], "border를 줄인다")


@unittest.skipUnless(shutil.which("uv") or Path("~/.local/bin/uv").expanduser().exists(), "uv가 없다")
class LintBrowserTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="taste-lint-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        for name in ("taste.py", "lint.py"):
            shutil.copyfile(TASTE_ROOT / name, self.root / name)
        shutil.copytree(TASTE_ROOT / "tastelib", self.root / "tastelib", ignore=shutil.ignore_patterns("__pycache__"))
        (self.root / "data").mkdir()
        shutil.copyfile(TASTE_ROOT / "data" / "symptoms.json", self.root / "data" / "symptoms.json")
        (self.root / "state").mkdir()
        self.labs = self.root / "labs"
        (self.labs / "src" / "specimens").mkdir(parents=True)

    def run_lint(self, fixture, *, judgments=None, rules=None, only=None):
        (self.root / "data" / "rules.json").write_text(json.dumps(RULES if rules is None else rules), encoding="utf-8")
        (self.labs / "src" / "specimens" / "catalog.json").write_text(json.dumps(CATALOG), encoding="utf-8")
        (self.root / "state" / "judgments.jsonl").write_text("".join(
            json.dumps(row) + "\n" for row in (JUDGMENTS if judgments is None else judgments)
        ), encoding="utf-8")
        command = [sys.executable, "-B", str(self.root / "taste.py"), "lint", "--json", "--no-log", str(FIXTURES / fixture)]
        if only:
            command += ["--only", only]
        completed = subprocess.run(
            command, env={**os.environ, "TASTE_LABS_DIR": str(self.labs)},
            capture_output=True, text=True, timeout=300,
        )
        if completed.returncode == 2 and any(message in completed.stderr for message in (
            "Executable doesn't exist", "Failed to launch", "Operation not permitted", "Failed to initialize cache",
        )):
            self.skipTest("브라우저를 띄우지 못했다: " + completed.stderr.strip()[-200:])
        self.assertIn(completed.returncode, (0, 1), completed.stderr)
        self.assertFalse((self.root / "state" / "lint.jsonl").exists())
        return completed.returncode, {c["id"]: c for c in json.loads(completed.stdout)["checks"]}

    def test_violations_are_caught(self):
        code, checks = self.run_lint("lint-violations.html")
        self.assertEqual(code, 1)
        expected = {
            "warm-background": "fail", "box-borders": "fail", "cards": "fail", "radius": "fail",
            "shadows": "fail", "glow": "fail", "gradients": "fail", "text-contrast": "fail",
            "default-font": "warn", "korean-body": "fail", "overflow": "fail", "squashed-text": "fail",
            "accent-count": "warn",
            "hierarchy": "warn", "motion-slow": "warn", "motion-loop": "warn", "content-first": "warn",
            "korean-font": "warn",
        }
        self.assertEqual({key: checks[key]["level"] for key in expected}, expected)

    def test_left_accent_bars_are_caught(self):
        code, checks = self.run_lint("lint-accent-bar.html")
        self.assertEqual(code, 1)
        bar = checks["accent-bar"]
        self.assertEqual(bar["level"], "fail")
        self.assertIn("막대 4개", bar["summary"])
        caught = {sample.split(" ")[2] for sample in bar["samples"]}
        self.assertEqual(caught, {"div.bar-border", "div.bar-thicker", "blockquote.bar-inset", "div.bar-pseudo"})
        self.assertEqual(bar["rules"], ["그룹은 여백과 글자 굵기로 나눈다"])
        self.assertIn("표면 톤 차이와 여백", bar["fix"])

    def test_heading_weight_exception_starts_at_650(self):
        # 임시 원장에서 고른 굵기 650을 기준으로 한다. 개인 원장과 무관해야 한다.
        _, chosen = self.run_lint("lint-heading-weight-650.html")
        _, lighter = self.run_lint("lint-heading-weight-600.html")
        self.assertEqual(chosen["hierarchy"]["level"], "pass")
        self.assertEqual(lighter["hierarchy"]["level"], "warn")

    def test_clean_page_passes(self):
        code, checks = self.run_lint("lint-clean.html")
        self.assertEqual(code, 0)
        self.assertEqual([c["id"] for c in checks.values() if c["level"] in ("fail", "warn")], [])

    def test_same_page_changes_verdict_when_only_choices_change(self):
        _, small = self.run_lint("lint-selected.html", only="light")
        changed = JUDGMENTS + [choice(name, "b", index=2) for name in ("radius", "ground", "body", "heading", "face", "tempo")]
        _, large = self.run_lint("lint-selected.html", judgments=changed, only="light")
        for check in ("radius", "warm-background"):
            self.assertEqual(small[check]["level"], "fail", check)
            self.assertEqual(large[check]["level"], "pass", check)
        self.assertEqual(small["motion-slow"]["level"], "warn")
        self.assertEqual(large["motion-slow"]["level"], "pass")
        self.assertEqual(small["korean-body"]["level"], "pass")
        self.assertEqual(large["korean-body"]["level"], "fail")
        self.assertEqual(small["hierarchy"]["level"], "pass")
        self.assertEqual(large["hierarchy"]["level"], "warn")
        self.assertEqual(large["default-font"]["level"], "pass", "명시적으로 고른 Arial을 금지하지 않는다")
        self.assertIn("12", large["radius"]["fix"])
        self.assertNotIn("0~6", large["radius"]["fix"])

    def test_no_preferences_leave_taste_undecided_but_still_catch_broken_layout(self):
        code, checks = self.run_lint("lint-violations.html", judgments=[], rules={"rules": []}, only="mobile")
        self.assertEqual(code, 1)
        for name in ("radius", "warm-background", "korean-body", "hierarchy", "default-font", "motion-slow", "accent-bar"):
            self.assertEqual(checks[name]["level"], "skip", name)
        self.assertEqual(checks["overflow"]["level"], "fail")
        self.assertEqual(checks["squashed-text"]["level"], "fail")
        self.assertEqual(checks["text-contrast"]["level"], "fail")

    def test_dark_recheck_is_not_dropped_when_page_itself_ignores_dark_mode(self):
        rows = [choice("radius", "b", index=1), choice("radius", "b", index=2),
                choice("radius", "a", theme="dark", index=3)]
        _, checks = self.run_lint("lint-selected.html", judgments=rows, rules={"rules": []})
        self.assertEqual(checks["radius"]["level"], "fail")
        self.assertEqual(checks["radius"]["scenarios"], ["데스크톱 다크"])
        self.assertIn("6px", checks["radius"]["fix"])


if __name__ == "__main__":
    unittest.main()
