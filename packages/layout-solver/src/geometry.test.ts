import { describe, expect, it } from "vitest";

import {
  aabbOverlapDepthMetersXYZ,
  aabbSeparationMeters,
  pointInPolygonXZ,
  pointToPolygonBoundaryDistanceMeters,
  projectToScreenUv,
  quantizeFinite,
  sampleHeightfieldV1,
  sampleRoutePolylineV1,
  validatePolygonXZ,
  type LayoutHeightfieldV1,
} from "./index.js";

const SQUARE = [
  [-2, -2],
  [2, -2],
  [2, 2],
  [-2, 2],
] as const;

describe("engine-neutral layout geometry", () => {
  it("evaluates polygon containment and boundary distance", () => {
    expect(validatePolygonXZ(SQUARE)).toBeUndefined();
    expect(pointInPolygonXZ([0, 0], SQUARE)).toBe(true);
    expect(pointInPolygonXZ([2, 0], SQUARE)).toBe(true);
    expect(pointInPolygonXZ([3, 0], SQUARE)).toBe(false);
    expect(pointToPolygonBoundaryDistanceMeters([0, 0], SQUARE)).toBe(2);
    expect(pointToPolygonBoundaryDistanceMeters([3, 0], SQUARE)).toBe(1);
    expect(validatePolygonXZ([[0, 0], [1, 1], [2, 2]])).toBe(
      "LAYOUT_POLYGON_DEGENERATE",
    );
  });

  // Adapted to WorldKit's open-ring meter-based XZ contract from Turf's
  // boolean-point-in-polygon concavity and boundary regression matrix:
  // https://github.com/Turfjs/turf/blob/98b9a4ed270148fda73dda48b7fd1f7c8b6f88e0/packages/turf-boolean-point-in-polygon/test.ts
  it("keeps concave exclusions separate from inclusive edge and vertex hits", () => {
    const concave = [
      [0, 0],
      [5, 5],
      [0, 10],
      [10, 10],
      [10, 0],
    ] as const;

    expect(pointInPolygonXZ([7.5, 7.5], concave)).toBe(true);
    expect(pointInPolygonXZ([2.5, 5], concave)).toBe(false);
    expect(pointInPolygonXZ([0, 0], concave)).toBe(true);
    expect(pointInPolygonXZ([2.5, 2.5], concave)).toBe(true);
    expect(pointInPolygonXZ([5, 10], concave)).toBe(true);
  });

  // Regression shape derived from Turf's historical turf-inside issue #15.
  it("classifies an interior point beside a long irregular edge", () => {
    const irregular = [
      [5.080336744095521, 67.89398938540765],
      [0.35070899909145403, 69.32470003971179],
      [-24.453622256504122, 41.146696777884564],
      [-21.6445524714804, 40.43225902006474],
    ] as const;

    expect(pointInPolygonXZ([-9.9964077, 53.8040989], irregular)).toBe(true);
  });

  it("measures AABB separation and overlap without treating overlap as clearance", () => {
    const left = {
      minimumMetersXYZ: [0, 0, 0],
      maximumMetersXYZ: [1, 1, 1],
    } as const;
    const right = {
      minimumMetersXYZ: [2, 0, 0],
      maximumMetersXYZ: [3, 1, 1],
    } as const;
    const overlapping = {
      minimumMetersXYZ: [0.75, 0.25, 0.25],
      maximumMetersXYZ: [1.25, 0.75, 0.75],
    } as const;

    expect(aabbSeparationMeters(left, right)).toBe(1);
    expect(aabbOverlapDepthMetersXYZ(left, right)).toBeUndefined();
    expect(aabbSeparationMeters(left, overlapping)).toBe(0);
    expect(aabbOverlapDepthMetersXYZ(left, overlapping)).toEqual([0.25, 0.5, 0.5]);
  });

  it("samples height, normal, and slope from a finite heightfield", () => {
    const heightfield: LayoutHeightfieldV1 = {
      terrainEntityId: "terrain",
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [1, 1],
      resolutionVerticesXZ: [2, 2],
      heightSamplesMeters: [0, 1, 0, 1],
    };

    expect(sampleHeightfieldV1(heightfield, [0, 0])).toEqual({
      heightMeters: 0.5,
      normalXYZ: [-0.707107, 0.707107, 0],
      slopeDegrees: 45,
    });
    expect(sampleHeightfieldV1(heightfield, [2, 0])).toBeUndefined();
    expect(() =>
      sampleHeightfieldV1({ ...heightfield, heightSamplesMeters: [0, Number.NaN, 0, 1] }, [0, 0]),
    ).toThrow("LAYOUT_GEOMETRY_NON_FINITE");
  });

  it("samples the canonical rendered triangle across an asymmetric saddle cell", () => {
    const heightfield: LayoutHeightfieldV1 = {
      terrainEntityId: "terrain-saddle",
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [2, 2],
      resolutionVerticesXZ: [2, 2],
      heightSamplesMeters: [0, 2, 4, 0],
    };

    const sample = sampleHeightfieldV1(heightfield, [0, 0]);

    expect(sample).toEqual({
      heightMeters: 3,
      normalXYZ: [-0.408248, 0.408248, -0.816497],
      slopeDegrees: 65.905157,
    });
    expect(Math.hypot(...sample!.normalXYZ)).toBeCloseTo(1, 6);
  });

  it("samples route polylines at a deterministic profile spacing", () => {
    expect(sampleRoutePolylineV1([[0, 0], [4, 0]], 2)).toEqual([
      [0, 0],
      [2, 0],
      [4, 0],
    ]);
    expect(sampleRoutePolylineV1([[4, 0], [0, 0]], 2)).toEqual([
      [4, 0],
      [2, 0],
      [0, 0],
    ]);
  });

  it("projects right-handed -Z camera points to top-left-origin screen UV", () => {
    const camera = {
      kind: "fixed",
      cameraEntityId: "camera",
      positionMetersXYZ: [0, 0, 0],
      targetMetersXYZ: [0, 0, -1],
      verticalFovDegrees: 90,
      aspectRatio: 1,
      nearClipMeters: 0.1,
      farClipMeters: 100,
    } as const;

    expect(projectToScreenUv(camera, [0, 0, -5])).toEqual([0.5, 0.5]);
    expect(projectToScreenUv(camera, [1, 1, -5])).toEqual([0.6, 0.4]);
    expect(projectToScreenUv(camera, [0, 0, 1])).toBeUndefined();
  });

  it("quantizes finite values deterministically and rejects invalid inputs", () => {
    expect(quantizeFinite(1.23456, 0.001)).toBe(1.235);
    expect(quantizeFinite(-0.0001, 0.001)).toBe(0);
    expect(() => quantizeFinite(Number.POSITIVE_INFINITY, 0.001)).toThrow(
      "LAYOUT_GEOMETRY_NON_FINITE",
    );
    expect(() => quantizeFinite(1, 0)).toThrow("LAYOUT_QUANTIZATION_STEP_INVALID");
  });
});
