import { isEmpty } from "lodash-es";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  workspaceBoundaryDebtFingerprintV1,
  type WorkspaceBoundaryEvidenceV1,
} from "../../lib/workspace-boundary-contract";
import {
  parseProjectHealthObservationV1,
  projectHealthFindingFingerprintV1,
  type ProjectHealthFindingV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
} from "../contracts";
import { workspaceBoundaryEvidenceRefV1 } from "../workspace-boundary-adapter";

export const WORKSPACE_BOUNDARY_SENSOR_IMPLEMENTATION_HASH_V1 = sha256CanonicalJson({
  sensorId: "workspace-boundary",
  implementationId: "workspace-boundary-evidence-v1",
});

export function observeWorkspaceBoundaryV1(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly evidence: WorkspaceBoundaryEvidenceV1;
}): ProjectHealthObservationV1 {
  const evidenceRef = workspaceBoundaryEvidenceRefV1(input.evidence);
  const reconciled = new Set(input.evidence.reconciledDebtFingerprints);
  const findings: ProjectHealthFindingV1[] = [];
  for (const violation of input.evidence.violations) {
    const fingerprint = workspaceBoundaryDebtFingerprintV1(violation);
    if (reconciled.has(fingerprint)) continue;
    const subjectRefs = [`path:${violation.importer}`, `package:${violation.owner}`];
    const evidenceClassIds = ["workspace-edge"] as const;
    findings.push({
      kind: "project-health-finding",
      schemaVersion: 1,
      fingerprint: projectHealthFindingFingerprintV1({
        sensorId: "workspace-boundary",
        code: "PROJECT_HEALTH_WORKSPACE_BOUNDARY_VIOLATION",
        subjectRefs,
        evidenceClassIds,
      }),
      sensorId: "workspace-boundary",
      policy: "blocking-p1",
      dimension: "D1",
      code: "PROJECT_HEALTH_WORKSPACE_BOUNDARY_VIOLATION",
      ownerId: "workspace-boundary",
      subjectRefs,
      evidenceClassIds,
      metricIds: ["workspace-boundary-debt-count"],
      evidenceRefs: [evidenceRef],
      expected: "Every workspace boundary violation is either absent or listed in the exact debt ledger.",
      impact: "An unregistered workspace edge can hide a second owner or an undeclared package dependency.",
      suggestedGateId: "workspace-boundaries",
    });
  }
  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: "workspace-boundary",
    sensorImplementationHash: WORKSPACE_BOUNDARY_SENSOR_IMPLEMENTATION_HASH_V1,
    inputFingerprint: evidenceRef,
    status: isEmpty(findings) && input.evidence.reconciledDebtFingerprints.length <= 49 ? "passed" : "failed",
    metricsById: {
      "workspace-boundary-debt-count": {
        id: "workspace-boundary-debt-count",
        kind: "count",
        valueCount: input.evidence.reconciledDebtFingerprints.length,
      },
    },
    findings,
    evidenceRefs: [evidenceRef],
  }, input.profile);
}
