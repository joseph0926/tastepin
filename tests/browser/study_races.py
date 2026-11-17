"""실제 Lab UI와 지연된 API 응답을 검사한다. 개인 API와 원장에는 접근하지 않는다.

Playwright가 있는 Python으로 실행하고 STUDY_LAB_URL을 격리된 Vite 주소로 지정한다.
"""
import os
import unittest

from playwright.sync_api import sync_playwright, expect


def study(identifier, note=""):
    return {
        "id": identifier, "reference": {"title": f"시안 {identifier}", "image": {"file": "reference.png"}},
        "revisions": [{"digest": identifier, "revision": {
            "id": "r1", "viewport": {"width": 390, "height": 600}, "theme": "dark", "state": "검사 화면",
            "dimensions": [{"id": "gap", "label": "간격", "values": [
                {"id": "a", "label": "좁게", "spec": "12px"}, {"id": "b", "label": "넓게", "spec": "24px"}]}],
        }}],
        "events": [{"id": note, "revision": "r1", "action": "feedback", "params": {"gap": "a"}, "note": note, "digest": identifier}] if note else [],
        "adopted": None, "expected": note or None,
    }


class StudyRaceTests(unittest.TestCase):
    def setUp(self):
        playwright = sync_playwright().start()
        self.addCleanup(playwright.stop)
        self.browser = playwright.chromium.launch(channel="chrome", headless=True, chromium_sandbox=True)
        self.addCleanup(self.browser.close)
        self.page = self.browser.new_page()
        self.pending = []
        self.delay_read = False
        self.fail_save = False
        self.current_a = study("a")

        def respond(route):
            url = route.request.url
            if "/file/" in url:
                route.fulfill(body="<!doctype html><p>시편</p>", content_type="text/html")
            elif url.endswith("/event"):
                if self.fail_save:
                    route.fulfill(status=409, json={"error": "다시 읽기 검사"})
                else:
                    self.pending.append(route)
            elif "?id=a" in url:
                if self.delay_read:
                    self.pending.append(route)
                else:
                    route.fulfill(json=self.current_a)
            elif "?id=b" in url:
                route.fulfill(json=study("b"))
            else:
                route.fulfill(json={"studies": [{"id": "a", "title": "시안 a"}, {"id": "b", "title": "시안 b"}]})

        self.page.route("**/taste-api/**", respond)
        self.page.goto(os.environ.get("STUDY_LAB_URL", "http://127.0.0.1:5187") + "/studies?study=a")
        expect(self.page.get_by_role("heading", name="시안 a", exact=True)).to_be_visible()

    def open_study(self, title):
        self.page.get_by_role("button", name="시안 목록").click()
        self.page.get_by_role("button", name=title).click()
        expect(self.page.get_by_role("heading", name=title, exact=True)).to_be_visible()

    def release_old_response(self):
        self.assertEqual(len(self.pending), 1)
        self.pending.pop().fulfill(json=study("a", "오래된 응답"))
        # 응답 수신과 React의 다음 화면 갱신까지 기다린다.
        self.page.wait_for_timeout(200)

    def test_late_save_does_not_replace_new_study(self):
        self.page.get_by_role("button", name="재현 확인").click()
        self.open_study("시안 b")
        self.release_old_response()
        expect(self.page.get_by_role("heading", name="시안 b", exact=True)).to_be_visible()

    def test_late_reload_does_not_replace_new_study(self):
        self.fail_save = True
        self.page.get_by_role("button", name="재현 확인").click()
        expect(self.page.get_by_role("button", name="다시 읽기")).to_be_visible()
        self.delay_read = True
        self.page.get_by_role("button", name="다시 읽기").click()
        self.open_study("시안 b")
        self.release_old_response()
        expect(self.page.get_by_role("heading", name="시안 b", exact=True)).to_be_visible()

    def test_returning_to_same_study_does_not_accept_previous_visit_response(self):
        self.page.get_by_role("button", name="재현 확인").click()
        self.open_study("시안 b")
        self.current_a = study("a", "새 A 기록")
        self.open_study("시안 a")
        expect(self.page.get_by_text("새 A 기록", exact=True)).to_be_visible()
        self.release_old_response()
        expect(self.page.get_by_text("새 A 기록", exact=True)).to_be_visible()
        expect(self.page.get_by_text("오래된 응답", exact=True)).to_have_count(0)


if __name__ == "__main__":
    unittest.main()
