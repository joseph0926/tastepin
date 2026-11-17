"""개인 시안, 불변 코드 수정본과 명시적으로 채택한 화면을 관리한다.

일반 시편 원장은 읽거나 수정하지 않는다. 시안별 선택은 명시적으로 지정한
작업에만 전달하며, Viewgrain은 선택 가능한 자료 공급자일 뿐이다.
"""

import datetime as dt
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import struct
import subprocess
import tempfile

from . import store

ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
ALLOWED = {".json", ".jsonl", ".md", ".tsx", ".ts", ".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".woff2", ".html"}
LIMIT = 16 * 1024 * 1024


def root():
    return Path(store.DATA_ROOT) / "studies"


def identifier(value):
    if not isinstance(value, str) or len(value) > 100 or not ID.fullmatch(value):
        raise ValueError("영문 소문자와 숫자, 하이픈으로 된 식별자가 필요합니다")
    return value


def relative(value):
    if not isinstance(value, str) or "\\" in value:
        raise ValueError("잘못된 자료 경로입니다")
    parts = PurePosixPath(value).parts
    if not parts or value != "/".join(parts) or any(p.startswith(".") for p in parts):
        raise ValueError("숨김 파일이나 상위 경로를 읽을 수 없습니다")
    if Path(value).suffix not in ALLOWED or PurePosixPath(value).is_absolute():
        raise ValueError("지원하지 않는 자료 경로입니다")
    return value


@contextmanager
def open_file(directory, name):
    directory = Path(directory)
    target = directory / relative(name)
    # 부모 링크를 포함해 자료 폴더 밖을 가리키는 경로를 허용하지 않는다.
    for part in [directory, *target.relative_to(directory).parents, target]:
        candidate = part if part.is_absolute() else directory / part
        if candidate.is_symlink():
            raise ValueError("자료의 심볼릭 링크는 지원하지 않습니다")
    descriptor = os.open(target, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    with os.fdopen(descriptor, "rb") as handle:
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
            raise ValueError("일반 파일만 읽을 수 있습니다")
        yield handle


def read_file(directory, name, limit=LIMIT):
    with open_file(directory, name) as handle:
        data = handle.read(limit + 1)
    if len(data) > limit:
        raise ValueError("자료가 크기 한도를 초과했습니다")
    return data


def read_json(directory, name):
    value = json.loads(read_file(directory, name, 256 * 1024))
    if not isinstance(value, dict):
        raise ValueError("JSON 객체가 필요합니다")
    return value


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2).encode() + b"\n"


def png_size(data):
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("PNG 이미지가 필요합니다")
    return struct.unpack(">II", data[16:24])


def bundle(directory):
    meta = read_json(directory, "reference.json")
    if meta.get("format_version") != 1 or meta.get("kind") != "ui-reference" or not isinstance(meta.get("title"), str) or not meta["title"].strip():
        raise ValueError("지원하지 않는 레퍼런스 묶음입니다")
    image = meta.get("image", {})
    if not isinstance(image, dict) or not isinstance(image.get("file"), str) or not image["file"].endswith(".png"):
        raise ValueError("PNG 이미지 정보가 필요합니다")
    data = read_file(directory, image.get("file"), 4 * 1024 * 1024)
    if digest(data) != image.get("sha256") or list(png_size(data)) != [image.get("width"), image.get("height")]:
        raise ValueError("레퍼런스 이미지가 등록 정보와 다릅니다")
    files = {image["file"]: data}
    artifacts = meta.get("artifacts", {})
    if not isinstance(artifacts, dict) or len(artifacts) > 100:
        raise ValueError("첨부 자료 목록이 잘못됐습니다")
    for name, expected in artifacts.items():
        if not name.startswith("implementation/"):
            raise ValueError("첨부 자료는 implementation 폴더에 있어야 합니다")
        data = read_file(directory, name)
        if digest(data) != expected:
            raise ValueError("첨부 자료가 등록 정보와 다릅니다")
        files[name] = data
    if sum(map(len, files.values())) > 64 * 1024 * 1024:
        raise ValueError("묶음이 크기 한도를 초과했습니다")
    files["reference.json"] = encode(meta)
    return meta, files


def write_new(directory, files):
    """완성된 폴더만 공개한다. 같은 내용의 재시도는 기존 폴더를 사용한다."""
    directory = Path(directory)
    if directory.exists():
        if all(read_file(directory, name) == data for name, data in files.items()):
            return
        raise ValueError("이미 있는 자료는 덮어쓰지 않습니다. 새 버전을 사용하세요")
    directory.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".study-", dir=directory.parent))
    try:
        for name, data in files.items():
            target = temporary / relative(name)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        temporary.rename(directory)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def import_reference(study_id, directory):
    study_id = identifier(study_id)
    meta, files = bundle(directory)
    with store.ledger_lock():
        write_new(root() / study_id / "reference", files)
    return {"id": study_id, "title": meta["title"]}


