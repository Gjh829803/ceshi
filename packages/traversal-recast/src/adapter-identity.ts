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

export const RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1 = Object.freeze({
  kind: "traversal-graph-provider-adapter-manifest",
  schemaVersion: 1,
  graphProviderAdapterRef:
    "worldkit://graph-provider-adapter/recast-navigation.tiled@1",
  graphProviderAdapterResolvedVersion: "0.43.1+mapping.1",
  providerPackageName: "recast-navigation",
  providerPackageVersion: "0.43.1",
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
