import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import type {
  BabylonNativeBlockLogicalColliderGroupV1,
  BabylonNativeBlockLogicalGroundModelV1,
  BabylonNativeBlockLogicalSolidOccupancyCellV1,
  BabylonNativeBlockLogicalSupportTopCellV1,
} from "./logical-ground-model.js";
import {
  buildBabylonNativeBlockWalkableTopologyV1,
  type BabylonNativeBlockWalkableTopologyPolicyV1,
} from "./walkable-topology.js";

const H = (digit: string) => `sha256:${digit.repeat(64)}` as Sha256HashV1;
const STATIC_SURFACE = Object.freeze({
  kind: "static-surface" as const,
  surfaceEntityId: "ground-surface",
  logicalSubshapeId: "top",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
});
const NOT_TRAVERSABLE = Object.freeze({ kind: "not-traversable" as const });
const POLICY: BabylonNativeBlockWalkableTopologyPolicyV1 = Object.freeze({
  kind: "babylon-native-block-walkable-topology-policy",
  schemaVersion: 1,
  maximumAutoSmoothHeightDeltaMeters: 0.3,
  visualOverlayOffsetMeters: 0.004,
  maximumLogicalColliderCount: 32,
  maximumColliderVertexCount: 10_000,
  maximumColliderTriangleCount: 20_000,
});

interface GroupFixture {
  readonly colliderId: string;
  readonly cells: readonly string[];
  readonly traversal: "surface" | "solid";
  readonly sourceBlockIds?: readonly string[];
  readonly visualGroupIds?: readonly string[];
  readonly visualGroupBySourceBlockId?: Readonly<Record<string, string | undefined>>;
  readonly surfaceEntityId?: string;
  readonly logicalSubshapeId?: string;
  readonly traversalSurfaceProfileRef?: string;
}

function sourceIdentity(fixture: GroupFixture, index: number) {
  const sourceBlockId = (fixture.sourceBlockIds ?? [
    `${fixture.colliderId}-block`,
  ])[index % (fixture.sourceBlockIds?.length ?? 1)]!;
  const visualGroupId = fixture.visualGroupBySourceBlockId === undefined
    ? (fixture.visualGroupIds ?? [`${fixture.colliderId}-visual`])[0]
    : fixture.visualGroupBySourceBlockId[sourceBlockId];
  return { sourceBlockId, ...(visualGroupId === undefined ? {} : { visualGroupId }) };
}

function surfaceBinding(fixture: GroupFixture) {
  return Object.freeze({
    ...STATIC_SURFACE,
    surfaceEntityId: fixture.surfaceEntityId ??
      `${fixture.colliderId}-surface`,
    logicalSubshapeId: fixture.logicalSubshapeId ??
      `${fixture.colliderId}-top`,
    traversalSurfaceProfileRef: fixture.traversalSurfaceProfileRef ??
      STATIC_SURFACE.traversalSurfaceProfileRef,
  });
}

function coordinates(cellKey: string): readonly [number, number, number] {
  return cellKey.split(",").map(Number) as [number, number, number];
}

