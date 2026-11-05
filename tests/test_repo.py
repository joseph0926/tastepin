"""토큰 생성과 저장소 사본(taste.py tokens, apply)을 임시 원장, 임시 카탈로그, 임시 저장소에서 검사한다."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

TASTE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TASTE_ROOT))

from tastelib import lab, repo, store, tokens


def dimension(dim_id, values, **extra):
    return {"id": dim_id, "label": dim_id, "question": "?", **extra, "values": [
        {"id": value_id, "label": value_id, "spec": value_id, "tokens": value_tokens}
        for value_id, value_tokens in values.items()
    ]}


CATALOG = {"version": 1, "components": [
    {"id": "surface", "label": "화면 표면", "scope": "global", "axis": "visual", "file": "Surface.tsx", "aliases": [],
     "dimensions": [
         dimension("ground", {"cool": {"bg-light": "#f3f5f8", "bg-dark": "#101318"},
                              "warm": {"bg-light": "#f6f5f1", "bg-dark": "#14130f"}}),
         dimension("radius", {"small": {"radius-surface": "6px"}, "soft": {"radius-surface": "12px"}}),
         dimension("accent", {"teal": {"accent-light": "#0f766e", "accent-dark": "#5cc8b8"},
                              "ink": {"accent-light": "#1b1d22", "accent-dark": "#eceef2"}}),
     ]},
    {"id": "reading", "label": "글과 밀도", "scope": "global", "axis": "visual", "file": "Reading.tsx", "aliases": [],
     "dimensions": [
         dimension("heading", {"weight": {"font-size-title": "21px", "font-weight-title": "750"},
                               "scale": {"font-size-title": "30px", "font-weight-title": "600"}}),
         dimension("titleweight", {"bold": {"font-weight-title": "650"}, "heavy": {"font-weight-title": "750"}},
                   requires={"heading": ["weight"]}),
     ]},
    {"id": "motion-feel", "label": "모션 성격", "scope": "global", "axis": "motion", "file": "MotionFeel.tsx",
     "aliases": [], "dimensions": [
         dimension("curve", {"cubic": {"ease": "cubic-bezier(0.215, 0.61, 0.355, 1)"},
                             "quint": {"ease": "cubic-bezier(0.23, 1, 0.32, 1)"}}),
         dimension("tempo", {"medium": {"duration": "220ms"}, "quick": {"duration": "160ms"}}),
     ]},
    {"id": "tabs", "label": "탭", "file": "Tabs.tsx", "aliases": ["탭 ?메뉴"],
     "dimensions": [dimension("indicator", {"underline": {}, "pill": {}})]},
]}


class RepoTestCase(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="taste-repo-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        state, labs, home = self.root / "state", self.root / "labs", self.root / "home"
        (labs / "src" / "specimens").mkdir(parents=True)
        state.mkdir()
        (labs / "src" / "specimens" / "catalog.json").write_text(json.dumps(CATALOG, ensure_ascii=False), encoding="utf-8")
        rules = {"rules": [{"id": "surface-grouping", "axis": "surface", "status": "확정", "title": "여백으로 묶기",
                            "avoid": "과한 테두리", "do": "여백으로 구분", "symptoms": []}]}
        (state / "rules.json").write_text(json.dumps(rules, ensure_ascii=False), encoding="utf-8")
        (state / "symptoms.json").write_text(json.dumps({"symptoms": []}), encoding="utf-8")
        skill = home / ".claude" / "skills" / "taste"
        skill.mkdir(parents=True)
        (skill / "SKILL.md").write_text("---\nname: taste\n---\n", encoding="utf-8")
        patches = [
            patch.multiple(store, STATE_DIR=str(state), RULES_PATH=str(state / "rules.json"),
                           SYMPTOMS_PATH=str(state / "symptoms.json"), VERDICTS_PATH=str(state / "verdicts.jsonl"),
                           DELIVERIES_PATH=str(state / "deliveries.jsonl")),
            patch.multiple(lab, LABS_DIR=str(labs), JUDGMENTS_PATH=str(state / "judgments.jsonl")),
            patch.multiple(repo, APPLIED_PATH=str(state / "applied.json"), HOME_SKILLS=(
                (str(skill), os.path.join(".claude", "skills", "taste")),
                (str(home / ".agents" / "skills" / "taste"), os.path.join(".agents", "skills", "taste")),
            )),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        self.repo = self.root / "project"
        self.repo.mkdir()

    def choose(self, component, dim_id, value, times=2):
        for _ in range(times):
            options = [v["id"] for c in CATALOG["components"] if c["id"] == component
                       for d in c["dimensions"] if d["id"] == dim_id for v in d["values"]]
            lab.record_judgment({"component": component, "dimension": dim_id, "options": options,
                                 "outcome": "chose", "choice": value})


class TokenTests(RepoTestCase):
    def test_later_dimension_wins_and_unchosen_dimensions_are_left_out(self):
        self.choose("reading", "heading", "weight")
        self.choose("reading", "titleweight", "bold")
        collected = tokens.collect(lab.load_catalog(), lab.load_judgments())
        self.assertEqual(collected, {"font-size-title": "21px", "font-weight-title": "650"},
                         "제목 굵기가 제목 위계의 굵기를 덮고, 고르지 않은 차원은 내보내지 않는다")

    def test_css_splits_light_and_dark_and_tailwind_only_maps_known_tokens(self):
        self.choose("surface", "ground", "cool")
        self.choose("surface", "radius", "small")
        files = tokens.render_all(lab.load_catalog(), lab.load_judgments())
        css = files["taste.css"]
        self.assertIn("  --taste-bg: #f3f5f8;", css.split("@media")[0])
        self.assertIn('[data-theme="dark"],\n.dark {\n  --taste-bg: #101318;\n}', css)
        tailwind = files["taste.tailwind.css"]
        self.assertIn("--color-ground: var(--taste-bg);", tailwind)
        self.assertIn("--radius-surface: var(--taste-radius-surface);", tailwind)
        self.assertNotIn("--text-title", tailwind, "고르지 않은 값의 Tailwind 이름은 만들지 않는다")

    def test_chosen_accent_reaches_tailwind_color_with_dark_value(self):
        self.choose("surface", "accent", "teal")
        files = tokens.render_all(lab.load_catalog(), lab.load_judgments())
        self.assertIn("  --taste-accent: #0f766e;", files["taste.css"].split("@media")[0])
        self.assertIn("  --taste-accent: #5cc8b8;", files["taste.css"].split("@media")[1])
        self.assertIn("--color-accent: var(--taste-accent);", files["taste.tailwind.css"])

    def test_motion_presets_use_seconds_and_bezier_arrays(self):
        self.choose("motion-feel", "curve", "cubic")
        self.choose("motion-feel", "tempo", "medium")
        motion = tokens.render_all(lab.load_catalog(), lab.load_judgments())["taste.motion.ts"]
        self.assertIn("export const tasteEase = [0.215, 0.61, 0.355, 1] as const;", motion)
        self.assertIn("export const tasteDuration = 0.22;", motion)
        self.assertIn("export const tasteTransition = { duration: tasteDuration, ease: tasteEase };", motion)


class ApplyTests(RepoTestCase):
    def test_apply_writes_copy_pointer_and_skill_then_check_passes(self):
        self.choose("surface", "radius", "small")
        (self.repo / "AGENTS.md").write_text("# 프로젝트\n", encoding="utf-8")
        (self.repo / "CLAUDE.md").write_text("@AGENTS.md\n", encoding="utf-8")
        _, written, warnings = repo.apply(str(self.repo))
        self.assertTrue(written)
        self.assertEqual(warnings, ["tastepin 스킬 원본이 없어 저장소 사본을 만들지 못했습니다: " + str(
            self.root / "home" / ".agents" / "skills" / "taste")])
        agent = (self.repo / ".taste" / "AGENT.md").read_text(encoding="utf-8")
        self.assertIn("- radius: small. small", agent)
        self.assertIn("`.taste/components/<id>.md`를 읽는다", agent, "사본은 원장 명령 대신 저장소 파일을 가리킨다")
        self.assertTrue((self.repo / ".taste" / "components" / "tabs.md").exists())
        self.assertTrue((self.repo / ".taste" / "taste.css").exists())
        self.assertTrue((self.repo / ".claude" / "skills" / "taste" / "SKILL.md").exists())
        agents_md = (self.repo / "AGENTS.md").read_text(encoding="utf-8")
        self.assertEqual(agents_md.count(repo.MARK_START), 1)
        self.assertEqual((self.repo / "CLAUDE.md").read_text(encoding="utf-8"), "@AGENTS.md\n",
                         "AGENTS.md를 가져오는 CLAUDE.md에는 따로 넣지 않는다")
        _, again, _ = repo.apply(str(self.repo))
        self.assertEqual(again, [], "같은 원장으로 다시 적용하면 바뀌는 파일이 없다")
        self.assertEqual((self.repo / "AGENTS.md").read_text(encoding="utf-8").count(repo.MARK_START), 1)
        self.assertEqual(repo.stale(repo.plan(str(self.repo))[1]), [])
        self.assertEqual(repo.applied_repos(), [str(self.repo).replace(lab.HOME, "~")])

    def test_check_names_files_that_fell_behind_the_ledger(self):
        repo.apply(str(self.repo))
        self.choose("surface", "radius", "soft")
        stale = [os.path.relpath(p, self.repo) for p in repo.stale(repo.plan(str(self.repo))[1])]
        self.assertIn(os.path.join(".taste", "AGENT.md"), stale)
        self.assertIn(os.path.join(".taste", "taste.css"), stale)

    def test_repo_without_instructions_gets_agents_md_and_claude_import(self):
        repo.apply(str(self.repo))
        self.assertIn(repo.POINTER, (self.repo / "AGENTS.md").read_text(encoding="utf-8"))
        self.assertEqual((self.repo / "CLAUDE.md").read_text(encoding="utf-8"), "@AGENTS.md\n")

    def test_separate_claude_md_gets_its_own_pointer(self):
        (self.repo / "CLAUDE.md").write_text("# Claude 전용 지침\n", encoding="utf-8")
        repo.apply(str(self.repo))
        self.assertIn(repo.MARK_START, (self.repo / "CLAUDE.md").read_text(encoding="utf-8"))
        self.assertFalse((self.repo / "AGENTS.md").exists())

    def test_removed_component_copy_is_cleaned(self):
        repo.apply(str(self.repo))
        leftover = self.repo / ".taste" / "components" / "gone.md"
        leftover.write_text("옛 컴포넌트", encoding="utf-8")
        self.assertIn(str(leftover), repo.stale(repo.plan(str(self.repo))[1]))
        repo.apply(str(self.repo))
        self.assertFalse(leftover.exists())


if __name__ == "__main__":
    unittest.main()
