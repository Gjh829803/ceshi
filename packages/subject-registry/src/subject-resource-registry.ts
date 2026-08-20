import { sha256CanonicalJson } from "@whitebox-world/protocol";

import { BUILT_IN_SUBJECT_RESOURCE_MANIFESTS } from "./built-in-resource-manifests";
import { BUILT_IN_SUBJECT_DEFINITIONS } from "./built-in-subject-definitions";
import {
  BUILT_IN_CAPABILITY_MANIFESTS,
  BUILT_IN_CAPABILITY_RESOURCES,
} from "./built-in-capability-resources";
import subjectDefinitionsV3 from "../../../assets/registry/subject-definitions/catalog.json";
import type {
  AnimationSetManifestInputV1,
  AnimationSetManifestV1,
  CapabilityManifestV1,
  ColliderProfileManifestInputV1,
  ColliderProfileManifestV1,
  ColliderDerivationProfileManifestV1,
  LocomotionProfileManifestV1,
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
  CameraRigAlgorithmDefinitionV1,
  CameraRigProfileInputV1,
  CameraRigProfileV1,
  ControlProfileV1,
  HarnessProfileV1,
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
  SubjectResourceRegistryV3,
} from "./types-v3";

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

function validateMotionProfile(source: MotionProfileInputV1): void {
  for (const [parameterName, parameterValue] of Object.entries(source.parameters)) {
    if (typeof parameterValue !== "number") continue;
    if (!Number.isFinite(parameterValue)) {
      throw new Error(
        `SUBJECT_REGISTRY_NON_FINITE_PARAMETER: '${parameterName}' in '${source.resourceRef}'.`,
      );
    }
    const limit = source.safetyLimits[parameterName];
    if (limit === undefined) {
      throw new Error(
        `SUBJECT_REGISTRY_MISSING_SAFETY_LIMIT: '${parameterName}' in '${source.resourceRef}'.`,
      );
    }
    if (parameterValue < limit.minimum || parameterValue > limit.maximum) {
      throw new Error(
        `SUBJECT_REGISTRY_PARAMETER_OUT_OF_RANGE: '${parameterName}' in '${source.resourceRef}'.`,
      );
    }
  }
  for (const [parameterName, range] of Object.entries(source.authoringRanges ?? {})) {
    const safetyLimit = source.safetyLimits[parameterName];
    const parameterValue = source.parameters[parameterName];
    if (
      safetyLimit === undefined ||
      typeof parameterValue !== "number" ||
      ![range.minimum, range.maximum, range.step].every(Number.isFinite) ||
      range.minimum > range.maximum ||
      range.step <= 0 ||
      range.minimum < safetyLimit.minimum ||
      range.maximum > safetyLimit.maximum ||
      parameterValue < range.minimum ||
      parameterValue > range.maximum
    ) {
      throw new Error(
        `SUBJECT_REGISTRY_INVALID_AUTHORING_RANGE: '${parameterName}' in '${source.resourceRef}'.`,
      );
    }
  }
}

function validateCameraProfile(source: CameraRigProfileInputV1): void {
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
        requireRef(resource.resourceRef, rule.cameraRigProfileRef, "camera-rig-profile");
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
    if (source.kind === "motion-profile") validateMotionProfile(source);
    if (source.kind === "camera-rig-profile") validateCameraProfile(source);
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
  const stableLegacySubjectDefinitions = deepFreeze(
    stableSubjectDefinitions.filter(
      (resource): resource is RegistrySubjectDefinitionV2 =>
        !("schemaVersion" in resource),
    ),
  );
  const capabilityDrivenRegistry = stableResources.some(
    (resource) => resource.kind === "motion-kernel",
  );
  const builtInLegacyResourceRefs = new Set([
    "worldkit://subject-asset/humanoid.golden@1",
    "worldkit://rig-profile/biped.golden@1",
    "worldkit://animation-set/humanoid.ground.golden@1",
    "worldkit://collider-profile/humanoid.medium-capsule@1",
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
    listSubjectDefinitions(): readonly RegistrySubjectDefinitionV2[] {
      return stableLegacySubjectDefinitions;
    },
    listAllSubjectDefinitions(): readonly (
      | RegistrySubjectDefinitionV2
      | RegistrySubjectDefinitionV3
    )[] {
      return stableSubjectDefinitions;
    },
    listResources(): readonly SubjectRegistryResourceV1[] {
      return stableLegacyResources;
    },
    listAllResources(): readonly SubjectRegistryResourceV3[] {
      return stableResources;
    },
  });
}

export const builtInSubjectResourceRegistry = createSubjectResourceRegistry([
  ...BUILT_IN_SUBJECT_DEFINITIONS,
  ...(subjectDefinitionsV3 as unknown as readonly RegistrySubjectDefinitionInputV3[]),
  ...BUILT_IN_SUBJECT_RESOURCE_MANIFESTS,
  ...BUILT_IN_CAPABILITY_MANIFESTS,
  ...BUILT_IN_CAPABILITY_RESOURCES,
]);
