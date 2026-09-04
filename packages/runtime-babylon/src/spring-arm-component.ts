import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  CameraHardDecolliderV1,
  type CameraHardDecolliderTransactionStateV1,
  type CameraGeometryQueryPortV2,
  type CameraRigParametersV1,
} from "@whitebox-world/camera";
import { SceneComponentV1 } from "@whitebox-world/runtime-framework";
import type { RuntimeVec3V1 } from "@whitebox-world/runtime-contracts";

const CLEAR_HOLD_SECONDS_V1 = 0.12;
const RECOVERY_HALF_LIFE_SECONDS_V1 = 0.24;
const MAXIMUM_RECOVERY_METERS_PER_SECOND_V1 = 3;
const EMERGENCY_VALIDATION_TOLERANCE_METERS_V1 = 1e-5;

export interface SpringArmSolveRequestV1 {
  readonly committedTick: number;
  readonly excludedEntityIds: readonly string[];
  readonly desiredTarget: Vector3;
  readonly desiredPosition: Vector3;
  readonly currentCommittedPosition: Vector3;
  readonly parameters: CameraRigParametersV1;
  readonly deltaSeconds: number;
  readonly cameraGeometryQuery: CameraGeometryQueryPortV2;
}
export interface SpringArmSolveResultV1 {
  readonly position: Vector3;
  readonly resolvedTarget: Vector3;
  readonly safeArmLengthMeters: number;
  readonly effectiveArmLengthMeters: number;
  readonly isCollisionRetracted: boolean;
  readonly decollisionPhase: CameraHardDecolliderTransactionStateV1["phase"];
  readonly collisionHitEntityId?: string;
  readonly collisionHitPositionXYZ?: RuntimeVec3V1;
  readonly collisionHitNormalXYZ?: RuntimeVec3V1;
  readonly startedOverlapping?: boolean;
  readonly penetrationDepthMeters?: number;
  readonly clearHoldRemainingSeconds: number;
}

export interface SpringArmTransactionStateV1 {
  readonly hardDecollider: CameraHardDecolliderTransactionStateV1;
}

function freezeVec3(value: Vector3 | readonly number[]): RuntimeVec3V1 {
  if (value instanceof Vector3) {
    return Object.freeze([value.x, value.y, value.z]) as RuntimeVec3V1;
  }
  return Object.freeze([value[0], value[1], value[2]]) as RuntimeVec3V1;
}

/**
 * Babylon scene adapter for the provider-neutral Hard Decollider.
 *
 * It issues one bounded Camera Geometry V2 query from the exact resolved LookAt
 * target to the already-damped proposed pose. It never writes the Babylon
 * camera; CameraDirector remains the sole final-pose owner.
 */
export class SpringArmComponentV1 extends SceneComponentV1 {
  private readonly hardDecollider = new CameraHardDecolliderV1();

  constructor() {
    super("spring-arm");
  }

  reset(): void {
    this.hardDecollider.reset();
  }

  captureTransactionState(): SpringArmTransactionStateV1 {
    return Object.freeze({
      hardDecollider: this.hardDecollider.captureTransactionState(),
    });
  }

  restoreTransactionState(state: SpringArmTransactionStateV1): void {
    this.hardDecollider.restoreTransactionState(state.hardDecollider);
  }

