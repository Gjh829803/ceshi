import {
  canonicalAuthoringIdentityV4,
  canonicalAuthoringLayoutIdentityV4,
  projectNormalizedWorldResourcesToLayoutIdentityV4,
  validateAuthoringSpecV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import {
  createGameplayBootstrapResourceLockEntryV1,
  gameplayBootstrapCanonicalBytesV1,
  parseGameplayBootstrapV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import { hashLayoutSolveReportV1 } from "@whitebox-world/layout-solver";
import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import {
  canonicalExecutionResourceLockEntriesV1,
  type ExecutionPlanV5,
  type ExecutionResourceLockEntryV1,
} from "@whitebox-world/runtime-contracts";
import { isEqual, isNil, isPlainObject } from "lodash-es";

import {
  assertSafeWorldPackagePathV1,
  assertWorldPackageAccessorFreeDataGraphV1,
  canonicalWorldPackageFileIntegrityEntriesV1,
  canonicalWorldPackageManifestV1,
  deepFreeze,
  hashWorldPackageManifestV1,
  hashWorldPackageRootV1,
} from "./manifest.js";
import type {
  CreateWorldPackageBuildReceiptInputV1,
  ResolvedWorldPackageResourceArtifactV1,
  WorldPackageBuildClosureV1,
  WorldPackageBuildReceiptV1,
  WorldPackageFileIntegrityEntryV1,
  WorldPackageManifestV1,
  WorldPackageResourceArtifactV1,
  WorldPackageSha256HashV1,
  WorldPackageGameplayBootstrapMembershipInputV1,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;
export const GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1 = "gameplay/bootstrap.json";
export const GAMEPLAY_BOOTSTRAP_MEDIA_TYPE_V1 =
  "application/vnd.worldkit.gameplay-bootstrap+json";
const RECEIPT_FIELDS = [
  "kind",
  "schemaVersion",
  "manifest",
  "manifestHash",
  "fileIntegrityEntries",
  "worldPackageRootHash",
] as const;
const INPUT_REQUIRED_FIELDS = [
  "packageId",
  "authoringSpec",
  "normalizedWorldIr",
  "layoutSolveResult",
  "executionPlan",
  "gameplayBootstrap",
  "resourceArtifacts",
] as const;
const INPUT_ALLOWED_FIELDS = [...INPUT_REQUIRED_FIELDS, "includeAuthoringSpec"] as const;
const RESOURCE_INPUT_FIELDS = ["resourceRef", "packagePath", "mediaType", "bytes"] as const;
const BUILD_CLOSURE_FIELDS = [
  "authoringSpec",
  "normalizedWorldIr",
  "layoutSolveResult",
  "executionPlan",
  "gameplayBootstrap",
] as const;

function fail(code: string, path: string, message: string): never {
  throw new Error(`${code}: ${path.length === 0 ? message : `${path}: ${message}`}`);
}

function exactRecord(
  value: unknown,
  requiredFields: readonly string[],
  allowedFields: readonly string[],
  path: string,
  code: string,
): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) fail(code, path, "expected a plain object");
  const record = value as UnknownRecord;
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) fail(code, path, `unknown field '${unknown}'`);
  for (const field of requiredFields) {
    if (!Object.hasOwn(record, field) || isNil(record[field])) {
      fail(code, path, `missing field '${field}'`);
    }
  }
  return record;
}

function requireString(value: unknown, path: string, code: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    fail(code, path, "must be a non-empty canonical string");
  }
  return value;
}

function requireHash(value: unknown, path: string, code: string): WorldPackageSha256HashV1 {
  if (typeof value !== "string" || !HASH_PATTERN.test(value) || value === ZERO_HASH) {
    fail(code, path, "must be a non-zero lowercase sha256 hash");
  }
  return value as WorldPackageSha256HashV1;
}

function assertNoAllZeroHashValues(
  value: unknown,
  path = "",
  visited: WeakSet<object> = new WeakSet<object>(),
): void {
  if (isNil(value) || typeof value !== "object" || value instanceof Uint8Array) return;
  if (visited.has(value)) return;
  visited.add(value);
  for (const [key, child] of Object.entries(value)) {
    const childPath = path.length === 0 ? key : `${path}/${key}`;
    if (key.toLowerCase().endsWith("hash") && child === ZERO_HASH) {
      fail("WORLD_PACKAGE_BUILD_INPUT_INVALID", childPath, "all-zero hashes are forbidden");
    }
    assertNoAllZeroHashValues(child, childPath, visited);
  }
}

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalGameplayBootstrap(
  value: unknown,
  code: string,
  path: string,
): GameplayBootstrapV1 {
  try {
    return parseGameplayBootstrapV1(value);
  } catch {
    fail(code, path, "must be a canonical GameplayBootstrapV1");
  }
}

