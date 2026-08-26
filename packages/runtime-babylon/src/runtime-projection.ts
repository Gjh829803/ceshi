import type {
  LocomotionModeV1,
  PublishedMovementMediumV1,
  Vec3,
} from "@whitebox-world/runtime-contracts";
import type {
  CameraRigParametersV1,
  CameraSelectionDecisionV1,
} from "@whitebox-world/camera";

/**
 * Babylon-provider projection consumed by the host coordinator. It is not a
 * serialized World Runtime Snapshot protocol; the coordinator owns projection
 * into the canonical WorldRuntimeSnapshotV4 contract.
 */
export interface BabylonRuntimeSubjectProjectionV1 {
  readonly entityId: string;
  readonly subjectDefinitionRef: string;
  readonly subjectDefinitionHash: string;
  readonly positionMetersXYZ: Vec3;
  readonly velocityMetersPerSecondXYZ: Vec3;
  readonly movementMedium: PublishedMovementMediumV1;
  readonly activeActionId: string;
  readonly forwardXYZ: Vec3;
  readonly speedMetersPerSecond: number;
  readonly activeControlFeelProfileRef: string;
  readonly activePhysicsBodyProfileRef: string;
  readonly activeLocomotionProfileRef: string;
  readonly locomotionMode: LocomotionModeV1;
  readonly activeMotionProfileRef: string;
  readonly activeMotionKernelRef: string;
  readonly motionTags: readonly string[];
  readonly relationshipRole:
    | "none"
    | "rider"
    | "driver"
    | "passenger"
    | "tethered";
  readonly safeFallbackActive: boolean;
  readonly motionFailureCode?: string;
}

export interface BabylonRuntimeCameraProjectionV1 {
  readonly entityId: string;
  readonly targetEntityId?: string;
  readonly positionMetersXYZ: Vec3;
  readonly activeCameraProfileRef: string;
  readonly activeCameraRigRef: string;
  readonly activeCameraModifierRefs: readonly string[];
  readonly safeFallbackActive: boolean;
  readonly viewYawOffsetRadians: number;
  readonly viewPitchOffsetRadians: number;
  readonly viewDistanceOffsetMeters: number;
  readonly selectionDecision?: CameraSelectionDecisionV1;
  readonly selectedTargetSocketId?: string;
  readonly targetSocketPositionMetersXYZ?: Vec3;
  readonly isTargetSocketFallback?: boolean;
  readonly desiredTargetPositionMetersXYZ?: Vec3;
  readonly desiredPositionMetersXYZ?: Vec3;
  readonly actualPositionMetersXYZ?: Vec3;
  readonly finalFovDegrees?: number;
  readonly requestedArmLengthMeters?: number;
  readonly safeArmLengthMeters?: number;
  readonly effectiveArmLengthMeters?: number;
  readonly isCollisionRetracted?: boolean;
  readonly collisionHitEntityId?: string;
  readonly collisionHitPositionXYZ?: Vec3;
  readonly positionLagXYZ?: Vec3;
  readonly rotationLagRadiansXYZ?: Vec3;
  readonly recenterRemainingSeconds?: number;
  readonly fixedStepDeltaSeconds?: number;
  readonly resolvedParameters?: Readonly<CameraRigParametersV1>;
  readonly previewParameterOverrides?: Readonly<Partial<CameraRigParametersV1>>;
  readonly profileTransitionProgressRatio?: number;
  readonly controlForwardXYZ?: Vec3;
  readonly subjectForwardXYZ?: Vec3;
  readonly subjectVelocityMetersPerSecondXYZ?: Vec3;
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
