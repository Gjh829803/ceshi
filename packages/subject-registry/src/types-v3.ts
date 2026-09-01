import type { CameraContextRuleV2 } from "@whitebox-world/camera";
import type {
  CameraRigParameterNameV1,
  CameraRigParametersV1,
  JumpVariantPolicyV1,
} from "@whitebox-world/runtime-contracts";
import type { SubjectBodyTopologyV2 } from "@whitebox-world/subject-contracts";

import type {
  AnimationSetManifestV1,
  CapabilityManifestV1,
  ColliderDerivationProfileManifestV1,
  ColliderProfileManifestV1,
  LocomotionProfileManifestV1,
  PhysicsBodyProfileManifestV1,
  RigProfileManifestV1,
  SubjectAssetManifestV1,
  SubjectColliderPolicyV2,
  SubjectRegistryResourceInputV1,
  SubjectRegistryResourceV1,
  SubjectResourceAiMetadataV1,
  SubjectSocketDefinitionV2,
  SubjectVisualBindingV1,
  SubjectVisualPartDefinitionV2,
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
  fallbackMotionProfileRef: string;
  deterministic: true;
  runtimeStatus: "implemented" | "reserved";
}

export type MotionParameterValueV1 = number | boolean;

export interface MotionParameterLimitV1 {
  minimum: number;
  maximum: number;
}

export interface ParameterAuthoringRangeV1 extends MotionParameterLimitV1 {
  step: number;
}

export type ControlProfileCommandKindV1 = "planar-vector" | "none";

export type ControlProfileInputSpaceV1 = "camera-relative" | "subject-local" | "none";

export type ControlProfileFacingPolicyV1 =
  | "align-to-move"
  | "align-to-view"
  | "fixed";

export interface ControlFeelProfileInputV1 extends CapabilityResourceBaseInputV1 {
  kind: "control-feel-profile";
  jumpVariantPolicy: JumpVariantPolicyV1;
  walkSpeedMetersPerSecond: number;
  runSpeedMetersPerSecond: number;
  jumpSpeedMetersPerSecond: number;
  accelerationMetersPerSecondSquared: number;
  decelerationMetersPerSecondSquared: number;
  turnRateRadiansPerSecond: number;
  moveResponseExponent: number;
  airControlRatio: number;
  coyoteTimeSeconds: number;
  jumpBufferSeconds: number;
  variableJumpHoldSeconds: number;
  jumpHoldGravityRatio: number;
  jumpReleaseGravityRatio: number;
}

export interface MotionProfileInputV1 extends CapabilityResourceBaseInputV1 {
  kind: "motion-profile";
  motionKernelRef: string;
  motionTags: readonly string[];
}

export interface ControlProfileInputV1 extends CapabilityResourceBaseInputV1 {
  kind: "control-profile";
  commandKind: ControlProfileCommandKindV1;
  inputSpace: ControlProfileInputSpaceV1;
  facingPolicy: ControlProfileFacingPolicyV1;
  lateralMovementPolicy: "allowed" | "forbidden";
  moveDeadzoneRatio: number;
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
  baseMode:
    | "first-person"
    | "free-orbit"
    | "stable-follow"
    | "speed-chase"
    | "flight-horizon";
  algorithmRef: CameraRigAlgorithmRefV1;
  headingSource: "view" | "target-forward" | "target-velocity";
  reverseHeadingPolicy: "follow-velocity" | "preserve-target-forward";
  recenterMode: "off" | "forward-motion" | "always";
  preferredSocketIds: readonly string[];
  parameters: CameraRigParametersV1;
  authoringRanges?: Readonly<Partial<
    Record<CameraRigParameterNameV1, ParameterAuthoringRangeV1>
  >>;
}

export interface CameraModifierProfileInputV1
  extends CapabilityResourceBaseInputV1 {
  kind: "camera-modifier-profile";
  parameterOverrides: Readonly<Partial<CameraRigProfileInputV1["parameters"]>>;
  headingSourceOverride?: CameraRigProfileInputV1["headingSource"];
  reverseHeadingPolicyOverride?: CameraRigProfileInputV1["reverseHeadingPolicy"];
  recenterModeOverride?: CameraRigProfileInputV1["recenterMode"];
}

export interface CameraContextProfileInputV1
  extends CapabilityResourceBaseInputV1 {
  kind: "camera-context-profile";
  defaultCameraRigProfileRef: string;
  firstPersonCameraRigProfileRef?: string;
  rules: readonly CameraContextRuleV2[];
}

export interface MediumProfileInputV1 extends CapabilityResourceBaseInputV1 {
  kind: "medium-profile";
  air: {
    gravityRatio: number;
    linearDragPerSecond: number;
  };
}

