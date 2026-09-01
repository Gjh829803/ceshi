import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { parseCameraContextRuleV2 } from "@whitebox-world/camera";
import { isNil } from "lodash-es";
import {
  applyCameraRigParameterOverridesV1,
  CAMERA_RIG_PARAMETER_NAMES_V1,
  isCameraRigParameterNameV1,
  parseJumpVariantPolicyV1,
} from "@whitebox-world/runtime-contracts";

import type {
  AnimationSetManifestInputV1,
  AnimationSetManifestV1,
  CapabilityManifestV1,
  ColliderProfileManifestInputV1,
  ColliderProfileManifestV1,
  ColliderDerivationProfileManifestV1,
  LocomotionProfileManifestInputV1,
  LocomotionProfileManifestV1,
  PhysicsBodyProfileManifestInputV1,
  PhysicsBodyProfileManifestV1,
  RigProfileManifestInputV1,
  RigProfileManifestV1,
  SubjectAssetManifestV1,
  SubjectAssetManifestInputV1,
} from "./types-v2";
import type {
  CameraContextProfileV1,
  CameraContextProfileInputV1,
  CameraModifierProfileInputV1,
  CameraModifierProfileV1,
  CameraRigAlgorithmDefinitionV1,
  CameraRigProfileInputV1,
  CameraRigProfileV1,
  ControlFeelProfileInputV1,
  ControlProfileInputV1,
  ControlProfileV1,
  ControlFeelProfileV1,
  HarnessProfileV1,
  MediumProfileInputV1,
  MediumProfileV1,
  MotionKernelDefinitionV1,
  MotionProfileInputV1,
  MotionProfileV1,
  PoseSetProfileV1,
  RegistrySubjectDefinitionInputV3,
  RegistrySubjectDefinitionV3,
  RelationshipProfileV1,
  RenderBindingProfileV1,
  AiSchemaProjectionProfileInputV1,
  AiSchemaProjectionProfileV1,
  SubjectRegistryResourceInputV3,
  SubjectRegistryResourceV3,
  SubjectRegistryDiscoveryFilterV1,
  SubjectResourceRegistryV3,
} from "./types-v3";
import { selectableControlFeelProfileRefsV1 } from "./selectable-control-feel";
import { listSubjectRegistryReferenceEdgesV1 } from "./subject-registry-reference-edges";

export const FIRST_SLICE_ALLOWED_OVERRIDE_PATHS = [
  "profiles.controlFeelProfileRef",
  "profiles.controlProfileRef",
  "profiles.motion.defaultMotionProfileRef",
] as const;

const OVERRIDE_PATH_PATTERN = /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/;

export function assertAllowedOverridePath(path: string): void {
  if (
    !FIRST_SLICE_ALLOWED_OVERRIDE_PATHS.some(
      (allowedPath) => allowedPath === path,
    )
  ) {
    throw new Error(`SUBJECT_OVERRIDE_FORBIDDEN: '${path}'.`);
  }
}

function validateAllowedOverridePaths(
  resourceRef: string,
  paths: unknown,
): asserts paths is readonly string[] {
  if (!Array.isArray(paths)) {
    throw new Error(`SUBJECT_OVERRIDE_PATHS_INVALID: '${resourceRef}'.`);
  }
  const seen = new Set<string>();
  let previous: string | undefined;
  for (const path of paths) {
    if (typeof path !== "string" || !OVERRIDE_PATH_PATTERN.test(path)) {
      throw new Error(`SUBJECT_OVERRIDE_PATHS_INVALID: '${resourceRef}'.`);
    }
    if (seen.has(path)) {
      throw new Error(`SUBJECT_OVERRIDE_PATHS_INVALID: '${resourceRef}'.`);
    }
    seen.add(path);
    if (!isNil(previous) && previous.localeCompare(path) >= 0) {
      throw new Error(`SUBJECT_OVERRIDE_PATHS_INVALID: '${resourceRef}'.`);
    }
    previous = path;
    assertAllowedOverridePath(path);
  }
}

const LOCOMOTION_ALLOWED_KEYS = new Set([
  "kind",
  "id",
  "version",
  "resourceRef",
  "aiMetadata",
  "requiredCapabilityRefs",
  "allowWalk",
  "allowRun",
  "allowJump",
]);

const LOCOMOTION_SPEED_FIELD_PATTERN =
  /Speed|Acceleration|Deceleration|TurnRate|Gravity|Slope|StepHeight|Seconds|Meters|Radians|Ratio/;

const LOCOMOTION_FORBIDDEN_OBJECT_KEYS = new Set([
  "locomotion",
  "parameters",
  "tuning",
  "supportedMediums",
  "allowedMotionKernelRefs",
]);

const MOTION_ALLOWED_KEYS = new Set([
  "kind",
  "id",
  "version",
  "resourceRef",
  "authoringAvailability",
  "aiMetadata",
  "motionKernelRef",
  "motionTags",
]);

const AI_SCHEMA_PROJECTION_PROFILE_ALLOWED_KEYS = new Set([
  "kind",
  "schemaVersion",
  "id",
  "version",
  "resourceRef",
  "authoringAvailability",
  "aiMetadata",
  "maximumPropertyCount",
  "maximumNestingDepth",
  "maximumEnumValueCount",
  "maximumSchemaBytes",
  "maximumRegistrySearchResultCount",
  "optionalFieldMode",
  "contentHash",
]);

