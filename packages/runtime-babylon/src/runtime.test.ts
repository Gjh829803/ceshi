import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { sha256Bytes } from "@whitebox-world/protocol";
import { describe, expect, it, vi } from "vitest";

vi.mock("@babylonjs/core/Loading/sceneLoader.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@babylonjs/core/Loading/sceneLoader.js")
  >();
  return {
    ...actual,
    LoadAssetContainerAsync: vi.fn(actual.LoadAssetContainerAsync),
  };
});

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
  ExecutionSubjectAssetV1,
  FixedInputV1,
  Vec3,
} from "@whitebox-world/runtime-contracts";

import {
  BabylonWorldRuntime,
  SubjectAssetCacheV1,
  SubjectAssetRuntimeErrorV1,
  isSubjectAssetRuntimeErrorV1,
  type SubjectAssetResolverV1,
  type SubjectAssetRuntimeLimitsV1,
} from "./index";

const havokWasmBytes = await readFile(
  createRequire(import.meta.url).resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

const goldenSubjectAssetBytes = new Uint8Array(
  await readFile(
    new URL(
      "../../../apps/playground/public/worldkit-assets/golden-humanoid.glb",
      import.meta.url,
    ),
  ),
);

const goldenSubjectAssetDescriptor = {
  subjectAssetRef: "worldkit://subject-asset/humanoid.golden@1",
  artifactContentHash:
    "sha256:1095fd65c754d53e6db3757ab5e1c9e5e9dcea2581f85d40f37ea4890ee8c2c2",
  byteLength: 43_656,
  mediaType: "model/gltf-binary",
  format: "glb",
  inventory: {
    meshCount: 1,
    vertexCount: 360,
    triangleCount: 180,
    skeletonCount: 1,
    boneCount: 18,
    animationClipNames: ["idle", "jump", "run", "walk"],
  },
} as const satisfies ExecutionSubjectAssetV1;

interface MutableGlbJson {
  buffers?: Array<Record<string, unknown>>;
  images?: Array<Record<string, unknown>>;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<Record<string, unknown>>;
  meshes?: Array<Record<string, unknown>>;
  animations?: Array<Record<string, unknown>>;
  cameras?: Array<Record<string, unknown>>;
}

function mutateGlbJson(
  bytes: Uint8Array,
  mutate: (json: MutableGlbJson) => void,
): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Array<{ type: number; bytes: Uint8Array }> = [];
  let cursor = 12;
  while (cursor < bytes.byteLength) {
    const length = view.getUint32(cursor, true);
    const type = view.getUint32(cursor + 4, true);
    const chunk = bytes.slice(cursor + 8, cursor + 8 + length);
    chunks.push({ type, bytes: chunk });
    cursor += 8 + length;
  }
  const jsonChunk = chunks.find((chunk) => chunk.type === 0x4e4f534a);
  if (jsonChunk === undefined) throw new Error("Golden GLB JSON chunk missing.");
  const json = JSON.parse(
    new TextDecoder().decode(jsonChunk.bytes).replace(/[\u0000\u0020]+$/u, ""),
  ) as MutableGlbJson;
  mutate(json);
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const paddedJsonLength = Math.ceil(encoded.byteLength / 4) * 4;
  const replacement = new Uint8Array(paddedJsonLength);
  replacement.fill(0x20);
  replacement.set(encoded);
  const rewritten = chunks.map((chunk) =>
    chunk.type === 0x4e4f534a ? { ...chunk, bytes: replacement } : chunk,
  );
  const totalLength =
    12 + rewritten.reduce((sum, chunk) => sum + 8 + chunk.bytes.byteLength, 0);
  const result = new Uint8Array(totalLength);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, 0x46546c67, true);
  resultView.setUint32(4, 2, true);
  resultView.setUint32(8, totalLength, true);
  cursor = 12;
  for (const chunk of rewritten) {
    resultView.setUint32(cursor, chunk.bytes.byteLength, true);
    resultView.setUint32(cursor + 4, chunk.type, true);
    result.set(chunk.bytes, cursor + 8);
    cursor += 8 + chunk.bytes.byteLength;
  }
  return result;
}

function descriptorForBytes(
  bytes: Uint8Array,
  overrides: Partial<ExecutionSubjectAssetV1> = {},
): ExecutionSubjectAssetV1 {
  return {
    ...goldenSubjectAssetDescriptor,
    artifactContentHash: sha256Bytes(bytes),
    byteLength: bytes.byteLength,
    inventory: {
      ...goldenSubjectAssetDescriptor.inventory,
      ...overrides.inventory,
    },
    ...overrides,
  } as ExecutionSubjectAssetV1;
}

function createAssetScene(): { engine: NullEngine; scene: Scene } {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
    deterministicLockstep: true,
    lockstepMaxSteps: 4,
  });
  return { engine, scene: new Scene(engine) };
}

