#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  claimCloudExecutionStage,
  cloudExecutionRecord,
  getCloudExecution,
  reportCloudExecutionStageProgress,
} from "../lib/lwdp-cloud-execution-client.mjs";
import {
  assertS3Uri,
  downloadS3FileAtomic,
  joinS3Uri,
} from "../lib/lwdp-generation-client.mjs";
import {
  buildCloudArtifactManifest,
  hydrateCloudArtifactManifest,
  sha256File,
  uploadCloudArtifactManifest,
} from "../lib/worldkit-cloud-artifacts.mjs";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const terminalStatuses = new Set(["succeeded", "failed", "interrupted", "cancelled"]);

export function isRetryableCloudHostCaptureFailure(log) {
  const source = String(log ?? "");
  return /CLI_(?:CAPTURE_FAILED|SERVER_START_FAILED)/.test(source) &&
    /Execution context was destroyed|most likely because of a navigation|Target page, context or browser has been closed|page\.waitForFunction: Timeout|WORLDKIT_CAPTURE_STARTUP_(?:STALLED|HARD_TIMEOUT)|PLAYWRIGHT_BROWSER_UNAVAILABLE|SERVER_START_(?:TIMEOUT|FAILED)/i.test(source) &&
    !/WORLDKIT_CAPTURE_VISIBLE_WORLD_MISSING|ENTRY_THIRD_PERSON|BLOCK_WORLD_/i.test(source);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value after ${argument}.`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required.`);
  return value;
}

function singleLineSecret(value, label) {
  const normalized = requiredString(value, label);
  if (/[\r\n]/.test(normalized)) throw new Error(`${label} must be one line.`);
  return normalized;
}

export async function materializeCloudWorkerLwdpConfig({
  repoRoot,
  environment = process.env,
}) {
  const token = singleLineSecret(
    environment.LWDP_GENERATION_API_TOKEN,
    "LWDP_GENERATION_API_TOKEN",
  );
  const baseUrl = singleLineSecret(
    environment.LWDP_API_BASE ?? "https://lwdp.loopit.me",
    "LWDP_API_BASE",
  ).replace(/\/$/, "");
  const userId = singleLineSecret(
    environment.LWDP_USER_ID ?? "worldkit-studio",
    "LWDP_USER_ID",
  );
  const runtimeRoot = join(repoRoot, ".codex-tmp", "runtime-config");
  await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
  await writeFile(join(runtimeRoot, "lwdp.env"), [
    `LWDP_API_BASE=${baseUrl}`,
    `LWDP_USER_ID=${userId}`,
    `LWDP_GENERATION_API_TOKEN=${token}`,
    "",
  ].join("\n"), { mode: 0o600, flag: "w" });
  return { baseUrl, userId, token };
}

async function nonemptyPath(filePath) {
  try {
    const metadata = await stat(filePath);
    if (metadata.isFile()) return metadata.size > 0;
    if (metadata.isDirectory()) return (await readdir(filePath)).length > 0;
    return false;
  } catch {
    return false;
  }
}

export async function hasPlayableCloudWhitebox(sceneRoot, scenePlanRoot) {
  const requiredPaths = [
    join(sceneRoot, "world.mjs"),
    join(sceneRoot, "authoring.json"),
    join(sceneRoot, "scene-implementation-map.json"),
    join(sceneRoot, "world.build.json"),
    join(sceneRoot, "opening-frame.png"),
    join(sceneRoot, "runtime-snapshot.json"),
    join(sceneRoot, "whitebox-capture-receipt.json"),
    join(sceneRoot, "entry-third-person-validation.json"),
    join(scenePlanRoot, "entry-whitebox-target.png"),
    join(scenePlanRoot, "world-plan.png"),
  ];
  return (await Promise.all(requiredPaths.map(nonemptyPath))).every(Boolean);
}

