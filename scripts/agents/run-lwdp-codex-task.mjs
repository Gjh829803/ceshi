#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { mkdir, readFile, rm, stat } from "node:fs/promises";

import {
  assertSuccessfulJob,
  classifyCodexTaskFailureForRetry,
  downloadS3FileAtomic,
  fetchGenerationItems,
  joinS3Uri,
  LwdpJobPendingError,
  loadLwdpGenerationConfig,
  pollGenerationJob,
  resolveLwdpJobTimeoutMs,
  submitCodexGenerationJob,
  submittedJobId,
  uploadS3File,
} from "../lib/lwdp-generation-client.mjs";
import {
  probeCodexDeterministicAgentStop,
  probeCodexDeliveryEvidence,
  probeCodexRayInfrastructureFailure,
} from
  "../lib/lwdp-codex-delivery-evidence.mjs";
import { resolveCodexExecutionProfile } from "../lib/lwdp-codex-profile.mjs";

const retryableFormalStages = new Set([
  "planner",
  "builder",
  "coding-agent",
  "visual-reconstruction",
  "playthrough-planner",
  "episode-visual",
  "episode-opening-review",
]);

const maximumAttemptsEnvironmentKeyByStage = Object.freeze({
  planner: "WORLDKIT_LWDP_PLANNER_MAX_ATTEMPTS",
  builder: "WORLDKIT_LWDP_BUILDER_MAX_ATTEMPTS",
  "coding-agent": "WORLDKIT_LWDP_BUILDER_MAX_ATTEMPTS",
  "visual-reconstruction": "WORLDKIT_VISUAL_RECONSTRUCTION_MAX_ATTEMPTS",
  "playthrough-planner": "WORLDKIT_LWDP_EPISODE_CODEX_MAX_ATTEMPTS",
  "episode-visual": "WORLDKIT_LWDP_EPISODE_CODEX_MAX_ATTEMPTS",
  "episode-opening-review": "WORLDKIT_LWDP_EPISODE_CODEX_MAX_ATTEMPTS",
});

const priorAttemptsEnvironmentKeyByStage = Object.freeze({
  planner: "WORLDKIT_LWDP_PLANNER_PRIOR_ATTEMPTS",
  builder: "WORLDKIT_LWDP_BUILDER_PRIOR_ATTEMPTS",
  "coding-agent": "WORLDKIT_LWDP_BUILDER_PRIOR_ATTEMPTS",
  "visual-reconstruction": "WORLDKIT_LWDP_VISUAL_PRIOR_ATTEMPTS",
});

function boundedTaskAttempts(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 3) {
    throw new Error("--task-attempts must be an integer in [1, 3].");
  }
  return parsed;
}

function taskAttemptsForStage(stage, explicitValue, environment = process.env) {
  const environmentKey = maximumAttemptsEnvironmentKeyByStage[stage];
  const configured = explicitValue ?? (
    environmentKey === undefined ? undefined : environment[environmentKey]
  );
  const attempts = boundedTaskAttempts(
    configured ?? (retryableFormalStages.has(stage) ? 3 : 1),
  );
  if (!retryableFormalStages.has(stage) && attempts !== 1) {
    throw new Error(
      "Only formal Scene and Episode Codex stages support terminal-failure task attempts.",
    );
  }
  return attempts;
}

