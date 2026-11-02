"""Claude Code와 Codex의 Stop 훅: 취향을 받은 화면 작업이 lint 없이 끝나지 않게 한다.

막는 조건은 셋이 모두 맞을 때다.
- 이 세션에 `/tastepin` 적용 기록(`via: skill`)이 있다
- 이번 턴(마지막 사람 입력 뒤)에 화면 파일을 고쳤다
- 그 뒤에 `taste.py lint`를 실행하지 않았다
이미 이 훅 때문에 이어 가는 중이면(`stop_hook_active`) 막지 않는다. 열 화면이 없으면 에이전트가 이유를 적고 끝낸다.
Claude Code는 transcript를 읽고, Codex는 안정된 PostToolUse 입력을 턴별 임시 파일에 기록해 Stop에서 읽는다.
훅 계약은 https://code.claude.com/docs/en/hooks 와 https://learn.chatgpt.com/docs/hooks 를 따른다.
"""

import hashlib
import json
import os
import re

from . import inject, store

UI_FILE = re.compile(r"\.(tsx|jsx|css|scss|sass|less|vue|svelte|html|astro|mdx)$", re.I)
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
# 안내 명령은 공백이 든 경로를 인용하므로 taste.py 뒤에 닫는 따옴표가 올 수 있다
LINT_CALL = re.compile(r"taste\.py['\"]?\s+lint\b|(^|\s)/taste\s+(점검|lint)\b")
PATCH_PATH = re.compile(r"^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$", re.M)


def _content(entry):
    message = entry.get("message") or {}
    content = message.get("content")
    return content if isinstance(content, list) else [{"type": "text", "text": content or ""}]


def _is_human_turn(entry):
    """사람이 입력한 메시지. 도구 결과, 압축 요약, 하네스가 넣은 메시지는 턴의 시작이 아니다.
    백그라운드 작업 알림(`<task-notification>`)은 isMeta 없이 user로 남으므로 프롬프트 훅과 같은 표식으로 거른다."""
    if entry.get("type") != "user" or entry.get("isMeta") or entry.get("isSidechain") or entry.get("isCompactSummary"):
        return False
    items = [item for item in _content(entry) if isinstance(item, dict)]
    if any(item.get("type") == "tool_result" for item in items):
        return False
    text = " ".join(str(item.get("text", "")) for item in items if item.get("type") == "text")
    return not inject.HARNESS_MARKERS.search(text)


def turn_actions(lines):
    """마지막 사람 입력 뒤의 도구 호출(이름, 입력)을 순서대로."""
    entries = []
    for line in lines:
        try:
            entries.append(json.loads(line))
        except ValueError:
            continue
    start = max((i for i, e in enumerate(entries) if _is_human_turn(e)), default=-1)
    actions = []
    for entry in entries[start + 1:]:
        if entry.get("type") != "assistant":
            continue
        for item in _content(entry):
            if isinstance(item, dict) and item.get("type") == "tool_use":
                actions.append((item.get("name", ""), item.get("input") or {}))
    return actions


def needs_lint(actions):
    """화면 파일을 고친 뒤 lint를 돌리지 않았으면 고친 파일 목록을 돌려준다."""
    edited = []
    for name, payload in actions:
        path = payload.get("file_path") or payload.get("notebook_path") or ""
        if name in EDIT_TOOLS and UI_FILE.search(path):
            edited.append(path)
        elif name == "Bash" and LINT_CALL.search(payload.get("command", "")):
            edited = []
    return edited


def _codex_turn_path(payload):
    session = payload.get("session_id")
    turn = payload.get("turn_id")
    if not isinstance(session, str) or not session or not isinstance(turn, str) or not turn:
        return None
    key = hashlib.sha256(f"{session}\0{turn}".encode()).hexdigest()
    return os.path.join(store.STATE_DIR, "stop-actions", f"{key}.jsonl")


def _append_codex_action(path, action):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = (json.dumps(action, ensure_ascii=False) + "\n").encode()
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    try:
        os.write(descriptor, data)
    finally:
        os.close(descriptor)


def track_codex(payload):
    """Codex PostToolUse의 화면 수정과 lint 실행만 턴별로 기록한다."""
    if payload.get("hook_event_name") != "PostToolUse":
        return
    if not _skill_session(payload.get("session_id", "")):
        return
    path = _codex_turn_path(payload)
    tool_input = payload.get("tool_input")
    if path is None or not isinstance(tool_input, dict):
        return
    command = tool_input.get("command")
    if not isinstance(command, str):
        return
    tool_name = payload.get("tool_name")
    if tool_name == "apply_patch":
        paths = [match.strip() for match in PATCH_PATH.findall(command) if UI_FILE.search(match.strip())]
        if paths:
            _append_codex_action(path, {"kind": "edit", "paths": paths})
    elif tool_name == "Bash" and LINT_CALL.search(command):
        _append_codex_action(path, {"kind": "lint"})


def _codex_edits(payload):
    """이번 Codex 턴에서 마지막 lint 뒤에 남은 화면 파일. 읽은 임시 기록은 지운다."""
    path = _codex_turn_path(payload)
    if path is None:
        return []
    try:
        with open(path, encoding="utf-8") as handle:
            actions = [json.loads(line) for line in handle if line.strip()]
    except FileNotFoundError:
        return []
    finally:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
    edited = []
    for action in actions:
        if action.get("kind") == "edit":
            edited.extend(action.get("paths", []))
        elif action.get("kind") == "lint":
            edited = []
    return edited


def _skill_session(session):
    """/taste 스킬(via=skill)로 취향을 받은 세션. inject의 판정 기록과 달리 design-handoff 구현 단계(handoff-implement)로
    받은 세션은 여기 들지 않아 lint를 요구받지 않는다."""
    return bool(session) and any(
        d["session"] == session and d["via"] == "skill" for d in store.load_deliveries()
    )


def check(payload, surface="claude"):
    """막을 때만 Stop 훅 출력(dict)을 돌려준다."""
    # Codex 턴 기록은 막지 않고 끝나는 Stop(이어 가는 중인 턴 포함)에서도 읽어서 지운다
    codex_edited = _codex_edits(payload) if surface == "codex" else None
    if payload.get("stop_hook_active"):
        return None
    session = payload.get("session_id", "")
    if not _skill_session(session):
        return None
    if codex_edited is not None:
        edited = codex_edited
    else:
        try:
            with open(payload.get("transcript_path", ""), encoding="utf-8") as handle:
                edited = needs_lint(turn_actions(handle))
        except OSError:
            return None
    if not edited:
        return None
    names = ", ".join(sorted({path.rsplit("/", 1)[-1] for path in edited})[:5])
    return {
        "decision": "block",
        "reason": (
            f"이번 턴에 화면 파일({names})을 고쳤는데 취향 lint를 돌리지 않았다. 열어 볼 URL이나 HTML 파일이 있으면 "
            f"`{store.LINT_COMMAND} --session {session}`을 실행해 실패를 고치고 실패와 주의 수를 보고한다. "
            "열 수 있는 화면이 없으면 그 이유를 결과 보고에 한 줄로 적고 끝낸다."
        ),
    }
