import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  worldResourceLockEntriesV1,
  hashCanonicalSceneExecutionPlanV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashWorldBuildIdentityV1,
  parseWorldBuildIdentityV1,
  worldPackageRefFromRootHashV1,
} from "@whitebox-world/world-identity";
import { isEqual, isNil, sortBy } from "lodash-es";

import type {
  WorldPackageBuildReceiptV1,
  CanonicalWorldPackageGameplayBootstrapMembershipInputV1,
  WorldPackageFileIntegrityEntryV1,
  WorldPackageHostCompatibilityV1,
  WorldPackageHostPolicyV1,
  WorldPackageManifestV1,
  WorldPackageSignatureEnvelopeV1,
} from "./package-types.js";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const TRANSPORT_METADATA_PATHS = new Set([
  "integrity.json",
  "world-package-build-receipt.json",
  "world-build-identity.json",
]);
const MANIFEST_FIELDS = Object.freeze([
  "kind", "schemaVersion", "id", "title", "packageFormatVersion", "sdkVersion",
  "worldId", "seed", "runtimeTarget", "canonicalizationProfile", "hashAlgorithm",
  "sceneSource", "worldRuntimeBootstrapSchemaVersion", "gameplayBootstrapHash",
  "worldRuntimeBootstrapHash", "registryLockHash", "initialControlledEntityId",
  "worldBounds", "resourceBudget", "lockedResources", "entryPoint", "legal",
  "hostCompatibility", "resources",
] as const);
const CANONICAL_SCENE_SOURCE_FIELDS = Object.freeze([
  "kind", "authoringSchema", "aiSchemaProjectionProfile",
  "normalizedWorldIrSchemaVersion", "canonicalSceneExecutionPlanSchemaVersion",
  "authoringSpecHash", "normalizedWorldIrHash", "executionPlanHash",
  "layoutSolveReportHash", "canonicalSceneExecutionPlanPath",
] as const);
const NATIVE_SCENE_SOURCE_FIELDS = Object.freeze([
  "kind", "nativeSceneBootstrapHash", "sceneModuleBundleHash",
  "nativeSceneContributionHash", "dependencyLockHash", "assetLockHash",
  "nativeSceneCheckResultHash", "sceneAuthoringRouteDecisionHash",
  "sceneAuthoringAttemptHash", "sceneAuthoringAttemptResultRef",
  "sceneAuthoringAttemptResultHash", "nativeSceneBootstrapPath",
  "sceneModuleBundleManifestPath", "sceneModuleBundlePath", "dependencyLockPath",
  "assetLockPath", "nativeSceneContributionPath", "nativeSceneCheckResultPath",
  "sceneAuthoringRouteDecisionPath", "sceneAuthoringAttemptPath",
  "sceneAuthoringAttemptResultPath",
] as const);
const PACKAGE_OWNED_RESOURCE_PATHS = new Set([
  "manifest.json",
  "registry-lock.json",
  "gameplay/bootstrap.json",
  "runtime/world-runtime-bootstrap.json",
  "world.normalized.json",
  "layout-solve-report.json",
  "targets/babylon-web/canonical-scene-execution-plan.json",
  "native/bootstrap.json",
  "native/module-bundle.json",
  "native/scene.mjs",
  "native/dependency-lock.json",
  "native/asset-lock.json",
  "native/contribution.json",
  "native/check-result.json",
  "authoring/scene-authoring-route-decision.json",
  "authoring/scene-authoring-attempt.json",
  "authoring/scene-authoring-attempt-result.json",
]);

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function snapshot(value: unknown, code: string, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail(code, "number invalid");
    return value;
  }
  if (typeof value !== "object" || seen.has(value)) fail(code, "data graph invalid");
  seen.add(value);
  if (Array.isArray(value)) {
    if (
      Reflect.getPrototypeOf(value) !== Array.prototype ||
      Object.getOwnPropertyNames(value).length !== value.length + 1
    ) fail(code, "array prototype or density invalid");
    const result = value.map((row) => snapshot(row, code, seen));
    seen.delete(value);
    return result;
  }
  if (Reflect.getPrototypeOf(value) !== Object.prototype) fail(code, "object prototype invalid");
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail(code, "symbol keys forbidden");
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (isNil(descriptor) || !("value" in descriptor) || !descriptor.enumerable) {
      fail(code, "accessors and non-enumerable values forbidden");
    }
    result[key] = snapshot(descriptor.value, code, seen);
  }
  seen.delete(value);
  return result;
}

