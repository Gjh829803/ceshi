import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { isEmpty, isNil } from "lodash-es";
import { type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  parseWorldReconstructionCaseArtifactRefV1,
} from "@whitebox-world/world-identity";
import {
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionRunReceiptV1,
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  worldReconstructionEvidenceProfileClosureMatchesV1,
  worldReconstructionRunReceiptCanonicalBytesV1,
  type WorldReconstructionCaseV1,
  type WorldReconstructionEvaluationProfileV1,
  type WorldReconstructionEvaluationResultV1,
  type WorldReconstructionOutcomeV1,
  type WorldReconstructionRunReceiptV1,
} from "@whitebox-world/validation";

import {
  createNativeBlockRepairInstructionV1,
  isRepairableWorldReconstructionEvaluationV1,
  type NativeBlockRepairInstructionV1,
  type WorldReconstructionFrozenOwnerIdentitiesV1,
} from "./repair-request.js";
import { deriveNativeBlockGenerationRouterRequestIdV1 } from
  "./generation-request.js";
import {
  createWorldReconstructionRunJournalV1,
  type WorldReconstructionCleanupOutcomesV1,
  type WorldReconstructionJournalStateV1,
  type WorldReconstructionRunJournalV1,
} from "./run-journal.js";

export type WorldReconstructionGenerateOutcomeV1 =
  | "completed"
  | "no-output"
  | "empty-output"
  | "unknown"
  | "rejected"
  | "failed";

export interface WorldReconstructionGeneratePortResultV1 {
  readonly outcome: WorldReconstructionGenerateOutcomeV1;
  readonly requestId: string;
  /** The same-request identity is the prepared router task payload hash. */
  readonly requestHash: Sha256HashV1;
  readonly generationRequestRef: string;
  readonly generationRequestHash: Sha256HashV1;
  readonly generationReceiptRef: string;
  readonly generationReceiptHash: Sha256HashV1;
  readonly sceneAuthoringAttemptRef: string;
  readonly sceneAuthoringAttemptHash: Sha256HashV1;
  readonly diagnosticCodes: readonly string[];
}

export interface WorldReconstructionGeneratePortInputV1 {
  readonly attemptIndex: 0 | 1;
  readonly backend: "cloud" | "local";
  readonly runId: string;
  readonly requestId: string;
  readonly frozenOwnerIdentities: WorldReconstructionFrozenOwnerIdentitiesV1;
  readonly repairInstruction?: NativeBlockRepairInstructionV1;
}

export interface CompletedWorldReconstructionPackagePortResultV1 {
  readonly outcome: "completed";
  readonly sceneAuthoringAttemptResultRef: string;
  readonly sceneAuthoringAttemptResultHash: Sha256HashV1;
  readonly authoredSourceRef: string;
  readonly authoredSourceHash: Sha256HashV1;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly worldPackagePath: string;
  readonly worldPackageBuildReceiptRef: string;
  readonly worldPackageBuildReceiptHash: Sha256HashV1;
  readonly worldBuildIdentityRef: string;
  readonly worldBuildIdentityHash: Sha256HashV1;
  readonly diagnosticCodes: readonly string[];
}

export interface FailedWorldReconstructionPackagePortResultV1 {
  readonly outcome: "check-failed" | "package-failed";
  readonly diagnosticCodes: readonly string[];
}

export type WorldReconstructionPackagePortResultV1 =
  | CompletedWorldReconstructionPackagePortResultV1
  | FailedWorldReconstructionPackagePortResultV1;

export interface CompletedWorldReconstructionCapturePortResultV1 {
  readonly outcome: "completed";
  readonly captureReceiptRef: string;
  readonly captureReceiptHash: Sha256HashV1;
  readonly captureReceiptPath: string;
  readonly cameraRollbackOutcome: "completed";
  readonly diagnosticCodes: readonly string[];
}

export interface FailedWorldReconstructionCapturePortResultV1 {
  readonly outcome: "failed" | "camera-rollback-failed";
  readonly cameraRollbackOutcome: "completed" | "failed";
  readonly diagnosticCodes: readonly string[];
}

export interface RejectedWorldReconstructionCapturePortResultV1 {
  readonly outcome: "rejected";
  readonly cameraRollbackOutcome: "completed";
  readonly diagnosticCodes: readonly string[];
  readonly rejectedWorldPackagePath: string;
  readonly rejectedWorldPackageRef: string;
  readonly rejectedWorldPackageRootHash: Sha256HashV1;
  readonly rejectedCaptureDirectoryPath: string;
  readonly rejectedOpeningPath: string;
  readonly rejectedOpeningRef: string;
  readonly openingGateResultPath: string;
  readonly openingGateResultRef: string;
  readonly openingGateResultHash: Sha256HashV1;
}

export type WorldReconstructionCapturePortResultV1 =
  | CompletedWorldReconstructionCapturePortResultV1
  | RejectedWorldReconstructionCapturePortResultV1
  | FailedWorldReconstructionCapturePortResultV1;

