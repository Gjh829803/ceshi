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

const DIGEST_IMAGE = /^[a-z0-9][a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/;

export async function loadCloudEpisodeProductionConfig(repoRoot, {
  configPath = path.join(repoRoot, "config", "cloud-episode-production.json"),
} = {}) {
  const value = JSON.parse(await readFile(configPath, "utf8"));
  if (
    value?.kind !== "worldkit-cloud-episode-production-config" ||
    value?.schemaVersion !== 1
  ) throw new Error("Cloud Episode production config identity is invalid.");
  if (value.enabled !== true) return null;
  if (!DIGEST_IMAGE.test(String(value.workerImage ?? ""))) {
    throw new Error("Enabled Cloud Episode production requires a digest-pinned Worker image.");
  }
  const nodeSelector = value.nodeSelector ?? {};
  if (
    !nodeSelector ||
    typeof nodeSelector !== "object" ||
    Array.isArray(nodeSelector) ||
    Object.entries(nodeSelector).some(([key, item]) =>
      typeof key !== "string" || key.length === 0 ||
      typeof item !== "string" || item.length === 0)
  ) throw new Error("Cloud Episode nodeSelector must contain non-empty string labels.");
  const tolerations = value.tolerations ?? [];
  if (!Array.isArray(tolerations) || tolerations.some((item) =>
    !item || typeof item !== "object" || Array.isArray(item) ||
    typeof item.key !== "string" || item.key.length === 0 ||
    !["Equal", "Exists"].includes(item.operator) ||
    !["NoSchedule", "PreferNoSchedule", "NoExecute"].includes(item.effect)
  )) throw new Error("Cloud Episode tolerations are invalid.");
  return Object.freeze({
    workerImage: value.workerImage,
    outputS3Root: assertS3Uri(value.outputS3Root),
    namespace: value.namespace ?? "lwdp",
    gpuResourceName: value.gpuResourceName ?? "nvidia.com/gpu",
    gpuCount: Number(value.gpuCount ?? 1),
    nodeSelector,
    tolerations,
  });
}

export function cloudEpisodeInternalStage(execution) {
  const active = Array.isArray(execution?.stages)
    ? execution.stages.find((stage) => stage?.stage_id === "episode-production")
    : null;
  return active?.diagnostics?.internal_stage ??
    execution?.diagnostics?.internal_stage ??
    execution?.current_stage_id ??
    "episode-production";
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
    workerImage: config.workerImage,
    requestId,
    outputS3Prefix,
    cloudConfig,
    fetchImplementation,
  });
  await onSubmitted({ ...submitted, outputS3Prefix });
  await launchImplementation({
    executionId: submitted.executionId,
    requestS3Uri: submitted.requestS3Uri,
    outputS3Prefix,
    image: submitted.workerImage,
    namespace: config.namespace,
    userId: cloudConfig.userId,
    gpuResourceName: config.gpuResourceName,
    gpuCount: config.gpuCount,
    nodeSelector: config.nodeSelector,
    tolerations: config.tolerations,
  });
  const execution = cloudExecutionRecord(await pollImplementation(
    submitted.executionId,
    {
      config: cloudConfig,
      fetchImplementation,
      onProgress: (current) => void onProgress(cloudExecutionRecord(current)),
    },
  ));
  const stages = await stagesImplementation(submitted.executionId, {
    config: cloudConfig,
    fetchImplementation,
  });
  return {
    execution,
    stages,
    manifestS3Uri: cloudArtifactManifestS3Uri(execution, stages),
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
    stage_id: "episode-production",
    retry_request_id: retryRequestId,
    reason: "Studio requested Episode stage retry",
  }, {
    config: cloudConfig,
    fetchImplementation,
  });
  await launchImplementation({
    executionId,
    requestS3Uri,
    outputS3Prefix,
    image: workerImage,
    namespace: config.namespace,
    userId: cloudConfig.userId,
    gpuResourceName: config.gpuResourceName,
    gpuCount: config.gpuCount,
    nodeSelector: config.nodeSelector,
    tolerations: config.tolerations,
    jobSuffix: `retry-${attempt}`,
  });
  const execution = cloudExecutionRecord(await pollImplementation(executionId, {
    config: cloudConfig,
    fetchImplementation,
    onProgress: (current) => void onProgress(cloudExecutionRecord(current)),
  }));
  const stages = await stagesImplementation(executionId, {
    config: cloudConfig,
    fetchImplementation,
  });
  return {
    execution,
    stages,
    manifestS3Uri: cloudArtifactManifestS3Uri(execution, stages),
    outputS3Prefix,
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
    if (requestS3Uri && outputS3Prefix && workerImage && config) {
      await launchImplementation({
        executionId,
        requestS3Uri,
        outputS3Prefix,
        image: workerImage,
        namespace: config.namespace,
        userId: cloudConfig.userId,
        gpuResourceName: config.gpuResourceName,
        gpuCount: config.gpuCount,
        nodeSelector: config.nodeSelector,
        tolerations: config.tolerations,
        jobSuffix: attempt > 1 ? `retry-${attempt}` : "",
      });
    }
    execution = cloudExecutionRecord(await pollImplementation(executionId, {
      config: cloudConfig,
      fetchImplementation,
      onProgress: (current) => void onProgress(cloudExecutionRecord(current)),
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
    manifestS3Uri: cloudArtifactManifestS3Uri(execution, stages),
  };
}
