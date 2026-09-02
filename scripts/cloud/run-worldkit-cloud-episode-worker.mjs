#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  cloudExecutionRecord,
  getCloudExecution,
  reportCloudExecutionStageProgress,
} from "../lib/lwdp-cloud-execution-client.mjs";
import {
  assertS3Uri,
  downloadS3FileAtomic,
  joinS3Uri,
  uploadS3File,
} from "../lib/lwdp-generation-client.mjs";
import {
  CLOUD_EPISODE_PART_BY_STAGE_ID,
  buildGpuCaptureQueueEntry,
  cloudProductionContentHash,
  parseCloudProviderJournal,
} from "../lib/cloud-production-run.mjs";
import {
  buildCloudEpisodeArtifactManifest,
  hydrateCloudArtifactManifest,
  hydrateCloudEpisodeArtifactManifest,
  sha256File,
  uploadCloudArtifactManifest,
} from "../lib/worldkit-cloud-artifacts.mjs";
import {
  claimCloudSceneStageWithWait,
  materializeCloudWorkerLwdpConfig,
  verifyPlayableCloudWhitebox,
} from "./run-worldkit-cloud-scene-worker.mjs";
import { parseCloudEpisodeRequest } from "./submit-worldkit-cloud-episode.mjs";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const terminalStatuses = new Set(["succeeded", "failed", "interrupted", "cancelled"]);
const runtimeSecretFiles = [
  "infinite-canvas.key",
  "gemini.env",
  "google-service-account.json",
];

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value after ${argument}.`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function required(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required.`);
  return value;
}

function leaseIdFromClaim(payload) {
  return required(
    payload?.lease_id ?? payload?.lease?.lease_id ?? payload?.attempt?.lease_id,
    "lease_id",
  );
}

function latestStageManifest(execution, stageId, maximumAttempt = Infinity) {
  return [...(execution?.artifacts ?? [])]
    .map((artifact, index) => ({ artifact, index }))
    .filter(({ artifact }) =>
      ["worldkit-cloud-artifact-manifest", "worldkit-cloud-checkpoint-manifest"]
        .includes(artifact?.role) &&
      artifact?.stage_id === stageId &&
      Number(artifact?.attempt ?? 0) <= maximumAttempt &&
      typeof artifact?.s3_uri === "string")
    .sort((left, right) =>
      Number(right.artifact.attempt ?? 0) - Number(left.artifact.attempt ?? 0) ||
      right.index - left.index)[0]?.artifact ?? null;
}

function waitForChild(child) {
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolvePromise({ code, signal }));
  });
}

function terminateChild(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform !== "win32" && Number.isSafeInteger(child.pid)) {
      process.kill(-child.pid, "SIGTERM");
    } else child.kill("SIGTERM");
  } catch {}
}

async function waitForHttp(url, {
  timeoutMs = 180_000,
  fetchImplementation = fetch,
} = {}) {
  const startedAt = Date.now();
  let lastStatus = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetchImplementation(url, { cache: "no-store" });
      lastStatus = response.status;
      if (response.ok) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  throw new Error(`Cloud Episode runtime service did not become ready: ${url} status=${lastStatus}`);
}

export async function materializeEpisodeRuntimeConfig({
  repoRoot,
  secretRoot,
  cloudConfig,
}) {
  const runtimeRoot = join(repoRoot, ".codex-tmp", "runtime-config");
  await rm(runtimeRoot, { recursive: true, force: true });
  await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
  await writeFile(join(runtimeRoot, "lwdp.env"), [
    `LWDP_API_BASE=${required(cloudConfig?.baseUrl, "cloudConfig.baseUrl")}`,
    `LWDP_GENERATION_API_TOKEN=${required(cloudConfig?.token, "cloudConfig.token")}`,
    `LWDP_USER_ID=${required(cloudConfig?.userId, "cloudConfig.userId")}`,
    "",
  ].join("\n"), { mode: 0o600 });
  for (const fileName of runtimeSecretFiles) {
    const source = join(secretRoot, fileName);
    const metadata = await stat(source).catch(() => null);
    if (!metadata?.isFile() || metadata.size < 1) {
      throw new Error(`Cloud Episode runtime Secret omitted ${fileName}.`);
    }
    const destination = join(runtimeRoot, fileName);
    await copyFile(source, destination);
    await chmod(destination, 0o600);
  }
  return runtimeRoot;
}

function attachOutput(stream, onLine) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
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

