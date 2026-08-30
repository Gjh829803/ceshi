import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeMesh } from "@babylonjs/core/Physics/v2/physicsShape.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import {
  BLOCK_WORLD_CHUNK_SIZE_METERS_V2,
  parseBlockWorldChunkEntityIdV2,
} from "@whitebox-world/block-world";
import type {
  CanonicalSceneStaticColliderV1,
  CanonicalSceneVec3V1,
} from "@whitebox-world/runtime-contracts";
import { emitTransformedStaticColliderTriangleMeshV1 } from "@whitebox-world/terrain-surface";
import { groupBy } from "lodash-es";

import type { StaticCollisionMeshEntryV1 } from "./traversal-runtime-internal.js";
import type { BlockWalkableSurfaceTopologyV1 } from "./block-walkable-surface.js";
import {
  BLOCK_WORLD_GROUND_BOUNDARY_MEMBERSHIP_MASK_V1,
  buildBlockWorldGroundBoundaryGeometryV1,
} from "./block-ground-boundary.js";

export const BLOCK_WORLD_PHYSICS_CHUNK_RADIUS_V1 = 2;

interface ActiveBlockCollisionChunkV1 {
  readonly mesh: Mesh;
  readonly shape: PhysicsShapeMesh;
  readonly aggregate: PhysicsAggregate;
  readonly groundBoundary?: Readonly<{
    mesh: Mesh;
    shape: PhysicsShapeMesh;
    aggregate: PhysicsAggregate;
  }>;
}

function chunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

function colliderChunkKey(collider: CanonicalSceneStaticColliderV1): string | undefined {
  const parsed = parseBlockWorldChunkEntityIdV2(collider.entityId);
  return parsed === undefined ? undefined : chunkKey(parsed.chunkX, parsed.chunkZ);
}

