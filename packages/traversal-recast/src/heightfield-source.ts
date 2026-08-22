import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type {
  ExecutionPlanV5,
  ExecutionStaticColliderV1,
  ExecutionTransformV3,
  ExecutionWaterBoundaryV3,
  ExecutionWaterV3,
} from "@whitebox-world/runtime-contracts";
import { emitTriangleHeightfieldSurfaceV1 } from "@whitebox-world/terrain-surface";
import {
  assertHeightfieldRouteBuildInputV1,
  assertTraversalGraphBuildBudgetV1,
  hashHeightfieldRouteBuildInputV1,
  type BlockedWaterBoundaryV1,
  type BlockedWaterExclusionV1,
  type CanonicalTriangleSoupV1,
  type HeightfieldRouteBuildBudgetEvidenceV1,
  type HeightfieldRouteBuildInputReceiptV1,
  type HeightfieldRouteBuildInputV1,
  type HeightfieldRouteTerrainSourceV1,
  type StaticBlockingColliderV1,
  type TraversalCapabilityEnvelopeV1,
} from "@whitebox-world/traversal";

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];
type MutableVec3 = [number, number, number];
type Triangle = readonly [Vec3, Vec3, Vec3];

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const STADIUM_HALF_CAP_CHORDS = 16;
const CYLINDER_SIDE_COUNT = 24;
const ICOSPHERE_SUBDIVISION_LEVEL = 2;
const GEOMETRY_EPSILON = 1e-10;

export type HeightfieldRouteBuildInputInvalidReasonV1 =
  | "input-invalid"
  | "plan-not-v5"
  | "hash-invalid"
  | "constraint-not-found"
  | "constraint-ambiguous"
  | "subject-mismatch"
  | "anchor-not-explicit"
  | "anchor-placement-missing"
  | "route-not-found"
  | "route-ambiguous"
  | "surface-missing"
  | "surface-ambiguous"
  | "surface-terrain-mismatch"
  | "envelope-mutable"
  | "non-finite"
  | "non-positive-scale"
  | "contract-invalid";

export class HeightfieldRouteBuildInputInvalidErrorV1 extends Error {
  readonly code = "HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID" as const;
  readonly reason: HeightfieldRouteBuildInputInvalidReasonV1;

  constructor(reason: HeightfieldRouteBuildInputInvalidReasonV1, message: string) {
    super(`HEIGHTFIELD_ROUTE_BUILD_INPUT_INVALID (${reason}): ${message}`);
    this.name = "HeightfieldRouteBuildInputInvalidErrorV1";
    this.reason = reason;
  }
}

export interface CreateHeightfieldRouteBuildInputInputV1 {
  readonly executionPlan: ExecutionPlanV5;
  readonly capabilityEnvelope: TraversalCapabilityEnvelopeV1;
  readonly constraintId: string;
}

function failStructural(
  reason: HeightfieldRouteBuildInputInvalidReasonV1,
  message: string,
): never {
  throw new HeightfieldRouteBuildInputInvalidErrorV1(reason, message);
}

function failSemantic(code: string, message: string): never {
  const error = new Error(`${code}: ${message}`) as Error & { code: string };
  error.code = code;
  throw error;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isDeeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((child) => isDeeplyFrozen(child, seen));
}

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    failStructural("non-finite", `${label} must be finite.`);
  }
  return value;
}

function requireVec2(value: Vec2, label: string): void {
  if (!Array.isArray(value) || value.length !== 2) {
    failStructural("contract-invalid", `${label} must be a 2-tuple.`);
  }
  requireFinite(value[0], `${label}[0]`);
  requireFinite(value[1], `${label}[1]`);
}

function requireVec3(value: Vec3, label: string): void {
  if (!Array.isArray(value) || value.length !== 3) {
    failStructural("contract-invalid", `${label} must be a 3-tuple.`);
  }
  requireFinite(value[0], `${label}[0]`);
  requireFinite(value[1], `${label}[1]`);
  requireFinite(value[2], `${label}[2]`);
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) < Number.EPSILON ? 0 : value;
}

function normalizedPoint(point: Vec3): MutableVec3 {
  return [
    normalizeZero(point[0]),
    normalizeZero(point[1]),
    normalizeZero(point[2]),
  ];
}

function cross2(a: Vec2, b: Vec2, point: Vec2): number {
  return (b[0] - a[0]) * (point[1] - a[1]) -
    (b[1] - a[1]) * (point[0] - a[0]);
}

function distancePointToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const ratio = Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) /
      lengthSquared,
  ));
  return Math.hypot(
    point[0] - (start[0] + ratio * dx),
    point[1] - (start[1] + ratio * dz),
  );
}

function routeSegments(points: readonly Vec2[]): readonly (readonly [Vec2, Vec2])[] {
  const result: Array<readonly [Vec2, Vec2]> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    if (start[0] !== end[0] || start[1] !== end[1]) result.push([start, end]);
  }
  return result;
}

function distanceToPolyline(point: Vec2, points: readonly Vec2[]): number {
  return Math.min(...routeSegments(points).map(([start, end]) =>
    distancePointToSegment(point, start, end),
  ));
}

function inHardRibbon(
  point: Vec2,
  points: readonly Vec2[],
  widthMeters: number,
): boolean {
  return distanceToPolyline(point, points) <= widthMeters / 2 + GEOMETRY_EPSILON;
}

