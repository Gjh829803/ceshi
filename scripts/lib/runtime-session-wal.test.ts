import {
  appendFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
  deriveRuntimeSessionEventIdV1,
  deriveRuntimeSessionReceiptIdV1,
  hashRuntimeSessionRequestV1,
  type RuntimeSessionEventV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
} from "@whitebox-world/runtime-contracts";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { afterEach, describe, expect, it } from "vitest";

import {
  createFileRuntimeSessionWalV1,
  openFileRuntimeSessionWalV1,
} from "./runtime-session-wal";

const temporaryDirectories: string[] = [];
const ROOT_HASH = `sha256:${"a".repeat(64)}` as const;

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "runtime-session-wal-"));
  temporaryDirectories.push(directory);
  return directory;
}

function readyEvent(): Extract<RuntimeSessionEventV1, { type: "ready" }> {
  const body = {
    kind: "worldkit-runtime-session-event",
    schemaVersion: 1,
    protocolVersion: 1,
    sequence: 1,
    runtimeSessionId: "runtime-session-primary",
    worldSessionId: "world-session-primary",
    type: "ready",
    runtimeSessionUri: "worldkit://runtime-session/runtime-session-primary",
    worldPackageRef: `package://world-package/sha256/${"a".repeat(64)}`,
    worldPackageRootHash: ROOT_HASH,
    worldBuildIdentityHash: ROOT_HASH,
    fixedInputControllerEntityId: "controller-primary",
    supportedRequestTypes: WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
  } as const;
  return {
    id: deriveRuntimeSessionEventIdV1(body),
    ...body,
  };
}

function request(
  id = "runtime-request-input",
  ticks = 2,
): Extract<RuntimeSessionRequestV1, { type: "fixed-input.run" }> {
  return {
    kind: "worldkit-runtime-session-request",
    schemaVersion: 1,
    id,
    runtimeSessionId: "runtime-session-primary",
    type: "fixed-input.run",
    input: { actions: ["move-forward"], ticks },
  };
}

function rejectedReceipt(
  input: RuntimeSessionRequestV1,
): Extract<RuntimeSessionReceiptV1, { status: "rejected" }> {
  const body = {
    kind: "worldkit-runtime-session-receipt",
    schemaVersion: 1,
    requestId: input.id,
    requestHash: hashRuntimeSessionRequestV1(input),
    runtimeSessionId: input.runtimeSessionId,
    worldSessionId: "world-session-primary",
    requestType: input.type,
    status: "rejected",
    diagnostic: {
      code: "RUNTIME_SESSION_NOT_ACTIVE",
      message: "The Runtime Session is not active.",
    },
  } as const;
  return {
    id: deriveRuntimeSessionReceiptIdV1(body),
    ...body,
  };
}

