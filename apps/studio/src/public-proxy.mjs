import { timingSafeEqual } from "node:crypto";
import { createServer, request as createHttpRequest } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const studioRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(studioRoot, "../../..");

function constantTimeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

export function isAuthorizedPublicRequest(header, accessKey) {
  if (typeof header !== "string" || !header.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    return separator >= 0 &&
      constantTimeEqual(decoded.slice(0, separator), "worldkit") &&
      constantTimeEqual(decoded.slice(separator + 1), accessKey);
  } catch {
    return false;
  }
}

function validatedTargetOrigin(value) {
  const target = new URL(value);
  if (
    target.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error("WORLDKIT_PUBLIC_PROXY_TARGET must be a loopback HTTP origin without a path.");
  }
  return target;
}

function unauthorizedResponse(response) {
  response.writeHead(401, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "www-authenticate": 'Basic realm="WorldKit Creator Studio", charset="UTF-8"',
  });
  response.end("WorldKit Creator Studio requires an access key.");
}

function forbiddenResponse(response) {
  response.writeHead(403, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end("This route is not exposed by the WorldKit public proxy.");
}

const publicApiRoutes = [
  { methods: ["GET"], pattern: /^\/api\/(?:health|reliability|subject-catalog|test-sets)$/ },
  { methods: ["POST"], pattern: /^\/api\/test-sets$/ },
  { methods: ["POST"], pattern: /^\/api\/test-sets\/[a-z0-9-]+\/images$/ },
  { methods: ["GET"], pattern: /^\/api\/test-sets\/[a-z0-9-]+\/images\/[a-z0-9-]+$/ },
  { methods: ["POST"], pattern: /^\/api\/test-sets\/[a-z0-9-]+\/run$/ },
  { methods: ["GET", "POST"], pattern: /^\/api\/worlds$/ },
  { methods: ["GET"], pattern: /^\/api\/worlds\/[a-z0-9-]+$/ },
  {
    methods: ["GET"],
    pattern: /^\/api\/worlds\/[a-z0-9-]+\/(?:triviews|styled-triviews)\/[a-z0-9-]+$/,
  },
  {
    methods: ["GET"],
    pattern: /^\/api\/worlds\/[a-z0-9-]+\/(?:preview-bootstrap|reference)$/,
  },
  { methods: ["GET"], pattern: /^\/api\/worlds\/[a-z0-9-]+\/deliverables\/[a-z0-9-]+$/ },
  { methods: ["POST"], pattern: /^\/api\/worlds\/[a-z0-9-]+\/retry$/ },
  {
    methods: ["GET", "POST"],
    pattern: /^\/api\/recording-worlds\/[a-z0-9-]+\/recordings$/,
  },
  {
    methods: ["POST"],
    pattern: /^\/api\/recording-worlds\/[a-z0-9-]+\/recordings\/recording-[a-z0-9-]+\/generate$/,
  },
  {
    methods: ["GET", "HEAD"],
    pattern: /^\/api\/recording-worlds\/[a-z0-9-]+\/recordings\/recording-[a-z0-9-]+\/(?:source|generated|prompt|prompt-template|bundle)$/,
  },
  { methods: ["GET"], pattern: /^\/api\/episode-workflows$/ },
  { methods: ["GET"], pattern: /^\/api\/episode-workflows\/[a-z0-9-]+$/ },
  {
    methods: ["GET", "HEAD"],
    pattern: /^\/api\/episode-workflows\/[a-z0-9-]+\/artifacts\/.+$/,
  },
  {
    methods: ["GET"],
    pattern: /^\/api\/episode-workflows\/[a-z0-9-]+\/(?:bundle|interaction-timeline)$/,
  },
  {
    methods: ["GET", "HEAD"],
    pattern: /^\/api\/episode-workflows\/[a-z0-9-]+\/scene-assets\/[a-z0-9-]+$/,
  },
];

const publicStaticPaths = new Set(["/", "/index.html", "/app.js", "/styles.css", "/play", "/play/"]);
const publicAssetPrefixes = [
  "/@vite/",
  "/src/",
  "/node_modules/",
  "/local-assets/",
  "/subject-assets/",
  "/worldkit-assets/",
  "/scene-plans/",
];
const viteSourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".json"]);

