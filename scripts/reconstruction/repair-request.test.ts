import { describe, expect, it } from "vitest";
import { isEmpty, isNil } from "lodash-es";
import {
  parseWorldReconstructionDiagnosticV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionEvaluationResultV1,
  type WorldReconstructionDiagnosticV1,
} from "@whitebox-world/validation";
import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  NATIVE_BLOCK_REPAIR_FORBIDDEN_MUTATION_TARGETS_V1,
  NATIVE_BLOCK_REPAIR_WRITABLE_OUTPUT_PATHS_V1,
  createNativeBlockRepairInstructionV1,
  isRepairableWorldReconstructionEvaluationV1,
} from "./repair-request.js";

const H = (character: string): Sha256HashV1 =>
  `sha256:${character.repeat(64)}` as Sha256HashV1;

const DIMENSIONS = [
  "collider",
  "critical-traversal",
  "deterministic-build",
  "opening-composition",
  "semantic-silhouette",
  "spawn-support",
  "topology",
] as const;

const OWNER_HASHES = Object.freeze({
  caseHash: H("1"),
  evaluationProfileHash: H("2"),
  subjectHostContextHash: H("3"),
  worldBoundsPolicyHash: H("5"),
  bootstrapInputHash: H("6"),
});

function colliderMissingDiagnostic(): WorldReconstructionDiagnosticV1 {
  return parseWorldReconstructionDiagnosticV1({
    kind: "world-reconstruction-diagnostic",
    schemaVersion: 1,
    id: "diag.collider-missing",
    code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
    dimensionId: "collider",
    acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
    targetRef: "worldkit://acceptance-target/central-ascent@1",
    targetId: "west-gate",
    metricId: "collider-contribution-presence",
    details: {
      kind: "presence-mismatch",
      expectedValue: "present",
      actualValue: "missing",
      correctionDirection: "add",
    },
    evidenceRefs: ["artifact://case/cloud-temple/evidence/collider.json"],
    message: "Required west-gate collider is missing.",
    repairAction: {
      kind: "revise-native-source",
      targetKind: "static-collider",
      targetId: "west-gate",
      operation: "add",
      instruction: "Register the missing west-gate static collider contribution.",
    },
  });
}

function traversalEvidenceIncompleteDiagnostic(): WorldReconstructionDiagnosticV1 {
  return parseWorldReconstructionDiagnosticV1({
    kind: "world-reconstruction-diagnostic",
    schemaVersion: 1,
    id: "diag.traversal-incomplete",
    code: "WORLD_RECONSTRUCTION_TRAVERSAL_EVIDENCE_INCOMPLETE",
    dimensionId: "critical-traversal",
    acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
    targetRef: "worldkit://acceptance-target/central-ascent@1",
    targetId: "reach-junction",
    metricId: "critical-traversal-completeness",
    details: {
      kind: "state-mismatch",
      expectedValue: "complete",
      actualValue: "incomplete",
      correctionDirection: "replace",
    },
    evidenceRefs: ["artifact://case/cloud-temple/evidence/critical-traversal.json"],
    message: "Required traversal evidence is incomplete for reach-junction.",
    repairAction: {
      kind: "revise-native-source",
      targetKind: "traversal-check",
      targetId: "reach-junction",
      operation: "adjust-traversal",
      instruction: "Adjust the Native route until reach-junction can be measured conclusively.",
    },
  });
}

function profile() {
  return parseWorldReconstructionEvaluationProfileV1({
    kind: "world-reconstruction-evaluation-profile",
    schemaVersion: 1,
    id: "cloud-temple.profile",
    dimensionIds: [...DIMENSIONS],
    qualityGateMode: "required-for-publication",
    maximumRepairAttemptCount: 3,
    builderSelfRepairAttemptCount: 3,
    thresholds: {
      semanticSilhouetteTargets: [{
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        maximumBoundsDriftBasisPoints: 100,
        maximumCenterDriftBasisPoints: 100,
        maximumCoverageDriftBasisPoints: 100,
      }],
      openingComposition: {
        regions: [{
          targetRef: "worldkit://composition-target/opening@1",
          maximumDriftBasisPoints: 100,
        }],
        anchors: [{
          targetRef: "worldkit://composition-target/opening@1",
          maximumDriftBasisPoints: 100,
        }],
      },
      spawnSupport: {
        maximumPositionDriftMillimeters: 100,
        maximumSupportGapMillimeters: 10,
      },
    },
    requiredEvidenceByDimension: DIMENSIONS.map((dimensionId) => ({
      dimensionId,
      evidenceProfileRefs: [`worldkit://evidence-profile/${dimensionId}@1`],
    })),
  });
}