const MOTION_KERNEL_ALLOWED_KEYS = new Set([
  "kind",
  "id",
  "version",
  "resourceRef",
  "authoringAvailability",
  "aiMetadata",
  "implementationId",
  "commandKind",
  "supportedMediums",
  "supportedBodyKinds",
  "requiredCapabilityRefs",
  "fallbackMotionProfileRef",
  "deterministic",
  "runtimeStatus",
  "contentHash",
]);

const MOTION_NUMERIC_FIELD_PATTERN =
  /Speed|Acceleration|Deceleration|TurnRate|Gravity|Slope|StepHeight|Seconds|Meters|Radians|Ratio/;

const MEDIUM_FORBIDDEN_KEYS = new Set([
  "supportedMediums",
  "ground",
  "water",
  "gravityScale",
]);

const CONTROL_FEEL_BOUNDS: Readonly<
  Record<
    | "walkSpeedMetersPerSecond"
    | "runSpeedMetersPerSecond"
    | "jumpSpeedMetersPerSecond"
    | "accelerationMetersPerSecondSquared"
    | "decelerationMetersPerSecondSquared"
    | "turnRateRadiansPerSecond"
    | "moveResponseExponent"
    | "airControlRatio"
    | "coyoteTimeSeconds"
    | "jumpBufferSeconds"
    | "variableJumpHoldSeconds"
    | "jumpHoldGravityRatio"
    | "jumpReleaseGravityRatio",
    readonly [number, number]
  >
> = {
  walkSpeedMetersPerSecond: [0, 8],
  runSpeedMetersPerSecond: [0, 12],
  jumpSpeedMetersPerSecond: [0, 12],
  accelerationMetersPerSecondSquared: [0, 60],
  decelerationMetersPerSecondSquared: [0, 80],
  turnRateRadiansPerSecond: [0, 20],
  moveResponseExponent: [1, 3],
  airControlRatio: [0, 1],
  coyoteTimeSeconds: [0, 0.4],
  jumpBufferSeconds: [0, 0.4],
  variableJumpHoldSeconds: [0, 0.5],
  jumpHoldGravityRatio: [0.1, 1],
  jumpReleaseGravityRatio: [1, 5],
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function duplicateValue(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function validateAnimationSet(source: AnimationSetManifestInputV1): void {
  const duplicateRequiredActionId = duplicateValue(source.requiredActionIds);
  if (duplicateRequiredActionId !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_ACTION_ID: '${duplicateRequiredActionId}' in '${source.resourceRef}'.`,
    );
  }

  const duplicateBindingActionId = duplicateValue(
    source.animationBindings.map((binding) => binding.actionId),
  );
  if (duplicateBindingActionId !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_ACTION_ID: '${duplicateBindingActionId}' in '${source.resourceRef}'.`,
    );
  }

  const duplicateClipName = duplicateValue(
    source.animationBindings.map((binding) => binding.sourceClipName),
  );
  if (duplicateClipName !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_CLIP_MAPPING: '${duplicateClipName}' in '${source.resourceRef}'.`,
    );
  }

  const automaticKeys = source.animationBindings.flatMap(
    (binding) => binding.automaticPresentationKeys,
  );
  const duplicateAutomaticKey = duplicateValue(automaticKeys);
  if (duplicateAutomaticKey !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_PRESENTATION_KEY: '${duplicateAutomaticKey}' in '${source.resourceRef}'.`,
    );
  }
  const groundKeys = new Set([
    "locomotion.suspended",
    "locomotion.idle",
    "locomotion.walk",
    "locomotion.run",
  ]);
  for (const binding of source.animationBindings) {
    for (const key of binding.automaticPresentationKeys) {
      const expectedFamily = groundKeys.has(key) ? "ground" : "airborne";
      if (binding.semanticFamily !== expectedFamily) {
        throw new Error(
          `SUBJECT_REGISTRY_PRESENTATION_FAMILY_MISMATCH: '${key}' cannot bind '${binding.semanticFamily}' in '${source.resourceRef}'.`,
        );
      }
    }
  }
}

const SPLIT_JUMP_BINDINGS_V1 = Object.freeze([
  Object.freeze({
    actionId: "jump.small.takeoff" as const,
    presentationKey: "locomotion.small-jump.takeoff" as const,
  }),
  Object.freeze({
    actionId: "jump.small.airborne" as const,
    presentationKey: "locomotion.small-jump.airborne" as const,
  }),
]);

function validateSplitJumpPresentationClosure(
  subject: RegistrySubjectDefinitionV3,
  resourcesByRef: ReadonlyMap<string, SubjectRegistryResourceV3>,
): void {
  const controlFeel = resourcesByRef.get(
    subject.profiles.controlFeelProfileRef,
  );
  if (controlFeel?.kind !== "control-feel-profile" ||
    controlFeel.jumpVariantPolicy.mode !== "run-selects-variant") return;
  if (subject.visualBinding.mode !== "rigged") {
    throw new Error(
      `SUBJECT_REGISTRY_SPLIT_JUMP_BINDING_REQUIRED: '${subject.resourceRef}' requires a rigged Animation Set.`,
    );
  }
  const animationSet = resourcesByRef.get(subject.visualBinding.animationSetRef);
  const subjectAsset = animationSet?.kind === "animation-set"
    ? resourcesByRef.get(animationSet.subjectAssetRef)
    : undefined;
  if (animationSet?.kind !== "animation-set" ||
    subjectAsset?.kind !== "subject-asset") {
    throw new Error(
      `SUBJECT_REGISTRY_SPLIT_JUMP_BINDING_REQUIRED: '${subject.resourceRef}' has no admitted split-jump Animation Set.`,
    );
  }
  for (const requirement of SPLIT_JUMP_BINDINGS_V1) {
    const matches = animationSet.animationBindings.filter((binding) =>
      binding.actionId === requirement.actionId &&
      binding.automaticPresentationKeys.length === 1 &&
      binding.automaticPresentationKeys[0] === requirement.presentationKey
    );
    if (matches.length !== 1 ||
      !animationSet.requiredActionIds.includes(requirement.actionId) ||
      !subjectAsset.inventory.animationClipNames.includes(
        matches[0]?.sourceClipName ?? "",
      )) {
      throw new Error(
        `SUBJECT_REGISTRY_SPLIT_JUMP_BINDING_REQUIRED: '${subject.resourceRef}' requires '${requirement.presentationKey}'.`,
      );
    }
  }
}

