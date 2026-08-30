import {
  createBabylonNativeLockedAssetResolutionFailureV1,
  type BabylonNativeLockedAssetResolverV1,
} from "@whitebox-world/native-babylon/host";
import type { BabylonNativeLockedAssetV1 } from
  "@whitebox-world/native-babylon";
import {
  sha256Bytes,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  canonicalBabylonNativeAssetLockBytesV1,
  hashBabylonNativeAssetLockV1,
  parseBabylonNativeAssetLockV1,
  parseNativeSceneDiagnosticV1,
  type BabylonNativeAssetLockEntryV1,
  type BabylonNativeAssetLockV1,
  type BabylonNativeStaticGeometryImportMetadataV1,
} from "@whitebox-world/runtime-contracts";
import type { SceneAuthoringSelectedAssetResourceV1 } from
  "@whitebox-world/scene-authoring-contracts";
import type { ResolvedBabylonNativeWorldPackageAssetV1 } from
  "@whitebox-world/world-package";
import { isEqual } from "lodash-es";

export interface PublishedBabylonNativeStaticGeometryAssetV1 {
  readonly kind: "static-geometry-asset";
  readonly assetResourceRef: string;
  readonly resourceManifestHash: Sha256HashV1;
  readonly artifactPath: string;
  readonly artifactContentHash: Sha256HashV1;
  readonly bytes: Uint8Array;
  readonly mediaType: "model/gltf-binary";
  readonly classBuildRecordRef: string;
  readonly classBuildRecordHash: Sha256HashV1;
  readonly assetAdmissionReceiptRef: string;
  readonly assetAdmissionReceiptHash: Sha256HashV1;
  readonly assetPublicationReceiptRef: string;
  readonly assetPublicationReceiptHash: Sha256HashV1;
  readonly importMetadata: BabylonNativeStaticGeometryImportMetadataV1;
  readonly license: Readonly<{
    spdxExpression: string;
    licenseDocumentPath: string;
  }>;
  readonly provenance: Readonly<{
    author: string;
    sourceUri: string;
  }>;
  readonly redistributionPolicy: "redistributable" | "restricted";
}

export interface ResolveBabylonNativeAssetLockInputV1 {
  readonly selectedAssetResources:
    readonly SceneAuthoringSelectedAssetResourceV1[];
  readonly publishedAssets:
    readonly PublishedBabylonNativeStaticGeometryAssetV1[];
}

export interface ResolvedBabylonNativeAssetLockV1 {
  readonly assetLock: BabylonNativeAssetLockV1;
  readonly assetLockBytes: Uint8Array;
  readonly assetLockHash: Sha256HashV1;
  readonly assetResolver: BabylonNativeLockedAssetResolverV1;
  readonly resourceArtifacts:
    readonly ResolvedBabylonNativeWorldPackageAssetV1[];
}

export interface BabylonNativeReplayAssetLedgerV1 {
  readonly assetResolver: BabylonNativeLockedAssetResolverV1;
  beginReplay(replayIndex: 0 | 1): void;
  snapshot(): readonly [readonly string[], readonly string[]];
}

export class BabylonNativeAssetLockResolutionErrorV1 extends Error {
  readonly code = "WORLDKIT_NATIVE_ASSET_LOCK_RESOLUTION_FAILED";

  constructor() {
    super("WORLDKIT_NATIVE_ASSET_LOCK_RESOLUTION_FAILED");
  }
}

function fail(): never {
  throw new BabylonNativeAssetLockResolutionErrorV1();
}

function cloneBytes(input: unknown): Uint8Array {
  if (
    !(input instanceof Uint8Array) ||
    Object.getPrototypeOf(input) !== Uint8Array.prototype ||
    input.byteLength === 0
  ) return fail();
  return new Uint8Array(input);
}

function sortedUnique(values: readonly string[]): readonly string[] {
  const sorted = [...values].sort((left, right) =>
    left.localeCompare(right, "en-US"));
  if (new Set(sorted).size !== sorted.length) return fail();
  return Object.freeze(sorted);
}

function lockedAssetFromEntry(
  entry: BabylonNativeAssetLockEntryV1,
  bytes: Uint8Array,
): Readonly<BabylonNativeLockedAssetV1> {
  return Object.freeze({
    kind: "babylon-native-locked-asset",
    schemaVersion: 1,
    assetResourceRef: entry.assetResourceRef,
    assetAdmissionReceiptRef: entry.assetAdmissionReceiptRef,
    assetAdmissionReceiptHash: entry.assetAdmissionReceiptHash,
    assetPublicationReceiptRef: entry.assetPublicationReceiptRef,
    assetPublicationReceiptHash: entry.assetPublicationReceiptHash,
    classBuildRecordRef: entry.classBuildRecordRef,
    classBuildRecordHash: entry.classBuildRecordHash,
    resourceManifestHash: entry.resourceManifestHash,
    artifactContentHash: entry.artifactContentHash,
    bytes: new Uint8Array(bytes),
    importMetadata: entry.importMetadata,
  });
}

function missingAssetError(assetResourceRef: string): Error {
  return createBabylonNativeLockedAssetResolutionFailureV1(
    parseNativeSceneDiagnosticV1({
      kind: "native-scene-diagnostic",
      schemaVersion: 1,
      id: "native-package.asset-resolution-failed",
      severity: "error",
      stage: "dependency",
      code: "WORLDKIT_NATIVE_SCENE_ASSET_RESOLUTION_FAILED",
      location: { kind: "asset-resource", assetResourceRef },
      measurement: { kind: "none" },
      message: "The requested Package-locked asset is unavailable.",
      repairHint: "Select and publish the exact static geometry asset before replay.",
    }),
  );
}

