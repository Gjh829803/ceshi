import assert from "node:assert/strict";
import test from "node:test";

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import {
  cloudEpisodeWorkerJob,
  deleteCloudEpisodeWorkerJobs,
} from "./launch-worldkit-cloud-episode-worker-job.mjs";

test("creates one GPU Episode worker with project-local runtime Secret material", () => {
  const manifest = cloudEpisodeWorkerJob({
    executionId: "exec_episode_001",
    requestS3Uri: "s3://bucket/episode/inputs/request.json",
    outputS3Prefix: "s3://bucket/episode",
    image: `worldkit-cloud-worker@sha256:${"a".repeat(64)}`,
    userId: "partner_codex",
    nodeSelector: { "alpha.eksctl.io/nodegroup-name": "gpu-workers" },
  });
  assert.equal(manifest.metadata.name, "worldkit-episode-exec-episode-001");
  const pod = manifest.spec.template.spec;
  const container = pod.containers[0];
  assert.deepEqual(pod.nodeSelector, {
    "alpha.eksctl.io/nodegroup-name": "gpu-workers",
  });
  assert.equal(container.command[1], "scripts/cloud/run-worldkit-cloud-episode-worker.mjs");
  assert.ok(container.args.includes("episode-production"));
  assert.equal(container.resources.limits["nvidia.com/gpu"], 1);
  assert.equal(container.env.find((item) => item.name === "WORLDKIT_CAPTURE_GPU").value, "1");
  assert.equal(container.env.find((item) =>
    item.name === "WORLDKIT_DISABLE_PLAYGROUND_SPAWN").value, "1");
  assert.equal(container.env.find((item) => item.name === "LWDP_USER_ID").value,
    "partner_codex");
  assert.ok(container.volumeMounts.some((mount) =>
    mount.mountPath === "/var/run/worldkit-episode-runtime"));
  assert.equal(JSON.stringify(manifest).includes("LWDP_GENERATION_API_TOKEN\":\""), false);

  const retried = cloudEpisodeWorkerJob({
    executionId: "exec_episode_001",
    requestS3Uri: "s3://bucket/episode/inputs/request.json",
    outputS3Prefix: "s3://bucket/episode",
    image: `worldkit-cloud-worker@sha256:${"a".repeat(64)}`,
    jobSuffix: "retry-2",
  });
  assert.equal(retried.metadata.name, "worldkit-episode-exec-episode-001-retry-2");

  const longExecutionId = "exec_83ac6d65fc7fe19ad65f";
  const longRetry2 = cloudEpisodeWorkerJob({
    executionId: longExecutionId,
    stageId: "episode-prepare",
    executionPart: "prepare",
    requestS3Uri: "s3://bucket/episode/inputs/request.json",
    outputS3Prefix: "s3://bucket/episode",
    image: `worldkit-cloud-worker@sha256:${"a".repeat(64)}`,
    gpuRequired: false,
    jobSuffix: "retry-2",
  });
  const longRetry3 = cloudEpisodeWorkerJob({
    executionId: longExecutionId,
    stageId: "episode-prepare",
    executionPart: "prepare",
    requestS3Uri: "s3://bucket/episode/inputs/request.json",
    outputS3Prefix: "s3://bucket/episode",
    image: `worldkit-cloud-worker@sha256:${"a".repeat(64)}`,
    gpuRequired: false,
    jobSuffix: "retry-3",
  });
  assert.ok(longRetry2.metadata.name.endsWith("-episode-prepare-retry-2"));
  assert.ok(longRetry3.metadata.name.endsWith("-episode-prepare-retry-3"));
  assert.notEqual(longRetry2.metadata.name, longRetry3.metadata.name);
  assert.ok(longRetry2.metadata.name.length <= 63);

  const cpuPrepare = cloudEpisodeWorkerJob({
    executionId: "exec_episode_001",
    stageId: "episode-prepare",
    executionPart: "prepare",
    requestS3Uri: "s3://bucket/episode/inputs/request.json",
    outputS3Prefix: "s3://bucket/episode",
    image: `worldkit-cloud-worker@sha256:${"a".repeat(64)}`,
    gpuRequired: false,
    nodeSelector: { "workload-type": "ray-cpu" },
    tolerations: [{
      key: "ray.io/node-type",
      operator: "Equal",
      value: "worker",
      effect: "NoSchedule",
    }],
  });
  const cpuContainer = cpuPrepare.spec.template.spec.containers[0];
  assert.equal(cpuContainer.resources.requests["nvidia.com/gpu"], undefined);
  assert.equal(cpuContainer.resources.requests["ephemeral-storage"], "16Gi");
  assert.deepEqual(cpuPrepare.spec.template.spec.nodeSelector, {
    "workload-type": "ray-cpu",
  });
  assert.deepEqual(cpuPrepare.spec.template.spec.tolerations, [{
    key: "ray.io/node-type",
    operator: "Equal",
    value: "worker",
    effect: "NoSchedule",
  }]);
  assert.ok(cpuContainer.args.includes("prepare"));
});

test("deletes only Worker Jobs owned by the cancelled Cloud Execution", async () => {
  let invocation;
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const result = deleteCloudEpisodeWorkerJobs({
    executionId: "exec_cancel_001",
    namespace: "lwdp",
    spawnImplementation: (command, args, options) => {
      invocation = { command, args, options };
      queueMicrotask(() => {
        child.stdout.end("job.batch/example deleted\n");
        child.emit("close", 0);
      });
      return child;
    },
  });
  assert.equal(await result, "job.batch/example deleted");
  assert.equal(invocation.command, "kubectl");
  assert.deepEqual(invocation.args, [
    "delete", "jobs",
    "--namespace", "lwdp",
    "--selector", "worldkit.seedleap.dev/execution-id=exec_cancel_001",
    "--ignore-not-found=true",
    "--wait=false",
  ]);
  assert.throws(() => deleteCloudEpisodeWorkerJobs({
    executionId: "exec_bad,selector",
  }), /invalid for Worker cleanup/);
});
