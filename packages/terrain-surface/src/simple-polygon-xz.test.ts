import { describe, expect, it } from "vitest";

import {
  TRAVERSAL_AREA_COMPLEXITY_LIMITS_V1,
  validateSimplePolygonXZV1,
  validateTraversalAreaComplexityV1,
} from "./simple-polygon-xz.js";

describe("validateSimplePolygonXZV1", () => {
  it.each([
    ["self-intersection", [[0, 0], [3, 0], [0, 2], [2, 2]]],
    ["zero-length-edge", [[0, 0], [2, 0], [2, 0], [0, 2]]],
    ["duplicate-vertex", [[0, 0], [2, 0], [2, 2], [0, 2], [2, 0]]],
    ["collinear-overlap", [[0, 0], [3, 0], [1, 0], [1, 2], [0, 2]]],
  ] as const)("rejects %s polygons", (issueCode, pointsMetersXZ) => {
    expect(validateSimplePolygonXZV1(pointsMetersXZ)).toEqual({
      ok: false,
      issueCode,
    });
  });

  it("rejects a zero-area polygon even when a stronger degeneracy applies", () => {
    expect(validateSimplePolygonXZV1([[0, 0], [1, 0], [2, 0]]).ok).toBe(false);
  });

  it("accepts a finite simple concave polygon", () => {
    expect(validateSimplePolygonXZV1([
      [0, 0], [3, 0], [3, 3], [1.5, 1], [0, 3],
    ])).toEqual({ ok: true });
  });

  it.each([
    ["forward", [
      [100_000_000, 100_000_000],
      [100_000_001, 100_000_000],
      [100_000_001, 100_000_001],
      [100_000_000, 100_000_001],
    ]],
    ["reversed", [
      [100_000_000, 100_000_001],
      [100_000_001, 100_000_001],
      [100_000_001, 100_000_000],
      [100_000_000, 100_000_000],
    ]],
  ] as const)("keeps a translated one-meter polygon valid in %s order", (_order, pointsMetersXZ) => {
    expect(validateSimplePolygonXZV1(pointsMetersXZ)).toEqual({ ok: true });
  });

  it("rejects a GeoJSON-style closed ring at the canonical open-ring boundary", () => {
    expect(validateSimplePolygonXZV1([
      [0, 0], [2, 0], [2, 2], [0, 2], [0, 0],
    ])).toEqual({
      ok: false,
      issueCode: "zero-length-edge",
    });
  });

  it("freezes collection and triangle-point operation limits", () => {
    expect(TRAVERSAL_AREA_COMPLEXITY_LIMITS_V1).toEqual({
      maximumAreaCount: 64,
      maximumPointsPerArea: 128,
      maximumTotalPointCount: 2_048,
      maximumTrianglePointTestCount: 4_000_000,
    });
    expect(validateTraversalAreaComplexityV1({
      pointCountsByArea: Array.from({ length: 16 }, () => 128),
      sourceTriangleCount: 1_953,
    })).toEqual({
      ok: true,
      totalPointCount: 2_048,
      estimatedTrianglePointTestCount: 3_999_744,
    });
    expect(validateTraversalAreaComplexityV1({
      pointCountsByArea: Array.from({ length: 16 }, () => 128),
      sourceTriangleCount: 1_954,
    })).toMatchObject({
      ok: false,
      issueCode: "operation-budget-exceeded",
      actualCount: 4_001_792,
      maximumCount: 4_000_000,
    });
  });
});
