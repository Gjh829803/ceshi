import { describe, expect, it } from "vitest";

import { measureIdentityMaskProjectionsV1 } from "./identity-mask-projection.js";

describe("identity mask pixel projections", () => {
  it("distinguishes a solid mass from an arch with the same bounds", () => {
    const solid = measureIdentityMaskProjectionsV1({ widthPixels: 3, heightPixels: 3,
      targetCount: 1, admittedTargetByPixel: Uint8Array.from([1,1,1,1,1,1,1,1,1]) })[0]!;
    const arch = measureIdentityMaskProjectionsV1({ widthPixels: 3, heightPixels: 3,
      targetCount: 1, admittedTargetByPixel: Uint8Array.from([1,1,1,1,0,1,1,0,1]) })[0]!;
    expect(solid).toMatchObject({ outcome: "visible", pixelCount: 9, coverageBasisPoints: 10000 });
    expect(arch).toMatchObject({ outcome: "visible", pixelCount: 7, coverageBasisPoints: 7778 });
    if (solid.outcome !== "visible" || arch.outcome !== "visible") throw new Error("mask missing");
    expect(solid.normalizedBounds).toEqual(arch.normalizedBounds);
    expect(arch.normalizedCenter).toEqual({ xBasisPoints: 5000, yBasisPoints: 5000 });
  });

  it("counts separated instances but not their intervening negative space", () => {
    expect(measureIdentityMaskProjectionsV1({ widthPixels: 5, heightPixels: 2,
      targetCount: 2, admittedTargetByPixel: Uint8Array.from([1,0,2,0,1,0,0,2,0,0]) })).toEqual([
      { outcome: "visible", pixelCount: 2, normalizedBounds: { minXBasisPoints: 0,
        minYBasisPoints: 0, maxXBasisPoints: 10000, maxYBasisPoints: 5000 },
      normalizedCenter: { xBasisPoints: 5000, yBasisPoints: 2500 }, coverageBasisPoints: 2000 },
      { outcome: "visible", pixelCount: 2, normalizedBounds: { minXBasisPoints: 4000,
        minYBasisPoints: 0, maxXBasisPoints: 6000, maxYBasisPoints: 10000 },
      normalizedCenter: { xBasisPoints: 5000, yBasisPoints: 5000 }, coverageBasisPoints: 2000 },
    ]);
  });

  it("keeps absent masks empty without inventing bounds or diagnosing occlusion", () => {
    expect(measureIdentityMaskProjectionsV1({ widthPixels: 2, heightPixels: 1,
      targetCount: 2, admittedTargetByPixel: Uint8Array.from([0,2]) })[0]).toEqual({
      outcome: "not-visible", pixelCount: 0,
    });
  });

  it("uses exclusive pixel edges and the existing reference rounding", () => {
    expect(measureIdentityMaskProjectionsV1({ widthPixels: 3, heightPixels: 2,
      targetCount: 1, admittedTargetByPixel: Uint8Array.from([0,0,0,0,0,1]) })[0]).toEqual({
      outcome: "visible", pixelCount: 1,
      normalizedBounds: { minXBasisPoints: 6666, minYBasisPoints: 5000,
        maxXBasisPoints: 10000, maxYBasisPoints: 10000 },
      normalizedCenter: { xBasisPoints: 8333, yBasisPoints: 7500 }, coverageBasisPoints: 1667,
    });
  });

  it("retains tiny visible masks and leaves reliability policy to the caller", () => {
    const pixels = new Uint8Array(20000);
    pixels[19999] = 1;
    expect(measureIdentityMaskProjectionsV1({ widthPixels: 200, heightPixels: 100,
      targetCount: 1, admittedTargetByPixel: pixels })[0]).toMatchObject({
      outcome: "visible", pixelCount: 1, coverageBasisPoints: 1,
    });
  });

  it.each([
    { widthPixels: 0 }, { heightPixels: 0.5 }, { targetCount: -1 },
    { admittedTargetByPixel: Uint8Array.from([1]) },
    { admittedTargetByPixel: Uint8Array.from([1,2]) },
  ])("rejects malformed image-label input %j", (patch) => {
    expect(() => measureIdentityMaskProjectionsV1({ widthPixels: 2, heightPixels: 1,
      targetCount: 1, admittedTargetByPixel: Uint8Array.from([1,0]), ...patch })).toThrow(
      "IDENTITY_MASK_PROJECTION_INVALID",
    );
  });
});