def revision_manifest(directory):
    meta = read_json(directory, "revision.json")
    identifier(meta.get("id"))
    if meta.get("format_version") != 1 or meta.get("entry") != "Screen.tsx":
        raise ValueError("수정본은 format_version 1과 Screen.tsx 진입점이 필요합니다")
    viewport = meta.get("viewport", {})
    if not isinstance(viewport, dict) or any(type(viewport.get(k)) is not int or not 240 <= viewport[k] <= 2560 for k in ("width", "height")):
        raise ValueError("화면 크기는 240~2560 정수여야 합니다")
    if meta.get("theme") not in ("light", "dark") or not isinstance(meta.get("state"), str):
        raise ValueError("테마와 표시 상태 설명이 필요합니다")
    dimensions = meta.get("dimensions")
    if not isinstance(dimensions, list) or not dimensions or len(dimensions) > 12:
        raise ValueError("비교 항목은 1~12개여야 합니다")
    ids = set()
    for dimension in dimensions:
        if not isinstance(dimension, dict):
            raise ValueError("비교 항목 정보가 잘못됐습니다")
        key = identifier(dimension.get("id"))
        if key in ids or not dimension.get("label"):
            raise ValueError("중복된 비교 항목이나 빈 이름입니다")
        ids.add(key)
        values = dimension.get("values", [])
        if not isinstance(values, list) or not 2 <= len(values) <= 3 or any(not isinstance(v, dict) for v in values):
            raise ValueError("각 비교 항목에는 값이 2~3개 필요합니다")
        names = [identifier(v.get("id")) for v in values]
        if len(set(names)) != len(names) or any(not v.get("label") or not v.get("spec") for v in values):
            raise ValueError("값의 이름과 설명을 확인하세요")
    files = meta.get("files")
    if not isinstance(files, list) or not files or len(files) > 50 or any(not isinstance(name, str) for name in files) or len(set(files)) != len(files) or "Screen.tsx" not in files:
        raise ValueError("수정본의 파일 목록을 확인하세요")
    contents = {"source/" + relative(name): read_file(directory, name) for name in files}
    if sum(map(len, contents.values())) > 64 * 1024 * 1024:
        raise ValueError("수정본이 크기 한도를 초과했습니다")
    if any(name in ("revision.json", "snapshot.json") for name in files):
        raise ValueError("예약된 파일 이름입니다")
    contents["source/revision.json"] = encode(meta)
    return meta, contents


def register_revision(study_id, directory):
    study_id = identifier(study_id)
    reference = read_json(root() / study_id / "reference", "reference.json")
    meta, files = revision_manifest(directory)
    existing = root() / study_id / "revisions" / meta["id"]
    if existing.exists():
        saved = revision(study_id, meta["id"])
        if saved["reference_sha256"] != reference["image"]["sha256"] or any(read_file(existing, name) != data for name, data in files.items()):
            raise ValueError("등록한 수정본은 변경할 수 없습니다. 새 버전을 사용하세요")
        return saved
    with tempfile.TemporaryDirectory(prefix="taste-study-build-") as temp:
        staging = Path(temp)
        for name, data in files.items():
            target = staging / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        subprocess.run(["node", str(Path(store.ROOT) / "lab/scripts/build-study.mjs"), str(staging / "source"), str(staging / "screen.html")], check=True)
        files["screen.html"] = read_file(staging, "screen.html")
    snapshot = {"format_version": 1, "revision": meta, "reference_sha256": reference["image"]["sha256"],
                "files": {name: digest(data) for name, data in files.items()}}
    snapshot["digest"] = digest(encode(snapshot))
    files["snapshot.json"] = encode(snapshot)
    with store.ledger_lock():
        write_new(root() / study_id / "revisions" / meta["id"], files)
    return snapshot


