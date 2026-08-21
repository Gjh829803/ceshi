import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  CameraTuningV1,
  CameraViewInputV1,
  ExecutionCameraRigProfileV1,
  ExecutionPlanV4,
  ExecutionSubjectCapabilityAssemblyV1,
  ViewControlFrameV1,
  ViewTargetSampleV1,
} from "@whitebox-world/runtime-contracts";

export type CameraPreferenceV1 = "auto" | "first-person" | string;

export interface CameraDirectorSnapshotV1 {
  activeCameraProfileRef: string;
  activeCameraRigRef: string;
  preference: CameraPreferenceV1;
  fallbackActive: boolean;
  viewYawOffsetRadians: number;
  viewPitchOffsetRadians: number;
  viewDistanceOffsetMeters: number;
  tuning: Readonly<CameraTuningV1>;
}

type CameraContextV1 = ExecutionSubjectCapabilityAssemblyV1["cameraContext"];
type CameraParametersV1 = ExecutionCameraRigProfileV1["parameters"];

function exponentialAlpha(ratePerSecond: number, deltaSeconds: number): number {
  return 1 - Math.exp(-Math.max(0, ratePerSecond) * Math.max(0, deltaSeconds));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
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
  return true;
}

export class CameraDirectorV1 {
  private initialized = false;
  private preference: CameraPreferenceV1 = "auto";
  private activeProfileRef: string;
  private activeRigRef = "worldkit://camera-rig/orbit-follow@1";
  private fallbackActive = false;
  private smoothedTarget = Vector3.Zero();
  private targetYawOffsetRadians = 0;
  private targetPitchOffsetRadians = 0;
  private targetDistanceOffsetMeters = 0;
  private viewYawOffsetRadians = 0;
  private viewPitchOffsetRadians = 0;
  private viewDistanceOffsetMeters = 0;
  private readonly tuningByProfileRef = new Map<string, CameraTuningV1>();
  private baseHeadingYawRadians = Math.PI;
  private baseHeadingIdentity: string | undefined;
  private lastStableVelocityForward: Vector3 | undefined;
  private transitionElapsedSeconds = 0;
  private transitionDurationSeconds = 0;
  private transitionStartPosition = Vector3.Zero();
  private transitionStartTarget = Vector3.Zero();
  private transitionStartFovRadians = Math.PI / 3;

  constructor(
    private readonly executionPlan: ExecutionPlanV4,
    private readonly camera: FreeCamera,
    private readonly scene: Scene,
  ) {
    this.activeProfileRef = executionPlan.camera.rigRef;
  }

  setPreference(preference: CameraPreferenceV1): boolean {
    if (preference.trim().length === 0) return false;
    this.preference = preference;
    return true;
  }

  adjustView(input: CameraViewInputV1): boolean {
    const deltas = [
      input.yawDeltaRadians ?? 0,
      input.pitchDeltaRadians ?? 0,
      input.zoomDeltaMeters ?? 0,
    ];
    if (!deltas.every(Number.isFinite)) return false;
    this.targetYawOffsetRadians = wrapRadians(
      this.targetYawOffsetRadians + deltas[0]!,
    );
    this.targetPitchOffsetRadians = clamp(
      this.targetPitchOffsetRadians + deltas[1]!,
      -1.4,
      1.4,
    );
    this.targetDistanceOffsetMeters = clamp(
      this.targetDistanceOffsetMeters + deltas[2]!,
      -30,
      30,
    );
    return true;
  }

  resetView(): void {
    this.targetYawOffsetRadians = 0;
    this.targetPitchOffsetRadians = 0;
    this.targetDistanceOffsetMeters = 0;
    this.baseHeadingIdentity = undefined;
  }

