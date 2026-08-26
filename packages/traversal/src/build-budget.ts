import { resolveTraversalGraphBuilderProfileV2 } from "./profile-registry.js";
import type { TraversalCapabilityEnvelopeV1 } from "./types.js";

const MICROMETERS_PER_METER = 1_000_000;

export interface HeightfieldTileEstimateInputV1 {
  readonly widthMeters: number;
  readonly depthMeters: number;
  readonly tileSizeCells: number;
  readonly voxelCellSizeMeters: number;
}

export interface HeightfieldTileBudgetInputV1
  extends Pick<
    HeightfieldTileEstimateInputV1,
    "tileSizeCells" | "voxelCellSizeMeters"
  > {
  readonly minimumMetersXZ: readonly [number, number];
  readonly maximumMetersXZ: readonly [number, number];
  readonly maximumTiles: number;
}

export interface HeightfieldTileEstimateV1 {
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly estimatedTiles: number;
}

export interface RouteBuildWindowTileEstimateInputV1 {
  readonly pointsMetersXZ: readonly (readonly [number, number])[];
  readonly widthMeters: number;
  readonly terrainCellSizeMetersXZ: readonly [number, number];
  readonly tileSizeCells: number;
  readonly voxelCellSizeMeters: number;
  readonly maximumTiles: number;
}

export interface RouteBuildWindowTileEstimateV1
  extends HeightfieldTileEstimateV1 {
  readonly minimumMetersXZ: readonly [number, number];
  readonly maximumMetersXZ: readonly [number, number];
  readonly maximumTiles: number;
}

export interface TraversalSurfaceCountBudgetInputV1 {
  readonly traversalSurfaceCount: number;
  readonly capabilityEnvelope: TraversalCapabilityEnvelopeV1;
}

export class TraversalSurfaceCountBudgetExceededErrorV1 extends Error {
  readonly code = "ROUTE_GRAPH_BUDGET_EXCEEDED" as const;
  readonly traversalSurfaceCount: number;
  readonly maximumTraversalSurfaceCount: number;

  constructor(input: {
    readonly traversalSurfaceCount: number;
    readonly maximumTraversalSurfaceCount: number;
  }) {
    super(
      `ROUTE_GRAPH_BUDGET_EXCEEDED: traversalSurfaceCount ${input.traversalSurfaceCount} exceeds maximumTraversalSurfaceCount ${input.maximumTraversalSurfaceCount}.`,
    );
    this.name = "TraversalSurfaceCountBudgetExceededErrorV1";
    this.traversalSurfaceCount = input.traversalSurfaceCount;
    this.maximumTraversalSurfaceCount = input.maximumTraversalSurfaceCount;
  }
}

export class TraversalGraphBuildBudgetExceededErrorV1 extends Error {
  readonly code = "ROUTE_GRAPH_BUDGET_EXCEEDED" as const;
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly estimatedTiles: number;
  readonly maximumTiles: number;
  readonly minimumMetersXZ: readonly [number, number];
  readonly maximumMetersXZ: readonly [number, number];

  constructor(input: {
    readonly estimate: HeightfieldTileEstimateV1;
    readonly maximumTiles: number;
    readonly minimumMetersXZ: readonly [number, number];
    readonly maximumMetersXZ: readonly [number, number];
  }) {
    super(
      `ROUTE_GRAPH_BUDGET_EXCEEDED: estimated ${input.estimate.estimatedTiles} tiles exceeds maximumTiles ${input.maximumTiles}.`,
    );
    this.name = "TraversalGraphBuildBudgetExceededErrorV1";
    this.tilesX = input.estimate.tilesX;
    this.tilesZ = input.estimate.tilesZ;
    this.estimatedTiles = input.estimate.estimatedTiles;
    this.maximumTiles = input.maximumTiles;
    this.minimumMetersXZ = Object.freeze([...input.minimumMetersXZ]) as readonly [
      number,
      number,
    ];
    this.maximumMetersXZ = Object.freeze([...input.maximumMetersXZ]) as readonly [
      number,
      number,
    ];
  }
}

