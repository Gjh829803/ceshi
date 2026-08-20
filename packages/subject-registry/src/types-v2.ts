import type { CompositionPrimitiveV1, Vec3 } from "@whitebox-world/subject-composition";

export interface SubjectResourceAiMetadataV1 {
  displayName: string;
  description: string;
  semanticTags: readonly string[];
}

interface SubjectRegistryResourceBaseInputV1 {
  id: string;
  version: number;
  resourceRef: string;
  aiMetadata: SubjectResourceAiMetadataV1;
}

export interface SubjectAssetManifestInputV1 extends SubjectRegistryResourceBaseInputV1 {
  kind: "subject-asset";
  format: "glb";
  artifact: {
    mediaType: "model/gltf-binary";
    byteLength: number;
    contentHash: string;
  };
  coordinateConvention: {
    forwardAxis: "-Z";
    upAxis: "+Y";
    metersPerUnit: 1;
    pivot: "support-center";
  };
  bounds: {
    minimumMetersXYZ: Vec3;
    maximumMetersXYZ: Vec3;
  };
  inventory: {
    meshCount: number;
    vertexCount: number;
    triangleCount: number;
    skeletonCount: number;
    boneCount: number;
    animationClipNames: readonly string[];
  };
  provenance: {
    licenseSpdxId: string;
    redistributionPolicy: "allowed" | "internal-only" | "prohibited";
    sourceUri?: string;
    licenseUri?: string;
    author?: string;
  };
}

export type BipedBoneIdV1 =
  | "hips"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "upper-arm.left"
  | "lower-arm.left"
  | "hand.left"
  | "upper-arm.right"
  | "lower-arm.right"
  | "hand.right"
  | "upper-leg.left"
  | "lower-leg.left"
  | "foot.left"
  | "upper-leg.right"
  | "lower-leg.right"
  | "foot.right";

export interface RigProfileManifestInputV1 extends SubjectRegistryResourceBaseInputV1 {
  kind: "rig-profile";
  bodyTopology: "biped";
  compatibleSubjectAssetRefs: readonly string[];
  skeletonRootBoneName: string;
  requiredBoneIds: readonly BipedBoneIdV1[];
  sourceNodeNameByBoneId: Readonly<Record<BipedBoneIdV1, string>>;
}

export type GroundHumanoidActionIdV1 = "idle" | "walk" | "run" | "jump";

export interface AnimationBindingV1 {
  actionId: GroundHumanoidActionIdV1;
  sourceClipName: string;
  loopMode: "repeat" | "once";
  playbackSpeedRatio: number;
  blendDurationSeconds: number;
  rootMotionMode: "in-place";
}

export interface AnimationSetManifestInputV1 extends SubjectRegistryResourceBaseInputV1 {
  kind: "animation-set";
  subjectAssetRef: string;
  rigProfileRef: string;
  defaultActionId: "idle";
  requiredActionIds: readonly GroundHumanoidActionIdV1[];
  animationBindings: readonly AnimationBindingV1[];
}

export interface ColliderProfileManifestInputV1
  extends SubjectRegistryResourceBaseInputV1 {
  kind: "collider-profile";
  supportedBodyTopologies: readonly ("biped" | "quadruped" | "custom")[];
  collider: {
    kind: "capsule";
    radiusMeters: number;
    heightMeters: number;
    centerOffsetFromSubjectOriginMetersXYZ: Vec3;
  };
}

export interface SubjectLocalTransformV1 {
  positionMetersXYZ: Vec3;
  rotationEulerRadiansXYZ?: Vec3;
}

export type SubjectVisualPartDefinitionV2 =
  | {
      id: string;
      kind: "primitive";
      shape: CompositionPrimitiveV1;
      localTransform: SubjectLocalTransformV1;
      colliderContribution: "include" | "exclude";
      semanticTags: readonly string[];
    }
  | {
      id: string;
      kind: "asset";
      subjectAssetRef: string;
      localTransform: SubjectLocalTransformV1 & { scaleXYZ: Vec3 };
      appearance: { mode: "whitebox-neutral" };
      semanticTags: readonly string[];
    };

export type SubjectVisualBindingV1 =
  | { mode: "static" }
  | {
      mode: "rigged";
      rigProfileRef: string;
      animationSetRef: string;
    };

export type SubjectColliderPolicyV2 =
  | {
      kind: "derive";
      colliderDerivationProfileRef: string;
    }
  | {
      kind: "profile";
      colliderProfileRef: string;
    };

export type SubjectSocketDefinitionV2 =
  | {
      id: string;
      kind: "local";
      localTransform: SubjectLocalTransformV1;
      semanticTags: readonly string[];
    }
  | {
      id: string;
      kind: "bone";
      boneId: BipedBoneIdV1;
      offsetTransform: SubjectLocalTransformV1;
      semanticTags: readonly string[];
    };

