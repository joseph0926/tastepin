"""Claude Code와 Codex 대화 기록에서 디자인 판정 발화를 찾아 원장 후보로 만든다.

파일마다 읽은 바이트 위치를 cursor에 저장해 다음 실행에서는 새로 붙은 줄만 읽는다.
세션의 디자인 맥락 점수와 직전 assistant 발화도 cursor에 보관해야
이어 읽기에서도 판정 기준이 첫 실행과 같아진다.
Codex가 끝난 세션을 압축한 .jsonl.zst는 압축 전 .jsonl의 cursor를 이어받아 남은 부분만 읽는다.
"""

import datetime as dt
import glob
import hashlib
import json
import os
import re

try:
    from compression import zstd  # Python 3.14 표준 라이브러리
except ImportError:
    zstd = None

HOME = os.path.expanduser("~")
CLAUDE_GLOB = HOME + "/.claude/projects/*/*.jsonl"
CODEX_GLOBS = [HOME + "/.codex/sessions/**/*.jsonl", HOME + "/.codex/archived_sessions/*.jsonl"]
COMPRESSED = ".zst"
# 압축 중 사라진 원본, 아직 다 쓰지 못했거나 깨진 압축본에서 나는 오류
READ_ERRORS = (OSError, EOFError) + ((zstd.ZstdError,) if zstd is not None else ())

# 사람이 쓴 요청이 아니라 하네스가 끼워 넣은 메시지의 시작 부분
INJECTED_PREFIXES = (
    "<command-", "<local-command", "<system-reminder", "Caveat:", "<task-notification",
    "<user_instructions", "<environment_context", "<skill>", "<recommended_plugins",
    "<app-context", "# AGENTS.md", "<turn_aborted", "<subagent", "<realtime_delegation",
    "<codex_delegation", "A previous agent produced the plan", "PLEASE IMPLEMENT THIS PLAN",
    "This session is being continued", "## Code review guidelines", "# Review findings",
    "<send_user_message", "[SYSTEM NOTIFICATION", "[crew 위임 작업]",
)

# 영어 단어는 앞이 영문자가 아닐 때만 센다. 훅 판별(inject.UI_WORK)과 같이 "promotions"의 motion,
# "emotional"의 motion 같은 단어 속 일치를 거른다(2026-10-21). 원래 일치하던 redesign과 scss는 따로 적었다
DESIGN_WORDS = re.compile(
    r"디자인|uiux|ui/ux|애니메이션|모션|레이아웃|타이포|폰트|색상|컬러|시안|목업|프로토타입|리디자인|랜딩|about ?페이지|"
    r"라디우스|스크롤 ?애니|호버|다크 ?모드|카드 ?형태|모달|"
    r"(?<![a-z])(?:design|redesign|animation|motion|layout|font|color|tailwind|css|scss|mockup|hero|border|radius|"
    r"hover|drawer)",
    re.I,
)

# 판정 신호: 화면을 보고 내린 평가에 자주 쓰는 말
VERDICT_WORDS = re.compile(
    r"촌스|어색|별로|마음에|좋네|훨씬 좋|취향 ?저격|아쉬|안 ?보|끊기듯|끊겨 ?보|밋밋|더 화려|화려하게|ai ?스러|ai ?티|"
    r"slop|부드럽|깔끔|답답|과한|과하|많고|많음|많습니다|많아|튀|짤|잘린|예쁘|이쁘|못생|싼티|누리끼리|칙칙|"
    r"지저분|심심|어지럽|정신없|느려|느림|거슬|자연스럽|부자연|딱딱|뚝뚝|깜빡|번쩍|ppt|가독성|"
    r"남아 ?있|빠져나오|경계가|이질|지금보다 못|차이 ?없|밀도가|빽빽|순간 ?이동",
    re.I,
)

# 깔끔, 부드럽, 자연스럽은 판정 신호어(VERDICT_WORDS)에 있으면서 칭찬으로 쓰는 말이다. 이 목록에 없으면 기본값인 지적이 된다.
# "더 깔끔하게", "부드럽지 않", "부자연스럽"처럼 바꿔 달라거나 부정하는 말은 칭찬으로 세지 않는다
PRAISE_STEMS = r"(?<![더덜안] )(?:깔끔|부드럽|부드러|(?<!부)자연스럽|(?<!부)자연스러)(?!하?게|하?지 ?않)"
POSITIVE = re.compile(
    r"좋네|훨씬 좋|취향 ?저격|마음에 쏙|마음에 듭|마음에 들|거의 완벽|통과|좋아졌|나아짐|예쁘|이쁘|정상|" + PRAISE_STEMS
)
NEGATIVE = re.compile(
    r"촌스|어색|별로|아쉬|안 ?보|끊기듯|밋밋|과한|과하|많고|많음|많습니다|튀|짤|잘린|싼티|누리끼리|칙칙|"
    r"지저분|심심|어지럽|정신없|느려|느림|거슬|부자연|딱딱|뚝뚝|깜빡|번쩍|ppt|가독성|남아 ?있|이질|못하|없음|"
    r"ai ?스러|ai ?티|slop|밀도가|빽빽|순간 ?이동",
    re.I,
)

