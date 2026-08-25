import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  builtInSubjectResourceRegistry,
  resolveSubjectPresetClosureV1,
} from "@whitebox-world/subject-registry";

import {
  createSubjectPresetCandidateFromSelectionsV1,
  createSubjectPresetCandidateV1,
  parseSubjectPresetCandidateV1,
  type SubjectPresetCandidateInputV1,
  type SubjectPresetCandidateV1,
} from "./subject-preset-candidate";

const SUBJECT_REF =
  "worldkit://subject-definition/animal.quadruped.forward-steer@1";
const MOTION_REF = "worldkit://motion-profile/free-ground.humanoid-medium@1";
const FALLBACK_MOTION_REF = "worldkit://motion-profile/safe-ground@1";
const CONTROL_REF =
  "worldkit://control-profile/planar.camera-relative@1";
const CONTROL_FEEL_REF =
  "worldkit://control-feel-profile/humanoid.medium-ground@1";
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
            disposition: "preserve",
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
        controlFeel: {
          profileRef: CONTROL_FEEL_REF,
          contentHash: lockedHash(CONTROL_FEEL_REF),
          disposition: "derive",
        },
        selectedMotionProfileRef: MOTION_REF,
        selectedMotionContentHash: lockedHash(MOTION_REF),
        control: {
          profileRef: CONTROL_REF,
          contentHash: lockedHash(CONTROL_REF),
          disposition: "preserve",
        },
        cameraContextProfileRef: CAMERA_CONTEXT_REF,
        defaultCameraRigProfileRef: ORBIT_CAMERA_REF,
      },
      overrides: {
        controlFeelByProfileRef: {
          [CONTROL_FEEL_REF]: {
            baseResourceRef: CONTROL_FEEL_REF,
            baseContentHash: lockedHash(CONTROL_FEEL_REF),
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
      passedCheckIds: ["H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08", "H09"],
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

  it("locks every Motion role and rejects numeric Motion derivation", () => {
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
      "SUBJECT_PRESET_CANDIDATE_MOTION_DERIVATION_UNSUPPORTED",
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
    unknown.semanticContent.overrides.controlFeelByProfileRef[CONTROL_FEEL_REF]!.values = {
      doesNotExist: 1,
    };
    expect(() => parseSubjectPresetCandidateV1(rehash(unknown))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_INVALID_CONTROL_FEEL_OVERRIDE",
    );

    const nonFinite = clone(validCandidate());
    nonFinite.semanticContent.overrides.controlFeelByProfileRef[CONTROL_FEEL_REF]!.values = {
      turnRateRadiansPerSecond: Number.NaN,
    };
    expect(() => parseSubjectPresetCandidateV1(nonFinite)).toThrow(
      "SUBJECT_PRESET_CANDIDATE_NON_FINITE_PARAMETER",
    );

    const unsafe = clone(validCandidate());
    unsafe.semanticContent.overrides.controlFeelByProfileRef[CONTROL_FEEL_REF]!.values = {
      turnRateRadiansPerSecond: 100,
    };
    expect(() => parseSubjectPresetCandidateV1(rehash(unsafe))).toThrow(
      "SUBJECT_PRESET_CANDIDATE_INVALID_CONTROL_FEEL_OVERRIDE",
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

    const forgedZeroCommit = clone(validCandidate());
    forgedZeroCommit.provenance.sourceCommit = "0".repeat(40);
    expect(() => parseSubjectPresetCandidateV1(forgedZeroCommit)).toThrow(
      "SUBJECT_PRESET_CANDIDATE_INVALID_SOURCE_COMMIT",
    );
  });

  it("keeps partial browser harness evidence as informational provenance", () => {
    const incomplete = clone(validCandidate());
    incomplete.evidence.passedCheckIds = ["H01", "H02", "H03"];
    expect(parseSubjectPresetCandidateV1(incomplete).evidence.passedCheckIds).toEqual([
      "H01",
      "H02",
      "H03",
    ]);

    const emptyEvidence = clone(validCandidate());
    emptyEvidence.evidence.passedCheckIds = [];
    expect(parseSubjectPresetCandidateV1(emptyEvidence).evidence.passedCheckIds).toEqual([]);
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

  it("rejects negative-zero numeric overrides instead of repairing signed input", () => {
    const candidate = clone(validCandidate());
    const override = candidate.semanticContent.overrides.controlFeelByProfileRef[
      CONTROL_FEEL_REF
    ]! as { values: Record<string, number> };
    override.values.turnRateRadiansPerSecond = -0;

    expect(() => parseSubjectPresetCandidateV1(candidate)).toThrow(
      "SUBJECT_PRESET_CANDIDATE_NEGATIVE_ZERO_PARAMETER",
    );
  });

  it("accepts a non-default allowed Control Feel when the hash matches exactly", () => {
    const heavyRef = "worldkit://control-feel-profile/humanoid.heavy-ground@1";
    const input = validInput();
    input.semanticContent.selections.controlFeel = {
      profileRef: heavyRef,
      contentHash: lockedHash(heavyRef),
      disposition: "preserve",
    };
    input.semanticContent.overrides.controlFeelByProfileRef = {};
    expect(createSubjectPresetCandidateV1(input).semanticContent.selections.controlFeel.profileRef)
      .toBe(heavyRef);
  });

  it("rejects a G Bot candidate that selects a quadruped-specific Control Feel", () => {
    const gBotRef = "worldkit://subject-definition/humanoid.g-bot@2";
    const quadrupedFeelRef =
      "worldkit://control-feel-profile/subject.animal.quadruped.forward-steer.default@1";
    const gBotClosure = resolveSubjectPresetClosureV1(
      builtInSubjectResourceRegistry,
      gBotRef,
    );
    const input = validInput();
    input.semanticContent.subjectDefinitionId = "humanoid.g-bot";
    input.semanticContent.base = {
      subjectDefinitionRef: gBotRef,
      subjectDefinitionContentHash: gBotClosure.subjectDefinitionContentHash,
      registryLock: gBotClosure.entries,
      registryLockHash: gBotClosure.contentHash,
    };
    input.semanticContent.selections.controlFeel = {
      profileRef: quadrupedFeelRef,
      contentHash: lockedHash(CONTROL_FEEL_REF),
      disposition: "preserve",
    };
    input.semanticContent.overrides.controlFeelByProfileRef = {};
    expect(() => createSubjectPresetCandidateV1(input)).toThrow(
      "SUBJECT_PRESET_CANDIDATE_CONTROL_FEEL_UNREACHABLE",
    );
  });

  it("rejects Camera pitch that exceeds the Profile maximum even when safety would allow it", () => {
    const input = validInput();
    input.semanticContent.overrides.cameraByProfileRef[ORBIT_CAMERA_REF]!.values = {
      pitchRadians: 1.3,
    };
    expect(() => createSubjectPresetCandidateV1(input)).toThrow(
      "SUBJECT_PRESET_CANDIDATE_PARAMETER_OUT_OF_RANGE",
    );
  });

  it("materializes a Candidate from Workbench selections including a fallback Motion", () => {
    const candidate = createSubjectPresetCandidateFromSelectionsV1({
      candidateId: "quadruped-fallback-motion",
      subjectDefinitionRef: SUBJECT_REF,
      selectedMotionProfileRef: FALLBACK_MOTION_REF,
      selectedControlFeelProfileRef: CONTROL_FEEL_REF,
      selectedControlProfileRef: CONTROL_REF,
      defaultCameraRigProfileRef: ORBIT_CAMERA_REF,
      controlFeelOverridesByProfileRef: {},
      controlOverridesByProfileRef: {},
      cameraOverridesByProfileRef: {},
      provenance: validInput().provenance,
      evidence: validInput().evidence,
    });

    expect(candidate.kind).toBe("worldkit-subject-preset-candidate");
    expect(candidate.schemaVersion).toBe(1);
    expect(candidate.semanticContent.selections.selectedMotionProfileRef)
      .toBe(FALLBACK_MOTION_REF);
    expect(candidate.semanticContent.selections.selectedMotionContentHash)
      .toBe(lockedHash(FALLBACK_MOTION_REF));
    expect(candidate.semanticContent.selections.motionRoles.default.sourceProfileRef)
      .toBe(MOTION_REF);
    expect(parseSubjectPresetCandidateV1(clone(candidate))).toEqual(candidate);
  });
});
