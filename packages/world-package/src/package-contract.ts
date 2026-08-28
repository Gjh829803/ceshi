import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import { canonicalExecutionResourceLockEntriesV1 } from "@whitebox-world/runtime-contracts";
import { hashExecutionPlanV5, parseExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import {
  createGameplayBootstrapResourceLockEntryV1,
  gameplayBootstrapCanonicalBytesV1,
  parseGameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import { isEmpty, isEqual, isNil, isPlainObject } from "lodash-es";

import {
  assertSafeWorldPackagePathV1,
  assertWorldPackageAccessorFreeDataGraphV1,
  canonicalWorldPackageFileIntegrityEntriesV1,
  deepFreeze,
  hashWorldPackageManifestV1,
} from "./manifest.js";
import { assertWorldPackageBuildReceiptV1 } from "./build-receipt.js";
import {
  GAMEPLAY_BOOTSTRAP_MEDIA_TYPE_V1,
  GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1,
} from "./build-receipt.js";
import type {
  WorldPackageFileIntegrityEntryV1,
} from "./types.js";
import type {
  MigrateWorldPackageBuildReceiptV1ToV2Input,
  MigrateWorldPackageBuildReceiptV1ToV2Result,
  WorldPackageBuildReceiptV2,
  WorldPackageDistributionPolicyV2,
  WorldPackageHostPolicyV1,
  WorldPackageGameplayBootstrapMembershipInputV2,
  WorldPackageManifestV2,
  WorldPackageMigrationReportV1,
  WorldPackageResourceArtifactV2,
  WorldPackageSignatureEnvelopeV1,
} from "./v2-types.js";

type UnknownRecord = Record<string, unknown>;

const MANIFEST_FIELDS_V2 = [
  "kind",
  "schemaVersion",
  "id",
  "title",
  "packageFormatVersion",
  "sdkVersion",
  "worldId",
  "seed",
  "runtimeTarget",
  "canonicalizationProfile",
  "hashAlgorithm",
  "authoringSchema",
  "aiSchemaProjectionProfile",
  "normalizedWorldIrSchemaVersion",
  "executionPlanSchemaVersion",
  "authoringSpecHash",
  "normalizedWorldIrHash",
  "executionPlanHash",
  "registryLockHash",
  "layoutSolveReportHash",
  "initialControlledEntityId",
  "worldBounds",
  "resourceBudget",
  "lockedResources",
  "entryPoint",
  "legal",
  "hostCompatibility",
  "resources",
] as const;
const AUTHORING_SCHEMA_FIELDS = ["schemaVersion", "contentHash"] as const;
const AI_SCHEMA_PROFILE_FIELDS = ["resourceRef", "contentHash"] as const;
const WORLD_BOUNDS_FIELDS = [
  "centerMetersXZ",
  "sizeMetersXZ",
  "heightRangeMeters",
] as const;
const RESOURCE_BUDGET_FIELDS = [
  "maximumVertices",
  "maximumTriangles",
  "maximumColliders",
] as const;
const ENTRY_POINT_FIELDS = [
  "executionPlanPath",
  "gameplayBootstrapPath",
] as const;
const LEGAL_FIELDS = [
  "distributionPolicy",
  "noticePath",
  "licenseDocuments",
] as const;
const LICENSE_DOCUMENT_FIELDS = [
  "id",
  "spdxLicenseExpression",
  "path",
  "mediaType",
  "sizeBytes",
  "contentHash",
] as const;
const HOST_COMPATIBILITY_FIELDS = [
  "profileRef",
  "profileHash",
  "runtimeContractVersion",
  "requiredFeatureIds",
] as const;
const RESOURCE_REQUIRED_FIELDS = [
  "resourceRef",
  "packagePath",
  "mediaType",
  "sizeBytes",
  "contentHash",
  "licenseDocumentId",
  "redistributionPolicy",
] as const;
const RESOURCE_ALLOWED_FIELDS = [
  ...RESOURCE_REQUIRED_FIELDS,
  "sourceUri",
  "author",
] as const;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const RECEIPT_FIELDS_V2 = [
  "kind",
  "schemaVersion",
  "manifest",
  "manifestHash",
  "fileIntegrityEntries",
  "worldPackageRootHash",
] as const;
const SIGNATURE_ENVELOPE_FIELDS_V1 = [
  "kind",
  "schemaVersion",
  "packageRootHash",
  "packageId",
  "packageFormatVersion",
  "runtimeTarget",
  "signatureAlgorithm",
  "keyId",
  "trustDomain",
  "signedAt",
] as const;
const HOST_POLICY_FIELDS_V1 = [
  "acceptedRuntimeTargets",
  "acceptedPackageFormatVersions",
  "acceptedManifestSchemaVersions",
  "runtimeContractVersion",
  "supportedFeatureIds",
  "trustedCompatibilityProfiles",
  "allowedDistributionPolicies",
  "signaturePolicy",
] as const;
const TRUSTED_COMPATIBILITY_PROFILE_FIELDS_V1 = [
  "profileRef",
  "profileHash",
] as const;
const MIGRATION_INPUT_FIELDS = ["sourceReceipt", "context"] as const;
const MIGRATION_CONTEXT_FIELDS = [
  "title",
  "sdkVersion",
  "canonicalAuthoringSchemaHash",
  "aiSchemaProjectionProfile",
  "worldBounds",
  "resourceBudget",
  "lockedResources",
  "legal",
  "hostCompatibility",
  "resources",
  "v2OnlyFileIntegrityEntries",
] as const;
const MIGRATION_REPORT_FIELDS = [
  "kind",
  "schemaVersion",
  "sourceManifestSchemaVersion",
  "targetManifestSchemaVersion",
  "sourceWorldPackageRootHash",
  "targetWorldPackageRootHash",
  "sourceManifestHash",
  "targetManifestHash",
  "migratedFieldIds",
] as const;
const MIGRATED_FIELD_IDS_V1 = Object.freeze([
  "ai-schema-projection-profile",
  "authoring-schema",
  "host-compatibility",
  "legal",
  "manifest-v1-to-v2",
  "package-format-v1-to-v2",
  "registry-lock-rename",
  "resource-budget",
  "resource-legal-provenance",
  "world-bounds",
] as const);

function fail(path: string, message: string): never {
  throw new Error(
    `WORLD_PACKAGE_MANIFEST_V2_INVALID: ${isEmpty(path) ? message : `${path}: ${message}`}`,
  );
}

function requireExactRecord(
  value: unknown,
  requiredFields: readonly string[],
  path: string,
  allowedFields: readonly string[] = requiredFields,
): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    fail(path, "expected a plain object");
  }
  const record = value as UnknownRecord;
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) fail(path, `unknown field '${unknown}'`);
  for (const field of requiredFields) {
    if (!Object.hasOwn(record, field) || isNil(record[field])) {
      fail(path, `missing field '${field}'`);
    }
  }
  return record;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || isEmpty(value) || value.trim() !== value) {
    fail(path, "must be a non-empty canonical string");
  }
  return value;
}

