import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import type {
  CameraGeometryQueryPortV2,
  CameraContextSampleV2,
  CameraViewPreferenceV1,
} from "@whitebox-world/camera";
import type {
  CameraSubjectOcclusionStateV1,
  CameraPreviewStateV1,
  CameraTuningV1,
  CameraViewInputV1,
  SemanticInputActionV1,
  ViewControlFrameV1,
  RuntimeVec3V1,
  ViewTargetSampleV1,
  WorldRuntimeInitialCameraV1,
} from "@whitebox-world/runtime-contracts";
import type { NativeBlockSubjectOcclusionFadeV1 } from "./native-block-subject-occlusion.js";
import { SceneComponentV1 } from "@whitebox-world/runtime-framework";

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

export interface CommittedCameraRenderPoseV1 {
  readonly committedTick: number;
  readonly positionMetersXYZ: RuntimeVec3V1;
  readonly targetPositionMetersXYZ: RuntimeVec3V1;
  readonly fovRadians: number;
}

export interface CommittedCameraRenderPoseHistoryV1 {
  readonly previous: CommittedCameraRenderPoseV1;
  readonly current: CommittedCameraRenderPoseV1;
}

export interface CameraComponentTransactionStateV1 {
  readonly subjectOcclusion?: CameraSubjectOcclusionStateV1;
  readonly director: CameraDirectorTransactionStateV1;
  readonly activeSpringArm: SpringArmComponentV1 | undefined;
  readonly activeSpringArmState: SpringArmTransactionStateV1 | undefined;
  readonly renderPoseHistory: CommittedCameraRenderPoseHistoryV1;
  readonly renderPoseHistoryNeedsReset: boolean;
}

export interface CameraSubjectOcclusionBindingV1 {
  readonly fade: NativeBlockSubjectOcclusionFadeV1;
  readonly colliderBySubjectEntityId: ReadonlyMap<string, Readonly<{
    centerOffsetFromSubjectOriginMetersXYZ: RuntimeVec3V1;
    heightMeters: number;
    radiusMeters: number;
  }>>;
}

function copyRenderPose(
  pose: CommittedCameraRenderPoseV1,
): CommittedCameraRenderPoseV1 {
  if (
    !Number.isSafeInteger(pose.committedTick) ||
    pose.committedTick < 0 ||
    !pose.positionMetersXYZ.every(Number.isFinite) ||
    !pose.targetPositionMetersXYZ.every(Number.isFinite) ||
    !Number.isFinite(pose.fovRadians) ||
    pose.fovRadians <= 0 ||
    pose.fovRadians >= Math.PI
  ) {
    throw new RangeError(
      "Committed Camera render pose must contain finite committed values.",
    );
  }
  return Object.freeze({
    committedTick: pose.committedTick,
    positionMetersXYZ: Object.freeze([
      ...pose.positionMetersXYZ,
    ]) as RuntimeVec3V1,
    targetPositionMetersXYZ: Object.freeze([
      ...pose.targetPositionMetersXYZ,
    ]) as RuntimeVec3V1,
    fovRadians: pose.fovRadians,
  });
}

function interpolateVector(
  previous: RuntimeVec3V1,
  current: RuntimeVec3V1,
  alpha: number,
): RuntimeVec3V1 {
  return Object.freeze(Vector3.Lerp(
    new Vector3(...previous), new Vector3(...current), alpha,
  ).asArray()) as RuntimeVec3V1;
}

class CommittedCameraRenderPoseBufferV1 {
  #previous: CommittedCameraRenderPoseV1;
  #current: CommittedCameraRenderPoseV1;

  constructor(initialPose: CommittedCameraRenderPoseV1) {
    const admitted = copyRenderPose(initialPose);
    this.#previous = admitted;
    this.#current = admitted;
  }

  reset(pose: CommittedCameraRenderPoseV1): void {
    const admitted = copyRenderPose(pose);
    this.#previous = admitted;
    this.#current = admitted;
  }

  commit(pose: CommittedCameraRenderPoseV1): void {
    const admitted = copyRenderPose(pose);
    if (admitted.committedTick < this.#current.committedTick) {
      throw new RangeError("Committed Camera render pose Tick cannot move backwards.");
    }
    if (admitted.committedTick === this.#current.committedTick) {
      this.#current = admitted;
      return;
    }
    this.#previous = this.#current;
    this.#current = admitted;
  }

  restore(history: CommittedCameraRenderPoseHistoryV1): void {
    const previous = copyRenderPose(history.previous);
    const current = copyRenderPose(history.current);
    if (previous.committedTick > current.committedTick) {
      throw new RangeError(
        "Committed Camera render pose history cannot move backwards.",
      );
    }
    this.#previous = previous;
    this.#current = current;
  }

