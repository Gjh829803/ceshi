import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  createRouteBuildInputReceiptV2,
  hashRouteBuildInputV2,
  hashRouteColliderArtifactV2,
  hashRouteGeometryArtifactV2,
  hashRouteSurfaceArtifactV2,
  hashRouteTerrainArtifactV2,
  type RouteBuildInputReceiptV2,
  type RouteBuildInputV2,
} from "@whitebox-world/traversal";
import { Detour, Raw } from "recast-navigation";
import { describe, expect, it } from "vitest";

import {
  evaluateRequiredRouteV2,
  genericUnreachableReasonForBuildInputV2,
  RouteConnectivityOperationAbortedErrorV2,
} from "./evaluate-route.js";
import {
  createMultiSurfaceRouteBuildInputReceiptV2,
  createRecastTestEnvelopeV1,
  createRecastTestLockReceiptV1,
} from "./test-fixture.test-support.js";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const HASH_C =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function boundedReceipt(
  terrainPositionsMetersXYZ: readonly number[],
  terrainTriangleIndices: readonly number[],
  maximumX: number,
  startX: number,
  destinationX: number,
): RouteBuildInputReceiptV2 {
  const resourceLockHash = HASH_C;
  const capabilityEnvelope = createRecastTestEnvelopeV1({ resourceLockHash });
  const draft = {
    kind: "route-build-input",
    schemaVersion: 2,
    authoringSpecHash: HASH_A,
    layoutSolveReportHash: HASH_B,
    resourceLockHash,
    connectivityRequirement: {
      constraintId: "constraint-route",
      traversingEntityId: "player",
      startAnchorEntityId: "anchor-start",
      destinationAnchorEntityId: "anchor-destination",
      routeId: "route-main",
    },
    startAnchor: {
      entityId: "anchor-start",
      positionMetersXYZ: [startX, 0, 2],
    },
    destinationAnchor: {
      entityId: "anchor-destination",
      positionMetersXYZ: [destinationX, 0, 2],
    },
    hardRibbon: {
      routeId: "route-main",
      pointsMetersXZ: [[0, 2], [maximumX, 2]],
      widthMeters: 4,
      locomotionProfileRef: capabilityEnvelope.locomotionProfileRef,
    },
    traversalSurfaces: [{
      traversalSurfaceId: "surface-ground",
      surfaceEntityId: "terrain-ground",
      colliderSubshapeId: "collider-terrain",
      resourceRef: "worldkit://terrain/ground@1",
      resolvedVersion: "1",
      resourceHash: HASH_A,
    }],
    capabilityEnvelope,
    terrainSource: {
      kind: "bounded",
      terrainEntityId: "terrain-ground",
      triangleSoup: {
        positionsMetersXYZ: terrainPositionsMetersXYZ,
        triangleIndices: terrainTriangleIndices,
      },
      minimumMetersXZ: [0, 0],
      maximumMetersXZ: [maximumX, 4],
    },
    staticColliders: [],
    blockedTraversalAreaExclusions: [],
    blockedWaterExclusions: [],
  };
  const terrainArtifactHash = hashRouteTerrainArtifactV2(draft.terrainSource);
  const colliderArtifactHash = hashRouteColliderArtifactV2(draft.staticColliders);
  const input = deepFreeze({
    ...draft,
    terrainArtifactHash,
    colliderArtifactHash,
    geometryArtifactHash: hashRouteGeometryArtifactV2({
      terrainArtifactHash,
      colliderArtifactHash,
    }),
    surfaceArtifactHash: hashRouteSurfaceArtifactV2(draft.traversalSurfaces),
  } as unknown as RouteBuildInputV2);
  return createRouteBuildInputReceiptV2({
    input,
    traversalLockReceipt: createRecastTestLockReceiptV1({ resourceLockHash }),
  });
}

function flatReceipt(): RouteBuildInputReceiptV2 {
  return boundedReceipt(
    [
      0, 0, 0,
      0, 0, 4,
      8, 0, 0,
      8, 0, 4,
    ],
    [0, 1, 2, 2, 1, 3],
    8,
    1,
    7,
  );
}

function disconnectedReceipt(): RouteBuildInputReceiptV2 {
  return boundedReceipt(
    [
      0, 0, 0,
      0, 0, 4,
      3, 0, 0,
      3, 0, 4,
      5, 0, 0,
      5, 0, 4,
      8, 0, 0,
      8, 0, 4,
    ],
    [
      0, 1, 2,
      2, 1, 3,
      4, 5, 6,
      6, 5, 7,
    ],
    8,
    1,
    7,
  );
}

