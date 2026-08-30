import assert from "node:assert/strict";
import test from "node:test";

import { cloudSceneWorkerJob } from "./launch-worldkit-cloud-worker-job.mjs";

test("creates an isolated pinned worker Job without embedding credentials", () => {
  const manifest = cloudSceneWorkerJob({
    executionId: "exec_123456",
    requestS3Uri: "s3://bucket/execution/inputs/request.json",
    outputS3Prefix: "s3://bucket/execution",
    image: `829115578968.dkr.ecr.us-east-2.amazonaws.com/worldkit-cloud-worker@sha256:${"a".repeat(64)}`,
  });
  assert.equal(manifest.metadata.name, "worldkit-scene-exec-123456");
  assert.equal(manifest.spec.backoffLimit, 0);
  const container = manifest.spec.template.spec.containers[0];
  assert.match(container.image, /@sha256:/);
  assert.ok(container.args.includes("scene-production"));
  const token = container.env.find((entry) => entry.name === "LWDP_GENERATION_API_TOKEN");
  assert.deepEqual(token.valueFrom.secretKeyRef, {
    name: "lwdp-generation-token",
    key: "token",
  });
  assert.equal(JSON.stringify(manifest).includes("z2Hv"), false);
  assert.equal(manifest.spec.template.spec.restartPolicy, "Never");
  assert.deepEqual(manifest.spec.template.spec.nodeSelector, { "workload-type": "platform" });
  assert.deepEqual(container.env.find((entry) => entry.name === "NODE_OPTIONS"), {
    name: "NODE_OPTIONS",
    value: "--max-old-space-size=6144",
  });
  assert.throws(() => cloudSceneWorkerJob({
    executionId: "exec-2",
    requestS3Uri: "s3://bucket/request.json",
    outputS3Prefix: "s3://bucket/output",
    image: "worldkit-cloud-worker:latest",
  }), /pinned/);

  const resumed = cloudSceneWorkerJob({
    executionId: "exec-2",
    requestS3Uri: "s3://bucket/request.json",
    outputS3Prefix: "s3://bucket/output",
    image: `worldkit-cloud-worker@sha256:${"b".repeat(64)}`,
    resumeManifestS3Uri: "s3://bucket/output/stages/scene-production/cloud-artifact-manifest.json",
    resumeMode: "host",
    jobSuffix: "retry-2",
  });
  assert.equal(resumed.metadata.name, "worldkit-scene-exec-2-retry-2");
  assert.ok(resumed.spec.template.spec.containers[0].args.includes("--resume-manifest-s3-uri"));
  assert.deepEqual(resumed.spec.template.spec.containers[0].args.slice(-2), ["--resume-mode", "host"]);
});
