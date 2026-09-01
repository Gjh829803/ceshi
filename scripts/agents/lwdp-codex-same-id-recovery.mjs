import { createHash, randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import {
  assertSuccessfulJob,
  downloadS3FileAtomic,
  fetchGenerationItems,
  findGenerationJobByRequestId,
  joinS3Uri,
  pollGenerationJob,
  submittedJobId,
} from "../lib/lwdp-generation-client.mjs";

export const LWDP_CODEX_PENDING_JOURNAL_KIND = "worldkit-lwdp-codex-pending-journal";

const TERMINAL_STATUSES = new Set([
  "succeeded", "completed", "failed", "submit_failed", "cancelled", "stopped",
]);

const defaultFileSystem = Object.freeze({
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
});

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

export function pendingJournalPath(repoRoot, requestId) {
  if (!isNonEmptyString(requestId)) {
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
  return createHash("sha256").update(canonicalJson({
    declaredOutputUris: sortedCopy(input.declaredOutputUris),
    defaults: input.defaults,
    instructionSha256: input.instructionSha256,
    outputS3Prefix: normalizePrefix(input.outputS3Prefix),
    outputs: [...input.outputs]
      .map((output) => ({
        contentType: output.contentType,
        localPath: output.localPath,
        remotePath: output.remotePath,
      }))
      .sort((left, right) => left.remotePath.localeCompare(right.remotePath)),
    requestId: input.requestId,
    taskId: input.taskId,
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
    jobId: input.jobId ?? null,
  });
}

export async function writePendingJournal(journal, { repoRoot, fileSystem } = {}) {
  const parsed = parsePendingJournal(journal);
  const fs = asFileSystem(fileSystem);
  const target = pendingJournalPath(repoRoot, parsed.requestId);
  const directory = dirname(target);
  await fs.mkdir(directory, { recursive: true });
  const temporaryPath = join(
    directory,
    `.${parsed.requestId}.journal-${process.pid}-${randomBytes(4).toString("hex")}.part`,
  );
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(parsed)}\n`);
    await fs.rename(temporaryPath, target);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return target;
}

export async function readPendingJournal(repoRoot, requestId, { fileSystem } = {}) {
  const fs = asFileSystem(fileSystem);
  const raw = await fs.readFile(pendingJournalPath(repoRoot, requestId), "utf8");
  return parsePendingJournal(JSON.parse(raw));
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
    await fs.rm(pendingJournalPath(repoRoot, requestId));
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

function jobRequestId(job, fallback) {
  return job?.request_id ?? fallback;
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

async function downloadDeclaredOutputs(input) {
  const {
    outputSpecs,
    declaredOutputUris,
    outputS3Prefix,
    taskId,
    downloadImplementation,
    fileSystem,
  } = input;
  const fs = fileSystem;
  const expected = new Set(declaredOutputUris);
  const staged = [];
  try {
    for (const output of outputSpecs) {
      const destination = output.localPath;
      const s3Uri = joinS3Uri(outputS3Prefix, "tasks", taskId, output.remotePath);
      if (!expected.has(s3Uri)) {
        fail("LWDP same-request-id recovery observed unexpected outputs.");
      }
      await fs.mkdir(dirname(destination), { recursive: true });
      const temporaryPath = join(
        dirname(destination),
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
        metadata = await fs.stat(temporaryPath);
      } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
        fail(`LWDP same-request-id recovery download failed: ${error?.message ?? error}`);
      }
      if (!metadata.isFile() || metadata.size === 0) {
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
        fail("LWDP same-request-id recovery download failed: downloaded output is empty.");
      }
      staged.push({ temporaryPath, destination, s3Uri });
    }
    if (staged.length !== outputSpecs.length || staged.length !== declaredOutputUris.length) {
      fail("LWDP same-request-id recovery observed unexpected outputs.");
    }
    const promoted = [];
    try {
      for (const entry of staged) {
        await fs.rename(entry.temporaryPath, entry.destination);
        promoted.push(entry.destination);
      }
    } catch (error) {
      for (const destination of promoted) {
        await fs.rm(destination, { force: true }).catch(() => undefined);
      }
      fail(`LWDP same-request-id recovery promotion was partial: ${error?.message ?? error}`);
    }
    return staged.map((entry) => ({
      s3Uri: entry.s3Uri,
      localPath: entry.destination,
    }));
  } catch (error) {
    for (const entry of staged) {
      await fs.rm(entry.temporaryPath, { force: true }).catch(() => undefined);
    }
    throw error;
  }
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
} = {}) {
  const fs = asFileSystem(fileSystem);
  const parsedCurrent = parsePendingJournal(current);
  const journal = await readPendingJournal(repoRoot, parsedCurrent.requestId, { fileSystem: fs });
  assertCurrentMatchesJournal(journal, parsedCurrent);

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
  const jobId = submittedJobId({ job: attached, job_id: attached.job_id });
  if (journal.jobId !== null && journal.jobId !== jobId) {
    fail("LWDP same-request-id recovery terminal job identity is stale.");
  }
  if (jobRequestId(attached, lookup?.request_id) !== parsedCurrent.requestId) {
    fail("LWDP same-request-id recovery request identity drifted.");
  }
  if (isNonEmptyString(attached.output_s3_prefix) &&
      normalizePrefix(attached.output_s3_prefix) !== normalizePrefix(parsedCurrent.outputS3Prefix)) {
    fail("LWDP same-request-id recovery request arguments drifted.");
  }
  await writePendingJournal({ ...journal, jobId }, { repoRoot, fileSystem: fs });

  let job = attached;
  if (!TERMINAL_STATUSES.has(String(job?.status))) {
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
  if (jobRequestId(job, parsedCurrent.requestId) !== parsedCurrent.requestId) {
    fail("LWDP same-request-id recovery request identity drifted.");
  }

  const items = await itemsImplementation(jobId, { config, fetchImplementation });
  assertSuccessfulJob(job, items, [parsedCurrent.taskId]);
  if (unexpectedRemoteOutputs(items, parsedCurrent.taskId, parsedCurrent.declaredOutputUris)) {
    fail("LWDP same-request-id recovery observed unexpected outputs.");
  }

  const outputs = await downloadDeclaredOutputs({
    outputSpecs: parsedCurrent.outputs,
    declaredOutputUris: parsedCurrent.declaredOutputUris,
    outputS3Prefix: parsedCurrent.outputS3Prefix,
    taskId: parsedCurrent.taskId,
    downloadImplementation,
    fileSystem: fs,
  });
  await removePendingJournal(repoRoot, parsedCurrent.requestId, { fileSystem: fs });
  return Object.freeze({
    status: "recovered",
    jobId,
    requestId: parsedCurrent.requestId,
    outputs: Object.freeze(outputs),
  });
}
