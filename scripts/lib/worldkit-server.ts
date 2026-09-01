import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import net from "node:net";
import path from "node:path";

import { canonicalJsonBytes } from "@whitebox-world/protocol";
import {
  canonicalWorldkitBrowserRouteEvidencePublicationV2,
  type WorldkitBrowserRouteEvidencePublicationV2,
} from "@whitebox-world/runtime-contracts";
import type { OwnedNativeViteCacheV1 } from
  "../native-scene/owned-native-vite-cache.js";

import { resolveTrustedSourceCommit } from "./worldkit-source-commit";
import { WORLDKIT_ROUTE_EVIDENCE_MAX_BYTES_V1 } from
  "./worldkit-route-evidence-transport";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PLAYGROUND_ROOT = path.join(REPOSITORY_ROOT, "apps/playground");
const NATIVE_PLAYGROUND_ROOT = path.join(
  REPOSITORY_ROOT,
  "apps/native-scene-playground",
);
const VITE_CLI_PATH = path.join(REPOSITORY_ROOT, "node_modules/vite/bin/vite.js");
const AUTHORING_ENDPOINT = "/__worldkit/authoring-spec";
const NATIVE_PACKAGE_RECEIPT_ENDPOINT =
  "/__worldkit/native-package/world-package-build-receipt.json";
const SERVER_NONCE_HEADER = "x-worldkit-server-nonce";
const DEFAULT_STARTUP_TIMEOUT_MILLISECONDS = 30_000;
const DEFAULT_STOP_TIMEOUT_MILLISECONDS = 3_000;
const AUTOMATIC_PORT_ATTEMPTS = 5;

export interface WorldkitServerRouteEvidenceV1 {
  readonly publication: WorldkitBrowserRouteEvidencePublicationV2;
  readonly canonicalBytes: Uint8Array;
}

export type WorldkitServerSourceV1 =
  | Readonly<{ kind: "canonical-file"; inputPath: string }>
  | Readonly<{
      kind: "world-package";
      packageDirectoryPath: string;
    }>;

export interface StartWorldkitServerOptions {
  source: WorldkitServerSourceV1;
  port?: number;
  forwardOutput?: boolean;
  refreshDependencies?: boolean;
  startupTimeoutMilliseconds?: number;
  stopTimeoutMilliseconds?: number;
  routeEvidence?: WorldkitServerRouteEvidenceV1;
}

export interface WorldkitServerHandle {
  readonly url: string;
  readonly port: number;
  readonly process: ChildProcessWithoutNullStreams;
  readonly sceneSourceKind: "canonical-execution-plan" | "babylon-native-scene";
  readonly worldPackageRootHash?: `sha256:${string}`;
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
      | "WORLDKIT_SERVER_START_TIMEOUT"
      | "WORLDKIT_ROUTE_EVIDENCE_TOO_LARGE",
    message: string,
  ) {
    super(message);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
  });
}

interface OwnedChildLifecycle {
  readonly exitPromise: Promise<number | null>;
  readonly processErrorPromise: Promise<never>;
}