interface RelationshipProfileBaseInputV1
  extends CapabilityResourceBaseInputV1 {
  kind: "relationship-profile";
  runtimeStatus: "implemented" | "reserved";
}

export type RelationshipProfileInputV1 =
  | (RelationshipProfileBaseInputV1 & Readonly<{
      relationshipType: "mountedOn";
      requiredRiderSocketIds: readonly string[];
      requiredMountSocketIds: readonly string[];
      controlTransferMode: "keep-rider" | "to-mount" | "none";
      cameraTargetRole: "controlled-entity" | "rider" | "mount";
      maximumMountDistanceMeters?: number;
    }>)
  | (RelationshipProfileBaseInputV1 & Readonly<{
      relationshipType: "seat";
      runtimeStatus: "reserved";
      requiredOccupantSocketIds: readonly string[];
      requiredSeatSocketIds: readonly string[];
    }>)
  | (RelationshipProfileBaseInputV1 & Readonly<{
      relationshipType: "tether";
      runtimeStatus: "reserved";
      requiredTetheredSocketIds: readonly string[];
      requiredTetherAnchorSocketIds: readonly string[];
    }>);

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
  )[];
}

export interface AiSchemaProjectionProfileInputV1
  extends CapabilityResourceBaseInputV1 {
  kind: "ai-schema-projection-profile";
  schemaVersion: 1;
  maximumPropertyCount: number;
  maximumNestingDepth: number;
  maximumEnumValueCount: number;
  maximumSchemaBytes: number;
  maximumRegistrySearchResultCount: number;
  optionalFieldMode:
    | "native-optional"
    | "required-nullable-with-round-trip-map";
}

