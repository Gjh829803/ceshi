import { describe, expect, it } from "vitest";

import {
  canonicalBabylonNativeAssetLockBytesV1,
  hashBabylonNativeAssetLockV1,
  parseBabylonNativeAssetLockV1,
} from "./native-scene-asset-lock";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;

function makeEntry(assetResourceRef: string, artifactPath: string) {
  return {
    assetResourceRef,
    resourceManifestHash: HASH_A,
    artifactPath,
    artifactSizeBytes: 128,
    artifactContentHash: HASH_B,
    mediaType: "model/gltf-binary",
    classBuildRecordRef: "worldkit://static-geometry-build-record/cliff@1",
    classBuildRecordHash: HASH_A,
    assetAdmissionReceiptRef: "worldkit://asset-admission-receipt/cliff@1",
    assetAdmissionReceiptHash: HASH_B,
    assetPublicationReceiptRef: "worldkit://asset-publication-receipt/cliff@1",
    assetPublicationReceiptHash: HASH_A,
    importMetadata: {
      kind: "static-geometry-glb",
      mediaType: "model/gltf-binary",
      format: "glb",
      gltfVersion: "2.0",
      localForwardAxis: "-Z",
      localUpAxis: "+Y",
      metersPerUnit: 1,
      pivot: "support-center",
    },
    license: {
      spdxExpression: "CC-BY-4.0",
      licenseDocumentPath: "LICENSES/cc-by-4.0.txt",
    },
    provenance: {
      author: "WorldKit",
      sourceUri: "https://example.invalid/assets/cliff.glb",
    },
    redistributionPolicy: "redistributable",
  } as const;
}

describe("BabylonNativeAssetLockV1", () => {
  it("sorts exact entries and freezes geometry, legal and provenance facts", () => {
    const input = {
      kind: "babylon-native-asset-lock",
      schemaVersion: 1,
      entries: [
        makeEntry("worldkit://static-geometry-asset/z-cliff@1", "resources/z.glb"),
        makeEntry("worldkit://static-geometry-asset/a-cliff@1", "resources/a.glb"),
      ],
    } as const;
    const parsed = parseBabylonNativeAssetLockV1(input);
    expect(parsed.entries.map((entry) => entry.assetResourceRef)).toEqual([
      "worldkit://static-geometry-asset/a-cliff@1",
      "worldkit://static-geometry-asset/z-cliff@1",
    ]);
    expect(Object.isFrozen(parsed.entries[0]!.importMetadata)).toBe(true);
    expect(hashBabylonNativeAssetLockV1(input)).toBe(
      hashBabylonNativeAssetLockV1(parsed),
    );
    expect(canonicalBabylonNativeAssetLockBytesV1(input)).toEqual(
      canonicalBabylonNativeAssetLockBytesV1(parsed),
    );
  });

  it("rejects duplicate resources, unsafe paths, unknown policy and invalid metadata", () => {
    const entry = makeEntry(
      "worldkit://static-geometry-asset/cliff@1",
      "resources/cliff.glb",
    );
    const lock = {
      kind: "babylon-native-asset-lock",
      schemaVersion: 1,
      entries: [entry],
    } as const;
    expect(() => parseBabylonNativeAssetLockV1({
      ...lock,
      entries: [entry, entry],
    })).toThrow(/NATIVE_ASSET_LOCK_INVALID/);
    expect(() => parseBabylonNativeAssetLockV1({
      ...lock,
      entries: [{ ...entry, artifactPath: "../cliff.glb" }],
    })).toThrow(/NATIVE_ASSET_LOCK_INVALID/);
    expect(() => parseBabylonNativeAssetLockV1({
      ...lock,
      entries: [{ ...entry, redistributionPolicy: "unknown" }],
    })).toThrow(/NATIVE_ASSET_LOCK_INVALID/);
    expect(() => parseBabylonNativeAssetLockV1({
      ...lock,
      entries: [{ ...entry, importMetadata: { ...entry.importMetadata, metersPerUnit: 2 } }],
    })).toThrow(/NATIVE_ASSET_LOCK_INVALID/);
  });
});