function exactRecord(
  input: unknown,
  fields: readonly string[],
  code: string,
): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return fail(code, "required record missing");
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(record, field)) ||
    keys.some((field) => !fields.includes(field))
  ) return fail(code, "record fields are not exact");
  return record;
}

function requireCanonicalString(value: unknown, label: string, code: string): string {
  if (
    typeof value !== "string" || value.length === 0 || value.trim() !== value ||
    value.normalize("NFC") !== value
  ) return fail(code, `${label} must be a canonical non-empty string`);
  return value;
}

function requireSafePath(value: unknown, label: string, code: string): string {
  const path = requireCanonicalString(value, label, code);
  const segments = path.split("/");
  if (
    path.startsWith("/") || path.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(path) ||
    segments.some((segment) =>
      segment.length === 0 || segment === "." || segment === ".." ||
      segment.includes(":"))
  ) return fail(code, `${label} must be a safe Package path`);
  return path;
}

function requireFiniteNumber(value: unknown, label: string, code: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
    return fail(code, `${label} must be a finite canonical number`);
  }
  return value;
}

function requireSafeInteger(
  value: unknown,
  label: string,
  code: string,
  minimum = 0,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    return fail(code, `${label} must be a safe integer`);
  }
  return value as number;
}

function requireStringArray(
  value: unknown,
  label: string,
  code: string,
): readonly string[] {
  if (!Array.isArray(value)) return fail(code, `${label} must be an array`);
  const strings = value.map((entry, index) =>
    requireCanonicalString(entry, `${label}/${index}`, code));
  if (new Set(strings).size !== strings.length) {
    return fail(code, `${label} must be unique`);
  }
  return strings;
}

function exactRecordWithOptionalFields(
  input: unknown,
  requiredFields: readonly string[],
  optionalFields: readonly string[],
  code: string,
): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return fail(code, "required record missing");
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    requiredFields.some((field) => !Object.hasOwn(record, field)) ||
    keys.some((field) =>
      !requiredFields.includes(field) && !optionalFields.includes(field))
  ) return fail(code, "record fields are not exact");
  return record;
}

function deepFreeze<Value>(value: Value): Value {
  if (isNil(value) || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  return Object.freeze(value);
}

function requireHash(value: unknown, label: string, code: string): Sha256HashV1 {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value) || /^sha256:0{64}$/.test(value)) {
    fail(code, `${label} must be a non-zero lowercase SHA-256 hash`);
  }
  return value as Sha256HashV1;
}

export function assertWorldPackageAccessorFreeDataGraphV1(
  value: unknown,
  code = "WORLD_PACKAGE_ACCESSOR_FORBIDDEN",
): void {
  snapshot(value, code);
}

export function canonicalizeWorldPackageFileIntegrityEntriesV1(
  input: readonly WorldPackageFileIntegrityEntryV1[],
): readonly WorldPackageFileIntegrityEntryV1[] {
  const source = snapshot(input, "WORLD_PACKAGE_INTEGRITY_INVALID") as
    WorldPackageFileIntegrityEntryV1[];
  const rows = sortBy(source, [(row) => row.path]);
  if (
    rows.length === 0 ||
    new Set(rows.map((row) => row.path)).size !== rows.length ||
    rows.some((row) =>
      row.path.length === 0 || row.path.startsWith("/") || row.path.includes("..") ||
      TRANSPORT_METADATA_PATHS.has(row.path) ||
      row.mediaType.length === 0 || !Number.isSafeInteger(row.sizeBytes) ||
      row.sizeBytes < 0 || requireHash(row.contentHash, "contentHash", "WORLD_PACKAGE_INTEGRITY_INVALID") !== row.contentHash
    )
  ) fail("WORLD_PACKAGE_INTEGRITY_INVALID", "file inventory is malformed");
  return deepFreeze(rows);
}

