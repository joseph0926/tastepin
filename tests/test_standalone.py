"""새 설치의 데이터 분리와 기존 서버 보호 계약."""

import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import taste
from tastelib import lab, repo, store


class StandaloneTests(unittest.TestCase):
    def test_open_does_not_read_conversations_by_default(self):
        with (
            patch.object(sys, "argv", ["taste.py", "open", "--no-browser"]),
            patch.object(taste, "cmd_harvest") as harvest,
            patch.object(taste, "_ensure_server"),
            redirect_stdout(io.StringIO()),
        ):
            taste.main()
        harvest.assert_not_called()

    def test_open_harvest_is_explicit(self):
        with (
            patch.object(sys, "argv", ["taste.py", "open", "--harvest", "--no-browser"]),
            patch.object(taste, "cmd_harvest") as harvest,
            patch.object(taste, "_ensure_server"),
            redirect_stdout(io.StringIO()),
        ):
            taste.main()
        harvest.assert_called_once()

    def test_other_installation_is_never_stopped(self):
        with (
            patch.object(taste, "_running_server", return_value={"root": "/other-install", "code": "old", "pid": 99}),
            patch.object(taste, "_stop_stale_server") as stop,
            patch.object(taste, "_start_background") as start,
            self.assertRaises(SystemExit),
        ):
            taste._ensure_server(4871)
        stop.assert_not_called()
        start.assert_not_called()

    def test_missing_rules_and_ledger_start_empty(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.multiple(
                store,
                RULES_PATH=str(Path(temporary) / "rules.json"),
                VERDICTS_PATH=str(Path(temporary) / "verdicts.jsonl"),
            ):
                self.assertEqual(store.load_rules(), {"rules": []})
                self.assertEqual(store.load_verdicts(), [])

    def test_bundled_skill_and_catalog_need_no_home_installation(self):
        files, missing = repo.skill_files()
        self.assertEqual(missing, [])
        self.assertIn(".agents/skills/tastepin/SKILL.md", files)
        self.assertTrue(lab.load_catalog()["components"])
        self.assertEqual(Path(lab.LABS_DIR).parent, Path(store.ROOT))


if __name__ == "__main__":
    unittest.main()