function requireAbsoluteUri(value: unknown, path: string): string {
  const uri = requireString(value, path);
  try {
    const parsed = new URL(uri);
    if (isEmpty(parsed.protocol)) fail(path, "must be an absolute URI");
  } catch {
    fail(path, "must be an absolute URI");
  }
  return uri;
}

function requireResourceRef(value: unknown, path: string): string {
  const ref = requireString(value, path);
  if (!ref.startsWith("worldkit://") && !ref.startsWith("package://")) {
    fail(path, "must be a Registry or WorldPackage resource Ref");
  }
  return ref;
}

function requireHash(value: unknown, path: string): Sha256HashV1 {
  if (typeof value !== "string" || !HASH_PATTERN.test(value) || value === ZERO_HASH) {
    fail(path, "must be a non-zero lowercase sha256 hash");
  }
  return value as Sha256HashV1;
}

function requireNonNegativeSafeInteger(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    Object.is(value, -0)
  ) {
    fail(path, "must be a non-negative safe integer");
  }
  return value;
}

function isPlainDenseArray(value: unknown): value is readonly unknown[] {
  return (
    Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    Object.getOwnPropertyNames(value).length === value.length + 1
  );
}

function requirePlainDenseArray(value: unknown, path: string): readonly unknown[] {
  if (!isPlainDenseArray(value)) {
    fail(path, "must be a plain dense array");
  }
  return value;
}