export function canonicalizeWorldPackageManifestV1(
  input: WorldPackageManifestV1,
): WorldPackageManifestV1 {
  const value = exactRecord(
    snapshot(input, "WORLD_PACKAGE_MANIFEST_INVALID"),
    MANIFEST_FIELDS,
    "WORLD_PACKAGE_MANIFEST_INVALID",
  ) as unknown as WorldPackageManifestV1;
  if (
    isNil(value.entryPoint) || typeof value.entryPoint !== "object" ||
    isNil(value.sceneSource) || typeof value.sceneSource !== "object" ||
    isNil(value.legal) || typeof value.legal !== "object" ||
    isNil(value.hostCompatibility) ||
      typeof value.hostCompatibility !== "object"
  ) fail("WORLD_PACKAGE_MANIFEST_INVALID", "required object missing");
  if (
    value.kind !== "worldkit-world-package-manifest" ||
    value.schemaVersion !== 1 || value.packageFormatVersion !== 1 ||
    value.runtimeTarget !== "babylon-web" ||
    value.canonicalizationProfile !== "canonical-json-jcs@1" ||
    value.hashAlgorithm !== "sha256" ||
    value.worldRuntimeBootstrapSchemaVersion !== 1 ||
    value.entryPoint.gameplayBootstrapPath !== "gameplay/bootstrap.json" ||
    value.entryPoint.worldRuntimeBootstrapPath !==
      "runtime/world-runtime-bootstrap.json"
  ) fail("WORLD_PACKAGE_MANIFEST_INVALID", "discriminator or entry point invalid");
  exactRecord(
    value.entryPoint,
    ["gameplayBootstrapPath", "worldRuntimeBootstrapPath"],
    "WORLD_PACKAGE_MANIFEST_INVALID",
  );
  requireCanonicalString(value.id, "id", "WORLD_PACKAGE_MANIFEST_INVALID");
  requireCanonicalString(value.title, "title", "WORLD_PACKAGE_MANIFEST_INVALID");
  requireCanonicalString(value.sdkVersion, "sdkVersion", "WORLD_PACKAGE_MANIFEST_INVALID");
  requireCanonicalString(value.worldId, "worldId", "WORLD_PACKAGE_MANIFEST_INVALID");
  requireCanonicalString(
    value.initialControlledEntityId,
    "initialControlledEntityId",
    "WORLD_PACKAGE_MANIFEST_INVALID",
  );
  if (!Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffff_ffff) {
    fail("WORLD_PACKAGE_MANIFEST_INVALID", "seed invalid");
  }
  const worldBounds = exactRecord(
    value.worldBounds,
    ["centerMetersXZ", "sizeMetersXZ", "heightRangeMeters"],
    "WORLD_PACKAGE_MANIFEST_INVALID",
  );
  for (const [label, tuple] of Object.entries({
    centerMetersXZ: worldBounds.centerMetersXZ,
    sizeMetersXZ: worldBounds.sizeMetersXZ,
    heightRangeMeters: worldBounds.heightRangeMeters,
  })) {
    if (!Array.isArray(tuple) || tuple.length !== 2) {
      fail("WORLD_PACKAGE_MANIFEST_INVALID", `${label} must have two numbers`);
    }
    tuple.forEach((entry, index) =>
      requireFiniteNumber(
        entry,
        `${label}/${index}`,
        "WORLD_PACKAGE_MANIFEST_INVALID",
      ));
  }
  if (
    (worldBounds.sizeMetersXZ as readonly number[]).some((size) => size <= 0) ||
    (worldBounds.heightRangeMeters as readonly number[])[0]! >
      (worldBounds.heightRangeMeters as readonly number[])[1]!
  ) fail("WORLD_PACKAGE_MANIFEST_INVALID", "world bounds invalid");
  const budget = exactRecord(
    value.resourceBudget,
    ["maximumVertices", "maximumTriangles", "maximumColliders"],
    "WORLD_PACKAGE_MANIFEST_INVALID",
  );
  for (const [label, amount] of Object.entries(budget)) {
    requireSafeInteger(amount, label, "WORLD_PACKAGE_MANIFEST_INVALID", 1);
  }
  for (const [label, hash] of Object.entries({
    gameplayBootstrapHash: value.gameplayBootstrapHash,
    worldRuntimeBootstrapHash: value.worldRuntimeBootstrapHash,
    registryLockHash: value.registryLockHash,
  })) requireHash(hash, label, "WORLD_PACKAGE_MANIFEST_INVALID");
  if (value.sceneSource.kind === "canonical-execution-plan") {
    exactRecord(
      value.sceneSource,
      CANONICAL_SCENE_SOURCE_FIELDS,
      "WORLD_PACKAGE_MANIFEST_INVALID",
    );
    const authoringSchema = exactRecord(
      value.sceneSource.authoringSchema,
      ["schemaVersion", "contentHash"],
      "WORLD_PACKAGE_MANIFEST_INVALID",
    );
    const projectionProfile = exactRecord(
      value.sceneSource.aiSchemaProjectionProfile,
      ["resourceRef", "contentHash"],
      "WORLD_PACKAGE_MANIFEST_INVALID",
    );
    if (
      authoringSchema.schemaVersion !== 4 ||
      value.sceneSource.normalizedWorldIrSchemaVersion !== 4 ||
      value.sceneSource.canonicalSceneExecutionPlanSchemaVersion !== 1 ||
      value.sceneSource.canonicalSceneExecutionPlanPath !==
        "targets/babylon-web/canonical-scene-execution-plan.json"
    ) fail("WORLD_PACKAGE_MANIFEST_INVALID", "Canonical scene source invalid");
    requireCanonicalString(
      projectionProfile.resourceRef,
      "aiSchemaProjectionProfile.resourceRef",
      "WORLD_PACKAGE_MANIFEST_INVALID",
    );
    for (const [label, hash] of Object.entries({
      authoringSchemaHash: authoringSchema.contentHash,
      aiSchemaProjectionProfileHash: projectionProfile.contentHash,
      authoringSpecHash: value.sceneSource.authoringSpecHash,
      normalizedWorldIrHash: value.sceneSource.normalizedWorldIrHash,
      executionPlanHash: value.sceneSource.executionPlanHash,
      layoutSolveReportHash: value.sceneSource.layoutSolveReportHash,
    })) requireHash(hash, label, "WORLD_PACKAGE_MANIFEST_INVALID");
  } else if (value.sceneSource.kind === "babylon-native-scene") {
    exactRecord(
      value.sceneSource,
      NATIVE_SCENE_SOURCE_FIELDS,
      "WORLD_PACKAGE_MANIFEST_INVALID",
    );
    if (
      value.sceneSource.nativeSceneBootstrapPath !== "native/bootstrap.json" ||
      value.sceneSource.sceneModuleBundleManifestPath !== "native/module-bundle.json" ||
      value.sceneSource.sceneModuleBundlePath !== "native/scene.mjs" ||
      value.sceneSource.dependencyLockPath !== "native/dependency-lock.json" ||
      value.sceneSource.assetLockPath !== "native/asset-lock.json" ||
      value.sceneSource.nativeSceneContributionPath !== "native/contribution.json" ||
      value.sceneSource.nativeSceneCheckResultPath !== "native/check-result.json" ||
      value.sceneSource.sceneAuthoringRouteDecisionPath !==
        "authoring/scene-authoring-route-decision.json" ||
      value.sceneSource.sceneAuthoringAttemptPath !==
        "authoring/scene-authoring-attempt.json" ||
      value.sceneSource.sceneAuthoringAttemptResultPath !==
        "authoring/scene-authoring-attempt-result.json"
    ) fail("WORLD_PACKAGE_MANIFEST_INVALID", "Native scene source path invalid");
    requireCanonicalString(
      value.sceneSource.sceneAuthoringAttemptResultRef,
      "sceneAuthoringAttemptResultRef",
      "WORLD_PACKAGE_MANIFEST_INVALID",
    );
    for (const [label, hash] of Object.entries({
      nativeSceneBootstrapHash: value.sceneSource.nativeSceneBootstrapHash,
      sceneModuleBundleHash: value.sceneSource.sceneModuleBundleHash,
      nativeSceneContributionHash: value.sceneSource.nativeSceneContributionHash,
      dependencyLockHash: value.sceneSource.dependencyLockHash,
      assetLockHash: value.sceneSource.assetLockHash,
      nativeSceneCheckResultHash: value.sceneSource.nativeSceneCheckResultHash,
      sceneAuthoringRouteDecisionHash:
        value.sceneSource.sceneAuthoringRouteDecisionHash,
      sceneAuthoringAttemptHash: value.sceneSource.sceneAuthoringAttemptHash,
      sceneAuthoringAttemptResultHash:
        value.sceneSource.sceneAuthoringAttemptResultHash,
    })) requireHash(hash, label, "WORLD_PACKAGE_MANIFEST_INVALID");
  } else {
    fail("WORLD_PACKAGE_MANIFEST_INVALID", "scene source discriminator invalid");
  }
  const legal = exactRecord(
    value.legal,
    ["distributionPolicy", "noticePath", "licenseDocuments"],
    "WORLD_PACKAGE_MANIFEST_INVALID",
  );
  if (
    (legal.distributionPolicy !== "internal-only" &&
      legal.distributionPolicy !== "redistributable") ||
    legal.noticePath !== "NOTICE" || !Array.isArray(legal.licenseDocuments)
  ) fail("WORLD_PACKAGE_MANIFEST_INVALID", "legal record invalid");
  const legalDocumentIds = new Set<string>();
  const legalDocumentPaths = new Set<string>();
  for (const candidate of legal.licenseDocuments) {
    const document = exactRecord(
      candidate,
      ["id", "spdxLicenseExpression", "path", "mediaType", "sizeBytes", "contentHash"],
      "WORLD_PACKAGE_MANIFEST_INVALID",
    );
    const id = requireCanonicalString(document.id, "legal.id", "WORLD_PACKAGE_MANIFEST_INVALID");
    const path = requireSafePath(document.path, "legal.path", "WORLD_PACKAGE_MANIFEST_INVALID");
    if (
      legalDocumentIds.has(id) || legalDocumentPaths.has(path) ||
      !path.startsWith("LICENSES/") ||
      document.mediaType !== "text/plain; charset=utf-8"
    ) fail("WORLD_PACKAGE_MANIFEST_INVALID", "legal document invalid");
    legalDocumentIds.add(id);
    legalDocumentPaths.add(path);
    requireCanonicalString(
      document.spdxLicenseExpression,
      "legal.spdxLicenseExpression",
      "WORLD_PACKAGE_MANIFEST_INVALID",
    );
    requireSafeInteger(document.sizeBytes, "legal.sizeBytes", "WORLD_PACKAGE_MANIFEST_INVALID");
    requireHash(document.contentHash, "legal.contentHash", "WORLD_PACKAGE_MANIFEST_INVALID");
  }
  const compatibility = exactRecord(
    value.hostCompatibility,
    ["profileRef", "profileHash", "runtimeContractVersion", "requiredFeatureIds"],
    "WORLD_PACKAGE_MANIFEST_INVALID",
  );
  requireCanonicalString(
    compatibility.profileRef,
    "hostCompatibility.profileRef",
    "WORLD_PACKAGE_MANIFEST_INVALID",
  );
  requireHash(
    compatibility.profileHash,
    "hostCompatibility.profileHash",
    "WORLD_PACKAGE_MANIFEST_INVALID",
  );
  if (compatibility.runtimeContractVersion !== 1) {
    fail("WORLD_PACKAGE_MANIFEST_INVALID", "runtime contract version invalid");
  }
  requireStringArray(
    compatibility.requiredFeatureIds,
    "hostCompatibility.requiredFeatureIds",
    "WORLD_PACKAGE_MANIFEST_INVALID",
  );
  if (!Array.isArray(value.resources)) {
    fail("WORLD_PACKAGE_MANIFEST_INVALID", "resources must be an array");
  }
  const resourceRefs = new Set<string>();
  const resourcePaths = new Set<string>();
  for (const candidate of value.resources) {
    const resource = exactRecordWithOptionalFields(
      candidate,
      [
        "resourceRef", "packagePath", "mediaType", "sizeBytes", "contentHash",
        "licenseDocumentId", "redistributionPolicy",
      ],
      ["sourceUri", "author"],
      "WORLD_PACKAGE_MANIFEST_INVALID",
    );
    const resourceRef = requireCanonicalString(
      resource.resourceRef,
      "resourceRef",
      "WORLD_PACKAGE_MANIFEST_INVALID",
    );
    const packagePath = requireSafePath(
      resource.packagePath,
      "packagePath",
      "WORLD_PACKAGE_MANIFEST_INVALID",
    );
    if (
      resourceRefs.has(resourceRef) || resourcePaths.has(packagePath) ||
      PACKAGE_OWNED_RESOURCE_PATHS.has(packagePath) ||
      !packagePath.startsWith("resources/")
    ) {
      fail("WORLD_PACKAGE_MANIFEST_INVALID", "Package-owned files cannot be resources");
    }
    resourceRefs.add(resourceRef);
    resourcePaths.add(packagePath);
    requireCanonicalString(resource.mediaType, "mediaType", "WORLD_PACKAGE_MANIFEST_INVALID");
    requireSafeInteger(resource.sizeBytes, "sizeBytes", "WORLD_PACKAGE_MANIFEST_INVALID", 1);
    requireHash(resource.contentHash, "contentHash", "WORLD_PACKAGE_MANIFEST_INVALID");
    requireCanonicalString(
      resource.licenseDocumentId,
      "licenseDocumentId",
      "WORLD_PACKAGE_MANIFEST_INVALID",
    );
    if (
      resource.redistributionPolicy !== "allowed" &&
      resource.redistributionPolicy !== "internal-only" &&
      resource.redistributionPolicy !== "prohibited"
    ) fail("WORLD_PACKAGE_MANIFEST_INVALID", "resource policy invalid");
    if (!isNil(resource.sourceUri)) {
      requireCanonicalString(resource.sourceUri, "sourceUri", "WORLD_PACKAGE_MANIFEST_INVALID");
    }
    if (!isNil(resource.author)) {
      requireCanonicalString(resource.author, "author", "WORLD_PACKAGE_MANIFEST_INVALID");
    }
  }
  const lockedResources = worldResourceLockEntriesV1(value.lockedResources);
  const canonical = deepFreeze({ ...value, lockedResources });
  if (stringifyCanonicalJson(value) !== stringifyCanonicalJson(canonical)) {
    fail("WORLD_PACKAGE_MANIFEST_INVALID", "manifest is not canonical");
  }
  return canonical;
}

