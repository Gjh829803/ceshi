import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import {
  RuntimeEntityV1,
  SceneComponentV1,
} from "@whitebox-world/runtime-framework";
import type { ExecutionPlanV5, Vec3 } from "@whitebox-world/runtime-contracts";

type ExecutionPlanSubjectV5 = ExecutionPlanV5["subjects"][number];

import {
  CharacterMovementComponentV1,
  GoldenHumanoidSubjectControllerV1,
} from "./character-movement-component";
import { SpringArmComponentV1 } from "./spring-arm-component";

/** Babylon adapter for the root TransformNode supplied by SubjectVisual. */
class BabylonSubjectRootSceneComponentV1 extends SceneComponentV1 {
  constructor(readonly transformNode: TransformNode) {
    super("scene-root");
  }
}

/**
 * Composition root for a playable subject. This is the Entity-side equivalent
 * of UE's Character: movement and camera-anchor behavior are components, not
 * a growing controller inheritance tree.
 */
export class BabylonCharacterEntityV1 {
  readonly entity: RuntimeEntityV1;
  readonly root: BabylonSubjectRootSceneComponentV1;
  readonly movement:
    | CharacterMovementComponentV1
    | GoldenHumanoidSubjectControllerV1;
  readonly springArm: SpringArmComponentV1;

  constructor(options: {
    readonly subject: ExecutionPlanSubjectV5;
    readonly gravityMetersPerSecondSquaredXYZ: Vec3;
    readonly visualRoot: TransformNode;
    readonly scene: Scene;
    readonly waterSurfaceHeightAtSubjectOrigin: (subjectOrigin: import("@babylonjs/core/Maths/math.vector.js").Vector3) => number | undefined;
    readonly movement?:
      | CharacterMovementComponentV1
      | GoldenHumanoidSubjectControllerV1;
  }) {
    this.entity = new RuntimeEntityV1(options.subject.entityId);
    this.root = this.entity.registerComponent(
      new BabylonSubjectRootSceneComponentV1(options.visualRoot),
    );
    this.movement = this.entity.registerComponent(
      options.movement ?? new CharacterMovementComponentV1(
        options.subject,
        options.gravityMetersPerSecondSquaredXYZ,
        options.visualRoot,
        options.scene,
        options.waterSurfaceHeightAtSubjectOrigin,
      ),
    );
    this.springArm = this.entity.registerComponent(new SpringArmComponentV1());
    this.springArm.attachTo(this.root);
  }
}
