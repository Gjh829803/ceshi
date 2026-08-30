import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  hashNativeEffectiveExecutionBudgetV1,
  hashNativeIsolatedExecutionRequestV1,
  hashNativeIsolatedExecutionResultV1,
  type NativeEffectiveExecutionBudgetV1,
  type NativeIsolatedExecutionRequestV1,
  type NativeIsolatedExecutionResultV1,
  type NativeIsolationCleanupV1,
  type NativeIsolationTerminationReasonV1,
} from "@whitebox-world/runtime-contracts";

import {
  NativeIsolationProviderTerminationErrorV1,
  NativeIsolationSupervisorV1,
  type NativeIsolationAttestationVerifierV1,
  type NativeIsolationDeadlineSchedulerV1,
  type NativeIsolationProviderV1,
  type NativeIsolationReceiptEvidenceV1,
  type PreparedNativeIsolationV1,
} from "./native-isolation-supervisor";
import {
  HOSTED_ISOLATED_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1,
  resolveNativeExecutionTrustProfileV1,
} from "./native-execution-trust-profile-registry";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const HASH_D = `sha256:${"d".repeat(64)}` as const;
const HASH_E = `sha256:${"e".repeat(64)}` as const;
const HASH_F = `sha256:${"f".repeat(64)}` as const;

function budget(
  maximumWallTimeMilliseconds = 100,
): NativeEffectiveExecutionBudgetV1 {
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
      maximumWallTimeMilliseconds,
      maximumCpuTimeMilliseconds: 13_013,
      maximumMemoryBytes: 14_014,
      maximumProcessCount: 15,
    },
    protocol: {
      maximumInboundMessageBytes: 4_096,
      maximumOutboundMessageBytes: 4_097,
      maximumReceiptBytes: 8_192,
      maximumDiagnosticCount: 19,
      maximumLogBytes: 20_020,
    },
  } as const;
}

function request(
  effectiveBudget = budget(),
): NativeIsolatedExecutionRequestV1 {
  const trustProfile = resolveNativeExecutionTrustProfileV1(
    HOSTED_ISOLATED_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1,
  );
  return {
    kind: "native-isolated-execution-request",
    schemaVersion: 1,
    id: "native-isolated-execution-request.supervisor.001",
    runtimeSessionId: "runtime.supervisor.001",
    worldPackageRef: `package://world-package/sha256/${"a".repeat(64)}`,
    worldPackageRootHash: HASH_A,
    worldBuildIdentityHash: HASH_B,
    sceneModuleBundleHash: HASH_C,
    nativeSceneContributionHash: HASH_D,
    nativeExecutionTrustProfileRef: trustProfile.resourceRef,
    nativeExecutionTrustProfileHash: trustProfile.contentHash,
    runnerIdentityRef: "worldkit://native-isolation-runner/test@1",
    runnerImageDigest: HASH_F,
    sandboxPolicyHash: HASH_B,
    effectiveBudget,
    effectiveBudgetHash: hashNativeEffectiveExecutionBudgetV1(effectiveBudget),
    requestedOperation: { mode: "interactive-session" },
    sessionNonce: "nonce.supervisor.001",
  };
}

function readyResult(): NativeIsolatedExecutionResultV1 {
  return {
    kind: "native-isolated-execution-result",
    schemaVersion: 1,
    id: "native-isolated-execution-result.ready.001",
    requestId: request().id,
    runtimeSessionId: request().runtimeSessionId,
    status: "ready",
    runtimeSessionUri: "worldkit://runtime-session/runtime.supervisor.001",
    initialSnapshotHash: HASH_C,
  };
}

function terminatedResult(
  reason: NativeIsolationTerminationReasonV1,
): NativeIsolatedExecutionResultV1 {
  return {
    kind: "native-isolated-execution-result",
    schemaVersion: 1,
    id: `native-isolated-execution-result.${reason}.001`,
    requestId: request().id,
    runtimeSessionId: request().runtimeSessionId,
    status: "terminated",
    reason,
  };
}

function cleanupFailedResult(): NativeIsolatedExecutionResultV1 {
  return {
    kind: "native-isolated-execution-result",
    schemaVersion: 1,
    id: "native-isolated-execution-result.cleanup-failed.001",
    requestId: request().id,
    runtimeSessionId: request().runtimeSessionId,
    status: "cleanup-failed",
    quarantineId: "native-isolation-quarantine.supervisor.001",
  };
}

