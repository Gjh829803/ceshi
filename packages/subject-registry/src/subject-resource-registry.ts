import { sha256CanonicalJson } from "@whitebox-world/protocol";

import { BUILT_IN_SUBJECT_RESOURCE_MANIFESTS } from "./built-in-resource-manifests";
import { BUILT_IN_SUBJECT_DEFINITIONS } from "./built-in-subject-definitions";
import type {
  AnimationSetManifestInputV1,
  AnimationSetManifestV1,
  CapabilityManifestV1,
  ColliderProfileManifestV1,
  ColliderDerivationProfileManifestV1,
  LocomotionProfileManifestV1,
  PhysicsBodyProfileManifestV1,
  RegistrySubjectDefinitionV2,
  RigProfileManifestV1,
  SubjectAssetManifestV1,
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

function lockResource(source: SubjectRegistryResourceInputV1): SubjectRegistryResourceV1 {
  const { contentHash: _ignoredContentHash, ...sourceWithoutContentHash } = source as
    SubjectRegistryResourceInputV1 & { contentHash?: string };
  const hashInput = structuredClone(sourceWithoutContentHash) as SubjectRegistryResourceInputV1;
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
    if (source.kind === "animation-set") validateAnimationSet(source);
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
