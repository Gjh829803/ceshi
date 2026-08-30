import { describe, expect, it } from "vitest";

import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import {
  createBabylonNativeWorldPackageTestInputV1,
} from "@whitebox-world/world-package/testing";

import {
  admitHostedNativeExecutionRequestV1,
} from "./native-execution-admission";
import {
  HOSTED_ISOLATED_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1,
  resolveNativeExecutionTrustProfileV1,
  TRUSTED_LOCAL_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1,
} from "./native-execution-trust-profile-registry";

function verifiedNativePackage() {
  const verified = verifyWorldPackageDirectoryV1(
    createBabylonNativeWorldPackageV1(
      createBabylonNativeWorldPackageTestInputV1({
        resourceBudget: {
          maximumVertices: 500,
          maximumTriangles: 600,
          maximumColliders: 7,
        },
      }),
    ),
  );
  if (verified.kind !== "babylon-native-scene") {
    throw new Error("Expected a verified Native Package fixture.");
  }
  return verified;
}

function cap(seed: number) {
  return {
    scene: {
      maximumVertices: seed + 1,
      maximumTriangles: seed + 2,
      maximumColliders: seed + 3,
    },
    assets: {
      maximumAssetCount: seed + 4,
      maximumAssetBytes: seed + 5,
      maximumTextureCount: seed + 6,
      maximumTextureBytes: seed + 7,
    },
    runtime: {
      maximumSceneNodeCount: seed + 8,
      maximumMaterialCount: seed + 9,
      maximumShaderCount: seed + 10,
      maximumPhysicsBodyCount: seed + 11,
    },
    process: {
      maximumWallTimeMilliseconds: seed + 12,
      maximumCpuTimeMilliseconds: seed + 13,
      maximumMemoryBytes: seed + 14,
      maximumProcessCount: seed + 15,
    },
    protocol: {
      maximumInboundMessageBytes: seed + 16,
      maximumOutboundMessageBytes: seed + 17,
      maximumReceiptBytes: seed + 18,
      maximumDiagnosticCount: seed + 19,
      maximumLogBytes: seed + 20,
    },
  } as const;
}

describe("Hosted Native execution admission", () => {
  it("publishes exactly two immutable Host Trust Profiles and rejects unknown refs", () => {
    const trustedLocal = resolveNativeExecutionTrustProfileV1(
      TRUSTED_LOCAL_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1,
    );
    const hosted = resolveNativeExecutionTrustProfileV1(
      HOSTED_ISOLATED_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1,
    );
    expect(trustedLocal.trustMode).toBe("trusted-local");
    expect(hosted.trustMode).toBe("hosted-isolated");
    expect(hosted.requiredIsolationCapabilityIds).toContain(
      "control-plane-attestation",
    );
    expect(Object.isFrozen(hosted.requiredIsolationCapabilityIds)).toBe(true);
    expect(() => resolveNativeExecutionTrustProfileV1(
      "worldkit://native-execution-trust-profile/unknown@1",
    )).toThrow(/NATIVE_EXECUTION_TRUST_PROFILE_NOT_FOUND/);
  });

  it("derives Package identity, locked Trust Profile and effective minimum before allocation", () => {
    const verified = verifiedNativePackage();
    const request = admitHostedNativeExecutionRequestV1({
      id: "native-isolated-execution-request.admission.001",
      runtimeSessionId: "runtime.admission.001",
      verifiedWorldPackage: verified,
      sceneProfileBudget: {
        maximumVertices: 400,
        maximumTriangles: 700,
        maximumColliders: 5,
      },
      hostHardCap: cap(1_000),
      tenantCap: cap(2_000),
      runnerIdentityRef: "worldkit://native-isolation-runner/test@1",
      runnerImageDigest: `sha256:${"a".repeat(64)}`,
      sandboxPolicyHash: `sha256:${"b".repeat(64)}`,
      requestedOperation: { mode: "interactive-session" },
      sessionNonce: "nonce.admission.001",
    });
    const profile = resolveNativeExecutionTrustProfileV1(
      HOSTED_ISOLATED_NATIVE_EXECUTION_TRUST_PROFILE_REF_V1,
    );
    expect(request).toMatchObject({
      worldPackageRef: verified.receipt.worldPackageRef,
      worldPackageRootHash: verified.receipt.worldPackageRootHash,
      worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
      sceneModuleBundleHash: verified.sceneModuleBundleHash,
      nativeSceneContributionHash:
        verified.manifest.sceneSource.nativeSceneContributionHash,
      nativeExecutionTrustProfileRef: profile.resourceRef,
      nativeExecutionTrustProfileHash: profile.contentHash,
      effectiveBudget: {
        scene: {
          maximumVertices: 400,
          maximumTriangles: 600,
          maximumColliders: 5,
        },
        assets: cap(1_000).assets,
      },
    });
    expect(Object.isFrozen(request.effectiveBudget)).toBe(true);
  });
});