function stadiumPolygon(start: Vec2, end: Vec2, radius: number): Vec2[] {
  const theta = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const leftAngle = theta + Math.PI / 2;
  const rightAngle = theta - Math.PI / 2;
  const result: Vec2[] = [
    [start[0] + Math.cos(leftAngle) * radius, start[1] + Math.sin(leftAngle) * radius],
    [end[0] + Math.cos(leftAngle) * radius, end[1] + Math.sin(leftAngle) * radius],
  ];
  for (let chord = 1; chord <= STADIUM_HALF_CAP_CHORDS; chord += 1) {
    const angle = leftAngle - chord * Math.PI / STADIUM_HALF_CAP_CHORDS;
    result.push([
      end[0] + Math.cos(angle) * radius,
      end[1] + Math.sin(angle) * radius,
    ]);
  }
  result.push([
    start[0] + Math.cos(rightAngle) * radius,
    start[1] + Math.sin(rightAngle) * radius,
  ]);
  for (let chord = 1; chord < STADIUM_HALF_CAP_CHORDS; chord += 1) {
    const angle = rightAngle - chord * Math.PI / STADIUM_HALF_CAP_CHORDS;
    result.push([
      start[0] + Math.cos(angle) * radius,
      start[1] + Math.sin(angle) * radius,
    ]);
  }
  let signedAreaTimesTwo = 0;
  for (let index = 0; index < result.length; index += 1) {
    const point = result[index]!;
    const next = result[(index + 1) % result.length]!;
    signedAreaTimesTwo += point[0] * next[1] - next[0] * point[1];
  }
  if (!(signedAreaTimesTwo < 0)) {
    failStructural("contract-invalid", "hard-ribbon stadium winding must be negative in XZ.");
  }
  return result;
}

function interpolateToClipLine(
  start: Vec3,
  end: Vec3,
  clipStart: Vec2,
  clipEnd: Vec2,
): MutableVec3 {
  const edgeX = clipEnd[0] - clipStart[0];
  const edgeZ = clipEnd[1] - clipStart[1];
  const segmentX = end[0] - start[0];
  const segmentZ = end[2] - start[2];
  const denominator = edgeX * segmentZ - edgeZ * segmentX;
  const numerator = -(edgeX * (start[2] - clipStart[1]) -
    edgeZ * (start[0] - clipStart[0]));
  const ratio = denominator === 0 ? 0 : Math.max(0, Math.min(1, numerator / denominator));
  return normalizedPoint([
    start[0] + (end[0] - start[0]) * ratio,
    start[1] + (end[1] - start[1]) * ratio,
    start[2] + (end[2] - start[2]) * ratio,
  ]);
}

function clipPolygonToClockwiseConvexBoundary(
  source: readonly Vec3[],
  boundary: readonly Vec2[],
): Vec3[] {
  let output = source.map(normalizedPoint);
  for (let boundaryIndex = 0; boundaryIndex < boundary.length; boundaryIndex += 1) {
    const clipStart = boundary[boundaryIndex]!;
    const clipEnd = boundary[(boundaryIndex + 1) % boundary.length]!;
    const input = output;
    output = [];
    if (input.length === 0) break;
    let previous = input[input.length - 1]!;
    let previousInside = cross2(clipStart, clipEnd, [previous[0], previous[2]]) <= GEOMETRY_EPSILON;
    for (const current of input) {
      const currentInside = cross2(clipStart, clipEnd, [current[0], current[2]]) <= GEOMETRY_EPSILON;
      if (currentInside !== previousInside) {
        output.push(interpolateToClipLine(previous, current, clipStart, clipEnd));
      }
      if (currentInside) output.push(current);
      previous = current;
      previousInside = currentInside;
    }
  }
  return output;
}

function triangleNormalY(triangle: Triangle): number {
  const [a, b, c] = triangle;
  return (b[2] - a[2]) * (c[0] - a[0]) -
    (b[0] - a[0]) * (c[2] - a[2]);
}

function pointKey(point: Vec3): string {
  return normalizedPoint(point).join(",");
}

function canonicalSoup(triangles: readonly Triangle[]): CanonicalTriangleSoupV1 | undefined {
  const positionsMetersXYZ: number[] = [];
  const triangleIndices: number[] = [];
  const vertexIndexByKey = new Map<string, number>();
  const triangleKeys = new Set<string>();

  for (const rawTriangle of triangles) {
    const triangle = rawTriangle.map(normalizedPoint) as unknown as Triangle;
    const normalY = triangleNormalY(triangle);
    if (Math.abs(normalY) <= GEOMETRY_EPSILON) continue;
    if (!(normalY > 0)) {
      failStructural(
        "contract-invalid",
        "hard-ribbon clipping inverted canonical positive-Y terrain winding.",
      );
    }
    const key = triangle.map(pointKey).sort().join("|");
    if (triangleKeys.has(key)) continue;
    triangleKeys.add(key);
    for (const point of triangle) {
      const keyForPoint = pointKey(point);
      let vertexIndex = vertexIndexByKey.get(keyForPoint);
      if (vertexIndex === undefined) {
        vertexIndex = positionsMetersXYZ.length / 3;
        vertexIndexByKey.set(keyForPoint, vertexIndex);
        positionsMetersXYZ.push(...normalizedPoint(point));
      }
      triangleIndices.push(vertexIndex);
    }
  }
  return triangleIndices.length === 0
    ? undefined
    : { positionsMetersXYZ, triangleIndices };
}

function heightfieldTriangles(plan: ExecutionPlanV5): {
  readonly emitterHash: `sha256:${string}`;
  readonly triangles: readonly Triangle[];
} {
  const terrain = plan.terrain;
  if (
    !Array.isArray(terrain.resolutionCellsXZ) ||
    terrain.resolutionCellsXZ.length !== 2 ||
    !Array.isArray(terrain.heightSamplesMeters)
  ) {
    failStructural(
      "contract-invalid",
      "terrain resolution and height samples must be canonical arrays.",
    );
  }
  const emitterInput = {
    centerMetersXZ: [...terrain.centerMetersXZ] as Vec2,
    sizeMetersXZ: [...terrain.sizeMetersXZ] as Vec2,
    resolutionVerticesXZ: [...terrain.resolutionCellsXZ] as unknown as readonly [
      number,
      number,
    ],
    heightSamplesMeters: [...terrain.heightSamplesMeters],
  };
  const emitted = emitTriangleHeightfieldSurfaceV1(emitterInput);
  const worldPosition = (index: number): Vec3 => [
    emitted.localPositionsMetersXYZ[index * 3]! + emitted.originMetersXYZ[0],
    emitted.localPositionsMetersXYZ[index * 3 + 1]! + emitted.originMetersXYZ[1],
    emitted.localPositionsMetersXYZ[index * 3 + 2]! + emitted.originMetersXYZ[2],
  ];
  const triangles: Triangle[] = [];
  for (let offset = 0; offset < emitted.triangleIndices.length; offset += 3) {
    triangles.push([
      worldPosition(emitted.triangleIndices[offset]!),
      worldPosition(emitted.triangleIndices[offset + 1]!),
      worldPosition(emitted.triangleIndices[offset + 2]!),
    ]);
  }
  return {
    emitterHash: sha256CanonicalJson(emitterInput) as `sha256:${string}`,
    triangles,
  };
}

