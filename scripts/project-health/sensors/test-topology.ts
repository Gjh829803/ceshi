import { isEmpty, isNil, uniq } from "lodash-es";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type { TestGateCensusReportV1 } from "../../lib/test-gate-census";
import { TEST_GATE_MANIFEST_V1 } from "../../lib/test-gate-manifest";
import type { ChangeImpactResultV1 } from "../change-impact";
import {
  parseProjectHealthObservationV1,
  projectHealthFindingFingerprintV1,
  type ProjectHealthFindingV1,
  type ProjectHealthGateReceiptV1,
  type ProjectHealthModeV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
} from "../contracts";

export const TEST_TOPOLOGY_SENSOR_IMPLEMENTATION_HASH_V1 = sha256CanonicalJson({
  sensorId: "test-topology",
  implementationId: "test-topology-change-impact-v1",
});

function finding(input: {
  readonly code: "PROJECT_HEALTH_TEST_UNREGISTERED" | "PROJECT_HEALTH_GATE_RECEIPT_STALE" | "PROJECT_HEALTH_CAPABILITY_UNREGISTERED";
  readonly ownerId: string;
  readonly subjectRefs: readonly string[];
  readonly evidenceClassIds: readonly ["test-census"] | readonly ["gate-receipt"];
  readonly evidenceRefs: readonly string[];
  readonly expected: string;
  readonly impact: string;
  readonly suggestedGateId: string | null;
}): ProjectHealthFindingV1 {
  return {
    kind: "project-health-finding",
    schemaVersion: 1,
    fingerprint: projectHealthFindingFingerprintV1({
      sensorId: "test-topology",
      code: input.code,
      subjectRefs: input.subjectRefs,
      evidenceClassIds: input.evidenceClassIds,
    }),
    sensorId: "test-topology",
    policy: "blocking-p1",
    dimension: "D3",
    code: input.code,
    ownerId: input.ownerId,
    subjectRefs: input.subjectRefs,
    evidenceClassIds: input.evidenceClassIds,
    metricIds: ["test-census-current"],
    evidenceRefs: input.evidenceRefs,
    expected: input.expected,
    impact: input.impact,
    suggestedGateId: input.suggestedGateId,
  };
}

function isTestPath(filePath: string): boolean {
  return filePath.endsWith(".browser.test.ts") || filePath.endsWith(".test.ts");
}

