import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil, isPlainObject } from "lodash-es";

import { resolveTraversalLockV1 } from "./lock.js";
import {
  resolveTraversalGraphBuilderProfileV2,
  validateTraversalGraphBuilderProfileV2,
} from "./profile-registry.js";
import type {
  ResolvedTraversalGraphBuilderProfileV2,
  ResolvedTraversalLockReceiptV1,
  TraversalCapabilityEnvelopeReceiptV1,
  TraversalCapabilityEnvelopeV1,
} from "./types.js";

export interface CreateTraversalCapabilityEnvelopeInputV1 {
  readonly traversalLockReceipt: ResolvedTraversalLockReceiptV1;
  readonly graphBuilderProfile: ResolvedTraversalGraphBuilderProfileV2;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertImmutableInput(
  input: unknown,
): asserts input is CreateTraversalCapabilityEnvelopeInputV1 {
  if (!isPlainObject(input)) {
    throw new Error(
      "TRAVERSAL_CAPABILITY_ENVELOPE_INPUT_INVALID: expected a plain object.",
    );
  }
  const inputRecord = input as Record<string, unknown>;
  const allowedFields = new Set([
    "traversalLockReceipt",
    "graphBuilderProfile",
  ]);
  const unknownFields = Object.keys(inputRecord).filter(
    (field) => !allowedFields.has(field),
  );
  if (!isEmpty(unknownFields)) {
    throw new Error(
      `TRAVERSAL_CAPABILITY_ENVELOPE_INPUT_INVALID: unknown field '${unknownFields[0]}'.`,
    );
  }
  if (
    isNil(inputRecord.traversalLockReceipt) ||
    !isPlainObject(inputRecord.traversalLockReceipt) ||
    isNil(inputRecord.graphBuilderProfile) ||
    !isPlainObject(inputRecord.graphBuilderProfile)
  ) {
    throw new Error(
      "TRAVERSAL_CAPABILITY_ENVELOPE_INPUT_INVALID: traversalLockReceipt and graphBuilderProfile are required objects.",
    );
  }
  const traversalLockReceipt = inputRecord.traversalLockReceipt as unknown as
    ResolvedTraversalLockReceiptV1;
  const graphBuilderProfile = inputRecord.graphBuilderProfile as unknown as
    ResolvedTraversalGraphBuilderProfileV2;
  if (
    !Object.isFrozen(traversalLockReceipt) ||
    !Object.isFrozen(traversalLockReceipt.lock) ||
    !Object.isFrozen(
      traversalLockReceipt.lock.colliderCenterOffsetMetersXYZ,
    ) ||
    !Object.isFrozen(graphBuilderProfile) ||
    !Object.isFrozen(graphBuilderProfile.profile)
  ) {
    throw new Error(
      "TRAVERSAL_CAPABILITY_ENVELOPE_INPUT_MUTABLE: receipts must be deeply frozen.",
    );
  }
}

export function createTraversalCapabilityEnvelopeV1(
  input: CreateTraversalCapabilityEnvelopeInputV1,
): TraversalCapabilityEnvelopeReceiptV1 {
  assertImmutableInput(input as unknown);

  const lockReceipt = resolveTraversalLockV1(input.traversalLockReceipt.lock);
  if (
    lockReceipt.resolvedTraversalLockHash !==
    input.traversalLockReceipt.resolvedTraversalLockHash
  ) {
    throw new Error(
      "TRAVERSAL_CAPABILITY_ENVELOPE_LOCK_RECEIPT_INVALID: lock hash does not match canonical lock bytes.",
    );
  }

  if (input.graphBuilderProfile.profile.schemaVersion !== 2) {
    throw new Error(
      "TRAVERSAL_CAPABILITY_ENVELOPE_PROFILE_VERSION_UNSUPPORTED: a V2 Graph Builder Profile is required.",
    );
  }
  validateTraversalGraphBuilderProfileV2(input.graphBuilderProfile.profile);
  const canonicalProfileHash = sha256CanonicalJson(
    input.graphBuilderProfile.profile,
  ) as `sha256:${string}`;
  const registeredProfile = resolveTraversalGraphBuilderProfileV2(
    input.graphBuilderProfile.resourceRef,
  );
  if (
    input.graphBuilderProfile.resolvedVersion !== registeredProfile.resolvedVersion ||
    input.graphBuilderProfile.contentHash !== canonicalProfileHash ||
    input.graphBuilderProfile.contentHash !== registeredProfile.contentHash
  ) {
    throw new Error(
      "TRAVERSAL_CAPABILITY_ENVELOPE_PROFILE_RECEIPT_INVALID: Profile identity does not match canonical Registry bytes.",
    );
  }

  const lock = lockReceipt.lock;
  const profile = registeredProfile.profile;
  const envelope = deepFreeze(structuredClone({
    kind: "traversal-capability-envelope",
    schemaVersion: 1,
    traversalMode: "ground",
    subjectEntityId: lock.subjectEntityId,
    resourceLockHash: lock.resourceLockHash,
    colliderSource: lock.colliderSource,
    physicsBodyProfileRef: lock.physicsBodyProfileRef,
    physicsBodyProfileHash: lock.physicsBodyProfileHash,
    locomotionProfileRef: lock.locomotionProfileRef,
    locomotionProfileHash: lock.locomotionProfileHash,
    locomotionCapabilityRef: lock.locomotionCapabilityRef,
    locomotionCapabilityHash: lock.locomotionCapabilityHash,
    runtimeBackendRef: lock.runtimeBackendRef,
    runtimeBackendResolvedVersion: lock.runtimeBackendResolvedVersion,
    runtimeBackendHash: lock.runtimeBackendHash,
    runtimeAdapterRef: lock.runtimeAdapterRef,
    runtimeAdapterResolvedVersion: lock.runtimeAdapterResolvedVersion,
    runtimeAdapterHash: lock.runtimeAdapterHash,
    capsuleRadiusMeters: lock.capsuleRadiusMeters,
    capsuleHeightMeters: lock.capsuleHeightMeters,
    colliderCenterOffsetMetersXYZ: lock.colliderCenterOffsetMetersXYZ,
    maxSlopeDegrees: lock.maxSlopeDegrees,
    maxStepHeightMeters: lock.maxStepHeightMeters,
    resolvedTraversalLockHash: lockReceipt.resolvedTraversalLockHash,
    graphBuilderProfileRef: registeredProfile.resourceRef,
    graphBuilderResolvedVersion: registeredProfile.resolvedVersion,
    graphBuilderProfileHash: registeredProfile.contentHash,
    clearanceMarginMeters: profile.clearanceMarginMeters,
    voxelCellSizeMeters: profile.voxelCellSizeMeters,
    voxelCellHeightMeters: profile.voxelCellHeightMeters,
    tileSizeCells: profile.tileSizeCells,
    maximumEdgeLengthMeters: profile.maximumEdgeLengthMeters,
    maximumSimplificationErrorMeters: profile.maximumSimplificationErrorMeters,
    positionQuantizationMeters: profile.positionQuantizationMeters,
    slopeCostWeight: profile.slopeCostWeight,
    stepCostWeight: profile.stepCostWeight,
    maximumNodes: profile.maximumNodes,
    maximumEdges: profile.maximumEdges,
    maximumTiles: profile.maximumTiles,
    maximumSearchSteps: profile.maximumSearchSteps,
    maximumTraversalSurfaceCount: profile.maximumTraversalSurfaceCount,
    minimumEquivalentPlaneNormalDotRatio:
      profile.minimumEquivalentPlaneNormalDotRatio,
    maximumTraversalSurfaceTrianglePairTestCount:
      profile.maximumTraversalSurfaceTrianglePairTestCount,
  } satisfies TraversalCapabilityEnvelopeV1));

  return deepFreeze({
    envelope,
    traversalCapabilityEnvelopeHash: sha256CanonicalJson(
      envelope,
    ) as `sha256:${string}`,
  });
}
