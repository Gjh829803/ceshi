import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createStudioPublicProxy } from "./public-proxy.mjs";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

test("protects one internal Studio without forwarding its access key", async () => {
  let upstreamAuthorization = "not-called";
  const upstream = createServer((request, response) => {
    upstreamAuthorization = request.headers.authorization ?? "missing";
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ path: request.url, host: request.headers.host }));
  });
  const upstreamOrigin = await listen(upstream);
  const accessKey = "test-public-access-key-1234";
  const proxy = createStudioPublicProxy({ targetOrigin: upstreamOrigin, accessKey });
  const proxyOrigin = await listen(proxy);
  try {
    const anonymous = await fetch(`${proxyOrigin}/api/health`);
    assert.equal(anonymous.status, 401);
    assert.match(anonymous.headers.get("www-authenticate") ?? "", /Basic/);

    const authorized = await fetch(`${proxyOrigin}/api/health?public=1`, {
      headers: {
        authorization: `Basic ${Buffer.from(`worldkit:${accessKey}`).toString("base64")}`,
      },
    });
    assert.equal(authorized.status, 200);
    assert.deepEqual(await authorized.json(), {
      path: "/api/health?public=1",
      host: new URL(upstreamOrigin).host,
    });
    assert.equal(upstreamAuthorization, "missing");
    assert.equal(authorized.headers.get("x-frame-options"), "SAMEORIGIN");
  } finally {
    await Promise.all([
      new Promise((resolve) => proxy.close(resolve)),
      new Promise((resolve) => upstream.close(resolve)),
    ]);
  }
});

test("rejects weak credentials and non-loopback targets", () => {
  assert.throws(
    () => createStudioPublicProxy({ accessKey: "short" }),
    /at least 16 characters/,
  );
  assert.throws(
    () => createStudioPublicProxy({
      accessKey: "test-public-access-key-1234",
      targetOrigin: "https://example.com",
    }),
    /loopback HTTP origin/,
  );
});