function clipTerrainToRibbon(
  triangles: readonly Triangle[],
  points: readonly Vec2[],
  widthMeters: number,
): readonly Triangle[] {
  const stadiums = routeSegments(points).map(([start, end]) =>
    stadiumPolygon(start, end, widthMeters / 2),
  );
  const retained: Triangle[] = [];
  for (const triangle of triangles) {
    for (const stadium of stadiums) {
      const polygon = clipPolygonToClockwiseConvexBoundary(triangle, stadium);
      for (let index = 1; index < polygon.length - 1; index += 1) {
        retained.push([polygon[0]!, polygon[index]!, polygon[index + 1]!]);
      }
    }
  }
  return retained;
}

function pointInTriangleInclusive(point: Vec2, triangle: readonly [Vec2, Vec2, Vec2]): boolean {
  const signs = triangle.map((start, index) =>
    cross2(start, triangle[(index + 1) % 3]!, point),
  );
  return signs.every((value) => value >= -GEOMETRY_EPSILON) ||
    signs.every((value) => value <= GEOMETRY_EPSILON);
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  const value = cross2(a, b, c);
  return Math.abs(value) <= GEOMETRY_EPSILON ? 0 : Math.sign(value);
}

function pointOnSegment(point: Vec2, start: Vec2, end: Vec2): boolean {
  return orientation(start, end, point) === 0 &&
    point[0] >= Math.min(start[0], end[0]) - GEOMETRY_EPSILON &&
    point[0] <= Math.max(start[0], end[0]) + GEOMETRY_EPSILON &&
    point[1] >= Math.min(start[1], end[1]) - GEOMETRY_EPSILON &&
    point[1] <= Math.max(start[1], end[1]) + GEOMETRY_EPSILON;
}

function segmentsIntersectInclusive(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC !== abD && cdA !== cdB) return true;
  return (abC === 0 && pointOnSegment(c, a, b)) ||
    (abD === 0 && pointOnSegment(d, a, b)) ||
    (cdA === 0 && pointOnSegment(a, c, d)) ||
    (cdB === 0 && pointOnSegment(b, c, d));
}

