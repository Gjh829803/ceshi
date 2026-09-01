import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import {
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  hashFormalColliderOverlayObservationV1,
  hashFormalOpeningObservationV1,
  hashFormalScriptedTraversalObservationV1,
  hashFormalSpawnSupportObservationV1,
  hashFormalWorldCaptureReceiptV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalSpawnSupportObservationV1,
  parseFormalWorldCaptureReceiptV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionRunReceiptV1,
} from "@whitebox-world/validation";
import { verifyWorldPackageDirectoryV1 } from "@whitebox-world/world-package";

import { readWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import {
  verifyNativeBlockReconstructionE2EV1,
  type NativeBlockReconstructionPlayabilityLaunchPortV1,
} from "../verification/verify-native-block-reconstruction-e2e.js";

const FINAL_DIRECTORY_NAME = "final";
const STAGING_DIRECTORY_NAME = ".final-staging";
const PUBLICATION_LOCK_FILE_NAME = ".final-publish.lock";
const WORLD_PACKAGE_RELATIVE_PATH = "final/world-package";
const CAPTURE_RECEIPT_RELATIVE_PATH =
  "final/capture/formal-world-capture-receipt.json";
const EVALUATION_RELATIVE_PATH = "final/evaluation.json";
const LAUNCH_COMMAND =
  "pnpm worldkit native run final/world-package --port 5174 --json";
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const PUBLICATION_INVALID_DIAGNOSTIC_CODE =
  "NBR_FINAL_ARTIFACT_PUBLICATION_INVALID";
const DIAGNOSTIC_CODE_PATTERN = /[A-Z][A-Z0-9_]{4,}/g;

export interface NativeBlockReconstructionLaunchV1 {
  readonly kind: "native-block-reconstruction-launch";
  readonly schemaVersion: 1;
  readonly caseId: string;
  readonly runReceiptRef: string;
  readonly runReceiptHash: Sha256HashV1;
  readonly worldPackageRelativePath: typeof WORLD_PACKAGE_RELATIVE_PATH;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly captureReceiptRelativePath: typeof CAPTURE_RECEIPT_RELATIVE_PATH;
  readonly captureReceiptHash: Sha256HashV1;
  readonly evaluationRelativePath: typeof EVALUATION_RELATIVE_PATH;
  readonly evaluationHash: Sha256HashV1;
  readonly launchCommand: typeof LAUNCH_COMMAND;
}

export interface PublishNativeBlockReconstructionFinalInputV1 {
  readonly caseDirectoryPath: string;
  readonly runDirectoryPath: string;
  readonly launch: NativeBlockReconstructionLaunchV1;
  readonly playability: NativeBlockReconstructionPlayabilityLaunchPortV1;
}

export interface NativeBlockFinalArtifactPublicationV1 {
  readonly outcome: "published";
  readonly finalDirectoryPath: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly captureReceiptHash: Sha256HashV1;
  readonly evaluationHash: Sha256HashV1;
}

export class NativeBlockFinalArtifactPublicationClosedErrorV1 extends Error {
  readonly diagnosticCodes: readonly string[];
  readonly cleanupOutcome: "completed" | "failed" | "not-started";

  constructor(
    diagnosticCodes: readonly string[],
    cleanupOutcome: "completed" | "failed" | "not-started",
    cause?: unknown,
  ) {
    const codes = Object.freeze([
      PUBLICATION_INVALID_DIAGNOSTIC_CODE,
      ...diagnosticCodes.filter((code) =>
        code !== PUBLICATION_INVALID_DIAGNOSTIC_CODE
      ),
    ].filter((code, index, values) => values.indexOf(code) === index));
    const causeMessage = cause instanceof Error ? cause.message : undefined;
    const detail = causeMessage?.startsWith(PUBLICATION_INVALID_DIAGNOSTIC_CODE)
      ? causeMessage.slice(PUBLICATION_INVALID_DIAGNOSTIC_CODE.length)
        .replace(/^:\s*/, "")
      : causeMessage;
    super(
      `${PUBLICATION_INVALID_DIAGNOSTIC_CODE}${
        detail === undefined || detail.length === 0 ? "" : `: ${detail}`
      }`,
      { cause },
    );
    this.name = "NativeBlockFinalArtifactPublicationClosedErrorV1";
    this.diagnosticCodes = codes;
    this.cleanupOutcome = cleanupOutcome;
  }
}

interface PublisherHooksV1 {
  readonly beforeSync?: (
    absolutePath: string,
    phase: "staging" | "publication",
  ) => void | Promise<void>;
  readonly beforeFinalExistenceCheck?: (
    finalDirectoryPath: string,
  ) => void | Promise<void>;
}

interface TreeSnapshotV1 {
  readonly filesByRelativePath: ReadonlyMap<string, Sha256HashV1>;
  readonly directoryPaths: readonly string[];
}

function invalid(detail: string, cause?: unknown): never {
  throw new Error(
    `${PUBLICATION_INVALID_DIAGNOSTIC_CODE}: ${detail}`,
    { cause },
  );
}

function diagnosticCodesFromError(error: unknown): readonly string[] {
  const diagnosticCodes: string[] = [];
  const collect = (candidate: unknown): void => {
    if (candidate instanceof NativeBlockFinalArtifactPublicationClosedErrorV1) {
      diagnosticCodes.push(...candidate.diagnosticCodes);
    }
    if (candidate instanceof AggregateError) {
      for (const nested of candidate.errors) collect(nested);
    }
    if (candidate instanceof Error) {
      diagnosticCodes.push(...(candidate.message.match(DIAGNOSTIC_CODE_PATTERN) ?? []));
      collect(candidate.cause);
    }
  };
  collect(error);
  return Object.freeze(diagnosticCodes.filter(
    (code, index, values) => values.indexOf(code) === index,
  ));
}

function exact(actual: unknown, expected: unknown, detail: string): void {
  if (actual !== expected) invalid(detail);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function lstatOrMissing(absolutePath: string) {
  try {
    return await lstat(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function requireCanonicalDirectory(
  directoryPath: string,
  label: string,
): Promise<string> {
  if (
    !path.isAbsolute(directoryPath) ||
    path.normalize(directoryPath) !== directoryPath ||
    path.parse(directoryPath).root === directoryPath
  ) invalid(`${label} must be a normalized absolute non-root path`);
  const info = await lstatOrMissing(directoryPath);
  if (info === undefined || info.isSymbolicLink() || !info.isDirectory()) {
    invalid(`${label} must be a real directory`);
  }
  if (await realpath(directoryPath) !== directoryPath) {
    invalid(`${label} must not resolve through a symbolic link`);
  }
  return directoryPath;
}

async function requiredRegularFile(
  root: string,
  relativePath: string,
): Promise<Uint8Array> {
  const absolutePath = path.join(root, ...relativePath.split("/"));
  if (!isInside(root, absolutePath)) invalid("artifact path escaped its owner");
  const info = await lstatOrMissing(absolutePath);
  if (info === undefined || info.isSymbolicLink() || !info.isFile()) {
    invalid(`required artifact '${relativePath}' is missing or not a regular file`);
  }
  if (await realpath(absolutePath) !== absolutePath) {
    invalid(`required artifact '${relativePath}' resolves through a symbolic link`);
  }
  return new Uint8Array(await readFile(absolutePath));
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    return invalid(`${label} is not valid JSON`, error);
  }
}

function parseLaunch(value: unknown): NativeBlockReconstructionLaunchV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid("launch identity is not an object");
  }
  const source = value as Record<string, unknown>;
  const expectedFields = [
    "kind", "schemaVersion", "caseId", "runReceiptRef", "runReceiptHash",
    "worldPackageRelativePath", "worldPackageRef", "worldPackageRootHash",
    "captureReceiptRelativePath", "captureReceiptHash",
    "evaluationRelativePath", "evaluationHash", "launchCommand",
  ].sort();
  const fields = Object.keys(source).sort();
  if (
    fields.length !== expectedFields.length ||
    fields.some((field, index) => field !== expectedFields[index])
  ) invalid("launch identity fields do not match the closed contract");
  for (const field of [
    "caseId", "runReceiptRef", "runReceiptHash", "worldPackageRef",
    "worldPackageRootHash", "captureReceiptHash", "evaluationHash",
  ] as const) {
    if (typeof source[field] !== "string" || source[field].length === 0) {
      invalid(`launch identity '${field}' is invalid`);
    }
  }
  for (const field of [
    "runReceiptHash", "worldPackageRootHash", "captureReceiptHash",
    "evaluationHash",
  ] as const) {
    if (!SHA256_PATTERN.test(source[field] as string)) {
      invalid(`launch identity '${field}' is not a SHA-256 hash`);
    }
  }
  exact(source.kind, "native-block-reconstruction-launch", "launch kind is stale");
  exact(source.schemaVersion, 1, "launch schemaVersion is stale");
  exact(source.worldPackageRelativePath, WORLD_PACKAGE_RELATIVE_PATH,
    "launch Package path is stale");
  exact(source.captureReceiptRelativePath, CAPTURE_RECEIPT_RELATIVE_PATH,
    "launch Capture path is stale");
  exact(source.evaluationRelativePath, EVALUATION_RELATIVE_PATH,
    "launch Evaluation path is stale");
  exact(source.launchCommand, LAUNCH_COMMAND, "launch command is stale");
  return Object.freeze(source as unknown as NativeBlockReconstructionLaunchV1);
}

async function snapshotTree(root: string): Promise<TreeSnapshotV1> {
  const files = new Map<string, Sha256HashV1>();
  const directories: string[] = [""];
  const visit = async (relativeDirectory: string): Promise<void> => {
    const directoryPath = relativeDirectory.length === 0
      ? root
      : path.join(root, ...relativeDirectory.split("/"));
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(root, ...relativePath.split("/"));
      if (entry.isSymbolicLink()) invalid(`symbolic link '${relativePath}' is forbidden`);
      if (entry.isDirectory()) {
        if (await realpath(absolutePath) !== absolutePath) {
          invalid(`directory '${relativePath}' resolves through a symbolic link`);
        }
        directories.push(relativePath);
        await visit(relativePath);
      } else if (entry.isFile()) {
        files.set(
          relativePath,
          sha256Bytes(new Uint8Array(await readFile(absolutePath))) as Sha256HashV1,
        );
      } else {
        invalid(`non-file artifact '${relativePath}' is forbidden`);
      }
    }
  };
  await visit("");
  return Object.freeze({
    filesByRelativePath: files,
    directoryPaths: Object.freeze(directories),
  });
}

function assertTreeEqual(
  actual: TreeSnapshotV1,
  expected: TreeSnapshotV1,
  label: string,
): void {
  const actualPaths = [...actual.filesByRelativePath.keys()].sort();
  const expectedPaths = [...expected.filesByRelativePath.keys()].sort();
  const actualDirectories = [...actual.directoryPaths].sort();
  const expectedDirectories = [...expected.directoryPaths].sort();
  if (
    actualDirectories.length !== expectedDirectories.length ||
    actualDirectories.some((value, index) =>
      value !== expectedDirectories[index]) ||
    actualPaths.length !== expectedPaths.length ||
    actualPaths.some((value, index) => value !== expectedPaths[index]) ||
    actualPaths.some((value) =>
      actual.filesByRelativePath.get(value) !==
        expected.filesByRelativePath.get(value))
  ) invalid(`${label} bytes changed during publication`);
}

function assertCaptureInventory(
  snapshot: TreeSnapshotV1,
  viewIds: readonly string[],
): void {
  const expected = [
    ...viewIds.map((viewId) => `${viewId}.png`),
    "collider-overlay.png",
    "opening-observation.json",
    "spawn-support-observation.json",
    "collider-overlay-observation.json",
    "scripted-traversal.json",
    "formal-world-capture-receipt.json",
  ].sort();
  const actual = [...snapshot.filesByRelativePath.keys()].sort();
  if (
    snapshot.directoryPaths.length !== 1 ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) invalid("Capture artifact inventory is partial or foreign");
}

async function copyTree(sourceRoot: string, destinationRoot: string): Promise<void> {
  const snapshot = await snapshotTree(sourceRoot);
  await mkdir(destinationRoot, { mode: 0o700 });
  const directories = snapshot.directoryPaths
    .filter((relativePath) => relativePath.length > 0)
    .sort((left, right) => left.split("/").length - right.split("/").length);
  for (const relativePath of directories) {
    await mkdir(path.join(destinationRoot, ...relativePath.split("/")), {
      mode: 0o700,
    });
  }
  for (const relativePath of [...snapshot.filesByRelativePath.keys()].sort()) {
    const sourcePath = path.join(sourceRoot, ...relativePath.split("/"));
    const destinationPath = path.join(destinationRoot, ...relativePath.split("/"));
    const bytes = await requiredRegularFile(sourceRoot, relativePath);
    const handle = await open(destinationPath, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    exact(
      sha256Bytes(new Uint8Array(await readFile(destinationPath))),
      snapshot.filesByRelativePath.get(relativePath),
      `copied artifact '${relativePath}' changed`,
    );
    exact(
      sha256Bytes(new Uint8Array(await readFile(sourcePath))),
      snapshot.filesByRelativePath.get(relativePath),
      `source artifact '${relativePath}' changed`,
    );
  }
}

async function syncPath(
  absolutePath: string,
  phase: "staging" | "publication",
  hooks: PublisherHooksV1,
): Promise<void> {
  await hooks.beforeSync?.(absolutePath, phase);
  const handle = await open(absolutePath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncTree(root: string, hooks: PublisherHooksV1): Promise<void> {
  const snapshot = await snapshotTree(root);
  for (const relativePath of [...snapshot.filesByRelativePath.keys()].sort()) {
    await syncPath(path.join(root, ...relativePath.split("/")), "staging", hooks);
  }
  for (const relativePath of [...snapshot.directoryPaths].sort((left, right) =>
    right.split("/").length - left.split("/").length)) {
    await syncPath(
      relativePath.length === 0
        ? root
        : path.join(root, ...relativePath.split("/")),
      "staging",
      hooks,
    );
  }
}

async function publish(
  rawInput: PublishNativeBlockReconstructionFinalInputV1,
  hooks: PublisherHooksV1,
): Promise<NativeBlockFinalArtifactPublicationV1> {
  let stagingOwned = false;
  let finalOwned = false;
  let publicationLockOwned = false;
  let publicationResourceAllocated = false;
  let publicationLockFilePath: string | undefined;
  let caseDirectoryPath: string | undefined;
  let finalDirectoryPath: string | undefined;
  let stagingDirectoryPath: string | undefined;
  try {
    caseDirectoryPath = await requireCanonicalDirectory(
      rawInput.caseDirectoryPath,
      "Case directory",
    );
    const runDirectoryPath = await requireCanonicalDirectory(
      rawInput.runDirectoryPath,
      "Run directory",
    );
    if (path.dirname(runDirectoryPath) !== path.join(caseDirectoryPath, "runs")) {
      invalid("Run directory must be one direct child of the Case runs directory");
    }
    finalDirectoryPath = path.join(caseDirectoryPath, FINAL_DIRECTORY_NAME);
    stagingDirectoryPath = path.join(caseDirectoryPath, STAGING_DIRECTORY_NAME);
    publicationLockFilePath = path.join(
      caseDirectoryPath,
      PUBLICATION_LOCK_FILE_NAME,
    );
    const publicationLockHandle = await open(
      publicationLockFilePath,
      "wx",
      0o600,
    );
    publicationLockOwned = true;
    publicationResourceAllocated = true;
    try {
      await publicationLockHandle.sync();
    } finally {
      await publicationLockHandle.close();
    }
    await syncPath(caseDirectoryPath, "publication", hooks);
    if (
      await lstatOrMissing(finalDirectoryPath) !== undefined ||
      await lstatOrMissing(stagingDirectoryPath) !== undefined
    ) invalid("final or staging already exists");
    const runSnapshot = await snapshotTree(runDirectoryPath);

    const reconstructionCase = parseWorldReconstructionCaseV1(parseJson(
      await requiredRegularFile(caseDirectoryPath, "case.json"),
      "Case",
    ));
    const runReceiptBytes = await requiredRegularFile(
      runDirectoryPath,
      "run-receipt.json",
    );
    const runReceipt = parseWorldReconstructionRunReceiptV1(parseJson(
      runReceiptBytes,
      "Run Receipt",
    ));
    if (runReceipt.outcome !== "passed" || runReceipt.cleanupOutcome !== "completed") {
      invalid("Run Receipt is not a completed passed run");
    }
    exact(
      runReceipt.caseRef,
      `artifact://world-reconstruction-case/${reconstructionCase.id}/case.json`,
      "Run Receipt Case ref is foreign",
    );
    exact(runReceipt.caseHash, hashWorldReconstructionCaseV1(reconstructionCase),
      "Run Receipt Case identity is stale");
    const finalAttempt = runReceipt.attempts[runReceipt.finalAttemptIndex]!;
    if (finalAttempt.outcome !== "passed") invalid("terminal Attempt did not pass");
    const attemptRoot = path.join(
      runDirectoryPath,
      `attempts/${finalAttempt.attemptIndex}`,
    );
    await requireCanonicalDirectory(attemptRoot, "terminal Attempt directory");

    const packageRoot = await requireCanonicalDirectory(
      path.join(attemptRoot, "world-package"),
      "terminal WorldPackage directory",
    );
    const packageSnapshot = await snapshotTree(packageRoot);
    const verifiedPackage = verifyWorldPackageDirectoryV1(
      await readWorldPackageDirectoryV1({
        packageDirectoryPath: packageRoot,
        maximumTotalBytes: 512_000_000,
        maximumFileCount: 10_000,
      }),
    );
    exact(verifiedPackage.receipt.worldPackageRef, finalAttempt.worldPackageRef,
      "terminal Package ref is stale");
    exact(verifiedPackage.receipt.worldPackageRootHash, finalAttempt.worldPackageRootHash,
      "terminal Package Root is stale");

    const captureRoot = await requireCanonicalDirectory(
      path.join(attemptRoot, "capture"),
      "terminal Capture directory",
    );
    const captureSnapshot = await snapshotTree(captureRoot);
    const captureReceipt = parseFormalWorldCaptureReceiptV1(parseJson(
      await requiredRegularFile(
        captureRoot,
        "formal-world-capture-receipt.json",
      ),
      "Capture Receipt",
    ));
    assertCaptureInventory(captureSnapshot, captureReceipt.views.map(({ viewId }) => viewId));
    const captureReceiptHash = hashFormalWorldCaptureReceiptV1(captureReceipt);
    exact(captureReceiptHash, finalAttempt.captureReceiptHash,
      "terminal Capture Receipt hash is stale");
    exact(captureReceipt.worldPackageRef, finalAttempt.worldPackageRef,
      "Capture Package ref is foreign");
    exact(captureReceipt.worldPackageRootHash, finalAttempt.worldPackageRootHash,
      "Capture Package Root is foreign");
    for (const view of captureReceipt.views) {
      exact(
        sha256Bytes(await requiredRegularFile(captureRoot, `${view.viewId}.png`)),
        view.pngContentHash,
        `Capture view '${view.viewId}' is stale`,
      );
    }
    exact(
      sha256Bytes(await requiredRegularFile(captureRoot, "collider-overlay.png")),
      captureReceipt.colliderOverlayPngContentHash,
      "Collider overlay PNG is stale",
    );
    const openingObservation = parseFormalOpeningObservationV1(parseJson(
      await requiredRegularFile(captureRoot, "opening-observation.json"),
      "opening-observation.json",
    ));
    exact(
      hashFormalOpeningObservationV1(openingObservation),
      captureReceipt.openingObservationContentHash,
      "Capture observation 'opening-observation.json' is stale",
    );
    const spawnSupportObservation = parseFormalSpawnSupportObservationV1(parseJson(
      await requiredRegularFile(captureRoot, "spawn-support-observation.json"),
      "spawn-support-observation.json",
    ));
    exact(
      hashFormalSpawnSupportObservationV1(spawnSupportObservation),
      captureReceipt.spawnSupportObservationContentHash,
      "Capture observation 'spawn-support-observation.json' is stale",
    );
    const colliderOverlayObservation = parseFormalColliderOverlayObservationV1(
      parseJson(
        await requiredRegularFile(
          captureRoot,
          "collider-overlay-observation.json",
        ),
        "collider-overlay-observation.json",
      ),
    );
    exact(
      hashFormalColliderOverlayObservationV1(colliderOverlayObservation),
      captureReceipt.colliderOverlayObservationContentHash,
      "Capture observation 'collider-overlay-observation.json' is stale",
    );
    const scriptedTraversalObservation = parseFormalScriptedTraversalObservationV1(
      parseJson(
        await requiredRegularFile(captureRoot, "scripted-traversal.json"),
        "scripted-traversal.json",
      ),
    );
    exact(
      hashFormalScriptedTraversalObservationV1(scriptedTraversalObservation),
      captureReceipt.scriptedTraversalContentHash,
      "Capture observation 'scripted-traversal.json' is stale",
    );

    const evaluationBytes = await requiredRegularFile(attemptRoot, "evaluation.json");
    const evaluation = parseWorldReconstructionEvaluationResultV1(parseJson(
      evaluationBytes,
      "Evaluation",
    ));
    const evaluationHash = hashWorldReconstructionEvaluationResultV1(evaluation);
    exact(evaluationHash, finalAttempt.evaluationResultHash,
      "terminal Evaluation hash is stale");
    exact(evaluation.outcome, "passed", "terminal Evaluation did not pass");
    exact(evaluation.caseHash, runReceipt.caseHash, "Evaluation Case is foreign");
    exact(evaluation.worldPackageRef, finalAttempt.worldPackageRef,
      "Evaluation Package ref is foreign");
    exact(evaluation.worldPackageRootHash, finalAttempt.worldPackageRootHash,
      "Evaluation Package Root is foreign");
    exact(evaluation.captureReceiptHash, finalAttempt.captureReceiptHash,
      "Evaluation Capture is foreign");

    const launch = parseLaunch(rawInput.launch);
    exact(launch.caseId, reconstructionCase.id, "launch Case is foreign");
    exact(launch.runReceiptHash, sha256CanonicalJson(runReceipt),
      "launch Run Receipt is stale");
    const caseRefSuffix = "/case.json";
    exact(
      launch.runReceiptRef,
      `${runReceipt.caseRef.slice(0, -caseRefSuffix.length)}/runs/${
        path.basename(runDirectoryPath)
      }/run-receipt.json`,
      "launch Run Receipt ref is foreign",
    );
    exact(launch.worldPackageRef, finalAttempt.worldPackageRef,
      "launch Package ref is foreign");
    exact(launch.worldPackageRootHash, finalAttempt.worldPackageRootHash,
      "launch Package Root is stale");
    exact(launch.captureReceiptHash, finalAttempt.captureReceiptHash,
      "launch Capture is stale");
    exact(launch.evaluationHash, finalAttempt.evaluationResultHash,
      "launch Evaluation is stale");

    await mkdir(stagingDirectoryPath, { mode: 0o700 });
    stagingOwned = true;
    await copyTree(packageRoot, path.join(stagingDirectoryPath, "world-package"));
    await copyTree(captureRoot, path.join(stagingDirectoryPath, "capture"));
    const stagedEvaluationHandle = await open(
      path.join(stagingDirectoryPath, "evaluation.json"),
      "wx",
      0o600,
    );
    try {
      await stagedEvaluationHandle.writeFile(evaluationBytes);
      await stagedEvaluationHandle.sync();
    } finally {
      await stagedEvaluationHandle.close();
    }
    const launchBytes = new TextEncoder().encode(
      `${stringifyCanonicalJson(launch)}\n`,
    );
    const launchHandle = await open(
      path.join(stagingDirectoryPath, "launch.json"),
      "wx",
      0o600,
    );
    try {
      await launchHandle.writeFile(launchBytes);
      await launchHandle.sync();
    } finally {
      await launchHandle.close();
    }

    assertTreeEqual(await snapshotTree(packageRoot), packageSnapshot,
      "terminal Package source");
    assertTreeEqual(await snapshotTree(captureRoot), captureSnapshot,
      "terminal Capture source");
    assertTreeEqual(
      await snapshotTree(path.join(stagingDirectoryPath, "world-package")),
      packageSnapshot,
      "staged Package",
    );
    assertTreeEqual(
      await snapshotTree(path.join(stagingDirectoryPath, "capture")),
      captureSnapshot,
      "staged Capture",
    );
    exact(
      sha256Bytes(await requiredRegularFile(stagingDirectoryPath, "evaluation.json")),
      sha256Bytes(evaluationBytes),
      "staged Evaluation bytes changed",
    );
    exact(
      sha256Bytes(await requiredRegularFile(runDirectoryPath, "run-receipt.json")),
      sha256Bytes(runReceiptBytes),
      "Run Receipt changed during publication",
    );
    await syncTree(stagingDirectoryPath, hooks);
    const stagedSnapshot = await snapshotTree(stagingDirectoryPath);
    const formalVerification = await verifyNativeBlockReconstructionE2EV1({
      candidate: {
        kind: "final",
        runDirectoryPath,
        finalDirectoryPath: stagingDirectoryPath,
      },
      playability: rawInput.playability,
    });
    exact(formalVerification.outcome, "verified",
      "formal Final verification did not pass");
    exact(formalVerification.candidateKind, "final",
      "formal verifier used the wrong candidate mode");
    exact(formalVerification.attemptIndex, finalAttempt.attemptIndex,
      "formal verifier selected a stale Attempt");
    exact(formalVerification.worldPackageRef, finalAttempt.worldPackageRef,
      "formal verifier selected a foreign Package");
    exact(formalVerification.worldPackageRootHash, finalAttempt.worldPackageRootHash,
      "formal verifier selected a stale Package Root");
    exact(formalVerification.worldBuildIdentityHash,
      finalAttempt.worldBuildIdentityHash,
      "formal verifier selected a stale World Build identity");
    exact(formalVerification.captureReceiptHash, finalAttempt.captureReceiptHash,
      "formal verifier selected a stale Capture");
    exact(formalVerification.evaluationResultHash,
      finalAttempt.evaluationResultHash,
      "formal verifier selected a stale Evaluation");
    assertTreeEqual(
      await snapshotTree(stagingDirectoryPath),
      stagedSnapshot,
      "staged Final verifier input",
    );
    exact(
      sha256Bytes(await requiredRegularFile(attemptRoot, "evaluation.json")),
      sha256Bytes(evaluationBytes),
      "terminal Evaluation source changed during publication",
    );
    assertTreeEqual(
      await snapshotTree(runDirectoryPath),
      runSnapshot,
      "immutable Run source",
    );
    await syncTree(stagingDirectoryPath, hooks);
    await hooks.beforeFinalExistenceCheck?.(finalDirectoryPath);
    if (await lstatOrMissing(finalDirectoryPath) !== undefined) {
      invalid("final appeared during publication");
    }
    await rename(stagingDirectoryPath, finalDirectoryPath);
    stagingOwned = false;
    finalOwned = true;
    await syncPath(caseDirectoryPath, "publication", hooks);
    await unlink(publicationLockFilePath);
    publicationLockOwned = false;
    await syncPath(caseDirectoryPath, "publication", hooks);
    return Object.freeze({
      outcome: "published",
      finalDirectoryPath,
      worldPackageRootHash: finalAttempt.worldPackageRootHash,
      captureReceiptHash,
      evaluationHash,
    });
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    if (finalOwned && finalDirectoryPath !== undefined) {
      try {
        await rm(finalDirectoryPath, { recursive: true, force: true });
        finalOwned = false;
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (stagingOwned && stagingDirectoryPath !== undefined) {
      try {
        await rm(stagingDirectoryPath, { recursive: true, force: true });
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (publicationLockOwned && publicationLockFilePath !== undefined) {
      try {
        await unlink(publicationLockFilePath);
        publicationLockOwned = false;
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (caseDirectoryPath !== undefined) {
      try {
        await syncPath(caseDirectoryPath, "publication", hooks);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length > 0) {
      const cleanupFailure = new AggregateError(
        [error, ...cleanupErrors],
        `${PUBLICATION_INVALID_DIAGNOSTIC_CODE}: owned cleanup failed`,
      );
      throw new NativeBlockFinalArtifactPublicationClosedErrorV1(
        diagnosticCodesFromError(cleanupFailure),
        "failed",
        cleanupFailure,
      );
    }
    throw new NativeBlockFinalArtifactPublicationClosedErrorV1(
      diagnosticCodesFromError(error),
      publicationResourceAllocated ? "completed" : "not-started",
      error,
    );
  }
}

export function publishNativeBlockReconstructionFinalV1(
  input: PublishNativeBlockReconstructionFinalInputV1,
): Promise<NativeBlockFinalArtifactPublicationV1> {
  return publish(input, {});
}

export function createNativeBlockFinalArtifactPublisherTestAdapterV1(
  hooks: PublisherHooksV1,
): (
  input: PublishNativeBlockReconstructionFinalInputV1,
) => Promise<NativeBlockFinalArtifactPublicationV1> {
  return (input) => publish(input, hooks);
}
