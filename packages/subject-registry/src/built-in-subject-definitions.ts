import type { RegistrySubjectDefinitionInputV3 } from "./types-v3";

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

const SHARED_GROUND_FEEL_PROFILE_REF =
  "worldkit://control-feel-profile/humanoid.medium-ground@1" as const;

const SHARED_GROUND_ALLOWED_CONTROL_FEEL_PROFILE_REFS = [
  "worldkit://control-feel-profile/humanoid.medium-ground@1",
  "worldkit://control-feel-profile/humanoid.heavy-ground@1",
] as const;

const SHARED_GROUND_MEDIUM_PROFILE_REF =
  "worldkit://medium-profile/ground-air.standard@1" as const;

const SHARED_PROFILES = {
  physicsBodyProfileRef: "worldkit://physics-body-profile/character.medium@1",
  locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
  controlFeelProfileRef: SHARED_GROUND_FEEL_PROFILE_REF,
} as const;

const HUMANOID_THIRD_PERSON_DEFINITION: RegistrySubjectDefinitionInputV3 = {
  kind: "subject-definition",
  schemaVersion: 3,
  id: "humanoid.third-person",
  version: 1,
  resourceRef: "worldkit://subject-definition/humanoid.third-person@1",
  authoringAvailability: "recommended",
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
  visualBinding: { mode: "static" },
  sockets: [
    {
      id: "hand.right",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0.42, 1.1, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      semanticTags: ["equipment-grip", "hand"],
    },
  ],
  colliderPolicy: {
    kind: "profile",
    colliderProfileRef:
      "worldkit://collider-profile/humanoid.medium-capsule@1",
  },
  capabilityRefs: SHARED_CAPABILITY_REFS,
  profiles: {
    physicsBodyProfileRef:
      "worldkit://physics-body-profile/character.capability-medium@1",
    locomotionProfileRef: SHARED_PROFILES.locomotionProfileRef,
    controlFeelProfileRef: SHARED_GROUND_FEEL_PROFILE_REF,
    allowedControlFeelProfileRefs: SHARED_GROUND_ALLOWED_CONTROL_FEEL_PROFILE_REFS,
    motion: {
      defaultMotionProfileRef:
        "worldkit://motion-profile/free-ground.humanoid-medium@1",
      optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
      fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
    },
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    cameraContextProfileRef:
      "worldkit://camera-context/capability-driven.default@1",
    mediumProfileRef: SHARED_GROUND_MEDIUM_PROFILE_REF,
    harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
  },
  relationshipCapabilityRefs: [],
  actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
  renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
  aiMetadata: {
    displayName: "Third-person humanoid",
    description: "A controllable humanoid whitebox proxy for outdoor traversal.",
    semanticTags: ["biped", "ground", "human", "third-person"],
  },
};

const QUADRUPED_GROUND_PROXY_DEFINITION: RegistrySubjectDefinitionInputV3 = {
  kind: "subject-definition",
  schemaVersion: 3,
  id: "quadruped.ground-proxy",
  version: 1,
  resourceRef: "worldkit://subject-definition/quadruped.ground-proxy@1",
  authoringAvailability: "advanced",
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
  visualBinding: { mode: "static" },
  sockets: [
    {
      id: "seat.mount",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0, 1.3, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      semanticTags: ["mount-seat"],
    },
  ],
  colliderPolicy: SHARED_COLLIDER_POLICY,
  capabilityRefs: SHARED_CAPABILITY_REFS,
  profiles: {
    physicsBodyProfileRef:
      "worldkit://physics-body-profile/character.capability-medium@1",
    locomotionProfileRef: SHARED_PROFILES.locomotionProfileRef,
    controlFeelProfileRef: SHARED_GROUND_FEEL_PROFILE_REF,
    allowedControlFeelProfileRefs: SHARED_GROUND_ALLOWED_CONTROL_FEEL_PROFILE_REFS,
    motion: {
      defaultMotionProfileRef:
        "worldkit://motion-profile/free-ground.humanoid-medium@1",
      optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
      fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
    },
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    cameraContextProfileRef:
      "worldkit://camera-context/capability-driven.default@1",
    mediumProfileRef: SHARED_GROUND_MEDIUM_PROFILE_REF,
    harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
  },
  relationshipCapabilityRefs: [],
  actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
  renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
  aiMetadata: {
    displayName: "Ground quadruped proxy",
    description: "A controllable quadruped whitebox proxy for outdoor traversal tests.",
    semanticTags: ["animal", "ground", "quadruped"],
  },
};