  snapshot(): CommittedCameraRenderPoseHistoryV1 {
    return Object.freeze({
      previous: copyRenderPose(this.#previous),
      current: copyRenderPose(this.#current),
    });
  }

  sample(interpolationAlphaRatio: number): CommittedCameraRenderPoseV1 {
    if (
      !Number.isFinite(interpolationAlphaRatio) ||
      interpolationAlphaRatio < 0 ||
      interpolationAlphaRatio > 1
    ) {
      throw new RangeError(
        "Camera render interpolation alpha must be finite from 0 through 1.",
      );
    }
    if (interpolationAlphaRatio === 0) return this.#previous;
    if (interpolationAlphaRatio === 1) return this.#current;
    return Object.freeze({
      committedTick: this.#current.committedTick,
      positionMetersXYZ: interpolateVector(
        this.#previous.positionMetersXYZ,
        this.#current.positionMetersXYZ,
        interpolationAlphaRatio,
      ),
      targetPositionMetersXYZ: interpolateVector(
        this.#previous.targetPositionMetersXYZ,
        this.#current.targetPositionMetersXYZ,
        interpolationAlphaRatio,
      ),
      fovRadians: this.#previous.fovRadians +
        (this.#current.fovRadians - this.#previous.fovRadians) *
          interpolationAlphaRatio,
    });
  }
}

/**
 * Scene component that owns the active camera's profile selection, view control
 * and final projection. It is attached to the possessed Entity's Spring Arm at
 * the fixed camera phase; possession itself remains GameplayState authority.
 */
export class CameraComponentV1 extends SceneComponentV1 {
  private readonly director: CameraDirectorV1;
  private activeSpringArm: SpringArmComponentV1 | undefined;
  private readonly renderPoseBuffer: CommittedCameraRenderPoseBufferV1;
  private renderPoseHistoryNeedsReset = true;

  constructor(
    initialCamera: WorldRuntimeInitialCameraV1,
    private readonly camera: FreeCamera,
    scene: Scene,
    cameraGeometryQuery: CameraGeometryQueryPortV2,
    private readonly subjectOcclusion?: CameraSubjectOcclusionBindingV1,
  ) {
    super("camera");
    this.director = new CameraDirectorV1(initialCamera, camera, scene, cameraGeometryQuery,
      subjectOcclusion !== undefined);
    this.renderPoseBuffer = new CommittedCameraRenderPoseBufferV1(this.captureRenderPose(0));
  }

  setViewPreference(
    cameraContext: CameraContextV1,
    preference: CameraViewPreferenceV1,
  ): ReturnType<CameraDirectorV1["setViewPreference"]> {
    const result = this.director.setViewPreference(cameraContext, preference);
    if (result.ok) this.renderPoseHistoryNeedsReset = true;
    return result;
  }

  resetViewPreference(): void {
    this.director.resetViewPreference();
    this.renderPoseHistoryNeedsReset = true;
  }

  initializeControlHeading(forwardXYZ: RuntimeVec3V1): void {
    this.director.initializeControlHeading(forwardXYZ);
  }

  captureTransactionState(): CameraComponentTransactionStateV1 {
    return Object.freeze({
      ...(this.subjectOcclusion === undefined ? {} : { subjectOcclusion: this.subjectOcclusion.fade.snapshot() }),
      director: this.director.captureTransactionState(),
      activeSpringArm: this.activeSpringArm,
      activeSpringArmState: this.activeSpringArm?.captureTransactionState(),
      renderPoseHistory: this.renderPoseBuffer.snapshot(),
      renderPoseHistoryNeedsReset: this.renderPoseHistoryNeedsReset,
    });
  }

  restoreTransactionState(state: CameraComponentTransactionStateV1): void {
    if ((this.subjectOcclusion === undefined) !== (state.subjectOcclusion === undefined)) {
      throw new Error("WORLDKIT_CAMERA_OCCLUSION_TRANSACTION_MISMATCH");
    }
    if (this.activeSpringArm !== state.activeSpringArm) {
      this.activeSpringArm?.reset();
      this.activeSpringArm = state.activeSpringArm;
      if (this.activeSpringArm !== undefined) this.attachTo(this.activeSpringArm);
    }
    if (state.activeSpringArmState !== undefined) {
      state.activeSpringArm?.restoreTransactionState(state.activeSpringArmState);
    }
    this.director.restoreTransactionState(state.director);
    this.renderPoseBuffer.restore(state.renderPoseHistory);
    this.renderPoseHistoryNeedsReset = state.renderPoseHistoryNeedsReset;
    if (state.subjectOcclusion !== undefined) this.subjectOcclusion!.fade.restore(state.subjectOcclusion);
  }

  setInputActions(actions: readonly SemanticInputActionV1[]): void {
    this.director.setInputActions(actions);
  }

  adjustView(input: CameraViewInputV1): boolean {
    return this.director.adjustView(input);
  }

  resetView(): void {
    this.director.resetView();
    this.renderPoseHistoryNeedsReset = true;
  }

  applyPreview(
    tuningByProfileRef: Readonly<Record<string, CameraTuningV1>>,
    cameraContext: CameraContextV1,
  ): boolean {
    const applied = this.director.applyPreview(tuningByProfileRef, cameraContext);
    if (applied) this.renderPoseHistoryNeedsReset = true;
    return applied;
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
    const before = this.subjectOcclusion === undefined ? undefined : this.captureTransactionState();
    try {
    if (this.activeSpringArm !== springArm) {
      this.activeSpringArm?.reset();
      this.activeSpringArm = springArm;
      this.attachTo(springArm);
      this.renderPoseHistoryNeedsReset = true;
    }
    const update = this.director.update(
      cameraContext,
      sample,
      deltaSeconds,
      committedCameraContext,
      springArm,
    );
    if (update === "unchanged") return;
    if (this.subjectOcclusion !== undefined) {
      const collider = this.subjectOcclusion.colliderBySubjectEntityId.get(sample.entityId) ??
        this.subjectOcclusion.colliderBySubjectEntityId.get(sample.controlledEntityId);
      if (collider !== undefined) this.subjectOcclusion.fade.update({
        cameraPosition: this.camera.position,
        subjectOriginPositionMetersXYZ: sample.targetPositionMetersXYZ,
        colliderCenterOffsetMetersXYZ: collider.centerOffsetFromSubjectOriginMetersXYZ,
        colliderHeightMeters: collider.heightMeters,
        colliderRadiusMeters: collider.radiusMeters,
        deltaSeconds,
      });
    }
    const pose = this.captureRenderPose(committedCameraContext.committedTick);
    if (this.renderPoseHistoryNeedsReset || update === "reset") {
      this.renderPoseBuffer.reset(pose);
      this.renderPoseHistoryNeedsReset = false;
    } else {
      this.renderPoseBuffer.commit(pose);
    }
    } catch (error) {
      if (before !== undefined) this.restoreTransactionState(before);
      throw error;
    }
  }

  render(interpolationAlphaRatio: number, renderScene: () => void): void {
    if (this.renderPoseHistoryNeedsReset || interpolationAlphaRatio === 1) {
      renderScene();
      return;
    }
    const history = this.renderPoseBuffer.snapshot();
    const sampled = this.renderPoseBuffer.sample(interpolationAlphaRatio);
    try {
      this.applyRenderPose(sampled);
      // Babylon setTarget can adjust the position for an exactly parallel Z
      // view. Validate the actual applied position, not only the sampled tuple.
      if (!this.director.isRenderPoseSafe(
        history.previous.positionMetersXYZ,
        history.current.positionMetersXYZ,
        this.camera.position,
        new Vector3(...sampled.targetPositionMetersXYZ),
      )) this.applyRenderPose(history.current);
      renderScene();
    } finally {
      this.applyRenderPose(history.current);
    }
  }

  snapshot(): CameraDirectorSnapshotV1 {
    return Object.freeze({ ...this.director.snapshot(),
      ...(this.subjectOcclusion === undefined ? {} : { subjectOcclusion: this.subjectOcclusion.fade.snapshot() }),
    });
  }

  withSubjectOcclusionSuspended<T>(capture: () => T): T {
    return this.subjectOcclusion === undefined ? capture() : this.subjectOcclusion.fade.withSuspended(capture);
  }

  previewState(): CameraPreviewStateV1 {
    return this.director.previewState();
  }

  reset(): void {
    this.director.reset();
    this.subjectOcclusion?.fade.reset();
    this.activeSpringArm?.reset();
    this.renderPoseHistoryNeedsReset = true;
  }

  protected override onDispose(): void {
    this.director.reset();
    this.activeSpringArm?.reset();
    this.activeSpringArm = undefined;
    this.renderPoseHistoryNeedsReset = true;
    super.onDispose();
  }

  private captureRenderPose(committedTick: number): CommittedCameraRenderPoseV1 {
    const target = this.director.snapshot().desiredTargetPositionMetersXYZ ?? (() => {
      const forward = this.camera.getForwardRay().direction;
      return Object.freeze(this.camera.position.add(forward).asArray()) as RuntimeVec3V1;
    })();
    return copyRenderPose({
      committedTick,
      positionMetersXYZ: Object.freeze(this.camera.position.asArray()) as RuntimeVec3V1,
      targetPositionMetersXYZ: target,
      fovRadians: this.camera.fov,
    });
  }

  private applyRenderPose(pose: CommittedCameraRenderPoseV1): void {
    this.camera.position.copyFromFloats(...pose.positionMetersXYZ);
    this.camera.fov = pose.fovRadians;
    this.camera.setTarget(new Vector3(...pose.targetPositionMetersXYZ));
    this.camera.getViewMatrix(true);
  }
}
