import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createBabylonGameplayWorldPortV1,
  type BabylonWorldRuntime,
} from "@whitebox-world/runtime-babylon";
import {
  RuntimeHost,
  type GameplayWorldPortV1,
} from "@whitebox-world/runtime-host";
import { parseWorldRuntimeSnapshotV4 } from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createHeadlessRuntimeSessionForTestV1,
  loadHeadlessWorldPackageV1,
  type HeadlessRuntimeOwnershipSnapshotV1,
  type HeadlessRuntimeSessionFactoriesV1,
  type HeadlessRuntimeSessionV1,
} from "./headless-runtime-session";
import {
  buildWorldPackageDirectoryV1,
  loadRuntimeWorldConfigurationFromPackageDirectoryV1,
} from "./world-package-cli";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const BASIC_WORLD_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/basic-world.json",
);
const G_BOT_WORLD_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/g-bot-subject-world.json",
);

let temporaryRoot: string;
let basicPackagePath: string;
let gBotPackagePath: string;

function expectPackageCommandSuccess(
  result: Awaited<ReturnType<typeof buildWorldPackageDirectoryV1>>,
): asserts result is Extract<typeof result, { ok: true }> {
  if (!result.ok) throw new Error(JSON.stringify(result));
}

async function loadedBasicPackage() {
  const loaded = await loadRuntimeWorldConfigurationFromPackageDirectoryV1({
    packageDirectoryPath: basicPackagePath,
  });
  if (!("runtimeWorldConfiguration" in loaded)) {
    throw new Error(JSON.stringify(loaded.result));
  }
  if (loaded.verifiedDirectory.kind !== "canonical-execution-plan") {
    throw new Error("Expected a Canonical Scene Source package.");
  }
  return Object.freeze({
    ...loaded,
    verifiedDirectory: loaded.verifiedDirectory,
  });
}

function inputFor(
  loaded: Awaited<ReturnType<typeof loadedBasicPackage>>,
  suffix: string,
) {
  return {
    runtimeSessionId: `runtime-session.${suffix}`,
    initialWorldSessionId: `world-session.${suffix}`,
    runtimeWorldConfiguration: loaded.runtimeWorldConfiguration,
    verifiedDirectory: loaded.verifiedDirectory,
  } as const;
}

function finalOwnershipSnapshot(
  snapshots: readonly HeadlessRuntimeOwnershipSnapshotV1[],
): HeadlessRuntimeOwnershipSnapshotV1 {
  const snapshot = snapshots.at(-1);
  if (isNil(snapshot)) throw new Error("missing ownership snapshot");
  return snapshot;
}

function throwingCleanupPort(
  runtime: BabylonWorldRuntime,
  controllerEntityId: string,
): GameplayWorldPortV1 {
  const port = createBabylonGameplayWorldPortV1(
    runtime,
    controllerEntityId,
  );
  let disposePromise: Promise<void> | undefined;
  return Object.freeze({
    initialize: () => port.initialize(),
    hasEntity: (entityId: string) => port.hasEntity(entityId),
    isEntityControllable: (entityId: string) =>
      port.isEntityControllable(entityId),
    isActionAvailable: (
      ...args: Parameters<GameplayWorldPortV1["isActionAvailable"]>
    ) => port.isActionAvailable(...args),
    prepareGameplayTransition: (
      ...args: Parameters<GameplayWorldPortV1["prepareGameplayTransition"]>
    ) => port.prepareGameplayTransition(...args),
    estimateFixedInputTickCapacity: (
      ...args: Parameters<
        GameplayWorldPortV1["estimateFixedInputTickCapacity"]
      >
    ) => port.estimateFixedInputTickCapacity(...args),
    runFixedInputTick: (
      ...args: Parameters<GameplayWorldPortV1["runFixedInputTick"]>
    ) => port.runFixedInputTick(...args),
    snapshot: () => port.snapshot(),
    dispose: () => {
      if (isNil(disposePromise)) {
        disposePromise = port.dispose().then(() => {
          throw new Error("cleanup sentinel");
        });
      }
      return disposePromise;
    },
  });
}

function failCandidateReadyGate(): () => Promise<void> {
  return async () => {
    throw new Error("candidate ready sentinel");
  };
}

