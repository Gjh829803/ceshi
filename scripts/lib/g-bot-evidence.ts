import { createHash } from "node:crypto";

export interface GBotSourceClipTimingV1 {
  readonly sourceClip: string;
  readonly minimumTimeSeconds: number;
  readonly maximumTimeSeconds: number;
  readonly durationSeconds: number;
}

export interface GBotSupportedActionBindingV1 {
  readonly actionId: string;
  readonly sourceClip: string;
}

export interface GBotProductAssetEvidenceV1 {
  readonly schemaVersion: 1;
  readonly subjectAssetRef: string;
  readonly artifactContentHash: string;
  readonly byteLength: number;
  readonly formatVersion: string;
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly jointCount: number;
  readonly uniqueBoneNameCount: number;
  readonly skeletonRootBoneName: string;
  readonly requiredVertexAttributes: readonly string[];
  readonly sourceClipNames: readonly string[];
  readonly sourceClipTimings: readonly GBotSourceClipTimingV1[];
  readonly supportedActionBindings: readonly GBotSupportedActionBindingV1[];
  readonly hasExternalUris: false;
  readonly cameraCount: 0;
  readonly lightCount: 0;
}

interface AssetManifestV1 {
  readonly resourceRef: string;
  readonly runtime: {
    readonly formatVersion: string;
    readonly byteLength: number;
    readonly contentHash: string;
  };
  readonly geometry: {
    readonly meshCount: number;
    readonly vertexCount: number;
    readonly triangleCount: number;
    readonly requiredVertexAttributes: readonly string[];
  };
  readonly rig: {
    readonly rootBone: string;
    readonly jointCount: number;
    readonly requiredActions: readonly string[];
  };
}

interface ActionManifestV1 {
  readonly actions: readonly {
    readonly id: string;
    readonly clip: string;
  }[];
}

interface GltfDocumentV2 {
  readonly asset?: { readonly version?: string };
  readonly accessors?: readonly {
    readonly count?: number;
    readonly min?: readonly number[];
    readonly max?: readonly number[];
  }[];
  readonly animations?: readonly {
    readonly name?: string;
    readonly samplers?: readonly { readonly input?: number }[];
  }[];
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly cameras?: readonly unknown[];
  readonly extensions?: {
    readonly KHR_lights_punctual?: { readonly lights?: readonly unknown[] };
  };
  readonly images?: readonly { readonly uri?: string }[];
  readonly meshes?: readonly {
    readonly primitives?: readonly {
      readonly attributes?: Readonly<Record<string, number>>;
      readonly indices?: number;
    }[];
  }[];
  readonly nodes?: readonly {
    readonly name?: string;
    readonly children?: readonly number[];
  }[];
  readonly skins?: readonly { readonly joints?: readonly number[] }[];
}