function canonicalPlanResourceLockWithGameplayBootstrap(
  normalizedWorldIr: CreateWorldPackageBuildReceiptInputV1["normalizedWorldIr"],
  executionPlan: ExecutionPlanV5,
  gameplayBootstrap: GameplayBootstrapV1,
  code: string,
): readonly ExecutionResourceLockEntryV1[] {
  let baseResourceLock: readonly ExecutionResourceLockEntryV1[];
  let planResourceLock: readonly ExecutionResourceLockEntryV1[];
  let expectedPlanResourceLock: readonly ExecutionResourceLockEntryV1[];
  try {
    baseResourceLock = canonicalExecutionResourceLockEntriesV1(
      normalizedWorldIr.resources.resourceLock,
    );
    planResourceLock = canonicalExecutionResourceLockEntriesV1(
      executionPlan.resourceLockEntries,
    );
    expectedPlanResourceLock = canonicalExecutionResourceLockEntriesV1([
      ...baseResourceLock,
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
    ]);
  } catch {
    fail(code, "executionPlan/resourceLockEntries", "must be a canonical Execution Resource Lock");
  }
  if (!isEqual(executionPlan.resourceLockEntries, planResourceLock)) {
    fail(code, "executionPlan/resourceLockEntries", "must use canonical resource order");
  }
  if (!isEqual(planResourceLock, expectedPlanResourceLock)) {
    fail(
      code,
      "executionPlan/resourceLockEntries",
      "must equal the Normalized IR Resource Lock plus exactly one Gameplay Bootstrap lock",
    );
  }
  const planResourceLockHash = sha256CanonicalJson(planResourceLock);
  if (executionPlan.resourceLockHash !== planResourceLockHash) {
    fail(code, "executionPlan/resourceLockHash", "does not match the full Execution Resource Lock");
  }
  return planResourceLock;
}

function jsonIntegrityEntry(path: string, value: unknown): WorldPackageFileIntegrityEntryV1 {
  const bytes = canonicalJsonBytes(value);
  return {
    path,
    mediaType: "application/json",
    sizeBytes: bytes.byteLength,
    sha256: sha256Bytes(bytes) as WorldPackageSha256HashV1,
  };
}

function canonicalResolvedResources(
  value: unknown,
  expectedAssets: CreateWorldPackageBuildReceiptInputV1["normalizedWorldIr"]["resources"]["subjectAssets"],
): {
  readonly manifestRows: readonly WorldPackageResourceArtifactV1[];
  readonly integrityRows: readonly WorldPackageFileIntegrityEntryV1[];
} {
  const code = "WORLD_PACKAGE_BUILD_INPUT_INVALID";
  if (!Array.isArray(value)) fail(code, "resourceArtifacts", "must be an array");
  const rows = value.map((candidate, index): ResolvedWorldPackageResourceArtifactV1 => {
    const path = `resourceArtifacts/${index}`;
    const row = exactRecord(
      candidate,
      RESOURCE_INPUT_FIELDS,
      RESOURCE_INPUT_FIELDS,
      path,
      code,
    );
    if (!(row.bytes instanceof Uint8Array)) fail(code, `${path}/bytes`, "must be Uint8Array");
    return {
      resourceRef: requireString(row.resourceRef, `${path}/resourceRef`, code),
      packagePath: assertSafeWorldPackagePathV1(
        row.packagePath,
        `${path}/packagePath`,
        code,
      ),
      mediaType: requireString(row.mediaType, `${path}/mediaType`, code),
      bytes: new Uint8Array(row.bytes),
    };
  }).sort((left, right) =>
    compareCanonicalStrings(left.resourceRef, right.resourceRef) ||
    compareCanonicalStrings(left.packagePath, right.packagePath)
  );
  if (new Set(rows.map((row) => row.resourceRef)).size !== rows.length) {
    fail(code, "resourceArtifacts", "resourceRef values must be unique");
  }
  if (new Set(rows.map((row) => row.packagePath)).size !== rows.length) {
    fail(code, "resourceArtifacts", "packagePath values must be unique");
  }
  const expectedByRef = new Map(expectedAssets.map((asset) => [asset.subjectAssetRef, asset]));
  if (rows.length !== expectedByRef.size) {
    fail(code, "resourceArtifacts", "must resolve every and only referenced subject asset");
  }
  const manifestRows = rows.map((row): WorldPackageResourceArtifactV1 => {
    const expected = expectedByRef.get(row.resourceRef);
    if (isNil(expected)) fail(code, "resourceArtifacts", `unexpected resource '${row.resourceRef}'`);
    const contentHash = sha256Bytes(row.bytes) as WorldPackageSha256HashV1;
    if (
      row.mediaType !== expected.mediaType ||
      row.bytes.byteLength !== expected.byteLength ||
      contentHash !== expected.artifactContentHash
    ) {
      fail(code, "resourceArtifacts", `resource '${row.resourceRef}' bytes do not match locked metadata`);
    }
    return {
      resourceRef: row.resourceRef,
      packagePath: row.packagePath,
      mediaType: row.mediaType,
      sizeBytes: row.bytes.byteLength,
      contentHash,
    };
  });
  return {
    manifestRows,
    integrityRows: manifestRows.map((row) => ({
      path: row.packagePath,
      mediaType: row.mediaType,
      sizeBytes: row.sizeBytes,
      sha256: row.contentHash,
    })),
  };
}