const RIGGED_GOLDEN_HUMANOID_DEFINITION: RegistrySubjectDefinitionInputV3 = {
  kind: "subject-definition",
  schemaVersion: 3,
  id: "humanoid.rigged-golden",
  version: 2,
  resourceRef: "worldkit://subject-definition/humanoid.rigged-golden@2",
  authoringAvailability: "recommended",
  category: "human",
  bodyTopology: "biped",
  semanticClassId: "subject.humanoid.rigged",
  coordinateConvention: SHARED_COORDINATE_CONVENTION,
  visualParts: [
    {
      id: "body.asset",
      kind: "asset",
      subjectAssetRef: "worldkit://subject-asset/humanoid.golden@2",
      localTransform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
      appearance: { mode: "whitebox-neutral" },
      semanticTags: ["body", "golden", "rigged"],
    },
  ],
  visualBinding: {
    mode: "rigged",
    rigProfileRef: "worldkit://rig-profile/biped.golden@2",
    animationSetRef: "worldkit://animation-set/humanoid.ground.golden@2",
  },
  sockets: [
    {
      id: "hand.right",
      kind: "bone",
      boneId: "hand.right",
      offsetTransform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      semanticTags: ["equipment-grip", "hand"],
    },
  ],
  colliderPolicy: {
    kind: "profile",
    colliderProfileRef:
      "worldkit://collider-profile/humanoid.medium-capsule@1",
  },
  capabilityRefs: SHARED_CAPABILITY_REFS,
  profiles: {
    physicsBodyProfileRef: SHARED_PROFILES.physicsBodyProfileRef,
    locomotionProfileRef: SHARED_PROFILES.locomotionProfileRef,
    controlFeelProfileRef: SHARED_GROUND_FEEL_PROFILE_REF,
    allowedControlFeelProfileRefs: SHARED_GROUND_ALLOWED_CONTROL_FEEL_PROFILE_REFS,
    motion: {
      defaultMotionProfileRef:
        "worldkit://motion-profile/free-ground.humanoid-medium@1",
      optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
      fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
    },
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    cameraContextProfileRef:
      "worldkit://camera-context/capability-driven.default@1",
    mediumProfileRef: SHARED_GROUND_MEDIUM_PROFILE_REF,
    harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
  },
  relationshipCapabilityRefs: [],
  actionOrPoseSetRef: "worldkit://animation-set/humanoid.ground.golden@2",
  renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
  aiMetadata: {
    displayName: "Rigged Golden humanoid",
    description: "Project-owned rigged humanoid for the complete asset Subject pipeline.",
    semanticTags: ["biped", "golden", "human", "rigged"],
  },
};

export const G_BOT_HUMANOID_DEFINITION: RegistrySubjectDefinitionInputV3 = {
  kind: "subject-definition",
  schemaVersion: 3,
  id: "humanoid.g-bot",
  version: 2,
  resourceRef: "worldkit://subject-definition/humanoid.g-bot@2",
  authoringAvailability: "recommended",
  category: "human",
  bodyTopology: "biped",
  semanticClassId: "subject.humanoid.robot",
  coordinateConvention: SHARED_COORDINATE_CONVENTION,
  visualParts: [
    {
      id: "body.asset",
      kind: "asset",
      subjectAssetRef: "worldkit://subject-asset/actor.humanoid.g-bot@2",
      localTransform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, Math.PI, 0],
        scaleXYZ: [1, 1, 1],
      },
      appearance: { mode: "whitebox-neutral" },
      semanticTags: ["body", "g-bot", "rigged", "robot"],
    },
  ],
  visualBinding: {
    mode: "rigged",
    rigProfileRef: "worldkit://rig-profile/biped.mixamo-g-bot@2",
    animationSetRef: "worldkit://animation-set/humanoid.ground.g-bot@2",
  },
  sockets: [
    {
      id: "FirstPersonView",
      kind: "bone",
      boneId: "head",
      offsetTransform: {
        positionMetersXYZ: [0, 0.09, -0.08],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      semanticTags: ["camera", "first-person"],
    },
    {
      id: "ThirdPersonTarget",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0, 1.25, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      semanticTags: ["camera", "third-person"],
    },
    {
      id: "CameraTarget3D",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0, 1.2, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      semanticTags: ["camera", "target"],
    },
    {
      id: "LookAhead",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0, 1.1, -1],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      semanticTags: ["camera", "look-ahead"],
    },
    {
      id: "SeatAlignment",
      kind: "local",
      localTransform: {
        positionMetersXYZ: [0, 0.9, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      semanticTags: ["relationship", "seat"],
    },
    {
      id: "hand.right",
      kind: "bone",
      boneId: "hand.right",
      offsetTransform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      semanticTags: ["equipment-grip", "hand"],
    },
  ],
  colliderPolicy: {
    kind: "profile",
    colliderProfileRef:
      "worldkit://collider-profile/humanoid.g-bot-capsule@1",
  },
  capabilityRefs: SHARED_CAPABILITY_REFS,
  profiles: {
    physicsBodyProfileRef:
      "worldkit://physics-body-profile/character.capability-medium@1",
    locomotionProfileRef: SHARED_PROFILES.locomotionProfileRef,
    controlFeelProfileRef: SHARED_GROUND_FEEL_PROFILE_REF,
    allowedControlFeelProfileRefs: SHARED_GROUND_ALLOWED_CONTROL_FEEL_PROFILE_REFS,
    motion: {
      defaultMotionProfileRef:
        "worldkit://motion-profile/free-ground.humanoid-medium@1",
      optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
      fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
    },
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    cameraContextProfileRef:
      "worldkit://camera-context/capability-driven.default@1",
    mediumProfileRef: SHARED_GROUND_MEDIUM_PROFILE_REF,
    harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
  },
  relationshipCapabilityRefs: [],
  actionOrPoseSetRef: "worldkit://animation-set/humanoid.ground.g-bot@2",
  renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
  aiMetadata: {
    displayName: "G Bot humanoid",
    description:
      "Product-authored rigged G Bot assembled with canonical ground control and physics profiles.",
    semanticTags: ["biped", "g-bot", "human", "product", "rigged", "robot"],
  },
};

export const BUILT_IN_SUBJECT_DEFINITIONS = [
  G_BOT_HUMANOID_DEFINITION,
  RIGGED_GOLDEN_HUMANOID_DEFINITION,
  HUMANOID_THIRD_PERSON_DEFINITION,
  QUADRUPED_GROUND_PROXY_DEFINITION,
] as const satisfies readonly RegistrySubjectDefinitionInputV3[];
