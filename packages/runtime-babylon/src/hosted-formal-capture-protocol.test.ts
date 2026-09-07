import { describe, expect, it } from "vitest";
import { hashFormalWorldCaptureRequestV1 } from "@whitebox-world/runtime-contracts";
import { formalCaptureRequestFixtureV1, formalHostedPayloadFixtureV1 } from "./formal-world-capture-test-fixture.js";
import { HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1, parseHostedFormalCapturePayloadV1 } from "./hosted-formal-capture-protocol.js";

describe("formal tri-view transport", () => {
  const request = { ...formalCaptureRequestFixtureV1(), visualCaptureGroups: [{
    visualTargetId: "visual-target-1", runtimeEntityIds: ["player"], frontDirectionWorldXZ: [0, -1] as const,
    role: "primary-subject" as const, semanticClassId: "subject.player", identityColor: "#E85D5D" as const,
  }] };
  const runtimeSessionId = "session-fixture";
  const payload = () => formalHostedPayloadFixtureV1({ request, runtimeSessionId });
  const parse = (value: unknown, maximumPngBytesPerArtifact = 64_000_000) => parseHostedFormalCapturePayloadV1({
    value, request, runtimeSessionId, formalRequestHash: hashFormalWorldCaptureRequestV1(request),
    protocolBudget: { ...HOSTED_FORMAL_CAPTURE_PROTOCOL_BUDGET_V1, maximumPngBytesPerArtifact },
  });
  it("transports the exact requested PNG count", () => {
    expect(parse(payload()).whiteboxTriviewPngs).toHaveLength(1);
    for (const whiteboxTriviewPngs of [[], [new Uint8Array(), new Uint8Array()], undefined]) {
      expect(() => parse({ ...payload(), whiteboxTriviewPngs })).toThrow("TRIVIEW_TARGET_COUNT_MISMATCH");
    }
  });
  it("checks each tri-view PNG under the existing byte budget", () => {
    expect(() => parse({ ...payload(), whiteboxTriviewPngs: ["not-bytes"] })).toThrow("PNG_BYTES_INVALID");
    expect(() => parse({ ...payload(), whiteboxTriviewPngs: [new Uint8Array(9)] }, 8)).toThrow("PNG_BUDGET_EXCEEDED");
  });
});
