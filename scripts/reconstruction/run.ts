import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { isEmpty, isNil } from "lodash-es";
import { type Sha256HashV1 } from "@whitebox-world/protocol";
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
  readonly authoredSourceRef?: string;
  readonly authoredSourceHash?: Sha256HashV1;
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

export interface WorldReconstructionPackagePortResultV1 {
  readonly outcome: "completed" | "check-failed" | "package-failed";
  readonly sceneAuthoringAttemptResultRef: string;
  readonly sceneAuthoringAttemptResultHash: Sha256HashV1;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly worldPackagePath: string;
  readonly worldPackageBuildReceiptRef: string;
  readonly worldPackageBuildReceiptHash: Sha256HashV1;
  readonly worldBuildIdentityRef: string;
  readonly worldBuildIdentityHash: Sha256HashV1;
  readonly diagnosticCodes: readonly string[];
}

export interface WorldReconstructionCapturePortResultV1 {
  readonly outcome: "completed" | "failed" | "camera-rollback-failed";
  readonly captureReceiptRef: string;
  readonly captureReceiptHash: Sha256HashV1;
  readonly captureReceiptPath: string;
  readonly cameraRollbackOutcome: "completed" | "failed";
  readonly diagnosticCodes: readonly string[];
}

export interface WorldReconstructionEvaluatePortResultV1 {
  readonly outcome: WorldReconstructionOutcomeV1;
  readonly evaluation: WorldReconstructionEvaluationResultV1;
  readonly evaluationPath: string;
  readonly evaluationHash: Sha256HashV1;
  readonly diagnosticCodes: readonly string[];
}

/**
 * Core-only orchestration ports. The production entry and concrete adapters are
 * intentionally not exposed until their complete identity joins are wired.
 */
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

  constructor(
    diagnosticCodes: readonly string[],
    cleanupOutcome: "completed" | "failed",
    cause?: unknown,
  ) {
    super(diagnosticCodes[0] ?? "WORLD_RECONSTRUCTION_RUN_CLOSED", { cause });
    this.name = "WorldReconstructionRunClosedErrorV1";
    this.diagnosticCodes = Object.freeze([...diagnosticCodes]);
    this.cleanupOutcome = cleanupOutcome;
  }
}

interface CompletedAttemptRecordV1 {
  readonly attemptIndex: 0 | 1;
  readonly generate: WorldReconstructionGeneratePortResultV1;
  readonly packaged: WorldReconstructionPackagePortResultV1;
  readonly captured: WorldReconstructionCapturePortResultV1;
  readonly evaluated: WorldReconstructionEvaluatePortResultV1;
}

function isCanonicalCaseArtifactRef(input: unknown): input is string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.normalize("NFC") !== input
  ) return false;
  try {
    const parsed = new URL(input);
    return parsed.protocol === "artifact:" &&
      parsed.hostname.length > 0 &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.port.length === 0 &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0 &&
      parsed.pathname.endsWith("/case.json") &&
      parsed.href === input;
  } catch {
    return false;
  }
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

const CLOSED_DIAGNOSTIC_CODE_PATTERN = /WORLD_RECONSTRUCTION_[A-Z0-9_]+/g;

function diagnosticCodesFromUnknown(error: unknown): readonly string[] {
  if (error instanceof WorldReconstructionRunClosedErrorV1) {
    return error.diagnosticCodes;
  }
  const message = error instanceof Error ? error.message : String(error);
  const matched = message.match(CLOSED_DIAGNOSTIC_CODE_PATTERN);
  if (isNil(matched) || isEmpty(matched)) {
    return ["WORLD_RECONSTRUCTION_INCOMPLETE"];
  }
  return Object.freeze([...new Set(matched)]);
}

function requestIdFor(
  reconstructionCase: WorldReconstructionCaseV1,
  runId: string,
  attemptIndex: 0 | 1,
): string {
  return `native-block-generation-${reconstructionCase.id}-${runId}-attempt-${attemptIndex}`;
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
): Promise<never> {
  const cleanupOutcome = await joinCleanup(journal, ports, diagnosticCodes);
  throw new WorldReconstructionRunClosedErrorV1(
    diagnosticCodes,
    cleanupOutcome,
    cause,
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
    await failClosed(journal, ports, [generateFailureCode(generate.outcome)]);
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
    await failClosed(journal, ports, [packageFailureCode(packaged.outcome)]);
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
    await failClosed(journal, ports, [
      "WORLD_RECONSTRUCTION_CAMERA_ROLLBACK_FAILED",
    ]);
  }
  if (captured.outcome !== "completed") {
    await failClosed(journal, ports, ["WORLD_RECONSTRUCTION_CAPTURE_FAILED"]);
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
  }).catch(async (error: unknown) =>
    failClosed(
      journal,
      ports,
      ["WORLD_RECONSTRUCTION_EVALUATION_FAILED"],
      error,
    )
  );
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
  if (!isCanonicalCaseArtifactRef(input.caseRef)) {
    const cleanup = await ports.cleanup();
    throw new WorldReconstructionRunClosedErrorV1(
      ["WORLD_RECONSTRUCTION_CASE_REF_INVALID"],
      cleanupStatus(cleanup),
    );
  }
  const reconstructionCase = parseWorldReconstructionCaseV1(
    input.reconstructionCase,
  );
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
      priorSourceRef: attempt0.generate.authoredSourceRef ??
        attempt0.generate.generationRequestRef,
      priorSourceHash: attempt0.generate.authoredSourceHash ??
        attempt0.generate.generationRequestHash,
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
