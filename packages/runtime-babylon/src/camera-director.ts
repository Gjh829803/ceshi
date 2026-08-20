import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
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
}

function exponentialAlpha(ratePerSecond: number, deltaSeconds: number): number {
  return 1 - Math.exp(-Math.max(0, ratePerSecond) * Math.max(0, deltaSeconds));
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
    const motion = controller.motionSnapshot();
    const socket = profile.preferredSocketIds
      .map((id) => visual.socketNodesById.get(id))
      .find((node) => node !== undefined);
    const origin = controller.subjectOrigin;
    const socketPosition = socket?.getAbsolutePosition();
    const baseTarget = socketPosition?.clone() ?? new Vector3(
      origin.x,
      origin.y + profile.parameters.targetHeightMeters,
      origin.z,
    );
    const velocity = controller.velocity;
    const lookAhead = velocity.scale(profile.parameters.lookAheadSeconds);
    const target = baseTarget.add(lookAhead);
    const forward = controller.forward.normalizeToNew();
    const speed = motion.speedMetersPerSecond;
    const algorithm = profile.algorithmRef;
    let desiredPosition: Vector3;
    if (algorithm.endsWith("/socket-first-person@1")) {
      desiredPosition = socketPosition?.clone() ?? baseTarget;
      target.copyFrom(desiredPosition.add(forward));
    } else {
      const pitch = Math.max(
        profile.parameters.minimumPitchRadians,
        Math.min(profile.parameters.maximumPitchRadians, profile.parameters.pitchRadians),
      );
      const distance = Math.max(
        profile.parameters.minimumDistanceMeters,
        Math.min(profile.parameters.maximumDistanceMeters, profile.parameters.distanceMeters),
      );
      const horizontalDistance = Math.cos(pitch) * distance;
      const right = Vector3.Cross(Vector3.Up(), forward).normalize();
      desiredPosition = target
        .subtract(forward.scale(horizontalDistance))
        .add(right.scale(profile.parameters.shoulderOffsetMeters));
      desiredPosition.y += Math.sin(pitch) * distance;
      if (algorithm.endsWith("/flight-horizon@1")) {
        target.y = baseTarget.y + velocity.y * Math.min(0.5, profile.parameters.lookAheadSeconds);
      }
      desiredPosition = this.collisionShortenedPosition(
        subject.entityId,
        target,
        desiredPosition,
        profile,
      );
    }

    const positionAlpha = this.initialized
      ? exponentialAlpha(profile.parameters.positionDampingPerSecond, deltaSeconds)
      : 1;
    const rotationAlpha = this.initialized
      ? exponentialAlpha(profile.parameters.rotationDampingPerSecond, deltaSeconds)
      : 1;
    this.camera.position = Vector3.Lerp(
      this.camera.position,
      desiredPosition,
      positionAlpha,
    );
    this.smoothedTarget = Vector3.Lerp(this.smoothedTarget, target, rotationAlpha);
    this.camera.setTarget(this.smoothedTarget);
    const extraFov = Math.min(
      profile.parameters.maximumSpeedFovDegrees,
      speed * profile.parameters.speedFovDegreesPerMeterPerSecond,
    );
    this.camera.fov =
      ((profile.parameters.baseFovDegrees + extraFov) * Math.PI) / 180;
    this.initialized = true;
  }

  reset(): void {
    this.initialized = false;
    this.preference = "auto";
    this.fallbackActive = false;
    this.smoothedTarget.setAll(0);
  }

  snapshot(): CameraDirectorSnapshotV1 {
    return {
      activeCameraProfileRef: this.activeProfileRef,
      activeCameraRigRef: this.activeRigRef,
      preference: this.preference,
      fallbackActive: this.fallbackActive,
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
