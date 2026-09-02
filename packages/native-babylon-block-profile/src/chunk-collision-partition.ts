import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import {
  babylonNativeBlockChunkAxisIndexV1,
  babylonNativeBlockChunkIdV1,
  hashBabylonNativeBlockChunkPolicyV1,
  parseBabylonNativeBlockChunkPolicyV1,
  type BabylonNativeBlockChunkPolicyV1,
} from "./chunk-policy.js";

const CODE = "WORLDKIT_NATIVE_BLOCK_COLLISION_PARTITION_INVALID";
const PARITY_CODE = "WORLDKIT_NATIVE_BLOCK_COLLISION_PARTITION_PARITY_BROKEN";
const STABLE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;

/**
 * One deterministic Chunk part of exactly one logical Collider. Triangles are
 * never split, replaced by an AABB or convex hull, or merged across logical
 * Colliders: a part is a strict subset of the frozen triangle soup with its
 * original vertex coordinates, so adjacent parts share identical seam vertices
 * and a Subject can walk across a Chunk seam without a gap or lip.
 */
export interface BabylonNativeBlockCollisionChunkPartV1 {
  readonly partId: string;
  readonly logicalColliderId: string;
  readonly chunkResidencyGroupId: string;
  readonly chunkIndexXZ: readonly [number, number];
  readonly worldPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly minimumMetersXYZ: readonly [number, number, number];
  readonly maximumMetersXYZ: readonly [number, number, number];
  readonly partHash: Sha256HashV1;
}

export interface BabylonNativeBlockCollisionChunkPartitionV1 {
  readonly kind: "babylon-native-block-collision-chunk-partition";
  readonly schemaVersion: 1;
  readonly chunkPolicyHash: Sha256HashV1;
  readonly logicalColliderCount: number;
  readonly partCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly partIdsByLogicalColliderId: readonly Readonly<{
    logicalColliderId: string;
    partIds: readonly string[];
  }>[];
  readonly parts: readonly BabylonNativeBlockCollisionChunkPartV1[];
  readonly parity: Readonly<{
    isTriangleCountPreserved: true;
    isTriangleGeometryPreserved: true;
    isLogicalColliderIdentityPreserved: true;
    isCrossColliderMergeAbsent: true;
  }>;
  readonly partitionHash: Sha256HashV1;
}

export interface BabylonNativeBlockCollisionSourceV1 {
  readonly colliderId: string;
  readonly worldPositionsMetersXYZ: readonly number[];
  readonly triangleIndices: readonly number[];
}

export interface PartitionBabylonNativeBlockCollisionInputV1 {
  readonly chunkPolicy: BabylonNativeBlockChunkPolicyV1;
  readonly colliders: readonly BabylonNativeBlockCollisionSourceV1[];
}

