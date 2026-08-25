import assert from "node:assert/strict";
import { createServer, request as createHttpRequest } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createStudioPublicProxy } from "./public-proxy.mjs";

const studioRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(studioRoot, "../..");

function viteFsUrl(absolutePath) {
  return `/@fs${encodeURI(absolutePath)}`;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

function authorization(accessKey) {
  return `Basic ${Buffer.from(`worldkit:${accessKey}`).toString("base64")}`;
}

async function requestUpgrade(origin, pathname, accessKey) {
  return new Promise((resolve, reject) => {
    const request = createHttpRequest(`${origin}${pathname}`, {
      headers: {
        authorization: authorization(accessKey),
        connection: "Upgrade",
        upgrade: "websocket",
      },
    });
    request.once("response", (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.once("upgrade", (response, socket) => {
      socket.destroy();
      resolve(response.statusCode);
    });
    request.once("error", reject);
    request.end();
  });
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
        authorization: authorization(accessKey),
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

test("does not expose Vite internals or unlisted paths through the public boundary", async () => {
  const forwarded = [];
  const upstream = createServer((request, response) => {
    forwarded.push(`${request.method} ${request.url}`);
    response.writeHead(200);
    response.end("forwarded");
  });
  const upstreamOrigin = await listen(upstream);
  const accessKey = "test-public-access-key-1234";
  const proxy = createStudioPublicProxy({ targetOrigin: upstreamOrigin, accessKey });
  const proxyOrigin = await listen(proxy);
  const headers = { authorization: authorization(accessKey) };
  try {
    const forbiddenRequests = [
      ["GET", "/@fs/etc/passwd"],
      ["GET", viteFsUrl(path.join(repoRoot, "README.md"))],
      ["GET", viteFsUrl(path.join(repoRoot, ".env"))],
      ["GET", viteFsUrl(path.join(repoRoot, "packages/authoring/package.json"))],
      ["GET", viteFsUrl(path.join(repoRoot, "packages/authoring/src/README.md"))],
      ["GET", viteFsUrl(path.join(repoRoot, "packages/authoring/src/private.env"))],
      ["POST", viteFsUrl(path.join(repoRoot, "packages/authoring/src/index.ts"))],
      ["POST", "/@vite/client"],
      ["POST", "/src/main.ts"],
      ["POST", "/node_modules/.vite/deps/lodash-es.js"],
      ["POST", "/__whitebox/write-triview"],
      ["GET", "/__worldkit/studio-ready"],
      ["GET", "/play/@fs/etc/passwd"],
      ["POST", "/app.js"],
      ["GET", "/api/not-a-studio-route"],
      ["GET", "/api/worlds/demo-world/authoring-spec"],
      ["GET", "/api/worlds/demo-world/visual-capture-targets"],
      ["POST", "/api/health"],
    ];
    for (const [method, pathname] of forbiddenRequests) {
      const response = await fetch(`${proxyOrigin}${pathname}`, { method, headers });
      assert.equal(response.status, 403, `${method} ${pathname}`);
    }
    assert.deepEqual(forwarded, []);
  } finally {
    await Promise.all([
      new Promise((resolve) => proxy.close(resolve)),
      new Promise((resolve) => upstream.close(resolve)),
    ]);
  }
});

test("forwards only the public Studio pages, assets, and declared API methods", async () => {
  const forwarded = [];
  const upstream = createServer((request, response) => {
    forwarded.push(`${request.method} ${request.url}`);
    response.writeHead(200);
    response.end("forwarded");
  });
  const upstreamOrigin = await listen(upstream);
  const accessKey = "test-public-access-key-1234";
  const proxy = createStudioPublicProxy({ targetOrigin: upstreamOrigin, accessKey });
  const proxyOrigin = await listen(proxy);
  const headers = { authorization: authorization(accessKey) };
  const requests = [
    ["GET", "/"],
    ["HEAD", "/styles.css"],
    ["GET", "/play?authoring=1&world=demo-world"],
    ["GET", "/@vite/client"],
    ["GET", "/src/main.ts"],
    ["HEAD", "/node_modules/.vite/deps/lodash-es.js"],
    ["GET", viteFsUrl(path.join(repoRoot, "apps/playground/src/main.ts"))],
    ["HEAD", viteFsUrl(path.join(repoRoot, "packages/authoring/src/index.ts"))],
    ["GET", "/scene-assets/demo-world/world-plan.png"],
    ["GET", "/worldkit-assets/character.glb"],
    ["POST", "/api/worlds"],
    ["GET", "/api/worlds/demo-world/preview-bootstrap"],
    ["GET", "/api/worlds/demo-world/deliverables/opening-frame"],
    ["POST", "/api/recording-worlds/demo-world/recordings/recording-abc/generate"],
    ["HEAD", "/api/recording-worlds/demo-world/recordings/recording-abc/source"],
  ];
  try {
    for (const [method, pathname] of requests) {
      const response = await fetch(`${proxyOrigin}${pathname}`, { method, headers });
      assert.equal(response.status, 200, `${method} ${pathname}`);
    }
    assert.deepEqual(forwarded, requests.map(([method, pathname]) => `${method} ${pathname}`));
  } finally {
    await Promise.all([
      new Promise((resolve) => proxy.close(resolve)),
      new Promise((resolve) => upstream.close(resolve)),
    ]);
  }
});

test("does not create an authenticated WebSocket tunnel to the internal Studio", async () => {
  let upgradeForwarded = false;
  const upstream = createServer();
  upstream.on("upgrade", (_request, socket) => {
    upgradeForwarded = true;
    socket.end("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n");
  });
  const upstreamOrigin = await listen(upstream);
  const accessKey = "test-public-access-key-1234";
  const proxy = createStudioPublicProxy({ targetOrigin: upstreamOrigin, accessKey });
  const proxyOrigin = await listen(proxy);
  try {
    assert.equal(await requestUpgrade(proxyOrigin, "/", accessKey), 403);
    assert.equal(upgradeForwarded, false);
  } finally {
    await Promise.all([
      new Promise((resolve) => proxy.close(resolve)),
      new Promise((resolve) => upstream.close(resolve)),
    ]);
  }
});

test("rejects weak credentials and non-loopback targets", () => {
  assert.throws(
    () => createStudioPublicProxy({ accessKey: 123 }),
    /at least 16 characters/,
  );
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
