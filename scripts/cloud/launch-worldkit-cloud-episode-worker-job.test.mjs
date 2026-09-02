import assert from "node:assert/strict";
import test from "node:test";

import { cloudEpisodeWorkerJob } from "./launch-worldkit-cloud-episode-worker-job.mjs";

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

  const cpuPrepare = cloudEpisodeWorkerJob({
    executionId: "exec_episode_001",
    stageId: "episode-prepare",
    executionPart: "prepare",
    requestS3Uri: "s3://bucket/episode/inputs/request.json",
    outputS3Prefix: "s3://bucket/episode",
    image: `worldkit-cloud-worker@sha256:${"a".repeat(64)}`,
    gpuRequired: false,
  });
  const cpuContainer = cpuPrepare.spec.template.spec.containers[0];
  assert.equal(cpuContainer.resources.requests["nvidia.com/gpu"], undefined);
  assert.equal(cpuContainer.resources.requests["ephemeral-storage"], "16Gi");
  assert.equal(cpuPrepare.spec.template.spec.nodeSelector, undefined);
  assert.ok(cpuContainer.args.includes("prepare"));
});
