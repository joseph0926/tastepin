"""새 설치의 데이터 분리와 기존 서버 보호 계약."""

import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

TASTE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TASTE_ROOT))

import taste
from tastelib import lab, repo, store


SOURCE_IGNORE = shutil.ignore_patterns(
    ".git", "node_modules", "dist", "__pycache__", "state", "TASTE.md", "rules.json",
)


def write_entry(path, source):
    """기록 폴더를 자기 폴더로 정하고 설치본 CLI를 부르는 개인 실행 파일. 전환 계획의 실행 파일과 같은 일을 한다."""
    path.write_text(
        "import os, sys\n"
        "here = os.path.dirname(os.path.abspath(__file__))\n"
        "os.environ['TASTEPIN_DATA'] = here\n"
        "os.environ['TASTEPIN_ENTRY'] = os.path.abspath(__file__)\n"
        f"os.execv(sys.executable, [sys.executable, '-B', {str(source / 'taste.py')!r}, *sys.argv[1:]])\n",
        encoding="utf-8",
    )


def read_bytes(path):
    return path.read_bytes() if path.exists() else None


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

    def test_server_of_another_data_folder_is_never_reused_or_stopped(self):
        running = {"root": store.ROOT, "data": "/other-data", "code": "same", "pid": 99}
        with (
            patch.object(store, "DATA_ROOT", "/my-data"),
            patch.object(taste, "_running_server", return_value=running),
            patch.object(taste.server, "code_version", return_value="same"),
            patch.object(taste, "_stop_stale_server") as stop,
            patch.object(taste, "_start_background") as start,
            self.assertRaises(SystemExit) as raised,
        ):
            taste._ensure_server(4871)
        self.assertIn("/other-data", str(raised.exception))
        stop.assert_not_called()
        start.assert_not_called()

    def test_server_of_the_same_data_folder_is_reused(self):
        running = {"root": store.ROOT, "data": "/my-data", "code": "same", "pid": 99}
        with (
            patch.object(store, "DATA_ROOT", "/my-data"),
            patch.object(taste, "_running_server", return_value=running),
            patch.object(taste.server, "code_version", return_value="same"),
            patch.object(taste, "_start_background") as start,
        ):
            taste._ensure_server(4871)
        start.assert_not_called()

    def test_server_that_predates_data_folders_counts_as_the_default_folder(self):
        # 기록 폴더를 알리기 전 판의 서버는 설치 폴더의 기록만 썼다
        with patch.object(taste.urllib.request, "urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = json.dumps(
                {"code": "old", "pid": 99, "root": store.ROOT}
            ).encode()
            running = taste._running_server(4871)
        self.assertEqual(running["data"], store.ROOT)
        with (
            patch.object(store, "DATA_ROOT", "/my-data"),
            patch.object(taste, "_running_server", return_value=running),
            patch.object(taste, "_stop_stale_server") as stop,
            self.assertRaises(SystemExit),
        ):
            taste._ensure_server(4871)
        stop.assert_not_called()

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


