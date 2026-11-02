"""훅의 외부 계약과 기록을 임시 원장에서 검사한다. 실제 개인 기록은 사용하지 않는다.

2026-10-22부터 훅은 화면 판정을 원장에 기록만 하고 아무것도 출력하지 않는다. 취향은 /taste(apply-context)가 넣는다.
"""

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

TASTE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TASTE_ROOT))

import taste
from tastelib import lab, store


class PromptHookTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="taste-hook-test-")
        self.addCleanup(temporary.cleanup)
        self.state = Path(temporary.name)
        files = {
            "STATE_DIR": str(self.state),
            "RULES_PATH": str(self.state / "rules.json"),
            "SYMPTOMS_PATH": str(self.state / "symptoms.json"),
            "VERDICTS_PATH": str(self.state / "verdicts.jsonl"),
            "DELIVERIES_PATH": str(self.state / "deliveries.jsonl"),
        }
        store_patch = patch.multiple(store, **files)
        store_patch.start()
        self.addCleanup(store_patch.stop)
        labs_patch = patch.multiple(lab, LABS_DIR=str(self.state / "labs"),
                                    JUDGMENTS_PATH=str(self.state / "judgments.jsonl"))
        labs_patch.start()
        self.addCleanup(labs_patch.stop)
        log_patch = patch.multiple(taste, LOG_PATH=str(self.state / "server.log"),
                                   HOOK_LOG_PATH=str(self.state / "hook.log"))
        log_patch.start()
        self.addCleanup(log_patch.stop)
        rules = {
            "rules": [
                {
                    "id": "surface-grouping", "axis": "surface", "status": "확정",
                    "title": "여백으로 묶기", "avoid": "과한 테두리", "do": "여백으로 구분",
                    "symptoms": ["border-heavy"],
                },
                {
                    "id": "motion-continuity", "axis": "motion-continuity", "status": "확정",
                    "title": "연속된 전환", "avoid": "뚝뚝 끊기는 전환", "do": "위치를 이어서 전환",
                    "symptoms": ["motion-broken"],
                },
            ],
        }
        symptoms = {
            "symptoms": [
                {
                    "id": "border-heavy", "aliases": ["border가 너무 많"],
                    "label": "테두리 과다", "term": "구분선 남용",
                    "fix": "테두리를 줄이고 여백으로 묶는다", "check": "그룹이 여백으로 구분되는지 확인",
                },
                {
                    "id": "motion-broken", "aliases": ["뚝뚝"],
                    "label": "끊기는 전환", "term": "모션 불연속",
                    "fix": "현재 위치에서 다음 위치로 잇는다", "check": "중간 프레임의 연속성을 확인",
                },
            ],
        }
        Path(store.RULES_PATH).write_text(json.dumps(rules, ensure_ascii=False), encoding="utf-8")
        Path(store.SYMPTOMS_PATH).write_text(json.dumps(symptoms, ensure_ascii=False), encoding="utf-8")

    def copilot_payload(self, prompt="랜딩 페이지 디자인을 만들어줘", session="copilot-session"):
        return {
            "sessionId": session,
            "cwd": "/tmp/taste-example",
            "prompt": prompt,
            "transformedPrompt": "<current_datetime>2026-10-06</current_datetime>\n" + prompt,
        }

    def run_hook(self, payload, surface="copilot"):
        raw = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
        output = io.StringIO()
        with (
            patch.object(sys, "stdin", io.StringIO(raw)),
            patch.object(sys, "argv", ["taste.py", "hook", "--surface", surface]),
            redirect_stdout(output),
        ):
            taste.main()
        return json.loads(output.getvalue()) if output.getvalue() else None

    def apply(self, session="s1"):
        output = io.StringIO()
        argv = ["taste.py", "apply-context", "--request", "랜딩 디자인", "--session", session]
        with patch.object(sys, "argv", argv), redirect_stdout(output):
            taste.main()
        return output.getvalue()

    def test_screen_request_passes_through_without_output_or_records(self):
        payload = self.copilot_payload()
        payload["transformedPrompt"] += "\n\n<attachment>참고 화면</attachment>\n"
        self.assertIsNone(self.run_hook(payload), "Copilot이 만든 transformedPrompt를 그대로 쓰게 출력하지 않는다")
        self.assertEqual(store.load_deliveries(), [])
        self.assertEqual(store.load_verdicts(), [])

    def test_screen_verdict_is_recorded_once_without_output(self):
        payload = self.copilot_payload("border가 너무 많아요")
        self.assertIsNone(self.run_hook(payload))
        self.assertIsNone(self.run_hook(payload))
        verdict, = store.load_verdicts()
        self.assertEqual(verdict["source"], "copilot")
        self.assertEqual(verdict["session"], "copilot-session")
        self.assertEqual(verdict["project"], "/tmp/taste-example")
        self.assertEqual(verdict["text"], "border가 너무 많아요")
        self.assertEqual(verdict["symptoms"], ["border-heavy"])
        self.assertEqual(verdict["origin"], "hook")
        self.assertEqual(verdict["status"], "new")

    def test_explicit_copilot_record_keeps_the_surface(self):
        output = io.StringIO()
        with (
            patch.object(sys, "stdin", io.StringIO("border가 너무 많아요")),
            patch.object(
                sys,
                "argv",
                ["taste.py", "record", "--surface", "copilot"],
            ),
            redirect_stdout(output),
        ):
            taste.main()

        verdict, = store.load_verdicts()
        self.assertEqual(verdict["source"], "copilot")
        self.assertEqual(verdict["session"], "")
        self.assertEqual(verdict["origin"], "skill")

    def test_short_verdict_without_screen_words_counts_only_in_a_taste_session(self):
        self.run_hook(self.copilot_payload("뚝뚝 끊겨요"))
        self.assertEqual(store.load_verdicts(), [], "화면 단어도 /taste 기록도 없으면 다른 일의 불평일 수 있다")
        self.apply(session="copilot-session")
        self.run_hook(self.copilot_payload("뚝뚝 끊겨요"))
        verdict, = store.load_verdicts()
        self.assertEqual(verdict["symptoms"], ["motion-broken"])

    def test_common_screen_words_make_a_verdict(self):
        for prompt in ("이 화면 간격이 너무 답답해요", "버튼이 어색해요", "모바일에서 글씨가 너무 작아 가독성이 별로"):
            with self.subTest(prompt=prompt):
                self.run_hook(self.copilot_payload(prompt, session=prompt))
        self.assertEqual(len(store.load_verdicts()), 3)

    def test_does_not_classify_runtime_context_as_user_feedback(self):
        payload = self.copilot_payload("파이썬 함수를 설명해줘")
        payload["transformedPrompt"] += "\n<attachment>border가 너무 많아요</attachment>"
        self.assertIsNone(self.run_hook(payload))
        self.assertEqual(store.load_verdicts(), [])

    def test_english_screen_words_inside_other_words_are_not_screen_words(self):
        self.run_hook(self.copilot_payload("emotional 문구가 어색해요"))
        self.assertEqual(store.load_verdicts(), [])
        self.run_hook(self.copilot_payload("motion이 어색해요"))
        self.assertEqual(len(store.load_verdicts()), 1)

    def test_skips_opt_out_tool_management_and_automated_input(self):
        prompts = (
            "border가 너무 많아요 취향 무시",
            "taste border가 너무 많아요",
            "<task-notification>border가 너무 많아요</task-notification>",
        )
        for prompt in prompts:
            with self.subTest(prompt=prompt):
                self.assertIsNone(self.run_hook(self.copilot_payload(prompt)))
        for field in ("agent_id", "agentId"):
            with self.subTest(field=field):
                payload = self.copilot_payload("border가 너무 많아요")
                payload[field] = "subagent"
                self.assertIsNone(self.run_hook(payload))
        self.assertEqual(store.load_verdicts(), [])

    def test_apply_records_which_rules_version_was_delivered(self):
        self.apply(session="before-edit")
        rules = json.loads(Path(store.RULES_PATH).read_text(encoding="utf-8"))
        rules["rules"][0]["do"] = "여백 12px로 구분"
        Path(store.RULES_PATH).write_text(json.dumps(rules, ensure_ascii=False), encoding="utf-8")
        self.apply(session="after-edit")
        before, after = store.load_deliveries()
        self.assertEqual((before["via"], before["session"]), ("skill", "before-edit"))
        self.assertTrue(before["rules_hash"] and after["rules_hash"])
        self.assertNotEqual(before["rules_hash"], after["rules_hash"], "규칙 문장을 고친 전후의 전달은 구분돼야 한다")

    def test_praised_patterns_go_to_context_and_block_not_complaints(self):
        symptoms = json.loads(Path(store.SYMPTOMS_PATH).read_text(encoding="utf-8"))
        symptoms["symptoms"].append({
            "id": "quiet-rows", "axis": "surface", "kind": "like", "aliases": ["행으로 나눈"],
            "label": "행으로 나눈 목록", "term": "hairline 행", "fix": "목록을 hairline 행으로 나눈다", "check": "행 구분 확인",
        })
        Path(store.SYMPTOMS_PATH).write_text(json.dumps(symptoms, ensure_ascii=False), encoding="utf-8")
        praise = {
            "id": "praise", "ts": "2026-10-01T00:00:00+00:00", "source": "claude", "session": "old", "project": "",
            "text": "행으로 나눈 목록 좋네", "context": "", "symptoms": ["quiet-rows"], "polarity": "positive",
            "origin": "hook", "status": "kept",
        }
        store.save_verdicts([praise, {**praise, "id": "ignored", "status": "ignored"}])
        self.assertIn("- 좋아한 패턴 행으로 나눈 목록: 맞는 자리가 있으면 쓴다. 목록을 hairline 행으로 나눈다", self.apply())
        block = store.build_block(store.load_rules(), store.load_verdicts(), "agent", store.load_symptoms())
        self.assertIn("- 행으로 나눈 목록 (칭찬 1회)", block)
        self.assertNotIn("hairline 행, 지적", block)

    def test_invalid_copilot_input_does_not_write_records_or_block(self):
        invalid = (
            "{broken-json", [],
            {"prompt": "랜딩 디자인을 만들어줘", "sessionId": "session"},
            {"prompt": "랜딩 디자인을 만들어줘", "transformedPrompt": "원문"},
        )
        for payload in invalid:
            with self.subTest(payload=payload):
                self.assertIsNone(self.run_hook(payload))
        for field, value in (("prompt", []), ("sessionId", 123), ("sessionId", ""),
                             ("transformedPrompt", None), ("cwd", [])):
            with self.subTest(field=field, value=value):
                payload = self.copilot_payload()
                payload[field] = value
                self.assertIsNone(self.run_hook(payload))
        self.assertEqual(store.load_verdicts(), [])
        self.assertEqual(store.load_deliveries(), [])
        self.assertIn("hook error:", Path(taste.HOOK_LOG_PATH).read_text(encoding="utf-8"))

    def test_broken_ledger_does_not_block_prompt(self):
        Path(store.SYMPTOMS_PATH).write_text("{broken-json", encoding="utf-8")
        self.assertIsNone(self.run_hook(self.copilot_payload("border가 너무 많아요")))
        self.assertEqual(store.load_verdicts(), [])
        self.assertIn("hook error:", Path(taste.HOOK_LOG_PATH).read_text(encoding="utf-8"))

    def test_broken_verdict_line_is_kept_aside_and_recording_continues(self):
        # 손으로 고치다 깨진 줄이나 merge 충돌 표식 한 줄 때문에 기록이 멈추면 안 된다
        Path(store.VERDICTS_PATH).write_text("<<<<<<< HEAD\n", encoding="utf-8")
        self.assertIsNone(self.run_hook(self.copilot_payload("border가 너무 많아요")))
        self.assertEqual(len(store.load_verdicts()), 1)
        self.assertEqual(Path(store.broken_path(store.VERDICTS_PATH)).read_text(encoding="utf-8"), "<<<<<<< HEAD\n")
        self.assertEqual(store.broken_line_count(store.VERDICTS_PATH), 0)

    def test_classify_marks_verdict_from_cli(self):
        self.run_hook(self.copilot_payload("border가 너무 많아요"))
        verdict_id = store.load_verdicts()[0]["id"]
        with patch.object(sys, "argv", ["taste.py", "classify", verdict_id[:6], "--ignore"]), redirect_stdout(io.StringIO()):
            taste.main()
        self.assertEqual(store.load_verdicts()[0]["status"], "ignored")

    def test_praise_with_verdict_words_is_positive(self):
        from tastelib import harvest
        self.assertEqual(harvest.polarity("카드 간격이 깔끔해요"), "positive")
        self.assertEqual(harvest.polarity("전환이 부드럽네요"), "positive")
        self.assertEqual(harvest.polarity("더 부드럽게 해 주세요"), "negative")
        self.assertEqual(harvest.polarity("전환이 부자연스러워요"), "negative")

    def test_logging_failure_does_not_block_prompt(self):
        with patch.object(taste, "HOOK_LOG_PATH", str(self.state)):
            self.assertIsNone(self.run_hook("{broken-json"))

    def test_claude_and_codex_record_without_output(self):
        for surface in ("claude", "codex"):
            with self.subTest(surface=surface):
                payload = {
                    "prompt": "border가 너무 많아요", "session_id": surface + "-session",
                    "cwd": "/tmp/taste-example",
                }
                self.assertIsNone(self.run_hook(payload, surface))
                verdict = next(v for v in store.load_verdicts() if v["source"] == surface)
                self.assertEqual(verdict["session"], surface + "-session")
                self.assertEqual(verdict["text"], payload["prompt"])

if __name__ == "__main__":
    unittest.main()
