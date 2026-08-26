import { describe, expect, it } from "vitest";

import type { SignedHeightIntentProjectionV0 } from "./project-signed-rgb";
import { summarizeTerrainIntentProjectionV0 } from "./summarize-projection";

describe("summarizeTerrainIntentProjectionV0", () => {
  it("measures an asymmetric X-fastest field without mutating it", () => {
    const heightRatios = new Float32Array([-1, -0.5, 0, 0.25, 0.5, 1]);
    const residuals = new Float32Array([0, 10, 20, 30, 40, 50]);
    const beforeRatios = Array.from(heightRatios);
    const beforeResiduals = Array.from(residuals);
    const projection: SignedHeightIntentProjectionV0 = {
      profileId: "signed-diverging-blue-gray-orange@0",
      widthPixels: 3,
      heightPixels: 2,
      heightRatios,
      rampResidualRgbUnits: residuals,
    };

    expect(summarizeTerrainIntentProjectionV0(projection)).toEqual({
      minimumHeightRatio: -1,
      medianHeightRatio: 0,
      maximumHeightRatio: 1,
      meanRampResidualRgbUnits: 25,
      p95RampResidualRgbUnits: 50,
      meanNeighborDeltaRatio: 5 / 7,
      p95NeighborDeltaRatio: 1.25,
    });
    expect(Array.from(heightRatios)).toEqual(beforeRatios);
    expect(Array.from(residuals)).toEqual(beforeResiduals);
  });

  it("rejects empty, dimension-mismatched, and non-finite projections", () => {
    const base: SignedHeightIntentProjectionV0 = {
      profileId: "signed-diverging-blue-gray-orange@0",
      widthPixels: 1,
      heightPixels: 1,
      heightRatios: new Float32Array([0]),
      rampResidualRgbUnits: new Float32Array([0]),
    };

    expect(() => summarizeTerrainIntentProjectionV0({
      ...base,
      widthPixels: 0,
      heightRatios: new Float32Array(),
      rampResidualRgbUnits: new Float32Array(),
    })).toThrow("positive");
    expect(() => summarizeTerrainIntentProjectionV0({
      ...base,
      widthPixels: 2,
    })).toThrow("sample count");
    expect(() => summarizeTerrainIntentProjectionV0({
      ...base,
      rampResidualRgbUnits: new Float32Array([Number.NaN]),
    })).toThrow("finite");
  });
});