function createMergedChunkMesh(
  key: string,
  colliders: readonly CanonicalSceneStaticColliderV1[],
  walkableSurfaceTopologies: readonly BlockWalkableSurfaceTopologyV1[],
  scene: Scene,
): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const smoothSurfaceEntityIds = new Set(
    walkableSurfaceTopologies.flatMap(({ sourceEntityIds }) => sourceEntityIds),
  );
  for (const collider of colliders) {
    if (smoothSurfaceEntityIds.has(collider.entityId)) continue;
    const topology = emitTransformedStaticColliderTriangleMeshV1(
      collider.shape,
      collider.transform,
    );
    const vertexOffset = positions.length / 3;
    positions.push(...topology.worldPositionsMetersXYZ);
    indices.push(...topology.triangleIndices.map((index) => index + vertexOffset));
  }
  for (const topology of walkableSurfaceTopologies) {
    const vertexOffset = positions.length / 3;
    positions.push(...topology.positionsMetersXYZ);
    indices.push(...topology.triangleIndices.map((index) => index + vertexOffset));
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const mesh = new Mesh(`worldkit.block-collision-chunk.${key}`, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.applyToMesh(mesh, false);
  mesh.metadata = {
    worldkitEntityId: colliders[0]!.entityId,
    worldkitEntityIds: Object.freeze(colliders.map(({ entityId }) => entityId)),
    blockWorldCollisionChunkKey: key,
  };
  mesh.isVisible = false;
  mesh.computeWorldMatrix(true);
  return mesh;
}

function createGroundBoundaryMesh(
  key: string,
  walkableSurfaceTopologies: readonly BlockWalkableSurfaceTopologyV1[],
  scene: Scene,
): Mesh | undefined {
  const geometry = buildBlockWorldGroundBoundaryGeometryV1(
    walkableSurfaceTopologies.flatMap(({ groundBoundarySegments }) =>
      groundBoundarySegments),
  );
  if (geometry.triangleIndices.length === 0) return undefined;
  const normals: number[] = [];
  VertexData.ComputeNormals(
    geometry.positionsMetersXYZ,
    geometry.triangleIndices,
    normals,
  );
  const mesh = new Mesh(`worldkit.block-ground-boundary.${key}`, scene);
  const data = new VertexData();
  data.positions = [...geometry.positionsMetersXYZ];
  data.indices = [...geometry.triangleIndices];
  data.normals = normals;
  data.applyToMesh(mesh, false);
  mesh.metadata = {
    blockWorldGroundBoundaryChunkKey: key,
    sourceSegmentCount: geometry.sourceSegmentCount,
    mergedSegmentCount: geometry.mergedSegmentCount,
  };
  mesh.isVisible = false;
  mesh.computeWorldMatrix(true);
  return mesh;
}

export class BlockWorldCollisionResidencyV1 {
  readonly #collidersByChunkKey: Readonly<Record<string, readonly CanonicalSceneStaticColliderV1[]>>;
  readonly #activeByChunkKey = new Map<string, ActiveBlockCollisionChunkV1>();
  readonly #walkableSurfacesByChunkKey: Readonly<Record<
    string,
    readonly BlockWalkableSurfaceTopologyV1[]
  >>;
  readonly #scene: Scene;
  readonly #staticCollisionMeshes: StaticCollisionMeshEntryV1[];
  readonly #radius: number;
  #disposed = false;

  constructor(options: Readonly<{
    colliders: readonly CanonicalSceneStaticColliderV1[];
    scene: Scene;
    staticCollisionMeshes: StaticCollisionMeshEntryV1[];
    initialSubjectPositionsMetersXYZ: readonly CanonicalSceneVec3V1[];
    walkableSurfaceTopologies: readonly BlockWalkableSurfaceTopologyV1[];
    radius?: number;
  }>) {
    this.#scene = options.scene;
    this.#staticCollisionMeshes = options.staticCollisionMeshes;
    this.#radius = options.radius ?? BLOCK_WORLD_PHYSICS_CHUNK_RADIUS_V1;
    if (!Number.isSafeInteger(this.#radius) || this.#radius < 1) {
      throw new RangeError("Block World physics chunk radius must be a positive safe integer.");
    }
    this.#collidersByChunkKey = Object.freeze(groupBy(
      options.colliders,
      (collider) => colliderChunkKey(collider)!,
    ));
    this.#walkableSurfacesByChunkKey = Object.freeze(groupBy(
      options.walkableSurfaceTopologies,
      ({ chunkKey }) => chunkKey,
    ));
    try {
      this.update(options.initialSubjectPositionsMetersXYZ);
    } catch (error) {
      try {
        this.dispose();
      } catch {
        // Preserve the construction failure after best-effort cleanup.
      }
      throw error;
    }
  }

  get activeChunkCount(): number {
    return this.#activeByChunkKey.size;
  }

  get activeColliderCount(): number {
    return this.#staticCollisionMeshes.filter(({ mesh }) =>
      typeof mesh.metadata?.blockWorldCollisionChunkKey === "string").length;
  }

  get activeGroundBoundaryChunkCount(): number {
    return [...this.#activeByChunkKey.values()].filter(
      ({ groundBoundary }) => groundBoundary !== undefined,
    ).length;
  }

  update(subjectPositionsMetersXYZ: readonly CanonicalSceneVec3V1[]): void {
    if (this.#disposed) throw new Error("BLOCK_WORLD_COLLISION_RESIDENCY_DISPOSED");
    const desired = new Set<string>();
    for (const position of subjectPositionsMetersXYZ) {
      const centerChunkX = Math.floor(position[0] / BLOCK_WORLD_CHUNK_SIZE_METERS_V2);
      const centerChunkZ = Math.floor(position[2] / BLOCK_WORLD_CHUNK_SIZE_METERS_V2);
      for (let zOffset = -this.#radius; zOffset <= this.#radius; zOffset += 1) {
        for (let xOffset = -this.#radius; xOffset <= this.#radius; xOffset += 1) {
          const key = chunkKey(centerChunkX + xOffset, centerChunkZ + zOffset);
          if (this.#collidersByChunkKey[key] !== undefined) desired.add(key);
        }
      }
    }
    for (const key of [...this.#activeByChunkKey.keys()].sort()) {
      if (!desired.has(key)) this.#deactivate(key);
    }
    for (const key of [...desired].sort()) {
      if (!this.#activeByChunkKey.has(key)) this.#activate(key);
    }
  }

  #activate(key: string): void {
    const colliders = this.#collidersByChunkKey[key];
    if (colliders === undefined || colliders.length === 0) return;
    const mesh = createMergedChunkMesh(
      key,
      colliders,
      this.#walkableSurfacesByChunkKey[key] ?? [],
      this.#scene,
    );
    let shape: PhysicsShapeMesh | undefined;
    let aggregate: PhysicsAggregate | undefined;
    let groundBoundaryMesh: Mesh | undefined;
    let groundBoundaryShape: PhysicsShapeMesh | undefined;
    let groundBoundaryAggregate: PhysicsAggregate | undefined;
    try {
      shape = new PhysicsShapeMesh(mesh, this.#scene);
      aggregate = new PhysicsAggregate(
        mesh,
        shape,
        { mass: 0, friction: 0.75, restitution: 0 },
        this.#scene,
      );
      groundBoundaryMesh = createGroundBoundaryMesh(
        key,
        this.#walkableSurfacesByChunkKey[key] ?? [],
        this.#scene,
      );
      if (groundBoundaryMesh !== undefined) {
        groundBoundaryShape = new PhysicsShapeMesh(
          groundBoundaryMesh,
          this.#scene,
        );
        groundBoundaryShape.filterMembershipMask =
          BLOCK_WORLD_GROUND_BOUNDARY_MEMBERSHIP_MASK_V1;
        groundBoundaryShape.filterCollideMask = 0xffffffff;
        groundBoundaryAggregate = new PhysicsAggregate(
          groundBoundaryMesh,
          groundBoundaryShape,
          { mass: 0, friction: 0, restitution: 0 },
          this.#scene,
        );
      }
      this.#activeByChunkKey.set(key, {
        mesh,
        shape,
        aggregate,
        ...(groundBoundaryMesh === undefined ||
            groundBoundaryShape === undefined ||
            groundBoundaryAggregate === undefined
          ? {}
          : {
              groundBoundary: Object.freeze({
                mesh: groundBoundaryMesh,
                shape: groundBoundaryShape,
                aggregate: groundBoundaryAggregate,
              }),
            }),
      });
      this.#staticCollisionMeshes.push(...colliders.map((collider) => ({
        collider,
        mesh,
      })));
    } catch (error) {
      try { groundBoundaryAggregate?.dispose(); } catch {}
      try { groundBoundaryShape?.dispose(); } catch {}
      try { groundBoundaryMesh?.dispose(); } catch {}
      try { aggregate?.dispose(); } catch {}
      try { shape?.dispose(); } catch {}
      try { mesh.dispose(); } catch {}
      throw error;
    }
  }

  #deactivate(key: string): void {
    const active = this.#activeByChunkKey.get(key);
    if (active === undefined) return;
    this.#activeByChunkKey.delete(key);
    for (let index = this.#staticCollisionMeshes.length - 1; index >= 0; index -= 1) {
      if (this.#staticCollisionMeshes[index]!.mesh === active.mesh) {
        this.#staticCollisionMeshes.splice(index, 1);
      }
    }
    let firstFailure: unknown;
    for (const release of [
      () => active.groundBoundary?.aggregate.dispose(),
      () => active.groundBoundary?.shape.dispose(),
      () => active.groundBoundary?.mesh.dispose(),
      () => active.aggregate.dispose(),
      () => active.shape.dispose(),
      () => active.mesh.dispose(),
    ]) {
      try {
        release();
      } catch (error) {
        firstFailure ??= error;
      }
    }
    if (firstFailure !== undefined) throw firstFailure;
  }

  dispose(): void {
    if (this.#disposed) return;
    let firstFailure: unknown;
    for (const key of [...this.#activeByChunkKey.keys()].sort()) {
      try {
        this.#deactivate(key);
      } catch (error) {
        firstFailure ??= error;
      }
    }
    this.#disposed = true;
    if (firstFailure !== undefined) throw firstFailure;
  }
}

export function partitionBlockWorldStaticCollidersV1(
  colliders: readonly CanonicalSceneStaticColliderV1[],
): Readonly<{
  blockWorldColliders: readonly CanonicalSceneStaticColliderV1[];
  genericColliders: readonly CanonicalSceneStaticColliderV1[];
}> {
  const blockWorldColliders: CanonicalSceneStaticColliderV1[] = [];
  const genericColliders: CanonicalSceneStaticColliderV1[] = [];
  for (const collider of colliders) {
    (colliderChunkKey(collider) === undefined
      ? genericColliders
      : blockWorldColliders).push(collider);
  }
  return Object.freeze({
    blockWorldColliders: Object.freeze(blockWorldColliders),
    genericColliders: Object.freeze(genericColliders),
  });
}
