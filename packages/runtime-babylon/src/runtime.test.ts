import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { describe, expect, it } from "vitest";

import {
  normalizeAuthoringSpec,
  type AuthoringSpecV2,
} from "@whitebox-world/authoring";
import { compileWorld } from "@whitebox-world/compiler";
import {
  createValidPackageSubjectWorldV2,
  createValidRiggedPackageSubjectWorldV2,
} from "../../authoring/src/test-fixture";
import type {
  ExecutionPlanV3,
  FixedInputV1,
  Vec3,
} from "@whitebox-world/runtime-contracts";

import { BabylonWorldRuntime } from "./index";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

interface RuntimeDebugProbe {
  subjectVisualOrigin(subjectEntityId: string): Vec3;
  controllerCenter(subjectEntityId: string): Vec3;
  visualPartLocalPosition(subjectEntityId: string, partId: string): Vec3;
}

interface CartesianVector {
  x: number;
  y: number;
  z: number;
}

interface ControllerProbe {
  physicsController: { getPosition(): CartesianVector };
  visualRoot: {
    position: CartesianVector;
    getChildMeshes(): readonly { name: string; position: CartesianVector }[];
  };
}

function toVec3(value: CartesianVector): Vec3 {
  return [value.x, value.y, value.z];
}

function createRuntimeDebugProbe(runtime: BabylonWorldRuntime): RuntimeDebugProbe {
  const internals = runtime as unknown as {
    subjectControllersByEntityId: ReadonlyMap<string, ControllerProbe>;
  };
  const controllerFor = (subjectEntityId: string): ControllerProbe => {
    const controller = internals.subjectControllersByEntityId.get(subjectEntityId);
    if (controller === undefined) throw new Error(`Missing Subject '${subjectEntityId}'.`);
    return controller;
  };
  return {
    subjectVisualOrigin: (subjectEntityId) =>
      toVec3(controllerFor(subjectEntityId).visualRoot.position),
    controllerCenter: (subjectEntityId) =>
      toVec3(controllerFor(subjectEntityId).physicsController.getPosition()),
    visualPartLocalPosition: (subjectEntityId, partId) => {
      const expectedName = `${subjectEntityId}.${partId}`;
      const mesh = controllerFor(subjectEntityId)
        .visualRoot.getChildMeshes()
        .find((candidate) => candidate.name === expectedName);
      if (mesh === undefined) throw new Error(`Missing visual Part '${expectedName}'.`);
      return toVec3(mesh.position);
    },
  };
}

