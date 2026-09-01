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
  gameplayBootstrapHash: H("3"),
  worldRuntimeBootstrapHash: H("4"),
  worldBoundsHash: H("5"),
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
    evidenceRefs: ["artifact://case/cloud-temple/evidence/collider.json"],
    message: "Required west-gate collider is missing.",
    repairAction: { kind: "revise-native-source" },
  });
}

function profile() {
  return parseWorldReconstructionEvaluationProfileV1({
    kind: "world-reconstruction-evaluation-profile",
    schemaVersion: 1,
    id: "cloud-temple.profile",
    dimensionIds: [...DIMENSIONS],
    maximumRepairAttemptCount: 1,
    builderSelfRepairAttemptCount: 0,
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
        maximumOrderDistanceBasisPoints: 100,
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
    caseRef: "artifact://case/cloud-temple/case.json",
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
      diagnostics: [diagnostic],
      priorSourceRef: "artifact://case/cloud-temple/attempts/0/source",
      priorSourceHash: H("a"),
      priorEvaluationResultRef:
        "artifact://case/cloud-temple/attempts/0/evaluation.json",
      priorEvaluationResultHash: H("b"),
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
      "world-bounds",
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
      diagnostics: [],
      priorSourceRef: "artifact://case/cloud-temple/attempts/0/source",
      priorSourceHash: H("a"),
      priorEvaluationResultRef:
        "artifact://case/cloud-temple/attempts/0/evaluation.json",
      priorEvaluationResultHash: H("b"),
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
      evidenceRefs: [],
      message: "Capture identity is stale.",
      repairAction: { kind: "revise-native-source" },
    });
    expect(() => createNativeBlockRepairInstructionV1({
      diagnostics: [stale],
      priorSourceRef: "artifact://case/cloud-temple/attempts/0/source",
      priorSourceHash: H("a"),
      priorEvaluationResultRef:
        "artifact://case/cloud-temple/attempts/0/evaluation.json",
      priorEvaluationResultHash: H("b"),
      priorGenerationRequestRef:
        "artifact://case/cloud-temple/attempts/0/generation-request.json",
      priorGenerationRequestHash: H("c"),
      frozenOwnerIdentities: OWNER_HASHES,
    })).toThrowError("WORLD_RECONSTRUCTION_NON_REPAIRABLE");
  });
});

describe("isRepairableWorldReconstructionEvaluationV1", () => {
  it("repairs only a failed evaluation with source-or-resource diagnostics and remaining budget", () => {
    const failed = evaluation({
      outcome: "failed",
      diagnostics: [colliderMissingDiagnostic()],
    });
    expect(isRepairableWorldReconstructionEvaluationV1(failed, profile(), 0)).toBe(
      true,
    );
    expect(isRepairableWorldReconstructionEvaluationV1(failed, profile(), 1)).toBe(
      false,
    );

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
        evidenceRefs: [],
        message: "Spawn support evidence is absent.",
        repairAction: { kind: "revise-native-source" },
      })],
    });
    expect(
      isRepairableWorldReconstructionEvaluationV1(incomplete, profile(), 0),
    ).toBe(false);
    expect(isNil(incomplete.diagnostics[0])).toBe(false);
  });
});
