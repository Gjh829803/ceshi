import defaultCatalog from "../../../assets/registry/subject-defaults/catalog.json";

import { builtInSubjectResourceRegistry } from "./subject-resource-registry";
import type { RegistrySubjectDefinitionV3, SubjectResourceRegistryV3 } from "./types-v3";

export interface SubjectDefaultEntryV1 {
  subjectDefinitionId: string;
  subjectDefinitionRef: string;
  subjectDefinitionContentHash: string;
}

export interface SubjectDefaultCatalogV1 {
  schemaVersion: 1;
  defaults: readonly SubjectDefaultEntryV1[];
}

export interface SubjectDefaultRegistryV1 {
  resolvePublicDefault(subjectDefinitionId: string): SubjectDefaultEntryV1 | undefined;
  listPublicDefaults(): readonly SubjectDefaultEntryV1[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function unknownField(
  source: Record<string, unknown>,
  allowedFields: readonly string[],
): string | undefined {
  const allowed = new Set(allowedFields);
  return Object.keys(source).find((field) => !allowed.has(field));
}

function isV3Definition(
  value: ReturnType<SubjectResourceRegistryV3["resolveSubjectDefinition"]>,
): value is RegistrySubjectDefinitionV3 {
  return value !== undefined && "schemaVersion" in value && value.schemaVersion === 3;
}

export function createSubjectDefaultRegistryV1(
  source: unknown,
  subjectRegistry: SubjectResourceRegistryV3,
): SubjectDefaultRegistryV1 {
  if (!isPlainObject(source)) {
    throw new Error("SUBJECT_DEFAULT_CATALOG_INVALID: expected an object.");
  }
  const catalogUnknownField = unknownField(source, ["schemaVersion", "defaults"]);
  if (catalogUnknownField !== undefined) {
    throw new Error(
      `SUBJECT_DEFAULT_CATALOG_UNKNOWN_FIELD: '${catalogUnknownField}'.`,
    );
  }
  if (source.schemaVersion !== 1 || !Array.isArray(source.defaults)) {
    throw new Error("SUBJECT_DEFAULT_CATALOG_INVALID: expected schemaVersion 1 and defaults array.");
  }

  const entries: SubjectDefaultEntryV1[] = [];
  const seenIds = new Set<string>();
  let previousId: string | undefined;
  for (const [index, candidate] of source.defaults.entries()) {
    if (!isPlainObject(candidate)) {
      throw new Error(`SUBJECT_DEFAULT_ENTRY_INVALID: defaults[${index}] must be an object.`);
    }
    const entryUnknownField = unknownField(candidate, [
      "subjectDefinitionId",
      "subjectDefinitionRef",
      "subjectDefinitionContentHash",
    ]);
    if (entryUnknownField !== undefined) {
      throw new Error(
        `SUBJECT_DEFAULT_ENTRY_UNKNOWN_FIELD: '${entryUnknownField}' at defaults[${index}].`,
      );
    }
    const {
      subjectDefinitionId,
      subjectDefinitionRef,
      subjectDefinitionContentHash,
    } = candidate;
    if (
      typeof subjectDefinitionId !== "string" || subjectDefinitionId.length === 0 ||
      typeof subjectDefinitionRef !== "string" || subjectDefinitionRef.length === 0 ||
      typeof subjectDefinitionContentHash !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(subjectDefinitionContentHash)
    ) {
      throw new Error(`SUBJECT_DEFAULT_ENTRY_INVALID: defaults[${index}] has invalid fields.`);
    }
    if (seenIds.has(subjectDefinitionId)) {
      throw new Error(
        `SUBJECT_DEFAULT_CATALOG_DUPLICATE_ID: '${subjectDefinitionId}'.`,
      );
    }
    if (previousId !== undefined && previousId.localeCompare(subjectDefinitionId) >= 0) {
      throw new Error(
        `SUBJECT_DEFAULT_CATALOG_NOT_SORTED: '${subjectDefinitionId}' follows '${previousId}'.`,
      );
    }

    const definition = subjectRegistry.resolveSubjectDefinition(subjectDefinitionRef);
    if (
      !isV3Definition(definition) ||
      definition.resourceRef !== subjectDefinitionRef ||
      definition.id !== subjectDefinitionId ||
      definition.contentHash !== subjectDefinitionContentHash
    ) {
      throw new Error(
        `SUBJECT_DEFAULT_ENTRY_INVALID: '${subjectDefinitionId}' does not match exact Definition '${subjectDefinitionRef}'.`,
      );
    }

    const entry = Object.freeze({
      subjectDefinitionId,
      subjectDefinitionRef,
      subjectDefinitionContentHash,
    });
    entries.push(entry);
    seenIds.add(subjectDefinitionId);
    previousId = subjectDefinitionId;
  }

  const stableEntries = Object.freeze(entries);
  const entriesById = new Map(
    stableEntries.map((entry) => [entry.subjectDefinitionId, entry] as const),
  );
  return Object.freeze({
    resolvePublicDefault(subjectDefinitionId: string): SubjectDefaultEntryV1 | undefined {
      return entriesById.get(subjectDefinitionId);
    },
    listPublicDefaults(): readonly SubjectDefaultEntryV1[] {
      return stableEntries;
    },
  });
}

export const builtInSubjectDefaultRegistry = createSubjectDefaultRegistryV1(
  defaultCatalog,
  builtInSubjectResourceRegistry,
);