def revision(study_id, revision_id):
    directory = root() / identifier(study_id) / "revisions" / identifier(revision_id)
    snapshot = read_json(directory, "snapshot.json")
    expected = snapshot.get("digest")
    if digest(encode({k: v for k, v in snapshot.items() if k != "digest"})) != expected:
        raise ValueError("수정본 정보가 변경됐습니다")
    for name, expected_hash in snapshot["files"].items():
        if digest(read_file(directory, name)) != expected_hash:
            raise ValueError("등록한 코드나 자산이 변경됐습니다. 새 수정본으로 등록하세요")
    return snapshot


def events():
    target = Path(store.STATE_DIR) / "study-events.jsonl"
    if not target.exists():
        return []
    # 손상된 이력을 건너뛰면 채택이 되살아날 수 있으므로 실패로 알린다.
    # 자산의 크기 제한은 누적 이력에 적용하지 않는다. 이전의 큰 행도 보존한다.
    with open_file(target.parent, target.name) as handle:
        return [json.loads(line) for line in handle if line.strip()]


def append_event(event):
    """호출자가 원장 잠금을 소유한다. 기존 바이트와 새 행을 원자적으로 교체한다."""
    target = Path(store.STATE_DIR) / "study-events.jsonl"
    descriptor, temporary = tempfile.mkstemp(dir=target.parent, prefix=".study-events-")
    try:
        with os.fdopen(descriptor, "wb") as output:
            if target.exists():
                with open_file(target.parent, target.name) as previous:
                    shutil.copyfileobj(previous, output)
                    if previous.tell():
                        previous.seek(-1, os.SEEK_END)
                        if previous.read(1) != b"\n":
                            output.write(b"\n")
            output.write((json.dumps(event, ensure_ascii=False) + "\n").encode())
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def study_events(study_id):
    return [e for e in events() if e["study"] == study_id]


def adopted(history):
    active = None
    for event in history:
        if event["action"] == "adopt":
            active = event
        elif event["action"] == "revert":
            active = next((e for e in history if e["id"] == event["target"] and e["action"] == "adopt"), None)
    return active


def parameters(meta, raw):
    if not isinstance(raw, dict) or set(raw) != {d["id"] for d in meta["dimensions"]}:
        raise ValueError("모든 비교 항목의 값을 지정하세요")
    if any(raw[d["id"]] not in [v["id"] for v in d["values"]] for d in meta["dimensions"]):
        raise ValueError("수정본에 없는 값입니다")
    return raw


def record(body):
    """한 요청은 한 번만 기록한다. 모든 쓰기는 CLI와 이 API를 통한다."""
    if not isinstance(body, dict):
        raise ValueError("시안 작업은 JSON 객체여야 합니다")
    study_id = identifier(body.get("study"))
    request_id = body.get("request_id")
    if not isinstance(request_id, str) or not re.fullmatch(r"[a-zA-Z0-9-]{8,80}", request_id):
        raise ValueError("재시도 식별자가 필요합니다")
    with store.ledger_lock():
        all_events = events()
        existing = next((e for e in all_events if e["id"] == request_id), None)
        if existing:
            if existing["request"] != body:
                raise ValueError("같은 요청 식별자에 다른 내용을 사용할 수 없습니다")
            return existing
        fields = {"study", "request_id", "expected", "action", "revision", "digest", "params", "note", "dimension", "outcome", "choice", "target"}
        if set(body) - fields or len(encode(body)) > 32 * 1024:
            raise ValueError("지원하지 않는 요청 필드이거나 요청 크기가 너무 큽니다")
        history = [e for e in all_events if e["study"] == study_id]
        if body.get("expected") != (history[-1]["id"] if history else None):
            raise ValueError("다른 창에서 기록이 바뀌었습니다. 새로 읽은 뒤 다시 선택하세요")
        action = body.get("action")
        if action not in ("reproduction", "judge", "feedback", "adopt", "revert"):
            raise ValueError("지원하지 않는 시안 작업입니다")
        snap = revision(study_id, body.get("revision"))
        if body.get("digest") != snap["digest"]:
            raise ValueError("보고 있는 수정본과 저장할 수정본이 다릅니다")
        params = parameters(snap["revision"], body.get("params"))
        note = body.get("note", "")
        if not isinstance(note, str) or len(note) > 4000:
            raise ValueError("설명은 4000자 이내로 적어 주세요")
        if action in ("judge", "adopt") and not any(e["action"] == "reproduction" and e["digest"] == snap["digest"] for e in history):
            raise ValueError("먼저 원본과 코드 시편의 재현 상태를 확인하세요")
        if action == "feedback" and not note.strip():
            raise ValueError("수정할 부분을 적어 주세요")
        if action == "judge":
            if body.get("outcome") not in ("chose", "same", "none"):
                raise ValueError("비교 결과를 지정하세요")
            dimension = next((d for d in snap["revision"]["dimensions"] if d["id"] == body.get("dimension")), None)
            if dimension is None or (body["outcome"] == "chose" and body.get("choice") != params[dimension["id"]]):
                raise ValueError("비교 항목과 선택이 맞지 않습니다")
        if action == "revert":
            target = body.get("target")
            if target is not None and not any(e["id"] == target and e["action"] == "adopt" for e in history):
                raise ValueError("되돌릴 채택 기록이 없습니다")
        event = {**body, "id": request_id, "ts": dt.datetime.now(dt.timezone.utc).isoformat(), "request": body}
        append_event(event)
    return event


