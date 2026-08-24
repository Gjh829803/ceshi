import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { AssetContainer } from "@babylonjs/core/assetContainer.js";
import { Animation } from "@babylonjs/core/Animations/animation.js";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { sha256Bytes, sha256CanonicalJson } from "@whitebox-world/protocol";
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
  normalizeAuthoringSpecV4,
  type AuthoringSpecV3,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { compileWorld, compileWorldV5 } from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import { createGameplayBootstrapResourceLockEntryV1 } from "@whitebox-world/gameplay-contracts";
import {
  createValidAuthoringSpec,
  createValidPackageSubjectWorld,
  createValidRiggedPackageSubjectWorld,
} from "../../authoring/src/test-fixture";
import type {
  ExecutionAnimationSetV1,
  ExecutionObjectV3,
  ExecutionPlanV4,
  ExecutionPlanV5,
  ExecutionSubjectAssetV1,
  FixedInputV1,
  Vec3,
} from "@whitebox-world/runtime-contracts";
import { emitTransformedStaticColliderTriangleMeshV1 } from "@whitebox-world/terrain-surface";
import { parseGameplayWorldStateProjectionV1 } from "@whitebox-world/runtime-host";
import { isNil } from "lodash-es";

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
import { lockPublishedGroundFeels } from "./lock-published-ground-feels";
import { BABYLON_GAMEPLAY_RUNTIME_INTERNAL } from "./gameplay-runtime-internal";
import { SubjectAnimationPlayer } from "./subject-animation-player";
import { createSubjectVisual } from "./subject-visual";
import { sampleExecutionTerrainHeight } from "./terrain";

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

describe("Babylon terrain surface", () => {
  it("samples the canonical rendered triangle across an asymmetric saddle cell", () => {
    const terrain = {
      ...createFlatRiggedExecutionPlan().terrain,
      centerMetersXZ: [0, 0] as const,
      sizeMetersXZ: [2, 2] as const,
      resolutionCellsXZ: [2, 2] as const,
      heightSamplesMeters: [0, 2, 4, 0],
    };

    expect(sampleExecutionTerrainHeight(terrain, 0, 0)).toBe(3);
  });
});

