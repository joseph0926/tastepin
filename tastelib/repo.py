"""작업 저장소에 취향 사본을 남긴다(`taste.py apply <저장소>`).

개인 훅과 스킬은 클라우드 세션과 다른 머신에 닿지 않는다. 저장소에 커밋되는 사본은 어디서든 읽힌다.
- `.taste/AGENT.md`: 이동식 적용 문구. `/tastepin`가 원장을 찾지 못하면 이 파일을 읽는다
- `.taste/components/<id>.md`: 컴포넌트별 고른 값
- `.taste/taste.css`, `taste.tailwind.css`, `taste.motion.ts`: 토큰
- `.agents/skills/tastepin/`: 동봉된 스킬 사본. 원장이 없는 환경에서는 `.taste/AGENT.md`를 읽는다
- `AGENTS.md`(와 따로 쓰는 `CLAUDE.md`)의 표시 구간: `.taste/AGENT.md`가 어디 있는지 알린다
커밋은 하지 않는다. `--check`는 지금 원장으로 다시 만든 내용과 저장소 사본을 비교한다.
"""

import datetime as dt
import json
import os

from . import context, lab, store, tokens

MARK_START = "<!-- taste:start -->"
MARK_END = "<!-- taste:end -->"
POINTER = (
    "UI나 애니메이션 작업에서 사용자가 `/tastepin`(Codex는 `$tastepin`)로 취향 적용을 요청하거나 취향을 쓰라고 하면 "
    "`.taste/AGENT.md`를 읽고 그 값을 기본값으로 쓴다. `.taste/`는 `taste.py apply`가 만든 생성물이라 직접 고치지 않는다."
)
HOME_SKILLS = (
    (os.path.join(store.ROOT, "skills", "tastepin"), os.path.join(".agents", "skills", "tastepin")),
)

APPLIED_PATH = os.path.join(store.STATE_DIR, "applied.json")
README = """# .taste

취향 원장(`<tastepin 설치 경로>`)이 `taste.py apply`로 만든 사본이다. 직접 고치지 않는다. 사용자가 labs에서 값을 고르거나
규칙을 고치면 원장이 있는 머신에서 `python3 -B <tastepin 설치 경로>/taste.py apply <이 저장소>`로 다시 만든다.
`taste.py apply <이 저장소> --check`는 사본이 낡았는지 알려 준다.

- `AGENT.md`: `/tastepin`가 읽는 취향. 화면 전체 값, 모션 기본값, 규칙
- `components/<id>.md`: 컴포넌트별로 고른 값
- `taste.css`: `--taste-*` CSS 변수. 바탕색은 라이트와 다크를 나눈다
- `taste.tailwind.css`: Tailwind v4. 전역 CSS에서 `@import "tailwindcss";` 뒤에 import하면 `bg-ground`, `text-body`,
  `text-title`, `rounded-surface`, `p-block`, `ease-taste` 같은 유틸리티가 생긴다
- `taste.motion.ts`: motion/react 프리셋(`tasteTransition`, `tasteEnter`, `tastePress`, `tasteSpring` 등)
"""


def generated_files(catalog, judgments, rules_doc, verdicts, symptoms_doc):
    """저장소 루트 기준 경로와 내용. 홈 스킬 사본은 skill_files가 따로 만든다."""
    agent, _ = context.build(catalog, judgments, rules_doc, verdicts, symptoms_doc, portable=True)
    files = {
        ".taste/README.md": README,
        ".taste/AGENT.md": agent,
    }
    for component in catalog["components"]:
        if not lab.is_global(component):
            files[f".taste/components/{component['id']}.md"] = context.component_doc(
                component, judgments, rules_doc["rules"], verdicts,
            )
    for name, text in tokens.render_all(catalog, judgments).items():
        files[f".taste/{name}"] = text
    return files


def skill_files():
    """저장소에 포함된 tastepin 스킬의 파일들. 없으면 빈 묶음과 빠진 위치를 돌려준다."""
    files, missing = {}, []
    for source, target in HOME_SKILLS:
        if not os.path.isdir(source):
            missing.append(source.replace(lab.HOME, "~"))
            continue
        for root, _, names in os.walk(source):
            for name in names:
                path = os.path.join(root, name)
                relative = os.path.relpath(path, source)
                with open(path, encoding="utf-8") as handle:
                    files[os.path.join(target, relative)] = handle.read()
    return files, missing


