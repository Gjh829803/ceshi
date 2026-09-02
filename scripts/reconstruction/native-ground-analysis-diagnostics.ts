import type {
  BabylonNativeBlockGroundAnalysisReportV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import {
  parseWorldReconstructionDiagnosticV1,
  type WorldReconstructionDiagnosticV1,
} from "@whitebox-world/validation";

/**
 * Converts Block Profile ground facts at the Reconstruction Host boundary.
 * The Profile owns deterministic geometry analysis; Validation remains the
 * sole owner of the repairable World Reconstruction diagnostic contract.
 */
export function createNativeGroundAnalysisRepairDiagnosticsV1(
  report: BabylonNativeBlockGroundAnalysisReportV1,
): readonly WorldReconstructionDiagnosticV1[] {
  return Object.freeze(report.failureFacts.map((fact) => {
    const sourceIdentitySuffix = fact.affectedSourceBlockIds.length === 0
      ? ""
      : ` Affected source Blocks: ${fact.affectedSourceBlockIds.join(", ")}.`;
    return parseWorldReconstructionDiagnosticV1({
      kind: "world-reconstruction-diagnostic",
      schemaVersion: 1,
      id: fact.id,
      code: "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
      dimensionId: "critical-traversal",
      acceptanceTargetRef: fact.acceptanceTargetRef,
      targetRef: fact.acceptanceTargetRef,
      targetId: fact.targetId,
      metricId: fact.metricId,
      details: fact.details,
      evidenceRefs: [fact.evidenceRef],
      message: `${fact.message}${sourceIdentitySuffix}`,
      repairAction: {
        kind: "revise-native-source",
        targetKind: "traversal-check",
        targetId: fact.targetId,
        operation: "adjust-traversal",
        instruction: `${fact.repairInstruction}${sourceIdentitySuffix}`,
      },
    });
  }));
}
