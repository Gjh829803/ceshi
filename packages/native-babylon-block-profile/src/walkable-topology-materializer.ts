import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { BabylonNativeSceneBuildContextV1 } from
  "@whitebox-world/native-babylon";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import {
  failBabylonNativeBlockProfileBuildV1 as fail,
} from "./build-failure.js";
import type {
  BabylonNativeBlockColliderCandidateInventoryEntryV1,
} from "./collider-contribution.js";
import type {
  BabylonNativeBlockTopologyGeometryV1,
  BabylonNativeBlockWalkableTopologyV1,
} from "./walkable-topology.js";
import {
  replaceBabylonNativeBlockLiveHandleRegistryV1,
  type BabylonNativeBlockLiveHandleRegistryV1,
  type BabylonNativeBlockWalkableOverlayHandleV1,
} from "./live-handle-registry.js";

export interface MaterializedBabylonNativeBlockWalkableTopologyV1 {
  readonly topology: BabylonNativeBlockWalkableTopologyV1;
  readonly colliderInventory:
    readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[];
  readonly collisionMeshes: readonly Mesh[];
  readonly walkableOverlays:
    readonly BabylonNativeBlockWalkableOverlayHandleV1[];
  readonly liveHandles: BabylonNativeBlockLiveHandleRegistryV1;
  dispose(): void;
}

const STABLE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function topologyIsCurrent(topology: BabylonNativeBlockWalkableTopologyV1):
boolean {
  if (
    topology.kind !== "babylon-native-block-walkable-topology" ||
    topology.schemaVersion !== 1 ||
    !Object.isFrozen(topology)
  ) return false;
  const { topologyHash, ...body } = topology;
  return sha256CanonicalJson(body) === topologyHash;
}

function createTopologyMesh(input: Readonly<{
  name: string;
  positionsMetersXYZ: readonly number[];
  triangleIndices: readonly number[];
  normals?: readonly number[];
  isVisible: boolean;
  scene: BabylonNativeSceneBuildContextV1["scene"];
}>): Mesh {
  const mesh = new Mesh(input.name, input.scene);
  try {
    mesh.setVerticesData(
      VertexBuffer.PositionKind,
      [...input.positionsMetersXYZ],
      false,
    );
    mesh.setIndices([...input.triangleIndices]);
    if (input.normals !== undefined) {
      mesh.setVerticesData(VertexBuffer.NormalKind, [...input.normals], false);
    }
    mesh.isVisible = input.isVisible;
    mesh.isPickable = false;
    mesh.receiveShadows = input.isVisible;
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo();
    return mesh;
  } catch (error) {
    try {
      mesh.dispose();
    } catch {
      // The original construction error remains authoritative. Candidate
      // admission will reject this Build Epoch and dispose its Scene.
    }
    throw error;
  }
}

function disposeMeshes(
  meshes: readonly Mesh[],
): Readonly<{ didFail: boolean; error: unknown }> {
  let didFail = false;
  let firstFailure: unknown;
  for (let index = meshes.length - 1; index >= 0; index -= 1) {
    try {
      meshes[index]!.dispose();
    } catch (error) {
      if (!didFail) {
        didFail = true;
        firstFailure = error;
      }
    }
  }
  return Object.freeze({ didFail, error: firstFailure });
}

function nonEmptySourceBlockIds(
  geometry: Pick<BabylonNativeBlockTopologyGeometryV1, "logicalColliderId" | "sourceBlockIds">,
): readonly [string, ...string[]] {
  if (geometry.sourceBlockIds.length === 0) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_TOPOLOGY_MATERIALIZATION_INVALID",
      `Collider '${geometry.logicalColliderId}' has no source Blocks.`,
    );
  }
  return Object.freeze([...geometry.sourceBlockIds]) as
    readonly [string, ...string[]];
}

