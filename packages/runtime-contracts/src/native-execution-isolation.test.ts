import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";

import { sha256CanonicalJson } from "@whitebox-world/protocol";

import isolationSchema from "./native-execution-isolation-v1.schema.json";

import {
  hashNativeEffectiveExecutionBudgetV1,
  hashNativeExecutionTrustProfileBodyV1,
  hashNativeIsolatedExecutionRequestV1,
  hashNativeIsolatedExecutionResultV1,
  parseNativeEffectiveExecutionBudgetV1,
  parseNativeExecutionTrustProfileV1,
  parseNativeIsolatedExecutionReceiptV1,
  parseNativeIsolatedExecutionRequestV1,
  parseNativeIsolatedExecutionResultV1,
  parseNativeIsolationTransportEnvelopeV1,
  verifyNativeIsolatedExecutionReceiptV1,
} from "./native-execution-isolation";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const HASH_D = `sha256:${"d".repeat(64)}` as const;
const HASH_E = `sha256:${"e".repeat(64)}` as const;
const HASH_F = `sha256:${"f".repeat(64)}` as const;

function hostedTrustProfileBody() {
  return {
    kind: "native-execution-trust-profile",
    schemaVersion: 1,
    id: "native-execution-trust-profile.hosted-isolated",
    resourceRef:
      "worldkit://native-execution-trust-profile/hosted-isolated@1",
    trustMode: "hosted-isolated",
    requiredIsolationCapabilityIds: [
      "credential-isolation",
      "network-isolation",
      "process-tree-termination",
      "resource-hard-limits",
    ],
  } as const;
}

function hostedTrustProfile() {
  const body = hostedTrustProfileBody();
  return {
    ...body,
    contentHash: hashNativeExecutionTrustProfileBodyV1(body),
  } as const;
}

function effectiveBudget() {
  return {
    scene: {
      maximumVertices: 101,
      maximumTriangles: 202,
      maximumColliders: 3,
    },
    assets: {
      maximumAssetCount: 4,
      maximumAssetBytes: 5_005,
      maximumTextureCount: 6,
      maximumTextureBytes: 7_007,
    },
    runtime: {
      maximumSceneNodeCount: 8,
      maximumMaterialCount: 9,
      maximumShaderCount: 10,
      maximumPhysicsBodyCount: 11,
    },
    process: {
      maximumWallTimeMilliseconds: 12_012,
      maximumCpuTimeMilliseconds: 13_013,
      maximumMemoryBytes: 14_014,
      maximumProcessCount: 15,
    },
    protocol: {
      maximumInboundMessageBytes: 16_016,
      maximumOutboundMessageBytes: 17_017,
      maximumReceiptBytes: 18_018,
      maximumDiagnosticCount: 19,
      maximumLogBytes: 20_020,
    },
  } as const;
}

function hostedRequest() {
  const budget = effectiveBudget();
  const profile = hostedTrustProfile();
  return {
    kind: "native-isolated-execution-request",
    schemaVersion: 1,
    id: "native-isolated-execution-request.cloud-ridge.001",
    runtimeSessionId: "runtime.hosted.cloud-ridge.001",
    worldPackageRef:
      `package://world-package/sha256/${"a".repeat(64)}`,
    worldPackageRootHash: HASH_A,
    worldBuildIdentityHash: HASH_B,
    sceneModuleBundleHash: HASH_C,
    nativeSceneContributionHash: HASH_D,
    nativeExecutionTrustProfileRef: profile.resourceRef,
    nativeExecutionTrustProfileHash: profile.contentHash,
    runnerIdentityRef: "worldkit://native-isolation-runner/linux-container@1",
    runnerImageDigest: HASH_E,
    sandboxPolicyHash: HASH_F,
    effectiveBudget: budget,
    effectiveBudgetHash: hashNativeEffectiveExecutionBudgetV1(budget),
    requestedOperation: { mode: "interactive-session" },
    sessionNonce: "session-nonce.cloud-ridge.001",
  } as const;
}

function readyResult() {
  return {
    kind: "native-isolated-execution-result",
    schemaVersion: 1,
    id: "native-isolated-execution-result.cloud-ridge.001",
    requestId: hostedRequest().id,
    runtimeSessionId: hostedRequest().runtimeSessionId,
    status: "ready",
    runtimeSessionUri: "worldkit://runtime-session/runtime.hosted.cloud-ridge.001",
    initialSnapshotHash: HASH_A,
  } as const;
}

function completedResult() {
  return {
    kind: "native-isolated-execution-result",
    schemaVersion: 1,
    id: "native-isolated-execution-result.cloud-ridge.completed.001",
    requestId: hostedRequest().id,
    runtimeSessionId: hostedRequest().runtimeSessionId,
    status: "completed",
    outputHashes: [HASH_C],
    finalSnapshotHash: HASH_D,
  } as const;
}

