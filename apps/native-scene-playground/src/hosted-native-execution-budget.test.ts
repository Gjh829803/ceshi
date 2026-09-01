import { describe, expect, it } from "vitest";

import { createHostedNativeExecutionBudgetV1 } from
  "./hosted-native-execution-budget.js";

const sceneBudget = Object.freeze({
  maximumVertices: 65_536,
  maximumTriangles: 131_072,
  maximumColliders: 256,
});

describe("Hosted Native execution budget", () => {
  it.each(["interactive-session", "formal-capture"] as const)(
    "keeps one Host-owned Runtime cap for %s",
    (mode) => {
      const budget = createHostedNativeExecutionBudgetV1({
        mode,
        scene: sceneBudget,
      });

      expect(budget.scene).toEqual(sceneBudget);
      expect(budget.runtime).toEqual({
        maximumSceneNodeCount: 4_096,
        maximumMaterialCount: 512,
        maximumShaderCount: 512,
        maximumPhysicsBodyCount: 256,
      });
    },
  );

  it("keeps the formal Capture transport capacity separate", () => {
    const interactive = createHostedNativeExecutionBudgetV1({
      mode: "interactive-session",
      scene: sceneBudget,
    });
    const capture = createHostedNativeExecutionBudgetV1({
      mode: "formal-capture",
      scene: sceneBudget,
    });

    expect(capture.protocol.maximumInboundMessageBytes)
      .toBeGreaterThan(interactive.protocol.maximumInboundMessageBytes);
    expect(capture.protocol.maximumOutboundMessageBytes)
      .toBeGreaterThan(interactive.protocol.maximumOutboundMessageBytes);
  });
});