function fail(code: string, message: string): never {
  throw new TypeError(`${code}: ${message}`);
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function triangleKey(vertices: readonly number[]): string {
  return vertices.map(canonicalNumber).join(",");
}

function deepFreezeData<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || isNil(value)) return value;
  for (const child of Object.values(value)) deepFreezeData(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function validatedSource(
  collider: BabylonNativeBlockCollisionSourceV1,
): BabylonNativeBlockCollisionSourceV1 {
  const positions = collider.worldPositionsMetersXYZ;
  const indices = collider.triangleIndices;
  if (
    typeof collider.colliderId !== "string" ||
    !STABLE_ID.test(collider.colliderId) ||
    !Array.isArray(positions) ||
    !Array.isArray(indices) ||
    positions.length < 9 ||
    positions.length % 3 !== 0 ||
    indices.length === 0 ||
    indices.length % 3 !== 0 ||
    !positions.every((value) => typeof value === "number" &&
      Number.isFinite(value)) ||
    !indices.every((index) => Number.isSafeInteger(index) && index >= 0 &&
      index < positions.length / 3)
  ) {
    return fail(
      CODE,
      `Collider '${String(collider.colliderId)}' must expose finite indexed triangles.`,
    );
  }
  return collider;
}

/**
 * Split every logical Collider into deterministic Chunk parts. Part ownership
 * is decided by the triangle centroid, so a triangle belongs to exactly one
 * part and the union of parts is byte-identical to the frozen input geometry.
 */
export function partitionBabylonNativeBlockCollisionIntoChunksV1(
  input: PartitionBabylonNativeBlockCollisionInputV1,
): BabylonNativeBlockCollisionChunkPartitionV1 {
  const chunkPolicy = parseBabylonNativeBlockChunkPolicyV1(input.chunkPolicy);
  if (!Array.isArray(input.colliders)) {
    fail(CODE, "colliders must be one ordinary array");
  }
  const colliders = [...input.colliders]
    .map(validatedSource)
    .sort((left, right) => stableCompare(left.colliderId, right.colliderId));
  if (new Set(colliders.map(({ colliderId }) => colliderId)).size !==
    colliders.length) fail(CODE, "logical Collider IDs must be unique");

  const sourceTriangleKeys: string[] = [];
  const partitionedTriangleKeys: string[] = [];
  const parts: BabylonNativeBlockCollisionChunkPartV1[] = [];
  const partIdsByLogicalColliderId: Array<Readonly<{
    logicalColliderId: string;
    partIds: readonly string[];
  }>> = [];

  for (const collider of colliders) {
    const triangleCount = collider.triangleIndices.length / 3;
    const bucketByChunkKey = new Map<string, {
      chunkIndexXZ: readonly [number, number];
      triangles: number[][];
    }>();
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const corners = [0, 1, 2].map((corner) =>
        collider.triangleIndices[triangle * 3 + corner]!);
      const vertices = corners.flatMap((vertexIndex) => [0, 1, 2].map((axis) =>
        canonicalNumber(
          collider.worldPositionsMetersXYZ[vertexIndex * 3 + axis]!,
        )));
      sourceTriangleKeys.push(triangleKey(vertices));
      const chunkIndexXZ = Object.freeze([
        babylonNativeBlockChunkAxisIndexV1(
          chunkPolicy,
          0,
          (vertices[0]! + vertices[3]! + vertices[6]!) / 3,
        ),
        babylonNativeBlockChunkAxisIndexV1(
          chunkPolicy,
          1,
          (vertices[2]! + vertices[5]! + vertices[8]!) / 3,
        ),
      ]) as readonly [number, number];
      const chunkKey = babylonNativeBlockChunkIdV1(chunkIndexXZ);
      const bucket = bucketByChunkKey.get(chunkKey) ??
        { chunkIndexXZ, triangles: [] };
      bucket.triangles.push(vertices);
      bucketByChunkKey.set(chunkKey, bucket);
    }
    const partIds: string[] = [];
    for (const [chunkResidencyGroupId, bucket] of
      [...bucketByChunkKey.entries()]
        .sort(([left], [right]) => stableCompare(left, right))) {
      const partId = `${collider.colliderId}-${chunkResidencyGroupId}`;
      if (!STABLE_ID.test(partId)) {
        fail(
          CODE,
          `Chunk part id '${partId}' is outside the stable ID contract.`,
        );
      }
      const positions: number[] = [];
      const indices: number[] = [];
      const vertexIndexByKey = new Map<string, number>();
      for (const vertices of bucket.triangles) {
        for (let corner = 0; corner < 3; corner += 1) {
          const position = vertices.slice(corner * 3, corner * 3 + 3);
          const key = position.join(",");
          let vertexIndex = vertexIndexByKey.get(key);
          if (isNil(vertexIndex)) {
            vertexIndex = positions.length / 3;
            positions.push(...position);
            vertexIndexByKey.set(key, vertexIndex);
          }
          indices.push(vertexIndex);
        }
        partitionedTriangleKeys.push(triangleKey(vertices));
      }
      const minimumMetersXYZ = [0, 1, 2].map((axis) => Math.min(
        ...positions.filter((_value, index) => index % 3 === axis),
      )) as [number, number, number];
      const maximumMetersXYZ = [0, 1, 2].map((axis) => Math.max(
        ...positions.filter((_value, index) => index % 3 === axis),
      )) as [number, number, number];
      const body = {
        partId,
        logicalColliderId: collider.colliderId,
        chunkResidencyGroupId,
        chunkIndexXZ: [...bucket.chunkIndexXZ] as [number, number],
        worldPositionsMetersXYZ: [...positions],
        triangleIndices: [...indices],
        vertexCount: positions.length / 3,
        triangleCount: indices.length / 3,
        minimumMetersXYZ: minimumMetersXYZ.map(canonicalNumber) as
          [number, number, number],
        maximumMetersXYZ: maximumMetersXYZ.map(canonicalNumber) as
          [number, number, number],
      };
      parts.push({
        ...body,
        partHash: sha256CanonicalJson(body) as Sha256HashV1,
      });
      partIds.push(partId);
    }
    partIdsByLogicalColliderId.push({
      logicalColliderId: collider.colliderId,
      partIds,
    });
  }

  const sortedSource = [...sourceTriangleKeys].sort(stableCompare);
  const sortedPartitioned = [...partitionedTriangleKeys].sort(stableCompare);
  if (
    sortedSource.length !== sortedPartitioned.length ||
    sortedSource.some((key, index) => key !== sortedPartitioned[index])
  ) {
    fail(
      PARITY_CODE,
      "Chunk partition changed the frozen Collider triangle geometry.",
    );
  }
  if (parts.some((part) => part.triangleCount === 0)) {
    fail(PARITY_CODE, "Chunk partition produced one empty Collider part.");
  }

  const body = {
    kind: "babylon-native-block-collision-chunk-partition" as const,
    schemaVersion: 1 as const,
    chunkPolicyHash: hashBabylonNativeBlockChunkPolicyV1(chunkPolicy),
    logicalColliderCount: colliders.length,
    partCount: parts.length,
    vertexCount: parts.reduce((sum, part) => sum + part.vertexCount, 0),
    triangleCount: parts.reduce((sum, part) => sum + part.triangleCount, 0),
    partIdsByLogicalColliderId,
    parts,
    parity: {
      isTriangleCountPreserved: true as const,
      isTriangleGeometryPreserved: true as const,
      isLogicalColliderIdentityPreserved: true as const,
      isCrossColliderMergeAbsent: true as const,
    },
  };
  return deepFreezeData({
    ...body,
    partitionHash: sha256CanonicalJson(body) as Sha256HashV1,
  }) as BabylonNativeBlockCollisionChunkPartitionV1;
}
