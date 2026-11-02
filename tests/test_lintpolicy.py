import copy
import io
from contextlib import redirect_stderr
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lint_choices import CATALOG, JUDGMENTS, RULES, choice, dimension
from tastelib import lint, lintpolicy

VIEW = {"theme": "light", "frame": "desktop"}


class LintPolicyTests(unittest.TestCase):
    def test_no_choices_do_not_inherit_personal_numeric_limits(self):
        policy = lintpolicy.build(CATALOG, [], {"rules": []}, VIEW)
        self.assertEqual(set(policy["checks"]), lintpolicy.BASIC_CHECKS)
        for check in ("radius", "warm-background", "hierarchy", "korean-body", "motion-slow"):
            self.assertNotIn(check, policy["checks"])

    def test_latest_choice_changes_limits_without_editing_code(self):
        before = lintpolicy.build(CATALOG, JUDGMENTS, RULES, VIEW)["checks"]
        after = lintpolicy.build(CATALOG, JUDGMENTS + [choice("radius", "b", index=2)], RULES, VIEW)["checks"]
        self.assertEqual(before["radius"]["surface"], 6)
        self.assertEqual(after["radius"]["surface"], 12)
        self.assertEqual(after["radius"]["control"], 12)

    def test_theme_and_mobile_rechecks_are_resolved_separately(self):
        rows = [choice("radius", index=1), choice("radius", index=2), choice("radius", "b", theme="dark", index=3),
                choice("radius", "b", frame="mobile", index=4)]
        for theme, frame, expected in [("light", "desktop", 6), ("dark", "desktop", 12), ("light", "mobile", 12)]:
            with self.subTest(theme=theme, frame=frame):
                policy = lintpolicy.build(CATALOG, rows, RULES, {"theme": theme, "frame": frame})
                self.assertEqual(policy["checks"]["radius"]["surface"], expected)

    def test_rejected_and_indifferent_choices_do_not_set_limits(self):
        rejected = {**choice("radius", index=2), "outcome": "none", "choice": None}
        indifferent = [{**choice("radius", index=i), "outcome": "same", "choice": None} for i in (1, 2)]
        for rows in ([choice("radius"), rejected], indifferent):
            self.assertNotIn("radius", lintpolicy.build(CATALOG, rows, RULES, VIEW)["checks"])

    def test_requirements_and_later_tokens_follow_current_view(self):
        catalog = copy.deepcopy(CATALOG)
        catalog["components"][0]["dimensions"].append(dimension("weight", {"font-weight-title": "600"}, {}, requires={"heading": ["b"]}))
        rows = [choice("body"), choice("heading", index=1), choice("heading", index=2),
                choice("heading", "b", theme="dark", index=3), choice("weight")]
        light = lintpolicy.build(catalog, rows, RULES, VIEW)["checks"]
        dark = lintpolicy.build(catalog, rows, RULES, {"theme": "dark", "frame": "desktop"})["checks"]
        self.assertEqual(light["hierarchy"]["weight"], 650)
        self.assertEqual(dark["hierarchy"]["weight"], 600)

    def test_component_choice_is_not_applied_to_every_element(self):
        catalog = copy.deepcopy(CATALOG)
        catalog["components"].append({"id": "button", "label": "버튼", "dimensions": [dimension("radius", {}, {"radius-control": "999px"})]})
        policy = lintpolicy.build(catalog, JUDGMENTS + [choice("radius", "b", component="button")], RULES, VIEW)
        self.assertEqual(policy["checks"]["radius"]["control"], 6)
        self.assertTrue(policy["checks"]["radius"]["skipButtons"])
        self.assertEqual(policy["manual_components"], ["버튼"])

    def test_observed_or_scoped_rules_do_not_enable_global_heuristics(self):
        for rule in [{**RULES["rules"][0], "status": "관찰"}, {**RULES["rules"][0], "component": "button"}]:
            self.assertNotIn("accent-bar", lintpolicy.build(CATALOG, [], {"rules": [rule]}, VIEW)["checks"])

    def test_skipped_checks_are_not_passes_or_failed_ledger_entries(self):
        check = {"id": "radius", "title": "모서리", "symptom": "radius-heavy", "level": "skip", "summary": "선택 없음", "samples": []}
        rules = {"rules": [{"title": "모서리 규칙", "status": "확정", "symptoms": ["radius-heavy"]}]}
        checks, unmeasured = lint.annotate(lint.merge([("light", "라이트", {"checks": [check]})]), {"symptoms": []}, rules)
        report = lint.format_report("example", ["라이트"], checks, unmeasured, [])
        self.assertIn("통과 0, 미판정 1", report)
        self.assertEqual(unmeasured, ["모서리 규칙"])
        self.assertEqual(lint.lint_record("example", [], checks)["fail"], [])
        self.assertEqual(lint.lint_record("example", [], checks)["warn"], [])

    def test_merge_keeps_the_failed_views_own_selected_value_and_advice(self):
        base = {"id": "radius", "title": "모서리", "symptom": "radius-heavy", "samples": []}
        merged, = lint.merge([
            ("light", "라이트", {"checks": [{**base, "level": "pass", "summary": "12px", "fix": "12px"}]}),
            ("dark", "다크", {"checks": [{**base, "level": "fail", "summary": "6px", "fix": "6px"}]}),
        ])
        self.assertEqual(merged["fix"], "6px")
        self.assertEqual(merged["scenarios"], ["다크"])

    def test_partial_skips_remain_visible_and_have_no_old_repair_advice(self):
        check = {"id": "radius", "title": "모서리", "symptom": "radius-heavy", "summary": "", "samples": []}
        checks = lint.merge([
            ("light", "라이트", {"checks": [{**check, "level": "pass"}]}),
            ("dark", "다크", {"checks": [{**check, "level": "skip"}]}),
        ])
        checks, unmeasured = lint.annotate(checks, {"symptoms": []}, {"rules": []})
        self.assertEqual(checks[0]["skipped_scenarios"], ["다크"])
        self.assertIn("모서리: 다크", lint.format_report("example", ["라이트", "다크"], checks, unmeasured, []))
        skipped, _ = lint.annotate([{**check, "level": "skip"}],
            {"symptoms": [{"id": "radius-heavy", "label": "둥글다", "fix": "예전 개인 기준"}]}, {"rules": []})
        self.assertIsNone(skipped[0]["fix"])

    def test_unreadable_catalog_does_not_fall_back_to_old_personal_limits(self):
        with patch.object(lint, "measure", side_effect=ValueError("카탈로그 형식 오류")), \
                patch.object(lint.store, "log_lint") as log, redirect_stderr(io.StringIO()) as errors:
            code = lint.main(["http://localhost:3000"])
        self.assertEqual(code, 2)
        self.assertIn("카탈로그 형식 오류", errors.getvalue())
        log.assert_not_called()
