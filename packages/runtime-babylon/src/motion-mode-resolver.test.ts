import { describe, expect, it } from "vitest";

import type { RuntimeMotionProfileV1 } from "@whitebox-world/runtime-contracts";

import { MotionModeResolverV1 } from "./motion-mode-resolver";

function profile(id: string): RuntimeMotionProfileV1 {
  return {
    resourceRef: `worldkit://motion-profile/${id}@1`,
    contentHash: `sha256:test-motion-profile-${id}`,
    motionKernelRef: `worldkit://motion-kernel/${id}@1`,
    motionTags: [id],
  };
}

const valid = (candidate: RuntimeMotionProfileV1): boolean =>
  !candidate.motionTags.includes("invalid");

describe("MotionModeResolverV1", () => {
  it("keeps a requested mode pending until the fixed Tick boundary", () => {
    const defaultProfile = profile("default");
    const optionalProfile = profile("optional");
    const fallbackProfile = profile("fallback");
    const resolver = new MotionModeResolverV1(
      defaultProfile,
      fallbackProfile,
      [optionalProfile],
      valid,
    );

    expect(resolver.request(optionalProfile.resourceRef)).toBe(true);
    expect(resolver.snapshot().activeProfile.resourceRef).toBe(
      defaultProfile.resourceRef,
    );
    expect(resolver.commitTickBoundary()).toBe(true);
    expect(resolver.snapshot()).toMatchObject({
      activeProfile: { resourceRef: optionalProfile.resourceRef },
      fallbackActive: false,
    });
  });

  it("rejects unknown modes and atomically enters the declared fallback on failure", () => {
    const defaultProfile = profile("default");
    const fallbackProfile = profile("fallback");
    const resolver = new MotionModeResolverV1(
      defaultProfile,
      fallbackProfile,
      [],
      valid,
    );

    expect(resolver.request("worldkit://motion-profile/unknown@1")).toBe(false);
    resolver.activateFallback("MOTION_NON_FINITE_STATE");
    expect(resolver.snapshot()).toMatchObject({
      activeProfile: { resourceRef: fallbackProfile.resourceRef },
      fallbackActive: true,
      lastFailureCode: "MOTION_NON_FINITE_STATE",
    });
  });
});
