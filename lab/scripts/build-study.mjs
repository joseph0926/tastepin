import { readFile, writeFile, realpath } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { build, transformWithOxc } from "vite";

const [sourceArgument, output] = process.argv.slice(2);
if (!sourceArgument || !output)
  throw new Error("시편 소스 폴더와 출력 HTML 경로가 필요합니다");
const source = await realpath(sourceArgument);
const labRoot = fileURLToPath(new URL("../", import.meta.url));
const meta = JSON.parse(
  await readFile(resolve(source, "revision.json"), "utf8"),
);
const allowed = new Set(meta.files.map((name) => resolve(source, name)));
const packages = ["react", "react-dom", "motion", "lucide-react"];
const virtualEntry = "\0study-entry";
const dependencyRoot = await realpath(resolve(labRoot, "node_modules"));
const cleanId = (id) => id.split(/[?#]/)[0];
const inside = (parent, file) => {
  const path = relative(parent, file);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};
async function registeredFile(id, importer) {
  const name = cleanId(id);
  const target = resolve(
    importer === virtualEntry ? source : dirname(cleanId(importer)),
    name,
  );
  const candidates = [
    target,
    ...[".tsx", ".ts", ".js", ".css"].map((ext) => target + ext),
    resolve(target, "index.tsx"),
  ];
  const found = candidates.find((file) => allowed.has(file));
  if (!found || !inside(source, found) || (await realpath(found)) !== found)
    throw new Error(`등록하지 않은 시편 의존성: ${id}`);
  return found + id.slice(name.length);
}
// CSS의 내부 해석기는 사용자 resolveId 훅을 거치지 않지만 alias는 공유한다.
// 이 경계에서 CSS @import와 url()도 파일을 읽기 전에 검사한다.
async function resolveStudyImport(id, importer) {
  if (id === "study-entry" || id === resolve(labRoot, "study-entry"))
    return virtualEntry;
  if (
    importer === virtualEntry ||
    (importer && allowed.has(cleanId(importer)))
  ) {
    if (packages.some((name) => id === name || id.startsWith(name + "/")))
      return this.resolve(id, resolve(labRoot, "src/main.tsx"), {
        skipSelf: true,
      });
    return registeredFile(id, importer);
  }
  return this.resolve(id, importer, { skipSelf: true });
}
function hasImportMeta(node) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "MetaProperty" && node.meta.name === "import") return true;
  return Object.values(node).some((value) =>
    Array.isArray(value) ? value.some(hasImportMeta) : hasImportMeta(value),
  );
}
const result = await build({
  configFile: false,
  envDir: false,
  root: labRoot,
  logLevel: "warn",
  publicDir: false,
  css: { postcss: {} },
  resolve: {
    alias: [{ find: /^/, replacement: "", customResolver: resolveStudyImport }],
  },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [
    {
      name: "study-source-boundary",
      enforce: "pre",
      async transform(code, id) {
        const file = cleanId(id);
        if (!allowed.has(file) || !/\.[jt]sx?$/.test(file)) return;
        // URL 자산과 glob은 Vite가 resolver 밖에서 읽을 수 있으므로 정적 import만 받는다.
        const transformed = await transformWithOxc(code, file, {
          tsconfig: {},
        });
        if (hasImportMeta(this.parse(transformed.code)))
          throw new Error(
            "시편 자산은 import.meta 대신 등록한 파일의 정적 import로 불러오세요",
          );
      },
      async load(id) {
        if (!id.startsWith("\0")) {
          const file = cleanId(id);
          if (
            !allowed.has(file) &&
            !inside(dependencyRoot, await realpath(file))
          )
            throw new Error(`등록하지 않은 시편 파일: ${id}`);
        }

        if (id !== virtualEntry) return;
        return `import React, {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import Screen from ${JSON.stringify(resolve(source, meta.entry))};
const defaults = ${JSON.stringify(Object.fromEntries(meta.dimensions.map((d) => [d.id, d.values[0].id])))};
const selected = window.__adoptedParams ?? JSON.parse(new URLSearchParams(location.search).get('params') || '{}');
const params = {...defaults, ...selected};
document.documentElement.dataset.theme = ${JSON.stringify(meta.theme)};
window.__studyReady = false;
function failed(error) {
  window.__studyError = String(error?.message || error);
  window.__studyReady = false;
}
window.addEventListener('error', event => failed(event.error || event.message));
window.addEventListener('unhandledrejection', event => failed(event.reason));
function CommittedScreen() {
  useEffect(() => {
    let active = true;
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      try {
        await document.fonts.ready;
        await Promise.all([...document.images].map(image => image.decode()));
        if (active && !window.__studyError) window.__studyReady = true;
      } catch (error) { failed(error); }
    }));
    return () => { active = false; };
  }, []);
  return React.createElement(Screen, {params, theme: ${JSON.stringify(meta.theme)}});
}
createRoot(document.getElementById('screen'), {
  onUncaughtError: failed, onCaughtError: failed, onRecoverableError: failed
}).render(React.createElement(CommittedScreen));`;
      },
    },
  ],
  esbuild: { jsx: "automatic" },
  build: {
    write: false,
    minify: false,
    cssCodeSplit: false,
    assetsInlineLimit: 16 * 1024 * 1024,
    lib: { entry: "study-entry", name: "TasteStudy", formats: ["iife"] },
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(
  (item) => item.output,
);
const js = outputs
  .filter((item) => item.type === "chunk")
  .map((item) => item.code)
  .join("\n");
const css = outputs
  .filter((item) => item.type === "asset" && item.fileName.endsWith(".css"))
  .map((item) => String(item.source))
  .join("\n");
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>코드 시편</title><style>html,body{margin:0}*{box-sizing:border-box}${css.replaceAll("</style", "<\\/style")}</style></head>
<body><div id="screen"></div><script>window.__adoptedParams=/* adopted-params */null;</script><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`;
await writeFile(output, html);