interface OwnedRouteEvidenceFileV1 {
  readonly path: string;
  cleanup(): Promise<void>;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

async function createOwnedRouteEvidenceFile(
  input: WorldkitServerRouteEvidenceV1 | undefined,
): Promise<OwnedRouteEvidenceFileV1 | undefined> {
  if (input === undefined) return undefined;
  if (!(input.canonicalBytes instanceof Uint8Array)) {
    throw new Error("WORLDKIT_ROUTE_EVIDENCE_CANONICAL_BYTES_INVALID");
  }
  if (
    input.canonicalBytes.byteLength >
      WORLDKIT_ROUTE_EVIDENCE_MAX_BYTES_V1
  ) {
    throw new WorldkitServerStartError(
      "WORLDKIT_ROUTE_EVIDENCE_TOO_LARGE",
      `Route evidence exceeds the ${WORLDKIT_ROUTE_EVIDENCE_MAX_BYTES_V1} byte Host admission limit.`,
    );
  }
  const publication = canonicalWorldkitBrowserRouteEvidencePublicationV2(
    input.publication,
  );
  const canonicalBytes = canonicalJsonBytes(publication);
  if (
    canonicalBytes.byteLength > WORLDKIT_ROUTE_EVIDENCE_MAX_BYTES_V1
  ) {
    throw new WorldkitServerStartError(
      "WORLDKIT_ROUTE_EVIDENCE_TOO_LARGE",
      `Route evidence exceeds the ${WORLDKIT_ROUTE_EVIDENCE_MAX_BYTES_V1} byte Host admission limit.`,
    );
  }
  if (!equalBytes(input.canonicalBytes, canonicalBytes)) {
    throw new Error("WORLDKIT_ROUTE_EVIDENCE_CANONICAL_BYTES_MISMATCH");
  }

  const directoryPath = await mkdtemp(
    path.join(tmpdir(), `worldkit-route-evidence-${process.pid}-`),
  );
  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    await rm(directoryPath, { recursive: true, force: true });
  };
  try {
    await chmod(directoryPath, 0o700);
    const evidencePath = path.join(directoryPath, "route-evidence.json");
    await writeFile(evidencePath, canonicalBytes, { flag: "wx", mode: 0o600 });
    return { path: evidencePath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function observeOwnedChild(
  child: ChildProcessWithoutNullStreams,
): OwnedChildLifecycle {
  let settleExit!: (code: number | null) => void;
  let rejectProcessError!: (error: WorldkitServerStartError) => void;
  let settled = false;
  const exitPromise = new Promise<number | null>((resolve) => {
    settleExit = (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
  });
  const processErrorPromise = new Promise<never>((_, reject) => {
    rejectProcessError = reject;
  });
  child.once("error", () => {
    rejectProcessError(new WorldkitServerStartError(
      "WORLDKIT_SERVER_PROCESS_ERROR",
      "Worldkit playground process failed to start.",
    ));
    settleExit(null);
  });
  child.once("exit", (code) => settleExit(code));
  child.once("close", (code) => settleExit(code));
  return { exitPromise, processErrorPromise };
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

async function allocateDistinctAvailablePort(
  excludedPort: number,
): Promise<number> {
  for (let attempt = 0; attempt < AUTOMATIC_PORT_ATTEMPTS; attempt += 1) {
    const candidate = await allocateAvailablePort();
    if (candidate !== excludedPort) return candidate;
  }
  throw new WorldkitServerStartError(
    "WORLDKIT_SERVER_PORT_UNAVAILABLE",
    "Unable to allocate a distinct Native Runtime origin port.",
  );
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
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return;
    if (code !== "EPERM" || process.platform === "win32") throw error;
    try {
      child.kill(signal);
    } catch (fallbackError) {
      if ((fallbackError as NodeJS.ErrnoException).code !== "ESRCH") {
        throw fallbackError;
      }
    }
  }
}

export async function terminateOwnedWorldkitServerChildrenV1(
  input: Readonly<{
    children: readonly ChildProcessWithoutNullStreams[];
    exitPromise: Promise<unknown>;
    stopTimeoutMilliseconds: number;
  }>,
): Promise<void> {
  for (const child of input.children) signalOwnedProcess(child, "SIGTERM");
  const exited = await Promise.race([
    input.exitPromise.then(() => true),
    delay(input.stopTimeoutMilliseconds).then(() => false),
  ]);
  if (exited) return;
  for (const child of input.children) signalOwnedProcess(child, "SIGKILL");
  await input.exitPromise;
}

function createHandle(options: {
  child: ChildProcessWithoutNullStreams;
  children?: readonly ChildProcessWithoutNullStreams[];
  lifecycle: OwnedChildLifecycle;
  port: number;
  stopTimeoutMilliseconds: number;
  cleanupOwnedState?: () => Promise<void>;
  sceneSourceKind: WorldkitServerHandle["sceneSourceKind"];
  worldPackageRootHash?: `sha256:${string}`;
  urlSearch?: string;
}): WorldkitServerHandle {
  const {
    child,
    children = [child],
    lifecycle,
    port,
    stopTimeoutMilliseconds,
    cleanupOwnedState = async () => undefined,
  } = options;
  const { exitPromise } = lifecycle;
  const cleanupPromise = exitPromise.then(cleanupOwnedState);
  void cleanupPromise.catch(() => undefined);
  let stopPromise: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopPromise ??= (async () => {
      if (children.every((ownedChild) =>
        ownedChild.exitCode !== null || ownedChild.signalCode !== null
      )) {
        await exitPromise;
        await cleanupPromise;
        return;
      }
      await terminateOwnedWorldkitServerChildrenV1({
        children,
        exitPromise,
        stopTimeoutMilliseconds,
      });
      await cleanupPromise;
    })();
    return stopPromise;
  };
  return {
    url: `http://127.0.0.1:${port}/${options.urlSearch ?? ""}`,
    port,
    process: child,
    sceneSourceKind: options.sceneSourceKind,
    ...(options.worldPackageRootHash === undefined
      ? {}
      : { worldPackageRootHash: options.worldPackageRootHash }),
    stop,
    waitForExit: () => exitPromise,
  };
}

async function waitUntilReady(options: {
  lifecycle: OwnedChildLifecycle;
  endpoint: string;
  nonce: string;
  timeoutMilliseconds: number;
}): Promise<void> {
  const { lifecycle, endpoint, nonce, timeoutMilliseconds } = options;
  let polling = true;
  const processExit = lifecycle.exitPromise.then((code): never => {
    throw new WorldkitServerStartError(
      "WORLDKIT_SERVER_PROCESS_EXITED",
      `Worldkit playground exited before readiness (exit ${String(code)}).`,
    );
  });
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new WorldkitServerStartError(
      "WORLDKIT_SERVER_START_TIMEOUT",
      `Worldkit playground did not become ready within ${timeoutMilliseconds}ms.`,
    )), timeoutMilliseconds);
    timeoutHandle.unref();
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
    await Promise.race([
      readiness,
      lifecycle.processErrorPromise,
      processExit,
      timeout,
    ]);
  } finally {
    polling = false;
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

function spawnVite(options: {
  rootPath: string;
  configPath: string;
  port: number;
  refreshDependencies: boolean;
  configLoader?: "runner";
  environment: NodeJS.ProcessEnv;
}): ChildProcessWithoutNullStreams {
  return spawn(
    process.execPath,
    [
      VITE_CLI_PATH,
      "--config",
      options.configPath,
      "--host",
      "127.0.0.1",
      "--port",
      String(options.port),
      "--strictPort",
      ...(options.configLoader === undefined
        ? []
        : ["--configLoader", options.configLoader]),
      ...(options.refreshDependencies ? ["--force"] : []),
    ],
    {
      cwd: options.rootPath,
      detached: process.platform !== "win32",
      env: options.environment,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

function configureChildOutput(
  child: ChildProcessWithoutNullStreams,
  forwardOutput: boolean,
): void {
  child.stdin.end();
  if (forwardOutput) {
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  } else {
    child.stdout.resume();
    child.stderr.resume();
  }
}

async function startCanonicalOne(
  options: StartWorldkitServerOptions & Readonly<{
    source: Extract<WorldkitServerSourceV1, { kind: "canonical-file" }>;
  }>,
  port: number,
): Promise<WorldkitServerHandle> {
  const nonce = randomUUID();
  const ownedRouteEvidence = await createOwnedRouteEvidenceFile(
    options.routeEvidence,
  );
  const sourceCommit = await resolveTrustedSourceCommit({
    envCommit: process.env.WORLDKIT_SOURCE_COMMIT,
    repositoryRoot: REPOSITORY_ROOT,
  }).catch(() => undefined);
  const childEnvironment = { ...process.env };
  delete childEnvironment.WORLDKIT_ROUTE_EVIDENCE_PATH;
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnVite({
      rootPath: PLAYGROUND_ROOT,
      configPath: path.join(PLAYGROUND_ROOT, "vite.config.mjs"),
      port,
      refreshDependencies: options.refreshDependencies === true,
      environment: {
          ...childEnvironment,
          WORLDKIT_AUTHORING_SPEC_PATH: path.resolve(options.source.inputPath),
          WORLDKIT_AUTHORING_SERVER_NONCE: nonce,
          ...(ownedRouteEvidence === undefined
            ? {}
            : { WORLDKIT_ROUTE_EVIDENCE_PATH: ownedRouteEvidence.path }),
          ...(sourceCommit === undefined ? {} : { WORLDKIT_SOURCE_COMMIT: sourceCommit }),
      },
    });
  } catch (error) {
    await ownedRouteEvidence?.cleanup();
    throw error;
  }
  const lifecycle = observeOwnedChild(child);
  configureChildOutput(child, options.forwardOutput === true);
  const handle = createHandle({
    child,
    lifecycle,
    port,
    stopTimeoutMilliseconds:
      options.stopTimeoutMilliseconds ?? DEFAULT_STOP_TIMEOUT_MILLISECONDS,
    ...(ownedRouteEvidence === undefined
      ? {}
      : { cleanupOwnedState: ownedRouteEvidence.cleanup }),
    sceneSourceKind: "canonical-execution-plan",
  });
  try {
    await waitUntilReady({
      lifecycle,
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

async function startNativeOne(
  options: StartWorldkitServerOptions & Readonly<{
    source: Extract<WorldkitServerSourceV1, { kind: "world-package" }>;
  }>,
  shellPort: number,
): Promise<WorldkitServerHandle> {
  const { createWorldPackageBrowserTransportV1 } = await import(
    "./world-package-browser-transport.js"
  );
  const transport = await createWorldPackageBrowserTransportV1({
    packageDirectoryPath: options.source.packageDirectoryPath,
  });
  if (transport.sceneSourceKind !== "babylon-native-scene") {
    transport.dispose();
    throw new Error(
      "WORLDKIT_NATIVE_HARNESS_SCENE_SOURCE_KIND_UNSUPPORTED",
    );
  }
  let runtimePort: number;
  let ownedViteCache: OwnedNativeViteCacheV1;
  try {
    runtimePort = await allocateDistinctAvailablePort(shellPort);
    const { createOwnedNativeViteCacheV1 } = await import(
      "../native-scene/owned-native-vite-cache.js"
    );
    ownedViteCache = await createOwnedNativeViteCacheV1();
  } catch (error) {
    transport.dispose();
    throw error;
  }
  const nonce = randomUUID();
  const shellOrigin = `http://127.0.0.1:${shellPort}`;
  const runtimeOrigin = `http://127.0.0.1:${runtimePort}`;
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    WORLDKIT_NATIVE_PACKAGE_PATH: path.resolve(
      options.source.packageDirectoryPath,
    ),
    WORLDKIT_AUTHORING_SERVER_NONCE: nonce,
    WORLDKIT_NATIVE_SERVER_INSTANCE_ID: ownedViteCache.serverInstanceId,
    WORLDKIT_NATIVE_VITE_CACHE_ROOT: ownedViteCache.rootDirectoryPath,
    WORLDKIT_NATIVE_VERIFIER_PROBE: "disabled",
    WORLDKIT_HOSTED_SHELL_ORIGIN: shellOrigin,
    WORLDKIT_HOSTED_RUNTIME_ORIGIN: runtimeOrigin,
  };
  const children: ChildProcessWithoutNullStreams[] = [];
  const lifecycles: OwnedChildLifecycle[] = [];
  try {
    for (const port of [shellPort, runtimePort]) {
      const child = spawnVite({
        rootPath: NATIVE_PLAYGROUND_ROOT,
        configPath: path.join(NATIVE_PLAYGROUND_ROOT, "vite.config.ts"),
        port,
        refreshDependencies: options.refreshDependencies === true,
        configLoader: "runner",
        environment: {
          ...childEnvironment,
          WORLDKIT_NATIVE_SERVER_ROLE:
            port === shellPort ? "shell" : "runtime",
        },
      });
      lifecycles.push(observeOwnedChild(child));
      configureChildOutput(child, options.forwardOutput === true);
      children.push(child);
    }
  } catch (error) {
    await terminateOwnedWorldkitServerChildrenV1({
      children,
      exitPromise: Promise.all(lifecycles.map((entry) => entry.exitPromise)),
      stopTimeoutMilliseconds:
        options.stopTimeoutMilliseconds ?? DEFAULT_STOP_TIMEOUT_MILLISECONDS,
    });
    transport.dispose();
    await ownedViteCache.dispose();
    throw error;
  }
  const lifecycle: OwnedChildLifecycle = {
    exitPromise: Promise.all(lifecycles.map((entry) => entry.exitPromise))
      .then((codes) => codes[0] ?? null),
    processErrorPromise: Promise.race(
      lifecycles.map((entry) => entry.processErrorPromise),
    ),
  };
  const handle = createHandle({
    child: children[0]!,
    children,
    lifecycle,
    port: shellPort,
    stopTimeoutMilliseconds:
      options.stopTimeoutMilliseconds ?? DEFAULT_STOP_TIMEOUT_MILLISECONDS,
    cleanupOwnedState: async () => {
      transport.dispose();
      await ownedViteCache.dispose();
    },
    sceneSourceKind: "babylon-native-scene",
    worldPackageRootHash: transport.worldPackageRootHash,
    urlSearch: "?hosted=1",
  });
  try {
    await Promise.all([
      waitUntilReady({
        lifecycle: lifecycles[0]!,
        endpoint: `${shellOrigin}${NATIVE_PACKAGE_RECEIPT_ENDPOINT}`,
        nonce,
        timeoutMilliseconds:
          options.startupTimeoutMilliseconds ?? DEFAULT_STARTUP_TIMEOUT_MILLISECONDS,
      }),
      waitUntilReady({
        lifecycle: lifecycles[1]!,
        endpoint: `${runtimeOrigin}${NATIVE_PACKAGE_RECEIPT_ENDPOINT}`,
        nonce,
        timeoutMilliseconds:
          options.startupTimeoutMilliseconds ?? DEFAULT_STARTUP_TIMEOUT_MILLISECONDS,
      }),
    ]);
    return handle;
  } catch (error) {
    await handle.stop();
    throw error;
  }
}

export async function startWorldkitServer(
  options: StartWorldkitServerOptions,
): Promise<WorldkitServerHandle> {
  if (
    options.source.kind === "world-package" &&
    options.routeEvidence !== undefined
  ) {
    throw new Error("WORLDKIT_NATIVE_HARNESS_ROUTE_EVIDENCE_UNSUPPORTED");
  }
  if (options.port !== undefined) {
    await assertPortAvailable(options.port);
    return options.source.kind === "canonical-file"
      ? startCanonicalOne({ ...options, source: options.source }, options.port)
      : startNativeOne({ ...options, source: options.source }, options.port);
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < AUTOMATIC_PORT_ATTEMPTS; attempt += 1) {
    const port = await allocateAvailablePort();
    try {
      return await (options.source.kind === "canonical-file"
        ? startCanonicalOne({ ...options, source: options.source }, port)
        : startNativeOne({ ...options, source: options.source }, port));
    } catch (error) {
      lastError = error;
      if (!(error instanceof WorldkitServerStartError) ||
          error.code !== "WORLDKIT_SERVER_PROCESS_EXITED") throw error;
    }
  }
  throw lastError;
}