function failBudget(message: string): never {
  throw new Error(`TRAVERSAL_GRAPH_BUILD_BUDGET_INVALID: ${message}`);
}

function requireExactSurfaceCountBudgetInput(
  input: unknown,
): {
  readonly traversalSurfaceCount: number;
  readonly maximumTraversalSurfaceCount: number;
} {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    failBudget("surface count budget input must be a plain object.");
  }
  const record = input as Record<string, unknown>;
  const fields = Object.keys(record);
  if (
    fields.length !== 2 ||
    !Object.hasOwn(record, "traversalSurfaceCount") ||
    !Object.hasOwn(record, "capabilityEnvelope")
  ) {
    failBudget("surface count budget input fields must be closed.");
  }
  const traversalSurfaceCount = record.traversalSurfaceCount;
  if (
    typeof traversalSurfaceCount !== "number" ||
    !Number.isSafeInteger(traversalSurfaceCount) ||
    !(traversalSurfaceCount > 0)
  ) {
    failBudget("traversalSurfaceCount must be a positive safe integer.");
  }
  const capabilityEnvelope = record.capabilityEnvelope;
  if (
    capabilityEnvelope === null ||
    typeof capabilityEnvelope !== "object" ||
    Array.isArray(capabilityEnvelope) ||
    !Object.isFrozen(capabilityEnvelope)
  ) {
    failBudget("capabilityEnvelope must be a frozen object.");
  }
  const envelope = capabilityEnvelope as TraversalCapabilityEnvelopeV1;
  let resolvedProfile;
  try {
    resolvedProfile = resolveTraversalGraphBuilderProfileV2(
      envelope.graphBuilderProfileRef,
    );
  } catch (cause) {
    failBudget(
      `capabilityEnvelope Graph Builder Profile must resolve: ${
        cause instanceof Error ? cause.message : "unknown resolution failure"
      }`,
    );
  }
  if (
    envelope.graphBuilderResolvedVersion !== resolvedProfile.resolvedVersion ||
    envelope.graphBuilderProfileHash !== resolvedProfile.contentHash ||
    envelope.maximumTraversalSurfaceCount !==
      resolvedProfile.profile.maximumTraversalSurfaceCount ||
    envelope.minimumEquivalentPlaneNormalDotRatio !==
      resolvedProfile.profile.minimumEquivalentPlaneNormalDotRatio ||
    envelope.maximumTraversalSurfaceTrianglePairTestCount !==
      resolvedProfile.profile.maximumTraversalSurfaceTrianglePairTestCount
  ) {
    failBudget("capabilityEnvelope Graph Builder Profile identity is invalid.");
  }
  return {
    traversalSurfaceCount,
    maximumTraversalSurfaceCount:
      resolvedProfile.profile.maximumTraversalSurfaceCount,
  };
}

export function assertTraversalSurfaceCountBudgetV1(
  input: TraversalSurfaceCountBudgetInputV1,
): void {
  const budget = requireExactSurfaceCountBudgetInput(input);
  if (budget.traversalSurfaceCount > budget.maximumTraversalSurfaceCount) {
    throw new TraversalSurfaceCountBudgetExceededErrorV1(budget);
  }
}

export function quantizeTraversalMetersToMicrometersV1(
  valueMeters: number,
): number {
  if (!Number.isFinite(valueMeters)) {
    failBudget("meter value must be finite.");
  }
  const micrometers = Math.round(valueMeters * MICROMETERS_PER_METER);
  if (!Number.isSafeInteger(micrometers)) {
    failBudget("meter value exceeds deterministic micrometer range.");
  }
  return micrometers;
}

function requirePositiveMeters(value: number, field: string): number {
  if (!Number.isFinite(value) || !(value > 0)) {
    failBudget(`'${field}' must be finite and > 0.`);
  }
  const micrometers = quantizeTraversalMetersToMicrometersV1(value);
  if (!(micrometers > 0)) {
    failBudget(`'${field}' must be at least one micrometer.`);
  }
  return micrometers;
}