function usage() {
  return {
    scene: {
      actualVertices: 21,
      actualTriangles: 22,
      actualColliders: 2,
    },
    assets: {
      actualAssetCount: 1,
      actualAssetBytes: 23,
      actualTextureCount: 2,
      actualTextureBytes: 24,
    },
    runtime: {
      actualSceneNodeCount: 25,
      actualMaterialCount: 3,
      actualShaderCount: 4,
      actualPhysicsBodyCount: 5,
    },
    process: {
      actualWallTimeMilliseconds: 26,
      actualCpuTimeMilliseconds: 27,
      peakMemoryBytes: 28,
      peakProcessCount: 1,
    },
    protocol: {
      actualInboundMessageBytes: 29,
      actualOutboundMessageBytes: 30,
      actualReceiptBytes: 31,
      actualDiagnosticCount: 0,
      actualLogBytes: 32,
    },
  } as const;
}

function completedReceipt() {
  const request = hostedRequest();
  const result = completedResult();
  return {
    kind: "native-isolated-execution-receipt",
    schemaVersion: 1,
    id: "native-isolated-execution-receipt.cloud-ridge.001",
    requestId: request.id,
    requestHash: hashNativeIsolatedExecutionRequestV1(request),
    runtimeSessionId: request.runtimeSessionId,
    worldPackageRootHash: request.worldPackageRootHash,
    nativeExecutionTrustProfileRef:
      request.nativeExecutionTrustProfileRef,
    nativeExecutionTrustProfileHash:
      request.nativeExecutionTrustProfileHash,
    runnerIdentityRef: request.runnerIdentityRef,
    runnerImageDigest: request.runnerImageDigest,
    sandboxPolicyHash: request.sandboxPolicyHash,
    effectiveBudgetHash: request.effectiveBudgetHash,
    usage: usage(),
    requestedOperation: request.requestedOperation,
    outcome: "completed",
    resultHash: hashNativeIsolatedExecutionResultV1(result),
    durationMilliseconds: 33,
    cleanup: { status: "complete" },
    isolationAttestationRef:
      "worldkit://native-isolation-attestation/cloud-ridge.001@1",
    isolationAttestationHash: HASH_B,
  } as const;
}