export type WorldReconstructionRejectedCaptureEvidenceV1 = Omit<
  RejectedWorldReconstructionCapturePortResultV1,
  "outcome" | "cameraRollbackOutcome" | "diagnosticCodes"
>;

export interface WorldReconstructionEvaluatePortResultV1 {
  readonly outcome: WorldReconstructionOutcomeV1;
  readonly evaluation: WorldReconstructionEvaluationResultV1;
  readonly evaluationPath: string;
  readonly evaluationHash: Sha256HashV1;
  readonly diagnosticCodes: readonly string[];
}

/** Core orchestration contract; concrete composition remains script-local. */
export interface WorldReconstructionRunPortsV1 {
  readonly generate: (
    input: WorldReconstructionGeneratePortInputV1,
  ) => Promise<WorldReconstructionGeneratePortResultV1>;
  readonly package: (
    input: Readonly<{
      attemptIndex: 0 | 1;
      frozenOwnerIdentities: WorldReconstructionFrozenOwnerIdentitiesV1;
      generate: WorldReconstructionGeneratePortResultV1;
    }>,
  ) => Promise<WorldReconstructionPackagePortResultV1>;
  readonly capture: (
    input: Readonly<{
      attemptIndex: 0 | 1;
      packaged: WorldReconstructionPackagePortResultV1;
    }>,
  ) => Promise<WorldReconstructionCapturePortResultV1>;
  readonly evaluate: (
    input: Readonly<{
      attemptIndex: 0 | 1;
      packaged: WorldReconstructionPackagePortResultV1;
      captured: WorldReconstructionCapturePortResultV1;
    }>,
  ) => Promise<WorldReconstructionEvaluatePortResultV1>;
  readonly rehashOwnerIdentities: () => Promise<
    WorldReconstructionFrozenOwnerIdentitiesV1
  >;
  readonly cleanup: () => Promise<WorldReconstructionCleanupOutcomesV1>;
}

export interface WorldReconstructionRunInputV1 {
  readonly runId: string;
  readonly backend: "cloud" | "local";
  readonly outputDirectoryPath: string;
  readonly caseRef: string;
  readonly reconstructionCase: WorldReconstructionCaseV1 | unknown;
  readonly evaluationProfile: WorldReconstructionEvaluationProfileV1 | unknown;
  readonly frozenOwnerIdentities: WorldReconstructionFrozenOwnerIdentitiesV1;
}

export class WorldReconstructionRunClosedErrorV1 extends Error {
  readonly code = "WORLD_RECONSTRUCTION_RUN_CLOSED";
  readonly diagnosticCodes: readonly string[];
  readonly cleanupOutcome: "completed" | "failed";
  readonly rejectedCaptureEvidence?: WorldReconstructionRejectedCaptureEvidenceV1;

  constructor(
    diagnosticCodes: readonly string[],
    cleanupOutcome: "completed" | "failed",
    cause?: unknown,
    rejectedCaptureEvidence?: WorldReconstructionRejectedCaptureEvidenceV1,
  ) {
    super(diagnosticCodes[0] ?? "WORLD_RECONSTRUCTION_RUN_CLOSED", { cause });
    this.name = "WorldReconstructionRunClosedErrorV1";
    this.diagnosticCodes = Object.freeze([...diagnosticCodes]);
    this.cleanupOutcome = cleanupOutcome;
    if (!isNil(rejectedCaptureEvidence)) {
      this.rejectedCaptureEvidence = Object.freeze({
        ...rejectedCaptureEvidence,
      });
    }
  }
}

interface CompletedAttemptRecordV1 {
  readonly attemptIndex: 0 | 1;
  readonly generate: WorldReconstructionGeneratePortResultV1;
  readonly packaged: CompletedWorldReconstructionPackagePortResultV1;
  readonly captured: CompletedWorldReconstructionCapturePortResultV1;
  readonly evaluated: WorldReconstructionEvaluatePortResultV1;
}

const STAGE_BY_ATTEMPT = Object.freeze({
  0: Object.freeze({
    generate: "initial-generating",
    package: "initial-packaged",
    capture: "initial-captured",
    evaluate: "initial-evaluated",
  }),
  1: Object.freeze({
    generate: "repair-generating",
    package: "repair-packaged",
    capture: "repair-captured",
    evaluate: "repair-evaluated",
  }),
} as const);

function generateFailureCode(
  outcome: WorldReconstructionGenerateOutcomeV1,
): string {
  if (outcome === "no-output") return "WORLD_RECONSTRUCTION_NO_OUTPUT";
  if (outcome === "empty-output") return "WORLD_RECONSTRUCTION_EMPTY_OUTPUT";
  if (outcome === "unknown") {
    return "WORLD_RECONSTRUCTION_CREATION_OUTCOME_UNKNOWN";
  }
  return "WORLD_RECONSTRUCTION_NO_OUTPUT";
}

function packageFailureCode(
  outcome: WorldReconstructionPackagePortResultV1["outcome"],
): string {
  return outcome === "check-failed"
    ? "WORLD_RECONSTRUCTION_CHECK_FAILED"
    : "WORLD_RECONSTRUCTION_PACKAGE_FAILED";
}

