import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";

import type {
  ExecutionMovementMediumV1,
  ExecutionSubjectV3,
  ControlInputAxesV2,
  ControlTuningV1,
  MotionParameterTuningV1,
  SemanticInputActionV1,
  Vec3,
  ViewControlFrameV1,
} from "@whitebox-world/runtime-contracts";

import {
  compileMotionCommandV1,
  withControlTuningV1,
} from "./control-profile-runtime";
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
  contentHash: "sha256:legacy-control-profile",
  commandKind: "planar-vector",
  inputSpace: "camera-relative",
  facingPolicy: "align-to-move",
  lateralMovementPolicy: "allowed",
  inputTuning: {
    moveDeadzoneRatio: 0.1,
    responseExponent: 1.4,
  },
  safetyLimits: {
    moveDeadzoneRatio: { minimum: 0, maximum: 0.95 },
    responseExponent: { minimum: 0.25, maximum: 4 },
  },
  authoringRanges: {
    moveDeadzoneRatio: { minimum: 0, maximum: 0.5, step: 0.01 },
    responseExponent: { minimum: 0.25, maximum: 3, step: 0.05 },
  },
  runtimeParameterNames: ["moveDeadzoneRatio", "responseExponent"],
} as const;

/**
 * Compatibility facade. Input interpretation and movement execution are owned by
 * separate runtimes; this class only commits them on the same fixed-tick boundary.
 */
export class SubjectController {
  private readonly motionKernel: MotionKernelRuntimeV1;
  private controlTuning: ControlTuningV1 = {};
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
    viewControlFrame: ViewControlFrameV1 = {
      forwardXYZ: [0, 0, -1],
      rightXYZ: [1, 0, 0],
      committedTick: 0,
    },
    axes: Readonly<ControlInputAxesV2> = {},
  ): void {
    const command = compileMotionCommandV1(
      withControlTuningV1(
        this.subject.capabilityAssembly?.controlProfile ?? LEGACY_CONTROL_PROFILE,
        this.controlTuning,
      ),
      actions,
      viewControlFrame,
      axes,
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

  canSetMotionTuning(tuning: MotionParameterTuningV1): boolean {
    if (this.subject.capabilityAssembly === undefined) return false;
    return this.motionKernel.canSetParameterTuning(tuning);
  }

  setControlTuning(tuning: ControlTuningV1): boolean {
    const profile = this.subject.capabilityAssembly?.controlProfile;
    if (profile === undefined || !this.canSetControlTuning(tuning)) return false;
    this.controlTuning = { ...tuning };
    return true;
  }

  canSetControlTuning(tuning: ControlTuningV1): boolean {
    const profile = this.subject.capabilityAssembly?.controlProfile;
    if (profile === undefined) return false;
    const entries = Object.entries(tuning);
    return entries.every(([name, value]) => {
      if (
        !profile.runtimeParameterNames.includes(
          name as (typeof profile.runtimeParameterNames)[number],
        ) ||
        typeof value !== "number" ||
        !Number.isFinite(value)
      ) return false;
      const limit = profile.safetyLimits[
        name as keyof typeof profile.safetyLimits
      ];
      return limit !== undefined && value >= limit.minimum && value <= limit.maximum;
    });
  }

  getControlTuning(): ControlTuningV1 {
    return { ...this.controlTuning };
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

  get hasPendingInitialGroundSupport(): boolean {
    return this.motionKernel.hasPendingInitialGroundSupport;
  }

  get facingYawRadians(): number {
    return this.motionKernel.facingYawRadians;
  }

  get forward(): Vector3 {
    return this.motionKernel.forward;
  }

  reset(): void {
    this.controlTuning = {};
    this.motionKernel.reset();
  }

  stop(): void {
    this.motionKernel.stop();
  }

  dispose(): void {
    this.motionKernel.dispose();
  }
}
