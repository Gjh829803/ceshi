#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  cloudExecutionRecord,
  createCloudExecution,
  dispatchCloudExecution,
  findCloudExecutionByRequestId,
} from "../lib/lwdp-cloud-execution-client.mjs";
import { readRemoteS3Artifact } from "../lib/cloud-s3-runtime.mjs";
import {
  assertS3Uri,
  joinS3Uri,
  uploadS3File,
} from "../lib/lwdp-generation-client.mjs";
import {
  CLOUD_EPISODE_STAGE_PROFILE_V2,
  CLOUD_EPISODE_PART_BY_STAGE_ID,
  cloudEpisodeResumeStageProfileV3,
} from "../lib/cloud-production-run.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const ID = /^[a-z0-9][a-z0-9-]{2,119}$/;
const DIGEST_IMAGE = /^[a-z0-9][a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--no-dispatch") {
      options.dispatch = false;
      continue;
    }
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

export function parseCloudEpisodeRequest(value) {
  const request = typeof value === "string" ? JSON.parse(value) : value;
  if (request?.kind !== "worldkit-cloud-episode-request" ||
      ![1, 2, 3].includes(request?.schemaVersion)) {
    throw new Error("Cloud Episode request must use schemaVersion 1, 2, or 3.");
  }
  if (!ID.test(request.sceneId ?? "") || !ID.test(request.episodeId ?? "")) {
    throw new Error("Cloud Episode sceneId or episodeId is invalid.");
  }
  required(request.sceneExecutionId, "request.sceneExecutionId");
  assertS3Uri(request.sceneManifestS3Uri);
  if (!["full", "visual-sample", "seedance-conformance"]
    .includes(request.productionScope ?? "full")) {
    throw new Error("Cloud Episode productionScope is invalid.");
  }
  if (!["legacy", "ten-style"].includes(request.styleVariantMode)) {
    throw new Error("Cloud Episode styleVariantMode is invalid.");
  }
  if (!DIGEST_IMAGE.test(String(request.workerImage ?? ""))) {
    throw new Error("Cloud Episode workerImage must be digest-pinned.");
  }
  if ([2, 3].includes(request.schemaVersion)) {
    if (
      request.executionProfile !== (request.schemaVersion === 3
        ? "cpu-gpu-streaming-checkpoints@1"
        : "cpu-gpu-batch-cpu@1") ||
      !Number.isSafeInteger(request.gpuBatch?.minimumBatchSize) ||
      request.gpuBatch.minimumBatchSize < 100 ||
      !Number.isSafeInteger(request.gpuBatch?.maximumBatchSize) ||
      request.gpuBatch.maximumBatchSize < request.gpuBatch.minimumBatchSize ||
      (request.gpuBatch.tailFlushIdleSeconds !== undefined &&
        (!Number.isSafeInteger(request.gpuBatch.tailFlushIdleSeconds) ||
          request.gpuBatch.tailFlushIdleSeconds < 60 ||
          request.gpuBatch.tailFlushIdleSeconds > 3_600))
    ) throw new Error("Cloud Episode GPU Batch profile is invalid.");
    assertS3Uri(request.gpuBatch.queueS3Prefix);
  }
  if (
    request.sceneRecord?.sceneId !== request.sceneId ||
    request.sceneRecord?.id !== request.sceneId ||
    request.sceneRecord?.status !== "ready" ||
    request.sceneRecord?.remoteArtifactAdmission?.status !== "passed"
  ) throw new Error("Cloud Episode requires one admitted ready Scene record.");
  if (request.resumeEpisodeManifest !== undefined) {
    required(request.resumeEpisodeManifest?.executionId, "request.resumeEpisodeManifest.executionId");
    assertS3Uri(request.resumeEpisodeManifest?.s3Uri);
    if (request.resumeEpisodeManifest.stageId !== undefined &&
        CLOUD_EPISODE_PART_BY_STAGE_ID[request.resumeEpisodeManifest.stageId] !==
          request.resumeEpisodeManifest.executionPart) {
      throw new Error("Cloud Episode resume manifest stage identity is invalid.");
    }
  }
  return request;
}

