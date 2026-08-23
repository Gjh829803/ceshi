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

export interface TraversalSurfaceCountBudgetInputV1 {
  readonly traversalSurfaceCount: number;
  readonly maximumTraversalSurfaceCount: number;
}

export class TraversalSurfaceCountBudgetExceededErrorV1 extends Error {
  readonly code = "ROUTE_GRAPH_BUDGET_EXCEEDED" as const;
  readonly traversalSurfaceCount: number;
  readonly maximumTraversalSurfaceCount: number;

  constructor(input: TraversalSurfaceCountBudgetInputV1) {
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
): TraversalSurfaceCountBudgetInputV1 {
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
    !Object.hasOwn(record, "maximumTraversalSurfaceCount")
  ) {
    failBudget("surface count budget input fields must be closed.");
  }
  const traversalSurfaceCount = record.traversalSurfaceCount;
  const maximumTraversalSurfaceCount = record.maximumTraversalSurfaceCount;
  if (
    typeof traversalSurfaceCount !== "number" ||
    !Number.isSafeInteger(traversalSurfaceCount) ||
    !(traversalSurfaceCount > 0) ||
    typeof maximumTraversalSurfaceCount !== "number" ||
    !Number.isSafeInteger(maximumTraversalSurfaceCount) ||
    !(maximumTraversalSurfaceCount > 0)
  ) {
    failBudget("surface count values must be positive safe integers.");
  }
  return {
    traversalSurfaceCount,
    maximumTraversalSurfaceCount,
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
