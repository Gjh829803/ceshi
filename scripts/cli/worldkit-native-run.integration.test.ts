import {
  createBabylonNativeWorldPackageV1,
  createCanonicalWorldPackageV1,
} from "@whitebox-world/world-package";
import {
  createBabylonNativeWorldPackageTestInputV1,
  createWorldPackageTestInputV1,
} from "@whitebox-world/world-package/testing";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isNil } from "lodash-es";
import { afterEach, describe, expect, it } from "vitest";

import { writeWorldPackageDirectoryV1 } from "../lib/file-world-package.js";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const CLI_PATH = path.join(REPOSITORY_ROOT, "scripts/cli/worldkit.ts");
const RECEIPT_ENDPOINT =
  "/__worldkit/native-package/world-package-build-receipt.json";
const READY_TIMEOUT_MILLISECONDS = 90_000;
const EXIT_TIMEOUT_MILLISECONDS = 10_000;
const NATIVE_VITE_CACHE_PREFIX = "worldkit-native-vite-cache-";

interface NativeRunReadyV1 {
  readonly ok: true;
  readonly url: string;
  readonly port: number;
  readonly worldPackageRootHash: `sha256:${string}`;
  readonly sceneSourceKind: "babylon-native-scene";
}

interface ProcessExitV1 {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

interface RunningCliV1 {
  readonly child: ChildProcessWithoutNullStreams;
  readonly stdout: () => string;
  readonly stderr: () => string;
}

const children: ChildProcessWithoutNullStreams[] = [];
const temporaryRoots: string[] = [];

async function allocateAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (isNil(address) || typeof address === "string") {
    server.close();
    throw new Error("test port allocation did not return a TCP address");
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => isNil(error) ? resolve() : reject(error)));
  return port;
}

function spawnNativeRun(
  packageDirectoryPath: string,
  port: number,
  environment: NodeJS.ProcessEnv = process.env,
): RunningCliV1 {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      CLI_PATH,
      "native",
      "run",
      packageDirectoryPath,
      "--port",
      String(port),
      "--json",
    ],
    {
      cwd: REPOSITORY_ROOT,
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  children.push(child);
  child.stdin.end();
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  return Object.freeze({
    child,
    stdout: () => stdout,
    stderr: () => stderr,
  });
}

async function waitForReady(run: RunningCliV1): Promise<NativeRunReadyV1> {
  return new Promise((resolve, reject) => {
    let offset = 0;
    let buffer = "";
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      run.child.off("exit", onExit);
      action();
    };
    const inspect = (): void => {
      const transcript = run.stdout();
      buffer += transcript.slice(offset);
      offset = transcript.length;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const candidate = JSON.parse(line) as Partial<NativeRunReadyV1>;
          if (
            candidate.ok === true &&
            candidate.sceneSourceKind === "babylon-native-scene" &&
            typeof candidate.url === "string" &&
            Number.isSafeInteger(candidate.port) &&
            /^sha256:[a-f0-9]{64}$/.test(
              candidate.worldPackageRootHash ?? "",
            )
          ) {
            finish(() => resolve(candidate as NativeRunReadyV1));
            return;
          }
        } catch {
          // Readiness owns the first complete matching JSON line.
        }
      }
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void =>
      finish(() => reject(new Error(
        `native run exited before readiness (${String(code)}/${String(signal)}); stdout=${run.stdout()} stderr=${run.stderr()}`,
      )));
    const poll = setInterval(inspect, 20);
    const timeout = setTimeout(() => finish(() => reject(new Error(
      `native run readiness timeout; stdout=${run.stdout()} stderr=${run.stderr()}`,
    ))), READY_TIMEOUT_MILLISECONDS);
    run.child.once("exit", onExit);
    inspect();
  });
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMilliseconds = EXIT_TIMEOUT_MILLISECONDS,
): Promise<ProcessExitV1> {
  if (!isNil(child.exitCode) || !isNil(child.signalCode)) {
    return Object.freeze({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      reject(new Error("native run did not exit within the bounded wait"));
    }, timeoutMilliseconds);
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      clearTimeout(timeout);
      resolve(Object.freeze({ code, signal }));
    };
    child.once("exit", onExit);
  });
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (!isNil(child.exitCode) || !isNil(child.signalCode)) return;
  child.kill("SIGTERM");
  try {
    await waitForExit(child);
  } catch (error) {
    child.kill("SIGKILL");
    await waitForExit(child, 5_000).catch(() => undefined);
    throw error;
  }
}

async function makeTemporaryRoot(): Promise<string> {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "worldkit-native-run-")),
  );
  await chmod(root, 0o700);
  temporaryRoots.push(root);
  return root;
}

async function applyGitCheckoutModes(root: string): Promise<void> {
  await chmod(root, 0o755);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await applyGitCheckoutModes(entryPath);
    } else if (entry.isFile()) {
      await chmod(entryPath, 0o644);
    }
  }
}

async function ownedNativeViteCacheDirectories(): Promise<readonly string[]> {
  return (await readdir(tmpdir()))
    .filter((entry) => entry.startsWith(NATIVE_VITE_CACHE_PREFIX))
    .sort();
}

