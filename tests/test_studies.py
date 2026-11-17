"""새 시안 흐름의 보존, 적용 범위와 재시도 경계를 실제 수정본으로 검사한다."""
import copy
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tastelib import studies, store, repo


def png():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\x00\x00\x00")) + chunk(b"IEND", b"")


class StudyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="taste-studies-test-")
        cls.addClassCleanup(cls.temp.cleanup)
        cls.base = Path(cls.temp.name)
        source = cls.base / "draft"
        source.mkdir()
        cls.source = source
        cls.meta = {"format_version": 1, "id": "r1", "entry": "Screen.tsx", "files": ["Screen.tsx", "style.css"],
                    "viewport": {"width": 390, "height": 600}, "theme": "dark", "state": "테스트 목록",
                    "dimensions": [{"id": "gap", "label": "간격", "values": [{"id": "tight", "label": "좁게", "spec": "12px"}, {"id": "wide", "label": "넓게", "spec": "24px"}]}]}
        (source / "revision.json").write_bytes(studies.encode(cls.meta))
        (source / "Screen.tsx").write_text('import "./style.css"; export default function Screen({params}) { return <main data-gap={params.gap}>시편<button>누르기</button></main>; }')
        (source / "style.css").write_text('main { color: white; background: #111; height: 600px; }')
        fixture = cls.base / "bundle"
        fixture.mkdir()
        data = png()
        (fixture / "reference.png").write_bytes(data)
        (fixture / "reference.json").write_bytes(studies.encode({"format_version": 1, "kind": "ui-reference", "title": "검사 시안", "selection": {"satisfaction": "provisional"}, "image": {"file": "reference.png", "sha256": studies.digest(data), "width": 1, "height": 1}}))
        cls.fixture = fixture
        cls.seed = cls.base / "seed"
        cls.seed.mkdir()
        with patch.object(store, "DATA_ROOT", str(cls.seed)), patch.object(store, "STATE_DIR", str(cls.seed / "state")):
            studies.import_reference("sample", fixture)
            cls.snapshot = studies.register_revision("sample", source)

    def setUp(self):
        import shutil
        self.directory = Path(tempfile.mkdtemp(dir=self.base))
        shutil.copytree(self.seed, self.directory, dirs_exist_ok=True)
        self.enterContext(patch.object(store, "DATA_ROOT", str(self.directory)))
        self.enterContext(patch.object(store, "STATE_DIR", str(self.directory / "state")))
        self.original = self.directory / "state" / "judgments.jsonl"
        self.original.write_text('{"original":true}\n')

    def event(self, action, **extra):
        body = {"study": "sample", "revision": "r1", "digest": self.snapshot["digest"], "params": {"gap": "wide"},
                "expected": studies.state("sample")["expected"], "request_id": str(uuid.uuid4()), "action": action, "note": "검사용 선택", **extra}
        return studies.record(body)

    def tearDown(self):
        self.assertEqual(self.original.read_text(), '{"original":true}\n')

    def test_import_retry_freezes_reference_and_keeps_provisional_selection(self):
        studies.import_reference("sample", self.fixture)
        self.assertEqual(studies.state("sample")["reference"]["selection"]["satisfaction"], "provisional")
        self.assertEqual(studies.register_revision("sample", self.source)["digest"], self.snapshot["digest"])
        with self.assertRaises(ValueError):
            studies.public_file("sample", "r1", "source/Screen.tsx")
        with self.assertRaises(ValueError):
            studies.read_file(self.fixture, "../reference.json")

    def test_only_explicit_adoption_reaches_consumers_and_can_revert(self):
        with self.assertRaises(ValueError):
            self.event("adopt")
        self.event("reproduction")
        self.event("judge", dimension="gap", outcome="chose", choice="wide")
        with self.assertRaises(ValueError):
            studies.context("sample")
        first = self.event("adopt")
        self.assertIn("24px", studies.context("sample"))
        self.event("adopt", params={"gap": "tight"})
        self.assertIn("12px", studies.context("sample"))
        self.event("revert", target=first["id"])
        self.assertIn("24px", studies.context("sample"))
        self.event("revert", target=None)
        with self.assertRaises(ValueError):
            studies.portable_files("sample")

    def test_retries_do_not_duplicate_and_old_tabs_cannot_overwrite(self):
        first = self.event("reproduction")
        self.assertEqual(studies.record(first["request"])["id"], first["id"])
        self.assertEqual(len(studies.study_events("sample")), 1)
        with self.assertRaises(ValueError):
            studies.record({**first["request"], "note": "다른 요청"})
        with self.assertRaises(ValueError):
            self.event("feedback", expected=None)
        self.event("feedback")
        self.assertEqual(len(studies.study_events("sample")), 2)

    def test_code_change_invalidates_snapshot_even_with_same_description(self):
        target = studies.root() / "sample/revisions/r1/source/style.css"
        target.write_text('main { color: red; }')
        with self.assertRaises(ValueError):
            studies.revision("sample", "r1")
        with self.assertRaises(ValueError):
            studies.public_file("sample", "r1", "screen.html")

    def test_portable_result_contains_only_chosen_study_and_frozen_params(self):
        self.event("feedback", note="외부로 나가면 안 되는 개인 피드백")
        self.event("reproduction")
        self.event("adopt")
        files = studies.portable_files("sample")
        self.assertIn('.taste/studies/sample/screen.html', files)
        self.assertIn('window.__adoptedParams={"gap": "wide"}', files['.taste/studies/sample/screen.html'])
        self.assertNotIn("외부로 나가면", "\n".join(str(v) for v in files.values()))

    def test_registered_bundle_has_no_remote_script_or_runtime_dependency(self):
        html = studies.read_file(studies.root() / "sample/revisions/r1", "screen.html").decode()
        self.assertIn("connect-src 'none'", html)
        self.assertNotIn('<script src=', html)
        self.assertIn("__studyReady", html)
        self.assertNotIn("process.env.NODE_ENV", html)

    def test_invalid_input_cannot_change_or_escape_storage(self):
        with self.assertRaises(ValueError):
            studies.record([])
        with self.assertRaises(ValueError):
            studies.read_file(self.fixture, ".env")
        linked = self.directory / "linked"
        linked.symlink_to(self.fixture, target_is_directory=True)
        with self.assertRaises(ValueError):
            studies.bundle(linked)
        malformed = self.directory / "malformed"
        malformed.mkdir()
        for change in ({"viewport": []}, {"dimensions": [None]}, {"files": [{}]}):
            with self.subTest(change=change):
                (malformed / "revision.json").write_bytes(studies.encode({**self.meta, **change}))
                with self.assertRaises(ValueError):
                    studies.revision_manifest(malformed)
        self.assertEqual(studies.study_events("sample"), [])

    def test_export_keeps_one_adoption_while_capture_is_waiting(self):
        self.event("reproduction")
        chosen = self.event("adopt")

        def capture(command, **kwargs):
            request = json.loads(Path(command[-1]).read_text())
            self.event("adopt", params={"gap": "tight"})
            Path(request["output"]).write_bytes(png())

        output = self.directory / "export"
        with patch.object(studies.subprocess, "run", side_effect=capture):
            studies.export_adopted("sample", output)
        meta = json.loads((output / "reference.json").read_text())
        self.assertEqual(meta["source"]["adoption"], chosen["id"])
        self.assertIn("24px", meta["notes"])
        self.assertNotIn("12px", meta["notes"])
        self.assertIn('"gap": "wide"', (output / "implementation/screen.html").read_text())

    def test_portable_files_keep_one_adoption_while_reading_html(self):
        self.event("reproduction")
        self.event("adopt")
        original_read = studies.read_file
        changed = False

        def read(directory, name, *args):
            nonlocal changed
            data = original_read(directory, name, *args)
            if name == "screen.html" and not changed:
                changed = True
                self.event("adopt", params={"gap": "tight"})
            return data

        with patch.object(studies, "read_file", side_effect=read):
            files = studies.portable_files("sample")
        self.assertIn("24px", files[".taste/studies/sample/AGENT.md"])
        self.assertIn('"gap": "wide"', files[".taste/studies/sample/selection.json"])

    def test_existing_history_above_asset_limit_can_be_read_retried_and_extended(self):
        event = self.event("feedback", note="기" * 4000)
        history = []
        for _ in range(800):
            entry = copy.deepcopy(event)
            entry["id"] = entry["request_id"] = entry["request"]["request_id"] = str(uuid.uuid4())
            history.append(entry)
        ledger = self.directory / "state/study-events.jsonl"
        # 이미 누적된 원장의 입력 사본이다. 기존 바이트가 새 기록 후에도 남아야 한다.
        text = "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in history)
        store._write_atomic(str(ledger), text)
        self.assertGreater(ledger.stat().st_size, 16 * 1024 * 1024)
        self.assertEqual(studies.state("sample")["expected"], history[-1]["id"])
        self.assertEqual(studies.record(history[-1]["request"])["id"], history[-1]["id"])
        self.event("feedback", note="추가 요청")
        self.assertTrue(ledger.read_bytes().startswith(text.encode()))
        self.assertEqual(len(studies.study_events("sample")), 801)

    def test_unknown_request_fields_are_rejected_before_writing(self):
        with self.assertRaises(ValueError):
            self.event("feedback", extra_data="x" * 900_000)
        self.assertEqual(studies.study_events("sample"), [])

    def test_failed_capture_does_not_publish_or_cache_an_export(self):
        self.event("reproduction")
        chosen = self.event("adopt")
        output = self.directory / "failed-export"

        def failed_capture(command, **kwargs):
            request = json.loads(Path(command[-1]).read_text())
            Path(request["output"]).write_bytes(png())
            raise subprocess.CalledProcessError(1, "capture")

        with patch.object(studies.subprocess, "run", side_effect=failed_capture):
            with self.assertRaises(subprocess.CalledProcessError):
                studies.export_adopted("sample", output)
        self.assertFalse(output.exists())
        self.assertFalse((studies.root() / "sample/exports" / chosen["id"]).exists())


if __name__ == "__main__":
    unittest.main()
