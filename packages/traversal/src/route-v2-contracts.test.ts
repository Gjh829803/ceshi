import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  BUILT_IN_HEIGHTFIELD_R1_LOW_BUDGET_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  ROUTE_CONNECTIVITY_FAILURE_CODES_V2,
  assertRouteOverlayContextV2,
  assertRoutePathReceiptForGraphV2,
  assertRouteConnectivityResultForBuildInputV2,
  assertTraversalGraphForBuildInputV2,
  canonicalRouteConnectivityFailureV2,
  canonicalRouteConnectivityResultV2,
  canonicalRouteOverlayV2,
  canonicalRoutePathReceiptV2,
  canonicalTraversalGraphV2,
  hashRouteConnectivityFailureV2,
  hashRouteOverlayV2,
  hashRoutePathReceiptV2,
  hashTraversalGraphV2,
  resolveTraversalGraphBuilderProfileV1,
  resolveTraversalGraphBuilderProfileV2,
} from "./index.js";
import type { RouteBuildInputV2 } from "./build-input.js";
import { summarizeRoutePathGraphMetricsV2 } from "./path-receipt.js";
import {
  HASH_A,
  HASH_B,
  completeV2BuildInput,
  heightfieldSurface,
  platformSurface,
  v2BuildInputReceipt,
  validV2BuildInputDraft,
} from "./route-v2-test-support.js";

function inventory(
  surfaces: RouteBuildInputV2["traversalSurfaces"],
) {
  return Object.fromEntries(
    surfaces.map((surface) => [surface.traversalSurfaceId, surface]),
  );
}

function staticIdentities(
  colliders: RouteBuildInputV2["staticColliders"],
) {
  return colliders.map((row) => ({
    entityId: row.entityId,
    logicalSubshapeId: row.logicalSubshapeId,
    colliderSubshapeId: row.colliderSubshapeId,
    colliderHash: row.colliderHash,
  }));
}

function graphDraft(receipt = v2BuildInputReceipt()) {
  const input = receipt.input;
  const heightfield = heightfieldSurface();
  const platform = platformSurface();
  const envelope = input.capabilityEnvelope;
  const edge = {
    type: "walk" as const,
    distanceMeters: 4.5,
    heightDeltaMeters: 0,
    stepHeightMeters: 0,
    slopeDegrees: 0,
    minimumClearanceWidthMeters: 0.9,
    minimumClearanceHeightMeters: 2,
    routePathCost: 4.5,
  };
  return {
    kind: "traversal-graph" as const,
    schemaVersion: 2 as const,
    authoringSpecHash: input.authoringSpecHash,
    layoutSolveReportHash: input.layoutSolveReportHash,
    resourceLockHash: input.resourceLockHash,
    terrainArtifactHash: input.terrainArtifactHash,
    colliderArtifactHash: input.colliderArtifactHash,
    geometryArtifactHash: input.geometryArtifactHash,
    surfaceArtifactHash: input.surfaceArtifactHash,
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: envelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: envelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: envelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: envelope.graphBuilderProfileHash,
    routeId: input.connectivityRequirement.routeId,
    startAnchorEntityId: input.startAnchor.entityId,
    destinationAnchorEntityId: input.destinationAnchor.entityId,
    traversalSurfaceIdentitiesById: inventory(input.traversalSurfaces),
    traversalNodesById: {
      "node-a": {
        id: "node-a",
        traversalSurfaceId: heightfield.traversalSurfaceId,
        surfaceEntityId: heightfield.surfaceEntityId,
        colliderSubshapeId: heightfield.colliderSubshapeId,
        positionMetersXYZ: [0, 0, 0] as const,
        tileId: "tile-0",
        clearanceWidthMeters: 0.9,
        clearanceHeightMeters: 2,
      },
      "node-b": {
        id: "node-b",
        traversalSurfaceId: platform.traversalSurfaceId,
        surfaceEntityId: platform.surfaceEntityId,
        colliderSubshapeId: platform.colliderSubshapeId,
        positionMetersXYZ: [4, 0, 2] as const,
        tileId: "tile-1",
        clearanceWidthMeters: 0.9,
        clearanceHeightMeters: 2,
      },
      "node-c": {
        id: "node-c",
        traversalSurfaceId: heightfield.traversalSurfaceId,
        surfaceEntityId: heightfield.surfaceEntityId,
        colliderSubshapeId: heightfield.colliderSubshapeId,
        positionMetersXYZ: [8, 0, 0] as const,
        tileId: "tile-2",
        clearanceWidthMeters: 0.9,
        clearanceHeightMeters: 2,
      },
    },
    traversalEdgesById: {
      "edge-ab": {
        id: "edge-ab",
        fromTraversalNodeId: "node-a",
        toTraversalNodeId: "node-b",
        ...edge,
      },
      "edge-bc": {
        id: "edge-bc",
        fromTraversalNodeId: "node-b",
        toTraversalNodeId: "node-c",
        ...edge,
      },
    },
  };
}