export function createWorldPackageBuildReceiptV1(
  input: CreateWorldPackageBuildReceiptInputV1,
): WorldPackageBuildReceiptV1 {
  const code = "WORLD_PACKAGE_BUILD_INPUT_INVALID";
  assertWorldPackageAccessorFreeDataGraphV1(
    input,
    "WORLD_PACKAGE_BUILD_INPUT_ACCESSOR_FORBIDDEN",
  );
  const record = exactRecord(input, INPUT_REQUIRED_FIELDS, INPUT_ALLOWED_FIELDS, "", code);
  if (!isNil(record.includeAuthoringSpec) && typeof record.includeAuthoringSpec !== "boolean") {
    fail(code, "includeAuthoringSpec", "must be boolean");
  }
  const snapshot = structuredClone(input);
  assertNoAllZeroHashValues(snapshot);
  const validated = validateAuthoringSpecV4(snapshot.authoringSpec);
  if (!validated.ok || validated.value === undefined) {
    fail(code, "authoringSpec", "must be a valid AuthoringSpecV4");
  }
  const spec = validated.value;
  const world = snapshot.normalizedWorldIr;
  const layout = snapshot.layoutSolveResult;
  const plan = snapshot.executionPlan;
  const gameplayBootstrap = canonicalGameplayBootstrap(
    snapshot.gameplayBootstrap,
    code,
    "gameplayBootstrap",
  );
  if (world.kind !== "worldkit-normalized-world" || world.schemaVersion !== 4) {
    fail(code, "normalizedWorldIr", "must be NormalizedWorldIRV4");
  }
  if (plan.kind !== "worldkit-execution-plan" || plan.schemaVersion !== 5) {
    fail(code, "executionPlan", "must be ExecutionPlanV5");
  }
  if (
    layout.status !== "solved" ||
    layout.report.kind !== "worldkit-layout-solve-report" ||
    layout.report.schemaVersion !== 1 ||
    layout.report.status !== "solved"
  ) {
    fail(code, "layoutSolveResult", "must be a solved LayoutSolveResultV1");
  }

  const authoringSpecHash = sha256CanonicalJson(
    canonicalAuthoringIdentityV4(spec, world),
  ) as WorldPackageSha256HashV1;
  const normalizedWorldIrHash = sha256CanonicalJson(world) as WorldPackageSha256HashV1;
  const executionPlanHash = sha256CanonicalJson(plan) as WorldPackageSha256HashV1;
  const layoutSolveReportHash = hashLayoutSolveReportV1(layout.report);
  const normalizedResourceLock = canonicalExecutionResourceLockEntriesV1(
    world.resources.resourceLock,
  );
  const planResourceLock = canonicalPlanResourceLockWithGameplayBootstrap(
    world,
    plan,
    gameplayBootstrap,
    code,
  );
  const normalizedResourceLockHash = sha256CanonicalJson(
    normalizedResourceLock,
  ) as WorldPackageSha256HashV1;
  const resourceLockHash = sha256CanonicalJson(
    planResourceLock,
  ) as WorldPackageSha256HashV1;
  const layoutResources = projectNormalizedWorldResourcesToLayoutIdentityV4(
    world.resources,
  );
  const layoutAuthoringSpecHash = sha256CanonicalJson(
    canonicalAuthoringLayoutIdentityV4(spec, {
      ...world,
      resources: layoutResources,
    }),
  );
  const requireBinding = (
    actual: unknown,
    expected: unknown,
    path: string,
  ): void => {
    if (!isEqual(actual, expected)) fail(code, path, "canonical binding mismatch");
  };
  requireBinding(
    world.resources.resourceLock,
    normalizedResourceLock,
    "normalizedWorldIr/resources/resourceLock",
  );
  requireBinding(plan.resourceLockEntries, planResourceLock, "executionPlan/resourceLockEntries");
  requireBinding(
    world.resources.resourceLockHash,
    normalizedResourceLockHash,
    "normalizedWorldIr/resources/resourceLockHash",
  );
  requireBinding(plan.resourceLockHash, resourceLockHash, "executionPlan/resourceLockHash");
  requireBinding(world.authoringSpecHash, authoringSpecHash, "normalizedWorldIr/authoringSpecHash");
  requireBinding(plan.authoringSpecHash, authoringSpecHash, "executionPlan/authoringSpecHash");
  requireBinding(plan.normalizedWorldIrHash, normalizedWorldIrHash, "executionPlan/normalizedWorldIrHash");
  requireBinding(layout.layoutSolveReportHash, layoutSolveReportHash, "layoutSolveResult/layoutSolveReportHash");
  requireBinding(world.layout.layoutSolveReportHash, layoutSolveReportHash, "normalizedWorldIr/layout/layoutSolveReportHash");
  requireBinding(plan.layout.layoutSolveReportHash, layoutSolveReportHash, "executionPlan/layout/layoutSolveReportHash");
  // Layout evidence binds the canonical V4 layout identity while the full V4
  // identity remains authoritative for the WorldPackage.
  requireBinding(layout.report.authoringSpecHash, layoutAuthoringSpecHash, "layoutSolveResult/report/authoringSpecHash");
  requireBinding(layout.report.registryLockHash, layoutResources.resourceLockHash, "layoutSolveResult/report/registryLockHash");
  requireBinding(layout.report.solverProfileRef, world.layout.solverProfileRef, "normalizedWorldIr/layout/solverProfileRef");
  requireBinding(layout.report.resolvedVersion, world.layout.resolvedVersion, "normalizedWorldIr/layout/resolvedVersion");
  requireBinding(layout.report.solverProfileHash, world.layout.solverProfileHash, "normalizedWorldIr/layout/solverProfileHash");
  requireBinding(layout.report.solverProfileRef, plan.layout.solverProfileRef, "executionPlan/layout/solverProfileRef");
  requireBinding(layout.report.resolvedVersion, plan.layout.resolvedVersion, "executionPlan/layout/resolvedVersion");
  requireBinding(layout.report.solverProfileHash, plan.layout.solverProfileHash, "executionPlan/layout/solverProfileHash");
  requireBinding(spec.id, world.id, "normalizedWorldIr/id");
  requireBinding(spec.id, plan.id, "executionPlan/id");
  requireBinding(spec.seed, world.seed, "normalizedWorldIr/seed");
  requireBinding(spec.seed, plan.seed, "executionPlan/seed");
  requireBinding(spec.seed, layout.report.seed, "layoutSolveResult/report/seed");
  requireBinding(
    spec.startup.controlledEntityId,
    plan.initialControlledEntityId,
    "executionPlan/initialControlledEntityId",
  );
  const normalizedSubjectAssetsByRef = new Map(
    world.resources.subjectAssets.map((asset) => [asset.subjectAssetRef, asset]),
  );
  if (
    normalizedSubjectAssetsByRef.size !== world.resources.subjectAssets.length ||
    new Set(plan.subjectAssets.map((asset) => asset.subjectAssetRef)).size !==
      plan.subjectAssets.length
  ) {
    fail(code, "executionPlan/subjectAssets", "subject asset Refs must be unique");
  }
  for (const asset of plan.subjectAssets) {
    const normalizedAsset = normalizedSubjectAssetsByRef.get(
      asset.subjectAssetRef,
    );
    if (isNil(normalizedAsset)) {
      fail(
        code,
        `executionPlan/subjectAssets/${asset.subjectAssetRef}`,
        "is missing from NormalizedWorldIRV4",
      );
    }
    const {
      subjectAssetManifestHash: _subjectAssetManifestHash,
      ...expectedExecutionAsset
    } = normalizedAsset;
    requireBinding(
      asset,
      expectedExecutionAsset,
      `executionPlan/subjectAssets/${asset.subjectAssetRef}`,
    );
  }
  requireBinding(world.world.coordinateSystem, plan.coordinateSystem, "executionPlan/coordinateSystem");
  requireBinding(
    world.world.gravityMetersPerSecondSquaredXYZ,
    plan.gravityMetersPerSecondSquaredXYZ,
    "executionPlan/gravityMetersPerSecondSquaredXYZ",
  );
  requireBinding(world.world.environment.preset, plan.atmospherePreset, "executionPlan/atmospherePreset");
  requireBinding(plan.runtimeBackend, "babylon-havok", "executionPlan/runtimeBackend");

  const compiled = compileWorldV5({
    normalizedWorldIr: world,
    normalizedWorldIrHash,
    gameplayBootstrapResourceLock:
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
  });
  if (
    !compiled.ok ||
    compiled.executionPlan === undefined ||
    compiled.executionPlanHash === undefined
  ) {
    fail(code, "executionPlan", "could not be regenerated from NormalizedWorldIRV4");
  }
  requireBinding(
    plan,
    compiled.executionPlan,
    "executionPlan",
  );
  requireBinding(
    executionPlanHash,
    compiled.executionPlanHash,
    "executionPlanHash",
  );

  const resources = canonicalResolvedResources(
    snapshot.resourceArtifacts,
    world.resources.subjectAssets,
  );
  const gameplayBootstrapBytes = gameplayBootstrapCanonicalBytesV1(
    gameplayBootstrap,
  );
  const gameplayBootstrapArtifactHash = sha256Bytes(
    gameplayBootstrapBytes,
  ) as WorldPackageSha256HashV1;
  const gameplayBootstrapManifestRow: WorldPackageResourceArtifactV1 = {
    resourceRef: gameplayBootstrap.resourceRef,
    packagePath: GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1,
    mediaType: GAMEPLAY_BOOTSTRAP_MEDIA_TYPE_V1,
    sizeBytes: gameplayBootstrapBytes.byteLength,
    contentHash: gameplayBootstrapArtifactHash,
  };
  const manifest = canonicalWorldPackageManifestV1({
    kind: "worldkit-world-package-manifest",
    schemaVersion: 1,
    id: requireString(snapshot.packageId, "packageId", code),
    packageFormatVersion: 1,
    worldId: spec.id,
    seed: spec.seed,
    runtimeTarget: "babylon-web",
    canonicalizationProfile: "canonical-json-jcs@1",
    hashAlgorithm: "sha256",
    authoringSchemaVersion: 4,
    normalizedWorldIrSchemaVersion: 4,
    executionPlanSchemaVersion: 5,
    authoringSpecHash,
    normalizedWorldIrHash,
    executionPlanHash,
    resourceLockHash,
    layoutSolveReportHash,
    initialControlledEntityId: plan.initialControlledEntityId,
    entryPoint: {
      executionPlanPath: "targets/babylon-web/execution-plan.json",
    },
    resources: [...resources.manifestRows, gameplayBootstrapManifestRow],
  });
  const manifestHash = hashWorldPackageManifestV1(manifest);
  const fileIntegrityEntries = canonicalWorldPackageFileIntegrityEntriesV1([
    jsonIntegrityEntry("manifest.json", manifest),
    ...(snapshot.includeAuthoringSpec === false
      ? []
      : [jsonIntegrityEntry("authoring-spec.json", spec)]),
    jsonIntegrityEntry("world.normalized.json", world),
    jsonIntegrityEntry("registry-lock.json", planResourceLock),
    jsonIntegrityEntry("layout-solve-report.json", layout.report),
    jsonIntegrityEntry("targets/babylon-web/execution-plan.json", plan),
    ...resources.integrityRows,
    {
      path: GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1,
      mediaType: GAMEPLAY_BOOTSTRAP_MEDIA_TYPE_V1,
      sizeBytes: gameplayBootstrapBytes.byteLength,
      sha256: gameplayBootstrapArtifactHash,
    },
  ]);
  const receipt = assertWorldPackageBuildReceiptV1({
    kind: "worldkit-world-package-build-receipt",
    schemaVersion: 1,
    manifest,
    manifestHash,
    fileIntegrityEntries,
    worldPackageRootHash: hashWorldPackageRootV1(fileIntegrityEntries),
  });
  assertWorldPackageGameplayBootstrapMembershipV1({
    executionPlan: plan,
    gameplayBootstrap,
    worldPackageBuildReceipt: receipt,
  });
  return receipt;
}

