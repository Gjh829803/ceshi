import { describe, expect, it } from "vitest";

import { subjectFriendlyNameV1 } from "./subject-friendly-name.js";

function definition(resourceRef: string, displayName: string) {
  return {
    resourceRef,
    contentHash: `sha256:${"a".repeat(64)}`,
    displayName,
    semanticClassId: "subject.humanoid",
    bodyTopology: "biped",
    authoringAvailability: "recommended" as const,
    defaultMotionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    cameraContextProfileRef: "worldkit://camera-context/capability-driven.default@1",
  };
}

describe("Subject friendly names", () => {
  it("does not label every humanoid definition as G Bot", () => {
    expect(subjectFriendlyNameV1(definition(
      "worldkit://subject-definition/humanoid.g-bot@2",
      "G Bot humanoid",
    ))).toBe("G Bot 人形角色");
    expect(subjectFriendlyNameV1(definition(
      "worldkit://subject-definition/humanoid.third-person@1",
      "Primitive capsule humanoid proxy",
    ))).toBe("人形胶囊测试代理");
    expect(subjectFriendlyNameV1(definition(
      "worldkit://subject-definition/humanoid.custom@1",
      "Custom humanoid",
    ))).toBe("Custom humanoid");
  });
});
