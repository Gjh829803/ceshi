import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  assertTraversalGraphBuildBudgetV1,
  hashHeightfieldRouteBuildInputV1,
  type HeightfieldRouteBuildInputReceiptV1,
  type HeightfieldRouteBuildInputV1,
} from "@whitebox-world/traversal";
import { Raw } from "recast-navigation";
import { describe, expect, it } from "vitest";

import {
  evaluateRequiredHeightfieldRouteV1,
  RouteConnectivityOperationAbortedErrorV1,
} from "./evaluate-route.js";
import { createRecastTestEnvelopeV1 } from "./test-fixture.test-support.js";

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
): HeightfieldRouteBuildInputReceiptV1 {
  const resourceLockHash = HASH_C;
  const capabilityEnvelope = createRecastTestEnvelopeV1({ resourceLockHash });
  const input = deepFreeze({
    kind: "heightfield-route-build-input",
    schemaVersion: 1,
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
    traversalSurface: {
      traversalSurfaceId: "surface-ground",
      surfaceEntityId: "terrain-ground",
      colliderSubshapeId: "collider-terrain",
      resourceRef: "worldkit://terrain/ground@1",
      resolvedVersion: "1",
      resourceHash: HASH_A,
    },
    capabilityEnvelope,
    terrainSource: {
      kind: "bounded",
      terrainEntityId: "terrain-ground",
      terrainArtifactHash: HASH_B,
      triangleSoup: {
        positionsMetersXYZ: terrainPositionsMetersXYZ,
        triangleIndices: terrainTriangleIndices,
      },
      minimumMetersXZ: [0, 0],
      maximumMetersXZ: [maximumX, 4],
    },
    blockingColliders: [],
    colliderArtifactHash: sha256CanonicalJson([]) as `sha256:${string}`,
    blockedWaterExclusions: [],
  } satisfies HeightfieldRouteBuildInputV1);
  const estimate = assertTraversalGraphBuildBudgetV1({
    minimumMetersXZ: [0, 0],
    maximumMetersXZ: [maximumX, 4],
    tileSizeCells: capabilityEnvelope.tileSizeCells,
    voxelCellSizeMeters: capabilityEnvelope.voxelCellSizeMeters,
    maximumTiles: capabilityEnvelope.maximumTiles,
  });
  return deepFreeze({
    input,
    routeBuildInputHash: hashHeightfieldRouteBuildInputV1(input),
    budgetEvidence: {
      kind: "heightfield-tile-estimate",
      ...estimate,
      maximumTiles: capabilityEnvelope.maximumTiles,
      minimumMetersXZ: [0, 0],
      maximumMetersXZ: [maximumX, 4],
    },
  });
}