export function assertWorldPackageBuildReceiptV1(
  value: unknown,
): WorldPackageBuildReceiptV1 {
  const code = "WORLD_PACKAGE_BUILD_RECEIPT_INVALID";
  assertWorldPackageAccessorFreeDataGraphV1(
    value,
    "WORLD_PACKAGE_BUILD_RECEIPT_ACCESSOR_FORBIDDEN",
  );
  const record = exactRecord(value, RECEIPT_FIELDS, RECEIPT_FIELDS, "", code);
  if (record.kind !== "worldkit-world-package-build-receipt") fail(code, "kind", "invalid kind");
  if (record.schemaVersion !== 1) fail(code, "schemaVersion", "must be 1");
  let manifest: WorldPackageManifestV1;
  let entries: readonly WorldPackageFileIntegrityEntryV1[];
  try {
    manifest = canonicalWorldPackageManifestV1(record.manifest);
    entries = canonicalWorldPackageFileIntegrityEntriesV1(record.fileIntegrityEntries);
  } catch {
    fail(code, "", "Manifest or file integrity entries are invalid");
  }
  if (!isEqual(record.manifest, manifest)) {
    fail(code, "manifest", "must use canonical resource order");
  }
  if (!isEqual(record.fileIntegrityEntries, entries)) {
    fail(code, "fileIntegrityEntries", "must be in canonical path order");
  }
  const manifestHash = requireHash(record.manifestHash, "manifestHash", code);
  const worldPackageRootHash = requireHash(
    record.worldPackageRootHash,
    "worldPackageRootHash",
    code,
  );
  if (manifestHash !== hashWorldPackageManifestV1(manifest)) {
    fail(code, "manifestHash", "does not match Manifest canonical bytes");
  }
  const expectedPaths = new Set([
    "manifest.json",
    "world.normalized.json",
    "registry-lock.json",
    "layout-solve-report.json",
    manifest.entryPoint.executionPlanPath,
    ...manifest.resources.map((row) => row.packagePath),
  ]);
  const actualPaths = new Set(entries.map((row) => row.path));
  const hasAuthoringSpec = actualPaths.has("authoring-spec.json");
  if (hasAuthoringSpec) expectedPaths.add("authoring-spec.json");
  if (
    expectedPaths.size !== actualPaths.size ||
    [...expectedPaths].some((path) => !actualPaths.has(path))
  ) {
    fail(code, "fileIntegrityEntries", "must contain exactly the canonical package inventory");
  }
  const entryByPath = new Map(entries.map((row) => [row.path, row]));
  const manifestEntry = entryByPath.get("manifest.json")!;
  const requiredJsonPaths = [
    "manifest.json",
    "world.normalized.json",
    "registry-lock.json",
    "layout-solve-report.json",
    manifest.entryPoint.executionPlanPath,
    ...(hasAuthoringSpec ? ["authoring-spec.json"] : []),
  ];
  if (
    requiredJsonPaths.some((path) => entryByPath.get(path)?.mediaType !== "application/json") ||
    manifestEntry.sha256 !== manifestHash ||
    manifestEntry.sizeBytes !== canonicalJsonBytes(manifest).byteLength ||
    entryByPath.get("world.normalized.json")?.sha256 !== manifest.normalizedWorldIrHash ||
    entryByPath.get("registry-lock.json")?.sha256 !== manifest.resourceLockHash ||
    entryByPath.get("layout-solve-report.json")?.sha256 !== manifest.layoutSolveReportHash ||
    entryByPath.get(manifest.entryPoint.executionPlanPath)?.sha256 !== manifest.executionPlanHash
  ) {
    fail(code, "fileIntegrityEntries", "core file rows do not match Manifest identities");
  }
  for (const resource of manifest.resources) {
    const entry = entryByPath.get(resource.packagePath);
    if (
      isNil(entry) ||
      entry.mediaType !== resource.mediaType ||
      entry.sizeBytes !== resource.sizeBytes ||
      entry.sha256 !== resource.contentHash
    ) {
      fail(code, "fileIntegrityEntries", `resource '${resource.resourceRef}' is not bound`);
    }
  }
  if (worldPackageRootHash !== hashWorldPackageRootV1(entries)) {
    fail(code, "worldPackageRootHash", "does not match canonical file inventory");
  }
  return deepFreeze({
    kind: "worldkit-world-package-build-receipt",
    schemaVersion: 1,
    manifest,
    manifestHash,
    fileIntegrityEntries: entries,
    worldPackageRootHash,
  });
}

