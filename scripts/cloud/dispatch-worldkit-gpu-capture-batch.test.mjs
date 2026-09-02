import assert from "node:assert/strict";
import test from "node:test";

import {
  dispatchGpuCaptureBatch,
  reconcileCloudEpisodeCpuStages,
} from "./dispatch-worldkit-gpu-capture-batch.mjs";

const IMAGE = `registry.example/worldkit@sha256:${"a".repeat(64)}`;
const HASH = `sha256:${"b".repeat(64)}`;

function entry(index) {
  const id = String(index).padStart(3, "0");
  return {
    kind: "worldkit-gpu-capture-queue-entry",
    schemaVersion: 1,
    executionId: `execution_${id}`,
    sceneId: `scene-${id}`,
    episodeId: `episode-scene-${id}`,
    stageId: "whitebox-capture",
    stageAttempt: 1,
    workerImage: IMAGE,
    requestS3Uri: `s3://bucket/${id}/request.json`,
    outputS3Prefix: `s3://bucket/${id}`,
    queueEntryS3Uri: `s3://bucket/queue/pending/${id}.json`,
    prepareManifestS3Uri: `s3://bucket/${id}/prepare/manifest.json`,
    prepareManifestHash: HASH,
    inputIdentityHash: `sha256:${index.toString(16).padStart(64, "0")}`,
    createdAt: new Date(Date.UTC(2026, 8, 2, 0, 0, index)).toISOString(),
  };
}

function executionFor(item, status = "ready") {
  return {
    execution_id: item.executionId,
    status: "running",
    stages: [{ stage_id: "whitebox-capture", status }],
  };
}

test("dispatcher leaves the GPU off when only ninety-nine tasks are ready", async () => {
  const entries = Array.from({ length: 99 }, (_, index) => entry(index));
  let published = false;
  let launched = false;
  const result = await dispatchGpuCaptureBatch({
    entries,
    inspectExecution: async (executionId) => executionFor(
      entries.find((item) => item.executionId === executionId),
    ),
    publishManifest: async () => { published = true; },
    launchBatch: async () => { launched = true; },
  });
  assert.equal(result.status, "waiting");
  assert.equal(result.readyCount, 99);
  assert.equal(published, false);
  assert.equal(launched, false);
});

test("replayed prepare queue objects do not inflate the one-hundred-task floor", async () => {
  const unique = Array.from({ length: 99 }, (_, index) => entry(index));
  const replay = {
    ...entry(0),
    queueEntryS3Uri: "s3://bucket/queue/pending/legacy/execution_000.json",
    prepareManifestS3Uri: "s3://bucket/000/prepare/retry-manifest.json",
    createdAt: "2026-09-02T01:00:00.000Z",
  };
  const result = await dispatchGpuCaptureBatch({
    entries: [...unique, replay],
    inspectExecution: async (executionId) => executionFor(
      unique.find((item) => item.executionId === executionId),
    ),
    publishManifest: async () => assert.fail("must not publish"),
    launchBatch: async () => assert.fail("must not launch"),
  });
  assert.equal(result.status, "waiting");
  assert.equal(result.queueObjectCount, 100);
  assert.equal(result.queuedCount, 99);
  assert.equal(result.readyCount, 99);
});

test("dispatcher publishes then launches exactly one Batch at one hundred ready tasks", async () => {
  const entries = Array.from({ length: 100 }, (_, index) => entry(index));
  const calls = [];
  const result = await dispatchGpuCaptureBatch({
    entries,
    inspectExecution: async (executionId) => executionFor(
      entries.find((item) => item.executionId === executionId),
    ),
    publishManifest: async (batch) => {
      calls.push(["publish", batch.taskCount]);
      return { s3Uri: "s3://bucket/queue/batches/batch/manifest.json" };
    },
    launchBatch: async (batch) => {
      calls.push(["launch", batch.taskCount]);
      return { jobName: "batch-job" };
    },
  });
  assert.equal(result.status, "launched");
  assert.deepEqual(calls, [["publish", 100], ["launch", 100]]);
});

test("cancelled and non-ready executions do not count toward the floor", async () => {
  const entries = Array.from({ length: 101 }, (_, index) => entry(index));
  const result = await dispatchGpuCaptureBatch({
    entries,
    inspectExecution: async (executionId) => {
      const item = entries.find((candidate) => candidate.executionId === executionId);
      if (executionId === "execution_000") return { ...executionFor(item), status: "cancelled" };
      if (executionId === "execution_001") return executionFor(item, "pending");
      return executionFor(item);
    },
    publishManifest: async () => assert.fail("must not publish"),
    launchBatch: async () => assert.fail("must not launch"),
  });
  assert.equal(result.status, "waiting");
  assert.equal(result.readyCount, 99);
  assert.deepEqual(result.staleQueueEntryUris, [entries[0].queueEntryS3Uri]);
});

test("cloud reconciler recovers a lost create response and launches CPU prepare", async () => {
  const persisted = [];
  const launched = [];
  const outcomes = await reconcileCloudEpisodeCpuStages({
    records: [{
      kind: "worldkit-episode-workflow-record",
      schemaVersion: 1,
      backend: "cloud",
      sceneId: "scene-001",
      episodeId: "episode-scene-001",
      status: "running",
      recordRevision: 1,
      remoteRequestId: "episode-scene-001-cloud-run-1",
    }],
    config: {
      outputS3Root: "s3://bucket/cloud-episodes",
      workerImage: IMAGE,
      namespace: "lwdp",
      cpuWorker: {},
    },
    cloudConfig: { userId: "worldkit-control" },
    findByRequestId: async () => ({ execution_id: "execution_001" }),
    inspectExecution: async () => ({
      execution_id: "execution_001",
      status: "running",
      current_stage_id: "episode-prepare",
      stages: [{ stage_id: "episode-prepare", status: "ready", current_attempt: 1 }],
    }),
    launchWorker: async (input) => { launched.push(input); },
    persistRecord: async (record) => { persisted.push(record); },
  });
  assert.equal(persisted[0].remoteExecutionId, "execution_001");
  assert.equal(launched[0].stageId, "episode-prepare");
  assert.equal(launched[0].gpuRequired, false);
  assert.equal(outcomes[0].status, "cpu-worker-launched");
});

test("cloud reconciler never launches an individual GPU capture worker", async () => {
  let launched = false;
  const outcomes = await reconcileCloudEpisodeCpuStages({
    records: [{
      backend: "cloud",
      sceneId: "scene-001",
      episodeId: "episode-scene-001",
      status: "running",
      remoteExecutionId: "execution_001",
    }],
    config: { outputS3Root: "s3://bucket/root", workerImage: IMAGE },
    cloudConfig: { userId: "worldkit-control" },
    inspectExecution: async () => ({
      execution_id: "execution_001",
      status: "running",
      current_stage_id: "whitebox-capture",
      stages: [{ stage_id: "whitebox-capture", status: "ready" }],
    }),
    launchWorker: async () => { launched = true; },
  });
  assert.equal(launched, false);
  assert.equal(outcomes[0].status, "waiting-for-gpu-batch");
});
