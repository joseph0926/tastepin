"""대시보드용 로컬 HTTP 서버. 127.0.0.1에만 열고 원장 파일을 직접 읽고 쓴다."""

import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import threading
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import harvest, lab, store

WEB_DIR = os.path.join(store.ROOT, "web")


def code_version():
    """원장 코드(taste.py, tastelib)의 지문. 백그라운드 서버는 pull 뒤에도 옛 코드로 계속 돌기 때문에
    ping으로 이 값을 알려, 실행기가 지금 코드와 다른 서버를 다시 띄울 수 있게 한다."""
    digest = hashlib.sha1()
    lib = os.path.join(store.ROOT, "tastelib")
    paths = [os.path.join(store.ROOT, "taste.py")] + sorted(
        os.path.join(lib, name) for name in os.listdir(lib) if name.endswith(".py")
    )
    for path in paths:
        with open(path, "rb") as handle:
            digest.update(handle.read())
    return digest.hexdigest()[:12]


# 서버가 뜰 때 읽은 코드의 지문. 이후 파일이 바뀌어도 이 값은 그대로라 바뀐 것을 알 수 있다
LOADED_VERSION = code_version()
HARVEST_DAYS_DEFAULT = 183

# labs 개발 서버는 vite 프록시로 이 서버를 부르고, 프록시는 브라우저의 Host와 Origin(labs 포트)을 그대로 넘긴다.
# 그래서 포트는 보지 않고 루프백 이름만 허용한다
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "[::1]"}
RULE_ID = re.compile(r"[\w-]{1,40}")

# 쓰기는 store.ledger_lock()으로 직렬화한다. 브라우저 탭 여러 개, 다른 세션의 훅과 CLI가 함께 써도 서로 덮어쓰지 않는다
# 수집은 여러 번 동시에 돌면 같은 cursor를 두 번 읽을 뿐 판정은 merge에서 걸러지므로 스레드끼리만 막는다
_harvest_lock = threading.Lock()


def run_harvest(days=HARVEST_DAYS_DEFAULT):
    with _harvest_lock:
        cursor = store.load_cursor()
        since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)
        matcher = store.symptom_matcher(store.load_symptoms())
        # 대화 기록을 읽는 동안 원장을 잠그면 그사이 훅이 제한 시간(5초)을 넘겨 판정을 잃는다
        found, scanned = harvest.harvest(cursor, since, matcher)
        match_components = lab.safe_component_matcher()
        for verdict in found:
            verdict["components"] = match_components(verdict["text"])
        with store.ledger_lock():
            verdicts, added = store.merge_verdicts(store.load_verdicts(), found)
            store.save_verdicts(verdicts)
            store.save_cursor(cursor)
        return {
            "scanned_files": scanned,
            "added": added,
            "skipped_compressed": harvest.unreadable_compressed(),
            "last_run": cursor["last_run"],
        }


def _state_payload():
    symptoms = store.load_symptoms()
    return {
        "axes": symptoms["axes"],
        "symptoms": symptoms["symptoms"],
        "rules": store.load_rules()["rules"],
        "verdicts": store.load_verdicts(),
        "deliveries": store.load_deliveries(),
        "last_run": store.load_cursor().get("last_run"),
    }


def _update_verdict(body):
    with store.ledger_lock():
        verdicts = store.load_verdicts()
        target = next((v for v in verdicts if v["id"] == body.get("id")), None)
        if target is None:
            raise LookupError("판정을 찾을 수 없습니다")
        if "status" in body:
            if body["status"] not in store.VERDICT_STATUSES:
                raise ValueError("알 수 없는 상태입니다")
            target["status"] = body["status"]
        if "symptoms" in body:
            target["symptoms"] = [str(s) for s in body["symptoms"]]
        if "polarity" in body:
            if body["polarity"] not in store.POLARITIES:
                raise ValueError("알 수 없는 평가입니다")
            target["polarity"] = body["polarity"]
        store.save_verdicts(verdicts)
        return target


def _add_verdict(body):
    """피드백 작성기에서 복사한 피드백을 직접 판정으로 기록한다."""
    text = str(body.get("text", "")).strip()
    if not text:
        raise ValueError("기록할 내용이 없습니다")
    verdict = {
        "id": uuid.uuid4().hex[:12],
        "ts": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "composer",
        "session": "",
        "project": str(body.get("project", "")).strip(),
        "text": text,
        "context": "",
        "symptoms": [str(s) for s in body.get("symptoms", [])],
        "polarity": "negative",
        "origin": "composer",
        "status": "kept",
    }
    with store.ledger_lock():
        verdicts = store.load_verdicts()
        verdicts.append(verdict)
        store.save_verdicts(verdicts)
    return verdict


# component가 있는 규칙은 그 컴포넌트가 요청에 나올 때만 주입한다
RULE_FIELDS = ("axis", "title", "avoid", "do", "symptoms", "status", "sources", "component")


def _save_rule(body):
    if not str(body.get("title", "")).strip():
        raise ValueError("규칙 이름이 필요합니다")
    if body.get("status") not in ("확정", "관찰"):
        raise ValueError("상태는 확정이나 관찰이어야 합니다")
    rule_id = body.get("id") or uuid.uuid4().hex[:8]
    if not isinstance(rule_id, str) or not RULE_ID.fullmatch(rule_id):
        raise ValueError("규칙 id는 영문, 숫자, -, _만 쓸 수 있습니다")
    with store.ledger_lock():
        doc = store.load_rules()
        existing = next((r for r in doc["rules"] if r["id"] == rule_id), None)
        rule = existing if existing is not None else {"id": rule_id, "sources": []}
        for field in RULE_FIELDS:
            if field in body:
                rule[field] = body[field]
        if existing is None:
            doc["rules"].append(rule)
        store.save_rules(doc)
        return rule


