import { isEmpty, isNil, uniq } from "lodash-es";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  parseProjectHealthObservationV1,
  projectHealthFindingFingerprintV1,
  type ProjectHealthFindingV1,
  type ProjectHealthModeV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
} from "../contracts";
import {
  ownerLeakCountV1,
  parseRuntimeProbeRegistryV1,
  type RuntimeProbeEvidenceV1,
} from "../runtime-probe-registry";

function finding(input: {
  readonly code: "PROJECT_HEALTH_RUNTIME_OWNER_LEAK" | "PROJECT_HEALTH_RUNTIME_NONDETERMINISTIC";
  readonly evidenceClassIds: readonly ["runtime-owner-count"] | readonly ["runtime-determinism"];
  readonly subjectRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly expected: string;
  readonly impact: string;
  readonly suggestedGateId: string;
}): ProjectHealthFindingV1 {
  return {
    kind: "project-health-finding",
    schemaVersion: 1,
    fingerprint: projectHealthFindingFingerprintV1({
      sensorId: "runtime-health",
      code: input.code,
      subjectRefs: input.subjectRefs,
      evidenceClassIds: input.evidenceClassIds,
    }),
    sensorId: "runtime-health",
    policy: "blocking-p1",
    dimension: "D4",
    code: input.code,
    ownerId: "runtime-health",
    subjectRefs: input.subjectRefs,
    evidenceClassIds: input.evidenceClassIds,
    metricIds: input.code === "PROJECT_HEALTH_RUNTIME_OWNER_LEAK"
      ? ["runtime-owner-leak-count"]
      : ["runtime-determinism-mismatch-count"],
    evidenceRefs: input.evidenceRefs,
    expected: input.expected,
    impact: input.impact,
    suggestedGateId: input.suggestedGateId,
  };
}

function hashesMismatch(hashes: readonly string[]): boolean {
  return !isEmpty(hashes) && uniq(hashes).length > 1;
}

export function observeRuntimeHealthV1(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly sensorImplementationHash: string;
  readonly mode: ProjectHealthModeV1;
  readonly evidences: readonly RuntimeProbeEvidenceV1[] | null;
}): ProjectHealthObservationV1 {
  const registry = parseRuntimeProbeRegistryV1();
  const requiredProbeIds = registry
    .filter((entry) => entry.requiredness === "required")
    .map((entry) => entry.id);
  const evidences = input.evidences ?? [];
  const evidenceByProbeId = new Map(evidences.map((entry) => [entry.probeId, entry]));
  const evidenceRefs = evidences.map((entry) => sha256CanonicalJson(entry));
  const inputFingerprint = sha256CanonicalJson({
    mode: input.mode,
    evidences,
  });
  const missingRequired = requiredProbeIds.some((probeId) => isNil(evidenceByProbeId.get(probeId)));
  if (isNil(input.evidences) || isEmpty(evidences) || missingRequired) {
    return parseProjectHealthObservationV1({
      kind: "project-health-observation",
      schemaVersion: 1,
      sensorId: "runtime-health",
      sensorImplementationHash: input.sensorImplementationHash,
      inputFingerprint,
      status: "incomplete",
      metricsById: {
        "runtime-owner-leak-count": {
          id: "runtime-owner-leak-count",
          kind: "count",
          status: "not-evaluated",
          reasonCode: "OWNER_COMMAND_NOT_RUN",
        },
        "runtime-determinism-mismatch-count": {
          id: "runtime-determinism-mismatch-count",
          kind: "count",
          status: "not-evaluated",
          reasonCode: "OWNER_COMMAND_NOT_RUN",
        },
      },
      findings: [],
      evidenceRefs,
    }, input.profile);
  }

  const findings: ProjectHealthFindingV1[] = [];
  let leakCount = 0;
  let mismatchCount = 0;
  for (const evidence of evidences) {
    const registration = registry.find((entry) => entry.id === evidence.probeId);
    if (isNil(registration) || evidence.requiredness === "advisory") continue;
    const probeRef = sha256CanonicalJson(evidence);
    const leaked = evidence.cycles.reduce(
      (total, cycle) => total + ownerLeakCountV1(cycle.beforeOwners, cycle.afterOwners),
      0,
    );
    if (leaked > 0) {
      leakCount += leaked;
      findings.push(finding({
        code: "PROJECT_HEALTH_RUNTIME_OWNER_LEAK",
        evidenceClassIds: ["runtime-owner-count"],
        subjectRefs: [`gate:${evidence.gateId}`],
        evidenceRefs: [probeRef],
        expected: "Owner-provided before/after counts must return to the cycle baseline after dispose.",
        impact: "A leaked Observable, Timer, or other owner can retain Runtime state across cycles.",
        suggestedGateId: evidence.gateId,
      }));
    }
    if (
      (evidence.kind === "cadence" && hashesMismatch(evidence.snapshotHashes)) ||
      (evidence.kind === "candidate-determinism" && hashesMismatch(evidence.candidateHashes))
    ) {
      mismatchCount += 1;
      findings.push(finding({
        code: "PROJECT_HEALTH_RUNTIME_NONDETERMINISTIC",
        evidenceClassIds: ["runtime-determinism"],
        subjectRefs: [`gate:${evidence.gateId}`],
        evidenceRefs: [probeRef],
        expected: "Required cadence or candidate snapshots must be byte-identical for the same input.",
        impact: "A mismatched snapshot means the same fixture is no longer deterministic.",
        suggestedGateId: evidence.gateId,
      }));
    }
  }

  const status = leakCount > 0 || mismatchCount > 0 || findings.length > 0 ? "failed" : "passed";
  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: "runtime-health",
    sensorImplementationHash: input.sensorImplementationHash,
    inputFingerprint,
    status,
    metricsById: {
      "runtime-owner-leak-count": {
        id: "runtime-owner-leak-count",
        kind: "count",
        valueCount: leakCount,
      },
      "runtime-determinism-mismatch-count": {
        id: "runtime-determinism-mismatch-count",
        kind: "count",
        valueCount: mismatchCount,
      },
    },
    findings,
    evidenceRefs,
  }, input.profile);
}
