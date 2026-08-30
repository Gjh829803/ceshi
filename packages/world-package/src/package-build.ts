import { hashAuthoringDocumentV4, type AuthoringSpecV4, type NormalizedWorldIRV4 } from "@whitebox-world/authoring";
import type { GameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import { gameplayBootstrapCanonicalBytesV1 } from "@whitebox-world/gameplay-contracts";
import type { LayoutSolveResultV1 } from "@whitebox-world/layout-solver";
import { canonicalJsonBytes, sha256Bytes, sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  worldResourceLockEntriesV1,
  hashCanonicalSceneExecutionPlanV1,
  parseCanonicalSceneExecutionPlanV1,
  parseWorldRuntimeBootstrapV1,
  worldRuntimeBootstrapCanonicalBytesV1,
  type CanonicalSceneExecutionPlanV1,
  type BabylonNativeAssetLockEntryV1,
  type BabylonNativeAssetLockV1,
  type BabylonNativeDependencyLockV1,
  type BabylonNativeSceneBootstrapV1,
  type BabylonNativeSceneContributionV1,
  type BabylonNativeSceneModuleBundleManifestV1,
  type NativeSceneCheckResultV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import type {
  SceneAuthoringAttemptResultV1,
  SceneAuthoringAttemptV1,
  SceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  hashWorldBuildIdentityV1,
  worldPackageRefFromRootHashV1,
  type WorldBuildIdentityV1,
} from "@whitebox-world/world-identity";
import { isNil } from "lodash-es";

import {
  canonicalizeWorldPackageFileIntegrityEntriesV1,
  canonicalizeWorldPackageManifestV1,
  hashWorldPackageManifestV1,
  hashWorldPackageRootV1,
} from "./package-contract.js";
import { assembleWorldPackageDirectoryV1, type WorldPackageDirectoryFileV1, type WorldPackageDirectoryV1 } from "./package-directory.js";
import type {
  WorldPackageDistributionPolicyV1,
  WorldPackageHostCompatibilityV1,
  WorldPackageManifestV1,
  WorldPackageResourceBudgetV1,
  WorldPackageWorldBoundsV1,
} from "./package-types.js";

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export interface ResolvedCanonicalWorldPackageResourceArtifactV1 {
  readonly resourceRef: string;
  readonly packagePath: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly subjectAssetManifestHash: Sha256HashV1;
  readonly licenseDocumentId: string;
  readonly licenseSpdxExpression: string;
  readonly redistributionPolicy: "allowed" | "internal-only" | "prohibited";
  readonly sourceUri?: string;
  readonly author?: string;
}

export interface ResolvedBabylonNativeWorldPackageAssetV1 {
  readonly assetLockEntry: BabylonNativeAssetLockEntryV1;
  readonly bytes: Uint8Array;
}

export interface WorldPackageGeneratedResourceProvenanceV1 {
  readonly licenseDocumentId: string;
  readonly licenseSpdxExpression: string;
  readonly redistributionPolicy: "allowed" | "internal-only" | "prohibited";
  readonly sourceUri?: string;
  readonly author?: string;
}

export interface WorldPackageLicenseDocumentInputV1 {
  readonly id: string;
  readonly spdxLicenseExpression: string;
  readonly path: `LICENSES/${string}`;
  readonly text: string;
}

export interface WorldPackageSharedBuildContextV1 {
  readonly title: string;
  readonly sdkVersion: string;
  readonly distributionPolicy: WorldPackageDistributionPolicyV1;
  readonly hostCompatibility: WorldPackageHostCompatibilityV1;
  readonly generatedResourceProvenance: WorldPackageGeneratedResourceProvenanceV1;
  readonly licenseDocuments: readonly WorldPackageLicenseDocumentInputV1[];
  readonly noticeText: string;
}

export interface CanonicalWorldPackageBuildContextV1
  extends WorldPackageSharedBuildContextV1 {
  readonly canonicalAuthoringSchemaHash: Sha256HashV1;
  readonly aiSchemaProjectionProfile: Extract<
    WorldPackageManifestV1["sceneSource"],
    { readonly kind: "canonical-execution-plan" }
  >["aiSchemaProjectionProfile"];
  readonly includeAuthoringSpec: boolean;
}

export interface CreateCanonicalWorldPackageV1Input
  extends CanonicalWorldPackageBuildContextV1 {
  readonly packageId: string;
  readonly authoringSpec: AuthoringSpecV4;
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly layoutSolveResult: LayoutSolveResultV1;
  readonly executionPlan: CanonicalSceneExecutionPlanV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly resourceArtifacts:
    readonly ResolvedCanonicalWorldPackageResourceArtifactV1[];
}

export interface FrozenBabylonNativeWorldPackageBuildInputV1 {
  readonly shared: WorldPackageSharedBuildContextV1;
  readonly packageId: string;
  readonly worldId: string;
  readonly worldBounds: WorldPackageWorldBoundsV1;
  readonly resourceBudget: WorldPackageResourceBudgetV1;
  readonly nativeSceneBootstrap: BabylonNativeSceneBootstrapV1;
  readonly sceneModuleBundleManifest:
    BabylonNativeSceneModuleBundleManifestV1;
  readonly sceneModuleBundleBytes: Uint8Array;
  readonly dependencyLock: BabylonNativeDependencyLockV1;
  readonly assetLock: BabylonNativeAssetLockV1;
  readonly sceneAuthoringRouteDecision: SceneAuthoringRouteDecisionV1;
  readonly sceneAuthoringAttempt: SceneAuthoringAttemptV1;
  readonly sceneAuthoringAttemptResultRef: string;
  readonly sceneAuthoringAttemptResult: SceneAuthoringAttemptResultV1;
  readonly nativeSceneCheckResult: NativeSceneCheckResultV1;
  readonly nativeSceneContribution: BabylonNativeSceneContributionV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly registryLock: readonly import("@whitebox-world/runtime-contracts").WorldResourceLockEntryV1[];
  readonly resourceArtifacts:
    readonly ResolvedBabylonNativeWorldPackageAssetV1[];
}

interface LegalDocument {
  readonly id: string;
  readonly spdxLicenseExpression: string;
  readonly path: `LICENSES/${string}`;
  readonly bytes: Uint8Array;
  readonly contentHash: Sha256HashV1;
}

function invalid(path: string, message: string): never {
  throw new Error(`WORLD_PACKAGE_BUILD_INVALID: ${path.length === 0 ? message : `${path}: ${message}`}`);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || value.normalize("NFC") !== value) {
    invalid(path, "must be a non-empty canonical string");
  }
  return value;
}

function requireHash(value: unknown, path: string): Sha256HashV1 {
  if (typeof value !== "string" || !HASH_PATTERN.test(value) || value === `sha256:${"0".repeat(64)}`) {
    invalid(path, "must be a non-zero lowercase SHA-256 hash");
  }
  return value as Sha256HashV1;
}

function requireBytes(value: unknown, path: string): Uint8Array {
  if (!(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype) {
    invalid(path, "must be a plain Uint8Array");
  }
  return new Uint8Array(value);
}

function requireSafePath(value: unknown, path: string): string {
  const result = requireString(value, path);
  const segments = result.split("/");
  if (result.startsWith("/") || result.includes("\\") || /[\u0000-\u001f\u007f]/.test(result) ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === ".." || segment.includes(":"))) {
    invalid(path, "must be a safe package-local path");
  }
  return result;
}

function requireCanonicalText(value: unknown, path: string): string {
  if (
    typeof value !== "string" || value.length === 0 ||
    value.normalize("NFC") !== value || value.startsWith("\ufeff") ||
    value.includes("\u0000")
  ) invalid(path, "must be non-empty canonical UTF-8 text without BOM or NUL");
  const text = value;
  return text;
}

function jsonFile(path: string, value: unknown): WorldPackageDirectoryFileV1 {
  return { path, mediaType: "application/json", bytes: canonicalJsonBytes(value) };
}

function canonicalResources(
  input: readonly ResolvedCanonicalWorldPackageResourceArtifactV1[],
): readonly ResolvedCanonicalWorldPackageResourceArtifactV1[] {
  if (!Array.isArray(input)) invalid("resourceArtifacts", "must be an array");
  const rows = input.map((candidate, index) => {
    const path = `resourceArtifacts/${index}`;
    if (!["allowed", "internal-only", "prohibited"].includes(candidate.redistributionPolicy)) {
      invalid(`${path}/redistributionPolicy`, "is invalid");
    }
    return Object.freeze({
      resourceRef: requireString(candidate.resourceRef, `${path}/resourceRef`),
      packagePath: requireSafePath(candidate.packagePath, `${path}/packagePath`),
      mediaType: requireString(candidate.mediaType, `${path}/mediaType`),
      bytes: requireBytes(candidate.bytes, `${path}/bytes`),
      subjectAssetManifestHash: requireHash(candidate.subjectAssetManifestHash, `${path}/subjectAssetManifestHash`),
      licenseDocumentId: requireString(candidate.licenseDocumentId, `${path}/licenseDocumentId`),
      licenseSpdxExpression: requireString(candidate.licenseSpdxExpression, `${path}/licenseSpdxExpression`),
      redistributionPolicy: candidate.redistributionPolicy,
      ...(isNil(candidate.sourceUri) ? {} : { sourceUri: requireString(candidate.sourceUri, `${path}/sourceUri`) }),
      ...(isNil(candidate.author) ? {} : { author: requireString(candidate.author, `${path}/author`) }),
    });
  }).sort((left, right) => left.resourceRef.localeCompare(right.resourceRef));
  if (new Set(rows.map((row) => row.resourceRef)).size !== rows.length || new Set(rows.map((row) => row.packagePath)).size !== rows.length) {
    invalid("resourceArtifacts", "resource Refs and paths must be unique");
  }
  return Object.freeze(rows);
}

function canonicalLegalDocuments(input: readonly WorldPackageLicenseDocumentInputV1[], noticeText: string): readonly LegalDocument[] {
  if (!Array.isArray(input) || input.length === 0) invalid("licenseDocuments", "must contain at least one document");
  const rows = input.map((document, index) => {
    const path = `licenseDocuments/${index}`;
    const packagePath = requireSafePath(document.path, `${path}/path`);
    if (!packagePath.startsWith("LICENSES/")) invalid(`${path}/path`, "must be inside LICENSES/");
    const bytes = new TextEncoder().encode(requireCanonicalText(document.text, `${path}/text`));
    return Object.freeze({
      id: requireString(document.id, `${path}/id`),
      spdxLicenseExpression: requireString(document.spdxLicenseExpression, `${path}/spdxLicenseExpression`),
      path: packagePath as `LICENSES/${string}`,
      bytes,
      contentHash: sha256Bytes(bytes) as Sha256HashV1,
    });
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(rows.map((row) => row.id)).size !== rows.length || new Set(rows.map((row) => row.path)).size !== rows.length || rows.some((row) => !noticeText.includes(row.path))) {
    invalid("licenseDocuments", "documents must be unique and named by NOTICE");
  }
  return Object.freeze(rows);
}

function assertLegalClosure(
  input: CreateCanonicalWorldPackageV1Input,
  resources: readonly ResolvedCanonicalWorldPackageResourceArtifactV1[],
  documents: readonly LegalDocument[],
): void {
  const provenance = [...resources, input.generatedResourceProvenance];
  if (provenance.some((row) => row.redistributionPolicy === "prohibited") ||
    (input.distributionPolicy === "redistributable" && provenance.some((row) => row.redistributionPolicy !== "allowed"))) {
    invalid("distributionPolicy", "conflicts with resource policy");
  }
  const documentById = new Map(documents.map((row) => [row.id, row]));
  if (provenance.some((row) => documentById.get(row.licenseDocumentId)?.spdxLicenseExpression !== row.licenseSpdxExpression)) {
    invalid("licenseDocuments", "resource legal provenance is not closed");
  }
}

function createCanonicalWorldPackageV1Internal(
  input: CreateCanonicalWorldPackageV1Input,
): WorldPackageDirectoryV1 {
  const plan = parseCanonicalSceneExecutionPlanV1(input.executionPlan);
  const runtime = parseWorldRuntimeBootstrapV1(input.worldRuntimeBootstrap);
  const gameplay = input.gameplayBootstrap;
  const executionPlanHash = hashCanonicalSceneExecutionPlanV1(plan);
  if (gameplay.contentHash !== runtime.gameplayBootstrapHash || gameplay.resourceRef !== runtime.gameplayBootstrapRef ||
    plan.worldRuntimeBootstrapHash !== runtime.contentHash || plan.id !== input.normalizedWorldIr.id ||
    plan.normalizedWorldIrHash !== sha256CanonicalJson(input.normalizedWorldIr) ||
    plan.authoringSpecHash !== hashAuthoringDocumentV4(input.authoringSpec) ||
    input.layoutSolveResult.layoutSolveReportHash !== plan.layout.layoutSolveReportHash ||
    !gameplay.entityDescriptors.some((row) => row.id === runtime.initialControlledEntityId)) {
    invalid("closure", "Canonical artifacts do not form one world");
  }

  const resources = canonicalResources(input.resourceArtifacts);
  const assetsByRef = new Map(input.normalizedWorldIr.resources.subjectAssets.map((asset) => [asset.subjectAssetRef, asset]));
  if (resources.length !== assetsByRef.size || resources.some((resource) => assetsByRef.get(resource.resourceRef)?.subjectAssetManifestHash !== resource.subjectAssetManifestHash)) {
    invalid("resourceArtifacts", "must contain every and only Subject Asset");
  }
  const noticeText = requireCanonicalText(input.noticeText, "noticeText");
  const noticeBytes = new TextEncoder().encode(noticeText);
  const legalDocuments = canonicalLegalDocuments(input.licenseDocuments, noticeText);
  assertLegalClosure(input, resources, legalDocuments);

  const lockedResources = worldResourceLockEntriesV1([
    ...plan.sceneResourceLockEntries,
    ...runtime.runtimeResourceLockEntries,
    {
      resourceKind: "world-runtime-bootstrap",
      resourceRef: plan.worldRuntimeBootstrapRef,
      resolvedVersion: "1",
      contentHash: runtime.contentHash,
    },
  ]);
  const runtimeBytes = worldRuntimeBootstrapCanonicalBytesV1(runtime);
  const gameplayBytes = gameplayBootstrapCanonicalBytesV1(gameplay);
  const manifestResources = resources.map((resource) => ({ resourceRef: resource.resourceRef, packagePath: resource.packagePath, mediaType: resource.mediaType,
      sizeBytes: resource.bytes.byteLength, contentHash: sha256Bytes(resource.bytes) as Sha256HashV1,
      licenseDocumentId: resource.licenseDocumentId, redistributionPolicy: resource.redistributionPolicy,
      ...(isNil(resource.sourceUri) ? {} : { sourceUri: resource.sourceUri }), ...(isNil(resource.author) ? {} : { author: resource.author }) }))
    .sort((left, right) => left.resourceRef.localeCompare(right.resourceRef));

  const budget = input.authoringSpec.world.resourceBudget;
  const manifest = canonicalizeWorldPackageManifestV1({
    kind: "worldkit-world-package-manifest", schemaVersion: 1, id: requireString(input.packageId, "packageId"),
    title: requireString(input.title, "title"), packageFormatVersion: 1, sdkVersion: requireString(input.sdkVersion, "sdkVersion"),
    worldId: plan.id, seed: plan.seed, runtimeTarget: "babylon-web", canonicalizationProfile: "canonical-json-jcs@1", hashAlgorithm: "sha256",
    sceneSource: {
      kind: "canonical-execution-plan",
      authoringSchema: { schemaVersion: 4, contentHash: requireHash(input.canonicalAuthoringSchemaHash, "canonicalAuthoringSchemaHash") },
      aiSchemaProjectionProfile: input.aiSchemaProjectionProfile,
      normalizedWorldIrSchemaVersion: 4,
      canonicalSceneExecutionPlanSchemaVersion: 1,
      authoringSpecHash: plan.authoringSpecHash,
      normalizedWorldIrHash: plan.normalizedWorldIrHash,
      executionPlanHash,
      layoutSolveReportHash: plan.layout.layoutSolveReportHash,
      canonicalSceneExecutionPlanPath: "targets/babylon-web/canonical-scene-execution-plan.json",
    },
    worldRuntimeBootstrapSchemaVersion: 1,
    gameplayBootstrapHash: gameplay.contentHash, worldRuntimeBootstrapHash: runtime.contentHash,
    registryLockHash: sha256CanonicalJson(lockedResources) as Sha256HashV1,
    initialControlledEntityId: runtime.initialControlledEntityId,
    worldBounds: input.authoringSpec.world.bounds,
    resourceBudget: { maximumVertices: budget.maxVertices, maximumTriangles: budget.maxTriangles, maximumColliders: budget.maxColliders },
    lockedResources,
    entryPoint: { gameplayBootstrapPath: "gameplay/bootstrap.json", worldRuntimeBootstrapPath: "runtime/world-runtime-bootstrap.json" },
    legal: { distributionPolicy: input.distributionPolicy, noticePath: "NOTICE", licenseDocuments: legalDocuments.map((document) => ({ id: document.id, spdxLicenseExpression: document.spdxLicenseExpression, path: document.path, mediaType: "text/plain; charset=utf-8", sizeBytes: document.bytes.byteLength, contentHash: document.contentHash })) },
    hostCompatibility: input.hostCompatibility, resources: manifestResources,
  });

  const rootFiles: WorldPackageDirectoryFileV1[] = [
    jsonFile("manifest.json", manifest), ...(input.includeAuthoringSpec ? [jsonFile("authoring-spec.json", input.authoringSpec)] : []),
    jsonFile("world.normalized.json", input.normalizedWorldIr), jsonFile("registry-lock.json", lockedResources),
    jsonFile("layout-solve-report.json", input.layoutSolveResult.report),
    jsonFile("targets/babylon-web/canonical-scene-execution-plan.json", plan),
    { path: "gameplay/bootstrap.json", mediaType: "application/vnd.worldkit.gameplay-bootstrap+json", bytes: gameplayBytes },
    { path: "runtime/world-runtime-bootstrap.json", mediaType: "application/vnd.worldkit.world-runtime-bootstrap+json", bytes: runtimeBytes },
    ...resources.map((resource) => ({ path: resource.packagePath, mediaType: resource.mediaType, bytes: resource.bytes })),
    { path: "NOTICE", mediaType: "text/plain; charset=utf-8", bytes: noticeBytes },
    ...legalDocuments.map((document) => ({ path: document.path, mediaType: "text/plain; charset=utf-8", bytes: document.bytes })),
  ];
  return finalizeWorldPackageRootV1(manifest, rootFiles);
}

function finalizeWorldPackageRootV1(
  manifest: WorldPackageManifestV1,
  rootFiles: readonly WorldPackageDirectoryFileV1[],
): WorldPackageDirectoryV1 {
  const entries = canonicalizeWorldPackageFileIntegrityEntriesV1(rootFiles.map((file) => ({
    path: file.path,
    mediaType: file.mediaType,
    sizeBytes: file.bytes.byteLength,
    contentHash: sha256Bytes(file.bytes) as Sha256HashV1,
  })));
  const worldPackageRootHash = hashWorldPackageRootV1(entries);
  const worldPackageRef = worldPackageRefFromRootHashV1(worldPackageRootHash);
  const sceneSourceIdentity: WorldBuildIdentityV1["sceneSourceIdentity"] =
    manifest.sceneSource.kind === "canonical-execution-plan"
      ? Object.freeze({
          kind: "canonical-execution-plan",
          executionPlanHash: manifest.sceneSource.executionPlanHash,
        })
      : Object.freeze({
          kind: "babylon-native-scene",
          nativeSceneBootstrapHash:
            manifest.sceneSource.nativeSceneBootstrapHash,
          sceneModuleBundleHash: manifest.sceneSource.sceneModuleBundleHash,
          nativeSceneContributionHash:
            manifest.sceneSource.nativeSceneContributionHash,
        });
  const worldBuildIdentity: WorldBuildIdentityV1 = Object.freeze({ kind: "world-build-identity", schemaVersion: 1,
    id: `${manifest.id}.world-build`, worldPackageRef, worldPackageRootHash, gameplayBootstrapHash: manifest.gameplayBootstrapHash,
    worldRuntimeBootstrapHash: manifest.worldRuntimeBootstrapHash, sceneSourceIdentity });
  const receipt = Object.freeze({ kind: "worldkit-world-package-build-receipt" as const, schemaVersion: 1 as const, manifest,
    manifestHash: hashWorldPackageManifestV1(manifest), fileIntegrityEntries: entries, worldPackageRootHash, worldPackageRef,
    worldBuildIdentity, worldBuildIdentityHash: hashWorldBuildIdentityV1(worldBuildIdentity) });
  return assembleWorldPackageDirectoryV1({ receipt, files: rootFiles });
}

export function createCanonicalWorldPackageV1(
  input: CreateCanonicalWorldPackageV1Input,
): WorldPackageDirectoryV1 {
  try {
    return createCanonicalWorldPackageV1Internal(input);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("WORLD_PACKAGE_BUILD_INVALID")) throw error;
    invalid("", `trusted build closure validation failed: ${error instanceof Error ? error.message : "unknown owner failure"}`);
  }
}
