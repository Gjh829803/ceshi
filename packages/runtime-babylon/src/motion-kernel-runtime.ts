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

function kernelImplementationId(resourceRef: string):
  | "free-ground"
  | "forward-steer"
  | "wheeled-arcade"
  | "surface-slide"
  | "water-surface"
  | "unpowered-glide" {
  if (resourceRef.includes("/forward-steer@")) return "forward-steer";
  if (resourceRef.includes("/wheeled-arcade@")) return "wheeled-arcade";
  if (resourceRef.includes("/surface-slide@")) return "surface-slide";
  if (resourceRef.includes("/water-surface@")) return "water-surface";
  if (resourceRef.includes("/unpowered-glide@")) return "unpowered-glide";
  return "free-ground";
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

function runtimeParameterNamesForKernel(resourceRef: string): ReadonlySet<string> {
  const implementationId = kernelImplementationId(resourceRef);
  const names: Readonly<Record<ReturnType<typeof kernelImplementationId>, readonly string[]>> = {
    "free-ground": [
      "walkSpeedMetersPerSecond",
      "runSpeedMetersPerSecond",
      "jumpSpeedMetersPerSecond",
      "accelerationMetersPerSecondSquared",
      "decelerationMetersPerSecondSquared",
      "turnRateRadiansPerSecond",
      "airControlRatio",
    ],
    "forward-steer": [
      "forwardSpeedMetersPerSecond",
      "reverseSpeedMetersPerSecond",
      "accelerationMetersPerSecondSquared",
      "decelerationMetersPerSecondSquared",
      "turnRateRadiansPerSecond",
      "jumpSpeedMetersPerSecond",
      "boostMultiplier",
    ],
    "wheeled-arcade": [
      "forwardSpeedMetersPerSecond",
      "reverseSpeedMetersPerSecond",
      "accelerationMetersPerSecondSquared",
      "brakeMetersPerSecondSquared",
      "dragPerSecond",
      "lowSpeedTurnRateRadiansPerSecond",
      "highSpeedTurnRateRadiansPerSecond",
      "steeringResponsePerSecond",
      "steeringReturnPerSecond",
      "fullSteeringAuthoritySpeedMetersPerSecond",
      "turnRateSpeedCurveExponent",
      "boostMultiplier",
    ],
    "surface-slide": [
      "maximumSpeedMetersPerSecond",
      "driveAccelerationMetersPerSecondSquared",
      "surfaceFrictionPerSecond",
      "turnRateRadiansPerSecond",
      "boostMultiplier",
    ],
    "water-surface": [
      "forwardSpeedMetersPerSecond",
      "reverseSpeedMetersPerSecond",
      "accelerationMetersPerSecondSquared",
      "dragPerSecond",
      "turnRateRadiansPerSecond",
      "surfaceHoldStrengthPerSecond",
      "boostMultiplier",
    ],
    "unpowered-glide": [
      "minimumForwardSpeedMetersPerSecond",
      "maximumForwardSpeedMetersPerSecond",
      "glideAccelerationMetersPerSecondSquared",
      "gravityScale",
      "liftRatio",
      "yawRateRadiansPerSecond",
      "stallSpeedMetersPerSecond",
    ],
  };
  return new Set(names[implementationId]);
}

function kernelParameterRelationshipsAreValid(profile: ExecutionMotionProfileV1): boolean {
  if (kernelImplementationId(profile.motionKernelRef) !== "wheeled-arcade") return true;
  return numberParameter(profile, "highSpeedTurnRateRadiansPerSecond", 0.42) <=
    numberParameter(profile, "lowSpeedTurnRateRadiansPerSecond", 1.15);
}

export class MotionKernelRuntimeV1 {
  readonly physicsController: PhysicsCharacterController;
  private readonly gravity: Vector3;
  private readonly up = Vector3.Up();
  private readonly colliderCenterOffset: Vector3;
  private readonly motionModeResolver: MotionModeResolverV1;
  private yawRadians = 0;
  private forwardSpeedMetersPerSecond = 0;
  private planarVelocity = Vector3.Zero();
  private steeringInput = 0;
  private slideVelocity = Vector3.Zero();
  private jumpInProgress = false;
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
    scene: Scene,
    private readonly waterSurfaceHeightAtSubjectOrigin: (
      subjectOrigin: Vector3,
    ) => number | undefined,
  ) {
    this.gravity = new Vector3(...gravityMetersPerSecondSquaredXYZ);
    this.colliderCenterOffset = new Vector3(
      ...subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
    );
    const compatibilityProfile: ExecutionMotionProfileV1 = {
      resourceRef: "worldkit://motion-profile/legacy-ground.compatibility@1",
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
  }

  requestMotionProfile(resourceRef: string): boolean {
    return this.motionModeResolver.request(resourceRef);
  }

  setParameterTuning(tuning: MotionParameterTuningV1): boolean {
    const profile = this.motionModeResolver.currentProfile;
    const declaredKernel = this.subject.capabilityAssembly?.motionKernel;
    const supportedParameters = declaredKernel?.resourceRef === profile.motionKernelRef
      ? new Set(declaredKernel.runtimeParameterNames)
      : runtimeParameterNamesForKernel(profile.motionKernelRef);
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
    if (!kernelParameterRelationshipsAreValid(candidate)) return false;
    this.parameterTuning = { ...tuning };
    this.parameterTuningRevision += 1;
    this.effectiveProfileCache = undefined;
    return true;
  }

  step(command: MotionCommandV1, movementMedium: ExecutionMovementMediumV1): void {
    this.commitPendingProfile();
    try {
      this.stepActiveKernel(command, movementMedium);
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

  get forward(): Vector3 {
    return new Vector3(-Math.sin(this.yawRadians), 0, -Math.cos(this.yawRadians));
  }

  reset(): void {
    const spawn = new Vector3(...this.subject.spawnSubjectOriginPositionMetersXYZ);
    this.physicsController.setPosition(spawn.add(this.colliderCenterOffset));
    this.physicsController.setVelocity(Vector3.Zero());
    this.motionModeResolver.reset();
    this.clearParameterTuning();
    this.yawRadians = 0;
    this.forwardSpeedMetersPerSecond = 0;
    this.planarVelocity.setAll(0);
    this.steeringInput = 0;
    this.slideVelocity.setAll(0);
    this.jumpInProgress = false;
    this.syncVisual(spawn);
  }

  stop(): void {
    this.forwardSpeedMetersPerSecond = 0;
    this.planarVelocity.setAll(0);
    this.steeringInput = 0;
    this.slideVelocity.setAll(0);
    this.physicsController.setVelocity(Vector3.Zero());
  }

  dispose(): void {
    this.physicsController.dispose();
  }

  private stepActiveKernel(
    command: MotionCommandV1,
    movementMedium: ExecutionMovementMediumV1,
  ): void {
    const implementationId = kernelImplementationId(this.activeProfile.motionKernelRef);
    if (implementationId === "unpowered-glide") {
      this.stepGlide(command, movementMedium);
      return;
    }
    const support = this.physicsController.checkSupport(
      FIXED_TIME_STEP_SECONDS,
      this.gravity,
    );
    const unsupported =
      support.supportedState === CharacterSupportedState.UNSUPPORTED;
    let desired = Vector3.Zero();
    let jumpRequestedThisTick = false;

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
      if (targetPlanarVelocity.lengthSquared() > 0.000001) {
        const targetYaw = Math.atan2(
          -targetPlanarVelocity.x,
          -targetPlanarVelocity.z,
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
      if (planar?.jumpRequested === true && movementMedium === "ground") {
        this.jumpInProgress = true;
        jumpRequestedThisTick = true;
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
      const braking = throttleCommand?.brakeRequested === true &&
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
            ) * FIXED_TIME_STEP_SECONDS,
          );
        } else if (Math.abs(throttle) > 0.000001) {
          const changingDirection =
            Math.sign(targetSpeed) !== Math.sign(this.forwardSpeedMetersPerSecond) &&
            Math.abs(this.forwardSpeedMetersPerSecond) > 0.000001;
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
            targetSpeed,
            response * FIXED_TIME_STEP_SECONDS,
          );
        } else {
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
        const steeringResponse = numberParameter(
          this.activeProfile,
          Math.abs(steering) > 0.000001
            ? "steeringResponsePerSecond"
            : "steeringReturnPerSecond",
          Math.abs(steering) > 0.000001 ? 4.5 : 7,
        );
        this.steeringInput = moveTowards(
          this.steeringInput,
          steering,
          steeringResponse * FIXED_TIME_STEP_SECONDS,
        );
        appliedSteering = this.steeringInput;
        steeringAuthority = smoothstep01(
          Math.abs(this.forwardSpeedMetersPerSecond) /
            numberParameter(
              this.activeProfile,
              "fullSteeringAuthoritySpeedMetersPerSecond",
              2.5,
            ),
        );
        drivingDirection = Math.sign(this.forwardSpeedMetersPerSecond);
      }
      const turnRate = implementationId === "wheeled-arcade"
        ? (() => {
            const curve = Math.pow(
              speedRatio,
              numberParameter(
                this.activeProfile,
                "turnRateSpeedCurveExponent",
                1.35,
              ),
            );
            return numberParameter(
              this.activeProfile,
              "lowSpeedTurnRateRadiansPerSecond",
              1.15,
            ) * (1 - curve) +
              numberParameter(
                this.activeProfile,
                "highSpeedTurnRateRadiansPerSecond",
                0.42,
              ) * curve;
          })()
        : numberParameter(this.activeProfile, "turnRateRadiansPerSecond", 1.8);
      this.yawRadians -= appliedSteering * turnRate * steeringAuthority *
        drivingDirection * FIXED_TIME_STEP_SECONDS;
      desired = this.forward.scale(this.forwardSpeedMetersPerSecond);

      if (
        implementationId === "forward-steer" &&
        throttleCommand?.jumpRequested === true &&
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
        if (!unsupported) {
          const normal = support.averageSurfaceNormal.normalizeToNew();
          const slopeAcceleration = this.gravity.subtract(
            normal.scale(Vector3.Dot(this.gravity, normal)),
          );
          this.slideVelocity.addInPlace(
            slopeAcceleration.scale(FIXED_TIME_STEP_SECONDS),
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
    if (jumpRequestedThisTick) {
      calculated.y = numberParameter(this.activeProfile, "jumpSpeedMetersPerSecond", 5);
    } else if (unsupported && this.jumpInProgress) {
      calculated.y = current.y;
      calculated.addInPlace(this.gravity.scale(FIXED_TIME_STEP_SECONDS));
    } else if (movementMedium === "ground") {
      this.jumpInProgress = false;
    }

    if (implementationId === "water-surface") {
      const waterLevel = this.waterSurfaceHeightAtSubjectOrigin(this.subjectOrigin);
      const hold = numberParameter(this.activeProfile, "surfaceHoldStrengthPerSecond", 8);
      if (waterLevel !== undefined) {
        calculated.y = Math.max(
          -2,
          Math.min(2, (waterLevel - this.subjectOrigin.y) * hold),
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
      ? this.gravity.scale(0.05)
      : movementMedium === "water"
        ? this.gravity.scale(0.15)
        : this.gravity;
    this.physicsController.integrate(FIXED_TIME_STEP_SECONDS, support, appliedGravity);
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

  private stepGlide(
    command: MotionCommandV1,
    _movementMedium: ExecutionMovementMediumV1,
  ): void {
    const flight = command.kind === "flight-attitude" ? command : undefined;
    this.yawRadians -=
      (flight?.yaw ?? 0) *
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
    this.forwardSpeedMetersPerSecond = Math.max(
      minSpeed,
      Math.min(
        maxSpeed,
        Math.max(this.forwardSpeedMetersPerSecond, minSpeed) +
          numberParameter(
            this.activeProfile,
            "glideAccelerationMetersPerSecondSquared",
            1,
          ) * FIXED_TIME_STEP_SECONDS,
      ),
    );
    const pitchInput = flight?.pitch ?? 0;
    const gravityScale = numberParameter(this.activeProfile, "gravityScale", 0.65);
    const liftRatio = numberParameter(this.activeProfile, "liftRatio", 0.65);
    const liftAcceleration =
      Math.max(0, this.forwardSpeedMetersPerSecond - numberParameter(
        this.activeProfile,
        "stallSpeedMetersPerSecond",
        4,
      )) * liftRatio;
    const velocity = this.forward.scale(this.forwardSpeedMetersPerSecond);
    velocity.y =
      current.y +
      (this.gravity.y * gravityScale + liftAcceleration - pitchInput * 3) *
        FIXED_TIME_STEP_SECONDS;
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
  }

  private commitPendingProfile(): void {
    if (this.motionModeResolver.commitTickBoundary()) {
      this.clearParameterTuning();
      this.forwardSpeedMetersPerSecond = 0;
      this.planarVelocity.setAll(0);
      this.steeringInput = 0;
      this.slideVelocity.setAll(0);
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
    this.visualRoot.rotationQuaternion = Quaternion.FromEulerAngles(0, this.yawRadians, 0);
  }
}
