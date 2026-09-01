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
  parseRuntimeSessionReceiptV1,
  type RuntimeSessionDiagnosticV1,
  type RuntimeSessionEventV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
  type WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import { deriveWorldStateSnapshotRefV1 } from "@whitebox-world/gameplay-contracts";
import { sha256CanonicalJson, stringifyCanonicalJson } from "@whitebox-world/protocol";
import { afterEach, describe, expect, it } from "vitest";

import {
  createFileRuntimeSessionWalV1,
  openFileRuntimeSessionWalV1,
} from "./runtime-session-wal";

const temporaryDirectories: string[] = [];
const ROOT_HASH = `sha256:${"a".repeat(64)}` as const;
const WORLD_SESSION_ID = "world-session-primary";
const RESET_WORLD_SESSION_ID = "world-session-primary.reset.1";

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
  worldSessionId = WORLD_SESSION_ID,
  diagnosticCode:
    | "RUNTIME_SESSION_NOT_ACTIVE"
    | "RUNTIME_SESSION_RESET_COMMITTED_CLEANUP_FAILURE" =
      "RUNTIME_SESSION_NOT_ACTIVE",
): Extract<RuntimeSessionReceiptV1, { status: "rejected" }> {
  const body = {
    kind: "worldkit-runtime-session-receipt",
    schemaVersion: 1,
    requestId: input.id,
    requestHash: hashRuntimeSessionRequestV1(input),
    runtimeSessionId: input.runtimeSessionId,
    worldSessionId,
    requestType: input.type,
    status: "rejected",
    diagnostic: {
      code: diagnosticCode,
      message: "The Runtime Session is not active.",
    },
  } as const;
  return parseRuntimeSessionReceiptV1({
    id: deriveRuntimeSessionReceiptIdV1(body),
    ...body,
  }) as Extract<RuntimeSessionReceiptV1, { status: "rejected" }>;
}

function completedEvent(
  worldSessionId = WORLD_SESSION_ID,
): Extract<RuntimeSessionEventV1, { type: "completed" }> {
  const body = {
    kind: "worldkit-runtime-session-event",
    schemaVersion: 1,
    protocolVersion: 1,
    sequence: 2,
    runtimeSessionId: "runtime-session-primary",
    worldSessionId,
    type: "completed",
  } as const;
  return {
    id: deriveRuntimeSessionEventIdV1(body),
    ...body,
  };
}

function failedEvent(
  diagnostic: RuntimeSessionDiagnosticV1,
  worldSessionId = WORLD_SESSION_ID,
): Extract<RuntimeSessionEventV1, { type: "failed" }> {
  const body = {
    kind: "worldkit-runtime-session-event",
    schemaVersion: 1,
    protocolVersion: 1,
    sequence: 2,
    runtimeSessionId: "runtime-session-primary",
    worldSessionId,
    type: "failed",
    diagnostic,
  } as const;
  return {
    id: deriveRuntimeSessionEventIdV1(body),
    ...body,
  };
}

function snapshotFixture(worldSessionId: string): WorldRuntimeSnapshotV4 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: "runtime-session-primary",
    worldSessionId,
    world: {
      publicationEpoch: 1,
      simulationTick: 0,
      worldStateRef: deriveWorldStateSnapshotRefV1({
        runtimeSessionId: "runtime-session-primary",
        worldSessionId,
        worldStateHash: ROOT_HASH,
      }),
      worldStateHash: ROOT_HASH,
      subjectStatesByEntityId: {},
      gameplayInspection: {
        kind: "worldkit-gameplay-inspection-snapshot",
        schemaVersion: 1,
        projection: "inspection",
        id: `gameplay-inspection:${worldSessionId}:0`,
        runtimeSessionId: "runtime-session-primary",
        worldSessionId,
        gameplayModeRef: "worldkit://gameplay-mode/outdoor.default@1",
        phase: "ready",
        simulationTick: 0,
        participantStatesById: {},
        controllerStatesById: {},
        relationshipStatesById: {},
        activeActionStatesById: {},
        activatedGameplayFeatureRefs: [],
        lastEventSequence: 0,
      },
    },
    view: { viewStateRevision: 0, camera: { mode: "unbound" } },
    runtime: {
      phase: "ready",
      isPaused: false,
      fixedTimeStepSeconds: 1 / 60,
    },
    resources: {
      phase: "ready",
      meshCount: 1,
      physicsBodyCount: 1,
      terrainSampleCount: 4,
    },
  };
}

