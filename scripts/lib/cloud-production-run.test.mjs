import assert from "node:assert/strict";
import test from "node:test";

import {
  CLOUD_EPISODE_STAGE_PROFILE_V3,
  CLOUD_EPISODE_STAGE_PROFILE_V2,
  buildGpuCaptureQueueEntry,
  cloudEpisodeResumeStageProfileV3,
  cloudEpisodeStageProfileV3,
  parseCloudProviderJournal,
  parseGpuCaptureBatchManifest,
  selectGpuCaptureBatch,
} from "./cloud-production-run.mjs";

const IMAGE = `registry.example/worldkit@sha256:${"a".repeat(64)}`;
const HASH = `sha256:${"b".repeat(64)}`;

function entry(index, overrides = {}) {
  const suffix = String(index).padStart(3, "0");
  return buildGpuCaptureQueueEntry({
    executionId: `execution_${suffix}`,
    sceneId: `scene-${suffix}`,
    episodeId: `episode-scene-${suffix}`,
    stageId: "whitebox-capture",
    stageAttempt: 1,
    workerImage: IMAGE,
    requestS3Uri: `s3://bucket/runs/${suffix}/request.json`,
    outputS3Prefix: `s3://bucket/runs/${suffix}`,
    prepareManifestS3Uri: `s3://bucket/runs/${suffix}/prepare/manifest.json`,
    prepareManifestHash: HASH,
    inputIdentityHash: `sha256:${index.toString(16).padStart(64, "0")}`,
    createdAt: new Date(Date.UTC(2026, 8, 2, 0, 0, index)).toISOString(),
    ...overrides,
  });
}

test("Episode Cloud Execution uses three coarse effect-preserving stages", () => {
  assert.deepEqual(CLOUD_EPISODE_STAGE_PROFILE_V2.map((stage) => stage.stage_id), [
    "episode-prepare",
    "whitebox-capture",
    "episode-render",
  ]);
  assert.deepEqual(CLOUD_EPISODE_STAGE_PROFILE_V2[1].depends_on, ["episode-prepare"]);
  assert.deepEqual(CLOUD_EPISODE_STAGE_PROFILE_V2[2].depends_on, ["whitebox-capture"]);
});

test("48-hour production profile exposes durable post-capture checkpoints", () => {
  assert.deepEqual(CLOUD_EPISODE_STAGE_PROFILE_V3.map(({ stage_id }) => stage_id), [
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
  assert.deepEqual(
    CLOUD_EPISODE_STAGE_PROFILE_V3.at(-1).depends_on,
    ["episode-conformance"],
  );
});

test("Seedance-conformance scope stops the durable DAG before publication", () => {
  const stages = cloudEpisodeStageProfileV3("seedance-conformance");
  assert.equal(stages.at(-1).stage_id, "episode-conformance");
  assert.deepEqual(stages.at(-1).depends_on, ["episode-seedance"]);
  assert.equal(stages.some(({ stage_id }) => stage_id === "episode-publication"), false);
  assert.equal(CLOUD_EPISODE_STAGE_PROFILE_V3.at(-1).stage_id, "episode-publication");
});

test("resume DAG starts immediately after the trusted completed stage", () => {
  const stages = cloudEpisodeResumeStageProfileV3(
    "seedance-conformance",
    "episode-style-prompts",
  );
  assert.deepEqual(stages.map(({ stage_id }) => stage_id), [
    "episode-seedance",
    "episode-conformance",
  ]);
  assert.equal(stages[0].depends_on, undefined);
  assert.deepEqual(stages[1].depends_on, ["episode-seedance"]);
});

test("GPU batch below one hundred requires closed-producer evidence", () => {
  assert.throws(
    () => selectGpuCaptureBatch(Array.from({ length: 99 }, (_, index) => entry(index))),
    (error) => error?.code === "GPU_CAPTURE_BATCH_NOT_READY" && error.eligibleCount === 99,
  );
});

test("GPU batch admits and verifies a stable producer-drained tail", () => {
  const entries = Array.from({ length: 20 }, (_, index) => entry(index));
  const evidence = {
    observedAt: "2026-09-02T00:05:00.000Z",
    newestReadyAt: entries.at(-1).createdAt,
    tailIdleSeconds: 120,
    readyRecordCount: 20,
    inFlightPrepareCount: 0,
  };
  const batch = selectGpuCaptureBatch(entries, {
    createdAt: evidence.observedAt,
    drainEvidenceByWorkerImage: new Map([[IMAGE, evidence]]),
  });
  assert.equal(batch.taskCount, 20);
  assert.equal(batch.dispatchReason, "producer-drained");
  assert.deepEqual(parseGpuCaptureBatchManifest(JSON.stringify(batch)), batch);
  assert.throws(() => parseGpuCaptureBatchManifest({
    ...batch,
    drainEvidence: { ...batch.drainEvidence, inFlightPrepareCount: 1 },
  }), /identity is invalid/);
});

test("GPU batch deterministically admits one hundred compatible tasks", () => {
  const batch = selectGpuCaptureBatch(
    Array.from({ length: 101 }, (_, index) => entry(100 - index)),
    { maximumBatchSize: 100, createdAt: "2026-09-02T01:00:00.000Z" },
  );
  assert.equal(batch.taskCount, 100);
  assert.equal(batch.tasks[0].executionId, "execution_000");
  assert.equal(batch.tasks.at(-1).executionId, "execution_099");
  assert.deepEqual(parseGpuCaptureBatchManifest(JSON.stringify(batch)), batch);
});

test("GPU batch does not mix incompatible Worker image digests", () => {
  const otherImage = `registry.example/worldkit@sha256:${"c".repeat(64)}`;
  assert.throws(
    () => selectGpuCaptureBatch([
      ...Array.from({ length: 60 }, (_, index) => entry(index)),
      ...Array.from({ length: 60 }, (_, index) => entry(index + 60, {
        workerImage: otherImage,
      })),
    ]),
    (error) => error?.code === "GPU_CAPTURE_BATCH_NOT_READY" && error.eligibleCount === 60,
  );
});

test("Provider Journal closes the request before and after submission", () => {
  const prepared = parseCloudProviderJournal({
    kind: "worldkit-episode-video-provider-run",
    schemaVersion: 3,
    sceneId: "scene-001",
    episodeId: "episode-scene-001",
    segmentId: "segment-00",
    inputIdentity: {
      provider: "mg-seedance-2.5-plus-cf-upscale",
      model: "mg-seedance-2.5-480p",
      upscaleModel: "cf-超分-720p-30s",
      promptSha256: "a".repeat(64),
    },
    idempotencyKey: "episode-segment-attempt-1",
    status: "seedance-submitting",
  });
  assert.equal(prepared.status, "seedance-submitting");
  assert.throws(() => parseCloudProviderJournal({
    ...prepared,
    status: "seedance-submitted",
  }));
  assert.equal(parseCloudProviderJournal({
    ...prepared,
    styleVariantId: "style-03",
    status: "seedance-submitted",
    providerJobId: "provider-job-001",
  }).styleVariantId, "style-03");
  assert.equal(parseCloudProviderJournal({
    ...prepared,
    status: "upscale-submitted",
    providerJobId: "provider-job-001",
    upscaleJobId: "upscale-job-001",
  }).status, "upscale-submitted");
  assert.equal(parseCloudProviderJournal({
    ...prepared,
    status: "failed",
    failedStage: "seedance",
  }).status, "failed");
  assert.throws(() => parseCloudProviderJournal({
    ...prepared,
    styleVariantId: "style-10",
  }));
});
