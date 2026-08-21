import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  builtInSubjectResourceRegistry,
  resolveSubjectPresetClosureV1,
} from "@whitebox-world/subject-registry";

import {
  createSubjectPresetCandidateV1,
  importLegacyAuthoringSnapshotV4,
  parseSubjectPresetCandidateV1,
  type SubjectPresetCandidateInputV1,
  type SubjectPresetCandidateV1,
} from "./subject-preset-candidate";

const SUBJECT_REF =
  "worldkit://subject-definition/animal.quadruped.forward-steer@1";
const MOTION_REF = "worldkit://motion-profile/forward-steer.medium@1";
const FALLBACK_MOTION_REF = "worldkit://motion-profile/safe-ground@1";
const CONTROL_REF =
  "worldkit://control-profile/throttle-steer.subject-local@1";
const CAMERA_CONTEXT_REF =
  "worldkit://camera-context/capability-driven.default@1";
const ORBIT_CAMERA_REF = "worldkit://camera-profile/orbit.medium@1";
const HARNESS_REF = "worldkit://harness-profile/subject.standard@1";

function lockedHash(resourceRef: string): string {
  const entry = resolveSubjectPresetClosureV1(
    builtInSubjectResourceRegistry,
    SUBJECT_REF,
  ).entries.find((candidate) => candidate.resourceRef === resourceRef);
  if (entry === undefined) throw new Error(`Missing fixture resource ${resourceRef}`);
  return entry.contentHash;
}

function reachableCameraRefs(): readonly string[] {
  const context = builtInSubjectResourceRegistry.resolveCameraContextProfile(
    CAMERA_CONTEXT_REF,
  );
  if (context === undefined) throw new Error("Missing camera context fixture");
  return [...new Set([
    context.defaultCameraRigProfileRef,
    ...(context.firstPersonCameraRigProfileRef === undefined
      ? []
      : [context.firstPersonCameraRigProfileRef]),
    ...context.rules.flatMap((rule) =>
      rule.cameraRigProfileRef === undefined ? [] : [rule.cameraRigProfileRef]
    ),
  ])].sort();
}

function validInput(): SubjectPresetCandidateInputV1 {
  const closure = resolveSubjectPresetClosureV1(
    builtInSubjectResourceRegistry,
    SUBJECT_REF,
  );
  return {
    kind: "worldkit-subject-preset-candidate",
    schemaVersion: 1,
    semanticContent: {
      candidateId: "quadruped-official-v1",
      subjectDefinitionId: "animal.quadruped.forward-steer",
      base: {
        subjectDefinitionRef: SUBJECT_REF,
        subjectDefinitionContentHash: closure.subjectDefinitionContentHash,
        registryLock: closure.entries,
        registryLockHash: closure.contentHash,
      },
      selections: {
        motionRoles: {
          default: {
            sourceProfileRef: MOTION_REF,
            sourceContentHash: lockedHash(MOTION_REF),
            disposition: "derive",
          },
          optional: [{
            sourceProfileRef: FALLBACK_MOTION_REF,
            sourceContentHash: lockedHash(FALLBACK_MOTION_REF),
            disposition: "preserve",
          }],
          fallback: {
            sourceProfileRef: FALLBACK_MOTION_REF,
            sourceContentHash: lockedHash(FALLBACK_MOTION_REF),
            disposition: "preserve",
          },
        },
        control: {
          profileRef: CONTROL_REF,
          contentHash: lockedHash(CONTROL_REF),
          disposition: "preserve",
        },
        cameraContextProfileRef: CAMERA_CONTEXT_REF,
        defaultCameraRigProfileRef: ORBIT_CAMERA_REF,
      },
      overrides: {
        motionByProfileRef: {
          [MOTION_REF]: {
            baseResourceRef: MOTION_REF,
            baseContentHash: lockedHash(MOTION_REF),
            values: { turnRateRadiansPerSecond: 2.4 },
          },
        },
        controlByProfileRef: {},
        cameraByProfileRef: {
          [ORBIT_CAMERA_REF]: {
            baseResourceRef: ORBIT_CAMERA_REF,
            baseContentHash: lockedHash(ORBIT_CAMERA_REF),
            values: { targetHeightMeters: 1.35 },
          },
        },
        cameraPublicationBySourceProfileRef: Object.fromEntries(
          reachableCameraRefs().map((resourceRef) => [
            resourceRef,
            {
              sourceContentHash: lockedHash(resourceRef),
              disposition: resourceRef === ORBIT_CAMERA_REF ? "derive" : "preserve",
            },
          ]),
        ),
      },
      publication: {
        mode: "subject-scoped-derivatives",
        publicDefaultEnabled: true,
      },
    },
    provenance: {
      displayName: "Quadruped official feel",
      notes: "Six reviewed tuning differences.",
      createdAtIso: "2026-08-21T08:00:00.000Z",
      sourceCommit: "0123456789abcdef0123456789abcdef01234567",
    },
    evidence: {
      harnessProfileRef: HARNESS_REF,
      passedCheckIds: ["H01", "H02", "H03"],
      runtimeBuild: "playground-2026.08.21",
    },
  };
}

