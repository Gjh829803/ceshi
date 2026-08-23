import { randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";

import { isNil, isPlainObject } from "lodash-es";

export type EvidencePublicationPhaseV1 =
  | "evidence-staged"
  | "evidence-directory-claimed"
  | "before-report-publish"
  | "report-published";

export interface EvidencePublicationFileV1 {
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

export interface PublishEvidenceAndReportInputV1 {
  readonly reportPath: string;
  readonly reportBytes: Uint8Array;
  readonly evidenceFiles: readonly EvidencePublicationFileV1[];
}

export interface EvidencePublicationTestHooksV1 {
  readonly onPhase?: (
    phase: EvidencePublicationPhaseV1,
  ) => void | Promise<void>;
}

export interface EvidencePublicationResultV1 {
  readonly commitStatus: "committed";
  readonly postCommitCleanupStatus: "complete" | "incomplete";
  readonly reportPath: string;
  readonly evidenceDirectory: string;
}

interface CanonicalPublicationInputV1 {
  readonly reportPath: string;
  readonly reportBytes: Uint8Array;
  readonly evidenceFiles: readonly EvidencePublicationFileV1[];
}

interface OwnedDirectoryIdentityV1 {
  readonly device: number;
  readonly inode: number;
  readonly markerPath: string;
  readonly markerValue: string;
}

const OWNER_MARKER_FILE = ".worldkit-publication-owner";
const INPUT_FIELDS = ["reportPath", "reportBytes", "evidenceFiles"] as const;
const FILE_FIELDS = ["relativePath", "bytes"] as const;

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function fileSystemErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function publicationTargetExists(cause?: unknown): Error {
  return new Error(
    "WORLDKIT_EVIDENCE_PUBLICATION_TARGET_EXISTS: " +
      "Report or evidence output already exists; refusing to replace it",
    isNil(cause) ? undefined : { cause },
  );
}

function normalizePublicationCollision(error: unknown): unknown {
  return fileSystemErrorCode(error) === "EEXIST"
    ? publicationTargetExists(error)
    : error;
}

function throwPrimaryAndCleanupErrors(
  primaryError: unknown,
  cleanupErrors: readonly unknown[],
  message: string,
): never {
  if (cleanupErrors.length !== 0) {
    throw new AggregateError([primaryError, ...cleanupErrors], message);
  }
  throw primaryError;
}

function assertByteViewOwnProperties(value: Uint8Array, label: string): void {
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    fail(
      "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
      `${label} must not have symbol-keyed properties`,
    );
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!isNil(descriptor.get) || !isNil(descriptor.set)) {
      fail(
        "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
        `${label} must not have accessor properties`,
      );
    }
  }
}

function snapshotBytes(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    fail(
      "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
      `${label} must be Uint8Array`,
    );
  }
  assertByteViewOwnProperties(value, label);
  const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
  const bufferGetter = Object.getOwnPropertyDescriptor(
    typedArrayPrototype,
    "buffer",
  )?.get;
  if (isNil(bufferGetter)) {
    fail(
      "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
      `${label} cannot be inspected safely`,
    );
  }
  let buffer: ArrayBufferLike;
  try {
    buffer = Reflect.apply(bufferGetter, value, []) as ArrayBufferLike;
  } catch {
    fail(
      "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
      `${label} must be an attached Uint8Array`,
    );
  }
  if (
    typeof SharedArrayBuffer !== "undefined" &&
    buffer instanceof SharedArrayBuffer
  ) {
    fail(
      "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
      `${label} must not use SharedArrayBuffer`,
    );
  }
  try {
    return new Uint8Array(value);
  } catch {
    fail(
      "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
      `${label} must be an attached Uint8Array`,
    );
  }
}

function assertAccessorFreeDataGraph(
  value: unknown,
  visited = new WeakSet<object>(),
): void {
  if (isNil(value) || typeof value !== "object") {
    return;
  }
  if (value instanceof Uint8Array) {
    assertByteViewOwnProperties(value, "byte view");
    return;
  }
  if (visited.has(value)) return;
  visited.add(value);
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    fail(
      "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
      "symbol-keyed input is forbidden",
    );
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!isNil(descriptor.get) || !isNil(descriptor.set)) {
      fail(
        "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
        "accessor-bearing input is forbidden",
      );
    }
    assertAccessorFreeDataGraph(descriptor.value, visited);
  }
}

function requireExactRecord(
  value: unknown,
  fields: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainObject(value)) {
    fail("WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID", `${label} must be a plain object`);
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (
    Object.keys(record).length !== fields.length ||
    Object.keys(record).some((field) => !fields.includes(field)) ||
    fields.some((field) => !Object.hasOwn(record, field))
  ) {
    fail("WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID", `${label} has invalid fields`);
  }
  return record;
}

function canonicalRelativeEvidencePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.split("/").some((segment) =>
      segment.length === 0 ||
      segment === "." ||
      segment === ".." ||
      segment.includes(":")
    ) ||
    value === OWNER_MARKER_FILE
  ) {
    fail(
      "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
      "evidence file paths must be safe canonical relative paths",
    );
  }
  return value;
}

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalPublicationInput(
  value: PublishEvidenceAndReportInputV1,
): CanonicalPublicationInputV1 {
  assertAccessorFreeDataGraph(value);
  const record = requireExactRecord(value, INPUT_FIELDS, "publication input");
  if (
    typeof record.reportPath !== "string" ||
    record.reportPath.length === 0 ||
    record.reportPath.includes("\0")
  ) {
    fail("WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID", "reportPath is invalid");
  }
  const reportBytes = snapshotBytes(record.reportBytes, "reportBytes");
  if (!Array.isArray(record.evidenceFiles) || record.evidenceFiles.length === 0) {
    fail(
      "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
      "evidenceFiles must be a non-empty array",
    );
  }
  const evidenceFiles = record.evidenceFiles.map((candidate, index) => {
    const row = requireExactRecord(candidate, FILE_FIELDS, `evidenceFiles/${index}`);
    return {
      relativePath: canonicalRelativeEvidencePath(row.relativePath),
      bytes: snapshotBytes(row.bytes, `evidenceFiles/${index}/bytes`),
    };
  }).sort((left, right) =>
    compareCanonicalStrings(left.relativePath, right.relativePath)
  );
  if (new Set(evidenceFiles.map(({ relativePath }) => relativePath)).size !== evidenceFiles.length) {
    fail(
      "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
      "evidence file paths must be unique",
    );
  }
  for (let index = 1; index < evidenceFiles.length; index += 1) {
    const previousPath = evidenceFiles[index - 1]!.relativePath;
    const currentPath = evidenceFiles[index]!.relativePath;
    if (currentPath.startsWith(`${previousPath}/`)) {
      fail(
        "WORLDKIT_EVIDENCE_PUBLICATION_INPUT_INVALID",
        "evidence file paths must not be directory prefixes of other files",
      );
    }
  }
  return {
    reportPath: path.resolve(record.reportPath),
    reportBytes,
    evidenceFiles,
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await lstat(targetPath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function writeBytesExclusiveAndSync(
  targetPath: string,
  bytes: Uint8Array,
): Promise<void> {
  const handle = await open(targetPath, "wx", 0o600);
  let primaryError: unknown;
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    primaryError = error;
  }
  let closeError: unknown;
  try {
    await handle.close();
  } catch (error) {
    closeError = error;
  }
  if (!isNil(primaryError)) {
    throwPrimaryAndCleanupErrors(
      primaryError,
      isNil(closeError) ? [] : [closeError],
      "WORLDKIT_EVIDENCE_PUBLICATION_WRITE_AND_CLOSE_FAILED",
    );
  }
  if (!isNil(closeError)) throw closeError;
}

async function stageEvidenceFiles(
  stagingDirectory: string,
  files: readonly EvidencePublicationFileV1[],
  markerValue: string,
): Promise<void> {
  await mkdir(stagingDirectory, { recursive: false, mode: 0o700 });
  await writeBytesExclusiveAndSync(
    path.join(stagingDirectory, OWNER_MARKER_FILE),
    new TextEncoder().encode(markerValue),
  );
  for (const file of files) {
    const stagedPath = path.join(stagingDirectory, file.relativePath);
    await mkdir(path.dirname(stagedPath), { recursive: true, mode: 0o700 });
    await writeBytesExclusiveAndSync(stagedPath, file.bytes);
    const persisted = await readFile(stagedPath);
    if (!persisted.equals(file.bytes)) {
      fail("WORLDKIT_EVIDENCE_PUBLICATION_WRITE_MISMATCH", file.relativePath);
    }
  }
}

async function claimEvidenceDirectory(
  evidenceDirectory: string,
  markerPath: string,
  markerValue: string,
): Promise<OwnedDirectoryIdentityV1> {
  try {
    await mkdir(evidenceDirectory, { recursive: false, mode: 0o700 });
  } catch (error) {
    throw normalizePublicationCollision(error);
  }
  const directoryStat = await lstat(evidenceDirectory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    fail("WORLDKIT_EVIDENCE_PUBLICATION_CLAIM_INVALID", evidenceDirectory);
  }
  return {
    device: directoryStat.dev,
    inode: directoryStat.ino,
    markerPath,
    markerValue,
  };
}

async function linkEvidenceFiles(
  stagingDirectory: string,
  evidenceDirectory: string,
  files: readonly EvidencePublicationFileV1[],
): Promise<void> {
  for (const file of files) {
    const destinationPath = path.join(evidenceDirectory, file.relativePath);
    try {
      await mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
      await link(path.join(stagingDirectory, file.relativePath), destinationPath);
    } catch (error) {
      throw normalizePublicationCollision(error);
    }
  }
}

async function publishReportNoReplace(
  reportPath: string,
  bytes: Uint8Array,
): Promise<"complete" | "incomplete"> {
  const temporaryPath = path.join(
    path.dirname(reportPath),
    `.${path.basename(reportPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeBytesExclusiveAndSync(temporaryPath, bytes);
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    try {
      await rm(temporaryPath, { force: true });
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    throwPrimaryAndCleanupErrors(
      error,
      cleanupErrors,
      "WORLDKIT_EVIDENCE_REPORT_WRITE_AND_CLEANUP_FAILED",
    );
  }
  try {
    await link(temporaryPath, reportPath);
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    try {
      await rm(temporaryPath, { force: true });
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    throwPrimaryAndCleanupErrors(
      normalizePublicationCollision(error),
      cleanupErrors,
      "WORLDKIT_EVIDENCE_REPORT_PUBLISH_AND_CLEANUP_FAILED",
    );
  }
  try {
    await rm(temporaryPath, { force: true });
    return "complete";
  } catch {
    return "incomplete";
  }
}

async function removeOwnedEvidenceDirectory(
  evidenceDirectory: string,
  identity: OwnedDirectoryIdentityV1,
): Promise<void> {
  try {
    const current = await lstat(evidenceDirectory);
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== identity.device ||
      current.ino !== identity.inode
    ) {
      return;
    }
    const marker = await readFile(identity.markerPath, "utf8");
    if (marker !== identity.markerValue) return;
    await rm(evidenceDirectory, { recursive: true, force: false });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

export async function publishEvidenceAndReportNoReplaceV1(
  value: PublishEvidenceAndReportInputV1,
  hooks: EvidencePublicationTestHooksV1 = {},
): Promise<EvidencePublicationResultV1> {
  const input = canonicalPublicationInput(value);
  const requestedReportPath = input.reportPath;
  const requestedEvidenceDirectory = `${requestedReportPath}.evidence`;
  await mkdir(path.dirname(input.reportPath), { recursive: true });
  const canonicalParent = await realpath(path.dirname(input.reportPath));
  const reportPath = path.join(canonicalParent, path.basename(input.reportPath));
  const evidenceDirectory = `${reportPath}.evidence`;
  if (await pathExists(reportPath) || await pathExists(evidenceDirectory)) {
    throw publicationTargetExists();
  }

  const publicationId = `${process.pid}-${randomUUID()}`;
  const stagingDirectory = path.join(
    canonicalParent,
    `.${path.basename(evidenceDirectory)}.staging-${publicationId}`,
  );
  let ownedDirectory: OwnedDirectoryIdentityV1 | undefined;
  try {
    await stageEvidenceFiles(stagingDirectory, input.evidenceFiles, publicationId);
    await hooks.onPhase?.("evidence-staged");
    ownedDirectory = await claimEvidenceDirectory(
      evidenceDirectory,
      path.join(stagingDirectory, OWNER_MARKER_FILE),
      publicationId,
    );
    await hooks.onPhase?.("evidence-directory-claimed");
    await linkEvidenceFiles(stagingDirectory, evidenceDirectory, input.evidenceFiles);
    await hooks.onPhase?.("before-report-publish");
    let postCommitCleanupStatus = await publishReportNoReplace(
      reportPath,
      input.reportBytes,
    );
    try {
      await hooks.onPhase?.("report-published");
    } catch {
      postCommitCleanupStatus = "incomplete";
    }
    try {
      await rm(stagingDirectory, { recursive: true, force: true });
    } catch {
      postCommitCleanupStatus = "incomplete";
    }
    return {
      commitStatus: "committed",
      postCommitCleanupStatus,
      reportPath: requestedReportPath,
      evidenceDirectory: requestedEvidenceDirectory,
    };
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    if (!isNil(ownedDirectory)) {
      try {
        await removeOwnedEvidenceDirectory(evidenceDirectory, ownedDirectory);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    try {
      await rm(stagingDirectory, { recursive: true, force: true });
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    if (cleanupErrors.length !== 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        "WORLDKIT_EVIDENCE_PUBLICATION_AND_CLEANUP_FAILED",
      );
    }
    throw error;
  }
}
