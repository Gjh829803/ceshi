import { describe, expect, it } from "vitest";

import {
  assertWorldAuthoringTransition,
  canTransitionWorldAuthoringStage,
  defineWorldPlanChangeRequest,
} from "./authoring-workflow";

describe("world authoring workflow", () => {
  it("allows only the forward gated workflow", () => {
    expect(canTransitionWorldAuthoringStage("draft", "frozen")).toBe(true);
    expect(canTransitionWorldAuthoringStage("frozen", "implemented")).toBe(true);
    expect(canTransitionWorldAuthoringStage("implemented", "visualized")).toBe(false);
    expect(canTransitionWorldAuthoringStage("verified", "draft")).toBe(false);
  });

  it("rejects skipped or backward transitions", () => {
    expect(() => assertWorldAuthoringTransition("draft", "implemented")).toThrow(
      "cannot transition",
    );
  });

  it("validates structured Builder change requests", () => {
    expect(
      defineWorldPlanChangeRequest({
        kind: "world-plan-change-request",
        version: 1,
        sceneId: "coastal-world",
        requestedBy: "world-builder",
        reason: "The primary route exceeds the frozen slope constraint.",
        affectedIds: ["west-route"],
        proposal: "Move the route 18 meters east and ask Planner to revise the lock.",
      }).sceneId,
    ).toBe("coastal-world");
  });
});