function isAllowedViteFsSource(pathname) {
  if (!pathname.startsWith("/@fs/")) return false;
  let requestedPath;
  try {
    requestedPath = decodeURIComponent(pathname.slice("/@fs".length));
  } catch {
    return false;
  }
  if (requestedPath.includes("\0")) return false;
  const resolvedPath = path.resolve(requestedPath);
  const nodeModulesRoot = path.join(repoRoot, "node_modules");
  const nodeModulesRelativePath = path.relative(nodeModulesRoot, resolvedPath);
  const normalizedNodeModulesPath = nodeModulesRelativePath.split(path.sep).join("/");
  if (
    nodeModulesRelativePath !== "" &&
    !nodeModulesRelativePath.startsWith(`..${path.sep}`) &&
    nodeModulesRelativePath !== ".." &&
    !path.isAbsolute(nodeModulesRelativePath) &&
    /(?:^|\/)node_modules\/@babylonjs\/havok\/lib\/esm\/HavokPhysics\.wasm$/.test(
      normalizedNodeModulesPath,
    )
  ) {
    return true;
  }
  if (!viteSourceExtensions.has(path.extname(resolvedPath).toLowerCase())) return false;

  if (
    nodeModulesRelativePath !== "" &&
    !nodeModulesRelativePath.startsWith(`..${path.sep}`) &&
    nodeModulesRelativePath !== ".." &&
    !path.isAbsolute(nodeModulesRelativePath) &&
    /(?:^|\/)node_modules\/vite\/dist\/client\/env\.mjs$/.test(
      normalizedNodeModulesPath,
    )
  ) {
    return true;
  }

  const assetsRoot = path.join(repoRoot, "assets");
  const assetsRelativePath = path.relative(assetsRoot, resolvedPath).split(path.sep).join("/");
  if (
    !assetsRelativePath.startsWith("../") &&
    assetsRelativePath !== ".." &&
    (
      /^registry\/[a-z0-9-]+\/catalog\.json$/.test(assetsRelativePath) ||
      /^subjects\/source-fbx\/vehicles\/catalog\.json$/.test(assetsRelativePath) ||
      /^subjects\/source-fbx\/contributors\/[a-z0-9-]+\/catalog\.json$/.test(assetsRelativePath)
    )
  ) {
    return true;
  }

  const playgroundSourceRoot = path.join(repoRoot, "apps/playground/src");
  const playgroundRelativePath = path.relative(playgroundSourceRoot, resolvedPath);
  if (
    playgroundRelativePath !== "" &&
    !playgroundRelativePath.startsWith(`..${path.sep}`) &&
    playgroundRelativePath !== ".." &&
    !path.isAbsolute(playgroundRelativePath)
  ) {
    return true;
  }

  const packagesRoot = path.join(repoRoot, "packages");
  const packageRelativePath = path.relative(packagesRoot, resolvedPath);
  if (
    packageRelativePath === "" ||
    packageRelativePath.startsWith(`..${path.sep}`) ||
    packageRelativePath === ".." ||
    path.isAbsolute(packageRelativePath)
  ) {
    return false;
  }
  const [packageName, sourceDirectory, ...sourcePath] = packageRelativePath.split(path.sep);
  return /^[a-z0-9][a-z0-9-]*$/.test(packageName) &&
    sourceDirectory === "src" &&
    sourcePath.length > 0;
}

export function isAllowedStudioPublicRequest(method, rawUrl) {
  if (typeof method !== "string" || typeof rawUrl !== "string") return false;
  let pathname;
  try {
    pathname = new URL(rawUrl, "http://127.0.0.1").pathname;
  } catch {
    return false;
  }
  if (["GET", "HEAD"].includes(method)) {
    if (publicStaticPaths.has(pathname)) return true;
    if (publicAssetPrefixes.some((prefix) => pathname.startsWith(prefix))) return true;
    if (isAllowedViteFsSource(pathname)) return true;
  }
  if (method === "GET" && /^\/scene-assets\/[a-z0-9-]+\/.+$/.test(pathname)) return true;
  return publicApiRoutes.some(({ methods, pattern }) =>
    methods.includes(method) && pattern.test(pathname));
}

export function isAllowedSeedancePublicRequest(method, rawUrl) {
  if (typeof method !== "string" || typeof rawUrl !== "string") return false;
  let pathname;
  try {
    pathname = new URL(rawUrl, "http://127.0.0.1").pathname;
  } catch {
    return false;
  }
  if (["GET", "HEAD"].includes(method)) {
    if (publicStaticPaths.has(pathname)) return true;
    if (publicAssetPrefixes.some((prefix) => pathname.startsWith(prefix))) return true;
    if (isAllowedViteFsSource(pathname)) return true;
    if (/^\/scene-assets\/[a-z0-9-]+\/.+$/.test(pathname)) return true;
  }
  if (method !== "GET" && method !== "HEAD") return false;
  return [
    /^\/api\/(?:health|subject-catalog)$/,
    /^\/api\/worlds\/[a-z0-9-]+\/(?:preview-bootstrap|reference)$/,
    /^\/api\/worlds\/[a-z0-9-]+\/(?:triviews|styled-triviews)\/[a-z0-9-]+$/,
    /^\/api\/worlds\/[a-z0-9-]+\/deliverables\/[a-z0-9-]+$/,
    /^\/api\/episode-workflows$/,
    /^\/api\/episode-workflows\/[a-z0-9-]+$/,
    /^\/api\/episode-workflows\/[a-z0-9-]+\/artifacts\/.+$/,
    /^\/api\/episode-workflows\/[a-z0-9-]+\/(?:bundle|interaction-timeline)$/,
    /^\/api\/episode-workflows\/[a-z0-9-]+\/scene-assets\/[a-z0-9-]+$/,
  ].some((pattern) => pattern.test(pathname));
}

