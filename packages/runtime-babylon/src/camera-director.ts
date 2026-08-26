import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import "@babylonjs/core/Culling/ray.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import {
  selectCameraViewV1,
  type CameraContextProfileV1,
  type CameraContextSampleV1,
  type CameraDiagnosticV1,
  type CameraRigParametersV1,
  type CameraSelectionDecisionV1,
  type CameraViewPreferenceV1,
} from "@whitebox-world/camera";

import type {
  CameraPreviewStateV1,
  CameraTuningV1,
  CameraViewInputV1,
  ExecutionCameraModifierProfileV1,
  ExecutionCameraRigProfileV1,
  ExecutionPlanV5,
  ExecutionSubjectCapabilityAssemblyV1,
  SemanticInputActionV1,
  Vec3,
  ViewControlFrameV1,
  ViewTargetSampleV1,
} from "@whitebox-world/runtime-contracts";
import {
  applyCameraRigParameterOverridesV1,
  validateCameraTuningV1,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

import { CameraViewSolverV1 } from "./camera-view-solver";
import { SpringArmComponentV1 } from "./spring-arm-component";
import type { PhysicsWorldQueryPortV1 } from "@whitebox-world/runtime-framework";

export interface CameraDirectorSnapshotV1 {
  activeCameraProfileRef: string;
  activeCameraRigRef: string;
  activeCameraModifierRefs: readonly string[];
  fallbackActive: boolean;
  viewYawOffsetRadians: number;
  viewPitchOffsetRadians: number;
  viewDistanceOffsetMeters: number;
  selectionDecision?: CameraSelectionDecisionV1;
  selectedTargetSocketId?: string;
  targetSocketPositionMetersXYZ?: Vec3;
  isTargetSocketFallback?: boolean;
  desiredTargetPositionMetersXYZ?: Vec3;
  desiredPositionMetersXYZ?: Vec3;
  actualPositionMetersXYZ?: Vec3;
  finalFovDegrees?: number;
  requestedArmLengthMeters?: number;
  safeArmLengthMeters?: number;
  effectiveArmLengthMeters?: number;
  isCollisionRetracted?: boolean;
  collisionHitEntityId?: string;
  collisionHitPositionXYZ?: Vec3;
  positionLagXYZ?: Vec3;
  rotationLagRadiansXYZ?: Vec3;
  recenterRemainingSeconds?: number;
  fixedStepDeltaSeconds?: number;
  resolvedParameters?: Readonly<CameraRigParametersV1>;
  previewParameterOverrides?: Readonly<Partial<CameraRigParametersV1>>;
  profileTransitionProgressRatio?: number;
  controlForwardXYZ?: Vec3;
  subjectForwardXYZ?: Vec3;
  subjectVelocityMetersPerSecondXYZ?: Vec3;
}

type CameraContextV1 = ExecutionSubjectCapabilityAssemblyV1["cameraContext"];
type CameraParametersV1 = ExecutionCameraRigProfileV1["parameters"];

interface SelectedCameraStateV1 {
  profile: ExecutionCameraRigProfileV1;
  modifiers: readonly ExecutionCameraModifierProfileV1[];
  decision: CameraSelectionDecisionV1;
}

function freezeVec3(value: Vector3 | readonly number[]): Vec3 {
  if (value instanceof Vector3) {
    return Object.freeze([value.x, value.y, value.z]) as Vec3;
  }
  return Object.freeze([value[0], value[1], value[2]]) as Vec3;
}

function copySelectionDecision(
  decision: CameraSelectionDecisionV1,
): CameraSelectionDecisionV1 {
  const preference = decision.cameraViewPreference.mode === "camera-rig-profile"
    ? Object.freeze({ ...decision.cameraViewPreference })
    : Object.freeze({ ...decision.cameraViewPreference });
  return Object.freeze({
    ...decision,
    activeCameraModifierRefs: Object.freeze([...decision.activeCameraModifierRefs]),
    matchedCameraContextRuleIds: Object.freeze([...decision.matchedCameraContextRuleIds]),
    cameraViewPreference: preference,
    diagnostics: Object.freeze(decision.diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic }))),
    explain: Object.freeze({
      ...decision.explain,
      cameraViewPreference: preference,
      cameraContextRules: Object.freeze(decision.explain.cameraContextRules.map((rule) => Object.freeze({
        ...rule,
        unmatchedReasons: Object.freeze([...rule.unmatchedReasons]),
      }))),
      appliedCameraModifierRefs: Object.freeze([...decision.explain.appliedCameraModifierRefs]),
    }),
  });
}

function selectionDecisionWithSocketDiagnostic(
  decision: CameraSelectionDecisionV1,
  cameraContextProfileRef: string,
  cameraRigProfileRef: string,
  isTargetSocketFallback: boolean,
): CameraSelectionDecisionV1 {
  if (!isTargetSocketFallback) return decision;
  const diagnostic: CameraDiagnosticV1 = {
    severity: "error",
    code: "CAMERA_REQUIRED_SOCKET_MISSING",
    message: "The selected first-person Camera Rig could not resolve a preferred target Socket; the target-height fallback is active.",
    cameraContextProfileRef,
    resourceRef: cameraRigProfileRef,
  };
  return {
    ...decision,
    diagnostics: [...decision.diagnostics, diagnostic],
  };
}