async function expectCreationFailure(
  suffix: string,
  code: string,
  factories: HeadlessRuntimeSessionFactoriesV1,
): Promise<void> {
  const loaded = await loadedBasicPackage();
  const ownershipSnapshots: HeadlessRuntimeOwnershipSnapshotV1[] = [];
  const failure = await createHeadlessRuntimeSessionForTestV1(
    inputFor(loaded, suffix),
    {
      ...factories,
      onOwnershipSnapshot: (snapshot) => ownershipSnapshots.push(snapshot),
    },
  ).catch((error) => error as Error & {
    code?: string;
    cleanupDiagnostics?: readonly unknown[];
  });
  expect(failure).toMatchObject({ code });
  expect(finalOwnershipSnapshot(ownershipSnapshots)).toMatchObject({
    phase: "failed",
    activeResourceIds: [],
  });
}

beforeAll(async () => {
  temporaryRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), "headless-runtime-session-")),
  );
  basicPackagePath = path.join(temporaryRoot, "basic.package");
  gBotPackagePath = path.join(temporaryRoot, "g-bot.package");
  const basic = await buildWorldPackageDirectoryV1({
    inputPath: BASIC_WORLD_PATH,
    outputDirectoryPath: basicPackagePath,
  });
  const gBot = await buildWorldPackageDirectoryV1({
    inputPath: G_BOT_WORLD_PATH,
    outputDirectoryPath: gBotPackagePath,
  });
  expectPackageCommandSuccess(basic);
  expectPackageCommandSuccess(gBot);
}, 30_000);

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe("headless Babylon Runtime Session", () => {
  it("reaches the real basic-world Ready Gate and disposes every owner exactly once", async () => {
    const session = await loadHeadlessWorldPackageV1({
      packageDirectoryPath: basicPackagePath,
      runtimeSessionId: "runtime-session.basic-ready",
      initialWorldSessionId: "world-session.basic-ready",
    });
    const snapshot = session.snapshot();
    expect(snapshot).toMatchObject({
      kind: "worldkit-runtime-snapshot",
      schemaVersion: 4,
      runtimeSessionId: "runtime-session.basic-ready",
      worldSessionId: "world-session.basic-ready",
      world: { simulationTick: 0 },
      view: {
        viewStateRevision: 1,
        camera: { mode: "tracking", targetEntityId: "player" },
      },
      runtime: { phase: "ready", fixedTimeStepSeconds: 1 / 60 },
      resources: { phase: "ready" },
    });
    expect(parseWorldRuntimeSnapshotV4(snapshot)).toEqual(snapshot);
    expect(session.worldPackageRootHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(session.ownershipSnapshot()).toMatchObject({
      phase: "ready",
      activeResourceIds: [
        "babylon-engine",
        "babylon-scene-runtime",
        "gameplay-world-port",
        "package-asset-resolver",
        "runtime-host",
      ],
    });

    const firstClose = session.dispose();
    const secondClose = session.dispose();
    expect(secondClose).toBe(firstClose);
    await firstClose;
    expect(session.ownershipSnapshot()).toMatchObject({
      phase: "disposed",
      activeResourceIds: [],
      releaseOrder: [
        "babylon-engine",
        "babylon-scene-runtime",
        "gameplay-world-port",
        "runtime-host",
        "package-asset-resolver",
      ],
    });
  }, 30_000);

  it("loads the real G Bot exclusively from verified Package bytes", async () => {
    const session = await loadHeadlessWorldPackageV1({
      packageDirectoryPath: gBotPackagePath,
      runtimeSessionId: "runtime-session.g-bot",
      initialWorldSessionId: "world-session.g-bot",
    });
    try {
      expect(session.resolvedSubjectAssetRefs()).toEqual([
        "worldkit://subject-asset/actor.humanoid.g-bot@2",
      ]);
      expect(session.snapshot().world.subjectStatesByEntityId).toHaveProperty(
        "g-bot-primary",
      );
    } finally {
      await session.dispose();
    }
  }, 30_000);

  it("publishes a staged verified Package through RuntimeHost and snapshots only the new tick-zero Runtime", async () => {
    const initial = await loadedBasicPackage();
    const candidate = await loadRuntimeWorldConfigurationFromPackageDirectoryV1({
      packageDirectoryPath: gBotPackagePath,
    });
    if (!("runtimeWorldConfiguration" in candidate)) {
      throw new Error(JSON.stringify(candidate.result));
    }
    if (candidate.verifiedDirectory.kind !== "canonical-execution-plan") {
      throw new Error("Expected a Canonical replacement WorldPackage.");
    }
    const session = await createHeadlessRuntimeSessionForTestV1(
      inputFor(initial, "full-reload"),
      {},
    );
    try {
      const previous = session.snapshot();
      const releaseStage = session.stageVerifiedWorldPackageV1({
        worldConfiguration: candidate.runtimeWorldConfiguration,
        verifiedDirectory: candidate.verifiedDirectory,
      });
      const result = await session.publishWorldReplacementV1({
        worldConfiguration: candidate.runtimeWorldConfiguration,
        publication: {
          requestId: "request.full-reload.headless",
          requestHash: `sha256:${"a".repeat(64)}`,
          fencingToken: "fence.full-reload.headless",
          runtimeExpectation: {
            runtimeSessionId: session.runtimeSessionId,
            expectedWorldSessionId: previous.worldSessionId,
            expectedWorldPackageRootHash: session.worldPackageRootHash,
            targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
          },
        },
        persistDurableCommit: () => () => undefined,
      });
      releaseStage();
      if (result.status === "rejected") {
        throw new Error(JSON.stringify(result));
      }

      expect(result).toMatchObject({
        status: "published",
        current: {
          runtimeSessionId: session.runtimeSessionId,
          simulationTick: 0,
          worldPackageRootHash:
            candidate.runtimeWorldConfiguration.worldBuildIdentity
              .worldPackageRootHash,
        },
        cleanup: { status: "released" },
      });
      const snapshot = session.snapshot();
      expect(snapshot.worldSessionId).not.toBe(previous.worldSessionId);
      expect(snapshot.world.simulationTick).toBe(0);
      expect(snapshot.world.subjectStatesByEntityId).toHaveProperty("g-bot-primary");
      expect(session.resolvedSubjectAssetRefs()).toEqual([
        "worldkit://subject-asset/actor.humanoid.g-bot@2",
      ]);
    } finally {
      await session.dispose();
    }
  }, 30_000);

  it("produces the same 60 fixed ticks under 30/60/120-like submission timing", async () => {
    const sessions: HeadlessRuntimeSessionV1[] = [];
    try {
      for (const suffix of ["timing-30", "timing-60", "timing-120"]) {
        sessions.push(await loadHeadlessWorldPackageV1({
          packageDirectoryPath: basicPackagePath,
          runtimeSessionId: `runtime-session.${suffix}`,
          initialWorldSessionId: `world-session.${suffix}`,
        }));
      }
      for (let index = 0; index < 30; index += 1) {
        await sessions[0]!.runFixedInput({ actions: ["move-forward"], ticks: 2 });
      }
      for (let index = 0; index < 60; index += 1) {
        await sessions[1]!.runFixedInput({ actions: ["move-forward"], ticks: 1 });
      }
      for (let index = 0; index < 120; index += 1) {
        await sessions[2]!.runFixedInput({
          actions: ["move-forward"],
          ticks: index % 2 === 0 ? 1 : 0,
        });
      }
      const snapshots = sessions.map((session) => session.snapshot());
      expect(snapshots.map((snapshot) => snapshot.world.simulationTick)).toEqual([
        60,
        60,
        60,
      ]);
      expect(
        snapshots.map((snapshot) =>
          snapshot.world.subjectStatesByEntityId.player?.entityState
        ),
      ).toEqual([
        snapshots[0]!.world.subjectStatesByEntityId.player?.entityState,
        snapshots[0]!.world.subjectStatesByEntityId.player?.entityState,
        snapshots[0]!.world.subjectStatesByEntityId.player?.entityState,
      ]);
    } finally {
      await Promise.all(sessions.map((session) => session.dispose()));
    }
  }, 30_000);

  it("keeps two real Runtime instances isolated", async () => {
    const first = await loadHeadlessWorldPackageV1({
      packageDirectoryPath: basicPackagePath,
      runtimeSessionId: "runtime-session.isolation-a",
      initialWorldSessionId: "world-session.isolation-a",
    });
    const second = await loadHeadlessWorldPackageV1({
      packageDirectoryPath: basicPackagePath,
      runtimeSessionId: "runtime-session.isolation-b",
      initialWorldSessionId: "world-session.isolation-b",
    });
    try {
      await first.runFixedInput({ actions: ["move-forward"], ticks: 4 });
      expect(first.snapshot().world.simulationTick).toBe(4);
      expect(second.snapshot().world.simulationTick).toBe(0);
      expect(second.snapshot().runtimeSessionId).toBe(
        "runtime-session.isolation-b",
      );
    } finally {
      await Promise.all([first.dispose(), second.dispose()]);
    }
  }, 30_000);

  it("cleans partial construction failures at engine, Havok, Runtime, port, WorldSession, and Ready Gate", async () => {
    await expectCreationFailure("fail-engine", "HEADLESS_RUNTIME_ENGINE_CREATE_FAILED", {
      createEngine: () => {
        throw new Error("engine sentinel");
      },
    });
    await expectCreationFailure("fail-havok", "HEADLESS_RUNTIME_HAVOK_INITIALIZATION_FAILED", {
      onRuntimeInitializationStage: (stage) => {
        if (stage === "havok") throw new Error("havok sentinel");
      },
    });
    await expectCreationFailure("fail-runtime", "HEADLESS_RUNTIME_CREATE_FAILED", {
      createBabylonRuntime: async () => {
        throw new Error("runtime sentinel");
      },
    });
    await expectCreationFailure("fail-port", "HEADLESS_RUNTIME_GAMEPLAY_PORT_CREATE_FAILED", {
      createGameplayWorldPort: () => {
        throw new Error("port sentinel");
      },
    });
    await expectCreationFailure("fail-world-session", "HEADLESS_RUNTIME_WORLD_SESSION_CREATE_FAILED", {
      createRuntimeHost: (input) => RuntimeHost.create({
        ...input,
        gameplayModeFactory: () => {
          throw new Error("WorldSession sentinel");
        },
      }),
    });
    await expectCreationFailure("fail-initial-ready", "HEADLESS_RUNTIME_WORLD_SESSION_CREATE_FAILED", {
      awaitReady: async () => {
        throw new Error("initial ready sentinel");
      },
    });
  }, 30_000);

  it("leaves no retained owner when the Host-owned Candidate readiness gate fails", async () => {
    const loaded = await loadedBasicPackage();
    const ownershipSnapshots: HeadlessRuntimeOwnershipSnapshotV1[] = [];
    const failure = await createHeadlessRuntimeSessionForTestV1(
      inputFor(loaded, "ready-and-cleanup-fail"),
      {
        awaitReady: failCandidateReadyGate(),
        onOwnershipSnapshot: (snapshot) => ownershipSnapshots.push(snapshot),
      },
    ).catch((error) => error as Error & {
      code?: string;
      cleanupDiagnostics?: readonly { code: string }[];
    });
    expect(failure).toMatchObject({
      code: "HEADLESS_RUNTIME_WORLD_SESSION_CREATE_FAILED",
      cleanupDiagnostics: [],
    });
    expect(finalOwnershipSnapshot(ownershipSnapshots)).toMatchObject({
      phase: "failed",
      activeResourceIds: [],
    });
  }, 30_000);

  it("aggregates a close cleanup failure after emptying the ownership ledger", async () => {
    const loaded = await loadedBasicPackage();
    const session = await createHeadlessRuntimeSessionForTestV1(
      inputFor(loaded, "close-cleanup-fail"),
      { createGameplayWorldPort: throwingCleanupPort },
    );
    await expect(session.dispose()).rejects.toMatchObject({
      code: "HEADLESS_RUNTIME_SESSION_CLEANUP_FAILED",
      diagnostics: [{ code: "HEADLESS_RUNTIME_HOST_DISPOSE_FAILED" }],
    });
    expect(session.ownershipSnapshot()).toMatchObject({
      phase: "disposed",
      activeResourceIds: [],
    });
  }, 30_000);

  it("starts the next Runtime only after the previous ownership ledger is empty", async () => {
    const first = await loadHeadlessWorldPackageV1({
      packageDirectoryPath: basicPackagePath,
      runtimeSessionId: "runtime-session.sequential-a",
      initialWorldSessionId: "world-session.sequential-a",
    });
    await first.dispose();
    expect(first.ownershipSnapshot().activeResourceIds).toEqual([]);

    const second = await loadHeadlessWorldPackageV1({
      packageDirectoryPath: basicPackagePath,
      runtimeSessionId: "runtime-session.sequential-b",
      initialWorldSessionId: "world-session.sequential-b",
    });
    await second.dispose();
    expect(second.ownershipSnapshot().activeResourceIds).toEqual([]);
  }, 30_000);
});
