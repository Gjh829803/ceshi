import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  CameraHardDecolliderV1,
  type CameraGeometryHitV2,
  type CameraHardDecolliderTransactionStateV1,
  type CameraGeometryQueryPortV2,
  type CameraRigParametersV1,
} from "@whitebox-world/camera";
import { SceneComponentV1 } from "@whitebox-world/runtime-framework";
import type { RuntimeVec3V1 } from "@whitebox-world/runtime-contracts";

const EMERGENCY_VALIDATION_TOLERANCE_METERS_V1 = 1e-5;

export interface SpringArmSolveRequestV1 {
  readonly committedTick: number;
  readonly excludedEntityIds: readonly string[];
  readonly desiredTarget: Vector3;
  /** Actual LookAt after target smoothing/transition; always validated before commit. */
  readonly resolvedTarget: Vector3;
  /** Full ideal arm about desiredTarget, before position damping/transition. */
  readonly desiredPosition: Vector3;
  /** Director's smoothed position, used only when the ideal arm is not retracted. */
  readonly unconstrainedPosition: Vector3;
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
 * Recover the ideal arm before position damping, as in the pinned-old chain.
 * When clear, validate the Director's unconstrained smoothed pose as well.
 * The final path is validated from the actual LookAt, even while retracted.
 * The bounded path uses at most three queries including emergency validation.
 * Only Director writes Camera.
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
    const before = this.hardDecollider.captureTransactionState();
    try {
      const solved = this.solvePose(input, this.query(input, input.desiredTarget, input.desiredPosition));
      if (solved.decollisionPhase === "emergency-inside") return solved;
      const position = solved.isCollisionRetracted ? solved.position : input.unconstrainedPosition;
      if (position.equals(solved.position) && input.resolvedTarget.equals(solved.resolvedTarget)) return solved;

      const finalHit = this.query(input, input.resolvedTarget, position);
      const armLengthMeters = Vector3.Distance(input.resolvedTarget, position);
      let final: SpringArmSolveResultV1;
      if (finalHit !== undefined && (finalHit.startedOverlapping ||
        finalHit.travelDistanceMeters < armLengthMeters)) {
        // The nominal-arm solve already advanced time. This is only a final
        // safety clamp, owned by the same Decollider in the same transaction.
        this.hardDecollider.prepareFinalClamp(
          input.committedTick,
          freezeVec3(position),
          freezeVec3(input.resolvedTarget),
        );
        final = this.solvePose({
          ...input,
          desiredTarget: input.resolvedTarget,
          desiredPosition: position,
          deltaSeconds: 0,
        }, finalHit);
      } else {
        final = Object.freeze({
          ...solved,
          position: position.clone(),
          resolvedTarget: input.resolvedTarget.clone(),
          safeArmLengthMeters: armLengthMeters,
          effectiveArmLengthMeters: armLengthMeters,
        });
      }
      this.hardDecollider.commitValidatedPose(
        input.committedTick,
        freezeVec3(final.position),
        freezeVec3(input.desiredTarget),
      );
      return final;
    } catch (error) {
      this.hardDecollider.restoreTransactionState(before);
      throw error;
    }
  }

  private query(input: SpringArmSolveRequestV1, start: Vector3, end: Vector3): CameraGeometryHitV2 | undefined {
    return input.cameraGeometryQuery.query({
      schemaVersion: 2,
      committedTick: input.committedTick,
      startPositionMetersXYZ: freezeVec3(start),
      endPositionMetersXYZ: freezeVec3(end),
      radiusMeters: input.parameters.collisionRadiusMeters,
      collisionMask: "camera-hard",
      excludedEntityIds: Object.freeze([...input.excludedEntityIds]),
      maximumHitCount: 1,
    });
  }

  private solvePose(input: SpringArmSolveRequestV1, geometryHit: CameraGeometryHitV2 | undefined): SpringArmSolveResultV1 {
    const desiredArmLengthMeters = Vector3.Distance(
      input.desiredTarget,
      input.desiredPosition,
    );
    const beforeEmergency = this.hardDecollider.captureTransactionState();
    const solved = this.hardDecollider.solve({
      authorityTick: input.committedTick,
      desiredTargetPositionMetersXYZ: freezeVec3(input.desiredTarget),
      desiredPositionMetersXYZ: freezeVec3(input.desiredPosition),
      currentCommittedPositionMetersXYZ: freezeVec3(input.currentCommittedPosition),
      minimumUsableArmLengthMeters: Math.min(
        desiredArmLengthMeters,
        input.parameters.minimumDistanceMeters,
      ),
      // Preserve the pinned-old profile response: immediate, linear recovery.
      // Hard Decollider still owns temporal state and collision-safe placement.
      clearHoldSeconds: 0,
      recoveryHalfLifeSeconds: 0,
      maximumRecoveryMetersPerSecond: input.parameters.collisionRecoveryMetersPerSecond,
      deltaSeconds: input.deltaSeconds,
      ...(geometryHit === undefined ? {} : { geometryHit }),
    });
    if (geometryHit?.startedOverlapping === true) {
      try {
        const validationHit = this.query(
          input,
          new Vector3(...solved.resolvedTargetPositionMetersXYZ),
          new Vector3(...solved.positionMetersXYZ),
        );
        const validationArmLengthMeters = Vector3.Distance(
          new Vector3(...solved.resolvedTargetPositionMetersXYZ),
          new Vector3(...solved.positionMetersXYZ),
        );
        if (validationHit !== undefined && (
          validationHit.startedOverlapping ||
          validationHit.travelDistanceMeters < validationArmLengthMeters -
            EMERGENCY_VALIDATION_TOLERANCE_METERS_V1
        )) {
          throw new Error("CAMERA_HARD_DECOLLIDER_EMERGENCY_POSE_UNSAFE");
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
