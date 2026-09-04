import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import "@babylonjs/core/Culling/ray.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import {
  admitCameraViewPreferenceV1,
  cameraRigParametersViolateInvariantsV1,
  selectCameraViewV2,
  parseCameraContextSampleV2,
  type CameraContextProfileV1,
  type CameraContextSampleV2,
  type CameraDiagnosticV1,
  type CameraRigParametersV1,
  type CameraSelectionDecisionV2,
  type CameraViewPreferenceV1,
} from "@whitebox-world/camera";

import type {
  CameraPreviewStateV1,
  CameraTuningV1,
  CameraViewInputV1,
  RuntimeCameraModifierProfileV1,
  RuntimeCameraRigProfileV1,
  WorldRuntimeInitialCameraV1,
  RuntimeSubjectCapabilityAssemblyV1,
  LocomotionModeV1,
  SemanticInputActionV1,
  RuntimeVec3V1,
  ViewControlFrameV1,
  ViewTargetSampleV1,
} from "@whitebox-world/runtime-contracts";
import {
  applyCameraRigParameterOverridesV1,
  validateCameraTuningV1,
} from "@whitebox-world/runtime-contracts";
import { isEmpty, isNil } from "lodash-es";
import type { PhysicsWorldQueryPortV1 } from "@whitebox-world/runtime-framework";

import { CameraViewSolverV1 } from "./camera-view-solver";
import { SpringArmComponentV1 } from "./spring-arm-component";

export type ThirdPersonOcclusionStrategyV1 =
  | "spring-arm"
  | "subject-occlusion-fade";

export interface CameraDirectorOptionsV1 {
  readonly thirdPersonOcclusionStrategy?: ThirdPersonOcclusionStrategyV1;
}

export interface CameraDirectorSnapshotV1 {
  activeCameraProfileRef: string;
  activeCameraRigRef: string;
  activeCameraModifierRefs: readonly string[];
  fallbackActive: boolean;
  viewYawOffsetRadians: number;
  viewPitchOffsetRadians: number;
  viewDistanceOffsetMeters: number;
  selectionDecision?: CameraSelectionDecisionV2;
  selectedTargetSocketId?: string;
  targetSocketPositionMetersXYZ?: RuntimeVec3V1;
  isTargetSocketFallback?: boolean;
  desiredTargetPositionMetersXYZ?: RuntimeVec3V1;
  actualTargetPositionMetersXYZ?: RuntimeVec3V1;
  desiredPositionMetersXYZ?: RuntimeVec3V1;
  actualPositionMetersXYZ?: RuntimeVec3V1;
  finalFovDegrees?: number;
  requestedArmLengthMeters?: number;
  safeArmLengthMeters?: number;
  effectiveArmLengthMeters?: number;
  isCollisionRetracted?: boolean;
  collisionHitEntityId?: string;
  collisionHitPositionXYZ?: RuntimeVec3V1;
  positionLagXYZ?: RuntimeVec3V1;
  rotationLagRadiansXYZ?: RuntimeVec3V1;
  recenterRemainingSeconds?: number;
  fixedStepDeltaSeconds?: number;
  resolvedParameters?: Readonly<CameraRigParametersV1>;
  previewParameterOverrides?: Readonly<Partial<CameraRigParametersV1>>;
  profileTransitionProgressRatio?: number;
  controlForwardXYZ?: RuntimeVec3V1;
  subjectForwardXYZ?: RuntimeVec3V1;
  subjectVelocityMetersPerSecondXYZ?: RuntimeVec3V1;
}

