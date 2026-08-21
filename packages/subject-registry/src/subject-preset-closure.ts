import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type {
  RegistrySubjectDefinitionV3,
  SubjectRegistryResourceV3,
  SubjectResourceRegistryV3,
} from "./types-v3";

export interface SubjectPresetResourceLockEntryV1 {
  resourceRef: string;
  resourceKind: SubjectRegistryResourceV3["kind"];
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

type ResourceKindV1 = SubjectRegistryResourceV3["kind"];

const RELATIONSHIP_PROFILE_REF_BY_CAPABILITY_REF_V1: Readonly<Record<string, string>> = {
  "worldkit://capability/relationship.mount@1":
    "worldkit://relationship-profile/mount.reserved@1",
  "worldkit://capability/relationship.seat@1":
    "worldkit://relationship-profile/seat.driver@1",
  "worldkit://capability/relationship.tether@1":
    "worldkit://relationship-profile/tether.standard@1",
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function resolveResourceByKind(
  registry: SubjectResourceRegistryV3,
  resourceKind: ResourceKindV1,
  resourceRef: string,
): SubjectRegistryResourceV3 | undefined {
  switch (resourceKind) {
    case "subject-asset":
      return registry.resolveSubjectAsset(resourceRef);
    case "rig-profile":
      return registry.resolveRigProfile(resourceRef);
    case "animation-set":
      return registry.resolveAnimationSet(resourceRef);
    case "collider-profile":
      return registry.resolveColliderProfile(resourceRef);
    case "subject-definition":
      return registry.resolveSubjectDefinition(resourceRef);
    case "capability":
      return registry.resolveCapability(resourceRef);
    case "physics-body-profile":
      return registry.resolvePhysicsBodyProfile(resourceRef);
    case "locomotion-profile":
      return registry.resolveLocomotionProfile(resourceRef);
    case "collider-derivation-profile":
      return registry.resolveColliderDerivationProfile(resourceRef);
    case "motion-kernel":
      return registry.resolveMotionKernel(resourceRef);
    case "motion-profile":
      return registry.resolveMotionProfile(resourceRef);
    case "control-feel-profile":
      return registry.resolveControlFeelProfile(resourceRef);
    case "control-profile":
      return registry.resolveControlProfile(resourceRef);
    case "camera-rig-algorithm":
      return registry.resolveCameraRigAlgorithm(resourceRef);
    case "camera-rig-profile":
      return registry.resolveCameraRigProfile(resourceRef);
    case "camera-modifier-profile":
      return registry.resolveCameraModifierProfile(resourceRef);
    case "camera-context-profile":
      return registry.resolveCameraContextProfile(resourceRef);
    case "medium-profile":
      return registry.resolveMediumProfile(resourceRef);
    case "relationship-profile":
      return registry.resolveRelationshipProfile(resourceRef);
    case "harness-profile":
      return registry.resolveHarnessProfile(resourceRef);
    case "pose-set-profile":
      return registry.resolvePoseSetProfile(resourceRef);
    case "render-binding-profile":
      return registry.resolveRenderBindingProfile(resourceRef);
  }
}

function assertExactLockedResource(
  resource: SubjectRegistryResourceV3,
  expectedKind: ResourceKindV1,
  requestedRef: string,
): void {
  if (resource.kind !== expectedKind || resource.resourceRef !== requestedRef) {
    throw new Error(
      `SUBJECT_PRESET_CLOSURE_KIND_MISMATCH: '${requestedRef}' must resolve as '${expectedKind}'.`,
    );
  }
  const exactVersion = /@([1-9]\d*)$/.exec(requestedRef)?.[1];
  if (exactVersion === undefined || Number(exactVersion) !== resource.version) {
    throw new Error(
      `SUBJECT_PRESET_CLOSURE_VERSION_MISMATCH: '${requestedRef}' resolved version '${resource.version}'.`,
    );
  }
  const { contentHash, ...hashInput } = resource;
  if (contentHash !== sha256CanonicalJson(hashInput)) {
    throw new Error(
      `SUBJECT_PRESET_CLOSURE_CONTENT_HASH_MISMATCH: '${requestedRef}'.`,
    );
  }
}

function isCapabilitySubjectDefinition(
  resource: SubjectRegistryResourceV3,
): resource is RegistrySubjectDefinitionV3 {
  return resource.kind === "subject-definition" &&
    "schemaVersion" in resource &&
    resource.schemaVersion === 3;
}

/**
 * Resolves the immutable Registry lock for one exact V3 Subject Definition.
 *
 * Kernel fallback refs are metadata rather than graph edges here: the Subject
 * Definition already declares the authoritative default/optional/fallback
 * Motion roles, while Kernel↔Profile fallback pointers intentionally form
 * safe Runtime back-references.
 */
export function resolveSubjectPresetClosureV1(
  registry: SubjectResourceRegistryV3,
  subjectDefinitionRef: string,
): SubjectPresetClosureV1 {
  const entriesByRef = new Map<string, SubjectPresetResourceLockEntryV1>();
  const activeRefs = new Set<string>();

  const visit = (resourceRef: string, resourceKind: ResourceKindV1): SubjectRegistryResourceV3 => {
    if (activeRefs.has(resourceRef)) {
      throw new Error(`SUBJECT_PRESET_CLOSURE_CYCLE: '${resourceRef}'.`);
    }
    const existing = entriesByRef.get(resourceRef);
    if (existing !== undefined) {
      if (existing.resourceKind !== resourceKind) {
        throw new Error(
          `SUBJECT_PRESET_CLOSURE_KIND_MISMATCH: '${resourceRef}' was already locked as '${existing.resourceKind}'.`,
        );
      }
      const resolved = resolveResourceByKind(registry, resourceKind, resourceRef);
      if (resolved === undefined) {
        throw new Error(
          `SUBJECT_PRESET_CLOSURE_MISSING_RESOURCE: '${resourceKind}' '${resourceRef}'.`,
        );
      }
      return resolved;
    }

    const resource = resolveResourceByKind(registry, resourceKind, resourceRef);
    if (resource === undefined) {
      throw new Error(
        `SUBJECT_PRESET_CLOSURE_MISSING_RESOURCE: '${resourceKind}' '${resourceRef}'.`,
      );
    }
    assertExactLockedResource(resource, resourceKind, resourceRef);
    activeRefs.add(resourceRef);
    entriesByRef.set(resourceRef, {
      resourceRef,
      resourceKind,
      version: resource.version,
      contentHash: resource.contentHash,
    });

    switch (resource.kind) {
      case "subject-definition": {
        if (!isCapabilitySubjectDefinition(resource)) {
          throw new Error(
            `SUBJECT_PRESET_CLOSURE_UNSUPPORTED_DEFINITION: '${resourceRef}' is not schemaVersion 3.`,
          );
        }
        for (const visualPart of resource.visualParts) {
          if (visualPart.kind === "asset") visit(visualPart.subjectAssetRef, "subject-asset");
        }
        if (resource.visualBinding.mode === "rigged") {
          visit(resource.visualBinding.rigProfileRef, "rig-profile");
          visit(resource.visualBinding.animationSetRef, "animation-set");
        }
        if (resource.colliderPolicy.kind === "profile") {
          visit(resource.colliderPolicy.colliderProfileRef, "collider-profile");
        } else {
          visit(
            resource.colliderPolicy.colliderDerivationProfileRef,
            "collider-derivation-profile",
          );
        }
        for (const capabilityRef of [
          ...resource.capabilityRefs,
          ...resource.relationshipCapabilityRefs,
        ]) {
          visit(capabilityRef, "capability");
        }
        for (const capabilityRef of resource.relationshipCapabilityRefs) {
          const relationshipProfileRef =
            RELATIONSHIP_PROFILE_REF_BY_CAPABILITY_REF_V1[capabilityRef];
          if (relationshipProfileRef !== undefined) {
            visit(relationshipProfileRef, "relationship-profile");
          }
        }
        visit(resource.profiles.physicsBodyProfileRef, "physics-body-profile");
        visit(resource.profiles.locomotionProfileRef, "locomotion-profile");
        visit(resource.profiles.controlFeelProfileRef, "control-feel-profile");
        for (const motionProfileRef of [
          resource.profiles.motion.defaultMotionProfileRef,
          ...resource.profiles.motion.optionalMotionProfileRefs,
          resource.profiles.motion.fallbackMotionProfileRef,
        ]) {
          visit(motionProfileRef, "motion-profile");
        }
        visit(resource.profiles.controlProfileRef, "control-profile");
        visit(resource.profiles.cameraContextProfileRef, "camera-context-profile");
        visit(resource.profiles.mediumProfileRef, "medium-profile");
        visit(resource.profiles.harnessProfileRef, "harness-profile");
        const animationSet = registry.resolveAnimationSet(resource.actionOrPoseSetRef);
        if (animationSet !== undefined) {
          visit(resource.actionOrPoseSetRef, "animation-set");
        } else {
          visit(resource.actionOrPoseSetRef, "pose-set-profile");
        }
        visit(resource.renderBindingProfileRef, "render-binding-profile");
        break;
      }
      case "animation-set":
        visit(resource.subjectAssetRef, "subject-asset");
        visit(resource.rigProfileRef, "rig-profile");
        break;
      case "capability":
        for (const capabilityRef of resource.requiredCapabilityRefs) {
          visit(capabilityRef, "capability");
        }
        break;
      case "locomotion-profile":
        for (const capabilityRef of resource.requiredCapabilityRefs) {
          visit(capabilityRef, "capability");
        }
        break;
      case "motion-kernel":
        for (const capabilityRef of resource.requiredCapabilityRefs) {
          visit(capabilityRef, "capability");
        }
        break;
      case "motion-profile":
        visit(resource.motionKernelRef, "motion-kernel");
        break;
      case "camera-rig-profile":
        visit(resource.algorithmRef, "camera-rig-algorithm");
        break;
      case "camera-context-profile":
        visit(resource.defaultCameraRigProfileRef, "camera-rig-profile");
        if (resource.firstPersonCameraRigProfileRef !== undefined) {
          visit(resource.firstPersonCameraRigProfileRef, "camera-rig-profile");
        }
        for (const rule of resource.rules) {
          if (rule.cameraRigProfileRef !== undefined) {
            visit(rule.cameraRigProfileRef, "camera-rig-profile");
          }
          for (const modifierRef of rule.cameraModifierRefs ?? []) {
            visit(modifierRef, "camera-modifier-profile");
          }
        }
        break;
      case "subject-asset":
      case "rig-profile":
      case "collider-profile":
      case "physics-body-profile":
      case "collider-derivation-profile":
      case "control-profile":
      case "camera-rig-algorithm":
      case "camera-modifier-profile":
      case "medium-profile":
      case "relationship-profile":
      case "harness-profile":
      case "pose-set-profile":
      case "render-binding-profile":
        break;
    }

    activeRefs.delete(resourceRef);
    return resource;
  };

  const subjectDefinition = visit(subjectDefinitionRef, "subject-definition");
  if (!isCapabilitySubjectDefinition(subjectDefinition)) {
    throw new Error(
      `SUBJECT_PRESET_CLOSURE_UNSUPPORTED_DEFINITION: '${subjectDefinitionRef}' is not schemaVersion 3.`,
    );
  }
  const entries = [...entriesByRef.values()]
    .sort((left, right) => left.resourceRef.localeCompare(right.resourceRef));
  const closure: SubjectPresetClosureV1 = {
    subjectDefinitionId: subjectDefinition.id,
    subjectDefinitionRef: subjectDefinition.resourceRef,
    subjectDefinitionContentHash: subjectDefinition.contentHash,
    entries,
    contentHash: sha256CanonicalJson(entries),
  };
  return deepFreeze(closure);
}