function validateSubjectAsset(source: SubjectAssetManifestInputV1): void {
  const duplicateClipName = duplicateValue(source.inventory.animationClipNames);
  if (duplicateClipName !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_CLIP_NAME: '${duplicateClipName}' in '${source.resourceRef}'.`,
    );
  }
}

function validateCanonicalizedSemanticTags(source: SubjectRegistryResourceInputV3): void {
  const duplicateSemanticTag = duplicateValue(source.aiMetadata.semanticTags);
  if (duplicateSemanticTag !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_SEMANTIC_TAG: '${duplicateSemanticTag}' in '${source.resourceRef}'.`,
    );
  }
}

function validateRigProfile(source: RigProfileManifestInputV1): void {
  const duplicateBoneId = duplicateValue(source.requiredBoneIds);
  if (duplicateBoneId !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_BONE_ID: '${duplicateBoneId}' in '${source.resourceRef}'.`,
    );
  }

  const duplicateCompatibleRef = duplicateValue(source.compatibleSubjectAssetRefs);
  if (duplicateCompatibleRef !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_COMPATIBLE_REF: '${duplicateCompatibleRef}' in '${source.resourceRef}'.`,
    );
  }
}

function validateColliderProfile(source: ColliderProfileManifestInputV1): void {
  const duplicateBodyTopology = duplicateValue(source.supportedBodyTopologies);
  if (duplicateBodyTopology !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_DUPLICATE_BODY_TOPOLOGY: '${duplicateBodyTopology}' in '${source.resourceRef}'.`,
    );
  }
}

function sortedStrings<T extends string>(values: readonly T[]): readonly T[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function canonicalizeNewResourceCollections(
  source: SubjectRegistryResourceInputV3,
): SubjectRegistryResourceInputV3 {
  const input = structuredClone(source);
  switch (input.kind) {
    case "subject-asset":
      return {
        ...input,
        inventory: {
          ...input.inventory,
          animationClipNames: sortedStrings(input.inventory.animationClipNames),
        },
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings(input.aiMetadata.semanticTags),
        },
      };
    case "rig-profile":
      return {
        ...input,
        compatibleSubjectAssetRefs: sortedStrings(input.compatibleSubjectAssetRefs),
        requiredBoneIds: sortedStrings(input.requiredBoneIds),
        sourceNodeNameByBoneId: Object.fromEntries(
          Object.entries(input.sourceNodeNameByBoneId).sort(([left], [right]) =>
            left.localeCompare(right)),
        ) as RigProfileManifestInputV1["sourceNodeNameByBoneId"],
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings(input.aiMetadata.semanticTags),
        },
      };
    case "animation-set":
      return {
        ...input,
        requiredActionIds: sortedStrings(input.requiredActionIds),
        animationBindings: [...input.animationBindings]
          .map((binding) => ({
            ...binding,
            automaticPresentationKeys: sortedStrings(
              binding.automaticPresentationKeys,
            ),
          }))
          .sort((left, right) => left.actionId.localeCompare(right.actionId)),
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings(input.aiMetadata.semanticTags),
        },
      };
    case "collider-profile":
      return {
        ...input,
        supportedBodyTopologies: sortedStrings(input.supportedBodyTopologies),
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings(input.aiMetadata.semanticTags),
        },
      };
    case "subject-definition":
      return {
        ...input,
        allowedOverridePaths: sortedStrings(input.allowedOverridePaths),
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings(input.aiMetadata.semanticTags),
        },
      };
    default:
      return {
        ...input,
        aiMetadata: {
          ...input.aiMetadata,
          semanticTags: sortedStrings(input.aiMetadata.semanticTags),
        },
      };
  }
}

function lockResource(source: SubjectRegistryResourceInputV3): SubjectRegistryResourceV3 {
  const { contentHash: _ignoredContentHash, ...sourceWithoutContentHash } = source as
    SubjectRegistryResourceInputV3 & { contentHash?: string };
  const hashInput = canonicalizeNewResourceCollections(
    sourceWithoutContentHash as SubjectRegistryResourceInputV3,
  );
  return deepFreeze({
    ...hashInput,
    contentHash: sha256CanonicalJson(hashInput),
  } as SubjectRegistryResourceV3);
}

function validateLocomotionProfile(source: LocomotionProfileManifestInputV1): void {
  const rawSource = source as unknown as Record<string, unknown>;
  for (const key of Object.keys(rawSource)) {
    if (LOCOMOTION_FORBIDDEN_OBJECT_KEYS.has(key)) {
      throw new Error(
        key === "locomotion"
          ? `LOCOMOTION_PROFILE_SPEED_FORBIDDEN: '${source.resourceRef}'.`
          : `LOCOMOTION_PROFILE_FIELD_FORBIDDEN: '${source.resourceRef}'.`,
      );
    }
    if (!LOCOMOTION_ALLOWED_KEYS.has(key)) {
      throw new Error(
        LOCOMOTION_SPEED_FIELD_PATTERN.test(key)
          ? `LOCOMOTION_PROFILE_SPEED_FORBIDDEN: '${source.resourceRef}'.`
          : `LOCOMOTION_PROFILE_FIELD_FORBIDDEN: '${source.resourceRef}'.`,
      );
    }
  }
  if (source.allowWalk !== true) {
    throw new Error(
      `LOCOMOTION_PROFILE_FIELD_FORBIDDEN: '${source.resourceRef}' requires allowWalk === true.`,
    );
  }
}

function validateMotionProfile(source: MotionProfileInputV1): void {
  const rawSource = source as unknown as Record<string, unknown>;
  if (
    "parameters" in rawSource ||
    "safetyLimits" in rawSource ||
    "authoringRanges" in rawSource
  ) {
    throw new Error(
      `MOTION_PROFILE_NUMERIC_BAG_FORBIDDEN: '${source.resourceRef}'.`,
    );
  }
  for (const key of Object.keys(rawSource)) {
    if (!MOTION_ALLOWED_KEYS.has(key) && MOTION_NUMERIC_FIELD_PATTERN.test(key)) {
      throw new Error(
        `MOTION_PROFILE_NUMERIC_BAG_FORBIDDEN: '${source.resourceRef}'.`,
      );
    }
  }
}

function validateMotionKernel(
  source: SubjectRegistryResourceInputV3 & { kind: "motion-kernel" },
): void {
  const unknownField = Object.keys(source).find(
    (fieldName) => !MOTION_KERNEL_ALLOWED_KEYS.has(fieldName),
  );
  if (unknownField !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_UNKNOWN_FIELD: '${unknownField}' in '${source.resourceRef}'.`,
    );
  }
}

function isFiniteInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validateControlFeelProfile(source: ControlFeelProfileInputV1): void {
  try {
    parseJumpVariantPolicyV1(source.jumpVariantPolicy);
  } catch {
    throw new Error(
      `CONTROL_FEEL_PROFILE_INVALID: 'jumpVariantPolicy' in '${source.resourceRef}'.`,
    );
  }
  for (const [fieldName, [minimum, maximum]] of Object.entries(CONTROL_FEEL_BOUNDS)) {
    const value = source[fieldName as keyof ControlFeelProfileInputV1];
    if (typeof value !== "number" || !isFiniteInRange(value, minimum, maximum)) {
      throw new Error(
        `CONTROL_FEEL_PROFILE_INVALID: '${fieldName}' in '${source.resourceRef}'.`,
      );
    }
  }
  if (source.walkSpeedMetersPerSecond > source.runSpeedMetersPerSecond) {
    throw new Error(
      `CONTROL_FEEL_PROFILE_INVALID: walkSpeedMetersPerSecond exceeds runSpeedMetersPerSecond in '${source.resourceRef}'.`,
    );
  }
  if (source.airControlRatio < 0 || source.airControlRatio > 1) {
    throw new Error(
      `CONTROL_FEEL_PROFILE_INVALID: airControlRatio in '${source.resourceRef}'.`,
    );
  }
  if (source.jumpHoldGravityRatio < 0 || source.jumpHoldGravityRatio > 1) {
    throw new Error(
      `CONTROL_FEEL_PROFILE_INVALID: jumpHoldGravityRatio in '${source.resourceRef}'.`,
    );
  }
  if (source.jumpReleaseGravityRatio < 1) {
    throw new Error(
      `CONTROL_FEEL_PROFILE_INVALID: jumpReleaseGravityRatio in '${source.resourceRef}'.`,
    );
  }
}

function validateControlProfile(source: ControlProfileInputV1): void {
  if (
    !Number.isFinite(source.moveDeadzoneRatio) ||
    source.moveDeadzoneRatio < 0 ||
    source.moveDeadzoneRatio > 0.4
  ) {
    throw new Error(
      `SUBJECT_REGISTRY_INVALID_CONTROL_INPUT_TUNING: '${source.resourceRef}'.`,
    );
  }
  const hasExecutablePolicyCombination = (() => {
    switch (source.commandKind) {
      case "planar-vector":
        return source.inputSpace === "camera-relative" &&
          (source.facingPolicy === "align-to-move" ||
            source.facingPolicy === "align-to-view");
      case "none":
        return source.inputSpace === "none" &&
          source.facingPolicy === "fixed" &&
          source.lateralMovementPolicy === "forbidden";
      default:
        return false;
    }
  })();
  if (!hasExecutablePolicyCombination) {
    throw new Error(
      `SUBJECT_REGISTRY_INVALID_CONTROL_PROFILE_COMBINATION: '${source.resourceRef}'.`,
    );
  }
}

function validateMediumProfile(source: MediumProfileInputV1): void {
  const rawSource = source as unknown as Record<string, unknown>;
  for (const key of Object.keys(rawSource)) {
    if (MEDIUM_FORBIDDEN_KEYS.has(key)) {
      throw new Error(
        `MEDIUM_PROFILE_FIELD_FORBIDDEN: '${source.resourceRef}'.`,
      );
    }
  }
  const ground = rawSource.ground;
  if (
    ground !== undefined &&
    typeof ground === "object" &&
    ground !== null &&
    "groundingToleranceMeters" in ground
  ) {
    throw new Error(
      `MEDIUM_PROFILE_FIELD_FORBIDDEN: '${source.resourceRef}'.`,
    );
  }
  if (
    !isFiniteInRange(source.air.gravityRatio, 0, 4) ||
    !isFiniteInRange(source.air.linearDragPerSecond, 0, 20)
  ) {
    throw new Error(
      `MEDIUM_PROFILE_FIELD_FORBIDDEN: '${source.resourceRef}'.`,
    );
  }
}

