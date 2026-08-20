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
  "root",
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
  skeletonRootNodeName: "root",
  requiredBoneIds: GOLDEN_BIPED_BONE_IDS,
  sourceNodeNameByBoneId: {
    root: "root",
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
    description: "Canonical 18-bone mapping for the project-owned Golden humanoid fixture.",
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
    byteLength: 3_362_888,
    contentHash:
      "sha256:74bbf9426577caa1b7e808bf388bd9a6b8b48d50cc80ab7b0abef10c2693c286",
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
    animationClipNames: [
      "idle",
      "walk",
      "run",
      "jump",
      "fall",
      "float",
      "swim.surface",
      "swim.tread",
      "sit",
      "sit.idle",
      "stand",
      "swim.exit",
    ],
  },
  provenance: {
    licenseSpdxId: "LicenseRef-Loopit-Company-Private",
    redistributionPolicy: "internal-only",
    author: "Loopit asset team",
  },
  aiMetadata: {
    displayName: "G Bot Golden",
    description: "Project-owned Mixamo-rigged G Bot with twelve semantic animation clips.",
    semanticTags: ["biped", "g-bot", "humanoid", "rigged"],
  },
};

const G_BOT_RIG_PROFILE: RigProfileManifestInputV1 = {
  kind: "rig-profile",
  id: "mixamo-humanoid.g-bot",
  version: 1,
  resourceRef: "worldkit://rig-profile/mixamo-humanoid.g-bot@1",
  bodyTopology: "biped",
  compatibleSubjectAssetRefs: [G_BOT_SUBJECT_ASSET.resourceRef],
  skeletonRootNodeName: "mixamorig:Hips",
  requiredBoneIds: GOLDEN_BIPED_BONE_IDS.filter((boneId) => boneId !== "root"),
  sourceNodeNameByBoneId: {
    root: "mixamorig:Hips",
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
  ["walk", "repeat", 0.15],
  ["run", "repeat", 0.12],
  ["jump", "once", 0.1],
  ["fall", "repeat", 0.12],
  ["float", "repeat", 0.2],
  ["swim.surface", "repeat", 0.18],
  ["swim.tread", "repeat", 0.2],
  ["sit", "once", 0.2],
  ["sit.idle", "repeat", 0.2],
  ["stand", "once", 0.18],
  ["swim.exit", "once", 0.15],
] as const satisfies readonly [
  GroundHumanoidActionIdV1,
  "repeat" | "once",
  number,
][];

const G_BOT_ALL_ACTIONS: AnimationSetManifestInputV1 = {
  kind: "animation-set",
  id: "humanoid.g-bot.all",
  version: 1,
  resourceRef: "worldkit://animation-set/humanoid.g-bot.all@1",
  subjectAssetRef: G_BOT_SUBJECT_ASSET.resourceRef,
  rigProfileRef: G_BOT_RIG_PROFILE.resourceRef,
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
    displayName: "G Bot Complete Action Set",
    description: "Twelve explicit in-place semantic action mappings for G Bot.",
    semanticTags: ["animation", "g-bot", "humanoid"]
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
    walkSpeedMetersPerSecond: 2.4,
    runSpeedMetersPerSecond: 4,
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
    displayName: "Vertical character capsule",
    description: "Derives one grounded vertical capsule from included primitive bounds.",
    semanticTags: ["automatic", "capsule", "character", "collider"],
  },
};

export const BUILT_IN_SUBJECT_RESOURCE_MANIFESTS = [
  GOLDEN_HUMANOID_SUBJECT_ASSET,
  GOLDEN_BIPED_RIG_PROFILE,
  GOLDEN_GROUND_ANIMATION_SET,
  G_BOT_SUBJECT_ASSET,
  G_BOT_RIG_PROFILE,
  G_BOT_ALL_ACTIONS,
  MEDIUM_HUMANOID_CAPSULE_PROFILE,
  GROUND_LOCOMOTION_CAPABILITY,
  MEDIUM_CHARACTER_PHYSICS_BODY_PROFILE,
  STANDARD_GROUND_LOCOMOTION_PROFILE,
  VERTICAL_CHARACTER_CAPSULE_PROFILE,
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
