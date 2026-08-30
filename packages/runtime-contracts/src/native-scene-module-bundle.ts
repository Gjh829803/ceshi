import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";

import {
  exactContractRecordV1,
  invalidContractDataV1,
  contractHashV1,
  contractIdentityV1,
  contractResourceRefV1,
  contractSafeIntegerV1,
  contractSafePathV1,
  snapshotContractDataV1,
} from "./strict-contract-data";

export type NativeSceneModuleBundleRefV1 =
  `package://native-scene-module/sha256/${string}`;

export interface BabylonNativeSceneModuleBundleSourceV1 {
  readonly path: string;
  readonly contentHash: Sha256HashV1;
}

export interface BabylonNativeSceneModuleBundleFileV1 {
  readonly path: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly contentHash: Sha256HashV1;
}

export interface BabylonNativeSceneResolvedProfileV1 {
  readonly resourceRef: string;
  readonly resolvedVersion: string;
  readonly contentHash: Sha256HashV1;
}

export interface BabylonNativeSceneModuleBundleManifestV1 {
  readonly kind: "babylon-native-scene-module-bundle";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sceneModuleRef: string;
  readonly sceneModuleBundleRef: NativeSceneModuleBundleRefV1;
  readonly entryPath: "native/scene.mjs";
  readonly sourceInventory: readonly BabylonNativeSceneModuleBundleSourceV1[];
  readonly fileInventory: readonly BabylonNativeSceneModuleBundleFileV1[];
  readonly sourceGraphHash: Sha256HashV1;
  readonly bundleSizeBytes: number;
  readonly bundleMediaType: "text/javascript";
  readonly bundleContentHash: Sha256HashV1;
  readonly nativeSceneApi: BabylonNativeSceneResolvedProfileV1;
  readonly nativeSceneProfile: BabylonNativeSceneResolvedProfileV1;
  readonly importProfileHash: Sha256HashV1;
  readonly typescriptCompilerOptionsHash: Sha256HashV1;
  readonly bundlerProfileHash: Sha256HashV1;
  readonly seed: number;
  readonly dependencyLockHash: Sha256HashV1;
  readonly assetLockHash: Sha256HashV1;
}

const INVALID = "BABYLON_NATIVE_SCENE_MODULE_BUNDLE_MANIFEST_INVALID";
const INVALID_REF = "NATIVE_SCENE_MODULE_BUNDLE_REF_INVALID";
const MANIFEST_FIELDS = Object.freeze([
  "kind", "schemaVersion", "id", "sceneModuleRef", "sceneModuleBundleRef",
  "entryPath", "sourceInventory", "fileInventory", "sourceGraphHash",
  "bundleSizeBytes", "bundleMediaType", "bundleContentHash", "nativeSceneApi",
  "nativeSceneProfile", "importProfileHash", "typescriptCompilerOptionsHash",
  "bundlerProfileHash", "seed", "dependencyLockHash", "assetLockHash",
] as const);
const SOURCE_FIELDS = Object.freeze(["path", "contentHash"] as const);
const FILE_FIELDS = Object.freeze(["path", "mediaType", "sizeBytes", "contentHash"] as const);
const PROFILE_FIELDS = Object.freeze(["resourceRef", "resolvedVersion", "contentHash"] as const);
const BUNDLE_REF_PATTERN = /^package:\/\/native-scene-module\/sha256\/([a-f0-9]{64})$/;

function parseProfile(
  input: unknown,
  resourceKind: "native-scene-api" | "native-scene-profile",
): BabylonNativeSceneResolvedProfileV1 {
  const record = exactContractRecordV1(input, PROFILE_FIELDS, INVALID);
  return Object.freeze({
    resourceRef: contractResourceRefV1(record.resourceRef, INVALID, resourceKind),
    resolvedVersion: contractIdentityV1(record.resolvedVersion, INVALID),
    contentHash: contractHashV1(record.contentHash, INVALID),
  });
}

function orderedUniqueByPath<T extends Readonly<{ path: string }>>(
  rows: T[],
): readonly T[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.path)) invalidContractDataV1(INVALID);
    seen.add(row.path);
  }
  rows.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return Object.freeze(rows);
}

export function nativeSceneModuleBundleRefFromHashV1(
  input: unknown,
): NativeSceneModuleBundleRefV1 {
  let hash: Sha256HashV1;
  try {
    hash = contractHashV1(input, INVALID_REF);
  } catch {
    return invalidContractDataV1(INVALID_REF);
  }
  return `package://native-scene-module/sha256/${hash.slice("sha256:".length)}`;
}