const STABLE_LOWERCASE_OWNER_DIAGNOSTIC_CODES = new Set([
  "cleanup-failed",
  "creation-outcome-unknown",
  "duplicate-request-mismatch",
  "output-hash-mismatch",
  "output-missing",
  "output-unexpected",
  "self-check-failed",
  "stale-output",
  "task-rejected",
  "task-timeout",
  "task-tool-error",
  "attempt-directory-invalid",
  "attempt-invalid",
  "attempt-result-invalid",
  "authoring-manifest-invalid",
  "bootstrap-invalid",
  "case-invalid",
  "case-path-invalid",
  "gameplay-invalid",
  "generation-output-stale",
  "generation-receipt-invalid",
  "generation-receipt-stale",
  "generation-request-invalid",
  "host-identity-closure-mismatch",
  "host-closure-invalid",
  "input-file-invalid",
  "input-path-escaped",
  "native-check-rejected",
  "native-package-internal-failed",
  "native-resources-invalid",
  "native-visual-resource-unresolved",
  "output-directory-invalid",
  "output-location-invalid",
  "registry-lock-invalid",
  "registry-runtime-closure-mismatch",
  "repository-root-invalid",
  "route-invalid",
  "runtime-invalid",
  "source-admission-stale",
  "source-bundle-stale",
  "source-directory-invalid",
  "source-inventory-invalid",
  "world-bounds-invalid",
  "world-package-kind-mismatch",
]);
const STABLE_UPPERCASE_OWNER_DIAGNOSTIC_CODES = new Set([
  "FORMAL_CAPTURE_ARTIFACT_BUDGET_INVALID",
  "FORMAL_CAPTURE_JSON_BUDGET_EXCEEDED",
  "FORMAL_CAPTURE_NATIVE_PACKAGE_REQUIRED",
  "FORMAL_CAPTURE_OUTPUT_ALREADY_EXISTS",
  "FORMAL_CAPTURE_OUTPUT_DIRECTORY_INVALID",
  "FORMAL_CAPTURE_OUTPUT_TOPOLOGY_INVALID",
  "FORMAL_CAPTURE_OPENING_COMPOSITION_GATE_FAILED",
  "FORMAL_CAPTURE_PACKAGE_REQUEST_MISMATCH",
  "FORMAL_CAPTURE_PATH_INVALID",
  "FORMAL_CAPTURE_PNG_BUDGET_EXCEEDED",
  "FORMAL_CAPTURE_PNG_INVALID",
  "FORMAL_CAPTURE_REQUEST_FILE_INVALID",
  "FORMAL_CAPTURE_REJECTED_GATE_RESULT_INVALID",
  "FORMAL_CAPTURE_REJECTED_OUTPUT_REQUIRED",
  "FORMAL_WORLD_CAPTURE_INTENT_INVALID",
  "FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID",
  "FORMAL_WORLD_CAPTURE_RECEIPT_INVALID",
  "FORMAL_WORLD_CAPTURE_REQUEST_IDENTITY_MISMATCH",
  "FORMAL_WORLD_CAPTURE_REQUEST_INVALID",
  "FORMAL_WORLD_CAPTURE_REQUEST_WRITE_INVALID",
  "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_BROWSER_EXITED",
  "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_CAPTURE_TIMEOUT",
  "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_DUPLICATE_REQUEST",
  "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_FRAME_NAVIGATED",
  "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_FRAME_REMOVED",
  "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_NOT_ACTIVE",
  "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_PAGE_CLOSED",
  "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_REQUEST_IDENTITY_MISMATCH",
  "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_SERVER_EXITED",
  "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_SERVER_PACKAGE_IDENTITY_MISMATCH",
  "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_SHELL_ORIGIN_INVALID",
  "WORLDKIT_CAPTURE_ONLY_HOSTED_TRANSPORT_TERMINATED",
  "WORLDKIT_HOSTED_FORMAL_CAPTURE_ROUTE_UNAVAILABLE",
  "WORLDKIT_OPENING_GATE_ANCHOR_DRIFT",
  "WORLDKIT_OPENING_GATE_CAMERA_DISTANCE_DRIFT",
  "WORLDKIT_OPENING_GATE_CAMERA_RETRACTED",
  "WORLDKIT_OPENING_GATE_CAMERA_UNBOUND",
  "WORLDKIT_OPENING_GATE_DEPTH_ORDER_DRIFT",
  "WORLDKIT_OPENING_GATE_FOV_DRIFT",
  "WORLDKIT_OPENING_GATE_PITCH_DRIFT",
  "WORLDKIT_OPENING_GATE_REGION_DRIFT",
  "WORLDKIT_OPENING_GATE_SUBJECT_CENTER_DRIFT",
  "WORLDKIT_OPENING_GATE_SUBJECT_IDENTITY_MISMATCH",
  "WORLDKIT_OPENING_GATE_SUBJECT_SCALE_INVALID",
  "WORLDKIT_OPENING_GATE_TARGET_MISSING",
  "WORLD_RECONSTRUCTION_ARTIFACT_PATH_INVALID",
  "WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC",
  "WORLD_RECONSTRUCTION_CAMERA_ROLLBACK_FAILED",
  "WORLD_RECONSTRUCTION_CAPTURE_FAILED",
  "WORLD_RECONSTRUCTION_CAPTURE_IDENTITY_MISMATCH",
  "WORLD_RECONSTRUCTION_CAPTURE_STAGE_INVALID",
  "WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID",
  "WORLD_RECONSTRUCTION_CASE_INVALID",
  "WORLD_RECONSTRUCTION_CASE_PATH_INVALID",
  "WORLD_RECONSTRUCTION_CASE_REF_INVALID",
  "WORLD_RECONSTRUCTION_CHECK_FAILED",
  "WORLD_RECONSTRUCTION_CLEANUP_FAILED",
  "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
  "WORLD_RECONSTRUCTION_COLLIDER_ROLE_MISMATCH",
  "WORLD_RECONSTRUCTION_CORE_FAILED",
  "WORLD_RECONSTRUCTION_CREATION_OUTCOME_UNKNOWN",
  "WORLD_RECONSTRUCTION_DIAGNOSTIC_INVALID",
  "WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH",
  "WORLD_RECONSTRUCTION_EMPTY_OUTPUT",
  "WORLD_RECONSTRUCTION_EVALUATION_FAILED",
  "WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID",
  "WORLD_RECONSTRUCTION_EVALUATION_PUBLICATION_INVALID",
  "WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID",
  "WORLD_RECONSTRUCTION_EVALUATION_STAGE_INVALID",
  "WORLD_RECONSTRUCTION_EVIDENCE_SET_INVALID",
  "WORLD_RECONSTRUCTION_EVIDENCE_STALE",
  "WORLD_RECONSTRUCTION_FINAL_ALREADY_EXISTS",
  "WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID",
  "WORLD_RECONSTRUCTION_FROZEN_INPUT_INVALID",
  "WORLD_RECONSTRUCTION_FROZEN_OWNER_INVALID",
  "WORLD_RECONSTRUCTION_HOST_CLOSURE_INVALID",
  "WORLD_RECONSTRUCTION_IMMUTABLE_ARTIFACT_MISMATCH",
  "WORLD_RECONSTRUCTION_INCOMPLETE",
  "WORLD_RECONSTRUCTION_INPUT_FREEZE_FAILED",
  "WORLD_RECONSTRUCTION_INPUT_INVALID",
  "WORLD_RECONSTRUCTION_JOURNAL_CORRUPT",
  "WORLD_RECONSTRUCTION_JOURNAL_IDENTITY_MISMATCH",
  "WORLD_RECONSTRUCTION_JOURNAL_PATH_UNSAFE",
  "WORLD_RECONSTRUCTION_JOURNAL_TRANSITION_INVALID",
  "WORLD_RECONSTRUCTION_MAX_REPAIR_EXCEEDED",
  "WORLD_RECONSTRUCTION_NON_REPAIRABLE",
  "WORLD_RECONSTRUCTION_NO_OUTPUT",
  "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT",
  "WORLD_RECONSTRUCTION_OUTPUT_ALREADY_EXISTS",
  "WORLD_RECONSTRUCTION_OUTPUT_PATH_INVALID",
  "WORLD_RECONSTRUCTION_PACKAGE_FAILED",
  "WORLD_RECONSTRUCTION_PACKAGE_STAGE_INVALID",
  "WORLD_RECONSTRUCTION_PRODUCTION_ADAPTER_UNAVAILABLE",
  "WORLD_RECONSTRUCTION_PRODUCTION_FAILED",
  "WORLD_RECONSTRUCTION_PRODUCTION_PORTS_FAILED",
  "WORLD_RECONSTRUCTION_REPAIR_INSTRUCTION_INVALID",
  "WORLD_RECONSTRUCTION_REPOSITORY_ROOT_INVALID",
  "WORLD_RECONSTRUCTION_REQUIRED_BLOCKER_PASSABLE",
  "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING",
  "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED",
  "WORLD_RECONSTRUCTION_ROUTE_UNSUPPORTED",
  "WORLD_RECONSTRUCTION_RUN_CLOSED",
  "WORLD_RECONSTRUCTION_RUN_DIRECTORY_INVALID",
  "WORLD_RECONSTRUCTION_RUN_FAILED",
  "WORLD_RECONSTRUCTION_RUN_INCOMPLETE",
  "WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID",
  "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT",
  "WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING",
  "WORLD_RECONSTRUCTION_STALE_BOOTSTRAP",
  "WORLD_RECONSTRUCTION_STALE_CASE",
  "WORLD_RECONSTRUCTION_STALE_FORMAL_CAPTURE_INTENT",
  "WORLD_RECONSTRUCTION_STALE_GAMEPLAY_BOOTSTRAP",
  "WORLD_RECONSTRUCTION_STALE_PROFILE",
  "WORLD_RECONSTRUCTION_STALE_WORLD_BOUNDS",
  "WORLD_RECONSTRUCTION_STALE_WORLD_RUNTIME_BOOTSTRAP",
  "WORLD_RECONSTRUCTION_TOPOLOGY_NODE_MISSING",
  "WORLD_RECONSTRUCTION_TOPOLOGY_RELATION_MISSING",
  "WORLD_RECONSTRUCTION_WORLD_BOUNDS_INVALID",
]);

