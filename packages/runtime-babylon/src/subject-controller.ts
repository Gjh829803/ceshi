import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  CharacterSupportedState,
  PhysicsCharacterController,
} from "@babylonjs/core/Physics/v2/characterController.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  ExecutionPlanV1,
  FixedInputV1,
  SemanticInputActionV1,
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
    private readonly plan: ExecutionPlanV1,
    private readonly visual: Mesh,
    scene: Scene,
  ) {
    this.gravity = new Vector3(...plan.gravityMetersPerSecondSquaredXYZ);
    this.physicsController = new PhysicsCharacterController(
      new Vector3(...plan.subject.spawnPositionMeters),
      {
        capsuleHeight: plan.subject.capsule.heightMeters,
        capsuleRadius: plan.subject.capsule.radiusMeters,
      },
      scene,
    );
    this.physicsController.maxSlopeCosine = Math.cos((42 * Math.PI) / 180);
    this.physicsController.maxStepHeight = 0.3;
    this.physicsController.characterMass = 80;
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
      ? this.plan.subject.movement.waterSpeedMetersPerSecond
      : this.plan.subject.movement.groundSpeedMetersPerSecond;
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
      calculated.y = this.plan.subject.movement.jumpSpeedMetersPerSecond;
    }
    this.physicsController.setVelocity(calculated);
    this.physicsController.integrate(
      FIXED_TIME_STEP_SECONDS,
      support,
      movementMedium === "water" ? this.gravity.scale(0.15) : this.gravity,
    );
    this.syncVisual();
  }

  runFixedInput(input: FixedInputV1, medium: () => "ground" | "air" | "water"): void {
    for (let tick = 0; tick < input.ticks; tick += 1) this.step(input.actions, medium());
  }

  get position(): Vector3 {
    return this.physicsController.getPosition();
  }

  get velocity(): Vector3 {
    return this.physicsController.getVelocity();
  }

  dispose(): void {
    this.physicsController.dispose();
  }

  private syncVisual(): void {
    this.visual.position.copyFrom(this.physicsController.getPosition());
  }
}
