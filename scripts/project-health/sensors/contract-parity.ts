import { isEmpty, isNil } from "lodash-es";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  parseProjectHealthObservationV1,
  projectHealthFindingFingerprintV1,
  type ProjectHealthFindingV1,
  type ProjectHealthModeV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
} from "../contracts";

export type ContractParityOwnerKindV1 = "generated-bytes" | "dependency-lock" | "read-only-verifier";

export interface ContractParityOwnerEvidenceV1 {
  readonly gateId: string;
  readonly ownerKind: ContractParityOwnerKindV1;
  readonly commitSha: string;
  readonly evidenceRef: string;
  readonly executionStatus:
    | "passed"
    | "failed"
    | "timed-out"
    | "repository-state-mutated"
    | "cleanup-failed"
    | "infrastructure-failed";
}

function finding(input: {
  readonly code: "PROJECT_HEALTH_OWNER_COMMAND_DIRTY_TREE" | "PROJECT_HEALTH_OWNER_COMMAND_TIMEOUT" | "PROJECT_HEALTH_GENERATED_DRIFT" | "PROJECT_HEALTH_DEPENDENCY_LOCK_DRIFT";
  readonly subjectRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly expected: string;
  readonly impact: string;
  readonly suggestedGateId: string | null;
}): ProjectHealthFindingV1 {
  const evidenceClassIds = ["generated-byte-parity"] as const;
  return {
    kind: "project-health-finding",
    schemaVersion: 1,
    fingerprint: projectHealthFindingFingerprintV1({
      sensorId: "contract-parity",
      code: input.code,
      subjectRefs: input.subjectRefs,
      evidenceClassIds,
    }),
    sensorId: "contract-parity",
    policy: "blocking-p1",
    dimension: "D2",
    code: input.code,
    ownerId: "contract-parity",
    subjectRefs: input.subjectRefs,
    evidenceClassIds,
    metricIds: ["generated-bytes-current"],
    evidenceRefs: input.evidenceRefs,
    expected: input.expected,
    impact: input.impact,
    suggestedGateId: input.suggestedGateId,
  };
}

export function observeContractParityV1(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly sensorImplementationHash: string;
  readonly mode: ProjectHealthModeV1;
  readonly expectedCommitSha: string;
  readonly owners: readonly ContractParityOwnerEvidenceV1[] | null;
}): ProjectHealthObservationV1 {
  const evidenceRefs = (input.owners ?? []).map((owner) => owner.evidenceRef);
  const inputFingerprint = sha256CanonicalJson({
    mode: input.mode,
    expectedCommitSha: input.expectedCommitSha,
    owners: input.owners,
  });
  const findings: ProjectHealthFindingV1[] = [];
  let metric: ProjectHealthObservationV1["metricsById"][string] = {
    id: "generated-bytes-current",
    kind: "boolean",
    value: true,
  };
  let incomplete = isNil(input.owners) || isEmpty(input.owners);

  const requiredGateIds = input.profile.modesById[input.mode].requiredGateIdsBySensorId["contract-parity"] ?? [];
  const owners = input.owners ?? [];
  const ownersByGateId = new Map(owners.map((owner) => [owner.gateId, owner]));

  for (const owner of owners) {
    if (owner.commitSha !== input.expectedCommitSha) {
      incomplete = true;
      metric = {
        id: "generated-bytes-current",
        kind: "boolean",
        status: "not-evaluated",
        reasonCode: "OWNER_COMMAND_STALE_TREE",
      };
      continue;
    }
    if (owner.executionStatus === "repository-state-mutated") {
      incomplete = true;
      metric = {
        id: "generated-bytes-current",
        kind: "boolean",
        status: "not-evaluated",
        reasonCode: "OWNER_COMMAND_DIRTY_TREE",
      };
      findings.push(finding({
        code: "PROJECT_HEALTH_OWNER_COMMAND_DIRTY_TREE",
        subjectRefs: [`gate:${owner.gateId}`],
        evidenceRefs: [owner.evidenceRef],
        expected: "Owner commands must leave the tracked tree unchanged.",
        impact: "A mutating owner command can record evidence that no longer matches the checked commit.",
        suggestedGateId: owner.gateId,
      }));
      continue;
    }
    if (owner.executionStatus === "timed-out") {
      incomplete = true;
      metric = {
        id: "generated-bytes-current",
        kind: "boolean",
        status: "not-evaluated",
        reasonCode: "OWNER_COMMAND_TIMEOUT",
      };
      findings.push(finding({
        code: "PROJECT_HEALTH_OWNER_COMMAND_TIMEOUT",
        subjectRefs: [`gate:${owner.gateId}`],
        evidenceRefs: [owner.evidenceRef],
        expected: "Owner commands must finish inside the frozen execution envelope.",
        impact: "A timed-out owner command cannot prove contract or generated-byte parity.",
        suggestedGateId: owner.gateId,
      }));
      continue;
    }
    if (owner.executionStatus === "cleanup-failed" || owner.executionStatus === "infrastructure-failed") {
      incomplete = true;
      metric = {
        id: "generated-bytes-current",
        kind: "boolean",
        status: "not-evaluated",
        reasonCode: "OWNER_COMMAND_NOT_RUN",
      };
      continue;
    }
    if (owner.executionStatus !== "failed") continue;
    if (owner.ownerKind === "generated-bytes") {
      if (!("status" in metric)) {
        metric = { id: "generated-bytes-current", kind: "boolean", value: false };
      }
      findings.push(finding({
        code: "PROJECT_HEALTH_GENERATED_DRIFT",
        subjectRefs: [`gate:${owner.gateId}`],
        evidenceRefs: [owner.evidenceRef],
        expected: "Tracked generated bytes equal the canonical owner output.",
        impact: "A stale generated bundle can execute behavior different from source.",
        suggestedGateId: owner.gateId,
      }));
      continue;
    }
    if (owner.ownerKind === "dependency-lock") {
      findings.push(finding({
        code: "PROJECT_HEALTH_DEPENDENCY_LOCK_DRIFT",
        subjectRefs: [`gate:${owner.gateId}`],
        evidenceRefs: [owner.evidenceRef],
        expected: "Lock, patch, and installed bytes match the declared owner identity.",
        impact: "A drifted lock or patch can install a different dependency closure than source.",
        suggestedGateId: owner.gateId,
      }));
      continue;
    }
    if (!("status" in metric)) {
      metric = { id: "generated-bytes-current", kind: "boolean", value: false };
    }
  }

  if (requiredGateIds.some((gateId) => isNil(ownersByGateId.get(gateId)))) {
    incomplete = true;
    if (!("status" in metric)) {
      metric = {
        id: "generated-bytes-current",
        kind: "boolean",
        status: "not-evaluated",
        reasonCode: "OWNER_COMMAND_NOT_RUN",
      };
    }
  }

  if (incomplete && !("status" in metric)) {
    metric = {
      id: "generated-bytes-current",
      kind: "boolean",
      status: "not-evaluated",
      reasonCode: "OWNER_COMMAND_NOT_RUN",
    };
  }

  const blocking = findings.some((entry) => entry.policy === "blocking-p0" || entry.policy === "blocking-p1");
  const status = incomplete ? "incomplete" : blocking || ("value" in metric && metric.value === false) ? "failed" : "passed";
  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: "contract-parity",
    sensorImplementationHash: input.sensorImplementationHash,
    inputFingerprint,
    status,
    metricsById: { "generated-bytes-current": metric },
    findings,
    evidenceRefs,
  }, input.profile);
}
