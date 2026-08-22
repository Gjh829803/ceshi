import {
  quantizeTraversalMetersToMicrometersV1,
  type TraversalCapabilityEnvelopeV1,
  type TraversalRuntimeImplementationIdentityV1,
} from "@whitebox-world/traversal";

import {
  assertAuditedTraversalRuntimeIdentityV1,
  RECAST_PROVIDER_CONSTANTS_V1,
} from "./adapter-identity.js";

export interface RecastTiledConfigV1 {
  readonly borderSize: number;
  readonly tileSize: number;
  readonly cs: number;
  readonly ch: number;
  readonly walkableSlopeAngle: number;
  readonly walkableHeight: number;
  readonly walkableClimb: number;
  readonly walkableRadius: number;
  readonly maxEdgeLen: number;
  readonly maxSimplificationError: number;
  readonly minRegionArea: number;
  readonly mergeRegionArea: number;
  readonly maxVertsPerPoly: number;
  readonly detailSampleDist: number;
  readonly detailSampleMaxError: number;
  readonly buildBvTree: boolean;
  readonly chunkyTriMeshTrisPerChunk: number;
}

function failConfig(message: string): never {
  throw new Error(`TRAVERSAL_RECAST_CONFIG_INVALID: ${message}`);
}

function configMicrometers(valueMeters: number, field: string): number {
  if (!Number.isFinite(valueMeters)) {
    failConfig(`'${field}' must be finite.`);
  }
  try {
    return quantizeTraversalMetersToMicrometersV1(valueMeters);
  } catch {
    failConfig(`'${field}' exceeds the deterministic micrometer range.`);
  }
}

function positiveMicrometers(valueMeters: number, field: string): number {
  if (!(valueMeters > 0)) {
    failConfig(`'${field}' must be > 0.`);
  }
  const micrometers = configMicrometers(valueMeters, field);
  if (!(micrometers > 0)) {
    failConfig(`'${field}' must be at least one micrometer.`);
  }
  return micrometers;
}

function nonNegativeMicrometers(valueMeters: number, field: string): number {
  if (valueMeters < 0) {
    failConfig(`'${field}' must be >= 0.`);
  }
  const micrometers = configMicrometers(valueMeters, field);
  return micrometers;
}

export function mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
  envelope: TraversalCapabilityEnvelopeV1,
): RecastTiledConfigV1 {
  if (
    envelope.kind !== "traversal-capability-envelope" ||
    envelope.schemaVersion !== 1 ||
    envelope.traversalMode !== "ground"
  ) {
    failConfig("a ground TraversalCapabilityEnvelopeV1 is required.");
  }
  assertAuditedTraversalRuntimeIdentityV1({
    runtimeBackendRef: envelope.runtimeBackendRef,
    runtimeBackendResolvedVersion: envelope.runtimeBackendResolvedVersion,
    runtimeBackendHash: envelope.runtimeBackendHash,
    runtimeAdapterRef: envelope.runtimeAdapterRef,
    runtimeAdapterResolvedVersion: envelope.runtimeAdapterResolvedVersion,
    runtimeAdapterHash: envelope.runtimeAdapterHash,
  } satisfies TraversalRuntimeImplementationIdentityV1);

  const capsuleHeightMicrometers = positiveMicrometers(
    envelope.capsuleHeightMeters,
    "capsuleHeightMeters",
  );
  const capsuleRadiusMicrometers = positiveMicrometers(
    envelope.capsuleRadiusMeters,
    "capsuleRadiusMeters",
  );
  const clearanceMarginMicrometers = nonNegativeMicrometers(
    envelope.clearanceMarginMeters,
    "clearanceMarginMeters",
  );
  const maxStepHeightMicrometers = nonNegativeMicrometers(
    envelope.maxStepHeightMeters,
    "maxStepHeightMeters",
  );
  const voxelCellSizeMicrometers = positiveMicrometers(
    envelope.voxelCellSizeMeters,
    "voxelCellSizeMeters",
  );
  const voxelCellHeightMicrometers = positiveMicrometers(
    envelope.voxelCellHeightMeters,
    "voxelCellHeightMeters",
  );
  const maximumEdgeLengthMicrometers = positiveMicrometers(
    envelope.maximumEdgeLengthMeters,
    "maximumEdgeLengthMeters",
  );
  const maximumSimplificationErrorMicrometers = positiveMicrometers(
    envelope.maximumSimplificationErrorMeters,
    "maximumSimplificationErrorMeters",
  );
  if (
    !Number.isSafeInteger(envelope.tileSizeCells) ||
    !(envelope.tileSizeCells > 0)
  ) {
    failConfig("'tileSizeCells' must be a positive safe integer.");
  }
  if (
    !Number.isFinite(envelope.maxSlopeDegrees) ||
    envelope.maxSlopeDegrees < 0 ||
    !(envelope.maxSlopeDegrees < 90)
  ) {
    failConfig("'maxSlopeDegrees' must be in [0, 90).");
  }

  const walkableHeight = Math.ceil(
    capsuleHeightMicrometers / voxelCellHeightMicrometers,
  );
  const maxEdgeLen = Math.floor(
    maximumEdgeLengthMicrometers / voxelCellSizeMicrometers,
  );
  if (walkableHeight < 3) {
    failConfig("mapped walkableHeight must be at least 3 cells.");
  }
  if (maxEdgeLen < 1) {
    failConfig("mapped maxEdgeLen must be at least 1 cell.");
  }

  return Object.freeze({
    tileSize: envelope.tileSizeCells,
    cs: voxelCellSizeMicrometers / 1_000_000,
    ch: voxelCellHeightMicrometers / 1_000_000,
    walkableSlopeAngle: envelope.maxSlopeDegrees,
    walkableHeight,
    walkableClimb: Math.floor(
      maxStepHeightMicrometers / voxelCellHeightMicrometers,
    ),
    walkableRadius: Math.ceil(
      (capsuleRadiusMicrometers + clearanceMarginMicrometers) /
        voxelCellSizeMicrometers,
    ),
    maxEdgeLen,
    maxSimplificationError:
      maximumSimplificationErrorMicrometers / voxelCellSizeMicrometers,
    ...RECAST_PROVIDER_CONSTANTS_V1,
  });
}