export function observeTestTopologyV1(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly mode: ProjectHealthModeV1;
  readonly impact: ChangeImpactResultV1;
  readonly census: Pick<TestGateCensusReportV1, "rootTestFiles">;
  readonly receipts: readonly ProjectHealthGateReceiptV1[];
  readonly expectedCommitSha: string;
  readonly requestedHeadSha: string;
  readonly checkoutSha: string;
  readonly isMergeCommit: boolean;
}): ProjectHealthObservationV1 {
  const evidenceRefs = [
    ...Object.values(input.impact.plan.inputFingerprintsByGateId),
    ...input.receipts.map((receipt) => receipt.evidenceRef),
  ];
  const inputFingerprint = sha256CanonicalJson({
    mode: input.mode,
    plan: input.impact.plan,
    unregisteredPaths: input.impact.unregisteredPaths,
    censusRootTestFiles: input.census.rootTestFiles,
    receipts: input.receipts,
    expectedCommitSha: input.expectedCommitSha,
    requestedHeadSha: input.requestedHeadSha,
    checkoutSha: input.checkoutSha,
    isMergeCommit: input.isMergeCommit,
  });
  const findings: ProjectHealthFindingV1[] = [];
  const registeredTests = new Set(TEST_GATE_MANIFEST_V1.map((entry) => entry.path));
  let censusCurrent = true;

  for (const filePath of input.impact.unregisteredPaths) {
    findings.push(finding({
      code: "PROJECT_HEALTH_CAPABILITY_UNREGISTERED",
      ownerId: "change-impact",
      subjectRefs: [`path:${filePath}`],
      evidenceClassIds: ["gate-receipt"],
      evidenceRefs: isEmpty(evidenceRefs) ? [] : evidenceRefs,
      expected: "Every changed path must match a frozen Profile capability selector.",
      impact: "An unclassified path can hide Browser, Runtime, visual, or documentation work from the Gate Plan.",
      suggestedGateId: null,
    }));
  }

  const changedTestPaths = Object.keys(input.impact.matchedCapabilityIdsByPath).filter(isTestPath);
  for (const filePath of uniq([...changedTestPaths, ...input.census.rootTestFiles])) {
    if (registeredTests.has(filePath)) continue;
    censusCurrent = false;
    findings.push(finding({
      code: "PROJECT_HEALTH_TEST_UNREGISTERED",
      ownerId: "test-census",
      subjectRefs: [`path:${filePath}`],
      evidenceClassIds: ["test-census"],
      evidenceRefs: isEmpty(evidenceRefs) ? [] : evidenceRefs,
      expected: "Every discovered test file must be listed in TEST_GATE_MANIFEST_V1.",
      impact: "An unregistered test can skip its lane and hide a missing RED regression.",
      suggestedGateId: "test-census",
    }));
  }

  if (
    input.checkoutSha !== input.requestedHeadSha ||
    input.checkoutSha !== input.expectedCommitSha ||
    input.isMergeCommit === true
  ) {
    findings.push(finding({
      code: "PROJECT_HEALTH_GATE_RECEIPT_STALE",
      ownerId: "test-topology",
      subjectRefs: ["gate:test-census"],
      evidenceClassIds: ["gate-receipt"],
      evidenceRefs: isEmpty(evidenceRefs) ? [] : evidenceRefs,
      expected: "PR checkout and Receipts must bind pull_request.head.sha, not a merge SHA.",
      impact: "A merge checkout can record evidence that no longer matches the reviewed head tree.",
      suggestedGateId: "test-census",
    }));
  }

  const receiptsByGateId = new Map(input.receipts.map((receipt) => [receipt.gateId, receipt]));
  for (const gateId of input.impact.plan.requiredGateIds) {
    const receipt = receiptsByGateId.get(gateId);
    const expectedFingerprint = input.impact.plan.inputFingerprintsByGateId[gateId];
    if (
      isNil(receipt) ||
      receipt.commitSha !== input.expectedCommitSha ||
      receipt.inputFingerprint !== expectedFingerprint ||
      receipt.status !== "passed"
    ) {
      findings.push(finding({
        code: "PROJECT_HEALTH_GATE_RECEIPT_STALE",
        ownerId: "test-topology",
        subjectRefs: [`gate:${gateId}`],
        evidenceClassIds: ["gate-receipt"],
        evidenceRefs: isNil(receipt) ? evidenceRefs : [receipt.evidenceRef],
        expected: "Required Gate Receipts must bind the planned commit and input fingerprint.",
        impact: "A stale or missing Receipt can let a later edit keep an older green result.",
        suggestedGateId: gateId,
      }));
    }
  }

  const checkoutMismatched =
    input.checkoutSha !== input.requestedHeadSha ||
    input.checkoutSha !== input.expectedCommitSha ||
    input.isMergeCommit === true;
  const metric = checkoutMismatched
    ? {
        id: "test-census-current",
        kind: "boolean" as const,
        status: "not-evaluated" as const,
        reasonCode: "GATE_RECEIPT_STALE",
      }
    : {
        id: "test-census-current",
        kind: "boolean" as const,
        value: censusCurrent,
      };
  const incomplete = "status" in metric;
  const blocking = findings.some((entry) => entry.policy === "blocking-p0" || entry.policy === "blocking-p1");
  const status = incomplete
    ? "incomplete"
    : blocking || censusCurrent === false
      ? "failed"
      : "passed";
  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: "test-topology",
    sensorImplementationHash: TEST_TOPOLOGY_SENSOR_IMPLEMENTATION_HASH_V1,
    inputFingerprint,
    status,
    metricsById: { "test-census-current": metric },
    findings,
    evidenceRefs,
  }, input.profile);
}
