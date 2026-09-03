import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanStaleQueueEntries,
  dispatchGpuCaptureBatch,
  immediateGpuCaptureWorkerImages,
  reconcileCloudEpisodeCpuStages,
  unfinishedGpuBatchIsActionable,
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

function episodeRecordFor(item, remoteStageId = "whitebox-capture") {
  return {
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    backend: "cloud",
    sceneId: item.sceneId,
    episodeId: item.episodeId,
    status: "running",
    recordRevision: 1,
    remoteExecutionId: item.executionId,
    remoteWorkerImage: item.workerImage,
    remoteStageId,
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

test("current Worker dispatches ready Cases without waiting for slow producers", async () => {
  const entries = Array.from({ length: 7 }, (_, index) => entry(index));
  const calls = [];
  const result = await dispatchGpuCaptureBatch({
    entries,
    episodeRecords: [
      ...entries.map((item) => episodeRecordFor(item)),
      episodeRecordFor(entry(7), "episode-prepare"),
    ],
    immediateWorkerImages: new Set([IMAGE]),
    inspectExecution: async (executionId) => executionFor(
      entries.find((item) => item.executionId === executionId),
    ),
    publishManifest: async (batch) => {
      calls.push(["publish", batch.taskCount, batch.dispatchReason]);
      return { s3Uri: "s3://bucket/queue/batches/wave/manifest.json" };
    },
    launchBatch: async (batch) => {
      calls.push(["launch", batch.taskCount, batch.dispatchReason]);
      return { jobName: "ready-wave-job" };
    },
  });
  assert.equal(result.status, "launched");
  assert.equal(result.batch.dispatchReason, "ready-wave");
  assert.deepEqual(calls, [
    ["publish", 7, "ready-wave"],
    ["launch", 7, "ready-wave"],
  ]);
});

test("a deployment keeps frozen digest-pinned Episodes eligible for immediate capture", () => {
  const priorImage = `registry.example/worldkit@sha256:${"c".repeat(64)}`;
  const images = immediateGpuCaptureWorkerImages([
    entry(0),
    { ...entry(1), workerImage: priorImage },
  ], IMAGE, true);
  assert.deepEqual([...images], [IMAGE, priorImage]);
  assert.deepEqual(
    [...immediateGpuCaptureWorkerImages([entry(0)], IMAGE, false)],
    [],
  );
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

test("dispatcher drains a stable final tail after every registered producer is ready", async () => {
  const entries = Array.from({ length: 20 }, (_, index) => entry(index));
  const calls = [];
  const result = await dispatchGpuCaptureBatch({
    entries,
    episodeRecords: entries.map((item) => episodeRecordFor(item)),
    defaultWorkerImage: IMAGE,
    tailIdleSeconds: 120,
    observedAt: "2026-09-02T00:05:00.000Z",
    inspectExecution: async (executionId) => executionFor(
      entries.find((item) => item.executionId === executionId),
    ),
    publishManifest: async (batch) => {
      calls.push(["publish", batch.taskCount, batch.dispatchReason]);
      return { s3Uri: "s3://bucket/queue/batches/tail/manifest.json" };
    },
    launchBatch: async (batch) => {
      calls.push(["launch", batch.taskCount, batch.dispatchReason]);
      return { jobName: "tail-batch-job" };
    },
  });
  assert.equal(result.status, "launched");
  assert.equal(result.batch.taskCount, 20);
  assert.equal(result.batch.dispatchReason, "producer-drained");
  assert.deepEqual(calls, [
    ["publish", 20, "producer-drained"],
    ["launch", 20, "producer-drained"],
  ]);
});

test("dispatcher uses the live capture stage when the Run Index still says prepare", async () => {
  const item = entry(0);
  const calls = [];
  const result = await dispatchGpuCaptureBatch({
    entries: [item],
    episodeRecords: [episodeRecordFor(item, "episode-prepare")],
    defaultWorkerImage: IMAGE,
    tailIdleSeconds: 120,
    observedAt: "2026-09-02T00:05:00.000Z",
    inspectExecution: async () => ({
      ...executionFor(item),
      current_stage_id: "whitebox-capture",
    }),
    publishManifest: async (batch) => {
      calls.push(["publish", batch.taskCount]);
      return { s3Uri: "s3://bucket/queue/batches/tail/manifest.json" };
    },
    launchBatch: async (batch) => {
      calls.push(["launch", batch.taskCount]);
      return { jobName: "tail-batch-job" };
    },
  });
  assert.equal(result.status, "launched");
  assert.deepEqual(calls, [["publish", 1], ["launch", 1]]);
});

test("dispatcher does not drain a tail while one registered producer is preparing", async () => {
  const entries = Array.from({ length: 20 }, (_, index) => entry(index));
  const preparing = entry(20);
  const result = await dispatchGpuCaptureBatch({
    entries,
    episodeRecords: [
      ...entries.map((item) => episodeRecordFor(item)),
      episodeRecordFor(preparing, "episode-prepare"),
    ],
    defaultWorkerImage: IMAGE,
    tailIdleSeconds: 120,
    observedAt: "2026-09-02T00:05:00.000Z",
    inspectExecution: async (executionId) => executionFor(
      entries.find((item) => item.executionId === executionId),
    ),
    publishManifest: async () => assert.fail("must not publish"),
    launchBatch: async () => assert.fail("must not launch"),
  });
  assert.equal(result.status, "waiting");
  assert.equal(result.drainEligibleCount, 0);
});

test("dispatcher waits for the tail stabilization interval", async () => {
  const entries = Array.from({ length: 20 }, (_, index) => entry(index));
  const result = await dispatchGpuCaptureBatch({
    entries,
    episodeRecords: entries.map((item) => episodeRecordFor(item)),
    defaultWorkerImage: IMAGE,
    tailIdleSeconds: 120,
    observedAt: "2026-09-02T00:01:00.000Z",
    inspectExecution: async (executionId) => executionFor(
      entries.find((item) => item.executionId === executionId),
    ),
    publishManifest: async () => assert.fail("must not publish"),
    launchBatch: async () => assert.fail("must not launch"),
  });
  assert.equal(result.status, "waiting");
  assert.equal(result.drainEligibleCount, 0);
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

test("removes a cancelled Episode queue entry even when its Execution ended failed", async () => {
  const item = entry(0);
  const result = await dispatchGpuCaptureBatch({
    entries: [item],
    episodeRecords: [{ ...episodeRecordFor(item), status: "cancelled" }],
    inspectExecution: async () => ({ ...executionFor(item), status: "failed" }),
    publishManifest: async () => assert.fail("must not publish"),
    launchBatch: async () => assert.fail("must not launch"),
  });
  assert.equal(result.status, "waiting");
  assert.deepEqual(result.staleQueueEntryUris, [item.queueEntryS3Uri]);
});

test("stale queue cleanup never blocks dispatch when DeleteObject is unavailable", async () => {
  const calls = [];
  const outcomes = await cleanStaleQueueEntries([
    "s3://bucket/queue/pending/stale-a.json",
    "s3://bucket/queue/pending/stale-b.json",
  ], async (s3Uri) => {
    calls.push(s3Uri);
    if (s3Uri.endsWith("stale-a.json")) throw new Error("AccessDenied");
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(outcomes.map(({ status }) => status), ["retained", "removed"]);
  assert.match(outcomes[0].error, /AccessDenied/);
});

test("unfinished GPU Batch is skipped after every linked Execution is terminal", async () => {
  const items = [entry(0), entry(1)];
  const actionable = await unfinishedGpuBatchIsActionable(
    { tasks: items },
    async (executionId) => ({
      ...executionFor(items.find((item) => item.executionId === executionId)),
      status: executionId === "execution_000" ? "failed" : "cancelled",
    }),
  );
  assert.equal(actionable, false);
});

test("unfinished GPU Batch remains actionable while one capture can resume", async () => {
  const items = [entry(0), entry(1)];
  const actionable = await unfinishedGpuBatchIsActionable(
    { tasks: items },
    async (executionId) => executionId === "execution_000"
      ? { ...executionFor(items[0]), status: "failed" }
      : executionFor(items[1], "running"),
  );
  assert.equal(actionable, true);
});

test("unfinished GPU Batch fails closed when Execution state is unavailable", async () => {
  const actionable = await unfinishedGpuBatchIsActionable(
    { tasks: [entry(0)] },
    async () => { throw new Error("temporary LWDP outage"); },
  );
  assert.equal(actionable, true);
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
