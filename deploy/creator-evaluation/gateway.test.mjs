import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createCreatorEvaluationServer, injectHostCompatibility, parseByteRange } from "./gateway.mjs";

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  if (!server) return;
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
}

test("single byte ranges are bounded and support video suffix seeks", () => {
  assert.deepEqual(parseByteRange("bytes=2-5", 10), { start: 2, end: 5 });
  assert.deepEqual(parseByteRange("bytes=8-99", 10), { start: 8, end: 9 });
  assert.deepEqual(parseByteRange("bytes=-3", 10), { start: 7, end: 9 });
  for (const range of ["bytes=12-", "bytes=-0", "bytes=4-2", "bytes=1-2,4-5", "bytes=-"]) {
    assert.throws(() => parseByteRange(range, 10));
  }
});

test("HTTP UUID compatibility uses CSPRNG entropy and preserves native implementations", async () => {
  const code = await readFile(new URL("./host-compat.mjs", import.meta.url), "utf8");
  let entropyCalls = 0;
  const crypto = { getRandomValues(bytes) { entropyCalls += 1; return webcrypto.getRandomValues(bytes); } };
  runInNewContext(code, { crypto });
  const ids = new Set();
  for (let i = 0; i < 128; i += 1) {
    const id = crypto.randomUUID();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 128);
  assert.equal(entropyCalls, 128);
  const native = () => "native";
  const nativeCrypto = { randomUUID: native };
  runInNewContext(code, { crypto: nativeCrypto });
  assert.equal(nativeCrypto.randomUUID, native);
  assert.throws(() => runInNewContext(code, { crypto: {} }), /WORLDKIT_HOST_CSPRNG_UNAVAILABLE/);
  const withHead = injectHostCompatibility(Buffer.from('<!doctype html><html><head><script type="module">boot()</script></head></html>'), "/creator-evals/").toString();
  assert.match(withHead, /^<!doctype html><html><head><script src=/);
  assert.ok(withHead.indexOf("host-compat.mjs") < withHead.indexOf('type="module"'));
});