function validateAiSchemaProjectionProfile(
  source: AiSchemaProjectionProfileInputV1,
): void {
  const unknownField = Object.keys(source).find(
    (fieldName) => !AI_SCHEMA_PROJECTION_PROFILE_ALLOWED_KEYS.has(fieldName),
  );
  if (unknownField !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_UNKNOWN_FIELD: '${unknownField}' in '${source.resourceRef}'.`,
    );
  }
  if (source.schemaVersion !== 1) {
    throw new Error(
      `AI_SCHEMA_PROJECTION_PROFILE_INVALID: '${source.resourceRef}'.`,
    );
  }
  if (
    source.authoringAvailability !== "recommended" &&
    source.authoringAvailability !== "advanced" &&
    source.authoringAvailability !== "experimental"
  ) {
    throw new Error(
      `AI_SCHEMA_PROJECTION_PROFILE_INVALID: '${source.resourceRef}'.`,
    );
  }
  const budgetFields = [
    source.maximumPropertyCount,
    source.maximumNestingDepth,
    source.maximumEnumValueCount,
    source.maximumSchemaBytes,
    source.maximumRegistrySearchResultCount,
  ];
  if (
    budgetFields.some((value) =>
      !Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)
    )
  ) {
    throw new Error(
      `AI_SCHEMA_PROJECTION_PROFILE_INVALID: '${source.resourceRef}'.`,
    );
  }
  if (
    source.optionalFieldMode !== "native-optional" &&
    source.optionalFieldMode !== "required-nullable-with-round-trip-map"
  ) {
    throw new Error(
      `AI_SCHEMA_PROJECTION_PROFILE_INVALID: '${source.resourceRef}'.`,
    );
  }
}

function validatePhysicsBodyProfile(source: PhysicsBodyProfileManifestInputV1): void {
  const { maxSlopeDegrees, maxStepHeightMeters } = source.physicsBody;
  if (
    !Number.isFinite(maxSlopeDegrees) ||
    maxSlopeDegrees <= 0 ||
    maxSlopeDegrees > 90 ||
    !Number.isFinite(maxStepHeightMeters) ||
    maxStepHeightMeters < 0 ||
    maxStepHeightMeters > 2
  ) {
    throw new Error(
      `PHYSICS_BODY_TRAVERSAL_LIMIT_INVALID: '${source.resourceRef}'.`,
    );
  }
}

function validateSubjectDefinitionV3(source: RegistrySubjectDefinitionInputV3): void {
  validateAllowedOverridePaths(source.resourceRef, source.allowedOverridePaths);
  const controlFeelProfileRef = source.profiles.controlFeelProfileRef;
  if (isNil(controlFeelProfileRef) || controlFeelProfileRef === "") {
    throw new Error(
      `SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED: '${source.resourceRef}'.`,
    );
  }
  selectableControlFeelProfileRefsV1(source.profiles);
  if (
    source.profiles.motion.defaultMotionProfileRef ===
      source.profiles.motion.fallbackMotionProfileRef
  ) {
    throw new Error(`MOTION_FALLBACK_DEFAULT_COLLISION: '${source.resourceRef}'.`);
  }
}

type CameraParametersV1 = CameraRigProfileInputV1["parameters"];

function hasInvalidCameraParameters(
  parameters: Readonly<Partial<CameraParametersV1>>,
): boolean {
  const negativeAllowed = new Set<keyof CameraParametersV1>([
    "shoulderOffsetMeters",
    "pitchRadians",
    "minimumPitchRadians",
    "maximumPitchRadians",
  ]);
  const containsInvalidNumber = Object.entries(parameters).some(
    ([name, value]) =>
      !Number.isFinite(value) ||
      (!negativeAllowed.has(name as keyof CameraParametersV1) && value < 0),
  );
  const minimumDistance = parameters.minimumDistanceMeters;
  const maximumDistance = parameters.maximumDistanceMeters;
  const distance = parameters.distanceMeters;
  const minimumPitch = parameters.minimumPitchRadians;
  const maximumPitch = parameters.maximumPitchRadians;
  const pitch = parameters.pitchRadians;
  return containsInvalidNumber ||
    (minimumDistance !== undefined && maximumDistance !== undefined &&
      minimumDistance > maximumDistance) ||
    (distance !== undefined && minimumDistance !== undefined && distance < minimumDistance) ||
    (distance !== undefined && maximumDistance !== undefined && distance > maximumDistance) ||
    (minimumPitch !== undefined && maximumPitch !== undefined && minimumPitch > maximumPitch) ||
    (pitch !== undefined && minimumPitch !== undefined && pitch < minimumPitch) ||
    (pitch !== undefined && maximumPitch !== undefined && pitch > maximumPitch) ||
    (parameters.horizontalDeadZoneRatio !== undefined &&
      parameters.horizontalDeadZoneRatio > 1) ||
    (parameters.verticalDeadZoneRatio !== undefined &&
      parameters.verticalDeadZoneRatio > 1) ||
    (parameters.baseFovDegrees !== undefined &&
      (parameters.baseFovDegrees <= 0 || parameters.baseFovDegrees >= 180)) ||
    (parameters.baseFovDegrees !== undefined &&
      parameters.maximumSpeedFovDegrees !== undefined &&
      parameters.baseFovDegrees + parameters.maximumSpeedFovDegrees >= 180) ||
    (parameters.lookSensitivityXRatio !== undefined &&
      parameters.lookSensitivityXRatio <= 0) ||
    (parameters.lookSensitivityYRatio !== undefined &&
      parameters.lookSensitivityYRatio <= 0);
}

function validateCameraProfile(source: CameraRigProfileInputV1): void {
  const unknownParameterName = Object.keys(source.parameters).find(
    (parameterName) => !isCameraRigParameterNameV1(parameterName),
  );
  if (unknownParameterName !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_UNKNOWN_CAMERA_PARAMETER: '${unknownParameterName}' in '${source.resourceRef}'.`,
    );
  }
  const missingParameterName = CAMERA_RIG_PARAMETER_NAMES_V1.find(
    (parameterName) => !Object.prototype.hasOwnProperty.call(source.parameters, parameterName),
  );
  if (missingParameterName !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_MISSING_CAMERA_PARAMETER: '${missingParameterName}' in '${source.resourceRef}'.`,
    );
  }
  if (hasInvalidCameraParameters(source.parameters)) {
    throw new Error(
      `SUBJECT_REGISTRY_INVALID_CAMERA_PARAMETERS: '${source.resourceRef}'.`,
    );
  }
  const expectedAlgorithmRefByBaseMode = {
    "first-person": "worldkit://camera-rig/socket-first-person@1",
    "free-orbit": "worldkit://camera-rig/orbit-follow@1",
    "stable-follow": "worldkit://camera-rig/orbit-follow@1",
    "speed-chase": "worldkit://camera-rig/velocity-chase@1",
    "flight-horizon": "worldkit://camera-rig/flight-horizon@1",
  } as const satisfies Record<CameraRigProfileInputV1["baseMode"], string>;
  if (source.algorithmRef !== expectedAlgorithmRefByBaseMode[source.baseMode]) {
    throw new Error(
      `SUBJECT_REGISTRY_CAMERA_MODE_ALGORITHM_MISMATCH: '${source.resourceRef}' declares '${source.baseMode}' with '${source.algorithmRef}'.`,
    );
  }
  for (const [parameterName, range] of Object.entries(source.authoringRanges ?? {})) {
    const parameterValue = source.parameters[
      parameterName as keyof CameraRigProfileInputV1["parameters"]
    ];
    if (
      typeof parameterValue !== "number" ||
      ![range.minimum, range.maximum, range.step].every(Number.isFinite) ||
      range.minimum > range.maximum ||
      range.step <= 0 ||
      parameterValue < range.minimum ||
      parameterValue > range.maximum
    ) {
      throw new Error(
        `SUBJECT_REGISTRY_INVALID_AUTHORING_RANGE: '${parameterName}' in '${source.resourceRef}'.`,
      );
    }
  }
}

function validateCameraModifierProfile(source: CameraModifierProfileInputV1): void {
  const unknownParameterName = Object.keys(source.parameterOverrides).find(
    (parameterName) => !isCameraRigParameterNameV1(parameterName),
  );
  if (unknownParameterName !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_UNKNOWN_CAMERA_PARAMETER: '${unknownParameterName}' in '${source.resourceRef}'.`,
    );
  }
  const nonFiniteParameter = Object.entries(source.parameterOverrides).find(
    ([, value]) => !Number.isFinite(value),
  );
  if (nonFiniteParameter !== undefined) {
    throw new Error(
      `SUBJECT_REGISTRY_NON_FINITE_PARAMETER: '${nonFiniteParameter[0]}' in '${source.resourceRef}'.`,
    );
  }
  if (hasInvalidCameraParameters(source.parameterOverrides)) {
    throw new Error(
      `SUBJECT_REGISTRY_INVALID_CAMERA_MODIFIER_PARAMETERS: '${source.resourceRef}'.`,
    );
  }
}

