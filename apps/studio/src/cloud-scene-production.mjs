import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  cloudExecutionRecord,
  dispatchCloudExecution,
  getCloudExecutionStages,
  pollCloudExecution,
  retryCloudExecutionStage,
} from "../../../scripts/lib/lwdp-cloud-execution-client.mjs";
import { launchCloudSceneWorkerJob } from
  "../../../scripts/cloud/launch-worldkit-cloud-worker-job.mjs";
import { submitCloudScene, submitCloudSceneFromExistingRequest } from
  "../../../scripts/cloud/submit-worldkit-cloud-scene.mjs";
import { assertS3Uri, joinS3Uri } from
  "../../../scripts/lib/lwdp-generation-client.mjs";

const DIGEST_IMAGE = /^[a-z0-9][a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/;

export async function loadCloudSceneProductionConfig(repoRoot, {
  configPath = path.join(repoRoot, "config", "cloud-scene-production.json"),
  environment = process.env,
} = {}) {
  const value = JSON.parse(await readFile(configPath, "utf8"));
  const workerImage = environment.WORLDKIT_CLOUD_WORKER_IMAGE || value.workerImage;
  if (
    value?.kind !== "worldkit-cloud-scene-production-config" ||
    value?.schemaVersion !== 1 ||
    !DIGEST_IMAGE.test(String(workerImage ?? ""))
  ) throw new Error("Cloud Scene production config must use one digest-pinned Worker image.");
  return Object.freeze({
    workerImage,
    outputS3Root: assertS3Uri(value.outputS3Root),
    namespace: value.namespace ?? "lwdp",
  });
}

function stagesFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.stages)) return payload.stages;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function cloudArtifactManifestS3Uri(execution, stagesPayload, preferredStageId = null) {
  const stages = stagesFromPayload(stagesPayload);
  const artifacts = [
    ...(Array.isArray(execution?.artifacts) ? execution.artifacts : []),
    ...stages.flatMap((stage) => Array.isArray(stage?.artifacts) ? stage.artifacts : []),
  ];
  const declared = artifacts.find((artifact) =>
    (preferredStageId === null || artifact?.stage_id === preferredStageId) &&
    artifact?.role === "worldkit-cloud-artifact-manifest" &&
    typeof (artifact.s3_uri ?? artifact.s3Uri) === "string") ?? artifacts.find((artifact) =>
      artifact?.role === "worldkit-cloud-artifact-manifest" &&
      typeof (artifact.s3_uri ?? artifact.s3Uri) === "string");
  const preferredStages = preferredStageId === null
    ? stages
    : stages.filter((stage) => stage?.stage_id === preferredStageId);
  const diagnosticUri = preferredStages
    .map((stage) => stage?.diagnostics?.manifest_s3_uri)
    .find((value) => typeof value === "string") ??
    execution?.diagnostics?.manifest_s3_uri;
  const uri = declared?.s3_uri ?? declared?.s3Uri ?? diagnosticUri;
  return typeof uri === "string" ? assertS3Uri(uri) : null;
}

export function cloudInternalStage(execution) {
  const active = Array.isArray(execution?.stages)
    ? execution.stages.find((stage) => stage?.stage_id === "scene-production")
    : null;
  return active?.diagnostics?.internal_stage ??
    execution?.diagnostics?.internal_stage ??
    execution?.current_stage_id ??
    "scene-production";
}

export async function launchStudioCloudSceneWorker({
  executionId,
  requestS3Uri,
  outputS3Prefix,
  manifestS3Uri = null,
  resumeSourceExecutionId = undefined,
  resumeMode = "verify-only",
  attempt = 1,
  userId,
  config,
  launchImplementation = launchCloudSceneWorkerJob,
}) {
  return launchImplementation({
    executionId,
    requestS3Uri,
    outputS3Prefix,
    image: config.workerImage,
    namespace: config.namespace,
    userId,
    ...(manifestS3Uri === null
      ? {}
      : {
          resumeManifestS3Uri: manifestS3Uri,
          resumeSourceExecutionId,
          resumeMode,
          jobSuffix: `${resumeMode}-${attempt}`,
        }),
  });
}

