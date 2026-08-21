import type {
  AnimationSetManifestInputV1,
  BipedBoneIdV1,
  CapabilityManifestInputV1,
  ColliderProfileManifestInputV1,
  ColliderDerivationProfileManifestInputV1,
  GroundHumanoidActionIdV1,
  LocomotionProfileManifestInputV1,
  PhysicsBodyProfileManifestInputV1,
  RigProfileManifestInputV1,
  SubjectAssetManifestInputV1,
} from "./types-v2";

const GOLDEN_HUMANOID_SUBJECT_ASSET: SubjectAssetManifestInputV1 = {
  kind: "subject-asset",
  id: "humanoid.golden",
  version: 1,
  resourceRef: "worldkit://subject-asset/humanoid.golden@1",
  format: "glb",
  artifact: {
    mediaType: "model/gltf-binary",
    byteLength: 43_656,
    contentHash:
      "sha256:1095fd65c754d53e6db3757ab5e1c9e5e9dcea2581f85d40f37ea4890ee8c2c2",
  },
  coordinateConvention: {
    forwardAxis: "-Z",
    upAxis: "+Y",
    metersPerUnit: 1,
    pivot: "support-center",
  },
  bounds: {
    minimumMetersXYZ: [-0.39, 0, -0.16999999999999998],
    maximumMetersXYZ: [0.39, 1.94, 0.16],
  },
  inventory: {
    meshCount: 1,
    vertexCount: 360,
    triangleCount: 180,
    skeletonCount: 1,
    boneCount: 18,
    animationClipNames: ["idle", "jump", "run", "walk"],
  },
  provenance: {
    licenseSpdxId: "LicenseRef-Project-Owned",
    redistributionPolicy: "allowed",
    author: "Agent Whitebox World SDK",
  },
  aiMetadata: {
    displayName: "Golden rigged humanoid",
    description: "Project-owned deterministic GLB 2.0 fixture for the rigged subject pipeline.",
    semanticTags: ["biped", "golden", "humanoid", "rigged", "whitebox"],
  },
};

const GOLDEN_BIPED_BONE_IDS = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "upper-arm.left",
  "lower-arm.left",
  "hand.left",
  "upper-arm.right",
  "lower-arm.right",
  "hand.right",
  "upper-leg.left",
  "lower-leg.left",
  "foot.left",
  "upper-leg.right",
  "lower-leg.right",
  "foot.right",
] as const satisfies readonly BipedBoneIdV1[];

const GOLDEN_BIPED_RIG_PROFILE: RigProfileManifestInputV1 = {
  kind: "rig-profile",
  id: "biped.golden",
  version: 1,
  resourceRef: "worldkit://rig-profile/biped.golden@1",
  bodyTopology: "biped",
  compatibleSubjectAssetRefs: [GOLDEN_HUMANOID_SUBJECT_ASSET.resourceRef],
  skeletonRootBoneName: "root",
  requiredBoneIds: GOLDEN_BIPED_BONE_IDS,
  sourceNodeNameByBoneId: {
    hips: "hips",
    spine: "spine",
    chest: "chest",
    neck: "neck",
    head: "head",
    "upper-arm.left": "upper-arm.left",
    "lower-arm.left": "lower-arm.left",
    "hand.left": "hand.left",
    "upper-arm.right": "upper-arm.right",
    "lower-arm.right": "lower-arm.right",
    "hand.right": "hand.right",
    "upper-leg.left": "upper-leg.left",
    "lower-leg.left": "lower-leg.left",
    "foot.left": "foot.left",
    "upper-leg.right": "upper-leg.right",
    "lower-leg.right": "lower-leg.right",
    "foot.right": "foot.right",
  },
  aiMetadata: {
    displayName: "Golden biped rig",
    description:
      "Canonical 17-bone anatomical mapping with an independent Skeleton root for the project-owned Golden humanoid fixture.",
    semanticTags: ["biped", "golden", "humanoid", "rig"],
  },
};

