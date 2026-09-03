import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  cloudExecutionRecord,
  getCloudExecution,
  getCloudExecutionStages,
  pollCloudExecution,
  retryCloudExecutionStage,
} from "../../../scripts/lib/lwdp-cloud-execution-client.mjs";
import { launchCloudEpisodeWorkerJob } from
  "../../../scripts/cloud/launch-worldkit-cloud-episode-worker-job.mjs";
import { submitCloudEpisode } from
  "../../../scripts/cloud/submit-worldkit-cloud-episode.mjs";
import { assertS3Uri, joinS3Uri } from
  "../../../scripts/lib/lwdp-generation-client.mjs";
import { cloudArtifactManifestS3Uri } from "./cloud-scene-production.mjs";
import { CLOUD_EPISODE_PART_BY_STAGE_ID } from
  "../../../scripts/lib/cloud-production-run.mjs";

const DIGEST_IMAGE = /^[a-z0-9][a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/;

function validNodeSelector(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(value).every(([key, item]) =>
      typeof key === "string" && key.length > 0 &&
      typeof item === "string" && item.length > 0);
}

function validTolerations(value) {
  return Array.isArray(value) && value.every((item) =>
    item && typeof item === "object" && !Array.isArray(item) &&
    typeof item.key === "string" && item.key.length > 0 &&
    ["Equal", "Exists"].includes(item.operator) &&
    ["NoSchedule", "PreferNoSchedule", "NoExecute"].includes(item.effect));
}

export async function loadCloudEpisodeProductionConfig(repoRoot, {
  configPath = path.join(repoRoot, "config", "cloud-episode-production.json"),
  environment = process.env,
} = {}) {
  const value = JSON.parse(await readFile(configPath, "utf8"));
  if (
    value?.kind !== "worldkit-cloud-episode-production-config" ||
    value?.schemaVersion !== 2 ||
    value?.executionProfile !== "cpu-gpu-batch-cpu@1"
  ) throw new Error("Cloud Episode production config identity is invalid.");
  if (value.enabled !== true) return null;
  const workerImage = environment.WORLDKIT_CLOUD_WORKER_IMAGE || value.workerImage;
  if (!DIGEST_IMAGE.test(String(workerImage ?? ""))) {
    throw new Error("Enabled Cloud Episode production requires a digest-pinned Worker image.");
  }
  const nodeSelector = value.nodeSelector ?? {};
  if (!validNodeSelector(nodeSelector)) {
    throw new Error("Cloud Episode nodeSelector must contain non-empty string labels.");
  }
  const tolerations = value.tolerations ?? [];
  if (!validTolerations(tolerations)) {
    throw new Error("Cloud Episode tolerations are invalid.");
  }
  const gpuBatch = value.gpuBatch;
  if (
    !Number.isSafeInteger(gpuBatch?.minimumBatchSize) ||
    gpuBatch.minimumBatchSize < 100 ||
    !Number.isSafeInteger(gpuBatch?.maximumBatchSize) ||
    gpuBatch.maximumBatchSize < gpuBatch.minimumBatchSize ||
    !Number.isSafeInteger(gpuBatch?.tailFlushIdleSeconds) ||
    gpuBatch.tailFlushIdleSeconds < 60 ||
    gpuBatch.tailFlushIdleSeconds > 3_600 ||
    !Number.isSafeInteger(gpuBatch?.taskLeaseSeconds) ||
    gpuBatch.taskLeaseSeconds < 900 ||
    gpuBatch.taskLeaseSeconds > 3_600 ||
    !Number.isSafeInteger(gpuBatch?.dispatcherIntervalSeconds) ||
    gpuBatch.dispatcherIntervalSeconds < 10 ||
    !Number.isSafeInteger(gpuBatch?.caseConcurrency) ||
    gpuBatch.caseConcurrency < 1 ||
    gpuBatch.caseConcurrency > 10 ||
    typeof gpuBatch.dispatchReadyImmediately !== "boolean"
  ) throw new Error("Cloud Episode GPU Batch config is invalid.");
  for (const key of ["ephemeralStorageRequest", "ephemeralStorageLimit"]) {
    if (typeof gpuBatch[key] !== "string" || !/^[1-9][0-9]*(?:Mi|Gi)$/.test(gpuBatch[key])) {
      throw new Error(`Cloud Episode GPU Batch storage config is invalid: ${key}`);
    }
  }
  const cpuWorker = value.cpuWorker;
  for (const key of [
    "cpuRequest", "cpuLimit", "memoryRequest", "memoryLimit",
    "ephemeralStorageRequest", "ephemeralStorageLimit",
  ]) {
    if (typeof cpuWorker?.[key] !== "string" || cpuWorker[key].length === 0) {
      throw new Error(`Cloud Episode CPU Worker config is missing: ${key}`);
    }
  }
  const cpuNodeSelector = cpuWorker.nodeSelector ?? {};
  if (!validNodeSelector(cpuNodeSelector)) {
    throw new Error("Cloud Episode CPU Worker nodeSelector is invalid.");
  }
  const cpuTolerations = cpuWorker.tolerations ?? [];
  if (!validTolerations(cpuTolerations)) {
    throw new Error("Cloud Episode CPU Worker tolerations are invalid.");
  }
  return Object.freeze({
    workerImage,
    outputS3Root: assertS3Uri(value.outputS3Root),
    namespace: value.namespace ?? "lwdp",
    gpuResourceName: value.gpuResourceName ?? "nvidia.com/gpu",
    gpuCount: Number(value.gpuCount ?? 1),
    executionProfile: value.executionProfile,
    gpuBatch: Object.freeze({
      queueS3Prefix: assertS3Uri(gpuBatch.queueS3Prefix),
      minimumBatchSize: gpuBatch.minimumBatchSize,
      maximumBatchSize: gpuBatch.maximumBatchSize,
      tailFlushIdleSeconds: gpuBatch.tailFlushIdleSeconds,
      taskLeaseSeconds: gpuBatch.taskLeaseSeconds,
      dispatcherIntervalSeconds: gpuBatch.dispatcherIntervalSeconds,
      caseConcurrency: gpuBatch.caseConcurrency,
      dispatchReadyImmediately: gpuBatch.dispatchReadyImmediately,
      ephemeralStorageRequest: gpuBatch.ephemeralStorageRequest,
      ephemeralStorageLimit: gpuBatch.ephemeralStorageLimit,
    }),
    cpuWorker: Object.freeze({
      ...cpuWorker,
      nodeSelector: Object.freeze({ ...cpuNodeSelector }),
      tolerations: Object.freeze(cpuTolerations.map((item) =>
        Object.freeze({ ...item }))),
    }),
    nodeSelector,
    tolerations,
  });
}

export function cloudEpisodeInternalStage(execution) {
  const active = Array.isArray(execution?.stages)
    ? execution.stages.find((stage) =>
      stage?.stage_id === execution?.current_stage_id) ??
      execution.stages.find((stage) => stage?.status === "running")
    : null;
  return active?.diagnostics?.internal_stage ??
    execution?.diagnostics?.internal_stage ??
    execution?.current_stage_id ??
    "episode-production";
}

async function launchEpisodeStageWorker({
  stageId,
  executionId,
  requestS3Uri,
  outputS3Prefix,
  workerImage,
  config,
  cloudConfig,
  attempt = 1,
  launchImplementation,
}) {
  if (stageId === "whitebox-capture") {
    return { awaitingGpuBatch: true, stageId };
  }
  const executionPart = stageId === "episode-production"
    ? "full"
    : CLOUD_EPISODE_PART_BY_STAGE_ID[stageId];
  if (!executionPart) throw new Error(`Unsupported Cloud Episode stage: ${stageId}`);
  return launchImplementation({
    executionId,
    stageId,
    executionPart,
    requestS3Uri,
    outputS3Prefix,
    image: workerImage,
    namespace: config.namespace,
    userId: cloudConfig.userId,
    ...(stageId === "episode-production"
      ? {
          gpuResourceName: config.gpuResourceName,
          gpuCount: config.gpuCount,
          nodeSelector: config.nodeSelector,
          tolerations: config.tolerations,
          gpuRequired: true,
        }
      : { gpuRequired: false, ...config.cpuWorker }),
    jobSuffix: attempt > 1 ? `retry-${attempt}` : "",
  });
}

async function launchReadyCpuStage(execution, options) {
  const stageId = execution?.current_stage_id;
  const stage = execution?.stages?.find?.((item) => item?.stage_id === stageId);
  if (!stage || stage.status !== "ready" || stageId === "whitebox-capture") return null;
  return launchEpisodeStageWorker({
    ...options,
    stageId,
    attempt: Number(stage.current_attempt ?? 1),
  });
}

export async function executeStudioCloudEpisode({
  sceneId,
  episodeId,
  sceneExecutionId,
  sceneManifestS3Uri,
  sceneRecord,
  productionScope = "full",
  styleVariantMode = "legacy",
  requestId,
  config,
  cloudConfig,
  fetchImplementation,
  onSubmitted = async () => undefined,
  onProgress = async () => undefined,
  submitImplementation = submitCloudEpisode,
  launchImplementation = launchCloudEpisodeWorkerJob,
  pollImplementation = pollCloudExecution,
  stagesImplementation = getCloudExecutionStages,
}) {
  const outputS3Prefix = joinS3Uri(
    config.outputS3Root,
    sceneId,
    episodeId,
  );
  const submitted = await submitImplementation({
    sceneId,
    episodeId,
    sceneExecutionId,
    sceneManifestS3Uri,
    sceneRecord,
    productionScope,
    styleVariantMode,
    gpuBatch: config.gpuBatch,
    workerImage: config.workerImage,
    requestId,
    outputS3Prefix,
    cloudConfig,
    fetchImplementation,
  });
  await onSubmitted({ ...submitted, outputS3Prefix });
  await launchEpisodeStageWorker({
    stageId: "episode-prepare",
    executionId: submitted.executionId,
    requestS3Uri: submitted.requestS3Uri,
    outputS3Prefix,
    workerImage: submitted.workerImage,
    config,
    cloudConfig,
    launchImplementation,
  });
  const execution = cloudExecutionRecord(await pollImplementation(
    submitted.executionId,
    {
      config: cloudConfig,
      fetchImplementation,
      onProgress: async (current) => {
        const value = cloudExecutionRecord(current);
        await launchReadyCpuStage(value, {
          executionId: submitted.executionId,
          requestS3Uri: submitted.requestS3Uri,
          outputS3Prefix,
          workerImage: submitted.workerImage,
          config,
          cloudConfig,
          launchImplementation,
        });
        await onProgress(value);
      },
    },
  ));
  const stages = await stagesImplementation(submitted.executionId, {
    config: cloudConfig,
    fetchImplementation,
  });
  return {
    execution,
    stages,
    manifestS3Uri: cloudArtifactManifestS3Uri(execution, stages, "episode-render"),
    outputS3Prefix,
    submitted,
  };
}

export async function retryStudioCloudEpisode({
  executionId,
  requestS3Uri,
  outputS3Prefix,
  retryRequestId,
  attempt,
  stageId = "episode-render",
  workerImage,
  config,
  cloudConfig,
  fetchImplementation,
  onProgress = async () => undefined,
  retryImplementation = retryCloudExecutionStage,
  launchImplementation = launchCloudEpisodeWorkerJob,
  pollImplementation = pollCloudExecution,
  stagesImplementation = getCloudExecutionStages,
}) {
  await retryImplementation(executionId, {
    stage_id: stageId,
    retry_request_id: retryRequestId,
    reason: "Studio requested Episode stage retry",
  }, {
    config: cloudConfig,
    fetchImplementation,
  });
  const launch = await launchEpisodeStageWorker({
    stageId,
    executionId,
    requestS3Uri,
    outputS3Prefix,
    workerImage,
    config,
    cloudConfig,
    attempt,
    launchImplementation,
  });
  const execution = cloudExecutionRecord(await pollImplementation(executionId, {
    config: cloudConfig,
    fetchImplementation,
    onProgress: async (current) => {
      const value = cloudExecutionRecord(current);
      await launchReadyCpuStage(value, {
        executionId,
        requestS3Uri,
        outputS3Prefix,
        workerImage,
        config,
        cloudConfig,
        launchImplementation,
      });
      await onProgress(value);
    },
  }));
  const stages = await stagesImplementation(executionId, {
    config: cloudConfig,
    fetchImplementation,
  });
  return {
    execution,
    stages,
    manifestS3Uri: cloudArtifactManifestS3Uri(execution, stages, "episode-render"),
    outputS3Prefix,
    awaitingGpuBatch: launch?.awaitingGpuBatch === true,
  };
}

export async function recoverStudioCloudEpisode({
  executionId,
  requestS3Uri,
  outputS3Prefix,
  workerImage,
  attempt = 1,
  config,
  cloudConfig,
  fetchImplementation,
  onProgress = async () => undefined,
  getImplementation = getCloudExecution,
  pollImplementation = pollCloudExecution,
  stagesImplementation = getCloudExecutionStages,
  launchImplementation = launchCloudEpisodeWorkerJob,
}) {
  let execution = cloudExecutionRecord(await getImplementation(executionId, {
    config: cloudConfig,
    fetchImplementation,
  }));
  if (["failed", "interrupted"].includes(String(execution.status))) {
    return { execution, retryRequired: true, stages: [], manifestS3Uri: null };
  }
  if (execution.status === "cancelled") {
    return { execution, cancelled: true, stages: [], manifestS3Uri: null };
  }
  if (execution.status !== "succeeded") {
    const currentStage = execution.stages?.find?.((stage) =>
      stage?.stage_id === execution.current_stage_id);
    if (
      currentStage?.status === "ready" &&
      requestS3Uri && outputS3Prefix && workerImage && config
    ) {
      await launchReadyCpuStage(execution, {
        executionId,
        requestS3Uri,
        outputS3Prefix,
        workerImage,
        config,
        cloudConfig,
        launchImplementation,
      });
    }
    execution = cloudExecutionRecord(await pollImplementation(executionId, {
      config: cloudConfig,
      fetchImplementation,
      onProgress: async (current) => {
        const value = cloudExecutionRecord(current);
        await launchReadyCpuStage(value, {
          executionId,
          requestS3Uri,
          outputS3Prefix,
          workerImage,
          config,
          cloudConfig,
          launchImplementation,
        });
        await onProgress(value);
      },
    }));
  }
  const stages = await stagesImplementation(executionId, {
    config: cloudConfig,
    fetchImplementation,
  });
  return {
    execution,
    stages,
    retryRequired: ["failed", "interrupted"].includes(String(execution.status)),
    cancelled: execution.status === "cancelled",
    manifestS3Uri: cloudArtifactManifestS3Uri(execution, stages, "episode-render"),
  };
}
