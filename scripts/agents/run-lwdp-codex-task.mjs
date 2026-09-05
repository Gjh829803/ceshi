#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { lstat, readFile, readdir, stat } from "node:fs/promises";

import {
  findGenerationJobByRequestId,
  joinS3Uri,
  loadLwdpGenerationConfig,
  submitCodexGenerationJob,
  submittedJobId,
  uploadS3File,
} from "../lib/lwdp-generation-client.mjs";
import {
  CodexTaskOutcomeError,
  serializeCodexTaskOutcomeEnvelopeV1,
} from "../lib/codex-task-outcome.mjs";
import { resolveCodexExecutionProfile } from "../lib/lwdp-codex-profile.mjs";
import {
  LWDP_CODEX_PENDING_JOURNAL_KIND,
  createLwdpCodexStagingDirectory,
  createPendingJournal,
  declaredOutputUris,
  lwdpCodexRequestArgumentFingerprint,
  reconcileLwdpCodexSameRequestId,
  removeLwdpCodexStagingDirectory,
  removePendingJournal,
  transitionPendingJournal,
  validateDeclaredOutputDestinations,
} from "./lwdp-codex-same-id-recovery.mjs";
import { openCloudTaskAttemptLedger } from "./lwdp-codex-task-attempt-ledger.mjs";
import {
  canRetryTerminalTask,
  resolveTerminalTaskRetryPolicy,
  terminalTaskFailureEvidence,
  terminalTaskRetryDelayMs,
} from "./lwdp-codex-task-retry.mjs";

function parseArguments(argv) {
  const result = { contexts: [], assets: [], outputs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (["--context", "--asset", "--output"].includes(key)) {
      if (value === undefined) throw new Error(`Missing value after ${key}.`);
      result[key.slice(2) + "s"].push(value);
      index += 1;
    } else if (key === "--dry-run" || key === "--reconcile-only") {
      result[key === "--dry-run" ? "dryRun" : "reconcileOnly"] = true;
    } else if (key?.startsWith("--")) {
      if (value === undefined) throw new Error(`Missing value after ${key}.`);
      result[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
    } else {
      throw new Error(`Unsupported argument: ${key}`);
    }
  }
  return result;
}

function splitSpec(value, fieldCount, label) {
  const parts = value.split("::");
  if (parts.length < fieldCount) throw new Error(`${label} must contain ${fieldCount} '::'-separated fields.`);
  return parts;
}

function safeTaskId(value) {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(value ?? "")) throw new Error("--task-id is invalid.");
  return value;
}

