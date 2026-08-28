import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  deriveGameplayCommandHashV1,
  deriveGameplayCommandReceiptIdV1,
  deriveWorldStateSnapshotRefV1,
  type GameplayCommandReceiptV1,
  type GameplayCommandV1,
} from "@whitebox-world/gameplay-contracts";
import {
  canonicalRuntimeSessionReceiptV1,
  type FixedInputV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
  type WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import { afterEach, describe, expect, it } from "vitest";

import type { HeadlessRuntimeSessionV1 } from "./headless-runtime-session";
import {
  openFileRuntimeSessionWalV1,
} from "./runtime-session-wal";
import {
  createRuntimeSessionExecutorForTestV1,
  resumeRuntimeSessionExecutorForTestV1,
  type AdmittedRuntimeSessionPackageV1,
  type RuntimeSessionExecutorFactoriesV1,
} from "./runtime-session-executor";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const WORLD_PACKAGE_REF =
  `package://world-package/sha256/${"a".repeat(64)}` as const;
const RUNTIME_SESSION_ID = "runtime-session.executor";
const WORLD_SESSION_ID = "world-session.executor";
const CONTROLLER_ENTITY_ID = "controller-runtime-session";
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "runtime-executor-"));
  temporaryDirectories.push(directory);
  return directory;
}

function snapshotFixture(tick = 0): WorldRuntimeSnapshotV4 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId: WORLD_SESSION_ID,
    world: {
      publicationEpoch: 0,
      simulationTick: tick,
      worldStateRef: deriveWorldStateSnapshotRefV1({
        runtimeSessionId: RUNTIME_SESSION_ID,
        worldSessionId: WORLD_SESSION_ID,
        worldStateHash: HASH_A,
      }),
      worldStateHash: HASH_A,
      subjectStatesByEntityId: {
        player: {
          entityState: {
            id: "player",
            kind: "spatial-entity-state",
            entityDefinitionRef:
              "worldkit://subject-definition/humanoid.third-person@1",
            entityDefinitionHash: HASH_B,
            semanticClassId: "subject.humanoid.player",
            lifecycleMode: "active",
            positionMetersXYZ: [0, 1, tick],
            rotationQuaternionXYZW: [0, 0, 0, 1],
            scaleRatioXYZ: [1, 1, 1],
            linearVelocityMetersPerSecondXYZ: [0, 0, 0],
          },
          capabilityStatesById: {},
        },
      },
      gameplayInspection: {
        kind: "worldkit-gameplay-inspection-snapshot",
        schemaVersion: 1,
        projection: "inspection",
        id: `gameplay-inspection:${WORLD_SESSION_ID}:${tick}`,
        runtimeSessionId: RUNTIME_SESSION_ID,
        worldSessionId: WORLD_SESSION_ID,
        gameplayModeRef: "worldkit://gameplay-mode/outdoor.default@1",
        phase: "ready",
        simulationTick: tick,
        participantStatesById: {},
        controllerStatesById: {},
        relationshipStatesById: {},
        activeActionStatesById: {},
        activatedGameplayFeatureRefs: [],
        lastEventSequence: 0,
      },
    },
    view: {
      viewStateRevision: tick,
      camera: { mode: "unbound" },
    },
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

const gameplayCommand = {
  schemaVersion: 1,
  id: "gameplay-command.executor",
  runtimeSessionId: RUNTIME_SESSION_ID,
  worldSessionId: WORLD_SESSION_ID,
  controllerEntityId: CONTROLLER_ENTITY_ID,
  type: "control.release",
  expectedPossession: {
    mode: "possessed",
    controlledEntityId: "player",
  },
} as const satisfies GameplayCommandV1;

function gameplayReceipt(
  command: GameplayCommandV1,
  tick: number,
): GameplayCommandReceiptV1 {
  const body = {
    kind: "worldkit-gameplay-command-receipt",
    schemaVersion: 1,
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId: WORLD_SESSION_ID,
    commandId: command.id,
    commandHash: deriveGameplayCommandHashV1(command),
    commandType: command.type,
    status: "committed",
    simulationTick: tick,
    eventIds: [],
    worldStateAfterRef: deriveWorldStateSnapshotRefV1({
      runtimeSessionId: RUNTIME_SESSION_ID,
      worldSessionId: WORLD_SESSION_ID,
      worldStateHash: HASH_A,
    }),
    worldStateAfterHash: HASH_A,
  } as const;
  return {
    id: deriveGameplayCommandReceiptIdV1(body),
    ...body,
  };
}

