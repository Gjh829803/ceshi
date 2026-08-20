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
