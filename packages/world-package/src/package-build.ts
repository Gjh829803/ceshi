import { hashAuthoringDocumentV4, type AuthoringSpecV4, type NormalizedWorldIRV4 } from "@whitebox-world/authoring";
import type { GameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import { gameplayBootstrapCanonicalBytesV1, parseGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import type { LayoutSolveResultV1 } from "@whitebox-world/layout-solver";
import { canonicalJsonBytes, sha256Bytes, sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  hashBabylonNativeAssetLockV1,
  hashBabylonNativeDependencyLockV1,
  hashBabylonNativeSceneBootstrapV1,
  hashBabylonNativeSceneContributionV1,
  hashNativeSceneCheckResultV1,
  parseBabylonNativeAssetLockV1,
  parseBabylonNativeDependencyLockV1,
  parseBabylonNativeSceneBootstrapV1,
  parseBabylonNativeSceneContributionV1,
  parseBabylonNativeSceneModuleBundleManifestV1,
  parseNativeSceneCheckResultV1,
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
  type WorldResourceLockEntryV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashSceneAuthoringAttemptResultV1,
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  parseSceneAuthoringAttemptResultV1,
  parseSceneAuthoringAttemptV1,
  parseSceneAuthoringRouteDecisionV1,
  type SceneAuthoringAttemptResultV1,
  type SceneAuthoringAttemptV1,
  type SceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  hashWorldBuildIdentityV1,
  worldPackageRefFromRootHashV1,
  type WorldBuildIdentityV1,
} from "@whitebox-world/world-identity";
import { isEqual, isNil } from "lodash-es";

import {
  assertBabylonNativeWorldPackageMembershipV1,
  canonicalizeWorldPackageFileIntegrityEntriesV1,
  canonicalizeWorldPackageManifestV1,
  hashWorldPackageManifestV1,
  hashWorldPackageRootV1,
  parseWorldPackageWorldBoundsV1,
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

interface NativeResourceArtifactV1 {
  readonly assetLockEntry: BabylonNativeAssetLockEntryV1;
  readonly bytes: Uint8Array;
  readonly licenseDocumentId: string;
  readonly redistributionPolicy: "allowed" | "internal-only";
}

function resourceVersion(resourceRef: string, path: string): string {
  const match = /@([1-9][0-9]*)$/.exec(resourceRef);
  if (isNil(match?.[1])) invalid(path, "must end with one positive version");
  return match[1];
}

function nativeBounds(
  input: WorldPackageWorldBoundsV1,
): WorldPackageWorldBoundsV1 {
  try {
    return parseWorldPackageWorldBoundsV1(input);
  } catch {
    return invalid("worldBounds", "must be finite positive bounds");
  }
}

function nativeBudget(
  input: WorldPackageResourceBudgetV1,
): WorldPackageResourceBudgetV1 {
  const values = [
    input.maximumVertices,
    input.maximumTriangles,
    input.maximumColliders,
  ];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 1)) {
    invalid("resourceBudget", "must contain positive safe integers");
  }
  return Object.freeze({
    maximumVertices: input.maximumVertices,
    maximumTriangles: input.maximumTriangles,
    maximumColliders: input.maximumColliders,
  });
}

function nativePositionInsideBounds(
  position: readonly number[],
  bounds: WorldPackageWorldBoundsV1,
): boolean {
  if (position.length !== 3 || position.some((value) => !Number.isFinite(value))) {
    return false;
  }
  const halfX = bounds.sizeMetersXZ[0] / 2;
  const halfZ = bounds.sizeMetersXZ[1] / 2;
  return position[0]! >= bounds.centerMetersXZ[0] - halfX &&
    position[0]! <= bounds.centerMetersXZ[0] + halfX &&
    position[2]! >= bounds.centerMetersXZ[1] - halfZ &&
    position[2]! <= bounds.centerMetersXZ[1] + halfZ &&
    position[1]! >= bounds.heightRangeMeters[0] &&
    position[1]! <= bounds.heightRangeMeters[1];
}

function assertNativeWorldFacts(
  contribution: BabylonNativeSceneContributionV1,
  bootstrap: BabylonNativeSceneBootstrapV1,
  bounds: WorldPackageWorldBoundsV1,
  budget: WorldPackageResourceBudgetV1,
): void {
  const vertexCount = contribution.staticColliders.reduce(
    (sum, collider) => sum + collider.vertexCount,
    0,
  );
  const triangleCount = contribution.staticColliders.reduce(
    (sum, collider) => sum + collider.triangleCount,
    0,
  );
  if (
    contribution.spawnMarker.id !== bootstrap.spawnMarkerId ||
    !nativePositionInsideBounds(contribution.spawnMarker.positionMetersXYZ, bounds) ||
    contribution.staticColliders.length > budget.maximumColliders ||
    vertexCount > budget.maximumVertices ||
    triangleCount > budget.maximumTriangles
  ) invalid("nativeSceneContribution", "world facts or budget do not close");
  for (const collider of contribution.staticColliders) {
    for (let index = 0; index < collider.worldPositionsMetersXYZ.length; index += 3) {
      if (!nativePositionInsideBounds(
        collider.worldPositionsMetersXYZ.slice(index, index + 3),
        bounds,
      )) invalid("nativeSceneContribution", "collider vertex is outside world bounds");
    }
  }
}

function nativeResources(
  input: FrozenBabylonNativeWorldPackageBuildInputV1,
  assetLock: BabylonNativeAssetLockV1,
  legalDocuments: readonly LegalDocument[],
): readonly NativeResourceArtifactV1[] {
  if (!Array.isArray(input.resourceArtifacts)) {
    invalid("resourceArtifacts", "must be an array");
  }
  const lockByRef = new Map(assetLock.entries.map((entry) =>
    [entry.assetResourceRef, entry] as const));
  const documentByPath = new Map(legalDocuments.map((document) =>
    [document.path, document] as const));
  const rows = input.resourceArtifacts.map((resource, index) => {
    const path = `resourceArtifacts/${index}`;
    const expectedEntry = lockByRef.get(resource.assetLockEntry.assetResourceRef);
    if (isNil(expectedEntry) || !isEqual(expectedEntry, resource.assetLockEntry)) {
      invalid(path, "Asset Lock entry mismatch");
    }
    const bytes = requireBytes(resource.bytes, `${path}/bytes`);
    if (
      bytes.byteLength !== expectedEntry.artifactSizeBytes ||
      sha256Bytes(bytes) !== expectedEntry.artifactContentHash
    ) invalid(path, "asset bytes mismatch");
    if (!expectedEntry.license.licenseDocumentPath.startsWith("LICENSES/")) {
      invalid(path, "asset license document must be packaged under LICENSES/");
    }
    const licenseDocument = documentByPath.get(
      expectedEntry.license.licenseDocumentPath as `LICENSES/${string}`,
    );
    if (
      isNil(licenseDocument) ||
      licenseDocument.spdxLicenseExpression !== expectedEntry.license.spdxExpression
    ) invalid(path, "asset license document mismatch");
    return Object.freeze({
      assetLockEntry: expectedEntry,
      bytes,
      licenseDocumentId: licenseDocument.id,
      redistributionPolicy: expectedEntry.redistributionPolicy === "redistributable"
        ? "allowed" as const
        : "internal-only" as const,
    });
  }).sort((left, right) => left.assetLockEntry.assetResourceRef.localeCompare(
    right.assetLockEntry.assetResourceRef,
  ));
  if (
    rows.length !== assetLock.entries.length ||
    !isEqual(
      rows.map(({ assetLockEntry }) => assetLockEntry.assetResourceRef),
      assetLock.entries.map(({ assetResourceRef }) => assetResourceRef),
    )
  ) invalid("resourceArtifacts", "must contain every and only locked asset");
  return Object.freeze(rows);
}

function assertNativeLegalClosure(
  input: FrozenBabylonNativeWorldPackageBuildInputV1,
  resources: readonly NativeResourceArtifactV1[],
  legalDocuments: readonly LegalDocument[],
): void {
  const generated = input.shared.generatedResourceProvenance;
  const generatedDocument = legalDocuments.find((document) =>
    document.id === generated.licenseDocumentId);
  if (
    isNil(generatedDocument) ||
    generatedDocument.spdxLicenseExpression !== generated.licenseSpdxExpression ||
    generated.redistributionPolicy === "prohibited" ||
    (input.shared.distributionPolicy === "redistributable" &&
      (generated.redistributionPolicy !== "allowed" ||
        resources.some((resource) =>
          resource.redistributionPolicy !== "allowed")))
  ) invalid("legal", "Native resource legal closure failed");
}

function nativeRegistryLock(
  input: FrozenBabylonNativeWorldPackageBuildInputV1,
  runtime: WorldRuntimeBootstrapV1,
  bundle: BabylonNativeSceneModuleBundleManifestV1,
  assets: BabylonNativeAssetLockV1,
  contribution: BabylonNativeSceneContributionV1,
): readonly WorldResourceLockEntryV1[] {
  const supplied = worldResourceLockEntriesV1(input.registryLock);
  const worldRuntimeRows = supplied.filter((entry) =>
    entry.resourceKind === "world-runtime-bootstrap" &&
    entry.contentHash === runtime.contentHash);
  if (worldRuntimeRows.length !== 1) {
    invalid("registryLock", "must contain one World Runtime Bootstrap");
  }
  const traversalRefs = new Set(contribution.staticColliders.flatMap((collider) =>
    collider.traversalBinding.kind === "static-surface"
      ? [collider.traversalBinding.traversalSurfaceProfileRef]
      : []));
  const traversalRows = [...traversalRefs].map((resourceRef) => {
    const rows = supplied.filter((entry) =>
      entry.resourceKind === "traversal-surface-profile" &&
      entry.resourceRef === resourceRef);
    if (rows.length !== 1) {
      invalid("registryLock", "traversal profile closure mismatch");
    }
    return rows[0]!;
  });
  const expected = worldResourceLockEntriesV1([
    ...runtime.runtimeResourceLockEntries,
    worldRuntimeRows[0]!,
    {
      resourceKind: "native-scene",
      resourceRef: bundle.sceneModuleRef,
      resolvedVersion: resourceVersion(bundle.sceneModuleRef, "sceneModuleRef"),
      contentHash: bundle.sourceGraphHash,
    },
    {
      resourceKind: "native-scene-api",
      resourceRef: bundle.nativeSceneApi.resourceRef,
      resolvedVersion: bundle.nativeSceneApi.resolvedVersion,
      contentHash: bundle.nativeSceneApi.contentHash,
    },
    {
      resourceKind: "native-scene-profile",
      resourceRef: bundle.nativeSceneProfile.resourceRef,
      resolvedVersion: bundle.nativeSceneProfile.resolvedVersion,
      contentHash: bundle.nativeSceneProfile.contentHash,
    },
    ...assets.entries.map((asset) => ({
      resourceKind: "static-geometry-asset" as const,
      resourceRef: asset.assetResourceRef,
      resolvedVersion: resourceVersion(asset.assetResourceRef, "assetResourceRef"),
      contentHash: asset.resourceManifestHash,
    })),
    ...traversalRows,
  ]);
  if (!isEqual(supplied, expected)) {
    invalid("registryLock", "must equal the exact Native transitive closure");
  }
  return supplied;
}

function createBabylonNativeWorldPackageV1Internal(
  input: FrozenBabylonNativeWorldPackageBuildInputV1,
): WorldPackageDirectoryV1 {
  const bootstrap = parseBabylonNativeSceneBootstrapV1(
    input.nativeSceneBootstrap,
  );
  const bundle = parseBabylonNativeSceneModuleBundleManifestV1(
    input.sceneModuleBundleManifest,
  );
  const bundleBytes = requireBytes(
    input.sceneModuleBundleBytes,
    "sceneModuleBundleBytes",
  );
  const dependencyLock = parseBabylonNativeDependencyLockV1(
    input.dependencyLock,
  );
  const assetLock = parseBabylonNativeAssetLockV1(input.assetLock);
  const route = parseSceneAuthoringRouteDecisionV1(
    input.sceneAuthoringRouteDecision,
  );
  const attempt = parseSceneAuthoringAttemptV1(input.sceneAuthoringAttempt);
  const attemptResult = parseSceneAuthoringAttemptResultV1(
    input.sceneAuthoringAttemptResult,
  );
  const check = parseNativeSceneCheckResultV1(input.nativeSceneCheckResult);
  const contribution = parseBabylonNativeSceneContributionV1(
    input.nativeSceneContribution,
  );
  const gameplay = parseGameplayBootstrapV1(input.gameplayBootstrap);
  const runtime = parseWorldRuntimeBootstrapV1(input.worldRuntimeBootstrap);
  const bounds = nativeBounds(input.worldBounds);
  const budget = nativeBudget(input.resourceBudget);
  if (
    bundle.fileInventory.length !== 1 ||
    bundle.fileInventory[0]?.path !== bundle.entryPath ||
    bundleBytes.byteLength !== bundle.bundleSizeBytes ||
    sha256Bytes(bundleBytes) !== bundle.bundleContentHash ||
    hashBabylonNativeDependencyLockV1(dependencyLock) !==
      bundle.dependencyLockHash ||
    hashBabylonNativeAssetLockV1(assetLock) !== bundle.assetLockHash ||
    route.decision.kind !== "babylon-native" ||
    attempt.sceneAuthoringRouteDecisionHash !==
      hashSceneAuthoringRouteDecisionV1(route) ||
    attempt.sceneBriefRef !== route.sceneBriefRef ||
    attempt.sceneBriefHash !== route.sceneBriefHash ||
    attempt.authoringProfileRef !== route.decision.authoringProfileRef ||
    attempt.sourceInput.kind !== "babylon-native" ||
    attempt.sourceInput.bootstrapInputHash !==
      hashBabylonNativeSceneBootstrapV1(bootstrap) ||
    attempt.seed !== bootstrap.seed ||
    attemptResult.outcome !== "completed" ||
    attemptResult.sceneAuthoringAttemptHash !== hashSceneAuthoringAttemptV1(attempt) ||
    attemptResult.authoredSourceRef !== bootstrap.sceneModuleRef ||
    attemptResult.authoredSourceHash !== bundle.sourceGraphHash ||
    check.outcome !== "passed" ||
    check.checkedInput.kind !== "native-scene-module" ||
    check.checkedInput.sceneModuleRef !== bootstrap.sceneModuleRef ||
    contribution.sceneModuleRef !== bootstrap.sceneModuleRef ||
    contribution.profileSettlement.profileRef !==
      bootstrap.nativeSceneProfileRef ||
    bundle.sceneModuleRef !== bootstrap.sceneModuleRef ||
    bundle.nativeSceneApi.resourceRef !== bootstrap.nativeSceneApiRef ||
    bundle.nativeSceneProfile.resourceRef !== bootstrap.nativeSceneProfileRef ||
    bundle.seed !== bootstrap.seed ||
    bootstrap.gameplayBootstrapRef !== gameplay.resourceRef ||
    runtime.gameplayBootstrapRef !== gameplay.resourceRef ||
    runtime.gameplayBootstrapHash !== gameplay.contentHash ||
    runtime.initialControlledEntityId !== bootstrap.initialControlledEntityId
  ) invalid("closure", "Native artifacts do not form one world");
  assertNativeWorldFacts(contribution, bootstrap, bounds, budget);
  const lockedResources = nativeRegistryLock(
    input,
    runtime,
    bundle,
    assetLock,
    contribution,
  );

  const noticeText = requireCanonicalText(input.shared.noticeText, "noticeText");
  const noticeBytes = new TextEncoder().encode(noticeText);
  const legalDocuments = canonicalLegalDocuments(
    input.shared.licenseDocuments,
    noticeText,
  );
  const resources = nativeResources(input, assetLock, legalDocuments);
  assertNativeLegalClosure(input, resources, legalDocuments);
  const manifestResources = resources.map((resource) => ({
    resourceRef: resource.assetLockEntry.assetResourceRef,
    packagePath: resource.assetLockEntry.artifactPath,
    mediaType: resource.assetLockEntry.mediaType,
    sizeBytes: resource.bytes.byteLength,
    contentHash: resource.assetLockEntry.artifactContentHash,
    licenseDocumentId: resource.licenseDocumentId,
    redistributionPolicy: resource.redistributionPolicy,
    sourceUri: resource.assetLockEntry.provenance.sourceUri,
    author: resource.assetLockEntry.provenance.author,
  }));
  const sceneSource = {
    kind: "babylon-native-scene" as const,
    nativeSceneBootstrapHash: hashBabylonNativeSceneBootstrapV1(bootstrap),
    sceneModuleBundleHash: bundle.bundleContentHash,
    nativeSceneContributionHash:
      hashBabylonNativeSceneContributionV1(contribution),
    dependencyLockHash: hashBabylonNativeDependencyLockV1(dependencyLock),
    assetLockHash: hashBabylonNativeAssetLockV1(assetLock),
    nativeSceneCheckResultHash: hashNativeSceneCheckResultV1(check),
    sceneAuthoringRouteDecisionHash:
      hashSceneAuthoringRouteDecisionV1(route),
    sceneAuthoringAttemptHash: hashSceneAuthoringAttemptV1(attempt),
    sceneAuthoringAttemptResultRef: requireString(
      input.sceneAuthoringAttemptResultRef,
      "sceneAuthoringAttemptResultRef",
    ),
    sceneAuthoringAttemptResultHash:
      hashSceneAuthoringAttemptResultV1(attemptResult),
    nativeSceneBootstrapPath: "native/bootstrap.json" as const,
    sceneModuleBundleManifestPath: "native/module-bundle.json" as const,
    sceneModuleBundlePath: "native/scene.mjs" as const,
    dependencyLockPath: "native/dependency-lock.json" as const,
    assetLockPath: "native/asset-lock.json" as const,
    nativeSceneContributionPath: "native/contribution.json" as const,
    nativeSceneCheckResultPath: "native/check-result.json" as const,
    sceneAuthoringRouteDecisionPath:
      "authoring/scene-authoring-route-decision.json" as const,
    sceneAuthoringAttemptPath:
      "authoring/scene-authoring-attempt.json" as const,
    sceneAuthoringAttemptResultPath:
      "authoring/scene-authoring-attempt-result.json" as const,
  };
  const manifest = canonicalizeWorldPackageManifestV1({
    kind: "worldkit-world-package-manifest",
    schemaVersion: 1,
    id: requireString(input.packageId, "packageId"),
    title: requireString(input.shared.title, "title"),
    packageFormatVersion: 1,
    sdkVersion: requireString(input.shared.sdkVersion, "sdkVersion"),
    worldId: requireString(input.worldId, "worldId"),
    seed: bootstrap.seed,
    runtimeTarget: "babylon-web",
    canonicalizationProfile: "canonical-json-jcs@1",
    hashAlgorithm: "sha256",
    sceneSource,
    worldRuntimeBootstrapSchemaVersion: 1,
    gameplayBootstrapHash: gameplay.contentHash,
    worldRuntimeBootstrapHash: runtime.contentHash,
    registryLockHash: sha256CanonicalJson(lockedResources) as Sha256HashV1,
    initialControlledEntityId: runtime.initialControlledEntityId,
    worldBounds: bounds,
    resourceBudget: budget,
    lockedResources,
    entryPoint: {
      gameplayBootstrapPath: "gameplay/bootstrap.json",
      worldRuntimeBootstrapPath: "runtime/world-runtime-bootstrap.json",
    },
    legal: {
      distributionPolicy: input.shared.distributionPolicy,
      noticePath: "NOTICE",
      licenseDocuments: legalDocuments.map((document) => ({
        id: document.id,
        spdxLicenseExpression: document.spdxLicenseExpression,
        path: document.path,
        mediaType: "text/plain; charset=utf-8" as const,
        sizeBytes: document.bytes.byteLength,
        contentHash: document.contentHash,
      })),
    },
    hostCompatibility: input.shared.hostCompatibility,
    resources: manifestResources,
  });
  const rootFiles: WorldPackageDirectoryFileV1[] = [
    jsonFile("manifest.json", manifest),
    jsonFile("registry-lock.json", lockedResources),
    {
      path: "gameplay/bootstrap.json",
      mediaType: "application/vnd.worldkit.gameplay-bootstrap+json",
      bytes: gameplayBootstrapCanonicalBytesV1(gameplay),
    },
    {
      path: "runtime/world-runtime-bootstrap.json",
      mediaType: "application/vnd.worldkit.world-runtime-bootstrap+json",
      bytes: worldRuntimeBootstrapCanonicalBytesV1(runtime),
    },
    jsonFile(sceneSource.nativeSceneBootstrapPath, bootstrap),
    jsonFile(sceneSource.sceneModuleBundleManifestPath, bundle),
    {
      path: sceneSource.sceneModuleBundlePath,
      mediaType: bundle.bundleMediaType,
      bytes: bundleBytes,
    },
    jsonFile(sceneSource.dependencyLockPath, dependencyLock),
    jsonFile(sceneSource.assetLockPath, assetLock),
    jsonFile(sceneSource.nativeSceneContributionPath, contribution),
    jsonFile(sceneSource.nativeSceneCheckResultPath, check),
    jsonFile(sceneSource.sceneAuthoringRouteDecisionPath, route),
    jsonFile(sceneSource.sceneAuthoringAttemptPath, attempt),
    jsonFile(sceneSource.sceneAuthoringAttemptResultPath, attemptResult),
    ...resources.map((resource) => ({
      path: resource.assetLockEntry.artifactPath,
      mediaType: resource.assetLockEntry.mediaType,
      bytes: resource.bytes,
    })),
    { path: "NOTICE", mediaType: "text/plain; charset=utf-8", bytes: noticeBytes },
    ...legalDocuments.map((document) => ({
      path: document.path,
      mediaType: "text/plain; charset=utf-8",
      bytes: document.bytes,
    })),
  ];
  const directory = finalizeWorldPackageRootV1(manifest, rootFiles);
  assertBabylonNativeWorldPackageMembershipV1({
    nativeSceneBootstrap: bootstrap,
    sceneModuleBundleManifest: bundle,
    dependencyLock,
    assetLock,
    sceneAuthoringRouteDecision: route,
    sceneAuthoringAttempt: attempt,
    sceneAuthoringAttemptResult: attemptResult,
    nativeSceneCheckResult: check,
    nativeSceneContribution: contribution,
    gameplayBootstrap: gameplay,
    worldRuntimeBootstrap: runtime,
    worldPackageBuildReceipt: directory.receipt,
  });
  return directory;
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

export function createBabylonNativeWorldPackageV1(
  input: FrozenBabylonNativeWorldPackageBuildInputV1,
): WorldPackageDirectoryV1 {
  try {
    return createBabylonNativeWorldPackageV1Internal(input);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("WORLD_PACKAGE_BUILD_INVALID")
    ) throw error;
    invalid(
      "",
      `trusted Native build closure validation failed: ${
        error instanceof Error ? error.message : "unknown owner failure"
      }`,
    );
  }
}
