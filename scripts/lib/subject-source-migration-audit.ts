import { readFile } from "node:fs/promises";
import path from "node:path";

import { sha256Bytes } from "@whitebox-world/protocol";
import {
  XIER120_SUBJECT_ASSET_MANIFESTS,
  sourceFbxContributorAssetInventory,
} from "@whitebox-world/subject-registry";

import {
  PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1,
  XIER120_SUBJECT_ASSET_URI_BY_REF_V1,
} from "../../apps/playground/src/worldkit-asset-resolver";
import { BUILT_IN_SUBJECT_RESOURCE_MANIFESTS } from "../../packages/subject-registry/src/built-in-resource-manifests";
import { canonicalSubjectManifestBytes } from "./modular-subject-source";
import {
  G_BOT_MODULAR_SUBJECT_SOURCE_PACKAGE,
  GOLDEN_MODULAR_SUBJECT_SOURCE_PACKAGE,
} from "./modular-subject-source-catalog";

export type SubjectSourceMigrationStatusV1 =
  | "recovered-modular"
  | "ready-static"
  | "needs-visual-review"
  | "requires-product-reexport";

export interface SubjectSourceMigrationArtifactV1 {
  readonly relativePath: string;
  readonly byteLengthBytes: number;
  readonly contentHash: `sha256:${string}`;
}

export interface SubjectSourceMigrationRowV1 {
  readonly id: string;
  readonly displayName: string;
  readonly category: string;
  readonly currentUseMode: "runtime-bundle" | "static-subject";
  readonly statuses: readonly SubjectSourceMigrationStatusV1[];
  readonly source: SubjectSourceMigrationArtifactV1;
  readonly runtime: SubjectSourceMigrationArtifactV1 & {
    readonly subjectAssetRef: string;
  };
  readonly sourcePackageRef: string | null;
  readonly rigProfileRef: string | null;
  readonly animationClipRefs: readonly string[];
  readonly riggedBlockers: readonly string[];
  readonly productCorrection: string;
}

export interface SubjectSourceMigrationInventoryV1 {
  readonly kind: "subject-source-migration-inventory";
  readonly schemaVersion: 1;
  readonly rows: readonly SubjectSourceMigrationRowV1[];
}

export interface AuditSubjectSourceMigrationOptionsV1 {
  readonly repositoryRoot: string;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactSha256(value: string): `sha256:${string}` {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`SUBJECT_SOURCE_MIGRATION_HASH_INVALID: ${value}`);
  }
  return value as `sha256:${string}`;
}

async function verifiedArtifact(
  repositoryRoot: string,
  relativePath: string,
  expectedByteLengthBytes: number,
  expectedContentHash: `sha256:${string}`,
): Promise<SubjectSourceMigrationArtifactV1> {
  const bytes = await readFile(path.join(repositoryRoot, relativePath));
  if (bytes.byteLength !== expectedByteLengthBytes) {
    throw new Error(`SUBJECT_SOURCE_MIGRATION_BYTE_LENGTH_MISMATCH: ${relativePath}`);
  }
  if (sha256Bytes(bytes) !== expectedContentHash) {
    throw new Error(`SUBJECT_SOURCE_MIGRATION_HASH_MISMATCH: ${relativePath}`);
  }
  return { relativePath, byteLengthBytes: bytes.byteLength, contentHash: expectedContentHash };
}

function builtInSubjectAsset(id: string) {
  const manifest = BUILT_IN_SUBJECT_RESOURCE_MANIFESTS.find(
    (candidate) => candidate.kind === "subject-asset" && candidate.id === id,
  );
  if (manifest === undefined || manifest.kind !== "subject-asset") {
    throw new Error(`SUBJECT_SOURCE_MIGRATION_RUNTIME_MANIFEST_MISSING: ${id}`);
  }
  return manifest;
}

function xierBlockers(coarseClass: string): string[] {
  if (coarseClass === "quadruped-animal") {
    return [
      "source-has-18-skeletons",
      "canonical-nonhuman-rig-undefined",
      "semantic-actions-missing",
    ];
  }
  if (coarseClass === "rider-animal-composition") {
    return [
      "source-has-2-skeletons",
      "control-owner-undefined",
      "composite-rig-contract-undefined",
      "semantic-actions-missing",
    ];
  }
  if (coarseClass.includes("vehicle")) {
    return ["vehicle-capability-undefined", "articulated-parts-undefined"];
  }
  if (coarseClass.includes("composition")) {
    return ["control-owner-undefined", "composite-rig-contract-undefined"];
  }
  return ["canonical-nonhuman-rig-undefined", "semantic-actions-missing"];
}