function requireBoundsTuple(
  value: unknown,
  field: string,
): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    failBudget(`'${field}' must be a finite 2-tuple.`);
  }
  quantizeTraversalMetersToMicrometersV1(value[0]);
  quantizeTraversalMetersToMicrometersV1(value[1]);
  return value as unknown as readonly [number, number];
}

export function estimateHeightfieldTileCountV1(
  input: HeightfieldTileEstimateInputV1,
): HeightfieldTileEstimateV1 {
  const widthMicrometers = requirePositiveMeters(input.widthMeters, "widthMeters");
  const depthMicrometers = requirePositiveMeters(input.depthMeters, "depthMeters");
  const voxelCellSizeMicrometers = requirePositiveMeters(
    input.voxelCellSizeMeters,
    "voxelCellSizeMeters",
  );
  if (!Number.isSafeInteger(input.tileSizeCells) || !(input.tileSizeCells > 0)) {
    failBudget("'tileSizeCells' must be a positive safe integer.");
  }
  const tileSizeMicrometers = input.tileSizeCells * voxelCellSizeMicrometers;
  if (!Number.isSafeInteger(tileSizeMicrometers)) {
    failBudget("tile span exceeds deterministic micrometer range.");
  }

  const tilesX = Math.ceil(widthMicrometers / tileSizeMicrometers);
  const tilesZ = Math.ceil(depthMicrometers / tileSizeMicrometers);
  const estimatedTiles = tilesX * tilesZ;
  if (!Number.isSafeInteger(estimatedTiles)) {
    failBudget("estimated tile count exceeds safe integer range.");
  }
  return { tilesX, tilesZ, estimatedTiles };
}

export function assertTraversalGraphBuildBudgetV1(
  input: HeightfieldTileBudgetInputV1,
): HeightfieldTileEstimateV1 {
  if (!Number.isSafeInteger(input.maximumTiles) || !(input.maximumTiles > 0)) {
    failBudget("'maximumTiles' must be a positive safe integer.");
  }
  const minimumMetersXZ = requireBoundsTuple(
    input.minimumMetersXZ,
    "minimumMetersXZ",
  );
  const maximumMetersXZ = requireBoundsTuple(
    input.maximumMetersXZ,
    "maximumMetersXZ",
  );
  const minimumXMicrometers = quantizeTraversalMetersToMicrometersV1(
    minimumMetersXZ[0],
  );
  const minimumZMicrometers = quantizeTraversalMetersToMicrometersV1(
    minimumMetersXZ[1],
  );
  const maximumXMicrometers = quantizeTraversalMetersToMicrometersV1(
    maximumMetersXZ[0],
  );
  const maximumZMicrometers = quantizeTraversalMetersToMicrometersV1(
    maximumMetersXZ[1],
  );
  const widthMicrometers = maximumXMicrometers - minimumXMicrometers;
  const depthMicrometers = maximumZMicrometers - minimumZMicrometers;
  if (!(widthMicrometers > 0) || !(depthMicrometers > 0)) {
    failBudget(
      "minimumMetersXZ and maximumMetersXZ must define positive X and Z extents after micrometer normalization.",
    );
  }
  const estimate = estimateHeightfieldTileCountV1({
    widthMeters: widthMicrometers / MICROMETERS_PER_METER,
    depthMeters: depthMicrometers / MICROMETERS_PER_METER,
    tileSizeCells: input.tileSizeCells,
    voxelCellSizeMeters: input.voxelCellSizeMeters,
  });
  if (estimate.estimatedTiles > input.maximumTiles) {
    throw new TraversalGraphBuildBudgetExceededErrorV1({
      estimate,
      maximumTiles: input.maximumTiles,
      minimumMetersXZ,
      maximumMetersXZ,
    });
  }
  return estimate;
}

