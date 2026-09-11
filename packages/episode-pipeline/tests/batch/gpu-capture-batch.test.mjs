import assert from "node:assert/strict";
import test from "node:test";

import {
  parseGpuCaptureBatchManifest,
  selectGpuCaptureBatch,
} from "../../src/batch/cloud-production-run.mjs";
import {
  runGpuCaptureBatch,
} from "../../src/batch/gpu-capture-batch.mjs";

const IMAGE = `registry.example/worldkit@sha256:${"a".repeat(64)}`;
const HASH = `sha256:${"b".repeat(64)}`;

function queueEntry(index) {
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

function oneTaskOptions(overrides = {}) {
  return {
    manifest: selectGpuCaptureBatch([queueEntry(0)], {immediateWorkerImages: new Set([IMAGE])}),
    queueS3Prefix: 's3://bucket/queue',
    taskLeaseSeconds: 900,
    temporaryRoot: '/unused-test-root',
    runCaptureImplementation: async () => {},
    launchRenderImplementation: async () => {},
    publishTaskReceiptImplementation: async () => {},
    deleteQueueEntryImplementation: async () => {},
    writeOutput: () => {},
    ...overrides,
  };
}

test('all effectful callbacks must be injected before processing any task', async () => {
  for (const name of ['runCaptureImplementation', 'launchRenderImplementation', 'publishTaskReceiptImplementation', 'deleteQueueEntryImplementation']) {
    let captures = 0;
    await assert.rejects(runGpuCaptureBatch(oneTaskOptions({runCaptureImplementation: async () => {captures++;}, [name]: undefined})), new RegExp(name));
    assert.equal(captures, 0);
  }
});

test('receipt publication failure escapes to the durable owner', async () => {
  await assert.rejects(runGpuCaptureBatch(oneTaskOptions({publishTaskReceiptImplementation: async () => {throw Error('receipt unavailable');}})), /receipt unavailable/);
});

test('remote cancellation records a terminal receipt without capture or continuation', async () => {
  const receipts = [];
  const result = await runGpuCaptureBatch(oneTaskOptions({
    inspectTaskImplementation: async () => ({status: 'cancelled'}),
    runCaptureImplementation: async () => {throw Error('unexpected capture');},
    launchRenderImplementation: async () => {throw Error('unexpected continuation');},
    publishTaskReceiptImplementation: async receipt => receipts.push(receipt),
  }));
  assert.equal(result.cancelledCount, 1);
  assert.equal(result.failedCount, 0);
  assert.equal(receipts[0].status, 'capture-cancelled');
});

test("ready-wave manifests preserve their content-addressed identity", () => {
  const batch = selectGpuCaptureBatch(
    Array.from({ length: 7 }, (_, index) => queueEntry(index)),
    { immediateWorkerImages: new Set([IMAGE]) },
  );
  assert.equal(batch.dispatchReason, "ready-wave");
  assert.equal(parseGpuCaptureBatchManifest(JSON.stringify(batch)).taskCount, 7);
});

test("one GPU lifecycle isolates a failed task and continues the remaining Batch", async () => {
  const batch = selectGpuCaptureBatch(
    Array.from({ length: 100 }, (_, index) => queueEntry(index)),
    { maximumBatchSize: 100 },
  );
  const captures = [];
  const renders = [];
  const receipts = [];
  const deleted = [];
  const result = await runGpuCaptureBatch({
    manifest: batch,
    queueS3Prefix: "s3://bucket/queue",
    taskLeaseSeconds: 3_600,
    temporaryRoot: "/unused-test-root",
    runCaptureImplementation: async (task) => {
      captures.push(task.executionId);
      if (task.executionId === "execution_042") throw new Error("synthetic capture failure");
    },
    launchRenderImplementation: async (task) => { renders.push(task.executionId); },
    publishTaskReceiptImplementation: async (receipt) => { receipts.push(receipt); },
    deleteQueueEntryImplementation: async (uri) => { deleted.push(uri); },
    writeOutput: () => undefined,
  });
  assert.equal(captures.length, 100);
  assert.equal(renders.length, 99);
  assert.equal(receipts.length, 100);
  assert.equal(deleted.length, 99);
  assert.equal(result.succeededCount, 99);
  assert.equal(result.failedCount, 1);
  assert.match(receipts[42].error, /synthetic capture failure/);
});

test("replayed GPU Batch skips tasks with an uploaded success receipt", async () => {
  const batch = selectGpuCaptureBatch(
    Array.from({ length: 100 }, (_, index) => queueEntry(index)),
    { maximumBatchSize: 100 },
  );
  const prior = {
    executionId: "execution_000",
    sceneId: "scene-000",
    episodeId: "episode-scene-000",
    status: "capture-succeeded",
    startedAt: "2026-09-02T00:00:00.000Z",
    finishedAt: "2026-09-02T00:03:00.000Z",
    error: null,
  };
  let captureCount = 0;
  const result = await runGpuCaptureBatch({
    manifest: batch,
    queueS3Prefix: "s3://bucket/queue",
    taskLeaseSeconds: 3_600,
    temporaryRoot: "/unused-test-root",
    priorReceipts: new Map([[prior.executionId, prior]]),
    runCaptureImplementation: async () => { captureCount += 1; },
    launchRenderImplementation: async () => undefined,
    publishTaskReceiptImplementation: async () => undefined,
    deleteQueueEntryImplementation: async () => undefined,
    writeOutput: () => undefined,
  });
  assert.equal(captureCount, 99);
  assert.equal(result.succeededCount, 100);
});

test("indexed GPU worker executes only its isolated Case", async () => {
  const batch = selectGpuCaptureBatch(
    Array.from({ length: 100 }, (_, index) => queueEntry(index)),
    { maximumBatchSize: 100 },
  );
  const captures = [];
  const receipts = [];
  const result = await runGpuCaptureBatch({
    manifest: batch,
    queueS3Prefix: "s3://bucket/queue",
    taskLeaseSeconds: 3_600,
    temporaryRoot: "/unused-test-root",
    taskIndexes: [42],
    runCaptureImplementation: async (task) => { captures.push(task.executionId); },
    launchRenderImplementation: async () => undefined,
    publishTaskReceiptImplementation: async (receipt, index) => {
      receipts.push({ receipt, index });
    },
    deleteQueueEntryImplementation: async () => undefined,
    writeOutput: () => undefined,
  });
  assert.deepEqual(captures, ["execution_042"]);
  assert.equal(result.taskCount, 1);
  assert.equal(result.batchTaskCount, 100);
  assert.equal(result.succeededCount, 1);
  assert.equal(receipts[0].index, 42);
});

test("indexed GPU replay treats every durable terminal receipt as absorbing", async () => {
  const batch = selectGpuCaptureBatch(
    Array.from({ length: 100 }, (_, index) => queueEntry(index)),
    { maximumBatchSize: 100 },
  );
  const failed = {
    executionId: "execution_042",
    sceneId: "scene-042",
    episodeId: "episode-scene-042",
    status: "capture-failed",
    startedAt: "2026-09-02T00:00:00.000Z",
    finishedAt: "2026-09-02T00:03:00.000Z",
    error: "deterministic capture failure",
  };
  let captureCount = 0;
  const result = await runGpuCaptureBatch({
    manifest: batch,
    queueS3Prefix: "s3://bucket/queue",
    taskLeaseSeconds: 3_600,
    temporaryRoot: "/unused-test-root",
    taskIndexes: [42],
    priorReceipts: new Map([[failed.executionId, failed]]),
    runCaptureImplementation: async () => { captureCount += 1; },
    launchRenderImplementation: async () => undefined,
    publishTaskReceiptImplementation: async () => undefined,
    deleteQueueEntryImplementation: async () => undefined,
    writeOutput: () => undefined,
  });
  assert.equal(captureCount, 0);
  assert.equal(result.failedCount, 1);
});

test("queue storage cleanup cannot regress a successful capture receipt", async () => {
  const batch = selectGpuCaptureBatch(
    Array.from({ length: 100 }, (_, index) => queueEntry(index)),
    { maximumBatchSize: 100 },
  );
  const output = [];
  const result = await runGpuCaptureBatch({
    manifest: batch,
    queueS3Prefix: "s3://bucket/queue",
    taskLeaseSeconds: 3_600,
    temporaryRoot: "/unused-test-root",
    taskIndexes: [42],
    runCaptureImplementation: async () => undefined,
    launchRenderImplementation: async () => undefined,
    publishTaskReceiptImplementation: async () => undefined,
    deleteQueueEntryImplementation: async () => {
      throw new Error("AccessDenied: s3:DeleteObject");
    },
    writeOutput: (value) => output.push(value),
  });
  assert.equal(result.succeededCount, 1);
  assert.equal(result.failedCount, 0);
  assert.match(output.join(""), /WORLDKIT_GPU_QUEUE_CLEANUP_RETAINED execution_042/);
});
