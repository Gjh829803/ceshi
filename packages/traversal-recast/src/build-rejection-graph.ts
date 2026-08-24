import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  assertRouteBuildInputReceiptV2,
  type CanonicalTriangleSoupV1,
  type RouteBuildInputReceiptV2,
  type RouteBuildAnchorV1,
  type RouteHardRibbonV1,
  type StaticColliderSourceV1,
  type TraversalCapabilityEnvelopeV1,
  type TraversalSurfaceIdentityV1,
} from "@whitebox-world/traversal";
import { isEmpty, isNil } from "lodash-es";

import {
  createHardRibbonProofV1,
  isSegmentInsideHardRibbonV1,
} from "./hard-ribbon-proof.js";
import {
  collectBoundTraversalSurfaceGeometryV2,
  collectUnboundStaticCollidersV2,
} from "./heightfield-source.js";
import type {
  EvaluateRouteRejectionProofInputV1,
  RouteRejectionCandidateV1,
  RouteRejectionKindV1,
  RouteRejectionReasonV1,
} from "./route-rejection-proof.js";

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];
type Vec2Units = readonly [number, number];
type Vec3Units = readonly [number, number, number];

const ANGLE_QUANTUM_DEGREES = 0.000001;
const GEOMETRY_EPSILON = 1e-10;
const WIDTH_PROOF_MAXIMUM_DEPTH = 8;
const REJECTION_KIND_ORDER: readonly RouteRejectionKindV1[] = [
  "slope",
  "step",
  "width",
  "overhead",
  "gap",
];

interface SourceTriangleV1 {
  readonly id: string;
  readonly nodeId: string;
  readonly pointsUnitsXYZ: readonly [Vec3Units, Vec3Units, Vec3Units];
  readonly pointsMetersXYZ: readonly [Vec3, Vec3, Vec3];
  readonly centroidMetersXYZ: Vec3;
  readonly regionEvidence: RegionEvidenceV1;
  readonly traversalSurfaceIdentity?: TraversalSurfaceIdentityV1;
}

interface RegionEvidenceV1 {
  readonly reasons: readonly RouteRejectionReasonV1[];
  readonly witnessByKind: ReadonlyMap<RouteRejectionKindV1, Vec3>;
}

interface SourceBoundaryV1 {
  readonly id: string;
  readonly triangle: SourceTriangleV1;
  readonly fromUnitsXYZ: Vec3Units;
  readonly toUnitsXYZ: Vec3Units;
  readonly projectedKey: string;
  readonly midpointMetersXYZ: Vec3;
}

interface CandidateEvidenceV1 {
  readonly reason: RouteRejectionReasonV1;
  readonly witnessMetersXYZ: Vec3;
}

interface ProjectedColliderV1 {
  readonly colliderSubshapeId: string;
  readonly projectedTrianglesMetersXZ: readonly (readonly [Vec2, Vec2, Vec2])[];
  readonly solidTrianglesMetersXYZ: readonly (readonly [Vec3, Vec3, Vec3])[];
  readonly minimumY: number;
  readonly maximumY: number;
}

interface WidthWitnessV1 {
  readonly clearanceRadiusMeters: number;
  readonly pointMetersXYZ: Vec3;
  readonly relevantColliderSubshapeIds: readonly string[];
}

interface GapPairV1 {
  readonly left: SourceBoundaryV1;
  readonly right: SourceBoundaryV1;
  readonly gapMeters: number;
  readonly witnessMetersXYZ: Vec3;
  readonly stepHeightMeters: number;
}

export interface BuildSourceDerivedRouteRejectionProofInputV1 {
  readonly buildInputReceipt: RouteBuildInputReceiptV2;
  readonly isSourceProjectionConsistent: boolean;
}

export interface BuildSourceDerivedRouteRejectionProofInputV2 {
  readonly buildInputReceipt: RouteBuildInputReceiptV2;
  readonly isSourceProjectionConsistent: boolean;
}

interface RouteRejectionProofGeometryV1 {
  readonly terrainEntityId: string;
  readonly terrainKind: "bounded" | "empty";
  readonly triangleSoup: CanonicalTriangleSoupV1 | undefined;
  readonly capabilityEnvelope: TraversalCapabilityEnvelopeV1;
  readonly startAnchor: RouteBuildAnchorV1;
  readonly destinationAnchor: RouteBuildAnchorV1;
  readonly hardRibbon: RouteHardRibbonV1;
  readonly blockingColliders: readonly StaticColliderSourceV1[];
  readonly includeIntrinsicWalkableWidth?: boolean;
  readonly includeZeroGapStepPairs?: boolean;
  readonly admitWhenRelaxedKindPresent?: boolean;
  readonly boundSurfaces?: readonly {
    readonly identity: TraversalSurfaceIdentityV1;
    readonly triangleSoup: CanonicalTriangleSoupV1;
  }[];
}

function mergeTriangleSoupsV1(
  soups: readonly CanonicalTriangleSoupV1[],
): CanonicalTriangleSoupV1 {
  const positionsMetersXYZ: number[] = [];
  const triangleIndices: number[] = [];
  for (const soup of soups) {
    const vertexOffset = positionsMetersXYZ.length / 3;
    positionsMetersXYZ.push(...soup.positionsMetersXYZ);
    for (const triangleIndex of soup.triangleIndices) {
      triangleIndices.push(vertexOffset + triangleIndex);
    }
  }
  return { positionsMetersXYZ, triangleIndices };
}

function filterTriangleSoupToUpwardFacesOnlyV1(
  soup: CanonicalTriangleSoupV1,
  minimumUpwardNormalY = Number.MIN_VALUE,
): CanonicalTriangleSoupV1 {
  const positionsMetersXYZ: number[] = [];
  const triangleIndices: number[] = [];
  const pointAt = (index: number): Vec3 => [
    soup.positionsMetersXYZ[index * 3]!,
    soup.positionsMetersXYZ[index * 3 + 1]!,
    soup.positionsMetersXYZ[index * 3 + 2]!,
  ];
  const appendVertex = (point: Vec3): number => {
    const vertexIndex = positionsMetersXYZ.length / 3;
    positionsMetersXYZ.push(point[0], point[1], point[2]);
    return vertexIndex;
  };
  const minimumNy = minimumUpwardNormalY > 0 ? minimumUpwardNormalY : Number.MIN_VALUE;
  for (let offset = 0; offset < soup.triangleIndices.length; offset += 3) {
    const triangle: [Vec3, Vec3, Vec3] = [
      pointAt(soup.triangleIndices[offset]!),
      pointAt(soup.triangleIndices[offset + 1]!),
      pointAt(soup.triangleIndices[offset + 2]!),
    ];
    const normal = triangleNormal(triangle);
    const magnitude = Math.hypot(normal[0], normal[1], normal[2]);
    if (!(magnitude > 0)) continue;
    const unitY = normal[1] / magnitude;
    if (!(unitY > 0) || unitY < minimumNy) continue;
    triangleIndices.push(
      appendVertex(triangle[0]),
      appendVertex(triangle[1]),
      appendVertex(triangle[2]),
    );
  }
  return { positionsMetersXYZ, triangleIndices };
}

function geometryFromHeightfieldReceiptV1(
  receipt: RouteBuildInputReceiptV2,
): RouteRejectionProofGeometryV1 {
  return {
    terrainEntityId: receipt.input.terrainSource.terrainEntityId,
    terrainKind: receipt.input.terrainSource.kind,
    triangleSoup: receipt.input.terrainSource.kind === "bounded"
      ? receipt.input.terrainSource.triangleSoup
      : undefined,
    capabilityEnvelope: receipt.input.capabilityEnvelope,
    startAnchor: receipt.input.startAnchor,
    destinationAnchor: receipt.input.destinationAnchor,
    hardRibbon: receipt.input.hardRibbon,
    blockingColliders: receipt.input.staticColliders,
  };
}

