import type {
  ApplySubjectPresetTuningRequestV1,
  NumericProfileOverrideV1,
} from "@whitebox-world/runtime-contracts";

import {
  parseSubjectPresetWorkingDraftV1,
  type SubjectPresetLocalBaselineV1,
  type SubjectPresetWorkingDraftV1,
} from "./subject-preset-local";

interface WorkbenchNumericProfileStateV1 {
  baseParameters: Readonly<Record<string, number | boolean>>;
  currentValues: Readonly<Record<string, number>>;
  runtimeParameterNames?: readonly string[];
}

export function normalizeSubjectPresetCameraPreferenceV1(
  preference: string,
  baseline: SubjectPresetLocalBaselineV1,
): string {
  if (preference === "auto") return "auto";
  const exactPreference = preference === "first-person"
    ? baseline.firstPersonCameraProfileRef
    : preference;
  return exactPreference !== null && baseline.cameraProfiles.some(
      (profile) => profile.resourceRef === exactPreference
    )
    ? exactPreference
    : "auto";
}

export interface CreateSubjectPresetWorkbenchDraftInputV1 {
  baseline: SubjectPresetLocalBaselineV1;
  draftIdentity: {
    draftId: string;
    createdAtIso: string;
    updatedAtIso: string;
  };
  selectedCameraPreferenceRef: string | null;
  controlFeel: WorkbenchNumericProfileStateV1;
  control: WorkbenchNumericProfileStateV1;
  cameraByProfileRef: Readonly<Record<string, WorkbenchNumericProfileStateV1>>;
}

function numericDifferences(
  source: WorkbenchNumericProfileStateV1,
): Record<string, number> {
  const supportedNames = new Set(
    source.runtimeParameterNames ?? Object.keys(source.baseParameters),
  );
  return Object.fromEntries(
    Object.entries(source.currentValues)
      .filter(([name, value]) =>
        supportedNames.has(name) &&
        typeof source.baseParameters[name] === "number" &&
        Number.isFinite(value) &&
        value !== source.baseParameters[name]
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function optionalOverride(
  resourceRef: string,
  contentHash: string,
  source: WorkbenchNumericProfileStateV1,
): readonly [string, NumericProfileOverrideV1][] {
  const values = numericDifferences(source);
  return Object.keys(values).length === 0
    ? []
    : [[resourceRef, { baseResourceRef: resourceRef, baseContentHash: contentHash, values }]];
}

export function createSubjectPresetWorkbenchDraftV1(
  input: CreateSubjectPresetWorkbenchDraftInputV1,
): SubjectPresetWorkingDraftV1 {
  const cameraLocks = new Map(
    input.baseline.cameraProfiles.map((profile) => [profile.resourceRef, profile]),
  );
  if (
    input.selectedCameraPreferenceRef !== null &&
    !cameraLocks.has(input.selectedCameraPreferenceRef)
  ) {
    throw new TypeError(
      "SUBJECT_PRESET_WORKBENCH_CAMERA_UNREACHABLE: selected Camera Profile is not in the exact baseline.",
    );
  }
  const cameraOverridesByProfileRef = Object.fromEntries(
    Object.entries(input.cameraByProfileRef)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([profileRef, source]) => {
        const lock = cameraLocks.get(profileRef);
        if (lock === undefined) {
          throw new TypeError(
            `SUBJECT_PRESET_WORKBENCH_CAMERA_UNREACHABLE: '${profileRef}' is not in the exact baseline.`,
          );
        }
        return optionalOverride(profileRef, lock.contentHash, source);
      }),
  );
  return parseSubjectPresetWorkingDraftV1({
    kind: "worldkit-subject-preset-working-draft",
    schemaVersion: 1,
    draftId: input.draftIdentity.draftId,
    subjectDefinitionId: input.baseline.subjectDefinitionId,
    baseSubjectDefinitionRef: input.baseline.subjectDefinitionRef,
    baseSubjectDefinitionContentHash: input.baseline.subjectDefinitionContentHash,
    selectedMotionProfileRef: input.baseline.defaultMotionProfile.resourceRef,
    selectedControlFeelProfileRef: input.baseline.controlFeelProfile.resourceRef,
    selectedControlProfileRef: input.baseline.controlProfile.resourceRef,
    selectedCameraPreferenceRef: input.selectedCameraPreferenceRef,
    controlFeelOverridesByProfileRef: Object.fromEntries(optionalOverride(
      input.baseline.controlFeelProfile.resourceRef,
      input.baseline.controlFeelProfile.contentHash,
      input.controlFeel,
    )),
    controlOverridesByProfileRef: Object.fromEntries(optionalOverride(
      input.baseline.controlProfile.resourceRef,
      input.baseline.controlProfile.contentHash,
      input.control,
    )),
    cameraOverridesByProfileRef,
    createdAtIso: input.draftIdentity.createdAtIso,
    updatedAtIso: input.draftIdentity.updatedAtIso,
  });
}

export function subjectPresetTuningRequestFromDraftV1(
  draft: SubjectPresetWorkingDraftV1,
  subjectEntityId: string,
): ApplySubjectPresetTuningRequestV1 {
  return {
    subjectEntityId,
    expectedSubjectDefinitionRef: draft.baseSubjectDefinitionRef,
    expectedSubjectDefinitionContentHash: draft.baseSubjectDefinitionContentHash,
    controlFeelOverridesByProfileRef: draft.controlFeelOverridesByProfileRef,
    controlOverridesByProfileRef: draft.controlOverridesByProfileRef,
    cameraOverridesByProfileRef: draft.cameraOverridesByProfileRef,
    cameraPreference: draft.selectedCameraPreferenceRef ?? "auto",
  };
}
