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
import { resolveHostAttemptArtifactV1 } from "./host-checkpoint.js";

import {
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  formalWorldCaptureIntentCanonicalBytesV1,
  hashFormalColliderOverlayObservationV1,
  hashFormalOpeningObservationV1,
  hashFormalScriptedTraversalObservationV1,
  hashFormalSpawnSupportObservationV1,
  hashFormalWorldCaptureIntentV1,
  hashFormalWorldCaptureReceiptV1,
  parseFormalColliderOverlayObservationV1,
  parseFormalOpeningObservationV1,
  parseFormalSemanticViewObservationSetV1,
  assertFormalSemanticViewObservationSetMatchesReceiptV1,
  parseFormalScriptedTraversalObservationV1,
  parseFormalSpawnSupportObservationV1,
  parseFormalWorldCaptureIntentV1,
  parseFormalWorldCaptureReceiptV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashWorldReconstructionCaseV1,
  hashWorldReconstructionEvaluationProfileV1,
  hashWorldReconstructionEvaluationResultV1,
  hashWorldReconstructionStrictDiagnosticReceiptV1,
  parseWorldReconstructionCaseV1,
  parseWorldReconstructionEvaluationProfileV1,
  parseWorldReconstructionEvaluationResultV1,
  parseWorldReconstructionRunReceiptV1,
  parseWorldReconstructionStrictDiagnosticReceiptV1,
} from "@whitebox-world/validation";
import { verifyWorldPackageDirectoryV1 } from "@whitebox-world/world-package";

import { readWorldPackageDirectoryV1 } from "../lib/file-world-package.js";
import { NATIVE_WORLD_PLANNER_REFERENCE_INPUTS_V1 } from "./native-world-case-preparation.js";
import {
  nativeWorldReferenceMediaTypeV1,
  validateNativeWorldReferenceImageV1,
} from "./native-world-reference-media.js";
import { verifyPassedGroundAnalysisReportV1 } from
  "./passed-ground-analysis-report.js";
import {
  entryThirdPersonValidationResultCanonicalBytesV1,
  hashEntryThirdPersonValidationResultV1,
  validateFormalOpeningEntryThirdPersonV1,
} from "../visual/entry-third-person.js";
const FINAL_DIRECTORY_NAME = "final";
const STAGING_DIRECTORY_NAME = ".final-staging";
const PUBLICATION_LOCK_FILE_NAME = ".final-publish.lock";
const WORLD_PACKAGE_RELATIVE_PATH = "final/world-package";
const CAPTURE_RECEIPT_RELATIVE_PATH =
  "final/capture/formal-world-capture-receipt.json";
const EVALUATION_RELATIVE_PATH = "final/evaluation.json";
const STRICT_DIAGNOSTIC_RELATIVE_PATH = "final/strict-diagnostic.json";
const ENTRY_VALIDATION_RELATIVE_PATH =
  "final/entry-third-person-validation.json";
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
  readonly strictDiagnosticRelativePath: typeof STRICT_DIAGNOSTIC_RELATIVE_PATH;
  readonly strictDiagnosticHash: Sha256HashV1;
  readonly entryValidationRelativePath: typeof ENTRY_VALIDATION_RELATIVE_PATH;
  readonly entryValidationHash: Sha256HashV1;
  readonly launchCommand: typeof LAUNCH_COMMAND;
}

export interface PublishNativeBlockReconstructionFinalInputV1 {
  readonly caseDirectoryPath: string;
  readonly runDirectoryPath: string;
  readonly launch: NativeBlockReconstructionLaunchV1;
}

