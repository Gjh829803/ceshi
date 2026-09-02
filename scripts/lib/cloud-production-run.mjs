import { createHash } from "node:crypto";

import { assertS3Uri } from "./lwdp-generation-client.mjs";

const HASH = /^sha256:[a-f0-9]{64}$/;
const IMAGE = /^[a-z0-9][a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/;
const STABLE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,159}$/;
const SCENE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const EPISODE_ID = /^[a-z0-9][a-z0-9-]{2,119}$/;

export const CLOUD_EPISODE_STAGE_PROFILE_V2 = Object.freeze([
  Object.freeze({
    stage_id: "episode-prepare",
    executor: "worker",
    max_attempts: 3,
    timeout_seconds: 21_600,
  }),
  Object.freeze({
    stage_id: "whitebox-capture",
    executor: "worker",
    depends_on: Object.freeze(["episode-prepare"]),
    max_attempts: 3,
    timeout_seconds: 43_200,
  }),
  Object.freeze({
    stage_id: "episode-render",
    executor: "worker",
    depends_on: Object.freeze(["whitebox-capture"]),
    max_attempts: 3,
    timeout_seconds: 43_200,
  }),
]);

export const CLOUD_EPISODE_PART_BY_STAGE_ID = Object.freeze({
  "episode-prepare": "prepare",
  "whitebox-capture": "capture",
  "episode-render": "render",
});

