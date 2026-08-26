import { describe, expect, it } from "vitest";

import { orientXZV1 } from "./orientation-xz.js";

describe("orientXZV1", () => {
  it("preserves the canonical X-right Z-up cross-product sign", () => {
    expect(Math.sign(orientXZV1([0, 0], [1, 0], [0, 1]))).toBe(1);
    expect(Math.sign(orientXZV1([0, 0], [0, 1], [1, 0]))).toBe(-1);
    expect(orientXZV1([0, 0], [1, 1], [2, 2])).toBe(0);
  });

  it("does not collapse a quantized project-scale near-collinear turn to zero", () => {
    const a = [0, 0] as const;
    const b = [99.9999, 99.999901] as const;
    const c = [99.999901, 99.999902] as const;

    expect(
      (b[0] - a[0]) * (c[1] - a[1]) -
        (b[1] - a[1]) * (c[0] - a[0]),
    ).toBe(0);
    expect(Math.sign(orientXZV1(a, b, c))).toBe(1);
    expect(Math.sign(orientXZV1(a, c, b))).toBe(-1);
  });
});
