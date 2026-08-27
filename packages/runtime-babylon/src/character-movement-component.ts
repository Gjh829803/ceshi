import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import { EntityComponentV1 } from "@whitebox-world/runtime-framework";

import type {
  ExecutionSubjectV3,
  ControlInputAxesV2,
  PublishedMovementMediumV1,
  SemanticInputActionV1,
  Vec3,
  ViewControlFrameV1,
} from "@whitebox-world/runtime-contracts";

import {
  compileMotionCommandV1,
  type MotionCommandV1,
} from "./control-profile-runtime";
import {
  MotionKernelRuntimeV1,
  type MotionKernelLiveLockStateV1,
  type MotionKernelSnapshotV1,
  type RetainedCharacterSupportSampleV1,
} from "./motion-kernel-runtime";

export interface SubjectMotionSampleV1 {
  horizontalSpeedMetersPerSecond: number;
  runRequested: boolean;
  movementMedium: PublishedMovementMediumV1;
}

/**
 * Input interpretation and movement execution are owned by
 * separate runtimes; this class only commits them on the same fixed-tick boundary.
 */
type PhysicsCharacterControllerBodyHostV1 = Readonly<{
  _body?: PhysicsBody;
}>;

function physicsBodyForCharacterController(
  controller: MotionKernelRuntimeV1["physicsController"],
): PhysicsBody {
  const body = (controller as unknown as PhysicsCharacterControllerBodyHostV1)._body;
  if (body === undefined) throw new Error("WORLDKIT_CHARACTER_PHYSICS_BODY_UNAVAILABLE");
  return body;
}

/**
 * Entity component boundary around the existing Motion Kernel. The kernel keeps
 * its sole authority for support, gravity and locomotion state; this component
 * contributes lifecycle and fixed-phase integration to the new framework.
 */
export class CharacterMovementComponentV1 extends EntityComponentV1 {
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
    super("character-movement");
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
    viewControlFrame: ViewControlFrameV1 = {
      forwardXYZ: [0, 0, -1],
      rightXYZ: [1, 0, 0],
      committedTick: 0,
    },
    axes: Readonly<ControlInputAxesV2> = {},
  ): void {
    const command = compileMotionCommandV1(
      this.subject.capabilityAssembly.controlProfile,
      this.motionKernel.activeControlFeel.moveResponseExponent,
      actions,
      viewControlFrame,
      axes,
    );
    this.motionKernel.step(command);
  }

  publishSupport(): void {
    this.motionKernel.publishSupport();
  }

  stepCommand(command: MotionCommandV1): void {
    this.motionKernel.step(command);
  }

  requestMotionProfile(resourceRef: string): boolean {
    return this.motionKernel.requestMotionProfile(resourceRef);
  }

  requestControlFeelProfile(resourceRef: string): boolean {
    return this.motionKernel.requestControlFeelProfile(resourceRef);
  }

  get activeControlFeel(): MotionKernelRuntimeV1["activeControlFeel"] {
    return this.motionKernel.activeControlFeel;
  }

  synchronizeVisual(): void {
    this.motionKernel.synchronizeVisual();
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

  retainedCharacterSupportSample(): RetainedCharacterSupportSampleV1 | undefined {
    return this.motionKernel.retainedCharacterSupportSample();
  }

  clearRetainedCharacterSupportSample(): void {
    this.motionKernel.clearRetainedCharacterSupportSample();
  }

  probeGroundPlacementAt(
    desiredSubjectOriginMetersXYZ: Vec3,
    filterMembershipMask: number,
    filterCollideMask: number,
  ): Vec3 | undefined {
    const placement = this.motionKernel.probeGroundPlacementAt(
      new Vector3(...desiredSubjectOriginMetersXYZ),
      filterMembershipMask,
      filterCollideMask,
    );
    return placement === undefined
      ? undefined
      : [placement.x, placement.y, placement.z];
  }

  liveLockState(): MotionKernelLiveLockStateV1 {
    return this.motionKernel.liveLockState();
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

  get movementMedium(): PublishedMovementMediumV1 {
    return this.motionKernel.movementMedium;
  }

  get facingYawRadians(): number {
    return this.motionKernel.facingYawRadians;
  }

  get physicsBody(): PhysicsBody {
    return physicsBodyForCharacterController(this.physicsController);
  }

  get forward(): Vector3 {
    return this.motionKernel.forward;
  }

  reset(): void {
    this.motionKernel.reset();
  }

  resetAt(subjectOriginMetersXYZ: Vec3, facingYawRadians: number): void {
    this.motionKernel.resetAt(
      new Vector3(...subjectOriginMetersXYZ),
      facingYawRadians,
    );
  }

  projectSuspendedAt(
    subjectOriginMetersXYZ: Vec3,
    facingYawRadians: number,
  ): void {
    this.motionKernel.projectSuspendedAt(
      new Vector3(...subjectOriginMetersXYZ),
      facingYawRadians,
    );
  }

  stop(): void {
    this.motionKernel.stop();
  }

  protected override onDispose(): void {
    this.motionKernel.dispose();
  }
}
