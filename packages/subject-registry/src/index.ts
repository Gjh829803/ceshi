import { BUILT_IN_SUBJECT_KIT_DEFINITIONS } from "./built-in-subject-kits";
import type {
  SubjectDefinitionRegistryV1,
  SubjectKitDefinitionV1,
} from "./types";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function createSubjectDefinitionRegistry(
  definitions: readonly SubjectKitDefinitionV1[],
): SubjectDefinitionRegistryV1 {
  const definitionsByRef = new Map<string, SubjectKitDefinitionV1>();
  for (const source of definitions) {
    if (definitionsByRef.has(source.kitRef)) {
      throw new Error(`SUBJECT_REGISTRY_DUPLICATE_REF: '${source.kitRef}'.`);
    }
    definitionsByRef.set(source.kitRef, deepFreeze(structuredClone(source)));
  }

  const stableDefinitions = deepFreeze(
    [...definitionsByRef.values()].sort(
      (left, right) => left.id.localeCompare(right.id) || left.version - right.version,
    ),
  );

  return Object.freeze({
    resolve(subjectDefinitionRef: string): SubjectKitDefinitionV1 | undefined {
      return definitionsByRef.get(subjectDefinitionRef);
    },
    list(): readonly SubjectKitDefinitionV1[] {
      return stableDefinitions;
    },
  });
}

export const builtInSubjectDefinitionRegistry = createSubjectDefinitionRegistry(
  BUILT_IN_SUBJECT_KIT_DEFINITIONS,
);

export * from "./types";
