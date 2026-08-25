import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  Logger,
  NodeIO,
  type Accessor,
  type Animation,
  type Document,
  type Node,
  type TypedArray,
} from "@gltf-transform/core";
import { prune, unpartition } from "@gltf-transform/functions";

import {
  inspectModularSubjectGlb,
  type ModularSubjectGlbInventoryV1,
} from "./modular-subject-source";

const IO = new NodeIO().setLogger(new Logger(Logger.Verbosity.SILENT));
const TEXT_ENCODER = new TextEncoder();

type Sha256 = `sha256:${string}`;

interface PackageAnimationClipV1 {
  readonly actionId: string;
  readonly animationClipRef: string;
}

interface SubjectSourcePackageManifestV1 {
  readonly kind: "subject-source-package";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly creatorId: string;
  readonly resourceRef: string;
  readonly modelRef: string;
  readonly materialSetRef: string;
  readonly rigProfileRef: string;
  readonly animationClips: readonly PackageAnimationClipV1[];
}

interface LockedGlbArtifactV1 {
  readonly relativePath: string;
  readonly mediaType: "model/gltf-binary";
  readonly byteLengthBytes: number;
  readonly contentHash: Sha256;
}

interface SubjectModelManifestInputV1 {
  readonly kind: "subject-model-asset";
  readonly resourceRef: string;
  readonly rigProfileRef: string;
  readonly rigSignatureHash: Sha256;
  readonly artifact: LockedGlbArtifactV1;
}

interface AnimationClipManifestInputV1 {
  readonly kind: "animation-clip";
  readonly actionId: string;
  readonly resourceRef: string;
  readonly rigProfileRef: string;
  readonly rigSignatureHash: Sha256;
  readonly artifact: LockedGlbArtifactV1;
}

export interface ModularSubjectRuntimeBundleManifestV1 {
  readonly kind: "subject-runtime-bundle";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly artifact: {
    readonly mediaType: "model/gltf-binary";
    readonly byteLengthBytes: number;
    readonly contentHash: Sha256;
  };
  readonly rigProfileRef: string;
  readonly rigSignatureHash: Sha256;
  readonly inventory: ModularSubjectGlbInventoryV1;
  readonly source: {
    readonly subjectSourcePackageRef: string;
    readonly packageManifestContentHash: Sha256;
    readonly model: {
      readonly subjectModelAssetRef: string;
      readonly contentHash: Sha256;
    };
    readonly materialSet: {
      readonly materialSetRef: string;
      readonly manifestContentHash: Sha256;
    };
    readonly animationClips: readonly {
      readonly actionId: string;
      readonly animationClipRef: string;
      readonly contentHash: Sha256;
    }[];
    readonly sourceArchiveIncluded: false;
  };
}

export interface ModularSubjectRuntimeBundleV1 {
  readonly glbBytes: Uint8Array;
  readonly manifest: ModularSubjectRuntimeBundleManifestV1;
  readonly manifestBytes: Uint8Array;
}

export interface AssembleModularSubjectRuntimeBundleOptionsV1 {
  readonly packageDirectory: string;
}

function fail(code: string, detail?: string): never {
  throw new Error(detail === undefined ? code : `${code}: ${detail}`);
}

function sha256(bytes: Uint8Array): Sha256 {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

function canonicalJsonBytes(value: unknown): Uint8Array {
  return TEXT_ENCODER.encode(`${JSON.stringify(canonicalValue(value))}\n`);
}

async function readJson<T>(filePath: string): Promise<{ value: T; bytes: Uint8Array }> {
  const bytes = await readFile(filePath);
  let value: T;
  try {
    value = JSON.parse(bytes.toString("utf8")) as T;
  } catch {
    return fail("MODULAR_SUBJECT_RUNTIME_MANIFEST_INVALID", filePath);
  }
  return { value, bytes };
}

function ownedPackagePath(packageDirectory: string, relativePath: string): string {
  if (
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return fail("MODULAR_SUBJECT_RUNTIME_INPUT_PATH_INVALID", relativePath);
  }
  const root = path.resolve(packageDirectory);
  const resolved = path.resolve(root, ...relativePath.split("/"));
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    return fail("MODULAR_SUBJECT_RUNTIME_INPUT_PATH_INVALID", relativePath);
  }
  return resolved;
}