function allowlistedOwnerDiagnosticCodes(
  diagnosticCodes: readonly string[],
): readonly string[] {
  const stableCodes = [...new Set(diagnosticCodes.filter((code) =>
    STABLE_LOWERCASE_OWNER_DIAGNOSTIC_CODES.has(code) ||
    STABLE_UPPERCASE_OWNER_DIAGNOSTIC_CODES.has(code)
  ))];
  return Object.freeze([
    ...stableCodes.filter((code) => code !== "cleanup-failed"),
    ...stableCodes.filter((code) => code === "cleanup-failed"),
  ]);
}

function stageDiagnosticCodes(
  stageCode: string,
  ownerDiagnosticCodes: readonly string[],
): readonly string[] {
  return Object.freeze([
    stageCode,
    ...allowlistedOwnerDiagnosticCodes(ownerDiagnosticCodes).filter((code) =>
      code !== stageCode
    ),
  ]);
}

function cleanupStatus(
  outcomes: WorldReconstructionCleanupOutcomesV1,
): "completed" | "failed" {
  const owners = [
    outcomes.providerTask,
    outcomes.candidate,
    outcomes.hostedBrowserSession,
    outcomes.viteServer,
    outcomes.temporaryDirectories,
    outcomes.outputPromotion,
  ];
  return owners.some((outcome) => outcome === "failed") ? "failed" : "completed";
}

