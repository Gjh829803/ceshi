import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  canonicalResourceLockEntriesV1,
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
  WorldPackageFileIntegrityEntryV1,
  WorldPackageGameplayBootstrapMembershipInputV1,
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
    if (Reflect.getPrototypeOf(value) !== Array.prototype) fail(code, "array prototype invalid");
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

export function canonicalWorldPackageFileIntegrityEntriesV1(
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

export function canonicalWorldPackageManifestV1(
  input: WorldPackageManifestV1,
): WorldPackageManifestV1 {
  const value = snapshot(input, "WORLD_PACKAGE_MANIFEST_INVALID") as
    WorldPackageManifestV1;
  if (
    isNil(value.entryPoint) || typeof value.entryPoint !== "object" ||
    isNil(value.authoringSchema) || typeof value.authoringSchema !== "object" ||
    isNil(value.aiSchemaProjectionProfile) ||
      typeof value.aiSchemaProjectionProfile !== "object" ||
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
    value.normalizedWorldIrSchemaVersion !== 4 ||
    value.canonicalSceneExecutionPlanSchemaVersion !== 1 ||
    value.worldRuntimeBootstrapSchemaVersion !== 1 ||
    value.entryPoint.canonicalSceneExecutionPlanPath !==
      "targets/babylon-web/canonical-scene-execution-plan.json" ||
    value.entryPoint.gameplayBootstrapPath !== "gameplay/bootstrap.json" ||
    value.entryPoint.worldRuntimeBootstrapPath !==
      "runtime/world-runtime-bootstrap.json"
  ) fail("WORLD_PACKAGE_MANIFEST_INVALID", "discriminator or entry point invalid");
  for (const [label, hash] of Object.entries({
    authoringSpecHash: value.authoringSpecHash,
    normalizedWorldIrHash: value.normalizedWorldIrHash,
    executionPlanHash: value.executionPlanHash,
    gameplayBootstrapHash: value.gameplayBootstrapHash,
    worldRuntimeBootstrapHash: value.worldRuntimeBootstrapHash,
    registryLockHash: value.registryLockHash,
    layoutSolveReportHash: value.layoutSolveReportHash,
  })) requireHash(hash, label, "WORLD_PACKAGE_MANIFEST_INVALID");
  const lockedResources = canonicalResourceLockEntriesV1(value.lockedResources);
  const canonical = deepFreeze({ ...value, lockedResources });
  if (stringifyCanonicalJson(value) !== stringifyCanonicalJson(canonical)) {
    fail("WORLD_PACKAGE_MANIFEST_INVALID", "manifest is not canonical");
  }
  return canonical;
}

export function hashWorldPackageManifestV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(canonicalWorldPackageManifestV1(
    input as WorldPackageManifestV1,
  )) as Sha256HashV1;
}

export function hashWorldPackageRootV1(
  entries: readonly WorldPackageFileIntegrityEntryV1[],
): Sha256HashV1 {
  return sha256CanonicalJson(
    canonicalWorldPackageFileIntegrityEntriesV1(entries),
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
  const manifest = canonicalWorldPackageManifestV1(value.manifest);
  const entries = canonicalWorldPackageFileIntegrityEntriesV1(
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
    identity.sceneSourceIdentity.kind !== "canonical-execution-plan" ||
    identity.sceneSourceIdentity.executionPlanHash !== manifest.executionPlanHash
  ) fail("WORLD_PACKAGE_BUILD_RECEIPT_INVALID", "receipt identity mismatch");
  return deepFreeze({
    ...value,
    manifest,
    fileIntegrityEntries: entries,
    worldBuildIdentity: identity,
  });
}

export function assertWorldPackageGameplayBootstrapMembershipV1(
  input: WorldPackageGameplayBootstrapMembershipInputV1,
): void {
  const receipt = assertWorldPackageBuildReceiptV1(
    input.worldPackageBuildReceipt,
  );
  const plan = input.canonicalSceneExecutionPlan;
  const runtime = input.worldRuntimeBootstrap;
  const gameplay = input.gameplayBootstrap;
  if (
    hashCanonicalSceneExecutionPlanV1(plan) !== receipt.manifest.executionPlanHash ||
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

export function canonicalWorldPackageSignatureEnvelopeV1(
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
  return canonicalJsonBytes(canonicalWorldPackageSignatureEnvelopeV1(input));
}

export function equalWorldPackageHostCompatibilityV1(
  left: WorldPackageHostCompatibilityV1,
  right: WorldPackageHostCompatibilityV1,
): boolean {
  return isEqual(left, right);
}