def state(study_id=None):
    if study_id is None:
        entries = sorted(root().iterdir()) if root().exists() else []
        return {"studies": [{"id": p.name, "title": read_json(p / "reference", "reference.json")["title"]} for p in entries if not p.name.startswith(".") and p.is_dir()]}
    directory = root() / identifier(study_id)
    reference = read_json(directory / "reference", "reference.json")
    revisions = sorted((directory / "revisions").iterdir()) if (directory / "revisions").exists() else []
    history = study_events(study_id)
    return {"id": study_id, "reference": reference, "revisions": [revision(study_id, p.name) for p in revisions if not p.name.startswith(".")],
            "events": [{k: v for k, v in e.items() if k != "request"} for e in history], "adopted": adopted(history), "expected": history[-1]["id"] if history else None}


def context(study_id):
    info = state(study_id)
    chosen = info["adopted"]
    if not chosen:
        raise ValueError("이 시안에는 채택한 결과가 없습니다")
    snap = revision(study_id, chosen["revision"])
    return adoption_context(info, snap)


def adoption_context(info, snap):
    """설명도 내보내기 시작 시 확보한 채택과 코드만 사용한다."""
    study_id = info["id"]
    chosen = info["adopted"]
    lines = [f"## 이번 화면에서 채택한 시안: {info['reference']['title']}",
             f"시안 {study_id}, 수정본 {chosen['revision']}, 채택 {chosen['id']}. 이 화면에만 적용하며 공통 취향으로 확대하지 않는다.",
             f"확인 조건: {snap['revision']['theme']}, {snap['revision']['viewport']}, {snap['revision']['state']}."]
    for dimension in snap["revision"]["dimensions"]:
        value = next(v for v in dimension["values"] if v["id"] == chosen["params"][dimension["id"]])
        lines.append(f"- {dimension['label']}: {value['label']}. {value['spec']}")
    lines.append("참고 구현: " + str(root() / study_id / "revisions" / chosen["revision"] / "source"))
    return "\n".join(lines) + "\n"


def public_file(study_id, revision_id, name):
    """HTTP는 이미지와 독립 실행 화면만 제공한다. 원장과 소스는 제공하지 않는다."""
    if revision_id == "reference":
        meta = read_json(root() / identifier(study_id) / "reference", "reference.json")
        if name != meta["image"]["file"]:
            raise ValueError("공개하지 않는 자료입니다")
        data = read_file(root() / study_id / "reference", name)
        if digest(data) != meta["image"]["sha256"]:
            raise ValueError("원본 이미지가 변경됐습니다")
        return data, "image/png"
    revision(study_id, revision_id)
    if name != "screen.html":
        raise ValueError("공개하지 않는 자료입니다")
    return read_file(root() / study_id / "revisions" / revision_id, name), "text/html; charset=utf-8"


