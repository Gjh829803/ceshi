import { canonicalJsonBytes, sha256Bytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import { hashWorldBuildIdentityV1, worldPackageRefFromRootHashV1 } from "@whitebox-world/world-identity";
import { describe, expect, it } from "vitest";

import {
  BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
  BABYLON_WEB_WORLD_PACKAGE_HOST_POLICY_V1,
  assertWorldPackageBuildReceiptV1,
  assertWorldPackageHostCompatibilityV1,
  canonicalWorldPackageManifestV1,
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
  return canonicalWorldPackageManifestV1({
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
    authoringSchema: { schemaVersion: 4, contentHash: HASH_A },
    aiSchemaProjectionProfile: { resourceRef: "worldkit://ai-schema-projection-profile/constrained-json@1", contentHash: HASH_B },
    normalizedWorldIrSchemaVersion: 4,
    canonicalSceneExecutionPlanSchemaVersion: 1,
    worldRuntimeBootstrapSchemaVersion: 1,
    authoringSpecHash: HASH_A,
    normalizedWorldIrHash: HASH_B,
    executionPlanHash: HASH_C,
    gameplayBootstrapHash: HASH_D,
    worldRuntimeBootstrapHash: HASH_A,
    registryLockHash: HASH_B,
    layoutSolveReportHash: HASH_C,
    initialControlledEntityId: "player",
    worldBounds: { centerMetersXZ: [0, 0], sizeMetersXZ: [32, 32], heightRangeMeters: [-2, 8] },
    resourceBudget: { maximumVertices: 1_000, maximumTriangles: 500, maximumColliders: 20 },
    lockedResources: [],
    entryPoint: {
      canonicalSceneExecutionPlanPath: "targets/babylon-web/canonical-scene-execution-plan.json",
      gameplayBootstrapPath: "gameplay/bootstrap.json",
      worldRuntimeBootstrapPath: "runtime/world-runtime-bootstrap.json",
    },
    legal: { distributionPolicy: "internal-only", noticePath: "NOTICE", licenseDocuments: [] },
    hostCompatibility: BABYLON_WEB_WORLD_PACKAGE_HOST_COMPATIBILITY_V1,
    resources: [],
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
    sceneSourceIdentity: { kind: "canonical-execution-plan" as const, executionPlanHash: manifest.executionPlanHash },
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
  it("has one exact current manifest and three canonical entry points", () => {
    const manifest = manifestFixture();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.packageFormatVersion).toBe(1);
    expect(manifest.entryPoint).toEqual({
      canonicalSceneExecutionPlanPath: "targets/babylon-web/canonical-scene-execution-plan.json",
      gameplayBootstrapPath: "gameplay/bootstrap.json",
      worldRuntimeBootstrapPath: "runtime/world-runtime-bootstrap.json",
    });
    expect(Object.keys(manifest).sort()).not.toContain("executionPlanSchemaVersion");
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
});
