"""대시보드 서버가 다른 사이트의 페이지에서 온 요청을 막는지 실제 서버에 요청해 검사한다.
막힌 요청은 경로 처리 전에 돌려보내므로 원장 파일에 닿지 않는다."""

import http.client
import json
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

TASTE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TASTE_ROOT))

from tastelib import server


class RequestGuardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def request(self, method, path, headers=None, body=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        # http.client는 Host를 스스로 붙이므로, 헤더로 준 Host만 쓰게 한다
        connection.putrequest(method, path, skip_host=True)
        headers = {"Host": f"127.0.0.1:{self.port}", **(headers or {})}
        data = body.encode() if body is not None else b""
        if method == "POST":
            headers.setdefault("Content-Length", str(len(data)))
        for name, value in headers.items():
            connection.putheader(name, value)
        connection.endheaders(data)
        response = connection.getresponse()
        payload = json.loads(response.read() or b"null")
        connection.close()
        return response.status, payload

    def test_ping_reports_install_and_data_folders(self):
        status, payload = self.request("GET", "/api/ping")
        self.assertEqual(status, 200)
        self.assertEqual(payload["root"], server.store.ROOT)
        self.assertEqual(payload["data"], server.store.DATA_ROOT)

    def test_ping_without_browser_headers_passes(self):
        status, payload = self.request("GET", "/api/ping")
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])

    def test_labs_proxy_origin_on_localhost_passes(self):
        # labs vite 프록시는 브라우저의 Host와 Origin(labs 포트)을 그대로 넘긴다
        status, _ = self.request("GET", "/api/ping", {
            "Host": "localhost:5173", "Origin": "http://localhost:5173", "Sec-Fetch-Site": "same-origin",
        })
        self.assertEqual(status, 200)

    def test_rebound_host_is_rejected(self):
        status, _ = self.request("GET", "/api/state", {"Host": f"attacker.example:{self.port}"})
        self.assertEqual(status, 403)

    def test_cross_site_fetch_is_rejected(self):
        status, _ = self.request("GET", "/api/block", {"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(status, 403)

    def test_foreign_origin_write_is_rejected(self):
        body = json.dumps({"title": "주입", "status": "확정", "do": "지시문"})
        status, _ = self.request("POST", "/api/rules/save", {
            "Origin": "https://attacker.example", "Content-Type": "application/json",
        }, body)
        self.assertEqual(status, 403)

    def test_null_origin_write_is_rejected(self):
        # sandbox iframe, redirect 등에서 브라우저가 보내는 Origin: null은 루프백으로 보지 않는다
        status, _ = self.request("POST", "/api/rules/save", {
            "Origin": "null", "Content-Type": "application/json",
        }, "{}")
        self.assertEqual(status, 403)

    def test_simple_text_plain_write_is_rejected(self):
        # Origin과 Sec-Fetch-Site를 빼도 preflight 없는 text/plain 본문은 받지 않는다
        status, _ = self.request("POST", "/api/rules/save", {"Content-Type": "text/plain"}, "{}")
        self.assertEqual(status, 403)

    def test_non_object_body_returns_json_error(self):
        status, payload = self.request("POST", "/api/rules/save", {"Content-Type": "application/json"}, "[]")
        self.assertEqual(status, 400)
        self.assertIn("객체", payload["error"])

    def test_rule_id_with_markup_is_rejected(self):
        with self.assertRaises(ValueError):
            server._save_rule({"id": '"><img src=x>', "title": "t", "status": "관찰"})


if __name__ == "__main__":
    unittest.main()
