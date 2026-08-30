import { describe, expect, it } from "vitest";

import {
  buildNativeContainerControlPlaneUsageV1,
  buildNativeContainerRuntimeUsageV1,
  createMonotonicElapsedTimerV1,
  evaluateHostedNativeSecurityEvidenceV1,
  hostedNativeIsolationExitCodeV1,
  verifyHostedNativeCpuDeadlineEvidenceV1,
} from "./hosted-native-isolation-evidence";

describe("Hosted Native isolation control-plane evidence", () => {
  it("records only runtime usage observed by the trusted enclave", () => {
    expect(buildNativeContainerRuntimeUsageV1({
      actualSceneNodeCount: 265,
      actualMaterialCount: 7,
      actualShaderCount: 7,
      actualPhysicsBodyCount: 4,
    })).toEqual({
      actualSceneNodeCount: 265,
      actualMaterialCount: 7,
      actualShaderCount: 7,
      actualPhysicsBodyCount: 4,
    });
  });

  it("refuses a receipt when material or shader observation is absent", () => {
    expect(() => buildNativeContainerRuntimeUsageV1({
      actualSceneNodeCount: 265,
      actualMaterialCount: undefined,
      actualShaderCount: undefined,
      actualPhysicsBodyCount: 4,
    })).toThrowError("HOSTED_NATIVE_RUNTIME_USAGE_UNAVAILABLE");
  });

  it("records observed process and protocol usage without clamping it to admitted caps", () => {
    const usage = buildNativeContainerControlPlaneUsageV1({
      elapsedMilliseconds: 90_001,
      processUsage: {
        actualCpuTimeMilliseconds: 60_001,
        peakMemoryBytes: 1_073_741_825,
        peakProcessCount: 33,
      },
      actualInboundMessageBytes: 2_000_001,
      actualOutboundMessageBytes: 2_000_002,
      actualLogBytes: 262_145,
    });

    expect(usage).toEqual({
      process: {
        actualWallTimeMilliseconds: 90_001,
        actualCpuTimeMilliseconds: 60_001,
        peakMemoryBytes: 1_073_741_825,
        peakProcessCount: 33,
      },
      protocol: {
        actualInboundMessageBytes: 2_000_001,
        actualOutboundMessageBytes: 2_000_002,
        actualReceiptBytes: 0,
        actualDiagnosticCount: 0,
        actualLogBytes: 262_145,
      },
    });
  });

  it("refuses to manufacture cap-shaped usage when kernel sampling is unavailable", () => {
    expect(() => buildNativeContainerControlPlaneUsageV1({
      elapsedMilliseconds: 10,
      processUsage: undefined,
      actualInboundMessageBytes: 1,
      actualOutboundMessageBytes: 2,
      actualLogBytes: 3,
    })).toThrowError("HOSTED_NATIVE_KERNEL_USAGE_UNAVAILABLE");
  });

  it("measures receipt elapsed time from one monotonic clock origin", () => {
    const readings = [42_000.25, 43_501.75];
    const elapsedMilliseconds = createMonotonicElapsedTimerV1({
      nowMilliseconds: () => readings.shift()!,
    });

    expect(elapsedMilliseconds()).toBe(1_502);
  });

  it("accepts CPU hostile evidence only when the tested deadline wins before its harness", () => {
    expect(verifyHostedNativeCpuDeadlineEvidenceV1({
      providerDeadlineMilliseconds: 3_000,
      supervisorDeadlineMilliseconds: 30_000,
      harnessTimeoutMilliseconds: 45_000,
      harnessTimedOut: false,
      result: {
        kind: "native-isolated-execution-result",
        schemaVersion: 1,
        id: "native-isolated-execution-result.cpu.timeout",
        requestId: "native-isolated-execution-request.cpu",
        runtimeSessionId: "runtime.cpu",
        status: "terminated",
        reason: "timeout",
      },
    })).toEqual({
      providerDeadlineMilliseconds: 3_000,
      supervisorDeadlineMilliseconds: 30_000,
      harnessTimeoutMilliseconds: 45_000,
      terminationReason: "timeout",
    });
  });

  it("rejects CPU hostile evidence produced by the outer harness or an unstable reason", () => {
    const timeoutResult = {
      kind: "native-isolated-execution-result" as const,
      schemaVersion: 1 as const,
      id: "native-isolated-execution-result.cpu.timeout",
      requestId: "native-isolated-execution-request.cpu",
      runtimeSessionId: "runtime.cpu",
      status: "terminated" as const,
      reason: "timeout" as const,
    };
    expect(() => verifyHostedNativeCpuDeadlineEvidenceV1({
      providerDeadlineMilliseconds: 3_000,
      supervisorDeadlineMilliseconds: 30_000,
      harnessTimeoutMilliseconds: 3_000,
      harnessTimedOut: false,
      result: timeoutResult,
    })).toThrowError("HOSTED_NATIVE_CPU_HARNESS_DEADLINE_INVALID");
    expect(() => verifyHostedNativeCpuDeadlineEvidenceV1({
      providerDeadlineMilliseconds: 3_000,
      supervisorDeadlineMilliseconds: 30_000,
      harnessTimeoutMilliseconds: 45_000,
      harnessTimedOut: true,
      result: timeoutResult,
    })).toThrowError("HOSTED_NATIVE_CPU_HARNESS_TIMEOUT");
    expect(() => verifyHostedNativeCpuDeadlineEvidenceV1({
      providerDeadlineMilliseconds: 3_000,
      supervisorDeadlineMilliseconds: 30_000,
      harnessTimeoutMilliseconds: 45_000,
      harnessTimedOut: false,
      result: { ...timeoutResult, reason: "provider-lost" },
    })).toThrowError("HOSTED_NATIVE_CPU_TERMINATION_REASON_INVALID");
  });

  it("returns a nonzero gate when rootless/userns or an explicit seccomp profile is absent", () => {
    const missingNamespace = evaluateHostedNativeSecurityEvidenceV1({
      dockerSecurityOptionsJson: JSON.stringify([
        "name=seccomp,profile=builtin",
      ]),
      containerInvocationArgs: [
        "run",
        "--security-opt",
        "seccomp=/etc/worldkit/native-seccomp.json",
      ],
    });
    expect(missingNamespace).toEqual({
      hasEngineSeccomp: true,
      hasExplicitSeccompBinding: true,
      hasRootlessOrUserNamespace: false,
      diagnosticCodes: [
        "HOSTED_NATIVE_ROOTLESS_OR_USER_NAMESPACE_REQUIRED",
      ],
      hostedProductionDisposition: "no-go",
    });
    expect(hostedNativeIsolationExitCodeV1(missingNamespace)).toBe(1);

    const missingExplicitSeccomp = evaluateHostedNativeSecurityEvidenceV1({
      dockerSecurityOptionsJson: JSON.stringify([
        "name=seccomp,profile=builtin",
        "name=rootless",
      ]),
      containerInvocationArgs: [
        "run",
        "--security-opt",
        "no-new-privileges",
      ],
    });
    expect(missingExplicitSeccomp.diagnosticCodes).toEqual([
      "HOSTED_NATIVE_EXPLICIT_SECCOMP_PROFILE_REQUIRED",
    ]);
    expect(hostedNativeIsolationExitCodeV1(missingExplicitSeccomp)).toBe(1);
  });

  it("returns zero only for rootless/userns plus engine and explicit seccomp evidence", () => {
    const evidence = evaluateHostedNativeSecurityEvidenceV1({
      dockerSecurityOptionsJson: JSON.stringify([
        "name=seccomp,profile=builtin",
        "name=userns",
      ]),
      containerInvocationArgs: [
        "run",
        "--security-opt=seccomp=/etc/worldkit/native-seccomp.json",
      ],
    });

    expect(evidence).toEqual({
      hasEngineSeccomp: true,
      hasExplicitSeccompBinding: true,
      hasRootlessOrUserNamespace: true,
      diagnosticCodes: [],
      hostedProductionDisposition: "eligible",
    });
    expect(hostedNativeIsolationExitCodeV1(evidence)).toBe(0);
  });
});