function createMemoryResolver(
  bytes: Uint8Array,
  onResolve?: (request: Parameters<SubjectAssetResolverV1["resolveSubjectAsset"]>[0]) => void,
): SubjectAssetResolverV1 {
  return {
    async resolveSubjectAsset(request) {
      onResolve?.(request);
      return { bytes, sourceLabel: "secret://must-never-leak" };
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

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

const defaultSubjectAssetRuntimeLimits = {
  maxByteLengthBytes: 128 * 1024 * 1024,
  maxMeshCount: 256,
  maxVertexCount: 2_000_000,
  maxTriangleCount: 2_000_000,
  maxSkeletonCount: 8,
  maxBoneCount: 512,
  maxAnimationClipCount: 256,
} as const satisfies SubjectAssetRuntimeLimitsV1;

describe("SubjectAssetCacheV1", () => {
  it("does not expose Cache ownership internals as public operations", async () => {
    const { engine, scene } = createAssetScene();
    const cache = new SubjectAssetCacheV1(scene);

    expect("isClosed" in cache).toBe(false);
    expect("releaseLease" in cache).toBe(false);

    await cache.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("exposes a typed closed-code Runtime error without provider context or Cause", async () => {
    const { engine, scene } = createAssetScene();
    const cache = new SubjectAssetCacheV1(scene);
    const error = await cache.acquire(goldenSubjectAssetDescriptor).catch((reason) => reason);

    expect(error).toBeInstanceOf(SubjectAssetRuntimeErrorV1);
    expect(isSubjectAssetRuntimeErrorV1(error)).toBe(true);
    expect(error).toMatchObject({
      code: "SUBJECT_ASSET_RESOLVER_REQUIRED",
      subjectAssetRef: goldenSubjectAssetDescriptor.subjectAssetRef,
      artifactContentHash: goldenSubjectAssetDescriptor.artifactContentHash,
    });
    expect(error).not.toHaveProperty("cause");
    expect(isSubjectAssetRuntimeErrorV1(new Error("ordinary"))).toBe(false);
    expect(
      isSubjectAssetRuntimeErrorV1({
        code: "BABYLON_PROVIDER_FAILURE",
      }),
    ).toBe(false);

    await cache.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("sends the exact engine-neutral resolve request and parses identical bytes once", async () => {
    const { engine, scene } = createAssetScene();
    const requests: unknown[] = [];
    const cache = new SubjectAssetCacheV1(
      scene,
      createMemoryResolver(goldenSubjectAssetBytes, (request) => requests.push(request)),
    );
    try {
      const first = await cache.acquire(goldenSubjectAssetDescriptor);
      const second = await cache.acquire(goldenSubjectAssetDescriptor);

      expect(requests).toEqual([
        {
          subjectAssetRef: goldenSubjectAssetDescriptor.subjectAssetRef,
          artifactContentHash: goldenSubjectAssetDescriptor.artifactContentHash,
          byteLength: goldenSubjectAssetDescriptor.byteLength,
          mediaType: "model/gltf-binary",
        },
      ]);
      first.release();
      second.release();
    } finally {
      await cache.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("shares one pending Resolve and Parse across concurrent acquires", async () => {
    const { engine, scene } = createAssetScene();
    const resolution = deferred<{ bytes: Uint8Array; sourceLabel: string }>();
    let calls = 0;
    const cache = new SubjectAssetCacheV1(scene, {
      resolveSubjectAsset: async () => {
        calls += 1;
        return resolution.promise;
      },
    });
    try {
      const firstPending = cache.acquire(goldenSubjectAssetDescriptor);
      const secondPending = cache.acquire(goldenSubjectAssetDescriptor);
      resolution.resolve({ bytes: goldenSubjectAssetBytes, sourceLabel: "memory" });
      const [first, second] = await Promise.all([firstPending, secondPending]);
      expect(calls).toBe(1);
      first.release();
      second.release();
    } finally {
      await cache.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("loads the real GLB and creates isolated root, Mesh, Skeleton, and Clip instances", async () => {
    const { engine, scene } = createAssetScene();
    const cache = new SubjectAssetCacheV1(
      scene,
      createMemoryResolver(goldenSubjectAssetBytes),
    );
    try {
      const lease = await cache.acquire(goldenSubjectAssetDescriptor);
      const first = lease.instantiate("hero-a");
      const second = lease.instantiate("hero-b");

      expect(first.meshes).toHaveLength(2);
      expect(first.skeletons).toHaveLength(1);
      expect(first.animationGroups.map((group) => group.name).sort()).toEqual([
        "idle",
        "jump",
        "run",
        "walk",
      ]);
      expect(first.rootNodes[0]).not.toBe(second.rootNodes[0]);
      expect(first.meshes[0]).not.toBe(second.meshes[0]);
      expect(first.skeletons[0]).not.toBe(second.skeletons[0]);
      expect(first.animationGroups[0]).not.toBe(second.animationGroups[0]);
      expect(first.skeletons[0]!.bones.map((bone) => bone.name)).toEqual(
        second.skeletons[0]!.bones.map((bone) => bone.name),
      );
      expect(first.rootNodes.every((root) => root.name.startsWith("hero-a."))).toBe(true);
      expect(second.rootNodes.every((root) => root.name.startsWith("hero-b."))).toBe(true);

      const forgottenRoot = second.rootNodes[0]!;
      first.dispose();
      first.dispose();
      lease.release();
      expect(forgottenRoot.isDisposed()).toBe(true);
      lease.release();
      expect(() => lease.instantiate("too-late")).toThrow(/SUBJECT_ASSET_LEASE_RELEASED/);
    } finally {
      await cache.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("maps Babylon instantiation failures to the closed Runtime error", async () => {
    const { engine, scene } = createAssetScene();
    const loader = vi.mocked(LoadAssetContainerAsync);
    const loaderResultOffset = loader.mock.results.length;
    const cache = new SubjectAssetCacheV1(
      scene,
      createMemoryResolver(goldenSubjectAssetBytes),
    );
    const lease = await cache.acquire(goldenSubjectAssetDescriptor);
    const container = await (loader.mock.results[loaderResultOffset]!
      .value as Promise<AssetContainer>);
    const secret = "BABYLON_PROVIDER_PRIVATE_FAILURE";
    const instantiateSpy = vi
      .spyOn(container, "instantiateModelsToScene")
      .mockImplementation(() => {
        throw new Error(secret);
      });

    const error = (() => {
      try {
        lease.instantiate("hero");
      } catch (reason) {
        return reason;
      }
      throw new Error("Expected instantiation to fail.");
    })();

    expect(isSubjectAssetRuntimeErrorV1(error)).toBe(true);
    expect(error).toMatchObject({ code: "SUBJECT_ASSET_FORMAT_UNSUPPORTED" });
    expect(String(error)).not.toContain(secret);
    instantiateSpy.mockRestore();
    lease.release();
    await cache.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("parses a byte-offset Uint8Array without hashing prefix or suffix bytes", async () => {
    const { engine, scene } = createAssetScene();
    const storage = new Uint8Array(goldenSubjectAssetBytes.byteLength + 9);
    storage.fill(0x7f);
    storage.set(goldenSubjectAssetBytes, 5);
    const offsetBytes = storage.subarray(5, 5 + goldenSubjectAssetBytes.byteLength);
    const cache = new SubjectAssetCacheV1(scene, createMemoryResolver(offsetBytes));
    try {
      const lease = await cache.acquire(goldenSubjectAssetDescriptor);
      lease.release();
    } finally {
      await cache.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("rejects missing, throwing, empty, and non-byte Resolver results without leaking Host data", async () => {
    const { engine, scene } = createAssetScene();
    const missing = new SubjectAssetCacheV1(scene);
    await expect(missing.acquire(goldenSubjectAssetDescriptor)).rejects.toThrow(
      /SUBJECT_ASSET_RESOLVER_REQUIRED/,
    );
    await missing.dispose();

    const secret = "https://user:password@example.invalid/private.glb";
    const throwing = new SubjectAssetCacheV1(scene, {
      resolveSubjectAsset: async () => {
        throw new Error(secret);
      },
    });
    const throwingError = await throwing.acquire(goldenSubjectAssetDescriptor).catch((error) =>
      String(error),
    );
    expect(throwingError).toContain("SUBJECT_ASSET_RESOLVE_FAILED");
    expect(throwingError).not.toContain(secret);
    await throwing.dispose();

    for (const result of [undefined, {}, { bytes: new ArrayBuffer(8), sourceLabel: secret }]) {
      const invalid = new SubjectAssetCacheV1(scene, {
        resolveSubjectAsset: async () => result as never,
      });
      const invalidError = await invalid.acquire(goldenSubjectAssetDescriptor).catch((error) =>
        String(error),
      );
      expect(invalidError).toContain("SUBJECT_ASSET_RESOLVE_FAILED");
      expect(invalidError).not.toContain(secret);
      await invalid.dispose();
    }
    scene.dispose();
    engine.dispose();
  });

  it("enforces descriptor, Resolver, length, Hash, and format precedence", async () => {
    const { engine, scene } = createAssetScene();
    const unsupported = {
      ...goldenSubjectAssetDescriptor,
      mediaType: "model/gltf+json",
      format: "gltf",
      byteLength: defaultSubjectAssetRuntimeLimits.maxByteLengthBytes + 1,
    } as unknown as ExecutionSubjectAssetV1;
    await expect(new SubjectAssetCacheV1(scene).acquire(unsupported)).rejects.toThrow(
      /SUBJECT_ASSET_FORMAT_UNSUPPORTED/,
    );

    const oversized = {
      ...goldenSubjectAssetDescriptor,
      byteLength: defaultSubjectAssetRuntimeLimits.maxByteLengthBytes + 1,
    };
    await expect(new SubjectAssetCacheV1(scene).acquire(oversized)).rejects.toThrow(
      /SUBJECT_ASSET_INVENTORY_EXCEEDED/,
    );

    const throwing = new SubjectAssetCacheV1(scene, {
      resolveSubjectAsset: async () => {
        throw new Error("resolver private failure");
      },
    });
    await expect(
      throwing.acquire({ ...goldenSubjectAssetDescriptor, byteLength: 1 }),
    ).rejects.toThrow(/SUBJECT_ASSET_RESOLVE_FAILED/);
    await throwing.dispose();

    const malformed = new Uint8Array(goldenSubjectAssetBytes.byteLength);
    const lengthFirst = new SubjectAssetCacheV1(scene, createMemoryResolver(malformed));
    await expect(
      lengthFirst.acquire({
        ...goldenSubjectAssetDescriptor,
        byteLength: malformed.byteLength - 1,
        artifactContentHash: `sha256:${"0".repeat(64)}`,
      }),
    ).rejects.toThrow(/SUBJECT_ASSET_LENGTH_MISMATCH/);
    await lengthFirst.dispose();

    const hashFirst = new SubjectAssetCacheV1(scene, createMemoryResolver(malformed));
    await expect(
      hashFirst.acquire({
        ...goldenSubjectAssetDescriptor,
        byteLength: malformed.byteLength,
        artifactContentHash: `sha256:${"0".repeat(64)}`,
      }),
    ).rejects.toThrow(/SUBJECT_ASSET_HASH_MISMATCH/);
    await hashFirst.dispose();

    const formatLast = new SubjectAssetCacheV1(scene, createMemoryResolver(malformed));
    await expect(formatLast.acquire(descriptorForBytes(malformed))).rejects.toThrow(
      /SUBJECT_ASSET_FORMAT_UNSUPPORTED/,
    );
    await formatLast.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("validates Host limits as strict finite positive integer reductions", () => {
    const { engine, scene } = createAssetScene();
    const invalidValues = [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      defaultSubjectAssetRuntimeLimits.maxMeshCount + 1,
    ];
    for (const maxMeshCount of invalidValues) {
      expect(
        () =>
          new SubjectAssetCacheV1(scene, undefined, {
            runtimeLimits: {
              ...defaultSubjectAssetRuntimeLimits,
              maxMeshCount,
            },
          }),
      ).toThrow(RangeError);
    }
    scene.dispose();
    engine.dispose();
  });

  it("rejects malformed Host limit objects with RangeError", () => {
    const { engine, scene } = createAssetScene();
    for (const runtimeLimits of [null, {}, { ...defaultSubjectAssetRuntimeLimits }]) {
      if (runtimeLimits !== null && "maxMeshCount" in runtimeLimits) {
        delete (runtimeLimits as Partial<SubjectAssetRuntimeLimitsV1>).maxMeshCount;
      }
      expect(
        () =>
          new SubjectAssetCacheV1(scene, undefined, {
            runtimeLimits: runtimeLimits as SubjectAssetRuntimeLimitsV1,
          }),
      ).toThrow(RangeError);
    }
    scene.dispose();
    engine.dispose();
  });

  it("rejects external GLB buffer and image URIs before Babylon parsing", async () => {
    const { engine, scene } = createAssetScene();
    for (const mutate of [
      (json: MutableGlbJson) => {
        json.buffers![0]!.uri = "https://example.invalid/external.bin";
      },
      (json: MutableGlbJson) => {
        json.images = [{ uri: "data:image/png;base64,AAAA" }];
      },
    ]) {
      const bytes = mutateGlbJson(goldenSubjectAssetBytes, mutate);
      const cache = new SubjectAssetCacheV1(scene, createMemoryResolver(bytes));
      await expect(cache.acquire(descriptorForBytes(bytes))).rejects.toThrow(
        /SUBJECT_ASSET_FORMAT_UNSUPPORTED/,
      );
      await cache.dispose();
    }
    scene.dispose();
    engine.dispose();
  });

  it("rejects a GLB JSON chunk padded with non-JSON NUL bytes", async () => {
    const { engine, scene } = createAssetScene();
    const bytes = goldenSubjectAssetBytes.slice();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const jsonChunkLength = view.getUint32(12, true);
    const finalJsonByteIndex = 20 + jsonChunkLength - 1;
    expect(bytes[finalJsonByteIndex]).toBe(0x20);
    bytes[finalJsonByteIndex] = 0;
    const cache = new SubjectAssetCacheV1(scene, createMemoryResolver(bytes));
    const loaderCallCount = vi.mocked(LoadAssetContainerAsync).mock.calls.length;

    await expect(cache.acquire(descriptorForBytes(bytes))).rejects.toThrow(
      /SUBJECT_ASSET_FORMAT_UNSUPPORTED/,
    );
    expect(LoadAssetContainerAsync).toHaveBeenCalledTimes(loaderCallCount);

    await cache.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("rejects non-indexed geometry and Cameras as unsupported source content", async () => {
    const { engine, scene } = createAssetScene();
    const nonIndexed = mutateGlbJson(goldenSubjectAssetBytes, (json) => {
      const primitive = (json.meshes![0]!.primitives as Array<Record<string, unknown>>)[0]!;
      delete primitive.indices;
    });
    const nonIndexedCache = new SubjectAssetCacheV1(
      scene,
      createMemoryResolver(nonIndexed),
    );
    await expect(nonIndexedCache.acquire(descriptorForBytes(nonIndexed))).rejects.toThrow(
      /SUBJECT_ASSET_FORMAT_UNSUPPORTED/,
    );
    await nonIndexedCache.dispose();

    const withCamera = mutateGlbJson(goldenSubjectAssetBytes, (json) => {
      json.cameras = [{ type: "perspective", perspective: { yfov: 1, znear: 0.1 } }];
      const nodeIndex = json.nodes!.push({ name: "ForbiddenCamera", camera: 0 }) - 1;
      json.scenes![0]!.nodes!.push(nodeIndex);
    });
    const cameraCache = new SubjectAssetCacheV1(scene, createMemoryResolver(withCamera));
    await expect(cameraCache.acquire(descriptorForBytes(withCamera))).rejects.toThrow(
      /SUBJECT_ASSET_FORMAT_UNSUPPORTED/,
    );
    await cameraCache.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("rejects parsed Lights, Sounds, ActionManagers, and Node Behaviors", async () => {
    const { engine, scene } = createAssetScene();
    const loader = vi.mocked(LoadAssetContainerAsync);
    const loadImplementation = loader.getMockImplementation();
    if (loadImplementation === undefined) throw new Error("Loader test wrapper missing.");
    const forbiddenMutations: Array<(container: AssetContainer) => void> = [
      (container) => {
        container.lights.push({ behaviors: [], dispose() {} } as never);
      },
      (container) => {
        container.sounds = [{ dispose() {} } as never];
      },
      (container) => {
        container.actionManagers.push({ dispose() {} } as never);
      },
      (container) => {
        container.getNodes()[0]!.addBehavior({
          name: "ForbiddenBehavior",
          attachedNode: null,
          init() {},
          attach(target) {
            this.attachedNode = target;
          },
          detach() {
            this.attachedNode = null;
          },
        });
      },
    ];

    for (const mutateContainer of forbiddenMutations) {
      loader.mockImplementationOnce(async (...args) => {
        const container = await loadImplementation(...args);
        mutateContainer(container);
        return container;
      });
      const cache = new SubjectAssetCacheV1(
        scene,
        createMemoryResolver(goldenSubjectAssetBytes),
      );
      await expect(cache.acquire(goldenSubjectAssetDescriptor)).rejects.toThrow(
        /SUBJECT_ASSET_FORMAT_UNSUPPORTED/,
      );
      await cache.dispose();
    }

    scene.dispose();
    engine.dispose();
  });

  it("applies parsed runtime limits before exact Inventory mismatch", async () => {
    const { engine, scene } = createAssetScene();
    const twoMeshes = mutateGlbJson(goldenSubjectAssetBytes, (json) => {
      const duplicateMesh = structuredClone(json.meshes![0]!);
      duplicateMesh.name = "DuplicateGoldenHumanoid";
      const meshIndex = json.meshes!.push(duplicateMesh) - 1;
      const nodeIndex =
        json.nodes!.push({
          name: "DuplicateGoldenHumanoidMesh",
          mesh: meshIndex,
          skin: 0,
          translation: [2, 0, 0],
        }) - 1;
      json.scenes![0]!.nodes!.push(nodeIndex);
    });
    const cache = new SubjectAssetCacheV1(scene, createMemoryResolver(twoMeshes), {
      runtimeLimits: {
        ...defaultSubjectAssetRuntimeLimits,
        maxMeshCount: 1,
      },
    });
    await expect(cache.acquire(descriptorForBytes(twoMeshes))).rejects.toThrow(
      /SUBJECT_ASSET_INVENTORY_EXCEEDED/,
    );
    await cache.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("applies the actual Clip count limit before duplicate-name mismatch", async () => {
    const { engine, scene } = createAssetScene();
    const duplicateClip = mutateGlbJson(goldenSubjectAssetBytes, (json) => {
      json.animations!.push(structuredClone(json.animations![0]!));
    });
    const cache = new SubjectAssetCacheV1(scene, createMemoryResolver(duplicateClip), {
      runtimeLimits: {
        ...defaultSubjectAssetRuntimeLimits,
        maxAnimationClipCount: 4,
      },
    });

    await expect(cache.acquire(descriptorForBytes(duplicateClip))).rejects.toThrow(
      /SUBJECT_ASSET_INVENTORY_EXCEEDED/,
    );

    await cache.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("rejects exact Inventory mismatch and duplicate actual Clip names", async () => {
    const { engine, scene } = createAssetScene();
    const mismatched = new SubjectAssetCacheV1(
      scene,
      createMemoryResolver(goldenSubjectAssetBytes),
    );
    await expect(
      mismatched.acquire({
        ...goldenSubjectAssetDescriptor,
        inventory: { ...goldenSubjectAssetDescriptor.inventory, vertexCount: 359 },
      }),
    ).rejects.toThrow(/SUBJECT_ASSET_INVENTORY_MISMATCH/);
    await mismatched.dispose();

    const duplicateClip = mutateGlbJson(goldenSubjectAssetBytes, (json) => {
      json.animations!.push(structuredClone(json.animations![0]!));
    });
    const duplicateCache = new SubjectAssetCacheV1(
      scene,
      createMemoryResolver(duplicateClip),
    );
    await expect(duplicateCache.acquire(descriptorForBytes(duplicateClip))).rejects.toThrow(
      /SUBJECT_ASSET_INVENTORY_MISMATCH/,
    );
    await duplicateCache.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("revalidates cache-hit and pending-join descriptors without changing ownership", async () => {
    const { engine, scene } = createAssetScene();
    const cache = new SubjectAssetCacheV1(
      scene,
      createMemoryResolver(goldenSubjectAssetBytes),
    );
    const first = await cache.acquire(goldenSubjectAssetDescriptor);
    await expect(
      cache.acquire({
        ...goldenSubjectAssetDescriptor,
        inventory: { ...goldenSubjectAssetDescriptor.inventory, boneCount: 17 },
      }),
    ).rejects.toThrow(/SUBJECT_ASSET_INVENTORY_MISMATCH/);
    first.release();
    await cache.dispose();

    const resolution = deferred<{ bytes: Uint8Array; sourceLabel: string }>();
    const pendingCache = new SubjectAssetCacheV1(scene, {
      resolveSubjectAsset: async () => resolution.promise,
    });
    const validPending = pendingCache.acquire(goldenSubjectAssetDescriptor);
    const conflictingPending = pendingCache.acquire({
      ...goldenSubjectAssetDescriptor,
      inventory: { ...goldenSubjectAssetDescriptor.inventory, skeletonCount: 2 },
    });
    resolution.resolve({ bytes: goldenSubjectAssetBytes, sourceLabel: "memory" });
    const valid = await validPending;
    await expect(conflictingPending).rejects.toThrow(/SUBJECT_ASSET_INVENTORY_MISMATCH/);
    valid.release();
    await pendingCache.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("evicts a failed pending entry so the same key can retry successfully", async () => {
    const { engine, scene } = createAssetScene();
    let calls = 0;
    const cache = new SubjectAssetCacheV1(scene, {
      async resolveSubjectAsset() {
        calls += 1;
        const bytes = calls === 1 ? goldenSubjectAssetBytes.slice() : goldenSubjectAssetBytes;
        if (calls === 1) {
          const finalIndex = bytes.byteLength - 1;
          bytes[finalIndex] = bytes[finalIndex]! ^ 0xff;
        }
        return { bytes, sourceLabel: "memory" };
      },
    });
    await expect(cache.acquire(goldenSubjectAssetDescriptor)).rejects.toThrow(
      /SUBJECT_ASSET_HASH_MISMATCH/,
    );
    const lease = await cache.acquire(goldenSubjectAssetDescriptor);
    expect(calls).toBe(2);
    lease.release();
    await cache.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("preserves a post-Parse rejection when Container cleanup also fails", async () => {
    const { engine, scene } = createAssetScene();
    const loader = vi.mocked(LoadAssetContainerAsync);
    const loadImplementation = loader.getMockImplementation();
    if (loadImplementation === undefined) throw new Error("Loader test wrapper missing.");
    const secret = "BABYLON_PRIVATE_POSTPARSE_DISPOSE_FAILURE";
    let rejectedContainerDisposeCalls = 0;
    let rejectedContainerDisposeSpy: ReturnType<typeof vi.spyOn> | undefined;
    loader.mockImplementationOnce(async (...args) => {
      const container = await loadImplementation(...args);
      const nativeDispose = container.dispose.bind(container);
      rejectedContainerDisposeSpy = vi
        .spyOn(container, "dispose")
        .mockImplementation(() => {
          rejectedContainerDisposeCalls += 1;
          nativeDispose();
          throw new Error(secret);
        });
      return container;
    });
    let resolverCalls = 0;
    const cache = new SubjectAssetCacheV1(scene, {
      async resolveSubjectAsset() {
        resolverCalls += 1;
        return { bytes: goldenSubjectAssetBytes, sourceLabel: "memory" };
      },
    });
    const mismatchedDescriptor: ExecutionSubjectAssetV1 = {
      ...goldenSubjectAssetDescriptor,
      inventory: {
        ...goldenSubjectAssetDescriptor.inventory,
        vertexCount: goldenSubjectAssetDescriptor.inventory.vertexCount - 1,
      },
    };

    const primaryError = await cache.acquire(mismatchedDescriptor).catch((error) => error);

    expect(isSubjectAssetRuntimeErrorV1(primaryError)).toBe(true);
    expect(primaryError).toMatchObject({ code: "SUBJECT_ASSET_INVENTORY_MISMATCH" });
    expect(String(primaryError)).not.toContain(secret);
    expect(String(primaryError)).not.toMatch(/babylon|provider/i);
    expect(rejectedContainerDisposeCalls).toBe(1);

    const retryLease = await cache.acquire(goldenSubjectAssetDescriptor);
    expect(resolverCalls).toBe(2);
    retryLease.release();
    await cache.dispose();
    expect(rejectedContainerDisposeCalls).toBe(1);

    rejectedContainerDisposeSpy?.mockRestore();
    scene.dispose();
    engine.dispose();
  });

  it("closes atomically, rejects a pending acquire, and shares one Dispose Promise", async () => {
    const { engine, scene } = createAssetScene();
    const resolution = deferred<{ bytes: Uint8Array; sourceLabel: string }>();
    const cache = new SubjectAssetCacheV1(scene, {
      resolveSubjectAsset: async () => resolution.promise,
    });
    const pendingAcquire = cache.acquire(goldenSubjectAssetDescriptor);
    const firstDispose = cache.dispose();
    const secondDispose = cache.dispose();
    expect(secondDispose).toBe(firstDispose);
    await expect(cache.acquire(goldenSubjectAssetDescriptor)).rejects.toThrow(
      /SUBJECT_ASSET_CACHE_DISPOSED/,
    );
    resolution.resolve({ bytes: goldenSubjectAssetBytes, sourceLabel: "memory" });
    await expect(pendingAcquire).rejects.toThrow(/SUBJECT_ASSET_CACHE_DISPOSED/);
    await firstDispose;
    scene.dispose();
    engine.dispose();
  });

  it("disposes a container exactly once when shutdown races a pending Parse", async () => {
    const { engine, scene } = createAssetScene();
    const loader = vi.mocked(LoadAssetContainerAsync);
    const loadImplementation = loader.getMockImplementation();
    if (loadImplementation === undefined) throw new Error("Loader test wrapper missing.");
    const parsedContainer = deferred<AssetContainer>();
    const allowLoaderReturn = deferred<void>();
    let containerDisposeCalls = 0;
    let containerDisposeSpy: ReturnType<typeof vi.spyOn> | undefined;
    loader.mockImplementationOnce(async (...args) => {
      const container = await loadImplementation(...args);
      const nativeDispose = container.dispose.bind(container);
      containerDisposeSpy = vi.spyOn(container, "dispose").mockImplementation(() => {
        containerDisposeCalls += 1;
        nativeDispose();
      });
      parsedContainer.resolve(container);
      await allowLoaderReturn.promise;
      return container;
    });
    const cache = new SubjectAssetCacheV1(
      scene,
      createMemoryResolver(goldenSubjectAssetBytes),
    );
    const pendingAcquire = cache.acquire(goldenSubjectAssetDescriptor);
    await parsedContainer.promise;

    const disposal = cache.dispose();
    allowLoaderReturn.resolve();

    await expect(pendingAcquire).rejects.toThrow(/SUBJECT_ASSET_CACHE_DISPOSED/);
    await disposal;
    expect(containerDisposeCalls).toBe(1);
    containerDisposeSpy?.mockRestore();
    scene.dispose();
    engine.dispose();
  });

  it("disposes retained containers by descending full Cache Key", async () => {
    const { engine, scene } = createAssetScene();
    const loader = vi.mocked(LoadAssetContainerAsync);
    const loaderResultOffset = loader.mock.results.length;
    const cache = new SubjectAssetCacheV1(
      scene,
      createMemoryResolver(goldenSubjectAssetBytes),
    );
    const refsInAcquireOrder = [
      "worldkit://subject-asset/b@1",
      "worldkit://subject-asset/a@1",
      "worldkit://subject-asset/c@1",
    ];
    for (const subjectAssetRef of refsInAcquireOrder) {
      const lease = await cache.acquire({
        ...goldenSubjectAssetDescriptor,
        subjectAssetRef,
      });
      lease.release();
    }
    const loadResults = loader.mock.results.slice(loaderResultOffset);
    expect(loadResults).toHaveLength(refsInAcquireOrder.length);
    const containers = await Promise.all(
      loadResults.map((result) => result.value as Promise<AssetContainer>),
    );
    const disposedRefs: string[] = [];
    const disposalSpies = containers.map((container, index) => {
      const nativeDispose = container.dispose.bind(container);
      return vi.spyOn(container, "dispose").mockImplementation(() => {
        disposedRefs.push(refsInAcquireOrder[index]!);
        nativeDispose();
      });
    });

    await cache.dispose();

    expect(disposedRefs).toEqual([
      "worldkit://subject-asset/c@1",
      "worldkit://subject-asset/b@1",
      "worldkit://subject-asset/a@1",
    ]);
    for (const spy of disposalSpies) spy.mockRestore();
    scene.dispose();
    engine.dispose();
  });

  it("invalidates leases and live instances when Cache Dispose begins", async () => {
    const { engine, scene } = createAssetScene();
    const cache = new SubjectAssetCacheV1(
      scene,
      createMemoryResolver(goldenSubjectAssetBytes),
    );
    const lease = await cache.acquire(goldenSubjectAssetDescriptor);
    const instance = lease.instantiate("hero");
    const root = instance.rootNodes[0]!;
    const disposal = cache.dispose();
    expect(root.isDisposed()).toBe(true);
    expect(() => lease.instantiate("late")).toThrow(/SUBJECT_ASSET_LEASE_RELEASED/);
    lease.release();
    instance.dispose();
    await disposal;
    scene.dispose();
    engine.dispose();
  });

  it("continues Cache cleanup and sanitizes a native Instance disposal failure", async () => {
    const { engine, scene } = createAssetScene();
    const loader = vi.mocked(LoadAssetContainerAsync);
    const loaderResultOffset = loader.mock.results.length;
    const cache = new SubjectAssetCacheV1(
      scene,
      createMemoryResolver(goldenSubjectAssetBytes),
    );
    const firstLease = await cache.acquire({
      ...goldenSubjectAssetDescriptor,
      subjectAssetRef: "worldkit://subject-asset/disposal-a@1",
    });
    const secondLease = await cache.acquire({
      ...goldenSubjectAssetDescriptor,
      subjectAssetRef: "worldkit://subject-asset/disposal-b@1",
    });
    const firstInstance = firstLease.instantiate("hero-a");
    const siblingInstance = firstLease.instantiate("hero-a-sibling");
    const secondInstance = secondLease.instantiate("hero-b");
    const containers = await Promise.all(
      loader.mock.results
        .slice(loaderResultOffset)
        .map((result) => result.value as Promise<AssetContainer>),
    );
    expect(containers).toHaveLength(2);

    const containerDisposeCalls = [0, 0];
    const containerDisposeSpies = containers.map((container, index) => {
      const nativeDispose = container.dispose.bind(container);
      return vi.spyOn(container, "dispose").mockImplementation(() => {
        containerDisposeCalls[index] = containerDisposeCalls[index]! + 1;
        nativeDispose();
      });
    });
    const secret = "BABYLON_PROVIDER_PRIVATE_DISPOSE_FAILURE";
    let firstInstanceDisposeCalls = 0;
    const firstRoot = firstInstance.rootNodes[0]!;
    const firstRootDisposeSpy = vi.spyOn(firstRoot, "dispose").mockImplementation(() => {
      firstInstanceDisposeCalls += 1;
      throw new Error(secret);
    });
    let siblingInstanceDisposeCalls = 0;
    const siblingRoot = siblingInstance.rootNodes[0]!;
    const nativeSiblingRootDispose = siblingRoot.dispose.bind(siblingRoot);
    const siblingRootDisposeSpy = vi
      .spyOn(siblingRoot, "dispose")
      .mockImplementation((...args) => {
        siblingInstanceDisposeCalls += 1;
        nativeSiblingRootDispose(...args);
      });
    let secondInstanceDisposeCalls = 0;
    const secondRoot = secondInstance.rootNodes[0]!;
    const nativeSecondRootDispose = secondRoot.dispose.bind(secondRoot);
    const secondRootDisposeSpy = vi
      .spyOn(secondRoot, "dispose")
      .mockImplementation((...args) => {
        secondInstanceDisposeCalls += 1;
        nativeSecondRootDispose(...args);
      });

    let firstDisposal: Promise<void> | undefined;
    expect(() => {
      firstDisposal = cache.dispose();
    }).not.toThrow();
    expect(firstDisposal).toBeInstanceOf(Promise);
    const repeatedDisposal = cache.dispose();
    expect(repeatedDisposal).toBe(firstDisposal);
    const disposalError = await firstDisposal!.catch((error) => error);

    expect(isSubjectAssetRuntimeErrorV1(disposalError)).toBe(true);
    expect(disposalError).toMatchObject({ code: "SUBJECT_ASSET_FORMAT_UNSUPPORTED" });
    expect(String(disposalError)).not.toContain(secret);
    expect(String(disposalError)).not.toMatch(/babylon|provider/i);
    expect(firstInstanceDisposeCalls).toBe(1);
    expect(siblingInstanceDisposeCalls).toBe(1);
    expect(secondInstanceDisposeCalls).toBe(1);
    expect(containerDisposeCalls).toEqual([1, 1]);
    expect(secondRoot.isDisposed()).toBe(true);
    expect(() => firstLease.instantiate("late-a")).toThrow(
      /SUBJECT_ASSET_LEASE_RELEASED/,
    );
    expect(() => secondLease.instantiate("late-b")).toThrow(
      /SUBJECT_ASSET_LEASE_RELEASED/,
    );
    firstLease.release();
    secondLease.release();
    firstInstance.dispose();
    siblingInstance.dispose();
    secondInstance.dispose();
    expect(firstInstanceDisposeCalls).toBe(1);
    expect(siblingInstanceDisposeCalls).toBe(1);
    expect(secondInstanceDisposeCalls).toBe(1);
    expect(containerDisposeCalls).toEqual([1, 1]);

    firstRootDisposeSpy.mockRestore();
    siblingRootDisposeSpy.mockRestore();
    secondRootDisposeSpy.mockRestore();
    for (const spy of containerDisposeSpies) spy.mockRestore();
    scene.dispose();
    engine.dispose();
  });
});