function geometryFromRouteBuildInputReceiptV2(
  receipt: RouteBuildInputReceiptV2,
): RouteRejectionProofGeometryV1 {
  const boundSurfaces = collectBoundTraversalSurfaceGeometryV2(receipt.input);
  const boundSoups = boundSurfaces.map((row) => row.triangleSoup);
  return {
    terrainEntityId: receipt.input.terrainSource.terrainEntityId,
    terrainKind: receipt.input.terrainSource.kind,
    triangleSoup: receipt.input.terrainSource.kind === "bounded"
      ? filterTriangleSoupToUpwardFacesOnlyV1(
          mergeTriangleSoupsV1(
            boundSoups.length === 0
              ? [receipt.input.terrainSource.triangleSoup]
              : boundSoups,
          ),
        )
      : undefined,
    capabilityEnvelope: receipt.input.capabilityEnvelope,
    startAnchor: receipt.input.startAnchor,
    destinationAnchor: receipt.input.destinationAnchor,
    hardRibbon: receipt.input.hardRibbon,
    blockingColliders: collectUnboundStaticCollidersV2(receipt.input),
    includeIntrinsicWalkableWidth: true,
    includeZeroGapStepPairs: true,
    admitWhenRelaxedKindPresent: true,
    boundSurfaces,
  };
}

function deepFreeze<T>(value: T): T {
  if (isNil(value) || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) < Number.EPSILON ? 0 : value;
}

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `SOURCE_DERIVED_REJECTION_GRAPH_INVALID: ${label} must be a safe integer.`,
    );
  }
  return value;
}

function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("SOURCE_DERIVED_REJECTION_GRAPH_INVALID: quantization input must be finite.");
  }
  return requireSafeInteger(
    value < 0 ? Math.ceil(value - 0.5) : Math.floor(value + 0.5),
    "quantized coordinate",
  );
}

function quantizeToUnits(value: number, quantumMeters: number): number {
  return roundHalfAwayFromZero(value / quantumMeters);
}

function unitsToMeters(units: number, quantumMeters: number): number {
  requireSafeInteger(units, "quantized units");
  const value = units * quantumMeters;
  if (!Number.isFinite(value)) {
    throw new Error("SOURCE_DERIVED_REJECTION_GRAPH_INVALID: quantized coordinate is non-finite.");
  }
  return normalizeZero(value);
}

function quantizeMeters(value: number, quantumMeters: number): number {
  return unitsToMeters(quantizeToUnits(value, quantumMeters), quantumMeters);
}

function pointToUnits(point: Vec3, quantumMeters: number): Vec3Units {
  return [
    quantizeToUnits(point[0], quantumMeters),
    quantizeToUnits(point[1], quantumMeters),
    quantizeToUnits(point[2], quantumMeters),
  ];
}

function pointUnitsToMeters(point: Vec3Units, quantumMeters: number): Vec3 {
  return [
    unitsToMeters(point[0], quantumMeters),
    unitsToMeters(point[1], quantumMeters),
    unitsToMeters(point[2], quantumMeters),
  ];
}

function compareVec3Units(left: Vec3Units, right: Vec3Units): number {
  for (let axis = 0; axis < 3; axis += 1) {
    if (left[axis] !== right[axis]) return left[axis]! < right[axis]! ? -1 : 1;
  }
  return 0;
}

function compareVec3(left: Vec3, right: Vec3): number {
  for (let axis = 0; axis < 3; axis += 1) {
    if (left[axis] !== right[axis]) return left[axis]! < right[axis]! ? -1 : 1;
  }
  return 0;
}

function pointKey(point: Vec3Units): string {
  return point.join(",");
}

function projectedPointKey(point: Vec3Units): string {
  return `${point[0]},${point[2]}`;
}

function canonicalHashId(prefix: string, value: unknown): string {
  return `${prefix}:${sha256CanonicalJson(value).slice("sha256:".length)}`;
}

function ceilingToQuantum(value: number, quantum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(quantum) || !(quantum > 0)) {
    throw new Error("SOURCE_DERIVED_REJECTION_GRAPH_INVALID: ceiling quantization must be finite and positive.");
  }
  const units = value / quantum;
  const roundoffTolerance =
    Number.EPSILON * Math.max(1, Math.abs(units)) * 4;
  return unitsToMeters(
    requireSafeInteger(Math.ceil(units - roundoffTolerance), "ceiling units"),
    quantum,
  );
}

function floorToQuantum(value: number, quantum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(quantum) || !(quantum > 0)) {
    throw new Error("SOURCE_DERIVED_REJECTION_GRAPH_INVALID: floor quantization must be finite and positive.");
  }
  return unitsToMeters(
    requireSafeInteger(Math.floor(value / quantum + Number.EPSILON), "floor units"),
    quantum,
  );
}

export function quantizeInsufficientClearanceWidthMetersV1(
  value: number,
  requiredWidthMeters: number,
  quantumMeters: number,
): number | undefined {
  const observedWidthMeters = ceilingToQuantum(value, quantumMeters);
  return observedWidthMeters < requiredWidthMeters
    ? observedWidthMeters
    : undefined;
}

function triangleNormal(triangle: readonly [Vec3, Vec3, Vec3]): Vec3 {
  const [a, b, c] = triangle;
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
}

function triangleCentroid(
  triangle: readonly [Vec3, Vec3, Vec3],
  quantumMeters: number,
): Vec3 {
  return [0, 1, 2].map((axis) => quantizeMeters(
    (triangle[0][axis]! + triangle[1][axis]! + triangle[2][axis]!) / 3,
    quantumMeters,
  )) as unknown as Vec3;
}

function pointOnTrianglePlaneMeters(
  triangle: SourceTriangleV1,
  pointMetersXZ: Vec2,
  quantumMeters: number,
): Vec3 {
  const [a] = triangle.pointsMetersXYZ;
  const normal = triangleNormal(triangle.pointsMetersXYZ);
  const y = a[1] - (
    normal[0] * (pointMetersXZ[0] - a[0]) +
    normal[2] * (pointMetersXZ[1] - a[2])
  ) / normal[1];
  return [
    quantizeMeters(pointMetersXZ[0], quantumMeters),
    quantizeMeters(y, quantumMeters),
    quantizeMeters(pointMetersXZ[1], quantumMeters),
  ];
}

function cross2(start: Vec2, end: Vec2, point: Vec2): number {
  return (end[0] - start[0]) * (point[1] - start[1]) -
    (end[1] - start[1]) * (point[0] - start[0]);
}

function pointInTriangleInclusive(
  point: Vec2,
  triangle: readonly [Vec2, Vec2, Vec2],
): boolean {
  if (!(triangleAreaTimesTwo(triangle) > GEOMETRY_EPSILON)) return false;
  const first = cross2(triangle[0], triangle[1], point);
  const second = cross2(triangle[1], triangle[2], point);
  const third = cross2(triangle[2], triangle[0], point);
  return (
    (first >= -GEOMETRY_EPSILON && second >= -GEOMETRY_EPSILON && third >= -GEOMETRY_EPSILON) ||
    (first <= GEOMETRY_EPSILON && second <= GEOMETRY_EPSILON && third <= GEOMETRY_EPSILON)
  );
}

function distancePointToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const ratio = Math.max(0, Math.min(1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared,
  ));
  return Math.hypot(
    point[0] - (start[0] + ratio * dx),
    point[1] - (start[1] + ratio * dz),
  );
}

function distancePointToTriangle(
  point: Vec2,
  triangle: readonly [Vec2, Vec2, Vec2],
): number {
  if (pointInTriangleInclusive(point, triangle)) return 0;
  return Math.min(
    distancePointToSegment(point, triangle[0], triangle[1]),
    distancePointToSegment(point, triangle[1], triangle[2]),
    distancePointToSegment(point, triangle[2], triangle[0]),
  );
}

function distanceToPolyline(point: Vec2, points: readonly Vec2[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    if (start[0] === end[0] && start[1] === end[1]) continue;
    minimum = Math.min(minimum, distancePointToSegment(point, start, end));
  }
  return minimum;
}

function triangleAreaTimesTwo(triangle: readonly [Vec2, Vec2, Vec2]): number {
  return Math.abs(cross2(triangle[0], triangle[1], triangle[2]));
}

