#!/usr/bin/env python3
"""디자인 취향 원장 CLI.

  python3 -B taste.py open      새 판정을 수집하고 대시보드를 연다 (서버는 백그라운드)
  python3 -B taste.py status    터미널 요약
  python3 -B taste.py apply-context  /taste 적용: 화면 작업에 넣을 취향 (--request, --components)
  python3 -B taste.py block     요청서에 붙일 취향 블록 출력 (--for design|agent)
  python3 -B taste.py tokens    고른 값을 CSS 변수, Tailwind 테마, Motion 프리셋으로 내보내기 (--out 폴더)
  python3 -B taste.py apply 저장소  저장소에 취향 사본(.taste/, taste 스킬, 지침 한 줄)을 남긴다 (--check)
  python3 -B taste.py harvest   수집만 실행
  python3 -B taste.py lint URL  화면을 열어 값으로 잴 수 있는 취향 위반 점검
  python3 -B taste.py lab [컴포넌트]  labs 시편 비교 화면을 띄우고 연다
  python3 -B taste.py effect    훅 도입 전후의 지적 빈도를 같은 기준으로 비교 (--freeze로 기준선 고정)
  python3 -B taste.py classify [id]  분류 전 판정 보기, 판정을 근거로 남기거나 무시 (--keep, --ignore, --polarity)
  python3 -B taste.py retag     카탈로그 수정 뒤 분류 전 판정에 증상 다시 붙이기
  python3 -B taste.py export    TASTE.md 생성
  python3 -B taste.py serve     서버를 포그라운드로 실행
  python3 -B taste.py stop      백그라운드 서버 종료
  python3 -B taste.py hook      프롬프트 제출 훅 (stdin JSON을 읽어 화면 판정을 기록만 한다)
  python3 -B taste.py stop-track  Codex PostToolUse 훅 (이번 턴의 화면 수정과 lint 실행을 기록한다)
  python3 -B taste.py stop-check  Claude Code/Codex Stop 훅 (화면을 고치고 lint 없이 끝내면 한 번 막는다)
  python3 -B taste.py doctor    훅, 스킬, labs, uv, 저장소 사본이 제대로 있는지 한 번에 보기
"""

import argparse
import collections
import datetime
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import webbrowser

from tastelib import lab, server, store

DEFAULT_PORT = 4871
PID_PATH = os.path.join(store.STATE_DIR, "server.pid")
LOG_PATH = os.path.join(store.STATE_DIR, "server.log")
# 훅 오류는 프롬프트를 막지 않으려고 출력하지 않으므로, status가 보여 줄 수 있게 시각과 함께 따로 남긴다
HOOK_LOG_PATH = os.path.join(store.STATE_DIR, "hook.log")
HOOK_ERROR_DAYS = 7
LINT_SCRIPT = os.path.join(store.ROOT, "lint.py")
SERVER_MARKER = "taste.py serve"


def _log_hook_error(kind, error):
    try:
        stamp = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
        with open(HOOK_LOG_PATH, "a", encoding="utf-8") as log:
            log.write(f"{stamp} {kind} error: {error!r}\n")
    except OSError:
        pass  # 로그도 쓸 수 없는 환경에서 프롬프트를 막지 않는다.


def _recent_hook_errors(days=HOOK_ERROR_DAYS):
    if not os.path.exists(HOOK_LOG_PATH):
        return []
    since = datetime.datetime.now().astimezone() - datetime.timedelta(days=days)
    recent = []
    with open(HOOK_LOG_PATH, encoding="utf-8", errors="replace") as log:
        for line in log:
            stamp, _, message = line.partition(" ")
            try:
                when = datetime.datetime.fromisoformat(stamp)
            except ValueError:
                continue
            if when >= since:
                recent.append((when, message.strip()))
    return recent


def _url(port):
    return f"http://127.0.0.1:{port}/"


def _is_running(port):
    try:
        with urllib.request.urlopen(_url(port) + "api/ping", timeout=0.5) as response:
            return response.status == 200
    except OSError:
        return False


