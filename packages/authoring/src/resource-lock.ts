import type {
  AnimationSetManifestV1,
  ColliderProfileManifestV1,
  RigProfileManifestV1,
  SubjectAssetManifestV1,
  SubjectRegistryResourceV1,
} from "@whitebox-world/subject-registry";

import { sha256CanonicalJson } from "./canonical-json";
import type {
  AuthoringDiagnostic,
  NormalizedAnimationSetV1,
  NormalizedColliderProfileV1,
  NormalizedRigProfileV1,
  NormalizedSubjectAssetV1,
  ResolvedResourceLockEntryV1,
} from "./types";

function pushConflict(
  diagnostics: AuthoringDiagnostic[],
  instancePath: string,
  message: string,
  details: Readonly<Record<string, unknown>>,
): void {
  diagnostics.push({
    severity: "error",
    code: "SUBJECT_RESOURCE_LOCK_CONFLICT",
    instancePath,
    message,
    details,
  });
}

export class ResourceLockBuilderV1 {
  readonly #entriesByRef = new Map<string, ResolvedResourceLockEntryV1>();
  readonly #subjectAssetsByRef = new Map<string, SubjectAssetManifestV1>();
  readonly #rigProfilesByRef = new Map<string, RigProfileManifestV1>();
  readonly #animationSetsByRef = new Map<string, AnimationSetManifestV1>();
  readonly #colliderProfilesByRef = new Map<string, ColliderProfileManifestV1>();

