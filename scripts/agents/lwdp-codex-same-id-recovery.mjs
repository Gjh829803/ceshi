import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  assertSuccessfulJob,
  downloadS3FileAtomic,
  fetchGenerationItems,
  findGenerationJobByRequestId,
  joinS3Uri,
  pollGenerationJob,
  submittedJobId,
} from "../lib/lwdp-generation-client.mjs";
import { confirmedTerminalTaskFailure } from "./lwdp-codex-task-retry.mjs";

export const LWDP_CODEX_PENDING_JOURNAL_KIND = "worldkit-lwdp-codex-pending-journal";

const TERMINAL_STATUSES = new Set([
  "succeeded", "completed", "failed", "submit_failed", "cancelled", "stopped",
]);

const defaultFileSystem = Object.freeze({
  link,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
});

const JOURNAL_PHASES = new Set(["prepared", "submission-unknown", "attached"]);
const SAFE_REQUEST_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;

function asFileSystem(fileSystem) {
  return {
    ...defaultFileSystem,
    ...(fileSystem ?? {}),
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizePrefix(value) {
  return String(value).replace(/\/$/, "");
}

function sortedCopy(values) {
  return [...values].map((value) => String(value)).sort();
}

function sameStringSet(left, right) {
  return JSON.stringify(sortedCopy(left)) === JSON.stringify(sortedCopy(right));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function fail(message) {
  throw new Error(message);
}

function isNotFound(error) {
  return error?.code === "ENOENT";
}

function isContained(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function sameInode(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

async function syncDirectory(directory, fs) {
  const handle = await fs.open(
    directory,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function resolvedSafeRoot(repoRoot, fs) {
  const lexicalRoot = resolve(repoRoot);
  const rootMetadata = await fs.lstat(lexicalRoot);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    fail("LWDP same-request-id recovery containment root is a symlink or not a directory.");
  }
  return fs.realpath(lexicalRoot);
}

async function ensureSafeDirectory(root, parts, fs) {
  let current = root;
  for (const part of parts) {
    if (!part || part === "." || part === ".." || part.includes(sep)) {
      fail("LWDP same-request-id recovery path containment failed.");
    }
    const next = join(current, part);
    try {
      await fs.mkdir(next, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const metadata = await fs.lstat(next);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      fail("LWDP same-request-id recovery path contains a symlink or non-directory.");
    }
    const real = await fs.realpath(next);
    if (!isContained(root, real) || real !== next) {
      fail("LWDP same-request-id recovery path containment failed.");
    }
    current = next;
  }
  return current;
}

async function safeJournalDirectory(repoRoot, fs) {
  const root = await resolvedSafeRoot(repoRoot, fs);
  const directory = await ensureSafeDirectory(
    root,
    [".codex-tmp", "lwdp-codex", "pending"],
    fs,
  );
  return { root, directory, metadata: await fs.lstat(directory) };
}

export async function createLwdpCodexStagingDirectory(repoRoot, runKey, { fileSystem } = {}) {
  if (!/^[a-z0-9][a-z0-9-]{2,159}$/.test(runKey ?? "")) {
    fail("LWDP Codex staging identity is invalid.");
  }
  const fs = asFileSystem(fileSystem);
  const root = await resolvedSafeRoot(repoRoot, fs);
  return ensureSafeDirectory(root, [".codex-tmp", "lwdp-codex", "staging", runKey], fs);
}

export async function removeLwdpCodexStagingDirectory(repoRoot, stagingDirectory, {
  fileSystem,
} = {}) {
  const fs = asFileSystem(fileSystem);
  const root = await resolvedSafeRoot(repoRoot, fs);
  const stagingRoot = join(root, ".codex-tmp", "lwdp-codex", "staging");
  const target = resolve(stagingDirectory);
  if (!isContained(stagingRoot, target) || target === stagingRoot) {
    fail("LWDP Codex staging path containment failed.");
  }
  const metadata = await fs.lstat(target);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    fail("LWDP Codex staging path is a symlink or not a directory.");
  }
  const real = await fs.realpath(target);
  if (real !== target || !isContained(stagingRoot, real)) {
    fail("LWDP Codex staging path containment failed.");
  }
  await fs.rm(target, { recursive: true });
  await syncDirectory(dirname(target), fs);
}

async function assertDirectoryIdentity(directory, expected, root, fs) {
  const current = await fs.lstat(directory);
  if (current.isSymbolicLink() || !current.isDirectory() || !sameInode(current, expected)) {
    fail("LWDP same-request-id recovery path changed during use.");
  }
  const real = await fs.realpath(directory);
  if (real !== directory || !isContained(root, real)) {
    fail("LWDP same-request-id recovery path containment failed.");
  }
}

async function writeExclusiveDurable(target, contents, directoryState, fs) {
  await assertDirectoryIdentity(
    directoryState.directory,
    directoryState.metadata,
    directoryState.root,
    fs,
  );
  const handle = await fs.open(
    target,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(directoryState.directory, fs);
}

async function readFileNoFollow(target, directoryState, fs) {
  await assertDirectoryIdentity(
    directoryState.directory,
    directoryState.metadata,
    directoryState.root,
    fs,
  );
  const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail("LWDP same-request-id pending journal is not a regular file.");
    const raw = await handle.readFile("utf8");
    const after = await handle.stat();
    const pathMetadata = await fs.lstat(target);
    if (pathMetadata.isSymbolicLink() || !sameInode(before, after) || !sameInode(after, pathMetadata)) {
      fail("LWDP same-request-id pending journal changed during read.");
    }
    await assertDirectoryIdentity(
      directoryState.directory,
      directoryState.metadata,
      directoryState.root,
      fs,
    );
    return { raw, metadata: after };
  } finally {
    await handle.close();
  }
}

export function pendingJournalPath(repoRoot, requestId) {
  if (!SAFE_REQUEST_ID.test(requestId ?? "")) {
    fail("LWDP same-request-id recovery request identity drifted.");
  }
  return resolve(repoRoot, ".codex-tmp", "lwdp-codex", "pending", `${requestId}.json`);
}

export function declaredOutputUris(outputS3Prefix, taskId, outputSpecs) {
  if (!Array.isArray(outputSpecs) || outputSpecs.length === 0) {
    fail("LWDP same-request-id recovery declared output URI set drifted.");
  }
  return outputSpecs.map((output) =>
    joinS3Uri(outputS3Prefix, "tasks", taskId, output.remotePath));
}

export function lwdpCodexRequestArgumentFingerprint(input) {
  if (input?.payload === null || typeof input?.payload !== "object" ||
      !Array.isArray(input?.localOutputs) || input.localOutputs.length === 0 ||
      !Array.isArray(input?.inputContents)) {
    fail("LWDP same-request-id recovery request arguments drifted.");
  }
  return createHash("sha256").update(canonicalJson({
    payload: input.payload,
    localOutputs: input.localOutputs,
    inputContents: input.inputContents,
  })).digest("hex");
}

export function parsePendingJournal(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    fail("LWDP same-request-id pending journal is invalid.");
  }
  if (input.kind !== LWDP_CODEX_PENDING_JOURNAL_KIND || input.schemaVersion !== 1) {
    fail("LWDP same-request-id pending journal is invalid.");
  }
  if (!isNonEmptyString(input.requestId) || !isNonEmptyString(input.taskId)) {
    fail("LWDP same-request-id recovery request identity drifted.");
  }
  if (!isNonEmptyString(input.outputS3Prefix) || !isNonEmptyString(input.requestArgumentFingerprint)) {
    fail("LWDP same-request-id recovery request arguments drifted.");
  }
  if (!Array.isArray(input.declaredOutputUris) || input.declaredOutputUris.length === 0 ||
      input.declaredOutputUris.some((uri) => !isNonEmptyString(uri))) {
    fail("LWDP same-request-id recovery declared output URI set drifted.");
  }
  if (!Array.isArray(input.outputs) || input.outputs.length === 0) {
    fail("LWDP same-request-id recovery declared output URI set drifted.");
  }
  if (input.jobId !== null && input.jobId !== undefined && !isNonEmptyString(input.jobId)) {
    fail("LWDP same-request-id recovery terminal job identity is stale.");
  }
  if (!JOURNAL_PHASES.has(input.phase) || !isNonEmptyString(input.ownerToken)) {
    fail("LWDP same-request-id pending journal phase or owner identity is invalid.");
  }
  if (input.phase === "attached" && !isNonEmptyString(input.jobId)) {
    fail("LWDP same-request-id recovery terminal job identity is stale.");
  }
  if (input.phase !== "attached" && input.jobId !== null && input.jobId !== undefined) {
    fail("LWDP same-request-id pending journal phase is inconsistent with its job identity.");
  }
  return Object.freeze({
    kind: LWDP_CODEX_PENDING_JOURNAL_KIND,
    schemaVersion: 1,
    requestId: input.requestId,
    taskId: input.taskId,
    outputS3Prefix: input.outputS3Prefix,
    declaredOutputUris: Object.freeze([...input.declaredOutputUris]),
    outputs: Object.freeze(input.outputs.map((output) => Object.freeze({
      remotePath: output.remotePath,
      localPath: output.localPath,
      contentType: output.contentType,
    }))),
    requestArgumentFingerprint: input.requestArgumentFingerprint,
    instructionSha256: input.instructionSha256,
    defaults: input.defaults === undefined ? undefined : Object.freeze({ ...input.defaults }),
    phase: input.phase,
    ownerToken: input.ownerToken,
    jobId: input.jobId ?? null,
  });
}

export async function createPendingJournal(journal, { repoRoot, fileSystem } = {}) {
  const parsed = parsePendingJournal(journal);
  if (parsed.phase !== "prepared" || parsed.jobId !== null) {
    fail("LWDP same-request-id pending journal must be created in prepared phase.");
  }
  const fs = asFileSystem(fileSystem);
  const directoryState = await safeJournalDirectory(repoRoot, fs);
  const target = join(directoryState.directory, `${parsed.requestId}.json`);
  try {
    await writeExclusiveDurable(target, `${JSON.stringify(parsed)}\n`, directoryState, fs);
    return Object.freeze({ created: true, journal: parsed, path: target });
  } catch (error) {
    if (error?.code === "EEXIST") {
      const existing = await readPendingJournal(repoRoot, parsed.requestId, { fileSystem: fs });
      return Object.freeze({ created: false, journal: existing, path: target });
    }
    await fs.rm(target, { force: true }).catch(() => undefined);
    await syncDirectory(directoryState.directory, fs).catch(() => undefined);
    throw error;
  }
}

export async function transitionPendingJournal(journal, {
  repoRoot,
  expectedPhase,
  expectedOwnerToken,
  fileSystem,
} = {}) {
  const next = parsePendingJournal(journal);
  const fs = asFileSystem(fileSystem);
  const directoryState = await safeJournalDirectory(repoRoot, fs);
  const target = join(directoryState.directory, `${next.requestId}.json`);
  const snapshot = await readFileNoFollow(target, directoryState, fs);
  const current = parsePendingJournal(JSON.parse(snapshot.raw));
  if (current.phase !== expectedPhase) {
    fail("LWDP same-request-id pending journal phase drifted.");
  }
  if (current.ownerToken !== expectedOwnerToken) {
    fail("LWDP same-request-id pending journal owner identity drifted.");
  }
  if (current.requestArgumentFingerprint !== next.requestArgumentFingerprint ||
      current.requestId !== next.requestId || current.taskId !== next.taskId) {
    fail("LWDP same-request-id recovery request arguments drifted.");
  }
  const allowed = (current.phase === "prepared" && next.phase === "submission-unknown") ||
    (current.phase === "submission-unknown" && next.phase === "attached") ||
    (current.phase === "attached" && next.phase === "attached" && current.jobId === next.jobId);
  if (!allowed) fail("LWDP same-request-id pending journal phase transition is invalid.");
  const temporaryPath = join(
    directoryState.directory,
    `.${next.requestId}.journal-${process.pid}-${randomBytes(8).toString("hex")}.part`,
  );
  try {
    await writeExclusiveDurable(
      temporaryPath,
      `${JSON.stringify(next)}\n`,
      directoryState,
      fs,
    );
    const currentMetadata = await fs.lstat(target);
    if (currentMetadata.isSymbolicLink() || !sameInode(currentMetadata, snapshot.metadata)) {
      fail("LWDP same-request-id pending journal changed during transition.");
    }
    await assertDirectoryIdentity(
      directoryState.directory,
      directoryState.metadata,
      directoryState.root,
      fs,
    );
    await fs.rename(temporaryPath, target);
    await syncDirectory(directoryState.directory, fs);
    return next;
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readPendingJournal(repoRoot, requestId, { fileSystem } = {}) {
  const fs = asFileSystem(fileSystem);
  pendingJournalPath(repoRoot, requestId);
  const directoryState = await safeJournalDirectory(repoRoot, fs);
  const snapshot = await readFileNoFollow(
    join(directoryState.directory, `${requestId}.json`),
    directoryState,
    fs,
  );
  return parsePendingJournal(JSON.parse(snapshot.raw));
}

export async function readPendingJournalIfExists(repoRoot, requestId, options) {
  try {
    return await readPendingJournal(repoRoot, requestId, options);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function removePendingJournal(repoRoot, requestId, { fileSystem } = {}) {
  const fs = asFileSystem(fileSystem);
  try {
    pendingJournalPath(repoRoot, requestId);
    const directoryState = await safeJournalDirectory(repoRoot, fs);
    const target = join(directoryState.directory, `${requestId}.json`);
    const snapshot = await readFileNoFollow(target, directoryState, fs);
    parsePendingJournal(JSON.parse(snapshot.raw));
    const metadata = await fs.lstat(target);
    if (metadata.isSymbolicLink() || !metadata.isFile() ||
        !sameInode(metadata, snapshot.metadata)) {
      fail("LWDP same-request-id recovery cleanup refused a non-regular journal.");
    }
    await assertDirectoryIdentity(
      directoryState.directory,
      directoryState.metadata,
      directoryState.root,
      fs,
    );
    await fs.rm(target);
    await syncDirectory(directoryState.directory, fs);
  } catch (error) {
    fail(`LWDP same-request-id recovery cleanup failed: ${error?.message ?? error}`);
  }
}

export function collectLookupJobs(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const collected = [];
  if (Array.isArray(payload.jobs)) {
    collected.push(...payload.jobs.filter((job) => job !== null && typeof job === "object"));
  }
  if (Array.isArray(payload.job)) {
    collected.push(...payload.job.filter((job) => job !== null && typeof job === "object"));
  } else if (payload.job !== null && typeof payload.job === "object") {
    collected.push(payload.job);
  } else if (isNonEmptyString(payload.job_id) && !Array.isArray(payload.jobs)) {
    collected.push(payload);
  }
  const unique = new Map();
  for (const job of collected) {
    const jobId = job.job_id;
    if (!isNonEmptyString(jobId)) {
      unique.set(Symbol("anonymous-job"), job);
      continue;
    }
    if (!unique.has(jobId)) unique.set(jobId, job);
  }
  return [...unique.values()];
}

export function attachCanonicalSameRequestIdJob(jobs, { requestId }) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    fail("LWDP same-request-id recovery found zero jobs.");
  }
  if (jobs.length !== 1) {
    fail("LWDP same-request-id recovery found duplicate jobs without a supported GET-only canonical choice.");
  }
  const job = jobs[0];
  const remoteRequestId = job?.request_id;
  if (remoteRequestId !== undefined && remoteRequestId !== requestId) {
    fail("LWDP same-request-id recovery request identity drifted.");
  }
  return job;
}

function assertCurrentMatchesJournal(journal, current) {
  if (current.requestId !== journal.requestId) {
    fail("LWDP same-request-id recovery request identity drifted.");
  }
  if (current.taskId !== journal.taskId ||
      normalizePrefix(current.outputS3Prefix) !== normalizePrefix(journal.outputS3Prefix) ||
      current.requestArgumentFingerprint !== journal.requestArgumentFingerprint ||
      current.instructionSha256 !== journal.instructionSha256) {
    fail("LWDP same-request-id recovery request arguments drifted.");
  }
  if (!sameStringSet(current.declaredOutputUris, journal.declaredOutputUris)) {
    fail("LWDP same-request-id recovery declared output URI set drifted.");
  }
}

function unexpectedRemoteOutputs(itemsPayload, taskId, declaredOutputUris) {
  const items = itemsPayload?.items ?? itemsPayload?.data ?? [];
  const matched = Array.isArray(items)
    ? items.find((item) => (item?.item_id ?? item?.id) === taskId)
    : undefined;
  const outputUris = matched?.metadata?.output_uris;
  if (!Array.isArray(outputUris)) return false;
  return !sameStringSet(outputUris, declaredOutputUris);
}

async function prepareOutputDestination(repoRoot, destination, fs, allowExistingMatchingOutputs = false) {
  const root = await resolvedSafeRoot(repoRoot, fs);
  const lexicalRoot = resolve(repoRoot);
  const lexicalDestination = resolve(destination);
  const destinationRelative = relative(lexicalRoot, lexicalDestination);
  if (destinationRelative === "" || destinationRelative === ".." ||
      destinationRelative.startsWith(`..${sep}`) || isAbsolute(destinationRelative)) {
    fail("LWDP same-request-id recovery output path containment failed.");
  }
  const absolute = resolve(root, destinationRelative);
  const parentRelative = relative(root, dirname(absolute));
  const parts = parentRelative === "" ? [] : parentRelative.split(sep);
  const directory = await ensureSafeDirectory(root, parts, fs);
  const directoryMetadata = await fs.lstat(directory);
  try {
    const existing = await fs.lstat(absolute);
    if (!allowExistingMatchingOutputs || existing.isSymbolicLink() || !existing.isFile()) {
      fail(`LWDP same-request-id recovery output already exists: ${absolute}`);
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  return { destination: absolute, root, directory, directoryMetadata };
}

export async function validateDeclaredOutputDestinations(repoRoot, outputSpecs, { fileSystem } = {}) {
  if (!Array.isArray(outputSpecs) || outputSpecs.length === 0) {
    fail("LWDP same-request-id recovery declared output URI set drifted.");
  }
  const fs = asFileSystem(fileSystem);
  const destinations = [];
  for (const output of outputSpecs) {
    destinations.push(await prepareOutputDestination(repoRoot, output.localPath, fs));
  }
  return Object.freeze(destinations.map(({ destination }) => destination));
}

async function removeIfSameInode(target, expected, fs) {
  try {
    const current = await fs.lstat(target);
    if (!current.isSymbolicLink() && current.isFile() && sameInode(current, expected)) {
      await fs.rm(target);
      return true;
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  return false;
}

async function syncFileNoFollow(target, expected, fs) {
  const handle = await fs.open(target, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
  try {
    const current = await handle.stat();
    if (!current.isFile() || !sameInode(current, expected)) {
      fail("LWDP same-request-id recovery staged output changed before fsync.");
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function downloadDeclaredOutputs(input) {
  const {
    repoRoot,
    outputSpecs,
    declaredOutputUris,
    outputS3Prefix,
    taskId,
    downloadImplementation,
    fileSystem,
    allowExistingMatchingOutputs = false,
  } = input;
  const fs = fileSystem;
  const expected = new Set(declaredOutputUris);
  const staged = [];
  const destinations = [];
  try {
    for (const output of outputSpecs) {
      destinations.push(await prepareOutputDestination(repoRoot, output.localPath, fs, allowExistingMatchingOutputs));
    }
    for (const output of outputSpecs) {
      const destinationState = destinations[staged.length];
      const destination = destinationState.destination;
      const s3Uri = joinS3Uri(outputS3Prefix, "tasks", taskId, output.remotePath);
      if (!expected.has(s3Uri)) {
        fail("LWDP same-request-id recovery observed unexpected outputs.");
      }
      const temporaryPath = join(
        destinationState.directory,
        `.${basename(destination)}.lwdp-same-id-${process.pid}-${randomBytes(4).toString("hex")}.part`,
      );
      try {
        await downloadImplementation(s3Uri, temporaryPath);
      } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
        fail(`LWDP same-request-id recovery download failed: ${error?.message ?? error}`);
      }
      let metadata;
      try {
        metadata = await fs.lstat(temporaryPath);
      } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
        fail(`LWDP same-request-id recovery download failed: ${error?.message ?? error}`);
      }
      if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size === 0) {
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
        fail("LWDP same-request-id recovery download failed: downloaded output is empty.");
      }
      await assertDirectoryIdentity(
        destinationState.directory,
        destinationState.directoryMetadata,
        destinationState.root,
        fs,
      );
      await syncFileNoFollow(temporaryPath, metadata, fs);
      staged.push({ temporaryPath, destination, s3Uri, metadata, destinationState });
    }
    if (staged.length !== outputSpecs.length || staged.length !== declaredOutputUris.length) {
      fail("LWDP same-request-id recovery observed unexpected outputs.");
    }
    const promoted = [];
    try {
      for (const entry of staged) {
        await assertDirectoryIdentity(
          entry.destinationState.directory,
          entry.destinationState.directoryMetadata,
          entry.destinationState.root,
          fs,
        );
        try {
          const existing = await fs.lstat(entry.destination);
          if (!allowExistingMatchingOutputs || existing.isSymbolicLink() || !existing.isFile()) {
            fail(`LWDP same-request-id recovery output already exists: ${entry.destination}`);
          }
          const existingHash = await hashRegularOutput(entry.destination, entry.destinationState, fs);
          const downloadedHash = await hashRegularOutput(entry.temporaryPath, entry.destinationState, fs);
          if (existingHash !== downloadedHash) {
            fail("LWDP same-request-id recovery existing output Hash differs from the exact remote output.");
          }
          continue;
        } catch (error) {
          if (!isNotFound(error)) throw error;
        }
        await fs.link(entry.temporaryPath, entry.destination);
        const publishedMetadata = await fs.lstat(entry.destination);
        if (publishedMetadata.isSymbolicLink() || !sameInode(publishedMetadata, entry.metadata)) {
          fail("LWDP same-request-id recovery promoted output identity drifted.");
        }
        promoted.push({
          destination: entry.destination,
          metadata: publishedMetadata,
          directory: entry.destinationState.directory,
        });
        await syncDirectory(entry.destinationState.directory, fs);
      }
    } catch (error) {
      for (const entry of promoted) {
        if (await removeIfSameInode(entry.destination, entry.metadata, fs).catch(() => false)) {
          await syncDirectory(entry.directory, fs).catch(() => undefined);
        }
      }
      fail(`LWDP same-request-id recovery promotion was partial: ${error?.message ?? error}`);
    }
    for (const entry of staged) {
      if (await removeIfSameInode(entry.temporaryPath, entry.metadata, fs)) {
        await syncDirectory(entry.destinationState.directory, fs);
      }
    }
    return staged.map((entry) => ({
      s3Uri: entry.s3Uri,
      localPath: entry.destination,
    }));
  } catch (error) {
    for (const entry of staged) {
      await removeIfSameInode(entry.temporaryPath, entry.metadata, fs).catch(() => undefined);
    }
    throw error;
  }
}

async function hashRegularOutput(path, directoryState, fs) {
  await assertDirectoryIdentity(directoryState.directory, directoryState.directoryMetadata,
    directoryState.root, fs);
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail("LWDP recovery output is not a regular file.");
    const hash = createHash("sha256").update(await handle.readFile()).digest("hex");
    const after = await handle.stat();
    const current = await fs.lstat(path);
    if (!sameInode(before, after) || !sameInode(after, current) || current.isSymbolicLink() ||
        before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      fail("LWDP recovery output changed during exact Hash comparison.");
    }
    await assertDirectoryIdentity(directoryState.directory, directoryState.directoryMetadata,
      directoryState.root, fs);
    return hash;
  } finally { await handle.close(); }
}

export async function reconcileLwdpCodexSameRequestId({
  repoRoot,
  current,
  config,
  fetchImplementation,
  downloadImplementation = downloadS3FileAtomic,
  findImplementation = findGenerationJobByRequestId,
  pollImplementation = pollGenerationJob,
  itemsImplementation = fetchGenerationItems,
  fileSystem,
  intervalMs = 100,
  timeoutMs = Number(process.env.WORLDKIT_LWDP_JOB_TIMEOUT_MS || 3_600_000),
  onCompleted,
  allowExistingMatchingOutputs = false,
  waitForCompletion = true,
} = {}) {
  const fs = asFileSystem(fileSystem);
  const parsedCurrent = parsePendingJournal(current);
  const journal = await readPendingJournal(repoRoot, parsedCurrent.requestId, { fileSystem: fs });
  assertCurrentMatchesJournal(journal, parsedCurrent);
  if (journal.phase === "prepared") {
    fail("LWDP same-request-id pending journal still has an exclusive pre-POST owner.");
  }

  let lookup;
  try {
    lookup = await findImplementation(parsedCurrent.requestId, {
      config,
      fetchImplementation,
      pipeline: "codex",
      maxAttempts: 1,
    });
  } catch (error) {
    if (error?.status === 404) {
      fail("LWDP same-request-id recovery found zero jobs.");
    }
    throw error;
  }

  const attached = attachCanonicalSameRequestIdJob(collectLookupJobs(lookup), {
    requestId: parsedCurrent.requestId,
  });
  const attachedRequestId = attached?.request_id ?? lookup?.request_id;
  if (!isNonEmptyString(attachedRequestId)) {
    fail("LWDP same-request-id recovery remote request identity is missing.");
  }
  if (attachedRequestId !== parsedCurrent.requestId) {
    fail("LWDP same-request-id recovery request identity drifted.");
  }
  const jobId = submittedJobId({ job: attached, job_id: attached.job_id });
  if (journal.jobId !== null && journal.jobId !== jobId) {
    fail("LWDP same-request-id recovery terminal job identity is stale.");
  }
  if (isNonEmptyString(attached.output_s3_prefix) &&
      normalizePrefix(attached.output_s3_prefix) !== normalizePrefix(parsedCurrent.outputS3Prefix)) {
    fail("LWDP same-request-id recovery request arguments drifted.");
  }
  if (journal.phase === "submission-unknown") {
    await transitionPendingJournal(
      { ...journal, phase: "attached", jobId },
      {
        repoRoot,
        expectedPhase: "submission-unknown",
        expectedOwnerToken: journal.ownerToken,
        fileSystem: fs,
      },
    );
  }

  let job = attached;
  if (!TERMINAL_STATUSES.has(String(job?.status))) {
    // Background delivery sweeps inspect once; they neither wait for a model nor
    // classify an observation of pending as a confirmed terminal failure.
    if (!waitForCompletion) fail("LWDP same-request-id recovery task is still pending.");
    job = await pollImplementation(jobId, {
      config,
      fetchImplementation,
      intervalMs,
      timeoutMs,
    });
  }
  const terminalJobId = submittedJobId({ job, job_id: job?.job_id });
  if (terminalJobId !== jobId || (journal.jobId !== null && journal.jobId !== terminalJobId)) {
    fail("LWDP same-request-id recovery terminal job identity is stale.");
  }
  if (!isNonEmptyString(job?.request_id)) {
    fail("LWDP same-request-id recovery remote request identity is missing.");
  }
  if (job.request_id !== parsedCurrent.requestId) {
    fail("LWDP same-request-id recovery request identity drifted.");
  }
  if (isNonEmptyString(job.output_s3_prefix) &&
      normalizePrefix(job.output_s3_prefix) !== normalizePrefix(parsedCurrent.outputS3Prefix)) {
    fail("LWDP same-request-id recovery request arguments drifted.");
  }

  const items = await itemsImplementation(jobId, { config, fetchImplementation });
  try {
    assertSuccessfulJob(job, items, [parsedCurrent.taskId]);
  } catch (cause) {
    // A retry may only be authorized by this identity-checked terminal job, never
    // by polling/network exceptions or text emitted by a local checker.
    let deterministicStop = false;
    const rows = items?.items ?? items?.data ?? [];
    const item = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    const expectedLogUri = joinS3Uri(parsedCurrent.outputS3Prefix, "tasks", parsedCurrent.taskId,
      "logs", "codex_attempt.json");
    if (item?.item_id === parsedCurrent.taskId && item.status === "failed" &&
        /missing required outputs:/i.test(String(item.error ?? "")) && item.metadata?.log_uri === expectedLogUri) {
      const staging = await createLwdpCodexStagingDirectory(repoRoot,
        `terminal-proof-${randomBytes(12).toString("hex")}`, { fileSystem: fs });
      try {
        const path = join(staging, "codex-attempt.json");
        await downloadImplementation(expectedLogUri, path);
        const directoryState = { root: await resolvedSafeRoot(repoRoot, fs), directory: staging,
          metadata: await fs.lstat(staging) };
        const metadata = await fs.lstat(path);
        if (metadata.size >= 2 && metadata.size <= 1024 * 1024) {
          const log = JSON.parse((await readFileNoFollow(path, directoryState, fs)).raw);
          deterministicStop = log?.item_id === parsedCurrent.taskId && log?.status === "missing_outputs" &&
            /BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED/.test(`${log.stdout_tail ?? ""}\n${log.stderr_tail ?? ""}`);
        }
      } catch {
        // Same as the frozen old probe: unavailable/malformed optional logs are
        // not evidence of a deterministic stop. No log text is published.
      } finally { await removeLwdpCodexStagingDirectory(repoRoot, staging, { fileSystem: fs }); }
    }
    throw confirmedTerminalTaskFailure({ job, itemsPayload: items,
      requestId: parsedCurrent.requestId, taskId: parsedCurrent.taskId,
      outputS3Prefix: parsedCurrent.outputS3Prefix, deterministicStop, cause });
  }
  if (unexpectedRemoteOutputs(items, parsedCurrent.taskId, parsedCurrent.declaredOutputUris)) {
    fail("LWDP same-request-id recovery observed unexpected outputs.");
  }

  const outputs = await downloadDeclaredOutputs({
    repoRoot,
    outputSpecs: parsedCurrent.outputs,
    declaredOutputUris: parsedCurrent.declaredOutputUris,
    outputS3Prefix: parsedCurrent.outputS3Prefix,
    taskId: parsedCurrent.taskId,
    downloadImplementation,
    fileSystem: fs,
    allowExistingMatchingOutputs,
  });
  const result = Object.freeze({
    status: "recovered",
    jobId,
    requestId: parsedCurrent.requestId,
    outputs: Object.freeze(outputs),
  });
  // Commit the durable successful Task Attempt before deleting recovery identity.
  if (onCompleted) await onCompleted(result);
  await removePendingJournal(repoRoot, parsedCurrent.requestId, { fileSystem: fs });
  return result;
}
