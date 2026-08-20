import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { describe, expect, it } from "vitest";

import { loadAuthoringScene } from "../../../apps/playground/src/authoring-loader";
import { createValidAuthoringSpec } from "../../authoring/src/test-fixture";
import { BabylonWorldRuntime } from "./babylon-world-runtime";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve(
    "@babylonjs/havok/lib/esm/HavokPhysics.wasm",
  ),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

const WHITEBOX_PACKAGES = [
  [
    "worldkit://subject-definition/animal.quadruped.forward-steer@1",
    "worldkit://motion-kernel/forward-steer@1",
  ],
  [
    "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
    "worldkit://motion-kernel/wheeled-arcade@1",
  ],
  [
    "worldkit://subject-definition/surface-craft.ice-skimmer@1",
    "worldkit://motion-kernel/surface-slide@1",
  ],
  [
    "worldkit://subject-definition/watercraft.kayak.surface@1",
    "worldkit://motion-kernel/water-surface@1",
  ],
  [
    "worldkit://subject-definition/glider.paraglider.unpowered@1",
    "worldkit://motion-kernel/unpowered-glide@1",
  ],
] as const;

describe("capability package runtime smoke tests", () => {
  it.each(WHITEBOX_PACKAGES)(
    "runs %s through its committed Kernel, Camera Director and H01-H09 harness",
    async (subjectDefinitionRef, motionKernelRef) => {
      const loaded = await loadAuthoringScene(
        async () => new Response(JSON.stringify(createValidAuthoringSpec())),
        { subjectDefinitionRef },
      );
      if (!loaded.ok || loaded.executionPlan === undefined) {
        throw new Error(
          `Capability package failed to load: ${JSON.stringify(loaded.diagnostics)}`,
        );
      }
      const runtime = await BabylonWorldRuntime.create({
        executionPlan: loaded.executionPlan,
        havokWasmBinary,
        engineFactory: () =>
          new NullEngine({
            renderWidth: 640,
            renderHeight: 360,
            textureSize: 512,
            deterministicLockstep: true,
            lockstepMaxSteps: 4,
          }),
      });
      try {
        const snapshot = await runtime.runFixedInput({
          actions: ["move-forward"],
          ticks: 30,
        });
        const state = snapshot.subjectStatesByEntityId.player!;
        const harness = await runtime.runHarness("player");

        expect(state.activeMotionKernelRef).toBe(motionKernelRef);
        expect(
          [...state.positionMetersXYZ, ...state.velocityMetersPerSecondXYZ].every(
            Number.isFinite,
          ),
        ).toBe(true);
        expect(snapshot.camera.positionMetersXYZ.every(Number.isFinite)).toBe(true);
        expect(harness.passed).toBe(true);
        expect(harness.checks).toHaveLength(9);
      } finally {
        await runtime.dispose();
      }
    },
  );
});
