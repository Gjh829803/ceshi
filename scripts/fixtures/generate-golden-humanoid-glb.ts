import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface GoldenHumanoidInventoryV1 {
  byteLength: number;
  contentHash: string;
  meshCount: 1;
  vertexCount: number;
  triangleCount: number;
  skeletonCount: 1;
  boneCount: 18;
  animationClipNames: readonly ["idle", "jump", "run", "walk"];
}

const BIPED_BONE_IDS = [
  "root",
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "upper-arm.left",
  "lower-arm.left",
  "hand.left",
  "upper-arm.right",
  "lower-arm.right",
  "hand.right",
  "upper-leg.left",
  "lower-leg.left",
  "foot.left",
  "upper-leg.right",
  "lower-leg.right",
  "foot.right",
] as const;

type BipedBoneIdV1 = (typeof BIPED_BONE_IDS)[number];
type Vector3 = readonly [number, number, number];

interface BoneDefinition {
  id: BipedBoneIdV1;
  parentId?: BipedBoneIdV1;
  translation: Vector3;
}

const BONES: readonly BoneDefinition[] = [
  { id: "root", translation: [0, 0, 0] },
  { id: "hips", parentId: "root", translation: [0, 0.92, 0] },
  { id: "spine", parentId: "hips", translation: [0, 0.2, 0] },
  { id: "chest", parentId: "spine", translation: [0, 0.25, 0] },
  { id: "neck", parentId: "chest", translation: [0, 0.25, 0] },
  { id: "head", parentId: "neck", translation: [0, 0.16, 0] },
  { id: "upper-arm.left", parentId: "chest", translation: [-0.31, 0.03, 0] },
  { id: "lower-arm.left", parentId: "upper-arm.left", translation: [0, -0.34, 0] },
  { id: "hand.left", parentId: "lower-arm.left", translation: [0, -0.28, 0] },
  { id: "upper-arm.right", parentId: "chest", translation: [0.31, 0.03, 0] },
  { id: "lower-arm.right", parentId: "upper-arm.right", translation: [0, -0.34, 0] },
  { id: "hand.right", parentId: "lower-arm.right", translation: [0, -0.28, 0] },
  { id: "upper-leg.left", parentId: "hips", translation: [-0.13, -0.08, 0] },
  { id: "lower-leg.left", parentId: "upper-leg.left", translation: [0, -0.42, 0] },
  { id: "foot.left", parentId: "lower-leg.left", translation: [0, -0.36, 0] },
  { id: "upper-leg.right", parentId: "hips", translation: [0.13, -0.08, 0] },
  { id: "lower-leg.right", parentId: "upper-leg.right", translation: [0, -0.42, 0] },
  { id: "foot.right", parentId: "lower-leg.right", translation: [0, -0.36, 0] },
] as const;

const CLIPS = [
  { name: "idle", durationSeconds: 2, loop: true, amplitudeRadians: 0.03 },
  { name: "walk", durationSeconds: 1, loop: true, amplitudeRadians: 0.35 },
  { name: "run", durationSeconds: 0.6, loop: true, amplitudeRadians: 0.55 },
  { name: "jump", durationSeconds: 0.8, loop: false, amplitudeRadians: 0.4 },
] as const;

const FRAMES_PER_SECOND = 30;
const GL_ARRAY_BUFFER = 34_962;
const GL_ELEMENT_ARRAY_BUFFER = 34_963;
const GL_FLOAT = 5_126;
const GL_UNSIGNED_SHORT = 5_123;

interface BoxDefinition {
  boneId: BipedBoneIdV1;
  center: Vector3;
  size: Vector3;
}