function validCandidate(): SubjectPresetCandidateV1 {
  return createSubjectPresetCandidateV1(validInput());
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rehash(candidate: SubjectPresetCandidateV1): SubjectPresetCandidateV1 {
  candidate.semanticContentHash = sha256CanonicalJson(candidate.semanticContent);
  return candidate;
}

describe("subject preset candidate V1", () => {
  it("hashes only canonical semantic content and returns a deeply frozen projection", () => {
    const first = validCandidate();
    const second = createSubjectPresetCandidateV1({
      ...validInput(),
      provenance: {
        ...validInput().provenance,
        notes: "A provenance-only edit does not change Registry output.",
      },
    });

    expect(first.semanticContentHash).toBe(
      sha256CanonicalJson(first.semanticContent),
    );
    expect(second.semanticContentHash).toBe(first.semanticContentHash);
    expect(parseSubjectPresetCandidateV1(clone(first))).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.semanticContent)).toBe(true);
    expect(Object.isFrozen(first.semanticContent.base.registryLock)).toBe(true);
    expect(Object.isFrozen(first.semanticContent.overrides.cameraByProfileRef)).toBe(true);
  });

  it("rejects unknown fields instead of cloning untrusted candidate data", () => {
    const candidate = clone(validCandidate()) as SubjectPresetCandidateV1 & {
      semanticContent: SubjectPresetCandidateV1["semanticContent"] & {
        unexpected: boolean;
      };
    };
    candidate.semanticContent.unexpected = true;

    expect(() => parseSubjectPresetCandidateV1(candidate)).toThrow(
      "SUBJECT_PRESET_CANDIDATE_UNKNOWN_FIELD",
    );
  });

  it("rejects incomplete, duplicate, stale, and forged Registry locks", () => {
    const missing = clone(validCandidate());
    missing.semanticContent.base.registryLock =
      missing.semanticContent.base.registryLock.slice(1);
    expect(() => parseSubjectPresetCandidateV1(rehash(missing))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_REGISTRY_LOCK_MISMATCH",
    );

    const duplicate = clone(validCandidate());
    duplicate.semanticContent.base.registryLock = [
      ...duplicate.semanticContent.base.registryLock,
      duplicate.semanticContent.base.registryLock[0]!,
    ];
    expect(() => parseSubjectPresetCandidateV1(rehash(duplicate))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_REGISTRY_LOCK_MISMATCH",
    );

    const stale = clone(validCandidate());
    stale.semanticContent.base.subjectDefinitionContentHash =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(() => parseSubjectPresetCandidateV1(rehash(stale))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
    );

    const forged = clone(validCandidate());
    forged.semanticContentHash =
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(() => parseSubjectPresetCandidateV1(forged)).toThrow(
      "SUBJECT_PRESET_CANDIDATE_HASH_MISMATCH",
    );
  });

  it("requires an exact derive/preserve publication decision for every reachable camera", () => {
    const missingPublication = clone(validCandidate());
    delete missingPublication.semanticContent.overrides
      .cameraPublicationBySourceProfileRef[reachableCameraRefs()[0]!];
    expect(() => parseSubjectPresetCandidateV1(rehash(missingPublication))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_CAMERA_PUBLICATION_SET_MISMATCH",
    );

    const derivedWithoutOverride = clone(validCandidate());
    const preservedRef = reachableCameraRefs().find(
      (resourceRef) => resourceRef !== ORBIT_CAMERA_REF,
    )!;
    derivedWithoutOverride.semanticContent.overrides
      .cameraPublicationBySourceProfileRef[preservedRef]!.disposition = "derive";
    expect(() => parseSubjectPresetCandidateV1(rehash(derivedWithoutOverride))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_CAMERA_OVERRIDE_SET_MISMATCH",
    );

    const preservedWithOverride = clone(validCandidate());
    preservedWithOverride.semanticContent.overrides
      .cameraPublicationBySourceProfileRef[ORBIT_CAMERA_REF]!.disposition = "preserve";
    expect(() => parseSubjectPresetCandidateV1(rehash(preservedWithOverride))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_CAMERA_OVERRIDE_SET_MISMATCH",
    );

    const unreachableDefault = clone(validCandidate());
    unreachableDefault.semanticContent.selections.defaultCameraRigProfileRef =
      "worldkit://camera-profile/not-reachable@1";
    expect(() => parseSubjectPresetCandidateV1(rehash(unreachableDefault))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_CAMERA_DEFAULT_UNREACHABLE",
    );
  });

  it("allows only the selected Control profile and ties its override to derive", () => {
    const candidate = clone(validCandidate());
    candidate.semanticContent.selections.control.disposition = "derive";
    candidate.semanticContent.overrides.controlByProfileRef[CONTROL_REF] = {
      baseResourceRef: CONTROL_REF,
      baseContentHash: lockedHash(CONTROL_REF),
      values: { moveDeadzoneRatio: 0.2 },
    };
    expect(parseSubjectPresetCandidateV1(rehash(candidate)).semanticContent.overrides
      .controlByProfileRef[CONTROL_REF]?.values).toEqual({ moveDeadzoneRatio: 0.2 });

    const wrongTarget = clone(candidate);
    delete wrongTarget.semanticContent.overrides.controlByProfileRef[CONTROL_REF];
    wrongTarget.semanticContent.overrides.controlByProfileRef[
      "worldkit://control-profile/safe-none@1"
    ] = {
      baseResourceRef: "worldkit://control-profile/safe-none@1",
      baseContentHash:
        "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      values: { moveDeadzoneRatio: 0.2 },
    };
    expect(() => parseSubjectPresetCandidateV1(rehash(wrongTarget))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_CONTROL_OVERRIDE_SET_MISMATCH",
    );

    const preserveWithOverride = clone(candidate);
    preserveWithOverride.semanticContent.selections.control.disposition = "preserve";
    expect(() => parseSubjectPresetCandidateV1(rehash(preserveWithOverride))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_CONTROL_OVERRIDE_SET_MISMATCH",
    );
  });

  it("locks every Motion role and materializes exactly the profiles marked derive", () => {
    const wrongOptionalRole = clone(validCandidate());
    wrongOptionalRole.semanticContent.selections.motionRoles.optional = [];
    expect(() => parseSubjectPresetCandidateV1(rehash(wrongOptionalRole))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_MOTION_ROLE_MISMATCH",
    );

    const derivedFallbackWithoutOverride = clone(validCandidate());
    derivedFallbackWithoutOverride.semanticContent.selections.motionRoles.fallback.disposition =
      "derive";
    derivedFallbackWithoutOverride.semanticContent.selections.motionRoles.optional[0]!.disposition =
      "derive";
    expect(() => parseSubjectPresetCandidateV1(rehash(derivedFallbackWithoutOverride))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_MOTION_OVERRIDE_SET_MISMATCH",
    );

    const staleRole = clone(validCandidate());
    staleRole.semanticContent.selections.motionRoles.default.sourceContentHash =
      "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    expect(() => parseSubjectPresetCandidateV1(rehash(staleRole))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
    );
  });

  it("rejects unknown, non-finite, and out-of-range Runtime parameters", () => {
    const unknown = clone(validCandidate());
    unknown.semanticContent.overrides.motionByProfileRef[MOTION_REF]!.values = {
      doesNotExist: 1,
    };
    expect(() => parseSubjectPresetCandidateV1(rehash(unknown))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_UNKNOWN_PARAMETER",
    );

    const nonFinite = clone(validCandidate());
    nonFinite.semanticContent.overrides.motionByProfileRef[MOTION_REF]!.values = {
      turnRateRadiansPerSecond: Number.NaN,
    };
    expect(() => parseSubjectPresetCandidateV1(nonFinite)).toThrow(
      "SUBJECT_PRESET_CANDIDATE_NON_FINITE_PARAMETER",
    );

    const unsafe = clone(validCandidate());
    unsafe.semanticContent.overrides.motionByProfileRef[MOTION_REF]!.values = {
      turnRateRadiansPerSecond: 100,
    };
    expect(() => parseSubjectPresetCandidateV1(rehash(unsafe))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_PARAMETER_OUT_OF_RANGE",
    );
  });

  it("uses Runtime safety bounds rather than the narrower Camera authoring slider range", () => {
    const expanded = clone(validCandidate());
    expanded.semanticContent.overrides.cameraByProfileRef[ORBIT_CAMERA_REF]!.values = {
      targetHeightMeters: 8,
    };

    expect(parseSubjectPresetCandidateV1(rehash(expanded)).semanticContent.overrides
      .cameraByProfileRef[ORBIT_CAMERA_REF]?.values.targetHeightMeters).toBe(8);
  });

  it("rejects preview Subject Definition refs and invalid candidate metadata", () => {
    const preview = clone(validCandidate());
    preview.semanticContent.base.subjectDefinitionRef =
      "worldkit://subject-definition/playground-preview.animal.quadruped.forward-steer@1";
    expect(() => parseSubjectPresetCandidateV1(rehash(preview))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_PREVIEW_CLONE",
    );

    const invalidCommit = clone(validCandidate());
    invalidCommit.provenance.sourceCommit = "main";
    expect(() => parseSubjectPresetCandidateV1(invalidCommit)).toThrow(
      "SUBJECT_PRESET_CANDIDATE_INVALID_SOURCE_COMMIT",
    );
  });

  it("rejects malformed Unicode and calendar-invalid ISO timestamps", () => {
    const malformedUnicode = clone(validCandidate());
    malformedUnicode.provenance.displayName = `broken-${String.fromCharCode(0xd800)}`;
    expect(() => parseSubjectPresetCandidateV1(malformedUnicode)).toThrow(
      "SUBJECT_PRESET_CANDIDATE_INVALID_STRING",
    );

    const invalidCalendarDate = clone(validCandidate());
    invalidCalendarDate.provenance.createdAtIso = "2026-02-31T08:00:00.000Z";
    expect(() => parseSubjectPresetCandidateV1(invalidCalendarDate)).toThrow(
      "SUBJECT_PRESET_CANDIDATE_INVALID_TIMESTAMP",
    );
  });
});