describe("Native execution isolation contracts", () => {
  it("publishes a strict JSON Schema for every new persistent DTO", () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      isolationSchema,
    );
    for (const value of [
      hostedTrustProfile(),
      effectiveBudget(),
      hostedRequest(),
      readyResult(),
      completedReceipt(),
    ]) {
      expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    }
    expect(validate({ ...hostedRequest(), trustProfileRef: "legacy" })).toBe(
      false,
    );
    expect(validate({
      ...effectiveBudget(),
      process: { ...effectiveBudget().process, maximumProcessCount: 0 },
    })).toBe(false);
  });

  it("parses and hashes one exact Hosted trust profile and request", () => {
    const profile = parseNativeExecutionTrustProfileV1(hostedTrustProfile());
    const request = parseNativeIsolatedExecutionRequestV1(hostedRequest());

    expect(profile.trustMode).toBe("hosted-isolated");
    expect(profile.contentHash).toBe(
      hashNativeExecutionTrustProfileBodyV1(hostedTrustProfileBody()),
    );
    expect(request.nativeExecutionTrustProfileRef).toBe(profile.resourceRef);
    expect(hashNativeIsolatedExecutionRequestV1(request)).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.effectiveBudget.process)).toBe(true);
  });

  it.each(["sandboxProfileRef", "trustProfileRef", "isTrusted"])(
    "rejects the non-canonical trust alias %s",
    (field) => {
      const input: Record<string, unknown> = { ...hostedRequest() };
      delete input.nativeExecutionTrustProfileRef;
      input[field] = hostedRequest().nativeExecutionTrustProfileRef;
      expect(() => parseNativeIsolatedExecutionRequestV1(input)).toThrow(
        /NativeIsolatedExecutionRequestV1/,
      );
    },
  );

  it("rejects a Trust Profile whose declared content hash is stale", () => {
    expect(() => parseNativeExecutionTrustProfileV1({
      ...hostedTrustProfile(),
      contentHash: HASH_A,
    })).toThrow(/NativeExecutionTrustProfileV1/);
  });

  it("rejects field swaps, zero, unsafe integers, accessors and unknown budget keys", () => {
    expect(() => parseNativeEffectiveExecutionBudgetV1({
      ...effectiveBudget(),
      scene: {
        ...effectiveBudget().scene,
        maximumVertices: effectiveBudget().scene.maximumTriangles,
        maximumTriangles: effectiveBudget().scene.maximumVertices,
      },
    })).not.toThrow();
    expect(() => parseNativeEffectiveExecutionBudgetV1({
      ...effectiveBudget(),
      process: { ...effectiveBudget().process, maximumProcessCount: 0 },
    })).toThrow(/NativeEffectiveExecutionBudgetV1/);
    expect(() => parseNativeEffectiveExecutionBudgetV1({
      ...effectiveBudget(),
      protocol: {
        ...effectiveBudget().protocol,
        maximumLogBytes: Number.MAX_SAFE_INTEGER + 1,
      },
    })).toThrow(/NativeEffectiveExecutionBudgetV1/);
    expect(() => parseNativeEffectiveExecutionBudgetV1({
      ...effectiveBudget(),
      extra: true,
    })).toThrow(/NativeEffectiveExecutionBudgetV1/);

    const accessor = { ...effectiveBudget() } as Record<string, unknown>;
    Object.defineProperty(accessor, "scene", {
      enumerable: true,
      get: () => effectiveBudget().scene,
    });
    expect(() => parseNativeEffectiveExecutionBudgetV1(accessor)).toThrow(
      /NativeEffectiveExecutionBudgetV1/,
    );
  });

  it("parses every closed operation and terminal result branch", () => {
    const baseRequest = hostedRequest();
    expect(parseNativeIsolatedExecutionRequestV1({
      ...baseRequest,
      requestedOperation: { mode: "check" },
    }).requestedOperation).toEqual({ mode: "check" });
    expect(parseNativeIsolatedExecutionRequestV1({
      ...baseRequest,
      requestedOperation: { mode: "capture", captureRequestHash: HASH_A },
    }).requestedOperation).toEqual({
      mode: "capture",
      captureRequestHash: HASH_A,
    });

    const base = {
      kind: "native-isolated-execution-result",
      schemaVersion: 1,
      id: "native-isolated-execution-result.branch",
      requestId: baseRequest.id,
      runtimeSessionId: baseRequest.runtimeSessionId,
    } as const;
    const results = [
      readyResult(),
      {
        ...base,
        status: "completed",
        outputHashes: [HASH_A, HASH_B],
        finalSnapshotHash: HASH_C,
      },
      {
        ...base,
        status: "rejected",
        stage: "runtime-replay",
        diagnostics: [{
          code: "WORLDKIT_NATIVE_SCENE_RUNTIME_REPLAY_REJECTED",
          message: "Runtime replay was rejected.",
        }],
      },
      { ...base, status: "terminated", reason: "timeout" },
      {
        ...base,
        status: "cleanup-failed",
        quarantineId: "native-isolation-quarantine.branch",
      },
    ] as const;

    expect(results.map((result) =>
      parseNativeIsolatedExecutionResultV1(result).status
    )).toEqual([
      "ready",
      "completed",
      "rejected",
      "terminated",
      "cleanup-failed",
    ]);
  });

  it("verifies a receipt against the exact request and result", () => {
    const verified = verifyNativeIsolatedExecutionReceiptV1({
      request: hostedRequest(),
      result: completedResult(),
      receipt: completedReceipt(),
    });
    expect(verified.outcome).toBe("completed");
    expect(parseNativeIsolatedExecutionReceiptV1(verified)).toEqual(verified);
  });

  it("rejects a Receipt for the non-terminal ready result", () => {
    expect(() => verifyNativeIsolatedExecutionReceiptV1({
      request: hostedRequest(),
      result: readyResult(),
      receipt: {
        ...completedReceipt(),
        outcome: "ready",
        resultHash: hashNativeIsolatedExecutionResultV1(readyResult()),
      },
    })).toThrow(/NativeIsolatedExecutionReceiptV1/);
  });

  it("rejects request, budget, result, outcome and operation drift", () => {
    const request = hostedRequest();
    const result = completedResult();
    const receipt = completedReceipt();
    for (const drifted of [
      { ...receipt, requestHash: HASH_A },
      { ...receipt, effectiveBudgetHash: HASH_A },
      { ...receipt, resultHash: HASH_A },
      { ...receipt, outcome: "terminated" },
      { ...receipt, requestedOperation: { mode: "check" } },
    ]) {
      expect(() => verifyNativeIsolatedExecutionReceiptV1({
        request,
        result,
        receipt: drifted,
      })).toThrow(/NativeIsolatedExecutionReceiptV1/);
    }
  });

  it("wraps only an exact Runtime Session Protocol value", () => {
    const request = hostedRequest();
    const payload = {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-session-request.snapshot.001",
      runtimeSessionId: request.runtimeSessionId,
      type: "snapshot.get",
    } as const;
    const envelope = parseNativeIsolationTransportEnvelopeV1({
      kind: "native-isolation-transport-envelope",
      schemaVersion: 1,
      runtimeSessionId: request.runtimeSessionId,
      sessionNonce: request.sessionNonce,
      messageSequence: 1,
      payload,
    });
    expect(envelope.payload).toEqual(payload);

    expect(() => parseNativeIsolationTransportEnvelopeV1({
      ...envelope,
      payload: { ...payload, hostedReset: true },
    })).toThrow(/NativeIsolationTransportEnvelopeV1/);
    expect(() => parseNativeIsolationTransportEnvelopeV1({
      ...envelope,
      messageSequence: 0,
    })).toThrow(/NativeIsolationTransportEnvelopeV1/);
  });

  it("does not accept a receipt hash manufactured from non-canonical data", () => {
    const request = hostedRequest();
    const result = completedResult();
    const receipt = completedReceipt();
    expect(receipt.requestHash).toBe(sha256CanonicalJson(request));
    expect(receipt.resultHash).toBe(sha256CanonicalJson(result));
  });
});
