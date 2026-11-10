"""시편 평가가 컴포넌트 취향으로 바뀌고 훅으로 주입되는 계약을 임시 원장과 임시 카탈로그에서 검사한다."""

import io
import json
import os
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

TASTE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TASTE_ROOT))

import taste
from tastelib import context, lab, store

CATALOG = {
    "version": 1,
    "components": [
        {
            "id": "tabs",
            "label": "탭",
            "file": "src/specimens/components/Tabs.tsx",
            "aliases": ["탭 ?(전환|메뉴)", "\\btabs?\\b"],
            "dimensions": [
                {
                    "id": "indicator", "label": "선택 표시", "question": "?",
                    "values": [
                        {"id": "underline", "label": "밑줄", "spec": "2px 밑줄"},
                        {"id": "pill", "label": "바탕 면", "spec": "옅은 면"},
                        {"id": "weight", "label": "글자만", "spec": "굵은 글자"},
                    ],
                },
                {
                    "id": "travel", "label": "표시 이동", "question": "?",
                    "requires": {"indicator": ["underline", "pill"]},
                    "values": [
                        {"id": "slide", "label": "미끄러짐", "spec": "200ms 이동"},
                        {"id": "instant", "label": "바로", "spec": "즉시"},
                    ],
                },
                {
                    "id": "panel", "label": "패널 전환", "question": "?",
                    "values": [
                        {"id": "fade", "label": "겹쳐 교체", "spec": "120ms"},
                        {"id": "instant", "label": "바로", "spec": "즉시"},
                    ],
                },
            ],
        },
        {
            "id": "dialog",
            "label": "대화상자",
            "file": "src/specimens/components/Dialog.tsx",
            "aliases": ["모달"],
            "dimensions": [
                {
                    "id": "enter", "label": "등장", "question": "?",
                    "values": [
                        {"id": "scale", "label": "커지며", "spec": "0.96에서 1"},
                        {"id": "fade", "label": "흐려졌다", "spec": "opacity만"},
                    ],
                },
            ],
        },
    ],
}


