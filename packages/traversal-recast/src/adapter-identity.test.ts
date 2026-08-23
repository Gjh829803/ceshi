import {
  BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
} from "@whitebox-world/runtime-babylon";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type { TraversalRuntimeImplementationIdentityV1 } from "@whitebox-world/traversal";
import { describe, expect, it } from "vitest";

import {
  assertAuditedTraversalRuntimeIdentityV1,
  RECAST_GRAPH_PROVIDER_ADAPTER_HASH_V1,
  RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1,
  RECAST_QUERY_PROVIDER_CONSTANTS_V1,
} from "./adapter-identity.js";

describe("Recast Graph Provider Adapter identity", () => {
  it("accepts only the production Runtime tuple", () => {
    expect(() => assertAuditedTraversalRuntimeIdentityV1(
      BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
    )).not.toThrow();

    const unsupportedIdentities: TraversalRuntimeImplementationIdentityV1[] = [
      {
        ...BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
        runtimeBackendHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
      },
      {
        ...BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
        runtimeAdapterRef: "worldkit://runtime-adapter/babylon-world-runtime@1",
      },
      {
        ...BABYLON_TRAVERSAL_RUNTIME_IMPLEMENTATION_IDENTITY_V1,
        runtimeAdapterHash:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const,
      },
    ];
    for (const unsupported of unsupportedIdentities) {
      expect(() => assertAuditedTraversalRuntimeIdentityV1(unsupported)).toThrow(
        "TRAVERSAL_RECAST_BACKEND_MAPPING_NOT_AUDITED",
      );
    }
  });

  it("hashes package version, tiled mode, mapping formulas, and constants", () => {
    expect(RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1).toMatchObject({
      kind: "traversal-graph-provider-adapter-manifest",
      schemaVersion: 1,
      graphProviderAdapterRef:
        "worldkit://graph-provider-adapter/recast-navigation.tiled@1",
      graphProviderAdapterResolvedVersion:
        "0.43.1+lifecycle.1+source-areas.3+mapping.5",
      providerPackageName: "recast-navigation",
      providerPackageVersion: "0.43.1",
      generatorMode: "tiled",
      meterQuantization: "nearest-integer-micrometer",
      sourceMapping: {
        mergeOrder:
          "candidate-sources-sorted-by-traversalSurfaceId-then-blockers-sorted-by-colliderSubshapeId",
        terrainVertexBoundary: "terrain-position-count-divided-by-three",
        sourceAreaActivationPredicate: "blocking-triangle-count-greater-than-zero",
        layeredSourceModeKind: "layered-traversal-sources-r1b",
        candidateSourceRangeOrder: "canonical-traversalSurfaceId",
        candidateAreaIdFormula: "2+traversalSurfaceOrdinal",
        candidateAreaIdMinimum: 2,
        candidateAreaIdMaximum: 62,
        maximumCandidateSourceRangeCount: 61,
        blockerReservedAreaId: 1,
        blockerFinalAreaId: 0,
        recastNullAreaId: 0,
        recastWalkableAreaId: 63,
        candidateAreaAssignmentPredicate: "slope-marked-area-is-not-null",
        candidateAreaAssignmentPoint:
          "after-markWalkableTriangles-before-blocker-area-and-rasterizeTriangles",
        blockerAreaAssignmentPoint:
          "after-candidate-area-before-rasterizeTriangles",
        compactAreaConversionPoint: "after-buildCompactHeightfield-before-erodeWalkableArea",
        candidatePolygonFlag: 1,
        candidatePolygonFlagAssignmentPoint:
          "after-buildPolyMeshDetail-before-createNavMeshData",
        terrainPolygonFlag: 1,
        noOptionCompatibility: "task-2-packed-golden-sha256:97459be30f32a7a37bcdb92bc655d5b70a0378cd43d930c07cb4c0eae076b374",
      },
      boundsMapping: {
        xz: "certified-retained-terrain-minimum-maximum",
        y: "merged-terrain-and-relevant-blocker-minimum-maximum",
      },
      queryMapping: {
        includeFlags: 1,
        excludeFlags: 0,
        endpointHalfExtentsXZ: "capsuleRadiusMeters+clearanceMarginMeters+voxelCellSizeMeters",
        endpointHalfExtentY: "capsuleHeightMeters/2+maxStepHeightMeters+voxelCellHeightMeters",
        rawMaximumNodes:
          "adapter-owned-query-capacity-for-nearest-and-straight-path-only",
        straightPathRawCapacity: "stableMaximumPointCount+1-sentinel",
      },
      queryConstants: {
        rawMaximumNodes: 64,
      },
      canonicalProjectionMapping: {
        polygonIdentity:
          "quantized-canonical-closed-vertex-cycle-plus-surface-identity",
        portalRecovery: "detour-link-edge-side-bmin-bmax-overlap",
        nodeSlope: "maximum-detail-triangle-slope-degrees-rounded-up",
        heightDelta:
          "signed-destination-centroid-y-minus-source-centroid-y",
        stepHeight:
          "maximum-absolute-portal-endpoint-height-discontinuity",
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
      },
      constants: {
        borderSize: 0,
        minRegionArea: 8,
        mergeRegionArea: 20,
        maxVertsPerPoly: 6,
        detailSampleDist: 6,
        detailSampleMaxError: 1,
        buildBvTree: true,
        chunkyTriMeshTrisPerChunk: 128,
      },
    });
    expect(RECAST_GRAPH_PROVIDER_ADAPTER_HASH_V1).toBe(
      sha256CanonicalJson(RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1),
    );
    expect(RECAST_GRAPH_PROVIDER_ADAPTER_HASH_V1).toBe(
      "sha256:188ff09ee328ad7e17fd21f5c1ccd759c05e0cf4c8d280bc66c814d8a99937e2",
    );
    expect(Object.isFrozen(RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1)).toBe(true);
    expect(Object.isFrozen(RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1.constants))
      .toBe(true);
    expect(Object.isFrozen(RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1.installedFiles))
      .toBe(true);
    expect(Object.isFrozen(RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1.sourceMapping))
      .toBe(true);
    expect(Object.isFrozen(RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1.queryMapping))
      .toBe(true);
    expect(Object.isFrozen(RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1.queryConstants))
      .toBe(true);
    expect(RECAST_QUERY_PROVIDER_CONSTANTS_V1.rawMaximumNodes).toBe(64);
    expect(RECAST_QUERY_PROVIDER_CONSTANTS_V1.maximumProviderPolygonRef)
      .toBe(0xffff_ffff);
  });

  it("pins both the declared and installed provider version to the manifest", () => {
    const packageJson = JSON.parse(readFileSync(
      new URL("../package.json", import.meta.url),
      "utf8",
    )) as { dependencies: Record<string, string> };
    const providerEntryPath = createRequire(import.meta.url).resolve(
      "recast-navigation",
    );
    const installedPackageJson = JSON.parse(readFileSync(
      new URL("./package.json", pathToFileURL(providerEntryPath)),
      "utf8",
    )) as { version: string };

    expect(packageJson.dependencies["recast-navigation"]).toBe(
      RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1.providerPackageVersion,
    );
    expect(installedPackageJson.version).toBe(
      RECAST_GRAPH_PROVIDER_ADAPTER_MANIFEST_V1.providerPackageVersion,
    );
  });
});
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