export function hashWorldPackageManifestV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(canonicalizeWorldPackageManifestV1(
    input as WorldPackageManifestV1,
  )) as Sha256HashV1;
}

export function hashWorldPackageRootV1(
  entries: readonly WorldPackageFileIntegrityEntryV1[],
): Sha256HashV1 {
  return sha256CanonicalJson(
    canonicalizeWorldPackageFileIntegrityEntriesV1(entries),
  ) as Sha256HashV1;
}

export function assertWorldPackageBuildReceiptV1(
  input: unknown,
): WorldPackageBuildReceiptV1 {
  const value = snapshot(input, "WORLD_PACKAGE_BUILD_RECEIPT_INVALID") as
    WorldPackageBuildReceiptV1;
  if (
    value.kind !== "worldkit-world-package-build-receipt" ||
    value.schemaVersion !== 1
  ) fail("WORLD_PACKAGE_BUILD_RECEIPT_INVALID", "discriminator invalid");
  const manifest = canonicalizeWorldPackageManifestV1(value.manifest);
  const entries = canonicalizeWorldPackageFileIntegrityEntriesV1(
    value.fileIntegrityEntries,
  );
  const manifestHash = hashWorldPackageManifestV1(manifest);
  const rootHash = hashWorldPackageRootV1(entries);
  const identity = parseWorldBuildIdentityV1(value.worldBuildIdentity);
  const identityHash = hashWorldBuildIdentityV1(identity);
  if (
    value.manifestHash !== manifestHash ||
    value.worldPackageRootHash !== rootHash ||
    value.worldPackageRef !== worldPackageRefFromRootHashV1(rootHash) ||
    identity.worldPackageRootHash !== rootHash ||
    identity.worldPackageRef !== value.worldPackageRef ||
    value.worldBuildIdentityHash !== identityHash ||
    identity.gameplayBootstrapHash !== manifest.gameplayBootstrapHash ||
    identity.worldRuntimeBootstrapHash !== manifest.worldRuntimeBootstrapHash ||
    (
      manifest.sceneSource.kind === "canonical-execution-plan"
        ? identity.sceneSourceIdentity.kind !== "canonical-execution-plan" ||
          identity.sceneSourceIdentity.executionPlanHash !==
            manifest.sceneSource.executionPlanHash
        : identity.sceneSourceIdentity.kind !== "babylon-native-scene" ||
          identity.sceneSourceIdentity.nativeSceneBootstrapHash !==
            manifest.sceneSource.nativeSceneBootstrapHash ||
          identity.sceneSourceIdentity.sceneModuleBundleHash !==
            manifest.sceneSource.sceneModuleBundleHash ||
          identity.sceneSourceIdentity.nativeSceneContributionHash !==
            manifest.sceneSource.nativeSceneContributionHash
    )
  ) fail("WORLD_PACKAGE_BUILD_RECEIPT_INVALID", "receipt identity mismatch");
  return deepFreeze({
    ...value,
    manifest,
    fileIntegrityEntries: entries,
    worldBuildIdentity: identity,
  });
}

