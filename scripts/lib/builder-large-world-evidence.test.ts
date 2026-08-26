import type { AuthoringSpecV4 } from "@whitebox-world/authoring";
import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import { describe, expect, it } from "vitest";

import { collectBuilderLargeWorldEvidenceV1 } from
  "./builder-large-world-evidence";

function largeWorldBase(): AuthoringSpecV4 {
  const world = createValidAuthoringSpec();
  world.world.bounds.sizeMetersXZ = [2000, 2000];
  world.world.resourceBudget = {
    maxVertices: 650_000,
    maxTriangles: 1_300_000,
    maxColliders: 128,
  };
  const terrain = world.nodes.find((node) => node.kind === "terrain");
  if (terrain?.kind !== "terrain") throw new Error("TEST_TERRAIN_MISSING");
  terrain.components.terrain.grid.sizeMetersXZ = [2000, 2000];
  terrain.components.terrain.grid.resolutionCellsXZ = [801, 801];
  return world;
}

function withOneRoute(pointsMetersXZ: readonly (readonly [number, number])[]): AuthoringSpecV4 {
  const world = largeWorldBase();
  world.spatial.routes = [{
    id: "route-main",
    kind: "polyline-xz",
    pointsMetersXZ,
    widthMeters: 4,
    locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
  }];
  world.nodes.push({
    id: "destination-main",
    kind: "anchor",
    placement: { kind: "fixed", transform: { positionMetersXYZ: [1000, 0, 1000] } },
    semantic: { classId: "destination" },
  });
  world.constraints.connectivity = [{
    id: "connect-main",
    kind: "connected-by-route",
    requirement: "required",
    traversingEntityId: "player",
    startAnchorEntityId: "spawn-main",
    destinationAnchorEntityId: "destination-main",
    routeId: "route-main",
  }];
  return world;
}

function segmentedDiagonalWorld(): AuthoringSpecV4 {
  const world = largeWorldBase();
  const seamPoints = Array.from({ length: 11 }, (_, index) =>
    [-1000 + index * 200, -1000 + index * 200] as const,
  );
  const anchorIds = seamPoints.map((_, index) =>
    index === 0 ? "spawn-main" : index === 10 ? "destination-main" :
      `route-seam-${String(index).padStart(3, "0")}`,
  );
  const spawn = world.nodes.find((node) => node.id === "spawn-main");
  if (spawn?.kind !== "anchor" || spawn.placement.kind !== "fixed") {
    throw new Error("TEST_SPAWN_MISSING");
  }
  spawn.placement.transform.positionMetersXYZ = [-1000, 0, -1000];
  world.nodes.push(...seamPoints.slice(1).map((point, index) => ({
    id: anchorIds[index + 1]!,
    kind: "anchor" as const,
    placement: {
      kind: "fixed" as const,
      transform: { positionMetersXYZ: [point[0], 0, point[1]] as const },
    },
    semantic: { classId: index === 9 ? "destination" : "route.seam" },
  })));
  world.spatial.routes = seamPoints.slice(1).map((destination, index) => ({
    id: `route-segment-${String(index + 1).padStart(3, "0")}`,
    kind: "polyline-xz" as const,
    pointsMetersXZ: [seamPoints[index]!, destination],
    widthMeters: 4,
    locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
  }));
  world.constraints.connectivity = world.spatial.routes.map((route, index) => ({
    id: `connect-segment-${String(index + 1).padStart(3, "0")}`,
    kind: "connected-by-route" as const,
    requirement: "required" as const,
    traversingEntityId: "player",
    startAnchorEntityId: anchorIds[index]!,
    destinationAnchorEntityId: anchorIds[index + 1]!,
    routeId: route.id,
  }));
  return world;
}

describe("Builder large-world evidence", () => {
  it("reports the 2km operational Heightfield counts without inventing a world limit", () => {
    const result = collectBuilderLargeWorldEvidenceV1(largeWorldBase());

    expect(result.terrainScaleEvidence).toEqual({
      terrainEntityId: "terrain-main",
      sizeMetersXZ: [2000, 2000],
      resolutionVerticesXZ: [801, 801],
      cellSizeMetersXZ: [2.5, 2.5],
      terrainVertexCount: 641_601,
      terrainTriangleCount: 1_280_000,
      operationalProfile: "large-single-heightfield-v1",
      recommendedCellSizeRangeSatisfied: true,
    });
    expect(result.routeBuildWindowEvidence).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("accepts a narrow 2km straight constrained route", () => {
    const result = collectBuilderLargeWorldEvidenceV1(
      withOneRoute([[-1000, 0], [1000, 0]]),
    );

    expect(result.routeBuildWindowEvidence).toEqual([
      expect.objectContaining({
        constraintId: "connect-main",
        routeId: "route-main",
        status: "admitted",
        estimatedTiles: 210,
        maximumTiles: 1024,
      }),
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects one 2km diagonal window with stable structured repair evidence", () => {
    const result = collectBuilderLargeWorldEvidenceV1(
      withOneRoute([[-1000, -1000], [1000, 1000]]),
    );

    expect(result.routeBuildWindowEvidence).toEqual([
      expect.objectContaining({
        constraintId: "connect-main",
        routeId: "route-main",
        status: "budget-exceeded",
        tilesX: 210,
        tilesZ: 210,
        estimatedTiles: 44_100,
        maximumTiles: 1024,
      }),
    ]);
    expect(result.diagnostics).toEqual([expect.objectContaining({
      code: "ROUTE_BUILD_WINDOW_BUDGET_EXCEEDED",
      instancePath: "/constraints/connectivity/connect-main",
      details: expect.objectContaining({
        constraintId: "connect-main",
        routeId: "route-main",
        estimatedTiles: 44_100,
        maximumTiles: 1024,
        repair: "split-with-shared-seam-anchors",
      }),
    })]);
  });

  it("admits ten stable ordered diagonal segments that share exact seam Anchors", () => {
    const world = segmentedDiagonalWorld();
    const result = collectBuilderLargeWorldEvidenceV1(world);

    expect(result.routeBuildWindowEvidence).toHaveLength(10);
    expect(result.routeBuildWindowEvidence.every((row) =>
      row.status === "admitted" && row.estimatedTiles === 484
    )).toBe(true);
    expect(result.routeBuildWindowEvidence.map(({ constraintId }) => constraintId)).toEqual(
      Array.from({ length: 10 }, (_, index) =>
        `connect-segment-${String(index + 1).padStart(3, "0")}`,
      ),
    );
    for (let index = 0; index < world.constraints.connectivity.length - 1; index += 1) {
      expect(world.constraints.connectivity[index]!.destinationAnchorEntityId).toBe(
        world.constraints.connectivity[index + 1]!.startAnchorEntityId,
      );
    }
    expect(result.diagnostics).toEqual([]);
  });
});
