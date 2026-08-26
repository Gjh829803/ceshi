import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import type { CameraRigParametersV1 } from "@whitebox-world/camera";
import type { Vec3 } from "@whitebox-world/runtime-contracts";

export type FollowArmSceneQueryV1 = Pick<Scene, "pickWithRay">;

export interface FollowArmSolveRequestV1 {
  readonly subjectEntityId: string;
  readonly desiredTarget: Vector3;
  readonly desiredPosition: Vector3;
  readonly parameters: CameraRigParametersV1;
  readonly deltaSeconds: number;
  readonly sceneQuery: FollowArmSceneQueryV1;
}

export interface FollowArmSolveResultV1 {
  readonly position: Vector3;
  readonly safeArmLengthMeters: number;
  readonly effectiveArmLengthMeters: number;
  readonly isCollisionRetracted: boolean;
  readonly collisionHitEntityId?: string;
  readonly collisionHitPositionXYZ?: Vec3;
}

function moveTowards(current: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

function freezeVec3(value: Vector3): Vec3 {
  return Object.freeze([value.x, value.y, value.z]) as Vec3;
}

/** Owns third-person collision probing and arm retraction/recovery state only. */
export class FollowArmSolverV1 {
  private collisionDistanceMeters: number | undefined;

  reset(): void {
    this.collisionDistanceMeters = undefined;
  }

  solve(input: FollowArmSolveRequestV1): FollowArmSolveResultV1 {
    const displacement = input.desiredPosition.subtract(input.desiredTarget);
    const distance = displacement.length();
    if (distance <= 0.000001) {
      return {
        position: input.desiredPosition,
        safeArmLengthMeters: 0,
        effectiveArmLengthMeters: 0,
        isCollisionRetracted: false,
      };
    }
    const direction = displacement.scale(1 / distance);
    const right = Vector3.Cross(Vector3.Up(), direction).normalize();
    const probeUp = Vector3.Cross(direction, right).normalize();
    const radius = input.parameters.collisionRadiusMeters;
    const offsets = [
      Vector3.Zero(),
      right.scale(radius),
      right.scale(-radius),
      probeUp.scale(radius),
      probeUp.scale(-radius),
    ];
    let safeArmLengthMeters = distance;
    let collisionHitEntityId: string | undefined;
    let collisionHitPositionXYZ: Vec3 | undefined;
    for (const offset of offsets) {
      const ray = new Ray(input.desiredTarget.add(offset), direction, distance);
      const hit = input.sceneQuery.pickWithRay(ray, (mesh) =>
        mesh.isPickable && mesh.metadata?.worldkitEntityId !== input.subjectEntityId
      );
      if (hit?.hit !== true || hit.distance <= 0) continue;
      const nextSafeArmLengthMeters = Math.max(0, hit.distance - radius);
      if (nextSafeArmLengthMeters >= safeArmLengthMeters) continue;
      safeArmLengthMeters = nextSafeArmLengthMeters;
      collisionHitEntityId = typeof hit.pickedMesh?.metadata?.worldkitEntityId === "string"
        ? hit.pickedMesh.metadata.worldkitEntityId
        : undefined;
      collisionHitPositionXYZ = hit.pickedPoint === null || hit.pickedPoint === undefined
        ? undefined
        : freezeVec3(hit.pickedPoint);
    }
    this.collisionDistanceMeters ??= distance;
    if (safeArmLengthMeters <= this.collisionDistanceMeters) {
      this.collisionDistanceMeters = safeArmLengthMeters;
    } else {
      this.collisionDistanceMeters = moveTowards(
        this.collisionDistanceMeters,
        safeArmLengthMeters,
        input.parameters.collisionRecoveryMetersPerSecond * Math.max(0, input.deltaSeconds),
      );
    }
    const effectiveArmLengthMeters = Math.min(distance, this.collisionDistanceMeters);
    return {
      position: input.desiredTarget.add(direction.scale(effectiveArmLengthMeters)),
      safeArmLengthMeters,
      effectiveArmLengthMeters,
      isCollisionRetracted: effectiveArmLengthMeters < distance - 0.000001,
      ...(collisionHitEntityId === undefined ? {} : { collisionHitEntityId }),
      ...(collisionHitPositionXYZ === undefined ? {} : { collisionHitPositionXYZ }),
    };
  }
}