function evaluation(input: {
  readonly outcome: "passed" | "failed" | "incomplete";
  readonly diagnostics?: readonly WorldReconstructionDiagnosticV1[];
}) {
  const diagnostics = input.diagnostics ?? [];
  const failedIds = new Set(diagnostics.map(({ dimensionId }) => dimensionId));
  return parseWorldReconstructionEvaluationResultV1({
    kind: "world-reconstruction-evaluation-result",
    schemaVersion: 1,
    id: "cloud-temple.attempt-0.result",
    caseRef: "artifact://world-reconstruction-case/cloud-temple-t-gate-native-block/case.json",
    caseHash: H("d"),
    evaluationProfileRef: "artifact://case/cloud-temple/evaluation-profile.json",
    evaluationProfileHash: H("e"),
    evidenceSetRef: "artifact://case/cloud-temple/attempts/0/evidence-set.json",
    evidenceSetHash: H("3"),
    attemptRef: "artifact://case/cloud-temple/attempts/0/attempt.json",
    attemptHash: H("f"),
    worldPackageRef: `package://world-package/sha256/${"1".repeat(64)}`,
    worldPackageRootHash: H("1"),
    worldBuildIdentityRef:
      "artifact://case/cloud-temple/attempts/0/world-build-identity.json",
    worldBuildIdentityHash: H("8"),
    captureReceiptRef: "artifact://case/cloud-temple/attempts/0/capture-receipt.json",
    captureReceiptHash: H("2"),
    outcome: input.outcome,
    diagnostics,
    dimensions: DIMENSIONS.map((dimensionId) => {
      const dimensionDiagnostics = diagnostics.filter(
        (diagnostic) => diagnostic.dimensionId === dimensionId,
      );
      const isFailed = failedIds.has(dimensionId) && input.outcome === "failed";
      const isIncomplete =
        failedIds.has(dimensionId) && input.outcome === "incomplete";
      return {
        dimensionId,
        status: isFailed ? "failed" : isIncomplete ? "incomplete" : "passed",
        metrics: isIncomplete
          ? []
          : [{ kind: "boolean-presence", isPresent: !isFailed }],
        evidenceRefs: isIncomplete
          ? []
          : [`artifact://case/cloud-temple/evidence/${dimensionId}.json`],
        diagnosticIds: dimensionDiagnostics.map(({ id }) => id).sort(),
        identity: {
          attemptHash: H("f"),
          worldPackageRootHash: H("1"),
          worldBuildIdentityHash: H("8"),
          captureReceiptHash: H("2"),
        },
      };
    }),
  });
}