function requireFiniteTuple2(value: unknown, path: string): readonly [number, number] {
  if (
    !isPlainDenseArray(value) ||
    value.length !== 2 ||
    value.some((item) =>
      typeof item !== "number" || !Number.isFinite(item) || Object.is(item, -0)
    )
  ) {
    fail(path, "must be a finite two-number tuple");
  }
  return [value[0] as number, value[1] as number];
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireCanonicalStringArray(value: unknown, path: string): readonly string[] {
  const values = requirePlainDenseArray(value, path);
  const rows = values.map((item, index) => requireString(item, `${path}/${index}`));
  const canonical = [...rows].sort(compareStrings);
  if (new Set(rows).size !== rows.length || !isEqual(rows, canonical)) {
    fail(path, "must contain unique strings in canonical order");
  }
  return rows;
}

function requireSafePath(value: unknown, path: string): string {
  try {
    return assertSafeWorldPackagePathV1(value, path, "WORLD_PACKAGE_MANIFEST_V2_INVALID");
  } catch {
    fail(path, "must be a safe package-local path");
  }
}

export function canonicalWorldPackageManifestV2(
  value: unknown,
): WorldPackageManifestV2 {
  try {
    assertWorldPackageAccessorFreeDataGraphV1(
      value,
      "WORLD_PACKAGE_MANIFEST_V2_ACCESSOR_FORBIDDEN",
    );
  } catch {
    fail("", "accessors, symbol keys, and invalid byte views are forbidden");
  }
  const record = requireExactRecord(value, MANIFEST_FIELDS_V2, "");
  if (record.kind !== "worldkit-world-package-manifest") {
    fail("kind", "invalid kind");
  }
  if (record.schemaVersion !== 2) fail("schemaVersion", "must be 2");
  if (record.packageFormatVersion !== 2) {
    fail("packageFormatVersion", "must be 2");
  }
  if (record.runtimeTarget !== "babylon-web") {
    fail("runtimeTarget", "must be babylon-web");
  }
  if (record.canonicalizationProfile !== "canonical-json-jcs@1") {
    fail("canonicalizationProfile", "must be canonical-json-jcs@1");
  }
  if (record.hashAlgorithm !== "sha256") {
    fail("hashAlgorithm", "must be sha256");
  }
  if (record.normalizedWorldIrSchemaVersion !== 4) {
    fail("normalizedWorldIrSchemaVersion", "must be 4");
  }
  if (record.executionPlanSchemaVersion !== 5) {
    fail("executionPlanSchemaVersion", "must be 5");
  }
  const id = requireString(record.id, "id");
  const title = requireString(record.title, "title");
  const sdkVersion = requireString(record.sdkVersion, "sdkVersion");
  if (!SEMVER_PATTERN.test(sdkVersion)) fail("sdkVersion", "must be SemVer");
  const worldId = requireString(record.worldId, "worldId");
  const seed = requireNonNegativeSafeInteger(record.seed, "seed");

  const authoringSchema = requireExactRecord(
    record.authoringSchema,
    AUTHORING_SCHEMA_FIELDS,
    "authoringSchema",
  );
  if (authoringSchema.schemaVersion !== 4) {
    fail("authoringSchema/schemaVersion", "must be 4");
  }
  const canonicalAuthoringSchema = {
    schemaVersion: 4 as const,
    contentHash: requireHash(
      authoringSchema.contentHash,
      "authoringSchema/contentHash",
    ),
  };

  const aiSchemaProfile = requireExactRecord(
    record.aiSchemaProjectionProfile,
    AI_SCHEMA_PROFILE_FIELDS,
    "aiSchemaProjectionProfile",
  );
  const canonicalAiSchemaProfile = {
    resourceRef: requireResourceRef(
      aiSchemaProfile.resourceRef,
      "aiSchemaProjectionProfile/resourceRef",
    ),
    contentHash: requireHash(
      aiSchemaProfile.contentHash,
      "aiSchemaProjectionProfile/contentHash",
    ),
  };

  const bounds = requireExactRecord(
    record.worldBounds,
    WORLD_BOUNDS_FIELDS,
    "worldBounds",
  );
  const centerMetersXZ = requireFiniteTuple2(
    bounds.centerMetersXZ,
    "worldBounds/centerMetersXZ",
  );
  const sizeMetersXZ = requireFiniteTuple2(
    bounds.sizeMetersXZ,
    "worldBounds/sizeMetersXZ",
  );
  const heightRangeMeters = requireFiniteTuple2(
    bounds.heightRangeMeters,
    "worldBounds/heightRangeMeters",
  );
  if (sizeMetersXZ.some((value) => value <= 0)) {
    fail("worldBounds/sizeMetersXZ", "values must be positive");
  }
  if (heightRangeMeters[0] > heightRangeMeters[1]) {
    fail("worldBounds/heightRangeMeters", "minimum must not exceed maximum");
  }

  const budget = requireExactRecord(
    record.resourceBudget,
    RESOURCE_BUDGET_FIELDS,
    "resourceBudget",
  );
  const resourceBudget = {
    maximumVertices: requireNonNegativeSafeInteger(
      budget.maximumVertices,
      "resourceBudget/maximumVertices",
    ),
    maximumTriangles: requireNonNegativeSafeInteger(
      budget.maximumTriangles,
      "resourceBudget/maximumTriangles",
    ),
    maximumColliders: requireNonNegativeSafeInteger(
      budget.maximumColliders,
      "resourceBudget/maximumColliders",
    ),
  };

  let lockedResources;
  try {
    requirePlainDenseArray(record.lockedResources, "lockedResources");
    lockedResources = canonicalExecutionResourceLockEntriesV1(
      record.lockedResources,
    );
  } catch {
    fail("lockedResources", "must be a canonical Execution Resource Lock");
  }
  if (isEmpty(lockedResources)) {
    fail("lockedResources", "must bind at least one used resource");
  }
  if (!isEqual(record.lockedResources, lockedResources)) {
    fail("lockedResources", "must use canonical resource order");
  }
  const registryLockHash = requireHash(record.registryLockHash, "registryLockHash");
  if (sha256CanonicalJson(lockedResources) !== registryLockHash) {
    fail("registryLockHash", "does not match lockedResources");
  }

  const entryPoint = requireExactRecord(
    record.entryPoint,
    ENTRY_POINT_FIELDS,
    "entryPoint",
  );
  if (
    entryPoint.executionPlanPath !== "targets/babylon-web/execution-plan.json" ||
    entryPoint.gameplayBootstrapPath !== "gameplay/bootstrap.json"
  ) {
    fail("entryPoint", "contains an unsupported V2 entry point");
  }

  const legal = requireExactRecord(record.legal, LEGAL_FIELDS, "legal");
  if (
    legal.distributionPolicy !== "internal-only" &&
    legal.distributionPolicy !== "redistributable"
  ) {
    fail("legal/distributionPolicy", "invalid distribution policy");
  }
  if (legal.noticePath !== "NOTICE") fail("legal/noticePath", "must be NOTICE");
  const licenseValues = requirePlainDenseArray(
    legal.licenseDocuments,
    "legal/licenseDocuments",
  );
  const licenseDocuments = licenseValues.map((value, index) => {
    const path = `legal/licenseDocuments/${index}`;
    const row = requireExactRecord(value, LICENSE_DOCUMENT_FIELDS, path);
    const licensePath = requireSafePath(row.path, `${path}/path`);
    if (!licensePath.startsWith("LICENSES/")) {
      fail(`${path}/path`, "must be inside LICENSES");
    }
    if (row.mediaType !== "text/plain; charset=utf-8") {
      fail(`${path}/mediaType`, "must be text/plain; charset=utf-8");
    }
    return {
      id: requireString(row.id, `${path}/id`),
      spdxLicenseExpression: requireString(
        row.spdxLicenseExpression,
        `${path}/spdxLicenseExpression`,
      ),
      path: licensePath as `LICENSES/${string}`,
      mediaType: "text/plain; charset=utf-8" as const,
      sizeBytes: requireNonNegativeSafeInteger(row.sizeBytes, `${path}/sizeBytes`),
      contentHash: requireHash(row.contentHash, `${path}/contentHash`),
    };
  });
  if (isEmpty(licenseDocuments)) {
    fail("legal/licenseDocuments", "must contain at least one legal document");
  }
  const canonicalLicenses = [...licenseDocuments].sort((left, right) =>
    compareStrings(left.id, right.id) || compareStrings(left.path, right.path)
  );
  if (
    !isEqual(licenseDocuments, canonicalLicenses) ||
    new Set(licenseDocuments.map((row) => row.id)).size !== licenseDocuments.length ||
    new Set(licenseDocuments.map((row) => row.path)).size !== licenseDocuments.length
  ) {
    fail("legal/licenseDocuments", "must have unique IDs and paths in canonical order");
  }

  const host = requireExactRecord(
    record.hostCompatibility,
    HOST_COMPATIBILITY_FIELDS,
    "hostCompatibility",
  );
  if (host.runtimeContractVersion !== 1) {
    fail("hostCompatibility/runtimeContractVersion", "must be 1");
  }
  const hostCompatibility = {
    profileRef: requireResourceRef(host.profileRef, "hostCompatibility/profileRef"),
    profileHash: requireHash(host.profileHash, "hostCompatibility/profileHash"),
    runtimeContractVersion: 1 as const,
    requiredFeatureIds: requireCanonicalStringArray(
      host.requiredFeatureIds,
      "hostCompatibility/requiredFeatureIds",
    ),
  };

  const resourceValues = requirePlainDenseArray(record.resources, "resources");
  const resources = resourceValues.map((value, index) => {
    const path = `resources/${index}`;
    const row = requireExactRecord(
      value,
      RESOURCE_REQUIRED_FIELDS,
      path,
      RESOURCE_ALLOWED_FIELDS,
    );
    const redistributionPolicy = row.redistributionPolicy;
    if (
      redistributionPolicy !== "allowed" &&
      redistributionPolicy !== "internal-only" &&
      redistributionPolicy !== "prohibited"
    ) {
      fail(`${path}/redistributionPolicy`, "invalid redistribution policy");
    }
    const canonicalRedistributionPolicy =
      redistributionPolicy as WorldPackageResourceArtifactV2["redistributionPolicy"];
    return {
      resourceRef: requireResourceRef(row.resourceRef, `${path}/resourceRef`),
      packagePath: requireSafePath(row.packagePath, `${path}/packagePath`),
      mediaType: requireString(row.mediaType, `${path}/mediaType`),
      sizeBytes: requireNonNegativeSafeInteger(row.sizeBytes, `${path}/sizeBytes`),
      contentHash: requireHash(row.contentHash, `${path}/contentHash`),
      licenseDocumentId: requireString(
        row.licenseDocumentId,
        `${path}/licenseDocumentId`,
      ),
      redistributionPolicy: canonicalRedistributionPolicy,
      ...(isNil(row.sourceUri)
        ? {}
        : { sourceUri: requireAbsoluteUri(row.sourceUri, `${path}/sourceUri`) }),
      ...(isNil(row.author)
        ? {}
        : { author: requireString(row.author, `${path}/author`) }),
    };
  });
  if (isEmpty(resources)) {
    fail("resources", "must contain at least one runtime resource");
  }
  const canonicalResources = [...resources].sort((left, right) =>
    compareStrings(left.resourceRef, right.resourceRef) ||
    compareStrings(left.packagePath, right.packagePath)
  );
  if (
    !isEqual(resources, canonicalResources) ||
    new Set(resources.map((row) => row.resourceRef)).size !== resources.length ||
    new Set(resources.map((row) => row.packagePath)).size !== resources.length
  ) {
    fail("resources", "must have unique Refs and paths in canonical order");
  }
  const licenseIds = new Set(licenseDocuments.map((row) => row.id));
  if (resources.some((row) => !licenseIds.has(row.licenseDocumentId))) {
    fail("resources", "every resource must bind a legal document");
  }
  if (
    resources.some((row) => row.redistributionPolicy === "prohibited") ||
    (legal.distributionPolicy === "redistributable" &&
      resources.some((row) => row.redistributionPolicy !== "allowed"))
  ) {
    fail("resources", "resource redistribution policy conflicts with package policy");
  }

  return deepFreeze({
    kind: "worldkit-world-package-manifest" as const,
    schemaVersion: 2 as const,
    id,
    title,
    packageFormatVersion: 2 as const,
    sdkVersion,
    worldId,
    seed,
    runtimeTarget: "babylon-web" as const,
    canonicalizationProfile: "canonical-json-jcs@1" as const,
    hashAlgorithm: "sha256" as const,
    authoringSchema: canonicalAuthoringSchema,
    aiSchemaProjectionProfile: canonicalAiSchemaProfile,
    normalizedWorldIrSchemaVersion: 4 as const,
    executionPlanSchemaVersion: 5 as const,
    authoringSpecHash: requireHash(record.authoringSpecHash, "authoringSpecHash"),
    normalizedWorldIrHash: requireHash(
      record.normalizedWorldIrHash,
      "normalizedWorldIrHash",
    ),
    executionPlanHash: requireHash(record.executionPlanHash, "executionPlanHash"),
    registryLockHash,
    layoutSolveReportHash: requireHash(
      record.layoutSolveReportHash,
      "layoutSolveReportHash",
    ),
    initialControlledEntityId: requireString(
      record.initialControlledEntityId,
      "initialControlledEntityId",
    ),
    worldBounds: { centerMetersXZ, sizeMetersXZ, heightRangeMeters },
    resourceBudget,
    lockedResources,
    entryPoint: {
      executionPlanPath: "targets/babylon-web/execution-plan.json" as const,
      gameplayBootstrapPath: "gameplay/bootstrap.json" as const,
    },
    legal: {
      distributionPolicy: legal.distributionPolicy,
      noticePath: "NOTICE" as const,
      licenseDocuments,
    },
    hostCompatibility,
    resources,
  });
}

export function hashWorldPackageManifestV2(
  value: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    canonicalWorldPackageManifestV2(value),
  ) as Sha256HashV1;
}

