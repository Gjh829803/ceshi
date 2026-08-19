import { sha256CanonicalJson } from "@whitebox-world/protocol";

import { BUILT_IN_SUBJECT_RESOURCE_MANIFESTS } from "./built-in-resource-manifests";
import { BUILT_IN_SUBJECT_DEFINITIONS } from "./built-in-subject-definitions";
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
  SubjectRegistryResourceInputV1,
  SubjectRegistryResourceV1,
  SubjectResourceRegistryV2,
} from "./types-v2";

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

function validateCanonicalizedSemanticTags(source: SubjectRegistryResourceInputV1): void {
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
  source: SubjectRegistryResourceInputV1,
): SubjectRegistryResourceInputV1 {
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
      return input;
  }
}

function lockResource(source: SubjectRegistryResourceInputV1): SubjectRegistryResourceV1 {
  const { contentHash: _ignoredContentHash, ...sourceWithoutContentHash } = source as
    SubjectRegistryResourceInputV1 & { contentHash?: string };
  const hashInput = canonicalizeNewResourceCollections(
    sourceWithoutContentHash as SubjectRegistryResourceInputV1,
  );
  return deepFreeze({
    ...hashInput,
    contentHash: sha256CanonicalJson(hashInput),
  } as SubjectRegistryResourceV1);
}

export function createSubjectResourceRegistry(
  resources: readonly SubjectRegistryResourceInputV1[],
): SubjectResourceRegistryV2 {
  const resourcesByRef = new Map<string, SubjectRegistryResourceV1>();
  for (const source of resources) {
    if (resourcesByRef.has(source.resourceRef)) {
      throw new Error(`SUBJECT_REGISTRY_DUPLICATE_REF: '${source.resourceRef}'.`);
    }
    if (source.kind === "subject-asset") validateSubjectAsset(source);
    if (source.kind === "animation-set") validateAnimationSet(source);
    if (source.kind === "rig-profile") validateRigProfile(source);
    if (source.kind === "collider-profile") validateColliderProfile(source);
    if (
      source.kind === "subject-asset" ||
      source.kind === "rig-profile" ||
      source.kind === "animation-set" ||
      source.kind === "collider-profile"
    ) {
      validateCanonicalizedSemanticTags(source);
    }
    resourcesByRef.set(source.resourceRef, lockResource(source));
  }

  const stableResources = deepFreeze(
    [...resourcesByRef.values()].sort((left, right) =>
      left.resourceRef.localeCompare(right.resourceRef),
    ),
  );
  const stableSubjectDefinitions = deepFreeze(
    stableResources.filter(
      (resource): resource is RegistrySubjectDefinitionV2 =>
        resource.kind === "subject-definition",
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
    resolveSubjectDefinition(resourceRef: string): RegistrySubjectDefinitionV2 | undefined {
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
    listSubjectDefinitions(): readonly RegistrySubjectDefinitionV2[] {
      return stableSubjectDefinitions;
    },
    listResources(): readonly SubjectRegistryResourceV1[] {
      return stableResources;
    },
  });
}

export const builtInSubjectResourceRegistry = createSubjectResourceRegistry([
  ...BUILT_IN_SUBJECT_DEFINITIONS,
  ...BUILT_IN_SUBJECT_RESOURCE_MANIFESTS,
]);