function clipConvexPolygon(
  source: readonly Vec2[],
  clip: readonly [Vec2, Vec2, Vec2],
): readonly Vec2[] {
  const clipSign = Math.sign(cross2(clip[0], clip[1], clip[2]));
  let output = [...source];
  for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
    const edgeStart = clip[edgeIndex]!;
    const edgeEnd = clip[(edgeIndex + 1) % 3]!;
    const rows = output;
    output = [];
    if (rows.length === 0) break;
    let previous = rows.at(-1)!;
    let previousValue = cross2(edgeStart, edgeEnd, previous) * clipSign;
    for (const current of rows) {
      const currentValue = cross2(edgeStart, edgeEnd, current) * clipSign;
      const previousInside = previousValue >= -GEOMETRY_EPSILON;
      const currentInside = currentValue >= -GEOMETRY_EPSILON;
      if (previousInside !== currentInside) {
        const ratio = previousValue / (previousValue - currentValue);
        output.push([
          previous[0] + (current[0] - previous[0]) * ratio,
          previous[1] + (current[1] - previous[1]) * ratio,
        ]);
      }
      if (currentInside) output.push(current);
      previous = current;
      previousValue = currentValue;
    }
  }
  return output;
}

function polygonArea(points: readonly Vec2[]): number {
  let areaTimesTwo = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const next = points[(index + 1) % points.length]!;
    areaTimesTwo += point[0] * next[1] - next[0] * point[1];
  }
  return Math.abs(areaTimesTwo) / 2;
}

export function hasPositiveProjectedTriangleOverlapV1(
  triangles: readonly (readonly [Vec2, Vec2, Vec2])[],
): boolean {
  for (let leftIndex = 0; leftIndex < triangles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < triangles.length; rightIndex += 1) {
      if (
        polygonArea(clipConvexPolygon(
          triangles[leftIndex]!,
          triangles[rightIndex]!,
        )) > GEOMETRY_EPSILON
      ) return true;
    }
  }
  return false;
}

function soupTriangles(soup: CanonicalTriangleSoupV1): readonly (readonly [Vec3, Vec3, Vec3])[] {
  const pointAt = (index: number): Vec3 => [
    soup.positionsMetersXYZ[index * 3]!,
    soup.positionsMetersXYZ[index * 3 + 1]!,
    soup.positionsMetersXYZ[index * 3 + 2]!,
  ];
  const triangles: Array<readonly [Vec3, Vec3, Vec3]> = [];
  for (let offset = 0; offset < soup.triangleIndices.length; offset += 3) {
    triangles.push([
      pointAt(soup.triangleIndices[offset]!),
      pointAt(soup.triangleIndices[offset + 1]!),
      pointAt(soup.triangleIndices[offset + 2]!),
    ]);
  }
  return triangles;
}

function clipPolygonAtY(
  source: readonly Vec3[],
  boundaryY: number,
  keepAbove: boolean,
): readonly Vec3[] {
  if (source.length === 0) return source;
  const output: Vec3[] = [];
  let previous = source.at(-1)!;
  let previousInside = keepAbove
    ? previous[1] >= boundaryY
    : previous[1] <= boundaryY;
  for (const current of source) {
    const currentInside = keepAbove
      ? current[1] >= boundaryY
      : current[1] <= boundaryY;
    if (previousInside !== currentInside) {
      const ratio = (boundaryY - previous[1]) / (current[1] - previous[1]);
      output.push([
        previous[0] + (current[0] - previous[0]) * ratio,
        boundaryY,
        previous[2] + (current[2] - previous[2]) * ratio,
      ]);
    }
    if (currentInside) output.push(current);
    previous = current;
    previousInside = currentInside;
  }
  return output;
}

function projectedCollider(
  collider: StaticColliderSourceV1,
  minimumY: number,
  maximumY: number,
): ProjectedColliderV1 {
  const projectedTrianglesMetersXZ: Array<readonly [Vec2, Vec2, Vec2]> = [];
  const solidTrianglesMetersXYZ = soupTriangles(collider.triangleSoup);
  for (const triangle of solidTrianglesMetersXYZ) {
    const clipped = clipPolygonAtY(
      clipPolygonAtY(triangle, minimumY, true),
      maximumY,
      false,
    );
    if (clipped.length === 0) continue;
    const projected = clipped.map((point) => [point[0], point[2]] as Vec2);
    if (projected.length === 1) {
      projectedTrianglesMetersXZ.push([
        projected[0]!,
        projected[0]!,
        projected[0]!,
      ]);
      continue;
    }
    if (projected.length === 2) {
      projectedTrianglesMetersXZ.push([
        projected[0]!,
        projected[1]!,
        projected[1]!,
      ]);
      continue;
    }
    for (let index = 1; index < projected.length - 1; index += 1) {
      projectedTrianglesMetersXZ.push([
        projected[0]!,
        projected[index]!,
        projected[index + 1]!,
      ]);
    }
  }
  return {
    colliderSubshapeId: collider.colliderSubshapeId,
    projectedTrianglesMetersXZ,
    solidTrianglesMetersXYZ,
    minimumY,
    maximumY,
  };
}

function verticalIntersectionY(
  pointMetersXZ: Vec2,
  triangle: readonly [Vec3, Vec3, Vec3],
): number | undefined {
  const projected = triangle.map((point) => [point[0], point[2]] as Vec2) as unknown as
    readonly [Vec2, Vec2, Vec2];
  if (!pointInTriangleInclusive(pointMetersXZ, projected)) return undefined;
  const normal = triangleNormal(triangle);
  if (Math.abs(normal[1]) <= GEOMETRY_EPSILON) return undefined;
  const [anchor] = triangle;
  const y = anchor[1] - (
    normal[0] * (pointMetersXZ[0] - anchor[0]) +
    normal[2] * (pointMetersXZ[1] - anchor[2])
  ) / normal[1];
  return Number.isFinite(y) ? y : undefined;
}

function isInsideSolidWithinVerticalSlab(
  pointMetersXZ: Vec2,
  collider: ProjectedColliderV1,
): boolean {
  const intersections = collider.solidTrianglesMetersXYZ
    .map((triangle) => verticalIntersectionY(pointMetersXZ, triangle))
    .filter((value): value is number => !isNil(value))
    .sort((left, right) => left - right);
  const uniqueIntersections: number[] = [];
  for (const value of intersections) {
    const previous = uniqueIntersections.at(-1);
    if (isNil(previous) || Math.abs(value - previous) > GEOMETRY_EPSILON) {
      uniqueIntersections.push(value);
    }
  }
  for (let index = 0; index + 1 < uniqueIntersections.length; index += 2) {
    const intervalMinimumY = uniqueIntersections[index]!;
    const intervalMaximumY = uniqueIntersections[index + 1]!;
    if (
      intervalMaximumY >= collider.minimumY &&
      intervalMinimumY <= collider.maximumY
    ) return true;
  }
  return false;
}

function widthClearanceAtPoint(
  pointMetersXYZ: Vec3,
  projectedColliders: readonly ProjectedColliderV1[],
  routePointsMetersXZ: readonly Vec2[],
  routeWidthMeters: number,
): WidthWitnessV1 {
  const pointMetersXZ: Vec2 = [pointMetersXYZ[0], pointMetersXYZ[2]];
  let clearanceRadiusMeters = Math.max(
    0,
    routeWidthMeters / 2 - distanceToPolyline(pointMetersXZ, routePointsMetersXZ),
  );
  const distanceByCollider = projectedColliders.map((collider) => ({
    colliderSubshapeId: collider.colliderSubshapeId,
    distanceMeters: isInsideSolidWithinVerticalSlab(pointMetersXZ, collider)
      ? 0
      : Math.min(...collider.projectedTrianglesMetersXZ.map((triangle) =>
          distancePointToTriangle(pointMetersXZ, triangle),
        )),
  }));
  for (const row of distanceByCollider) {
    clearanceRadiusMeters = Math.min(clearanceRadiusMeters, row.distanceMeters);
  }
  const relevantColliderSubshapeIds = distanceByCollider
    .filter((row) => Math.abs(row.distanceMeters - clearanceRadiusMeters) <= GEOMETRY_EPSILON)
    .map((row) => row.colliderSubshapeId)
    .sort(compareId);
  return { clearanceRadiusMeters, pointMetersXYZ, relevantColliderSubshapeIds };
}

function midpoint(left: Vec3, right: Vec3): Vec3 {
  return [
    (left[0] + right[0]) / 2,
    (left[1] + right[1]) / 2,
    (left[2] + right[2]) / 2,
  ];
}

