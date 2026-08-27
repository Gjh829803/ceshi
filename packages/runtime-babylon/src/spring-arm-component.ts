import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { CameraRigParametersV1 } from "@whitebox-world/camera";
import {
  SceneComponentV1,
  type PhysicsWorldQueryPortV1,
} from "@whitebox-world/runtime-framework";
import type { Vec3 } from "@whitebox-world/runtime-contracts";

export interface SpringArmSolveRequestV1 {
  readonly subjectEntityId: string;
  readonly desiredTarget: Vector3;
  readonly desiredPosition: Vector3;
  readonly parameters: CameraRigParametersV1;
  readonly deltaSeconds: number;
  readonly physicsWorldQuery: PhysicsWorldQueryPortV1;
}

export interface SpringArmSolveResultV1 {
  readonly position: Vector3;
  readonly safeArmLengthMeters: number;
  readonly effectiveArmLengthMeters: number;
  readonly isCollisionRetracted: boolean;
  readonly collisionHitEntityId?: string;
  readonly collisionHitPositionXYZ?: Vec3;
}

export interface SpringArmTransactionStateV1 {
  readonly collisionDistanceMeters: number | undefined;
}

function moveTowards(current: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

function freezeVec3(value: Vector3): Vec3 {
  return Object.freeze([value.x, value.y, value.z]) as Vec3;
}

/**
 * UE-style scene component that owns third-person arm collision and recovery.
 * `collisionRadiusMeters` is the project-facing ProbeSize: 0 is a ray, while
 * positive values use the physics port's true sphere sweep.
 */
export class SpringArmComponentV1 extends SceneComponentV1 {
  private collisionDistanceMeters: number | undefined;

  constructor() {
    super("spring-arm");
  }

  reset(): void {
    this.collisionDistanceMeters = undefined;
  }

  captureTransactionState(): SpringArmTransactionStateV1 {
    return Object.freeze({ collisionDistanceMeters: this.collisionDistanceMeters });
  }

  restoreTransactionState(state: SpringArmTransactionStateV1): void {
    this.collisionDistanceMeters = state.collisionDistanceMeters;
  }

  solve(input: SpringArmSolveRequestV1): SpringArmSolveResultV1 {
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
    const hit = input.physicsWorldQuery.sweepSphere({
      startPositionMetersXYZ: freezeVec3(input.desiredTarget),
      endPositionMetersXYZ: freezeVec3(input.desiredPosition),
      probeRadiusMeters: input.parameters.collisionRadiusMeters,
      ignoredEntityId: input.subjectEntityId,
    });
    const safeArmLengthMeters = hit === undefined
      ? distance
      : Math.max(0, Math.min(distance, hit.travelDistanceMeters));
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
      ...(hit?.hitEntityId === undefined ? {} : { collisionHitEntityId: hit.hitEntityId }),
      ...(hit === undefined ? {} : {
        collisionHitPositionXYZ: Object.freeze([...hit.hitPositionMetersXYZ]) as Vec3,
      }),
    };
  }

  protected override onDispose(): void {
    this.reset();
    super.onDispose();
  }
}
