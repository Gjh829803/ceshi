import { HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1 } from
  "@whitebox-world/runtime-babylon";
import { parseNativeEffectiveExecutionBudgetV1 } from
  "@whitebox-world/runtime-contracts";
import { describe, expect, it } from "vitest";

import { createHostedNativeExecutionBudgetV1 } from
  "./hosted-native-execution-budget.js";

const sceneBudget = Object.freeze({
  maximumVertices: 65_536,
  maximumTriangles: 131_072,
  maximumColliders: 256,
});

describe("Hosted Native execution budget", () => {
  it.each([
    ["interactive-session", {
      maximumInboundMessageBytes: 2_000_000,
      maximumOutboundMessageBytes: 2_000_000,
      maximumReceiptBytes: 2_000_000,
      maximumDiagnosticCount: 64,
      maximumLogBytes: 100_000,
    }],
    ["formal-capture", {
      maximumInboundMessageBytes:
        HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1.maximumInboundMessageBytes,
      maximumOutboundMessageBytes:
        HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1.maximumOutboundMessageBytes,
      maximumReceiptBytes: 16_000_000,
      maximumDiagnosticCount: 1,
      maximumLogBytes: 100_000,
    }],
  ] as const)(
    "locks the complete Host-owned %s budget",
    (mode, protocol) => {
      expect(parseNativeEffectiveExecutionBudgetV1(
        createHostedNativeExecutionBudgetV1({ mode, scene: sceneBudget }),
      )).toEqual({
        scene: sceneBudget,
        assets: {
          maximumAssetCount: 64,
          maximumAssetBytes: 64_000_000,
          maximumTextureCount: 32,
          maximumTextureBytes: 64_000_000,
        },
        runtime: {
          maximumSceneNodeCount: 4_096,
          maximumMaterialCount: 512,
          maximumShaderCount: 512,
          maximumPhysicsBodyCount: 257,
        },
        process: {
          maximumWallTimeMilliseconds: 120_000,
          maximumCpuTimeMilliseconds: 120_000,
          maximumMemoryBytes: 1_000_000_000,
          maximumProcessCount: 1,
        },
        protocol,
      });
    },
  );

  it("reserves one SDK-controlled Subject body above the admitted Collider maximum", () => {
    const budget = createHostedNativeExecutionBudgetV1({
      mode: "interactive-session",
      scene: sceneBudget,
    });

    expect(budget.runtime.maximumPhysicsBodyCount)
      .toBe(sceneBudget.maximumColliders + 1);
  });
});
