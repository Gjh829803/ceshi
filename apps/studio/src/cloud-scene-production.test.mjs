import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  cloudArtifactManifestS3Uri,
  executeStudioCloudScene,
  launchStudioCloudSceneWorker,
  loadCloudSceneProductionConfig,
  rebuildStudioCloudSceneBuilder,
  resumeStudioCloudSceneBuilder,
  resumeStudioCloudSceneHost,
} from "./cloud-scene-production.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("uses the deployment-owned Scene Worker digest over the image-baked config", async () => {
  const workerImage = `worker@sha256:${"e".repeat(64)}`;
  const config = await loadCloudSceneProductionConfig(repoRoot, {
    environment: { WORLDKIT_CLOUD_WORKER_IMAGE: workerImage },
  });
  assert.equal(config.workerImage, workerImage);
});

test("extracts the exact Cloud artifact manifest from stage authority", () => {
  assert.equal(cloudArtifactManifestS3Uri(
    { execution_id: "execution-1", status: "succeeded" },
    { stages: [{
      stage_id: "scene-production",
      artifacts: [{
        role: "worldkit-cloud-artifact-manifest",
        s3_uri: "s3://worldkit-test/scene/cloud-artifact-manifest.json",
      }],
    }] },
  ), "s3://worldkit-test/scene/cloud-artifact-manifest.json");
});

test("submits, launches, and polls one Cloud Scene without a local pipeline", async () => {
  const calls = [];
  const result = await executeStudioCloudScene({
    sceneId: "cloud-scene-001",
    prompt: "Build one complete world.",
    referenceImagePath: "/input/reference.png",
    requestId: "cloud-scene-001-attempt-1",
    attempt: 1,
    config: {
      workerImage: `worker@sha256:${"a".repeat(64)}`,
      outputS3Root: "s3://worldkit-test/cloud-scenes",
      namespace: "lwdp",
    },
    cloudConfig: {
      baseUrl: "https://lwdp.test",
      token: "test",
      userId: "partner-codex",
    },
    submitImplementation: async (input) => {
      calls.push(["submit", input]);
      return {
        executionId: "execution-1",
        requestS3Uri: "s3://worldkit-test/cloud-scenes/request.json",
      };
    },
    dispatchImplementation: async (...args) => calls.push(["dispatch", ...args]),
    onDispatched: async (input) => calls.push(["dispatched", input]),
    launchImplementation: async (input) => {
      calls.push(["launch", input]);
      return { jobName: "worldkit-scene-execution-1" };
    },
    onLaunched: async (input) => calls.push(["launched", input]),
    pollImplementation: async (_executionId, { onProgress }) => {
      onProgress({ execution_id: "execution-1", status: "running" });
      return { execution_id: "execution-1", status: "succeeded" };
    },
    stagesImplementation: async () => ({ stages: [{
      stage_id: "scene-production",
      artifacts: [{
        role: "worldkit-cloud-artifact-manifest",
        s3_uri: "s3://worldkit-test/cloud-scenes/manifest.json",
      }],
    }] }),
  });
  assert.equal(calls[0][0], "submit");
  assert.equal(calls[0][1].autoDispatch, false);
  assert.equal(calls[1][0], "dispatch");
  assert.deepEqual(calls[2], ["dispatched", { executionId: "execution-1" }]);
  assert.equal(calls[3][0], "launch");
  assert.equal(calls[3][1].userId, "partner-codex");
  assert.deepEqual(calls[4], ["launched", { jobName: "worldkit-scene-execution-1" }]);
  assert.equal(result.execution.status, "succeeded");
  assert.equal(result.manifestS3Uri, "s3://worldkit-test/cloud-scenes/manifest.json");
});

test("idempotently relaunches the exact pinned Worker for reconciliation", async () => {
  let launchInput = null;
  const result = await launchStudioCloudSceneWorker({
    executionId: "execution-reattach-1",
    requestS3Uri: "s3://worldkit-test/request.json",
    outputS3Prefix: "s3://worldkit-test/output",
    config: {
      workerImage: `worker@sha256:${"c".repeat(64)}`,
      namespace: "lwdp",
    },
    userId: "partner-codex",
    launchImplementation: async (input) => {
      launchInput = input;
      return { jobName: "worldkit-scene-execution-reattach-1" };
    },
  });
  assert.equal(launchInput.executionId, "execution-reattach-1");
  assert.match(launchInput.image, /@sha256:/);
  assert.equal(launchInput.userId, "partner-codex");
  assert.equal(launchInput.resumeManifestS3Uri, undefined);
  assert.equal(result.jobName, "worldkit-scene-execution-reattach-1");
});

