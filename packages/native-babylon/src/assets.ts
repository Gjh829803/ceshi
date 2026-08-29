/** Exact resource identity used to request one Package-locked asset. */
export interface BabylonNativeLockedAssetRequestV1 {
  readonly assetResourceRef: string;
}

/** Import semantics admitted for the first static-geometry profile. */
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

/**
 * Caller-owned bytes plus the exact admission/publication identities that the
 * Host revalidated before exposing an asset to Native authoring code. Every
 * resolve() call receives a fresh byte buffer; mutating it cannot alter Host
 * state or a later resolution.
 */
export interface BabylonNativeLockedAssetV1 {
  readonly kind: "babylon-native-locked-asset";
  readonly schemaVersion: 1;
  readonly assetResourceRef: string;
  readonly assetAdmissionReceiptRef: string;
  readonly assetAdmissionReceiptHash: string;
  readonly assetPublicationReceiptRef: string;
  readonly assetPublicationReceiptHash: string;
  readonly classBuildRecordRef: string;
  readonly classBuildRecordHash: string;
  readonly resourceManifestHash: string;
  readonly artifactContentHash: string;
  readonly bytes: Uint8Array;
  readonly importMetadata: Readonly<BabylonNativeStaticGeometryImportMetadataV1>;
}

/** Resolver for assets already admitted and locked into the current Package. */
export interface BabylonNativeLockedAssetResolverV1 {
  resolve(
    request: Readonly<BabylonNativeLockedAssetRequestV1>,
  ): Promise<Readonly<BabylonNativeLockedAssetV1>>;
}