function xierCorrection(id: string, coarseClass: string): string {
  if (coarseClass === "quadruped-animal") {
    return `${id}: re-export one skinned animal Model with exactly one approved quadruped Skeleton and Bind Pose; bind every Mesh to that Skeleton and deliver separately named in-place idle/walk/run/jump Clip GLBs.`;
  }
  if (coarseClass === "rider-animal-composition") {
    return `${id}: first declare whether the animal alone owns control or request a reviewed multi-Rig mount capability; then re-export the chosen controlled Model/Rig and rider visuals separately, with explicit semantic Clip GLBs.`;
  }
  if (coarseClass.includes("vehicle")) {
    return `${id}: re-export body, steering/wheel/track parts with stable pivots and material slots, declare the controlled root, and request the matching vehicle capability before supplying independent motion/action Clips.`;
  }
  if (coarseClass.includes("composition")) {
    return `${id}: split rider and equipment visual ownership, declare the single controlled root and attachment contract, then export one approved Rig/Bind Pose plus independent semantic Clip GLBs; request flight/board capability where applicable.`;
  }
  return `${id}: re-export one skinned non-human Model with exactly one approved semantic Skeleton and Bind Pose, stable material slots, and independent in-place idle/walk/run/jump Clip GLBs.`;
}

async function modularRow(
  repositoryRoot: string,
  definition: typeof G_BOT_MODULAR_SUBJECT_SOURCE_PACKAGE | typeof GOLDEN_MODULAR_SUBJECT_SOURCE_PACKAGE,
  subjectAssetId: string,
): Promise<SubjectSourceMigrationRowV1> {
  const runtimeManifest = builtInSubjectAsset(subjectAssetId);
  const sourceBytes = await readFile(path.join(repositoryRoot, definition.sourceGlbRelativePath));
  if (sha256Bytes(sourceBytes) !== definition.expectedSourceContentHash) {
    throw new Error(
      `SUBJECT_SOURCE_MIGRATION_CONTENT_HASH_MISMATCH: ${definition.sourceGlbRelativePath}`,
    );
  }
  const source: SubjectSourceMigrationArtifactV1 = {
    relativePath: definition.sourceGlbRelativePath,
    byteLengthBytes: sourceBytes.byteLength,
    contentHash: definition.expectedSourceContentHash,
  };
  const runtimePublicUri = (
    PLAYGROUND_SUBJECT_ASSET_URI_BY_REF_V1 as Readonly<Record<string, string>>
  )[runtimeManifest.resourceRef];
  if (runtimePublicUri === undefined || !runtimePublicUri.startsWith("/")) {
    throw new Error(`SUBJECT_SOURCE_MIGRATION_RUNTIME_URI_MISSING: ${definition.id}`);
  }
  const runtimeRelativePath = path.posix.join(
    "apps/playground/public",
    runtimePublicUri.slice(1),
  );
  const runtimeContentHash = runtimeManifest.artifact.contentHash;
  if (!/^sha256:[a-f0-9]{64}$/.test(runtimeContentHash)) {
    throw new Error(`SUBJECT_SOURCE_MIGRATION_RUNTIME_HASH_INVALID: ${definition.id}`);
  }
  const runtime = await verifiedArtifact(
    repositoryRoot,
    runtimeRelativePath,
    runtimeManifest.artifact.byteLength,
    runtimeContentHash as `sha256:${string}`,
  );
  return {
    id: `${definition.creatorId}.${definition.id}`,
    displayName: definition.displayName,
    category: "rigged-humanoid",
    currentUseMode: "runtime-bundle",
    statuses: definition.spatialReview.spatialReviewStatus === "needs-visual-review"
      ? ["recovered-modular", "needs-visual-review"]
      : ["recovered-modular"],
    source,
    runtime: { ...runtime, subjectAssetRef: runtimeManifest.resourceRef },
    sourcePackageRef:
      `worldkit://subject-source-package/${definition.creatorId}.${definition.id}@${definition.version}`,
    rigProfileRef: definition.rigProfileRef,
    animationClipRefs: [...definition.actions]
      .sort((left, right) => compareCodeUnits(left.actionId, right.actionId))
      .map((action) =>
        `worldkit://animation-clip/${definition.creatorId}.${definition.id}.${action.actionId}@${definition.version}`
      ),
    riggedBlockers: definition.spatialReview.spatialReviewStatus === "needs-visual-review"
      ? ["spatial-visual-review-pending"]
      : [],
    productCorrection: definition.spatialReview.spatialReviewStatus === "needs-visual-review"
      ? `${definition.creatorId}.${definition.id}: render and approve front/right/back plus old/new opening-frame orientation before promoting the recovered Model as spatially verified.`
      : `${definition.creatorId}.${definition.id}: no product re-export required; keep immutable Model, Material Set, Rig signature, and per-action Clip versions.`,
  };
}

