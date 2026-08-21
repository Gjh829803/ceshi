import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  CharacterSupportedState,
  PhysicsCharacterController,
} from "@babylonjs/core/Physics/v2/characterController.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  ExecutionMotionProfileV1,
  ExecutionMovementMediumV1,
  ExecutionSubjectV3,
  MotionParameterTuningV1,
  Vec3,
} from "@whitebox-world/runtime-contracts";

import type { MotionCommandV1 } from "./control-profile-runtime";
import {
  MotionModeResolverV1,
  type MotionModeFailureCodeV1,
} from "./motion-mode-resolver";
import { FIXED_TIME_STEP_SECONDS } from "./physics";

export interface MotionKernelSnapshotV1 {
  activeMotionProfileRef: string;
  activeMotionKernelRef: string;
  motionTags: readonly string[];
  forwardXYZ: Vec3;
  speedMetersPerSecond: number;
  fallbackActive: boolean;
  parameterTuning: MotionParameterTuningV1;
  lastFailureCode?: "MOTION_PARAMETER_INVALID" | "MOTION_NON_FINITE_STATE";
}

function numberParameter(
  profile: ExecutionMotionProfileV1,
  name: string,
  fallback: number,
): number {
  const value = profile.parameters[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function profileIsValid(profile: ExecutionMotionProfileV1): boolean {
  for (const [name, value] of Object.entries(profile.parameters)) {
    if (typeof value !== "number") continue;
    const limit = profile.safetyLimits[name];
    if (
      !Number.isFinite(value) ||
      limit === undefined ||
      value < limit.minimum ||
      value > limit.maximum
    ) {
      return false;
    }
  }
  return kernelParameterRelationshipsAreValid(profile);
}

function moveTowards(current: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function moveVectorTowards(
  current: Vector3,
  target: Vector3,
  maximumDelta: number,
): Vector3 {
  const delta = target.subtract(current);
  const distance = delta.length();
  if (distance <= maximumDelta || distance <= 0.000001) return target.clone();
  return current.add(delta.scale(maximumDelta / distance));
}

function moveAngleTowards(current: number, target: number, maximumDelta: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + Math.max(-maximumDelta, Math.min(maximumDelta, delta));
}

function smoothstep01(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function kernelParameterRelationshipsAreValid(profile: ExecutionMotionProfileV1): boolean {
  const parameters = profile.parameters;
  const walkSpeed = parameters.walkSpeedMetersPerSecond;
  const runSpeed = parameters.runSpeedMetersPerSecond;
  if (typeof walkSpeed === "number" && typeof runSpeed === "number" && walkSpeed > runSpeed) {
    return false;
  }
  const lowSpeedTurnRate = parameters.lowSpeedTurnRateRadiansPerSecond;
  const highSpeedTurnRate = parameters.highSpeedTurnRateRadiansPerSecond;
  if (
    typeof lowSpeedTurnRate === "number" &&
    typeof highSpeedTurnRate === "number" &&
    highSpeedTurnRate > lowSpeedTurnRate
  ) {
    return false;
  }
  const minimumSpeed = parameters.minimumForwardSpeedMetersPerSecond;
  const maximumSpeed = parameters.maximumForwardSpeedMetersPerSecond;
  const stallSpeed = parameters.stallSpeedMetersPerSecond;
  if (
    typeof minimumSpeed === "number" &&
    typeof maximumSpeed === "number" &&
    (minimumSpeed > maximumSpeed ||
      (typeof stallSpeed === "number" &&
        (stallSpeed < minimumSpeed || stallSpeed > maximumSpeed)))
  ) {
    return false;
  }
  const maximumSinkSpeed = parameters.maximumSinkSpeedMetersPerSecond;
  const maximumClimbSpeed = parameters.maximumClimbSpeedMetersPerSecond;
  if (typeof maximumSinkSpeed === "number" && maximumSinkSpeed < 0) return false;
  if (typeof maximumClimbSpeed === "number" && maximumClimbSpeed < 0) return false;
  return true;
}

export class MotionKernelRuntimeV1 {
  readonly physicsController: PhysicsCharacterController;
  private readonly gravity: Vector3;
  private readonly up = Vector3.Up();
  private readonly colliderCenterOffset: Vector3;
  private readonly motionModeResolver: MotionModeResolverV1;
  private yawRadians: number;
  private forwardSpeedMetersPerSecond = 0;
  private planarVelocity = Vector3.Zero();
  private steeringInput = 0;
  private slideVelocity = Vector3.Zero();
  private flightPitchRadians = 0;
  private flightRollRadians = 0;
  private bodyLeanRadians = 0;
  private turnVelocityRadiansPerSecond = 0;
  private brakeToReverseElapsedSeconds = 0;
  private coyoteRemainingSeconds = 0;
  private jumpBufferRemainingSeconds = 0;
  private jumpHoldElapsedSeconds = 0;
  private jumpInProgress = false;
  private jumpActionWasActive = false;
  private currentMovementMedium: ExecutionMovementMediumV1 = "air";
  private initialGroundSupportPending: boolean;
  private parameterTuning: MotionParameterTuningV1 = {};
  private parameterTuningRevision = 0;
  private effectiveProfileCache: {
    baseProfile: ExecutionMotionProfileV1;
    tuningRevision: number;
    profile: ExecutionMotionProfileV1;
  } | undefined;

  constructor(
    private readonly subject: ExecutionSubjectV3,
    gravityMetersPerSecondSquaredXYZ: Vec3,
    private readonly visualRoot: TransformNode,
    private readonly scene: Scene,
    private readonly waterSurfaceHeightAtSubjectOrigin: (
      subjectOrigin: Vector3,
    ) => number | undefined,
  ) {
    this.gravity = new Vector3(...gravityMetersPerSecondSquaredXYZ);
    this.yawRadians = subject.spawnSubjectFacingRadians;
    this.colliderCenterOffset = new Vector3(
      ...subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
    );
    const compatibilityProfile: ExecutionMotionProfileV1 = {
      resourceRef: "worldkit://motion-profile/legacy-ground.compatibility@1",
      contentHash: "sha256:legacy-motion-profile",
      motionKernelRef: "worldkit://motion-kernel/free-ground@1",
      parameters: {
        walkSpeedMetersPerSecond: subject.locomotion.walkSpeedMetersPerSecond,
        runSpeedMetersPerSecond: subject.locomotion.runSpeedMetersPerSecond,
        jumpSpeedMetersPerSecond: subject.locomotion.jumpSpeedMetersPerSecond,
        accelerationMetersPerSecondSquared: 24,
        decelerationMetersPerSecondSquared: 30,
        turnRateRadiansPerSecond: 12,
        airControlRatio: 0.35,
      },
      safetyLimits: {
        walkSpeedMetersPerSecond: { minimum: 0, maximum: 20 },
        runSpeedMetersPerSecond: { minimum: 0, maximum: 30 },
        jumpSpeedMetersPerSecond: { minimum: 0, maximum: 15 },
        accelerationMetersPerSecondSquared: { minimum: 0, maximum: 60 },
        decelerationMetersPerSecondSquared: { minimum: 0, maximum: 80 },
        turnRateRadiansPerSecond: { minimum: 0, maximum: 30 },
        airControlRatio: { minimum: 0, maximum: 1 },
      },
      motionTags: ["free-ground", "ground", "legacy"],
    };
    const assembly = subject.capabilityAssembly;
    const profiles = assembly === undefined
      ? [compatibilityProfile]
      : [
          assembly.defaultMotionProfile,
          ...assembly.optionalMotionProfiles,
          assembly.fallbackMotionProfile,
        ];
    this.motionModeResolver = new MotionModeResolverV1(
      assembly?.defaultMotionProfile ?? compatibilityProfile,
      assembly?.fallbackMotionProfile ?? compatibilityProfile,
      profiles,
      profileIsValid,
    );

    const spawnSubjectOrigin = new Vector3(...subject.spawnSubjectOriginPositionMetersXYZ);
    this.physicsController = new PhysicsCharacterController(
      spawnSubjectOrigin.add(this.colliderCenterOffset),
      {
        capsuleHeight: subject.collider.heightMeters,
        capsuleRadius: subject.collider.radiusMeters,
      },
      scene,
    );
    this.physicsController.maxSlopeCosine = Math.cos(
      (subject.collider.maxSlopeDegrees * Math.PI) / 180,
    );
    this.physicsController.maxStepHeight = subject.collider.maxStepHeightMeters;
    this.physicsController.characterMass = subject.collider.massKilograms;
    this.physicsController.acceleration = 1;
    this.syncVisual(spawnSubjectOrigin);
    this.initialGroundSupportPending = this.hasWalkablePhysicalGroundAt(
      spawnSubjectOrigin,
    );
    this.currentMovementMedium = this.movementMediumForSupport(
      CharacterSupportedState.UNSUPPORTED,
    );
  }

  requestMotionProfile(resourceRef: string): boolean {
    return this.motionModeResolver.request(resourceRef);
  }

  setParameterTuning(tuning: MotionParameterTuningV1): boolean {
    if (!this.canSetParameterTuning(tuning)) return false;
    this.parameterTuning = { ...tuning };
    this.parameterTuningRevision += 1;
    this.effectiveProfileCache = undefined;
    return true;
  }

  canSetParameterTuning(tuning: MotionParameterTuningV1): boolean {
    const profile = this.motionModeResolver.currentProfile;
    const declaredKernel = this.subject.capabilityAssembly?.motionKernels.find(
      (candidate) => candidate.resourceRef === profile.motionKernelRef,
    );
    if (declaredKernel === undefined) return false;
    const supportedParameters = new Set(declaredKernel.runtimeParameterNames);
    for (const [name, value] of Object.entries(tuning)) {
      const limit = profile.safetyLimits[name];
      if (
        !supportedParameters.has(name) ||
        limit === undefined ||
        !Number.isFinite(value) ||
        value < limit.minimum ||
        value > limit.maximum
      ) {
        return false;
      }
    }
    const candidate: ExecutionMotionProfileV1 = {
      ...profile,
      parameters: { ...profile.parameters, ...tuning },
    };
    return kernelParameterRelationshipsAreValid(candidate);
  }

  step(command: MotionCommandV1): void {
    this.commitPendingProfile();
    try {
      this.stepActiveKernel(command);
      const velocity = this.physicsController.getVelocity();
      if (![velocity.x, velocity.y, velocity.z].every(Number.isFinite)) {
        this.activateFallback("MOTION_NON_FINITE_STATE");
        this.physicsController.setVelocity(Vector3.Zero());
      }
    } catch {
      this.activateFallback("MOTION_NON_FINITE_STATE");
      this.physicsController.setVelocity(Vector3.Zero());
    }
  }

  synchronizeVisual(): void {
    this.syncVisual();
  }

  refreshMovementMedium(): void {
    const support = this.physicsController.checkSupport(
      FIXED_TIME_STEP_SECONDS,
      this.gravity,
    );
    this.currentMovementMedium = this.movementMediumForSupport(
      support.supportedState,
    );
  }

  snapshot(): MotionKernelSnapshotV1 {
    const velocity = this.physicsController.getVelocity();
    const forward = this.forward;
    const mode = this.motionModeResolver.snapshot();
    return {
      activeMotionProfileRef: mode.activeProfile.resourceRef,
      activeMotionKernelRef: mode.activeProfile.motionKernelRef,
      motionTags: [...mode.activeProfile.motionTags],
      forwardXYZ: [forward.x, forward.y, forward.z],
      speedMetersPerSecond: velocity.length(),
      fallbackActive: mode.fallbackActive,
      parameterTuning: { ...this.parameterTuning },
      ...(mode.lastFailureCode === undefined
        ? {}
        : { lastFailureCode: mode.lastFailureCode }),
    };
  }

  get subjectOrigin(): Vector3 {
    return this.visualRoot.position.clone();
  }

  get velocity(): Vector3 {
    return this.physicsController.getVelocity();
  }

  get controllerCenter(): Vector3 {
    return this.physicsController.getPosition();
  }

  get movementMedium(): ExecutionMovementMediumV1 {
    return this.currentMovementMedium;
  }

  get hasPendingInitialGroundSupport(): boolean {
    return this.initialGroundSupportPending;
  }

  get facingYawRadians(): number {
    return this.yawRadians;
  }

  get forward(): Vector3 {
    return new Vector3(-Math.sin(this.yawRadians), 0, -Math.cos(this.yawRadians));
  }

  reset(): void {
    const spawn = new Vector3(...this.subject.spawnSubjectOriginPositionMetersXYZ);
    this.physicsController.setPosition(spawn.add(this.colliderCenterOffset));
    this.physicsController.setVelocity(Vector3.Zero());
    this.motionModeResolver.reset();
    this.clearParameterTuning();
    this.yawRadians = this.subject.spawnSubjectFacingRadians;
    this.forwardSpeedMetersPerSecond = 0;
    this.planarVelocity.setAll(0);
    this.steeringInput = 0;
    this.slideVelocity.setAll(0);
    this.flightPitchRadians = 0;
    this.flightRollRadians = 0;
    this.bodyLeanRadians = 0;
    this.turnVelocityRadiansPerSecond = 0;
    this.brakeToReverseElapsedSeconds = 0;
    this.coyoteRemainingSeconds = 0;
    this.jumpBufferRemainingSeconds = 0;
    this.jumpHoldElapsedSeconds = 0;
    this.jumpInProgress = false;
    this.jumpActionWasActive = false;
    this.syncVisual(spawn);
    this.initialGroundSupportPending = this.hasWalkablePhysicalGroundAt(spawn);
    this.currentMovementMedium = this.movementMediumForSupport(
      CharacterSupportedState.UNSUPPORTED,
    );
  }

  stop(): void {
    this.forwardSpeedMetersPerSecond = 0;
    this.planarVelocity.setAll(0);
    this.steeringInput = 0;
    this.slideVelocity.setAll(0);
    this.flightPitchRadians = 0;
    this.flightRollRadians = 0;
    this.bodyLeanRadians = 0;
    this.turnVelocityRadiansPerSecond = 0;
    this.brakeToReverseElapsedSeconds = 0;
    this.coyoteRemainingSeconds = 0;
    this.jumpBufferRemainingSeconds = 0;
    this.jumpHoldElapsedSeconds = 0;
    this.physicsController.setVelocity(Vector3.Zero());
  }

  dispose(): void {
    this.physicsController.dispose();
  }

  private stepActiveKernel(
    command: MotionCommandV1,
  ): void {
    const implementationId = this.activeKernelImplementationId();
    if (implementationId === "unpowered-glide") {
      this.stepGlide(command);
      return;
    }
    if (implementationId === "free-ground") {
      this.physicsController.maxSlopeCosine = Math.cos(
        numberParameter(this.activeProfile, "maximumSlopeDegrees", 50) *
          Math.PI / 180,
      );
      this.physicsController.maxStepHeight = numberParameter(
        this.activeProfile,
        "stepHeightMeters",
        0.35,
      );
    }
    const support = this.physicsController.checkSupport(
      FIXED_TIME_STEP_SECONDS,
      this.gravity,
    );
    const unsupported =
      support.supportedState === CharacterSupportedState.UNSUPPORTED;
    const movementMedium = this.movementMediumForSupport(support.supportedState);
    this.currentMovementMedium = movementMedium;
    const jumpHeldThisTick =
      (command.kind === "planar-vector" || command.kind === "throttle-steer") &&
      command.jumpRequested;
    if (!unsupported) {
      this.coyoteRemainingSeconds = numberParameter(
        this.activeProfile,
        "coyoteTimeSeconds",
        0.1,
      );
    } else {
      this.coyoteRemainingSeconds = Math.max(
        0,
        this.coyoteRemainingSeconds - FIXED_TIME_STEP_SECONDS,
      );
    }
    let desired = Vector3.Zero();
    let jumpRequestedThisTick = false;
    const jumpPressedThisTick = jumpHeldThisTick && !this.jumpActionWasActive;
    this.jumpActionWasActive = jumpHeldThisTick;

    if (implementationId === "free-ground") {
      const planar = command.kind === "planar-vector" ? command : undefined;
      const direction = planar?.directionMetersXZ ?? [0, 0];
      const requestedSpeed = movementMedium === "water"
        ? numberParameter(
            this.activeProfile,
            "waterSpeedMetersPerSecond",
            this.subject.locomotion.waterSpeedMetersPerSecond,
          )
        : planar?.runRequested
          ? numberParameter(this.activeProfile, "runSpeedMetersPerSecond", 4)
          : numberParameter(this.activeProfile, "walkSpeedMetersPerSecond", 2.4);
      const targetPlanarVelocity = new Vector3(
        direction[0] * requestedSpeed,
        0,
        direction[1] * requestedSpeed,
      );
      const currentVelocity = this.physicsController.getVelocity();
      const currentPlanarVelocity = new Vector3(
        currentVelocity.x,
        0,
        currentVelocity.z,
      );
      const changingSpeed = targetPlanarVelocity.lengthSquared() > 0.000001;
      const response = numberParameter(
        this.activeProfile,
        changingSpeed
          ? "accelerationMetersPerSecondSquared"
          : "decelerationMetersPerSecondSquared",
        changingSpeed ? 12 : 16,
      );
      const airControl = movementMedium === "air"
        ? numberParameter(this.activeProfile, "airControlRatio", 0.3)
        : 1;
      this.planarVelocity = moveVectorTowards(
        currentPlanarVelocity,
        targetPlanarVelocity,
        response * airControl * FIXED_TIME_STEP_SECONDS,
      );
      desired.copyFrom(this.planarVelocity);
      if (targetPlanarVelocity.lengthSquared() > 0.000001 || planar?.aimRequested === true) {
        const facingDirection = planar?.aimRequested === true
          ? planar.facingDirectionMetersXZ
          : [targetPlanarVelocity.x, targetPlanarVelocity.z] as const;
        const targetYaw = Math.atan2(
          -facingDirection[0],
          -facingDirection[1],
        );
        const turnRate = numberParameter(
          this.activeProfile,
          "turnRateRadiansPerSecond",
          7,
        );
        this.yawRadians = moveAngleTowards(
          this.yawRadians,
          targetYaw,
          turnRate * airControl * FIXED_TIME_STEP_SECONDS,
        );
      }
      if (planar?.jumpRequested === true && jumpPressedThisTick) {
        this.jumpBufferRemainingSeconds = numberParameter(
          this.activeProfile,
          "jumpBufferSeconds",
          0.12,
        );
      } else {
        this.jumpBufferRemainingSeconds = Math.max(
          0,
          this.jumpBufferRemainingSeconds - FIXED_TIME_STEP_SECONDS,
        );
      }
      if (
        this.jumpBufferRemainingSeconds > 0 &&
        (movementMedium === "ground" || !unsupported || this.coyoteRemainingSeconds > 0) &&
        !this.jumpInProgress
      ) {
        this.jumpInProgress = true;
        jumpRequestedThisTick = true;
        this.jumpBufferRemainingSeconds = 0;
        this.coyoteRemainingSeconds = 0;
        this.jumpHoldElapsedSeconds = 0;
      }
    } else {
      const throttleCommand = command.kind === "throttle-steer" ? command : undefined;
      const throttle = throttleCommand?.throttle ?? 0;
      const steering = throttleCommand?.steering ?? 0;
      const maximumForwardSpeed = numberParameter(
        this.activeProfile,
        implementationId === "surface-slide"
          ? "maximumSpeedMetersPerSecond"
          : "forwardSpeedMetersPerSecond",
        4,
      );
      const maximumReverseSpeed = numberParameter(
        this.activeProfile,
        "reverseSpeedMetersPerSecond",
        maximumForwardSpeed * 0.4,
      );
      const boostMultiplier = throttleCommand?.boostRequested === true
        ? numberParameter(this.activeProfile, "boostMultiplier", 1.2)
        : 1;
      const brakeRatio = Math.max(
        throttleCommand?.brakeRequested === true ? 1 : 0,
        throttleCommand?.brakeRatio ?? 0,
      );
      const braking = brakeRatio > 0 &&
        implementationId !== "forward-steer";
      const targetSpeed = braking
        ? 0
        : throttle >= 0
        ? throttle * maximumForwardSpeed * boostMultiplier
        : throttle * maximumReverseSpeed;
      const acceleration = numberParameter(
        this.activeProfile,
        implementationId === "surface-slide"
          ? "driveAccelerationMetersPerSecondSquared"
          : "accelerationMetersPerSecondSquared",
        6,
      );
      const deceleration = numberParameter(
        this.activeProfile,
        "decelerationMetersPerSecondSquared",
        numberParameter(this.activeProfile, "brakeMetersPerSecondSquared", 9),
      );
      if (implementationId === "wheeled-arcade") {
        if (braking) {
          this.forwardSpeedMetersPerSecond = moveTowards(
            this.forwardSpeedMetersPerSecond,
            0,
            numberParameter(
              this.activeProfile,
              "brakeMetersPerSecondSquared",
              10,
            ) * brakeRatio * FIXED_TIME_STEP_SECONDS,
          );
        } else if (Math.abs(throttle) > 0.000001) {
          const changingDirection =
            Math.sign(targetSpeed) !== Math.sign(this.forwardSpeedMetersPerSecond) &&
            Math.abs(this.forwardSpeedMetersPerSecond) > 0.000001;
          if (changingDirection) {
            this.brakeToReverseElapsedSeconds += FIXED_TIME_STEP_SECONDS;
          } else {
            this.brakeToReverseElapsedSeconds = 0;
          }
          const reverseDelaySatisfied =
            this.brakeToReverseElapsedSeconds >= numberParameter(
              this.activeProfile,
              "brakeToReverseDelaySeconds",
              0.18,
            );
          const response = changingDirection ||
              Math.abs(targetSpeed) < Math.abs(this.forwardSpeedMetersPerSecond)
            ? numberParameter(
                this.activeProfile,
                "brakeMetersPerSecondSquared",
                10,
              )
            : acceleration;
          this.forwardSpeedMetersPerSecond = moveTowards(
            this.forwardSpeedMetersPerSecond,
            changingDirection && !reverseDelaySatisfied ? 0 : targetSpeed,
            response * FIXED_TIME_STEP_SECONDS,
          );
        } else {
          this.brakeToReverseElapsedSeconds = 0;
          this.forwardSpeedMetersPerSecond *= Math.exp(
            -numberParameter(this.activeProfile, "dragPerSecond", 0.7) *
              FIXED_TIME_STEP_SECONDS,
          );
          if (Math.abs(this.forwardSpeedMetersPerSecond) < 0.001) {
            this.forwardSpeedMetersPerSecond = 0;
          }
        }
      } else {
        this.forwardSpeedMetersPerSecond = moveTowards(
          this.forwardSpeedMetersPerSecond,
          targetSpeed,
          (Math.abs(targetSpeed) > Math.abs(this.forwardSpeedMetersPerSecond)
            ? acceleration
            : deceleration) * FIXED_TIME_STEP_SECONDS,
        );
      }
      const speedRatio = maximumForwardSpeed <= 0
        ? 0
        : Math.min(1, Math.abs(this.forwardSpeedMetersPerSecond) / maximumForwardSpeed);
      let appliedSteering = steering;
      let steeringAuthority = 1;
      let drivingDirection = 1;
      if (implementationId === "wheeled-arcade") {
        const deadzone = numberParameter(
          this.activeProfile,
          "steeringDeadzoneRatio",
          0.05,
        );
        const magnitude = Math.abs(steering);
        const normalized = magnitude <= deadzone
          ? 0
          : (magnitude - deadzone) / Math.max(0.000001, 1 - deadzone);
        appliedSteering = Math.sign(steering) * Math.pow(
          normalized,
          numberParameter(this.activeProfile, "steeringInputExponent", 1.6),
        );
      }
      if (
        implementationId === "wheeled-arcade" ||
        implementationId === "forward-steer" ||
        implementationId === "surface-slide"
      ) {
        const steeringResponse = numberParameter(
          this.activeProfile,
          Math.abs(appliedSteering) > 0.000001
            ? "steeringResponsePerSecond"
            : "steeringReturnPerSecond",
          Math.abs(appliedSteering) > 0.000001 ? 4.5 : 7,
        );
        this.steeringInput = moveTowards(
          this.steeringInput,
          appliedSteering,
          steeringResponse * FIXED_TIME_STEP_SECONDS,
        );
        appliedSteering = this.steeringInput;
      }
      if (
        implementationId === "wheeled-arcade" ||
        implementationId === "forward-steer" ||
        implementationId === "water-surface"
      ) {
        const fullAuthority = numberParameter(
          this.activeProfile,
          "fullSteeringAuthoritySpeedMetersPerSecond",
          implementationId === "wheeled-arcade" ? 2.5 : 2,
        );
        const minimumAuthority = implementationId === "wheeled-arcade"
          ? 0
          : numberParameter(
              this.activeProfile,
              "minimumSteeringAuthorityRatio",
              implementationId === "water-surface" ? 0.2 : 0.25,
            );
        steeringAuthority = minimumAuthority + (1 - minimumAuthority) * smoothstep01(
          Math.abs(this.forwardSpeedMetersPerSecond) /
            Math.max(0.001, fullAuthority),
        );
        drivingDirection = Math.sign(this.forwardSpeedMetersPerSecond) ||
          Math.sign(throttle) || 1;
        if (drivingDirection < 0 && implementationId === "water-surface") {
          drivingDirection *= numberParameter(
            this.activeProfile,
            "reverseTurnMultiplier",
            0.75,
          );
        }
      }
      const turnRate =
        implementationId === "wheeled-arcade" || implementationId === "forward-steer"
        ? (() => {
            const curve = Math.pow(
              speedRatio,
              numberParameter(
                this.activeProfile,
                "turnRateSpeedCurveExponent",
                implementationId === "wheeled-arcade" ? 1.35 : 1.2,
              ),
            );
            return numberParameter(
              this.activeProfile,
              "lowSpeedTurnRateRadiansPerSecond",
              implementationId === "wheeled-arcade"
                ? 1.15
                : numberParameter(this.activeProfile, "turnRateRadiansPerSecond", 2.2),
            ) * (1 - curve) +
              numberParameter(
                this.activeProfile,
                "highSpeedTurnRateRadiansPerSecond",
                implementationId === "wheeled-arcade" ? 0.42 : 1.3,
              ) * curve;
          })()
        : numberParameter(this.activeProfile, "turnRateRadiansPerSecond", 1.8);
      const handbrakeTurnMultiplier = throttleCommand?.handbrakeRequested === true
        ? numberParameter(this.activeProfile, "handbrakeTurnMultiplier", 1.35)
        : 1;
      if (implementationId === "water-surface") {
        const targetTurnVelocity = steering * turnRate * steeringAuthority *
          drivingDirection;
        this.turnVelocityRadiansPerSecond = moveTowards(
          this.turnVelocityRadiansPerSecond,
          targetTurnVelocity,
          numberParameter(
            this.activeProfile,
            "turnAccelerationRadiansPerSecondSquared",
            2.5,
          ) * FIXED_TIME_STEP_SECONDS,
        );
        if (Math.abs(steering) <= 0.000001) {
          this.turnVelocityRadiansPerSecond *= Math.exp(
            -numberParameter(this.activeProfile, "turnDampingPerSecond", 3) *
              FIXED_TIME_STEP_SECONDS,
          );
        }
        this.yawRadians -= this.turnVelocityRadiansPerSecond * FIXED_TIME_STEP_SECONDS;
      } else {
        this.yawRadians -= appliedSteering * turnRate * steeringAuthority *
          drivingDirection * handbrakeTurnMultiplier * FIXED_TIME_STEP_SECONDS;
      }
      const leanTarget = implementationId === "forward-steer"
        ? -appliedSteering * numberParameter(
            this.activeProfile,
            "bodyLeanMaximumRadians",
            0.14,
          ) * Math.min(1, speedRatio + 0.2)
        : 0;
      this.bodyLeanRadians = moveTowards(
        this.bodyLeanRadians,
        leanTarget,
        2.5 * FIXED_TIME_STEP_SECONDS,
      );
      desired = this.forward.scale(this.forwardSpeedMetersPerSecond);

      if (implementationId === "wheeled-arcade") {
        const currentVelocity = this.physicsController.getVelocity();
        const currentPlanar = new Vector3(currentVelocity.x, 0, currentVelocity.z);
        const currentForwardSpeed = Vector3.Dot(currentPlanar, this.forward);
        const lateral = currentPlanar.subtract(
          this.forward.scale(currentForwardSpeed),
        );
        const grip = throttleCommand?.handbrakeRequested === true
          ? numberParameter(this.activeProfile, "handbrakeLateralGripPerSecond", 1.5)
          : numberParameter(this.activeProfile, "lateralGripPerSecond", 6);
        lateral.scaleInPlace(Math.exp(-grip * FIXED_TIME_STEP_SECONDS));
        desired.addInPlace(lateral);
      }

      if (
        implementationId === "forward-steer" &&
        throttleCommand?.jumpRequested === true &&
        jumpPressedThisTick &&
        movementMedium === "ground"
      ) {
        this.jumpInProgress = true;
        jumpRequestedThisTick = true;
      }
      if (implementationId === "surface-slide") {
        const drive = desired.scale(
          numberParameter(this.activeProfile, "driveResponsePerSecond", 1.8) *
            FIXED_TIME_STEP_SECONDS,
        );
        this.slideVelocity.addInPlace(drive);
        const friction = numberParameter(
          this.activeProfile,
          "surfaceFrictionPerSecond",
          0.18,
        );
        this.slideVelocity.scaleInPlace(
          Math.max(0, 1 - friction * FIXED_TIME_STEP_SECONDS),
        );
        const longitudinalSpeed = Vector3.Dot(this.slideVelocity, this.forward);
        const longitudinalVelocity = this.forward.scale(longitudinalSpeed);
        const lateralVelocity = this.slideVelocity.subtract(longitudinalVelocity);
        lateralVelocity.scaleInPlace(
          Math.exp(
            -numberParameter(
              this.activeProfile,
              "lateralFrictionPerSecond",
              0.22,
            ) * FIXED_TIME_STEP_SECONDS,
          ),
        );
        const maximumDriftAngle = numberParameter(
          this.activeProfile,
          "maximumDriftAngleRadians",
          1.25,
        );
        const maximumLateralSpeed = Math.abs(longitudinalSpeed) *
          Math.tan(Math.min(1.45, maximumDriftAngle)) + 0.5;
        if (lateralVelocity.length() > maximumLateralSpeed) {
          lateralVelocity.normalize().scaleInPlace(maximumLateralSpeed);
        }
        this.slideVelocity.copyFrom(longitudinalVelocity.add(lateralVelocity));
        if (!unsupported) {
          const normal = support.averageSurfaceNormal.normalizeToNew();
          const slopeAcceleration = this.gravity.subtract(
            normal.scale(Vector3.Dot(this.gravity, normal)),
          );
          this.slideVelocity.addInPlace(
            slopeAcceleration.scale(
              FIXED_TIME_STEP_SECONDS * numberParameter(
                this.activeProfile,
                "slopeGravityRatio",
                1,
              ),
            ),
          );
        }
        const maxSpeed = numberParameter(
          this.activeProfile,
          "maximumSpeedMetersPerSecond",
          15,
        );
        if (this.slideVelocity.length() > maxSpeed) {
          this.slideVelocity.normalize().scaleInPlace(maxSpeed);
        }
        desired.copyFrom(this.slideVelocity);
      }
    }

    const surfaceNormal = unsupported ? this.up : support.averageSurfaceNormal;
    const current = this.physicsController.getVelocity();
    const calculated = this.physicsController.calculateMovement(
      FIXED_TIME_STEP_SECONDS,
      this.forward,
      surfaceNormal,
      current,
      support.averageSurfaceVelocity,
      desired,
      this.up,
    );
    const isPhysicallySupported = !unsupported || this.initialGroundSupportPending;
    if (jumpRequestedThisTick) {
      this.jumpInProgress = true;
      calculated.y = numberParameter(this.activeProfile, "jumpSpeedMetersPerSecond", 5);
    } else if (!isPhysicallySupported || (this.jumpInProgress && current.y > 0)) {
      const variableJumpHoldSeconds = numberParameter(
        this.activeProfile,
        "variableJumpHoldSeconds",
        0.18,
      );
      if (
        this.jumpInProgress &&
        jumpHeldThisTick &&
        this.jumpHoldElapsedSeconds < variableJumpHoldSeconds
      ) {
        this.jumpHoldElapsedSeconds += FIXED_TIME_STEP_SECONDS;
      }
      const gravityScale = this.jumpInProgress && jumpHeldThisTick &&
          this.jumpHoldElapsedSeconds < variableJumpHoldSeconds
        ? numberParameter(this.activeProfile, "jumpHoldGravityScale", 0.45)
        : this.jumpInProgress && current.y > 0
          ? numberParameter(this.activeProfile, "jumpReleaseGravityScale", 2)
          : movementMedium === "water"
            ? 0.15
            : 1;
      calculated.y = current.y;
      calculated.addInPlace(
        this.gravity.scale(FIXED_TIME_STEP_SECONDS * gravityScale),
      );
    } else {
      calculated.y = support.averageSurfaceVelocity.y;
      this.jumpInProgress = false;
    }

    if (implementationId === "water-surface") {
      const waterLevel = this.waterSurfaceHeightAtSubjectOrigin(this.subjectOrigin);
      const hold = numberParameter(this.activeProfile, "surfaceHoldStrengthPerSecond", 8);
      if (waterLevel !== undefined) {
        const verticalSpeedLimit = numberParameter(
          this.activeProfile,
          "surfaceVerticalSpeedLimitMetersPerSecond",
          2,
        );
        calculated.y = Math.max(
          -verticalSpeedLimit,
          Math.min(
            verticalSpeedLimit,
            (waterLevel - this.subjectOrigin.y) * hold,
          ),
        );
      }
      calculated.scaleInPlace(
        Math.max(
          0,
          1 -
            numberParameter(this.activeProfile, "dragPerSecond", 0.8) *
              FIXED_TIME_STEP_SECONDS,
        ),
      );
    }
    this.physicsController.setVelocity(calculated);
    const appliedGravity = implementationId === "water-surface"
      ? this.gravity.scale(
          numberParameter(this.activeProfile, "waterGravityScale", 0.05),
        )
      : movementMedium === "water"
        ? this.gravity.scale(0.15)
        : this.gravity;
    this.physicsController.integrate(FIXED_TIME_STEP_SECONDS, support, appliedGravity);
    this.initialGroundSupportPending = false;
  }

  private get activeProfile(): ExecutionMotionProfileV1 {
    const baseProfile = this.motionModeResolver.currentProfile;
    if (Object.keys(this.parameterTuning).length === 0) return baseProfile;
    if (
      this.effectiveProfileCache?.baseProfile === baseProfile &&
      this.effectiveProfileCache.tuningRevision === this.parameterTuningRevision
    ) {
      return this.effectiveProfileCache.profile;
    }
    const profile: ExecutionMotionProfileV1 = {
      ...baseProfile,
      parameters: { ...baseProfile.parameters, ...this.parameterTuning },
    };
    this.effectiveProfileCache = {
      baseProfile,
      tuningRevision: this.parameterTuningRevision,
      profile,
    };
    return profile;
  }

  private activeKernelImplementationId():
    | "free-ground"
    | "forward-steer"
    | "wheeled-arcade"
    | "surface-slide"
    | "water-surface"
    | "unpowered-glide" {
    const assembly = this.subject.capabilityAssembly;
    if (assembly === undefined) return "free-ground";
    const activeMotionKernelRef = this.activeProfile.motionKernelRef;
    const motionKernel = assembly.motionKernels.find(
      (candidate) => candidate.resourceRef === activeMotionKernelRef,
    );
    if (motionKernel === undefined) {
      throw new Error("MOTION_KERNEL_NOT_LOCKED");
    }
    return motionKernel.implementationId;
  }

  private stepGlide(
    command: MotionCommandV1,
  ): void {
    this.jumpActionWasActive = false;
    this.currentMovementMedium = "air";
    const flight = command.kind === "flight-attitude" ? command : undefined;
    const pitchInput = flight?.pitch ?? 0;
    const rollInput = flight?.roll ?? 0;
    const maximumPitchRadians = numberParameter(
      this.activeProfile,
      "maximumPitchRadians",
      0.45,
    );
    const maximumRollRadians = numberParameter(
      this.activeProfile,
      "maximumRollRadians",
      0.55,
    );
    this.flightPitchRadians = moveTowards(
      this.flightPitchRadians,
      pitchInput * maximumPitchRadians,
      numberParameter(
        this.activeProfile,
        Math.abs(pitchInput) > 0.000001
          ? "pitchRateRadiansPerSecond"
          : "pitchCenteringPerSecond",
        Math.abs(pitchInput) > 0.000001 ? 1 : 1.5,
      ) *
        FIXED_TIME_STEP_SECONDS,
    );
    this.flightRollRadians = moveTowards(
      this.flightRollRadians,
      -rollInput * maximumRollRadians,
      numberParameter(
        this.activeProfile,
        Math.abs(rollInput) > 0.000001
          ? "rollRateRadiansPerSecond"
          : "rollCenteringPerSecond",
        Math.abs(rollInput) > 0.000001 ? 1.1 : 1.8,
      ) *
        FIXED_TIME_STEP_SECONDS,
    );
    this.yawRadians -=
      ((flight?.yaw ?? 0) +
        -this.flightRollRadians / Math.max(0.001, maximumRollRadians) *
          numberParameter(this.activeProfile, "yawRollCouplingRatio", 0.35)) *
      numberParameter(this.activeProfile, "yawRateRadiansPerSecond", 0.8) *
      FIXED_TIME_STEP_SECONDS;
    const current = this.physicsController.getVelocity();
    const minSpeed = numberParameter(
      this.activeProfile,
      "minimumForwardSpeedMetersPerSecond",
      4,
    );
    const maxSpeed = numberParameter(
      this.activeProfile,
      "maximumForwardSpeedMetersPerSecond",
      15,
    );
    const targetSpeed = minSpeed + (maxSpeed - minSpeed) * clamp(
      0.5 - pitchInput * numberParameter(
        this.activeProfile,
        "pitchToForwardSpeedRatio",
        0.35,
      ),
      0,
      1,
    );
    this.forwardSpeedMetersPerSecond = moveTowards(
      Math.max(this.forwardSpeedMetersPerSecond, minSpeed),
      targetSpeed,
      numberParameter(
        this.activeProfile,
        "glideAccelerationMetersPerSecondSquared",
        1,
      ) * FIXED_TIME_STEP_SECONDS,
    );
    const gravityScale = numberParameter(this.activeProfile, "gravityScale", 0.65);
    const liftRatio = numberParameter(this.activeProfile, "liftRatio", 0.65);
    const stallSpeed = numberParameter(this.activeProfile, "stallSpeedMetersPerSecond", 4);
    const liftSpeedRange = Math.max(0.001, maxSpeed - stallSpeed);
    const liftFactor = clamp(
      (this.forwardSpeedMetersPerSecond - stallSpeed) / liftSpeedRange,
      0,
      1,
    );
    const maximumSinkSpeed = numberParameter(
      this.activeProfile,
      "maximumSinkSpeedMetersPerSecond",
      6,
    );
    const maximumClimbSpeed = numberParameter(
      this.activeProfile,
      "maximumClimbSpeedMetersPerSecond",
      1.5,
    );
    const stallSinkSpeed = numberParameter(
      this.activeProfile,
      "stallSinkSpeedMetersPerSecond",
      3.5,
    );
    const targetVerticalSpeed = clamp(
      -Math.max(0.6, gravityScale * 3) +
        liftRatio * 1.5 * liftFactor +
        this.flightPitchRadians * numberParameter(
          this.activeProfile,
          "pitchToVerticalSpeedMetersPerSecondPerRadian",
          5,
        ) -
        (1 - liftFactor) * stallSinkSpeed,
      -maximumSinkSpeed,
      maximumClimbSpeed,
    );
    const velocity = this.forward.scale(this.forwardSpeedMetersPerSecond);
    velocity.y = moveTowards(
      current.y,
      targetVerticalSpeed,
      numberParameter(
        this.activeProfile,
        "verticalResponseMetersPerSecondSquared",
        4,
      ) * FIXED_TIME_STEP_SECONDS,
    );
    const support = this.physicsController.checkSupport(
      FIXED_TIME_STEP_SECONDS,
      this.gravity,
    );
    this.physicsController.setVelocity(velocity);
    this.physicsController.integrate(
      FIXED_TIME_STEP_SECONDS,
      support,
      Vector3.Zero(),
    );
    this.initialGroundSupportPending = false;
  }

  private commitPendingProfile(): void {
    if (this.motionModeResolver.commitTickBoundary()) {
      this.clearParameterTuning();
      this.forwardSpeedMetersPerSecond = 0;
      this.planarVelocity.setAll(0);
      this.steeringInput = 0;
      this.slideVelocity.setAll(0);
      this.flightPitchRadians = 0;
      this.flightRollRadians = 0;
      this.bodyLeanRadians = 0;
      this.turnVelocityRadiansPerSecond = 0;
      this.brakeToReverseElapsedSeconds = 0;
      this.coyoteRemainingSeconds = 0;
      this.jumpBufferRemainingSeconds = 0;
      this.jumpHoldElapsedSeconds = 0;
    }
  }

  private activateFallback(code: MotionModeFailureCodeV1): void {
    this.motionModeResolver.activateFallback(code);
    this.clearParameterTuning();
  }

  private clearParameterTuning(): void {
    this.parameterTuning = {};
    this.parameterTuningRevision += 1;
    this.effectiveProfileCache = undefined;
  }

  private movementMediumForSupport(
    supportedState: CharacterSupportedState,
  ): ExecutionMovementMediumV1 {
    if (this.waterSurfaceHeightAtSubjectOrigin(this.subjectOrigin) !== undefined) {
      return "water";
    }
    if (this.jumpInProgress && this.physicsController.getVelocity().y > 0) {
      return "air";
    }
    if (this.initialGroundSupportPending) return "ground";
    return supportedState === CharacterSupportedState.UNSUPPORTED ? "air" : "ground";
  }

  private hasWalkablePhysicalGroundAt(subjectOrigin: Vector3): boolean {
    const physicsEngine = this.scene.getPhysicsEngine();
    if (physicsEngine === null) return false;
    const castHeightMeters = 0.25;
    const castDepthMeters = Math.max(
      0.5,
      this.subject.collider.maxStepHeightMeters + castHeightMeters,
    );
    const result = physicsEngine.raycast(
      subjectOrigin.add(this.up.scale(castHeightMeters)),
      subjectOrigin.subtract(this.up.scale(castDepthMeters)),
    );
    return result.hasHit &&
      result.hitNormalWorld.dot(this.up) >= this.physicsController.maxSlopeCosine;
  }

  private syncVisual(subjectOriginOverride?: Vector3): void {
    if (subjectOriginOverride !== undefined) {
      this.visualRoot.position.copyFrom(subjectOriginOverride);
    } else {
      const center = this.physicsController.getPosition();
      this.visualRoot.position.set(
        center.x - this.colliderCenterOffset.x,
        center.y - this.colliderCenterOffset.y,
        center.z - this.colliderCenterOffset.z,
      );
    }
    this.visualRoot.rotationQuaternion = Quaternion.FromEulerAngles(
      this.flightPitchRadians,
      this.yawRadians,
      this.flightRollRadians + this.bodyLeanRadians,
    );
  }
}