export function parseCloudSceneRequest(value) {
  const request = typeof value === "string" ? JSON.parse(value) : value;
  if (request?.kind !== "worldkit-cloud-scene-request" || request?.schemaVersion !== 1) {
    throw new Error("Cloud Scene request must be worldkit-cloud-scene-request schemaVersion 1.");
  }
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(String(request.sceneId ?? ""))) {
    throw new Error("Cloud Scene request sceneId is invalid.");
  }
  requiredString(request.prompt, "request.prompt");
  if (!Array.isArray(request.references)) throw new Error("request.references must be an array.");
  for (const reference of request.references) {
    assertS3Uri(reference?.s3Uri);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(String(reference?.fileName ?? ""))) {
      throw new Error("Cloud Scene reference fileName is invalid.");
    }
  }
  return request;
}

function leaseIdFromClaim(payload) {
  return requiredString(
    payload?.lease_id ?? payload?.lease?.lease_id ?? payload?.attempt?.lease_id,
    "lease_id",
  );
}

export async function claimCloudSceneStageWithWait({
  executionId,
  stageId,
  workerId,
  leaseSeconds,
  apiOptions,
  maximumAttempts = 60,
  delayMs = 2_000,
  claimImplementation = claimCloudExecutionStage,
  getExecutionImplementation = getCloudExecution,
  sleepImplementation = (milliseconds) => new Promise(
    (resolvePromise) => setTimeout(resolvePromise, milliseconds),
  ),
}) {
  let lastError;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await claimImplementation(
        executionId,
        stageId,
        { worker_id: workerId, lease_seconds: leaseSeconds },
        apiOptions,
      );
    } catch (error) {
      lastError = error;
      if (error?.status !== 409 || attempt === maximumAttempts) throw error;
      const execution = cloudExecutionRecord(
        await getExecutionImplementation(executionId, apiOptions),
      );
      if (terminalStatuses.has(String(execution.status))) {
        throw new Error(
          `Cloud Execution became ${execution.status} before ${stageId} could be claimed.`,
          { cause: error },
        );
      }
      await sleepImplementation(delayMs);
    }
  }
  throw lastError ?? new Error(`Unable to claim Cloud Execution stage ${stageId}.`);
}

function appendOutput(stream, logStream, onLine) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    logStream.write(chunk);
    process.stdout.write(chunk);
    pending += chunk;
    for (;;) {
      const newline = pending.indexOf("\n");
      if (newline < 0) break;
      const line = pending.slice(0, newline).replace(/\r$/, "");
      pending = pending.slice(newline + 1);
      onLine(line);
    }
  });
  stream.on("end", () => {
    if (pending) onLine(pending);
  });
}

function waitForChild(child) {
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolvePromise({ code, signal }));
  });
}

