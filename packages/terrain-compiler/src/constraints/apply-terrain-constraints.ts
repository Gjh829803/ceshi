import type { Vec2 } from "@whitebox-world/authoring";
import { sampleTriangleHeightfieldSurface } from "@whitebox-world/terrain-surface";

import type {
  TerrainConstraintV0,
  TerrainIntentDiagnosticV0,
} from "./terrain-constraint-types";

const CONSTRAINT_PRIORITY: Readonly<Record<TerrainConstraintV0["kind"], number>> = {
  "water-basin": 0,
  "flatten-region": 1,
  "flatten-footprint": 2,
  "route-slope": 3,
};
const UNLOCKED_PRIORITY = 255;
const GEOMETRY_EPSILON_METERS = 1e-9;
const HEIGHT_RANGE_EPSILON_METERS = 1e-5;

export interface TerrainConstraintDeltaV0 {
  readonly constraintId: string;
  readonly changedSampleCount: number;
  readonly maximumAbsoluteDeltaMeters: number;
}

export interface ApplyTerrainConstraintsResultV0 {
  readonly heightSamplesMeters: Float32Array;
  readonly protectedSampleMask: Uint8Array;
  readonly deltas: readonly TerrainConstraintDeltaV0[];
  readonly diagnostics: readonly TerrainIntentDiagnosticV0[];
}

interface GridGeometryV0 {
  readonly columns: number;
  readonly rows: number;
  readonly minimumXMeters: number;
  readonly minimumZMeters: number;
  readonly stepXMeters: number;
  readonly stepZMeters: number;
}

interface RouteHeightEnvelopeV0 {
  readonly nearestDistanceMeters: number;
  readonly nearestProjectedHeightMeters: number;
  readonly minimumHeightMeters: number;
  readonly maximumHeightMeters: number;
}

