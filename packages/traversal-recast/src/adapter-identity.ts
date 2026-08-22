import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type { TraversalRuntimeImplementationIdentityV1 } from "@whitebox-world/traversal";

export const RECAST_PROVIDER_CONSTANTS_V1 = Object.freeze({
  borderSize: 0,
  minRegionArea: 8,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1,
  buildBvTree: true,
  chunkyTriMeshTrisPerChunk: 128,
} as const);

const RECAST_MAPPING_FORMULAS_V1 = Object.freeze({
  walkableHeight: "ceil(capsuleHeightMicrometers/voxelCellHeightMicrometers)",
  walkableClimb: "floor(maxStepHeightMicrometers/voxelCellHeightMicrometers)",
  walkableRadius:
    "ceil((capsuleRadiusMicrometers+clearanceMarginMicrometers)/voxelCellSizeMicrometers)",
  maximumEdgeLength:
    "floor(maximumEdgeLengthMicrometers/voxelCellSizeMicrometers)",
  maximumSimplificationError:
    "maximumSimplificationErrorMicrometers/voxelCellSizeMicrometers",
} as const);

const RECAST_PROVIDER_PACKAGES_V1 = Object.freeze({
  recastNavigation: Object.freeze({
    packageName: "recast-navigation",
    version: "0.43.1",
    lockfileIntegritySha512:
      "sha512-BVBQEHE6uqD36opJomVkI5TxMVZ8bBLdDn90mYtBUYJnNlqEuNFOL8DH8lLOksfVVaC+kjykYuS57P6MrxVB7A==",
  }),
  core: Object.freeze({
    packageName: "@recast-navigation/core",
    version: "0.43.1",
    lockfileIntegritySha512:
      "sha512-4igfPgnoV90O92sDSIA0xHa6tanh3z/udlgGmD0SqGQ6PKV4JS2l9jWO8YnxfZuXP/NV52H4c5FU6pSdZc9WDA==",
  }),
  generators: Object.freeze({
    packageName: "@recast-navigation/generators",
    version: "0.43.1",
    lockfileIntegritySha512:
      "sha512-w7r6k/A93wWxuSN+Lg+PmlsUVXq06r5bqXmBglolxqDt2O/Y776BIhYtb6P2P6pbYqDWORu9NCZZJzfY4FNpaA==",
  }),
  wasm: Object.freeze({
    packageName: "@recast-navigation/wasm",
    version: "0.43.1",
    lockfileIntegritySha512:
      "sha512-XFL6PhO8JodwXUHBSAkfaLUdUEweIkJsdP3HTmtJvMs5fkqEWxWJmBskZlACHJepv55NAriqWxOtuLlG3t7+Hg==",
  }),
} as const);

const RECAST_LIFECYCLE_PATCHES_V1 = Object.freeze({
  revision: "lifecycle.1",
  core: Object.freeze({
    patchedDependencyKey: "@recast-navigation/core@0.43.1",
    repositoryRelativePatchPath:
      "patches/@recast-navigation__core@0.43.1.patch",
    patchBytesSha256:
      "sha256:7a330d1418a92699943cf161cdcb47c6e144a6858bb0cfbcb33aa91dd1de33dd",
    installedPackageRelativeFilePath: "dist/index.mjs",
    installedFileBytesSha256:
      "sha256:615212a96d14a905a75a295a0895ce66b44c0fca2219d966868bc11c63e1b3c8",
  }),
  generators: Object.freeze({
    patchedDependencyKey: "@recast-navigation/generators@0.43.1",
    repositoryRelativePatchPath:
      "patches/@recast-navigation__generators@0.43.1.patch",
    patchBytesSha256:
      "sha256:7077fea9c1f42a4df273c3c2a7e3e786eefd22472bb1291014745574db87597e",
    installedPackageRelativeFilePath: "dist/index.mjs",
    installedFileBytesSha256:
      "sha256:fc6ef0103cac1429867a05fa73d3c215998c501e0ced3d2576913926af452baf",
  }),
} as const);

export const RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1 = Object.freeze({
  kind: "traversal-graph-provider-adapter-manifest",
  schemaVersion: 1,
  graphProviderAdapterRef:
    "worldkit://graph-provider-adapter/recast-navigation.tiled@1",
  graphProviderAdapterResolvedVersion: "0.43.1+lifecycle.1+mapping.1",
  providerPackageName: "recast-navigation",
  providerPackageVersion: "0.43.1",
  providerPackages: RECAST_PROVIDER_PACKAGES_V1,
  lifecyclePatches: RECAST_LIFECYCLE_PATCHES_V1,
  generatorMode: "tiled",
  meterQuantization: "nearest-integer-micrometer",
  formulas: RECAST_MAPPING_FORMULAS_V1,
  constants: RECAST_PROVIDER_CONSTANTS_V1,
} as const);

export const RECAST_GRAPH_PROVIDER_ADAPTER_HASH_V1 = sha256CanonicalJson(
  RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1,
) as `sha256:${string}`;

const AUDITED_RUNTIME_IDENTITY: TraversalRuntimeImplementationIdentityV1 =
  Object.freeze({
    runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
    runtimeBackendResolvedVersion: "9.21.2+1.3.14",
    runtimeBackendHash:
      "sha256:1982272a51a0c0020df6f8b16aefcb27ab2e3542afdbc526cfa53709caaed750",
    runtimeAdapterRef:
      "worldkit://runtime-adapter/babylon.character-controller@1",
    runtimeAdapterResolvedVersion: "1",
    runtimeAdapterHash:
      "sha256:5f5d18392742ccfcb4b88da1492ff22a2ceb402bb966fe17eeeb0db8cac28c8d",
  });

export function assertAuditedTraversalRuntimeIdentityV1(
  identity: TraversalRuntimeImplementationIdentityV1,
): void {
  if (
    identity.runtimeBackendRef !== AUDITED_RUNTIME_IDENTITY.runtimeBackendRef ||
    identity.runtimeBackendResolvedVersion !==
      AUDITED_RUNTIME_IDENTITY.runtimeBackendResolvedVersion ||
    identity.runtimeBackendHash !== AUDITED_RUNTIME_IDENTITY.runtimeBackendHash ||
    identity.runtimeAdapterRef !== AUDITED_RUNTIME_IDENTITY.runtimeAdapterRef ||
    identity.runtimeAdapterResolvedVersion !==
      AUDITED_RUNTIME_IDENTITY.runtimeAdapterResolvedVersion ||
    identity.runtimeAdapterHash !== AUDITED_RUNTIME_IDENTITY.runtimeAdapterHash
  ) {
    throw new Error(
      "TRAVERSAL_RECAST_BACKEND_MAPPING_NOT_AUDITED: Runtime identity does not match the audited Babylon/Havok traversal implementation.",
    );
  }
}
