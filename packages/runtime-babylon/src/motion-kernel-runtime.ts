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
  return true;
}

function moveTowards(current: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

export class MotionKernelRuntimeV1 {
  readonly physicsController: PhysicsCharacterController;
  private readonly gravity: Vector3;
  private readonly up = Vector3.Up();
  private readonly colliderCenterOffset: Vector3;
  private readonly motionModeResolver: MotionModeResolverV1;
  private yawRadians = 0;
  private forwardSpeedMetersPerSecond = 0;
  private slideVelocity = Vector3.Zero();
  private jumpInProgress = false;

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
    this.yawRadians = 0;
    this.forwardSpeedMetersPerSecond = 0;
    this.slideVelocity.setAll(0);
    this.jumpInProgress = false;
    this.syncVisual(spawn);
  }

  stop(): void {
    this.forwardSpeedMetersPerSecond = 0;
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
      desired.set(direction[0] * requestedSpeed, 0, direction[1] * requestedSpeed);
      if (desired.lengthSquared() > 0.000001) {
        this.yawRadians = Math.atan2(-desired.x, -desired.z);
      }
      if (planar?.jumpRequested === true && movementMedium === "ground") {
        this.jumpInProgress = true;
        jumpRequestedThisTick = true;
      }
    } else {
      const throttle = command.kind === "throttle-steer" ? command.throttle : 0;
      const steering = command.kind === "throttle-steer" ? command.steering : 0;
      const turnRate = numberParameter(
        this.activeProfile,
        implementationId === "wheeled-arcade"
          ? "lowSpeedTurnRateRadiansPerSecond"
          : "turnRateRadiansPerSecond",
        1.8,
      );
      const maximumForwardSpeed = numberParameter(
        this.activeProfile,
        "forwardSpeedMetersPerSecond",
        4,
      );
      const maximumReverseSpeed = numberParameter(
        this.activeProfile,
        "reverseSpeedMetersPerSecond",
        maximumForwardSpeed * 0.4,
      );
      const targetSpeed = throttle >= 0
        ? throttle * maximumForwardSpeed
        : throttle * maximumReverseSpeed;
      const acceleration = numberParameter(
        this.activeProfile,
        "accelerationMetersPerSecondSquared",
        6,
      );
      const deceleration = numberParameter(
        this.activeProfile,
        "decelerationMetersPerSecondSquared",
        numberParameter(this.activeProfile, "brakeMetersPerSecondSquared", 9),
      );
      this.forwardSpeedMetersPerSecond = moveTowards(
        this.forwardSpeedMetersPerSecond,
        targetSpeed,
        (Math.abs(targetSpeed) > Math.abs(this.forwardSpeedMetersPerSecond)
          ? acceleration
          : deceleration) * FIXED_TIME_STEP_SECONDS,
      );
      const speedRatio = maximumForwardSpeed <= 0
        ? 0
        : Math.min(1, Math.abs(this.forwardSpeedMetersPerSecond) / maximumForwardSpeed);
      const steeringScale = implementationId === "wheeled-arcade"
        ? Math.max(0.25, 1 - speedRatio * 0.65)
        : 1;
      this.yawRadians -=
        steering * turnRate * steeringScale * FIXED_TIME_STEP_SECONDS;
      desired = this.forward.scale(this.forwardSpeedMetersPerSecond);

      if (implementationId === "surface-slide") {
        const drive = desired.scale(
          numberParameter(this.activeProfile, "driveResponsePerSecond", 1.8) *
            FIXED_TIME_STEP_SECONDS,
        );
        this.slideVelocity.addInPlace(drive);
        const friction = numberParameter(this.activeProfile, "frictionPerSecond", 0.18);
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
    return this.motionModeResolver.currentProfile;
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
      this.forwardSpeedMetersPerSecond = 0;
      this.slideVelocity.setAll(0);
    }
  }

  private activateFallback(code: MotionModeFailureCodeV1): void {
    this.motionModeResolver.activateFallback(code);
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
