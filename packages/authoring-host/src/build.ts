import {
  hashAuthoringDocumentV4,
  normalizeAuthoringSpecV4,
  validateAuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import {
  hashAuthoringEditPolicyProjectionV1,
  parseWorldChangeValidationReportBindingV1,
  type Sha256HashV1,
  type WorldChangeBuildIdentityV1,
  type WorldChangeDiagnosticV1,
  type WorldChangeFailurePhaseV1,
  type WorldChangeValidationReportBindingV1,
} from "@whitebox-world/authoring-edit";
import { compileWorldV5 } from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import {
  createGameplayBootstrapResourceLockEntryV1,
} from "@whitebox-world/gameplay-contracts";
import { canonicalJsonBytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  createWorldPackageV2,
  type WorldPackageBuildReceiptV2,
  type WorldPackageDirectoryV2,
} from "@whitebox-world/world-package";
import { isEmpty, isNil, sortBy, uniqBy } from "lodash-es";

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

function preparedCandidateClosureBytesV1(input: {
  readonly worldPackageBuildReceipt: WorldPackageBuildReceiptV2;
  readonly validationReports: readonly WorldChangeValidationReportBindingV1[];
}): number {
  return (
    canonicalJsonBytes(input.worldPackageBuildReceipt).byteLength +
    canonicalJsonBytes(input.validationReports).byteLength
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
): Promise<PrepareTrustedCandidateResultV1> {
  return prepareTrustedCandidateV1Async(input);
}

async function prepareTrustedCandidateV1Async(
  input: PrepareTrustedCandidateInputV1,
): Promise<PrepareTrustedCandidateResultV1> {
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

  let worldPackageDirectory: WorldPackageDirectoryV2;
  let worldPackageBuildReceipt: WorldPackageBuildReceiptV2;
  try {
    worldPackageDirectory = createWorldPackageV2({
      packageId: `${validated.value.id}.package`,
      ...input.worldPackageBuildContext,
      authoringSpec: validated.value,
      normalizedWorldIr: normalized.value,
      layoutSolveResult: {
        status: normalized.layoutSolveReport.status,
        report: normalized.layoutSolveReport,
        layoutSolveReportHash: normalized.layoutSolveReportHash,
      },
      executionPlan: compiled.executionPlan,
      gameplayBootstrap,
      resourceArtifacts: input.resourceArtifacts,
    });
    worldPackageBuildReceipt = worldPackageDirectory.receipt;
  } catch (error) {
    return rejectedPrepare("package", [
      candidateInvalid(
        "/",
        error instanceof Error ? error.message : "WorldPackage build receipt failed.",
      ),
    ]);
  }

  let validationReports: readonly WorldChangeValidationReportBindingV1[] = [];
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
    let gateResult;
    try {
      gateResult = input.evaluateRequiredGates({
        requiredGateProfileRefs: policy.requiredGateProfileRefs,
        authoringSpec: validated.value,
        worldPackageBuildReceipt,
      });
    } catch (error) {
      return rejectedPrepare("required-gates", [
        worldChangeDiagnostic(
          "WORLD_CHANGE_REQUIRED_GATE_FAILED",
          "/requiredGateProfileRefs",
          error instanceof Error
            ? `Required Validation Profile runner failed: ${error.message}`
            : "Required Validation Profile runner failed.",
        ),
      ]);
    }
    if (gateResult.status !== "passed") {
      return rejectedPrepare("required-gates", gateResult.diagnostics);
    }
    try {
      validationReports = sortBy(
        gateResult.validationReports.map((report) =>
          parseWorldChangeValidationReportBindingV1(report),
        ),
        (report) => report.validationReportRef,
      );
    } catch (error) {
      return rejectedPrepare("required-gates", [
        worldChangeDiagnostic(
          "WORLD_CHANGE_REQUIRED_GATE_FAILED",
          "/validationReports",
          error instanceof Error
            ? `Required Validation Profile returned an invalid report binding: ${error.message}`
            : "Required Validation Profile returned an invalid report binding.",
        ),
      ]);
    }
    if (
      uniqBy(validationReports, (report) => report.validationReportRef).length !==
      validationReports.length
    ) {
      return rejectedPrepare("required-gates", [
        worldChangeDiagnostic(
          "WORLD_CHANGE_REQUIRED_GATE_FAILED",
          "/validationReports",
          "Required Validation Profile returned duplicate validationReportRef values.",
        ),
      ]);
    }
  }

  const sizeBytes = preparedCandidateClosureBytesV1({
    worldPackageBuildReceipt,
    validationReports,
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
    registryLockHash: worldPackageBuildReceipt.manifest.registryLockHash,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash as Sha256HashV1,
    executionPlanHash: compiled.executionPlanHash as Sha256HashV1,
    worldPackageRootHash: worldPackageBuildReceipt.worldPackageRootHash,
  };
  const createdAtUnixMilliseconds = input.nowUnixMilliseconds;
  const expiresAtUnixMilliseconds =
    createdAtUnixMilliseconds + budget.maximumPreparedCandidateRetentionMilliseconds;
  const authoringEditPolicyHash = hashAuthoringEditPolicyProjectionV1(policy);
  const validationReportsHash = sha256CanonicalJson(validationReports) as Sha256HashV1;
  const preparedCandidateRef = `candidate://${validated.value.id}/${sha256CanonicalJson({
    worldId: validated.value.id,
    authoringEditSessionId: input.authoringEditSessionId,
    changeSetHash: input.changeSetHash,
    baseAuthoringSpecHash: input.baseAuthoringSpecHash,
    resultAuthoringSpecHash,
    authoringEditPolicyHash,
    validationReportsHash,
    createdAtUnixMilliseconds,
    nonce: nextPreparedCandidateNonceV1(input.store),
  }).slice(7, 23)}`;

  let storedPackage;
  try {
    storedPackage = await input.worldPackageStore.put(worldPackageDirectory);
  } catch (error) {
    return rejectedPrepare("package", [
      candidateInvalid(
        "/",
        error instanceof Error
          ? error.message
          : "WorldPackage store publication failed.",
      ),
    ]);
  }

  putPreparedCandidateLeaseV1(input.store, {
    preparedCandidateRef,
    worldId: validated.value.id,
    authoringEditSessionId: input.authoringEditSessionId,
    changeSetHash: input.changeSetHash,
    baseAuthoringSpecHash: input.baseAuthoringSpecHash,
    authoringEditPolicyHash,
    requiredGateProfileRefs: policy.requiredGateProfileRefs,
    buildIdentity,
    worldPackageRef: storedPackage.worldPackageRef,
    worldPackageBuildReceipt: storedPackage.receipt,
    validationReports,
    validationReportsHash,
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
    validationReports,
    validationReportsHash,
    sizeBytes,
  };
}
