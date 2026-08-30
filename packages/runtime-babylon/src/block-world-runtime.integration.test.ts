import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import {
  BLOCK_PRESET_REFS_V1,
  createBlockWorldManifestV2,
} from "@whitebox-world/block-world";
import { compileBlockWorldV2 } from "@whitebox-world/block-world-compiler";
import { describe, expect, it } from "vitest";

import { BabylonWorldRuntime } from "./babylon-world-runtime.js";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

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
});