function requireFinite(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be finite.`);
  }
}

function requirePositive(value: number, fieldName: string): void {
  requireFinite(value, fieldName);
  if (!(value > 0)) {
    throw new Error(`${fieldName} must be positive.`);
  }
}

function requireNonNegative(value: number, fieldName: string): void {
  requireFinite(value, fieldName);
  if (value < 0) {
    throw new Error(`${fieldName} must be non-negative.`);
  }
}

function requireVec2(value: Vec2, fieldName: string): void {
  requireFinite(value[0], `${fieldName}[0]`);
  requireFinite(value[1], `${fieldName}[1]`);
}

function requirePolyline(points: readonly Vec2[], fieldName: string): void {
  if (points.length < 2) {
    throw new Error(`${fieldName} must contain at least two points.`);
  }
  points.forEach((point, index) => requireVec2(point, `${fieldName}[${index}]`));
  for (let index = 0; index < points.length - 1; index += 1) {
    if (
      Math.hypot(
        points[index + 1]![0] - points[index]![0],
        points[index + 1]![1] - points[index]![1],
      ) <= GEOMETRY_EPSILON_METERS
    ) {
      throw new Error(`${fieldName} must not contain zero-length segments.`);
    }
  }
}

function requirePolygon(points: readonly Vec2[], fieldName: string): void {
  if (points.length < 3) {
    throw new Error(`${fieldName} must contain at least three points.`);
  }
  points.forEach((point, index) => requireVec2(point, `${fieldName}[${index}]`));
}

function validateConstraint(constraint: TerrainConstraintV0): void {
  if (constraint.id.length === 0) {
    throw new Error("Terrain constraint id must be non-empty.");
  }
  switch (constraint.kind) {
    case "water-basin":
      requireFinite(constraint.waterLevelMeters, `${constraint.id}.waterLevelMeters`);
      requirePositive(constraint.depthMeters, `${constraint.id}.depthMeters`);
      requireNonNegative(constraint.shoreWidthMeters, `${constraint.id}.shoreWidthMeters`);
      switch (constraint.boundary.kind) {
        case "circle":
          requireVec2(constraint.boundary.centerMetersXZ, `${constraint.id}.centerMetersXZ`);
          requirePositive(constraint.boundary.radiusMeters, `${constraint.id}.radiusMeters`);
          break;
        case "ellipse":
          requireVec2(constraint.boundary.centerMetersXZ, `${constraint.id}.centerMetersXZ`);
          requirePositive(constraint.boundary.radiusMetersXZ[0], `${constraint.id}.radiusMetersXZ[0]`);
          requirePositive(constraint.boundary.radiusMetersXZ[1], `${constraint.id}.radiusMetersXZ[1]`);
          break;
        case "polygon":
          requirePolygon(constraint.boundary.pointsMetersXZ, `${constraint.id}.pointsMetersXZ`);
          break;
      }
      break;
    case "flatten-region":
      requirePolygon(constraint.pointsMetersXZ, `${constraint.id}.pointsMetersXZ`);
      requireFinite(constraint.targetHeightMeters, `${constraint.id}.targetHeightMeters`);
      requireNonNegative(constraint.falloffWidthMeters, `${constraint.id}.falloffWidthMeters`);
      break;
    case "flatten-footprint":
      requireVec2(constraint.centerMetersXZ, `${constraint.id}.centerMetersXZ`);
      requirePositive(constraint.sizeMetersXZ[0], `${constraint.id}.sizeMetersXZ[0]`);
      requirePositive(constraint.sizeMetersXZ[1], `${constraint.id}.sizeMetersXZ[1]`);
      requireNonNegative(constraint.falloffWidthMeters, `${constraint.id}.falloffWidthMeters`);
      break;
    case "route-slope":
      requirePolyline(constraint.pointsMetersXZ, `${constraint.id}.pointsMetersXZ`);
      requirePositive(constraint.widthMeters, `${constraint.id}.widthMeters`);
      requireNonNegative(constraint.maximumSlopeDegrees, `${constraint.id}.maximumSlopeDegrees`);
      if (constraint.maximumSlopeDegrees >= 90) {
        throw new Error(`${constraint.id}.maximumSlopeDegrees must be less than 90.`);
      }
      break;
  }
}

function validateInput(input: {
  readonly centerMetersXZ: Vec2;
  readonly sizeMetersXZ: Vec2;
  readonly heightRangeMeters: readonly [minimum: number, maximum: number];
  readonly resolutionVerticesXZ: readonly [number, number];
  readonly heightSamplesMeters: Float32Array;
  readonly constraints: readonly TerrainConstraintV0[];
}): GridGeometryV0 {
  requireVec2(input.centerMetersXZ, "centerMetersXZ");
  requirePositive(input.sizeMetersXZ[0], "sizeMetersXZ[0]");
  requirePositive(input.sizeMetersXZ[1], "sizeMetersXZ[1]");
  requireFinite(input.heightRangeMeters[0], "heightRangeMeters[0]");
  requireFinite(input.heightRangeMeters[1], "heightRangeMeters[1]");
  if (!(input.heightRangeMeters[0] < input.heightRangeMeters[1])) {
    throw new Error("heightRangeMeters minimum must be less than maximum.");
  }
  const [columns, rows] = input.resolutionVerticesXZ;
  if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) || columns < 2 || rows < 2) {
    throw new Error("resolutionVerticesXZ must contain safe integers of at least 2.");
  }
  const expectedSampleCount = columns * rows;
  if (!Number.isSafeInteger(expectedSampleCount)) {
    throw new Error("Terrain sample count exceeds the safe integer range.");
  }
  if (input.heightSamplesMeters.length !== expectedSampleCount) {
    throw new Error(
      `Terrain sample count must be ${expectedSampleCount}; received ${input.heightSamplesMeters.length}.`,
    );
  }
  if (input.heightSamplesMeters.some((height) => !Number.isFinite(height))) {
    throw new Error("Terrain height samples must be finite.");
  }
  input.constraints.forEach(validateConstraint);
  return {
    columns,
    rows,
    minimumXMeters: input.centerMetersXZ[0] - input.sizeMetersXZ[0] / 2,
    minimumZMeters: input.centerMetersXZ[1] - input.sizeMetersXZ[1] / 2,
    stepXMeters: input.sizeMetersXZ[0] / (columns - 1),
    stepZMeters: input.sizeMetersXZ[1] / (rows - 1),
  };
}

function pointToSegmentProjection(
  point: Vec2,
  start: Vec2,
  end: Vec2,
): Readonly<{ distanceMeters: number; ratio: number }> {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaZ) /
        lengthSquared,
    ),
  );
  return {
    distanceMeters: Math.hypot(
      point[0] - (start[0] + deltaX * ratio),
      point[1] - (start[1] + deltaZ * ratio),
    ),
    ratio,
  };
}

function routeHeightEnvelope(
  point: Vec2,
  points: readonly Vec2[],
  routeHeights: readonly number[],
  maximumSlopeDegrees: number,
): RouteHeightEnvelopeV0 {
  const maximumRisePerMeter = Math.tan((maximumSlopeDegrees * Math.PI) / 180);
  let nearestDistanceMeters = Number.POSITIVE_INFINITY;
  let nearestProjectedHeightMeters = Number.NaN;
  let minimumHeightMeters = Number.NEGATIVE_INFINITY;
  let maximumHeightMeters = Number.POSITIVE_INFINITY;
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const projection = pointToSegmentProjection(
      point,
      points[segmentIndex]!,
      points[segmentIndex + 1]!,
    );
    const projectedHeightMeters =
      routeHeights[segmentIndex]! +
      (routeHeights[segmentIndex + 1]! - routeHeights[segmentIndex]!) * projection.ratio;
    const allowedDeltaMeters = maximumRisePerMeter * projection.distanceMeters;
    if (projection.distanceMeters < nearestDistanceMeters - GEOMETRY_EPSILON_METERS) {
      nearestDistanceMeters = projection.distanceMeters;
      nearestProjectedHeightMeters = projectedHeightMeters;
    }
    minimumHeightMeters = Math.max(
      minimumHeightMeters,
      projectedHeightMeters - allowedDeltaMeters,
    );
    maximumHeightMeters = Math.min(
      maximumHeightMeters,
      projectedHeightMeters + allowedDeltaMeters,
    );
  }
  return {
    nearestDistanceMeters,
    nearestProjectedHeightMeters,
    minimumHeightMeters,
    maximumHeightMeters,
  };
}

function routeRequiresBendBlend(points: readonly Vec2[]): boolean {
  for (let segmentIndex = 1; segmentIndex < points.length - 1; segmentIndex += 1) {
    const previousStart = points[segmentIndex - 1]!;
    const joint = points[segmentIndex]!;
    const nextEnd = points[segmentIndex + 1]!;
    const previousLength = Math.hypot(
      joint[0] - previousStart[0],
      joint[1] - previousStart[1],
    );
    const nextLength = Math.hypot(
      nextEnd[0] - joint[0],
      nextEnd[1] - joint[1],
    );
    const directionDot =
      ((joint[0] - previousStart[0]) * (nextEnd[0] - joint[0]) +
        (joint[1] - previousStart[1]) * (nextEnd[1] - joint[1])) /
      (previousLength * nextLength);
    if (directionDot < 1 - 1e-6) return true;
  }
  return false;
}

function pointOnSegment(point: Vec2, start: Vec2, end: Vec2): boolean {
  return pointToSegmentProjection(point, start, end).distanceMeters <= GEOMETRY_EPSILON_METERS;
}

function pointInPolygon(point: Vec2, points: readonly Vec2[]): boolean {
  let inside = false;
  for (
    let currentIndex = 0, previousIndex = points.length - 1;
    currentIndex < points.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = points[currentIndex]!;
    const previous = points[previousIndex]!;
    if (pointOnSegment(point, previous, current)) return true;
    const crosses =
      (current[1] > point[1]) !== (previous[1] > point[1]) &&
      point[0] <
        ((previous[0] - current[0]) * (point[1] - current[1])) /
          (previous[1] - current[1]) +
          current[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonInteriorDistanceMeters(point: Vec2, points: readonly Vec2[]): number | undefined {
  if (!pointInPolygon(point, points)) return undefined;
  let distanceMeters = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    distanceMeters = Math.min(
      distanceMeters,
      pointToSegmentProjection(point, points[index]!, points[(index + 1) % points.length]!)
        .distanceMeters,
    );
  }
  return distanceMeters;
}

function waterInteriorDistanceMeters(
  point: Vec2,
  constraint: Extract<TerrainConstraintV0, { kind: "water-basin" }>,
): number | undefined {
  const boundary = constraint.boundary;
  switch (boundary.kind) {
    case "circle": {
      const distance = Math.hypot(
        point[0] - boundary.centerMetersXZ[0],
        point[1] - boundary.centerMetersXZ[1],
      );
      return distance <= boundary.radiusMeters + GEOMETRY_EPSILON_METERS
        ? Math.max(0, boundary.radiusMeters - distance)
        : undefined;
    }
    case "ellipse": {
      const deltaX = point[0] - boundary.centerMetersXZ[0];
      const deltaZ = point[1] - boundary.centerMetersXZ[1];
      const normalizedRadius = Math.hypot(
        deltaX / boundary.radiusMetersXZ[0],
        deltaZ / boundary.radiusMetersXZ[1],
      );
      if (normalizedRadius > 1 + GEOMETRY_EPSILON_METERS) return undefined;
      if (normalizedRadius <= GEOMETRY_EPSILON_METERS) {
        return Math.min(...boundary.radiusMetersXZ);
      }
      return Math.max(
        0,
        ((1 - normalizedRadius) / normalizedRadius) * Math.hypot(deltaX, deltaZ),
      );
    }
    case "polygon":
      return polygonInteriorDistanceMeters(point, boundary.pointsMetersXZ);
  }
}

function rectangleInteriorDistanceMeters(
  point: Vec2,
  center: Vec2,
  size: Vec2,
): number | undefined {
  const remainingX = size[0] / 2 - Math.abs(point[0] - center[0]);
  const remainingZ = size[1] / 2 - Math.abs(point[1] - center[1]);
  return remainingX >= -GEOMETRY_EPSILON_METERS && remainingZ >= -GEOMETRY_EPSILON_METERS
    ? Math.max(0, Math.min(remainingX, remainingZ))
    : undefined;
}

function falloffWeight(interiorDistanceMeters: number, falloffWidthMeters: number): number {
  return falloffWidthMeters === 0
    ? 1
    : Math.max(0, Math.min(1, interiorDistanceMeters / falloffWidthMeters));
}

function gridPoint(grid: GridGeometryV0, column: number, row: number): Vec2 {
  return [
    grid.minimumXMeters + column * grid.stepXMeters,
    grid.minimumZMeters + row * grid.stepZMeters,
  ];
}

interface RectangleXZV0 {
  readonly minimumXMeters: number;
  readonly minimumZMeters: number;
  readonly maximumXMeters: number;
  readonly maximumZMeters: number;
}

function pointInsideRectangle(point: Vec2, rectangle: RectangleXZV0): boolean {
  return point[0] >= rectangle.minimumXMeters - GEOMETRY_EPSILON_METERS &&
    point[0] <= rectangle.maximumXMeters + GEOMETRY_EPSILON_METERS &&
    point[1] >= rectangle.minimumZMeters - GEOMETRY_EPSILON_METERS &&
    point[1] <= rectangle.maximumZMeters + GEOMETRY_EPSILON_METERS;
}

function orientation(left: Vec2, middle: Vec2, right: Vec2): number {
  return (middle[1] - left[1]) * (right[0] - middle[0]) -
    (middle[0] - left[0]) * (right[1] - middle[1]);
}

function segmentsIntersect(leftStart: Vec2, leftEnd: Vec2, rightStart: Vec2, rightEnd: Vec2): boolean {
  const leftStartOrientation = orientation(leftStart, leftEnd, rightStart);
  const leftEndOrientation = orientation(leftStart, leftEnd, rightEnd);
  const rightStartOrientation = orientation(rightStart, rightEnd, leftStart);
  const rightEndOrientation = orientation(rightStart, rightEnd, leftEnd);
  if (
    Math.abs(leftStartOrientation) <= GEOMETRY_EPSILON_METERS &&
    pointOnSegment(rightStart, leftStart, leftEnd)
  ) return true;
  if (
    Math.abs(leftEndOrientation) <= GEOMETRY_EPSILON_METERS &&
    pointOnSegment(rightEnd, leftStart, leftEnd)
  ) return true;
  if (
    Math.abs(rightStartOrientation) <= GEOMETRY_EPSILON_METERS &&
    pointOnSegment(leftStart, rightStart, rightEnd)
  ) return true;
  if (
    Math.abs(rightEndOrientation) <= GEOMETRY_EPSILON_METERS &&
    pointOnSegment(leftEnd, rightStart, rightEnd)
  ) return true;
  return (leftStartOrientation > 0) !== (leftEndOrientation > 0) &&
    (rightStartOrientation > 0) !== (rightEndOrientation > 0);
}

function rectangleCorners(rectangle: RectangleXZV0): readonly Vec2[] {
  return [
    [rectangle.minimumXMeters, rectangle.minimumZMeters],
    [rectangle.maximumXMeters, rectangle.minimumZMeters],
    [rectangle.maximumXMeters, rectangle.maximumZMeters],
    [rectangle.minimumXMeters, rectangle.maximumZMeters],
  ];
}

function polygonIntersectsRectangle(points: readonly Vec2[], rectangle: RectangleXZV0): boolean {
  if (points.some((point) => pointInsideRectangle(point, rectangle))) return true;
  const corners = rectangleCorners(rectangle);
  if (corners.some((corner) => pointInPolygon(corner, points))) return true;
  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const start = points[pointIndex]!;
    const end = points[(pointIndex + 1) % points.length]!;
    for (let cornerIndex = 0; cornerIndex < corners.length; cornerIndex += 1) {
      if (segmentsIntersect(
        start,
        end,
        corners[cornerIndex]!,
        corners[(cornerIndex + 1) % corners.length]!,
      )) return true;
    }
  }
  return false;
}

function waterBoundaryIntersectsRectangle(
  constraint: Extract<TerrainConstraintV0, { kind: "water-basin" }>,
  rectangle: RectangleXZV0,
): boolean {
  const boundary = constraint.boundary;
  if (boundary.kind === "polygon") {
    return polygonIntersectsRectangle(boundary.pointsMetersXZ, rectangle);
  }
  if (boundary.kind === "circle") {
    const nearestX = Math.max(
      rectangle.minimumXMeters,
      Math.min(rectangle.maximumXMeters, boundary.centerMetersXZ[0]),
    );
    const nearestZ = Math.max(
      rectangle.minimumZMeters,
      Math.min(rectangle.maximumZMeters, boundary.centerMetersXZ[1]),
    );
    return Math.hypot(
      nearestX - boundary.centerMetersXZ[0],
      nearestZ - boundary.centerMetersXZ[1],
    ) <= boundary.radiusMeters + GEOMETRY_EPSILON_METERS;
  }
  return rectangle.maximumXMeters >=
      boundary.centerMetersXZ[0] - boundary.radiusMetersXZ[0] - GEOMETRY_EPSILON_METERS &&
    rectangle.minimumXMeters <=
      boundary.centerMetersXZ[0] + boundary.radiusMetersXZ[0] + GEOMETRY_EPSILON_METERS &&
    rectangle.maximumZMeters >=
      boundary.centerMetersXZ[1] - boundary.radiusMetersXZ[1] - GEOMETRY_EPSILON_METERS &&
    rectangle.minimumZMeters <=
      boundary.centerMetersXZ[1] + boundary.radiusMetersXZ[1] + GEOMETRY_EPSILON_METERS;
}

function conservativeIntersectingCellVertexIndices(
  grid: GridGeometryV0,
  intersects: (rectangle: RectangleXZV0) => boolean,
): ReadonlySet<number> {
  const indices = new Set<number>();
  for (let row = 0; row < grid.rows - 1; row += 1) {
    for (let column = 0; column < grid.columns - 1; column += 1) {
      const minimum = gridPoint(grid, column, row);
      const maximum = gridPoint(grid, column + 1, row + 1);
      if (!intersects({
        minimumXMeters: minimum[0],
        minimumZMeters: minimum[1],
        maximumXMeters: maximum[0],
        maximumZMeters: maximum[1],
      })) continue;
      indices.add(row * grid.columns + column);
      indices.add(row * grid.columns + column + 1);
      indices.add((row + 1) * grid.columns + column);
      indices.add((row + 1) * grid.columns + column + 1);
    }
  }
  return indices;
}

function pushProtectedRegionOutsideTerrainDiagnostic(
  diagnostics: TerrainIntentDiagnosticV0[],
  constraint: Extract<TerrainConstraintV0, { kind: "water-basin" | "flatten-region" }>,
): void {
  diagnostics.push({
    severity: "blocking",
    code: "TERRAIN_INTENT_PROTECTED_REGION_OUTSIDE_TERRAIN",
    instancePath: `/constraints/${constraint.id}`,
    message: `Protected terrain constraint '${constraint.id}' does not intersect the Terrain grid.`,
  });
}

function recordDelta(
  constraintId: string,
  before: Float32Array,
  after: Float32Array,
): TerrainConstraintDeltaV0 {
  let changedSampleCount = 0;
  let maximumAbsoluteDeltaMeters = 0;
  for (let index = 0; index < after.length; index += 1) {
    if (after[index] !== before[index]) {
      changedSampleCount += 1;
      maximumAbsoluteDeltaMeters = Math.max(
        maximumAbsoluteDeltaMeters,
        Math.abs(after[index]! - before[index]!),
      );
    }
  }
  return { constraintId, changedSampleCount, maximumAbsoluteDeltaMeters };
}

function sortConstraints(constraints: readonly TerrainConstraintV0[]): TerrainConstraintV0[] {
  return [...constraints].sort((left, right) => {
    const priorityDelta = CONSTRAINT_PRIORITY[left.kind] - CONSTRAINT_PRIORITY[right.kind];
    return priorityDelta === 0 ? left.id.localeCompare(right.id) : priorityDelta;
  });
}

function sampleRouteVertexHeights(
  input: {
    readonly centerMetersXZ: Vec2;
    readonly sizeMetersXZ: Vec2;
    readonly resolutionVerticesXZ: readonly [number, number];
  },
  values: Float32Array,
  constraint: Extract<TerrainConstraintV0, { kind: "route-slope" }>,
  diagnostics: TerrainIntentDiagnosticV0[],
): number[] | undefined {
  const heights = constraint.pointsMetersXZ.map((point) =>
    sampleTriangleHeightfieldSurface(
      { ...input, heightSamplesMeters: values },
      point,
    )?.heightMeters,
  );
  if (heights.some((height) => height === undefined)) {
    diagnostics.push({
      severity: "blocking",
      code: "TERRAIN_INTENT_ROUTE_OUTSIDE_TERRAIN",
      instancePath: `/constraints/${constraint.id}`,
      message: `Route '${constraint.id}' contains a point outside the Terrain bounds.`,
    });
    return undefined;
  }
  return heights as number[];
}

function clampRouteVertexHeights(
  points: readonly Vec2[],
  sourceHeights: readonly number[],
  maximumSlopeDegrees: number,
): number[] {
  const heights = [...sourceHeights];
  const maximumRisePerMeter = Math.tan((maximumSlopeDegrees * Math.PI) / 180);
  for (let index = 1; index < heights.length; index += 1) {
    const length = Math.hypot(
      points[index]![0] - points[index - 1]![0],
      points[index]![1] - points[index - 1]![1],
    );
    const maximumDelta = maximumRisePerMeter * length;
    heights[index] = Math.max(
      heights[index - 1]! - maximumDelta,
      Math.min(heights[index - 1]! + maximumDelta, heights[index]!),
    );
  }
  for (let index = heights.length - 2; index >= 0; index -= 1) {
    const length = Math.hypot(
      points[index + 1]![0] - points[index]![0],
      points[index + 1]![1] - points[index]![1],
    );
    const maximumDelta = maximumRisePerMeter * length;
    heights[index] = Math.max(
      heights[index + 1]! - maximumDelta,
      Math.min(heights[index + 1]! + maximumDelta, heights[index]!),
    );
  }
  return heights;
}

function validateRouteSlope(
  input: {
    readonly centerMetersXZ: Vec2;
    readonly sizeMetersXZ: Vec2;
    readonly resolutionVerticesXZ: readonly [number, number];
  },
  values: Float32Array,
  grid: GridGeometryV0,
  constraint: Extract<TerrainConstraintV0, { kind: "route-slope" }>,
  diagnostics: TerrainIntentDiagnosticV0[],
): void {
  const spacingMeters = Math.min(grid.stepXMeters, grid.stepZMeters) / 4;
  let measuredMaximumSlopeDegrees = 0;
  let missingSample = false;
  for (let segmentIndex = 0; segmentIndex < constraint.pointsMetersXZ.length - 1; segmentIndex += 1) {
    const start = constraint.pointsMetersXZ[segmentIndex]!;
    const end = constraint.pointsMetersXZ[segmentIndex + 1]!;
    const deltaX = end[0] - start[0];
    const deltaZ = end[1] - start[1];
    const length = Math.hypot(deltaX, deltaZ);
    const sampleSteps = Math.max(1, Math.ceil(length / spacingMeters));
    const perpendicular: Vec2 = [-deltaZ / length, deltaX / length];
    for (let step = 0; step <= sampleSteps; step += 1) {
      const ratio = step / sampleSteps;
      const center: Vec2 = [start[0] + deltaX * ratio, start[1] + deltaZ * ratio];
      for (const lateralOffset of [-constraint.widthMeters / 2, 0, constraint.widthMeters / 2]) {
        const point: Vec2 = [
          center[0] + perpendicular[0] * lateralOffset,
          center[1] + perpendicular[1] * lateralOffset,
        ];
        const sample = sampleTriangleHeightfieldSurface(
          { ...input, heightSamplesMeters: values },
          point,
        );
        if (sample === undefined) {
          missingSample = true;
        } else {
          measuredMaximumSlopeDegrees = Math.max(
            measuredMaximumSlopeDegrees,
            sample.slopeDegrees,
          );
        }
      }
    }
  }
  if (
    missingSample ||
    measuredMaximumSlopeDegrees > constraint.maximumSlopeDegrees + 0.25
  ) {
    diagnostics.push({
      severity: "blocking",
      code: "TERRAIN_INTENT_ROUTE_SLOPE_UNSATISFIED",
      instancePath: `/constraints/${constraint.id}`,
      message: `Route '${constraint.id}' exceeds its declared slope limit after terrain constraints.`,
      details: {
        maximumSlopeDegrees: constraint.maximumSlopeDegrees,
        measuredMaximumSlopeDegrees,
        missingSample,
      },
    });
  }
}

export function applyTerrainConstraintsV0(input: {
  readonly centerMetersXZ: Vec2;
  readonly sizeMetersXZ: Vec2;
  readonly heightRangeMeters: readonly [minimum: number, maximum: number];
  readonly resolutionVerticesXZ: readonly [number, number];
  readonly heightSamplesMeters: Float32Array;
  readonly constraints: readonly TerrainConstraintV0[];
}): ApplyTerrainConstraintsResultV0 {
  const grid = validateInput(input);
  const values = new Float32Array(input.heightSamplesMeters);
  const lockPriorities = new Uint8Array(values.length);
  lockPriorities.fill(UNLOCKED_PRIORITY);
  const diagnostics: TerrainIntentDiagnosticV0[] = [];
  const deltas: TerrainConstraintDeltaV0[] = [];
  const sortedConstraints = sortConstraints(input.constraints);

  for (const constraint of sortedConstraints) {
    const before = new Float32Array(values);
    const priority = CONSTRAINT_PRIORITY[constraint.kind];

    if (constraint.kind === "water-basin") {
      const bedHeightMeters = constraint.waterLevelMeters - constraint.depthMeters;
      let coveredSampleCount = 0;
      for (let row = 0; row < grid.rows; row += 1) {
        for (let column = 0; column < grid.columns; column += 1) {
          const index = row * grid.columns + column;
          const distance = waterInteriorDistanceMeters(gridPoint(grid, column, row), constraint);
          if (distance === undefined) continue;
          coveredSampleCount += 1;
          const weight = falloffWeight(distance, constraint.shoreWidthMeters);
          const target = values[index]! + (bedHeightMeters - values[index]!) * weight;
          values[index] = Math.min(values[index]!, target);
          lockPriorities[index] = Math.min(lockPriorities[index]!, priority);
        }
      }
      if (coveredSampleCount === 0) {
        const fallbackIndices = conservativeIntersectingCellVertexIndices(
          grid,
          (rectangle) => waterBoundaryIntersectsRectangle(constraint, rectangle),
        );
        if (fallbackIndices.size === 0) {
          pushProtectedRegionOutsideTerrainDiagnostic(diagnostics, constraint);
        } else {
          for (const index of fallbackIndices) {
            values[index] = Math.min(values[index]!, bedHeightMeters);
            lockPriorities[index] = Math.min(lockPriorities[index]!, priority);
          }
        }
      }
    } else if (constraint.kind === "flatten-region") {
      let coveredSampleCount = 0;
      for (let row = 0; row < grid.rows; row += 1) {
        for (let column = 0; column < grid.columns; column += 1) {
          const index = row * grid.columns + column;
          if (lockPriorities[index]! < priority) continue;
          const distance = polygonInteriorDistanceMeters(
            gridPoint(grid, column, row),
            constraint.pointsMetersXZ,
          );
          if (distance === undefined) continue;
          coveredSampleCount += 1;
          const weight = falloffWeight(distance, constraint.falloffWidthMeters);
          values[index] = values[index]! +
            (constraint.targetHeightMeters - values[index]!) * weight;
          lockPriorities[index] = Math.min(lockPriorities[index]!, priority);
        }
      }
      if (coveredSampleCount === 0) {
        const fallbackIndices = conservativeIntersectingCellVertexIndices(
          grid,
          (rectangle) => polygonIntersectsRectangle(constraint.pointsMetersXZ, rectangle),
        );
        if (fallbackIndices.size === 0) {
          pushProtectedRegionOutsideTerrainDiagnostic(diagnostics, constraint);
        } else {
          for (const index of fallbackIndices) {
            if (lockPriorities[index]! < priority) continue;
            values[index] = constraint.targetHeightMeters;
            lockPriorities[index] = Math.min(lockPriorities[index]!, priority);
          }
        }
      }
    } else if (constraint.kind === "flatten-footprint") {
      const centerSample = sampleTriangleHeightfieldSurface(
        { ...input, heightSamplesMeters: values },
        constraint.centerMetersXZ,
      );
      if (centerSample === undefined) {
        diagnostics.push({
          severity: "blocking",
          code: "TERRAIN_INTENT_LANDMARK_OUTSIDE_TERRAIN",
          instancePath: `/constraints/${constraint.id}`,
          message: `Landmark support '${constraint.id}' is centered outside the Terrain bounds.`,
        });
      } else {
        const guardedSizeMetersXZ: Vec2 = [
          constraint.sizeMetersXZ[0] + grid.stepXMeters * 2,
          constraint.sizeMetersXZ[1] + grid.stepZMeters * 2,
        ];
        for (let row = 0; row < grid.rows; row += 1) {
          for (let column = 0; column < grid.columns; column += 1) {
            const index = row * grid.columns + column;
            if (lockPriorities[index]! < priority) continue;
            const distance = rectangleInteriorDistanceMeters(
              gridPoint(grid, column, row),
              constraint.centerMetersXZ,
              guardedSizeMetersXZ,
            );
            if (distance === undefined) continue;
            const weight = falloffWeight(distance, constraint.falloffWidthMeters);
            values[index] = values[index]! +
              (centerSample.heightMeters - values[index]!) * weight;
            lockPriorities[index] = Math.min(lockPriorities[index]!, priority);
          }
        }
      }
    } else {
      const sampledHeights = sampleRouteVertexHeights(input, values, constraint, diagnostics);
      if (sampledHeights !== undefined) {
        const routeHeights = clampRouteVertexHeights(
          constraint.pointsMetersXZ,
          sampledHeights,
          constraint.maximumSlopeDegrees,
        );
        const halfWidthMeters = constraint.widthMeters / 2;
        const guardBandMeters = Math.max(grid.stepXMeters, grid.stepZMeters);
        const needsBendBlend = routeRequiresBendBlend(constraint.pointsMetersXZ);
        let hasEmptyHeightEnvelope = false;
        for (let row = 0; row < grid.rows; row += 1) {
          for (let column = 0; column < grid.columns; column += 1) {
            const index = row * grid.columns + column;
            if (lockPriorities[index]! < priority) continue;
            const envelope = routeHeightEnvelope(
              gridPoint(grid, column, row),
              constraint.pointsMetersXZ,
              routeHeights,
              constraint.maximumSlopeDegrees,
            );
            if (envelope.nearestDistanceMeters > halfWidthMeters + guardBandMeters) continue;
            if (
              envelope.minimumHeightMeters >
              envelope.maximumHeightMeters + GEOMETRY_EPSILON_METERS
            ) {
              hasEmptyHeightEnvelope = true;
              continue;
            }
            values[index] = needsBendBlend
              ? (envelope.minimumHeightMeters + envelope.maximumHeightMeters) / 2
              : envelope.nearestProjectedHeightMeters;
            lockPriorities[index] = Math.min(lockPriorities[index]!, priority);
          }
        }
        if (hasEmptyHeightEnvelope) {
          diagnostics.push({
            severity: "blocking",
            code: "TERRAIN_INTENT_ROUTE_SLOPE_UNSATISFIED",
            instancePath: `/constraints/${constraint.id}`,
            message: `Route '${constraint.id}' has incompatible slope envelopes at an overlapping bend.`,
            details: {
              maximumSlopeDegrees: constraint.maximumSlopeDegrees,
              reason: "empty-height-envelope",
            },
          });
        }
      }
    }

    deltas.push(recordDelta(constraint.id, before, values));
  }

  for (const constraint of sortedConstraints) {
    if (constraint.kind === "route-slope") {
      validateRouteSlope(input, values, grid, constraint, diagnostics);
    }
  }

  if (values.some((height) => !Number.isFinite(height))) {
    throw new Error("Terrain constraints produced non-finite height samples.");
  }
  let actualMinimumHeightMeters = Number.POSITIVE_INFINITY;
  let actualMaximumHeightMeters = Number.NEGATIVE_INFINITY;
  for (const height of values) {
    actualMinimumHeightMeters = Math.min(actualMinimumHeightMeters, height);
    actualMaximumHeightMeters = Math.max(actualMaximumHeightMeters, height);
  }
  if (
    actualMinimumHeightMeters < input.heightRangeMeters[0] - HEIGHT_RANGE_EPSILON_METERS ||
    actualMaximumHeightMeters > input.heightRangeMeters[1] + HEIGHT_RANGE_EPSILON_METERS
  ) {
    diagnostics.push({
      severity: "blocking",
      code: "TERRAIN_INTENT_HEIGHT_RANGE_EXCEEDED",
      instancePath: "/heightSamplesMeters",
      message: "Terrain constraints produced height samples outside world.bounds.heightRangeMeters.",
      details: {
        heightRangeMeters: input.heightRangeMeters,
        actualMinimumHeightMeters,
        actualMaximumHeightMeters,
      },
    });
  }
  return {
    heightSamplesMeters: values,
    protectedSampleMask: Uint8Array.from(
      lockPriorities,
      (priority) => priority === UNLOCKED_PRIORITY ? 0 : 1,
    ),
    deltas,
    diagnostics,
  };
}