function receiptFail(path: string, message: string): never {
  throw new Error(
    `WORLD_PACKAGE_BUILD_RECEIPT_V2_INVALID: ${isEmpty(path) ? message : `${path}: ${message}`}`,
  );
}

function requireReceiptRecord(value: unknown): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    receiptFail("", "expected a plain object");
  }
  const record = value as UnknownRecord;
  const allowed = new Set<string>(RECEIPT_FIELDS_V2);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) receiptFail("", `unknown field '${unknown}'`);
  for (const field of RECEIPT_FIELDS_V2) {
    if (!Object.hasOwn(record, field) || isNil(record[field])) {
      receiptFail("", `missing field '${field}'`);
    }
  }
  return record;
}

export function hashWorldPackageRootV2(
  value: unknown,
): Sha256HashV1 {
  if (!isPlainDenseArray(value)) {
    throw new Error(
      "WORLD_PACKAGE_ROOT_V2_INVALID: files must be a plain dense array",
    );
  }
  const files = canonicalWorldPackageFileIntegrityEntriesV1(value);
  if (isEmpty(files)) {
    throw new Error(
      "WORLD_PACKAGE_ROOT_V2_INVALID: files must contain at least one entry",
    );
  }
  return sha256CanonicalJson({
    packageFormatVersion: 2,
    canonicalizationProfile: "canonical-json-jcs@1",
    hashAlgorithm: "sha256",
    files,
  }) as Sha256HashV1;
}

export function assertWorldPackageBuildReceiptV2(
  value: unknown,
): WorldPackageBuildReceiptV2 {
  try {
    assertWorldPackageAccessorFreeDataGraphV1(
      value,
      "WORLD_PACKAGE_BUILD_RECEIPT_V2_ACCESSOR_FORBIDDEN",
    );
  } catch {
    receiptFail("", "accessors, symbol keys, and invalid byte views are forbidden");
  }
  const record = requireReceiptRecord(value);
  if (record.kind !== "worldkit-world-package-build-receipt") {
    receiptFail("kind", "invalid kind");
  }
  if (record.schemaVersion !== 2) receiptFail("schemaVersion", "must be 2");
  if (!isPlainDenseArray(record.fileIntegrityEntries)) {
    receiptFail("fileIntegrityEntries", "must be a plain dense array");
  }
  let manifest;
  let entries;
  try {
    manifest = canonicalWorldPackageManifestV2(record.manifest);
    entries = canonicalWorldPackageFileIntegrityEntriesV1(
      record.fileIntegrityEntries,
    );
  } catch {
    receiptFail("", "Manifest or file integrity entries are invalid");
  }
  if (!isEqual(record.manifest, manifest)) {
    receiptFail("manifest", "must be canonical");
  }
  if (!isEqual(record.fileIntegrityEntries, entries)) {
    receiptFail("fileIntegrityEntries", "must use canonical path order");
  }
  let manifestHash;
  let worldPackageRootHash;
  try {
    manifestHash = requireHash(record.manifestHash, "manifestHash");
    worldPackageRootHash = requireHash(
      record.worldPackageRootHash,
      "worldPackageRootHash",
    );
  } catch {
    receiptFail("", "receipt hashes are invalid");
  }
  if (manifestHash !== hashWorldPackageManifestV2(manifest)) {
    receiptFail("manifestHash", "does not match Manifest canonical bytes");
  }
  if (worldPackageRootHash !== hashWorldPackageRootV2(entries)) {
    receiptFail("worldPackageRootHash", "does not match canonical file inventory");
  }
  const manifestEntry = entries.find((entry) => entry.path === "manifest.json");
  if (
    isNil(manifestEntry) ||
    manifestEntry.mediaType !== "application/json" ||
    manifestEntry.sha256 !== manifestHash ||
    manifestEntry.sizeBytes !== canonicalJsonBytes(manifest).byteLength
  ) {
    receiptFail("fileIntegrityEntries", "must bind manifest.json canonical bytes");
  }
  return deepFreeze({
    kind: "worldkit-world-package-build-receipt" as const,
    schemaVersion: 2 as const,
    manifest,
    manifestHash,
    fileIntegrityEntries: entries,
    worldPackageRootHash,
  });
}

