import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isEmpty, isNil } from "lodash-es";

import {
  formalWorldCaptureReceiptCanonicalBytesV1,
  formalWorldCaptureIntentCanonicalBytesV1,
  hashFormalWorldCaptureReceiptV1,
  hashFormalWorldCaptureIntentV1,
  parseFormalWorldCaptureReceiptV1,
  parseFormalWorldCaptureIntentV1,
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
} from "@whitebox-world/runtime-contracts";
import {
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationResultV1,
  hashWorldReconstructionEvaluationProfileV1,
  hashWorldReconstructionRunReceiptV1,
  getWorldReconstructionFinalEvaluatedAttemptV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionRunReceiptV1,
  worldReconstructionCaseCanonicalBytesV1,
  worldReconstructionEvaluationProfileCanonicalBytesV1,
  worldReconstructionEvaluationResultCanonicalBytesV1,
  worldReconstructionEvidenceProfileClosureMatchesV1,
  worldReconstructionRunReceiptCanonicalBytesV1,
  type WorldReconstructionRunReceiptV1,
} from "@whitebox-world/validation";
import {
  parseWorldPackageWorldBoundsV1,
} from "@whitebox-world/world-package";

import {
  createHostedNativePlayabilityLaunchPortV1,
} from "./hosted-playability.js";
import {
  NATIVE_BLOCK_RECONSTRUCTION_DEFAULT_CLOUD_S3_ROOT_V1,
  NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1,
  decideNativeBlockReconstructionRouteV1,
  deriveNativeBlockGenerationRouterRequestIdV1,
  deriveNativeBlockGenerationBootstrapV1,
  resolveWorldReconstructionFrozenOwnerIdentitiesV1,
  type WorldReconstructionHostRoutePolicyV1,
  type WorldReconstructionFrozenOwnerIdentitiesV1,
} from "./generation-request.js";
import {
  createProductionWorldReconstructionRunPortsV1,
} from "./production-run-ports.js";
import {
  WorldReconstructionRunClosedErrorV1,
  runWorldReconstructionV1,
  type WorldReconstructionRunPortsV1,
} from "./run.js";
import {
  NativeBlockFinalArtifactPublicationClosedErrorV1,
  publishNativeBlockReconstructionFinalV1,
  type NativeBlockReconstructionLaunchV1,
} from "./final-artifact-publisher.js";
import {
  NativeBlockReconstructionVerificationClosedErrorV1,
  verifyNativeBlockReconstructionE2EV1,
  type NativeBlockReconstructionPlayabilityLaunchPortV1,
} from "../verification/verify-native-block-reconstruction-e2e.js";

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

export interface WorldReconstructionProductionPublishedResultV1
  extends WorldReconstructionProductionIdentityV1 {
  readonly outcome: "published";
  readonly attemptCount: 1 | 2 | 3 | 4;
  readonly finalWorldPackagePath: string;
  readonly finalWorldPackageRef: string;
  readonly finalWorldPackageRootHash: Sha256HashV1;
  readonly finalCaptureReceiptPath: string;
  readonly finalCaptureReceiptHash: Sha256HashV1;
  readonly finalEvaluationPath: string;
  readonly finalEvaluationHash: Sha256HashV1;
  readonly runReceiptPath: string;
  readonly runReceiptRef: string;
  readonly runReceiptHash: Sha256HashV1;
  readonly finalDirectoryPath: string;
}

export interface WorldReconstructionProductionClosedResultV1
  extends WorldReconstructionProductionIdentityV1 {
  readonly outcome: "closed";
  readonly runOutcome?: "passed" | "failed" | "incomplete";
  readonly attemptCount?: 1 | 2 | 3 | 4;
  readonly diagnosticCodes: readonly string[];
  readonly cleanupOutcome: "completed" | "failed" | "not-started" | "unknown";
}

