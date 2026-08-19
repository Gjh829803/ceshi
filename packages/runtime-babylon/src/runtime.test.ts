import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpec } from "@whitebox-world/authoring";
import { compileWorld } from "@whitebox-world/compiler";
import { createValidAuthoringSpec } from "../../authoring/src/test-fixture";
import type { ExecutionPlanV2 } from "@whitebox-world/runtime-contracts";

import { BabylonWorldRuntime } from "./index";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

function createExecutionPlan(mutator?: (spec: ReturnType<typeof createValidAuthoringSpec>) => void): ExecutionPlanV2 {
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

function createMultiSubjectExecutionPlan(): ExecutionPlanV2 {
  return createExecutionPlan((spec) => {
    spec.nodes = [
      ...spec.nodes,
      {
        id: "spawn-animal",
        kind: "anchor",
        transform: { positionMeters: [6, 0, 28] },
        semantic: { classId: "spawn.subject" },
      },
      {
        id: "animal",
        kind: "subject",
        kitRef: "worldkit://kit/quadruped.ground-proxy@1",
        spawnAnchorEntityId: "spawn-animal",
      },
    ];
  });
}

async function createRuntime(executionPlan = createExecutionPlan()): Promise<BabylonWorldRuntime> {
  return BabylonWorldRuntime.create({
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
}

describe("BabylonWorldRuntime", () => {
  it("initializes a right-handed Babylon scene with Havok physics from an ExecutionPlan", async () => {
    const executionPlan = createExecutionPlan();
    const runtime = await createRuntime(executionPlan);

    expect(runtime.snapshot()).toMatchObject({
      runtimeBackend: "babylon-havok",
      ready: true,
      physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
      schemaVersion: 2,
      controlledEntityId: "player",
      subjectStatesByEntityId: { player: { entityId: "player", movementMedium: "ground" } },
      resources: { bodies: 3, terrainSamples: 65 * 65 },
    });
    expect(runtime.snapshot().resources.meshes).toBeGreaterThanOrEqual(4);

    await runtime.dispose();
    await runtime.dispose();
  });

  it("creates and snapshots every compiled subject", async () => {
    const runtime = await createRuntime(createMultiSubjectExecutionPlan());

    expect(Object.keys(runtime.snapshot().subjectStatesByEntityId).sort()).toEqual(["animal", "player"]);
    expect(runtime.snapshot().controlledEntityId).toBe("player");
    expect(runtime.snapshot().resources.meshes).toBeGreaterThan(8);
    await runtime.dispose();
  });

  it("switches the default Controller atomically and moves only the committed subject", async () => {
    const runtime = await createRuntime(createMultiSubjectExecutionPlan());
    const before = runtime.snapshot();

    expect(runtime.bindControl({
      controllerId: "controller-primary",
      expectedControlledEntityId: "player",
      controlledEntityId: "animal",
    })).toMatchObject({ status: "committed", controlledEntityId: "animal" });
    const after = await runtime.runFixedInput({ actions: ["move-right"], ticks: 60 });

    expect(after.subjectStatesByEntityId.animal!.positionMeters[0]).toBeGreaterThan(
      before.subjectStatesByEntityId.animal!.positionMeters[0],
    );
    expect(after.subjectStatesByEntityId.player!.positionMeters).toEqual(
      before.subjectStatesByEntityId.player!.positionMeters,
    );
    expect(after.camera.targetEntityId).toBe("animal");
    await runtime.dispose();
  });

  it("rejects a stale binding without changing control", async () => {
    const runtime = await createRuntime(createMultiSubjectExecutionPlan());

    expect(runtime.bindControl({
      controllerId: "controller-primary",
      expectedControlledEntityId: "animal",
      controlledEntityId: "player",
    })).toMatchObject({ status: "rejected", diagnostic: { code: "CONTROL_BINDING_STALE" } });
    expect(runtime.snapshot().controlledEntityId).toBe("player");
    await runtime.dispose();
  });

  it("validates Controller and Subject IDs and commits an idempotent no-op", async () => {
    const runtime = await createRuntime(createMultiSubjectExecutionPlan());

    expect(runtime.bindControl({
      controllerId: "controller-missing",
      expectedControlledEntityId: "player",
      controlledEntityId: "animal",
    })).toMatchObject({ status: "rejected", diagnostic: { code: "CONTROL_CONTROLLER_NOT_FOUND" } });
    expect(runtime.bindControl({
      controllerId: "controller-primary",
      expectedControlledEntityId: "player",
      controlledEntityId: "missing",
    })).toMatchObject({ status: "rejected", diagnostic: { code: "CONTROL_TARGET_NOT_FOUND" } });
    expect(runtime.bindControl({
      controllerId: "controller-primary",
      expectedControlledEntityId: "player",
      controlledEntityId: "player",
    })).toMatchObject({ status: "committed", controlledEntityId: "player" });
    expect(runtime.snapshot().controlledEntityId).toBe("player");
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
    const runtime = await createRuntime(executionPlan);

    const initial = runtime.snapshot();
    const moved = await runtime.runFixedInput({ actions: ["move-forward"], ticks: 180 });

    expect(moved.tick).toBe(180);
    expect(moved.subjectStatesByEntityId.player!.positionMeters[2]).toBeLessThan(
      initial.subjectStatesByEntityId.player!.positionMeters[2],
    );
    expect(moved.subjectStatesByEntityId.player!.positionMeters[2]).toBeGreaterThan(26.1);
    await runtime.dispose();
  });

  it("changes movement medium when the subject enters a declared swimmable water boundary", async () => {
    const executionPlan = createExecutionPlan((spec) => {
      const water = spec.nodes.find((node) => node.kind === "water");
      if (water?.kind !== "water") throw new Error("Fixture water node missing.");
      water.components.water.boundary = { kind: "ellipse", centerXZ: [7, 30], radiusMetersXZ: [3, 5] };
    });
    const runtime = await createRuntime(executionPlan);

    const snapshot = await runtime.runFixedInput({ actions: ["move-right"], ticks: 90 });

    expect(snapshot.subjectStatesByEntityId.player!.positionMeters[0]).toBeGreaterThan(4);
    expect(snapshot.subjectStatesByEntityId.player!.movementMedium).toBe("water");
    await runtime.dispose();
  });

  it("resets deterministic runtime state to the compiled spawn", async () => {
    const executionPlan = createExecutionPlan();
    const runtime = await createRuntime(executionPlan);
    await runtime.runFixedInput({ actions: ["move-left"], ticks: 30 });

    const reset = runtime.reset();

    expect(reset.tick).toBe(0);
    expect(reset.subjectStatesByEntityId.player!.positionMeters).toEqual(
      executionPlan.subjects.find((subject) => subject.entityId === "player")!.spawnPositionMeters,
    );
    expect(reset.subjectStatesByEntityId.player!.velocityMetersPerSecond).toEqual([0, 0, 0]);
    await runtime.dispose();
  });

  it("resets every subject and restores the initial Controller binding", async () => {
    const executionPlan = createMultiSubjectExecutionPlan();
    const runtime = await createRuntime(executionPlan);
    runtime.bindControl({
      controllerId: "controller-primary",
      expectedControlledEntityId: "player",
      controlledEntityId: "animal",
    });
    await runtime.runFixedInput({ actions: ["move-left"], ticks: 30 });

    const reset = runtime.reset();

    expect(reset.controlledEntityId).toBe("player");
    for (const subject of executionPlan.subjects) {
      expect(reset.subjectStatesByEntityId[subject.entityId]?.positionMeters).toEqual(
        subject.spawnPositionMeters,
      );
      expect(reset.subjectStatesByEntityId[subject.entityId]?.velocityMetersPerSecond).toEqual([0, 0, 0]);
    }
    await runtime.dispose();
  });
});