async function readLockedGlb(
  packageDirectory: string,
  artifact: LockedGlbArtifactV1,
): Promise<Uint8Array> {
  if (artifact.mediaType !== "model/gltf-binary") {
    return fail("MODULAR_SUBJECT_RUNTIME_INPUT_MEDIA_TYPE_INVALID");
  }
  const bytes = await readFile(ownedPackagePath(packageDirectory, artifact.relativePath));
  if (
    bytes.byteLength !== artifact.byteLengthBytes ||
    sha256(bytes) !== artifact.contentHash
  ) {
    return fail("MODULAR_SUBJECT_RUNTIME_INPUT_HASH_MISMATCH", artifact.relativePath);
  }
  return bytes;
}

function fullNodePath(node: Node): string {
  const segments: string[] = [];
  let current: Node | null = node;
  while (current !== null) {
    segments.push(current.getName());
    current = current.getParentNode();
  }
  return segments.reverse().join("/");
}

function uniqueNodesByPath(document: Document): ReadonlyMap<string, Node> {
  const nodesByPath = new Map<string, Node>();
  for (const node of document.getRoot().listNodes()) {
    const nodePath = fullNodePath(node);
    if (nodePath.length === 0 || nodesByPath.has(nodePath)) {
      return fail("MODULAR_SUBJECT_RUNTIME_TARGET_AMBIGUOUS", nodePath);
    }
    nodesByPath.set(nodePath, node);
  }
  return nodesByPath;
}

function copyAccessor(document: Document, source: Accessor, name: string): Accessor {
  const sourceArray = source.getArray();
  const buffer = document.getRoot().listBuffers()[0];
  if (sourceArray === null || buffer === undefined) {
    return fail("MODULAR_SUBJECT_RUNTIME_ANIMATION_ACCESSOR_INVALID", name);
  }
  return document
    .createAccessor(name)
    .setType(source.getType())
    .setArray(sourceArray.slice() as TypedArray)
    .setNormalized(source.getNormalized())
    .setSparse(source.getSparse())
    .setBuffer(buffer)
    .setExtras(structuredClone(source.getExtras()));
}

function copyAnimation(
  targetDocument: Document,
  sourceAnimation: Animation,
  targetNodesByPath: ReadonlyMap<string, Node>,
  actionId: string,
): void {
  const targetAnimation = targetDocument
    .createAnimation(actionId)
    .setExtras(structuredClone(sourceAnimation.getExtras()));
  const samplerMap = new Map(
    sourceAnimation.listSamplers().map((sourceSampler, samplerIndex) => {
      const input = sourceSampler.getInput();
      const output = sourceSampler.getOutput();
      if (input === null || output === null) {
        return fail("MODULAR_SUBJECT_RUNTIME_ANIMATION_ACCESSOR_INVALID", actionId);
      }
      const targetSampler = targetDocument
        .createAnimationSampler(`${actionId}.sampler.${samplerIndex}`)
        .setInput(copyAccessor(targetDocument, input, `${actionId}.input.${samplerIndex}`))
        .setOutput(copyAccessor(targetDocument, output, `${actionId}.output.${samplerIndex}`))
        .setInterpolation(sourceSampler.getInterpolation())
        .setExtras(structuredClone(sourceSampler.getExtras()));
      targetAnimation.addSampler(targetSampler);
      return [sourceSampler, targetSampler] as const;
    }),
  );
  sourceAnimation.listChannels().forEach((sourceChannel, channelIndex) => {
    const sourceNode = sourceChannel.getTargetNode();
    const targetPath = sourceChannel.getTargetPath();
    const targetSampler = sourceChannel.getSampler() === null
      ? undefined
      : samplerMap.get(sourceChannel.getSampler()!);
    if (sourceNode === null || targetPath === null || targetSampler === undefined) {
      return fail("MODULAR_SUBJECT_RUNTIME_ANIMATION_CHANNEL_INVALID", actionId);
    }
    const nodePath = fullNodePath(sourceNode);
    const targetNode = targetNodesByPath.get(nodePath);
    if (targetNode === undefined) {
      return fail("MODULAR_SUBJECT_RUNTIME_TARGET_MISSING", `${actionId}:${nodePath}`);
    }
    const targetChannel = targetDocument
      .createAnimationChannel(`${actionId}.channel.${channelIndex}`)
      .setSampler(targetSampler)
      .setTargetNode(targetNode)
      .setTargetPath(targetPath)
      .setExtras(structuredClone(sourceChannel.getExtras()));
    targetAnimation.addChannel(targetChannel);
  });
}