MAX_VERDICT_CHARS = 600
# 스킬 호출, 붙여넣은 문서, 작업 지시서는 화면에 대한 반응이 아니라 요청이다
REQUEST_MARKERS = re.compile(r"^\s*(/|\$|\[\$|목표:)|```|<pasted_content")
SESSION_DESIGN_THRESHOLD = 4


def parse_ts(value):
    try:
        return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def claude_event(record):
    """Claude Code 한 줄을 (role, text, ts, cwd)로 바꾼다. 대화 발화가 아니면 None."""
    if record.get("isSidechain") or record.get("isMeta"):
        return None
    kind = record.get("type")
    if kind not in ("user", "assistant"):
        return None
    content = (record.get("message") or {}).get("content")
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        # tool_result만 있는 user 줄은 사람의 발화가 아니다
        text = "\n".join(
            part.get("text", "") for part in content if isinstance(part, dict) and part.get("type") == "text"
        )
    else:
        return None
    return kind, text.strip(), record.get("timestamp"), record.get("cwd", "")


def codex_event(record, state):
    payload = record.get("payload") or {}
    kind = record.get("type")
    if kind == "session_meta":
        state["cwd"] = payload.get("cwd", "")
        # 훅 입력의 session_id와 같은 값이라 전달 기록과 판정을 세션으로 이을 수 있다
        state["session_id"] = payload.get("id", "")
        source = json.dumps(payload.get("source", ""), ensure_ascii=False)
        state["is_subagent"] = "subagent" in source
        return None
    if kind == "event_msg" and payload.get("type") == "user_message":
        return "user", (payload.get("message") or "").strip(), record.get("timestamp"), state.get("cwd", "")
    item = payload.get("item") or {}
    if kind == "event_msg" and payload.get("type") == "item_completed" and item.get("type") == "UserMessage":
        text = "\n".join(part.get("text", "") for part in item.get("content", []) if isinstance(part, dict))
        return "user", text.strip(), record.get("timestamp"), state.get("cwd", "")
    if kind == "response_item" and payload.get("type") == "message" and payload.get("role") == "assistant":
        text = "\n".join(
            part.get("text", "") for part in payload.get("content", []) if isinstance(part, dict)
        )
        return "assistant", text.strip(), record.get("timestamp"), state.get("cwd", "")
    return None


def verdict_id(source, session, text):
    digest = hashlib.sha1(f"{source}|{session}|{text[:200]}".encode()).hexdigest()
    return digest[:12]


def polarity(text):
    positive = bool(POSITIVE.search(text))
    negative = bool(NEGATIVE.search(text))
    if positive and negative:
        return "mixed"
    if positive:
        return "positive"
    return "negative"


def _is_verdict(text, file_state):
    if len(text) > MAX_VERDICT_CHARS or text.startswith(INJECTED_PREFIXES) or REQUEST_MARKERS.search(text):
        return False
    if not VERDICT_WORDS.search(text):
        return False
    if DESIGN_WORDS.search(text) and file_state["design_score"] >= 1:
        return True
    # 맥락 없이 "어색해요"만 쓴 짧은 판정은 직전 응답이 디자인 작업이었을 때만 잡는다
    previous = file_state.get("last_assistant", "")
    return file_state["design_score"] >= SESSION_DESIGN_THRESHOLD and bool(DESIGN_WORDS.search(previous))


def file_session(path):
    return os.path.basename(path).split(".")[0]


def scan_file(path, source, file_state, since, match_symptoms):
    with open(path, "rb") as handle:
        handle.seek(file_state["offset"])
        return scan_lines(handle, file_session(path), source, file_state, since, match_symptoms)


def scan_compressed(path, source, file_state, since, match_symptoms):
    """압축본은 풀린 바이트 기준 offset부터 읽는다. seek는 그 위치까지 압축을 풀며 넘긴다."""
    with zstd.open(path, "rb") as handle:
        handle.seek(file_state["offset"])
        if handle.tell() < file_state["offset"]:
            # 이어받은 위치가 풀린 내용보다 뒤라면 다른 내용이므로 처음부터 읽는다
            file_state.update(new_file_state())
            handle.seek(0)
        return scan_lines(handle, file_session(path), source, file_state, since, match_symptoms)


