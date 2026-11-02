"""수집기가 Codex 압축 기록을 이어 읽는지 임시 대화 기록과 임시 cursor로 검사한다. 실제 개인 기록은 사용하지 않는다."""

import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

TASTE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TASTE_ROOT))

from tastelib import effect, harvest

SINCE = dt.datetime(2000, 1, 1, tzinfo=dt.timezone.utc)


def codex_raw(texts):
    lines = [{"type": "session_meta", "timestamp": "2026-09-20T00:00:00Z",
              "payload": {"id": "codex-1", "cwd": "/tmp/app", "source": "cli"}}]
    lines += [
        {"type": "event_msg", "timestamp": "2026-09-20T00:01:00Z", "payload": {"type": "user_message", "message": text}}
        for text in texts
    ]
    return "".join(json.dumps(line, ensure_ascii=False) + "\n" for line in lines).encode()


class DesignWordTests(unittest.TestCase):
    def verdicts(self, texts):
        lines = codex_raw(texts).splitlines(keepends=True)
        found = harvest.scan_lines(lines, "codex-1", "codex", harvest.new_file_state(), SINCE, lambda text: [])
        return [verdict["text"] for verdict in found]

    def test_english_design_words_inside_other_words_do_not_make_a_verdict(self):
        self.assertEqual(self.verdicts(["promotions.json 승격 보고가 어색해요", "emotional 문구가 어색해요"]), [])

    def test_design_words_still_count_as_words_and_plurals(self):
        self.assertEqual(self.verdicts(["모션이 어색해요", "animations가 어색해요"]), ["모션이 어색해요", "animations가 어색해요"])


@unittest.skipIf(harvest.zstd is None, "compression.zstd가 없는 Python")
class CompressedHarvestTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="taste-harvest-test-")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.sessions = root / "codex" / "sessions" / "2026" / "09" / "20"
        self.archived = root / "codex" / "archived"
        self.sessions.mkdir(parents=True)
        self.archived.mkdir(parents=True)
        patcher = patch.multiple(
            harvest,
            CLAUDE_GLOB=str(root / "claude" / "*" / "*.jsonl"),
            CODEX_GLOBS=[str(root / "codex" / "sessions" / "**" / "*.jsonl"), str(self.archived / "*.jsonl")],
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.cursor = {}

    def harvest(self):
        found, _ = harvest.harvest(self.cursor, SINCE, lambda text: [])
        return [verdict["text"] for verdict in found]

    def compress(self, original, target, raw):
        target.write_bytes(harvest.zstd.compress(raw))
        original.unlink()

    def test_record_compressed_after_reading_is_not_harvested_again(self):
        original = self.sessions / "rollout-1.jsonl"
        original.write_bytes(codex_raw(["레이아웃이 어색해요"]))
        self.assertEqual(self.harvest(), ["레이아웃이 어색해요"])
        compressed = self.sessions / "rollout-1.jsonl.zst"
        self.compress(original, compressed, codex_raw(["레이아웃이 어색해요"]))
        self.assertEqual(self.harvest(), [], "압축 전에 읽은 판정을 다시 내지 않는다")
        self.assertEqual(set(self.cursor["files"]), {str(compressed)}, "옛 .jsonl 키는 압축본 키로 옮긴다")

    def test_record_moved_to_archive_while_compressed_continues_where_it_stopped(self):
        original = self.sessions / "rollout-1.jsonl"
        original.write_bytes(codex_raw(["레이아웃이 어색해요"]))
        self.harvest()
        self.compress(original, self.archived / "rollout-1.jsonl.zst", codex_raw(["레이아웃이 어색해요", "색상이 촌스러워요"]))
        self.assertEqual(self.harvest(), ["색상이 촌스러워요"], "압축 전에 읽은 뒤에 붙은 부분만 읽는다")

    def test_record_first_seen_compressed_is_read_once(self):
        (self.archived / "rollout-1.jsonl.zst").write_bytes(harvest.zstd.compress(codex_raw(["레이아웃이 어색해요"])))
        self.assertEqual(self.harvest(), ["레이아웃이 어색해요"])
        with patch.object(harvest, "scan_compressed") as scan:
            self.assertEqual(self.harvest(), [])
        scan.assert_not_called()

    def test_unfinished_compressed_record_is_read_on_a_later_run(self):
        compressed = self.archived / "rollout-1.jsonl.zst"
        raw = harvest.zstd.compress(codex_raw(["레이아웃이 어색해요"]))
        compressed.write_bytes(raw[: len(raw) // 2])
        self.assertEqual(self.harvest(), [])
        self.assertNotIn(str(compressed), self.cursor["files"])
        compressed.write_bytes(raw)
        self.assertEqual(self.harvest(), ["레이아웃이 어색해요"])

    def test_effect_replays_each_compressed_record_once(self):
        compressed = self.archived / "rollout-1.jsonl.zst"
        compressed.write_bytes(harvest.zstd.compress(codex_raw(["레이아웃이 어색해요"])))
        self.assertEqual([path for path, _ in effect.replay_files()], [str(compressed)])

    def test_without_zstd_compressed_records_are_counted_as_skipped(self):
        (self.archived / "rollout-1.jsonl.zst").write_bytes(b"compressed")
        with patch.object(harvest, "zstd", None):
            self.assertEqual(list(harvest.session_files()), [])
            self.assertEqual(harvest.unreadable_compressed(), 1)


if __name__ == "__main__":
    unittest.main()