function pathDraft(graph: ReturnType<typeof canonicalTraversalGraphV2>) {
  const heightfield = heightfieldSurface();
  const platform = platformSurface();
  return {
    kind: "route-path-receipt" as const,
    schemaVersion: 2 as const,
    status: "complete" as const,
    constraintId: "hero-to-goal",
    routeId: graph.routeId,
    traversingEntityId: "player",
    startAnchorEntityId: graph.startAnchorEntityId,
    destinationAnchorEntityId: graph.destinationAnchorEntityId,
    authoringSpecHash: graph.authoringSpecHash,
    layoutSolveReportHash: graph.layoutSolveReportHash,
    resourceLockHash: graph.resourceLockHash,
    traversalGraphHash: hashTraversalGraphV2(graph),
    routeBuildInputHash: graph.routeBuildInputHash,
    resolvedTraversalLockHash: graph.resolvedTraversalLockHash,
    graphBuilderProfileRef: graph.graphBuilderProfileRef,
    graphBuilderResolvedVersion: graph.graphBuilderResolvedVersion,
    graphBuilderProfileHash: graph.graphBuilderProfileHash,
    orderedTraversalNodeIds: ["node-a", "node-b", "node-c"],
    orderedTraversalEdgeIds: ["edge-ab", "edge-bc"],
    orderedPathPositionsMetersXYZ: [
      [0, 0, 0],
      [4, 0, 2],
      [8, 0, 0],
    ] as const,
    orderedTraversalSurfaceIdentities: [heightfield, platform, heightfield],
    routePathDistanceMeters: 8.946,
    routePathDistanceMetersXZ: 8.946,
    routePathCost: 9,
    maximumObservedSlopeDegrees: 0,
    maximumObservedStepHeightMeters: 0,
    minimumObservedClearanceWidthMeters: 0.9,
    minimumObservedClearanceHeightMeters: 2,
    maximumObservedSurfaceGapMeters: 0,
  };
}

function overlayDraft(
  path: ReturnType<typeof canonicalRoutePathReceiptV2>,
  input: RouteBuildInputV2,
) {
  return {
    kind: "route-overlay" as const,
    schemaVersion: 2 as const,
    constraintId: path.constraintId,
    routeId: path.routeId,
    traversingEntityId: path.traversingEntityId,
    startAnchor: input.startAnchor,
    destinationAnchor: input.destinationAnchor,
    resolvedTraversalLockHash: path.resolvedTraversalLockHash,
    traversalGraphHash: path.traversalGraphHash,
    routePathReceiptHash: hashRoutePathReceiptV2(path),
    orderedTraversalNodeIds: path.orderedTraversalNodeIds,
    orderedTraversalEdgeIds: path.orderedTraversalEdgeIds,
    orderedPathPositionsMetersXYZ: path.orderedPathPositionsMetersXYZ,
    orderedTraversalSurfaceIdentities: path.orderedTraversalSurfaceIdentities,
    hardRibbon: input.hardRibbon,
    staticColliderIdentities: staticIdentities(input.staticColliders),
  };
}