function fail(code: string): never {
  throw new Error(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAssetManifest(value: unknown): AssetManifestV1 {
  if (!isRecord(value) || !isRecord(value.runtime) || !isRecord(value.geometry) || !isRecord(value.rig)) {
    return fail("G_BOT_ASSET_MANIFEST_INVALID");
  }
  const runtime = value.runtime;
  const geometry = value.geometry;
  const rig = value.rig;
  if (
    typeof value.resourceRef !== "string" ||
    typeof runtime.formatVersion !== "string" ||
    typeof runtime.byteLength !== "number" ||
    typeof runtime.contentHash !== "string" ||
    typeof geometry.meshCount !== "number" ||
    typeof geometry.vertexCount !== "number" ||
    typeof geometry.triangleCount !== "number" ||
    !Array.isArray(geometry.requiredVertexAttributes) ||
    !geometry.requiredVertexAttributes.every((attribute) => typeof attribute === "string") ||
    typeof rig.rootBone !== "string" ||
    typeof rig.jointCount !== "number" ||
    !Array.isArray(rig.requiredActions) ||
    !rig.requiredActions.every((actionId) => typeof actionId === "string")
  ) {
    return fail("G_BOT_ASSET_MANIFEST_INVALID");
  }
  return value as unknown as AssetManifestV1;
}

function parseActionManifest(value: unknown): ActionManifestV1 {
  if (
    !isRecord(value) ||
    !Array.isArray(value.actions) ||
    !value.actions.every(
      (action) =>
        isRecord(action) && typeof action.id === "string" && typeof action.clip === "string",
    )
  ) {
    return fail("G_BOT_ACTION_MANIFEST_INVALID");
  }
  return value as unknown as ActionManifestV1;
}

function parseGlbDocument(bytes: Uint8Array): GltfDocumentV2 {
  if (bytes.byteLength < 20) return fail("G_BOT_GLB_INVALID");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  ) {
    return fail("G_BOT_GLB_INVALID");
  }
  const jsonByteLength = view.getUint32(12, true);
  const jsonEnd = 20 + jsonByteLength;
  if (jsonEnd > bytes.byteLength) return fail("G_BOT_GLB_INVALID");
  try {
    const sourceText = new TextDecoder()
      .decode(bytes.subarray(20, jsonEnd))
      .replace(/[\u0000 ]+$/u, "");
    return JSON.parse(sourceText) as GltfDocumentV2;
  } catch {
    return fail("G_BOT_GLB_INVALID");
  }
}

function exactOrderedStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function accessorCount(document: GltfDocumentV2, index: number | undefined): number {
  const count = index === undefined ? undefined : document.accessors?.[index]?.count;
  if (!Number.isSafeInteger(count) || count === undefined || count < 0) {
    return fail("G_BOT_GLB_INVENTORY_INVALID");
  }
  return count;
}

function clipTiming(
  document: GltfDocumentV2,
  animation: NonNullable<GltfDocumentV2["animations"]>[number],
  sourceClip: string,
): GBotSourceClipTimingV1 {
  const inputIndexes = new Set(animation.samplers?.map((sampler) => sampler.input));
  if (inputIndexes.size === 0 || inputIndexes.has(undefined)) {
    return fail("G_BOT_GLB_ANIMATION_TIMING_INVALID");
  }
  let minimumTimeSeconds = Number.POSITIVE_INFINITY;
  let maximumTimeSeconds = Number.NEGATIVE_INFINITY;
  for (const inputIndex of inputIndexes as Set<number>) {
    const accessor = document.accessors?.[inputIndex];
    const minimum = accessor?.min?.[0];
    const maximum = accessor?.max?.[0];
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
      return fail("G_BOT_GLB_ANIMATION_TIMING_INVALID");
    }
    minimumTimeSeconds = Math.min(minimumTimeSeconds, minimum!);
    maximumTimeSeconds = Math.max(maximumTimeSeconds, maximum!);
  }
  if (maximumTimeSeconds <= minimumTimeSeconds) {
    return fail("G_BOT_GLB_ANIMATION_TIMING_INVALID");
  }
  return {
    sourceClip,
    minimumTimeSeconds,
    maximumTimeSeconds,
    durationSeconds: maximumTimeSeconds - minimumTimeSeconds,
  };
}