function proveWidthInsufficient(
  triangle: readonly [Vec3, Vec3, Vec3],
  projectedColliders: readonly ProjectedColliderV1[],
  routePointsMetersXZ: readonly Vec2[],
  routeWidthMeters: number,
  requiredRadiusMeters: number,
  depth: number,
): WidthWitnessV1 | undefined {
  const center: Vec3 = [
    (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3,
    (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3,
    (triangle[0][2] + triangle[1][2] + triangle[2][2]) / 3,
  ];
  const centerWitness = widthClearanceAtPoint(
    center,
    projectedColliders,
    routePointsMetersXZ,
    routeWidthMeters,
  );
  if (centerWitness.clearanceRadiusMeters >= requiredRadiusMeters) return undefined;
  const coveringRadiusMeters = Math.max(...triangle.map((point) =>
    Math.hypot(point[0] - center[0], point[2] - center[2]),
  ));
  if (
    centerWitness.clearanceRadiusMeters + coveringRadiusMeters <
    requiredRadiusMeters - GEOMETRY_EPSILON
  ) return centerWitness;
  if (depth === 0) return undefined;

  const ab = midpoint(triangle[0], triangle[1]);
  const bc = midpoint(triangle[1], triangle[2]);
  const ca = midpoint(triangle[2], triangle[0]);
  const children: readonly (readonly [Vec3, Vec3, Vec3])[] = [
    [triangle[0], ab, ca],
    [ab, triangle[1], bc],
    [ca, bc, triangle[2]],
    [ab, bc, ca],
  ];
  const witnesses: WidthWitnessV1[] = [];
  for (const child of children) {
    const witness = proveWidthInsufficient(
      child,
      projectedColliders,
      routePointsMetersXZ,
      routeWidthMeters,
      requiredRadiusMeters,
      depth - 1,
    );
    if (isNil(witness)) return undefined;
    witnesses.push(witness);
  }
  return witnesses.sort((left, right) =>
    left.clearanceRadiusMeters !== right.clearanceRadiusMeters
      ? left.clearanceRadiusMeters - right.clearanceRadiusMeters
      : compareVec3(left.pointMetersXYZ, right.pointMetersXYZ),
  )[0]!;
}

function coveringOverheadEvidence(
  triangle: Omit<SourceTriangleV1, "regionEvidence">,
  colliders: readonly StaticColliderSourceV1[],
  requiredHeightMeters: number,
  quantumMeters: number,
  terrainEntityId: string,
): CandidateEvidenceV1 | undefined {
  const terrainProjected = triangle.pointsMetersXYZ.map((point) =>
    [point[0], point[2]] as Vec2,
  ) as unknown as readonly [Vec2, Vec2, Vec2];
  const terrainArea = triangleAreaTimesTwo(terrainProjected) / 2;
  const options: Array<Readonly<{
    colliderSubshapeId: string;
    minimumClearanceMeters: number;
  }>> = [];

  for (const collider of colliders) {
    const downwardHorizontalByY = new Map<number, Array<readonly [Vec2, Vec2, Vec2]>>();
    for (const colliderTriangle of soupTriangles(collider.triangleSoup)) {
      const normal = triangleNormal(colliderTriangle);
      if (!(normal[1] < 0)) continue;
      const yUnits = colliderTriangle.map((point) => quantizeToUnits(point[1], quantumMeters));
      if (yUnits[0] !== yUnits[1] || yUnits[1] !== yUnits[2]) continue;
      const projected = colliderTriangle.map((point) =>
        [point[0], point[2]] as Vec2,
      ) as unknown as readonly [Vec2, Vec2, Vec2];
      if (!(triangleAreaTimesTwo(projected) > GEOMETRY_EPSILON)) continue;
      const rows = downwardHorizontalByY.get(yUnits[0]!) ?? [];
      rows.push(projected);
      downwardHorizontalByY.set(yUnits[0]!, rows);
    }
    for (const [bottomUnits, projectedTriangles] of downwardHorizontalByY) {
      if (hasPositiveProjectedTriangleOverlapV1(projectedTriangles)) continue;
      const bottomMeters = unitsToMeters(bottomUnits, quantumMeters);
      const coveredArea = projectedTriangles.reduce((sum, projected) =>
        sum + polygonArea(clipConvexPolygon(terrainProjected, projected)),
      0);
      if (Math.abs(coveredArea - terrainArea) > GEOMETRY_EPSILON * Math.max(1, terrainArea)) {
        continue;
      }
      const clearances = triangle.pointsMetersXYZ.map((point) => bottomMeters - point[1]);
      if (
        !(Math.min(...clearances) > 0) ||
        !(Math.max(...clearances) < requiredHeightMeters)
      ) continue;
      options.push({
        colliderSubshapeId: collider.colliderSubshapeId,
        minimumClearanceMeters: Math.min(...clearances),
      });
    }
  }
  if (options.length === 0) return undefined;
  options.sort((left, right) =>
    left.minimumClearanceMeters !== right.minimumClearanceMeters
      ? left.minimumClearanceMeters - right.minimumClearanceMeters
      : compareId(left.colliderSubshapeId, right.colliderSubshapeId),
  );
  const selected = options[0]!;
  return {
    reason: {
      kind: "overhead",
      terrainEntityId,
      relevantColliderSubshapeIds: [selected.colliderSubshapeId],
      minimumObservedClearanceHeightMeters: floorToQuantum(
        selected.minimumClearanceMeters,
        quantumMeters,
      ),
      minimumRequiredClearanceHeightMeters: requiredHeightMeters,
    },
    witnessMetersXYZ: triangle.centroidMetersXYZ,
  };
}


function triangleMinimumWidthMetersXZ(
  points: readonly [Vec3, Vec3, Vec3],
): number {
  const ab = Math.hypot(points[1][0] - points[0][0], points[1][2] - points[0][2]);
  const bc = Math.hypot(points[2][0] - points[1][0], points[2][2] - points[1][2]);
  const ca = Math.hypot(points[0][0] - points[2][0], points[0][2] - points[2][2]);
  const areaTwice = Math.abs(
    (points[1][0] - points[0][0]) * (points[2][2] - points[0][2]) -
    (points[1][2] - points[0][2]) * (points[2][0] - points[0][0]),
  );
  let longest = ab;
  if (bc > longest) longest = bc;
  if (ca > longest) longest = ca;
  if (!(longest > 0)) return 0;
  return areaTwice / longest;
}

function regionEvidence(
  triangle: Omit<SourceTriangleV1, "regionEvidence">,
  receipt: RouteRejectionProofGeometryV1,
): RegionEvidenceV1 {
  const envelope = receipt.capabilityEnvelope;
  const quantumMeters = envelope.positionQuantizationMeters;
  const terrainEntityId = receipt.terrainEntityId;
  const evidence: CandidateEvidenceV1[] = [];
  const normal = triangleNormal(triangle.pointsMetersXYZ);
  const slopeDegrees = ceilingToQuantum(
    Math.atan2(Math.hypot(normal[0], normal[2]), normal[1]) * 180 / Math.PI,
    ANGLE_QUANTUM_DEGREES,
  );
  if (slopeDegrees > envelope.maxSlopeDegrees) {
    evidence.push({
      reason: {
        kind: "slope",
        terrainEntityId,
        maximumObservedSlopeDegrees: slopeDegrees,
        maximumAllowedSlopeDegrees: envelope.maxSlopeDegrees,
      },
      witnessMetersXYZ: triangle.centroidMetersXYZ,
    });
  }

  const minimumGroundMeters = Math.min(...triangle.pointsMetersXYZ.map((point) => point[1]));
  const maximumGroundMeters = Math.max(...triangle.pointsMetersXYZ.map((point) => point[1]));
  const lowColliders = receipt.blockingColliders
    .map((collider) => projectedCollider(
      collider,
      minimumGroundMeters,
      maximumGroundMeters + envelope.maxStepHeightMeters,
    ))
    .filter((collider) => collider.projectedTrianglesMetersXZ.length > 0);
  const requiredRadiusMeters = envelope.capsuleRadiusMeters + envelope.clearanceMarginMeters;
  const widthWitness = proveWidthInsufficient(
    triangle.pointsMetersXYZ,
    lowColliders,
    receipt.hardRibbon.pointsMetersXZ,
    receipt.hardRibbon.widthMeters,
    requiredRadiusMeters,
    WIDTH_PROOF_MAXIMUM_DEPTH,
  );
  const minimumObservedClearanceWidthMeters = isNil(widthWitness)
    ? undefined
    : quantizeInsufficientClearanceWidthMetersV1(
        widthWitness.clearanceRadiusMeters * 2,
        normalizeZero(requiredRadiusMeters * 2),
        quantumMeters,
      );
  if (!isNil(widthWitness) && !isNil(minimumObservedClearanceWidthMeters)) {
    evidence.push({
      reason: {
        kind: "width",
        terrainEntityId,
        relevantColliderSubshapeIds: widthWitness.relevantColliderSubshapeIds,
        minimumObservedClearanceWidthMeters,
        minimumRequiredClearanceWidthMeters: normalizeZero(requiredRadiusMeters * 2),
      },
      witnessMetersXYZ: [
        quantizeMeters(widthWitness.pointMetersXYZ[0], quantumMeters),
        quantizeMeters(widthWitness.pointMetersXYZ[1], quantumMeters),
        quantizeMeters(widthWitness.pointMetersXYZ[2], quantumMeters),
      ],
    });
  }

  if (
    receipt.includeIntrinsicWalkableWidth === true &&
    isNil(widthWitness)
  ) {
    const intrinsicWidthMeters = triangleMinimumWidthMetersXZ(
      triangle.pointsMetersXYZ,
    );
    const requiredWidthMeters = normalizeZero(requiredRadiusMeters * 2);
    if (intrinsicWidthMeters + GEOMETRY_EPSILON < requiredWidthMeters) {
      evidence.push({
        reason: {
          kind: "width",
          terrainEntityId,
          relevantColliderSubshapeIds: [],
          minimumObservedClearanceWidthMeters: floorToQuantum(
            intrinsicWidthMeters,
            quantumMeters,
          ),
          minimumRequiredClearanceWidthMeters: requiredWidthMeters,
        },
        witnessMetersXYZ: [
          quantizeMeters(triangle.centroidMetersXYZ[0], quantumMeters),
          quantizeMeters(triangle.centroidMetersXYZ[1], quantumMeters),
          quantizeMeters(triangle.centroidMetersXYZ[2], quantumMeters),
        ],
      });
    }
  }

  const overhead = coveringOverheadEvidence(
    triangle,
    receipt.blockingColliders,
    envelope.capsuleHeightMeters,
    quantumMeters,
    terrainEntityId,
  );
  if (!isNil(overhead)) evidence.push(overhead);

  evidence.sort((left, right) =>
    REJECTION_KIND_ORDER.indexOf(left.reason.kind) -
    REJECTION_KIND_ORDER.indexOf(right.reason.kind),
  );
  return {
    reasons: evidence.map((row) => row.reason),
    witnessByKind: new Map(evidence.map((row) => [row.reason.kind, row.witnessMetersXYZ])),
  };
}

function appendSourceTrianglesFromSoupV1(
  soup: CanonicalTriangleSoupV1,
  receipt: RouteRejectionProofGeometryV1,
  identity: TraversalSurfaceIdentityV1 | undefined,
  byId: Map<string, SourceTriangleV1>,
): boolean {
  const quantumMeters = receipt.capabilityEnvelope.positionQuantizationMeters;
  let isConsistent = true;
  for (const raw of soupTriangles(soup)) {
    const pointsUnitsXYZ = raw.map((point) =>
      pointToUnits(point, quantumMeters),
    ) as unknown as readonly [Vec3Units, Vec3Units, Vec3Units];
    const pointsMetersXYZ = pointsUnitsXYZ.map((point) =>
      pointUnitsToMeters(point, quantumMeters),
    ) as unknown as readonly [Vec3, Vec3, Vec3];
    const normal = triangleNormal(pointsMetersXYZ);
    if (
      new Set(pointsUnitsXYZ.map(pointKey)).size !== 3 ||
      !(normal[1] > 0) ||
      !Number.isFinite(Math.hypot(...normal))
    ) {
      isConsistent = false;
      continue;
    }
    const canonicalPoints = [...pointsUnitsXYZ].sort(compareVec3Units);
    const id = canonicalHashId("route-rejection-source-triangle", {
      kind: "route-rejection-source-triangle-identity",
      schemaVersion: 1,
      terrainEntityId: receipt.terrainEntityId,
      pointsUnitsXYZ: canonicalPoints,
      ...(isNil(identity) ? {} : { traversalSurfaceId: identity.traversalSurfaceId }),
    });
    const nodeId = canonicalHashId("route-rejection-node", {
      kind: "route-rejection-node-identity",
      schemaVersion: 1,
      sourceTriangleId: id,
    });
    const partial: Omit<SourceTriangleV1, "regionEvidence"> = {
      id,
      nodeId,
      pointsUnitsXYZ,
      pointsMetersXYZ,
      centroidMetersXYZ: triangleCentroid(pointsMetersXYZ, quantumMeters),
      ...(isNil(identity) ? {} : { traversalSurfaceIdentity: identity }),
    };
    const created: SourceTriangleV1 = {
      ...partial,
      regionEvidence: regionEvidence(partial, receipt),
    };
    if (byId.has(id)) {
      isConsistent = false;
      continue;
    }
    byId.set(id, created);
  }
  return isConsistent;
}

function sourceTriangles(
  receipt: RouteRejectionProofGeometryV1,
): Readonly<{ triangles: readonly SourceTriangleV1[]; isConsistent: boolean }> {
  const byId = new Map<string, SourceTriangleV1>();
  let isConsistent = true;
  const boundSurfaces = receipt.boundSurfaces;
  if (!isNil(boundSurfaces) && !isEmpty(boundSurfaces)) {
    for (const boundSurface of boundSurfaces) {
      if (!appendSourceTrianglesFromSoupV1(
        filterTriangleSoupToUpwardFacesOnlyV1(boundSurface.triangleSoup),
        receipt,
        boundSurface.identity,
        byId,
      )) {
        isConsistent = false;
      }
    }
    return {
      triangles: [...byId.values()].sort((left, right) => compareId(left.id, right.id)),
      isConsistent,
    };
  }
  if (receipt.terrainKind !== "bounded" || isNil(receipt.triangleSoup)) {
    return { triangles: [], isConsistent: true };
  }
  if (!appendSourceTrianglesFromSoupV1(receipt.triangleSoup, receipt, undefined, byId)) {
    isConsistent = false;
  }
  return {
    triangles: [...byId.values()].sort((left, right) => compareId(left.id, right.id)),
    isConsistent,
  };
}

function sourceBoundaries(
  triangles: readonly SourceTriangleV1[],
  quantumMeters: number,
): readonly SourceBoundaryV1[] {
  const boundaries: SourceBoundaryV1[] = [];
  for (const triangle of triangles) {
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
      const fromUnitsXYZ = triangle.pointsUnitsXYZ[edgeIndex]!;
      const toUnitsXYZ = triangle.pointsUnitsXYZ[(edgeIndex + 1) % 3]!;
      const projected = [fromUnitsXYZ, toUnitsXYZ].sort((left, right) =>
        left[0] !== right[0]
          ? left[0] < right[0] ? -1 : 1
          : left[2] < right[2] ? -1 : left[2] > right[2] ? 1 : 0,
      );
      const projectedKey =
        `${projected[0]![0]},${projected[0]![2]}|${projected[1]![0]},${projected[1]![2]}`;
      const from = pointUnitsToMeters(fromUnitsXYZ, quantumMeters);
      const to = pointUnitsToMeters(toUnitsXYZ, quantumMeters);
      boundaries.push({
        id: canonicalHashId("route-rejection-source-boundary", {
          kind: "route-rejection-source-boundary-identity",
          schemaVersion: 1,
          sourceTriangleId: triangle.id,
          fromUnitsXYZ,
          toUnitsXYZ,
        }),
        triangle,
        fromUnitsXYZ,
        toUnitsXYZ,
        projectedKey,
        midpointMetersXYZ: [
          quantizeMeters((from[0] + to[0]) / 2, quantumMeters),
          quantizeMeters((from[1] + to[1]) / 2, quantumMeters),
          quantizeMeters((from[2] + to[2]) / 2, quantumMeters),
        ],
      });
    }
  }
  return boundaries.sort((left, right) => compareId(left.id, right.id));
}

function mergeEvidence(evidence: readonly CandidateEvidenceV1[]): readonly CandidateEvidenceV1[] {
  const byKind = new Map<RouteRejectionKindV1, CandidateEvidenceV1[]>();
  for (const row of evidence) {
    const rows = byKind.get(row.reason.kind) ?? [];
    rows.push(row);
    byKind.set(row.reason.kind, rows);
  }
  const merged: CandidateEvidenceV1[] = [];
  for (const kind of REJECTION_KIND_ORDER) {
    const rows = byKind.get(kind);
    if (isNil(rows)) continue;
    const reasons = rows.map((row) => row.reason);
    const terrainEntityId = reasons[0]!.terrainEntityId;
    let reason: RouteRejectionReasonV1;
    switch (kind) {
      case "slope": {
        const typed = reasons as Extract<RouteRejectionReasonV1, { kind: "slope" }>[];
        reason = {
          kind,
          terrainEntityId,
          maximumObservedSlopeDegrees: Math.max(...typed.map((row) => row.maximumObservedSlopeDegrees)),
          maximumAllowedSlopeDegrees: typed[0]!.maximumAllowedSlopeDegrees,
        };
        break;
      }
      case "step": {
        const typed = reasons as Extract<RouteRejectionReasonV1, { kind: "step" }>[];
        reason = {
          kind,
          terrainEntityId,
          maximumObservedStepHeightMeters: Math.max(...typed.map((row) => row.maximumObservedStepHeightMeters)),
          maximumAllowedStepHeightMeters: typed[0]!.maximumAllowedStepHeightMeters,
        };
        break;
      }
      case "width": {
        const typed = reasons as Extract<RouteRejectionReasonV1, { kind: "width" }>[];
        reason = {
          kind,
          terrainEntityId,
          relevantColliderSubshapeIds: [...new Set(typed.flatMap((row) =>
            row.relevantColliderSubshapeIds,
          ))].sort(compareId),
          minimumObservedClearanceWidthMeters: Math.min(...typed.map((row) =>
            row.minimumObservedClearanceWidthMeters,
          )),
          minimumRequiredClearanceWidthMeters: typed[0]!.minimumRequiredClearanceWidthMeters,
        };
        break;
      }
      case "overhead": {
        const typed = reasons as Extract<RouteRejectionReasonV1, { kind: "overhead" }>[];
        reason = {
          kind,
          terrainEntityId,
          relevantColliderSubshapeIds: [...new Set(typed.flatMap((row) =>
            row.relevantColliderSubshapeIds,
          ))].sort(compareId),
          minimumObservedClearanceHeightMeters: Math.min(...typed.map((row) =>
            row.minimumObservedClearanceHeightMeters,
          )),
          minimumRequiredClearanceHeightMeters: typed[0]!.minimumRequiredClearanceHeightMeters,
        };
        break;
      }
      case "gap": {
        const typed = reasons as Extract<RouteRejectionReasonV1, { kind: "gap" }>[];
        reason = {
          kind,
          terrainEntityId,
          maximumObservedSurfaceGapMeters: Math.max(...typed.map((row) => row.maximumObservedSurfaceGapMeters)),
          maximumAllowedSurfaceGapMeters: 0,
        };
        break;
      }
    }
    rows.sort((left, right) =>
      compareVec3(left.witnessMetersXYZ, right.witnessMetersXYZ),
    );
    merged.push({ reason, witnessMetersXYZ: rows[0]!.witnessMetersXYZ });
  }
  return merged;
}

function relatedTraversalSurfaceIdentitiesFromTrianglesV1(
  triangles: readonly SourceTriangleV1[],
): readonly TraversalSurfaceIdentityV1[] | undefined {
  const byTraversalSurfaceId = new Map<string, TraversalSurfaceIdentityV1>();
  for (const triangle of triangles) {
    if (isNil(triangle.traversalSurfaceIdentity)) continue;
    byTraversalSurfaceId.set(
      triangle.traversalSurfaceIdentity.traversalSurfaceId,
      triangle.traversalSurfaceIdentity,
    );
  }
  if (byTraversalSurfaceId.size === 0) return undefined;
  return [...byTraversalSurfaceId.values()].sort((left, right) =>
    compareId(left.traversalSurfaceId, right.traversalSurfaceId),
  );
}

function candidate(
  role: "start" | "adjacency" | "gap" | "destination",
  fromNodeId: string,
  toNodeId: string,
  sourceEvidenceIds: readonly string[],
  evidence: readonly CandidateEvidenceV1[],
  defaultWitnessMetersXYZ: Vec3,
  involvedTriangles: readonly SourceTriangleV1[] = [],
): RouteRejectionCandidateV1 {
  const merged = mergeEvidence(evidence);
  const relatedTraversalSurfaceIdentities =
    relatedTraversalSurfaceIdentitiesFromTrianglesV1(involvedTriangles);
  return {
    id: canonicalHashId("route-rejection-candidate", {
      kind: "route-rejection-candidate-identity",
      schemaVersion: 1,
      role,
      fromNodeId,
      toNodeId,
      sourceEvidenceIds: [...sourceEvidenceIds].sort(compareId),
    }),
    fromNodeId,
    toNodeId,
    failurePositionMetersXYZ: merged[0]?.witnessMetersXYZ ?? defaultWitnessMetersXYZ,
    rejectionReasons: merged.map((row) => row.reason),
    ...(isNil(relatedTraversalSurfaceIdentities)
      ? {}
      : { relatedTraversalSurfaceIdentities }),
  };
}

function evidenceFromRegion(region: RegionEvidenceV1): readonly CandidateEvidenceV1[] {
  return region.reasons.map((reason) => ({
    reason,
    witnessMetersXYZ: region.witnessByKind.get(reason.kind)!,
  }));
}

function sharedBoundaryEvidence(
  source: SourceBoundaryV1,
  target: SourceBoundaryV1,
  receipt: RouteRejectionProofGeometryV1,
): CandidateEvidenceV1 | undefined {
  const quantumMeters = receipt.capabilityEnvelope.positionQuantizationMeters;
  const sourceByProjectedPoint = new Map([
    [projectedPointKey(source.fromUnitsXYZ), source.fromUnitsXYZ],
    [projectedPointKey(source.toUnitsXYZ), source.toUnitsXYZ],
  ]);
  const targetByProjectedPoint = new Map([
    [projectedPointKey(target.fromUnitsXYZ), target.fromUnitsXYZ],
    [projectedPointKey(target.toUnitsXYZ), target.toUnitsXYZ],
  ]);
  const observedUnits = [...sourceByProjectedPoint].reduce((maximum, [key, sourcePoint]) => {
    const targetPoint = targetByProjectedPoint.get(key)!;
    const difference = BigInt(sourcePoint[1]) - BigInt(targetPoint[1]);
    const absolute = difference < 0n ? -difference : difference;
    return Math.max(
      maximum,
      requireSafeInteger(Number(absolute), "step height units"),
    );
  }, 0);
  const observedMeters = unitsToMeters(observedUnits, quantumMeters);
  if (!(observedMeters > receipt.capabilityEnvelope.maxStepHeightMeters)) return undefined;
  return {
    reason: {
      kind: "step",
      terrainEntityId: receipt.terrainEntityId,
      maximumObservedStepHeightMeters: observedMeters,
      maximumAllowedStepHeightMeters: receipt.capabilityEnvelope.maxStepHeightMeters,
    },
    witnessMetersXYZ: [
      source.midpointMetersXYZ[0],
      quantizeMeters(
        (source.midpointMetersXYZ[1] + target.midpointMetersXYZ[1]) / 2,
        quantumMeters,
      ),
      source.midpointMetersXYZ[2],
    ],
  };
}

function routeTangentAt(point: Vec2, routePointsMetersXZ: readonly Vec2[]): Vec2 | undefined {
  let selected: Readonly<{ distance: number; index: number; tangent: Vec2 }> | undefined;
  for (let index = 0; index < routePointsMetersXZ.length - 1; index += 1) {
    const start = routePointsMetersXZ[index]!;
    const end = routePointsMetersXZ[index + 1]!;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (length === 0) continue;
    const row = {
      distance: distancePointToSegment(point, start, end),
      index,
      tangent: [(end[0] - start[0]) / length, (end[1] - start[1]) / length] as Vec2,
    };
    if (
      isNil(selected) ||
      row.distance < selected.distance - GEOMETRY_EPSILON ||
      (Math.abs(row.distance - selected.distance) <= GEOMETRY_EPSILON && row.index < selected.index)
    ) selected = row;
  }
  return selected?.tangent;
}

function compatibleGapPair(
  left: SourceBoundaryV1,
  right: SourceBoundaryV1,
  receipt: RouteRejectionProofGeometryV1,
): GapPairV1 | undefined {
  if (left.triangle.id === right.triangle.id) return undefined;
  const quantumMeters = receipt.capabilityEnvelope.positionQuantizationMeters;
  const leftFrom = pointUnitsToMeters(left.fromUnitsXYZ, quantumMeters);
  const leftTo = pointUnitsToMeters(left.toUnitsXYZ, quantumMeters);
  const rightFrom = pointUnitsToMeters(right.fromUnitsXYZ, quantumMeters);
  const rightTo = pointUnitsToMeters(right.toUnitsXYZ, quantumMeters);
  const leftDirection: Vec2 = [leftTo[0] - leftFrom[0], leftTo[2] - leftFrom[2]];
  const rightDirection: Vec2 = [rightTo[0] - rightFrom[0], rightTo[2] - rightFrom[2]];
  const leftLength = Math.hypot(...leftDirection);
  const rightLength = Math.hypot(...rightDirection);
  if (!(leftLength > 0) || !(rightLength > 0)) return undefined;
  const facingRatio = (
    leftDirection[0] * rightDirection[0] + leftDirection[1] * rightDirection[1]
  ) / (leftLength * rightLength);
  if (facingRatio > -0.999999) return undefined;
  const leftMidpointXZ: Vec2 = [left.midpointMetersXYZ[0], left.midpointMetersXYZ[2]];
  const rightMidpointXZ: Vec2 = [right.midpointMetersXYZ[0], right.midpointMetersXYZ[2]];
  const tangent = routeTangentAt(leftMidpointXZ, receipt.hardRibbon.pointsMetersXZ);
  if (isNil(tangent)) return undefined;
  const edgeTangentRatio = Math.abs(
    leftDirection[0] * tangent[0] + leftDirection[1] * tangent[1]
  ) / leftLength;
  if (edgeTangentRatio > 0.000001) return undefined;
  const connector: Vec2 = [
    rightMidpointXZ[0] - leftMidpointXZ[0],
    rightMidpointXZ[1] - leftMidpointXZ[1],
  ];
  const gapMetersRaw = Math.hypot(...connector);
  const stepHeightMetersRaw = Math.abs(
    left.midpointMetersXYZ[1] - right.midpointMetersXYZ[1],
  );
  const isZeroGapSeam = (
    receipt.includeZeroGapStepPairs === true &&
    !(gapMetersRaw > GEOMETRY_EPSILON)
  );
  if (
    (!isZeroGapSeam && !(gapMetersRaw > GEOMETRY_EPSILON)) ||
    gapMetersRaw > receipt.capabilityEnvelope.maximumEdgeLengthMeters
  ) return undefined;
  if (!isZeroGapSeam) {
    const connectorTangentRatio = Math.abs(
      connector[0] * tangent[0] + connector[1] * tangent[1]
    ) / gapMetersRaw;
    if (connectorTangentRatio < 0.999999) return undefined;
  }
  const ribbon = createHardRibbonProofV1({
    pointsMetersXZ: receipt.hardRibbon.pointsMetersXZ,
    widthMeters: receipt.hardRibbon.widthMeters,
  });
  if (!isSegmentInsideHardRibbonV1(ribbon, leftMidpointXZ, rightMidpointXZ)) return undefined;
  return {
    left,
    right,
    gapMeters: ceilingToQuantum(gapMetersRaw, quantumMeters),
    stepHeightMeters: ceilingToQuantum(stepHeightMetersRaw, quantumMeters),
    witnessMetersXYZ: [
      quantizeMeters((leftMidpointXZ[0] + rightMidpointXZ[0]) / 2, quantumMeters),
      quantizeMeters(
        (left.midpointMetersXYZ[1] + right.midpointMetersXYZ[1]) / 2,
        quantumMeters,
      ),
      quantizeMeters((leftMidpointXZ[1] + rightMidpointXZ[1]) / 2, quantumMeters),
    ],
  };
}

function mutuallyNearestGapPairs(
  boundaries: readonly SourceBoundaryV1[],
  receipt: RouteRejectionProofGeometryV1,
): readonly GapPairV1[] | undefined {
  const options: GapPairV1[] = [];
  let comparisonCount = 0;
  for (let leftIndex = 0; leftIndex < boundaries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boundaries.length; rightIndex += 1) {
      if (comparisonCount === receipt.capabilityEnvelope.maximumSearchSteps) {
        return undefined;
      }
      comparisonCount += 1;
      const row = compatibleGapPair(boundaries[leftIndex]!, boundaries[rightIndex]!, receipt);
      if (!isNil(row)) options.push(row);
    }
  }
  const optionsByBoundaryId = new Map<string, GapPairV1[]>();
  for (const option of options) {
    for (const boundary of [option.left, option.right]) {
      const rows = optionsByBoundaryId.get(boundary.id) ?? [];
      rows.push(option);
      optionsByBoundaryId.set(boundary.id, rows);
    }
  }
  const nearestByBoundaryId = new Map<string, GapPairV1>();
  for (const [boundaryId, rows] of optionsByBoundaryId) {
    rows.sort((left, right) =>
      left.gapMeters !== right.gapMeters
        ? left.gapMeters - right.gapMeters
        : compareId(
            [left.left.id, left.right.id].sort(compareId).join("|"),
            [right.left.id, right.right.id].sort(compareId).join("|"),
          ),
    );
    if (rows.length === 1 || rows[0]!.gapMeters !== rows[1]!.gapMeters) {
      nearestByBoundaryId.set(boundaryId, rows[0]!);
    }
  }
  return options.filter((option) =>
    nearestByBoundaryId.get(option.left.id) === option &&
    nearestByBoundaryId.get(option.right.id) === option,
  ).sort((left, right) => compareId(left.left.id, right.left.id));
}