export async function submitCloudEpisode({
  sceneId,
  episodeId,
  sceneExecutionId,
  sceneManifestS3Uri,
  sceneRecord,
  productionScope = "full",
  styleVariantMode = "legacy",
  executionProfile = "cpu-gpu-batch-cpu@1",
  workerImage,
  gpuBatch,
  resumeEpisodeManifest = undefined,
  requestId,
  outputS3Prefix,
  autoDispatch = true,
  cloudConfig,
  fetchImplementation,
  uploadOptions = {},
  requestPath = undefined,
  findExistingImplementation = findCloudExecutionByRequestId,
  readExistingRequestImplementation = (s3Uri) => readRemoteS3Artifact(s3Uri, {
    repoRoot,
    maximumBytes: 4 * 1024 * 1024,
  }),
}) {
  if (!ID.test(String(sceneId ?? "")) || !ID.test(String(episodeId ?? ""))) {
    throw new Error("scene_id and episode_id must be stable lowercase ids.");
  }
  required(requestId, "request_id");
  required(sceneExecutionId, "scene_execution_id");
  if (!["cpu-gpu-batch-cpu@1", "cpu-gpu-streaming-checkpoints@1"]
    .includes(executionProfile)) {
    throw new Error("Cloud Episode execution profile is invalid.");
  }
  // The fine-grained DAG is the durable full-production lane. Visual samples
  // intentionally keep the existing coarse render stage because they end
  // after visual review and have no events, Seedance, conformance, or
  // publication work to checkpoint.
  const effectiveExecutionProfile =
    executionProfile === "cpu-gpu-streaming-checkpoints@1" &&
      productionScope === "visual-sample"
      ? "cpu-gpu-batch-cpu@1"
      : executionProfile;
  if (effectiveExecutionProfile === "cpu-gpu-streaming-checkpoints@1" &&
      styleVariantMode !== "ten-style") {
    throw new Error("Streaming checkpoint production requires ten-style mode.");
  }
  const stageProfile = effectiveExecutionProfile === "cpu-gpu-streaming-checkpoints@1"
    ? cloudEpisodeResumeStageProfileV3(
      productionScope,
      resumeEpisodeManifest?.stageId,
    )
    : CLOUD_EPISODE_STAGE_PROFILE_V2;
  const resolvedOutputPrefix = assertS3Uri(outputS3Prefix);
  const request = parseCloudEpisodeRequest({
    kind: "worldkit-cloud-episode-request",
    schemaVersion: effectiveExecutionProfile === "cpu-gpu-streaming-checkpoints@1" ? 3 : 2,
    sceneId,
    episodeId,
    sceneExecutionId,
    sceneManifestS3Uri: assertS3Uri(sceneManifestS3Uri),
    sceneRecord,
    productionScope,
    styleVariantMode,
    workerImage,
    executionProfile: effectiveExecutionProfile,
    gpuBatch: {
      queueS3Prefix: assertS3Uri(gpuBatch?.queueS3Prefix),
      minimumBatchSize: Number(gpuBatch?.minimumBatchSize),
      maximumBatchSize: Number(gpuBatch?.maximumBatchSize),
      ...(gpuBatch?.tailFlushIdleSeconds === undefined ? {} : {
        tailFlushIdleSeconds: Number(gpuBatch.tailFlushIdleSeconds),
      }),
    },
    pipeline: {
      command: "episode:run",
      backend: "cloud",
      stageIds: stageProfile.map((stage) => stage.stage_id),
      styleVariantMode,
    },
    ...(resumeEpisodeManifest ? { resumeEpisodeManifest } : {}),
  });
  const serializedRequest = `${JSON.stringify(request, null, 2)}\n`;
  const requestHash = `sha256:${createHash("sha256").update(serializedRequest).digest("hex")}`;
  const requestS3Uri = joinS3Uri(resolvedOutputPrefix, "inputs", "request.json");
  let existingExecution = null;
  try {
    existingExecution = cloudExecutionRecord(await findExistingImplementation(requestId, {
      kind: "episode",
      config: cloudConfig,
      fetchImplementation,
    }));
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
  if (existingExecution) {
    const existingRequest = parseCloudEpisodeRequest(
      (await readExistingRequestImplementation(requestS3Uri)).toString("utf8"),
    );
    if (
      existingRequest.sceneId !== sceneId ||
      existingRequest.episodeId !== episodeId ||
      existingRequest.sceneExecutionId !== sceneExecutionId ||
      existingRequest.styleVariantMode !== styleVariantMode ||
      (existingRequest.productionScope ?? "full") !== productionScope
    ) {
      throw new Error("Existing Cloud Episode request identity does not match this recovery.");
    }
    if (autoDispatch && existingExecution.status === "queued") {
      await dispatchCloudExecution(existingExecution.execution_id, {
        config: cloudConfig,
        fetchImplementation,
      });
    }
    const existingSerialized = `${JSON.stringify(existingRequest, null, 2)}\n`;
    return {
      executionId: existingExecution.execution_id,
      sceneId,
      episodeId,
      requestId,
      requestHash: `sha256:${createHash("sha256").update(existingSerialized).digest("hex")}`,
      requestS3Uri,
      outputS3Prefix: resolvedOutputPrefix,
      status: existingExecution.status,
      workerImage: existingRequest.workerImage,
      executionProfile: existingRequest.executionProfile,
      gpuBatch: existingRequest.gpuBatch,
      productionScope: existingRequest.productionScope ?? "full",
      stageIds: existingRequest.pipeline.stageIds,
      recoveredByRequestId: true,
    };
  }
  const temporaryRoot = requestPath ? undefined : await mkdtemp(`${tmpdir()}/worldkit-cloud-episode-request-`);
  const localRequestPath = requestPath ?? resolve(temporaryRoot, "request.json");
  await mkdir(dirname(localRequestPath), { recursive: true });
  await writeFile(localRequestPath, serializedRequest, { mode: 0o600 });
  await uploadS3File(localRequestPath, requestS3Uri, uploadOptions);
  const payload = {
    kind: "episode",
    scene_id: sceneId,
    request_id: requestId,
    output_s3_prefix: resolvedOutputPrefix,
    max_concurrency: 1,
    auto_dispatch: autoDispatch,
    inputs: [
      {
        role: "worldkit-cloud-episode-request",
        path: "inputs/request.json",
        s3_uri: requestS3Uri,
        content_type: "application/json",
      },
      ...(request.resumeEpisodeManifest ? [{
        role: "prior-episode-artifact-manifest",
        path: "inputs/episode/cloud-artifact-manifest.json",
        s3_uri: request.resumeEpisodeManifest.s3Uri,
        content_type: "application/json",
      }] : []),
      {
        role: "trusted-scene-artifact-manifest",
        path: "inputs/scene/cloud-artifact-manifest.json",
        s3_uri: request.sceneManifestS3Uri,
        content_type: "application/json",
      },
    ],
    stages: stageProfile.map((stage) => ({
      ...stage,
      ...(stage.depends_on ? { depends_on: [...stage.depends_on] } : {}),
    })),
  };
  let execution;
  try {
    execution = cloudExecutionRecord(await createCloudExecution(payload, {
      config: cloudConfig,
      fetchImplementation,
    }));
    if (autoDispatch && execution.status === "queued") {
      await dispatchCloudExecution(execution.execution_id, {
        config: cloudConfig,
        fetchImplementation,
      });
    }
  } finally {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  }
  return {
    executionId: execution.execution_id,
    sceneId,
    episodeId,
    requestId,
    requestHash,
    requestS3Uri,
    outputS3Prefix: resolvedOutputPrefix,
    status: execution.status,
    workerImage,
    executionProfile: request.executionProfile,
    gpuBatch: request.gpuBatch,
    productionScope: request.productionScope ?? "full",
    stageIds: request.pipeline.stageIds,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sceneRecord = JSON.parse(await readFile(resolve(options["scene-record"]), "utf8"));
  const result = await submitCloudEpisode({
    sceneId: options["scene-id"],
    episodeId: options["episode-id"],
    sceneExecutionId: options["scene-execution-id"],
    sceneManifestS3Uri: options["scene-manifest-s3-uri"],
    sceneRecord,
    productionScope: options["production-scope"] ?? "full",
    styleVariantMode: options["style-variant-mode"] ?? "legacy",
    executionProfile: options["execution-profile"] ?? "cpu-gpu-batch-cpu@1",
    workerImage: options["worker-image"],
    gpuBatch: {
      queueS3Prefix: options["gpu-batch-queue-s3-prefix"],
      minimumBatchSize: Number(options["gpu-batch-minimum-size"] ?? 100),
      maximumBatchSize: Number(options["gpu-batch-maximum-size"] ?? 128),
    },
    requestId: options["request-id"],
    outputS3Prefix: options["output-s3-prefix"],
    autoDispatch: options.dispatch !== false,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