function usage() {
  return {
    scene: { actualVertices: 1, actualTriangles: 2, actualColliders: 3 },
    assets: {
      actualAssetCount: 0,
      actualAssetBytes: 0,
      actualTextureCount: 0,
      actualTextureBytes: 0,
    },
    runtime: {
      actualSceneNodeCount: 1,
      actualMaterialCount: 0,
      actualShaderCount: 0,
      actualPhysicsBodyCount: 1,
    },
    process: {
      actualWallTimeMilliseconds: 100,
      actualCpuTimeMilliseconds: 1,
      peakMemoryBytes: 2,
      peakProcessCount: 1,
    },
    protocol: {
      actualInboundMessageBytes: 0,
      actualOutboundMessageBytes: 0,
      actualReceiptBytes: 1,
      actualDiagnosticCount: 0,
      actualLogBytes: 0,
    },
  } as const;
}

const ATTESTATION_BYTES = new Uint8Array([1, 2, 3]);
const ATTESTATION_HASH = `sha256:${createHash("sha256")
  .update(ATTESTATION_BYTES)
  .digest("hex")}` as const;

function terminalEvidence(
  executionRequest: NativeIsolatedExecutionRequestV1,
  result: NativeIsolatedExecutionResultV1,
): NativeIsolationReceiptEvidenceV1 {
  if (result.status === "ready") throw new Error("terminal result required");
  const cleanup: NativeIsolationCleanupV1 = result.status === "cleanup-failed"
    ? { status: "quarantined", quarantineId: result.quarantineId }
    : { status: "complete" };
  return {
    result,
    receipt: {
      kind: "native-isolated-execution-receipt",
      schemaVersion: 1,
      id: "native-isolated-execution-receipt.supervisor.001",
      requestId: executionRequest.id,
      requestHash: hashNativeIsolatedExecutionRequestV1(executionRequest),
      runtimeSessionId: executionRequest.runtimeSessionId,
      worldPackageRootHash: executionRequest.worldPackageRootHash,
      nativeExecutionTrustProfileRef:
        executionRequest.nativeExecutionTrustProfileRef,
      nativeExecutionTrustProfileHash:
        executionRequest.nativeExecutionTrustProfileHash,
      runnerIdentityRef: executionRequest.runnerIdentityRef,
      runnerImageDigest: executionRequest.runnerImageDigest,
      sandboxPolicyHash: executionRequest.sandboxPolicyHash,
      effectiveBudgetHash: executionRequest.effectiveBudgetHash,
      usage: usage(),
      requestedOperation: executionRequest.requestedOperation,
      outcome: result.status,
      resultHash: hashNativeIsolatedExecutionResultV1(result),
      durationMilliseconds: 100,
      cleanup,
      isolationAttestationRef:
        "worldkit://native-isolation-attestation/supervisor.001@1",
      isolationAttestationHash: ATTESTATION_HASH,
    },
    attestationBytes: ATTESTATION_BYTES,
  };
}

class ManualDeadlineScheduler implements NativeIsolationDeadlineSchedulerV1 {
  private elapsedMilliseconds = 0;
  private readonly deadlines: Array<{
    atMilliseconds: number;
    callback: () => void;
    isCancelled: boolean;
  }> = [];

  schedule(delayMilliseconds: number, callback: () => void): () => void {
    const deadline = {
      atMilliseconds: this.elapsedMilliseconds + delayMilliseconds,
      callback,
      isCancelled: false,
    };
    this.deadlines.push(deadline);
    return () => {
      deadline.isCancelled = true;
    };
  }

