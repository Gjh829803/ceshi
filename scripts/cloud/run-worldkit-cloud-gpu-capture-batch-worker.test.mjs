import assert from "node:assert/strict";
import test from "node:test";

import { selectGpuCaptureBatch } from "../lib/cloud-production-run.mjs";
import { runGpuCaptureBatch } from "./run-worldkit-cloud-gpu-capture-batch-worker.mjs";

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
    taskLeaseSeconds: 43_200,
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
    taskLeaseSeconds: 43_200,
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
