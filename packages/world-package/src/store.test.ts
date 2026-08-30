import { canonicalJsonBytes } from "@whitebox-world/protocol";
import { worldPackageRefFromRootHashV1 } from "@whitebox-world/world-identity";
import { describe, expect, it } from "vitest";

import {
  assembleWorldPackageDirectoryV1,
  createBabylonNativeWorldPackageV1,
  createCanonicalWorldPackageV1,
  type WorldPackageDirectoryV1,
} from "./index.js";
import { createInMemoryWorldPackageStoreV1 } from "./testing.js";
import {
  createBabylonNativeWorldPackageTestInputV1,
  createWorldPackageTestInputV1,
} from "./test-fixture.js";

function fixture(): WorldPackageDirectoryV1 {
  return createCanonicalWorldPackageV1(createWorldPackageTestInputV1());
}

function withSignature(directory: WorldPackageDirectoryV1, signatureBase64: string): WorldPackageDirectoryV1 {
  return assembleWorldPackageDirectoryV1({
    receipt: directory.receipt,
    files: directory.files.filter((file) => !["integrity.json", "world-package-build-receipt.json", "world-build-identity.json"].includes(file.path)),
    signatureFiles: [{
      path: "signatures/test-key.json",
      mediaType: "application/json",
      bytes: canonicalJsonBytes({ kind: "worldkit-package-signature", schemaVersion: 1, signatureBase64 }),
    }],
  });
}

describe("WorldPackageStoreV1", () => {
  it("stores by the post-root content-addressed Ref and returns a defensive verified read", async () => {
    const directory = fixture();
    const store = createInMemoryWorldPackageStoreV1();
    const first = await store.put(directory);
    const repeated = await store.put(directory);
    expect(first).toEqual(repeated);
    expect(first.worldPackageRef).toBe(worldPackageRefFromRootHashV1(directory.receipt.worldPackageRootHash));
    directory.files[0]!.bytes[0] = directory.files[0]!.bytes[0]! ^ 0xff;
    const loaded = await store.get(first.worldPackageRef);
    expect(loaded?.receipt.worldBuildIdentityHash).toBe(first.receipt.worldBuildIdentityHash);
  });

  it("returns undefined for an absent valid Ref", async () => {
    const store = createInMemoryWorldPackageStoreV1();
    await expect(store.get(worldPackageRefFromRootHashV1(`sha256:${"a".repeat(64)}`))).resolves.toBeUndefined();
  });

  it("stores and defensively replays the same Native package member", async () => {
    const directory = createBabylonNativeWorldPackageV1(
      createBabylonNativeWorldPackageTestInputV1(),
    );
    const store = createInMemoryWorldPackageStoreV1();
    const put = await store.put(directory);
    directory.files[0]!.bytes[0] = directory.files[0]!.bytes[0]! ^ 0xff;
    const loaded = await store.get(put.worldPackageRef);
    expect(loaded?.kind).toBe("babylon-native-scene");
    if (loaded?.kind !== "babylon-native-scene") throw new Error("unreachable");
    expect(loaded.sceneModuleBundleHash).toBe(
      loaded.receipt.manifest.sceneSource.sceneModuleBundleHash,
    );
  });

  it("rejects different signature bytes under the same Package Root", async () => {
    const directory = fixture();
    const store = createInMemoryWorldPackageStoreV1();
    await store.put(withSignature(directory, "first"));
    await expect(store.put(withSignature(directory, "second"))).rejects.toThrow("WORLD_PACKAGE_STORE_CONFLICT");
  });
});
