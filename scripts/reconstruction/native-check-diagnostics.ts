import type { NativeSceneCheckResultV1 } from
  "@whitebox-world/runtime-contracts";
import {
  parseWorldReconstructionDiagnosticV1,
  type WorldReconstructionCaseV1,
  type WorldReconstructionDiagnosticV1,
} from "@whitebox-world/validation";

const ROUTE_DISCONNECTED_CODE = "WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED";

/**
 * Projects only source-repairable Native Check facts into the source-neutral
 * Reconstruction diagnostic contract. Tooling, identity, and determinism
 * failures remain fail-closed and never become Builder repair instructions.
 */
export function createNativeCheckRepairDiagnosticsV1(input: Readonly<{
  reconstructionCase: WorldReconstructionCaseV1;
  checkResult: NativeSceneCheckResultV1;
  evidenceRef: string;
}>): readonly WorldReconstructionDiagnosticV1[] {
  const hasDisconnectedRoute = input.checkResult.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === ROUTE_DISCONNECTED_CODE ||
      diagnostic.message.includes(ROUTE_DISCONNECTED_CODE),
  );
  if (!hasDisconnectedRoute) return Object.freeze([]);

  const acceptanceTargetRef =
    input.reconstructionCase.expected.groundConnectivity
      .requiredTraversalBands[0]?.acceptanceTargetRef ??
    input.reconstructionCase.expected.criticalTraversalChecks.find(
      ({ expectation }) => expectation === "pass",
    )?.acceptanceTargetRef;
  if (acceptanceTargetRef === undefined) return Object.freeze([]);

  return Object.freeze([parseWorldReconstructionDiagnosticV1({
    kind: "world-reconstruction-diagnostic",
    schemaVersion: 1,
    id: "native-check-route-disconnected",
    code: "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
    dimensionId: "critical-traversal",
    acceptanceTargetRef,
    targetRef: acceptanceTargetRef,
    targetId: "native-block-route",
    metricId: "ground-component-reachability",
    details: {
      kind: "state-mismatch",
      expectedValue: "one-edge-connected-route-component",
      actualValue: "multiple-disconnected-route-components",
      correctionDirection: "replace",
    },
    evidenceRefs: [input.evidenceRef],
    message:
      "Native Check found multiple disconnected structural route components before Package allocation.",
    repairAction: {
      kind: "revise-native-source",
      targetKind: "traversal-check",
      targetId: "native-block-route",
      operation: "adjust-traversal",
      instruction:
        "Connect every paletteRole route Block into one face/edge-adjacent structural route component, keep adjacent route top heights within 0.25 meters, and preserve all frozen Case composition, Collider, Spawn, and traversal expectations. Do not relabel route Blocks or add hidden geometry to bypass the check.",
    },
  })]);
}