const DIAGNOSTIC_CODE_PATTERN = /[A-Z][A-Z0-9_]{4,}/g;

function ownerDiagnosticCodesFromUnknown(error: unknown): readonly string[] {
  const candidates: string[] = [];
  const collect = (value: unknown): void => {
    if (value instanceof AggregateError) {
      for (const nested of value.errors) collect(nested);
    }
    if (value instanceof Error) {
      candidates.push(...(value.message.match(DIAGNOSTIC_CODE_PATTERN) ?? []));
      collect(value.cause);
    }
    if (typeof value === "object" && value !== null &&
        "diagnosticCodes" in value &&
        Array.isArray(value.diagnosticCodes)) {
      candidates.push(...value.diagnosticCodes.filter(
        (code): code is string => typeof code === "string",
      ));
    }
  };
  collect(error);
  return allowlistedOwnerDiagnosticCodes(candidates);
}

function diagnosticCodesFromUnknown(error: unknown): readonly string[] {
  if (error instanceof WorldReconstructionRunClosedErrorV1) {
    return error.diagnosticCodes;
  }
  const diagnosticCodes = ownerDiagnosticCodesFromUnknown(error);
  if (isEmpty(diagnosticCodes)) {
    return ["WORLD_RECONSTRUCTION_INCOMPLETE"];
  }
  return diagnosticCodes;
}

function requestIdFor(
  reconstructionCase: WorldReconstructionCaseV1,
  runId: string,
  attemptIndex: 0 | 1,
): string {
  return deriveNativeBlockGenerationRouterRequestIdV1({
    caseId: reconstructionCase.id,
    runId,
    attemptIndex,
  });
}

function attemptReceiptRow(record: CompletedAttemptRecordV1) {
  return Object.freeze({
    attemptIndex: record.attemptIndex,
    generationRequestRef: record.generate.generationRequestRef,
    generationRequestHash: record.generate.generationRequestHash,
    generationReceiptRef: record.generate.generationReceiptRef,
    generationReceiptHash: record.generate.generationReceiptHash,
    sceneAuthoringAttemptRef: record.generate.sceneAuthoringAttemptRef,
    sceneAuthoringAttemptHash: record.generate.sceneAuthoringAttemptHash,
    sceneAuthoringAttemptResultRef: record.packaged.sceneAuthoringAttemptResultRef,
    sceneAuthoringAttemptResultHash:
      record.packaged.sceneAuthoringAttemptResultHash,
    worldPackageRef: record.packaged.worldPackageRef,
    worldPackageRootHash: record.packaged.worldPackageRootHash,
    worldPackageBuildReceiptRef: record.packaged.worldPackageBuildReceiptRef,
    worldPackageBuildReceiptHash: record.packaged.worldPackageBuildReceiptHash,
    worldBuildIdentityRef: record.packaged.worldBuildIdentityRef,
    worldBuildIdentityHash: record.packaged.worldBuildIdentityHash,
    captureReceiptRef: record.captured.captureReceiptRef,
    captureReceiptHash: record.captured.captureReceiptHash,
    evaluationResultRef: record.evaluated.evaluation.id,
    evaluationResultHash: record.evaluated.evaluationHash,
    outcome: record.evaluated.outcome,
  });
}

