import { HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1 } from
  "@whitebox-world/runtime-babylon";
import type { NativeEffectiveExecutionBudgetV1 } from
  "@whitebox-world/runtime-contracts";

export type HostedNativeExecutionBudgetModeV1 =
  | "interactive-session"
  | "formal-capture";

export function createHostedNativeExecutionBudgetV1(input: Readonly<{
  readonly mode: HostedNativeExecutionBudgetModeV1;
  readonly scene: NativeEffectiveExecutionBudgetV1["scene"];
}>): NativeEffectiveExecutionBudgetV1 {
  const isFormalCapture = input.mode === "formal-capture";
  return Object.freeze({
    scene: Object.freeze({ ...input.scene }),
    assets: Object.freeze({
      maximumAssetCount: 64,
      maximumAssetBytes: 64_000_000,
      maximumTextureCount: 32,
      maximumTextureBytes: 64_000_000,
    }),
    runtime: Object.freeze({
      maximumSceneNodeCount: 4_096,
      maximumMaterialCount: 512,
      maximumShaderCount: 512,
      maximumPhysicsBodyCount: 257,
    }),
    process: Object.freeze({
      maximumWallTimeMilliseconds: 120_000,
      maximumCpuTimeMilliseconds: 120_000,
      maximumMemoryBytes: 1_000_000_000,
      maximumProcessCount: 1,
    }),
    protocol: Object.freeze(isFormalCapture
      ? {
          maximumInboundMessageBytes:
            HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1
              .maximumInboundMessageBytes,
          maximumOutboundMessageBytes:
            HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1
              .maximumOutboundMessageBytes,
          maximumReceiptBytes: 16_000_000,
          maximumDiagnosticCount: 1,
          maximumLogBytes: 100_000,
        }
      : {
          maximumInboundMessageBytes: 2_000_000,
          maximumOutboundMessageBytes: 2_000_000,
          maximumReceiptBytes: 2_000_000,
          maximumDiagnosticCount: 64,
          maximumLogBytes: 100_000,
        }),
  });
}