function validateCameraContextProfile(source: CameraContextProfileInputV1): void {
  try {
    for (const rule of source.rules) parseCameraContextRuleV2(rule);
  } catch {
    throw new Error(
      `SUBJECT_REGISTRY_INVALID_CAMERA_CONTEXT_RULE: '${source.resourceRef}'.`,
    );
  }
}

function validateReferences(resourcesByRef: ReadonlyMap<string, SubjectRegistryResourceV3>): void {
  for (const resource of resourcesByRef.values()) {
    for (const referenceEdge of listSubjectRegistryReferenceEdgesV1(resource)) {
      const resolved = resourcesByRef.get(referenceEdge.targetResourceRef);
      if (
        resolved === undefined ||
        !referenceEdge.expectedResourceKinds.includes(resolved.kind)
      ) {
        const expectedKinds = referenceEdge.expectedResourceKinds.join(" or ");
        throw new Error(
          `SUBJECT_REGISTRY_MISSING_REFERENCE: '${resource.resourceRef}' requires ${expectedKinds} '${referenceEdge.targetResourceRef}' at '${referenceEdge.sourcePath}'.`,
        );
      }
    }
  }

  for (const resource of resourcesByRef.values()) {
    if (resource.kind === "motion-profile") {
      const kernel = resourcesByRef.get(resource.motionKernelRef);
      if (kernel?.kind === "motion-kernel" && kernel.runtimeStatus === "reserved") {
        throw new Error(
          `SUBJECT_REGISTRY_RESERVED_KERNEL_PROFILE: '${resource.resourceRef}' targets '${kernel.resourceRef}'.`,
        );
      }
    }
    if (resource.kind === "camera-rig-profile") {
      const algorithm = resourcesByRef.get(resource.algorithmRef);
      if (algorithm?.kind === "camera-rig-algorithm" && algorithm.runtimeStatus === "reserved") {
        throw new Error(
          `SUBJECT_REGISTRY_RESERVED_CAMERA_ALGORITHM: '${resource.resourceRef}' targets '${algorithm.resourceRef}'.`,
        );
      }
    }
    if (resource.kind === "camera-context-profile") {
      const reachableBaseProfileRefs = new Set([
        resource.defaultCameraRigProfileRef,
        ...(resource.firstPersonCameraRigProfileRef === undefined
          ? []
          : [resource.firstPersonCameraRigProfileRef]),
        ...resource.rules.flatMap((rule) =>
          rule.cameraRigProfileRef === undefined ? [] : [rule.cameraRigProfileRef]
        ),
      ]);
      const reachableModifiers = [...new Set(
        resource.rules.flatMap((rule) => rule.cameraModifierRefs ?? []),
      )].flatMap((modifierRef) => {
        const modifier = resourcesByRef.get(modifierRef);
        return modifier?.kind === "camera-modifier-profile" ? [modifier] : [];
      });
      const modifierSequences: readonly (readonly CameraModifierProfileV1[])[] = [
        ...reachableModifiers.map((modifier) => [modifier]),
        ...reachableModifiers.flatMap((first) =>
          reachableModifiers.flatMap((second) =>
            first.resourceRef === second.resourceRef ? [] : [[first, second]]
          )
        ),
      ];
      for (const baseProfileRef of reachableBaseProfileRefs) {
        const baseProfile = resourcesByRef.get(baseProfileRef);
        if (baseProfile?.kind !== "camera-rig-profile") continue;
        for (const modifiers of modifierSequences) {
          const composedParameters = modifiers.reduce<CameraParametersV1>(
            (parameters, modifier) => applyCameraRigParameterOverridesV1(
              baseProfile.algorithmRef,
              parameters,
              modifier.parameterOverrides,
            ),
            { ...baseProfile.parameters },
          );
          if (!hasInvalidCameraParameters(composedParameters)) continue;
          throw new Error(
            `SUBJECT_REGISTRY_INVALID_CAMERA_CONTEXT_PARAMETERS: '${resource.resourceRef}' combines '${baseProfileRef}' with '${modifiers.map((modifier) => modifier.resourceRef).join("', '")}'.`,
          );
        }
      }
    }
    if (resource.kind === "subject-definition" && "schemaVersion" in resource) {
      const subject = resource as RegistrySubjectDefinitionV3;
      validateSplitJumpPresentationClosure(subject, resourcesByRef);
      const defaultMotion = resourcesByRef.get(
        subject.profiles.motion.defaultMotionProfileRef,
      );
      const fallbackMotion = resourcesByRef.get(
        subject.profiles.motion.fallbackMotionProfileRef,
      );
      if (defaultMotion?.kind === "motion-profile" && fallbackMotion?.kind === "motion-profile") {
        if (
          !(fallbackMotion.motionTags.includes("safe") &&
            fallbackMotion.motionTags.includes("stopped"))
        ) {
          throw new Error(`MOTION_FALLBACK_NOT_SAFE_STOP: '${subject.resourceRef}'.`);
        }
        if (
          defaultMotion.motionTags.includes("safe") &&
          defaultMotion.motionTags.includes("stopped")
        ) {
          throw new Error(`MOTION_DEFAULT_SAFE_STOP_FORBIDDEN: '${subject.resourceRef}'.`);
        }
      }
      const motion = resourcesByRef.get(subject.profiles.motion.defaultMotionProfileRef);
      const control = resourcesByRef.get(subject.profiles.controlProfileRef);
      const kernel =
        motion?.kind === "motion-profile"
          ? resourcesByRef.get(motion.motionKernelRef)
          : undefined;
      if (
        kernel?.kind === "motion-kernel" &&
        control?.kind === "control-profile" &&
        kernel.commandKind !== control.commandKind
      ) {
        throw new Error(
          `SUBJECT_REGISTRY_COMMAND_KIND_MISMATCH: '${subject.resourceRef}' uses '${kernel.commandKind}' with '${control.commandKind}'.`,
        );
      }
    }
  }
}

