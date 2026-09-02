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
  }), /at least 100/);
});
