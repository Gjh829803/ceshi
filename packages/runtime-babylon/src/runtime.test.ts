import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import { Animation } from "@babylonjs/core/Animations/animation.js";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
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
  type AuthoringSpecV3,
} from "@whitebox-world/authoring";
import { compileWorld } from "@whitebox-world/compiler";
import {
  createValidAuthoringSpec,
  createValidPackageSubjectWorld,
  createValidRiggedPackageSubjectWorld,
} from "../../authoring/src/test-fixture";
import type {
  ExecutionAnimationSetV1,
  ExecutionPlanV4,
  ExecutionSubjectAssetV1,
  FixedInputV1,
  Vec3,
} from "@whitebox-world/runtime-contracts";

import {
  BabylonWorldRuntime,
  SubjectAssetCacheV1,
  SubjectAssetRuntimeErrorV1,
  isWorldRuntimeLayoutAssertionErrorV1,
  isSubjectAssetRuntimeErrorV1,
  type SubjectAssetResolverV1,
  type SubjectAssetInstanceV1,
  type SubjectAssetLeaseV1,
  type SubjectAssetRuntimeLimitsV1,
  type SubjectVisual,
  type BabylonWorldRuntimeOptions,
} from "./index";
import { SubjectAnimationPlayer } from "./subject-animation-player";

const loadAssetContainerImplementation = vi
  .mocked(LoadAssetContainerAsync)
  .getMockImplementation()!;

function mutateNextLoadedContainer(
  mutate: (container: AssetContainer) => void,
): void {
  vi.mocked(LoadAssetContainerAsync).mockImplementationOnce(async (...args) => {
    const container = await loadAssetContainerImplementation(...args);
    mutate(container);
    return container;
  });
}

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

