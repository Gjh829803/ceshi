import {
  randomUUID,
} from "node:crypto";
import {
  lstat,
  link,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isEqual } from "lodash-es";

import {
  formalWorldCaptureIntentCanonicalBytesV1,
  hashFormalWorldCaptureIntentV1,
  parseFormalWorldCaptureIntentV1,
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
} from "@whitebox-world/runtime-contracts";
import { type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  hashWorldReconstructionRunReceiptV1,
  hashWorldReconstructionStrictDiagnosticReceiptV1,
  getWorldReconstructionFinalEvaluatedAttemptV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionProductionResultV1,
  parseWorldReconstructionRunReceiptV1,
  parseWorldReconstructionStrictDiagnosticReceiptV1,
  worldReconstructionCaseCanonicalBytesV1,
  worldReconstructionEvaluationProfileCanonicalBytesV1,
  worldReconstructionEvidenceProfileClosureMatchesV1,
  worldReconstructionRunReceiptCanonicalBytesV1,
  worldReconstructionStrictDiagnosticReceiptCanonicalBytesV1,
  type WorldReconstructionOutcomeV1,
  type WorldReconstructionProductionFailedResultV1,
  type WorldReconstructionProductionResultV1,
  type WorldReconstructionRunReceiptV1,
  type WorldReconstructionStrictDiagnosticOutcomeV1,
  type WorldReconstructionStrictDiagnosticReceiptV1,
} from "@whitebox-world/validation";
import {
  parseNativeSceneWorldBoundsPolicyV1,
} from "../native-scene/world-bounds-policy.js";

import {
  NATIVE_BLOCK_RECONSTRUCTION_DEFAULT_CLOUD_S3_ROOT_V1,
  decideNativeBlockReconstructionRouteV1,
  deriveNativeBlockGenerationRouterRequestIdV1,
  deriveNativeBlockGenerationBootstrapV1,
  resolveWorldReconstructionFrozenOwnerIdentitiesV1,
  type WorldReconstructionHostRoutePolicyV1,
  type WorldReconstructionFrozenOwnerIdentitiesV1,
} from "./generation-request.js";
import { NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1 } from "./native-block-production-budget.js";
import {
  createProductionWorldReconstructionRunPortsV1,
} from "./production-run-ports.js";
import {
  WorldReconstructionRunClosedErrorV1,
  runWorldReconstructionV1,
  type WorldReconstructionRunPortsV1,
} from "./run.js";
import { createWorldReconstructionRunJournalV1 } from "./run-journal.js";
import {
  NativeBlockFinalArtifactPublicationClosedErrorV1,
  publishNativeBlockReconstructionFinalV1,
  type NativeBlockReconstructionLaunchV1,
} from "./final-artifact-publisher.js";
import {
  verifyNativeBlockReconstructionProductionIntegrityV1,
} from "../verification/verify-native-block-reconstruction-e2e.js";
import { hashEntryThirdPersonValidationResultV1 } from
  "../visual/entry-third-person.js";

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);
const CASE_CORPUS_RELATIVE_PATH = path.join("artifacts", "scenes");
const HOST_CLOSURE_RELATIVE_PATH = path.join(
  "apps",
  "playground",
  "public",
  "world-packages",
  "cloud-ridge",
);
const NATIVE_SCENE_API_REF = "worldkit://native-scene-api/babylon@1";
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface WorldReconstructionProductionInputV1 {
  readonly executionMode?: "fresh" | "resume-host-only";
  readonly repositoryRoot?: string;
  readonly casePath: string;
  readonly outputDirectoryPath: string;
  readonly backend: "cloud" | "local";
  readonly routePolicy: WorldReconstructionHostRoutePolicyV1;
}

interface WorldReconstructionProductionIdentityV1 {
  readonly kind: "world-reconstruction-production-result";
  readonly schemaVersion: 1;
  readonly caseId: string;
  readonly caseRef: string;
  readonly runId: string;
}

export interface WorldReconstructionProductionOwnersV1 {
  readonly decideReconstructionRoute:
    typeof decideNativeBlockReconstructionRouteV1;
  readonly createRunPorts: typeof createProductionWorldReconstructionRunPortsV1;
  readonly runCore: typeof runWorldReconstructionV1;
  readonly verifyRun:
    typeof verifyNativeBlockReconstructionProductionIntegrityV1;
  readonly publishFinal: typeof publishNativeBlockReconstructionFinalV1;
}

function defaultOwners(): WorldReconstructionProductionOwnersV1 {
  return Object.freeze({
    decideReconstructionRoute: decideNativeBlockReconstructionRouteV1,
    createRunPorts: createProductionWorldReconstructionRunPortsV1,
    runCore: runWorldReconstructionV1,
    verifyRun: verifyNativeBlockReconstructionProductionIntegrityV1,
    publishFinal: publishNativeBlockReconstructionFinalV1,
  });
}

async function lstatOrMissing(candidate: string) {
  try {
    return await lstat(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function canonicalDirectory(
  requestedPath: string,
  code: string,
): Promise<string> {
  const absolutePath = path.resolve(requestedPath);
  const metadata = await lstatOrMissing(absolutePath);
  if (
    metadata === undefined || metadata.isSymbolicLink() ||
    !metadata.isDirectory() || await realpath(absolutePath) !== absolutePath
  ) throw new TypeError(code);
  return absolutePath;
}

async function readCanonicalRegularFile(
  absolutePath: string,
  code: string,
): Promise<Uint8Array> {
  const metadata = await lstatOrMissing(absolutePath);
  if (
    metadata === undefined || metadata.isSymbolicLink() ||
    !metadata.isFile() || await realpath(absolutePath) !== absolutePath
  ) throw new TypeError(code);
  const canonicalPath = await realpath(absolutePath);
  const bytes = new Uint8Array(await readFile(absolutePath));
  const after = await lstatOrMissing(absolutePath);
  if (
    after === undefined || after.isSymbolicLink() || !after.isFile() ||
    after.dev !== metadata.dev || after.ino !== metadata.ino ||
    after.size !== metadata.size || after.mtimeMs !== metadata.mtimeMs ||
    after.ctimeMs !== metadata.ctimeMs ||
    await realpath(absolutePath) !== canonicalPath
  ) throw new TypeError(code);
  return bytes;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index]);
}

function parseJson(bytes: Uint8Array, code: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw new TypeError(code, { cause: error });
  }
}

function parseCase(bytes: Uint8Array) {
  try {
    return parseWorldReconstructionCaseV1(parseJson(
      bytes,
      "WORLD_RECONSTRUCTION_CASE_INVALID",
    ));
  } catch (error) {
    throw new TypeError("WORLD_RECONSTRUCTION_CASE_INVALID", { cause: error });
  }
}