const BOXES: readonly BoxDefinition[] = [
  { boneId: "hips", center: [0, 0.9, 0], size: [0.36, 0.2, 0.22] },
  { boneId: "chest", center: [0, 1.3, 0], size: [0.5, 0.54, 0.24] },
  { boneId: "head", center: [0, 1.78, -0.02], size: [0.3, 0.32, 0.3] },
  { boneId: "upper-arm.left", center: [-0.31, 1.23, 0], size: [0.16, 0.34, 0.16] },
  { boneId: "lower-arm.left", center: [-0.31, 0.92, 0], size: [0.14, 0.28, 0.14] },
  { boneId: "hand.left", center: [-0.31, 0.72, -0.01], size: [0.16, 0.16, 0.18] },
  { boneId: "upper-arm.right", center: [0.31, 1.23, 0], size: [0.16, 0.34, 0.16] },
  { boneId: "lower-arm.right", center: [0.31, 0.92, 0], size: [0.14, 0.28, 0.14] },
  { boneId: "hand.right", center: [0.31, 0.72, -0.01], size: [0.16, 0.16, 0.18] },
  { boneId: "upper-leg.left", center: [-0.13, 0.63, 0], size: [0.18, 0.42, 0.2] },
  { boneId: "lower-leg.left", center: [-0.13, 0.24, 0], size: [0.16, 0.36, 0.18] },
  { boneId: "foot.left", center: [-0.13, 0.07, 0], size: [0.19, 0.14, 0.32] },
  { boneId: "upper-leg.right", center: [0.13, 0.63, 0], size: [0.18, 0.42, 0.2] },
  { boneId: "lower-leg.right", center: [0.13, 0.24, 0], size: [0.16, 0.36, 0.18] },
  { boneId: "foot.right", center: [0.13, 0.07, 0], size: [0.19, 0.14, 0.32] },
] as const;

interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  joints: Uint16Array;
  weights: Float32Array;
  indices: Uint16Array;
  minPosition: [number, number, number];
  maxPosition: [number, number, number];
}

interface BufferViewDefinition {
  buffer: 0;
  byteLength: number;
  byteOffset: number;
  target?: number;
}

interface AccessorDefinition {
  bufferView: number;
  byteOffset: 0;
  componentType: number;
  count: number;
  max?: number[];
  min?: number[];
  name: string;
  type: "SCALAR" | "VEC3" | "VEC4" | "MAT4";
}

class BinaryBufferBuilder {
  readonly bufferViews: BufferViewDefinition[] = [];
  readonly #chunks: Uint8Array[] = [];
  #byteLength = 0;

  append(data: ArrayBufferView, target?: number): number {
    this.#alignToFourBytes();
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const stableCopy = Uint8Array.from(bytes);
    const bufferView: BufferViewDefinition = {
      buffer: 0,
      byteLength: stableCopy.byteLength,
      byteOffset: this.#byteLength,
      ...(target === undefined ? {} : { target }),
    };
    const index = this.bufferViews.push(bufferView) - 1;
    this.#chunks.push(stableCopy);
    this.#byteLength += stableCopy.byteLength;
    return index;
  }