class DataFolderTests(unittest.TestCase):
    """새 프로세스에서 환경변수를 읽게 한다. 구현이 틀려도 실제 설치 폴더의 기록에 닿지 않도록 소스 사본에서 실행한다."""

    @classmethod
    def setUpClass(cls):
        temporary = tempfile.TemporaryDirectory(prefix="tastepin-source-")
        cls.addClassCleanup(temporary.cleanup)
        # macOS의 임시 폴더는 /private 아래로 풀린다. 설치 폴더는 풀린 경로로 계산되므로 맞춰 둔다
        cls.source = Path(temporary.name).resolve() / "tastepin"
        shutil.copytree(TASTE_ROOT, cls.source, ignore=SOURCE_IGNORE)
        cls.default_verdicts = cls.source / "state" / "verdicts.jsonl"

    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="tastepin-data-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.default_before = read_bytes(self.default_verdicts)

    def tearDown(self):
        self.assertEqual(read_bytes(self.default_verdicts), self.default_before, "설치 폴더의 기본 기록이 바뀌었다")

    def env(self, data=None, entry=None):
        env = {key: value for key, value in os.environ.items() if key not in ("TASTEPIN_DATA", "TASTEPIN_ENTRY")}
        if data is not None:
            env["TASTEPIN_DATA"] = str(data)
        if entry is not None:
            env["TASTEPIN_ENTRY"] = str(entry)
        return env

    def run_cli(self, *args, data=None, entry=None, stdin=""):
        return subprocess.run(
            [sys.executable, "-B", *args], cwd=self.source, env=self.env(data, entry), input=stdin,
            capture_output=True, text=True, timeout=60,
        )

    def run_shell(self, command, stdin=""):
        """출력된 안내 명령을 기록 폴더 환경변수가 없는 새 셸에서 그대로 실행한다."""
        return subprocess.run(
            command, shell=True, cwd=self.root, env=self.env(), input=stdin,
            capture_output=True, text=True, timeout=60,
        )

    def printed_follow_up(self, *entry_args, data=None, entry=None):
        """apply-context가 다른 컴포넌트를 더 받으라고 안내한 명령에서 <id> 앞까지."""
        result = self.run_cli(*entry_args, "apply-context", "--no-log", "--request", "토스트 알림 추가", data=data, entry=entry)
        self.assertEqual(result.returncode, 0, result.stderr)
        match = re.search(r"`([^`]+) apply-context --no-log --components <id>`", result.stdout)
        self.assertIsNotNone(match, result.stdout)
        return match[1]

    def verdict_count(self, data):
        path = data / "state" / "verdicts.jsonl"
        return len(path.read_text(encoding="utf-8").splitlines()) if path.exists() else 0

    def test_data_folder_holds_personal_records_but_not_the_bundled_catalog(self):
        script = (
            "import json; from tastelib import effect, lab, repo, store; print(json.dumps(["
            "store.STATE_DIR, store.VERDICTS_PATH, store.DELIVERIES_PATH, store.RULES_PATH, store.EXPORT_PATH, "
            "lab.JUDGMENTS_PATH, effect.BASELINE_PATH, repo.APPLIED_PATH, store.SYMPTOMS_PATH]))"
        )
        result = self.run_cli("-c", script, data=self.root)
        self.assertEqual(result.returncode, 0, result.stderr)
        state, verdicts, deliveries, rules, export, judgments, baseline, applied, symptoms = json.loads(result.stdout)
        self.assertEqual(state, str(self.root / "state"))
        self.assertEqual(rules, str(self.root / "data" / "rules.json"))
        self.assertEqual(export, str(self.root / "TASTE.md"))
        for path in (verdicts, deliveries, judgments, baseline, applied):
            self.assertEqual(Path(path).parent, self.root / "state", path)
        self.assertEqual(symptoms, str(self.source / "data" / "symptoms.json"))

    def test_record_writes_only_to_the_data_folder(self):
        result = self.run_cli("taste.py", "record", "--surface", "codex", data=self.root, stdin="버튼 사이 간격이 너무 좁아요\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.verdict_count(self.root), 1)

    def test_missing_data_folder_stops_without_creating_it(self):
        missing = self.root / "typo"
        result = self.run_cli("taste.py", "status", data=missing)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("TASTEPIN_DATA", result.stderr)
        self.assertFalse(missing.exists())

    def test_missing_entry_stops_instead_of_printing_a_broken_command(self):
        result = self.run_cli("taste.py", "status", data=self.root, entry=self.root / "taste.py")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("TASTEPIN_ENTRY", result.stderr)

    def test_printed_command_keeps_the_data_folder_without_an_entry(self):
        data = self.root / "my data"
        data.mkdir()
        cli = self.printed_follow_up("taste.py", data=data)
        followed = self.run_shell(f"{cli} apply-context --no-log --components toast")
        self.assertEqual(followed.returncode, 0, followed.stderr)
        recorded = self.run_shell(f"{cli} record --surface codex", stdin="토스트가 너무 늦게 떠요\n")
        self.assertEqual(recorded.returncode, 0, recorded.stderr)
        self.assertEqual(self.verdict_count(data), 1)

    def test_printed_commands_point_to_an_entry_whose_path_has_spaces(self):
        data = self.root / "personal data"
        data.mkdir()
        entry = data / "personal entry.py"
        write_entry(entry, self.source)
        cli = self.printed_follow_up(str(entry))
        self.assertNotIn("TASTEPIN_DATA=", cli)
        lab_command = self.run_cli("-c", "from tastelib import lab; print(lab.LAB_COMMAND)", data=data, entry=entry)
        self.assertEqual(lab_command.stdout.strip(), f"{cli} lab")
        followed = self.run_shell(f"{cli} apply-context --no-log --components toast")
        self.assertEqual(followed.returncode, 0, followed.stderr)
        recorded = self.run_shell(f"{cli} record --surface codex", stdin="토스트가 너무 늦게 떠요\n")
        self.assertEqual(recorded.returncode, 0, recorded.stderr)
        self.assertEqual(self.verdict_count(data), 1)


if __name__ == "__main__":
    unittest.main()
