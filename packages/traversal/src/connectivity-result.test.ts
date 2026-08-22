import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  assertHeightfieldRouteConnectivityResultForBuildInputV1,
  canonicalHeightfieldRouteConnectivityResultV1,
  canonicalRouteConnectivityFailureV1,
  hashRouteConnectivityFailureV1,
  type HeightfieldRouteConnectivityResultV1,
  type RouteConnectivityFailureV1,
} from "./connectivity-result.js";
import {
  assertHeightfieldRouteBuildInputReceiptV1,
  hashHeightfieldRouteBuildInputV1,
  type HeightfieldRouteBuildInputReceiptV1,
} from "./build-input.js";
import {
  canonicalTraversalGraphV1,
  hashTraversalGraphV1,
  type TraversalGraphV1,
} from "./graph-contract.js";
import {
  canonicalRoutePathReceiptV1,
  hashRoutePathReceiptV1,
  type RoutePathReceiptV1,
} from "./path-receipt.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const EMPTY_COLLIDER_HASH =
  "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" as const;
const PROFILE_HASH =
  "sha256:9720639dac7de3da1d140c7afd1ea7df4258cef202468e39fa222158caaad231" as const;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function buildInputReceipt(): HeightfieldRouteBuildInputReceiptV1 {
  const input = deepFreeze({
    kind: "heightfield-route-build-input",
    schemaVersion: 1,
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_A,
    resourceLockHash: HASH_A,
    connectivityRequirement: {
      constraintId: "player-to-goal",
      traversingEntityId: "player",
      startAnchorEntityId: "spawn",
      destinationAnchorEntityId: "goal",
      routeId: "main-route",
    },
    startAnchor: { entityId: "spawn", positionMetersXYZ: [0, 0, 0] },
    destinationAnchor: { entityId: "goal", positionMetersXYZ: [1, 0, 0] },
    hardRibbon: {
      routeId: "main-route",
      pointsMetersXZ: [[0, 0], [1, 0]],
      widthMeters: 2,
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    },
    traversalSurface: {
      traversalSurfaceId: "surface-main",
      surfaceEntityId: "terrain-main",
      colliderSubshapeId: "terrain-heightfield",
      resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
      resolvedVersion: "1",
      resourceHash: HASH_A,
    },
    capabilityEnvelope: {
      kind: "traversal-capability-envelope",
      schemaVersion: 1,
      traversalMode: "ground",
      subjectEntityId: "player",
      resourceLockHash: HASH_A,
      colliderProfileRef: "worldkit://collider-profile/humanoid@1",
      colliderProfileHash: HASH_A,
      physicsBodyProfileRef: "worldkit://physics-body-profile/humanoid@1",
      physicsBodyProfileHash: HASH_A,
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      locomotionProfileHash: HASH_A,
      locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
      locomotionCapabilityHash: HASH_A,
      runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
      runtimeBackendResolvedVersion: "1",
      runtimeBackendHash: HASH_A,
      runtimeAdapterRef: "worldkit://runtime-adapter/character-controller@1",
      runtimeAdapterResolvedVersion: "1",
      runtimeAdapterHash: HASH_A,
      capsuleRadiusMeters: 0.35,
      capsuleHeightMeters: 1.8,
      colliderCenterOffsetMetersXYZ: [0, 0.9, 0],
      maxSlopeDegrees: 42,
      maxStepHeightMeters: 0.3,
      resolvedTraversalLockHash: HASH_B,
      graphBuilderProfileRef:
        "worldkit://traversal-graph-builder-profile/outdoor-humanoid.heightfield-r1@1",
      graphBuilderResolvedVersion: "1",
      graphBuilderProfileHash: PROFILE_HASH,
      clearanceMarginMeters: 0.05,
      voxelCellSizeMeters: 0.15,
      voxelCellHeightMeters: 0.1,
      tileSizeCells: 64,
      maximumEdgeLengthMeters: 2.4,
      maximumSimplificationErrorMeters: 0.15,
      positionQuantizationMeters: 0.001,
      slopeCostWeight: 1,
      stepCostWeight: 1,
      maximumNodes: 100_000,
      maximumEdges: 200_000,
      maximumTiles: 1_024,
      maximumSearchSteps: 100_000,
    },
    terrainSource: {
      kind: "bounded",
      terrainEntityId: "terrain-main",
      terrainArtifactHash: HASH_A,
      triangleSoup: {
        positionsMetersXYZ: [0, 0, 0, 0, 0, 1, 1, 0, 0],
        triangleIndices: [0, 1, 2],
      },
      minimumMetersXZ: [0, 0],
      maximumMetersXZ: [1, 1],
    },
    blockingColliders: [],
    colliderArtifactHash: EMPTY_COLLIDER_HASH,
    blockedWaterExclusions: [],
  } as const);
  return assertHeightfieldRouteBuildInputReceiptV1(deepFreeze({
    input,
    routeBuildInputHash: hashHeightfieldRouteBuildInputV1(input),
    budgetEvidence: {
      kind: "heightfield-tile-estimate",
      tilesX: 1,
      tilesZ: 1,
      estimatedTiles: 1,
      maximumTiles: 1_024,
      minimumMetersXZ: [0, 0],
      maximumMetersXZ: [1, 1],
    },
  }));
}