export function nativeSceneModuleBundleHashFromRefV1(
  input: unknown,
): Sha256HashV1 {
  if (typeof input !== "string") invalidContractDataV1(INVALID_REF);
  const match = BUNDLE_REF_PATTERN.exec(input);
  if (match === null || match[1] === "0".repeat(64)) {
    return invalidContractDataV1(INVALID_REF);
  }
  return `sha256:${match[1]}` as Sha256HashV1;
}

export function parseBabylonNativeSceneModuleBundleManifestV1(
  input: unknown,
): BabylonNativeSceneModuleBundleManifestV1 {
  const record = exactContractRecordV1(
    snapshotContractDataV1(input, INVALID),
    MANIFEST_FIELDS,
    INVALID,
  );
  if (
    record.kind !== "babylon-native-scene-module-bundle" ||
    record.schemaVersion !== 1 ||
    record.entryPath !== "native/scene.mjs" ||
    record.bundleMediaType !== "text/javascript" ||
    !Array.isArray(record.sourceInventory) ||
    record.sourceInventory.length === 0 ||
    !Array.isArray(record.fileInventory) ||
    record.fileInventory.length === 0
  ) return invalidContractDataV1(INVALID);

  const sourceInventory = orderedUniqueByPath(
    record.sourceInventory.map((candidate) => {
      const source = exactContractRecordV1(candidate, SOURCE_FIELDS, INVALID);
      return Object.freeze({
        path: contractSafePathV1(source.path, INVALID),
        contentHash: contractHashV1(source.contentHash, INVALID),
      });
    }),
  );
  const fileInventory = orderedUniqueByPath(
    record.fileInventory.map((candidate) => {
      const file = exactContractRecordV1(candidate, FILE_FIELDS, INVALID);
      return Object.freeze({
        path: contractSafePathV1(file.path, INVALID),
        mediaType: contractIdentityV1(file.mediaType, INVALID),
        sizeBytes: contractSafeIntegerV1(file.sizeBytes, INVALID, 1),
        contentHash: contractHashV1(file.contentHash, INVALID),
      });
    }),
  );
  const bundleContentHash = contractHashV1(record.bundleContentHash, INVALID);
  let sceneModuleBundleHash: Sha256HashV1;
  try {
    sceneModuleBundleHash = nativeSceneModuleBundleHashFromRefV1(record.sceneModuleBundleRef);
  } catch {
    return invalidContractDataV1(INVALID);
  }
  const entry = fileInventory.find((file) => file.path === "native/scene.mjs");
  const bundleSizeBytes = contractSafeIntegerV1(record.bundleSizeBytes, INVALID, 1);
  if (
    sceneModuleBundleHash !== bundleContentHash ||
    entry?.contentHash !== bundleContentHash ||
    entry.sizeBytes !== bundleSizeBytes ||
    entry.mediaType !== "text/javascript"
  ) return invalidContractDataV1(INVALID);

  return Object.freeze({
    kind: "babylon-native-scene-module-bundle",
    schemaVersion: 1,
    id: contractIdentityV1(record.id, INVALID),
    sceneModuleRef: contractResourceRefV1(record.sceneModuleRef, INVALID, "native-scene"),
    sceneModuleBundleRef: nativeSceneModuleBundleRefFromHashV1(bundleContentHash),
    entryPath: "native/scene.mjs",
    sourceInventory,
    fileInventory,
    sourceGraphHash: contractHashV1(record.sourceGraphHash, INVALID),
    bundleSizeBytes,
    bundleMediaType: "text/javascript",
    bundleContentHash,
    nativeSceneApi: parseProfile(record.nativeSceneApi, "native-scene-api"),
    nativeSceneProfile: parseProfile(record.nativeSceneProfile, "native-scene-profile"),
    importProfileHash: contractHashV1(record.importProfileHash, INVALID),
    typescriptCompilerOptionsHash: contractHashV1(record.typescriptCompilerOptionsHash, INVALID),
    bundlerProfileHash: contractHashV1(record.bundlerProfileHash, INVALID),
    seed: contractSafeIntegerV1(record.seed, INVALID, 0, 0xffff_ffff),
    dependencyLockHash: contractHashV1(record.dependencyLockHash, INVALID),
    assetLockHash: contractHashV1(record.assetLockHash, INVALID),
  });
}

export function canonicalBabylonNativeSceneModuleBundleManifestBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseBabylonNativeSceneModuleBundleManifestV1(input));
}

export function hashBabylonNativeSceneModuleBundleManifestV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseBabylonNativeSceneModuleBundleManifestV1(input),
  ) as Sha256HashV1;
}
