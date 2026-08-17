import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the World SDK blueprint shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>World SDK · 技术方案<\/title>/i);
  assert.match(
    html,
    /两段 Agent 创造世界，World SDK 维护确定性规则，Runtime World Director 支持玩家实时用自然语言改变世界。/,
  );
  assert.match(html, /<iframe[^>]+src="\/legacy\/index\.html"/i);
  assert.match(html, /title="World SDK 技术方案"/i);
  assert.doesNotMatch(html, /Building your site|Your site is taking shape/i);
});

test("keeps the blueprint wrapper and legacy bundle wired together", async () => {
  const [page, layout, css, legacy] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/index.html", import.meta.url), "utf8"),
  ]);

  assert.match(page, /src="\/legacy\/index\.html"/);
  assert.match(page, /className="site-frame"/);
  assert.match(layout, /title:\s*"World SDK · 技术方案"/);
  assert.match(layout, /lang="zh-CN"/);
  assert.match(css, /\.site-frame-shell\s*\{/);
  assert.match(css, /\.site-frame\s*\{/);
  assert.match(legacy, /\/legacy\/assets\/index-BFWMSt38\.js/);
  assert.match(legacy, /\/legacy\/assets\/index-LBTNeDcm\.css/);

  await Promise.all([
    access(new URL("../public/legacy/assets/index-BFWMSt38.js", import.meta.url)),
    access(new URL("../public/legacy/assets/index-LBTNeDcm.css", import.meta.url)),
    access(
      new URL(
        "../public/legacy/world-sdk-technical-architecture.png",
        import.meta.url,
      ),
    ),
  ]);
});
