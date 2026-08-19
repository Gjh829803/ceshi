import type { RegistrySubjectDefinitionInputV2 } from "./types-v2";

const SHARED_COORDINATE_CONVENTION = {
  forwardAxis: "-Z",
  upAxis: "+Y",
  metersPerUnit: 1,
  pivot: "support-center",
} as const;

const SHARED_COLLIDER_POLICY = {
  kind: "derive",
  colliderDerivationProfileRef:
    "worldkit://collider-derivation-profile/vertical-character-capsule@1",
} as const;

const SHARED_CAPABILITY_REFS = ["worldkit://capability/locomotion.ground@1"] as const;

const SHARED_PROFILES = {
  physicsBodyProfileRef: "worldkit://physics-body-profile/character.medium@1",
  locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
} as const;

const HUMANOID_THIRD_PERSON_DEFINITION: RegistrySubjectDefinitionInputV2 = {
  kind: "subject-definition",
  id: "humanoid.third-person",
  version: 1,
  resourceRef: "worldkit://subject-definition/humanoid.third-person@1",
  category: "human",
  bodyTopology: "biped",
  semanticClassId: "subject.humanoid",
  coordinateConvention: SHARED_COORDINATE_CONVENTION,
  visualParts: [
    {
      id: "body",
      kind: "primitive",
      shape: { kind: "capsule", radiusMeters: 0.35, heightMeters: 1.8 },
      localTransform: {
        positionMetersXYZ: [0, 0.9, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      colliderContribution: "include",
      semanticTags: ["body"],
    },
  ],
  sockets: [
    {
      id: "hand.right",
      localTransform: {
        positionMetersXYZ: [0.42, 1.1, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      semanticTags: ["equipment-grip", "hand"],
    },
  ],
  colliderPolicy: SHARED_COLLIDER_POLICY,
  capabilityRefs: SHARED_CAPABILITY_REFS,
  profiles: SHARED_PROFILES,
  aiMetadata: {
    displayName: "Third-person humanoid",
    description: "A controllable humanoid whitebox proxy for outdoor traversal.",
    semanticTags: ["biped", "ground", "human", "third-person"],
  },
};

const QUADRUPED_GROUND_PROXY_DEFINITION: RegistrySubjectDefinitionInputV2 = {
  kind: "subject-definition",
  id: "quadruped.ground-proxy",
  version: 1,
  resourceRef: "worldkit://subject-definition/quadruped.ground-proxy@1",
  category: "animal",
  bodyTopology: "quadruped",
  semanticClassId: "subject.animal.quadruped",
  coordinateConvention: SHARED_COORDINATE_CONVENTION,
  visualParts: [
    {
      id: "torso",
      kind: "primitive",
      shape: { kind: "box", sizeMetersXYZ: [0.8, 0.7, 1.5] },
      localTransform: {
        positionMetersXYZ: [0, 0.85, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      colliderContribution: "include",
      semanticTags: ["body", "torso"],
    },
    {
      id: "head",
      kind: "primitive",
      shape: { kind: "box", sizeMetersXYZ: [0.55, 0.55, 0.65] },
      localTransform: {
        positionMetersXYZ: [0, 1, -0.9],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      colliderContribution: "include",
      semanticTags: ["head"],
    },
    {
      id: "leg.front-left",
      kind: "primitive",
      shape: { kind: "cylinder", radiusMeters: 0.11, heightMeters: 0.7 },
      localTransform: {
        positionMetersXYZ: [-0.28, 0.35, -0.48],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      colliderContribution: "include",
      semanticTags: ["front", "leg", "left"],
    },
    {
      id: "leg.front-right",
      kind: "primitive",
      shape: { kind: "cylinder", radiusMeters: 0.11, heightMeters: 0.7 },
      localTransform: {
        positionMetersXYZ: [0.28, 0.35, -0.48],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      colliderContribution: "include",
      semanticTags: ["front", "leg", "right"],
    },
    {
      id: "leg.back-left",
      kind: "primitive",
      shape: { kind: "cylinder", radiusMeters: 0.11, heightMeters: 0.7 },
      localTransform: {
        positionMetersXYZ: [-0.28, 0.35, 0.48],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      colliderContribution: "include",
      semanticTags: ["back", "leg", "left"],
    },
    {
      id: "leg.back-right",
      kind: "primitive",
      shape: { kind: "cylinder", radiusMeters: 0.11, heightMeters: 0.7 },
      localTransform: {
        positionMetersXYZ: [0.28, 0.35, 0.48],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      colliderContribution: "include",
      semanticTags: ["back", "leg", "right"],
    },
    {
      id: "tail",
      kind: "primitive",
      shape: { kind: "cylinder", radiusMeters: 0.08, heightMeters: 0.7 },
      localTransform: {
        positionMetersXYZ: [0, 0.9, 0.95],
        rotationEulerRadiansXYZ: [Math.PI / 3, 0, 0],
      },
      colliderContribution: "exclude",
      semanticTags: ["tail"],
    },
  ],
  sockets: [
    {
      id: "seat.mount",
      localTransform: {
        positionMetersXYZ: [0, 1.3, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      semanticTags: ["mount-seat"],
    },
  ],
  colliderPolicy: SHARED_COLLIDER_POLICY,
  capabilityRefs: SHARED_CAPABILITY_REFS,
  profiles: SHARED_PROFILES,
  aiMetadata: {
    displayName: "Ground quadruped proxy",
    description: "A controllable quadruped whitebox proxy for outdoor traversal tests.",
    semanticTags: ["animal", "ground", "quadruped"],
  },
};

export const BUILT_IN_SUBJECT_DEFINITIONS = [
  HUMANOID_THIRD_PERSON_DEFINITION,
  QUADRUPED_GROUND_PROXY_DEFINITION,
] as const satisfies readonly RegistrySubjectDefinitionInputV2[];