function cameraContextProfileFromExecution(
  context: CameraContextV1,
): CameraContextProfileV1 {
  return {
    cameraContextProfileRef: context.resourceRef,
    defaultCameraRigProfileRef: context.defaultCameraRigProfileRef,
    ...(context.firstPersonCameraRigProfileRef === undefined
      ? {}
      : { firstPersonCameraRigProfileRef: context.firstPersonCameraRigProfileRef }),
    rules: context.rules.flatMap((rule) => {
      const movementMediums = rule.when.movementMediums?.filter(
        (movementMedium): movementMedium is "ground" | "air" =>
          movementMedium === "ground" || movementMedium === "air",
      );
      // P1.5 has no water runtime sample. A water-only execution rule must be
      // unavailable rather than becoming an unconditional Camera Domain rule.
      if (
        rule.when.movementMediums !== undefined &&
        movementMediums?.length === 0
      ) return [];
      return {
        id: rule.id,
        priority: rule.priority,
        when: {
        ...(rule.when.relationshipRoles === undefined
          ? {}
          : { relationshipRoles: rule.when.relationshipRoles }),
        ...(rule.when.motionKernelRefs === undefined
          ? {}
          : { motionKernelRefs: rule.when.motionKernelRefs }),
        ...(movementMediums === undefined
          ? {}
          : { movementMediums }),
        ...(rule.when.minimumSpeedMetersPerSecond === undefined
          ? {}
          : { minimumSpeedMetersPerSecond: rule.when.minimumSpeedMetersPerSecond }),
        ...(rule.when.maximumSpeedMetersPerSecond === undefined
          ? {}
          : { maximumSpeedMetersPerSecond: rule.when.maximumSpeedMetersPerSecond }),
        ...(rule.when.requiredSocketIds === undefined
          ? {}
          : { requiredSocketIds: rule.when.requiredSocketIds }),
        ...((rule.when.requiredMotionTags === undefined &&
          rule.when.requiredCameraContextTags === undefined)
          ? {}
          : {
              requiredCameraContextTags: [
                ...(rule.when.requiredMotionTags ?? []),
                ...(rule.when.requiredCameraContextTags ?? []),
              ],
            }),
        },
        ...(rule.cameraRigProfileRef === undefined
          ? {}
          : { cameraRigProfileRef: rule.cameraRigProfileRef }),
        ...(rule.cameraModifierRefs === undefined
          ? {}
          : { cameraModifierRefs: rule.cameraModifierRefs }),
      };
    }),
    cameraRigProfiles: context.cameraRigProfiles.map((profile) => ({
      cameraRigProfileRef: profile.resourceRef,
      algorithmRef: profile.algorithmRef,
      baseMode: profile.baseMode,
      headingSource: profile.headingSource,
      reverseHeadingPolicy: profile.reverseHeadingPolicy,
      recenterMode: profile.recenterMode,
      preferredSocketIds: profile.preferredSocketIds,
      parameters: profile.parameters,
    })),
    cameraModifierProfiles: context.cameraModifierProfiles.map((modifier) => ({
      cameraModifierProfileRef: modifier.resourceRef,
      parameterOverrides: modifier.parameterOverrides,
      ...(modifier.headingSourceOverride === undefined
        ? {}
        : { headingSourceOverride: modifier.headingSourceOverride }),
      ...(modifier.reverseHeadingPolicyOverride === undefined
        ? {}
        : { reverseHeadingPolicyOverride: modifier.reverseHeadingPolicyOverride }),
      ...(modifier.recenterModeOverride === undefined
        ? {}
        : { recenterModeOverride: modifier.recenterModeOverride }),
    })),
  };
}

function cameraContextSampleFromViewTarget(
  sample: ViewTargetSampleV1,
  simulationTick: number,
): CameraContextSampleV1 {
  return {
    simulationTick,
    controlledEntityId: sample.controlledEntityId,
    targetEntityId: sample.entityId,
    movementMedium: sample.movementMedium,
    activeMotionProfileRef: sample.activeMotionKernelRef,
    activeMotionKernelRef: sample.activeMotionKernelRef,
    motionTags: sample.motionTags,
    activeActionRefs: [],
    relationshipContexts: sample.relationshipContexts,
    relationshipRole: sample.relationshipRole,
    velocityMetersPerSecondXYZ: sample.velocityMetersPerSecondXYZ,
    socketPositionsMetersXYZById: sample.socketPositionsMetersXYZById,
    cameraContextTags: [
      ...sample.cameraContextTags,
      ...sample.motionTags,
    ],
  };
}

