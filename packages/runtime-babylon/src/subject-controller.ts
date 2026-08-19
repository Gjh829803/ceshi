import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  CharacterSupportedState,
  PhysicsCharacterController,
} from "@babylonjs/core/Physics/v2/characterController.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  ExecutionSubjectV2,
  SemanticInputActionV1,
  Vec3,
} from "@whitebox-world/runtime-contracts";

import { FIXED_TIME_STEP_SECONDS } from "./physics";

function hasAction(actions: readonly SemanticInputActionV1[], action: SemanticInputActionV1): boolean {
  return actions.includes(action);
}

export class SubjectController {
  readonly physicsController: PhysicsCharacterController;
  private readonly gravity: Vector3;
  private readonly up = Vector3.Up();

  constructor(
    private readonly subject: ExecutionSubjectV2,
    gravityMetersPerSecondSquaredXYZ: Vec3,
    private readonly visualRoot: TransformNode,
    scene: Scene,
  ) {
    this.gravity = new Vector3(...gravityMetersPerSecondSquaredXYZ);
    this.physicsController = new PhysicsCharacterController(
      new Vector3(...subject.spawnPositionMeters),
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
    this.syncVisual();
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
      : this.subject.locomotion.groundSpeedMetersPerSecond;
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
    if (
      hasAction(actions, "jump") &&
      movementMedium === "ground" &&
      support.supportedState === CharacterSupportedState.SUPPORTED
    ) {
      calculated.y = this.subject.locomotion.jumpSpeedMetersPerSecond;
    }
    this.physicsController.setVelocity(calculated);
    this.physicsController.integrate(
      FIXED_TIME_STEP_SECONDS,
      support,
      movementMedium === "water" ? this.gravity.scale(0.15) : this.gravity,
    );
    this.syncVisual();
  }

  get position(): Vector3 {
    return this.physicsController.getPosition();
  }

  get velocity(): Vector3 {
    return this.physicsController.getVelocity();
  }

  reset(): void {
    this.physicsController.setPosition(new Vector3(...this.subject.spawnPositionMeters));
    this.physicsController.setVelocity(Vector3.Zero());
    this.syncVisual();
  }

  stop(): void {
    this.physicsController.setVelocity(Vector3.Zero());
  }

  dispose(): void {
    this.physicsController.dispose();
  }

  private syncVisual(): void {
    this.visualRoot.position.copyFrom(this.physicsController.getPosition());
  }
}