function pointInPolygonInclusive(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous]!;
    const b = polygon[index]!;
    if (pointOnSegment(point, a, b)) return true;
    const crosses = (a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function normalizedWaterBoundary(
  boundary: ExecutionWaterBoundaryV3,
): BlockedWaterBoundaryV1 {
  switch (boundary.kind) {
    case "circle":
      requireVec2(boundary.centerMetersXZ, "water circle centerMetersXZ");
      if (!(requireFinite(boundary.radiusMeters, "water radiusMeters") > 0)) {
        failStructural("contract-invalid", "water radiusMeters must be > 0.");
      }
      return {
        kind: "circle",
        centerMetersXZ: [...boundary.centerMetersXZ],
        radiusMeters: boundary.radiusMeters,
      };
    case "ellipse":
      requireVec2(boundary.centerMetersXZ, "water ellipse centerMetersXZ");
      requireVec2(boundary.radiusMetersXZ, "water ellipse radiusMetersXZ");
      if (!(boundary.radiusMetersXZ[0] > 0) || !(boundary.radiusMetersXZ[1] > 0)) {
        failStructural("contract-invalid", "water ellipse radii must be > 0.");
      }
      return {
        kind: "ellipse",
        centerMetersXZ: [...boundary.centerMetersXZ],
        radiusMetersXZ: [...boundary.radiusMetersXZ],
      };
    case "polygon":
      if (boundary.pointsMetersXZ.length < 3) {
        failStructural("contract-invalid", "water polygon requires at least three points.");
      }
      boundary.pointsMetersXZ.forEach((point, index) =>
        requireVec2(point, `water polygon point ${index}`),
      );
      if (boundary.pointsMetersXZ.reduce((area, point, index) => {
        const next = boundary.pointsMetersXZ[(index + 1) % boundary.pointsMetersXZ.length]!;
        return area + point[0] * next[1] - next[0] * point[1];
      }, 0) === 0) {
        failStructural("contract-invalid", "water polygon must have non-zero area.");
      }
      return {
        kind: "polygon",
        pointsMetersXZ: boundary.pointsMetersXZ.map((point) => [...point]),
      };
    default:
      failStructural("contract-invalid", "water boundary kind is unsupported.");
  }
}

function triangleIntersectsCircle(
  triangle: readonly [Vec2, Vec2, Vec2],
  center: Vec2,
  radius: number,
): boolean {
  return triangle.some((point) => Math.hypot(point[0] - center[0], point[1] - center[1]) <= radius + GEOMETRY_EPSILON) ||
    pointInTriangleInclusive(center, triangle) ||
    triangle.some((start, index) =>
      distancePointToSegment(center, start, triangle[(index + 1) % 3]!) <= radius + GEOMETRY_EPSILON,
    );
}

function triangleIntersectsBoundary(triangle3: Triangle, boundary: BlockedWaterBoundaryV1): boolean {
  const triangle = triangle3.map((point) => [point[0], point[2]] as Vec2) as unknown as [Vec2, Vec2, Vec2];
  switch (boundary.kind) {
    case "circle":
      return triangleIntersectsCircle(triangle, boundary.centerMetersXZ, boundary.radiusMeters);
    case "ellipse": {
      const normalizedTriangle = triangle.map((point) => [
        (point[0] - boundary.centerMetersXZ[0]) / boundary.radiusMetersXZ[0],
        (point[1] - boundary.centerMetersXZ[1]) / boundary.radiusMetersXZ[1],
      ] as Vec2) as unknown as [Vec2, Vec2, Vec2];
      return triangleIntersectsCircle(normalizedTriangle, [0, 0], 1);
    }
    case "polygon": {
      if (triangle.some((point) => pointInPolygonInclusive(point, boundary.pointsMetersXZ))) return true;
      if (boundary.pointsMetersXZ.some((point) => pointInTriangleInclusive(point, triangle))) return true;
      return triangle.some((start, triangleIndex) =>
        boundary.pointsMetersXZ.some((polygonStart, polygonIndex) =>
          segmentsIntersectInclusive(
            start,
            triangle[(triangleIndex + 1) % 3]!,
            polygonStart,
            boundary.pointsMetersXZ[(polygonIndex + 1) % boundary.pointsMetersXZ.length]!,
          ),
        ),
      );
    }
  }
}

function triangleIntersectsWaterVolume(
  triangle: Triangle,
  water: ExecutionWaterV3,
  boundary: BlockedWaterBoundaryV1,
): boolean {
  requireFinite(water.waterLevelMeters, `${water.entityId}.waterLevelMeters`);
  if (!(requireFinite(water.depthMeters, `${water.entityId}.depthMeters`) > 0)) {
    failStructural("contract-invalid", `${water.entityId}.depthMeters must be > 0.`);
  }
  const minimumY = Math.min(...triangle.map((point) => point[1]));
  const maximumY = Math.max(...triangle.map((point) => point[1]));
  const waterBottom = water.waterLevelMeters - water.depthMeters;
  return minimumY <= water.waterLevelMeters + GEOMETRY_EPSILON &&
    maximumY >= waterBottom - GEOMETRY_EPSILON &&
    triangleIntersectsBoundary(triangle, boundary);
}

function applyWaterSemantics(
  sourceTriangles: readonly Triangle[],
  waters: readonly ExecutionWaterV3[],
  terrainEntityId: string,
): {
  readonly triangles: readonly Triangle[];
  readonly exclusions: readonly BlockedWaterExclusionV1[];
} {
  const waterEntityIds = new Set<string>();
  const relevant = waters
    .map((water) => {
      if (waterEntityIds.has(water.entityId)) {
        failStructural("contract-invalid", `water entity '${water.entityId}' is duplicated.`);
      }
      waterEntityIds.add(water.entityId);
      if (water.terrainEntityId !== terrainEntityId) {
        failStructural(
          "surface-terrain-mismatch",
          `water '${water.entityId}' references a different terrain.`,
        );
      }
      if (!["blocked", "swimmable", "walkable"].includes(water.traversalMode)) {
        failStructural(
          "contract-invalid",
          `water '${water.entityId}' has an unsupported traversalMode.`,
        );
      }
      return { water, boundary: normalizedWaterBoundary(water.boundary) };
    })
    .sort((left, right) => left.water.entityId.localeCompare(right.water.entityId));

  for (const { water, boundary } of relevant) {
    if (
      water.traversalMode === "swimmable" &&
      sourceTriangles.some((triangle) => triangleIntersectsWaterVolume(triangle, water, boundary))
    ) {
      failSemantic(
        "ROUTE_WATER_TRAVERSAL_UNSUPPORTED",
        `swimmable water '${water.entityId}' intersects the required ground route.`,
      );
    }
  }

  let triangles = [...sourceTriangles];
  const exclusions: BlockedWaterExclusionV1[] = [];
  for (const { water, boundary } of relevant) {
    if (water.traversalMode !== "blocked") continue;
    const next = triangles.filter((triangle) =>
      !triangleIntersectsWaterVolume(triangle, water, boundary),
    );
    if (next.length !== triangles.length) {
      exclusions.push({
        waterEntityId: water.entityId,
        boundary,
        waterLevelMeters: water.waterLevelMeters,
        depthMeters: water.depthMeters,
      });
    }
    triangles = next;
  }
  return { triangles, exclusions };
}

function boxSoup(size: Vec3): CanonicalTriangleSoupV1 {
  size.forEach((value, index) => {
    if (!(requireFinite(value, `box.sizeMetersXYZ[${index}]`) > 0)) {
      failStructural("contract-invalid", "box dimensions must be > 0.");
    }
  });
  const [x, y, z] = size.map((value) => value / 2) as MutableVec3;
  return {
    positionsMetersXYZ: [
      -x, -y, -z, x, -y, -z, x, y, -z, -x, y, -z,
      -x, -y, z, x, -y, z, x, y, z, -x, y, z,
    ],
    triangleIndices: [
      0, 3, 2, 0, 2, 1,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      3, 7, 6, 3, 6, 2,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
    ],
  };
}

function cylinderSoup(radiusMeters: number, heightMeters: number): CanonicalTriangleSoupV1 {
  if (!(requireFinite(radiusMeters, "cylinder.radiusMeters") > 0) ||
      !(requireFinite(heightMeters, "cylinder.heightMeters") > 0)) {
    failStructural("contract-invalid", "cylinder radius and height must be > 0.");
  }
  const radius = radiusMeters / Math.cos(Math.PI / CYLINDER_SIDE_COUNT);
  const halfHeight = heightMeters / 2;
  const positions: number[] = [];
  for (let index = 0; index < CYLINDER_SIDE_COUNT; index += 1) {
    const angle = index * Math.PI * 2 / CYLINDER_SIDE_COUNT;
    positions.push(Math.cos(angle) * radius, -halfHeight, Math.sin(angle) * radius);
  }
  for (let index = 0; index < CYLINDER_SIDE_COUNT; index += 1) {
    const angle = index * Math.PI * 2 / CYLINDER_SIDE_COUNT;
    positions.push(Math.cos(angle) * radius, halfHeight, Math.sin(angle) * radius);
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, -halfHeight, 0);
  const topCenter = positions.length / 3;
  positions.push(0, halfHeight, 0);
  const indices: number[] = [];
  for (let index = 0; index < CYLINDER_SIDE_COUNT; index += 1) {
    const next = (index + 1) % CYLINDER_SIDE_COUNT;
    const top = index + CYLINDER_SIDE_COUNT;
    const topNext = next + CYLINDER_SIDE_COUNT;
    indices.push(index, top, topNext, index, topNext, next);
    indices.push(bottomCenter, index, next);
    indices.push(topCenter, topNext, top);
  }
  return { positionsMetersXYZ: positions, triangleIndices: indices };
}

function icosphereSoup(radiusMeters: number): CanonicalTriangleSoupV1 {
  if (!(requireFinite(radiusMeters, "sphere.radiusMeters") > 0)) {
    failStructural("contract-invalid", "sphere radius must be > 0.");
  }
  const golden = (1 + Math.sqrt(5)) / 2;
  const baseVertices: MutableVec3[] = [
    [-1, golden, 0], [1, golden, 0], [-1, -golden, 0], [1, -golden, 0],
    [0, -1, golden], [0, 1, golden], [0, -1, -golden], [0, 1, -golden],
    [golden, 0, -1], [golden, 0, 1], [-golden, 0, -1], [-golden, 0, 1],
  ];
  let vertices: MutableVec3[] = baseVertices.map((point) => {
    const length = Math.hypot(...point);
    return [point[0] / length, point[1] / length, point[2] / length];
  });
  let faces: Array<[number, number, number]> = [
    [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
    [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
    [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
  ];
  for (let level = 0; level < ICOSPHERE_SUBDIVISION_LEVEL; level += 1) {
    const midpointByEdge = new Map<string, number>();
    const midpoint = (left: number, right: number): number => {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      const existing = midpointByEdge.get(key);
      if (existing !== undefined) return existing;
      const a = vertices[left]!;
      const b = vertices[right]!;
      const raw: MutableVec3 = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
      const length = Math.hypot(...raw);
      const created = vertices.length;
      vertices.push([raw[0] / length, raw[1] / length, raw[2] / length]);
      midpointByEdge.set(key, created);
      return created;
    };
    const nextFaces: Array<[number, number, number]> = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nextFaces;
  }
  faces = faces.map((face) => {
    const [a, b, c] = face.map((index) => vertices[index]!) as unknown as [
      Vec3,
      Vec3,
      Vec3,
    ];
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal: Vec3 = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const centroid: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    return normal[0] * centroid[0] + normal[1] * centroid[1] + normal[2] * centroid[2] > 0
      ? face
      : [face[0], face[2], face[1]] as [number, number, number];
  });
  const minimumPlaneDistance = Math.min(...faces.map(([ia, ib, ic]) => {
    const a = vertices[ia]!;
    const b = vertices[ib]!;
    const c = vertices[ic]!;
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal: Vec3 = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const length = Math.hypot(...normal);
    return Math.abs(normal[0] * a[0] + normal[1] * a[1] + normal[2] * a[2]) / length;
  }));
  const scale = radiusMeters / minimumPlaneDistance;
  vertices = vertices.map((point) => point.map((value) => value * scale) as MutableVec3);
  return {
    positionsMetersXYZ: vertices.flat(),
    triangleIndices: faces.flat(),
  };
}

function transformPoint(point: Vec3, transform: ExecutionTransformV3): MutableVec3 {
  requireVec3(transform.positionMetersXYZ, "collider transform position");
  requireVec3(transform.rotationEulerRadiansXYZ, "collider transform rotation");
  requireVec3(transform.scaleXYZ, "collider transform scale");
  transform.scaleXYZ.forEach((value) => {
    if (!(value > 0)) failStructural("non-positive-scale", "collider scale must be > 0.");
  });
  let [x, y, z] = point.map((value, index) => value * transform.scaleXYZ[index]!) as MutableVec3;
  const [pitch, yaw, roll] = transform.rotationEulerRadiansXYZ;
  const cosineRoll = Math.cos(roll);
  const sineRoll = Math.sin(roll);
  [x, y] = [x * cosineRoll - y * sineRoll, x * sineRoll + y * cosineRoll];
  const cosinePitch = Math.cos(pitch);
  const sinePitch = Math.sin(pitch);
  [y, z] = [y * cosinePitch - z * sinePitch, y * sinePitch + z * cosinePitch];
  const cosineYaw = Math.cos(yaw);
  const sineYaw = Math.sin(yaw);
  [x, z] = [x * cosineYaw + z * sineYaw, -x * sineYaw + z * cosineYaw];
  return normalizedPoint([
    x + transform.positionMetersXYZ[0],
    y + transform.positionMetersXYZ[1],
    z + transform.positionMetersXYZ[2],
  ]);
}

function transformSoup(
  soup: CanonicalTriangleSoupV1,
  transform: ExecutionTransformV3,
): CanonicalTriangleSoupV1 {
  const positions: number[] = [];
  for (let offset = 0; offset < soup.positionsMetersXYZ.length; offset += 3) {
    positions.push(...transformPoint([
      soup.positionsMetersXYZ[offset]!,
      soup.positionsMetersXYZ[offset + 1]!,
      soup.positionsMetersXYZ[offset + 2]!,
    ], transform));
  }
  return { positionsMetersXYZ: positions, triangleIndices: [...soup.triangleIndices] };
}

function convexHull(points: readonly Vec2[]): Vec2[] {
  const unique = [...new Map(points.map((point) => [`${point[0]},${point[1]}`, point])).values()]
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  if (unique.length <= 2) return unique;
  const half = (source: readonly Vec2[]): Vec2[] => {
    const result: Vec2[] = [];
    for (const point of source) {
      while (result.length >= 2 && cross2(result[result.length - 2]!, result[result.length - 1]!, point) <= 0) {
        result.pop();
      }
      result.push(point);
    }
    return result;
  };
  const lower = half(unique);
  const upper = half([...unique].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function segmentDistance(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  if (segmentsIntersectInclusive(a, b, c, d)) return 0;
  return Math.min(
    distancePointToSegment(a, c, d),
    distancePointToSegment(b, c, d),
    distancePointToSegment(c, a, b),
    distancePointToSegment(d, a, b),
  );
}

function colliderIntersectsRibbon(
  soup: CanonicalTriangleSoupV1,
  points: readonly Vec2[],
  widthMeters: number,
): boolean {
  const projected: Vec2[] = [];
  for (let offset = 0; offset < soup.positionsMetersXYZ.length; offset += 3) {
    projected.push([soup.positionsMetersXYZ[offset]!, soup.positionsMetersXYZ[offset + 2]!]);
  }
  const hull = convexHull(projected);
  const segments = routeSegments(points);
  if (hull.length >= 3 && segments.some(([start, end]) =>
    pointInPolygonInclusive(start, hull) || pointInPolygonInclusive(end, hull),
  )) return true;
  let minimumDistance = Number.POSITIVE_INFINITY;
  for (const [start, end] of segments) {
    if (hull.length === 1) {
      minimumDistance = Math.min(minimumDistance, distancePointToSegment(hull[0]!, start, end));
    } else {
      for (let index = 0; index < hull.length; index += 1) {
        minimumDistance = Math.min(minimumDistance, segmentDistance(
          start,
          end,
          hull[index]!,
          hull[(index + 1) % hull.length]!,
        ));
      }
    }
  }
  return minimumDistance <= widthMeters / 2 + GEOMETRY_EPSILON;
}

function colliderSoup(collider: ExecutionStaticColliderV1): CanonicalTriangleSoupV1 {
  let local: CanonicalTriangleSoupV1;
  switch (collider.shape.kind) {
    case "box":
      local = boxSoup(collider.shape.sizeMetersXYZ);
      break;
    case "cylinder":
      local = cylinderSoup(collider.shape.radiusMeters, collider.shape.heightMeters);
      break;
    case "sphere":
      local = icosphereSoup(collider.shape.radiusMeters);
      break;
    default:
      failStructural("contract-invalid", "static collider shape kind is unsupported.");
  }
  return transformSoup(local, collider.transform);
}

function relevantBlockingColliders(
  colliders: readonly ExecutionStaticColliderV1[],
  points: readonly Vec2[],
  widthMeters: number,
): readonly StaticBlockingColliderV1[] {
  return colliders
    .map((collider) => ({ collider, soup: colliderSoup(collider) }))
    .filter(({ soup }) => colliderIntersectsRibbon(soup, points, widthMeters))
    .map(({ collider, soup }) => ({
      entityId: collider.entityId,
      logicalSubshapeId: collider.logicalSubshapeId,
      colliderSubshapeId: collider.colliderSubshapeId,
      colliderHash: collider.colliderHash,
      triangleSoup: soup,
    }))
    .sort((left, right) => left.colliderSubshapeId.localeCompare(right.colliderSubshapeId));
}

function exactBounds(soup: CanonicalTriangleSoupV1): {
  readonly minimumMetersXZ: Vec2;
  readonly maximumMetersXZ: Vec2;
} {
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < soup.positionsMetersXYZ.length; offset += 3) {
    const x = soup.positionsMetersXYZ[offset]!;
    const z = soup.positionsMetersXYZ[offset + 2]!;
    minimumX = Math.min(minimumX, x);
    minimumZ = Math.min(minimumZ, z);
    maximumX = Math.max(maximumX, x);
    maximumZ = Math.max(maximumZ, z);
  }
  return {
    minimumMetersXZ: [minimumX, minimumZ],
    maximumMetersXZ: [maximumX, maximumZ],
  };
}

function requirePlanAndEnvelope(input: CreateHeightfieldRouteBuildInputInputV1): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    failStructural("input-invalid", "factory input must be an object.");
  }
  const unknownField = Object.keys(input).find((field) =>
    !["executionPlan", "capabilityEnvelope", "constraintId"].includes(field),
  );
  if (unknownField !== undefined) {
    failStructural("input-invalid", `unknown factory field '${unknownField}'.`);
  }
  if (input.executionPlan?.schemaVersion !== 5) {
    failStructural("plan-not-v5", "ExecutionPlanV5 is required.");
  }
  if (
    input.executionPlan.kind !== "worldkit-execution-plan" ||
    input.executionPlan.coordinateSystem !==
      "right-handed-y-up-minus-z-forward"
  ) {
    failStructural(
      "contract-invalid",
      "ExecutionPlanV5 kind and coordinateSystem must be canonical.",
    );
  }
  for (const [name, value] of [
    ["authoringSpecHash", input.executionPlan.authoringSpecHash],
    ["layoutSolveReportHash", input.executionPlan.layout?.layoutSolveReportHash],
    ["resourceLockHash", input.executionPlan.resourceLockHash],
  ] as const) {
    if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
      failStructural("hash-invalid", `${name} must be a lowercase sha256 hash.`);
    }
  }
  if (typeof input.constraintId !== "string" || input.constraintId.length === 0) {
    failStructural("input-invalid", "constraintId must be a non-empty string.");
  }
  if (!isDeeplyFrozen(input.capabilityEnvelope)) {
    failStructural("envelope-mutable", "Capability Envelope must be deeply frozen.");
  }
  if (
    input.executionPlan.traversal === undefined ||
    !Array.isArray(input.executionPlan.traversal.connectivityRequirements) ||
    !Array.isArray(input.executionPlan.traversal.anchorEntityIds) ||
    !Array.isArray(input.executionPlan.traversal.surfaces) ||
    input.executionPlan.layout === undefined ||
    !Array.isArray(input.executionPlan.layout.routes) ||
    input.executionPlan.layout.placementsByEntityId === undefined ||
    !Array.isArray(input.executionPlan.subjects) ||
    !Array.isArray(input.executionPlan.staticColliders) ||
    !Array.isArray(input.executionPlan.waters)
  ) {
    failStructural(
      "contract-invalid",
      "ExecutionPlanV5 traversal source fields are malformed.",
    );
  }
}

export function createHeightfieldRouteBuildInputV1(
  input: CreateHeightfieldRouteBuildInputInputV1,
): HeightfieldRouteBuildInputReceiptV1 {
  requirePlanAndEnvelope(input);
  const plan = input.executionPlan;
  const envelope = input.capabilityEnvelope;
  const requirements = plan.traversal.connectivityRequirements.filter(
    (candidate) => {
      if (candidate === null || typeof candidate !== "object") {
        failStructural("contract-invalid", "connectivity rows must be objects.");
      }
      return candidate.constraintId === input.constraintId;
    },
  );
  if (requirements.length === 0) {
    failStructural("constraint-not-found", `constraint '${input.constraintId}' was not found.`);
  }
  if (requirements.length !== 1) {
    failStructural("constraint-ambiguous", `constraint '${input.constraintId}' is ambiguous.`);
  }
  const requirement = requirements[0]!;
  if (
    requirement.traversingEntityId !== envelope.subjectEntityId ||
    plan.subjects.filter((subject) => subject.entityId === requirement.traversingEntityId).length !== 1
  ) {
    failStructural("subject-mismatch", "connectivity Subject does not match the locked Capability Envelope.");
  }
  if (requirement.startAnchorEntityId === requirement.destinationAnchorEntityId) {
    failStructural("anchor-not-explicit", "start and destination Anchors must differ.");
  }
  for (const anchorId of [requirement.startAnchorEntityId, requirement.destinationAnchorEntityId]) {
    if (plan.traversal.anchorEntityIds.filter((candidate) => candidate === anchorId).length !== 1) {
      failStructural("anchor-not-explicit", `Anchor '${anchorId}' lacks unique explicit Anchor evidence.`);
    }
  }
  const startPlacement = plan.layout.placementsByEntityId[requirement.startAnchorEntityId];
  const destinationPlacement = plan.layout.placementsByEntityId[requirement.destinationAnchorEntityId];
  if (startPlacement === undefined || destinationPlacement === undefined) {
    failStructural("anchor-placement-missing", "a required Anchor has no absolute placement.");
  }
  requireVec3(startPlacement.transform.positionMetersXYZ, "start Anchor position");
  requireVec3(destinationPlacement.transform.positionMetersXYZ, "destination Anchor position");

  const routes = plan.layout.routes.filter((candidate) => candidate.id === requirement.routeId);
  if (routes.length === 0) failStructural("route-not-found", `route '${requirement.routeId}' was not found.`);
  if (routes.length !== 1) failStructural("route-ambiguous", `route '${requirement.routeId}' is ambiguous.`);
  const route = routes[0]!;
  if (
    !Array.isArray(route.pointsMetersXZ) ||
    typeof route.locomotionProfileRef !== "string" ||
    route.locomotionProfileRef.length === 0
  ) {
    failStructural("contract-invalid", "route points and locomotionProfileRef are malformed.");
  }
  route.pointsMetersXZ.forEach((point, index) => requireVec2(point, `route point ${index}`));
  if (routeSegments(route.pointsMetersXZ).length === 0 || !(requireFinite(route.widthMeters, "route widthMeters") > 0)) {
    failStructural("contract-invalid", "route must have a positive width and two distinct points.");
  }
  if (route.locomotionProfileRef !== envelope.locomotionProfileRef) {
    failSemantic(
      "ROUTE_LOCOMOTION_PROFILE_MISMATCH",
      "route locomotionProfileRef does not match the locked Capability Envelope.",
    );
  }

  const surfaces = plan.traversal.surfaces.filter((candidate) => {
    if (candidate === null || typeof candidate !== "object") {
      failStructural("contract-invalid", "Traversal Surface rows must be objects.");
    }
    return candidate.kind === "heightfield";
  });
  if (surfaces.length === 0) failStructural("surface-missing", "Heightfield Traversal Surface is missing.");
  if (surfaces.length !== 1) failStructural("surface-ambiguous", "Heightfield Traversal Surface is ambiguous.");
  const surface = surfaces[0]!;
  if (surface.surfaceEntityId !== plan.terrain.entityId) {
    failStructural("surface-terrain-mismatch", "Traversal Surface does not identify the Plan terrain.");
  }

  requireVec2(plan.terrain.centerMetersXZ, "terrain centerMetersXZ");
  requireVec2(plan.terrain.sizeMetersXZ, "terrain sizeMetersXZ");
  if (!(plan.terrain.sizeMetersXZ[0] > 0) || !(plan.terrain.sizeMetersXZ[1] > 0)) {
    failStructural("contract-invalid", "terrain sizeMetersXZ must be positive.");
  }
  const terrainMinimum: Vec2 = [
    plan.terrain.centerMetersXZ[0] - plan.terrain.sizeMetersXZ[0] / 2,
    plan.terrain.centerMetersXZ[1] - plan.terrain.sizeMetersXZ[1] / 2,
  ];
  const terrainMaximum: Vec2 = [
    plan.terrain.centerMetersXZ[0] + plan.terrain.sizeMetersXZ[0] / 2,
    plan.terrain.centerMetersXZ[1] + plan.terrain.sizeMetersXZ[1] / 2,
  ];
  const endpoints = [
    {
      label: "start",
      position: startPlacement.transform.positionMetersXYZ,
      code: "ROUTE_START_SURFACE_NOT_FOUND",
    },
    {
      label: "destination",
      position: destinationPlacement.transform.positionMetersXYZ,
      code: "ROUTE_DESTINATION_SURFACE_NOT_FOUND",
    },
  ] as const;
  for (const endpoint of endpoints) {
    const point: Vec2 = [endpoint.position[0], endpoint.position[2]];
    if (
      point[0] < terrainMinimum[0] || point[0] > terrainMaximum[0] ||
      point[1] < terrainMinimum[1] || point[1] > terrainMaximum[1] ||
      !inHardRibbon(point, route.pointsMetersXZ, route.widthMeters)
    ) {
      failSemantic(endpoint.code, `${endpoint.label} Anchor is outside the terrain or exact hard ribbon.`);
    }
  }

  let emitted: ReturnType<typeof heightfieldTriangles>;
  try {
    emitted = heightfieldTriangles(plan);
  } catch (cause) {
    if (cause instanceof HeightfieldRouteBuildInputInvalidErrorV1) throw cause;
    failStructural(
      "contract-invalid",
      cause instanceof Error
        ? cause.message
        : "canonical Heightfield emission failed.",
    );
  }
  const clipped = clipTerrainToRibbon(emitted.triangles, route.pointsMetersXZ, route.widthMeters);
  const waterResult = applyWaterSemantics(clipped, plan.waters, plan.terrain.entityId);
  const terrainSoup = canonicalSoup(waterResult.triangles);
  if (terrainSoup !== undefined) {
    for (let offset = 0; offset < terrainSoup.positionsMetersXYZ.length; offset += 3) {
      if (!inHardRibbon(
        [terrainSoup.positionsMetersXYZ[offset]!, terrainSoup.positionsMetersXYZ[offset + 2]!],
        route.pointsMetersXZ,
        route.widthMeters,
      )) {
        failStructural("contract-invalid", "retained terrain vertex escaped the exact hard ribbon.");
      }
    }
  }
  const terrainSource: HeightfieldRouteTerrainSourceV1 = terrainSoup === undefined
    ? {
        kind: "empty",
        terrainEntityId: plan.terrain.entityId,
        terrainArtifactHash: emitted.emitterHash,
      }
    : {
        kind: "bounded",
        terrainEntityId: plan.terrain.entityId,
        terrainArtifactHash: emitted.emitterHash,
        triangleSoup: terrainSoup,
        ...exactBounds(terrainSoup),
      };
  const blockingColliders = relevantBlockingColliders(
    plan.staticColliders,
    route.pointsMetersXZ,
    route.widthMeters,
  );
  const colliderArtifactHash = sha256CanonicalJson(blockingColliders) as `sha256:${string}`;
  const buildInput: HeightfieldRouteBuildInputV1 = {
    kind: "heightfield-route-build-input",
    schemaVersion: 1,
    authoringSpecHash: plan.authoringSpecHash,
    layoutSolveReportHash: plan.layout.layoutSolveReportHash as `sha256:${string}`,
    resourceLockHash: plan.resourceLockHash as `sha256:${string}`,
    connectivityRequirement: {
      constraintId: requirement.constraintId,
      traversingEntityId: requirement.traversingEntityId,
      startAnchorEntityId: requirement.startAnchorEntityId,
      destinationAnchorEntityId: requirement.destinationAnchorEntityId,
      routeId: requirement.routeId,
    },
    startAnchor: {
      entityId: requirement.startAnchorEntityId,
      positionMetersXYZ: [...startPlacement.transform.positionMetersXYZ],
    },
    destinationAnchor: {
      entityId: requirement.destinationAnchorEntityId,
      positionMetersXYZ: [...destinationPlacement.transform.positionMetersXYZ],
    },
    hardRibbon: {
      routeId: route.id,
      pointsMetersXZ: route.pointsMetersXZ.map((point) => [
        point[0],
        point[1],
      ] as Vec2),
      widthMeters: route.widthMeters,
      locomotionProfileRef: route.locomotionProfileRef,
    },
    traversalSurface: {
      traversalSurfaceId: surface.traversalSurfaceId,
      surfaceEntityId: surface.surfaceEntityId,
      colliderSubshapeId: surface.colliderSubshapeId,
      resourceRef: surface.resourceRef,
      resolvedVersion: surface.resolvedVersion,
      resourceHash: surface.resourceHash,
    },
    capabilityEnvelope: envelope,
    terrainSource,
    blockingColliders,
    colliderArtifactHash,
    blockedWaterExclusions: waterResult.exclusions,
  };

  try {
    assertHeightfieldRouteBuildInputV1(buildInput);
  } catch (cause) {
    failStructural(
      "contract-invalid",
      cause instanceof Error ? cause.message : "assembled Build Input failed strict validation.",
    );
  }

  let budgetEvidence: HeightfieldRouteBuildBudgetEvidenceV1;
  if (terrainSource.kind === "empty") {
    budgetEvidence = { kind: "not-required-empty-source" };
  } else {
    const estimate = assertTraversalGraphBuildBudgetV1({
      minimumMetersXZ: terrainSource.minimumMetersXZ,
      maximumMetersXZ: terrainSource.maximumMetersXZ,
      tileSizeCells: envelope.tileSizeCells,
      voxelCellSizeMeters: envelope.voxelCellSizeMeters,
      maximumTiles: envelope.maximumTiles,
    });
    budgetEvidence = {
      kind: "heightfield-tile-estimate",
      ...estimate,
      maximumTiles: envelope.maximumTiles,
      minimumMetersXZ: [...terrainSource.minimumMetersXZ],
      maximumMetersXZ: [...terrainSource.maximumMetersXZ],
    };
  }
  const routeBuildInputHash = hashHeightfieldRouteBuildInputV1(buildInput);
  return deepFreeze({
    input: buildInput,
    routeBuildInputHash,
    budgetEvidence,
  });
}
