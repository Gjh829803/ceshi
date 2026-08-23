import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  CameraPreviewStateV1,
  CameraTuningV1,
  CameraViewInputV1,
  ExecutionCameraModifierProfileV1,
  ExecutionCameraRigProfileV1,
  ExecutionPlanV4,
  ExecutionPlanV5,
  ExecutionSubjectCapabilityAssemblyV1,
  SemanticInputActionV1,
  ViewControlFrameV1,
  ViewTargetSampleV1,
} from "@whitebox-world/runtime-contracts";
import {
  applyCameraRigParameterOverridesV1,
  validateCameraTuningV1,
} from "@whitebox-world/runtime-contracts";

export interface CameraDirectorSnapshotV1 {
  activeCameraProfileRef: string;
  activeCameraRigRef: string;
  activeCameraModifierRefs: readonly string[];
  fallbackActive: boolean;
  viewYawOffsetRadians: number;
  viewPitchOffsetRadians: number;
  viewDistanceOffsetMeters: number;
}

type CameraContextV1 = ExecutionSubjectCapabilityAssemblyV1["cameraContext"];
type CameraParametersV1 = ExecutionCameraRigProfileV1["parameters"];

interface SelectedCameraStateV1 {
  profile: ExecutionCameraRigProfileV1;
  modifiers: readonly ExecutionCameraModifierProfileV1[];
}

