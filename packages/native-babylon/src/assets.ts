import {
  parseNativeSceneDiagnosticV1,
  type NativeSceneDiagnosticV1,
} from "./diagnostics.js";

const LOCKED_ASSET_RESOLUTION_FAILURE_V1 = Symbol(
  "BabylonNativeLockedAssetResolutionFailureV1",
);

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

/** Trusted-Host transport for one stable, already-sanitized asset diagnostic. */
export interface BabylonNativeLockedAssetResolutionFailureV1 extends Error {
  readonly diagnostic: NativeSceneDiagnosticV1;
  readonly [LOCKED_ASSET_RESOLUTION_FAILURE_V1]: true;
}

export function createBabylonNativeLockedAssetResolutionFailureV1(
  diagnostic: NativeSceneDiagnosticV1,
): BabylonNativeLockedAssetResolutionFailureV1 {
  const parsedDiagnostic = parseNativeSceneDiagnosticV1(diagnostic);
  const problem = new Error(parsedDiagnostic.code) as
    BabylonNativeLockedAssetResolutionFailureV1;
  Object.defineProperties(problem, {
    diagnostic: {
      configurable: false,
      enumerable: true,
      value: parsedDiagnostic,
      writable: false,
    },
    [LOCKED_ASSET_RESOLUTION_FAILURE_V1]: {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    },
  });
  return Object.freeze(problem);
}

export function isBabylonNativeLockedAssetResolutionFailureV1(
  input: unknown,
): input is BabylonNativeLockedAssetResolutionFailureV1 {
  return input instanceof Error &&
    (input as Partial<BabylonNativeLockedAssetResolutionFailureV1>)[
      LOCKED_ASSET_RESOLUTION_FAILURE_V1
    ] === true;
}