const GOLDEN_GROUND_ANIMATION_SET: AnimationSetManifestInputV1 = {
  kind: "animation-set",
  id: "humanoid.ground.golden",
  version: 1,
  resourceRef: "worldkit://animation-set/humanoid.ground.golden@1",
  subjectAssetRef: GOLDEN_HUMANOID_SUBJECT_ASSET.resourceRef,
  rigProfileRef: GOLDEN_BIPED_RIG_PROFILE.resourceRef,
  defaultActionId: "idle",
  requiredActionIds: ["idle", "walk", "run", "jump"],
  animationBindings: [
    {
      actionId: "idle",
      sourceClipName: "idle",
      loopMode: "repeat",
      playbackSpeedRatio: 1,
      blendDurationSeconds: 0.2,
      rootMotionMode: "in-place",
    },
    {
      actionId: "walk",
      sourceClipName: "walk",
      loopMode: "repeat",
      playbackSpeedRatio: 1,
      blendDurationSeconds: 0.2,
      rootMotionMode: "in-place",
    },
    {
      actionId: "run",
      sourceClipName: "run",
      loopMode: "repeat",
      playbackSpeedRatio: 1,
      blendDurationSeconds: 0.15,
      rootMotionMode: "in-place",
    },
    {
      actionId: "jump",
      sourceClipName: "jump",
      loopMode: "once",
      playbackSpeedRatio: 1,
      blendDurationSeconds: 0.1,
      rootMotionMode: "in-place",
    },
  ],
  aiMetadata: {
    displayName: "Golden humanoid ground animations",
    description: "Explicit in-place idle, walk, run, and jump mappings for the Golden rig.",
    semanticTags: ["animation", "golden", "ground", "humanoid"],
  },
};

const G_BOT_SUBJECT_ASSET: SubjectAssetManifestInputV1 = {
  kind: "subject-asset",
  id: "actor.humanoid.g-bot",
  version: 1,
  resourceRef: "worldkit://subject-asset/actor.humanoid.g-bot@1",
  format: "glb",
  artifact: {
    mediaType: "model/gltf-binary",
    byteLength: 5_302_160,
    contentHash:
      "sha256:41833210e735788da0777fc37badcec03f90ccf17ab5a7d89103f0727abeeb1b",
  },
  coordinateConvention: {
    forwardAxis: "-Z",
    upAxis: "+Y",
    metersPerUnit: 1,
    pivot: "support-center",
  },
  bounds: {
    minimumMetersXYZ: [-0.9025661945343018, -0.0003511549439281225, -0.14895710349082947],
    maximumMetersXYZ: [0.9025658369064331, 1.8088831901550293, 0.17174167931079865],
  },
  inventory: {
    meshCount: 2,
    vertexCount: 28_374,
    triangleCount: 49_112,
    skeletonCount: 1,
    boneCount: 65,
    animationClipCount: 25,
    animationClipNames: [
      "idle",
      "idle.gaming",
      "walk",
      "walk.step",
      "run",
      "jump",
      "fall",
      "land.hard",
      "land.hard.alt",
      "fly",
      "float",
      "swim.surface",
      "swim.tread",
      "swim.exit",
      "sit",
      "sit.idle",
      "sit.ground.idle",
      "sit.toStand",
      "stand",
      "lay.idle",
      "roll.toRun",
      "fight.enter",
      "emote.salute",
      "emote.angry",
      "dance.rumba",
    ],
  },
  provenance: {
    licenseSpdxId: "LicenseRef-Loopit-Company-Private",
    redistributionPolicy: "internal-only",
    author: "Loopit asset team",
  },
  runtimeReadiness: {
    productionReady: false,
    runtimeStateBinding: "not-implemented",
  },
  aiMetadata: {
    displayName: "G Bot Golden",
    description: "Project-owned Mixamo-rigged G Bot with twenty-five art-ready semantic animation clips; runtime state binding is not implemented.",
    semanticTags: ["biped", "g-bot", "humanoid", "rigged"],
  },
};