  advanceBy(milliseconds: number): void {
    this.elapsedMilliseconds += milliseconds;
    for (const deadline of this.deadlines) {
      if (!deadline.isCancelled && deadline.atMilliseconds <= this.elapsedMilliseconds) {
        deadline.isCancelled = true;
        deadline.callback();
      }
    }
  }
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function fakeProvider(
  startResult = readyResult(),
  executionRequest = request(),
) {
  let terminalResult: NativeIsolatedExecutionResultV1 = startResult;
  const prepared: PreparedNativeIsolationV1 = {
    start: vi.fn(async () => startResult),
    submit: vi.fn(async (envelope) => envelope),
    terminate: vi.fn(async (reason) => {
      terminalResult = terminatedResult(reason);
      return terminalResult;
    }),
    dispose: vi.fn(async () => undefined),
    collectReceipt: vi.fn(async () =>
      terminalEvidence(executionRequest, terminalResult)),
  };
  const provider: NativeIsolationProviderV1 = {
    runnerIdentityRef: executionRequest.runnerIdentityRef,
    prepare: vi.fn(async () => prepared),
  };
  return { provider, prepared };
}

function supervisorInput(
  provider: NativeIsolationProviderV1,
  deadlineScheduler = new ManualDeadlineScheduler(),
) {
  const verify = vi.fn<NativeIsolationAttestationVerifierV1["verify"]>(
    async () => ({ status: "verified" as const }),
  );
  return {
    request: request(),
    provider,
    deadlineScheduler,
    attestationVerifier: {
      verify,
    },
  };
}

describe("NativeIsolationSupervisorV1", () => {
  it("does not allocate a provider for a malformed request or cap", () => {
    const { provider } = fakeProvider();
    expect(() => NativeIsolationSupervisorV1.create({
      ...supervisorInput(provider),
      request: { ...request(), trustProfileRef: "legacy" },
    })).toThrow(/NativeIsolatedExecutionRequestV1/);
    expect(provider.prepare).not.toHaveBeenCalled();
  });

  it("rejects an unknown or hash-drifted Trust Profile before provider allocation", () => {
    const { provider } = fakeProvider();
    for (const executionRequest of [
      {
        ...request(),
        nativeExecutionTrustProfileRef:
          "worldkit://native-execution-trust-profile/unknown@1",
      },
      { ...request(), nativeExecutionTrustProfileHash: HASH_E },
    ]) {
      expect(() => NativeIsolationSupervisorV1.create({
        ...supervisorInput(provider),
        request: executionRequest,
      })).toThrow(expect.objectContaining({
        code: "NATIVE_ISOLATION_TRUST_PROFILE_INVALID",
      }));
    }
    expect(provider.prepare).not.toHaveBeenCalled();
  });

  it("times out, kills, collects verified control-plane evidence and disposes once", async () => {
    const clock = new ManualDeadlineScheduler();
    const startedDeferred = deferred<NativeIsolatedExecutionResultV1>();
    const { provider, prepared } = fakeProvider();
    vi.mocked(prepared.start).mockReturnValue(startedDeferred.promise);
    const input = supervisorInput(provider, clock);
    const supervisor = NativeIsolationSupervisorV1.create(input);

    const started = supervisor.start();
    await vi.waitFor(() => expect(prepared.start).toHaveBeenCalledOnce());
    clock.advanceBy(request().effectiveBudget.process.maximumWallTimeMilliseconds + 1);

    await expect(started).resolves.toMatchObject({
      status: "terminated",
      reason: "timeout",
    });
    expect(prepared.terminate).toHaveBeenCalledOnce();
    expect(prepared.dispose).toHaveBeenCalledOnce();
    expect(prepared.collectReceipt).toHaveBeenCalledOnce();
    expect(input.attestationVerifier.verify).toHaveBeenCalledOnce();
    await supervisor.dispose();
    await supervisor.dispose();
    expect(prepared.dispose).toHaveBeenCalledOnce();
  });

  it("supports one ready session and rejects duplicate start", async () => {
    const { provider } = fakeProvider();
    const supervisor = NativeIsolationSupervisorV1.create(
      supervisorInput(provider),
    );
    await expect(supervisor.start()).resolves.toMatchObject({ status: "ready" });
    await expect(supervisor.start()).rejects.toMatchObject({
      code: "NATIVE_ISOLATION_LIFECYCLE_INVALID",
    });
  });

  it("cancels during start and preserves host-cancelled as the first reason", async () => {
    const startedDeferred = deferred<NativeIsolatedExecutionResultV1>();
    const { provider, prepared } = fakeProvider();
    vi.mocked(prepared.start).mockReturnValue(startedDeferred.promise);
    const supervisor = NativeIsolationSupervisorV1.create(
      supervisorInput(provider),
    );

    const started = supervisor.start();
    await vi.waitFor(() => expect(prepared.start).toHaveBeenCalledOnce());
    await supervisor.terminate("host-cancelled");
    await expect(started).resolves.toMatchObject({
      status: "terminated",
      reason: "host-cancelled",
    });
    expect(vi.mocked(provider.prepare).mock.calls[0]?.[1].aborted).toBe(true);
    expect(prepared.terminate).toHaveBeenCalledOnce();
  });

  it("enforces nonce, monotonically increasing sequence and message limits", async () => {
    const constrainedBudget = {
      ...budget(),
      protocol: {
        ...budget().protocol,
        maximumInboundMessageBytes: 1_000,
        maximumOutboundMessageBytes: 1_000,
      },
    };
    const executionRequest = request(constrainedBudget);
    const { provider, prepared } = fakeProvider(readyResult(), executionRequest);
    const supervisor = NativeIsolationSupervisorV1.create({
      ...supervisorInput(provider),
      request: executionRequest,
    });
    await supervisor.start();
    const envelope = {
      kind: "native-isolation-transport-envelope",
      schemaVersion: 1,
      runtimeSessionId: executionRequest.runtimeSessionId,
      sessionNonce: executionRequest.sessionNonce,
      messageSequence: 1,
      payload: {
        kind: "worldkit-runtime-session-request",
        schemaVersion: 1,
        id: "runtime-session-request.snapshot.001",
        runtimeSessionId: executionRequest.runtimeSessionId,
        type: "snapshot.get",
      },
    } as const;
    await expect(supervisor.submit(envelope)).resolves.toEqual(envelope);
    await expect(supervisor.submit(envelope)).rejects.toMatchObject({
      code: "NATIVE_ISOLATION_PROTOCOL_INVALID",
    });
    await expect(supervisor.submit({
      ...envelope,
      messageSequence: 2,
      sessionNonce: "wrong-nonce",
    })).rejects.toMatchObject({ code: "NATIVE_ISOLATION_LIFECYCLE_INVALID" });
    expect(prepared.submit).toHaveBeenCalledOnce();
  });

  it("fails closed when control-plane attestation is rejected", async () => {
    const completed = {
      kind: "native-isolated-execution-result",
      schemaVersion: 1,
      id: "native-isolated-execution-result.completed.001",
      requestId: request().id,
      runtimeSessionId: request().runtimeSessionId,
      status: "completed",
      outputHashes: [HASH_C],
      finalSnapshotHash: HASH_D,
    } as const;
    const { provider } = fakeProvider(completed);
    const input = supervisorInput(provider);
    vi.mocked(input.attestationVerifier.verify).mockResolvedValue({
      status: "rejected",
      diagnosticCode: "TEST_ATTESTATION_REJECTED",
    });
    const supervisor = NativeIsolationSupervisorV1.create(input);

    await expect(supervisor.start()).rejects.toMatchObject({
      code: "NATIVE_ISOLATION_ATTESTATION_REJECTED",
    });
  });

  it("rejects a drifted receipt after provider cleanup", async () => {
    const completed = {
      kind: "native-isolated-execution-result",
      schemaVersion: 1,
      id: "native-isolated-execution-result.completed.drift.001",
      requestId: request().id,
      runtimeSessionId: request().runtimeSessionId,
      status: "completed",
      outputHashes: [HASH_C],
      finalSnapshotHash: HASH_D,
    } as const;
    const { provider, prepared } = fakeProvider(completed);
    const evidence = terminalEvidence(request(), completed);
    vi.mocked(prepared.collectReceipt).mockResolvedValue({
      ...evidence,
      receipt: { ...evidence.receipt, requestHash: HASH_F },
    });
    const supervisor = NativeIsolationSupervisorV1.create(
      supervisorInput(provider),
    );

    await expect(supervisor.start()).rejects.toMatchObject({
      code: "NATIVE_ISOLATION_RECEIPT_INVALID",
    });
  });

  it("publishes cleanup-failed evidence when provider disposal throws", async () => {
    const completed = {
      kind: "native-isolated-execution-result",
      schemaVersion: 1,
      id: "native-isolated-execution-result.completed.cleanup.001",
      requestId: request().id,
      runtimeSessionId: request().runtimeSessionId,
      status: "completed",
      outputHashes: [HASH_C],
      finalSnapshotHash: HASH_D,
    } as const;
    const { provider, prepared } = fakeProvider(completed);
    vi.mocked(prepared.dispose).mockRejectedValue(new Error("private failure"));
    vi.mocked(prepared.collectReceipt).mockResolvedValue(
      terminalEvidence(request(), cleanupFailedResult()),
    );
    const supervisor = NativeIsolationSupervisorV1.create(
      supervisorInput(provider),
    );

    await expect(supervisor.start()).resolves.toMatchObject({
      status: "cleanup-failed",
      quarantineId: "native-isolation-quarantine.supervisor.001",
    });
    await supervisor.dispose();
    expect(prepared.collectReceipt).toHaveBeenCalledOnce();
  });

  it("maps provider loss after ready to one provider-lost termination", async () => {
    const { provider, prepared } = fakeProvider();
    vi.mocked(prepared.submit).mockRejectedValue(new Error("private loss"));
    const supervisor = NativeIsolationSupervisorV1.create(
      supervisorInput(provider),
    );
    await supervisor.start();
    const executionRequest = request();

    await expect(supervisor.submit({
      kind: "native-isolation-transport-envelope",
      schemaVersion: 1,
      runtimeSessionId: executionRequest.runtimeSessionId,
      sessionNonce: executionRequest.sessionNonce,
      messageSequence: 1,
      payload: {
        kind: "worldkit-runtime-session-request",
        schemaVersion: 1,
        id: "runtime-session-request.snapshot.provider-loss.001",
        runtimeSessionId: executionRequest.runtimeSessionId,
        type: "snapshot.get",
      },
    })).rejects.toMatchObject({ code: "NATIVE_ISOLATION_PROVIDER_FAILED" });
    expect(prepared.terminate).toHaveBeenCalledWith("provider-lost");
  });

  it("preserves a provider-observed resource termination reason", async () => {
    const { provider, prepared } = fakeProvider();
    vi.mocked(prepared.submit).mockRejectedValue(
      new NativeIsolationProviderTerminationErrorV1("output-limit"),
    );
    const supervisor = NativeIsolationSupervisorV1.create(
      supervisorInput(provider),
    );
    await supervisor.start();
    const executionRequest = request();

    await expect(supervisor.submit({
      kind: "native-isolation-transport-envelope",
      schemaVersion: 1,
      runtimeSessionId: executionRequest.runtimeSessionId,
      sessionNonce: executionRequest.sessionNonce,
      messageSequence: 1,
      payload: {
        kind: "worldkit-runtime-session-request",
        schemaVersion: 1,
        id: "runtime-session-request.snapshot.output-limit.001",
        runtimeSessionId: executionRequest.runtimeSessionId,
        type: "snapshot.get",
      },
    })).rejects.toMatchObject({ code: "NATIVE_ISOLATION_PROVIDER_FAILED" });
    expect(prepared.terminate).toHaveBeenCalledWith("output-limit");
  });

  it.each([
    ["inbound", 1, 4_096],
    ["outbound", 4_096, 1],
  ] as const)("terminates an oversized %s protocol message", async (
    _direction,
    maximumInboundMessageBytes,
    maximumOutboundMessageBytes,
  ) => {
    const constrainedBudget = {
      ...budget(),
      protocol: {
        ...budget().protocol,
        maximumInboundMessageBytes,
        maximumOutboundMessageBytes,
      },
    };
    const executionRequest = request(constrainedBudget);
    const { provider, prepared } = fakeProvider(readyResult(), executionRequest);
    const supervisor = NativeIsolationSupervisorV1.create({
      ...supervisorInput(provider),
      request: executionRequest,
    });
    await supervisor.start();

    await expect(supervisor.submit({
      kind: "native-isolation-transport-envelope",
      schemaVersion: 1,
      runtimeSessionId: executionRequest.runtimeSessionId,
      sessionNonce: executionRequest.sessionNonce,
      messageSequence: 1,
      payload: {
        kind: "worldkit-runtime-session-request",
        schemaVersion: 1,
        id: "runtime-session-request.snapshot.oversize.001",
        runtimeSessionId: executionRequest.runtimeSessionId,
        type: "snapshot.get",
      },
    })).rejects.toMatchObject({ code: "NATIVE_ISOLATION_PROTOCOL_INVALID" });
    expect(prepared.terminate).toHaveBeenCalledWith("protocol-violation");
  });

  it("uses host-cancelled once and rejects submit after termination", async () => {
    const { provider, prepared } = fakeProvider();
    const supervisor = NativeIsolationSupervisorV1.create(
      supervisorInput(provider),
    );
    await supervisor.start();
    await supervisor.terminate("host-cancelled");
    await supervisor.terminate("host-cancelled");
    expect(prepared.terminate).toHaveBeenCalledOnce();
    await expect(supervisor.submit({})).rejects.toMatchObject({
      code: "NATIVE_ISOLATION_LIFECYCLE_INVALID",
    });
  });
});
