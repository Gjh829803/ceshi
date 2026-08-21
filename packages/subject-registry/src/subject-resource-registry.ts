import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  applyCameraRigParameterOverridesV1,
  CAMERA_RIG_PARAMETER_NAMES_V1,
  isCameraRigParameterNameV1,
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
  RegistrySubjectDefinitionV2,
  RigProfileManifestV1,
  SubjectAssetManifestV1,
  SubjectAssetManifestInputV1,
  SubjectRegistryResourceV1,
} from "./types-v2";
import type {
  CameraContextProfileV1,
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
  SubjectRegistryResourceInputV3,
  SubjectRegistryResourceV3,
  SubjectCapabilityResourceV1,
  SubjectResourceRegistryV3,
} from "./types-v3";

export const FIRST_SLICE_ALLOWED_OVERRIDE_PATHS = [
  "profiles.controlFeelProfileRef",
  "profiles.controlProfileRef",
  "profiles.motion.defaultMotionProfileRef",
] as const;

export function assertAllowedOverridePath(path: string): void {
  if (
    !FIRST_SLICE_ALLOWED_OVERRIDE_PATHS.some(
      (allowedPath) => allowedPath === path,
    )
  ) {
    throw new Error(`SUBJECT_OVERRIDE_FORBIDDEN: '${path}'.`);
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
        animationBindings: [...input.animationBindings].sort((left, right) =>
          left.actionId.localeCompare(right.actionId)),
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
  const rawSource = source as Record<string, unknown>;
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
  const rawSource = source as Record<string, unknown>;
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

function isFiniteInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validateControlFeelProfile(source: ControlFeelProfileInputV1): void {
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
  const rawSource = source as Record<string, unknown>;
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
  const controlFeelProfileRef = source.profiles.controlFeelProfileRef;
  if (
    controlFeelProfileRef === undefined ||
    controlFeelProfileRef === null ||
    controlFeelProfileRef === ""
  ) {
    throw new Error(
      `SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED: '${source.resourceRef}'.`,
    );
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

function validateReferences(resourcesByRef: ReadonlyMap<string, SubjectRegistryResourceV3>): void {
  const requireRef = (ownerRef: string, resourceRef: string, expectedKind: string): void => {
    const resolved = resourcesByRef.get(resourceRef);
    if (resolved?.kind !== expectedKind) {
      throw new Error(
        `SUBJECT_REGISTRY_MISSING_REFERENCE: '${ownerRef}' requires ${expectedKind} '${resourceRef}'.`,
      );
    }
  };

  for (const resource of resourcesByRef.values()) {
    if (resource.kind === "motion-profile") {
      requireRef(resource.resourceRef, resource.motionKernelRef, "motion-kernel");
      const kernel = resourcesByRef.get(resource.motionKernelRef);
      if (kernel?.kind === "motion-kernel" && kernel.runtimeStatus === "reserved") {
        throw new Error(
          `SUBJECT_REGISTRY_RESERVED_KERNEL_PROFILE: '${resource.resourceRef}' targets '${kernel.resourceRef}'.`,
        );
      }
    }
    if (resource.kind === "camera-rig-profile") {
      requireRef(resource.resourceRef, resource.algorithmRef, "camera-rig-algorithm");
      const algorithm = resourcesByRef.get(resource.algorithmRef);
      if (algorithm?.kind === "camera-rig-algorithm" && algorithm.runtimeStatus === "reserved") {
        throw new Error(
          `SUBJECT_REGISTRY_RESERVED_CAMERA_ALGORITHM: '${resource.resourceRef}' targets '${algorithm.resourceRef}'.`,
        );
      }
    }
    if (resource.kind === "camera-context-profile") {
      requireRef(
        resource.resourceRef,
        resource.defaultCameraRigProfileRef,
        "camera-rig-profile",
      );
      if (resource.firstPersonCameraRigProfileRef !== undefined) {
        requireRef(
          resource.resourceRef,
          resource.firstPersonCameraRigProfileRef,
          "camera-rig-profile",
        );
      }
      for (const rule of resource.rules) {
        if (rule.cameraRigProfileRef !== undefined) {
          requireRef(resource.resourceRef, rule.cameraRigProfileRef, "camera-rig-profile");
        }
        for (const modifierRef of rule.cameraModifierRefs ?? []) {
          requireRef(resource.resourceRef, modifierRef, "camera-modifier-profile");
        }
      }

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
      requireRef(
        subject.resourceRef,
        subject.profiles.physicsBodyProfileRef,
        "physics-body-profile",
      );
      const allMotionProfileRefs = [
        subject.profiles.motion.defaultMotionProfileRef,
        ...subject.profiles.motion.optionalMotionProfileRefs,
        subject.profiles.motion.fallbackMotionProfileRef,
      ];
      for (const ref of allMotionProfileRefs) {
        requireRef(subject.resourceRef, ref, "motion-profile");
      }
      requireRef(subject.resourceRef, subject.profiles.controlProfileRef, "control-profile");
      requireRef(
        subject.resourceRef,
        subject.profiles.cameraContextProfileRef,
        "camera-context-profile",
      );
      requireRef(subject.resourceRef, subject.profiles.mediumProfileRef, "medium-profile");
      requireRef(subject.resourceRef, subject.profiles.harnessProfileRef, "harness-profile");
      requireRef(
        subject.resourceRef,
        subject.profiles.controlFeelProfileRef,
        "control-feel-profile",
      );
      requireRef(
        subject.resourceRef,
        subject.renderBindingProfileRef,
        "render-binding-profile",
      );
      const actionOrPose = resourcesByRef.get(subject.actionOrPoseSetRef);
      if (actionOrPose?.kind !== "animation-set" && actionOrPose?.kind !== "pose-set-profile") {
        throw new Error(
          `SUBJECT_REGISTRY_MISSING_REFERENCE: '${subject.resourceRef}' requires action or pose set '${subject.actionOrPoseSetRef}'.`,
        );
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
    if (source.kind === "subject-definition" && "schemaVersion" in source) {
      validateSubjectDefinitionV3(source);
    }
    if (source.kind === "motion-kernel") {
      const duplicateParameterName = duplicateValue(source.runtimeParameterNames);
      if (duplicateParameterName !== undefined) {
        throw new Error(
          `SUBJECT_REGISTRY_DUPLICATE_RUNTIME_PARAMETER: '${duplicateParameterName}' in '${source.resourceRef}'.`,
        );
      }
    }
    validateCanonicalizedSemanticTags(source);
    resourcesByRef.set(source.resourceRef, lockResource(source));
  }
  validateReferences(resourcesByRef);

  const stableResources = deepFreeze(
    [...resourcesByRef.values()].sort((left, right) =>
      left.resourceRef.localeCompare(right.resourceRef),
    ),
  );
  const stableSubjectDefinitions = deepFreeze(
    stableResources.filter(
      (resource): resource is RegistrySubjectDefinitionV2 | RegistrySubjectDefinitionV3 =>
        resource.kind === "subject-definition",
    ),
  );
  const stableCliSubjectDefinitions = deepFreeze(
    stableSubjectDefinitions.filter(
      (
        resource,
      ): resource is RegistrySubjectDefinitionV2 | RegistrySubjectDefinitionV3 =>
        !("schemaVersion" in resource) ||
        resource.resourceRef ===
          "worldkit://subject-definition/humanoid.g-bot@1",
    ),
  );
  const stableCapabilitySubjectDefinitions = deepFreeze(
    stableSubjectDefinitions.filter(
      (resource): resource is RegistrySubjectDefinitionV3 =>
        "schemaVersion" in resource && resource.schemaVersion === 3,
    ),
  );
  const stableCapabilityResources = deepFreeze(
    stableResources.filter(
      (resource): resource is SubjectCapabilityResourceV1 =>
        resource.kind !== "subject-definition" &&
        "authoringAvailability" in resource,
    ),
  );
  const capabilityDrivenRegistry = stableResources.some(
    (resource) => resource.kind === "motion-kernel",
  );
  const builtInLegacyResourceRefs = new Set([
    "worldkit://subject-asset/humanoid.golden@1",
    "worldkit://subject-asset/actor.humanoid.g-bot@1",
    "worldkit://rig-profile/biped.golden@1",
    "worldkit://rig-profile/biped.mixamo-g-bot@1",
    "worldkit://animation-set/humanoid.ground.golden@1",
    "worldkit://animation-set/humanoid.ground.g-bot@1",
    "worldkit://collider-profile/humanoid.medium-capsule@1",
    "worldkit://collider-profile/humanoid.g-bot-capsule@1",
    "worldkit://subject-definition/humanoid.rigged-golden@1",
    "worldkit://subject-definition/humanoid.third-person@1",
    "worldkit://subject-definition/quadruped.ground-proxy@1",
    "worldkit://capability/locomotion.ground@1",
    "worldkit://physics-body-profile/character.medium@1",
    "worldkit://locomotion-profile/ground.standard@1",
    "worldkit://collider-derivation-profile/vertical-character-capsule@1",
  ]);
  const stableLegacyResources = deepFreeze(
    stableResources.filter(
      (resource): resource is SubjectRegistryResourceV1 => {
        if (capabilityDrivenRegistry) {
          return builtInLegacyResourceRefs.has(resource.resourceRef);
        }
        return resource.kind === "subject-asset" ||
          resource.kind === "rig-profile" ||
          resource.kind === "animation-set" ||
          resource.kind === "collider-profile" ||
          (resource.kind === "subject-definition" && !("schemaVersion" in resource)) ||
          resource.kind === "capability" ||
          resource.kind === "physics-body-profile" ||
          resource.kind === "locomotion-profile" ||
          resource.kind === "collider-derivation-profile";
      },
    ),
  );

  return Object.freeze({
    resolveSubjectAsset(resourceRef: string): SubjectAssetManifestV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "subject-asset" ? resource : undefined;
    },
    resolveRigProfile(resourceRef: string): RigProfileManifestV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "rig-profile" ? resource : undefined;
    },
    resolveAnimationSet(resourceRef: string): AnimationSetManifestV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "animation-set" ? resource : undefined;
    },
    resolveColliderProfile(resourceRef: string): ColliderProfileManifestV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "collider-profile" ? resource : undefined;
    },
    resolveSubjectDefinition(
      resourceRef: string,
    ): RegistrySubjectDefinitionV2 | RegistrySubjectDefinitionV3 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "subject-definition" ? resource : undefined;
    },
    resolveCapability(resourceRef: string): CapabilityManifestV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "capability" ? resource : undefined;
    },
    resolvePhysicsBodyProfile(
      resourceRef: string,
    ): PhysicsBodyProfileManifestV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "physics-body-profile" ? resource : undefined;
    },
    resolveLocomotionProfile(resourceRef: string): LocomotionProfileManifestV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "locomotion-profile" ? resource : undefined;
    },
    resolveColliderDerivationProfile(
      resourceRef: string,
    ): ColliderDerivationProfileManifestV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "collider-derivation-profile" ? resource : undefined;
    },
    resolveMotionKernel(resourceRef: string): MotionKernelDefinitionV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "motion-kernel" ? resource : undefined;
    },
    resolveMotionProfile(resourceRef: string): MotionProfileV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "motion-profile" ? resource : undefined;
    },
    resolveControlFeelProfile(resourceRef: string): ControlFeelProfileV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "control-feel-profile" ? resource : undefined;
    },
    resolveControlProfile(resourceRef: string): ControlProfileV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "control-profile" ? resource : undefined;
    },
    resolveCameraRigAlgorithm(
      resourceRef: string,
    ): CameraRigAlgorithmDefinitionV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "camera-rig-algorithm" ? resource : undefined;
    },
    resolveCameraRigProfile(resourceRef: string): CameraRigProfileV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "camera-rig-profile" ? resource : undefined;
    },
    resolveCameraModifierProfile(resourceRef: string): CameraModifierProfileV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "camera-modifier-profile" ? resource : undefined;
    },
    resolveCameraContextProfile(resourceRef: string): CameraContextProfileV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "camera-context-profile" ? resource : undefined;
    },
    resolveMediumProfile(resourceRef: string): MediumProfileV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "medium-profile" ? resource : undefined;
    },
    resolveRelationshipProfile(resourceRef: string): RelationshipProfileV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "relationship-profile" ? resource : undefined;
    },
    resolveHarnessProfile(resourceRef: string): HarnessProfileV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "harness-profile" ? resource : undefined;
    },
    resolvePoseSetProfile(resourceRef: string): PoseSetProfileV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "pose-set-profile" ? resource : undefined;
    },
    resolveRenderBindingProfile(resourceRef: string): RenderBindingProfileV1 | undefined {
      const resource = resourcesByRef.get(resourceRef);
      return resource?.kind === "render-binding-profile" ? resource : undefined;
    },
    listSubjectDefinitions(): readonly (
      | RegistrySubjectDefinitionV2
      | RegistrySubjectDefinitionV3
    )[] {
      return stableCliSubjectDefinitions;
    },
    listCapabilitySubjectDefinitions(): readonly RegistrySubjectDefinitionV3[] {
      return stableCapabilitySubjectDefinitions;
    },
    listResources(): readonly SubjectRegistryResourceV1[] {
      return stableLegacyResources;
    },
    listCapabilityResources(): readonly SubjectCapabilityResourceV1[] {
      return stableCapabilityResources;
    },
  });
}
