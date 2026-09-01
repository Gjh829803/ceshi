import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import {
  defineBabylonNativeScene,
  type BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";
import {
  hashNativeEffectiveExecutionBudgetV1,
  type NativeEffectiveExecutionBudgetV1,
  type NativeIsolatedExecutionRequestV1,
  type RuntimeSessionRequestV1,
} from "@whitebox-world/runtime-contracts";
import {
  assembleWorldPackageDirectoryV1,
  assertWorldPackageBuildReceiptV1,
  verifyWorldPackageDirectoryV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { describe, expect, it, vi } from "vitest";

import {
  createBabylonNativeIsolatedRuntimeEntryV1,
  type CreateBabylonNativeIsolatedRuntimeEntryInputV1,
} from "./babylon-native-isolated-runtime-entry";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve(
    "@babylonjs/havok/lib/esm/HavokPhysics.wasm",
  ),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;
const gBotSubjectAssetBytes = new Uint8Array(await readFile(new URL(
  "../../../apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
  import.meta.url,
)));

const CLOUD_RIDGE_PACKAGE_ROOT = new URL(
  "../../../apps/playground/public/world-packages/cloud-ridge/",
  import.meta.url,
);
const CLOUD_RIDGE_SCENE_MODULE_URL = new URL(
  "native/scene.mjs",
  CLOUD_RIDGE_PACKAGE_ROOT,
);

async function verifiedPackage():
Promise<VerifiedBabylonNativeWorldPackageDirectoryV1> {
  const receipt = assertWorldPackageBuildReceiptV1(JSON.parse(
    await readFile(
      new URL("world-package-build-receipt.json", CLOUD_RIDGE_PACKAGE_ROOT),
      "utf8",
    ),
  ));
  const files = await Promise.all(receipt.fileIntegrityEntries.map(
    async ({ path, mediaType }) => ({
      path,
      mediaType,
      bytes: new Uint8Array(await readFile(
        new URL(path, CLOUD_RIDGE_PACKAGE_ROOT),
      )),
    }),
  ));
  const verified = verifyWorldPackageDirectoryV1(
    assembleWorldPackageDirectoryV1({ receipt, files }),
  );
  if (verified.kind !== "babylon-native-scene") throw new Error("unreachable");
  return verified;
}

async function cloudRidgeModule(): Promise<BabylonNativeSceneModuleV1> {
  const imported: { readonly default: BabylonNativeSceneModuleV1 } =
    await import(CLOUD_RIDGE_SCENE_MODULE_URL.href);
  return imported.default;
}

function effectiveBudget(
  verified: VerifiedBabylonNativeWorldPackageDirectoryV1,
): NativeEffectiveExecutionBudgetV1 {
  return {
    scene: verified.manifest.resourceBudget,
    assets: {
      maximumAssetCount: 10,
      maximumAssetBytes: 10_000_000,
      maximumTextureCount: 10,
      maximumTextureBytes: 10_000_000,
    },
    runtime: {
      maximumSceneNodeCount: 1_000,
      maximumMaterialCount: 100,
      maximumShaderCount: 100,
      maximumPhysicsBodyCount: 100,
    },
    process: {
      maximumWallTimeMilliseconds: 60_000,
      maximumCpuTimeMilliseconds: 60_000,
      maximumMemoryBytes: 1_000_000_000,
      maximumProcessCount: 4,
    },
    protocol: {
      maximumInboundMessageBytes: 1_000_000,
      maximumOutboundMessageBytes: 1_000_000,
      maximumReceiptBytes: 1_000_000,
      maximumDiagnosticCount: 100,
      maximumLogBytes: 1_000_000,
    },
  };
}

function isolatedRequest(
  verified: VerifiedBabylonNativeWorldPackageDirectoryV1,
  runtimeSessionId = "runtime.hosted.package-fixture",
): NativeIsolatedExecutionRequestV1 {
  const budget = effectiveBudget(verified);
  return {
    kind: "native-isolated-execution-request",
    schemaVersion: 1,
    id: `native-isolated-execution-request.${runtimeSessionId}`,
    runtimeSessionId,
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    sceneModuleBundleHash: verified.sceneModuleBundleHash,
    nativeSceneContributionHash:
      verified.manifest.sceneSource.nativeSceneContributionHash,
    nativeExecutionTrustProfileRef:
      "worldkit://native-execution-trust-profile/hosted-isolated@1",
    nativeExecutionTrustProfileHash: `sha256:${"a".repeat(64)}`,
    runnerIdentityRef: "worldkit://native-isolation-runner/test@1",
    runnerImageDigest: `sha256:${"b".repeat(64)}`,
    sandboxPolicyHash: `sha256:${"c".repeat(64)}`,
    effectiveBudget: budget,
    effectiveBudgetHash: hashNativeEffectiveExecutionBudgetV1(budget),
    requestedOperation: { mode: "interactive-session" },
    sessionNonce: `nonce.${runtimeSessionId}`,
  };
}

async function entryInput(
  runtimeSessionId = "runtime.hosted.cloud-ridge",
): Promise<CreateBabylonNativeIsolatedRuntimeEntryInputV1> {
  const verified = await verifiedPackage();
  return {
    request: isolatedRequest(verified, runtimeSessionId),
    verifiedWorldPackage: verified,
    moduleLoader: { load: cloudRidgeModule },
    havokWasmBinary,
    subjectAssetResolver: {
      async resolveSubjectAsset() {
        return {
          bytes: gBotSubjectAssetBytes,
          sourceLabel: "memory://cloud-ridge-g-bot",
        };
      },
    },
    engineFactory: () => new NullEngine({
      renderWidth: 640,
      renderHeight: 360,
      textureSize: 512,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    }),
  };
}

type RuntimeSessionRequestBodyV1 = RuntimeSessionRequestV1 extends infer Request
  ? Request extends RuntimeSessionRequestV1
    ? Omit<
        Request,
        "kind" | "schemaVersion" | "id" | "runtimeSessionId"
      >
    : never
  : never;

function protocolRequest(
  runtimeSessionId: string,
  id: string,
  body: RuntimeSessionRequestBodyV1,
): RuntimeSessionRequestV1 {
  return {
    kind: "worldkit-runtime-session-request",
    schemaVersion: 1,
    id,
    runtimeSessionId,
    ...body,
  } as RuntimeSessionRequestV1;
}

describe("Babylon Native isolated Runtime entry", () => {
  it("publishes one initially possessed RuntimeHost session inside the enclave", async () => {
    const input = await entryInput();
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1(input);
    const snapshot = entry.initialSnapshot();

    expect(snapshot.runtimeSessionId).toBe(input.request.runtimeSessionId);
    expect(snapshot.runtime.phase).toBe("ready");
    expect(snapshot.resources.physicsBodyCount).toBe(4);
    expect(snapshot.view).toMatchObject({
      viewStateRevision: 1,
      camera: {
        mode: "tracking",
        targetEntityId:
          input.verifiedWorldPackage.worldRuntimeBootstrap
            .initialControlledEntityId,
      },
    });
    expect(entry.runtimeUsage()).toEqual(expect.objectContaining({
      actualSceneNodeCount: snapshot.resources.meshCount,
      actualPhysicsBodyCount: snapshot.resources.physicsBodyCount,
      actualMaterialCount: expect.any(Number),
      actualShaderCount: expect.any(Number),
    }));
    expect(entry.runtimeUsage().actualMaterialCount).toBeGreaterThan(0);
    expect(Object.values(
      snapshot.world.gameplayInspection.relationshipStatesById,
    )).toEqual([
      expect.objectContaining({
        controlledEntityId:
          input.verifiedWorldPackage.worldRuntimeBootstrap
            .initialControlledEntityId,
      }),
    ]);
    await entry.dispose();
  });

  it("resets through the same RuntimeHost session and atomically replaces the provider handle", async () => {
    const input = await entryInput("runtime.hosted.capture-reset");
    const engines: NullEngine[] = [];
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1({
      ...input,
      engineFactory: () => {
        const engine = new NullEngine({
          renderWidth: 640,
          renderHeight: 360,
          textureSize: 512,
          deterministicLockstep: true,
          lockstepMaxSteps: 4,
        });
        engines.push(engine);
        return engine;
      },
    });
    const before = entry.initialSnapshot();

    const after = await entry.resetForFormalCapture();

    expect(after.runtimeSessionId).toBe(before.runtimeSessionId);
    expect(after.worldSessionId).toBe(
      `${input.request.runtimeSessionId}.world.2`,
    );
    expect(after.worldSessionId).not.toBe(before.worldSessionId);
    expect(after.world.simulationTick).toBe(0);
    expect(after.runtime.phase).toBe("ready");
    expect(Object.values(
      after.world.gameplayInspection.relationshipStatesById,
    )).toEqual([
      expect.objectContaining({
        controlledEntityId:
          input.verifiedWorldPackage.worldRuntimeBootstrap
            .initialControlledEntityId,
      }),
    ]);
    expect(engines).toHaveLength(2);
    expect(engines[0]?.isDisposed).toBe(true);
    expect(engines[1]?.isDisposed).toBe(false);

    await entry.dispose();
    expect(engines[1]?.isDisposed).toBe(true);
  });

  it("keeps the published world active when the reset Candidate cannot allocate an Engine", async () => {
    const input = await entryInput("runtime.hosted.capture-reset-failure");
    const initialEngine = new NullEngine({
      renderWidth: 640,
      renderHeight: 360,
      textureSize: 512,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    });
    let engineRequestCount = 0;
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1({
      ...input,
      engineFactory: () => {
        engineRequestCount += 1;
        if (engineRequestCount === 1) return initialEngine;
        throw new Error("candidate engine unavailable");
      },
    });
    const before = entry.initialSnapshot();

    await expect(entry.resetForFormalCapture()).rejects.toThrow();

    const after = entry.initialSnapshot();
    expect(after.worldSessionId).toBe(before.worldSessionId);
    expect(after.runtime.phase).toBe("ready");
    expect(initialEngine.isDisposed).toBe(false);
    expect(entry.renderFrame().runtimeSessionId).toBe(before.runtimeSessionId);
    await entry.dispose();
    expect(initialEngine.isDisposed).toBe(true);
  });

  it("releases a retained Candidate after readiness fails and permits a retry", async () => {
    const input = await entryInput("runtime.hosted.capture-reset-readiness-failure");
    const engines: NullEngine[] = [];
    let shouldRejectCandidateReadiness = true;
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1({
      ...input,
      engineFactory: () => {
        const engine = new NullEngine({
          renderWidth: 640,
          renderHeight: 360,
          textureSize: 512,
          deterministicLockstep: true,
          lockstepMaxSteps: 4,
        });
        engines.push(engine);
        return engine;
      },
      onInitializationStage(stage) {
        if (
          stage === "ready" && engines.length === 2 &&
          shouldRejectCandidateReadiness
        ) {
          shouldRejectCandidateReadiness = false;
          const candidateScene = engines[1]?.scenes[0];
          if (candidateScene === undefined) throw new Error("candidate scene missing");
          vi.spyOn(candidateScene, "whenReadyAsync").mockRejectedValueOnce(
            new Error("candidate readiness unavailable"),
          );
        }
      },
    });
    const before = entry.initialSnapshot();

    await expect(entry.resetForFormalCapture()).rejects.toThrow();

    expect(entry.initialSnapshot().worldSessionId).toBe(before.worldSessionId);
    expect(engines).toHaveLength(2);
    expect(engines[0]?.isDisposed).toBe(false);
    expect(engines[1]?.isDisposed).toBe(true);

    const afterRetry = await entry.resetForFormalCapture();
    expect(afterRetry.worldSessionId).toBe(
      `${input.request.runtimeSessionId}.world.3`,
    );
    expect(engines).toHaveLength(3);
    expect(engines[0]?.isDisposed).toBe(true);
    expect(engines[2]?.isDisposed).toBe(false);
    await entry.dispose();
    expect(engines[2]?.isDisposed).toBe(true);
  });

  it("keeps the newly published world authoritative when old cleanup reports failure", async () => {
    const input = await entryInput("runtime.hosted.capture-reset-old-cleanup-failure");
    const engines: NullEngine[] = [];
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1({
      ...input,
      engineFactory: () => {
        const engine = new NullEngine({
          renderWidth: 640,
          renderHeight: 360,
          textureSize: 512,
          deterministicLockstep: true,
          lockstepMaxSteps: 4,
        });
        engines.push(engine);
        return engine;
      },
    });
    const oldEngine = engines[0];
    if (oldEngine === undefined) throw new Error("old engine missing");
    const disposeOldEngine = oldEngine.dispose.bind(oldEngine);
    vi.spyOn(oldEngine, "dispose").mockImplementation(() => {
      disposeOldEngine();
      throw new Error("old engine cleanup reported failure");
    });

    await expect(entry.resetForFormalCapture()).rejects.toThrow();

    const after = entry.initialSnapshot();
    expect(after.worldSessionId).toBe(
      `${input.request.runtimeSessionId}.world.2`,
    );
    expect(after.runtime.phase).toBe("ready");
    expect(engines).toHaveLength(2);
    expect(oldEngine.isDisposed).toBe(true);
    expect(engines[1]?.isDisposed).toBe(false);
    expect(entry.renderFrame().runtimeSessionId).toBe(
      input.request.runtimeSessionId,
    );
    await entry.dispose();
    expect(engines[1]?.isDisposed).toBe(true);
  });

  it("keeps display rendering and resize inside BabylonWorldRuntime authority", async () => {
    const input = await entryInput();
    const engine = input.engineFactory(`${input.request.runtimeSessionId}.test`);
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1({
      ...input,
      engineFactory: () => engine,
    });
    const scene = engine.scenes[0];
    if (scene === undefined) throw new Error("Runtime Scene missing");
    const sceneRender = vi.spyOn(scene, "render");
    const engineResize = vi.spyOn(engine, "resize");

    const first = entry.renderFrame();
    const second = entry.renderFrame();
    entry.resize();

    expect(first).toMatchObject({
      runtimeSessionId: input.request.runtimeSessionId,
      simulationTick: 0,
    });
    expect(second.renderFrameIndex).toBe(first.renderFrameIndex + 1);
    expect(sceneRender).toHaveBeenCalledTimes(2);
    expect(engineResize).toHaveBeenCalledOnce();
    await entry.dispose();
  });

  it("routes fixed input, snapshot and close through Runtime Session Protocol V1", async () => {
    const input = await entryInput();
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1(input);
    const runtimeSessionId = input.request.runtimeSessionId;
    const fixed = await entry.submit(protocolRequest(
      runtimeSessionId,
      "request.fixed.001",
      {
        type: "fixed-input.run",
        input: {
          actions: [],
          ticks: 1,
        },
      },
    ));
    expect(fixed).toMatchObject({
      status: "succeeded",
      requestType: "fixed-input.run",
      snapshot: { world: { simulationTick: 1 } },
    });
    if (
      fixed.status !== "succeeded" ||
      fixed.requestType !== "fixed-input.run"
    ) throw new Error("unreachable");
    const controlledEntityId =
      input.verifiedWorldPackage.worldRuntimeBootstrap
        .initialControlledEntityId;
    const controlledSubject =
      fixed.snapshot.world.subjectStatesByEntityId[controlledEntityId];
    const locomotion = Object.values(
      controlledSubject?.capabilityStatesById ?? {},
    ).find((state) => state.kind === "locomotion-capability-state-v2");
    expect(locomotion).toMatchObject({
      kind: "locomotion-capability-state-v2",
      ownerEntityId: controlledEntityId,
      locomotion: {
        status: "active",
        mobilityMode: "grounded",
        gait: "idle",
        supportMode: "supported",
        movementMedium: "ground",
      },
    });
    const snapshot = await entry.submit(protocolRequest(
      runtimeSessionId,
      "request.snapshot.001",
      { type: "snapshot.get" },
    ));
    expect(snapshot).toMatchObject({ status: "succeeded" });
    await expect(entry.submit(protocolRequest(
      runtimeSessionId,
      "request.close.001",
      { type: "session.close" },
    ))).resolves.toMatchObject({
      status: "succeeded",
      closeResult: { mode: "closed" },
    });
    await expect(entry.submit(protocolRequest(
      runtimeSessionId,
      "request.after-close.001",
      { type: "snapshot.get" },
    ))).resolves.toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_SESSION_NOT_ACTIVE" },
    });
  });

  it("rejects Package identity or effective-budget escalation before Engine/Havok", async () => {
    const input = await entryInput();
    const engineFactory = vi.fn(input.engineFactory);
    await expect(createBabylonNativeIsolatedRuntimeEntryV1({
      ...input,
      request: {
        ...input.request,
        sceneModuleBundleHash: `sha256:${"f".repeat(64)}`,
      },
      engineFactory,
    })).rejects.toMatchObject({
      code: "WORLDKIT_NATIVE_ISOLATION_IDENTITY_MISMATCH",
    });
    expect(engineFactory).not.toHaveBeenCalled();

    const escalatedBudget = {
      ...input.request.effectiveBudget,
      scene: {
        ...input.request.effectiveBudget.scene,
        maximumColliders:
          input.verifiedWorldPackage.manifest.resourceBudget.maximumColliders + 1,
      },
    };
    await expect(createBabylonNativeIsolatedRuntimeEntryV1({
      ...input,
      request: {
        ...input.request,
        effectiveBudget: escalatedBudget,
        effectiveBudgetHash:
          hashNativeEffectiveExecutionBudgetV1(escalatedBudget),
      },
      engineFactory,
    })).rejects.toMatchObject({
      code: "WORLDKIT_NATIVE_ISOLATION_IDENTITY_MISMATCH",
    });
    expect(engineFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["material", 1, 100],
    ["shader", 100, 1],
  ] as const)("rejects a %s upper-bound overage before publication", async (
    _resource,
    maximumMaterialCount,
    maximumShaderCount,
  ) => {
    const input = await entryInput();
    const constrainedBudget = {
      ...input.request.effectiveBudget,
      runtime: {
        ...input.request.effectiveBudget.runtime,
        maximumMaterialCount,
        maximumShaderCount,
      },
    };
    const engine = input.engineFactory(`${input.request.runtimeSessionId}.test`);
    const dispose = vi.spyOn(engine, "dispose");
    await expect(createBabylonNativeIsolatedRuntimeEntryV1({
      ...input,
      request: {
        ...input.request,
        effectiveBudget: constrainedBudget,
        effectiveBudgetHash:
          hashNativeEffectiveExecutionBudgetV1(constrainedBudget),
      },
      engineFactory: () => engine,
    })).rejects.toMatchObject({
      diagnostic: { code: "WORLD_SESSION_FAILED" },
    });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("rejects another Runtime Session and conflicting request replay", async () => {
    const input = await entryInput();
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1(input);
    await expect(entry.submit(protocolRequest(
      "runtime.other",
      "request.other.001",
      { type: "snapshot.get" },
    ))).resolves.toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_SESSION_NOT_ACTIVE" },
    });
    const first = protocolRequest(
      input.request.runtimeSessionId,
      "request.replay.001",
      { type: "snapshot.get" },
    );
    const receipt = await entry.submit(first);
    await expect(entry.submit(first)).resolves.toEqual(receipt);
    await expect(entry.submit(protocolRequest(
      input.request.runtimeSessionId,
      first.id,
      { type: "session.close" },
    ))).resolves.toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_SESSION_REQUEST_ID_CONFLICT" },
    });
    await entry.dispose();
  });

  it("keeps two isolated entries independent", async () => {
    const [firstInput, secondInput] = await Promise.all([
      entryInput("runtime.hosted.first"),
      entryInput("runtime.hosted.second"),
    ]);
    const [first, second] = await Promise.all([
      createBabylonNativeIsolatedRuntimeEntryV1(firstInput),
      createBabylonNativeIsolatedRuntimeEntryV1(secondInput),
    ]);
    await first.submit(protocolRequest(
      firstInput.request.runtimeSessionId,
      "request.first.fixed",
      {
        type: "fixed-input.run",
        input: {
          actions: [],
          ticks: 1,
        },
      },
    ));
    expect(first.initialSnapshot().world.simulationTick).toBe(1);
    expect(second.initialSnapshot().world.simulationTick).toBe(0);
    await Promise.all([first.dispose(), second.dispose()]);
  });

  it("disposes the real partial Engine when Native admission fails", async () => {
    const input = await entryInput();
    const engine = input.engineFactory(`${input.request.runtimeSessionId}.test`);
    const dispose = vi.spyOn(engine, "dispose");
    await expect(createBabylonNativeIsolatedRuntimeEntryV1({
      ...input,
      moduleLoader: {
        load: async () => defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "cloud-ridge-native-spike",
          build() {
            throw new Error("private build failure");
          },
        }),
      },
      engineFactory: () => engine,
    })).rejects.toThrow(/WORLD_SESSION_FAILED/);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("retains one idempotent cleanup promise when Engine disposal throws", async () => {
    const input = await entryInput();
    const engine = input.engineFactory(`${input.request.runtimeSessionId}.test`);
    const dispose = vi.spyOn(engine, "dispose").mockImplementation(() => {
      throw new Error("private engine cleanup failure");
    });
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1({
      ...input,
      engineFactory: () => engine,
    });

    const first = entry.dispose();
    const second = entry.dispose();
    expect(second).toBe(first);
    await expect(first).rejects.toThrow(/WORLD_SESSION_FAILED/);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