export interface RegistrySubjectDefinitionInputV3 {
  kind: "subject-definition";
  schemaVersion: 3;
  id: string;
  version: number;
  resourceRef: string;
  authoringAvailability: "recommended" | "advanced" | "experimental";
  category: "human" | "animal" | "vehicle" | "composite" | "custom";
  bodyTopology: SubjectBodyTopologyV2;
  semanticClassId: string;
  coordinateConvention: {
    forwardAxis: "-Z";
    upAxis: "+Y";
    metersPerUnit: 1;
    pivot: "support-center";
  };
  visualParts: readonly SubjectVisualPartDefinitionV2[];
  visualBinding: SubjectVisualBindingV1;
  sockets: readonly SubjectSocketDefinitionV2[];
  colliderPolicy: SubjectColliderPolicyV2;
  capabilityRefs: readonly string[];
  profiles: {
    physicsBodyProfileRef: string;
    locomotionProfileRef: string;
    controlFeelProfileRef: string;
    allowedControlFeelProfileRefs: readonly string[];
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
  allowedOverridePaths: readonly string[];
  aiMetadata: SubjectResourceAiMetadataV1;
}

type WithContentHash<T> = Readonly<T & { contentHash: string }>;

export type ControlFeelProfileV1 = WithContentHash<ControlFeelProfileInputV1>;
export type MotionKernelDefinitionV1 = WithContentHash<MotionKernelDefinitionInputV1>;
export type MotionProfileV1 = WithContentHash<MotionProfileInputV1>;
export type ControlProfileV1 = WithContentHash<ControlProfileInputV1>;
export type CameraRigProfileV1 = WithContentHash<CameraRigProfileInputV1>;
export type CameraModifierProfileV1 = WithContentHash<CameraModifierProfileInputV1>;
export type CameraRigAlgorithmDefinitionV1 =
  WithContentHash<CameraRigAlgorithmDefinitionInputV1>;
export type CameraContextProfileV1 = WithContentHash<CameraContextProfileInputV1>;
export type MediumProfileV1 = WithContentHash<MediumProfileInputV1>;
export type RelationshipProfileV1 = WithContentHash<RelationshipProfileInputV1>;
export type HarnessProfileV1 = WithContentHash<HarnessProfileInputV1>;
export type PoseSetProfileV1 = WithContentHash<PoseSetProfileInputV1>;
export type RenderBindingProfileV1 = WithContentHash<RenderBindingProfileInputV1>;
export type AiSchemaProjectionProfileV1 =
  WithContentHash<AiSchemaProjectionProfileInputV1>;
export type RegistrySubjectDefinitionV3 = WithContentHash<RegistrySubjectDefinitionInputV3>;

export type SubjectCapabilityResourceInputV1 =
  | MotionKernelDefinitionInputV1
  | MotionProfileInputV1
  | ControlFeelProfileInputV1
  | ControlProfileInputV1
  | CameraRigAlgorithmDefinitionInputV1
  | CameraRigProfileInputV1
  | CameraModifierProfileInputV1
  | CameraContextProfileInputV1
  | MediumProfileInputV1
  | RelationshipProfileInputV1
  | HarnessProfileInputV1
  | PoseSetProfileInputV1
  | RenderBindingProfileInputV1
  | AiSchemaProjectionProfileInputV1;

export type SubjectCapabilityResourceV1 =
  | MotionKernelDefinitionV1
  | MotionProfileV1
  | ControlFeelProfileV1
  | ControlProfileV1
  | CameraRigAlgorithmDefinitionV1
  | CameraRigProfileV1
  | CameraModifierProfileV1
  | CameraContextProfileV1
  | MediumProfileV1
  | RelationshipProfileV1
  | HarnessProfileV1
  | PoseSetProfileV1
  | RenderBindingProfileV1
  | AiSchemaProjectionProfileV1;

export type SubjectRegistryResourceInputV3 =
  | SubjectRegistryResourceInputV1
  | SubjectCapabilityResourceInputV1
  | RegistrySubjectDefinitionInputV3;

export type SubjectRegistryResourceV3 =
  | SubjectRegistryResourceV1
  | SubjectCapabilityResourceV1
  | RegistrySubjectDefinitionV3;

export interface SubjectRegistryDiscoveryFilterV1<
  ResourceKind extends SubjectRegistryResourceV3["kind"] =
    SubjectRegistryResourceV3["kind"],
> {
  kind?: ResourceKind;
}

export type SubjectRegistryReferenceEdgeTypeV1 =
  | "dependency"
  | "metadata"
  | "back-reference";

export interface SubjectRegistryReferenceEdgeV1 {
  sourceResourceRef: string;
  sourcePath: string;
  targetResourceRef: string;
  expectedResourceKinds: readonly SubjectRegistryResourceV3["kind"][];
  type: SubjectRegistryReferenceEdgeTypeV1;
}

export interface SubjectResourceRegistryV3 {
  resolveResource(resourceRef: string): SubjectRegistryResourceV3 | undefined;
  listDiscoverableResources(): readonly SubjectRegistryResourceV3[];
  listDiscoverableResources<
    ResourceKind extends SubjectRegistryResourceV3["kind"],
  >(
    filter: SubjectRegistryDiscoveryFilterV1<ResourceKind>,
  ): readonly Extract<SubjectRegistryResourceV3, { kind: ResourceKind }>[];
  listReferenceEdges(
    resource: SubjectRegistryResourceV3,
  ): readonly SubjectRegistryReferenceEdgeV1[];
  resolveSubjectAsset(resourceRef: string): SubjectAssetManifestV1 | undefined;
  resolveRigProfile(resourceRef: string): RigProfileManifestV1 | undefined;
  resolveAnimationSet(resourceRef: string): AnimationSetManifestV1 | undefined;
  resolveColliderProfile(resourceRef: string): ColliderProfileManifestV1 | undefined;
  resolveSubjectDefinition(
    resourceRef: string,
  ): RegistrySubjectDefinitionV3 | undefined;
  resolveCapability(resourceRef: string): CapabilityManifestV1 | undefined;
  resolvePhysicsBodyProfile(
    resourceRef: string,
  ): PhysicsBodyProfileManifestV1 | undefined;
  resolveLocomotionProfile(resourceRef: string): LocomotionProfileManifestV1 | undefined;
  resolveColliderDerivationProfile(
    resourceRef: string,
  ): ColliderDerivationProfileManifestV1 | undefined;
  resolveMotionKernel(resourceRef: string): MotionKernelDefinitionV1 | undefined;
  resolveMotionProfile(resourceRef: string): MotionProfileV1 | undefined;
  resolveControlFeelProfile(resourceRef: string): ControlFeelProfileV1 | undefined;
  resolveControlProfile(resourceRef: string): ControlProfileV1 | undefined;
  resolveCameraRigAlgorithm(
    resourceRef: string,
  ): CameraRigAlgorithmDefinitionV1 | undefined;
  resolveCameraRigProfile(resourceRef: string): CameraRigProfileV1 | undefined;
  resolveCameraModifierProfile(resourceRef: string): CameraModifierProfileV1 | undefined;
  resolveCameraContextProfile(resourceRef: string): CameraContextProfileV1 | undefined;
  resolveMediumProfile(resourceRef: string): MediumProfileV1 | undefined;
  resolveRelationshipProfile(resourceRef: string): RelationshipProfileV1 | undefined;
  resolveHarnessProfile(resourceRef: string): HarnessProfileV1 | undefined;
  resolvePoseSetProfile(resourceRef: string): PoseSetProfileV1 | undefined;
  resolveRenderBindingProfile(resourceRef: string): RenderBindingProfileV1 | undefined;
  resolveAiSchemaProjectionProfile(
    resourceRef: string,
  ): AiSchemaProjectionProfileV1 | undefined;
}
