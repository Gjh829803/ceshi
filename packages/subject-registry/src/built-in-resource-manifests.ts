import type {
  CapabilityManifestInputV1,
  ColliderDerivationProfileManifestInputV1,
  LocomotionProfileManifestInputV1,
  PhysicsBodyProfileManifestInputV1,
} from "./types-v2";

const GROUND_LOCOMOTION_CAPABILITY: CapabilityManifestInputV1 = {
  kind: "capability",
  id: "locomotion.ground",
  version: 1,
  resourceRef: "worldkit://capability/locomotion.ground@1",
  requiredCapabilityRefs: [],
  providedFeatures: ["ground-locomotion"],
  conflictingCapabilityRefs: [],
  aiMetadata: {
    displayName: "Ground locomotion",
    description: "Moves a controllable subject across supported outdoor ground and water.",
    semanticTags: ["controllable", "ground", "locomotion"],
  },
};

const MEDIUM_CHARACTER_PHYSICS_BODY_PROFILE: PhysicsBodyProfileManifestInputV1 = {
  kind: "physics-body-profile",
  id: "character.medium",
  version: 1,
  resourceRef: "worldkit://physics-body-profile/character.medium@1",
  supportedBodyTopologies: ["biped", "quadruped", "custom"],
  physicsBody: {
    mode: "character",
    massKilograms: 75,
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3,
  },
  aiMetadata: {
    displayName: "Medium character body",
    description: "Standard outdoor character-controller physics for medium-sized subjects.",
    semanticTags: ["character", "medium", "physics"],
  },
};

const STANDARD_GROUND_LOCOMOTION_PROFILE: LocomotionProfileManifestInputV1 = {
  kind: "locomotion-profile",
  id: "ground.standard",
  version: 1,
  resourceRef: "worldkit://locomotion-profile/ground.standard@1",
  requiredCapabilityRefs: ["worldkit://capability/locomotion.ground@1"],
  locomotion: {
    mode: "ground",
    groundSpeedMetersPerSecond: 4,
    waterSpeedMetersPerSecond: 2.2,
    jumpSpeedMetersPerSecond: 5.5,
  },
  aiMetadata: {
    displayName: "Standard ground locomotion",
    description: "Default walking, swimming, and jumping speeds for ground characters.",
    semanticTags: ["ground", "jump", "locomotion", "swim"],
  },
};

const VERTICAL_CHARACTER_CAPSULE_PROFILE: ColliderDerivationProfileManifestInputV1 = {
  kind: "collider-derivation-profile",
  id: "vertical-character-capsule",
  version: 1,
  resourceRef:
    "worldkit://collider-derivation-profile/vertical-character-capsule@1",
  supportedBodyTopologies: ["biped", "quadruped", "custom"],
  colliderDerivation: {
    algorithm: "vertical-character-capsule",
    supportOriginToleranceMeters: 0.01,
    maximumRadiusMeters: 2,
    maximumHeightMeters: 4,
  },
  aiMetadata: {
    displayName: "Vertical character capsule",
    description: "Derives one grounded vertical capsule from included primitive bounds.",
    semanticTags: ["automatic", "capsule", "character", "collider"],
  },
};

export const BUILT_IN_SUBJECT_RESOURCE_MANIFESTS = [
  GROUND_LOCOMOTION_CAPABILITY,
  MEDIUM_CHARACTER_PHYSICS_BODY_PROFILE,
  STANDARD_GROUND_LOCOMOTION_PROFILE,
  VERTICAL_CHARACTER_CAPSULE_PROFILE,
] as const satisfies readonly (
  | CapabilityManifestInputV1
  | PhysicsBodyProfileManifestInputV1
  | LocomotionProfileManifestInputV1
  | ColliderDerivationProfileManifestInputV1
)[];