function completeResult(receipt = v2BuildInputReceipt()) {
  const graph = canonicalTraversalGraphV2(graphDraft(receipt));
  const path = canonicalRoutePathReceiptV2(pathDraft(graph));
  return {
    kind: "route-connectivity-result" as const,
    schemaVersion: 2 as const,
    status: "complete" as const,
    traversalGraph: graph,
    traversalGraphHash: hashTraversalGraphV2(graph),
    routePathReceipt: path,
    routePathReceiptHash: hashRoutePathReceiptV2(path),
  };
}

function failureCommon(receipt = v2BuildInputReceipt()) {
  const input = receipt.input;
  const envelope = input.capabilityEnvelope;
  return {
    kind: "route-connectivity-failure" as const,
    schemaVersion: 2 as const,
    constraintId: input.connectivityRequirement.constraintId,
    routeId: input.connectivityRequirement.routeId,
    traversingEntityId: input.connectivityRequirement.traversingEntityId,
    startAnchorEntityId: input.startAnchor.entityId,
    destinationAnchorEntityId: input.destinationAnchor.entityId,
    startAnchorPositionMetersXYZ: input.startAnchor.positionMetersXYZ,
    destinationAnchorPositionMetersXYZ: input.destinationAnchor.positionMetersXYZ,
    relatedTraversalSurfaceIdentities: [] as const,
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: envelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: envelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: envelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: envelope.graphBuilderProfileHash,
  };
}

