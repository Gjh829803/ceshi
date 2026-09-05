import { describe, expect, it } from "vitest";

import {
  createBabylonNativeWorldPackageV1,
  createCanonicalWorldPackageV1,
  verifyWorldPackageDirectoryV1,
} from "./index.js";
import {
  createBabylonNativeBlockWorldPackageTestInputV1,
  createBabylonNativeWorldPackageTestInputV1,
  createWorldPackageTestInputV1,
} from "./test-fixture.js";

describe("createCanonicalWorldPackageV1", () => {
  it("builds one deterministic current package with split Canonical artifacts", () => {
    const first = createCanonicalWorldPackageV1(createWorldPackageTestInputV1());
    const repeated = createCanonicalWorldPackageV1(createWorldPackageTestInputV1());
    const verified = verifyWorldPackageDirectoryV1(first);
    expect(verified.kind).toBe("canonical-execution-plan");
    if (verified.kind !== "canonical-execution-plan") throw new Error("unreachable");

    expect(repeated.receipt.worldPackageRootHash).toBe(first.receipt.worldPackageRootHash);
    expect(verified.receipt.manifest).toMatchObject({ schemaVersion: 1, packageFormatVersion: 1 });
    expect(verified.receipt.manifest.sceneSource.kind).toBe("canonical-execution-plan");
    expect(verified.receipt.manifest.resources).toEqual([]);
    expect(verified.receipt.manifest.resources.map((resource) => resource.packagePath))
      .not.toEqual(expect.arrayContaining([
        "gameplay/bootstrap.json",
        "runtime/world-runtime-bootstrap.json",
      ]));
    expect(verified.executionPlan.worldRuntimeBootstrapHash).toBe(verified.worldRuntimeBootstrap.contentHash);
    expect(verified.worldRuntimeBootstrap.gameplayBootstrapHash).toBe(verified.gameplayBootstrap.contentHash);
    expect(verified.receipt.worldBuildIdentity.sceneSourceIdentity).toEqual({
      kind: "canonical-execution-plan",
      executionPlanHash: verified.receipt.manifest.sceneSource.kind === "canonical-execution-plan"
        ? verified.receipt.manifest.sceneSource.executionPlanHash
        : undefined,
    });
  });

  it("keeps exactly three transport files outside the Root inventory", () => {
    const directory = createCanonicalWorldPackageV1(createWorldPackageTestInputV1());
    const transport = ["integrity.json", "world-package-build-receipt.json", "world-build-identity.json"];
    expect(transport.every((path) => directory.files.some((file) => file.path === path))).toBe(true);
    expect(directory.receipt.fileIntegrityEntries.some((entry) => transport.includes(entry.path))).toBe(false);
  });

  it("supports explicit AuthoringSpec omission without changing component identity", () => {
    const withAudit = createCanonicalWorldPackageV1(createWorldPackageTestInputV1());
    const withoutAudit = createCanonicalWorldPackageV1(createWorldPackageTestInputV1({ includeAuthoringSpec: false }));
    expect(withoutAudit.files.some((file) => file.path === "authoring-spec.json")).toBe(false);
    expect(withoutAudit.receipt.manifest.sceneSource).toEqual(withAudit.receipt.manifest.sceneSource);
    expect(withoutAudit.receipt.manifest.worldRuntimeBootstrapHash).toBe(withAudit.receipt.manifest.worldRuntimeBootstrapHash);
    expect(withoutAudit.receipt.worldPackageRootHash).not.toBe(withAudit.receipt.worldPackageRootHash);
  });

  it("rejects a split-artifact cross-hash mismatch", () => {
    const input = createWorldPackageTestInputV1();
    expect(() => createCanonicalWorldPackageV1({
      ...input,
      executionPlan: {
        ...input.executionPlan,
        worldRuntimeBootstrapHash: `sha256:${"f".repeat(64)}`,
      },
    })).toThrow("WORLD_PACKAGE_BUILD_INVALID");
  });
});

