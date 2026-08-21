import { describe, expect, it } from "vitest";

import { builtInSubjectResourceRegistry } from "./index";

describe("P1.5 admission debt", () => {
  const registry = builtInSubjectResourceRegistry;

  it("currently admits locomotion speeds that must become LOCOMOTION_PROFILE_SPEED_FORBIDDEN", () => {
    const locomotion = registry.resolveLocomotionProfile(
      "worldkit://locomotion-profile/ground.standard@1",
    );
    expect(locomotion?.kind).toBe("locomotion-profile");
    expect(
      (locomotion as { locomotion?: { walkSpeedMetersPerSecond?: number } })
        .locomotion?.walkSpeedMetersPerSecond,
    ).toBe(2.4);
  });

  it("currently admits motion numeric bags including stepHeightMeters 0.35", () => {
    const motion = registry.resolveMotionProfile(
      "worldkit://motion-profile/free-ground.humanoid-medium@1",
    );
    expect(motion?.kind).toBe("motion-profile");
    expect(
      (motion as { parameters?: { stepHeightMeters?: number } }).parameters
        ?.stepHeightMeters,
    ).toBe(0.35);
  });

  it("currently binds ground-water-air medium and no controlFeelProfileRef", () => {
    const subject = registry.resolveSubjectDefinition(
      "worldkit://subject-definition/humanoid.g-bot@1",
    );
    expect(subject?.kind).toBe("subject-definition");
    const profiles = (
      subject as {
        profiles: {
          mediumProfileRef: string;
          controlFeelProfileRef?: string;
        };
      }
    ).profiles;
    expect(profiles.mediumProfileRef).toBe(
      "worldkit://medium-profile/ground-water-air.standard@1",
    );
    expect(profiles.controlFeelProfileRef).toBeUndefined();
  });
});
