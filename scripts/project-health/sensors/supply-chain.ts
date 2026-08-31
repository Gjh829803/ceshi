import { isEmpty, isNil } from "lodash-es";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  parseProjectHealthDependencyInventoryV1,
  parseProjectHealthObservationV1,
  projectHealthFindingFingerprintV1,
  type ProjectHealthDependencyInventoryV1,
  type ProjectHealthFindingV1,
  type ProjectHealthModeV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
  type ProjectHealthSupplyChainPolicyV1,
} from "../contracts";

export interface SupplyChainAdvisoryV1 {
  readonly packageName: string;
  readonly version: string;
  readonly advisoryId: string;
}

export interface SupplyChainAdvisorySnapshotV1 {
  readonly providerId: string;
  readonly snapshotDate: string;
  readonly snapshotHash: string;
  readonly advisories: readonly SupplyChainAdvisoryV1[];
}

export interface SupplyChainLockReceiptV1 {
  readonly commitSha: string;
  readonly evidenceRef: string;
  readonly passed: boolean;
}

function utcDayCount(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);
  return Math.floor((to - from) / 86_400_000);
}

function finding(input: {
  readonly code:
    | "PROJECT_HEALTH_DEPENDENCY_PROVENANCE_MISSING"
    | "PROJECT_HEALTH_LICENSE_FORBIDDEN"
    | "PROJECT_HEALTH_VULNERABILITY_ADVISORY"
    | "PROJECT_HEALTH_SUPPLY_CHAIN_PROVIDER_UNAVAILABLE";
  readonly policy: "blocking-p1" | "advisory-p2" | "advisory-p3";
  readonly subjectRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly expected: string;
  readonly impact: string;
}): ProjectHealthFindingV1 {
  const evidenceClassIds = input.code === "PROJECT_HEALTH_LICENSE_FORBIDDEN"
    ? ["license-policy"] as const
    : input.code === "PROJECT_HEALTH_DEPENDENCY_PROVENANCE_MISSING"
      ? ["dependency-provenance"] as const
      : input.code === "PROJECT_HEALTH_VULNERABILITY_ADVISORY"
        ? ["vulnerability-advisory"] as const
        : ["dependency-lock-parity"] as const;
  return {
    kind: "project-health-finding",
    schemaVersion: 1,
    fingerprint: projectHealthFindingFingerprintV1({
      sensorId: "supply-chain",
      code: input.code,
      subjectRefs: input.subjectRefs,
      evidenceClassIds,
    }),
    sensorId: "supply-chain",
    policy: input.policy,
    dimension: "D5",
    code: input.code,
    ownerId: "supply-chain",
    subjectRefs: input.subjectRefs,
    evidenceClassIds,
    metricIds: ["dependency-inventory-complete"],
    evidenceRefs: input.evidenceRefs,
    expected: input.expected,
    impact: input.impact,
    suggestedGateId: "dependency-inventory",
  };
}

