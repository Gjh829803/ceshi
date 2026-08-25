import { createHash } from "node:crypto";

import {
  Accessor,
  Logger,
  NodeIO,
  PropertyType,
  type Animation,
  type Document,
  type Material,
  type Node,
  type Property,
  type Skin,
} from "@gltf-transform/core";
import { cloneDocument, prune } from "@gltf-transform/functions";

const IO = new NodeIO().setLogger(new Logger(Logger.Verbosity.SILENT));
const TEXT_ENCODER = new TextEncoder();
const SHA256_PREFIX = "sha256:";
const STANDARD_GLTF_TOP_LEVEL_KEYS = new Set([
  "accessors",
  "animations",
  "asset",
  "buffers",
  "bufferViews",
  "cameras",
  "extensions",
  "extensionsRequired",
  "extensionsUsed",
  "extras",
  "images",
  "materials",
  "meshes",
  "nodes",
  "samplers",
  "scene",
  "scenes",
  "skins",
  "textures",
]);

export interface ModularSubjectActionDefinitionV1 {
  readonly actionId: string;
  readonly sourceClipName: string;
  readonly loopMode: "repeat" | "once";
  readonly playbackSpeedRatio: number;
  readonly blendDurationSeconds: number;
  readonly rootMotionMode: "in-place";
}

export interface ModularSubjectPackageDefinitionV1 {
  readonly id: string;
  readonly version: number;
  readonly creatorId: string;
  readonly displayName: string;
  readonly sourceGlbRelativePath: string;
  readonly expectedSourceContentHash: `sha256:${string}`;
  readonly rigProfileRef: string;
  readonly provenanceMode: "derived-recovery" | "generated-fixture";
  readonly actions: readonly ModularSubjectActionDefinitionV1[];
}

export interface ModularSubjectAnimationInventoryV1 {
  readonly name: string;
  readonly durationSeconds: number;
}

export interface ModularSubjectGlbInventoryV1 {
  readonly meshCount: number;
  readonly skinCount: number;
  readonly skeletonCount: number;
  readonly jointCount: number;
  readonly nodeCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly imageCount: number;
  readonly animationClipCount: number;
  readonly animationClips: readonly ModularSubjectAnimationInventoryV1[];
  readonly cameraCount: number;
  readonly lightCount: number;
  readonly externalUris: readonly string[];
  readonly rigSignatureHash: `sha256:${string}` | null;
}

export interface SubjectArtifactV1 {
  readonly relativePath: string;
  readonly mediaType: "model/gltf-binary";
  readonly byteLengthBytes: number;
  readonly contentHash: `sha256:${string}`;
}

export interface SubjectProvenanceV1 {
  readonly mode: "derived-recovery" | "generated-fixture";
  readonly sourceGlbRelativePath: string;
  readonly sourceContentHash: `sha256:${string}`;
}

export interface SubjectModelAssetManifestV1 {
  readonly kind: "subject-model-asset";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly artifact: SubjectArtifactV1;
  readonly provenance: SubjectProvenanceV1;
  readonly coordinateConvention: {
    readonly units: "meters";
    readonly upAxis: "+Y";
    readonly forwardAxis: "-Z";
    readonly pivot: "support-center";
  };
  readonly inventory: ModularSubjectGlbInventoryV1;
  readonly materialSlotIds: readonly string[];
  readonly rigProfileRef: string;
  readonly rigSignatureHash: `sha256:${string}` | null;
}

export interface MaterialTextureBindingV1 {
  readonly channel:
    | "base-color"
    | "metallic-roughness"
    | "normal"
    | "occlusion"
    | "emissive";
  readonly sourceName: string;
  readonly sourceMimeType: string;
  readonly sourceContentHash: `sha256:${string}`;
  readonly byteLengthBytes: number;
}

export interface MaterialSlotDefinitionV1 {
  readonly materialSlotId: string;
  readonly sourceMaterialName: string;
  readonly baseColorFactor: readonly [number, number, number, number];
  readonly metallicFactor: number;
  readonly roughnessFactor: number;
  readonly emissiveFactor: readonly [number, number, number];
  readonly alphaMode: "OPAQUE" | "MASK" | "BLEND";
  readonly alphaCutoff: number;
  readonly isDoubleSided: boolean;
  readonly textures: readonly MaterialTextureBindingV1[];
}

export interface MaterialSetManifestV1 {
  readonly kind: "material-set";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly variantId: "default";
  readonly provenance: SubjectProvenanceV1;
  readonly materials: readonly MaterialSlotDefinitionV1[];
}

export interface AnimationClipManifestV1 {
  readonly kind: "animation-clip";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly artifact: SubjectArtifactV1;
  readonly provenance: SubjectProvenanceV1;
  readonly rigProfileRef: string;
  readonly rigSignatureHash: `sha256:${string}`;
  readonly actionId: string;
  readonly sourceClipName: string;
  readonly durationSeconds: number;
  readonly loopMode: "repeat" | "once";
  readonly playbackSpeedRatio: number;
  readonly blendDurationSeconds: number;
  readonly rootMotionMode: "in-place";
}