const G_BOT_MIXAMO_RIG_PROFILE: RigProfileManifestInputV1 = {
  kind: "rig-profile",
  id: "biped.mixamo-g-bot",
  version: 1,
  resourceRef: "worldkit://rig-profile/biped.mixamo-g-bot@1",
  bodyTopology: "biped",
  compatibleSubjectAssetRefs: [G_BOT_SUBJECT_ASSET.resourceRef],
  skeletonRootBoneName: "mixamorig:Hips",
  requiredBoneIds: GOLDEN_BIPED_BONE_IDS,
  sourceNodeNameByBoneId: {
    hips: "mixamorig:Hips",
    spine: "mixamorig:Spine",
    chest: "mixamorig:Spine2",
    neck: "mixamorig:Neck",
    head: "mixamorig:Head",
    "upper-arm.left": "mixamorig:LeftArm",
    "lower-arm.left": "mixamorig:LeftForeArm",
    "hand.left": "mixamorig:LeftHand",
    "upper-arm.right": "mixamorig:RightArm",
    "lower-arm.right": "mixamorig:RightForeArm",
    "hand.right": "mixamorig:RightHand",
    "upper-leg.left": "mixamorig:LeftUpLeg",
    "lower-leg.left": "mixamorig:LeftLeg",
    "foot.left": "mixamorig:LeftFoot",
    "upper-leg.right": "mixamorig:RightUpLeg",
    "lower-leg.right": "mixamorig:RightLeg",
    "foot.right": "mixamorig:RightFoot",
  },
  aiMetadata: {
    displayName: "G Bot Mixamo Humanoid Rig",
    description: "Semantic biped mapping for the G Bot Mixamo skeleton.",
    semanticTags: ["biped", "g-bot", "mixamo", "rig"]
  },
};

const G_BOT_ACTION_BINDINGS = [
  ["idle", "repeat", 0.2],
  ["idle.gaming", "repeat", 0.2],
  ["walk", "repeat", 0.15],
  ["walk.step", "once", 0.12],
  ["run", "repeat", 0.12],
  ["jump", "once", 0.1],
  ["fall", "repeat", 0.12],
  ["land.hard", "once", 0.08],
  ["land.hard.alt", "once", 0.08],
  ["fly", "repeat", 0.18],
  ["float", "repeat", 0.2],
  ["swim.surface", "repeat", 0.18],
  ["swim.tread", "repeat", 0.2],
  ["swim.exit", "once", 0.15],
  ["sit", "once", 0.2],
  ["sit.idle", "repeat", 0.2],
  ["sit.ground.idle", "repeat", 0.2],
  ["sit.toStand", "once", 0.15],
  ["stand", "once", 0.18],
  ["lay.idle", "repeat", 0.2],
  ["roll.toRun", "once", 0.08],
  ["fight.enter", "once", 0.12],
  ["emote.salute", "once", 0.15],
  ["emote.angry", "once", 0.15],
  ["dance.rumba", "repeat", 0.2],
] as const satisfies readonly [
  GroundHumanoidActionIdV1,
  "repeat" | "once",
  number,
][];

const G_BOT_GROUND_ANIMATION_SET: AnimationSetManifestInputV1 = {
  kind: "animation-set",
  id: "humanoid.ground.g-bot",
  version: 1,
  resourceRef: "worldkit://animation-set/humanoid.ground.g-bot@1",
  subjectAssetRef: G_BOT_SUBJECT_ASSET.resourceRef,
  rigProfileRef: G_BOT_MIXAMO_RIG_PROFILE.resourceRef,
  defaultActionId: "idle",
  requiredActionIds: G_BOT_ACTION_BINDINGS.map(([actionId]) => actionId),
  animationBindings: G_BOT_ACTION_BINDINGS.map(
    ([actionId, loopMode, blendDurationSeconds]) => ({
      actionId,
      sourceClipName: actionId,
      loopMode,
      playbackSpeedRatio: 1,
      blendDurationSeconds,
      rootMotionMode: "in-place" as const,
    }),
  ),
  aiMetadata: {
    displayName: "G Bot ground and contextual animations",
    description:
      "Twenty-five explicit in-place semantic mappings for the canonical G Bot asset; automatic runtime state selection remains separate.",
    semanticTags: ["animation", "g-bot", "ground", "humanoid"],
  },
};

const MEDIUM_HUMANOID_CAPSULE_PROFILE: ColliderProfileManifestInputV1 = {
  kind: "collider-profile",
  id: "humanoid.medium-capsule",
  version: 1,
  resourceRef: "worldkit://collider-profile/humanoid.medium-capsule@1",
  supportedBodyTopologies: ["biped"],
  collider: {
    kind: "capsule",
    radiusMeters: 0.32,
    heightMeters: 1.92,
    centerOffsetFromSubjectOriginMetersXYZ: [0, 0.96, 0],
  },
  aiMetadata: {
    displayName: "Medium humanoid capsule",
    description: "Explicit support-centered capsule for a medium biped character.",
    semanticTags: ["biped", "capsule", "character", "collider", "medium"],
  },
};

