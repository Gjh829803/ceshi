import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import { EntityComponentV1 } from "@whitebox-world/runtime-framework";

import type {
  ControlInputAxesV2,
  PublishedMovementMediumV1,
  SemanticInputActionV1,
  RuntimeVec3V1,
  ViewControlFrameV1,
} from "@whitebox-world/runtime-contracts";
import type { BabylonRuntimeSubjectV1 } from "./runtime-subject";
import {
  createCharacterMovementRuntimeV1,
  hashCharacterMovementStateV1,
  type CharacterMovementCommandV1,
  type CharacterMovementSnapshotV1,
} from "@whitebox-world/character-movement";
import type {
  GameplayActionStateV1,
  LocomotionCapabilityStateV2,
} from "@whitebox-world/gameplay-contracts";
import type { ActionPresentationRegistryV1 } from "@whitebox-world/subject-actions";

import {
  compileMotionCommandV1,
  type SpecializedMotionCommandV1,
} from "./control-profile-runtime";
import {
  MotionKernelRuntimeV1,
  type MotionKernelSnapshotV1,
} from "./motion-kernel-runtime";
import {
  BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1,
  createBabylonCharacterBodyPortV1,
  type BabylonCharacterBodyCommittedSupportEvidenceV1,
  type BabylonCharacterBodyNativeContactV1,
  type BabylonCharacterBodyRuntimePortV1,
} from "./babylon-character-body-port";
import {
  GoldenHumanoid3CVNextTransactionV1,
  type GoldenHumanoidCameraContextAuthorityV1,
  type GoldenHumanoidProjectionPortV1,
  type GoldenHumanoidTickResultV1,
} from "./golden-humanoid-3c-vnext";
import { FIXED_TIME_STEP_SECONDS } from "./physics";
import {
  CommittedRenderPoseBufferV1,
  type CommittedRenderPoseV1,
} from "./committed-render-pose";
import type {
  CharacterSupportProjectionLockV1,
  CharacterSupportProjectionSampleV1,
} from "./retained-support-surface-resolver";

/**
 * Input interpretation and movement execution are owned by
 * separate runtimes; this class only commits them on the same fixed-tick boundary.
 */
type PhysicsCharacterControllerBodyHostV1 = Readonly<{
  _body?: PhysicsBody;
}>;

function physicsBodyForCharacterController(
  controller: unknown,
): PhysicsBody {
  const body = (controller as unknown as PhysicsCharacterControllerBodyHostV1)._body;
  if (body === undefined) throw new Error("WORLDKIT_CHARACTER_PHYSICS_BODY_UNAVAILABLE");
  return body;
}

/**
 * Controller for explicit non-planar movement strategies such as throttle/steer
 * and flight attitude. A planar-vector Subject must never be routed here.
 */
export class SpecializedMotionSubjectControllerV1 extends EntityComponentV1 {
  private readonly motionKernel: MotionKernelRuntimeV1;
  readonly physicsController: MotionKernelRuntimeV1["physicsController"];

  constructor(
    private readonly subject: BabylonRuntimeSubjectV1,
    gravityMetersPerSecondSquaredXYZ: RuntimeVec3V1,
    readonly visualRoot: TransformNode,
    scene: Scene,
    waterSurfaceHeightAtSubjectOrigin: (
      subjectOrigin: Vector3,
    ) => number | undefined,
  ) {
    super("character-movement");
    if (subject.capabilityAssembly.controlProfile.commandKind === "planar-vector") {
      throw new Error(
        "3C_PLANAR_MOVEMENT_OWNER_DUPLICATE: camera-relative planar-vector Subjects are owned by CharacterMovementRuntime.",
      );
    }
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
    if (command.kind === "planar-vector") {
      throw new Error(
        "3C_PLANAR_MOVEMENT_OWNER_DUPLICATE: planar-vector Commands are owned by CharacterMovementRuntime.",
      );
    }
    this.motionKernel.step(command);
  }

  publishSupport(): void {
    this.motionKernel.publishSupport();
  }

