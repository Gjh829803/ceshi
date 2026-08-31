import { readFile } from "node:fs/promises";
import path from "node:path";

import { isEmpty, isNil, sortBy, uniq } from "lodash-es";

import { evaluateTestGateCensusV1, type TestGateCensusReportV1 } from "../lib/test-gate-census";
import { TEST_GATE_MANIFEST_V1 } from "../lib/test-gate-manifest";
import {
  parseWorkspaceBoundaryEvidenceV1,
  type WorkspaceBoundaryEvidenceV1,
} from "../lib/workspace-boundary-contract";
import { planChangeImpactV1 } from "./change-impact";
import {
  parseProjectHealthAuthorityPolicyV1,
  parseProjectHealthSupplyChainPolicyV1,
  type ProjectHealthGateReceiptV1,
  type ProjectHealthModeV1,
  type ProjectHealthObservationV1,
  type ProjectHealthProfileV1,
  type ProjectHealthSensorIdV1,
} from "./contracts";
import { projectPnpmLicenseInventoryV1 } from "./dependency-inventory";
import type { ProjectHealthExecutionEvidenceV1 } from "./process-runner";
import {
  observeRegisteredProjectHealthSensorV1,
  projectHealthGateInputFingerprintsV1,
} from "./registry";
import type { ContractParityOwnerEvidenceV1 } from "./sensors/contract-parity";

export interface ProjectHealthValidatedGateV1 {
  readonly receipt: ProjectHealthGateReceiptV1;
  readonly evidence: ProjectHealthExecutionEvidenceV1;
}

const PROJECT_HEALTH_READY_SENSOR_ADAPTER_IDS_V1 = new Set<ProjectHealthSensorIdV1>([
  "workspace-boundary",
  "supplemental-authority",
  "contract-parity",
  "test-topology",
]);

export function projectHealthRequiredInputReadinessV1(input: Readonly<{
  profile: ProjectHealthProfileV1;
  mode: ProjectHealthModeV1;
}>): Readonly<{
  isReady: boolean;
  missingRequiredSensorIds: readonly ProjectHealthSensorIdV1[];
}> {
  const missingRequiredSensorIds = sortBy(input.profile.modesById[input.mode].requiredSensorIds.filter(
    (sensorId) => !PROJECT_HEALTH_READY_SENSOR_ADAPTER_IDS_V1.has(sensorId),
  ));
  return {
    isReady: isEmpty(missingRequiredSensorIds),
    missingRequiredSensorIds,
  };
}

function workspaceEvidenceFromGate(
  validatedGatesById: ReadonlyMap<string, ProjectHealthValidatedGateV1>,
): WorkspaceBoundaryEvidenceV1 | null {
  const gate = validatedGatesById.get("workspace-boundaries");
  if (
    isNil(gate)
    || gate.receipt.status === "incomplete"
    || (gate.evidence.status !== "passed" && gate.evidence.status !== "failed")
    || isEmpty(gate.evidence.stdout)
  ) return null;
  try {
    return parseWorkspaceBoundaryEvidenceV1(JSON.parse(gate.evidence.stdout));
  } catch {
    return null;
  }
}

function testCensusFromGate(
  validatedGatesById: ReadonlyMap<string, ProjectHealthValidatedGateV1>,
): TestGateCensusReportV1 | null {
  const gate = validatedGatesById.get("test-census");
  if (isNil(gate) || gate.receipt.status !== "passed" || gate.evidence.status !== "passed") return null;
  try {
    const raw = JSON.parse(gate.evidence.stdout) as Record<string, unknown>;
    if (
      !Array.isArray(raw.rootTestFiles)
      || !Array.isArray(raw.contractTestFiles)
      || !Array.isArray(raw.resourceHeavyTestFiles)
      || Object.keys(raw).length !== 3
    ) return null;
    return evaluateTestGateCensusV1({
      rootTestFiles: raw.rootTestFiles as string[],
      contractConfigTestFiles: raw.contractTestFiles as string[],
      resourceHeavyConfigTestFiles: raw.resourceHeavyTestFiles as string[],
      manifest: TEST_GATE_MANIFEST_V1,
    });
  } catch {
    return null;
  }
}

function contractParityOwnerKind(gateId: string): ContractParityOwnerEvidenceV1["ownerKind"] {
  if (gateId === "agent-self-check") return "generated-bytes";
  return "read-only-verifier";
}