function assertPackageManifest(value: SubjectSourcePackageManifestV1): void {
  if (
    value.kind !== "subject-source-package" ||
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.version) ||
    value.version <= 0 ||
    value.animationClips.length === 0 ||
    new Set(value.animationClips.map((clip) => clip.actionId)).size !== value.animationClips.length
  ) {
    return fail("MODULAR_SUBJECT_RUNTIME_PACKAGE_MANIFEST_INVALID");
  }
}

export async function assembleModularSubjectRuntimeBundle(
  options: AssembleModularSubjectRuntimeBundleOptionsV1,
): Promise<ModularSubjectRuntimeBundleV1> {
  const packageManifestResult = await readJson<SubjectSourcePackageManifestV1>(
    path.join(options.packageDirectory, "package.manifest.json"),
  );
  const packageManifest = packageManifestResult.value;
  assertPackageManifest(packageManifest);
  const modelResult = await readJson<SubjectModelManifestInputV1>(
    path.join(options.packageDirectory, "model/model.manifest.json"),
  );
  const modelManifest = modelResult.value;
  if (
    modelManifest.kind !== "subject-model-asset" ||
    modelManifest.resourceRef !== packageManifest.modelRef ||
    modelManifest.rigProfileRef !== packageManifest.rigProfileRef
  ) {
    return fail("MODULAR_SUBJECT_RUNTIME_MODEL_MANIFEST_INVALID");
  }
  const modelBytes = await readLockedGlb(options.packageDirectory, modelManifest.artifact);
  const document = await IO.readBinary(modelBytes);
  if (document.getRoot().listAnimations().length !== 0) {
    return fail("MODULAR_SUBJECT_RUNTIME_MODEL_ANIMATIONS_FORBIDDEN");
  }
  const targetNodesByPath = uniqueNodesByPath(document);
  const materialSetResult = await readJson<{ kind: string; resourceRef: string }>(
    path.join(options.packageDirectory, "materials/default/material-set.manifest.json"),
  );
  if (
    materialSetResult.value.kind !== "material-set" ||
    materialSetResult.value.resourceRef !== packageManifest.materialSetRef
  ) {
    return fail("MODULAR_SUBJECT_RUNTIME_MATERIAL_SET_MANIFEST_INVALID");
  }

  const sourceClips: Array<{
    actionId: string;
    animationClipRef: string;
    contentHash: Sha256;
  }> = [];
  for (const configuredClip of packageManifest.animationClips) {
    const clipDirectory = `animations/${configuredClip.actionId}`;
    const clipResult = await readJson<AnimationClipManifestInputV1>(
      ownedPackagePath(options.packageDirectory, `${clipDirectory}/clip.manifest.json`),
    );
    const clipManifest = clipResult.value;
    if (
      clipManifest.kind !== "animation-clip" ||
      clipManifest.actionId !== configuredClip.actionId ||
      clipManifest.resourceRef !== configuredClip.animationClipRef ||
      clipManifest.rigProfileRef !== packageManifest.rigProfileRef ||
      clipManifest.rigSignatureHash !== modelManifest.rigSignatureHash
    ) {
      return fail("MODULAR_SUBJECT_RUNTIME_CLIP_MANIFEST_INVALID", configuredClip.actionId);
    }
    const clipBytes = await readLockedGlb(options.packageDirectory, clipManifest.artifact);
    const clipDocument = await IO.readBinary(clipBytes);
    const animations = clipDocument.getRoot().listAnimations();
    if (animations.length !== 1 || animations[0]!.getName() !== configuredClip.actionId) {
      return fail("MODULAR_SUBJECT_RUNTIME_CLIP_CONTENT_INVALID", configuredClip.actionId);
    }
    copyAnimation(document, animations[0]!, targetNodesByPath, configuredClip.actionId);
    sourceClips.push({
      actionId: configuredClip.actionId,
      animationClipRef: configuredClip.animationClipRef,
      contentHash: clipManifest.artifact.contentHash,
    });
  }

  await document.transform(prune({ keepAttributes: true }), unpartition());
  const glbBytes = await IO.writeBinary(document);
  const inventory = await inspectModularSubjectGlb(glbBytes);
  const expectedActions = packageManifest.animationClips.map((clip) => clip.actionId);
  if (
    inventory.meshCount < 1 ||
    inventory.skeletonCount !== 1 ||
    inventory.rigSignatureHash !== modelManifest.rigSignatureHash ||
    JSON.stringify(inventory.animationClips.map((clip) => clip.name)) !==
      JSON.stringify(expectedActions) ||
    inventory.externalUris.length !== 0
  ) {
    return fail("MODULAR_SUBJECT_RUNTIME_OUTPUT_INVENTORY_INVALID");
  }
  const manifest: ModularSubjectRuntimeBundleManifestV1 = {
    kind: "subject-runtime-bundle",
    schemaVersion: 1,
    id: packageManifest.id,
    version: packageManifest.version,
    resourceRef:
      `worldkit://subject-runtime-bundle/${packageManifest.creatorId}.${packageManifest.id}@${packageManifest.version}`,
    artifact: {
      mediaType: "model/gltf-binary",
      byteLengthBytes: glbBytes.byteLength,
      contentHash: sha256(glbBytes),
    },
    rigProfileRef: packageManifest.rigProfileRef,
    rigSignatureHash: modelManifest.rigSignatureHash,
    inventory,
    source: {
      subjectSourcePackageRef: packageManifest.resourceRef,
      packageManifestContentHash: sha256(packageManifestResult.bytes),
      model: {
        subjectModelAssetRef: packageManifest.modelRef,
        contentHash: modelManifest.artifact.contentHash,
      },
      materialSet: {
        materialSetRef: packageManifest.materialSetRef,
        manifestContentHash: sha256(materialSetResult.bytes),
      },
      animationClips: sourceClips,
      sourceArchiveIncluded: false,
    },
  };
  const bundle = {
    glbBytes,
    manifest,
    manifestBytes: canonicalJsonBytes(manifest),
  } satisfies ModularSubjectRuntimeBundleV1;
  await validateModularSubjectRuntimeBundle(bundle);
  return bundle;
}