export function materializeBabylonNativeBlockWalkableTopologyV1(
  input: Readonly<{
    context: BabylonNativeSceneBuildContextV1;
    topology: BabylonNativeBlockWalkableTopologyV1;
    liveHandles: BabylonNativeBlockLiveHandleRegistryV1;
  }>,
): MaterializedBabylonNativeBlockWalkableTopologyV1 {
  const { context, topology } = input;
  if (
    !STABLE_ID.test(context.bootstrap.id) ||
    context.scene.isDisposed ||
    !topologyIsCurrent(topology)
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_TOPOLOGY_MATERIALIZATION_INVALID",
      "Walkable topology materialization requires one live Build Epoch and current topology identity.",
    );
  }
  const geometries = [
    ...topology.walkableGeometries,
    ...topology.solidGeometries,
  ].sort((left, right) =>
    stableCompare(left.logicalColliderId, right.logicalColliderId));
  if (
    geometries.length !== topology.logicalColliderCount ||
    new Set(geometries.map(({ logicalColliderId }) => logicalColliderId)).size !==
      geometries.length ||
    geometries.some((geometry) =>
      geometry.vertexCount !== geometry.collisionPositionsMetersXYZ.length / 3 ||
      geometry.triangleCount !== geometry.triangleIndices.length / 3 ||
      geometry.sourceBlockIds.length === 0)
  ) {
    return fail(
      "WORLDKIT_NATIVE_BLOCK_TOPOLOGY_MATERIALIZATION_INVALID",
      "Topology inventory, geometry counts and logical Collider IDs must agree before allocation.",
    );
  }

  const collisionMeshes: Mesh[] = [];
  const overlayMeshes: Mesh[] = [];
  const colliderInventory:
    BabylonNativeBlockColliderCandidateInventoryEntryV1[] = [];
  const walkableOverlays: BabylonNativeBlockWalkableOverlayHandleV1[] = [];
  let materializedLiveHandles: BabylonNativeBlockLiveHandleRegistryV1 | undefined;
  try {
    for (const geometry of geometries) {
      const sourceBlockIds = nonEmptySourceBlockIds(geometry);
      const collisionMesh = createTopologyMesh({
        name:
          `worldkit-block-topology-collider-${context.bootstrap.id}-${geometry.logicalColliderId}`,
        positionsMetersXYZ: geometry.collisionPositionsMetersXYZ,
        triangleIndices: geometry.triangleIndices,
        isVisible: false,
        scene: context.scene,
      });
      collisionMeshes.push(collisionMesh);
      colliderInventory.push(Object.freeze({
        colliderId: geometry.logicalColliderId,
        sourceBlockIds,
        visualGroupIds: geometry.visualGroupIds,
        proxyKind: geometry.proxyKind,
        traversalBinding: geometry.traversalBinding,
        exposedEdgePolicy: geometry.exposedEdgePolicy,
        ...(!Object.hasOwn(geometry, "frictionRatio")
          ? {}
          : { frictionRatio: geometry.frictionRatio }),
        ...(!Object.hasOwn(geometry, "restitutionRatio")
          ? {}
          : { restitutionRatio: geometry.restitutionRatio }),
        minimumMetersXYZ: geometry.minimumMetersXYZ,
        maximumMetersXYZ: geometry.maximumMetersXYZ,
        vertexCount: geometry.vertexCount,
        triangleCount: geometry.triangleCount,
        topologyHash: topology.topologyHash,
      }));
      if (geometry.proxyKind !== "continuous-walkable-surface") continue;
      // Shared vertices keep the original complete-surface normals at group seams.
      const normals: number[] = [];
      VertexData.ComputeNormals(geometry.overlayPositionsMetersXYZ, geometry.triangleIndices, normals);
      for (const [partitionIndex, partition] of geometry.overlayPartitions.entries()) {
        const partitionSourceBlockIds = nonEmptySourceBlockIds({
          logicalColliderId: geometry.logicalColliderId,
          sourceBlockIds: partition.sourceBlockIds,
        });
        const overlayMesh = createTopologyMesh({
          name:
            `worldkit-block-walkable-overlay-${context.bootstrap.id}-${geometry.logicalColliderId}-${partitionIndex}`,
          positionsMetersXYZ: geometry.overlayPositionsMetersXYZ,
          triangleIndices: partition.triangleIndices,
          normals,
          isVisible: true,
          scene: context.scene,
        });
        overlayMeshes.push(overlayMesh);
        walkableOverlays.push(Object.freeze({
          logicalColliderId: geometry.logicalColliderId,
          sourceBlockIds: partitionSourceBlockIds,
          visualGroupIds: partition.visualGroupIds,
          topologyHash: topology.topologyHash,
          mesh: overlayMesh,
        }));
      }
    }
    for (let index = 0; index < geometries.length; index += 1) {
      const geometry = geometries[index]!;
      context.registration.registerStaticCollider(Object.freeze({
        id: geometry.logicalColliderId,
        mesh: collisionMeshes[index]!,
        traversalBinding: geometry.traversalBinding,
        ...(!Object.hasOwn(geometry, "frictionRatio")
          ? {}
          : { frictionRatio: geometry.frictionRatio }),
        ...(!Object.hasOwn(geometry, "restitutionRatio")
          ? {}
          : { restitutionRatio: geometry.restitutionRatio }),
      }));
    }
    materializedLiveHandles = Object.freeze({
      ...input.liveHandles,
      walkableOverlays: Object.freeze(walkableOverlays),
    });
    replaceBabylonNativeBlockLiveHandleRegistryV1(
      context.scene,
      input.liveHandles,
      materializedLiveHandles,
    );
  } catch (error) {
    disposeMeshes([...collisionMeshes, ...overlayMeshes]);
    throw error;
  }

  let isDisposed = false;
  const allMeshes = Object.freeze([...collisionMeshes, ...overlayMeshes]);
  const settledLiveHandles = materializedLiveHandles!;
  return Object.freeze({
    topology,
    colliderInventory: Object.freeze(colliderInventory),
    collisionMeshes: Object.freeze(collisionMeshes),
    walkableOverlays: Object.freeze(walkableOverlays),
    liveHandles: settledLiveHandles,
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      let registryError: unknown;
      try {
        replaceBabylonNativeBlockLiveHandleRegistryV1(
          context.scene,
          settledLiveHandles,
          input.liveHandles,
        );
      } catch (error) {
        registryError = error;
      }
      const cleanup = disposeMeshes(allMeshes);
      if (!isNil(registryError)) throw registryError;
      if (cleanup.didFail && !isNil(cleanup.error)) throw cleanup.error;
    },
  });
}