export function canonicalWorldPackageSignatureEnvelopeV1(
  value: unknown,
): WorldPackageSignatureEnvelopeV1 {
  const signatureFail = (path: string, message: string): never => {
    throw new Error(
      `WORLD_PACKAGE_SIGNATURE_ENVELOPE_INVALID: ${isEmpty(path) ? message : `${path}: ${message}`}`,
    );
  };
  try {
    assertWorldPackageAccessorFreeDataGraphV1(
      value,
      "WORLD_PACKAGE_SIGNATURE_ENVELOPE_ACCESSOR_FORBIDDEN",
    );
  } catch {
    signatureFail("", "accessors, symbol keys, and invalid byte views are forbidden");
  }
  if (isNil(value) || !isPlainObject(value)) {
    signatureFail("", "expected a plain object");
  }
  const record = value as UnknownRecord;
  const allowed = new Set<string>(SIGNATURE_ENVELOPE_FIELDS_V1);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) signatureFail("", `unknown field '${unknown}'`);
  for (const field of SIGNATURE_ENVELOPE_FIELDS_V1) {
    if (!Object.hasOwn(record, field) || isNil(record[field])) {
      signatureFail("", `missing field '${field}'`);
    }
  }
  if (record.kind !== "worldkit-package-signature-envelope") {
    signatureFail("kind", "invalid kind");
  }
  if (record.schemaVersion !== 1) signatureFail("schemaVersion", "must be 1");
  if (record.packageFormatVersion !== 2) {
    signatureFail("packageFormatVersion", "must be 2");
  }
  if (record.runtimeTarget !== "babylon-web") {
    signatureFail("runtimeTarget", "must be babylon-web");
  }
  if (record.signatureAlgorithm !== "ed25519") {
    signatureFail("signatureAlgorithm", "must be ed25519");
  }
  const signatureIdentity = (() => {
    try {
      return {
        packageRootHash: requireHash(record.packageRootHash, "packageRootHash"),
        packageId: requireString(record.packageId, "packageId"),
        keyId: requireString(record.keyId, "keyId"),
        trustDomain: requireString(record.trustDomain, "trustDomain"),
      };
    } catch {
      return signatureFail("", "signature identity fields are invalid");
    }
  })();
  const signedAt = typeof record.signedAt === "string"
    ? record.signedAt
    : signatureFail("signedAt", "must be an ISO-8601 UTC timestamp");
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(signedAt) ||
    Number.isNaN(Date.parse(signedAt)) ||
    new Date(signedAt).toISOString() !== signedAt
  ) {
    signatureFail("signedAt", "must be a canonical ISO-8601 UTC timestamp");
  }
  return deepFreeze({
    kind: "worldkit-package-signature-envelope" as const,
    schemaVersion: 1 as const,
    packageRootHash: signatureIdentity.packageRootHash,
    packageId: signatureIdentity.packageId,
    packageFormatVersion: 2 as const,
    runtimeTarget: "babylon-web" as const,
    signatureAlgorithm: "ed25519" as const,
    keyId: signatureIdentity.keyId,
    trustDomain: signatureIdentity.trustDomain,
    signedAt,
  });
}

export function worldPackageSignatureEnvelopeBytesV1(
  value: unknown,
): Uint8Array {
  return canonicalJsonBytes(canonicalWorldPackageSignatureEnvelopeV1(value));
}

function hostCompatibilityFail(message: string): never {
  throw new Error(`WORLD_PACKAGE_HOST_INCOMPATIBLE: ${message}`);
}

function requireHostPolicyArray(
  value: unknown,
  path: string,
  allowEmpty = false,
): readonly unknown[] {
  if (!isPlainDenseArray(value) || (!allowEmpty && isEmpty(value))) {
    hostCompatibilityFail(
      `${path} must be a ${allowEmpty ? "plain dense" : "non-empty plain dense"} array`,
    );
  }
  return value;
}

function requireHostPolicyString(value: unknown, path: string): string {
  if (typeof value !== "string" || isEmpty(value) || value.trim() !== value) {
    hostCompatibilityFail(`${path} must be a non-empty canonical string`);
  }
  return value;
}

function requireCanonicalHostPolicyStrings(
  value: unknown,
  path: string,
  allowEmpty = false,
): readonly string[] {
  const rows = requireHostPolicyArray(value, path, allowEmpty).map((item, index) =>
    requireHostPolicyString(item, `${path}/${index}`)
  );
  const canonical = [...rows].sort(compareStrings);
  if (new Set(rows).size !== rows.length || !isEqual(rows, canonical)) {
    hostCompatibilityFail(`${path} must contain unique strings in canonical order`);
  }
  return rows;
}

function requireCanonicalHostPolicyVersions(
  value: unknown,
  path: string,
): readonly number[] {
  const rows = requireHostPolicyArray(value, path).map((item, index) => {
    if (typeof item !== "number" || !Number.isSafeInteger(item) || item <= 0) {
      hostCompatibilityFail(`${path}/${index} must be a positive safe integer`);
    }
    return item;
  });
  const canonical = [...rows].sort((left, right) => left - right);
  if (new Set(rows).size !== rows.length || !isEqual(rows, canonical)) {
    hostCompatibilityFail(`${path} must contain unique versions in ascending order`);
  }
  return rows;
}

function requireHostPolicyRecord(
  value: unknown,
  fields: readonly string[],
  path: string,
): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    hostCompatibilityFail(`${path} must be a plain object`);
  }
  const record = value as UnknownRecord;
  const allowed = new Set(fields);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) {
    hostCompatibilityFail(`${path} contains unknown field '${unknown}'`);
  }
  for (const field of fields) {
    if (!Object.hasOwn(record, field) || isNil(record[field])) {
      hostCompatibilityFail(`${path} is missing field '${field}'`);
    }
  }
  return record;
}

