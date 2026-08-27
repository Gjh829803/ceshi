#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { mkdir, readFile, rm, stat } from "node:fs/promises";

import {
  assertSuccessfulJob,
  downloadS3FileAtomic,
  fetchGenerationItems,
  joinS3Uri,
  loadLwdpGenerationConfig,
  pollGenerationJob,
  submitCodexGenerationJob,
  submittedJobId,
  uploadS3File,
} from "../lib/lwdp-generation-client.mjs";
import { resolveCodexExecutionProfile } from "../lib/lwdp-codex-profile.mjs";

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
const stagingRoot = resolve(repoRoot, ".codex-tmp", "lwdp-codex", `${taskId}-${runToken}`);
const smokeMode = process.env.WORLDKIT_LWDP_CLIENT_SMOKE === "1";
await mkdir(stagingRoot, { recursive: true });

try {
  const taskAssets = [];
  if (args.contexts.length > 0) {
    const contextPaths = args.contexts.map((item) => safeContextPath(repoRoot, item));
    const archivePath = resolve(stagingRoot, "workspace-context.tar.gz");
    await execFilePromise("tar", ["-czf", archivePath, "-C", repoRoot, ...contextPaths], repoRoot);
    const contextUri = joinS3Uri(args.outputS3Prefix, "inputs", taskId, "workspace-context.tar.gz");
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
    const s3Uri = joinS3Uri(args.outputS3Prefix, "inputs", taskId, `${id}-${digest}${suffix}`);
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
  const payload = {
    job_name: args.jobName || `worldkit ${taskId}`,
    request_id: args.requestId || `${taskId}-${runToken}`,
    output_s3_prefix: args.outputS3Prefix,
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
      `WORLDKIT_LWDP_CODEX_SMOKE ${taskId} dispatch=single-task-fast-path tasks=1 profile=${executionProfile.name} model=${executionProfile.model} reasoning=${executionProfile.reasoningEffort} submitAttempts=${submitAttempts} assets=${taskAssets.length} outputs=${outputSpecs.length}\n`,
    );
    process.exit(0);
  }

  const config = await loadLwdpGenerationConfig();
  const submitted = await submitCodexGenerationJob(payload, { config });
  const jobId = submittedJobId(submitted);
  if (submitted.recovered_by_request_id === true) {
    process.stdout.write(`WORLDKIT_LWDP_RECOVERED_BY_REQUEST_ID ${taskId} ${jobId}\n`);
  }
  process.stdout.write(
    `WORLDKIT_LWDP_JOB ${args.stage || taskId} ${taskId} ${jobId} dispatch=single-task-fast-path profile=${executionProfile.name} model=${executionProfile.model} reasoning=${executionProfile.reasoningEffort}\n`,
  );
  if (args.dryRun) {
    process.stdout.write(`WORLDKIT_LWDP_DRY_RUN ${taskId} ${jobId}\n`);
    process.exit(0);
  }
  const job = await pollGenerationJob(jobId, {
    config,
    onProgress: (current) => process.stdout.write(
      `WORLDKIT_LWDP_PROGRESS ${taskId} ${current.status} ${JSON.stringify(current.counters || {})}\n`,
    ),
  });
  const items = await fetchGenerationItems(jobId, { config });
  assertSuccessfulJob(job, items, [taskId]);
  for (const output of outputSpecs) {
    await downloadS3FileAtomic(
      joinS3Uri(args.outputS3Prefix, "tasks", taskId, output.remotePath),
      output.localPath,
    );
  }
  process.stdout.write(`WORLDKIT_LWDP_TASK_READY ${taskId}\n`);
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