async function createViteSpawnTracker(root: string): Promise<Readonly<{
  environment: NodeJS.ProcessEnv;
  markerPath: string;
}>> {
  const markerPath = path.join(root, "vite-spawned.txt");
  const trackerPath = path.join(root, "vite-spawn-tracker.mjs");
  await writeFile(trackerPath, `
    import { appendFileSync } from "node:fs";
    if (process.argv.some((value) => value.includes("node_modules/vite/bin/vite.js"))) {
      appendFileSync(process.env.WORLDKIT_VITE_SPAWN_MARKER_PATH, "spawned\\n");
    }
  `, { mode: 0o600 });
  return Object.freeze({
    markerPath,
    environment: {
      ...process.env,
      NODE_OPTIONS: `--import=${pathToFileURL(trackerPath).href}`,
      WORLDKIT_VITE_SPAWN_MARKER_PATH: markerPath,
    },
  });
}

async function expectStablePreSpawnFailure(
  packageDirectoryPath: string,
  tracker: Awaited<ReturnType<typeof createViteSpawnTracker>>,
): Promise<void> {
  const port = await allocateAvailablePort();
  const run = spawnNativeRun(
    packageDirectoryPath,
    port,
    tracker.environment,
  );
  const exit = await waitForExit(run.child, 30_000);
  const combined = `${run.stdout()}${run.stderr()}`;

  expect(exit).toEqual({ code: 2, signal: null });
  expect(run.stderr()).toBe("");
  expect(run.stdout().endsWith("\n")).toBe(true);
  expect(run.stdout().trim().split("\n")).toHaveLength(1);
  expect(JSON.parse(run.stdout())).toMatchObject({
    ok: false,
    exitCode: 2,
    diagnostics: [{
      severity: "error",
      code: "CLI_NATIVE_SERVER_START_FAILED",
      instancePath: "",
      message: "Unable to start the Native Package verification Harness.",
    }],
  });
  expect(combined).not.toContain(packageDirectoryPath);
  expect(combined).not.toContain(REPOSITORY_ROOT);
  expect(combined).not.toMatch(/(?:Error:|\n\s+at\s)/);
  await expect(readFile(tracker.markerPath, "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
}

afterEach(async () => {
  await Promise.all(children.splice(0).map((child) =>
    stopChild(child).catch(() => undefined)));
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

describe("worldkit native run process contract", { timeout: 180_000 }, () => {
  it.skipIf(process.platform === "win32")(
    "serves the admitted Native receipt with one nonce and exits cleanly on SIGTERM",
    async () => {
      const root = await makeTemporaryRoot();
      const packageDirectoryPath = path.join(root, "native-package");
      const packageDirectory = createBabylonNativeWorldPackageV1(
        createBabylonNativeWorldPackageTestInputV1(),
      );
      await writeWorldPackageDirectoryV1({
        outputDirectoryPath: packageDirectoryPath,
        directory: packageDirectory,
      });
      await applyGitCheckoutModes(packageDirectoryPath);
      const port = await allocateAvailablePort();
      const cacheDirectoriesBefore = await ownedNativeViteCacheDirectories();
      const run = spawnNativeRun(packageDirectoryPath, port);
      const ready = await waitForReady(run);
      expect(await ownedNativeViteCacheDirectories()).toHaveLength(
        cacheDirectoriesBefore.length + 1,
      );

      expect(ready).toEqual({
        ok: true,
        url: `http://127.0.0.1:${port}/?hosted=1`,
        port,
        worldPackageRootHash: packageDirectory.receipt.worldPackageRootHash,
        sceneSourceKind: "babylon-native-scene",
      });
      const receiptUrl = new URL(RECEIPT_ENDPOINT, ready.url);
      const receiptResponse = await fetch(receiptUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      const nonce = receiptResponse.headers.get("x-worldkit-server-nonce");
      expect(receiptResponse.status).toBe(200);
      expect(receiptResponse.headers.get("cache-control")).toBe("no-store");
      expect(nonce).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(await receiptResponse.json()).toMatchObject({
        worldPackageRootHash: ready.worldPackageRootHash,
        manifest: { sceneSource: { kind: "babylon-native-scene" } },
      });
      const headResponse = await fetch(receiptUrl, {
        method: "HEAD",
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      expect(headResponse.status).toBe(200);
      expect(headResponse.headers.get("x-worldkit-server-nonce")).toBe(nonce);

      run.child.kill("SIGTERM");
      expect(await waitForExit(run.child)).toEqual({ code: 0, signal: null });
      expect(await ownedNativeViteCacheDirectories()).toEqual(
        cacheDirectoriesBefore,
      );
      expect(run.stderr()).toBe("");
      expect(run.stdout().trim().split("\n")).toHaveLength(1);
      await expect(fetch(ready.url, {
        signal: AbortSignal.timeout(500),
      })).rejects.toThrow();
    },
  );

  it("rejects Canonical and tampered Native Packages before spawning Vite", async () => {
    const root = await makeTemporaryRoot();
    const tracker = await createViteSpawnTracker(root);
    const canonicalPackagePath = path.join(root, "canonical-package");
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath: canonicalPackagePath,
      directory: createCanonicalWorldPackageV1(createWorldPackageTestInputV1()),
    });
    await expectStablePreSpawnFailure(canonicalPackagePath, tracker);

    const tamperedPackagePath = path.join(root, "tampered-package");
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath: tamperedPackagePath,
      directory: createBabylonNativeWorldPackageV1(
        createBabylonNativeWorldPackageTestInputV1(),
      ),
    });
    const scenePath = path.join(tamperedPackagePath, "native/scene.mjs");
    const sceneBytes = new Uint8Array(await readFile(scenePath));
    sceneBytes[0] = sceneBytes[0] === 0 ? 1 : 0;
    await writeFile(scenePath, sceneBytes, { mode: 0o600 });
    await expectStablePreSpawnFailure(tamperedPackagePath, tracker);
  });
});