function canonicalWorldPackageHostPolicyV1(
  value: unknown,
): WorldPackageHostPolicyV1 {
  try {
    assertWorldPackageAccessorFreeDataGraphV1(
      value,
      "WORLD_PACKAGE_HOST_POLICY_ACCESSOR_FORBIDDEN",
    );
  } catch {
    hostCompatibilityFail(
      "Host policy accessors, symbol keys, and invalid byte views are forbidden",
    );
  }
  const record = requireHostPolicyRecord(value, HOST_POLICY_FIELDS_V1, "Host policy");
  const acceptedRuntimeTargets = requireCanonicalHostPolicyStrings(
    record.acceptedRuntimeTargets,
    "acceptedRuntimeTargets",
  );
  if (!isEqual(acceptedRuntimeTargets, ["babylon-web"])) {
    hostCompatibilityFail("acceptedRuntimeTargets must be ['babylon-web']");
  }
  const acceptedPackageFormatVersions = requireCanonicalHostPolicyVersions(
    record.acceptedPackageFormatVersions,
    "acceptedPackageFormatVersions",
  );
  const acceptedManifestSchemaVersions = requireCanonicalHostPolicyVersions(
    record.acceptedManifestSchemaVersions,
    "acceptedManifestSchemaVersions",
  );
  if (
    !isEqual(acceptedPackageFormatVersions, [2]) ||
    !isEqual(acceptedManifestSchemaVersions, [2])
  ) {
    hostCompatibilityFail(
      "accepted package and Manifest versions must both be [2]",
    );
  }
  if (record.runtimeContractVersion !== 1) {
    hostCompatibilityFail("runtimeContractVersion must be 1");
  }
  const supportedFeatureIds = requireCanonicalHostPolicyStrings(
    record.supportedFeatureIds,
    "supportedFeatureIds",
    true,
  );
  const profileValues = requireHostPolicyArray(
    record.trustedCompatibilityProfiles,
    "trustedCompatibilityProfiles",
  );
  const trustedCompatibilityProfiles = profileValues.map((value, index) => {
    const path = `trustedCompatibilityProfiles/${index}`;
    const row = requireHostPolicyRecord(
      value,
      TRUSTED_COMPATIBILITY_PROFILE_FIELDS_V1,
      path,
    );
    let profileRef;
    let profileHash;
    try {
      profileRef = requireResourceRef(row.profileRef, `${path}/profileRef`);
      profileHash = requireHash(row.profileHash, `${path}/profileHash`);
    } catch {
      return hostCompatibilityFail(`${path} is invalid`);
    }
    return { profileRef, profileHash };
  });
  const canonicalProfiles = [...trustedCompatibilityProfiles].sort((left, right) =>
    compareStrings(left.profileRef, right.profileRef)
  );
  if (
    !isEqual(trustedCompatibilityProfiles, canonicalProfiles) ||
    new Set(trustedCompatibilityProfiles.map((row) => row.profileRef)).size !==
      trustedCompatibilityProfiles.length
  ) {
    hostCompatibilityFail(
      "trustedCompatibilityProfiles must have unique Refs in canonical order",
    );
  }
  const distributionRows = requireCanonicalHostPolicyStrings(
    record.allowedDistributionPolicies,
    "allowedDistributionPolicies",
  );
  if (distributionRows.some((row) =>
    row !== "internal-only" && row !== "redistributable"
  )) {
    hostCompatibilityFail("allowedDistributionPolicies contains an unknown policy");
  }
  const signatureRecord = (() => {
    if (isNil(record.signaturePolicy) || !isPlainObject(record.signaturePolicy)) {
      return hostCompatibilityFail("signaturePolicy must be a plain object");
    }
    const mode = (record.signaturePolicy as UnknownRecord).mode;
    if (mode === "not-required") {
      return requireHostPolicyRecord(record.signaturePolicy, ["mode"], "signaturePolicy");
    }
    if (mode === "required") {
      return requireHostPolicyRecord(
        record.signaturePolicy,
        ["mode", "trustDomain"],
        "signaturePolicy",
      );
    }
    return hostCompatibilityFail("signaturePolicy/mode is invalid");
  })();
  const signaturePolicy = signatureRecord.mode === "not-required"
    ? { mode: "not-required" as const }
    : {
        mode: "required" as const,
        trustDomain: requireHostPolicyString(
          signatureRecord.trustDomain,
          "signaturePolicy/trustDomain",
        ),
      };
  return deepFreeze({
    acceptedRuntimeTargets: ["babylon-web"] as const,
    acceptedPackageFormatVersions: [2] as const,
    acceptedManifestSchemaVersions: [2] as const,
    runtimeContractVersion: 1 as const,
    supportedFeatureIds,
    trustedCompatibilityProfiles,
    allowedDistributionPolicies:
      distributionRows as readonly WorldPackageDistributionPolicyV2[],
    signaturePolicy,
  });
}

export function assertWorldPackageHostCompatibilityV2(
  value: unknown,
  hostPolicyValue: unknown,
): void {
  let manifest;
  let hostPolicy;
  try {
    manifest = canonicalWorldPackageManifestV2(value);
    hostPolicy = canonicalWorldPackageHostPolicyV1(hostPolicyValue);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("WORLD_PACKAGE_HOST_INCOMPATIBLE")
    ) {
      throw error;
    }
    hostCompatibilityFail("Manifest or Host policy is invalid");
  }
  const trustedProfile = hostPolicy.trustedCompatibilityProfiles.find((profile) =>
    profile.profileRef === manifest.hostCompatibility.profileRef
  );
  if (
    !hostPolicy.acceptedRuntimeTargets.includes(manifest.runtimeTarget) ||
    !hostPolicy.acceptedPackageFormatVersions.includes(
      manifest.packageFormatVersion,
    ) ||
    !hostPolicy.acceptedManifestSchemaVersions.includes(manifest.schemaVersion) ||
    hostPolicy.runtimeContractVersion !==
      manifest.hostCompatibility.runtimeContractVersion ||
    manifest.hostCompatibility.requiredFeatureIds.some((featureId) =>
      !hostPolicy.supportedFeatureIds.includes(featureId)
    ) ||
    isNil(trustedProfile) ||
    trustedProfile.profileHash !== manifest.hostCompatibility.profileHash ||
    !hostPolicy.allowedDistributionPolicies.includes(
      manifest.legal.distributionPolicy,
    )
  ) {
    hostCompatibilityFail("package requirements are not admitted by Host policy");
  }
}

export function assertWorldPackageGameplayBootstrapMembershipV2(
  input: WorldPackageGameplayBootstrapMembershipInputV2,
) {
  const membershipFail = (message: string): never => {
    throw new Error(
      `WORLD_PACKAGE_GAMEPLAY_BOOTSTRAP_MEMBERSHIP_V2_INVALID: ${message}`,
    );
  };
  try {
    assertWorldPackageAccessorFreeDataGraphV1(
      input,
      "WORLD_PACKAGE_GAMEPLAY_BOOTSTRAP_MEMBERSHIP_V2_ACCESSOR_FORBIDDEN",
    );
  } catch {
    membershipFail("input accessors and symbol keys are forbidden");
  }
  let record;
  try {
    record = requireExactRecord(
      input,
      ["executionPlan", "gameplayBootstrap", "worldPackageBuildReceipt"],
      "",
    );
  } catch {
    return membershipFail("input must contain exactly Receipt, Plan, and Bootstrap");
  }
  let receipt;
  let executionPlan;
  let gameplayBootstrap;
  try {
    receipt = assertWorldPackageBuildReceiptV2(record.worldPackageBuildReceipt);
    executionPlan = parseExecutionPlanV5(record.executionPlan);
    gameplayBootstrap = parseGameplayBootstrapV1(record.gameplayBootstrap);
  } catch {
    return membershipFail("Receipt, Plan, or Gameplay Bootstrap is invalid");
  }
  let planResourceLock;
  try {
    planResourceLock = canonicalExecutionResourceLockEntriesV1(
      executionPlan.resourceLockEntries,
    );
  } catch {
    return membershipFail("Execution Resource Lock is invalid");
  }
  const expectedBootstrapLock = createGameplayBootstrapResourceLockEntryV1(
    gameplayBootstrap,
  );
  const bootstrapLocks = planResourceLock.filter((entry) =>
    entry.resourceKind === "gameplay-bootstrap"
  );
  if (
    hashExecutionPlanV5(executionPlan) !== receipt.manifest.executionPlanHash ||
    !isEqual(executionPlan.resourceLockEntries, planResourceLock) ||
    !isEqual(receipt.manifest.lockedResources, planResourceLock) ||
    receipt.manifest.registryLockHash !== sha256CanonicalJson(planResourceLock) ||
    bootstrapLocks.length !== 1 ||
    !isEqual(bootstrapLocks[0], expectedBootstrapLock)
  ) {
    membershipFail("Plan and Registry Lock do not bind the supplied Bootstrap");
  }
  const bootstrapBytes = gameplayBootstrapCanonicalBytesV1(gameplayBootstrap);
  const bootstrapHash = sha256Bytes(
    bootstrapBytes,
  ) as Sha256HashV1;
  const manifestRows = receipt.manifest.resources.filter((resource) =>
    resource.resourceRef === gameplayBootstrap.resourceRef ||
    resource.packagePath === GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1
  );
  const integrityRows = receipt.fileIntegrityEntries.filter((entry) =>
    entry.path === GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1
  );
  if (
    manifestRows.length !== 1 ||
    manifestRows[0]?.resourceRef !== gameplayBootstrap.resourceRef ||
    manifestRows[0]?.packagePath !== GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1 ||
    manifestRows[0]?.mediaType !== GAMEPLAY_BOOTSTRAP_MEDIA_TYPE_V1 ||
    manifestRows[0]?.sizeBytes !== bootstrapBytes.byteLength ||
    manifestRows[0]?.contentHash !== bootstrapHash ||
    integrityRows.length !== 1 ||
    integrityRows[0]?.mediaType !== GAMEPLAY_BOOTSTRAP_MEDIA_TYPE_V1 ||
    integrityRows[0]?.sizeBytes !== bootstrapBytes.byteLength ||
    integrityRows[0]?.sha256 !== bootstrapHash
  ) {
    membershipFail("Gameplay Bootstrap canonical bytes are not Package-bound");
  }
  return gameplayBootstrap;
}

