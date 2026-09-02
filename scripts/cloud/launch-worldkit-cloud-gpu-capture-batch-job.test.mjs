import assert from "node:assert/strict";
import test from "node:test";

import { cloudGpuCaptureBatchJob } from "./launch-worldkit-cloud-gpu-capture-batch-job.mjs";

test("creates one long-lived GPU Job for a pre-admitted one-hundred-task Batch", () => {
  const job = cloudGpuCaptureBatchJob({
    batchId: `gpu-capture-${"a".repeat(24)}`,
    batchManifestS3Uri: "s3://bucket/queue/batches/a/manifest.json",
    queueS3Prefix: "s3://bucket/queue",
    taskCount: 100,
    image: `registry.example/worldkit@sha256:${"b".repeat(64)}`,
    gpuResourceName: "nvidia.com/gpu",
    gpuCount: 1,
  });
  const container = job.spec.template.spec.containers[0];
  assert.equal(job.spec.backoffLimit, 2);
  assert.equal(job.spec.activeDeadlineSeconds, 86_400);
  assert.equal(container.resources.requests["nvidia.com/gpu"], 1);
  assert.equal(container.resources.requests["ephemeral-storage"], "32Gi");
  assert.match(container.args.join(" "), /task-lease-seconds 43200/);
  assert.equal(job.spec.template.spec.restartPolicy, "Never");
  assert.throws(() => cloudGpuCaptureBatchJob({
    batchId: `gpu-capture-${"a".repeat(24)}`,
    batchManifestS3Uri: "s3://bucket/queue/batches/a/manifest.json",
    queueS3Prefix: "s3://bucket/queue",
    taskCount: 99,
    image: `registry.example/worldkit@sha256:${"b".repeat(64)}`,
  }), /capacity threshold or valid closed-producer tail evidence/);
});

test("creates one GPU Job for a hash-admitted closed-producer tail", () => {
  const job = cloudGpuCaptureBatchJob({
    batchId: `gpu-capture-${"c".repeat(24)}`,
    batchManifestS3Uri: "s3://bucket/queue/batches/tail/manifest.json",
    queueS3Prefix: "s3://bucket/queue",
    taskCount: 20,
    minimumBatchSize: 100,
    dispatchReason: "producer-drained",
    drainEvidence: {
      observedAt: "2026-09-02T00:05:00.000Z",
      newestReadyAt: "2026-09-02T00:02:00.000Z",
      tailIdleSeconds: 120,
      readyRecordCount: 20,
      inFlightPrepareCount: 0,
    },
    image: `registry.example/worldkit@sha256:${"d".repeat(64)}`,
  });
  assert.equal(job.metadata.labels["worldkit.seedleap.dev/task-count"], "20");
  assert.equal(
    job.metadata.labels["worldkit.seedleap.dev/dispatch-reason"],
    "producer-drained",
  );
  assert.throws(() => cloudGpuCaptureBatchJob({
    batchId: `gpu-capture-${"c".repeat(24)}`,
    batchManifestS3Uri: "s3://bucket/queue/batches/tail/manifest.json",
    queueS3Prefix: "s3://bucket/queue",
    taskCount: 20,
    minimumBatchSize: 100,
    dispatchReason: "producer-drained",
    drainEvidence: {
      observedAt: "2026-09-02T00:05:00.000Z",
      newestReadyAt: "2026-09-02T00:02:00.000Z",
      tailIdleSeconds: 120,
      readyRecordCount: 20,
      inFlightPrepareCount: 1,
    },
    image: `registry.example/worldkit@sha256:${"d".repeat(64)}`,
  }), /valid closed-producer tail evidence/);
});
