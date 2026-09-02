import assert from "node:assert/strict";
import test from "node:test";

import { gpuBatchDispatcherCronJob } from "./launch-worldkit-gpu-batch-dispatcher-cronjob.mjs";

test("cloud dispatcher is singleton CPU scheduling and never reserves a GPU", () => {
  const cronJob = gpuBatchDispatcherCronJob({
    image: `registry.example/worldkit@sha256:${"a".repeat(64)}`,
  });
  const pod = cronJob.spec.jobTemplate.spec.template.spec;
  const resources = pod.containers[0].resources;
  assert.equal(cronJob.spec.concurrencyPolicy, "Forbid");
  assert.equal(cronJob.spec.schedule, "* * * * *");
  assert.equal(resources.requests["nvidia.com/gpu"], undefined);
  assert.deepEqual(pod.containers[0].command, [
    "node",
    "scripts/cloud/dispatch-worldkit-gpu-capture-batch.mjs",
  ]);
});
