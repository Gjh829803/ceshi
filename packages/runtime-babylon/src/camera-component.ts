import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import type {
  CameraContextSampleV2,
  CameraViewPreferenceV1,
} from "@whitebox-world/camera";
import type {
  CameraPreviewStateV1,
  CameraTuningV1,
  CameraViewInputV1,
  ExecutionPlanV5,
  SemanticInputActionV1,
  ViewControlFrameV1,
  ViewTargetSampleV1,
} from "@whitebox-world/runtime-contracts";
import {
  SceneComponentV1,
  type PhysicsWorldQueryPortV1,
} from "@whitebox-world/runtime-framework";

import {
  CameraDirectorV1,
  type CameraDirectorSnapshotV1,
  type CameraDirectorTransactionStateV1,
} from "./camera-director";
import {
  SpringArmComponentV1,
  type SpringArmTransactionStateV1,
} from "./spring-arm-component";

type CameraContextV1 = Parameters<CameraDirectorV1["update"]>[0];

export interface CameraComponentTransactionStateV1 {
  readonly director: CameraDirectorTransactionStateV1;
  readonly activeSpringArm: SpringArmComponentV1 | undefined;
  readonly activeSpringArmState: SpringArmTransactionStateV1 | undefined;
}

/**
 * Scene component that owns the active camera's profile selection, view control
 * and final projection. It is attached to the possessed Entity's Spring Arm at
 * the fixed camera phase; possession itself remains GameplayState authority.
 */
export class CameraComponentV1 extends SceneComponentV1 {
  private readonly director: CameraDirectorV1;
  private activeSpringArm: SpringArmComponentV1 | undefined;

  constructor(
    executionPlan: ExecutionPlanV5,
    camera: FreeCamera,
    scene: Scene,
    physicsWorldQuery: PhysicsWorldQueryPortV1,
  ) {
    super("camera");
    this.director = new CameraDirectorV1(executionPlan, camera, scene, physicsWorldQuery);
  }

  setViewPreference(
    cameraContext: CameraContextV1,
    preference: CameraViewPreferenceV1,
  ): ReturnType<CameraDirectorV1["setViewPreference"]> {
    return this.director.setViewPreference(cameraContext, preference);
  }

  resetViewPreference(): void {
    this.director.resetViewPreference();
  }

  captureTransactionState(): CameraComponentTransactionStateV1 {
    return Object.freeze({
      director: this.director.captureTransactionState(),
      activeSpringArm: this.activeSpringArm,
      activeSpringArmState: this.activeSpringArm?.captureTransactionState(),
    });
  }

  restoreTransactionState(state: CameraComponentTransactionStateV1): void {
    if (this.activeSpringArm !== state.activeSpringArm) {
      this.activeSpringArm?.reset();
      this.activeSpringArm = state.activeSpringArm;
      if (this.activeSpringArm !== undefined) this.attachTo(this.activeSpringArm);
    }
    if (state.activeSpringArmState !== undefined) {
      state.activeSpringArm?.restoreTransactionState(state.activeSpringArmState);
    }
    this.director.restoreTransactionState(state.director);
  }

  setInputActions(actions: readonly SemanticInputActionV1[]): void {
    this.director.setInputActions(actions);
  }

  adjustView(input: CameraViewInputV1): boolean {
    return this.director.adjustView(input);
  }

  resetView(): void {
    this.director.resetView();
  }

  applyPreview(
    tuningByProfileRef: Readonly<Record<string, CameraTuningV1>>,
    cameraContext: CameraContextV1,
  ): boolean {
    return this.director.applyPreview(tuningByProfileRef, cameraContext);
  }

  controlFrame(committedTick: number): ViewControlFrameV1 {
    return this.director.controlFrame(committedTick);
  }

  update(
    cameraContext: CameraContextV1,
    sample: ViewTargetSampleV1,
    deltaSeconds: number,
    committedCameraContext: CameraContextSampleV2,
    springArm: SpringArmComponentV1,
  ): void {
    if (this.activeSpringArm !== springArm) {
      this.activeSpringArm?.reset();
      this.activeSpringArm = springArm;
      this.attachTo(springArm);
    }
    this.director.update(
      cameraContext,
      sample,
      deltaSeconds,
      committedCameraContext,
      springArm,
    );
  }

  snapshot(): CameraDirectorSnapshotV1 {
    return this.director.snapshot();
  }

  previewState(): CameraPreviewStateV1 {
    return this.director.previewState();
  }

  reset(): void {
    this.director.reset();
    this.activeSpringArm?.reset();
  }

  protected override onDispose(): void {
    this.director.reset();
    this.activeSpringArm?.reset();
    this.activeSpringArm = undefined;
    super.onDispose();
  }
}
