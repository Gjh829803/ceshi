import type { SubjectRegistryResourceV1 } from "@whitebox-world/subject-registry";

import { sha256CanonicalJson } from "./canonical-json";
import type {
  AuthoringDiagnostic,
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
    resourceLock: readonly ResolvedResourceLockEntryV1[];
    resourceLockHash: string;
  } {
    const resourceLock = [...this.#entriesByRef.values()].sort((left, right) =>
      left.resourceRef.localeCompare(right.resourceRef),
    );
    return {
      resourceLock,
      resourceLockHash: sha256CanonicalJson(resourceLock),
    };
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
