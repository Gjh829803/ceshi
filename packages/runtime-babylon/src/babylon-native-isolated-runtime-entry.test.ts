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
  parseFormalWorldCaptureRequestV1,
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
import { GroundAwarePhysicsCharacterController } from "./babylon-character-body-port";
import { BabylonWorldRuntime } from "./babylon-world-runtime";
import { finishHostedInteractiveInputV1 } from "./browser-fixed-input-recovery";

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
    kind: "reach-position",
    checkpointId: "checkpoint",
    expectation: "reach",
    sourceVisualGroupId: "route",
    standPositionMetersXYZ: [0, 1, 0] as const,
    capsuleRadiusMeters: 0.35,
    toleranceMeters: 0.05,
  } as const;
  const semanticCaptureMap = {
    kind: "formal-semantic-capture-map",
    schemaVersion: 1,
    id: "capture.map",
    caseRef: "artifact://world-reconstruction-case/test/case.json",
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
        viewRequirements: [{ viewId: "opening", mode: "reference-projection-required" }, { viewId: "world-side", mode: "presence-required" }, { viewId: "world-top-down", mode: "presence-required" }],
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
        viewRequirements: [{ viewId: "opening", mode: "reference-projection-required" }, { viewId: "world-side", mode: "presence-required" }, { viewId: "world-top-down", mode: "presence-required" }],
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
  return parseFormalWorldCaptureRequestV1({
    kind: "formal-world-capture-request",
    visualCaptureGroups: [],
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
  });
}