export interface SubjectSourcePackageManifestV1 {
  readonly kind: "subject-source-package";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly creatorId: string;
  readonly displayName: string;
  readonly resourceRef: string;
  readonly sourceGlbRelativePath: string;
  readonly sourceContentHash: `sha256:${string}`;
  readonly modelRef: string;
  readonly materialSetRef: string;
  readonly rigProfileRef: string;
  readonly sourceArchiveRef: string;
  readonly animationClips: readonly {
    readonly actionId: string;
    readonly animationClipRef: string;
  }[];
}

export interface SubjectSourceExtensionResidueInventoryV1 {
  readonly cameraCount: number;
  readonly lightCount: number;
  readonly extensionsUsed: readonly string[];
  readonly extensionsRequired: readonly string[];
  readonly extensionNames: readonly string[];
  readonly extrasPropertyCount: number;
  readonly unknownTopLevelKeys: readonly string[];
  readonly hasOtherNonStandardContent: boolean;
}

export interface SubjectSourceArchiveManifestV1 {
  readonly kind: "subject-source-archive";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly artifact: SubjectArtifactV1;
  readonly provenance: SubjectProvenanceV1;
  readonly runtimeConsumption: "forbidden";
  readonly residueInventory: SubjectSourceExtensionResidueInventoryV1;
}

export interface RecoveredSubjectSourceArchiveV1 {
  readonly glbRelativePath: "extensions/source-archive/original.glb";
  readonly manifestRelativePath: "extensions/source-archive/original.manifest.json";
  readonly glbBytes: Uint8Array;
  readonly manifest: SubjectSourceArchiveManifestV1;
  readonly manifestBytes: Uint8Array;
}

export interface RecoveredSubjectModelV1 {
  readonly glbRelativePath: "model/model.glb";
  readonly manifestRelativePath: "model/model.manifest.json";
  readonly glbBytes: Uint8Array;
  readonly inventory: ModularSubjectGlbInventoryV1;
  readonly manifest: SubjectModelAssetManifestV1;
  readonly manifestBytes: Uint8Array;
}

export interface RecoveredMaterialSetV1 {
  readonly manifestRelativePath: "materials/default/material-set.manifest.json";
  readonly manifest: MaterialSetManifestV1;
  readonly manifestBytes: Uint8Array;
}

export interface RecoveredAnimationClipV1 {
  readonly actionId: string;
  readonly glbRelativePath: string;
  readonly manifestRelativePath: string;
  readonly glbBytes: Uint8Array;
  readonly inventory: ModularSubjectGlbInventoryV1;
  readonly manifest: AnimationClipManifestV1;
  readonly manifestBytes: Uint8Array;
}

export interface RecoveredSubjectSourcePackageV1 {
  readonly packageManifestRelativePath: "package.manifest.json";
  readonly packageManifest: SubjectSourcePackageManifestV1;
  readonly packageManifestBytes: Uint8Array;
  readonly model: RecoveredSubjectModelV1;
  readonly materialSet: RecoveredMaterialSetV1;
  readonly animationClips: readonly RecoveredAnimationClipV1[];
  readonly sourceArchive: RecoveredSubjectSourceArchiveV1;
}

export interface RecoverModularSubjectSourcePackageInputV1 {
  readonly definition: ModularSubjectPackageDefinitionV1;
  readonly sourceGlbBytes: Uint8Array;
}

interface RawGlbJsonV2 {
  readonly extensionsUsed?: readonly unknown[];
  readonly extensionsRequired?: readonly unknown[];
  readonly buffers?: readonly { readonly uri?: unknown }[];
  readonly images?: readonly { readonly uri?: unknown }[];
  readonly textures?: readonly unknown[];
  readonly nodes?: readonly {
    readonly matrix?: unknown;
    readonly translation?: unknown;
    readonly rotation?: unknown;
    readonly scale?: unknown;
  }[];
  readonly extensions?: {
    readonly KHR_lights_punctual?: { readonly lights?: readonly unknown[] };
  };
  readonly [key: string]: unknown;
}

interface InspectedDocumentV1 {
  readonly document: Document;
  readonly inventory: ModularSubjectGlbInventoryV1;
}

function fail(code: string, detail?: string): never {
  throw new Error(detail === undefined ? code : `${code}: ${detail}`);
}

function isModularSubjectError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("MODULAR_SUBJECT_SOURCE_");
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `${SHA256_PREFIX}${createHash("sha256").update(bytes).digest("hex")}`;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, child]) => [key, sortJsonKeys(child)]),
    );
  }
  return value;
}

export function canonicalSubjectManifestBytes(value: unknown): Uint8Array {
  return TEXT_ENCODER.encode(`${JSON.stringify(sortJsonKeys(value))}\n`);
}

function parseRawGlbJson(bytes: Uint8Array): RawGlbJsonV2 {
  if (bytes.byteLength < 20) {
    return fail("MODULAR_SUBJECT_SOURCE_GLB_INVALID");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_GLB_INVALID");
  }
  const jsonByteLength = view.getUint32(12, true);
  const jsonEnd = 20 + jsonByteLength;
  if (jsonEnd > bytes.byteLength) {
    return fail("MODULAR_SUBJECT_SOURCE_GLB_INVALID");
  }
  try {
    const jsonText = new TextDecoder()
      .decode(bytes.subarray(20, jsonEnd))
      .replace(/[\u0000 ]+$/u, "");
    return JSON.parse(jsonText) as RawGlbJsonV2;
  } catch {
    return fail("MODULAR_SUBJECT_SOURCE_GLB_INVALID");
  }
}

