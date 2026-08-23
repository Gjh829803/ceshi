import {
  ChunkIdsArray,
  getNavMeshPositionsAndIndices,
  init,
  NavMesh,
  NavMeshQuery,
  RecastChunkyTriMesh,
  Raw,
  TrianglesArray,
  VerticesArray,
} from "recast-navigation";
import { sha256Bytes } from "@whitebox-world/protocol";
import {
  buildTiledNavMeshRcConfig,
  generateTiledNavMesh,
  generateTileNavMeshData,
} from "recast-navigation/generators";
import { describe, expect, it } from "vitest";

import {
  destroyRecastTiledOperationResourcesV1,
  generateRetainedTiledNavMeshV1,
  runRecastProviderOperationV1,
} from "./provider-lifecycle.js";
import * as providerLifecycleModule from "./provider-lifecycle.js";
import {
  createRecastQueryProviderV1,
  destroyRecastQueryProviderV1,
  findNearestRecastPolygonV1,
  type RecastQueryProviderReceiptV1,
} from "./query-provider.js";
import { mapTraversalCapabilityEnvelopeToRecastTiledConfigV1 } from "./recast-config.js";
import { createRecastTestEnvelopeV1 } from "./test-fixture.test-support.js";

const PLANE_POSITIONS = [
  0, 0, 0,
  0, 0, 4,
  4, 0, 0,
  4, 0, 4,
] as const;
const COUNTER_CLOCKWISE_INDICES = [0, 1, 2, 2, 1, 3] as const;
const REVERSED_INDICES = [0, 2, 1, 2, 3, 1] as const;
const UNPATCHED_RECAST_0431_PLANE_OUTPUT_HASH =
  "sha256:97459be30f32a7a37bcdb92bc655d5b70a0378cd43d930c07cb4c0eae076b374";

function planeWithBox(blockerHeightMeters: number, bottomMeters = 0) {
  const topMeters = bottomMeters + blockerHeightMeters;
  const positions = [
    ...PLANE_POSITIONS,
    1.5, bottomMeters, 1.5,
    1.5, bottomMeters, 2.5,
    2.5, bottomMeters, 1.5,
    2.5, bottomMeters, 2.5,
    1.5, topMeters, 1.5,
    1.5, topMeters, 2.5,
    2.5, topMeters, 1.5,
    2.5, topMeters, 2.5,
  ];
  const indices = [
    ...COUNTER_CLOCKWISE_INDICES,
    4, 6, 5, 6, 7, 5,
    8, 9, 10, 10, 9, 11,
    4, 5, 8, 8, 5, 9,
    6, 10, 7, 10, 11, 7,
    4, 8, 6, 6, 8, 10,
    5, 7, 9, 9, 7, 11,
  ];
  return { positions, indices };
}

interface BoxSourceInput {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumZ: number;
  readonly maximumZ: number;
  readonly bottomMeters: number;
  readonly topMeters: number;
}

function appendBoxSource(
  positions: number[],
  indices: number[],
  input: BoxSourceInput,
): { readonly startVertexIndex: number; readonly vertexCount: 8 } {
  const startVertexIndex = positions.length / 3;
  positions.push(
    input.minimumX, input.bottomMeters, input.minimumZ,
    input.minimumX, input.bottomMeters, input.maximumZ,
    input.maximumX, input.bottomMeters, input.minimumZ,
    input.maximumX, input.bottomMeters, input.maximumZ,
    input.minimumX, input.topMeters, input.minimumZ,
    input.minimumX, input.topMeters, input.maximumZ,
    input.maximumX, input.topMeters, input.minimumZ,
    input.maximumX, input.topMeters, input.maximumZ,
  );
  indices.push(
    startVertexIndex, startVertexIndex + 2, startVertexIndex + 1,
    startVertexIndex + 2, startVertexIndex + 3, startVertexIndex + 1,
    startVertexIndex + 4, startVertexIndex + 5, startVertexIndex + 6,
    startVertexIndex + 6, startVertexIndex + 5, startVertexIndex + 7,
    startVertexIndex, startVertexIndex + 1, startVertexIndex + 4,
    startVertexIndex + 4, startVertexIndex + 1, startVertexIndex + 5,
    startVertexIndex + 2, startVertexIndex + 6, startVertexIndex + 3,
    startVertexIndex + 6, startVertexIndex + 7, startVertexIndex + 3,
    startVertexIndex, startVertexIndex + 4, startVertexIndex + 2,
    startVertexIndex + 2, startVertexIndex + 4, startVertexIndex + 6,
    startVertexIndex + 1, startVertexIndex + 3, startVertexIndex + 5,
    startVertexIndex + 5, startVertexIndex + 3, startVertexIndex + 7,
  );
  return { startVertexIndex, vertexCount: 8 };
}

function hasInteriorTopTriangleAtX(
  positions: readonly number[],
  indices: readonly number[],
  minimumX: number,
  maximumX: number,
  minimumHeightMeters: number,
): boolean {
  for (let offset = 0; offset < indices.length; offset += 3) {
    const vertexIndices = [
      indices[offset]!,
      indices[offset + 1]!,
      indices[offset + 2]!,
    ];
    const centroid = [0, 1, 2].map((axis) => vertexIndices.reduce(
      (sum, vertexIndex) => sum + positions[vertexIndex * 3 + axis]!,
      0,
    ) / 3);
    if (
      centroid[0]! > minimumX && centroid[0]! < maximumX &&
      centroid[1]! > minimumHeightMeters
    ) return true;
  }
  return false;
}

interface ProviderPolygonSnapshot {
  readonly area: number;
  readonly verticesMetersXYZ: readonly (readonly [number, number, number])[];
}

function snapshotProviderPolygons(navMesh: NavMesh): ProviderPolygonSnapshot[] {
  const polygons: ProviderPolygonSnapshot[] = [];
  for (let tileIndex = 0; tileIndex < navMesh.getMaxTiles(); tileIndex += 1) {
    const tile = navMesh.getTile(tileIndex);
    const header = tile.header();
    if (header === null) continue;
    const baseRef = navMesh.getPolyRefBase(tile);
    for (let polygonIndex = 0; polygonIndex < header.polyCount(); polygonIndex += 1) {
      const polygon = tile.polys(polygonIndex);
      const areaResult = navMesh.getPolyArea(baseRef + polygonIndex);
      polygons.push({
        area: areaResult.area,
        verticesMetersXYZ: Array.from(
          { length: polygon.vertCount() },
          (_, vertexOffset) => {
            const vertexIndex = polygon.verts(vertexOffset);
            return [
              tile.verts(vertexIndex * 3),
              tile.verts(vertexIndex * 3 + 1),
              tile.verts(vertexIndex * 3 + 2),
            ] as const;
          },
        ),
      });
    }
  }
  return polygons;
}

function hasInteriorBoxTopTriangle(
  positions: readonly number[],
  indices: readonly number[],
  minimumHeightMeters: number,
): boolean {
  for (let offset = 0; offset < indices.length; offset += 3) {
    const vertexIndices = [indices[offset]!, indices[offset + 1]!, indices[offset + 2]!];
    const centroid = [0, 1, 2].map((axis) => vertexIndices.reduce(
      (sum, vertexIndex) => sum + positions[vertexIndex * 3 + axis]!,
      0,
    ) / 3);
    if (
      centroid[0]! > 1.55 && centroid[0]! < 2.45 &&
      centroid[2]! > 1.55 && centroid[2]! < 2.45 &&
      centroid[1]! > minimumHeightMeters
    ) return true;
  }
  return false;
}

