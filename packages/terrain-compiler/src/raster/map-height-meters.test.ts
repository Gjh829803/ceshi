import { describe, expect, it } from "vitest";

import { mapSignedHeightRatiosToMetersV0 } from "./map-height-meters";

describe("mapSignedHeightRatiosToMetersV0", () => {
  it("maps depression and elevation ratios through independent metric ranges", () => {
    const heightRatios = new Float32Array([-1, -0.5, 0, 0.5, 1]);
    const before = Array.from(heightRatios);

    const result = mapSignedHeightRatiosToMetersV0({
      heightRatios,
      minimumHeightMeters: -20,
      datumHeightMeters: 0,
      maximumHeightMeters: 60,
    });

    expect(Array.from(result)).toEqual([-20, -10, 0, 30, 60]);
    expect(Array.from(heightRatios)).toEqual(before);
  });

  it("supports a non-zero datum", () => {
    expect(Array.from(mapSignedHeightRatiosToMetersV0({
      heightRatios: new Float32Array([-0.5, 0, 0.5]),
      minimumHeightMeters: -10,
      datumHeightMeters: 10,
      maximumHeightMeters: 30,
    }))).toEqual([0, 10, 20]);
  });

  it("rejects invalid bounds, ratios outside the profile, and non-finite values", () => {
    const validRatios = new Float32Array([0]);
    expect(() => mapSignedHeightRatiosToMetersV0({
      heightRatios: validRatios,
      minimumHeightMeters: 0,
      datumHeightMeters: 0,
      maximumHeightMeters: 1,
    })).toThrow("minimumHeightMeters");
    expect(() => mapSignedHeightRatiosToMetersV0({
      heightRatios: validRatios,
      minimumHeightMeters: -1,
      datumHeightMeters: 1,
      maximumHeightMeters: 1,
    })).toThrow("maximumHeightMeters");
    expect(() => mapSignedHeightRatiosToMetersV0({
      heightRatios: new Float32Array([1.01]),
      minimumHeightMeters: -1,
      datumHeightMeters: 0,
      maximumHeightMeters: 1,
    })).toThrow("-1..1");
    expect(() => mapSignedHeightRatiosToMetersV0({
      heightRatios: validRatios,
      minimumHeightMeters: -1,
      datumHeightMeters: Number.NaN,
      maximumHeightMeters: 1,
    })).toThrow("finite");
  });
});
