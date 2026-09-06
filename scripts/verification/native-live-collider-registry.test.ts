import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  parseGameplayBootstrapV1,
  type ActiveLocomotionCapabilityStateV2,
} from "@whitebox-world/gameplay-contracts";
import {
  defineBabylonNativeScene,
  type BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";
import { admitBabylonNativeSceneCandidateV1 } from
  "@whitebox-world/native-babylon/host";
import {
  createBabylonNativeBlockProfileSessionV1,
  hashBabylonNativeBlockCheckedLayoutInventoryV1,
} from "@whitebox-world/native-babylon-block-profile";
import {
  takeBabylonNativeBlockCheckedEpochEvidenceV1,
  type BabylonNativeBlockCheckedEpochEvidenceV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import {
  BabylonWorldRuntime,
  type BabylonRuntimeProjectionV1,
} from "@whitebox-world/runtime-babylon";
import {
  bindRuntimeTestPossession,
  peekBabylonNativeLiveColliderRegistryV1,
} from "@whitebox-world/runtime-babylon/testing";
import {
  hashBabylonNativeSceneContributionV1,
  hashBabylonNativeSceneBootstrapV1,
  parseBabylonNativeBlockMaterializerMetadataV1,
  parseWorldRuntimeBootstrapV1,
  worldResourceLockEntriesV1,
  type BabylonNativeSceneContributionV1,
  type SemanticInputActionV1,
} from "@whitebox-world/runtime-contracts";
import { runtimeWorldConfigurationFromVerifiedWorldPackageV1 } from
  "@whitebox-world/runtime-host";
import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { createBabylonNativeBlockWorldPackageTestInputV1 } from
  "@whitebox-world/world-package/testing";
import { describe, expect, it } from "vitest";
import { isNil } from "lodash-es";
import { hashSceneAuthoringAttemptV1 } from
  "@whitebox-world/scene-authoring-contracts";

const require = createRequire(import.meta.url);
const havokWasmBytes = await readFile(
  require.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;
const gBotSubjectAssetBytes = new Uint8Array(await readFile(new URL(
  "../../apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
  import.meta.url,
)));
const productionGameplayBootstrap = parseGameplayBootstrapV1(JSON.parse(
  await readFile(new URL(
    "../../apps/playground/public/world-packages/cloud-ridge/gameplay/bootstrap.json",
    import.meta.url,
  ), "utf8"),
));
const productionWorldRuntimeBootstrap = parseWorldRuntimeBootstrapV1(JSON.parse(
  await readFile(new URL(
    "../../apps/playground/public/world-packages/cloud-ridge/runtime/world-runtime-bootstrap.json",
    import.meta.url,
  ), "utf8"),
));

function moduleFixture(
  profile: "single-block" | "quarter-meter-ramp" | "one-meter-ramp" = "single-block",
): BabylonNativeSceneModuleV1 {
  return defineBabylonNativeScene({
    kind: "babylon-native-scene-module",
    id: "package-fixture-module",
    build(context): void {
      const session = createBabylonNativeBlockProfileSessionV1(context);
      if (profile === "quarter-meter-ramp" || profile === "one-meter-ramp") {
        for (let xMeters = -3; xMeters <= 13; xMeters += 1) {
          const riseCount = profile === "one-meter-ramp"
            ? (xMeters < 2 ? 0 : xMeters < 6 ? 1 : 2)
            : xMeters < 2 ? 0 : Math.min(8, xMeters - 1);
          for (let zMeters = -2; zMeters <= 2; zMeters += 1) {
            session.createBlock({
              id: `ramp-base-x${xMeters + 3}-z${zMeters + 2}`,
              shape: "full",
              paletteRole: "ground",
              centerMetersXYZ: [xMeters, -0.5, zMeters],
              colliderGroupId: "ramp-ground-group",
            });
            for (let riseIndex = 0; riseIndex < riseCount; riseIndex += 1) {
              session.createBlock({
                id: `ramp-rise-x${xMeters + 3}-z${zMeters + 2}-y${riseIndex}`,
                shape: profile === "one-meter-ramp" ? "full" : "step",
                paletteRole: "ground",
                centerMetersXYZ: [
                  xMeters,
                  profile === "one-meter-ramp" ? 0.5 + riseIndex : 0.125 + riseIndex * 0.25,
                  zMeters,
                ],
                colliderGroupId: "ramp-ground-group",
              });
            }
          }
        }
        session.finalize({
          staticColliders: [{
            id: "ground",
            colliderGeometrySource: Object.freeze({
              kind: "block-group" as const,
              colliderGroupId: "ramp-ground-group",
            }),
            traversalBinding: {
              kind: "static-surface",
              surfaceEntityId: "ground-surface",
              logicalSubshapeId: "top",
              traversalSurfaceProfileRef:
                "worldkit://traversal-surface-profile/ground.static@1",
            },
            exposedEdgePolicy: "none",
            frictionRatio: 0.8,
            restitutionRatio: 0,
          }],
        });
        context.registration.registerSpawnMarker({
          id: context.bootstrap.spawnMarkerId,
          positionMetersXYZ: [0, 0, 0],
          facingRadians: 0,
        });
        return;
      }
      session.createBlock({
        id: "ground-block",
        shape: "full",
        paletteRole: "ground",
        centerMetersXYZ: [0, -0.5, 0],
      });
      session.finalize({
        staticColliders: [{
          id: "ground",
          colliderGeometrySource: Object.freeze({ kind: "block" as const, blockId: "ground-block" }),
          traversalBinding: {
            kind: "static-surface",
            surfaceEntityId: "ground-surface",
            logicalSubshapeId: "top",
            traversalSurfaceProfileRef:
              "worldkit://traversal-surface-profile/ground.static@1",
          },
          exposedEdgePolicy: "none",
          frictionRatio: 0.8,
          restitutionRatio: 0,
        }],
      });
      context.registration.registerSpawnMarker({
        id: context.bootstrap.spawnMarkerId,
        positionMetersXYZ: [0, 0, 0],
        facingRadians: 0,
      });
    },
  });
}

async function admittedFixture(
  module: BabylonNativeSceneModuleV1 = moduleFixture(),
): Promise<Readonly<{
  contribution: BabylonNativeSceneContributionV1;
  evidence: BabylonNativeBlockCheckedEpochEvidenceV1;
}>> {
  const packageInput = createBabylonNativeBlockWorldPackageTestInputV1();
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const admission = await admitBabylonNativeSceneCandidateV1({
      candidate: { engine, scene },
      hostDerivedStaticColliders: Object.freeze([]),
      bootstrap: packageInput.nativeSceneBootstrap,
      module,
      assets: Object.freeze({
        async resolve(): Promise<never> {
          throw new Error("Native live-collider fixture declares no assets.");
        },
      }),
      budget: {
        maximumStaticColliderCount: 512,
        maximumStaticColliderVertexCount: 200_000,
        maximumStaticColliderTriangleCount: 100_000,
      },
    });
    if (admission.outcome !== "passed") {
      throw new Error(JSON.stringify(admission.diagnostics));
    }
    const evidence = takeBabylonNativeBlockCheckedEpochEvidenceV1(scene);
    if (evidence.length !== 1 || isNil(evidence[0])) {
      throw new Error("Expected one checked Native Block epoch.");
    }
    return Object.freeze({ contribution: admission.contribution, evidence: evidence[0] });
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

function packageFixture(
  contribution: BabylonNativeSceneContributionV1,
  evidence: BabylonNativeBlockCheckedEpochEvidenceV1,
): VerifiedBabylonNativeWorldPackageDirectoryV1 {
  if (contribution.profileSettlement.kind !== "host-snapshot") {
    throw new Error("Expected committed Block settlement.");
  }
  const base = createBabylonNativeBlockWorldPackageTestInputV1();
  const nativeSceneBootstrap = Object.freeze({
    ...base.nativeSceneBootstrap,
    gameplayBootstrapRef: productionGameplayBootstrap.resourceRef,
    initialControlledEntityId:
      productionWorldRuntimeBootstrap.initialControlledEntityId,
    initialCamera: Object.freeze({
      mode: productionWorldRuntimeBootstrap.initialCamera.mode,
      pitchRadians: productionWorldRuntimeBootstrap.initialCamera.pitchRadians,
      distanceMeters: productionWorldRuntimeBootstrap.initialCamera.distanceMeters,
      fovDegrees: productionWorldRuntimeBootstrap.initialCamera.fovDegrees,
      targetHeightMeters:
        productionWorldRuntimeBootstrap.initialCamera.targetHeightMeters,
    }),
  });
  const sceneAuthoringAttempt = Object.freeze({
    ...base.sceneAuthoringAttempt,
    sourceInput: Object.freeze({
      ...base.sceneAuthoringAttempt.sourceInput,
      bootstrapInputHash:
        hashBabylonNativeSceneBootstrapV1(nativeSceneBootstrap),
    }),
  });
  const sceneAuthoringAttemptResult = Object.freeze({
    ...base.sceneAuthoringAttemptResult,
    sceneAuthoringAttemptHash:
      hashSceneAuthoringAttemptV1(sceneAuthoringAttempt),
  });
  const nativeAndTraversalRows = base.registryLock.filter(({ resourceKind }) =>
    resourceKind === "native-scene" ||
    resourceKind === "native-scene-api" ||
    resourceKind === "native-scene-profile" ||
    resourceKind === "traversal-surface-profile");
  const registryLock = worldResourceLockEntriesV1([
    ...productionWorldRuntimeBootstrap.runtimeResourceLockEntries,
    {
      resourceKind: "world-runtime-bootstrap",
      resourceRef: "worldkit://world-runtime-bootstrap/cloud-ridge@1",
      resolvedVersion: "1",
      contentHash: productionWorldRuntimeBootstrap.contentHash,
    },
    ...nativeAndTraversalRows,
  ]);
  const metadata = base.nativeBlockMaterializerMetadata;
  if (isNil(metadata)) throw new Error("Expected Block metadata fixture.");
  const nativeBlockMaterializerMetadata =
    parseBabylonNativeBlockMaterializerMetadataV1({
      ...metadata,
      checkedLayoutInventoryHash:
        hashBabylonNativeBlockCheckedLayoutInventoryV1(evidence.checkedLayout),
      contributionHash: hashBabylonNativeSceneContributionV1(contribution),
      profileInventoryHash: evidence.profileInventoryHash,
      settledVisualHash: contribution.profileSettlement.settledVisualHash,
      settledVisualTargetCount: contribution.profileSettlement.targetCount,
      blocks: evidence.checkedLayout.layout.blocks.map((block) => ({
        blockId: block.id,
        runtimeEntityId: `native-block:${block.id}`,
        semanticCaptureClassId:
          `worldkit.native-block.group.${block.visualGroupId ?? "ungrouped"}`,
        shape: block.shape,
        paletteRole: block.paletteRole,
        ...(isNil(block.visualGroupId) ? {} : { visualGroupId: block.visualGroupId }),
        centerMetersXYZ: block.centerMetersXYZ,
        rotationQuarterTurnsY: block.rotationQuarterTurnsY,
        sizeMetersXYZ: block.sizeMetersXYZ,
      })),
      visualGroups: [],
      colliderJoins: evidence.colliderInventory.map((entry) => ({
        colliderId: entry.colliderId,
        sourceBlockIds: entry.sourceBlockIds,
        visualGroupIds: entry.visualGroupIds,
        proxyKind: entry.proxyKind,
        minimumMetersXYZ: entry.minimumMetersXYZ,
        maximumMetersXYZ: entry.maximumMetersXYZ,
        vertexCount: entry.vertexCount,
        triangleCount: entry.triangleCount,
        topologyHash: entry.topologyHash,
      })),
    });
  const verified = verifyWorldPackageDirectoryV1(
    createBabylonNativeWorldPackageV1(
      createBabylonNativeBlockWorldPackageTestInputV1({
        nativeSceneBootstrap,
        sceneAuthoringAttempt,
        sceneAuthoringAttemptResult,
        gameplayBootstrap: productionGameplayBootstrap,
        worldRuntimeBootstrap: productionWorldRuntimeBootstrap,
        registryLock,
        worldBounds: {
          centerMetersXZ: [5, 0],
          sizeMetersXZ: [40, 20],
          heightRangeMeters: [-5, 20],
        },
        resourceBudget: {
          maximumVertices: 200_000,
          maximumTriangles: 100_000,
          maximumColliders: 512,
        },
        nativeSceneContribution: contribution,
        nativeBlockMaterializerMetadata,
      }),
    ),
  );
  if (verified.kind !== "babylon-native-scene") throw new Error("unreachable");
  return verified;
}

async function createVerifiedFixture(
  module: BabylonNativeSceneModuleV1 = moduleFixture(),
): Promise<
  VerifiedBabylonNativeWorldPackageDirectoryV1
> {
  const admitted = await admittedFixture(module);
  return packageFixture(admitted.contribution, admitted.evidence);
}

async function createRuntime(input: Readonly<{
  engineFactory?: () => NullEngine;
  onInitializationStage?: (stage: string) => void;
  module?: BabylonNativeSceneModuleV1;
}> = {}): Promise<Readonly<{
  runtime: BabylonWorldRuntime;
  scene: Scene;
  expectedWalkSpeedMetersPerSecond: number;
  expectedCameraDistanceMeters: number;
  controlledEntityId: string;
}>> {
  const module = input.module ?? moduleFixture();
  const verified = await createVerifiedFixture(module);
  const configuration = runtimeWorldConfigurationFromVerifiedWorldPackageV1(
    verified,
  );
  if (configuration.sceneSource.kind !== "babylon-native-scene") {
    throw new Error("unreachable");
  }
  const runtime = await BabylonWorldRuntime.create({
    sceneSource: {
      kind: "babylon-native-scene",
      descriptor: {
        runtimeSessionId: "runtime.native-live-collider",
        worldSessionId: "world-session.native-live-collider",
        worldBuildIdentity: configuration.worldBuildIdentity,
        gameplayBootstrap: configuration.gameplayBootstrap,
        worldRuntimeBootstrap: configuration.worldRuntimeBootstrap,
        sceneSource: configuration.sceneSource,
      },
      verifiedWorldPackage: verified,
      moduleLoader: Object.freeze({ load: async () => module }),
    },
    worldRuntimeBootstrap: verified.worldRuntimeBootstrap,
    gameplayBootstrap: verified.gameplayBootstrap,
    runtimeSessionId: "runtime.native-live-collider",
    havokWasmBinary,
    subjectAssetResolver: Object.freeze({
      async resolveSubjectAsset() {
        return Object.freeze({
          bytes: new Uint8Array(gBotSubjectAssetBytes),
          sourceLabel: "native-ramp-test-memory://g-bot.glb",
        });
      },
    }),
    engineFactory: input.engineFactory ?? (() =>
      new NullEngine({
        renderWidth: 64,
        renderHeight: 64,
        textureSize: 64,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      })),
    ...(isNil(input.onInitializationStage)
      ? {}
      : { onInitializationStage: input.onInitializationStage }),
  });
  const scene = (runtime as unknown as { scene: Scene }).scene;
  const controlledSubject = verified.worldRuntimeBootstrap
    .subjectRuntimeDescriptors.find(({ entityId }) =>
      entityId === verified.worldRuntimeBootstrap.initialControlledEntityId);
  if (isNil(controlledSubject)) {
    throw new Error("Verified Package is missing its controlled Subject descriptor.");
  }
  await bindRuntimeTestPossession(
    runtime,
    verified.worldRuntimeBootstrap.initialControlledEntityId,
  );
  return Object.freeze({
    runtime,
    scene,
    controlledEntityId: controlledSubject.entityId,
    expectedWalkSpeedMetersPerSecond:
      controlledSubject.controlFeel.walkSpeedMetersPerSecond,
    expectedCameraDistanceMeters:
      verified.worldRuntimeBootstrap.initialCamera.distanceMeters,
  });
}

async function beginSupportedJump(
  runtime: BabylonWorldRuntime,
  controlledEntityId: string,
  persistentActions: readonly SemanticInputActionV1[],
): Promise<Readonly<{
  snapshot: BabylonRuntimeProjectionV1;
  takeoffPhaseEntryTicks: ReadonlySet<number>;
}>> {
  const takeoffPhaseEntryTicks = new Set<number>();
  let snapshot = runtime.snapshot();
  for (let tick = 0; tick < 8; tick += 1) {
    snapshot = await runtime.runFixedInput({
      actions: tick === 0
        ? [...persistentActions, "jump"]
        : persistentActions,
      ticks: 1,
    });
    const locomotion = snapshot.subjectStatesByEntityId[controlledEntityId]!
      .locomotion;
    if (isNil(locomotion) || locomotion.status !== "active") {
      throw new Error(
        "Production G Bot ramp fixture is missing active current Locomotion projection.",
      );
    }
    if (locomotion.verticalPhase === "takeoff") {
      takeoffPhaseEntryTicks.add(locomotion.phaseEnteredTick);
    }
    if (locomotion.mobilityMode === "airborne") {
      return Object.freeze({ snapshot, takeoffPhaseEntryTicks });
    }
  }
  throw new Error(
    "Native ramp did not admit the SDK jump inside the bounded current Action window.",
  );
}

function activeLocomotion(
  snapshot: BabylonRuntimeProjectionV1,
  controlledEntityId: string,
): ActiveLocomotionCapabilityStateV2 {
  const locomotion = snapshot.subjectStatesByEntityId[controlledEntityId]!
    .locomotion;
  if (isNil(locomotion) || locomotion.status !== "active") {
    throw new Error(
      "Production G Bot ramp fixture is missing active current Locomotion projection.",
    );
  }
  return locomotion;
}

describe("SDK-owned Native live collider registry", () => {
  it.each(["quarter-meter-ramp", "one-meter-ramp"] as const)("preserves current movement, Action and Camera contracts across one smoothed Native Block ramp: %s", async (profile) => {
    const {
      runtime,
      expectedWalkSpeedMetersPerSecond,
      expectedCameraDistanceMeters,
      controlledEntityId,
    } = await createRuntime({
      module: moduleFixture(profile),
    });
    try {
      let snapshot = runtime.snapshot();
      const rampSamples = [];
      const rampCameraSamples = [];
      const steadySlopeSamples = [];
      for (let tick = 0; tick < 480; tick += 1) {
        snapshot = await runtime.runFixedInput({
          actions: ["move-right"],
          ticks: 1,
        });
        const subject = snapshot.subjectStatesByEntityId[controlledEntityId]!;
        if (
          subject.positionMetersXYZ[0] >= 2 &&
          subject.positionMetersXYZ[0] <= 9
        ) {
          rampSamples.push(subject);
          rampCameraSamples.push(snapshot.camera);
          // The 1m source tops form a 26.565-degree incline from x=4.5
          // to x=6.5. Measure its interior, beyond the capsule's mixed
          // flat/ramp manifold. The old contact projection also slows at
          // changing normals; the invariant here is no sustained slope drag.
          if (profile === "quarter-meter-ramp" || (
            subject.positionMetersXYZ[0] >= 5.25 &&
            subject.positionMetersXYZ[0] <= 5.75
          )) {
            steadySlopeSamples.push(subject);
          }
        }
        if (subject.positionMetersXYZ[0] >= 10) break;
      }
      expect(rampSamples.length).toBeGreaterThan(30);
      expect(rampSamples.every(({ movementMedium }) =>
        movementMedium === "ground")).toBe(true);
      expect(steadySlopeSamples.length).toBeGreaterThan(10);
      expect(Math.min(...steadySlopeSamples.map(({ speedMetersPerSecond }) =>
        speedMetersPerSecond))).toBeGreaterThanOrEqual(
          expectedWalkSpeedMetersPerSecond * 0.9,
        );
      for (const camera of rampCameraSamples) {
        // Native follows the old subject-fade lane, not the Canonical hard
        // collision arm. Verify its actual pose instead of treating an absent
        // hard-collision-only effectiveArmLengthMeters as a zero-length arm.
        expect(camera.subjectOcclusion?.isEnabled).toBe(true);
        expect(camera.actualPositionMetersXYZ).toEqual(camera.desiredPositionMetersXYZ);
        expect(camera.requestedArmLengthMeters).toBeCloseTo(expectedCameraDistanceMeters, 8);
      }
      expect(rampCameraSamples.every(({ decollisionPhase }) =>
        decollisionPhase !== "emergency-inside" &&
        decollisionPhase !== "constrained")).toBe(true);
      expect(snapshot.subjectStatesByEntityId[controlledEntityId]!
        .positionMetersXYZ[0])
        .toBeGreaterThanOrEqual(10);
      expect(snapshot.subjectStatesByEntityId[controlledEntityId]!
        .positionMetersXYZ[1])
        .toBeGreaterThan(1.5);

      runtime.reset();
      await bindRuntimeTestPossession(runtime, controlledEntityId);
      for (let tick = 0; tick < 480; tick += 1) {
        snapshot = await runtime.runFixedInput({
          actions: ["move-right"],
          ticks: 1,
        });
        if (snapshot.subjectStatesByEntityId[controlledEntityId]!
          .positionMetersXYZ[0] >= 10) {
          break;
        }
      }
      const downhillSamples = [];
      for (let tick = 0; tick < 480; tick += 1) {
        snapshot = await runtime.runFixedInput({
          actions: ["move-left"],
          ticks: 1,
        });
        const subject = snapshot.subjectStatesByEntityId[controlledEntityId]!;
        if (
          subject.positionMetersXYZ[0] >= 2 &&
          subject.positionMetersXYZ[0] <= 9
        ) downhillSamples.push(subject);
        if (subject.positionMetersXYZ[0] <= 1) break;
      }
      expect(downhillSamples.length).toBeGreaterThan(30);
      expect(downhillSamples.every(({ movementMedium }) =>
        movementMedium === "ground"), JSON.stringify(
        downhillSamples.filter(({ movementMedium }) =>
          movementMedium !== "ground").slice(0, 8),
      )).toBe(true);
      expect(snapshot.subjectStatesByEntityId[controlledEntityId]!
        .positionMetersXYZ[0])
        .toBeLessThanOrEqual(1);

      for (let tick = 0; tick < 480; tick += 1) {
        snapshot = await runtime.runFixedInput({
          actions: ["move-right"],
          ticks: 1,
        });
        if (snapshot.subjectStatesByEntityId[controlledEntityId]!
          .positionMetersXYZ[0] >= 6) {
          break;
        }
      }
      const jumpStart = await beginSupportedJump(
        runtime,
        controlledEntityId,
        ["move-right"],
      );
      const jumping = jumpStart.snapshot;
      expect(jumping.subjectStatesByEntityId[controlledEntityId]).toMatchObject({
        movementMedium: "air",
        locomotion: {
          status: "active",
          mobilityMode: "airborne",
          supportMode: "unsupported",
        },
      });
      expect(["takeoff", "rising"]).toContain(
        activeLocomotion(jumping, controlledEntityId).verticalPhase,
      );
      const takeoffPhaseEntryTicks = new Set(
        jumpStart.takeoffPhaseEntryTicks,
      );
      let landed = jumping;
      for (let tick = 0; tick < 180; tick += 1) {
        landed = await runtime.runFixedInput({
          actions: ["move-right"],
          ticks: 1,
        });
        const locomotion = activeLocomotion(landed, controlledEntityId);
        if (locomotion.verticalPhase === "takeoff") {
          takeoffPhaseEntryTicks.add(locomotion.phaseEnteredTick);
        }
        if (
          locomotion.mobilityMode === "grounded" &&
          locomotion.verticalPhase === "none"
        ) break;
      }
      expect(takeoffPhaseEntryTicks.size).toBe(1);
      expect(landed.subjectStatesByEntityId[controlledEntityId]).toMatchObject({
        movementMedium: "ground",
        locomotion: {
          status: "active",
          mobilityMode: "grounded",
          verticalPhase: "none",
        },
      });

      runtime.reset();
      await bindRuntimeTestPossession(runtime, controlledEntityId);
      for (let tick = 0; tick < 480; tick += 1) {
        snapshot = await runtime.runFixedInput({
          actions: ["move-right", "run"],
          ticks: 1,
        });
        if (snapshot.subjectStatesByEntityId[controlledEntityId]!
          .positionMetersXYZ[0] >= 6) {
          break;
        }
      }
      const runningJumpStart = await beginSupportedJump(
        runtime,
        controlledEntityId,
        ["move-right", "run"],
      );
      const runningJump = runningJumpStart.snapshot;
      expect(runningJump.subjectStatesByEntityId[controlledEntityId])
        .toMatchObject({
        movementMedium: "air",
        locomotion: {
          status: "active",
          mobilityMode: "airborne",
          supportMode: "unsupported",
        },
      });
      expect(["takeoff", "rising"]).toContain(
        activeLocomotion(runningJump, controlledEntityId).verticalPhase,
      );
      const runningTakeoffPhaseEntryTicks = new Set(
        runningJumpStart.takeoffPhaseEntryTicks,
      );
      let runningLanded = runningJump;
      for (let tick = 0; tick < 180; tick += 1) {
        runningLanded = await runtime.runFixedInput({
          actions: ["move-right", "run"],
          ticks: 1,
        });
        const locomotion = activeLocomotion(
          runningLanded,
          controlledEntityId,
        );
        if (locomotion.verticalPhase === "takeoff") {
          runningTakeoffPhaseEntryTicks.add(locomotion.phaseEnteredTick);
        }
        if (
          locomotion.mobilityMode === "grounded" &&
          locomotion.verticalPhase === "none"
        ) break;
      }
      expect(runningTakeoffPhaseEntryTicks.size).toBe(1);
      expect(runningLanded.subjectStatesByEntityId[controlledEntityId])
        .toMatchObject({
        movementMedium: "ground",
        locomotion: {
          status: "active",
          mobilityMode: "grounded",
          verticalPhase: "none",
        },
      });
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("joins verified Block metadata to live Babylon and Havok handles without Scene scanning", async () => {
    const { runtime, scene } = await createRuntime();
    const registry = peekBabylonNativeLiveColliderRegistryV1(scene);
    const record = registry?.colliders[0];
    try {
      expect(registry).toMatchObject({
        kind: "babylon-native-live-collider-registry",
        schemaVersion: 1,
      });
      expect(registry?.colliders).toHaveLength(1);
      expect(record).toMatchObject({
        colliderId: "ground",
        chunkPartId: "ground-grid-chunk-xp0-zp0",
        chunkResidencyGroupId: "grid-chunk-xp0-zp0",
        sourceBlockIds: ["ground-block"],
        physicsBodyId: "physics-body:ground-grid-chunk-xp0-zp0",
        overlayRecordId: "overlay:ground-grid-chunk-xp0-zp0",
      });
      // One logical Collider stays one logical identity while the Runtime
      // realizes it as bounded Chunk parts.
      expect(registry?.residency).toMatchObject({
        logicalColliderCount: 1,
        partCount: 1,
        activePartCount: 1,
        peakActivePartCount: 1,
      });
      expect(registry?.residency.chunkPolicyHash)
        .toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(registry?.residency.partitionHash)
        .toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(record?.colliderSubshapeId).toMatch(
        /^collider-subshape:[a-f0-9]{64}$/,
      );
      expect(record?.body.isDisposed).toBe(false);
      expect(record?.body.transformNode).toBe(record?.mesh);
      expect(record?.body.shape).toBe(record?.shape);
      expect(record?.aggregate.transformNode).toBe(record?.mesh);
      expect(record?.aggregate.body).toBe(record?.body);
      expect(record?.aggregate.shape).toBe(record?.shape);

      const decoy = new Mesh("worldkit.native-collider.decoy", scene);
      decoy.metadata = {
        worldkitEntityId: "decoy",
        colliderSubshapeId: `collider-subshape:${"d".repeat(64)}`,
      };
      expect(peekBabylonNativeLiveColliderRegistryV1(scene)).toBe(registry);
    } finally {
      await runtime.dispose();
    }
    expect(peekBabylonNativeLiveColliderRegistryV1(scene)).toBeUndefined();
    expect(record?.body.isDisposed).toBe(true);
    expect(record?.mesh.isDisposed()).toBe(true);
  }, 15_000);

  it("keeps two admitted Candidate registries isolated", async () => {
    const first = await createRuntime();
    const second = await createRuntime();
    try {
      const firstRegistry = peekBabylonNativeLiveColliderRegistryV1(first.scene);
      const secondRegistry = peekBabylonNativeLiveColliderRegistryV1(second.scene);
      expect(firstRegistry).not.toBe(secondRegistry);
      expect(firstRegistry?.colliders[0]?.mesh)
        .not.toBe(secondRegistry?.colliders[0]?.mesh);
      await first.runtime.dispose();
      expect(peekBabylonNativeLiveColliderRegistryV1(first.scene))
        .toBeUndefined();
      expect(peekBabylonNativeLiveColliderRegistryV1(second.scene))
        .toBe(secondRegistry);
    } finally {
      await first.runtime.dispose();
      await second.runtime.dispose();
    }
  }, 15_000);

  it("unregisters and disposes live handles when initialization fails after Havok", async () => {
    let engine: NullEngine | undefined;
    let scene: Scene | undefined;
    let registry: ReturnType<
      typeof peekBabylonNativeLiveColliderRegistryV1
    >;
    const error = await createRuntime({
      engineFactory: () => {
        engine = new NullEngine({
          renderWidth: 64,
          renderHeight: 64,
          textureSize: 64,
          deterministicLockstep: true,
          lockstepMaxSteps: 4,
        });
        return engine;
      },
      onInitializationStage: (stage) => {
        if (stage !== "camera" || isNil(engine)) return;
        scene = engine.scenes[0];
        if (isNil(scene)) throw new Error("Candidate Scene missing.");
        registry = peekBabylonNativeLiveColliderRegistryV1(scene);
        throw new Error("expected camera-stage failure");
      },
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("expected camera-stage failure");
    expect(scene).toBeDefined();
    expect(registry?.colliders).toHaveLength(1);
    expect(peekBabylonNativeLiveColliderRegistryV1(scene!)).toBeUndefined();
    expect(registry?.colliders.every((record) =>
      record.body.isDisposed && record.mesh.isDisposed(),
    )).toBe(true);
    expect(scene?.isDisposed).toBe(true);
    expect(engine?.isDisposed).toBe(true);
  }, 15_000);

  it("unregisters before a throwing aggregate cleanup and still disposes siblings", async () => {
    const { runtime, scene } = await createRuntime();
    const registry = peekBabylonNativeLiveColliderRegistryV1(scene);
    const record = registry?.colliders[0];
    if (isNil(record)) throw new Error("Expected one live collider record.");
    const originalDispose = record.aggregate.dispose.bind(record.aggregate);
    record.aggregate.dispose = () => {
      originalDispose();
      throw new Error("expected aggregate cleanup failure");
    };

    await expect(runtime.dispose()).rejects.toThrow(
      "WORLDKIT_RUNTIME_DISPOSE_FAILED",
    );
    expect(peekBabylonNativeLiveColliderRegistryV1(scene)).toBeUndefined();
    expect(record.body.isDisposed).toBe(true);
    expect(record.mesh.isDisposed()).toBe(true);
    expect(scene.isDisposed).toBe(true);
  }, 15_000);
});
