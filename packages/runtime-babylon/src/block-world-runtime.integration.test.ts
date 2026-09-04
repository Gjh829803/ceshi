import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import {
  BLOCK_PRESET_REFS_V1,
  BLOCK_SURFACE_PROFILE_REFS_V1,
  createBlockWorldManifestV2,
  type CheckBlockWorldInputV2,
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
  it("keeps normal, ice, and mud distinct for registered and custom Subjects", async () => {
    const surfaceByZ = new Map<number, string>([
      [-3, BLOCK_PRESET_REFS_V1.walkableIce],
      [-2, BLOCK_PRESET_REFS_V1.walkableIce],
      [-1, BLOCK_PRESET_REFS_V1.walkable],
      [0, BLOCK_PRESET_REFS_V1.walkable],
      [1, BLOCK_PRESET_REFS_V1.walkableMud],
      [2, BLOCK_PRESET_REFS_V1.walkableMud],
    ]);
    const blocks = [...surfaceByZ].flatMap(([z, presetRef]) =>
      Array.from({ length: 41 }, (_, index) => ({
        id: `surface-${z + 3}-${String(index).padStart(2, "0")}`,
        presetRef,
        shape: "full" as const,
        positionMetersXYZ: [index - 20, 0, z] as const,
        rotationQuarterTurnsY: 0,
      })));
    const baseInput: CheckBlockWorldInputV2 = {
      manifest: createBlockWorldManifestV2(blocks),
      world: { id: "block-runtime-ground-surfaces", seed: 86 },
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
      spawnStandPositionMetersXYZ: [0, 0.5, 0],
      requiredTargets: [],
      requiredGroundTraversalBands: [],
      visualTargetFacings: [],
      spaceTransitions: [],
      requireSingleReachableComponent: true,
    };
    const compiled = compileBlockWorldV2(baseInput);
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
          return { bytes: gBotBytes, sourceLabel: "surface-profile-test-memory" };
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
      const internals = runtime as unknown as {
        scene: {
          meshes: readonly Readonly<{
            metadata?: Record<string, unknown>;
            physicsBody?: {
              shape?: { material?: { friction?: number } };
            };
          }>[];
        };
        characterFor(entityId: string): {
          movement: {
            resetAt(
              positionMetersXYZ: readonly [number, number, number],
              facingYawRadians: number,
            ): void;
          };
        };
      };
      const collisionFrictionByProfile = new Map<string, number>();
      for (const mesh of internals.scene.meshes) {
        if (typeof mesh.metadata?.blockWorldCollisionChunkKey !== "string") continue;
        const surfaceProfileRef = mesh.metadata.blockWorldSurfaceProfileRef;
        const friction = mesh.physicsBody?.shape?.material?.friction;
        if (typeof surfaceProfileRef === "string" && typeof friction === "number") {
          collisionFrictionByProfile.set(surfaceProfileRef, friction);
        }
      }
      expect(collisionFrictionByProfile).toEqual(new Map([
        [BLOCK_SURFACE_PROFILE_REFS_V1.normal, 0.75],
        [BLOCK_SURFACE_PROFILE_REFS_V1.ice, 0.05],
        [BLOCK_SURFACE_PROFILE_REFS_V1.mud, 1],
      ]));

      const measure = async (zMeters: number) => {
        internals.characterFor("player").movement.resetAt(
          [0, 0.5, zMeters],
          0,
        );
        await runtime.runFixedInput({ actions: [], ticks: 1 });
        const first = await runtime.runFixedInput({
          actions: ["move-right"],
          ticks: 1,
        });
        const firstSpeed = first.subjectStatesByEntityId.player!
          .velocityMetersPerSecondXYZ[0];
        const accelerated = await runtime.runFixedInput({
          actions: ["move-right"],
          ticks: 29,
        });
        const beforeStop = accelerated.subjectStatesByEntityId.player!
          .velocityMetersPerSecondXYZ[0];
        const stopped = await runtime.runFixedInput({ actions: [], ticks: 1 });
        const afterStop = stopped.subjectStatesByEntityId.player!
          .velocityMetersPerSecondXYZ[0];
        return { firstSpeed, beforeStop, stoppingLoss: beforeStop - afterStop };
      };
      const normal = await measure(0);
      const ice = await measure(-2);
      const mud = await measure(2);
      expect(ice.firstSpeed).toBeCloseTo(normal.firstSpeed * 0.35, 5);
      expect(mud.firstSpeed).toBeCloseTo(normal.firstSpeed * 0.6, 5);
      expect(mud.beforeStop).toBeLessThan(normal.beforeStop * 0.6);
      expect(ice.stoppingLoss).toBeCloseTo(normal.stoppingLoss * 0.12, 5);
      expect(mud.stoppingLoss).toBeGreaterThan(normal.stoppingLoss);
    } finally {
      await runtime.dispose();
    }

    const customCompiled = compileBlockWorldV2({
      ...baseInput,
      world: { id: "block-runtime-custom-ground-surfaces", seed: 87 },
      controlledSubject: {
        kind: "composed",
        entityId: "custom-player",
        visualTargetId: "visual-target-1",
        yawQuarterTurnsY: 0,
        definition: {
          id: "block-runtime-surface-proxy",
          category: "human",
          bodyTopology: "custom",
          semanticClassId: "subject.custom.block-runtime-surface-proxy",
          displayName: "Surface Proxy",
          description: "Rigid custom Mesh path for surface response testing.",
          visualBinding: { kind: "static" },
          visualParts: [{
            id: "body",
            kind: "primitive",
            shape: { kind: "box", sizeMetersXYZ: [0.6, 1.8, 0.4] },
            positionMetersXYZ: [0, 0.9, 0],
            colliderContribution: "include",
            semanticTags: ["body", "custom"],
          }],
        },
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
    });
    expect(customCompiled.ok, JSON.stringify(customCompiled.diagnostics)).toBe(true);
    if (!customCompiled.ok) return;
    const customRuntime = await BabylonWorldRuntime.create({
      sceneSource: {
        kind: "canonical-execution-plan",
        executionPlan: customCompiled.canonicalSceneExecutionPlan,
      },
      worldRuntimeBootstrap: customCompiled.worldRuntimeBootstrap,
      gameplayBootstrap: customCompiled.gameplayBootstrap,
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
      await bindRuntimeTestPossession(customRuntime, "custom-player");
      const customInternals = customRuntime as unknown as {
        characterFor(entityId: string): {
          movement: {
            resetAt(
              positionMetersXYZ: readonly [number, number, number],
              facingYawRadians: number,
            ): void;
          };
        };
      };
      const firstSpeedAt = async (zMeters: number) => {
        customInternals.characterFor("custom-player").movement.resetAt(
          [0, 0.5, zMeters],
          0,
        );
        await customRuntime.runFixedInput({ actions: [], ticks: 1 });
        const moved = await customRuntime.runFixedInput({
          actions: ["move-right"],
          ticks: 1,
        });
        return moved.subjectStatesByEntityId["custom-player"]!
          .velocityMetersPerSecondXYZ[0];
      };
      const normalFirstSpeed = await firstSpeedAt(0);
      const iceFirstSpeed = await firstSpeedAt(-2);
      expect(iceFirstSpeed).toBeCloseTo(normalFirstSpeed * 0.35, 5);
    } finally {
      await customRuntime.dispose();
    }
  }, 30_000);

  it("keeps fixed presentation independent from ground movement on a rigged base", async () => {
    const compiled = compileBlockWorldV2({
      manifest: createBlockWorldManifestV2(
        Array.from({ length: 81 }, (_, index) => ({
          id: `fixed-ground-${String(index).padStart(3, "0")}`,
          presetRef: BLOCK_PRESET_REFS_V1.walkable,
          shape: "full" as const,
          positionMetersXYZ: [index % 9 - 4, 0, Math.floor(index / 9) - 4] as const,
          rotationQuarterTurnsY: 0,
        }))),
      world: { id: "block-runtime-fixed-presentation", seed: 85 },
      controlledSubject: {
        kind: "assembly",
        entityId: "fixed-rider",
        visualTargetId: "visual-target-1",
        yawQuarterTurnsY: 0,
        assembly: {
          id: "fixed-presentation-rider",
          baseSubject: {
            kind: "subject-pack",
            subjectPackId: "humanoid.g-bot",
          },
          attachments: [],
          motion: { motionPackId: "ground.character-standard" },
          presentation: {
            kind: "fixed-locomotion",
            presentationKey: "locomotion.idle",
          },
        },
      },
      subjectMeshParts: [],
      camera: {
        kind: "pack",
        entityId: "camera-main",
        cameraPackId: "third-person.over-shoulder",
        target: { kind: "base-subject-bounds", heightRatio: 0.65 },
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
      spawnStandPositionMetersXYZ: [0, 0.5, 0],
      requiredTargets: [],
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
          return { bytes: gBotBytes, sourceLabel: "fixed-presentation-test-memory" };
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
      await bindRuntimeTestPossession(runtime, "fixed-rider");
      const advanced = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 45,
      });
      const subject = advanced.subjectStatesByEntityId["fixed-rider"]!;
      expect(Math.hypot(subject.positionMetersXYZ[0], subject.positionMetersXYZ[2]))
        .toBeGreaterThan(1);
      expect(subject.activeActionId).toBe("idle");
      expect(advanced.camera.activeCameraModifierRefs).toContain(
        "worldkit://camera-modifier/aim-framing@1",
      );
      expect(advanced.camera.resolvedParameters?.shoulderOffsetMeters).toBe(0.55);
      expect(advanced.camera.selectedTargetSocketId).toBe("AssemblyCameraTarget");
      expect(effectiveCameraArmLength(advanced.camera)).toBeLessThanOrEqual(
        advanced.camera.safeArmLengthMeters! + 0.000001,
      );
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it("moves a rigged base and rigid sword attachment as one powered-flight assembly without gait animation", async () => {
    const ground = Array.from({ length: 81 }, (_, index) => ({
      id: `flight-ground-${String(index).padStart(3, "0")}`,
      presetRef: BLOCK_PRESET_REFS_V1.walkableIce,
      shape: "full" as const,
      positionMetersXYZ: [index % 9 - 4, 0, Math.floor(index / 9) - 4] as const,
      rotationQuarterTurnsY: 0,
    }));
    const wall = Array.from({ length: 25 }, (_, index) => ({
      id: `flight-wall-${String(index).padStart(3, "0")}`,
      presetRef: BLOCK_PRESET_REFS_V1.obstacle,
      shape: "full" as const,
      positionMetersXYZ: [index % 5 - 2, Math.floor(index / 5) + 1, -4] as const,
      rotationQuarterTurnsY: 0,
    }));
    const compiled = compileBlockWorldV2({
      manifest: createBlockWorldManifestV2([...ground, ...wall]),
      world: { id: "block-runtime-flying-sword", seed: 84 },
      controlledSubject: {
        kind: "assembly",
        entityId: "flying-rider",
        visualTargetId: "visual-target-1",
        yawQuarterTurnsY: 0,
        assembly: {
          id: "flying-sword-rider",
          baseSubject: {
            kind: "subject-pack",
            subjectPackId: "humanoid.g-bot",
          },
          attachments: [{ subjectMeshBindingId: "flying-sword" }],
          motion: { motionPackId: "flight.powered-standard" },
          presentation: {
            kind: "fixed-locomotion",
            presentationKey: "locomotion.idle",
          },
        },
      },
      subjectMeshParts: [{
        id: "flying-sword",
        kind: "primitive",
        shape: { kind: "box", sizeMetersXYZ: [0.18, 0.08, 2.4] },
        positionMetersXYZ: [0, -0.12, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        colliderContribution: "exclude",
        semanticTags: ["attachment", "sword"],
      }],
      camera: {
        kind: "pack",
        entityId: "camera-main",
        cameraPackId: "third-person.standard",
        target: {
          kind: "base-subject-socket",
          socketId: "ThirdPersonTarget",
        },
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
      spawnStandPositionMetersXYZ: [0, 0.5, 0],
      requiredTargets: [],
      requiredGroundTraversalBands: [],
      visualTargetFacings: [],
      spaceTransitions: [],
      requireSingleReachableComponent: false,
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
          return { bytes: gBotBytes, sourceLabel: "flying-sword-test-memory" };
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
      await bindRuntimeTestPossession(runtime, "flying-rider");
      const lifted = await runtime.runFixedInput({ actions: ["jump"], ticks: 30 });
      expect(lifted.subjectStatesByEntityId["flying-rider"]!.positionMetersXYZ[1])
        .toBeGreaterThan(1);
      const advanced = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 60,
      });
      const subject = advanced.subjectStatesByEntityId["flying-rider"]!;
      expect(subject.positionMetersXYZ[2]).toBeLessThan(-2);
      expect(subject.positionMetersXYZ[2]).toBeGreaterThan(-3.8);
      expect(subject.activeActionId).toBe("idle");
      expect(advanced.camera.selectedTargetSocketId).toBe("ThirdPersonTarget");
      expect(advanced.camera.decollisionPhase).not.toBe("emergency-inside");
      expect(effectiveCameraArmLength(advanced.camera)).toBeLessThanOrEqual(
        advanced.camera.safeArmLengthMeters! + 0.000001,
      );
      const internals = runtime as unknown as {
        scene: { getMeshByName(name: string): { metadata?: unknown } | null };
      };
      expect(internals.scene.getMeshByName("flying-rider.flying-sword")?.metadata)
        .toMatchObject({
          worldkitEntityId: "flying-rider",
          subjectVisualPartId: "flying-sword",
        });

      runtime.reset();
      await bindRuntimeTestPossession(runtime, "flying-rider");
      for (let tick = 0; tick < 30; tick += 1) {
        await runtime.runFixedInput({ actions: ["jump"], ticks: 1 });
      }
      let replay = runtime.snapshot();
      for (let tick = 0; tick < 60; tick += 1) {
        replay = await runtime.runFixedInput({
          actions: ["move-forward"],
          ticks: 1,
        });
      }
      expect(replay.subjectStatesByEntityId["flying-rider"]!.positionMetersXYZ)
        .toEqual(subject.positionMetersXYZ);
      expect(replay.subjectStatesByEntityId["flying-rider"]!.velocityMetersPerSecondXYZ)
        .toEqual(subject.velocityMetersPerSecondXYZ);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

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
      expect(rampCameraSamples.every((camera) => {
        const safeArmLengthMeters = camera.safeArmLengthMeters;
        return safeArmLengthMeters !== undefined &&
          effectiveCameraArmLength(camera) <=
            safeArmLengthMeters + 0.000001;
      })).toBe(true);
      expect(rampCameraSamples.every(({ decollisionPhase }) =>
        decollisionPhase !== "emergency-inside")).toBe(true);
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