export async function auditSubjectSourceMigration(
  options: AuditSubjectSourceMigrationOptionsV1,
): Promise<SubjectSourceMigrationInventoryV1> {
  const rows: SubjectSourceMigrationRowV1[] = [
    await modularRow(options.repositoryRoot, G_BOT_MODULAR_SUBJECT_SOURCE_PACKAGE, "actor.humanoid.g-bot"),
    await modularRow(options.repositoryRoot, GOLDEN_MODULAR_SUBJECT_SOURCE_PACKAGE, "humanoid.golden"),
  ];

  for (const sourceEntry of sourceFbxContributorAssetInventory) {
    if (sourceEntry.creatorId !== "xier120") continue;
    const runtimeManifest = XIER120_SUBJECT_ASSET_MANIFESTS.find(
      (candidate) => candidate.id === sourceEntry.sourceId,
    );
    if (runtimeManifest === undefined) {
      throw new Error(`SUBJECT_SOURCE_MIGRATION_RUNTIME_MANIFEST_MISSING: ${sourceEntry.sourceId}`);
    }
    const publicUri = XIER120_SUBJECT_ASSET_URI_BY_REF_V1[runtimeManifest.resourceRef];
    if (publicUri === undefined || !publicUri.startsWith("/")) {
      throw new Error(`SUBJECT_SOURCE_MIGRATION_RUNTIME_URI_MISSING: ${sourceEntry.sourceId}`);
    }
    const runtimeRelativePath = path.posix.join(
      "apps/playground/public",
      publicUri.slice(1),
    );
    const [source, runtime] = await Promise.all([
      verifiedArtifact(
        options.repositoryRoot,
        sourceEntry.repositoryRelativePath,
        sourceEntry.byteLength,
        sourceEntry.contentHash,
      ),
      verifiedArtifact(
        options.repositoryRoot,
        runtimeRelativePath,
        runtimeManifest.artifact.byteLength,
        exactSha256(runtimeManifest.artifact.contentHash),
      ),
    ]);
    rows.push({
      id: sourceEntry.sourceId,
      displayName: runtimeManifest.aiMetadata.displayName,
      category: sourceEntry.coarseClass,
      currentUseMode: "static-subject",
      statuses: ["ready-static", "requires-product-reexport"],
      source,
      runtime: { ...runtime, subjectAssetRef: runtimeManifest.resourceRef },
      sourcePackageRef: null,
      rigProfileRef: null,
      animationClipRefs: [],
      riggedBlockers: xierBlockers(sourceEntry.coarseClass),
      productCorrection: xierCorrection(sourceEntry.sourceId, sourceEntry.coarseClass),
    });
  }

  rows.sort((left, right) => compareCodeUnits(left.id, right.id));
  if (rows.length !== 21) {
    throw new Error(`SUBJECT_SOURCE_MIGRATION_ROW_COUNT_MISMATCH: ${rows.length}`);
  }
  return { kind: "subject-source-migration-inventory", schemaVersion: 1, rows };
}

export function serializeSubjectSourceMigrationInventory(
  inventory: SubjectSourceMigrationInventoryV1,
): Uint8Array {
  return canonicalSubjectManifestBytes(inventory);
}
