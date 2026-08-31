import { isNil } from "lodash-es";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  parseProjectHealthObservationV1,
  projectHealthFindingFingerprintV1,
  type ProjectHealthFindingV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
} from "../contracts";

export const VISUAL_EVIDENCE_SENSOR_IMPLEMENTATION_HASH_V1 = sha256CanonicalJson({
  sensorId: "visual-evidence",
  implementationId: "frozen-golden-ratio-v1",
});

export interface VisualEvidenceRecordV1 {
  readonly expectedCommitSha: string;
  readonly evidenceCommitSha: string | null;
  readonly rendererProfileId: string | null;
  readonly goldenSelected: boolean;
  readonly diffRatio: number | null;
  readonly identityHash: string | null;
}

export function observeVisualEvidenceV1(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly evidence: VisualEvidenceRecordV1 | null;
}): ProjectHealthObservationV1 {
  const inputFingerprint = sha256CanonicalJson({ evidence: input.evidence });
  const incomplete = (reasonCode: string): ProjectHealthObservationV1 =>
    parseProjectHealthObservationV1({
      kind: "project-health-observation",
      schemaVersion: 1,
      sensorId: "visual-evidence",
      sensorImplementationHash: VISUAL_EVIDENCE_SENSOR_IMPLEMENTATION_HASH_V1,
      inputFingerprint,
      status: "incomplete",
      metricsById: {
        "visual-golden-diff-ratio": {
          id: "visual-golden-diff-ratio",
          kind: "ratio",
          status: "not-evaluated",
          reasonCode,
        },
      },
      findings: [],
      evidenceRefs: isNil(input.evidence) || isNil(input.evidence.identityHash) ? [] : [input.evidence.identityHash],
    }, input.profile);

  if (isNil(input.evidence) || isNil(input.evidence.evidenceCommitSha)) {
    return incomplete("OWNER_COMMAND_NOT_RUN");
  }
  if (input.evidence.evidenceCommitSha !== input.evidence.expectedCommitSha) {
    return incomplete("OWNER_COMMAND_STALE_TREE");
  }
  if (input.evidence.goldenSelected !== true) {
    return parseProjectHealthObservationV1({
      kind: "project-health-observation",
      schemaVersion: 1,
      sensorId: "visual-evidence",
      sensorImplementationHash: VISUAL_EVIDENCE_SENSOR_IMPLEMENTATION_HASH_V1,
      inputFingerprint,
      status: "not-applicable",
      metricsById: {
        "visual-golden-diff-ratio": {
          id: "visual-golden-diff-ratio",
          kind: "ratio",
          status: "not-applicable",
          reasonCode: "VISUAL_GOLDEN_NOT_SELECTED",
        },
      },
      findings: [],
      evidenceRefs: isNil(input.evidence.identityHash) ? [] : [input.evidence.identityHash],
    }, input.profile);
  }
  if (isNil(input.evidence.rendererProfileId) || isNil(input.evidence.diffRatio) || isNil(input.evidence.identityHash)) {
    return incomplete("OWNER_COMMAND_NOT_RUN");
  }

  const drifted = input.evidence.diffRatio > 0.02;
  const findings: ProjectHealthFindingV1[] = [];
  if (drifted) {
    findings.push({
      kind: "project-health-finding",
      schemaVersion: 1,
      fingerprint: projectHealthFindingFingerprintV1({
        sensorId: "visual-evidence",
        code: "PROJECT_HEALTH_VISUAL_GOLDEN_DRIFT",
        subjectRefs: ["path:scripts/visual/entry-third-person.ts"],
        evidenceClassIds: ["visual-golden"],
      }),
      sensorId: "visual-evidence",
      policy: "advisory-p2",
      dimension: "D5",
      code: "PROJECT_HEALTH_VISUAL_GOLDEN_DRIFT",
      ownerId: "visual-evidence",
      subjectRefs: ["path:scripts/visual/entry-third-person.ts"],
      evidenceClassIds: ["visual-golden"],
      metricIds: ["visual-golden-diff-ratio"],
      evidenceRefs: [input.evidence.identityHash],
      expected: "Frozen Golden pixel ratio must stay at or below the Profile threshold.",
      impact: "A drifted Golden can hide a camera, lighting, or geometry change behind a later style pass.",
      suggestedGateId: null,
    });
  }

  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: "visual-evidence",
    sensorImplementationHash: VISUAL_EVIDENCE_SENSOR_IMPLEMENTATION_HASH_V1,
    inputFingerprint,
    status: drifted ? "failed" : "passed",
    metricsById: {
      "visual-golden-diff-ratio": {
        id: "visual-golden-diff-ratio",
        kind: "ratio",
        valueRatio: input.evidence.diffRatio,
      },
    },
    findings,
    evidenceRefs: [input.evidence.identityHash],
  }, input.profile);
}