  public addRegistryResource(
    resource: SubjectRegistryResourceV1,
    instancePath: string,
    diagnostics: AuthoringDiagnostic[],
  ): void {
    const { contentHash, ...hashInput } = resource;
    const actualContentHash = sha256CanonicalJson(hashInput);
    if (actualContentHash !== contentHash) {
      pushConflict(
        diagnostics,
        instancePath,
        `Registry resource '${resource.resourceRef}' does not match its immutable content hash.`,
        {
          resourceRef: resource.resourceRef,
          declaredContentHash: contentHash,
          actualContentHash,
        },
      );
      return;
    }

    this.#addEntry(
      {
        resourceRef: resource.resourceRef,
        resourceKind: resource.kind,
        resolvedVersion: String(resource.version),
        contentHash,
      },
      instancePath,
      diagnostics,
    );
    switch (resource.kind) {
      case "subject-asset":
        if (!this.#subjectAssetsByRef.has(resource.resourceRef)) {
          this.#subjectAssetsByRef.set(resource.resourceRef, {
            ...structuredClone(resource),
            inventory: {
              ...structuredClone(resource.inventory),
              animationClipNames: [...resource.inventory.animationClipNames].sort(
                (left, right) => left.localeCompare(right),
              ),
            },
            aiMetadata: {
              ...structuredClone(resource.aiMetadata),
              semanticTags: [...resource.aiMetadata.semanticTags].sort((left, right) =>
                left.localeCompare(right),
              ),
            },
          });
        }
        break;
      case "rig-profile":
        if (!this.#rigProfilesByRef.has(resource.resourceRef)) {
          this.#rigProfilesByRef.set(resource.resourceRef, {
            ...structuredClone(resource),
            compatibleSubjectAssetRefs: [...resource.compatibleSubjectAssetRefs].sort(
              (left, right) => left.localeCompare(right),
            ),
            requiredBoneIds: [...resource.requiredBoneIds].sort((left, right) =>
              left.localeCompare(right),
            ),
            sourceNodeNameByBoneId: Object.fromEntries(
              Object.entries(resource.sourceNodeNameByBoneId).sort(([left], [right]) =>
                left.localeCompare(right),
              ),
            ) as RigProfileManifestV1["sourceNodeNameByBoneId"],
            aiMetadata: {
              ...structuredClone(resource.aiMetadata),
              semanticTags: [...resource.aiMetadata.semanticTags].sort((left, right) =>
                left.localeCompare(right),
              ),
            },
          });
        }
        break;
      case "animation-set":
        if (!this.#animationSetsByRef.has(resource.resourceRef)) {
          this.#animationSetsByRef.set(resource.resourceRef, {
            ...structuredClone(resource),
            requiredActionIds: [...resource.requiredActionIds].sort((left, right) =>
              left.localeCompare(right),
            ),
            animationBindings: [...resource.animationBindings]
              .sort((left, right) => left.actionId.localeCompare(right.actionId))
              .map((binding) => structuredClone(binding)),
            aiMetadata: {
              ...structuredClone(resource.aiMetadata),
              semanticTags: [...resource.aiMetadata.semanticTags].sort((left, right) =>
                left.localeCompare(right),
              ),
            },
          });
        }
        break;
      case "collider-profile":
        if (!this.#colliderProfilesByRef.has(resource.resourceRef)) {
          this.#colliderProfilesByRef.set(resource.resourceRef, {
            ...structuredClone(resource),
            supportedBodyTopologies: [...resource.supportedBodyTopologies].sort(
              (left, right) => left.localeCompare(right),
            ),
            aiMetadata: {
              ...structuredClone(resource.aiMetadata),
              semanticTags: [...resource.aiMetadata.semanticTags].sort((left, right) =>
                left.localeCompare(right),
              ),
            },
          });
        }
        break;
    }
  }

  public addPackageSubjectDefinition(
    resourceRef: string,
    version: number,
    subjectDefinitionHash: string,
    instancePath: string,
    diagnostics: AuthoringDiagnostic[],
  ): void {
    this.#addEntry(
      {
        resourceRef,
        resourceKind: "subject-definition",
        resolvedVersion: String(version),
        contentHash: subjectDefinitionHash,
      },
      instancePath,
      diagnostics,
    );
  }

  public finish(): {
    subjectAssets: readonly NormalizedSubjectAssetV1[];
    rigProfiles: readonly NormalizedRigProfileV1[];
    animationSets: readonly NormalizedAnimationSetV1[];
    colliderProfiles: readonly NormalizedColliderProfileV1[];
    resourceLock: readonly ResolvedResourceLockEntryV1[];
    resourceLockHash: string;
  } {
    const resourceLock = [...this.#entriesByRef.values()].sort((left, right) =>
      left.resourceRef.localeCompare(right.resourceRef),
    );
    return {
      subjectAssets: this.#sortedResources(this.#subjectAssetsByRef),
      rigProfiles: this.#sortedResources(this.#rigProfilesByRef),
      animationSets: this.#sortedResources(this.#animationSetsByRef),
      colliderProfiles: this.#sortedResources(this.#colliderProfilesByRef),
      resourceLock,
      resourceLockHash: sha256CanonicalJson(resourceLock),
    };
  }

  #sortedResources<T extends { resourceRef: string }>(
    resourcesByRef: ReadonlyMap<string, T>,
  ): readonly T[] {
    return [...resourcesByRef.values()]
      .sort((left, right) => left.resourceRef.localeCompare(right.resourceRef))
      .map((resource) => structuredClone(resource));
  }

  #addEntry(
    entry: ResolvedResourceLockEntryV1,
    instancePath: string,
    diagnostics: AuthoringDiagnostic[],
  ): void {
    const existing = this.#entriesByRef.get(entry.resourceRef);
    if (existing === undefined) {
      this.#entriesByRef.set(entry.resourceRef, entry);
      return;
    }
    if (
      existing.resourceKind !== entry.resourceKind ||
      existing.resolvedVersion !== entry.resolvedVersion ||
      existing.contentHash !== entry.contentHash
    ) {
      pushConflict(
        diagnostics,
        instancePath,
        `Resource '${entry.resourceRef}' resolved to conflicting immutable content.`,
        { resourceRef: entry.resourceRef, first: existing, conflicting: entry },
      );
    }
  }
}