test("retries the same Cloud Execution from a trusted Host manifest", async () => {
  const calls = [];
  const result = await resumeStudioCloudSceneHost({
    executionId: "execution-1",
    requestS3Uri: "s3://worldkit-test/request.json",
    outputS3Prefix: "s3://worldkit-test/output",
    manifestS3Uri: "s3://worldkit-test/output/stages/scene-production/cloud-artifact-manifest.json",
    retryRequestId: "execution-1-host-retry-2",
    attempt: 2,
    config: {
      workerImage: `worker@sha256:${"a".repeat(64)}`,
      namespace: "lwdp",
    },
    cloudConfig: {
      baseUrl: "https://lwdp.test",
      token: "test",
      userId: "partner-codex",
    },
    retryImplementation: async (...args) => calls.push(["retry", ...args]),
    launchImplementation: async (input) => calls.push(["launch", input]),
    pollImplementation: async () => ({ execution_id: "execution-1", status: "succeeded" }),
    stagesImplementation: async () => ({ stages: [{
      stage_id: "scene-production",
      diagnostics: { manifest_s3_uri: "s3://worldkit-test/output/retry-manifest.json" },
    }] }),
  });
  assert.equal(calls[0][0], "retry");
  assert.equal(calls[1][1].resumeMode, "host");
  assert.equal(calls[1][1].userId, "partner-codex");
  assert.equal(calls[1][1].jobSuffix, "host-2");
  assert.equal(result.execution.execution_id, "execution-1");
});

test("retries the same Cloud Execution from a trusted Planner manifest", async () => {
  const calls = [];
  await resumeStudioCloudSceneBuilder({
    executionId: "execution-builder-1",
    requestS3Uri: "s3://worldkit-test/request.json",
    outputS3Prefix: "s3://worldkit-test/output",
    manifestS3Uri: "s3://worldkit-test/output/planner-manifest.json",
    retryRequestId: "execution-builder-1-retry-2",
    attempt: 2,
    config: {
      workerImage: `worker@sha256:${"d".repeat(64)}`,
      namespace: "lwdp",
    },
    cloudConfig: {
      baseUrl: "https://lwdp.test", token: "test", userId: "partner-codex",
    },
    retryImplementation: async (...args) => calls.push(["retry", ...args]),
    launchImplementation: async (input) => calls.push(["launch", input]),
    pollImplementation: async () => ({ execution_id: "execution-builder-1", status: "succeeded" }),
    stagesImplementation: async () => ({ stages: [] }),
  });
  assert.equal(calls[0][0], "retry");
  assert.equal(calls[1][1].resumeMode, "builder");
  assert.equal(calls[1][1].jobSuffix, "builder-2");
});

test("rebuilds Builder in a fresh Cloud Execution from a prior Planner manifest", async () => {
  const calls = [];
  const result = await rebuildStudioCloudSceneBuilder({
    sceneId: "cloud-scene-builder-rebuild",
    prompt: "Keep the prior Planner handoff.",
    referenceImagePath: "/input/reference.png",
    requestId: "cloud-scene-builder-rebuild-attempt-2",
    attempt: 2,
    sourceExecutionId: "execution-source-1",
    sourceManifestS3Uri: "s3://worldkit-test/source/planner-manifest.json",
    sourceRequestSource: JSON.stringify({
      kind: "worldkit-cloud-scene-request",
      schemaVersion: 1,
      sceneId: "cloud-scene-builder-rebuild",
      prompt: "Keep the prior Planner handoff.",
      references: [],
    }),
    sourceRequestS3Uri: "s3://worldkit-test/source/request.json",
    config: {
      workerImage: `worker@sha256:${"e".repeat(64)}`,
      outputS3Root: "s3://worldkit-test/cloud-scenes",
      namespace: "lwdp",
    },
    cloudConfig: {
      baseUrl: "https://lwdp.test", token: "test", userId: "partner-codex",
    },
    submitExistingRequestImplementation: async (input) => {
      calls.push(["submit", input]);
      return {
        executionId: "execution-current-2",
        requestS3Uri: "s3://worldkit-test/current/request.json",
      };
    },
    dispatchImplementation: async (...args) => calls.push(["dispatch", ...args]),
    launchImplementation: async (input) => {
      calls.push(["launch", input]);
      return { jobName: "worldkit-scene-execution-current-2" };
    },
    pollImplementation: async () => ({
      execution_id: "execution-current-2", status: "succeeded",
    }),
    stagesImplementation: async () => ({ stages: [] }),
  });
  assert.equal(calls[0][0], "submit");
  assert.equal(calls[1][0], "dispatch");
  assert.equal(calls[2][0], "launch");
  assert.equal(calls[2][1].executionId, "execution-current-2");
  assert.equal(calls[2][1].resumeMode, "builder");
  assert.equal(calls[2][1].resumeSourceExecutionId, "execution-source-1");
  assert.equal(
    calls[2][1].resumeManifestS3Uri,
    "s3://worldkit-test/source/planner-manifest.json",
  );
  assert.equal(result.execution.execution_id, "execution-current-2");
});
