import { isNil } from "lodash-es";

export const TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1 = 0.00001;
export const TRAVERSAL_SURFACE_QUERY_AREA_EPSILON_SQUARE_METERS_V1 = 1e-10;
export const TRAVERSAL_SURFACE_QUERY_HEIGHT_EPSILON_METERS_V1 = 0.00001;

export type TriangleVertexMetersXYZV1 = readonly [number, number, number];
export type TrianglePointMetersXZV1 = readonly [number, number];

export interface WorldTriangleGeometryV1 {
  readonly verticesMetersXYZ: readonly [
    TriangleVertexMetersXYZV1,
    TriangleVertexMetersXYZV1,
    TriangleVertexMetersXYZV1,
  ];
  readonly unitNormalXYZ: readonly [number, number, number];
  readonly threeDimensionalAreaSquareMeters: number;
  readonly projectedAreaSquareMeters: number;
  readonly aabbMinimumMetersXZ: readonly [number, number];
  readonly aabbMaximumMetersXZ: readonly [number, number];
}

export interface TriangleWorldPointSampleV1 {
  readonly barycentricUVW: readonly [number, number, number];
  readonly heightMeters: number;
  readonly inwardEdgeDistancesMeters: readonly [number, number, number];
}

export type TriangleXZLocationV1 = "interior" | "boundary-only" | "outside";

export interface TriangleXZOverlapV1 {
  readonly kind: "interior-overlap" | "boundary-only" | "disjoint";
  readonly intersectionPolygonMetersXZ: readonly (readonly [number, number])[];
  readonly intersectionAreaSquareMeters: number;
}

const BARYCENTRIC_FACADE_TOLERANCE = 1e-12;

export function describeWorldTriangleV1(
  aMetersXYZ: TriangleVertexMetersXYZV1,
  bMetersXYZ: TriangleVertexMetersXYZV1,
  cMetersXYZ: TriangleVertexMetersXYZV1,
): WorldTriangleGeometryV1 | undefined {
  const edgeAX = bMetersXYZ[0] - aMetersXYZ[0];
  const edgeAY = bMetersXYZ[1] - aMetersXYZ[1];
  const edgeAZ = bMetersXYZ[2] - aMetersXYZ[2];
  const edgeBX = cMetersXYZ[0] - aMetersXYZ[0];
  const edgeBY = cMetersXYZ[1] - aMetersXYZ[1];
  const edgeBZ = cMetersXYZ[2] - aMetersXYZ[2];
  const normalX = edgeAY * edgeBZ - edgeAZ * edgeBY;
  const normalY = edgeAZ * edgeBX - edgeAX * edgeBZ;
  const normalZ = edgeAX * edgeBY - edgeAY * edgeBX;
  const normalLength = Math.hypot(normalX, normalY, normalZ);
  if (!(normalLength > 0)) {
    return undefined;
  }
  const projectedTwiceArea =
    (bMetersXYZ[0] - aMetersXYZ[0]) * (cMetersXYZ[2] - aMetersXYZ[2]) -
    (bMetersXYZ[2] - aMetersXYZ[2]) * (cMetersXYZ[0] - aMetersXYZ[0]);
  return {
    verticesMetersXYZ: [aMetersXYZ, bMetersXYZ, cMetersXYZ],
    unitNormalXYZ: [
      normalX / normalLength,
      normalY / normalLength,
      normalZ / normalLength,
    ],
    threeDimensionalAreaSquareMeters: normalLength / 2,
    projectedAreaSquareMeters: Math.abs(projectedTwiceArea) / 2,
    aabbMinimumMetersXZ: [
      Math.min(aMetersXYZ[0], bMetersXYZ[0], cMetersXYZ[0]),
      Math.min(aMetersXYZ[2], bMetersXYZ[2], cMetersXYZ[2]),
    ],
    aabbMaximumMetersXZ: [
      Math.max(aMetersXYZ[0], bMetersXYZ[0], cMetersXYZ[0]),
      Math.max(aMetersXYZ[2], bMetersXYZ[2], cMetersXYZ[2]),
    ],
  };
}

