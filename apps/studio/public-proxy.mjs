import { timingSafeEqual } from "node:crypto";
import { createServer, request as createHttpRequest } from "node:http";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const studioRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(studioRoot, "../..");

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

function upstreamHeaders(headers, target) {
  const forwarded = { ...headers, host: target.host };
  delete forwarded.authorization;
  delete forwarded["proxy-authorization"];
  delete forwarded["proxy-connection"];
  return forwarded;
}

export function createStudioPublicProxy(options) {
  const accessKey = options.accessKey ?? "";
  if (accessKey.length < 16) {
    throw new Error("WORLDKIT_ACCESS_KEY must contain at least 16 characters.");
  }
  const target = validatedTargetOrigin(
    options.targetOrigin ?? "http://127.0.0.1:4197",
  );

  const server = createServer((request, response) => {
    if (!isAuthorizedPublicRequest(request.headers.authorization, accessKey)) {
      unauthorizedResponse(response);
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

  server.on("upgrade", (request, socket, head) => {
    if (!isAuthorizedPublicRequest(request.headers.authorization, accessKey)) {
      socket.end(
        "HTTP/1.1 401 Unauthorized\r\n" +
        'WWW-Authenticate: Basic realm="WorldKit Creator Studio"\r\n' +
        "Connection: close\r\n\r\n",
      );
      return;
    }
    const upstream = net.connect(Number(target.port || 80), target.hostname);
    upstream.once("connect", () => {
      const headers = upstreamHeaders(request.headers, target);
      const headerLines = Object.entries(headers).flatMap(([name, value]) =>
        Array.isArray(value)
          ? value.map((entry) => `${name}: ${entry}`)
          : value === undefined ? [] : [`${name}: ${value}`]);
      upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headerLines.join("\r\n")}\r\n\r\n`);
      if (head.length > 0) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.once("error", () => socket.destroy());
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
