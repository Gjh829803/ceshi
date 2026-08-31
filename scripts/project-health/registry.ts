import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import { createChangeImpactDiffDescriptorV1 } from "./change-impact";
import {
  parseProjectHealthGateReceiptV1,
  type ProjectHealthGateReceiptV1,
} from "./contracts";
import { DEPENDENCY_INVENTORY_EXECUTION_DESCRIPTOR_V1 } from "./dependency-inventory";
import { putProjectHealthEvidenceJsonV1, writeProjectHealthJsonAtomicV1 } from "./evidence-store";
import {
  parseProjectHealthExecutionDescriptorV1,
  runProjectHealthProcessV1,
  type ProjectHealthExecutionDescriptorV1,
} from "./process-runner";
import { CONTRACT_PARITY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/contract-parity";
import { DOCUMENTATION_TRUTH_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/documentation-truth";
import { INDEPENDENT_REVIEW_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/independent-review";
import { PERFORMANCE_SIZE_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/performance-size";
import { RUNTIME_HEALTH_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/runtime-health";
import { SUPPLEMENTAL_AUTHORITY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/supplemental-authority";
import { SUPPLY_CHAIN_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/supply-chain";
import { TEST_TOPOLOGY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/test-topology";
import { VISUAL_EVIDENCE_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/visual-evidence";
import { WORKSPACE_BOUNDARY_SENSOR_IMPLEMENTATION_HASH_V1 } from "./sensors/workspace-boundary";

export const PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1 = Object.freeze({
  "workspace-boundary": WORKSPACE_BOUNDARY_SENSOR_IMPLEMENTATION_HASH_V1,
  "supplemental-authority": SUPPLEMENTAL_AUTHORITY_SENSOR_IMPLEMENTATION_HASH_V1,
  "contract-parity": CONTRACT_PARITY_SENSOR_IMPLEMENTATION_HASH_V1,
  "supply-chain": SUPPLY_CHAIN_SENSOR_IMPLEMENTATION_HASH_V1,
  "test-topology": TEST_TOPOLOGY_SENSOR_IMPLEMENTATION_HASH_V1,
  "runtime-health": RUNTIME_HEALTH_SENSOR_IMPLEMENTATION_HASH_V1,
  "performance-size": PERFORMANCE_SIZE_SENSOR_IMPLEMENTATION_HASH_V1,
  "visual-evidence": VISUAL_EVIDENCE_SENSOR_IMPLEMENTATION_HASH_V1,
  "documentation-truth": DOCUMENTATION_TRUTH_SENSOR_IMPLEMENTATION_HASH_V1,
  "independent-review": INDEPENDENT_REVIEW_SENSOR_IMPLEMENTATION_HASH_V1,
});

function descriptor(id: string, argv: readonly [string, ...string[]]): ProjectHealthExecutionDescriptorV1 {
  return parseProjectHealthExecutionDescriptorV1({
    kind: "project-health-execution-descriptor",
    schemaVersion: 1,
    id,
    executionScope: "in-place-checkout",
    descendantOwnershipMode: "inherit-owner-token",
    argv,
    allowedEnvironmentVariableNames: ["COREPACK_HOME", "HOME", "PATH", "PNPM_HOME", "TMPDIR"],
    implementationHash: sha256CanonicalJson({ id, argv }),
    workingDirectory: ".",
    timeoutMilliseconds: 7_200_000,
    maximumOutputBytes: 16 * 1024 * 1024,
  });
}

export const PROJECT_HEALTH_GATE_REGISTRY_V1 = Object.freeze({
  "workspace-boundaries": descriptor("workspace-boundaries", ["pnpm", "verify:workspace-boundaries"]),
  "agent-self-check": descriptor("agent-self-check", ["pnpm", "check:agent-self-check"]),
  "playground-build": descriptor("playground-build", ["pnpm", "build"]),
  "tracked-tree-clean": descriptor("tracked-tree-clean", ["git", "diff", "--exit-code"]),
  "typecheck": descriptor("typecheck", ["pnpm", "typecheck"]),
  "test-census": descriptor("test-census", ["pnpm", "test:census"]),
  "test-contract": descriptor("test-contract", ["pnpm", "test:contract"]),
  "test-independent": descriptor("test-independent", ["pnpm", "test:independent"]),
  "test-resource-heavy": descriptor("test-resource-heavy", ["pnpm", "test:resource-heavy"]),
  "test-studio": descriptor("test-studio", ["pnpm", "test:studio"]),
  "unreleased-clean-break": descriptor("unreleased-clean-break", ["pnpm", "verify:unreleased-clean-break"]),
  "canonical": descriptor("canonical", ["pnpm", "verify:canonical"]),
  "control-capture": descriptor("control-capture", ["pnpm", "verify:control-capture"]),
  "g-bot-subject": descriptor("g-bot-subject", ["pnpm", "verify:g-bot-subject"]),
  "outdoor-gameplay": descriptor("outdoor-gameplay", ["pnpm", "verify:outdoor-gameplay"]),
  "placement-layout": descriptor("placement-layout", ["pnpm", "verify:placement-layout"]),
  "rigged-subject": descriptor("rigged-subject", ["pnpm", "verify:rigged-subject"]),
  "route-r0-contract": descriptor("route-r0-contract", ["pnpm", "verify:route-r0-contract"]),
  "route-r1-heightfield": descriptor("route-r1-heightfield", ["pnpm", "verify:route-r1-heightfield"]),
  "route-r1b-static-platform": descriptor("route-r1b-static-platform", ["pnpm", "verify:route-r1b-static-platform"]),
  "validation-capture": descriptor("validation-capture", ["pnpm", "verify:validation-capture"]),
  "dependency-inventory": DEPENDENCY_INVENTORY_EXECUTION_DESCRIPTOR_V1,
  "native-scene-playground": descriptor("native-scene-playground", ["pnpm", "verify:native-scene-playground"]),
  "bna1-clean-break": descriptor("bna1-clean-break", ["pnpm", "verify:bna1-clean-break"]),
  "3c-migration": descriptor("3c-migration", ["pnpm", "verify:3c-migration"]),
});

export function isRegisteredProjectHealthGateIdV1(gateId: string): boolean {
  return Object.hasOwn(PROJECT_HEALTH_GATE_REGISTRY_V1, gateId) || gateId === "change-impact-diff";
}

export function admitRegisteredProjectHealthGateV1(input: Readonly<{
  gateId: string;
  baseSha?: string;
  headSha?: string;
}>): ProjectHealthExecutionDescriptorV1 {
  if (input.gateId === "change-impact-diff") {
    if (isNil(input.baseSha) || isNil(input.headSha)) {
      throw new TypeError("The registered change-impact Gate requires exact base and head SHAs.");
    }
    return createChangeImpactDiffDescriptorV1({ baseSha: input.baseSha, headSha: input.headSha });
  }
  const registered = PROJECT_HEALTH_GATE_REGISTRY_V1[input.gateId as keyof typeof PROJECT_HEALTH_GATE_REGISTRY_V1];
  if (isNil(registered)) throw new TypeError(`Gate ${input.gateId} is not registered.`);
  if (registered.descendantOwnershipMode !== "inherit-owner-token") {
    throw new TypeError("Registered Gate must inherit the Host owner token.");
  }
  return registered;
}

export function registeredProjectHealthGateArgvV1(gateId: string): readonly string[] {
  return [...admitRegisteredProjectHealthGateV1({ gateId }).argv];
}

export async function recordRegisteredProjectHealthGateV1(input: Readonly<{
  repositoryRoot: string;
  gateId: string;
  commitSha: string;
  outputPath: string;
  baseSha?: string;
}>): Promise<ProjectHealthGateReceiptV1> {
  if (!/^[a-f0-9]{40}$/.test(input.commitSha)) {
    throw new TypeError("Gate recording requires an exact 40-character commit SHA.");
  }
  const admitted = admitRegisteredProjectHealthGateV1({
    gateId: input.gateId,
    ...(!isNil(input.baseSha) ? { baseSha: input.baseSha } : {}),
    headSha: input.commitSha,
  });
  const execution = await runProjectHealthProcessV1({
    repositoryRoot: input.repositoryRoot,
    descriptor: admitted,
  });
  const storedEvidence = await putProjectHealthEvidenceJsonV1({
    repositoryRoot: input.repositoryRoot,
    value: execution.evidence,
  });
  const receipt = parseProjectHealthGateReceiptV1({
    kind: "project-health-gate-receipt",
    schemaVersion: 1,
    gateId: input.gateId,
    commitSha: input.commitSha,
    inputFingerprint: sha256CanonicalJson({
      commitSha: input.commitSha,
      descriptorId: admitted.id,
      implementationHash: admitted.implementationHash,
    }),
    commandHash: execution.evidence.commandHash,
    status: execution.evidence.status === "passed"
      ? "passed"
      : execution.evidence.status === "failed"
        ? "failed"
        : "incomplete",
    evidenceRef: storedEvidence.evidenceRef,
  });
  await writeProjectHealthJsonAtomicV1({ outputPath: input.outputPath, value: receipt });
  return receipt;
}