function exponentialAlpha(ratePerSecond: number, deltaSeconds: number): number {
  return 1 - Math.exp(-Math.max(0, ratePerSecond) * Math.max(0, deltaSeconds));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function moveTowards(current: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

function wrapRadians(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function rotateAroundY(direction: Vector3, radians: number): Vector3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return new Vector3(
    direction.x * cosine + direction.z * sine,
    direction.y,
    -direction.x * sine + direction.z * cosine,
  );
}

function horizontalDirection(value: Vector3): Vector3 | undefined {
  const horizontal = new Vector3(value.x, 0, value.z);
  return horizontal.lengthSquared() <= 0.000001
    ? undefined
    : horizontal.normalize();
}

function directionYaw(direction: Vector3): number {
  return Math.atan2(direction.x, direction.z);
}

function yawDirection(yawRadians: number): Vector3 {
  return new Vector3(Math.sin(yawRadians), 0, Math.cos(yawRadians));
}

function smoothstep01(value: number): number {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function ruleMatches(
  rule: CameraContextV1["rules"][number],
  sample: ViewTargetSampleV1,
): boolean {
  const when = rule.when;
  const speedMetersPerSecond = Math.hypot(
    sample.velocityMetersPerSecondXYZ[0],
    sample.velocityMetersPerSecondXYZ[1],
    sample.velocityMetersPerSecondXYZ[2],
  );
  const socketIds = new Set(Object.keys(sample.socketPositionsMetersXYZById));
  if (
    when.relationshipRoles !== undefined &&
    !when.relationshipRoles.includes(sample.relationshipRole)
  ) return false;
  if (
    when.motionKernelRefs !== undefined &&
    !when.motionKernelRefs.includes(sample.activeMotionKernelRef)
  ) return false;
  if (
    when.requiredMotionTags !== undefined &&
    !when.requiredMotionTags.every((tag) => sample.motionTags.includes(tag))
  ) return false;
  if (
    when.movementMediums !== undefined &&
    !when.movementMediums.includes(sample.movementMedium)
  ) return false;
  if (
    when.minimumSpeedMetersPerSecond !== undefined &&
    speedMetersPerSecond < when.minimumSpeedMetersPerSecond
  ) return false;
  if (
    when.maximumSpeedMetersPerSecond !== undefined &&
    speedMetersPerSecond > when.maximumSpeedMetersPerSecond
  ) return false;
  if (
    when.requiredSocketIds !== undefined &&
    !when.requiredSocketIds.every((id) => socketIds.has(id))
  ) return false;
  if (
    when.requiredCameraContextTags !== undefined &&
    !when.requiredCameraContextTags.every((tag) => sample.cameraContextTags.includes(tag))
  ) return false;
  return true;
}

export class CameraDirectorV1 {
  private initialized = false;
  private explicitProfileRef: string | undefined;
  private activeProfileRef: string;
  private activeRigRef = "worldkit://camera-rig/orbit-follow@1";
  private activeModifierRefs: readonly string[] = [];
  private fallbackActive = false;
  private smoothedTarget = Vector3.Zero();
  private targetYawOffsetRadians = 0;
  private targetPitchOffsetRadians = 0;
  private targetDistanceOffsetMeters = 0;
  private viewYawOffsetRadians = 0;
  private viewPitchOffsetRadians = 0;
  private viewDistanceOffsetMeters = 0;
  private readonly tuningByProfileRef = new Map<string, CameraTuningV1>();
  private controlInitialized = false;
  private controlTargetYawOffsetRadians = 0;
  private controlViewYawOffsetRadians = 0;
  private controlBaseHeadingYawRadians = Math.PI;
  private controlBaseHeadingIdentity: string | undefined;
  private controlLastStableVelocityForward: Vector3 | undefined;
  private controlSecondsSinceManualViewInput = Number.POSITIVE_INFINITY;
  private controlLastBaseTarget: Vector3 | undefined;
  private baseHeadingYawRadians = Math.PI;
  private baseHeadingIdentity: string | undefined;
  private lastStableVelocityForward: Vector3 | undefined;
  private transitionElapsedSeconds = 0;
  private transitionDurationSeconds = 0;
  private transitionStartPosition = Vector3.Zero();
  private transitionStartTarget = Vector3.Zero();
  private transitionStartFovRadians = Math.PI / 3;
  private activeInputActions = new Set<SemanticInputActionV1>();
  private previousInputActions = new Set<SemanticInputActionV1>();
  private secondsSinceManualViewInput = Number.POSITIVE_INFINITY;
  private shoulderSide = 1;
  private lookBackBlendRatio = 0;
  private previousVelocity = Vector3.Zero();
  private lastBaseTarget: Vector3 | undefined;
  private collisionDistanceMeters: number | undefined;
  private smoothedFovRadians = Math.PI / 3;
  private activeParameters: CameraParametersV1 | undefined;
  private activeLockedParameters: CameraParametersV1 | undefined;
  private controlForward = new Vector3(0, 0, -1);

  constructor(
    private readonly executionPlan: ExecutionPlanV4 | ExecutionPlanV5,
    private readonly camera: FreeCamera,
    private readonly scene: Scene,
  ) {
    this.activeProfileRef = executionPlan.camera.rigRef;
  }

  requestProfile(profileRef: string): boolean {
    if (profileRef.trim().length === 0) return false;
    this.explicitProfileRef = profileRef;
    return true;
  }

  resetProfileSelection(): void {
    this.explicitProfileRef = undefined;
  }

  setInputActions(actions: readonly SemanticInputActionV1[]): void {
    this.previousInputActions = this.activeInputActions;
    this.activeInputActions = new Set(actions);
    if (
      this.activeInputActions.has("camera-recenter") &&
      !this.previousInputActions.has("camera-recenter")
    ) this.resetView();
    if (
      this.activeInputActions.has("camera-shoulder-swap") &&
      !this.previousInputActions.has("camera-shoulder-swap")
    ) this.shoulderSide *= -1;
  }

  adjustView(input: CameraViewInputV1): boolean {
    const deltas = [
      input.yawDeltaRadians ?? 0,
      input.pitchDeltaRadians ?? 0,
      input.zoomDeltaMeters ?? 0,
    ];
    if (!deltas.every(Number.isFinite)) return false;
    const sensitivityX = this.activeParameters?.lookSensitivityXRatio ?? 1;
    const sensitivityY = this.activeParameters?.lookSensitivityYRatio ?? 1;
    const lockedSensitivityX = this.activeLockedParameters?.lookSensitivityXRatio ?? 1;
    this.targetYawOffsetRadians = wrapRadians(
      this.targetYawOffsetRadians + deltas[0]! * sensitivityX,
    );
    this.controlTargetYawOffsetRadians = wrapRadians(
      this.controlTargetYawOffsetRadians + deltas[0]! * lockedSensitivityX,
    );
    this.targetPitchOffsetRadians = clamp(
      this.targetPitchOffsetRadians + deltas[1]! * sensitivityY,
      -1.4,
      1.4,
    );
    this.targetDistanceOffsetMeters = clamp(
      this.targetDistanceOffsetMeters + deltas[2]!,
      -30,
      30,
    );
    if (Math.abs(deltas[0]!) + Math.abs(deltas[1]!) > 0.000001) {
      this.secondsSinceManualViewInput = 0;
      this.controlSecondsSinceManualViewInput = 0;
    }
    return true;
  }

  resetView(): void {
    this.targetYawOffsetRadians = 0;
    this.targetPitchOffsetRadians = 0;
    this.targetDistanceOffsetMeters = 0;
    this.controlTargetYawOffsetRadians = 0;
    this.baseHeadingIdentity = undefined;
    this.controlBaseHeadingIdentity = undefined;
  }

  applyPreview(
    tuningByProfileRef: Readonly<Record<string, CameraTuningV1>>,
    profiles: readonly ExecutionCameraRigProfileV1[],
  ): boolean {
    if (Array.isArray(tuningByProfileRef)) return false;
    const profilesByRef = new Map(
      profiles.map((profile) => [profile.resourceRef, profile] as const),
    );
    const nextTunings = new Map<string, CameraTuningV1>();
    for (const [profileRef, tuning] of Object.entries(tuningByProfileRef)) {
      if (tuning === null || typeof tuning !== "object" || Array.isArray(tuning)) {
        return false;
      }
      const profile = profilesByRef.get(profileRef);
      if (profile === undefined) return false;
      const result = validateCameraTuningV1(
        {
          algorithmRef: profile.algorithmRef,
          parameters: profile.parameters,
        },
        tuning,
      );
      if (!result.ok) return false;
      nextTunings.set(profileRef, result.tuning);
    }

    this.tuningByProfileRef.clear();
    for (const [profileRef, tuning] of nextTunings) {
      this.tuningByProfileRef.set(profileRef, tuning);
    }
    return true;
  }

  controlFrame(committedTick: number): ViewControlFrameV1 {
    // Temporary view modifiers such as look-back must never reverse movement intent.
    // The control frame follows the committed base view plus the user's persistent
    // orbit offset, and therefore stays engine-neutral and stable while looking back.
    const forward = horizontalDirection(this.controlForward) ?? new Vector3(0, 0, -1);
    const right = Vector3.Cross(forward, Vector3.Up()).normalize();
    return {
      forwardXYZ: [forward.x, forward.y, forward.z],
      rightXYZ: [right.x, right.y, right.z],
      committedTick,
    };
  }

  update(
    cameraContext: CameraContextV1 | undefined,
    sample: ViewTargetSampleV1,
    deltaSeconds: number,
  ): void {
    const selected = this.selectProfile(cameraContext, sample);
    if (selected === undefined) {
      this.updateLegacy(sample);
      return;
    }
    const baseProfile = selected.profile;
    const profile: ExecutionCameraRigProfileV1 = selected.modifiers.reduce(
      (current, modifier) => ({
        ...current,
        ...(modifier.headingSourceOverride === undefined
          ? {}
          : { headingSource: modifier.headingSourceOverride }),
        ...(modifier.reverseHeadingPolicyOverride === undefined
          ? {}
          : { reverseHeadingPolicy: modifier.reverseHeadingPolicyOverride }),
        ...(modifier.recenterModeOverride === undefined
          ? {}
          : { recenterMode: modifier.recenterModeOverride }),
        parameters: applyCameraRigParameterOverridesV1(
          baseProfile.algorithmRef,
          current.parameters,
          modifier.parameterOverrides,
        ),
      }),
      baseProfile,
    );

    const previousProfileRef = this.activeProfileRef;
    const nextModifierRefs = selected.modifiers.map((modifier) => modifier.resourceRef);
    const profileChanged = this.initialized && (
      previousProfileRef !== profile.resourceRef ||
      nextModifierRefs.join("|") !== this.activeModifierRefs.join("|")
    );
    if (profileChanged) {
      this.transitionElapsedSeconds = 0;
      this.transitionStartPosition.copyFrom(this.camera.position);
      this.transitionStartTarget.copyFrom(this.smoothedTarget);
      this.transitionStartFovRadians = this.camera.fov;
      this.baseHeadingIdentity = undefined;
      this.controlBaseHeadingIdentity = undefined;
    }
    this.activeProfileRef = profile.resourceRef;
    this.activeRigRef = profile.algorithmRef;
    this.activeModifierRefs = nextModifierRefs;
    const tuning = this.tuningByProfileRef.get(profile.resourceRef) ?? {};
    const parameters = applyCameraRigParameterOverridesV1(
      profile.algorithmRef,
      profile.parameters,
      tuning,
    );
    this.activeParameters = parameters;
    const lockedParameters = profile.parameters;
    this.activeLockedParameters = lockedParameters;
    if (profileChanged) this.transitionDurationSeconds = parameters.transitionSeconds;

    const targetPosition = new Vector3(...sample.targetPositionMetersXYZ);
    const socketPosition = profile.preferredSocketIds
      .map((id) => sample.socketPositionsMetersXYZById[id])
      .find((position) => position !== undefined);
    const baseTarget = socketPosition === undefined
      ? targetPosition.add(new Vector3(0, parameters.targetHeightMeters, 0))
      : new Vector3(...socketPosition);
    const controlBaseTarget = socketPosition === undefined
      ? targetPosition.add(new Vector3(0, lockedParameters.targetHeightMeters, 0))
      : new Vector3(...socketPosition);
    if (
      this.lastBaseTarget !== undefined &&
      Vector3.DistanceSquared(baseTarget, this.lastBaseTarget) >
        parameters.teleportSnapDistanceMeters * parameters.teleportSnapDistanceMeters
    ) {
      this.initialized = false;
      this.collisionDistanceMeters = undefined;
      this.transitionDurationSeconds = 0;
    }
    this.lastBaseTarget = baseTarget.clone();
    if (
      this.controlLastBaseTarget !== undefined &&
      Vector3.DistanceSquared(controlBaseTarget, this.controlLastBaseTarget) >
        lockedParameters.teleportSnapDistanceMeters *
          lockedParameters.teleportSnapDistanceMeters
    ) {
      this.controlInitialized = false;
    }
    this.controlLastBaseTarget = controlBaseTarget.clone();
    const velocity = new Vector3(...sample.velocityMetersPerSecondXYZ);
    const speed = velocity.length();
    const baseForward = this.resolveBaseForward(
      profile,
      parameters,
      sample,
      velocity,
      deltaSeconds,
    );
    const controlBaseForward = this.resolveControlBaseForward(
      profile,
      lockedParameters,
      sample,
      velocity,
      deltaSeconds,
    );
    this.secondsSinceManualViewInput += Math.max(0, deltaSeconds);
    this.controlSecondsSinceManualViewInput += Math.max(0, deltaSeconds);
    this.applyAutomaticRecentering(
      profile,
      parameters,
      sample,
      velocity,
      deltaSeconds,
    );
    this.applyControlAutomaticRecentering(
      profile,
      lockedParameters,
      sample,
      velocity,
      deltaSeconds,
    );
    const horizontalPositionAlpha = this.initialized
      ? exponentialAlpha(parameters.horizontalPositionDampingPerSecond, deltaSeconds)
      : 1;
    const verticalPositionAlpha = this.initialized
      ? exponentialAlpha(parameters.verticalPositionDampingPerSecond, deltaSeconds)
      : 1;
    const yawAlpha = this.initialized
      ? exponentialAlpha(parameters.yawDampingPerSecond, deltaSeconds)
      : 1;
    const pitchAlpha = this.initialized
      ? exponentialAlpha(parameters.pitchDampingPerSecond, deltaSeconds)
      : 1;
    const controlYawAlpha = this.controlInitialized
      ? exponentialAlpha(lockedParameters.yawDampingPerSecond, deltaSeconds)
      : 1;
    this.viewYawOffsetRadians += wrapRadians(
      this.targetYawOffsetRadians - this.viewYawOffsetRadians,
    ) * yawAlpha;
    this.viewPitchOffsetRadians += (
      this.targetPitchOffsetRadians - this.viewPitchOffsetRadians
    ) * pitchAlpha;
    this.viewDistanceOffsetMeters += (
      this.targetDistanceOffsetMeters - this.viewDistanceOffsetMeters
    ) * horizontalPositionAlpha;
    this.controlViewYawOffsetRadians += wrapRadians(
      this.controlTargetYawOffsetRadians - this.controlViewYawOffsetRadians,
    ) * controlYawAlpha;

    this.lookBackBlendRatio += (
      (this.activeInputActions.has("camera-look-back") ? 1 : 0) -
        this.lookBackBlendRatio
    ) * yawAlpha;

    this.controlForward.copyFrom(
      rotateAroundY(controlBaseForward, this.controlViewYawOffsetRadians).normalize(),
    );
    const forward = rotateAroundY(
      rotateAroundY(baseForward, this.viewYawOffsetRadians).normalize(),
      Math.PI * this.lookBackBlendRatio,
    ).normalize();
    const chaseAlgorithm =
      profile.algorithmRef.endsWith("/velocity-chase@1") ||
      profile.algorithmRef.endsWith("/flight-horizon@1");
    const lookAheadVelocity = chaseAlgorithm
      ? velocity
      : forward.scale(Math.max(0, Vector3.Dot(velocity, forward)));
    const acceleration = deltaSeconds <= 0
      ? Vector3.Zero()
      : velocity.subtract(this.previousVelocity).scale(1 / deltaSeconds);
    if (acceleration.length() > 30) acceleration.normalize().scaleInPlace(30);
    this.previousVelocity.copyFrom(velocity);
    const rawTarget = baseTarget
      .add(lookAheadVelocity.scale(parameters.lookAheadSeconds))
      .add(
        acceleration.scale(parameters.accelerationLookAheadSecondsSquared),
      );
    const target = this.targetWithDeadZone(rawTarget, parameters);
    const firstPerson = profile.algorithmRef.endsWith("/socket-first-person@1");
    let desiredPosition: Vector3;
    if (firstPerson) {
      desiredPosition = baseTarget.clone();
      const pitch = clamp(
        parameters.pitchRadians + this.viewPitchOffsetRadians,
        parameters.minimumPitchRadians,
        parameters.maximumPitchRadians,
      );
      const lookDirection = new Vector3(
        forward.x * Math.cos(pitch),
        Math.sin(pitch),
        forward.z * Math.cos(pitch),
      );
      target.copyFrom(desiredPosition.add(lookDirection));
    } else {
      const pitch = clamp(
        parameters.pitchRadians + this.viewPitchOffsetRadians,
        parameters.minimumPitchRadians,
        parameters.maximumPitchRadians,
      );
      const distance = clamp(
        parameters.distanceMeters + this.viewDistanceOffsetMeters,
        parameters.minimumDistanceMeters,
        parameters.maximumDistanceMeters,
      );
      const horizontalDistance = Math.cos(pitch) * distance;
      const right = Vector3.Cross(Vector3.Up(), forward).normalize();
      desiredPosition = target
        .subtract(forward.scale(horizontalDistance))
        .add(right.scale(parameters.shoulderOffsetMeters * this.shoulderSide));
      desiredPosition.y += Math.sin(pitch) * distance;
      if (profile.algorithmRef.endsWith("/flight-horizon@1")) {
        target.y = baseTarget.y + velocity.y * Math.min(0.5, parameters.lookAheadSeconds);
      }
      desiredPosition = this.collisionShortenedPosition(
        sample.entityId,
        target,
        desiredPosition,
        parameters,
        deltaSeconds,
      );
    }

    let nextPosition = new Vector3(
      this.camera.position.x +
        (desiredPosition.x - this.camera.position.x) * horizontalPositionAlpha,
      this.camera.position.y +
        (desiredPosition.y - this.camera.position.y) * verticalPositionAlpha,
      this.camera.position.z +
        (desiredPosition.z - this.camera.position.z) * horizontalPositionAlpha,
    );
    const positionLag = nextPosition.subtract(desiredPosition);
    if (
      positionLag.lengthSquared() >
        parameters.maximumPositionLagMeters * parameters.maximumPositionLagMeters
    ) {
      nextPosition = parameters.maximumPositionLagMeters <= 0
        ? desiredPosition.clone()
        : desiredPosition.add(
            positionLag.normalize().scale(parameters.maximumPositionLagMeters),
          );
    }
    const nextTarget = new Vector3(
      this.smoothedTarget.x + (target.x - this.smoothedTarget.x) * yawAlpha,
      this.smoothedTarget.y + (target.y - this.smoothedTarget.y) * pitchAlpha,
      this.smoothedTarget.z + (target.z - this.smoothedTarget.z) * yawAlpha,
    );
    const extraFov = Math.min(
      parameters.maximumSpeedFovDegrees,
      speed * parameters.speedFovDegreesPerMeterPerSecond,
    );
    const targetFov = ((parameters.baseFovDegrees + extraFov) * Math.PI) / 180;
    const fovAlpha = this.initialized
      ? exponentialAlpha(parameters.fovDampingPerSecond, deltaSeconds)
      : 1;
    this.smoothedFovRadians += (targetFov - this.smoothedFovRadians) * fovAlpha;
    const nextFov = this.smoothedFovRadians;
    if (
      this.transitionDurationSeconds > 0 &&
      this.transitionElapsedSeconds < this.transitionDurationSeconds
    ) {
      const transitionAlpha = smoothstep01(
        this.transitionElapsedSeconds / this.transitionDurationSeconds,
      );
      this.camera.position.copyFrom(Vector3.Lerp(
        this.transitionStartPosition,
        nextPosition,
        transitionAlpha,
      ));
      this.smoothedTarget.copyFrom(Vector3.Lerp(
        this.transitionStartTarget,
        nextTarget,
        transitionAlpha,
      ));
      this.camera.fov = this.transitionStartFovRadians +
        (nextFov - this.transitionStartFovRadians) * transitionAlpha;
    } else {
      this.camera.position.copyFrom(nextPosition);
      this.smoothedTarget.copyFrom(nextTarget);
      this.camera.fov = nextFov;
    }
    this.transitionElapsedSeconds += Math.max(0, deltaSeconds);
    this.camera.setTarget(this.smoothedTarget);
    this.initialized = true;
    this.controlInitialized = true;
  }

  reset(): void {
    this.initialized = false;
    this.explicitProfileRef = undefined;
    this.tuningByProfileRef.clear();
    this.fallbackActive = false;
    this.smoothedTarget.setAll(0);
    this.targetYawOffsetRadians = 0;
    this.targetPitchOffsetRadians = 0;
    this.targetDistanceOffsetMeters = 0;
    this.viewYawOffsetRadians = 0;
    this.viewPitchOffsetRadians = 0;
    this.viewDistanceOffsetMeters = 0;
    this.controlInitialized = false;
    this.controlTargetYawOffsetRadians = 0;
    this.controlViewYawOffsetRadians = 0;
    this.controlBaseHeadingYawRadians = Math.PI;
    this.controlBaseHeadingIdentity = undefined;
    this.controlLastStableVelocityForward = undefined;
    this.controlSecondsSinceManualViewInput = Number.POSITIVE_INFINITY;
    this.controlLastBaseTarget = undefined;
    this.baseHeadingYawRadians = Math.PI;
    this.baseHeadingIdentity = undefined;
    this.lastStableVelocityForward = undefined;
    this.transitionElapsedSeconds = 0;
    this.transitionDurationSeconds = 0;
    this.activeModifierRefs = [];
    this.activeInputActions.clear();
    this.previousInputActions.clear();
    this.secondsSinceManualViewInput = Number.POSITIVE_INFINITY;
    this.shoulderSide = 1;
    this.lookBackBlendRatio = 0;
    this.previousVelocity.setAll(0);
    this.lastBaseTarget = undefined;
    this.collisionDistanceMeters = undefined;
    this.smoothedFovRadians = Math.PI / 3;
    this.activeParameters = undefined;
    this.activeLockedParameters = undefined;
    this.controlForward.set(0, 0, -1);
  }

  snapshot(): CameraDirectorSnapshotV1 {
    return {
      activeCameraProfileRef: this.activeProfileRef,
      activeCameraRigRef: this.activeRigRef,
      activeCameraModifierRefs: this.activeModifierRefs,
      fallbackActive: this.fallbackActive,
      viewYawOffsetRadians: this.viewYawOffsetRadians,
      viewPitchOffsetRadians: this.viewPitchOffsetRadians,
      viewDistanceOffsetMeters: this.viewDistanceOffsetMeters,
    };
  }

  previewState(): CameraPreviewStateV1 {
    return {
      kind: "worldkit-camera-preview-state",
      schemaVersion: 1,
      activeCameraProfileRef: this.activeProfileRef,
      activeCameraRigRef: this.activeRigRef,
      activeCameraModifierRefs: this.activeModifierRefs,
      tuningByProfileRef: Object.fromEntries(
        [...this.tuningByProfileRef].map(([profileRef, tuning]) => [
          profileRef,
          { ...tuning },
        ]),
      ),
    };
  }

  private resolveBaseForward(
    profile: ExecutionCameraRigProfileV1,
    parameters: CameraParametersV1,
    sample: ViewTargetSampleV1,
    velocity: Vector3,
    deltaSeconds: number,
  ): Vector3 {
    const identity = `${sample.entityId}:${profile.resourceRef}`;
    const targetForward = horizontalDirection(new Vector3(...sample.forwardXYZ)) ??
      new Vector3(0, 0, -1);
    if (this.baseHeadingIdentity !== identity) {
      this.baseHeadingIdentity = identity;
      this.baseHeadingYawRadians = directionYaw(targetForward);
      this.lastStableVelocityForward = targetForward.clone();
    }
    let desired = targetForward;
    if (profile.headingSource === "view") {
      desired = yawDirection(this.baseHeadingYawRadians);
    } else if (profile.headingSource === "target-velocity") {
      const horizontalVelocity = horizontalDirection(velocity);
      const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
      if (
        horizontalVelocity !== undefined &&
        horizontalSpeed >= parameters.minimumHeadingSpeedMetersPerSecond
      ) {
        this.lastStableVelocityForward =
          profile.reverseHeadingPolicy === "preserve-target-forward" &&
            Vector3.Dot(horizontalVelocity, targetForward) < 0
            ? horizontalVelocity.scale(-1)
            : horizontalVelocity.clone();
      }
      desired = this.lastStableVelocityForward ?? targetForward;
    }
    if (profile.headingSource !== "view") {
      const alpha = this.initialized
        ? exponentialAlpha(parameters.velocityHeadingDampingPerSecond, deltaSeconds)
        : 1;
      this.baseHeadingYawRadians += wrapRadians(
        directionYaw(desired) - this.baseHeadingYawRadians,
      ) * alpha;
    }
    return yawDirection(this.baseHeadingYawRadians);
  }

  private resolveControlBaseForward(
    profile: ExecutionCameraRigProfileV1,
    parameters: CameraParametersV1,
    sample: ViewTargetSampleV1,
    velocity: Vector3,
    deltaSeconds: number,
  ): Vector3 {
    const identity = `${sample.entityId}:${profile.resourceRef}`;
    const targetForward = horizontalDirection(new Vector3(...sample.forwardXYZ)) ??
      new Vector3(0, 0, -1);
    if (this.controlBaseHeadingIdentity !== identity) {
      this.controlBaseHeadingIdentity = identity;
      this.controlBaseHeadingYawRadians = directionYaw(targetForward);
      this.controlLastStableVelocityForward = targetForward.clone();
    }
    let desired = targetForward;
    if (profile.headingSource === "view") {
      desired = yawDirection(this.controlBaseHeadingYawRadians);
    } else if (profile.headingSource === "target-velocity") {
      const horizontalVelocity = horizontalDirection(velocity);
      const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
      if (
        horizontalVelocity !== undefined &&
        horizontalSpeed >= parameters.minimumHeadingSpeedMetersPerSecond
      ) {
        this.controlLastStableVelocityForward =
          profile.reverseHeadingPolicy === "preserve-target-forward" &&
            Vector3.Dot(horizontalVelocity, targetForward) < 0
            ? horizontalVelocity.scale(-1)
            : horizontalVelocity.clone();
      }
      desired = this.controlLastStableVelocityForward ?? targetForward;
    }
    if (profile.headingSource !== "view") {
      const alpha = this.controlInitialized
        ? exponentialAlpha(parameters.velocityHeadingDampingPerSecond, deltaSeconds)
        : 1;
      this.controlBaseHeadingYawRadians += wrapRadians(
        directionYaw(desired) - this.controlBaseHeadingYawRadians,
      ) * alpha;
    }
    return yawDirection(this.controlBaseHeadingYawRadians);
  }

  private applyAutomaticRecentering(
    profile: ExecutionCameraRigProfileV1,
    parameters: CameraParametersV1,
    sample: ViewTargetSampleV1,
    velocity: Vector3,
    deltaSeconds: number,
  ): void {
    if (
      profile.recenterMode === "off" ||
      this.secondsSinceManualViewInput < parameters.recenterDelaySeconds ||
      this.activeInputActions.has("camera-look-back")
    ) return;
    const targetForward = horizontalDirection(new Vector3(...sample.forwardXYZ)) ??
      new Vector3(0, 0, -1);
    const horizontalVelocity = horizontalDirection(velocity);
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    if (profile.recenterMode === "forward-motion") {
      if (
        !sample.cameraContextTags.includes("forward-intent") ||
        horizontalVelocity === undefined ||
        horizontalSpeed < parameters.recenterMinimumSpeedMetersPerSecond ||
        Vector3.Dot(horizontalVelocity, targetForward) < 0.65
      ) return;
    }
    const desiredYawOffset = profile.headingSource === "view"
      ? wrapRadians(directionYaw(targetForward) - this.baseHeadingYawRadians)
      : 0;
    const recenterAlpha = parameters.recenterDurationSeconds <= 0
      ? 1
      : exponentialAlpha(4.6 / parameters.recenterDurationSeconds, deltaSeconds);
    this.targetYawOffsetRadians += wrapRadians(
      desiredYawOffset - this.targetYawOffsetRadians,
    ) * recenterAlpha;
    this.targetPitchOffsetRadians +=
      (0 - this.targetPitchOffsetRadians) * recenterAlpha;
  }

  private applyControlAutomaticRecentering(
    profile: ExecutionCameraRigProfileV1,
    parameters: CameraParametersV1,
    sample: ViewTargetSampleV1,
    velocity: Vector3,
    deltaSeconds: number,
  ): void {
    if (
      profile.recenterMode === "off" ||
      this.controlSecondsSinceManualViewInput < parameters.recenterDelaySeconds ||
      this.activeInputActions.has("camera-look-back")
    ) return;
    const targetForward = horizontalDirection(new Vector3(...sample.forwardXYZ)) ??
      new Vector3(0, 0, -1);
    const horizontalVelocity = horizontalDirection(velocity);
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    if (profile.recenterMode === "forward-motion") {
      if (
        !sample.cameraContextTags.includes("forward-intent") ||
        horizontalVelocity === undefined ||
        horizontalSpeed < parameters.recenterMinimumSpeedMetersPerSecond ||
        Vector3.Dot(horizontalVelocity, targetForward) < 0.65
      ) return;
    }
    const desiredYawOffset = profile.headingSource === "view"
      ? wrapRadians(
          directionYaw(targetForward) - this.controlBaseHeadingYawRadians,
        )
      : 0;
    const recenterAlpha = parameters.recenterDurationSeconds <= 0
      ? 1
      : exponentialAlpha(4.6 / parameters.recenterDurationSeconds, deltaSeconds);
    this.controlTargetYawOffsetRadians += wrapRadians(
      desiredYawOffset - this.controlTargetYawOffsetRadians,
    ) * recenterAlpha;
  }

  private targetWithDeadZone(
    rawTarget: Vector3,
    parameters: CameraParametersV1,
  ): Vector3 {
    if (
      !this.initialized ||
      (parameters.horizontalDeadZoneRatio <= 0 &&
        parameters.verticalDeadZoneRatio <= 0)
    ) return rawTarget;
    const forward = this.camera.getForwardRay().direction.normalize();
    const right = Vector3.Cross(forward, Vector3.Up()).normalize();
    const up = Vector3.Cross(right, forward).normalize();
    const delta = rawTarget.subtract(this.smoothedTarget);
    const distance = Math.max(1, Vector3.Distance(this.camera.position, rawTarget));
    const halfHeight = Math.tan(this.camera.fov / 2) * distance;
    const halfWidth = halfHeight * this.scene.getEngine().getAspectRatio(this.camera);
    const horizontal = Vector3.Dot(delta, right);
    const vertical = Vector3.Dot(delta, up);
    const depth = Vector3.Dot(delta, forward);
    const horizontalLimit = halfWidth * parameters.horizontalDeadZoneRatio;
    const verticalLimit = halfHeight * parameters.verticalDeadZoneRatio;
    const horizontalExcess = Math.sign(horizontal) * Math.max(
      0,
      Math.abs(horizontal) - horizontalLimit,
    );
    const verticalExcess = Math.sign(vertical) * Math.max(
      0,
      Math.abs(vertical) - verticalLimit,
    );
    return this.smoothedTarget
      .add(right.scale(horizontalExcess))
      .add(up.scale(verticalExcess))
      .add(forward.scale(depth));
  }

  private selectProfile(
    context: CameraContextV1 | undefined,
    sample: ViewTargetSampleV1,
  ): SelectedCameraStateV1 | undefined {
    if (context === undefined) return undefined;
    const byRef = new Map(
      context.cameraRigProfiles.map((profile) => [profile.resourceRef, profile]),
    );
    const modifiersByRef = new Map(
      context.cameraModifierProfiles.map((modifier) => [modifier.resourceRef, modifier]),
    );
    const matchingRules = [...context.rules]
      .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
      .filter((rule) => ruleMatches(rule, sample));
    let selectedRef: string;
    if (this.explicitProfileRef !== undefined && byRef.has(this.explicitProfileRef)) {
      selectedRef = this.explicitProfileRef;
    } else {
      selectedRef = matchingRules.find(
        (rule) => rule.cameraRigProfileRef !== undefined,
      )?.cameraRigProfileRef ??
        context.defaultCameraRigProfileRef;
    }
    const profile = byRef.get(selectedRef) ?? byRef.get(context.defaultCameraRigProfileRef);
    this.fallbackActive = profile === undefined || profile.resourceRef !== selectedRef;
    if (profile === undefined) return undefined;
    const modifierRefs = matchingRules.flatMap((rule) => rule.cameraModifierRefs ?? []);
    const modifiers = [...new Set(modifierRefs)]
      .reverse()
      .flatMap((resourceRef) => {
        const modifier = modifiersByRef.get(resourceRef);
        return modifier === undefined ? [] : [modifier];
      });
    return { profile, modifiers };
  }

  private collisionShortenedPosition(
    subjectEntityId: string,
    target: Vector3,
    desiredPosition: Vector3,
    parameters: CameraParametersV1,
    deltaSeconds: number,
  ): Vector3 {
    const displacement = desiredPosition.subtract(target);
    const distance = displacement.length();
    if (distance <= 0.000001) return desiredPosition;
    const direction = displacement.scale(1 / distance);
    const right = Vector3.Cross(Vector3.Up(), direction).normalize();
    const probeUp = Vector3.Cross(direction, right).normalize();
    const radius = parameters.collisionRadiusMeters;
    const offsets = [
      Vector3.Zero(),
      right.scale(radius),
      right.scale(-radius),
      probeUp.scale(radius),
      probeUp.scale(-radius),
    ];
    let safeDistance = distance;
    for (const offset of offsets) {
      const ray = new Ray(target.add(offset), direction, distance);
      const hit = this.scene.pickWithRay(ray, (mesh) =>
        mesh.isPickable && mesh.metadata?.worldkitEntityId !== subjectEntityId
      );
      if (hit?.hit !== true || hit.distance <= 0) continue;
      safeDistance = Math.min(
        safeDistance,
        Math.max(parameters.minimumDistanceMeters, hit.distance - radius),
      );
    }
    this.collisionDistanceMeters ??= distance;
    const rate = safeDistance < this.collisionDistanceMeters
      ? parameters.collisionRetractionMetersPerSecond
      : parameters.collisionRecoveryMetersPerSecond;
    this.collisionDistanceMeters = moveTowards(
      this.collisionDistanceMeters,
      safeDistance,
      rate * Math.max(0, deltaSeconds),
    );
    return target.add(
      direction.scale(Math.min(distance, this.collisionDistanceMeters)),
    );
  }

  private updateLegacy(sample: ViewTargetSampleV1): void {
    const origin = new Vector3(...sample.targetPositionMetersXYZ);
    const plan = this.executionPlan.camera;
    const target = new Vector3(origin.x, origin.y + plan.targetHeightMeters, origin.z);
    this.viewYawOffsetRadians = this.targetYawOffsetRadians;
    this.viewPitchOffsetRadians = this.targetPitchOffsetRadians;
    this.viewDistanceOffsetMeters = this.targetDistanceOffsetMeters;
    const yawRadians = this.viewYawOffsetRadians;
    const pitchRadians = clamp(
      plan.pitchRadians + this.viewPitchOffsetRadians,
      -0.95,
      0.65,
    );
    const distanceMeters = clamp(
      plan.distanceMeters + this.viewDistanceOffsetMeters,
      1.8,
      8,
    );
    const horizontalDistance = Math.cos(pitchRadians) * distanceMeters;
    this.camera.position.set(
      target.x + Math.sin(yawRadians) * horizontalDistance,
      target.y + Math.sin(pitchRadians) * distanceMeters,
      target.z + Math.cos(yawRadians) * horizontalDistance,
    );
    this.camera.setTarget(target);
    this.smoothedTarget.copyFrom(target);
    this.activeProfileRef = plan.rigRef;
    this.activeRigRef = "worldkit://camera-rig/orbit-follow@1";
    this.activeModifierRefs = [];
    this.controlForward.copyFrom(
      horizontalDirection(this.camera.getForwardRay().direction) ??
        new Vector3(0, 0, -1),
    );
    this.fallbackActive = false;
    this.initialized = true;
  }
}