export function createSubjectResourceRegistry(
  resources: readonly SubjectRegistryResourceInputV3[],
): SubjectResourceRegistryV3 {
  const resourcesByRef = new Map<string, SubjectRegistryResourceV3>();
  for (const source of resources) {
    if (resourcesByRef.has(source.resourceRef)) {
      throw new Error(`SUBJECT_REGISTRY_DUPLICATE_REF: '${source.resourceRef}'.`);
    }
    if (source.kind === "subject-asset") validateSubjectAsset(source);
    if (source.kind === "animation-set") validateAnimationSet(source);
    if (source.kind === "rig-profile") validateRigProfile(source);
    if (source.kind === "collider-profile") validateColliderProfile(source);
    if (source.kind === "locomotion-profile") validateLocomotionProfile(source);
    if (source.kind === "physics-body-profile") validatePhysicsBodyProfile(source);
    if (source.kind === "motion-profile") validateMotionProfile(source);
    if (source.kind === "control-feel-profile") validateControlFeelProfile(source);
    if (source.kind === "control-profile") validateControlProfile(source);
    if (source.kind === "medium-profile") validateMediumProfile(source);
    if (source.kind === "camera-rig-profile") validateCameraProfile(source);
    if (source.kind === "camera-modifier-profile") validateCameraModifierProfile(source);
    if (source.kind === "camera-context-profile") validateCameraContextProfile(source);
    if (source.kind === "subject-definition") {
      const resourceRef = source.resourceRef;
      if (!("schemaVersion" in source) || source.schemaVersion !== 3) {
        throw new Error(
          `SUBJECT_REGISTRY_SUBJECT_DEFINITION_VERSION_NOT_SUPPORTED: '${resourceRef}'.`,
        );
      }
      validateSubjectDefinitionV3(source);
    }
    if (source.kind === "ai-schema-projection-profile") {
      validateAiSchemaProjectionProfile(source);
    }
    if (source.kind === "motion-kernel") validateMotionKernel(source);
    validateCanonicalizedSemanticTags(source);
    resourcesByRef.set(source.resourceRef, lockResource(source));
  }
  validateReferences(resourcesByRef);

  const stableResources = deepFreeze(
    [...resourcesByRef.values()].sort((left, right) =>
      left.resourceRef.localeCompare(right.resourceRef),
    ),
  );
  const resolveResource = (
    resourceRef: string,
  ): SubjectRegistryResourceV3 | undefined => resourcesByRef.get(resourceRef);

  function listDiscoverableResources(): readonly SubjectRegistryResourceV3[];
  function listDiscoverableResources<
    ResourceKind extends SubjectRegistryResourceV3["kind"],
  >(
    filter: SubjectRegistryDiscoveryFilterV1<ResourceKind>,
  ): readonly Extract<SubjectRegistryResourceV3, { kind: ResourceKind }>[];
  function listDiscoverableResources(
    filter?: SubjectRegistryDiscoveryFilterV1,
  ): readonly SubjectRegistryResourceV3[] {
    if (filter?.kind === undefined) return stableResources;
    return deepFreeze(stableResources.filter(
      (resource) => resource.kind === filter.kind,
    ));
  }

  return Object.freeze({
    resolveResource,
    listDiscoverableResources,
    listReferenceEdges: listSubjectRegistryReferenceEdgesV1,
    resolveSubjectAsset(resourceRef: string): SubjectAssetManifestV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "subject-asset" ? resource : undefined;
    },
    resolveRigProfile(resourceRef: string): RigProfileManifestV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "rig-profile" ? resource : undefined;
    },
    resolveAnimationSet(resourceRef: string): AnimationSetManifestV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "animation-set" ? resource : undefined;
    },
    resolveColliderProfile(resourceRef: string): ColliderProfileManifestV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "collider-profile" ? resource : undefined;
    },
    resolveSubjectDefinition(
      resourceRef: string,
    ): RegistrySubjectDefinitionV3 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "subject-definition" ? resource : undefined;
    },
    resolveCapability(resourceRef: string): CapabilityManifestV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "capability" ? resource : undefined;
    },
    resolvePhysicsBodyProfile(
      resourceRef: string,
    ): PhysicsBodyProfileManifestV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "physics-body-profile" ? resource : undefined;
    },
    resolveLocomotionProfile(resourceRef: string): LocomotionProfileManifestV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "locomotion-profile" ? resource : undefined;
    },
    resolveColliderDerivationProfile(
      resourceRef: string,
    ): ColliderDerivationProfileManifestV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "collider-derivation-profile" ? resource : undefined;
    },
    resolveMotionKernel(resourceRef: string): MotionKernelDefinitionV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "motion-kernel" ? resource : undefined;
    },
    resolveMotionProfile(resourceRef: string): MotionProfileV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "motion-profile" ? resource : undefined;
    },
    resolveControlFeelProfile(resourceRef: string): ControlFeelProfileV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "control-feel-profile" ? resource : undefined;
    },
    resolveControlProfile(resourceRef: string): ControlProfileV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "control-profile" ? resource : undefined;
    },
    resolveCameraRigAlgorithm(
      resourceRef: string,
    ): CameraRigAlgorithmDefinitionV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "camera-rig-algorithm" ? resource : undefined;
    },
    resolveCameraRigProfile(resourceRef: string): CameraRigProfileV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "camera-rig-profile" ? resource : undefined;
    },
    resolveCameraModifierProfile(resourceRef: string): CameraModifierProfileV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "camera-modifier-profile" ? resource : undefined;
    },
    resolveCameraContextProfile(resourceRef: string): CameraContextProfileV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "camera-context-profile" ? resource : undefined;
    },
    resolveMediumProfile(resourceRef: string): MediumProfileV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "medium-profile" ? resource : undefined;
    },
    resolveRelationshipProfile(resourceRef: string): RelationshipProfileV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "relationship-profile" ? resource : undefined;
    },
    resolveHarnessProfile(resourceRef: string): HarnessProfileV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "harness-profile" ? resource : undefined;
    },
    resolvePoseSetProfile(resourceRef: string): PoseSetProfileV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "pose-set-profile" ? resource : undefined;
    },
    resolveRenderBindingProfile(resourceRef: string): RenderBindingProfileV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "render-binding-profile" ? resource : undefined;
    },
    resolveAiSchemaProjectionProfile(
      resourceRef: string,
    ): AiSchemaProjectionProfileV1 | undefined {
      const resource = resolveResource(resourceRef);
      return resource?.kind === "ai-schema-projection-profile" ? resource : undefined;
    },
  });
}
