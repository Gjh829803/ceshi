import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type {
  SubjectPresetClosureV1,
  SubjectPresetResourceLockEntryV1,
  SubjectResourceKindV1,
} from "@whitebox-world/subject-contracts";

import { listSubjectRegistryReferenceEdgesV1 } from "./subject-registry-reference-edges";
import type {
  RegistrySubjectDefinitionV3,
  SubjectRegistryResourceV3,
  SubjectResourceRegistryV3,
} from "./types-v3";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertExactLockedResource(
  resource: SubjectRegistryResourceV3,
  expectedResourceKinds: readonly SubjectResourceKindV1[],
  requestedRef: string,
): void {
  if (
    !expectedResourceKinds.includes(resource.kind) ||
    resource.resourceRef !== requestedRef
  ) {
    throw new Error(
      `SUBJECT_PRESET_CLOSURE_KIND_MISMATCH: '${requestedRef}' must resolve as '${expectedResourceKinds.join("' or '")}'.`,
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
 * Only dependency edges expand the closure; metadata and safe Runtime
 * back-references remain admitted Registry references without becoming locks.
 */
export function resolveSubjectPresetClosureV1(
  registry: SubjectResourceRegistryV3,
  subjectDefinitionRef: string,
): SubjectPresetClosureV1 {
  const entriesByRef = new Map<string, SubjectPresetResourceLockEntryV1>();
  const activeRefs = new Set<string>();

  const visit = (
    resourceRef: string,
    expectedResourceKinds: readonly SubjectResourceKindV1[],
  ): SubjectRegistryResourceV3 => {
    if (activeRefs.has(resourceRef)) {
      throw new Error(`SUBJECT_PRESET_CLOSURE_CYCLE: '${resourceRef}'.`);
    }
    const existing = entriesByRef.get(resourceRef);
    if (existing !== undefined) {
      if (!expectedResourceKinds.includes(existing.resourceKind)) {
        throw new Error(
          `SUBJECT_PRESET_CLOSURE_KIND_MISMATCH: '${resourceRef}' was already locked as '${existing.resourceKind}', expected '${expectedResourceKinds.join("' or '")}'.`,
        );
      }
      const resolved = registry.resolveResource(resourceRef);
      if (resolved === undefined) {
        throw new Error(
          `SUBJECT_PRESET_CLOSURE_MISSING_RESOURCE: '${resourceRef}'.`,
        );
      }
      return resolved;
    }

    const resource = registry.resolveResource(resourceRef);
    if (resource === undefined) {
      throw new Error(
        `SUBJECT_PRESET_CLOSURE_MISSING_RESOURCE: '${expectedResourceKinds.join("' or '")}' '${resourceRef}'.`,
      );
    }
    assertExactLockedResource(resource, expectedResourceKinds, resourceRef);
    activeRefs.add(resourceRef);
    entriesByRef.set(resourceRef, {
      resourceRef,
      resourceKind: resource.kind,
      version: resource.version,
      contentHash: resource.contentHash,
    });

    if (resource.kind === "subject-definition" && !isCapabilitySubjectDefinition(resource)) {
      throw new Error(
        `SUBJECT_PRESET_CLOSURE_UNSUPPORTED_DEFINITION: '${resourceRef}' is not schemaVersion 3.`,
      );
    }
    for (const referenceEdge of listSubjectRegistryReferenceEdgesV1(resource)) {
      if (referenceEdge.type !== "dependency") continue;
      visit(referenceEdge.targetResourceRef, referenceEdge.expectedResourceKinds);
    }

    activeRefs.delete(resourceRef);
    return resource;
  };

  const subjectDefinition = visit(subjectDefinitionRef, ["subject-definition"]);
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
