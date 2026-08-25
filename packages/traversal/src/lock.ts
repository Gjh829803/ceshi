import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil, isPlainObject } from "lodash-es";

import type {
  ResolvedTraversalLockReceiptV1,
  ResolvedTraversalLockV1,
} from "./types.js";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

const TRAVERSAL_LOCK_FIELDS = [
  "kind",
  "schemaVersion",
  "subjectEntityId",
  "resourceLockHash",
  "subjectDefinitionRef",
  "subjectDefinitionHash",
  "colliderProfileRef",
  "colliderProfileHash",
  "physicsBodyProfileRef",
  "physicsBodyProfileHash",
  "locomotionProfileRef",
  "locomotionProfileHash",
  "locomotionCapabilityRef",
  "locomotionCapabilityHash",
  "controlFeelProfileRef",
  "controlFeelProfileHash",
  "controlProfileRef",
  "controlProfileHash",
  "motionProfileRef",
  "motionProfileHash",
  "motionKernelRef",
  "motionKernelHash",
  "mediumProfileRef",
  "mediumProfileHash",
  "runtimeBackendRef",
  "runtimeBackendResolvedVersion",
  "runtimeBackendHash",
  "runtimeAdapterRef",
  "runtimeAdapterResolvedVersion",
  "runtimeAdapterHash",
  "capsuleRadiusMeters",
  "capsuleHeightMeters",
  "colliderCenterOffsetMetersXYZ",
  "maxSlopeDegrees",
  "maxStepHeightMeters",
] as const;

const TRAVERSAL_LOCK_HASH_FIELDS = [
  "resourceLockHash",
  "subjectDefinitionHash",
  "colliderProfileHash",
  "physicsBodyProfileHash",
  "locomotionProfileHash",
  "locomotionCapabilityHash",
  "controlFeelProfileHash",
  "controlProfileHash",
  "motionProfileHash",
  "motionKernelHash",
  "mediumProfileHash",
  "runtimeBackendHash",
  "runtimeAdapterHash",
] as const;

const TRAVERSAL_LOCK_STRING_FIELDS = [
  "subjectEntityId",
  "subjectDefinitionRef",
  "colliderProfileRef",
  "physicsBodyProfileRef",
  "locomotionProfileRef",
  "locomotionCapabilityRef",
  "controlFeelProfileRef",
  "controlProfileRef",
  "motionProfileRef",
  "motionKernelRef",
  "mediumProfileRef",
  "runtimeBackendRef",
  "runtimeBackendResolvedVersion",
  "runtimeAdapterRef",
  "runtimeAdapterResolvedVersion",
] as const;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function failLock(message: string): never {
  throw new Error(`TRAVERSAL_LOCK_INVALID: ${message}`);
}

function isSha256Hash(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failLock(`'${field}' must be a finite number.`);
  }
  return value;
}

