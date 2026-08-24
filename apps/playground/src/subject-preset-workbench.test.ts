import { describe, expect, it } from "vitest";

import type { SubjectPresetLocalBaselineV1 } from "./subject-preset-local";
import {
  applySubjectPresetWorkingDraftTransactionV1,
  cameraPreviewRequestFromDraftV1,
  createSubjectPresetWorkbenchDraftV1,
  normalizeSubjectPresetCameraPreferenceV1,
  subjectPresetTuningRequestFromDraftV1,
  type SubjectPresetWorkingDraftTransactionRuntimeV1,
} from "./subject-preset-workbench";

type TransactionRuntimeDouble = {
  getSubjectSnapshot(subjectEntityId: string): {
    activeControlFeelProfileRef?: string;
    activeMotionProfileRef?: string;
  } | undefined;
  getCameraPreviewState(): {
    tuningByProfileRef: Readonly<Record<string, Readonly<Record<string, number>>>>;
  };
  requestCameraProfile(profileRef: string): unknown;
  resetCameraProfile(): unknown;
  applyCameraPreview(request: {
    tuningByProfileRef: Readonly<Record<string, Readonly<Record<string, number>>>>;
  }): unknown;
  applySubjectPresetTuning(request: {
    selectedMotionProfileRef: string;
    selectedControlFeelProfileRef: string;
  }): { status: "committed" | "rejected"; diagnostic?: { message: string } };
};

const applyTransaction = (input: {
  draft: ReturnType<typeof createSubjectPresetWorkbenchDraftV1>;
  subjectEntityId: string;
  previousCameraPreferenceRef: string | null;
  runtime: TransactionRuntimeDouble;
}) => applySubjectPresetWorkingDraftTransactionV1({
  ...input,
  runtime: input.runtime as unknown as SubjectPresetWorkingDraftTransactionRuntimeV1,
});

const baseline: SubjectPresetLocalBaselineV1 = {
  subjectDefinitionId: "vehicle.four-wheel.arcade",
  subjectDefinitionRef: "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
  subjectDefinitionContentHash: `sha256:${"1".repeat(64)}`,
  defaultMotionProfile: {
    resourceRef: "worldkit://motion-profile/wheeled-arcade.medium@1",
    contentHash: `sha256:${"2".repeat(64)}`,
  },
  availableMotionProfiles: [
    {
      resourceRef: "worldkit://motion-profile/wheeled-arcade.medium@1",
      contentHash: `sha256:${"2".repeat(64)}`,
    },
    {
      resourceRef: "worldkit://motion-profile/safe-ground@1",
      contentHash: `sha256:${"8".repeat(64)}`,
    },
  ],
  controlFeelProfile: {
    resourceRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
    contentHash: `sha256:${"6".repeat(64)}`,
  },
  availableControlFeelProfiles: [
    {
      resourceRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
      contentHash: `sha256:${"6".repeat(64)}`,
    },
    {
      resourceRef: "worldkit://control-feel-profile/humanoid.heavy-ground@1",
      contentHash: `sha256:${"7".repeat(64)}`,
    },
  ],
  controlProfile: {
    resourceRef: "worldkit://control-profile/throttle-steer.subject-local@1",
    contentHash: `sha256:${"3".repeat(64)}`,
  },
  cameraProfiles: [
    {
      resourceRef: "worldkit://camera-profile/orbit.medium@1",
      contentHash: `sha256:${"4".repeat(64)}`,
    },
    {
      resourceRef: "worldkit://camera-profile/chase.surface-fast@1",
      contentHash: `sha256:${"5".repeat(64)}`,
    },
  ],
  defaultCameraProfileRef: "worldkit://camera-profile/chase.surface-fast@1",
  firstPersonCameraProfileRef: null,
};

