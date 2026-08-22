import {
  assertTraversalGraphBuildBudgetV1,
  hashHeightfieldRouteBuildInputV1,
  type HeightfieldRouteBuildInputReceiptV1,
  type HeightfieldRouteBuildInputV1,
} from "@whitebox-world/traversal";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  buildHeightfieldTraversalGraphFromSnapshotV1,
  classifyGraphProjectionCapacityV1,
  interpolatePortalBoundaryPointUnitsV1,
  type RecastNavMeshAuditSnapshotV1,
} from "./build-graph.js";
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

function receipt(
  overrides: Partial<HeightfieldRouteBuildInputV1["capabilityEnvelope"]> = {},
): HeightfieldRouteBuildInputReceiptV1 {
  const resourceLockHash = HASH_C;
  const capabilityEnvelope = {
    ...createRecastTestEnvelopeV1({ resourceLockHash }),
    ...overrides,
    resourceLockHash,
  };
  const input: HeightfieldRouteBuildInputV1 = {
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
      positionMetersXYZ: [0.5, 0, 2],
    },
    destinationAnchor: {
      entityId: "anchor-destination",
      positionMetersXYZ: [3.5, 0.2, 2],
    },
    hardRibbon: {
      routeId: "route-main",
      pointsMetersXZ: [[0, 2], [4, 2]],
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
        positionsMetersXYZ: [
          0, 0, 0,
          0, 0, 4,
          16, 0, 0,
          16, 0, 4,
        ],
        triangleIndices: [0, 1, 2, 2, 1, 3],
      },
      minimumMetersXZ: [0, 0],
      maximumMetersXZ: [16, 4],
    },
    blockingColliders: [],
    colliderArtifactHash: sha256CanonicalJson([]) as `sha256:${string}`,
    blockedWaterExclusions: [],
  };
  const estimate = assertTraversalGraphBuildBudgetV1({
    minimumMetersXZ: [0, 0],
    maximumMetersXZ: [16, 4],
    tileSizeCells: capabilityEnvelope.tileSizeCells,
    voxelCellSizeMeters: capabilityEnvelope.voxelCellSizeMeters,
    maximumTiles: capabilityEnvelope.maximumTiles,
  });
  const frozenInput = deepFreeze(input);
  return deepFreeze({
    input: frozenInput,
    routeBuildInputHash: hashHeightfieldRouteBuildInputV1(frozenInput),
    budgetEvidence: {
      kind: "heightfield-tile-estimate",
      ...estimate,
      maximumTiles: capabilityEnvelope.maximumTiles,
      minimumMetersXZ: [0, 0],
      maximumMetersXZ: [16, 4],
    },
  });
}

function twoTileSnapshot(): RecastNavMeshAuditSnapshotV1 {
  return deepFreeze({
    kind: "recast-navmesh-audit-snapshot",
    schemaVersion: 1,
    nullLinkIndex: 0xffff_ffff,
    tiles: [
      {
        tileX: 0,
        tileZ: 0,
        tileLayer: 0,
        maximumLinkCount: 1,
        offMeshConnectionCount: 0,
        verticesMetersXYZ: [
          [0, 0, 0],
          [2, 0, 0],
          [2, 0, 4],
          [0, 0, 4],
        ],
        polygons: [{
          providerPolygonRef: 101,
          providerType: 0,
          areaId: 0,
          flags: 1,
          vertexIndices: [0, 1, 2, 3],
          firstLinkIndex: 0,
          detailTrianglesMetersXYZ: [
            [[0, 0, 0], [2, 0, 4], [2, 0, 0]],
            [[0, 0, 0], [0, 0, 4], [2, 0, 4]],
          ],
        }],
        links: [{
          providerLinkIndex: 0,
          targetProviderPolygonRef: 202,
          nextLinkIndex: 0xffff_ffff,
          sourceEdgeIndex: 1,
          side: 0,
          boundaryMinimum: 64,
          boundaryMaximum: 191,
        }],
      },
      {
        tileX: 1,
        tileZ: 0,
        tileLayer: 0,
        maximumLinkCount: 1,
        offMeshConnectionCount: 0,
        verticesMetersXYZ: [
          [2, 0.2, 1],
          [4, 0.2, 1],
          [4, 0.2, 3],
          [2, 0.2, 3],
        ],
        polygons: [{
          providerPolygonRef: 202,
          providerType: 0,
          areaId: 0,
          flags: 1,
          vertexIndices: [0, 1, 2, 3],
          firstLinkIndex: 0,
          detailTrianglesMetersXYZ: [
            [[2, 0.2, 1], [4, 0.2, 3], [4, 0.2, 1]],
            [[2, 0.2, 1], [2, 0.2, 3], [4, 0.2, 3]],
          ],
        }],
        links: [{
          providerLinkIndex: 0,
          targetProviderPolygonRef: 101,
          nextLinkIndex: 0xffff_ffff,
          sourceEdgeIndex: 3,
          side: 4,
          boundaryMinimum: 0,
          boundaryMaximum: 255,
        }],
      },
    ],
  });
}

