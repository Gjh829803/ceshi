import {
  hashNativeExecutionTrustProfileBodyV1,
  parseNativeExecutionTrustProfileV1,
  type NativeExecutionTrustProfileBodyV1,
  type NativeExecutionTrustProfileV1,
} from "@whitebox-world/runtime-contracts";

export const TRUSTED_LOCAL_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1 =
  "worldkit://native-execution-trust-profile/trusted-local@1" as const;
export const HOSTED_ISOLATED_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1 =
  "worldkit://native-execution-trust-profile/hosted-isolated@1" as const;

export const HOSTED_NATIVE_EXECUTION_REQUIRED_ISOLATION_CAPABILITY_IDS_V1 =
  Object.freeze([
    "asset-budget-enforcement",
    "control-plane-attestation",
    "credential-isolation",
    "filesystem-isolation",
    "network-isolation",
    "process-budget-enforcement",
    "process-tree-termination",
    "protocol-budget-enforcement",
    "runtime-budget-enforcement",
    "scene-budget-enforcement",
  ] as const);

const TRUSTED_LOCAL_PROFILE_BODY: NativeExecutionTrustProfileBodyV1 =
  Object.freeze({
    kind: "native-execution-trust-profile",
    schemaVersion: 1,
    id: "native-execution-trust-profile.trusted-local",
    resourceRef: TRUSTED_LOCAL_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1,
    trustMode: "trusted-local",
    requiredIsolationCapabilityIds: Object.freeze([]),
  });

const HOSTED_ISOLATED_PROFILE_BODY: NativeExecutionTrustProfileBodyV1 =
  Object.freeze({
    kind: "native-execution-trust-profile",
    schemaVersion: 1,
    id: "native-execution-trust-profile.hosted-isolated",
    resourceRef: HOSTED_ISOLATED_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1,
    trustMode: "hosted-isolated",
    requiredIsolationCapabilityIds:
      HOSTED_NATIVE_EXECUTION_REQUIRED_ISOLATION_CAPABILITY_IDS_V1,
  });

const PROFILES_BY_REF = new Map<string, NativeExecutionTrustProfileV1>([
  TRUSTED_LOCAL_PROFILE_BODY,
  HOSTED_ISOLATED_PROFILE_BODY,
].map((body) => {
  const profile = parseNativeExecutionTrustProfileV1({
    ...body,
    contentHash: hashNativeExecutionTrustProfileBodyV1(body),
  });
  return [profile.resourceRef, profile] as const;
}));

export function resolveNativeExecutionTrustProfileV1(
  resourceRef: string,
): NativeExecutionTrustProfileV1 {
  const profile = PROFILES_BY_REF.get(resourceRef);
  if (profile === undefined) {
    throw new Error(
      `NATIVE_EXECUTION_TRUST_PROFILE_NOT_FOUND: '${resourceRef}'.`,
    );
  }
  return profile;
}