function completedEvent(): Extract<RuntimeSessionEventV1, { type: "completed" }> {
  const body = {
    kind: "worldkit-runtime-session-event",
    schemaVersion: 1,
    protocolVersion: 1,
    sequence: 2,
    runtimeSessionId: "runtime-session-primary",
    worldSessionId: "world-session-primary",
    type: "completed",
  } as const;
  return {
    id: deriveRuntimeSessionEventIdV1(body),
    ...body,
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("file Runtime Session WAL V1", () => {
  it("creates one private fsynced session and reconstructs it exactly", async () => {
    const directory = await temporaryDirectory();
    const sessionDirectoryPath = path.join(directory, "session");
    const walFilePath = path.join(sessionDirectoryPath, "runtime-session.wal.ndjson");

    const created = createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    expect(created.snapshot()).toEqual({
      readyEvent: readyEvent(),
      committedRequests: [],
    });
    expect(statSync(sessionDirectoryPath).mode & 0o777).toBe(0o700);
    expect(statSync(walFilePath).mode & 0o777).toBe(0o600);
    expect(readFileSync(walFilePath, "utf8").endsWith("\n")).toBe(true);

    expect(openFileRuntimeSessionWalV1({ walFilePath }).snapshot()).toEqual(
      created.snapshot(),
    );
  });

  it("commits exact Request/Hash/Receipt rows and resolves replay versus conflict", async () => {
    const directory = await temporaryDirectory();
    const walFilePath = path.join(directory, "session", "runtime-session.wal.ndjson");
    const wal = createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    const firstRequest = request();
    const receipt = rejectedReceipt(firstRequest);
    wal.appendCommittedRequest({ request: firstRequest, receipt });

    expect(wal.lookupRequest(firstRequest)).toEqual({
      status: "replay",
      receipt,
    });
    expect(wal.lookupRequest(request(firstRequest.id, 3))).toEqual({
      status: "conflict",
    });
    expect(wal.lookupRequest(request("runtime-request-new", 1))).toEqual({
      status: "missing",
    });
    expect(() => wal.appendCommittedRequest({
      request: firstRequest,
      receipt,
    })).toThrow("RUNTIME_SESSION_WAL_REQUEST_DUPLICATE");

    const reopened = openFileRuntimeSessionWalV1({ walFilePath });
    expect(reopened.snapshot().committedRequests).toEqual([{
      request: firstRequest,
      requestHash: hashRuntimeSessionRequestV1(firstRequest),
      receipt,
    }]);
    expect(stringifyCanonicalJson(reopened.lookupRequest(firstRequest))).toBe(
      stringifyCanonicalJson(wal.lookupRequest(firstRequest)),
    );
  });

  it("records one final lifecycle event and rejects later writes", async () => {
    const directory = await temporaryDirectory();
    const walFilePath = path.join(directory, "session", "runtime-session.wal.ndjson");
    const wal = createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    wal.appendClosed(completedEvent());
    expect(wal.snapshot().finalEvent).toEqual(completedEvent());
    expect(() => wal.appendClosed(completedEvent())).toThrow(
      "RUNTIME_SESSION_WAL_CLOSED",
    );
    expect(() => wal.appendCommittedRequest({
      request: request(),
      receipt: rejectedReceipt(request()),
    })).toThrow("RUNTIME_SESSION_WAL_CLOSED");
    expect(openFileRuntimeSessionWalV1({ walFilePath }).snapshot()).toEqual(
      wal.snapshot(),
    );
  });

  it("truncates only an unterminated tail and keeps all complete transactions", async () => {
    const directory = await temporaryDirectory();
    const walFilePath = path.join(directory, "session", "runtime-session.wal.ndjson");
    const wal = createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    const firstRequest = request();
    wal.appendCommittedRequest({
      request: firstRequest,
      receipt: rejectedReceipt(firstRequest),
    });
    const completeBytes = await readFile(walFilePath);
    appendFileSync(walFilePath, '{"kind":"partial"', "utf8");

    const reopened = openFileRuntimeSessionWalV1({ walFilePath });
    expect(reopened.snapshot().committedRequests).toHaveLength(1);
    expect(await readFile(walFilePath)).toEqual(completeBytes);
  });

  it("fails closed on a corrupt complete row or recomputed-invalid transaction", async () => {
    const directory = await temporaryDirectory();
    const firstPath = path.join(directory, "first", "runtime-session.wal.ndjson");
    createFileRuntimeSessionWalV1({
      walFilePath: firstPath,
      readyEvent: readyEvent(),
    });
    appendFileSync(firstPath, '{"corrupt":true}\n', "utf8");
    expect(() => openFileRuntimeSessionWalV1({ walFilePath: firstPath })).toThrow(
      "RUNTIME_SESSION_WAL_CORRUPT",
    );

    const secondPath = path.join(directory, "second", "runtime-session.wal.ndjson");
    createFileRuntimeSessionWalV1({
      walFilePath: secondPath,
      readyEvent: readyEvent(),
    });
    const row = JSON.parse(readFileSync(secondPath, "utf8")) as Record<string, unknown>;
    row.sequence = 2;
    writeFileSync(secondPath, `${stringifyCanonicalJson(row)}\n`, "utf8");
    expect(() => openFileRuntimeSessionWalV1({ walFilePath: secondPath })).toThrow(
      "RUNTIME_SESSION_WAL_CORRUPT",
    );
  });

  it("rejects relative paths, symlinks, broad file modes, and a second creator", async () => {
    expect(() => createFileRuntimeSessionWalV1({
      walFilePath: "relative/runtime-session.wal.ndjson",
      readyEvent: readyEvent(),
    })).toThrow("absolute walFilePath");

    const directory = await temporaryDirectory();
    const walFilePath = path.join(directory, "session", "runtime-session.wal.ndjson");
    createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    expect(() => createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    })).toThrow("RUNTIME_SESSION_WAL_EXISTS");

    chmodSync(walFilePath, 0o644);
    expect(() => openFileRuntimeSessionWalV1({ walFilePath })).toThrow(
      "RUNTIME_SESSION_WAL_PERMISSION_INVALID",
    );
    chmodSync(walFilePath, 0o600);

    const symlinkPath = path.join(directory, "runtime-session-link.wal.ndjson");
    symlinkSync(walFilePath, symlinkPath);
    expect(() => openFileRuntimeSessionWalV1({ walFilePath: symlinkPath })).toThrow(
      "RUNTIME_SESSION_WAL_PATH_INVALID",
    );
  });

  it("detects an external owner change before appending from a stale handle", async () => {
    const directory = await temporaryDirectory();
    const walFilePath = path.join(directory, "session", "runtime-session.wal.ndjson");
    const first = createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    const stale = openFileRuntimeSessionWalV1({ walFilePath });
    const firstRequest = request("runtime-request-first", 1);
    first.appendCommittedRequest({
      request: firstRequest,
      receipt: rejectedReceipt(firstRequest),
    });
    const staleRequest = request("runtime-request-stale", 1);
    expect(() => stale.appendCommittedRequest({
      request: staleRequest,
      receipt: rejectedReceipt(staleRequest),
    })).toThrow("RUNTIME_SESSION_WAL_OWNER_CONFLICT");
  });

  it("serializes through a live-owner lock and recovers a dead-owner lock", async () => {
    const directory = await temporaryDirectory();
    const walFilePath = path.join(directory, "session", "runtime-session.wal.ndjson");
    const wal = createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    const lockFilePath = `${walFilePath}.lock`;
    const liveLock = {
      kind: "worldkit-runtime-session-wal-owner-lock",
      schemaVersion: 1,
      processId: process.pid,
      nonce: "live-owner",
    } as const;
    writeFileSync(
      lockFilePath,
      `${stringifyCanonicalJson(liveLock)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    const firstRequest = request("runtime-request-locked", 1);
    expect(() => wal.appendCommittedRequest({
      request: firstRequest,
      receipt: rejectedReceipt(firstRequest),
    })).toThrow("RUNTIME_SESSION_WAL_BUSY");

    const deadLock = {
      ...liveLock,
      processId: 2_147_483_647,
      nonce: "dead-owner",
    };
    writeFileSync(
      lockFilePath,
      `${stringifyCanonicalJson(deadLock)}\n`,
      "utf8",
    );
    wal.appendCommittedRequest({
      request: firstRequest,
      receipt: rejectedReceipt(firstRequest),
    });
    expect(wal.snapshot().committedRequests).toHaveLength(1);
    expect(existsSync(lockFilePath)).toBe(false);
  });
});
