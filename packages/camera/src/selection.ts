import type {
  CameraAdmissionResultV1,
  CameraContextProfileV1,
  CameraContextRuleExplainV1,
  CameraContextRuleV2,
  CameraContextSampleV2,
  CameraDiagnosticCodeV1,
  CameraDiagnosticV1,
  CameraRelationshipConditionV1,
  CameraSelectionInputV2,
  CameraSelectionResultV2,
  CameraViewPreferenceAdmissionResultV1,
  CameraViewPreferenceV1,
} from "./camera-domain.js";
import {
  CAMERA_RIG_PARAMETER_NAMES_V1,
  cameraRigParametersViolateInvariantsV1,
  parseCameraContextProfileV2,
  parseCameraContextSampleV2,
  parseCameraViewPreferenceV1,
} from "./camera-domain.js";

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function diagnostic(
  cameraContextProfile: CameraContextProfileV1,
  code: CameraDiagnosticCodeV1,
  message: string,
  options: { cameraContextRuleId?: string; resourceRef?: string } = {},
): CameraDiagnosticV1 {
  return {
    severity: code === "CAMERA_PREFERENCE_CONTEXT_INCOMPATIBLE" ||
      code === "CAMERA_SEMANTIC_AUTHORITY_UNAVAILABLE"
      ? "warning"
      : "error",
    code,
    message,
    cameraContextProfileRef: cameraContextProfile.cameraContextProfileRef,
    ...options,
  };
}

function sortedRules(
  rules: readonly CameraContextRuleV2[],
): readonly CameraContextRuleV2[] {
  return [...rules].sort((left, right) =>
    right.priority - left.priority || compareCodeUnits(left.id, right.id)
  );
}

function duplicatedValues<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const duplicated = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) duplicated.add(value);
    else seen.add(value);
  }
  return [...duplicated];
}

function freezeAdmissionResult(
  result: CameraAdmissionResultV1,
): CameraAdmissionResultV1 {
  return result.ok
    ? Object.freeze({ ok: true })
    : Object.freeze({
        ok: false,
        diagnostics: Object.freeze(result.diagnostics.map((entry) =>
          Object.freeze({ ...entry })
        )),
      });
}

function emptyConditionNames(rule: CameraContextRuleV2): readonly string[] {
  return Object.entries(rule.when)
    .filter(([, value]) => Array.isArray(value) && value.length === 0)
    .map(([name]) => name)
    .sort(compareCodeUnits);
}

function allowedCameraRigProfileRefs(
  cameraContextProfile: CameraContextProfileV1,
): ReadonlySet<string> {
  return new Set([
    cameraContextProfile.defaultCameraRigProfileRef,
    ...(cameraContextProfile.firstPersonCameraRigProfileRef === undefined
      ? []
      : [cameraContextProfile.firstPersonCameraRigProfileRef]),
    ...cameraContextProfile.rules.flatMap((rule) =>
      rule.cameraRigProfileRef === undefined ? [] : [rule.cameraRigProfileRef]
    ),
  ]);
}

function conflictingModifierFields(
  cameraContextProfile: CameraContextProfileV1,
  rule: CameraContextRuleV2,
): readonly string[] {
  const modifiersByRef = new Map(
    cameraContextProfile.cameraModifierProfiles.map((modifier) => [
      modifier.cameraModifierProfileRef,
      modifier,
    ]),
  );
  const valueByFieldName = new Map<string, string | number>();
  const conflicts = new Set<string>();
  const recordValue = (fieldName: string, value: string | number): void => {
    const previousValue = valueByFieldName.get(fieldName);
    if (previousValue !== undefined && previousValue !== value) {
      conflicts.add(fieldName);
    } else {
      valueByFieldName.set(fieldName, value);
    }
  };
  for (const modifierRef of rule.cameraModifierRefs ?? []) {
    const modifier = modifiersByRef.get(modifierRef);
    if (modifier === undefined) continue;
    for (const [parameterName, value] of Object.entries(
      modifier.parameterOverrides,
    )) {
      if (value !== undefined) recordValue(parameterName, value);
    }
    if (modifier.headingSourceOverride !== undefined) {
      recordValue("headingSourceOverride", modifier.headingSourceOverride);
    }
    if (modifier.reverseHeadingPolicyOverride !== undefined) {
      recordValue(
        "reverseHeadingPolicyOverride",
        modifier.reverseHeadingPolicyOverride,
      );
    }
    if (modifier.recenterModeOverride !== undefined) {
      recordValue("recenterModeOverride", modifier.recenterModeOverride);
    }
  }
  return [...conflicts].sort(compareCodeUnits);
}