export function assertCanonicalWorldPackageGameplayBootstrapMembershipV1(
  input: CanonicalWorldPackageGameplayBootstrapMembershipInputV1,
): void {
  const receipt = assertWorldPackageBuildReceiptV1(
    input.worldPackageBuildReceipt,
  );
  const plan = input.canonicalSceneExecutionPlan;
  const runtime = input.worldRuntimeBootstrap;
  const gameplay = input.gameplayBootstrap;
  if (receipt.manifest.sceneSource.kind !== "canonical-execution-plan") {
    fail("WORLD_PACKAGE_GAMEPLAY_BOOTSTRAP_MEMBERSHIP_INVALID", "Package is not Canonical");
  }
  const sceneSource = receipt.manifest.sceneSource;
  if (
    hashCanonicalSceneExecutionPlanV1(plan) !== sceneSource.executionPlanHash ||
    gameplay.contentHash !== receipt.manifest.gameplayBootstrapHash ||
    runtime.contentHash !== receipt.manifest.worldRuntimeBootstrapHash ||
    plan.worldRuntimeBootstrapHash !== runtime.contentHash ||
    runtime.gameplayBootstrapRef !== gameplay.resourceRef ||
    runtime.gameplayBootstrapHash !== gameplay.contentHash ||
    runtime.initialControlledEntityId !== receipt.manifest.initialControlledEntityId
  ) fail("WORLD_PACKAGE_GAMEPLAY_BOOTSTRAP_MEMBERSHIP_INVALID", "component closure mismatch");
}

