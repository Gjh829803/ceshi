import { isEmpty, isNil, uniq } from "lodash-es";

export const GROUND_HUMANOID_CONTROL_FEEL_MEDIUM_REF =
  "worldkit://control-feel-profile/humanoid.medium-ground@1";
export const GROUND_HUMANOID_CONTROL_FEEL_HEAVY_REF =
  "worldkit://control-feel-profile/humanoid.heavy-ground@1";

export interface SelectableControlFeelProfilesV1 {
  controlFeelProfileRef: string;
  allowedControlFeelProfileRefs: readonly string[];
}

/**
 * Unique selectable Control Feel authority: default first, then remaining
 * allowed refs in declaration order. Definition/Registry must declare both.
 */
export function selectableControlFeelProfileRefsV1(
  profiles: SelectableControlFeelProfilesV1,
): readonly string[] {
  if (isNil(profiles.controlFeelProfileRef) || profiles.controlFeelProfileRef === "") {
    throw new Error(
      "SUBJECT_CONTROL_FEEL_PROFILE_REQUIRED: default Control Feel Profile is missing.",
    );
  }
  if (
    !Array.isArray(profiles.allowedControlFeelProfileRefs) ||
    isEmpty(profiles.allowedControlFeelProfileRefs)
  ) {
    throw new Error(
      "SUBJECT_CONTROL_FEEL_ALLOWED_REQUIRED: allowed Control Feel Profile refs are missing.",
    );
  }
  const uniqueAllowed = uniq(profiles.allowedControlFeelProfileRefs);
  if (uniqueAllowed.length !== profiles.allowedControlFeelProfileRefs.length) {
    throw new Error(
      "SUBJECT_CONTROL_FEEL_ALLOWED_DUPLICATE: allowed Control Feel Profile refs must be unique.",
    );
  }
  if (!uniqueAllowed.includes(profiles.controlFeelProfileRef)) {
    throw new Error(
      `SUBJECT_CONTROL_FEEL_DEFAULT_NOT_ALLOWED: '${profiles.controlFeelProfileRef}' is not in allowedControlFeelProfileRefs.`,
    );
  }
  return [
    profiles.controlFeelProfileRef,
    ...uniqueAllowed.filter((resourceRef) => resourceRef !== profiles.controlFeelProfileRef),
  ];
}

export function isSelectableControlFeelProfileRefV1(
  profiles: SelectableControlFeelProfilesV1,
  resourceRef: string,
): boolean {
  return selectableControlFeelProfileRefsV1(profiles).includes(resourceRef);
}