export function isAllowedCloudMonitorPublicRequest(method, rawUrl) {
  if (!["GET", "HEAD"].includes(method)) return false;
  return isAllowedStudioPublicRequest(method, rawUrl);
}

function upstreamHeaders(headers, target) {
  const forwarded = { ...headers, host: target.host };
  delete forwarded.authorization;
  delete forwarded["proxy-authorization"];
  delete forwarded["proxy-connection"];
  return forwarded;
}

export function createStudioPublicProxy(options) {
  const anonymous = options.anonymous === true;
  const accessKey = options.accessKey ?? "";
  if (!anonymous && (typeof accessKey !== "string" || accessKey.length < 16)) {
    throw new Error("WORLDKIT_ACCESS_KEY must contain at least 16 characters.");
  }
  const isAllowedRequest = options.isAllowedRequest ?? isAllowedStudioPublicRequest;
  const rootRedirect = typeof options.rootRedirect === "string" ? options.rootRedirect : null;
  const target = validatedTargetOrigin(
    options.targetOrigin ?? "http://127.0.0.1:4197",
  );

  const server = createServer((request, response) => {
    if (!anonymous && !isAuthorizedPublicRequest(request.headers.authorization, accessKey)) {
      unauthorizedResponse(response);
      return;
    }
    if (rootRedirect && request.method === "GET") {
      const incoming = new URL(request.url, "http://127.0.0.1");
      if (["/", "/index.html"].includes(incoming.pathname) &&
          incoming.searchParams.get("public") !== "seedance") {
        response.writeHead(302, { location: rootRedirect, "cache-control": "no-store" });
        response.end();
        return;
      }
    }
    if (!isAllowedRequest(request.method, request.url)) {
      forbiddenResponse(response);
      return;
    }
    const upstream = createHttpRequest({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: request.method,
      path: request.url,
      headers: upstreamHeaders(request.headers, target),
    }, (upstreamResponse) => {
      const headers = {
        ...upstreamResponse.headers,
        "x-frame-options": "SAMEORIGIN",
        "referrer-policy": "same-origin",
      };
      response.writeHead(upstreamResponse.statusCode ?? 502, headers);
      upstreamResponse.pipe(response);
    });
    upstream.once("error", (error) => {
      if (!response.headersSent) {
        response.writeHead(502, {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        });
      }
      response.end(`Creator Studio unavailable: ${error.message}`);
    });
    request.pipe(upstream);
  });

  server.on("upgrade", (request, socket) => {
    if (!anonymous && !isAuthorizedPublicRequest(request.headers.authorization, accessKey)) {
      socket.end(
        "HTTP/1.1 401 Unauthorized\r\n" +
        'WWW-Authenticate: Basic realm="WorldKit Creator Studio"\r\n' +
        "Connection: close\r\n\r\n",
      );
      return;
    }
    socket.end(
      "HTTP/1.1 403 Forbidden\r\n" +
      "Cache-Control: no-store\r\n" +
      "Connection: close\r\n\r\n",
    );
  });

  return server;
}

async function startMain() {
  const envFile = process.env.WORLDKIT_PUBLIC_ENV_FILE ??
    path.join(repoRoot, ".codex-tmp/runtime-config/studio-public.env");
  try {
    process.loadEnvFile(envFile);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const host = "127.0.0.1";
  const port = Number(process.env.WORLDKIT_PUBLIC_PROXY_PORT ?? 4175);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("WORLDKIT_PUBLIC_PROXY_PORT must be a valid TCP port.");
  }
  const server = createStudioPublicProxy({
    accessKey: process.env.WORLDKIT_ACCESS_KEY,
    targetOrigin: process.env.WORLDKIT_PUBLIC_PROXY_TARGET,
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  process.stdout.write(`WorldKit protected public proxy: http://${host}:${port}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startMain().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