function graph(receipt: HeightfieldRouteBuildInputReceiptV1): TraversalGraphV1 {
  const { input } = receipt;
  return canonicalTraversalGraphV1({
    kind: "traversal-graph",
    schemaVersion: 1,
    authoringSpecHash: input.authoringSpecHash,
    layoutSolveReportHash: input.layoutSolveReportHash,
    resourceLockHash: input.resourceLockHash,
    terrainArtifactHash: input.terrainSource.terrainArtifactHash,
    colliderArtifactHash: input.colliderArtifactHash,
    surfaceArtifactHash: input.traversalSurface.resourceHash,
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: input.capabilityEnvelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: input.capabilityEnvelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: input.capabilityEnvelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: input.capabilityEnvelope.graphBuilderProfileHash,
    routeId: input.connectivityRequirement.routeId,
    startAnchorEntityId: input.startAnchor.entityId,
    destinationAnchorEntityId: input.destinationAnchor.entityId,
    traversalNodesById: {
      "node-a": {
        id: "node-a",
        traversalSurfaceId: input.traversalSurface.traversalSurfaceId,
        surfaceEntityId: input.traversalSurface.surfaceEntityId,
        colliderSubshapeId: input.traversalSurface.colliderSubshapeId,
        positionMetersXYZ: [0, 0, 0],
        tileId: "tile-a",
        clearanceWidthMeters: 0.9,
        clearanceHeightMeters: 2,
      },
      "node-b": {
        id: "node-b",
        traversalSurfaceId: input.traversalSurface.traversalSurfaceId,
        surfaceEntityId: input.traversalSurface.surfaceEntityId,
        colliderSubshapeId: input.traversalSurface.colliderSubshapeId,
        positionMetersXYZ: [1, 0, 0],
        tileId: "tile-a",
        clearanceWidthMeters: 0.9,
        clearanceHeightMeters: 2,
      },
    },
    traversalEdgesById: {
      "edge-a-b": {
        id: "edge-a-b",
        type: "walk",
        fromTraversalNodeId: "node-a",
        toTraversalNodeId: "node-b",
        distanceMeters: 1,
        heightDeltaMeters: 0,
        stepHeightMeters: 0,
        slopeDegrees: 0,
        minimumClearanceWidthMeters: 0.9,
        minimumClearanceHeightMeters: 2,
        routePathCost: 0.5,
      },
    },
  });
}