export interface RegistrySubjectDefinitionInputV2 extends SubjectRegistryResourceBaseInputV1 {
  kind: "subject-definition";
  category: "human" | "animal" | "custom";
  bodyTopology: "biped" | "quadruped" | "custom";
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
  };
}

export interface CapabilityManifestInputV1 extends SubjectRegistryResourceBaseInputV1 {
  kind: "capability";
  requiredCapabilityRefs: readonly string[];
  providedFeatures: readonly "ground-locomotion"[];
  conflictingCapabilityRefs: readonly string[];
}

export interface PhysicsBodyProfileManifestInputV1
  extends SubjectRegistryResourceBaseInputV1 {
  kind: "physics-body-profile";
  supportedBodyTopologies: readonly ("biped" | "quadruped" | "custom")[];
  physicsBody: {
    mode: "character";
    massKilograms: number;
    maxSlopeDegrees: number;
    maxStepHeightMeters: number;
  };
}

export interface LocomotionProfileManifestInputV1
  extends SubjectRegistryResourceBaseInputV1 {
  kind: "locomotion-profile";
  requiredCapabilityRefs: readonly string[];
  locomotion: {
    mode: "ground";
    walkSpeedMetersPerSecond: number;
    runSpeedMetersPerSecond: number;
    waterSpeedMetersPerSecond: number;
    jumpSpeedMetersPerSecond: number;
  };
}

export interface ColliderDerivationProfileManifestInputV1
  extends SubjectRegistryResourceBaseInputV1 {
  kind: "collider-derivation-profile";
  supportedBodyTopologies: readonly ("biped" | "quadruped" | "custom")[];
  colliderDerivation: {
    algorithm: "vertical-character-capsule";
    supportOriginToleranceMeters: number;
    maximumRadiusMeters: number;
    maximumHeightMeters: number;
  };
}

type WithContentHash<T> = Readonly<T & { contentHash: string }>;

export type SubjectAssetManifestV1 = WithContentHash<SubjectAssetManifestInputV1>;
export type RigProfileManifestV1 = WithContentHash<RigProfileManifestInputV1>;
export type AnimationSetManifestV1 = WithContentHash<AnimationSetManifestInputV1>;
export type ColliderProfileManifestV1 = WithContentHash<ColliderProfileManifestInputV1>;
export type RegistrySubjectDefinitionV2 = WithContentHash<RegistrySubjectDefinitionInputV2>;
export type CapabilityManifestV1 = WithContentHash<CapabilityManifestInputV1>;
export type PhysicsBodyProfileManifestV1 =
  WithContentHash<PhysicsBodyProfileManifestInputV1>;
export type LocomotionProfileManifestV1 = WithContentHash<LocomotionProfileManifestInputV1>;
export type ColliderDerivationProfileManifestV1 =
  WithContentHash<ColliderDerivationProfileManifestInputV1>;

export type SubjectRegistryResourceInputV1 =
  | SubjectAssetManifestInputV1
  | RigProfileManifestInputV1
  | AnimationSetManifestInputV1
  | ColliderProfileManifestInputV1
  | RegistrySubjectDefinitionInputV2
  | CapabilityManifestInputV1
  | PhysicsBodyProfileManifestInputV1
  | LocomotionProfileManifestInputV1
  | ColliderDerivationProfileManifestInputV1;

export type SubjectRegistryResourceV1 =
  | SubjectAssetManifestV1
  | RigProfileManifestV1
  | AnimationSetManifestV1
  | ColliderProfileManifestV1
  | RegistrySubjectDefinitionV2
  | CapabilityManifestV1
  | PhysicsBodyProfileManifestV1
  | LocomotionProfileManifestV1
  | ColliderDerivationProfileManifestV1;

export interface SubjectResourceRegistryV2 {
  resolveSubjectAsset(resourceRef: string): SubjectAssetManifestV1 | undefined;
  resolveRigProfile(resourceRef: string): RigProfileManifestV1 | undefined;
  resolveAnimationSet(resourceRef: string): AnimationSetManifestV1 | undefined;
  resolveColliderProfile(resourceRef: string): ColliderProfileManifestV1 | undefined;
  resolveSubjectDefinition(resourceRef: string): RegistrySubjectDefinitionV2 | undefined;
  resolveCapability(resourceRef: string): CapabilityManifestV1 | undefined;
  resolvePhysicsBodyProfile(resourceRef: string): PhysicsBodyProfileManifestV1 | undefined;
  resolveLocomotionProfile(resourceRef: string): LocomotionProfileManifestV1 | undefined;
  resolveColliderDerivationProfile(
    resourceRef: string,
  ): ColliderDerivationProfileManifestV1 | undefined;
  listSubjectDefinitions(): readonly RegistrySubjectDefinitionV2[];
  listResources(): readonly SubjectRegistryResourceV1[];
}
