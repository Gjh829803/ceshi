import { describe, expect, it } from "vitest";

import {
  createHostedNativeRuntimeUsageFrameV1,
  parseHostedNativeRuntimeUsageFrameV1,
} from "./runtime-usage-frame";

const HASH = `sha256:${"a".repeat(64)}` as const;

describe("Hosted Native provider-private Runtime usage frame", () => {
  it("round-trips one request/session-bound exact Runtime observation", () => {
    const frame = createHostedNativeRuntimeUsageFrameV1({
      requestHash: HASH,
      runtimeSessionId: "runtime.hosted.001",
      sessionNonce: "nonce.hosted.001",
      runtime: {
        actualSceneNodeCount: 19,
        actualMaterialCount: 7,
        actualShaderCount: 7,
        actualPhysicsBodyCount: 4,
      },
    });

    expect(parseHostedNativeRuntimeUsageFrameV1(frame)).toEqual(frame);
  });

  it("rejects unknown keys, identity drift and incomplete observations", () => {
    const base = createHostedNativeRuntimeUsageFrameV1({
      requestHash: HASH,
      runtimeSessionId: "runtime.hosted.001",
      sessionNonce: "nonce.hosted.001",
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
  });
});
