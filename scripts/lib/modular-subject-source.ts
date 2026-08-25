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
  type Texture,
  type TypedArray,
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

export interface ModularSubjectSpatialConventionV1 {
  readonly units: "meters";
  readonly upAxis: "+Y";
  readonly forwardAxis: "-Z";
  readonly pivot: "support-center";
}

export type ModularSubjectSpatialReviewV1 =
  | {
      readonly spatialReviewStatus: "verified";
      readonly evidence: {
        readonly kind: "generated-fixture-contract" | "manual-visual-review";
        readonly evidenceRef: string;
      };
    }
  | {
      readonly spatialReviewStatus: "needs-visual-review";
      readonly evidence: {
        readonly kind: "product-sidecar-declaration";
        readonly evidenceRef: string;
      };
    };

export interface ModularSubjectPackageDefinitionV1 {
  readonly id: string;
  readonly version: number;
  readonly creatorId: string;
  readonly displayName: string;
  readonly sourceGlbRelativePath: string;
  readonly expectedSourceContentHash: `sha256:${string}`;
  readonly rigProfileRef: string;
  readonly provenanceMode: "derived-recovery" | "generated-fixture";
  readonly spatialConvention: ModularSubjectSpatialConventionV1;
  readonly spatialReview: ModularSubjectSpatialReviewV1;
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
  readonly inverseBindMatrixCount: number;
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
  readonly spatialConvention: ModularSubjectSpatialConventionV1;
  readonly spatialReview: ModularSubjectSpatialReviewV1;
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
  readonly sourceTextureName: string;
  readonly textureArtifactRef: string;
  readonly textureArtifactRelativePath: string;
}

export type MaterialTextureMediaTypeV1 =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/ktx2"
  | "image/avif";

export interface MaterialTextureArtifactManifestV1 {
  readonly id: string;
  readonly resourceRef: string;
  readonly relativePath: string;
  readonly mediaType: MaterialTextureMediaTypeV1;
  readonly byteLengthBytes: number;
  readonly contentHash: `sha256:${string}`;
}

export interface RecoveredMaterialTextureArtifactV1
  extends MaterialTextureArtifactManifestV1 {
  readonly bytes: Uint8Array;
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
  readonly textureArtifacts: readonly MaterialTextureArtifactManifestV1[];
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
  readonly textureArtifacts: readonly RecoveredMaterialTextureArtifactV1[];
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
      inverseBindMatrixCount: skin?.getInverseBindMatrices()?.getCount() ?? 0,
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
  const spatialConvention = definition.spatialConvention;
  if (
    spatialConvention?.units !== "meters" ||
    spatialConvention.upAxis !== "+Y" ||
    spatialConvention.forwardAxis !== "-Z" ||
    spatialConvention.pivot !== "support-center"
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_SPATIAL_CONVENTION_INVALID");
  }
  const spatialReview = definition.spatialReview;
  const spatialReviewStatus = spatialReview?.spatialReviewStatus as string | undefined;
  const spatialEvidence = spatialReview?.evidence;
  if (
    spatialReview === undefined ||
    spatialEvidence === undefined ||
    spatialEvidence.evidenceRef.length === 0 ||
    !["verified", "needs-visual-review"].includes(spatialReviewStatus ?? "") ||
    (spatialReviewStatus === "verified" &&
      !["generated-fixture-contract", "manual-visual-review"].includes(
        spatialEvidence.kind,
      )) ||
    (spatialReviewStatus === "needs-visual-review" &&
      spatialEvidence.kind !== "product-sidecar-declaration")
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_SPATIAL_REVIEW_INVALID");
  }
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

function validateRiggedModelInventory(
  inventory: ModularSubjectGlbInventoryV1,
  requireMesh: boolean,
): void {
  if (
    (requireMesh && inventory.meshCount < 1) ||
    inventory.skinCount !== 1 ||
    inventory.skeletonCount !== 1 ||
    inventory.jointCount < 1 ||
    inventory.inverseBindMatrixCount !== inventory.jointCount ||
    inventory.rigSignatureHash === null
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_MODEL_RIG_REQUIRED");
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

function textureFileExtension(mediaType: string): string {
  switch (mediaType) {
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    case "image/ktx2": return "ktx2";
    case "image/avif": return "avif";
    default: return fail("MODULAR_SUBJECT_SOURCE_TEXTURE_MIME_UNSUPPORTED", mediaType);
  }
}

function equalTextureBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index]);
}

