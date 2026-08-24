import {
  createRouteBuildInputReceiptV2,
  hashRouteColliderArtifactV2,
  hashRouteGeometryArtifactV2,
  hashRouteSurfaceArtifactV2,
  hashRouteTerrainArtifactV2,
  type CanonicalTriangleSoupV1,
  type RouteBuildInputReceiptV2,
  type RouteBuildInputV2,
} from "@whitebox-world/traversal";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  buildTraversalGraphFromSnapshotV2,
  classifyGraphProjectionCapacityV1,
  graphNodeCorrelationHeightWindowMetersV2,
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
  overrides: Partial<RouteBuildInputV2["capabilityEnvelope"]> = {},
  terrainTriangleSoup: CanonicalTriangleSoupV1 = {
    positionsMetersXYZ: [
      0, 0, 0,
      0, 0, 4,
      2, 0, 0,
      2, 0, 4,
      2, 0.2, 0,
      2, 0.2, 4,
      16, 0.2, 0,
      16, 0.2, 4,
    ],
    triangleIndices: [0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7],
  },
): RouteBuildInputReceiptV2 {
  const resourceLockHash = HASH_C;
  const capabilityEnvelope = deepFreeze({
    ...createRecastTestEnvelopeV1({ resourceLockHash }),
    ...overrides,
    resourceLockHash,
  });
  const input = {
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
      triangleSoup: terrainTriangleSoup,
      minimumMetersXZ: [0, 0],
      maximumMetersXZ: [16, 4],
    },
    staticColliders: [],
    blockedTraversalAreaExclusions: [],
    blockedWaterExclusions: [],
  };
  const terrainArtifactHash = hashRouteTerrainArtifactV2(input.terrainSource);
  const colliderArtifactHash = hashRouteColliderArtifactV2(input.staticColliders);
  const completeInput = {
    ...input,
    terrainArtifactHash,
    colliderArtifactHash,
    geometryArtifactHash: hashRouteGeometryArtifactV2({
      terrainArtifactHash,
      colliderArtifactHash,
    }),
    surfaceArtifactHash: hashRouteSurfaceArtifactV2(input.traversalSurfaces),
  };
  return createRouteBuildInputReceiptV2(completeInput);
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
          areaId: 2,
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
          areaId: 2,
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
    const result = buildTraversalGraphFromSnapshotV2(
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
    const first = buildTraversalGraphFromSnapshotV2(
      twoTileSnapshot(),
      receipt(),
    );
    const reversed = twoTileSnapshot();
    const second = buildTraversalGraphFromSnapshotV2(
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
    expect(buildTraversalGraphFromSnapshotV2(moved, receipt())).toEqual({
      status: "unavailable",
      reason: "no-queryable-ground-surface",
    });
  });

  it("fails closed when a tagged provider polygon centroid misses its canonical source", () => {
    const splitSource: CanonicalTriangleSoupV1 = {
      positionsMetersXYZ: [
        0, 0, 0,
        0, 0, 4,
        1, 0, 0,
        1, 0, 4,
        3, 0, 0,
        3, 0, 4,
        16, 0, 0,
        16, 0, 4,
      ],
      triangleIndices: [0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7],
    };
    const snapshot: RecastNavMeshAuditSnapshotV1 = deepFreeze({
      kind: "recast-navmesh-audit-snapshot",
      schemaVersion: 1,
      nullLinkIndex: 0xffff_ffff,
      tiles: [{
        tileX: 0,
        tileZ: 0,
        tileLayer: 0,
        maximumLinkCount: 0,
        offMeshConnectionCount: 0,
        verticesMetersXYZ: [
          [0, 0, 0],
          [4, 0, 0],
          [4, 0, 4],
          [0, 0, 4],
        ],
        polygons: [{
          providerPolygonRef: 101,
          providerType: 0,
          areaId: 2,
          flags: 1,
          vertexIndices: [0, 1, 2, 3],
          firstLinkIndex: 0xffff_ffff,
          detailTrianglesMetersXYZ: [
            [[0, 0, 0], [4, 0, 4], [4, 0, 0]],
            [[0, 0, 0], [0, 0, 4], [4, 0, 4]],
          ],
        }],
        links: [],
      }],
    });

    expect(buildTraversalGraphFromSnapshotV2(
      snapshot,
      receipt({}, splitSource),
    )).toEqual({
      status: "incomplete",
      reason: "surface-correlation-missing",
      relatedTraversalSurfaceIdentities: [{
        traversalSurfaceId: "surface-ground",
        surfaceEntityId: "terrain-ground",
        colliderSubshapeId: "collider-terrain",
        resourceRef: "worldkit://terrain/ground@1",
        resolvedVersion: "1",
        resourceHash: HASH_A,
      }],
      failurePositionMetersXYZ: [2, 0, 2],
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
    expect(() => buildTraversalGraphFromSnapshotV2(
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
    expect(() => buildTraversalGraphFromSnapshotV2(
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
    expect(() => buildTraversalGraphFromSnapshotV2(
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
    expect(() => buildTraversalGraphFromSnapshotV2(
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
    expect(() => buildTraversalGraphFromSnapshotV2(
      inverted,
      receipt(),
    )).toThrow(/positive-Y provider winding/i);

    const invalidSide = deepFreeze({
      ...snapshot,
      tiles: snapshot.tiles.map((tile, tileIndex) => tileIndex === 0
        ? { ...tile, links: tile.links.map((link) => ({ ...link, side: 1 })) }
        : tile),
    });
    expect(() => buildTraversalGraphFromSnapshotV2(
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
    expect(() => buildTraversalGraphFromSnapshotV2(
      conflicting,
      receipt(),
    )).toThrow(/conflicting Edge evidence/i);
  });

  it("uses a quantization-half Graph Node correlation height window", () => {
    const envelope = createRecastTestEnvelopeV1();
    const windowMeters = graphNodeCorrelationHeightWindowMetersV2(envelope);
    expect(windowMeters).toBe(0.001 / 2 + 0.00001);
    expect(windowMeters).toBeLessThan(envelope.voxelCellHeightMeters);
    expect(windowMeters).not.toBe(
      envelope.voxelCellHeightMeters +
      envelope.maxStepHeightMeters +
      0.00001,
    );
  });

  it("rejects a centroid height delta outside the safe quantized range", () => {
    const snapshot = twoTileSnapshot();
    const extreme = deepFreeze({
      ...snapshot,
      tiles: snapshot.tiles.map((tile, tileIndex) => {
        const y = tileIndex === 0 ? -9_007_199_254_740_992 : 9_007_199_254_740_992;
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
    expect(() => buildTraversalGraphFromSnapshotV2(
      extreme,
      receipt(),
    )).toThrow(/safe integer/i);
  });
});