const G_BOT_CAPSULE_PROFILE: ColliderProfileManifestInputV1 = {
  kind: "collider-profile",
  id: "humanoid.g-bot-capsule",
  version: 1,
  resourceRef: "worldkit://collider-profile/humanoid.g-bot-capsule@1",
  supportedBodyTopologies: ["biped"],
  collider: {
    kind: "capsule",
    radiusMeters: 0.35,
    heightMeters: 1.8,
    centerOffsetFromSubjectOriginMetersXYZ: [0, 0.9, 0],
  },
  aiMetadata: {
    displayName: "G Bot capsule",
    description: "Product-approved support-centered Capsule for the G Bot humanoid.",
    semanticTags: ["biped", "capsule", "character", "g-bot"],
  },
};

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
  allowWalk: true,
  allowRun: true,
  allowJump: true,
  aiMetadata: {
    displayName: "Standard ground locomotion",
    description: "Default walking, running, and jumping capability flags for ground characters.",
    semanticTags: ["ground", "jump", "locomotion", "run", "walk"],
  },
};

const CAPABILITY_CHARACTER_PHYSICS_BODY_PROFILE: PhysicsBodyProfileManifestInputV1 = {
  kind: "physics-body-profile",
  id: "character.capability-medium",
  version: 1,
  resourceRef: "worldkit://physics-body-profile/character.capability-medium@1",
  supportedBodyTopologies: [
    "biped",
    "quadruped",
    "four-wheel",
    "surface-craft",
    "watercraft",
    "glider",
    "composite",
    "custom",
  ],
  physicsBody: {
    mode: "character",
    massKilograms: 75,
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3,
  },
  aiMetadata: {
    displayName: "Capability subject body",
    description: "Shared character-controller body adapter for capability-driven whitebox subjects.",
    semanticTags: ["capability-driven", "character", "physics"],
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

const CAPABILITY_VERTICAL_CAPSULE_PROFILE: ColliderDerivationProfileManifestInputV1 = {
  kind: "collider-derivation-profile",
  id: "vertical-capability-capsule",
  version: 1,
  resourceRef:
    "worldkit://collider-derivation-profile/vertical-capability-capsule@1",
  supportedBodyTopologies: [
    "biped",
    "quadruped",
    "four-wheel",
    "surface-craft",
    "watercraft",
    "glider",
    "composite",
    "custom",
  ],
  colliderDerivation: {
    algorithm: "vertical-character-capsule",
    supportOriginToleranceMeters: 0.01,
    maximumRadiusMeters: 2,
    maximumHeightMeters: 4,
  },
  aiMetadata: {
    displayName: "Vertical capability capsule",
    description: "Derives one bounded capsule for capability-driven whitebox subjects.",
    semanticTags: ["automatic", "capability-driven", "capsule", "collider"],
  },
};

export const BUILT_IN_SUBJECT_RESOURCE_MANIFESTS = [
  GOLDEN_HUMANOID_SUBJECT_ASSET,
  GOLDEN_BIPED_RIG_PROFILE,
  GOLDEN_GROUND_ANIMATION_SET,
  G_BOT_SUBJECT_ASSET,
  G_BOT_MIXAMO_RIG_PROFILE,
  G_BOT_GROUND_ANIMATION_SET,
  MEDIUM_HUMANOID_CAPSULE_PROFILE,
  G_BOT_CAPSULE_PROFILE,
  GROUND_LOCOMOTION_CAPABILITY,
  MEDIUM_CHARACTER_PHYSICS_BODY_PROFILE,
  CAPABILITY_CHARACTER_PHYSICS_BODY_PROFILE,
  STANDARD_GROUND_LOCOMOTION_PROFILE,
  VERTICAL_CHARACTER_CAPSULE_PROFILE,
  CAPABILITY_VERTICAL_CAPSULE_PROFILE,
] as const satisfies readonly (
  | SubjectAssetManifestInputV1
  | RigProfileManifestInputV1
  | AnimationSetManifestInputV1
  | ColliderProfileManifestInputV1
  | CapabilityManifestInputV1
  | PhysicsBodyProfileManifestInputV1
  | LocomotionProfileManifestInputV1
  | ColliderDerivationProfileManifestInputV1
)[];