class FakeHeadlessRuntimeSession implements HeadlessRuntimeSessionV1 {
  readonly runtimeSessionId = RUNTIME_SESSION_ID;
  readonly initialWorldSessionId = WORLD_SESSION_ID;
  readonly worldPackageRef = WORLD_PACKAGE_REF;
  readonly worldPackageRootHash = HASH_A;
  readonly worldBuildIdentityHash = HASH_B;
  readonly fixedInputControllerEntityId = CONTROLLER_ENTITY_ID;
  readonly calls: string[] = [];
  disposeCount = 0;
  activeOperations = 0;
  maximumActiveOperations = 0;
  tick = 0;
  failFixedInput = false;
  divergentFixedInput = false;
  fixedInputBarrier: Promise<void> | undefined;

  snapshot(): WorldRuntimeSnapshotV4 {
    this.calls.push("snapshot");
    return snapshotFixture(this.tick);
  }

  async executeGameplayCommand(
    command: GameplayCommandV1,
  ): Promise<GameplayCommandReceiptV1> {
    this.calls.push(`command:${command.id}`);
    this.tick += 1;
    return gameplayReceipt(command, this.tick);
  }

  async runFixedInput(input: FixedInputV1): Promise<WorldRuntimeSnapshotV4> {
    this.calls.push(`input:${input.ticks}`);
    this.activeOperations += 1;
    this.maximumActiveOperations = Math.max(
      this.maximumActiveOperations,
      this.activeOperations,
    );
    try {
      if (this.failFixedInput) throw new Error("fixed-input sentinel");
      await this.fixedInputBarrier;
      this.tick += input.ticks + (this.divergentFixedInput ? 1 : 0);
      return snapshotFixture(this.tick);
    } finally {
      this.activeOperations -= 1;
    }
  }

  eventsAfter(afterEventSequence: number, maximumEventCount: number) {
    this.calls.push(`events:${afterEventSequence}:${maximumEventCount}`);
    return [];
  }

  resolvedSubjectAssetRefs(): readonly string[] {
    return [];
  }

  ownershipSnapshot() {
    return {
      kind: "worldkit-headless-runtime-ownership-snapshot" as const,
      schemaVersion: 1 as const,
      phase: "ready" as const,
      activeResourceIds: [],
      releaseOrder: [],
    };
  }

  async dispose(): Promise<void> {
    this.calls.push("dispose");
    this.disposeCount += 1;
  }
}

function admittedPackage(
  sessions: FakeHeadlessRuntimeSession[],
  configure?: (session: FakeHeadlessRuntimeSession) => void,
): AdmittedRuntimeSessionPackageV1 {
  return {
    worldPackageRef: WORLD_PACKAGE_REF,
    worldPackageRootHash: HASH_A,
    worldBuildIdentityHash: HASH_B,
    createSession: async ({ runtimeSessionId, initialWorldSessionId }) => {
      expect(runtimeSessionId).toBe(RUNTIME_SESSION_ID);
      expect(initialWorldSessionId).toBe(WORLD_SESSION_ID);
      const session = new FakeHeadlessRuntimeSession();
      configure?.(session);
      sessions.push(session);
      return session;
    },
  };
}

function factories(
  sessions: FakeHeadlessRuntimeSession[],
  configure?: (session: FakeHeadlessRuntimeSession) => void,
  overrides: Partial<RuntimeSessionExecutorFactoriesV1> = {},
): RuntimeSessionExecutorFactoriesV1 {
  return {
    admitPackage: async () => admittedPackage(sessions, configure),
    ...overrides,
  };
}

type RequestInputV1 = RuntimeSessionRequestV1 extends infer Request
  ? Request extends RuntimeSessionRequestV1
    ? Omit<Request, "kind" | "schemaVersion" | "runtimeSessionId">
    : never
  : never;