function parseProfile(bytes: Uint8Array) {
  try {
    return parseWorldReconstructionEvaluationProfileV1(parseJson(
      bytes,
      "WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID",
    ));
  } catch (error) {
    throw new TypeError(
      "WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID",
      { cause: error },
    );
  }
}

function parseIntent(bytes: Uint8Array) {
  try {
    return parseFormalWorldCaptureIntentV1(parseJson(
      bytes,
      "WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID",
    ));
  } catch (error) {
    throw new TypeError(
      "WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID",
      { cause: error },
    );
  }
}

function registryOwnerRef(
  registryLockValue: unknown,
  resourceKind: "gameplay-bootstrap" | "world-runtime-bootstrap",
  contentHash: Sha256HashV1,
): string {
  if (!Array.isArray(registryLockValue)) {
    throw new TypeError("WORLD_RECONSTRUCTION_HOST_CLOSURE_INVALID");
  }
  const matches = registryLockValue.filter((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return false;
    }
    const record = entry as Record<string, unknown>;
    return record.resourceKind === resourceKind &&
      record.contentHash === contentHash &&
      typeof record.resourceRef === "string" &&
      typeof record.resolvedVersion === "string" &&
      record.resourceRef.endsWith(`@${record.resolvedVersion}`);
  }) as Record<string, unknown>[];
  if (matches.length !== 1) {
    throw new TypeError("WORLD_RECONSTRUCTION_HOST_CLOSURE_INVALID");
  }
  return matches[0]!.resourceRef as string;
}

interface WorldReconstructionInputFreezerHooksV1 {
  readonly afterPromotion?: () => Promise<void>;
  readonly removeOwnedPath?: (absolutePath: string) => Promise<void>;
}

interface WorldReconstructionInputFreezeInputV1 {
  readonly outputDirectoryPath: string;
  readonly caseBytes: Uint8Array;
  readonly profileBytes: Uint8Array;
  readonly intentBytes: Uint8Array;
}

export class WorldReconstructionInputFreezeClosedErrorV1 extends Error {
  readonly cleanupOutcome: "completed" | "failed";

  constructor(
    cause: unknown,
    cleanupOutcome: "completed" | "failed",
  ) {
    super(cause instanceof Error
      ? cause.message
      : "WORLD_RECONSTRUCTION_INPUT_FREEZE_FAILED", { cause });
    this.name = "WorldReconstructionInputFreezeClosedErrorV1";
    this.cleanupOutcome = cleanupOutcome;
  }
}