const gBotSubjectAssetBytes = new Uint8Array(
  await readFile(
    new URL(
      "../../../apps/playground/public/subject-assets/humanoid/g-bot/v1/g-bot.glb",
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

function createClipGroup(
  scene: Scene,
  name: string,
  options: {
    from?: number;
    to?: number;
    framesPerSecond?: number;
    secondFramesPerSecond?: number;
  } = {},
): AnimationGroup {
  const from = options.from ?? 0;
  const to = options.to ?? 60;
  const target = new TransformNode(`${name}.target`, scene);
  const group = new AnimationGroup(name, scene);
  const addAnimation = (framesPerSecond: number, suffix: string): void => {
    const animation = new Animation(
      `${name}.${suffix}`,
      "rotation.x",
      framesPerSecond,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );
    animation.setKeys([
      { frame: from, value: 0 },
      { frame: to, value: 1 },
    ]);
    group.addTargetedAnimation(animation, target);
  };
  addAnimation(options.framesPerSecond ?? 60, "primary");
  if (options.secondFramesPerSecond !== undefined) {
    addAnimation(options.secondFramesPerSecond, "secondary");
  }
  return group;
}

function createAnimationSet(
  overrides: Partial<ExecutionAnimationSetV1> = {},
): ExecutionAnimationSetV1 {
  return {
    animationSetRef: "worldkit://animation-set/test@1",
    subjectAssetRef: goldenSubjectAssetDescriptor.subjectAssetRef,
    rigProfileRef: "worldkit://rig-profile/test@1",
    defaultActionId: "idle",
    requiredActionIds: ["idle", "walk", "run", "jump"],
    animationBindings: [
      {
        actionId: "idle",
        sourceClipName: "idle",
        loopMode: "repeat",
        playbackSpeedRatio: 1,
        blendDurationSeconds: 0,
        rootMotionMode: "in-place",
      },
      {
        actionId: "walk",
        sourceClipName: "walk",
        loopMode: "repeat",
        playbackSpeedRatio: 1.5,
        blendDurationSeconds: 0.5,
        rootMotionMode: "in-place",
      },
      {
        actionId: "run",
        sourceClipName: "run",
        loopMode: "repeat",
        playbackSpeedRatio: 1,
        blendDurationSeconds: 0.25,
        rootMotionMode: "in-place",
      },
      {
        actionId: "jump",
        sourceClipName: "jump",
        loopMode: "once",
        playbackSpeedRatio: 2,
        blendDurationSeconds: 0,
        rootMotionMode: "in-place",
      },
    ],
    ...overrides,
  };
}

function animationFrame(group: AnimationGroup): number {
  const animatable = group.animatables[0];
  if (animatable === undefined) throw new Error(`Animation '${group.name}' is not started.`);
  return animatable.masterFrame;
}

function animationWeight(group: AnimationGroup): number {
  const animatable = group.animatables[0];
  if (animatable === undefined) throw new Error(`Animation '${group.name}' is not started.`);
  return animatable.weight;
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

interface RiggedVisualInternals extends SubjectVisual {
  assetInstance?: SubjectAssetInstanceV1;
  assetLease?: SubjectAssetLeaseV1;
  primitiveMeshes?: readonly TransformNode[];
  assetPartRoots?: readonly TransformNode[];
}

interface RiggedRuntimeProbe {
  visual(subjectEntityId: string): RiggedVisualInternals;
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

function createRiggedRuntimeProbe(runtime: BabylonWorldRuntime): RiggedRuntimeProbe {
  const internals = runtime as unknown as {
    subjectVisuals: readonly RiggedVisualInternals[];
  };
  return {
    visual(subjectEntityId) {
      const visual = internals.subjectVisuals.find(
        (candidate) =>
          candidate.root.metadata?.worldkitEntityId === subjectEntityId,
      );
      if (visual === undefined) throw new Error(`Missing Subject '${subjectEntityId}'.`);
      return visual;
    },
  };
}

function addVec3(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function moveRightForTicks(tickCount: number): FixedInputV1 {
  return { actions: ["move-right"], ticks: tickCount };
}

function compileExecutionPlan(spec: AuthoringSpecV3): ExecutionPlanV4 {
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
  mutator?: (spec: AuthoringSpecV3) => void,
): ExecutionPlanV4 {
  const spec = createValidPackageSubjectWorld();
  mutator?.(spec);
  return compileExecutionPlan(spec);
}

async function createRuntime(
  executionPlan = createExecutionPlan(),
  options: Pick<
    BabylonWorldRuntimeOptions,
    "engineFactory" | "subjectAssetResolver" | "subjectAssetCacheOptions"
  > = {},
): Promise<BabylonWorldRuntime> {
  return BabylonWorldRuntime.create({
    executionPlan,
    ...options,
    havokWasmBinary,
    engineFactory: options.engineFactory ?? (() =>
      new NullEngine({
        renderWidth: 640,
        renderHeight: 360,
        textureSize: 512,
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
      })),
  });
}

function createRiggedExecutionPlan(): ExecutionPlanV4 {
  return compileExecutionPlan(createValidRiggedPackageSubjectWorld());
}

function createTwoRiggedSubjectExecutionPlan(): ExecutionPlanV4 {
  const executionPlan = createRiggedExecutionPlan();
  const player = executionPlan.subjects[0]!;
  return {
    ...executionPlan,
    subjects: [
      player,
      {
        ...player,
        entityId: "hero-b",
        spawnAnchorEntityId: "spawn-hero-b",
        spawnSubjectOriginPositionMetersXYZ: [4, 0, 30],
      },
    ],
  };
}

async function expectRiggedRuntimeFailure(
  executionPlan: ExecutionPlanV4,
  code: SubjectAssetRuntimeErrorV1["code"],
): Promise<void> {
  const error = await createRiggedRuntime(executionPlan).catch(
    (reason) => reason as unknown,
  );
  expect(isSubjectAssetRuntimeErrorV1(error)).toBe(true);
  expect(error).toMatchObject({ code });
  expect(error).not.toHaveProperty("cause");
}

async function createRiggedRuntime(
  executionPlan = createRiggedExecutionPlan(),
): Promise<BabylonWorldRuntime> {
  return createRuntime(executionPlan, {
    subjectAssetResolver: createMemoryResolver(goldenSubjectAssetBytes),
  });
}

async function movementResult(
  executionPlan: ExecutionPlanV4,
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
  executionPlan: ExecutionPlanV4;
  debug: RuntimeDebugProbe;
}> {
  const executionPlan = createExecutionPlan();
  const runtime = await createRuntime(executionPlan);
  return { runtime, executionPlan, debug: createRuntimeDebugProbe(runtime) };
}

describe("BabylonWorldRuntime", () => {
  it("initializes a right-handed Babylon scene with Havok from ExecutionPlanV4", async () => {
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
          activeActionId: "idle",
        },
      },
      resources: { terrainSamples: 65 * 65 },
    });
    expect(runtime.snapshot().resources.meshes).toBeGreaterThanOrEqual(10);

    await runtime.dispose();
    await runtime.dispose();
  });

  it("rejects a tampered frozen support assertion and cleans initialized resources", async () => {
    const executionPlan = createExecutionPlan();
    const wallPlacement = executionPlan.layout.placementsByEntityId["wall-east"]!;
    const tamperedPlan: ExecutionPlanV4 = {
      ...executionPlan,
      layout: {
        ...executionPlan.layout,
        placementsByEntityId: {
          ...executionPlan.layout.placementsByEntityId,
          "wall-east": {
            ...wallPlacement,
            transform: {
              ...wallPlacement.transform,
              positionMetersXYZ: [
                wallPlacement.transform.positionMetersXYZ[0],
                wallPlacement.transform.positionMetersXYZ[1] + 1_000,
                wallPlacement.transform.positionMetersXYZ[2],
              ],
            },
          },
        },
        layoutAssertions: [
          ...executionPlan.layout.layoutAssertions,
          {
            constraintId: "wall-support",
            kind: "supported-by",
            supportedEntityId: "wall-east",
            supportingEntityId: executionPlan.terrain.entityId,
            maximumSupportGapMeters: 100,
            minimumSupportRatio: 1,
            evidenceEntityIds: ["wall-east", executionPlan.terrain.entityId],
            measurements: {},
            tolerances: {},
          },
        ],
      },
    };
    const engine = new NullEngine();
    const disposeEngine = vi.spyOn(engine, "dispose");

    const error = await createRuntime(tamperedPlan, {
      engineFactory: () => engine,
    }).catch((reason) => reason as unknown);

    expect(isWorldRuntimeLayoutAssertionErrorV1(error)).toBe(true);
    expect(error).toMatchObject({
      code: "WORLDKIT_LAYOUT_ASSERTION_FAILED",
      message: "WORLDKIT_LAYOUT_ASSERTION_FAILED: A frozen layout assertion failed.",
    });
    expect(error).not.toHaveProperty("cause");
    expect(disposeEngine).toHaveBeenCalledTimes(1);
  });

  it("rejects a tampered frozen minimum-clearance assertion", async () => {
    const executionPlan = createExecutionPlan();
    const wallPlacement = executionPlan.layout.placementsByEntityId["wall-east"]!;
    const spawnPlacement = executionPlan.layout.placementsByEntityId["spawn-main"]!;
    const tamperedPlan: ExecutionPlanV4 = {
      ...executionPlan,
      layout: {
        ...executionPlan.layout,
        placementsByEntityId: {
          ...executionPlan.layout.placementsByEntityId,
          "spawn-main": {
            ...spawnPlacement,
            transform: {
              ...spawnPlacement.transform,
              positionMetersXYZ: wallPlacement.transform.positionMetersXYZ,
            },
          },
        },
        layoutAssertions: [
          ...executionPlan.layout.layoutAssertions,
          {
            constraintId: "spawn-wall-clearance",
            kind: "minimum-clearance",
            entityId: "spawn-main",
            semanticClassIds: ["obstacle.wall"],
            clearanceMeters: 0.1,
            evidenceEntityIds: ["spawn-main", "wall-east"],
            measurements: {},
            tolerances: {},
          },
        ],
      },
    };

    const error = await createRuntime(tamperedPlan).catch(
      (reason) => reason as unknown,
    );

    expect(isWorldRuntimeLayoutAssertionErrorV1(error)).toBe(true);
    expect(error).toMatchObject({ code: "WORLDKIT_LAYOUT_ASSERTION_FAILED" });
    expect(error).not.toHaveProperty("cause");
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
      createValidRiggedPackageSubjectWorld(),
    );

    const error = await createRuntime(executionPlan).catch((reason) => reason as unknown);

    expect(isSubjectAssetRuntimeErrorV1(error)).toBe(true);
    expect(error).toMatchObject({ code: "SUBJECT_ASSET_RESOLVER_REQUIRED" });
  });

  it("loads a rigged Subject through the injected resolver and exposes deterministic Action state", async () => {
    const runtime = await createRiggedRuntime();

    await expect(runtime.ready).resolves.toBeUndefined();
    expect(runtime.snapshot().subjectStatesByEntityId.player?.activeActionId).toBe("idle");

    const walking = await runtime.runFixedInput({ actions: ["move-right"], ticks: 2 });
    expect(walking.subjectStatesByEntityId.player?.activeActionId).toBe("walk");

    const running = await runtime.runFixedInput({
      actions: ["move-right", "run"],
      ticks: 2,
    });
    expect(running.subjectStatesByEntityId.player?.activeActionId).toBe("run");

    const jumping = await runtime.runFixedInput({ actions: ["jump"], ticks: 4 });
    expect(jumping.subjectStatesByEntityId.player?.activeActionId).toBe("jump");
    const idleAgain = await runtime.runFixedInput({ actions: [], ticks: 180 });
    expect(idleAgain.subjectStatesByEntityId.player?.activeActionId).toBe("idle");

    await runtime.dispose();
  });

  it("loads the Registry G Bot with a Hips-root Mixamo rig and four semantic Actions", async () => {
    const spec = createValidAuthoringSpec();
    spec.nodes = spec.nodes.map((node) =>
      node.kind === "subject" && node.id === "player"
        ? {
            ...node,
            subjectDefinitionRef:
              "worldkit://subject-definition/humanoid.g-bot@1",
          }
        : node,
    );
    const baseExecutionPlan = compileExecutionPlan(spec);
    const primarySubject = baseExecutionPlan.subjects[0]!;
    const executionPlan: ExecutionPlanV4 = {
      ...baseExecutionPlan,
      subjects: [
        primarySubject,
        {
          ...primarySubject,
          entityId: "g-bot-secondary",
          spawnAnchorEntityId: "spawn-g-bot-secondary",
          spawnSubjectOriginPositionMetersXYZ: [4, 0, 30],
        },
      ],
    };
    expect(executionPlan.rigProfiles).toEqual([
      expect.objectContaining({
        skeletonRootBoneName: "mixamorig:Hips",
        sourceNodeNameByBoneId: expect.objectContaining({
          hips: "mixamorig:Hips",
          "hand.right": "mixamorig:RightHand",
        }),
      }),
    ]);

    const runtime = await createRuntime(executionPlan, {
      subjectAssetResolver: createMemoryResolver(gBotSubjectAssetBytes),
    });
    const probe = createRiggedRuntimeProbe(runtime);
    const visual = probe.visual("player");
    const secondaryVisual = probe.visual("g-bot-secondary");
    const primaryInstance = visual.assetInstance!;
    const secondaryInstance = secondaryVisual.assetInstance!;
    const primaryHandSocket = visual.socketNodesById.get("hand.right")!;
    const secondaryHandSocket = secondaryVisual.socketNodesById.get("hand.right")!;
    expect(primaryInstance.skeletons[0]?.bones).toHaveLength(65);
    expect(
      primaryInstance.skeletons[0]?.bones
        .filter((bone) => bone.getParent() === null)
        .map((bone) => bone.name),
    ).toEqual(["mixamorig:Hips"]);
    expect(primaryInstance.rootNodes[0]).not.toBe(secondaryInstance.rootNodes[0]);
    expect(primaryInstance.meshes[0]).not.toBe(secondaryInstance.meshes[0]);
    expect(primaryInstance.skeletons[0]).not.toBe(secondaryInstance.skeletons[0]);
    expect(primaryInstance.animationGroups[0]).not.toBe(
      secondaryInstance.animationGroups[0],
    );
    expect(primaryHandSocket).not.toBe(secondaryHandSocket);
    const relativeSocketPosition = (
      socket: TransformNode,
      visualRoot: TransformNode,
    ): Vector3 => {
      visualRoot.computeWorldMatrix(true);
      socket.computeWorldMatrix(true);
      return Vector3.TransformCoordinates(
        socket.getAbsolutePosition(),
        visualRoot.getWorldMatrix().clone().invert(),
      );
    };
    const primaryHandPositionBefore = relativeSocketPosition(
      primaryHandSocket,
      visual.root,
    );
    expect(runtime.snapshot().subjectStatesByEntityId.player?.activeActionId).toBe(
      "idle",
    );
    expect(
      (await runtime.runFixedInput({ actions: ["move-right"], ticks: 2 }))
        .subjectStatesByEntityId.player?.activeActionId,
    ).toBe("walk");
    expect(
      (await runtime.runFixedInput({ actions: ["move-right", "run"], ticks: 30 }))
        .subjectStatesByEntityId.player?.activeActionId,
    ).toBe("run");
    runtime.renderFrame();
    expect(
      primaryInstance.animationGroups.find((group) => group.name === "run")
        ?.isStarted,
    ).toBe(true);
    expect(
      secondaryInstance.animationGroups.find((group) => group.name === "run")
        ?.isStarted,
    ).toBeFalsy();
    expect(
      relativeSocketPosition(primaryHandSocket, visual.root)
        .subtract(primaryHandPositionBefore)
        .length(),
    ).toBeGreaterThan(0.001);
    expect(
      (await runtime.runFixedInput({ actions: ["jump"], ticks: 4 }))
        .subjectStatesByEntityId.player?.activeActionId,
    ).toBe("jump");
    expect(
      runtime.snapshot().subjectStatesByEntityId["g-bot-secondary"]
        ?.activeActionId,
    ).toBe("idle");
    visual.dispose();
    expect(primaryHandSocket.isDisposed()).toBe(true);
    expect(primaryInstance.rootNodes[0]?.isDisposed()).toBe(true);
    expect(secondaryHandSocket.isDisposed()).toBe(false);
    expect(secondaryInstance.rootNodes[0]?.isDisposed()).toBe(false);
    await runtime.dispose();
  });

  it("keeps two rigged Subjects on isolated Skeleton, Clip, Socket, and Action state", async () => {
    const basePlan = createTwoRiggedSubjectExecutionPlan();
    const executionPlan: ExecutionPlanV4 = {
      ...basePlan,
      subjects: basePlan.subjects.map((subject) => ({
        ...subject,
        visualParts:
          subject.entityId === "player"
            ? [
                ...subject.visualParts,
                {
                  id: "marker",
                  kind: "primitive" as const,
                  shape: { kind: "sphere" as const, radiusMeters: 0.08 },
                  localTransform: {
                    positionMetersXYZ: [0, 2.05, 0] as const,
                    rotationEulerRadiansXYZ: [0, 0, 0] as const,
                  },
                  semanticTags: ["marker"],
                },
              ]
            : subject.visualParts,
        sockets: [
          ...subject.sockets.map((socket) =>
            subject.entityId === "player" && socket.kind === "bone"
              ? {
                  ...socket,
                  offsetTransform: {
                    ...socket.offsetTransform,
                    positionMetersXYZ: [0.2, 0, 0] as const,
                  },
                }
              : socket,
          ),
          {
            id: "focus.local",
            kind: "local" as const,
            localTransform: {
              positionMetersXYZ: [0, 1.5, 0] as const,
              rotationEulerRadiansXYZ: [0, 0, 0] as const,
            },
            semanticTags: ["focus"],
          },
        ],
      })),
    };
    const runtime = await createRiggedRuntime(executionPlan);
    const probe = createRiggedRuntimeProbe(runtime);
    const playerVisual = probe.visual("player");
    const heroBVisual = probe.visual("hero-b");
    const playerInstance = playerVisual.assetInstance!;
    const heroBInstance = heroBVisual.assetInstance!;

    expect(playerVisual.root).not.toBe(heroBVisual.root);
    expect(playerInstance.rootNodes[0]).not.toBe(heroBInstance.rootNodes[0]);
    expect(playerInstance.meshes[0]).not.toBe(heroBInstance.meshes[0]);
    expect(playerInstance.skeletons[0]).not.toBe(heroBInstance.skeletons[0]);
    expect(playerInstance.animationGroups[0]).not.toBe(
      heroBInstance.animationGroups[0],
    );
    expect(
      playerVisual.meshes.some((mesh) => mesh.name === "player.marker"),
    ).toBe(true);
    expect(
      playerVisual.meshes.some((mesh) => mesh.name.includes("GoldenHumanoidMesh")),
    ).toBe(true);
    const markerMaterial = playerVisual.meshes.find(
      (mesh) => mesh.name === "player.marker",
    )!.material;
    expect(
      playerVisual.meshes.find((mesh) => mesh.name.includes("GoldenHumanoidMesh"))!
        .material,
    ).toBe(markerMaterial);
    expect([...playerVisual.socketNodesById.keys()].sort()).toEqual([
      "focus.local",
      "hand.right",
    ]);

    const handSocket = playerVisual.socketNodesById.get("hand.right")!;
    const localSocket = playerVisual.socketNodesById.get("focus.local")!;
    const heroBHandSocket = heroBVisual.socketNodesById.get("hand.right")!;
    const heroBLocalSocket = heroBVisual.socketNodesById.get("focus.local")!;
    expect(handSocket).not.toBe(heroBHandSocket);
    expect(localSocket).not.toBe(heroBLocalSocket);
    const relativeSocketPosition = (
      socket: TransformNode,
      visualRoot: TransformNode,
    ): Vector3 => {
      visualRoot.computeWorldMatrix(true);
      socket.computeWorldMatrix(true);
      return Vector3.TransformCoordinates(
        socket.getAbsolutePosition(),
        visualRoot.getWorldMatrix().clone().invert(),
      );
    };
    const rootPositionBefore = playerVisual.root.getAbsolutePosition().clone();
    const relativeSocketBefore = relativeSocketPosition(
      handSocket,
      playerVisual.root,
    );
    playerVisual.stepAnimation(0, "run");
    playerVisual.stepAnimation(30, "run");
    runtime.renderFrame();
    const relativeSocketAfter = relativeSocketPosition(
      handSocket,
      playerVisual.root,
    );
    const snapshot = runtime.snapshot();

    expect(snapshot.subjectStatesByEntityId.player?.activeActionId).toBe("run");
    expect(snapshot.subjectStatesByEntityId["hero-b"]?.activeActionId).toBe("idle");
    expect(playerVisual.root.getAbsolutePosition()).toEqual(rootPositionBefore);
    expect(relativeSocketAfter.subtract(relativeSocketBefore).length()).toBeGreaterThan(
      0.001,
    );
    expect(
      playerInstance.animationGroups.find((group) => group.name === "run")?.isStarted,
    ).toBe(true);
    expect(
      heroBInstance.animationGroups.find((group) => group.name === "run")?.isStarted,
    ).toBeFalsy();

    playerVisual.dispose();
    expect(handSocket.isDisposed()).toBe(true);
    expect(localSocket.isDisposed()).toBe(true);
    expect(playerInstance.rootNodes[0]!.isDisposed()).toBe(true);
    expect(heroBHandSocket.isDisposed()).toBe(false);
    expect(heroBLocalSocket.isDisposed()).toBe(false);
    expect(heroBInstance.rootNodes[0]!.isDisposed()).toBe(false);

    await runtime.dispose();
  });

  it("transitions jump back to idle and reset restores Tick zero and idle frame", async () => {
    const runtime = await createRiggedRuntime();
    const probe = createRiggedRuntimeProbe(runtime);
    const visual = probe.visual("player");

    await runtime.runFixedInput({ actions: [], ticks: 5 });
    const jumping = await runtime.runFixedInput({ actions: ["jump"], ticks: 4 });
    expect(jumping.subjectStatesByEntityId.player).toMatchObject({
      activeActionId: "jump",
      movementMedium: "air",
      velocityMetersPerSecondXYZ: [0, expect.any(Number), 0],
    });
    const landed = await runtime.runFixedInput({ actions: [], ticks: 180 });
    expect(landed.subjectStatesByEntityId.player).toMatchObject({
      activeActionId: "idle",
      movementMedium: "ground",
      positionMetersXYZ: [0, expect.any(Number), 30],
      velocityMetersPerSecondXYZ: [0, expect.any(Number), 0],
    });

    const reset = runtime.reset();
    const idleGroup = visual.assetInstance!.animationGroups.find(
      (group) => group.name === "idle",
    )!;
    expect(reset.tick).toBe(0);
    expect(reset.subjectStatesByEntityId.player?.activeActionId).toBe("idle");
    expect(animationFrame(idleGroup)).toBe(idleGroup.from);
    await runtime.dispose();
  });

  it("produces the same rigged Snapshot for identical fixed input", async () => {
    const first = await createRiggedRuntime();
    const second = await createRiggedRuntime();
    const input = { actions: ["move-right", "run"] as const, ticks: 45 };

    const firstSnapshot = await first.runFixedInput(input);
    const secondSnapshot = await second.runFixedInput(input);

    expect(secondSnapshot).toEqual(firstSnapshot);
    await first.dispose();
    await second.dispose();
  });

  it("rejects missing, aliased, and incorrectly rooted Rig Bone mappings", async () => {
    for (const mutateRig of [
      (plan: ExecutionPlanV4) => {
        const rig = plan.rigProfiles[0]!;
        (rig.sourceNodeNameByBoneId as Record<string, string>).head = "missing-head";
      },
      (plan: ExecutionPlanV4) => {
        const rig = plan.rigProfiles[0]!;
        (rig.sourceNodeNameByBoneId as Record<string, string>)["hand.right"] =
          rig.sourceNodeNameByBoneId["hand.left"];
      },
      (plan: ExecutionPlanV4) => {
        (plan.rigProfiles[0] as { skeletonRootBoneName: string }).skeletonRootBoneName =
          "hips";
      },
    ]) {
      const executionPlan = createRiggedExecutionPlan();
      mutateRig(executionPlan);
      await expectRiggedRuntimeFailure(
        executionPlan,
        "SUBJECT_ASSET_RIG_INCOMPATIBLE",
      );
    }
  });

  it("rejects missing Clips and invalid runtime Animation bindings with one typed code", async () => {
    for (const mutateBinding of [
      (binding: Record<string, unknown>) => {
        binding.sourceClipName = "missing";
      },
      (binding: Record<string, unknown>) => {
        binding.playbackSpeedRatio = 0;
      },
      (binding: Record<string, unknown>) => {
        binding.blendDurationSeconds = -1;
      },
    ]) {
      const executionPlan = createRiggedExecutionPlan();
      mutateBinding(
        executionPlan.animationSets[0]!.animationBindings[0] as unknown as Record<
          string,
          unknown
        >,
      );
      await expectRiggedRuntimeFailure(
        executionPlan,
        "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE",
      );
    }
  });

  it("rejects Root and Hips position channels by Bone and linked-node identity", async () => {
    for (const targetKind of ["bone", "linked-transform"] as const) {
      mutateNextLoadedContainer((container) => {
        const nativeInstantiate = container.instantiateModelsToScene.bind(container);
        vi.spyOn(container, "instantiateModelsToScene").mockImplementation((...args) => {
          const instance = nativeInstantiate(...args);
          const skeleton = instance.skeletons[0]!;
          const bone = skeleton.bones.find((candidate) =>
            candidate.name === (targetKind === "bone" ? "root" : "hips"),
          )!;
          const target = targetKind === "bone" ? bone : bone.getTransformNode()!;
          const property = targetKind === "bone" ? "position.x" : "position";
          const animation = new Animation(
            `forbidden.${targetKind}`,
            property,
            60,
            targetKind === "bone"
              ? Animation.ANIMATIONTYPE_FLOAT
              : Animation.ANIMATIONTYPE_VECTOR3,
            Animation.ANIMATIONLOOPMODE_CONSTANT,
          );
          const value = targetKind === "bone" ? 0 : Vector3.Zero();
          animation.setKeys([
            { frame: 0, value },
            { frame: 1, value },
          ]);
          instance.animationGroups
            .find((group) => group.name.endsWith("idle"))!
            .addTargetedAnimation(animation, target);
          return instance;
        });
      });

      await expectRiggedRuntimeFailure(
        createRiggedExecutionPlan(),
        "SUBJECT_ASSET_ROOT_MOTION_UNSUPPORTED",
      );
    }
  });

  it("does not infer forbidden Root Motion from a target display name", async () => {
    mutateNextLoadedContainer((container) => {
      const nativeInstantiate = container.instantiateModelsToScene.bind(container);
      vi.spyOn(container, "instantiateModelsToScene").mockImplementation((...args) => {
        const instance = nativeInstantiate(...args);
        const decoyTarget = instance.rootNodes[0]!;
        decoyTarget.name = "root";
        const animation = new Animation(
          "allowed.display-name-decoy",
          "position.x",
          60,
          Animation.ANIMATIONTYPE_FLOAT,
          Animation.ANIMATIONLOOPMODE_CONSTANT,
        );
        animation.setKeys([
          { frame: 0, value: 0 },
          { frame: 1, value: 0 },
        ]);
        instance.animationGroups
          .find((group) => group.name.endsWith("idle"))!
          .addTargetedAnimation(animation, decoyTarget);
        return instance;
      });
    });

    const runtime = await createRiggedRuntime();
    expect(runtime.snapshot().subjectStatesByEntityId.player?.activeActionId).toBe(
      "idle",
    );
    await runtime.dispose();
  });

  it("rejects missing, multiple, duplicate-name, and multiple-root Skeleton structures", async () => {
    const cases: Array<{
      mutatePlan?: (plan: ExecutionPlanV4) => void;
      mutateContainer: (container: AssetContainer) => void;
    }> = [
      {
        mutatePlan(plan) {
          plan.subjectAssets[0]!.inventory.skeletonCount = 0;
          plan.subjectAssets[0]!.inventory.boneCount = 0;
        },
        mutateContainer(container) {
          container.skeletons.splice(0);
        },
      },
      {
        mutatePlan(plan) {
          plan.subjectAssets[0]!.inventory.skeletonCount = 2;
          plan.subjectAssets[0]!.inventory.boneCount = 36;
        },
        mutateContainer(container) {
          container.skeletons.push(
            container.skeletons[0]!.clone("extra-skeleton"),
          );
        },
      },
      {
        mutateContainer(container) {
          container.skeletons[0]!.bones.find((bone) => bone.name === "head")!.name =
            "root";
        },
      },
      {
        mutateContainer(container) {
          container.skeletons[0]!.bones
            .find((bone) => bone.name === "head")!
            .setParent(null);
        },
      },
    ];

    for (const testCase of cases) {
      const executionPlan = createRiggedExecutionPlan();
      testCase.mutatePlan?.(executionPlan);
      mutateNextLoadedContainer(testCase.mutateContainer);
      await expectRiggedRuntimeFailure(
        executionPlan,
        "SUBJECT_ASSET_RIG_INCOMPATIBLE",
      );
    }
  });

  it("rejects a Bone Socket when no cloned Mesh is driven by the Rig Skeleton", async () => {
    mutateNextLoadedContainer((container) => {
      for (const mesh of container.meshes) mesh.skeleton = null;
    });

    await expectRiggedRuntimeFailure(
      createRiggedExecutionPlan(),
      "SUBJECT_ASSET_RIG_INCOMPATIBLE",
    );
  });

  it("uses the closed Socket diagnostic when a Bone Socket cannot resolve its semantic Bone", async () => {
    const executionPlan = createRiggedExecutionPlan();
    const subject = executionPlan.subjects[0]!;
    const boneSocket = subject.sockets.find((socket) => socket.kind === "bone")!;
    (boneSocket as { boneId: string }).boneId = "unmapped.bone";

    await expectRiggedRuntimeFailure(
      executionPlan,
      "SUBJECT_ASSET_SOCKET_BONE_MISSING",
    );
  });

  it("unwinds the partial runtime and disposes a cloned Asset instance exactly once", async () => {
    let instanceDispose: ReturnType<typeof vi.fn> | undefined;
    const secret = "BABYLON_PROVIDER_PRIVATE_INITIALIZATION_CLEANUP_FAILURE";
    mutateNextLoadedContainer((container) => {
      const nativeInstantiate = container.instantiateModelsToScene.bind(container);
      vi.spyOn(container, "instantiateModelsToScene").mockImplementation((...args) => {
        const instance = nativeInstantiate(...args);
        const nativeDispose = instance.dispose.bind(instance);
        instanceDispose = vi.fn(() => {
          nativeDispose();
          throw new Error(secret);
        });
        instance.dispose = instanceDispose;
        return instance;
      });
    });
    const executionPlan = createRiggedExecutionPlan();
    (executionPlan.rigProfiles[0] as { skeletonRootBoneName: string }).skeletonRootBoneName =
      "hips";
    const engine = new NullEngine();

    const error = await BabylonWorldRuntime.create({
      executionPlan,
      havokWasmBinary,
      engineFactory: () => engine,
      subjectAssetResolver: createMemoryResolver(goldenSubjectAssetBytes),
    }).catch((reason) => reason as unknown);

    expect(error).toMatchObject({ code: "SUBJECT_ASSET_RIG_INCOMPATIBLE" });
    expect(error).not.toHaveProperty("cause");
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toMatch(/babylon|provider/i);
    expect(instanceDispose).toHaveBeenCalledTimes(1);
    expect(engine.isDisposed).toBe(true);
  });

  it("disposes a successful rigged Visual instance once across repeated Runtime disposal", async () => {
    let instanceDispose: ReturnType<typeof vi.fn> | undefined;
    mutateNextLoadedContainer((container) => {
      const nativeInstantiate = container.instantiateModelsToScene.bind(container);
      vi.spyOn(container, "instantiateModelsToScene").mockImplementation((...args) => {
        const instance = nativeInstantiate(...args);
        const nativeDispose = instance.dispose.bind(instance);
        instanceDispose = vi.fn(() => nativeDispose());
        instance.dispose = instanceDispose;
        return instance;
      });
    });
    const runtime = await createRiggedRuntime();

    await runtime.dispose();
    await runtime.dispose();

    expect(instanceDispose).toHaveBeenCalledTimes(1);
  });

  it("sanitizes rigged Visual cleanup failures after attempting every sibling", async () => {
    const basePlan = createRiggedExecutionPlan();
    const baseSubject = basePlan.subjects[0]!;
    const executionPlan: ExecutionPlanV4 = {
      ...basePlan,
      subjects: [
        {
          ...baseSubject,
          visualParts: [
            ...baseSubject.visualParts,
            {
              id: "cleanup-marker",
              kind: "primitive" as const,
              shape: { kind: "sphere" as const, radiusMeters: 0.08 },
              localTransform: {
                positionMetersXYZ: [0, 2, 0] as const,
                rotationEulerRadiansXYZ: [0, 0, 0] as const,
              },
              semanticTags: ["cleanup-marker"],
            },
          ],
          sockets: [
            ...baseSubject.sockets,
            {
              id: "focus.local",
              kind: "local" as const,
              localTransform: {
                positionMetersXYZ: [0, 1.5, 0] as const,
                rotationEulerRadiansXYZ: [0, 0, 0] as const,
              },
              semanticTags: ["focus"],
            },
          ],
        },
      ],
    };
    const runtime = await createRiggedRuntime(executionPlan);
    const visual = createRiggedRuntimeProbe(runtime).visual("player");
    const boneSocket = visual.socketNodesById.get("hand.right")!;
    const localSocket = visual.socketNodesById.get("focus.local")!;
    const instance = visual.assetInstance!;
    const lease = visual.assetLease!;
    const primitiveMesh = visual.primitiveMeshes![0]!;
    const assetPartRoot = visual.assetPartRoots![0]!;
    const secret = "BABYLON_PROVIDER_PRIVATE_VISUAL_DISPOSE_FAILURE";

    const nativeBoneDetach = boneSocket.detachFromBone.bind(boneSocket);
    const boneDetach = vi.spyOn(boneSocket, "detachFromBone").mockImplementation(() => {
      nativeBoneDetach();
      throw new Error(secret);
    });
    const nativeBoneDispose = boneSocket.dispose.bind(boneSocket);
    const boneDispose = vi
      .spyOn(boneSocket, "dispose")
      .mockImplementation((...args) => nativeBoneDispose(...args));
    const localDetach = vi.spyOn(localSocket, "detachFromBone");
    const nativeLocalDispose = localSocket.dispose.bind(localSocket);
    const localDispose = vi
      .spyOn(localSocket, "dispose")
      .mockImplementation((...args) => {
        nativeLocalDispose(...args);
        throw new Error(secret);
      });
    const nativePrimitiveDispose = primitiveMesh.dispose.bind(primitiveMesh);
    const primitiveDispose = vi
      .spyOn(primitiveMesh, "dispose")
      .mockImplementation((...args) => nativePrimitiveDispose(...args));
    const nativeInstanceDispose = instance.dispose.bind(instance);
    const instanceDispose = vi.spyOn(instance, "dispose").mockImplementation(() => {
      nativeInstanceDispose();
      throw new Error(secret);
    });
    const nativePartRootDispose = assetPartRoot.dispose.bind(assetPartRoot);
    const partRootDispose = vi
      .spyOn(assetPartRoot, "dispose")
      .mockImplementation((...args) => nativePartRootDispose(...args));
    const nativeRootDispose = visual.root.dispose.bind(visual.root);
    const rootDispose = vi
      .spyOn(visual.root, "dispose")
      .mockImplementation((...args) => nativeRootDispose(...args));
    const nativeLeaseRelease = lease.release.bind(lease);
    const leaseRelease = vi
      .spyOn(lease, "release")
      .mockImplementation(() => nativeLeaseRelease());

    const error = (() => {
      try {
        visual.dispose();
      } catch (reason) {
        return reason as unknown;
      }
    })();
    visual.dispose();

    expect(isSubjectAssetRuntimeErrorV1(error)).toBe(true);
    expect(error).toMatchObject({
      code: "SUBJECT_ASSET_DISPOSE_FAILED",
      subjectAssetRef: goldenSubjectAssetDescriptor.subjectAssetRef,
      artifactContentHash: goldenSubjectAssetDescriptor.artifactContentHash,
    });
    expect(error).not.toHaveProperty("cause");
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toMatch(/babylon|provider/i);
    expect(boneDetach).toHaveBeenCalledTimes(1);
    expect(boneDispose).toHaveBeenCalledTimes(1);
    expect(localDetach).toHaveBeenCalledTimes(1);
    expect(localDispose).toHaveBeenCalledTimes(1);
    expect(primitiveDispose).toHaveBeenCalledTimes(1);
    expect(instanceDispose).toHaveBeenCalledTimes(1);
    expect(partRootDispose).toHaveBeenCalledTimes(1);
    expect(rootDispose).toHaveBeenCalledTimes(1);
    expect(leaseRelease).toHaveBeenCalledTimes(1);

    boneDetach.mockRestore();
    boneDispose.mockRestore();
    localDetach.mockRestore();
    localDispose.mockRestore();
    primitiveDispose.mockRestore();
    instanceDispose.mockRestore();
    partRootDispose.mockRestore();
    rootDispose.mockRestore();
    leaseRelease.mockRestore();
    await runtime.dispose();
  });

  it("continues every Runtime cleanup after an aggregate disposal failure", async () => {
    const runtime = await createRuntime();
    const internals = runtime as unknown as {
      aggregates: Array<{ dispose(): void }>;
      ownedHeightfieldShape: { dispose(): void };
      scene: Scene;
      engine: NullEngine;
    };
    expect(internals.aggregates.length).toBeGreaterThan(1);
    const secret = "HAVOK_PROVIDER_PRIVATE_DISPOSE_FAILURE";
    const aggregateDisposals = internals.aggregates.map((aggregate, index) => {
      const nativeDispose = aggregate.dispose.bind(aggregate);
      return vi.spyOn(aggregate, "dispose").mockImplementation(() => {
        nativeDispose();
        if (index === internals.aggregates.length - 1) throw new Error(secret);
      });
    });
    const nativeHeightfieldDispose =
      internals.ownedHeightfieldShape.dispose.bind(internals.ownedHeightfieldShape);
    const heightfieldDisposal = vi
      .spyOn(internals.ownedHeightfieldShape, "dispose")
      .mockImplementation(() => nativeHeightfieldDispose());
    const nativeSceneDispose = internals.scene.dispose.bind(internals.scene);
    const sceneDisposal = vi
      .spyOn(internals.scene, "dispose")
      .mockImplementation(() => nativeSceneDispose());
    const nativeEngineDispose = internals.engine.dispose.bind(internals.engine);
    const engineDisposal = vi
      .spyOn(internals.engine, "dispose")
      .mockImplementation(() => nativeEngineDispose());
    const error = await runtime.dispose().catch((reason) => reason as unknown);
    await runtime.dispose();

    expect(error).toMatchObject({ code: "WORLDKIT_RUNTIME_DISPOSE_FAILED" });
    expect(error).not.toHaveProperty("cause");
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toMatch(/havok|provider/i);
    for (const disposal of aggregateDisposals) {
      expect(disposal).toHaveBeenCalledTimes(1);
      disposal.mockRestore();
    }
    expect(heightfieldDisposal).toHaveBeenCalledTimes(1);
    expect(sceneDisposal).toHaveBeenCalledTimes(1);
    expect(engineDisposal).toHaveBeenCalledTimes(1);
    heightfieldDisposal.mockRestore();
    sceneDisposal.mockRestore();
    engineDisposal.mockRestore();
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

  it("idles the previous rigged Subject in the committed rebind snapshot", async () => {
    const runtime = await createRiggedRuntime(
      createTwoRiggedSubjectExecutionPlan(),
    );
    const running = await runtime.runFixedInput({
      actions: ["move-right", "run"],
      ticks: 2,
    });
    expect(running.subjectStatesByEntityId.player?.activeActionId).toBe("run");

    expect(
      runtime.bindControl({
        controllerId: "controller-primary",
        expectedControlledEntityId: "player",
        controlledEntityId: "hero-b",
      }),
    ).toMatchObject({ status: "committed", controlledEntityId: "hero-b" });
    const immediate = runtime.snapshot();
    const zeroTick = await runtime.runFixedInput({ actions: [], ticks: 0 });

    expect(immediate.subjectStatesByEntityId.player?.activeActionId).toBe("idle");
    expect(zeroTick.subjectStatesByEntityId.player?.activeActionId).toBe("idle");
    expect(immediate.tick).toBe(running.tick);
    expect(zeroTick.tick).toBe(running.tick);
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
      wallNode.placement = {
        kind: "fixed",
        transform: { positionMetersXYZ: [0, 2, 25] },
      };
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

describe("SubjectAnimationPlayer", () => {
  it("samples non-zero Clip ranges and blends from fixed Ticks", () => {
    const { engine, scene } = createAssetScene();
    const idle = createClipGroup(scene, "idle", {
      from: 10,
      to: 70,
      framesPerSecond: 30,
    });
    const walk = createClipGroup(scene, "walk", {
      from: 5,
      to: 45,
      framesPerSecond: 20,
    });
    const run = createClipGroup(scene, "run");
    const jump = createClipGroup(scene, "jump", {
      from: 7,
      to: 27,
      framesPerSecond: 10,
    });
    const player = new SubjectAnimationPlayer({
      animationGroups: [idle, walk, run, jump],
      animationSet: createAnimationSet(),
      subjectAssetRef: goldenSubjectAssetDescriptor.subjectAssetRef,
      artifactContentHash: goldenSubjectAssetDescriptor.artifactContentHash,
    });

    expect(animationFrame(idle)).toBe(10);
    player.step(60, "idle");
    expect(animationFrame(idle)).toBe(40);

    player.step(60, "walk");
    expect(animationFrame(walk)).toBe(5);
    expect(animationWeight(idle)).toBe(1);
    expect(animationWeight(walk)).toBe(0);
    player.step(75, "walk");
    expect(animationFrame(walk)).toBeCloseTo(12.5, 8);
    expect(animationWeight(idle)).toBeCloseTo(0.5, 8);
    expect(animationWeight(walk)).toBeCloseTo(0.5, 8);
    player.step(90, "walk");
    expect(animationFrame(walk)).toBe(20);
    expect(animationWeight(walk)).toBe(1);
    expect(idle.isStarted).toBe(false);

    player.step(90, "jump");
    expect(animationFrame(jump)).toBe(7);
    player.step(150, "jump");
    expect(animationFrame(jump)).toBe(27);

    player.reset();
    expect(player.activeActionId).toBe("idle");
    expect(animationFrame(idle)).toBe(10);
    expect(animationWeight(idle)).toBe(1);
    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("keeps at most two groups started when an Action interrupts a blend", () => {
    const { engine, scene } = createAssetScene();
    const groups = ["idle", "walk", "run", "jump"].map((name) =>
      createClipGroup(scene, name),
    );
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet: createAnimationSet(),
      subjectAssetRef: goldenSubjectAssetDescriptor.subjectAssetRef,
      artifactContentHash: goldenSubjectAssetDescriptor.artifactContentHash,
    });

    player.step(1, "walk");
    player.step(2, "run");
    player.step(3, "jump");

    expect(groups.filter((group) => group.isStarted)).toHaveLength(1);
    expect(player.activeActionId).toBe("jump");
    player.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("sanitizes AnimationGroup stop failure after stopping every mapped Clip", () => {
    const { engine, scene } = createAssetScene();
    const groups = ["idle", "walk", "run", "jump"].map((name) =>
      createClipGroup(scene, name),
    );
    const player = new SubjectAnimationPlayer({
      animationGroups: groups,
      animationSet: createAnimationSet(),
      subjectAssetRef: goldenSubjectAssetDescriptor.subjectAssetRef,
      artifactContentHash: goldenSubjectAssetDescriptor.artifactContentHash,
    });
    const secret = "BABYLON_PROVIDER_PRIVATE_ANIMATION_STOP_FAILURE";
    const stopSpies = groups.map((group, index) => {
      const nativeStop = group.stop.bind(group);
      return vi.spyOn(group, "stop").mockImplementation(() => {
        const stoppedGroup = nativeStop();
        if (index === 0) throw new Error(secret);
        return stoppedGroup;
      });
    });

    const error = (() => {
      try {
        player.dispose();
      } catch (reason) {
        return reason as unknown;
      }
    })();
    player.dispose();

    expect(isSubjectAssetRuntimeErrorV1(error)).toBe(true);
    expect(error).toMatchObject({
      code: "SUBJECT_ASSET_DISPOSE_FAILED",
      subjectAssetRef: goldenSubjectAssetDescriptor.subjectAssetRef,
      artifactContentHash: goldenSubjectAssetDescriptor.artifactContentHash,
    });
    expect(error).not.toHaveProperty("cause");
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toMatch(/babylon|provider/i);
    for (const stop of stopSpies) {
      expect(stop).toHaveBeenCalledTimes(1);
      stop.mockRestore();
    }
    scene.dispose();
    engine.dispose();
  });

  it("rejects missing, duplicate, empty, and mixed-FPS mapped Clips", () => {
    for (const invalidGroups of [
      (scene: Scene) => [
        createClipGroup(scene, "idle"),
        createClipGroup(scene, "walk"),
        createClipGroup(scene, "run"),
      ],
      (scene: Scene) => [
        createClipGroup(scene, "idle"),
        createClipGroup(scene, "walk"),
        createClipGroup(scene, "run"),
        createClipGroup(scene, "jump"),
        createClipGroup(scene, "jump"),
      ],
      (scene: Scene) => [
        new AnimationGroup("idle", scene),
        createClipGroup(scene, "walk"),
        createClipGroup(scene, "run"),
        createClipGroup(scene, "jump"),
      ],
      (scene: Scene) => [
        createClipGroup(scene, "idle", {
          framesPerSecond: 30,
          secondFramesPerSecond: 60,
        }),
        createClipGroup(scene, "walk"),
        createClipGroup(scene, "run"),
        createClipGroup(scene, "jump"),
      ],
    ]) {
      const { engine, scene } = createAssetScene();
      const error = (() => {
        try {
          return new SubjectAnimationPlayer({
            animationGroups: invalidGroups(scene),
            animationSet: createAnimationSet(),
            subjectAssetRef: goldenSubjectAssetDescriptor.subjectAssetRef,
            artifactContentHash: goldenSubjectAssetDescriptor.artifactContentHash,
          });
        } catch (reason) {
          return reason;
        }
      })();

      expect(isSubjectAssetRuntimeErrorV1(error)).toBe(true);
      expect(error).toMatchObject({
        code: "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE",
      });
      scene.dispose();
      engine.dispose();
    }
  });

  it("rejects non-finite or empty frame ranges and non-positive Clip FPS", () => {
    const invalidIdleGroups = [
      (scene: Scene) => {
        const group = createClipGroup(scene, "idle");
        Object.defineProperty(group, "from", { value: Number.NaN });
        return group;
      },
      (scene: Scene) => createClipGroup(scene, "idle", { from: 10, to: 10 }),
      (scene: Scene) => createClipGroup(scene, "idle", { framesPerSecond: 0 }),
    ];
    for (const invalidIdleGroup of invalidIdleGroups) {
      const { engine, scene } = createAssetScene();
      const error = (() => {
        try {
          return new SubjectAnimationPlayer({
            animationGroups: [
              invalidIdleGroup(scene),
              createClipGroup(scene, "walk"),
              createClipGroup(scene, "run"),
              createClipGroup(scene, "jump"),
            ],
            animationSet: createAnimationSet(),
            subjectAssetRef: goldenSubjectAssetDescriptor.subjectAssetRef,
            artifactContentHash: goldenSubjectAssetDescriptor.artifactContentHash,
          });
        } catch (reason) {
          return reason;
        }
      })();

      expect(isSubjectAssetRuntimeErrorV1(error)).toBe(true);
      expect(error).toMatchObject({
        code: "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE",
      });
      scene.dispose();
      engine.dispose();
    }
  });

  it("rejects non-positive playback and negative or non-finite blend values", () => {
    for (const invalidBinding of [
      { playbackSpeedRatio: 0 },
      { playbackSpeedRatio: Number.NaN },
      { blendDurationSeconds: -0.01 },
      { blendDurationSeconds: Number.POSITIVE_INFINITY },
    ]) {
      const { engine, scene } = createAssetScene();
      const groups = ["idle", "walk", "run", "jump"].map((name) =>
        createClipGroup(scene, name),
      );
      const animationSet = createAnimationSet();
      animationSet.animationBindings = animationSet.animationBindings.map((binding) =>
        binding.actionId === "walk" ? { ...binding, ...invalidBinding } : binding,
      );
      const error = (() => {
        try {
          return new SubjectAnimationPlayer({
            animationGroups: groups,
            animationSet,
            subjectAssetRef: goldenSubjectAssetDescriptor.subjectAssetRef,
            artifactContentHash: goldenSubjectAssetDescriptor.artifactContentHash,
          });
        } catch (reason) {
          return reason;
        }
      })();

      expect(isSubjectAssetRuntimeErrorV1(error)).toBe(true);
      expect(error).toMatchObject({
        code: "SUBJECT_ASSET_ANIMATION_INCOMPATIBLE",
      });
      scene.dispose();
      engine.dispose();
    }
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

  it("maps an unknown post-Parse inspection failure and evicts it for retry", async () => {
    const { engine, scene } = createAssetScene();
    const secret = "BABYLON_PRIVATE_INSPECTION_FAILURE";
    let rejectedContainerDisposeCalls = 0;
    let rejectedContainerDisposeSpy: ReturnType<typeof vi.spyOn> | undefined;
    let rejectedContainerInspectionSpy: ReturnType<typeof vi.spyOn> | undefined;
    mutateNextLoadedContainer((container) => {
      rejectedContainerInspectionSpy = vi
        .spyOn(container, "getNodes")
        .mockImplementation(() => {
          throw new Error(secret);
        });
      const nativeDispose = container.dispose.bind(container);
      rejectedContainerDisposeSpy = vi
        .spyOn(container, "dispose")
        .mockImplementation(() => {
          rejectedContainerDisposeCalls += 1;
          nativeDispose();
        });
    });
    let resolverCalls = 0;
    const cache = new SubjectAssetCacheV1(scene, {
      async resolveSubjectAsset() {
        resolverCalls += 1;
        return { bytes: goldenSubjectAssetBytes, sourceLabel: "memory" };
      },
    });

    const primaryError = await cache
      .acquire(goldenSubjectAssetDescriptor)
      .catch((error) => error as unknown);

    expect(isSubjectAssetRuntimeErrorV1(primaryError)).toBe(true);
    expect(primaryError).toMatchObject({
      code: "SUBJECT_ASSET_FORMAT_UNSUPPORTED",
      subjectAssetRef: goldenSubjectAssetDescriptor.subjectAssetRef,
      artifactContentHash: goldenSubjectAssetDescriptor.artifactContentHash,
    });
    expect(primaryError).not.toHaveProperty("cause");
    expect(String(primaryError)).not.toContain(secret);
    expect(String(primaryError)).not.toMatch(/babylon|provider/i);
    expect(rejectedContainerDisposeCalls).toBe(1);

    const retryLease = await cache.acquire(goldenSubjectAssetDescriptor);
    expect(resolverCalls).toBe(2);
    retryLease.release();
    await cache.dispose();
    expect(rejectedContainerDisposeCalls).toBe(1);

    rejectedContainerInspectionSpy?.mockRestore();
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
    expect(disposalError).toMatchObject({ code: "SUBJECT_ASSET_DISPOSE_FAILED" });
    expect(disposalError).not.toHaveProperty("cause");
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
