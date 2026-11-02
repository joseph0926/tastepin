"""`taste.py doctor`: 이 머신에서 취향이 제대로 소비되는지 한 번에 본다.

훅 설정, 동봉된 스킬과 설치본의 일치, labs 카탈로그, lint 실행 도구, 사본을 남긴 저장소의 낡음,
최근 기록을 확인한다. 고칠 것이 있으면 종료 코드 1을 돌려준다. 설정 파일은 읽기만 한다.
"""

import json
import os
import shutil

from . import lab, repo, store

HOME = lab.HOME
SKILL_DIR = os.path.join(store.ROOT, "skills", "tastepin")


def _read(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return None


def _hook_lines():
    # 훅은 선택 기능이며, 다른 taste 설치의 훅을 이 설치의 정상 상태로 세지 않는다.
    return [(True, "훅은 선택 기능입니다. Tastepin은 전역 훅을 자동 설치하지 않습니다")]


def _skill_lines():
    source = _read(os.path.join(SKILL_DIR, "SKILL.md"))
    results = [(bool(source and "apply-context" in source), "동봉된 tastepin 스킬")]
    installed = os.path.join(HOME, ".agents", "skills", "tastepin", "SKILL.md")
    content = _read(installed)
    if content is not None:
        results.append((content == source, "설치된 tastepin 스킬이 동봉본과 같다"))
    else:
        results.append((True, "홈 스킬 설치 생략됨. README의 스킬 설치 안내를 따르세요"))
    return results


def _tool_lines():
    results = []
    try:
        catalog = lab.load_catalog()
        results.append((bool(catalog["components"]), f"labs 카탈로그 {len(catalog['components'])}개 시편({lab.catalog_path().replace(HOME, '~')})"))
    except (OSError, ValueError) as error:
        results.append((False, f"labs 카탈로그를 읽지 못했다: {error}"))
    uv = shutil.which("uv") or os.path.expanduser("~/.local/bin/uv")
    results.append((os.path.exists(uv), "lint 실행 도구 uv"))
    return results


def _ledger_lines():
    results = [(True, f"기록 폴더 {store.DATA_ROOT.replace(HOME, '~')}")]
    unknown = store.unknown_symptoms(store.load_rules(), store.load_symptoms())
    for rule_id, symptoms in unknown.items():
        results.append((False, f"규칙 {rule_id}의 증상 중 카탈로그에 없는 것: {', '.join(symptoms)}"))
    if not unknown:
        results.append((True, "규칙이 참조하는 증상이 모두 카탈로그에 있다"))
    return results


def _repo_lines():
    results = []
    for path in repo.applied_repos():
        full = os.path.expanduser(path)
        if not os.path.isdir(full):
            results.append((True, f"{path}: 이 머신에 없음(다른 머신에서 적용)"))
            continue
        try:
            _, expected, _ = repo.plan(full)
            changed = repo.stale(expected)
        except ValueError as error:
            results.append((False, f"{path}: 확인하지 못함({error})"))
            continue
        hint = f". `taste.py apply {path}`" if changed else ""
        results.append((not changed, f"{path}: 취향 사본 " + (f"{len(changed)}개 파일이 낡음{hint}" if changed else "최신")))
    return results


def _recent_lines():
    deliveries = store.load_deliveries()
    applied = [d for d in deliveries if d["via"] == "skill"]
    lints = store.load_lint_log()
    verdicts = store.load_verdicts()
    lines = [
        f"마지막 /taste 적용: {applied[-1]['ts'][:16] if applied else '없음'}",
        f"마지막 lint 기록: {lints[-1]['ts'][:16] if lints else '없음'}",
        f"마지막 판정: {verdicts[-1]['ts'][:16] if verdicts else '없음'}",
    ]
    return lines


def report():
    sections = (
        ("훅", _hook_lines()),
        ("스킬", _skill_lines()),
        ("원장", _ledger_lines()),
        ("도구", _tool_lines()),
        ("저장소 사본", _repo_lines()),
    )
    lines, problems = [], 0
    for title, results in sections:
        lines.append(title)
        if not results:
            lines.append("  - 해당 없음")
        for ok, text in results:
            problems += not ok
            lines.append(f"  {'정상' if ok else '확인 필요'}  {text}")
    lines.append("최근")
    lines += [f"  {line}" for line in _recent_lines()]
    lines.append(f"\n확인할 것 {problems}개" if problems else "\n모두 정상")
    return "\n".join(lines) + "\n", problems