function migrationFail(path: string, message: string): never {
  throw new Error(
    `WORLD_PACKAGE_MIGRATION_V1_TO_V2_INVALID: ${isEmpty(path) ? message : `${path}: ${message}`}`,
  );
}

function requireMigrationRecord(
  value: unknown,
  fields: readonly string[],
  path: string,
): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    migrationFail(path, "expected a plain object");
  }
  const record = value as UnknownRecord;
  const allowed = new Set(fields);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) migrationFail(path, `unknown field '${unknown}'`);
  for (const field of fields) {
    if (!Object.hasOwn(record, field) || isNil(record[field])) {
      migrationFail(path, `missing field '${field}'`);
    }
  }
  return record;
}

export function assertWorldPackageMigrationReportV1(
  value: unknown,
): WorldPackageMigrationReportV1 {
  try {
    assertWorldPackageAccessorFreeDataGraphV1(
      value,
      "WORLD_PACKAGE_MIGRATION_REPORT_ACCESSOR_FORBIDDEN",
    );
  } catch {
    migrationFail("report", "accessors and symbol keys are forbidden");
  }
  const record = requireMigrationRecord(value, MIGRATION_REPORT_FIELDS, "report");
  if (
    record.kind !== "worldkit-world-package-migration-report" ||
    record.schemaVersion !== 1 ||
    record.sourceManifestSchemaVersion !== 1 ||
    record.targetManifestSchemaVersion !== 2
  ) {
    migrationFail("report", "version or kind is invalid");
  }
  if (!isPlainDenseArray(record.migratedFieldIds)) {
    migrationFail("report/migratedFieldIds", "must be a plain dense array");
  }
  let sourceWorldPackageRootHash;
  let targetWorldPackageRootHash;
  let sourceManifestHash;
  let targetManifestHash;
  try {
    sourceWorldPackageRootHash = requireHash(
      record.sourceWorldPackageRootHash,
      "sourceWorldPackageRootHash",
    );
    targetWorldPackageRootHash = requireHash(
      record.targetWorldPackageRootHash,
      "targetWorldPackageRootHash",
    );
    sourceManifestHash = requireHash(record.sourceManifestHash, "sourceManifestHash");
    targetManifestHash = requireHash(record.targetManifestHash, "targetManifestHash");
  } catch {
    migrationFail("report", "hash fields are invalid");
  }
  if (!isEqual(record.migratedFieldIds, MIGRATED_FIELD_IDS_V1)) {
    migrationFail("report/migratedFieldIds", "must use the exact V1 to V2 field set");
  }
  if (
    sourceWorldPackageRootHash === targetWorldPackageRootHash ||
    sourceManifestHash === targetManifestHash
  ) {
    migrationFail("report", "source and target identities must be distinct");
  }
  return deepFreeze({
    kind: "worldkit-world-package-migration-report" as const,
    schemaVersion: 1 as const,
    sourceManifestSchemaVersion: 1 as const,
    targetManifestSchemaVersion: 2 as const,
    sourceWorldPackageRootHash,
    targetWorldPackageRootHash,
    sourceManifestHash,
    targetManifestHash,
    migratedFieldIds: [...MIGRATED_FIELD_IDS_V1],
  });
}

function migrationManifestResourceCore(
  row: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    resourceRef: row.resourceRef,
    packagePath: row.packagePath,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
    contentHash: row.contentHash,
  };
}

