import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { submitCloudEpisode } from "./submit-worldkit-cloud-episode.mjs";

const config = {
  baseUrl: "https://lwdp.example.test",
  token: "secret",
  userId: "worldkit-studio",
};

test("submits one three-stage Episode DAG bound to an admitted Scene manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "worldkit-cloud-episode-submit-"));
  const requestPath = join(root, "request.json");
  const uploads = [];
  const requests = [];
  try {
    const result = await submitCloudEpisode({
      sceneId: "scene-cloud-001",
      episodeId: "episode-scene-cloud-001-a1b2c3",
      sceneExecutionId: "exec-scene-001",
      sceneManifestS3Uri: "s3://bucket/scene/cloud-artifact-manifest.json",
      sceneRecord: {
        id: "scene-cloud-001",
        sceneId: "scene-cloud-001",
        status: "ready",
        remoteExecutionId: "exec-scene-001",
        remoteArtifactAdmission: { status: "passed", executionId: "exec-scene-001" },
      },
      productionScope: "visual-sample",
      styleVariantMode: "legacy",
      workerImage: `worker@sha256:${"d".repeat(64)}`,
      gpuBatch: {
        queueS3Prefix: "s3://bucket/gpu-capture-queue",
        minimumBatchSize: 100,
        maximumBatchSize: 128,
      },
      resumeEpisodeManifest: {
        executionId: "exec-episode-prior",
        s3Uri: "s3://bucket/episodes/prior/cloud-artifact-manifest.json",
      },
      requestId: "episode-scene-cloud-001-a1b2c3-run-1",
      outputS3Prefix: "s3://bucket/episodes/episode-scene-cloud-001-a1b2c3",
      cloudConfig: config,
      requestPath,
      findExistingImplementation: async () => {
        const error = new Error("not found");
        error.status = 404;
        throw error;
      },
      uploadOptions: {
        execFileImplementation: (_command, args, _options, callback) => {
          uploads.push(args);
          callback(null, "", "");
        },
      },
      fetchImplementation: async (url, init) => {
        requests.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
        if (url.endsWith("/dispatch")) {
          return new Response(JSON.stringify({ dispatch_accepted: true }), { status: 200 });
        }
        return new Response(JSON.stringify({
          execution: { execution_id: "exec-episode-001", status: "queued" },
        }), { status: 201 });
      },
    });
    assert.equal(result.executionId, "exec-episode-001");
    assert.equal(uploads.length, 1);
    const request = JSON.parse(await readFile(requestPath, "utf8"));
    assert.equal(request.kind, "worldkit-cloud-episode-request");
    assert.equal(request.schemaVersion, 2);
    assert.equal(request.executionProfile, "cpu-gpu-batch-cpu@1");
    assert.equal(request.gpuBatch.minimumBatchSize, 100);
    assert.equal(request.sceneExecutionId, "exec-scene-001");
    assert.equal(request.pipeline.command, "episode:run");
    assert.equal(request.productionScope, "visual-sample");
    assert.equal(request.styleVariantMode, "legacy");
    assert.equal(request.workerImage, `worker@sha256:${"d".repeat(64)}`);
    assert.equal(request.resumeEpisodeManifest.executionId, "exec-episode-prior");
    assert.equal(requests[0].body.kind, "episode");
    assert.deepEqual(requests[0].body.stages.map((stage) => stage.stage_id), [
      "episode-prepare",
      "whitebox-capture",
      "episode-render",
    ]);
    assert.deepEqual(requests[0].body.stages[1].depends_on, ["episode-prepare"]);
    assert.deepEqual(requests[0].body.stages[2].depends_on, ["whitebox-capture"]);
    assert.ok(requests[0].body.inputs.some((input) =>
      input.role === "trusted-scene-artifact-manifest"));
    assert.ok(requests[0].body.inputs.some((input) =>
      input.role === "prior-episode-artifact-manifest"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recovers an existing Cloud Episode without overwriting its immutable request", async () => {
  const oldImage = `worker@sha256:${"a".repeat(64)}`;
  const currentImage = `worker@sha256:${"b".repeat(64)}`;
  const sceneRecord = {
    id: "scene-cloud-001",
    sceneId: "scene-cloud-001",
    status: "ready",
    remoteExecutionId: "exec-scene-001",
    remoteArtifactAdmission: { status: "passed", executionId: "exec-scene-001" },
  };
  const existingRequest = {
    kind: "worldkit-cloud-episode-request",
    schemaVersion: 2,
    sceneId: "scene-cloud-001",
    episodeId: "episode-scene-cloud-001-a1b2c3",
    sceneExecutionId: "exec-scene-001",
    sceneManifestS3Uri: "s3://bucket/scene/cloud-artifact-manifest.json",
    sceneRecord,
    productionScope: "full",
    styleVariantMode: "ten-style",
    workerImage: oldImage,
    executionProfile: "cpu-gpu-batch-cpu@1",
    gpuBatch: {
      queueS3Prefix: "s3://bucket/gpu-capture-queue",
      minimumBatchSize: 100,
      maximumBatchSize: 128,
      tailFlushIdleSeconds: 120,
    },
    pipeline: { command: "episode:run", backend: "cloud", stageIds: [] },
  };
  let uploadCount = 0;
  const result = await submitCloudEpisode({
    sceneId: existingRequest.sceneId,
    episodeId: existingRequest.episodeId,
    sceneExecutionId: existingRequest.sceneExecutionId,
    sceneManifestS3Uri: existingRequest.sceneManifestS3Uri,
    sceneRecord,
    productionScope: existingRequest.productionScope,
    styleVariantMode: existingRequest.styleVariantMode,
    workerImage: currentImage,
    gpuBatch: existingRequest.gpuBatch,
    requestId: "episode-scene-cloud-001-a1b2c3-cloud-run-1",
    outputS3Prefix: "s3://bucket/episodes/episode-scene-cloud-001-a1b2c3",
    cloudConfig: config,
    findExistingImplementation: async () => ({
      execution: { execution_id: "exec-existing-episode", status: "awaiting-recording" },
    }),
    readExistingRequestImplementation: async () => Buffer.from(
      `${JSON.stringify(existingRequest)}\n`,
    ),
    uploadOptions: {
      execFileImplementation: (_command, _args, _options, callback) => {
        uploadCount += 1;
        callback(null, "", "");
      },
    },
  });
  assert.equal(uploadCount, 0);
  assert.equal(result.executionId, "exec-existing-episode");
  assert.equal(result.workerImage, oldImage);
  assert.equal(result.recoveredByRequestId, true);
});

test("submits the streaming ten-style DAG for a new 48-hour production run", async () => {
  const root = await mkdtemp(join(tmpdir(), "worldkit-cloud-episode-streaming-"));
  const requestPath = join(root, "request.json");
  const requests = [];
  try {
    await submitCloudEpisode({
      sceneId: "scene-streaming-001",
      episodeId: "episode-scene-streaming-001",
      sceneExecutionId: "exec-scene-streaming",
      sceneManifestS3Uri: "s3://bucket/scene/manifest.json",
      sceneRecord: {
        id: "scene-streaming-001",
        sceneId: "scene-streaming-001",
        status: "ready",
        remoteArtifactAdmission: { status: "passed" },
      },
      styleVariantMode: "ten-style",
      executionProfile: "cpu-gpu-streaming-checkpoints@1",
      workerImage: `worker@sha256:${"e".repeat(64)}`,
      gpuBatch: {
        queueS3Prefix: "s3://bucket/gpu-capture-queue",
        minimumBatchSize: 100,
        maximumBatchSize: 128,
      },
      requestId: "episode-scene-streaming-001-run-1",
      outputS3Prefix: "s3://bucket/episodes/episode-scene-streaming-001",
      cloudConfig: config,
      requestPath,
      findExistingImplementation: async () => {
        const error = new Error("not found");
        error.status = 404;
        throw error;
      },
      uploadOptions: {
        execFileImplementation: (_command, _args, _options, callback) =>
          callback(null, "", ""),
      },
      fetchImplementation: async (url, init) => {
        requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
        return new Response(JSON.stringify({
          execution: { execution_id: "exec-streaming", status: "running" },
        }), { status: 201 });
      },
    });
    const request = JSON.parse(await readFile(requestPath, "utf8"));
    assert.equal(request.schemaVersion, 3);
    assert.equal(request.executionProfile, "cpu-gpu-streaming-checkpoints@1");
    assert.deepEqual(requests[0].body.stages.map(({ stage_id }) => stage_id), [
      "episode-prepare",
      "whitebox-capture",
      "episode-style-plan",
      "episode-style-openings",
      "episode-style-visuals",
      "episode-style-diversity",
      "episode-style-events",
      "episode-style-prompts",
      "episode-seedance",
      "episode-conformance",
      "episode-publication",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("submits only Seedance and conformance after a trusted style-prompt resume", async () => {
  const root = await mkdtemp(join(tmpdir(), "worldkit-cloud-episode-direct-seedance-"));
  const requestPath = join(root, "request.json");
  const requests = [];
  try {
    const result = await submitCloudEpisode({
      sceneId: "scene-resume-001",
      episodeId: "episode-scene-resume-001",
      sceneExecutionId: "exec-scene-resume",
      sceneManifestS3Uri: "s3://bucket/scene/manifest.json",
      sceneRecord: {
        id: "scene-resume-001",
        sceneId: "scene-resume-001",
        status: "ready",
        remoteArtifactAdmission: { status: "passed" },
      },
      productionScope: "seedance-conformance",
      styleVariantMode: "ten-style",
      executionProfile: "cpu-gpu-streaming-checkpoints@1",
      workerImage: `worker@sha256:${"e".repeat(64)}`,
      gpuBatch: {
        queueS3Prefix: "s3://bucket/gpu-capture-queue",
        minimumBatchSize: 100,
        maximumBatchSize: 128,
      },
      resumeEpisodeManifest: {
        executionId: "exec-prior",
        s3Uri: "s3://bucket/prior/style-prompts.json",
        stageId: "episode-style-prompts",
        executionPart: "style-prompts",
      },
      requestId: "episode-scene-resume-001-run-2",
      outputS3Prefix: "s3://bucket/episodes/episode-scene-resume-001",
      cloudConfig: config,
      requestPath,
      findExistingImplementation: async () => {
        const error = new Error("not found");
        error.status = 404;
        throw error;
      },
      uploadOptions: {
        execFileImplementation: (_command, _args, _options, callback) =>
          callback(null, "", ""),
      },
      fetchImplementation: async (url, init) => {
        requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
        return new Response(JSON.stringify({
          execution: { execution_id: "exec-direct-seedance", status: "running" },
        }), { status: 201 });
      },
    });
    assert.deepEqual(result.stageIds, ["episode-seedance", "episode-conformance"]);
    assert.deepEqual(requests[0].body.stages.map(({ stage_id }) => stage_id), [
      "episode-seedance",
      "episode-conformance",
    ]);
    assert.equal(requests[0].body.stages[0].depends_on, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps visual-sample runs on the effect-preserving coarse endpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "worldkit-cloud-episode-visual-sample-"));
  const requestPath = join(root, "request.json");
  const requests = [];
  try {
    const result = await submitCloudEpisode({
      sceneId: "scene-visual-sample-001",
      episodeId: "episode-scene-visual-sample-001",
      sceneExecutionId: "exec-scene-visual-sample",
      sceneManifestS3Uri: "s3://bucket/scene/manifest.json",
      sceneRecord: {
        id: "scene-visual-sample-001",
        sceneId: "scene-visual-sample-001",
        status: "ready",
        remoteArtifactAdmission: { status: "passed" },
      },
      productionScope: "visual-sample",
      styleVariantMode: "ten-style",
      executionProfile: "cpu-gpu-streaming-checkpoints@1",
      workerImage: `worker@sha256:${"e".repeat(64)}`,
      gpuBatch: {
        queueS3Prefix: "s3://bucket/gpu-capture-queue",
        minimumBatchSize: 100,
        maximumBatchSize: 128,
      },
      requestId: "episode-scene-visual-sample-001-run-1",
      outputS3Prefix: "s3://bucket/episodes/episode-scene-visual-sample-001",
      cloudConfig: config,
      requestPath,
      findExistingImplementation: async () => {
        const error = new Error("not found");
        error.status = 404;
        throw error;
      },
      uploadOptions: {
        execFileImplementation: (_command, _args, _options, callback) =>
          callback(null, "", ""),
      },
      fetchImplementation: async (url, init) => {
        requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
        return new Response(JSON.stringify({
          execution: { execution_id: "exec-visual-sample", status: "running" },
        }), { status: 201 });
      },
    });
    const request = JSON.parse(await readFile(requestPath, "utf8"));
    assert.equal(request.schemaVersion, 2);
    assert.equal(result.executionProfile, "cpu-gpu-batch-cpu@1");
    assert.deepEqual(requests[0].body.stages.map(({ stage_id }) => stage_id), [
      "episode-prepare", "whitebox-capture", "episode-render",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