function proofBudgetExhaustedInput(
  receipt: RouteRejectionProofGeometryV1,
  startNodeId: string,
  destinationNodeId: string,
): EvaluateRouteRejectionProofInputV1 {
  const envelope = receipt.capabilityEnvelope;
  return deepFreeze({
    nodeIds: [startNodeId, destinationNodeId].sort(compareId),
    candidates: [],
    startNodeId,
    destinationNodeId,
    isSourceProjectionConsistent: true,
    isProofBudgetExhausted: true,
    maximumNodes: envelope.maximumNodes,
    maximumEdges: envelope.maximumEdges,
    maximumSearchSteps: envelope.maximumSearchSteps,
    ...(receipt.admitWhenRelaxedKindPresent === true
      ? { admitWhenRelaxedKindPresent: true }
      : {}),
  });
}

function anchorTriangles(
  anchorMetersXYZ: Vec3,
  triangles: readonly SourceTriangleV1[],
  quantumMeters: number,
): readonly SourceTriangleV1[] {
  const anchorUnits = pointToUnits(anchorMetersXYZ, quantumMeters);
  const anchorMetersXZ: Vec2 = [
    unitsToMeters(anchorUnits[0], quantumMeters),
    unitsToMeters(anchorUnits[2], quantumMeters),
  ];
  const containing = triangles.map((triangle) => {
    const projected = triangle.pointsMetersXYZ.map((point) =>
      [point[0], point[2]] as Vec2,
    ) as unknown as readonly [Vec2, Vec2, Vec2];
    if (!pointInTriangleInclusive(anchorMetersXZ, projected)) return undefined;
    const point = pointOnTrianglePlaneMeters(triangle, anchorMetersXZ, quantumMeters);
    return {
      triangle,
      distanceUnits: Math.abs(quantizeToUnits(point[1], quantumMeters) - anchorUnits[1]),
    };
  }).filter((row): row is { triangle: SourceTriangleV1; distanceUnits: number } =>
    !isNil(row),
  );
  const minimumDistance = Math.min(...containing.map((row) => row.distanceUnits));
  return containing
    .filter((row) => row.distanceUnits === minimumDistance)
    .map((row) => row.triangle)
    .sort((left, right) => compareId(left.id, right.id));
}