async function freezeInputs(
  input: WorldReconstructionInputFreezeInputV1,
  hooks: WorldReconstructionInputFreezerHooksV1 = {},
): Promise<void> {
  const { outputDirectoryPath, caseBytes, profileBytes, intentBytes } = input;
  const stagingDirectoryPath = await mkdtemp(
    `${outputDirectoryPath}.prepare-`,
  );
  let promoted = false;
  try {
    const inputDirectoryPath = path.join(stagingDirectoryPath, "inputs");
    await mkdir(inputDirectoryPath, { mode: 0o700 });
    for (const [filename, bytes] of [
      ["case.json", caseBytes],
      ["evaluation-profile.json", profileBytes],
      ["formal-world-capture-intent.json", intentBytes],
    ] as const) {
      const handle = await open(
        path.join(inputDirectoryPath, filename),
        "wx",
        0o600,
      );
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    for (const directoryPath of [inputDirectoryPath, stagingDirectoryPath]) {
      const handle = await open(directoryPath, "r");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    await rename(stagingDirectoryPath, outputDirectoryPath);
    promoted = true;
    await hooks.afterPromotion?.();
    const runsHandle = await open(path.dirname(outputDirectoryPath), "r");
    try {
      await runsHandle.sync();
    } finally {
      await runsHandle.close();
    }
  } catch (error) {
    let cleanupOutcome: "completed" | "failed" = "completed";
    try {
      const cleanupPath = promoted ? outputDirectoryPath : stagingDirectoryPath;
      if (hooks.removeOwnedPath === undefined) {
        await rm(cleanupPath, { recursive: true, force: true });
      } else {
        await hooks.removeOwnedPath(cleanupPath);
      }
      if (promoted) {
        const runsHandle = await open(path.dirname(outputDirectoryPath), "r");
        try {
          await runsHandle.sync();
        } finally {
          await runsHandle.close();
        }
      }
    } catch {
      cleanupOutcome = "failed";
    }
    throw new WorldReconstructionInputFreezeClosedErrorV1(
      error,
      cleanupOutcome,
    );
  }
}

export function createWorldReconstructionInputFreezerTestAdapterV1(
  hooks: WorldReconstructionInputFreezerHooksV1,
): (input: WorldReconstructionInputFreezeInputV1) => Promise<void> {
  return (input) => freezeInputs(input, hooks);
}

async function assertSourceInputsUnchanged(input: Readonly<{
  casePath: string;
  profilePath: string;
  intentPath: string;
  caseHash: Sha256HashV1;
  profileHash: Sha256HashV1;
  intentHash: Sha256HashV1;
}>): Promise<void> {
  const [caseBytes, profileBytes, intentBytes] = await Promise.all([
    readCanonicalRegularFile(
      input.casePath,
      "WORLD_RECONSTRUCTION_STALE_CASE",
    ),
    readCanonicalRegularFile(
      input.profilePath,
      "WORLD_RECONSTRUCTION_STALE_PROFILE",
    ),
    readCanonicalRegularFile(
      input.intentPath,
      "WORLD_RECONSTRUCTION_STALE_FORMAL_CAPTURE_INTENT",
    ),
  ]);
  if (hashWorldReconstructionCaseV1(parseCase(caseBytes)) !== input.caseHash) {
    throw new TypeError("WORLD_RECONSTRUCTION_STALE_CASE");
  }
  if (hashWorldReconstructionEvaluationProfileV1(parseProfile(profileBytes)) !==
      input.profileHash) {
    throw new TypeError("WORLD_RECONSTRUCTION_STALE_PROFILE");
  }
  if (hashFormalWorldCaptureIntentV1(parseIntent(intentBytes)) !==
      input.intentHash) {
    throw new TypeError("WORLD_RECONSTRUCTION_STALE_FORMAL_CAPTURE_INTENT");
  }
}

async function assertFrozenInputsUnchanged(input: Readonly<{
  outputDirectoryPath: string;
  caseBytes: Uint8Array;
  profileBytes: Uint8Array;
  intentBytes: Uint8Array;
}>): Promise<void> {
  const inputDirectoryPath = path.join(input.outputDirectoryPath, "inputs");
  const actual = await Promise.all([
    readCanonicalRegularFile(
      path.join(inputDirectoryPath, "case.json"),
      "WORLD_RECONSTRUCTION_FROZEN_INPUT_INVALID",
    ),
    readCanonicalRegularFile(
      path.join(inputDirectoryPath, "evaluation-profile.json"),
      "WORLD_RECONSTRUCTION_FROZEN_INPUT_INVALID",
    ),
    readCanonicalRegularFile(
      path.join(inputDirectoryPath, "formal-world-capture-intent.json"),
      "WORLD_RECONSTRUCTION_FROZEN_INPUT_INVALID",
    ),
  ]);
  if (
    !bytesEqual(actual[0], input.caseBytes) ||
    !bytesEqual(actual[1], input.profileBytes) ||
    !bytesEqual(actual[2], input.intentBytes)
  ) throw new TypeError("WORLD_RECONSTRUCTION_FROZEN_INPUT_INVALID");
}

async function readJoinedRunReceipt(input: Readonly<{
  outputDirectoryPath: string;
  caseRef: string;
  runId: string;
  returnedReceipt: WorldReconstructionRunReceiptV1;
}>): Promise<WorldReconstructionRunReceiptV1> {
  const code = "WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID";
  const bytes = await readCanonicalRegularFile(
    path.join(input.outputDirectoryPath, "run-receipt.json"),
    code,
  );
  let receipt: WorldReconstructionRunReceiptV1;
  try {
    receipt = parseWorldReconstructionRunReceiptV1(parseJson(bytes, code));
  } catch (error) {
    throw new TypeError(code, { cause: error });
  }
  const canonicalBytes = worldReconstructionRunReceiptCanonicalBytesV1(receipt);
  const returnedBytes = worldReconstructionRunReceiptCanonicalBytesV1(
    input.returnedReceipt,
  );
  if (
    !bytesEqual(bytes, canonicalBytes) ||
    !bytesEqual(canonicalBytes, returnedBytes) ||
    receipt.id !== `${input.caseRef.split("/").at(-2)}.${input.runId}` ||
    receipt.caseRef !== input.caseRef
  ) throw new TypeError(code);
  return receipt;
}

function runReceiptIdentity(
  caseRef: string,
  runId: string,
  runDirectoryPath: string,
  receipt: WorldReconstructionRunReceiptV1,
) {
  const caseArtifactRoot = caseRef.slice(0, -"/case.json".length);
  return Object.freeze({
    runReceiptPath: path.join(runDirectoryPath, "run-receipt.json"),
    runReceiptRef: `${caseArtifactRoot}/runs/${runId}/run-receipt.json`,
    runReceiptHash: hashWorldReconstructionRunReceiptV1(receipt),
  });
}

function closedDiagnosticCodes(
  receipt: WorldReconstructionRunReceiptV1,
): readonly string[] {
  return receipt.diagnosticCodes;
}

function diagnosticCodesFromError(error: unknown): readonly string[] {
  const message = error instanceof Error ? error.message : String(error);
  const codes = message.match(/[A-Z][A-Z0-9_]{4,}/g) ?? [
    "WORLD_RECONSTRUCTION_PRODUCTION_FAILED",
  ];
  return Object.freeze([...new Set(codes)].sort());
}

function failedProductionResult(
  identity: WorldReconstructionProductionIdentityV1,
  input: Readonly<{
    diagnosticCodes: readonly string[];
    cleanupOutcome: "completed" | "failed" | "not-started" | "unknown";
    runOutcome?: WorldReconstructionOutcomeV1 | "not-run";
    evaluationOutcome?: WorldReconstructionOutcomeV1 | "not-run";
    attemptCount?: 0 | 1 | 2 | 3 | 4;
    strictDiagnosticOutcome?: WorldReconstructionStrictDiagnosticOutcomeV1;
    strictDiagnosticCodes?: readonly string[];
    strictDiagnosticCleanupOutcome?: "completed" | "failed" | "not-started";
  }>,
): WorldReconstructionProductionFailedResultV1 {
  return parseWorldReconstructionProductionResultV1({
    ...identity,
    productionOutcome: "failed",
    publicationOutcome: "not-published",
    runOutcome: input.runOutcome ?? "not-run",
    evaluationOutcome: input.evaluationOutcome ?? "not-run",
    strictDiagnosticOutcome: input.strictDiagnosticOutcome ?? "not-run",
    strictDiagnosticCodes: [...new Set(input.strictDiagnosticCodes ?? [])].sort(),
    strictDiagnosticCleanupOutcome:
      input.strictDiagnosticCleanupOutcome ?? "not-started",
    attemptCount: input.attemptCount ?? 0,
    diagnosticCodes: [...new Set(input.diagnosticCodes)].sort(),
    cleanupOutcome: input.cleanupOutcome,
  }) as WorldReconstructionProductionFailedResultV1;
}

function createStrictDiagnosticReceipt(input: Readonly<{
  receipt: WorldReconstructionRunReceiptV1;
  runReceiptRef: string;
  runReceiptHash: Sha256HashV1;
  outcome: WorldReconstructionStrictDiagnosticOutcomeV1;
  diagnosticCodes: readonly string[];
  cleanupOutcome: "completed" | "failed" | "not-started";
}>): WorldReconstructionStrictDiagnosticReceiptV1 {
  const terminal = getWorldReconstructionFinalEvaluatedAttemptV1(input.receipt);
  return parseWorldReconstructionStrictDiagnosticReceiptV1({
    kind: "world-reconstruction-strict-diagnostic-receipt",
    schemaVersion: 1,
    id: `${input.receipt.id}.strict`,
    caseRef: input.receipt.caseRef,
    caseHash: input.receipt.caseHash,
    runReceiptRef: input.runReceiptRef,
    runReceiptHash: input.runReceiptHash,
    attemptIndex: terminal.attemptIndex,
    worldPackageRef: terminal.worldPackageRef,
    worldPackageRootHash: terminal.worldPackageRootHash,
    worldBuildIdentityHash: terminal.worldBuildIdentityHash,
    captureReceiptHash: terminal.captureReceiptHash,
    evaluationResultHash: terminal.evaluationResultHash,
    outcome: input.outcome,
    diagnosticCodes: [...new Set(input.diagnosticCodes)].sort(),
    cleanupOutcome: input.cleanupOutcome,
  });
}

async function publishStrictDiagnosticReceipt(
  outputDirectoryPath: string,
  receipt: WorldReconstructionStrictDiagnosticReceiptV1,
  executionMode: "fresh" | "resume-host-only",
): Promise<Readonly<{
  path: string;
  hash: Sha256HashV1;
}>> {
  const parsed = parseWorldReconstructionStrictDiagnosticReceiptV1(receipt);
  const bytes = worldReconstructionStrictDiagnosticReceiptCanonicalBytesV1(parsed);
  const outputPath = path.join(outputDirectoryPath, "strict-diagnostic.json");
  const temporaryPath = path.join(
    outputDirectoryPath,
    `.strict-diagnostic.${randomUUID()}.tmp`,
  );
  if (await lstatOrMissing(outputPath) !== undefined) {
    if (executionMode === "resume-host-only") {
      const existing = await readCanonicalRegularFile(outputPath,
        "WORLD_RECONSTRUCTION_STRICT_DIAGNOSTIC_INVALID");
      if (bytesEqual(bytes, existing)) return Object.freeze({
        path: outputPath, hash: hashWorldReconstructionStrictDiagnosticReceiptV1(parsed),
      });
    }
    throw new TypeError("WORLD_RECONSTRUCTION_STRICT_DIAGNOSTIC_ALREADY_EXISTS");
  }
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  let linked = false;
  try {
    await link(temporaryPath, outputPath);
    linked = true;
    await unlink(temporaryPath);
    const directoryHandle = await open(outputDirectoryPath, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
    const publishedBytes = await readCanonicalRegularFile(
      outputPath,
      "WORLD_RECONSTRUCTION_STRICT_DIAGNOSTIC_INVALID",
    );
    if (!bytesEqual(bytes, publishedBytes)) {
      throw new TypeError("WORLD_RECONSTRUCTION_STRICT_DIAGNOSTIC_INVALID");
    }
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    if (linked) await unlink(outputPath).catch(() => undefined);
    throw error;
  }
  return Object.freeze({
    path: outputPath,
    hash: hashWorldReconstructionStrictDiagnosticReceiptV1(parsed),
  });
}

async function removeFreshRunDirectory(
  outputDirectoryPath: string,
): Promise<"completed" | "failed"> {
  try {
    await rm(outputDirectoryPath, { recursive: true, force: true });
    return "completed";
  } catch {
    return "failed";
  }
}

function cleanupStatus(
  outcomes: Awaited<ReturnType<WorldReconstructionRunPortsV1["cleanup"]>>,
): "completed" | "failed" {
  return Object.values(outcomes).some((outcome) => outcome !== "completed")
    ? "failed"
    : "completed";
}

async function cleanupRunPorts(
  ports: WorldReconstructionRunPortsV1,
): Promise<"completed" | "failed"> {
  try {
    return cleanupStatus(await ports.cleanup());
  } catch {
    return "failed";
  }
}

function assertFrozenOwnerIdentitiesMatch(
  actual: WorldReconstructionFrozenOwnerIdentitiesV1,
  expected: WorldReconstructionFrozenOwnerIdentitiesV1,
): void {
  if (
    actual.caseHash !== expected.caseHash ||
    actual.evaluationProfileHash !== expected.evaluationProfileHash ||
    actual.gameplayBootstrapHash !== expected.gameplayBootstrapHash ||
    actual.worldRuntimeBootstrapHash !== expected.worldRuntimeBootstrapHash ||
    actual.worldBoundsPolicyHash !== expected.worldBoundsPolicyHash ||
    actual.bootstrapInputHash !== expected.bootstrapInputHash
  ) throw new TypeError("WORLD_RECONSTRUCTION_FROZEN_OWNER_INVALID");
}

export async function runWorldReconstructionProductionV1(
  input: WorldReconstructionProductionInputV1,
  owners: WorldReconstructionProductionOwnersV1 = defaultOwners(),
): Promise<WorldReconstructionProductionResultV1> {
  if (input.executionMode !== undefined && input.executionMode !== "fresh" && input.executionMode !== "resume-host-only") {
    throw new TypeError("WORLD_RECONSTRUCTION_HOST_RECOVERY_INVALID");
  }
  if (input.executionMode !== "resume-host-only") return runProduction(input, owners);
  const runRoot = await canonicalDirectory(path.resolve(input.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT, input.outputDirectoryPath),
    "WORLD_RECONSTRUCTION_OUTPUT_PATH_INVALID");
  const caseRoot = path.dirname(path.resolve(input.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT, input.casePath));
  if (path.dirname(runRoot) !== path.join(caseRoot, "runs") || !RUN_ID_PATTERN.test(path.basename(runRoot))) {
    throw new TypeError("WORLD_RECONSTRUCTION_OUTPUT_PATH_INVALID");
  }
  const lockPath = path.join(runRoot, ".host-recovery.lock");
  const lock = await open(lockPath, "wx", 0o600);
  try { return await runProduction(input, owners); }
  finally { await lock.close(); await unlink(lockPath); }
}

async function runProduction(
  input: WorldReconstructionProductionInputV1,
  owners: WorldReconstructionProductionOwnersV1,
): Promise<WorldReconstructionProductionResultV1> {
  const isHostRecovery = input.executionMode === "resume-host-only";
  const repositoryRoot = await canonicalDirectory(
    input.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT,
    "WORLD_RECONSTRUCTION_REPOSITORY_ROOT_INVALID",
  );
  const caseCorpusRoot = await canonicalDirectory(
    path.join(repositoryRoot, CASE_CORPUS_RELATIVE_PATH),
    "WORLD_RECONSTRUCTION_CASE_PATH_INVALID",
  );
  const requestedCasePath = path.resolve(repositoryRoot, input.casePath);
  const caseRelativePath = path.relative(caseCorpusRoot, requestedCasePath);
  if (
    path.basename(requestedCasePath) !== "case.json" ||
    caseRelativePath.split(path.sep).length !== 2 ||
    !isInside(caseCorpusRoot, requestedCasePath)
  ) throw new TypeError("WORLD_RECONSTRUCTION_CASE_PATH_INVALID");
  const caseBytes = await readCanonicalRegularFile(
    requestedCasePath,
    "WORLD_RECONSTRUCTION_CASE_PATH_INVALID",
  );
  const caseRoot = await canonicalDirectory(
    path.dirname(requestedCasePath),
    "WORLD_RECONSTRUCTION_CASE_PATH_INVALID",
  );
  const reconstructionCase = parseCase(caseBytes);
  if (path.basename(caseRoot) !== reconstructionCase.id) {
    throw new TypeError("WORLD_RECONSTRUCTION_CASE_PATH_INVALID");
  }

  const runsRoot = path.join(caseRoot, "runs");
  const runsMetadata = await lstatOrMissing(runsRoot);
  if (runsMetadata !== undefined && (
    runsMetadata.isSymbolicLink() || !runsMetadata.isDirectory() ||
    await realpath(runsRoot) !== runsRoot
  )) throw new TypeError("WORLD_RECONSTRUCTION_OUTPUT_PATH_INVALID");
  const outputDirectoryPath = path.resolve(
    repositoryRoot,
    input.outputDirectoryPath,
  );
  const runId = path.basename(outputDirectoryPath);
  if (
    path.dirname(outputDirectoryPath) !== runsRoot ||
    !RUN_ID_PATTERN.test(runId)
  ) throw new TypeError("WORLD_RECONSTRUCTION_OUTPUT_PATH_INVALID");
  deriveNativeBlockGenerationRouterRequestIdV1({
    caseId: reconstructionCase.id,
    runId,
    attemptIndex: 1,
  });
  if (!isHostRecovery && await lstatOrMissing(outputDirectoryPath) !== undefined) {
    throw new TypeError("WORLD_RECONSTRUCTION_OUTPUT_ALREADY_EXISTS");
  }
  for (const reservedPath of [
    path.join(caseRoot, "final"),
    path.join(caseRoot, ".final-staging"),
    path.join(caseRoot, ".final-publish.lock"),
  ]) {
    if (isHostRecovery && reservedPath === path.join(caseRoot, "final")) continue;
    if (await lstatOrMissing(reservedPath) !== undefined) {
      throw new TypeError("WORLD_RECONSTRUCTION_FINAL_ALREADY_EXISTS");
    }
  }

  if (reconstructionCase.evaluationProfileRef !== "evaluation-profile.json") {
    throw new TypeError("WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID");
  }
  const profileBytes = await readCanonicalRegularFile(
    path.join(caseRoot, reconstructionCase.evaluationProfileRef),
    "WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID",
  );
  const evaluationProfile = parseProfile(profileBytes);
  if (
    hashWorldReconstructionEvaluationProfileV1(evaluationProfile) !==
      reconstructionCase.evaluationProfileHash ||
    !worldReconstructionEvidenceProfileClosureMatchesV1(
      reconstructionCase,
      evaluationProfile,
    )
  ) throw new TypeError("WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID");

  const intentBytes = await readCanonicalRegularFile(
    path.join(caseRoot, reconstructionCase.formalCaptureIntentRef),
    "WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID",
  );
  const formalCaptureIntent = parseIntent(intentBytes);
  const canonicalIntentBytes = formalWorldCaptureIntentCanonicalBytesV1(
    formalCaptureIntent,
  );
  if (
    !bytesEqual(intentBytes, canonicalIntentBytes) ||
    hashFormalWorldCaptureIntentV1(formalCaptureIntent) !==
      reconstructionCase.formalCaptureIntentHash ||
    formalCaptureIntent.id !==
      `${reconstructionCase.id}.formal-world-capture-intent`
  ) {
    throw new TypeError(
      "WORLD_RECONSTRUCTION_FORMAL_CAPTURE_INTENT_INVALID",
    );
  }

  const caseRef =
    `artifact://world-reconstruction-case/${reconstructionCase.id}/case.json`;
  const resultIdentity = Object.freeze({
    kind: "world-reconstruction-production-result" as const,
    schemaVersion: 1 as const,
    caseId: reconstructionCase.id,
    caseRef,
    runId,
  });
  const routeDecision = owners.decideReconstructionRoute(
    reconstructionCase,
    input.routePolicy,
  );
  if (routeDecision.decision.kind !== "babylon-native") {
    return failedProductionResult(resultIdentity, {
      diagnosticCodes: Object.freeze([
        "WORLD_RECONSTRUCTION_ROUTE_UNSUPPORTED",
      ] as const),
      cleanupOutcome: "not-started",
    });
  }

  await mkdir(runsRoot, { recursive: true, mode: 0o700 });
  await canonicalDirectory(
    runsRoot,
    "WORLD_RECONSTRUCTION_OUTPUT_PATH_INVALID",
  );
  const inputDirectoryPath = path.join(caseRoot, "inputs");
  const worldBoundsPolicyPath = path.join(inputDirectoryPath, "world-bounds-policy.json");
  const worldBoundsPolicy = parseNativeSceneWorldBoundsPolicyV1(parseJson(
    await readCanonicalRegularFile(
      worldBoundsPolicyPath,
      "WORLD_RECONSTRUCTION_WORLD_BOUNDS_POLICY_INVALID",
    ),
    "WORLD_RECONSTRUCTION_WORLD_BOUNDS_POLICY_INVALID",
  ));
  const hostClosureRootPath = await canonicalDirectory(
    path.join(repositoryRoot, HOST_CLOSURE_RELATIVE_PATH),
    "WORLD_RECONSTRUCTION_HOST_CLOSURE_INVALID",
  );
  const gameplayBootstrapPath = path.join(
    hostClosureRootPath,
    "gameplay",
    "bootstrap.json",
  );
  const worldRuntimeBootstrapPath = path.join(
    hostClosureRootPath,
    "runtime",
    "world-runtime-bootstrap.json",
  );
  const [gameplayBootstrap, worldRuntimeBootstrap, registryLock] =
    await Promise.all([
      readCanonicalRegularFile(
        gameplayBootstrapPath,
        "WORLD_RECONSTRUCTION_HOST_CLOSURE_INVALID",
      ).then((bytes) => parseJson(
        bytes,
        "WORLD_RECONSTRUCTION_HOST_CLOSURE_INVALID",
      )),
      readCanonicalRegularFile(
        worldRuntimeBootstrapPath,
        "WORLD_RECONSTRUCTION_HOST_CLOSURE_INVALID",
      ).then((bytes) => parseJson(
        bytes,
        "WORLD_RECONSTRUCTION_HOST_CLOSURE_INVALID",
      )),
      readCanonicalRegularFile(
        path.join(hostClosureRootPath, "registry-lock.json"),
        "WORLD_RECONSTRUCTION_HOST_CLOSURE_INVALID",
      ).then((bytes) => parseJson(
        bytes,
        "WORLD_RECONSTRUCTION_HOST_CLOSURE_INVALID",
      )),
    ]);
  const gameplayHash = (gameplayBootstrap as { contentHash?: unknown })
    .contentHash;
  const runtimeHash = (worldRuntimeBootstrap as { contentHash?: unknown })
    .contentHash;
  if (typeof gameplayHash !== "string" || typeof runtimeHash !== "string") {
    throw new TypeError("WORLD_RECONSTRUCTION_HOST_CLOSURE_INVALID");
  }
  registryOwnerRef(
    registryLock,
    "gameplay-bootstrap",
    gameplayHash as Sha256HashV1,
  );
  const worldRuntimeBootstrapRef = registryOwnerRef(
    registryLock,
    "world-runtime-bootstrap",
    runtimeHash as Sha256HashV1,
  );
  const caseHash = hashWorldReconstructionCaseV1(reconstructionCase);
  const seed = Number.parseInt(caseHash.slice("sha256:".length, 15), 16);
  const derived = deriveNativeBlockGenerationBootstrapV1({
    reconstructionCase,
    gameplayBootstrap,
    worldRuntimeBootstrap,
    worldBoundsPolicy,
    bootstrapId: `${reconstructionCase.id}-native`,
    sceneModuleRef: `worldkit://native-scene/${reconstructionCase.id}@1`,
    nativeSceneApiRef: NATIVE_SCENE_API_REF,
    nativeSceneProfileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
    seed,
  });
  const frozenOwnerIdentities =
    resolveWorldReconstructionFrozenOwnerIdentitiesV1({
      reconstructionCase,
      evaluationProfile,
      gameplayBootstrap,
      worldRuntimeBootstrap,
      worldBoundsPolicy: derived.worldBoundsPolicy,
      bootstrap: derived.bootstrap,
    });
  const profilePath = path.join(
    caseRoot,
    reconstructionCase.evaluationProfileRef,
  );
  const intentPath = path.join(
    caseRoot,
    reconstructionCase.formalCaptureIntentRef,
  );
  await assertSourceInputsUnchanged({
    casePath: requestedCasePath,
    profilePath,
    intentPath,
    caseHash: frozenOwnerIdentities.caseHash,
    profileHash: frozenOwnerIdentities.evaluationProfileHash,
    intentHash: reconstructionCase.formalCaptureIntentHash,
  });
  const cloudOutputS3Root = (process.env.WORLDKIT_LWDP_S3_ROOT ??
    NATIVE_BLOCK_RECONSTRUCTION_DEFAULT_CLOUD_S3_ROOT_V1).replace(/\/+$/, "");
  const generationInput = Object.freeze({
    routeDecision,
    runDirectoryPath: outputDirectoryPath,
    inputDirectoryPath,
    ...(input.backend === "cloud" ? { cloudOutputS3Root } : {}),
    taskInstructionPath: path.join(inputDirectoryPath, "task-instruction.md"),
    builderSkillPath: path.join(inputDirectoryPath, "builder-skill", "SKILL.md"),
    nativeSceneApiPath: path.join(inputDirectoryPath, "native-scene-api.json"),
    nativeSceneProfilePath: path.join(
      inputDirectoryPath,
      "native-scene-profile.json",
    ),
    blockProfilePath: path.join(inputDirectoryPath, "block-profile.json"),
    hostClosureRootPath,
    gameplayBootstrapPath,
    worldRuntimeBootstrapPath,
    worldRuntimeBootstrapRef,
    worldBoundsPolicyPath,
    worldBoundsPolicy: derived.worldBoundsPolicy,
    bootstrapId: `${reconstructionCase.id}-native`,
    sceneModuleRef: `worldkit://native-scene/${reconstructionCase.id}@1`,
    seed,
    budgets: NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1,
  });
  const canonicalCaseBytes = worldReconstructionCaseCanonicalBytesV1(
    reconstructionCase,
  );
  const canonicalProfileBytes =
    worldReconstructionEvaluationProfileCanonicalBytesV1(evaluationProfile);
  try {
    await (isHostRecovery ? assertFrozenInputsUnchanged : freezeInputs)({
      outputDirectoryPath,
      caseBytes: canonicalCaseBytes,
      profileBytes: canonicalProfileBytes,
      intentBytes: canonicalIntentBytes,
    });
  } catch (error) {
    if (error instanceof WorldReconstructionInputFreezeClosedErrorV1) {
      return failedProductionResult(resultIdentity, {
        diagnosticCodes: diagnosticCodesFromError(error),
        cleanupOutcome: error.cleanupOutcome,
      });
    }
    throw error;
  }
  await canonicalDirectory(
    outputDirectoryPath,
    "WORLD_RECONSTRUCTION_OUTPUT_PATH_INVALID",
  );
  let ports: Awaited<ReturnType<typeof owners.createRunPorts>>;
  let hostRecoveryIndex: number | undefined;
  if (isHostRecovery) {
    const journalMetadata = await lstatOrMissing(path.join(outputDirectoryPath, "journal.jsonl"));
    if (journalMetadata === undefined || !journalMetadata.isFile() || journalMetadata.isSymbolicLink()) {
      throw new Error("WORLD_RECONSTRUCTION_HOST_RECOVERY_INVALID");
    }
    // Journal decoding and interrupted-tail recovery belong to the journal owner alone.
    const journal = await createWorldReconstructionRunJournalV1({ executionPurpose: "production",
      runId, caseRef, evaluationProfileRef: reconstructionCase.evaluationProfileRef,
      frozenOwnerIdentities, outputDirectoryPath });
    hostRecoveryIndex = 1 + journal.rows().filter((row) => row.state === "host-recovering" && row.boundary === "after").length;
  }
  try {
    ports = await owners.createRunPorts({
      ...(hostRecoveryIndex === undefined ? {} : { hostRecoveryIndex }),
      executionPurpose: "production",
      repositoryRoot,
      casePath: requestedCasePath,
      caseRef,
      evaluationProfilePath: profilePath,
      reconstructionCase,
      evaluationProfile,
      generationInput,
      formalCaptureIntent,
    });
  } catch (error) {
    const cleanupOutcome = isHostRecovery ? "not-started" as const : await removeFreshRunDirectory(outputDirectoryPath);
    return failedProductionResult(resultIdentity, {
      diagnosticCodes: diagnosticCodesFromError(error),
      cleanupOutcome,
    });
  }

  let receipt: WorldReconstructionRunReceiptV1;
  try {
    const existingReceiptPath = path.join(outputDirectoryPath, "run-receipt.json");
    receipt = isHostRecovery && await lstatOrMissing(existingReceiptPath) !== undefined
      ? parseWorldReconstructionRunReceiptV1(parseJson(await readCanonicalRegularFile(existingReceiptPath,
        "WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID"), "WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID"))
      : await owners.runCore({
      ...(isHostRecovery ? { executionMode: "resume-host-only" as const } : {}),
      executionPurpose: "production",
      runId,
      backend: input.backend,
      outputDirectoryPath,
      caseRef,
      reconstructionCase,
      evaluationProfile,
      frozenOwnerIdentities,
    }, ports);
  } catch (error) {
    if (error instanceof WorldReconstructionRunClosedErrorV1) {
      return failedProductionResult(resultIdentity, {
        diagnosticCodes: error.diagnosticCodes,
        cleanupOutcome: error.cleanupOutcome,
      });
    }
    const cleanupOutcome = await cleanupRunPorts(ports);
    return failedProductionResult(resultIdentity, {
      diagnosticCodes: diagnosticCodesFromError(error),
      cleanupOutcome,
    });
  }
  try {
    receipt = await readJoinedRunReceipt({
      outputDirectoryPath,
      caseRef,
      runId,
      returnedReceipt: receipt,
    });
  } catch (error) {
    const cleanupOutcome = await cleanupRunPorts(ports);
    return failedProductionResult(resultIdentity, {
      diagnosticCodes: diagnosticCodesFromError(error),
      cleanupOutcome,
    });
  }
  const receiptIdentity = runReceiptIdentity(
    caseRef,
    runId,
    outputDirectoryPath,
    receipt,
  );
  if (receipt.cleanupOutcome !== "completed") {
    return failedProductionResult(resultIdentity, {
      runOutcome: receipt.outcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes: closedDiagnosticCodes(receipt),
      cleanupOutcome: receipt.cleanupOutcome,
    });
  }
  let terminal: ReturnType<typeof getWorldReconstructionFinalEvaluatedAttemptV1>;
  try {
    terminal = getWorldReconstructionFinalEvaluatedAttemptV1(receipt);
  } catch (error) {
    return failedProductionResult(resultIdentity, {
      runOutcome: receipt.outcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes: closedDiagnosticCodes(receipt).length === 0
        ? diagnosticCodesFromError(error)
        : closedDiagnosticCodes(receipt),
      cleanupOutcome: receipt.cleanupOutcome,
    });
  }
  const evaluationOutcome = terminal.outcome;

  const assertFreshTransactionIdentity = async (): Promise<void> => {
    await assertSourceInputsUnchanged({
      casePath: requestedCasePath,
      profilePath,
      intentPath,
      caseHash: frozenOwnerIdentities.caseHash,
      profileHash: frozenOwnerIdentities.evaluationProfileHash,
      intentHash: reconstructionCase.formalCaptureIntentHash,
    });
    await assertFrozenInputsUnchanged({
      outputDirectoryPath,
      caseBytes: canonicalCaseBytes,
      profileBytes: canonicalProfileBytes,
      intentBytes: canonicalIntentBytes,
    });
    assertFrozenOwnerIdentitiesMatch(
      await ports.rehashOwnerIdentities(),
      frozenOwnerIdentities,
    );
    await readJoinedRunReceipt({
      outputDirectoryPath,
      caseRef,
      runId,
      returnedReceipt: receipt,
    });
  };

  try {
    await assertFreshTransactionIdentity();
  } catch (error) {
    const cleanupOutcome = await cleanupRunPorts(ports);
    return failedProductionResult(resultIdentity, {
      runOutcome: receipt.outcome,
      evaluationOutcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes: diagnosticCodesFromError(error),
      cleanupOutcome,
    });
  }

  let verification: Awaited<ReturnType<typeof owners.verifyRun>>;
  try {
    verification = await owners.verifyRun({
      candidate: { kind: "run", runDirectoryPath: outputDirectoryPath },
    });
    if (
      verification.attemptIndex !== receipt.finalAttemptIndex ||
      verification.worldPackageRef !== terminal.worldPackageRef ||
      verification.worldPackageRootHash !== terminal.worldPackageRootHash ||
      verification.worldBuildIdentityHash !== terminal.worldBuildIdentityHash ||
      verification.captureReceiptHash !== terminal.captureReceiptHash ||
      verification.evaluationResultHash !== terminal.evaluationResultHash ||
      verification.entryValidation.status !== "passed" ||
      hashEntryThirdPersonValidationResultV1(
        verification.entryValidation,
      ) !== verification.entryValidationHash
    ) {
      throw new TypeError("NBR70_PRODUCTION_IDENTITY_MISMATCH");
    }
  } catch (error) {
    const cleanupOutcome = await cleanupRunPorts(ports);
    return failedProductionResult(resultIdentity, {
      runOutcome: receipt.outcome,
      evaluationOutcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes: diagnosticCodesFromError(error),
      cleanupOutcome,
    });
  }
  const strictDiagnosticCodes = Object.freeze([
    ...new Set(verification.strictDiagnosticCodes),
  ].sort());
  const strictDiagnosticOutcome: WorldReconstructionStrictDiagnosticOutcomeV1 =
    strictDiagnosticCodes.length === 0 ? "passed" : "failed";
  const strictDiagnosticCleanupOutcome = "not-started" as const;
  const entryValidationHash = verification.entryValidationHash;

  const strictDiagnosticReceipt = createStrictDiagnosticReceipt({
    receipt,
    runReceiptRef: receiptIdentity.runReceiptRef,
    runReceiptHash: receiptIdentity.runReceiptHash,
    outcome: strictDiagnosticOutcome,
    diagnosticCodes: strictDiagnosticCodes,
    cleanupOutcome: strictDiagnosticCleanupOutcome,
  });
  let strictDiagnosticIdentity: Awaited<
    ReturnType<typeof publishStrictDiagnosticReceipt>
  >;
  try {
    strictDiagnosticIdentity = await publishStrictDiagnosticReceipt(
      outputDirectoryPath,
      strictDiagnosticReceipt,
      isHostRecovery ? "resume-host-only" : "fresh",
    );
  } catch (error) {
    return failedProductionResult(resultIdentity, {
      runOutcome: receipt.outcome,
      evaluationOutcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes: diagnosticCodesFromError(error),
      cleanupOutcome: "unknown",
      strictDiagnosticOutcome,
      strictDiagnosticCodes,
      strictDiagnosticCleanupOutcome,
    });
  }

  try {
    await assertFreshTransactionIdentity();
  } catch (error) {
    const cleanupOutcome = await cleanupRunPorts(ports);
    return failedProductionResult(resultIdentity, {
      runOutcome: receipt.outcome,
      evaluationOutcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes: diagnosticCodesFromError(error),
      cleanupOutcome,
      strictDiagnosticOutcome,
      strictDiagnosticCodes,
      strictDiagnosticCleanupOutcome,
    });
  }

  const launch: NativeBlockReconstructionLaunchV1 = Object.freeze({
    kind: "native-block-reconstruction-launch",
    schemaVersion: 1,
    caseId: reconstructionCase.id,
    runReceiptRef: receiptIdentity.runReceiptRef,
    runReceiptHash: receiptIdentity.runReceiptHash,
    worldPackageRelativePath: "final/world-package",
    worldPackageRef: terminal.worldPackageRef,
    worldPackageRootHash: terminal.worldPackageRootHash,
    captureReceiptRelativePath:
      "final/capture/formal-world-capture-receipt.json",
    captureReceiptHash: terminal.captureReceiptHash,
    evaluationRelativePath: "final/evaluation.json",
    evaluationHash: terminal.evaluationResultHash,
    strictDiagnosticRelativePath: "final/strict-diagnostic.json",
    strictDiagnosticHash: strictDiagnosticIdentity.hash,
    entryValidationRelativePath: "final/entry-third-person-validation.json",
    entryValidationHash,
    launchCommand:
      "pnpm worldkit native run final/world-package --port 5174 --json",
  });
  let publication: Awaited<ReturnType<typeof owners.publishFinal>>;
  const existingFinal = isHostRecovery && await lstatOrMissing(path.join(caseRoot, "final")) !== undefined;
  const publicationJournal = !isHostRecovery ? undefined : await createWorldReconstructionRunJournalV1({
    executionPurpose: "production", runId, caseRef, evaluationProfileRef: reconstructionCase.evaluationProfileRef,
    frozenOwnerIdentities, outputDirectoryPath,
  });
  await publicationJournal?.completePublishedReceiptBoundaries();
  if (!existingFinal) await publicationJournal?.recordBoundary({ state: "publication-recovering", boundary: "before", operation: "resume-publication-only" });
  let publicationDiagnosticCodes: readonly string[] = [];
  try {
    if (existingFinal) {
      const finalDirectoryPath = await canonicalDirectory(path.join(caseRoot, "final"), "WORLD_RECONSTRUCTION_FINAL_ALREADY_EXISTS");
      const existingLaunch = parseJson(await readCanonicalRegularFile(path.join(finalDirectoryPath, "launch.json"),
        "WORLD_RECONSTRUCTION_FINAL_ALREADY_EXISTS"), "WORLD_RECONSTRUCTION_FINAL_ALREADY_EXISTS");
      if (!isEqual(existingLaunch, launch)) {
        throw new Error("WORLD_RECONSTRUCTION_FINAL_ALREADY_EXISTS");
      }
      await owners.verifyRun({ candidate: { kind: "final", runDirectoryPath: outputDirectoryPath, finalDirectoryPath } });
      // Project only verified existing publication, without invoking a writer or replacing any Receipt.
      publication = { outcome: "published", finalDirectoryPath, worldPackageRootHash: terminal.worldPackageRootHash,
        captureReceiptHash: terminal.captureReceiptHash, evaluationHash: terminal.evaluationResultHash,
        strictDiagnosticHash: strictDiagnosticIdentity.hash, entryValidationHash };
    } else publication = await owners.publishFinal({
      caseDirectoryPath: caseRoot,
      runDirectoryPath: outputDirectoryPath,
      launch,
    });
  } catch (error) {
    publicationDiagnosticCodes = diagnosticCodesFromError(error);
    const cleanupOutcome =
      error instanceof NativeBlockFinalArtifactPublicationClosedErrorV1
        ? error.cleanupOutcome
        : "unknown";
    const diagnosticCodes =
      error instanceof NativeBlockFinalArtifactPublicationClosedErrorV1
        ? error.diagnosticCodes
        : diagnosticCodesFromError(error);
    return failedProductionResult(resultIdentity, {
      runOutcome: receipt.outcome,
      evaluationOutcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes,
      cleanupOutcome,
      strictDiagnosticOutcome,
      strictDiagnosticCodes,
      strictDiagnosticCleanupOutcome,
    });
  } finally {
    if (publicationJournal !== undefined && !existingFinal) {
      await publicationJournal.recordBoundary({ state: "publication-recovering", boundary: "after", operation: "resume-publication-only",
        diagnosticCodes: publicationDiagnosticCodes });
      for (const boundary of ["before", "after"] as const) await publicationJournal.recordBoundary({
        state: "completed", boundary, operation: "resume-publication-completed", diagnosticCodes: publicationDiagnosticCodes,
      });
    }
  }
  const finalDirectoryPath = path.join(caseRoot, "final");
  let publicationJoined = false;
  try {
    publicationJoined =
      publication.finalDirectoryPath === finalDirectoryPath &&
      publication.worldPackageRootHash === terminal.worldPackageRootHash &&
      publication.captureReceiptHash === terminal.captureReceiptHash &&
      publication.evaluationHash === terminal.evaluationResultHash &&
      publication.strictDiagnosticHash === strictDiagnosticIdentity.hash &&
      publication.entryValidationHash === entryValidationHash &&
      await realpath(finalDirectoryPath) === finalDirectoryPath;
  } catch {
    publicationJoined = false;
  }
  if (!publicationJoined) {
    const cleanupOutcome = await removeFreshRunDirectory(finalDirectoryPath);
    return failedProductionResult(resultIdentity, {
      runOutcome: receipt.outcome,
      evaluationOutcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes: Object.freeze([
        "NBR_FINAL_ARTIFACT_PUBLICATION_INVALID",
      ]),
      cleanupOutcome,
      strictDiagnosticOutcome,
      strictDiagnosticCodes,
      strictDiagnosticCleanupOutcome,
    });
  }

  return parseWorldReconstructionProductionResultV1({
    ...resultIdentity,
    productionOutcome: "passed",
    publicationOutcome: "published",
    evaluationOutcome,
    strictDiagnosticOutcome,
    strictDiagnosticCodes,
    strictDiagnosticCleanupOutcome,
    cleanupOutcome: "completed",
    attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
    finalWorldPackagePath: path.join(finalDirectoryPath, "world-package"),
    finalWorldPackageRef: terminal.worldPackageRef,
    finalWorldPackageRootHash: terminal.worldPackageRootHash,
    finalCaptureReceiptPath: path.join(
      finalDirectoryPath,
      "capture",
      "formal-world-capture-receipt.json",
    ),
    finalCaptureReceiptHash: terminal.captureReceiptHash,
    finalEvaluationPath: path.join(finalDirectoryPath, "evaluation.json"),
    finalEvaluationHash: terminal.evaluationResultHash,
    finalStrictDiagnosticPath: path.join(
      finalDirectoryPath,
      "strict-diagnostic.json",
    ),
    finalStrictDiagnosticRef:
      `${caseRef.slice(0, -"/case.json".length)}/final/strict-diagnostic.json`,
    finalStrictDiagnosticHash: strictDiagnosticIdentity.hash,
    finalEntryValidationPath: path.join(
      finalDirectoryPath,
      "entry-third-person-validation.json",
    ),
    finalEntryValidationRef:
      `${caseRef.slice(0, -"/case.json".length)}/final/entry-third-person-validation.json`,
    finalEntryValidationHash: entryValidationHash,
    ...receiptIdentity,
    finalDirectoryPath,
  });
}
