import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import {
  BLOCK_PRESET_REFS_V1,
  createBlockWorldManifestV2,
} from "@whitebox-world/block-world";
import { compileBlockWorldV2 } from "@whitebox-world/block-world-compiler";
import type { ActiveLocomotionCapabilityStateV2 } from "@whitebox-world/gameplay-contracts";
import { describe, expect, it } from "vitest";

import { BabylonWorldRuntime } from "./babylon-world-runtime.js";
import type {
  BabylonRuntimeCameraProjectionV1,
  BabylonRuntimeSubjectProjectionV1,
} from "./runtime-projection.js";
import { bindRuntimeTestPossession } from "./runtime-test-possession.js";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;
const gBotBytes = new Uint8Array(await readFile(
  new URL("../../../apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb", import.meta.url),
));

function activeLocomotion(
  subject: BabylonRuntimeSubjectProjectionV1,
): ActiveLocomotionCapabilityStateV2 {
  const locomotion = subject.locomotion;
  if (locomotion?.status !== "active") {
    throw new Error(`Expected active locomotion for ${subject.entityId}.`);
  }
  return locomotion;
}

function effectiveCameraArmLength(
  camera: BabylonRuntimeCameraProjectionV1,
): number {
  const effectiveArmLengthMeters = camera.effectiveArmLengthMeters;
  if (effectiveArmLengthMeters === undefined) {
    throw new Error("Expected an effective Runtime camera arm length.");
  }
  return effectiveArmLengthMeters;
}

