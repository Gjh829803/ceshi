import { describe, expect, it } from "vitest";

import type { SubjectPresetLocalBaselineV1 } from "./subject-preset-local";
import {
  createSubjectPresetWorkbenchDraftV1,
  normalizeSubjectPresetCameraPreferenceV1,
  subjectPresetTuningRequestFromDraftV1,
} from "./subject-preset-workbench";

const baseline: SubjectPresetLocalBaselineV1 = {
  subjectDefinitionId: "vehicle.four-wheel.arcade",
  subjectDefinitionRef: "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
  subjectDefinitionContentHash: `sha256:${"1".repeat(64)}`,
  defaultMotionProfile: {
    resourceRef: "worldkit://motion-profile/wheeled-arcade.medium@1",
    contentHash: `sha256:${"2".repeat(64)}`,
  },
  controlFeelProfile: {
    resourceRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
    contentHash: `sha256:${"6".repeat(64)}`,
  },
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
      selectedCameraPreferenceRef: null,
      controlFeel: {
        baseParameters: { runSpeedMetersPerSecond: 12 },
        currentValues: { runSpeedMetersPerSecond: 12 },
        runtimeParameterNames: ["runSpeedMetersPerSecond"],
      },
      control: {
        baseParameters: { moveDeadzoneRatio: 0.08 },
        currentValues: { moveDeadzoneRatio: 0.08 },
        runtimeParameterNames: ["moveDeadzoneRatio"],
      },
      cameraByProfileRef: {},
    });

    expect(subjectPresetTuningRequestFromDraftV1(draft, "player")).toEqual({
      subjectEntityId: "player",
      expectedSubjectDefinitionRef: baseline.subjectDefinitionRef,
      expectedSubjectDefinitionContentHash: baseline.subjectDefinitionContentHash,
      controlFeelOverridesByProfileRef: {},
      controlOverridesByProfileRef: {},
      cameraOverridesByProfileRef: {},
      cameraPreference: "auto",
    });
  });
});