function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function requiredMatch(value, expression, label) {
  const string = requiredString(value, label);
  if (!expression.test(string)) throw new Error(`${label} is invalid.`);
  return string;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function cloudProductionContentHash(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function parseGpuCaptureQueueEntry(value) {
  const entry = typeof value === "string" ? JSON.parse(value) : value;
  if (
    entry?.kind !== "worldkit-gpu-capture-queue-entry" ||
    entry?.schemaVersion !== 1
  ) throw new Error("GPU capture queue entry identity is invalid.");
  const executionId = requiredMatch(entry.executionId, STABLE_ID, "executionId");
  const sceneId = requiredMatch(entry.sceneId, SCENE_ID, "sceneId");
  const episodeId = requiredMatch(entry.episodeId, EPISODE_ID, "episodeId");
  if (entry.stageId !== "whitebox-capture") {
    throw new Error("GPU capture queue entry stageId must be whitebox-capture.");
  }
  if (!Number.isSafeInteger(entry.stageAttempt) || entry.stageAttempt < 1) {
    throw new Error("GPU capture queue entry stageAttempt is invalid.");
  }
  const workerImage = requiredMatch(entry.workerImage, IMAGE, "workerImage");
  const prepareManifestS3Uri = assertS3Uri(entry.prepareManifestS3Uri);
  const prepareManifestHash = requiredMatch(
    entry.prepareManifestHash,
    HASH,
    "prepareManifestHash",
  );
  const inputIdentityHash = requiredMatch(
    entry.inputIdentityHash,
    HASH,
    "inputIdentityHash",
  );
  const requestS3Uri = assertS3Uri(entry.requestS3Uri);
  const outputS3Prefix = assertS3Uri(entry.outputS3Prefix);
  const queueEntryS3Uri = entry.queueEntryS3Uri == null
    ? null
    : assertS3Uri(entry.queueEntryS3Uri);
  const createdAt = requiredString(entry.createdAt, "createdAt");
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("createdAt is invalid.");
  return Object.freeze({
    kind: entry.kind,
    schemaVersion: entry.schemaVersion,
    executionId,
    sceneId,
    episodeId,
    stageId: entry.stageId,
    stageAttempt: entry.stageAttempt,
    workerImage,
    requestS3Uri,
    outputS3Prefix,
    queueEntryS3Uri,
    prepareManifestS3Uri,
    prepareManifestHash,
    inputIdentityHash,
    createdAt,
  });
}

export function buildGpuCaptureQueueEntry(input) {
  return parseGpuCaptureQueueEntry({
    kind: "worldkit-gpu-capture-queue-entry",
    schemaVersion: 1,
    ...input,
  });
}

export function selectGpuCaptureBatch(entries, {
  minimumBatchSize = 100,
  maximumBatchSize = 128,
  createdAt = new Date().toISOString(),
} = {}) {
  if (!Number.isSafeInteger(minimumBatchSize) || minimumBatchSize < 100) {
    throw new Error("minimumBatchSize must be an integer of at least 100.");
  }
  if (!Number.isSafeInteger(maximumBatchSize) || maximumBatchSize < minimumBatchSize) {
    throw new Error("maximumBatchSize must be at least minimumBatchSize.");
  }
  const parsed = entries.map(parseGpuCaptureQueueEntry);
  const uniqueByExecution = new Map();
  for (const entry of parsed) {
    const previous = uniqueByExecution.get(entry.executionId);
    if (previous?.stageAttempt === entry.stageAttempt &&
        cloudProductionContentHash(previous) !== cloudProductionContentHash(entry)) {
      throw new Error(`GPU capture queue entry conflicts: ${entry.executionId}`);
    }
    if (!previous || entry.stageAttempt > previous.stageAttempt) {
      uniqueByExecution.set(entry.executionId, entry);
    }
  }
  const byImage = new Map();
  for (const entry of uniqueByExecution.values()) {
    const group = byImage.get(entry.workerImage) ?? [];
    group.push(entry);
    byImage.set(entry.workerImage, group);
  }
  const eligibleGroups = [...byImage.entries()]
    .map(([workerImage, group]) => ({
      workerImage,
      entries: group.sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.executionId.localeCompare(right.executionId)),
    }))
    .filter((group) => group.entries.length >= minimumBatchSize)
    .sort((left, right) =>
      left.entries[0].createdAt.localeCompare(right.entries[0].createdAt) ||
      left.workerImage.localeCompare(right.workerImage));
  if (eligibleGroups.length === 0) {
    const error = new Error(
      `GPU capture batch is waiting for at least ${minimumBatchSize} compatible tasks.`,
    );
    error.code = "GPU_CAPTURE_BATCH_NOT_READY";
    error.eligibleCount = Math.max(0, ...[...byImage.values()].map((group) => group.length));
    throw error;
  }
  const selected = eligibleGroups[0].entries.slice(0, maximumBatchSize);
  const batchIdentity = {
    workerImage: eligibleGroups[0].workerImage,
    executionIds: selected.map((entry) => entry.executionId),
    entryHashes: selected.map(cloudProductionContentHash),
  };
  const batchHash = cloudProductionContentHash(batchIdentity);
  return Object.freeze({
    kind: "worldkit-gpu-capture-batch-manifest",
    schemaVersion: 1,
    batchId: `gpu-capture-${batchHash.slice("sha256:".length, "sha256:".length + 24)}`,
    batchHash,
    workerImage: eligibleGroups[0].workerImage,
    minimumBatchSize,
    taskCount: selected.length,
    createdAt,
    tasks: Object.freeze(selected),
  });
}

export function parseGpuCaptureBatchManifest(value) {
  const manifest = typeof value === "string" ? JSON.parse(value) : value;
  if (
    manifest?.kind !== "worldkit-gpu-capture-batch-manifest" ||
    manifest?.schemaVersion !== 1 ||
    !/^gpu-capture-[a-f0-9]{24}$/.test(manifest?.batchId ?? "") ||
    !HASH.test(manifest?.batchHash ?? "") ||
    !IMAGE.test(manifest?.workerImage ?? "") ||
    !Number.isSafeInteger(manifest?.minimumBatchSize) ||
    manifest.minimumBatchSize < 100 ||
    !Number.isSafeInteger(manifest?.taskCount) ||
    !Array.isArray(manifest?.tasks) ||
    manifest.taskCount !== manifest.tasks.length ||
    manifest.taskCount < manifest.minimumBatchSize
  ) throw new Error("GPU capture Batch manifest identity is invalid.");
  const tasks = manifest.tasks.map(parseGpuCaptureQueueEntry);
  if (new Set(tasks.map((task) => task.executionId)).size !== tasks.length) {
    throw new Error("GPU capture Batch contains duplicate executions.");
  }
  if (tasks.some((task) => task.workerImage !== manifest.workerImage)) {
    throw new Error("GPU capture Batch mixes Worker image digests.");
  }
  const expectedHash = cloudProductionContentHash({
    workerImage: manifest.workerImage,
    executionIds: tasks.map((entry) => entry.executionId),
    entryHashes: tasks.map(cloudProductionContentHash),
  });
  if (expectedHash !== manifest.batchHash ||
      manifest.batchId !== `gpu-capture-${expectedHash.slice(7, 31)}`) {
    throw new Error("GPU capture Batch content hash is invalid.");
  }
  return Object.freeze({ ...manifest, tasks: Object.freeze(tasks) });
}

export function parseCloudProviderJournal(value) {
  const journal = typeof value === "string" ? JSON.parse(value) : value;
  const validStatuses = new Set([
    "seedance-submitting",
    "seedance-submitted",
    "seedance-ready",
    "succeeded",
    "failed",
    "refunded",
  ]);
  if (
    journal?.kind !== "worldkit-episode-video-provider-run" ||
    journal?.schemaVersion !== 3 ||
    !SCENE_ID.test(journal?.sceneId ?? "") ||
    !EPISODE_ID.test(journal?.episodeId ?? "") ||
    !/^segment-0[0-5]$/.test(journal?.segmentId ?? "") ||
    journal?.inputIdentity == null ||
    typeof journal.inputIdentity !== "object" ||
    Array.isArray(journal.inputIdentity) ||
    Object.keys(journal.inputIdentity).length === 0 ||
    typeof journal?.idempotencyKey !== "string" ||
    journal.idempotencyKey.length < 8 ||
    !validStatuses.has(journal?.status)
  ) throw new Error("Cloud Provider Journal identity is invalid.");
  if (journal.status !== "seedance-submitting" &&
      (typeof journal.providerJobId !== "string" || journal.providerJobId.length === 0)) {
    throw new Error("Cloud Provider Journal post-submission state requires providerJobId.");
  }
  return Object.freeze({ ...journal });
}
