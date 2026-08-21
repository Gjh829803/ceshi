import { describe, expect, it } from "vitest";

import { builtInSubjectResourceRegistry } from "./index.js";
import { createSubjectResourceRegistry } from "./subject-resource-registry.js";

describe("P1.5 admission clean-break", () => {
  it("rejects locomotion speed fields", () => {
    expect(() =>
      createSubjectResourceRegistry([
        {
          kind: "locomotion-profile",
          id: "illegal",
          version: 1,
          resourceRef: "worldkit://locomotion-profile/illegal@1",
          allowWalk: true,
          allowRun: true,
          allowJump: true,
          walkSpeedMetersPerSecond: 2.4,
          aiMetadata: { displayName: "x", description: "x", semanticTags: ["x"] },
        } as never,
      ]),
    ).toThrow(/LOCOMOTION_PROFILE_SPEED_FORBIDDEN/);
  });

  it("rejects motion parameter bags", () => {
    expect(() =>
      createSubjectResourceRegistry([
        {
          kind: "motion-profile",
          id: "illegal",
          version: 1,
          resourceRef: "worldkit://motion-profile/illegal@1",
          motionKernelRef: "worldkit://motion-kernel/free-ground@1",
          parameters: { stepHeightMeters: 0.35 },
          motionTags: ["ground"],
          aiMetadata: { displayName: "x", description: "x", semanticTags: ["x"] },
        } as never,
      ]),
    ).toThrow(/MOTION_PROFILE_NUMERIC_BAG_FORBIDDEN/);
  });

  it("rejects water or groundingTolerance on medium V1", () => {
    expect(() =>
      createSubjectResourceRegistry([
        {
          kind: "medium-profile",
          id: "illegal",
          version: 1,
          resourceRef: "worldkit://medium-profile/illegal@1",
          air: { gravityRatio: 1, linearDragPerSecond: 0.05 },
          water: { buoyancyRatio: 1 },
          aiMetadata: { displayName: "x", description: "x", semanticTags: ["x"] },
        } as never,
      ]),
    ).toThrow(/MEDIUM_PROFILE_FIELD_FORBIDDEN/);
  });

  it("rejects a subject definition without controlFeelProfileRef", async () => {
    const { G_BOT_HUMANOID_DEFINITION } = await import(
      "./built-in-subject-definitions.js"
    );
    const withoutFeel = {
      ...G_BOT_HUMANOID_DEFINITION,
      profiles: { ...G_BOT_HUMANOID_DEFINITION.profiles },
    };
    delete (withoutFeel.profiles as { controlFeelProfileRef?: string })
      .controlFeelProfileRef;
    expect(() => createSubjectResourceRegistry([withoutFeel as never])).toThrow(
      /SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED/,
    );
  });

  it("rejects feel profile when walk speed exceeds run speed", () => {
    expect(() =>
      createSubjectResourceRegistry([
        {
          kind: "control-feel-profile",
          id: "illegal",
          version: 1,
          resourceRef: "worldkit://control-feel-profile/illegal@1",
          authoringAvailability: "recommended",
          walkSpeedMetersPerSecond: 5,
          runSpeedMetersPerSecond: 4,
          jumpSpeedMetersPerSecond: 5.5,
          accelerationMetersPerSecondSquared: 16,
          decelerationMetersPerSecondSquared: 20,
          turnRateRadiansPerSecond: 8,
          moveResponseExponent: 1.5,
          airControlRatio: 0.3,
          coyoteTimeSeconds: 0.12,
          jumpBufferSeconds: 0.12,
          variableJumpHoldSeconds: 0.2,
          jumpHoldGravityRatio: 0.5,
          jumpReleaseGravityRatio: 2,
          aiMetadata: { displayName: "x", description: "x", semanticTags: ["x"] },
        },
      ]),
    ).toThrow(/CONTROL_FEEL_PROFILE_INVALID/);
  });

  it("rejects feel profile when airControlRatio exceeds 1", () => {
    expect(() =>
      createSubjectResourceRegistry([
        {
          kind: "control-feel-profile",
          id: "illegal",
          version: 1,
          resourceRef: "worldkit://control-feel-profile/illegal-air@1",
          authoringAvailability: "recommended",
          walkSpeedMetersPerSecond: 2.4,
          runSpeedMetersPerSecond: 4,
          jumpSpeedMetersPerSecond: 5.5,
          accelerationMetersPerSecondSquared: 16,
          decelerationMetersPerSecondSquared: 20,
          turnRateRadiansPerSecond: 8,
          moveResponseExponent: 1.5,
          airControlRatio: 1.2,
          coyoteTimeSeconds: 0.12,
          jumpBufferSeconds: 0.12,
          variableJumpHoldSeconds: 0.2,
          jumpHoldGravityRatio: 0.5,
          jumpReleaseGravityRatio: 2,
          aiMetadata: { displayName: "x", description: "x", semanticTags: ["x"] },
        },
      ]),
    ).toThrow(/CONTROL_FEEL_PROFILE_INVALID/);
  });

  it("rejects feel profile when jumpReleaseGravityRatio is below 1", () => {
    expect(() =>
      createSubjectResourceRegistry([
        {
          kind: "control-feel-profile",
          id: "illegal",
          version: 1,
          resourceRef: "worldkit://control-feel-profile/illegal-jump@1",
          authoringAvailability: "recommended",
          walkSpeedMetersPerSecond: 2.4,
          runSpeedMetersPerSecond: 4,
          jumpSpeedMetersPerSecond: 5.5,
          accelerationMetersPerSecondSquared: 16,
          decelerationMetersPerSecondSquared: 20,
          turnRateRadiansPerSecond: 8,
          moveResponseExponent: 1.5,
          airControlRatio: 0.3,
          coyoteTimeSeconds: 0.12,
          jumpBufferSeconds: 0.12,
          variableJumpHoldSeconds: 0.2,
          jumpHoldGravityRatio: 0.5,
          jumpReleaseGravityRatio: 0.8,
          aiMetadata: { displayName: "x", description: "x", semanticTags: ["x"] },
        },
      ]),
    ).toThrow(/CONTROL_FEEL_PROFILE_INVALID/);
  });

  it("registers two distinguishable built-in feel profiles", () => {
    const medium = builtInSubjectResourceRegistry.resolveControlFeelProfile(
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
    );
    const heavy = builtInSubjectResourceRegistry.resolveControlFeelProfile(
      "worldkit://control-feel-profile/humanoid.heavy-ground@1",
    );
    expect(medium?.kind).toBe("control-feel-profile");
    expect(heavy?.kind).toBe("control-feel-profile");
    expect(medium?.accelerationMetersPerSecondSquared).toBe(16);
    expect(heavy?.accelerationMetersPerSecondSquared).toBe(8);
  });

  it("replaces water medium and binds feel on G Bot and Golden", () => {
    expect(
      builtInSubjectResourceRegistry.resolveMediumProfile(
        "worldkit://medium-profile/ground-water-air.standard@1",
      ),
    ).toBeUndefined();
    for (const ref of [
      "worldkit://subject-definition/humanoid.g-bot@1",
      "worldkit://subject-definition/humanoid.rigged-golden@1",
    ]) {
      const subject = builtInSubjectResourceRegistry.resolveSubjectDefinition(ref);
      expect(subject?.profiles).toMatchObject({
        controlFeelProfileRef:
          "worldkit://control-feel-profile/humanoid.medium-ground@1",
        mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
      });
    }
  });

  it("rejects physics body profile with non-finite maxStepHeightMeters", () => {
    expect(() =>
      createSubjectResourceRegistry([
        {
          kind: "physics-body-profile",
          id: "illegal",
          version: 1,
          resourceRef: "worldkit://physics-body-profile/illegal@1",
          supportedBodyTopologies: ["biped"],
          physicsBody: {
            mode: "character",
            massKilograms: 75,
            maxSlopeDegrees: 42,
            maxStepHeightMeters: Number.NaN,
          },
          aiMetadata: { displayName: "x", description: "x", semanticTags: ["x"] },
        },
      ]),
    ).toThrow(/PHYSICS_BODY_TRAVERSAL_LIMIT_INVALID/);
  });
});