describe("subject preset workbench projection", () => {
  it("normalizes compact Camera choices to the same exact Workbench Profile ref", () => {
    expect(normalizeSubjectPresetCameraPreferenceV1("auto", baseline)).toBe("auto");
    expect(normalizeSubjectPresetCameraPreferenceV1(
      "first-person",
      { ...baseline, firstPersonCameraProfileRef: baseline.cameraProfiles[0]!.resourceRef },
    )).toBe(baseline.cameraProfiles[0]!.resourceRef);
    expect(normalizeSubjectPresetCameraPreferenceV1(
      baseline.defaultCameraProfileRef,
      baseline,
    )).toBe(baseline.defaultCameraProfileRef);
    expect(normalizeSubjectPresetCameraPreferenceV1("worldkit://camera-profile/missing@1", baseline))
      .toBe("auto");
  });

  it("keeps independent multi-camera tuning and stores only supported differences", () => {
    const draft = createSubjectPresetWorkbenchDraftV1({
      baseline,
      draftIdentity: {
        draftId: "draft-vehicle",
        createdAtIso: "2026-08-21T08:00:00.000Z",
        updatedAtIso: "2026-08-21T09:00:00.000Z",
      },
      selectedMotionProfileRef: baseline.defaultMotionProfile.resourceRef,
      selectedControlFeelProfileRef: baseline.controlFeelProfile.resourceRef,
      selectedCameraPreferenceRef:
        "worldkit://camera-profile/orbit.medium@1",
      controlFeel: {
        baseParameters: { runSpeedMetersPerSecond: 12, airControlRatio: 0.7 },
        currentValues: { runSpeedMetersPerSecond: 10, airControlRatio: 0.7 },
        runtimeParameterNames: ["runSpeedMetersPerSecond", "airControlRatio"],
      },
      control: {
        baseParameters: { moveDeadzoneRatio: 0.08 },
        currentValues: { moveDeadzoneRatio: 0.12 },
        runtimeParameterNames: ["moveDeadzoneRatio"],
      },
      cameraByProfileRef: {
        "worldkit://camera-profile/orbit.medium@1": {
          baseParameters: { distanceMeters: 5, lookAheadSeconds: 0 },
          currentValues: { distanceMeters: 5.5, lookAheadSeconds: 0 },
        },
        "worldkit://camera-profile/chase.surface-fast@1": {
          baseParameters: { distanceMeters: 8, lookAheadSeconds: 0.45 },
          currentValues: { distanceMeters: 8, lookAheadSeconds: 0.2 },
        },
      },
    });

    expect(draft.controlFeelOverridesByProfileRef).toEqual({
      [baseline.controlFeelProfile.resourceRef]: {
        baseResourceRef: baseline.controlFeelProfile.resourceRef,
        baseContentHash: baseline.controlFeelProfile.contentHash,
        values: { runSpeedMetersPerSecond: 10 },
      },
    });
    expect(draft.controlOverridesByProfileRef).toEqual({
      [baseline.controlProfile.resourceRef]: {
        baseResourceRef: baseline.controlProfile.resourceRef,
        baseContentHash: baseline.controlProfile.contentHash,
        values: { moveDeadzoneRatio: 0.12 },
      },
    });
    expect(draft.cameraOverridesByProfileRef).toEqual({
      "worldkit://camera-profile/chase.surface-fast@1": {
        baseResourceRef: "worldkit://camera-profile/chase.surface-fast@1",
        baseContentHash: `sha256:${"5".repeat(64)}`,
        values: { lookAheadSeconds: 0.2 },
      },
      "worldkit://camera-profile/orbit.medium@1": {
        baseResourceRef: "worldkit://camera-profile/orbit.medium@1",
        baseContentHash: `sha256:${"4".repeat(64)}`,
        values: { distanceMeters: 5.5 },
      },
    });
  });

  it("turns a restored draft into one exact atomic Runtime request", () => {
    const draft = createSubjectPresetWorkbenchDraftV1({
      baseline,
      draftIdentity: {
        draftId: "draft-restored",
        createdAtIso: "2026-08-21T08:00:00.000Z",
        updatedAtIso: "2026-08-21T09:00:00.000Z",
      },
      selectedMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
      selectedControlFeelProfileRef:
        "worldkit://control-feel-profile/humanoid.heavy-ground@1",
      selectedCameraPreferenceRef: null,
      controlFeel: {
        baseParameters: { runSpeedMetersPerSecond: 3 },
        currentValues: { runSpeedMetersPerSecond: 2.8 },
        runtimeParameterNames: ["runSpeedMetersPerSecond"],
      },
      control: {
        baseParameters: { moveDeadzoneRatio: 0.08 },
        currentValues: { moveDeadzoneRatio: 0.08 },
        runtimeParameterNames: ["moveDeadzoneRatio"],
      },
      cameraByProfileRef: {},
    });

    expect(draft.selectedMotionProfileRef).toBe(
      "worldkit://motion-profile/safe-ground@1",
    );
    expect(draft.controlFeelOverridesByProfileRef).toEqual({
      "worldkit://control-feel-profile/humanoid.heavy-ground@1": {
        baseResourceRef:
          "worldkit://control-feel-profile/humanoid.heavy-ground@1",
        baseContentHash: `sha256:${"7".repeat(64)}`,
        values: { runSpeedMetersPerSecond: 2.8 },
      },
    });

    expect(subjectPresetTuningRequestFromDraftV1(draft, "player")).toEqual({
      subjectEntityId: "player",
      expectedSubjectDefinitionRef: baseline.subjectDefinitionRef,
      expectedSubjectDefinitionContentHash: baseline.subjectDefinitionContentHash,
      selectedMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
      selectedControlFeelProfileRef:
        "worldkit://control-feel-profile/humanoid.heavy-ground@1",
      selectedControlProfileRef: baseline.controlProfile.resourceRef,
    });
    expect(cameraPreviewRequestFromDraftV1(draft)).toEqual({
      tuningByProfileRef: {},
    });
  });

  it("rejects a Motion Profile that is not in the exact baseline", () => {
    expect(() => createSubjectPresetWorkbenchDraftV1({
      baseline,
      draftIdentity: {
        draftId: "draft-unreachable-motion",
        createdAtIso: "2026-08-21T08:00:00.000Z",
        updatedAtIso: "2026-08-21T09:00:00.000Z",
      },
      selectedMotionProfileRef: "worldkit://motion-profile/unknown@1",
      selectedControlFeelProfileRef: baseline.controlFeelProfile.resourceRef,
      selectedCameraPreferenceRef: null,
      controlFeel: {
        baseParameters: {},
        currentValues: {},
      },
      control: {
        baseParameters: {},
        currentValues: {},
      },
      cameraByProfileRef: {},
    })).toThrow(/SUBJECT_PRESET_WORKBENCH_MOTION_UNREACHABLE/);
  });
});