function packNavMeshOutputV1(
  positions: readonly number[],
  indices: readonly number[],
): Uint8Array {
  const bytes = new Uint8Array(
    Uint32Array.BYTES_PER_ELEMENT * 2 +
      Float32Array.BYTES_PER_ELEMENT * positions.length +
      Int32Array.BYTES_PER_ELEMENT * indices.length,
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0, positions.length, true);
  view.setUint32(Uint32Array.BYTES_PER_ELEMENT, indices.length, true);
  let offset = Uint32Array.BYTES_PER_ELEMENT * 2;
  for (const position of positions) {
    view.setFloat32(offset, position, true);
    offset += Float32Array.BYTES_PER_ELEMENT;
  }
  for (const index of indices) {
    view.setInt32(offset, index, true);
    offset += Int32Array.BYTES_PER_ELEMENT;
  }
  return bytes;
}

function createSeparatedGridIslands() {
  const positions: number[] = [];
  const indices: number[] = [];
  const appendGrid = (minimumX: number) => {
    const baseVertex = positions.length / 3;
    const segments = 8;
    const segmentSizeMeters = 0.5;
    for (let z = 0; z <= segments; z += 1) {
      for (let x = 0; x <= segments; x += 1) {
        positions.push(
          minimumX + x * segmentSizeMeters,
          0,
          z * segmentSizeMeters,
        );
      }
    }
    for (let z = 0; z < segments; z += 1) {
      for (let x = 0; x < segments; x += 1) {
        const lowerLeft = baseVertex + z * (segments + 1) + x;
        const upperLeft = lowerLeft + segments + 1;
        const lowerRight = lowerLeft + 1;
        const upperRight = upperLeft + 1;
        indices.push(
          lowerLeft,
          upperLeft,
          lowerRight,
          lowerRight,
          upperLeft,
          upperRight,
        );
      }
    }
  };
  appendGrid(0);
  appendGrid(24);
  return { positions, indices };
}

interface RawDestroyEvent {
  readonly className: string;
  readonly size: number | undefined;
  readonly isView: boolean | undefined;
}

type ResourceReleasePhase = "generator" | "sdk";

interface ResourceReleaseEvent {
  readonly operation: string;
  readonly phase: ResourceReleasePhase;
  readonly pointer: number;
  readonly resource: unknown;
}

function snapshotRawDestroyEvent(rawValue: unknown): RawDestroyEvent {
  const raw = rawValue as {
    readonly __class__?: { readonly name?: string };
    readonly constructor?: { readonly name?: string };
    readonly size?: number;
    readonly isView?: boolean;
  };
  return {
    className: raw.__class__?.name ?? raw.constructor?.name ?? "unknown",
    size: raw.size,
    isView: raw.isView,
  };
}

async function generatePlane(indices: readonly number[]) {
  return runRecastProviderOperationV1(async () => {
    const result = generateRetainedTiledNavMeshV1(
      PLANE_POSITIONS,
      indices,
      mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
        createRecastTestEnvelopeV1(),
      ),
    );
    let query: NavMeshQuery | undefined;
    try {
      if (!result.success) {
        return { success: false as const, positions: [] as number[], indices: [] as number[] };
      }
      query = new NavMeshQuery(result.navMesh);
      const [positions, navIndices] = getNavMeshPositionsAndIndices(result.navMesh);
      return { success: true as const, positions, indices: navIndices };
    } finally {
      destroyRecastTiledOperationResourcesV1(query, result);
    }
  });
}

