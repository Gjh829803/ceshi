import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";
import path from "node:path";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export interface StartWorldkitServerOptions {
  inputPath: string;
  port?: number;
  forwardOutput?: boolean;
  startupTimeoutMilliseconds?: number;
}

export interface WorldkitServerHandle {
  readonly url: string;
  readonly port: number;
  readonly process: ChildProcessWithoutNullStreams;
  stop(): Promise<void>;
  waitForExit(): Promise<number | null>;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findAvailablePort(): Promise<number> {
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
      server.close((error) => error === undefined ? resolve(port) : reject(error));
    });
  });
}

function pnpmInvocation(arguments_: readonly string[]): { command: string; arguments: string[] } {
  const pnpmScript = process.env.npm_execpath;
  if (pnpmScript !== undefined && pnpmScript.length > 0) {
    return { command: process.execPath, arguments: [pnpmScript, ...arguments_] };
  }
  return { command: "pnpm", arguments: [...arguments_] };
}

async function waitUntilReady(
  child: ChildProcessWithoutNullStreams,
  endpoint: string,
  timeoutMilliseconds: number,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    if (child.exitCode !== null) {
      throw new Error(`Worldkit playground exited before becoming ready (exit ${child.exitCode}).`);
    }
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // The TCP listener is not ready yet.
    }
    await delay(100);
  }
  throw new Error(`Worldkit playground did not become ready within ${timeoutMilliseconds}ms.`);
}

export async function startWorldkitServer(options: StartWorldkitServerOptions): Promise<WorldkitServerHandle> {
  const port = options.port ?? await findAvailablePort();
  const url = `http://127.0.0.1:${port}/?authoring=1`;
  const invocation = pnpmInvocation([
    "--filter",
    "@whitebox-world/playground",
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ]);
  const child = spawn(invocation.command, invocation.arguments, {
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      WORLDKIT_AUTHORING_SPEC_PATH: path.resolve(options.inputPath),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  if (options.forwardOutput === true) {
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  }

  try {
    await waitUntilReady(
      child,
      `http://127.0.0.1:${port}/__worldkit/authoring-spec`,
      options.startupTimeoutMilliseconds ?? 30_000,
    );
  } catch (error) {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      child.once("exit", () => resolve());
    });
    throw error;
  }

  const waitForExit = (): Promise<number | null> => new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.once("exit", (code) => resolve(code));
  });
  return {
    url,
    port,
    process: child,
    waitForExit,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      const stopped = await Promise.race([
        waitForExit().then(() => true),
        delay(3_000).then(() => false),
      ]);
      if (!stopped && child.exitCode === null) {
        child.kill("SIGKILL");
        await waitForExit();
      }
    },
  };
}