export function samplePointOnWorldTriangleV1(
  triangle: WorldTriangleGeometryV1,
  pointMetersXZ: TrianglePointMetersXZV1,
): TriangleWorldPointSampleV1 | undefined {
  if (
    triangle.projectedAreaSquareMeters <
    TRAVERSAL_SURFACE_QUERY_AREA_EPSILON_SQUARE_METERS_V1
  ) {
    return undefined;
  }
  const [aMetersXYZ, bMetersXYZ, cMetersXYZ] = triangle.verticesMetersXYZ;
  const [pointX, pointZ] = pointMetersXZ;
  const denominator =
    (bMetersXYZ[2] - cMetersXYZ[2]) * (aMetersXYZ[0] - cMetersXYZ[0]) +
    (cMetersXYZ[0] - bMetersXYZ[0]) * (aMetersXYZ[2] - cMetersXYZ[2]);
  if (Math.abs(denominator) <= Number.EPSILON) {
    return undefined;
  }
  const weightA =
    ((bMetersXYZ[2] - cMetersXYZ[2]) * (pointX - cMetersXYZ[0]) +
      (cMetersXYZ[0] - bMetersXYZ[0]) * (pointZ - cMetersXYZ[2])) /
    denominator;
  const weightB =
    ((cMetersXYZ[2] - aMetersXYZ[2]) * (pointX - cMetersXYZ[0]) +
      (aMetersXYZ[0] - cMetersXYZ[0]) * (pointZ - cMetersXYZ[2])) /
    denominator;
  const weightC = 1 - weightA - weightB;
  return {
    barycentricUVW: [weightA, weightB, weightC],
    heightMeters:
      aMetersXYZ[1] * weightA +
      bMetersXYZ[1] * weightB +
      cMetersXYZ[1] * weightC,
    inwardEdgeDistancesMeters: [
      inwardEdgeDistanceMeters(aMetersXYZ, bMetersXYZ, cMetersXYZ, pointX, pointZ),
      inwardEdgeDistanceMeters(bMetersXYZ, cMetersXYZ, aMetersXYZ, pointX, pointZ),
      inwardEdgeDistanceMeters(cMetersXYZ, aMetersXYZ, bMetersXYZ, pointX, pointZ),
    ],
  };
}

export function classifyTriangleXZLocationV1(
  inwardEdgeDistancesMeters: readonly [number, number, number],
): TriangleXZLocationV1 {
  const epsilon = TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1;
  const [distanceAB, distanceBC, distanceCA] = inwardEdgeDistancesMeters;
  if (distanceAB < -epsilon || distanceBC < -epsilon || distanceCA < -epsilon) {
    return "outside";
  }
  if (distanceAB > epsilon && distanceBC > epsilon && distanceCA > epsilon) {
    return "interior";
  }
  return "boundary-only";
}

export function isBarycentricInsideFacadeV1(
  barycentricUVW: readonly [number, number, number],
): boolean {
  return (
    barycentricUVW[0] >= -BARYCENTRIC_FACADE_TOLERANCE &&
    barycentricUVW[1] >= -BARYCENTRIC_FACADE_TOLERANCE &&
    barycentricUVW[2] >= -BARYCENTRIC_FACADE_TOLERANCE
  );
}

export function aabbOverlapsInclusiveXZV1(
  firstMinimumMetersXZ: readonly [number, number],
  firstMaximumMetersXZ: readonly [number, number],
  secondMinimumMetersXZ: readonly [number, number],
  secondMaximumMetersXZ: readonly [number, number],
): boolean {
  return (
    firstMinimumMetersXZ[0] <= secondMaximumMetersXZ[0] &&
    firstMaximumMetersXZ[0] >= secondMinimumMetersXZ[0] &&
    firstMinimumMetersXZ[1] <= secondMaximumMetersXZ[1] &&
    firstMaximumMetersXZ[1] >= secondMinimumMetersXZ[1]
  );
}

export function interpolatePlaneHeightMetersV1(
  triangle: WorldTriangleGeometryV1,
  pointMetersXZ: TrianglePointMetersXZV1,
): number | undefined {
  const sample = samplePointOnWorldTriangleV1(triangle, pointMetersXZ);
  if (isNil(sample)) {
    return undefined;
  }
  return sample.heightMeters;
}