export function resolveBabylonNativeAssetLockV1(
  input: ResolveBabylonNativeAssetLockInputV1,
): ResolvedBabylonNativeAssetLockV1 {
  try {
    if (
      !Array.isArray(input.selectedAssetResources) ||
      !Array.isArray(input.publishedAssets)
    ) return fail();
    const selectedRefs = sortedUnique(input.selectedAssetResources.map(
      ({ assetResourceRef }) => assetResourceRef));
    const publishedRefs = sortedUnique(input.publishedAssets.map(
      ({ assetResourceRef }) => assetResourceRef));
    if (!isEqual(selectedRefs, publishedRefs)) return fail();

    const selectedByRef = new Map(input.selectedAssetResources.map((entry) =>
      [entry.assetResourceRef, entry] as const));
    const bytesByRef = new Map<string, Uint8Array>();
    const entries = input.publishedAssets.map((asset) => {
      if (asset.kind !== "static-geometry-asset") return fail();
      const bytes = cloneBytes(asset.bytes);
      if (
        asset.mediaType !== "model/gltf-binary" ||
        sha256Bytes(bytes) !== asset.artifactContentHash
      ) return fail();
      const selected = selectedByRef.get(asset.assetResourceRef);
      if (
        selected?.assetPublicationReceiptRef !==
          asset.assetPublicationReceiptRef ||
        selected.assetPublicationReceiptHash !==
          asset.assetPublicationReceiptHash
      ) return fail();
      bytesByRef.set(asset.assetResourceRef, bytes);
      return {
        assetResourceRef: asset.assetResourceRef,
        resourceManifestHash: asset.resourceManifestHash,
        artifactPath: asset.artifactPath,
        artifactSizeBytes: bytes.byteLength,
        artifactContentHash: asset.artifactContentHash,
        mediaType: asset.mediaType,
        classBuildRecordRef: asset.classBuildRecordRef,
        classBuildRecordHash: asset.classBuildRecordHash,
        assetAdmissionReceiptRef: asset.assetAdmissionReceiptRef,
        assetAdmissionReceiptHash: asset.assetAdmissionReceiptHash,
        assetPublicationReceiptRef: asset.assetPublicationReceiptRef,
        assetPublicationReceiptHash: asset.assetPublicationReceiptHash,
        importMetadata: asset.importMetadata,
        license: asset.license,
        provenance: asset.provenance,
        redistributionPolicy: asset.redistributionPolicy,
      };
    });
    const assetLock = parseBabylonNativeAssetLockV1({
      kind: "babylon-native-asset-lock",
      schemaVersion: 1,
      entries,
    });
    const entryByRef = new Map(assetLock.entries.map((entry) =>
      [entry.assetResourceRef, entry] as const));
    const assetResolver: BabylonNativeLockedAssetResolverV1 = Object.freeze({
      async resolve({ assetResourceRef }: Readonly<{
        assetResourceRef: string;
      }>) {
        const entry = entryByRef.get(assetResourceRef);
        const bytes = bytesByRef.get(assetResourceRef);
        if (entry === undefined || bytes === undefined) {
          throw missingAssetError(assetResourceRef);
        }
        return lockedAssetFromEntry(entry, bytes);
      },
    });
    const resourceArtifacts = Object.freeze(assetLock.entries.map((assetLockEntry) => {
      const bytes = bytesByRef.get(assetLockEntry.assetResourceRef);
      if (bytes === undefined) return fail();
      return Object.freeze({
        assetLockEntry,
        bytes: new Uint8Array(bytes),
      });
    }));
    return Object.freeze({
      assetLock,
      assetLockBytes: canonicalBabylonNativeAssetLockBytesV1(assetLock),
      assetLockHash: hashBabylonNativeAssetLockV1(assetLock),
      assetResolver,
      resourceArtifacts,
    });
  } catch (error) {
    if (error instanceof BabylonNativeAssetLockResolutionErrorV1) throw error;
    return fail();
  }
}

export function createBabylonNativeReplayAssetLedgerV1(
  baseResolver: BabylonNativeLockedAssetResolverV1,
): BabylonNativeReplayAssetLedgerV1 {
  const resolvedRefsByReplay = [new Set<string>(), new Set<string>()] as const;
  let activeReplayIndex: 0 | 1 | undefined;
  return Object.freeze({
    assetResolver: Object.freeze({
      async resolve(request: Readonly<{ assetResourceRef: string }>) {
        if (activeReplayIndex === undefined) return fail();
        const resolved = await baseResolver.resolve(request);
        if (resolved.assetResourceRef !== request.assetResourceRef) return fail();
        resolvedRefsByReplay[activeReplayIndex].add(resolved.assetResourceRef);
        return Object.freeze({
          ...resolved,
          bytes: new Uint8Array(resolved.bytes),
        });
      },
    }),
    beginReplay(replayIndex: 0 | 1) {
      if (replayIndex !== 0 && replayIndex !== 1) return fail();
      activeReplayIndex = replayIndex;
    },
    snapshot() {
      return Object.freeze([
        Object.freeze([...resolvedRefsByReplay[0]].sort()),
        Object.freeze([...resolvedRefsByReplay[1]].sort()),
      ] as const);
    },
  });
}