function requireRoutePointsMicrometers(
  pointsMetersXZ: unknown,
): readonly (readonly [number, number])[] {
  if (!Array.isArray(pointsMetersXZ) || pointsMetersXZ.length < 2) {
    failBudget("'pointsMetersXZ' must contain at least two finite 2-tuples.");
  }
  const pointsMicrometers = pointsMetersXZ.map((point, index) => {
    if (!Array.isArray(point) || point.length !== 2) {
      failBudget(`'pointsMetersXZ[${index}]' must be a finite 2-tuple.`);
    }
    return [
      quantizeTraversalMetersToMicrometersV1(point[0]),
      quantizeTraversalMetersToMicrometersV1(point[1]),
    ] as const;
  });
  const hasNonZeroSegment = pointsMicrometers.slice(1).some((point, index) => {
    const previous = pointsMicrometers[index]!;
    return point[0] !== previous[0] || point[1] !== previous[1];
  });
  if (!hasNonZeroSegment) {
    failBudget("'pointsMetersXZ' must contain a non-zero segment after micrometer normalization.");
  }
  return pointsMicrometers;
}

function safeMicrometerSum(left: number, right: number, field: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    failBudget(`'${field}' exceeds deterministic micrometer range.`);
  }
  return result;
}

function metersFromMicrometers(value: number): number {
  const meters = value / MICROMETERS_PER_METER;
  return Object.is(meters, -0) ? 0 : meters;
}

export function estimateRouteBuildWindowTileCountV1(
  input: RouteBuildWindowTileEstimateInputV1,
): RouteBuildWindowTileEstimateV1 {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    failBudget("route build-window input must be an object.");
  }
  const pointsMicrometers = requireRoutePointsMicrometers(input.pointsMetersXZ);
  const widthMicrometers = requirePositiveMeters(input.widthMeters, "widthMeters");
  if (
    !Array.isArray(input.terrainCellSizeMetersXZ) ||
    input.terrainCellSizeMetersXZ.length !== 2
  ) {
    failBudget("'terrainCellSizeMetersXZ' must be a positive finite 2-tuple.");
  }
  const terrainCellXMicrometers = requirePositiveMeters(
    input.terrainCellSizeMetersXZ[0],
    "terrainCellSizeMetersXZ[0]",
  );
  const terrainCellZMicrometers = requirePositiveMeters(
    input.terrainCellSizeMetersXZ[1],
    "terrainCellSizeMetersXZ[1]",
  );
  const halfWidthMicrometers = Math.ceil(widthMicrometers / 2);
  const guardXMicrometers = safeMicrometerSum(
    halfWidthMicrometers,
    terrainCellXMicrometers,
    "route build-window X guard",
  );
  const guardZMicrometers = safeMicrometerSum(
    halfWidthMicrometers,
    terrainCellZMicrometers,
    "route build-window Z guard",
  );
  const xMicrometers = pointsMicrometers.map((point) => point[0]);
  const zMicrometers = pointsMicrometers.map((point) => point[1]);
  const minimumXMicrometers = safeMicrometerSum(
    Math.min(...xMicrometers),
    -guardXMicrometers,
    "minimumMetersXZ[0]",
  );
  const minimumZMicrometers = safeMicrometerSum(
    Math.min(...zMicrometers),
    -guardZMicrometers,
    "minimumMetersXZ[1]",
  );
  const maximumXMicrometers = safeMicrometerSum(
    Math.max(...xMicrometers),
    guardXMicrometers,
    "maximumMetersXZ[0]",
  );
  const maximumZMicrometers = safeMicrometerSum(
    Math.max(...zMicrometers),
    guardZMicrometers,
    "maximumMetersXZ[1]",
  );
  const minimumMetersXZ = [
    metersFromMicrometers(minimumXMicrometers),
    metersFromMicrometers(minimumZMicrometers),
  ] as const;
  const maximumMetersXZ = [
    metersFromMicrometers(maximumXMicrometers),
    metersFromMicrometers(maximumZMicrometers),
  ] as const;
  const estimate = assertTraversalGraphBuildBudgetV1({
    minimumMetersXZ,
    maximumMetersXZ,
    tileSizeCells: input.tileSizeCells,
    voxelCellSizeMeters: input.voxelCellSizeMeters,
    maximumTiles: input.maximumTiles,
  });
  return {
    minimumMetersXZ,
    maximumMetersXZ,
    ...estimate,
    maximumTiles: input.maximumTiles,
  };
}
