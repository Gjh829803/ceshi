import type { NativeExecutionUsageV1 } from
  "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

export interface NativeContainerProcessUsageSampleV1 {
  readonly actualCpuTimeMilliseconds: number;
  readonly peakMemoryBytes: number;
  readonly peakProcessCount: number;
}

export type NativeContainerRuntimeUsageObservationV1 = Readonly<{
  [Key in keyof NativeExecutionUsageV1["runtime"]]:
    NativeExecutionUsageV1["runtime"][Key] | undefined;
}>;

export interface NativeContainerControlPlaneUsageInputV1 {
  readonly elapsedMilliseconds: number;
  readonly processUsage: NativeContainerProcessUsageSampleV1 | undefined;
  readonly actualInboundMessageBytes: number;
  readonly actualOutboundMessageBytes: number;
  readonly actualLogBytes: number;
}

export type NativeContainerControlPlaneUsageV1 = Readonly<
  Pick<NativeExecutionUsageV1, "process" | "protocol">
>;

function assertNonNegativeSafeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("HOSTED_NATIVE_CONTROL_PLANE_USAGE_INVALID");
  }
  return value;
}

export function buildNativeContainerRuntimeUsageV1(
  input: NativeContainerRuntimeUsageObservationV1,
): NativeExecutionUsageV1["runtime"] {
  if (Object.values(input).some((value) => isNil(value))) {
    throw new Error("HOSTED_NATIVE_RUNTIME_USAGE_UNAVAILABLE");
  }
  return Object.freeze({
    actualSceneNodeCount: assertNonNegativeSafeInteger(
      input.actualSceneNodeCount!,
    ),
    actualMaterialCount: assertNonNegativeSafeInteger(
      input.actualMaterialCount!,
    ),
    actualShaderCount: assertNonNegativeSafeInteger(
      input.actualShaderCount!,
    ),
    actualPhysicsBodyCount: assertNonNegativeSafeInteger(
      input.actualPhysicsBodyCount!,
    ),
  });
}

export function buildNativeContainerControlPlaneUsageV1(
  input: NativeContainerControlPlaneUsageInputV1,
): NativeContainerControlPlaneUsageV1 {
  if (isNil(input.processUsage)) {
    throw new Error("HOSTED_NATIVE_KERNEL_USAGE_UNAVAILABLE");
  }
  return Object.freeze({
    process: Object.freeze({
      actualWallTimeMilliseconds:
        assertNonNegativeSafeInteger(input.elapsedMilliseconds),
      actualCpuTimeMilliseconds: assertNonNegativeSafeInteger(
        input.processUsage.actualCpuTimeMilliseconds,
      ),
      peakMemoryBytes: assertNonNegativeSafeInteger(
        input.processUsage.peakMemoryBytes,
      ),
      peakProcessCount: assertNonNegativeSafeInteger(
        input.processUsage.peakProcessCount,
      ),
    }),
    protocol: Object.freeze({
      actualInboundMessageBytes:
        assertNonNegativeSafeInteger(input.actualInboundMessageBytes),
      actualOutboundMessageBytes:
        assertNonNegativeSafeInteger(input.actualOutboundMessageBytes),
      actualReceiptBytes: 0,
      actualDiagnosticCount: 0,
      actualLogBytes: assertNonNegativeSafeInteger(input.actualLogBytes),
    }),
  });
}

export type HostedNativeSecurityDiagnosticCodeV1 =
  | "HOSTED_NATIVE_ENGINE_SECCOMP_REQUIRED"
  | "HOSTED_NATIVE_EXPLICIT_SECCOMP_PROFILE_REQUIRED"
  | "HOSTED_NATIVE_ROOTLESS_OR_USER_NAMESPACE_REQUIRED";

export interface HostedNativeSecurityEvidenceV1 {
  readonly hasEngineSeccomp: boolean;
  readonly hasExplicitSeccompBinding: boolean;
  readonly hasRootlessOrUserNamespace: boolean;
  readonly diagnosticCodes: readonly HostedNativeSecurityDiagnosticCodeV1[];
  readonly hostedProductionDisposition: "eligible" | "no-go";
}

function parseDockerSecurityOptions(input: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(input);
    if (
      !Array.isArray(parsed) ||
      !parsed.every((value) => typeof value === "string")
    ) return Object.freeze([]);
    return Object.freeze([...parsed]);
  } catch {
    return Object.freeze([]);
  }
}

function hasExplicitSeccompBinding(args: readonly string[]): boolean {
  return args.some((argument, index) => {
    const value = argument === "--security-opt"
      ? args[index + 1]
      : argument.startsWith("--security-opt=")
        ? argument.slice("--security-opt=".length)
        : undefined;
    return !isNil(value) &&
      value.startsWith("seccomp=") &&
      value.length > "seccomp=".length &&
      value !== "seccomp=unconfined";
  });
}

export function evaluateHostedNativeSecurityEvidenceV1(
  input: Readonly<{
    dockerSecurityOptionsJson: string;
    containerInvocationArgs: readonly string[];
  }>,
): HostedNativeSecurityEvidenceV1 {
  const securityOptions = parseDockerSecurityOptions(
    input.dockerSecurityOptionsJson,
  );
  const hasEngineSeccomp = securityOptions.some((value) =>
    value === "seccomp" || value.startsWith("name=seccomp,")
  );
  const hasRootlessOrUserNamespace = securityOptions.some((value) =>
    value === "rootless" ||
    value === "userns" ||
    value === "name=rootless" ||
    value === "name=userns" ||
    value.startsWith("name=rootless,") ||
    value.startsWith("name=userns,")
  );
  const hasExplicitSeccompProfile = hasExplicitSeccompBinding(
    input.containerInvocationArgs,
  );
  const diagnosticCodes: HostedNativeSecurityDiagnosticCodeV1[] = [];
  if (!hasEngineSeccomp) {
    diagnosticCodes.push("HOSTED_NATIVE_ENGINE_SECCOMP_REQUIRED");
  }
  if (!hasExplicitSeccompProfile) {
    diagnosticCodes.push("HOSTED_NATIVE_EXPLICIT_SECCOMP_PROFILE_REQUIRED");
  }
  if (!hasRootlessOrUserNamespace) {
    diagnosticCodes.push(
      "HOSTED_NATIVE_ROOTLESS_OR_USER_NAMESPACE_REQUIRED",
    );
  }
  return Object.freeze({
    hasEngineSeccomp,
    hasExplicitSeccompBinding: hasExplicitSeccompProfile,
    hasRootlessOrUserNamespace,
    diagnosticCodes: Object.freeze(diagnosticCodes),
    hostedProductionDisposition: diagnosticCodes.length === 0
      ? "eligible" as const
      : "no-go" as const,
  });
}

export function hostedNativeIsolationExitCodeV1(
  evidence: HostedNativeSecurityEvidenceV1,
): 0 | 1 {
  return evidence.hostedProductionDisposition === "eligible" ? 0 : 1;
}