export async function executeStudioCloudScene({
  sceneId,
  prompt,
  referenceImagePath,
  requestId,
  attempt,
  config,
  cloudConfig,
  fetchImplementation,
  onSubmitted = async () => undefined,
  onDispatched = async () => undefined,
  onLaunched = async () => undefined,
  onProgress = async () => undefined,
  submitImplementation = submitCloudScene,
  dispatchImplementation = dispatchCloudExecution,
  launchImplementation = launchCloudSceneWorkerJob,
  pollImplementation = pollCloudExecution,
  stagesImplementation = getCloudExecutionStages,
  resumeManifestS3Uri = null,
  resumeSourceExecutionId = undefined,
  resumeMode = "verify-only",
}) {
  const outputS3Prefix = joinS3Uri(
    config.outputS3Root,
    sceneId,
    `attempt-${attempt}`,
  );
  const submitted = await submitImplementation({
    sceneId,
    prompt,
    images: referenceImagePath ? [referenceImagePath] : [],
    requestId,
    outputS3Prefix,
    cloudConfig,
    fetchImplementation,
    autoDispatch: false,
  });
  await onSubmitted({ ...submitted, outputS3Prefix });
  await dispatchImplementation(submitted.executionId, {
    config: cloudConfig,
    fetchImplementation,
  });
  await onDispatched({ executionId: submitted.executionId });
  const launched = await launchStudioCloudSceneWorker({
    executionId: submitted.executionId,
    requestS3Uri: submitted.requestS3Uri,
    outputS3Prefix,
    manifestS3Uri: resumeManifestS3Uri,
    resumeSourceExecutionId,
    resumeMode,
    config,
    userId: cloudConfig.userId,
    launchImplementation,
  });
  await onLaunched(launched);
  const execution = cloudExecutionRecord(await pollImplementation(
    submitted.executionId,
    {
      config: cloudConfig,
      fetchImplementation,
      onProgress: (current) => {
        Promise.resolve(onProgress(cloudExecutionRecord(current))).catch(() => undefined);
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
    manifestS3Uri: cloudArtifactManifestS3Uri(execution, stages),
    outputS3Prefix,
    submitted,
  };
}

async function resumeStudioCloudSceneFromManifest({
  executionId,
  requestS3Uri,
  outputS3Prefix,
  manifestS3Uri,
  retryRequestId,
  attempt,
  resumeMode,
  config,
  cloudConfig,
  fetchImplementation,
  onSubmitted = async () => undefined,
  onLaunched = async () => undefined,
  onProgress = async () => undefined,
  retryImplementation = retryCloudExecutionStage,
  launchImplementation = launchCloudSceneWorkerJob,
  pollImplementation = pollCloudExecution,
  stagesImplementation = getCloudExecutionStages,
}) {
  await retryImplementation(executionId, {
    stage_id: "scene-production",
    retry_request_id: retryRequestId,
  }, { config: cloudConfig, fetchImplementation });
  await onSubmitted({ executionId, requestS3Uri, outputS3Prefix });
  const launched = await launchStudioCloudSceneWorker({
    executionId,
    requestS3Uri,
    outputS3Prefix,
    manifestS3Uri,
    resumeMode,
    attempt,
    config,
    userId: cloudConfig.userId,
    launchImplementation,
  });
  await onLaunched(launched);
  const execution = cloudExecutionRecord(await pollImplementation(executionId, {
    config: cloudConfig,
    fetchImplementation,
    onProgress: (current) => {
      Promise.resolve(onProgress(cloudExecutionRecord(current))).catch(() => undefined);
    },
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
    submitted: { executionId, requestS3Uri },
  };
}

export function resumeStudioCloudSceneHost(options) {
  return resumeStudioCloudSceneFromManifest({ ...options, resumeMode: "host" });
}

export function resumeStudioCloudSceneBuilder(options) {
  return resumeStudioCloudSceneFromManifest({ ...options, resumeMode: "builder" });
}

export function rebuildStudioCloudSceneBuilder({
  sourceExecutionId,
  sourceManifestS3Uri,
  sourceRequestSource,
  sourceRequestS3Uri,
  submitExistingRequestImplementation = submitCloudSceneFromExistingRequest,
  ...options
}) {
  return executeStudioCloudScene({
    ...options,
    referenceImagePath: null,
    resumeManifestS3Uri: sourceManifestS3Uri,
    resumeSourceExecutionId: sourceExecutionId,
    resumeMode: "builder",
    submitImplementation: (input) => submitExistingRequestImplementation({
      ...input,
      sourceRequestSource,
      sourceRequestS3Uri,
    }),
  });
}