export function migrateWorldPackageBuildReceiptV1ToV2(
  input: MigrateWorldPackageBuildReceiptV1ToV2Input,
): MigrateWorldPackageBuildReceiptV1ToV2Result {
  try {
    assertWorldPackageAccessorFreeDataGraphV1(
      input,
      "WORLD_PACKAGE_MIGRATION_ACCESSOR_FORBIDDEN",
    );
  } catch {
    migrationFail("", "accessors and symbol keys are forbidden");
  }
  const inputRecord = requireMigrationRecord(input, MIGRATION_INPUT_FIELDS, "");
  const context = requireMigrationRecord(
    inputRecord.context,
    MIGRATION_CONTEXT_FIELDS,
    "context",
  );
  let sourceReceipt;
  try {
    sourceReceipt = assertWorldPackageBuildReceiptV1(inputRecord.sourceReceipt);
  } catch {
    migrationFail("sourceReceipt", "must be a canonical WorldPackageBuildReceiptV1");
  }

  let lockedResources;
  if (!isPlainDenseArray(context.lockedResources)) {
    migrationFail("context/lockedResources", "must be a plain dense array");
  }
  try {
    lockedResources = canonicalExecutionResourceLockEntriesV1(
      context.lockedResources,
    );
  } catch {
    migrationFail("context/lockedResources", "must be a canonical Registry Lock");
  }
  if (
    !isEqual(context.lockedResources, lockedResources) ||
    sha256CanonicalJson(lockedResources) !== sourceReceipt.manifest.resourceLockHash
  ) {
    migrationFail(
      "context/lockedResources",
      "must equal the V1 resourceLockHash closure",
    );
  }

  let manifest;
  try {
    manifest = canonicalWorldPackageManifestV2({
      kind: "worldkit-world-package-manifest",
      schemaVersion: 2,
      id: sourceReceipt.manifest.id,
      title: context.title,
      packageFormatVersion: 2,
      sdkVersion: context.sdkVersion,
      worldId: sourceReceipt.manifest.worldId,
      seed: sourceReceipt.manifest.seed,
      runtimeTarget: sourceReceipt.manifest.runtimeTarget,
      canonicalizationProfile: sourceReceipt.manifest.canonicalizationProfile,
      hashAlgorithm: sourceReceipt.manifest.hashAlgorithm,
      authoringSchema: {
        schemaVersion: 4,
        contentHash: context.canonicalAuthoringSchemaHash,
      },
      aiSchemaProjectionProfile: context.aiSchemaProjectionProfile,
      normalizedWorldIrSchemaVersion:
        sourceReceipt.manifest.normalizedWorldIrSchemaVersion,
      executionPlanSchemaVersion:
        sourceReceipt.manifest.executionPlanSchemaVersion,
      authoringSpecHash: sourceReceipt.manifest.authoringSpecHash,
      normalizedWorldIrHash: sourceReceipt.manifest.normalizedWorldIrHash,
      executionPlanHash: sourceReceipt.manifest.executionPlanHash,
      registryLockHash: sourceReceipt.manifest.resourceLockHash,
      layoutSolveReportHash: sourceReceipt.manifest.layoutSolveReportHash,
      initialControlledEntityId:
        sourceReceipt.manifest.initialControlledEntityId,
      worldBounds: context.worldBounds,
      resourceBudget: context.resourceBudget,
      lockedResources,
      entryPoint: {
        executionPlanPath:
          sourceReceipt.manifest.entryPoint.executionPlanPath,
        gameplayBootstrapPath: "gameplay/bootstrap.json",
      },
      legal: context.legal,
      hostCompatibility: context.hostCompatibility,
      resources: context.resources,
    });
  } catch {
    migrationFail("context", "does not form a canonical V2 Manifest");
  }

  const sourceResourceCores = sourceReceipt.manifest.resources.map((row) =>
    migrationManifestResourceCore(row as unknown as Readonly<Record<string, unknown>>)
  );
  const targetResourceCores = manifest.resources.map((row) =>
    migrationManifestResourceCore(row as unknown as Readonly<Record<string, unknown>>)
  );
  if (!isEqual(sourceResourceCores, targetResourceCores)) {
    migrationFail(
      "context/resources",
      "must add legal provenance without changing V1 resource bytes",
    );
  }

  let v2OnlyEntries: readonly WorldPackageFileIntegrityEntryV1[];
  if (!isPlainDenseArray(context.v2OnlyFileIntegrityEntries)) {
    migrationFail(
      "context/v2OnlyFileIntegrityEntries",
      "must be a plain dense array",
    );
  }
  try {
    v2OnlyEntries = canonicalWorldPackageFileIntegrityEntriesV1(
      context.v2OnlyFileIntegrityEntries,
    );
  } catch {
    migrationFail(
      "context/v2OnlyFileIntegrityEntries",
      "must be canonical file integrity entries",
    );
  }
  if (!isEqual(context.v2OnlyFileIntegrityEntries, v2OnlyEntries)) {
    migrationFail(
      "context/v2OnlyFileIntegrityEntries",
      "must use canonical path order",
    );
  }
  const expectedV2OnlyPaths = new Set<string>([
    manifest.legal.noticePath,
    ...manifest.legal.licenseDocuments.map((row) => row.path),
  ]);
  if (
    v2OnlyEntries.length !== expectedV2OnlyPaths.size ||
    v2OnlyEntries.some((entry) => !expectedV2OnlyPaths.has(entry.path))
  ) {
    migrationFail(
      "context/v2OnlyFileIntegrityEntries",
      "must contain exactly NOTICE and declared license documents",
    );
  }
  const v2OnlyByPath = new Map(v2OnlyEntries.map((entry) => [entry.path, entry]));
  const noticeEntry = v2OnlyByPath.get(manifest.legal.noticePath);
  if (
    isNil(noticeEntry) ||
    noticeEntry.mediaType !== "text/plain; charset=utf-8" ||
    noticeEntry.sizeBytes === 0
  ) {
    migrationFail(
      "context/v2OnlyFileIntegrityEntries/NOTICE",
      "NOTICE must be non-empty UTF-8 text",
    );
  }
  for (const license of manifest.legal.licenseDocuments) {
    const entry = v2OnlyByPath.get(license.path);
    if (
      isNil(entry) ||
      entry.mediaType !== license.mediaType ||
      entry.sizeBytes !== license.sizeBytes ||
      entry.sha256 !== license.contentHash
    ) {
      migrationFail(
        `context/v2OnlyFileIntegrityEntries/${license.path}`,
        "does not match the legal document binding",
      );
    }
  }
  const sourcePaths = new Set(
    sourceReceipt.fileIntegrityEntries.map((entry) => entry.path),
  );
  if (v2OnlyEntries.some((entry) => sourcePaths.has(entry.path))) {
    migrationFail(
      "context/v2OnlyFileIntegrityEntries",
      "must not replace a V1 content file",
    );
  }

  const manifestBytes = canonicalJsonBytes(manifest);
  const fileIntegrityEntries = canonicalWorldPackageFileIntegrityEntriesV1([
    ...sourceReceipt.fileIntegrityEntries.filter(
      (entry) => entry.path !== "manifest.json",
    ),
    ...v2OnlyEntries,
    {
      path: "manifest.json",
      mediaType: "application/json",
      sizeBytes: manifestBytes.byteLength,
      sha256: hashWorldPackageManifestV2(manifest),
    },
  ]);
  const receipt = assertWorldPackageBuildReceiptV2({
    kind: "worldkit-world-package-build-receipt",
    schemaVersion: 2,
    manifest,
    manifestHash: hashWorldPackageManifestV2(manifest),
    fileIntegrityEntries,
    worldPackageRootHash: hashWorldPackageRootV2(fileIntegrityEntries),
  });
  const report = assertWorldPackageMigrationReportV1({
    kind: "worldkit-world-package-migration-report",
    schemaVersion: 1,
    sourceManifestSchemaVersion: 1,
    targetManifestSchemaVersion: 2,
    sourceWorldPackageRootHash: sourceReceipt.worldPackageRootHash,
    targetWorldPackageRootHash: receipt.worldPackageRootHash,
    sourceManifestHash: hashWorldPackageManifestV1(sourceReceipt.manifest),
    targetManifestHash: receipt.manifestHash,
    migratedFieldIds: MIGRATED_FIELD_IDS_V1,
  });
  return deepFreeze({ receipt, report });
}