class LabTestCase(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="taste-lab-test-")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.state = root / "state"
        self.state.mkdir()
        self.labs = root / "labs"
        (self.labs / "src" / "specimens").mkdir(parents=True)
        self.write_catalog(CATALOG)
        patches = [
            patch.multiple(
                store,
                STATE_DIR=str(self.state),
                RULES_PATH=str(self.state / "rules.json"),
                SYMPTOMS_PATH=str(self.state / "symptoms.json"),
                VERDICTS_PATH=str(self.state / "verdicts.jsonl"),
                DELIVERIES_PATH=str(self.state / "deliveries.jsonl"),
            ),
            patch.multiple(lab, LABS_DIR=str(self.labs), JUDGMENTS_PATH=str(self.state / "judgments.jsonl")),
            patch.multiple(taste, LOG_PATH=str(self.state / "server.log"), HOOK_LOG_PATH=str(self.state / "hook.log")),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        rules = {"rules": [
            {"id": "surface-grouping", "axis": "surface", "status": "확정", "title": "여백으로 묶기",
             "avoid": "과한 테두리", "do": "여백으로 구분", "symptoms": ["border-heavy"]},
            {"id": "tabs-scroll", "axis": "layout", "status": "확정", "component": "tabs", "title": "탭은 넘치면 가로 스크롤",
             "avoid": "탭을 두 줄로 접기", "do": "한 줄을 유지하고 가로 스크롤", "symptoms": []},
        ]}
        symptoms = {"symptoms": [
            {"id": "motion-broken", "aliases": ["뚝뚝"], "label": "끊기는 전환", "term": "모션 불연속",
             "fix": "위치를 잇는다", "check": "중간 프레임 확인"},
        ]}
        (self.state / "rules.json").write_text(json.dumps(rules, ensure_ascii=False), encoding="utf-8")
        (self.state / "symptoms.json").write_text(json.dumps(symptoms, ensure_ascii=False), encoding="utf-8")

    def write_catalog(self, catalog):
        path = self.labs / "src" / "specimens" / "catalog.json"
        path.write_text(json.dumps(catalog, ensure_ascii=False) if isinstance(catalog, dict) else catalog, encoding="utf-8")

    def judge(self, dimension, outcome, choice=None, options=None, component="tabs", note=""):
        values = {d["id"]: [v["id"] for v in d["values"]] for c in CATALOG["components"] for d in c["dimensions"]
                  if c["id"] == component}
        return lab.record_judgment({
            "component": component, "dimension": dimension, "options": options or values[dimension][:3],
            "outcome": outcome, "choice": choice, "note": note,
        })

    def tabs_state(self):
        return next(c for c in lab.lab_state()["components"] if c["id"] == "tabs")

    def run_hook(self, prompt, session="s1"):
        """판정 기록 훅. 2026-10-22부터 아무것도 출력하지 않는다."""
        payload = {"prompt": prompt, "session_id": session, "cwd": "/tmp/project"}
        output = io.StringIO()
        with (
            patch.object(sys, "stdin", io.StringIO(json.dumps(payload, ensure_ascii=False))),
            patch.object(sys, "argv", ["taste.py", "hook", "--surface", "claude"]),
            redirect_stdout(output),
        ):
            taste.main()
        return output.getvalue()

    def apply(self, request="", components="", session="s1"):
        """/taste 적용. 스킬이 실행하는 apply-context의 출력"""
        argv = ["taste.py", "apply-context", "--request", request, "--session", session]
        if components:
            argv += ["--components", components]
        output = io.StringIO()
        with patch.object(sys, "argv", argv), redirect_stdout(output):
            taste.main()
        return output.getvalue()


class PreferenceTests(LabTestCase):
    def status(self, dimension="indicator"):
        return self.tabs_state()["preferences"][dimension]

    def test_status_moves_from_unseen_to_confirmed_only_when_two_choices_agree(self):
        self.assertEqual(self.status()["status"], "미평가")
        self.assertEqual(self.status()["value"], "underline", "고른 적 없으면 카탈로그의 첫 값을 쓴다")
        self.judge("indicator", "chose", "pill")
        self.assertEqual((self.status()["status"], self.status()["value"]), ("관찰", "pill"))
        self.judge("indicator", "chose", "underline")
        self.assertEqual((self.status()["status"], self.status()["value"]), ("관찰", "underline"))
        self.judge("indicator", "same")
        self.judge("indicator", "chose", "underline")
        self.assertEqual((self.status()["status"], self.status()["value"]), ("확정", "underline"))

    def test_indifference_and_rejection(self):
        self.judge("panel", "same")
        self.assertEqual(self.status("panel")["status"], "미평가")
        self.judge("panel", "same")
        self.assertEqual(self.status("panel")["status"], "무관")
        self.judge("indicator", "chose", "pill")
        self.judge("indicator", "none", note="둘 다 너무 무겁다")
        pref = self.status()
        self.assertEqual((pref["status"], pref["value"]), ("새 값 필요", "pill"))
        self.assertEqual(pref["notes"], ["둘 다 너무 무겁다"])

    def test_revised_value_is_asked_again_once(self):
        for dimension, value in (("indicator", "pill"), ("travel", "slide"), ("panel", "fade")) * 2:
            self.judge(dimension, "chose", value)
        self.assertEqual(self.status()["status"], "확정")
        self.assertIsNone(self.tabs_state()["next"])
        revised = json.loads(json.dumps(CATALOG))
        revised["components"][0]["dimensions"][0]["values"][1]["spec"] = "옅은 면, 이동 중 겹침을 줄임"
        self.write_catalog(revised)
        pref = self.status()
        self.assertEqual((pref["status"], pref["value"], pref["changed"]), ("관찰", "pill", True))
        self.assertEqual(self.tabs_state()["next"]["dimension"], "indicator", "고친 값을 다시 묻는다")
        self.judge("indicator", "chose", "pill")
        pref = self.status()
        self.assertEqual((pref["status"], pref["changed"]), ("확정", False), "고친 구현을 한 번 더 고르면 확정으로 돌아온다")

    def test_rejected_dimension_is_asked_again_with_only_the_values_added_after(self):
        self.judge("panel", "chose", "fade")
        self.judge("panel", "none", note="둘 다 어색함")
        self.assertEqual(self.status("panel")["status"], "새 값 필요")
        revised = json.loads(json.dumps(CATALOG))
        revised["components"][0]["dimensions"][2]["values"] += [
            {"id": "mark", "label": "표시만", "spec": "바뀐 행만 표시"},
            {"id": "wave", "label": "물결", "spec": "행마다 차례로"},
        ]
        self.write_catalog(revised)
        pref = self.status("panel")
        self.assertEqual((pref["status"], pref["value"], pref["offer"]), ("미평가", "mark", ["mark", "wave"]))
        self.judge("indicator", "chose", "pill")
        self.judge("travel", "chose", "slide")
        self.assertEqual(self.tabs_state()["next"]["options"], ["mark", "wave"], "거절한 값은 다시 보여 주지 않는다")
        lab.record_judgment({"component": "tabs", "dimension": "panel", "options": ["mark", "wave"],
                             "outcome": "chose", "choice": "wave"})
        pref = self.status("panel")
        self.assertEqual((pref["status"], pref["value"]), ("관찰", "wave"), "거절 전의 선택(fade)과 묶어 확정하지 않는다")
        self.assertEqual(pref["offer"], ["mark", "wave"])

    def test_dimension_that_does_not_apply_is_not_asked(self):
        self.judge("indicator", "chose", "weight")
        state = self.tabs_state()
        self.assertEqual(state["preferences"]["travel"]["status"], "해당 없음")
        self.assertEqual(state["next"]["dimension"], "panel")


class ConditionTests(LabTestCase):
    MOBILE = {"theme": "light", "frame": "mobile"}

    def judge_in(self, choice, theme="light", frame="desktop", dimension="indicator", outcome="chose"):
        return lab.record_judgment({
            "component": "tabs", "dimension": dimension, "options": ["underline", "pill", "weight"],
            "outcome": outcome, "choice": choice, "conditions": {"theme": theme, "frame": frame},
        })

    def prefs(self):
        return self.tabs_state()["preferences"]["indicator"]

    def test_conditions_seen_before_confirmation_are_all_base(self):
        self.judge_in("underline", theme="dark")
        self.judge_in("underline", frame="mobile")
        pref = self.prefs()
        self.assertEqual((pref["status"], pref["value"]), ("확정", "underline"))
        self.assertEqual(pref["conditions"], {"theme": ["dark", "light"], "frame": ["desktop", "mobile"]})
        tabs = next(c for c in lab.lab_state("tabs", self.MOBILE)["components"] if c["id"] == "tabs")
        self.assertNotEqual(tabs["next"]["dimension"], "indicator", "기준 조건 안에서는 다시 묻지 않는다")

    def test_recheck_is_asked_only_for_the_opened_component_in_the_viewed_condition(self):
        self.judge_in("underline")
        self.judge_in("underline")
        for name in ("travel", "panel"):
            for _ in range(2):
                self.judge(name, "same")
        self.assertIsNone(self.tabs_state()["next"], "조건 없이 부르면 재확인은 없다")
        queue = lab.lab_state("", self.MOBILE)["queue"]
        self.assertFalse(any("recheck" in c for c in queue), "연 컴포넌트가 아니면 재확인을 묻지 않는다")
        comparison = lab.lab_state("tabs", self.MOBILE)["queue"][0]
        self.assertEqual(comparison["dimension"], "indicator")
        self.assertEqual(comparison["recheck"], {"key": "mobile", "label": "휴대폰 폭", "base": "underline"})
        self.assertEqual(comparison["options"], ["underline", "pill", "weight"])

    def test_other_value_in_recheck_does_not_overwrite_the_base_value(self):
        self.judge_in("underline")
        self.judge_in("underline")
        self.judge_in("pill", frame="mobile")
        self.judge_in("pill", frame="mobile")
        pref = self.prefs()
        self.assertEqual((pref["status"], pref["value"]), ("확정", "underline"))
        self.assertEqual((pref["variants"]["mobile"]["status"], pref["variants"]["mobile"]["value"]), ("확정", "pill"))
        tabs = next(c for c in lab.lab_state("tabs", self.MOBILE)["components"] if c["id"] == "tabs")
        self.assertEqual(tabs["params"]["indicator"], "pill", "보고 있는 조건의 값으로 그린다")
        self.assertEqual(self.tabs_state()["params"]["indicator"], "underline")
        context = self.apply("탭 전환 다시 만들어줘")
        self.assertIn("- 선택 표시: 밑줄. 2px 밑줄", context)
        self.assertIn("  - 휴대폰 폭에서는: 바탕 면. 옅은 면", context)
        self.assertIn("    - 휴대폰 폭에서는: 바탕 면 (확정, 2번 고름). 옅은 면", "\n".join(lab.block_lines(lab.load_catalog(), lab.load_judgments())))

    def test_base_conditions_do_not_widen_after_the_first_confirmation(self):
        self.judge_in("underline")
        self.judge_in("underline")
        self.judge_in("pill", frame="mobile")
        self.judge_in("weight")
        # 기준이 관찰로 돌아간 동안 평가 화면은 기준 비교를 묻는다. 휴대폰 폭에서 고른 답도 기준으로 센다
        self.judge_in("pill", frame="mobile")
        pref = self.prefs()
        self.assertEqual((pref["status"], pref["value"]), ("관찰", "pill"))
        self.assertEqual(pref["conditions"], {"theme": ["light"], "frame": ["desktop"]})
        self.assertEqual(lab.variant_key("light", "mobile", pref["conditions"]), "mobile", "휴대폰 폭은 계속 재확인 조건이다")
        self.assertEqual(pref["variants"]["mobile"]["value"], "pill")

    def test_recheck_skips_dimension_that_the_rechecked_value_turns_off(self):
        self.judge_in("underline")
        self.judge_in("underline")
        for _ in range(2):
            self.judge("travel", "chose", "slide")
        self.judge_in("weight", frame="mobile")
        comparison = lab.lab_state("tabs", self.MOBILE)["queue"][0]
        self.assertNotEqual(comparison["dimension"], "travel", "휴대폰 폭에서 글자만을 골랐으면 표시 이동은 묻지 않는다")

    def test_phone_specimen_counts_every_screen_width_as_phone(self):
        catalog = json.loads(json.dumps(CATALOG))
        next(c for c in catalog["components"] if c["id"] == "tabs")["frame"] = "phone"
        self.write_catalog(catalog)
        dark_mobile = {"theme": "dark", "frame": "mobile"}
        self.judge_in("underline", theme="dark")
        self.judge_in("underline", theme="dark")
        pref = self.prefs()
        self.assertEqual(pref["conditions"], {"theme": ["dark"], "frame": ["mobile"]}, "휴대폰 틀을 그린 시편은 휴대폰에서 본 판정이다")
        self.assertEqual(lab.load_judgments()[0]["conditions"]["frame"], "desktop", "기록은 평가 화면의 조건 그대로 남긴다")
        tabs = next(c for c in lab.lab_state("tabs", dark_mobile)["components"] if c["id"] == "tabs")
        self.assertNotEqual(tabs["next"]["dimension"], "indicator", "M으로 바꿔도 같은 차원을 다시 묻지 않는다")
        self.judge_in("pill", theme="dark", frame="mobile")
        self.judge_in("pill", theme="dark", frame="mobile")
        pref = self.prefs()
        self.assertEqual((pref["status"], pref["value"], pref["variants"]), ("확정", "pill", {}), "M에서 고른 값도 기준으로 센다")
        for name in ("travel", "panel"):
            for _ in range(2):
                self.judge(name, "same")
        comparison = lab.lab_state("tabs", {"theme": "light", "frame": "desktop"})["queue"][0]
        self.assertEqual(comparison["recheck"]["key"], "light", "테마 재확인은 그대로 묻는다")

    def test_catalog_rejects_unknown_frame(self):
        catalog = json.loads(json.dumps(CATALOG))
        catalog["components"][0]["frame"] = "tablet"
        self.write_catalog(catalog)
        with self.assertRaises(ValueError):
            lab.load_catalog()

    def test_same_value_in_recheck_is_noted_on_the_base_line(self):
        self.judge_in("underline", theme="dark")
        self.judge_in("underline", theme="dark")
        self.judge_in("underline", theme="light")
        self.judge_in("underline", theme="light")
        self.assertEqual(self.prefs()["variants"]["light"]["status"], "확정")
        context = self.apply("탭 전환 다시 만들어줘")
        self.assertIn("- 선택 표시: 밑줄. 2px 밑줄", context)
        self.assertNotIn("라이트에서는", context, "기준과 같은 값을 고른 조건은 따로 적지 않는다")


class QueueTests(LabTestCase):
    def test_asks_unseen_dimensions_in_catalog_order_with_current_values_held(self):
        first = self.tabs_state()["next"]
        self.assertEqual(first["dimension"], "indicator")
        self.assertEqual(first["options"], ["underline", "pill", "weight"])
        self.judge("indicator", "chose", "pill")
        second = self.tabs_state()["next"]
        self.assertEqual(second["dimension"], "travel")
        self.assertEqual(second["params"], {"indicator": "pill", "panel": "fade"})

    def test_rechecks_watched_dimension_after_unseen_ones(self):
        self.judge("indicator", "chose", "pill")
        self.judge("travel", "chose", "slide")
        self.judge("panel", "chose", "fade")
        self.assertEqual(self.tabs_state()["next"]["dimension"], "indicator", "가장 오래전에 고른 관찰 차원")
        for dimension, value in (("indicator", "pill"), ("travel", "slide"), ("panel", "fade")):
            self.judge(dimension, "chose", value)
        self.assertIsNone(self.tabs_state()["next"])

    def test_single_same_does_not_repeat_the_same_comparison_immediately(self):
        self.judge("indicator", "same")
        self.assertEqual(self.tabs_state()["next"]["dimension"], "travel")

    def test_requested_component_comes_first_then_recent_demand(self):
        self.assertEqual(lab.lab_state("dialog")["queue"][0]["component"], "dialog")
        store.log_delivery("hook-component", session="x", components=["dialog"])
        self.assertEqual(lab.lab_state()["queue"][0]["component"], "dialog")

    def test_rejects_judgments_that_do_not_match_the_catalog(self):
        bad = [
            {"component": "nope", "dimension": "indicator", "options": ["underline", "pill"], "outcome": "same"},
            {"component": "tabs", "dimension": "nope", "options": ["underline", "pill"], "outcome": "same"},
            {"component": "tabs", "dimension": "indicator", "options": ["underline", "glow"], "outcome": "same"},
            {"component": "tabs", "dimension": "indicator", "options": ["underline"], "outcome": "same"},
            {"component": "tabs", "dimension": "indicator", "options": ["underline", "pill"], "outcome": "chose",
             "choice": "weight"},
            {"component": "tabs", "dimension": "indicator", "options": ["underline", "pill"], "outcome": "maybe"},
        ]
        for body in bad:
            with self.subTest(body=body), self.assertRaises(ValueError):
                lab.record_judgment(body)
        self.assertEqual(lab.load_judgments(), [])

    def test_judgment_keeps_what_was_compared_and_can_be_undone(self):
        judgment = self.judge("indicator", "chose", "pill", options=["underline", "pill"])
        self.assertEqual(judgment["specs"], {"underline": "2px 밑줄", "pill": "옅은 면"})
        self.assertEqual(judgment["conditions"], {"theme": "light", "frame": "desktop", "slow": False})
        lab.undo_judgment(judgment["id"])
        self.assertEqual(lab.load_judgments(), [])
        with self.assertRaises(LookupError):
            lab.undo_judgment(judgment["id"])


class ApplyContextTests(LabTestCase):
    def test_component_without_judgments_asks_agent_to_offer_evaluation(self):
        context = self.apply("탭 메뉴 만들어줘")
        rules_part = context.split("### 규칙")[1]
        component_part = context.split("### 컴포넌트: 탭")[1].split("### 규칙")[0]
        self.assertIn("아직 고른 값이 없다", component_part)
        self.assertNotIn("참고 구현", component_part, "고른 값이 없을 때 시편 기본값을 취향처럼 넘기지 않는다")
        self.assertIn("taste.py lab tabs", component_part)
        self.assertIn("- 규칙 탭은 넘치면 가로 스크롤", component_part, "컴포넌트 범위 규칙은 컴포넌트 절에 들어간다")
        self.assertIn("여백으로 묶기", rules_part)
        self.assertNotIn("탭은 넘치면 가로 스크롤", rules_part)
        delivery, = store.load_deliveries()
        self.assertEqual(delivery["via"], "skill")
        self.assertEqual(delivery["session"], "s1")
        self.assertEqual(delivery["components"], ["tabs"])
        self.assertEqual(delivery["rules"], ["surface-grouping", "tabs-scroll"])

    def test_handoff_implement_records_its_own_channel_with_session_and_surface(self):
        argv = [
            "taste.py", "apply-context", "--request", "탭 메뉴 구현", "--session", "codex-s1",
            "--surface", "codex", "--via", "handoff-implement",
        ]
        output = io.StringIO()
        with patch.object(sys, "argv", argv), redirect_stdout(output):
            taste.main()
        self.assertNotIn("lint <url>", output.getvalue())
        self.assertIn("코드", output.getvalue().split("### 끝나면")[1])
        delivery, = store.load_deliveries()
        self.assertEqual(
            (delivery["via"], delivery["session"], delivery["surface"]), ("handoff-implement", "codex-s1", "codex"),
        )
        self.assertEqual(delivery["components"], ["tabs"])

    def test_judged_values_are_plain_lines_with_reference_code(self):
        self.judge("indicator", "chose", "underline")
        self.judge("indicator", "chose", "underline")
        self.judge("panel", "same")
        self.judge("panel", "same")
        context = self.apply(components="tabs")
        self.assertIn("- 선택 표시: 밑줄. 2px 밑줄", context)
        self.assertNotIn("(확정", context, "에이전트에게 고른 횟수는 필요 없다")
        self.assertIn("- 상관없음: 패널 전환", context)
        self.assertIn("- 아직 모름: 표시 이동", context)
        self.assertIn("- 규칙 탭은 넘치면 가로 스크롤", context, "고른 값이 있으면 컴포넌트 범위 규칙도 붙는다")
        self.assertIn("src/specimens/components/Tabs.tsx", context)
        self.assertIn('"indicator": "underline"', context)
        self.assertIn("숫자가 겹치면 컴포넌트 값, 화면 전체 값, 모션 기본값, 규칙 순서로 앞선다", context)
        self.assertNotIn("### 컴포넌트: 대화상자", context, "요청에 없는 컴포넌트는 이름만 알린다")
        self.assertIn("대화상자(dialog)", context.split("### 다른 컴포넌트")[1])

    def test_compared_curve_wins_over_global_curve_for_that_component(self):
        tempo = {
            "id": "tempo", "label": "성격", "question": "?",
            "values": [
                {"id": "brisk", "label": "짧게", "spec": "200ms cubic-bezier(0.2, 0, 0, 1)"},
                {"id": "smooth", "label": "느긋하게", "spec": "300ms ease"},
            ],
        }
        dialog = {**CATALOG["components"][1]}
        dialog["dimensions"] = [*dialog["dimensions"], tempo]
        self.write_catalog({**CATALOG, "components": [CATALOG["components"][0], dialog]})
        for _ in range(2):
            self.judge("tempo", "chose", "smooth", options=["brisk", "smooth"], component="dialog")
        context = self.apply("모달 만들어줘")
        self.assertIn("- 곡선: 모션 기본값의 곡선을 쓴다", context, "비교하지 않은 곡선 표기가 전역 선택을 덮지 않는다")
        dialog["dimensions"][-1] = {**tempo, "curve": True}
        self.write_catalog({**CATALOG, "components": [CATALOG["components"][0], dialog]})
        context = self.apply("모달 만들어줘", session="s2")
        self.assertIn("- 곡선과 길이: 이 컴포넌트는 '성격' 값을 쓴다", context)
        self.assertNotIn("- 곡선: 모션 기본값의 곡선을 쓴다", context)

    def test_hook_only_records_component_verdict_which_apply_shows(self):
        self.assertEqual(self.run_hook("탭 전환이 뚝뚝 끊겨요"), "", "훅은 대화에 아무것도 넣지 않는다")
        self.assertEqual(self.run_hook("탭 메뉴 만들어줘"), "")
        verdict, = store.load_verdicts()
        self.assertEqual(verdict["components"], ["tabs"])
        self.assertEqual(verdict["symptoms"], ["motion-broken"])
        self.assertEqual(store.load_deliveries(), [])
        self.judge("indicator", "chose", "pill")
        self.assertIn("- 이 컴포넌트에 나온 판정", self.apply("탭 메뉴 손봐줘"))

    def test_names_in_paths_do_not_count_as_component_requests(self):
        self.assertNotIn("### 컴포넌트:", self.apply("src/specimens/tabs/index.ts 경로만 알려줘"))

    def test_broken_catalog_keeps_rules(self):
        self.write_catalog("{broken")
        context = self.apply("랜딩 디자인 만들어줘 탭 전환 포함")
        self.assertIn("여백으로 묶기", context)
        self.assertNotIn("### 컴포넌트:", context)

    def test_block_lists_component_choices(self):
        self.judge("indicator", "chose", "pill")
        block = store.build_block(store.load_rules(), [], "agent", store.load_symptoms(), lab.safe_block_lines())
        self.assertIn("### 컴포넌트별로 고른 값 (labs 시편 비교)", block)
        self.assertIn("  - 선택 표시: 바탕 면 (관찰). 옅은 면", block)
        rules_part, component_part = block.split("### 컴포넌트별로 고른 값")
        self.assertNotIn("탭은 넘치면 가로 스크롤", rules_part)
        self.assertIn("- tabs 규칙 탭은 넘치면 가로 스크롤", component_part)


SURFACE = {
    "id": "surface",
    "label": "화면 표면",
    "scope": "global",
    "axis": "visual",
    "file": "src/specimens/components/Surface.tsx",
    "aliases": [],
    "dimensions": [
        {
            "id": "radius", "label": "모서리", "question": "?",
            "values": [
                {"id": "sharp", "label": "거의 각짐", "spec": "반경 2px"},
                {"id": "soft", "label": "둥글게", "spec": "면 12px"},
            ],
        },
        {
            "id": "ground", "label": "바탕색", "question": "?",
            "values": [
                {"id": "neutral", "label": "순수 회색", "spec": "채도 없음"},
                {"id": "warm", "label": "종이 회색", "spec": "살짝 노랑"},
            ],
        },
    ],
}


class GlobalSpecimenTests(LabTestCase):
    def setUp(self):
        super().setUp()
        self.write_catalog({**CATALOG, "components": [SURFACE, *CATALOG["components"]]})

    def judge_surface(self, dimension, choice):
        values = [v["id"] for d in SURFACE["dimensions"] if d["id"] == dimension for v in d["values"]]
        lab.record_judgment({"component": "surface", "dimension": dimension, "options": values,
                             "outcome": "chose", "choice": choice})

    def test_unjudged_global_specimen_offers_evaluation(self):
        context = self.apply("설정 화면 디자인 다듬어줘")
        global_part = context.split("### 화면 전체 값")[1].split("### 규칙")[0]
        self.assertIn("아직 고른 값 없음: 화면 표면", global_part)
        self.assertIn("taste.py lab surface", global_part)
        self.assertNotIn("### 컴포넌트:", context, "전역 시편은 컴포넌트 절로 넣지 않는다")
        delivery, = store.load_deliveries()
        self.assertEqual(delivery["specimens"], ["surface"])
        self.assertNotIn("components", delivery, "전역 값은 컴포넌트 수요로 세지 않는다")

    def test_visual_and_motion_values_come_together_whatever_the_wording(self):
        feel = {**SURFACE, "id": "motion-feel", "label": "모션 성격", "axis": "motion",
                "file": "src/specimens/components/MotionFeel.tsx"}
        self.write_catalog({**CATALOG, "components": [SURFACE, feel, *CATALOG["components"]]})
        context = self.apply("전환 애니메이션만 고쳐줘")
        self.assertIn("### 화면 전체 값", context)
        self.assertIn("### 모션 기본값", context)

    def test_catalog_requires_axis_on_global_specimen(self):
        self.write_catalog({**CATALOG, "components": [{k: v for k, v in SURFACE.items() if k != "axis"}]})
        with self.assertRaises(ValueError):
            lab.load_catalog()

    def test_judged_global_values_lead_the_context(self):
        self.judge_surface("radius", "soft")
        self.judge_surface("radius", "soft")
        context = self.apply("대시보드 레이아웃 만들어줘")
        global_part = context.split("### 화면 전체 값")[1].split("### 규칙")[0]
        self.assertIn("- 모서리: 둥글게. 면 12px", global_part)
        self.assertIn("- 아직 모름: 바탕색", global_part)

    def test_component_exception_rides_with_the_global_value_it_overrides(self):
        self.judge_surface("radius", "soft")
        rules = store.load_rules()
        rules["rules"].append({
            "id": "dialog-sharp", "axis": "surface", "status": "확정", "component": "dialog", "overrides": "surface",
            "title": "대화상자는 각지게", "avoid": "둥근 대화상자", "do": "반경 2px", "symptoms": [],
        })
        store.save_rules(rules)
        global_part = self.apply("설정 화면 디자인 다듬어줘").split("### 화면 전체 값")[1].split("### 규칙")[0]
        self.assertIn("- 예외 대화상자: 대화상자는 각지게: 피할 것 둥근 대화상자 / 할 것 반경 2px", global_part,
                      "요청에 대화상자가 없어도 전역 값과 함께 예외를 알린다")
        self.assertIn("dialog-sharp", store.load_deliveries()[0]["rules"])

    def test_block_marks_global_choices(self):
        self.judge_surface("ground", "neutral")
        self.assertIn("- 화면 표면 (전역, 모든 화면)", lab.safe_block_lines())

    def test_catalog_rejects_aliases_on_global_specimen(self):
        self.write_catalog({**CATALOG, "components": [{**SURFACE, "aliases": ["설정"]}]})
        with self.assertRaises(ValueError):
            lab.load_catalog()


class SummaryTests(LabTestCase):
    def test_dormant_only_after_thirty_quiet_days_since_catalog_edit(self):
        catalog = lab.load_catalog()
        self.assertFalse(lab.summary(catalog, [], [])["dormant"], "방금 만든 시편은 휴면이 아니다")
        old = time.time() - 31 * 86400
        os.utime(lab.catalog_path(), (old, old))
        self.assertTrue(lab.summary(catalog, [], [])["dormant"])
        store.log_delivery("hook-component", session="x", components=["tabs"])
        self.assertFalse(lab.summary(catalog, [], store.load_deliveries())["dormant"])


class RetagTests(LabTestCase):
    def test_retag_fills_missing_component_tags_without_touching_decisions(self):
        base = {"ts": "2026-10-05T00:00:00+00:00", "source": "codex", "session": "", "project": "", "context": "",
                "symptoms": [], "polarity": "negative", "origin": "harvest"}
        store.save_verdicts([
            {**base, "id": "old", "text": "탭 전환이 어색", "status": "kept"},
            {**base, "id": "edited", "text": "탭 메뉴가 별로", "status": "kept", "components": []},
        ])
        with redirect_stdout(io.StringIO()), patch.object(sys, "argv", ["taste.py", "retag"]):
            taste.main()
        old, edited = store.load_verdicts()
        self.assertEqual((old["components"], old["status"]), (["tabs"], "kept"))
        self.assertEqual(edited["components"], [], "이미 태그 필드가 있으면 그대로 둔다")


class ServerVersionTests(unittest.TestCase):
    """원장 서버는 백그라운드로 남기 때문에 pull 뒤에도 옛 코드로 계산할 수 있다(2026-10-19 정렬 바꿈 비교가 안 뜬 원인)."""

    def ensure(self, running):
        with (
            patch.object(taste.server, "code_version", return_value="new"),
            patch.object(taste, "_running_server", side_effect=running) as ping,
            patch.object(taste, "_stop_pid") as stop_pid,
            patch.object(taste, "_start_background") as start,
            patch.object(taste, "_wait_until_running", return_value=True),
            redirect_stdout(io.StringIO()),
        ):
            taste._ensure_server(4870)
        return ping, stop_pid, start

    def test_restarts_server_that_runs_other_code(self):
        _, stop_pid, start = self.ensure([{"code": "", "pid": None, "root": store.ROOT, "data": store.DATA_ROOT}, None])
        stop_pid.assert_called_once()
        start.assert_called_once_with(4870)

    def test_keeps_server_that_runs_current_code(self):
        _, stop_pid, start = self.ensure([{"code": "new", "pid": 1, "root": store.ROOT, "data": store.DATA_ROOT}])
        stop_pid.assert_not_called()
        start.assert_not_called()

    def test_starts_server_when_none_runs(self):
        _, _, start = self.ensure([None])
        start.assert_called_once_with(4870)


class ExtendedCatalogTests(LabTestCase):
    def test_rejected_many_options_reopens_with_combined_choices(self):
        catalog = json.loads((TASTE_ROOT / "lab/src/specimens/catalog.json").read_text())
        self.write_catalog(catalog)
        note = "검색과 분류를 함께 보고 싶음"
        rejection = lab.record_judgment({
            "component": "manyoptions", "dimension": "kind",
            "options": ["search", "groups"], "outcome": "none", "note": note,
        })
        state = next(component for component in lab.lab_state("manyoptions")["components"] if component["id"] == "manyoptions")
        self.assertEqual(state["preferences"]["kind"]["status"], "미평가")
        self.assertEqual(state["next"]["options"], ["searchgroups", "searchfold"])
        self.assertEqual(state["preferences"]["kind"]["notes"], [note])
        for _ in range(2):
            lab.record_judgment({
                "component": "manyoptions", "dimension": "kind",
                "options": ["searchgroups", "searchfold"],
                "outcome": "chose", "choice": "searchfold",
            })
        judgments = lab.load_judgments()
        self.assertEqual(judgments[0], rejection)
        component = next(component for component in catalog["components"] if component["id"] == "manyoptions")
        pref = lab.component_preferences(component, judgments)["kind"]
        self.assertEqual((pref["status"], pref["value"]), ("확정", "searchfold"))

    def test_choices_persist_and_reach_only_requested_components(self):
        catalog = json.loads((TASTE_ROOT / "lab/src/specimens/catalog.json").read_text())
        self.write_catalog(catalog)
        components = {component["id"]: component for component in catalog["components"]}
        ids = ("codeblock", "sectionguide", "questiondial", "conversation", "articleaside", "article", "postlist", "posttransition", "formdialog", "longformdialog", "stepformdialog", "formclose", "formfailure", "manyoptions", "listdetail", "manyfilters", "mobiletable", "rapidtabs", "mobiledialog", "mobileform", "mobilepage", "mobilereading", "screen-worklist", "screen-detail", "screen-settings", "screen-reading", "screen-create", "screen-assistant")

        def choose(component, dimension):
            body = {
                "component": component["id"], "dimension": dimension["id"],
                "options": [value["id"] for value in dimension["values"]],
                "outcome": "chose", "choice": dimension["values"][1]["id"],
                "conditions": {"theme": "dark", "frame": "mobile"},
            }
            lab.record_judgment(body)
            return lab.record_judgment(body)

        original = components["reading"]
        choose(original, original["dimensions"][0])
        original_records = lab.load_judgments()
        for component_id in ids:
            with self.subTest(component=component_id):
                component = components[component_id]
                for dimension in component["dimensions"]:
                    record = choose(component, dimension)
                    self.assertEqual(record["specs"][record["choice"]], dimension["values"][1]["spec"])
                judgments = lab.load_judgments()
                prefs = lab.component_preferences(component, judgments)
                for dimension in component["dimensions"]:
                    self.assertEqual(prefs[dimension["id"]]["status"], "확정")
                    self.assertEqual(prefs[dimension["id"]]["value"], dimension["values"][1]["id"])
                text, used = context.build(catalog, judgments, {"rules": []}, [], {"symptoms": []}, component_ids=[component_id])
                self.assertEqual(used["components"], [component_id])
                self.assertIn(f"### 컴포넌트: {component['label']}", text)
                doc = context.component_doc(component, judgments, [], [])
                for dimension in component["dimensions"]:
                    self.assertIn(dimension["values"][1]["spec"], doc)
        self.assertEqual(lab.load_judgments()[:len(original_records)], original_records)
        self.assertEqual(lab.component_preferences(original, lab.load_judgments())[original["dimensions"][0]["id"]]["status"], "확정")


class RealCatalogTests(unittest.TestCase):
    def test_labs_catalog_is_valid_when_present(self):
        if not Path(lab.catalog_path()).exists():
            self.skipTest("labs 카탈로그가 없는 머신")
        catalog = lab.load_catalog()
        match = lab.component_matcher(catalog)
        self.assertEqual(match("탭 키로 이동이 안 돼요"), [])
        self.assertEqual(match("tabindex 수정"), [])
        self.assertEqual(match("세부 정보 보기/접기 애니메이션이 어색함"), ["disclosure"])
        self.assertEqual(match("다운로드 완료 문구 때문에 레이아웃 시프트가 있습니다"), ["status"])
        self.assertEqual(match("안내문 영역 왼쪽에 굵은 세로선을 붙인 모양은 피해 주세요"), ["notice"])
        self.assertEqual(match("왼쪽 border 장식은 빼 주세요"), ["notice"])
        self.assertEqual(match("안내 문서 정리하고 왼쪽 정렬해줘"), [], "문서와 글자 정렬은 안내문이 아니다")
        self.assertEqual(match("(P) 9247586-13가 표시되는 badge가 어색합니다"), ["badge"])
        self.assertEqual(match("사이드 시트를 vaul를 추가하여 사이드 drawer로 변경"), ["drawer"])
        self.assertEqual(match("할 일 순서 바꾸기를 드래그로"), ["reorder"])
        self.assertEqual(match("칩셋 성능과 spreadsheet 정리"), [], "칩셋과 시트 단독은 컴포넌트가 아니다")
        self.assertEqual(match("이메일 입력칸 검증 문구"), ["field"])
        self.assertEqual(match("번호를 잘못 넣으면 나오는 오류와 다시시도 버튼"), ["button", "failure"])
        self.assertEqual(match("목록 불러오기 실패 화면"), ["failure"])
        self.assertEqual(match("오류 메시지와 다시 시도 버튼"), ["button", "field", "failure"])
        self.assertEqual(match("retry 로직과 에러 로그 수정, 빌드 다시 시도"), [], "화면이 아닌 재시도는 잡지 않는다")
        self.assertEqual(match("목록 로딩 스켈레톤"), ["loading"])
        self.assertEqual(match("목록이 갱신될 때 깜빡여요"), ["refresh"])
        self.assertEqual(match("탭을 바꾸면 리스트를 불러오지 못해요"), ["tabs", "refresh"])
        self.assertEqual(match("react-query refetch 간격 조정"), [], "화면이 아닌 재조회는 잡지 않는다")
        self.assertEqual(match("페이지를 새로고침하면 모달 높이가 튀어요"), ["dialog"], "페이지 새로고침은 목록 갱신이 아니다")
        self.assertEqual(match("목록 항목 구성 바꿔줘"), ["listrow"])
        self.assertEqual(match("설문 화면을 위자드처럼 한 화면에 한 질문씩"), ["steps"])
        self.assertEqual(match("회원가입을 단계별로 나눠서 진행"), ["steps"])
        self.assertEqual(match("다음 단계 진행해줘"), [], "작업 진행 요청은 단계 화면이 아니다")
        self.assertEqual(match("달력에서 날짜 선택"), ["datepicker"])
        self.assertEqual(match("테이블의 탭 이동은 불필요해보임"), ["table"])
        self.assertEqual(match("데이터 테이블 정렬"), ["datatable"], "데이터 테이블은 표로 함께 잡지 않는다")
        self.assertEqual(match("표시가 어색하고 표현이 이상함"), [], "표로 시작하는 다른 낱말은 표가 아니다")
        self.assertEqual(match("README 표와 테스트도 맞춰줘"), [], "문서 안의 표는 화면이 아니다")
        self.assertEqual(match("마크다운 표 형식으로 답해줘, markdown table도"), [], "문서 안의 표는 화면이 아니다")
        self.assertEqual(match("결과를 표로 정리해줘, 테이블로 요약해줘"), [], "답변 형식으로서의 표는 화면이 아니다")
        self.assertEqual(match("목록을 표로 바꿔줘"), ["table"])
        self.assertEqual(match("표가 답답하고 비교하기 어려워요"), ["table"], "답변 형식 낱말은 표로 뒤에 올 때만 뺀다")
        self.assertEqual(match("처음에 들어가면 내가 뭘 해야하지"), ["empty"])
        self.assertEqual(match("헤더가 스크롤하면 숨게"), ["nav"])
        self.assertEqual(match("검색창 디자인"), ["search"])
        self.assertEqual(match("리서치 시작"), [], "research는 검색이 아니다")
        self.assertEqual(match("파일 업로드 화면 만들어줘"), ["upload"])
        self.assertEqual(match("S3 업로드 코드 수정"), [], "화면이 아닌 업로드는 잡지 않는다")
        self.assertEqual(match("커밋 되돌리기"), [], "화면이 아닌 되돌리기는 잡지 않는다")
        self.assertEqual(match("정말 삭제할까요 확인 문구"), ["confirm"])
        self.assertEqual(match("화면 전환 애니메이션"), ["transition"])
        self.assertEqual(match("툴팁 위치"), ["tooltip"])
        self.assertEqual(match("상태별 필터 만들어줘"), ["filter"])
        self.assertEqual(match("목록 필터링이 느림"), ["filter"], "조건 필터는 검색 시편이 아니라 필터 시편이 잡는다")
        self.assertEqual(match("filter() 대신 reduce, 이미지 필터 효과"), [], "화면이 아닌 필터는 잡지 않는다")
        self.assertEqual(match("최신순으로 정렬 기준 바꾸기"), ["sort"])
        self.assertEqual(match("텍스트 가운데 정렬, import 정렬 순서"), [], "정렬 단독은 글자 정렬일 수 있어 잡지 않는다")
        self.assertEqual(match("정렬 변경시 애니메이션 없음"), [], "09-03 지적은 표의 정렬이다")
        self.assertEqual(match("⌘K 명령 팔레트"), ["globalsearch"])
        self.assertEqual(match("전체 검색 만들어줘"), ["globalsearch"])
        self.assertEqual(match("내 상황으로 분석하기 (AI) uiux가 별로임"), ["assistant"])
        self.assertEqual(match("AI 채팅 화면과 스트리밍 응답"), ["assistant"])
        self.assertEqual(match("AI 분석 결과를 표로 정리해줘"), [], "답변 형식은 AI 화면이 아니다")
        self.assertEqual(match("AI 대화 기록 화면 대시보드"), [], "대화 기록을 보는 화면은 AI 대화 화면이 아니다")
        self.assertEqual(match("스트리밍 API와 채팅 API 호출 코드"), [], "화면이 아닌 스트리밍과 채팅은 잡지 않는다")
        self.assertEqual(match("코드 블록 줄바꿈"), ["codeblock"])
        self.assertEqual(match("현재 절 안내 띠"), ["sectionguide"])
        self.assertEqual(match("질문 다이얼"), ["questiondial"])
        self.assertEqual(match("대화 인용"), ["conversation"])
        self.assertEqual(match("본문의 보충 설명"), ["articleaside"])
        self.assertEqual(match("긴 기술 글 읽기"), ["article"])
        self.assertEqual(match("블로그 글 목록"), ["postlist"])
        self.assertEqual(match("질문에서 글로 이동"), ["posttransition"])
        self.assertIn("formdialog", match("modal + form 조합"))
        self.assertIn("longformdialog", match("긴 설정 폼 모달"))
        self.assertIn("stepformdialog", match("단계별 폼 모달"))
        self.assertIn("formclose", match("작성 중 폼 모달 닫기"))
        self.assertIn("formfailure", match("폼 모달 저장 실패"))
        self.assertIn("manyoptions", match("선택지가 많은 입력"))
        self.assertIn("listdetail", match("목록에서 상세 보기"))
        self.assertIn("manyfilters", match("필터 조건이 많을 때"))
        self.assertIn("mobiletable", match("휴대폰에서 많은 열의 표 보기"))
        self.assertIn("rapidtabs", match("탭을 빠르게 연속 선택"))
        self.assertIn("screen-worklist", match("관리 목록 화면"))
        self.assertIn("screen-detail", match("상세와 수정 화면"))
        self.assertIn("screen-settings", match("긴 설정 화면"))
        self.assertIn("screen-reading", match("글 읽기 화면"))
        self.assertIn("screen-create", match("신청과 생성 화면"))
        self.assertIn("screen-assistant", match("AI와 함께 작업하는 화면"))
        self.assertIn("mobiledialog", match("휴대폰에서 모달이 너무 커요"))
        self.assertIn("mobiledialog", match("모바일 화면에서 회의 시간 바꾸는 모달 만들어줘"))
        self.assertIn("mobileform", match("모바일 배송지 입력 화면"))
        self.assertIn("mobileform", match("모바일 폼에서 키보드가 저장 버튼을 가려요"))
        self.assertIn("mobilepage", match("모바일 화면 대응해줘"))
        self.assertIn("mobilepage", match("반응형 레이아웃 정리"))
        self.assertIn("mobilereading", match("모바일에서 블로그 글 읽을 때 맨 위로 버튼"))
        self.assertNotIn("mobilereading", match("모바일 글자 크기"), "글자는 글 읽기가 아니다")
        phone = {c["id"] for c in catalog["components"] if lab.is_phone(c)}
        self.assertEqual(phone, {"mobiletable", "mobiledialog", "mobileform", "mobilepage", "mobilereading"})
        for component in catalog["components"]:
            self.assertTrue((Path(lab.LABS_DIR) / component["file"]).exists(), component["file"])


if __name__ == "__main__":
    unittest.main()