function changedPathsFromGate(
  validatedGatesById: ReadonlyMap<string, ProjectHealthValidatedGateV1>,
): readonly string[] | null {
  const changeImpact = validatedGatesById.get("change-impact-diff");
  if (isNil(changeImpact) || changeImpact.receipt.status !== "passed" || changeImpact.evidence.status !== "passed") {
    return null;
  }
  return sortBy(uniq(changeImpact.evidence.stdout.split("\n").map((entry) => entry.trim()).filter((entry) =>
    !isEmpty(entry),
  )));
}

function fixedRequiredGateIds(
  profile: ProjectHealthProfileV1,
  mode: ProjectHealthModeV1,
): readonly string[] {
  return sortBy(uniq(Object.values(profile.modesById[mode].requiredGateIdsBySensorId).flatMap((ids) => ids ?? [])));
}

function supplyChainInventoryFromGate(input: Readonly<{
  repositoryRoot: string;
  commitSha: string;
  validatedGatesById: ReadonlyMap<string, ProjectHealthValidatedGateV1>;
}>) {
  const gate = input.validatedGatesById.get("dependency-inventory");
  if (isNil(gate) || gate.receipt.status !== "passed" || gate.evidence.status !== "passed") return null;
  try {
    return projectPnpmLicenseInventoryV1({
      installRoot: input.repositoryRoot,
      commitSha: input.commitSha,
      commandHash: gate.receipt.commandHash,
      inputFingerprint: gate.receipt.inputFingerprint,
      pnpmLicensesJson: JSON.parse(gate.evidence.stdout),
    });
  } catch {
    return null;
  }
}