export function observeSupplyChainV1(input: {
  readonly profile: ProjectHealthProfileV1;
  readonly sensorImplementationHash: string;
  readonly mode: ProjectHealthModeV1;
  readonly evaluatedOn: string;
  readonly expectedCommitSha: string;
  readonly policy: ProjectHealthSupplyChainPolicyV1;
  readonly inventory: ProjectHealthDependencyInventoryV1 | null;
  readonly lockReceipt: SupplyChainLockReceiptV1 | null;
  readonly advisorySnapshot: SupplyChainAdvisorySnapshotV1 | null;
}): ProjectHealthObservationV1 {
  const inputFingerprint = sha256CanonicalJson({
    mode: input.mode,
    evaluatedOn: input.evaluatedOn,
    expectedCommitSha: input.expectedCommitSha,
    inventory: input.inventory,
    lockReceipt: input.lockReceipt,
    advisorySnapshot: input.advisorySnapshot,
  });
  const findings: ProjectHealthFindingV1[] = [];
  const evidenceRefs: string[] = [];
  let metric: ProjectHealthObservationV1["metricsById"][string] = {
    id: "dependency-inventory-complete",
    kind: "boolean",
    value: true,
  };

  let inventory: ProjectHealthDependencyInventoryV1 | null = null;
  if (isNil(input.inventory)) {
    metric = {
      id: "dependency-inventory-complete",
      kind: "boolean",
      status: "not-evaluated",
      reasonCode: "OWNER_COMMAND_NOT_RUN",
    };
  } else {
    try {
      inventory = parseProjectHealthDependencyInventoryV1(input.inventory);
    } catch {
      inventory = null;
      metric = {
        id: "dependency-inventory-complete",
        kind: "boolean",
        status: "not-evaluated",
        reasonCode: "OWNER_COMMAND_NOT_RUN",
      };
    }
    if (!isNil(inventory)) {
      evidenceRefs.push(inventory.inputFingerprint);
      if (inventory.commitSha !== input.expectedCommitSha) {
        metric = {
          id: "dependency-inventory-complete",
          kind: "boolean",
          status: "not-evaluated",
          reasonCode: "OWNER_COMMAND_STALE_TREE",
        };
      } else {
        for (const entry of inventory.entries) {
          if (!input.policy.acceptedLicenseSpdxExpressions.includes(entry.licenseSpdxExpression)) {
            metric = { id: "dependency-inventory-complete", kind: "boolean", value: false };
            findings.push(finding({
              code: "PROJECT_HEALTH_LICENSE_FORBIDDEN",
              policy: "blocking-p1",
              subjectRefs: [`package:${entry.packageName}`],
              evidenceRefs: [inventory.inputFingerprint],
              expected: "Every inventory license must be in the frozen Supply Chain Policy.",
              impact: "A forbidden license can ship code the repository has not accepted.",
            }));
          }
        }
      }
    }
  }

  if (isNil(input.lockReceipt) || input.lockReceipt.commitSha !== input.expectedCommitSha || input.lockReceipt.passed !== true) {
    if (!isNil(input.lockReceipt)) evidenceRefs.push(input.lockReceipt.evidenceRef);
    findings.push(finding({
      code: "PROJECT_HEALTH_DEPENDENCY_PROVENANCE_MISSING",
      policy: "blocking-p1",
      subjectRefs: ["gate:dependency-inventory"],
      evidenceRefs: isNil(input.lockReceipt) ? evidenceRefs : [input.lockReceipt.evidenceRef],
      expected: "Supply Chain must cite the contract-parity lock or patch Receipt for provenance.",
      impact: "Without lock or patch identity, inventory rows cannot prove their installed source.",
    }));
    if (!("status" in metric) && metric.value === true) {
      metric = { id: "dependency-inventory-complete", kind: "boolean", value: false };
    }
  }

  const snapshot = input.advisorySnapshot;
  const providerMissing = isNil(snapshot) ||
    !input.policy.advisoryProviderIds.includes(snapshot.providerId) ||
    utcDayCount(snapshot.snapshotDate, input.evaluatedOn) > input.policy.maximumAdvisorySnapshotAgeDays;
  if (providerMissing) {
    findings.push(finding({
      code: "PROJECT_HEALTH_SUPPLY_CHAIN_PROVIDER_UNAVAILABLE",
      policy: "advisory-p3",
      subjectRefs: ["gate:dependency-inventory"],
      evidenceRefs: isEmpty(evidenceRefs) ? [] : evidenceRefs,
      expected: "Online advisory evidence binds a frozen provider snapshot to exact package versions.",
      impact: "An unavailable or stale advisory provider cannot be treated as a clean vulnerability bill.",
    }));
    if (input.mode !== "release" && !("status" in metric)) {
      metric = {
        id: "dependency-inventory-complete",
        kind: "boolean",
        status: "not-evaluated",
        reasonCode: "SUPPLY_CHAIN_ONLINE_PROVIDER_UNAVAILABLE",
      };
    }
    if (input.mode === "release" && "status" in metric === false && metric.value === true) {
      metric = {
        id: "dependency-inventory-complete",
        kind: "boolean",
        status: "not-applicable",
        reasonCode: "SUPPLY_CHAIN_ONLINE_PROVIDER_UNAVAILABLE",
      };
    }
  } else if (!isNil(snapshot) && !isNil(inventory) && !("status" in metric)) {
    evidenceRefs.push(snapshot.snapshotHash);
    const inventoryIds = new Set(inventory.entries.map((entry) => entry.id));
    for (const advisory of snapshot.advisories) {
      const id = `${advisory.packageName}@${advisory.version}`;
      if (!inventoryIds.has(id)) continue;
      findings.push(finding({
        code: "PROJECT_HEALTH_VULNERABILITY_ADVISORY",
        policy: "advisory-p2",
        subjectRefs: [`package:${advisory.packageName}`],
        evidenceRefs: [snapshot.snapshotHash],
        expected: "Version-bound advisories remain visible and never silently clear the inventory.",
        impact: "A known advisory can remain open without changing lock or license identity.",
      }));
    }
  }

  const incomplete = "status" in metric && metric.status === "not-evaluated";
  const blocking = findings.some((entry) => entry.policy === "blocking-p0" || entry.policy === "blocking-p1");
  const notApplicable = "status" in metric && metric.status === "not-applicable";
  const status = incomplete
    ? "incomplete"
    : blocking || ("value" in metric && metric.value === false)
      ? "failed"
      : notApplicable
        ? "not-applicable"
        : "passed";
  return parseProjectHealthObservationV1({
    kind: "project-health-observation",
    schemaVersion: 1,
    sensorId: "supply-chain",
    sensorImplementationHash: input.sensorImplementationHash,
    inputFingerprint,
    status,
    metricsById: { "dependency-inventory-complete": metric },
    findings,
    evidenceRefs,
  }, input.profile);
}
