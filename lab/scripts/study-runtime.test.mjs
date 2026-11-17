import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

test("렌더 실패와 실행 오류를 PNG 성공으로 저장하지 않는다", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "study-runtime-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  await writeFile(
    join(base, "revision.json"),
    JSON.stringify({
      files: ["Screen.tsx"],
      entry: "Screen.tsx",
      theme: "dark",
      dimensions: [],
    }),
  );
  const cases = [
    {
      name: "render error",
      code: 'export default function Screen(){throw new Error("render-failed");}',
      error: "render-failed",
    },
    {
      name: "effect error",
      code: 'import {useEffect} from "react"; export default function Screen(){useEffect(()=>{throw new Error("effect-failed")},[]);return <p>화면</p>}',
      error: "effect-failed",
    },
    {
      name: "legacy ready signal with error",
      html: '<script>window.__studyReady=true; throw new Error("legacy-failed")</script>',
      error: "legacy-failed",
    },
    {
      name: "successful render",
      code: "export default function Screen(){return <main style={{height:700}}>정상 화면</main>}",
    },
  ];
  for (const [index, item] of cases.entries())
    await t.test(item.name, async () => {
      const html = join(base, `${index}.html`);
      if (item.html) await writeFile(html, item.html);
      else {
        await writeFile(join(base, "Screen.tsx"), item.code);
        const built = spawnSync(
          process.execPath,
          [
            fileURLToPath(new URL("./build-study.mjs", import.meta.url)),
            base,
            html,
          ],
          { encoding: "utf8" },
        );
        assert.equal(built.status, 0, built.stderr);
      }
      const output = join(base, `${index}.png`);
      const input = join(base, `${index}.json`);
      await writeFile(
        input,
        JSON.stringify({
          html,
          output,
          params: {},
          viewport: { width: 390, height: 600 },
          chrome: process.env.STUDY_CHROME,
        }),
      );
      const captured = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("./capture-study.mjs", import.meta.url)), input],
        { encoding: "utf8", timeout: 25000 },
      );
      if (item.error) {
        assert.notEqual(
          captured.status,
          0,
          "실패한 렌더를 정상 캡처로 저장했습니다",
        );
        assert.match(captured.stderr, new RegExp(item.error));
        await assert.rejects(access(output));
      } else {
        assert.equal(captured.status, 0, captured.stderr);
        const png = await readFile(output);
        assert.equal(png.readUInt32BE(16), 390);
        assert.ok(png.readUInt32BE(20) >= 700);
      }
    });
});