const gBotAuthoringSpec = JSON.parse(
  await readFile(
    new URL(
      "../../../examples/authoring/g-bot-subject-world.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as AuthoringSpecV4;

describe("Babylon runtime fixture compilation", () => {
  it("keeps the real G Bot authored heightfield non-flat", () => {
    const executionPlan = compileRouteExecutionPlan(structuredClone(gBotAuthoringSpec));
    const uniqueHeights = new Set(executionPlan.terrain.heightSamplesMeters);

    expect(uniqueHeights.size).toBeGreaterThan(1);
    expect(sampleExecutionTerrainHeight(executionPlan.terrain, -2, 18)).toBeCloseTo(
      0.4327890520288841,
      12,
    );
  });
});

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

function buildStaticTriangleGlb(): Uint8Array {
  const positions = [
    -0.5, 0, 0,
    0.5, 0, 0,
    0, 1, 0,
  ] as const;
  const normals = [
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ] as const;
  const binary = new Uint8Array(80);
  const binaryView = new DataView(binary.buffer);
  for (let index = 0; index < positions.length; index += 1) {
    binaryView.setFloat32(index * 4, positions[index]!, true);
  }
  for (let index = 0; index < normals.length; index += 1) {
    binaryView.setFloat32(36 + index * 4, normals[index]!, true);
  }
  for (let index = 0; index < 3; index += 1) {
    binaryView.setUint16(72 + index * 2, index, true);
  }

  const gltf = {
    asset: { version: "2.0", generator: "worldkit-runtime-static-test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "static-triangle", mesh: 0 }],
    meshes: [{
      name: "static-triangle",
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0,
        mode: 4,
      }],
    }],
    materials: [{
      name: "fixture-whitebox",
      pbrMetallicRoughness: {
        baseColorFactor: [0.4, 0.6, 0.8, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 72, byteLength: 6, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [-0.5, 0, 0],
        max: [0.5, 1, 0],
      },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" },
    ],
  };
  const encodedJson = new TextEncoder().encode(JSON.stringify(gltf));
  const paddedJsonLength = Math.ceil(encodedJson.byteLength / 4) * 4;
  const json = new Uint8Array(paddedJsonLength);
  json.fill(0x20);
  json.set(encodedJson);
  const totalLength = 12 + 8 + json.byteLength + 8 + binary.byteLength;
  const glb = new Uint8Array(totalLength);
  const glbView = new DataView(glb.buffer);
  glbView.setUint32(0, 0x46546c67, true);
  glbView.setUint32(4, 2, true);
  glbView.setUint32(8, totalLength, true);
  glbView.setUint32(12, json.byteLength, true);
  glbView.setUint32(16, 0x4e4f534a, true);
  glb.set(json, 20);
  const binaryHeaderOffset = 20 + json.byteLength;
  glbView.setUint32(binaryHeaderOffset, binary.byteLength, true);
  glbView.setUint32(binaryHeaderOffset + 4, 0x004e4942, true);
  glb.set(binary, binaryHeaderOffset + 8);
  return glb;
}

const staticSubjectAssetBytes = buildStaticTriangleGlb();

const staticSubjectAssetDescriptor = {
  subjectAssetRef: "worldkit://subject-asset/static.runtime-test@1",
  artifactContentHash: sha256Bytes(staticSubjectAssetBytes),
  byteLength: staticSubjectAssetBytes.byteLength,
  mediaType: "model/gltf-binary",
  format: "glb",
  inventory: {
    meshCount: 1,
    vertexCount: 3,
    triangleCount: 1,
    skeletonCount: 0,
    boneCount: 0,
    animationClipNames: [],
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
  visualRootYawRadians(subjectEntityId: string): number;
}

interface SubjectVisualInternals extends SubjectVisual {
  assetInstance?: SubjectAssetInstanceV1;
  assetLease?: SubjectAssetLeaseV1;
  primitiveMeshes?: readonly TransformNode[];
  assetPartRoots?: readonly TransformNode[];
}

interface SubjectVisualProbe {
  visual(subjectEntityId: string): SubjectVisualInternals;
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
    rotation: CartesianVector;
    rotationQuaternion?: { toEulerAngles(): CartesianVector } | null;
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
    visualRootYawRadians: (subjectEntityId) => {
      const visualRoot = controllerFor(subjectEntityId).visualRoot;
      return visualRoot.rotationQuaternion?.toEulerAngles().y ?? visualRoot.rotation.y;
    },
  };
}

function createSubjectVisualProbe(runtime: BabylonWorldRuntime): SubjectVisualProbe {
  const internals = runtime as unknown as {
    subjectVisuals: readonly SubjectVisualInternals[];
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

function compileRouteExecutionPlan(spec: AuthoringSpecV4): ExecutionPlanV5 {
  const normalized = normalizeAuthoringSpecV4(spec);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error(`Fixture normalize failed: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const entityDescriptors = normalized.value.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalized.value?.resources.subjectDefinitions.find(
        (candidate) => candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      if (isNil(definition)) {
        throw new Error(`Fixture Subject Definition missing: ${node.subjectDefinitionRef}`);
      }
      return {
        id: node.id,
        entityDefinitionRef: node.subjectDefinitionRef,
        capabilityRefs: definition.capabilityRefs,
      };
    });
  const gameplayBootstrap = createCoreGameplayBootstrapV1({
    worldId: normalized.value.id,
    worldSeed: normalized.value.seed,
    entityDescriptors,
  });
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrapResourceLock:
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
  });
  if (!compiled.ok || compiled.executionPlan === undefined) {
    throw new Error(`Fixture compile failed: ${JSON.stringify(compiled.diagnostics)}`);
  }
  return compiled.executionPlan;
}

function compileFlatTerrainExecutionPlan(spec: AuthoringSpecV3): ExecutionPlanV4 {
  const flatTerrainSpec = structuredClone(spec);
  flatTerrainSpec.nodes = flatTerrainSpec.nodes.map((node) =>
    node.kind === "terrain" &&
      node.components.terrain.source.kind === "procedural"
      ? {
          ...node,
          components: {
            terrain: {
              ...node.components.terrain,
              source: {
                ...node.components.terrain.source,
                relief: "flat" as const,
                baseHeightMeters: 0,
                amplitudeMeters: 0,
              },
            },
          },
        }
      : node,
  );
  return compileExecutionPlan(flatTerrainSpec);
}

function createFlatPackageExecutionPlan(
  mutator?: (spec: AuthoringSpecV3) => void,
): ExecutionPlanV4 {
  const spec = createValidPackageSubjectWorld();
  mutator?.(spec);
  return compileFlatTerrainExecutionPlan(spec);
}

async function createRuntime(
  executionPlan: ExecutionPlanV4 | ExecutionPlanV5,
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

async function createFlatPackageRuntime(): Promise<BabylonWorldRuntime> {
  return createRuntime(createFlatPackageExecutionPlan());
}

function createColliderSupportExecutionPlan(options: {
  pedestalPrimitive: ExecutionObjectV3["primitive"];
  crateBottomMeters: number;
  maximumSupportGapMeters: number;
}): ExecutionPlanV4 {
  const base = createFlatPackageExecutionPlan();
  const placementProvenance =
    base.layout.placementsByEntityId["wall-east"]!.placementProvenance;
  const pedestalTransform = {
    positionMetersXYZ: [0, 2, 0] as const,
    rotationEulerRadiansXYZ: [0, 0, 0.3] as const,
    scaleXYZ: [1, 1, 1] as const,
  };
  const crateTransform = {
    positionMetersXYZ: [0, options.crateBottomMeters + 0.25, 0] as const,
    rotationEulerRadiansXYZ: [0, 0, 0] as const,
    scaleXYZ: [1, 1, 1] as const,
  };
  return {
    ...base,
    objects: [
      ...base.objects,
      {
        entityId: "pedestal",
        prototypeId: "pedestal-prototype",
        primitive: options.pedestalPrimitive,
        transform: pedestalTransform,
        collisionEnabled: false,
        semanticClassId: "obstacle.pedestal",
      },
      {
        entityId: "crate",
        prototypeId: "crate-prototype",
        primitive: { kind: "box", sizeMetersXYZ: [0.5, 0.5, 0.5] },
        transform: crateTransform,
        collisionEnabled: false,
        semanticClassId: "prop.crate",
      },
    ],
    layout: {
      ...base.layout,
      placementsByEntityId: {
        ...base.layout.placementsByEntityId,
        pedestal: { entityId: "pedestal", transform: pedestalTransform, placementProvenance },
        crate: { entityId: "crate", transform: crateTransform, placementProvenance },
      },
      layoutAssertions: [
        ...base.layout.layoutAssertions,
        {
          constraintId: "crate-on-pedestal",
          kind: "supported-by",
          supportedEntityId: "crate",
          supportingEntityId: "pedestal",
          maximumSupportGapMeters: options.maximumSupportGapMeters,
          minimumSupportRatio: 1,
          evidenceEntityIds: ["crate", "pedestal"],
          measurements: {},
          tolerances: {},
        },
      ],
    },
  };
}

function createV5StaticColliderSupportExecutionPlan(): ExecutionPlanV5 {
  const v4 = createFlatPackageExecutionPlan();
  const {
    controlledEntityId: initialControlledEntityId,
    ...v4WithoutControlledEntityId
  } = v4;
  const resourceLockEntries = [
    {
      resourceRef: "package://gameplay/bootstrap@1",
      resourceKind: "gameplay-bootstrap" as const,
      resolvedVersion: "1",
      contentHash: `sha256:${"e".repeat(64)}` as const,
    },
    {
      resourceRef: "worldkit://subject-definition/runtime-test@1",
      resourceKind: "subject-definition" as const,
      resolvedVersion: "1",
      contentHash: `sha256:${"d".repeat(64)}` as const,
    },
  ];
  const base: ExecutionPlanV5 = {
    ...v4WithoutControlledEntityId,
    schemaVersion: 5,
    initialControlledEntityId,
    authoringSpecHash: `sha256:${"b".repeat(64)}`,
    resourceLockEntries,
    resourceLockHash: sha256CanonicalJson(resourceLockEntries),
    traversal: {
      traversalAreas: [],
      surfaces: [{
        kind: "heightfield",
        traversalSurfaceId: "surface:terrain-main:heightfield",
        surfaceEntityId: v4.terrain.entityId,
        colliderSubshapeId: "collider:terrain-main:heightfield",
        resourceRef: "worldkit://terrain-surface/terrain-main@1",
        resolvedVersion: "1",
        resourceHash: `sha256:${"c".repeat(64)}`,
      }],
      connectivityRequirements: [],
      anchorEntityIds: [],
    },
    staticColliders: [],
  };
  const placementProvenance =
    base.layout.placementsByEntityId["spawn-main"]!.placementProvenance;
  const pedestalTransform = {
    positionMetersXYZ: [10, 1, 10] as const,
    rotationEulerRadiansXYZ: [0, 0, 0] as const,
    scaleXYZ: [1, 1, 1] as const,
  };
  const crateTransform = {
    positionMetersXYZ: [10, 2.25, 10] as const,
    rotationEulerRadiansXYZ: [0, 0, 0] as const,
    scaleXYZ: [1, 1, 1] as const,
  };
  return {
    ...base,
    objects: [
      ...base.objects,
      {
        entityId: "pedestal",
        prototypeId: "pedestal-prototype",
        primitive: { kind: "cone", radiusMeters: 2, heightMeters: 2 },
        transform: pedestalTransform,
        collisionEnabled: false,
        semanticClassId: "obstacle.pedestal",
      },
      {
        entityId: "crate",
        prototypeId: "crate-prototype",
        primitive: { kind: "box", sizeMetersXYZ: [1, 0.5, 1] },
        transform: crateTransform,
        collisionEnabled: false,
        semanticClassId: "prop.crate",
      },
    ],
    staticColliders: [
      ...base.staticColliders,
      {
        entityId: "pedestal",
        logicalSubshapeId: "primary",
        colliderSubshapeId: "collider:pedestal:primary",
        colliderHash: `sha256:${"a".repeat(64)}`,
        transform: pedestalTransform,
        shape: { kind: "cylinder", radiusMeters: 2, heightMeters: 2 },
      },
    ],
    layout: {
      ...base.layout,
      placementsByEntityId: {
        ...base.layout.placementsByEntityId,
        pedestal: {
          entityId: "pedestal",
          transform: pedestalTransform,
          placementProvenance,
        },
        crate: {
          entityId: "crate",
          transform: crateTransform,
          placementProvenance,
        },
      },
      layoutAssertions: [{
        constraintId: "crate-on-static-pedestal",
        kind: "supported-by",
        supportedEntityId: "crate",
        supportingEntityId: "pedestal",
        maximumSupportGapMeters: 0.01,
        minimumSupportRatio: 1,
        evidenceEntityIds: ["crate", "pedestal"],
        measurements: {},
        tolerances: {},
      }],
    },
  };
}

function createV5StaticColliderGeometryConformancePlan(): ExecutionPlanV5 {
  const plan = createV5StaticColliderSupportExecutionPlan();
  return {
    ...plan,
    staticColliders: [{
      entityId: "geometry-conformance-box",
      logicalSubshapeId: "primary",
      colliderSubshapeId: "collider:geometry-conformance-box:primary",
      colliderHash: `sha256:${"e".repeat(64)}`,
      transform: {
        positionMetersXYZ: [1, 2, 0.5],
        rotationEulerRadiansXYZ: [
          Math.PI / 2,
          Math.PI / 2,
          Math.PI / 2,
        ],
        scaleXYZ: [2, 3, 4],
      },
      shape: { kind: "box", sizeMetersXYZ: [2, 2, 2] },
    }],
    layout: {
      ...plan.layout,
      layoutAssertions: [],
    },
  };
}

function createFlatRiggedExecutionPlan(): ExecutionPlanV4 {
  return compileFlatTerrainExecutionPlan(createValidRiggedPackageSubjectWorld());
}

const staticAssetPartLocalTransform = {
  positionMetersXYZ: [1, 2, -3] as const,
  rotationEulerRadiansXYZ: [0, Math.PI / 3, 0] as const,
  scaleXYZ: [2, 3, 4] as const,
};

function createStaticAssetSubjectExecutionPlan(options: {
  twoSubjects?: boolean;
} = {}): ExecutionPlanV4 {
  const base = createFlatRiggedExecutionPlan();
  const baseSubject = base.subjects[0]!;
  const assetPart = baseSubject.visualParts.find((part) => part.kind === "asset");
  if (assetPart === undefined) throw new Error("Rigged fixture Asset Part missing.");
  const staticSubject = {
    ...baseSubject,
    visualParts: [{
      ...assetPart,
      subjectAssetRef: staticSubjectAssetDescriptor.subjectAssetRef,
      localTransform: staticAssetPartLocalTransform,
      semanticTags: ["body", "static", "runtime-test"],
    }],
    visualBinding: { mode: "static" as const },
    sockets: [{
      id: "focus.local",
      kind: "local" as const,
      localTransform: {
        positionMetersXYZ: [0, 1.5, 0] as const,
        rotationEulerRadiansXYZ: [0, 0, 0] as const,
      },
      semanticTags: ["focus"],
    }],
  };
  return {
    ...base,
    subjects: options.twoSubjects
      ? [
          staticSubject,
          {
            ...staticSubject,
            entityId: "static-secondary",
            spawnAnchorEntityId: "spawn-static-secondary",
            spawnSubjectOriginPositionMetersXYZ: [4, 0, 30],
          },
        ]
      : [staticSubject],
    subjectAssets: [structuredClone(staticSubjectAssetDescriptor)],
    rigProfiles: [],
    animationSets: [],
  };
}

function createTwoRiggedSubjectExecutionPlan(): ExecutionPlanV4 {
  const executionPlan = createFlatRiggedExecutionPlan();
  const player = executionPlan.subjects[0]!;
  return lockPublishedGroundFeels({
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
  });
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
  executionPlan = createFlatRiggedExecutionPlan(),
): Promise<BabylonWorldRuntime> {
  return createRuntime(executionPlan, {
    subjectAssetResolver: createMemoryResolver(goldenSubjectAssetBytes),
  });
}

async function movementResult(
  executionPlan: ExecutionPlanV4,
  actions: FixedInputV1["actions"],
): Promise<{ deltaXMeters: number; movementMedium: "ground" | "air" }> {
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
  const executionPlan = createFlatPackageExecutionPlan();
  const runtime = await createRuntime(executionPlan);
  return { runtime, executionPlan, debug: createRuntimeDebugProbe(runtime) };
}

describe("BabylonWorldRuntime", () => {
  it("keeps Simulation Tick and Render Frame authority separate with reset-safe receipts", async () => {
    const runtime = await createFlatPackageRuntime();
    try {
      expect(runtime.getControlCaptureCapabilities()).toMatchObject({
        kind: "worldkit-control-capture-capabilities",
        schemaVersion: 1,
        captureProfileRef: "worldkit://capture/profile/control-video@1",
        captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1",
        requiredPassIds: [
          "neutral-color",
          "linear-depth-meters",
          "semantic-class-id",
          "instance-id",
          "world-normal",
        ],
        available: false,
      });
      expect(() => runtime.waitForRenderReady(0)).toThrow("CONTROL_CAPTURE_RENDER_READY_REQUIRED");

      const firstReceipt = runtime.renderFrame();
      expect(firstReceipt).toMatchObject({
        kind: "worldkit-render-ready-receipt",
        schemaVersion: 1,
        simulationTick: 0,
        renderFrameIndex: 0,
      });
      expect(runtime.waitForRenderReady(0)).toEqual(firstReceipt);

      await runtime.runFixedInput({ actions: [], ticks: 2 });
      expect(() => runtime.waitForRenderReady(2)).toThrow("CONTROL_CAPTURE_RENDER_READY_REQUIRED");
      const secondReceipt = runtime.renderFrame();
      expect(secondReceipt).toMatchObject({ simulationTick: 2, renderFrameIndex: 1 });
      expect(runtime.waitForRenderReady(2)).toEqual(secondReceipt);

      runtime.reset();
      expect(() => runtime.waitForRenderReady(0)).toThrow("CONTROL_CAPTURE_RENDER_READY_REQUIRED");
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects control capture without an exact ready receipt or required GPU capabilities", async () => {
    const runtime = await createFlatPackageRuntime();
    const request = {
      captureFrameIndex: 0,
      expectedSimulationTick: 0,
      renderReadyReceiptId: "render-ready:missing",
      widthPixels: 320,
      heightPixels: 180,
    } as const;
    try {
      await expect(runtime.captureControlFrame(request)).rejects.toThrow(
        "CONTROL_CAPTURE_RENDER_READY_REQUIRED",
      );

      const receipt = runtime.renderFrame();
      await expect(runtime.captureControlFrame(request)).rejects.toThrow(
        "CONTROL_CAPTURE_RENDER_READY_REQUIRED",
      );
      await expect(runtime.captureControlFrame({
        ...request,
        renderReadyReceiptId: receipt.id,
      })).rejects.toThrow("CONTROL_CAPTURE_CAPABILITY_UNAVAILABLE");
    } finally {
      await runtime.dispose();
    }
  });

  it("initializes a right-handed Babylon scene with Havok from ExecutionPlanV4", async () => {
    const runtime = await createFlatPackageRuntime();

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
    expect(runtime.snapshot().subjectStatesByEntityId.player).toMatchObject({
      activeMotionProfileRef:
        "worldkit://motion-profile/free-ground.humanoid-medium@1",
      activeMotionKernelRef: "worldkit://motion-kernel/free-ground@1",
    });
    expect(
      runtime.requestMotionProfile(
        "player",
        "worldkit://motion-profile/free-ground.humanoid-medium@1",
      ),
    ).toBe(true);
    expect(
      runtime.requestControlFeelProfile(
        "player",
        "worldkit://control-feel-profile/humanoid.medium-ground@1",
      ),
    ).toBe(true);
    expect(() =>
      runtime.requestControlFeelProfile(
        "player",
        "worldkit://control-feel-profile/unknown.unlisted@1",
      ),
    ).toThrow(/^SUBJECT_OVERRIDE_FORBIDDEN/);
    expect(runtime.snapshot().resources.meshes).toBeGreaterThanOrEqual(10);

    await runtime.dispose();
    await runtime.dispose();
  });

  it("publishes support-derived state for uncontrolled grounded subjects every tick", async () => {
    const runtime = await createRiggedRuntime(createTwoRiggedSubjectExecutionPlan());
    try {
      // Let both subjects settle from their bootstrap onto the terrain.
      await runtime.runFixedInput({ actions: [], ticks: 30 });
      const settled = runtime.snapshot().subjectStatesByEntityId["hero-b"]!;
      expect(settled.movementMedium).toBe("ground");
      const settledHeightMeters = settled.positionMetersXYZ[1];

      // Only a per-tick support publish moves the extra's published Feel ref
      // off the compiled value; a frozen stale state would keep medium-ground.
      expect(
        runtime.requestControlFeelProfile(
          "hero-b",
          "worldkit://control-feel-profile/humanoid.heavy-ground@1",
        ),
      ).toBe(true);
      const after = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 2,
      });
      const extra = after.subjectStatesByEntityId["hero-b"]!;
      expect(extra.movementMedium).toBe("ground");
      expect(extra.activeControlFeelProfileRef).toBe(
        "worldkit://control-feel-profile/humanoid.heavy-ground@1",
      );
      // The idle extra receives support publishes but is not simulated with
      // player input or gravity integration: it stays put on the ground.
      expect(extra.positionMetersXYZ[1]).toBeCloseTo(settledHeightMeters, 5);
      expect(Math.hypot(
        extra.velocityMetersPerSecondXYZ[0],
        extra.velocityMetersPerSecondXYZ[2],
      )).toBeLessThan(0.01);
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

  it("rejects a tampered frozen support assertion and cleans initialized resources", async () => {
    const executionPlan = createFlatPackageExecutionPlan();
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
    const executionPlan = createFlatPackageExecutionPlan();
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

  it("revalidates multi-axis layout bounds in the rendered Euler composition order", async () => {
    const base = createFlatPackageExecutionPlan();
    const wall = base.objects.find((object) => object.entityId === "wall-east")!;
    const placement = base.layout.placementsByEntityId[wall.entityId]!;
    const transform = {
      positionMetersXYZ: [0, 4.757966786623001, 0] as const,
      rotationEulerRadiansXYZ: [0.4, 0.7, -0.3] as const,
      scaleXYZ: [1, 1, 1] as const,
    };
    const executionPlan: ExecutionPlanV4 = {
      ...base,
      terrain: {
        ...base.terrain,
        heightSamplesMeters: base.terrain.heightSamplesMeters.map(() => 0),
      },
      objects: [{ ...wall, transform }],
      layout: {
        ...base.layout,
        placementsByEntityId: {
          [wall.entityId]: { ...placement, transform },
        },
        layoutAssertions: [
          {
            kind: "supported-by",
            constraintId: "multi-axis-wall-support",
            evidenceEntityIds: [wall.entityId, base.terrain.entityId],
            measurements: {},
            tolerances: { supportGapMeters: 0.001 },
            supportedEntityId: wall.entityId,
            supportingEntityId: base.terrain.entityId,
            maximumSupportGapMeters: 0.001,
            minimumSupportRatio: 1,
          },
        ],
      },
    };

    const runtime = await createRuntime(executionPlan);
    await runtime.dispose();
  });

  it("fails supported-by when the supported bottom sits on the rotated visual AABB top instead of the locked collider top", async () => {
    const rollRadians = 0.3;
    const visualAabbTopMeters = 2 + 2 * Math.sin(rollRadians) + 0.5 * Math.cos(rollRadians);
    const executionPlan = createColliderSupportExecutionPlan({
      pedestalPrimitive: { kind: "box", sizeMetersXYZ: [4, 1, 4] },
      crateBottomMeters: visualAabbTopMeters,
      maximumSupportGapMeters: 0.1,
    });

    const error = await createRuntime(executionPlan).catch((reason) => reason as unknown);

    expect(isWorldRuntimeLayoutAssertionErrorV1(error)).toBe(true);
  }, 15_000);

  it("passes supported-by when the supported bottom sits on the locked collider top", async () => {
    const rollRadians = 0.3;
    const executionPlan = createColliderSupportExecutionPlan({
      pedestalPrimitive: { kind: "box", sizeMetersXYZ: [4, 1, 4] },
      crateBottomMeters: 2 + 0.5 * Math.cos(rollRadians),
      maximumSupportGapMeters: 0.1,
    });

    const runtime = await createRuntime(executionPlan);
    await runtime.dispose();
  }, 15_000);

  it("throws OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED for an unsupported supporting collider kind", async () => {
    const executionPlan = createColliderSupportExecutionPlan({
      pedestalPrimitive: { kind: "cone", radiusMeters: 2, heightMeters: 1 },
      crateBottomMeters: 2.5,
      maximumSupportGapMeters: 0.1,
    });

    await expect(createRuntime(executionPlan)).rejects.toThrow(
      /^OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED/,
    );
  }, 15_000);

  it("revalidates V5 supported-by from static colliders instead of the cone visual", async () => {
    const runtime = await createRuntime(
      createV5StaticColliderSupportExecutionPlan(),
    );
    await runtime.dispose();
  }, 15_000);

  it("aligns canonical world vertices with Babylon world matrix and Havok world bounds", async () => {
    const executionPlan = createV5StaticColliderGeometryConformancePlan();
    const collider = executionPlan.staticColliders[0]!;
    const expectedWorldPositionsMetersXYZ = [
      -1, 6, -2.5, 3, 6, -2.5, 3, 6, 3.5, -1, 6, 3.5,
      -1, -2, -2.5, 3, -2, -2.5, 3, -2, 3.5, -1, -2, 3.5,
    ];
    const runtime = await createRuntime(executionPlan);
    try {
      const scene = (runtime as unknown as { scene: Scene }).scene;
      const mesh = scene.getMeshByName(
        `worldkit.static-collider.${collider.colliderSubshapeId}`,
      );
      expect(mesh).not.toBeNull();
      const localPositions = mesh!.getVerticesData(VertexBuffer.PositionKind)!;
      const worldMatrix = mesh!.computeWorldMatrix(true);
      const babylonWorldPositions: number[] = [];
      for (let offset = 0; offset < localPositions.length; offset += 3) {
        const worldPosition = Vector3.TransformCoordinates(
          Vector3.FromArray(localPositions, offset),
          worldMatrix,
        );
        babylonWorldPositions.push(...worldPosition.asArray());
      }
      const canonicalWorldMesh =
        emitTransformedStaticColliderTriangleMeshV1(
          collider.shape,
          collider.transform,
      );
      const canonicalWorldPositions =
        canonicalWorldMesh.worldPositionsMetersXYZ;

      expect(babylonWorldPositions).toHaveLength(
        expectedWorldPositionsMetersXYZ.length,
      );
      babylonWorldPositions.forEach((value, index) => {
        expect(value).toBeCloseTo(canonicalWorldPositions[index]!, 10);
        expect(value).toBeCloseTo(expectedWorldPositionsMetersXYZ[index]!, 10);
      });

      const physicsEngine = scene.getPhysicsEngine() as PhysicsEngine;
      const body = physicsEngine.getBodies().find((candidate) =>
        candidate.transformNode.metadata?.colliderSubshapeId ===
          collider.colliderSubshapeId
      );
      expect(body).toBeDefined();
      const rays = {
        minimumX: physicsEngine.raycast(
          new Vector3(-5, 2, 0.5),
          new Vector3(5, 2, 0.5),
        ),
        maximumX: physicsEngine.raycast(
          new Vector3(5, 2, 0.5),
          new Vector3(-5, 2, 0.5),
        ),
        minimumY: physicsEngine.raycast(
          new Vector3(1, -5, 0.5),
          new Vector3(1, 10, 0.5),
        ),
        maximumY: physicsEngine.raycast(
          new Vector3(1, 10, 0.5),
          new Vector3(1, -5, 0.5),
        ),
        minimumZ: physicsEngine.raycast(
          new Vector3(1, 2, -5),
          new Vector3(1, 2, 6),
        ),
        maximumZ: physicsEngine.raycast(
          new Vector3(1, 2, 6),
          new Vector3(1, 2, -5),
        ),
      };
      for (const hit of Object.values(rays)) {
        expect(hit.hasHit).toBe(true);
        expect(hit.body).toBe(body);
      }
      const havokWorldMinimum = [
        rays.minimumX.hitPointWorld.x,
        rays.minimumY.hitPointWorld.y,
        rays.minimumZ.hitPointWorld.z,
      ];
      const havokWorldMaximum = [
        rays.maximumX.hitPointWorld.x,
        rays.maximumY.hitPointWorld.y,
        rays.maximumZ.hitPointWorld.z,
      ];
      const havokWorldCenter = havokWorldMinimum.map((minimum, index) =>
        (minimum + havokWorldMaximum[index]!) / 2
      );
      [-1, -2, -2.5].forEach((value, index) => {
        expect(havokWorldMinimum[index]).toBeCloseTo(value, 5);
      });
      [3, 6, 3.5].forEach((value, index) => {
        expect(havokWorldMaximum[index]).toBeCloseTo(value, 5);
      });
      [1, 2, 0.5].forEach((value, index) => {
        expect(havokWorldCenter[index]).toBeCloseTo(value, 5);
      });
    } finally {
      await runtime.dispose();
    }
  }, 15_000);

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

  it("initializes and resets Subject yaw from the solved spawn facing", async () => {
    const base = createFlatPackageExecutionPlan();
    const executionPlan: ExecutionPlanV4 = {
      ...base,
      subjects: base.subjects.map((subject) =>
        subject.entityId === "player"
          ? { ...subject, spawnSubjectFacingRadians: Math.PI / 2 }
          : subject,
      ),
    };
    const runtime = await createRuntime(executionPlan);
    const debug = createRuntimeDebugProbe(runtime);

    expect(runtime.snapshot().subjectStatesByEntityId.player?.forwardXYZ).toEqual([
      -1,
      0,
      -Math.cos(Math.PI / 2),
    ]);
    expect(debug.visualRootYawRadians("player")).toBeCloseTo(Math.PI / 2, 12);

    await runtime.runFixedInput(moveRightForTicks(1));
    const reset = runtime.reset();

    expect(reset.subjectStatesByEntityId.player?.forwardXYZ).toEqual([
      -1,
      0,
      -Math.cos(Math.PI / 2),
    ]);
    expect(debug.visualRootYawRadians("player")).toBeCloseTo(Math.PI / 2, 12);
    await runtime.dispose();
  });

  it("creates and snapshots every compiled Subject independently", async () => {
    const runtime = await createFlatPackageRuntime();

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

  describe("static asset subject", () => {
    it("loads a real static GLB without Rig resources and isolates two instances", async () => {
      const runtime = await createRuntime(
        createStaticAssetSubjectExecutionPlan({ twoSubjects: true }),
        { subjectAssetResolver: createMemoryResolver(staticSubjectAssetBytes) },
      );
      try {
        const probe = createSubjectVisualProbe(runtime);
        const primaryVisual = probe.visual("player");
        const secondaryVisual = probe.visual("static-secondary");
        const primaryInstance = primaryVisual.assetInstance!;
        const secondaryInstance = secondaryVisual.assetInstance!;
        const primaryPartRoot = primaryVisual.assetPartRoots![0]!;
        const secondaryPartRoot = secondaryVisual.assetPartRoots![0]!;

        expect(primaryInstance.skeletons).toEqual([]);
        expect(primaryInstance.animationGroups).toEqual([]);
        expect(primaryInstance.rootNodes[0]).not.toBe(secondaryInstance.rootNodes[0]);
        expect(primaryInstance.meshes[0]).not.toBe(secondaryInstance.meshes[0]);
        expect(primaryPartRoot).not.toBe(secondaryPartRoot);
        expect(primaryInstance.rootNodes[0]!.parent).toBe(primaryPartRoot);
        expect(secondaryInstance.rootNodes[0]!.parent).toBe(secondaryPartRoot);
        expect(primaryVisual.socketNodesById.get("focus.local")).not.toBe(
          secondaryVisual.socketNodesById.get("focus.local"),
        );
        expect(primaryVisual.socketNodesById.get("focus.local")?.parent).toBe(
          primaryVisual.root,
        );
      } finally {
        await runtime.dispose();
      }
    });

    it("owns mutable Material state and disposal independently per instance", async () => {
      const runtime = await createRuntime(
        createStaticAssetSubjectExecutionPlan({ twoSubjects: true }),
        { subjectAssetResolver: createMemoryResolver(staticSubjectAssetBytes) },
      );
      try {
        const probe = createSubjectVisualProbe(runtime);
        const primaryVisual = probe.visual("player");
        const secondaryVisual = probe.visual("static-secondary");
        const primaryInstance = primaryVisual.assetInstance!;
        const secondaryInstance = secondaryVisual.assetInstance!;
        const primaryMaterial = primaryInstance.meshes[0]!.material;
        const secondaryMaterial = secondaryInstance.meshes[0]!.material;
        let primaryMaterialDisposed = false;
        let secondaryMaterialDisposed = false;
        primaryMaterial?.onDisposeObservable.add(() => {
          primaryMaterialDisposed = true;
        });
        secondaryMaterial?.onDisposeObservable.add(() => {
          secondaryMaterialDisposed = true;
        });

        expect(primaryMaterial).toBeInstanceOf(StandardMaterial);
        expect(secondaryMaterial).toBeInstanceOf(StandardMaterial);
        expect(primaryMaterial).not.toBe(secondaryMaterial);
        expect(primaryMaterial?.alpha).toBe(1);
        expect(secondaryMaterial?.alpha).toBe(1);

        primaryMaterial!.alpha = 0.25;

        expect(secondaryMaterial?.alpha).toBe(1);
        primaryVisual.dispose();
        expect(primaryMaterialDisposed).toBe(true);
        expect(secondaryMaterialDisposed).toBe(false);
        expect(secondaryInstance.meshes[0]!.material).toBe(secondaryMaterial);
        expect(secondaryInstance.rootNodes[0]!.isDisposed()).toBe(false);
        secondaryMaterial!.alpha = 0.75;
        expect(secondaryMaterial?.alpha).toBe(0.75);
      } finally {
        await runtime.dispose();
      }
    });

    it("restores the authored Asset Part local transform on reset", async () => {
      const runtime = await createRuntime(createStaticAssetSubjectExecutionPlan(), {
        subjectAssetResolver: createMemoryResolver(staticSubjectAssetBytes),
      });
      try {
        const partRoot = createSubjectVisualProbe(runtime)
          .visual("player")
          .assetPartRoots![0]!;
        partRoot.position.set(9, 8, 7);
        partRoot.rotationQuaternion = Quaternion.FromEulerAngles(0.4, 0.5, 0.6);
        partRoot.scaling.set(6, 5, 4);

        runtime.reset();

        expect(partRoot.position.asArray()).toEqual([1, 2, -3]);
        expect(partRoot.scaling.asArray()).toEqual([2, 3, 4]);
        expect(partRoot.rotationQuaternion?.x).toBeCloseTo(0, 12);
        expect(partRoot.rotationQuaternion?.y).toBeCloseTo(0.5, 12);
        expect(partRoot.rotationQuaternion?.z).toBeCloseTo(0, 12);
        expect(partRoot.rotationQuaternion?.w).toBeCloseTo(Math.sqrt(3) / 2, 12);
      } finally {
        await runtime.dispose();
      }
    });

    it("releases the real Asset lease when construction fails after instantiation", async () => {
      const { engine, scene } = createAssetScene();
      const material = new StandardMaterial("static-subject-test", scene);
      const cache = new SubjectAssetCacheV1(
        scene,
        createMemoryResolver(staticSubjectAssetBytes),
      );
      const nativeAcquire = cache.acquire.bind(cache);
      let partialInstance: SubjectAssetInstanceV1 | undefined;
      vi.spyOn(cache, "acquire").mockImplementation(async (asset) => {
        const lease = await nativeAcquire(asset);
        const nativeInstantiate = lease.instantiate.bind(lease);
        vi.spyOn(lease, "instantiate").mockImplementation((subjectEntityId) => {
          partialInstance = nativeInstantiate(subjectEntityId);
          throw new Error("BABYLON_PROVIDER_PRIVATE_PARTIAL_CONSTRUCTION_FAILURE");
        });
        return lease;
      });
      const executionPlan = createStaticAssetSubjectExecutionPlan();

      try {
        const error = await createSubjectVisual({
          subject: executionPlan.subjects[0]!,
          executionPlan,
          material,
          scene,
          subjectAssetCache: cache,
        }).catch((reason) => reason as unknown);
        const cacheInternals = cache as unknown as {
          leases: ReadonlySet<SubjectAssetLeaseV1>;
          entriesByKey: ReadonlyMap<string, { refCount: number }>;
        };

        expect(error).toMatchObject({ code: "SUBJECT_ASSET_RIG_INCOMPATIBLE" });
        expect(error).not.toHaveProperty("cause");
        expect(String(error)).not.toMatch(/babylon|provider/i);
        expect(partialInstance).toBeDefined();
        expect(partialInstance!.rootNodes.every((node) => node.isDisposed())).toBe(true);
        expect(cacheInternals.leases.size).toBe(0);
        expect(
          [...cacheInternals.entriesByKey.values()].map((entry) => entry.refCount),
        ).toEqual([0]);
      } finally {
        await cache.dispose();
        material.dispose();
        scene.dispose();
        engine.dispose();
      }
    });

    it("disposes Instance then Lease before every Subject-owned resource", async () => {
      const { engine, scene } = createAssetScene();
      const material = new StandardMaterial("static-subject-test", scene);
      const cache = new SubjectAssetCacheV1(
        scene,
        createMemoryResolver(staticSubjectAssetBytes),
      );
      const executionPlan = createStaticAssetSubjectExecutionPlan();
      let visual: SubjectVisualInternals | undefined;

      try {
        visual = await createSubjectVisual({
          subject: executionPlan.subjects[0]!,
          executionPlan,
          material,
          scene,
          subjectAssetCache: cache,
        }) as SubjectVisualInternals;
        const instance = visual.assetInstance!;
        const lease = visual.assetLease!;
        const socket = visual.socketNodesById.get("focus.local")!;
        const partRoot = visual.assetPartRoots![0]!;
        const ownedMaterial = instance.meshes[0]!.material!;
        const disposalOrder: string[] = [];
        const nativeInstanceDispose = instance.dispose.bind(instance);
        vi.spyOn(instance, "dispose").mockImplementation(() => {
          disposalOrder.push("instance");
          nativeInstanceDispose();
        });
        const nativeRelease = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          disposalOrder.push("lease");
          nativeRelease();
        });
        const nativeSocketDispose = socket.dispose.bind(socket);
        vi.spyOn(socket, "dispose").mockImplementation((...args) => {
          disposalOrder.push("socket");
          nativeSocketDispose(...args);
        });
        const nativePartRootDispose = partRoot.dispose.bind(partRoot);
        vi.spyOn(partRoot, "dispose").mockImplementation((...args) => {
          disposalOrder.push("part-root");
          nativePartRootDispose(...args);
        });
        const nativeMaterialDispose = ownedMaterial.dispose.bind(ownedMaterial);
        vi.spyOn(ownedMaterial, "dispose").mockImplementation((...args) => {
          disposalOrder.push("material");
          nativeMaterialDispose(...args);
        });
        const nativeRootDispose = visual.root.dispose.bind(visual.root);
        vi.spyOn(visual.root, "dispose").mockImplementation((...args) => {
          disposalOrder.push("root");
          nativeRootDispose(...args);
        });

        visual.dispose();

        expect(disposalOrder).toEqual([
          "instance",
          "lease",
          "socket",
          "part-root",
          "material",
          "root",
        ]);
        expect(instance.rootNodes.every((node) => node.isDisposed())).toBe(true);
      } finally {
        visual?.dispose();
        await cache.dispose();
        material.dispose();
        scene.dispose();
        engine.dispose();
      }
    });

    it("keeps the frozen cleanup order after partial construction and throwing disposers", async () => {
      const { engine, scene } = createAssetScene();
      const material = new StandardMaterial("static-subject-test", scene);
      const cache = new SubjectAssetCacheV1(
        scene,
        createMemoryResolver(staticSubjectAssetBytes),
      );
      const baseExecutionPlan = createStaticAssetSubjectExecutionPlan();
      const riggedSocket = createFlatRiggedExecutionPlan().subjects[0]!.sockets[0]!;
      const staticSubject = baseExecutionPlan.subjects[0]!;
      const executionPlan: ExecutionPlanV4 = {
        ...baseExecutionPlan,
        subjects: [{
          ...staticSubject,
          sockets: [...staticSubject.sockets, riggedSocket],
        }],
      };
      const disposalOrder: string[] = [];
      const observedNodes = new Map<string, TransformNode>();
      const expectedNodeLabelByName = new Map([
        ["player.visual-root", "root"],
        ["player.body.asset", "part-root"],
        ["player.socket.focus.local", "socket"],
      ]);
      scene.onNewTransformNodeAddedObservable.add((node) => {
        const label = expectedNodeLabelByName.get(node.name);
        if (label === undefined) return;
        observedNodes.set(label, node);
        const nativeDispose = node.dispose.bind(node);
        vi.spyOn(node, "dispose").mockImplementation((...args) => {
          disposalOrder.push(label);
          nativeDispose(...args);
        });
      });
      let ownedMaterial: StandardMaterial | undefined;
      let ownedMaterialDisposed = false;
      const nativeClone = material.clone.bind(material);
      vi.spyOn(material, "clone").mockImplementation((...args) => {
        ownedMaterial = nativeClone(...args);
        ownedMaterial.onDisposeObservable.add(() => {
          ownedMaterialDisposed = true;
        });
        const nativeDispose = ownedMaterial.dispose.bind(ownedMaterial);
        vi.spyOn(ownedMaterial, "dispose").mockImplementation((...disposeArgs) => {
          disposalOrder.push("material");
          nativeDispose(...disposeArgs);
          throw new Error("BABYLON_PROVIDER_PRIVATE_MATERIAL_DISPOSE_FAILURE");
        });
        return ownedMaterial;
      });
      const nativeAcquire = cache.acquire.bind(cache);
      vi.spyOn(cache, "acquire").mockImplementation(async (asset) => {
        const lease = await nativeAcquire(asset);
        const nativeInstantiate = lease.instantiate.bind(lease);
        vi.spyOn(lease, "instantiate").mockImplementation((subjectEntityId) => {
          const instance = nativeInstantiate(subjectEntityId);
          const nativeInstanceDispose = instance.dispose.bind(instance);
          vi.spyOn(instance, "dispose").mockImplementation(() => {
            disposalOrder.push("instance");
            nativeInstanceDispose();
            throw new Error("BABYLON_PROVIDER_PRIVATE_INSTANCE_DISPOSE_FAILURE");
          });
          return instance;
        });
        const nativeRelease = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          disposalOrder.push("lease");
          nativeRelease();
          throw new Error("BABYLON_PROVIDER_PRIVATE_LEASE_RELEASE_FAILURE");
        });
        return lease;
      });

      try {
        const error = await createSubjectVisual({
          subject: executionPlan.subjects[0]!,
          executionPlan,
          material,
          scene,
          subjectAssetCache: cache,
        }).catch((reason) => reason as unknown);

        expect(error).toMatchObject({ code: "SUBJECT_ASSET_SOCKET_BONE_MISSING" });
        expect(error).not.toHaveProperty("cause");
        expect(String(error)).not.toMatch(/babylon|provider/i);
        expect(disposalOrder).toEqual([
          "instance",
          "lease",
          "socket",
          "part-root",
          "material",
          "root",
        ]);
        expect(ownedMaterialDisposed).toBe(true);
        expect(
          [...observedNodes.values()].every((node) => node.isDisposed()),
        ).toBe(true);
        expect(
          (cache as unknown as { leases: ReadonlySet<SubjectAssetLeaseV1> }).leases
            .size,
        ).toBe(0);
      } finally {
        await cache.dispose();
        material.dispose();
        scene.dispose();
        engine.dispose();
      }
    });
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
    const baseExecutionPlan = compileFlatTerrainExecutionPlan(spec);
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
    const probe = createSubjectVisualProbe(runtime);
    const visual = probe.visual("player");
    const secondaryVisual = probe.visual("g-bot-secondary");
    const primaryInstance = visual.assetInstance!;
    const secondaryInstance = secondaryVisual.assetInstance!;
    const primaryAssetPartRoot = visual.assetPartRoots![0]!;
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
    expect(primaryAssetPartRoot.rotationQuaternion?.toEulerAngles().y).toBeCloseTo(
      Math.PI,
    );
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
    const gBotLanded = await runtime.runFixedInput({ actions: [], ticks: 240 });
    expect(gBotLanded.subjectStatesByEntityId.player).toMatchObject({
      activeActionId: "idle",
      movementMedium: "ground",
      velocityMetersPerSecondXYZ: [expect.any(Number), 0, expect.any(Number)],
    });
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

  it("samples the G Bot pose once when many fixed Ticks share one rendered frame", async () => {
    const runtime = await createRuntime(
      compileRouteExecutionPlan(structuredClone(gBotAuthoringSpec)),
      { subjectAssetResolver: createMemoryResolver(gBotSubjectAssetBytes) },
    );
    const animationGroups = createSubjectVisualProbe(runtime)
      .visual("g-bot-primary")
      .assetInstance!.animationGroups;
    const poseSampleSpies = animationGroups.map((group) =>
      vi.spyOn(group, "goToFrame"),
    );
    const schedule = [
      { actions: [] as const, ticks: 20 },
      { actions: ["move-forward"] as const, ticks: 20 },
      { actions: [] as const, ticks: 5 },
    ];

    for (const input of schedule) await runtime.runFixedInput(input);
    expect(
      poseSampleSpies.reduce((count, spy) => count + spy.mock.calls.length, 0),
    ).toBe(0);

    runtime.renderFrame();

    const renderedPoseSampleCount =
      poseSampleSpies.reduce((count, spy) => count + spy.mock.calls.length, 0);
    expect(renderedPoseSampleCount).toBeGreaterThan(0);
    expect(renderedPoseSampleCount).toBeLessThanOrEqual(2);
    for (const spy of poseSampleSpies) spy.mockRestore();
    await runtime.dispose();
  }, 20_000);

  it("lands the product G Bot on its authored heightfield after one jump input", async () => {
    const runtime = await createRuntime(
      compileRouteExecutionPlan(structuredClone(gBotAuthoringSpec)),
      { subjectAssetResolver: createMemoryResolver(gBotSubjectAssetBytes) },
    );

    await runtime.runFixedInput({ actions: ["jump"], ticks: 1 });
    const landed = await runtime.runFixedInput({ actions: [], ticks: 240 });

    expect(landed.subjectStatesByEntityId["g-bot-primary"]).toMatchObject({
      activeActionId: "idle",
      movementMedium: "ground",
      velocityMetersPerSecondXYZ: [expect.any(Number), 0, expect.any(Number)],
    });
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
    const probe = createSubjectVisualProbe(runtime);
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
    const probe = createSubjectVisualProbe(runtime);
    const visual = probe.visual("player");

    await runtime.runFixedInput({ actions: [], ticks: 5 });
    const initial = runtime.snapshot().subjectStatesByEntityId.player!;
    const jumping = await runtime.runFixedInput({ actions: ["jump"], ticks: 4 });
    expect(jumping.subjectStatesByEntityId.player).toMatchObject({
      activeActionId: "jump",
      movementMedium: "air",
      velocityMetersPerSecondXYZ: [
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
      ],
    });
    expect(
      Math.abs(jumping.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[0]),
    ).toBeLessThan(0.000_001);
    expect(
      Math.abs(jumping.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[2]),
    ).toBeLessThan(0.000_001);
    const landed = await runtime.runFixedInput({ actions: [], ticks: 180 });
    expect(landed.subjectStatesByEntityId.player).toMatchObject({
      activeActionId: "idle",
      movementMedium: "ground",
      positionMetersXYZ: [expect.any(Number), expect.any(Number), expect.any(Number)],
      velocityMetersPerSecondXYZ: [0, 0, 0],
    });
    expect(landed.subjectStatesByEntityId.player!.positionMetersXYZ[0]).toBeCloseTo(0, 3);
    expect(landed.subjectStatesByEntityId.player!.positionMetersXYZ[2]).toBeCloseTo(30, 2);
    expect(
      Math.abs(
        landed.subjectStatesByEntityId.player!.positionMetersXYZ[1] -
          initial.positionMetersXYZ[1],
      ),
    ).toBeLessThan(0.15);

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
      const executionPlan = createFlatRiggedExecutionPlan();
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
      const executionPlan = createFlatRiggedExecutionPlan();
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
        createFlatRiggedExecutionPlan(),
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
      const executionPlan = createFlatRiggedExecutionPlan();
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
      createFlatRiggedExecutionPlan(),
      "SUBJECT_ASSET_RIG_INCOMPATIBLE",
    );
  });

  it("uses the closed Socket diagnostic when a Bone Socket cannot resolve its semantic Bone", async () => {
    const executionPlan = createFlatRiggedExecutionPlan();
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
    const executionPlan = createFlatRiggedExecutionPlan();
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
    const basePlan = createFlatRiggedExecutionPlan();
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
    const visual = createSubjectVisualProbe(runtime).visual("player");
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
    const runtime = await createFlatPackageRuntime();
    const internals = runtime as unknown as {
      aggregates: Array<{ dispose(): void }>;
      ownedTerrainShape: { dispose(): void };
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
    const nativeTerrainShapeDispose =
      internals.ownedTerrainShape.dispose.bind(internals.ownedTerrainShape);
    const terrainShapeDisposal = vi
      .spyOn(internals.ownedTerrainShape, "dispose")
      .mockImplementation(() => nativeTerrainShapeDispose());
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
    expect(terrainShapeDisposal).toHaveBeenCalledTimes(1);
    expect(sceneDisposal).toHaveBeenCalledTimes(1);
    expect(engineDisposal).toHaveBeenCalledTimes(1);
    terrainShapeDisposal.mockRestore();
    sceneDisposal.mockRestore();
    engineDisposal.mockRestore();
  });

  it("uses run speed for horizontal movement even when a water volume exists", async () => {
    const groundPlan = createFlatPackageExecutionPlan();
    const walk = await movementResult(groundPlan, ["move-right"]);
    const run = await movementResult(groundPlan, ["move-right", "run"]);
    expect(walk.movementMedium).toBe("ground");
    expect(run.movementMedium).toBe("ground");
    expect(run.deltaXMeters).toBeGreaterThan(walk.deltaXMeters * 1.25);

    const waterPlan = createFlatPackageExecutionPlan((spec) => {
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
    expect(["ground", "air"]).toContain(waterWalk.movementMedium);
    expect(["ground", "air"]).toContain(waterRun.movementMedium);
    expect(waterRun.deltaXMeters).toBeGreaterThan(waterWalk.deltaXMeters * 1.25);
  });

  it("falls from an unsupported airborne spawn and lands on the terrain", async () => {
    const base = createFlatPackageExecutionPlan();
    const player = base.subjects.find((subject) => subject.entityId === "player")!;
    const executionPlan: ExecutionPlanV4 = {
      ...base,
      terrain: {
        ...base.terrain,
        heightSamplesMeters: base.terrain.heightSamplesMeters.map(() => 0),
      },
      waters: [],
      objects: [],
      subjects: [
        {
          ...player,
          spawnSubjectOriginPositionMetersXYZ: [0, 8, 0],
        },
      ],
      layout: { ...base.layout, layoutAssertions: [] },
    };
    const runtime = await createRuntime(executionPlan);
    try {
      const landed = await runtime.runFixedInput({ actions: [], ticks: 240 });
      expect(landed.subjectStatesByEntityId.player).toMatchObject({
        movementMedium: "ground",
        activeActionId: "idle",
      });
      expect(landed.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ)
        .toEqual(expect.arrayContaining([expect.closeTo(0), expect.closeTo(0), expect.closeTo(0)]));
      expect(
        landed.subjectStatesByEntityId.player!.positionMetersXYZ[1],
      ).toBeLessThan(0.7);
    } finally {
      await runtime.dispose();
    }
  });

  it("falls to lower terrain after walking off a raised collider", async () => {
    const base = createFlatPackageExecutionPlan();
    const player = base.subjects.find((subject) => subject.entityId === "player")!;
    const wall = base.objects.find((object) => object.entityId === "wall-east")!;
    const executionPlan: ExecutionPlanV4 = {
      ...base,
      terrain: {
        ...base.terrain,
        heightSamplesMeters: base.terrain.heightSamplesMeters.map(() => 0),
      },
      waters: [],
      objects: [
        {
          ...wall,
          transform: {
            positionMetersXYZ: [0, 2, 0],
            rotationEulerRadiansXYZ: [0, 0, 0],
            scaleXYZ: [1, 1, 1],
          },
        },
      ],
      subjects: [
        {
          ...player,
          spawnSubjectOriginPositionMetersXYZ: [0, 4.05, 0],
        },
      ],
      layout: { ...base.layout, layoutAssertions: [] },
    };
    const runtime = await createRuntime(executionPlan);
    try {
      await runtime.runFixedInput({ actions: [], ticks: 5 });
      const landed = await runtime.runFixedInput({
        actions: ["move-right"],
        ticks: 240,
      });
      const state = landed.subjectStatesByEntityId.player!;
      expect(state.positionMetersXYZ[0]).toBeGreaterThan(2);
      expect(state.positionMetersXYZ[1]).toBeLessThan(0.7);
      expect(state.movementMedium).toBe("ground");
    } finally {
      await runtime.dispose();
    }
  });

  it("uses Havok support rather than bilinear terrain height for ground and jump state", async () => {
    const base = createFlatPackageExecutionPlan();
    const player = base.subjects.find((subject) => subject.entityId === "player")!;
    const executionPlan: ExecutionPlanV4 = {
      ...base,
      terrain: {
        ...base.terrain,
        centerMetersXZ: [0, 0],
        sizeMetersXZ: [10, 10],
        resolutionCellsXZ: [2, 2],
        // At (-2.5, -2.5), the Havok triangle is y=0.75 while bilinear sampling
        // is y=0.5625. The physical slope is about 12 degrees, far below the
        // collider maxSlopeDegrees of 42, so Havok checkSupport must classify
        // it as SUPPORTED and jump must be allowed.
        heightSamplesMeters: [0, 1.5, 1.5, 0],
      },
      waters: [],
      objects: [],
      subjects: [
        {
          ...player,
          spawnSubjectOriginPositionMetersXYZ: [-2.5, 0.75, -2.5],
        },
      ],
      layout: { ...base.layout, layoutAssertions: [] },
    };
    const runtime = await createRuntime(executionPlan);
    try {
      await runtime.runFixedInput({ actions: [], ticks: 5 });
      expect(runtime.snapshot().subjectStatesByEntityId.player!.movementMedium).toBe(
        "ground",
      );
      const grounded = runtime.snapshot().subjectStatesByEntityId.player!;
      expect(grounded.positionMetersXYZ[1]).toBeGreaterThan(0.65);
      expect(grounded.positionMetersXYZ[1]).toBeLessThan(1.1);
      const jumped = await runtime.runFixedInput({ actions: ["jump"], ticks: 1 });
      expect(
        jumped.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1],
      ).toBeGreaterThan(1);
      let airborne = jumped;
      for (let tick = 0; tick < 20 && airborne.subjectStatesByEntityId.player!.movementMedium !== "air"; tick += 1) {
        airborne = await runtime.runFixedInput({ actions: [], ticks: 1 });
      }
      expect(airborne.subjectStatesByEntityId.player!.movementMedium).toBe("air");
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps asymmetric square heightfield physics aligned with rendered XZ samples", async () => {
    const base = createFlatPackageExecutionPlan();
    const executionPlan: ExecutionPlanV4 = {
      ...base,
      terrain: {
        ...base.terrain,
        centerMetersXZ: [0, 0],
        sizeMetersXZ: [10, 10],
        resolutionCellsXZ: [2, 2],
        heightSamplesMeters: [0, 0.2, 0.4, 0.6],
        minimumHeightMeters: 0,
        maximumHeightMeters: 0.6,
      },
      subjects: base.subjects.map((subject) => ({
        ...subject,
        spawnSubjectOriginPositionMetersXYZ: [4, 0.54, 4],
      })),
    };
    const runtime = await createRuntime(executionPlan);
    const scene = (runtime as unknown as { scene: Scene }).scene;
    const hit = scene.getPhysicsEngine()!.raycast(
      new Vector3(-2.5, 5, 2.5),
      new Vector3(-2.5, -5, 2.5),
    );

    expect(hit.hasHit).toBe(true);
    expect(hit.hitPointWorld.y).toBeCloseTo(0.35, 4);

    await runtime.dispose();
  });

  it("keeps rectangular terrain mesh physics aligned with rendered XZ samples", async () => {
    const base = createFlatPackageExecutionPlan();
    const executionPlan: ExecutionPlanV4 = {
      ...base,
      terrain: {
        ...base.terrain,
        centerMetersXZ: [0, 0],
        sizeMetersXZ: [10, 20],
        resolutionCellsXZ: [2, 3],
        heightSamplesMeters: [0, 0.2, 0.4, 0.6, 0.8, 1],
        minimumHeightMeters: 0,
        maximumHeightMeters: 1,
      },
      subjects: base.subjects.map((subject) => ({
        ...subject,
        spawnSubjectOriginPositionMetersXYZ: [4, 0.54, 4],
      })),
    };
    const runtime = await createRuntime(executionPlan);
    const scene = (runtime as unknown as { scene: Scene }).scene;
    const hit = scene.getPhysicsEngine()!.raycast(
      new Vector3(-2.5, 5, 5),
      new Vector3(-2.5, -5, 5),
    );

    expect(hit.hasHit).toBe(true);
    expect(hit.hitPointWorld.y).toBeCloseTo(0.65, 3);

    await runtime.dispose();
  });

  it("applies gravity to an uncontrolled airborne Subject while keeping it idle", async () => {
    const base = createFlatPackageExecutionPlan();
    const player = base.subjects.find((subject) => subject.entityId === "player")!;
    const executionPlan: ExecutionPlanV4 = {
      ...base,
      terrain: {
        ...base.terrain,
        heightSamplesMeters: base.terrain.heightSamplesMeters.map(() => 0),
        minimumHeightMeters: 0,
        maximumHeightMeters: 0,
      },
      subjects: [
        player,
        {
          ...player,
          entityId: "observer",
          spawnAnchorEntityId: "spawn-observer",
          spawnSubjectOriginPositionMetersXYZ: [4, 8, 0],
        },
      ],
    };
    const runtime = await createRuntime(executionPlan);

    const snapshot = await runtime.runFixedInput({ actions: [], ticks: 240 });

    expect(snapshot.subjectStatesByEntityId.observer).toMatchObject({
      activeActionId: "idle",
      movementMedium: "ground",
    });
    expect(
      snapshot.subjectStatesByEntityId.observer!.positionMetersXYZ[1],
    ).toBeLessThan(0.7);

    await runtime.dispose();
  });

  it("settles an uncontrolled Subject spawned just above terrain", async () => {
    const base = createFlatPackageExecutionPlan();
    const player = base.subjects.find((subject) => subject.entityId === "player")!;
    const executionPlan: ExecutionPlanV4 = {
      ...base,
      terrain: {
        ...base.terrain,
        heightSamplesMeters: base.terrain.heightSamplesMeters.map(() => 0),
        minimumHeightMeters: 0,
        maximumHeightMeters: 0,
      },
      waters: [],
      objects: [],
      subjects: [
        player,
        {
          ...player,
          entityId: "observer",
          spawnAnchorEntityId: "spawn-observer",
          spawnSubjectOriginPositionMetersXYZ: [4, 0.2, 0],
        },
      ],
      layout: { ...base.layout, layoutAssertions: [] },
    };
    const runtime = await createRuntime(executionPlan);

    const settled = await runtime.runFixedInput({ actions: [], ticks: 120 });
    const observer = settled.subjectStatesByEntityId.observer!;

    expect(observer.activeActionId).toBe("idle");
    expect(observer.movementMedium).toBe("ground");
    expect(Math.abs(observer.positionMetersXYZ[1])).toBeLessThan(0.16);
    expect(Math.abs(observer.velocityMetersPerSecondXYZ[1])).toBeLessThan(0.1);

    await runtime.dispose();
  });

  it("fires one jump per press while the jump action remains held", async () => {
    const runtime = await createFlatPackageRuntime();
    try {
      let grounded = false;
      for (let tick = 0; tick < 240; tick += 1) {
        const snapshot = await runtime.runFixedInput({ actions: [], ticks: 1 });
        if (snapshot.subjectStatesByEntityId.player!.movementMedium === "ground") {
          grounded = true;
          break;
        }
      }
      expect(grounded).toBe(true);
      let previousVerticalVelocity = 0;
      let takeoffCount = 0;
      for (let tick = 0; tick < 360; tick += 1) {
        const snapshot = await runtime.runFixedInput({ actions: ["jump"], ticks: 1 });
        const verticalVelocity =
          snapshot.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1];
        if (previousVerticalVelocity <= 0.1 && verticalVelocity > 1) takeoffCount += 1;
        previousVerticalVelocity = verticalVelocity;
      }
      expect(takeoffCount).toBe(1);
    } finally {
      await runtime.dispose();
    }
  });

  it("switches the default Controller atomically and moves only the committed Subject", async () => {
    const runtime = await createFlatPackageRuntime();
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
    expect(Math.abs(inactiveAfter[0] - inactiveBefore[0])).toBeLessThan(0.000_01);
    expect(inactiveAfter[1]).toBeCloseTo(inactiveBefore[1]);
    expect(Math.abs(inactiveAfter[2] - inactiveBefore[2])).toBeLessThan(0.000_01);
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
    const runtime = await createFlatPackageRuntime();

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

  it("stages Gameplay possession without mutating the live Runtime and publishes it atomically", async () => {
    const runtime = await createRuntime(createV5StaticColliderSupportExecutionPlan());
    try {
      const internal = runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]();
      const legacyBefore = runtime.snapshot();
      const viewBefore = internal.readViewProjection();

      expect(internal.readPossessionTarget()).toEqual({ mode: "unbound" });
      expect(legacyBefore.controlledEntityId).toBe("player");

      const prepared = await internal.preparePossessionTarget({
        mode: "possessed",
        controlledEntityId: "pack-animal-a",
      });

      expect(internal.readPossessionTarget()).toEqual({ mode: "unbound" });
      expect(internal.readViewProjection()).toBe(viewBefore);
      expect(runtime.snapshot()).toEqual(legacyBefore);
      expect(prepared.projectedViewStateAfter.viewStateRevision).toBe(
        viewBefore.viewStateRevision + 1,
      );

      expect(prepared.commitPrepared).not.toThrow();
      expect(internal.readPossessionTarget()).toEqual({
        mode: "possessed",
        controlledEntityId: "pack-animal-a",
      });
      expect(internal.readViewProjection()).toEqual(
        prepared.projectedViewStateAfter,
      );
      expect(runtime.snapshot().controlledEntityId).toBe("player");
    } finally {
      await runtime.dispose();
    }
  });

  it("aborts staged Gameplay possession idempotently without changing target, Camera, or projection", async () => {
    const runtime = await createRuntime(createV5StaticColliderSupportExecutionPlan());
    try {
      const internal = runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]();
      const targetBefore = internal.readPossessionTarget();
      const worldBefore = internal.readWorldProjection();
      const viewBefore = internal.readViewProjection();
      const cameraBefore = runtime.snapshot().camera;
      const prepared = await internal.preparePossessionTarget({
        mode: "possessed",
        controlledEntityId: "pack-animal-a",
      });

      const firstAbort = prepared.abort();
      expect(prepared.abort()).toBe(firstAbort);
      await firstAbort;

      expect(internal.readPossessionTarget()).toBe(targetBefore);
      expect(internal.readWorldProjection()).toEqual(worldBefore);
      expect(internal.readViewProjection()).toBe(viewBefore);
      expect(runtime.snapshot().camera).toEqual(cameraBefore);
      expect(() => prepared.commitPrepared()).toThrow(/aborted/);
    } finally {
      await runtime.dispose();
    }
  });

  it("routes one Gameplay fixed Tick only to the committed target and freezes Camera while unbound", async () => {
    const runtime = await createRuntime(createV5StaticColliderSupportExecutionPlan());
    try {
      const internal = runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]();
      const bind = await internal.preparePossessionTarget({
        mode: "possessed",
        controlledEntityId: "pack-animal-a",
      });
      bind.commitPrepared();
      const before = internal.readWorldProjection();
      const moved = await internal.runFixedInputTick({
        actions: ["move-right"],
        ticks: 1,
      });

      expect(() => parseGameplayWorldStateProjectionV1(moved, {
        controllerEntityIds: ["controller-primary"],
      })).not.toThrow();

      expect(moved.simulationTick).toBe(before.simulationTick + 1);
      expect(
        moved.spatialEntityStatesById["pack-animal-a"]!.positionMetersXYZ[0],
      ).toBeGreaterThan(
        before.spatialEntityStatesById["pack-animal-a"]!.positionMetersXYZ[0],
      );
      expect(
        moved.spatialEntityStatesById.player!.positionMetersXYZ[0],
      ).toBeCloseTo(
        before.spatialEntityStatesById.player!.positionMetersXYZ[0],
        8,
      );
      expect(moved.capabilityStatesById[
        "capability-state:pack-animal-a:locomotion"
      ]).toMatchObject({
        kind: "locomotion-capability-state",
        ownerEntityId: "pack-animal-a",
        locomotionCapabilityRef:
          "worldkit://capability/locomotion.ground@1",
        mode: "walk",
        movementMedium: "ground",
      });
      expect(moved.semanticFactsById).toEqual({});

      const cameraBeforeRelease = runtime.snapshot().camera.positionMetersXYZ;
      const release = await internal.preparePossessionTarget({ mode: "unbound" });
      release.commitPrepared();
      await internal.runFixedInputTick({
        actions: ["move-right", "camera-recenter"],
        ticks: 1,
      });

      expect(internal.readPossessionTarget()).toEqual({ mode: "unbound" });
      expect(runtime.snapshot().camera.positionMetersXYZ).toEqual(
        cameraBeforeRelease,
      );
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects invalid Gameplay targets and non-single-Tick batches before mutation", async () => {
    const runtime = await createRuntime(createV5StaticColliderSupportExecutionPlan());
    try {
      const internal = runtime[BABYLON_GAMEPLAY_RUNTIME_INTERNAL]();
      await expect(internal.preparePossessionTarget({
        mode: "possessed",
        controlledEntityId: "missing",
      })).rejects.toThrow(/target/i);
      await expect(internal.runFixedInputTick({
        actions: [],
        ticks: 2,
      } as never)).rejects.toThrow(/one fixed Tick/i);
      expect(internal.readPossessionTarget()).toEqual({ mode: "unbound" });
      expect(internal.readWorldProjection().simulationTick).toBe(0);
    } finally {
      await runtime.dispose();
    }
  });

  it("moves by semantic fixed input but cannot pass through a fixed wall", async () => {
    const executionPlan = createFlatPackageExecutionPlan((spec) => {
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

  it("gradually aligns the canonical minus-Z Subject front with camera-relative movement", async () => {
    const { runtime, debug } = await createRuntimeWithPackageSubject();
    const actions = ["move-forward", "move-backward", "move-left", "move-right"] as const;

    for (const action of actions) {
      runtime.reset();
      const snapshot = await runtime.runFixedInput({ actions: [action], ticks: 60 });
      const [forwardX, , forwardZ] =
        snapshot.subjectStatesByEntityId.player!.forwardXYZ!;
      const expectedYawRadians = Math.atan2(-forwardX, -forwardZ);
      const angularDelta = Math.atan2(
        Math.sin(debug.visualRootYawRadians("player") - expectedYawRadians),
        Math.cos(debug.visualRootYawRadians("player") - expectedYawRadians),
      );
      expect(angularDelta).toBeCloseTo(0);
    }

    await runtime.dispose();
  });

  it("keeps the locked capability motion active after reset", async () => {
    const { runtime } = await createRuntimeWithPackageSubject();
    try {
      const reset = runtime.reset();
      const resetPlayer = reset.subjectStatesByEntityId.player!;
      expect(resetPlayer.activeMotionProfileRef).toBe(
        "worldkit://motion-profile/free-ground.humanoid-medium@1",
      );

      const moved = await runtime.runFixedInput({
        actions: ["move-forward"],
        ticks: 60,
      });
      expect(
        Math.abs(
          moved.subjectStatesByEntityId.player!.positionMetersXYZ[2] -
            resetPlayer.positionMetersXYZ[2],
        ),
      ).toBeGreaterThan(0.5);
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps published movementMedium on support while walking through scenery water", async () => {
    const executionPlan = createFlatPackageExecutionPlan((spec) => {
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
    expect(["ground", "air"]).toContain(
      snapshot.subjectStatesByEntityId.player!.movementMedium,
    );
    await runtime.dispose();
  });

  it("keeps a Subject on a pier above swimmable water grounded and jumpable", async () => {
    const base = createFlatPackageExecutionPlan();
    const player = base.subjects.find((subject) => subject.entityId === "player")!;
    const wall = base.objects.find((object) => object.entityId === "wall-east")!;
    const water = base.waters[0]!;
    const executionPlan: ExecutionPlanV4 = {
      ...base,
      terrain: {
        ...base.terrain,
        heightSamplesMeters: base.terrain.heightSamplesMeters.map(() => 0),
        minimumHeightMeters: 0,
        maximumHeightMeters: 0,
      },
      waters: [
        {
          ...water,
          boundary: {
            kind: "ellipse",
            centerMetersXZ: [0, 0],
            radiusMetersXZ: [5, 5],
          },
          waterLevelMeters: 0,
          depthMeters: 3,
          traversalMode: "swimmable",
        },
      ],
      objects: [
        {
          ...wall,
          entityId: "pier",
          primitive: { kind: "box", sizeMetersXYZ: [6, 1, 6] },
          transform: {
            positionMetersXYZ: [0, 0.5, 0],
            rotationEulerRadiansXYZ: [0, 0, 0],
            scaleXYZ: [1, 1, 1],
          },
        },
      ],
      subjects: [
        {
          ...player,
          spawnSubjectOriginPositionMetersXYZ: [0, 1.05, 0],
        },
      ],
      layout: { ...base.layout, layoutAssertions: [] },
    };
    const runtime = await createRuntime(executionPlan);

    await runtime.runFixedInput({ actions: [], ticks: 10 });
    expect(runtime.snapshot().subjectStatesByEntityId.player!.movementMedium).toBe(
      "ground",
    );

    const jumped = await runtime.runFixedInput({ actions: ["jump"], ticks: 1 });
    expect(
      jumped.subjectStatesByEntityId.player!.velocityMetersPerSecondXYZ[1],
    ).toBeGreaterThan(1);
    let airborne = jumped;
    for (let tick = 0; tick < 30 && airborne.subjectStatesByEntityId.player!.movementMedium !== "air"; tick += 1) {
      airborne = await runtime.runFixedInput({ actions: [], ticks: 1 });
    }
    expect(airborne.subjectStatesByEntityId.player!.movementMedium).toBe("air");
    expect(airborne.subjectStatesByEntityId.player!.activeActionId).toBe("jump");

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

  it("orbits and zooms the third-person camera around its controlled Subject", async () => {
    const { runtime, executionPlan } = await createRuntimeWithPackageSubject();
    const before = runtime.snapshot().camera;
    runtime.adjustCameraView({
      yawDeltaRadians: Math.PI / 2,
      pitchDeltaRadians: -executionPlan.camera.pitchRadians,
      zoomDeltaMeters: 3 - executionPlan.camera.distanceMeters,
    });
    const adjusted = runtime.snapshot();
    expect(adjusted.camera.positionMetersXYZ).not.toEqual(before.positionMetersXYZ);
    expect(adjusted.camera.positionMetersXYZ.every(Number.isFinite)).toBe(true);
    expect(adjusted.camera.viewDistanceOffsetMeters).toBeLessThan(0);
    expect(adjusted.camera.viewYawOffsetRadians).toBeGreaterThan(0);
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
    reset.camera.positionMetersXYZ.forEach((value, index) => {
      expect(value).toBeCloseTo(initialCamera[index]!, 12);
    });
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
    player.applyPose();
    expect(animationFrame(idle)).toBe(40);

    player.step(60, "walk");
    player.applyPose();
    expect(animationFrame(walk)).toBe(5);
    expect(animationWeight(idle)).toBe(1);
    expect(animationWeight(walk)).toBe(0);
    player.step(75, "walk");
    player.applyPose();
    expect(animationFrame(walk)).toBeCloseTo(12.5, 8);
    expect(animationWeight(idle)).toBeCloseTo(0.5, 8);
    expect(animationWeight(walk)).toBeCloseTo(0.5, 8);
    player.step(90, "walk");
    player.applyPose();
    expect(animationFrame(walk)).toBe(20);
    expect(animationWeight(walk)).toBe(1);
    expect(idle.isStarted).toBe(false);

    player.step(90, "jump");
    player.applyPose();
    expect(animationFrame(jump)).toBe(7);
    player.step(150, "jump");
    player.applyPose();
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
    player.applyPose();

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
