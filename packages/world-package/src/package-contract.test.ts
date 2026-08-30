import { canonicalJsonBytes, sha256Bytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import { hashWorldBuildIdentityV1, worldPackageRefFromRootHashV1 } from "@whitebox-world/world-identity";
import { describe, expect, it } from "vitest";

import {
  BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
  BABYLON_WEB_WORLD_PACKAGE_HOST_POLICY_V1,
  assertWorldPackageBuildReceiptV1,
  assertWorldPackageHostCompatibilityV1,
  canonicalizeWorldPackageManifestV1,
  hashWorldPackageManifestV1,
  hashWorldPackageRootV1,
  type WorldPackageBuildReceiptV1,
  type WorldPackageManifestV1,
} from "./index.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const HASH_D = `sha256:${"d".repeat(64)}` as const;

function manifestFixture(): WorldPackageManifestV1 {
  return canonicalizeWorldPackageManifestV1({
    kind: "worldkit-world-package-manifest",
    schemaVersion: 1,
    id: "fixture.package",
    title: "Fixture",
    packageFormatVersion: 1,
    sdkVersion: "0.0.0",
    worldId: "fixture",
    seed: 7,
    runtimeTarget: "babylon-web",
    canonicalizationProfile: "canonical-json-jcs@1",
    hashAlgorithm: "sha256",
    sceneSource: {
      kind: "canonical-execution-plan",
      authoringSchema: { schemaVersion: 4, contentHash: HASH_A },
      aiSchemaProjectionProfile: { resourceRef: "worldkit://ai-schema-projection-profile/constrained-json@1", contentHash: HASH_B },
      normalizedWorldIrSchemaVersion: 4,
      canonicalSceneExecutionPlanSchemaVersion: 1,
      authoringSpecHash: HASH_A,
      normalizedWorldIrHash: HASH_B,
      executionPlanHash: HASH_C,
      layoutSolveReportHash: HASH_C,
      canonicalSceneExecutionPlanPath: "targets/babylon-web/canonical-scene-execution-plan.json",
    },
    worldRuntimeBootstrapSchemaVersion: 1,
    gameplayBootstrapHash: HASH_D,
    worldRuntimeBootstrapHash: HASH_A,
    registryLockHash: HASH_B,
    initialControlledEntityId: "player",
    worldBounds: { centerMetersXZ: [0, 0], sizeMetersXZ: [32, 32], heightRangeMeters: [-2, 8] },
    resourceBudget: { maximumVertices: 1_000, maximumTriangles: 500, maximumColliders: 20 },
    lockedResources: [],
    entryPoint: {
      gameplayBootstrapPath: "gameplay/bootstrap.json",
      worldRuntimeBootstrapPath: "runtime/world-runtime-bootstrap.json",
    },
    legal: { distributionPolicy: "internal-only", noticePath: "NOTICE", licenseDocuments: [] },
    hostCompatibility: BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
    resources: [],
  });
}

function nativeManifestFixture(): WorldPackageManifestV1 {
  return canonicalizeWorldPackageManifestV1({
    ...manifestFixture(),
    sceneSource: {
      kind: "babylon-native-scene",
      nativeSceneBootstrapHash: HASH_A,
      sceneModuleBundleHash: HASH_B,
      nativeSceneContributionHash: HASH_C,
      dependencyLockHash: HASH_D,
      assetLockHash: HASH_A,
      nativeSceneCheckResultHash: HASH_B,
      sceneAuthoringRouteDecisionHash: HASH_C,
      sceneAuthoringAttemptHash: HASH_D,
      sceneAuthoringAttemptResultRef: "worldkit://scene-authoring-attempt-result/fixture@1",
      sceneAuthoringAttemptResultHash: HASH_A,
      nativeSceneBootstrapPath: "native/bootstrap.json",
      sceneModuleBundleManifestPath: "native/module-bundle.json",
      sceneModuleBundlePath: "native/scene.mjs",
      dependencyLockPath: "native/dependency-lock.json",
      assetLockPath: "native/asset-lock.json",
      nativeSceneContributionPath: "native/contribution.json",
      nativeSceneCheckResultPath: "native/check-result.json",
      sceneAuthoringRouteDecisionPath: "authoring/scene-authoring-route-decision.json",
      sceneAuthoringAttemptPath: "authoring/scene-authoring-attempt.json",
      sceneAuthoringAttemptResultPath: "authoring/scene-authoring-attempt-result.json",
    },
  });
}

function receiptFixture(): WorldPackageBuildReceiptV1 {
  const manifest = manifestFixture();
  const bytes = canonicalJsonBytes(manifest);
  const fileIntegrityEntries = [{ path: "manifest.json", mediaType: "application/json", sizeBytes: bytes.byteLength, contentHash: sha256Bytes(bytes) as `sha256:${string}` }];
  const worldPackageRootHash = hashWorldPackageRootV1(fileIntegrityEntries);
  const worldPackageRef = worldPackageRefFromRootHashV1(worldPackageRootHash);
  const worldBuildIdentity = {
    kind: "world-build-identity" as const,
    schemaVersion: 1 as const,
    id: "fixture.package.world-build",
    worldPackageRef,
    worldPackageRootHash,
    gameplayBootstrapHash: manifest.gameplayBootstrapHash,
    worldRuntimeBootstrapHash: manifest.worldRuntimeBootstrapHash,
    sceneSourceIdentity: {
      kind: "canonical-execution-plan" as const,
      executionPlanHash: manifest.sceneSource.kind === "canonical-execution-plan"
        ? manifest.sceneSource.executionPlanHash
        : HASH_A,
    },
  };
  return {
    kind: "worldkit-world-package-build-receipt",
    schemaVersion: 1,
    manifest,
    manifestHash: hashWorldPackageManifestV1(manifest),
    fileIntegrityEntries,
    worldPackageRootHash,
    worldPackageRef,
    worldBuildIdentity,
    worldBuildIdentityHash: hashWorldBuildIdentityV1(worldBuildIdentity),
  };
}

describe("current WorldPackage contract", () => {
  it("has one exact current manifest shell and one Canonical scene source", () => {
    const manifest = manifestFixture();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.packageFormatVersion).toBe(1);
    expect(manifest.entryPoint).toEqual({
      gameplayBootstrapPath: "gameplay/bootstrap.json",
      worldRuntimeBootstrapPath: "runtime/world-runtime-bootstrap.json",
    });
    expect(manifest.sceneSource).toMatchObject({
      kind: "canonical-execution-plan",
      canonicalSceneExecutionPlanPath: "targets/babylon-web/canonical-scene-execution-plan.json",
    });
    expect(Object.keys(manifest)).not.toEqual(expect.arrayContaining([
      "authoringSpecHash",
      "normalizedWorldIrHash",
      "executionPlanHash",
      "layoutSolveReportHash",
      "authoringSchema",
      "aiSchemaProjectionProfile",
      "normalizedWorldIrSchemaVersion",
      "canonicalSceneExecutionPlanSchemaVersion",
    ]));
  });

  it("accepts the closed Native member without Canonical identity", () => {
    const manifest = nativeManifestFixture();
    expect(manifest.sceneSource).toMatchObject({
      kind: "babylon-native-scene",
      sceneModuleBundlePath: "native/scene.mjs",
      nativeSceneCheckResultPath: "native/check-result.json",
    });
    expect(Object.keys(manifest.sceneSource)).not.toEqual(expect.arrayContaining([
      "executionPlanHash",
      "canonicalSceneExecutionPlanPath",
    ]));
  });

  it("rejects missing, mixed, implicit and old scene source identity", () => {
    const canonical = manifestFixture();
    const native = nativeManifestFixture();
    expect(() => canonicalizeWorldPackageManifestV1({
      ...canonical,
      sceneSource: undefined,
    } as unknown as WorldPackageManifestV1)).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");
    expect(() => canonicalizeWorldPackageManifestV1({
      ...canonical,
      sceneSource: {
        ...canonical.sceneSource,
        nativeSceneBootstrapHash: HASH_A,
      },
    } as unknown as WorldPackageManifestV1)).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");
    expect(() => canonicalizeWorldPackageManifestV1({
      ...native,
      sceneSource: {
        ...native.sceneSource,
        executionPlanHash: HASH_A,
      },
    } as unknown as WorldPackageManifestV1)).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");
    expect(() => canonicalizeWorldPackageManifestV1({
      ...canonical,
      authoringSpecHash: HASH_A,
    } as unknown as WorldPackageManifestV1)).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");
  });

  it("rejects non-exact shared records and Package-owned pseudo resources", () => {
    const manifest = manifestFixture();
    expect(() => canonicalizeWorldPackageManifestV1({
      ...manifest,
      worldBounds: { ...manifest.worldBounds, units: "meters" },
    } as unknown as WorldPackageManifestV1)).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");
    expect(() => canonicalizeWorldPackageManifestV1({
      ...manifest,
      resources: [{
        resourceRef: "worldkit://gameplay-bootstrap/fixture@1",
        packagePath: "gameplay/bootstrap.json",
        mediaType: "application/json",
        sizeBytes: 1,
        contentHash: HASH_A,
        licenseDocumentId: "fixture-license",
        redistributionPolicy: "internal-only",
      }],
    })).toThrow("WORLD_PACKAGE_MANIFEST_INVALID");
  });

  it("binds the post-root identity and its hash", () => {
    const receipt = assertWorldPackageBuildReceiptV1(receiptFixture());
    expect(receipt.worldPackageRef).toBe(receipt.worldBuildIdentity.worldPackageRef);
    expect(receipt.worldBuildIdentityHash).toBe(hashWorldBuildIdentityV1(receipt.worldBuildIdentity));
  });

  it.each(["integrity.json", "world-package-build-receipt.json", "world-build-identity.json"])("rejects root inventory transport path %s", (path) => {
    const receipt = receiptFixture();
    const entries = [...receipt.fileIntegrityEntries, { path, mediaType: "application/json", sizeBytes: 2, contentHash: sha256CanonicalJson({}) as `sha256:${string}` }];
    expect(() => hashWorldPackageRootV1(entries)).toThrow(
      "WORLD_PACKAGE_INTEGRITY_INVALID",
    );
  });

  it("rejects a forged Plan identity and accepts the Babylon host policy", () => {
    const receipt = receiptFixture();
    expect(() => assertWorldPackageBuildReceiptV1({ ...receipt, worldBuildIdentity: { ...receipt.worldBuildIdentity, sceneSourceIdentity: { kind: "canonical-execution-plan", executionPlanHash: HASH_D } } })).toThrow("WORLD_PACKAGE_BUILD_RECEIPT_INVALID");
    expect(assertWorldPackageHostCompatibilityV1(receipt, BABYLON_WEB_WORLD_PACKAGE_HOST_POLICY_V1)).toEqual(receipt);
  });

  it("binds Native source identity to the three authoritative Manifest hashes", () => {
    const canonicalReceipt = receiptFixture();
    const manifest = nativeManifestFixture();
    const worldBuildIdentity = {
      ...canonicalReceipt.worldBuildIdentity,
      gameplayBootstrapHash: manifest.gameplayBootstrapHash,
      worldRuntimeBootstrapHash: manifest.worldRuntimeBootstrapHash,
      sceneSourceIdentity: {
        kind: "babylon-native-scene" as const,
        nativeSceneBootstrapHash: HASH_A,
        sceneModuleBundleHash: HASH_B,
        nativeSceneContributionHash: HASH_C,
      },
    };
    const receipt = {
      ...canonicalReceipt,
      manifest,
      manifestHash: hashWorldPackageManifestV1(manifest),
      worldBuildIdentity,
      worldBuildIdentityHash: hashWorldBuildIdentityV1(worldBuildIdentity),
    };
    expect(assertWorldPackageBuildReceiptV1(receipt).worldBuildIdentity.sceneSourceIdentity)
      .toEqual(worldBuildIdentity.sceneSourceIdentity);
    expect(() => assertWorldPackageBuildReceiptV1({
      ...receipt,
      worldBuildIdentity: {
        ...worldBuildIdentity,
        sceneSourceIdentity: {
          ...worldBuildIdentity.sceneSourceIdentity,
          sceneModuleBundleHash: HASH_D,
        },
      },
    })).toThrow("WORLD_PACKAGE_BUILD_RECEIPT_INVALID");
  });
});
