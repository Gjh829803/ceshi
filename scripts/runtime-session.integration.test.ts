import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import {
  appendFile,
  cp,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  RuntimeSessionEventV1,
  RuntimeSessionReceiptV1,
  RuntimeSessionRequestV1,
  WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil } from "lodash-es";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");
const WORLDKIT_SCRIPT_PATH = path.join(REPOSITORY_ROOT, "scripts/worldkit.ts");
const BASIC_WORLD_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/basic-world.json",
);
const G_BOT_WORLD_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/g-bot-subject-world.json",
);
const G_BOT_PACKAGE_RESOURCE_PATH =
  "resources/subject-assets/actor.humanoid.g-bot.glb";
const CHILD_PROCESS_TIMEOUT_MILLISECONDS = 120_000;

interface PackageCommandSuccessV1 {
  readonly ok: true;
  readonly command: "build" | "inspect" | "load";
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: string;
}

interface ProcessExitV1 {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
}

interface NdjsonRecordV1 {
  readonly line: string;
  readonly value: RuntimeSessionEventV1 | RuntimeSessionReceiptV1;
}

interface NdjsonChildV1 {
  readonly child: ChildProcessWithoutNullStreams;
  readonly records: readonly NdjsonRecordV1[];
  nextRecord(): Promise<NdjsonRecordV1>;
  send(request: RuntimeSessionRequestV1): Promise<void>;
  waitForExit(): Promise<ProcessExitV1>;
}

type RequestInputV1 = RuntimeSessionRequestV1 extends infer Request
  ? Request extends RuntimeSessionRequestV1
    ? Omit<Request, "kind" | "schemaVersion" | "runtimeSessionId">
    : never
  : never;

let temporaryRoot: string;
let basicPackagePath: string;
let gBotPackagePath: string;
let basicBuild: PackageCommandSuccessV1;
let gBotBuild: PackageCommandSuccessV1;
const liveChildren = new Set<ChildProcessWithoutNullStreams>();

function spawnWorldkit(
  arguments_: readonly string[],
): ChildProcessWithoutNullStreams {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", WORLDKIT_SCRIPT_PATH, ...arguments_],
    {
      cwd: REPOSITORY_ROOT,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  liveChildren.add(child);
  child.once("exit", () => liveChildren.delete(child));
  return child;
}

async function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
  stderr: () => string,
): Promise<ProcessExitV1> {
  if (!isNil(child.exitCode) || !isNil(child.signalCode)) {
    return Object.freeze({
      code: child.exitCode,
      signal: child.signalCode,
      stderr: stderr(),
    });
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      child.kill("SIGKILL");
      reject(new Error("worldkit child process timed out"));
    }, CHILD_PROCESS_TIMEOUT_MILLISECONDS);
    const onExit = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      clearTimeout(timeout);
      resolve(Object.freeze({ code, signal, stderr: stderr() }));
    };
    child.once("exit", onExit);
  });
}

async function runOneShot(
  arguments_: readonly string[],
): Promise<Readonly<{
  exit: ProcessExitV1;
  stdout: string;
  lines: readonly string[];
}>> {
  const child = spawnWorldkit(arguments_);
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
  child.stdin.end();
  const exit = await waitForChildExit(child, () => stderr);
  const lines = stdout.trimEnd().split("\n").filter((line) => !isEmpty(line));
  return Object.freeze({ exit, stdout, lines: Object.freeze(lines) });
}

function parsePackageSuccess(result: Awaited<ReturnType<typeof runOneShot>>) {
  expect(result.exit).toMatchObject({ code: 0, signal: null, stderr: "" });
  expect(result.lines).toHaveLength(1);
  const line = result.lines[0]!;
  const value = JSON.parse(line) as PackageCommandSuccessV1;
  expect(stringifyCanonicalJson(value)).toBe(line);
  expect(value.ok).toBe(true);
  return value;
}

