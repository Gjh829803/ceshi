import { isNil } from "lodash-es";

import { orientXZV1 } from "./orientation-xz.js";

export type SimplePolygonXZValidationIssueCodeV1 =
  | "point-count-invalid"
  | "coordinate-invalid"
  | "zero-length-edge"
  | "duplicate-vertex"
  | "self-intersection"
  | "collinear-overlap"
  | "zero-area";

export type SimplePolygonXZValidationResultV1 =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      issueCode: SimplePolygonXZValidationIssueCodeV1;
    }>;

export const TRAVERSAL_AREA_COMPLEXITY_LIMITS_V1 = Object.freeze({
  maximumAreaCount: 64,
  maximumPointsPerArea: 128,
  maximumTotalPointCount: 2_048,
  maximumTrianglePointTestCount: 4_000_000,
});

export type TraversalAreaComplexityIssueCodeV1 =
  | "area-count-exceeded"
  | "points-per-area-exceeded"
  | "total-point-count-exceeded"
  | "operation-budget-exceeded";

export type TraversalAreaComplexityValidationResultV1 =
  | Readonly<{
      ok: true;
      totalPointCount: number;
      estimatedTrianglePointTestCount: number;
    }>
  | Readonly<{
      ok: false;
      issueCode: TraversalAreaComplexityIssueCodeV1;
      areaIndex?: number;
      actualCount: number;
      maximumCount: number;
    }>;

export function validateTraversalAreaComplexityV1(input: Readonly<{
  pointCountsByArea: readonly number[];
  sourceTriangleCount?: number;
}>): TraversalAreaComplexityValidationResultV1 {
  const limits = TRAVERSAL_AREA_COMPLEXITY_LIMITS_V1;
  if (input.pointCountsByArea.length > limits.maximumAreaCount) {
    return {
      ok: false,
      issueCode: "area-count-exceeded",
      actualCount: input.pointCountsByArea.length,
      maximumCount: limits.maximumAreaCount,
    };
  }
  let totalPointCount = 0;
  for (const [areaIndex, pointCount] of input.pointCountsByArea.entries()) {
    if (!Number.isSafeInteger(pointCount) || pointCount < 0) {
      return {
        ok: false,
        issueCode: "points-per-area-exceeded",
        areaIndex,
        actualCount: pointCount,
        maximumCount: limits.maximumPointsPerArea,
      };
    }
    if (pointCount > limits.maximumPointsPerArea) {
      return {
        ok: false,
        issueCode: "points-per-area-exceeded",
        areaIndex,
        actualCount: pointCount,
        maximumCount: limits.maximumPointsPerArea,
      };
    }
    totalPointCount += pointCount;
  }
  if (totalPointCount > limits.maximumTotalPointCount) {
    return {
      ok: false,
      issueCode: "total-point-count-exceeded",
      actualCount: totalPointCount,
      maximumCount: limits.maximumTotalPointCount,
    };
  }
  const sourceTriangleCount = isNil(input.sourceTriangleCount)
    ? 0
    : input.sourceTriangleCount;
  if (!Number.isSafeInteger(sourceTriangleCount) || sourceTriangleCount < 0) {
    return {
      ok: false,
      issueCode: "operation-budget-exceeded",
      actualCount: sourceTriangleCount,
      maximumCount: limits.maximumTrianglePointTestCount,
    };
  }
  const estimatedTrianglePointTestCount = totalPointCount * sourceTriangleCount;
  if (
    !Number.isSafeInteger(estimatedTrianglePointTestCount) ||
    estimatedTrianglePointTestCount > limits.maximumTrianglePointTestCount
  ) {
    return {
      ok: false,
      issueCode: "operation-budget-exceeded",
      actualCount: estimatedTrianglePointTestCount,
      maximumCount: limits.maximumTrianglePointTestCount,
    };
  }
  return { ok: true, totalPointCount, estimatedTrianglePointTestCount };
}