describe("createBabylonNativeWorldPackageV1", () => {
  it("requires and freezes the complete Block materializer metadata in Package identity", () => {
    const blockInput = createBabylonNativeBlockWorldPackageTestInputV1();
    const first = createBabylonNativeWorldPackageV1(blockInput);
    const verified = verifyWorldPackageDirectoryV1(first);
    expect(verified.kind).toBe("babylon-native-scene");
    if (verified.kind !== "babylon-native-scene") throw new Error("unreachable");
    expect(verified.nativeBlockMaterializerMetadata).toEqual(
      blockInput.nativeBlockMaterializerMetadata,
    );
    expect(first.receipt.fileIntegrityEntries.map(({ path }) => path)).toContain(
      "native/block-materializer-metadata.json",
    );
    expect(first.receipt.manifest.sceneSource).toMatchObject({
      nativeMaterializer: {
        kind: "babylon-native-block",
        metadataPath: "native/block-materializer-metadata.json",
        metadataHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
    });

    const { nativeBlockMaterializerMetadata: _removed, ...withoutMetadata } =
      blockInput;
    expect(() => createBabylonNativeWorldPackageV1(withoutMetadata as never))
      .toThrow("WORLD_PACKAGE_BUILD_INVALID");

    const standard = createBabylonNativeWorldPackageTestInputV1();
    expect(() => createBabylonNativeWorldPackageV1({
      ...standard,
      nativeBlockMaterializerMetadata:
        blockInput.nativeBlockMaterializerMetadata!,
    })).toThrow("WORLD_PACKAGE_BUILD_INVALID");
  });

  it("changes Root and Receipt identity for any accepted materializer metadata change", () => {
    const input = createBabylonNativeBlockWorldPackageTestInputV1();
    const first = createBabylonNativeWorldPackageV1(input);
    const metadata = input.nativeBlockMaterializerMetadata!;
    const changed = createBabylonNativeWorldPackageV1({
      ...input,
      nativeBlockMaterializerMetadata: {
        ...metadata,
        visualGroups: metadata.visualGroups.map((group) => ({
          ...group,
          identityColorHex: "#AA0011" as const,
        })),
      },
    });
    expect(changed.receipt.worldPackageRootHash).not.toBe(
      first.receipt.worldPackageRootHash,
    );
    expect(changed.receipt.worldBuildIdentityHash).not.toBe(
      first.receipt.worldBuildIdentityHash,
    );
    const retuned = createBabylonNativeWorldPackageV1({
      ...input,
      nativeBlockMaterializerMetadata: { ...metadata,
        openingCamera: { ...metadata.openingCamera, distanceMeters: 5.5, fovDegrees: 54 } },
    });
    expect(retuned.receipt.worldPackageRootHash).not.toBe(first.receipt.worldPackageRootHash);
    const verifiedRetuned = verifyWorldPackageDirectoryV1(retuned);
    expect(verifiedRetuned.kind).toBe("babylon-native-scene");
    if (verifiedRetuned.kind !== "babylon-native-scene") throw new Error("unreachable");
    expect(verifiedRetuned.bootstrap).toEqual(input.nativeSceneBootstrap);
    expect(verifiedRetuned.worldRuntimeBootstrap).toEqual(input.worldRuntimeBootstrap);
    expect(verifiedRetuned.nativeBlockMaterializerMetadata?.openingCamera).toMatchObject({
      distanceMeters: 5.5, fovDegrees: 54,
    });
  });

  it("closes the Bootstrap, Bundle, and Contribution Profile identity", () => {
    const standard = createBabylonNativeWorldPackageTestInputV1();
    expect(() => createBabylonNativeWorldPackageV1({
      ...standard,
      nativeSceneContribution: {
        ...standard.nativeSceneContribution,
        profileSettlement: {
          kind: "host-snapshot",
          profileRef:
            "worldkit://native-scene-profile/whitebox.blocks@1",
          targetCount: 1,
          profileInventoryHash: `sha256:${"1".repeat(64)}`,
          settledVisualHash: `sha256:${"2".repeat(64)}`,
        },
      },
    })).toThrow("WORLD_PACKAGE_BUILD_INVALID");

    const blocks = createBabylonNativeBlockWorldPackageTestInputV1();
    expect(() => createBabylonNativeWorldPackageV1({
      ...blocks,
      nativeSceneContribution: {
        ...blocks.nativeSceneContribution,
        profileSettlement: {
          kind: "none",
          profileRef:
            "worldkit://native-scene-profile/whitebox.standard@1",
        },
      },
    })).toThrow("WORLD_PACKAGE_BUILD_INVALID");
  });

  it("builds and verifies one deterministic Native Root without Canonical shadows", () => {
    const input = createBabylonNativeWorldPackageTestInputV1();
    const first = createBabylonNativeWorldPackageV1(input);
    const repeated = createBabylonNativeWorldPackageV1(
      createBabylonNativeWorldPackageTestInputV1(),
    );
    const verified = verifyWorldPackageDirectoryV1(first);
    expect(verified.kind).toBe("babylon-native-scene");
    if (verified.kind !== "babylon-native-scene") throw new Error("unreachable");
    expect(repeated.receipt.worldPackageRootHash).toBe(
      first.receipt.worldPackageRootHash,
    );
    expect(verified.sceneModuleBundleHash).toBe(
      input.sceneModuleBundleManifest.bundleContentHash,
    );
    expect(verified.sceneModuleBundleRef).toBe(
      input.sceneModuleBundleManifest.sceneModuleBundleRef,
    );
    expect(verified.sceneAuthoringAttemptResult.outcome).toBe("completed");
    expect(verified.nativeSceneCheckResult.outcome).toBe("passed");
    expect(verified.immutableAssetBytesByResourceRef.size).toBe(0);
    expect(first.receipt.fileIntegrityEntries.map(({ path }) => path)).not.toEqual(
      expect.arrayContaining([
        "authoring-spec.json",
        "world.normalized.json",
        "layout-solve-report.json",
        "targets/babylon-web/canonical-scene-execution-plan.json",
      ]),
    );
  });

  it("rejects bundle bytes, seed, world bounds and Check drift before publication", () => {
    const input = createBabylonNativeWorldPackageTestInputV1();
    expect(() => createBabylonNativeWorldPackageV1({
      ...input,
      sceneModuleBundleBytes: Uint8Array.from([1, 2, 3]),
    })).toThrow("WORLD_PACKAGE_BUILD_INVALID");
    expect(() => createBabylonNativeWorldPackageV1({
      ...input,
      nativeSceneBootstrap: {
        ...input.nativeSceneBootstrap,
        seed: input.nativeSceneBootstrap.seed + 1,
      },
    })).toThrow("WORLD_PACKAGE_BUILD_INVALID");
    expect(() => createBabylonNativeWorldPackageV1({
      ...input,
      worldBounds: {
        centerMetersXZ: [0, 0],
        sizeMetersXZ: [1, 1],
        heightRangeMeters: [-5, 20],
      },
    })).toThrow("WORLD_PACKAGE_BUILD_INVALID");
    expect(() => createBabylonNativeWorldPackageV1({
      ...input,
      nativeSceneCheckResult: {
        ...input.nativeSceneCheckResult,
        checkedInput: {
          kind: "native-scene-module",
          sceneModuleRef: "worldkit://native-scene/other@1",
        },
      },
    })).toThrow("WORLD_PACKAGE_BUILD_INVALID");
  });
});