function createNdjsonChild(
  packagePath: string,
  sessionDirectoryPath: string,
  resume = false,
): NdjsonChildV1 {
  const child = spawnWorldkit([
    "run",
    packagePath,
    "--interactive",
    "--protocol",
    "ndjson",
    "--headless",
    "--session-directory",
    sessionDirectoryPath,
    ...(resume ? ["--resume"] : []),
  ]);
  const records: NdjsonRecordV1[] = [];
  const queuedRecords: NdjsonRecordV1[] = [];
  const pendingRecords: Array<Readonly<{
    resolve(record: NdjsonRecordV1): void;
    reject(error: Error): void;
    timeout: NodeJS.Timeout;
  }>> = [];
  let stdoutBuffer = "";
  let stderr = "";
  let streamError: Error | undefined;

  const rejectPending = (error: Error): void => {
    while (!isEmpty(pendingRecords)) {
      const pending = pendingRecords.shift()!;
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  };
  const publishLine = (line: string): void => {
    try {
      const value = JSON.parse(line) as
        RuntimeSessionEventV1 | RuntimeSessionReceiptV1;
      if (stringifyCanonicalJson(value) !== line) {
        throw new Error("Runtime Session stdout record is not canonical JSON.");
      }
      const record = Object.freeze({ line, value });
      records.push(record);
      const pending = pendingRecords.shift();
      if (isNil(pending)) {
        queuedRecords.push(record);
      } else {
        clearTimeout(pending.timeout);
        pending.resolve(record);
      }
    } catch (error) {
      streamError = error instanceof Error ? error : new Error(String(error));
      rejectPending(streamError);
    }
  };

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (isEmpty(line)) {
        streamError = new Error("Runtime Session stdout contained an empty line.");
        rejectPending(streamError);
      } else {
        publishLine(line);
      }
    }
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitPromise = waitForChildExit(child, () => stderr).then((exit) => {
    if (!isEmpty(stdoutBuffer)) {
      streamError = new Error("Runtime Session stdout ended with a partial line.");
    }
    rejectPending(streamError ?? new Error(
      `Runtime Session exited before the next record (${exit.code}/${String(exit.signal)}).`,
    ));
    return exit;
  });

  return Object.freeze({
    child,
    records,
    nextRecord: async () => {
      if (!isNil(streamError)) throw streamError;
      const queued = queuedRecords.shift();
      if (!isNil(queued)) return queued;
      return new Promise<NdjsonRecordV1>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const index = pendingRecords.findIndex(
            (pending) => pending.resolve === resolve,
          );
          if (index >= 0) pendingRecords.splice(index, 1);
          reject(new Error("Runtime Session did not emit the next NDJSON record."));
        }, CHILD_PROCESS_TIMEOUT_MILLISECONDS);
        pendingRecords.push(Object.freeze({ resolve, reject, timeout }));
      });
    },
    send: async (input: RuntimeSessionRequestV1) => {
      const line = `${stringifyCanonicalJson(input)}\n`;
      if (!child.stdin.write(line, "utf8")) {
        await new Promise<void>((resolve) => child.stdin.once("drain", resolve));
      }
    },
    waitForExit: () => exitPromise,
  });
}

function request(
  ready: Extract<RuntimeSessionEventV1, { type: "ready" }>,
  value: RequestInputV1,
): RuntimeSessionRequestV1 {
  return {
    kind: "worldkit-runtime-session-request",
    schemaVersion: 1,
    runtimeSessionId: ready.runtimeSessionId,
    ...value,
  } as RuntimeSessionRequestV1;
}

function expectReady(record: NdjsonRecordV1) {
  expect(record.value).toMatchObject({
    kind: "worldkit-runtime-session-event",
    type: "ready",
  });
  return record.value as Extract<RuntimeSessionEventV1, { type: "ready" }>;
}

function expectReceipt(
  record: NdjsonRecordV1,
  requestType: RuntimeSessionRequestV1["type"],
) {
  expect(record.value).toMatchObject({
    kind: "worldkit-runtime-session-receipt",
    requestType,
    status: "succeeded",
  });
  return record.value as RuntimeSessionReceiptV1;
}

function snapshotFromReceipt(
  receipt: RuntimeSessionReceiptV1,
): WorldRuntimeSnapshotV4 {
  if (receipt.status !== "succeeded" || !("snapshot" in receipt)) {
    throw new Error("Expected a succeeded Runtime Session snapshot Receipt.");
  }
  return receipt.snapshot;
}

async function closeSession(
  stream: NdjsonChildV1,
  ready: Extract<RuntimeSessionEventV1, { type: "ready" }>,
  id: string,
): Promise<void> {
  await stream.send(request(ready, { id, type: "session.close" }));
  expectReceipt(await stream.nextRecord(), "session.close");
  expect((await stream.nextRecord()).value).toMatchObject({ type: "completed" });
  expect(await stream.waitForExit()).toMatchObject({
    code: 0,
    signal: null,
    stderr: "",
  });
}

async function copySessionDirectory(
  source: string,
  destination: string,
): Promise<void> {
  await cp(source, destination, { recursive: true, preserveTimestamps: true });
}

async function corruptWalCompleteRow(sessionDirectoryPath: string): Promise<void> {
  const walPath = path.join(
    sessionDirectoryPath,
    "runtime-session.wal.ndjson",
  );
  const text = await readFile(walPath, "utf8");
  const marker = '"transactionHash":"sha256:';
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) throw new Error("WAL transactionHash marker is missing.");
  const hashByteIndex = markerIndex + marker.length;
  const replacement = text[hashByteIndex] === "a" ? "b" : "a";
  await writeFile(
    walPath,
    `${text.slice(0, hashByteIndex)}${replacement}${text.slice(hashByteIndex + 1)}`,
    "utf8",
  );
}