def export_feedback(study_id, output):
    info = state(study_id)
    files = {"feedback.json": encode(info), "README.md": ("# 시안 수정 요청\n\n" + "\n".join(e["note"] for e in info["events"] if e["action"] == "feedback")).encode()}
    reference = info["reference"]
    files["reference.png"] = read_file(root() / study_id / "reference", reference["image"]["file"])
    for snap in info["revisions"]:
        files[f"revisions/{snap['revision']['id']}/screen.html"] = read_file(root() / study_id / "revisions" / snap["revision"]["id"], "screen.html")
    write_new(output, files)
    return {"output": str(output)}


def portable_files(study_id):
    """개인 평가 원문 없이 채택한 화면만 프로젝트 사본에 전달한다."""
    info = state(study_id)
    chosen = info["adopted"]
    if not chosen:
        raise ValueError("프로젝트에 저장할 채택 결과가 없습니다")
    snap = revision(study_id, chosen["revision"])
    directory = root() / study_id / "revisions" / chosen["revision"]
    prefix = f".taste/studies/{study_id}"
    html = read_file(directory, "screen.html").decode().replace("/* adopted-params */null", json.dumps(chosen["params"]).replace("<", "\\u003c"))
    text = adoption_context(info, snap).replace(str(directory / "source"), f"{prefix}/source")
    files = {f"{prefix}/AGENT.md": text, f"{prefix}/screen.html": html,
             f"{prefix}/selection.json": encode({"revision": chosen["revision"], "params": chosen["params"], "adoption": chosen["id"], "digest": chosen["digest"]}).decode()}
    for name in snap["files"]:
        if name.startswith("source/"):
            files[f"{prefix}/{name}"] = read_file(directory, name)
    return files


def export_adopted(study_id, output, chrome=None):
    info = state(study_id)
    chosen = info["adopted"]
    if not chosen:
        raise ValueError("채택한 전체 화면만 레퍼런스로 내보낼 수 있습니다")
    snap = revision(study_id, chosen["revision"])
    directory = root() / study_id / "revisions" / chosen["revision"]
    # 매번 캡처를 바꾸지 않고 같은 채택의 자료를 재사용한다.
    cached = root() / study_id / "exports" / chosen["id"]
    if not cached.exists():
        with tempfile.TemporaryDirectory(prefix="taste-capture-") as temporary:
            request = {"html": str(directory / "screen.html"), "params": chosen["params"], "viewport": snap["revision"]["viewport"], "output": str(Path(temporary) / "screen.png"), "chrome": chrome}
            request_file = Path(temporary) / "capture.json"
            request_file.write_bytes(encode(request))
            subprocess.run(["node", str(Path(store.ROOT) / "lab/scripts/capture-study.mjs"), str(request_file)], check=True)
            image = read_file(temporary, "screen.png", 4 * 1024 * 1024)
        width, height = png_size(image)
        files = {"screen.png": image, "implementation/adoption.json": encode({k: chosen[k] for k in ("id", "revision", "params", "digest", "ts")}), "implementation/revision/snapshot.json": encode(snap)}
        for name in snap["files"]:
            files["implementation/revision/" + name] = read_file(directory, name)
        # 다시 열 때 채택한 값이 기본으로 적용되도록 독립 실행 화면에 함께 넣는다.
        html = files["implementation/revision/screen.html"].decode()
        html = html.replace("/* adopted-params */null", json.dumps(chosen["params"]).replace("<", "\\u003c"))
        files["implementation/screen.html"] = html.encode()
        meta = {"format_version": 1, "kind": "ui-reference", "title": info["reference"]["title"] + " — Lab 채택 화면",
                "source": {"provider": "tastepin", "study": study_id, "revision": chosen["revision"], "adoption": chosen["id"], "parent": info["reference"].get("source")},
                "selection": {"user_statement": chosen.get("note", ""), "scope": "Lab에서 명시적으로 채택한 전체 화면", "satisfaction": "adopted"},
                "notes": adoption_context(info, snap).replace(str(directory / "source"), "implementation/revision/source"),
                "viewport": snap["revision"]["viewport"], "display_state": snap["revision"]["state"],
                "image": {"file": "screen.png", "width": width, "height": height, "sha256": digest(image)},
                "artifacts": {name: digest(data) for name, data in files.items() if name != "screen.png"}}
        files["reference.json"] = encode(meta)
        with store.ledger_lock():
            write_new(cached, files)
    _, files = bundle(cached)
    write_new(output, files)
    return {"output": str(output), "adoption": chosen["id"]}