function pathReceipt(
  receipt: HeightfieldRouteBuildInputReceiptV1,
  traversalGraph: TraversalGraphV1,
): RoutePathReceiptV1 {
  const input = receipt.input;
  return canonicalRoutePathReceiptV1({
    kind: "route-path-receipt",
    schemaVersion: 1,
    status: "complete",
    constraintId: input.connectivityRequirement.constraintId,
    routeId: input.connectivityRequirement.routeId,
    traversingEntityId: input.connectivityRequirement.traversingEntityId,
    startAnchorEntityId: input.startAnchor.entityId,
    destinationAnchorEntityId: input.destinationAnchor.entityId,
    authoringSpecHash: traversalGraph.authoringSpecHash,
    layoutSolveReportHash: traversalGraph.layoutSolveReportHash,
    resourceLockHash: traversalGraph.resourceLockHash,
    traversalGraphHash: hashTraversalGraphV1(traversalGraph),
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: input.capabilityEnvelope.resolvedTraversalLockHash,
    traversalSurfaceIdentity: input.traversalSurface,
    graphBuilderProfileRef: input.capabilityEnvelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: input.capabilityEnvelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: input.capabilityEnvelope.graphBuilderProfileHash,
    orderedTraversalNodeIds: ["node-a", "node-b"],
    orderedTraversalEdgeIds: ["edge-a-b"],
    orderedPathPositionsMetersXYZ: [[0, 0, 0], [1, 0, 0]],
    routePathDistanceMeters: 1,
    routePathDistanceMetersXZ: 1,
    routePathCost: 0.5,
    maximumObservedSlopeDegrees: 0,
    maximumObservedStepHeightMeters: 0,
    minimumObservedClearanceWidthMeters: 0.9,
    minimumObservedClearanceHeightMeters: 2,
    maximumObservedSurfaceGapMeters: 0,
  });
}

function failureCommon(receipt: HeightfieldRouteBuildInputReceiptV1) {
  const input = receipt.input;
  return {
    kind: "route-connectivity-failure" as const,
    schemaVersion: 1 as const,
    constraintId: input.connectivityRequirement.constraintId,
    routeId: input.connectivityRequirement.routeId,
    traversingEntityId: input.connectivityRequirement.traversingEntityId,
    startAnchorEntityId: input.startAnchor.entityId,
    destinationAnchorEntityId: input.destinationAnchor.entityId,
    startAnchorPositionMetersXYZ: [0, 0, 0] as const,
    destinationAnchorPositionMetersXYZ: [1, 0, 0] as const,
    traversalSurfaceId: input.traversalSurface.traversalSurfaceId,
    surfaceEntityId: input.traversalSurface.surfaceEntityId,
    colliderSubshapeId: input.traversalSurface.colliderSubshapeId,
    routeBuildInputHash: receipt.routeBuildInputHash,
    resolvedTraversalLockHash: input.capabilityEnvelope.resolvedTraversalLockHash,
    graphBuilderProfileRef: input.capabilityEnvelope.graphBuilderProfileRef,
    graphBuilderResolvedVersion: input.capabilityEnvelope.graphBuilderResolvedVersion,
    graphBuilderProfileHash: input.capabilityEnvelope.graphBuilderProfileHash,
  };
}

