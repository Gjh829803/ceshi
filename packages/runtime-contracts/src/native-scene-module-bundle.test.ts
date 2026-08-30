import { describe, expect, it } from "vitest";

import {
  canonicalBabylonNativeSceneModuleBundleManifestBytesV1,
  hashBabylonNativeSceneModuleBundleManifestV1,
  nativeSceneModuleBundleHashFromRefV1,
  nativeSceneModuleBundleRefFromHashV1,
  parseBabylonNativeSceneModuleBundleManifestV1,
} from "./native-scene-module-bundle";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;

function makeManifest() {
  return {
    kind: "babylon-native-scene-module-bundle",
    schemaVersion: 1,
    id: "cloud-ridge-module-bundle",
    sceneModuleRef: "worldkit://native-scene/cloud-ridge@1",
    sceneModuleBundleRef: nativeSceneModuleBundleRefFromHashV1(HASH_A),
    entryPath: "native/scene.mjs",
    sourceInventory: [
      { path: "src/helpers.ts", contentHash: HASH_B },
      { path: "src/scene.ts", contentHash: HASH_A },
    ],
    fileInventory: [
      {
        path: "native/scene.mjs",
        mediaType: "text/javascript",
        sizeBytes: 42,
        contentHash: HASH_A,
      },
    ],
    sourceGraphHash: HASH_C,
    bundleSizeBytes: 42,
    bundleMediaType: "text/javascript",
    bundleContentHash: HASH_A,
    nativeSceneApi: {
      resourceRef: "worldkit://native-scene-api/babylon-native@1",
      resolvedVersion: "1",
      contentHash: HASH_A,
    },
    nativeSceneProfile: {
      resourceRef: "worldkit://native-scene-profile/trusted-local@1",
      resolvedVersion: "1",
      contentHash: HASH_B,
    },
    importProfileHash: HASH_A,
    typescriptCompilerOptionsHash: HASH_B,
    bundlerProfileHash: HASH_C,
    seed: 42,
    dependencyLockHash: HASH_A,
    assetLockHash: HASH_B,
  } as const;
}

describe("BabylonNativeSceneModuleBundleManifestV1", () => {
  it("parses, canonically orders and deeply freezes one exact manifest", () => {
    const input = makeManifest();
    const parsed = parseBabylonNativeSceneModuleBundleManifestV1(input);

    expect(parsed.sourceInventory.map((entry) => entry.path)).toEqual([
      "src/helpers.ts",
      "src/scene.ts",
    ]);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.sourceInventory)).toBe(true);
    expect(Object.isFrozen(parsed.nativeSceneApi)).toBe(true);
    expect(hashBabylonNativeSceneModuleBundleManifestV1(input)).toBe(
      hashBabylonNativeSceneModuleBundleManifestV1(parsed),
    );
    expect(canonicalBabylonNativeSceneModuleBundleManifestBytesV1(input)).toEqual(
      canonicalBabylonNativeSceneModuleBundleManifestBytesV1(parsed),
    );
  });

  it("derives one validated reversible Bundle Ref", () => {
    const ref = nativeSceneModuleBundleRefFromHashV1(HASH_A);
    expect(ref).toBe(`package://native-scene-module/sha256/${"a".repeat(64)}`);
    expect(nativeSceneModuleBundleHashFromRefV1(ref)).toBe(HASH_A);

    for (const invalid of [
      "sha256:" + "0".repeat(64),
      "sha256:" + "A".repeat(64),
      "sha256:a",
      "a".repeat(64),
    ]) {
      expect(() => nativeSceneModuleBundleRefFromHashV1(invalid)).toThrow(
        /NATIVE_SCENE_MODULE_BUNDLE_REF_INVALID/,
      );
    }
  });

  it("rejects hostile data, unsafe paths, mismatched Bundle identity and extras", () => {
    const manifest = makeManifest();
    expect(() => parseBabylonNativeSceneModuleBundleManifestV1({
      ...manifest,
      extra: true,
    })).toThrow(/MODULE_BUNDLE_MANIFEST_INVALID/);
    expect(() => parseBabylonNativeSceneModuleBundleManifestV1({
      ...manifest,
      entryPath: "../scene.mjs",
    })).toThrow(/MODULE_BUNDLE_MANIFEST_INVALID/);
    expect(() => parseBabylonNativeSceneModuleBundleManifestV1({
      ...manifest,
      sceneModuleBundleRef: nativeSceneModuleBundleRefFromHashV1(HASH_B),
    })).toThrow(/MODULE_BUNDLE_MANIFEST_INVALID/);
    expect(() => parseBabylonNativeSceneModuleBundleManifestV1({
      ...manifest,
      seed: -0,
    })).toThrow(/MODULE_BUNDLE_MANIFEST_INVALID/);

    const hostile = Object.create(null) as Record<string, unknown>;
    Object.assign(hostile, manifest);
    expect(() => parseBabylonNativeSceneModuleBundleManifestV1(hostile)).toThrow(
      /MODULE_BUNDLE_MANIFEST_INVALID/,
    );

    const accessor = { ...manifest } as Record<string, unknown>;
    Object.defineProperty(accessor, "id", { enumerable: true, get: () => "boom" });
    expect(() => parseBabylonNativeSceneModuleBundleManifestV1(accessor)).toThrow(
      /MODULE_BUNDLE_MANIFEST_INVALID/,
    );
  });
});
