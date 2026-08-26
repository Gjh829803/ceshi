import { describe, expect, it, vi } from "vitest";

import {
  assertTraversalSurfaceCountBudgetV1,
  assertTraversalGraphBuildBudgetV1,
  BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
  createTraversalCapabilityEnvelopeV1,
  estimateHeightfieldTileCountV1,
  estimateRouteBuildWindowTileCountV1,
  quantizeTraversalMetersToMicrometersV1,
  resolveTraversalGraphBuilderProfileV2,
  resolveTraversalLockV1,
  TraversalGraphBuildBudgetExceededErrorV1,
} from "./index.js";
import type { ResolvedTraversalLockV1 } from "./index.js";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

function surfaceCountEnvelope() {
  const lock: ResolvedTraversalLockV1 = {
    kind: "resolved-traversal-lock",
    schemaVersion: 1,
    subjectEntityId: "player",
    resourceLockHash: HASH_A,
    subjectDefinitionRef: "worldkit://subject-definition/humanoid.third-person@1",
    subjectDefinitionHash: HASH_A,
    colliderProfileRef: "worldkit://collider-profile/humanoid.medium-capsule@1",
    colliderProfileHash: HASH_A,
    physicsBodyProfileRef: "worldkit://physics-body-profile/character.medium@1",
    physicsBodyProfileHash: HASH_A,
    locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    locomotionProfileHash: HASH_A,
    locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
    locomotionCapabilityHash: HASH_A,
    controlFeelProfileRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
    controlFeelProfileHash: HASH_A,
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    controlProfileHash: HASH_A,
    motionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
    motionProfileHash: HASH_A,
    motionKernelRef: "worldkit://motion-kernel/free-ground@1",
    motionKernelHash: HASH_A,
    mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
    mediumProfileHash: HASH_A,
    runtimeBackendRef: "worldkit://runtime-backend/babylon-havok@1",
    runtimeBackendResolvedVersion: "9.21.2+1.3.14",
    runtimeBackendHash: HASH_A,
    runtimeAdapterRef: "worldkit://runtime-adapter/babylon.character-controller@1",
    runtimeAdapterResolvedVersion: "1",
    runtimeAdapterHash: HASH_B,
    capsuleRadiusMeters: 0.32,
    capsuleHeightMeters: 1.92,
    colliderCenterOffsetMetersXYZ: [0, 0.96, 0],
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3,
  };
  return createTraversalCapabilityEnvelopeV1({
    traversalLockReceipt: resolveTraversalLockV1(lock),
    graphBuilderProfile: resolveTraversalGraphBuilderProfileV2(
      BUILT_IN_HEIGHTFIELD_R1_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
    ),
  }).envelope;
}

