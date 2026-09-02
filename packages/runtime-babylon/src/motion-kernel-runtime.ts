import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  CharacterSupportedState,
  type CharacterSurfaceInfo,
} from "@babylonjs/core/Physics/v2/characterController.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  RuntimeMotionProfileV1,
  LocomotionModeV1,
  PublishedMovementMediumV1,
  RuntimeVec3V1,
} from "@whitebox-world/runtime-contracts";
import type { BabylonRuntimeSubjectV1 } from "./runtime-subject";
import {
  resolveCharacterStateV1,
  type CharacterSupportStateV1,
  type SubjectResolvedStateV1,
} from "@whitebox-world/subject-actions";
import { isNil } from "lodash-es";

import type { MotionCommandV1 } from "./control-profile-runtime";
import {
  MotionModeResolverV1,
  type MotionModeFailureCodeV1,
} from "./motion-mode-resolver";
import {
  createGroundAwareControllerInternal,
  type BabylonCharacterBodyNativeContactV1,
} from "./babylon-character-body-port";
import { FIXED_TIME_STEP_SECONDS } from "./physics";
import {
  r1bInStepUpCorridor,
  r1bSupportDebug,
  type CharacterSupportProjectionLockV1,
  type CharacterSupportProjectionSampleV1,
} from "./retained-support-surface-resolver";

export interface MotionKernelSnapshotV1 {
  activeMotionProfileRef: string;
  activeMotionKernelRef: string;
  motionTags: readonly string[];
  forwardXYZ: RuntimeVec3V1;
  speedMetersPerSecond: number;
  fallbackActive: boolean;
  activeControlFeelProfileRef: string;
  activePhysicsBodyProfileRef: string;
  activeLocomotionProfileRef: string;
  locomotionMode: LocomotionModeV1;
  lastFailureCode?: "MOTION_PARAMETER_INVALID" | "MOTION_NON_FINITE_STATE";
}

// Babylon 9.23.0 checkSupportToRef admits supporting constraints only when
// contact.normal.dot(gravityDirection) < -0.08. With canonical -Y gravity,
// this is the exact equivalent upward-normal threshold.
const BABYLON_SUPPORTING_CONTACT_MINIMUM_UPWARD_NORMAL_Y = 0.08;

type ControlFeelSurfaceV1 = BabylonRuntimeSubjectV1["controlFeel"];

function requireControlFeel(subject: BabylonRuntimeSubjectV1): ControlFeelSurfaceV1 {
  const feel = subject.controlFeel;
  if (feel === undefined || feel === null || feel.resourceRef === "") {
    throw new Error(
      "SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED: subject is missing a locked control-feel profile.",
    );
  }
  return copyControlFeelSurface(feel);
}

function copyControlFeelSurface(feel: ControlFeelSurfaceV1): ControlFeelSurfaceV1 {
  return {
    resourceRef: feel.resourceRef,
    contentHash: feel.contentHash,
    jumpVariantPolicy: structuredClone(feel.jumpVariantPolicy),
    walkSpeedMetersPerSecond: feel.walkSpeedMetersPerSecond,
    runSpeedMetersPerSecond: feel.runSpeedMetersPerSecond,
    jumpSpeedMetersPerSecond: feel.jumpSpeedMetersPerSecond,
    accelerationMetersPerSecondSquared: feel.accelerationMetersPerSecondSquared,
    decelerationMetersPerSecondSquared: feel.decelerationMetersPerSecondSquared,
    turnRateRadiansPerSecond: feel.turnRateRadiansPerSecond,
    moveResponseExponent: feel.moveResponseExponent,
    airControlRatio: feel.airControlRatio,
    coyoteTimeSeconds: feel.coyoteTimeSeconds,
    jumpBufferSeconds: feel.jumpBufferSeconds,
    variableJumpHoldSeconds: feel.variableJumpHoldSeconds,
    jumpHoldGravityRatio: feel.jumpHoldGravityRatio,
    jumpReleaseGravityRatio: feel.jumpReleaseGravityRatio,
  };
}

function projectSupportState(
  supportedState: CharacterSupportedState,
): CharacterSupportStateV1 {
  if (supportedState === CharacterSupportedState.SUPPORTED) return "supported";
  if (supportedState === CharacterSupportedState.SLIDING) return "sliding";
  return "unsupported";
}