describe("createNativeBlockRepairInstructionV1", () => {
  it("declares exactly the three Native authoring outputs and freezes owner identities", () => {
    const diagnostic = colliderMissingDiagnostic();
    const instruction = createNativeBlockRepairInstructionV1({
      priorAttemptIndex: 0,
      nextAttemptIndex: 1,
      diagnostics: [diagnostic],
      priorSourceRef: "artifact://case/cloud-temple/attempts/0/source",
      priorSourceHash: H("a"),
      priorEvidence: {
        kind: "evaluation-result",
        resultRef: "artifact://case/cloud-temple/attempts/0/evaluation.json",
        resultHash: H("b"),
      },
      priorGenerationRequestRef:
        "artifact://case/cloud-temple/attempts/0/generation-request.json",
      priorGenerationRequestHash: H("c"),
      frozenOwnerIdentities: OWNER_HASHES,
    });

    expect(instruction.kind).toBe("native-block-repair-instruction");
    expect(instruction.schemaVersion).toBe(1);
    expect(instruction.priorAttemptIndex).toBe(0);
    expect(instruction.nextAttemptIndex).toBe(1);
    expect(instruction.declaredWritableOutputPaths).toEqual([
      "scene.ts",
      "native-block-authoring.json",
      "native-resources.json",
    ]);
    expect(instruction.declaredWritableOutputPaths).toEqual(
      NATIVE_BLOCK_REPAIR_WRITABLE_OUTPUT_PATHS_V1,
    );
    expect(instruction.frozenOwnerIdentities).toEqual(OWNER_HASHES);
    expect(instruction.frozenOwnerIdentities.bootstrapInputHash).toBe(H("6"));
    expect(instruction.diagnostics).toEqual([diagnostic]);
    expect(Object.isFrozen(instruction)).toBe(true);
    expect(Object.isFrozen(instruction.declaredWritableOutputPaths)).toBe(true);
    expect(
      NATIVE_BLOCK_REPAIR_FORBIDDEN_MUTATION_TARGETS_V1,
    ).toEqual(expect.arrayContaining([
      "case",
      "profile",
      "gameplay-bootstrap",
      "world-runtime-bootstrap",
      "world-bounds-policy",
      "derived-bootstrap",
      "acceptance-thresholds",
      "runtime",
      "physics",
      "camera",
      "evaluator",
      "prior-package",
      "prior-capture",
      "prior-durable-attempt-inputs",
    ]));
    expect(instruction.forbiddenMutationTargets).toEqual(
      NATIVE_BLOCK_REPAIR_FORBIDDEN_MUTATION_TARGETS_V1,
    );
    expect(instruction).not.toHaveProperty("case");
    expect(instruction).not.toHaveProperty("evaluationProfile");
    expect(instruction).not.toHaveProperty("worldPackage");
    expect(instruction).not.toHaveProperty("captureReceipt");
  });

  it("rejects empty diagnostics and non-repairable evidence diagnostics", () => {
    expect(() => createNativeBlockRepairInstructionV1({
      priorAttemptIndex: 0,
      nextAttemptIndex: 1,
      diagnostics: [],
      priorSourceRef: "artifact://case/cloud-temple/attempts/0/source",
      priorSourceHash: H("a"),
      priorEvidence: {
        kind: "evaluation-result",
        resultRef: "artifact://case/cloud-temple/attempts/0/evaluation.json",
        resultHash: H("b"),
      },
      priorGenerationRequestRef:
        "artifact://case/cloud-temple/attempts/0/generation-request.json",
      priorGenerationRequestHash: H("c"),
      frozenOwnerIdentities: OWNER_HASHES,
    })).toThrowError(/WORLD_RECONSTRUCTION_NON_REPAIRABLE|empty/);

    const stale = parseWorldReconstructionDiagnosticV1({
      kind: "world-reconstruction-diagnostic",
      schemaVersion: 1,
      id: "diag.stale",
      code: "WORLD_RECONSTRUCTION_EVIDENCE_STALE",
      dimensionId: "collider",
      acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
      targetRef: "worldkit://acceptance-target/central-ascent@1",
      targetId: "collider",
      metricId: "evidence-identity",
      details: {
        kind: "state-mismatch",
        expectedValue: "current",
        actualValue: "stale",
        correctionDirection: "replace",
      },
      evidenceRefs: [],
      message: "Capture identity is stale.",
    });
    expect(() => createNativeBlockRepairInstructionV1({
      priorAttemptIndex: 0,
      nextAttemptIndex: 1,
      diagnostics: [stale],
      priorSourceRef: "artifact://case/cloud-temple/attempts/0/source",
      priorSourceHash: H("a"),
      priorEvidence: {
        kind: "evaluation-result",
        resultRef: "artifact://case/cloud-temple/attempts/0/evaluation.json",
        resultHash: H("b"),
      },
      priorGenerationRequestRef:
        "artifact://case/cloud-temple/attempts/0/generation-request.json",
      priorGenerationRequestHash: H("c"),
      frozenOwnerIdentities: OWNER_HASHES,
    })).toThrowError("WORLD_RECONSTRUCTION_NON_REPAIRABLE");
  });
});

describe("isRepairableWorldReconstructionEvaluationV1", () => {
  it("repairs failed or source-repairable incomplete evaluations while budget remains", () => {
    const failed = evaluation({
      outcome: "failed",
      diagnostics: [colliderMissingDiagnostic()],
    });
    expect(isRepairableWorldReconstructionEvaluationV1(failed, profile(), 0)).toBe(
      true,
    );
    expect(isRepairableWorldReconstructionEvaluationV1(failed, profile(), 2)).toBe(
      true,
    );
    expect(isRepairableWorldReconstructionEvaluationV1(failed, profile(), 3)).toBe(
      false,
    );

    const repairableIncomplete = evaluation({
      outcome: "incomplete",
      diagnostics: [traversalEvidenceIncompleteDiagnostic()],
    });
    expect(
      isRepairableWorldReconstructionEvaluationV1(repairableIncomplete, profile(), 0),
    ).toBe(true);

    const passed = evaluation({ outcome: "passed" });
    expect(isEmpty(passed.diagnostics)).toBe(true);
    expect(isRepairableWorldReconstructionEvaluationV1(passed, profile(), 0)).toBe(
      false,
    );

    const incomplete = evaluation({
      outcome: "incomplete",
      diagnostics: [parseWorldReconstructionDiagnosticV1({
        kind: "world-reconstruction-diagnostic",
        schemaVersion: 1,
        id: "diag.missing",
        code: "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
        dimensionId: "spawn-support",
        acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
        targetRef: "worldkit://acceptance-target/central-ascent@1",
        targetId: "spawn-support",
        metricId: "required-evidence-presence",
        details: {
          kind: "presence-mismatch",
          expectedValue: "present",
          actualValue: "missing",
          correctionDirection: "add",
        },
        evidenceRefs: [],
        message: "Spawn support evidence is absent.",
      })],
    });
    expect(
      isRepairableWorldReconstructionEvaluationV1(incomplete, profile(), 0),
    ).toBe(false);
    expect(isNil(incomplete.diagnostics[0])).toBe(false);
  });
});
