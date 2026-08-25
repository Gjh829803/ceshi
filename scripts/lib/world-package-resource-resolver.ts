import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type {
  NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import type {
  ResolvedWorldPackageResourceArtifactV1,
} from "@whitebox-world/world-package";

import {
  XIER120_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1,
  XIER120_SUBJECT_ASSET_URI_BY_REF_V1,
} from "../../apps/playground/src/worldkit-asset-resolver.js";

export interface WorldPackageResourceMappingV1 {
  readonly publicUri: string;
  readonly packagePath: string;
  readonly mediaType: "model/gltf-binary";
}

export interface ResolveWorldPackageResourceArtifactsOptionsV1 {
  readonly publicRoot?: string;
  readonly resourceMappingByRef?: Readonly<
    Record<string, WorldPackageResourceMappingV1>
  >;
}

export type WorldPackageResourceResolveFailureReasonV1 =
  | "asset-empty"
  | "asset-integrity-mismatch"
  | "asset-path-escape"
  | "asset-unreadable"
  | "duplicate-package-path"
  | "duplicate-resource-ref"
  | "invalid-normalized-world-ir"
  | "invalid-resource-mapping"
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
      cause === undefined ? undefined : { cause },
    );
  }
}

const XIER120_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1 = Object.freeze(
  Object.fromEntries(
    Object.entries(XIER120_SUBJECT_ASSET_URI_BY_REF_V1).map(
      ([resourceRef, publicUri]) => {
        const packagePath =
          XIER120_SUBJECT_ASSET_PACKAGE_PATH_BY_REF_V1[resourceRef];
        if (packagePath === undefined) {
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

interface LockedSubjectAssetSnapshotV1 {
  readonly subjectAssetRef: string;
  readonly artifactContentHash: string;
  readonly byteLength: number;
  readonly mediaType: "model/gltf-binary";
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
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactDataRecord(
  value: unknown,
  expectedFields: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  if (!isPlainDataRecord(value)) return undefined;
  if (Object.getOwnPropertySymbols(value).length !== 0) return undefined;
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
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
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
    value.length === 0 ||
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
        segment.length === 0 ||
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
      row.subjectAssetRef.length === 0 ||
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
      artifactContentHash: row.artifactContentHash,
      byteLength: row.byteLength,
      mediaType: row.mediaType,
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
    descriptor === undefined ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined
  ) {
    throw infrastructureFailure("invalid-resource-mapping", resourceRef);
  }
  const record = exactDataRecord(descriptor.value, MAPPING_FIELDS);
  const publicPathSegments = canonicalSegments(record?.publicUri, true);
  const packagePathSegments = canonicalSegments(record?.packagePath, false);
  if (
    record === undefined ||
    publicPathSegments === undefined ||
    packagePathSegments === undefined ||
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
    relative !== "" &&
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
  if (bytes.byteLength === 0) {
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

export async function resolveWorldPackageResourceArtifactsV1(
  normalizedWorldIr: NormalizedWorldIRV4,
  options: ResolveWorldPackageResourceArtifactsOptionsV1 = {},
): Promise<readonly ResolvedWorldPackageResourceArtifactV1[]> {
  const subjectAssets = snapshotSubjectAssets(normalizedWorldIr);
  if (subjectAssets.length === 0) return Object.freeze([]);

  const rawMappingByRef: Readonly<
    Record<string, WorldPackageResourceMappingV1>
  > = options.resourceMappingByRef ??
    DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1;
  const mappings = snapshotMappings(subjectAssets, rawMappingByRef);
  const publicRoot = await canonicalPublicRoot(
    options.publicRoot ?? DEFAULT_PUBLIC_ROOT,
  );
  const artifacts: ResolvedWorldPackageResourceArtifactV1[] = [];
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