export interface WorldReconstructionProductionRejectedCaptureResultV1
  extends WorldReconstructionProductionIdentityV1 {
  readonly outcome: "rejected-capture";
  readonly diagnosticCodes: readonly string[];
  readonly cleanupOutcome: "completed" | "failed";
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

export interface WorldReconstructionProductionRejectedEvaluationResultV1
  extends WorldReconstructionProductionIdentityV1 {
  readonly outcome: "rejected-evaluation";
  readonly runOutcome: "failed";
  readonly attemptCount: 1 | 2 | 3 | 4;
  readonly diagnosticCodes: readonly string[];
  readonly cleanupOutcome: "completed";
  readonly rejectedWorldPackagePath: string;
  readonly rejectedWorldPackageRef: string;
  readonly rejectedWorldPackageRootHash: Sha256HashV1;
  readonly rejectedCaptureDirectoryPath: string;
  readonly rejectedOpeningPath: string;
  readonly rejectedOpeningRef: string;
  readonly rejectedCaptureReceiptPath: string;
  readonly rejectedCaptureReceiptHash: Sha256HashV1;
  readonly rejectedEvaluationPath: string;
  readonly rejectedEvaluationRef: string;
  readonly rejectedEvaluationHash: Sha256HashV1;
  readonly runReceiptPath: string;
  readonly runReceiptRef: string;
  readonly runReceiptHash: Sha256HashV1;
}

interface WorldReconstructionProductionPreviewReadyIdentityV1
  extends WorldReconstructionProductionIdentityV1 {
  readonly outcome: "preview-ready";
  readonly publicationStatus: "not-accepted";
  readonly diagnosticCodes: readonly string[];
  readonly cleanupOutcome: "completed";
  readonly previewWorldPackagePath: string;
  readonly previewWorldPackageRef: string;
  readonly previewWorldPackageRootHash: Sha256HashV1;
  readonly previewOpeningPath: string;
  readonly previewOpeningRef: string;
  readonly launchWorkingDirectoryPath: string;
  readonly launchCommand: string;
}

export interface WorldReconstructionProductionPreviewReadyCaptureResultV1
  extends WorldReconstructionProductionPreviewReadyIdentityV1 {
  readonly qualityStage: "opening-composition";
  readonly qualityOutcome: "failed";
  readonly previewCaptureDirectoryPath: string;
  readonly openingGateResultPath: string;
  readonly openingGateResultRef: string;
  readonly openingGateResultHash: Sha256HashV1;
}

export interface WorldReconstructionProductionPreviewReadyEvaluationResultV1
  extends WorldReconstructionProductionPreviewReadyIdentityV1 {
  readonly qualityStage: "evaluation";
  readonly qualityOutcome: "failed" | "incomplete";
  readonly attemptCount: 1 | 2 | 3 | 4;
  readonly previewCaptureDirectoryPath: string;
  readonly previewCaptureReceiptPath: string;
  readonly previewCaptureReceiptHash: Sha256HashV1;
  readonly previewEvaluationPath: string;
  readonly previewEvaluationRef: string;
  readonly previewEvaluationHash: Sha256HashV1;
  readonly runReceiptPath: string;
  readonly runReceiptRef: string;
  readonly runReceiptHash: Sha256HashV1;
}

export interface WorldReconstructionProductionUnsupportedResultV1
  extends WorldReconstructionProductionIdentityV1 {
  readonly outcome: "unsupported-route";
  readonly diagnosticCodes: readonly ["WORLD_RECONSTRUCTION_ROUTE_UNSUPPORTED"];
}

export type WorldReconstructionProductionResultV1 =
  | WorldReconstructionProductionPublishedResultV1
  | WorldReconstructionProductionPreviewReadyCaptureResultV1
  | WorldReconstructionProductionPreviewReadyEvaluationResultV1
  | WorldReconstructionProductionRejectedCaptureResultV1
  | WorldReconstructionProductionRejectedEvaluationResultV1
  | WorldReconstructionProductionClosedResultV1
  | WorldReconstructionProductionUnsupportedResultV1;

export interface WorldReconstructionProductionOwnersV1 {
  readonly decideReconstructionRoute:
    typeof decideNativeBlockReconstructionRouteV1;
  readonly createRunPorts: typeof createProductionWorldReconstructionRunPortsV1;
  readonly runCore: typeof runWorldReconstructionV1;
  readonly verifyRun: typeof verifyNativeBlockReconstructionE2EV1;
  readonly publishFinal: typeof publishNativeBlockReconstructionFinalV1;
  readonly playability: NativeBlockReconstructionPlayabilityLaunchPortV1;
}

function defaultOwners(): WorldReconstructionProductionOwnersV1 {
  return Object.freeze({
    decideReconstructionRoute: decideNativeBlockReconstructionRouteV1,
    createRunPorts: createProductionWorldReconstructionRunPortsV1,
    runCore: runWorldReconstructionV1,
    verifyRun: verifyNativeBlockReconstructionE2EV1,
    publishFinal: publishNativeBlockReconstructionFinalV1,
    playability: createHostedNativePlayabilityLaunchPortV1(),
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

function previewLaunch(
  outputDirectoryPath: string,
  worldPackagePath: string,
): Readonly<{
  launchWorkingDirectoryPath: string;
  launchCommand: string;
}> {
  const relativePackagePath = path.relative(
    outputDirectoryPath,
    worldPackagePath,
  );
  if (
    isEmpty(relativePackagePath) ||
    path.isAbsolute(relativePackagePath) ||
    relativePackagePath === ".." ||
    relativePackagePath.startsWith(`..${path.sep}`)
  ) {
    throw new TypeError("NBR_PREVIEW_WORLD_PACKAGE_PATH_INVALID");
  }
  return Object.freeze({
    launchWorkingDirectoryPath: outputDirectoryPath,
    launchCommand:
      `pnpm worldkit native run ${relativePackagePath.split(path.sep).join("/")} --port 5174 --json`,
  });
}

const PREVIEWABLE_QUALITY_DIMENSION_IDS = new Set([
  "critical-traversal",
  "opening-composition",
  "semantic-silhouette",
  "topology",
]);

function isPreviewableQualityEvaluation(
  evaluation: ReturnType<typeof parseWorldReconstructionEvaluationResultV1>,
): boolean {
  const nonPassingDimensions = evaluation.dimensions.filter(
    ({ status }) => status !== "passed",
  );
  return !isEmpty(nonPassingDimensions) && nonPassingDimensions.every(
    ({ dimensionId }) => PREVIEWABLE_QUALITY_DIMENSION_IDS.has(dimensionId),
  );
}

async function rejectedEvaluationResult(
  input: Readonly<{
    caseId: string;
    caseRef: string;
    runId: string;
    outputDirectoryPath: string;
    receipt: WorldReconstructionRunReceiptV1;
    qualityGateMode: "report-only" | "required-for-publication";
  }>,
): Promise<
  | WorldReconstructionProductionPreviewReadyEvaluationResultV1
  | WorldReconstructionProductionRejectedEvaluationResultV1
  | undefined
> {
  const terminal = getWorldReconstructionFinalEvaluatedAttemptV1(input.receipt);
  const caseArtifactRoot = input.caseRef.slice(0, -"/case.json".length);
  const attemptArtifactRoot =
    `${caseArtifactRoot}/runs/${input.runId}/attempts/${terminal.attemptIndex}`;
  const attemptDirectoryPath = path.join(
    input.outputDirectoryPath,
    "attempts",
    String(terminal.attemptIndex),
  );
  const rejectedWorldPackagePath = await canonicalDirectory(
    path.join(attemptDirectoryPath, "world-package"),
    "NBR_REJECTED_EVALUATION_EVIDENCE_INVALID",
  );
  const rejectedCaptureDirectoryPath = await canonicalDirectory(
    path.join(attemptDirectoryPath, "capture"),
    "NBR_REJECTED_EVALUATION_EVIDENCE_INVALID",
  );
  const rejectedOpeningPath = path.join(
    rejectedCaptureDirectoryPath,
    "opening.png",
  );
  await readCanonicalRegularFile(
    rejectedOpeningPath,
    "NBR_REJECTED_EVALUATION_EVIDENCE_INVALID",
  );
  const rejectedCaptureReceiptPath = path.join(
    rejectedCaptureDirectoryPath,
    "formal-world-capture-receipt.json",
  );
  const captureReceiptBytes = await readCanonicalRegularFile(
    rejectedCaptureReceiptPath,
    "NBR_REJECTED_EVALUATION_EVIDENCE_INVALID",
  );
  let captureReceipt;
  try {
    captureReceipt = parseFormalWorldCaptureReceiptV1(parseJson(
      captureReceiptBytes,
      "NBR_REJECTED_EVALUATION_EVIDENCE_INVALID",
    ));
  } catch (error) {
    throw new TypeError("NBR_REJECTED_EVALUATION_EVIDENCE_INVALID", {
      cause: error,
    });
  }
  const rejectedEvaluationPath = path.join(attemptDirectoryPath, "evaluation.json");
  const evaluationBytes = await readCanonicalRegularFile(
    rejectedEvaluationPath,
    "NBR_REJECTED_EVALUATION_EVIDENCE_INVALID",
  );
  let evaluation;
  try {
    evaluation = parseWorldReconstructionEvaluationResultV1(parseJson(
      evaluationBytes,
      "NBR_REJECTED_EVALUATION_EVIDENCE_INVALID",
    ));
  } catch (error) {
    throw new TypeError("NBR_REJECTED_EVALUATION_EVIDENCE_INVALID", {
      cause: error,
    });
  }
  if (
    !bytesEqual(
      captureReceiptBytes,
      formalWorldCaptureReceiptCanonicalBytesV1(captureReceipt),
    ) ||
    hashFormalWorldCaptureReceiptV1(captureReceipt) !==
      terminal.captureReceiptHash ||
    captureReceipt.caseRef !== input.receipt.caseRef ||
    captureReceipt.caseHash !== input.receipt.caseHash ||
    captureReceipt.evaluationProfileRef !== input.receipt.evaluationProfileRef ||
    captureReceipt.evaluationProfileHash !== input.receipt.evaluationProfileHash ||
    captureReceipt.sceneAuthoringAttemptHash !==
      terminal.sceneAuthoringAttemptHash ||
    captureReceipt.sceneAuthoringAttemptResultHash !==
      terminal.sceneAuthoringAttemptResultHash ||
    captureReceipt.worldPackageRef !== terminal.worldPackageRef ||
    captureReceipt.worldPackageRootHash !== terminal.worldPackageRootHash ||
    captureReceipt.worldPackageBuildReceiptRef !==
      terminal.worldPackageBuildReceiptRef ||
    captureReceipt.worldPackageBuildReceiptHash !==
      terminal.worldPackageBuildReceiptHash ||
    captureReceipt.worldBuildIdentityRef !== terminal.worldBuildIdentityRef ||
    captureReceipt.worldBuildIdentityHash !== terminal.worldBuildIdentityHash ||
    !bytesEqual(
      evaluationBytes,
      worldReconstructionEvaluationResultCanonicalBytesV1(evaluation),
    ) ||
    evaluation.outcome === "passed" ||
    evaluation.caseRef !== input.receipt.caseRef ||
    evaluation.caseHash !== input.receipt.caseHash ||
    evaluation.evaluationProfileRef !== input.receipt.evaluationProfileRef ||
    evaluation.evaluationProfileHash !== input.receipt.evaluationProfileHash ||
    evaluation.attemptRef !== captureReceipt.sceneAuthoringAttemptRef ||
    evaluation.attemptHash !== captureReceipt.sceneAuthoringAttemptHash ||
    evaluation.worldPackageRef !== terminal.worldPackageRef ||
    evaluation.worldPackageRootHash !== terminal.worldPackageRootHash ||
    evaluation.worldBuildIdentityRef !== terminal.worldBuildIdentityRef ||
    evaluation.worldBuildIdentityHash !== terminal.worldBuildIdentityHash ||
    evaluation.captureReceiptRef !== terminal.captureReceiptRef ||
    evaluation.captureReceiptHash !== terminal.captureReceiptHash ||
    terminal.evaluationResultRef !==
      `${attemptArtifactRoot}/evaluation.json` ||
    terminal.captureReceiptRef !==
      `${attemptArtifactRoot}/capture/formal-world-capture-receipt.json` ||
    hashWorldReconstructionEvaluationResultV1(evaluation) !==
      terminal.evaluationResultHash
  ) {
    throw new TypeError("NBR_REJECTED_EVALUATION_EVIDENCE_INVALID");
  }
  const diagnosticCodes = Object.freeze([
    ...new Set(evaluation.diagnostics.map(({ code }) => code)),
  ].sort());
  const evidence = Object.freeze({
    attemptCount: input.receipt.attempts.length as 1 | 2 | 3 | 4,
    diagnosticCodes,
    cleanupOutcome: "completed" as const,
    rejectedWorldPackagePath,
    rejectedWorldPackageRef: terminal.worldPackageRef,
    rejectedWorldPackageRootHash: terminal.worldPackageRootHash,
    rejectedCaptureDirectoryPath,
    rejectedOpeningPath,
    rejectedOpeningRef: `${attemptArtifactRoot}/capture/opening.png`,
    rejectedCaptureReceiptPath,
    rejectedCaptureReceiptHash: terminal.captureReceiptHash,
    rejectedEvaluationPath,
    rejectedEvaluationRef: terminal.evaluationResultRef,
    rejectedEvaluationHash: terminal.evaluationResultHash,
    ...runReceiptIdentity(
      input.caseRef,
      input.runId,
      input.outputDirectoryPath,
      input.receipt,
    ),
  });
  if (
    input.qualityGateMode === "report-only" &&
    isPreviewableQualityEvaluation(evaluation)
  ) {
    return Object.freeze({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: input.caseId,
      caseRef: input.caseRef,
      runId: input.runId,
      outcome: "preview-ready",
      publicationStatus: "not-accepted",
      qualityStage: "evaluation",
      qualityOutcome: evaluation.outcome,
      attemptCount: input.receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes,
      cleanupOutcome: "completed",
      previewWorldPackagePath: rejectedWorldPackagePath,
      previewWorldPackageRef: terminal.worldPackageRef,
      previewWorldPackageRootHash: terminal.worldPackageRootHash,
      previewCaptureDirectoryPath: rejectedCaptureDirectoryPath,
      previewOpeningPath: rejectedOpeningPath,
      previewOpeningRef: `${attemptArtifactRoot}/capture/opening.png`,
      previewCaptureReceiptPath: rejectedCaptureReceiptPath,
      previewCaptureReceiptHash: terminal.captureReceiptHash,
      previewEvaluationPath: rejectedEvaluationPath,
      previewEvaluationRef: terminal.evaluationResultRef,
      previewEvaluationHash: terminal.evaluationResultHash,
      ...runReceiptIdentity(
        input.caseRef,
        input.runId,
        input.outputDirectoryPath,
        input.receipt,
      ),
      ...previewLaunch(input.outputDirectoryPath, rejectedWorldPackagePath),
    });
  }
  if (evaluation.outcome !== "failed") return undefined;
  return Object.freeze({
    kind: "world-reconstruction-production-result",
    schemaVersion: 1,
    caseId: input.caseId,
    caseRef: input.caseRef,
    runId: input.runId,
    outcome: "rejected-evaluation",
    runOutcome: "failed",
    ...evidence,
  });
}

function diagnosticCodesFromError(error: unknown): readonly string[] {
  const message = error instanceof Error ? error.message : String(error);
  const codes = message.match(/[A-Z][A-Z0-9_]{4,}/g) ?? [
    "WORLD_RECONSTRUCTION_PRODUCTION_FAILED",
  ];
  return Object.freeze([...new Set(codes)].sort());
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
    actual.worldBoundsHash !== expected.worldBoundsHash ||
    actual.bootstrapInputHash !== expected.bootstrapInputHash
  ) throw new TypeError("WORLD_RECONSTRUCTION_FROZEN_OWNER_INVALID");
}

export async function runWorldReconstructionProductionV1(
  input: WorldReconstructionProductionInputV1,
  owners: WorldReconstructionProductionOwnersV1 = defaultOwners(),
): Promise<WorldReconstructionProductionResultV1> {
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
  if (await lstatOrMissing(outputDirectoryPath) !== undefined) {
    throw new TypeError("WORLD_RECONSTRUCTION_OUTPUT_ALREADY_EXISTS");
  }
  for (const reservedPath of [
    path.join(caseRoot, "final"),
    path.join(caseRoot, ".final-staging"),
    path.join(caseRoot, ".final-publish.lock"),
  ]) {
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
  const routeDecision = owners.decideReconstructionRoute(
    reconstructionCase,
    input.routePolicy,
  );
  if (routeDecision.decision.kind !== "babylon-native") {
    return Object.freeze({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: reconstructionCase.id,
      caseRef,
      runId,
      outcome: "unsupported-route",
      diagnosticCodes: Object.freeze([
        "WORLD_RECONSTRUCTION_ROUTE_UNSUPPORTED",
      ] as const),
    });
  }

  await mkdir(runsRoot, { recursive: true, mode: 0o700 });
  await canonicalDirectory(
    runsRoot,
    "WORLD_RECONSTRUCTION_OUTPUT_PATH_INVALID",
  );
  const inputDirectoryPath = path.join(caseRoot, "inputs");
  const worldBoundsPath = path.join(inputDirectoryPath, "world-bounds.json");
  const worldBounds = parseWorldPackageWorldBoundsV1(parseJson(
    await readCanonicalRegularFile(
      worldBoundsPath,
      "WORLD_RECONSTRUCTION_WORLD_BOUNDS_INVALID",
    ),
    "WORLD_RECONSTRUCTION_WORLD_BOUNDS_INVALID",
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
    worldBounds,
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
      worldBounds: derived.worldBounds,
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
    worldBoundsPath,
    worldBounds: derived.worldBounds,
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
    await freezeInputs({
      outputDirectoryPath,
      caseBytes: canonicalCaseBytes,
      profileBytes: canonicalProfileBytes,
      intentBytes: canonicalIntentBytes,
    });
  } catch (error) {
    if (error instanceof WorldReconstructionInputFreezeClosedErrorV1) {
      return Object.freeze({
        kind: "world-reconstruction-production-result",
        schemaVersion: 1,
        caseId: reconstructionCase.id,
        caseRef,
        runId,
        outcome: "closed",
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
  try {
    ports = await owners.createRunPorts({
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
    const cleanupOutcome = await removeFreshRunDirectory(outputDirectoryPath);
    return Object.freeze({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: reconstructionCase.id,
      caseRef,
      runId,
      outcome: "closed",
      diagnosticCodes: diagnosticCodesFromError(error),
      cleanupOutcome,
    });
  }

  let receipt: WorldReconstructionRunReceiptV1;
  try {
    receipt = await owners.runCore({
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
      if (!isNil(error.rejectedCaptureEvidence)) {
        if (
          evaluationProfile.qualityGateMode === "report-only" &&
          error.cleanupOutcome === "completed"
        ) {
          const evidence = error.rejectedCaptureEvidence;
          try {
            return Object.freeze({
              kind: "world-reconstruction-production-result",
              schemaVersion: 1,
              caseId: reconstructionCase.id,
              caseRef,
              runId,
              outcome: "preview-ready",
              publicationStatus: "not-accepted",
              qualityStage: "opening-composition",
              qualityOutcome: "failed",
              diagnosticCodes: error.diagnosticCodes,
              cleanupOutcome: "completed",
              previewWorldPackagePath: evidence.rejectedWorldPackagePath,
              previewWorldPackageRef: evidence.rejectedWorldPackageRef,
              previewWorldPackageRootHash:
                evidence.rejectedWorldPackageRootHash,
              previewCaptureDirectoryPath:
                evidence.rejectedCaptureDirectoryPath,
              previewOpeningPath: evidence.rejectedOpeningPath,
              previewOpeningRef: evidence.rejectedOpeningRef,
              openingGateResultPath: evidence.openingGateResultPath,
              openingGateResultRef: evidence.openingGateResultRef,
              openingGateResultHash: evidence.openingGateResultHash,
              ...previewLaunch(
                outputDirectoryPath,
                evidence.rejectedWorldPackagePath,
              ),
            });
          } catch (previewError) {
            return Object.freeze({
              kind: "world-reconstruction-production-result",
              schemaVersion: 1,
              caseId: reconstructionCase.id,
              caseRef,
              runId,
              outcome: "closed",
              diagnosticCodes: diagnosticCodesFromError(previewError),
              cleanupOutcome: error.cleanupOutcome,
            });
          }
        }
        return Object.freeze({
          kind: "world-reconstruction-production-result",
          schemaVersion: 1,
          caseId: reconstructionCase.id,
          caseRef,
          runId,
          outcome: "rejected-capture",
          diagnosticCodes: error.diagnosticCodes,
          cleanupOutcome: error.cleanupOutcome,
          ...error.rejectedCaptureEvidence,
        });
      }
      return Object.freeze({
        kind: "world-reconstruction-production-result",
        schemaVersion: 1,
        caseId: reconstructionCase.id,
        caseRef,
        runId,
        outcome: "closed",
        diagnosticCodes: error.diagnosticCodes,
        cleanupOutcome: error.cleanupOutcome,
      });
    }
    const cleanupOutcome = await cleanupRunPorts(ports);
    return Object.freeze({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: reconstructionCase.id,
      caseRef,
      runId,
      outcome: "closed",
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
    return Object.freeze({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: reconstructionCase.id,
      caseRef,
      runId,
      outcome: "closed",
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
  if (
    (receipt.outcome === "failed" ||
      (receipt.outcome === "incomplete" &&
        evaluationProfile.qualityGateMode === "report-only")) &&
    receipt.cleanupOutcome === "completed"
  ) {
    try {
      const qualityResult = await rejectedEvaluationResult({
        caseId: reconstructionCase.id,
        caseRef,
        runId,
        outputDirectoryPath,
        receipt,
        qualityGateMode: evaluationProfile.qualityGateMode,
      });
      if (!isNil(qualityResult)) return qualityResult;
    } catch (error) {
      return Object.freeze({
        kind: "world-reconstruction-production-result",
        schemaVersion: 1,
        caseId: reconstructionCase.id,
        caseRef,
        runId,
        outcome: "closed",
        runOutcome: receipt.outcome,
        attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
        diagnosticCodes: diagnosticCodesFromError(error),
        cleanupOutcome: receipt.cleanupOutcome,
      });
    }
  }
  if (receipt.outcome !== "passed" || receipt.cleanupOutcome !== "completed") {
    return Object.freeze({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: reconstructionCase.id,
      caseRef,
      runId,
      outcome: "closed",
      runOutcome: receipt.outcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes: closedDiagnosticCodes(receipt),
      cleanupOutcome: receipt.cleanupOutcome,
    });
  }

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
    return Object.freeze({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: reconstructionCase.id,
      caseRef,
      runId,
      outcome: "closed",
      runOutcome: receipt.outcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes: diagnosticCodesFromError(error),
      cleanupOutcome,
    });
  }

  let verification: Awaited<ReturnType<typeof owners.verifyRun>>;
  try {
    verification = await owners.verifyRun({
      candidate: { kind: "run", runDirectoryPath: outputDirectoryPath },
      playability: owners.playability,
    });
  } catch (error) {
    const cleanupOutcome =
      error instanceof NativeBlockReconstructionVerificationClosedErrorV1
        ? error.cleanupOutcome
        : "unknown";
    const diagnosticCodes =
      error instanceof NativeBlockReconstructionVerificationClosedErrorV1
        ? error.diagnosticCodes
        : diagnosticCodesFromError(error);
    return Object.freeze({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: reconstructionCase.id,
      caseRef,
      runId,
      outcome: "closed",
      runOutcome: receipt.outcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes,
      cleanupOutcome,
    });
  }
  const terminal = getWorldReconstructionFinalEvaluatedAttemptV1(receipt);
  if (
    verification.attemptIndex !== receipt.finalAttemptIndex ||
    verification.worldPackageRef !== terminal.worldPackageRef ||
    verification.worldPackageRootHash !== terminal.worldPackageRootHash ||
    verification.worldBuildIdentityHash !== terminal.worldBuildIdentityHash ||
    verification.captureReceiptHash !== terminal.captureReceiptHash ||
    verification.evaluationResultHash !== terminal.evaluationResultHash
  ) {
    return Object.freeze({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: reconstructionCase.id,
      caseRef,
      runId,
      outcome: "closed",
      runOutcome: receipt.outcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes: Object.freeze(["NBR70_PRODUCTION_IDENTITY_MISMATCH"]),
      cleanupOutcome: "completed",
    });
  }

  try {
    await assertFreshTransactionIdentity();
  } catch (error) {
    const cleanupOutcome = await cleanupRunPorts(ports);
    return Object.freeze({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: reconstructionCase.id,
      caseRef,
      runId,
      outcome: "closed",
      runOutcome: receipt.outcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes: diagnosticCodesFromError(error),
      cleanupOutcome,
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
    launchCommand:
      "pnpm worldkit native run final/world-package --port 5174 --json",
  });
  let publication: Awaited<ReturnType<typeof owners.publishFinal>>;
  try {
    publication = await owners.publishFinal({
      caseDirectoryPath: caseRoot,
      runDirectoryPath: outputDirectoryPath,
      launch,
      playability: owners.playability,
    });
  } catch (error) {
    const cleanupOutcome =
      error instanceof NativeBlockFinalArtifactPublicationClosedErrorV1
        ? error.cleanupOutcome
        : "unknown";
    const diagnosticCodes =
      error instanceof NativeBlockFinalArtifactPublicationClosedErrorV1
        ? error.diagnosticCodes
        : diagnosticCodesFromError(error);
    return Object.freeze({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: reconstructionCase.id,
      caseRef,
      runId,
      outcome: "closed",
      runOutcome: receipt.outcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes,
      cleanupOutcome,
    });
  }
  const finalDirectoryPath = path.join(caseRoot, "final");
  let publicationJoined = false;
  try {
    publicationJoined =
      publication.finalDirectoryPath === finalDirectoryPath &&
      publication.worldPackageRootHash === terminal.worldPackageRootHash &&
      publication.captureReceiptHash === terminal.captureReceiptHash &&
      publication.evaluationHash === terminal.evaluationResultHash &&
      await realpath(finalDirectoryPath) === finalDirectoryPath;
  } catch {
    publicationJoined = false;
  }
  if (!publicationJoined) {
    const cleanupOutcome = await removeFreshRunDirectory(finalDirectoryPath);
    return Object.freeze({
      kind: "world-reconstruction-production-result",
      schemaVersion: 1,
      caseId: reconstructionCase.id,
      caseRef,
      runId,
      outcome: "closed",
      runOutcome: receipt.outcome,
      attemptCount: receipt.attempts.length as 1 | 2 | 3 | 4,
      diagnosticCodes: Object.freeze([
        "NBR_FINAL_ARTIFACT_PUBLICATION_INVALID",
      ]),
      cleanupOutcome,
    });
  }

  return Object.freeze({
    kind: "world-reconstruction-production-result",
    schemaVersion: 1,
    caseId: reconstructionCase.id,
    caseRef,
    runId,
    outcome: "published",
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
    ...receiptIdentity,
    finalDirectoryPath,
  });
}
