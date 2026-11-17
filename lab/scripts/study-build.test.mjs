import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

test("등록하지 않은 소스와 CSS 자산은 번들에 넣지 않는다", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "study-boundary-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const source = join(base, "source");
  await mkdir(source);
  const outside = join(base, "outside.ts");
  const asset = join(base, "outside.svg");
  const css = join(base, "outside.css");
  await writeFile(outside, 'export default "UNREGISTERED_SOURCE"');
  await writeFile(
    asset,
    '<svg xmlns="http://www.w3.org/2000/svg"><text>UNREGISTERED_ASSET</text></svg>',
  );
  await writeFile(css, "body { color: red }");
  const meta = {
    files: ["Screen.tsx", "style.css", "nested.css", "local.svg"],
    entry: "Screen.tsx",
    theme: "dark",
    dimensions: [],
  };
  await writeFile(join(source, "revision.json"), JSON.stringify(meta));
  await writeFile(
    join(source, "local.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  const cases = [
    {
      name: "absolute TS",
      code: `import value from ${JSON.stringify(outside)}; export default () => <p>{value}</p>;`,
    },
    {
      name: "absolute raw asset",
      code: `import value from ${JSON.stringify(asset + "?raw")}; export default () => <p>{value}</p>;`,
    },
    {
      name: "CSS url",
      css: `body { background: url(${JSON.stringify(asset)}) }`,
    },
    { name: "CSS import", css: `@import ${JSON.stringify(css)};` },
    {
      name: "nested CSS url",
      css: '@import "./nested.css";',
      nested: `body { background: url(${JSON.stringify(asset)}) }`,
    },
    {
      name: "new URL asset",
      code: `const value = new URL(${JSON.stringify(asset)}, import.meta.url).href; export default () => <img src={value}/>;`,
    },
  ];
  const build = () =>
    spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("./build-study.mjs", import.meta.url)),
        source,
        join(base, "screen.html"),
      ],
      { encoding: "utf8" },
    );
  for (const item of cases)
    await t.test(item.name, async () => {
      await writeFile(
        join(source, "Screen.tsx"),
        item.code ??
          'import "./style.css"; export default () => <p>등록한 화면</p>;',
      );
      await writeFile(join(source, "style.css"), item.css ?? "");
      await writeFile(join(source, "nested.css"), item.nested ?? "");
      const result = build();
      assert.notEqual(
        result.status,
        0,
        `unregistered input accepted: ${item.name}`,
      );
    });
  await t.test(
    "등록한 중첩 CSS와 이미지 및 React는 사용할 수 있다",
    async () => {
      await writeFile(
        join(source, "Screen.tsx"),
        'import {useState} from "react"; import "./style.css"; import image from "./local.svg"; export default () => {const [n] = useState(0); return <img src={image} alt={String(n)}/>;}',
      );
      await writeFile(join(source, "style.css"), '@import "./nested.css";');
      await writeFile(
        join(source, "nested.css"),
        'body { background: url("./local.svg") }',
      );
      const result = build();
      assert.equal(result.status, 0, result.stderr);
      assert.match(
        await readFile(join(base, "screen.html"), "utf8"),
        /data:image\/svg/,
      );
    },
  );
});