describe("HeightfieldRouteConnectivityResultV1", () => {
  it("validates a success with external Graph and Path hashes plus exact adjacency metrics", () => {
    const receipt = buildInputReceipt();
    const traversalGraph = graph(receipt);
    const routePathReceipt = pathReceipt(receipt, traversalGraph);
    const result = {
      kind: "heightfield-route-connectivity-result",
      schemaVersion: 1,
      status: "complete",
      traversalGraph,
      traversalGraphHash: hashTraversalGraphV1(traversalGraph),
      routePathReceipt,
      routePathReceiptHash: hashRoutePathReceiptV1(routePathReceipt),
    } as const;

    const canonical = canonicalHeightfieldRouteConnectivityResultV1(result);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(assertHeightfieldRouteConnectivityResultForBuildInputV1(result, receipt))
      .toEqual(canonical);
    expect(() => canonicalHeightfieldRouteConnectivityResultV1({
      ...result,
      traversalGraphHash: HASH_A,
    })).toThrow("HEIGHTFIELD_ROUTE_CONNECTIVITY_RESULT_INVALID");
    expect(() => canonicalHeightfieldRouteConnectivityResultV1({
      ...result,
      routePathReceipt: { ...routePathReceipt, routePathCost: 99 },
      routePathReceiptHash: hashRoutePathReceiptV1({
        ...routePathReceipt,
        routePathCost: 99,
      }),
    })).toThrow("HEIGHTFIELD_ROUTE_CONNECTIVITY_RESULT_INVALID");
    expect(() => canonicalHeightfieldRouteConnectivityResultV1({
      ...result,
      routePathReceipt: {
        ...routePathReceipt,
        authoringSpecHash: HASH_B,
      },
      routePathReceiptHash: hashRoutePathReceiptV1({
        ...routePathReceipt,
        authoringSpecHash: HASH_B,
      }),
    })).toThrow("HEIGHTFIELD_ROUTE_CONNECTIVITY_RESULT_INVALID");
    expect(() => canonicalHeightfieldRouteConnectivityResultV1({
      ...result,
      routePathReceipt: {
        ...routePathReceipt,
        traversalSurfaceIdentity: {
          ...routePathReceipt.traversalSurfaceIdentity,
          traversalSurfaceId: "surface-other",
        },
      },
      routePathReceiptHash: hashRoutePathReceiptV1({
        ...routePathReceipt,
        traversalSurfaceIdentity: {
          ...routePathReceipt.traversalSurfaceIdentity,
          traversalSurfaceId: "surface-other",
        },
      }),
    })).toThrow("HEIGHTFIELD_ROUTE_CONNECTIVITY_RESULT_INVALID");

    const slopedPath = canonicalRoutePathReceiptV1({
      ...routePathReceipt,
      orderedPathPositionsMetersXYZ: [[0, 0, 0], [3, 4, 0]],
      routePathDistanceMeters: 5,
      routePathDistanceMetersXZ: 3,
      maximumObservedSlopeDegrees: 53.130103,
    });
    const slopedResult = canonicalHeightfieldRouteConnectivityResultV1({
      ...result,
      routePathReceipt: slopedPath,
      routePathReceiptHash: hashRoutePathReceiptV1(slopedPath),
    });
    expect(slopedResult.status).toBe("complete");
    if (slopedResult.status !== "complete") return;
    expect(slopedResult.routePathReceipt).toMatchObject({
      routePathDistanceMeters: 5,
      routePathDistanceMetersXZ: 3,
    });
  });

  it("accepts exactly four correlated failure variants and rejects cross-pairing", () => {
    const receipt = buildInputReceipt();
    const traversalGraph = graph(receipt);
    const traversalGraphHash = hashTraversalGraphV1(traversalGraph);
    const common = failureCommon(receipt);
    const failures: readonly RouteConnectivityFailureV1[] = [
      {
        ...common,
        status: "unreachable",
        graphStatus: "unavailable",
        reason: {
          kind: "empty-heightfield-source",
          code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
          terrainEntityId: "terrain-main",
        },
      },
      {
        ...common,
        status: "incomplete",
        graphStatus: "unavailable",
        reason: {
          kind: "node-budget-exceeded",
          code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
          maximumAllowedCount: 10,
          minimumRequiredCount: 11,
        },
      },
      {
        ...common,
        status: "unreachable",
        graphStatus: "complete",
        traversalGraphHash,
        reason: {
          kind: "start-surface-not-found",
          code: "ROUTE_START_SURFACE_NOT_FOUND",
          anchorEntityId: "spawn",
          positionMetersXYZ: [0, 0, 0],
          traversalSurfaceId: "surface-main",
        },
      },
      {
        ...common,
        status: "incomplete",
        graphStatus: "complete",
        traversalGraphHash,
        reason: {
          kind: "search-budget-exceeded",
          code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
          maximumAllowedCount: 10,
          minimumRequiredCount: 11,
        },
      },
    ];

    for (const failure of failures) {
      const canonical = canonicalRouteConnectivityFailureV1(failure);
      expect(hashRouteConnectivityFailureV1(failure)).toBe(
        sha256CanonicalJson(canonical),
      );
      const outer = {
        kind: "heightfield-route-connectivity-result",
        schemaVersion: 1,
        status: failure.status,
        graphStatus: failure.graphStatus,
        ...(failure.graphStatus === "complete"
          ? { traversalGraph, traversalGraphHash }
          : {}),
        connectivityFailure: failure,
        connectivityFailureHash: hashRouteConnectivityFailureV1(failure),
      } as HeightfieldRouteConnectivityResultV1;
      expect(assertHeightfieldRouteConnectivityResultForBuildInputV1(outer, receipt))
        .toMatchObject({ status: failure.status, graphStatus: failure.graphStatus });
    }

    const unavailable = failures[0]!;
    expect(() => canonicalRouteConnectivityFailureV1({
      ...unavailable,
      status: "incomplete",
    })).toThrow("ROUTE_CONNECTIVITY_FAILURE_INVALID");
  });

  it("requires common finite Anchor/Surface provenance and a deterministic threshold witness", () => {
    const receipt = buildInputReceipt();
    const common = failureCommon(receipt);
    const threshold = {
      ...common,
      status: "unreachable",
      graphStatus: "unavailable",
      reason: {
        kind: "slope-threshold-exceeded",
        code: "ROUTE_SLOPE_EXCEEDED",
        proofKind: "unique-single-reason-cut",
        proofCandidateIds: ["candidate-a"],
        failurePositionMetersXYZ: [0.5, 0.25, 0],
        terrainEntityId: "terrain-main",
        maximumObservedSlopeDegrees: 45,
        maximumAllowedSlopeDegrees: 42,
      },
    } as const;

    expect(canonicalRouteConnectivityFailureV1(threshold).reason).toMatchObject({
      code: "ROUTE_SLOPE_EXCEEDED",
      failurePositionMetersXYZ: [0.5, 0.25, 0],
    });
    expect(() => canonicalRouteConnectivityFailureV1({
      ...threshold,
      destinationAnchorPositionMetersXYZ: [Number.NaN, 0, 0],
    })).toThrow("ROUTE_CONNECTIVITY_FAILURE_INVALID");
    const { failurePositionMetersXYZ: _failurePosition, ...missingWitness } =
      threshold.reason;
    expect(() => canonicalRouteConnectivityFailureV1({
      ...threshold,
      reason: missingWitness,
    })).toThrow("ROUTE_CONNECTIVITY_FAILURE_INVALID");
  });

  it("contextually rejects a self-consistent Result copied from another Build Input", () => {
    const receipt = buildInputReceipt();
    const traversalGraph = graph(receipt);
    const failure = canonicalRouteConnectivityFailureV1({
      ...failureCommon(receipt),
      status: "unreachable",
      graphStatus: "complete",
      traversalGraphHash: hashTraversalGraphV1(traversalGraph),
      reason: {
        kind: "required-path-unreachable",
        code: "ROUTE_REQUIRED_PATH_UNREACHABLE",
        traversalSurfaceId: "surface-main",
        relevantBlockingColliderEntityIds: [],
        blockedWaterEntityIds: [],
      },
    });
    const result = {
      kind: "heightfield-route-connectivity-result",
      schemaVersion: 1,
      status: "unreachable",
      graphStatus: "complete",
      traversalGraph,
      traversalGraphHash: hashTraversalGraphV1(traversalGraph),
      connectivityFailure: failure,
      connectivityFailureHash: hashRouteConnectivityFailureV1(failure),
    } as const;
    const otherReceipt = deepFreeze({
      ...receipt,
      routeBuildInputHash: HASH_A,
    });

    expect(() => assertHeightfieldRouteConnectivityResultForBuildInputV1(
      result,
      otherReceipt,
    )).toThrow("HEIGHTFIELD_ROUTE_BUILD_INPUT_RECEIPT_INVALID");
  });
});
