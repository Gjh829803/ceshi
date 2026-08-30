import { canonicalJsonBytes, sha256Bytes } from "@whitebox-world/protocol";
import { hashBabylonNativeSceneContributionV1 } from
  "@whitebox-world/runtime-contracts";
import {
  hashWorldBuildIdentityV1,
  worldPackageRefFromRootHashV1,
} from "@whitebox-world/world-identity";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  assembleWorldPackageDirectoryV1,
  canonicalizeWorldPackageFileIntegrityEntriesV1,
  createBabylonNativeWorldPackageV1,
  createCanonicalWorldPackageV1,
  hashWorldPackageManifestV1,
  hashWorldPackageRootV1,
  verifyWorldPackageDirectoryV1,
  type WorldPackageDirectoryV1,
} from "./index.js";
import {
  createBabylonNativeWorldPackageTestInputV1,
  createWorldPackageTestInputV1,
} from "./test-fixture.js";

function fixture(): WorldPackageDirectoryV1 {
  return createCanonicalWorldPackageV1(createWorldPackageTestInputV1());
}

function rootFiles(directory: WorldPackageDirectoryV1) {
  return directory.files.filter((file) => ![
    "integrity.json",
    "world-package-build-receipt.json",
    "world-build-identity.json",
  ].includes(file.path));
}

function withRootShadow(
  directory: WorldPackageDirectoryV1,
  path: string,
) {
  const files = [
    ...rootFiles(directory),
    { path, mediaType: "application/json", bytes: canonicalJsonBytes({}) },
  ];
  const fileIntegrityEntries =
    canonicalizeWorldPackageFileIntegrityEntriesV1(files.map((file) => ({
      path: file.path,
      mediaType: file.mediaType,
      sizeBytes: file.bytes.byteLength,
      contentHash: sha256Bytes(file.bytes) as `sha256:${string}`,
    })));
  const worldPackageRootHash = hashWorldPackageRootV1(fileIntegrityEntries);
  const worldPackageRef = worldPackageRefFromRootHashV1(worldPackageRootHash);
  const worldBuildIdentity = {
    ...directory.receipt.worldBuildIdentity,
    worldPackageRef,
    worldPackageRootHash,
  };
  return {
    files,
    receipt: {
      ...directory.receipt,
      fileIntegrityEntries,
      worldPackageRootHash,
      worldPackageRef,
      worldBuildIdentity,
      worldBuildIdentityHash: hashWorldBuildIdentityV1(worldBuildIdentity),
    },
  };
}

function withCanonicalAuthoringSpecHashDrift(
  directory: WorldPackageDirectoryV1,
) {
  if (directory.receipt.manifest.sceneSource.kind !== "canonical-execution-plan") {
    throw new Error("Canonical fixture required.");
  }
  const manifest = {
    ...directory.receipt.manifest,
    sceneSource: {
      ...directory.receipt.manifest.sceneSource,
      authoringSpecHash: `sha256:${"f".repeat(64)}` as const,
    },
  };
  const files = rootFiles(directory).map((file) =>
    file.path === "manifest.json"
      ? { ...file, bytes: canonicalJsonBytes(manifest) }
      : file
  );
  const fileIntegrityEntries =
    canonicalizeWorldPackageFileIntegrityEntriesV1(files.map((file) => ({
      path: file.path,
      mediaType: file.mediaType,
      sizeBytes: file.bytes.byteLength,
      contentHash: sha256Bytes(file.bytes) as `sha256:${string}`,
    })));
  const worldPackageRootHash = hashWorldPackageRootV1(fileIntegrityEntries);
  const worldPackageRef = worldPackageRefFromRootHashV1(worldPackageRootHash);
  const worldBuildIdentity = {
    ...directory.receipt.worldBuildIdentity,
    worldPackageRef,
    worldPackageRootHash,
  };
  return {
    files,
    receipt: {
      ...directory.receipt,
      manifest,
      manifestHash: hashWorldPackageManifestV1(manifest),
      fileIntegrityEntries,
      worldPackageRootHash,
      worldPackageRef,
      worldBuildIdentity,
      worldBuildIdentityHash: hashWorldBuildIdentityV1(worldBuildIdentity),
    },
  };
}

