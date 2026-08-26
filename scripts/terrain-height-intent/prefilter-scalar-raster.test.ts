import { describe, expect, it } from "vitest";

import { prefilterScalarRasterForDownsampleV0 } from "./prefilter-scalar-raster";

describe("prefilterScalarRasterForDownsampleV0", () => {
  it("applies a deterministic separable box low-pass before asymmetric downsampling", () => {
    const values = new Float32Array(7 * 5);
    values[2 * 7 + 3] = 1;

    const result = prefilterScalarRasterForDownsampleV0({
      columns: 7,
      rows: 5,
      values,
    }, [3, 3]);

    expect(result.radiusPixelsXY).toEqual([1, 1]);
    expect(result.values[2 * 7 + 3]).toBeCloseTo(1 / 9, 7);
    expect(result.values[2 * 7 + 2]).toBeCloseTo(1 / 9, 7);
    expect(result.values[1 * 7 + 3]).toBeCloseTo(1 / 9, 7);
    expect(Array.from(values).filter((value) => value !== 0)).toEqual([1]);
  });

  it("preserves a constant field including clipped image edges", () => {
    const result = prefilterScalarRasterForDownsampleV0({
      columns: 9,
      rows: 7,
      values: new Float32Array(9 * 7).fill(-0.375),
    }, [3, 4]);

    expect(result.radiusPixelsXY).toEqual([2, 1]);
    expect(Array.from(result.values).every((value) => value === -0.375)).toBe(true);
  });

  it("returns independent unchanged storage when neither axis is downsampled", () => {
    const values = new Float32Array([0, 1, 2, 3, 4, 5]);

    const result = prefilterScalarRasterForDownsampleV0({
      columns: 3,
      rows: 2,
      values,
    }, [5, 3]);

    expect(result.radiusPixelsXY).toEqual([0, 0]);
    expect(Array.from(result.values)).toEqual(Array.from(values));
    expect(result.values).not.toBe(values);
  });

  it("rejects invalid dimensions, target resolutions, sample counts, and values", () => {
    expect(() => prefilterScalarRasterForDownsampleV0({
      columns: 1,
      rows: 2,
      values: new Float32Array([0, 1]),
    }, [2, 2])).toThrow("at least 2");
    expect(() => prefilterScalarRasterForDownsampleV0({
      columns: 2,
      rows: 2,
      values: new Float32Array([0, 1, 2]),
    }, [2, 2])).toThrow("sample count");
    expect(() => prefilterScalarRasterForDownsampleV0({
      columns: 2,
      rows: 2,
      values: new Float32Array([0, 1, 2, Number.NaN]),
    }, [2, 2])).toThrow("finite");
    expect(() => prefilterScalarRasterForDownsampleV0({
      columns: 2,
      rows: 2,
      values: new Float32Array([0, 1, 2, 3]),
    }, [1, 2])).toThrow("at least 2");
  });
});