function recoverTextureArtifacts(
  definition: ModularSubjectPackageDefinitionV1,
  textures: readonly Texture[],
): {
  readonly artifacts: RecoveredMaterialTextureArtifactV1[];
  readonly artifactByTexture: ReadonlyMap<Texture, RecoveredMaterialTextureArtifactV1>;
} {
  const artifactByTexture = new Map<Texture, RecoveredMaterialTextureArtifactV1>();
  const artifactByHash = new Map<string, RecoveredMaterialTextureArtifactV1>();
  for (const texture of textures) {
    const image = texture.getImage();
    if (image === null) {
      return fail("MODULAR_SUBJECT_SOURCE_TEXTURE_IMAGE_MISSING", texture.getName());
    }
    const mediaType = texture.getMimeType() as MaterialTextureMediaTypeV1;
    const extension = textureFileExtension(mediaType);
    const contentHash = sha256(image);
    const hashValue = contentHash.slice(SHA256_PREFIX.length);
    const existing = artifactByHash.get(contentHash);
    if (existing !== undefined) {
      if (!equalTextureBytes(existing.bytes, image)) {
        return fail("MODULAR_SUBJECT_SOURCE_TEXTURE_HASH_COLLISION", contentHash);
      }
      if (existing.mediaType !== mediaType) {
        return fail("MODULAR_SUBJECT_SOURCE_TEXTURE_MIME_CONFLICT", contentHash);
      }
      artifactByTexture.set(texture, existing);
      continue;
    }
    const artifact: RecoveredMaterialTextureArtifactV1 = {
      id: `${definition.id}.texture.${hashValue}`,
      resourceRef:
        `worldkit://texture/${definition.creatorId}.${definition.id}.${hashValue}@${definition.version}`,
      relativePath: `materials/default/textures/${hashValue}.${extension}`,
      mediaType,
      byteLengthBytes: image.byteLength,
      contentHash,
      bytes: Uint8Array.from(image),
    };
    artifactByHash.set(contentHash, artifact);
    artifactByTexture.set(texture, artifact);
  }
  return {
    artifacts: [...artifactByHash.values()].sort((left, right) =>
      compareCodeUnits(left.relativePath, right.relativePath),
    ),
    artifactByTexture,
  };
}

function materialTextureBindings(
  material: Material,
  artifactByTexture: ReadonlyMap<Texture, RecoveredMaterialTextureArtifactV1>,
): MaterialTextureBindingV1[] {
  const rows = [
    ["base-color", material.getBaseColorTexture()],
    ["metallic-roughness", material.getMetallicRoughnessTexture()],
    ["normal", material.getNormalTexture()],
    ["occlusion", material.getOcclusionTexture()],
    ["emissive", material.getEmissiveTexture()],
  ] as const;
  return rows.flatMap(([channel, texture]) => {
    if (texture === null) return [];
    const artifact = artifactByTexture.get(texture);
    if (artifact === undefined) {
      return fail("MODULAR_SUBJECT_SOURCE_TEXTURE_ARTIFACT_MISSING", texture.getName());
    }
    return [{
      channel,
      sourceTextureName: texture.getName(),
      textureArtifactRef: artifact.resourceRef,
      textureArtifactRelativePath: artifact.relativePath,
    }];
  });
}

