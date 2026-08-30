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

export interface BabylonNativeStaticGeometryImportMetadataV1 {
  readonly kind: "static-geometry-glb";
  readonly mediaType: "model/gltf-binary";
  readonly format: "glb";
  readonly gltfVersion: "2.0";
  readonly localForwardAxis: "-Z" | "+Z" | "-X" | "+X";
  readonly localUpAxis: "+Y";
  readonly metersPerUnit: 1;
  readonly pivot: "support-center" | "centroid";
}

export interface BabylonNativeAssetLockEntryV1 {
  readonly assetResourceRef: string;
  readonly resourceManifestHash: Sha256HashV1;
  readonly artifactPath: string;
  readonly artifactSizeBytes: number;
  readonly artifactContentHash: Sha256HashV1;
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

export interface BabylonNativeAssetLockV1 {
  readonly kind: "babylon-native-asset-lock";
  readonly schemaVersion: 1;
  readonly entries: readonly BabylonNativeAssetLockEntryV1[];
}

const INVALID = "BABYLON_NATIVE_ASSET_LOCK_INVALID";
const LOCK_FIELDS = Object.freeze(["kind", "schemaVersion", "entries"] as const);
const ENTRY_FIELDS = Object.freeze([
  "assetResourceRef", "resourceManifestHash", "artifactPath", "artifactSizeBytes",
  "artifactContentHash", "mediaType", "classBuildRecordRef", "classBuildRecordHash",
  "assetAdmissionReceiptRef", "assetAdmissionReceiptHash", "assetPublicationReceiptRef",
  "assetPublicationReceiptHash", "importMetadata", "license", "provenance",
  "redistributionPolicy",
] as const);
const IMPORT_FIELDS = Object.freeze([
  "kind", "mediaType", "format", "gltfVersion", "localForwardAxis", "localUpAxis",
  "metersPerUnit", "pivot",
] as const);
const LICENSE_FIELDS = Object.freeze(["spdxExpression", "licenseDocumentPath"] as const);
const PROVENANCE_FIELDS = Object.freeze(["author", "sourceUri"] as const);

function parseImportMetadata(input: unknown): BabylonNativeStaticGeometryImportMetadataV1 {
  const record = exactContractRecordV1(input, IMPORT_FIELDS, INVALID);
  if (
    record.kind !== "static-geometry-glb" ||
    record.mediaType !== "model/gltf-binary" ||
    record.format !== "glb" ||
    record.gltfVersion !== "2.0" ||
    !["-Z", "+Z", "-X", "+X"].includes(record.localForwardAxis as string) ||
    record.localUpAxis !== "+Y" ||
    record.metersPerUnit !== 1 ||
    (record.pivot !== "support-center" && record.pivot !== "centroid")
  ) return invalidContractDataV1(INVALID);
  return Object.freeze({
    kind: "static-geometry-glb",
    mediaType: "model/gltf-binary",
    format: "glb",
    gltfVersion: "2.0",
    localForwardAxis: record.localForwardAxis as BabylonNativeStaticGeometryImportMetadataV1["localForwardAxis"],
    localUpAxis: "+Y",
    metersPerUnit: 1,
    pivot: record.pivot,
  });
}

export function parseBabylonNativeAssetLockV1(input: unknown): BabylonNativeAssetLockV1 {
  const record = exactContractRecordV1(
    snapshotContractDataV1(input, INVALID),
    LOCK_FIELDS,
    INVALID,
  );
  if (
    record.kind !== "babylon-native-asset-lock" ||
    record.schemaVersion !== 1 ||
    !Array.isArray(record.entries)
  ) return invalidContractDataV1(INVALID);
  const refs = new Set<string>();
  const paths = new Set<string>();
  const entries = record.entries.map((candidate) => {
    const entry = exactContractRecordV1(candidate, ENTRY_FIELDS, INVALID);
    const assetResourceRef = contractResourceRefV1(
      entry.assetResourceRef,
      INVALID,
      "static-geometry-asset",
    );
    const artifactPath = contractSafePathV1(entry.artifactPath, INVALID);
    if (
      refs.has(assetResourceRef) ||
      paths.has(artifactPath) ||
      entry.mediaType !== "model/gltf-binary" ||
      (entry.redistributionPolicy !== "redistributable" && entry.redistributionPolicy !== "restricted")
    ) return invalidContractDataV1(INVALID);
    refs.add(assetResourceRef);
    paths.add(artifactPath);
    const license = exactContractRecordV1(entry.license, LICENSE_FIELDS, INVALID);
    const provenance = exactContractRecordV1(entry.provenance, PROVENANCE_FIELDS, INVALID);
    const sourceUri = contractIdentityV1(provenance.sourceUri, INVALID);
    let parsedSource: URL;
    try {
      parsedSource = new URL(sourceUri);
    } catch {
      return invalidContractDataV1(INVALID);
    }
    if (parsedSource.protocol !== "https:" && parsedSource.protocol !== "http:") {
      return invalidContractDataV1(INVALID);
    }
    return Object.freeze({
      assetResourceRef,
      resourceManifestHash: contractHashV1(entry.resourceManifestHash, INVALID),
      artifactPath,
      artifactSizeBytes: contractSafeIntegerV1(entry.artifactSizeBytes, INVALID, 1),
      artifactContentHash: contractHashV1(entry.artifactContentHash, INVALID),
      mediaType: "model/gltf-binary" as const,
      classBuildRecordRef: contractResourceRefV1(entry.classBuildRecordRef, INVALID),
      classBuildRecordHash: contractHashV1(entry.classBuildRecordHash, INVALID),
      assetAdmissionReceiptRef: contractResourceRefV1(entry.assetAdmissionReceiptRef, INVALID),
      assetAdmissionReceiptHash: contractHashV1(entry.assetAdmissionReceiptHash, INVALID),
      assetPublicationReceiptRef: contractResourceRefV1(entry.assetPublicationReceiptRef, INVALID),
      assetPublicationReceiptHash: contractHashV1(entry.assetPublicationReceiptHash, INVALID),
      importMetadata: parseImportMetadata(entry.importMetadata),
      license: Object.freeze({
        spdxExpression: contractIdentityV1(license.spdxExpression, INVALID),
        licenseDocumentPath: contractSafePathV1(license.licenseDocumentPath, INVALID),
      }),
      provenance: Object.freeze({
        author: contractIdentityV1(provenance.author, INVALID),
        sourceUri,
      }),
      redistributionPolicy: entry.redistributionPolicy,
    });
  });
  entries.sort((left, right) =>
    left.assetResourceRef < right.assetResourceRef
      ? -1
      : left.assetResourceRef > right.assetResourceRef
        ? 1
        : 0
  );
  return Object.freeze({
    kind: "babylon-native-asset-lock",
    schemaVersion: 1,
    entries: Object.freeze(entries),
  });
}

export function canonicalBabylonNativeAssetLockBytesV1(input: unknown): Uint8Array {
  return canonicalJsonBytes(parseBabylonNativeAssetLockV1(input));
}

export function hashBabylonNativeAssetLockV1(input: unknown): Sha256HashV1 {
  return sha256CanonicalJson(parseBabylonNativeAssetLockV1(input)) as Sha256HashV1;
}