  solve(input: SpringArmSolveRequestV1): SpringArmSolveResultV1 {
    const query = (start: Vector3, end: Vector3) => input.cameraGeometryQuery.query({
      schemaVersion: 2,
      committedTick: input.committedTick,
      startPositionMetersXYZ: freezeVec3(start),
      endPositionMetersXYZ: freezeVec3(end),
      radiusMeters: input.parameters.collisionRadiusMeters,
      collisionMask: "camera-hard",
      excludedEntityIds: Object.freeze([...input.excludedEntityIds]),
      maximumHitCount: 1,
    });
    const geometryHit = query(input.desiredTarget, input.desiredPosition);
    const desiredArmLengthMeters = Vector3.Distance(
      input.desiredTarget,
      input.desiredPosition,
    );
    const minimumUsableArmLengthMeters = Math.min(
      desiredArmLengthMeters,
      input.parameters.minimumDistanceMeters,
    );
    const beforeEmergency = this.hardDecollider.captureTransactionState();
    const solveHardCollision = (
      currentCommittedPosition: Vector3,
      preferCurrentEmergencyPosition = false,
    ) => this.hardDecollider.solve({
      authorityTick: input.committedTick,
      desiredTargetPositionMetersXYZ: freezeVec3(input.desiredTarget),
      desiredPositionMetersXYZ: freezeVec3(input.desiredPosition),
      currentCommittedPositionMetersXYZ: freezeVec3(currentCommittedPosition),
      minimumUsableArmLengthMeters,
      clearHoldSeconds: CLEAR_HOLD_SECONDS_V1,
      recoveryHalfLifeSeconds: RECOVERY_HALF_LIFE_SECONDS_V1,
      maximumRecoveryMetersPerSecond: Math.min(
        input.parameters.collisionRecoveryMetersPerSecond,
        MAXIMUM_RECOVERY_METERS_PER_SECOND_V1,
      ),
      deltaSeconds: input.deltaSeconds,
      ...(geometryHit === undefined ? {} : { geometryHit }),
      ...(preferCurrentEmergencyPosition
        ? { preferCurrentEmergencyPosition: true }
        : {}),
    });
    let solved = solveHardCollision(input.currentCommittedPosition);
    if (geometryHit?.startedOverlapping === true) {
      try {
        const poseIsUnsafe = (target: Vector3, position: Vector3) => {
          const validationHit = query(target, position);
          const validationArmLengthMeters = Vector3.Distance(target, position);
          return validationHit !== undefined && (
            validationHit.startedOverlapping ||
            validationHit.travelDistanceMeters < validationArmLengthMeters -
              EMERGENCY_VALIDATION_TOLERANCE_METERS_V1
          );
        };
        const resolvedTarget = new Vector3(...solved.resolvedTargetPositionMetersXYZ);
        if (poseIsUnsafe(
          resolvedTarget,
          new Vector3(...solved.positionMetersXYZ),
        )) {
          // The previous Camera can sit across the surface that the LookAt
          // target just escaped. Keep an emergency arm on the same separating
          // side before conceding that no bounded pose exists.
          const emergencyPosition = resolvedTarget.add(
            new Vector3(...geometryHit.hitNormalXYZ).scale(
              minimumUsableArmLengthMeters,
            ),
          );
          if (poseIsUnsafe(resolvedTarget, emergencyPosition)) {
            throw new Error("CAMERA_HARD_DECOLLIDER_EMERGENCY_POSE_UNSAFE");
          }
          this.hardDecollider.restoreTransactionState(beforeEmergency);
          solved = solveHardCollision(emergencyPosition, true);
        }
      } catch (error) {
        this.hardDecollider.restoreTransactionState(beforeEmergency);
        throw error;
      }
    }
    return Object.freeze({
      position: new Vector3(...solved.positionMetersXYZ),
      resolvedTarget: new Vector3(...solved.resolvedTargetPositionMetersXYZ),
      safeArmLengthMeters: solved.safeArmLengthMeters,
      effectiveArmLengthMeters: solved.effectiveArmLengthMeters,
      isCollisionRetracted: solved.isCollisionRetracted,
      decollisionPhase: solved.phase,
      ...(solved.stableHitEntityId === undefined
        ? {}
        : { collisionHitEntityId: solved.stableHitEntityId }),
      ...(solved.stableHitNormalXYZ === undefined
        ? {}
        : { collisionHitNormalXYZ: freezeVec3(solved.stableHitNormalXYZ) }),
      ...(geometryHit === undefined
        ? {}
        : {
            collisionHitPositionXYZ: freezeVec3(geometryHit.hitPointMetersXYZ),
            startedOverlapping: geometryHit.startedOverlapping,
            penetrationDepthMeters: geometryHit.penetrationDepthMeters,
          }),
      clearHoldRemainingSeconds: solved.clearHoldRemainingSeconds,
    });
  }

  protected override onDispose(): void {
    this.reset();
    super.onDispose();
  }
}
