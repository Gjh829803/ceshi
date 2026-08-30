import {
  hashNativeEffectiveExecutionBudgetV1,
  parseNativeIsolatedExecutionRequestV1,
  type NativeEffectiveExecutionBudgetV1,
  type NativeIsolatedExecutionOperationV1,
  type NativeIsolatedExecutionRequestV1,
} from "@whitebox-world/runtime-contracts";
import type {
  VerifiedBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import type {
  WorldPackageResourceBudgetV1,
} from "@whitebox-world/world-package/runtime-contract";

import { resolveNativeEffectiveExecutionBudgetV1 } from
  "./native-execution-budget.js";
import {
  HOSTED_ISOLATED_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1,
  resolveNativeExecutionTrustProfileV1,
} from "./native-execution-trust-profile-registry.js";

export interface AdmitHostedNativeExecutionRequestInputV1 {
  readonly id: string;
  readonly runtimeSessionId: string;
  readonly verifiedWorldPackage: VerifiedBabylonNativeWorldPackageDirectoryV1;
  readonly sceneProfileBudget: WorldPackageResourceBudgetV1;
  readonly hostHardCap: NativeEffectiveExecutionBudgetV1;
  readonly tenantCap: NativeEffectiveExecutionBudgetV1;
  readonly runnerIdentityRef: string;
  readonly runnerImageDigest: `sha256:${string}`;
  readonly sandboxPolicyHash: `sha256:${string}`;
  readonly requestedOperation: NativeIsolatedExecutionOperationV1;
  readonly sessionNonce: string;
}

export function admitHostedNativeExecutionRequestV1(
  input: AdmitHostedNativeExecutionRequestInputV1,
): NativeIsolatedExecutionRequestV1 {
  const verified = input.verifiedWorldPackage;
  if (verified.kind !== "babylon-native-scene") {
    throw new TypeError(
      "HOSTED_NATIVE_EXECUTION_PACKAGE_INVALID: a verified Babylon Native Package is required.",
    );
  }
  const trustProfile = resolveNativeExecutionTrustProfileV1(
    HOSTED_ISOLATED_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1,
  );
  const effectiveBudget = resolveNativeEffectiveExecutionBudgetV1({
    trustProfile,
    sceneProfileBudget: input.sceneProfileBudget,
    worldPackageResourceBudget: verified.manifest.resourceBudget,
    hostHardCap: input.hostHardCap,
    tenantCap: input.tenantCap,
  });
  return parseNativeIsolatedExecutionRequestV1({
    kind: "native-isolated-execution-request",
    schemaVersion: 1,
    id: input.id,
    runtimeSessionId: input.runtimeSessionId,
    worldPackageRef: verified.receipt.worldPackageRef,
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
    sceneModuleBundleHash: verified.sceneModuleBundleHash,
    nativeSceneContributionHash:
      verified.manifest.sceneSource.nativeSceneContributionHash,
    nativeExecutionTrustProfileRef: trustProfile.resourceRef,
    nativeExecutionTrustProfileHash: trustProfile.contentHash,
    runnerIdentityRef: input.runnerIdentityRef,
    runnerImageDigest: input.runnerImageDigest,
    sandboxPolicyHash: input.sandboxPolicyHash,
    effectiveBudget,
    effectiveBudgetHash:
      hashNativeEffectiveExecutionBudgetV1(effectiveBudget),
    requestedOperation: input.requestedOperation,
    sessionNonce: input.sessionNonce,
  });
}

