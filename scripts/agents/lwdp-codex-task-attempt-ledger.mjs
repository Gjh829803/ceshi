import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { TERMINAL_TASK_RETRY_CLASSES } from "./lwdp-codex-task-retry.mjs";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const HASH = /^[a-f0-9]{64}$/;
function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function bytesHash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

async function readRegular(file) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error("Task Attempt artifact is not a regular file.");
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const current = await lstat(file);
    if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs ||
        current.isSymbolicLink() || current.ino !== after.ino || current.dev !== after.dev ||
        await realpath(file) !== file) throw new Error("Task Attempt artifact changed during read.");
    return bytes;
  } finally { await handle.close(); }
}

async function syncDirectory(directory) {
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function immutableJson(file, value) {
  const bytes = `${JSON.stringify(value)}\n`;
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try {
    try { await link(temporary, file); } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if ((await readRegular(file)).toString("utf8") !== bytes) {
        throw new Error("Task Attempt immutable record identity drifted.");
      }
    }
    await syncDirectory(dirname(file));
  } finally { await unlink(temporary); }
}

export function cloudTaskAttemptIdentity(requestId, outputS3Prefix, attempt) {
  if (!SAFE_ID.test(requestId) || !Number.isSafeInteger(attempt) || attempt < 1 || attempt > 3) {
    throw new Error("Task Attempt identity is invalid.");
  }
  // Keep old suffixes when representable; hash only long root IDs to retain the current 80-char contract.
  const retryRoot = requestId.length <= 70 ? requestId : `${requestId.slice(0, 53)}-${bytesHash(requestId).slice(0, 16)}`;
  return Object.freeze({ attempt,
    requestId: attempt === 1 ? requestId : `${retryRoot}-attempt-${attempt}`,
    outputS3Prefix: attempt === 1 ? outputS3Prefix.replace(/\/$/, "") : `${outputS3Prefix.replace(/\/$/, "")}/attempt-${attempt}` });
}