export interface CameraDirectorTransactionStateV1 {
  readonly values: Readonly<{
    initialized: boolean;
    cameraViewPreference: CameraViewPreferenceV1;
    activeProfileRef: string;
    activeHeadingSource: RuntimeCameraRigProfileV1["headingSource"] | undefined;
    activeReverseHeadingPolicy:
      | RuntimeCameraRigProfileV1["reverseHeadingPolicy"]
      | undefined;
    activeRigRef: string;
    activeModifierRefs: readonly string[];
    fallbackActive: boolean;
    targetYawOffsetRadians: number;
    targetPitchOffsetRadians: number;
    targetDistanceOffsetMeters: number;
    viewYawOffsetRadians: number;
    viewPitchOffsetRadians: number;
    viewDistanceOffsetMeters: number;
    controlInitialized: boolean;
    controlHeadingLockedUntilProfileBind: boolean;
    controlTargetYawOffsetRadians: number;
    controlViewYawOffsetRadians: number;
    controlBaseHeadingYawRadians: number;
    controlBaseHeadingIdentity: string | undefined;
    controlSecondsSinceManualViewInput: number;
    baseHeadingYawRadians: number;
    baseHeadingIdentity: string | undefined;
    transitionElapsedSeconds: number;
    transitionDurationSeconds: number;
    transitionStartFovRadians: number;
    secondsSinceManualViewInput: number;
    shoulderSide: number;
    lookBackBlendRatio: number;
    smoothedFovRadians: number;
    activeParameters: CameraParametersV1 | undefined;
    activeLockedParameters: CameraParametersV1 | undefined;
    latestTelemetry: CameraDirectorV1["latestTelemetry"];
    latestCommittedTick: number | undefined;
    latestCommittedContextIdentity: string | undefined;
    activeTargetEntityId: string | undefined;
    latestUpdateFailed: boolean;
    authoredOpeningProfileRef: string | undefined;
  }>;
  readonly vectors: Readonly<{
    smoothedTarget: Vector3;
    controlLastStableVelocityForward: Vector3 | undefined;
    controlLastBaseTarget: Vector3 | undefined;
    lastStableVelocityForward: Vector3 | undefined;
    transitionStartPosition: Vector3;
    transitionStartTarget: Vector3;
    previousVelocity: Vector3;
    lastBaseTarget: Vector3 | undefined;
    controlForward: Vector3;
    cameraPosition: Vector3;
    cameraRotation: Vector3;
    cameraRotationQuaternion:
      | { readonly status: "undefined" }
      | { readonly status: "null" }
      | {
          readonly status: "value";
          readonly xyzw: readonly [number, number, number, number];
        };
  }>;
  readonly tuningByProfileRef: ReadonlyMap<string, CameraTuningV1>;
  readonly activeInputActions: ReadonlySet<SemanticInputActionV1>;
  readonly previousInputActions: ReadonlySet<SemanticInputActionV1>;
  readonly cameraFovRadians: number;
}

type CameraContextV1 = RuntimeSubjectCapabilityAssemblyV1["cameraContext"];
type CameraParametersV1 = RuntimeCameraRigProfileV1["parameters"];

interface SelectedCameraStateV1 {
  profile: RuntimeCameraRigProfileV1;
  modifiers: readonly RuntimeCameraModifierProfileV1[];
  decision: CameraSelectionDecisionV2;
}

function freezeVec3(value: Vector3 | readonly number[]): RuntimeVec3V1 {
  if (value instanceof Vector3) {
    return Object.freeze([value.x, value.y, value.z]) as RuntimeVec3V1;
  }
  return Object.freeze([value[0], value[1], value[2]]) as RuntimeVec3V1;
}