function safeContextPath(repoRoot, value) {
  const absolute = resolve(repoRoot, value);
  const rel = relative(repoRoot, absolute);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Unsafe context path: ${value}`);
  return rel;
}

async function assertSafeContextTree(root) {
  const metadata = await lstat(root);
  if (metadata.isSymbolicLink()) {
    throw new Error(`Symlinks are not allowed in cloud Codex inputs: ${root}`);
  }
  if (metadata.isDirectory()) {
    for (const entry of await readdir(root)) {
      await assertSafeContextTree(resolve(root, entry));
    }
    return;
  }
  if (!metadata.isFile()) {
    throw new Error(`Unsupported cloud Codex input: ${root}`);
  }
}

function execFilePromise(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { cwd, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`${command} failed: ${String(stderr || error.message).trim()}`));
      resolvePromise({ stdout, stderr });
    });
  });
}

const args = parseArguments(process.argv.slice(2));
const repoRoot = resolve(args.repoRoot || process.cwd());
const taskId = safeTaskId(args.taskId);
const runToken = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
const requestId = safeTaskId(args.requestId || `${taskId}-${runToken}`);
const retryPolicy = resolveTerminalTaskRetryPolicy(args.stage || taskId, args.taskAttempts);
const executionProfile = resolveCodexExecutionProfile({
  executionProfile: args.executionProfile || "formal",
  model: args.model,
  reasoningEffort: args.reasoningEffort,
});
let outcomeEmitted = false;
const emitOutcome = (outcome) => {
  if (outcomeEmitted) throw new Error("Codex task outcome was emitted more than once.");
  outcomeEmitted = true;
  process.stdout.write(serializeCodexTaskOutcomeEnvelopeV1({
    kind: "worldkit-codex-task-outcome",
    schemaVersion: 1,
    requestId,
    outcome,
  }));
};

const canFullyRecover = Boolean(
  args.outputS3Prefix && args.instructionFile && args.outputs.length > 0,
);
if (args.reconcileOnly && !canFullyRecover) {
  try {
    const config = await loadLwdpGenerationConfig();
    const recovered = await findGenerationJobByRequestId(requestId, {
      config,
      pipeline: "codex",
      maxAttempts: 1,
    });
    const recoveredRequestId = recovered?.job?.request_id ?? recovered?.request_id;
    if (recoveredRequestId !== undefined && recoveredRequestId !== requestId) {
      throw new Error("LWDP reconciliation returned a different request identity.");
    }
    emitOutcome("request-found");
    process.exit(0);
  } catch (error) {
    if (error?.status === 404) {
      emitOutcome("request-missing");
      process.exit(0);
    }
    emitOutcome("creation-outcome-unknown");
    process.stderr.write("Codex request reconciliation did not produce a definitive result.\n");
    process.exit(1);
  }
}

if (!args.outputS3Prefix) throw new Error("--output-s3-prefix is required.");
if (!args.instructionFile) throw new Error("--instruction-file is required.");
if (args.outputs.length === 0) throw new Error("At least one --output is required.");

const outputSpecs = args.outputs.map((rawOutput) => {
  const [remotePath, localPath, contentType = "application/octet-stream"] =
    splitSpec(rawOutput, 2, "--output");
  if (!remotePath || remotePath.startsWith("/") || remotePath.split("/").includes("..")) {
    throw new Error(`Unsafe remote output path: ${remotePath}`);
  }
  return { remotePath, localPath: resolve(localPath), contentType };
});
const callerInstruction = await readFile(resolve(args.instructionFile), "utf8");
const instructionSha256 = createHash("sha256").update(callerInstruction).digest("hex");
const outputUriSet = declaredOutputUris(args.outputS3Prefix, taskId, outputSpecs);
const pendingDefaults = {
  model: executionProfile.model,
  reasoning_effort: executionProfile.reasoningEffort,
  sandbox: "workspace-write",
  timeout_seconds: Number(args.timeoutSeconds || 1_800),
};
const stagingRoot = await createLwdpCodexStagingDirectory(repoRoot, `${taskId}-${runToken}`);
const smokeMode = process.env.WORLDKIT_LWDP_CLIENT_SMOKE === "1";
let stagingRemoved = false;
const cleanupStaging = async () => {
  if (stagingRemoved) return;
  await removeLwdpCodexStagingDirectory(repoRoot, stagingRoot);
  stagingRemoved = true;
};

try {
  const taskAssets = [];
  const pendingUploads = [];
  const inputContents = [];
  if (args.workspaceContextRoot && args.contexts.length > 0) {
    throw new Error("--workspace-context-root and --context are mutually exclusive.");
  }
  const hasWorkspaceContext = Boolean(
    args.workspaceContextRoot || args.contexts.length > 0,
  );
  if (hasWorkspaceContext) {
    const archivePath = resolve(stagingRoot, "workspace-context.tar.gz");
    if (args.workspaceContextRoot) {
      const contextRootRelativePath = safeContextPath(
        repoRoot,
        args.workspaceContextRoot,
      );
      const contextRoot = resolve(repoRoot, contextRootRelativePath);
      const metadata = await lstat(contextRoot);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error("--workspace-context-root must be a canonical directory.");
      }
      await assertSafeContextTree(contextRoot);
      await execFilePromise(
        "tar",
        ["-czf", archivePath, "-C", contextRoot, "."],
        repoRoot,
      );
    } else {
      const contextPaths = args.contexts.map((item) =>
        safeContextPath(repoRoot, item)
      );
      await execFilePromise(
        "tar",
        ["-czf", archivePath, "-C", repoRoot, ...contextPaths],
        repoRoot,
      );
    }
    const contextSha256 = createHash("sha256").update(await readFile(archivePath)).digest("hex");
    const contextUri = joinS3Uri(args.outputS3Prefix, "inputs", taskId, "workspace-context.tar.gz");
    if (!smokeMode) pendingUploads.push({ localPath: archivePath, s3Uri: contextUri });
    inputContents.push({ id: "workspace-context", sha256: contextSha256 });
    taskAssets.push({
      id: "workspace-context",
      name: "workspace-context.tar.gz",
      s3_uri: contextUri,
      media_type: "application/gzip",
      attach_as: "file",
    });
  }

  for (const rawAsset of args.assets) {
    const [id, localPath, attachAs = "file", mediaType = "application/octet-stream"] =
      splitSpec(rawAsset, 2, "--asset");
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id)) throw new Error(`Invalid asset id: ${id}`);
    if (!["file", "image", "video"].includes(attachAs)) throw new Error(`Invalid attach_as: ${attachAs}`);
    const absolutePath = resolve(localPath);
    const metadata = await stat(absolutePath);
    if (!metadata.isFile() || metadata.size === 0) throw new Error(`Asset is not a non-empty file: ${localPath}`);
    const contentSha256 = createHash("sha256").update(await readFile(absolutePath)).digest("hex");
    const digest = contentSha256.slice(0, 16);
    const suffix = extname(absolutePath).toLowerCase();
    const s3Uri = joinS3Uri(args.outputS3Prefix, "inputs", taskId, `${id}-${digest}${suffix}`);
    if (!smokeMode) pendingUploads.push({ localPath: absolutePath, s3Uri });
    inputContents.push({ id, sha256: contentSha256 });
    taskAssets.push({ id, name: `${id}${suffix}`, s3_uri: s3Uri, media_type: mediaType, attach_as: attachAs });
  }

  const workspaceProtocol = hasWorkspaceContext
    ? `\n\nCloud workspace protocol:\n- Locate the input asset named workspace-context.tar.gz in the host-provided Input assets list and extract it into the current task working directory before reading project paths.\n- Treat extracted files and other attached inputs as read-only context.\n- Write only the host-declared output files at their exact Declared outputs paths.\n- Do not access credentials, unrelated directories, or external services. Host-provided built-in tools explicitly required by the caller instruction, such as image generation, are allowed.\n- The trusted local host performs contract validation after delivery; do not claim validation you did not run.`
    : "";
  const payload = {
    job_name: args.jobName || `worldkit ${taskId}`,
    request_id: requestId,
    output_s3_prefix: args.outputS3Prefix,
    defaults: pendingDefaults,
    tasks: [{
      id: taskId,
      instruction: `${callerInstruction}${workspaceProtocol}`,
      assets: taskAssets,
      outputs: outputSpecs.map(({ remotePath, contentType }) => ({
        path: remotePath,
        required: true,
        content_type: contentType,
      })),
    }],
    dry_run: Boolean(args.dryRun),
  };
  const ownerToken = randomBytes(16).toString("hex");
  const pendingJournal = {
    kind: LWDP_CODEX_PENDING_JOURNAL_KIND,
    schemaVersion: 1,
    requestId,
    taskId,
    outputS3Prefix: args.outputS3Prefix,
    declaredOutputUris: outputUriSet,
    outputs: outputSpecs,
    requestArgumentFingerprint: lwdpCodexRequestArgumentFingerprint({
      payload,
      localOutputs: outputSpecs,
      inputContents,
    }),
    instructionSha256,
    defaults: pendingDefaults,
    phase: "prepared",
    ownerToken,
    jobId: null,
  };

  const defaultSubmitAttempts = 1;
  const submitAttempts = Number(args.submitAttempts || defaultSubmitAttempts);
  if (!Number.isSafeInteger(submitAttempts) || submitAttempts < 1 || submitAttempts > 4) {
    throw new Error("--submit-attempts must be an integer in [1, 4].");
  }
  if (submitAttempts !== 1) {
    throw new Error("WorldKit submits every LWDP Codex creation request exactly once, then recovers by request_id.");
  }

  if (smokeMode) {
    process.stdout.write(
      `WORLDKIT_LWDP_CODEX_SMOKE ${taskId} dispatch=single-task-fast-path tasks=1 profile=${executionProfile.name} model=${executionProfile.model} reasoning=${executionProfile.reasoningEffort} submitAttempts=${submitAttempts} assets=${taskAssets.length} outputs=${outputSpecs.length}\n`,
    );
    await cleanupStaging();
    emitOutcome("completed");
    process.exit(0);
  }

  const config = await loadLwdpGenerationConfig();
  const ledger = args.dryRun ? null : await openCloudTaskAttemptLedger({
    repoRoot, requestId, taskId, outputS3Prefix: args.outputS3Prefix,
    requestArgumentFingerprint: pendingJournal.requestArgumentFingerprint, policy: retryPolicy,
  });
  const maximumAttempts = Math.max(1, retryPolicy.maximumAttempts - retryPolicy.priorAttempts);
  let successfulJobId;
  async function executeAttempt(attempt, attemptIdentity) {
    const attemptPayload = { ...payload, request_id: attemptIdentity.requestId,
      output_s3_prefix: attemptIdentity.outputS3Prefix,
      job_name: attempt === 1 ? payload.job_name : `${payload.job_name} · retry ${attempt}` };
    const attemptJournal = { ...pendingJournal, requestId: attemptIdentity.requestId,
      outputS3Prefix: attemptIdentity.outputS3Prefix,
      declaredOutputUris: declaredOutputUris(attemptIdentity.outputS3Prefix, taskId, outputSpecs),
      requestArgumentFingerprint: lwdpCodexRequestArgumentFingerprint({
        payload: attemptPayload, localOutputs: outputSpecs, inputContents,
      }) };
    const onCompleted = ledger ? (result) => ledger.recordSuccess(attempt, result) : undefined;
    const ownership = await createPendingJournal(attemptJournal, { repoRoot });
    if (!ownership.created || args.reconcileOnly) {
      if (ownership.created && args.reconcileOnly) {
        await removePendingJournal(repoRoot, attemptIdentity.requestId);
        throw new Error("LWDP same-request-id recovery pending journal is missing.");
      }
      const recovered = await reconcileLwdpCodexSameRequestId({
        repoRoot,
        current: attemptJournal,
        config,
        onCompleted,
        allowExistingMatchingOutputs: true,
      });
      successfulJobId = recovered.jobId;
      return;
    }

    try {
      await validateDeclaredOutputDestinations(repoRoot, outputSpecs);
      for (const upload of pendingUploads) {
        await uploadS3File(upload.localPath, upload.s3Uri);
      }
    } catch (error) {
      await removePendingJournal(repoRoot, attemptIdentity.requestId);
      throw error;
    }

    let submissionUnknownJournal;
    try {
      submissionUnknownJournal = await transitionPendingJournal(
        { ...attemptJournal, phase: "submission-unknown" },
        { repoRoot, expectedPhase: "prepared", expectedOwnerToken: ownerToken },
      );
    } catch (error) {
      await removePendingJournal(repoRoot, attemptIdentity.requestId);
      throw error;
    }

    try {
      // The durable unknown phase is intentionally the final local operation before the one POST.
      const submitted = await submitCodexGenerationJob(attemptPayload, { config });
      const jobId = submittedJobId(submitted);
      await transitionPendingJournal(
        { ...submissionUnknownJournal, phase: "attached", jobId },
        { repoRoot, expectedPhase: "submission-unknown", expectedOwnerToken: ownerToken },
      );
      if (submitted.recovered_by_request_id === true) {
        process.stdout.write(`WORLDKIT_LWDP_RECOVERED_BY_REQUEST_ID ${taskId} ${jobId}\n`);
      }
      process.stdout.write(
        `WORLDKIT_LWDP_TASK_ATTEMPT_JOB ${args.stage || taskId} ${taskId} ${jobId} requestId=${attemptIdentity.requestId} taskAttempt=${attempt} dispatch=single-task-fast-path profile=${executionProfile.name} model=${executionProfile.model} reasoning=${executionProfile.reasoningEffort}\n`,
      );
      if (args.dryRun) {
        process.stdout.write(`WORLDKIT_LWDP_DRY_RUN ${taskId} ${jobId}\n`);
        await removePendingJournal(repoRoot, attemptIdentity.requestId);
        successfulJobId = jobId;
        return;
      }
    } catch (error) {
      if (!(error instanceof CodexTaskOutcomeError) || error.outcomeCode !== "creation-outcome-unknown") {
        throw error;
      }
    }

    const recovered = await reconcileLwdpCodexSameRequestId({
      repoRoot,
      current: attemptJournal,
      config,
      onCompleted,
    });
    successfulJobId = recovered.jobId;
  }
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const attemptIdentity = ledger?.identity(attempt) ?? { requestId, outputS3Prefix: args.outputS3Prefix };
    const previous = await ledger?.readTerminal(attempt);
    if (previous?.outcome === "completed") {
      await ledger.verifySuccess(previous, outputSpecs.map((output) => ({
        localPath: output.localPath,
        s3Uri: joinS3Uri(attemptIdentity.outputS3Prefix, "tasks", taskId, output.remotePath),
      })));
      successfulJobId = previous.evidence.jobId;
      break;
    }
    let failure = previous?.evidence ?? null;
    if (!failure) {
      await ledger?.prepare(attempt);
      try {
        await executeAttempt(attempt, attemptIdentity);
        break;
      } catch (error) {
        failure = terminalTaskFailureEvidence(error);
        if (!failure) throw error;
        await ledger.recordFailure(attempt, failure);
      }
    }
    if (!canRetryTerminalTask(retryPolicy, attempt, failure.retryClass)) {
      throw new CodexTaskOutcomeError(failure.outcomeCode,
        `LWDP Cloud task ended after terminal attempt ${attempt}; reason=${failure.retryClass ?? "non-retryable"}.`);
    }
    if (args.reconcileOnly) {
      // Explicit recovery may finish an already-submitted later attempt, but it
      // never creates a replacement task. Normal invocation continues the ledger.
      const next = ledger.identity(attempt + 1);
      process.stdout.write(`WORLDKIT_LWDP_RECONCILE_NEXT ${taskId} ${next.requestId}\n`);
    } else {
      const delayMs = terminalTaskRetryDelayMs(retryPolicy, attempt);
      process.stdout.write(`WORLDKIT_LWDP_STAGE_RETRY ${retryPolicy.stage} ${retryPolicy.priorAttempts + attempt + 1} ${failure.retryClass === "task-timeout" ? 2 : retryPolicy.maximumAttempts} reason=${failure.retryClass} previousJob=${failure.jobId} delayMs=${delayMs}\n`);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
    }
  }
  if (!successfulJobId) throw new Error("Cloud Codex task ended without verified successful task evidence.");
  process.stdout.write(`WORLDKIT_LWDP_JOB ${args.stage || taskId} ${taskId} ${successfulJobId} dispatch=single-task-fast-path profile=${executionProfile.name} model=${executionProfile.model} reasoning=${executionProfile.reasoningEffort}\n`);
  process.stdout.write(`WORLDKIT_LWDP_TASK_READY ${taskId}\n`);
  await cleanupStaging();
  emitOutcome("completed");
} catch (error) {
  emitOutcome(error instanceof CodexTaskOutcomeError
    ? error.outcomeCode
    : "task-rejected");
  throw error;
} finally {
  await cleanupStaging();
}