describe("Babylon Native isolated Runtime entry", () => {
  it("rejects formal capture unless the isolated operation and exact request hash authorize it", async () => {
    const interactiveInput = await entryInput("runtime.hosted.capture-operation-mismatch");
    const interactiveEntry = await createBabylonNativeIsolatedRuntimeEntryV1(
      interactiveInput,
    );
    const request = formalRequestFixture(interactiveInput.verifiedWorldPackage);
    await expect(interactiveEntry.executeFormalCapture(request)).rejects.toThrowError(
      "WORLDKIT_NATIVE_FORMAL_CAPTURE_OPERATION_NOT_AUTHORIZED",
    );
    await interactiveEntry.dispose();

    const captureBase = await entryInput("runtime.hosted.capture-hash-mismatch");
    const captureInput = {
      ...captureBase,
      sdkOwnerIdentities: [
        "action", "camera", "input", "physics", "subject",
      ].map((ownerId) => ({
        ownerId,
        implementationRef: `worldkit://sdk-owner/${ownerId === "action"
          ? "subject-actions"
          : ownerId === "input"
            ? "control-capture"
            : ownerId === "physics"
              ? "character-movement"
              : ownerId === "subject"
                ? "subject-contracts"
                : "camera"}@1`,
        implementationHash: `sha256:${"a".repeat(64)}`,
      })) as NonNullable<
        CreateBabylonNativeIsolatedRuntimeEntryInputV1["sdkOwnerIdentities"]
      >,
      request: {
        ...captureBase.request,
        requestedOperation: {
          mode: "capture" as const,
          captureRequestHash: `sha256:${"9".repeat(64)}` as const,
        },
      },
    };
    const captureEntry = await createBabylonNativeIsolatedRuntimeEntryV1(captureInput);
    await expect(captureEntry.executeFormalCapture(request)).rejects.toThrowError(
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
    expect(entry.physicalInputContext()).toEqual({
      worldSessionId: snapshot.worldSessionId,
      possessionTarget: { mode: "possessed", controlledEntityId: "g-bot-primary" },
    });
    // Cloud-ridge keeps 3 logical Colliders plus the possessed character. The
    // Runtime realizes those Colliders as a spawn-ring of 4 m Chunk parts, so
    // the committed body count is the resident set rather than one body per
    // logical Collider.
    expect(snapshot.resources.physicsBodyCount).toBe(35);
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

  it("renders actual Native Camera interpolation through the isolated entry without changing committed state", async () => {
    const input = await entryInput();
    const engine = input.engineFactory(`${input.request.runtimeSessionId}.interpolation`);
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1({ ...input, engineFactory: () => engine });
    try {
      const run = async (id: string, ticks: number) => {
        const receipt = await entry.submit(protocolRequest(input.request.runtimeSessionId, id, {
          type: "fixed-input.run", input: { actions: ["move-right"], ticks },
        }));
        if (receipt.status !== "succeeded" || receipt.requestType !== "fixed-input.run") throw new Error("fixed input failed");
        return receipt.snapshot;
      };
      const previous = await run("request.interpolation.warmup", 60);
      const current = await run("request.interpolation.next", 1);
      if (previous.view.camera.mode !== "tracking" || current.view.camera.mode !== "tracking") throw new Error("tracking camera missing");
      const a = previous.view.camera.actualPositionMetersXYZ;
      const b = current.view.camera.actualPositionMetersXYZ;
      if (a === undefined || b === undefined) throw new Error("resolved camera pose missing");
      expect(Math.hypot(...b.map((value, axis) => value - a[axis]!))).toBeGreaterThan(1e-5);
      const scene = engine.scenes[0]!;
      const positions: number[][] = [];
      scene.onBeforeRenderObservable.add(() => positions.push(scene.activeCamera!.position.asArray()));
      for (const alpha of [0, 0.5, 1]) entry.renderFrame(alpha);
      for (const [index, alpha] of [0, 0.5, 1].entries()) {
        for (let axis = 0; axis < 3; axis++) {
          expect(positions[index]![axis]).toBeCloseTo(a[axis]! + (b[axis]! - a[axis]!) * alpha, 6);
        }
      }
      const after = await entry.submit(protocolRequest(input.request.runtimeSessionId, "request.interpolation.snapshot", { type: "snapshot.get" }));
      if (after.status !== "succeeded" || after.requestType !== "snapshot.get") throw new Error("snapshot failed");
      expect(after.snapshot.world).toEqual(current.world);
      expect(after.snapshot.view).toEqual(current.view);
    } finally { await entry.dispose(); }
  });

  it("serializes local camera deltas after fixed input and resets through the same Runtime owner", async () => {
    const input = await entryInput();
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1(input);
    try {
      const fixed = entry.submit(protocolRequest(input.request.runtimeSessionId, "request.pointer.fixed", {
        type: "fixed-input.run", input: { actions: [], ticks: 1 },
      }));
      const deltas = { yawDeltaRadians: 0.12, pitchDeltaRadians: 0.1, zoomDeltaMeters: 0.4 };
      const adjustment = entry.adjustCameraView(deltas);
      deltas.yawDeltaRadians = 2;
      const adjusted = await adjustment;
      expect((await fixed).status).toBe("succeeded");
      expect(adjusted.world.simulationTick).toBe(1);
      expect(adjusted.view.camera).toMatchObject({
        mode: "tracking", viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0, viewDistanceOffsetMeters: 0,
      });
      const snapshot = await entry.submit(protocolRequest(input.request.runtimeSessionId, "request.pointer.snapshot", { type: "snapshot.get" }));
      if (snapshot.status !== "succeeded" || snapshot.requestType !== "snapshot.get") throw new Error("snapshot failed");
      expect(snapshot.snapshot.view).toEqual(adjusted.view);
      const settled = await entry.submit(protocolRequest(input.request.runtimeSessionId, "request.pointer.settle", {
        type: "fixed-input.run", input: { actions: [], ticks: 30 },
      }));
      if (settled.status !== "succeeded" || settled.requestType !== "fixed-input.run") throw new Error("fixed input failed");
      if (settled.snapshot.view.camera.mode !== "tracking") throw new Error("tracking missing");
      expect(settled.snapshot.view.camera.viewYawOffsetRadians).toBeCloseTo(0.12 * (1 - Math.exp(-16 * 0.5)), 6);
      expect(settled.snapshot.view.camera.viewPitchOffsetRadians).toBeCloseTo(0.08 * (1 - Math.exp(-14 * 0.5)), 6);
      expect(settled.snapshot.view.camera.viewDistanceOffsetMeters).toBeGreaterThan(0.39);
      const reset = await entry.submit(protocolRequest(input.request.runtimeSessionId, "request.pointer.reset", { type: "session.reset" }));
      if (reset.status !== "succeeded" || reset.requestType !== "session.reset") throw new Error("reset failed");
      expect(reset.snapshot.view.camera).toMatchObject({
        viewYawOffsetRadians: 0, viewPitchOffsetRadians: 0, viewDistanceOffsetMeters: 0,
      });
    } finally { await entry.dispose(); }
    await expect(entry.adjustCameraView({ yawDeltaRadians: 0.1 })).rejects.toThrow("WORLDKIT_NATIVE_ISOLATION_RUNTIME_NOT_ACTIVE");
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

  it("resets an interactive Session through 25 bounded WorldSessions and reports only committed support", async () => {
    const input = await entryInput("runtime.hosted.playability-capacity");
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1(input);
    const runtimeSessionId = input.request.runtimeSessionId;
    let previousWorldSessionId = entry.initialSnapshot().worldSessionId;
    for (let index = 1; index <= 24; index += 1) {
      const receipt = await entry.submit(protocolRequest(
        runtimeSessionId,
        `request.reset.${index}`,
        { type: "session.reset" },
      ));
      expect(receipt).toMatchObject({
        status: "succeeded",
        requestType: "session.reset",
        runtimeSessionId,
        snapshot: {
          runtimeSessionId,
          world: { simulationTick: 0 },
        },
      });
      if (receipt.status !== "succeeded" ||
        receipt.requestType !== "session.reset") throw new Error("unreachable");
      expect(receipt.worldSessionId).toBe(receipt.snapshot.worldSessionId);
      expect(receipt.worldSessionId).not.toBe(previousWorldSessionId);
      previousWorldSessionId = receipt.worldSessionId;
    }
    const settled = await entry.submit(protocolRequest(
      runtimeSessionId,
      "request.settle",
      { type: "fixed-input.run", input: { actions: [], ticks: 1 } },
    ));
    if (settled.status !== "succeeded" ||
      settled.requestType !== "fixed-input.run") throw new Error("unreachable");
    const subjectEntityId =
      input.verifiedWorldPackage.worldRuntimeBootstrap.initialControlledEntityId;
    const support = await entry.submit(protocolRequest(
      runtimeSessionId,
      "request.support",
      {
        type: "subject-support.get",
        subjectEntityId,
        expectedSimulationTick: settled.snapshot.world.simulationTick,
      },
    ));
    expect(support).toMatchObject({
      status: "succeeded",
      requestType: "subject-support.get",
      worldSessionId: previousWorldSessionId,
      subjectSupport: {
        runtimeSessionId,
        worldSessionId: previousWorldSessionId,
        subjectEntityId,
        simulationTick: settled.snapshot.world.simulationTick,
        mode: "supported",
      },
    });
    if (support.status !== "succeeded" ||
      support.requestType !== "subject-support.get") throw new Error("unreachable");
    expect(input.verifiedWorldPackage.nativeSceneContribution.staticColliders
      .map(({ id }) => id)).toContain(support.subjectSupport.colliderId);

    await expect(entry.submit(protocolRequest(
      runtimeSessionId,
      "request.support.stale",
      {
        type: "subject-support.get",
        subjectEntityId,
        expectedSimulationTick: settled.snapshot.world.simulationTick - 1,
      },
    ))).resolves.toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_SESSION_REQUEST_REJECTED" },
    });
    await expect(entry.submit(protocolRequest(
      runtimeSessionId,
      "request.support.unknown-subject",
      {
        type: "subject-support.get",
        subjectEntityId: "unknown-subject",
        expectedSimulationTick: settled.snapshot.world.simulationTick,
      },
    ))).resolves.toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_SESSION_REQUEST_REJECTED" },
    });
    await entry.submit(protocolRequest(
      runtimeSessionId,
      "request.close.after-reset",
      { type: "session.close" },
    ));
    await expect(entry.submit(protocolRequest(
      runtimeSessionId,
      "request.reset.after-close",
      { type: "session.reset" },
    ))).resolves.toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_SESSION_NOT_ACTIVE" },
    });
  }, 30_000);

  it("rejects the twenty-sixth interactive WorldSession instead of growing without bound", async () => {
    const input = await entryInput("runtime.hosted.playability-bound");
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1(input);
    const runtimeSessionId = input.request.runtimeSessionId;
    for (let index = 1; index <= 24; index += 1) {
      await expect(entry.submit(protocolRequest(
        runtimeSessionId,
        `request.bound.reset.${index}`,
        { type: "session.reset" },
      ))).resolves.toMatchObject({ status: "succeeded" });
    }
    await expect(entry.submit(protocolRequest(
      runtimeSessionId,
      "request.bound.reset.25",
      { type: "session.reset" },
    ))).resolves.toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_SESSION_INTERNAL_FAILURE" },
    });
    await expect(entry.submit(protocolRequest(
      runtimeSessionId,
      "request.bound.after-limit",
      { type: "snapshot.get" },
    ))).resolves.toMatchObject({
      status: "rejected",
      diagnostic: { code: "RUNTIME_SESSION_NOT_ACTIVE" },
    });
  }, 30_000);

  it("retains a rolled-back invalid-input Session without retrying a protocol request", async () => {
    const input = await entryInput("runtime.hosted.input-rollback");
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1(input);
    await entry.submit(protocolRequest(input.request.runtimeSessionId, "request.warmup", {
      type: "fixed-input.run", input: { actions: ["move-forward"], ticks: 5 },
    }));
    const before = entry.initialSnapshot();
    const failure = vi.spyOn(GroundAwarePhysicsCharacterController.prototype, "checkSupport")
      .mockImplementationOnce(() => { throw new Error("3C_INPUT_INVALID: injected invalid contact"); });
    const observedFailure = vi.spyOn(BabylonWorldRuntime.prototype, "consumeFixedInputFailureDiagnostic");
    try {
      const request = protocolRequest(input.request.runtimeSessionId, "request.input-rollback", {
        type: "fixed-input.run", input: { actions: ["move-forward"], ticks: 3 },
      });
      const rejected = await entry.submit(request);
      expect(observedFailure.mock.results[0]?.value).toEqual({ stage: "prepare", errorCode: "3C_INPUT_INVALID" });
      expect(rejected).toMatchObject({
        status: "rejected", diagnostic: { code: "RUNTIME_SESSION_FIXED_INPUT_REJECTED" },
      });
      expect(JSON.stringify(rejected)).not.toContain("injected invalid contact");
      expect(entry.initialSnapshot()).toEqual(before);
      expect(await entry.submit(request)).toEqual(rejected);
      expect(entry.initialSnapshot()).toEqual(before);
      const recovered = await entry.submit(protocolRequest(input.request.runtimeSessionId, "request.neutral", {
        type: "fixed-input.run", input: { actions: [], ticks: 1 },
      }));
      expect(recovered).toMatchObject({ status: "succeeded", snapshot: {
        worldSessionId: before.worldSessionId, world: { simulationTick: 6 },
      } });
    } finally {
      failure.mockRestore();
      observedFailure.mockRestore();
      await entry.dispose();
    }
  });

  it.each(["invalid-contact", "internal-error"] as const)("keeps failed native integration fatal (%s)", async (kind) => {
    const input = await entryInput("runtime.hosted.fatal-input");
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1(input);
    const failure = vi.spyOn(GroundAwarePhysicsCharacterController.prototype, "integrate")
      .mockImplementationOnce(() => { throw new Error(kind === "invalid-contact"
        ? "3C_INPUT_INVALID: cannot undo an external integration" : "private integration failure"); });
    try {
      const receipt = await entry.submit(protocolRequest(input.request.runtimeSessionId, "request.fatal", {
        type: "fixed-input.run", input: { actions: ["move-forward"], ticks: 1 },
      }));
      expect(receipt).toMatchObject({ status: "rejected", diagnostic: { code: "RUNTIME_SESSION_INTERNAL_FAILURE" } });
      expect(JSON.stringify(receipt)).not.toContain("private");
      await expect(finishHostedInteractiveInputV1({
        receipt,
        clearPhysicalInput() { throw new Error("must not try recovery"); },
        async submitNeutralInput() { throw new Error("must not dispatch a neutral Tick"); },
      })).rejects.toThrow("WORLDKIT_HOSTED_RUNTIME_LOCAL_INPUT_REJECTED");
      expect(await entry.submit(protocolRequest(input.request.runtimeSessionId, "request.after-fatal", {
        type: "snapshot.get",
      }))).toMatchObject({ status: "rejected", diagnostic: { code: "RUNTIME_SESSION_NOT_ACTIVE" } });
    } finally {
      failure.mockRestore();
      await entry.dispose();
    }
  });

  it.each([false, true])("browser input makes one neutral recovery attempt (retryFails=%s)", async (retryFails) => {
    const input = await entryInput("runtime.hosted.browser-recovery");
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1(input);
    const checkSupport = GroundAwarePhysicsCharacterController.prototype.checkSupport;
    let isRecovery = false;
    let recoveryFailureInjected = false;
    const failure = vi.spyOn(GroundAwarePhysicsCharacterController.prototype, "checkSupport")
      .mockImplementationOnce(() => { throw new Error("3C_INPUT_INVALID: rejected browser input"); })
      .mockImplementation(function (this: GroundAwarePhysicsCharacterController, ...args) {
        if (isRecovery && retryFails && !recoveryFailureInjected) {
          recoveryFailureInjected = true;
          throw new Error("3C_INPUT_INVALID: rejected neutral input");
        }
        return checkSupport.apply(this, args);
      });
    const pressedCodes = new Set(["KeyW", "ArrowLeft"]);
    let arrowVelocity = 0.025;
    const submittedInputs: unknown[] = [];
    try {
      const receipt = await entry.submit(protocolRequest(input.request.runtimeSessionId, "request.browser", {
        type: "fixed-input.run", input: { actions: ["move-forward"], ticks: 3 },
      }));
      const completion = finishHostedInteractiveInputV1({
        receipt,
        clearPhysicalInput() { pressedCodes.clear(); arrowVelocity = 0; },
        async submitNeutralInput(neutral) {
          expect(pressedCodes.size).toBe(0);
          expect(arrowVelocity).toBe(0);
          submittedInputs.push(neutral);
          isRecovery = true;
          return entry.submit(protocolRequest(input.request.runtimeSessionId, "request.browser.neutral", {
            type: "fixed-input.run", input: neutral,
          }));
        },
      });
      if (retryFails) await expect(completion).rejects.toThrow("WORLDKIT_HOSTED_RUNTIME_LOCAL_INPUT_REJECTED");
      else await expect(completion).resolves.toBe(true);
      expect(submittedInputs).toEqual([{ actions: [], ticks: 1 }]);
      expect(entry.initialSnapshot().world.simulationTick).toBe(retryFails ? 0 : 1);
    } finally {
      failure.mockRestore();
      await entry.dispose();
    }
  });

  it("binds a post-swap reset cleanup failure to the committed new World", async () => {
    const input = await entryInput("runtime.hosted.reset-cleanup-failure");
    let engineSequence = 0;
    const entry = await createBabylonNativeIsolatedRuntimeEntryV1({
      ...input,
      engineFactory: (runtimeSessionId) => {
        const engine = input.engineFactory(runtimeSessionId);
        if (engineSequence === 0) {
          vi.spyOn(engine, "dispose").mockImplementationOnce(() => {
            throw new Error("old World Engine cleanup failure");
          });
        }
        engineSequence += 1;
        return engine;
      },
    });
    const initialWorldSessionId = entry.initialSnapshot().worldSessionId;
    const receipt = await entry.submit(protocolRequest(
      input.request.runtimeSessionId,
      "request.reset.cleanup-failure",
      { type: "session.reset" },
    ));
    expect(receipt).toMatchObject({
      status: "rejected",
      diagnostic: {
        code: "RUNTIME_SESSION_RESET_COMMITTED_CLEANUP_FAILURE",
      },
    });
    expect(receipt.worldSessionId).not.toBe(initialWorldSessionId);
    await expect(entry.submit(protocolRequest(
      input.request.runtimeSessionId,
      "request.after-reset.cleanup-failure",
      { type: "snapshot.get" },
    ))).resolves.toMatchObject({
      status: "rejected",
      worldSessionId: receipt.worldSessionId,
      diagnostic: { code: "RUNTIME_SESSION_NOT_ACTIVE" },
    });
  }, 30_000);

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