async function publishRunReceipt(
  outputDirectoryPath: string,
  receipt: WorldReconstructionRunReceiptV1,
): Promise<void> {
  const parsed = parseWorldReconstructionRunReceiptV1(receipt);
  const bytes = worldReconstructionRunReceiptCanonicalBytesV1(parsed);
  const outputPath = path.join(outputDirectoryPath, "run-receipt.json");
  const temporaryPath = path.join(
    outputDirectoryPath,
    `.run-receipt.${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
  try {
    await rename(temporaryPath, outputPath);
    parseWorldReconstructionRunReceiptV1(
      JSON.parse((await readFile(outputPath)).toString("utf8")),
    );
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function closePendingBoundary(
  journal: WorldReconstructionRunJournalV1,
  diagnosticCodes: readonly string[],
): Promise<void> {
  const last = journal.rows().at(-1);
  if (isNil(last) || last.boundary !== "before" || last.state === "created") {
    return;
  }
  await journal.recordBoundary({
    state: last.state,
    boundary: "after",
    operation: last.operation,
    diagnosticCodes,
    ...(isNil(last.requestId) ? {} : { requestId: last.requestId }),
    ...(isNil(last.requestHash) ? {} : { requestHash: last.requestHash }),
  });
}

async function joinCleanup(
  journal: WorldReconstructionRunJournalV1,
  ports: WorldReconstructionRunPortsV1,
  diagnosticCodes: readonly string[] = [],
): Promise<"completed" | "failed"> {
  await closePendingBoundary(journal, diagnosticCodes);
  const outcomes = await ports.cleanup();
  journal.recordCleanup(outcomes);
  if (journal.currentState() !== "cleanup-joined" &&
    journal.currentState() !== "completed") {
    await journal.recordBoundary({
      state: "cleanup-joined",
      boundary: "before",
      operation: "cleanup-joined",
      cleanupOutcomes: outcomes,
      diagnosticCodes,
    });
    await journal.recordBoundary({
      state: "cleanup-joined",
      boundary: "after",
      operation: "cleanup-joined",
      cleanupOutcomes: outcomes,
      diagnosticCodes,
    });
  }
  return cleanupStatus(outcomes);
}

async function failClosed(
  journal: WorldReconstructionRunJournalV1,
  ports: WorldReconstructionRunPortsV1,
  diagnosticCodes: readonly string[],
  cause?: unknown,
  rejectedCaptureEvidence?: WorldReconstructionRejectedCaptureEvidenceV1,
): Promise<never> {
  const cleanupOutcome = await joinCleanup(journal, ports, diagnosticCodes);
  throw new WorldReconstructionRunClosedErrorV1(
    diagnosticCodes,
    cleanupOutcome,
    cause,
    rejectedCaptureEvidence,
  );
}

async function runAttempt(
  attemptIndex: 0 | 1,
  input: WorldReconstructionRunInputV1,
  reconstructionCase: WorldReconstructionCaseV1,
  journal: WorldReconstructionRunJournalV1,
  ports: WorldReconstructionRunPortsV1,
  repairInstruction: NativeBlockRepairInstructionV1 | undefined,
): Promise<CompletedAttemptRecordV1> {
  const stages = STAGE_BY_ATTEMPT[attemptIndex];
  journal.beginAttempt(attemptIndex);
  journal.assertOwnerIdentities(await ports.rehashOwnerIdentities());

  const requestId = requestIdFor(reconstructionCase, input.runId, attemptIndex);
  await journal.recordBoundary({
    state: stages.generate,
    boundary: "before",
    operation: stages.generate,
    requestId,
  });
  const generate = await ports.generate({
    attemptIndex,
    backend: input.backend,
    runId: input.runId,
    requestId,
    frozenOwnerIdentities: input.frozenOwnerIdentities,
    ...(isNil(repairInstruction) ? {} : { repairInstruction }),
  });
  if (generate.requestId !== requestId) {
    await failClosed(journal, ports, ["WORLD_RECONSTRUCTION_DUPLICATE_REQUEST_MISMATCH"]);
  }
  journal.attachOrRejectRequest(generate.requestId, generate.requestHash);
  if (generate.outcome !== "completed") {
    const ownerDiagnosticCodes = allowlistedOwnerDiagnosticCodes(
      generate.diagnosticCodes,
    );
    await failClosed(
      journal,
      ports,
      generate.outcome === "rejected" || generate.outcome === "failed"
        ? ownerDiagnosticCodes.length === 0
          ? [generateFailureCode(generate.outcome)]
          : ownerDiagnosticCodes
        : [generateFailureCode(generate.outcome)],
    );
  }
  await journal.recordBoundary({
    state: stages.generate,
    boundary: "after",
    operation: stages.generate,
    requestId: generate.requestId,
    requestHash: generate.requestHash,
  });

  await journal.recordBoundary({
    state: stages.package,
    boundary: "before",
    operation: stages.package,
  });
  const packaged = await ports.package({
    attemptIndex,
    frozenOwnerIdentities: input.frozenOwnerIdentities,
    generate,
  });
  if (packaged.outcome !== "completed") {
    return failClosed(
      journal,
      ports,
      stageDiagnosticCodes(
        packageFailureCode(packaged.outcome),
        packaged.diagnosticCodes,
      ),
    );
  }
  await journal.recordBoundary({
    state: stages.package,
    boundary: "after",
    operation: stages.package,
  });

  await journal.recordBoundary({
    state: stages.capture,
    boundary: "before",
    operation: stages.capture,
  });
  const captured = await ports.capture({ attemptIndex, packaged });
  if (captured.outcome === "camera-rollback-failed" ||
    captured.cameraRollbackOutcome === "failed") {
    return failClosed(
      journal,
      ports,
      stageDiagnosticCodes(
        "WORLD_RECONSTRUCTION_CAMERA_ROLLBACK_FAILED",
        captured.diagnosticCodes,
      ),
    );
  }
  if (captured.outcome !== "completed") {
    return failClosed(
      journal,
      ports,
      stageDiagnosticCodes(
        "WORLD_RECONSTRUCTION_CAPTURE_FAILED",
        captured.diagnosticCodes,
      ),
      undefined,
      captured.outcome === "rejected"
        ? {
          rejectedWorldPackagePath: captured.rejectedWorldPackagePath,
          rejectedWorldPackageRef: captured.rejectedWorldPackageRef,
          rejectedWorldPackageRootHash:
            captured.rejectedWorldPackageRootHash,
          rejectedCaptureDirectoryPath:
            captured.rejectedCaptureDirectoryPath,
          rejectedOpeningPath: captured.rejectedOpeningPath,
          rejectedOpeningRef: captured.rejectedOpeningRef,
          openingGateResultPath: captured.openingGateResultPath,
          openingGateResultRef: captured.openingGateResultRef,
          openingGateResultHash: captured.openingGateResultHash,
        }
        : undefined,
    );
  }
  await journal.recordBoundary({
    state: stages.capture,
    boundary: "after",
    operation: stages.capture,
  });

  await journal.recordBoundary({
    state: stages.evaluate,
    boundary: "before",
    operation: stages.evaluate,
  });
  const evaluated = await ports.evaluate({
    attemptIndex,
    packaged,
    captured,
  }).catch(async (error: unknown) => failClosed(
    journal,
    ports,
    stageDiagnosticCodes(
      "WORLD_RECONSTRUCTION_EVALUATION_FAILED",
      ownerDiagnosticCodesFromUnknown(error),
    ),
    error,
  ));
  await journal.recordBoundary({
    state: stages.evaluate,
    boundary: "after",
    operation: stages.evaluate,
    diagnosticCodes: evaluated.diagnosticCodes,
  });

  return Object.freeze({
    attemptIndex,
    generate,
    packaged,
    captured,
    evaluated,
  });
}

async function publishCompletedReceipt(
  input: WorldReconstructionRunInputV1,
  reconstructionCase: WorldReconstructionCaseV1,
  profile: WorldReconstructionEvaluationProfileV1,
  journal: WorldReconstructionRunJournalV1,
  ports: WorldReconstructionRunPortsV1,
  attempts: readonly CompletedAttemptRecordV1[],
): Promise<WorldReconstructionRunReceiptV1> {
  journal.assertOwnerIdentities(await ports.rehashOwnerIdentities());
  const cleanupOutcome = await joinCleanup(journal, ports);
  if (!journal.canPublishTerminalReceipt()) {
    throw new WorldReconstructionRunClosedErrorV1(
      ["WORLD_RECONSTRUCTION_CLEANUP_FAILED"],
      "failed",
    );
  }
  const final = attempts.at(-1);
  if (isNil(final) || isEmpty(attempts)) {
    throw new WorldReconstructionRunClosedErrorV1(
      ["WORLD_RECONSTRUCTION_INCOMPLETE"],
      cleanupOutcome,
    );
  }
  const finalOutcome: WorldReconstructionOutcomeV1 = cleanupOutcome === "failed"
    ? "incomplete"
    : final.evaluated.outcome;
  const receipt = parseWorldReconstructionRunReceiptV1({
    kind: "world-reconstruction-run-receipt",
    schemaVersion: 1,
    id: `${reconstructionCase.id}.${input.runId}`,
    caseRef: input.caseRef,
    caseHash: input.frozenOwnerIdentities.caseHash,
    evaluationProfileRef: reconstructionCase.evaluationProfileRef,
    evaluationProfileHash: input.frozenOwnerIdentities.evaluationProfileHash,
    outcome: finalOutcome,
    attempts: attempts.map((attempt) => attemptReceiptRow(attempt)),
    finalAttemptIndex: final.attemptIndex,
    finalEvaluationResultRef: final.evaluated.evaluation.id,
    finalEvaluationResultHash: final.evaluated.evaluationHash,
    cleanupOutcome,
  });
  if (!journal.canPublishTerminalReceipt()) {
    throw new WorldReconstructionRunClosedErrorV1(
      ["WORLD_RECONSTRUCTION_CLEANUP_FAILED"],
      cleanupOutcome,
    );
  }
  await mkdir(input.outputDirectoryPath, { recursive: true, mode: 0o700 });
  await publishRunReceipt(input.outputDirectoryPath, receipt);
  if (journal.currentState() === "cleanup-joined") {
    await journal.recordBoundary({
      state: "completed",
      boundary: "before",
      operation: "completed",
    });
    await journal.recordBoundary({
      state: "completed",
      boundary: "after",
      operation: "completed",
    });
  }
  return receipt;
}

export async function runWorldReconstructionV1(
  input: WorldReconstructionRunInputV1,
  ports: WorldReconstructionRunPortsV1,
): Promise<WorldReconstructionRunReceiptV1> {
  let caseRef;
  try {
    caseRef = parseWorldReconstructionCaseArtifactRefV1(input.caseRef);
  } catch {
    const cleanup = await ports.cleanup();
    throw new WorldReconstructionRunClosedErrorV1(
      ["WORLD_RECONSTRUCTION_CASE_REF_INVALID"],
      cleanupStatus(cleanup),
    );
  }
  const reconstructionCase = parseWorldReconstructionCaseV1(
    input.reconstructionCase,
  );
  if (
    caseRef !==
      `artifact://world-reconstruction-case/${reconstructionCase.id}/case.json`
  ) {
    const cleanup = await ports.cleanup();
    throw new WorldReconstructionRunClosedErrorV1(
      ["WORLD_RECONSTRUCTION_CASE_REF_INVALID"],
      cleanupStatus(cleanup),
    );
  }
  const profile = parseWorldReconstructionEvaluationProfileV1(
    input.evaluationProfile,
  );
  const initialIdentityCode =
    hashWorldReconstructionCaseV1(reconstructionCase) !== input.frozenOwnerIdentities.caseHash
      ? "WORLD_RECONSTRUCTION_STALE_CASE"
      : hashWorldReconstructionEvaluationProfileV1(profile) !== input.frozenOwnerIdentities.evaluationProfileHash ||
          reconstructionCase.evaluationProfileHash !== input.frozenOwnerIdentities.evaluationProfileHash ||
          !worldReconstructionEvidenceProfileClosureMatchesV1(reconstructionCase, profile)
        ? "WORLD_RECONSTRUCTION_STALE_PROFILE"
        : undefined;
  if (initialIdentityCode !== undefined) {
    const cleanup = await ports.cleanup();
    throw new WorldReconstructionRunClosedErrorV1(
      [initialIdentityCode],
      cleanupStatus(cleanup),
    );
  }
  const journal = await createWorldReconstructionRunJournalV1({
    runId: input.runId,
    caseRef: input.caseRef,
    evaluationProfileRef: reconstructionCase.evaluationProfileRef,
    frozenOwnerIdentities: input.frozenOwnerIdentities,
    outputDirectoryPath: input.outputDirectoryPath,
  });

  try {
    journal.assertOwnerIdentities(await ports.rehashOwnerIdentities());
    const attempt0 = await runAttempt(
      0,
      input,
      reconstructionCase,
      journal,
      ports,
      undefined,
    );
    if (
      attempt0.evaluated.outcome === "passed" ||
      attempt0.evaluated.outcome === "incomplete" ||
      !isRepairableWorldReconstructionEvaluationV1(
        attempt0.evaluated.evaluation,
        profile,
        0,
      )
    ) {
      return await publishCompletedReceipt(
        input,
        reconstructionCase,
        profile,
        journal,
        ports,
        [attempt0],
      );
    }

    journal.assertOwnerIdentities(await ports.rehashOwnerIdentities());
    const repairInstruction = createNativeBlockRepairInstructionV1({
      diagnostics: attempt0.evaluated.evaluation.diagnostics,
      priorSourceRef: attempt0.packaged.authoredSourceRef,
      priorSourceHash: attempt0.packaged.authoredSourceHash,
      priorEvaluationResultRef: attempt0.evaluated.evaluation.id,
      priorEvaluationResultHash: attempt0.evaluated.evaluationHash,
      priorGenerationRequestRef: attempt0.generate.generationRequestRef,
      priorGenerationRequestHash: attempt0.generate.generationRequestHash,
      frozenOwnerIdentities: input.frozenOwnerIdentities,
    });
    const attempt1 = await runAttempt(
      1,
      input,
      reconstructionCase,
      journal,
      ports,
      repairInstruction,
    );
    return await publishCompletedReceipt(
      input,
      reconstructionCase,
      profile,
      journal,
      ports,
      [attempt0, attempt1],
    );
  } catch (error) {
    if (error instanceof WorldReconstructionRunClosedErrorV1) throw error;
    const diagnosticCodes = diagnosticCodesFromUnknown(error);
    const cleanupOutcome = await joinCleanup(
      journal,
      ports,
      diagnosticCodes,
    ).catch(() => "failed" as const);
    throw new WorldReconstructionRunClosedErrorV1(
      diagnosticCodes,
      cleanupOutcome,
      error,
    );
  }
}

export type { WorldReconstructionJournalStateV1 };