describe("Route V2 Graph, Path, Overlay, and Connectivity", () => {
  it("keeps Heightfield → platform → Heightfield identities aligned and drops path-global Surface", () => {
    const receipt = v2BuildInputReceipt();
    const graph = assertTraversalGraphForBuildInputV2(graphDraft(receipt), receipt);
    const path = assertRoutePathReceiptForGraphV2(pathDraft(graph), graph);
    const result = assertRouteConnectivityResultForBuildInputV2(
      completeResult(receipt),
      receipt,
    );
    const overlay = assertRouteOverlayContextV2({
      overlay: overlayDraft(path, receipt.input),
      routeConnectivityResult: result,
      buildInputReceipt: receipt,
    });
    expect(path.orderedTraversalSurfaceIdentities).toHaveLength(
      path.orderedTraversalNodeIds.length,
    );
    expect(path).not.toHaveProperty("traversalSurfaceIdentity");
    expect(overlay).not.toHaveProperty("traversalSurfaceIdentity");
    expect(overlay).toHaveProperty("staticColliderIdentities");
    expect(overlay).not.toHaveProperty(
      ["blocking", "Collider", "Identities"].join(""),
    );
    expect(overlay.orderedTraversalSurfaceIdentities).toEqual(
      path.orderedTraversalSurfaceIdentities,
    );
    expect(overlay.staticColliderIdentities).toEqual(
      staticIdentities(receipt.input.staticColliders),
    );
  });

  it("rejects Graph inventory, Node triple, and artifact hash mismatches", () => {
    const receipt = v2BuildInputReceipt();
    const graph = graphDraft(receipt);
    const heightfield = heightfieldSurface();
    expect(() => assertTraversalGraphForBuildInputV2({
      ...graph,
      traversalSurfaceIdentitiesById: {
        ...graph.traversalSurfaceIdentitiesById,
        [heightfield.traversalSurfaceId]: {
          ...heightfield,
          resolvedVersion: "9",
        },
      },
    }, receipt)).toThrow("TRAVERSAL_GRAPH_INVALID");
    expect(() => assertTraversalGraphForBuildInputV2({
      ...graph,
      traversalNodesById: {
        ...graph.traversalNodesById,
        "node-a": {
          ...graph.traversalNodesById["node-a"]!,
          surfaceEntityId: "forged-entity",
        },
      },
    }, receipt)).toThrow("TRAVERSAL_GRAPH_INVALID");
    expect(() => assertTraversalGraphForBuildInputV2({
      ...graph,
      geometryArtifactHash: HASH_A,
    }, receipt)).toThrow("TRAVERSAL_GRAPH_INVALID");
  });

  it("binds every Graph V2 provenance, lock, profile, route, and anchor field to Build Input", () => {
    const receipt = v2BuildInputReceipt();
    const graph = graphDraft(receipt);
    const alternateV2Builder = resolveTraversalGraphBuilderProfileV2(
      BUILT_IN_HEIGHTFIELD_R1_LOW_BUDGET_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    );
    const mutations = [
      { authoringSpecHash: HASH_B },
      { layoutSolveReportHash: HASH_B },
      { resourceLockHash: HASH_B },
      { terrainArtifactHash: HASH_B },
      { colliderArtifactHash: HASH_B },
      { geometryArtifactHash: HASH_B },
      { surfaceArtifactHash: HASH_B },
      { routeBuildInputHash: HASH_B },
      { resolvedTraversalLockHash: HASH_B },
      {
        graphBuilderProfileRef: alternateV2Builder.resourceRef,
        graphBuilderResolvedVersion: alternateV2Builder.resolvedVersion,
        graphBuilderProfileHash: alternateV2Builder.contentHash,
      },
      { routeId: "forged-route" },
      { startAnchorEntityId: "forged-start" },
      { destinationAnchorEntityId: "forged-destination" },
    ] as const;

    for (const mutation of mutations) {
      expect(() => assertTraversalGraphForBuildInputV2({
        ...graph,
        ...mutation,
      }, receipt)).toThrow("TRAVERSAL_GRAPH_INVALID");
    }
  });

  it("rejects broken Path edge adjacency across Heightfield and platform Surfaces", () => {
    const graph = canonicalTraversalGraphV2(graphDraft());
    const path = pathDraft(graph);

    expect(() => assertRoutePathReceiptForGraphV2({
      ...path,
      orderedTraversalEdgeIds: ["edge-bc", "edge-ab"],
    }, graph)).toThrow("ROUTE_PATH_RECEIPT_INVALID");
  });

  it("recomputes every Path metric from canonical positions, Edges, and Nodes", () => {
    const graph = canonicalTraversalGraphV2(graphDraft());
    const path = {
      ...pathDraft(graph),
      routePathDistanceMeters: 8.946,
      routePathDistanceMetersXZ: 8.946,
    };
    const mutations = [
      { routePathDistanceMeters: 999 },
      { routePathDistanceMetersXZ: 999 },
      { routePathCost: 999 },
      { maximumObservedSlopeDegrees: 1 },
      { maximumObservedStepHeightMeters: 1 },
      { minimumObservedClearanceWidthMeters: 1 },
      { minimumObservedClearanceHeightMeters: 3 },
      { maximumObservedSurfaceGapMeters: 1 },
    ] as const;

    expect(assertRoutePathReceiptForGraphV2(path, graph)).toMatchObject({
      orderedTraversalSurfaceIdentities: [
        heightfieldSurface(),
        platformSurface(),
        heightfieldSurface(),
      ],
      routePathDistanceMeters: 8.946,
      routePathDistanceMetersXZ: 8.946,
      routePathCost: 9,
    });
    for (const mutation of mutations) {
      expect(() => assertRoutePathReceiptForGraphV2({
        ...path,
        ...mutation,
      }, graph)).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    }
  });

  it("keeps straight-path positions independent from Graph Node centers", () => {
    const graph = canonicalTraversalGraphV2(graphDraft());
    const path = {
      ...pathDraft(graph),
      orderedPathPositionsMetersXYZ: [
        [0, 0, 0],
        [4.2, 0, 2],
        [8, 0, 0],
      ] as const,
      routePathDistanceMeters: 8.947,
      routePathDistanceMetersXZ: 8.947,
    };

    expect(path.orderedPathPositionsMetersXYZ[1]).not.toEqual(
      graph.traversalNodesById["node-b"]!.positionMetersXYZ,
    );
    expect(assertRoutePathReceiptForGraphV2(path, graph))
      .toMatchObject({ routePathDistanceMeters: 8.947 });
  });

  it("summarizes Profile-sized Path metrics without argument spreading", () => {
    const graph = canonicalTraversalGraphV2(graphDraft());
    const node = graph.traversalNodesById["node-a"]!;
    const edge = graph.traversalEdgesById["edge-ab"]!;

    expect(summarizeRoutePathGraphMetricsV2(
      Array(130_000).fill(node),
      Array(129_999).fill(edge),
      0,
    )).toEqual({
      maximumObservedSlopeDegrees: edge.slopeDegrees,
      maximumObservedStepHeightMeters: edge.stepHeightMeters,
      minimumObservedClearanceWidthMeters: Math.min(
        node.clearanceWidthMeters,
        edge.minimumClearanceWidthMeters,
      ),
      minimumObservedClearanceHeightMeters: Math.min(
        node.clearanceHeightMeters,
        edge.minimumClearanceHeightMeters,
      ),
    });
  });

  it("rejects V1 Graph Builder identities in standalone V2 evidence", () => {
    const graph = canonicalTraversalGraphV2(graphDraft());
    const v1Builder = resolveTraversalGraphBuilderProfileV1(
      BUILT_IN_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    );
    const profileIdentity = {
      graphBuilderProfileRef: v1Builder.resourceRef,
      graphBuilderResolvedVersion: v1Builder.resolvedVersion,
      graphBuilderProfileHash: v1Builder.contentHash,
    };
    expect(() => canonicalRoutePathReceiptV2({
      ...pathDraft(graph),
      ...profileIdentity,
    })).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    expect(() => canonicalRouteConnectivityFailureV2({
      ...failureCommon(),
      ...profileIdentity,
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "required-path-unreachable",
        code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
        relevantBlockingColliderEntityIds: [],
        blockedWaterEntityIds: [],
      },
    })).toThrow("ROUTE_CONNECTIVITY_FAILURE_INVALID");
  });

  it("rejects Overlay/Path identity drift, collider inventory mutation, and Surface replacement", () => {
    const receipt = v2BuildInputReceipt();
    const graph = canonicalTraversalGraphV2(graphDraft(receipt));
    const path = canonicalRoutePathReceiptV2(pathDraft(graph));
    const result = completeResult(receipt);
    const overlay = overlayDraft(path, receipt.input);
    const replaced = [platformSurface(), platformSurface(), platformSurface()];
    expect(() => assertRoutePathReceiptForGraphV2({
      ...path,
      orderedTraversalSurfaceIdentities: replaced,
    }, graph)).toThrow("ROUTE_PATH_RECEIPT_INVALID");
    expect(hashRouteOverlayV2({
      ...overlay,
      orderedTraversalSurfaceIdentities: replaced,
    })).not.toBe(hashRouteOverlayV2(overlay));
    expect(() => assertRouteOverlayContextV2({
      overlay: {
        ...overlay,
        orderedTraversalSurfaceIdentities: replaced,
      },
      routeConnectivityResult: result,
      buildInputReceipt: receipt,
    })).toThrow("ROUTE_OVERLAY_INVALID");
    expect(() => assertRouteOverlayContextV2({
      overlay: {
        ...overlay,
        staticColliderIdentities: overlay.staticColliderIdentities.slice(0, 1),
      },
      routeConnectivityResult: result,
      buildInputReceipt: receipt,
    })).toThrow("ROUTE_OVERLAY_INVALID");
    expect(canonicalRouteOverlayV2(overlay).staticColliderIdentities).toHaveLength(
      receipt.input.staticColliders.length,
    );
  });

  it("validates V2 Connectivity reasons, empty-geometry cardinality, and deleted singular Surface fields", () => {
    expect(ROUTE_CONNECTIVITY_FAILURE_CODES_V2).toEqual(expect.arrayContaining([
      "ROUTE_SURFACE_PROFILE_MISSING",
      "ROUTE_SURFACE_CORRELATION_MISSING",
      "ROUTE_SURFACE_CORRELATION_AMBIGUOUS",
      "ROUTE_REQUIRED_PATH_UNREACHABLE",
      "ROUTE_GRAPH_BUDGET_EXCEEDED",
    ]));
    const receipt = v2BuildInputReceipt();
    const common = failureCommon(receipt);
    const emptyReceipt = v2BuildInputReceipt({
      ...validV2BuildInputDraft(),
      terrainSource: { kind: "empty", terrainEntityId: "terrain-main" },
      staticColliders: [],
      traversalSurfaces: [heightfieldSurface()],
    });
    const emptyFailure = canonicalRouteConnectivityFailureV2({
      ...failureCommon(emptyReceipt),
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "empty-heightfield-source",
        code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
        terrainEntityId: "terrain-main",
      },
    });
    expect(emptyFailure.relatedTraversalSurfaceIdentities).toEqual([]);
    expect(emptyFailure).not.toHaveProperty("traversalSurfaceId");
    expect(() => assertRouteConnectivityResultForBuildInputV2({
      kind: "route-connectivity-result",
      schemaVersion: 2,
      status: "unreachable",
      graphStatus: "unavailable",
      connectivityFailure: {
        ...common,
        status: "unreachable",
        graphStatus: "unavailable",
        reason: {
          kind: "empty-heightfield-source",
          code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
          terrainEntityId: "terrain-main",
        },
      },
      connectivityFailureHash: HASH_A,
    }, receipt)).toThrow("ROUTE_CONNECTIVITY_RESULT_INVALID");

    const profileMissing = canonicalRouteConnectivityFailureV2({
      ...common,
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "surface-profile-missing",
        code: "ROUTE_SURFACE_PROFILE_MISSING",
        relevantColliderSubshapeIds: [
          receipt.input.staticColliders[0]!.colliderSubshapeId,
        ],
        failurePositionMetersXYZ: [1, 0, 1],
      },
    });
    expect(profileMissing.relatedTraversalSurfaceIdentities).toHaveLength(0);
    expect(hashRouteConnectivityFailureV2(profileMissing)).toBe(
      sha256CanonicalJson(profileMissing),
    );

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      relatedTraversalSurfaceIdentities: [heightfieldSurface()],
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "surface-correlation-missing",
        code: "ROUTE_SURFACE_CORRELATION_MISSING",
        failurePositionMetersXYZ: [1, 0, 1],
      },
    }).relatedTraversalSurfaceIdentities).toHaveLength(1);

    const sortedIdentities = [heightfieldSurface(), platformSurface()].sort((left, right) =>
      left.traversalSurfaceId < right.traversalSurfaceId ? -1 : 1
    );
    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      relatedTraversalSurfaceIdentities: sortedIdentities,
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "surface-correlation-ambiguous",
        code: "ROUTE_SURFACE_CORRELATION_AMBIGUOUS",
        failurePositionMetersXYZ: [1, 0, 1],
      },
    }).relatedTraversalSurfaceIdentities.length).toBeGreaterThanOrEqual(2);

    expect(() => canonicalRouteConnectivityFailureV2({
      ...common,
      relatedTraversalSurfaceIdentities: [
        heightfieldSurface(),
        { ...heightfieldSurface(), resolvedVersion: "2" },
      ],
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "surface-correlation-ambiguous",
        code: "ROUTE_SURFACE_CORRELATION_AMBIGUOUS",
        failurePositionMetersXYZ: [1, 0, 1],
      },
    })).toThrow("ROUTE_CONNECTIVITY_FAILURE_INVALID");

    expect(() => canonicalRouteConnectivityFailureV2({
      ...common,
      traversalSurfaceId: "surface-terrain",
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "no-queryable-ground-surface",
        code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
      },
    })).toThrow("ROUTE_CONNECTIVITY_FAILURE_INVALID");

    expect(Object.isFrozen(canonicalRouteConnectivityResultV2(completeResult(receipt)))).toBe(
      true,
    );
  });

  it("migrates every retained V1 reason through the V2 status, field, and identity table", () => {
    const receipt = v2BuildInputReceipt();
    const common = failureCommon(receipt);
    const heightfield = heightfieldSurface();
    const colliderSubshapeId = receipt.input.staticColliders[0]!.colliderSubshapeId;
    const budget = {
      maximumAllowedCount: 1,
      minimumRequiredCount: 2,
    } as const;
    const proof = {
      proofKind: "unique-single-reason-cut" as const,
      proofCandidateIds: ["candidate-a"],
      failurePositionMetersXYZ: [1, 0, 1] as const,
    };
    const completeHash = { traversalGraphHash: HASH_A } as const;

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "no-queryable-ground-surface",
        code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
      },
    }).relatedTraversalSurfaceIdentities).toEqual([]);

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      ...completeHash,
      status: "unreachable",
      graphStatus: "complete",
      reason: {
        kind: "start-surface-not-found",
        code: "ROUTE_START_SURFACE_NOT_FOUND",
        anchorEntityId: "spawn-main",
        positionMetersXYZ: [0, 0, 0],
      },
    }).reason).not.toHaveProperty("traversalSurfaceId");

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      ...completeHash,
      status: "unreachable",
      graphStatus: "complete",
      reason: {
        kind: "destination-surface-not-found",
        code: "ROUTE_DESTINATION_SURFACE_NOT_FOUND",
        anchorEntityId: "goal",
        positionMetersXYZ: [9, 0, 0],
      },
    }).relatedTraversalSurfaceIdentities).toEqual([]);

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      ...completeHash,
      status: "unreachable",
      graphStatus: "complete",
      reason: {
        kind: "required-path-unreachable",
        code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
        relevantBlockingColliderEntityIds: [],
        blockedWaterEntityIds: [],
      },
    }).reason).not.toHaveProperty("traversalSurfaceId");

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      status: "incomplete",
      graphStatus: "unavailable",
      reason: { kind: "node-budget-exceeded", code: "ROUTE_GRAPH_BUDGET_EXCEEDED", ...budget },
    }).relatedTraversalSurfaceIdentities).toHaveLength(0);

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      status: "incomplete",
      graphStatus: "unavailable",
      reason: { kind: "edge-budget-exceeded", code: "ROUTE_GRAPH_BUDGET_EXCEEDED", ...budget },
    }).reason.kind).toBe("edge-budget-exceeded");

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      ...completeHash,
      status: "incomplete",
      graphStatus: "complete",
      reason: { kind: "search-budget-exceeded", code: "ROUTE_GRAPH_BUDGET_EXCEEDED", ...budget },
    })).toHaveProperty("traversalGraphHash", HASH_A);

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      ...completeHash,
      status: "incomplete",
      graphStatus: "complete",
      reason: {
        kind: "straight-path-capacity-exceeded",
        code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
        ...budget,
      },
    }).relatedTraversalSurfaceIdentities).toEqual([]);

    const slope = canonicalRouteConnectivityFailureV2({
      ...common,
      relatedTraversalSurfaceIdentities: [heightfield],
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "slope-threshold-exceeded",
        code: "ROUTE_SLOPE_EXCEEDED",
        ...proof,
        maximumObservedSlopeDegrees: 50,
        maximumAllowedSlopeDegrees: 35,
      },
    });
    expect(slope.relatedTraversalSurfaceIdentities).toHaveLength(1);
    expect(slope.reason).not.toHaveProperty("terrainEntityId");

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      relatedTraversalSurfaceIdentities: [heightfield],
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "step-height-threshold-exceeded",
        code: "ROUTE_STEP_HEIGHT_EXCEEDED",
        ...proof,
        maximumObservedStepHeightMeters: 0.6,
        maximumAllowedStepHeightMeters: 0.3,
      },
    }).relatedTraversalSurfaceIdentities).toHaveLength(1);

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      relatedTraversalSurfaceIdentities: [heightfield],
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "clearance-width-insufficient",
        code: "ROUTE_CLEARANCE_WIDTH_INSUFFICIENT",
        ...proof,
        relevantColliderSubshapeIds: [colliderSubshapeId],
        minimumObservedClearanceWidthMeters: 0.2,
        minimumRequiredClearanceWidthMeters: 0.9,
      },
    }).reason).not.toHaveProperty("traversalSurfaceId");

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      relatedTraversalSurfaceIdentities: [heightfield],
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "overhead-clearance-insufficient",
        code: "ROUTE_OVERHEAD_CLEARANCE_INSUFFICIENT",
        ...proof,
        relevantColliderSubshapeIds: [colliderSubshapeId],
        minimumObservedClearanceHeightMeters: 1,
        minimumRequiredClearanceHeightMeters: 2,
      },
    }).relatedTraversalSurfaceIdentities).toHaveLength(1);

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      relatedTraversalSurfaceIdentities: [heightfield],
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "surface-gap-exceeded",
        code: "ROUTE_SURFACE_GAP_EXCEEDED",
        ...proof,
        maximumObservedSurfaceGapMeters: 0.4,
        maximumAllowedSurfaceGapMeters: 0,
      },
    }).reason).not.toHaveProperty("terrainEntityId");

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      status: "incomplete",
      graphStatus: "unavailable",
      reason: {
        kind: "traversal-surface-count-budget-exceeded",
        code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
        ...budget,
      },
    }).relatedTraversalSurfaceIdentities).toHaveLength(0);

    expect(canonicalRouteConnectivityFailureV2({
      ...common,
      status: "incomplete",
      graphStatus: "unavailable",
      reason: {
        kind: "traversal-surface-triangle-pair-test-budget-exceeded",
        code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
        ...budget,
      },
    }).relatedTraversalSurfaceIdentities).toHaveLength(0);

    expect(() => canonicalRouteConnectivityFailureV2({
      ...common,
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "slope-threshold-exceeded",
        code: "ROUTE_SLOPE_EXCEEDED",
        ...proof,
        maximumObservedSlopeDegrees: 50,
        maximumAllowedSlopeDegrees: 35,
      },
    })).toThrow("ROUTE_CONNECTIVITY_FAILURE_INVALID");

    expect(() => canonicalRouteConnectivityFailureV2({
      ...common,
      relatedTraversalSurfaceIdentities: [heightfield],
      status: "incomplete",
      graphStatus: "unavailable",
      reason: { kind: "node-budget-exceeded", code: "ROUTE_GRAPH_BUDGET_EXCEEDED", ...budget },
    })).toThrow("ROUTE_CONNECTIVITY_FAILURE_INVALID");

    expect(() => canonicalRouteConnectivityFailureV2({
      ...common,
      relatedTraversalSurfaceIdentities: [heightfield],
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "slope-threshold-exceeded",
        code: "ROUTE_SLOPE_EXCEEDED",
        ...proof,
        terrainEntityId: "terrain-main",
        maximumObservedSlopeDegrees: 50,
        maximumAllowedSlopeDegrees: 35,
      },
    })).toThrow("ROUTE_CONNECTIVITY_FAILURE_INVALID");

    expect(() => canonicalRouteConnectivityFailureV2({
      ...common,
      status: "unreachable",
      graphStatus: "complete",
      reason: { kind: "node-budget-exceeded", code: "ROUTE_GRAPH_BUDGET_EXCEEDED", ...budget },
    })).toThrow("ROUTE_CONNECTIVITY_FAILURE_INVALID");
  });
});
