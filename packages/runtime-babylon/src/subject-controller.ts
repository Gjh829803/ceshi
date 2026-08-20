import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  CharacterSupportedState,
  PhysicsCharacterController,
} from "@babylonjs/core/Physics/v2/characterController.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  ExecutionSubjectV3,
  SemanticInputActionV1,
  Vec3,
} from "@whitebox-world/runtime-contracts";

import { FIXED_TIME_STEP_SECONDS } from "./physics";

export interface SubjectMotionSampleV1 {
  horizontalSpeedMetersPerSecond: number;
  runRequested: boolean;
  movementMedium: "ground" | "air" | "water";
}

function hasAction(actions: readonly SemanticInputActionV1[], action: SemanticInputActionV1): boolean {
  return actions.includes(action);
}

export class SubjectController {
  readonly physicsController: PhysicsCharacterController;
  private readonly gravity: Vector3;
  private readonly up = Vector3.Up();
  private readonly colliderCenterOffsetFromSubjectOrigin: Vector3;
  private jumpInProgress = false;
  private jumpActionWasActive = false;
  private currentMovementMedium: "ground" | "air" | "water" = "air";
  private initialGroundSupportPending: boolean;

  constructor(
    private readonly subject: ExecutionSubjectV3,
    gravityMetersPerSecondSquaredXYZ: Vec3,
    private readonly visualRoot: TransformNode,
    private readonly scene: Scene,
    private readonly isSubjectOriginInSwimmableWater: (
      subjectOrigin: Vector3,
    ) => boolean,
  ) {
    this.gravity = new Vector3(...gravityMetersPerSecondSquaredXYZ);
    this.colliderCenterOffsetFromSubjectOrigin = new Vector3(
      ...subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
    );
    const spawnSubjectOrigin = new Vector3(
      ...subject.spawnSubjectOriginPositionMetersXYZ,
    );
    this.physicsController = new PhysicsCharacterController(
      spawnSubjectOrigin.add(this.colliderCenterOffsetFromSubjectOrigin),
      {
        capsuleHeight: subject.collider.heightMeters,
        capsuleRadius: subject.collider.radiusMeters,
      },
      scene,
    );
    this.physicsController.maxSlopeCosine = Math.cos((subject.collider.maxSlopeDegrees * Math.PI) / 180);
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

  step(actions: readonly SemanticInputActionV1[]): void {
    const support = this.physicsController.checkSupport(
      FIXED_TIME_STEP_SECONDS,
      this.gravity,
    );
    const movementMedium = this.movementMediumForSupport(support.supportedState);
    this.currentMovementMedium = movementMedium;
    const horizontal = new Vector3(
      (hasAction(actions, "move-right") ? 1 : 0) - (hasAction(actions, "move-left") ? 1 : 0),
      0,
      (hasAction(actions, "move-backward") ? 1 : 0) - (hasAction(actions, "move-forward") ? 1 : 0),
    );
    if (horizontal.lengthSquared() > 1) horizontal.normalize();
    if (horizontal.lengthSquared() > 0) {
      const yawRadians = Math.atan2(-horizontal.x, -horizontal.z);
      this.visualRoot.rotation.y = yawRadians === -Math.PI ? Math.PI : yawRadians;
    }
    const speed = movementMedium === "water"
      ? this.subject.locomotion.waterSpeedMetersPerSecond
      : horizontal.lengthSquared() > 0 && hasAction(actions, "run")
        ? this.subject.locomotion.runSpeedMetersPerSecond
        : this.subject.locomotion.walkSpeedMetersPerSecond;
    const desired = horizontal.scale(speed);
    const current = this.physicsController.getVelocity();
    const movementSurfaceNormal = support.supportedState === CharacterSupportedState.UNSUPPORTED
      ? this.up
      : support.averageSurfaceNormal;
    const calculated = this.physicsController.calculateMovement(
      FIXED_TIME_STEP_SECONDS,
      new Vector3(0, 0, -1),
      movementSurfaceNormal,
      current,
      support.averageSurfaceVelocity,
      desired,
      this.up,
    );
    const isPhysicallySupported =
      support.supportedState !== CharacterSupportedState.UNSUPPORTED ||
      this.initialGroundSupportPending;
    const jumpActionActive = hasAction(actions, "jump");
    const jumpRequested =
      jumpActionActive &&
      !this.jumpActionWasActive &&
      movementMedium === "ground" &&
      !this.jumpInProgress;
    this.jumpActionWasActive = jumpActionActive;
    if (jumpRequested) {
      this.jumpInProgress = true;
      calculated.y = this.subject.locomotion.jumpSpeedMetersPerSecond;
    } else if (!isPhysicallySupported || (this.jumpInProgress && current.y > 0)) {
      calculated.y = current.y;
      calculated.addInPlace(
        (movementMedium === "water" ? this.gravity.scale(0.15) : this.gravity).scale(
          FIXED_TIME_STEP_SECONDS,
        ),
      );
    } else {
      calculated.y = support.averageSurfaceVelocity.y;
      this.jumpInProgress = false;
    }
    this.physicsController.setVelocity(calculated);
    this.physicsController.integrate(
      FIXED_TIME_STEP_SECONDS,
      support,
      movementMedium === "water" ? this.gravity.scale(0.15) : this.gravity,
    );
    this.initialGroundSupportPending = false;
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

  sampleMotion(runRequested: boolean): SubjectMotionSampleV1 {
    const velocity = this.physicsController.getVelocity();
    return {
      horizontalSpeedMetersPerSecond: Math.hypot(velocity.x, velocity.z),
      runRequested,
      movementMedium: this.currentMovementMedium,
    };
  }

  get movementMedium(): "ground" | "air" | "water" {
    return this.currentMovementMedium;
  }

  get controllerCenter(): Vector3 {
    return this.physicsController.getPosition();
  }

  get subjectOrigin(): Vector3 {
    return this.visualRoot.position.clone();
  }

  get velocity(): Vector3 {
    return this.physicsController.getVelocity();
  }

  get facingYawRadians(): number {
    return this.visualRoot.rotation.y;
  }

  reset(): void {
    const spawnSubjectOrigin = new Vector3(
      ...this.subject.spawnSubjectOriginPositionMetersXYZ,
    );
    this.physicsController.setPosition(
      spawnSubjectOrigin.add(this.colliderCenterOffsetFromSubjectOrigin),
    );
    this.physicsController.setVelocity(Vector3.Zero());
    this.jumpInProgress = false;
    this.jumpActionWasActive = false;
    this.visualRoot.rotation.y = 0;
    this.syncVisual(spawnSubjectOrigin);
    this.initialGroundSupportPending = this.hasWalkablePhysicalGroundAt(
      spawnSubjectOrigin,
    );
    this.currentMovementMedium = this.movementMediumForSupport(
      CharacterSupportedState.UNSUPPORTED,
    );
  }

  stop(): void {
    this.physicsController.setVelocity(Vector3.Zero());
  }

  dispose(): void {
    this.physicsController.dispose();
  }

  private syncVisual(subjectOriginOverride?: Vector3): void {
    if (subjectOriginOverride !== undefined) {
      this.visualRoot.position.copyFrom(subjectOriginOverride);
      return;
    }
    const center = this.physicsController.getPosition();
    this.visualRoot.position.set(
      center.x - this.colliderCenterOffsetFromSubjectOrigin.x,
      center.y - this.colliderCenterOffsetFromSubjectOrigin.y,
      center.z - this.colliderCenterOffsetFromSubjectOrigin.z,
    );
  }

  private movementMediumForSupport(
    supportedState: CharacterSupportedState,
  ): "ground" | "air" | "water" {
    if (this.isSubjectOriginInSwimmableWater(this.subjectOrigin)) return "water";
    if (this.jumpInProgress && this.physicsController.getVelocity().y > 0) return "air";
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
}