export function classifyProjectedTriangleOverlapV1(
  first: WorldTriangleGeometryV1,
  second: WorldTriangleGeometryV1,
): TriangleXZOverlapV1 {
  const firstPolygon = projectedPolygon(first);
  const secondPolygon = projectedPolygon(second);
  const clipped = clipPolygonByTriangle(firstPolygon, secondPolygon);
  const intersectionAreaSquareMeters = polygonAreaSquareMeters(clipped);
  if (
    intersectionAreaSquareMeters >
    TRAVERSAL_SURFACE_QUERY_AREA_EPSILON_SQUARE_METERS_V1
  ) {
    return {
      kind: "interior-overlap",
      intersectionPolygonMetersXZ: clipped,
      intersectionAreaSquareMeters,
    };
  }
  const minimumDistanceMeters = minimumPolygonDistanceMeters(
    firstPolygon,
    secondPolygon,
  );
  if (minimumDistanceMeters <= TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1) {
    const contactPolygon =
      clipped.length >= 1
        ? clipped
        : contactPoints(firstPolygon, secondPolygon);
    return {
      kind: "boundary-only",
      intersectionPolygonMetersXZ: contactPolygon,
      intersectionAreaSquareMeters,
    };
  }
  return {
    kind: "disjoint",
    intersectionPolygonMetersXZ: [],
    intersectionAreaSquareMeters: 0,
  };
}