def _start_background(port):
    os.makedirs(store.STATE_DIR, exist_ok=True)
    with open(LOG_PATH, "a") as log:
        process = subprocess.Popen(
            [sys.executable, "-B", os.path.abspath(__file__), "serve", "--port", str(port)],
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    with open(PID_PATH, "w") as handle:
        handle.write(str(process.pid))


def _running_server(port):
    """떠 있는 서버가 ping으로 알린 코드 지문, pid, 설치 폴더와 기록 폴더. 서버가 없으면 None.
    지문이 없는 옛 서버면 code가 빈 문자열이다. 기록 폴더를 알리지 않는 판은 설치 폴더의 기록만 썼다."""
    try:
        with urllib.request.urlopen(_url(port) + "api/ping", timeout=0.5) as response:
            payload = json.loads(response.read() or b"{}")
    except (OSError, ValueError):
        return None
    root = payload.get("root")
    return {"code": payload.get("code", ""), "pid": payload.get("pid"), "root": root, "data": payload.get("data", root)}


def _stop_stale_server(port, running):
    """지금 코드와 다른 서버를 끈다. 서버가 알린 pid를 먼저 쓰고, pid를 알리지 않는 옛 서버는 PID 파일로 끈다."""
    if running["pid"]:
        try:
            os.kill(running["pid"], signal.SIGTERM)
        except ProcessLookupError:
            pass
        if os.path.exists(PID_PATH):
            os.remove(PID_PATH)
    else:
        _stop_pid(PID_PATH, "이전 코드로 떠 있던 대시보드 서버", SERVER_MARKER)
    for _ in range(20):
        if _running_server(port) is None:
            return True
        time.sleep(0.1)
    return False


def _ensure_server(port):
    """원장 서버를 띄운다. 이미 떠 있어도 지금 코드와 다르면(pull 뒤처럼) 끄고 다시 띄운다."""
    running = _running_server(port)
    if running and running.get("root") != store.ROOT:
        sys.exit(f"{port} 포트를 다른 서버가 사용 중입니다. 해당 서버를 종료하거나 다른 포트를 지정하세요.")
    # 같은 설치라도 다른 기록 폴더의 서버는 다른 사람이나 다른 실행 경로의 원장이다. 다시 쓰거나 끄지 않는다
    if running and running["data"] != store.DATA_ROOT:
        sys.exit(
            f"{port} 포트를 다른 기록 폴더({running['data']})의 서버가 사용 중입니다. "
            "해당 서버를 종료하거나 다른 포트를 지정하세요."
        )
    if running and running["code"] == server.code_version():
        return
    if running:
        print("원장 코드가 바뀌어 대시보드 서버를 다시 띄웁니다.")
        if not _stop_stale_server(port, running):
            print(f"이전 코드의 서버가 {port} 포트에 남아 있습니다. 직접 종료한 뒤 다시 실행하세요.", file=sys.stderr)
            return
    _start_background(port)
    if not _wait_until_running(port):
        sys.exit(f"서버를 시작하지 못했습니다. 로그: {LOG_PATH}")


def _wait_until_running(port, attempts=20):
    for _ in range(attempts):
        if _is_running(port):
            return True
        time.sleep(0.1)
    return False


def cmd_harvest(args):
    result = server.run_harvest(args.days)
    print(f"파일 {result['scanned_files']}개를 읽어 새 판정 {result['added']}건을 원장에 추가했습니다.")
    if result["skipped_compressed"]:
        print(f"이 Python에는 compression.zstd가 없어 압축된 Codex 기록 {result['skipped_compressed']}개를 건너뛰었습니다. Python 3.14 이상으로 실행하세요.")


def cmd_open(args):
    if args.harvest and not args.no_harvest:
        cmd_harvest(args)
    _ensure_server(args.port)
    print(f"대시보드: {_url(args.port)}")
    if not args.no_browser:
        webbrowser.open(_url(args.port))


def cmd_serve(args):
    print(f"대시보드: {_url(args.port)} (Ctrl+C로 종료)")
    server.serve(args.port)


def _pid_command(pid):
    result = subprocess.run(["ps", "-o", "command=", "-p", str(pid)], capture_output=True, text=True, check=False)
    return result.stdout.strip() if result.returncode == 0 else ""


def _stop_pid(pid_path, name, marker):
    """marker는 그 서버의 명령줄에 있어야 할 말이다. 재부팅 뒤 남은 pid 파일의 번호를 다른 프로그램이 받았으면
    그 프로세스 그룹을 끝내지 않는다."""
    if not os.path.exists(pid_path):
        print(f"실행 중인 {name} 기록이 없습니다.")
        return
    with open(pid_path) as handle:
        pid = int(handle.read().strip())
    command = _pid_command(pid)
    if command and marker not in command:
        print(f"{name}의 pid {pid}를 지금은 다른 프로그램이 쓰고 있어 종료하지 않았습니다.")
        os.remove(pid_path)
        return
    try:
        # labs 개발 서버는 pnpm 아래 vite가 따로 돌기 때문에 새 세션의 프로세스 그룹 전체를 끝낸다
        os.killpg(pid, signal.SIGTERM)
        print(f"{name}(pid {pid})를 종료했습니다.")
    except ProcessLookupError:
        print(f"{name}가 이미 종료되어 있습니다.")
    os.remove(pid_path)


def cmd_stop(args):
    _stop_pid(PID_PATH, "대시보드 서버", SERVER_MARKER)
    _stop_pid(lab.LABS_PID_PATH, "labs 개발 서버", "vite")


def cmd_lab(args):
    """시편 비교 화면을 연다. 원장 서버(평가 저장)와 labs 개발 서버(시편 화면)를 필요한 만큼 띄운다."""
    _ensure_server(DEFAULT_PORT)
    try:
        catalog = lab.load_catalog()
        known = {c["id"] for c in catalog["components"]}
        if args.component and args.component not in known:
            sys.exit(f"시편에 없는 컴포넌트입니다: {args.component}. 있는 것: {', '.join(sorted(known))}")
        lab.ensure_labs_server()
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
    url = lab.labs_url(args.component or "")
    state = lab.lab_state(args.component or "")
    print(f"시편 비교: {url}")
    print(f"평가가 남은 컴포넌트 {len(state['queue'])}개. A, B, C로 고르고 Enter로 저장합니다.")
    if not args.no_browser:
        webbrowser.open(url)


def _local_time(iso):
    return datetime.datetime.fromisoformat(iso).astimezone().strftime("%Y-%m-%d %H:%M")


def _local_date(iso):
    return datetime.datetime.fromisoformat(iso).astimezone().date().isoformat()


def cmd_status(args):
    verdicts = store.load_verdicts()
    rules = store.load_rules()["rules"]
    active = [v for v in verdicts if v["status"] != "ignored"]
    new = [v for v in verdicts if v["status"] == "new"]
    print(f"판정 {len(active)}건 (분류 전 {len(new)}건), 규칙 {len(rules)}개")
    last_run = store.load_cursor().get("last_run")
    print(f"마지막 수집: {_local_time(last_run) if last_run else '없음'}")
    errors = _recent_hook_errors()
    if errors:
        when, message = errors[-1]
        print(f"최근 {HOOK_ERROR_DAYS}일 훅 오류 {len(errors)}건, 마지막 {when:%m-%d %H:%M} {message[:120]} (전체: {HOOK_LOG_PATH})")
    for path in (store.VERDICTS_PATH, store.DELIVERIES_PATH, store.LINT_LOG_PATH, lab.JUDGMENTS_PATH):
        broken = store.broken_line_count(path)
        if broken:
            print(f"{os.path.basename(path)}에 읽지 못한 줄 {broken}개. 다음 저장 때 {os.path.basename(store.broken_path(path))}로 옮겨 둡니다")
    if new:
        print(f"분류 전 판정은 `{store.CLI} classify`로 보고 고칠 수 있습니다")

    ranked = sorted(rules, key=lambda r: -len(store.rule_evidence(r, verdicts)))
    print("\n가장 자주 지적한 규칙")
    for rule in ranked[:5]:
        evidence = store.rule_evidence(rule, verdicts)
        last = max((_local_date(v["ts"]) for v in evidence), default="-")
        print(f"  {len(evidence):>2}회  {rule['title']}  (최근 {last})")

    symptom_counts = collections.Counter(s for v in active if v["polarity"] != "positive" for s in v["symptoms"])
    # owner가 있는 증상은 다른 스킬이 절차로 다루고, 좋아한 패턴은 피할 것이 아니므로 대시보드와 같이 규칙 후보에서 뺀다
    owned = {s["id"] for s in store.load_symptoms()["symptoms"] if s.get("owner") or store.is_liked(s)}
    uncovered = [
        s for s in symptom_counts
        if s not in owned and not any(s in r.get("symptoms", []) for r in rules)
    ]
    if uncovered:
        print("\n규칙이 없는 반복 증상: " + ", ".join(f"{s}({symptom_counts[s]})" for s in uncovered))

    try:
        catalog = lab.load_catalog()
    except (OSError, ValueError) as error:
        print(f"\n시편 평가: 카탈로그를 읽지 못했습니다 ({error})")
        return
    if catalog["components"]:
        info = lab.summary(catalog, lab.load_judgments(), store.load_deliveries())
        last = _local_time(info["last"]) if info["last"] else "없음"
        print(f"\n시편 평가: 차원 {info['dimensions']}개 중 {info['settled']}개 정리, 남은 비교 {info['pending']}개, 마지막 평가 {last}")
        if info["pending"]:
            print(f"  이어서 평가: {lab.LAB_COMMAND}")
        if info["dormant"]:
            print(f"  {lab.DORMANT_DAYS}일 동안 평가도 실제 작업 언급도 없습니다. 시편 실험장 정리 후보입니다.")


def cmd_block(args):
    rules_doc = store.load_rules()
    text = store.build_block(
        rules_doc, store.load_verdicts(), args.audience, store.load_symptoms(), lab.safe_block_lines(),
    )
    if not args.no_log:
        store.log_delivery(args.via, project=os.getcwd().replace(os.path.expanduser("~"), "~"),
                           rule_ids=[r["id"] for r in rules_doc["rules"]])
    if args.copy:
        # 로케일이 없는 환경에서 pbcopy는 입력을 UTF-8로 읽지 않아 한글이 깨진다
        subprocess.run(["pbcopy"], input=text.encode(), env={**os.environ, "LANG": "en_US.UTF-8"}, check=False)
        print("취향 블록을 클립보드에 복사했습니다.", file=sys.stderr)
    print(text, end="")


def cmd_apply_context(args):
    """/taste 적용. 스킬이 출력을 그대로 읽어 이번 화면 작업에 쓴다."""
    from tastelib import context

    try:
        catalog = lab.load_catalog()
    except (OSError, ValueError) as error:
        print(f"시편 카탈로그를 읽지 못해 규칙만 넣습니다 ({error})", file=sys.stderr)
        catalog = {"components": []}
    components = [c.strip() for c in (args.components or "").split(",") if c.strip()]
    text, used = context.build(
        catalog, lab.load_judgments(), store.load_rules(), store.load_verdicts(), store.load_symptoms(),
        request=args.request or "", component_ids=components,
    )
    # 치환되지 않은 ${CLAUDE_SESSION_ID} 같은 자리표시자는 세션 id가 아니다
    session = "" if "$" in args.session else args.session.strip()
    if session:
        # lint 결과가 이 세션의 적용과 이어지도록 안내하는 명령에 세션 id를 붙인다
        text = text.replace(store.LINT_COMMAND, f"{store.LINT_COMMAND} --session {session}")
    if not args.no_log:
        store.log_delivery(
            args.via, session=session, project=os.getcwd().replace(os.path.expanduser("~"), "~"),
            rule_ids=used["rules"], components=used["components"], specimens=used["specimens"],
            surface=args.surface,
        )
    print(text, end="")


def cmd_tokens(args):
    from tastelib import tokens

    try:
        files = tokens.render_all(lab.load_catalog(), lab.load_judgments())
    except (OSError, ValueError) as error:
        sys.exit(f"시편 카탈로그를 읽지 못했습니다: {error}")
    if not args.out:
        for name, text in files.items():
            print(f"/* ==== {name} ==== */\n{text}")
        return
    os.makedirs(args.out, exist_ok=True)
    for name, text in files.items():
        with open(os.path.join(args.out, name), "w", encoding="utf-8") as handle:
            handle.write(text)
        print(f"생성: {os.path.join(args.out, name)}")


def cmd_apply(args):
    """저장소에 취향 사본을 쓰거나(--check면 비교만) 한다. 커밋은 하지 않는다."""
    from tastelib import repo as repo_copy

    try:
        if args.check:
            repo, expected, warnings = repo_copy.plan(args.repo)
            changed = repo_copy.stale(expected)
        else:
            repo, changed, warnings = repo_copy.apply(args.repo)
    except ValueError as error:
        sys.exit(str(error))
    for warning in warnings:
        print(f"주의: {warning}", file=sys.stderr)
    shown = [os.path.relpath(path, repo) for path in changed]
    if args.check:
        if shown:
            print(f"{repo}의 취향 사본이 원장과 다릅니다. `taste.py apply {args.repo}`로 다시 만드세요:")
            print("\n".join(f"  {path}" for path in shown))
            sys.exit(1)
        print(f"{repo}의 취향 사본이 원장과 같습니다.")
        return
    print(f"{repo}에 취향 사본을 썼습니다 ({len(shown)}개 파일 변경). 커밋은 저장소에서 직접 합니다.")
    print("\n".join(f"  {path}" for path in shown))


def cmd_stop_check(args):
    """Stop 훅. 실패해도 세션을 막지 않도록 오류는 로그에만 남긴다."""
    from tastelib import stopcheck

    try:
        output = stopcheck.check(json.load(sys.stdin), args.surface)
        if output:
            print(json.dumps(output, ensure_ascii=False))
    except Exception as error:  # noqa: BLE001
        _log_hook_error("stop-check", error)


def cmd_stop_track(args):
    """Codex PostToolUse 훅. 실패해도 도구 결과를 바꾸지 않도록 오류는 로그에만 남긴다."""
    from tastelib import stopcheck

    try:
        stopcheck.track_codex(json.load(sys.stdin))
    except Exception as error:  # noqa: BLE001
        _log_hook_error("stop-track", error)


def cmd_doctor(args):
    from tastelib import doctor

    text, problems = doctor.report()
    print(text, end="")
    sys.exit(1 if problems else 0)


def cmd_hook(args):
    """훅 실패가 사용자의 프롬프트를 막으면 안 되므로 어떤 오류도 조용히 넘긴다.
    2026-10-22부터 훅은 판정을 기록만 하고 아무것도 출력하지 않는다. Copilot의 프롬프트도 그대로 둔다."""
    from tastelib import inject

    try:
        payload = json.load(sys.stdin)
        # 서브에이전트의 지시는 사람이 내린 판정으로 기록하지 않는다.
        if payload.get("agent_id") or payload.get("agentId"):
            return
        cwd = payload.get("cwd", "")
        if args.surface == "copilot":
            prompt = payload.get("prompt")
            session = payload.get("sessionId")
            transformed_prompt = payload.get("transformedPrompt")
            # 입력을 확인한 뒤 원장에 기록한다. 출력하지 않으므로 CLI가 만든 transformedPrompt는 그대로 쓰인다.
            if not isinstance(prompt, str) or not isinstance(transformed_prompt, str):
                raise ValueError("Copilot 훅의 prompt와 transformedPrompt는 문자열이어야 합니다.")
            if not isinstance(session, str) or not session.strip():
                raise ValueError("Copilot 훅에 sessionId가 없습니다.")
            if not isinstance(cwd, str):
                raise ValueError("Copilot 훅의 cwd는 문자열이어야 합니다.")
        else:
            prompt = payload.get("prompt") or ""
            session = payload.get("session_id", "")
        inject.record_prompt(prompt, session, cwd, args.surface)
    except Exception as error:  # noqa: BLE001
        _log_hook_error("hook", error)


def cmd_record(args):
    """/taste에 붙인 판정을 원장에 바로 기록한다. 사용자가 판정이라고 직접 표시한 입력이라 신호어 검사를 하지 않는다."""
    from tastelib import harvest, inject

    text = sys.stdin.read().replace("\ufffd", "").strip()
    if not text:
        sys.exit("기록할 판정 문장이 없습니다. stdin으로 넘겨 주세요.")
    # 치환되지 않은 ${CLAUDE_SESSION_ID} 같은 자리표시자는 세션 id가 아니다
    session = "" if "$" in args.session else args.session.strip()
    symptoms_doc = store.load_symptoms()
    symptom_ids = store.symptom_matcher(symptoms_doc)(text)
    added = store.append_verdict({
        "id": harvest.verdict_id(args.surface, session, text),
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": args.surface,
        "session": session,
        "project": os.getcwd().replace(os.path.expanduser("~"), "~"),
        "text": text,
        "context": "",
        "symptoms": symptom_ids,
        "components": lab.safe_component_matcher()(text),
        "polarity": harvest.polarity(text),
        "origin": "skill",
        "status": "new",
    })
    print("판정을 원장에 분류 전으로 기록했습니다." if added else "같은 판정이 이미 원장에 있어 다시 기록하지 않았습니다.")
    if symptom_ids:
        verdicts = store.load_verdicts()
        print("\n" + inject.feedback_section(symptom_ids, symptoms_doc, store.load_rules()["rules"], verdicts))
    else:
        print("증상 목록에 맞는 증상이 없습니다. 대시보드 분류 탭에서 증상을 붙이거나 새 증상 후보로 정리하세요.")


def cmd_classify(args):
    """대시보드 없이 판정을 분류한다. id 없이 부르면 분류 전 판정을 보여 준다."""
    if not args.id:
        new = [v for v in store.load_verdicts() if v["status"] == "new"]
        for verdict in new:
            text = " ".join(verdict["text"].split())
            symptoms = ", ".join(verdict["symptoms"]) or "증상 없음"
            print(f"{verdict['id']}  {_local_date(verdict['ts'])}  {verdict['polarity']}  [{symptoms}]  {text[:70]}")
        print(f"\n분류 전 {len(new)}건. 고치기: {store.CLI} classify <id> --keep|--ignore [--polarity positive]")
        return
    if args.status is None and args.polarity is None:
        sys.exit("--keep, --ignore, --polarity 중 하나가 필요합니다.")
    with store.ledger_lock():
        verdicts = store.load_verdicts()
        matches = [v for v in verdicts if v["id"].startswith(args.id)]
        if len(matches) != 1:
            sys.exit(f"판정을 하나로 찾지 못했습니다: {args.id} ({len(matches)}건)")
        target = matches[0]
        if args.status is not None:
            target["status"] = args.status
        if args.polarity is not None:
            target["polarity"] = args.polarity
        store.save_verdicts(verdicts)
    print(f"{target['id']}: {target['status']}, {target['polarity']}")


def cmd_retag(args):
    """증상 카탈로그를 고친 뒤 분류 전이고 증상이 빈 판정에만 증상을 다시 붙인다. 사람이 손댄 판정은 두고 본다.

    시편 컴포넌트 태그는 사람이 고치는 값이 아니므로, 태그 필드가 아직 없는 판정이면 상태와 상관없이 채운다.
    """
    match = store.symptom_matcher(store.load_symptoms())
    match_components = lab.safe_component_matcher()
    with store.ledger_lock():
        verdicts = store.load_verdicts()
        changed, tagged = [], []
        for verdict in verdicts:
            if "components" not in verdict:
                verdict["components"] = match_components(verdict["text"])
                if verdict["components"]:
                    tagged.append(verdict)
            if verdict["status"] != "new" or verdict["symptoms"]:
                continue
            symptom_ids = match(verdict["text"])
            if symptom_ids:
                verdict["symptoms"] = symptom_ids
                changed.append(verdict)
        if (changed or tagged) and not args.dry_run:
            store.save_verdicts(verdicts)
    action = "붙일" if args.dry_run else "붙인"
    print(f"증상을 새로 {action} 판정 {len(changed)}건")
    for verdict in changed:
        text = " ".join(verdict["text"].split())
        print(f"  {', '.join(verdict['symptoms'])}  {text[:50]}")
    print(f"시편 컴포넌트를 새로 {action} 판정 {len(tagged)}건")
    for verdict in tagged:
        text = " ".join(verdict["text"].split())
        print(f"  {', '.join(verdict['components'])}  {text[:50]}")


def cmd_lint(args):
    """측정은 playwright가 필요해 uv가 격리 환경에서 lint.py를 실행한다. 이 파일은 표준 라이브러리만 쓴다."""
    uv = shutil.which("uv") or os.path.expanduser("~/.local/bin/uv")
    if not os.path.exists(uv):
        sys.exit("lint에는 uv가 필요합니다: https://docs.astral.sh/uv/")
    command = [uv, "run", "--quiet", "--script", LINT_SCRIPT, args.target]
    for scenario in args.only or ():
        command += ["--only", scenario]
    if args.shots:
        command += ["--shots", args.shots]
    if args.json:
        command.append("--json")
    if args.session:
        command += ["--session", args.session]
    if args.no_log:
        command.append("--no-log")
    sys.exit(subprocess.call(command))


def _dated(required_label):
    """`YYYY-MM-DD[:이름]` 인자를 (날짜, 이름)으로 읽는 argparse 형식. 이름은 효과 보고에서 구간을 가리킨다."""

    def parse(text):
        day_text, has_label, label = text.partition(":")
        try:
            day = datetime.date.fromisoformat(day_text)
        except ValueError:
            raise argparse.ArgumentTypeError(f"날짜는 YYYY-MM-DD 형식이어야 합니다: {day_text}") from None
        label = label.strip()
        if required_label and not label:
            raise argparse.ArgumentTypeError(f"날짜 뒤에 ':이름'이 필요합니다: {text}")
        if has_label and not label:
            raise argparse.ArgumentTypeError(f"':' 뒤 이름이 비었습니다: {text}")
        return day, label or "Tastepin 사용"

    return parse


def cmd_effect(args):
    """효과 판정 재료. 지난 대화 기록을 다시 읽으므로 수십 초 걸릴 수 있다."""
    from tastelib import effect

    since, label = args.since
    changes = sorted(args.change or [])
    days = [day for day, _ in changes]
    if any(day <= since for day in days) or len(set(days)) != len(days):
        sys.exit("--change 날짜는 --since 뒤여야 하고 서로 달라야 합니다.")
    effect.INTRODUCED = since
    effect.INTERVENTIONS = ((since, label), *changes)
    if args.freeze:
        baseline, created = effect.freeze_baseline()
        summary = baseline["summary"]
        state = "고정했습니다" if created else "이미 고정돼 있어 그대로 둡니다"
        print(f"기준선 {summary['start']} ~ {summary['end']}을 {state}: {effect.BASELINE_PATH}")
    if args.save_version:
        path, _, created = effect.save_baseline_version(args.save_version)
        print(f"기준선 버전 {'저장' if created else '기존 보존'}: {path}")
    print(effect.report(datetime.datetime.now().astimezone().date()))


def cmd_export(args):
    path = store.export_markdown(
        store.load_rules(), store.load_verdicts(), store.load_symptoms(), lab.safe_block_lines(),
    )
    print(f"생성: {path}")


def main():
    parser = argparse.ArgumentParser(description="디자인 취향 원장")
    commands = parser.add_subparsers(dest="command", required=True)

    def add(name, handler, help_text):
        sub = commands.add_parser(name, help=help_text)
        sub.set_defaults(handler=handler)
        return sub

    harvest = add("harvest", cmd_harvest, "대화 기록에서 새 판정 수집")
    harvest.add_argument("--days", type=int, default=server.HARVEST_DAYS_DEFAULT)

    open_cmd = add("open", cmd_open, "대시보드 열기 (대화 수집은 --harvest로 요청)")
    open_cmd.add_argument("--port", type=int, default=DEFAULT_PORT)
    open_cmd.add_argument("--days", type=int, default=server.HARVEST_DAYS_DEFAULT)
    open_cmd.add_argument("--harvest", action="store_true", help="로컬 대화 기록에서 판정을 수집한다")
    open_cmd.add_argument("--no-harvest", action="store_true", help=argparse.SUPPRESS)
    open_cmd.add_argument("--no-browser", action="store_true")

    serve = add("serve", cmd_serve, "포그라운드 서버")
    serve.add_argument("--port", type=int, default=DEFAULT_PORT)

    add("stop", cmd_stop, "백그라운드 서버 종료")
    add("status", cmd_status, "터미널 요약")
    apply_context = add("apply-context", cmd_apply_context, "/taste 적용: 화면 작업에 넣을 취향 출력")
    apply_context.add_argument("--request", help="작업 설명. 나온 시편 컴포넌트의 고른 값을 붙인다")
    apply_context.add_argument("--components", help="쉼표로 나눈 시편 컴포넌트 id (예: toast,dialog)")
    apply_context.add_argument("--session", default="", help="Claude Code 스킬은 ${CLAUDE_SESSION_ID}를 넘긴다")
    apply_context.add_argument("--surface", choices=("claude", "codex", "copilot"), default="claude")
    apply_context.add_argument(
        "--via", choices=("skill", "handoff-implement"), default="skill",
        help="전달 경로 기록용. /taste는 skill, design-handoff 구현 단계는 handoff-implement",
    )
    apply_context.add_argument("--no-log", action="store_true", help="확인만 하고 전달 기록을 남기지 않는다")

    block = add("block", cmd_block, "취향 블록 출력")
    block.add_argument("--for", dest="audience", choices=("design", "agent"), default="design")
    block.add_argument("--via", default="manual", help="전달 경로 기록용 (handoff-brief, handoff-implement 등)")
    block.add_argument("--copy", action="store_true", help="클립보드에도 복사")
    block.add_argument("--no-log", action="store_true", help="확인만 하고 전달 기록을 남기지 않는다")
    tokens_cmd = add("tokens", cmd_tokens, "고른 값을 토큰 파일로 내보내기")
    tokens_cmd.add_argument("--out", help="세 파일을 쓸 폴더. 없으면 표준 출력")

    apply_cmd = add("apply", cmd_apply, "저장소에 취향 사본 남기기")
    apply_cmd.add_argument("repo", help="작업 저장소 경로")
    apply_cmd.add_argument("--check", action="store_true", help="쓰지 않고 사본이 낡았는지만 확인 (낡으면 종료 코드 1)")

    stop_track = add("stop-track", cmd_stop_track, "Codex PostToolUse 훅")
    stop_track.add_argument("--surface", choices=("codex",), default="codex")
    stop_check = add("stop-check", cmd_stop_check, "Claude Code/Codex Stop 훅")
    stop_check.add_argument("--surface", choices=("claude", "codex"), default="claude")
    add("doctor", cmd_doctor, "소비 경로 점검")

    hook = add("hook", cmd_hook, "프롬프트 제출 훅")
    hook.add_argument("--surface", choices=("claude", "codex", "copilot"), default="claude")
    record = add("record", cmd_record, "/taste로 준 판정을 원장에 기록 (stdin으로 판정 문장)")
    record.add_argument("--surface", choices=("claude", "codex", "copilot"), required=True)
    record.add_argument("--session", default="", help="Claude Code 스킬은 ${CLAUDE_SESSION_ID}를 넘긴다")
    classify = add("classify", cmd_classify, "판정 분류 (id 없이 부르면 분류 전 판정 목록)")
    classify.add_argument("id", nargs="?", help="판정 id (앞부분만 써도 하나로 정해지면 된다)")
    classify_status = classify.add_mutually_exclusive_group()
    classify_status.add_argument("--keep", dest="status", action="store_const", const="kept", help="근거로 남긴다")
    classify_status.add_argument("--ignore", dest="status", action="store_const", const="ignored", help="판정이 아니다")
    classify.add_argument("--polarity", choices=store.POLARITIES, help="칭찬, 지적, 섞임을 고친다")
    retag = add("retag", cmd_retag, "카탈로그 수정 뒤 분류 전이고 증상이 빈 판정에 증상 다시 붙이기")
    retag.add_argument("--dry-run", action="store_true", help="바꾸지 않고 붙일 증상만 보기")
    lint = add("lint", cmd_lint, "화면을 열어 값으로 잴 수 있는 취향 위반 점검 (uv와 playwright 사용)")
    lint.add_argument("target", help="URL, localhost:3000 같은 주소나 HTML 파일 경로")
    lint.add_argument("--only", choices=("light", "dark", "mobile"), action="append", help="특정 화면 조건만")
    lint.add_argument("--shots", metavar="DIR", help="조건별 전체 스크린숏 저장 폴더")
    lint.add_argument("--json", action="store_true")
    lint.add_argument("--session", default="", help="/taste로 취향을 받은 세션 id (Claude Code는 ${CLAUDE_SESSION_ID})")
    lint.add_argument("--no-log", action="store_true", help="state/lint.jsonl에 남기지 않는다")
    add("export", cmd_export, "TASTE.md 생성")
    effect_cmd = add("effect", cmd_effect, "훅 도입 전후의 지적 빈도를 같은 기준으로 비교")
    effect_cmd.add_argument(
        "--since", type=_dated(required_label=False), required=True,
        help="취향을 적용하기 시작한 날짜 YYYY-MM-DD[:이름]. 이름이 없으면 'Tastepin 사용'",
    )
    effect_cmd.add_argument(
        "--change", type=_dated(required_label=True), action="append",
        help="소비 방식을 바꾼 날짜 YYYY-MM-DD:이름. 이번 구간을 이 날로 나눠 따로 센다. 여러 번 줄 수 있다",
    )
    effect_cmd.add_argument("--freeze", action="store_true", help="도입 전 기준선을 계산해 고정 (이미 있으면 그대로)")
    effect_cmd.add_argument("--save-version", metavar="이유", help="최초 기준선을 보존하고 현재 정의의 재계산본을 별도 저장")
    lab_cmd = add("lab", cmd_lab, "labs 시편 비교 화면 열기 (원장 서버와 labs 개발 서버를 필요하면 띄운다)")
    lab_cmd.add_argument("component", nargs="?", help="먼저 평가할 컴포넌트 id (예: tabs)")
    lab_cmd.add_argument("--no-browser", action="store_true")

    args = parser.parse_args()
    problems = store.location_problems()
    if problems:
        sys.exit("\n".join(problems))
    args.handler(args)


if __name__ == "__main__":
    main()