export function buildSourceDerivedRouteRejectionProofInputV1(
  input: BuildSourceDerivedRouteRejectionProofInputV1,
): EvaluateRouteRejectionProofInputV1 | undefined {
  const receipt = assertRouteBuildInputReceiptV2(input.buildInputReceipt);
  return buildSourceDerivedRouteRejectionProofFromGeometryV1(
    geometryFromHeightfieldReceiptV1(receipt),
    input.isSourceProjectionConsistent,
  );
}

export function buildSourceDerivedRouteRejectionProofInputV2(
  input: BuildSourceDerivedRouteRejectionProofInputV2,
): EvaluateRouteRejectionProofInputV1 | undefined {
  const receipt = assertRouteBuildInputReceiptV2(input.buildInputReceipt);
  return buildSourceDerivedRouteRejectionProofFromGeometryV1(
    geometryFromRouteBuildInputReceiptV2(receipt),
    input.isSourceProjectionConsistent,
  );
}

function buildSourceDerivedRouteRejectionProofFromGeometryV1(
  receipt: RouteRejectionProofGeometryV1,
  isSourceProjectionConsistent: boolean,
): EvaluateRouteRejectionProofInputV1 | undefined {
  if (receipt.terrainKind === "empty" && isEmpty(receipt.boundSurfaces)) {
    return undefined;
  }
  const quantumMeters = receipt.capabilityEnvelope.positionQuantizationMeters;
  const startNodeId = canonicalHashId("route-rejection-node", {
    kind: "route-rejection-node-identity",
    schemaVersion: 1,
    role: "start-anchor",
    anchorEntityId: receipt.startAnchor.entityId,
  });
  const destinationNodeId = canonicalHashId("route-rejection-node", {
    kind: "route-rejection-node-identity",
    schemaVersion: 1,
    role: "destination-anchor",
    anchorEntityId: receipt.destinationAnchor.entityId,
  });
  const boundSurfaces = receipt.boundSurfaces;
  const sourceSoup = receipt.triangleSoup;
  let sourceTriangleCount = 0;
  if (!isNil(boundSurfaces) && !isEmpty(boundSurfaces)) {
    sourceTriangleCount = boundSurfaces.reduce(
      (sum, row) => sum + row.triangleSoup.triangleIndices.length / 3,
      0,
    );
  } else if (isNil(sourceSoup)) {
    return proofBudgetExhaustedInput(receipt, startNodeId, destinationNodeId);
  } else {
    sourceTriangleCount = sourceSoup.triangleIndices.length / 3;
  }
  if (sourceTriangleCount + 2 > receipt.capabilityEnvelope.maximumNodes) {
    return proofBudgetExhaustedInput(receipt, startNodeId, destinationNodeId);
  }
  const source = sourceTriangles(receipt);
  const nodeIds = [
    startNodeId,
    destinationNodeId,
    ...source.triangles.map((triangle) => triangle.nodeId),
  ].sort(compareId);
  const candidates: RouteRejectionCandidateV1[] = [];
  const boundaries = sourceBoundaries(source.triangles, quantumMeters);
  const boundariesByProjectedKey = new Map<string, SourceBoundaryV1[]>();
  for (const boundary of boundaries) {
    const rows = boundariesByProjectedKey.get(boundary.projectedKey) ?? [];
    rows.push(boundary);
    boundariesByProjectedKey.set(boundary.projectedKey, rows);
  }
  let isInternallyConsistent = source.isConsistent;
  const unmatchedBoundaries: SourceBoundaryV1[] = [];
  for (const rows of boundariesByProjectedKey.values()) {
    rows.sort((left, right) => compareId(left.id, right.id));
    if (rows.length === 1) {
      unmatchedBoundaries.push(rows[0]!);
      continue;
    }
    if (rows.length !== 2) {
      isInternallyConsistent = false;
      continue;
    }
    const [left, right] = rows as [SourceBoundaryV1, SourceBoundaryV1];
    for (const [from, to] of [[left, right], [right, left]] as const) {
      const step = sharedBoundaryEvidence(from, to, receipt);
      candidates.push(candidate(
        "adjacency",
        from.triangle.nodeId,
        to.triangle.nodeId,
        [from.id, to.id],
        [
          ...evidenceFromRegion(to.triangle.regionEvidence),
          ...(isNil(step) ? [] : [step]),
        ],
        step?.witnessMetersXYZ ?? from.midpointMetersXYZ,
        [from.triangle, to.triangle],
      ));
      if (candidates.length > receipt.capabilityEnvelope.maximumEdges) {
        return proofBudgetExhaustedInput(receipt, startNodeId, destinationNodeId);
      }
    }
  }

  const gapPairs = mutuallyNearestGapPairs(unmatchedBoundaries, receipt);
  if (isNil(gapPairs)) {
    return proofBudgetExhaustedInput(receipt, startNodeId, destinationNodeId);
  }
  for (const gap of gapPairs) {
    for (const [from, to] of [[gap.left, gap.right], [gap.right, gap.left]] as const) {
      const stepEvidence: CandidateEvidenceV1[] =
        gap.stepHeightMeters > receipt.capabilityEnvelope.maxStepHeightMeters
          ? [{
              reason: {
                kind: "step",
                terrainEntityId: receipt.terrainEntityId,
                maximumObservedStepHeightMeters: gap.stepHeightMeters,
                maximumAllowedStepHeightMeters: receipt.capabilityEnvelope.maxStepHeightMeters,
              },
              witnessMetersXYZ: gap.witnessMetersXYZ,
            }]
          : [];
      const gapEvidence: CandidateEvidenceV1[] =
        gap.gapMeters > 0 && stepEvidence.length === 0
          ? [{
              reason: {
                kind: "gap",
                terrainEntityId: receipt.terrainEntityId,
                maximumObservedSurfaceGapMeters: gap.gapMeters,
                maximumAllowedSurfaceGapMeters: 0,
              },
              witnessMetersXYZ: gap.witnessMetersXYZ,
            }]
          : [];
      candidates.push(candidate(
        "gap",
        from.triangle.nodeId,
        to.triangle.nodeId,
        [from.id, to.id],
        [
          ...evidenceFromRegion(to.triangle.regionEvidence),
          ...stepEvidence,
          ...gapEvidence,
        ],
        gap.witnessMetersXYZ,
        [from.triangle, to.triangle],
      ));
      if (candidates.length > receipt.capabilityEnvelope.maximumEdges) {
        return proofBudgetExhaustedInput(receipt, startNodeId, destinationNodeId);
      }
    }
  }

  const startPosition = pointUnitsToMeters(
    pointToUnits(receipt.startAnchor.positionMetersXYZ, quantumMeters),
    quantumMeters,
  );
  for (const triangle of anchorTriangles(
    receipt.startAnchor.positionMetersXYZ,
    source.triangles,
    quantumMeters,
  )) {
    candidates.push(candidate(
      "start",
      startNodeId,
      triangle.nodeId,
      [receipt.startAnchor.entityId, triangle.id],
      evidenceFromRegion(triangle.regionEvidence),
      startPosition,
      [triangle],
    ));
    if (candidates.length > receipt.capabilityEnvelope.maximumEdges) {
      return proofBudgetExhaustedInput(receipt, startNodeId, destinationNodeId);
    }
  }
  const destinationPosition = pointUnitsToMeters(
    pointToUnits(receipt.destinationAnchor.positionMetersXYZ, quantumMeters),
    quantumMeters,
  );
  for (const triangle of anchorTriangles(
    receipt.destinationAnchor.positionMetersXYZ,
    source.triangles,
    quantumMeters,
  )) {
    candidates.push(candidate(
      "destination",
      triangle.nodeId,
      destinationNodeId,
      [triangle.id, receipt.destinationAnchor.entityId],
      [],
      destinationPosition,
      [triangle],
    ));
    if (candidates.length > receipt.capabilityEnvelope.maximumEdges) {
      return proofBudgetExhaustedInput(receipt, startNodeId, destinationNodeId);
    }
  }

  candidates.sort((left, right) => compareId(left.id, right.id));
  const candidateIds = new Set<string>();
  for (const row of candidates) {
    if (candidateIds.has(row.id)) isInternallyConsistent = false;
    candidateIds.add(row.id);
  }
  return deepFreeze({
    nodeIds,
    candidates,
    startNodeId,
    destinationNodeId,
    isSourceProjectionConsistent:
      isSourceProjectionConsistent && isInternallyConsistent,
    isProofBudgetExhausted: false,
    maximumNodes: receipt.capabilityEnvelope.maximumNodes,
    maximumEdges: receipt.capabilityEnvelope.maximumEdges,
    maximumSearchSteps: receipt.capabilityEnvelope.maximumSearchSteps,
    ...(receipt.admitWhenRelaxedKindPresent === true
      ? { admitWhenRelaxedKindPresent: true }
      : {}),
  });
}