export function minimumAbsoluteAffineHeightSeparationMetersV1(
  first: WorldTriangleGeometryV1,
  second: WorldTriangleGeometryV1,
  polygonMetersXZ: readonly (readonly [number, number])[],
): number {
  if (polygonMetersXZ.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let minimumSigned = Number.POSITIVE_INFINITY;
  let maximumSigned = Number.NEGATIVE_INFINITY;
  for (const pointMetersXZ of polygonMetersXZ) {
    const firstHeight = interpolatePlaneHeightMetersV1(first, pointMetersXZ);
    const secondHeight = interpolatePlaneHeightMetersV1(second, pointMetersXZ);
    if (isNil(firstHeight) || isNil(secondHeight)) {
      continue;
    }
    const signed = firstHeight - secondHeight;
    if (signed < minimumSigned) {
      minimumSigned = signed;
    }
    if (signed > maximumSigned) {
      maximumSigned = signed;
    }
  }
  if (!Number.isFinite(minimumSigned) || !Number.isFinite(maximumSigned)) {
    return Number.POSITIVE_INFINITY;
  }
  if (minimumSigned <= 0 && maximumSigned >= 0) {
    return 0;
  }
  return Math.min(Math.abs(minimumSigned), Math.abs(maximumSigned));
}

export function firstCoordinateOrderedPointXZV1(
  pointsMetersXZ: readonly (readonly [number, number])[],
): readonly [number, number] | undefined {
  if (pointsMetersXZ.length === 0) {
    return undefined;
  }
  let chosen = pointsMetersXZ[0]!;
  for (const point of pointsMetersXZ) {
    if (
      point[0] < chosen[0] ||
      (point[0] === chosen[0] && point[1] < chosen[1])
    ) {
      chosen = point;
    }
  }
  return chosen;
}

function inwardEdgeDistanceMeters(
  startMetersXYZ: TriangleVertexMetersXYZV1,
  endMetersXYZ: TriangleVertexMetersXYZV1,
  thirdMetersXYZ: TriangleVertexMetersXYZV1,
  pointX: number,
  pointZ: number,
): number {
  const edgeX = endMetersXYZ[0] - startMetersXYZ[0];
  const edgeZ = endMetersXYZ[2] - startMetersXYZ[2];
  const edgeLength = Math.hypot(edgeX, edgeZ);
  if (!(edgeLength > 0)) {
    return Number.NEGATIVE_INFINITY;
  }
  const crossPoint =
    edgeX * (pointZ - startMetersXYZ[2]) - edgeZ * (pointX - startMetersXYZ[0]);
  const crossThird =
    edgeX * (thirdMetersXYZ[2] - startMetersXYZ[2]) -
    edgeZ * (thirdMetersXYZ[0] - startMetersXYZ[0]);
  const signedDistance = crossPoint / edgeLength;
  return crossThird < 0 ? -signedDistance : signedDistance;
}

function projectedPolygon(
  triangle: WorldTriangleGeometryV1,
): readonly (readonly [number, number])[] {
  const [aMetersXYZ, bMetersXYZ, cMetersXYZ] = triangle.verticesMetersXYZ;
  const polygon: Array<readonly [number, number]> = [
    [aMetersXYZ[0], aMetersXYZ[2]],
    [bMetersXYZ[0], bMetersXYZ[2]],
    [cMetersXYZ[0], cMetersXYZ[2]],
  ];
  return polygonAreaTwice(polygon) < 0
    ? [polygon[0]!, polygon[2]!, polygon[1]!]
    : polygon;
}

function clipPolygonByTriangle(
  subject: readonly (readonly [number, number])[],
  clip: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] {
  let output: Array<readonly [number, number]> = [...subject];
  for (let edgeIndex = 0; edgeIndex < clip.length; edgeIndex += 1) {
    const clipStart = clip[edgeIndex]!;
    const clipEnd = clip[(edgeIndex + 1) % clip.length]!;
    const input = output;
    output = [];
    if (input.length === 0) {
      return [];
    }
    let previous = input[input.length - 1]!;
    let previousInside = isInsideEdge(previous, clipStart, clipEnd);
    for (const current of input) {
      const currentInside = isInsideEdge(current, clipStart, clipEnd);
      if (currentInside) {
        if (!previousInside) {
          const intersection = edgeIntersection(
            previous,
            current,
            clipStart,
            clipEnd,
          );
          if (!isNil(intersection)) {
            output.push(intersection);
          }
        }
        output.push(current);
      } else if (previousInside) {
        const intersection = edgeIntersection(
          previous,
          current,
          clipStart,
          clipEnd,
        );
        if (!isNil(intersection)) {
          output.push(intersection);
        }
      }
      previous = current;
      previousInside = currentInside;
    }
  }
  return deduplicatePoints(output);
}

function isInsideEdge(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): boolean {
  const edgeLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
  return (
    cross2(start, end, point) >=
    -TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1 * edgeLength
  );
}

function edgeIntersection(
  firstStart: readonly [number, number],
  firstEnd: readonly [number, number],
  secondStart: readonly [number, number],
  secondEnd: readonly [number, number],
): readonly [number, number] | undefined {
  const deltaFirstX = firstEnd[0] - firstStart[0];
  const deltaFirstZ = firstEnd[1] - firstStart[1];
  const deltaSecondX = secondEnd[0] - secondStart[0];
  const deltaSecondZ = secondEnd[1] - secondStart[1];
  const denominator = deltaFirstX * deltaSecondZ - deltaFirstZ * deltaSecondX;
  if (Math.abs(denominator) <= Number.EPSILON) {
    return undefined;
  }
  const parameter =
    ((secondStart[0] - firstStart[0]) * deltaSecondZ -
      (secondStart[1] - firstStart[1]) * deltaSecondX) /
    denominator;
  return [
    firstStart[0] + parameter * deltaFirstX,
    firstStart[1] + parameter * deltaFirstZ,
  ];
}

function polygonAreaSquareMeters(
  polygon: readonly (readonly [number, number])[],
): number {
  return Math.abs(polygonAreaTwice(polygon)) / 2;
}

function polygonAreaTwice(
  polygon: readonly (readonly [number, number])[],
): number {
  if (polygon.length < 3) {
    return 0;
  }
  let twiceArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea;
}

function minimumPolygonDistanceMeters(
  first: readonly (readonly [number, number])[],
  second: readonly (readonly [number, number])[],
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const point of first) {
    if (isInsidePolygon(point, second)) {
      return 0;
    }
    minimum = Math.min(minimum, distancePointToPolygonBoundary(point, second));
  }
  for (const point of second) {
    if (isInsidePolygon(point, first)) {
      return 0;
    }
    minimum = Math.min(minimum, distancePointToPolygonBoundary(point, first));
  }
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex]!;
    const firstEnd = first[(firstIndex + 1) % first.length]!;
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondStart = second[secondIndex]!;
      const secondEnd = second[(secondIndex + 1) % second.length]!;
      minimum = Math.min(
        minimum,
        segmentDistanceMeters(firstStart, firstEnd, secondStart, secondEnd),
      );
    }
  }
  return minimum;
}

