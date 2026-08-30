import { describe, expect, it } from "vitest";

import {
  createHostedNativeRuntimeUsageChallengeV1,
  createHostedNativeRuntimeUsageFrameV1,
  parseHostedNativeRuntimeUsageFrameV1,
  verifyHostedNativeRuntimeUsageFrameV1,
} from "./runtime-usage-frame";

const HASH = `sha256:${"a".repeat(64)}` as const;

describe("Hosted Native provider-private Runtime usage frame", () => {
  it("round-trips one request/session-bound exact Runtime observation", () => {
    const challenge = createHostedNativeRuntimeUsageChallengeV1({
      requestHash: HASH,
      runtimeSessionId: "runtime.hosted.001",
      sessionNonce: "nonce.hosted.001",
      challengeNonce: "challenge.hosted.unpredictable.001",
    });
    const frame = createHostedNativeRuntimeUsageFrameV1({
      challenge,
      runtime: {
        actualSceneNodeCount: 19,
        actualMaterialCount: 7,
        actualShaderCount: 7,
        actualPhysicsBodyCount: 4,
      },
    });

    expect(parseHostedNativeRuntimeUsageFrameV1(frame)).toEqual(frame);
    expect(verifyHostedNativeRuntimeUsageFrameV1({
      challenge,
      frame,
    })).toEqual(frame.runtime);
  });

  it("rejects unknown keys, identity drift and incomplete observations", () => {
    const challenge = createHostedNativeRuntimeUsageChallengeV1({
      requestHash: HASH,
      runtimeSessionId: "runtime.hosted.001",
      sessionNonce: "nonce.hosted.001",
      challengeNonce: "challenge.hosted.unpredictable.001",
    });
    const base = createHostedNativeRuntimeUsageFrameV1({
      challenge,
      runtime: {
        actualSceneNodeCount: 19,
        actualMaterialCount: 7,
        actualShaderCount: 7,
        actualPhysicsBodyCount: 4,
      },
    });

    expect(() => parseHostedNativeRuntimeUsageFrameV1({
      ...base,
      extra: true,
    })).toThrow(/HOSTED_NATIVE_RUNTIME_USAGE_FRAME_INVALID/);
    expect(() => parseHostedNativeRuntimeUsageFrameV1({
      ...base,
      requestHash: "sha256:not-a-hash",
    })).toThrow(/HOSTED_NATIVE_RUNTIME_USAGE_FRAME_INVALID/);
    expect(() => parseHostedNativeRuntimeUsageFrameV1({
      ...base,
      runtime: {
        ...base.runtime,
        actualMaterialCount: undefined,
      },
    })).toThrow(/HOSTED_NATIVE_RUNTIME_USAGE_FRAME_INVALID/);
    expect(() => verifyHostedNativeRuntimeUsageFrameV1({
      challenge: {
        ...challenge,
        challengeNonce: "challenge.hosted.attacker-precomputed",
      },
      frame: base,
    })).toThrow(/HOSTED_NATIVE_RUNTIME_USAGE_PROOF_INVALID/);
    expect(() => verifyHostedNativeRuntimeUsageFrameV1({
      challenge,
      frame: {
        ...base,
        runtime: {
          ...base.runtime,
          actualSceneNodeCount: base.runtime.actualSceneNodeCount + 1,
        },
      },
    })).toThrow(/HOSTED_NATIVE_RUNTIME_USAGE_PROOF_INVALID/);
  });
});
