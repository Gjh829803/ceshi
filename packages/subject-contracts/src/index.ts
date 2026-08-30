export const SUBJECT_RESOURCE_KINDS_V1 = Object.freeze([
  "subject-definition",
  "subject-asset",
  "rig-profile",
  "animation-set",
  "collider-profile",
  "capability",
  "physics-body-profile",
  "locomotion-profile",
  "control-feel-profile",
  "collider-derivation-profile",
  "motion-kernel",
  "motion-profile",
  "control-profile",
  "camera-rig-algorithm",
  "camera-rig-profile",
  "camera-modifier-profile",
  "camera-context-profile",
  "medium-profile",
  "relationship-profile",
  "harness-profile",
  "pose-set-profile",
  "render-binding-profile",
  "ai-schema-projection-profile",
] as const);

export type SubjectResourceKindV1 = typeof SUBJECT_RESOURCE_KINDS_V1[number];

export const GROUND_HUMANOID_ACTION_IDS_V1 = Object.freeze([
  "idle",
  "idle.gaming",
  "walk",
  "walk.step",
  "run",
  "jump",
  "jump.small.takeoff",
  "jump.small.airborne",
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
] as const);

export type GroundHumanoidActionIdV1 =
  typeof GROUND_HUMANOID_ACTION_IDS_V1[number];

export const HUMANOID_ANIMATION_SEMANTIC_FAMILIES_V1 = Object.freeze([
  "ground",
  "airborne",
  "flight",
  "water",
  "posture",
  "combat",
  "emote",
  "dance",
] as const);

export type HumanoidAnimationSemanticFamilyV1 =
  typeof HUMANOID_ANIMATION_SEMANTIC_FAMILIES_V1[number];

export const AUTOMATIC_LOCOMOTION_PRESENTATION_KEYS_V1 = Object.freeze([
  "locomotion.suspended",
  "locomotion.idle",
  "locomotion.walk",
  "locomotion.run",
  "locomotion.takeoff",
  "locomotion.rising",
  "locomotion.apex",
  "locomotion.falling",
  "locomotion.landing",
  "locomotion.small-jump.takeoff",
  "locomotion.small-jump.airborne",
] as const);

export type AutomaticLocomotionPresentationKeyV1 =
  typeof AUTOMATIC_LOCOMOTION_PRESENTATION_KEYS_V1[number];

export const BIPED_BONE_IDS_V1 = Object.freeze([
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
] as const);

export type BipedBoneIdV1 = typeof BIPED_BONE_IDS_V1[number];

export const SUBJECT_BODY_TOPOLOGIES_V2 = Object.freeze([
  "biped",
  "quadruped",
  "four-wheel",
  "surface-craft",
  "watercraft",
  "glider",
  "composite",
  "custom",
] as const);

export type SubjectBodyTopologyV2 = typeof SUBJECT_BODY_TOPOLOGIES_V2[number];

function includesSerializedTerm<Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return typeof value === "string" && values.includes(value as Values[number]);
}

export function isSubjectResourceKindV1(
  value: unknown,
): value is SubjectResourceKindV1 {
  return includesSerializedTerm(SUBJECT_RESOURCE_KINDS_V1, value);
}

export function isGroundHumanoidActionIdV1(
  value: unknown,
): value is GroundHumanoidActionIdV1 {
  return includesSerializedTerm(GROUND_HUMANOID_ACTION_IDS_V1, value);
}

export function isBipedBoneIdV1(value: unknown): value is BipedBoneIdV1 {
  return includesSerializedTerm(BIPED_BONE_IDS_V1, value);
}

export function isSubjectBodyTopologyV2(
  value: unknown,
): value is SubjectBodyTopologyV2 {
  return includesSerializedTerm(SUBJECT_BODY_TOPOLOGIES_V2, value);
}

/**
 * Numeric tuning against one exact, content-addressed Registry profile.
 * Consumers validate the closed value map against the locked profile.
 */
export interface NumericProfileOverrideV1 {
  baseResourceRef: string;
  baseContentHash: string;
  values: Readonly<Record<string, number>>;
}

export interface SubjectPresetResourceLockEntryV1 {
  resourceRef: string;
  resourceKind: SubjectResourceKindV1;
  version: number;
  contentHash: string;
}

export interface SubjectPresetClosureV1 {
  subjectDefinitionId: string;
  subjectDefinitionRef: string;
  subjectDefinitionContentHash: string;
  entries: readonly SubjectPresetResourceLockEntryV1[];
  contentHash: string;
}

export interface SubjectPublicDefaultV1 {
  subjectDefinitionId: string;
  subjectDefinitionRef: string;
  subjectDefinitionContentHash: string;
}

export interface SubjectPresetBaselineV1 {
  closure: SubjectPresetClosureV1;
  defaultCameraRigProfileRef: string;
  firstPersonCameraRigProfileRef?: string;
  publicDefault?: SubjectPublicDefaultV1;
}