export async function validateModularSubjectRuntimeBundle(
  bundle: ModularSubjectRuntimeBundleV1,
): Promise<void> {
  if (
    bundle.manifest.kind !== "subject-runtime-bundle" ||
    bundle.manifest.schemaVersion !== 1 ||
    bundle.manifest.source.sourceArchiveIncluded !== false ||
    bundle.glbBytes.byteLength !== bundle.manifest.artifact.byteLengthBytes ||
    sha256(bundle.glbBytes) !== bundle.manifest.artifact.contentHash ||
    sha256(bundle.manifestBytes) !== sha256(canonicalJsonBytes(bundle.manifest))
  ) {
    return fail("MODULAR_SUBJECT_RUNTIME_BUNDLE_INVALID");
  }
  const inventory = await inspectModularSubjectGlb(bundle.glbBytes);
  if (
    JSON.stringify(inventory) !== JSON.stringify(bundle.manifest.inventory) ||
    inventory.rigSignatureHash !== bundle.manifest.rigSignatureHash ||
    JSON.stringify(inventory.animationClips.map((clip) => clip.name)) !==
      JSON.stringify(bundle.manifest.source.animationClips.map((clip) => clip.actionId))
  ) {
    return fail("MODULAR_SUBJECT_RUNTIME_BUNDLE_INVALID");
  }
}