export async function openCloudTaskAttemptLedger({ repoRoot, requestId, taskId, outputS3Prefix,
  requestArgumentFingerprint, policy }) {
  if (!SAFE_ID.test(requestId) || !SAFE_ID.test(taskId) || !HASH.test(requestArgumentFingerprint)) {
    throw new Error("Task Attempt ledger identity is invalid.");
  }
  const lexicalRoot = resolve(repoRoot);
  const rootMetadata = await lstat(lexicalRoot);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) throw new Error("Unsafe Task Attempt ledger root.");
  let directory = await realpath(lexicalRoot);
  for (const part of [".codex-tmp", "lwdp-codex", "task-attempts", requestId]) {
    directory = join(directory, part);
    await mkdir(directory, { mode: 0o700 }).catch((error) => { if (error?.code !== "EEXIST") throw error; });
    const metadata = await lstat(directory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory() || await realpath(directory) !== directory) {
      throw new Error("Unsafe Task Attempt ledger directory.");
    }
  }
  const directoryIdentity = await lstat(directory);
  async function assertDirectory() {
    const metadata = await lstat(directory);
    if (metadata.isSymbolicLink() || metadata.ino !== directoryIdentity.ino ||
        metadata.dev !== directoryIdentity.dev || await realpath(directory) !== directory) {
      throw new Error("Task Attempt ledger directory changed.");
    }
  }
  const header = { kind: "worldkit-cloud-codex-task-attempt-ledger", schemaVersion: 1,
    requestId, taskId, outputS3Prefix: outputS3Prefix.replace(/\/$/, ""), requestArgumentFingerprint, policy };
  await immutableJson(join(directory, "identity.json"), header);
  const identity = (attempt) => cloudTaskAttemptIdentity(requestId, outputS3Prefix, attempt);
  async function readTerminal(attempt) {
    await assertDirectory();
    let raw;
    try { raw = await readRegular(join(directory, `attempt-${attempt}-terminal.json`)); }
    catch (error) { if (error?.code === "ENOENT") return null; throw error; }
    const row = JSON.parse(raw.toString("utf8"));
    const expected = identity(attempt);
    if (!exact(row, ["kind", "schemaVersion", "attempt", "requestId", "outputS3Prefix", "outcome", "evidence"]) ||
        row.kind !== "worldkit-cloud-codex-task-attempt-terminal" || row.schemaVersion !== 1 ||
        row.attempt !== attempt || row.requestId !== expected.requestId || row.outputS3Prefix !== expected.outputS3Prefix) {
      throw new Error("Task Attempt terminal record identity drifted.");
    }
    if (row.outcome === "completed") {
      if (!exact(row.evidence, ["jobId", "outputs"]) || !row.evidence.jobId || !Array.isArray(row.evidence.outputs) ||
          row.evidence.outputs.length === 0 || row.evidence.outputs.some((output) =>
            !exact(output, ["s3Uri", "localPath", "sha256"]) || !HASH.test(output.sha256))) {
        throw new Error("Task Attempt successful output evidence is invalid.");
      }
    } else if (row.outcome === "failed") {
      const evidence = row.evidence;
      if (!exact(evidence, ["requestId", "taskId", "jobId", "outputS3Prefix", "status", "retryClass", "outcomeCode", "deterministicStop", "evidenceSha256"]) ||
          evidence.requestId !== row.requestId || evidence.taskId !== taskId || evidence.outputS3Prefix !== row.outputS3Prefix ||
          typeof evidence.jobId !== "string" || !evidence.jobId || !HASH.test(evidence.evidenceSha256) ||
          !["succeeded", "completed", "failed", "submit_failed", "cancelled", "stopped"].includes(evidence.status) ||
          (evidence.retryClass !== null && !TERMINAL_TASK_RETRY_CLASSES.includes(evidence.retryClass)) ||
          evidence.outcomeCode !== (evidence.retryClass === "task-timeout" ? "task-timeout" : "task-rejected") ||
          typeof evidence.deterministicStop !== "boolean" ||
          ((evidence.deterministicStop || ["cancelled", "stopped"].includes(evidence.status)) && evidence.retryClass !== null)) {
        throw new Error("Task Attempt terminal failure evidence is invalid.");
      }
    } else throw new Error("Task Attempt terminal outcome is invalid.");
    return row;
  }
  async function recordTerminal(attempt, outcome, evidence) {
    await assertDirectory();
    await immutableJson(join(directory, `attempt-${attempt}-terminal.json`), {
      kind: "worldkit-cloud-codex-task-attempt-terminal", schemaVersion: 1, ...identity(attempt), outcome, evidence,
    });
    return readTerminal(attempt);
  }
  return Object.freeze({
    directory, identity, readTerminal,
    async prepare(attempt) {
      await assertDirectory();
      await immutableJson(join(directory, `attempt-${attempt}-prepared.json`), {
        kind: "worldkit-cloud-codex-task-attempt-prepared", schemaVersion: 1, ...identity(attempt),
        requestArgumentFingerprint,
      });
    },
    async recordFailure(attempt, evidence) { return recordTerminal(attempt, "failed", evidence); },
    async recordSuccess(attempt, { jobId, outputs }) {
      const hashed = [];
      for (const output of outputs) hashed.push({ ...output, sha256: bytesHash(await readRegular(output.localPath)) });
      return recordTerminal(attempt, "completed", { jobId, outputs: hashed });
    },
    async verifySuccess(row, expectedOutputs) {
      if (row.outcome !== "completed" || row.evidence.outputs.length !== expectedOutputs.length) {
        throw new Error("Task Attempt success output inventory drifted.");
      }
      for (let index = 0; index < expectedOutputs.length; index += 1) {
        const output = row.evidence.outputs[index];
        const expected = expectedOutputs[index];
        if (output.localPath !== await realpath(expected.localPath) || output.s3Uri !== expected.s3Uri ||
            bytesHash(await readRegular(output.localPath)) !== output.sha256) {
          throw new Error("Task Attempt successful output Hash drifted.");
        }
      }
    },
  });
}
