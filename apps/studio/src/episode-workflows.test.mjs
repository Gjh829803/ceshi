import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, get as httpGet } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import {
  createEpisodeWorkflowService,
  failedEpisodeStageId,
  resumedEpisodeWorkerImage,
  resolveEpisodeRecordWrite,
} from "./episode-workflows.mjs";

test("explicit worker upgrade resumes from the same checkpoint on the current image", () => {
  const manifest = { workerImage: `worker@sha256:${"a".repeat(64)}` };
  const record = { remoteWorkerImage: `worker@sha256:${"b".repeat(64)}` };
  assert.equal(resumedEpisodeWorkerImage(manifest, record), manifest.workerImage);
  assert.equal(resumedEpisodeWorkerImage(manifest, record, true), undefined);
});

test("cancelled and succeeded Episode records reject stale lifecycle writers", () => {
  const base = {
    episodeId: "episode-absorbing-001",
    remoteExecutionId: "exec_absorbing_001",
    recordRevision: 9,
  };
  for (const status of ["cancelled", "succeeded"]) {
    const current = { ...base, status };
    const decision = resolveEpisodeRecordWrite(current, {
      ...base,
      recordRevision: 8,
      status: "running",
      currentStage: "late-recovery",
    }, "2026-09-03T00:00:00.000Z");
    assert.equal(decision.applied, false);
    assert.equal(decision.reason, `absorbing-${status}`);
    assert.equal(decision.record.status, status);
  }
  const cancellation = resolveEpisodeRecordWrite({
    ...base,
    status: "running",
  }, {
    ...base,
    recordRevision: 8,
    status: "cancelled",
  }, "2026-09-03T00:00:00.000Z");
  assert.equal(cancellation.applied, true);
  assert.equal(cancellation.record.status, "cancelled");
  assert.equal(cancellation.record.recordRevision, 10);

  const explicitRestart = resolveEpisodeRecordWrite({
    ...base,
    status: "cancelled",
    restartGeneration: 2,
  }, {
    ...base,
    status: "running",
    remoteExecutionId: null,
    restartGeneration: 3,
  }, "2026-09-03T00:00:01.000Z", { allowCancelledRestart: true });
  assert.equal(explicitRestart.applied, true);
  assert.equal(explicitRestart.record.status, "running");
  assert.equal(explicitRestart.record.restartGeneration, 3);

  const staleGeneration = resolveEpisodeRecordWrite({
    ...base,
    status: "running",
    restartGeneration: 3,
  }, {
    ...base,
    status: "cancelled",
    restartGeneration: 2,
  }, "2026-09-03T00:00:02.000Z");
  assert.equal(staleGeneration.applied, false);
  assert.equal(staleGeneration.reason, "restart-generation-drift");
});