function kernelScalar(
  feel: ControlFeelSurfaceV1,
  name: string,
  fallback: number,
): number {
  const value = (feel as unknown as Record<string, number | string>)[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function isSafeStoppedMotionTags(tags: readonly string[]): boolean {
  return tags.includes("safe") && tags.includes("stopped");
}

function zeroIntentCommand(command: MotionCommandV1): MotionCommandV1 {
  if (command.kind === "planar-vector") {
    return {
      kind: "planar-vector",
      directionMetersXZ: [0, 0],
      runRequested: false,
      jumpRequested: false,
      aimRequested: false,
      facingDirectionMetersXZ: command.facingDirectionMetersXZ,
    };
  }
  if (command.kind === "throttle-steer") {
    return {
      kind: "throttle-steer",
      throttle: 0,
      steering: 0,
      brakeRequested: false,
      brakeRatio: 0,
      handbrakeRequested: false,
      jumpRequested: false,
      boostRequested: false,
    };
  }
  if (command.kind === "flight-attitude") {
    return {
      kind: "flight-attitude",
      pitch: 0,
      yaw: 0,
      roll: 0,
      actionRequested: false,
    };
  }
  return { kind: "none" };
}

function requestedFromCommand(command: MotionCommandV1): {
  moveRequested: boolean;
  runRequested: boolean;
} {
  if (command.kind === "planar-vector") {
    return {
      moveRequested: command.directionMetersXZ[0] !== 0 ||
        command.directionMetersXZ[1] !== 0,
      runRequested: command.runRequested,
    };
  }
  if (command.kind === "throttle-steer") {
    return {
      moveRequested: command.throttle !== 0 || command.steering !== 0,
      runRequested: command.boostRequested,
    };
  }
  if (command.kind === "flight-attitude") {
    return {
      moveRequested: command.pitch !== 0 || command.yaw !== 0 || command.roll !== 0,
      runRequested: false,
    };
  }
  return { moveRequested: false, runRequested: false };
}

export class MotionKernelRuntimeV1 {
  readonly physicsController: ReturnType<typeof createGroundAwareControllerInternal>;
  private readonly gravity: Vector3;
  /**
   * Unit-length gravity direction for Havok `checkSupport` queries. The
   * installed controller dots this vector against unit contact normals and
   * derives `cosSqr = 1 - angleSin^2`, so passing the full-magnitude world
   * gravity misclassifies every incline above ~6 degrees as SLIDING.
   */
  private readonly gravityDirection: Vector3;
  private readonly up = Vector3.Up();
  private readonly colliderCenterOffset: Vector3;
  private readonly motionModeResolver: MotionModeResolverV1;
  private controlFeel: ControlFeelSurfaceV1;
  private pendingControlFeel: ControlFeelSurfaceV1 | undefined;
  private lastRequestedControlFeelRef: string;
  private lastRequestedMotionProfileRef: string;
  private resolvedState: SubjectResolvedStateV1 | undefined;
  private retainedSupportSample: CharacterSupportProjectionSampleV1 | undefined;
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
  private jumpHoldActive = false;
  private jumpReleasedThisApex = false;
  private currentMovementMedium: PublishedMovementMediumV1 = "air";

  constructor(
    private readonly subject: BabylonRuntimeSubjectV1,
    gravityMetersPerSecondSquaredXYZ: RuntimeVec3V1,
    private readonly visualRoot: TransformNode,
    private readonly scene: Scene,
    private readonly waterSurfaceHeightAtSubjectOrigin: (
      subjectOrigin: Vector3,
    ) => number | undefined,
  ) {
    this.controlFeel = requireControlFeel(subject);
    if (subject.capabilityAssembly.mediumProfile.air === undefined) {
      throw new Error(
        "MEDIUM_PROFILE_FIELD_FORBIDDEN: capability-driven subject requires mediumProfile.air.",
      );
    }
    this.gravity = new Vector3(...gravityMetersPerSecondSquaredXYZ);
    this.gravityDirection = this.gravity.normalizeToNew();
    this.yawRadians = subject.spawnSubjectFacingRadians;
    this.colliderCenterOffset = new Vector3(
      ...subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
    );
    const assembly = subject.capabilityAssembly;
    const profiles = [
      assembly.defaultMotionProfile,
      ...assembly.optionalMotionProfiles,
      assembly.fallbackMotionProfile,
    ];
    this.motionModeResolver = new MotionModeResolverV1(
      assembly.defaultMotionProfile,
      assembly.fallbackMotionProfile,
      profiles,
      () => true,
    );
    this.lastRequestedControlFeelRef = this.controlFeel.resourceRef;
    this.lastRequestedMotionProfileRef = this.motionModeResolver.currentProfile.resourceRef;

    const spawnSubjectOrigin = new Vector3(...subject.spawnSubjectOriginPositionMetersXYZ);
    this.physicsController = createGroundAwareControllerInternal(
      spawnSubjectOrigin.add(this.colliderCenterOffset),
      {
        capsuleHeight: subject.collider.heightMeters,
        capsuleRadius: subject.collider.radiusMeters,
      },
      scene,
    );
    try {
      this.physicsController.maxSlopeCosine = Math.cos(
        (subject.collider.maxSlopeDegrees * Math.PI) / 180,
      );
      this.physicsController.maxStepHeight = subject.collider.maxStepHeightMeters;
      this.physicsController.characterMass = subject.collider.massKilograms;
      this.syncVisual(spawnSubjectOrigin);
      this.physicsController.setVelocity(Vector3.Zero());
      this.bootstrapContactManifold();
      this.publishResolvedState(
        this.physicsController.checkSupport(
          FIXED_TIME_STEP_SECONDS,
          this.gravityDirection,
        ),
        { moveRequested: false, runRequested: false },
      );
    } catch (error) {
      try {
        this.physicsController.dispose();
      } catch {
        // Construction must preserve its primary failure after best-effort rollback.
      }
      throw error;
    }
  }

  requestMotionProfile(resourceRef: string): boolean {
    const accepted = this.motionModeResolver.request(resourceRef);
    if (accepted) this.lastRequestedMotionProfileRef = resourceRef;
    return accepted;
  }

  requestControlFeelProfile(resourceRef: string): boolean {
    const lockedCandidates = this.subject.availableControlFeels.some(
      (feel) => feel.resourceRef === this.subject.controlFeel.resourceRef,
    )
      ? this.subject.availableControlFeels
      : [...this.subject.availableControlFeels, this.subject.controlFeel];
    const nextFeel = lockedCandidates.find(
      (feel) => feel.resourceRef === resourceRef,
    );
    if (nextFeel === undefined) {
      throw new Error(
        `SUBJECT_OVERRIDE_FORBIDDEN: control-feel profile '${resourceRef}' is not locked on this subject.`,
      );
    }
    this.pendingControlFeel = copyControlFeelSurface(nextFeel);
    this.lastRequestedControlFeelRef = nextFeel.resourceRef;
    return true;
  }

  get activeControlFeel(): ControlFeelSurfaceV1 {
    return this.controlFeel;
  }

  retainedCharacterSupportSample(): CharacterSupportProjectionSampleV1 | undefined {
    const sample = this.retainedSupportSample;
    if (isNil(sample)) return undefined;
    return Object.freeze({
      ...sample,
      supportNormalWorldXYZ: Object.freeze([...sample.supportNormalWorldXYZ]) as RuntimeVec3V1,
      sampledControllerCenterMetersXYZ: Object.freeze([
        ...sample.sampledControllerCenterMetersXYZ,
      ]) as RuntimeVec3V1,
      sampledFootPositionMetersXYZ: Object.freeze([
        ...sample.sampledFootPositionMetersXYZ,
      ]) as RuntimeVec3V1,
      supportContacts: Object.freeze(sample.supportContacts.map((contact) =>
        Object.freeze({
          pointMetersXYZ: Object.freeze([
            ...contact.pointMetersXYZ,
          ]) as RuntimeVec3V1,
          normalXYZ: Object.freeze([...contact.normalXYZ]) as RuntimeVec3V1,
          ...(isNil(contact.distanceMeters)
            ? {}
            : { distanceMeters: contact.distanceMeters }),
          ...(isNil(contact.motionType)
            ? {}
            : { motionType: contact.motionType }),
          ...(isNil(contact.colliderId)
            ? {}
            : { colliderId: contact.colliderId }),
          ...(isNil(contact.colliderSubshapeId)
            ? {}
            : { colliderSubshapeId: contact.colliderSubshapeId }),
          ...(isNil(contact.logicalSubshapeId)
            ? {}
            : { logicalSubshapeId: contact.logicalSubshapeId }),
          ...(isNil(contact.traversalSurfaceId)
            ? {}
            : { traversalSurfaceId: contact.traversalSurfaceId }),
          ...(isNil(contact.surfaceEntityId)
            ? {}
            : { surfaceEntityId: contact.surfaceEntityId }),
          ...(isNil(contact.traversalSurfaceProfileRef)
            ? {}
            : {
                traversalSurfaceProfileRef:
                  contact.traversalSurfaceProfileRef,
              }),
        })
      )),
    });
  }

  clearRetainedCharacterSupportSample(): void {
    this.retainedSupportSample = undefined;
  }

  probeGroundPlacementAt(
    desiredSubjectOrigin: Vector3,
    filterMembershipMask: number,
    filterCollideMask: number,
  ): Vector3 | undefined {
    const probe = createGroundAwareControllerInternal(
      desiredSubjectOrigin.add(this.colliderCenterOffset),
      {
        capsuleHeight: this.subject.collider.heightMeters,
        capsuleRadius: this.subject.collider.radiusMeters,
      },
      this.scene,
    );
    try {
      probe.keepDistance = this.physicsController.keepDistance;
      probe.keepContactTolerance = this.physicsController.keepContactTolerance;
      probe.maxSlopeCosine = this.physicsController.maxSlopeCosine;
      probe.maxStepHeight = this.physicsController.maxStepHeight;
      probe.characterMass = this.physicsController.characterMass;
      probe.shape.filterMembershipMask = filterMembershipMask;
      probe.shape.filterCollideMask = filterCollideMask;
      const result = probe.probeGroundPlacementAt(
        desiredSubjectOrigin.add(this.colliderCenterOffset),
        this.gravityDirection,
      );
      return isNil(result)
        ? undefined
        : result.controllerCenter.subtract(this.colliderCenterOffset);
    } finally {
      probe.dispose();
    }
  }

  liveLockState(): CharacterSupportProjectionLockV1 {
    const shape = this.physicsController.shapeOptions;
    const activeMotionProfile = this.motionModeResolver.currentProfile;
    const assembly = this.subject.capabilityAssembly;
    return Object.freeze({
      capsuleRadiusMeters: shape.capsuleRadius ?? Number.NaN,
      capsuleHeightMeters: shape.capsuleHeight ?? Number.NaN,
      footOffsetMeters: this.physicsController.footOffset,
      keepDistanceMeters: this.physicsController.keepDistance,
      keepContactToleranceMeters:
        this.physicsController.keepContactTolerance,
      maxSlopeCosine: this.physicsController.maxSlopeCosine,
      maxStepHeightMeters: this.physicsController.maxStepHeight,
      colliderCenterOffsetMetersXYZ: Object.freeze([
        this.colliderCenterOffset.x,
        this.colliderCenterOffset.y,
        this.colliderCenterOffset.z,
      ]) as RuntimeVec3V1,
      controlFeelProfileRef: this.controlFeel.resourceRef,
      controlFeelProfileHash: this.controlFeel.contentHash,
      requestedControlFeelProfileRef:
        this.pendingControlFeel?.resourceRef ?? this.lastRequestedControlFeelRef,
      motionProfileRef: activeMotionProfile.resourceRef,
      motionProfileHash: activeMotionProfile.contentHash,
      requestedMotionProfileRef: this.motionModeResolver.requestedProfileRef,
      motionKernelRef: activeMotionProfile.motionKernelRef,
      physicsBodyProfileRef: this.subject.physicsBodyProfileRef,
      locomotionProfileRef: this.subject.locomotionProfileRef,
      controlProfileRef: assembly.controlProfile.resourceRef,
      controlProfileHash: assembly.controlProfile.contentHash,
      mediumProfileRef: assembly.mediumProfile.resourceRef,
    });
  }

  /**
   * Support-only tick for uncontrolled grounded subjects: one checkSupport plus
   * a resolver publish, without input interpretation or motion integration.
   */
  publishSupport(): void {
    this.commitPendingProfile();
    this.commitPendingFeel();
    this.publishResolvedState(
      this.physicsController.checkSupport(FIXED_TIME_STEP_SECONDS, this.gravityDirection),
      { moveRequested: false, runRequested: false },
    );
  }

  step(command: MotionCommandV1): void {
    this.commitPendingProfile();
    this.commitPendingFeel();
    const effectiveCommand = this.shouldEmitZeroIntent()
      ? zeroIntentCommand(command)
      : command;
    try {
      const support = this.physicsController.checkSupport(
        FIXED_TIME_STEP_SECONDS,
        this.gravityDirection,
      );
      const resolved = this.publishResolvedState(
        support,
        requestedFromCommand(effectiveCommand),
      );
      if (this.activeKernelImplementationId() === "unpowered-glide") {
        this.stepGlide(effectiveCommand, support);
      } else {
        this.stepActiveKernel(effectiveCommand, support, resolved);
      }
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
    const resolved = this.requireResolvedState();
    return {
      activeMotionProfileRef: mode.activeProfile.resourceRef,
      activeMotionKernelRef: mode.activeProfile.motionKernelRef,
      motionTags: [...mode.activeProfile.motionTags],
      forwardXYZ: [forward.x, forward.y, forward.z],
      speedMetersPerSecond: velocity.length(),
      fallbackActive: mode.fallbackActive,
      activeControlFeelProfileRef: this.controlFeel.resourceRef,
      activePhysicsBodyProfileRef: this.subject.physicsBodyProfileRef,
      activeLocomotionProfileRef: this.subject.locomotionProfileRef,
      locomotionMode: resolved.locomotionMode,
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

  get movementMedium(): PublishedMovementMediumV1 {
    return this.currentMovementMedium;
  }

  get locomotionMode(): LocomotionModeV1 {
    return this.requireResolvedState().locomotionMode;
  }

  get facingYawRadians(): number {
    return this.yawRadians;
  }

  get forward(): Vector3 {
    return new Vector3(-Math.sin(this.yawRadians), 0, -Math.cos(this.yawRadians));
  }

  resetAt(subjectOrigin: Vector3, facingYawRadians: number): void {
    this.physicsController.setPosition(subjectOrigin.add(this.colliderCenterOffset));
    this.physicsController.setVelocity(Vector3.Zero());
    this.physicsController.synchronizeAfterTeleport();
    this.motionModeResolver.reset();
    this.motionModeResolver.request(this.lastRequestedMotionProfileRef);
    this.motionModeResolver.commitTickBoundary();
    this.pendingControlFeel = undefined;
    const restoredFeel = this.lockedFeelSurface(this.lastRequestedControlFeelRef);
    this.controlFeel = restoredFeel ?? requireControlFeel(this.subject);
    this.yawRadians = facingYawRadians;
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
    this.jumpHoldActive = false;
    this.jumpReleasedThisApex = false;
    this.resolvedState = undefined;
    this.retainedSupportSample = undefined;
    this.syncVisual(subjectOrigin);
    this.bootstrapContactManifold();
    this.publishResolvedState(
      this.physicsController.checkSupport(FIXED_TIME_STEP_SECONDS, this.gravityDirection),
      { moveRequested: false, runRequested: false },
    );
  }

  projectSuspendedAt(subjectOrigin: Vector3, facingYawRadians: number): void {
    this.stop();
    this.physicsController.setPosition(subjectOrigin.add(this.colliderCenterOffset));
    this.physicsController.synchronizeAfterTeleport();
    this.yawRadians = facingYawRadians;
    this.retainedSupportSample = undefined;
    this.syncVisual(subjectOrigin);
  }

  reset(): void {
    this.resetAt(
      new Vector3(...this.subject.spawnSubjectOriginPositionMetersXYZ),
      this.subject.spawnSubjectFacingRadians,
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

  private bootstrapContactManifold(): void {
    const unsupported = {
      supportedState: CharacterSupportedState.UNSUPPORTED,
      averageSurfaceNormal: Vector3.Zero(),
      averageSurfaceVelocity: Vector3.Zero(),
      averageAngularSurfaceVelocity: Vector3.Zero(),
      isSurfaceDynamic: false,
    };
    this.physicsController.integrate(
      FIXED_TIME_STEP_SECONDS,
      unsupported,
      this.gravity,
    );
    // The integrate exists only to prime the support contact manifold before
    // the first checkSupport. Its solver output can include a penetration
    // recovery velocity, which must not leak into the published spawn or
    // reset state: both contracts publish cleared velocity.
    this.physicsController.setVelocity(Vector3.Zero());
  }

  private lockedCombination(): ResolveLockedCombination {
    const assembly = this.subject.capabilityAssembly;
    const motionProfile = this.motionModeResolver.currentProfile;
    return {
      physicsBodyProfileRef: this.subject.physicsBodyProfileRef,
      locomotionProfileRef: this.subject.locomotionProfileRef,
      motionProfileRef: motionProfile.resourceRef,
      motionKernelRef: motionProfile.motionKernelRef,
      controlFeelProfileRef: this.controlFeel.resourceRef,
      controlProfileRef: assembly.controlProfile.resourceRef,
      mediumProfileRef: assembly.mediumProfile.resourceRef,
      allowWalk: this.subject.locomotion.allowWalk,
      allowRun: this.subject.locomotion.allowRun,
      allowJump: this.subject.locomotion.allowJump,
      coyoteTimeSeconds: this.controlFeel.coyoteTimeSeconds,
    };
  }

  private publishResolvedState(
    support: CharacterSurfaceInfo,
    requested: { moveRequested: boolean; runRequested: boolean },
  ): SubjectResolvedStateV1 {
    const supportState = projectSupportState(support.supportedState);
    const sampledControllerCenter = this.physicsController.getPosition();
    const sampledFoot = sampledControllerCenter.subtract(
      this.up.scale(this.physicsController.footOffset),
    );
    const currentContacts = this.physicsController.readCurrentContacts();
    const supportContactBandMeters =
      this.physicsController.keepContactTolerance +
      this.physicsController.keepDistance;
    const supportContacts = supportState === "unsupported"
      ? []
      : currentContacts
        .filter((contact) =>
          contact.motionType === "static" &&
          contact.distanceMeters <= supportContactBandMeters &&
          Math.abs(Vector3.Dot(
            new Vector3(...contact.pointMetersXYZ).subtract(sampledFoot),
            this.up,
          )) <= supportContactBandMeters &&
          Vector3.Dot(new Vector3(...contact.normalXYZ), this.up) >
            BABYLON_SUPPORTING_CONTACT_MINIMUM_UPWARD_NORMAL_Y
        )
        .map((contact) => Object.freeze({
          pointMetersXYZ: Object.freeze([
            ...contact.pointMetersXYZ,
          ]) as RuntimeVec3V1,
          normalXYZ: Object.freeze([...contact.normalXYZ]) as RuntimeVec3V1,
          distanceMeters: contact.distanceMeters,
          motionType: "static" as const,
          ...(isNil(contact.colliderId)
            ? {}
            : { colliderId: contact.colliderId }),
          ...(isNil(contact.colliderSubshapeId)
            ? {}
            : { colliderSubshapeId: contact.colliderSubshapeId }),
          ...(isNil(contact.logicalSubshapeId)
            ? {}
            : { logicalSubshapeId: contact.logicalSubshapeId }),
          ...(isNil(contact.traversalSurfaceId)
            ? {}
            : { traversalSurfaceId: contact.traversalSurfaceId }),
          ...(isNil(contact.surfaceEntityId)
            ? {}
            : { surfaceEntityId: contact.surfaceEntityId }),
          ...(isNil(contact.traversalSurfaceProfileRef)
            ? {}
            : {
                traversalSurfaceProfileRef:
                  contact.traversalSurfaceProfileRef,
              }),
        }));
    this.retainedSupportSample = Object.freeze({
      supportState,
      supportNormalWorldXYZ: Object.freeze([
        support.averageSurfaceNormal.x,
        support.averageSurfaceNormal.y,
        support.averageSurfaceNormal.z,
      ]) as RuntimeVec3V1,
      sampledControllerCenterMetersXYZ: Object.freeze([
        sampledControllerCenter.x,
        sampledControllerCenter.y,
        sampledControllerCenter.z,
      ]) as RuntimeVec3V1,
      sampledFootPositionMetersXYZ: Object.freeze([
        sampledFoot.x,
        sampledFoot.y,
        sampledFoot.z,
      ]) as RuntimeVec3V1,
      supportContacts: Object.freeze(supportContacts),
      isSupportSurfaceDynamic: support.isSurfaceDynamic,
    });
    // #region agent log
    {
      const origin = sampledControllerCenter.subtract(this.colliderCenterOffset);
      const originXYZ = [origin.x, origin.y, origin.z] as const;
      const uniqueRawTs = [...new Set(currentContacts.flatMap((contact) =>
        contact.traversalSurfaceId === undefined ? [] : [contact.traversalSurfaceId]
      ))];
      const uniqueRetainedTs = [...new Set(supportContacts.flatMap((contact) =>
        contact.traversalSurfaceId === undefined ? [] : [contact.traversalSurfaceId]
      ))];
      if (
        r1bInStepUpCorridor(originXYZ) ||
        r1bInStepUpCorridor([sampledFoot.x, sampledFoot.y, sampledFoot.z]) ||
        uniqueRawTs.length > 1 ||
        uniqueRetainedTs.length > 1
      ) {
        r1bSupportDebug(
          "C",
          "motion-kernel-runtime.ts:publishResolvedState",
          "checkSupport-vs-contacts",
          {
            checkSupportState: supportState,
            checkSupportNative: support.supportedState,
            checkSupportNormal: [
              support.averageSurfaceNormal.x,
              support.averageSurfaceNormal.y,
              support.averageSurfaceNormal.z,
            ],
            isDynamic: support.isSurfaceDynamic,
            origin: originXYZ,
            capsuleCenter: [
              sampledControllerCenter.x,
              sampledControllerCenter.y,
              sampledControllerCenter.z,
            ],
            foot: [sampledFoot.x, sampledFoot.y, sampledFoot.z],
            band: supportContactBandMeters,
            maxSlopeCosine: this.physicsController.maxSlopeCosine,
            rawCount: currentContacts.length,
            retainedCount: supportContacts.length,
            uniqueRawTs,
            uniqueRetainedTs,
            uniqueRawEnt: [...new Set(currentContacts.flatMap((contact) =>
              contact.surfaceEntityId === undefined ? [] : [contact.surfaceEntityId]
            ))],
            uniqueRetainedEnt: [...new Set(supportContacts.flatMap((contact) =>
              contact.surfaceEntityId === undefined ? [] : [contact.surfaceEntityId]
            ))],
            rawContacts: currentContacts.map((contact) => {
              const notStatic = contact.motionType !== "static";
              const far = contact.distanceMeters > supportContactBandMeters;
              const footBand = Math.abs(Vector3.Dot(
                new Vector3(...contact.pointMetersXYZ).subtract(sampledFoot),
                this.up,
              )) > supportContactBandMeters;
              const upward = Vector3.Dot(
                new Vector3(...contact.normalXYZ),
                this.up,
              ) <= BABYLON_SUPPORTING_CONTACT_MINIMUM_UPWARD_NORMAL_Y;
              return {
                p: contact.pointMetersXYZ,
                n: contact.normalXYZ,
                d: contact.distanceMeters,
                motion: contact.motionType,
                sub: contact.colliderSubshapeId ?? null,
                ts: contact.traversalSurfaceId ?? null,
                ent: contact.surfaceEntityId ?? null,
                col: contact.colliderId ?? null,
                kept: !notStatic && !far && !footBand && !upward,
                reject: notStatic
                  ? "not-static"
                  : far
                  ? "distance"
                  : footBand
                  ? "foot-band"
                  : upward
                  ? "upward-normal"
                  : null,
              };
            }),
          },
        );
      }
    }
    // #endregion
    if (supportState === "supported") {
      this.coyoteRemainingSeconds = this.controlFeel.coyoteTimeSeconds;
    } else if (supportState === "sliding") {
      this.coyoteRemainingSeconds = 0;
    } else {
      this.coyoteRemainingSeconds = Math.max(
        0,
        this.coyoteRemainingSeconds - FIXED_TIME_STEP_SECONDS,
      );
    }
    const result = resolveCharacterStateV1({
      previousState: this.resolvedState,
      supportSample: {
        supportState,
        supportNormalWorldXYZ: [
          support.averageSurfaceNormal.x,
          support.averageSurfaceNormal.y,
          support.averageSurfaceNormal.z,
        ],
      },
      locked: this.lockedCombination(),
      requested,
      coyoteRemainingSeconds: this.coyoteRemainingSeconds,
    });
    this.resolvedState = result.state;
    this.currentMovementMedium = result.state.movementMedium;
    return result.state;
  }

  private requireResolvedState(): SubjectResolvedStateV1 {
    if (this.resolvedState === undefined) {
      throw new Error(
        "SUBJECT_SUPPORT_QUERY_MISSING: character support has not been published.",
      );
    }
    return this.resolvedState;
  }

  private effectiveGravityVector(): Vector3 {
    const jumpPhaseRatio = this.jumpHoldActive
      ? this.controlFeel.jumpHoldGravityRatio
      : this.jumpReleasedThisApex
        ? this.controlFeel.jumpReleaseGravityRatio
        : 1;
    const assembly = this.subject.capabilityAssembly;
    const gravity = assembly === undefined
      ? this.gravity
      : this.gravity.scale(assembly.mediumProfile.air.gravityRatio);
    return gravity.scale(jumpPhaseRatio);
  }

  private stepActiveKernel(
    command: MotionCommandV1,
    support: CharacterSurfaceInfo,
    resolved: SubjectResolvedStateV1,
  ): void {
    const implementationId = this.activeKernelImplementationId();
    const feel = this.controlFeel;
    const unsupported =
      support.supportedState === CharacterSupportedState.UNSUPPORTED;
    const movementMedium = resolved.movementMedium;
    const jumpHeldThisTick =
      (command.kind === "planar-vector" || command.kind === "throttle-steer") &&
      command.jumpRequested;
    let desired = Vector3.Zero();
    let jumpRequestedThisTick = false;
    const jumpPressedThisTick = jumpHeldThisTick && !this.jumpActionWasActive;
    this.jumpActionWasActive = jumpHeldThisTick;

    if (implementationId === "free-ground") {
      const planar = command.kind === "planar-vector" ? command : undefined;
      const direction = planar?.directionMetersXZ ?? [0, 0];
      const requestedSpeed = planar?.runRequested
        ? feel.runSpeedMetersPerSecond
        : feel.walkSpeedMetersPerSecond;
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
      const response = changingSpeed
        ? feel.accelerationMetersPerSecondSquared
        : feel.decelerationMetersPerSecondSquared;
      const airControl = movementMedium === "air" ? feel.airControlRatio : 1;
      if (targetPlanarVelocity.lengthSquared() > 0.000001 || planar?.aimRequested === true) {
        const facingDirection = planar?.aimRequested === true
          ? planar.facingDirectionMetersXZ
          : [targetPlanarVelocity.x, targetPlanarVelocity.z] as const;
        const targetYaw = Math.atan2(
          -facingDirection[0],
          -facingDirection[1],
        );
        this.yawRadians = moveAngleTowards(
          this.yawRadians,
          targetYaw,
          feel.turnRateRadiansPerSecond * airControl * FIXED_TIME_STEP_SECONDS,
        );
      }
      this.planarVelocity = moveVectorTowards(
        currentPlanarVelocity,
        targetPlanarVelocity,
        response * airControl * FIXED_TIME_STEP_SECONDS,
      );
      desired.copyFrom(this.planarVelocity);
      if (planar?.jumpRequested === true && jumpPressedThisTick) {
        this.jumpBufferRemainingSeconds = feel.jumpBufferSeconds;
      } else {
        this.jumpBufferRemainingSeconds = Math.max(
          0,
          this.jumpBufferRemainingSeconds - FIXED_TIME_STEP_SECONDS,
        );
      }
      if (
        this.jumpBufferRemainingSeconds > 0 &&
        resolved.isJumpAllowed &&
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
      const maximumForwardSpeed = kernelScalar(
        feel,
        implementationId === "surface-slide"
          ? "maximumSpeedMetersPerSecond"
          : "forwardSpeedMetersPerSecond",
        4,
      );
      const maximumReverseSpeed = kernelScalar(
        feel,
        "reverseSpeedMetersPerSecond",
        maximumForwardSpeed * 0.4,
      );
      const boostMultiplier = throttleCommand?.boostRequested === true
        ? kernelScalar(feel, "boostMultiplier", 1.2)
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
      const acceleration = kernelScalar(
        feel,
        implementationId === "surface-slide"
          ? "driveAccelerationMetersPerSecondSquared"
          : "accelerationMetersPerSecondSquared",
        6,
      );
      const deceleration = kernelScalar(
        feel,
        "decelerationMetersPerSecondSquared",
        kernelScalar(feel, "brakeMetersPerSecondSquared", 9),
      );
      if (implementationId === "wheeled-arcade") {
        if (braking) {
          this.forwardSpeedMetersPerSecond = moveTowards(
            this.forwardSpeedMetersPerSecond,
            0,
            kernelScalar(feel, "brakeMetersPerSecondSquared", 10) *
              brakeRatio * FIXED_TIME_STEP_SECONDS,
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
            this.brakeToReverseElapsedSeconds >= kernelScalar(
              feel,
              "brakeToReverseDelaySeconds",
              0.18,
            );
          const response = changingDirection ||
              Math.abs(targetSpeed) < Math.abs(this.forwardSpeedMetersPerSecond)
            ? kernelScalar(feel, "brakeMetersPerSecondSquared", 10)
            : acceleration;
          this.forwardSpeedMetersPerSecond = moveTowards(
            this.forwardSpeedMetersPerSecond,
            changingDirection && !reverseDelaySatisfied ? 0 : targetSpeed,
            response * FIXED_TIME_STEP_SECONDS,
          );
        } else {
          this.brakeToReverseElapsedSeconds = 0;
          this.forwardSpeedMetersPerSecond *= Math.exp(
            -kernelScalar(feel, "dragPerSecond", 0.7) * FIXED_TIME_STEP_SECONDS,
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
        const deadzone = kernelScalar(feel, "steeringDeadzoneRatio", 0.05);
        const magnitude = Math.abs(steering);
        const normalized = magnitude <= deadzone
          ? 0
          : (magnitude - deadzone) / Math.max(0.000001, 1 - deadzone);
        appliedSteering = Math.sign(steering) * Math.pow(
          normalized,
          kernelScalar(feel, "steeringInputExponent", 1.6),
        );
      }
      if (
        implementationId === "wheeled-arcade" ||
        implementationId === "forward-steer" ||
        implementationId === "surface-slide"
      ) {
        const steeringResponse = kernelScalar(
          feel,
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
        const fullAuthority = kernelScalar(
          feel,
          "fullSteeringAuthoritySpeedMetersPerSecond",
          implementationId === "wheeled-arcade" ? 2.5 : 2,
        );
        const minimumAuthority = implementationId === "wheeled-arcade"
          ? 0
          : kernelScalar(
              feel,
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
          drivingDirection *= kernelScalar(feel, "reverseTurnMultiplier", 0.75);
        }
      }
      const turnRate =
        implementationId === "wheeled-arcade" || implementationId === "forward-steer"
          ? (() => {
              const curve = Math.pow(
                speedRatio,
                kernelScalar(
                  feel,
                  "turnRateSpeedCurveExponent",
                  implementationId === "wheeled-arcade" ? 1.35 : 1.2,
                ),
              );
              return kernelScalar(
                feel,
                "lowSpeedTurnRateRadiansPerSecond",
                implementationId === "wheeled-arcade"
                  ? 1.15
                  : kernelScalar(feel, "turnRateRadiansPerSecond", 2.2),
              ) * (1 - curve) +
                kernelScalar(
                  feel,
                  "highSpeedTurnRateRadiansPerSecond",
                  implementationId === "wheeled-arcade" ? 0.42 : 1.3,
                ) * curve;
            })()
          : kernelScalar(feel, "turnRateRadiansPerSecond", 1.8);
      const handbrakeTurnMultiplier = throttleCommand?.handbrakeRequested === true
        ? kernelScalar(feel, "handbrakeTurnMultiplier", 1.35)
        : 1;
      if (implementationId === "water-surface") {
        const targetTurnVelocity = steering * turnRate * steeringAuthority *
          drivingDirection;
        this.turnVelocityRadiansPerSecond = moveTowards(
          this.turnVelocityRadiansPerSecond,
          targetTurnVelocity,
          kernelScalar(
            feel,
            "turnAccelerationRadiansPerSecondSquared",
            2.5,
          ) * FIXED_TIME_STEP_SECONDS,
        );
        if (Math.abs(steering) <= 0.000001) {
          this.turnVelocityRadiansPerSecond *= Math.exp(
            -kernelScalar(feel, "turnDampingPerSecond", 3) * FIXED_TIME_STEP_SECONDS,
          );
        }
        this.yawRadians -= this.turnVelocityRadiansPerSecond * FIXED_TIME_STEP_SECONDS;
      } else {
        this.yawRadians -= appliedSteering * turnRate * steeringAuthority *
          drivingDirection * handbrakeTurnMultiplier * FIXED_TIME_STEP_SECONDS;
      }
      const leanTarget = implementationId === "forward-steer"
        ? -appliedSteering * kernelScalar(
            feel,
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
          ? kernelScalar(feel, "handbrakeLateralGripPerSecond", 1.5)
          : kernelScalar(feel, "lateralGripPerSecond", 6);
        lateral.scaleInPlace(Math.exp(-grip * FIXED_TIME_STEP_SECONDS));
        desired.addInPlace(lateral);
      }

      if (
        implementationId === "forward-steer" &&
        throttleCommand?.jumpRequested === true &&
        jumpPressedThisTick &&
        resolved.isJumpAllowed
      ) {
        this.jumpInProgress = true;
        jumpRequestedThisTick = true;
      }
      if (implementationId === "surface-slide") {
        const drive = desired.scale(
          kernelScalar(feel, "driveResponsePerSecond", 1.8) * FIXED_TIME_STEP_SECONDS,
        );
        this.slideVelocity.addInPlace(drive);
        const friction = kernelScalar(feel, "surfaceFrictionPerSecond", 0.18);
        this.slideVelocity.scaleInPlace(
          Math.max(0, 1 - friction * FIXED_TIME_STEP_SECONDS),
        );
        const longitudinalSpeed = Vector3.Dot(this.slideVelocity, this.forward);
        const longitudinalVelocity = this.forward.scale(longitudinalSpeed);
        const lateralVelocity = this.slideVelocity.subtract(longitudinalVelocity);
        lateralVelocity.scaleInPlace(
          Math.exp(
            -kernelScalar(feel, "lateralFrictionPerSecond", 0.22) *
              FIXED_TIME_STEP_SECONDS,
          ),
        );
        const maximumDriftAngle = kernelScalar(
          feel,
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
              FIXED_TIME_STEP_SECONDS * kernelScalar(feel, "slopeGravityRatio", 1),
            ),
          );
        }
        const maxSpeed = kernelScalar(feel, "maximumSpeedMetersPerSecond", 15);
        if (this.slideVelocity.length() > maxSpeed) {
          this.slideVelocity.normalize().scaleInPlace(maxSpeed);
        }
        desired.copyFrom(this.slideVelocity);
      }
    }

    const surfaceNormal = unsupported ? this.up : support.averageSurfaceNormal;
    const current = this.physicsController.getVelocity();
    const nextVelocity = desired.clone();
    if (!unsupported) {
      const normal = surfaceNormal.normalizeToNew();
      const intoSurface = Vector3.Dot(nextVelocity, normal);
      if (intoSurface < 0) {
        nextVelocity.subtractInPlace(normal.scale(intoSurface));
      }
    }
    const isPhysicallySupported = !unsupported;
    if (jumpRequestedThisTick) {
      this.jumpInProgress = true;
      nextVelocity.y = feel.jumpSpeedMetersPerSecond;
      this.jumpHoldActive = jumpHeldThisTick;
      this.jumpReleasedThisApex = false;
    } else if (!isPhysicallySupported || (this.jumpInProgress && current.y > 0)) {
      if (
        this.jumpInProgress &&
        jumpHeldThisTick &&
        this.jumpHoldElapsedSeconds < feel.variableJumpHoldSeconds
      ) {
        this.jumpHoldElapsedSeconds += FIXED_TIME_STEP_SECONDS;
      }
      this.jumpHoldActive = this.jumpInProgress &&
        jumpHeldThisTick &&
        this.jumpHoldElapsedSeconds < feel.variableJumpHoldSeconds;
      this.jumpReleasedThisApex = this.jumpInProgress &&
        current.y > 0 &&
        !this.jumpHoldActive;
      nextVelocity.y = current.y;
      nextVelocity.addInPlace(
        this.effectiveGravityVector().scale(FIXED_TIME_STEP_SECONDS),
      );
    } else {
      nextVelocity.y = support.averageSurfaceVelocity.y;
      this.jumpInProgress = false;
      this.jumpHoldActive = false;
      this.jumpReleasedThisApex = false;
    }

    if (implementationId === "water-surface") {
      const waterLevel = this.waterSurfaceHeightAtSubjectOrigin(this.subjectOrigin);
      const hold = kernelScalar(feel, "surfaceHoldStrengthPerSecond", 8);
      if (waterLevel !== undefined) {
        const verticalSpeedLimit = kernelScalar(
          feel,
          "surfaceVerticalSpeedLimitMetersPerSecond",
          2,
        );
        nextVelocity.y = Math.max(
          -verticalSpeedLimit,
          Math.min(
            verticalSpeedLimit,
            (waterLevel - this.subjectOrigin.y) * hold,
          ),
        );
      }
      nextVelocity.scaleInPlace(
        Math.max(
          0,
          1 - kernelScalar(feel, "dragPerSecond", 0.8) * FIXED_TIME_STEP_SECONDS,
        ),
      );
    }
    this.physicsController.setVelocity(nextVelocity);
    const appliedGravity = implementationId === "water-surface"
      ? this.gravity.scale(kernelScalar(feel, "waterGravityScale", 0.05))
      : this.effectiveGravityVector();
    this.physicsController.integrate(FIXED_TIME_STEP_SECONDS, support, appliedGravity);
  }

  private get activeProfile(): RuntimeMotionProfileV1 {
    return this.motionModeResolver.currentProfile;
  }

  private shouldEmitZeroIntent(): boolean {
    const mode = this.motionModeResolver.snapshot();
    return mode.fallbackActive || isSafeStoppedMotionTags(mode.activeProfile.motionTags);
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
    support: CharacterSurfaceInfo,
  ): void {
    this.jumpActionWasActive = false;
    const feel = this.controlFeel;
    const flight = command.kind === "flight-attitude" ? command : undefined;
    const pitchInput = flight?.pitch ?? 0;
    const rollInput = flight?.roll ?? 0;
    const maximumPitchRadians = kernelScalar(feel, "maximumPitchRadians", 0.45);
    const maximumRollRadians = kernelScalar(feel, "maximumRollRadians", 0.55);
    this.flightPitchRadians = moveTowards(
      this.flightPitchRadians,
      pitchInput * maximumPitchRadians,
      kernelScalar(
        feel,
        Math.abs(pitchInput) > 0.000001
          ? "pitchRateRadiansPerSecond"
          : "pitchCenteringPerSecond",
        Math.abs(pitchInput) > 0.000001 ? 1 : 1.5,
      ) * FIXED_TIME_STEP_SECONDS,
    );
    this.flightRollRadians = moveTowards(
      this.flightRollRadians,
      -rollInput * maximumRollRadians,
      kernelScalar(
        feel,
        Math.abs(rollInput) > 0.000001
          ? "rollRateRadiansPerSecond"
          : "rollCenteringPerSecond",
        Math.abs(rollInput) > 0.000001 ? 1.1 : 1.8,
      ) * FIXED_TIME_STEP_SECONDS,
    );
    this.yawRadians -=
      ((flight?.yaw ?? 0) +
        -this.flightRollRadians / Math.max(0.001, maximumRollRadians) *
          kernelScalar(feel, "yawRollCouplingRatio", 0.35)) *
      kernelScalar(feel, "yawRateRadiansPerSecond", 0.8) *
      FIXED_TIME_STEP_SECONDS;
    const current = this.physicsController.getVelocity();
    const minSpeed = kernelScalar(feel, "minimumForwardSpeedMetersPerSecond", 4);
    const maxSpeed = kernelScalar(feel, "maximumForwardSpeedMetersPerSecond", 15);
    const targetSpeed = minSpeed + (maxSpeed - minSpeed) * clamp(
      0.5 - pitchInput * kernelScalar(feel, "pitchToForwardSpeedRatio", 0.35),
      0,
      1,
    );
    this.forwardSpeedMetersPerSecond = moveTowards(
      Math.max(this.forwardSpeedMetersPerSecond, minSpeed),
      targetSpeed,
      kernelScalar(feel, "glideAccelerationMetersPerSecondSquared", 1) *
        FIXED_TIME_STEP_SECONDS,
    );
    const gravityScale = kernelScalar(feel, "gravityScale", 0.65);
    const liftRatio = kernelScalar(feel, "liftRatio", 0.65);
    const stallSpeed = kernelScalar(feel, "stallSpeedMetersPerSecond", 4);
    const liftSpeedRange = Math.max(0.001, maxSpeed - stallSpeed);
    const liftFactor = clamp(
      (this.forwardSpeedMetersPerSecond - stallSpeed) / liftSpeedRange,
      0,
      1,
    );
    const maximumSinkSpeed = kernelScalar(feel, "maximumSinkSpeedMetersPerSecond", 6);
    const maximumClimbSpeed = kernelScalar(feel, "maximumClimbSpeedMetersPerSecond", 1.5);
    const stallSinkSpeed = kernelScalar(feel, "stallSinkSpeedMetersPerSecond", 3.5);
    const targetVerticalSpeed = clamp(
      -Math.max(0.6, gravityScale * 3) +
        liftRatio * 1.5 * liftFactor +
        this.flightPitchRadians * kernelScalar(
          feel,
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
      kernelScalar(feel, "verticalResponseMetersPerSecondSquared", 4) *
        FIXED_TIME_STEP_SECONDS,
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

  private commitPendingFeel(): void {
    if (this.pendingControlFeel === undefined) return;
    this.controlFeel = this.pendingControlFeel;
    this.pendingControlFeel = undefined;
  }

  private lockedFeelSurface(resourceRef: string): ControlFeelSurfaceV1 | undefined {
    const lockedCandidates = this.subject.availableControlFeels.some(
      (feel) => feel.resourceRef === this.subject.controlFeel.resourceRef,
    )
      ? this.subject.availableControlFeels
      : [...this.subject.availableControlFeels, this.subject.controlFeel];
    const nextFeel = lockedCandidates.find((feel) => feel.resourceRef === resourceRef);
    return nextFeel === undefined ? undefined : copyControlFeelSurface(nextFeel);
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
    this.visualRoot.rotationQuaternion = Quaternion.FromEulerAngles(
      this.flightPitchRadians,
      this.yawRadians,
      this.flightRollRadians + this.bodyLeanRadians,
    );
  }
}

type ResolveLockedCombination = Parameters<
  typeof resolveCharacterStateV1
>[0]["locked"];