function admitParsedCameraContextProfileV2(
  cameraContextProfile: CameraContextProfileV1,
): CameraAdmissionResultV1 {
  const diagnostics: CameraDiagnosticV1[] = [];
  const expectedParameterNames = [...CAMERA_RIG_PARAMETER_NAMES_V1]
    .sort(compareCodeUnits);
  const rigProfileRefs = new Set(
    cameraContextProfile.cameraRigProfiles.map(
      (profile) => profile.cameraRigProfileRef,
    ),
  );
  const modifierProfileRefs = new Set(
    cameraContextProfile.cameraModifierProfiles.map(
      (profile) => profile.cameraModifierProfileRef,
    ),
  );

  for (const resourceRef of duplicatedValues(
    cameraContextProfile.cameraRigProfiles.map(
      (profile) => profile.cameraRigProfileRef,
    ),
  ).sort(compareCodeUnits)) {
    diagnostics.push(diagnostic(
      cameraContextProfile,
      "CAMERA_PROFILE_INVALID",
      `Camera Rig Profile Ref '${resourceRef}' is not unique.`,
      { resourceRef },
    ));
  }
  for (const resourceRef of duplicatedValues(
    cameraContextProfile.cameraModifierProfiles.map(
      (profile) => profile.cameraModifierProfileRef,
    ),
  ).sort(compareCodeUnits)) {
    diagnostics.push(diagnostic(
      cameraContextProfile,
      "CAMERA_PROFILE_INVALID",
      `Camera Modifier Profile Ref '${resourceRef}' is not unique.`,
      { resourceRef },
    ));
  }
  for (const profile of cameraContextProfile.cameraRigProfiles) {
    const actualParameterNames = Object.keys(profile.parameters)
      .sort(compareCodeUnits);
    const hasExactParameterNames =
      actualParameterNames.length === expectedParameterNames.length &&
      actualParameterNames.every(
        (name, index) => name === expectedParameterNames[index],
      );
    const hasOnlyFiniteValues = Object.values(profile.parameters)
      .every((value) => typeof value === "number" && Number.isFinite(value));
    if (
      hasExactParameterNames &&
      hasOnlyFiniteValues &&
      !cameraRigParametersViolateInvariantsV1(profile.parameters)
    ) continue;
    diagnostics.push(diagnostic(
      cameraContextProfile,
      "CAMERA_PROFILE_INVALID",
      `Camera Rig Profile '${profile.cameraRigProfileRef}' must provide exactly the closed finite Camera parameter vocabulary and satisfy its parameter invariants.`,
      { resourceRef: profile.cameraRigProfileRef },
    ));
  }
  const allowedParameterNames = new Set<string>(CAMERA_RIG_PARAMETER_NAMES_V1);
  for (const profile of cameraContextProfile.cameraModifierProfiles) {
    const overrides = Object.entries(profile.parameterOverrides);
    if (
      overrides.every(([name, value]) =>
        allowedParameterNames.has(name) &&
        typeof value === "number" &&
        Number.isFinite(value)
      ) &&
      !cameraRigParametersViolateInvariantsV1(profile.parameterOverrides)
    ) continue;
    diagnostics.push(diagnostic(
      cameraContextProfile,
      "CAMERA_PROFILE_INVALID",
      `Camera Modifier Profile '${profile.cameraModifierProfileRef}' contains an unknown, non-finite, or invariant-violating Camera parameter override.`,
      { resourceRef: profile.cameraModifierProfileRef },
    ));
  }

  if (!rigProfileRefs.has(cameraContextProfile.defaultCameraRigProfileRef)) {
    diagnostics.push(diagnostic(
      cameraContextProfile,
      "CAMERA_RESOURCE_NOT_LOCKED",
      `Default Camera Rig Profile '${cameraContextProfile.defaultCameraRigProfileRef}' is not available.`,
      { resourceRef: cameraContextProfile.defaultCameraRigProfileRef },
    ));
  }
  if (
    cameraContextProfile.firstPersonCameraRigProfileRef !== undefined &&
    !rigProfileRefs.has(cameraContextProfile.firstPersonCameraRigProfileRef)
  ) {
    diagnostics.push(diagnostic(
      cameraContextProfile,
      "CAMERA_RESOURCE_NOT_LOCKED",
      `First-person Camera Rig Profile '${cameraContextProfile.firstPersonCameraRigProfileRef}' is not available.`,
      { resourceRef: cameraContextProfile.firstPersonCameraRigProfileRef },
    ));
  }

  const duplicateRuleIds = duplicatedValues(
    cameraContextProfile.rules.map((rule) => rule.id),
  ).sort(compareCodeUnits);
  const duplicatePriorities = duplicatedValues(
    cameraContextProfile.rules.map((rule) => rule.priority),
  ).sort((left, right) => right - left);
  for (const ruleId of duplicateRuleIds) {
    diagnostics.push(diagnostic(
      cameraContextProfile,
      "CAMERA_CONTEXT_RULE_AMBIGUOUS",
      `Camera Context Rule id '${ruleId}' is not unique.`,
      { cameraContextRuleId: ruleId },
    ));
  }
  for (const priority of duplicatePriorities) {
    diagnostics.push(diagnostic(
      cameraContextProfile,
      "CAMERA_CONTEXT_RULE_AMBIGUOUS",
      `Camera Context Rule priority '${priority}' is not unique.`,
    ));
  }

  for (const rule of sortedRules(cameraContextProfile.rules)) {
    if (
      rule.cameraRigProfileRef !== undefined &&
      !rigProfileRefs.has(rule.cameraRigProfileRef)
    ) {
      diagnostics.push(diagnostic(
        cameraContextProfile,
        "CAMERA_RESOURCE_NOT_LOCKED",
        `Camera Rig Profile '${rule.cameraRigProfileRef}' used by Rule '${rule.id}' is not available.`,
        { cameraContextRuleId: rule.id, resourceRef: rule.cameraRigProfileRef },
      ));
    }
    for (const modifierRef of rule.cameraModifierRefs ?? []) {
      if (modifierProfileRefs.has(modifierRef)) continue;
      diagnostics.push(diagnostic(
        cameraContextProfile,
        "CAMERA_RESOURCE_NOT_LOCKED",
        `Camera Modifier Profile '${modifierRef}' used by Rule '${rule.id}' is not available.`,
        { cameraContextRuleId: rule.id, resourceRef: modifierRef },
      ));
    }
    const conflictingFields = conflictingModifierFields(
      cameraContextProfile,
      rule,
    );
    if (conflictingFields.length > 0) {
      diagnostics.push(diagnostic(
        cameraContextProfile,
        "CAMERA_CONTEXT_RULE_AMBIGUOUS",
        `Camera Context Rule '${rule.id}' has conflicting Modifier values for: ${conflictingFields.join(", ")}.`,
        { cameraContextRuleId: rule.id },
      ));
    }

    const emptyConditions = emptyConditionNames(rule);
    if (emptyConditions.length > 0) {
      diagnostics.push(diagnostic(
        cameraContextProfile,
        "CAMERA_CONTEXT_RULE_INVALID",
        `Camera Context Rule '${rule.id}' has empty conditions: ${emptyConditions.join(", ")}.`,
        { cameraContextRuleId: rule.id },
      ));
    }
    if (
      rule.cameraRigProfileRef === undefined &&
      (rule.cameraModifierRefs === undefined || rule.cameraModifierRefs.length === 0)
    ) {
      diagnostics.push(diagnostic(
        cameraContextProfile,
        "CAMERA_CONTEXT_RULE_INVALID",
        `Camera Context Rule '${rule.id}' does not select a Rig or Modifier.`,
        { cameraContextRuleId: rule.id },
      ));
    }
    if (!Number.isSafeInteger(rule.priority)) {
      diagnostics.push(diagnostic(
        cameraContextProfile,
        "CAMERA_CONTEXT_RULE_INVALID",
        `Camera Context Rule '${rule.id}' priority must be a finite safe integer.`,
        { cameraContextRuleId: rule.id },
      ));
    }
  }

  return freezeAdmissionResult(
    diagnostics.length === 0 ? { ok: true } : { ok: false, diagnostics },
  );
}