function legacySnapshot(): Record<string, unknown> {
  const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(SUBJECT_REF);
  const motion = builtInSubjectResourceRegistry.resolveMotionProfile(MOTION_REF);
  const camera = builtInSubjectResourceRegistry.resolveCameraRigProfile(ORBIT_CAMERA_REF);
  if (definition === undefined || motion === undefined || camera === undefined) {
    throw new Error("Missing legacy fixture resources");
  }
  return {
    schemaVersion: 4,
    subjectDefinition: {
      resourceRef: SUBJECT_REF,
      contentHash: definition.contentHash,
      displayName: "Quadruped Forward Steer",
      semanticClassId: "subject.animal.quadruped",
      bodyTopology: "quadruped",
      authoringAvailability: "advanced",
      defaultMotionProfileRef: MOTION_REF,
      controlProfileRef: CONTROL_REF,
      cameraContextProfileRef: CAMERA_CONTEXT_REF,
    },
    selectedCameraPreference: ORBIT_CAMERA_REF,
    activeCameraModifiers: [],
    cameraTuning: {
      targetHeightMeters: 1.35,
      collisionRetractionMetersPerSecond: 4.5,
      collisionRecoveryMetersPerSecond: 3.25,
    },
    motionParameterDraft: {
      ...motion.parameters,
      turnRateRadiansPerSecond: 2.4,
      jumpSpeedMetersPerSecond: 3.1,
      bodyLeanMaximumRadians: 0.09,
    },
    motionParameterSupport: {
      runtimeParameterNames: Object.keys(motion.parameters),
      draftOnlyParameterNames: [],
      authoringRanges: motion.authoringRanges ?? {},
    },
    inputGuide: [],
    compatibleProfiles: [
      {
        resourceRef: MOTION_REF,
        contentHash: motion.contentHash,
        kind: "motion-profile",
        parameters: motion.parameters,
      },
      {
        resourceRef: ORBIT_CAMERA_REF,
        contentHash: camera.contentHash,
        kind: "camera-rig-profile",
        parameters: camera.parameters,
      },
    ],
    resourceLockRequired: true,
    note: "Legacy snapshot provenance only.",
    capabilityDemoHostOverlay: {
      schemaVersion: 1,
      kind: "capability-demo",
      id: "capability-demo",
      subjectDefinitionRef: SUBJECT_REF,
      changes: [{
        type: "relationship-capabilities-deferred",
        sourceSubjectDefinitionRef: SUBJECT_REF,
        runtimeSubjectDefinitionRef:
          "worldkit://subject-definition/playground-preview.animal.quadruped.forward-steer@1",
        deferredCapabilityRefs: ["worldkit://capability/relationship.mount@1"],
      }],
    },
  };
}