export async function observeProjectHealthModeV1(input: Readonly<{
  repositoryRoot: string;
  profile: ProjectHealthProfileV1;
  mode: ProjectHealthModeV1;
  commitSha: string;
  baseSha: string | null;
  evaluatedOn: string;
  requestedHeadSha: string;
  checkoutSha: string;
  isMergeCommit: boolean;
  validatedGatesById: ReadonlyMap<string, ProjectHealthValidatedGateV1>;
}>): Promise<readonly ProjectHealthObservationV1[]> {
  const observations: ProjectHealthObservationV1[] = [];
  const selectedSensorIds = new Set([
    ...input.profile.modesById[input.mode].requiredSensorIds,
    ...input.profile.modesById[input.mode].advisorySensorIds,
  ]);
  const workspaceEvidence = workspaceEvidenceFromGate(input.validatedGatesById);
  const testCensus = testCensusFromGate(input.validatedGatesById);
  const workspaceGate = input.validatedGatesById.get("workspace-boundaries");
  if (selectedSensorIds.has("workspace-boundary")) {
    observations.push(observeRegisteredProjectHealthSensorV1({
      sensorId: "workspace-boundary",
      sensorInput: {
        profile: input.profile,
        evidence: workspaceEvidence,
        ownerGate: !isNil(workspaceGate)
            && (workspaceGate.evidence.status === "passed" || workspaceGate.evidence.status === "failed")
          ? {
              executionStatus: workspaceGate.evidence.status,
              evidenceRef: workspaceGate.receipt.evidenceRef,
            }
          : null,
      },
    }));
  }
  if (selectedSensorIds.has("supplemental-authority")) {
    let authorityPolicy = null;
    try {
      authorityPolicy = parseProjectHealthAuthorityPolicyV1(JSON.parse(await readFile(
        path.join(input.repositoryRoot, "config/project-health/authority-policy.json"),
        "utf8",
      )), input.profile);
    } catch {}
    observations.push(observeRegisteredProjectHealthSensorV1({
      sensorId: "supplemental-authority",
      sensorInput: { profile: input.profile, evidence: workspaceEvidence, authorityPolicy },
    }));
  }
  if (selectedSensorIds.has("contract-parity")) {
    const requiredGateIds = input.profile.modesById[input.mode].requiredGateIdsBySensorId["contract-parity"] ?? [];
    const owners = requiredGateIds.flatMap((gateId): ContractParityOwnerEvidenceV1[] => {
      const validated = input.validatedGatesById.get(gateId);
      if (isNil(validated)) return [];
      return [{
        gateId,
        ownerKind: contractParityOwnerKind(gateId),
        commitSha: validated.receipt.commitSha,
        evidenceRef: validated.receipt.evidenceRef,
        executionStatus: validated.evidence.status,
      }];
    });
    observations.push(observeRegisteredProjectHealthSensorV1({
      sensorId: "contract-parity",
      sensorInput: {
        profile: input.profile,
        mode: input.mode,
        expectedCommitSha: input.commitSha,
        owners: isEmpty(owners) ? null : owners,
      },
    }));
  }
  if (selectedSensorIds.has("test-topology")) {
    const changedPaths = input.mode === "pr" ? changedPathsFromGate(input.validatedGatesById) : [];
    let impact = null;
    if (!isNil(workspaceEvidence) && !isNil(changedPaths)) {
      const gateIds = Object.keys(input.profile.capabilityGateIdsById).flatMap((capabilityId) =>
        input.profile.capabilityGateIdsById[capabilityId] ?? [],
      );
      const inputFingerprintsByGateId = isEmpty(changedPaths)
        ? {}
        : await projectHealthGateInputFingerprintsV1({
            repositoryRoot: input.repositoryRoot,
            profile: input.profile,
            gateIds: sortBy(uniq(gateIds)),
          });
      impact = planChangeImpactV1({
        profile: input.profile,
        mode: input.mode,
        commitSha: input.commitSha,
        baseSha: input.baseSha,
        changedPaths,
        evidence: workspaceEvidence,
        inputFingerprintsByGateId,
      });
    }
    observations.push(observeRegisteredProjectHealthSensorV1({
      sensorId: "test-topology",
      sensorInput: {
        profile: input.profile,
        mode: input.mode,
        impact,
        census: testCensus,
        requiredGateIds: sortBy(uniq([
          ...fixedRequiredGateIds(input.profile, input.mode),
          ...(input.mode === "pr" ? ["change-impact-diff"] : []),
        ])),
        receipts: [...input.validatedGatesById.values()].map((entry) => entry.receipt),
        expectedCommitSha: input.commitSha,
        requestedHeadSha: input.requestedHeadSha,
        checkoutSha: input.checkoutSha,
        isMergeCommit: input.isMergeCommit,
      },
    }));
  }
  if (selectedSensorIds.has("supply-chain")) {
    let policy = null;
    try {
      policy = parseProjectHealthSupplyChainPolicyV1(JSON.parse(await readFile(
        path.join(input.repositoryRoot, "config/project-health/supply-chain-policy.json"),
        "utf8",
      )));
    } catch {}
    observations.push(observeRegisteredProjectHealthSensorV1({
      sensorId: "supply-chain",
      sensorInput: {
        profile: input.profile,
        mode: input.mode,
        evaluatedOn: input.evaluatedOn,
        expectedCommitSha: input.commitSha,
        policy,
        inventory: supplyChainInventoryFromGate(input),
        lockReceipt: null,
        advisorySnapshot: null,
      },
    }));
  }
  if (selectedSensorIds.has("runtime-health")) {
    observations.push(observeRegisteredProjectHealthSensorV1({
      sensorId: "runtime-health",
      sensorInput: { profile: input.profile, mode: input.mode, evidences: null },
    }));
  }
  if (selectedSensorIds.has("performance-size")) {
    observations.push(observeRegisteredProjectHealthSensorV1({
      sensorId: "performance-size",
      sensorInput: { profile: input.profile, measurement: null, baseline: null },
    }));
  }
  if (selectedSensorIds.has("visual-evidence")) {
    observations.push(observeRegisteredProjectHealthSensorV1({
      sensorId: "visual-evidence",
      sensorInput: { profile: input.profile, evidence: null },
    }));
  }
  if (selectedSensorIds.has("documentation-truth")) {
    observations.push(observeRegisteredProjectHealthSensorV1({
      sensorId: "documentation-truth",
      sensorInput: {
        profile: input.profile,
        documents: null,
        repositoryPaths: null,
        declaredStatusesByTaskId: null,
      },
    }));
  }
  if (selectedSensorIds.has("independent-review")) {
    observations.push(observeRegisteredProjectHealthSensorV1({
      sensorId: "independent-review",
      sensorInput: {
        profile: input.profile,
        expectedCommitSha: input.commitSha,
        receipt: null,
        timedOut: false,
      },
    }));
  }
  return observations;
}