export function assertWorldPackageHostCompatibilityV1(
  receiptInput: unknown,
  policy: WorldPackageHostPolicyV1,
): WorldPackageBuildReceiptV1 {
  const receipt = assertWorldPackageBuildReceiptV1(receiptInput);
  const compatibility = receipt.manifest.hostCompatibility;
  if (
    !policy.acceptedRuntimeTargets.includes(receipt.manifest.runtimeTarget) ||
    !policy.acceptedPackageFormatVersions.includes(receipt.manifest.packageFormatVersion) ||
    !policy.acceptedManifestSchemaVersions.includes(receipt.manifest.schemaVersion) ||
    compatibility.runtimeContractVersion !== policy.runtimeContractVersion ||
    !policy.trustedCompatibilityProfiles.some((profile) =>
      profile.profileRef === compatibility.profileRef &&
      profile.profileHash === compatibility.profileHash
    ) ||
    compatibility.requiredFeatureIds.some((id) =>
      !policy.supportedFeatureIds.includes(id)
    ) ||
    !policy.allowedDistributionPolicies.includes(
      receipt.manifest.legal.distributionPolicy,
    )
  ) fail("WORLD_PACKAGE_HOST_INCOMPATIBLE", "host policy rejected package");
  return receipt;
}

export function canonicalizeWorldPackageSignatureEnvelopeV1(
  input: unknown,
): WorldPackageSignatureEnvelopeV1 {
  const value = snapshot(input, "WORLD_PACKAGE_SIGNATURE_ENVELOPE_INVALID") as
    WorldPackageSignatureEnvelopeV1;
  if (
    value.kind !== "worldkit-package-signature-envelope" ||
    value.schemaVersion !== 1 || value.packageFormatVersion !== 1 ||
    value.runtimeTarget !== "babylon-web" ||
    value.signatureAlgorithm !== "ed25519" ||
    value.packageId.length === 0 || value.keyId.length === 0 ||
    value.trustDomain.length === 0 || !Number.isFinite(Date.parse(value.signedAt))
  ) fail("WORLD_PACKAGE_SIGNATURE_ENVELOPE_INVALID", "signature envelope malformed");
  requireHash(value.packageRootHash, "packageRootHash", "WORLD_PACKAGE_SIGNATURE_ENVELOPE_INVALID");
  return deepFreeze(value);
}

export function worldPackageSignatureEnvelopeBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(canonicalizeWorldPackageSignatureEnvelopeV1(input));
}

export function equalWorldPackageHostCompatibilityV1(
  left: WorldPackageHostCompatibilityV1,
  right: WorldPackageHostCompatibilityV1,
): boolean {
  return isEqual(left, right);
}