function emptyReceipt(): RouteBuildInputReceiptV2 {
  const bounded = flatReceipt();
  const terrainSource = {
    kind: "empty" as const,
    terrainEntityId: "terrain-ground",
  };
  const terrainArtifactHash = hashRouteTerrainArtifactV2(terrainSource);
  const colliderArtifactHash = hashRouteColliderArtifactV2(
    bounded.input.staticColliders,
  );
  const input = deepFreeze({
    ...bounded.input,
    terrainSource,
    terrainArtifactHash,
    colliderArtifactHash,
    geometryArtifactHash: hashRouteGeometryArtifactV2({
      terrainArtifactHash,
      colliderArtifactHash,
    }),
  });
  return createRouteBuildInputReceiptV2({
    input,
    traversalLockReceipt: createRecastTestLockReceiptV1({ resourceLockHash: HASH_C }),
  });
}

describe("evaluateRequiredRouteV2", () => {
  it("keeps every canonical blocked Water id in generic unreachable evidence", () => {
    const baseline = flatReceipt();
    const input = deepFreeze({
      ...baseline.input,
      blockedWaterExclusions: [{
        waterEntityId: "a-water",
        boundary: { kind: "circle" as const, centerMetersXZ: [2, 2] as const, radiusMeters: 1 },
        waterLevelMeters: 0.5,
        depthMeters: 2,
      }, {
        waterEntityId: "z-water",
        boundary: { kind: "circle" as const, centerMetersXZ: [2, 2] as const, radiusMeters: 1 },
        waterLevelMeters: 0.5,
        depthMeters: 2,
      }],
    });
    const receipt = deepFreeze({
      ...baseline,
      input,
      routeBuildInputHash: hashRouteBuildInputV2(input),
    });
    expect(genericUnreachableReasonForBuildInputV2(receipt)).toMatchObject({
      kind: "required-path-unreachable",
      blockedWaterEntityIds: ["a-water", "z-water"],
    });
  });

  it("builds one real Recast Graph and returns a canonical complete path", async () => {
    const receipt = flatReceipt();
    const result = await evaluateRequiredRouteV2({
      buildInputReceipt: receipt,
    });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    expect(Object.keys(result.traversalGraph.traversalNodesById).length).toBeGreaterThan(0);
    expect(result.routePathReceipt.orderedTraversalNodeIds.length).toBeGreaterThan(0);
    expect(result.routePathReceipt.orderedPathPositionsMetersXYZ.at(0)).toEqual([1, 0.1, 2]);
    expect(result.routePathReceipt.orderedPathPositionsMetersXYZ.at(-1)).toEqual([7, 0.1, 2]);
    expect(result.routePathReceipt.routePathDistanceMetersXZ).toBe(6);
    expect(result.routePathReceipt).toMatchObject({
      authoringSpecHash: receipt.input.authoringSpecHash,
      layoutSolveReportHash: receipt.input.layoutSolveReportHash,
      resourceLockHash: receipt.input.resourceLockHash,
    });
    expect(result.routePathReceipt.orderedTraversalSurfaceIdentities).toHaveLength(
      result.routePathReceipt.orderedTraversalNodeIds.length,
    );
    expect(JSON.stringify(result)).not.toMatch(/providerPolygonRef|recast|navMesh/i);
  });

  it("publishes a source-derived gap reason for a uniquely disconnected terrain cut", async () => {
    const result = await evaluateRequiredRouteV2({
      buildInputReceipt: disconnectedReceipt(),
    });
    expect(result.status).toBe("unreachable");
    if (result.status !== "unreachable") return;
    expect(result.graphStatus).toBe("complete");
    expect(result.connectivityFailure.reason).toMatchObject({
      kind: "surface-gap-exceeded",
      code: "ROUTE_SURFACE_GAP_EXCEEDED",
      proofKind: "unique-single-reason-cut",
      maximumObservedSurfaceGapMeters: 2,
      maximumAllowedSurfaceGapMeters: 0,
    });
  });

  it("skips provider allocation for an empty retained source", async () => {
    const result = await evaluateRequiredRouteV2({
      buildInputReceipt: emptyReceipt(),
    });
    expect(result.status).toBe("unreachable");
    if (result.status !== "unreachable") return;
    expect(result.graphStatus).toBe("unavailable");
    expect(result.connectivityFailure.reason.kind).toBe("empty-heightfield-source");
  });

  it("does not admit empty-heightfield-source when empty terrain retains static colliders", async () => {
    const receipt = createMultiSurfaceRouteBuildInputReceiptV2({
      emptyTerrain: true,
    });
    const result = await evaluateRequiredRouteV2({
      buildInputReceipt: receipt,
    });
    if (result.status === "complete") {
      expect(result.status).toBe("complete");
      return;
    }
    expect(result.connectivityFailure.reason.kind).not.toBe("empty-heightfield-source");
  });

  it("projects a provider start miss into the canonical endpoint failure", async () => {
    await evaluateRequiredRouteV2({ buildInputReceipt: flatReceipt() });
    if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
    const queryPrototype = Raw.Module.NavMeshQuery.prototype;
    const originalClosestPointOnPoly = queryPrototype.closestPointOnPoly;
    queryPrototype.closestPointOnPoly = function closestWithForcedStartMiss(...args) {
      return args[1][0]! < 4
        ? Detour.DT_FAILURE
        : originalClosestPointOnPoly.call(this, ...args);
    };
    try {
      const result = await evaluateRequiredRouteV2({
        buildInputReceipt: flatReceipt(),
      });
      expect(result.status).toBe("unreachable");
      if (result.status !== "unreachable") return;
      expect(result.connectivityFailure.reason).toMatchObject({
        kind: "start-surface-not-found",
        code: "ROUTE_START_SURFACE_NOT_FOUND",
        anchorEntityId: "anchor-start",
      });
    } finally {
      queryPrototype.closestPointOnPoly = originalClosestPointOnPoly;
    }
  });

  it("rejects a destination provider Ref filtered out of the canonical Graph", async () => {
    await evaluateRequiredRouteV2({ buildInputReceipt: flatReceipt() });
    if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
    const queryPrototype = Raw.Module.NavMeshQuery.prototype;
    const originalClosestPointOnPoly = queryPrototype.closestPointOnPoly;
    queryPrototype.closestPointOnPoly = function closestWithFilteredDestination(...args) {
      return args[1][0]! > 4
        ? Detour.DT_FAILURE
        : originalClosestPointOnPoly.call(this, ...args);
    };
    try {
      const result = await evaluateRequiredRouteV2({
        buildInputReceipt: flatReceipt(),
      });
      expect(result.status).toBe("unreachable");
      if (result.status !== "unreachable") return;
      expect(result.connectivityFailure.reason).toMatchObject({
        kind: "destination-surface-not-found",
        code: "ROUTE_DESTINATION_SURFACE_NOT_FOUND",
        anchorEntityId: "anchor-destination",
      });
    } finally {
      queryPrototype.closestPointOnPoly = originalClosestPointOnPoly;
    }
  });

  it("rejects a pre-aborted operation before provider work", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(evaluateRequiredRouteV2({
      buildInputReceipt: flatReceipt(),
      abortSignal: controller.signal,
    })).rejects.toBeInstanceOf(RouteConnectivityOperationAbortedErrorV2);
  });

  it("is hash-identical across repeated real provider operations", async () => {
    const receipt = flatReceipt();
    const first = await evaluateRequiredRouteV2({ buildInputReceipt: receipt });
    const second = await evaluateRequiredRouteV2({ buildInputReceipt: receipt });
    expect(second).toEqual(first);
  });

  it("preserves an undefined provider throw after total operation cleanup", async () => {
    await evaluateRequiredRouteV2({ buildInputReceipt: flatReceipt() });
    if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
    const queryPrototype = Raw.Module.NavMeshQuery.prototype;
    const originalClosestPointOnPoly = queryPrototype.closestPointOnPoly;
    queryPrototype.closestPointOnPoly = () => {
      throw undefined;
    };
    let didThrow = false;
    let caught: unknown = "not-thrown";
    try {
      await evaluateRequiredRouteV2({ buildInputReceipt: flatReceipt() });
    } catch (error) {
      didThrow = true;
      caught = error;
    } finally {
      queryPrototype.closestPointOnPoly = originalClosestPointOnPoly;
    }
    expect(didThrow).toBe(true);
    expect(caught).toBeUndefined();
  });
});