test("explicitly resumes a cancelled Cloud Episode from its capture checkpoint", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-cancelled-resume-"));
  const episodeId = "episode-cancelled-resume-001";
  const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
  const record = {
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    sceneId: "cancelled-resume-scene",
    episodeId,
    backend: "cloud",
    productionScope: "full",
    styleVariantMode: "ten-style",
    status: "cancelled",
    currentStage: "style-variant-visual-review",
    remoteExecutionId: "exec_cancelled_resume_001",
    remoteWorkerImage: `worker@sha256:${"b".repeat(64)}`,
    cloudAttempt: 1,
    recordRevision: 7,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:01:00.000Z",
    finishedAt: "2026-09-03T00:01:00.000Z",
    error: "cancelled",
    stages: [{
      id: "style-variant-production",
      title: "styles",
      status: "cancelled",
      startedAt: "2026-09-03T00:00:30.000Z",
      finishedAt: "2026-09-03T00:01:00.000Z",
    }],
  };
  await mkdir(episodeRoot, { recursive: true });
  await writeFile(path.join(episodeRoot, "episode-record.json"), JSON.stringify(record));
  let executionInput = null;
  let executionStarted;
  const started = new Promise((resolve) => { executionStarted = resolve; });
  const persisted = [];
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    persistCloudEpisodeRecord: async (value) => { persisted.push({ ...value }); },
    resolveCloudEpisodeResumeManifest: async () => ({
      executionId: "exec_cancelled_resume_001",
      s3Uri: "s3://bucket/capture/cloud-artifact-manifest.json",
      workerImage: `worker@sha256:${"b".repeat(64)}`,
    }),
    resolveCloudSceneInput: async () => ({
      sceneExecutionId: "exec_scene_resume_001",
      sceneManifestS3Uri: "s3://bucket/scene/cloud-artifact-manifest.json",
      sceneRecord: {},
    }),
    executeCloudEpisode: async (input) => {
      executionInput = input;
      await input.onSubmitted({
        executionId: "exec_restarted_001",
        outputS3Prefix: "s3://bucket/restarted",
        requestS3Uri: "s3://bucket/restarted/inputs/request.json",
        workerImage: `worker@sha256:${"a".repeat(64)}`,
        executionProfile: "cpu-gpu-batch-cpu@1",
        gpuBatch: { minimumBatchSize: 100, maximumBatchSize: 128 },
      });
      executionStarted();
      return new Promise(() => undefined);
    },
    readCloudEpisodeManifest: async () => ({}),
  });
  const server = createServer((request, response) => {
    void service.handleApi(request, response, new URL(request.url, "http://127.0.0.1"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const resumed = await fetch(`${origin}/api/episode-workflows/${episodeId}/resume`, {
      method: "POST",
    }).then((response) => response.json());
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.restartGeneration, 1);
    await started;
    assert.equal(executionInput.requestId, `${episodeId}-restart-1`);
    assert.equal(executionInput.workerImage, `worker@sha256:${"b".repeat(64)}`);
    assert.deepEqual(executionInput.resumeEpisodeManifest, {
      executionId: "exec_cancelled_resume_001",
      s3Uri: "s3://bucket/capture/cloud-artifact-manifest.json",
      workerImage: `worker@sha256:${"b".repeat(64)}`,
    });
    const current = JSON.parse(await readFile(
      path.join(episodeRoot, "episode-record.json"),
      "utf8",
    ));
    assert.equal(current.status, "running");
    assert.equal(current.remoteExecutionId, "exec_restarted_001");
    assert.equal(current.restartGeneration, 1);
    assert.equal(current.cloudAttempt, 2);
    assert.ok(persisted.some((value) => value.remoteExecutionId === null));
    assert.ok(persisted.some((value) => value.remoteExecutionId === "exec_restarted_001"));
  } finally {
    await service.shutdown();
    await new Promise((resolve) => server.close(resolve));
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("retries the failed Episode stage instead of the next queued stage", () => {
  assert.equal(failedEpisodeStageId({
    current_stage_id: "episode-render",
    stages: [
      { stage_id: "episode-prepare", status: "succeeded" },
      { stage_id: "whitebox-capture", status: "failed" },
      { stage_id: "episode-render", status: "queued" },
    ],
  }), "whitebox-capture");
  assert.equal(failedEpisodeStageId({ stages: [] }), null);
  assert.equal(failedEpisodeStageId({
    current_stage_id: "whitebox-capture",
    stages: [
      { stage_id: "episode-prepare", status: "interrupted" },
      { stage_id: "whitebox-capture", status: "queued" },
    ],
  }), "episode-prepare");
});

test("destroys an artifact stream when the browser aborts a video request", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-abort-"));
  const episodeId = "episode-demo-world-abort1";
  const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
  const artifactPath = path.join(episodeRoot, "whitebox/segment-00.mp4");
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, Buffer.alloc(1024 * 1024, 1));

  let resolveDestroyed;
  const destroyed = new Promise((resolve) => { resolveDestroyed = resolve; });
  class SlowArtifactStream extends Readable {
    #timer = null;
    _read() {
      if (this.#timer) return;
      this.#timer = setInterval(() => this.push(Buffer.alloc(1024, 1)), 5);
    }
    _destroy(error, callback) {
      clearInterval(this.#timer);
      resolveDestroyed();
      callback(error);
    }
  }

  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    spawnImplementation: () => new EventEmitter(),
    createReadStreamImplementation: () => new SlowArtifactStream(),
  });
  const server = createServer((request, response) => {
    void service.handleApi(request, response, new URL(request.url, "http://127.0.0.1"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await new Promise((resolve, reject) => {
      const request = httpGet({
        host: "127.0.0.1",
        port: address.port,
        path: `/api/episode-workflows/${episodeId}/artifacts/whitebox/segment-00.mp4`,
      }, (response) => {
        response.once("data", () => {
          response.destroy();
          resolve();
        });
      });
      request.once("error", (error) => {
        if (error.code === "ECONNRESET") resolve();
        else reject(error);
      });
    });
    await Promise.race([
      destroyed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("artifact stream was not destroyed")), 500)),
    ]);
  } finally {
    await service.shutdown();
    await new Promise((resolve) => server.close(resolve));
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("reattaches persisted Cloud Episodes and never cancels them on process shutdown", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-restart-"));
  const episodeId = "episode-restart-safe-001";
  const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
  await mkdir(episodeRoot, { recursive: true });
  await writeFile(path.join(episodeRoot, "episode-record.json"), JSON.stringify({
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    sceneId: "restart-safe-scene",
    episodeId,
    backend: "cloud",
    status: "running",
    currentStage: "playthrough-plan",
    remoteExecutionId: "exec_restart_safe",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:01:00.000Z",
    stages: [],
  }));
  let recoveryStarted;
  const started = new Promise((resolve) => { recoveryStarted = resolve; });
  let cancelCount = 0;
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    cancelCloudEpisode: async () => { cancelCount += 1; },
    recoverCloudEpisode: async () => {
      recoveryStarted();
      return new Promise(() => undefined);
    },
  });
  try {
    assert.equal(await service.recoverPersistedCloudEpisodes(), 1);
    await started;
    assert.deepEqual(service.activeJobs, [episodeId]);
    await service.shutdown();
    assert.equal(cancelCount, 0);
    assert.deepEqual(service.activeJobs, []);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("local Studio readiness does not wait for remote Episode inventory", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-local-readiness-"));
  const episodeId = "episode-local-readiness-001";
  const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
  await mkdir(episodeRoot, { recursive: true });
  await writeFile(path.join(episodeRoot, "episode-record.json"), JSON.stringify({
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    sceneId: "local-readiness-scene",
    episodeId,
    backend: "cloud",
    status: "succeeded",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:01:00.000Z",
    stages: [],
  }));
  let remoteLists = 0;
  let remoteReads = 0;
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    listCloudEpisodeRecords: async () => {
      remoteLists += 1;
      return [];
    },
    readCloudEpisodeRecord: async () => {
      remoteReads += 1;
      return null;
    },
  });
  try {
    assert.equal(await service.recoverPersistedCloudEpisodes({ includeRemote: false }), 0);
    assert.equal(remoteLists, 0);
    assert.equal(remoteReads, 0);
  } finally {
    await service.shutdown();
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("defers Ray outages into the infrastructure retry pool without consuming a stage retry", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-infra-pool-"));
  const episodeId = "episode-infra-pool-001";
  const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
  await mkdir(episodeRoot, { recursive: true });
  await writeFile(path.join(episodeRoot, "episode-record.json"), JSON.stringify({
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    sceneId: "infra-pool-scene",
    episodeId,
    backend: "cloud",
    status: "remote-pending",
    currentStage: "style-variant-plan",
    remoteStageId: "episode-render",
    remoteExecutionId: "exec_infra_pool",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:01:00.000Z",
    stages: [],
  }));
  const scheduled = [];
  let retryCount = 0;
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    recoverCloudEpisode: async () => ({
      retryRequired: true,
      execution: {
        execution_id: "exec_infra_pool",
        status: "failed",
        error: "Ray Dashboard request timed out after 5000ms",
        stages: [{
          stage_id: "episode-render",
          status: "failed",
          diagnostics: { error: "Ray cluster unavailable" },
        }],
      },
    }),
    retryCloudEpisode: async () => { retryCount += 1; },
    nowImplementation: () => Date.parse("2026-09-03T00:02:00.000Z"),
    infrastructureRetryBaseMs: 1_000,
    infrastructureRetryMaximumMs: 1_000,
    setTimeoutImplementation: (operation, delayMs) => {
      scheduled.push({ operation, delayMs });
      return { unref() {} };
    },
    clearTimeoutImplementation: () => undefined,
  });
  try {
    assert.equal(await service.recoverPersistedCloudEpisodes(), 1);
    for (let attempt = 0; attempt < 50 && service.activeJobs.length > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const record = JSON.parse(await readFile(
      path.join(episodeRoot, "episode-record.json"),
      "utf8",
    ));
    assert.equal(retryCount, 0);
    assert.equal(record.status, "remote-pending");
    assert.equal(record.retryPool, "infrastructure");
    assert.equal(record.failureClass, "CLOUD_INFRASTRUCTURE_UNAVAILABLE");
    assert.equal(record.infrastructureRetryAttempt, 1);
    assert.equal(scheduled.length, 1);
    assert.ok(scheduled[0].delayMs >= 1_000 && scheduled[0].delayMs <= 1_200);
  } finally {
    await service.shutdown();
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("retries the actual failed Cloud stage after its infrastructure cooldown elapses", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-infra-retry-"));
  const episodeId = "episode-infra-retry-001";
  const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
  await mkdir(episodeRoot, { recursive: true });
  await writeFile(path.join(episodeRoot, "episode-record.json"), JSON.stringify({
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    sceneId: "infra-retry-scene",
    episodeId,
    backend: "cloud",
    status: "remote-pending",
    currentStage: "style-variant-plan",
    // The execution cursor may already point at the dependent next stage when
    // its predecessor is interrupted. Recovery must freeze the failed stage.
    remoteStageId: "episode-conformance",
    remoteExecutionId: "exec_infra_retry",
    remoteRequestS3Uri: "s3://bucket/episode/request.json",
    remoteOutputS3Prefix: "s3://bucket/episode",
    remoteWorkerImage: `worker@sha256:${"c".repeat(64)}`,
    cloudAttempt: 1,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:01:00.000Z",
    stages: [{
      id: "style-variant-production",
      title: "styles",
      status: "failed",
      startedAt: "2026-09-03T00:00:30.000Z",
      finishedAt: "2026-09-03T00:01:00.000Z",
    }],
  }));
  const scheduled = [];
  let retryInput = null;
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    recoverCloudEpisode: async () => ({
      retryRequired: true,
      execution: {
        execution_id: "exec_infra_retry",
        status: "interrupted",
        current_stage_id: "episode-conformance",
        error: "worker lease expired before a terminal progress update",
        stages: [{
          stage_id: "episode-seedance",
          status: "interrupted",
          current_attempt: 1,
          diagnostics: { error: "worker lease expired before a terminal progress update" },
        }],
      },
    }),
    retryCloudEpisode: async (input) => {
      retryInput = input;
      throw new Error("synthetic stop after retry observation");
    },
    readCloudEpisodeManifest: async () => ({}),
    nowImplementation: () => Date.parse("2026-09-03T00:02:00.000Z"),
    infrastructureRetryBaseMs: 1_000,
    infrastructureRetryMaximumMs: 1_000,
    setTimeoutImplementation: (operation, delayMs) => {
      scheduled.push({ operation, delayMs });
      return { unref() {} };
    },
    clearTimeoutImplementation: () => undefined,
  });
  try {
    assert.equal(await service.recoverPersistedCloudEpisodes(), 1);
    for (let attempt = 0; attempt < 50 && scheduled.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(scheduled.length, 1);
    for (let attempt = 0; attempt < 50 && service.activeJobs.length > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(service.activeJobs, []);
    scheduled[0].operation();
    for (let attempt = 0; attempt < 50 && retryInput === null; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const afterRetry = JSON.parse(await readFile(
      path.join(episodeRoot, "episode-record.json"),
      "utf8",
    ));
    assert.notEqual(retryInput, null, JSON.stringify(afterRetry));
    assert.equal(retryInput.stageId, "episode-seedance");
    assert.equal(retryInput.executionId, "exec_infra_retry");
    assert.equal(retryInput.attempt, 2);
    assert.equal(
      retryInput.retryRequestId,
      `${episodeId}-episode-seedance-retry-2`,
    );
  } finally {
    await service.shutdown();
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("does not repeat a Cloud stage after its internal content repairs are exhausted", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-content-pool-"));
  const episodeId = "episode-content-pool-001";
  const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
  await mkdir(episodeRoot, { recursive: true });
  await writeFile(path.join(episodeRoot, "episode-record.json"), JSON.stringify({
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    sceneId: "content-pool-scene",
    episodeId,
    backend: "cloud",
    status: "remote-pending",
    currentStage: "whitebox-capture",
    remoteStageId: "whitebox-capture",
    remoteExecutionId: "exec_content_pool",
    remoteRequestS3Uri: "s3://bucket/episode/request.json",
    remoteOutputS3Prefix: "s3://bucket/episode",
    remoteWorkerImage: `worker@sha256:${"c".repeat(64)}`,
    cloudAttempt: 1,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:01:00.000Z",
    stages: [{
      id: "whitebox-capture",
      title: "capture",
      status: "failed",
      startedAt: "2026-09-03T00:00:30.000Z",
      finishedAt: "2026-09-03T00:01:00.000Z",
    }],
  }));
  let retryCount = 0;
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    recoverCloudEpisode: async () => ({
      retryRequired: true,
      execution: {
        execution_id: "exec_content_pool",
        status: "failed",
        error: "EPISODE_MINIMUM_CAPTURE_HEALTH_FAILED after three repairs",
        stages: [{
          stage_id: "whitebox-capture",
          status: "failed",
          diagnostics: {
            error: "EPISODE_MINIMUM_CAPTURE_HEALTH_FAILED after three repairs",
          },
        }],
      },
    }),
    retryCloudEpisode: async () => { retryCount += 1; },
    readCloudEpisodeManifest: async () => ({}),
  });
  try {
    assert.equal(await service.recoverPersistedCloudEpisodes(), 1);
    for (let attempt = 0; attempt < 50 && service.activeJobs.length > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const record = JSON.parse(await readFile(
      path.join(episodeRoot, "episode-record.json"),
      "utf8",
    ));
    assert.equal(retryCount, 0);
    assert.equal(record.status, "failed");
    assert.equal(record.retryPool, "content-repair");
    assert.equal(record.failureClass, "CONTENT_REPAIR_REQUIRED");
    assert.equal(record.consumesContentAttempt, true);
    assert.equal(record.remoteStageId, "whitebox-capture");
    assert.match(record.error, /EPISODE_MINIMUM_CAPTURE_HEALTH_FAILED/);
  } finally {
    await service.shutdown();
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("queues an infrastructure failure that happens before Cloud Execution creation", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-presubmit-pool-"));
  const scheduled = [];
  const sceneId = "presubmit-infra-scene";
  let submitCalls = 0;
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    ensureCloudEpisodeAvailable: async () => undefined,
    loadEpisodeStyleVariantConfig: async () => ({ enabled: true, variantCount: 10 }),
    resolveCloudSceneInput: async () => ({
      sceneExecutionId: "exec_scene_presubmit",
      sceneManifestS3Uri: "s3://bucket/scene/manifest.json",
      sceneRecord: { id: sceneId, sceneId, status: "ready" },
    }),
    executeCloudEpisode: async () => {
      submitCalls += 1;
      throw new Error("LWDP Ray submission timed out before an execution id was returned");
    },
    readCloudEpisodeManifest: async () => null,
    nowImplementation: () => Date.parse("2026-09-03T00:02:00.000Z"),
    infrastructureRetryBaseMs: 1_000,
    infrastructureRetryMaximumMs: 1_000,
    setTimeoutImplementation: (operation, delayMs) => {
      scheduled.push({ operation, delayMs });
      return { unref() {} };
    },
    clearTimeoutImplementation: () => undefined,
  });
  const server = createServer((request, response) => {
    void service.handleApi(request, response, new URL(request.url, "http://127.0.0.1"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const started = await fetch(`${origin}/api/episode-workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sceneId, backend: "cloud", productionScope: "full" }),
    }).then((response) => response.json());
    for (let attempt = 0; attempt < 50 && service.activeJobs.length > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const record = JSON.parse(await readFile(path.join(
      repoRoot,
      "artifacts/episodes",
      started.episodeId,
      "episode-record.json",
    ), "utf8"));
    assert.equal(submitCalls, 1);
    assert.equal(record.remoteExecutionId, null);
    assert.equal(record.status, "remote-pending");
    assert.equal(record.retryPool, "infrastructure");
    assert.equal(record.infrastructureRetryAttempt, 1);
    assert.equal(scheduled.length, 1);
  } finally {
    await service.shutdown();
    await new Promise((resolve) => server.close(resolve));
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("hydrates an S3-only Episode record before resuming a pre-submission cloud run", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-s3-recovery-"));
  const episodeId = "episode-s3-only-recovery-001";
  let executeCount = 0;
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    listCloudEpisodeRecords: async () => [{
      kind: "worldkit-episode-workflow-record",
      schemaVersion: 1,
      sceneId: "s3-only-scene",
      episodeId,
      backend: "cloud",
      status: "running",
      currentStage: "preparing",
      remoteExecutionId: null,
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:01:00.000Z",
      stages: [],
    }],
    persistCloudEpisodeRecord: async () => undefined,
    resolveCloudSceneInput: async () => ({
      sceneExecutionId: "exec_scene_s3_only",
      sceneManifestS3Uri: "s3://bucket/scene/manifest.json",
      sceneRecord: {},
    }),
    executeCloudEpisode: async () => {
      executeCount += 1;
      throw new Error("synthetic transport failure after cache hydration");
    },
    readCloudEpisodeManifest: async () => ({}),
  });
  try {
    assert.equal(await service.recoverPersistedCloudEpisodes(), 1);
    for (let attempt = 0; attempt < 50 && service.activeJobs.length > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(executeCount, 1);
    assert.deepEqual(service.activeJobs, []);
    const record = JSON.parse(await readFile(
      path.join(repoRoot, "artifacts/episodes", episodeId, "episode-record.json"),
      "utf8",
    ));
    assert.equal(record.status, "failed");
    assert.match(record.error, /synthetic transport failure/);
  } finally {
    await service.shutdown();
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("replaces a stale local Episode cache with the newer S3 authority before recovery", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-stale-cache-"));
  const episodeId = "episode-stale-cache-recovery-001";
  const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
  const remoteRecord = {
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    sceneId: "stale-cache-scene",
    episodeId,
    backend: "cloud",
    status: "remote-pending",
    currentStage: "playthrough-plan",
    remoteExecutionId: "exec_stale_cache",
    remoteWorkerImage: `worker@sha256:${"a".repeat(64)}`,
    recordRevision: 5,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:05:00.000Z",
    stages: [],
  };
  await mkdir(episodeRoot, { recursive: true });
  await writeFile(path.join(episodeRoot, "episode-record.json"), JSON.stringify({
    ...remoteRecord,
    remoteWorkerImage: `worker@sha256:${"b".repeat(64)}`,
    recordRevision: 4,
    updatedAt: "2026-09-03T00:04:00.000Z",
  }));
  let recoveryStarted;
  const started = new Promise((resolve) => { recoveryStarted = resolve; });
  let recoveredWorkerImage = null;
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    listCloudEpisodeRecords: async () => [remoteRecord],
    readCloudEpisodeRecord: async () => remoteRecord,
    recoverCloudEpisode: async (input) => {
      recoveredWorkerImage = input.workerImage;
      recoveryStarted();
      return new Promise(() => undefined);
    },
  });
  try {
    assert.equal(await service.recoverPersistedCloudEpisodes(), 1);
    await started;
    assert.equal(recoveredWorkerImage, remoteRecord.remoteWorkerImage);
    const cached = JSON.parse(await readFile(
      path.join(episodeRoot, "episode-record.json"),
      "utf8",
    ));
    assert.equal(cached.remoteWorkerImage, remoteRecord.remoteWorkerImage);
    assert.equal(cached.recordRevision, remoteRecord.recordRevision);
  } finally {
    await service.shutdown();
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("lists only the selected scene and exposes every completed stage artifact", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-service-"));
  const root = path.join(repoRoot, "artifacts/episodes/episode-demo-world-abc123");
  await mkdir(path.join(root, "whitebox"), { recursive: true });
  await writeFile(path.join(root, "episode-record.json"), JSON.stringify({
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    sceneId: "demo-world",
    episodeId: "episode-demo-world-abc123",
    status: "running",
    currentStage: "whitebox-capture",
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:01:00.000Z",
    stages: [{ id: "whitebox-capture", title: "白膜视频", status: "running" }],
  }));
  await writeFile(path.join(root, "whitebox/episode-120s.mp4"), Buffer.alloc(128, 1));
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    spawnImplementation: () => new EventEmitter(),
  });
  try {
    const records = await service.listForScene("demo-world");
    assert.equal(records.length, 1);
    assert.equal(records[0].episodeId, "episode-demo-world-abc123");
    assert.deepEqual(records[0].artifacts.map(({ relativePath }) => relativePath), [
      "whitebox/episode-120s.mp4",
    ]);
    assert.deepEqual(await service.listForScene("another-world"), []);
    assert.deepEqual((await service.listAll()).map(({ episodeId }) => episodeId), [
      "episode-demo-world-abc123",
    ]);
    assert.deepEqual(await service.listAll({ requireFinalVideo: true }), []);
  } finally {
    await service.shutdown();
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("exposes per-variant Codex review, styled frames, tri-views, and final videos", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-style-variant-review-"));
  const episodeId = "episode-demo-world-style123";
  const root = path.join(repoRoot, "artifacts/episodes", episodeId);
  const variantRoot = path.join(root, "style-variants/style-00");
  await Promise.all([
    mkdir(path.join(root, "whitebox"), { recursive: true }),
    mkdir(path.join(variantRoot, "visual/triviews/player-subject"), { recursive: true }),
    mkdir(path.join(variantRoot, "review"), { recursive: true }),
    mkdir(path.join(variantRoot, "prompts"), { recursive: true }),
    mkdir(path.join(variantRoot, "video/segment-00"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(root, "episode-record.json"), JSON.stringify({
      kind: "worldkit-episode-workflow-record", schemaVersion: 1,
      sceneId: "demo-world", episodeId, status: "succeeded",
      seedanceSegmentIds: ["segment-00"], styleVariantIds: ["style-00"],
      styleVariantCount: 1, createdAt: "2026-09-02T00:00:00.000Z", stages: [],
    })),
    writeFile(path.join(root, "style-variants/style-variant-manifest.json"), JSON.stringify({
      kind: "worldkit-episode-style-variant-manifest", schemaVersion: 1,
      variants: [{ id: "style-00", status: "succeeded", visualAttempt: 1 }],
    })),
    writeFile(path.join(variantRoot, "style-variant.json"), JSON.stringify({
      id: "style-00", name: "巨构机械天文世界", concept: "中央地标被重建为巨型机械天体装置。",
    })),
    writeFile(path.join(variantRoot, "visual/visual-manifest.json"), JSON.stringify({
      targets: [{ visualTargetId: "player-subject", styledTriview: {
        path: "visual/triviews/player-subject/styled-triview.png",
      } }],
    })),
    writeFile(path.join(variantRoot, "review/visual-quality-review.json"), JSON.stringify({
      reviewer: "lwdp-codex", verdict: "passed", summary: "构图和三视图均通过。",
    })),
    writeFile(path.join(variantRoot, "prompts/visual-events.json"), JSON.stringify({ events: [] })),
    writeFile(path.join(root, "whitebox/segment-00.mp4"), Buffer.alloc(128, 1)),
    writeFile(path.join(variantRoot, "visual/segment-00-styled-opening-frame.png"), Buffer.alloc(128, 2)),
    writeFile(path.join(variantRoot, "visual/triviews/player-subject/styled-triview.png"), Buffer.alloc(128, 3)),
    writeFile(path.join(variantRoot, "video/segment-00/final-1280x720-24fps-720f.mp4"), Buffer.alloc(128, 4)),
  ]);
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    spawnImplementation: () => new EventEmitter(),
  });
  try {
    const [record] = await service.listForScene("demo-world");
    assert.equal(record.styleVariants.length, 1);
    assert.equal(record.styleVariants[0].visualReview.verdict, "passed");
    assert.match(record.styleVariants[0].comparisons[0].styledOpeningFrame.url,
      /style-variants\/style-00\/visual\/segment-00-styled-opening-frame\.png$/);
    assert.match(record.styleVariants[0].comparisons[0].finalVideo.url,
      /style-variants\/style-00\/video\/segment-00\/final-1280x720-24fps-720f\.mp4$/);
    assert.equal(record.styleVariants[0].triviews[0].visualTargetId, "player-subject");
  } finally {
    await service.shutdown();
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("derives four synchronized comparison stages from executed input and prompt artifacts", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-comparison-"));
  const episodeId = "episode-demo-world-compare123";
  const root = path.join(repoRoot, "artifacts/episodes", episodeId);
  await Promise.all([
    mkdir(path.join(root, "planning"), { recursive: true }),
    mkdir(path.join(root, "whitebox"), { recursive: true }),
    mkdir(path.join(root, "prompts"), { recursive: true }),
    mkdir(path.join(root, "video/segment-00"), { recursive: true }),
    mkdir(path.join(root, "visual-reviews/visual-reconstructor-v5"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(root, "episode-record.json"), JSON.stringify({
      kind: "worldkit-episode-workflow-record",
      schemaVersion: 1,
      sceneId: "demo-world",
      episodeId,
      status: "succeeded",
      currentStage: null,
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:10:00.000Z",
      stages: [],
    })),
    writeFile(path.join(root, "planning/playthrough-plan.json"), JSON.stringify({})),
    writeFile(path.join(root, "prompts/visual-events.json"), JSON.stringify({
      events: [{
        id: "prompt-event-00",
        segmentId: "segment-00",
        globalSeconds: 8.2,
        segmentRelativeSeconds: 8.2,
        targetNames: ["完整主体"],
        eventClass: "environment-transformation",
        dominantChange: "整片可见地表在保持碰撞不变的前提下转化为高对比发光环境。",
        eventPrompt: "在真实接触点生成一阵低矮尘流。",
        timing: { transitionDurationSeconds: 2.5, endingDurationSeconds: 1.5 },
      }, {
        id: "prompt-event-01",
        segmentId: "segment-00",
        globalSeconds: 20.2,
        segmentRelativeSeconds: 20.2,
        targetNames: ["完整地标"],
        eventClass: "atmospheric-spectacle",
        dominantChange: "整片天空在保持空间结构不变的前提下出现大范围高对比天气变化。",
        eventPrompt: "天空出现大范围场景专属天气变化。",
        timing: { transitionDurationSeconds: 3, endingDurationSeconds: 1 },
      }],
    })),
    writeFile(path.join(root, "whitebox/executed-playthrough-trace.json"), JSON.stringify({
      events: [
        { id: "input-00", kind: "input-start", actualSeconds: 0.1, rawKeys: ["W", "Shift"] },
        { id: "camera-00", kind: "camera", actualSeconds: 2, durationMs: 1_000, cameraKeys: ["I", "L"] },
        { id: "input-00", kind: "input-end", actualSeconds: 3.5 },
        { id: "prompt-event-00", kind: "prompt-marker", segmentId: "segment-00", actualSeconds: 8.205 },
        { id: "prompt-event-01", kind: "prompt-marker", segmentId: "segment-00", actualSeconds: 20.205 },
        { id: "input-01", kind: "input-start", actualSeconds: 31.2, rawKeys: ["S"] },
        { id: "input-01", kind: "input-end", actualSeconds: 32 },
      ],
    })),
    writeFile(path.join(root, "prompts/segment-00.json"), JSON.stringify({
      eventIds: ["prompt-event-00", "prompt-event-01"],
      executedEventSeconds: [8.205, 20.205],
      prompt: "完整的 Seedance Provider Prompt",
    })),
    writeFile(path.join(root, "whitebox/segment-00.mp4"), Buffer.alloc(128, 1)),
    writeFile(path.join(root, "video/segment-00/mg-seedance-2.5-480p.mp4"), Buffer.alloc(192, 3)),
    writeFile(path.join(root, "video/segment-00/final-854x480-24fps-720f.mp4"), Buffer.alloc(256, 2)),
    writeFile(path.join(root, "visual-reviews/visual-reconstructor-v5/segment-00-styled-opening-frame.png"), Buffer.alloc(320, 4)),
  ]);
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    spawnImplementation: () => new EventEmitter(),
  });
  try {
    const [record] = await service.listForScene("demo-world");
    assert.equal(record.playbackComparisons.length, 4);
    const first = record.playbackComparisons[0];
    assert.equal(first.segmentId, "segment-00");
    assert.equal(first.whiteboxVideo.url, `/api/episode-workflows/${episodeId}/artifacts/whitebox/segment-00.mp4`);
    assert.equal(first.finalVideo.url, `/api/episode-workflows/${episodeId}/artifacts/video/segment-00/final-854x480-24fps-720f.mp4`);
    assert.equal(first.publicPreviewVideo.url, `/api/episode-workflows/${episodeId}/artifacts/video/segment-00/final-854x480-24fps-720f.mp4`);
    assert.equal(first.baseStyledOpeningFrame.url, "/api/worlds/demo-world/deliverables/styled-opening-frame");
    assert.equal(first.reviewStyledOpeningFrame.url, `/api/episode-workflows/${episodeId}/artifacts/visual-reviews/visual-reconstructor-v5/segment-00-styled-opening-frame.png`);
    assert.deepEqual(first.inputActivations, [
      { id: "input-00", kind: "movement", startSeconds: 0.1, endSeconds: 3.5, keys: ["W", "Shift"] },
      { id: "camera-00", kind: "camera", startSeconds: 2, endSeconds: 3, keys: ["I", "L"] },
    ]);
    assert.deepEqual(first.promptEvent, {
      id: "prompt-event-00",
      globalSeconds: 8.205,
      relativeSeconds: 8.205,
      activeEndSeconds: 12.205,
      targetNames: ["完整主体"],
      eventClass: "environment-transformation",
      commandText: "整片可见地表在保持碰撞不变的前提下转化为高对比发光环境。",
      eventPrompt: "在真实接触点生成一阵低矮尘流。",
      providerPrompt: "完整的 Seedance Provider Prompt",
    });
    assert.equal(first.promptEvents.length, 2);
    assert.deepEqual(first.promptEvents[1], {
      id: "prompt-event-01",
      globalSeconds: 20.205,
      relativeSeconds: 20.205,
      activeEndSeconds: 24.205,
      targetNames: ["完整地标"],
      eventClass: "atmospheric-spectacle",
      commandText: "整片天空在保持空间结构不变的前提下出现大范围高对比天气变化。",
      eventPrompt: "天空出现大范围场景专属天气变化。",
      providerPrompt: "完整的 Seedance Provider Prompt",
    });
    assert.deepEqual(record.playbackComparisons[1].inputActivations, [
      { id: "input-01", kind: "movement", startSeconds: 0.2, endSeconds: 1, keys: ["S"] },
    ]);
    assert.equal(record.playbackComparisons[1].whiteboxVideo, null);
    assert.equal(record.playbackComparisons[2].promptEvent, null);
    assert.ok(record.artifacts.some((artifact) =>
      artifact.relativePath === "video/segment-00/mg-seedance-2.5-480p.mp4" &&
      artifact.stage === "seedance-generation"));
    assert.deepEqual((await service.listAll({ requireFinalVideo: true })).map(({ episodeId: id }) => id), [
      episodeId,
    ]);
  } finally {
    await service.shutdown();
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("packages all four review stages with related images and one prompt-bearing input timeline", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-bundle-"));
  const sceneId = "demo-world";
  const episodeId = "episode-demo-world-bundle123";
  const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
  const sceneRoot = path.join(repoRoot, "artifacts/scenes", sceneId);
  const write = async (filePath, value = Buffer.alloc(96, 1)) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, typeof value === "string" ? value : value);
  };
  const record = {
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    sceneId,
    episodeId,
    status: "succeeded",
    currentStage: null,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:10:00.000Z",
    stages: [],
  };
  const promptEvents = Array.from({ length: 8 }, (_, index) => {
    const segmentIndex = Math.floor(index / 2);
    const relativeSeconds = index % 2 === 0 ? 8 : 20;
    return {
      id: `prompt-event-${String(index).padStart(2, "0")}`,
      segmentId: `segment-0${segmentIndex}`,
      globalSeconds: segmentIndex * 31 + relativeSeconds,
      segmentRelativeSeconds: relativeSeconds,
      targetNames: ["完整主体"],
      eventClass: "environment-transformation",
      dominantChange: `第 ${segmentIndex + 1} 段第 ${index % 2 + 1} 条环境大幅变化`,
      eventPrompt: `第 ${segmentIndex + 1} 段第 ${index % 2 + 1} 条用户输入 Prompt`,
      timing: { transitionDurationSeconds: 2, endingDurationSeconds: 2 },
    };
  });
  const traceEvents = [
    ...Array.from({ length: 4 }, (_, index) => [
      { id: `input-0${index}`, kind: "input-start", actualSeconds: index * 31 + 1, rawKeys: ["W", "Shift"] },
      { id: `input-0${index}`, kind: "input-end", actualSeconds: index * 31 + 3 },
    ]).flat(),
    ...promptEvents.map((event) =>
      ({ id: event.id, kind: "prompt-marker", segmentId: event.segmentId, actualSeconds: event.globalSeconds + .05 }),
    ),
  ];
  const frameTelemetry = {
    kind: "worldkit-episode-frame-telemetry",
    schemaVersion: 1,
    captureFrameRate: 24,
    frameCount: 2880,
    samples: [{
      frameIndex: 0,
      videoTimeSeconds: 0,
      activeKeys: ["W"],
      subject: { positionMetersXYZ: [0, 1, 0] },
      camera: { verticalFovDegrees: 58, viewMatrixColumnMajor: Array(16).fill(0) },
    }],
  };
  const visualManifest = {
    targets: [{
      visualTargetId: "hero",
      styledTriview: { path: "visual/triviews/hero/styled-triview.png" },
    }],
  };
  await Promise.all([
    write(path.join(episodeRoot, "episode-record.json"), JSON.stringify(record)),
    write(path.join(episodeRoot, "planning/playthrough-plan.json"), JSON.stringify({})),
    write(path.join(episodeRoot, "prompts/visual-events.json"), JSON.stringify({ events: promptEvents })),
    write(path.join(episodeRoot, "planning/reconnaissance/reconnaissance-report.json"), "{}"),
    write(path.join(episodeRoot, "whitebox/executed-playthrough-trace.json"), JSON.stringify({ events: traceEvents, frameTelemetry })),
    write(path.join(episodeRoot, "whitebox/executed-playthrough-quality-report.json"), JSON.stringify({
      kind: "worldkit-executed-playthrough-quality-report",
      schemaVersion: 2,
      policy: "minimal-runtime-and-motion-health",
      passed: true,
    })),
    write(path.join(episodeRoot, "whitebox/episode-120s.mp4")),
    write(path.join(episodeRoot, "whitebox/episode-raw.webm")),
    write(path.join(episodeRoot, "visual/episode-visual-prompts.json"), "{}"),
    write(path.join(episodeRoot, "visual/episode-visual-manifest.json"), JSON.stringify(visualManifest)),
    write(path.join(episodeRoot, "visual/triviews/hero/styled-triview.png")),
    write(path.join(episodeRoot, "pipeline.log"), "pipeline complete\n"),
    write(path.join(sceneRoot, "user-first-frame.png")),
    write(path.join(sceneRoot, "styled-opening-frame.png")),
    write(path.join(sceneRoot, "triviews/hero/whitebox-triview.png")),
    write(path.join(repoRoot, "apps/playground/public/scene-plans", sceneId, "world-plan.png")),
  ]);
  for (let index = 0; index < 4; index += 1) {
    const segmentId = `segment-0${index}`;
    await Promise.all([
      write(path.join(episodeRoot, `whitebox/${segmentId}.mp4`)),
      write(path.join(episodeRoot, `whitebox/${segmentId}-first-frame.png`)),
      write(path.join(episodeRoot, `visual/${segmentId}-styled-opening-frame.png`)),
      write(path.join(episodeRoot, `video/${segmentId}/mg-seedance-2.5-480p.mp4`)),
      write(path.join(episodeRoot, `video/${segmentId}/mediakit-enhanced-720p.mp4`)),
      write(path.join(episodeRoot, `video/${segmentId}/final-1280x720-24fps-720f.mp4`)),
      write(path.join(episodeRoot, `prompts/${segmentId}.json`), JSON.stringify({
        eventIds: [`prompt-event-0${index * 2}`, `prompt-event-0${index * 2 + 1}`],
        executedEventSeconds: [index * 31 + 8.05, index * 31 + 20.05],
        prompt: `第 ${index + 1} 段完整 Seedance Provider Prompt`,
      })),
      write(path.join(episodeRoot, `video/${segmentId}/provider-run.json`), JSON.stringify({ status: "succeeded" })),
    ]);
  }
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    spawnImplementation: () => new EventEmitter(),
  });
  const server = createServer((request, response) => {
    void service.handleApi(request, response, new URL(request.url, "http://127.0.0.1"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const [enriched] = await service.listForScene(sceneId);
    assert.equal(enriched.reviewDownloads.bundle.ready, true);
    assert.equal(enriched.reviewDownloads.images.length, 13);
    assert.match(enriched.reviewDownloads.bundle.fileName, /-seedance-review\.zip$/);
    const timelineResponse = await fetch(`${origin}/api/episode-workflows/${episodeId}/interaction-timeline`);
    assert.equal(timelineResponse.status, 200);
    assert.match(timelineResponse.headers.get("content-disposition"), /interaction-timeline\.json/);
    const timeline = await timelineResponse.json();
    assert.equal(timeline.schemaVersion, 3);
    assert.deepEqual(timeline.frameTelemetry, frameTelemetry);
    assert.deepEqual(timeline.segments[0].inputs[0], {
      id: "input-00",
      kind: "movement",
      keys: ["W", "Shift"],
      segmentStartSeconds: 1,
      segmentEndSeconds: 3,
      globalStartSeconds: 1,
      globalEndSeconds: 3,
      executionStartSeconds: 1,
      executionEndSeconds: 3,
    });
    assert.equal(timeline.segments[0].promptEvents.length, 2);
    assert.equal(timeline.segments[0].promptEvents[0].inputPrompt, "第 1 段第 1 条用户输入 Prompt");
    assert.equal(timeline.segments[0].promptEvents[1].inputPrompt, "第 1 段第 2 条用户输入 Prompt");
    assert.equal(
      timeline.segments[0].promptEvent.seedanceProviderPrompt,
      "第 1 段完整 Seedance Provider Prompt",
    );
    const bundleResponse = await fetch(`${origin}/api/episode-workflows/${episodeId}/bundle`);
    assert.equal(bundleResponse.status, 200);
    assert.equal(bundleResponse.headers.get("content-type"), "application/zip");
    assert.match(bundleResponse.headers.get("content-disposition"), /seedance-review\.zip/);
    const bundlePath = path.join(repoRoot, "episode-review.zip");
    await writeFile(bundlePath, Buffer.from(await bundleResponse.arrayBuffer()));
    const folder = `${episodeId}-seedance-review`;
    const entries = spawnSync("/usr/bin/unzip", ["-Z1", bundlePath], { encoding: "utf8" });
    assert.equal(entries.status, 0, entries.stderr);
    for (const relativePath of [
      "manifest.json",
      "interaction-timeline.json",
      "reference/user-first-frame.png",
      "reference/world-plan.png",
      "visual/triviews/hero-whitebox.png",
      "visual/triviews/hero-styled.png",
      "segments/segment-00/whitebox-1280x720-24fps-720f.mp4",
      "segments/segment-00/seedance-final-1280x720-24fps-720f.mp4",
      "segments/segment-00/seedance-prompt.json",
      "segments/segment-00/provider-run.json",
    ]) {
      assert.match(entries.stdout, new RegExp(`${folder}/${relativePath.replaceAll(".", "\\.")}`));
    }
    const bundledTimeline = spawnSync(
      "/usr/bin/unzip",
      ["-p", bundlePath, `${folder}/interaction-timeline.json`],
      { encoding: "utf8" },
    );
    const bundledTimelineValue = JSON.parse(bundledTimeline.stdout);
    assert.equal(bundledTimelineValue.segments[3].promptEvents[1].inputPrompt, "第 4 段第 2 条用户输入 Prompt");
    assert.equal(bundledTimelineValue.frameTelemetry.samples[0].camera.verticalFovDegrees, 58);
  } finally {
    await service.shutdown();
    await new Promise((resolve) => server.close(resolve));
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("routes cloud Episode production through one remote execution and streams remote videos", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-cloud-episode-service-"));
  let localSpawnCount = 0;
  let submittedEpisodeId = null;
  const requiredArtifacts = [
    "episode/episode-record.json",
    "episode/episode-source-receipt.json",
    "episode/planning/reconnaissance/reconnaissance-report.json",
    "episode/planning/navigation-evidence.json",
    "episode/planning/playthrough-plan.json",
    "episode/whitebox/episode-180s.mp4",
    "episode/whitebox/executed-playthrough-raw-trace.json",
    "episode/whitebox/executed-playthrough-trace.json",
    "episode/whitebox/executed-playthrough-quality-report.json",
    "episode/visual/episode-visual-prompts.json",
    "episode/visual/episode-visual-manifest.json",
    "episode/prompts/visual-events.json",
    ...Array.from({ length: 6 }, (_, index) => [
      `episode/whitebox/segment-0${index}.mp4`,
      `episode/whitebox/segment-0${index}-first-frame.png`,
      `episode/visual/segment-0${index}-styled-opening-frame.png`,
      `episode/prompts/segment-0${index}.json`,
      `episode/video/segment-0${index}/request.json`,
      `episode/video/segment-0${index}/provider-run.json`,
      `episode/video/segment-0${index}/seedance-2.5.mp4`,
      `episode/video/segment-0${index}/final-1280x720-24fps-720f.mp4`,
    ]).flat(),
  ].map((artifactPath) => ({
    path: artifactPath,
    contentType: artifactPath.endsWith(".mp4") ? "video/mp4" : "application/json",
    byteSize: artifactPath.endsWith(".mp4") ? 4096 : 128,
    sha256: `sha256:${"a".repeat(64)}`,
    s3Uri: `s3://bucket/${artifactPath}`,
    required: true,
  }));
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    spawnImplementation: () => {
      localSpawnCount += 1;
      return new EventEmitter();
    },
    ensureCloudEpisodeAvailable: async () => undefined,
    loadEpisodeStyleVariantConfig: async () => ({
      enabled: false,
      variantCount: 10,
    }),
    resolveCloudSceneInput: async (sceneId) => ({
      sceneExecutionId: "exec-scene-001",
      sceneManifestS3Uri: "s3://bucket/scene/cloud-artifact-manifest.json",
      sceneRecord: {
        id: sceneId,
        sceneId,
        status: "ready",
        remoteExecutionId: "exec-scene-001",
        remoteArtifactAdmission: { status: "passed", executionId: "exec-scene-001" },
      },
    }),
    executeCloudEpisode: async (input) => {
      submittedEpisodeId = input.episodeId;
      assert.equal(input.styleVariantMode, "legacy");
      await input.onSubmitted({
        executionId: "exec-episode-001",
        outputS3Prefix: "s3://bucket/episode",
        workerImage: `worker@sha256:${"e".repeat(64)}`,
      });
      await input.onProgress({
        status: "running",
        diagnostics: { internal_stage: "whitebox-capture" },
      });
      return {
        execution: { execution_id: "exec-episode-001", status: "succeeded" },
        manifestS3Uri: "s3://bucket/episode/cloud-artifact-manifest.json",
      };
    },
    readCloudEpisodeManifest: async () => ({
      workerImage: `worker@sha256:${"e".repeat(64)}`,
      artifacts: [
        ...requiredArtifacts,
        {
          path: `episode/bundle/${submittedEpisodeId}-seedance-review.zip`,
          contentType: "application/zip",
          byteSize: 8192,
          sha256: `sha256:${"b".repeat(64)}`,
          s3Uri: `s3://bucket/episode/bundle/${submittedEpisodeId}.zip`,
          required: true,
        },
      ],
    }),
    readVerifiedRemoteArtifact: async (record, artifactPath) => Buffer.from(
      artifactPath === "episode/episode-source-receipt.json"
        ? JSON.stringify({
            kind: "worldkit-cloud-episode-source-receipt",
            schemaVersion: 1,
            sceneId: record.sceneId,
            episodeId: record.episodeId,
            sceneExecutionId: "exec-scene-001",
            sceneManifestS3Uri: "s3://bucket/scene/cloud-artifact-manifest.json",
            sceneManifestContentHash: `sha256:${"c".repeat(64)}`,
            worldBuildIdentityHash: `sha256:${"d".repeat(64)}`,
            sceneCaptureReceiptContentHash: `sha256:${"e".repeat(64)}`,
            workerImage: `worker@sha256:${"e".repeat(64)}`,
            styleVariantMode: "legacy",
          })
        : artifactPath.includes("executed-playthrough-trace")
          ? JSON.stringify({ events: [] })
          : JSON.stringify({}),
    ),
    streamRemoteArtifact: async (response, artifact) => {
      response.writeHead(200, {
        "content-type": artifact.contentType,
        "content-length": 4,
      });
      response.end("mp4!");
    },
  });
  const server = createServer((request, response) => {
    void service.handleApi(request, response, new URL(request.url, "http://127.0.0.1"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const created = await fetch(`${origin}/api/episode-workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sceneId: "scene-cloud-001", backend: "cloud" }),
    }).then((response) => response.json());
    assert.equal(created.episodeId, submittedEpisodeId ?? created.episodeId);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const detail = await fetch(
        `${origin}/api/episode-workflows/${created.episodeId}`,
      ).then((response) => response.json());
      if (detail.episode?.status === "succeeded") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const detail = await fetch(
      `${origin}/api/episode-workflows/${created.episodeId}`,
    ).then((response) => response.json());
    assert.equal(detail.episode.status, "succeeded");
    assert.equal(detail.episode.remoteExecutionId, "exec-episode-001");
    assert.equal(detail.episode.segmentCount, 6);
    assert.deepEqual(
      detail.episode.playbackComparisons.map(({ segmentId }) => segmentId),
      ["segment-00", "segment-01", "segment-02", "segment-03", "segment-04", "segment-05"],
    );
    assert.equal(detail.episode.playbackComparisons[0].whiteboxVideo.sizeBytes, 4096);
    const video = await fetch(
      `${origin}/api/episode-workflows/${created.episodeId}/artifacts/whitebox/segment-00.mp4`,
    );
    assert.equal(await video.text(), "mp4!");
    assert.equal(localSpawnCount, 0);
  } finally {
    await service.shutdown();
    await new Promise((resolve) => server.close(resolve));
    await rm(repoRoot, { recursive: true, force: true });
  }
});