function contactPoints(
  first: readonly (readonly [number, number])[],
  second: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] {
  const points: Array<readonly [number, number]> = [];
  for (const point of first) {
    if (
      distancePointToPolygonBoundary(point, second) <=
      TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1
    ) {
      points.push(point);
    }
  }
  for (const point of second) {
    if (
      distancePointToPolygonBoundary(point, first) <=
      TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1
    ) {
      points.push(point);
    }
  }
  return deduplicatePoints(points);
}

function distancePointToPolygonBoundary(
  point: readonly [number, number],
  polygon: readonly (readonly [number, number])[],
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    minimum = Math.min(
      minimum,
      distancePointToSegment(
        point,
        polygon[index]!,
        polygon[(index + 1) % polygon.length]!,
      ),
    );
  }
  return minimum;
}

function isInsidePolygon(
  point: readonly [number, number],
  polygon: readonly (readonly [number, number])[],
): boolean {
  if (polygon.length < 3) {
    return false;
  }
  for (let index = 0; index < polygon.length; index += 1) {
    if (
      cross2(polygon[index]!, polygon[(index + 1) % polygon.length]!, point) <
      -TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1
    ) {
      return false;
    }
  }
  return true;
}

function segmentDistanceMeters(
  firstStart: readonly [number, number],
  firstEnd: readonly [number, number],
  secondStart: readonly [number, number],
  secondEnd: readonly [number, number],
): number {
  if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
    return 0;
  }
  return Math.min(
    distancePointToSegment(firstStart, secondStart, secondEnd),
    distancePointToSegment(firstEnd, secondStart, secondEnd),
    distancePointToSegment(secondStart, firstStart, firstEnd),
    distancePointToSegment(secondEnd, firstStart, firstEnd),
  );
}

function segmentsIntersect(
  aStart: readonly [number, number],
  aEnd: readonly [number, number],
  bStart: readonly [number, number],
  bEnd: readonly [number, number],
): boolean {
  const d1 = cross2(aStart, aEnd, bStart);
  const d2 = cross2(aStart, aEnd, bEnd);
  const d3 = cross2(bStart, bEnd, aStart);
  const d4 = cross2(bStart, bEnd, aEnd);
  return d1 * d2 <= 0 && d3 * d4 <= 0;
}

function distancePointToSegment(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): number {
  const edgeX = end[0] - start[0];
  const edgeZ = end[1] - start[1];
  const squaredLength = edgeX * edgeX + edgeZ * edgeZ;
  if (squaredLength === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  const parameter = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * edgeX + (point[1] - start[1]) * edgeZ) /
        squaredLength,
    ),
  );
  return Math.hypot(
    point[0] - (start[0] + parameter * edgeX),
    point[1] - (start[1] + parameter * edgeZ),
  );
}

function cross2(
  origin: readonly [number, number],
  first: readonly [number, number],
  second: readonly [number, number],
): number {
  return (
    (first[0] - origin[0]) * (second[1] - origin[1]) -
    (first[1] - origin[1]) * (second[0] - origin[0])
  );
}

function deduplicatePoints(
  points: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] {
  const unique: Array<readonly [number, number]> = [];
  for (const point of points) {
    const exists = unique.some(
      (candidate) =>
        Math.abs(candidate[0] - point[0]) <=
          TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1 &&
        Math.abs(candidate[1] - point[1]) <=
          TRAVERSAL_SURFACE_QUERY_XZ_EPSILON_METERS_V1,
    );
    if (!exists) {
      unique.push(point);
    }
  }
  return unique;
}