  setTuning(tuning: CameraTuningV1): boolean {
    const entries = Object.entries(tuning).filter((entry) => entry[1] !== undefined);
    if (!entries.every((entry) => typeof entry[1] === "number" && Number.isFinite(entry[1]))) {
      return false;
    }
    this.tuningByProfileRef.set(this.activeProfileRef, {
      ...(tuning.distanceMeters === undefined
        ? {}
        : { distanceMeters: clamp(tuning.distanceMeters, 0, 30) }),
      ...(tuning.targetHeightMeters === undefined
        ? {}
        : { targetHeightMeters: clamp(tuning.targetHeightMeters, 0, 10) }),
      ...(tuning.shoulderOffsetMeters === undefined
        ? {}
        : { shoulderOffsetMeters: clamp(tuning.shoulderOffsetMeters, -3, 3) }),
      ...(tuning.pitchRadians === undefined
        ? {}
        : { pitchRadians: clamp(tuning.pitchRadians, -1.4, 1.4) }),
      ...(tuning.positionDampingPerSecond === undefined
        ? {}
        : { positionDampingPerSecond: clamp(tuning.positionDampingPerSecond, 0, 40) }),
      ...(tuning.rotationDampingPerSecond === undefined
        ? {}
        : { rotationDampingPerSecond: clamp(tuning.rotationDampingPerSecond, 0, 40) }),
      ...(tuning.collisionRadiusMeters === undefined
        ? {}
        : { collisionRadiusMeters: clamp(tuning.collisionRadiusMeters, 0.01, 2) }),
      ...(tuning.lookAheadSeconds === undefined
        ? {}
        : { lookAheadSeconds: clamp(tuning.lookAheadSeconds, 0, 2) }),
      ...(tuning.transitionSeconds === undefined
        ? {}
        : { transitionSeconds: clamp(tuning.transitionSeconds, 0, 3) }),
      ...(tuning.baseFovDegrees === undefined
        ? {}
        : { baseFovDegrees: clamp(tuning.baseFovDegrees, 35, 100) }),
      ...(tuning.speedFovDegreesPerMeterPerSecond === undefined
        ? {}
        : {
            speedFovDegreesPerMeterPerSecond: clamp(
              tuning.speedFovDegreesPerMeterPerSecond,
              0,
              5,
            ),
          }),
      ...(tuning.maximumSpeedFovDegrees === undefined
        ? {}
        : { maximumSpeedFovDegrees: clamp(tuning.maximumSpeedFovDegrees, 0, 30) }),
    });
    return true;
  }

  controlFrame(committedTick: number): ViewControlFrameV1 {
    const forward = horizontalDirection(this.camera.getForwardRay().direction) ??
      new Vector3(0, 0, -1);
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
    const profile = this.selectProfile(cameraContext, sample);
    if (profile === undefined) {
      this.updateLegacy(sample);
      return;
    }

    const previousProfileRef = this.activeProfileRef;
    const profileChanged = this.initialized && previousProfileRef !== profile.resourceRef;
    if (profileChanged) {
      this.transitionElapsedSeconds = 0;
      this.transitionStartPosition.copyFrom(this.camera.position);
      this.transitionStartTarget.copyFrom(this.smoothedTarget);
      this.transitionStartFovRadians = this.camera.fov;
      this.baseHeadingIdentity = undefined;
    }
    this.activeProfileRef = profile.resourceRef;
    this.activeRigRef = profile.algorithmRef;
    const tuning = this.tuningByProfileRef.get(profile.resourceRef) ?? {};
    const parameters = { ...profile.parameters, ...tuning };
    if (profileChanged) this.transitionDurationSeconds = parameters.transitionSeconds;

    const targetPosition = new Vector3(...sample.targetPositionMetersXYZ);
    const socketPosition = profile.preferredSocketIds
      .map((id) => sample.socketPositionsMetersXYZById[id])
      .find((position) => position !== undefined);
    const baseTarget = socketPosition === undefined
      ? targetPosition.add(new Vector3(0, parameters.targetHeightMeters, 0))
      : new Vector3(...socketPosition);
    const velocity = new Vector3(...sample.velocityMetersPerSecondXYZ);
    const speed = velocity.length();
    const baseForward = this.resolveBaseForward(profile, sample, velocity, deltaSeconds);
    const positionAlpha = this.initialized
      ? exponentialAlpha(parameters.positionDampingPerSecond, deltaSeconds)
      : 1;
    const rotationAlpha = this.initialized
      ? exponentialAlpha(parameters.rotationDampingPerSecond, deltaSeconds)
      : 1;
    this.viewYawOffsetRadians += wrapRadians(
      this.targetYawOffsetRadians - this.viewYawOffsetRadians,
    ) * rotationAlpha;
    this.viewPitchOffsetRadians += (
      this.targetPitchOffsetRadians - this.viewPitchOffsetRadians
    ) * rotationAlpha;
    this.viewDistanceOffsetMeters += (
      this.targetDistanceOffsetMeters - this.viewDistanceOffsetMeters
    ) * positionAlpha;

    const forward = rotateAroundY(baseForward, this.viewYawOffsetRadians).normalize();
    const chaseAlgorithm =
      profile.algorithmRef.endsWith("/velocity-chase@1") ||
      profile.algorithmRef.endsWith("/flight-horizon@1");
    const lookAheadVelocity = chaseAlgorithm
      ? velocity
      : forward.scale(Math.max(0, Vector3.Dot(velocity, forward)));
    const target = baseTarget.add(lookAheadVelocity.scale(parameters.lookAheadSeconds));
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
        .add(right.scale(parameters.shoulderOffsetMeters));
      desiredPosition.y += Math.sin(pitch) * distance;
      if (profile.algorithmRef.endsWith("/flight-horizon@1")) {
        target.y = baseTarget.y + velocity.y * Math.min(0.5, parameters.lookAheadSeconds);
      }
      desiredPosition = this.collisionShortenedPosition(
        sample.entityId,
        target,
        desiredPosition,
        parameters,
      );
    }

