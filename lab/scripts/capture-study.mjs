// 설치된 Chrome과 Node의 WebSocket을 사용한다. 새 브라우저나 패키지를 설치하지 않는다.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const input = JSON.parse(await readFile(process.argv[2], "utf8"));
const defaultChrome =
  process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : "google-chrome";
const profile = await mkdtemp(join(tmpdir(), "taste-study-chrome-"));
const chrome = spawn(
  input.chrome || defaultChrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
let startupError;
chrome.on("error", (error) => {
  startupError = error;
});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupError) throw startupError;
    if (chrome.exitCode !== null)
      throw new Error("Chrome이 시작하지 못했습니다");
    try {
      port = Number(
        (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
          "\n",
        )[0],
      );
      break;
    } catch {
      await pause(100);
    }
  }
  if (!port) throw new Error("Chrome 연결 시간이 초과됐습니다");
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  socket = new WebSocket(
    targets.find((target) => target.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let serial = 0;
  const pending = new Map();
  const pageErrors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown")
      pageErrors.push(
        message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text,
      );
    const task = pending.get(message.id);
    if (task) {
      pending.delete(message.id);
      clearTimeout(task.timer);
      message.error
        ? task.reject(new Error(message.error.message))
        : task.resolve(message.result);
    }
  };
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} 응답 시간 초과`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    ...input.viewport,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const url = pathToFileURL(input.html);
  url.searchParams.set("params", JSON.stringify(input.params));
  await call("Page.navigate", { url: url.href });
  async function renderState() {
    const result = await call("Runtime.evaluate", {
      expression:
        "({ready: window.__studyReady === true, error: window.__studyError || null})",
      returnByValue: true,
    });
    const state = result.result.value;
    const error =
      pageErrors[0] || result.exceptionDetails?.text || state?.error;
    if (error) throw new Error("시편 실행 오류: " + error);
    return state;
  }
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await renderState())?.ready) {
      ready = true;
      break;
    }
    await pause(100);
  }
  if (!ready)
    throw new Error(
      "시편이 화면을 준비하지 못했습니다: " +
        (pageErrors[0] || "렌더 완료 신호 없음"),
    );
  const metrics = await call("Page.getLayoutMetrics");
  const height = Math.ceil(
    Math.max(input.viewport.height, metrics.cssContentSize.height),
  );
  if (height > 16000) throw new Error("화면 높이가 캡처 한도를 초과했습니다");
  const result = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: input.viewport.width, height, scale: 1 },
  });
  if (!(await renderState())?.ready)
    throw new Error("캡처 도중 시편의 렌더 상태가 바뀌었습니다");
  await writeFile(input.output, Buffer.from(result.data, "base64"));
} finally {
  socket?.close();
  chrome.kill();
  await Promise.race([
    new Promise((resolve) => chrome.once("exit", resolve)),
    pause(3000),
  ]);
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}