interface AdmittedCameraContextProfileV2 {
  readonly admission: CameraAdmissionResultV1;
  readonly cameraContextProfile?: CameraContextProfileV1;
}

function parseAndAdmitCameraContextProfileV2(
  input: unknown,
): AdmittedCameraContextProfileV2 {
  let cameraContextProfile: CameraContextProfileV1;
  try {
    cameraContextProfile = parseCameraContextProfileV2(input);
  } catch {
    return {
      admission: Object.freeze({
        ok: false,
        diagnostics: Object.freeze([Object.freeze({
          severity: "error",
          code: "CAMERA_PROFILE_INVALID",
          message: "Camera Context Profile must match the strict closed V2 Profile and Rule schema.",
          cameraContextProfileRef: "unavailable",
        })]),
      }),
    };
  }
  return {
    admission: admitParsedCameraContextProfileV2(cameraContextProfile),
    cameraContextProfile,
  };
}

export function admitCameraContextProfileV1(
  cameraContextProfile: CameraContextProfileV1,
): CameraAdmissionResultV1 {
  return parseAndAdmitCameraContextProfileV2(cameraContextProfile).admission;
}

export function admitCameraViewPreferenceV1(
  cameraContextProfile: CameraContextProfileV1,
  cameraViewPreference: CameraViewPreferenceV1,
): CameraViewPreferenceAdmissionResultV1 {
  const parsed = parseAndAdmitCameraContextProfileV2(cameraContextProfile);
  if (!parsed.admission.ok || parsed.cameraContextProfile === undefined) {
    return parsed.admission.ok
      ? Object.freeze({ ok: false, diagnostics: Object.freeze([]) })
      : parsed.admission;
  }
  cameraContextProfile = parsed.cameraContextProfile;
  let parsedPreference: CameraViewPreferenceV1;
  try {
    parsedPreference = parseCameraViewPreferenceV1(cameraViewPreference);
  } catch {
    return Object.freeze({
      ok: false,
      diagnostics: Object.freeze([Object.freeze(diagnostic(
        cameraContextProfile,
        "CAMERA_PREFERENCE_INVALID",
        "Camera View Preference must match one exact closed preference shape.",
      ))]),
    });
  }
  if (
    parsedPreference.mode === "first-person" &&
    cameraContextProfile.firstPersonCameraRigProfileRef === undefined
  ) {
    return Object.freeze({
      ok: false,
      diagnostics: Object.freeze([Object.freeze(diagnostic(
        cameraContextProfile,
        "CAMERA_FIRST_PERSON_UNAVAILABLE",
        "The current Camera Context does not provide a first-person Camera Rig Profile.",
      ))]),
    });
  }
  if (
    parsedPreference.mode === "camera-rig-profile" &&
    !allowedCameraRigProfileRefs(cameraContextProfile).has(
      parsedPreference.cameraRigProfileRef,
    )
  ) {
    return Object.freeze({
      ok: false,
      diagnostics: Object.freeze([Object.freeze(diagnostic(
        cameraContextProfile,
        "CAMERA_PREFERENCE_NOT_ALLOWED",
        `Camera Rig Profile '${parsedPreference.cameraRigProfileRef}' is not allowed by the current Camera Context.`,
        { resourceRef: parsedPreference.cameraRigProfileRef },
      ))]),
    });
  }
  return Object.freeze({
    ok: true,
    cameraViewPreference: parsedPreference,
  });
}