export interface NativeBlockFinalArtifactPublicationV1 {
  readonly outcome: "published";
  readonly finalDirectoryPath: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly captureReceiptHash: Sha256HashV1;
  readonly evaluationHash: Sha256HashV1;
  readonly strictDiagnosticHash: Sha256HashV1;
  readonly entryValidationHash: Sha256HashV1;
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

interface CaseOwnerInputSnapshotV1 {
  readonly filesByRelativePath: ReadonlyMap<string, Sha256HashV1>;
}

const LOCAL_SCENE_BRIEF_REF = "scene-brief.md";
const REQUIRED_LOCAL_REFERENCE_INPUTS: ReadonlyMap<
  string,
  "image/png" | "application/json"
> = Object.freeze(new Map(NATIVE_WORLD_PLANNER_REFERENCE_INPUTS_V1.map(
  ({ inputRef, mediaType }) => [inputRef, mediaType],
)));
const LOCAL_REFERENCE_INPUT_PATTERN = /^reference-(0|[1-9][0-9]*)\.(png|jpg|webp)$/;
const ABSOLUTE_RESOURCE_REF_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//;
const NON_CASE_OWNER_INPUT_PATHS = Object.freeze(new Set([
  "block-profile.json",
  "builder-skill/SKILL.md",
  "builder-skill/references/native-block-output-contract.md",
  "builder-skill/scripts/render-visual-review.mjs",
  "builder-skill/scripts/self-check.mjs",
  "formal-world-capture-intent.json",
  "native-scene-api.json",
  "native-scene-profile.json",
  "task-instruction.md",
  "world-bounds.json",
]));
const NON_CASE_OWNER_INPUT_DIRECTORIES = Object.freeze(new Set([
  "",
  "builder-skill",
  "builder-skill/references",
  "builder-skill/scripts",
]));

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

function localCaseInputRelativePath(
  ref: string,
  label: string,
): string | undefined {
  if (ABSOLUTE_RESOURCE_REF_PATTERN.test(ref)) return undefined;
  if (
    ref.length === 0 ||
    path.isAbsolute(ref) ||
    ref.includes("\\") ||
    path.posix.normalize(ref) !== ref ||
    ref === "." ||
    ref === ".." ||
    ref.startsWith("../") ||
    ref.includes("/")
  ) invalid(`${label} is not a confined Case input ref`);
  return ref;
}

async function assertReferenceMedia(
  bytes: Uint8Array,
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "application/json",
  inputRef: string,
): Promise<void> {
  if (mediaType !== "application/json") {
    try {
      await validateNativeWorldReferenceImageV1(bytes, mediaType);
    } catch {
      invalid(`Case reference input '${inputRef}' media does not match ${mediaType}`);
    }
    return;
  }
  parseJson(bytes, `Case reference input '${inputRef}'`);
}

async function readVerifiedCaseOwnerInput(
  caseInputsRoot: string,
  relativePath: string,
  expectedHash: Sha256HashV1,
  mediaType?: "image/png" | "image/jpeg" | "image/webp" | "application/json",
): Promise<readonly [string, Sha256HashV1]> {
  const bytes = await requiredRegularFile(caseInputsRoot, relativePath);
  if (mediaType !== undefined) {
    await assertReferenceMedia(bytes, mediaType, relativePath);
  }
  const contentHash = sha256Bytes(bytes) as Sha256HashV1;
  exact(
    contentHash,
    expectedHash,
    `Case owner input '${relativePath}' differs from its Case identity`,
  );
  return Object.freeze([relativePath, contentHash] as const);
}

async function assertNoUndeclaredLocalCaseOwnerPaths(
  caseInputsRoot: string,
  declaredRelativePaths: ReadonlySet<string>,
): Promise<void> {
  const inventory = await snapshotTree(caseInputsRoot);
  for (const relativePath of inventory.filesByRelativePath.keys()) {
    if (
      !declaredRelativePaths.has(relativePath) &&
      !NON_CASE_OWNER_INPUT_PATHS.has(relativePath)
    ) {
      invalid(`undeclared Case input path '${relativePath}' is forbidden`);
    }
  }
  for (const relativePath of inventory.directoryPaths) {
    if (!NON_CASE_OWNER_INPUT_DIRECTORIES.has(relativePath)) {
      invalid(`undeclared Case input directory '${relativePath}' is forbidden`);
    }
  }
}

export async function verifyNativeBlockCaseOwnerInputSnapshotV1(
  caseInputsRoot: string,
  reconstructionCase: ReturnType<typeof parseWorldReconstructionCaseV1>,
): Promise<CaseOwnerInputSnapshotV1> {
  const localSceneBriefRef = localCaseInputRelativePath(
    reconstructionCase.sceneBriefRef,
    "Case sceneBriefRef",
  );
  const localReferenceInputs = reconstructionCase.referenceInputs.map((row) => ({
    ...row,
    relativePath: localCaseInputRelativePath(
      row.inputRef,
      `Case reference input '${row.inputRef}'`,
    ),
  }));
  const localReferenceCount = localReferenceInputs.filter(
    ({ relativePath }) => relativePath !== undefined,
  ).length;
  if (
    (localSceneBriefRef === undefined && localReferenceCount !== 0) ||
    (localSceneBriefRef !== undefined &&
      localReferenceCount !== localReferenceInputs.length)
  ) invalid("Case owner input refs must be all local or all immutable resources");

  // Immutable resource refs are not files owned by this Case directory. Their
  // content hashes remain part of the Case identity, while no local bytes are
  // admitted or snapshotted for them.
  if (localSceneBriefRef === undefined) {
    const filesByRelativePath = new Map<string, Sha256HashV1>();
    await assertNoUndeclaredLocalCaseOwnerPaths(
      caseInputsRoot,
      new Set(filesByRelativePath.keys()),
    );
    return Object.freeze({ filesByRelativePath });
  }
  exact(
    localSceneBriefRef,
    LOCAL_SCENE_BRIEF_REF,
    "Case sceneBriefRef is not the current local owner path",
  );

  const rowsByRef = new Map(localReferenceInputs.map((row) => [
    row.relativePath!,
    row,
  ]));
  for (const [inputRef, mediaType] of REQUIRED_LOCAL_REFERENCE_INPUTS) {
    const row = rowsByRef.get(inputRef);
    if (row === undefined || row.mediaType !== mediaType) {
      invalid(`required Case reference input '${inputRef}' is missing or has stale media`);
    }
  }
  const uploadedReferenceIndexes: number[] = [];
  for (const row of localReferenceInputs) {
    const requiredMediaType = REQUIRED_LOCAL_REFERENCE_INPUTS.get(
      row.relativePath!,
    );
    if (requiredMediaType !== undefined) continue;
    const match = LOCAL_REFERENCE_INPUT_PATTERN.exec(row.relativePath!);
    if (match === null) {
      invalid(`extra Case reference input '${row.relativePath}' is forbidden`);
    }
    const expectedMediaType = nativeWorldReferenceMediaTypeV1(row.relativePath!);
    exact(
      row.mediaType,
      expectedMediaType,
      `Case reference input '${row.relativePath}' has stale media`,
    );
    uploadedReferenceIndexes.push(Number(match[1]));
  }
  uploadedReferenceIndexes.sort((left, right) => left - right);
  if (uploadedReferenceIndexes.some((value, index) => value !== index)) {
    invalid("Case uploaded reference input paths are not a contiguous inventory");
  }

  const verifiedEntries = await Promise.all([
    readVerifiedCaseOwnerInput(
      caseInputsRoot,
      localSceneBriefRef,
      reconstructionCase.sceneBriefHash,
    ),
    ...localReferenceInputs.map((row) => readVerifiedCaseOwnerInput(
      caseInputsRoot,
      row.relativePath!,
      row.contentHash,
      row.mediaType,
    )),
  ]);
  const filesByRelativePath = new Map(verifiedEntries);
  await assertNoUndeclaredLocalCaseOwnerPaths(
    caseInputsRoot,
    new Set(filesByRelativePath.keys()),
  );
  return Object.freeze({ filesByRelativePath });
}

function assertCaseOwnerInputSnapshotEqual(
  actual: CaseOwnerInputSnapshotV1,
  expected: CaseOwnerInputSnapshotV1,
): void {
  const actualPaths = [...actual.filesByRelativePath.keys()].sort();
  const expectedPaths = [...expected.filesByRelativePath.keys()].sort();
  if (
    actualPaths.length !== expectedPaths.length ||
    actualPaths.some((value, index) => value !== expectedPaths[index]) ||
    actualPaths.some((value) =>
      actual.filesByRelativePath.get(value) !==
        expected.filesByRelativePath.get(value))
  ) invalid("immutable Case owner-input source changed during publication");
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
    "evaluationRelativePath", "evaluationHash", "strictDiagnosticRelativePath",
    "strictDiagnosticHash", "entryValidationRelativePath",
    "entryValidationHash", "launchCommand",
  ].sort();
  const fields = Object.keys(source).sort();
  if (
    fields.length !== expectedFields.length ||
    fields.some((field, index) => field !== expectedFields[index])
  ) invalid("launch identity fields do not match the closed contract");
  for (const field of [
    "caseId", "runReceiptRef", "runReceiptHash", "worldPackageRef",
    "worldPackageRootHash", "captureReceiptHash", "evaluationHash",
    "strictDiagnosticHash", "entryValidationHash",
  ] as const) {
    if (typeof source[field] !== "string" || source[field].length === 0) {
      invalid(`launch identity '${field}' is invalid`);
    }
  }
  for (const field of [
    "runReceiptHash", "worldPackageRootHash", "captureReceiptHash",
    "evaluationHash", "strictDiagnosticHash", "entryValidationHash",
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
  exact(source.strictDiagnosticRelativePath, STRICT_DIAGNOSTIC_RELATIVE_PATH,
    "launch strict diagnostic path is stale");
  exact(source.entryValidationRelativePath, ENTRY_VALIDATION_RELATIVE_PATH,
    "launch entry validation path is stale");
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
    "semantic-view-observation-set.json",
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
    const caseInputsRoot = await requireCanonicalDirectory(
      path.join(caseDirectoryPath, "inputs"),
      "Case inputs directory",
    );
    const caseBytes = await requiredRegularFile(caseDirectoryPath, "case.json");
    const caseBytesHash = sha256Bytes(caseBytes) as Sha256HashV1;
    const reconstructionCase = parseWorldReconstructionCaseV1(parseJson(
      caseBytes,
      "Case",
    ));
    const caseOwnerInputAdmissionBefore =
      await verifyNativeBlockCaseOwnerInputSnapshotV1(
        caseInputsRoot,
        reconstructionCase,
      );
    const caseInputsSnapshot = await verifyNativeBlockCaseOwnerInputSnapshotV1(
      caseInputsRoot,
      reconstructionCase,
    );
    assertCaseOwnerInputSnapshotEqual(
      caseInputsSnapshot,
      caseOwnerInputAdmissionBefore,
    );
    const runReceiptBytes = await requiredRegularFile(
      runDirectoryPath,
      "run-receipt.json",
    );
    const runReceipt = parseWorldReconstructionRunReceiptV1(parseJson(
      runReceiptBytes,
      "Run Receipt",
    ));
    const frozenCaseBytes = await requiredRegularFile(
      runDirectoryPath,
      "inputs/case.json",
    );
    exact(
      sha256Bytes(frozenCaseBytes),
      caseBytesHash,
      "frozen Run Case differs from the Case owner snapshot",
    );
    const evaluationProfileOwnerBytes = await requiredRegularFile(
      caseDirectoryPath,
      "evaluation-profile.json",
    );
    const evaluationProfile = parseWorldReconstructionEvaluationProfileV1(
      parseJson(evaluationProfileOwnerBytes, "Evaluation Profile"),
    );
    const evaluationProfileOwnerBytesHash = sha256Bytes(
      evaluationProfileOwnerBytes,
    ) as Sha256HashV1;
    const evaluationProfileHash =
      hashWorldReconstructionEvaluationProfileV1(evaluationProfile);
    exact(
      evaluationProfileHash,
      reconstructionCase.evaluationProfileHash,
      "Evaluation Profile differs from the Case owner identity",
    );
    exact(
      evaluationProfileHash,
      runReceipt.evaluationProfileHash,
      "Evaluation Profile differs from the Run owner identity",
    );
    exact(
      runReceipt.evaluationProfileRef,
      reconstructionCase.evaluationProfileRef,
      "Run Evaluation Profile ref is foreign",
    );
    exact(
      sha256Bytes(await requiredRegularFile(
        runDirectoryPath,
        "inputs/evaluation-profile.json",
      )),
      evaluationProfileOwnerBytesHash,
      "frozen Run Evaluation Profile differs from the Case owner snapshot",
    );
    const formalCaptureIntentOwnerBytes = await requiredRegularFile(
      caseDirectoryPath,
      reconstructionCase.formalCaptureIntentRef,
    );
    const formalCaptureIntent = parseFormalWorldCaptureIntentV1(
      parseJson(formalCaptureIntentOwnerBytes, "Formal Capture Intent"),
    );
    const formalCaptureIntentOwnerBytesHash = sha256Bytes(
      formalCaptureIntentOwnerBytes,
    ) as Sha256HashV1;
    exact(
      Buffer.from(formalCaptureIntentOwnerBytes).equals(Buffer.from(
        formalWorldCaptureIntentCanonicalBytesV1(formalCaptureIntent),
      )),
      true,
      "Formal Capture Intent is not canonical",
    );
    exact(
      hashFormalWorldCaptureIntentV1(formalCaptureIntent),
      reconstructionCase.formalCaptureIntentHash,
      "Formal Capture Intent differs from the Case owner identity",
    );
    exact(
      sha256Bytes(await requiredRegularFile(
        runDirectoryPath,
        reconstructionCase.formalCaptureIntentRef,
      )),
      formalCaptureIntentOwnerBytesHash,
      "frozen Run Formal Capture Intent differs from the Case owner snapshot",
    );
    if (runReceipt.cleanupOutcome !== "completed") {
      invalid("Run Receipt cleanup is not complete");
    }
    exact(
      runReceipt.caseRef,
      `artifact://world-reconstruction-case/${reconstructionCase.id}/case.json`,
      "Run Receipt Case ref is foreign",
    );
    exact(runReceipt.caseHash, hashWorldReconstructionCaseV1(reconstructionCase),
      "Run Receipt Case identity is stale");
    const finalAttempt = runReceipt.attempts[runReceipt.finalAttemptIndex]!;
    if (finalAttempt.kind !== "evaluated") {
      invalid("terminal Attempt did not reach Evaluation");
    }
    const attemptRoot = path.join(
      runDirectoryPath,
      `attempts/${finalAttempt.attemptIndex}`,
    );
    await requireCanonicalDirectory(attemptRoot, "terminal Attempt directory");
    const runArtifactRoot = runReceipt.caseRef.slice(0, -"/case.json".length);
    const hostArtifact = (artifactRef: string, fileName: string) => resolveHostAttemptArtifactV1({
      runRoot: runDirectoryPath, caseRef: runReceipt.caseRef, attemptIndex: finalAttempt.attemptIndex,
      artifactRef, fileName,
    });
    const packageStageRoot = path.dirname(hostArtifact(finalAttempt.sceneAuthoringAttemptResultRef, "attempt-result.json"));
    const evaluationStageRoot = path.dirname(hostArtifact(finalAttempt.evaluationResultRef, "evaluation.json"));
    verifyPassedGroundAnalysisReportV1({
      reportBytes: await requiredRegularFile(
        packageStageRoot,
        "ground-analysis-report.json",
      ),
      reportRef: finalAttempt.groundAnalysisReportRef,
      expectedReportRef: `${runArtifactRoot}/${path.relative(path.dirname(path.dirname(runDirectoryPath)), packageStageRoot).split(path.sep).join("/")}/ground-analysis-report.json`,
      reportHash: finalAttempt.groundAnalysisReportHash,
      expectedCaseHash: runReceipt.caseHash,
      expectedWorldPackageRootHash: finalAttempt.worldPackageRootHash,
    });

    const packageRoot = await requireCanonicalDirectory(
      path.join(packageStageRoot, "world-package"),
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
      path.dirname(hostArtifact(finalAttempt.captureReceiptRef, "capture/formal-world-capture-receipt.json")),
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
    const entryValidation = await validateFormalOpeningEntryThirdPersonV1({
      openingPngBytes: await requiredRegularFile(captureRoot, "opening.png"),
      openingObservation,
    });
    const semanticViewObservationSet = parseFormalSemanticViewObservationSetV1(parseJson(
      await requiredRegularFile(captureRoot, "semantic-view-observation-set.json"),
      "semantic-view-observation-set.json",
    ));
    assertFormalSemanticViewObservationSetMatchesReceiptV1({ observationSet: semanticViewObservationSet,
      receipt: captureReceipt, openingObservation });
    if (entryValidation.status !== "passed") {
      invalid(
        `terminal entry validation failed: ${entryValidation.diagnostics
          .map(({ code }) => code).join(",")}`,
      );
    }
    const entryValidationBytes =
      entryThirdPersonValidationResultCanonicalBytesV1(entryValidation);
    const entryValidationHash =
      hashEntryThirdPersonValidationResultV1(entryValidation);
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

    const evaluationBytes = await requiredRegularFile(evaluationStageRoot, "evaluation.json");
    const evaluation = parseWorldReconstructionEvaluationResultV1(parseJson(
      evaluationBytes,
      "Evaluation",
    ));
    const evaluationHash = hashWorldReconstructionEvaluationResultV1(evaluation);
    exact(evaluationHash, finalAttempt.evaluationResultHash,
      "terminal Evaluation hash is stale");
    exact(evaluation.caseHash, runReceipt.caseHash, "Evaluation Case is foreign");
    exact(evaluation.worldPackageRef, finalAttempt.worldPackageRef,
      "Evaluation Package ref is foreign");
    exact(evaluation.worldPackageRootHash, finalAttempt.worldPackageRootHash,
      "Evaluation Package Root is foreign");
    exact(evaluation.captureReceiptHash, finalAttempt.captureReceiptHash,
      "Evaluation Capture is foreign");

    const strictDiagnosticBytes = await requiredRegularFile(
      runDirectoryPath,
      "strict-diagnostic.json",
    );
    const strictDiagnostic = parseWorldReconstructionStrictDiagnosticReceiptV1(
      parseJson(strictDiagnosticBytes, "Strict Diagnostic Receipt"),
    );
    const strictDiagnosticHash =
      hashWorldReconstructionStrictDiagnosticReceiptV1(strictDiagnostic);
    exact(strictDiagnostic.caseRef, runReceipt.caseRef,
      "Strict Diagnostic Case is foreign");
    exact(strictDiagnostic.caseHash, runReceipt.caseHash,
      "Strict Diagnostic Case identity is stale");
    exact(strictDiagnostic.runReceiptHash, sha256CanonicalJson(runReceipt),
      "Strict Diagnostic Run Receipt is stale");
    const caseRefSuffix = "/case.json";
    const expectedRunReceiptRef =
      `${runReceipt.caseRef.slice(0, -caseRefSuffix.length)}/runs/${
        path.basename(runDirectoryPath)
      }/run-receipt.json`;
    exact(strictDiagnostic.runReceiptRef, expectedRunReceiptRef,
      "Strict Diagnostic Run Receipt ref is foreign");
    exact(strictDiagnostic.attemptIndex, finalAttempt.attemptIndex,
      "Strict Diagnostic selected a stale Attempt");
    exact(strictDiagnostic.worldPackageRef, finalAttempt.worldPackageRef,
      "Strict Diagnostic Package is foreign");
    exact(strictDiagnostic.worldPackageRootHash, finalAttempt.worldPackageRootHash,
      "Strict Diagnostic Package Root is stale");
    exact(strictDiagnostic.worldBuildIdentityHash,
      finalAttempt.worldBuildIdentityHash,
      "Strict Diagnostic World Build identity is stale");
    exact(strictDiagnostic.captureReceiptHash, finalAttempt.captureReceiptHash,
      "Strict Diagnostic Capture is stale");
    exact(strictDiagnostic.evaluationResultHash,
      finalAttempt.evaluationResultHash,
      "Strict Diagnostic Evaluation is stale");

    const launch = parseLaunch(rawInput.launch);
    exact(launch.caseId, reconstructionCase.id, "launch Case is foreign");
    exact(launch.runReceiptHash, sha256CanonicalJson(runReceipt),
      "launch Run Receipt is stale");
    exact(
      launch.runReceiptRef,
      expectedRunReceiptRef,
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
    exact(launch.strictDiagnosticHash, strictDiagnosticHash,
      "launch Strict Diagnostic is stale");
    exact(launch.entryValidationHash, entryValidationHash,
      "launch entry validation is stale");

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
    const stagedStrictDiagnosticHandle = await open(
      path.join(stagingDirectoryPath, "strict-diagnostic.json"),
      "wx",
      0o600,
    );
    try {
      await stagedStrictDiagnosticHandle.writeFile(strictDiagnosticBytes);
      await stagedStrictDiagnosticHandle.sync();
    } finally {
      await stagedStrictDiagnosticHandle.close();
    }
    const stagedEntryValidationHandle = await open(
      path.join(stagingDirectoryPath, "entry-third-person-validation.json"),
      "wx",
      0o600,
    );
    try {
      await stagedEntryValidationHandle.writeFile(entryValidationBytes);
      await stagedEntryValidationHandle.sync();
    } finally {
      await stagedEntryValidationHandle.close();
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
    const expectedStagingSnapshot = await snapshotTree(stagingDirectoryPath);

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
      sha256Bytes(await requiredRegularFile(
        stagingDirectoryPath,
        "strict-diagnostic.json",
      )),
      sha256Bytes(strictDiagnosticBytes),
      "staged Strict Diagnostic bytes changed",
    );
    exact(
      sha256Bytes(await requiredRegularFile(
        stagingDirectoryPath,
        "entry-third-person-validation.json",
      )),
      entryValidationHash,
      "staged entry validation bytes changed",
    );
    exact(
      sha256Bytes(await requiredRegularFile(runDirectoryPath, "run-receipt.json")),
      sha256Bytes(runReceiptBytes),
      "Run Receipt changed during publication",
    );
    await syncTree(stagingDirectoryPath, hooks);
    exact(
      sha256Bytes(await requiredRegularFile(evaluationStageRoot, "evaluation.json")),
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
    exact(
      sha256Bytes(await requiredRegularFile(caseDirectoryPath, "case.json")),
      caseBytesHash,
      "Case owner snapshot changed during publication",
    );
    exact(
      sha256Bytes(await requiredRegularFile(
        caseDirectoryPath,
        "evaluation-profile.json",
      )),
      evaluationProfileOwnerBytesHash,
      "Evaluation Profile owner snapshot changed during publication",
    );
    exact(
      sha256Bytes(await requiredRegularFile(
        caseDirectoryPath,
        reconstructionCase.formalCaptureIntentRef,
      )),
      formalCaptureIntentOwnerBytesHash,
      "Formal Capture Intent owner snapshot changed during publication",
    );
    assertCaseOwnerInputSnapshotEqual(
      await verifyNativeBlockCaseOwnerInputSnapshotV1(
        caseInputsRoot,
        reconstructionCase,
      ),
      caseInputsSnapshot,
    );
    assertTreeEqual(
      await snapshotTree(runDirectoryPath),
      runSnapshot,
      "immutable Run and owner-input source",
    );
    assertTreeEqual(
      await snapshotTree(stagingDirectoryPath),
      expectedStagingSnapshot,
      "staged publication",
    );
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
      strictDiagnosticHash,
      entryValidationHash,
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