describe("Block World Babylon integration", () => {
  it("starts the current main Runtime with batched Block geometry and resident collisions", async () => {
    const compiled = compileBlockWorldV2({
      manifest: createBlockWorldManifestV2([
        {
          id: "ground-000",
          presetRef: BLOCK_PRESET_REFS_V1.walkable,
          shape: "full",
          positionMetersXYZ: [0, 0, 0],
          rotationQuarterTurnsY: 0,
        },
        {
          id: "ground-001",
          presetRef: BLOCK_PRESET_REFS_V1.walkable,
          shape: "full",
          positionMetersXYZ: [1, 0, 0],
          rotationQuarterTurnsY: 0,
        },
        {
          id: "marker-000",
          presetRef: BLOCK_PRESET_REFS_V1.landmarkOrange,
          shape: "full",
          positionMetersXYZ: [3, 1, 0],
          rotationQuarterTurnsY: 0,
          visualGroupId: "visual-target-2",
        },
      ]),
      world: { id: "block-runtime-integration", seed: 84 },
      controlledSubject: {
        kind: "composed",
        entityId: "player",
        visualTargetId: "visual-target-1",
        yawQuarterTurnsY: 0,
        definition: {
          id: "block-runtime-person",
          category: "human",
          bodyTopology: "biped",
          semanticClassId: "subject.humanoid.block-runtime-person",
          displayName: "Block Runtime Person",
          description: "A compact static humanoid proxy for Block Runtime integration.",
          visualBinding: { kind: "static" },
          visualParts: [{
            id: "body",
            kind: "primitive",
            shape: { kind: "box", sizeMetersXYZ: [0.6, 1.8, 0.4] },
            positionMetersXYZ: [0, 0.9, 0],
            colliderContribution: "include",
            semanticTags: ["body", "humanoid"],
          }],
        },
      },
      camera: {
        entityId: "camera-main",
        pitchRadians: 0.12,
        distanceMeters: 5,
        targetHeightMeters: 1.25,
        fovDegrees: 56,
        aspectRatio: 16 / 9,
      },
      subjectTraversalProfile: {
        clearanceHeightMeters: 2,
        footprintRadiusMetersXZ: 0,
        maximumStepUpMeters: 1,
        maximumStepDownMeters: 1,
        maximumAutoSmoothHeightDeltaMeters: 1,
        maximumAdjacentWalkableHeightDeltaMeters: 2,
        canStandOnCloud: false,
      },
      spawnStandPositionMetersXYZ: [0, 0.5, 0],
      requiredTargets: [{
        id: "nearby-ground",
        navigationRole: "remote",
        standPositionMetersXYZ: [1, 0.5, 0],
      }],
      requiredGroundTraversalBands: [],
      visualTargetFacings: [{
        visualTargetId: "visual-target-2",
        frontYawQuarterTurnsY: 0,
      }],
      spaceTransitions: [],
      requireSingleReachableComponent: true,
    });
    expect(compiled.ok, JSON.stringify(compiled.diagnostics)).toBe(true);
    if (!compiled.ok) return;
    const runtime = await BabylonWorldRuntime.create({
      sceneSource: {
        kind: "canonical-execution-plan",
      executionPlan: compiled.canonicalSceneExecutionPlan,
      },
      worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
      gameplayBootstrap: compiled.gameplayBootstrap,
      havokWasmBinary,
      engineFactory: () => new NullEngine({
        renderWidth: 640,
        renderHeight: 360,
        textureSize: 512,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      }),
    });
    try {
      const initial = runtime.snapshot();
      const runtimeInternals = runtime as unknown as {
        readonly ownedTerrainShape: unknown;
        readonly scene: {
          getMeshById(id: string): unknown;
        };
      };
      expect(initial.resources.terrainSamples).toBe(0);
      expect(runtimeInternals.ownedTerrainShape).toBeUndefined();
      expect(runtimeInternals.scene.getMeshById(
        compiled.canonicalSceneExecutionPlan.terrain.entityId,
      )).toBeNull();
      expect(initial.subjectStatesByEntityId.player?.positionMetersXYZ).toEqual([
        0,
        0.5,
        0,
      ]);
      const afterTick = await runtime.runFixedInput({ actions: [], ticks: 1 });
      expect(afterTick.tick).toBe(1);
      expect(afterTick.ready).toBe(true);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("preserves ground speed and support while traversing an auto-smoothed Block World ramp", async () => {
    const blocks = [];
    for (let x = -8; x <= 18; x += 1) {
      const centerY = Math.min(6, Math.max(0, x * 0.5));
      for (let z = -2; z <= 2; z += 1) {
        blocks.push({
          id: `ramp-${x + 8}-${z + 2}`,
          presetRef: BLOCK_PRESET_REFS_V1.walkable,
          shape: "full" as const,
          positionMetersXYZ: [x, centerY, z] as const,
          rotationQuarterTurnsY: 0,
        });
      }
      blocks.push({
        id: `edge-rail-${x + 8}`,
        presetRef: BLOCK_PRESET_REFS_V1.obstacle,
        shape: "quarter" as const,
        positionMetersXYZ: [x, centerY + 0.75, 2.75] as const,
        rotationQuarterTurnsY: 1,
      });
      if ((x + 8) % 5 === 0) blocks.push({
        id: `edge-post-${x + 8}`,
        presetRef: BLOCK_PRESET_REFS_V1.obstacle,
        shape: "small" as const,
        positionMetersXYZ: [x + 0.25, centerY + 1.25, 2.75] as const,
        rotationQuarterTurnsY: 0,
      });
    }
    const compiled = compileBlockWorldV2({
      manifest: createBlockWorldManifestV2(blocks),
      world: { id: "block-runtime-smooth-ramp", seed: 84 },
      controlledSubject: {
        kind: "registered",
        entityId: "player",
        subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
        visualTargetId: "visual-target-1",
        yawQuarterTurnsY: 0,
      },
      camera: {
        entityId: "camera-main",
        pitchRadians: 0.12,
        distanceMeters: 5,
        targetHeightMeters: 1.25,
        fovDegrees: 56,
        aspectRatio: 16 / 9,
      },
      subjectTraversalProfile: {
        clearanceHeightMeters: 1.8,
        footprintRadiusMetersXZ: 0.35,
        maximumStepUpMeters: 0.3,
        maximumStepDownMeters: 0.3,
        maximumAutoSmoothHeightDeltaMeters: 1,
        maximumAdjacentWalkableHeightDeltaMeters: 2,
        canStandOnCloud: false,
      },
      spawnStandPositionMetersXYZ: [-6, 0.5, 0],
      requiredTargets: [{
        id: "ramp-end",
        navigationRole: "remote",
        standPositionMetersXYZ: [16, 6.5, 0],
      }],
      requiredGroundTraversalBands: [],
      visualTargetFacings: [],
      spaceTransitions: [],
      requireSingleReachableComponent: true,
    });
    expect(compiled.ok, JSON.stringify(compiled.diagnostics)).toBe(true);
    if (!compiled.ok) return;
    const runtime = await BabylonWorldRuntime.create({
      sceneSource: {
        kind: "canonical-execution-plan",
        executionPlan: compiled.canonicalSceneExecutionPlan,
      },
      worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
      gameplayBootstrap: compiled.gameplayBootstrap,
      subjectAssetResolver: {
        async resolveSubjectAsset() {
          return { bytes: gBotBytes, sourceLabel: "block-ramp-test-memory" };
        },
      },
      havokWasmBinary,
      engineFactory: () => new NullEngine({
        renderWidth: 640,
        renderHeight: 360,
        textureSize: 512,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      }),
    });
    try {
      await bindRuntimeTestPossession(runtime, "player");
      let snapshot = runtime.snapshot();
      for (let tick = 0; tick < 180; tick += 1) {
        snapshot = await runtime.runFixedInput({
          actions: ["move-backward"],
          ticks: 1,
        });
        if (snapshot.subjectStatesByEntityId.player!.positionMetersXYZ[2] >= 2.119) {
          break;
        }
      }
      expect(snapshot.subjectStatesByEntityId.player!.positionMetersXYZ[2])
        .toBeGreaterThanOrEqual(2.119);
      const rampSamples = [];
      const rampCameraSamples = [];
      for (let tick = 0; tick < 720; tick += 1) {
        snapshot = await runtime.runFixedInput({ actions: ["move-right"], ticks: 1 });
        const subject = snapshot.subjectStatesByEntityId.player!;
        if (subject.positionMetersXYZ[0] >= 2 && subject.positionMetersXYZ[0] <= 14) {
          rampSamples.push(subject);
          rampCameraSamples.push(snapshot.camera);
        }
        if (subject.positionMetersXYZ[0] >= 14) break;
      }
      expect(rampSamples.length).toBeGreaterThan(30);
      expect(rampSamples.every((subject) =>
        activeLocomotion(subject).supportMode === "supported" &&
        activeLocomotion(subject).mobilityMode === "grounded" &&
        activeLocomotion(subject).verticalPhase === "none"
      ), JSON.stringify(rampSamples.filter((subject) =>
        activeLocomotion(subject).supportMode !== "supported" ||
        activeLocomotion(subject).mobilityMode !== "grounded" ||
        activeLocomotion(subject).verticalPhase !== "none"
      ).slice(0, 8))).toBe(true);
      expect(Math.min(...rampSamples.map(({ speedMetersPerSecond }) =>
        speedMetersPerSecond))).toBeGreaterThanOrEqual(2.2);
      expect(rampCameraSamples.every(({ isCollisionRetracted }) =>
        isCollisionRetracted === false)).toBe(true);
      expect(Math.min(...rampCameraSamples.map(effectiveCameraArmLength)))
        .toBeGreaterThanOrEqual(4.9);
      expect(snapshot.subjectStatesByEntityId.player!.positionMetersXYZ[0])
        .toBeGreaterThan(12);

      runtime.reset();
      await bindRuntimeTestPossession(runtime, "player");
      for (let tick = 0; tick < 720; tick += 1) {
        snapshot = await runtime.runFixedInput({ actions: ["move-right"], ticks: 1 });
        if (snapshot.subjectStatesByEntityId.player!.positionMetersXYZ[0] >= 14) break;
      }
      const downhillSamples = [];
      for (let tick = 0; tick < 720; tick += 1) {
        snapshot = await runtime.runFixedInput({ actions: ["move-left"], ticks: 1 });
        const subject = snapshot.subjectStatesByEntityId.player!;
        if (
          subject.velocityMetersPerSecondXYZ[0] < -2.2 &&
          subject.positionMetersXYZ[0] >= 2 &&
          subject.positionMetersXYZ[0] <= 12
        ) downhillSamples.push(subject);
        if (subject.positionMetersXYZ[0] <= 0) break;
      }
      expect(downhillSamples.length).toBeGreaterThan(30);
      expect(downhillSamples.every((subject) =>
        activeLocomotion(subject).supportMode !== "unsupported" &&
        activeLocomotion(subject).mobilityMode === "grounded" &&
        activeLocomotion(subject).verticalPhase === "none"
      ), JSON.stringify(downhillSamples.filter((subject) =>
        activeLocomotion(subject).supportMode === "unsupported" ||
        activeLocomotion(subject).mobilityMode !== "grounded" ||
        activeLocomotion(subject).verticalPhase !== "none"
      ).slice(0, 8))).toBe(true);
      expect(Math.min(...downhillSamples.map(({ speedMetersPerSecond }) =>
        speedMetersPerSecond))).toBeGreaterThanOrEqual(2.2);

      for (let tick = 0; tick < 720; tick += 1) {
        snapshot = await runtime.runFixedInput({ actions: ["move-right"], ticks: 1 });
        if (snapshot.subjectStatesByEntityId.player!.positionMetersXYZ[0] >= 8) break;
      }
      expect(snapshot.subjectStatesByEntityId.player!.positionMetersXYZ[0])
        .toBeGreaterThan(7.9);
      const jump = await runtime.runFixedInput({
        actions: ["move-right", "jump"],
        ticks: 1,
      });
      const jumpLocomotion = activeLocomotion(
        jump.subjectStatesByEntityId.player!,
      );
      expect(jumpLocomotion).toMatchObject({
        mobilityMode: "airborne",
        verticalPhase: "takeoff",
        supportMode: "unsupported",
      });
      const takeoffPhaseEntryTicks = new Set<number>([
        jumpLocomotion.phaseEnteredTick,
      ]);
      let landed = jump;
      for (let tick = 0; tick < 180; tick += 1) {
        landed = await runtime.runFixedInput({ actions: ["move-right"], ticks: 1 });
        const locomotion = activeLocomotion(
          landed.subjectStatesByEntityId.player!,
        );
        if (locomotion.verticalPhase === "takeoff") {
          takeoffPhaseEntryTicks.add(locomotion.phaseEnteredTick);
        }
        if (
          locomotion.mobilityMode === "grounded" &&
          locomotion.verticalPhase === "none"
        ) break;
      }
      expect(takeoffPhaseEntryTicks.size).toBe(1);
      expect(activeLocomotion(
        landed.subjectStatesByEntityId.player!,
      )).toMatchObject({
        mobilityMode: "grounded",
        verticalPhase: "none",
      });

      runtime.reset();
      await bindRuntimeTestPossession(runtime, "player");
      for (let tick = 0; tick < 720; tick += 1) {
        snapshot = await runtime.runFixedInput({
          actions: ["move-right", "run"],
          ticks: 1,
        });
        if (snapshot.subjectStatesByEntityId.player!.positionMetersXYZ[0] >= 8) break;
      }
      const runningJump = await runtime.runFixedInput({
        actions: ["move-right", "run", "jump"],
        ticks: 1,
      });
      const runningJumpLocomotion = activeLocomotion(
        runningJump.subjectStatesByEntityId.player!,
      );
      expect(runningJumpLocomotion).toMatchObject({
        mobilityMode: "airborne",
        verticalPhase: "takeoff",
        supportMode: "unsupported",
      });
      const runningTakeoffPhaseEntryTicks = new Set<number>([
        runningJumpLocomotion.phaseEnteredTick,
      ]);
      let runningLanded = runningJump;
      for (let tick = 0; tick < 180; tick += 1) {
        runningLanded = await runtime.runFixedInput({
          actions: ["move-right", "run"],
          ticks: 1,
        });
        const locomotion = activeLocomotion(
          runningLanded.subjectStatesByEntityId.player!,
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
      expect(activeLocomotion(
        runningLanded.subjectStatesByEntityId.player!,
      )).toMatchObject({
        mobilityMode: "grounded",
        verticalPhase: "none",
      });

    } finally {
      await runtime.dispose();
    }
  }, 30_000);
});
