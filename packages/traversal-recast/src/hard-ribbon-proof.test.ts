import { describe, expect, it } from "vitest";

import {
  createHardRibbonProofV1,
  isPointInsideHardRibbonV1,
  isSegmentInsideHardRibbonV1,
} from "./hard-ribbon-proof.js";

describe("hard-ribbon proof", () => {
  it("rejects a U-shaped convex-hull shortcut even when both endpoints are inside", () => {
    const proof = createHardRibbonProofV1({
      pointsMetersXZ: [[0, 0], [0, 4], [4, 4], [4, 0]],
      widthMeters: 1,
    });

    expect(isPointInsideHardRibbonV1(proof, [0, 0])).toBe(true);
    expect(isPointInsideHardRibbonV1(proof, [4, 0])).toBe(true);
    expect(isSegmentInsideHardRibbonV1(proof, [0, 0], [4, 0])).toBe(false);
  });

  it("accepts complete segments covered by one or overlapping route stadiums", () => {
    const proof = createHardRibbonProofV1({
      pointsMetersXZ: [[0, 0], [0, 4], [4, 4]],
      widthMeters: 1,
    });

    expect(isSegmentInsideHardRibbonV1(proof, [0, 0], [0, 4])).toBe(true);
    expect(isSegmentInsideHardRibbonV1(proof, [0, 3.8], [0.2, 4])).toBe(true);
  });

  it("is deterministic, deeply frozen, and includes the inscribed boundary", () => {
    const input = { pointsMetersXZ: [[0, 0], [2, 0]], widthMeters: 2 } as const;
    const left = createHardRibbonProofV1(input);
    const right = createHardRibbonProofV1(input);

    expect(left).toEqual(right);
    expect(Object.isFrozen(left)).toBe(true);
    expect(Object.isFrozen(left.stadiums[0])).toBe(true);
    expect(isPointInsideHardRibbonV1(left, [1, 1])).toBe(true);
  });

  it("rejects an empty route or non-positive width", () => {
    expect(() => createHardRibbonProofV1({
      pointsMetersXZ: [[0, 0], [0, 0]],
      widthMeters: 1,
    })).toThrow("HARD_RIBBON_PROOF_INVALID");
    expect(() => createHardRibbonProofV1({
      pointsMetersXZ: [[0, 0], [1, 0]],
      widthMeters: 0,
    })).toThrow("HARD_RIBBON_PROOF_INVALID");
  });
});
