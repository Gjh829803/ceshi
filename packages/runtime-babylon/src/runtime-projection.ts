import type {
  LocomotionModeV1,
  PublishedMovementMediumV1,
  RuntimeVec3V1,
} from "@whitebox-world/runtime-contracts";
import type {
  CameraContextSampleV2,
  CameraRigParametersV1,
  CameraSelectionDecisionV2,
} from "@whitebox-world/camera";
import type { GameplayActionStateV1 } from "@whitebox-world/gameplay-contracts";
import type { LocomotionCapabilityStateV2 } from "@whitebox-world/gameplay-contracts";
import type { ResolvedActionPresentationV1 } from "@whitebox-world/subject-actions";
import type { JumpEpisodeStateV1 } from "@whitebox-world/character-movement";

/**
 * A prepared Babylon presentation transaction. `abort()` remains valid after
 * `commit()` so the Golden coordinator can restore projection evidence if the
 * later native Body commit fails. Implementations must make abort idempotent.
 */
export interface BabylonPreparedProjectionTransactionV1 {
  commit(): void;
  abort(): void;
}

/** Animation receives presentation facts only; no authority Transform is in scope. */
export interface BabylonCommittedAnimationProjectionRequestV1 {
  readonly schemaVersion: 1;
  readonly committedTick: number;
  readonly presentation: ResolvedActionPresentationV1;
  readonly jumpEpisode?: JumpEpisodeStateV1;
  readonly committedActionState?: GameplayActionStateV1;
}

export interface BabylonCommittedAnimationProjectionPortV1 {
  prepareCommittedAnimation(
    request: BabylonCommittedAnimationProjectionRequestV1,
  ): BabylonPreparedProjectionTransactionV1;
}

/** CameraDirector input is the strict committed semantic Context, never raw input. */
export interface BabylonPreparedCameraDirectorProjectionRequestV1 {
  readonly schemaVersion: 1;
  readonly committedTick: number;
  readonly cameraContext: CameraContextSampleV2;
}

export interface BabylonPreparedCameraDirectorProjectionPortV1 {
  prepareCameraDirectorUpdate(
    request: BabylonPreparedCameraDirectorProjectionRequestV1,
  ): BabylonPreparedProjectionTransactionV1;
}

/**
 * Babylon-provider projection consumed by the host coordinator. It is not a
 * serialized World Runtime Snapshot protocol; the coordinator owns projection
 * into the canonical WorldRuntimeSnapshotV4 contract.
 */
interface BabylonRuntimeSubjectProjectionBaseV1 {
  readonly entityId: string;
  readonly subjectDefinitionRef: string;
  readonly subjectDefinitionHash: string;
  readonly positionMetersXYZ: RuntimeVec3V1;
  readonly velocityMetersPerSecondXYZ: RuntimeVec3V1;
  readonly movementMedium: PublishedMovementMediumV1;
  readonly activeActionId: string;
  readonly forwardXYZ: RuntimeVec3V1;
  readonly speedMetersPerSecond: number;
  readonly activeControlFeelProfileRef: string;
  readonly activePhysicsBodyProfileRef: string;
  readonly activeLocomotionProfileRef: string;
  readonly locomotionMode: LocomotionModeV1;
  readonly activeMotionProfileRef: string;
  readonly motionTags: readonly string[];
  readonly safeFallbackActive: boolean;
  readonly motionFailureCode?: string;
}

/**
 * Provider projection with an explicit, disjoint movement owner. Planar
 * CharacterMovement and specialized throttle/flight strategies cannot publish
 * one another's authority fields.
 */
export type BabylonRuntimeSubjectProjectionV1 =
  | (BabylonRuntimeSubjectProjectionBaseV1 & Readonly<{
      movementOwner: "character-movement";
      locomotion: LocomotionCapabilityStateV2;
    }>)
  | (BabylonRuntimeSubjectProjectionBaseV1 & Readonly<{
      movementOwner: "specialized-motion";
      activeMotionKernelRef: string;
      locomotion?: never;
    }>);

export interface BabylonRuntimeCameraProjectionV1 {
  readonly entityId: string;
  readonly targetEntityId?: string;
  readonly positionMetersXYZ: RuntimeVec3V1;
  readonly activeCameraProfileRef: string;
  readonly authoredOpeningProfileRef?: string;
  readonly activeCameraRigRef: string;
  readonly activeCameraModifierRefs: readonly string[];
  readonly safeFallbackActive: boolean;
  readonly viewYawOffsetRadians: number;
  readonly viewPitchOffsetRadians: number;
  readonly viewDistanceOffsetMeters: number;
  readonly selectionDecision?: CameraSelectionDecisionV2;
  readonly selectedTargetSocketId?: string;
  readonly targetSocketPositionMetersXYZ?: RuntimeVec3V1;
  readonly isTargetSocketFallback?: boolean;
  readonly desiredTargetPositionMetersXYZ?: RuntimeVec3V1;
  readonly desiredPositionMetersXYZ?: RuntimeVec3V1;
  readonly actualPositionMetersXYZ?: RuntimeVec3V1;
  readonly finalFovDegrees?: number;
  readonly requestedArmLengthMeters?: number;
  readonly safeArmLengthMeters?: number;
  readonly effectiveArmLengthMeters?: number;
  readonly isCollisionRetracted?: boolean;
  readonly collisionHitEntityId?: string;
  readonly collisionHitPositionXYZ?: RuntimeVec3V1;
  readonly collisionHitNormalXYZ?: RuntimeVec3V1;
  readonly decollisionPhase?: "clear" | "constrained" | "recovering" | "emergency-inside";
  readonly startedOverlapping?: boolean;
  readonly penetrationDepthMeters?: number;
  readonly clearHoldRemainingSeconds?: number;
  readonly positionLagXYZ?: RuntimeVec3V1;
  readonly rotationLagRadiansXYZ?: RuntimeVec3V1;
  readonly recenterRemainingSeconds?: number;
  readonly fixedStepDeltaSeconds?: number;
  readonly resolvedParameters?: Readonly<CameraRigParametersV1>;
  readonly previewParameterOverrides?: Readonly<Partial<CameraRigParametersV1>>;
  readonly profileTransitionProgressRatio?: number;
  readonly controlForwardXYZ?: RuntimeVec3V1;
  readonly subjectForwardXYZ?: RuntimeVec3V1;
  readonly subjectVelocityMetersPerSecondXYZ?: RuntimeVec3V1;
}

export type BabylonRuntimePossessionProjectionV1 =
  | Readonly<{ mode: "unbound" }>
  | Readonly<{
      mode: "possessed";
      controlledEntityId: string;
    }>;

export interface BabylonRuntimeProjectionV1 {
  readonly runtimeBackend: "babylon-havok";
  readonly tick: number;
  readonly ready: boolean;
  readonly possessionTarget: BabylonRuntimePossessionProjectionV1;
  readonly subjectStatesByEntityId: Readonly<
    Record<string, BabylonRuntimeSubjectProjectionV1>
  >;
  readonly camera: BabylonRuntimeCameraProjectionV1;
  readonly physics: Readonly<{
    backend: "havok";
    ready: boolean;
    fixedTimeStepSeconds: number;
  }>;
  readonly resources: Readonly<{
    meshes: number;
    bodies: number;
    terrainSamples: number;
  }>;
}
