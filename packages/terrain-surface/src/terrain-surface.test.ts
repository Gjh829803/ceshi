import { describe, expect, it } from "vitest";

import { sampleTriangleHeightfieldSurface } from "./index.js";

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
