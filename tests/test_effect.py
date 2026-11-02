"""효과 측정의 재생을 임시 대화 기록과 임시 원장에서 검사한다. 실제 개인 기록은 사용하지 않는다."""

import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

TASTE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TASTE_ROOT))

from tastelib import effect, harvest, lab, store


def claude_line(role, text, at, **extra):
    return {"type": role, "message": {"role": role, "content": text}, "timestamp": at, "cwd": "/tmp/app", **extra}


def codex_lines(session_id, texts, at, source="cli"):
    meta = {"type": "session_meta", "timestamp": at, "payload": {"id": session_id, "cwd": "/tmp/app", "source": source}}
    users = [
        {"type": "event_msg", "timestamp": at, "payload": {"type": "user_message", "message": text}}
        for text in texts
    ]
    return [meta, *users]


class ReplayTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="taste-effect-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        state = self.root / "state"
        state.mkdir()
        (self.root / "claude" / "proj").mkdir(parents=True)
        (self.root / "codex").mkdir()
        patches = [
            patch.multiple(
                store,
                STATE_DIR=str(state),
                RULES_PATH=str(state / "rules.json"),
                SYMPTOMS_PATH=str(state / "symptoms.json"),
                VERDICTS_PATH=str(state / "verdicts.jsonl"),
                DELIVERIES_PATH=str(state / "deliveries.jsonl"),
            ),
            patch.multiple(
                harvest,
                CLAUDE_GLOB=str(self.root / "claude" / "*" / "*.jsonl"),
                CODEX_GLOBS=[str(self.root / "codex" / "*.jsonl")],
            ),
            # 카탈로그가 없는 labs 경로라 컴포넌트 별칭 없이 화면 단어로만 판별한다
            patch.object(lab, "LABS_DIR", str(self.root / "labs")),
            patch.object(effect, "INTRODUCED", dt.date(2026, 10, 3)),
            patch.object(effect, "BASELINE_PATH", str(state / "effect-baseline.json")),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

    def write_claude(self, name, lines):
        path = self.root / "claude" / "proj" / f"{name}.jsonl"
        path.write_text("".join(json.dumps(line, ensure_ascii=False) + "\n" for line in lines), encoding="utf-8")

    def replay(self):
        return {s.session: s for s in effect.replay(dt.date(2026, 9, 1), dt.date(2026, 9, 30))}

    def test_counts_only_screen_work_sessions_and_complaints_after_the_first_screen_request(self):
        self.write_claude("screen", [
            claude_line("user", "API 응답 형식을 정리해줘", "2026-09-10T00:00:00Z"),
            claude_line("user", "랜딩 페이지 디자인을 만들어줘", "2026-09-10T00:01:00Z"),
            claude_line("assistant", "레이아웃과 색상을 정리했습니다", "2026-09-10T00:02:00Z"),
            claude_line("user", "색상이 촌스러워요", "2026-09-10T00:03:00Z"),
            claude_line("user", "색상이 훨씬 좋네요", "2026-09-10T00:04:00Z"),
        ])
        self.write_claude("study", [claude_line("user", "알고리즘 문제 이어서 풀자", "2026-09-11T00:00:00Z")])
        self.write_claude("tool", [
            claude_line("user", "랜딩 디자인 색상이 촌스러워요", "2026-09-12T00:00:00Z", entrypoint="sdk-py"),
        ])
        sessions = self.replay()
        self.assertEqual(set(sessions), {"screen"}, "도구가 연 세션과 화면 작업이 없는 세션은 분모가 아니다")
        complaints = [v["text"] for v in sessions["screen"].complaints]
        self.assertEqual(complaints, ["색상이 촌스러워요"], "칭찬은 지적으로 세지 않는다")

    def test_complaints_the_user_marked_ignored_are_left_out(self):
        self.write_claude("screen", [
            claude_line("user", "랜딩 페이지 디자인을 만들어줘", "2026-09-10T00:01:00Z"),
            claude_line("user", "색상이 촌스러워요", "2026-09-10T00:03:00Z"),
        ])
        store.save_verdicts([{
            "id": "other-id", "ts": "2026-09-10T00:03:00+00:00", "source": "claude", "session": "screen",
            "project": "", "text": "색상이  촌스러워요", "context": "", "symptoms": [], "polarity": "negative",
            "origin": "harvest", "status": "ignored",
        }])
        self.assertEqual(self.replay()["screen"].complaints, [])

    @unittest.skipIf(effect.zstd is None, "compression.zstd가 없는 Python")
    def test_reads_codex_sessions_compressed_after_they_ended(self):
        lines = codex_lines("codex-1", ["레이아웃 디자인을 다시 잡아줘", "레이아웃이 어색해요"], "2026-09-20T00:00:00Z")
        raw = "".join(json.dumps(line, ensure_ascii=False) + "\n" for line in lines).encode()
        (self.root / "codex" / "rollout-1.jsonl.zst").write_bytes(effect.zstd.compress(raw))
        exec_lines = codex_lines("codex-exec", ["레이아웃 디자인을 다시 잡아줘"], "2026-09-20T00:00:00Z", source="exec")
        (self.root / "codex" / "rollout-2.jsonl").write_text(
            "".join(json.dumps(line, ensure_ascii=False) + "\n" for line in exec_lines), encoding="utf-8",
        )
        sessions = self.replay()
        self.assertEqual(set(sessions), {"codex-1"}, "codex exec 세션은 사람의 작업이 아니다")
        self.assertEqual([v["text"] for v in sessions["codex-1"].complaints], ["레이아웃이 어색해요"])

    def test_frozen_baseline_is_not_overwritten(self):
        self.write_claude("screen", [claude_line("user", "랜딩 페이지 디자인을 만들어줘", "2026-09-10T00:01:00Z")])
        first, created = effect.freeze_baseline()
        self.assertTrue(created)
        self.assertEqual(first["summary"]["sessions"], 1)
        self.write_claude("later", [claude_line("user", "대시보드 레이아웃 디자인", "2026-09-11T00:01:00Z")])
        second, created = effect.freeze_baseline()
        self.assertFalse(created)
        self.assertEqual(second, first)

    @unittest.skipIf(effect.zstd is None, "compression.zstd가 없는 Python")
    def test_new_version_preserves_original_and_is_not_replaced_on_rerun(self):
        self.write_claude("screen", [claude_line("user", "랜딩 페이지 디자인을 만들어줘", "2026-09-10T00:01:00Z")])
        effect.freeze_baseline()
        original = Path(effect.BASELINE_PATH).read_bytes()
        self.write_claude("later", [claude_line("user", "대시보드 레이아웃 디자인", "2026-09-11T00:01:00Z")])
        path, first, created = effect.save_baseline_version("압축 읽기 검산")
        self.assertTrue(created)
        self.assertEqual(first["summary"]["sessions"], 2)
        self.assertEqual(first["previous"]["summary"]["sessions"], 1)
        self.write_claude("third", [claude_line("user", "대시보드 디자인", "2026-09-12T00:01:00Z")])
        same, second, created = effect.save_baseline_version("재실행")
        self.assertFalse(created)
        self.assertEqual((same, second), (path, first))
        self.assertEqual(Path(effect.BASELINE_PATH).read_bytes(), original)


class RepeatedAfterDeliveryTests(unittest.TestCase):
    def test_only_complaints_matching_a_delivered_rule_in_the_same_session_count(self):
        rules = [{"id": "motion", "title": "연속된 전환", "symptoms": ["motion-swap"]}]
        deliveries = [{"ts": "2026-10-05T00:00:00+00:00", "via": "hook", "session": "s", "rules": ["motion"]}]

        def verdict(text, symptoms, ts="2026-10-05T01:00:00+00:00", session="s", **extra):
            return {"ts": ts, "session": session, "text": text, "symptoms": symptoms,
                    "status": "kept", "polarity": "negative", **extra}

        verdicts = [
            verdict("순간이동해요", ["motion-swap"]),
            verdict("색이 칙칙해요", ["color-dated"]),
            verdict("전달 전 지적", ["motion-swap"], ts="2026-10-04T23:00:00+00:00"),
            verdict("다른 세션", ["motion-swap"], session="t"),
            verdict("무시한 지적", ["motion-swap"], status="ignored"),
        ]
        found = effect.repeated_after_delivery(verdicts, deliveries, rules, dt.date(2026, 10, 1), dt.date(2026, 10, 31))
        self.assertEqual([item["verdict"]["text"] for item in found], ["순간이동해요"])
        self.assertEqual(found[0]["rules"], ["연속된 전환"])


if __name__ == "__main__":
    unittest.main()
