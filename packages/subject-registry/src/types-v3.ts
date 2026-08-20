import type {
  RegistrySubjectDefinitionInputV2,
  RegistrySubjectDefinitionV2,
  SubjectRegistryResourceInputV1,
  SubjectRegistryResourceV1,
  SubjectResourceAiMetadataV1,
  SubjectResourceRegistryV2,
} from "./types-v2";

export type MovementMediumV1 = "ground" | "water" | "air";

export type PhysicsBodyKindV1 = "character" | "rigid-body";

export type MotionCommandKindV1 =
  | "planar-vector"
  | "throttle-steer"
  | "flight-attitude"
  | "none";

export type MotionKernelImplementationIdV1 =
  | "free-ground"
  | "forward-steer"
  | "wheeled-arcade"
  | "surface-slide"
  | "hover"
  | "water-surface"
  | "underwater"
  | "unpowered-glide"
  | "powered-flight"
  | "zero-gravity-six-dof";

interface CapabilityResourceBaseInputV1 {
  id: string;
  version: number;
  resourceRef: string;
  authoringAvailability: "internal" | "recommended" | "advanced" | "experimental";
  aiMetadata: SubjectResourceAiMetadataV1;
}

export interface MotionKernelDefinitionInputV1
  extends CapabilityResourceBaseInputV1 {
  kind: "motion-kernel";
  implementationId: MotionKernelImplementationIdV1;
  commandKind: MotionCommandKindV1;
  supportedMediums: readonly MovementMediumV1[];
  supportedBodyKinds: readonly PhysicsBodyKindV1[];
  requiredCapabilityRefs: readonly string[];
  parameterSchemaRef: string;
  fallbackMotionProfileRef: string;
  deterministic: true;
  runtimeStatus: "implemented" | "reserved";
}

export type MotionParameterValueV1 = number | boolean;

export interface MotionParameterLimitV1 {
  minimum: number;
  maximum: number;
}

export interface MotionProfileInputV1 extends CapabilityResourceBaseInputV1 {
  kind: "motion-profile";
  motionKernelRef: string;
  parameters: Readonly<Record<string, MotionParameterValueV1>>;
  safetyLimits: Readonly<Record<string, MotionParameterLimitV1>>;
  motionTags: readonly string[];
}

export interface ControlProfileInputV1 extends CapabilityResourceBaseInputV1 {
  kind: "control-profile";
  commandKind: MotionCommandKindV1;
  inputSpace: "camera-relative" | "subject-local" | "flight-frame" | "none";
  facingPolicy:
    | "align-to-move"
    | "steering-derived"
    | "flight-derived"
    | "fixed";
  lateralMovementPolicy: "allowed" | "forbidden";
}

export type CameraRigAlgorithmRefV1 =
  | "worldkit://camera-rig/socket-first-person@1"
  | "worldkit://camera-rig/orbit-follow@1"
  | "worldkit://camera-rig/velocity-chase@1"
  | "worldkit://camera-rig/flight-horizon@1";

export interface CameraRigAlgorithmDefinitionInputV1
  extends CapabilityResourceBaseInputV1 {
  kind: "camera-rig-algorithm";
  implementationId:
    | "socket-first-person"
    | "orbit-follow"
    | "velocity-chase"
    | "flight-horizon";
  runtimeStatus: "implemented" | "reserved";
}

export interface CameraRigProfileInputV1
  extends CapabilityResourceBaseInputV1 {
  kind: "camera-rig-profile";
  algorithmRef: CameraRigAlgorithmRefV1;
  preferredSocketIds: readonly string[];
  parameters: {
    distanceMeters: number;
    minimumDistanceMeters: number;
    maximumDistanceMeters: number;
    targetHeightMeters: number;
    shoulderOffsetMeters: number;
    pitchRadians: number;
    minimumPitchRadians: number;
    maximumPitchRadians: number;
    positionDampingPerSecond: number;
    rotationDampingPerSecond: number;
    collisionRadiusMeters: number;
    baseFovDegrees: number;
    speedFovDegreesPerMeterPerSecond: number;
    maximumSpeedFovDegrees: number;
    lookAheadSeconds: number;
    transitionSeconds: number;
  };
}