export async function runCloudEpisodeWorker({
  executionId,
  stageId = "episode-production",
  executionPart = stageId === "episode-production"
    ? "full"
    : CLOUD_EPISODE_PART_BY_STAGE_ID[stageId],
  requestS3Uri,
  outputS3Prefix,
  workerId = `worldkit-episode-${process.env.HOSTNAME || randomUUID()}`,
  repoRoot = sourceRoot,
  secretRoot = "/var/run/worldkit-episode-runtime",
  heartbeatIntervalMs = 30_000,
  leaseSeconds = 900,
  cloudConfig,
  fetchImplementation = fetch,
  spawnImplementation = spawn,
  downloadImplementation = downloadS3FileAtomic,
  uploadOptions = {},
  keepWorkspace = false,
  trustedCapturePublicKeyPath = process.env.WORLDKIT_CAPTURE_TRUSTED_PUBLIC_KEY_PATH,
  verifySceneImplementation = verifyPlayableCloudWhitebox,
}) {
  required(executionId, "execution_id");
  required(stageId, "stage_id");
  if (!["full", "prepare", "capture", "render"].includes(executionPart)) {
    throw new Error("Cloud Episode executionPart is invalid.");
  }
  if (stageId !== "episode-production" &&
      CLOUD_EPISODE_PART_BY_STAGE_ID[stageId] !== executionPart) {
    throw new Error("Cloud Episode stageId and executionPart disagree.");
  }
  assertS3Uri(requestS3Uri);
  assertS3Uri(outputS3Prefix);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-episode-"));
  const requestPath = join(temporaryRoot, "request.json");
  const sceneHydrationLogPath = join(temporaryRoot, "scene-pipeline.log");
  const studioDataRoot = join(temporaryRoot, "studio-data");
  const studioOrigin = "http://127.0.0.1:4297";
  const playgroundOrigin = "http://127.0.0.1:5297";
  const apiOptions = { config: cloudConfig, fetchImplementation };
  let leaseId;
  let cloudStageAttempt = 1;
  let currentInternalStage = "claiming";
  let currentStageStartedAt = Date.now();
  const workerStartedAt = Date.now();
  let heartbeat;
  let pipelineChild;
  let studioChild;
  let playgroundChild;
  let cancelled = false;
  let terminalReported = false;
  let checkpointReportChain = Promise.resolve();
  let request;
  let episodeRoot;
  const report = (status, extra = {}) => reportCloudExecutionStageProgress(
    executionId,
    stageId,
    {
      status,
      lease_id: leaseId,
      diagnostics: {
        internal_stage: currentInternalStage,
        internal_stage_started_at: new Date(currentStageStartedAt).toISOString(),
        internal_stage_elapsed_seconds: Math.floor((Date.now() - currentStageStartedAt) / 1_000),
        worker_elapsed_seconds: Math.floor((Date.now() - workerStartedAt) / 1_000),
        worker_id: workerId,
        cloud_stage_attempt: cloudStageAttempt,
        ...extra.diagnostics,
      },
      ...(extra.artifacts ? { artifacts: extra.artifacts } : {}),
    },
    apiOptions,
  );
  const setStage = (stage) => {
    if (stage === currentInternalStage) return;
    currentInternalStage = stage;
    currentStageStartedAt = Date.now();
  };

  try {
    const claim = await claimCloudSceneStageWithWait({
      executionId,
      stageId,
      workerId,
      leaseSeconds,
      apiOptions,
    });
    leaseId = leaseIdFromClaim(claim);
    const claimedExecution = cloudExecutionRecord(
      await getCloudExecution(executionId, apiOptions),
    );
    const claimedStage = claimedExecution.stages?.find?.((stage) =>
      stage?.stage_id === stageId);
    const observedStageAttempt = Number(claimedStage?.current_attempt ?? 1);
    cloudStageAttempt = Number.isSafeInteger(observedStageAttempt) && observedStageAttempt > 0
      ? observedStageAttempt
      : 1;
    const previousAttemptManifest = latestStageManifest(
      claimedExecution,
      stageId,
      cloudStageAttempt - 1,
    );
    const currentAttemptCheckpoint = [...(claimedExecution.artifacts ?? [])]
      .filter((artifact) =>
        artifact?.role === "worldkit-cloud-checkpoint-manifest" &&
        artifact?.stage_id === stageId &&
        Number(artifact?.attempt ?? 0) === cloudStageAttempt &&
        typeof artifact?.s3_uri === "string")
      .at(-1) ?? null;
    setStage("input-download");
    await report("running");
    await downloadImplementation(requestS3Uri, requestPath, uploadOptions);
    request = parseCloudEpisodeRequest(await readFile(requestPath, "utf8"));
    if (request.schemaVersion === 2 &&
        CLOUD_EPISODE_PART_BY_STAGE_ID[stageId] !== executionPart) {
      throw new Error("Cloud Episode request does not admit this stage execution part.");
    }
    if (process.env.WORLDKIT_CLOUD_WORKER_IMAGE !== request.workerImage) {
      throw new Error(
        "Cloud Episode Worker image does not match the digest frozen into the request.",
      );
    }
    const upstreamStageId = executionPart === "capture"
      ? "episode-prepare"
      : executionPart === "render" ? "whitebox-capture" : null;
    const upstreamManifest = upstreamStageId
      ? latestStageManifest(claimedExecution, upstreamStageId)
      : null;
    const previousEpisodeManifest = currentAttemptCheckpoint ?? previousAttemptManifest ?? upstreamManifest ??
      (request.resumeEpisodeManifest ? {
        s3_uri: request.resumeEpisodeManifest.s3Uri,
        execution_id: request.resumeEpisodeManifest.executionId,
        attempt: "prior-execution",
      } : null);
    if (["capture", "render"].includes(executionPart) &&
        previousEpisodeManifest === null) {
      throw new Error(`Cloud Episode ${executionPart} stage omitted its upstream manifest.`);
    }

    setStage("runtime-config");
    await materializeEpisodeRuntimeConfig({ repoRoot, secretRoot, cloudConfig });
    const sceneRoot = join(repoRoot, "artifacts", "scenes", request.sceneId);
    const scenePlanRoot = join(
      repoRoot,
      "apps", "playground", "public", "scene-plans", request.sceneId,
    );
    episodeRoot = join(repoRoot, "artifacts", "episodes", request.episodeId);
    await Promise.all([
      rm(sceneRoot, { recursive: true, force: true }),
      rm(scenePlanRoot, { recursive: true, force: true }),
      rm(episodeRoot, { recursive: true, force: true }),
    ]);

    setStage("scene-artifact-download");
    const sceneManifestPath = join(temporaryRoot, "scene-artifact-manifest.json");
    await hydrateCloudArtifactManifest({
      manifestS3Uri: request.sceneManifestS3Uri,
      manifestPath: sceneManifestPath,
      expectedSceneId: request.sceneId,
      expectedExecutionId: request.sceneExecutionId,
      sceneRoot,
      scenePlanRoot,
      logPath: sceneHydrationLogPath,
      downloadImplementation,
      downloadOptions: uploadOptions,
    });
    const verification = await verifySceneImplementation({
      sceneId: request.sceneId,
      sceneRoot,
      repoRoot,
      trustedCapturePublicKeyPath,
    });
    if (!verification.ok) {
      throw new Error(`Cloud Episode rejected the Scene capture authority.\n${verification.output}`);
    }

    if (previousEpisodeManifest !== null) {
      setStage("episode-artifact-resume");
      const resumed = await hydrateCloudEpisodeArtifactManifest({
        manifestS3Uri: previousEpisodeManifest.s3_uri,
        manifestPath: join(temporaryRoot, "episode-resume-artifact-manifest.json"),
        expectedSceneId: request.sceneId,
        expectedEpisodeId: request.episodeId,
        expectedExecutionId: previousEpisodeManifest.execution_id ?? executionId,
        episodeRoot,
        downloadImplementation,
        downloadOptions: uploadOptions,
      });
      await report("running", {
        diagnostics: {
          resumed_from_episode_attempt: previousEpisodeManifest.attempt,
          resumed_episode_artifact_count: resumed.artifacts.length,
        },
      });
    }
    if (executionPart === "render") {
      setStage("provider-journal-resume");
      for (let index = 0; index < 6; index += 1) {
        const segmentId = `segment-0${index}`;
        const destination = join(episodeRoot, "video", segmentId, "provider-run.json");
        await mkdir(dirname(destination), { recursive: true });
        const downloaded = await downloadImplementation(
          joinS3Uri(
            outputS3Prefix,
            "provider-journals",
            request.episodeId,
            segmentId,
            "provider-run.json",
          ),
          destination,
          uploadOptions,
        ).then(() => true).catch(() => false);
        if (downloaded) {
          const journal = parseCloudProviderJournal(await readFile(destination, "utf8"));
          if (
            journal.sceneId !== request.sceneId ||
            journal.episodeId !== request.episodeId ||
            journal.segmentId !== segmentId
          ) {
            throw new Error(`Cloud Provider Journal identity mismatch: ${segmentId}`);
          }
        }
      }
    }
    const worldBuild = JSON.parse(await readFile(join(sceneRoot, "world.build.json"), "utf8"));
    const sourceReceiptPath = join(episodeRoot, "episode-source-receipt.json");
    const priorSourceReceipt = await readFile(sourceReceiptPath, "utf8")
      .then(JSON.parse)
      .catch(() => null);
    const sourceReceipt = {
      kind: "worldkit-cloud-episode-source-receipt",
      schemaVersion: 1,
      sceneId: request.sceneId,
      episodeId: request.episodeId,
      sceneExecutionId: request.sceneExecutionId,
      sceneManifestS3Uri: request.sceneManifestS3Uri,
      sceneManifestContentHash: await sha256File(sceneManifestPath),
      worldBuildIdentityHash: worldBuild.worldBuildIdentityHash,
      sceneCaptureReceiptContentHash: await sha256File(join(
        sceneRoot,
        "whitebox-capture-receipt.json",
      )),
      workerImage: request.workerImage,
      styleVariantMode: request.styleVariantMode,
      createdAt: priorSourceReceipt?.createdAt ?? new Date().toISOString(),
    };
    if (priorSourceReceipt !== null) {
      const stablePrior = { ...priorSourceReceipt, createdAt: sourceReceipt.createdAt };
      if (JSON.stringify(stablePrior) !== JSON.stringify(sourceReceipt)) {
        throw new Error("Cloud Episode retry attempted to change its frozen Scene source receipt.");
      }
    }
    await mkdir(episodeRoot, { recursive: true });
    await writeFile(sourceReceiptPath, `${JSON.stringify(sourceReceipt, null, 2)}\n`, {
      mode: 0o600,
    });

    setStage("runtime-services");
    const recordPath = join(studioDataRoot, "worlds", request.sceneId, "record.json");
    await mkdir(dirname(recordPath), { recursive: true });
    await writeFile(recordPath, `${JSON.stringify(request.sceneRecord, null, 2)}\n`, {
      mode: 0o600,
    });
    playgroundChild = spawnImplementation(
      "pnpm",
      ["--filter", "@whitebox-world/playground", "exec", "vite", "preview",
        "--host", "127.0.0.1", "--port", "5297", "--strictPort"],
      { cwd: repoRoot, env: process.env, stdio: "ignore", detached: true },
    );
    studioChild = spawnImplementation("node", ["apps/studio/src/server.mjs"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        WORLDKIT_STUDIO_PORT: "4297",
        WORLDKIT_STUDIO_DATA_ROOT: studioDataRoot,
        WORLDKIT_PLAYGROUND_INTERNAL_ORIGIN: playgroundOrigin,
        WORLDKIT_PLAYGROUND_ORIGIN: playgroundOrigin,
      },
      stdio: "ignore",
      detached: true,
    });
    await waitForHttp(
      `${studioOrigin}/api/worlds/${encodeURIComponent(request.sceneId)}/preview-bootstrap`,
      { fetchImplementation },
    );

    heartbeat = setInterval(() => {
      void (async () => {
        try {
          const execution = cloudExecutionRecord(
            await getCloudExecution(executionId, apiOptions),
          );
          if (terminalStatuses.has(String(execution.status))) {
            cancelled = execution.status === "cancelled";
            terminateChild(pipelineChild);
            return;
          }
          await report("running");
        } catch (error) {
          process.stderr.write(`WORLDKIT_CLOUD_EPISODE_HEARTBEAT_WARNING ${error.message}\n`);
        }
      })();
    }, heartbeatIntervalMs);
    heartbeat.unref?.();

    setStage("episode-workflow");
    pipelineChild = spawnImplementation("node", [
      "scripts/episodes/run-episode-workflow.mjs",
      "--scene-id", request.sceneId,
      "--episode-id", request.episodeId,
      "--origin", studioOrigin,
      "--backend", "cloud",
      "--execution-part", executionPart,
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        WORLDKIT_CLOUD_EXECUTION_ID: executionId,
        WORLDKIT_CLOUD_EXECUTION_STAGE_ID: stageId,
        WORLDKIT_CLOUD_STAGE_ATTEMPT: String(cloudStageAttempt),
        WORLDKIT_CLOUD_OUTPUT_S3_PREFIX: outputS3Prefix,
        WORLDKIT_CAPTURE_GPU: ["full", "capture"].includes(executionPart) ? "1" : "0",
        WORLDKIT_CAPTURE_HEADLESS: "1",
        WORLDKIT_EPISODE_STYLE_VARIANTS:
          request.styleVariantMode === "ten-style" ? "1" : "0",
        WORLDKIT_EPISODE_PRODUCTION_SCOPE: request.productionScope ?? "full",
        WORLDKIT_PROVIDER_JOURNAL_S3_PREFIX: joinS3Uri(
          outputS3Prefix,
          "provider-journals",
        ),
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    const onLine = (line) => {
      const match = /^(?:WORLDKIT_EPISODE_WORKFLOW_STAGE|WORLDKIT_STYLE_VARIANT_STAGE)\s+([a-z0-9-]+)\s+(?:running|complete|resumed)$/.exec(line.trim());
      if (match) setStage(match[1]);
      const checkpoint = /^WORLDKIT_EPISODE_CLOUD_CHECKPOINT\s+([a-z0-9-]+)\s+(s3:\/\/[^\s]+)$/.exec(line.trim());
      if (checkpoint) {
        checkpointReportChain = checkpointReportChain.then(() => report("running", {
          artifacts: [{
            role: "worldkit-cloud-checkpoint-manifest",
            path: `checkpoints/${checkpoint[1]}/cloud-artifact-manifest.json`,
            s3_uri: checkpoint[2],
            content_type: "application/json",
            required: false,
          }],
          diagnostics: { checkpoint_stage: checkpoint[1], checkpoint_manifest_s3_uri: checkpoint[2] },
        }));
      }
    };
    attachOutput(pipelineChild.stdout, onLine);
    attachOutput(pipelineChild.stderr, onLine);
    const result = await waitForChild(pipelineChild);
    await checkpointReportChain;
    if (cancelled) return { executionId, stageId, status: "cancelled" };
    const episodeRecord = JSON.parse(await readFile(
      join(episodeRoot, "episode-record.json"),
      "utf8",
    ));
    const expectedEpisodeStatus = executionPart === "prepare"
      ? "awaiting-capture"
      : executionPart === "capture" ? "captured" : "succeeded";
    if (result.code !== 0 || episodeRecord.status !== expectedEpisodeStatus) {
      throw new Error(
        `Existing Episode workflow exited ${result.code ?? `by ${result.signal}`}: ` +
          `expected status ${expectedEpisodeStatus}, observed ${episodeRecord.status ?? "unknown"}; ` +
          `${episodeRecord.error ?? "no workflow detail"}`,
      );
    }

    if (["full", "render"].includes(executionPart) &&
        (request.productionScope ?? "full") === "full") {
      setStage("portable-bundle");
      const bundlePath = join(
        episodeRoot,
        "bundle",
        `${request.episodeId}-seedance-review.zip`,
      );
      const existingBundle = await stat(bundlePath).catch(() => null);
      if (!existingBundle?.isFile() || existingBundle.size < 1) {
        const bundleResponse = await fetchImplementation(
          `${studioOrigin}/api/episode-workflows/${encodeURIComponent(request.episodeId)}/bundle`,
          { cache: "no-store" },
        );
        if (!bundleResponse.ok) {
          throw new Error(
            `Cloud Episode portable bundle failed: HTTP ${bundleResponse.status} ` +
              `${await bundleResponse.text()}`,
          );
        }
        await mkdir(dirname(bundlePath), { recursive: true });
        await writeFile(bundlePath, Buffer.from(await bundleResponse.arrayBuffer()), {
          mode: 0o600,
        });
      }
    }

    setStage("artifact-upload");
    const stageOutputS3Prefix = joinS3Uri(
      outputS3Prefix,
      "stages",
      stageId,
      `attempt-${cloudStageAttempt}`,
    );
    const manifest = await buildCloudEpisodeArtifactManifest({
      sceneId: request.sceneId,
      episodeId: request.episodeId,
      executionId,
      stageId,
      stageOutputS3Prefix,
      episodeRoot,
      workerImage: process.env.WORLDKIT_CLOUD_WORKER_IMAGE ?? null,
      sourceRevision: process.env.WORLDKIT_SOURCE_REVISION ?? null,
      executionPart,
    });
    const manifestPath = join(temporaryRoot, "cloud-episode-artifact-manifest.json");
    const uploaded = await uploadCloudArtifactManifest(
      manifest,
      manifestPath,
      { ...uploadOptions, stageOutputS3Prefix },
    );
    const reportedArtifacts = [...uploaded.cloudExecutionArtifacts];
    let gpuQueueEntryS3Uri = null;
    if (executionPart === "prepare") {
      setStage("gpu-batch-queue");
      const prepareManifestHash = await sha256File(manifestPath);
      gpuQueueEntryS3Uri = joinS3Uri(
        request.gpuBatch.queueS3Prefix,
        "pending",
        `${executionId}.json`,
      );
      const queueEntry = buildGpuCaptureQueueEntry({
        executionId,
        sceneId: request.sceneId,
        episodeId: request.episodeId,
        stageId: "whitebox-capture",
        stageAttempt: cloudStageAttempt,
        workerImage: request.workerImage,
        requestS3Uri,
        outputS3Prefix,
        queueEntryS3Uri: gpuQueueEntryS3Uri,
        prepareManifestS3Uri: uploaded.cloudExecutionArtifacts[0].s3_uri,
        prepareManifestHash,
        inputIdentityHash: cloudProductionContentHash(request),
        createdAt: new Date().toISOString(),
      });
      const queueEntryPath = join(temporaryRoot, "gpu-capture-queue-entry.json");
      await writeFile(queueEntryPath, `${JSON.stringify(queueEntry, null, 2)}\n`, {
        mode: 0o600,
      });
      await uploadS3File(queueEntryPath, gpuQueueEntryS3Uri, uploadOptions);
      reportedArtifacts.push({
        role: "worldkit-gpu-capture-queue-entry",
        path: "gpu-capture-queue-entry.json",
        s3_uri: gpuQueueEntryS3Uri,
        content_type: "application/json",
        required: true,
      });
    }
    setStage("ready");
    await report("succeeded", {
      artifacts: reportedArtifacts,
      diagnostics: {
        manifest_s3_uri: uploaded.cloudExecutionArtifacts[0].s3_uri,
        artifact_count: uploaded.manifest.artifacts.length,
        episode_id: request.episodeId,
        execution_part: executionPart,
        ...(gpuQueueEntryS3Uri ? { gpu_queue_entry_s3_uri: gpuQueueEntryS3Uri } : {}),
      },
    });
    terminalReported = true;
    return {
      executionId,
      stageId,
      sceneId: request.sceneId,
      episodeId: request.episodeId,
      status: "succeeded",
      executionPart,
      manifestS3Uri: uploaded.cloudExecutionArtifacts[0].s3_uri,
      gpuQueueEntryS3Uri,
      artifactCount: uploaded.manifest.artifacts.length,
    };
  } catch (error) {
    if (leaseId && !cancelled && !terminalReported) {
      let artifacts;
      if (request && episodeRoot) {
        try {
          const stageOutputS3Prefix = joinS3Uri(
            outputS3Prefix,
            "stages",
            stageId,
            `attempt-${cloudStageAttempt}`,
          );
          const partial = await buildCloudEpisodeArtifactManifest({
            sceneId: request.sceneId,
            episodeId: request.episodeId,
            executionId,
            stageId,
            stageOutputS3Prefix,
            episodeRoot,
            workerImage: process.env.WORLDKIT_CLOUD_WORKER_IMAGE ?? null,
            sourceRevision: process.env.WORLDKIT_SOURCE_REVISION ?? null,
            requireComplete: false,
            executionPart,
          });
          if (partial.artifacts.length > 0) {
            const uploaded = await uploadCloudArtifactManifest(
              partial,
              join(temporaryRoot, "cloud-episode-partial-manifest.json"),
              { ...uploadOptions, stageOutputS3Prefix },
            );
            artifacts = uploaded.cloudExecutionArtifacts;
          }
        } catch (partialError) {
          process.stderr.write(
            `WORLDKIT_CLOUD_EPISODE_PARTIAL_UPLOAD_WARNING ${partialError.message}\n`,
          );
        }
      }
      await report("failed", {
        ...(artifacts ? { artifacts } : {}),
        diagnostics: { error: error.message },
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    terminateChild(pipelineChild);
    terminateChild(studioChild);
    terminateChild(playgroundChild);
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
  const result = await runCloudEpisodeWorker({
    executionId: options["execution-id"],
    stageId: options["stage-id"] ?? "episode-production",
    executionPart: options["execution-part"],
    requestS3Uri: options["request-s3-uri"],
    outputS3Prefix: options["output-s3-prefix"],
    workerId: options["worker-id"],
    leaseSeconds: Number(options["lease-seconds"] ?? 900),
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