function model(fixtures: readonly GroupFixture[]):
BabylonNativeBlockLogicalGroundModelV1 {
  const declaredTraversalSurfaceProfileRefs = Object.freeze([
    STATIC_SURFACE.traversalSurfaceProfileRef,
  ]);
  const groups: BabylonNativeBlockLogicalColliderGroupV1[] = fixtures.map(
    (fixture) => Object.freeze({
      colliderId: fixture.colliderId,
      colliderGeometrySource: Object.freeze({
        kind: "block-group" as const,
        colliderGroupId: `${fixture.colliderId}-source`,
      }),
      sourceBlockIds: Object.freeze([...(fixture.sourceBlockIds ?? [
        `${fixture.colliderId}-block`,
      ])]),
      visualGroupIds: Object.freeze([...(fixture.visualGroupIds ?? [
        `${fixture.colliderId}-visual`,
      ])]),
      traversalBinding: fixture.traversal === "surface"
        ? surfaceBinding(fixture)
        : NOT_TRAVERSABLE,
      exposedEdgePolicy: "none" as const,
      occupiedMicroCellKeys: Object.freeze([...fixture.cells].sort()),
    }),
  ).sort((left, right) => left.colliderId.localeCompare(right.colliderId));
  const allCellKeys = new Set(fixtures.flatMap(({ cells }) => cells));
  const solidOccupancyCells: BabylonNativeBlockLogicalSolidOccupancyCellV1[] =
    fixtures.flatMap((fixture) => fixture.cells.map((cellKey, index) =>
      Object.freeze({
        cellKey,
        colliderId: fixture.colliderId,
        ...sourceIdentity(fixture, index),
        colliderGroupId: `${fixture.colliderId}-source`,
        traversalBinding: fixture.traversal === "surface"
          ? surfaceBinding(fixture)
          : NOT_TRAVERSABLE,
      }))).sort((left, right) =>
      left.cellKey.localeCompare(right.cellKey) ||
      left.colliderId.localeCompare(right.colliderId));
  const exposedSupportTopCells: BabylonNativeBlockLogicalSupportTopCellV1[] =
    fixtures.flatMap((fixture) => {
      if (fixture.traversal !== "surface") return [];
      return fixture.cells.flatMap((sourceOccupiedCellKey, index) => {
        const [x, y, z] = coordinates(sourceOccupiedCellKey);
        const topCellKey = `${x},${y + 1},${z}`;
        if (allCellKeys.has(topCellKey)) return [];
        return [Object.freeze({
          topCellKey,
          sourceOccupiedCellKey,
          colliderId: fixture.colliderId,
          ...sourceIdentity(fixture, index),
          colliderGroupId: `${fixture.colliderId}-source`,
          traversalBinding: surfaceBinding(fixture),
        })];
      });
    }).sort((left, right) =>
      left.topCellKey.localeCompare(right.topCellKey) ||
      left.colliderId.localeCompare(right.colliderId));
  const body = Object.freeze({
    kind: "babylon-native-block-logical-ground-model" as const,
    schemaVersion: 1 as const,
    identity: Object.freeze({
      buildEpochId: "topology-epoch",
      checkedLayoutInventoryHash: H("1"),
      profileInventoryHash: H("2"),
      nativeSceneBootstrapHash: H("3"),
    }),
    declaredTraversalSurfaceProfileRefs,
    colliderGroups: Object.freeze(groups),
    solidOccupancyCells: Object.freeze(solidOccupancyCells),
    exposedSupportTopCells: Object.freeze(exposedSupportTopCells),
  });
  return Object.freeze({
    ...body,
    logicalGroundModelHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}

function topology(
  groundModel: BabylonNativeBlockLogicalGroundModelV1,
  policy: BabylonNativeBlockWalkableTopologyPolicyV1 = POLICY,
) {
  return buildBabylonNativeBlockWalkableTopologyV1({ groundModel, policy });
}

function verticesAtX(
  positions: readonly number[],
  xMeters: number,
): readonly (readonly [number, number, number])[] {
  const output: [number, number, number][] = [];
  for (let offset = 0; offset < positions.length; offset += 3) {
    if (positions[offset] === xMeters) {
      output.push([
        positions[offset]!,
        positions[offset + 1]!,
        positions[offset + 2]!,
      ]);
    }
  }
  return output.sort((left, right) => left[2] - right[2]);
}

describe("Babylon Native Block walkable topology", () => {
  it("CF-20/MEM4 preserves exact exposed faces, winding, holes and Collider partitions", () => {
    const grid = [0.5, 0.25, 0.5];
    for (let variant = 0; variant < 16; variant++) {
      const cells: string[] = [];
      for (let x = -2; x <= 2; x++) for (let y = -1; y <= 1; y++) for (let z = -2; z <= 2; z++) {
        if ((x === 0 && z === 0) || ((x * x + y * y + z * z + variant) % 5 === 0)) continue;
        cells.push(`${x},${y},${z}`);
      }
      const fixtures = [0, 1].map(partition => ({
        colliderId: `solid-${partition}`, traversal: "solid" as const,
        cells: cells.filter(key => (Number(key.split(",")[0]) < 0) === (partition === 0)),
      }));
      const result = topology(model(fixtures));
      const occupied = new Set(cells);
      for (const geometry of result.solidGeometries) {
        const expected = new Set<string>();
        for (const key of fixtures.find(row => row.colliderId === geometry.logicalColliderId)!.cells) {
          const cell = coordinates(key);
          for (const axis of [0, 1, 2]) for (const delta of [-1, 1]) {
            const neighbor = [...cell]; neighbor[axis] = neighbor[axis]! + delta;
            if (occupied.has(neighbor.join(","))) continue;
            const tangent = [0, 1, 2].filter(value => value !== axis);
            expected.add([axis, -delta, cell[axis]! + Math.max(0, delta), cell[tangent[0]!]!, cell[tangent[1]!]!].join(":"));
          }
        }
        const actual = new Set<string>();
        for (let offset = 0; offset < geometry.triangleIndices.length; offset += 6) {
          const vertices = geometry.triangleIndices.slice(offset, offset + 6).map(index =>
            Vector3.FromArray(geometry.collisionPositionsMetersXYZ, index * 3));
          const normal = Vector3.Cross(vertices[1]!.subtract(vertices[0]!), vertices[2]!.subtract(vertices[0]!)).normalize().asArray();
          const axis = normal.findIndex(value => Math.abs(value) > 0.5);
          const tangent = [0, 1, 2].filter(value => value !== axis);
          const coordinatesByAxis = vertices.map(vertex => vertex.asArray().map((value, index) => value / grid[index]!));
          const minimum = [0, 1, 2].map(index => Math.min(...coordinatesByAxis.map(row => row[index]!)));
          const maximum = [0, 1, 2].map(index => Math.max(...coordinatesByAxis.map(row => row[index]!)));
          for (let u = minimum[tangent[0]!]!; u < maximum[tangent[0]!]!; u++) {
            for (let v = minimum[tangent[1]!]!; v < maximum[tangent[1]!]!; v++) {
              const key = [axis, Math.round(normal[axis]!), minimum[axis], u, v].join(":");
              expect(actual.has(key)).toBe(false);
              actual.add(key);
            }
          }
        }
        expect(actual).toEqual(expected);
      }
      const reversed = topology(model(fixtures.map(row => ({ ...row, cells: [...row.cells].reverse() })).reverse()));
      expect(reversed.topologyHash).toBe(result.topologyHash);
    }
  });
  it("CF-20/MEM4 keeps a dense solid cuboid at eight vertices and twelve triangles", () => {
    const cells: string[] = [];
    for (let y = 0; y < 8; y++) for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) cells.push(`${x},${y},${z}`);
    const groundModel = model([{ colliderId: "solid-collider", traversal: "solid", cells }]);
    const result = buildBabylonNativeBlockWalkableTopologyV1({ groundModel,
      policy: { ...POLICY, maximumColliderVertexCount: 8, maximumColliderTriangleCount: 12 } });
    expect(result.solidGeometries[0]).toMatchObject({ vertexCount: 8, triangleCount: 12, sourceCellCount: 512,
      minimumMetersXYZ: [0, 0, 0], maximumMetersXYZ: [4, 2, 4] });
  });
  it("partitions mixed-group and ungrouped top quads without changing collision geometry", () => {
    const groundModel = model([{
      colliderId: "floor-collider", traversal: "surface",
      cells: ["0,0,0", "1,1,0", "2,0,0", "3,0,0"],
      sourceBlockIds: ["block-a", "block-b", "block-none", "block-a-two"],
      visualGroupIds: ["group-a", "group-b"],
      visualGroupBySourceBlockId: {
        "block-a": "group-a", "block-b": "group-b", "block-a-two": "group-a",
      },
    }]);
    const result = topology(groundModel);
    const geometry = result.walkableGeometries[0]!;
    expect(sha256CanonicalJson({
      collisionPositionsMetersXYZ: geometry.collisionPositionsMetersXYZ,
      overlayPositionsMetersXYZ: geometry.overlayPositionsMetersXYZ,
      triangleIndices: geometry.triangleIndices,
      vertexCount: geometry.vertexCount, triangleCount: geometry.triangleCount,
      colliderVertexCount: result.colliderVertexCount, colliderTriangleCount: result.colliderTriangleCount,
    })).toBe("sha256:fa8ac634670cd34b7a0d2e8c229f02dcb551c255c09a6668c8f8df8a8cc4deaf");
    expect(geometry.overlayPartitions).toEqual([
      { sourceBlockIds: ["block-none"], visualGroupIds: [], triangleIndices: geometry.triangleIndices.slice(12, 18) },
      { sourceBlockIds: ["block-a", "block-a-two"], visualGroupIds: ["group-a"],
        triangleIndices: [...geometry.triangleIndices.slice(0, 6), ...geometry.triangleIndices.slice(18, 24)] },
      { sourceBlockIds: ["block-b"], visualGroupIds: ["group-b"], triangleIndices: geometry.triangleIndices.slice(6, 12) },
    ]);
    const { logicalGroundModelHash: _hash, ...body } = groundModel;
    const reversed = {
      ...body, exposedSupportTopCells: [...body.exposedSupportTopCells].reverse(),
      solidOccupancyCells: [...body.solidOccupancyCells].reverse(),
    };
    const reordered = topology({ ...reversed, logicalGroundModelHash: sha256CanonicalJson(reversed) as Sha256HashV1 });
    expect(reordered.walkableGeometries).toEqual(result.walkableGeometries);
    const { geometryHash, ...geometryBody } = geometry;
    expect(geometryHash).toBe(sha256CanonicalJson(geometryBody));
    expect(sha256CanonicalJson({ ...geometryBody, overlayPartitions: [] })).not.toBe(geometryHash);
    expect(Object.isFrozen(geometry.overlayPartitions[0]?.triangleIndices)).toBe(true);
  });

  it.each([{ visualGroupIds: [] }, { visualGroupIds: ["floor-visual"] }])("retains zero or one semantic group for a complete surface: $visualGroupIds", ({ visualGroupIds }) => {
    const result = topology(model([{ colliderId: "floor-collider", traversal: "surface",
      cells: ["0,0,0", "1,0,0"], visualGroupIds }]));
    const geometry = result.walkableGeometries[0]!;
    expect(geometry.overlayPartitions).toEqual([{ sourceBlockIds: ["floor-collider-block"],
      visualGroupIds, triangleIndices: geometry.triangleIndices }]);
  });

  it("attributes only exposed source Blocks to overlay partitions", () => {
    const result = topology(model([{
      colliderId: "stack-collider", traversal: "surface", cells: ["0,0,0", "0,1,0"],
      sourceBlockIds: ["buried-block", "top-block"], visualGroupIds: ["buried-group", "top-group"],
      visualGroupBySourceBlockId: { "buried-block": "buried-group", "top-block": "top-group" },
    }]));
    const geometry = result.walkableGeometries[0]!;
    expect(geometry.sourceBlockIds).toEqual(["buried-block", "top-block"]);
    expect(geometry.overlayPartitions).toEqual([{
      sourceBlockIds: ["top-block"], visualGroupIds: ["top-group"],
      triangleIndices: geometry.triangleIndices,
    }]);
  });
  it("derives one continuous topology globally before splitting Collider groups", () => {
    const result = topology(model([
      {
        colliderId: "west-collider",
        cells: ["-1,0,0"],
        traversal: "surface",
      },
      {
        colliderId: "east-collider",
        cells: ["0,1,0"],
        traversal: "surface",
      },
    ]));

    expect(result.walkableGeometries).toHaveLength(2);
    const [east, west] = result.walkableGeometries;
    expect(east?.logicalColliderId).toBe("east-collider");
    expect(west?.logicalColliderId).toBe("west-collider");
    expect(verticesAtX(
      east!.collisionPositionsMetersXYZ,
      0,
    )).toEqual(verticesAtX(west!.collisionPositionsMetersXYZ, 0));
    expect(verticesAtX(east!.collisionPositionsMetersXYZ, 0)).toEqual([
      [0, 0.375, 0],
      [0, 0.375, 0.5],
    ]);
  });

  it("keeps declared static surfaces walkable until later Registry and Subject admission", () => {
    const groundModel = model([{
      colliderId: "ice-collider",
      cells: ["0,0,0"],
      traversal: "surface",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ice.static@1",
    }]);
    const result = topology(groundModel);

    expect(result.walkableGeometries).toHaveLength(1);
    expect(result.solidGeometries).toHaveLength(0);
    expect(result.walkableGeometries[0]).toMatchObject({
      logicalColliderId: "ice-collider",
      proxyKind: "continuous-walkable-surface",
      triangleCount: 2,
    });
  });

  it("does not drop a supported static surface covered by another group", () => {
    const result = topology(model([
      {
        colliderId: "covered-floor",
        cells: ["0,0,0"],
        traversal: "surface",
      },
      {
        colliderId: "cover-mass",
        cells: ["0,1,0"],
        traversal: "solid",
      },
    ]));

    expect(result.walkableGeometries).toHaveLength(0);
    expect(result.solidGeometries.map(({ logicalColliderId }) =>
      logicalColliderId)).toEqual(["cover-mass", "covered-floor"]);
  });

  it("keeps collision and visible overlay byte-related by Y epsilon only", () => {
    const result = topology(model([{
      colliderId: "floor-collider",
      cells: ["-1,0,-1", "0,0,-1", "-1,0,0"],
      traversal: "surface",
    }]));
    const geometry = result.walkableGeometries[0]!;

    expect(geometry.triangleIndices).toHaveLength(18);
    expect(geometry.sourceCellCount).toBe(3);
    expect(geometry.overlayPositionsMetersXYZ).toHaveLength(
      geometry.collisionPositionsMetersXYZ.length,
    );
    for (let index = 0; index < geometry.collisionPositionsMetersXYZ.length;
      index += 1) {
      const collision = geometry.collisionPositionsMetersXYZ[index]!;
      const overlay = geometry.overlayPositionsMetersXYZ[index]!;
      expect(overlay - collision).toBeCloseTo(index % 3 === 1 ? 0.004 : 0, 12);
    }
  });

  it("builds an exact non-walkable solid union and removes every internal face", () => {
    const result = topology(model([
      {
        colliderId: "floor-collider",
        cells: ["-1,0,0"],
        traversal: "surface",
      },
      {
        colliderId: "wall-collider",
        cells: ["0,0,0", "1,0,0"],
        traversal: "solid",
      },
    ]));
    const wall = result.solidGeometries[0]!;

    expect(wall.proxyKind).toBe("exact-solid-union");
    expect(wall.overlayPartitions).toEqual([]);
    expect(wall.sourceCellCount).toBe(2);
    expect(wall.triangleCount).toBe(10);
    expect(result.removedInternalFaceCount).toBe(2);
  });

  it("is deterministic for negative cells, holes and source creation order", () => {
    const fixtures = [
      {
        colliderId: "floor-collider",
        cells: ["-2,0,-2", "-1,0,-2", "-2,0,-1"],
        traversal: "surface" as const,
        sourceBlockIds: ["floor-a", "floor-b"],
      },
      {
        colliderId: "wall-collider",
        cells: ["0,0,0", "0,1,0", "1,0,0"],
        traversal: "solid" as const,
      },
    ];
    const first = topology(model(fixtures));
    const second = topology(model([
      { ...fixtures[1]!, cells: [...fixtures[1]!.cells].reverse() },
      { ...fixtures[0]!, cells: [...fixtures[0]!.cells].reverse() },
    ]));

    expect(second).toEqual(first);
    expect(first.topologyHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("fails before materialization for stale identity or topology budgets", () => {
    const groundModel = model([{
      colliderId: "floor-collider",
      cells: ["0,0,0"],
      traversal: "surface",
    }]);
    expect(() => topology(Object.freeze({
      ...groundModel,
      logicalGroundModelHash: H("f"),
    }))).toThrow(/WORLDKIT_NATIVE_BLOCK_TOPOLOGY_IDENTITY_MISMATCH/);
    expect(() => topology(groundModel, Object.freeze({
      ...POLICY,
      maximumColliderTriangleCount: 1,
    }))).toThrow(/WORLDKIT_NATIVE_BLOCK_TOPOLOGY_BUDGET_EXCEEDED/);
  });

  it("rejects extra and accessor-bearing topology policy fields", () => {
    const groundModel = model([{
      colliderId: "floor-collider",
      cells: ["0,0,0"],
      traversal: "surface",
    }]);
    expect(() => topology(groundModel, {
      ...POLICY,
      compatibilityMode: true,
    } as never)).toThrow(/WORLDKIT_NATIVE_BLOCK_TOPOLOGY_INPUT_INVALID/);
    const accessor = Object.defineProperty({ ...POLICY },
      "maximumColliderVertexCount", {
        enumerable: true,
        get(): never {
          throw new Error("getter must not run");
        },
      });
    expect(() => topology(groundModel, accessor as never))
      .toThrow(/WORLDKIT_NATIVE_BLOCK_TOPOLOGY_INPUT_INVALID/);
  });
});