describe("canonical Recast traversal Graph projection", () => {
  it("interpolates external portal bytes with exact safe-integer arithmetic", () => {
    expect(interpolatePortalBoundaryPointUnitsV1(
      [9_007_199_254_740_000, -9_007_199_254_740_000, 100],
      [9_007_199_254_740_900, -9_007_199_254_740_900, 1_000],
      64,
    )).toEqual([
      9_007_199_254_740_226,
      -9_007_199_254_740_226,
      326,
    ]);
  });

  it("projects deterministic Nodes, cross-Tile portals, slope, signed delta, and step evidence", () => {
    const result = buildHeightfieldTraversalGraphFromSnapshotV1(
      twoTileSnapshot(),
      receipt(),
    );
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    const nodes = Object.values(result.traversalGraph.traversalNodesById);
    const edges = Object.values(result.traversalGraph.traversalEdgesById);
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(2);
    expect(nodes.map((node) => node.positionMetersXYZ)).toEqual([
      [1, 0, 2],
      [3, 0.2, 2],
    ]);
    expect(new Set(nodes.map((node) => node.traversalSurfaceId))).toEqual(
      new Set(["surface-ground"]),
    );
    expect(edges.map((edge) => edge.heightDeltaMeters).sort()).toEqual([-0.2, 0.2]);
    expect(edges.map((edge) => edge.stepHeightMeters)).toEqual([0.2, 0.2]);
    expect(edges.map((edge) => edge.type)).toEqual(["step", "step"]);
    expect(edges.every((edge) => edge.routePathCost > 0)).toBe(true);
    expect(Object.keys(result.traversalGraph.traversalNodesById)).toEqual(
      [...Object.keys(result.traversalGraph.traversalNodesById)].sort(),
    );
    expect(Object.isFrozen(result.traversalGraph)).toBe(true);
    expect(JSON.stringify(result.traversalGraph)).not.toMatch(
      /providerPolygonRef|providerTileRef|recast/i,
    );
  });

  it("is byte-identical when provider Tile enumeration order changes", () => {
    const first = buildHeightfieldTraversalGraphFromSnapshotV1(
      twoTileSnapshot(),
      receipt(),
    );
    const reversed = twoTileSnapshot();
    const second = buildHeightfieldTraversalGraphFromSnapshotV1(
      deepFreeze({ ...reversed, tiles: [...reversed.tiles].reverse() }),
      receipt(),
    );
    expect(second).toEqual(first);
  });

  it("omits polygons outside the finite hard ribbon without publishing a partial Graph", () => {
    const snapshot = twoTileSnapshot();
    const moved = deepFreeze({
      ...snapshot,
      tiles: snapshot.tiles.map((tile) => ({
        ...tile,
        verticesMetersXYZ: tile.verticesMetersXYZ.map((point) => [
          point[0],
          point[1],
          point[2] + 20,
        ] as const),
        polygons: tile.polygons.map((polygon) => ({
          ...polygon,
          detailTrianglesMetersXYZ: polygon.detailTrianglesMetersXYZ.map(
            (triangle) => triangle.map((point) => [
              point[0],
              point[1],
              point[2] + 20,
            ] as const) as unknown as typeof triangle,
          ),
        })),
      })),
    });
    expect(buildHeightfieldTraversalGraphFromSnapshotV1(moved, receipt())).toEqual({
      status: "unavailable",
      reason: "no-queryable-ground-surface",
    });
  });

  it("fails closed on Node capacity without returning a partial Graph", () => {
    const result = classifyGraphProjectionCapacityV1({
      nodeCount: 2,
      edgeCount: 0,
      maximumNodes: 1,
      maximumEdges: 1,
    });
    expect(result).toEqual({
      status: "incomplete",
      capacityKind: "nodes",
      maximumAllowedCount: 1,
      minimumRequiredCount: 2,
    });
    expect(result).toBeDefined();
    expect("traversalGraph" in result!).toBe(false);
  });

  it("rejects unresolved non-zero links and link cycles as provider invariants", () => {
    const snapshot = twoTileSnapshot();
    const unresolved = deepFreeze({
      ...snapshot,
      tiles: snapshot.tiles.map((tile, tileIndex) => tileIndex === 0
        ? {
            ...tile,
            links: [{ ...tile.links[0]!, targetProviderPolygonRef: 999 }],
          }
        : tile),
    });
    expect(() => buildHeightfieldTraversalGraphFromSnapshotV1(
      unresolved,
      receipt(),
    )).toThrow(/unresolved non-zero target/i);

    const cyclic = deepFreeze({
      ...snapshot,
      tiles: snapshot.tiles.map((tile, tileIndex) => tileIndex === 0
        ? {
            ...tile,
            links: [{ ...tile.links[0]!, nextLinkIndex: 0 }],
          }
        : tile),
    });
    expect(() => buildHeightfieldTraversalGraphFromSnapshotV1(
      cyclic,
      receipt(),
    )).toThrow(/link cycle/i);
  });

  it("rejects unknown Flags, inverted detail winding, and invalid external sides", () => {
    const snapshot = twoTileSnapshot();
    const oversizedProviderRef = deepFreeze({
      ...snapshot,
      tiles: snapshot.tiles.map((tile, tileIndex) => tileIndex === 0
        ? {
            ...tile,
            polygons: tile.polygons.map((polygon) => ({
              ...polygon,
              providerPolygonRef: 0x1_0000_0000,
            })),
          }
        : tile),
    });
    expect(() => buildHeightfieldTraversalGraphFromSnapshotV1(
      oversizedProviderRef,
      receipt(),
    )).toThrow(/positive unsigned 32-bit integer/i);

    const unknownFlags = deepFreeze({
      ...snapshot,
      tiles: snapshot.tiles.map((tile, tileIndex) => tileIndex === 1
        ? {
            ...tile,
            polygons: tile.polygons.map((polygon) => ({ ...polygon, flags: 3 })),
          }
        : tile),
    });
    expect(() => buildHeightfieldTraversalGraphFromSnapshotV1(
      unknownFlags,
      receipt(),
    )).toThrow(/unresolved non-zero target/i);

    const inverted = deepFreeze({
      ...snapshot,
      tiles: snapshot.tiles.map((tile, tileIndex) => tileIndex === 0
        ? {
            ...tile,
            polygons: tile.polygons.map((polygon) => ({
              ...polygon,
              detailTrianglesMetersXYZ: polygon.detailTrianglesMetersXYZ.map(
                ([a, b, c]) => [a, c, b] as const,
              ),
            })),
          }
        : tile),
    });
    expect(() => buildHeightfieldTraversalGraphFromSnapshotV1(
      inverted,
      receipt(),
    )).toThrow(/positive-Y provider winding/i);

    const invalidSide = deepFreeze({
      ...snapshot,
      tiles: snapshot.tiles.map((tile, tileIndex) => tileIndex === 0
        ? { ...tile, links: tile.links.map((link) => ({ ...link, side: 1 })) }
        : tile),
    });
    expect(() => buildHeightfieldTraversalGraphFromSnapshotV1(
      invalidSide,
      receipt(),
    )).toThrow(/four Tile boundary sides/i);
  });

  it("rejects duplicate ordered Links with different Portal evidence", () => {
    const snapshot = twoTileSnapshot();
    const conflicting = deepFreeze({
      ...snapshot,
      tiles: snapshot.tiles.map((tile, tileIndex) => tileIndex === 0
        ? {
            ...tile,
            maximumLinkCount: 2,
            links: [
              { ...tile.links[0]!, nextLinkIndex: 1 },
              {
                ...tile.links[0]!,
                providerLinkIndex: 1,
                boundaryMinimum: 65,
                nextLinkIndex: snapshot.nullLinkIndex,
              },
            ],
          }
        : tile),
    });
    expect(() => buildHeightfieldTraversalGraphFromSnapshotV1(
      conflicting,
      receipt(),
    )).toThrow(/conflicting Edge evidence/i);
  });

  it("rejects a centroid height delta outside the safe quantized range", () => {
    const snapshot = twoTileSnapshot();
    const extreme = deepFreeze({
      ...snapshot,
      tiles: snapshot.tiles.map((tile, tileIndex) => {
        const y = tileIndex === 0 ? -5_000_000_000_000 : 5_000_000_000_000;
        return {
          ...tile,
          verticesMetersXYZ: tile.verticesMetersXYZ.map((point) => [
            point[0],
            y,
            point[2],
          ] as const),
          polygons: tile.polygons.map((polygon) => ({
            ...polygon,
            detailTrianglesMetersXYZ: polygon.detailTrianglesMetersXYZ.map(
              (triangle) => triangle.map((point) => [
                point[0],
                y,
                point[2],
              ] as const) as unknown as typeof triangle,
            ),
          })),
        };
      }),
    });
    expect(() => buildHeightfieldTraversalGraphFromSnapshotV1(
      extreme,
      receipt(),
    )).toThrow(/height delta.*safe integer/i);
  });
});