function flatReceipt(): HeightfieldRouteBuildInputReceiptV1 {
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

function disconnectedReceipt(): HeightfieldRouteBuildInputReceiptV1 {
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

function emptyReceipt(): HeightfieldRouteBuildInputReceiptV1 {
  const bounded = flatReceipt();
  const input = deepFreeze({
    ...bounded.input,
    terrainSource: {
      kind: "empty" as const,
      terrainEntityId: "terrain-ground",
      terrainArtifactHash: HASH_B,
    },
  });
  return deepFreeze({
    input,
    routeBuildInputHash: hashHeightfieldRouteBuildInputV1(input),
    budgetEvidence: { kind: "not-required-empty-source" as const },
  });
}

describe("evaluateRequiredHeightfieldRouteV1", () => {
  it("builds one real Recast Graph and returns a canonical complete path", async () => {
    const result = await evaluateRequiredHeightfieldRouteV1({
      buildInputReceipt: flatReceipt(),
    });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    expect(Object.keys(result.traversalGraph.traversalNodesById).length).toBeGreaterThan(0);
    expect(result.routePathReceipt.orderedTraversalNodeIds.length).toBeGreaterThan(0);
    expect(result.routePathReceipt.orderedPathPositionsMetersXYZ.at(0)).toEqual([1, 0.1, 2]);
    expect(result.routePathReceipt.orderedPathPositionsMetersXYZ.at(-1)).toEqual([7, 0.1, 2]);
    expect(JSON.stringify(result)).not.toMatch(/providerPolygonRef|recast|navMesh/i);
  });

  it("publishes a source-derived gap reason for a uniquely disconnected terrain cut", async () => {
    const result = await evaluateRequiredHeightfieldRouteV1({
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
    const result = await evaluateRequiredHeightfieldRouteV1({
      buildInputReceipt: emptyReceipt(),
    });
    expect(result.status).toBe("unreachable");
    if (result.status !== "unreachable") return;
    expect(result.graphStatus).toBe("unavailable");
    expect(result.connectivityFailure.reason.kind).toBe("empty-heightfield-source");
  });

  it("projects a provider start miss into the canonical endpoint failure", async () => {
    await evaluateRequiredHeightfieldRouteV1({ buildInputReceipt: flatReceipt() });
    if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
    const queryPrototype = Raw.Module.NavMeshQuery.prototype;
    const originalFindNearestPoly = queryPrototype.findNearestPoly;
    let queryCount = 0;
    queryPrototype.findNearestPoly = function findNearestWithForcedStartMiss(...args) {
      const status = originalFindNearestPoly.call(this, ...args);
      queryCount += 1;
      if (queryCount === 1) args[3].value = 0;
      return status;
    };
    try {
      const result = await evaluateRequiredHeightfieldRouteV1({
        buildInputReceipt: flatReceipt(),
      });
      expect(result.status).toBe("unreachable");
      if (result.status !== "unreachable") return;
      expect(result.connectivityFailure.reason).toMatchObject({
        kind: "start-surface-not-found",
        code: "ROUTE_START_SURFACE_NOT_FOUND",
        anchorEntityId: "anchor-start",
        traversalSurfaceId: "surface-ground",
      });
    } finally {
      queryPrototype.findNearestPoly = originalFindNearestPoly;
    }
  });

  it("rejects a destination provider Ref filtered out of the canonical Graph", async () => {
    await evaluateRequiredHeightfieldRouteV1({ buildInputReceipt: flatReceipt() });
    if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
    const queryPrototype = Raw.Module.NavMeshQuery.prototype;
    const originalFindNearestPoly = queryPrototype.findNearestPoly;
    let queryCount = 0;
    queryPrototype.findNearestPoly = function findNearestWithFilteredDestination(...args) {
      const status = originalFindNearestPoly.call(this, ...args);
      queryCount += 1;
      if (queryCount === 2) args[3].value = 0xffff_ffff;
      return status;
    };
    try {
      const result = await evaluateRequiredHeightfieldRouteV1({
        buildInputReceipt: flatReceipt(),
      });
      expect(result.status).toBe("unreachable");
      if (result.status !== "unreachable") return;
      expect(result.connectivityFailure.reason).toMatchObject({
        kind: "destination-surface-not-found",
        code: "ROUTE_DESTINATION_SURFACE_NOT_FOUND",
        anchorEntityId: "anchor-destination",
        traversalSurfaceId: "surface-ground",
      });
    } finally {
      queryPrototype.findNearestPoly = originalFindNearestPoly;
    }
  });

  it("rejects a pre-aborted operation before provider work", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(evaluateRequiredHeightfieldRouteV1({
      buildInputReceipt: flatReceipt(),
      abortSignal: controller.signal,
    })).rejects.toBeInstanceOf(RouteConnectivityOperationAbortedErrorV1);
  });

  it("is hash-identical across repeated real provider operations", async () => {
    const receipt = flatReceipt();
    const first = await evaluateRequiredHeightfieldRouteV1({ buildInputReceipt: receipt });
    const second = await evaluateRequiredHeightfieldRouteV1({ buildInputReceipt: receipt });
    expect(second).toEqual(first);
  });

  it("preserves an undefined provider throw after total operation cleanup", async () => {
    await evaluateRequiredHeightfieldRouteV1({ buildInputReceipt: flatReceipt() });
    if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
    const queryPrototype = Raw.Module.NavMeshQuery.prototype;
    const originalFindNearestPoly = queryPrototype.findNearestPoly;
    queryPrototype.findNearestPoly = () => {
      throw undefined;
    };
    let didThrow = false;
    let caught: unknown = "not-thrown";
    try {
      await evaluateRequiredHeightfieldRouteV1({ buildInputReceipt: flatReceipt() });
    } catch (error) {
      didThrow = true;
      caught = error;
    } finally {
      queryPrototype.findNearestPoly = originalFindNearestPoly;
    }
    expect(didThrow).toBe(true);
    expect(caught).toBeUndefined();
  });
});
