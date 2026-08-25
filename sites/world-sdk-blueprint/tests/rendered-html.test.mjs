import assert from "node:assert/strict";
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

test("server-renders the current World SDK architecture authority", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>World SDK · 技术方案<\/title>/i);
  assert.match(
    html,
    /规划与构建 Agent 创造世界，World SDK 维护从语义输入到可观察 Runtime 的确定性规则与权威边界。/,
  );
  assert.doesNotMatch(
    html,
    /Runtime World Director 支持玩家实时用自然语言改变世界/,
  );
  for (const currentContract of [
    "Canonical Authoring V4",
    "NormalizedWorldIR V4",
    "ExecutionPlan V5",
    "RuntimeHost",
    "Babylon.js + Havok",
    "Browser Protocol V5 / Snapshot V4",
    "当前生产边界",
    "户外高度场世界",
    "尚未作为生产能力开放",
  ]) {
    assert.match(html, new RegExp(currentContract.replaceAll("+", "\\+")));
  }
  assert.doesNotMatch(html, /<iframe\b/i);
  assert.doesNotMatch(html, /\/legacy\//i);
  assert.doesNotMatch(html, /Building your site|Your site is taking shape/i);
});