def scan_lines(lines, session, source, file_state, since, match_symptoms):
    """기록 한 파일의 줄(바이트)에서 판정 후보를 찾는다. 효과 측정은 압축된 Codex 기록을 풀어 같은 기준으로 넘긴다."""
    found = []
    seen_texts = set()
    for raw in lines:
        if not raw.endswith(b"\n"):
            break  # 아직 쓰는 중인 마지막 줄은 다음 실행에서 읽는다
        file_state["offset"] += len(raw)
        try:
            record = json.loads(raw)
        except ValueError:
            continue
        if source == "claude":
            event = claude_event(record)
        else:
            event = codex_event(record, file_state)
            if file_state.get("is_subagent"):
                continue
        if not event:
            continue
        role, text, ts_raw, cwd = event
        # 원본 기록에 이미 깨져 저장된 글자는 원장으로 옮기지 않는다
        text = text.replace("\ufffd", "")
        if not text:
            continue
        if role == "assistant":
            file_state["last_assistant"] = text[-600:]
            continue
        if text.startswith(INJECTED_PREFIXES) or text in seen_texts:
            continue
        seen_texts.add(text)
        file_state["design_score"] += len(DESIGN_WORDS.findall(text))
        ts = parse_ts(ts_raw)
        if not ts or ts < since or not _is_verdict(text, file_state):
            continue
        symptoms = match_symptoms(text)
        if source == "codex" and file_state.get("session_id"):
            session = file_state["session_id"]
        found.append({
            "id": verdict_id(source, session, text),
            "ts": ts.astimezone(dt.timezone.utc).isoformat(timespec="seconds"),
            "source": source,
            "session": session,
            "project": cwd.replace(HOME, "~") if cwd else "",
            "text": text,
            "context": file_state.get("last_assistant", "")[-400:],
            "symptoms": symptoms,
            "polarity": polarity(text),
            "origin": "harvest",
            "status": "new",
        })
    return found


def compressed_globs():
    return [pattern + COMPRESSED for pattern in CODEX_GLOBS]


def session_files():
    """수집할 기록 파일. Codex가 끝난 세션을 압축해 둔 .jsonl.zst는 compression.zstd가 있을 때만 낸다."""
    for path in glob.glob(CLAUDE_GLOB):
        yield path, "claude"
    patterns = CODEX_GLOBS + (compressed_globs() if zstd is not None else [])
    for pattern in patterns:
        for path in glob.glob(pattern, recursive=True):
            yield path, "codex"


def unreadable_compressed():
    """이 Python이 compression.zstd가 없어 읽지 못하는 압축본 수."""
    if zstd is not None:
        return 0
    return sum(len(glob.glob(pattern, recursive=True)) for pattern in compressed_globs())


def new_file_state():
    return {"offset": 0, "design_score": 0, "last_assistant": ""}


def compressed_predecessor(files, path):
    """압축 전에 읽던 .jsonl의 cursor 키. 같은 자리에서 압축됐거나 archived_sessions로 옮겨지며 압축됐을 수 있다.

    옛 판정은 세션을 파일 이름으로 저장한 것도 있어, 처음부터 다시 읽으면 id가 달라져 원장에 중복으로 들어간다.
    """
    original = path[: -len(COMPRESSED)]
    if original in files:
        return original
    session = file_session(path)
    for key in files:
        if not key.endswith(COMPRESSED) and file_session(key) == session and not os.path.exists(key):
            return key
    return None


def harvest(cursor, since, match_symptoms):
    """cursor를 갱신하며 새 판정 후보 목록을 돌려준다."""
    files = cursor.setdefault("files", {})
    found = []
    scanned = 0
    for path, source in session_files():
        try:
            stat = os.stat(path)
        except OSError:
            continue
        if stat.st_mtime < since.timestamp():
            continue
        if path.endswith(COMPRESSED):
            # 압축본의 offset은 풀린 바이트라 파일 크기와 비교할 수 없다. 끝까지 읽은 파일에 크기와 수정 시각을 남긴다.
            stamp = [stat.st_size, stat.st_mtime_ns]
            state = files.get(path)
            if state is not None and state.get("compressed") == stamp:
                continue
            predecessor = None if state is not None else compressed_predecessor(files, path)
            if state is not None:
                previous = state
            elif predecessor is not None:
                previous = files[predecessor]
            else:
                previous = new_file_state()
            # 읽다 실패하면 cursor를 그대로 두고 다음 실행에서 다시 읽도록 사본에서 진행한다
            work = dict(previous)
            try:
                found_here = scan_compressed(path, source, work, since, match_symptoms)
            except READ_ERRORS:
                continue
            work["compressed"] = stamp
            files[path] = work
            if predecessor is not None:
                del files[predecessor]
            scanned += 1
            found.extend(found_here)
            continue
        state = files.get(path)
        if state is None or stat.st_size < state["offset"]:
            state = new_file_state()
            files[path] = state
        if stat.st_size == state["offset"]:
            continue
        try:
            found_here = scan_file(path, source, state, since, match_symptoms)
        except OSError:
            continue  # stat 뒤에 Codex가 압축하며 지운 원본이다. 압축본으로 이어 읽는다
        scanned += 1
        found.extend(found_here)
    cursor["last_run"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    return found, scanned
