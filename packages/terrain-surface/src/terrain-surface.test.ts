import { describe, expect, it } from "vitest";

import {
  queryLockedColliderSupportHeightMeters,
  sampleTriangleHeightfieldSurface,
  type LockedSupportColliderV1,
} from "./index.js";

describe("triangle heightfield surface", () => {
  it("returns height, normalized normal, and slope from the canonical mesh triangle", () => {
    const sample = sampleTriangleHeightfieldSurface(
      {
        centerMetersXZ: [0, 0],
        sizeMetersXZ: [2, 2],
        resolutionVerticesXZ: [2, 2],
        heightSamplesMeters: [0, 2, 4, 0],
      },
      [0, 0],
    );

    expect(sample?.heightMeters).toBe(3);
    expect(sample?.normalXYZ).toEqual([
      -1 / Math.sqrt(6),
      1 / Math.sqrt(6),
      -2 / Math.sqrt(6),
    ]);
    expect(Math.hypot(...sample!.normalXYZ)).toBeCloseTo(1, 12);
    expect(sample?.slopeDegrees).toBeCloseTo(
      Math.atan(Math.sqrt(5)) * (180 / Math.PI),
      12,
    );
  });

  it("returns undefined outside the heightfield bounds", () => {
    expect(
      sampleTriangleHeightfieldSurface(
        {
          centerMetersXZ: [0, 0],
          sizeMetersXZ: [2, 2],
          resolutionVerticesXZ: [2, 2],
          heightSamplesMeters: [0, 2, 4, 0],
        },
        [2, 0],
      ),
    ).toBeUndefined();
  });
});

describe("locked collider support query", () => {
  it("returns the box top at an interior XZ sample, not an inflated AABB after rotation", () => {
    const height = queryLockedColliderSupportHeightMeters(
      {
        kind: "box",
        centerMetersXYZ: [0, 1, 0],
        halfExtentsMetersXYZ: [1, 0.25, 1],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      [0.2, -0.1],
    );
    expect(height).toBeCloseTo(1.25, 5);
  });

  it("returns undefined outside the footprint", () => {
    expect(
      queryLockedColliderSupportHeightMeters(
        {
          kind: "box",
          centerMetersXYZ: [0, 1, 0],
          halfExtentsMetersXYZ: [1, 0.25, 1],
          rotationEulerRadiansXYZ: [0, 0, 0],
        },
        [4, 0],
      ),
    ).toBeUndefined();
  });

  it("keeps a rolled box top below its inflated AABB top", () => {
    const rollRadians = 0.3;
    const height = queryLockedColliderSupportHeightMeters(
      {
        kind: "box",
        centerMetersXYZ: [0, 2, 0],
        halfExtentsMetersXYZ: [2, 0.5, 2],
        rotationEulerRadiansXYZ: [0, 0, rollRadians],
      },
      [0, 0],
    );
    const aabbTopMeters = 2 + 2 * Math.sin(rollRadians) + 0.5 * Math.cos(rollRadians);
    expect(height).toBeCloseTo(2 + 0.5 * Math.cos(rollRadians), 5);
    expect(height!).toBeLessThan(aabbTopMeters - 0.1);
  });

  it("rotates the box footprint by yaw before rejecting samples", () => {
    const collider: LockedSupportColliderV1 = {
      kind: "box",
      centerMetersXYZ: [0, 1, 0],
      halfExtentsMetersXYZ: [2, 0.25, 0.5],
      rotationEulerRadiansXYZ: [0, Math.PI / 2, 0],
    };
    // After the 90-degree yaw the long local X axis lies along world Z.
    expect(queryLockedColliderSupportHeightMeters(collider, [0, 1.5])).toBeCloseTo(1.25, 5);
    expect(queryLockedColliderSupportHeightMeters(collider, [1.5, 0])).toBeUndefined();
  });

  it("returns the flat cap height for cylinders and capsules inside the radius", () => {
    const cylinder: LockedSupportColliderV1 = {
      kind: "cylinder",
      centerMetersXYZ: [1, 1, -1],
      radiusMeters: 1,
      heightMeters: 2,
    };
    expect(queryLockedColliderSupportHeightMeters(cylinder, [1.5, -1.5])).toBeCloseTo(2, 5);
    expect(queryLockedColliderSupportHeightMeters(cylinder, [2.1, -1])).toBeUndefined();

    const capsule: LockedSupportColliderV1 = {
      kind: "capsule",
      centerMetersXYZ: [0, 1, 0],
      radiusMeters: 0.5,
    };
    expect(queryLockedColliderSupportHeightMeters(capsule, [0.4, 0])).toBeCloseTo(1.5, 5);
  });

  it("returns the spherical cap height for spheres inside the radius", () => {
    const sphere: LockedSupportColliderV1 = {
      kind: "sphere",
      centerMetersXYZ: [0, 1, 0],
      radiusMeters: 1,
    };
    expect(queryLockedColliderSupportHeightMeters(sphere, [0.6, 0])).toBeCloseTo(1.8, 5);
    expect(queryLockedColliderSupportHeightMeters(sphere, [1.5, 0])).toBeUndefined();
  });

  it("returns the highest vertical-ray hit on a convex hull", () => {
    const pyramid: LockedSupportColliderV1 = {
      kind: "convex",
      verticesMetersXYZ: [
        [-1, 0, -1],
        [1, 0, -1],
        [1, 0, 1],
        [-1, 0, 1],
        [0, 2, 0],
      ],
    };
    expect(queryLockedColliderSupportHeightMeters(pyramid, [0, 0])).toBeCloseTo(2, 5);
    expect(queryLockedColliderSupportHeightMeters(pyramid, [0.5, 0])).toBeCloseTo(1, 5);
    expect(queryLockedColliderSupportHeightMeters(pyramid, [2, 0])).toBeUndefined();
  });

  it("throws OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED for undeterminable convex queries", () => {
    expect(() =>
      queryLockedColliderSupportHeightMeters(
        { kind: "convex", verticesMetersXYZ: [] },
        [0, 0],
      ),
    ).toThrow(/^OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED/);
    expect(() =>
      queryLockedColliderSupportHeightMeters(
        { kind: "convex", verticesMetersXYZ: [[0, Number.NaN, 0]] },
        [0, 0],
      ),
    ).toThrow(/^OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED/);
  });

  it("throws OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED for unknown collider kinds", () => {
    expect(() =>
      queryLockedColliderSupportHeightMeters(
        { kind: "wedge" } as unknown as LockedSupportColliderV1,
        [0, 0],
      ),
    ).toThrow(/^OBJECT_SUPPORT_SURFACE_QUERY_UNSUPPORTED/);
  });
});
