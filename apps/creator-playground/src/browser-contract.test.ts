import { describe, expect, it } from "vitest";
import { creatorCaptureDimensionsV1, creatorTriviewDirectionV1 } from "./browser-contract.js";

describe("Creator capture coordinate and allocation contracts", () => {
  it("preserves requested aspect ratios and rejects unreasonable allocations", () => {
    expect(creatorCaptureDimensionsV1({ view: "opening", widthPixels: 720, heightPixels: 1280 }))
      .toEqual({ widthPixels: 720, heightPixels: 1280 });
    for (const widthPixels of [0, -1, 8192, Number.NaN, 1280.5]) {
      expect(() => creatorCaptureDimensionsV1({ view: "opening", widthPixels })).toThrow();
    }
  });

  it("uses -Z as front and provides a normalized right-handed quarter turn", () => {
    expect(creatorTriviewDirectionV1()).toEqual([0, -1]);
    const [x, z] = creatorTriviewDirectionV1(Math.PI / 2);
    expect(x).toBeCloseTo(1);
    expect(z).toBeCloseTo(0);
    for (const angle of [-2.8, 0.3, 1.8]) {
      const direction = creatorTriviewDirectionV1(angle);
      expect(Math.hypot(...direction)).toBeCloseTo(1);
    }
    expect(() => creatorTriviewDirectionV1(Number.POSITIVE_INFINITY)).toThrow();
  });
});
