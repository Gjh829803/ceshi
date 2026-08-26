import {
  hashAuthoringDocumentV4,
  normalizeAuthoringSpecV4,
  validateAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import {
  hashAuthoringEditPolicyProjectionV1,
  type Sha256HashV1,
  type WorldChangeBuildIdentityV1,
  type WorldChangeDiagnosticV1,
  type WorldChangeFailurePhaseV1,
} from "@whitebox-world/authoring-edit";
import { compileWorldV5 } from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import {
  createGameplayBootstrapResourceLockEntryV1,
  gameplayBootstrapCanonicalBytesV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import { canonicalJsonBytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import {
  createWorldPackageBuildReceiptV1,
  type WorldPackageBuildReceiptV1,
} from "@whitebox-world/world-package";
import { isEmpty, isNil } from "lodash-es";

import {
  admissionBudgetDiagnostic,
  rejectedPrepare,
  worldChangeDiagnostic,
} from "./diagnostics.js";
import {
  nextPreparedCandidateNonceV1,
  preparedCandidateLeaseUsageV1,
  putPreparedCandidateLeaseV1,
} from "./lease-store.js";
import type {
  PrepareTrustedCandidateInputV1,
  PrepareTrustedCandidateResultV1,
} from "./types.js";

function candidateInvalid(
  instancePath: string,
  message: string,
): WorldChangeDiagnosticV1 {
  return worldChangeDiagnostic(
    "WORLD_CHANGE_CANDIDATE_INVALID",
    instancePath,
    message,
  );
}

function createRuntimeGameplayBootstrap(normalizedWorldIr: NormalizedWorldIRV4) {
  const entityDescriptors = normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalizedWorldIr.resources.subjectDefinitions.find(
        (candidate) => candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      if (isNil(definition)) {
        throw new Error(
          `WORLDKIT_CANDIDATE_GAMEPLAY_SUBJECT_DEFINITION_MISSING: ${node.subjectDefinitionRef}`,
        );
      }
      return {
        id: node.id,
        entityDefinitionRef: node.subjectDefinitionRef,
        capabilityRefs: definition.capabilityRefs,
      };
    });
  return createCoreGameplayBootstrapV1({
    worldId: normalizedWorldIr.id,
    worldSeed: normalizedWorldIr.seed,
    entityDescriptors,
  });
}

function worldPackageRefForCandidateV1(worldId: string): string {
  return `worldkit://world-package/${worldId}.package@1`;
}

function preparedCandidateClosureBytesV1(input: {
  readonly authoringSpec: AuthoringSpecV4;
  readonly executionPlan: ExecutionPlanV5;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldPackageBuildReceipt: WorldPackageBuildReceiptV1;
}): number {
  return (
    canonicalJsonBytes(input.authoringSpec).byteLength +
    canonicalJsonBytes(input.executionPlan).byteLength +
    gameplayBootstrapCanonicalBytesV1(input.gameplayBootstrap).byteLength +
    canonicalJsonBytes(input.worldPackageBuildReceipt).byteLength
  );
}

function mapOwnerDiagnostics(
  diagnostics: readonly { readonly message: string; readonly instancePath?: string }[],
): readonly WorldChangeDiagnosticV1[] {
  if (isEmpty(diagnostics)) {
    return [
      candidateInvalid("/", "Trusted Candidate Build failed without owner diagnostics."),
    ];
  }
  return diagnostics.map((item) =>
    candidateInvalid(item.instancePath ?? "/", item.message),
  );
}

export function prepareTrustedCandidateV1(
  input: PrepareTrustedCandidateInputV1,
): PrepareTrustedCandidateResultV1 {
  const spec = input.candidateAuthoringSpec;
  const policy = input.policy;
  const budget = policy.workloadBudget;
  const usage = preparedCandidateLeaseUsageV1(input.store);
  if (usage.count + 1 > budget.maximumPreparedCandidateCount) {
    return rejectedPrepare("admission", [
      admissionBudgetDiagnostic(
        "prepared-candidate-count",
        "/",
        budget.maximumPreparedCandidateCount,
        usage.count + 1,
      ),
    ]);
  }

  const validated = validateAuthoringSpecV4(spec);
  if (!validated.ok || isNil(validated.value)) {
    return rejectedPrepare(
      "canonical-validation",
      mapOwnerDiagnostics(validated.diagnostics),
    );
  }

  const normalized = normalizeAuthoringSpecV4(validated.value);
  const solveFailed =
    !isNil(normalized.layoutSolveReport) &&
    normalized.layoutSolveReport.status !== "solved";
  if (
    !normalized.ok ||
    isNil(normalized.value) ||
    isNil(normalized.normalizedWorldIrHash) ||
    isNil(normalized.layoutSolveReport) ||
    isNil(normalized.layoutSolveReportHash)
  ) {
    const failurePhase: WorldChangeFailurePhaseV1 = solveFailed ? "solve" : "normalize";
    return rejectedPrepare(failurePhase, mapOwnerDiagnostics(normalized.diagnostics));
  }

  let gameplayBootstrap;
  try {
    gameplayBootstrap = createRuntimeGameplayBootstrap(normalized.value);
  } catch (error) {
    return rejectedPrepare("compile", [
      candidateInvalid(
        "/",
        error instanceof Error ? error.message : "Gameplay bootstrap construction failed.",
      ),
    ]);
  }

  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrapResourceLock:
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
  });
  if (!compiled.ok || isNil(compiled.executionPlan) || isNil(compiled.executionPlanHash)) {
    return rejectedPrepare("compile", mapOwnerDiagnostics(compiled.diagnostics));
  }

  let worldPackageBuildReceipt: WorldPackageBuildReceiptV1;
  try {
    worldPackageBuildReceipt = createWorldPackageBuildReceiptV1({
      packageId: `${validated.value.id}.package`,
      authoringSpec: validated.value,
      normalizedWorldIr: normalized.value,
      layoutSolveResult: {
        status: normalized.layoutSolveReport.status,
        report: normalized.layoutSolveReport,
        layoutSolveReportHash: normalized.layoutSolveReportHash,
      },
      executionPlan: compiled.executionPlan,
      gameplayBootstrap,
      resourceArtifacts: input.resourceArtifacts ?? [],
    });
  } catch (error) {
    return rejectedPrepare("package", [
      candidateInvalid(
        "/",
        error instanceof Error ? error.message : "WorldPackage build receipt failed.",
      ),
    ]);
  }

  if (!isEmpty(policy.requiredGateProfileRefs)) {
    if (isNil(input.evaluateRequiredGates)) {
      return rejectedPrepare("required-gates", [
        worldChangeDiagnostic(
          "WORLD_CHANGE_REQUIRED_GATE_FAILED",
          "/requiredGateProfileRefs",
          "Required Validation Profile has no trusted Host runner.",
        ),
      ]);
    }
    const gateResult = input.evaluateRequiredGates({
      requiredGateProfileRefs: policy.requiredGateProfileRefs,
      authoringSpec: validated.value,
      worldPackageBuildReceipt,
    });
    if (gateResult.status !== "passed") {
      return rejectedPrepare("required-gates", gateResult.diagnostics);
    }
  }

  const worldPackageRef = worldPackageRefForCandidateV1(validated.value.id);
  const sizeBytes = preparedCandidateClosureBytesV1({
    authoringSpec: validated.value,
    executionPlan: compiled.executionPlan,
    gameplayBootstrap,
    worldPackageBuildReceipt,
  });
  if (usage.bytes + sizeBytes > budget.maximumPreparedCandidateBytes) {
    return rejectedPrepare("admission", [
      admissionBudgetDiagnostic(
        "prepared-candidate-bytes",
        "/",
        budget.maximumPreparedCandidateBytes,
        usage.bytes + sizeBytes,
      ),
    ]);
  }

  const resultAuthoringSpecHash = hashAuthoringDocumentV4(validated.value) as Sha256HashV1;
  const buildIdentity: WorldChangeBuildIdentityV1 = {
    resultAuthoringSpecHash,
    registryLockHash: policy.registryLockHash,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash as Sha256HashV1,
    executionPlanHash: compiled.executionPlanHash as Sha256HashV1,
    worldPackageRootHash: worldPackageBuildReceipt.worldPackageRootHash,
  };
  const createdAtUnixMilliseconds = input.nowUnixMilliseconds;
  const expiresAtUnixMilliseconds =
    createdAtUnixMilliseconds + budget.maximumPreparedCandidateRetentionMilliseconds;
  const authoringEditPolicyHash = hashAuthoringEditPolicyProjectionV1(policy);
  const preparedCandidateRef = `candidate://${validated.value.id}/${sha256CanonicalJson({
    worldId: validated.value.id,
    resultAuthoringSpecHash,
    authoringEditPolicyHash,
    createdAtUnixMilliseconds,
    nonce: nextPreparedCandidateNonceV1(input.store),
  }).slice(7, 23)}`;

  putPreparedCandidateLeaseV1(input.store, {
    preparedCandidateRef,
    worldId: validated.value.id,
    authoringEditPolicyHash,
    requiredGateProfileRefs: policy.requiredGateProfileRefs,
    buildIdentity,
    candidateAuthoringSpec: structuredClone(validated.value),
    executionPlan: structuredClone(compiled.executionPlan),
    gameplayBootstrap: structuredClone(gameplayBootstrap),
    worldPackageRef,
    worldPackageBuildReceipt,
    sizeBytes,
    createdAtUnixMilliseconds,
    expiresAtUnixMilliseconds,
  });

  return {
    status: "prepared",
    preparedCandidateRef,
    preparedCandidateExpiresAtUnixMilliseconds: expiresAtUnixMilliseconds,
    authoringEditPolicyHash,
    buildIdentity,
    sizeBytes,
  };
}
