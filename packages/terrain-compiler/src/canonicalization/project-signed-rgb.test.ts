import { describe, expect, it } from "vitest";

import {
  SIGNED_HEIGHT_INTENT_PROFILE,
  projectSignedHeightIntentRgb,
} from "./project-signed-rgb";

describe("projectSignedHeightIntentRgb", () => {
  it("projects the frozen ramp endpoints and segment midpoints to signed ratios", () => {
    const result = projectSignedHeightIntentRgb({
      widthPixels: 5,
      heightPixels: 1,
      rgbBytes: new Uint8Array([
        32, 64, 208,
        80, 96, 168,
        128, 128, 128,
        176, 112, 80,
        224, 96, 32,
      ]),
    });

    expect(result.profileId).toBe(SIGNED_HEIGHT_INTENT_PROFILE.id);
    expect(Array.from(result.heightRatios)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(Array.from(result.rampResidualRgbUnits)).toEqual([0, 0, 0, 0, 0]);
  });

  it("projects off-ramp pixels deterministically and reports their color residual", () => {
    const result = projectSignedHeightIntentRgb({
      widthPixels: 2,
      heightPixels: 1,
      rgbBytes: new Uint8Array([
        128, 128, 200,
        255, 255, 255,
      ]),
    });

    expect(result.heightRatios).toHaveLength(2);
    expect(result.heightRatios[0]).toBeGreaterThanOrEqual(-1);
    expect(result.heightRatios[0]).toBeLessThanOrEqual(1);
    expect(result.heightRatios[1]).toBeGreaterThanOrEqual(-1);
    expect(result.heightRatios[1]).toBeLessThanOrEqual(1);
    expect(result.rampResidualRgbUnits[0]).toBeGreaterThan(0);
    expect(result.rampResidualRgbUnits[1]).toBeGreaterThan(0);

    const replay = projectSignedHeightIntentRgb({
      widthPixels: 2,
      heightPixels: 1,
      rgbBytes: new Uint8Array([
        128, 128, 200,
        255, 255, 255,
      ]),
    });

    expect(Array.from(replay.heightRatios)).toEqual(Array.from(result.heightRatios));
    expect(Array.from(replay.rampResidualRgbUnits)).toEqual(
      Array.from(result.rampResidualRgbUnits),
    );
  });

  it("rejects malformed raster dimensions and RGB byte counts", () => {
    expect(() =>
      projectSignedHeightIntentRgb({
        widthPixels: 0,
        heightPixels: 1,
        rgbBytes: new Uint8Array(),
      }),
    ).toThrow("widthPixels");

    expect(() =>
      projectSignedHeightIntentRgb({
        widthPixels: 1,
        heightPixels: 1,
        rgbBytes: new Uint8Array([32, 64]),
      }),
    ).toThrow("RGB byte count");
  });
});