function copySelectionDecision(
  decision: CameraSelectionDecisionV2,
): CameraSelectionDecisionV2 {
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
  decision: CameraSelectionDecisionV2,
  cameraContextProfileRef: string,
  cameraRigProfileRef: string,
  isTargetSocketFallback: boolean,
): CameraSelectionDecisionV2 {
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
        rule.when.motionKernelRefs !== undefined ||
        rule.when.movementMediums !== undefined &&
        movementMediums?.length === 0
      ) return [];
      const requiredMotionTags = rule.when.requiredMotionTags ?? [];
      const leftoverMotionTags = requiredMotionTags.filter(
        (tag) => tag !== "free-ground",
      );
      const requiredCameraContextTags = [
        ...leftoverMotionTags,
        ...(rule.when.requiredCameraContextTags ?? []),
      ];
      const mobilityModes = [
        ...(rule.when.mobilityModes ?? []),
        ...(requiredMotionTags.includes("free-ground")
          ? (["grounded"] as const)
          : []),
      ].filter((mode, index, modes) => modes.indexOf(mode) === index);
      return {
        id: rule.id,
        priority: rule.priority,
        when: {
        ...(rule.when.relationshipRoles === undefined
          ? {}
          : { relationshipRoles: rule.when.relationshipRoles }),
        ...(rule.when.locomotionStatuses === undefined
          ? {}
          : { locomotionStatuses: rule.when.locomotionStatuses }),
        ...(isEmpty(mobilityModes) ? {} : { mobilityModes }),
        ...(rule.when.gaits === undefined
          ? {}
          : { gaits: rule.when.gaits }),
        ...(rule.when.verticalPhases === undefined
          ? {}
          : { verticalPhases: rule.when.verticalPhases }),
        ...(rule.when.requiredActiveActionRefs === undefined
          ? {}
          : { requiredActiveActionRefs: rule.when.requiredActiveActionRefs }),
        ...(rule.when.actionInterruptibility === undefined
          ? {}
          : { actionInterruptibility: rule.when.actionInterruptibility }),
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
        ...(isEmpty(requiredCameraContextTags)
          ? {}
          : { requiredCameraContextTags }),
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

function canonicalCameraNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

type CameraDirectorTelemetryV1 = Omit<
  CameraDirectorSnapshotV1,
  | "activeCameraProfileRef"
  | "activeCameraRigRef"
  | "activeCameraModifierRefs"
  | "fallbackActive"
  | "viewYawOffsetRadians"
  | "viewPitchOffsetRadians"
  | "viewDistanceOffsetMeters"
>;

/**
 * Task 5 isolation seam for the live V1 WorldRuntime. Task 6 replaces this
 * projection with the committed CharacterMovement transaction output.
 * It never infers gait/phase from velocity, Motion Kernel or animation.
 */
export function legacyViewTargetToCommittedCameraContextV2ForTask6(
  sample: ViewTargetSampleV1,
  committedTick: number,
): CameraContextSampleV2 {
  const facingYawRadians = canonicalCameraNumber(Math.atan2(
    -sample.forwardXYZ[0],
    -sample.forwardXYZ[2],
  ));
  return {
    schemaVersion: 2,
    semanticAuthorityStatus: "unavailable",
    committedTick,
    controlledEntityId: sample.controlledEntityId,
    targetEntityId: sample.entityId,
    subjectPose: {
      positionMetersXYZ: [
        canonicalCameraNumber(sample.targetPositionMetersXYZ[0]),
        canonicalCameraNumber(sample.targetPositionMetersXYZ[1]),
        canonicalCameraNumber(sample.targetPositionMetersXYZ[2]),
      ],
      facingYawRadians,
    },
    locomotion: {
      schemaVersion: 2,
      status: "suspended",
      suspendedByRelationshipId: "3c-task6-authority-unavailable",
      committedTick,
      transitionSequence: 0,
    },
    actionSummary: { status: "unavailable" },
    environment: {
      relationshipContexts: [],
      relationshipRole: "none",
      socketPositionsMetersXYZById: {},
      cameraContextTags: [],
    },
  };
}

/**
 * Live Motion Kernel subjects still own support and locomotion. Publish those
 * committed facts as Camera Context V2 so automatic Rules can select a view.
 * Do not reuse the Task-6 unavailable seam: that seam must not invent gait or
 * phase, and it bypasses every auto Rule including free-ground → orbit.
 */
export function committedCameraContextFromMotionKernelV1(
  sample: ViewTargetSampleV1,
  committedTick: number,
  locomotionMode: LocomotionModeV1,
  facingYawRadians: number,
): CameraContextSampleV2 {
  const canonicalFacingYawRadians = canonicalCameraNumber(facingYawRadians);
  const linearVelocity = {
    x: canonicalCameraNumber(sample.velocityMetersPerSecondXYZ[0]),
    y: canonicalCameraNumber(sample.velocityMetersPerSecondXYZ[1]),
    z: canonicalCameraNumber(sample.velocityMetersPerSecondXYZ[2]),
  };
  const horizontalSpeedMetersPerSecond = canonicalCameraNumber(
    Math.hypot(linearVelocity.x, linearVelocity.z),
  );
  const positionMetersXYZ = [
    canonicalCameraNumber(sample.targetPositionMetersXYZ[0]),
    canonicalCameraNumber(sample.targetPositionMetersXYZ[1]),
    canonicalCameraNumber(sample.targetPositionMetersXYZ[2]),
  ] as const;
  const airborne = locomotionMode === "airborne" ||
    sample.movementMedium === "air";
  return parseCameraContextSampleV2({
    schemaVersion: 2,
    semanticAuthorityStatus: "available",
    committedTick,
    controlledEntityId: sample.controlledEntityId,
    targetEntityId: sample.entityId,
    subjectPose: {
      positionMetersXYZ,
      facingYawRadians: canonicalFacingYawRadians,
    },
    locomotion: airborne
      ? {
          schemaVersion: 2,
          status: "active",
          mobilityMode: "airborne",
          gait: "none",
          verticalPhase: linearVelocity.y > 0 ? "rising" : "falling",
          supportMode: "unsupported",
          movementMedium: "air",
          facingYawRadians: canonicalFacingYawRadians,
          linearVelocity,
          horizontalSpeedMetersPerSecond,
          committedTick,
          phaseEnteredTick: 0,
          transitionSequence: 0,
        }
      : {
          schemaVersion: 2,
          status: "active",
          mobilityMode: "grounded",
          gait: locomotionMode === "walk" || locomotionMode === "run"
            ? locomotionMode
            : "idle",
          verticalPhase: "none",
          supportMode: "supported",
          movementMedium: "ground",
          facingYawRadians: canonicalFacingYawRadians,
          linearVelocity,
          horizontalSpeedMetersPerSecond,
          committedTick,
          phaseEnteredTick: 0,
          transitionSequence: 0,
        },
    actionSummary: {
      status: "available",
      activeActionRefs: [],
      isInterruptible: true,
    },
    environment: {
      relationshipRole: sample.relationshipRole,
      relationshipContexts: sample.relationshipContexts,
      socketPositionsMetersXYZById: sample.socketPositionsMetersXYZById,
      cameraContextTags: [...sample.cameraContextTags],
    },
  });
}

function viewTargetFromCommittedCameraContextV2(
  legacySample: ViewTargetSampleV1,
  context: CameraContextSampleV2,
): ViewTargetSampleV1 {
  const locomotion = context.locomotion;
  const facingYawRadians = context.subjectPose.facingYawRadians;
  return {
    controlledEntityId: context.controlledEntityId,
    entityId: context.targetEntityId,
    targetPositionMetersXYZ: context.subjectPose.positionMetersXYZ,
    forwardXYZ: [
      canonicalCameraNumber(-Math.sin(facingYawRadians)),
      0,
      canonicalCameraNumber(-Math.cos(facingYawRadians)),
    ],
    upXYZ: [0, 1, 0],
    velocityMetersPerSecondXYZ: locomotion.status === "active"
      ? [
          locomotion.linearVelocity.x,
          locomotion.linearVelocity.y,
          locomotion.linearVelocity.z,
        ]
      : [0, 0, 0],
    approximateRadiusMeters: legacySample.approximateRadiusMeters,
    socketPositionsMetersXYZById: context.environment.socketPositionsMetersXYZById,
    // Legacy-only motion identity is intentionally not projected. Camera
    // Domain consumes the committed Context V2 facts above.
    motionTags: [],
    movementMedium: locomotion.status === "active"
      ? locomotion.movementMedium
      : "ground",
    relationshipContexts: context.environment.relationshipContexts,
    relationshipRole: context.environment.relationshipRole,
    cameraContextTags: context.environment.cameraContextTags,
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
  private latestCommittedTick: number | undefined;
  private latestCommittedContextIdentity: string | undefined;
  private activeTargetEntityId: string | undefined;
  private latestUpdateFailed = false;
  private disposed = false;
  private initialized = false;
  private cameraViewPreference: CameraViewPreferenceV1 = Object.freeze({ mode: "auto" });
  private activeProfileRef: string;
  private activeHeadingSource: RuntimeCameraRigProfileV1["headingSource"] | undefined;
  private activeReverseHeadingPolicy:
    | RuntimeCameraRigProfileV1["reverseHeadingPolicy"]
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
  private authoredOpeningProfileRef: string | undefined;
  private controlInitialized = false;
  private controlHeadingLockedUntilProfileBind = false;
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
  private latestTelemetry: CameraDirectorTelemetryV1 = {};

  constructor(
    private readonly initialCamera: WorldRuntimeInitialCameraV1,
    private readonly camera: FreeCamera,
    private readonly scene: Scene,
    private readonly physicsWorldQuery: PhysicsWorldQueryPortV1,
    private readonly options: CameraDirectorOptionsV1 = {},
  ) {
    this.activeProfileRef = initialCamera.cameraRigProfileRef;
  }

  setViewPreference(
    context: CameraContextV1,
    preference: CameraViewPreferenceV1,
  ): ReturnType<typeof admitCameraViewPreferenceV1> {
    this.assertUsable();
    const admission = admitCameraViewPreferenceV1(
      cameraContextProfileFromExecution(context),
      preference,
    );
    if (!admission.ok) return admission;
    this.cameraViewPreference = Object.freeze({ ...admission.cameraViewPreference });
    return admission;
  }

  resetViewPreference(): void {
    this.assertUsable();
    this.cameraViewPreference = Object.freeze({ mode: "auto" });
    this.tuningByProfileRef.clear();
    this.activeModifierRefs = [];
    this.transitionElapsedSeconds = 0;
    this.transitionDurationSeconds = 0;
    this.activeInputActions.clear();
    this.previousInputActions.clear();
    this.resetView();
  }

  captureTransactionState(): CameraDirectorTransactionStateV1 {
    return {
      values: {
        initialized: this.initialized,
        cameraViewPreference: this.cameraViewPreference,
        activeProfileRef: this.activeProfileRef,
        activeHeadingSource: this.activeHeadingSource,
        activeReverseHeadingPolicy: this.activeReverseHeadingPolicy,
        activeRigRef: this.activeRigRef,
        activeModifierRefs: this.activeModifierRefs,
        fallbackActive: this.fallbackActive,
        targetYawOffsetRadians: this.targetYawOffsetRadians,
        targetPitchOffsetRadians: this.targetPitchOffsetRadians,
        targetDistanceOffsetMeters: this.targetDistanceOffsetMeters,
        viewYawOffsetRadians: this.viewYawOffsetRadians,
        viewPitchOffsetRadians: this.viewPitchOffsetRadians,
        viewDistanceOffsetMeters: this.viewDistanceOffsetMeters,
        controlInitialized: this.controlInitialized,
        controlHeadingLockedUntilProfileBind:
          this.controlHeadingLockedUntilProfileBind,
        controlTargetYawOffsetRadians: this.controlTargetYawOffsetRadians,
        controlViewYawOffsetRadians: this.controlViewYawOffsetRadians,
        controlBaseHeadingYawRadians: this.controlBaseHeadingYawRadians,
        controlBaseHeadingIdentity: this.controlBaseHeadingIdentity,
        controlSecondsSinceManualViewInput: this.controlSecondsSinceManualViewInput,
        baseHeadingYawRadians: this.baseHeadingYawRadians,
        baseHeadingIdentity: this.baseHeadingIdentity,
        transitionElapsedSeconds: this.transitionElapsedSeconds,
        transitionDurationSeconds: this.transitionDurationSeconds,
        transitionStartFovRadians: this.transitionStartFovRadians,
        secondsSinceManualViewInput: this.secondsSinceManualViewInput,
        shoulderSide: this.shoulderSide,
        lookBackBlendRatio: this.lookBackBlendRatio,
        smoothedFovRadians: this.smoothedFovRadians,
        activeParameters: this.activeParameters,
        activeLockedParameters: this.activeLockedParameters,
        latestTelemetry: this.latestTelemetry,
        latestCommittedTick: this.latestCommittedTick,
        latestCommittedContextIdentity: this.latestCommittedContextIdentity,
        activeTargetEntityId: this.activeTargetEntityId,
        latestUpdateFailed: this.latestUpdateFailed,
        authoredOpeningProfileRef: this.authoredOpeningProfileRef,
      },
      vectors: {
        smoothedTarget: this.smoothedTarget.clone(),
        controlLastStableVelocityForward: this.controlLastStableVelocityForward?.clone(),
        controlLastBaseTarget: this.controlLastBaseTarget?.clone(),
        lastStableVelocityForward: this.lastStableVelocityForward?.clone(),
        transitionStartPosition: this.transitionStartPosition.clone(),
        transitionStartTarget: this.transitionStartTarget.clone(),
        previousVelocity: this.previousVelocity.clone(),
        lastBaseTarget: this.lastBaseTarget?.clone(),
        controlForward: this.controlForward.clone(),
        cameraPosition: this.camera.position.clone(),
        cameraRotation: this.camera.rotation.clone(),
        cameraRotationQuaternion: this.camera.rotationQuaternion === undefined
          ? { status: "undefined" }
          : this.camera.rotationQuaternion === null
            ? { status: "null" }
            : {
                status: "value",
                xyzw: [
                  this.camera.rotationQuaternion.x,
                  this.camera.rotationQuaternion.y,
                  this.camera.rotationQuaternion.z,
                  this.camera.rotationQuaternion.w,
                ],
              },
      },
      tuningByProfileRef: new Map(this.tuningByProfileRef),
      activeInputActions: new Set(this.activeInputActions),
      previousInputActions: new Set(this.previousInputActions),
      cameraFovRadians: this.camera.fov,
    };
  }

  restoreTransactionState(state: CameraDirectorTransactionStateV1): void {
    this.assertUsable();
    Object.assign(this, state.values);
    this.smoothedTarget.copyFrom(state.vectors.smoothedTarget);
    this.controlLastStableVelocityForward =
      state.vectors.controlLastStableVelocityForward?.clone();
    this.controlLastBaseTarget = state.vectors.controlLastBaseTarget?.clone();
    this.lastStableVelocityForward = state.vectors.lastStableVelocityForward?.clone();
    this.transitionStartPosition.copyFrom(state.vectors.transitionStartPosition);
    this.transitionStartTarget.copyFrom(state.vectors.transitionStartTarget);
    this.previousVelocity.copyFrom(state.vectors.previousVelocity);
    this.lastBaseTarget = state.vectors.lastBaseTarget?.clone();
    this.controlForward.copyFrom(state.vectors.controlForward);
    this.tuningByProfileRef.clear();
    for (const [profileRef, tuning] of state.tuningByProfileRef) {
      this.tuningByProfileRef.set(profileRef, tuning);
    }
    this.activeInputActions = new Set(state.activeInputActions);
    this.previousInputActions = new Set(state.previousInputActions);
    this.camera.position.copyFrom(state.vectors.cameraPosition);
    this.camera.rotation.copyFrom(state.vectors.cameraRotation);
    const mutableCamera = this.camera as unknown as {
      rotationQuaternion: Quaternion | null | undefined;
    };
    mutableCamera.rotationQuaternion = state.vectors.cameraRotationQuaternion.status === "undefined"
      ? undefined
      : state.vectors.cameraRotationQuaternion.status === "null"
        ? null
        : Quaternion.FromArray(state.vectors.cameraRotationQuaternion.xyzw);
    this.camera.fov = state.cameraFovRadians;
  }

  setInputActions(actions: readonly SemanticInputActionV1[]): void {
    this.assertUsable();
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
    this.assertUsable();
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

  initializeControlHeading(forwardXYZ: RuntimeVec3V1): void {
    this.assertUsable();
    const forward = horizontalDirection(new Vector3(...forwardXYZ)) ??
      new Vector3(0, 0, -1);
    this.controlForward.copyFrom(forward);
    this.controlBaseHeadingYawRadians = directionYaw(forward);
    this.controlLastStableVelocityForward = forward.clone();
    this.controlTargetYawOffsetRadians = 0;
    this.controlViewYawOffsetRadians = 0;
    this.controlInitialized = true;
    this.controlHeadingLockedUntilProfileBind = true;
  }

  resetView(): void {
    this.assertUsable();
    this.targetYawOffsetRadians = 0;
    this.targetPitchOffsetRadians = 0;
    this.targetDistanceOffsetMeters = 0;
    this.viewYawOffsetRadians = 0;
    this.viewPitchOffsetRadians = 0;
    this.viewDistanceOffsetMeters = 0;
    this.controlTargetYawOffsetRadians = 0;
    this.controlViewYawOffsetRadians = 0;
    this.baseHeadingIdentity = undefined;
    this.controlBaseHeadingIdentity = undefined;
    this.controlHeadingLockedUntilProfileBind = false;
  }

  applyPreview(
    tuningByProfileRef: Readonly<Record<string, CameraTuningV1>>,
    cameraContext: CameraContextV1,
  ): boolean {
    this.assertUsable();
    if (Array.isArray(tuningByProfileRef)) return false;
    const profilesByRef = new Map(
      cameraContext.cameraRigProfiles.map(
        (profile) => [profile.resourceRef, profile] as const,
      ),
    );
    const reachableModifierRefs = new Set(
      cameraContext.rules.flatMap((rule) => rule.cameraModifierRefs ?? []),
    );
    const reachableModifiers = cameraContext.cameraModifierProfiles.filter(
      (modifier) => reachableModifierRefs.has(modifier.resourceRef),
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
      const validForEveryReachableModifier =
        reachableModifiers.every((modifier) => {
          const modifiedParameters = applyCameraRigParameterOverridesV1(
            profile.algorithmRef,
            profile.parameters,
            modifier.parameterOverrides,
          );
          return validateCameraTuningV1(
            {
              algorithmRef: profile.algorithmRef,
              parameters: modifiedParameters,
            },
            result.tuning,
          ).ok;
        });
      if (!validForEveryReachableModifier) return false;
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
    legacySample: ViewTargetSampleV1,
    deltaSeconds: number,
    cameraContextSample: CameraContextSampleV2,
    springArm: SpringArmComponentV1,
  ): void {
    if (this.disposed) {
      throw new Error("3C_RUNTIME_DISPOSED: CameraDirector is disposed.");
    }
    const committedContext = parseCameraContextSampleV2(cameraContextSample);
    const committedContextIdentity = JSON.stringify(committedContext);
    if (
      this.latestCommittedTick !== undefined &&
      committedContext.committedTick < this.latestCommittedTick
    ) {
      throw new Error(
        "3C_CAMERA_CONTEXT_UNCOMMITTED: CameraDirector rejected an older committed Tick.",
      );
    }
    if (committedContext.committedTick === this.latestCommittedTick) {
      if (committedContextIdentity !== this.latestCommittedContextIdentity) {
        throw new Error(
          "3C_CAMERA_CONTEXT_UNCOMMITTED: CameraDirector rejected conflicting authority bytes for one committed Tick.",
        );
      }
      if (this.latestUpdateFailed) {
        throw new Error(
          "3C_CAMERA_QUERY_UNAVAILABLE: CameraDirector Tick already failed closed.",
        );
      }
      // Profile, preview, and Orbit mutations are staged in Director state.
      // A committed Tick owns at most one collision query and one pose commit.
      return;
    }
    this.latestCommittedTick = committedContext.committedTick;
    this.latestCommittedContextIdentity = committedContextIdentity;
    this.latestUpdateFailed = true;
    const beforeTransaction = this.captureTransactionState();
    const beforeSpringArmTransaction = springArm.captureTransactionState();
    try {
    const sample = viewTargetFromCommittedCameraContextV2(
      legacySample,
      committedContext,
    );
    const selected = this.selectProfile(cameraContext, committedContext);
    if (selected === undefined) {
      throw new Error(
        "WORLDKIT_RUNTIME_CAMERA_PROFILE_NOT_FOUND: Camera context has no resolvable default profile.",
      );
    }
    const baseProfile = selected.profile;
    const profile: RuntimeCameraRigProfileV1 = selected.modifiers.reduce(
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
    const lockedParameters = profile.parameters;
    const firstPersonProfile = profile.algorithmRef.endsWith(
      "/socket-first-person@1",
    );
    if (this.authoredOpeningProfileRef === undefined && !firstPersonProfile) {
      this.authoredOpeningProfileRef = profile.resourceRef;
    }
    const authoredOpeningTuning: CameraTuningV1 =
      this.authoredOpeningProfileRef === profile.resourceRef
        ? {
            distanceMeters: this.initialCamera.distanceMeters,
            targetHeightMeters: this.initialCamera.targetHeightMeters,
            pitchRadians: this.initialCamera.pitchRadians,
            baseFovDegrees: this.initialCamera.fovDegrees,
          }
        : {};
    const authoredOpeningValidation = validateCameraTuningV1(
      { algorithmRef: baseProfile.algorithmRef, parameters: baseProfile.parameters },
      authoredOpeningTuning,
    );
    if (!authoredOpeningValidation.ok) {
      throw new Error(
        "WORLDKIT_RUNTIME_CAMERA_OPENING_TUNING_INVALID: " +
          authoredOpeningValidation.message,
      );
    }
    const previewTuning = this.tuningByProfileRef.get(profile.resourceRef) ?? {};
    const authoredBaseParameters = applyCameraRigParameterOverridesV1(
      baseProfile.algorithmRef,
      baseProfile.parameters,
      authoredOpeningValidation.tuning,
    );
    // Context Modifiers remain authoritative over opening composition. This
    // preserves mounted/aim/sprint framing after the initial authored baseline.
    const authoredParameters = selected.modifiers.reduce(
      (current, modifier) => applyCameraRigParameterOverridesV1(
        baseProfile.algorithmRef,
        current,
        modifier.parameterOverrides,
      ),
      authoredBaseParameters,
    );
    const parameters = applyCameraRigParameterOverridesV1(
      profile.algorithmRef,
      authoredParameters,
      previewTuning,
    );
    if (
      cameraRigParametersViolateInvariantsV1(lockedParameters) ||
      cameraRigParametersViolateInvariantsV1(parameters)
    ) {
      throw new Error(
        "WORLDKIT_RUNTIME_CAMERA_RESOLVED_PARAMETERS_INVALID: " +
          `Camera Rig '${profile.resourceRef}' and its active Modifiers or Preview ` +
          "violate the closed Camera parameter invariants.",
      );
    }

    const previousProfileRef = this.activeProfileRef;
    const nextModifierRefs = selected.modifiers.map((modifier) => modifier.resourceRef);
    const targetIdentityChanged = this.initialized &&
      this.activeTargetEntityId !== undefined &&
      this.activeTargetEntityId !== sample.entityId;
    const selectionChanged = this.initialized && (
      previousProfileRef !== profile.resourceRef ||
      nextModifierRefs.join("|") !== this.activeModifierRefs.join("|")
    );
    const springArmBasisChanged = this.initialized && (
      previousProfileRef !== profile.resourceRef ||
      this.activeRigRef !== profile.algorithmRef
    );
    const headingBasisChanged = this.initialized && (
      previousProfileRef !== profile.resourceRef ||
      this.activeHeadingSource !== profile.headingSource ||
      this.activeReverseHeadingPolicy !== profile.reverseHeadingPolicy
    );
    if (springArmBasisChanged || targetIdentityChanged) springArm.reset();
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
    this.fallbackActive = selected.decision.fallbackActive;
    this.activeParameters = parameters;
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
    let target = targetIdentityChanged
      ? rawTarget
      : this.targetWithDeadZone(rawTarget, parameters);
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
    let collisionHitPositionXYZ: RuntimeVec3V1 | undefined;
    if (
      !firstPerson &&
      this.options.thirdPersonOcclusionStrategy !== "subject-occlusion-fade"
    ) {
      let collision: ReturnType<SpringArmComponentV1["solve"]>;
      try {
        collision = springArm.solve({
          subjectEntityId: sample.controlledEntityId,
          desiredTarget: target,
          desiredPosition,
          parameters,
          deltaSeconds,
          physicsWorldQuery: this.physicsWorldQuery,
        });
      } catch {
        throw new Error(
          "3C_CAMERA_QUERY_UNAVAILABLE: Spring Arm physics query failed closed.",
        );
      }
      desiredPosition = collision.position;
      safeArmLengthMeters = collision.safeArmLengthMeters;
      effectiveArmLengthMeters = collision.effectiveArmLengthMeters;
      isCollisionRetracted = collision.isCollisionRetracted;
      collisionHitEntityId = collision.collisionHitEntityId;
      collisionHitPositionXYZ = collision.collisionHitPositionXYZ;
    } else if (!firstPerson) {
      safeArmLengthMeters = requestedArmLengthMeters;
      effectiveArmLengthMeters = requestedArmLengthMeters;
      isCollisionRetracted = false;
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
    const nextTarget = targetIdentityChanged
      ? target.clone()
      : new Vector3(
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
      this.smoothedTarget.copyFrom(targetIdentityChanged
        ? nextTarget
        : Vector3.Lerp(
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
    this.activeTargetEntityId = sample.entityId;
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
      actualTargetPositionMetersXYZ: freezeVec3(this.smoothedTarget),
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
      previewParameterOverrides: Object.freeze({ ...previewTuning }),
      profileTransitionProgressRatio,
      controlForwardXYZ: freezeVec3(this.controlForward),
      subjectForwardXYZ: freezeVec3(sample.forwardXYZ),
      subjectVelocityMetersPerSecondXYZ: freezeVec3(
        sample.velocityMetersPerSecondXYZ,
      ),
    };
    this.latestUpdateFailed = false;
    } catch (error) {
      this.restoreTransactionState(beforeTransaction);
      springArm.restoreTransactionState(beforeSpringArmTransaction);
      throw error;
    }
  }

  reset(): void {
    this.assertUsable();
    this.initialized = false;
    this.cameraViewPreference = Object.freeze({ mode: "auto" });
    this.activeHeadingSource = undefined;
    this.activeReverseHeadingPolicy = undefined;
    this.tuningByProfileRef.clear();
    this.authoredOpeningProfileRef = undefined;
    this.fallbackActive = false;
    this.smoothedTarget.setAll(0);
    this.targetYawOffsetRadians = 0;
    this.targetPitchOffsetRadians = 0;
    this.targetDistanceOffsetMeters = 0;
    this.viewYawOffsetRadians = 0;
    this.viewPitchOffsetRadians = 0;
    this.viewDistanceOffsetMeters = 0;
    this.controlInitialized = false;
    this.controlHeadingLockedUntilProfileBind = false;
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
    this.latestCommittedTick = undefined;
    this.latestCommittedContextIdentity = undefined;
    this.activeTargetEntityId = undefined;
    this.latestUpdateFailed = false;
    this.smoothedFovRadians = Math.PI / 3;
    this.activeParameters = undefined;
    this.activeLockedParameters = undefined;
    this.controlForward.set(0, 0, -1);
    this.latestTelemetry = {};
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
  }

  snapshot(): CameraDirectorSnapshotV1 {
    // Read-only evidence remains available after dispose for audit/teardown.
    return Object.freeze({
      activeCameraProfileRef: this.activeProfileRef,
      activeCameraRigRef: this.activeRigRef,
      activeCameraModifierRefs: Object.freeze([...this.activeModifierRefs]),
      fallbackActive: this.fallbackActive,
      viewYawOffsetRadians: this.viewYawOffsetRadians,
      viewPitchOffsetRadians: this.viewPitchOffsetRadians,
      viewDistanceOffsetMeters: this.viewDistanceOffsetMeters,
      ...this.latestTelemetry,
    });
  }

  previewState(): CameraPreviewStateV1 {
    // Like snapshot(), this is an immutable read and never reopens lifecycle.
    return Object.freeze({
      kind: "worldkit-camera-preview-state",
      schemaVersion: 1,
      activeCameraProfileRef: this.activeProfileRef,
      activeCameraRigRef: this.activeRigRef,
      activeCameraModifierRefs: Object.freeze([...this.activeModifierRefs]),
      tuningByProfileRef: Object.freeze(Object.fromEntries(
        [...this.tuningByProfileRef]
          .sort(([leftProfileRef], [rightProfileRef]) =>
            leftProfileRef < rightProfileRef
              ? -1
              : leftProfileRef > rightProfileRef
                ? 1
                : 0
          )
          .map(([profileRef, tuning]) => [profileRef, Object.freeze({ ...tuning })]),
      )),
    });
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("3C_RUNTIME_DISPOSED: CameraDirector is disposed.");
    }
  }

  private resolveBaseForward(
    profile: RuntimeCameraRigProfileV1,
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
    profile: RuntimeCameraRigProfileV1,
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
      if (!this.controlHeadingLockedUntilProfileBind) {
        this.controlBaseHeadingYawRadians = directionYaw(targetForward);
        this.controlLastStableVelocityForward = targetForward.clone();
      }
      this.controlHeadingLockedUntilProfileBind = false;
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
    profile: RuntimeCameraRigProfileV1,
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
    profile: RuntimeCameraRigProfileV1,
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
    cameraContextSample: CameraContextSampleV2,
  ): SelectedCameraStateV1 | undefined {
    const selection = selectCameraViewV2({
      cameraContextProfile: cameraContextProfileFromExecution(context),
      cameraContextSample,
      cameraViewPreference: this.cameraViewPreference,
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
    if (profile === undefined) return undefined;
    const modifiers = selection.decision.activeCameraModifierRefs
      .flatMap((resourceRef) => {
        const modifier = modifiersByRef.get(resourceRef);
        return modifier === undefined ? [] : [modifier];
      });
    return { profile, modifiers, decision: selection.decision };
  }

}