export function inspectGBotProductAssetEvidence(options: {
  readonly glbBytes: Uint8Array;
  readonly assetManifest: unknown;
  readonly actionManifest: unknown;
}): GBotProductAssetEvidenceV1 {
  const assetManifest = parseAssetManifest(options.assetManifest);
  const actionManifest = parseActionManifest(options.actionManifest);
  const artifactContentHash = `sha256:${createHash("sha256")
    .update(options.glbBytes)
    .digest("hex")}`;
  if (artifactContentHash !== assetManifest.runtime.contentHash) {
    return fail("G_BOT_ASSET_CONTENT_HASH_MISMATCH");
  }
  if (options.glbBytes.byteLength !== assetManifest.runtime.byteLength) {
    return fail("G_BOT_ASSET_BYTE_LENGTH_MISMATCH");
  }

  const document = parseGlbDocument(options.glbBytes);
  if (document.asset?.version !== assetManifest.runtime.formatVersion) {
    return fail("G_BOT_GLB_FORMAT_VERSION_MISMATCH");
  }
  const meshes = document.meshes ?? [];
  if (meshes.length !== assetManifest.geometry.meshCount) {
    return fail("G_BOT_GLB_MESH_COUNT_MISMATCH");
  }
  let vertexCount = 0;
  let triangleCount = 0;
  const requiredVertexAttributes = [...assetManifest.geometry.requiredVertexAttributes].sort();
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      const attributes = Object.keys(primitive.attributes ?? {}).sort();
      if (!requiredVertexAttributes.every((attribute) => attributes.includes(attribute))) {
        return fail("G_BOT_GLB_VERTEX_ATTRIBUTES_MISMATCH");
      }
      vertexCount += accessorCount(document, primitive.attributes?.POSITION);
      const indexCount = accessorCount(document, primitive.indices);
      if (indexCount % 3 !== 0) return fail("G_BOT_GLB_TRIANGLE_COUNT_INVALID");
      triangleCount += indexCount / 3;
    }
  }
  if (
    vertexCount !== assetManifest.geometry.vertexCount ||
    triangleCount !== assetManifest.geometry.triangleCount
  ) {
    return fail("G_BOT_GLB_GEOMETRY_COUNT_MISMATCH");
  }

  if (document.skins?.length !== 1) return fail("G_BOT_GLB_SKIN_COUNT_INVALID");
  const jointIndexes = document.skins[0]?.joints ?? [];
  const boneNames = jointIndexes.map((jointIndex) => document.nodes?.[jointIndex]?.name);
  if (
    jointIndexes.length !== assetManifest.rig.jointCount ||
    boneNames.some((name) => typeof name !== "string" || name.length === 0) ||
    new Set(boneNames).size !== boneNames.length
  ) {
    return fail("G_BOT_GLB_BONE_INVENTORY_MISMATCH");
  }
  const jointIndexSet = new Set(jointIndexes);
  const childJointIndexes = new Set(
    jointIndexes.flatMap((jointIndex) =>
      (document.nodes?.[jointIndex]?.children ?? []).filter((childIndex) => jointIndexSet.has(childIndex)),
    ),
  );
  const rootJointIndexes = jointIndexes.filter((jointIndex) => !childJointIndexes.has(jointIndex));
  if (
    rootJointIndexes.length !== 1 ||
    document.nodes?.[rootJointIndexes[0]!]?.name !== assetManifest.rig.rootBone
  ) {
    return fail("G_BOT_GLB_SKELETON_ROOT_MISMATCH");
  }

  const animations = document.animations ?? [];
  const sourceClipNames = animations.map((animation) => animation.name);
  if (
    sourceClipNames.some((name) => typeof name !== "string" || name.length === 0) ||
    new Set(sourceClipNames).size !== sourceClipNames.length
  ) {
    return fail("G_BOT_GLB_ANIMATION_INVENTORY_INVALID");
  }
  const manifestSourceClipNames = actionManifest.actions.map((action) => action.clip);
  if (!exactOrderedStrings(sourceClipNames as string[], manifestSourceClipNames)) {
    return fail("G_BOT_ACTION_MANIFEST_CLIP_MISMATCH");
  }
  const actionById = new Map(actionManifest.actions.map((action) => [action.id, action]));
  const supportedActionBindings = assetManifest.rig.requiredActions.map((actionId) => {
    const action = actionById.get(actionId);
    if (action === undefined) return fail("G_BOT_REQUIRED_ACTION_MISSING");
    return { actionId, sourceClip: action.clip };
  });
  if (new Set(assetManifest.rig.requiredActions).size !== assetManifest.rig.requiredActions.length) {
    return fail("G_BOT_REQUIRED_ACTION_DUPLICATE");
  }

  const externalUris = [
    ...(document.buffers?.map((buffer) => buffer.uri) ?? []),
    ...(document.images?.map((image) => image.uri) ?? []),
  ].filter((uri): uri is string => typeof uri === "string" && uri.length > 0);
  const cameraCount = document.cameras?.length ?? 0;
  const lightCount = document.extensions?.KHR_lights_punctual?.lights?.length ?? 0;
  if (externalUris.length > 0 || cameraCount > 0 || lightCount > 0) {
    return fail("G_BOT_GLB_FORBIDDEN_CONTENT");
  }

  return {
    schemaVersion: 1,
    subjectAssetRef: assetManifest.resourceRef,
    artifactContentHash,
    byteLength: options.glbBytes.byteLength,
    formatVersion: document.asset.version,
    meshCount: meshes.length,
    vertexCount,
    triangleCount,
    jointCount: jointIndexes.length,
    uniqueBoneNameCount: new Set(boneNames).size,
    skeletonRootBoneName: assetManifest.rig.rootBone,
    requiredVertexAttributes,
    sourceClipNames: sourceClipNames as string[],
    sourceClipTimings: animations.map((animation, index) =>
      clipTiming(document, animation, sourceClipNames[index]!),
    ),
    supportedActionBindings,
    hasExternalUris: false,
    cameraCount: 0,
    lightCount: 0,
  };
}