function exponentialAlpha(ratePerSecond: number, deltaSeconds: number): number {
  return 1 - Math.exp(-Math.max(0, ratePerSecond) * Math.max(0, deltaSeconds));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function wrapRadians(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function rotateAroundY(direction: Vector3, radians: number): Vector3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return new Vector3(
    direction.x * cosine + direction.z * sine,
    direction.y,
    -direction.x * sine + direction.z * cosine,
  );
}

function horizontalDirection(value: Vector3): Vector3 | undefined {
  const horizontal = new Vector3(value.x, 0, value.z);
  return horizontal.lengthSquared() <= 0.000001
    ? undefined
    : horizontal.normalize();
}

function directionYaw(direction: Vector3): number {
  return Math.atan2(direction.x, direction.z);
}

function yawDirection(yawRadians: number): Vector3 {
  return new Vector3(Math.sin(yawRadians), 0, Math.cos(yawRadians));
}

function smoothstep01(value: number): number {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export class CameraDirectorV1 {
  private initialized = false;
  private explicitProfileRef: string | undefined;
  private activeProfileRef: string;
  private activeHeadingSource: ExecutionCameraRigProfileV1["headingSource"] | undefined;
  private activeReverseHeadingPolicy:
    | ExecutionCameraRigProfileV1["reverseHeadingPolicy"]
    | undefined;
  private activeRigRef = "worldkit://camera-rig/orbit-follow@1";
  private activeModifierRefs: readonly string[] = [];
  private fallbackActive = false;
  private smoothedTarget = Vector3.Zero();
  private targetYawOffsetRadians = 0;
  private targetPitchOffsetRadians = 0;
  private targetDistanceOffsetMeters = 0;
  private viewYawOffsetRadians = 0;
  private viewPitchOffsetRadians = 0;
  private viewDistanceOffsetMeters = 0;
  private readonly tuningByProfileRef = new Map<string, CameraTuningV1>();
  private controlInitialized = false;
  private controlTargetYawOffsetRadians = 0;
  private controlViewYawOffsetRadians = 0;
  private controlBaseHeadingYawRadians = Math.PI;
  private controlBaseHeadingIdentity: string | undefined;
  private controlLastStableVelocityForward: Vector3 | undefined;
  private controlSecondsSinceManualViewInput = Number.POSITIVE_INFINITY;
  private controlLastBaseTarget: Vector3 | undefined;
  private baseHeadingYawRadians = Math.PI;
  private baseHeadingIdentity: string | undefined;
  private lastStableVelocityForward: Vector3 | undefined;
  private transitionElapsedSeconds = 0;
  private transitionDurationSeconds = 0;
  private transitionStartPosition = Vector3.Zero();
  private transitionStartTarget = Vector3.Zero();
  private transitionStartFovRadians = Math.PI / 3;
  private activeInputActions = new Set<SemanticInputActionV1>();
  private previousInputActions = new Set<SemanticInputActionV1>();
  private secondsSinceManualViewInput = Number.POSITIVE_INFINITY;
  private shoulderSide = 1;
  private lookBackBlendRatio = 0;
  private previousVelocity = Vector3.Zero();
  private lastBaseTarget: Vector3 | undefined;
  private readonly cameraViewSolver = new CameraViewSolverV1();
  private smoothedFovRadians = Math.PI / 3;
  private activeParameters: CameraParametersV1 | undefined;
  private activeLockedParameters: CameraParametersV1 | undefined;
  private controlForward = new Vector3(0, 0, -1);
  private latestTelemetry: Omit<
    CameraDirectorSnapshotV1,
    | "activeCameraProfileRef"
    | "activeCameraRigRef"
    | "activeCameraModifierRefs"
    | "fallbackActive"
    | "viewYawOffsetRadians"
    | "viewPitchOffsetRadians"
    | "viewDistanceOffsetMeters"
  > = {};

  constructor(
    private readonly executionPlan: ExecutionPlanV5,
    private readonly camera: FreeCamera,
    private readonly scene: Scene,
    private readonly physicsWorldQuery: PhysicsWorldQueryPortV1,
  ) {
    this.activeProfileRef = executionPlan.camera.rigRef;
  }

  requestProfile(profileRef: string): boolean {
    if (profileRef.trim().length === 0) return false;
    this.explicitProfileRef = profileRef;
    return true;
  }

  resetProfileSelection(): void {
    this.explicitProfileRef = undefined;
  }

  setInputActions(actions: readonly SemanticInputActionV1[]): void {
    this.previousInputActions = this.activeInputActions;
    this.activeInputActions = new Set(actions);
    if (
      this.activeInputActions.has("camera-recenter") &&
      !this.previousInputActions.has("camera-recenter")
    ) this.resetView();
    if (
      this.activeInputActions.has("camera-shoulder-swap") &&
      !this.previousInputActions.has("camera-shoulder-swap")
    ) this.shoulderSide *= -1;
  }

  adjustView(input: CameraViewInputV1): boolean {
    const deltas = [
      input.yawDeltaRadians ?? 0,
      input.pitchDeltaRadians ?? 0,
      input.zoomDeltaMeters ?? 0,
    ];
    if (!deltas.every(Number.isFinite)) return false;
    const sensitivityX = this.activeParameters?.lookSensitivityXRatio ?? 1;
    const sensitivityY = this.activeParameters?.lookSensitivityYRatio ?? 1;
    const lockedSensitivityX = this.activeLockedParameters?.lookSensitivityXRatio ?? 1;
    this.targetYawOffsetRadians = wrapRadians(
      this.targetYawOffsetRadians + deltas[0]! * sensitivityX,
    );
    this.controlTargetYawOffsetRadians = wrapRadians(
      this.controlTargetYawOffsetRadians + deltas[0]! * lockedSensitivityX,
    );
    this.targetPitchOffsetRadians = clamp(
      this.targetPitchOffsetRadians + deltas[1]! * sensitivityY,
      -1.4,
      1.4,
    );
    this.targetDistanceOffsetMeters = clamp(
      this.targetDistanceOffsetMeters + deltas[2]!,
      -30,
      30,
    );
    if (Math.abs(deltas[0]!) + Math.abs(deltas[1]!) > 0.000001) {
      this.secondsSinceManualViewInput = 0;
      this.controlSecondsSinceManualViewInput = 0;
    }
    return true;
  }

  resetView(): void {
    this.targetYawOffsetRadians = 0;
    this.targetPitchOffsetRadians = 0;
    this.targetDistanceOffsetMeters = 0;
    this.controlTargetYawOffsetRadians = 0;
    this.baseHeadingIdentity = undefined;
    this.controlBaseHeadingIdentity = undefined;
  }

  applyPreview(
    tuningByProfileRef: Readonly<Record<string, CameraTuningV1>>,
    profiles: readonly ExecutionCameraRigProfileV1[],
  ): boolean {
    if (Array.isArray(tuningByProfileRef)) return false;
    const profilesByRef = new Map(
      profiles.map((profile) => [profile.resourceRef, profile] as const),
    );
    const nextTunings = new Map<string, CameraTuningV1>();
    for (const [profileRef, tuning] of Object.entries(tuningByProfileRef)) {
      if (isNil(tuning) || typeof tuning !== "object" || Array.isArray(tuning)) {
        return false;
      }
      const profile = profilesByRef.get(profileRef);
      if (profile === undefined) return false;
      const result = validateCameraTuningV1(
        {
          algorithmRef: profile.algorithmRef,
          parameters: profile.parameters,
        },
        tuning,
      );
      if (!result.ok) return false;
      nextTunings.set(profileRef, result.tuning);
    }

    this.tuningByProfileRef.clear();
    for (const [profileRef, tuning] of nextTunings) {
      this.tuningByProfileRef.set(profileRef, tuning);
    }
    return true;
  }

  controlFrame(committedTick: number): ViewControlFrameV1 {
    // Temporary view modifiers such as look-back must never reverse movement intent.
    // The control frame follows the committed base view plus the user's persistent
    // orbit offset, and therefore stays engine-neutral and stable while looking back.
    const forward = horizontalDirection(this.controlForward) ?? new Vector3(0, 0, -1);
    const right = Vector3.Cross(forward, Vector3.Up()).normalize();
    return {
      forwardXYZ: [forward.x, forward.y, forward.z],
      rightXYZ: [right.x, right.y, right.z],
      committedTick,
    };
  }

  update(
    cameraContext: CameraContextV1,
    sample: ViewTargetSampleV1,
    deltaSeconds: number,
    simulationTick: number,
    springArm: SpringArmComponentV1,
  ): void {
    const selected = this.selectProfile(cameraContext, sample, simulationTick);
    if (selected === undefined) {
      throw new Error(
        "WORLDKIT_RUNTIME_CAMERA_PROFILE_NOT_FOUND: Camera context has no resolvable default profile.",
      );
    }
    const baseProfile = selected.profile;
    const profile: ExecutionCameraRigProfileV1 = selected.modifiers.reduce(
      (current, modifier) => ({
        ...current,
        ...(modifier.headingSourceOverride === undefined
          ? {}
          : { headingSource: modifier.headingSourceOverride }),
        ...(modifier.reverseHeadingPolicyOverride === undefined
          ? {}
          : { reverseHeadingPolicy: modifier.reverseHeadingPolicyOverride }),
        ...(modifier.recenterModeOverride === undefined
          ? {}
          : { recenterMode: modifier.recenterModeOverride }),
        parameters: applyCameraRigParameterOverridesV1(
          baseProfile.algorithmRef,
          current.parameters,
          modifier.parameterOverrides,
        ),
      }),
      baseProfile,
    );

    const previousProfileRef = this.activeProfileRef;
    const nextModifierRefs = selected.modifiers.map((modifier) => modifier.resourceRef);
    const selectionChanged = this.initialized && (
      previousProfileRef !== profile.resourceRef ||
      nextModifierRefs.join("|") !== this.activeModifierRefs.join("|")
    );
    const followArmBasisChanged = this.initialized && (
      previousProfileRef !== profile.resourceRef ||
      this.activeRigRef !== profile.algorithmRef
    );
    const headingBasisChanged = this.initialized && (
      previousProfileRef !== profile.resourceRef ||
      this.activeHeadingSource !== profile.headingSource ||
      this.activeReverseHeadingPolicy !== profile.reverseHeadingPolicy
    );
    if (followArmBasisChanged) springArm.reset();
    if (selectionChanged) {
      this.transitionElapsedSeconds = 0;
      this.transitionStartPosition.copyFrom(this.camera.position);
      this.transitionStartTarget.copyFrom(this.smoothedTarget);
      this.transitionStartFovRadians = this.camera.fov;
    }
    if (headingBasisChanged) {
      this.baseHeadingIdentity = undefined;
      this.controlBaseHeadingIdentity = undefined;
    }
    this.activeProfileRef = profile.resourceRef;
    this.activeHeadingSource = profile.headingSource;
    this.activeReverseHeadingPolicy = profile.reverseHeadingPolicy;
    this.activeRigRef = profile.algorithmRef;
    this.activeModifierRefs = nextModifierRefs;
    const tuning = this.tuningByProfileRef.get(profile.resourceRef) ?? {};
    const parameters = applyCameraRigParameterOverridesV1(
      profile.algorithmRef,
      profile.parameters,
      tuning,
    );
    this.activeParameters = parameters;
    const lockedParameters = profile.parameters;
    this.activeLockedParameters = lockedParameters;
    if (selectionChanged) this.transitionDurationSeconds = parameters.transitionSeconds;

    const targetPosition = new Vector3(...sample.targetPositionMetersXYZ);
    const selectedTargetSocketId = profile.preferredSocketIds.find(
      (id) => sample.socketPositionsMetersXYZById[id] !== undefined,
    );
    const socketPosition = selectedTargetSocketId === undefined
      ? undefined
      : sample.socketPositionsMetersXYZById[selectedTargetSocketId];
    const baseTarget = socketPosition === undefined
      ? targetPosition.add(new Vector3(0, parameters.targetHeightMeters, 0))
      : new Vector3(...socketPosition);
    const controlBaseTarget = socketPosition === undefined
      ? targetPosition.add(new Vector3(0, lockedParameters.targetHeightMeters, 0))
      : new Vector3(...socketPosition);
    if (
      this.lastBaseTarget !== undefined &&
      Vector3.DistanceSquared(baseTarget, this.lastBaseTarget) >
        parameters.teleportSnapDistanceMeters * parameters.teleportSnapDistanceMeters
    ) {
      this.initialized = false;
      springArm.reset();
      this.transitionDurationSeconds = 0;
    }
    this.lastBaseTarget = baseTarget.clone();
    if (
      this.controlLastBaseTarget !== undefined &&
      Vector3.DistanceSquared(controlBaseTarget, this.controlLastBaseTarget) >
        lockedParameters.teleportSnapDistanceMeters *
          lockedParameters.teleportSnapDistanceMeters
    ) {
      this.controlInitialized = false;
    }
    this.controlLastBaseTarget = controlBaseTarget.clone();
    const velocity = new Vector3(...sample.velocityMetersPerSecondXYZ);
    const speed = velocity.length();
    const baseForward = this.resolveBaseForward(
      profile,
      parameters,
      sample,
      velocity,
      deltaSeconds,
    );
    const controlBaseForward = this.resolveControlBaseForward(
      profile,
      lockedParameters,
      sample,
      velocity,
      deltaSeconds,
    );
    this.secondsSinceManualViewInput += Math.max(0, deltaSeconds);
    this.controlSecondsSinceManualViewInput += Math.max(0, deltaSeconds);
    this.applyAutomaticRecentering(
      profile,
      parameters,
      sample,
      velocity,
      deltaSeconds,
    );
    this.applyControlAutomaticRecentering(
      profile,
      lockedParameters,
      sample,
      velocity,
      deltaSeconds,
    );
    const horizontalPositionAlpha = this.initialized
      ? exponentialAlpha(parameters.horizontalPositionDampingPerSecond, deltaSeconds)
      : 1;
    const verticalPositionAlpha = this.initialized
      ? exponentialAlpha(parameters.verticalPositionDampingPerSecond, deltaSeconds)
      : 1;
    const yawAlpha = this.initialized
      ? exponentialAlpha(parameters.yawDampingPerSecond, deltaSeconds)
      : 1;
    const pitchAlpha = this.initialized
      ? exponentialAlpha(parameters.pitchDampingPerSecond, deltaSeconds)
      : 1;
    const controlYawAlpha = this.controlInitialized
      ? exponentialAlpha(lockedParameters.yawDampingPerSecond, deltaSeconds)
      : 1;
    this.viewYawOffsetRadians += wrapRadians(
      this.targetYawOffsetRadians - this.viewYawOffsetRadians,
    ) * yawAlpha;
    this.viewPitchOffsetRadians += (
      this.targetPitchOffsetRadians - this.viewPitchOffsetRadians
    ) * pitchAlpha;
    this.viewDistanceOffsetMeters += (
      this.targetDistanceOffsetMeters - this.viewDistanceOffsetMeters
    ) * horizontalPositionAlpha;
    this.controlViewYawOffsetRadians += wrapRadians(
      this.controlTargetYawOffsetRadians - this.controlViewYawOffsetRadians,
    ) * controlYawAlpha;

    this.lookBackBlendRatio += (
      (this.activeInputActions.has("camera-look-back") ? 1 : 0) -
        this.lookBackBlendRatio
    ) * yawAlpha;

    this.controlForward.copyFrom(
      rotateAroundY(controlBaseForward, this.controlViewYawOffsetRadians).normalize(),
    );
    const forward = rotateAroundY(
      rotateAroundY(baseForward, this.viewYawOffsetRadians).normalize(),
      Math.PI * this.lookBackBlendRatio,
    ).normalize();
    const chaseAlgorithm =
      profile.algorithmRef.endsWith("/velocity-chase@1") ||
      profile.algorithmRef.endsWith("/flight-horizon@1");
    const lookAheadVelocity = chaseAlgorithm
      ? velocity
      : forward.scale(Math.max(0, Vector3.Dot(velocity, forward)));
    const acceleration = deltaSeconds <= 0
      ? Vector3.Zero()
      : velocity.subtract(this.previousVelocity).scale(1 / deltaSeconds);
    if (acceleration.length() > 30) acceleration.normalize().scaleInPlace(30);
    this.previousVelocity.copyFrom(velocity);
    const rawTarget = baseTarget
      .add(lookAheadVelocity.scale(parameters.lookAheadSeconds))
      .add(
        acceleration.scale(parameters.accelerationLookAheadSecondsSquared),
      );
    let target = this.targetWithDeadZone(rawTarget, parameters);
    const firstPerson = profile.algorithmRef.endsWith("/socket-first-person@1");
    const view = this.cameraViewSolver.solve({
      algorithmRef: profile.algorithmRef,
      baseTarget,
      desiredTarget: target,
      forward,
      velocity,
      parameters,
      viewPitchOffsetRadians: this.viewPitchOffsetRadians,
      viewDistanceOffsetMeters: this.viewDistanceOffsetMeters,
      shoulderSide: this.shoulderSide,
    });
    target = view.desiredTarget;
    let desiredPosition = view.desiredPosition;
    let requestedArmLengthMeters = view.requestedArmLengthMeters;
    let safeArmLengthMeters: number | undefined;
    let effectiveArmLengthMeters: number | undefined;
    let isCollisionRetracted: boolean | undefined;
    let collisionHitEntityId: string | undefined;
    let collisionHitPositionXYZ: Vec3 | undefined;
    if (!firstPerson) {
      const collision = springArm.solve({
        subjectEntityId: sample.entityId,
        desiredTarget: target,
        desiredPosition,
        parameters,
        deltaSeconds,
        physicsWorldQuery: this.physicsWorldQuery,
      });
      desiredPosition = collision.position;
      safeArmLengthMeters = collision.safeArmLengthMeters;
      effectiveArmLengthMeters = collision.effectiveArmLengthMeters;
      isCollisionRetracted = collision.isCollisionRetracted;
      collisionHitEntityId = collision.collisionHitEntityId;
      collisionHitPositionXYZ = collision.collisionHitPositionXYZ;
    }

    let nextPosition = isCollisionRetracted === true
      ? desiredPosition.clone()
      : new Vector3(
          this.camera.position.x +
            (desiredPosition.x - this.camera.position.x) * horizontalPositionAlpha,
          this.camera.position.y +
            (desiredPosition.y - this.camera.position.y) * verticalPositionAlpha,
          this.camera.position.z +
            (desiredPosition.z - this.camera.position.z) * horizontalPositionAlpha,
        );
    if (isCollisionRetracted !== true) {
      const positionLag = nextPosition.subtract(desiredPosition);
      if (
        positionLag.lengthSquared() >
          parameters.maximumPositionLagMeters * parameters.maximumPositionLagMeters
      ) {
        nextPosition = parameters.maximumPositionLagMeters <= 0
          ? desiredPosition.clone()
          : desiredPosition.add(
              positionLag.normalize().scale(parameters.maximumPositionLagMeters),
            );
      }
    }
    const nextTarget = new Vector3(
      this.smoothedTarget.x + (target.x - this.smoothedTarget.x) * yawAlpha,
      this.smoothedTarget.y + (target.y - this.smoothedTarget.y) * pitchAlpha,
      this.smoothedTarget.z + (target.z - this.smoothedTarget.z) * yawAlpha,
    );
    const extraFov = Math.min(
      parameters.maximumSpeedFovDegrees,
      speed * parameters.speedFovDegreesPerMeterPerSecond,
    );
    const targetFov = ((parameters.baseFovDegrees + extraFov) * Math.PI) / 180;
    const fovAlpha = this.initialized
      ? exponentialAlpha(parameters.fovDampingPerSecond, deltaSeconds)
      : 1;
    this.smoothedFovRadians += (targetFov - this.smoothedFovRadians) * fovAlpha;
    const nextFov = this.smoothedFovRadians;
    let profileTransitionProgressRatio = 1;
    if (
      this.transitionDurationSeconds > 0 &&
      this.transitionElapsedSeconds < this.transitionDurationSeconds
    ) {
      const transitionAlpha = smoothstep01(
        this.transitionElapsedSeconds / this.transitionDurationSeconds,
      );
      profileTransitionProgressRatio = transitionAlpha;
      this.camera.position.copyFrom(
        isCollisionRetracted === true
          ? desiredPosition
          : Vector3.Lerp(
              this.transitionStartPosition,
              nextPosition,
              transitionAlpha,
            ),
      );
      this.smoothedTarget.copyFrom(Vector3.Lerp(
        this.transitionStartTarget,
        nextTarget,
        transitionAlpha,
      ));
      this.camera.fov = this.transitionStartFovRadians +
        (nextFov - this.transitionStartFovRadians) * transitionAlpha;
    } else {
      this.camera.position.copyFrom(nextPosition);
      this.smoothedTarget.copyFrom(nextTarget);
      this.camera.fov = nextFov;
    }
    this.transitionElapsedSeconds += Math.max(0, deltaSeconds);
    this.camera.setTarget(this.smoothedTarget);
    this.initialized = true;
    this.controlInitialized = true;
    const isTargetSocketFallback =
      profile.preferredSocketIds.length > 0 && selectedTargetSocketId === undefined;
    this.latestTelemetry = {
      selectionDecision: copySelectionDecision(selectionDecisionWithSocketDiagnostic(
        selected.decision,
        cameraContext.resourceRef,
        profile.resourceRef,
        firstPerson && isTargetSocketFallback,
      )),
      ...(selectedTargetSocketId === undefined
        ? {}
        : { selectedTargetSocketId }),
      ...(socketPosition === undefined
        ? {}
        : { targetSocketPositionMetersXYZ: freezeVec3(socketPosition) }),
      isTargetSocketFallback,
      desiredTargetPositionMetersXYZ: freezeVec3(target),
      desiredPositionMetersXYZ: freezeVec3(desiredPosition),
      actualPositionMetersXYZ: freezeVec3(this.camera.position),
      finalFovDegrees: (this.camera.fov * 180) / Math.PI,
      ...(requestedArmLengthMeters === undefined
        ? {}
        : { requestedArmLengthMeters }),
      ...(safeArmLengthMeters === undefined ? {} : { safeArmLengthMeters }),
      ...(effectiveArmLengthMeters === undefined
        ? {}
        : { effectiveArmLengthMeters }),
      ...(isCollisionRetracted === undefined ? {} : { isCollisionRetracted }),
      ...(collisionHitEntityId === undefined ? {} : { collisionHitEntityId }),
      ...(collisionHitPositionXYZ === undefined ? {} : { collisionHitPositionXYZ }),
      positionLagXYZ: freezeVec3(this.camera.position.subtract(desiredPosition)),
      rotationLagRadiansXYZ: freezeVec3([
        this.targetPitchOffsetRadians - this.viewPitchOffsetRadians,
        wrapRadians(this.targetYawOffsetRadians - this.viewYawOffsetRadians),
        0,
      ]),
      ...(profile.recenterMode === "off"
        ? {}
        : {
            recenterRemainingSeconds: Math.max(
              0,
              parameters.recenterDelaySeconds - this.secondsSinceManualViewInput,
            ),
          }),
      fixedStepDeltaSeconds: deltaSeconds,
      resolvedParameters: Object.freeze({ ...parameters }),
      previewParameterOverrides: Object.freeze({ ...tuning }),
      profileTransitionProgressRatio,
      controlForwardXYZ: freezeVec3(this.controlForward),
      subjectForwardXYZ: freezeVec3(sample.forwardXYZ),
      subjectVelocityMetersPerSecondXYZ: freezeVec3(
        sample.velocityMetersPerSecondXYZ,
      ),
    };
  }

  reset(): void {
    this.initialized = false;
    this.explicitProfileRef = undefined;
    this.activeHeadingSource = undefined;
    this.activeReverseHeadingPolicy = undefined;
    this.tuningByProfileRef.clear();
    this.fallbackActive = false;
    this.smoothedTarget.setAll(0);
    this.targetYawOffsetRadians = 0;
    this.targetPitchOffsetRadians = 0;
    this.targetDistanceOffsetMeters = 0;
    this.viewYawOffsetRadians = 0;
    this.viewPitchOffsetRadians = 0;
    this.viewDistanceOffsetMeters = 0;
    this.controlInitialized = false;
    this.controlTargetYawOffsetRadians = 0;
    this.controlViewYawOffsetRadians = 0;
    this.controlBaseHeadingYawRadians = Math.PI;
    this.controlBaseHeadingIdentity = undefined;
    this.controlLastStableVelocityForward = undefined;
    this.controlSecondsSinceManualViewInput = Number.POSITIVE_INFINITY;
    this.controlLastBaseTarget = undefined;
    this.baseHeadingYawRadians = Math.PI;
    this.baseHeadingIdentity = undefined;
    this.lastStableVelocityForward = undefined;
    this.transitionElapsedSeconds = 0;
    this.transitionDurationSeconds = 0;
    this.activeModifierRefs = [];
    this.activeInputActions.clear();
    this.previousInputActions.clear();
    this.secondsSinceManualViewInput = Number.POSITIVE_INFINITY;
    this.shoulderSide = 1;
    this.lookBackBlendRatio = 0;
    this.previousVelocity.setAll(0);
    this.lastBaseTarget = undefined;
    this.smoothedFovRadians = Math.PI / 3;
    this.activeParameters = undefined;
    this.activeLockedParameters = undefined;
    this.controlForward.set(0, 0, -1);
    this.latestTelemetry = {};
  }

  snapshot(): CameraDirectorSnapshotV1 {
    return {
      activeCameraProfileRef: this.activeProfileRef,
      activeCameraRigRef: this.activeRigRef,
      activeCameraModifierRefs: this.activeModifierRefs,
      fallbackActive: this.fallbackActive,
      viewYawOffsetRadians: this.viewYawOffsetRadians,
      viewPitchOffsetRadians: this.viewPitchOffsetRadians,
      viewDistanceOffsetMeters: this.viewDistanceOffsetMeters,
      ...this.latestTelemetry,
    };
  }

  previewState(): CameraPreviewStateV1 {
    return {
      kind: "worldkit-camera-preview-state",
      schemaVersion: 1,
      activeCameraProfileRef: this.activeProfileRef,
      activeCameraRigRef: this.activeRigRef,
      activeCameraModifierRefs: this.activeModifierRefs,
      tuningByProfileRef: Object.fromEntries(
        [...this.tuningByProfileRef]
          .sort(([leftProfileRef], [rightProfileRef]) =>
            leftProfileRef < rightProfileRef
              ? -1
              : leftProfileRef > rightProfileRef
                ? 1
                : 0
          )
          .map(([profileRef, tuning]) => [profileRef, { ...tuning }]),
      ),
    };
  }

  private resolveBaseForward(
    profile: ExecutionCameraRigProfileV1,
    parameters: CameraParametersV1,
    sample: ViewTargetSampleV1,
    velocity: Vector3,
    deltaSeconds: number,
  ): Vector3 {
    const identity = `${sample.entityId}:${profile.resourceRef}`;
    const targetForward = horizontalDirection(new Vector3(...sample.forwardXYZ)) ??
      new Vector3(0, 0, -1);
    if (this.baseHeadingIdentity !== identity) {
      this.baseHeadingIdentity = identity;
      this.baseHeadingYawRadians = directionYaw(targetForward);
      this.lastStableVelocityForward = targetForward.clone();
    }
    let desired = targetForward;
    if (profile.headingSource === "view") {
      desired = yawDirection(this.baseHeadingYawRadians);
    } else if (profile.headingSource === "target-velocity") {
      const horizontalVelocity = horizontalDirection(velocity);
      const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
      if (
        horizontalVelocity !== undefined &&
        horizontalSpeed >= parameters.minimumHeadingSpeedMetersPerSecond
      ) {
        this.lastStableVelocityForward =
          profile.reverseHeadingPolicy === "preserve-target-forward" &&
            Vector3.Dot(horizontalVelocity, targetForward) < 0
            ? horizontalVelocity.scale(-1)
            : horizontalVelocity.clone();
      }
      desired = this.lastStableVelocityForward ?? targetForward;
    }
    if (profile.headingSource !== "view") {
      const alpha = this.initialized
        ? exponentialAlpha(parameters.velocityHeadingDampingPerSecond, deltaSeconds)
        : 1;
      this.baseHeadingYawRadians += wrapRadians(
        directionYaw(desired) - this.baseHeadingYawRadians,
      ) * alpha;
    }
    return yawDirection(this.baseHeadingYawRadians);
  }

  private resolveControlBaseForward(
    profile: ExecutionCameraRigProfileV1,
    parameters: CameraParametersV1,
    sample: ViewTargetSampleV1,
    velocity: Vector3,
    deltaSeconds: number,
  ): Vector3 {
    const identity = `${sample.entityId}:${profile.resourceRef}`;
    const targetForward = horizontalDirection(new Vector3(...sample.forwardXYZ)) ??
      new Vector3(0, 0, -1);
    if (this.controlBaseHeadingIdentity !== identity) {
      this.controlBaseHeadingIdentity = identity;
      this.controlBaseHeadingYawRadians = directionYaw(targetForward);
      this.controlLastStableVelocityForward = targetForward.clone();
    }
    let desired = targetForward;
    if (profile.headingSource === "view") {
      desired = yawDirection(this.controlBaseHeadingYawRadians);
    } else if (profile.headingSource === "target-velocity") {
      const horizontalVelocity = horizontalDirection(velocity);
      const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
      if (
        horizontalVelocity !== undefined &&
        horizontalSpeed >= parameters.minimumHeadingSpeedMetersPerSecond
      ) {
        this.controlLastStableVelocityForward =
          profile.reverseHeadingPolicy === "preserve-target-forward" &&
            Vector3.Dot(horizontalVelocity, targetForward) < 0
            ? horizontalVelocity.scale(-1)
            : horizontalVelocity.clone();
      }
      desired = this.controlLastStableVelocityForward ?? targetForward;
    }
    if (profile.headingSource !== "view") {
      const alpha = this.controlInitialized
        ? exponentialAlpha(parameters.velocityHeadingDampingPerSecond, deltaSeconds)
        : 1;
      this.controlBaseHeadingYawRadians += wrapRadians(
        directionYaw(desired) - this.controlBaseHeadingYawRadians,
      ) * alpha;
    }
    return yawDirection(this.controlBaseHeadingYawRadians);
  }

  private applyAutomaticRecentering(
    profile: ExecutionCameraRigProfileV1,
    parameters: CameraParametersV1,
    sample: ViewTargetSampleV1,
    velocity: Vector3,
    deltaSeconds: number,
  ): void {
    if (
      profile.recenterMode === "off" ||
      this.secondsSinceManualViewInput < parameters.recenterDelaySeconds ||
      this.activeInputActions.has("camera-look-back")
    ) return;
    const targetForward = horizontalDirection(new Vector3(...sample.forwardXYZ)) ??
      new Vector3(0, 0, -1);
    const horizontalVelocity = horizontalDirection(velocity);
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    if (profile.recenterMode === "forward-motion") {
      if (
        !sample.cameraContextTags.includes("forward-intent") ||
        horizontalVelocity === undefined ||
        horizontalSpeed < parameters.recenterMinimumSpeedMetersPerSecond ||
        Vector3.Dot(horizontalVelocity, targetForward) < 0.65
      ) return;
    }
    const desiredYawOffset = profile.headingSource === "view"
      ? wrapRadians(directionYaw(targetForward) - this.baseHeadingYawRadians)
      : 0;
    const recenterAlpha = parameters.recenterDurationSeconds <= 0
      ? 1
      : exponentialAlpha(4.6 / parameters.recenterDurationSeconds, deltaSeconds);
    this.targetYawOffsetRadians += wrapRadians(
      desiredYawOffset - this.targetYawOffsetRadians,
    ) * recenterAlpha;
    this.targetPitchOffsetRadians +=
      (0 - this.targetPitchOffsetRadians) * recenterAlpha;
  }

  private applyControlAutomaticRecentering(
    profile: ExecutionCameraRigProfileV1,
    parameters: CameraParametersV1,
    sample: ViewTargetSampleV1,
    velocity: Vector3,
    deltaSeconds: number,
  ): void {
    if (
      profile.recenterMode === "off" ||
      this.controlSecondsSinceManualViewInput < parameters.recenterDelaySeconds ||
      this.activeInputActions.has("camera-look-back")
    ) return;
    const targetForward = horizontalDirection(new Vector3(...sample.forwardXYZ)) ??
      new Vector3(0, 0, -1);
    const horizontalVelocity = horizontalDirection(velocity);
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    if (profile.recenterMode === "forward-motion") {
      if (
        !sample.cameraContextTags.includes("forward-intent") ||
        horizontalVelocity === undefined ||
        horizontalSpeed < parameters.recenterMinimumSpeedMetersPerSecond ||
        Vector3.Dot(horizontalVelocity, targetForward) < 0.65
      ) return;
    }
    const desiredYawOffset = profile.headingSource === "view"
      ? wrapRadians(
          directionYaw(targetForward) - this.controlBaseHeadingYawRadians,
        )
      : 0;
    const recenterAlpha = parameters.recenterDurationSeconds <= 0
      ? 1
      : exponentialAlpha(4.6 / parameters.recenterDurationSeconds, deltaSeconds);
    this.controlTargetYawOffsetRadians += wrapRadians(
      desiredYawOffset - this.controlTargetYawOffsetRadians,
    ) * recenterAlpha;
  }

  private targetWithDeadZone(
    rawTarget: Vector3,
    parameters: CameraParametersV1,
  ): Vector3 {
    if (
      !this.initialized ||
      (parameters.horizontalDeadZoneRatio <= 0 &&
        parameters.verticalDeadZoneRatio <= 0)
    ) return rawTarget;
    const forward = this.camera.getForwardRay().direction.normalize();
    const right = Vector3.Cross(forward, Vector3.Up()).normalize();
    const up = Vector3.Cross(right, forward).normalize();
    const delta = rawTarget.subtract(this.smoothedTarget);
    const distance = Math.max(1, Vector3.Distance(this.camera.position, rawTarget));
    const halfHeight = Math.tan(this.camera.fov / 2) * distance;
    const halfWidth = halfHeight * this.scene.getEngine().getAspectRatio(this.camera);
    const horizontal = Vector3.Dot(delta, right);
    const vertical = Vector3.Dot(delta, up);
    const depth = Vector3.Dot(delta, forward);
    const horizontalLimit = halfWidth * parameters.horizontalDeadZoneRatio;
    const verticalLimit = halfHeight * parameters.verticalDeadZoneRatio;
    const horizontalExcess = Math.sign(horizontal) * Math.max(
      0,
      Math.abs(horizontal) - horizontalLimit,
    );
    const verticalExcess = Math.sign(vertical) * Math.max(
      0,
      Math.abs(vertical) - verticalLimit,
    );
    return this.smoothedTarget
      .add(right.scale(horizontalExcess))
      .add(up.scale(verticalExcess))
      .add(forward.scale(depth));
  }

  private selectProfile(
    context: CameraContextV1,
    sample: ViewTargetSampleV1,
    simulationTick: number,
  ): SelectedCameraStateV1 | undefined {
    const selection = selectCameraViewV1({
      cameraContextProfile: cameraContextProfileFromExecution(context),
      cameraContextSample: cameraContextSampleFromViewTarget(
        sample,
        simulationTick,
      ),
      cameraViewPreference: this.explicitProfileRef === undefined
        ? { mode: "auto" }
        : {
            mode: "camera-rig-profile",
            cameraRigProfileRef: this.explicitProfileRef,
          } satisfies CameraViewPreferenceV1,
    });
    if (!selection.ok) {
      throw new Error(
        `WORLDKIT_RUNTIME_CAMERA_SELECTION_FAILED: ${selection.diagnostics
          .map((diagnostic) => diagnostic.code)
          .join(",")}`,
      );
    }
    const byRef = new Map(
      context.cameraRigProfiles.map((profile) => [profile.resourceRef, profile]),
    );
    const modifiersByRef = new Map(
      context.cameraModifierProfiles.map((modifier) => [modifier.resourceRef, modifier]),
    );
    const profile = byRef.get(selection.decision.activeCameraRigProfileRef);
    this.fallbackActive = selection.decision.fallbackActive;
    if (profile === undefined) return undefined;
    const modifiers = selection.decision.activeCameraModifierRefs
      .flatMap((resourceRef) => {
        const modifier = modifiersByRef.get(resourceRef);
        return modifier === undefined ? [] : [modifier];
      });
    return { profile, modifiers, decision: selection.decision };
  }

}
