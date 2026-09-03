import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
} from "./chunk-policy.js";
import {
  partitionBabylonNativeBlockCollisionIntoChunksV1,
  type BabylonNativeBlockCollisionSourceV1,
} from "./chunk-collision-partition.js";
import type { BabylonNativeBlockLogicalGroundModelV1 } from
  "./logical-ground-model.js";
import { buildBabylonNativeBlockWalkableTopologyV1 } from
  "./walkable-topology.js";

const HASH = (digit: string) => `sha256:${digit.repeat(64)}` as Sha256HashV1;
const DECK_CELL_COUNT = 20;
const STATIC_SURFACE = Object.freeze({
  kind: "static-surface" as const,
  surfaceEntityId: "deck-surface",
  logicalSubshapeId: "deck-top",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
});

/**
 * One 10 m long, half-meter wide deck on the fixed occupancy lattice. It spans
 * three 4 m Chunk columns, so the partition must cross two seams.
 */
function deckGroundModel(): BabylonNativeBlockLogicalGroundModelV1 {
  const cells = Array.from({ length: DECK_CELL_COUNT }, (_value, i) => i);
  const body = Object.freeze({
    kind: "babylon-native-block-logical-ground-model" as const,
    schemaVersion: 1 as const,
    identity: Object.freeze({
      buildEpochId: "collision-partition-fixture",
      checkedLayoutInventoryHash: HASH("1"),
      profileInventoryHash: HASH("2"),
      nativeSceneBootstrapHash: HASH("3"),
    }),
    declaredTraversalSurfaceProfileRefs: Object.freeze([
      STATIC_SURFACE.traversalSurfaceProfileRef,
    ]),
    colliderGroups: Object.freeze([Object.freeze({
      colliderId: "deck-collider",
      colliderGeometrySource: Object.freeze({
        kind: "block-group" as const,
        colliderGroupId: "deck-source",
      }),
      sourceBlockIds: Object.freeze(["deck-block"]),
      visualGroupIds: Object.freeze(["deck-visual"]),
      traversalBinding: STATIC_SURFACE,
      exposedEdgePolicy: "none" as const,
      occupiedMicroCellKeys: Object.freeze(
        cells.map((i) => `${i},-1,0`).sort(),
      ),
    })]),
    solidOccupancyCells: Object.freeze(cells.map((i) => Object.freeze({
      cellKey: `${i},-1,0`,
      colliderId: "deck-collider",
      sourceBlockId: "deck-block",
      colliderGroupId: "deck-source",
      visualGroupId: "deck-visual",
      traversalBinding: STATIC_SURFACE,
    })).sort((left, right) => left.cellKey.localeCompare(right.cellKey))),
    exposedSupportTopCells: Object.freeze(cells.map((i) => Object.freeze({
      topCellKey: `${i},0,0`,
      sourceOccupiedCellKey: `${i},-1,0`,
      colliderId: "deck-collider",
      sourceBlockId: "deck-block",
      colliderGroupId: "deck-source",
      visualGroupId: "deck-visual",
      traversalBinding: STATIC_SURFACE,
    })).sort((left, right) => left.topCellKey.localeCompare(right.topCellKey))),
  });
  return Object.freeze({
    ...body,
    logicalGroundModelHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}

function deckTopology() {
  return buildBabylonNativeBlockWalkableTopologyV1({
    groundModel: deckGroundModel(),
    policy: Object.freeze({
      kind: "babylon-native-block-walkable-topology-policy" as const,
      schemaVersion: 1 as const,
      maximumAutoSmoothHeightDeltaMeters: 0.3,
      visualOverlayOffsetMeters: 0.002,
      maximumLogicalColliderCount: 8,
      maximumColliderVertexCount: 512,
      maximumColliderTriangleCount: 512,
    }),
  });
}

function sourceFromTopology(): readonly BabylonNativeBlockCollisionSourceV1[] {
  const topology = deckTopology();
  return Object.freeze([...topology.walkableGeometries,
    ...topology.solidGeometries].map((geometry) => Object.freeze({
      colliderId: geometry.logicalColliderId,
      worldPositionsMetersXYZ: geometry.collisionPositionsMetersXYZ,
      triangleIndices: geometry.triangleIndices,
    })));
}

function triangleMultiset(
  colliders: readonly BabylonNativeBlockCollisionSourceV1[],
): readonly string[] {
  return colliders.flatMap((collider) =>
    Array.from(
      { length: collider.triangleIndices.length / 3 },
      (_value, triangle) => [0, 1, 2].flatMap((corner) => {
        const vertexIndex = collider.triangleIndices[triangle * 3 + corner]!;
        return [0, 1, 2].map((axis) =>
          collider.worldPositionsMetersXYZ[vertexIndex * 3 + axis]!);
      }).join(","),
    )).sort();
}

describe("NBR-65F Collider Chunk partition", () => {
  it("splits one logical Collider into deterministic Chunk parts", () => {
    const colliders = sourceFromTopology();
    const partition = partitionBabylonNativeBlockCollisionIntoChunksV1({
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      colliders,
    });

    expect(partition.chunkPolicyHash)
      .toBe(BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_HASH_V1);
    expect(partition.logicalColliderCount).toBe(1);
    expect(partition.partIdsByLogicalColliderId).toEqual([{
      logicalColliderId: "deck-collider",
      partIds: [
        "deck-collider-grid-chunk-xp0-zp0",
        "deck-collider-grid-chunk-xp1-zp0",
        "deck-collider-grid-chunk-xp2-zp0",
      ],
    }]);
    expect(partition.parts.map((part) => [
      part.partId,
      part.chunkIndexXZ,
      part.triangleCount,
    ])).toEqual([
      ["deck-collider-grid-chunk-xp0-zp0", [0, 0], 14],
      ["deck-collider-grid-chunk-xp1-zp0", [1, 0], 16],
      ["deck-collider-grid-chunk-xp2-zp0", [2, 0], 10],
    ]);
    expect(partition.triangleCount).toBe(
      colliders[0]!.triangleIndices.length / 3,
    );
    expect(partition.parity).toEqual({
      isTriangleCountPreserved: true,
      isTriangleGeometryPreserved: true,
      isLogicalColliderIdentityPreserved: true,
      isCrossColliderMergeAbsent: true,
    });
    expect(partition.partitionHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("keeps exact triangle parity and shared seam vertices", () => {
    const colliders = sourceFromTopology();
    const partition = partitionBabylonNativeBlockCollisionIntoChunksV1({
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      colliders,
    });
    expect(triangleMultiset(partition.parts.map((part) => ({
      colliderId: part.logicalColliderId,
      worldPositionsMetersXYZ: part.worldPositionsMetersXYZ,
      triangleIndices: part.triangleIndices,
    })))).toEqual(triangleMultiset(colliders));

    // The Chunk seam plane at x = 3.5 must carry identical vertices on both
    // sides, so a Subject cannot fall between two Havok parts.
    const seamVerticesOf = (partId: string): readonly string[] => {
      const part = partition.parts.find((entry) => entry.partId === partId)!;
      const seam: string[] = [];
      for (
        let offset = 0;
        offset < part.worldPositionsMetersXYZ.length;
        offset += 3
      ) {
        if (Math.abs(part.worldPositionsMetersXYZ[offset]! - 3.5) > 1e-9) {
          continue;
        }
        seam.push(part.worldPositionsMetersXYZ.slice(offset, offset + 3)
          .join(","));
      }
      return seam.sort();
    };
    const lower = seamVerticesOf("deck-collider-grid-chunk-xp0-zp0");
    expect(lower).not.toHaveLength(0);
    expect(seamVerticesOf("deck-collider-grid-chunk-xp1-zp0")).toEqual(lower);
  });

  it("never merges two logical Colliders into one part", () => {
    const colliders: readonly BabylonNativeBlockCollisionSourceV1[] = [
      {
        colliderId: "walk-deck",
        worldPositionsMetersXYZ: [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1],
        triangleIndices: [0, 1, 2, 0, 2, 3],
      },
      {
        colliderId: "blocker-wall",
        worldPositionsMetersXYZ: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
        triangleIndices: [0, 1, 2, 0, 2, 3],
      },
    ];
    const partition = partitionBabylonNativeBlockCollisionIntoChunksV1({
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      colliders,
    });
    expect(partition.parts.map(({ partId, logicalColliderId }) =>
      [partId, logicalColliderId])).toEqual([
      ["blocker-wall-grid-chunk-xp0-zp0", "blocker-wall"],
      ["walk-deck-grid-chunk-xp0-zp0", "walk-deck"],
    ]);
    expect(new Set(partition.parts.map(({ logicalColliderId }) =>
      logicalColliderId)).size).toBe(2);
  });

  it("replays the identical partition regardless of Collider order", () => {
    const colliders = [
      ...sourceFromTopology(),
      {
        colliderId: "blocker-wall",
        worldPositionsMetersXYZ: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
        triangleIndices: [0, 1, 2, 0, 2, 3],
      },
    ];
    const forward = partitionBabylonNativeBlockCollisionIntoChunksV1({
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      colliders,
    });
    const reversed = partitionBabylonNativeBlockCollisionIntoChunksV1({
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      colliders: [...colliders].reverse(),
    });
    expect(reversed).toEqual(forward);
  });

  it("coarsens with the Chunk profile without changing the geometry", () => {
    const colliders = sourceFromTopology();
    const coarse = partitionBabylonNativeBlockCollisionIntoChunksV1({
      chunkPolicy: BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1[3],
      colliders,
    });
    const fine = partitionBabylonNativeBlockCollisionIntoChunksV1({
      chunkPolicy: BABYLON_NATIVE_BLOCK_CHUNK_POLICY_CANDIDATES_V1[0],
      colliders,
    });
    expect(coarse.partCount).toBe(1);
    expect(fine.partCount).toBeGreaterThan(coarse.partCount);
    expect(coarse.triangleCount).toBe(fine.triangleCount);
    expect(coarse.partitionHash).not.toBe(fine.partitionHash);
    for (const partition of [coarse, fine]) {
      expect(triangleMultiset(partition.parts.map((part) => ({
        colliderId: part.logicalColliderId,
        worldPositionsMetersXYZ: part.worldPositionsMetersXYZ,
        triangleIndices: part.triangleIndices,
      })))).toEqual(triangleMultiset(colliders));
    }
  });

  it("rejects malformed or duplicated Collider geometry", () => {
    const valid = sourceFromTopology();
    expect(() => partitionBabylonNativeBlockCollisionIntoChunksV1({
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      colliders: [...valid, ...valid],
    })).toThrow(/WORLDKIT_NATIVE_BLOCK_COLLISION_PARTITION_INVALID/);
    expect(() => partitionBabylonNativeBlockCollisionIntoChunksV1({
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      colliders: [{
        colliderId: "broken",
        worldPositionsMetersXYZ: [0, 0, 0, 1, 0, 0, 1, 0, 1],
        triangleIndices: [0, 1, 5],
      }],
    })).toThrow(/WORLDKIT_NATIVE_BLOCK_COLLISION_PARTITION_INVALID/);
    expect(() => partitionBabylonNativeBlockCollisionIntoChunksV1({
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      colliders: [{
        colliderId: " leading-space",
        worldPositionsMetersXYZ: [0, 0, 0, 1, 0, 0, 1, 0, 1],
        triangleIndices: [0, 1, 2],
      }],
    })).toThrow(/WORLDKIT_NATIVE_BLOCK_COLLISION_PARTITION_INVALID/);
    // Host-derived ground safety boundary IDs are canonical identity strings.
    expect(partitionBabylonNativeBlockCollisionIntoChunksV1({
      chunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
      colliders: [{
        colliderId: `ground-safety-boundary:${"a".repeat(16)}`,
        worldPositionsMetersXYZ: [0, 0, 0, 1, 0, 0, 1, 0, 1],
        triangleIndices: [0, 1, 2],
      }],
    }).parts[0]!.partId).toBe(
      `ground-safety-boundary:${"a".repeat(16)}-grid-chunk-xp0-zp0`,
    );
  });
});