function relationshipConditionMatches(
  condition: CameraRelationshipConditionV1,
  sample: CameraContextSampleV2,
): boolean {
  const relevantEntityIds = new Set([
    sample.controlledEntityId,
    sample.targetEntityId,
  ]);
  return sample.environment.relationshipContexts.some((relationship) => {
    if (relationship.type !== condition.type) return false;
    switch (relationship.type) {
      case "possessedBy":
        return relevantEntityIds.has(
          condition.entityRole === "controlled"
            ? relationship.controlledEntityId
            : relationship.controllerEntityId,
        );
      case "mountedOn":
        return relevantEntityIds.has(
          condition.entityRole === "rider"
            ? relationship.riderEntityId
            : relationship.mountEntityId,
        );
      case "equippedAt":
        return relevantEntityIds.has(
          condition.entityRole === "item"
            ? relationship.itemEntityId
            : relationship.wearerEntityId,
        );
    }
  });
}

function ruleExplain(
  rule: CameraContextRuleV2,
  sample: CameraContextSampleV2,
): CameraContextRuleExplainV1 {
  const unmatchedReasons: string[] = [];
  if (
    rule.when.allRelationshipConditions?.some(
      (condition) => !relationshipConditionMatches(condition, sample),
    )
  ) unmatchedReasons.push("relationship-condition-not-met");
  if (
    rule.when.relationshipRoles !== undefined &&
    !rule.when.relationshipRoles.includes(sample.environment.relationshipRole)
  ) unmatchedReasons.push("relationship-role-not-matched");
  if (
    rule.when.locomotionStatuses !== undefined &&
    !rule.when.locomotionStatuses.includes(sample.locomotion.status)
  ) unmatchedReasons.push("locomotion-status-not-matched");
  if (rule.when.mobilityModes !== undefined && (
    sample.locomotion.status !== "active" ||
    !rule.when.mobilityModes.includes(sample.locomotion.mobilityMode)
  )) unmatchedReasons.push("mobility-mode-not-matched");
  if (rule.when.gaits !== undefined && (
    sample.locomotion.status !== "active" ||
    !rule.when.gaits.includes(sample.locomotion.gait)
  )) unmatchedReasons.push("gait-not-matched");
  if (rule.when.verticalPhases !== undefined && (
    sample.locomotion.status !== "active" ||
    !rule.when.verticalPhases.includes(sample.locomotion.verticalPhase)
  )) unmatchedReasons.push("vertical-phase-not-matched");
  if (rule.when.movementMediums !== undefined && (
    sample.locomotion.status !== "active" ||
    !rule.when.movementMediums.includes(sample.locomotion.movementMedium)
  )) unmatchedReasons.push("movement-medium-not-matched");
  const actionSummary = sample.actionSummary;
  if (actionSummary.status !== "available") {
    if (rule.when.requiredActiveActionRefs !== undefined ||
      rule.when.actionInterruptibility !== undefined) {
      unmatchedReasons.push("action-authority-unavailable");
    }
  } else if (
    rule.when.requiredActiveActionRefs?.some(
      (actionRef) => !actionSummary.activeActionRefs.includes(actionRef),
    )
  ) unmatchedReasons.push("required-action-not-active");
  if (actionSummary.status === "available" &&
    rule.when.actionInterruptibility !== undefined &&
    (actionSummary.isInterruptible ? "interruptible" : "non-interruptible") !==
      rule.when.actionInterruptibility) {
    unmatchedReasons.push("action-interruptibility-not-matched");
  }
  if (sample.locomotion.status !== "active" &&
    (rule.when.minimumSpeedMetersPerSecond !== undefined ||
      rule.when.maximumSpeedMetersPerSecond !== undefined)) {
    unmatchedReasons.push("speed-authority-unavailable");
  } else if (sample.locomotion.status === "active") {
    if (rule.when.minimumSpeedMetersPerSecond !== undefined &&
      sample.locomotion.horizontalSpeedMetersPerSecond <
        rule.when.minimumSpeedMetersPerSecond) {
      unmatchedReasons.push("minimum-speed-not-met");
    }
    if (rule.when.maximumSpeedMetersPerSecond !== undefined &&
      sample.locomotion.horizontalSpeedMetersPerSecond >
        rule.when.maximumSpeedMetersPerSecond) {
      unmatchedReasons.push("maximum-speed-exceeded");
    }
  }
  if (
    rule.when.requiredSocketIds?.some(
      (socketId) => !Object.hasOwn(sample.environment.socketPositionsMetersXYZById, socketId),
    )
  ) unmatchedReasons.push("required-socket-unavailable");
  if (
    rule.when.requiredCameraContextTags?.some(
      (tag) => !sample.environment.cameraContextTags.includes(tag),
    )
  ) unmatchedReasons.push("required-camera-context-tag-missing");

  return {
    cameraContextRuleId: rule.id,
    priority: rule.priority,
    matched: unmatchedReasons.length === 0,
    unmatchedReasons,
  };
}

