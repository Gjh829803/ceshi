import { BUILT_IN_SUBJECT_RESOURCE_MANIFESTS } from "./built-in-resource-manifests";
import { BUILT_IN_SUBJECT_DEFINITIONS } from "./built-in-subject-definitions";
import {
  BUILT_IN_CAPABILITY_MANIFESTS,
  BUILT_IN_CAPABILITY_RESOURCES,
} from "./built-in-capability-resources";
import subjectDefinitionsV3 from "../../../assets/registry/subject-definitions/catalog.json";

import { createSubjectResourceRegistry } from "./subject-resource-registry";
import type { RegistrySubjectDefinitionInputV3 } from "./types-v3";

export const builtInSubjectResourceRegistry = createSubjectResourceRegistry([
  ...BUILT_IN_SUBJECT_DEFINITIONS,
  ...(subjectDefinitionsV3 as unknown as readonly RegistrySubjectDefinitionInputV3[]),
  ...BUILT_IN_SUBJECT_RESOURCE_MANIFESTS,
  ...BUILT_IN_CAPABILITY_MANIFESTS,
  ...BUILT_IN_CAPABILITY_RESOURCES,
]);
