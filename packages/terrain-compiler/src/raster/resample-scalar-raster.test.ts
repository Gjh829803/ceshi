import { describe, expect, it } from "vitest";

import { resampleScalarRasterBilinear } from "./resample-scalar-raster";

describe("resampleScalarRasterBilinear", () => {
  it("resamples an asymmetric X-fastest field with endpoint-aligned bilinear interpolation", () => {
    const input = {
      columns: 3,
      rows: 2,
      values: new Float32Array([
        0, 1, 2,
        10, 11, 12,
      ]),
    };
    const before = Array.from(input.values);

    const result = resampleScalarRasterBilinear(input, [5, 3]);

    expect(result.columns).toBe(5);
    expect(result.rows).toBe(3);
    expect(Array.from(result.values)).toEqual([
      0, 0.5, 1, 1.5, 2,
      5, 5.5, 6, 6.5, 7,
      10, 10.5, 11, 11.5, 12,
    ]);
    expect(Array.from(input.values)).toEqual(before);
  });

  it("is deterministic for identical inputs and returns caller-independent storage", () => {
    const input = {
      columns: 2,
      rows: 2,
      values: new Float32Array([0, 2, 4, 6]),
    };

    const first = resampleScalarRasterBilinear(input, [3, 3]);
    const second = resampleScalarRasterBilinear(input, [3, 3]);

    expect(Array.from(first.values)).toEqual([0, 1, 2, 2, 3, 4, 4, 5, 6]);
    expect(first).toEqual(second);
    expect(first.values).not.toBe(second.values);
  });

  it("rejects degenerate dimensions, mismatched sample counts, and non-finite values", () => {
    expect(() => resampleScalarRasterBilinear({
      columns: 1,
      rows: 2,
      values: new Float32Array([0, 1]),
    }, [2, 2])).toThrow("at least 2");
    expect(() => resampleScalarRasterBilinear({
      columns: 2,
      rows: 2,
      values: new Float32Array([0, 1, 2]),
    }, [2, 2])).toThrow("sample count");
    expect(() => resampleScalarRasterBilinear({
      columns: 2,
      rows: 2,
      values: new Float32Array([0, 1, 2, Number.NaN]),
    }, [2, 2])).toThrow("finite");
    expect(() => resampleScalarRasterBilinear({
      columns: 2,
      rows: 2,
      values: new Float32Array([0, 1, 2, 3]),
    }, [1, 2])).toThrow("at least 2");
  });
});
