import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  CameraTuningV1,
  CameraViewInputV1,
  ExecutionCameraRigProfileV1,
  ExecutionMovementMediumV1,
  ExecutionPlanV4,
  ExecutionSubjectV3,
} from "@whitebox-world/runtime-contracts";

import type { SubjectController } from "./subject-controller";
import type { SubjectVisual } from "./subject-visual";

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

function ruleMatches(
  rule: NonNullable<ExecutionSubjectV3["capabilityAssembly"]>["cameraContext"]["rules"][number],
  facts: {
    activeMotionKernelRef: string;
    motionTags: readonly string[];
    movementMedium: ExecutionMovementMediumV1;
    speedMetersPerSecond: number;
    socketIds: ReadonlySet<string>;
  },
): boolean {
  const when = rule.when;
  if (
    when.relationshipRoles !== undefined &&
    !when.relationshipRoles.includes("none")
  ) return false;
  if (
    when.motionKernelRefs !== undefined &&
    !when.motionKernelRefs.includes(facts.activeMotionKernelRef)
  ) return false;
  if (
    when.requiredMotionTags !== undefined &&
    !when.requiredMotionTags.every((tag) => facts.motionTags.includes(tag))
  ) return false;
  if (
    when.movementMediums !== undefined &&
    !when.movementMediums.includes(facts.movementMedium)
  ) return false;
  if (
    when.minimumSpeedMetersPerSecond !== undefined &&
    facts.speedMetersPerSecond < when.minimumSpeedMetersPerSecond
  ) return false;
  if (
    when.maximumSpeedMetersPerSecond !== undefined &&
    facts.speedMetersPerSecond > when.maximumSpeedMetersPerSecond
  ) return false;
  if (
    when.requiredSocketIds !== undefined &&
    !when.requiredSocketIds.every((id) => facts.socketIds.has(id))
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
  private tuning: CameraTuningV1 = {};

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
  }

  setTuning(tuning: CameraTuningV1): boolean {
    const entries = Object.entries(tuning).filter((entry) => entry[1] !== undefined);
    if (!entries.every((entry) => typeof entry[1] === "number" && Number.isFinite(entry[1]))) {
      return false;
    }
    this.tuning = {
      ...(tuning.distanceMeters === undefined
        ? {}
        : { distanceMeters: clamp(tuning.distanceMeters, 0, 30) }),
      ...(tuning.targetHeightMeters === undefined
        ? {}
        : { targetHeightMeters: clamp(tuning.targetHeightMeters, 0, 10) }),
      ...(tuning.positionDampingPerSecond === undefined
        ? {}
        : { positionDampingPerSecond: clamp(tuning.positionDampingPerSecond, 1, 40) }),
      ...(tuning.rotationDampingPerSecond === undefined
        ? {}
        : { rotationDampingPerSecond: clamp(tuning.rotationDampingPerSecond, 1, 40) }),
      ...(tuning.lookAheadSeconds === undefined
        ? {}
        : { lookAheadSeconds: clamp(tuning.lookAheadSeconds, 0, 2) }),
      ...(tuning.baseFovDegrees === undefined
        ? {}
        : { baseFovDegrees: clamp(tuning.baseFovDegrees, 35, 100) }),
    };
    return true;
  }

  update(
    subject: ExecutionSubjectV3,
    controller: SubjectController,
    visual: SubjectVisual,
    movementMedium: ExecutionMovementMediumV1,
    deltaSeconds: number,
  ): void {
    const profile = this.selectProfile(subject, controller, visual, movementMedium);
    if (profile === undefined) {
      this.updateLegacy(subject, controller);
      return;
    }
    this.activeProfileRef = profile.resourceRef;
    this.activeRigRef = profile.algorithmRef;
    const parameters = { ...profile.parameters, ...this.tuning };
    const motion = controller.motionSnapshot();
    const socket = profile.preferredSocketIds
      .map((id) => visual.socketNodesById.get(id))
      .find((node) => node !== undefined);
    const origin = controller.subjectOrigin;
    const socketPosition = socket?.getAbsolutePosition();
    const baseTarget = socketPosition?.clone() ?? new Vector3(
      origin.x,
      origin.y + parameters.targetHeightMeters,
      origin.z,
    );
    const velocity = controller.velocity;
    const lookAhead = velocity.scale(parameters.lookAheadSeconds);
    const target = baseTarget.add(lookAhead);
    const subjectForward = controller.forward.normalizeToNew();
    const speed = motion.speedMetersPerSecond;
    const algorithm = profile.algorithmRef;
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
    const forward = rotateAroundY(subjectForward, this.viewYawOffsetRadians).normalize();
    let desiredPosition: Vector3;
    if (algorithm.endsWith("/socket-first-person@1")) {
      desiredPosition = socketPosition?.clone() ?? baseTarget;
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
      if (algorithm.endsWith("/flight-horizon@1")) {
        target.y = baseTarget.y + velocity.y * Math.min(0.5, parameters.lookAheadSeconds);
      }
      desiredPosition = this.collisionShortenedPosition(
        subject.entityId,
        target,
        desiredPosition,
        profile,
      );
    }

    this.camera.position = Vector3.Lerp(
      this.camera.position,
      desiredPosition,
      positionAlpha,
    );
    this.smoothedTarget = Vector3.Lerp(this.smoothedTarget, target, rotationAlpha);
    this.camera.setTarget(this.smoothedTarget);
    const extraFov = Math.min(
      parameters.maximumSpeedFovDegrees,
      speed * parameters.speedFovDegreesPerMeterPerSecond,
    );
    this.camera.fov =
      ((parameters.baseFovDegrees + extraFov) * Math.PI) / 180;
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
    this.tuning = {};
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
      tuning: { ...this.tuning },
    };
  }

  private selectProfile(
    subject: ExecutionSubjectV3,
    controller: SubjectController,
    visual: SubjectVisual,
    movementMedium: ExecutionMovementMediumV1,
  ): ExecutionCameraRigProfileV1 | undefined {
    const context = subject.capabilityAssembly?.cameraContext;
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
      const motion = controller.motionSnapshot();
      const facts = {
        activeMotionKernelRef: motion.activeMotionKernelRef,
        motionTags: motion.motionTags,
        movementMedium,
        speedMetersPerSecond: motion.speedMetersPerSecond,
        socketIds: new Set(visual.socketNodesById.keys()),
      };
      selectedRef = [...context.rules]
        .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
        .find((rule) => ruleMatches(rule, facts))?.cameraRigProfileRef ??
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
    profile: ExecutionCameraRigProfileV1,
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
      profile.parameters.minimumDistanceMeters,
      hit.distance - profile.parameters.collisionRadiusMeters,
    );
    return target.add(ray.direction.scale(Math.min(distance, safeDistance)));
  }

  private updateLegacy(subject: ExecutionSubjectV3, controller: SubjectController): void {
    const origin = controller.subjectOrigin;
    const plan = this.executionPlan.camera;
    const target = new Vector3(origin.x, origin.y + plan.targetHeightMeters, origin.z);
    const horizontalDistance = Math.cos(plan.pitchRadians) * plan.distanceMeters;
    this.camera.position.set(
      target.x,
      target.y + Math.sin(plan.pitchRadians) * plan.distanceMeters,
      target.z + horizontalDistance,
    );
    this.camera.setTarget(target);
    this.activeProfileRef = plan.rigRef;
    this.activeRigRef = "worldkit://camera-rig/orbit-follow@1";
    this.fallbackActive = false;
    this.initialized = true;
    void subject;
  }
}
