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

  constructor(
    private readonly subject: ExecutionSubjectV3,
    gravityMetersPerSecondSquaredXYZ: Vec3,
    private readonly visualRoot: TransformNode,
    scene: Scene,
    private readonly movementMediumAtSubjectOrigin: (
      subjectOrigin: Vector3,
    ) => "ground" | "air" | "water",
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
  }

  step(actions: readonly SemanticInputActionV1[], movementMedium: "ground" | "air" | "water"): void {
    const support = this.physicsController.checkSupport(FIXED_TIME_STEP_SECONDS, this.gravity);
    const horizontal = new Vector3(
      (hasAction(actions, "move-right") ? 1 : 0) - (hasAction(actions, "move-left") ? 1 : 0),
      0,
      (hasAction(actions, "move-backward") ? 1 : 0) - (hasAction(actions, "move-forward") ? 1 : 0),
    );
    if (horizontal.lengthSquared() > 1) horizontal.normalize();
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
    const isUnsupported =
      support.supportedState === CharacterSupportedState.UNSUPPORTED;
    if (isUnsupported) {
      calculated.y = current.y;
    }
    const jumpRequested =
      hasAction(actions, "jump") && movementMedium === "ground";
    if (jumpRequested) {
      this.jumpInProgress = true;
      calculated.y = this.subject.locomotion.jumpSpeedMetersPerSecond;
    } else if (isUnsupported && this.jumpInProgress) {
      calculated.addInPlace(
        (movementMedium === "water" ? this.gravity.scale(0.15) : this.gravity).scale(
          FIXED_TIME_STEP_SECONDS,
        ),
      );
    } else if (movementMedium === "ground") {
      this.jumpInProgress = false;
    }
    this.physicsController.setVelocity(calculated);
    this.physicsController.integrate(
      FIXED_TIME_STEP_SECONDS,
      support,
      movementMedium === "water" ? this.gravity.scale(0.15) : this.gravity,
    );
  }

  synchronizeVisual(): void {
    this.syncVisual();
  }

  sampleMotion(runRequested: boolean): SubjectMotionSampleV1 {
    const velocity = this.physicsController.getVelocity();
    return {
      horizontalSpeedMetersPerSecond: Math.hypot(velocity.x, velocity.z),
      runRequested,
      movementMedium: this.movementMediumAtSubjectOrigin(this.subjectOrigin),
    };
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

  reset(): void {
    const spawnSubjectOrigin = new Vector3(
      ...this.subject.spawnSubjectOriginPositionMetersXYZ,
    );
    this.physicsController.setPosition(
      spawnSubjectOrigin.add(this.colliderCenterOffsetFromSubjectOrigin),
    );
    this.physicsController.setVelocity(Vector3.Zero());
    this.jumpInProgress = false;
    this.syncVisual(spawnSubjectOrigin);
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
}
