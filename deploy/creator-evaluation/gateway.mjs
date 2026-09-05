#!/usr/bin/env node
/** A read-only experimental gallery beside the existing Studio monitor. */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { Agent, createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME = new Map(Object.entries({
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".mp4": "video/mp4",
}));
const HOP_HEADERS = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade"]);
const COMPAT_BYTES = readFileSync(new URL("./host-compat.mjs", import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const COMPAT_HASH = sha256(COMPAT_BYTES);
const COMPAT_TRANSFORM = "http-uuid-v4-csprng-v1";

export function injectHostCompatibility(originalBytes, prefix) {
  const html = originalBytes.toString("utf8");
  const script = `<script src="${prefix}host-compat.mjs?sha256=${COMPAT_HASH}" data-worldkit-host-compat="${COMPAT_TRANSFORM}"></script>`;
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  const offset = head ? head.index + head[0].length : doctype ? doctype[0].length : 0;
  return Buffer.from(html.slice(0, offset) + script + html.slice(offset));
}

function serveBytes(request, response, bytes, headers) {
  if (request.headers["if-none-match"] === headers.etag && request.headers.range === undefined) {
    response.writeHead(304, headers); response.end(); return;
  }
  let range;
  try {
    const requested = request.headers["if-range"] && request.headers["if-range"] !== headers.etag
      ? undefined : request.headers.range;
    range = parseByteRange(requested, bytes.length);
  } catch {
    response.writeHead(416, { ...headers, "content-range": `bytes */${bytes.length}` }); response.end(); return;
  }
  if (range) headers["content-range"] = `bytes ${range.start}-${range.end}/${bytes.length}`;
  headers["content-length"] = String(range ? range.end - range.start + 1 : bytes.length);
  response.writeHead(range ? 206 : 200, headers);
  response.end(request.method === "HEAD" ? undefined : range ? bytes.subarray(range.start, range.end + 1) : bytes);
}

function finish(response, status, message) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  response.end(message);
}

function safeHeaders(headers) {
  const connectionHeaders = new Set(String(headers.connection ?? "").toLowerCase().split(",").map((value) => value.trim()));
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !HOP_HEADERS.has(key) && !connectionHeaders.has(key)));
}

export function parseByteRange(header, size) {
  if (header === undefined) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) throw new Error("INVALID_RANGE");
  let start;
  let end;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error("INVALID_RANGE");
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) throw new Error("INVALID_RANGE");
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