export function resolveTraversalLockV1(
  value: unknown,
): ResolvedTraversalLockReceiptV1 {
  if (isNil(value) || !isPlainObject(value)) {
    failLock("expected an object.");
  }

  const record = value as Record<string, unknown>;
  const allowed = new Set<string>(TRAVERSAL_LOCK_FIELDS);
  const unknownFields = Object.keys(record).filter((field) => !allowed.has(field));
  if (!isEmpty(unknownFields)) {
    failLock(`unknown field '${unknownFields[0]}'.`);
  }

  for (const field of TRAVERSAL_LOCK_FIELDS) {
    if (isNil(record[field])) {
      failLock(`missing field '${field}'.`);
    }
  }

  if (record.kind !== "resolved-traversal-lock") {
    failLock("kind must be 'resolved-traversal-lock'.");
  }
  if (record.schemaVersion !== 1) {
    failLock("schemaVersion must be 1.");
  }

  for (const field of TRAVERSAL_LOCK_STRING_FIELDS) {
    if (typeof record[field] !== "string" || record[field].length === 0) {
      failLock(`'${field}' must be a non-empty string.`);
    }
  }
  for (const field of TRAVERSAL_LOCK_HASH_FIELDS) {
    if (!isSha256Hash(record[field])) {
      failLock(`'${field}' must be a lowercase sha256 hash.`);
    }
  }

  const capsuleRadiusMeters = requireFiniteNumber(
    record.capsuleRadiusMeters,
    "capsuleRadiusMeters",
  );
  const capsuleHeightMeters = requireFiniteNumber(
    record.capsuleHeightMeters,
    "capsuleHeightMeters",
  );
  const maxSlopeDegrees = requireFiniteNumber(
    record.maxSlopeDegrees,
    "maxSlopeDegrees",
  );
  const maxStepHeightMeters = requireFiniteNumber(
    record.maxStepHeightMeters,
    "maxStepHeightMeters",
  );
  if (!(capsuleRadiusMeters > 0)) {
    failLock("'capsuleRadiusMeters' must be > 0.");
  }
  if (!(capsuleHeightMeters > 0)) {
    failLock("'capsuleHeightMeters' must be > 0.");
  }
  if (!(maxSlopeDegrees >= 0 && maxSlopeDegrees < 90)) {
    failLock("'maxSlopeDegrees' must be in [0, 90).");
  }
  if (!(maxStepHeightMeters >= 0 && maxStepHeightMeters <= 2)) {
    failLock("'maxStepHeightMeters' must be in [0, 2].");
  }

  if (
    !Array.isArray(record.colliderCenterOffsetMetersXYZ) ||
    record.colliderCenterOffsetMetersXYZ.length !== 3
  ) {
    failLock("'colliderCenterOffsetMetersXYZ' must be a 3-tuple.");
  }
  const colliderCenterOffsetMetersXYZ = record.colliderCenterOffsetMetersXYZ.map(
    (component, index) =>
      requireFiniteNumber(component, `colliderCenterOffsetMetersXYZ/${index}`),
  ) as [number, number, number];

  const lock = deepFreeze(
    structuredClone({
      kind: "resolved-traversal-lock",
      schemaVersion: 1,
      subjectEntityId: record.subjectEntityId,
      resourceLockHash: record.resourceLockHash,
      subjectDefinitionRef: record.subjectDefinitionRef,
      subjectDefinitionHash: record.subjectDefinitionHash,
      colliderProfileRef: record.colliderProfileRef,
      colliderProfileHash: record.colliderProfileHash,
      physicsBodyProfileRef: record.physicsBodyProfileRef,
      physicsBodyProfileHash: record.physicsBodyProfileHash,
      locomotionProfileRef: record.locomotionProfileRef,
      locomotionProfileHash: record.locomotionProfileHash,
      locomotionCapabilityRef: record.locomotionCapabilityRef,
      locomotionCapabilityHash: record.locomotionCapabilityHash,
      controlFeelProfileRef: record.controlFeelProfileRef,
      controlFeelProfileHash: record.controlFeelProfileHash,
      controlProfileRef: record.controlProfileRef,
      controlProfileHash: record.controlProfileHash,
      motionProfileRef: record.motionProfileRef,
      motionProfileHash: record.motionProfileHash,
      motionKernelRef: record.motionKernelRef,
      motionKernelHash: record.motionKernelHash,
      mediumProfileRef: record.mediumProfileRef,
      mediumProfileHash: record.mediumProfileHash,
      runtimeBackendRef: record.runtimeBackendRef,
      runtimeBackendResolvedVersion: record.runtimeBackendResolvedVersion,
      runtimeBackendHash: record.runtimeBackendHash,
      runtimeAdapterRef: record.runtimeAdapterRef,
      runtimeAdapterResolvedVersion: record.runtimeAdapterResolvedVersion,
      runtimeAdapterHash: record.runtimeAdapterHash,
      capsuleRadiusMeters,
      capsuleHeightMeters,
      colliderCenterOffsetMetersXYZ,
      maxSlopeDegrees,
      maxStepHeightMeters,
    } as ResolvedTraversalLockV1),
  );

  return deepFreeze({
    lock,
    resolvedTraversalLockHash: sha256CanonicalJson(lock) as `sha256:${string}`,
  });
}

export function assertMatchingTraversalLocksV1(
  graphResolvedTraversalLockHash: string,
  runtimeResolvedTraversalLockHash: string,
): void {
  if (
    !isSha256Hash(graphResolvedTraversalLockHash) ||
    !isSha256Hash(runtimeResolvedTraversalLockHash)
  ) {
    failLock("lock hashes must be lowercase sha256 values.");
  }
  if (graphResolvedTraversalLockHash !== runtimeResolvedTraversalLockHash) {
    throw new Error("ROUTE_TRAVERSAL_LOCK_MISMATCH");
  }
}