/**
 * Proves that one canonical Gameplay Bootstrap is a member of the exact Plan
 * Resource Lock and of the receipt-backed WorldPackage byte inventory.
 */
export function assertWorldPackageGameplayBootstrapMembershipV1(
  input: WorldPackageGameplayBootstrapMembershipInputV1,
): GameplayBootstrapV1 {
  const code = "WORLD_PACKAGE_GAMEPLAY_BOOTSTRAP_MEMBERSHIP_INVALID";
  assertWorldPackageAccessorFreeDataGraphV1(
    input,
    "WORLD_PACKAGE_GAMEPLAY_BOOTSTRAP_MEMBERSHIP_ACCESSOR_FORBIDDEN",
  );
  exactRecord(
    input,
    ["executionPlan", "gameplayBootstrap", "worldPackageBuildReceipt"],
    ["executionPlan", "gameplayBootstrap", "worldPackageBuildReceipt"],
    "",
    code,
  );
  let snapshot: WorldPackageGameplayBootstrapMembershipInputV1;
  try {
    snapshot = structuredClone(input);
  } catch {
    fail(code, "", "membership input must be a cloneable canonical data graph");
  }
  let receipt: WorldPackageBuildReceiptV1;
  try {
    receipt = assertWorldPackageBuildReceiptV1(
      snapshot.worldPackageBuildReceipt,
    );
  } catch {
    fail(code, "worldPackageBuildReceipt", "must be a canonical closed Build Receipt");
  }
  const gameplayBootstrap = canonicalGameplayBootstrap(
    snapshot.gameplayBootstrap,
    code,
    "gameplayBootstrap",
  );
  const plan = snapshot.executionPlan;
  if (plan.kind !== "worldkit-execution-plan" || plan.schemaVersion !== 5) {
    fail(code, "executionPlan", "must be ExecutionPlanV5");
  }
  const executionPlanHash = sha256CanonicalJson(
    plan,
  ) as WorldPackageSha256HashV1;
  if (receipt.manifest.executionPlanHash !== executionPlanHash) {
    fail(code, "executionPlan", "does not match the receipt Manifest Plan identity");
  }

  let planResourceLock: readonly ExecutionResourceLockEntryV1[];
  try {
    planResourceLock = canonicalExecutionResourceLockEntriesV1(
      plan.resourceLockEntries,
    );
  } catch {
    fail(code, "executionPlan/resourceLockEntries", "must be canonical");
  }
  if (!isEqual(plan.resourceLockEntries, planResourceLock)) {
    fail(code, "executionPlan/resourceLockEntries", "must use canonical order");
  }
  const expectedBootstrapLock = createGameplayBootstrapResourceLockEntryV1(
    gameplayBootstrap,
  );
  const bootstrapLocks = planResourceLock.filter(
    (entry) => entry.resourceKind === "gameplay-bootstrap",
  );
  if (
    bootstrapLocks.length !== 1 ||
    !isEqual(bootstrapLocks[0], expectedBootstrapLock) ||
    receipt.manifest.resourceLockHash !== sha256CanonicalJson(planResourceLock)
  ) {
    fail(
      code,
      "executionPlan/resourceLockEntries",
      "must contain exactly the supplied Gameplay Bootstrap semantic lock",
    );
  }

  const bootstrapBytes = gameplayBootstrapCanonicalBytesV1(
    gameplayBootstrap,
  );
  const bootstrapArtifactHash = sha256Bytes(
    bootstrapBytes,
  ) as WorldPackageSha256HashV1;
  const manifestRows = receipt.manifest.resources.filter(
    (row) =>
      row.resourceRef === gameplayBootstrap.resourceRef ||
      row.packagePath === GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1,
  );
  if (
    manifestRows.length !== 1 ||
    manifestRows[0]?.resourceRef !== gameplayBootstrap.resourceRef ||
    manifestRows[0]?.packagePath !== GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1 ||
    manifestRows[0]?.mediaType !== GAMEPLAY_BOOTSTRAP_MEDIA_TYPE_V1 ||
    manifestRows[0]?.sizeBytes !== bootstrapBytes.byteLength ||
    manifestRows[0]?.contentHash !== bootstrapArtifactHash
  ) {
    fail(code, "worldPackageBuildReceipt/manifest/resources", "Gameplay Bootstrap artifact is not bound");
  }
  const integrityRows = receipt.fileIntegrityEntries.filter(
    (entry) => entry.path === GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1,
  );
  if (
    integrityRows.length !== 1 ||
    integrityRows[0]?.mediaType !== GAMEPLAY_BOOTSTRAP_MEDIA_TYPE_V1 ||
    integrityRows[0]?.sizeBytes !== bootstrapBytes.byteLength ||
    integrityRows[0]?.sha256 !== bootstrapArtifactHash
  ) {
    fail(
      code,
      "worldPackageBuildReceipt/fileIntegrityEntries",
      "Gameplay Bootstrap canonical bytes are not bound",
    );
  }
  return gameplayBootstrap;
}