type Vec2 = readonly [number, number];
type SegmentRelation = "none" | "point" | "collinear-overlap";

function samePoint(left: Vec2, right: Vec2): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function cross(a: Vec2, b: Vec2, c: Vec2): number {
  return orientXZV1(a, b, c);
}

function isBetweenInclusive(value: number, first: number, second: number): boolean {
  return value >= Math.min(first, second) && value <= Math.max(first, second);
}

function isPointOnSegment(point: Vec2, start: Vec2, end: Vec2): boolean {
  return cross(start, end, point) === 0 &&
    isBetweenInclusive(point[0], start[0], end[0]) &&
    isBetweenInclusive(point[1], start[1], end[1]);
}

function collinearOverlapLength(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  const useX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const [a0, b0, c0, d0] = useX
    ? [a[0], b[0], c[0], d[0]]
    : [a[1], b[1], c[1], d[1]];
  return Math.min(Math.max(a0, b0), Math.max(c0, d0)) -
    Math.max(Math.min(a0, b0), Math.min(c0, d0));
}

function segmentRelation(a: Vec2, b: Vec2, c: Vec2, d: Vec2): SegmentRelation {
  const abc = cross(a, b, c);
  const abd = cross(a, b, d);
  const cda = cross(c, d, a);
  const cdb = cross(c, d, b);
  if (![abc, abd, cda, cdb].every(Number.isFinite)) return "point";
  if (abc === 0 && abd === 0 && cda === 0 && cdb === 0) {
    const overlapLength = collinearOverlapLength(a, b, c, d);
    if (overlapLength > 0) return "collinear-overlap";
    return overlapLength === 0 ? "point" : "none";
  }
  if (
    (abc === 0 && isPointOnSegment(c, a, b)) ||
    (abd === 0 && isPointOnSegment(d, a, b)) ||
    (cda === 0 && isPointOnSegment(a, c, d)) ||
    (cdb === 0 && isPointOnSegment(b, c, d)) ||
    ((abc > 0) !== (abd > 0) && (cda > 0) !== (cdb > 0))
  ) return "point";
  return "none";
}

/** Validates a finite, open-ring, simple polygon in the canonical XZ plane. */
export function validateSimplePolygonXZV1(
  value: unknown,
): SimplePolygonXZValidationResultV1 {
  if (!Array.isArray(value) || value.length < 3) {
    return { ok: false, issueCode: "point-count-invalid" };
  }
  const points: Vec2[] = [];
  for (const point of value) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1])
    ) return { ok: false, issueCode: "coordinate-invalid" };
    points.push([point[0] as number, point[1] as number]);
  }

  for (let index = 0; index < points.length; index += 1) {
    if (samePoint(points[index]!, points[(index + 1) % points.length]!)) {
      return { ok: false, issueCode: "zero-length-edge" };
    }
  }
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      if (samePoint(points[first]!, points[second]!)) {
        return { ok: false, issueCode: "duplicate-vertex" };
      }
    }
  }

  for (let first = 0; first < points.length; first += 1) {
    const firstEnd = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondEnd = (second + 1) % points.length;
      const relation = segmentRelation(
        points[first]!,
        points[firstEnd]!,
        points[second]!,
        points[secondEnd]!,
      );
      if (relation === "collinear-overlap") {
        return { ok: false, issueCode: "collinear-overlap" };
      }
      const isAdjacent = firstEnd === second || secondEnd === first;
      if (!isAdjacent && relation !== "none") {
        return { ok: false, issueCode: "self-intersection" };
      }
    }
  }

  const origin = points[0]!;
  let twiceArea = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]!;
    const next = points[index + 1]!;
    twiceArea += orientXZV1(origin, point, next);
  }
  if (!Number.isFinite(twiceArea)) {
    return { ok: false, issueCode: "coordinate-invalid" };
  }
  if (twiceArea === 0) return { ok: false, issueCode: "zero-area" };
  return { ok: true };
}