function withNativeContributionProfileDrift(
  directory: WorldPackageDirectoryV1,
) {
  if (directory.receipt.manifest.sceneSource.kind !== "babylon-native-scene") {
    throw new Error("Babylon Native fixture required.");
  }
  const contributionFile = directory.files.find(
    ({ path }) => path === "native/contribution.json",
  );
  if (isNil(contributionFile)) {
    throw new Error("Native Contribution fixture missing.");
  }
  const contribution = JSON.parse(new TextDecoder().decode(
    contributionFile.bytes,
  )) as Record<string, unknown>;
  const driftedContribution = {
    ...contribution,
    profileSettlement: {
      kind: "host-snapshot",
      profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
      targetCount: 1,
      profileInventoryHash: `sha256:${"1".repeat(64)}`,
      settledVisualHash: `sha256:${"2".repeat(64)}`,
    },
  };
  const contributionHash = hashBabylonNativeSceneContributionV1(
    driftedContribution,
  );
  const manifest = {
    ...directory.receipt.manifest,
    sceneSource: {
      ...directory.receipt.manifest.sceneSource,
      nativeSceneContributionHash: contributionHash,
    },
  };
  const files = rootFiles(directory).map((file) => {
    if (file.path === "native/contribution.json") {
      return { ...file, bytes: canonicalJsonBytes(driftedContribution) };
    }
    if (file.path === "manifest.json") {
      return { ...file, bytes: canonicalJsonBytes(manifest) };
    }
    return file;
  });
  const fileIntegrityEntries =
    canonicalizeWorldPackageFileIntegrityEntriesV1(files.map((file) => ({
      path: file.path,
      mediaType: file.mediaType,
      sizeBytes: file.bytes.byteLength,
      contentHash: sha256Bytes(file.bytes) as `sha256:${string}`,
    })));
  const worldPackageRootHash = hashWorldPackageRootV1(fileIntegrityEntries);
  const worldPackageRef = worldPackageRefFromRootHashV1(worldPackageRootHash);
  const worldBuildIdentity = {
    ...directory.receipt.worldBuildIdentity,
    worldPackageRef,
    worldPackageRootHash,
    sceneSourceIdentity: {
      ...directory.receipt.worldBuildIdentity.sceneSourceIdentity,
      nativeSceneContributionHash: contributionHash,
    },
  };
  return {
    files,
    receipt: {
      ...directory.receipt,
      manifest,
      manifestHash: hashWorldPackageManifestV1(manifest),
      fileIntegrityEntries,
      worldPackageRootHash,
      worldPackageRef,
      worldBuildIdentity,
      worldBuildIdentityHash: hashWorldBuildIdentityV1(worldBuildIdentity),
    },
  };
}

describe("WorldPackageDirectoryV1", () => {
  it("recomputes and exposes every member of the exact runtime closure", () => {
    const verified = verifyWorldPackageDirectoryV1(fixture());
    expect(verified.kind).toBe("canonical-execution-plan");
    if (verified.kind !== "canonical-execution-plan") throw new Error("unreachable");
    expect(verified.executionPlan.worldRuntimeBootstrapHash).toBe(verified.worldRuntimeBootstrap.contentHash);
    expect(verified.worldRuntimeBootstrap.gameplayBootstrapHash).toBe(verified.gameplayBootstrap.contentHash);
    expect(verified.receipt.worldBuildIdentityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it.each(["integrity.json", "world-package-build-receipt.json", "world-build-identity.json"])("refuses transport metadata %s as a root input", (path) => {
    const directory = fixture();
    expect(() => assembleWorldPackageDirectoryV1({
      receipt: directory.receipt,
      files: directory.files.filter((file) =>
        !["integrity.json", "world-package-build-receipt.json", "world-build-identity.json"].includes(file.path)
      ).concat({ path, mediaType: "application/json", bytes: canonicalJsonBytes({}) }),
    })).toThrow("WORLD_PACKAGE_DIRECTORY_INVALID");
  });

  it("rejects modified root bytes", () => {
    const directory = fixture();
    const tampered = {
      ...directory,
      files: directory.files.map((file) => file.path === "world.normalized.json"
        ? { ...file, bytes: canonicalJsonBytes({ kind: "tampered" }) }
        : file),
    };
    expect(() => verifyWorldPackageDirectoryV1(tampered)).toThrow("WORLD_PACKAGE_DIRECTORY_INVALID");
  });

  it("rejects modified post-root identity bytes", () => {
    const directory = fixture();
    const tampered = {
      ...directory,
      files: directory.files.map((file) => file.path === "world-build-identity.json"
        ? { ...file, bytes: canonicalJsonBytes({ ...directory.receipt.worldBuildIdentity, id: "forged" }) }
        : file),
    };
    expect(() => verifyWorldPackageDirectoryV1(tampered)).toThrow("world-build-identity.json");
  });

  it("rejects cross-lane shadow artifacts even under a self-consistent Root", () => {
    const native = createBabylonNativeWorldPackageV1(
      createBabylonNativeWorldPackageTestInputV1(),
    );
    const nativeShadow = withRootShadow(native, "world.normalized.json");
    expect(() => assembleWorldPackageDirectoryV1(nativeShadow))
      .toThrow("scene source Root path closure failed");

    const canonical = fixture();
    const canonicalShadow = withRootShadow(
      canonical,
      "native/bootstrap.json",
    );
    expect(() => assembleWorldPackageDirectoryV1(canonicalShadow))
      .toThrow("scene source Root path closure failed");
  });

  it("rejects self-consistent Canonical authoring identity drift when the audit file is omitted", () => {
    const directory = createCanonicalWorldPackageV1(
      createWorldPackageTestInputV1({ includeAuthoringSpec: false }),
    );
    const tampered = withCanonicalAuthoringSpecHashDrift(directory);

    expect(() => assembleWorldPackageDirectoryV1(tampered))
      .toThrow("WORLD_PACKAGE_DIRECTORY_INVALID");
  });

  it("rejects a self-consistent Contribution settlement Profile mismatch", () => {
    const directory = createBabylonNativeWorldPackageV1(
      createBabylonNativeWorldPackageTestInputV1(),
    );
    expect(() => assembleWorldPackageDirectoryV1(
      withNativeContributionProfileDrift(directory),
    )).toThrow("WORLD_PACKAGE_NATIVE_MEMBERSHIP_INVALID");
  });
});
