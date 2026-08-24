import type {
  LocomotionModeV1,
  PublishedMovementMediumV1,
  Vec3,
} from "@whitebox-world/runtime-contracts";

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