function priorTaskAttemptsForStage(stage, environment = process.env) {
  const key = priorAttemptsEnvironmentKeyByStage[stage];
  if (key === undefined || environment[key] === undefined || environment[key] === "") return 0;
  const parsed = Number(environment[key]);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative safe integer.`);
  }
  return parsed;
}

function retryDelayMsForAttempt(stage, failedAttempt, environment = process.env) {
  const legacyVisualDelay = stage === "visual-reconstruction"
    ? environment.WORLDKIT_VISUAL_RECONSTRUCTION_RETRY_DELAY_MS
    : undefined;
  const rawBaseDelay = environment.WORLDKIT_LWDP_STAGE_RETRY_BASE_DELAY_MS ??
    legacyVisualDelay ?? "30000";
  const baseDelayMs = Number(rawBaseDelay);
  if (
    !Number.isSafeInteger(baseDelayMs) ||
    baseDelayMs < 0 ||
    baseDelayMs > 300_000
  ) {
    throw new Error(
      "WORLDKIT_LWDP_STAGE_RETRY_BASE_DELAY_MS must be an integer in [0, 300000].",
    );
  }
  return Math.min(300_000, baseDelayMs * (4 ** Math.max(0, failedAttempt - 1)));
}

function parseArguments(argv) {
  const result = { contexts: [], assets: [], outputs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (["--context", "--asset", "--output"].includes(key)) {
      if (value === undefined) throw new Error(`Missing value after ${key}.`);
      result[key.slice(2) + "s"].push(value);
      index += 1;
    } else if (key === "--dry-run") {
      result.dryRun = true;
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
const executionProfile = resolveCodexExecutionProfile({
  executionProfile: args.executionProfile || "formal",
  model: args.model,
  reasoningEffort: args.reasoningEffort,
});
if (!args.outputS3Prefix) throw new Error("--output-s3-prefix is required.");
if (!args.instructionFile) throw new Error("--instruction-file is required.");
if (args.outputs.length === 0) throw new Error("At least one --output is required.");

const runToken = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
const cloudStageAttempt = Number(process.env.WORLDKIT_CLOUD_STAGE_ATTEMPT ?? 1);
if (!Number.isSafeInteger(cloudStageAttempt) || cloudStageAttempt < 1) {
  throw new Error("WORLDKIT_CLOUD_STAGE_ATTEMPT must be a positive safe integer.");
}
const cloudExecutionId = process.env.WORLDKIT_CLOUD_EXECUTION_ID ?? "";
if (cloudExecutionId && !/^exec_[a-z0-9]+$/.test(cloudExecutionId)) {
  throw new Error("WORLDKIT_CLOUD_EXECUTION_ID is invalid.");
}
const cloudRequestNamespace = [
  ...(cloudExecutionId ? [`cloud-exec-${cloudExecutionId.slice(-12)}`] : []),
  ...(cloudStageAttempt > 1 ? [`attempt-${cloudStageAttempt}`] : []),
].join("-") || null;
const effectiveOutputS3Prefix = cloudRequestNamespace === null
  ? args.outputS3Prefix
  : `${args.outputS3Prefix.replace(/\/$/, "")}/${cloudRequestNamespace}`;
const stagingRoot = resolve(repoRoot, ".codex-tmp", "lwdp-codex", `${taskId}-${runToken}`);
const smokeMode = process.env.WORLDKIT_LWDP_CLIENT_SMOKE === "1";
await mkdir(stagingRoot, { recursive: true });

try {
  const taskAssets = [];
  if (args.contexts.length > 0) {
    const contextPaths = args.contexts.map((item) => safeContextPath(repoRoot, item));
    const archivePath = resolve(stagingRoot, "workspace-context.tar.gz");
    await execFilePromise("tar", ["-czf", archivePath, "-C", repoRoot, ...contextPaths], repoRoot);
    const contextUri = joinS3Uri(effectiveOutputS3Prefix, "inputs", taskId, "workspace-context.tar.gz");
    if (!smokeMode) await uploadS3File(archivePath, contextUri);
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
    const digest = createHash("sha256").update(await readFile(absolutePath)).digest("hex").slice(0, 16);
    const suffix = extname(absolutePath).toLowerCase();
    const s3Uri = joinS3Uri(effectiveOutputS3Prefix, "inputs", taskId, `${id}-${digest}${suffix}`);
    if (!smokeMode) await uploadS3File(absolutePath, s3Uri);
    taskAssets.push({ id, name: `${id}${suffix}`, s3_uri: s3Uri, media_type: mediaType, attach_as: attachAs });
  }

  const outputSpecs = args.outputs.map((rawOutput) => {
    const [remotePath, localPath, contentType = "application/octet-stream"] =
      splitSpec(rawOutput, 2, "--output");
    if (!remotePath || remotePath.startsWith("/") || remotePath.split("/").includes("..")) {
      throw new Error(`Unsafe remote output path: ${remotePath}`);
    }
    return { remotePath, localPath: resolve(localPath), contentType };
  });

  const callerInstruction = await readFile(resolve(args.instructionFile), "utf8");
  const workspaceProtocol = args.contexts.length > 0
    ? `\n\nCloud workspace protocol:\n- Locate the input asset named workspace-context.tar.gz in the host-provided Input assets list and extract it into the current task working directory before reading project paths.\n- Treat extracted files and other attached inputs as read-only context.\n- Write only the host-declared output files at their exact Declared outputs paths.\n- Do not access credentials, unrelated directories, or external services. Host-provided built-in tools explicitly required by the caller instruction, such as image generation, are allowed.\n- The trusted local host performs contract validation after delivery; do not claim validation you did not run.`
    : "";
  const stage = args.stage || taskId;
  const timeoutMs = resolveLwdpJobTimeoutMs(stage);
  const configuredTaskAttemptLimit = taskAttemptsForStage(stage, args.taskAttempts);
  const priorTaskAttempts = priorTaskAttemptsForStage(stage);
  const configuredTaskAttempts = Math.max(
    1,
    configuredTaskAttemptLimit - priorTaskAttempts,
  );
  const requestedRequestId = args.requestId || `${taskId}-${runToken}`;
  const baseRequestId = cloudRequestNamespace === null
    ? requestedRequestId
    : `${requestedRequestId}-${cloudRequestNamespace}`;
  const baseOutputS3Prefix = effectiveOutputS3Prefix.replace(/\/$/, "");
  const payloadBase = {
    job_name: args.jobName || `worldkit ${taskId}`,
    defaults: {
      model: executionProfile.model,
      reasoning_effort: executionProfile.reasoningEffort,
      sandbox: "workspace-write",
      timeout_seconds: Number(args.timeoutSeconds || 1_800),
    },
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
      `WORLDKIT_LWDP_CODEX_SMOKE ${taskId} dispatch=single-task-fast-path tasks=1 profile=${executionProfile.name} model=${executionProfile.model} reasoning=${executionProfile.reasoningEffort} submitAttempts=${submitAttempts} taskAttempts=${configuredTaskAttempts} priorTaskAttempts=${priorTaskAttempts} timeoutMs=${timeoutMs} assets=${taskAssets.length} outputs=${outputSpecs.length} cloudExecutionId=${cloudExecutionId || "none"} cloudStageAttempt=${cloudStageAttempt} requestId=${baseRequestId} outputS3Prefix=${baseOutputS3Prefix}\n`,
    );
    process.exit(0);
  }

  const config = await loadLwdpGenerationConfig(
    process.env.WORLDKIT_LWDP_TEST_ENV_CONFIG === "1" ? process.env : undefined,
  );
  let successfulOutputPrefix = null;
  let remotePending = false;
  for (let taskAttempt = 1; taskAttempt <= configuredTaskAttempts; taskAttempt += 1) {
    const attemptOutputPrefix = taskAttempt === 1
      ? baseOutputS3Prefix
      : `${baseOutputS3Prefix}/attempt-${taskAttempt}`;
    const requestId = taskAttempt === 1
      ? baseRequestId
      : `${baseRequestId}-attempt-${taskAttempt}`;
    const payload = {
      ...payloadBase,
      job_name: taskAttempt === 1
        ? payloadBase.job_name
        : `${payloadBase.job_name} · retry ${taskAttempt}`,
      request_id: requestId,
      output_s3_prefix: attemptOutputPrefix,
    };
    let jobId = null;
    let lastJob = null;
    try {
      const submitted = await submitCodexGenerationJob(payload, { config });
      jobId = submittedJobId(submitted);
      if (submitted.recovered_by_request_id === true) {
        process.stdout.write(`WORLDKIT_LWDP_RECOVERED_BY_REQUEST_ID ${taskId} ${jobId}\n`);
      }
      process.stdout.write(
        `WORLDKIT_LWDP_JOB ${stage} ${taskId} ${jobId} dispatch=single-task-fast-path profile=${executionProfile.name} model=${executionProfile.model} reasoning=${executionProfile.reasoningEffort} requestId=${requestId} outputS3Prefix=${attemptOutputPrefix} taskAttempt=${priorTaskAttempts + taskAttempt}/${configuredTaskAttemptLimit}\n`,
      );
      if (args.dryRun) {
        process.stdout.write(`WORLDKIT_LWDP_DRY_RUN ${taskId} ${jobId}\n`);
        process.exit(0);
      }
      lastJob = await pollGenerationJob(jobId, {
        config,
        timeoutMs,
        nonTerminalCompletionProbe: () => probeCodexDeliveryEvidence({
          outputS3Prefix: attemptOutputPrefix,
          taskId,
          expectedOutputPaths: outputSpecs.map((output) => output.remotePath),
          stagingRoot,
        }),
        nonTerminalFailureProbe: (current) =>
          probeCodexRayInfrastructureFailure(current),
        onProgress: (current) => process.stdout.write(
          `WORLDKIT_LWDP_PROGRESS ${taskId} ${current.status} ${JSON.stringify(current.counters || {})}\n`,
        ),
      });
      let items;
      if (lastJob?.delivery_evidence?.itemsPayload) {
        items = lastJob.delivery_evidence.itemsPayload;
        process.stdout.write(
          `WORLDKIT_LWDP_DELIVERY_EVIDENCE ${stage} ${taskId} ${jobId}\n`,
        );
      } else {
        try {
          items = await fetchGenerationItems(jobId, { config });
        } catch (error) {
          if (classifyCodexTaskFailureForRetry(error) === "transport") {
            throw new LwdpJobPendingError(jobId, timeoutMs, lastJob, {
              cause: error,
              reason: "transport",
            });
          }
          throw error;
        }
      }
      try {
        assertSuccessfulJob(lastJob, items, [taskId]);
      } catch (error) {
        const deterministicStop = await probeCodexDeterministicAgentStop({
          itemsPayload: items,
          outputS3Prefix: attemptOutputPrefix,
          taskId,
          stagingRoot,
        });
        if (deterministicStop !== null) {
          throw new Error(
            `${deterministicStop.code}: Agent stopped before authoring because the required Runtime capability is unavailable.`,
            { cause: error },
          );
        }
        throw error;
      }
      successfulOutputPrefix = attemptOutputPrefix;
      break;
    } catch (error) {
      if (error instanceof LwdpJobPendingError || error?.code === "LWDP_JOB_PENDING") {
        const pendingJob = error.lastJob ?? lastJob ?? {};
        process.stdout.write(
          `WORLDKIT_LWDP_REMOTE_PENDING ${stage} ${taskId} ${error.jobId} ${requestId} ${attemptOutputPrefix} ${timeoutMs} ${String(pendingJob.status ?? "unknown")} ${JSON.stringify(pendingJob.counters ?? {})}\n`,
        );
        remotePending = true;
        process.exitCode = 4;
        break;
      }
      const retryClass = classifyCodexTaskFailureForRetry(error);
      const maximumAttemptsForFailure = retryClass === "task-timeout"
        ? Math.min(
            configuredTaskAttempts,
            Math.max(1, 2 - priorTaskAttempts),
          )
        : configuredTaskAttempts;
      if (retryClass !== null && taskAttempt < maximumAttemptsForFailure) {
        const retryDelayMs = retryDelayMsForAttempt(stage, taskAttempt);
        process.stdout.write(
          `WORLDKIT_LWDP_STAGE_RETRY ${stage} ${priorTaskAttempts + taskAttempt + 1} ${retryClass === "task-timeout" ? 2 : configuredTaskAttemptLimit} reason=${retryClass} previousJob=${jobId ?? "unsubmitted"} delayMs=${retryDelayMs}\n`,
        );
        await new Promise((resolvePromise) => setTimeout(resolvePromise, retryDelayMs));
        continue;
      }
      throw error;
    }
  }
  if (!remotePending) {
    if (successfulOutputPrefix === null) {
      throw new Error(`LWDP Codex task ${taskId} ended without a successful output prefix.`);
    }
    for (const output of outputSpecs) {
      await downloadS3FileAtomic(
        joinS3Uri(successfulOutputPrefix, "tasks", taskId, output.remotePath),
        output.localPath,
      );
    }
    process.stdout.write(`WORLDKIT_LWDP_TASK_READY ${taskId}\n`);
  }
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