  finish(): Uint8Array {
    this.#alignToFourBytes();
    const result = new Uint8Array(this.#byteLength);
    let offset = 0;
    for (const chunk of this.#chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  #alignToFourBytes(): void {
    const paddingLength = (4 - (this.#byteLength % 4)) % 4;
    if (paddingLength === 0) {
      return;
    }
    this.#chunks.push(new Uint8Array(paddingLength));
    this.#byteLength += paddingLength;
  }
}

function boneIndex(boneId: BipedBoneIdV1): number {
  const index = BIPED_BONE_IDS.indexOf(boneId);
  if (index < 0) {
    throw new Error(`Unknown biped bone: ${boneId}`);
  }
  return index;
}

function buildMeshArrays(): MeshArrays {
  const positions: number[] = [];
  const normals: number[] = [];
  const joints: number[] = [];
  const weights: number[] = [];
  const indices: number[] = [];
  const minPosition: [number, number, number] = [Infinity, Infinity, Infinity];
  const maxPosition: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const box of BOXES) {
    const [centerX, centerY, centerZ] = box.center;
    const halfX = box.size[0] / 2;
    const halfY = box.size[1] / 2;
    const halfZ = box.size[2] / 2;
    const minX = centerX - halfX;
    const maxX = centerX + halfX;
    const minY = centerY - halfY;
    const maxY = centerY + halfY;
    const minZ = centerZ - halfZ;
    const maxZ = centerZ + halfZ;
    const faces: readonly [Vector3, readonly [Vector3, Vector3, Vector3, Vector3]][] = [
      [[1, 0, 0], [[maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [maxX, minY, maxZ]]],
      [[-1, 0, 0], [[minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [minX, minY, minZ]]],
      [[0, 1, 0], [[minX, maxY, minZ], [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ]]],
      [[0, -1, 0], [[minX, minY, maxZ], [minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ]]],
      [[0, 0, 1], [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]]],
      [[0, 0, -1], [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]]],
    ];
    const jointIndex = boneIndex(box.boneId);

    for (const [normal, vertices] of faces) {
      const firstVertexIndex = positions.length / 3;
      for (const vertex of vertices) {
        positions.push(...vertex);
        normals.push(...normal);
        joints.push(jointIndex, 0, 0, 0);
        weights.push(1, 0, 0, 0);
        for (let axis = 0; axis < 3; axis += 1) {
          const coordinate = vertex[axis];
          if (coordinate === undefined) {
            throw new Error("Box vertex is missing an axis");
          }
          minPosition[axis] = Math.min(minPosition[axis] ?? Infinity, coordinate);
          maxPosition[axis] = Math.max(maxPosition[axis] ?? -Infinity, coordinate);
        }
      }
      indices.push(
        firstVertexIndex,
        firstVertexIndex + 1,
        firstVertexIndex + 2,
        firstVertexIndex,
        firstVertexIndex + 2,
        firstVertexIndex + 3,
      );
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    joints: new Uint16Array(joints),
    weights: new Float32Array(weights),
    indices: new Uint16Array(indices),
    minPosition,
    maxPosition,
  };
}

function buildBoneNodes(): Array<Record<string, unknown>> {
  return BONES.map((bone) => {
    const children = BONES.flatMap((candidate, candidateIndex) =>
      candidate.parentId === bone.id ? [candidateIndex] : [],
    );
    return {
      ...(children.length === 0 ? {} : { children }),
      name: bone.id,
      translation: [...bone.translation],
    };
  });
}

function buildInverseBindMatrices(): Float32Array {
  const globalTranslations: Vector3[] = [];
  for (const bone of BONES) {
    const parentTranslation =
      bone.parentId === undefined ? ([0, 0, 0] as const) : globalTranslations[boneIndex(bone.parentId)];
    if (parentTranslation === undefined) {
      throw new Error(`Parent bind transform missing for ${bone.id}`);
    }
    globalTranslations.push([
      parentTranslation[0] + bone.translation[0],
      parentTranslation[1] + bone.translation[1],
      parentTranslation[2] + bone.translation[2],
    ]);
  }

  return new Float32Array(
    globalTranslations.flatMap(([x, y, z]) => [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      -x, -y, -z, 1,
    ]),
  );
}

function buildFrameTimes(durationSeconds: number): Float32Array {
  const frameCount = Math.round(durationSeconds * FRAMES_PER_SECOND);
  return Float32Array.from(
    { length: frameCount + 1 },
    (_, frame) => frame / FRAMES_PER_SECOND,
  );
}

function buildRotationFrames(
  frameCount: number,
  amplitudeRadians: number,
  loop: boolean,
  direction: 1 | -1,
): Float32Array {
  const values = new Float32Array(frameCount * 4);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const progress = frame / (frameCount - 1);
    const wave = loop ? Math.sin(progress * Math.PI * 2) : Math.sin(progress * Math.PI);
    const angle = frame === 0 || frame === frameCount - 1 ? 0 : wave * amplitudeRadians * direction;
    values[frame * 4] = Math.sin(angle / 2);
    values[frame * 4 + 1] = 0;
    values[frame * 4 + 2] = 0;
    values[frame * 4 + 3] = Math.cos(angle / 2);
  }
  return values;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonKeys(value));
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entryValue]) => [key, sortJsonKeys(entryValue)]),
    );
  }
  return value;
}

