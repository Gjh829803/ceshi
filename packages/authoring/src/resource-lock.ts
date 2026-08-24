import type {
  AnimationSetManifestV1,
  ColliderProfileManifestV1,
  RigProfileManifestV1,
  SubjectAssetManifestV1,
  SubjectRegistryResourceV3,
} from "@whitebox-world/subject-registry";
import { canonicalExecutionResourceLockEntriesV1 } from "@whitebox-world/runtime-contracts";

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

function normalizeSubjectAsset(
  resource: SubjectAssetManifestV1,
): NormalizedSubjectAssetV1 {
  return {
    subjectAssetRef: resource.resourceRef,
    artifactContentHash: resource.artifact.contentHash,
    byteLength: resource.artifact.byteLength,
    mediaType: resource.artifact.mediaType,
    format: resource.format,
    inventory: {
      meshCount: resource.inventory.meshCount,
      vertexCount: resource.inventory.vertexCount,
      triangleCount: resource.inventory.triangleCount,
      skeletonCount: resource.inventory.skeletonCount,
      boneCount: resource.inventory.boneCount,
      animationClipNames: [...resource.inventory.animationClipNames],
    },
  };
}

function normalizeRigProfile(
  resource: RigProfileManifestV1,
): NormalizedRigProfileV1 {
  return {
    rigProfileRef: resource.resourceRef,
    bodyTopology: resource.bodyTopology,
    skeletonRootBoneName: resource.skeletonRootBoneName,
    requiredBoneIds: [...resource.requiredBoneIds],
    sourceNodeNameByBoneId: {
      chest: resource.sourceNodeNameByBoneId.chest,
      "foot.left": resource.sourceNodeNameByBoneId["foot.left"],
      "foot.right": resource.sourceNodeNameByBoneId["foot.right"],
      "hand.left": resource.sourceNodeNameByBoneId["hand.left"],
      "hand.right": resource.sourceNodeNameByBoneId["hand.right"],
      head: resource.sourceNodeNameByBoneId.head,
      hips: resource.sourceNodeNameByBoneId.hips,
      "lower-arm.left": resource.sourceNodeNameByBoneId["lower-arm.left"],
      "lower-arm.right": resource.sourceNodeNameByBoneId["lower-arm.right"],
      "lower-leg.left": resource.sourceNodeNameByBoneId["lower-leg.left"],
      "lower-leg.right": resource.sourceNodeNameByBoneId["lower-leg.right"],
      neck: resource.sourceNodeNameByBoneId.neck,
      spine: resource.sourceNodeNameByBoneId.spine,
      "upper-arm.left": resource.sourceNodeNameByBoneId["upper-arm.left"],
      "upper-arm.right": resource.sourceNodeNameByBoneId["upper-arm.right"],
      "upper-leg.left": resource.sourceNodeNameByBoneId["upper-leg.left"],
      "upper-leg.right": resource.sourceNodeNameByBoneId["upper-leg.right"],
    },
  };
}

function normalizeAnimationSet(
  resource: AnimationSetManifestV1,
): NormalizedAnimationSetV1 {
  return {
    animationSetRef: resource.resourceRef,
    subjectAssetRef: resource.subjectAssetRef,
    rigProfileRef: resource.rigProfileRef,
    defaultActionId: resource.defaultActionId,
    requiredActionIds: [...resource.requiredActionIds],
    animationBindings: resource.animationBindings.map((binding) => ({
      actionId: binding.actionId,
      sourceClipName: binding.sourceClipName,
      loopMode: binding.loopMode,
      playbackSpeedRatio: binding.playbackSpeedRatio,
      blendDurationSeconds: binding.blendDurationSeconds,
      rootMotionMode: binding.rootMotionMode,
    })),
  };
}

function normalizeColliderProfile(
  resource: ColliderProfileManifestV1,
): NormalizedColliderProfileV1 {
  return {
    colliderProfileRef: resource.resourceRef,
    supportedBodyTopologies: [...resource.supportedBodyTopologies],
    collider: {
      kind: resource.collider.kind,
      radiusMeters: resource.collider.radiusMeters,
      heightMeters: resource.collider.heightMeters,
      centerOffsetFromSubjectOriginMetersXYZ: [
        resource.collider.centerOffsetFromSubjectOriginMetersXYZ[0],
        resource.collider.centerOffsetFromSubjectOriginMetersXYZ[1],
        resource.collider.centerOffsetFromSubjectOriginMetersXYZ[2],
      ],
    },
  };
}

export class ResourceLockBuilderV1 {
  readonly #entriesByRef = new Map<string, ResolvedResourceLockEntryV1>();
  readonly #subjectAssetsByRef = new Map<string, SubjectAssetManifestV1>();
  readonly #rigProfilesByRef = new Map<string, RigProfileManifestV1>();
  readonly #animationSetsByRef = new Map<string, AnimationSetManifestV1>();
  readonly #colliderProfilesByRef = new Map<string, ColliderProfileManifestV1>();

  public addRegistryResource(
    resource: SubjectRegistryResourceV3,
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
          this.#subjectAssetsByRef.set(resource.resourceRef, structuredClone(resource));
        }
        break;
      case "rig-profile":
        if (!this.#rigProfilesByRef.has(resource.resourceRef)) {
          this.#rigProfilesByRef.set(resource.resourceRef, structuredClone(resource));
        }
        break;
      case "animation-set":
        if (!this.#animationSetsByRef.has(resource.resourceRef)) {
          this.#animationSetsByRef.set(resource.resourceRef, structuredClone(resource));
        }
        break;
      case "collider-profile":
        if (!this.#colliderProfilesByRef.has(resource.resourceRef)) {
          this.#colliderProfilesByRef.set(resource.resourceRef, structuredClone(resource));
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

  public addResolvedResource(
    entry: ResolvedResourceLockEntryV1,
    instancePath: string,
    diagnostics: AuthoringDiagnostic[],
  ): void {
    this.#addEntry(structuredClone(entry), instancePath, diagnostics);
  }

  public finish(): {
    subjectAssets: readonly NormalizedSubjectAssetV1[];
    rigProfiles: readonly NormalizedRigProfileV1[];
    animationSets: readonly NormalizedAnimationSetV1[];
    colliderProfiles: readonly NormalizedColliderProfileV1[];
    resourceLock: readonly ResolvedResourceLockEntryV1[];
    resourceLockHash: string;
  } {
    const resourceLock = canonicalExecutionResourceLockEntriesV1(
      [...this.#entriesByRef.values()],
    );
    return {
      subjectAssets: this.#sortedResources(
        this.#subjectAssetsByRef,
        normalizeSubjectAsset,
      ),
      rigProfiles: this.#sortedResources(
        this.#rigProfilesByRef,
        normalizeRigProfile,
      ),
      animationSets: this.#sortedResources(
        this.#animationSetsByRef,
        normalizeAnimationSet,
      ),
      colliderProfiles: this.#sortedResources(
        this.#colliderProfilesByRef,
        normalizeColliderProfile,
      ),
      resourceLock,
      resourceLockHash: sha256CanonicalJson(resourceLock),
    };
  }

  #sortedResources<T extends { resourceRef: string }, U>(
    resourcesByRef: ReadonlyMap<string, T>,
    normalize: (resource: T) => U,
  ): readonly U[] {
    return [...resourcesByRef.values()]
      .sort((left, right) =>
        left.resourceRef < right.resourceRef
          ? -1
          : left.resourceRef > right.resourceRef
            ? 1
            : 0
      )
      .map(normalize);
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