function succeededReceipt(
  input: RuntimeSessionRequestV1,
  worldSessionId: string,
  result: Readonly<Record<string, unknown>>,
): RuntimeSessionReceiptV1 {
  const body = {
    kind: "worldkit-runtime-session-receipt",
    schemaVersion: 1,
    requestId: input.id,
    requestHash: hashRuntimeSessionRequestV1(input),
    runtimeSessionId: input.runtimeSessionId,
    worldSessionId,
    requestType: input.type,
    status: "succeeded",
    ...result,
  } as const;
  return {
    id: deriveRuntimeSessionReceiptIdV1(body),
    ...body,
  } as RuntimeSessionReceiptV1;
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

  it("reopens a reset world and binds later support plus close rows to it", async () => {
    const directory = await temporaryDirectory();
    const walFilePath = path.join(
      directory,
      "session",
      "runtime-session.wal.ndjson",
    );
    const wal = createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    const resetRequest = {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-request-reset",
      runtimeSessionId: "runtime-session-primary",
      type: "session.reset",
    } as const satisfies RuntimeSessionRequestV1;
    wal.appendCommittedRequest({
      request: resetRequest,
      receipt: succeededReceipt(
        resetRequest,
        RESET_WORLD_SESSION_ID,
        { snapshot: snapshotFixture(RESET_WORLD_SESSION_ID) },
      ),
    });
    const supportRequest = {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-request-support",
      runtimeSessionId: "runtime-session-primary",
      type: "subject-support.get",
      subjectEntityId: "player",
      expectedSimulationTick: 0,
    } as const satisfies RuntimeSessionRequestV1;
    wal.appendCommittedRequest({
      request: supportRequest,
      receipt: succeededReceipt(supportRequest, RESET_WORLD_SESSION_ID, {
        subjectSupport: {
          kind: "worldkit-runtime-session-subject-support",
          schemaVersion: 1,
          runtimeSessionId: "runtime-session-primary",
          worldSessionId: RESET_WORLD_SESSION_ID,
          subjectEntityId: "player",
          simulationTick: 0,
          mode: "supported",
          sampledControllerCenterMetersXYZ: [0, 1, 0],
          sampledFootPointMetersXYZ: [0, 0, 0],
          pointMetersXYZ: [0, 0, 0],
          normalXYZ: [0, 1, 0],
          distanceMeters: 0,
          colliderId: "ground",
          colliderSubshapeId: "ground.shape",
          logicalSubshapeId: "ground.logical",
          traversalSurfaceId: "ground.surface",
          surfaceEntityId: "ground",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        },
      }),
    });
    wal.appendClosed(completedEvent(RESET_WORLD_SESSION_ID));

    const reopened = openFileRuntimeSessionWalV1({ walFilePath }).snapshot();
    expect(reopened.committedRequests.map(({ request }) => request.type)).toEqual([
      "session.reset",
      "subject-support.get",
    ]);
    expect(reopened.finalEvent?.worldSessionId).toBe(RESET_WORLD_SESSION_ID);
  });

  it("rejects a failed reset that claims a foreign WorldSession", async () => {
    const directory = await temporaryDirectory();
    const walFilePath = path.join(
      directory,
      "session",
      "runtime-session.wal.ndjson",
    );
    const wal = createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    const resetRequest = {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-request-rejected-reset",
      runtimeSessionId: "runtime-session-primary",
      type: "session.reset",
    } as const satisfies RuntimeSessionRequestV1;

    expect(() => wal.appendCommittedRequest({
      request: resetRequest,
      receipt: rejectedReceipt(resetRequest, RESET_WORLD_SESSION_ID),
    })).toThrow("RUNTIME_SESSION_WAL_BINDING_INVALID");
    expect(wal.snapshot().committedRequests).toEqual([]);
  });

  it("closes a committed reset cleanup failure only with its exact failed Event", async () => {
    const directory = await temporaryDirectory();
    const walFilePath = path.join(
      directory,
      "session",
      "runtime-session.wal.ndjson",
    );
    const wal = createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    const resetRequest = {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-request-reset-cleanup-failure",
      runtimeSessionId: "runtime-session-primary",
      type: "session.reset",
    } as const satisfies RuntimeSessionRequestV1;

    const receipt = rejectedReceipt(
      resetRequest,
      RESET_WORLD_SESSION_ID,
      "RUNTIME_SESSION_RESET_COMMITTED_CLEANUP_FAILURE",
    );
    wal.appendCommittedRequest({
      request: resetRequest,
      receipt,
    });
    expect(() => wal.appendClosed(
      completedEvent(RESET_WORLD_SESSION_ID),
    )).toThrow("RUNTIME_SESSION_WAL_BINDING_INVALID");
    expect(() => wal.appendClosed(failedEvent({
      code: receipt.diagnostic.code,
      message: "A different failure message.",
    }, RESET_WORLD_SESSION_ID))).toThrow(
      "RUNTIME_SESSION_WAL_BINDING_INVALID",
    );
    wal.appendClosed(failedEvent(
      receipt.diagnostic,
      RESET_WORLD_SESSION_ID,
    ));

    const reopened = openFileRuntimeSessionWalV1({ walFilePath }).snapshot();
    expect(reopened.committedRequests).toHaveLength(1);
    expect(reopened.committedRequests[0]?.receipt).toMatchObject({
      status: "rejected",
      worldSessionId: RESET_WORLD_SESSION_ID,
      diagnostic: {
        code: "RUNTIME_SESSION_RESET_COMMITTED_CLEANUP_FAILURE",
      },
    });
    expect(reopened.finalEvent).toEqual(failedEvent(
      receipt.diagnostic,
      RESET_WORLD_SESSION_ID,
    ));
  });

  it("rejects a completed Event after an ordinary terminal rejected Receipt", async () => {
    const directory = await temporaryDirectory();
    const walFilePath = path.join(
      directory,
      "session",
      "runtime-session.wal.ndjson",
    );
    const wal = createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    const terminalRequest = request("runtime-request-terminal-failure");
    const terminalReceipt = rejectedReceipt(terminalRequest);
    wal.appendCommittedRequest({
      request: terminalRequest,
      receipt: terminalReceipt,
    });

    expect(() => wal.appendClosed(completedEvent())).toThrow(
      "RUNTIME_SESSION_WAL_BINDING_INVALID",
    );
    expect(() => wal.appendCommittedRequest({
      request: request("runtime-request-after-terminal"),
      receipt: rejectedReceipt(request("runtime-request-after-terminal")),
    })).toThrow("RUNTIME_SESSION_WAL_BINDING_INVALID");
    wal.appendClosed(failedEvent(terminalReceipt.diagnostic));
  });

  it("fails replay closed when completed follows a terminal rejected Receipt", async () => {
    const directory = await temporaryDirectory();
    const walFilePath = path.join(
      directory,
      "session",
      "runtime-session.wal.ndjson",
    );
    const wal = createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    const resetRequest = {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-request-reset-cleanup-replay",
      runtimeSessionId: "runtime-session-primary",
      type: "session.reset",
    } as const satisfies RuntimeSessionRequestV1;
    wal.appendCommittedRequest({
      request: resetRequest,
      receipt: rejectedReceipt(
        resetRequest,
        RESET_WORLD_SESSION_ID,
        "RUNTIME_SESSION_RESET_COMMITTED_CLEANUP_FAILURE",
      ),
    });
    const rows = readFileSync(walFilePath, "utf8").trim().split("\n");
    const committed = JSON.parse(rows.at(-1)!) as {
      readonly transactionHash: `sha256:${string}`;
    };
    const transactionBody = {
      kind: "worldkit-runtime-session-wal-transaction",
      schemaVersion: 1,
      sequence: 3,
      previousTransactionHash: committed.transactionHash,
      type: "session-closed",
      finalEvent: completedEvent(RESET_WORLD_SESSION_ID),
    } as const;
    appendFileSync(walFilePath, `${stringifyCanonicalJson({
      ...transactionBody,
      transactionHash: sha256CanonicalJson(transactionBody),
    })}\n`, "utf8");

    expect(() => openFileRuntimeSessionWalV1({ walFilePath })).toThrow(
      "RUNTIME_SESSION_WAL_CORRUPT",
    );
  });

  it("fails closed when replay contains a rejected reset with a foreign WorldSession", async () => {
    const directory = await temporaryDirectory();
    const walFilePath = path.join(
      directory,
      "session",
      "runtime-session.wal.ndjson",
    );
    createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    const resetRequest = {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-request-replayed-rejected-reset",
      runtimeSessionId: "runtime-session-primary",
      type: "session.reset",
    } as const satisfies RuntimeSessionRequestV1;
    const receipt = rejectedReceipt(resetRequest, RESET_WORLD_SESSION_ID);
    const opened = JSON.parse(
      readFileSync(walFilePath, "utf8").trim(),
    ) as { readonly transactionHash: `sha256:${string}` };
    const transactionBody = {
      kind: "worldkit-runtime-session-wal-transaction",
      schemaVersion: 1,
      sequence: 2,
      previousTransactionHash: opened.transactionHash,
      type: "request-committed",
      request: resetRequest,
      requestHash: hashRuntimeSessionRequestV1(resetRequest),
      receipt,
    } as const;
    appendFileSync(walFilePath, `${stringifyCanonicalJson({
      ...transactionBody,
      transactionHash: sha256CanonicalJson(transactionBody),
    })}\n`, "utf8");

    expect(() => openFileRuntimeSessionWalV1({ walFilePath })).toThrow(
      "RUNTIME_SESSION_WAL_CORRUPT",
    );
  });

  it("rejects committed support whose Subject or Tick does not bind to its Request", async () => {
    const directory = await temporaryDirectory();
    const walFilePath = path.join(
      directory,
      "session",
      "runtime-session.wal.ndjson",
    );
    const wal = createFileRuntimeSessionWalV1({
      walFilePath,
      readyEvent: readyEvent(),
    });
    const supportRequest = {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-request-mismatched-support",
      runtimeSessionId: "runtime-session-primary",
      type: "subject-support.get",
      subjectEntityId: "player",
      expectedSimulationTick: 0,
    } as const satisfies RuntimeSessionRequestV1;
    expect(() => wal.appendCommittedRequest({
      request: supportRequest,
      receipt: succeededReceipt(supportRequest, WORLD_SESSION_ID, {
        subjectSupport: {
          kind: "worldkit-runtime-session-subject-support",
          schemaVersion: 1,
          runtimeSessionId: "runtime-session-primary",
          worldSessionId: WORLD_SESSION_ID,
          subjectEntityId: "another-player",
          simulationTick: 1,
          mode: "supported",
          sampledControllerCenterMetersXYZ: [0, 1, 0],
          sampledFootPointMetersXYZ: [0, 0, 0],
          pointMetersXYZ: [0, 0, 0],
          normalXYZ: [0, 1, 0],
          distanceMeters: 0,
          colliderId: "ground",
          colliderSubshapeId: "ground.shape",
          logicalSubshapeId: "ground.logical",
          traversalSurfaceId: "ground.surface",
          surfaceEntityId: "ground",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        },
      }),
    })).toThrow("RUNTIME_SESSION_WAL_BINDING_INVALID");
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
