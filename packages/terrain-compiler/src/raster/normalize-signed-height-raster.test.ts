import { describe, expect, it } from "vitest";

import { normalizeSignedHeightRaster } from "./normalize-signed-height-raster";

describe("normalizeSignedHeightRaster", () => {
  it("subtracts the odd-count median instead of preserving a global high bias", () => {
    const result = normalizeSignedHeightRaster([0.4, 0.5, 0.6]);

    expect(result.values[0]).toBeCloseTo(-0.1, 6);
    expect(result.values[1]).toBe(0);
    expect(result.values[2]).toBeCloseTo(0.1, 6);
    expect(result.medianHeightRatioBefore).toBe(0.5);
    expect(result.heightRatioOffsetApplied).toBe(-0.5);
    expect(result.inputRange).toEqual([0.4, 0.6]);
    expect(result.outputRange[0]).toBeCloseTo(-0.1, 12);
    expect(result.outputRange[1]).toBeCloseTo(0.1, 12);
    expect(result.clampedSampleCount).toBe(0);
  });

  it("uses the arithmetic midpoint for an asymmetric even-count median", () => {
    const result = normalizeSignedHeightRaster([-0.8, 0.2, 0.4, 0.9]);

    expect(result.medianHeightRatioBefore).toBeCloseTo(0.3, 12);
    expect(result.values[0]).toBe(-1);
    expect(result.values[1]).toBeCloseTo(-0.1, 6);
    expect(result.values[2]).toBeCloseTo(0.1, 6);
    expect(result.values[3]).toBeCloseTo(0.6, 6);
    expect(result.clampedSampleCount).toBe(1);
  });

  it("clamps only translated values outside the signed transport domain", () => {
    const result = normalizeSignedHeightRaster([-1, -0.9, 0.8]);

    expect(result.medianHeightRatioBefore).toBe(-0.9);
    expect(result.heightRatioOffsetApplied).toBe(0.9);
    expect(result.values[0]).toBeCloseTo(-0.1, 6);
    expect(result.values[1]).toBe(0);
    expect(result.values[2]).toBe(1);
    expect(result.outputRange[0]).toBeCloseTo(-0.1, 12);
    expect(result.outputRange[1]).toBe(1);
    expect(result.clampedSampleCount).toBe(1);
  });

  it("canonicalizes a neutral field without exposing negative zero", () => {
    const result = normalizeSignedHeightRaster([0, 0, 0]);

    expect(Object.is(result.heightRatioOffsetApplied, -0)).toBe(false);
    expect(result.heightRatioOffsetApplied).toBe(0);
    expect(result.outputRange).toEqual([0, 0]);
  });

  it("rejects empty and non-finite scalar fields", () => {
    expect(() => normalizeSignedHeightRaster([])).toThrow(
      "must contain at least one sample",
    );
    expect(() => normalizeSignedHeightRaster([0, Number.NaN])).toThrow(
      "must contain only finite samples",
    );
  });

  it("does not mutate the caller-owned scalar field", () => {
    const source = new Float32Array([0.25, 0.5, 0.75]);

    normalizeSignedHeightRaster(source);

    expect([...source]).toEqual([0.25, 0.5, 0.75]);
  });

  it("handles a production-sized scalar field without argument spreading", () => {
    const source = new Float32Array(1_048_576);
    source.fill(0.25);
    source[0] = -0.5;
    source[source.length - 1] = 0.75;

    const result = normalizeSignedHeightRaster(source);

    expect(result.values).toHaveLength(source.length);
    expect(result.medianHeightRatioBefore).toBe(0.25);
    expect(result.inputRange).toEqual([-0.5, 0.75]);
    expect(result.outputRange).toEqual([-0.75, 0.5]);
  });
});
