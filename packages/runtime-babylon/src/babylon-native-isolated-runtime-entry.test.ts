import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import {
  defineBabylonNativeScene,
  type BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";
import {
  hashFormalSemanticCaptureMapV1,
  hashNativeEffectiveExecutionBudgetV1,
  type FormalWorldCaptureRequestV1,
  type NativeEffectiveExecutionBudgetV1,
  type NativeIsolatedExecutionRequestV1,
  type RuntimeSessionRequestV1,
} from "@whitebox-world/runtime-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
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

function formalRequestFixture(
  verified: VerifiedBabylonNativeWorldPackageDirectoryV1,
): FormalWorldCaptureRequestV1 {
  const hash = (byte: string) => `sha256:${byte.repeat(64)}` as const;
  const fixedInputSequence = [{ actions: ["move-forward"], ticks: 1 }] as const;
  const fixedInputSequenceHash = sha256CanonicalJson(fixedInputSequence) as
    `sha256:${string}`;
  const bounds = {
    minimumMetersXYZ: [-8, -2, -8],
    maximumMetersXYZ: [8, 6, 8],
  } as const;
  const criterion = {
    kind: "reach-bounds",
    checkpointId: "checkpoint",
    expectation: "reach",
    sourceVisualGroupId: "route",
    sourceBoundsMeters: {
      minimumMetersXYZ: [-1, 0, -1],
      maximumMetersXYZ: [1, 2, 1],
    },
    capsuleRadiusMeters: 0.35,
    toleranceMeters: 0.05,
  } as const;
  const semanticCaptureMap = {
    kind: "formal-semantic-capture-map",
    schemaVersion: 1,
    id: "capture.map",
    caseRef: "worldkit://world-reconstruction-case/test@1",
    caseHash: hash("a"),
    authoringManifestHash: hash("b"),
    layoutInventoryHash: hash("c"),
    contributionHash: hash("d"),
    bindings: [
      {
        acceptanceTargetRef: "worldkit://acceptance-target/goal@1",
        compositionTargetRef: "worldkit://composition-target/goal@1",
        topologyNodeId: "goal",
        semanticLayerId: "upper",
        blockVisualGroupId: "goal",
        semanticClassId: "worldkit.native-block.group.goal",
        identityColor: "#112233",
        projectedBoundsSource: "checked-layout-visual-group",
        requiredWorldViewIds: ["opening", "world-side", "world-top-down"],
        authoringManifestHash: hash("b"),
        layoutInventoryHash: hash("c"),
        contributionHash: hash("d"),
      },
      {
        acceptanceTargetRef: "worldkit://acceptance-target/route@1",
        compositionTargetRef: "worldkit://composition-target/route@1",
        topologyNodeId: "route",
        semanticLayerId: "ground",
        blockVisualGroupId: "route",
        semanticClassId: "worldkit.native-block.group.route",
        identityColor: "#AABBCC",
        projectedBoundsSource: "checked-layout-visual-group",
        requiredWorldViewIds: ["opening", "world-side", "world-top-down"],
        authoringManifestHash: hash("b"),
        layoutInventoryHash: hash("c"),
        contributionHash: hash("d"),
      },
    ],
    topologyRelations: [{
      fromNodeId: "goal",
      relation: "connects-to",
      toNodeId: "route",
      measurementSource: "scripted-traversal",
      traversalCheckId: "check",
    }],
    traversalCheckBindings: [{
      traversalCheckId: "check",
      acceptanceTargetRef: "worldkit://acceptance-target/route@1",
      checkExpectation: "pass",
      fixedInputSequenceHash,
      checkpointCriteria: [criterion],
    }],
  } as const;
  const viewBase = {
    kind: "formal-artifact-view-request",
    schemaVersion: 1,
    widthPixels: 640,
    heightPixels: 360,
    devicePixelRatio: 1,
  } as const;
  return {
    kind: "formal-world-capture-request",
    schemaVersion: 1,
    id: "formal.capture.request",
    formalRequestRef: "artifact://case/test/formal-world-capture-request.json",
    caseRef: semanticCaptureMap.caseRef,
    caseHash: semanticCaptureMap.caseHash,
    evaluationProfileRef: "artifact://case/test/evaluation-profile.json",
    evaluationProfileHash: hash("e"),
    sceneAuthoringRouteDecisionRef: "artifact://case/test/route.json",
    sceneAuthoringRouteDecisionHash: hash("f"),
    sceneAuthoringAttemptRef: "artifact://case/test/attempt.json",
    sceneAuthoringAttemptHash: hash("1"),
    sceneAuthoringAttemptResultRef: "artifact://case/test/result.json",
    sceneAuthoringAttemptResultHash: hash("2"),
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    worldBuildIdentityRef: "artifact://case/test/world-build-identity.json",
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    worldPackageBuildReceiptRef: "artifact://case/test/package-receipt.json",
    worldPackageBuildReceiptHash: hash("3"),
    semanticCaptureMapRef: "artifact://case/test/semantic-map.json",
    semanticCaptureMap,
    semanticCaptureMapHash: hashFormalSemanticCaptureMapV1(semanticCaptureMap),
    nativeBlockMaterializerMetadataRef:
      "world-package://native/block-materializer-metadata.json",
    nativeBlockMaterializerMetadataHash: hash("4"),
    views: [
      { ...viewBase, viewId: "opening", projection: "perspective" },
      {
        ...viewBase,
        viewId: "world-side",
        projection: "orthographic",
        worldBoundsMeters: bounds,
        cameraPositionMetersXYZ: [20, 2, 0],
        targetMetersXYZ: [0, 2, 0],
      },
      {
        ...viewBase,
        viewId: "world-top-down",
        projection: "orthographic",
        worldBoundsMeters: bounds,
        cameraPositionMetersXYZ: [0, 20, 0],
        targetMetersXYZ: [0, 2, 0],
      },
    ],
    colliderOverlay: {
      kind: "formal-collider-overlay-request",
      schemaVersion: 1,
      isRequired: true,
      contributionHash: semanticCaptureMap.contributionHash,
    },
    scriptedTraversal: {
      kind: "formal-scripted-traversal-request",
      schemaVersion: 1,
      checks: [{
        id: "check",
        acceptanceTargetRef: "worldkit://acceptance-target/route@1",
        checkExpectation: "pass",
        fixedInputSequence,
        fixedInputSequenceHash,
        checkpointCriteria: [criterion],
      }],
    },
  };
}

describe("Babylon Native isolated Runtime entry", () => {
  it("rejects formal capture unless the isolated operation and exact request hash authorize it", async () => {
    const interactiveInput = await entryInput("runtime.hosted.capture-operation-mismatch");
    const interactiveEntry = await createBabylonNativeIsolatedRuntimeEntryV1(
      interactiveInput,
    );
    const request = formalRequestFixture(interactiveInput.verifiedWorldPackage);
    await expect(interactiveEntry.executeFormalCapture(request, [])).rejects.toThrowError(
      "WORLDKIT_NATIVE_FORMAL_CAPTURE_OPERATION_NOT_AUTHORIZED",
    );
    await interactiveEntry.dispose();

    const captureBase = await entryInput("runtime.hosted.capture-hash-mismatch");
    const captureInput = {
      ...captureBase,
      request: {
        ...captureBase.request,
        requestedOperation: {
          mode: "capture" as const,
          captureRequestHash: `sha256:${"9".repeat(64)}` as const,
        },
      },
    };
    const captureEntry = await createBabylonNativeIsolatedRuntimeEntryV1(captureInput);
    await expect(captureEntry.executeFormalCapture(request, [])).rejects.toThrowError(
      "WORLDKIT_NATIVE_FORMAL_CAPTURE_REQUEST_HASH_MISMATCH",
    );
    await captureEntry.dispose();
  });

  it("publishes one initially possessed RuntimeHost session inside the enclave", async () => {
    const input = await entryInput();
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1(input);
    const snapshot = entry.initialSnapshot();

    expect(snapshot.runtimeSessionId).toBe(input.request.runtimeSessionId);
    expect(snapshot.runtime.phase).toBe("ready");
    expect(snapshot.resources.physicsBodyCount).toBe(4);
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
