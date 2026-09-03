import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  cloudEpisodeInternalStage,
  executeStudioCloudEpisode,
  loadCloudEpisodeProductionConfig,
  recoverStudioCloudEpisode,
  retryStudioCloudEpisode,
} from "./cloud-episode-production.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("uses the deployment-owned Worker digest over the image-baked config", async () => {
  const workerImage = `worker@sha256:${"f".repeat(64)}`;
  const config = await loadCloudEpisodeProductionConfig(repoRoot, {
    environment: { WORLDKIT_CLOUD_WORKER_IMAGE: workerImage },
  });
  assert.equal(config.workerImage, workerImage);
});

test("keeps Cloud Episode disabled until a digest-pinned GPU image is deployed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "worldkit-cloud-episode-config-"));
  const configPath = path.join(root, "config.json");
  try {
    await writeFile(configPath, JSON.stringify({
      kind: "worldkit-cloud-episode-production-config",
      schemaVersion: 2,
      executionProfile: "cpu-gpu-batch-cpu@1",
      enabled: false,
      workerImage: null,
    }));
    assert.equal(await loadCloudEpisodeProductionConfig(root, { configPath }), null);
    await writeFile(configPath, JSON.stringify({
      kind: "worldkit-cloud-episode-production-config",
      schemaVersion: 2,
      executionProfile: "cpu-gpu-batch-cpu@1",
      enabled: true,
      workerImage: "worldkit:latest",
      outputS3Root: "s3://bucket/episodes",
    }));
    await assert.rejects(
      loadCloudEpisodeProductionConfig(root, { configPath }),
      /digest-pinned/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retries one CPU Episode stage and launches only its new worker attempt", async () => {
  const calls = [];
  const result = await retryStudioCloudEpisode({
    executionId: "exec-episode-001",
    requestS3Uri: "s3://bucket/episode/request.json",
    outputS3Prefix: "s3://bucket/episode",
    retryRequestId: "episode-retry-2",
    attempt: 2,
    stageId: "episode-render",
    workerImage: `worker@sha256:${"c".repeat(64)}`,
    config: {
      workerImage: `worker@sha256:${"c".repeat(64)}`,
      namespace: "lwdp",
      gpuResourceName: "nvidia.com/gpu",
      gpuCount: 1,
      cpuWorker: {},
    },
    cloudConfig: { userId: "partner_codex", baseUrl: "http://lwdp-internal" },
    retryImplementation: async (_executionId, input) => {
      calls.push(["retry", input.stage_id, input.retry_request_id]);
    },
    launchImplementation: async (input) => {
      calls.push(["launch", input.jobSuffix, input.userId, input.image]);
    },
    pollImplementation: async () => ({
      execution_id: "exec-episode-001",
      status: "succeeded",
      diagnostics: { manifest_s3_uri: "s3://bucket/episode/retry-manifest.json" },
    }),
    stagesImplementation: async () => ({ stages: [] }),
  });
  assert.deepEqual(calls, [
    ["retry", "episode-render", "episode-retry-2"],
    ["launch", "retry-2", "partner_codex", `worker@sha256:${"c".repeat(64)}`],
  ]);
  assert.equal(result.manifestS3Uri, "s3://bucket/episode/retry-manifest.json");
});

test("submits the three-stage Episode execution and launches CPU prepare only", async () => {
  const calls = [];
  const result = await executeStudioCloudEpisode({
    sceneId: "scene-cloud-001",
    episodeId: "episode-scene-cloud-001-a1b2c3",
    sceneExecutionId: "exec-scene-001",
    sceneManifestS3Uri: "s3://bucket/scene/manifest.json",
    sceneRecord: { id: "scene-cloud-001" },
    productionScope: "visual-sample",
    styleVariantMode: "legacy",
    resumeEpisodeManifest: {
      executionId: "exec-episode-prior",
      s3Uri: "s3://bucket/episode-prior/capture-manifest.json",
    },
    workerImage: `worker@sha256:${"b".repeat(64)}`,
    requestId: "episode-run-001",
    config: {
      outputS3Root: "s3://bucket/episodes",
      workerImage: `worker@sha256:${"a".repeat(64)}`,
      namespace: "lwdp",
      gpuResourceName: "nvidia.com/gpu",
      gpuCount: 1,
      gpuBatch: {
        queueS3Prefix: "s3://bucket/gpu-queue",
        minimumBatchSize: 100,
        maximumBatchSize: 128,
      },
      cpuWorker: {},
    },
    cloudConfig: { userId: "partner_codex", baseUrl: "http://lwdp-internal" },
    submitImplementation: async (input) => {
      calls.push([
        "submit",
        input.outputS3Prefix,
        input.productionScope,
        input.styleVariantMode,
        input.workerImage,
        input.resumeEpisodeManifest,
      ]);
      return {
        executionId: "exec-episode-001",
        requestS3Uri: "s3://bucket/episode/request.json",
        workerImage: input.workerImage,
      };
    },
    launchImplementation: async (input) => {
      calls.push([
        "launch",
        input.stageId,
        input.executionPart,
        input.gpuRequired,
        input.userId,
        input.apiBase,
      ]);
    },
    pollImplementation: async () => ({
      execution_id: "exec-episode-001",
      status: "succeeded",
      diagnostics: { manifest_s3_uri: "s3://bucket/episode/manifest.json" },
    }),
    stagesImplementation: async () => ({ stages: [] }),
  });
  assert.deepEqual(calls, [
    [
      "submit",
      "s3://bucket/episodes/scene-cloud-001/episode-scene-cloud-001-a1b2c3",
      "visual-sample",
      "legacy",
      `worker@sha256:${"b".repeat(64)}`,
      {
        executionId: "exec-episode-prior",
        s3Uri: "s3://bucket/episode-prior/capture-manifest.json",
      },
    ],
    ["launch", "episode-prepare", "prepare", false, "partner_codex", "http://lwdp-internal"],
  ]);
  assert.equal(result.execution.status, "succeeded");
  assert.equal(result.manifestS3Uri, "s3://bucket/episode/manifest.json");
  assert.equal(cloudEpisodeInternalStage({ diagnostics: { internal_stage: "whitebox-capture" } }), "whitebox-capture");
});

test("recovers an existing Cloud Episode without launching a duplicate worker", async () => {
  let pollCount = 0;
  const recovered = await recoverStudioCloudEpisode({
    executionId: "exec-episode-existing",
    getImplementation: async () => ({
      execution_id: "exec-episode-existing",
      status: "running",
      current_stage_id: "episode-render",
    }),
    pollImplementation: async () => {
      pollCount += 1;
      return {
        execution_id: "exec-episode-existing",
        status: "succeeded",
        diagnostics: { manifest_s3_uri: "s3://bucket/episode/manifest.json" },
      };
    },
    stagesImplementation: async () => ({ stages: [] }),
  });
  assert.equal(pollCount, 1);
  assert.equal(recovered.execution.status, "succeeded");
  assert.equal(recovered.retryRequired, false);
  assert.equal(recovered.manifestS3Uri, "s3://bucket/episode/manifest.json");

  const interrupted = await recoverStudioCloudEpisode({
    executionId: "exec-episode-interrupted",
    getImplementation: async () => ({
      execution_id: "exec-episode-interrupted",
      status: "interrupted",
    }),
  });
  assert.equal(interrupted.retryRequired, true);
  assert.equal(interrupted.manifestS3Uri, null);
});

test("does not mutate an already-running Worker Job during recovery", async () => {
  const launches = [];
  const workerImage = `worker@sha256:${"f".repeat(64)}`;
  const recovered = await recoverStudioCloudEpisode({
    executionId: "exec-episode-recoverable",
    requestS3Uri: "s3://bucket/episode/request.json",
    outputS3Prefix: "s3://bucket/episode",
    workerImage,
    attempt: 2,
    config: {
      namespace: "lwdp",
      gpuResourceName: "nvidia.com/gpu",
      gpuCount: 1,
      nodeSelector: {},
      tolerations: [],
      cpuWorker: {},
    },
    cloudConfig: { userId: "worldkit-studio" },
    getImplementation: async () => ({
      execution_id: "exec-episode-recoverable",
      status: "running",
      current_stage_id: "episode-render",
      stages: [{
        stage_id: "episode-render",
        status: "running",
        current_attempt: 2,
      }],
    }),
    launchImplementation: async (input) => launches.push(input),
    pollImplementation: async () => ({
      execution_id: "exec-episode-recoverable",
      status: "succeeded",
      diagnostics: { manifest_s3_uri: "s3://bucket/episode/manifest.json" },
    }),
    stagesImplementation: async () => ({ stages: [] }),
  });
  assert.equal(recovered.execution.status, "succeeded");
  assert.equal(launches.length, 0);
});

test("launches a missing ready CPU stage with its exact remote attempt", async () => {
  const launches = [];
  const workerImage = `worker@sha256:${"e".repeat(64)}`;
  await recoverStudioCloudEpisode({
    executionId: "exec-episode-ready",
    requestS3Uri: "s3://bucket/episode/request.json",
    outputS3Prefix: "s3://bucket/episode",
    workerImage,
    config: {
      namespace: "lwdp",
      gpuResourceName: "nvidia.com/gpu",
      gpuCount: 1,
      nodeSelector: {},
      tolerations: [],
      cpuWorker: {},
    },
    cloudConfig: { userId: "worldkit-studio" },
    getImplementation: async () => ({
      execution_id: "exec-episode-ready",
      status: "queued",
      current_stage_id: "episode-render",
      stages: [{
        stage_id: "episode-render",
        status: "ready",
        current_attempt: 3,
      }],
    }),
    launchImplementation: async (input) => launches.push(input),
    pollImplementation: async () => ({
      execution_id: "exec-episode-ready",
      status: "succeeded",
      diagnostics: { manifest_s3_uri: "s3://bucket/episode/manifest.json" },
    }),
    stagesImplementation: async () => ({ stages: [] }),
  });
  assert.equal(launches.length, 1);
  assert.equal(launches[0].image, workerImage);
  assert.equal(launches[0].stageId, "episode-render");
  assert.equal(launches[0].jobSuffix, "retry-3");
});

test("uses the local recovery generation when the worker failed before claim", async () => {
  const launches = [];
  await recoverStudioCloudEpisode({
    executionId: "exec-episode-preclaim-failure",
    requestS3Uri: "s3://bucket/episode/request.json",
    outputS3Prefix: "s3://bucket/episode",
    workerImage: `worker@sha256:${"f".repeat(64)}`,
    attempt: 4,
    config: {
      namespace: "lwdp",
      gpuResourceName: "nvidia.com/gpu",
      gpuCount: 1,
      nodeSelector: {},
      tolerations: [],
      cpuWorker: {},
    },
    cloudConfig: { userId: "worldkit-studio" },
    getImplementation: async () => ({
      execution_id: "exec-episode-preclaim-failure",
      status: "queued",
      current_stage_id: "episode-prepare",
      stages: [{
        stage_id: "episode-prepare",
        status: "ready",
        current_attempt: 0,
      }],
    }),
    launchImplementation: async (input) => launches.push(input),
    pollImplementation: async () => ({
      execution_id: "exec-episode-preclaim-failure",
      status: "succeeded",
      diagnostics: { manifest_s3_uri: "s3://bucket/episode/manifest.json" },
    }),
    stagesImplementation: async () => ({ stages: [] }),
  });
  assert.equal(launches.length, 1);
  assert.equal(launches[0].jobSuffix, "retry-4");
});
