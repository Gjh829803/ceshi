import { describe, expect, it } from "vitest";

import {
  GROUND_SAFETY_BOUNDARY_MEMBERSHIP_MASK_V1,
  groundSafetyBoundaryCollideMaskV1,
  groundSafetyBoundaryEnabledForMotionKernelV1,
} from "./ground-safety-boundary-filter.js";

describe("ground safety boundary filter", () => {
  it.each([
    "free-ground",
    "forward-steer",
    "wheeled-arcade",
    "surface-slide",
  ] as const)("retains the boundary bit for locked ground kernel %s", (kernel) => {
    expect(groundSafetyBoundaryEnabledForMotionKernelV1(kernel)).toBe(true);
    expect(
      groundSafetyBoundaryCollideMaskV1(0x101, kernel) &
        GROUND_SAFETY_BOUNDARY_MEMBERSHIP_MASK_V1,
    ).toBe(GROUND_SAFETY_BOUNDARY_MEMBERSHIP_MASK_V1);
  });

  it.each([
    "water-surface",
    "unpowered-glide",
  ] as const)("removes only the boundary bit for non-ground kernel %s", (kernel) => {
    const unrelated = 0x10_0101;
    const input = unrelated | GROUND_SAFETY_BOUNDARY_MEMBERSHIP_MASK_V1;
    expect(groundSafetyBoundaryEnabledForMotionKernelV1(kernel)).toBe(false);
    expect(groundSafetyBoundaryCollideMaskV1(input, kernel)).toBe(unrelated);
  });

});
