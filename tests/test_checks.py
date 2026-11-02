"""Stop 훅의 lint 확인, lint 기록, doctor를 임시 원장과 임시 홈에서 검사한다."""

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
from tastelib import doctor, lab, lint, repo, stopcheck, store


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

    def test_blocks_once_when_a_taste_session_edits_screen_files_without_lint(self):
        store.log_delivery("skill", session="s1")
        entries = [user("/taste 설정 화면 만들어줘"), tool("Edit", file_path="/p/src/Settings.tsx"), tool_result()]
        output = self.run_stop(entries)
        self.assertEqual(output["decision"], "block")
        self.assertIn("Settings.tsx", output["reason"])
        self.assertIn("lint <url> --session s1", output["reason"])
        self.assertIsNone(self.run_stop(entries, active=True), "이미 이 훅 때문에 이어 가는 중이면 막지 않는다")

    def test_lint_after_the_last_edit_lets_the_turn_end(self):
        store.log_delivery("skill", session="s1")
        entries = [
            user("버튼 고쳐줘"), tool("Write", file_path="/p/src/button.css"),
            tool("Bash", command="python3 -B /example/tastepin/taste.py lint localhost:3000 --session s1"),
        ]
        self.assertIsNone(self.run_stop(entries))
        entries.append(tool("Edit", file_path="/p/src/button.css"))
        self.assertIsNotNone(self.run_stop(entries), "lint 뒤에 다시 고쳤으면 다시 확인한다")

    def test_only_this_turn_and_only_screen_files_count(self):
        store.log_delivery("skill", session="s1")
        earlier = [user("화면 만들어줘"), tool("Edit", file_path="/p/a.tsx"), tool_result()]
        self.assertIsNone(self.run_stop(earlier + [user("README 고쳐줘"), tool("Edit", file_path="/p/README.md")]))

    def test_harness_messages_do_not_start_a_new_turn(self):
        store.log_delivery("skill", session="s1")
        notification = {
            "type": "user", "origin": {"kind": "task-notification"},
            "message": {"role": "user", "content": "<task-notification>조사 끝</task-notification>"},
        }
        summary = {"type": "user", "isCompactSummary": True, "message": {"role": "user", "content": "이전 대화 요약"}}
        for inserted in (notification, summary):
            entries = [user("설정 화면 고쳐줘"), tool("Edit", file_path="/p/src/Settings.tsx"), tool_result(), inserted]
            self.assertIsNotNone(self.run_stop(entries), "하네스가 넣은 메시지 앞의 화면 수정도 이번 턴이다")

    def test_sessions_without_taste_are_never_blocked(self):
        entries = [user("화면 만들어줘"), tool("Edit", file_path="/p/a.tsx")]
        self.assertIsNone(self.run_stop(entries, session="other"))
        store.log_delivery("hook", session="other")
        self.assertIsNone(self.run_stop(entries, session="other"), "10-21까지의 자동 주입은 /taste 적용이 아니다")

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

    def test_codex_blocks_after_a_ui_patch_without_reading_the_transcript(self):
        store.log_delivery("skill", session="s1", surface="codex")
        self.run_codex_track("apply_patch", "*** Begin Patch\n*** Update File: src/Settings.tsx\n*** End Patch")
        output = self.run_stop([], surface="codex")
        self.assertEqual(output["decision"], "block")
        self.assertIn("Settings.tsx", output["reason"])
        self.assertIsNone(self.run_stop([], surface="codex"), "읽은 턴 기록은 다시 쓰지 않는다")

    def test_codex_lint_after_the_last_ui_patch_lets_the_turn_end(self):
        store.log_delivery("skill", session="s1", surface="codex")
        self.run_codex_track("apply_patch", "*** Begin Patch\n*** Add File: src/button.css\n*** End Patch")
        self.run_codex_track("Bash", "python3 -B /example/tastepin/taste.py lint localhost:3000 --session s1")
        self.assertIsNone(self.run_stop([], surface="codex"))

        self.run_codex_track("Bash", "python3 -B /example/tastepin/taste.py lint localhost:3000 --session s1")
        self.run_codex_track("apply_patch", "*** Begin Patch\n*** Update File: src/button.css\n*** End Patch")
        self.assertIsNotNone(self.run_stop([], surface="codex"), "lint 뒤에 다시 고쳤으면 막는다")

    def test_codex_turn_record_is_removed_when_the_continued_turn_stops(self):
        store.log_delivery("skill", session="s1", surface="codex")
        self.run_codex_track("apply_patch", "*** Begin Patch\n*** Update File: src/Settings.tsx\n*** End Patch")
        self.assertIsNotNone(self.run_stop([], surface="codex"))
        self.run_codex_track("Bash", "python3 -B /example/tastepin/taste.py lint localhost:3000 --session s1")
        self.assertIsNone(self.run_stop([], surface="codex", active=True))
        self.assertEqual(list((self.state / "stop-actions").iterdir()), [], "막은 뒤 이어 간 턴의 기록도 남지 않는다")

    def test_codex_ignores_non_ui_patches_and_other_turns(self):
        store.log_delivery("skill", session="s1", surface="codex")
        self.run_codex_track("apply_patch", "*** Begin Patch\n*** Update File: README.md\n*** End Patch")
        self.run_codex_track(
            "apply_patch",
            "*** Begin Patch\n*** Update File: src/App.tsx\n*** End Patch",
            turn="other-turn",
        )
        self.assertIsNone(self.run_stop([], surface="codex"))


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


if __name__ == "__main__":
    unittest.main()