export async function verifyPlayableCloudWhitebox({
  sceneId,
  sceneRoot,
  repoRoot,
  trustedCapturePublicKeyPath,
  spawnImplementation = spawn,
}) {
  requiredString(trustedCapturePublicKeyPath, "trusted_capture_public_key_path");
  const arguments_ = [
    "exec", "tsx", "scripts/cli/verify-hosted-whitebox-artifacts.ts",
    "--scene-id", sceneId,
    "--authoring", join(sceneRoot, "authoring.json"),
    "--build", join(sceneRoot, "world.build.json"),
    "--opening-frame", join(sceneRoot, "opening-frame.png"),
    "--runtime-snapshot", join(sceneRoot, "runtime-snapshot.json"),
    "--capture-receipt", join(sceneRoot, "whitebox-capture-receipt.json"),
    "--trusted-public-key", trustedCapturePublicKeyPath,
  ];
  const child = spawnImplementation("pnpm", arguments_, {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const result = await waitForChild(child);
  return { ok: result.code === 0, output, code: result.code, signal: result.signal };
}

async function endLogStream(stream) {
  await new Promise((resolvePromise, reject) => {
    stream.once("error", reject);
    stream.end(resolvePromise);
  });
}

export async function runCloudSceneWorker({
  executionId,
  stageId = "scene-production",
  requestS3Uri,
  outputS3Prefix,
  workerId = `worldkit-${process.env.HOSTNAME || randomUUID()}`,
  repoRoot = sourceRoot,
  heartbeatIntervalMs = 30_000,
  leaseSeconds = 900,
  cloudConfig,
  fetchImplementation,
  spawnImplementation = spawn,
  downloadImplementation = downloadS3FileAtomic,
  uploadOptions = {},
  keepWorkspace = false,
  trustedCapturePublicKeyPath = process.env.WORLDKIT_CAPTURE_TRUSTED_PUBLIC_KEY_PATH,
  verifyPlayableImplementation = verifyPlayableCloudWhitebox,
  resumeManifestS3Uri = undefined,
  resumeSourceExecutionId = undefined,
  resumeMode = "verify-only",
}) {
  requiredString(executionId, "execution_id");
  requiredString(stageId, "stage_id");
  assertS3Uri(requestS3Uri);
  assertS3Uri(outputS3Prefix);
  if (resumeManifestS3Uri !== undefined) assertS3Uri(resumeManifestS3Uri);
  if (resumeSourceExecutionId !== undefined) {
    requiredString(resumeSourceExecutionId, "resume_source_execution_id");
    if (resumeManifestS3Uri === undefined) {
      throw new Error("resume_source_execution_id requires resume_manifest_s3_uri.");
    }
  }
  if (!["verify-only", "builder", "host"].includes(resumeMode)) {
    throw new Error("resume_mode must be verify-only, builder, or host.");
  }
  if (resumeManifestS3Uri === undefined && resumeMode !== "verify-only") {
    throw new Error("resume_mode builder or host requires resume_manifest_s3_uri.");
  }
  const temporaryRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-scene-"));
  const requestPath = join(temporaryRoot, "request.json");
  const inputRoot = join(temporaryRoot, "inputs");
  const logPath = join(temporaryRoot, "pipeline.log");
  let leaseId;
  let currentInternalStage = "claiming";
  const workerStartedAtMs = Date.now();
  let currentInternalStageStartedAtMs = workerStartedAtMs;
  let currentGenerationJobId = null;
  let currentGenerationTaskId = null;
  let currentGenerationJobStartedAtMs = null;
  const completedGenerationJobs = [];
  let child;
  let heartbeat;
  let cancelled = false;
  let externalTerminalStatus = null;
  let terminalReported = false;
  let logStream;
  const apiOptions = { config: cloudConfig, fetchImplementation };
  const report = async (status, extra = {}) => reportCloudExecutionStageProgress(
    executionId,
    stageId,
    {
      status,
      lease_id: leaseId,
      diagnostics: {
        internal_stage: currentInternalStage,
        internal_stage_started_at: new Date(currentInternalStageStartedAtMs).toISOString(),
        internal_stage_elapsed_seconds: Math.floor(
          (Date.now() - currentInternalStageStartedAtMs) / 1_000,
        ),
        worker_elapsed_seconds: Math.floor((Date.now() - workerStartedAtMs) / 1_000),
        inner_generation_job_id: currentGenerationJobId,
        inner_generation_task_id: currentGenerationTaskId,
        inner_generation_job_elapsed_seconds: currentGenerationJobStartedAtMs === null
          ? null
          : Math.floor((Date.now() - currentGenerationJobStartedAtMs) / 1_000),
        inner_generation_jobs: completedGenerationJobs,
        resumed_from_manifest_s3_uri: resumeManifestS3Uri ?? null,
        resumed_from_execution_id: resumeSourceExecutionId ?? null,
        resume_mode: resumeManifestS3Uri === undefined ? null : resumeMode,
        worker_id: workerId,
        ...extra.diagnostics,
      },
      ...(extra.artifacts ? { artifacts: extra.artifacts } : {}),
    },
    apiOptions,
  );

  try {
    const claim = await claimCloudSceneStageWithWait({
      executionId,
      stageId,
      workerId,
      leaseSeconds,
      apiOptions,
    });
    leaseId = leaseIdFromClaim(claim);
    currentInternalStage = "input-download";
    await report("running");
    await downloadImplementation(requestS3Uri, requestPath, uploadOptions);
    const request = parseCloudSceneRequest(await readFile(requestPath, "utf8"));
    await mkdir(inputRoot, { recursive: true });
    const imagePaths = [];
    for (const reference of request.references) {
      const localPath = join(inputRoot, reference.fileName);
      await downloadImplementation(reference.s3Uri, localPath, uploadOptions);
      if (reference.sha256) {
        const observedHash = await sha256File(localPath);
        if (observedHash !== reference.sha256) {
          throw new Error(
            `Reference integrity mismatch for ${reference.fileName}: ` +
              `expected ${reference.sha256}, observed ${observedHash}.`,
          );
        }
      }
      imagePaths.push(localPath);
    }

    const sceneRoot = join(repoRoot, "artifacts", "scenes", request.sceneId);
    const scenePlanRoot = join(repoRoot, "apps", "playground", "public", "scene-plans", request.sceneId);
    await rm(sceneRoot, { recursive: true, force: true });
    await rm(scenePlanRoot, { recursive: true, force: true });

    const runPipelineCommand = async (commandArgs, initialStage, logFlags) => {
      currentInternalStage = initialStage;
      currentInternalStageStartedAtMs = Date.now();
      logStream = createWriteStream(logPath, { flags: logFlags, mode: 0o600 });
      child = spawnImplementation("pnpm", commandArgs, {
        cwd: repoRoot,
        env: {
          ...process.env,
          WORLDKIT_CODEX_BACKEND: "cloud",
          WORLDKIT_CLOUD_EXECUTION_ID: executionId,
          WORLDKIT_CLOUD_EXECUTION_STAGE_ID: stageId,
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
      const onLine = (line) => {
        const match = /^WORLDKIT_STAGE\s+([a-z0-9-]+)$/.exec(line.trim());
        if (match) {
          currentInternalStage = match[1];
          currentInternalStageStartedAtMs = Date.now();
        }
        const jobMatch = /^WORLDKIT_LWDP_JOB\s+\S+\s+(\S+)\s+(\S+)\s+/.exec(line.trim());
        if (jobMatch) {
          if (currentGenerationJobId && currentGenerationJobStartedAtMs !== null) {
            completedGenerationJobs.push({
              jobId: currentGenerationJobId,
              taskId: currentGenerationTaskId,
              elapsedSeconds: Math.floor((Date.now() - currentGenerationJobStartedAtMs) / 1_000),
              outcome: "superseded",
            });
          }
          currentGenerationTaskId = jobMatch[1];
          currentGenerationJobId = jobMatch[2];
          currentGenerationJobStartedAtMs = Date.now();
        }
        const readyMatch = /^WORLDKIT_LWDP_TASK_READY\s+(\S+)$/.exec(line.trim());
        if (
          readyMatch &&
          currentGenerationJobId &&
          currentGenerationJobStartedAtMs !== null
        ) {
          completedGenerationJobs.push({
            jobId: currentGenerationJobId,
            taskId: readyMatch[1],
            elapsedSeconds: Math.floor((Date.now() - currentGenerationJobStartedAtMs) / 1_000),
            outcome: "succeeded",
          });
          currentGenerationJobId = null;
          currentGenerationTaskId = null;
          currentGenerationJobStartedAtMs = null;
        }
      };
      appendOutput(child.stdout, logStream, onLine);
      appendOutput(child.stderr, logStream, onLine);

      heartbeat = setInterval(() => {
        void (async () => {
          try {
            const payload = await getCloudExecution(executionId, apiOptions);
            const execution = cloudExecutionRecord(payload);
            if (terminalStatuses.has(String(execution.status))) {
              externalTerminalStatus = execution.status;
              cancelled = execution.status === "cancelled";
              if (child && child.exitCode === null) {
                if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
                else child.kill("SIGTERM");
              }
              return;
            }
            if (!terminalStatuses.has(String(execution.status))) await report("running");
          } catch (error) {
            process.stderr.write(`WORLDKIT_CLOUD_HEARTBEAT_WARNING ${error.message}\n`);
          }
        })();
      }, heartbeatIntervalMs);
      heartbeat.unref?.();

      const commandResult = await waitForChild(child);
      clearInterval(heartbeat);
      heartbeat = undefined;
      await endLogStream(logStream);
      logStream = undefined;
      return commandResult;
    };

    let result;
    if (resumeManifestS3Uri === undefined) {
      const commandArgs = [
        "agent:world",
        "--",
        "--scene-id",
        request.sceneId,
        ...imagePaths.flatMap((imagePath) => ["--image", imagePath]),
        request.prompt,
      ];
      result = await runPipelineCommand(commandArgs, "pipeline-start", "wx");
    } else {
      currentInternalStage = "artifact-resume-download";
      currentInternalStageStartedAtMs = Date.now();
      await report("running", {
        diagnostics: { resumed_from_manifest_s3_uri: resumeManifestS3Uri },
      });
      await hydrateCloudArtifactManifest({
        manifestS3Uri: resumeManifestS3Uri,
        manifestPath: join(temporaryRoot, "resume-artifact-manifest.json"),
        expectedSceneId: request.sceneId,
        expectedExecutionId: resumeSourceExecutionId ?? executionId,
        sceneRoot,
        scenePlanRoot,
        logPath,
        downloadImplementation,
        downloadOptions: uploadOptions,
      });
      await appendFile(
        logPath,
        `\nWORLDKIT_CLOUD_RESUME manifest=${resumeManifestS3Uri} mode=${resumeMode} agents=not-run\n`,
      );
      result = resumeMode === "host"
        ? await runPipelineCommand([
          "agent:world", "--", "--scene-id", request.sceneId, "--resume-host-only",
        ], "block-build", "a")
        : resumeMode === "builder"
          ? await runPipelineCommand([
            "agent:world", "--", "--scene-id", request.sceneId, "--build-only",
          ], "coding-agent", "a")
          : { code: 0, signal: null };
    }
    if (
      result.code !== 0 &&
      resumeManifestS3Uri === undefined &&
      isRetryableCloudHostCaptureFailure(await readFile(logPath, "utf8").catch(() => ""))
    ) {
      await appendFile(
        logPath,
        "\nWORLDKIT_CLOUD_HOST_CAPTURE_RETRY attempt=2 agents=not-run reason=transient-browser-capture\n",
      );
      result = await runPipelineCommand([
        "agent:world:resume-host", "--", "--scene-id", request.sceneId,
      ], "block-build", "a");
    }
    if (externalTerminalStatus !== null) {
      return { executionId, stageId, status: externalTerminalStatus };
    }

    const stageOutputS3Prefix = joinS3Uri(outputS3Prefix, "stages", stageId);
    let playableWhiteboxAvailable = await hasPlayableCloudWhitebox(sceneRoot, scenePlanRoot);
    let trustedWhiteboxVerification = null;
    if (playableWhiteboxAvailable) {
      currentInternalStage = "whitebox-trust-verification";
      trustedWhiteboxVerification = await verifyPlayableImplementation({
        sceneId: request.sceneId,
        sceneRoot,
        repoRoot,
        trustedCapturePublicKeyPath,
      });
      await appendFile(
        logPath,
        `\nWORLDKIT_CLOUD_WHITEBOX_TRUST ${trustedWhiteboxVerification.ok ? "passed" : "failed"}\n` +
          `${trustedWhiteboxVerification.output ?? ""}`,
      );
      playableWhiteboxAvailable = trustedWhiteboxVerification.ok;
    }
    const pipelineSucceeded = result.code === 0 && playableWhiteboxAvailable;
    currentInternalStage = pipelineSucceeded ? "artifact-upload" : "failure-artifact-upload";
    const manifest = await buildCloudArtifactManifest({
      sceneId: request.sceneId,
      executionId,
      stageId,
      stageOutputS3Prefix,
      sceneRoot,
      scenePlanRoot,
      logPath,
      workerImage: process.env.WORLDKIT_CLOUD_WORKER_IMAGE ?? null,
      sourceRevision: process.env.WORLDKIT_SOURCE_REVISION ?? null,
    });
    const manifestPath = join(temporaryRoot, "cloud-artifact-manifest.json");
    const uploaded = await uploadCloudArtifactManifest(manifest, manifestPath, {
      ...uploadOptions,
      stageOutputS3Prefix,
    });
    if (!pipelineSucceeded) {
      const failureMessage = result.code !== 0
        ? `Existing Scene pipeline exited ${result.code ?? `by ${result.signal}`}`
        : "Trusted playable whitebox verification failed";
      await report("failed", {
        artifacts: uploaded.cloudExecutionArtifacts,
        diagnostics: {
          error: failureMessage,
          exit_code: result.code,
          signal: result.signal,
          trusted_whitebox_verification: trustedWhiteboxVerification,
          playable_whitebox_available: playableWhiteboxAvailable,
          whitebox_outcome: playableWhiteboxAvailable ? "passed" : "failed",
          worker_image: process.env.WORLDKIT_CLOUD_WORKER_IMAGE ?? null,
          source_revision: process.env.WORLDKIT_SOURCE_REVISION ?? null,
        },
      });
      terminalReported = true;
      throw new Error(`${failureMessage}.`);
    }
    currentInternalStage = "ready";
    await report("succeeded", {
      artifacts: uploaded.cloudExecutionArtifacts,
      diagnostics: {
        error: null,
        exit_code: null,
        signal: null,
        trusted_whitebox_verification: trustedWhiteboxVerification === null
          ? null
          : {
              ok: trustedWhiteboxVerification.ok,
              code: trustedWhiteboxVerification.code,
              signal: trustedWhiteboxVerification.signal,
            },
        artifact_count: uploaded.manifest.artifacts.length,
        manifest_s3_uri: uploaded.cloudExecutionArtifacts[0].s3_uri,
        inner_generation_jobs: completedGenerationJobs,
        playable_whitebox_available: playableWhiteboxAvailable,
        whitebox_outcome: playableWhiteboxAvailable ? "passed" : "failed",
        worker_image: process.env.WORLDKIT_CLOUD_WORKER_IMAGE ?? null,
        source_revision: process.env.WORLDKIT_SOURCE_REVISION ?? null,
      },
    });
    terminalReported = true;
    return {
      executionId,
      stageId,
      sceneId: request.sceneId,
      status: "succeeded",
      manifestS3Uri: uploaded.cloudExecutionArtifacts[0].s3_uri,
      artifactCount: uploaded.manifest.artifacts.length,
    };
  } catch (error) {
    if (heartbeat) clearInterval(heartbeat);
    if (logStream) await endLogStream(logStream).catch(() => undefined);
    if (leaseId && !cancelled && !terminalReported) {
      await report("failed", { diagnostics: { error: error.message } }).catch(() => undefined);
    }
    throw error;
  } finally {
    if (!keepWorkspace) await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cloudConfig = await materializeCloudWorkerLwdpConfig({
    repoRoot: sourceRoot,
    environment: process.env,
  });
  delete process.env.LWDP_GENERATION_API_TOKEN;
  const result = await runCloudSceneWorker({
    executionId: options["execution-id"],
    stageId: options["stage-id"] ?? "scene-production",
    requestS3Uri: options["request-s3-uri"],
    outputS3Prefix: options["output-s3-prefix"],
    workerId: options["worker-id"],
    resumeManifestS3Uri: options["resume-manifest-s3-uri"],
    resumeSourceExecutionId: options["resume-source-execution-id"],
    resumeMode: options["resume-mode"] ?? "verify-only",
    cloudConfig,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
