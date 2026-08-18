import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpec } from "@whitebox-world/authoring";
import { compileWorld } from "@whitebox-world/compiler";
import { createValidAuthoringSpec } from "../../authoring/src/test-fixture";
import type { ExecutionPlanV1 } from "@whitebox-world/runtime-contracts";

import { BabylonWorldRuntime } from "./index";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

function createExecutionPlan(mutator?: (spec: ReturnType<typeof createValidAuthoringSpec>) => void): ExecutionPlanV1 {
  const spec = createValidAuthoringSpec();
  mutator?.(spec);
  const normalized = normalizeAuthoringSpec(spec);
  if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
    throw new Error(`Fixture normalize failed: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const compiled = compileWorld({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || compiled.executionPlan === undefined) {
    throw new Error(`Fixture compile failed: ${JSON.stringify(compiled.diagnostics)}`);
  }
  return compiled.executionPlan;
}

describe("BabylonWorldRuntime", () => {
  it("initializes a right-handed Babylon scene with Havok physics from an ExecutionPlan", async () => {
    const executionPlan = createExecutionPlan();
    const runtime = await BabylonWorldRuntime.create({
      executionPlan,
      havokWasmBinary,
      engineFactory: () => new NullEngine({
        renderWidth: 640,
        renderHeight: 360,
        textureSize: 512,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      }),
    });

    expect(runtime.snapshot()).toMatchObject({
      runtimeBackend: "babylon-havok",
      ready: true,
      physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
      subject: { entityId: "player", movementMedium: "ground" },
      resources: { bodies: 3, terrainSamples: 65 * 65 },
    });
    expect(runtime.snapshot().resources.meshes).toBeGreaterThanOrEqual(4);

    await runtime.dispose();
    await runtime.dispose();
  });

  it("moves by semantic fixed input but cannot pass through a fixed wall", async () => {
    const executionPlan = createExecutionPlan((spec) => {
      const wall = spec.resources.prototypes[0];
      if (wall === undefined) throw new Error("Fixture wall prototype missing.");
      wall.sizeMetersXYZ = [14, 4, 2];
      const wallNode = spec.nodes.find((node) => node.kind === "object");
      if (wallNode?.kind !== "object") throw new Error("Fixture wall node missing.");
      wallNode.transform.positionMeters = [0, 2, 25];
    });
    const runtime = await BabylonWorldRuntime.create({
      executionPlan,
      havokWasmBinary,
      engineFactory: () => new NullEngine({
        renderWidth: 640,
        renderHeight: 360,
        textureSize: 512,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      }),
    });

    const initial = runtime.snapshot();
    const moved = await runtime.runFixedInput({ actions: ["move-forward"], ticks: 180 });

    expect(moved.tick).toBe(180);
    expect(moved.subject.positionMeters[2]).toBeLessThan(initial.subject.positionMeters[2]);
    expect(moved.subject.positionMeters[2]).toBeGreaterThan(26.1);
    await runtime.dispose();
  });

  it("changes movement medium when the subject enters a declared swimmable water boundary", async () => {
    const executionPlan = createExecutionPlan((spec) => {
      const water = spec.nodes.find((node) => node.kind === "water");
      if (water?.kind !== "water") throw new Error("Fixture water node missing.");
      water.components.water.boundary = { kind: "ellipse", centerXZ: [7, 30], radiusMetersXZ: [3, 5] };
    });
    const runtime = await BabylonWorldRuntime.create({
      executionPlan,
      havokWasmBinary,
      engineFactory: () => new NullEngine({
        renderWidth: 640,
        renderHeight: 360,
        textureSize: 512,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      }),
    });

    const snapshot = await runtime.runFixedInput({ actions: ["move-right"], ticks: 90 });

    expect(snapshot.subject.positionMeters[0]).toBeGreaterThan(4);
    expect(snapshot.subject.movementMedium).toBe("water");
    await runtime.dispose();
  });

  it("resets deterministic runtime state to the compiled spawn", async () => {
    const executionPlan = createExecutionPlan();
    const runtime = await BabylonWorldRuntime.create({
      executionPlan,
      havokWasmBinary,
      engineFactory: () => new NullEngine({
        renderWidth: 640,
        renderHeight: 360,
        textureSize: 512,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      }),
    });
    await runtime.runFixedInput({ actions: ["move-left"], ticks: 30 });

    const reset = runtime.reset();

    expect(reset.tick).toBe(0);
    expect(reset.subject.positionMeters).toEqual(executionPlan.subject.spawnPositionMeters);
    expect(reset.subject.velocityMetersPerSecond).toEqual([0, 0, 0]);
    await runtime.dispose();
  });
});
