import { sha256Bytes, type Sha256HashV1 } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  createBabylonNativeReplayAssetLedgerV1,
  resolveBabylonNativeAssetLockV1,
  type PublishedBabylonNativeStaticGeometryAssetV1,
} from "./asset-lock.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;

function publishedAsset(
  name: string,
  byte: number,
): PublishedBabylonNativeStaticGeometryAssetV1 {
  const bytes = Uint8Array.from([byte, byte + 1, byte + 2]);
  return {
    kind: "static-geometry-asset",
    assetResourceRef: `worldkit://static-geometry-asset/${name}@1`,
    resourceManifestHash: HASH_A,
    artifactPath: `resources/${name}.glb`,
    artifactContentHash: sha256Bytes(bytes) as Sha256HashV1,
    bytes,
    mediaType: "model/gltf-binary",
    classBuildRecordRef: `worldkit://static-geometry-build-record/${name}@1`,
    classBuildRecordHash: HASH_B,
    assetAdmissionReceiptRef: `worldkit://asset-admission-receipt/${name}@1`,
    assetAdmissionReceiptHash: HASH_A,
    assetPublicationReceiptRef:
      `worldkit://asset-publication-receipt/${name}@1`,
    assetPublicationReceiptHash: HASH_B,
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
      licenseDocumentPath: "LICENSES/CC-BY-4.0.txt",
    },
    provenance: {
      author: "WorldKit",
      sourceUri: `https://example.com/${name}.glb`,
    },
    redistributionPolicy: "redistributable",
  };
}

function selected(asset: PublishedBabylonNativeStaticGeometryAssetV1) {
  return {
    assetResourceRef: asset.assetResourceRef,
    assetPublicationReceiptRef: asset.assetPublicationReceiptRef,
    assetPublicationReceiptHash: asset.assetPublicationReceiptHash,
  };
}

describe("Babylon Native Asset Lock", () => {
  it("closes selected, published, locked and packaged asset identity", async () => {
    const assets = [publishedAsset("ridge", 1), publishedAsset("tree", 8)];
    const first = resolveBabylonNativeAssetLockV1({
      selectedAssetResources: assets.map(selected).reverse(),
      publishedAssets: assets,
    });
    const second = resolveBabylonNativeAssetLockV1({
      selectedAssetResources: assets.map(selected),
      publishedAssets: [...assets].reverse(),
    });
    expect(first.assetLock).toEqual(second.assetLock);
    expect(first.assetLockBytes).toEqual(second.assetLockBytes);
    expect(first.assetLockHash).toBe(second.assetLockHash);
    expect(first.resourceArtifacts.map(({ assetLockEntry }) =>
      assetLockEntry.assetResourceRef)).toEqual([
      "worldkit://static-geometry-asset/ridge@1",
      "worldkit://static-geometry-asset/tree@1",
    ]);

    const resolved = await first.assetResolver.resolve({
      assetResourceRef: assets[0]!.assetResourceRef,
    });
    resolved.bytes[0] = 255;
    const replayed = await first.assetResolver.resolve({
      assetResourceRef: assets[0]!.assetResourceRef,
    });
    expect(replayed.bytes[0]).toBe(1);
    expect(replayed).toMatchObject({
      resourceManifestHash: assets[0]!.resourceManifestHash,
      classBuildRecordHash: assets[0]!.classBuildRecordHash,
      assetAdmissionReceiptHash: assets[0]!.assetAdmissionReceiptHash,
      assetPublicationReceiptHash: assets[0]!.assetPublicationReceiptHash,
      importMetadata: assets[0]!.importMetadata,
    });
  });

  it("records successful resolutions independently for two Candidate replays", async () => {
    const assets = [publishedAsset("ridge", 1), publishedAsset("tree", 8)];
    const resolved = resolveBabylonNativeAssetLockV1({
      selectedAssetResources: assets.map(selected),
      publishedAssets: assets,
    });
    const ledger = createBabylonNativeReplayAssetLedgerV1(resolved.assetResolver);
    ledger.beginReplay(0);
    await ledger.assetResolver.resolve({ assetResourceRef: assets[1]!.assetResourceRef });
    await ledger.assetResolver.resolve({ assetResourceRef: assets[0]!.assetResourceRef });
    ledger.beginReplay(1);
    await ledger.assetResolver.resolve({ assetResourceRef: assets[0]!.assetResourceRef });
    await ledger.assetResolver.resolve({ assetResourceRef: assets[1]!.assetResourceRef });
    expect(ledger.snapshot()).toEqual([
      assets.map(({ assetResourceRef }) => assetResourceRef).sort(),
      assets.map(({ assetResourceRef }) => assetResourceRef).sort(),
    ]);
  });

  it("rejects missing, extra, duplicate, receipt, byte, and shell drift", async () => {
    const ridge = publishedAsset("ridge", 1);
    const tree = publishedAsset("tree", 8);
    const cases: readonly Readonly<{
      selectedAssetResources: readonly ReturnType<typeof selected>[];
      publishedAssets: readonly unknown[];
    }>[] = [
      { selectedAssetResources: [selected(ridge)], publishedAssets: [] },
      { selectedAssetResources: [], publishedAssets: [ridge] },
      { selectedAssetResources: [selected(ridge)], publishedAssets: [ridge, ridge] },
      {
        selectedAssetResources: [{
          ...selected(ridge),
          assetPublicationReceiptHash: HASH_A,
        }],
        publishedAssets: [ridge],
      },
      {
        selectedAssetResources: [selected(ridge)],
        publishedAssets: [{ ...ridge, bytes: Uint8Array.from([9]) }],
      },
      {
        selectedAssetResources: [selected(tree)],
        publishedAssets: [{ ...tree, kind: "scene-shell" }],
      },
    ];
    for (const candidate of cases) {
      expect(() => resolveBabylonNativeAssetLockV1(candidate as never)).toThrow(
        /WORLDKIT_NATIVE_ASSET_LOCK_RESOLUTION_FAILED/,
      );
    }
  });

  it("does not record rejected asset resolutions", async () => {
    const ridge = publishedAsset("ridge", 1);
    const resolved = resolveBabylonNativeAssetLockV1({
      selectedAssetResources: [selected(ridge)],
      publishedAssets: [ridge],
    });
    const ledger = createBabylonNativeReplayAssetLedgerV1(resolved.assetResolver);
    ledger.beginReplay(0);
    await expect(ledger.assetResolver.resolve({
      assetResourceRef: "worldkit://static-geometry-asset/missing@1",
    })).rejects.toThrow();
    expect(ledger.snapshot()).toEqual([[], []]);
  });
});