function addVec3(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function moveRightForTicks(tickCount: number): FixedInputV1 {
  return { actions: ["move-right"], ticks: tickCount };
}

function compileExecutionPlan(spec: AuthoringSpecV2): ExecutionPlanV3 {
  const normalized = normalizeAuthoringSpec(spec);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
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

function createExecutionPlan(
  mutator?: (spec: AuthoringSpecV2) => void,
): ExecutionPlanV3 {
  const spec = createValidPackageSubjectWorldV2();
  mutator?.(spec);
  return compileExecutionPlan(spec);
}

async function createRuntime(
  executionPlan = createExecutionPlan(),
): Promise<BabylonWorldRuntime> {
  return BabylonWorldRuntime.create({
    executionPlan,
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
}

async function movementResult(
  executionPlan: ExecutionPlanV3,
  actions: FixedInputV1["actions"],
): Promise<{ deltaXMeters: number; movementMedium: "ground" | "air" | "water" }> {
  const runtime = await createRuntime(executionPlan);
  try {
    const before = runtime.snapshot().subjectStatesByEntityId.player!.positionMetersXYZ[0];
    const after = await runtime.runFixedInput({ actions, ticks: 60 });
    const player = after.subjectStatesByEntityId.player!;
    return {
      deltaXMeters: player.positionMetersXYZ[0] - before,
      movementMedium: player.movementMedium,
    };
  } finally {
    await runtime.dispose();
  }
}

async function createRuntimeWithPackageSubject(): Promise<{
  runtime: BabylonWorldRuntime;
  executionPlan: ExecutionPlanV3;
  debug: RuntimeDebugProbe;
}> {
  const executionPlan = createExecutionPlan();
  const runtime = await createRuntime(executionPlan);
  return { runtime, executionPlan, debug: createRuntimeDebugProbe(runtime) };
}

describe("BabylonWorldRuntime", () => {
  it("initializes a right-handed Babylon scene with Havok from ExecutionPlanV3", async () => {
    const runtime = await createRuntime();

    expect(runtime.snapshot()).toMatchObject({
      runtimeBackend: "babylon-havok",
      ready: true,
      physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
      schemaVersion: 3,
      controlledEntityId: "player",
      subjectStatesByEntityId: {
        player: {
          entityId: "player",
          subjectDefinitionRef:
            "worldkit://subject-definition/humanoid.third-person@1",
          subjectDefinitionHash: expect.stringMatching(/^sha256:/),
          movementMedium: "ground",
        },
      },
      resources: { terrainSamples: 65 * 65 },
    });
    expect(runtime.snapshot().resources.meshes).toBeGreaterThanOrEqual(10);

    await runtime.dispose();
    await runtime.dispose();
  });

  it("keeps Snapshot and Visual Root at Subject Origin", async () => {
    const { runtime, executionPlan, debug } = await createRuntimeWithPackageSubject();
    const snapshot = runtime.snapshot();
    const subject = executionPlan.subjects.find(
      (value) => value.entityId === "pack-animal-a",
    )!;
    const state = snapshot.subjectStatesByEntityId[subject.entityId]!;

    expect(state.positionMetersXYZ).toEqual(
      subject.spawnSubjectOriginPositionMetersXYZ,
    );
    expect(debug.subjectVisualOrigin(subject.entityId)).toEqual(state.positionMetersXYZ);
    expect(debug.controllerCenter(subject.entityId)).toEqual(
      addVec3(
        state.positionMetersXYZ,
        subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
      ),
    );
    await runtime.dispose();
  });

  it("creates and snapshots every compiled Subject independently", async () => {
    const runtime = await createRuntime();

    expect(Object.keys(runtime.snapshot().subjectStatesByEntityId).sort()).toEqual([
      "pack-animal-a",
      "pack-animal-b",
      "player",
    ]);
    expect(runtime.snapshot().controlledEntityId).toBe("player");
    await runtime.dispose();
  });

  it("renders resolved Primitive Parts at Definition-local transforms", async () => {
    const { runtime, executionPlan, debug } = await createRuntimeWithPackageSubject();
    const subject = executionPlan.subjects.find(
      (candidate) => candidate.entityId === "pack-animal-a",
    )!;

    for (const part of subject.visualParts) {
      expect(debug.visualPartLocalPosition(subject.entityId, part.id)).toEqual(
        part.localTransform.positionMetersXYZ,
      );
    }
    expect(subject.sockets.map((socket) => socket.id)).toEqual([
      "seat.mount",
      "tow.rear",
    ]);
    await runtime.dispose();
  });

  it("requires an explicit Subject Asset resolver before constructing Asset visuals", async () => {
    const executionPlan = compileExecutionPlan(
      createValidRiggedPackageSubjectWorldV2(),
    );

    await expect(createRuntime(executionPlan)).rejects.toThrowError(
      /SUBJECT_ASSET_RESOLVER_REQUIRED:.*body\.asset.*player/,
    );
  });

  it("uses run speed only for horizontal non-water movement", async () => {
    const groundPlan = createExecutionPlan();
    const walk = await movementResult(groundPlan, ["move-right"]);
    const run = await movementResult(groundPlan, ["move-right", "run"]);
    expect(walk.movementMedium).toBe("ground");
    expect(run.movementMedium).toBe("ground");
    expect(run.deltaXMeters).toBeGreaterThan(walk.deltaXMeters * 1.25);

    const waterPlan = createExecutionPlan((spec) => {
      const water = spec.nodes.find((node) => node.kind === "water");
      if (water?.kind !== "water") throw new Error("Fixture water node missing.");
      water.components.water.boundary = {
        kind: "ellipse",
        centerMetersXZ: [0, 30],
        radiusMetersXZ: [50, 50],
      };
    });
    const waterWalk = await movementResult(waterPlan, ["move-right"]);
    const waterRun = await movementResult(waterPlan, ["move-right", "run"]);
    expect(waterWalk.movementMedium).toBe("water");
    expect(waterRun.movementMedium).toBe("water");
    expect(waterRun.deltaXMeters).toBeCloseTo(waterWalk.deltaXMeters, 8);
  });

  it("switches the default Controller atomically and moves only the committed Subject", async () => {
    const runtime = await createRuntime();
    const before = runtime.snapshot();

    expect(
      runtime.bindControl({
        controllerId: "controller-primary",
        expectedControlledEntityId: "player",
        controlledEntityId: "pack-animal-a",
      }),
    ).toMatchObject({ status: "committed", controlledEntityId: "pack-animal-a" });
    const after = await runtime.runFixedInput(moveRightForTicks(60));

    expect(after.subjectStatesByEntityId["pack-animal-a"]!.positionMetersXYZ[0]).toBeGreaterThan(
      before.subjectStatesByEntityId["pack-animal-a"]!.positionMetersXYZ[0],
    );
    const inactiveBefore = before.subjectStatesByEntityId.player!.positionMetersXYZ;
    const inactiveAfter = after.subjectStatesByEntityId.player!.positionMetersXYZ;
    expect(inactiveAfter[0]).toBe(inactiveBefore[0]);
    expect(inactiveAfter[1]).toBeCloseTo(inactiveBefore[1]);
    expect(inactiveAfter[2]).toBe(inactiveBefore[2]);
    expect(after.camera.targetEntityId).toBe("pack-animal-a");
    await runtime.dispose();
  });

  it("rejects stale, unknown Controller, and unknown Subject bindings", async () => {
    const runtime = await createRuntime();

    expect(
      runtime.bindControl({
        controllerId: "controller-primary",
        expectedControlledEntityId: "pack-animal-a",
        controlledEntityId: "player",
      }),
    ).toMatchObject({
      status: "rejected",
      diagnostic: { code: "CONTROL_BINDING_STALE" },
    });
    expect(
      runtime.bindControl({
        controllerId: "controller-missing",
        expectedControlledEntityId: "player",
        controlledEntityId: "pack-animal-a",
      }),
    ).toMatchObject({
      status: "rejected",
      diagnostic: { code: "CONTROL_CONTROLLER_NOT_FOUND" },
    });
    expect(
      runtime.bindControl({
        controllerId: "controller-primary",
        expectedControlledEntityId: "player",
        controlledEntityId: "missing",
      }),
    ).toMatchObject({
      status: "rejected",
      diagnostic: { code: "CONTROL_TARGET_NOT_FOUND" },
    });
    expect(runtime.snapshot().controlledEntityId).toBe("player");
    await runtime.dispose();
  });

  it("moves by semantic fixed input but cannot pass through a fixed wall", async () => {
    const executionPlan = createExecutionPlan((spec) => {
      const wall = spec.resources.prototypes[0];
      if (wall?.primitive !== "box") {
        throw new Error("Fixture box wall Prototype missing.");
      }
      wall.sizeMetersXYZ = [14, 4, 2];
      const wallNode = spec.nodes.find((node) => node.kind === "object");
      if (wallNode?.kind !== "object") throw new Error("Fixture wall node missing.");
      wallNode.transform.positionMetersXYZ = [0, 2, 25];
    });
    const runtime = await createRuntime(executionPlan);

    const initial = runtime.snapshot();
    const moved = await runtime.runFixedInput({ actions: ["move-forward"], ticks: 180 });

    expect(moved.tick).toBe(180);
    expect(moved.subjectStatesByEntityId.player!.positionMetersXYZ[2]).toBeLessThan(
      initial.subjectStatesByEntityId.player!.positionMetersXYZ[2],
    );
    expect(moved.subjectStatesByEntityId.player!.positionMetersXYZ[2]).toBeGreaterThan(26.1);
    await runtime.dispose();
  });

  it("changes movement medium in declared swimmable water", async () => {
    const executionPlan = createExecutionPlan((spec) => {
      const water = spec.nodes.find((node) => node.kind === "water");
      if (water?.kind !== "water") throw new Error("Fixture water node missing.");
      water.components.water.boundary = {
        kind: "ellipse",
        centerMetersXZ: [4, 30],
        radiusMetersXZ: [3, 5],
      };
    });
    const runtime = await createRuntime(executionPlan);

    const snapshot = await runtime.runFixedInput(moveRightForTicks(90));

    expect(snapshot.subjectStatesByEntityId.player!.positionMetersXYZ[0]).toBeGreaterThan(3);
    expect(snapshot.subjectStatesByEntityId.player!.movementMedium).toBe("water");
    await runtime.dispose();
  });

  it("camera follows Subject Origin plus target height", async () => {
    const { runtime, executionPlan } = await createRuntimeWithPackageSubject();
    runtime.bindControl({
      controllerId: "controller-primary",
      expectedControlledEntityId: "player",
      controlledEntityId: "pack-animal-a",
    });
    const snapshot = runtime.snapshot();
    const state = snapshot.subjectStatesByEntityId["pack-animal-a"]!;
    const camera = executionPlan.camera;
    const horizontalDistance = Math.cos(camera.pitchRadians) * camera.distanceMeters;

    expect(snapshot.camera.positionMetersXYZ).toEqual([
      state.positionMetersXYZ[0],
      state.positionMetersXYZ[1] +
        camera.targetHeightMeters +
        Math.sin(camera.pitchRadians) * camera.distanceMeters,
      state.positionMetersXYZ[2] + horizontalDistance,
    ]);
    await runtime.dispose();
  });

  it("reset restores origins, controller centers, velocity, binding, and camera", async () => {
    const { runtime, executionPlan, debug } = await createRuntimeWithPackageSubject();
    const initialCamera = runtime.snapshot().camera.positionMetersXYZ;
    runtime.bindControl({
      controllerId: "controller-primary",
      expectedControlledEntityId: "player",
      controlledEntityId: "pack-animal-a",
    });
    await runtime.runFixedInput(moveRightForTicks(30));

    const reset = runtime.reset();

    expect(reset.tick).toBe(0);
    expect(reset.controlledEntityId).toBe("player");
    expect(reset.camera.positionMetersXYZ).toEqual(initialCamera);
    for (const subject of executionPlan.subjects) {
      const state = reset.subjectStatesByEntityId[subject.entityId]!;
      expect(state.positionMetersXYZ).toEqual(subject.spawnSubjectOriginPositionMetersXYZ);
      expect(state.velocityMetersPerSecondXYZ).toEqual([0, 0, 0]);
      expect(debug.subjectVisualOrigin(subject.entityId)).toEqual(state.positionMetersXYZ);
      expect(debug.controllerCenter(subject.entityId)).toEqual(
        addVec3(
          state.positionMetersXYZ,
          subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
        ),
      );
    }
    await runtime.dispose();
  });
});