  stepCommand(command: SpecializedMotionCommandV1): void {
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

  renderVisual(_interpolationAlphaRatio: number): void {
    // Specialized motion writes its visual during synchronizeVisual. The
    // CharacterMovement path owns two-Snapshot render interpolation.
  }

  motionSnapshot(): MotionKernelSnapshotV1 {
    return this.motionKernel.snapshot();
  }

  retainedCharacterSupportSample(): CharacterSupportProjectionSampleV1 | undefined {
    return this.motionKernel.retainedCharacterSupportSample();
  }

  clearRetainedCharacterSupportSample(): void {
    this.motionKernel.clearRetainedCharacterSupportSample();
  }

  /** @internal Formal evidence projected from the same committed support sample. */
  readCommittedSupportEvidence(
    tick: number,
  ): BabylonCharacterBodyCommittedSupportEvidenceV1 | undefined {
    const sample = this.motionKernel.retainedCharacterSupportSample();
    if (sample === undefined) return undefined;
    const contacts = sample.supportContacts.flatMap(
      (contact): readonly BabylonCharacterBodyNativeContactV1[] =>
        contact.distanceMeters === undefined || contact.motionType !== "static"
          ? []
          : [Object.freeze({
              ...contact,
              distanceMeters: contact.distanceMeters,
              motionType: contact.motionType,
            })],
    );
    const pointMetersXYZ = contacts.length === 0
      ? sample.sampledFootPositionMetersXYZ
      : Object.freeze([0, 1, 2].map((axis) =>
          contacts.reduce(
            (sum, contact) => sum + contact.pointMetersXYZ[axis]!,
            0,
          ) / contacts.length
        )) as RuntimeVec3V1;
    return Object.freeze({
      schemaVersion: 1,
      tick,
      sampledControllerCenterMetersXYZ:
        sample.sampledControllerCenterMetersXYZ,
      sampledFootPointMetersXYZ: sample.sampledFootPositionMetersXYZ,
      support: sample.supportState === "unsupported"
        ? Object.freeze({ mode: "unsupported" })
        : Object.freeze({
            mode: sample.supportState,
            pointMetersXYZ,
            normalXYZ: sample.supportNormalWorldXYZ,
            isDynamic: sample.isSupportSurfaceDynamic,
          }),
      contacts: Object.freeze(contacts),
    });
  }

  probeGroundPlacementAt(
    desiredSubjectOriginMetersXYZ: RuntimeVec3V1,
    filterMembershipMask: number,
    filterCollideMask: number,
  ): RuntimeVec3V1 | undefined {
    const placement = this.motionKernel.probeGroundPlacementAt(
      new Vector3(...desiredSubjectOriginMetersXYZ),
      filterMembershipMask,
      filterCollideMask,
    );
    return placement === undefined
      ? undefined
      : [placement.x, placement.y, placement.z];
  }

  liveLockState(): CharacterSupportProjectionLockV1 {
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

  resetAt(
    subjectOriginMetersXYZ: RuntimeVec3V1,
    facingYawRadians: number,
    _committedTick?: number,
  ): void {
    this.motionKernel.resetAt(
      new Vector3(...subjectOriginMetersXYZ),
      facingYawRadians,
    );
  }

  projectSuspendedAt(
    subjectOriginMetersXYZ: RuntimeVec3V1,
    facingYawRadians: number,
  ): void {
    this.motionKernel.projectSuspendedAt(
      new Vector3(...subjectOriginMetersXYZ),
      facingYawRadians,
    );
  }

  collisionFilterMasks(): Readonly<{
    membershipMask: number;
    collideMask: number;
  }> {
    return Object.freeze({
      membershipMask: this.physicsController.shape.filterMembershipMask,
      collideMask: this.physicsController.shape.filterCollideMask,
    });
  }

  setCollisionFilterMasks(membershipMask: number, collideMask: number): void {
    this.physicsController.shape.filterMembershipMask = membershipMask;
    this.physicsController.shape.filterCollideMask = collideMask;
  }

  stop(): void {
    this.motionKernel.stop();
  }

  protected override onDispose(): void {
    this.motionKernel.dispose();
  }
}

export interface GoldenHumanoidSubjectControllerOptionsV1 {
  readonly subject: BabylonRuntimeSubjectV1;
  readonly visualRoot: TransformNode;
  readonly transaction: GoldenHumanoid3CVNextTransactionV1;
  readonly physicsBody?: PhysicsBody;
  readonly bodyPort?: BabylonCharacterBodyRuntimePortV1;
}

export interface GoldenHumanoidRenderPoseDiagnosticV1 {
  readonly schemaVersion: 1;
  readonly committedTick: number;
  readonly bodyOriginYMeters: number;
  readonly committedSubjectOriginYMeters: number;
  readonly previousFixedSubjectOriginYMeters: number;
  readonly currentFixedSubjectOriginYMeters: number;
  readonly renderInterpolatedSubjectOriginYMeters: number;
  readonly visualRootYMeters: number;
  readonly supportMode: "supported" | "sliding" | "unsupported";
  readonly supportNormalXYZ?: RuntimeVec3V1;
  readonly supportDistanceMeters?: number;
  readonly correction: Readonly<{
    kind: "none" | "snap-down" | "step-up" | "collision-limited";
    appliedMinusProposedYMeters: number;
  }>;
}

export function supportsCharacterMovementSubjectV1(
  subject: BabylonRuntimeSubjectV1,
): boolean {
  const control = subject.capabilityAssembly.controlProfile;
  return !(
    control.commandKind !== "planar-vector" ||
    control.inputSpace !== "camera-relative" ||
    (control.facingPolicy !== "align-to-move" &&
      control.facingPolicy !== "align-to-view") ||
    (control.lateralMovementPolicy !== "allowed" &&
      control.lateralMovementPolicy !== "forbidden")
  );
}

function assertCharacterMovementSubjectAdmissionV1(
  subject: BabylonRuntimeSubjectV1,
): void {
  if (!supportsCharacterMovementSubjectV1(subject)) {
    throw new Error(
      "3C_CHARACTER_MOVEMENT_CONTROL_PROFILE_UNSUPPORTED: CharacterMovement requires camera-relative planar-vector Control with align-to-move or align-to-view facing.",
    );
  }
}

const controllerBodyPortsForTesting = new WeakMap<
  CharacterMovementSubjectControllerV1,
  BabylonCharacterBodyRuntimePortV1
>();

/**
 * Live planar Subject facade. It deliberately has no MotionKernel member: the
 * injected transaction owns the one CharacterMovementRuntime and the
 * one Babylon BodyPort/native controller for this Subject.
 */
export class CharacterMovementSubjectControllerV1 extends EntityComponentV1 {
  readonly #subject: BabylonRuntimeSubjectV1;
  readonly #visualRoot: TransformNode;
  readonly #transaction: GoldenHumanoid3CVNextTransactionV1;
  readonly #physicsBody: PhysicsBody | undefined;
  readonly #bodyPort: BabylonCharacterBodyRuntimePortV1 | undefined;
  #latestTickResult: GoldenHumanoidTickResultV1 | undefined;
  readonly #renderPoseBuffer: CommittedRenderPoseBufferV1;
  #jumpWasHeld = false;
  #disposed = false;

  constructor(options: GoldenHumanoidSubjectControllerOptionsV1) {
    super("character-movement");
    if (options.subject.entityId.length === 0) {
      throw new Error("3C_INPUT_INVALID: Golden Subject entity id is empty.");
    }
    assertCharacterMovementSubjectAdmissionV1(options.subject);
    this.#subject = options.subject;
    this.#visualRoot = options.visualRoot;
    this.#transaction = options.transaction;
    this.#physicsBody = options.physicsBody;
    this.#bodyPort = options.bodyPort;
    if (options.bodyPort !== undefined) {
      controllerBodyPortsForTesting.set(this, options.bodyPort);
    }
    this.#renderPoseBuffer = new CommittedRenderPoseBufferV1(
      this.#committedRenderPose(),
    );
    this.#applyRenderPose(this.#renderPoseBuffer.sample(1));
  }

  step(
    actions: readonly SemanticInputActionV1[],
    viewControlFrame: ViewControlFrameV1 = {
      forwardXYZ: [0, 0, -1],
      rightXYZ: [1, 0, 0],
      committedTick: this.movementSnapshot().tick,
    },
    axes: Readonly<ControlInputAxesV2> = {},
    activeActionState?: GameplayActionStateV1,
    cameraContextAuthority?: GoldenHumanoidCameraContextAuthorityV1,
  ): GoldenHumanoidTickResultV1 {
    this.#assertLive();
    const before = this.movementSnapshot();
    if (viewControlFrame.committedTick !== before.tick) {
      throw new Error(
        "3C_VIEW_TICK_MISMATCH: ViewControlFrame must match the committed Movement Tick.",
      );
    }
    const interpreted = compileMotionCommandV1(
      this.#subject.capabilityAssembly.controlProfile,
      this.#subject.controlFeel.moveResponseExponent,
      actions,
      viewControlFrame,
      axes,
    );
    if (interpreted.kind !== "planar-vector" && interpreted.kind !== "none") {
      throw new Error(
        "3C_INPUT_INVALID: CharacterMovement accepts only planar-vector Control.",
      );
    }
    const jumpHeld = interpreted.kind === "planar-vector" &&
      interpreted.jumpRequested;
    const direction = interpreted.kind === "planar-vector"
      ? interpreted.directionMetersXZ
      : [0, 0] as const;
    const hasMovementIntent = Math.hypot(direction[0], direction[1]) > 0;
    const runRequested = interpreted.kind === "planar-vector" &&
      interpreted.runRequested;
    if (runRequested && !this.#subject.locomotion.allowRun) {
      throw new Error(
        "3C_CAPABILITY_NOT_DECLARED: run Control requires allowRun.",
      );
    }
    if (hasMovementIntent && !runRequested && !this.#subject.locomotion.allowWalk) {
      throw new Error(
        "3C_CAPABILITY_NOT_DECLARED: walk Control requires allowWalk.",
      );
    }
    if (jumpHeld && !this.#subject.locomotion.allowJump) {
      throw new Error(
        "3C_CAPABILITY_NOT_DECLARED: jump Control requires allowJump.",
      );
    }
    const movementX = direction[0] === 0 ? 0 : direction[0];
    const movementZ = direction[1] === 0 ? 0 : -direction[1];
    const facingDirection = interpreted.kind === "planar-vector" &&
        interpreted.aimRequested
      ? interpreted.facingDirectionMetersXZ
      : direction;
    const facingX = facingDirection[0] === 0 ? 0 : facingDirection[0];
    const facingZ = facingDirection[1] === 0 ? 0 : -facingDirection[1];
    const command: CharacterMovementCommandV1 = {
      schemaVersion: 1,
      tick: before.tick + 1,
      fixedDeltaSeconds: FIXED_TIME_STEP_SECONDS,
      // compileMotionCommand returns a world-space planar direction. At zero
      // view yaw CharacterMovement maps [x, inputZ] to [x, -z].
      movementInputXZ: [movementX, movementZ],
      facingInputXZ: [facingX, facingZ],
      runRequested,
      jumpPressed: jumpHeld && !this.#jumpWasHeld,
      jumpHeld,
      viewYawRadians: 0,
      layeredMoves: [],
    };
    const result = this.runCommand(
      command,
      activeActionState,
      cameraContextAuthority,
    );
    this.#jumpWasHeld = jumpHeld;
    return result;
  }

  runCommand(
    command: CharacterMovementCommandV1,
    activeActionState?: GameplayActionStateV1,
    cameraContextAuthority?: GoldenHumanoidCameraContextAuthorityV1,
  ): GoldenHumanoidTickResultV1 {
    this.#assertLive();
    const result = this.#transaction.runTick({
      command,
      ...(activeActionState === undefined ? {} : { activeActionState }),
      ...(cameraContextAuthority === undefined
        ? {}
        : { cameraContextAuthority }),
    });
    this.#latestTickResult = result;
    return result;
  }

  movementSnapshot(): CharacterMovementSnapshotV1 {
    this.#assertLive();
    return this.#transaction.snapshot();
  }

  locomotionStateV2(): LocomotionCapabilityStateV2 {
    return this.movementSnapshot().locomotion;
  }

  latestTickResult(): GoldenHumanoidTickResultV1 | undefined {
    this.#assertLive();
    return this.#latestTickResult;
  }

  retainedCharacterSupportSample(): CharacterSupportProjectionSampleV1 | undefined {
    return this.#requireBodyPort().retainedCharacterSupportSample();
  }

  liveLockState(): CharacterSupportProjectionLockV1 {
    const body = this.#requireBodyPort().readSupportProjectionLock();
    const assembly = this.#subject.capabilityAssembly;
    const motion = assembly.defaultMotionProfile;
    return Object.freeze({
      ...body,
      colliderCenterOffsetMetersXYZ: Object.freeze([
        ...this.#subject.collider.centerOffsetFromSubjectOriginMetersXYZ,
      ]) as RuntimeVec3V1,
      controlFeelProfileRef: this.#subject.controlFeel.resourceRef,
      controlFeelProfileHash: this.#subject.controlFeel.contentHash,
      requestedControlFeelProfileRef: this.#subject.controlFeel.resourceRef,
      motionProfileRef: motion.resourceRef,
      motionProfileHash: motion.contentHash,
      requestedMotionProfileRef: motion.resourceRef,
      motionKernelRef: motion.motionKernelRef,
      physicsBodyProfileRef: this.#subject.physicsBodyProfileRef,
      locomotionProfileRef: this.#subject.locomotionProfileRef,
      controlProfileRef: assembly.controlProfile.resourceRef,
      controlProfileHash: assembly.controlProfile.contentHash,
      mediumProfileRef: assembly.mediumProfile.resourceRef,
    });
  }

  synchronizeVisual(): void {
    this.#assertLive();
    this.#renderPoseBuffer.commit(this.#committedRenderPose());
    this.#applyRenderPose(this.#renderPoseBuffer.sample(1));
  }

  renderVisual(interpolationAlphaRatio: number): void {
    this.#assertLive();
    this.#applyRenderPose(this.#renderPoseBuffer.sample(interpolationAlphaRatio));
  }

  renderPoseDiagnostic(
    interpolationAlphaRatio: number,
  ): GoldenHumanoidRenderPoseDiagnosticV1 {
    this.#assertLive();
    const snapshot = this.movementSnapshot();
    const offsetY = this.#subject.collider.centerOffsetFromSubjectOriginMetersXYZ[1];
    const history = this.#renderPoseBuffer.diagnosticSnapshot();
    const interpolated = this.#renderPoseBuffer.sample(interpolationAlphaRatio);
    const body = this.#transaction.latestBodyDiagnostic();
    const bodyCenterY = body?.resolution.positionMetersXYZ[1] ??
      snapshot.positionMetersXYZ[1];
    const subjectOriginY = snapshot.positionMetersXYZ[1] - offsetY;
    const support = body?.resolution.support;
    const proposedY = body?.proposal.translationDeltaMetersXYZ[1] ?? 0;
    const appliedY = body?.resolution.appliedTranslationMetersXYZ[1] ?? proposedY;
    const correctionY = appliedY - proposedY;
    const horizontalProposal = body === undefined
      ? 0
      : Math.hypot(
          body.proposal.translationDeltaMetersXYZ[0],
          body.proposal.translationDeltaMetersXYZ[2],
        );
    const correctionKind = Math.abs(correctionY) <= 1e-9
      ? "none"
      : correctionY < 0 && support?.mode !== "unsupported"
        ? "snap-down"
        : correctionY > 0 && horizontalProposal > 0 &&
            support?.mode !== "unsupported"
          ? "step-up"
          : "collision-limited";
    return Object.freeze({
      schemaVersion: 1,
      committedTick: snapshot.tick,
      bodyOriginYMeters: bodyCenterY - offsetY,
      committedSubjectOriginYMeters: subjectOriginY,
      previousFixedSubjectOriginYMeters: history.previous.positionMetersXYZ[1],
      currentFixedSubjectOriginYMeters: history.current.positionMetersXYZ[1],
      renderInterpolatedSubjectOriginYMeters: interpolated.positionMetersXYZ[1],
      visualRootYMeters: this.#visualRoot.position.y,
      supportMode: support?.mode ??
        (snapshot.locomotion.status === "active"
          ? snapshot.locomotion.supportMode
          : "unsupported"),
      ...(support === undefined || support.mode === "unsupported"
        ? {}
        : {
            supportNormalXYZ: Object.freeze([...support.normalXYZ]) as RuntimeVec3V1,
            supportDistanceMeters: subjectOriginY - support.pointMetersXYZ[1],
          }),
      correction: Object.freeze({
        kind: correctionKind,
        appliedMinusProposedYMeters: correctionY,
      }),
    });
  }

  #committedRenderPose(): CommittedRenderPoseV1 {
    const snapshot = this.movementSnapshot();
    const offset = this.#subject.collider.centerOffsetFromSubjectOriginMetersXYZ;
    return Object.freeze({
      committedTick: snapshot.tick,
      positionMetersXYZ: Object.freeze([
        snapshot.positionMetersXYZ[0] - offset[0],
        snapshot.positionMetersXYZ[1] - offset[1],
        snapshot.positionMetersXYZ[2] - offset[2],
      ]) as RuntimeVec3V1,
      facingYawRadians: snapshot.facingYawRadians,
    });
  }

  #applyRenderPose(pose: CommittedRenderPoseV1): void {
    this.#visualRoot.position.set(
      pose.positionMetersXYZ[0],
      pose.positionMetersXYZ[1],
      pose.positionMetersXYZ[2],
    );
    this.#visualRoot.rotationQuaternion = Quaternion.FromEulerAngles(
      0,
      pose.facingYawRadians,
      0,
    );
  }

  get subjectOrigin(): Vector3 {
    const snapshot = this.movementSnapshot();
    const offset = this.#subject.collider.centerOffsetFromSubjectOriginMetersXYZ;
    return new Vector3(
      snapshot.positionMetersXYZ[0] - offset[0],
      snapshot.positionMetersXYZ[1] - offset[1],
      snapshot.positionMetersXYZ[2] - offset[2],
    );
  }

  get controllerCenter(): Vector3 {
    return new Vector3(...this.movementSnapshot().positionMetersXYZ);
  }

  get physicsBody(): PhysicsBody {
    this.#assertLive();
    if (this.#physicsBody === undefined) {
      throw new Error(
        "WORLDKIT_CHARACTER_PHYSICS_BODY_UNAVAILABLE: Golden test facade has no native Body.",
      );
    }
    return this.#physicsBody;
  }

  get velocity(): Vector3 {
    return new Vector3(
      ...this.movementSnapshot().linearVelocityMetersPerSecondXYZ,
    );
  }

  get facingYawRadians(): number {
    return this.movementSnapshot().facingYawRadians;
  }

  get forward(): Vector3 {
    const yaw = this.facingYawRadians;
    return new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  }

  collisionFilterMasks(): Readonly<{
    membershipMask: number;
    collideMask: number;
  }> {
    return this.#requireBodyPort().collisionFilterMasks();
  }

  setCollisionFilterMasks(membershipMask: number, collideMask: number): void {
    this.#requireBodyPort().setCollisionFilterMasks(
      membershipMask,
      collideMask,
    );
  }

  probeGroundPlacementAt(
    desiredSubjectOriginMetersXYZ: RuntimeVec3V1,
    filterMembershipMask: number,
    filterCollideMask: number,
  ): RuntimeVec3V1 | undefined {
    const offset = this.#subject.collider.centerOffsetFromSubjectOriginMetersXYZ;
    const placement = this.#requireBodyPort().probeGroundPlacementAt(
      [
        desiredSubjectOriginMetersXYZ[0] + offset[0],
        desiredSubjectOriginMetersXYZ[1] + offset[1],
        desiredSubjectOriginMetersXYZ[2] + offset[2],
      ],
      filterMembershipMask,
      filterCollideMask,
    );
    return placement === undefined
      ? undefined
      : [
          placement[0] - offset[0],
          placement[1] - offset[1],
          placement[2] - offset[2],
        ];
  }

  projectSuspendedAt(
    subjectOriginMetersXYZ: RuntimeVec3V1,
    facingYawRadians: number,
    suspendedByRelationshipId: string,
    committedTick = this.movementSnapshot().tick,
  ): void {
    const before = this.movementSnapshot();
    const transitionSequence = before.locomotion.status === "suspended" &&
        before.locomotion.suspendedByRelationshipId === suspendedByRelationshipId
      ? before.locomotion.transitionSequence
      : this.#nextTransitionSequence(before.locomotion.transitionSequence);
    this.#resetAtSnapshot({
      subjectOriginMetersXYZ,
      facingYawRadians,
      committedTick,
      locomotion: {
        schemaVersion: 2,
        status: "suspended",
        suspendedByRelationshipId,
        committedTick,
        transitionSequence,
      },
    });
  }

  resetAt(
    subjectOriginMetersXYZ: RuntimeVec3V1,
    facingYawRadians: number,
    committedTick = this.movementSnapshot().tick,
  ): void {
    const before = this.movementSnapshot();
    this.#resetAtSnapshot({
      subjectOriginMetersXYZ,
      facingYawRadians,
      committedTick,
      locomotion: {
        schemaVersion: 2,
        status: "active",
        mobilityMode: "grounded",
        gait: "idle",
        verticalPhase: "none",
        supportMode: "supported",
        movementMedium: "ground",
        facingYawRadians,
        linearVelocity: { x: 0, y: 0, z: 0 },
        horizontalSpeedMetersPerSecond: 0,
        committedTick,
        phaseEnteredTick: committedTick,
        transitionSequence: this.#nextTransitionSequence(
          before.locomotion.transitionSequence,
        ),
      },
    });
  }

  reset(): void {
    this.#assertLive();
    this.#transaction.reset();
    this.#latestTickResult = undefined;
    this.#jumpWasHeld = false;
    this.#renderPoseBuffer.reset(this.#committedRenderPose());
    this.#applyRenderPose(this.#renderPoseBuffer.sample(1));
  }

  protected override onDispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#latestTickResult = undefined;
    this.#transaction.dispose();
  }

  #assertLive(): void {
    if (this.#disposed) {
      throw new Error("3C_RUNTIME_DISPOSED: Golden Subject is disposed.");
    }
  }

  #resetAtSnapshot(input: Readonly<{
    subjectOriginMetersXYZ: RuntimeVec3V1;
    facingYawRadians: number;
    committedTick: number;
    locomotion: LocomotionCapabilityStateV2;
  }>): void {
    if (!Number.isSafeInteger(input.committedTick) || input.committedTick < 0) {
      throw new Error("3C_INPUT_INVALID: relationship Tick is invalid.");
    }
    const offset = this.#subject.collider.centerOffsetFromSubjectOriginMetersXYZ;
    const state = {
      schemaVersion: 1 as const,
      tick: input.committedTick,
      positionMetersXYZ: [
        input.subjectOriginMetersXYZ[0] + offset[0],
        input.subjectOriginMetersXYZ[1] + offset[1],
        input.subjectOriginMetersXYZ[2] + offset[2],
      ] as const,
      facingYawRadians: input.facingYawRadians,
      linearVelocityMetersPerSecondXYZ: [0, 0, 0] as const,
      locomotion: input.locomotion,
      transitionEvents: [],
      runtimeState: {
        schemaVersion: 1 as const,
        coyoteTicksRemaining: 0,
        jumpBufferTicksRemaining: 0,
        variableJumpHoldTicksRemaining: 0,
        landingTicksRemaining: 0,
        apexCrossedInAirborneEpisode: false,
      },
    };
    const snapshot = Object.freeze({
      ...state,
      stateHash: hashCharacterMovementStateV1(state),
    });
    this.#transaction.reset(snapshot);
    this.#latestTickResult = undefined;
    this.#jumpWasHeld = false;
    this.#renderPoseBuffer.reset(this.#committedRenderPose());
    this.#applyRenderPose(this.#renderPoseBuffer.sample(1));
  }

  #nextTransitionSequence(current: number): number {
    if (current === Number.MAX_SAFE_INTEGER) {
      throw new Error("3C_INPUT_INVALID: transition sequence exhausted.");
    }
    return current + 1;
  }

  #requireBodyPort(): BabylonCharacterBodyRuntimePortV1 {
    this.#assertLive();
    if (this.#bodyPort === undefined) {
      throw new Error(
        "WORLDKIT_CHARACTER_BODY_PORT_UNAVAILABLE: Golden test facade has no runtime Body adapter.",
      );
    }
    return this.#bodyPort;
  }

  /** @internal Formal evidence from the BodyPort's last committed Tick. */
  readCommittedSupportEvidence():
    | BabylonCharacterBodyCommittedSupportEvidenceV1
    | undefined {
    return this.#requireBodyPort().readCommittedSupportEvidence();
  }
}