describe("legacy Authoring snapshot V4 adapter", () => {
  const importOptions = {
    candidateId: "quadruped-official-v1",
    displayName: "Quadruped official feel",
    notes: "Imported from the reviewed V4 snapshot.",
    createdAtIso: "2026-08-21T08:00:00.000Z",
    sourceCommit: "0123456789abcdef0123456789abcdef01234567",
    runtimeBuild: "playground-2026.08.21",
    passedCheckIds: ["H01", "H02"] as const,
  };

  it("resolves the canonical Registry baseline and keeps only supported numeric differences", () => {
    const candidate = importLegacyAuthoringSnapshotV4(
      legacySnapshot(),
      importOptions,
    );

    expect(candidate.semanticContent.overrides.motionByProfileRef).toEqual({
      [MOTION_REF]: {
        baseResourceRef: MOTION_REF,
        baseContentHash: lockedHash(MOTION_REF),
        values: {
          bodyLeanMaximumRadians: 0.09,
          jumpSpeedMetersPerSecond: 3.1,
          turnRateRadiansPerSecond: 2.4,
        },
      },
    });
    expect(candidate.semanticContent.overrides.cameraByProfileRef).toEqual({
      [ORBIT_CAMERA_REF]: {
        baseResourceRef: ORBIT_CAMERA_REF,
        baseContentHash: lockedHash(ORBIT_CAMERA_REF),
        values: {
          collisionRecoveryMetersPerSecond: 3.25,
          collisionRetractionMetersPerSecond: 4.5,
          targetHeightMeters: 1.35,
        },
      },
    });
    expect(Object.keys(candidate.semanticContent.overrides
      .cameraPublicationBySourceProfileRef)).toEqual(reachableCameraRefs());
    expect(candidate.semanticContent.base.registryLock).toEqual(
      resolveSubjectPresetClosureV1(
        builtInSubjectResourceRegistry,
        SUBJECT_REF,
      ).entries,
    );
  });

  it("imports the current Workbench Control and multi-Camera tuning without loss", () => {
    const snapshot = legacySnapshot();
    const control = builtInSubjectResourceRegistry.resolveControlProfile(CONTROL_REF);
    const secondaryCameraRef = reachableCameraRefs().find((ref) => ref !== ORBIT_CAMERA_REF);
    const secondaryCamera = secondaryCameraRef === undefined
      ? undefined
      : builtInSubjectResourceRegistry.resolveCameraRigProfile(secondaryCameraRef);
    if (control === undefined || secondaryCamera === undefined || secondaryCameraRef === undefined) {
      throw new Error("Missing Workbench import fixture resources");
    }
    (snapshot.compatibleProfiles as Array<Record<string, unknown>>).push(
      {
        resourceRef: control.resourceRef,
        contentHash: control.contentHash,
        kind: "control-profile",
        parameters: control.inputTuning,
      },
      {
        resourceRef: secondaryCamera.resourceRef,
        contentHash: secondaryCamera.contentHash,
        kind: "camera-rig-profile",
        parameters: secondaryCamera.parameters,
      },
    );
    snapshot.controlTuning = {
      ...control.inputTuning,
      moveDeadzoneRatio: 0.2,
    };
    snapshot.cameraTuningByProfileRef = {
      [ORBIT_CAMERA_REF]: snapshot.cameraTuning,
      [secondaryCameraRef]: {
        baseFovDegrees: secondaryCamera.parameters.baseFovDegrees + 1,
      },
    };

    const candidate = importLegacyAuthoringSnapshotV4(snapshot, importOptions);

    expect(candidate.semanticContent.selections.control.disposition).toBe("derive");
    expect(candidate.semanticContent.overrides.controlByProfileRef).toEqual({
      [CONTROL_REF]: {
        baseResourceRef: CONTROL_REF,
        baseContentHash: control.contentHash,
        values: { moveDeadzoneRatio: 0.2 },
      },
    });
    expect(candidate.semanticContent.overrides.cameraByProfileRef[secondaryCameraRef])
      .toEqual({
        baseResourceRef: secondaryCameraRef,
        baseContentHash: secondaryCamera.contentHash,
        values: { baseFovDegrees: secondaryCamera.parameters.baseFovDegrees + 1 },
      });
    expect(candidate.semanticContent.overrides.cameraPublicationBySourceProfileRef[
      secondaryCameraRef
    ]?.disposition).toBe("derive");
  });

  it("rejects unknown legacy parameter names and relationship preview definitions", () => {
    const unknown = legacySnapshot();
    (unknown.motionParameterDraft as Record<string, unknown>).notARuntimeParameter = 1;
    expect(() => importLegacyAuthoringSnapshotV4(unknown, importOptions)).toThrow(
      "SUBJECT_PRESET_LEGACY_UNKNOWN_PARAMETER",
    );

    const preview = legacySnapshot();
    (preview.subjectDefinition as Record<string, unknown>).resourceRef =
      "worldkit://subject-definition/playground-preview.animal.quadruped.forward-steer@1";
    expect(() => importLegacyAuthoringSnapshotV4(preview, importOptions)).toThrow(
      "SUBJECT_PRESET_CANDIDATE_PREVIEW_CLONE",
    );
  });

  it("rejects incompatible schemas and stale compatible-profile hashes", () => {
    expect(() => importLegacyAuthoringSnapshotV4(
      { ...legacySnapshot(), schemaVersion: 3 },
      importOptions,
    )).toThrow("SUBJECT_PRESET_LEGACY_SCHEMA_UNSUPPORTED");

    const stale = legacySnapshot();
    const profiles = stale.compatibleProfiles as Array<Record<string, unknown>>;
    profiles[0]!.contentHash =
      "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
    expect(() => importLegacyAuthoringSnapshotV4(stale, importOptions)).toThrow(
      "SUBJECT_PRESET_LEGACY_SOURCE_DRIFT",
    );
  });

  it("rejects forged summaries but treats registered active modifiers as transient metadata", () => {
    const forgedSummary = legacySnapshot();
    (forgedSummary.subjectDefinition as Record<string, unknown>).controlProfileRef =
      "worldkit://control-profile/safe-none@1";
    expect(() => importLegacyAuthoringSnapshotV4(forgedSummary, importOptions)).toThrow(
      "SUBJECT_PRESET_LEGACY_SOURCE_DRIFT",
    );

    const activeModifier = legacySnapshot();
    activeModifier.activeCameraModifiers = [{
      resourceRef: "worldkit://camera-modifier/aim-framing@1",
      displayName: "Aim Framing",
    }];
    expect(() => importLegacyAuthoringSnapshotV4(activeModifier, importOptions)).not.toThrow();

    const unknownModifier = legacySnapshot();
    unknownModifier.activeCameraModifiers = [{
      resourceRef: "worldkit://camera-modifier/forged@1",
      displayName: "Forged",
    }];
    expect(() => importLegacyAuthoringSnapshotV4(unknownModifier, importOptions)).toThrow(
      "SUBJECT_PRESET_LEGACY_UNKNOWN_MODIFIER",
    );
  });
});
