"""이전 Stop 훅의 비활성화, 수동 lint 기록, doctor를 임시 원장과 임시 홈에서 검사한다."""

import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

TASTE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TASTE_ROOT))

import taste
from tastelib import doctor, lab, lint, repo, store


def user(text):
    return {"type": "user", "message": {"role": "user", "content": text}}


def tool_result():
    return {"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "content": "ok"}]}}


def tool(name, **payload):
    return {"type": "assistant", "message": {"role": "assistant", "content": [
        {"type": "tool_use", "name": name, "input": payload},
    ]}}


class LedgerCase(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="taste-checks-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.state = self.root / "state"
        self.state.mkdir()
        files = patch.multiple(
            store, STATE_DIR=str(self.state), DELIVERIES_PATH=str(self.state / "deliveries.jsonl"),
            LINT_LOG_PATH=str(self.state / "lint.jsonl"), VERDICTS_PATH=str(self.state / "verdicts.jsonl"),
        )
        files.start()
        self.addCleanup(files.stop)
        log = patch.multiple(taste, LOG_PATH=str(self.state / "server.log"), HOOK_LOG_PATH=str(self.state / "hook.log"))
        log.start()
        self.addCleanup(log.stop)


class StopCheckTests(LedgerCase):
    def run_stop(self, entries, session="s1", active=False, surface="claude", turn="turn-1"):
        transcript = self.root / "transcript.jsonl"
        transcript.write_text("\n".join(json.dumps(e, ensure_ascii=False) for e in entries), encoding="utf-8")
        payload = {
            "session_id": session,
            "turn_id": turn,
            "transcript_path": str(transcript),
            "stop_hook_active": active,
        }
        output = io.StringIO()
        with (
            patch.object(sys, "stdin", io.StringIO(json.dumps(payload))),
            patch.object(sys, "argv", ["taste.py", "stop-check", "--surface", surface]),
            redirect_stdout(output),
        ):
            taste.main()
        return json.loads(output.getvalue()) if output.getvalue() else None

    def run_codex_track(self, tool_name, command, session="s1", turn="turn-1"):
        payload = {
            "session_id": session,
            "turn_id": turn,
            "hook_event_name": "PostToolUse",
            "tool_name": tool_name,
            "tool_input": {"command": command},
        }
        output = io.StringIO()
        with (
            patch.object(sys, "stdin", io.StringIO(json.dumps(payload))),
            patch.object(sys, "argv", ["taste.py", "stop-track", "--surface", "codex"]),
            redirect_stdout(output),
        ):
            taste.main()
        self.assertEqual(output.getvalue(), "")

    def test_claude_ui_edits_do_not_require_browser_lint(self):
        store.log_delivery("skill", session="s1")
        entries = [user("/taste 설정 화면 만들어줘"), tool("Edit", file_path="/p/src/Settings.tsx"), tool_result()]
        before = {p.name: p.read_bytes() for p in self.state.iterdir() if p.is_file()}
        self.assertIsNone(self.run_stop(entries))
        self.assertIsNone(self.run_stop(entries, active=True))
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.state.iterdir() if p.is_file()})

    def test_codex_ui_edits_do_not_track_or_require_browser_lint(self):
        store.log_delivery("skill", session="s1", surface="codex")
        before = {p.name: p.read_bytes() for p in self.state.iterdir() if p.is_file()}
        self.run_codex_track("apply_patch", "*** Begin Patch\n*** Update File: src/Settings.tsx\n*** End Patch")
        self.assertIsNone(self.run_stop([], surface="codex"))
        self.assertFalse((self.state / "stop-actions").exists())
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.state.iterdir() if p.is_file()})

    def test_legacy_codex_turn_records_do_not_block_or_get_deleted(self):
        store.log_delivery("skill", session="s1", surface="codex")
        import hashlib
        key = hashlib.sha256(b"s1\0turn-1").hexdigest()
        old = self.state / "stop-actions" / (key + ".jsonl")
        old.parent.mkdir()
        content = json.dumps({"kind": "edit", "paths": ["src/Settings.tsx"]}) + "\n"
        old.write_text(content)
        self.assertIsNone(self.run_stop([], surface="codex"))
        self.assertEqual(old.read_text(), content)

    def test_broken_input_does_not_block(self):
        output = io.StringIO()
        with (
            patch.object(sys, "stdin", io.StringIO("{broken")),
            patch.object(sys, "argv", ["taste.py", "stop-check"]),
            redirect_stdout(output),
        ):
            taste.main()
        self.assertEqual(output.getvalue(), "")
        self.assertIn("stop-check error", (self.state / "hook.log").read_text(encoding="utf-8"))


