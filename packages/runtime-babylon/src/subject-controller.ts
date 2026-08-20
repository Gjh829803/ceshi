import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  ExecutionMovementMediumV1,
  ExecutionSubjectV3,
  MotionParameterTuningV1,
  SemanticInputActionV1,
  Vec3,
} from "@whitebox-world/runtime-contracts";

import { compileMotionCommandV1 } from "./control-profile-runtime";
import {
  MotionKernelRuntimeV1,
  type MotionKernelSnapshotV1,
} from "./motion-kernel-runtime";

export interface SubjectMotionSampleV1 {
  horizontalSpeedMetersPerSecond: number;
  runRequested: boolean;
  movementMedium: "ground" | "air" | "water";
}

const LEGACY_CONTROL_PROFILE = {
  resourceRef: "worldkit://control-profile/legacy-planar.camera-relative@1",
  commandKind: "planar-vector",
  inputSpace: "camera-relative",
  facingPolicy: "align-to-move",
  lateralMovementPolicy: "allowed",
} as const;

/**
 * Compatibility facade. Input interpretation and movement execution are owned by
 * separate runtimes; this class only commits them on the same fixed-tick boundary.
 */
export class SubjectController {
  private readonly motionKernel: MotionKernelRuntimeV1;
  readonly physicsController: MotionKernelRuntimeV1["physicsController"];

  constructor(
    private readonly subject: ExecutionSubjectV3,
    gravityMetersPerSecondSquaredXYZ: Vec3,
    readonly visualRoot: TransformNode,
    scene: Scene,
    waterSurfaceHeightAtSubjectOrigin: (
      subjectOrigin: Vector3,
    ) => number | undefined,
  ) {
    this.motionKernel = new MotionKernelRuntimeV1(
      subject,
      gravityMetersPerSecondSquaredXYZ,
      visualRoot,
      scene,
      waterSurfaceHeightAtSubjectOrigin,
    );
    this.physicsController = this.motionKernel.physicsController;
  }

  step(
    actions: readonly SemanticInputActionV1[],
    cameraForwardXYZ: Vec3 = [0, 0, -1],
  ): void {
    const command = compileMotionCommandV1(
      this.subject.capabilityAssembly?.controlProfile ?? LEGACY_CONTROL_PROFILE,
      actions,
      cameraForwardXYZ,
    );
    this.motionKernel.step(command);
  }

  requestMotionProfile(resourceRef: string): boolean {
    if (this.subject.capabilityAssembly === undefined) return false;
    return this.motionKernel.requestMotionProfile(resourceRef);
  }

  setMotionTuning(tuning: MotionParameterTuningV1): boolean {
    if (this.subject.capabilityAssembly === undefined) return false;
    return this.motionKernel.setParameterTuning(tuning);
  }

  synchronizeVisual(): void {
    this.motionKernel.synchronizeVisual();
  }

  refreshMovementMedium(): void {
    this.motionKernel.refreshMovementMedium();
  }

  sampleMotion(runRequested: boolean): SubjectMotionSampleV1 {
    const velocity = this.motionKernel.velocity;
    return {
      horizontalSpeedMetersPerSecond: Math.hypot(velocity.x, velocity.z),
      runRequested,
      movementMedium: this.motionKernel.movementMedium,
    };
  }

  motionSnapshot(): MotionKernelSnapshotV1 {
    return this.motionKernel.snapshot();
  }

  get subjectOrigin(): Vector3 {
    return this.motionKernel.subjectOrigin;
  }

  get velocity(): Vector3 {
    return this.motionKernel.velocity;
  }

  get controllerCenter(): Vector3 {
    return this.motionKernel.controllerCenter;
  }

  get movementMedium(): ExecutionMovementMediumV1 {
    return this.motionKernel.movementMedium;
  }

  get facingYawRadians(): number {
    return this.motionKernel.facingYawRadians;
  }

  get forward(): Vector3 {
    return this.motionKernel.forward;
  }

  reset(): void {
    this.motionKernel.reset();
  }

  stop(): void {
    this.motionKernel.stop();
  }

  dispose(): void {
    this.motionKernel.dispose();
  }
}
