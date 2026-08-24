import type {
  ApplyCameraPreviewRequestV1,
  ApplySubjectPresetTuningRequestV1,
  CameraPreviewStateV1,
  NumericProfileOverrideV1,
  SubjectPresetTuningReceiptV1,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

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
  return !isNil(exactPreference) && baseline.cameraProfiles.some(
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
  selectedMotionProfileRef: string;
  selectedControlFeelProfileRef: string;
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
  const controlFeelLocks = input.baseline.availableControlFeelProfiles ?? [
    input.baseline.controlFeelProfile,
  ];
  const selectedControlFeelLock = controlFeelLocks.find(
    (profile) => profile.resourceRef === input.selectedControlFeelProfileRef,
  );
  if (selectedControlFeelLock === undefined) {
    throw new TypeError(
      "SUBJECT_PRESET_WORKBENCH_CONTROL_FEEL_UNREACHABLE: selected Control Feel Profile is not in the exact baseline.",
    );
  }
  const motionLocks = input.baseline.availableMotionProfiles ?? [
    input.baseline.defaultMotionProfile,
  ];
  const selectedMotionLock = motionLocks.find(
    (profile) => profile.resourceRef === input.selectedMotionProfileRef,
  );
  if (selectedMotionLock === undefined) {
    throw new TypeError(
      "SUBJECT_PRESET_WORKBENCH_MOTION_UNREACHABLE: selected Motion Profile is not in the exact baseline.",
    );
  }
  const cameraLocks = new Map(
    input.baseline.cameraProfiles.map((profile) => [profile.resourceRef, profile]),
  );
  if (
    !isNil(input.selectedCameraPreferenceRef) &&
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
    selectedMotionProfileRef: selectedMotionLock.resourceRef,
    selectedControlFeelProfileRef: selectedControlFeelLock.resourceRef,
    selectedControlProfileRef: input.baseline.controlProfile.resourceRef,
    selectedCameraPreferenceRef: input.selectedCameraPreferenceRef,
    controlFeelOverridesByProfileRef: Object.fromEntries(optionalOverride(
      selectedControlFeelLock.resourceRef,
      selectedControlFeelLock.contentHash,
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
    selectedMotionProfileRef: draft.selectedMotionProfileRef,
    selectedControlFeelProfileRef: draft.selectedControlFeelProfileRef,
    selectedControlProfileRef: draft.selectedControlProfileRef,
  };
}

export function cameraPreviewRequestFromDraftV1(
  draft: SubjectPresetWorkingDraftV1,
): ApplyCameraPreviewRequestV1 {
  return {
    tuningByProfileRef: Object.fromEntries(
      Object.entries(draft.cameraOverridesByProfileRef).map(([profileRef, override]) => [
        profileRef,
        override.values,
      ]),
    ),
  };
}

export interface SubjectPresetWorkingDraftTransactionRuntimeV1 {
  getCameraPreviewState(): CameraPreviewStateV1;
  requestCameraProfile(profileRef: string): unknown;
  resetCameraProfile(): unknown;
  applyCameraPreview(request: ApplyCameraPreviewRequestV1): CameraPreviewStateV1;
  applySubjectPresetTuning(
    request: ApplySubjectPresetTuningRequestV1,
  ): SubjectPresetTuningReceiptV1;
}

export interface SubjectPresetGameplayProfileSelectionMementoV1 {
  readonly motionProfileRef: string;
  readonly controlFeelProfileRef: string;
}

export type SubjectPresetWorkingDraftTransactionResultV1 =
  | { readonly status: "committed"; readonly receipt: SubjectPresetTuningReceiptV1 }
  | { readonly status: "rejected"; readonly receipt: SubjectPresetTuningReceiptV1 }
  | { readonly status: "failed"; readonly error: unknown }
  | {
      readonly status: "rollback-failed";
      readonly error: unknown;
      readonly rollbackError: unknown;
    };

function copyCameraPreviewRequest(
  previewState: CameraPreviewStateV1,
): ApplyCameraPreviewRequestV1 {
  return {
    tuningByProfileRef: Object.fromEntries(
      Object.entries(previewState.tuningByProfileRef).map(([profileRef, tuning]) => [
        profileRef,
        { ...tuning },
      ]),
    ),
  };
}

const MOTION_PROFILE_REF_PATTERN =
  /^worldkit:\/\/motion-profile\/[A-Za-z0-9][A-Za-z0-9._-]*@[1-9][0-9]*$/;
const CONTROL_FEEL_PROFILE_REF_PATTERN =
  /^worldkit:\/\/control-feel-profile\/[A-Za-z0-9][A-Za-z0-9._-]*@[1-9][0-9]*$/;

function parseGameplayProfileSelectionMemento(
  input: unknown,
): SubjectPresetGameplayProfileSelectionMementoV1 | undefined {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort((left, right) => left.localeCompare(right));
  if (
    keys.length !== 2 ||
    keys[0] !== "controlFeelProfileRef" ||
    keys[1] !== "motionProfileRef" ||
    typeof record.motionProfileRef !== "string" ||
    !MOTION_PROFILE_REF_PATTERN.test(record.motionProfileRef) ||
    typeof record.controlFeelProfileRef !== "string" ||
    !CONTROL_FEEL_PROFILE_REF_PATTERN.test(record.controlFeelProfileRef)
  ) {
    return undefined;
  }
  return {
    motionProfileRef: record.motionProfileRef,
    controlFeelProfileRef: record.controlFeelProfileRef,
  };
}

/**
 * Applies the authoring-only Camera preview and the locked Gameplay selection as
 * one compensated transaction. The Runtime keeps the two channels separate, so
 * this Workbench boundary owns the memento and restores both channels if either
 * application step fails.
 */
export function applySubjectPresetWorkingDraftTransactionV1(input: Readonly<{
  draft: SubjectPresetWorkingDraftV1;
  subjectEntityId: string;
  previousCameraPreferenceRef: string | null;
  previousGameplayProfileSelection:
    | SubjectPresetGameplayProfileSelectionMementoV1
    | null
    | undefined;
  runtime: SubjectPresetWorkingDraftTransactionRuntimeV1;
}>): SubjectPresetWorkingDraftTransactionResultV1 {
  const previousGameplayProfileSelection = parseGameplayProfileSelectionMemento(
    input.previousGameplayProfileSelection,
  );
  if (previousGameplayProfileSelection === undefined) {
    return {
      status: "failed",
      error: new Error("SUBJECT_PRESET_TRANSACTION_BASELINE_UNAVAILABLE"),
    };
  }
  let previousCameraPreviewState: CameraPreviewStateV1;
  try {
    previousCameraPreviewState = input.runtime.getCameraPreviewState();
  } catch (error) {
    return { status: "failed", error };
  }

  const restoreCamera = (): void => {
    if (isNil(input.previousCameraPreferenceRef)) {
      input.runtime.resetCameraProfile();
    } else {
      input.runtime.requestCameraProfile(input.previousCameraPreferenceRef);
    }
    input.runtime.applyCameraPreview(copyCameraPreviewRequest(previousCameraPreviewState));
  };
  const restoreGameplay = (): void => {
    const receipt = input.runtime.applySubjectPresetTuning({
      subjectEntityId: input.subjectEntityId,
      expectedSubjectDefinitionRef: input.draft.baseSubjectDefinitionRef,
      expectedSubjectDefinitionContentHash:
        input.draft.baseSubjectDefinitionContentHash,
      selectedMotionProfileRef: previousGameplayProfileSelection.motionProfileRef,
      selectedControlFeelProfileRef:
        previousGameplayProfileSelection.controlFeelProfileRef,
      selectedControlProfileRef: input.draft.selectedControlProfileRef,
    });
    if (receipt.status === "rejected") {
      throw new Error(
        `SUBJECT_PRESET_TRANSACTION_GAMEPLAY_ROLLBACK_REJECTED: ${receipt.diagnostic?.message ?? "unknown rejection"}`,
      );
    }
  };
  const rollback = (restoreGameplayState: boolean): unknown | undefined => {
    const errors: unknown[] = [];
    if (restoreGameplayState) {
      try {
        restoreGameplay();
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      restoreCamera();
    } catch (error) {
      errors.push(error);
    }
    return errors.length === 0
      ? undefined
      : new AggregateError(errors, "SUBJECT_PRESET_TRANSACTION_ROLLBACK_FAILED");
  };

  try {
    if (isNil(input.draft.selectedCameraPreferenceRef)) {
      input.runtime.resetCameraProfile();
    } else {
      input.runtime.requestCameraProfile(input.draft.selectedCameraPreferenceRef);
    }
    input.runtime.applyCameraPreview(cameraPreviewRequestFromDraftV1(input.draft));
  } catch (error) {
    const rollbackError = rollback(false);
    return rollbackError === undefined
      ? { status: "failed", error }
      : { status: "rollback-failed", error, rollbackError };
  }

  try {
    const receipt = input.runtime.applySubjectPresetTuning(
      subjectPresetTuningRequestFromDraftV1(input.draft, input.subjectEntityId),
    );
    if (receipt.status === "committed") {
      return { status: "committed", receipt };
    }
    const rollbackError = rollback(false);
    return rollbackError === undefined
      ? { status: "rejected", receipt }
      : {
          status: "rollback-failed",
          error: new Error(receipt.diagnostic?.message ?? "SUBJECT_PRESET_TRANSACTION_REJECTED"),
          rollbackError,
        };
  } catch (error) {
    const rollbackError = rollback(true);
    return rollbackError === undefined
      ? { status: "failed", error }
      : { status: "rollback-failed", error, rollbackError };
  }
}