describe("recast-navigation 0.43.1 provider acceptance", () => {
  it("aggregates Query cleanup failure after attempting Filter and retained Result", async () => {
    await runRecastProviderOperationV1(async () => {
      if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
      const result = generateRetainedTiledNavMeshV1(
        PLANE_POSITIONS,
        COUNTER_CLOCKWISE_INDICES,
        mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
          createRecastTestEnvelopeV1(),
        ),
      );
      expect(result.success).toBe(true);
      if (!result.success) {
        destroyRecastTiledOperationResourcesV1(undefined, result);
        return;
      }
      const queryProviderReceipt = createRecastQueryProviderV1(result.navMesh);
      const destroyProviderResources = (providerLifecycleModule as {
        destroyRecastProviderOperationResourcesV1?: (receipt: {
          queryProviderReceipt: typeof queryProviderReceipt;
          tiledResult: typeof result;
        }) => void;
      }).destroyRecastProviderOperationResourcesV1;
      expect(typeof destroyProviderResources).toBe("function");
      if (destroyProviderResources === undefined) {
        destroyRecastTiledOperationResourcesV1(undefined, result);
        return;
      }
      const order: string[] = [];
      const queryPrototype = Raw.Module.NavMeshQuery.prototype;
      const originalNativeQueryDestroy = queryPrototype.destroy;
      const originalRawDestroy = Raw.destroy;
      const originalNavMeshDestroy = result.navMesh.destroy.bind(result.navMesh);
      queryPrototype.destroy = function destroyAndThrow() {
        order.push("raw-query-native");
        originalNativeQueryDestroy.call(this);
        throw new Error("expected-native-query-cleanup-failure");
      };
      Raw.destroy = ((resource: unknown) => {
        if (resource instanceof Raw.Module!.NavMeshQuery) {
          order.push("raw-query-wrapper");
        } else if (resource instanceof Raw.Module!.dtQueryFilter) {
          order.push("query-filter");
        }
        originalRawDestroy(resource as never);
      }) as typeof Raw.destroy;
      result.navMesh.destroy = () => {
        order.push("navmesh");
        originalNavMeshDestroy();
      };
      const receipt = { queryProviderReceipt, tiledResult: result };
      try {
        expect(() => destroyProviderResources(receipt)).toThrow(
          "TRAVERSAL_RECAST_PROVIDER_OPERATION_CLEANUP_FAILED",
        );
        const afterFirstCleanup = [...order];
        expect(() => destroyProviderResources(receipt)).not.toThrow();
        expect(order).toEqual(afterFirstCleanup);
      } finally {
        Raw.destroy = originalRawDestroy;
        queryPrototype.destroy = originalNativeQueryDestroy;
      }
      expect(order).toEqual([
        "raw-query-native",
        "raw-query-wrapper",
        "query-filter",
        "navmesh",
      ]);
    });
  });

  it("keeps the unlabelled low Box top queryable as the real pre-patch RED", async () => {
    await runRecastProviderOperationV1(async () => {
      const source = planeWithBox(0.2);
      const result = generateRetainedTiledNavMeshV1(
        source.positions,
        source.indices,
        mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
          createRecastTestEnvelopeV1(),
        ),
      );
      try {
        expect(result.success).toBe(true);
        if (!result.success) return;
        const [positions, indices] = getNavMeshPositionsAndIndices(result.navMesh);
        expect(hasInteriorBoxTopTriangle(positions, indices, 0.05)).toBe(true);
      } finally {
        destroyRecastTiledOperationResourcesV1(undefined, result);
      }
    });
  });

  it("removes a low Box top when terrain/blocker source areas are enabled", async () => {
    await runRecastProviderOperationV1(async () => {
      const source = planeWithBox(0.2);
      const sourceOptions = {
        bounds: [[0, 0, 0], [4, 0.2, 4]],
        sourceAreaMode: {
          kind: "terrain-with-static-blockers-r1",
          terrainVertexCount: PLANE_POSITIONS.length / 3,
          blockerAreaId: 1,
        },
      } as const;
      const result = generateRetainedTiledNavMeshV1(
        source.positions,
        source.indices,
        mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
          createRecastTestEnvelopeV1(),
        ),
        sourceOptions,
      );
      try {
        expect(result.success).toBe(true);
        if (!result.success) return;
        const [positions, indices] = getNavMeshPositionsAndIndices(result.navMesh);
        expect(hasInteriorBoxTopTriangle(positions, indices, 0.05)).toBe(false);
        expect(positions.length).toBeGreaterThan(0);
      } finally {
        destroyRecastTiledOperationResourcesV1(undefined, result);
      }
    });
  });

  it("keeps a bound Box top walkable while removing an equal unbound Box top", async () => {
    await runRecastProviderOperationV1(async () => {
      const positions: number[] = [];
      const indices: number[] = [];
      const boundBox = appendBoxSource(positions, indices, {
        minimumX: 0,
        maximumX: 3,
        minimumZ: 0,
        maximumZ: 3,
        bottomMeters: 0,
        topMeters: 0.2,
      });
      appendBoxSource(positions, indices, {
        minimumX: 5,
        maximumX: 8,
        minimumZ: 0,
        maximumZ: 3,
        bottomMeters: 0,
        topMeters: 0.2,
      });
      const result = generateTiledNavMesh(
        positions,
        indices,
        {
          ...mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
          bounds: [[0, 0, 0], [8, 0.2, 3]],
          sourceAreaMode: {
            kind: "layered-traversal-sources-r1b",
            candidateSourceRanges: [{
              traversalSurfaceOrdinal: 0,
              ...boundBox,
            }],
            blockerStartVertexIndex: boundBox.vertexCount,
          },
        } as never,
        true,
      );
      let queryProviderReceipt: RecastQueryProviderReceiptV1 | undefined;
      try {
        expect(result.success).toBe(true);
        if (!result.success) return;
        const [navPositions, navIndices] = getNavMeshPositionsAndIndices(
          result.navMesh,
        );
        expect(hasInteriorTopTriangleAtX(
          navPositions,
          navIndices,
          0.5,
          2.5,
          0.05,
        )).toBe(true);
        expect(hasInteriorTopTriangleAtX(
          navPositions,
          navIndices,
          5.5,
          7.5,
          0.05,
        )).toBe(false);
        expect([...new Set(snapshotProviderPolygons(result.navMesh).map(
          (polygon) => polygon.area,
        ))]).toEqual([2]);
        queryProviderReceipt = createRecastQueryProviderV1(result.navMesh);
        expect(findNearestRecastPolygonV1(queryProviderReceipt, {
          positionMetersXYZ: [1.5, 0.2, 1.5],
          halfExtentsMetersXYZ: [0.4, 0.5, 0.4],
        }).kind).toBe("complete");
        expect(findNearestRecastPolygonV1(queryProviderReceipt, {
          positionMetersXYZ: [6.5, 0.2, 1.5],
          halfExtentsMetersXYZ: [0.4, 0.5, 0.4],
        }).kind).toBe("miss");
      } finally {
        if (queryProviderReceipt !== undefined) {
          destroyRecastQueryProviderV1(queryProviderReceipt);
        }
        destroyRecastTiledOperationResourcesV1(undefined, result);
      }
    });
  });

  it("keeps adjacent coplanar bound Box tops in distinct Provider source polygons", async () => {
    await runRecastProviderOperationV1(async () => {
      const positions: number[] = [];
      const indices: number[] = [];
      const leftBox = appendBoxSource(positions, indices, {
        minimumX: 0,
        maximumX: 3,
        minimumZ: 0,
        maximumZ: 3,
        bottomMeters: 0,
        topMeters: 0.2,
      });
      const rightBox = appendBoxSource(positions, indices, {
        minimumX: 3,
        maximumX: 6,
        minimumZ: 0,
        maximumZ: 3,
        bottomMeters: 0,
        topMeters: 0.2,
      });
      const result = generateTiledNavMesh(
        positions,
        indices,
        {
          ...mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
          bounds: [[0, 0, 0], [6, 0.2, 3]],
          sourceAreaMode: {
            kind: "layered-traversal-sources-r1b",
            candidateSourceRanges: [
              { traversalSurfaceOrdinal: 0, ...leftBox },
              { traversalSurfaceOrdinal: 1, ...rightBox },
            ],
            blockerStartVertexIndex:
              leftBox.vertexCount + rightBox.vertexCount,
          },
        } as never,
        true,
      );
      let queryProviderReceipt: RecastQueryProviderReceiptV1 | undefined;
      try {
        expect(result.success).toBe(true);
        if (!result.success) return;
        const polygons = snapshotProviderPolygons(result.navMesh);
        expect([...new Set(polygons.map((polygon) => polygon.area))].sort(
          (left, right) => left - right,
        )).toEqual([2, 3]);
        expect(polygons.some((polygon) => {
          const xCoordinates = polygon.verticesMetersXYZ.map(
            (vertex) => vertex[0],
          );
          return Math.min(...xCoordinates) < 3 && Math.max(...xCoordinates) > 3;
        })).toBe(false);
        queryProviderReceipt = createRecastQueryProviderV1(result.navMesh);
        for (const positionMetersXYZ of [
          [1.5, 0.2, 1.5],
          [4.5, 0.2, 1.5],
        ] as const) {
          expect(findNearestRecastPolygonV1(queryProviderReceipt, {
            positionMetersXYZ,
            halfExtentsMetersXYZ: [0.4, 0.5, 0.4],
          }).kind).toBe("complete");
        }
      } finally {
        if (queryProviderReceipt !== undefined) {
          destroyRecastQueryProviderV1(queryProviderReceipt);
        }
        destroyRecastTiledOperationResourcesV1(undefined, result);
      }
    });
  });

  it("does not relabel slope-incompatible candidate faces as walkable", async () => {
    await runRecastProviderOperationV1(async () => {
      const positions = [
        0, 0, 0,
        0, 0, 4,
        2, 5, 0,
        2, 5, 4,
      ];
      const result = generateTiledNavMesh(
        positions,
        COUNTER_CLOCKWISE_INDICES,
        {
          ...mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
          bounds: [[0, 0, 0], [2, 5, 4]],
          sourceAreaMode: {
            kind: "layered-traversal-sources-r1b",
            candidateSourceRanges: [{
              traversalSurfaceOrdinal: 0,
              startVertexIndex: 0,
              vertexCount: positions.length / 3,
            }],
            blockerStartVertexIndex: positions.length / 3,
          },
        } as never,
        true,
      );
      try {
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(snapshotProviderPolygons(result.navMesh)).toEqual([]);
      } finally {
        destroyRecastTiledOperationResourcesV1(undefined, result);
      }
    });
  });

  it.each([
    {
      name: "mixed-range triangle",
      positions: [
        0, 0, 0,
        0, 0, 1,
        1, 0, 0,
        1, 0, 1,
        2, 0, 0,
        2, 0, 1,
      ],
      indices: [0, 1, 3],
      mode: {
        kind: "layered-traversal-sources-r1b",
        candidateSourceRanges: [
          { traversalSurfaceOrdinal: 0, startVertexIndex: 0, vertexCount: 3 },
          { traversalSurfaceOrdinal: 1, startVertexIndex: 3, vertexCount: 3 },
        ],
        blockerStartVertexIndex: 6,
      },
      error: "triangle crosses a candidate source range boundary",
    },
    {
      name: "overlapping ranges",
      positions: PLANE_POSITIONS,
      indices: COUNTER_CLOCKWISE_INDICES,
      mode: {
        kind: "layered-traversal-sources-r1b",
        candidateSourceRanges: [
          { traversalSurfaceOrdinal: 0, startVertexIndex: 0, vertexCount: 3 },
          { traversalSurfaceOrdinal: 1, startVertexIndex: 2, vertexCount: 2 },
        ],
        blockerStartVertexIndex: 4,
      },
      error: "candidate source ranges must be contiguous and non-overlapping",
    },
    {
      name: "unsorted ordinals",
      positions: PLANE_POSITIONS,
      indices: COUNTER_CLOCKWISE_INDICES,
      mode: {
        kind: "layered-traversal-sources-r1b",
        candidateSourceRanges: [
          { traversalSurfaceOrdinal: 1, startVertexIndex: 0, vertexCount: 2 },
          { traversalSurfaceOrdinal: 0, startVertexIndex: 2, vertexCount: 2 },
        ],
        blockerStartVertexIndex: 4,
      },
      error: "traversalSurfaceOrdinal must equal candidate range order",
    },
    {
      name: "out-of-bounds range",
      positions: PLANE_POSITIONS,
      indices: COUNTER_CLOCKWISE_INDICES,
      mode: {
        kind: "layered-traversal-sources-r1b",
        candidateSourceRanges: [
          { traversalSurfaceOrdinal: 0, startVertexIndex: 0, vertexCount: 5 },
        ],
        blockerStartVertexIndex: 4,
      },
      error: "candidate source range exceeds blockerStartVertexIndex",
    },
    {
      name: "unknown mode field",
      positions: PLANE_POSITIONS,
      indices: COUNTER_CLOCKWISE_INDICES,
      mode: {
        kind: "layered-traversal-sources-r1b",
        candidateSourceRanges: [
          { traversalSurfaceOrdinal: 0, startVertexIndex: 0, vertexCount: 4 },
        ],
        blockerStartVertexIndex: 4,
        unsupported: true,
      },
      error: "sourceAreaMode fields must be closed",
    },
    {
      name: "unknown range field",
      positions: PLANE_POSITIONS,
      indices: COUNTER_CLOCKWISE_INDICES,
      mode: {
        kind: "layered-traversal-sources-r1b",
        candidateSourceRanges: [
          {
            traversalSurfaceOrdinal: 0,
            startVertexIndex: 0,
            vertexCount: 4,
            unsupported: true,
          },
        ],
        blockerStartVertexIndex: 4,
      },
      error: "candidate source range fields must be closed",
    },
  ])("rejects layered source validation case: $name", async ({
    positions,
    indices,
    mode,
    error,
  }) => {
    await runRecastProviderOperationV1(async () => {
      expect(() => generateTiledNavMesh(
        positions,
        indices,
        {
          ...mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
          sourceAreaMode: mode,
        } as never,
        true,
      )).toThrow(error);
    });
  });

  it("rejects a 62nd layered candidate range before Provider allocation", async () => {
    await runRecastProviderOperationV1(async () => {
      if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
      const candidateSourceRanges = Array.from({ length: 62 }, (_, index) => ({
        traversalSurfaceOrdinal: index,
        startVertexIndex: index * 3,
        vertexCount: 3,
      }));
      const positions = candidateSourceRanges.flatMap((range) => [
        range.traversalSurfaceOrdinal * 2, 0, 0,
        range.traversalSurfaceOrdinal * 2, 0, 1,
        range.traversalSurfaceOrdinal * 2 + 1, 0, 0,
      ]);
      const indices = Array.from(
        { length: candidateSourceRanges.length * 3 },
        (_, index) => index,
      );
      const rawModule = Raw.Module as unknown as Record<string, unknown>;
      const originalBuildContextImplementation = rawModule.RecastBuildContextJsImpl as
        new (...args: never[]) => object;
      let allocationCount = 0;
      rawModule.RecastBuildContextJsImpl = new Proxy(
        originalBuildContextImplementation,
        {
          construct(target, argumentsList, newTarget) {
            allocationCount += 1;
            return Reflect.construct(target, argumentsList, newTarget);
          },
        },
      );
      try {
        expect(() => generateTiledNavMesh(
          positions,
          indices,
          {
            ...mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
              createRecastTestEnvelopeV1(),
            ),
            sourceAreaMode: {
              kind: "layered-traversal-sources-r1b",
              candidateSourceRanges,
              blockerStartVertexIndex: positions.length / 3,
            },
          } as never,
          true,
        )).toThrow("candidateSourceRanges must contain at most 61 ranges");
        expect(allocationCount).toBe(0);
      } finally {
        rawModule.RecastBuildContextJsImpl = originalBuildContextImplementation;
      }
    });
  });

  it("does not leak a sub-voxel blocker into queryable polygons", async () => {
    await runRecastProviderOperationV1(async () => {
      const source = planeWithBox(0.05);
      const result = generateTiledNavMesh(
        source.positions,
        source.indices,
        {
          ...mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
          bounds: [[0, 0, 0], [4, 0.05, 4]],
          sourceAreaMode: {
            kind: "terrain-with-static-blockers-r1",
            terrainVertexCount: PLANE_POSITIONS.length / 3,
            blockerAreaId: 1,
          },
        } as const,
        true,
      );
      try {
        expect(result.success).toBe(true);
        if (!result.success) return;
        const [positions, indices] = getNavMeshPositionsAndIndices(result.navMesh);
        expect(hasInteriorBoxTopTriangle(positions, indices, 0.01)).toBe(false);
        expect(positions.length).toBeGreaterThan(0);
      } finally {
        destroyRecastTiledOperationResourcesV1(undefined, result);
      }
    });
  });

  it("preserves sufficient overhead clearance and removes insufficient terrain", async () => {
    await runRecastProviderOperationV1(async () => {
      const config = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
        createRecastTestEnvelopeV1(),
      );
      const terrainVertexCount = PLANE_POSITIONS.length / 3;
      const build = (bottomMeters: number) => {
        const source = planeWithBox(0.2, bottomMeters);
        const result = generateRetainedTiledNavMeshV1(
          source.positions,
          source.indices,
          config,
          {
            bounds: [[0, 0, 0], [4, bottomMeters + 0.2, 4]],
            sourceAreaMode: {
              kind: "terrain-with-static-blockers-r1",
              terrainVertexCount,
              blockerAreaId: 1,
            },
          },
        );
        let queryProviderReceipt: RecastQueryProviderReceiptV1 | undefined;
        try {
          expect(result.success).toBe(true);
          if (!result.success) return false;
          queryProviderReceipt = createRecastQueryProviderV1(result.navMesh);
          return findNearestRecastPolygonV1(queryProviderReceipt, {
            positionMetersXYZ: [2, 0.2, 2],
            halfExtentsMetersXYZ: [0.1, 3, 0.1],
          }).kind === "complete";
        } finally {
          if (queryProviderReceipt !== undefined) {
            destroyRecastQueryProviderV1(queryProviderReceipt);
          }
          destroyRecastTiledOperationResourcesV1(undefined, result);
        }
      };
      expect(build(2.5)).toBe(true);
      expect(build(1)).toBe(false);
    });
  });


  it("globally rejects a mixed-source triangle outside explicit bounds before allocation", async () => {
    await runRecastProviderOperationV1(async () => {
      if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
      const rawModule = Raw.Module as unknown as Record<string, unknown>;
      const originalBuildContextImplementation = rawModule.RecastBuildContextJsImpl as
        new (...args: never[]) => object;
      let allocationCount = 0;
      rawModule.RecastBuildContextJsImpl = new Proxy(
        originalBuildContextImplementation,
        {
          construct(target, argumentsList, newTarget) {
            allocationCount += 1;
            return Reflect.construct(target, argumentsList, newTarget);
          },
        },
      );
      try {
        expect(() => generateTiledNavMesh(
          [
            ...PLANE_POSITIONS,
            100, 0, 100,
            101, 0, 100,
            100, 0, 101,
          ],
          [
            ...COUNTER_CLOCKWISE_INDICES,
            0, 4, 5,
          ],
          {
            ...mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
              createRecastTestEnvelopeV1(),
            ),
            bounds: [[0, 0, 0], [4, 1, 4]],
            sourceAreaMode: {
              kind: "terrain-with-static-blockers-r1",
              terrainVertexCount: PLANE_POSITIONS.length / 3,
              blockerAreaId: 1,
            },
          },
          true,
        )).toThrow("triangle crosses the terrain vertex boundary");
        expect(allocationCount).toBe(0);
      } finally {
        rawModule.RecastBuildContextJsImpl = originalBuildContextImplementation;
      }
    });
  });

  it("rejects a terrain-only source-area boundary and unknown mode fields", async () => {
    await runRecastProviderOperationV1(async () => {
      const config = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
        createRecastTestEnvelopeV1(),
      );
      expect(() => generateTiledNavMesh(
        PLANE_POSITIONS,
        COUNTER_CLOCKWISE_INDICES,
        {
          ...config,
          sourceAreaMode: {
            kind: "terrain-with-static-blockers-r1",
            terrainVertexCount: PLANE_POSITIONS.length / 3,
            blockerAreaId: 1,
          },
        },
        true,
      )).toThrow("terrainVertexCount must be strictly inside merged vertices");
      expect(() => generateTiledNavMesh(
        [...PLANE_POSITIONS, 5, 0, 5],
        COUNTER_CLOCKWISE_INDICES,
        {
          ...config,
          sourceAreaMode: {
            kind: "terrain-with-static-blockers-r1",
            terrainVertexCount: PLANE_POSITIONS.length / 3,
            blockerAreaId: 1,
            unsupported: true,
          },
        } as never,
        true,
      )).toThrow("sourceAreaMode fields must be closed");
    });
  });

  it("direct Tile validation precedes its default build-context allocation", async () => {
    await runRecastProviderOperationV1(async () => {
      if (Raw.Module === undefined) throw new Error("expected initialized Raw module");
      const positions = new VerticesArray();
      const indices = new TrianglesArray();
      const chunkyTriMesh = new RecastChunkyTriMesh();
      const mergedPositions = [
        ...PLANE_POSITIONS,
        100, 0, 100,
        101, 0, 100,
        100, 0, 101,
      ];
      const mixedIndices = [...COUNTER_CLOCKWISE_INDICES, 0, 4, 5];
      positions.copy(mergedPositions);
      indices.copy(mixedIndices);
      expect(chunkyTriMesh.init(
        positions,
        indices,
        mixedIndices.length / 3,
        128,
      )).toBe(true);
      const tiledConfig = buildTiledNavMeshRcConfig({
        recastConfig: mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
          createRecastTestEnvelopeV1(),
        ),
        navMeshBounds: [[0, 0, 0], [4, 1, 4]],
      });
      const rawModule = Raw.Module as unknown as Record<string, unknown>;
      const originalBuildContextImplementation = rawModule.RecastBuildContextJsImpl as
        new (...args: never[]) => object;
      let allocationCount = 0;
      rawModule.RecastBuildContextJsImpl = new Proxy(
        originalBuildContextImplementation,
        {
          construct(target, argumentsList, newTarget) {
            allocationCount += 1;
            return Reflect.construct(target, argumentsList, newTarget);
          },
        },
      );
      try {
        expect(() => generateTileNavMeshData(
          positions,
          indices,
          tiledConfig.config,
          chunkyTriMesh,
          { x: 0, y: 0, bmin: [0, 0, 0], bmax: [4, 1, 4] },
          {
            sourceAreaMode: {
              kind: "terrain-with-static-blockers-r1",
              terrainVertexCount: PLANE_POSITIONS.length / 3,
              blockerAreaId: 1,
            },
          },
          true,
        )).toThrow("triangle crosses the terrain vertex boundary");
        expect(allocationCount).toBe(0);
      } finally {
        rawModule.RecastBuildContextJsImpl = originalBuildContextImplementation;
        Raw.destroy(tiledConfig.config);
        Raw.destroy(chunkyTriMesh.raw);
        indices.destroy();
        positions.destroy();
      }
    });
  });



  it("keeps repeated real provider initialization idempotent", async () => {
    await expect(init()).resolves.toBeUndefined();
    await expect(init()).resolves.toBeUndefined();
  });

  it("retains owned intermediates and destroys query before navmesh", async () => {
    await runRecastProviderOperationV1(async () => {
      let result: ReturnType<typeof generateRetainedTiledNavMeshV1> | undefined;
      let query: NavMeshQuery | undefined;
      try {
        result = generateRetainedTiledNavMeshV1(
          PLANE_POSITIONS,
          COUNTER_CLOCKWISE_INDICES,
          mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
        );
        expect(result.success).toBe(true);
        expect(result.intermediates.chunkyTriMesh).toBeDefined();
        if (!result.success) return;

        const order: string[] = [];
        query = new NavMeshQuery(result.navMesh);
        const originalQueryDestroy = query.destroy.bind(query);
        const originalNavMeshDestroy = result.navMesh.destroy.bind(
          result.navMesh,
        );
        query.destroy = () => {
          order.push("query");
          originalQueryDestroy();
        };
        result.navMesh.destroy = () => {
          order.push("navmesh");
          originalNavMeshDestroy();
        };

        const ownedResult = result;
        const ownedQuery = query;
        result = undefined;
        query = undefined;
        destroyRecastTiledOperationResourcesV1(ownedQuery, ownedResult);
        expect(order).toEqual(["query", "navmesh"]);
      } finally {
        if (result !== undefined) {
          destroyRecastTiledOperationResourcesV1(query, result);
        }
      }
    });
  });

  it("continues reverse cleanup and aggregates an earlier destroy failure", async () => {
    await runRecastProviderOperationV1(async () => {
      const order: string[] = [];
      const releasedResources = new WeakSet<object>();
      const releaseOnce = <T>(
        resource: object,
        operation: () => T,
        label?: string,
      ): T => {
        if (releasedResources.has(resource)) {
          if (label !== undefined) order.push(`duplicate:${label}`);
          throw new Error(`duplicate-release:${label ?? "raw"}`);
        }
        releasedResources.add(resource);
        if (label !== undefined) order.push(label);
        return operation();
      };
      const rawRecast = Raw.Recast as unknown as Record<
        string,
        (resource: unknown) => unknown
      >;
      const freeMethodNames = [
        "freeHeightfield",
        "freeCompactHeightfield",
        "freeContourSet",
        "freePolyMesh",
        "freePolyMeshDetail",
      ] as const;
      const originalFreeMethods = Object.fromEntries(freeMethodNames.map(
        (methodName) => [methodName, rawRecast[methodName]],
      )) as Record<(typeof freeMethodNames)[number], (resource: unknown) => unknown>;
      const originalRawDestroy = Raw.destroy;
      let result: ReturnType<typeof generateRetainedTiledNavMeshV1> | undefined;
      let query: NavMeshQuery | undefined;
      try {
        result = generateRetainedTiledNavMeshV1(
          PLANE_POSITIONS,
          COUNTER_CLOCKWISE_INDICES,
          mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
        );
        expect(result.success).toBe(true);
        if (!result.success) return;

        query = new NavMeshQuery(result.navMesh);
        const queryResource = query;
        const navMeshResource = result.navMesh;
        const buildContextResource = result.intermediates.buildContext;
        const chunkyTriMeshRaw = result.intermediates.chunkyTriMesh?.raw;
        expect(chunkyTriMeshRaw).toBeDefined();
        const originalQueryDestroy = query.destroy.bind(query);
        const originalNavMeshDestroy = result.navMesh.destroy.bind(
          result.navMesh,
        );
        const originalBuildContextDestroy =
          result.intermediates.buildContext.destroy.bind(
            result.intermediates.buildContext,
          );
        for (const methodName of freeMethodNames) {
          rawRecast[methodName] = (resource: unknown) => {
            return releaseOnce(
              resource as object,
              () => originalFreeMethods[methodName].apply(Raw.Recast, [resource]),
              methodName,
            );
          };
        }
        Raw.destroy = ((resource: unknown) => {
          releaseOnce(
            resource as object,
            () => originalRawDestroy(resource as never),
            resource === chunkyTriMeshRaw ? "chunkyTriMesh" : undefined,
          );
        }) as typeof Raw.destroy;
        query.destroy = () => {
          releaseOnce(queryResource, () => {
            originalQueryDestroy();
            throw new Error("expected-query-destroy-failure");
          }, "query");
        };
        result.navMesh.destroy = () => {
          releaseOnce(navMeshResource, originalNavMeshDestroy, "navMesh");
        };
        result.intermediates.buildContext.destroy = () => {
          releaseOnce(
            buildContextResource,
            originalBuildContextDestroy,
            "buildContext",
          );
        };

        const ownedResult = result;
        const ownedQuery = query;
        result = undefined;
        query = undefined;
        expect(() => destroyRecastTiledOperationResourcesV1(
          ownedQuery,
          ownedResult,
        )).toThrow("TRAVERSAL_RECAST_RESOURCE_CLEANUP_FAILED");
        expect(order).toEqual([
          "query",
          "freePolyMeshDetail",
          "freePolyMesh",
          "freeContourSet",
          "freeCompactHeightfield",
          "freeHeightfield",
          "chunkyTriMesh",
          "navMesh",
          "buildContext",
        ]);
        const orderAfterFirstCleanup = [...order];
        expect(() => destroyRecastTiledOperationResourcesV1(
          ownedQuery,
          ownedResult,
        )).not.toThrow();
        expect(order).toEqual(orderAfterFirstCleanup);
      } finally {
        Raw.destroy = originalRawDestroy;
        for (const methodName of freeMethodNames) {
          rawRecast[methodName] = originalFreeMethods[methodName];
        }
        if (result !== undefined) {
          destroyRecastTiledOperationResourcesV1(query, result);
        }
      }
    });
  });

  it("builds a non-empty plane through the Node provider", async () => {
    const result = await generatePlane(COUNTER_CLOCKWISE_INDICES);

    expect(result.success).toBe(true);
    expect(result.positions.length).toBeGreaterThan(0);
    expect(result.indices.length).toBeGreaterThan(0);
  });

  it("locks the unpatched 0.43.1 plane output before lifecycle-only patches", async () => {
    const result = await generatePlane(COUNTER_CLOCKWISE_INDICES);

    expect(result.success).toBe(true);
    expect(sha256Bytes(packNavMeshOutputV1(
      result.positions,
      result.indices,
    ))).toBe(UNPATCHED_RECAST_0431_PLANE_OUTPUT_HASH);
  });

  it("releases discarded intermediates on the non-production false path", async () => {
    await runRecastProviderOperationV1(() => {
      const releaseCounts = new Map<string, number>();
      const recordRelease = (operation: string) => {
        releaseCounts.set(operation, (releaseCounts.get(operation) ?? 0) + 1);
      };
      const rawRecast = Raw.Recast as unknown as Record<
        string,
        (resource: unknown) => unknown
      >;
      const freeMethodNames = [
        "freeHeightfield",
        "freeCompactHeightfield",
        "freeContourSet",
        "freePolyMesh",
        "freePolyMeshDetail",
      ] as const;
      const originalFreeMethods = Object.fromEntries(freeMethodNames.map(
        (methodName) => [methodName, rawRecast[methodName]],
      )) as Record<(typeof freeMethodNames)[number], (resource: unknown) => unknown>;
      const originalRawDestroy = Raw.destroy;
      for (const methodName of freeMethodNames) {
        rawRecast[methodName] = (resource: unknown) => {
          recordRelease(methodName);
          return originalFreeMethods[methodName].apply(Raw.Recast, [resource]);
        };
      }
      Raw.destroy = ((resource: unknown) => {
        if (snapshotRawDestroyEvent(resource).className === "rcChunkyTriMesh") {
          recordRelease("chunkyTriMesh");
        }
        originalRawDestroy(resource as never);
      }) as typeof Raw.destroy;

      let result: ReturnType<typeof generateTiledNavMesh> | undefined;
      try {
        result = generateTiledNavMesh(
          PLANE_POSITIONS,
          COUNTER_CLOCKWISE_INDICES,
          mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
          false,
        );
        expect(result.success).toBe(true);
        expect(result.intermediates.chunkyTriMesh).toBeUndefined();
        for (const tile of result.intermediates.tileIntermediates) {
          expect(tile.heightfield).toBeUndefined();
          expect(tile.compactHeightfield).toBeUndefined();
          expect(tile.contourSet).toBeUndefined();
          expect(tile.polyMesh).toBeUndefined();
          expect(tile.polyMeshDetail).toBeUndefined();
        }
        for (const operation of [...freeMethodNames, "chunkyTriMesh"]) {
          expect(releaseCounts.get(operation)).toBe(1);
        }
      } finally {
        Raw.destroy = originalRawDestroy;
        for (const methodName of freeMethodNames) {
          rawRecast[methodName] = originalFreeMethods[methodName];
        }
        if (result !== undefined) {
          const ownedResult = result;
          result = undefined;
          destroyRecastTiledOperationResourcesV1(undefined, ownedResult);
        }
      }
    });
  });

  it("releases every generator-local wrapper on retained success", async () => {
    await runRecastProviderOperationV1(() => {
      const destroyEvents: RawDestroyEvent[] = [];
      const originalDestroy = Raw.destroy;
      let result: ReturnType<typeof generateRetainedTiledNavMeshV1> | undefined;
      Raw.destroy = ((raw: unknown) => {
        destroyEvents.push(snapshotRawDestroyEvent(raw));
        originalDestroy(raw as never);
      }) as typeof Raw.destroy;
      try {
        result = generateRetainedTiledNavMeshV1(
          PLANE_POSITIONS,
          COUNTER_CLOCKWISE_INDICES,
          mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
        );
        expect(result.success).toBe(true);
        const expectDestroyCount = (
          expected: Partial<RawDestroyEvent>,
          count: number,
        ) => {
          expect(destroyEvents.filter((event) =>
            Object.entries(expected).every(([key, value]) =>
              event[key as keyof RawDestroyEvent] === value
            )
          )).toHaveLength(count);
        };
        expectDestroyCount({
          className: "FloatArray",
          size: PLANE_POSITIONS.length,
          isView: false,
        }, 1);
        expectDestroyCount({
          className: "IntArray",
          size: COUNTER_CLOCKWISE_INDICES.length,
          isView: false,
        }, 1);
        expectDestroyCount({
          className: "IntArray",
          size: 512,
          isView: false,
        }, 1);
        expectDestroyCount({ className: "IntArray", isView: true }, 1);
        expectDestroyCount({
          className: "UnsignedCharArray",
          size: COUNTER_CLOCKWISE_INDICES.length / 3,
          isView: false,
        }, 2);
        expectDestroyCount({ className: "RecastCalcGridSizeResult" }, 1);
        expectDestroyCount({ className: "CreateNavMeshDataResult" }, 1);
        expectDestroyCount({ className: "rcConfig" }, 2);
        expectDestroyCount({ className: "dtNavMeshParams" }, 1);
        expectDestroyCount({ className: "dtNavMeshCreateParams" }, 1);
        expectDestroyCount({ className: "NavMeshRemoveTileResult" }, 1);
        expectDestroyCount({
          className: "UnsignedCharArray",
          isView: true,
        }, 1);
        expect(typeof (result.intermediates.buildContext as unknown as {
          destroy?: unknown;
        }).destroy).toBe("function");
      } finally {
        Raw.destroy = originalDestroy;
        if (result !== undefined) {
          const ownedResult = result;
          result = undefined;
          destroyRecastTiledOperationResourcesV1(undefined, ownedResult);
        }
      }
    });
  });

  it("keeps retained resources alive until one ordered SDK cleanup", async () => {
    await runRecastProviderOperationV1(() => {
      const releaseEvents: ResourceReleaseEvent[] = [];
      const releasedResources = new WeakSet<object>();
      const assertFirstRelease = (resource: object) => {
        if (releasedResources.has(resource)) {
          throw new Error("duplicate-retained-resource-release");
        }
        releasedResources.add(resource);
      };
      let phase: ResourceReleasePhase = "generator";
      const originalRawDestroy = Raw.destroy;
      const originalNavMeshDestroy = NavMesh.prototype.destroy;
      const rawRecast = Raw.Recast as unknown as Record<
        string,
        (resource: unknown) => unknown
      >;
      const freeMethodNames = [
        "freeHeightfield",
        "freeCompactHeightfield",
        "freeContourSet",
        "freePolyMesh",
        "freePolyMeshDetail",
      ] as const;
      const originalFreeMethods = Object.fromEntries(freeMethodNames.map(
        (methodName) => [methodName, rawRecast[methodName]],
      )) as Record<(typeof freeMethodNames)[number], (resource: unknown) => unknown>;
      const pointerOf = (resource: unknown) => Raw.Module.getPointer(resource);

      Raw.destroy = ((resource: unknown) => {
        assertFirstRelease(resource as object);
        releaseEvents.push({
          operation: "Raw.destroy",
          phase,
          pointer: pointerOf(resource),
          resource,
        });
        originalRawDestroy(resource as never);
      }) as typeof Raw.destroy;
      for (const methodName of freeMethodNames) {
        rawRecast[methodName] = (resource: unknown) => {
          assertFirstRelease(resource as object);
          releaseEvents.push({
            operation: methodName,
            phase,
            pointer: pointerOf(resource),
            resource,
          });
          return originalFreeMethods[methodName].apply(Raw.Recast, [resource]);
        };
      }
      NavMesh.prototype.destroy = function () {
        assertFirstRelease(this.raw);
        releaseEvents.push({
          operation: "NavMesh.destroy",
          phase,
          pointer: pointerOf(this.raw),
          resource: this.raw,
        });
        return originalNavMeshDestroy.call(this);
      };

      let result: ReturnType<typeof generateRetainedTiledNavMeshV1> | undefined;
      try {
        result = generateRetainedTiledNavMeshV1(
          PLANE_POSITIONS,
          COUNTER_CLOCKWISE_INDICES,
          mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
        );
        expect(result.success).toBe(true);
        if (!result.success) return;

        const tile = result.intermediates.tileIntermediates[0];
        const chunkyTriMesh = result.intermediates.chunkyTriMesh;
        expect(tile).toBeDefined();
        expect(chunkyTriMesh).toBeDefined();
        if (tile === undefined || chunkyTriMesh === undefined) return;

        const retainedResources = ([
          ["freeHeightfield", tile.heightfield?.raw],
          ["freeCompactHeightfield", tile.compactHeightfield?.raw],
          ["freeContourSet", tile.contourSet?.raw],
          ["freePolyMesh", tile.polyMesh?.raw],
          ["freePolyMeshDetail", tile.polyMeshDetail?.raw],
          ["Raw.destroy", chunkyTriMesh.raw],
          ["Raw.destroy", result.intermediates.buildContext.raw],
          [
            "Raw.destroy",
            (result.intermediates.buildContext as unknown as {
              readonly impl: unknown;
            }).impl,
          ],
          ["NavMesh.destroy", result.navMesh.raw],
        ] as const).map(([operation, resource]) => ({
          operation,
          resource,
          pointer: resource === undefined ? undefined : pointerOf(resource),
        }));
        for (const { operation, resource } of retainedResources) {
          expect(resource).toBeDefined();
          if (resource === undefined) continue;
          expect(releaseEvents.filter((event) =>
            event.phase === "generator" &&
            event.operation === operation &&
            event.resource === resource
          )).toHaveLength(0);
        }

        phase = "sdk";
        const ownedResult = result;
        result = undefined;
        destroyRecastTiledOperationResourcesV1(undefined, ownedResult);
        for (const { operation, pointer, resource } of retainedResources) {
          if (resource === undefined || pointer === undefined) continue;
          expect(releaseEvents.filter((event) =>
            event.phase === "sdk" &&
            event.operation === operation &&
            event.pointer === pointer &&
            event.resource === resource
          )).toHaveLength(1);
        }
        const releaseEventCountAfterFirstCleanup = releaseEvents.length;
        expect(() => destroyRecastTiledOperationResourcesV1(
          undefined,
          ownedResult,
        )).not.toThrow();
        expect(releaseEvents).toHaveLength(releaseEventCountAfterFirstCleanup);
      } finally {
        Raw.destroy = originalRawDestroy;
        for (const methodName of freeMethodNames) {
          rawRecast[methodName] = originalFreeMethods[methodName];
        }
        NavMesh.prototype.destroy = originalNavMeshDestroy;
        if (result !== undefined) {
          const ownedResult = result;
          result = undefined;
          destroyRecastTiledOperationResourcesV1(undefined, ownedResult);
        }
      }
    });
  });

  it("retains a later failed tile for SDK cleanup and continues the build", async () => {
    await runRecastProviderOperationV1(() => {
      const fixture = createSeparatedGridIslands();
      const rawRecast = Raw.Recast as unknown as {
        createHeightfield: (...parameters: unknown[]) => boolean;
      };
      const originalCreateHeightfield = rawRecast.createHeightfield;
      const originalAddTile = NavMesh.prototype.addTile;
      let createHeightfieldCalls = 0;
      let addTileCalls = 0;
      rawRecast.createHeightfield = (...parameters) => {
        createHeightfieldCalls += 1;
        if (createHeightfieldCalls === 2) return false;
        return originalCreateHeightfield.apply(Raw.Recast, parameters);
      };
      NavMesh.prototype.addTile = function (...parameters) {
        addTileCalls += 1;
        return originalAddTile.apply(this, parameters);
      };

      let result: ReturnType<typeof generateRetainedTiledNavMeshV1> | undefined;
      try {
        result = generateRetainedTiledNavMeshV1(
          fixture.positions,
          fixture.indices,
          mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
        );
        expect(result.success).toBe(true);
        expect(createHeightfieldCalls).toBe(3);
        expect(addTileCalls).toBe(2);
        expect(result.intermediates.tileIntermediates[1]).toMatchObject({
          x: 1,
          y: 0,
        });
        expect(result.intermediates.tileIntermediates[1]?.heightfield)
          .toBeDefined();
        expect(result.intermediates.tileIntermediates[1]?.compactHeightfield)
          .toBeUndefined();
      } finally {
        rawRecast.createHeightfield = originalCreateHeightfield;
        NavMesh.prototype.addTile = originalAddTile;
        if (result !== undefined) {
          const ownedResult = result;
          result = undefined;
          destroyRecastTiledOperationResourcesV1(undefined, ownedResult);
        }
      }
    });
  });

  it("classifies a mismatched native failure buffer cleanup error", async () => {
    await runRecastProviderOperationV1(() => {
      const rawBuilder = Raw.DetourNavMeshBuilder as unknown as {
        createNavMeshData: (parameters: unknown) => {
          success: boolean;
          navMeshData: unknown;
        };
      };
      const originalCreateNavMeshData = rawBuilder.createNavMeshData;
      const originalRawDestroy = Raw.destroy;
      let mismatchedNavMeshDataPointer: number | undefined;
      let injectedCleanupFailure = false;
      rawBuilder.createNavMeshData = function (parameters) {
        const rawResult = originalCreateNavMeshData.call(this, parameters);
        mismatchedNavMeshDataPointer = Raw.Module.getPointer(
          rawResult.navMeshData,
        );
        rawResult.success = false;
        return rawResult;
      };
      Raw.destroy = ((resource: unknown) => {
        const pointer = Raw.Module.getPointer(resource);
        originalRawDestroy(resource as never);
        if (
          !injectedCleanupFailure &&
          mismatchedNavMeshDataPointer !== undefined &&
          pointer === mismatchedNavMeshDataPointer
        ) {
          injectedCleanupFailure = true;
          throw new Error("expected-mismatched-buffer-cleanup-failure");
        }
      }) as typeof Raw.destroy;

      try {
        expect(() => generateRetainedTiledNavMeshV1(
          PLANE_POSITIONS,
          COUNTER_CLOCKWISE_INDICES,
          mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
        )).toThrow(
          "RECAST_CREATE_NAV_MESH_DATA_FAILURE_RESOURCE_CLEANUP_FAILED",
        );
        expect(injectedCleanupFailure).toBe(true);
      } finally {
        rawBuilder.createNavMeshData = originalCreateNavMeshData;
        Raw.destroy = originalRawDestroy;
      }
    });

    await expect(generatePlane(COUNTER_CLOCKWISE_INDICES)).resolves.toMatchObject({
      success: true,
    });
  });

  it("proves a deterministic ChunkyTriMesh empty tile", async () => {
    await runRecastProviderOperationV1(() => {
      const fixture = createSeparatedGridIslands();
      const originalAddTile = NavMesh.prototype.addTile;
      let addTileCalls = 0;
      NavMesh.prototype.addTile = function (...parameters) {
        addTileCalls += 1;
        return originalAddTile.apply(this, parameters);
      };
      let result: ReturnType<typeof generateRetainedTiledNavMeshV1> | undefined;
      try {
        result = generateRetainedTiledNavMeshV1(
          fixture.positions,
          fixture.indices,
          mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
        );
        expect(result.success).toBe(true);
        const chunkyTriMesh = result.intermediates.chunkyTriMesh;
        expect(chunkyTriMesh).toBeDefined();
        if (chunkyTriMesh === undefined) return;

        const leafBounds = Array.from(
          { length: chunkyTriMesh.raw.nnodes },
          (_, index) => chunkyTriMesh.nodes(index),
        ).filter((node) => node.i >= 0).map((node) => ({
          minimumXZ: [node.get_bmin(0), node.get_bmin(1)],
          maximumXZ: [node.get_bmax(0), node.get_bmax(1)],
          triangleCount: node.n,
        }));
        expect(leafBounds).toEqual([
          { minimumXZ: [0, 0], maximumXZ: [4, 4], triangleCount: 128 },
          { minimumXZ: [24, 0], maximumXZ: [28, 4], triangleCount: 128 },
        ]);

        const chunkIds = new ChunkIdsArray();
        try {
          chunkIds.resize(512);
          expect(chunkyTriMesh.getChunksOverlappingRect(
            [8.7, -0.9],
            [20.1, 10.5],
            chunkIds,
            512,
          )).toBe(0);
        } finally {
          chunkIds.destroy();
        }

        const emptyTile = result.intermediates.tileIntermediates.find(
          (tile) => tile.x === 1 && tile.y === 0,
        );
        expect(emptyTile).toBeDefined();
        expect(emptyTile?.heightfield).toBeDefined();
        expect(emptyTile?.compactHeightfield).toBeUndefined();
        expect(emptyTile?.contourSet).toBeUndefined();
        expect(emptyTile?.polyMesh).toBeUndefined();
        expect(emptyTile?.polyMeshDetail).toBeUndefined();
        expect(addTileCalls).toBe(2);
      } finally {
        NavMesh.prototype.addTile = originalAddTile;
        if (result !== undefined) {
          const ownedResult = result;
          result = undefined;
          destroyRecastTiledOperationResourcesV1(undefined, ownedResult);
        }
      }
    });
  });

  it("unwinds generator ownership after a post-transfer addTile throw", async () => {
    await runRecastProviderOperationV1(() => {
      const fixture = createSeparatedGridIslands();
      const originalAddTile = NavMesh.prototype.addTile;
      const originalDestroy = NavMesh.prototype.destroy;
      let addTileCalls = 0;
      let navMeshDestroyCalls = 0;
      NavMesh.prototype.addTile = function (...parameters) {
        const addResult = originalAddTile.apply(this, parameters);
        addTileCalls += 1;
        if (addTileCalls === 2) {
          throw new Error("expected-post-transfer-add-tile-throw");
        }
        return addResult;
      };
      NavMesh.prototype.destroy = function () {
        navMeshDestroyCalls += 1;
        return originalDestroy.call(this);
      };
      try {
        expect(() => generateRetainedTiledNavMeshV1(
          fixture.positions,
          fixture.indices,
          mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
            createRecastTestEnvelopeV1(),
          ),
        )).toThrow("expected-post-transfer-add-tile-throw");
        expect(addTileCalls).toBe(2);
        expect(navMeshDestroyCalls).toBe(1);
      } finally {
        NavMesh.prototype.addTile = originalAddTile;
        NavMesh.prototype.destroy = originalDestroy;
      }
    });

    await expect(generatePlane(COUNTER_CLOCKWISE_INDICES)).resolves.toMatchObject({
      success: true,
    });
  });

  it("does not accept reversed winding as the same walkable surface", async () => {
    const counterClockwise = await generatePlane(COUNTER_CLOCKWISE_INDICES);
    const reversed = await generatePlane(REVERSED_INDICES);

    expect(counterClockwise.positions.length).toBeGreaterThan(0);
    expect(reversed.positions.length).toBe(0);
  });

  it("serializes concurrent requests and produces deterministic output", async () => {
    const results = await Promise.all([
      generatePlane(COUNTER_CLOCKWISE_INDICES),
      generatePlane(COUNTER_CLOCKWISE_INDICES),
    ]);

    expect(results[0]).toEqual(results[1]);
    expect(results[0]?.positions.length).toBeGreaterThan(0);
  });

  it("cleans a throwing operation and permits the next real build", async () => {
    await expect(runRecastProviderOperationV1(async () => {
      const result = generateRetainedTiledNavMeshV1(
        PLANE_POSITIONS,
        COUNTER_CLOCKWISE_INDICES,
        mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
          createRecastTestEnvelopeV1(),
        ),
      );
      try {
        if (!result.success) {
          throw new Error(result.error);
        }
        throw new Error("expected-after-provider-build");
      } finally {
        destroyRecastTiledOperationResourcesV1(undefined, result);
      }
    })).rejects.toThrow("expected-after-provider-build");

    await expect(generatePlane(COUNTER_CLOCKWISE_INDICES)).resolves.toMatchObject({
      success: true,
    });
  });
});