async function corruptPackageResource(packagePath: string): Promise<void> {
  const resourcePath = path.join(packagePath, G_BOT_PACKAGE_RESOURCE_PATH);
  const bytes = Buffer.from(await readFile(resourcePath));
  if (bytes.byteLength === 0) throw new Error("G Bot Package resource is empty.");
  bytes[0] = bytes[0]! ^ 0xff;
  await writeFile(resourcePath, bytes);
}

beforeAll(async () => {
  temporaryRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), "runtime-session-integration-")),
  );
  basicPackagePath = path.join(temporaryRoot, "basic.package");
  gBotPackagePath = path.join(temporaryRoot, "g-bot.package");
  basicBuild = parsePackageSuccess(await runOneShot([
    "build",
    BASIC_WORLD_PATH,
    "--output",
    basicPackagePath,
    "--json",
  ]));
  gBotBuild = parsePackageSuccess(await runOneShot([
    "build",
    G_BOT_WORLD_PATH,
    "--output",
    gBotPackagePath,
    "--json",
  ]));
}, 180_000);

afterAll(async () => {
  await Promise.all([...liveChildren].map(async (child) => {
    child.kill("SIGKILL");
    await waitForChildExit(child, () => "").catch(() => undefined);
  }));
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("Runtime Session fresh-process publication", () => {
  it("builds in process A and independently inspects and loads basic and G Bot Packages in process B", async () => {
    for (const [packagePath, build] of [
      [basicPackagePath, basicBuild],
      [gBotPackagePath, gBotBuild],
    ] as const) {
      for (const [command, flags] of [
        ["inspect", ["--json"]],
        ["load", ["--headless", "--json"]],
      ] as const) {
        const result = parsePackageSuccess(await runOneShot([
          command,
          packagePath,
          ...flags,
        ]));
        expect(result).toMatchObject({
          command,
          worldPackageRef: build.worldPackageRef,
          worldPackageRootHash: build.worldPackageRootHash,
        });
      }
    }
  }, 180_000);

  it("recovers committed state after SIGKILL and rejects corruption before ready while truncating only a torn tail", async () => {
    const sessionDirectoryPath = path.join(temporaryRoot, "crashed-session");
    const stream = createNdjsonChild(basicPackagePath, sessionDirectoryPath);
    const readyRecord = await stream.nextRecord();
    const ready = expectReady(readyRecord);

    const release = request(ready, {
      id: "request.release",
      type: "gameplay-command.execute",
      command: {
        schemaVersion: 1,
        id: "command.release",
        runtimeSessionId: ready.runtimeSessionId,
        worldSessionId: ready.worldSessionId,
        controllerEntityId: ready.fixedInputControllerEntityId,
        type: "control.release",
        expectedPossession: {
          mode: "possessed",
          controlledEntityId: "player",
        },
      },
    });
    await stream.send(release);
    expectReceipt(await stream.nextRecord(), "gameplay-command.execute");

    const bind = request(ready, {
      id: "request.bind",
      type: "gameplay-command.execute",
      command: {
        schemaVersion: 1,
        id: "command.bind",
        runtimeSessionId: ready.runtimeSessionId,
        worldSessionId: ready.worldSessionId,
        controllerEntityId: ready.fixedInputControllerEntityId,
        type: "control.bind",
        controlledEntityId: "player",
        expectedPossession: { mode: "unbound" },
      },
    });
    await stream.send(bind);
    expectReceipt(await stream.nextRecord(), "gameplay-command.execute");

    const fixed = request(ready, {
      id: "request.fixed",
      type: "fixed-input.run",
      input: { actions: ["move-forward"], ticks: 2 },
    });
    await stream.send(fixed);
    const fixedReceiptRecord = await stream.nextRecord();
    const fixedReceipt = expectReceipt(fixedReceiptRecord, "fixed-input.run");

    const snapshot = request(ready, {
      id: "request.snapshot.before-crash",
      type: "snapshot.get",
    });
    await stream.send(snapshot);
    const snapshotReceipt = expectReceipt(
      await stream.nextRecord(),
      "snapshot.get",
    );
    expect(snapshotReceipt).toMatchObject({
      status: "succeeded",
      snapshot: snapshotFromReceipt(fixedReceipt),
    });

    await stream.send(fixed);
    const duplicateBeforeCrash = await stream.nextRecord();
    expect(duplicateBeforeCrash.line).toBe(fixedReceiptRecord.line);

    stream.child.kill("SIGKILL");
    expect(await stream.waitForExit()).toMatchObject({
      code: null,
      signal: "SIGKILL",
    });
    expect(stream.records.filter(({ value }) =>
      value.kind === "worldkit-runtime-session-event" &&
      (value.type === "completed" || value.type === "failed")
    )).toHaveLength(0);

    const walCorruptSessionPath = path.join(temporaryRoot, "wal-corrupt-session");
    const tornTailSessionPath = path.join(temporaryRoot, "torn-tail-session");
    await copySessionDirectory(sessionDirectoryPath, walCorruptSessionPath);
    await copySessionDirectory(sessionDirectoryPath, tornTailSessionPath);

    const resumed = createNdjsonChild(
      basicPackagePath,
      sessionDirectoryPath,
      true,
    );
    const resumedReadyRecord = await resumed.nextRecord();
    const resumedReady = expectReady(resumedReadyRecord);
    expect(resumedReadyRecord.line).toBe(readyRecord.line);

    const resumedSnapshot = request(resumedReady, {
      id: "request.snapshot.after-resume",
      type: "snapshot.get",
    });
    await resumed.send(resumedSnapshot);
    const resumedSnapshotReceipt = expectReceipt(
      await resumed.nextRecord(),
      "snapshot.get",
    );
    expect(resumedSnapshotReceipt).toMatchObject({
      status: "succeeded",
      snapshot: snapshotFromReceipt(snapshotReceipt),
    });

    await resumed.send(fixed);
    expect((await resumed.nextRecord()).line).toBe(fixedReceiptRecord.line);
    const continued = request(resumedReady, {
      id: "request.fixed.continued",
      type: "fixed-input.run",
      input: { actions: [], ticks: 1 },
    });
    await resumed.send(continued);
    const continuedReceipt = expectReceipt(
      await resumed.nextRecord(),
      "fixed-input.run",
    );
    expect(snapshotFromReceipt(continuedReceipt).world.simulationTick).toBe(
      snapshotFromReceipt(snapshotReceipt).world.simulationTick + 1,
    );
    await closeSession(resumed, resumedReady, "request.close.resumed");

    await corruptWalCompleteRow(walCorruptSessionPath);
    const corruptWal = createNdjsonChild(
      basicPackagePath,
      walCorruptSessionPath,
      true,
    );
    expect(await corruptWal.waitForExit()).toMatchObject({ code: 1, signal: null });
    expect(corruptWal.records).toHaveLength(0);

    const tornWalPath = path.join(
      tornTailSessionPath,
      "runtime-session.wal.ndjson",
    );
    await appendFile(tornWalPath, '{"unterminated":', "utf8");
    const torn = createNdjsonChild(
      basicPackagePath,
      tornTailSessionPath,
      true,
    );
    const tornReadyRecord = await torn.nextRecord();
    const tornReady = expectReady(tornReadyRecord);
    expect(tornReadyRecord.line).toBe(readyRecord.line);
    await closeSession(torn, tornReady, "request.close.torn-tail");
    expect(await readFile(tornWalPath, "utf8")).not.toContain(
      '{"unterminated":',
    );
  }, 180_000);

  it("rejects a changed Package resource before ready", async () => {
    const corruptPackagePath = path.join(temporaryRoot, "g-bot-corrupt.package");
    await cp(gBotPackagePath, corruptPackagePath, { recursive: true });
    await corruptPackageResource(corruptPackagePath);
    const stream = createNdjsonChild(
      corruptPackagePath,
      path.join(temporaryRoot, "corrupt-package-session"),
    );
    expect(await stream.waitForExit()).toMatchObject({ code: 1, signal: null });
    expect(stream.records).toHaveLength(0);
  }, 120_000);

  it.each(["SIGINT", "SIGTERM"] as const)(
    "awaits exact Runtime disposal and emits one final Event on %s",
    async (signal) => {
      const sessionDirectoryPath = path.join(
        temporaryRoot,
        `signal-${signal.toLowerCase()}`,
      );
      const stream = createNdjsonChild(basicPackagePath, sessionDirectoryPath);
      expectReady(await stream.nextRecord());
      stream.child.kill(signal);
      const finalRecord = await stream.nextRecord();
      expect(finalRecord.value).toMatchObject({ type: "completed" });
      expect(await stream.waitForExit()).toMatchObject({
        code: 0,
        signal: null,
        stderr: "",
      });
      expect(stream.records.filter(({ value }) =>
        value.kind === "worldkit-runtime-session-event" &&
        (value.type === "completed" || value.type === "failed")
      )).toHaveLength(1);
      const wal = await readFile(
        path.join(sessionDirectoryPath, "runtime-session.wal.ndjson"),
        "utf8",
      );
      expect(wal.match(/"type":"session-closed"/g)).toHaveLength(1);
    },
    120_000,
  );
});
