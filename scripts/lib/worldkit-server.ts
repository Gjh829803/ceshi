import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";
import path from "node:path";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PLAYGROUND_ROOT = path.join(REPOSITORY_ROOT, "apps/playground");
const VITE_CLI_PATH = path.join(REPOSITORY_ROOT, "node_modules/vite/bin/vite.js");
const AUTHORING_ENDPOINT = "/__worldkit/authoring-spec";
const SERVER_NONCE_HEADER = "x-worldkit-server-nonce";
const DEFAULT_STARTUP_TIMEOUT_MILLISECONDS = 30_000;
const DEFAULT_STOP_TIMEOUT_MILLISECONDS = 3_000;
const AUTOMATIC_PORT_ATTEMPTS = 5;

export interface StartWorldkitServerOptions {
  inputPath: string;
  port?: number;
  forwardOutput?: boolean;
  startupTimeoutMilliseconds?: number;
  stopTimeoutMilliseconds?: number;
}

export interface WorldkitServerHandle {
  readonly url: string;
  readonly port: number;
  readonly process: ChildProcessWithoutNullStreams;
  stop(): Promise<void>;
  waitForExit(): Promise<number | null>;
}

class WorldkitServerStartError extends Error {
  readonly name = "WorldkitServerStartError";

  constructor(
    readonly code:
      | "WORLDKIT_SERVER_PORT_UNAVAILABLE"
      | "WORLDKIT_SERVER_PROCESS_ERROR"
      | "WORLDKIT_SERVER_PROCESS_EXITED"
      | "WORLDKIT_SERVER_START_TIMEOUT",
    message: string,
  ) {
    super(message);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function allocateAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate a local TCP port."));
        return;
      }
      const port = address.port;
      server.close((error) => (error === undefined ? resolve(port) : reject(error)));
    });
  });
}

async function assertPortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => {
      reject(new WorldkitServerStartError(
        "WORLDKIT_SERVER_PORT_UNAVAILABLE",
        `Worldkit playground port ${port} is unavailable.`,
      ));
    });
    probe.listen(port, "127.0.0.1", () => {
      probe.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  });
}

function signalOwnedProcess(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals,
): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function createHandle(options: {
  child: ChildProcessWithoutNullStreams;
  port: number;
  stopTimeoutMilliseconds: number;
}): WorldkitServerHandle {
  const { child, port, stopTimeoutMilliseconds } = options;
  const exitPromise = new Promise<number | null>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.once("exit", (code) => resolve(code));
  });
  let stopPromise: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopPromise ??= (async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        await exitPromise;
        return;
      }
      signalOwnedProcess(child, "SIGTERM");
      const exited = await Promise.race([
        exitPromise.then(() => true),
        delay(stopTimeoutMilliseconds).then(() => false),
      ]);
      if (!exited) {
        signalOwnedProcess(child, "SIGKILL");
        await exitPromise;
      }
    })();
    return stopPromise;
  };
  return {
    url: `http://127.0.0.1:${port}/?authoring=1`,
    port,
    process: child,
    stop,
    waitForExit: () => exitPromise,
  };
}

async function waitUntilReady(options: {
  child: ChildProcessWithoutNullStreams;
  exitPromise: Promise<number | null>;
  endpoint: string;
  nonce: string;
  timeoutMilliseconds: number;
}): Promise<void> {
  const { child, exitPromise, endpoint, nonce, timeoutMilliseconds } = options;
  let polling = true;
  const processError = new Promise<never>((_, reject) => {
    child.once("error", () => reject(new WorldkitServerStartError(
      "WORLDKIT_SERVER_PROCESS_ERROR",
      "Worldkit playground process failed to start.",
    )));
  });
  const processExit = exitPromise.then((code): never => {
    throw new WorldkitServerStartError(
      "WORLDKIT_SERVER_PROCESS_EXITED",
      `Worldkit playground exited before readiness (exit ${String(code)}).`,
    );
  });
  const timeout = delay(timeoutMilliseconds).then((): never => {
    throw new WorldkitServerStartError(
      "WORLDKIT_SERVER_START_TIMEOUT",
      `Worldkit playground did not become ready within ${timeoutMilliseconds}ms.`,
    );
  });
  const readiness = (async () => {
    while (polling) {
      try {
        const response = await fetch(endpoint, {
          method: "HEAD",
          cache: "no-store",
          signal: AbortSignal.timeout(Math.min(1_000, timeoutMilliseconds)),
        });
        if (response.ok && response.headers.get(SERVER_NONCE_HEADER) === nonce) return;
      } catch {
        // Listener/readiness ownership has not been established yet.
      }
      await delay(50);
    }
  })();
  try {
    await Promise.race([readiness, processError, processExit, timeout]);
  } finally {
    polling = false;
  }
}

async function startOne(options: StartWorldkitServerOptions, port: number): Promise<WorldkitServerHandle> {
  const nonce = randomUUID();
  const child = spawn(
    process.execPath,
    [
      VITE_CLI_PATH,
      "--config",
      path.join(PLAYGROUND_ROOT, "vite.config.mjs"),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: PLAYGROUND_ROOT,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        WORLDKIT_AUTHORING_SPEC_PATH: path.resolve(options.inputPath),
        WORLDKIT_AUTHORING_SERVER_NONCE: nonce,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end();
  if (options.forwardOutput === true) {
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  } else {
    child.stdout.resume();
    child.stderr.resume();
  }
  const handle = createHandle({
    child,
    port,
    stopTimeoutMilliseconds:
      options.stopTimeoutMilliseconds ?? DEFAULT_STOP_TIMEOUT_MILLISECONDS,
  });
  try {
    await waitUntilReady({
      child,
      exitPromise: handle.waitForExit(),
      endpoint: `http://127.0.0.1:${port}${AUTHORING_ENDPOINT}`,
      nonce,
      timeoutMilliseconds:
        options.startupTimeoutMilliseconds ?? DEFAULT_STARTUP_TIMEOUT_MILLISECONDS,
    });
    return handle;
  } catch (error) {
    await handle.stop();
    throw error;
  }
}

export async function startWorldkitServer(
  options: StartWorldkitServerOptions,
): Promise<WorldkitServerHandle> {
  if (options.port !== undefined) {
    await assertPortAvailable(options.port);
    return startOne(options, options.port);
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < AUTOMATIC_PORT_ATTEMPTS; attempt += 1) {
    const port = await allocateAvailablePort();
    try {
      return await startOne(options, port);
    } catch (error) {
      lastError = error;
      if (!(error instanceof WorldkitServerStartError) ||
          error.code !== "WORLDKIT_SERVER_PROCESS_EXITED") throw error;
    }
  }
  throw lastError;
}