export function createCreatorEvaluationServer({ staticRoot, upstreamOrigin,
  prefix = "/creator-evals/", upstreamTimeoutMs = 60_000 } = {}) {
  if (typeof staticRoot !== "string" || !path.isAbsolute(staticRoot)) throw new Error("Absolute staticRoot required");
  if (!/^\/[a-z0-9-]+\/$/.test(prefix)) throw new Error("Invalid gallery prefix");
  const upstream = new URL(upstreamOrigin);
  if (upstream.protocol !== "http:" || upstream.username || upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash) throw new Error("Plain internal HTTP upstream origin required");
  const root = path.resolve(staticRoot);
  const agent = new Agent({ keepAlive: true, maxSockets: 64 });
  const deploymentTransform = {
    schemaVersion: 1,
    kind: "experimental-creator-host-deployment-transform",
    id: COMPAT_TRANSFORM,
    compatibilityScriptPath: `${prefix}host-compat.mjs`,
    compatibilityScriptHash: `sha256:${COMPAT_HASH}`,
    originalArtifactBytesModified: false,
    htmlResponseTransform: "Insert a synchronous host compatibility script before the artifact module executes.",
    behavior: "Only install crypto.randomUUID when absent, using crypto.getRandomValues for UUIDv4 entropy.",
    htmlHashHeaders: ["x-worldkit-original-sha256", "x-worldkit-served-sha256"],
    subjectAssetAliasId: "gallery-referer-subject-asset-v1",
    subjectAssetAliasBehavior: "Only /subject-assets/*.glb requests with a same-origin gallery playable Referer and matching worldkit-content-hash receive byte-identical bytes from that verified playable directory. Other Referers retain the legacy route.",
    validationScope: "Deployment compatibility only; no visual or playability verdict.",
  };

  async function serveArtifact(request, response, url) {
    let relative;
    try { relative = decodeURIComponent(url.pathname.slice(prefix.length)); }
    catch { finish(response, 400, "Invalid path"); return; }
    if (relative === "" || relative.endsWith("/")) relative += "index.html";
    if (relative.includes("\\") || /[\x00-\x1f\x7f]/.test(relative) ||
        relative.split("/").some((part) => !part || part === "." || part === "..")) {
      finish(response, 403, "Invalid artifact path"); return;
    }
    let file;
    let info;
    try {
      const realRoot = await realpath(root);
      file = await realpath(path.resolve(root, relative));
      if (!file.startsWith(`${realRoot}${path.sep}`)) { finish(response, 403, "Artifact path outside gallery"); return; }
      info = await stat(file);
      if (info.isDirectory()) {
        response.writeHead(308, { location: `${url.pathname}/${url.search}`, "cache-control": "no-store" });
        response.end(); return;
      }
      if (!info.isFile()) { finish(response, 404, "Artifact not found"); return; }
    } catch (error) {
      if (["ENOENT", "ENOTDIR", "EACCES"].includes(error.code)) { finish(response, 404, "Artifact not found"); return; }
      throw error;
    }
    const etag = `"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
    const headers = {
      "content-type": MIME.get(path.extname(file).toLowerCase()) ?? "application/octet-stream",
      "cache-control": "no-cache", "accept-ranges": "bytes", etag,
      "last-modified": info.mtime.toUTCString(), "x-content-type-options": "nosniff",
      "x-frame-options": "SAMEORIGIN", "referrer-policy": "same-origin",
    };
    if (path.extname(file).toLowerCase() === ".html") {
      if (info.size > 4 * 1024 * 1024) { finish(response, 413, "HTML artifact exceeds host response limit"); return; }
      const originalBytes = await readFile(file);
      const servedBytes = injectHostCompatibility(originalBytes, prefix);
      const servedHash = sha256(servedBytes);
      Object.assign(headers, {
        etag: `"sha256-${servedHash}"`,
        "x-worldkit-deployment-transform": COMPAT_TRANSFORM,
        "x-worldkit-original-sha256": sha256(originalBytes),
        "x-worldkit-served-sha256": servedHash,
      });
      serveBytes(request, response, servedBytes, headers); return;
    }
    if (request.headers["if-none-match"] === etag && request.headers.range === undefined) {
      response.writeHead(304, headers); response.end(); return;
    }
    let range;
    try {
      const requested = request.headers["if-range"] && request.headers["if-range"] !== etag
        ? undefined : request.headers.range;
      range = parseByteRange(requested, info.size);
    } catch {
      response.writeHead(416, { ...headers, "content-range": `bytes */${info.size}` }); response.end(); return;
    }
    if (range) headers["content-range"] = `bytes ${range.start}-${range.end}/${info.size}`;
    headers["content-length"] = String(range ? range.end - range.start + 1 : info.size);
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === "HEAD" || info.size === 0) { response.end(); return; }
    const stream = createReadStream(file, range ?? undefined);
    stream.once("error", () => response.destroy());
    response.once("close", () => stream.destroy());
    stream.pipe(response);
  }

  function proxyLegacy(request, response) {
    const headers = safeHeaders(request.headers);
    headers.host = upstream.host;
    delete headers.authorization;
    const proxy = httpRequest(upstream, { method: request.method, path: request.url, headers, agent }, (incoming) => {
      response.writeHead(incoming.statusCode ?? 502, safeHeaders(incoming.headers));
      incoming.once("error", () => response.destroy());
      response.once("close", () => incoming.destroy());
      incoming.pipe(response);
    });
    proxy.setTimeout(upstreamTimeoutMs, () => proxy.destroy(new Error("UPSTREAM_TIMEOUT")));
    proxy.once("error", () => {
      if (!response.headersSent) finish(response, 502, "Existing Studio monitor temporarily unavailable");
      else response.destroy();
    });
    request.once("aborted", () => proxy.destroy());
    proxy.end();
  }

  const server = createServer((request, response) => {
    void (async () => {
      if (!["GET", "HEAD"].includes(request.method)) { finish(response, 403, "Read-only evaluation service"); return; }
      const url = new URL(request.url ?? "/", "http://evaluation.invalid");
      if (url.pathname === "/__creator_eval_live") { finish(response, 200, "alive"); return; }
      if (url.pathname === "/__creator_eval_health") {
        const ready = await stat(path.join(root, "index.html")).then((info) => info.isFile() && info.size > 0).catch(() => false);
        response.writeHead(ready ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
        response.end(JSON.stringify({ kind: "experimental-creator-evaluation-service", ready, prefix, legacyMonitor: "proxied" }));
        return;
      }
      if (url.pathname === prefix.slice(0, -1)) {
        response.writeHead(308, { location: `${prefix}${url.search}`, "cache-control": "no-store" }); response.end(); return;
      }
      if (url.pathname === `${prefix}host-compat.mjs`) {
        serveBytes(request, response, COMPAT_BYTES, {
          "content-type": MIME.get(".mjs"), "cache-control": "no-cache",
          "x-content-type-options": "nosniff", "accept-ranges": "bytes", etag: `"sha256-${COMPAT_HASH}"`,
        });
        return;
      }
      if (url.pathname === `${prefix}deployment-transforms.json`) {
        const bytes = Buffer.from(JSON.stringify(deploymentTransform, null, 2));
        serveBytes(request, response, bytes, {
          "content-type": MIME.get(".json"), "cache-control": "no-cache",
          "x-content-type-options": "nosniff", etag: `"sha256-${sha256(bytes)}"`,
        });
        return;
      }
      let subjectReferer;
      try { subjectReferer = new URL(request.headers.referer); } catch { /* Legacy routes need no Referer. */ }
      const playableMatch = subjectReferer?.host === request.headers.host && ["http:", "https:"].includes(subjectReferer?.protocol)
        ? new RegExp(`^${prefix}cases/([a-z0-9-]+)/([a-f0-9]{16,64})/playable/(?:index\\.html)?$`).exec(subjectReferer.pathname) : null;
      if (playableMatch && url.pathname.startsWith("/subject-assets/")) {
        const artifactContentHash = url.searchParams.get("worldkit-content-hash");
        const subjectPath = decodeURIComponent(url.pathname.slice(1));
        if (!/^subject-assets\/[a-zA-Z0-9/_.-]+\.glb$/.test(subjectPath) ||
          subjectPath.split("/").some((part) => !part || part === "." || part === "..") ||
          url.searchParams.getAll("worldkit-content-hash").length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(artifactContentHash ?? "")) {
          finish(response, 400, "Invalid gallery subject asset request"); return;
        }
        const realRoot = await realpath(root);
        let file;
        try { file = await realpath(path.join(root, "cases", playableMatch[1], playableMatch[2], "playable", subjectPath)); }
        catch (error) { if (["ENOENT", "ENOTDIR", "EACCES"].includes(error.code)) { finish(response, 404, "Subject artifact not found"); return; } throw error; }
        const expectedRoot = path.join(realRoot, "cases", playableMatch[1], playableMatch[2], "playable");
        if (!file.startsWith(`${expectedRoot}${path.sep}`)) { finish(response, 403, "Invalid subject artifact path"); return; }
        const info = await stat(file);
        if (!info.isFile() || info.size > 64 * 1024 * 1024) { finish(response, 413, "Subject artifact exceeds host response limit"); return; }
        const bytes = await readFile(file);
        if (`sha256:${sha256(bytes)}` !== artifactContentHash) { finish(response, 503, "Subject artifact does not match its Host lock"); return; }
        serveBytes(request, response, bytes, {
          "content-type": MIME.get(".glb"), "cache-control": "no-cache", "accept-ranges": "bytes",
          "x-content-type-options": "nosniff", etag: `"${artifactContentHash}"`, "vary": "Referer",
          "x-worldkit-deployment-transform": "gallery-referer-subject-asset-v1",
          "x-worldkit-artifact-sha256": artifactContentHash.slice(7),
        });
        return;
      }
      if (url.pathname.startsWith(prefix)) await serveArtifact(request, response, url);
      else proxyLegacy(request, response);
    })().catch((error) => {
      console.error("CREATOR_EVALUATION_GATEWAY_ERROR", error?.code ?? error?.name ?? "Error");
      if (!response.headersSent) finish(response, 500, "Evaluation service error");
      else response.destroy();
    });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.once("close", () => agent.destroy());
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4175);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  const server = createCreatorEvaluationServer({
    staticRoot: process.env.CREATOR_EVALUATION_ROOT ?? "/srv/creator-evals",
    upstreamOrigin: process.env.CREATOR_EVALUATION_UPSTREAM ?? "http://worldkit-cloud-monitor-upstream.lwdp.svc.cluster.local:4175",
  });
  server.listen(port, "0.0.0.0", () => console.log(`Creator evaluation read-only gateway listening on ${port}`));
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
    server.close(() => process.exit(0));
    const timer = setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 5000);
    timer.unref();
  });
}