function validateRawNodeTransforms(raw: RawGlbJsonV2): void {
  for (const [nodeIndex, node] of (raw.nodes ?? []).entries()) {
    for (const [field, expectedLength] of [
      ["matrix", 16],
      ["translation", 3],
      ["rotation", 4],
      ["scale", 3],
    ] as const) {
      const value = node[field];
      if (value === undefined) continue;
      if (
        !Array.isArray(value) ||
        value.length !== expectedLength ||
        !value.every((row) => typeof row === "number" && Number.isFinite(row))
      ) {
        return fail(
          "MODULAR_SUBJECT_SOURCE_NON_FINITE_TRANSFORM",
          `node ${nodeIndex} ${field}`,
        );
      }
    }
  }
}

function externalUris(raw: RawGlbJsonV2): string[] {
  const rows = [...(raw.buffers ?? []), ...(raw.images ?? [])]
    .map((row) => row.uri)
    .filter((uri): uri is string => typeof uri === "string" && uri.length > 0);
  return [...new Set(rows)].sort();
}

function stringArray(value: readonly unknown[] | undefined): string[] {
  return (value ?? [])
    .filter((row): row is string => typeof row === "string")
    .sort();
}

function collectNonStandardJsonFacts(value: unknown): {
  readonly extensionNames: string[];
  readonly extrasPropertyCount: number;
} {
  const extensionNames = new Set<string>();
  let extrasPropertyCount = 0;
  const visit = (row: unknown): void => {
    if (Array.isArray(row)) {
      row.forEach(visit);
      return;
    }
    if (row === null || typeof row !== "object") return;
    const record = row as Record<string, unknown>;
    if (record.extras !== undefined) extrasPropertyCount += 1;
    if (record.extensions !== null && typeof record.extensions === "object") {
      Object.keys(record.extensions as Record<string, unknown>).forEach((name) => {
        extensionNames.add(name);
      });
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return {
    extensionNames: [...extensionNames].sort(),
    extrasPropertyCount,
  };
}

function extensionResidueInventory(
  raw: RawGlbJsonV2,
): SubjectSourceExtensionResidueInventoryV1 {
  const extensionsUsed = stringArray(raw.extensionsUsed);
  const extensionsRequired = stringArray(raw.extensionsRequired);
  const { extensionNames, extrasPropertyCount } = collectNonStandardJsonFacts(raw);
  const unknownTopLevelKeys = Object.keys(raw)
    .filter((key) => !STANDARD_GLTF_TOP_LEVEL_KEYS.has(key))
    .sort();
  const cameraCount = Array.isArray(raw.cameras) ? raw.cameras.length : 0;
  const lightCount = raw.extensions?.KHR_lights_punctual?.lights?.length ?? 0;
  return {
    cameraCount,
    lightCount,
    extensionsUsed,
    extensionsRequired,
    extensionNames,
    extrasPropertyCount,
    unknownTopLevelKeys,
    hasOtherNonStandardContent: unknownTopLevelKeys.length > 0,
  };
}

function finiteArray(array: ArrayLike<number> | null): boolean {
  if (array === null) return false;
  for (let index = 0; index < array.length; index += 1) {
    if (!Number.isFinite(array[index])) return false;
  }
  return true;
}

function animationDuration(animation: Animation): number {
  let minimumTimeSeconds = Number.POSITIVE_INFINITY;
  let maximumTimeSeconds = Number.NEGATIVE_INFINITY;
  if (animation.listChannels().length === 0 || animation.listSamplers().length === 0) {
    return fail("MODULAR_SUBJECT_SOURCE_ZERO_DURATION_CLIP", animation.getName());
  }
  for (const channel of animation.listChannels()) {
    const targetPath = channel.getTargetPath();
    if (!targetPath || !["translation", "rotation", "scale"].includes(targetPath)) {
      return fail(
        "MODULAR_SUBJECT_SOURCE_ANIMATION_TARGET_UNSUPPORTED",
        `${animation.getName()}:${targetPath ?? "missing"}`,
      );
    }
    if (channel.getTargetNode() === null || channel.getSampler() === null) {
      return fail("MODULAR_SUBJECT_SOURCE_ANIMATION_TARGET_INVALID", animation.getName());
    }
  }
  for (const sampler of animation.listSamplers()) {
    if (!(["STEP", "LINEAR", "CUBICSPLINE"] as const).includes(sampler.getInterpolation())) {
      return fail(
        "MODULAR_SUBJECT_SOURCE_ANIMATION_INTERPOLATION_UNSUPPORTED",
        `${animation.getName()}:${sampler.getInterpolation()}`,
      );
    }
    const input = sampler.getInput();
    const output = sampler.getOutput();
    if (
      input === null ||
      input.getType() !== Accessor.Type.SCALAR ||
      !finiteArray(input.getArray()) ||
      !finiteArray(output?.getArray() ?? null)
    ) {
      return fail("MODULAR_SUBJECT_SOURCE_NON_FINITE_TRANSFORM", animation.getName());
    }
    for (let index = 0; index < input.getCount(); index += 1) {
      const timeSeconds = input.getScalar(index);
      minimumTimeSeconds = Math.min(minimumTimeSeconds, timeSeconds);
      maximumTimeSeconds = Math.max(maximumTimeSeconds, timeSeconds);
    }
  }
  const durationSeconds = maximumTimeSeconds - minimumTimeSeconds;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return fail("MODULAR_SUBJECT_SOURCE_ZERO_DURATION_CLIP", animation.getName());
  }
  return durationSeconds;
}

function fullNodePath(node: Node): string {
  const path: string[] = [];
  let current: Node | null = node;
  while (current !== null) {
    path.push(current.getName());
    current = current.getParentNode();
  }
  return path.reverse().join("/");
}

function inverseBindMatrixRows(skin: Skin): readonly number[][] {
  const joints = skin.listJoints();
  const accessor = skin.getInverseBindMatrices();
  if (accessor === null) {
    return joints.map(() => [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  }
  if (
    accessor.getType() !== Accessor.Type.MAT4 ||
    accessor.getCount() !== joints.length ||
    !finiteArray(accessor.getArray())
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_INVERSE_BIND_MATRICES_INVALID");
  }
  return joints.map((_, index) => accessor.getElement(index, []));
}

function rigSignatureHash(skin: Skin): `sha256:${string}` {
  const inverseBindMatrices = inverseBindMatrixRows(skin);
  const signature = skin.listJoints().map((joint, index) => ({
    fullPath: fullNodePath(joint),
    inverseBindMatrix: inverseBindMatrices[index],
    parentPath: joint.getParentNode() === null ? null : fullNodePath(joint.getParentNode()!),
    rotation: [...joint.getRotation()],
    scale: [...joint.getScale()],
    translation: [...joint.getTranslation()],
  }));
  return sha256(canonicalSubjectManifestBytes(signature));
}

function validateUniqueJointRoot(skin: Skin): void {
  const joints = skin.listJoints();
  const jointSet = new Set(joints);
  const jointRoots = joints.filter((joint) => {
    const parent = joint.getParentNode();
    return parent === null || !jointSet.has(parent);
  });
  if (joints.length === 0 || jointRoots.length !== 1) {
    return fail("MODULAR_SUBJECT_SOURCE_RIG_INVALID");
  }
}

function validateNodeTransforms(document: Document): void {
  for (const node of document.getRoot().listNodes()) {
    if (
      !finiteArray(node.getTranslation()) ||
      !finiteArray(node.getRotation()) ||
      !finiteArray(node.getScale())
    ) {
      return fail("MODULAR_SUBJECT_SOURCE_NON_FINITE_TRANSFORM", node.getName());
    }
  }
}

async function inspectDocument(bytes: Uint8Array): Promise<InspectedDocumentV1> {
  const raw = parseRawGlbJson(bytes);
  validateRawNodeTransforms(raw);
  const uris = externalUris(raw);
  if (uris.length > 0) {
    return fail("MODULAR_SUBJECT_SOURCE_EXTERNAL_URI", uris.join(","));
  }

  let document: Document;
  try {
    document = await IO.readBinary(bytes);
  } catch (error) {
    if (isModularSubjectError(error)) throw error;
    return fail(
      "MODULAR_SUBJECT_SOURCE_GLB_INVALID",
      error instanceof Error ? error.message : String(error),
    );
  }
  validateNodeTransforms(document);
  const root = document.getRoot();
  const skins = root.listSkins();
  if (skins.length > 1) {
    return fail("MODULAR_SUBJECT_SOURCE_RIG_COUNT_INVALID", String(skins.length));
  }
  const skin = skins[0];
  if (skin !== undefined) validateUniqueJointRoot(skin);

  const animations = root.listAnimations();
  const animationNames = animations.map((animation) => animation.getName());
  const duplicateAnimationNames = animationNames.filter(
    (name, index) => animationNames.indexOf(name) !== index,
  );
  if (duplicateAnimationNames.length > 0) {
    return fail(
      "MODULAR_SUBJECT_SOURCE_SOURCE_CLIP_DUPLICATE",
      [...new Set(duplicateAnimationNames)].sort().join(","),
    );
  }
  if (animationNames.some((name) => name.length === 0)) {
    return fail("MODULAR_SUBJECT_SOURCE_SOURCE_CLIP_NAME_INVALID");
  }
  const animationClips = animations.map((animation) => ({
    name: animation.getName(),
    durationSeconds: animationDuration(animation),
  }));

  return {
    document,
    inventory: {
      meshCount: root.listMeshes().length,
      skinCount: skins.length,
      skeletonCount: skins.length,
      jointCount: skin?.listJoints().length ?? 0,
      nodeCount: root.listNodes().length,
      materialCount: root.listMaterials().length,
      textureCount: raw.textures?.length ?? 0,
      imageCount: raw.images?.length ?? 0,
      animationClipCount: animations.length,
      animationClips,
      cameraCount: root.listCameras().length,
      lightCount: raw.extensions?.KHR_lights_punctual?.lights?.length ?? 0,
      externalUris: uris,
      rigSignatureHash: skin === undefined ? null : rigSignatureHash(skin),
    },
  };
}

export async function inspectModularSubjectGlb(
  bytes: Uint8Array,
): Promise<ModularSubjectGlbInventoryV1> {
  return (await inspectDocument(bytes)).inventory;
}

function validateDefinition(definition: ModularSubjectPackageDefinitionV1): void {
  const actionIds = definition.actions.map((action) => action.actionId);
  const sourceClipNames = definition.actions.map((action) => action.sourceClipName);
  const duplicateActionIds = actionIds.filter((id, index) => actionIds.indexOf(id) !== index);
  if (duplicateActionIds.length > 0) {
    return fail(
      "MODULAR_SUBJECT_SOURCE_ACTION_ID_DUPLICATE",
      [...new Set(duplicateActionIds)].sort().join(","),
    );
  }
  const duplicateSourceClips = sourceClipNames.filter(
    (name, index) => sourceClipNames.indexOf(name) !== index,
  );
  if (duplicateSourceClips.length > 0) {
    return fail(
      "MODULAR_SUBJECT_SOURCE_SOURCE_CLIP_MAPPING_DUPLICATE",
      [...new Set(duplicateSourceClips)].sort().join(","),
    );
  }
  for (const action of definition.actions) {
    if (
      action.actionId.length === 0 ||
      action.sourceClipName.length === 0 ||
      !Number.isFinite(action.playbackSpeedRatio) ||
      action.playbackSpeedRatio <= 0 ||
      !Number.isFinite(action.blendDurationSeconds) ||
      action.blendDurationSeconds < 0
    ) {
      return fail("MODULAR_SUBJECT_SOURCE_ACTION_DEFINITION_INVALID", action.actionId);
    }
  }
}

function validateActionCoverage(
  definition: ModularSubjectPackageDefinitionV1,
  inventory: ModularSubjectGlbInventoryV1,
): void {
  if (inventory.skinCount === 0 && definition.actions.length > 0) {
    return fail("MODULAR_SUBJECT_SOURCE_STATIC_ACTIONS_UNSUPPORTED");
  }
  const actualNames = inventory.animationClips.map((clip) => clip.name);
  const configuredNames = definition.actions.map((action) => action.sourceClipName);
  const missing = configuredNames.filter((name) => !actualNames.includes(name)).sort();
  if (missing.length > 0) {
    return fail("MODULAR_SUBJECT_SOURCE_CONFIGURED_CLIP_MISSING", missing.join(","));
  }
  const unexpected = actualNames.filter((name) => !configuredNames.includes(name)).sort();
  if (unexpected.length > 0) {
    return fail("MODULAR_SUBJECT_SOURCE_UNMAPPED_SOURCE_CLIP", unexpected.join(","));
  }
}

function slugMaterialName(name: string, index: number): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return slug.length > 0 ? slug : `material-${index + 1}`;
}

function materialSlotIds(materials: readonly Material[]): string[] {
  const seen = new Map<string, number>();
  return materials.map((material, index) => {
    const base = slugMaterialName(material.getName(), index);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}

function tuple3(value: ArrayLike<number>): [number, number, number] {
  return [value[0]!, value[1]!, value[2]!];
}

function tuple4(value: ArrayLike<number>): [number, number, number, number] {
  return [value[0]!, value[1]!, value[2]!, value[3]!];
}

function materialTextureBindings(material: Material): MaterialTextureBindingV1[] {
  const rows = [
    ["base-color", material.getBaseColorTexture()],
    ["metallic-roughness", material.getMetallicRoughnessTexture()],
    ["normal", material.getNormalTexture()],
    ["occlusion", material.getOcclusionTexture()],
    ["emissive", material.getEmissiveTexture()],
  ] as const;
  return rows.flatMap(([channel, texture]) => {
    if (texture === null) return [];
    const image = texture.getImage();
    if (image === null) {
      return fail("MODULAR_SUBJECT_SOURCE_TEXTURE_IMAGE_MISSING", texture.getName());
    }
    return [{
      channel,
      sourceName: texture.getName(),
      sourceMimeType: texture.getMimeType(),
      sourceContentHash: sha256(image),
      byteLengthBytes: image.byteLength,
    }];
  });
}

function makeMaterialSetManifest(
  definition: ModularSubjectPackageDefinitionV1,
  sourceContentHash: `sha256:${string}`,
  materials: readonly Material[],
  slotIds: readonly string[],
): MaterialSetManifestV1 {
  return {
    kind: "material-set",
    schemaVersion: 1,
    id: `${definition.id}.default`,
    version: definition.version,
    resourceRef: `worldkit://material-set/${definition.creatorId}.${definition.id}.default@${definition.version}`,
    variantId: "default",
    provenance: makeProvenance(definition, sourceContentHash),
    materials: materials.map((material, index) => ({
      materialSlotId: slotIds[index]!,
      sourceMaterialName: material.getName(),
      baseColorFactor: tuple4(material.getBaseColorFactor()),
      metallicFactor: material.getMetallicFactor(),
      roughnessFactor: material.getRoughnessFactor(),
      emissiveFactor: tuple3(material.getEmissiveFactor()),
      alphaMode: material.getAlphaMode(),
      alphaCutoff: material.getAlphaCutoff(),
      isDoubleSided: material.getDoubleSided(),
      textures: materialTextureBindings(material),
    })),
  };
}

function makeProvenance(
  definition: ModularSubjectPackageDefinitionV1,
  sourceContentHash: `sha256:${string}`,
): SubjectProvenanceV1 {
  return {
    mode: definition.provenanceMode,
    sourceGlbRelativePath: definition.sourceGlbRelativePath,
    sourceContentHash,
  };
}

function stripNonStandardContent(document: Document): void {
  const graph = document.getGraph();
  const queue: Property[] = [document.getRoot()];
  const visited = new Set<Property>();
  while (queue.length > 0) {
    const property = queue.shift()!;
    if (visited.has(property)) continue;
    visited.add(property);
    property.setExtras({});
    queue.push(...graph.listChildren(property));
  }
  document.getRoot().listExtensionsUsed().forEach((extension) => extension.dispose());
}

async function recoverModelDocument(source: Document): Promise<Uint8Array> {
  const model = cloneDocument(source);
  stripNonStandardContent(model);
  const root = model.getRoot();
  root.listAnimations().forEach((animation) => animation.dispose());
  root.listNodes().forEach((node) => node.setCamera(null));
  root.listCameras().forEach((camera) => camera.dispose());
  await model.transform(prune({
    propertyTypes: [
      PropertyType.ANIMATION,
      PropertyType.CAMERA,
      PropertyType.ACCESSOR,
      PropertyType.BUFFER,
    ],
  }));
  return IO.writeBinary(model);
}

async function recoverClipDocument(
  source: Document,
  sourceClipName: string,
  actionId: string,
): Promise<Uint8Array> {
  const clip = cloneDocument(source);
  stripNonStandardContent(clip);
  const root = clip.getRoot();
  const selected = root.listAnimations().find((animation) => animation.getName() === sourceClipName);
  if (selected === undefined) {
    return fail("MODULAR_SUBJECT_SOURCE_CONFIGURED_CLIP_MISSING", sourceClipName);
  }
  root.listAnimations().forEach((animation) => {
    if (animation !== selected) animation.dispose();
  });
  selected.setName(actionId);
  root.listNodes().forEach((node) => {
    node.setMesh(null);
    node.setSkin(null);
    node.setCamera(null);
  });
  root.listMeshes().forEach((mesh) => mesh.dispose());
  root.listMaterials().forEach((material) => material.dispose());
  root.listTextures().forEach((texture) => texture.dispose());
  root.listCameras().forEach((camera) => camera.dispose());
  await clip.transform(prune({
    propertyTypes: [
      PropertyType.MESH,
      PropertyType.PRIMITIVE,
      PropertyType.PRIMITIVE_TARGET,
      PropertyType.MATERIAL,
      PropertyType.TEXTURE,
      PropertyType.CAMERA,
      PropertyType.ANIMATION,
      PropertyType.ACCESSOR,
      PropertyType.BUFFER,
    ],
  }));
  return IO.writeBinary(clip);
}

function artifact(
  relativePath: string,
  bytes: Uint8Array,
): SubjectArtifactV1 {
  return {
    relativePath,
    mediaType: "model/gltf-binary",
    byteLengthBytes: bytes.byteLength,
    contentHash: sha256(bytes),
  };
}

export async function recoverModularSubjectSourcePackage(
  input: RecoverModularSubjectSourcePackageInputV1,
): Promise<RecoveredSubjectSourcePackageV1> {
  validateDefinition(input.definition);
  const sourceContentHash = sha256(input.sourceGlbBytes);
  if (sourceContentHash !== input.definition.expectedSourceContentHash) {
    return fail(
      "MODULAR_SUBJECT_SOURCE_CONTENT_HASH_MISMATCH",
      `${input.definition.expectedSourceContentHash} != ${sourceContentHash}`,
    );
  }
  const source = await inspectDocument(input.sourceGlbBytes);
  validateActionCoverage(input.definition, source.inventory);
  const rawSource = parseRawGlbJson(input.sourceGlbBytes);
  const residueInventory = extensionResidueInventory(rawSource);

  const sourceArchiveResourceRef = `worldkit://subject-source-archive/${input.definition.creatorId}.${input.definition.id}@${input.definition.version}`;
  const sourceArchiveManifest: SubjectSourceArchiveManifestV1 = {
    kind: "subject-source-archive",
    schemaVersion: 1,
    id: input.definition.id,
    version: input.definition.version,
    resourceRef: sourceArchiveResourceRef,
    artifact: artifact("extensions/source-archive/original.glb", input.sourceGlbBytes),
    provenance: makeProvenance(input.definition, sourceContentHash),
    runtimeConsumption: "forbidden",
    residueInventory,
  };
  const sourceArchive: RecoveredSubjectSourceArchiveV1 = {
    glbRelativePath: "extensions/source-archive/original.glb",
    manifestRelativePath: "extensions/source-archive/original.manifest.json",
    glbBytes: input.sourceGlbBytes,
    manifest: sourceArchiveManifest,
    manifestBytes: canonicalSubjectManifestBytes(sourceArchiveManifest),
  };

  const sortedActions = [...input.definition.actions].sort((left, right) =>
    compareCodeUnits(left.actionId, right.actionId),
  );
  const sourceMaterials = source.document.getRoot().listMaterials();
  const slotIds = materialSlotIds(sourceMaterials);
  const materialSetManifest = makeMaterialSetManifest(
    input.definition,
    sourceContentHash,
    sourceMaterials,
    slotIds,
  );
  const materialSet: RecoveredMaterialSetV1 = {
    manifestRelativePath: "materials/default/material-set.manifest.json",
    manifest: materialSetManifest,
    manifestBytes: canonicalSubjectManifestBytes(materialSetManifest),
  };

  const modelGlbBytes = await recoverModelDocument(source.document);
  const modelInventory = await inspectModularSubjectGlb(modelGlbBytes);
  const modelResourceRef = `worldkit://subject-model-asset/${input.definition.creatorId}.${input.definition.id}@${input.definition.version}`;
  const modelManifest: SubjectModelAssetManifestV1 = {
    kind: "subject-model-asset",
    schemaVersion: 1,
    id: input.definition.id,
    version: input.definition.version,
    resourceRef: modelResourceRef,
    artifact: artifact("model/model.glb", modelGlbBytes),
    provenance: makeProvenance(input.definition, sourceContentHash),
    coordinateConvention: {
      units: "meters",
      upAxis: "+Y",
      forwardAxis: "-Z",
      pivot: "support-center",
    },
    inventory: modelInventory,
    materialSlotIds: slotIds,
    rigProfileRef: input.definition.rigProfileRef,
    rigSignatureHash: modelInventory.rigSignatureHash,
  };
  const model: RecoveredSubjectModelV1 = {
    glbRelativePath: "model/model.glb",
    manifestRelativePath: "model/model.manifest.json",
    glbBytes: modelGlbBytes,
    inventory: modelInventory,
    manifest: modelManifest,
    manifestBytes: canonicalSubjectManifestBytes(modelManifest),
  };

  const animationClips: RecoveredAnimationClipV1[] = [];
  for (const action of sortedActions) {
    const glbRelativePath = `animations/${action.actionId}/clip.glb`;
    const manifestRelativePath = `animations/${action.actionId}/clip.manifest.json`;
    const glbBytes = await recoverClipDocument(
      source.document,
      action.sourceClipName,
      action.actionId,
    );
    const inventory = await inspectModularSubjectGlb(glbBytes);
    const rigSignature = inventory.rigSignatureHash;
    if (rigSignature === null) {
      return fail("MODULAR_SUBJECT_SOURCE_CLIP_RIG_MISSING", action.actionId);
    }
    const durationSeconds = inventory.animationClips[0]?.durationSeconds;
    if (durationSeconds === undefined) {
      return fail("MODULAR_SUBJECT_SOURCE_ZERO_DURATION_CLIP", action.actionId);
    }
    const clipResourceRef = `worldkit://animation-clip/${input.definition.creatorId}.${input.definition.id}.${action.actionId}@${input.definition.version}`;
    const manifest: AnimationClipManifestV1 = {
      kind: "animation-clip",
      schemaVersion: 1,
      id: `${input.definition.id}.${action.actionId}`,
      version: input.definition.version,
      resourceRef: clipResourceRef,
      artifact: artifact(glbRelativePath, glbBytes),
      provenance: makeProvenance(input.definition, sourceContentHash),
      rigProfileRef: input.definition.rigProfileRef,
      rigSignatureHash: rigSignature,
      actionId: action.actionId,
      sourceClipName: action.sourceClipName,
      durationSeconds,
      loopMode: action.loopMode,
      playbackSpeedRatio: action.playbackSpeedRatio,
      blendDurationSeconds: action.blendDurationSeconds,
      rootMotionMode: action.rootMotionMode,
    };
    animationClips.push({
      actionId: action.actionId,
      glbRelativePath,
      manifestRelativePath,
      glbBytes,
      inventory,
      manifest,
      manifestBytes: canonicalSubjectManifestBytes(manifest),
    });
  }

  const packageManifest: SubjectSourcePackageManifestV1 = {
    kind: "subject-source-package",
    schemaVersion: 1,
    id: input.definition.id,
    version: input.definition.version,
    creatorId: input.definition.creatorId,
    displayName: input.definition.displayName,
    resourceRef: `worldkit://subject-source-package/${input.definition.creatorId}.${input.definition.id}@${input.definition.version}`,
    sourceGlbRelativePath: input.definition.sourceGlbRelativePath,
    sourceContentHash,
    modelRef: modelResourceRef,
    materialSetRef: materialSetManifest.resourceRef,
    rigProfileRef: input.definition.rigProfileRef,
    sourceArchiveRef: sourceArchiveResourceRef,
    animationClips: animationClips.map((clip) => ({
      actionId: clip.actionId,
      animationClipRef: clip.manifest.resourceRef,
    })),
  };
  const recovered: RecoveredSubjectSourcePackageV1 = {
    packageManifestRelativePath: "package.manifest.json",
    packageManifest,
    packageManifestBytes: canonicalSubjectManifestBytes(packageManifest),
    model,
    materialSet,
    animationClips,
    sourceArchive,
  };
  await validateRecoveredSubjectSourcePackage(recovered);
  return recovered;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function validateCanonicalManifest(value: unknown, bytes: Uint8Array, label: string): void {
  if (!equalBytes(canonicalSubjectManifestBytes(value), bytes)) {
    return fail("MODULAR_SUBJECT_SOURCE_MANIFEST_NOT_CANONICAL", label);
  }
}

function validateArtifact(artifactValue: SubjectArtifactV1, bytes: Uint8Array): void {
  if (artifactValue.byteLengthBytes !== bytes.byteLength) {
    return fail("MODULAR_SUBJECT_SOURCE_ARTIFACT_BYTE_LENGTH_MISMATCH", artifactValue.relativePath);
  }
  if (artifactValue.contentHash !== sha256(bytes)) {
    return fail("MODULAR_SUBJECT_SOURCE_ARTIFACT_HASH_MISMATCH", artifactValue.relativePath);
  }
}

function hasExtensionResidue(inventory: SubjectSourceExtensionResidueInventoryV1): boolean {
  return inventory.cameraCount > 0 ||
    inventory.lightCount > 0 ||
    inventory.extensionsUsed.length > 0 ||
    inventory.extensionsRequired.length > 0 ||
    inventory.extensionNames.length > 0 ||
    inventory.extrasPropertyCount > 0 ||
    inventory.hasOtherNonStandardContent;
}

export async function validateRecoveredSubjectSourcePackage(
  recovered: RecoveredSubjectSourcePackageV1,
): Promise<void> {
  validateCanonicalManifest(
    recovered.packageManifest,
    recovered.packageManifestBytes,
    recovered.packageManifestRelativePath,
  );
  validateCanonicalManifest(
    recovered.materialSet.manifest,
    recovered.materialSet.manifestBytes,
    recovered.materialSet.manifestRelativePath,
  );
  validateCanonicalManifest(
    recovered.model.manifest,
    recovered.model.manifestBytes,
    recovered.model.manifestRelativePath,
  );
  validateCanonicalManifest(
    recovered.sourceArchive.manifest,
    recovered.sourceArchive.manifestBytes,
    recovered.sourceArchive.manifestRelativePath,
  );
  validateArtifact(recovered.sourceArchive.manifest.artifact, recovered.sourceArchive.glbBytes);
  const archivedResidue = extensionResidueInventory(
    parseRawGlbJson(recovered.sourceArchive.glbBytes),
  );
  if (
    recovered.sourceArchive.manifest.runtimeConsumption !== "forbidden" ||
    !equalBytes(
      canonicalSubjectManifestBytes(archivedResidue),
      canonicalSubjectManifestBytes(recovered.sourceArchive.manifest.residueInventory),
    )
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_ARCHIVE_CONTRACT_INVALID");
  }

  const modelInventory = await inspectModularSubjectGlb(recovered.model.glbBytes);
  const modelResidue = extensionResidueInventory(parseRawGlbJson(recovered.model.glbBytes));
  if (
    modelInventory.animationClipCount !== 0 ||
    modelInventory.cameraCount !== 0 ||
    modelInventory.lightCount !== 0 ||
    modelInventory.externalUris.length !== 0 ||
    hasExtensionResidue(modelResidue)
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_MODEL_CONTRACT_INVALID");
  }
  if (modelInventory.meshCount > 0 && modelInventory.skinCount !== 1) {
    return fail("MODULAR_SUBJECT_SOURCE_MODEL_RIG_INVALID");
  }
  if (modelInventory.rigSignatureHash !== recovered.model.manifest.rigSignatureHash) {
    return fail("MODULAR_SUBJECT_SOURCE_MODEL_RIG_SIGNATURE_MISMATCH");
  }
  validateArtifact(recovered.model.manifest.artifact, recovered.model.glbBytes);

  const actionIds = recovered.animationClips.map((clip) => clip.actionId);
  if (new Set(actionIds).size !== actionIds.length) {
    return fail("MODULAR_SUBJECT_SOURCE_ACTION_ID_DUPLICATE");
  }
  if (!actionIds.every((actionId, index) => index === 0 || actionIds[index - 1]! < actionId)) {
    return fail("MODULAR_SUBJECT_SOURCE_ACTION_ORDER_INVALID");
  }
  for (const clip of recovered.animationClips) {
    validateCanonicalManifest(clip.manifest, clip.manifestBytes, clip.manifestRelativePath);
    const inventory = await inspectModularSubjectGlb(clip.glbBytes);
    const clipResidue = extensionResidueInventory(parseRawGlbJson(clip.glbBytes));
    if (
      inventory.meshCount !== 0 ||
      inventory.materialCount !== 0 ||
      inventory.textureCount !== 0 ||
      inventory.imageCount !== 0 ||
      inventory.cameraCount !== 0 ||
      inventory.lightCount !== 0 ||
      inventory.externalUris.length !== 0 ||
      inventory.animationClipCount !== 1 ||
      inventory.animationClips[0]?.name !== clip.actionId ||
      hasExtensionResidue(clipResidue)
    ) {
      return fail("MODULAR_SUBJECT_SOURCE_CLIP_CONTRACT_INVALID", clip.actionId);
    }
    if (
      inventory.rigSignatureHash !== recovered.model.manifest.rigSignatureHash ||
      clip.manifest.rigSignatureHash !== recovered.model.manifest.rigSignatureHash
    ) {
      return fail("MODULAR_SUBJECT_SOURCE_RIG_SIGNATURE_MISMATCH", clip.actionId);
    }
    validateArtifact(clip.manifest.artifact, clip.glbBytes);
  }

  const packageActions = recovered.packageManifest.animationClips;
  if (
    packageActions.length !== recovered.animationClips.length ||
    packageActions.some((row, index) =>
      row.actionId !== recovered.animationClips[index]?.actionId ||
      row.animationClipRef !== recovered.animationClips[index]?.manifest.resourceRef
    )
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_PACKAGE_ACTION_SET_MISMATCH");
  }
  if (recovered.packageManifest.sourceArchiveRef !== recovered.sourceArchive.manifest.resourceRef) {
    return fail("MODULAR_SUBJECT_SOURCE_PACKAGE_ARCHIVE_REF_MISMATCH");
  }
}