def _pointer_targets(repo):
    """표시 구간을 넣을 지침 파일. CLAUDE.md가 AGENTS.md를 가져오기만 하면 AGENTS.md 하나로 충분하다."""
    agents = os.path.join(repo, "AGENTS.md")
    claude = os.path.join(repo, "CLAUDE.md")
    targets = []
    if os.path.exists(agents):
        targets.append(agents)
    if os.path.exists(claude):
        with open(claude, encoding="utf-8") as handle:
            if "@AGENTS.md" not in handle.read():
                targets.append(claude)
    return targets


def _with_pointer(text):
    block = f"{MARK_START}\n{POINTER}\n{MARK_END}"
    if MARK_START in text and MARK_END in text:
        start = text.index(MARK_START)
        end = text.index(MARK_END) + len(MARK_END)
        return text[:start] + block + text[end:]
    return text.rstrip("\n") + ("\n\n" if text.strip() else "") + block + "\n"


def plan(repo):
    """쓰거나 확인할 파일 전체(경로, 기대 내용)와 경고."""
    repo = os.path.abspath(os.path.expanduser(repo))
    if not os.path.isdir(repo):
        raise ValueError(f"저장소 폴더가 없습니다: {repo}")
    try:
        catalog = lab.load_catalog()
    except (OSError, ValueError) as error:
        raise ValueError(f"시편 카탈로그를 읽지 못했습니다: {error}") from error
    files = generated_files(
        catalog, lab.load_judgments(), store.load_rules(), store.load_verdicts(), store.load_symptoms(),
    )
    skills, missing = skill_files()
    files.update(skills)
    warnings = [f"tastepin 스킬 원본이 없어 저장소 사본을 만들지 못했습니다: {path}" for path in missing]
    expected = {os.path.join(repo, path): text for path, text in files.items()}
    targets = _pointer_targets(repo)
    if not targets:
        expected[os.path.join(repo, "AGENTS.md")] = _with_pointer("")
        if not os.path.exists(os.path.join(repo, "CLAUDE.md")):
            expected[os.path.join(repo, "CLAUDE.md")] = "@AGENTS.md\n"
    for path in targets:
        with open(path, encoding="utf-8") as handle:
            expected[path] = _with_pointer(handle.read())
    return repo, expected, warnings


def stale(expected):
    """기대 내용과 다른 파일, 그리고 원장에 없어진 컴포넌트의 남은 사본."""
    changed = []
    for path, text in expected.items():
        try:
            with open(path, encoding="utf-8") as handle:
                if handle.read() != text:
                    changed.append(path)
        except OSError:
            changed.append(path)
    taste_dirs = {os.path.dirname(p) for p in expected if f"{os.sep}.taste{os.sep}components" in p}
    for directory in taste_dirs:
        for name in os.listdir(directory) if os.path.isdir(directory) else []:
            path = os.path.join(directory, name)
            if path not in expected:
                changed.append(path)
    return changed


def apply(repo):
    repo, expected, warnings = plan(repo)
    written = []
    # 원장에서 없어진 컴포넌트의 사본만 지운다
    components = os.path.join(repo, ".taste", "components")
    for name in os.listdir(components) if os.path.isdir(components) else []:
        path = os.path.join(components, name)
        if path not in expected:
            os.remove(path)
            written.append(path)
    for path, text in expected.items():
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            with open(path, encoding="utf-8") as handle:
                if handle.read() == text:
                    continue
        except OSError:
            pass
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
        written.append(path)
    _remember(repo)
    return repo, written, warnings


def _remember(repo):
    """doctor가 사본이 낡았는지 다시 볼 수 있게 적용한 저장소를 남긴다."""
    try:
        with open(APPLIED_PATH, encoding="utf-8") as handle:
            applied = json.load(handle)
    except (OSError, ValueError):
        applied = {}
    applied[repo.replace(lab.HOME, "~")] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    os.makedirs(store.STATE_DIR, exist_ok=True)
    store._write_atomic(APPLIED_PATH, json.dumps(applied, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def applied_repos():
    try:
        with open(APPLIED_PATH, encoding="utf-8") as handle:
            return sorted(json.load(handle))
    except (OSError, ValueError):
        return []
