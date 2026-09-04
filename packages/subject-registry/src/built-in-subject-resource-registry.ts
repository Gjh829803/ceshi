import { BUILT_IN_SUBJECT_RESOURCE_MANIFESTS } from "./built-in-resource-manifests";
import { BUILT_IN_SUBJECT_DEFINITIONS } from "./built-in-subject-definitions";
import {
  BUILT_IN_CAPABILITY_MANIFESTS,
  BUILT_IN_CAPABILITY_RESOURCES,
} from "./built-in-capability-resources";
import subjectDefinitionsV3 from "../../../assets/registry/subject-definitions/catalog.json";

import { createSubjectResourceRegistry } from "./subject-resource-registry";
import type { RegistrySubjectDefinitionInputV3 } from "./types-v3";
import {
  XIER120_COLLIDER_PROFILES,
  XIER120_SUBJECT_ASSET_MANIFESTS,
} from "./xier120-resource-manifests";
import { XIER120_SUBJECT_DEFINITIONS } from "./xier120-subject-definitions";
import {
  KART_CONTROL_LAB_COLLIDER_PROFILES,
  KART_CONTROL_LAB_CONTROL_FEEL_PROFILES,
  KART_CONTROL_LAB_LOCOMOTION_PROFILES,
  KART_CONTROL_LAB_SUBJECT_ASSET_MANIFESTS,
} from "./kart-control-lab-resource-manifests";
import { KART_CONTROL_LAB_SUBJECT_DEFINITIONS } from
  "./kart-control-lab-subject-definitions";

export const builtInSubjectResourceRegistry = createSubjectResourceRegistry([
  ...BUILT_IN_SUBJECT_DEFINITIONS,
  ...(subjectDefinitionsV3 as unknown as readonly RegistrySubjectDefinitionInputV3[]),
  ...XIER120_SUBJECT_DEFINITIONS,
  ...KART_CONTROL_LAB_SUBJECT_DEFINITIONS,
  ...BUILT_IN_SUBJECT_RESOURCE_MANIFESTS,
  ...XIER120_SUBJECT_ASSET_MANIFESTS,
  ...XIER120_COLLIDER_PROFILES,
  ...KART_CONTROL_LAB_SUBJECT_ASSET_MANIFESTS,
  ...KART_CONTROL_LAB_COLLIDER_PROFILES,
  ...KART_CONTROL_LAB_LOCOMOTION_PROFILES,
  ...KART_CONTROL_LAB_CONTROL_FEEL_PROFILES,
  ...BUILT_IN_CAPABILITY_MANIFESTS,
  ...BUILT_IN_CAPABILITY_RESOURCES,
]);
