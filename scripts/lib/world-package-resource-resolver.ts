import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type {
  NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import type {
  ResolvedWorldPackageResourceArtifactV1,
} from "@whitebox-world/world-package";
import { assertWorldPackageAccessorFreeDataGraphV1 } from "@whitebox-world/world-package";
import {
  createSubjectResourceRegistry,
  type SubjectAssetManifestV1,
} from "@whitebox-world/subject-registry";
import { isEmpty, isEqual, isNil } from "lodash-es";

interface ResolvedWorldPackageResourceBytesV1 {
  readonly resourceRef: string;
  readonly packagePath: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

import {
  XIER120_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
  XIER120_SUBJECT_ASSET_URI_BY_REF_V1,
} from "../../apps/playground/src/worldkit-asset-resolver.js";

export interface WorldPackageResourceMappingV1 {
  readonly publicUri: string;
  readonly packagePath: string;
  readonly mediaType: "model/gltf-binary";
}

export interface ResolveWorldPackageResourceBytesOptionsV1 {
  readonly publicRoot?: string;
  readonly resourceMappingByRef?: Readonly<
    Record<string, WorldPackageResourceMappingV1>
  >;
}

export interface WorldPackageResourceLicenseDocumentV1 {
  readonly id: string;
  readonly spdxLicenseExpression: string;
}

export interface ResolveWorldPackageResourceArtifactsOptionsV1
  extends ResolveWorldPackageResourceBytesOptionsV1 {
  readonly subjectAssetManifests: readonly SubjectAssetManifestV1[];
  readonly licenseDocuments: readonly WorldPackageResourceLicenseDocumentV1[];
}

export type WorldPackageResourceResolveFailureReasonV1 =
  | "asset-empty"
  | "asset-integrity-mismatch"
  | "asset-manifest-mismatch"
  | "asset-path-escape"
  | "asset-unreadable"
  | "duplicate-license-document"
  | "duplicate-package-path"
  | "duplicate-resource-ref"
  | "invalid-normalized-world-ir"
  | "invalid-asset-manifest"
  | "invalid-license-document"
  | "invalid-resource-mapping"
  | "license-document-missing"
  | "public-root-unavailable"
  | "unknown-resource-ref";

const INFRASTRUCTURE_ERROR_CODE =
  "WORLDKIT_WORLD_PACKAGE_RESOURCE_RESOLVE_INFRASTRUCTURE_ERROR" as const;

export class WorldPackageResourceResolveInfrastructureErrorV1 extends Error {
  public readonly name =
    "WorldPackageResourceResolveInfrastructureErrorV1" as const;
  public readonly code = INFRASTRUCTURE_ERROR_CODE;

  public constructor(
    public readonly reason: WorldPackageResourceResolveFailureReasonV1,
    public readonly resourceRef: string | undefined = undefined,
    cause: unknown = undefined,
  ) {
    super(
      `${INFRASTRUCTURE_ERROR_CODE}: ${reason}`,
      isNil(cause) ? undefined : { cause },
    );
  }
}

const XIER120_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1 = Object.freeze(
  Object.fromEntries(
    Object.entries(XIER120_SUBJECT_ASSET_URI_BY_REF_V1).map(
      ([resourceRef, publicUri]) => {
        const packagePath =
          XIER120_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1[resourceRef];
        if (isNil(packagePath)) {
          throw new Error(
            `XIER120_WORLD_PACKAGE_PATH_MISSING: ${resourceRef}`,
          );
        }
        return [
          resourceRef,
          Object.freeze({
            publicUri,
            packagePath,
            mediaType: "model/gltf-binary" as const,
          }),
        ];
      },
    ),
  ),
);

export const DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1: Readonly<
  Record<string, WorldPackageResourceMappingV1>
> = Object.freeze({
  ...XIER120_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1,
  "worldkit://subject-asset/actor.humanoid.alpha-local-actions@1": Object.freeze({
    publicUri:
      "/subject-assets/humanoid/alpha-local-actions/v1/alpha-local-actions.glb",
    packagePath:
      "resources/subject-assets/actor.humanoid.alpha-local-actions.glb",
    mediaType: "model/gltf-binary",
  }),
  "worldkit://subject-asset/actor.humanoid.g-bot@2": Object.freeze({
    publicUri: "/subject-assets/humanoid/g-bot/v2/g-bot.glb",
    packagePath: "resources/subject-assets/actor.humanoid.g-bot.glb",
    mediaType: "model/gltf-binary",
  }),
  "worldkit://subject-asset/humanoid.golden@2": Object.freeze({
    publicUri: "/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
    packagePath: "resources/subject-assets/humanoid.golden.glb",
    mediaType: "model/gltf-binary",
  }),
});

const DEFAULT_PUBLIC_ROOT = path.resolve(
  import.meta.dirname,
  "../../apps/playground/public",
);

const MAPPING_FIELDS = ["publicUri", "packagePath", "mediaType"] as const;
const OPTION_REQUIRED_FIELDS = [
  "subjectAssetManifests",
  "licenseDocuments",
] as const;
const OPTION_ALLOWED_FIELDS = [
  ...OPTION_REQUIRED_FIELDS,
  "publicRoot",
  "resourceMappingByRef",
] as const;

interface LockedSubjectAssetSnapshotV1 {
  readonly subjectAssetRef: string;
  readonly subjectAssetManifestHash: string;
  readonly artifactContentHash: string;
  readonly byteLength: number;
  readonly mediaType: "model/gltf-binary";
  readonly inventory: NormalizedWorldIRV4["resources"]["subjectAssets"][number]["inventory"];
}

interface ResolvedMappingSnapshotV1 extends WorldPackageResourceMappingV1 {
  readonly resourceRef: string;
  readonly publicPathSegments: readonly string[];
}

function infrastructureFailure(
  reason: WorldPackageResourceResolveFailureReasonV1,
  resourceRef?: string,
  cause?: unknown,
): WorldPackageResourceResolveInfrastructureErrorV1 {
  return new WorldPackageResourceResolveInfrastructureErrorV1(
    reason,
    resourceRef,
    cause,
  );
}

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (isNil(value) || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || isNil(prototype);
}

function exactDataRecord(
  value: unknown,
  expectedFields: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  if (!isPlainDataRecord(value)) return undefined;
  if (!isEmpty(Object.getOwnPropertySymbols(value))) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const fields = Object.keys(descriptors);
  if (
    fields.length !== expectedFields.length ||
    expectedFields.some((field) => !Object.hasOwn(descriptors, field)) ||
    fields.some((field) => !expectedFields.includes(field))
  ) {
    return undefined;
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!isNil(descriptor.get) || !isNil(descriptor.set)) {
      return undefined;
    }
  }
  return Object.fromEntries(
    expectedFields.map((field) => [field, descriptors[field]!.value]),
  );
}

function canonicalSegments(
  value: unknown,
  leadingSlashRequired: boolean,
): readonly string[] | undefined {
  if (
    typeof value !== "string" ||
    isEmpty(value) ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.includes("?") ||
    value.includes("#") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    value.startsWith("//") ||
    (leadingSlashRequired ? !value.startsWith("/") : value.startsWith("/"))
  ) {
    return undefined;
  }
  const relativeValue = leadingSlashRequired ? value.slice(1) : value;
  const segments = relativeValue.split("/");
  if (
    segments.some(
      (segment) =>
        isEmpty(segment) ||
        segment === "." ||
        segment === ".." ||
        segment.includes(":"),
    )
  ) {
    return undefined;
  }
  return segments;
}

function snapshotSubjectAssets(
  normalizedWorldIr: NormalizedWorldIRV4,
): readonly LockedSubjectAssetSnapshotV1[] {
  const rows = normalizedWorldIr.resources.subjectAssets;
  if (!Array.isArray(rows)) {
    throw infrastructureFailure("invalid-normalized-world-ir");
  }
  const snapshots = rows.map((row): LockedSubjectAssetSnapshotV1 => {
    if (
      typeof row.subjectAssetRef !== "string" ||
      isEmpty(row.subjectAssetRef) ||
      typeof row.subjectAssetManifestHash !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(row.subjectAssetManifestHash) ||
      typeof row.artifactContentHash !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(row.artifactContentHash) ||
      !Number.isSafeInteger(row.byteLength) ||
      row.byteLength < 0 ||
      row.mediaType !== "model/gltf-binary"
    ) {
      throw infrastructureFailure("invalid-normalized-world-ir");
    }
    return Object.freeze({
      subjectAssetRef: row.subjectAssetRef,
      subjectAssetManifestHash: row.subjectAssetManifestHash,
      artifactContentHash: row.artifactContentHash,
      byteLength: row.byteLength,
      mediaType: row.mediaType,
      inventory: row.inventory,
    });
  });
  snapshots.sort((left, right) =>
    compareCanonicalStrings(left.subjectAssetRef, right.subjectAssetRef)
  );
  for (let index = 1; index < snapshots.length; index += 1) {
    if (
      snapshots[index - 1]!.subjectAssetRef ===
        snapshots[index]!.subjectAssetRef
    ) {
      throw infrastructureFailure(
        "duplicate-resource-ref",
        snapshots[index]!.subjectAssetRef,
      );
    }
  }
  return snapshots;
}

function snapshotMapping(
  resourceRef: string,
  rawMappingByRef: Readonly<Record<string, WorldPackageResourceMappingV1>>,
): ResolvedMappingSnapshotV1 {
  if (!Object.hasOwn(rawMappingByRef, resourceRef)) {
    throw infrastructureFailure("unknown-resource-ref", resourceRef);
  }
  const descriptor = Object.getOwnPropertyDescriptor(rawMappingByRef, resourceRef);
  if (
    isNil(descriptor) ||
    !isNil(descriptor.get) ||
    !isNil(descriptor.set)
  ) {
    throw infrastructureFailure("invalid-resource-mapping", resourceRef);
  }
  const record = exactDataRecord(descriptor.value, MAPPING_FIELDS);
  const publicPathSegments = canonicalSegments(record?.publicUri, true);
  const packagePathSegments = canonicalSegments(record?.packagePath, false);
  if (
    isNil(record) ||
    isNil(publicPathSegments) ||
    isNil(packagePathSegments) ||
    packagePathSegments.length < 3 ||
    packagePathSegments[0] !== "resources" ||
    packagePathSegments[1] !== "subject-assets" ||
    record.mediaType !== "model/gltf-binary"
  ) {
    throw infrastructureFailure("invalid-resource-mapping", resourceRef);
  }
  return Object.freeze({
    resourceRef,
    publicUri: record.publicUri as string,
    publicPathSegments,
    packagePath: record.packagePath as string,
    mediaType: "model/gltf-binary",
  });
}

function snapshotMappings(
  subjectAssets: readonly LockedSubjectAssetSnapshotV1[],
  rawMappingByRef: Readonly<Record<string, WorldPackageResourceMappingV1>>,
): readonly ResolvedMappingSnapshotV1[] {
  const mappings = subjectAssets.map((asset) =>
    snapshotMapping(asset.subjectAssetRef, rawMappingByRef)
  );
  const packagePaths = new Set<string>();
  for (const mapping of mappings) {
    if (packagePaths.has(mapping.packagePath)) {
      throw infrastructureFailure(
        "duplicate-package-path",
        mapping.resourceRef,
      );
    }
    packagePaths.add(mapping.packagePath);
  }
  return mappings;
}

function isContainedPath(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    !isEmpty(relative) &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function canonicalPublicRoot(value: string): Promise<string> {
  try {
    const absolute = path.resolve(value);
    const canonical = await realpath(absolute);
    const metadata = await stat(canonical);
    if (!metadata.isDirectory()) {
      throw infrastructureFailure("public-root-unavailable");
    }
    return canonical;
  } catch (error) {
    if (error instanceof WorldPackageResourceResolveInfrastructureErrorV1) {
      throw error;
    }
    throw infrastructureFailure("public-root-unavailable", undefined, error);
  }
}

async function readLockedResourceBytes(
  publicRoot: string,
  asset: LockedSubjectAssetSnapshotV1,
  mapping: ResolvedMappingSnapshotV1,
): Promise<Uint8Array> {
  const lexicalPath = path.resolve(publicRoot, ...mapping.publicPathSegments);
  if (!isContainedPath(publicRoot, lexicalPath)) {
    throw infrastructureFailure("asset-path-escape", asset.subjectAssetRef);
  }

  let canonicalPath: string;
  try {
    canonicalPath = await realpath(lexicalPath);
  } catch (error) {
    throw infrastructureFailure(
      "asset-unreadable",
      asset.subjectAssetRef,
      error,
    );
  }
  if (!isContainedPath(publicRoot, canonicalPath)) {
    throw infrastructureFailure("asset-path-escape", asset.subjectAssetRef);
  }

  let bytes: Uint8Array;
  try {
    const metadata = await stat(canonicalPath);
    if (!metadata.isFile()) {
      throw infrastructureFailure("asset-unreadable", asset.subjectAssetRef);
    }
    bytes = Uint8Array.from(await readFile(canonicalPath));
  } catch (error) {
    if (error instanceof WorldPackageResourceResolveInfrastructureErrorV1) {
      throw error;
    }
    throw infrastructureFailure(
      "asset-unreadable",
      asset.subjectAssetRef,
      error,
    );
  }
  if (isEmpty(bytes)) {
    throw infrastructureFailure("asset-empty", asset.subjectAssetRef);
  }
  const contentHash = `sha256:${createHash("sha256")
    .update(bytes)
    .digest("hex")}`;
  if (
    mapping.mediaType !== asset.mediaType ||
    bytes.byteLength !== asset.byteLength ||
    contentHash !== asset.artifactContentHash
  ) {
    throw infrastructureFailure(
      "asset-integrity-mismatch",
      asset.subjectAssetRef,
    );
  }
  return bytes;
}

export async function resolveWorldPackageResourceBytesV1(
  normalizedWorldIr: NormalizedWorldIRV4,
  options: ResolveWorldPackageResourceBytesOptionsV1 = {},
): Promise<readonly ResolvedWorldPackageResourceBytesV1[]> {
  const subjectAssets = snapshotSubjectAssets(normalizedWorldIr);
  if (isEmpty(subjectAssets)) return Object.freeze([]);

  const rawMappingByRef: Readonly<
    Record<string, WorldPackageResourceMappingV1>
  > = options.resourceMappingByRef ??
    DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1;
  const mappings = snapshotMappings(subjectAssets, rawMappingByRef);
  const publicRoot = await canonicalPublicRoot(
    options.publicRoot ?? DEFAULT_PUBLIC_ROOT,
  );
  const artifacts: ResolvedWorldPackageResourceBytesV1[] = [];
  for (let index = 0; index < subjectAssets.length; index += 1) {
    const asset = subjectAssets[index]!;
    const mapping = mappings[index]!;
    const bytes = await readLockedResourceBytes(publicRoot, asset, mapping);
    artifacts.push(
      Object.freeze({
        resourceRef: asset.subjectAssetRef,
        packagePath: mapping.packagePath,
        mediaType: mapping.mediaType,
        bytes,
      }),
    );
  }
  return Object.freeze(artifacts);
}

function isPlainDenseArray(value: unknown): value is readonly unknown[] {
  return (
    Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    Object.getOwnPropertyNames(value).length === value.length + 1
  );
}

function snapshotLicenseDocumentsV1(
  value: unknown,
): ReadonlyMap<string, WorldPackageResourceLicenseDocumentV1> {
  if (!isPlainDenseArray(value)) {
    throw infrastructureFailure("invalid-license-document");
  }
  const bySpdxExpression = new Map<
    string,
    WorldPackageResourceLicenseDocumentV1
  >();
  const ids = new Set<string>();
  for (const candidate of value) {
    const record = exactDataRecord(candidate, ["id", "spdxLicenseExpression"]);
    if (
      isNil(record) ||
      typeof record.id !== "string" ||
      isEmpty(record.id) ||
      record.id.trim() !== record.id ||
      typeof record.spdxLicenseExpression !== "string" ||
      isEmpty(record.spdxLicenseExpression) ||
      record.spdxLicenseExpression.trim() !== record.spdxLicenseExpression
    ) {
      throw infrastructureFailure("invalid-license-document");
    }
    if (
      ids.has(record.id) ||
      bySpdxExpression.has(record.spdxLicenseExpression)
    ) {
      throw infrastructureFailure("duplicate-license-document");
    }
    const document = Object.freeze({
      id: record.id,
      spdxLicenseExpression: record.spdxLicenseExpression,
    });
    ids.add(document.id);
    bySpdxExpression.set(document.spdxLicenseExpression, document);
  }
  return bySpdxExpression;
}

function snapshotResolveOptionsV1(
  value: unknown,
): ResolveWorldPackageResourceArtifactsOptionsV1 {
  try {
    assertWorldPackageAccessorFreeDataGraphV1(
      value,
      "WORLD_PACKAGE_RESOURCE_RESOLVE_OPTIONS_ACCESSOR_FORBIDDEN",
    );
  } catch {
    throw infrastructureFailure("invalid-resource-mapping");
  }
  if (!isPlainDataRecord(value)) {
    throw infrastructureFailure("invalid-resource-mapping");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const fields = Object.keys(descriptors);
  if (
    fields.some((field) => !OPTION_ALLOWED_FIELDS.includes(
      field as (typeof OPTION_ALLOWED_FIELDS)[number],
    )) ||
    OPTION_REQUIRED_FIELDS.some((field) => !Object.hasOwn(descriptors, field))
  ) {
    throw infrastructureFailure("invalid-resource-mapping");
  }
  return {
    subjectAssetManifests: descriptors.subjectAssetManifests!.value as
      readonly SubjectAssetManifestV1[],
    licenseDocuments: descriptors.licenseDocuments!.value as
      readonly WorldPackageResourceLicenseDocumentV1[],
    ...(isNil(descriptors.publicRoot)
      ? {}
      : { publicRoot: descriptors.publicRoot.value as string }),
    ...(isNil(descriptors.resourceMappingByRef)
      ? {}
      : {
          resourceMappingByRef: descriptors.resourceMappingByRef.value as
            Readonly<Record<string, WorldPackageResourceMappingV1>>,
        }),
  };
}

function snapshotSubjectAssetManifestsV1(
  subjectAssets: readonly LockedSubjectAssetSnapshotV1[],
  value: unknown,
): ReadonlyMap<string, SubjectAssetManifestV1> {
  if (!isPlainDenseArray(value)) {
    throw infrastructureFailure("invalid-asset-manifest");
  }
  try {
    assertWorldPackageAccessorFreeDataGraphV1(
      value,
      "WORLD_PACKAGE_RESOURCE_MANIFEST_ACCESSOR_FORBIDDEN",
    );
  } catch {
    throw infrastructureFailure("invalid-asset-manifest");
  }
  const manifestsByRef = new Map<string, SubjectAssetManifestV1>();
  for (const candidate of value) {
    if (isNil(candidate) || !isPlainDataRecord(candidate)) {
      throw infrastructureFailure("invalid-asset-manifest");
    }
    const artifact = isPlainDataRecord(candidate.artifact)
      ? candidate.artifact
      : undefined;
    const provenance = isPlainDataRecord(candidate.provenance)
      ? candidate.provenance
      : undefined;
    if (
      candidate.kind !== "subject-asset" ||
      typeof candidate.resourceRef !== "string" ||
      isEmpty(candidate.resourceRef) ||
      typeof candidate.contentHash !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(candidate.contentHash) ||
      isNil(artifact) ||
      artifact.mediaType !== "model/gltf-binary" ||
      !Number.isSafeInteger(artifact.byteLength) ||
      Number(artifact.byteLength) < 0 ||
      typeof artifact.contentHash !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(artifact.contentHash) ||
      isNil(provenance) ||
      typeof provenance.licenseSpdxId !== "string" ||
      isEmpty(provenance.licenseSpdxId) ||
      (provenance.redistributionPolicy !== "allowed" &&
        provenance.redistributionPolicy !== "internal-only" &&
        provenance.redistributionPolicy !== "prohibited") ||
      (!isNil(provenance.sourceUri) &&
        (typeof provenance.sourceUri !== "string" || isEmpty(provenance.sourceUri))) ||
      (!isNil(provenance.author) &&
        (typeof provenance.author !== "string" || isEmpty(provenance.author)))
    ) {
      throw infrastructureFailure("invalid-asset-manifest");
    }
    const manifest = candidate as unknown as SubjectAssetManifestV1;
    if (manifestsByRef.has(manifest.resourceRef)) {
      throw infrastructureFailure("duplicate-resource-ref", manifest.resourceRef);
    }
    manifestsByRef.set(manifest.resourceRef, manifest);
  }
  if (
    manifestsByRef.size !== subjectAssets.length ||
    subjectAssets.some((asset) => !manifestsByRef.has(asset.subjectAssetRef))
  ) {
    throw infrastructureFailure("asset-manifest-mismatch");
  }
  let admittedRegistry;
  try {
    admittedRegistry = createSubjectResourceRegistry(
      value as readonly SubjectAssetManifestV1[],
    );
  } catch {
    throw infrastructureFailure("invalid-asset-manifest");
  }
  for (const asset of subjectAssets) {
    const manifest = manifestsByRef.get(asset.subjectAssetRef)!;
    const admittedManifest = admittedRegistry.resolveSubjectAsset(
      asset.subjectAssetRef,
    );
    if (
      isNil(admittedManifest) ||
      !isEqual(admittedManifest, manifest) ||
      manifest.contentHash !== asset.subjectAssetManifestHash ||
      manifest.artifact.contentHash !== asset.artifactContentHash ||
      manifest.artifact.byteLength !== asset.byteLength ||
      manifest.artifact.mediaType !== asset.mediaType ||
      manifest.inventory.meshCount !== asset.inventory.meshCount ||
      manifest.inventory.vertexCount !== asset.inventory.vertexCount ||
      manifest.inventory.triangleCount !== asset.inventory.triangleCount ||
      manifest.inventory.skeletonCount !== asset.inventory.skeletonCount ||
      manifest.inventory.boneCount !== asset.inventory.boneCount ||
      !isEqual(
        manifest.inventory.animationClipNames,
        asset.inventory.animationClipNames,
      )
    ) {
      throw infrastructureFailure(
        "asset-manifest-mismatch",
        asset.subjectAssetRef,
      );
    }
  }
  return manifestsByRef;
}

export async function resolveWorldPackageResourceArtifactsV1(
  normalizedWorldIr: NormalizedWorldIRV4,
  options: ResolveWorldPackageResourceArtifactsOptionsV1,
): Promise<readonly ResolvedWorldPackageResourceArtifactV1[]> {
  const snapshotOptions = snapshotResolveOptionsV1(options);
  const subjectAssets = snapshotSubjectAssets(normalizedWorldIr);
  const manifestsByRef = snapshotSubjectAssetManifestsV1(
    subjectAssets,
    snapshotOptions.subjectAssetManifests,
  );
  const licenseBySpdxExpression = snapshotLicenseDocumentsV1(
    snapshotOptions.licenseDocuments,
  );
  const provenanceByRef = new Map<string, Readonly<{
    readonly subjectAssetManifestHash: `sha256:${string}`;
    readonly licenseDocumentId: string;
    readonly licenseSpdxExpression: string;
    readonly redistributionPolicy: "allowed" | "internal-only" | "prohibited";
    readonly sourceUri?: string;
    readonly author?: string;
  }>>();
  for (const asset of subjectAssets) {
    const manifest = manifestsByRef.get(asset.subjectAssetRef)!;
    const document = licenseBySpdxExpression.get(
      manifest.provenance.licenseSpdxId,
    );
    if (isNil(document)) {
      throw infrastructureFailure(
        "license-document-missing",
        asset.subjectAssetRef,
      );
    }
    provenanceByRef.set(asset.subjectAssetRef, Object.freeze({
      subjectAssetManifestHash:
        asset.subjectAssetManifestHash as `sha256:${string}`,
      licenseDocumentId: document.id,
      licenseSpdxExpression: manifest.provenance.licenseSpdxId,
      redistributionPolicy: manifest.provenance.redistributionPolicy,
      ...(isNil(manifest.provenance.sourceUri)
        ? {}
        : { sourceUri: manifest.provenance.sourceUri }),
      ...(isNil(manifest.provenance.author)
        ? {}
        : { author: manifest.provenance.author }),
    }));
  }

  const artifacts = await resolveWorldPackageResourceBytesV1(
    normalizedWorldIr,
    {
      ...(isNil(snapshotOptions.publicRoot)
        ? {}
        : { publicRoot: snapshotOptions.publicRoot }),
      ...(isNil(snapshotOptions.resourceMappingByRef)
        ? {}
        : { resourceMappingByRef: snapshotOptions.resourceMappingByRef }),
    },
  );
  return Object.freeze(artifacts.map((artifact) => {
    const provenance = provenanceByRef.get(artifact.resourceRef);
    if (isNil(provenance)) {
      throw infrastructureFailure(
        "asset-manifest-mismatch",
        artifact.resourceRef,
      );
    }
    return Object.freeze({
      ...artifact,
      ...provenance,
    });
  }));
}