/**
 * Binds a self-consistent receipt to the canonical files and resource closure
 * that actually produced it. Package Root assembly remains owned here rather
 * than being independently reinterpreted by Validation or Host code.
 */
export function assertWorldPackageBuildReceiptClosureV1(
  value: unknown,
  closure: WorldPackageBuildClosureV1,
): WorldPackageBuildReceiptV1 {
  const code = "WORLD_PACKAGE_BUILD_RECEIPT_CLOSURE_INVALID";
  assertWorldPackageAccessorFreeDataGraphV1(
    closure,
    "WORLD_PACKAGE_BUILD_RECEIPT_CLOSURE_ACCESSOR_FORBIDDEN",
  );
  exactRecord(
    closure,
    BUILD_CLOSURE_FIELDS,
    BUILD_CLOSURE_FIELDS,
    "",
    code,
  );
  let snapshot: WorldPackageBuildClosureV1;
  try {
    snapshot = structuredClone(closure);
  } catch {
    fail(code, "", "closure must be a cloneable canonical data graph");
  }
  const receipt = assertWorldPackageBuildReceiptV1(value);
  const gameplayBootstrap = canonicalGameplayBootstrap(
    snapshot.gameplayBootstrap,
    code,
    "gameplayBootstrap",
  );
  try {
    assertWorldPackageGameplayBootstrapMembershipV1({
      executionPlan: snapshot.executionPlan,
      gameplayBootstrap,
      worldPackageBuildReceipt: receipt,
    });
  } catch {
    fail(code, "gameplayBootstrap", "does not match the locked WorldPackage membership");
  }

  const normalizedWorldIrHash = sha256CanonicalJson(
    snapshot.normalizedWorldIr,
  );
  const compiled = compileWorldV5({
    normalizedWorldIr: snapshot.normalizedWorldIr,
    normalizedWorldIrHash,
    gameplayBootstrapResourceLock:
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
  });
  if (
    !compiled.ok ||
    isNil(compiled.executionPlan) ||
    isNil(compiled.executionPlanHash) ||
    !isEqual(compiled.executionPlan, snapshot.executionPlan) ||
    compiled.executionPlanHash !== sha256CanonicalJson(snapshot.executionPlan)
  ) {
    fail(code, "executionPlan", "cannot be replayed from the exact locked closure");
  }

  const expectedAssetsByRef = new Map(
    snapshot.normalizedWorldIr.resources.subjectAssets.map((asset) => [
      asset.subjectAssetRef,
      asset,
    ]),
  );
  if (
    expectedAssetsByRef.size !==
      snapshot.normalizedWorldIr.resources.subjectAssets.length ||
    receipt.manifest.resources.length !== expectedAssetsByRef.size + 1
  ) {
    fail(code, "manifest/resources", "does not match the Normalized IR resource closure");
  }
  for (const resource of receipt.manifest.resources) {
    if (resource.packagePath === GAMEPLAY_BOOTSTRAP_PACKAGE_PATH_V1) continue;
    const expected = expectedAssetsByRef.get(resource.resourceRef);
    if (
      isNil(expected) ||
      resource.mediaType !== expected.mediaType ||
      resource.sizeBytes !== expected.byteLength ||
      resource.contentHash !== expected.artifactContentHash
    ) {
      fail(
        code,
        `manifest/resources/${resource.resourceRef}`,
        "does not match the Normalized IR resource closure",
      );
    }
  }

  const hasAuthoringSpec = receipt.fileIntegrityEntries.some(
    (entry) => entry.path === "authoring-spec.json",
  );
  const expectedEntries = canonicalWorldPackageFileIntegrityEntriesV1([
    jsonIntegrityEntry("manifest.json", receipt.manifest),
    ...(hasAuthoringSpec
      ? [jsonIntegrityEntry("authoring-spec.json", snapshot.authoringSpec)]
      : []),
    jsonIntegrityEntry("world.normalized.json", snapshot.normalizedWorldIr),
    jsonIntegrityEntry(
      "registry-lock.json",
      snapshot.executionPlan.resourceLockEntries,
    ),
    jsonIntegrityEntry(
      "layout-solve-report.json",
      snapshot.layoutSolveResult.report,
    ),
    jsonIntegrityEntry(
      receipt.manifest.entryPoint.executionPlanPath,
      snapshot.executionPlan,
    ),
    ...receipt.manifest.resources.map((resource) => ({
      path: resource.packagePath,
      mediaType: resource.mediaType,
      sizeBytes: resource.sizeBytes,
      sha256: resource.contentHash,
    })),
  ]);
  if (!isEqual(receipt.fileIntegrityEntries, expectedEntries)) {
    fail(
      code,
      "fileIntegrityEntries",
      "does not match the canonical build artifact closure",
    );
  }

  return receipt;
}