describe("subject preset workbench Runtime transaction", () => {
  const createDraft = () => createSubjectPresetWorkbenchDraftV1({
    baseline,
    draftIdentity: {
      draftId: "draft-transaction",
      createdAtIso: "2026-08-21T08:00:00.000Z",
      updatedAtIso: "2026-08-21T09:00:00.000Z",
    },
    selectedMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
    selectedControlFeelProfileRef:
      "worldkit://control-feel-profile/humanoid.heavy-ground@1",
    selectedCameraPreferenceRef: "worldkit://camera-profile/orbit.medium@1",
    controlFeel: { baseParameters: {}, currentValues: {} },
    control: { baseParameters: {}, currentValues: {} },
    cameraByProfileRef: {
      "worldkit://camera-profile/orbit.medium@1": {
        baseParameters: { distanceMeters: 5 },
        currentValues: { distanceMeters: 5.5 },
      },
    },
  });

  const createRuntime = (options: Readonly<{
    gameplayOutcome?: "committed" | "rejected" | "throw-after-mutation";
    cameraOutcome?: "committed" | "throw-after-preview-mutation";
  }> = {}) => {
    const state = {
      cameraPreferenceRef: null as string | null,
      cameraTuningByProfileRef: {
        "worldkit://camera-profile/chase.surface-fast@1": { distanceMeters: 7.5 },
      } as Record<string, Record<string, number>>,
      motionProfileRef: baseline.defaultMotionProfile.resourceRef,
      controlFeelProfileRef: baseline.controlFeelProfile.resourceRef,
    };
    let gameplayApplyCount = 0;
    let cameraPreviewApplyCount = 0;
    const runtime: TransactionRuntimeDouble = {
      getSubjectSnapshot: () => ({
        activeControlFeelProfileRef: state.controlFeelProfileRef,
        activeMotionProfileRef: state.motionProfileRef,
      }),
      getCameraPreviewState: () => ({
        tuningByProfileRef: structuredClone(state.cameraTuningByProfileRef),
      }),
      requestCameraProfile: (profileRef) => {
        state.cameraPreferenceRef = profileRef;
      },
      resetCameraProfile: () => {
        state.cameraPreferenceRef = null;
      },
      applyCameraPreview: (request) => {
        cameraPreviewApplyCount += 1;
        state.cameraTuningByProfileRef = structuredClone(request.tuningByProfileRef);
        if (
          options.cameraOutcome === "throw-after-preview-mutation" &&
          cameraPreviewApplyCount === 1
        ) {
          throw new Error("camera preview failed");
        }
      },
      applySubjectPresetTuning: (request) => {
        gameplayApplyCount += 1;
        if (options.gameplayOutcome === "rejected") {
          return { status: "rejected", diagnostic: { message: "not applicable" } };
        }
        state.motionProfileRef = request.selectedMotionProfileRef;
        state.controlFeelProfileRef = request.selectedControlFeelProfileRef;
        if (options.gameplayOutcome === "throw-after-mutation" && gameplayApplyCount === 1) {
          throw new Error("gameplay commit failed");
        }
        return { status: "committed" };
      },
    };
    return { runtime, state };
  };

  it("rolls Camera Profile and preview tuning back when Gameplay rejects", () => {
    const { runtime, state } = createRuntime({ gameplayOutcome: "rejected" });

    const result = applyTransaction({
      draft: createDraft(),
      subjectEntityId: "player",
      previousCameraPreferenceRef: null,
      runtime,
    });

    expect(result.status).toBe("rejected");
    expect(state).toEqual({
      cameraPreferenceRef: null,
      cameraTuningByProfileRef: {
        "worldkit://camera-profile/chase.surface-fast@1": { distanceMeters: 7.5 },
      },
      motionProfileRef: baseline.defaultMotionProfile.resourceRef,
      controlFeelProfileRef: baseline.controlFeelProfile.resourceRef,
    });
  });

  it("rolls a Camera Profile mutation back when Camera preview fails", () => {
    const { runtime, state } = createRuntime({
      cameraOutcome: "throw-after-preview-mutation",
    });

    const result = applyTransaction({
      draft: createDraft(),
      subjectEntityId: "player",
      previousCameraPreferenceRef: null,
      runtime,
    });

    expect(result.status).toBe("failed");
    expect(state).toEqual({
      cameraPreferenceRef: null,
      cameraTuningByProfileRef: {
        "worldkit://camera-profile/chase.surface-fast@1": { distanceMeters: 7.5 },
      },
      motionProfileRef: baseline.defaultMotionProfile.resourceRef,
      controlFeelProfileRef: baseline.controlFeelProfile.resourceRef,
    });
  });

  it("compensates both Gameplay and Camera when Gameplay throws after mutation", () => {
    const { runtime, state } = createRuntime({ gameplayOutcome: "throw-after-mutation" });

    const result = applyTransaction({
      draft: createDraft(),
      subjectEntityId: "player",
      previousCameraPreferenceRef: null,
      runtime,
    });

    expect(result.status).toBe("failed");
    expect(state).toEqual({
      cameraPreferenceRef: null,
      cameraTuningByProfileRef: {
        "worldkit://camera-profile/chase.surface-fast@1": { distanceMeters: 7.5 },
      },
      motionProfileRef: baseline.defaultMotionProfile.resourceRef,
      controlFeelProfileRef: baseline.controlFeelProfile.resourceRef,
    });
  });
});
