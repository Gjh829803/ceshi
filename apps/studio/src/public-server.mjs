import { randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { spawnOwnedProcess } from "./owned-process.mjs";
import { createStudioPublicProxy } from "./public-proxy.mjs";

const studioSourceRoot = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.resolve(studioSourceRoot, "..");
const repoRoot = path.resolve(studioRoot, "../..");

function validatedPort(value, name) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be a valid TCP port.`);
  }
  return value;
}

function validatedDuration(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer number of milliseconds.`);
  }
  return value;
}

function internalStudioEnvironment(parentEnvironment, { studioPort, readinessNonce }) {
  const environment = {};
  for (const [name, value] of Object.entries(parentEnvironment)) {
    if (name === "WORLDKIT_ACCESS_KEY" || name.startsWith("WORLDKIT_PUBLIC_")) continue;
    environment[name] = value;
  }
  environment.WORLDKIT_STUDIO_PORT = String(studioPort);
  environment.WORLDKIT_STUDIO_READINESS_NONCE = readinessNonce;
  return environment;
}

async function waitForStudioReadiness({ origin, nonce, owned, timeoutMs, pollIntervalMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (owned.exitResult !== null) {
      const { code, signal, error } = owned.exitResult;
      const detail = error?.message ?? `code ${code ?? "null"}, signal ${signal ?? "null"}`;
      throw new Error(`Internal Studio exited before readiness (${detail}).`);
    }
    const remainingMs = deadline - Date.now();
    try {
      const response = await fetch(`${origin}/__worldkit/studio-ready`, {
        headers: { "x-worldkit-readiness-nonce": nonce },
        signal: AbortSignal.timeout(Math.max(1, Math.min(250, remainingMs))),
      });
      if (response.ok) {
        const payload = await response.json();
        if (
          payload?.status !== "ready" ||
          payload?.nonce !== nonce ||
          payload?.pid !== owned.pid
        ) {
          throw new Error("Internal Studio readiness identity did not match the spawned child.");
        }
        return;
      }
    } catch (error) {
      if (/readiness identity/.test(error?.message ?? "")) throw error;
    }
    await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
  }
  throw new Error(`Internal Studio readiness timed out after ${timeoutMs}ms.`);
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections?.();
  });
}

export async function startStudioPublicServer(options = {}) {
  const accessKey = options.accessKey ?? "";
  if (typeof accessKey !== "string" || accessKey.length < 16) {
    throw new Error("WORLDKIT_ACCESS_KEY must contain at least 16 characters.");
  }
  const studioPort = validatedPort(options.studioPort ?? 4197, "Internal Studio port");
  const publicPort = validatedPort(options.publicPort ?? 4175, "Public proxy port");
  const readinessTimeoutMs = validatedDuration(
    options.readinessTimeoutMs ?? 30_000,
    "Readiness timeout",
  );
  const readinessPollMs = validatedDuration(
    options.readinessPollMs ?? 25,
    "Readiness poll interval",
  );
  const shutdownGraceMs = validatedDuration(
    options.shutdownGraceMs ?? 2_000,
    "Shutdown grace period",
  );
  const readinessNonce = randomBytes(32).toString("hex");
  const studioOrigin = `http://127.0.0.1:${studioPort}`;
  const owned = spawnOwnedProcess(
    options.studioCommand ?? process.execPath,
    options.studioArgs ?? [path.join(studioSourceRoot, "server.mjs")],
    {
      cwd: options.cwd ?? repoRoot,
      env: internalStudioEnvironment(options.env ?? process.env, {
        studioPort,
        readinessNonce,
      }),
      graceMs: shutdownGraceMs,
      stdio: options.studioStdio ?? "inherit",
    },
  );

  let proxy = null;
  try {
    await waitForStudioReadiness({
      origin: studioOrigin,
      nonce: readinessNonce,
      owned,
      timeoutMs: readinessTimeoutMs,
      pollIntervalMs: readinessPollMs,
    });

    proxy = createStudioPublicProxy({ accessKey, targetOrigin: studioOrigin });
    await listen(proxy, publicPort);
  } catch (startupError) {
    const cleanupResults = await Promise.allSettled([
      proxy ? closeServer(proxy) : Promise.resolve(),
      owned.terminate(),
    ]);
    const cleanupError = cleanupResults.find((result) => result.status === "rejected");
    if (cleanupError?.status === "rejected") {
      throw new AggregateError(
        [startupError, cleanupError.reason],
        "Supervised public Studio startup and cleanup both failed.",
      );
    }
    throw startupError;
  }

  let stopPromise = null;
  let resolveClosed;
  let rejectClosed;
  const closed = new Promise((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });
  function stop(reason, exit = null) {
    if (stopPromise !== null) return stopPromise;
    stopPromise = (async () => {
      await closeServer(proxy);
      const termination = await owned.terminate();
      return reason === "child-exit"
        ? { reason, exit, termination }
        : { reason, termination };
    })();
    stopPromise.then(resolveClosed, rejectClosed);
    return stopPromise;
  }
  function shutdown() {
    return stop("shutdown");
  }
  void owned.exited.then((exit) => stop("child-exit", exit)).catch(() => undefined);

  return {
    publicOrigin: `http://127.0.0.1:${publicPort}`,
    studioOrigin,
    childPid: owned.pid,
    closed,
    shutdown,
  };
}

async function startMain() {
  const envFile = path.join(
    repoRoot,
    ".codex-tmp/runtime-config/studio-public.env",
  );
  try {
    process.loadEnvFile(envFile);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const publicPort = validatedPort(
    Number(process.env.WORLDKIT_PUBLIC_PROXY_PORT ?? 4175),
    "WORLDKIT_PUBLIC_PROXY_PORT",
  );
  const studioPort = validatedPort(
    Number(process.env.WORLDKIT_STUDIO_PORT ?? 4197),
    "WORLDKIT_STUDIO_PORT",
  );
  const topology = await startStudioPublicServer({
    accessKey: process.env.WORLDKIT_ACCESS_KEY,
    studioPort,
    publicPort,
    env: process.env,
  });
  process.stdout.write(
    `WorldKit supervised public Studio: ${topology.publicOrigin} (Studio pid ${topology.childPid})\n`,
  );

  const stop = () => {
    void topology.shutdown().catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const closure = await topology.closed;
    if (closure.reason === "child-exit") {
      const { code, signal, error } = closure.exit;
      const detail = error?.message ?? `code ${code ?? "null"}, signal ${signal ?? "null"}`;
      throw new Error(`Internal Studio exited while the public wrapper was running (${detail}).`);
    }
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startMain().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