    const nextPosition = Vector3.Lerp(this.camera.position, desiredPosition, positionAlpha);
    const nextTarget = Vector3.Lerp(this.smoothedTarget, target, rotationAlpha);
    const extraFov = Math.min(
      parameters.maximumSpeedFovDegrees,
      speed * parameters.speedFovDegreesPerMeterPerSecond,
    );
    const nextFov = ((parameters.baseFovDegrees + extraFov) * Math.PI) / 180;
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
  }

  reset(): void {
    this.initialized = false;
    this.preference = "auto";
    this.fallbackActive = false;
    this.smoothedTarget.setAll(0);
    this.targetYawOffsetRadians = 0;
    this.targetPitchOffsetRadians = 0;
    this.targetDistanceOffsetMeters = 0;
    this.viewYawOffsetRadians = 0;
    this.viewPitchOffsetRadians = 0;
    this.viewDistanceOffsetMeters = 0;
    this.tuningByProfileRef.clear();
    this.baseHeadingYawRadians = Math.PI;
    this.baseHeadingIdentity = undefined;
    this.lastStableVelocityForward = undefined;
    this.transitionElapsedSeconds = 0;
    this.transitionDurationSeconds = 0;
  }

  snapshot(): CameraDirectorSnapshotV1 {
    return {
      activeCameraProfileRef: this.activeProfileRef,
      activeCameraRigRef: this.activeRigRef,
      preference: this.preference,
      fallbackActive: this.fallbackActive,
      viewYawOffsetRadians: this.viewYawOffsetRadians,
      viewPitchOffsetRadians: this.viewPitchOffsetRadians,
      viewDistanceOffsetMeters: this.viewDistanceOffsetMeters,
      tuning: { ...(this.tuningByProfileRef.get(this.activeProfileRef) ?? {}) },
    };
  }

  private resolveBaseForward(
    profile: ExecutionCameraRigProfileV1,
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
        horizontalSpeed >= profile.parameters.minimumHeadingSpeedMetersPerSecond
      ) {
        this.lastStableVelocityForward = horizontalVelocity.clone();
      }
      desired = this.lastStableVelocityForward ?? targetForward;
    }
    if (profile.headingSource !== "view") {
      const alpha = this.initialized
        ? exponentialAlpha(profile.parameters.rotationDampingPerSecond, deltaSeconds)
        : 1;
      this.baseHeadingYawRadians += wrapRadians(
        directionYaw(desired) - this.baseHeadingYawRadians,
      ) * alpha;
    }
    return yawDirection(this.baseHeadingYawRadians);
  }

  private selectProfile(
    context: CameraContextV1 | undefined,
    sample: ViewTargetSampleV1,
  ): ExecutionCameraRigProfileV1 | undefined {
    if (context === undefined) return undefined;
    const byRef = new Map(
      context.cameraRigProfiles.map((profile) => [profile.resourceRef, profile]),
    );
    let selectedRef: string;
    if (this.preference === "first-person") {
      selectedRef =
        context.firstPersonCameraRigProfileRef ?? context.defaultCameraRigProfileRef;
    } else if (this.preference !== "auto" && byRef.has(this.preference)) {
      selectedRef = this.preference;
    } else {
      selectedRef = [...context.rules]
        .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
        .find((rule) => ruleMatches(rule, sample))?.cameraRigProfileRef ??
        context.defaultCameraRigProfileRef;
    }
    const profile = byRef.get(selectedRef) ?? byRef.get(context.defaultCameraRigProfileRef);
    this.fallbackActive = profile === undefined || profile.resourceRef !== selectedRef;
    return profile;
  }

  private collisionShortenedPosition(
    subjectEntityId: string,
    target: Vector3,
    desiredPosition: Vector3,
    parameters: CameraParametersV1,
  ): Vector3 {
    const displacement = desiredPosition.subtract(target);
    const distance = displacement.length();
    if (distance <= 0.000001) return desiredPosition;
    const ray = new Ray(target, displacement.scale(1 / distance), distance);
    const hit = this.scene.pickWithRay(ray, (mesh) =>
      mesh.isPickable && mesh.metadata?.worldkitEntityId !== subjectEntityId
    );
    if (hit?.hit !== true || hit.distance <= 0) return desiredPosition;
    const safeDistance = Math.max(
      parameters.minimumDistanceMeters,
      hit.distance - parameters.collisionRadiusMeters,
    );
    return target.add(ray.direction.scale(Math.min(distance, safeDistance)));
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
    this.fallbackActive = false;
    this.initialized = true;
  }
}