export type RelationshipRoleV1 =
  | "none"
  | "rider"
  | "driver"
  | "passenger"
  | "tethered";

export interface CameraContextRuleV1 {
  id: string;
  priority: number;
  when: {
    relationshipRoles?: readonly RelationshipRoleV1[];
    motionKernelRefs?: readonly string[];
    requiredMotionTags?: readonly string[];
    movementMediums?: readonly MovementMediumV1[];
    minimumSpeedMetersPerSecond?: number;
    maximumSpeedMetersPerSecond?: number;
    requiredSocketIds?: readonly string[];
  };
  cameraRigProfileRef: string;
}

export interface CameraContextProfileInputV1
  extends CapabilityResourceBaseInputV1 {
  kind: "camera-context-profile";
  defaultCameraRigProfileRef: string;
  firstPersonCameraRigProfileRef?: string;
  rules: readonly CameraContextRuleV1[];
}

export interface MediumProfileInputV1 extends CapabilityResourceBaseInputV1 {
  kind: "medium-profile";
  supportedMediums: readonly MovementMediumV1[];
  ground: {
    groundingToleranceMeters: number;
  };
  water?: {
    surfaceHoldStrength: number;
    linearDragPerSecond: number;
  };
  air?: {
    gravityScale: number;
    linearDragPerSecond: number;
  };
}

export interface RelationshipProfileInputV1
  extends CapabilityResourceBaseInputV1 {
  kind: "relationship-profile";
  relationshipType: "seat" | "tether" | "mount";
  runtimeStatus: "implemented" | "reserved";
  requiredSourceSocketIds: readonly string[];
  requiredTargetSocketIds: readonly string[];
  controlTransferPolicy: "keep-source" | "transfer-to-target" | "none";
  cameraTargetPolicy: "controlled-entity" | "source-entity" | "target-entity";
  maximumDistanceMeters?: number;
}

export interface HarnessProfileInputV1 extends CapabilityResourceBaseInputV1 {
  kind: "harness-profile";
  requiredCheckIds: readonly (
    | "H01"
    | "H02"
    | "H03"
    | "H04"
    | "H05"
    | "H06"
    | "H07"
    | "H08"
    | "H09"
  )[];
}

export interface PoseSetProfileInputV1 extends CapabilityResourceBaseInputV1 {
  kind: "pose-set-profile";
  poseIds: readonly string[];
  defaultPoseId: string;
}

export interface RenderBindingProfileInputV1
  extends CapabilityResourceBaseInputV1 {
  kind: "render-binding-profile";
  publishedStateFields: readonly (
    | "semanticClassId"
    | "bodyTopology"
    | "forwardXYZ"
    | "speedMetersPerSecond"
    | "movementMedium"
    | "activeMotionKernelRef"
    | "activeActionId"
    | "relationshipRole"
  )[];
}

export interface RegistrySubjectDefinitionInputV3
  extends Omit<
    RegistrySubjectDefinitionInputV2,
    "category" | "bodyTopology" | "profiles"
  > {
  schemaVersion: 3;
  authoringAvailability: "recommended" | "advanced" | "experimental";
  category: "human" | "animal" | "vehicle" | "composite" | "custom";
  bodyTopology:
    | "biped"
    | "quadruped"
    | "four-wheel"
    | "surface-craft"
    | "watercraft"
    | "glider"
    | "composite"
    | "custom";
  profiles: {
    physicsBodyProfileRef: string;
    /** Compatibility projection for Authoring V2; V3 runtime uses motion.defaultMotionProfileRef. */
    locomotionProfileRef: string;
    motion: {
      defaultMotionProfileRef: string;
      optionalMotionProfileRefs: readonly string[];
      fallbackMotionProfileRef: string;
    };
    controlProfileRef: string;
    cameraContextProfileRef: string;
    mediumProfileRef: string;
    harnessProfileRef: string;
  };
  relationshipCapabilityRefs: readonly string[];
  actionOrPoseSetRef: string;
  renderBindingProfileRef: string;
}

type WithContentHash<T> = Readonly<T & { contentHash: string }>;