function appliedModifierRefs(
  matchedRules: readonly CameraContextRuleV2[],
): readonly string[] {
  const highestPriorityUseByRef = new Map<
    string,
    { priority: number; ruleId: string; modifierIndex: number }
  >();
  for (const rule of matchedRules) {
    (rule.cameraModifierRefs ?? []).forEach((resourceRef, modifierIndex) => {
      if (highestPriorityUseByRef.has(resourceRef)) return;
      highestPriorityUseByRef.set(resourceRef, {
        priority: rule.priority,
        ruleId: rule.id,
        modifierIndex,
      });
    });
  }
  return [...highestPriorityUseByRef.entries()]
    .sort((left, right) =>
      left[1].priority - right[1].priority ||
      compareCodeUnits(left[1].ruleId, right[1].ruleId) ||
      left[1].modifierIndex - right[1].modifierIndex ||
      compareCodeUnits(left[0], right[0])
    )
    .map(([resourceRef]) => resourceRef);
}

export function selectCameraViewV2(
  input: CameraSelectionInputV2,
): CameraSelectionResultV2 {
  const parsedProfile = parseAndAdmitCameraContextProfileV2(input.cameraContextProfile);
  if (!parsedProfile.admission.ok || parsedProfile.cameraContextProfile === undefined) {
    return parsedProfile.admission.ok
      ? Object.freeze({ ok: false, diagnostics: Object.freeze([]) })
      : parsedProfile.admission;
  }
  const cameraContextProfile = parsedProfile.cameraContextProfile;
  const cameraContextSample = parseCameraContextSampleV2(input.cameraContextSample);
  let preference: CameraViewPreferenceV1;
  try {
    preference = parseCameraViewPreferenceV1(input.cameraViewPreference);
  } catch {
    return Object.freeze({
      ok: false,
      diagnostics: Object.freeze([Object.freeze(diagnostic(
        cameraContextProfile,
        "CAMERA_PREFERENCE_INVALID",
        "Camera View Preference must match one exact closed preference shape.",
      ))]),
    });
  }

  const rules = sortedRules(cameraContextProfile.rules);
  const semanticAuthorityUnavailable =
    cameraContextSample.semanticAuthorityStatus === "unavailable";
  const cameraContextRules = semanticAuthorityUnavailable
    ? rules.map((rule) => ({
        cameraContextRuleId: rule.id,
        priority: rule.priority,
        matched: false,
        unmatchedReasons: ["semantic-authority-unavailable"],
      }))
    : rules.map((rule) => ruleExplain(rule, cameraContextSample));
  const matchedRuleIds = new Set(
    cameraContextRules
      .filter((candidate) => candidate.matched)
      .map((candidate) => candidate.cameraContextRuleId),
  );
  const matchedRules = rules.filter((rule) => matchedRuleIds.has(rule.id));
  const diagnostics: CameraDiagnosticV1[] = [];
  if (semanticAuthorityUnavailable) {
    diagnostics.push(diagnostic(
      cameraContextProfile,
      "CAMERA_SEMANTIC_AUTHORITY_UNAVAILABLE",
      "Committed semantic Camera authority is unavailable; automatic Camera Rules are bypassed and the locked default Safe View is active unless an explicit locked View preference is admitted.",
    ));
  }
  let fallbackActive = semanticAuthorityUnavailable && preference.mode === "auto";
  let activeCameraRigProfileRef = cameraContextProfile.defaultCameraRigProfileRef;

  switch (preference.mode) {
    case "auto":
      activeCameraRigProfileRef = matchedRules.find(
        (rule) => rule.cameraRigProfileRef !== undefined,
      )?.cameraRigProfileRef ??
        cameraContextProfile.defaultCameraRigProfileRef;
      break;
    case "first-person":
      if (cameraContextProfile.firstPersonCameraRigProfileRef !== undefined) {
        activeCameraRigProfileRef =
          cameraContextProfile.firstPersonCameraRigProfileRef;
      } else {
        activeCameraRigProfileRef =
          cameraContextProfile.defaultCameraRigProfileRef;
        fallbackActive = true;
      }
      break;
    case "camera-rig-profile":
      if (
        allowedCameraRigProfileRefs(cameraContextProfile).has(
          preference.cameraRigProfileRef,
        )
      ) {
        activeCameraRigProfileRef = preference.cameraRigProfileRef;
      } else {
        activeCameraRigProfileRef =
          cameraContextProfile.defaultCameraRigProfileRef;
        fallbackActive = true;
      }
      break;
  }

  if (fallbackActive && preference.mode !== "auto") {
    diagnostics.push(diagnostic(
      cameraContextProfile,
      "CAMERA_PREFERENCE_CONTEXT_INCOMPATIBLE",
      "The committed Camera Context no longer supports the stored Camera View Preference; the locked default Safe View is active.",
    ));
  }

  const activeCameraModifierRefs = appliedModifierRefs(matchedRules);
  const frozenDiagnostics = Object.freeze(diagnostics.map((entry) => Object.freeze({ ...entry })));
  const frozenModifierRefs = Object.freeze([...activeCameraModifierRefs]);
  const frozenMatchedRuleIds = Object.freeze(matchedRules.map((rule) => rule.id));
  const frozenRuleExplain = Object.freeze(cameraContextRules.map((rule) => Object.freeze({
    ...rule,
    unmatchedReasons: Object.freeze([...rule.unmatchedReasons]),
  })));
  const decision = Object.freeze({
    schemaVersion: 2 as const,
    committedTick: cameraContextSample.committedTick,
    targetEntityId: cameraContextSample.targetEntityId,
    activeCameraRigProfileRef,
    activeCameraModifierRefs: frozenModifierRefs,
    matchedCameraContextRuleIds: frozenMatchedRuleIds,
    cameraViewPreference: preference,
    fallbackActive,
    diagnostics: frozenDiagnostics,
    explain: Object.freeze({
      cameraViewPreference: preference,
      cameraContextRules: frozenRuleExplain,
      selectedCameraRigProfileRef: activeCameraRigProfileRef,
      appliedCameraModifierRefs: frozenModifierRefs,
      fallbackActive,
    }),
  });
  return Object.freeze({
    ok: true,
    decision,
  });
}
