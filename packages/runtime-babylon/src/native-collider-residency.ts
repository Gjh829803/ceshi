import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { PhysicsAggregate } from
  "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeMesh } from "@babylonjs/core/Physics/v2/physicsShape.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  partitionBabylonNativeBlockCollisionIntoChunksV1,
  type BabylonNativeBlockChunkPolicyV1,
  type BabylonNativeBlockCollisionChunkPartV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import type { Sha256HashV1 } from "@whitebox-world/protocol";
import type {
  BabylonNativeStaticColliderContributionV1,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

import {
  GROUND_SAFETY_BOUNDARY_MEMBERSHIP_MASK_V1,
} from "./ground-safety-boundary-filter.js";
import type {
  BabylonNativeLiveColliderHandleV1,
} from "./babylon-native-live-collider-registry.js";

/**
 * Bounded Runtime-owned physics residency policy. Native Block visuals are
 * always resident and far-visible; only Havok collision parts follow this ring.
 */
export interface BabylonNativeColliderResidencyPolicyV1 {
  readonly kind: "babylon-native-collider-residency-policy";
  readonly schemaVersion: 1;
  readonly activationRadiusMeters: number;
  readonly releaseRadiusMeters: number;
}

export const BABYLON_NATIVE_COLLIDER_RESIDENCY_POLICY_V1:
  BabylonNativeColliderResidencyPolicyV1 = Object.freeze({
    kind: "babylon-native-collider-residency-policy",
    schemaVersion: 1,
    // One fixed 60 Hz tick moves a Subject far less than this ring, and the
    // release ring adds hysteresis so a Subject standing on a Chunk seam cannot
    // thrash its own support geometry.
    activationRadiusMeters: 48,
    releaseRadiusMeters: 64,
  });

export interface BabylonNativeColliderResidencyMetricsV1 {
  readonly logicalColliderCount: number;
  readonly partCount: number;
  readonly activePartCount: number;
  readonly peakActivePartCount: number;
  readonly activationCount: number;
  readonly releaseCount: number;
  readonly updateCount: number;
}

export interface BabylonNativeColliderResidencyV1 {
  readonly policy: BabylonNativeColliderResidencyPolicyV1;
  readonly chunkPolicyHash: Sha256HashV1;
  readonly partitionHash: Sha256HashV1;
  readonly parts: readonly BabylonNativeBlockCollisionChunkPartV1[];
  activeHandles(): readonly BabylonNativeLiveColliderHandleV1[];
  metrics(): BabylonNativeColliderResidencyMetricsV1;
  /**
   * Bring the resident set in line with the union of every active Subject
   * position. The Host calls this once with the Spawn positions before
   * readiness and again before each fixed physics Tick.
   */
  update(
    subjectPositionsMetersXYZ:
      readonly (readonly [number, number, number])[],
  ): boolean;
  dispose(): void;
}

export interface BabylonNativeColliderResidencyCameraOwnerV1 {
  registerEntityPhysicsBody(
    entityId: string,
    body: BabylonNativeLiveColliderHandleV1["body"],
  ): void;
  setEntityQueryEnabled(entityId: string, enabled: boolean): void;
  unregisterEntityPhysicsBody(entityId: string): void;
}

export interface CreateBabylonNativeColliderResidencyInputV1 {
  readonly scene: Scene;
  readonly chunkPolicy: BabylonNativeBlockChunkPolicyV1;
  readonly colliders: readonly BabylonNativeStaticColliderContributionV1[];
  readonly sourceBlockIdByColliderId: ReadonlyMap<string, string>;
  readonly cameraGeometryQuery: BabylonNativeColliderResidencyCameraOwnerV1;
  readonly policy?: BabylonNativeColliderResidencyPolicyV1;
  readonly applyColliderMetadata: (
    mesh: Mesh,
    collider: BabylonNativeStaticColliderContributionV1,
  ) => void;
}

interface ResidentPartV1 {
  readonly part: BabylonNativeBlockCollisionChunkPartV1;
  readonly collider: BabylonNativeStaticColliderContributionV1;
  readonly handle: BabylonNativeLiveColliderHandleV1;
  readonly cameraEntityId?: string;
}

const CODE = "WORLDKIT_NATIVE_COLLIDER_RESIDENCY_INVALID";

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function squaredPlanarGap(
  part: BabylonNativeBlockCollisionChunkPartV1,
  position: readonly [number, number, number],
): number {
  const deltaX = Math.max(
    part.minimumMetersXYZ[0] - position[0],
    0,
    position[0] - part.maximumMetersXYZ[0],
  );
  const deltaZ = Math.max(
    part.minimumMetersXYZ[2] - position[2],
    0,
    position[2] - part.maximumMetersXYZ[2],
  );
  return deltaX * deltaX + deltaZ * deltaZ;
}

export function createBabylonNativeColliderResidencyV1(
  input: CreateBabylonNativeColliderResidencyInputV1,
): BabylonNativeColliderResidencyV1 {
  const policy = input.policy ?? BABYLON_NATIVE_COLLIDER_RESIDENCY_POLICY_V1;
  if (
    policy.kind !== "babylon-native-collider-residency-policy" ||
    policy.schemaVersion !== 1 ||
    !Number.isFinite(policy.activationRadiusMeters) ||
    !Number.isFinite(policy.releaseRadiusMeters) ||
    policy.activationRadiusMeters <= 0 ||
    policy.releaseRadiusMeters < policy.activationRadiusMeters
  ) {
    throw new TypeError(
      `${CODE}: residency policy must declare one bounded activation ring with release hysteresis.`,
    );
  }
  const colliderById = new Map(input.colliders.map((collider) =>
    [collider.id, collider] as const));
  if (colliderById.size !== input.colliders.length) {
    throw new TypeError(`${CODE}: Collider IDs must be unique.`);
  }
  const partition = partitionBabylonNativeBlockCollisionIntoChunksV1({
    chunkPolicy: input.chunkPolicy,
    colliders: input.colliders.map((collider) => Object.freeze({
      colliderId: collider.id,
      worldPositionsMetersXYZ: collider.worldPositionsMetersXYZ,
      triangleIndices: collider.triangleIndices,
    })),
  });
  const parts = [...partition.parts]
    .sort((left, right) => stableCompare(left.partId, right.partId));

  const residentByPartId = new Map<string, ResidentPartV1>();
  let peakActivePartCount = 0;
  let activationCount = 0;
  let releaseCount = 0;
  let updateCount = 0;
  let isDisposed = false;

  const activate = (part: BabylonNativeBlockCollisionChunkPartV1): void => {
    const collider = colliderById.get(part.logicalColliderId)!;
    const mesh = new Mesh(
      `worldkit.native-collider.${part.partId}`,
      input.scene,
    );
    let shape: PhysicsShapeMesh | undefined;
    let aggregate: PhysicsAggregate | undefined;
    let cameraEntityId: string | undefined;
    try {
      const normals: number[] = [];
      VertexData.ComputeNormals(
        part.worldPositionsMetersXYZ,
        part.triangleIndices,
        normals,
      );
      const vertexData = new VertexData();
      vertexData.positions = [...part.worldPositionsMetersXYZ];
      vertexData.indices = [...part.triangleIndices];
      vertexData.normals = normals;
      vertexData.applyToMesh(mesh, false);
      input.applyColliderMetadata(mesh, collider);
      mesh.isVisible = false;
      mesh.isPickable = false;
      mesh.computeWorldMatrix(true);
      shape = new PhysicsShapeMesh(mesh, input.scene);
      if (collider.runtimeRole === "ground-safety-boundary") {
        shape.filterMembershipMask = GROUND_SAFETY_BOUNDARY_MEMBERSHIP_MASK_V1;
        shape.filterCollideMask = 0xffff_ffff;
      }
      aggregate = new PhysicsAggregate(
        mesh,
        shape,
        {
          mass: 0,
          friction: collider.frictionRatio,
          restitution: collider.restitutionRatio,
        },
        input.scene,
      );
      if (collider.runtimeRole === "ground-safety-boundary") {
        cameraEntityId = `ground-safety-boundary:${part.partId}`;
        input.cameraGeometryQuery.registerEntityPhysicsBody(
          cameraEntityId,
          aggregate.body,
        );
        input.cameraGeometryQuery.setEntityQueryEnabled(cameraEntityId, false);
      }
    } catch (error) {
      releaseResources(
        mesh,
        shape,
        aggregate,
        cameraEntityId,
        input.cameraGeometryQuery,
      );
      throw error;
    }
    residentByPartId.set(part.partId, Object.freeze({
      part,
      collider,
      handle: Object.freeze({
        colliderId: collider.id,
        chunkPartId: part.partId,
        chunkResidencyGroupId: part.chunkResidencyGroupId,
        runtimeRole: collider.runtimeRole,
        colliderSubshapeId: collider.colliderSubshapeId,
        ...(isNil(input.sourceBlockIdByColliderId.get(collider.id))
          ? {}
          : { sourceBlockId: input.sourceBlockIdByColliderId.get(collider.id)! }),
        physicsBodyId: `physics-body:${part.partId}`,
        overlayRecordId: `overlay:${part.partId}`,
        mesh,
        aggregate: aggregate!,
        body: aggregate!.body,
        shape: aggregate!.shape,
      }),
      ...(isNil(cameraEntityId) ? {} : { cameraEntityId }),
    }));
    activationCount += 1;
    peakActivePartCount = Math.max(
      peakActivePartCount,
      residentByPartId.size,
    );
  };

  const release = (partId: string): void => {
    const resident = residentByPartId.get(partId);
    if (isNil(resident)) return;
    residentByPartId.delete(partId);
    releaseCount += 1;
    releaseResources(
      resident.handle.mesh,
      resident.handle.shape as PhysicsShapeMesh,
      resident.handle.aggregate,
      resident.cameraEntityId,
      input.cameraGeometryQuery,
    );
  };

  return Object.freeze({
    policy,
    chunkPolicyHash: partition.chunkPolicyHash,
    partitionHash: partition.partitionHash,
    parts: Object.freeze(parts),
    activeHandles(): readonly BabylonNativeLiveColliderHandleV1[] {
      return Object.freeze([...residentByPartId.values()]
        .map(({ handle }) => handle)
        .sort((left, right) =>
          stableCompare(left.chunkPartId, right.chunkPartId)));
    },
    metrics(): BabylonNativeColliderResidencyMetricsV1 {
      return Object.freeze({
        logicalColliderCount: partition.logicalColliderCount,
        partCount: partition.partCount,
        activePartCount: residentByPartId.size,
        peakActivePartCount,
        activationCount,
        releaseCount,
        updateCount,
      });
    },
    update(
      subjectPositionsMetersXYZ:
        readonly (readonly [number, number, number])[],
    ): boolean {
      if (isDisposed) {
        throw new TypeError(`${CODE}: residency is disposed.`);
      }
      if (
        !Array.isArray(subjectPositionsMetersXYZ) ||
        subjectPositionsMetersXYZ.length === 0 ||
        subjectPositionsMetersXYZ.some((position) =>
          !Array.isArray(position) ||
          position.length !== 3 ||
          position.some((value) => typeof value !== "number" ||
            !Number.isFinite(value)))
      ) {
        throw new TypeError(
          `${CODE}: residency requires at least one finite active Subject position.`,
        );
      }
      updateCount += 1;
      const activationSquared = policy.activationRadiusMeters ** 2;
      const releaseSquared = policy.releaseRadiusMeters ** 2;
      const desiredPartIds = new Set<string>();
      for (const part of parts) {
        const nearestSquared = Math.min(...subjectPositionsMetersXYZ.map(
          (position) => squaredPlanarGap(part, position),
        ));
        const isResident = residentByPartId.has(part.partId);
        if (nearestSquared <= activationSquared) {
          desiredPartIds.add(part.partId);
          continue;
        }
        if (isResident && nearestSquared <= releaseSquared) {
          desiredPartIds.add(part.partId);
        }
      }
      let didChange = false;
      for (const partId of [...residentByPartId.keys()].sort(stableCompare)) {
        if (desiredPartIds.has(partId)) continue;
        release(partId);
        didChange = true;
      }
      const activated: string[] = [];
      try {
        for (const part of parts) {
          if (
            !desiredPartIds.has(part.partId) ||
            residentByPartId.has(part.partId)
          ) continue;
          activate(part);
          activated.push(part.partId);
          didChange = true;
        }
      } catch (error) {
        // Fail closed: a partially activated ring is never published.
        for (let index = activated.length - 1; index >= 0; index -= 1) {
          release(activated[index]!);
        }
        throw error;
      }
      return didChange;
    },
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      let firstFailure: unknown;
      for (const partId of [...residentByPartId.keys()].sort(stableCompare)
        .reverse()) {
        try {
          release(partId);
        } catch (error) {
          firstFailure ??= error;
        }
      }
      residentByPartId.clear();
      if (!isNil(firstFailure)) throw firstFailure;
    },
  });
}

function releaseResources(
  mesh: Mesh,
  shape: PhysicsShapeMesh | undefined,
  aggregate: PhysicsAggregate | undefined,
  cameraEntityId: string | undefined,
  cameraGeometryQuery: BabylonNativeColliderResidencyCameraOwnerV1,
): void {
  let firstFailure: unknown;
  const attempt = (run: () => void): void => {
    try {
      run();
    } catch (error) {
      firstFailure ??= error;
    }
  };
  if (!isNil(cameraEntityId)) {
    attempt(() => cameraGeometryQuery.unregisterEntityPhysicsBody(
      cameraEntityId,
    ));
  }
  if (!isNil(aggregate)) attempt(() => aggregate.dispose());
  if (!isNil(shape)) attempt(() => shape.dispose());
  attempt(() => mesh.dispose());
  if (!isNil(firstFailure)) throw firstFailure;
}