class LintRecordTests(LedgerCase):
    def test_record_keeps_failed_and_warned_symptoms_and_drops_placeholder_session(self):
        checks = [
            {"id": "ground", "symptom": "color-dated", "level": "fail"},
            {"id": "radius", "symptom": "radius-heavy", "level": "warn"},
            {"id": "overflow", "symptom": None, "level": "warn"},
            {"id": "contrast", "symptom": "contrast-low", "level": "pass"},
        ]
        record = lint.lint_record("http://localhost:3000", ["데스크톱 라이트"], checks, "${CLAUDE_SESSION_ID}")
        self.assertEqual(record["session"], "")
        self.assertEqual(record["fail"], ["color-dated"])
        self.assertEqual(record["warn"], ["overflow", "radius-heavy"])
        store.log_lint(record)
        self.assertEqual(store.load_lint_log(), [record])


class DoctorTests(LedgerCase):
    def test_reports_missing_hooks_and_old_skill(self):
        home = self.root / "home"
        (home / ".claude" / "skills" / "taste").mkdir(parents=True)
        (home / ".codex").mkdir(parents=True)
        (home / ".claude" / "skills" / "taste" / "SKILL.md").write_text("옛 스킬", encoding="utf-8")
        (home / ".claude" / "settings.json").write_text(json.dumps({"hooks": {
            "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "python3 -B taste.py hook"}]}],
        }}), encoding="utf-8")
        (home / ".codex" / "hooks.json").write_text(json.dumps({"hooks": {
            "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "python3 -B taste.py hook"}]}],
        }}), encoding="utf-8")
        labs = self.root / "labs"
        with patch.multiple(doctor, HOME=str(home), SKILL_DIR=str(self.root / "missing-skill")), \
                patch.multiple(lab, LABS_DIR=str(labs)), \
                patch.object(repo, "APPLIED_PATH", str(self.state / "applied.json")):
            text, problems = doctor.report()
        self.assertIn("훅은 선택 기능입니다", text)
        self.assertIn("확인 필요  동봉된 tastepin 스킬", text)
        self.assertIn("홈 스킬 설치 생략됨", text)
        self.assertGreater(problems, 0)

    def test_reports_rules_that_reference_symptoms_missing_from_the_catalog(self):
        symptoms = self.root / "symptoms.json"
        symptoms.write_text(json.dumps({"axes": [], "symptoms": [{"id": "known"}]}), encoding="utf-8")
        rules = self.root / "rules.json"
        rules.write_text(json.dumps({"rules": [
            {"id": "kept", "symptoms": ["known"]},
            {"id": "broken", "symptoms": ["known", "gone"]},
        ]}), encoding="utf-8")
        with patch.multiple(store, SYMPTOMS_PATH=str(symptoms), RULES_PATH=str(rules)), \
                patch.object(repo, "APPLIED_PATH", str(self.state / "applied.json")):
            text, problems = doctor.report()
            self.assertEqual(store.unknown_symptoms(store.load_rules(), store.load_symptoms()), {"broken": ["gone"]})
        self.assertIn("확인 필요  규칙 broken의 증상 중 카탈로그에 없는 것: gone", text)
        self.assertNotIn("규칙 kept", text)
        self.assertGreater(problems, 0)


if __name__ == "__main__":
    unittest.main()
