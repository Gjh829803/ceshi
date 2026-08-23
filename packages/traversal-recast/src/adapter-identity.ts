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

export const RECAST_QUERY_PROVIDER_CONSTANTS_V1 = Object.freeze({
  rawMaximumNodes: 64,
  maximumProviderPolygonRef: 0xffff_ffff,
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
  core: Object.freeze({
    revision: "lifecycle.1",
    patchedDependencyKey: "@recast-navigation/core@0.43.1",
    repositoryRelativePatchPath:
      "patches/@recast-navigation__core@0.43.1.patch",
    patchBytesSha256:
      "sha256:7a330d1418a92699943cf161cdcb47c6e144a6858bb0cfbcb33aa91dd1de33dd",
  }),
  generators: Object.freeze({
    revision: "lifecycle.1+source-areas.1",
    patchedDependencyKey: "@recast-navigation/generators@0.43.1",
    repositoryRelativePatchPath:
      "patches/@recast-navigation__generators@0.43.1.patch",
    patchBytesSha256:
      "sha256:473d1656cf37232187c24a5f81289d1a5a854732d54fd54b667f3402faa18a06",
  }),
} as const);

const RECAST_INSTALLED_FILES_V1 = Object.freeze([
  Object.freeze({
    packageRole: "core",
    packageRelativeFilePath: "dist/index.mjs",
    fileBytesSha256:
      "sha256:615212a96d14a905a75a295a0895ce66b44c0fca2219d966868bc11c63e1b3c8",
  }),
  Object.freeze({
    packageRole: "generators",
    packageRelativeFilePath:
      "dist/generators/generate-tiled-nav-mesh.d.ts",
    fileBytesSha256:
      "sha256:96961d693bdc58eeac65ea725e1fbaf637ff751bd7346dc409e7562cc8832f6c",
  }),
  Object.freeze({
    packageRole: "generators",
    packageRelativeFilePath: "dist/index.mjs",
    fileBytesSha256:
      "sha256:a5f1170ca1f0a339750e5af066bbb1d717dac30e4a093b7f5ffc45c8e1cebbdf",
  }),
] as const);

const RECAST_SOURCE_MAPPING_V1 = Object.freeze({
  mergeOrder: "terrain-first-then-blockers-sorted-by-colliderSubshapeId",
  terrainVertexBoundary: "terrain-position-count-divided-by-three",
  sourceAreaActivationPredicate: "blocking-triangle-count-greater-than-zero",
  blockerReservedAreaId: 1,
  blockerFinalAreaId: 0,
  compactAreaConversionPoint:
    "after-buildCompactHeightfield-before-erodeWalkableArea",
  terrainPolygonFlag: 1,
  noOptionCompatibility:
    "task-2-packed-golden-sha256:97459be30f32a7a37bcdb92bc655d5b70a0378cd43d930c07cb4c0eae076b374",
} as const);

const RECAST_BOUNDS_MAPPING_V1 = Object.freeze({
  xz: "certified-retained-terrain-minimum-maximum",
  y: "merged-terrain-and-relevant-blocker-minimum-maximum",
} as const);

const RECAST_QUERY_MAPPING_V1 = Object.freeze({
  includeFlags: 1,
  excludeFlags: 0,
  endpointHalfExtentsXZ:
    "capsuleRadiusMeters+clearanceMarginMeters+voxelCellSizeMeters",
  endpointHalfExtentY:
    "capsuleHeightMeters/2+maxStepHeightMeters+voxelCellHeightMeters",
  rawMaximumNodes:
    "adapter-owned-query-capacity-for-nearest-and-straight-path-only",
  straightPathRawCapacity: "stableMaximumPointCount+1-sentinel",
} as const);

const RECAST_CANONICAL_PROJECTION_MAPPING_V1 = Object.freeze({
  polygonIdentity:
    "quantized-canonical-closed-vertex-cycle-plus-surface-identity",
  portalRecovery: "detour-link-edge-side-bmin-bmax-overlap",
  nodeSlope: "maximum-detail-triangle-slope-degrees-rounded-up",
  heightDelta: "signed-destination-centroid-y-minus-source-centroid-y",
  stepHeight: "maximum-absolute-portal-endpoint-height-discontinuity",
  clearanceWidth:
    "two-times-walkableRadiusCells-times-voxelCellSizeMeters-rounded-down",
  clearanceHeight:
    "walkableHeightCells-times-voxelCellHeightMeters-rounded-down",
  edgeCost:
    "positive-safe-integer-distance-plus-slope-and-step-profile-cost",
  angleQuantization: "fixed-angle-grid-round-up",
  costQuantization: "fixed-cost-grid-round-up-minimum-one",
  capacityStatus:
    "deterministic-minimum-required-count-without-provider-status",
} as const);

export const RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1 = Object.freeze({
  kind: "traversal-graph-provider-adapter-manifest",
  schemaVersion: 1,
  graphProviderAdapterRef:
    "worldkit://graph-provider-adapter/recast-navigation.tiled@1",
  graphProviderAdapterResolvedVersion:
    "0.43.1+lifecycle.1+source-areas.1+mapping.3",
  providerPackageName: "recast-navigation",
  providerPackageVersion: "0.43.1",
  providerPackages: RECAST_PROVIDER_PACKAGES_V1,
  lifecyclePatches: RECAST_LIFECYCLE_PATCHES_V1,
  installedFiles: RECAST_INSTALLED_FILES_V1,
  generatorMode: "tiled",
  meterQuantization: "nearest-integer-micrometer",
  formulas: RECAST_MAPPING_FORMULAS_V1,
  constants: RECAST_PROVIDER_CONSTANTS_V1,
  sourceMapping: RECAST_SOURCE_MAPPING_V1,
  boundsMapping: RECAST_BOUNDS_MAPPING_V1,
  queryMapping: RECAST_QUERY_MAPPING_V1,
  queryConstants: RECAST_QUERY_PROVIDER_CONSTANTS_V1,
  canonicalProjectionMapping: RECAST_CANONICAL_PROJECTION_MAPPING_V1,
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