function padBytes(bytes: Uint8Array, paddingByte: number): Uint8Array {
  const paddedLength = Math.ceil(bytes.byteLength / 4) * 4;
  const padded = new Uint8Array(paddedLength);
  padded.fill(paddingByte);
  padded.set(bytes);
  return padded;
}

function assembleGlb(document: Record<string, unknown>, binaryChunk: Uint8Array): Uint8Array {
  const jsonChunk = padBytes(new TextEncoder().encode(stableJson(document)), 0x20);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + binaryChunk.byteLength;
  const bytes = new Uint8Array(totalLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonChunk.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonChunk, 20);
  const binaryHeaderOffset = 20 + jsonChunk.byteLength;
  view.setUint32(binaryHeaderOffset, binaryChunk.byteLength, true);
  view.setUint32(binaryHeaderOffset + 4, 0x004e4942, true);
  bytes.set(binaryChunk, binaryHeaderOffset + 8);
  return bytes;
}

export function buildGoldenHumanoidGlb(): {
  bytes: Uint8Array;
  inventory: GoldenHumanoidInventoryV1;
} {
  const mesh = buildMeshArrays();
  const binary = new BinaryBufferBuilder();
  const accessors: AccessorDefinition[] = [];
  const addAccessor = (
    data: ArrayBufferView,
    definition: Omit<AccessorDefinition, "bufferView" | "byteOffset">,
    target?: number,
  ): number => {
    const bufferView = binary.append(data, target);
    return accessors.push({ ...definition, bufferView, byteOffset: 0 }) - 1;
  };

  const positionAccessor = addAccessor(mesh.positions, {
    componentType: GL_FLOAT,
    count: mesh.positions.length / 3,
    max: mesh.maxPosition,
    min: mesh.minPosition,
    name: "positions",
    type: "VEC3",
  }, GL_ARRAY_BUFFER);
  const normalAccessor = addAccessor(mesh.normals, {
    componentType: GL_FLOAT,
    count: mesh.normals.length / 3,
    name: "normals",
    type: "VEC3",
  }, GL_ARRAY_BUFFER);
  const jointAccessor = addAccessor(mesh.joints, {
    componentType: GL_UNSIGNED_SHORT,
    count: mesh.joints.length / 4,
    name: "skin-joints",
    type: "VEC4",
  }, GL_ARRAY_BUFFER);
  const weightAccessor = addAccessor(mesh.weights, {
    componentType: GL_FLOAT,
    count: mesh.weights.length / 4,
    name: "skin-weights",
    type: "VEC4",
  }, GL_ARRAY_BUFFER);
  const indexAccessor = addAccessor(mesh.indices, {
    componentType: GL_UNSIGNED_SHORT,
    count: mesh.indices.length,
    max: [Math.max(...mesh.indices)],
    min: [Math.min(...mesh.indices)],
    name: "indices",
    type: "SCALAR",
  }, GL_ELEMENT_ARRAY_BUFFER);
  const inverseBindAccessor = addAccessor(buildInverseBindMatrices(), {
    componentType: GL_FLOAT,
    count: BONES.length,
    name: "inverse-bind-matrices",
    type: "MAT4",
  });

  const animations = CLIPS.map((clip) => {
    const frameTimes = buildFrameTimes(clip.durationSeconds);
    const finalFrameTime = frameTimes[frameTimes.length - 1];
    if (finalFrameTime === undefined) {
      throw new Error(`Animation clip ${clip.name} has no key frames`);
    }
    const inputAccessor = addAccessor(frameTimes, {
      componentType: GL_FLOAT,
      count: frameTimes.length,
      max: [finalFrameTime],
      min: [0],
      name: `${clip.name}-times-30fps`,
      type: "SCALAR",
    });
    const animatedBones = [
      { boneId: "upper-arm.left", direction: -1 },
      { boneId: "upper-arm.right", direction: 1 },
      { boneId: "upper-leg.left", direction: 1 },
      { boneId: "upper-leg.right", direction: -1 },
      { boneId: "lower-leg.left", direction: -1 },
      { boneId: "lower-leg.right", direction: 1 },
    ] as const;
    const samplers: Array<Record<string, unknown>> = [];
    const channels: Array<Record<string, unknown>> = [];
    for (const animatedBone of animatedBones) {
      const outputAccessor = addAccessor(
        buildRotationFrames(
          frameTimes.length,
          clip.amplitudeRadians,
          clip.loop,
          animatedBone.direction,
        ),
        {
          componentType: GL_FLOAT,
          count: frameTimes.length,
          name: `${clip.name}-${animatedBone.boneId}-rotations`,
          type: "VEC4",
        },
      );
      const samplerIndex = samplers.push({
        input: inputAccessor,
        interpolation: "LINEAR",
        output: outputAccessor,
      }) - 1;
      channels.push({
        sampler: samplerIndex,
        target: { node: boneIndex(animatedBone.boneId), path: "rotation" },
      });
    }
    return {
      channels,
      extras: {
        amplitudeRadians: clip.amplitudeRadians,
        framesPerSecond: FRAMES_PER_SECOND,
        loop: clip.loop,
      },
      name: clip.name,
      samplers,
    };
  });

  const binaryChunk = binary.finish();
  const meshNodeIndex = BONES.length;
  const document: Record<string, unknown> = {
    accessors,
    animations,
    asset: { generator: "Agent Whitebox World deterministic golden humanoid", version: "2.0" },
    bufferViews: binary.bufferViews,
    buffers: [{ byteLength: binaryChunk.byteLength }],
    materials: [{
      doubleSided: false,
      name: "GoldenWhitebox",
      pbrMetallicRoughness: {
        baseColorFactor: [0.86, 0.66, 0.18, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    }],
    meshes: [{
      name: "GoldenHumanoid",
      primitives: [{
        attributes: {
          JOINTS_0: jointAccessor,
          NORMAL: normalAccessor,
          POSITION: positionAccessor,
          WEIGHTS_0: weightAccessor,
        },
        indices: indexAccessor,
        material: 0,
        mode: 4,
      }],
    }],
    nodes: [
      ...buildBoneNodes(),
      { mesh: 0, name: "GoldenHumanoidMesh", skin: 0 },
    ],
    scene: 0,
    scenes: [{ name: "GoldenHumanoidScene", nodes: [0, meshNodeIndex] }],
    skins: [{
      inverseBindMatrices: inverseBindAccessor,
      joints: BIPED_BONE_IDS.map((_, index) => index),
      name: "GoldenHumanoidSkeleton",
      skeleton: 0,
    }],
  };
  const bytes = assembleGlb(document, binaryChunk);
  const inventory: GoldenHumanoidInventoryV1 = {
    byteLength: bytes.byteLength,
    contentHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    meshCount: 1,
    vertexCount: mesh.positions.length / 3,
    triangleCount: mesh.indices.length / 3,
    skeletonCount: 1,
    boneCount: 18,
    animationClipNames: ["idle", "jump", "run", "walk"],
  };
  return { bytes, inventory };
}

function writeFixture(): void {
  const outputPath = fileURLToPath(
    new URL(
      "../../assets/subjects/packages/seedleap/golden-humanoid/v1/extensions/source-archive/original.glb",
      import.meta.url,
    ),
  );
  const fixture = buildGoldenHumanoidGlb();
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, fixture.bytes);
  process.stdout.write(`${JSON.stringify(fixture.inventory, null, 2)}\n`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--write")) {
    throw new Error("Pass --write to generate golden-humanoid.glb");
  }
  writeFixture();
}