/** @internal Used only by the adjacent testing-only relative module. */
export function readCharacterMovementBodyPortForTestingInternalV1(
  controller: CharacterMovementSubjectControllerV1,
): BabylonCharacterBodyRuntimePortV1 {
  const bodyPort = controllerBodyPortsForTesting.get(controller);
  if (bodyPort === undefined) {
    throw new Error("WORLDKIT_CHARACTER_BODY_PORT_TEST_SEAM_UNAVAILABLE");
  }
  return bodyPort;
}

export interface CreateCharacterMovementSubjectControllerOptionsV1 {
  readonly subject: BabylonRuntimeSubjectV1;
  readonly gravityMetersPerSecondSquaredXYZ: RuntimeVec3V1;
  readonly visualRoot: TransformNode;
  readonly scene: Scene;
  readonly actionPresentationRegistry: ActionPresentationRegistryV1;
  readonly projectionPorts?: readonly GoldenHumanoidProjectionPortV1[];
}

/** Allocates exactly one MovementRuntime and one Babylon BodyPort. */
export function createCharacterMovementSubjectControllerV1(
  options: CreateCharacterMovementSubjectControllerOptionsV1,
): CharacterMovementSubjectControllerV1 {
  const subject = options.subject;
  assertCharacterMovementSubjectAdmissionV1(subject);
  const centerOffset = subject.collider.centerOffsetFromSubjectOriginMetersXYZ;
  const initialCenter = subject.spawnSubjectOriginPositionMetersXYZ.map(
    (value, axis) => value + centerOffset[axis]!,
  ) as [number, number, number];
  const gravity = options.gravityMetersPerSecondSquaredXYZ;
  if (gravity[0] !== 0 || gravity[2] !== 0 || gravity[1] >= 0) {
    throw new Error(
      "3C_INPUT_INVALID: CharacterMovement V1 requires downward world-Y gravity.",
    );
  }
  const feel = subject.controlFeel;
  const movementRuntime = createCharacterMovementRuntimeV1({
    schemaVersion: 1,
    fixedDeltaSeconds: FIXED_TIME_STEP_SECONDS,
    jumpVariantPolicy: feel.jumpVariantPolicy,
    initialState: {
      schemaVersion: 1,
      tick: 0,
      positionMetersXYZ: initialCenter,
      facingYawRadians: subject.spawnSubjectFacingRadians,
      linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      locomotion: {
        schemaVersion: 2,
        status: "active",
        mobilityMode: "grounded",
        gait: "idle",
        verticalPhase: "none",
        supportMode: "supported",
        movementMedium: "ground",
        facingYawRadians: subject.spawnSubjectFacingRadians,
        linearVelocity: { x: 0, y: 0, z: 0 },
        horizontalSpeedMetersPerSecond: 0,
        committedTick: 0,
        phaseEnteredTick: 0,
        transitionSequence: 0,
      },
      transitionEvents: [],
      runtimeState: {
        schemaVersion: 1,
        // The authored spawn is not support evidence. The first Body sample
        // and resolution arm coyote only when they observe real support.
        coyoteTicksRemaining: 0,
        jumpBufferTicksRemaining: 0,
        variableJumpHoldTicksRemaining: 0,
        landingTicksRemaining: 0,
        apexCrossedInAirborneEpisode: false,
      },
    },
    walkSpeedMetersPerSecond: feel.walkSpeedMetersPerSecond,
    runSpeedMetersPerSecond: feel.runSpeedMetersPerSecond,
    accelerationMetersPerSecondSquared:
      feel.accelerationMetersPerSecondSquared,
    decelerationMetersPerSecondSquared:
      feel.decelerationMetersPerSecondSquared,
    turnRateRadiansPerSecond: feel.turnRateRadiansPerSecond,
    airControlRatio: feel.airControlRatio,
    gravityMetersPerSecondSquared: Math.abs(gravity[1]),
    jumpSpeedMetersPerSecond: feel.jumpSpeedMetersPerSecond,
    coyoteTimeSeconds: feel.coyoteTimeSeconds,
    jumpBufferSeconds: feel.jumpBufferSeconds,
    variableJumpHoldSeconds: feel.variableJumpHoldSeconds,
    jumpHoldGravityRatio: feel.jumpHoldGravityRatio,
    jumpReleaseGravityRatio: feel.jumpReleaseGravityRatio,
    landingDurationTicks: 8,
    apexEnterSpeedMetersPerSecond: 0.05,
    apexExitSpeedMetersPerSecond: 0.15,
  });
  let bodyPort: ReturnType<typeof createBabylonCharacterBodyPortV1> | undefined;
  try {
    bodyPort = createBabylonCharacterBodyPortV1({
      schemaVersion: 1,
      providerVersions: BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1,
      scene: options.scene,
      fixedDeltaSeconds: FIXED_TIME_STEP_SECONDS,
      gravityMetersPerSecondSquaredXYZ: gravity,
      capsule: {
        heightMeters: subject.collider.heightMeters,
        radiusMeters: subject.collider.radiusMeters,
      },
      controller: {
        keepDistanceMeters: 0.05,
        keepContactToleranceMeters: 0.1,
        maxSlopeDegrees: subject.collider.maxSlopeDegrees,
        maxStepHeightMeters: subject.collider.maxStepHeightMeters,
        characterMassKilograms: subject.collider.massKilograms,
      },
      resetState: {
        positionMetersXYZ: initialCenter,
        linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      },
    });
    const transaction = new GoldenHumanoid3CVNextTransactionV1({
      subjectEntityId: subject.entityId,
      fixedDeltaSeconds: FIXED_TIME_STEP_SECONDS,
      movementRuntime,
      bodyPort,
      actionPresentationRegistry: options.actionPresentationRegistry,
      ...(options.projectionPorts === undefined
        ? {}
        : { projectionPorts: options.projectionPorts }),
    });
    return new CharacterMovementSubjectControllerV1({
      subject,
      visualRoot: options.visualRoot,
      transaction,
      physicsBody: bodyPort.physicsBody,
      bodyPort,
    });
  } catch (error) {
    movementRuntime.dispose();
    try {
      bodyPort?.dispose();
    } catch {
      // Preserve construction failure.
    }
    throw error;
  }
}