def _delete_rule(body):
    with store.ledger_lock():
        doc = store.load_rules()
        doc["rules"] = [r for r in doc["rules"] if r["id"] != body.get("id")]
        store.save_rules(doc)
    return {"deleted": body.get("id")}


def _block(audience):
    rules_doc = store.load_rules()
    store.log_delivery("dashboard", rule_ids=[r["id"] for r in rules_doc["rules"]])
    return store.build_block(
        rules_doc, store.load_verdicts(), audience, store.load_symptoms(), lab.safe_block_lines(),
    )


def _export():
    symptoms = store.load_symptoms()
    path = store.export_markdown(store.load_rules(), store.load_verdicts(), symptoms, lab.safe_block_lines())
    return {"path": path}


def _judge(body):
    with store.ledger_lock():
        judgment = lab.record_judgment(body)
    # 판정한 조건이 곧 평가 화면이 보고 있는 조건이다
    return {"judgment": judgment, "state": lab.lab_state(str(body.get("requested", "")), body.get("conditions"))}


def _undo(body):
    with store.ledger_lock():
        lab.undo_judgment(body.get("id"))
    return {"state": lab.lab_state(str(body.get("requested", "")), body.get("view"))}


def _open_lab(body):
    """대시보드의 평가 열기 버튼. labs 개발 서버를 띄우고 열 주소를 돌려준다."""
    try:
        url = lab.ensure_labs_server()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        raise ValueError(str(error)) from error
    component = str(body.get("component", ""))
    return {"url": url + (f"?c={component}" if component else "")}


POST_ROUTES = {
    "/api/verdicts/update": _update_verdict,
    "/api/verdicts/add": _add_verdict,
    "/api/rules/save": _save_rule,
    "/api/rules/delete": _delete_rule,
    "/api/harvest": lambda body: run_harvest(int(body.get("days", HARVEST_DAYS_DEFAULT))),
    "/api/export": lambda body: _export(),
    "/api/lab/judge": _judge,
    "/api/lab/undo": _undo,
    "/api/lab/open": _open_lab,
}


def _host_name(value):
    """Host 헤더나 Origin의 netloc에서 포트를 뗀 이름."""
    if value.startswith("["):
        return value.split("]", 1)[0] + "]"
    return value.rsplit(":", 1)[0] if ":" in value else value


def rejection(method, path, headers):
    """다른 사이트의 페이지가 이 서버를 읽거나 쓰지 못하게 막는다. 막을 이유가 없으면 None.
    판정 원장과 규칙은 /taste 적용 문구로 에이전트 컨텍스트에 들어가므로, 외부 페이지의 쓰기는 지시 주입이 된다."""
    # DNS rebinding으로 외부 이름이 127.0.0.1을 가리키면 Host가 그 이름으로 온다
    if _host_name(headers.get("Host", "")) not in LOOPBACK_HOSTS:
        return "루프백 주소로만 접속할 수 있습니다"
    if not path.startswith("/api/"):
        return None
    # 브라우저가 보낸 요청에만 있다. CLI와 ping처럼 브라우저 밖 요청은 헤더가 없어 그대로 둔다
    if headers.get("Sec-Fetch-Site") == "cross-site":
        return "다른 사이트에서 온 요청입니다"
    origin = headers.get("Origin")
    if origin is not None and _host_name(urlparse(origin).netloc) not in LOOPBACK_HOSTS:
        return "다른 사이트에서 온 요청입니다"
    # text/plain 같은 단순 요청은 preflight 없이 교차 출처로 보낼 수 있어, 쓰기는 JSON 본문만 받는다
    if method == "POST" and headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
        return "본문은 application/json이어야 합니다"
    return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        pass

    def _send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _rejected(self, method):
        reason = rejection(method, urlparse(self.path).path, self.headers)
        if reason is not None:
            self._send_json(403, {"error": reason})
        return reason is not None

    def do_GET(self):
        if self._rejected("GET"):
            return None
        url = urlparse(self.path)
        if url.path == "/api/ping":
            return self._send_json(200, {"ok": True, "code": LOADED_VERSION, "pid": os.getpid(), "root": store.ROOT, "data": store.DATA_ROOT})
        if url.path == "/api/state":
            return self._send_json(200, _state_payload())
        if url.path == "/api/lab/state":
            query = parse_qs(url.query)
            requested = query.get("c", [""])[0]
            view = {"theme": query.get("theme", [""])[0], "frame": query.get("frame", [""])[0]}
            try:
                return self._send_json(200, lab.lab_state(requested, view))
            except ValueError as error:
                return self._send_json(400, {"error": str(error)})
        if url.path == "/api/block":
            audience = parse_qs(url.query).get("for", ["design"])[0]
            return self._send_json(200, {"text": _block(audience)})
        return super().do_GET()

    def do_POST(self):
        if self._rejected("POST"):
            return None
        route = POST_ROUTES.get(urlparse(self.path).path)
        if route is None:
            return self._send_json(404, {"error": "없는 경로입니다"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise TypeError("본문은 JSON 객체여야 합니다")
            return self._send_json(200, route(body))
        except (ValueError, LookupError, TypeError) as error:
            return self._send_json(400, {"error": str(error)})


def serve(port):
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.serve_forever()