function makeMaterialSetManifest(
  definition: ModularSubjectPackageDefinitionV1,
  sourceContentHash: `sha256:${string}`,
  materials: readonly Material[],
  slotIds: readonly string[],
  textureArtifacts: readonly RecoveredMaterialTextureArtifactV1[],
  artifactByTexture: ReadonlyMap<Texture, RecoveredMaterialTextureArtifactV1>,
): MaterialSetManifestV1 {
  return {
    kind: "material-set",
    schemaVersion: 1,
    id: `${definition.id}.default`,
    version: definition.version,
    resourceRef: `worldkit://material-set/${definition.creatorId}.${definition.id}.default@${definition.version}`,
    variantId: "default",
    provenance: makeProvenance(definition, sourceContentHash),
    textureArtifacts: textureArtifacts.map(({ bytes: _bytes, ...artifact }) => artifact),
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
      textures: materialTextureBindings(material, artifactByTexture),
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

function copySpatialReview(
  review: ModularSubjectSpatialReviewV1,
): ModularSubjectSpatialReviewV1 {
  if (review.spatialReviewStatus === "verified") {
    return {
      spatialReviewStatus: review.spatialReviewStatus,
      evidence: { ...review.evidence },
    };
  }
  return {
    spatialReviewStatus: review.spatialReviewStatus,
    evidence: { ...review.evidence },
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

function repackAccessorsIntoCompactBuffer(document: Document): void {
  const root = document.getRoot();
  const accessors = root.listAccessors();
  const previousBuffers = root.listBuffers();
  if (accessors.length === 0) {
    previousBuffers.forEach((buffer) => buffer.dispose());
    return;
  }
  const compactBuffer = document.createBuffer("modular-subject-compact");
  accessors.forEach((accessor) => {
    const array = accessor.getArray();
    if (array !== null) accessor.setArray(array.slice() as TypedArray);
    accessor.setBuffer(compactBuffer);
  });
  previousBuffers.forEach((buffer) => buffer.dispose());
}

function disposeAccessorsExcept(document: Document, kept: ReadonlySet<Accessor>): void {
  document.getRoot().listAccessors().forEach((accessor) => {
    if (!kept.has(accessor)) accessor.dispose();
  });
}

function modelAccessors(document: Document): ReadonlySet<Accessor> {
  const kept = new Set<Accessor>();
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      if (indices !== null) kept.add(indices);
      primitive.listSemantics().forEach((semantic) => {
        const accessor = primitive.getAttribute(semantic);
        if (accessor !== null) kept.add(accessor);
      });
      for (const target of primitive.listTargets()) {
        target.listSemantics().forEach((semantic) => {
          const accessor = target.getAttribute(semantic);
          if (accessor !== null) kept.add(accessor);
        });
      }
    }
  }
  document.getRoot().listSkins().forEach((skin) => {
    const inverseBindMatrices = skin.getInverseBindMatrices();
    if (inverseBindMatrices !== null) kept.add(inverseBindMatrices);
  });
  return kept;
}

function clipAccessors(document: Document, animation: Animation): ReadonlySet<Accessor> {
  const kept = new Set<Accessor>();
  animation.listSamplers().forEach((sampler) => {
    const input = sampler.getInput();
    const output = sampler.getOutput();
    if (input !== null) kept.add(input);
    if (output !== null) kept.add(output);
  });
  document.getRoot().listSkins().forEach((skin) => {
    const inverseBindMatrices = skin.getInverseBindMatrices();
    if (inverseBindMatrices !== null) kept.add(inverseBindMatrices);
  });
  return kept;
}

async function recoverModelDocument(source: Document): Promise<Uint8Array> {
  const model = cloneDocument(source);
  stripNonStandardContent(model);
  const root = model.getRoot();
  root.listAnimations().forEach((animation) => animation.dispose());
  root.listNodes().forEach((node) => node.setCamera(null));
  root.listCameras().forEach((camera) => camera.dispose());
  root.listMaterials().forEach((material) => {
    material.setBaseColorTexture(null);
    material.setMetallicRoughnessTexture(null);
    material.setNormalTexture(null);
    material.setOcclusionTexture(null);
    material.setEmissiveTexture(null);
  });
  root.listTextures().forEach((texture) => texture.dispose());
  disposeAccessorsExcept(model, modelAccessors(model));
  await model.transform(prune({
    propertyTypes: [
      PropertyType.ANIMATION,
      PropertyType.ANIMATION_CHANNEL,
      PropertyType.ANIMATION_SAMPLER,
      PropertyType.CAMERA,
      PropertyType.TEXTURE,
      PropertyType.ACCESSOR,
      PropertyType.BUFFER,
    ],
  }));
  repackAccessorsIntoCompactBuffer(model);
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
  disposeAccessorsExcept(clip, clipAccessors(clip, selected));
  await clip.transform(prune({
    propertyTypes: [
      PropertyType.MESH,
      PropertyType.PRIMITIVE,
      PropertyType.PRIMITIVE_TARGET,
      PropertyType.MATERIAL,
      PropertyType.TEXTURE,
      PropertyType.CAMERA,
      PropertyType.ANIMATION,
      PropertyType.ANIMATION_CHANNEL,
      PropertyType.ANIMATION_SAMPLER,
      PropertyType.ACCESSOR,
      PropertyType.BUFFER,
    ],
  }));
  repackAccessorsIntoCompactBuffer(clip);
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
  validateRiggedModelInventory(source.inventory, true);
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
  const recoveredTextures = recoverTextureArtifacts(
    input.definition,
    source.document.getRoot().listTextures(),
  );
  const materialSetManifest = makeMaterialSetManifest(
    input.definition,
    sourceContentHash,
    sourceMaterials,
    slotIds,
    recoveredTextures.artifacts,
    recoveredTextures.artifactByTexture,
  );
  const materialSet: RecoveredMaterialSetV1 = {
    manifestRelativePath: "materials/default/material-set.manifest.json",
    manifest: materialSetManifest,
    manifestBytes: canonicalSubjectManifestBytes(materialSetManifest),
    textureArtifacts: recoveredTextures.artifacts,
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
    spatialConvention: { ...input.definition.spatialConvention },
    spatialReview: copySpatialReview(input.definition.spatialReview),
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

function canonicalValuesEqual(left: unknown, right: unknown): boolean {
  return equalBytes(canonicalSubjectManifestBytes(left), canonicalSubjectManifestBytes(right));
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

function validateSpatialManifest(manifest: SubjectModelAssetManifestV1): void {
  const convention = manifest.spatialConvention;
  const review = manifest.spatialReview;
  const reviewStatus = review?.spatialReviewStatus as string | undefined;
  const evidence = review?.evidence;
  if (
    convention === undefined ||
    convention.units !== "meters" ||
    convention.upAxis !== "+Y" ||
    convention.forwardAxis !== "-Z" ||
    convention.pivot !== "support-center" ||
    evidence === undefined ||
    evidence.evidenceRef.length === 0 ||
    !["verified", "needs-visual-review"].includes(reviewStatus ?? "") ||
    (reviewStatus === "verified" &&
      !["generated-fixture-contract", "manual-visual-review"].includes(evidence.kind)) ||
    (reviewStatus === "needs-visual-review" &&
      evidence.kind !== "product-sidecar-declaration")
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_SPATIAL_MANIFEST_INVALID");
  }
}

function textureArtifactMetadata(
  artifactValue: RecoveredMaterialTextureArtifactV1,
): MaterialTextureArtifactManifestV1 {
  const { bytes: _bytes, ...metadata } = artifactValue;
  return metadata;
}

function validateTextureArtifactSet(
  recovered: RecoveredSubjectSourcePackageV1,
): ReadonlyMap<string, RecoveredMaterialTextureArtifactV1> {
  const { textureArtifacts } = recovered.materialSet;
  const manifestArtifacts = recovered.materialSet.manifest.textureArtifacts;
  if (
    !canonicalValuesEqual(
      textureArtifacts.map(textureArtifactMetadata),
      manifestArtifacts,
    )
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_TEXTURE_ARTIFACT_METADATA_MISMATCH");
  }
  const artifactByRef = new Map<string, RecoveredMaterialTextureArtifactV1>();
  for (const [index, textureArtifact] of textureArtifacts.entries()) {
    if (textureArtifact.contentHash !== sha256(textureArtifact.bytes)) {
      return fail("MODULAR_SUBJECT_SOURCE_TEXTURE_ARTIFACT_HASH_MISMATCH");
    }
    if (textureArtifact.byteLengthBytes !== textureArtifact.bytes.byteLength) {
      return fail("MODULAR_SUBJECT_SOURCE_TEXTURE_ARTIFACT_BYTE_LENGTH_MISMATCH");
    }
    const hashValue = textureArtifact.contentHash.slice(SHA256_PREFIX.length);
    const expectedPath =
      `materials/default/textures/${hashValue}.${textureFileExtension(textureArtifact.mediaType)}`;
    const expectedId = `${recovered.packageManifest.id}.texture.${hashValue}`;
    const expectedRef =
      `worldkit://texture/${recovered.packageManifest.creatorId}.${recovered.packageManifest.id}.${hashValue}@${recovered.packageManifest.version}`;
    if (
      textureArtifact.relativePath !== expectedPath ||
      textureArtifact.id !== expectedId ||
      textureArtifact.resourceRef !== expectedRef ||
      (index > 0 && textureArtifacts[index - 1]!.relativePath >= textureArtifact.relativePath) ||
      artifactByRef.has(textureArtifact.resourceRef)
    ) {
      return fail("MODULAR_SUBJECT_SOURCE_TEXTURE_ARTIFACT_METADATA_MISMATCH");
    }
    artifactByRef.set(textureArtifact.resourceRef, textureArtifact);
  }
  for (const material of recovered.materialSet.manifest.materials) {
    const channels = new Set<string>();
    for (const binding of material.textures) {
      const textureArtifact = artifactByRef.get(binding.textureArtifactRef);
      if (
        textureArtifact === undefined ||
        binding.textureArtifactRelativePath !== textureArtifact.relativePath ||
        binding.sourceTextureName.length === 0 ||
        channels.has(binding.channel)
      ) {
        return fail("MODULAR_SUBJECT_SOURCE_TEXTURE_BINDING_INVALID", material.materialSlotId);
      }
      channels.add(binding.channel);
    }
  }
  return artifactByRef;
}

export async function validateRecoveredSubjectSourcePackage(
  recovered: RecoveredSubjectSourcePackageV1,
): Promise<void> {
  const packageManifest = recovered.packageManifest;
  const model = recovered.model;
  const materialSet = recovered.materialSet;
  const sourceArchive = recovered.sourceArchive;

  validateCanonicalManifest(
    packageManifest,
    recovered.packageManifestBytes,
    recovered.packageManifestRelativePath,
  );
  validateCanonicalManifest(
    materialSet.manifest,
    materialSet.manifestBytes,
    materialSet.manifestRelativePath,
  );
  validateCanonicalManifest(
    model.manifest,
    model.manifestBytes,
    model.manifestRelativePath,
  );
  validateCanonicalManifest(
    sourceArchive.manifest,
    sourceArchive.manifestBytes,
    sourceArchive.manifestRelativePath,
  );

  if (recovered.packageManifestRelativePath !== "package.manifest.json") {
    return fail("MODULAR_SUBJECT_SOURCE_PATH_MISMATCH", "package");
  }
  if (
    model.glbRelativePath !== "model/model.glb" ||
    model.manifestRelativePath !== "model/model.manifest.json" ||
    model.manifest.artifact.relativePath !== model.glbRelativePath
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_PATH_MISMATCH", "model");
  }
  if (materialSet.manifestRelativePath !== "materials/default/material-set.manifest.json") {
    return fail("MODULAR_SUBJECT_SOURCE_PATH_MISMATCH", "material-set");
  }
  if (
    sourceArchive.glbRelativePath !== "extensions/source-archive/original.glb" ||
    sourceArchive.manifestRelativePath !==
      "extensions/source-archive/original.manifest.json" ||
    sourceArchive.manifest.artifact.relativePath !== sourceArchive.glbRelativePath
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_PATH_MISMATCH", "source-archive");
  }

  if (
    packageManifest.kind !== "subject-source-package" ||
    packageManifest.schemaVersion !== 1 ||
    packageManifest.id.length === 0 ||
    packageManifest.creatorId.length === 0 ||
    packageManifest.displayName.length === 0 ||
    !Number.isInteger(packageManifest.version) ||
    packageManifest.version < 1 ||
    packageManifest.resourceRef !==
      `worldkit://subject-source-package/${packageManifest.creatorId}.${packageManifest.id}@${packageManifest.version}`
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_IDENTITY_MISMATCH", "package");
  }
  if (
    model.manifest.kind !== "subject-model-asset" ||
    model.manifest.schemaVersion !== 1 ||
    model.manifest.id !== packageManifest.id ||
    model.manifest.version !== packageManifest.version ||
    model.manifest.resourceRef !==
      `worldkit://subject-model-asset/${packageManifest.creatorId}.${packageManifest.id}@${packageManifest.version}`
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_IDENTITY_MISMATCH", "model");
  }
  if (
    materialSet.manifest.kind !== "material-set" ||
    materialSet.manifest.schemaVersion !== 1 ||
    materialSet.manifest.id !== `${packageManifest.id}.default` ||
    materialSet.manifest.version !== packageManifest.version ||
    materialSet.manifest.variantId !== "default" ||
    materialSet.manifest.resourceRef !==
      `worldkit://material-set/${packageManifest.creatorId}.${packageManifest.id}.default@${packageManifest.version}`
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_IDENTITY_MISMATCH", "material-set");
  }
  if (
    sourceArchive.manifest.kind !== "subject-source-archive" ||
    sourceArchive.manifest.schemaVersion !== 1 ||
    sourceArchive.manifest.id !== packageManifest.id ||
    sourceArchive.manifest.version !== packageManifest.version ||
    sourceArchive.manifest.resourceRef !==
      `worldkit://subject-source-archive/${packageManifest.creatorId}.${packageManifest.id}@${packageManifest.version}`
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_IDENTITY_MISMATCH", "source-archive");
  }
  validateSpatialManifest(model.manifest);

  const sourceContentHash = sha256(sourceArchive.glbBytes);
  if (
    packageManifest.sourceGlbRelativePath.length === 0 ||
    packageManifest.sourceContentHash !== sourceContentHash ||
    sourceArchive.manifest.artifact.contentHash !== sourceContentHash
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_SOURCE_HASH_MISMATCH");
  }
  const expectedProvenance: SubjectProvenanceV1 = {
    mode: sourceArchive.manifest.provenance.mode,
    sourceGlbRelativePath: packageManifest.sourceGlbRelativePath,
    sourceContentHash,
  };
  if (!canonicalValuesEqual(sourceArchive.manifest.provenance, expectedProvenance)) {
    return fail("MODULAR_SUBJECT_SOURCE_PROVENANCE_MISMATCH", "source-archive");
  }
  if (!canonicalValuesEqual(model.manifest.provenance, expectedProvenance)) {
    return fail("MODULAR_SUBJECT_SOURCE_PROVENANCE_MISMATCH", "model");
  }
  if (!canonicalValuesEqual(materialSet.manifest.provenance, expectedProvenance)) {
    return fail("MODULAR_SUBJECT_SOURCE_PROVENANCE_MISMATCH", "material-set");
  }

  if (packageManifest.modelRef !== model.manifest.resourceRef) {
    return fail("MODULAR_SUBJECT_SOURCE_PACKAGE_REF_MISMATCH", "model");
  }
  if (packageManifest.materialSetRef !== materialSet.manifest.resourceRef) {
    return fail("MODULAR_SUBJECT_SOURCE_PACKAGE_REF_MISMATCH", "material-set");
  }
  if (packageManifest.sourceArchiveRef !== sourceArchive.manifest.resourceRef) {
    return fail("MODULAR_SUBJECT_SOURCE_PACKAGE_REF_MISMATCH", "source-archive");
  }
  if (
    packageManifest.rigProfileRef.length === 0 ||
    model.manifest.rigProfileRef !== packageManifest.rigProfileRef
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_PACKAGE_REF_MISMATCH", "rig-profile");
  }

  validateArtifact(sourceArchive.manifest.artifact, sourceArchive.glbBytes);
  const archivedRaw = parseRawGlbJson(sourceArchive.glbBytes);
  const archivedResidue = extensionResidueInventory(archivedRaw);
  if (
    sourceArchive.manifest.runtimeConsumption !== "forbidden" ||
    !canonicalValuesEqual(archivedResidue, sourceArchive.manifest.residueInventory)
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_ARCHIVE_CONTRACT_INVALID");
  }
  const sourceInspection = await inspectDocument(sourceArchive.glbBytes);
  validateRiggedModelInventory(sourceInspection.inventory, true);

  validateTextureArtifactSet(recovered);
  const sourceMaterials = sourceInspection.document.getRoot().listMaterials();
  const expectedMaterialSlotIds = materialSlotIds(sourceMaterials);
  const expectedTextures = recoverTextureArtifacts(
    {
      id: packageManifest.id,
      version: packageManifest.version,
      creatorId: packageManifest.creatorId,
      displayName: packageManifest.displayName,
      sourceGlbRelativePath: packageManifest.sourceGlbRelativePath,
      expectedSourceContentHash: sourceContentHash,
      rigProfileRef: packageManifest.rigProfileRef,
      provenanceMode: expectedProvenance.mode,
      spatialConvention: model.manifest.spatialConvention,
      spatialReview: model.manifest.spatialReview,
      actions: [],
    },
    sourceInspection.document.getRoot().listTextures(),
  );
  const expectedMaterialManifest = makeMaterialSetManifest(
    {
      id: packageManifest.id,
      version: packageManifest.version,
      creatorId: packageManifest.creatorId,
      displayName: packageManifest.displayName,
      sourceGlbRelativePath: packageManifest.sourceGlbRelativePath,
      expectedSourceContentHash: sourceContentHash,
      rigProfileRef: packageManifest.rigProfileRef,
      provenanceMode: expectedProvenance.mode,
      spatialConvention: model.manifest.spatialConvention,
      spatialReview: model.manifest.spatialReview,
      actions: [],
    },
    sourceContentHash,
    sourceMaterials,
    expectedMaterialSlotIds,
    expectedTextures.artifacts,
    expectedTextures.artifactByTexture,
  );
  if (!canonicalValuesEqual(materialSet.manifest, expectedMaterialManifest)) {
    return fail("MODULAR_SUBJECT_SOURCE_MATERIAL_SET_MISMATCH");
  }
  if (
    expectedTextures.artifacts.length !== materialSet.textureArtifacts.length ||
    expectedTextures.artifacts.some((expected, index) => {
      const actual = materialSet.textureArtifacts[index];
      return actual === undefined ||
        !canonicalValuesEqual(textureArtifactMetadata(expected), textureArtifactMetadata(actual)) ||
        !equalBytes(expected.bytes, actual.bytes);
    })
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_TEXTURE_ARTIFACT_SOURCE_MISMATCH");
  }

  const modelInventory = await inspectModularSubjectGlb(model.glbBytes);
  const modelResidue = extensionResidueInventory(parseRawGlbJson(model.glbBytes));
  if (
    modelInventory.animationClipCount !== 0 ||
    modelInventory.textureCount !== 0 ||
    modelInventory.imageCount !== 0 ||
    modelInventory.cameraCount !== 0 ||
    modelInventory.lightCount !== 0 ||
    modelInventory.externalUris.length !== 0 ||
    hasExtensionResidue(modelResidue)
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_MODEL_CONTRACT_INVALID");
  }
  validateRiggedModelInventory(modelInventory, true);
  if (modelInventory.rigSignatureHash !== model.manifest.rigSignatureHash) {
    return fail("MODULAR_SUBJECT_SOURCE_MODEL_RIG_SIGNATURE_MISMATCH");
  }
  if (!canonicalValuesEqual(modelInventory, model.inventory)) {
    return fail("MODULAR_SUBJECT_SOURCE_INVENTORY_MISMATCH", "model.result");
  }
  if (!canonicalValuesEqual(modelInventory, model.manifest.inventory)) {
    return fail("MODULAR_SUBJECT_SOURCE_INVENTORY_MISMATCH", "model.manifest");
  }
  if (
    model.manifest.rigSignatureHash === null ||
    model.manifest.materialSlotIds.length !== modelInventory.materialCount ||
    !canonicalValuesEqual(model.manifest.materialSlotIds, expectedMaterialSlotIds)
  ) {
    return fail("MODULAR_SUBJECT_SOURCE_MODEL_METADATA_MISMATCH");
  }
  validateArtifact(model.manifest.artifact, model.glbBytes);

  const actionIds = recovered.animationClips.map((clip) => clip.actionId);
  if (new Set(actionIds).size !== actionIds.length) {
    return fail("MODULAR_SUBJECT_SOURCE_ACTION_ID_DUPLICATE");
  }
  if (!actionIds.every((actionId, index) => index === 0 || actionIds[index - 1]! < actionId)) {
    return fail("MODULAR_SUBJECT_SOURCE_ACTION_ORDER_INVALID");
  }
  for (const clip of recovered.animationClips) {
    validateCanonicalManifest(clip.manifest, clip.manifestBytes, clip.manifestRelativePath);
    const expectedGlbRelativePath = `animations/${clip.actionId}/clip.glb`;
    const expectedManifestRelativePath = `animations/${clip.actionId}/clip.manifest.json`;
    if (
      clip.glbRelativePath !== expectedGlbRelativePath ||
      clip.manifestRelativePath !== expectedManifestRelativePath ||
      clip.manifest.artifact.relativePath !== expectedGlbRelativePath
    ) {
      return fail("MODULAR_SUBJECT_SOURCE_PATH_MISMATCH", `clip.${clip.actionId}`);
    }
    if (
      clip.manifest.kind !== "animation-clip" ||
      clip.manifest.schemaVersion !== 1 ||
      clip.manifest.id !== `${packageManifest.id}.${clip.actionId}` ||
      clip.manifest.version !== packageManifest.version ||
      clip.manifest.resourceRef !==
        `worldkit://animation-clip/${packageManifest.creatorId}.${packageManifest.id}.${clip.actionId}@${packageManifest.version}`
    ) {
      return fail("MODULAR_SUBJECT_SOURCE_IDENTITY_MISMATCH", `clip.${clip.actionId}`);
    }
    if (!canonicalValuesEqual(clip.manifest.provenance, expectedProvenance)) {
      return fail("MODULAR_SUBJECT_SOURCE_PROVENANCE_MISMATCH", `clip.${clip.actionId}`);
    }
    if (
      clip.manifest.rigProfileRef !== packageManifest.rigProfileRef ||
      clip.manifest.rigProfileRef !== model.manifest.rigProfileRef
    ) {
      return fail("MODULAR_SUBJECT_SOURCE_PACKAGE_REF_MISMATCH", "rig-profile");
    }
    const inventory = await inspectModularSubjectGlb(clip.glbBytes);
    validateRiggedModelInventory(inventory, false);
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
      inventory.rigSignatureHash !== model.manifest.rigSignatureHash ||
      clip.manifest.rigSignatureHash !== model.manifest.rigSignatureHash
    ) {
      return fail("MODULAR_SUBJECT_SOURCE_RIG_SIGNATURE_MISMATCH", clip.actionId);
    }
    if (!canonicalValuesEqual(inventory, clip.inventory)) {
      return fail("MODULAR_SUBJECT_SOURCE_INVENTORY_MISMATCH", `clip.${clip.actionId}`);
    }
    const sourceAnimation = sourceInspection.inventory.animationClips.find(
      (row) => row.name === clip.manifest.sourceClipName,
    );
    if (
      clip.manifest.actionId !== clip.actionId ||
      clip.manifest.durationSeconds !== inventory.animationClips[0]?.durationSeconds ||
      sourceAnimation?.durationSeconds !== clip.manifest.durationSeconds ||
      !Number.isFinite(clip.manifest.playbackSpeedRatio) ||
      clip.manifest.playbackSpeedRatio <= 0 ||
      !Number.isFinite(clip.manifest.blendDurationSeconds) ||
      clip.manifest.blendDurationSeconds < 0 ||
      !["repeat", "once"].includes(clip.manifest.loopMode) ||
      clip.manifest.rootMotionMode !== "in-place"
    ) {
      return fail("MODULAR_SUBJECT_SOURCE_CLIP_METADATA_MISMATCH", clip.actionId);
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
  const mappedSourceClipNames = recovered.animationClips
    .map((clip) => clip.manifest.sourceClipName)
    .sort(compareCodeUnits);
  const sourceClipNames = sourceInspection.inventory.animationClips
    .map((clip) => clip.name)
    .sort(compareCodeUnits);
  if (!canonicalValuesEqual(mappedSourceClipNames, sourceClipNames)) {
    return fail("MODULAR_SUBJECT_SOURCE_PACKAGE_ACTION_SET_MISMATCH");
  }
}