function request(
  value: RequestInputV1,
): RuntimeSessionRequestV1 {
  return {
    kind: "worldkit-runtime-session-request",
    schemaVersion: 1,
    runtimeSessionId: RUNTIME_SESSION_ID,
    ...value,
  } as RuntimeSessionRequestV1;
}

function createInput(directory: string) {
  return {
    packageDirectoryPath: path.join(directory, "package"),
    walFilePath: path.join(directory, "session", "runtime-session.wal.ndjson"),
    runtimeSessionId: RUNTIME_SESSION_ID,
    initialWorldSessionId: WORLD_SESSION_ID,
  } as const;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("Runtime Session executor V1", () => {
  it("executes and durably receipts every closed Request branch", async () => {
    const directory = await temporaryDirectory();
    const input = createInput(directory);
    const sessions: FakeHeadlessRuntimeSession[] = [];
    const executor = await createRuntimeSessionExecutorForTestV1(
      input,
      factories(sessions),
    );

    const requests = [
      request({ id: "request-command", type: "gameplay-command.execute", command: gameplayCommand }),
      request({ id: "request-input", type: "fixed-input.run", input: { actions: ["move-forward"], ticks: 2 } }),
      request({ id: "request-snapshot", type: "snapshot.get" }),
      request({ id: "request-events", type: "events.get", query: { afterEventSequence: 0, maximumEventCount: 4 } }),
      request({ id: "request-close", type: "session.close" }),
    ] as const;
    const receipts: RuntimeSessionReceiptV1[] = [];
    for (const item of requests) receipts.push(await executor.execute(item));

    expect(receipts.map(({ requestType, status }) => [requestType, status])).toEqual([
      ["gameplay-command.execute", "succeeded"],
      ["fixed-input.run", "succeeded"],
      ["snapshot.get", "succeeded"],
      ["events.get", "succeeded"],
      ["session.close", "succeeded"],
    ]);
    expect(sessions[0]?.calls).toEqual([
      "command:gameplay-command.executor",
      "snapshot",
      "input:2",
      "snapshot",
      "events:0:5",
      "dispose",
    ]);
    expect(sessions[0]?.disposeCount).toBe(1);
    const wal = openFileRuntimeSessionWalV1({ walFilePath: input.walFilePath });
    expect(wal.snapshot().committedRequests).toHaveLength(5);
    expect(wal.snapshot().finalEvent?.type).toBe("completed");
  });

  it("serializes concurrent requests and never overlaps Runtime mutation", async () => {
    const directory = await temporaryDirectory();
    const sessions: FakeHeadlessRuntimeSession[] = [];
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const executor = await createRuntimeSessionExecutorForTestV1(
      createInput(directory),
      factories(sessions, (session) => {
        session.fixedInputBarrier = barrier;
      }),
    );
    const first = executor.execute(request({
      id: "request-first",
      type: "fixed-input.run",
      input: { actions: [], ticks: 1 },
    }));
    const second = executor.execute(request({
      id: "request-second",
      type: "fixed-input.run",
      input: { actions: [], ticks: 1 },
    }));
    await Promise.resolve();
    await Promise.resolve();
    expect(sessions[0]?.calls).toEqual(["input:1"]);
    release();
    await Promise.all([first, second]);
    expect(sessions[0]?.maximumActiveOperations).toBe(1);
  });

  it("returns byte-identical duplicate replay and a stable changed-hash conflict", async () => {
    const directory = await temporaryDirectory();
    const sessions: FakeHeadlessRuntimeSession[] = [];
    const executor = await createRuntimeSessionExecutorForTestV1(
      createInput(directory),
      factories(sessions),
    );
    const original = request({
      id: "request-input",
      type: "fixed-input.run",
      input: { actions: [], ticks: 2 },
    });
    const first = await executor.execute(original);
    const replay = await executor.execute(original);
    const conflict = await executor.execute(request({
      id: original.id,
      type: "fixed-input.run",
      input: { actions: [], ticks: 3 },
    }));

    expect(canonicalRuntimeSessionReceiptV1(replay)).toBe(
      canonicalRuntimeSessionReceiptV1(first),
    );
    expect(sessions[0]?.calls.filter((entry) => entry === "input:2")).toHaveLength(1);
    expect(conflict).toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_SESSION_REQUEST_ID_CONFLICT" },
    });
  });

  it("durably rejects a thrown mutation and fails the Session closed", async () => {
    const directory = await temporaryDirectory();
    const input = createInput(directory);
    const sessions: FakeHeadlessRuntimeSession[] = [];
    const executor = await createRuntimeSessionExecutorForTestV1(
      input,
      factories(sessions, (session) => {
        session.failFixedInput = true;
      }),
    );
    const failedRequest = request({
      id: "request-failed",
      type: "fixed-input.run",
      input: { actions: [], ticks: 1 },
    });
    const receipt = await executor.execute(failedRequest);

    expect(receipt).toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_SESSION_INTERNAL_FAILURE" },
    });
    expect(sessions[0]?.disposeCount).toBe(1);
    expect(openFileRuntimeSessionWalV1({ walFilePath: input.walFilePath })
      .snapshot().finalEvent).toMatchObject({ type: "failed" });
    expect(canonicalRuntimeSessionReceiptV1(await executor.execute(failedRequest))).toBe(
      canonicalRuntimeSessionReceiptV1(receipt),
    );
    expect(await executor.execute(request({
      id: "request-after-failure",
      type: "snapshot.get",
    }))).toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_SESSION_NOT_ACTIVE" },
    });
  });

  it("re-executes after a crash before WAL append", async () => {
    const directory = await temporaryDirectory();
    const input = createInput(directory);
    const sessions: FakeHeadlessRuntimeSession[] = [];
    const crashRequest = request({
      id: "request-crash-before",
      type: "fixed-input.run",
      input: { actions: [], ticks: 2 },
    });
    const crashed = await createRuntimeSessionExecutorForTestV1(
      input,
      factories(sessions, undefined, {
        afterRuntimeResult: ({ request: completed }) => {
          if (completed.id === crashRequest.id) throw new Error("simulated crash before append");
        },
      }),
    );
    await expect(crashed.execute(crashRequest)).rejects.toThrow("simulated crash before append");
    expect(openFileRuntimeSessionWalV1({ walFilePath: input.walFilePath })
      .snapshot().committedRequests).toHaveLength(0);

    const resumed = await resumeRuntimeSessionExecutorForTestV1(
      { packageDirectoryPath: input.packageDirectoryPath, walFilePath: input.walFilePath },
      factories(sessions),
    );
    await resumed.execute(crashRequest);
    expect(sessions[1]?.calls).toContain("input:2");
  });

  it("reconstructs committed mutations after a post-WAL crash and skips observations", async () => {
    const directory = await temporaryDirectory();
    const input = createInput(directory);
    const sessions: FakeHeadlessRuntimeSession[] = [];
    const command = request({
      id: "request-command-replay",
      type: "gameplay-command.execute",
      command: gameplayCommand,
    });
    const fixed = request({
      id: "request-fixed",
      type: "fixed-input.run",
      input: { actions: [], ticks: 2 },
    });
    const snapshot = request({ id: "request-snapshot", type: "snapshot.get" });
    const events = request({
      id: "request-events-crash",
      type: "events.get",
      query: { afterEventSequence: 0, maximumEventCount: 4 },
    });
    const crashed = await createRuntimeSessionExecutorForTestV1(
      input,
      factories(sessions, undefined, {
        afterCommittedRequest: ({ request: committed }) => {
          if (committed.id === events.id) throw new Error("simulated crash after append");
        },
      }),
    );
    await crashed.execute(command);
    await crashed.execute(fixed);
    await crashed.execute(snapshot);
    await expect(crashed.execute(events)).rejects.toThrow("simulated crash after append");
    expect(openFileRuntimeSessionWalV1({ walFilePath: input.walFilePath })
      .snapshot().committedRequests).toHaveLength(4);

    const resumed = await resumeRuntimeSessionExecutorForTestV1(
      { packageDirectoryPath: input.packageDirectoryPath, walFilePath: input.walFilePath },
      factories(sessions),
    );
    expect(sessions[1]?.calls).toEqual([
      "command:gameplay-command.executor",
      "snapshot",
      "input:2",
    ]);
    const replay = await resumed.execute(events);
    expect(replay.requestId).toBe(events.id);
    expect(sessions[1]?.calls).toEqual([
      "command:gameplay-command.executor",
      "snapshot",
      "input:2",
    ]);
  });

  it("completes a close transaction interrupted after its Receipt commit", async () => {
    const directory = await temporaryDirectory();
    const input = createInput(directory);
    const sessions: FakeHeadlessRuntimeSession[] = [];
    const close = request({ id: "request-close-crash", type: "session.close" });
    const crashed = await createRuntimeSessionExecutorForTestV1(
      input,
      factories(sessions, undefined, {
        afterCommittedRequest: ({ request: committed }) => {
          if (committed.id === close.id) throw new Error("simulated close crash");
        },
      }),
    );
    await expect(crashed.execute(close)).rejects.toThrow("simulated close crash");
    expect(openFileRuntimeSessionWalV1({ walFilePath: input.walFilePath })
      .snapshot().finalEvent).toBeUndefined();

    const resumed = await resumeRuntimeSessionExecutorForTestV1(
      { packageDirectoryPath: input.packageDirectoryPath, walFilePath: input.walFilePath },
      factories(sessions),
    );
    expect(sessions[1]?.disposeCount).toBe(1);
    expect(openFileRuntimeSessionWalV1({ walFilePath: input.walFilePath })
      .snapshot().finalEvent?.type).toBe("completed");
    expect(canonicalRuntimeSessionReceiptV1(await resumed.execute(close))).toBe(
      canonicalRuntimeSessionReceiptV1(
        openFileRuntimeSessionWalV1({ walFilePath: input.walFilePath })
          .snapshot().committedRequests[0]!.receipt,
      ),
    );
  });

  it("fails closed before ready when replay diverges", async () => {
    const directory = await temporaryDirectory();
    const input = createInput(directory);
    const sessions: FakeHeadlessRuntimeSession[] = [];
    const fixed = request({
      id: "request-diverge",
      type: "fixed-input.run",
      input: { actions: [], ticks: 2 },
    });
    const crashed = await createRuntimeSessionExecutorForTestV1(
      input,
      factories(sessions, undefined, {
        afterCommittedRequest: () => {
          throw new Error("simulated post-commit crash");
        },
      }),
    );
    await expect(crashed.execute(fixed)).rejects.toThrow("simulated post-commit crash");

    await expect(resumeRuntimeSessionExecutorForTestV1(
      { packageDirectoryPath: input.packageDirectoryPath, walFilePath: input.walFilePath },
      factories(sessions, (session) => {
        session.divergentFixedInput = true;
      }),
    )).rejects.toThrow("RUNTIME_SESSION_RECOVERY_DIVERGED");
    expect(sessions[1]?.disposeCount).toBe(1);
    expect(openFileRuntimeSessionWalV1({ walFilePath: input.walFilePath })
      .snapshot().finalEvent).toMatchObject({
        type: "failed",
        diagnostic: { code: "RUNTIME_SESSION_RECOVERY_DIVERGED" },
      });
  });

  it("rejects a different admitted Package Root before Runtime construction", async () => {
    const directory = await temporaryDirectory();
    const input = createInput(directory);
    const sessions: FakeHeadlessRuntimeSession[] = [];
    await createRuntimeSessionExecutorForTestV1(input, factories(sessions));
    await expect(resumeRuntimeSessionExecutorForTestV1(
      { packageDirectoryPath: input.packageDirectoryPath, walFilePath: input.walFilePath },
      {
        admitPackage: async () => ({
          ...admittedPackage(sessions),
          worldPackageRootHash: HASH_B,
          worldPackageRef: `package://world-package/sha256/${"b".repeat(64)}`,
        }),
      },
    )).rejects.toThrow("RUNTIME_SESSION_PACKAGE_MISMATCH");
    expect(sessions).toHaveLength(1);
  });
});