describe("Heightfield traversal tile budget", () => {
  it("normalizes decimal meter values without exact-multiple drift", () => {
    expect(quantizeTraversalMetersToMicrometersV1(0.3)).toBe(300000);
    expect(quantizeTraversalMetersToMicrometersV1(0.299)).toBe(299000);
    expect(quantizeTraversalMetersToMicrometersV1(2.4)).toBe(2400000);
  });

  it("estimates exact and partial tiles for the one-layer R1 Heightfield", () => {
    expect(estimateHeightfieldTileCountV1({
      widthMeters: 19.2,
      depthMeters: 9.6,
      tileSizeCells: 64,
      voxelCellSizeMeters: 0.15,
    })).toEqual({ tilesX: 2, tilesZ: 1, estimatedTiles: 2 });
    expect(estimateHeightfieldTileCountV1({
      widthMeters: 19.201,
      depthMeters: 9.601,
      tileSizeCells: 64,
      voxelCellSizeMeters: 0.15,
    })).toEqual({ tilesX: 3, tilesZ: 2, estimatedTiles: 6 });
  });

  it("fails closed before a provider callback can run", () => {
    const provider = vi.fn();

    expect(() => {
      assertTraversalGraphBuildBudgetV1({
        minimumMetersXZ: [-10, -5],
        maximumMetersXZ: [9.201, 4.601],
        tileSizeCells: 64,
        voxelCellSizeMeters: 0.15,
        maximumTiles: 5,
      });
      provider();
    }).toThrow("ROUTE_GRAPH_BUDGET_EXCEEDED");
    expect(provider).not.toHaveBeenCalled();
  });

  it("carries stable caller bounds and the exact tile estimate on budget failure", () => {
    let captured: unknown;
    try {
      assertTraversalGraphBuildBudgetV1({
        minimumMetersXZ: [-10, -5],
        maximumMetersXZ: [9.201, 4.601],
        tileSizeCells: 64,
        voxelCellSizeMeters: 0.15,
        maximumTiles: 5,
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(TraversalGraphBuildBudgetExceededErrorV1);
    expect(captured).toMatchObject({
      name: "TraversalGraphBuildBudgetExceededErrorV1",
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      tilesX: 3,
      tilesZ: 2,
      estimatedTiles: 6,
      maximumTiles: 5,
      minimumMetersXZ: [-10, -5],
      maximumMetersXZ: [9.201, 4.601],
    });
    expect(Object.isFrozen((captured as TraversalGraphBuildBudgetExceededErrorV1).minimumMetersXZ)).toBe(true);
    expect(Object.isFrozen((captured as TraversalGraphBuildBudgetExceededErrorV1).maximumMetersXZ)).toBe(true);
  });

  it("derives dimensions from one authoritative bounded extent", () => {
    expect(assertTraversalGraphBuildBudgetV1({
      minimumMetersXZ: [-9.6, -4.8],
      maximumMetersXZ: [9.6, 4.8],
      tileSizeCells: 64,
      voxelCellSizeMeters: 0.15,
      maximumTiles: 2,
    })).toEqual({ tilesX: 2, tilesZ: 1, estimatedTiles: 2 });

    for (const bounds of [
      { minimumMetersXZ: [0, 0], maximumMetersXZ: [0, 1] },
      { minimumMetersXZ: [1, 0], maximumMetersXZ: [0, 1] },
      { minimumMetersXZ: [0, Number.NaN], maximumMetersXZ: [1, 1] },
    ] as const) {
      expect(() => assertTraversalGraphBuildBudgetV1({
        ...bounds,
        tileSizeCells: 64,
        voxelCellSizeMeters: 0.15,
        maximumTiles: 2,
      })).toThrow("TRAVERSAL_GRAPH_BUILD_BUDGET_INVALID");
    }
    expect(() => assertTraversalGraphBuildBudgetV1({
      minimumMetersXZ: undefined,
      maximumMetersXZ: [1, 1],
      tileSizeCells: 64,
      voxelCellSizeMeters: 0.15,
      maximumTiles: 2,
    } as never)).toThrow("TRAVERSAL_GRAPH_BUILD_BUDGET_INVALID");
  });

  it("rejects non-finite, non-positive, and overflowing estimates", () => {
    for (const input of [
      {
        widthMeters: Number.NaN,
        depthMeters: 1,
        tileSizeCells: 64,
        voxelCellSizeMeters: 0.15,
      },
      {
        widthMeters: 1,
        depthMeters: 0,
        tileSizeCells: 64,
        voxelCellSizeMeters: 0.15,
      },
      {
        widthMeters: 1,
        depthMeters: 1,
        tileSizeCells: 1.5,
        voxelCellSizeMeters: 0.15,
      },
      {
        widthMeters: Number.MAX_SAFE_INTEGER,
        depthMeters: Number.MAX_SAFE_INTEGER,
        tileSizeCells: 1,
        voxelCellSizeMeters: 0.001,
      },
    ]) {
      expect(() => estimateHeightfieldTileCountV1(input)).toThrow(
        "TRAVERSAL_GRAPH_BUILD_BUDGET_INVALID",
      );
    }
  });
});

describe("Heightfield route build-window budget", () => {
  const profile = {
    tileSizeCells: 64,
    voxelCellSizeMeters: 0.15,
    maximumTiles: 1024,
  } as const;

  it("admits a narrow 2km straight route without treating world size as a square", () => {
    expect(estimateRouteBuildWindowTileCountV1({
      pointsMetersXZ: [[-1000, 0], [1000, 0]],
      widthMeters: 4,
      terrainCellSizeMetersXZ: [2.5, 2.5],
      ...profile,
    })).toEqual({
      minimumMetersXZ: [-1004.5, -4.5],
      maximumMetersXZ: [1004.5, 4.5],
      tilesX: 210,
      tilesZ: 1,
      estimatedTiles: 210,
      maximumTiles: 1024,
    });
  });

  it("rejects one diagonal 2km AABB while admitting explicit bounded segments", () => {
    expect(() => estimateRouteBuildWindowTileCountV1({
      pointsMetersXZ: [[-1000, -1000], [1000, 1000]],
      widthMeters: 4,
      terrainCellSizeMetersXZ: [2.5, 2.5],
      ...profile,
    })).toThrow(expect.objectContaining({
      code: "ROUTE_GRAPH_BUDGET_EXCEEDED",
      tilesX: 210,
      tilesZ: 210,
      estimatedTiles: 44_100,
      maximumTiles: 1024,
    }));

    const seamPoints = Array.from({ length: 11 }, (_, index) =>
      [-1000 + index * 200, -1000 + index * 200] as const,
    );
    const segmentEstimates = seamPoints.slice(1).map((destination, index) =>
      estimateRouteBuildWindowTileCountV1({
        pointsMetersXZ: [seamPoints[index]!, destination],
        widthMeters: 4,
        terrainCellSizeMetersXZ: [2.5, 2.5],
        ...profile,
      }),
    );
    expect(segmentEstimates).toHaveLength(10);
    expect(segmentEstimates.every(({ estimatedTiles }) => estimatedTiles === 484)).toBe(true);
  });

  it("uses asymmetric terrain-cell guards and does not mutate caller points", () => {
    const pointsMetersXZ = [[0, -0], [10, 0]] as const;
    const before = structuredClone(pointsMetersXZ);
    const estimate = estimateRouteBuildWindowTileCountV1({
      pointsMetersXZ,
      widthMeters: 2,
      terrainCellSizeMetersXZ: [1, 4],
      ...profile,
    });

    expect(estimate).toEqual({
      minimumMetersXZ: [-2, -5],
      maximumMetersXZ: [12, 5],
      tilesX: 2,
      tilesZ: 2,
      estimatedTiles: 4,
      maximumTiles: 1024,
    });
    expect(pointsMetersXZ).toEqual(before);
    expect(Object.is(estimate.minimumMetersXZ[1], -0)).toBe(false);
  });

  it("fails closed for malformed, degenerate, and non-finite route windows", () => {
    for (const input of [
      {
        pointsMetersXZ: [[0, 0]],
        widthMeters: 2,
        terrainCellSizeMetersXZ: [1, 1],
      },
      {
        pointsMetersXZ: [[0, 0], [0, 0]],
        widthMeters: 2,
        terrainCellSizeMetersXZ: [1, 1],
      },
      {
        pointsMetersXZ: [[0, 0], [Number.NaN, 1]],
        widthMeters: 2,
        terrainCellSizeMetersXZ: [1, 1],
      },
      {
        pointsMetersXZ: [[0, 0], [1, 1]],
        widthMeters: 0,
        terrainCellSizeMetersXZ: [1, 1],
      },
      {
        pointsMetersXZ: [[0, 0], [1, 1]],
        widthMeters: 2,
        terrainCellSizeMetersXZ: [1, Number.POSITIVE_INFINITY],
      },
    ] as const) {
      expect(() => estimateRouteBuildWindowTileCountV1({
        ...input,
        ...profile,
      })).toThrow("TRAVERSAL_GRAPH_BUILD_BUDGET_INVALID");
    }
  });
});

describe("Traversal surface count budget", () => {
  it("uses one factory-created Envelope to admit 60 and 61 surfaces but reject 62", () => {
    const capabilityEnvelope = surfaceCountEnvelope();

    expect(capabilityEnvelope.maximumTraversalSurfaceCount).toBe(61);
    for (const traversalSurfaceCount of [60, 61]) {
      expect(() => assertTraversalSurfaceCountBudgetV1({
        traversalSurfaceCount,
        capabilityEnvelope,
      })).not.toThrow();
    }
    expect(() => assertTraversalSurfaceCountBudgetV1({
      traversalSurfaceCount: 62,
      capabilityEnvelope,
    })).toThrow("ROUTE_GRAPH_BUDGET_EXCEEDED");
  });

  it("rejects invalid counts and a self-reported maximum override", () => {
    const capabilityEnvelope = surfaceCountEnvelope();
    for (const input of [
      { traversalSurfaceCount: 0, capabilityEnvelope },
      { traversalSurfaceCount: 1.5, capabilityEnvelope },
      {
        traversalSurfaceCount: 62,
        capabilityEnvelope,
        maximumTraversalSurfaceCount: 62,
      },
    ]) {
      expect(() => assertTraversalSurfaceCountBudgetV1(input)).toThrow(
        "TRAVERSAL_GRAPH_BUILD_BUDGET_INVALID",
      );
    }
  });
});
