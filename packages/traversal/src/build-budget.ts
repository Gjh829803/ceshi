const MICROMETERS_PER_METER = 1_000_000;

export interface HeightfieldTileEstimateInputV1 {
  readonly widthMeters: number;
  readonly depthMeters: number;
  readonly tileSizeCells: number;
  readonly voxelCellSizeMeters: number;
}

export interface HeightfieldTileBudgetInputV1
  extends HeightfieldTileEstimateInputV1 {
  readonly maximumTiles: number;
}

export interface HeightfieldTileEstimateV1 {
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly estimatedTiles: number;
}

function failBudget(message: string): never {
  throw new Error(`TRAVERSAL_GRAPH_BUILD_BUDGET_INVALID: ${message}`);
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
  const estimate = estimateHeightfieldTileCountV1(input);
  if (estimate.estimatedTiles > input.maximumTiles) {
    throw new Error(
      `ROUTE_GRAPH_BUDGET_EXCEEDED: estimated ${estimate.estimatedTiles} tiles exceeds maximumTiles ${input.maximumTiles}.`,
    );
  }
  return estimate;
}