test("gallery stays read-only, preserves the existing monitor, and confines static paths", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "creator-evaluation-gateway-"));
  const root = path.join(temporary, "gallery");
  let upstream;
  let gateway;
  try {
    await mkdir(root);
    await writeFile(path.join(root, "index.html"), "<!doctype html><title>Experimental Creator</title>");
    await writeFile(path.join(root, "video.mp4"), "0123456789");
    await writeFile(path.join(root, "test.wasm"), "wasm");
    const subjectDirectory = path.join(root,"cases/test-scene/abcdef1234567890/playable/subject-assets/humanoid/source-101");
    await mkdir(subjectDirectory,{recursive:true});
    const subjectFile = path.join(subjectDirectory,"model.glb");
    await writeFile(subjectFile, "verified-subject-bytes");
    await writeFile(path.join(temporary, "outside.txt"), "must-not-be-served");
    await symlink(path.join(temporary, "outside.txt"), path.join(root, "escape.txt"));
    const proxied = [];
    upstream = createServer((request, response) => {
      proxied.push({ url: request.url, method: request.method, authorization: request.headers.authorization });
      response.writeHead(200, { "content-type": "application/json", "x-original-monitor": "yes" });
      response.end(JSON.stringify({ originalMonitor: true, url: request.url }));
    });
    const upstreamOrigin = await listen(upstream);
    const subjectHash = `sha256:${createHash("sha256").update("verified-subject-bytes").digest("hex")}`;
    gateway = createCreatorEvaluationServer({ staticRoot: root, upstreamOrigin });
    const origin = await listen(gateway);

    const health = await fetch(`${origin}/__creator_eval_health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ready, true);
    const page = await fetch(`${origin}/creator-evals/`);
    assert.equal(page.status, 200);
    const servedPage = await page.text();
    assert.match(servedPage, /Experimental Creator/);
    assert.match(servedPage, /^<!doctype html><script src="\/creator-evals\/host-compat.mjs\?sha256=/);
    const originalPage = await readFile(path.join(root, "index.html"));
    assert.equal(originalPage.toString(), "<!doctype html><title>Experimental Creator</title>");
    assert.equal(page.headers.get("x-worldkit-original-sha256"), createHash("sha256").update(originalPage).digest("hex"));
    assert.equal(page.headers.get("x-worldkit-served-sha256"), createHash("sha256").update(servedPage).digest("hex"));
    assert.equal(Number(page.headers.get("content-length")), Buffer.byteLength(servedPage));
    const htmlRange = await fetch(`${origin}/creator-evals/`, { headers: { range: "bytes=0-14" } });
    assert.equal(htmlRange.status, 206);
    assert.equal(await htmlRange.text(), "<!doctype html>");
    const shim = await fetch(`${origin}/creator-evals/host-compat.mjs`);
    assert.equal(shim.status, 200);
    assert.equal(await shim.text(), await readFile(new URL("./host-compat.mjs", import.meta.url), "utf8"));
    const transform = await fetch(`${origin}/creator-evals/deployment-transforms.json`).then((response) => response.json());
    assert.equal(transform.originalArtifactBytesModified, false);
    assert.match(transform.compatibilityScriptHash, /^sha256:[a-f0-9]{64}$/);
    const referer = `${origin}/creator-evals/cases/test-scene/abcdef1234567890/playable/index.html?play=1`;
    const aliased = await fetch(`${origin}/subject-assets/humanoid/source-101/model.glb?worldkit-content-hash=${subjectHash}`, {redirect:"error",headers:{referer}});
    assert.equal(aliased.status,200);
    assert.equal(await aliased.text(),"verified-subject-bytes");
    assert.equal(aliased.headers.get("x-worldkit-artifact-sha256"),subjectHash.slice(7));
    await writeFile(subjectFile,"modified-subject-bytes");
    const tampered = await fetch(`${origin}/subject-assets/humanoid/source-101/model.glb?worldkit-content-hash=${subjectHash}`,{headers:{referer}});
    assert.equal(tampered.status,503);
    assert.equal(page.headers.get("x-frame-options"), "SAMEORIGIN");
    const redirect = await fetch(`${origin}/creator-evals?play=1`, { redirect: "manual" });
    assert.equal(redirect.headers.get("location"), "/creator-evals/?play=1");

    const range = await fetch(`${origin}/creator-evals/video.mp4`, { headers: { range: "bytes=2-5" } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(await range.text(), "2345");
    const invalid = await fetch(`${origin}/creator-evals/video.mp4`, { headers: { range: "bytes=50-" } });
    assert.equal(invalid.status, 416);
    const head = await fetch(`${origin}/creator-evals/test.wasm`, { method: "HEAD" });
    assert.equal(head.headers.get("content-type"), "application/wasm");
    assert.equal(head.headers.get("content-length"), "4");
    assert.equal(await head.text(), "");
    const cached = await fetch(`${origin}/creator-evals/test.wasm`, { headers: { "if-none-match": head.headers.get("etag") } });
    assert.equal(cached.status, 304);

    const escape = await fetch(`${origin}/creator-evals/escape.txt`);
    assert.equal(escape.status, 403);
    assert.doesNotMatch(await escape.text(), /must-not-be-served/);
    const traversal = await fetch(`${origin}/creator-evals/%2e%2e%2foutside.txt`);
    assert.equal(traversal.status, 403);
    const api = await fetch(`${origin}/api/worlds?selected=x`, { headers: { authorization: "do-not-forward" } });
    assert.deepEqual(await api.json(), { originalMonitor: true, url: "/api/worlds?selected=x" });
    assert.equal(api.headers.get("x-original-monitor"), "yes");
    assert.deepEqual(proxied, [{ url: "/api/worlds?selected=x", method: "GET", authorization: undefined }]);
    const mutation = await fetch(`${origin}/api/worlds`, { method: "POST", body: "{}" });
    assert.equal(mutation.status, 403);
    assert.equal(proxied.length, 1);
    const unrelated = await fetch(`${origin}/subject-assets/humanoid/source-101/model.glb?worldkit-content-hash=${subjectHash}`,{headers:{referer:'https://other.invalid/creator-evals/cases/test-scene/abcdef1234567890/playable/'}});
    assert.equal((await unrelated.json()).originalMonitor,true);
    assert.equal(proxied.length,2);
    const malformed = await fetch(`${origin}/subject-assets/humanoid/source-101/model.glb?worldkit-content-hash=bad`,{headers:{referer}});
    assert.equal(malformed.status,400);
  } finally {
    await close(gateway);
    await close(upstream);
    await rm(temporary, { recursive: true, force: true });
  }
});
