import { isNil } from "lodash-es";

import type { ExecutionPlanV4, ExecutionSubjectV3 } from "@whitebox-world/runtime-contracts";

// Test-only Registry access via a cross-workspace relative path; production
// runtime-babylon src must not read the Registry, and must not import the
// package index (that loads the defaults catalog).
import { builtInSubjectResourceRegistry } from "../../subject-registry/src/built-in-subject-resource-registry";

const PUBLISHED_GROUND_FEEL_REFS = [
  "worldkit://control-feel-profile/humanoid.medium-ground@1",
  "worldkit://control-feel-profile/humanoid.heavy-ground@1",
] as const;

type ControlFeelSurfaceV1 = ExecutionSubjectV3["controlFeel"];

function publishedGroundFeelSurface(resourceRef: string): ControlFeelSurfaceV1 {
  const profile = builtInSubjectResourceRegistry.resolveControlFeelProfile(resourceRef);
  if (isNil(profile)) {
    throw new Error(`Missing published Control Feel Profile '${resourceRef}'.`);
  }
  return {
    resourceRef: profile.resourceRef,
    contentHash: profile.contentHash,
    walkSpeedMetersPerSecond: profile.walkSpeedMetersPerSecond,
    runSpeedMetersPerSecond: profile.runSpeedMetersPerSecond,
    jumpSpeedMetersPerSecond: profile.jumpSpeedMetersPerSecond,
    accelerationMetersPerSecondSquared: profile.accelerationMetersPerSecondSquared,
    decelerationMetersPerSecondSquared: profile.decelerationMetersPerSecondSquared,
    turnRateRadiansPerSecond: profile.turnRateRadiansPerSecond,
    moveResponseExponent: profile.moveResponseExponent,
    airControlRatio: profile.airControlRatio,
    coyoteTimeSeconds: profile.coyoteTimeSeconds,
    jumpBufferSeconds: profile.jumpBufferSeconds,
    variableJumpHoldSeconds: profile.variableJumpHoldSeconds,
    jumpHoldGravityRatio: profile.jumpHoldGravityRatio,
    jumpReleaseGravityRatio: profile.jumpReleaseGravityRatio,
  };
}

/**
 * Test-only: attach the two published Ground/Air Feels onto compiled V2
 * fixtures that have no `allowedControlFeelProfileRefs`. Production V2
 * subjects keep only their compiled default Feel.
 */
export function lockPublishedGroundFeels(plan: ExecutionPlanV4): ExecutionPlanV4 {
  const availableControlFeels = PUBLISHED_GROUND_FEEL_REFS.map(
    publishedGroundFeelSurface,
  );
  return {
    ...plan,
    subjects: plan.subjects.map((subject) => ({
      ...subject,
      availableControlFeels,
    })),
  };
}