export type MotionKernelDefinitionV1 = WithContentHash<MotionKernelDefinitionInputV1>;
export type MotionProfileV1 = WithContentHash<MotionProfileInputV1>;
export type ControlProfileV1 = WithContentHash<ControlProfileInputV1>;
export type CameraRigProfileV1 = WithContentHash<CameraRigProfileInputV1>;
export type CameraRigAlgorithmDefinitionV1 =
  WithContentHash<CameraRigAlgorithmDefinitionInputV1>;
export type CameraContextProfileV1 = WithContentHash<CameraContextProfileInputV1>;
export type MediumProfileV1 = WithContentHash<MediumProfileInputV1>;
export type RelationshipProfileV1 = WithContentHash<RelationshipProfileInputV1>;
export type HarnessProfileV1 = WithContentHash<HarnessProfileInputV1>;
export type PoseSetProfileV1 = WithContentHash<PoseSetProfileInputV1>;
export type RenderBindingProfileV1 = WithContentHash<RenderBindingProfileInputV1>;
export type RegistrySubjectDefinitionV3 = WithContentHash<RegistrySubjectDefinitionInputV3>;

export type SubjectCapabilityResourceInputV1 =
  | MotionKernelDefinitionInputV1
  | MotionProfileInputV1
  | ControlProfileInputV1
  | CameraRigAlgorithmDefinitionInputV1
  | CameraRigProfileInputV1
  | CameraContextProfileInputV1
  | MediumProfileInputV1
  | RelationshipProfileInputV1
  | HarnessProfileInputV1
  | PoseSetProfileInputV1
  | RenderBindingProfileInputV1;

export type SubjectCapabilityResourceV1 =
  | MotionKernelDefinitionV1
  | MotionProfileV1
  | ControlProfileV1
  | CameraRigAlgorithmDefinitionV1
  | CameraRigProfileV1
  | CameraContextProfileV1
  | MediumProfileV1
  | RelationshipProfileV1
  | HarnessProfileV1
  | PoseSetProfileV1
  | RenderBindingProfileV1;

export type SubjectRegistryResourceInputV3 =
  | SubjectRegistryResourceInputV1
  | SubjectCapabilityResourceInputV1
  | RegistrySubjectDefinitionInputV3;

export type SubjectRegistryResourceV3 =
  | SubjectRegistryResourceV1
  | SubjectCapabilityResourceV1
  | RegistrySubjectDefinitionV3;

export interface SubjectResourceRegistryV3 extends SubjectResourceRegistryV2 {
  resolveSubjectDefinition(
    resourceRef: string,
  ): RegistrySubjectDefinitionV2 | RegistrySubjectDefinitionV3 | undefined;
  resolveMotionKernel(resourceRef: string): MotionKernelDefinitionV1 | undefined;
  resolveMotionProfile(resourceRef: string): MotionProfileV1 | undefined;
  resolveControlProfile(resourceRef: string): ControlProfileV1 | undefined;
  resolveCameraRigAlgorithm(
    resourceRef: string,
  ): CameraRigAlgorithmDefinitionV1 | undefined;
  resolveCameraRigProfile(resourceRef: string): CameraRigProfileV1 | undefined;
  resolveCameraContextProfile(resourceRef: string): CameraContextProfileV1 | undefined;
  resolveMediumProfile(resourceRef: string): MediumProfileV1 | undefined;
  resolveRelationshipProfile(resourceRef: string): RelationshipProfileV1 | undefined;
  resolveHarnessProfile(resourceRef: string): HarnessProfileV1 | undefined;
  resolvePoseSetProfile(resourceRef: string): PoseSetProfileV1 | undefined;
  resolveRenderBindingProfile(resourceRef: string): RenderBindingProfileV1 | undefined;
  /** Canonical Authoring V2 definition view. */
  listSubjectDefinitions(): readonly RegistrySubjectDefinitionV2[];
  /** Capability-driven Authoring V3 definitions only. */
  listCapabilitySubjectDefinitions(): readonly RegistrySubjectDefinitionV3[];
  /** Canonical V1 resource view. */
  listResources(): readonly SubjectRegistryResourceV1[];
  /** Capability resources only, without legacy resources or Subject Definitions. */
  listCapabilityResources(): readonly SubjectCapabilityResourceV1[];
}
