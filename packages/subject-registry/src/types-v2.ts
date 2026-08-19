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

export interface SubjectVisualPartDefinitionV1 {
  id: string;
  kind: "primitive";
  shape: CompositionPrimitiveV1;
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
  };
  colliderContribution: "include" | "exclude";
  semanticTags: readonly string[];
}

export interface SubjectSocketDefinitionV1 {
  id: string;
  localTransform: {
    positionMetersXYZ: Vec3;
    rotationEulerRadiansXYZ: Vec3;
  };
  semanticTags: readonly string[];
}

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
  visualParts: readonly SubjectVisualPartDefinitionV1[];
  sockets: readonly SubjectSocketDefinitionV1[];
  colliderPolicy: {
    kind: "derive";
    colliderDerivationProfileRef: string;
  };
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
    groundSpeedMetersPerSecond: number;
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

export type RegistrySubjectDefinitionV2 = WithContentHash<RegistrySubjectDefinitionInputV2>;
export type CapabilityManifestV1 = WithContentHash<CapabilityManifestInputV1>;
export type PhysicsBodyProfileManifestV1 =
  WithContentHash<PhysicsBodyProfileManifestInputV1>;
export type LocomotionProfileManifestV1 = WithContentHash<LocomotionProfileManifestInputV1>;
export type ColliderDerivationProfileManifestV1 =
  WithContentHash<ColliderDerivationProfileManifestInputV1>;

export type SubjectRegistryResourceInputV1 =
  | RegistrySubjectDefinitionInputV2
  | CapabilityManifestInputV1
  | PhysicsBodyProfileManifestInputV1
  | LocomotionProfileManifestInputV1
  | ColliderDerivationProfileManifestInputV1;

export type SubjectRegistryResourceV1 =
  | RegistrySubjectDefinitionV2
  | CapabilityManifestV1
  | PhysicsBodyProfileManifestV1
  | LocomotionProfileManifestV1
  | ColliderDerivationProfileManifestV1;

export interface SubjectResourceRegistryV2 {
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
