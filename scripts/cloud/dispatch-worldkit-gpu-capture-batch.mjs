#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  parseGpuCaptureBatchManifest,
  parseGpuCaptureQueueEntry,
  selectGpuCaptureBatch,
} from "../lib/cloud-production-run.mjs";
import {
  cloudExecutionRecord,
  findCloudExecutionByRequestId,
  getCloudExecution,
} from "../lib/lwdp-cloud-execution-client.mjs";
import {
  assertS3Uri,
  downloadS3FileAtomic,
  joinS3Uri,
  uploadS3File,
} from "../lib/lwdp-generation-client.mjs";
import { materializeCloudWorkerLwdpConfig } from "./run-worldkit-cloud-scene-worker.mjs";
import { launchCloudGpuCaptureBatchJob } from
  "./launch-worldkit-cloud-gpu-capture-batch-job.mjs";
import { launchCloudEpisodeWorkerJob } from "./launch-worldkit-cloud-episode-worker-job.mjs";
import {
  listCloudEpisodeRunIndexRecords,
  writeCloudEpisodeRunIndexRecord,
} from "../lib/cloud-production-run-index.mjs";

const execFilePromise = promisify(execFile);
const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function splitS3Uri(value) {
  const url = new URL(assertS3Uri(value));
  return { bucket: url.hostname, key: url.pathname.replace(/^\//, "").replace(/\/$/, "") };
}

async function listS3Objects(prefix) {
  const { bucket, key } = splitS3Uri(prefix);
  const { stdout } = await execFilePromise("aws", [
    "s3api", "list-objects-v2",
    "--bucket", bucket,
    "--prefix", `${key}/`,
    "--output", "json",
  ], { maxBuffer: 16 * 1024 * 1024 });
  const payload = JSON.parse(stdout);
  return (payload.Contents ?? []).map((item) => ({
    key: item.Key,
    s3Uri: `s3://${bucket}/${item.Key}`,
    lastModified: item.LastModified ?? null,
  }));
}

async function mapWithConcurrency(items, limit, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await operation(items[index], index);
    }
  }));
  return results;
}

export async function cleanStaleQueueEntries(
  s3Uris,
  remove = (s3Uri) => execFilePromise(
    "aws",
    ["s3", "rm", "--only-show-errors", s3Uri],
  ),
) {
  const outcomes = [];
  for (const s3Uri of s3Uris) {
    try {
      await remove(s3Uri);
      outcomes.push({ s3Uri, status: "removed" });
    } catch (error) {
      // Queue admission is closed by the live Cloud Execution state. Object
      // deletion is storage hygiene only and must not block valid GPU work
      // when the workload role intentionally lacks DeleteObject.
      outcomes.push({
        s3Uri,
        status: "retained",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return outcomes;
}

export function immediateGpuCaptureWorkerImages(
  entries,
  defaultWorkerImage,
  enabled,
) {
  if (!enabled) return new Set();
  return new Set([
    defaultWorkerImage,
    ...entries.map((entry) => entry.workerImage),
  ].filter((value) => typeof value === "string" && value.length > 0));
}

function captureStageIsReady(execution) {
  if (["succeeded", "failed", "interrupted", "cancelled"].includes(execution?.status)) {
    return false;
  }
  const stage = execution?.stages?.find?.((item) => item?.stage_id === "whitebox-capture");
  return stage?.status === "ready";
}

function readyCaptureStage(execution) {
  if (!captureStageIsReady(execution)) return null;
  return execution.stages.find((item) => item?.stage_id === "whitebox-capture");
}

export async function unfinishedGpuBatchIsActionable(
  batch,
  inspectExecution,
) {
  const actionable = await mapWithConcurrency(batch.tasks, 8, async (task) => {
    try {
      const execution = cloudExecutionRecord(await inspectExecution(task.executionId));
      if (["succeeded", "failed", "interrupted", "cancelled"].includes(execution.status)) {
        return false;
      }
      const stage = execution.stages?.find?.(
        (item) => item?.stage_id === "whitebox-capture",
      );
      return stage?.status === "ready" || stage?.status === "running";
    } catch {
      // An unknown execution must remain recoverable. Only skip a manifest
      // when every task is positively known to be stale.
      return true;
    }
  });
  return actionable.some(Boolean);
}

export async function dispatchGpuCaptureBatch({
  entries,
  minimumBatchSize = 100,
  maximumBatchSize = 128,
  episodeRecords = [],
  defaultWorkerImage = null,
  tailIdleSeconds = 120,
  observedAt = new Date().toISOString(),
  inspectExecution,
  publishManifest,
  launchBatch,
  immediateWorkerImages = new Set(),
}) {
  const parsedCandidates = entries.map(parseGpuCaptureQueueEntry);
  // Older prepare attempts may have written attempt-scoped queue objects.
  // Collapse those projections before selecting a Batch; the newest prepare
  // checkpoint is the only valid admission candidate for one execution.
  const latestByExecution = new Map();
  for (const entry of parsedCandidates) {
    const previous = latestByExecution.get(entry.executionId);
    if (!previous ||
        entry.createdAt.localeCompare(previous.createdAt) > 0 ||
        (entry.createdAt === previous.createdAt &&
          String(entry.queueEntryS3Uri).localeCompare(String(previous.queueEntryS3Uri)) > 0)) {
      latestByExecution.set(entry.executionId, entry);
    }
  }
  const parsed = [...latestByExecution.values()];
  const inspected = await mapWithConcurrency(parsed, 16, async (entry) => ({
    entry,
    execution: cloudExecutionRecord(await inspectExecution(entry.executionId)),
  }));
  const executionById = new Map(inspected.map(({ execution }) => [
    execution.execution_id,
    execution,
  ]));
  const recordByExecutionId = new Map(episodeRecords.flatMap((record) =>
    typeof record?.remoteExecutionId === "string"
      ? [[record.remoteExecutionId, record]]
      : []));
  const staleQueueEntryUris = inspected.flatMap(({ entry, execution }) =>
    (["succeeded", "cancelled"].includes(execution.status) ||
      recordByExecutionId.get(entry.executionId)?.status === "cancelled") &&
      entry.queueEntryS3Uri
      ? [entry.queueEntryS3Uri]
      : []);
  const ready = inspected.flatMap(({ entry, execution }) => {
    const stage = execution.execution_id === entry.executionId
      ? readyCaptureStage(execution)
      : null;
    if (!stage) return [];
    const stageAttempt = Number(stage.current_attempt ?? entry.stageAttempt);
    return [{
      ...entry,
      stageAttempt: Number.isSafeInteger(stageAttempt) && stageAttempt > 0
        ? stageAttempt : entry.stageAttempt,
    }];
  });
  const activeEpisodeRecords = episodeRecords.map((record) => {
    const execution = executionById.get(record?.remoteExecutionId);
    if (!execution || ["succeeded", "failed", "interrupted", "cancelled"]
      .includes(execution.status)) return record;
    return {
      ...record,
      remoteStageId: execution.current_stage_id ?? record.remoteStageId,
    };
  }).filter((record) =>
    record?.backend === "cloud" &&
    ["running", "remote-pending"].includes(record?.status));
  const readyByWorkerImage = new Map();
  for (const entry of ready) {
    const group = readyByWorkerImage.get(entry.workerImage) ?? [];
    group.push(entry);
    readyByWorkerImage.set(entry.workerImage, group);
  }
  const drainEvidenceByWorkerImage = new Map();
  for (const [workerImage, group] of readyByWorkerImage) {
    if (group.length >= minimumBatchSize) continue;
    const readyExecutionIds = new Set(group.map((entry) => entry.executionId));
    const records = activeEpisodeRecords.filter((record) =>
      (record.remoteWorkerImage ?? defaultWorkerImage) === workerImage);
    const readyRecordCount = records.filter((record) =>
      record.remoteStageId === "whitebox-capture" &&
      readyExecutionIds.has(record.remoteExecutionId)).length;
    const inFlightPrepareCount = records.filter((record) => {
      if (record.remoteStageId === "episode-render") return false;
      if (record.remoteStageId !== "whitebox-capture") return true;
      return !readyExecutionIds.has(record.remoteExecutionId);
    }).length;
    const newestReadyAt = group.reduce((latest, entry) =>
      entry.createdAt.localeCompare(latest) > 0 ? entry.createdAt : latest,
    group[0].createdAt);
    if (
      records.length > 0 &&
      readyRecordCount === group.length &&
      inFlightPrepareCount === 0 &&
      Number.isSafeInteger(tailIdleSeconds) &&
      tailIdleSeconds >= 60 &&
      Number.isFinite(Date.parse(observedAt)) &&
      Date.parse(observedAt) - Date.parse(newestReadyAt) >= tailIdleSeconds * 1_000
    ) {
      drainEvidenceByWorkerImage.set(workerImage, Object.freeze({
        observedAt,
        newestReadyAt,
        tailIdleSeconds,
        readyRecordCount,
        inFlightPrepareCount,
      }));
    }
  }
  let batch;
  try {
    batch = selectGpuCaptureBatch(ready, {
      minimumBatchSize,
      maximumBatchSize,
      drainEvidenceByWorkerImage,
      immediateWorkerImages,
    });
  } catch (error) {
    if (error?.code === "GPU_CAPTURE_BATCH_NOT_READY") {
      return Object.freeze({
        status: "waiting",
        queuedCount: parsed.length,
        queueObjectCount: parsedCandidates.length,
        readyCount: ready.length,
        minimumBatchSize,
        tailIdleSeconds,
        drainEligibleCount: [...drainEvidenceByWorkerImage.values()]
          .reduce((sum, evidence) => sum + evidence.readyRecordCount, 0),
        staleQueueEntryUris,
        batch: null,
      });
    }
    throw error;
  }
  const published = await publishManifest(batch);
  const launched = await launchBatch(batch, published);
  return Object.freeze({
    status: "launched",
    queuedCount: parsed.length,
    queueObjectCount: parsedCandidates.length,
    readyCount: ready.length,
    minimumBatchSize,
    tailIdleSeconds,
    staleQueueEntryUris,
    batch,
    published,
    launched,
  });
}

export async function reconcileCloudEpisodeCpuStages({
  records,
  config,
  cloudConfig,
  findByRequestId = (requestId) => findCloudExecutionByRequestId(requestId, {
    kind: "episode",
    config: cloudConfig,
  }),
  inspectExecution = (executionId) => getCloudExecution(executionId, {
    config: cloudConfig,
  }),
  launchWorker = launchCloudEpisodeWorkerJob,
  persistRecord = async () => undefined,
}) {
  const outcomes = [];
  for (const sourceRecord of records) {
    if (sourceRecord?.backend !== "cloud" ||
        !["running", "remote-pending"].includes(sourceRecord?.status)) continue;
    let record = sourceRecord;
    let executionId = record.remoteExecutionId;
    if (!executionId && typeof record.remoteRequestId === "string") {
      try {
        const recovered = cloudExecutionRecord(await findByRequestId(record.remoteRequestId));
        executionId = recovered.execution_id;
        record = {
          ...record,
          recordRevision: Number(record.recordRevision ?? 0) + 1,
          remoteExecutionId: executionId,
          remoteRequestS3Uri: record.remoteRequestS3Uri ?? joinS3Uri(
            config.outputS3Root,
            record.sceneId,
            record.episodeId,
            "inputs",
            "request.json",
          ),
          remoteOutputS3Prefix: record.remoteOutputS3Prefix ?? joinS3Uri(
            config.outputS3Root,
            record.sceneId,
            record.episodeId,
          ),
          remoteWorkerImage: record.remoteWorkerImage ?? config.workerImage,
          updatedAt: new Date().toISOString(),
        };
        await persistRecord(record);
      } catch (error) {
        if (error?.status !== 404) throw error;
        outcomes.push({ episodeId: record.episodeId, status: "request-not-found" });
        continue;
      }
    }
    if (!executionId) continue;
    const execution = cloudExecutionRecord(await inspectExecution(executionId));
    if (["succeeded", "failed", "interrupted", "cancelled"].includes(execution.status)) {
      outcomes.push({ episodeId: record.episodeId, status: execution.status });
      continue;
    }
    const stageId = execution.current_stage_id;
    const stage = execution.stages?.find?.((item) => item?.stage_id === stageId);
    if (!["episode-prepare", "episode-render"].includes(stageId) || stage?.status !== "ready") {
      outcomes.push({ episodeId: record.episodeId, status: stageId === "whitebox-capture"
        ? "waiting-for-gpu-batch" : "no-launch-required" });
      continue;
    }
    const executionPart = stageId === "episode-prepare" ? "prepare" : "render";
    await launchWorker({
      executionId,
      stageId,
      executionPart,
      requestS3Uri: record.remoteRequestS3Uri,
      outputS3Prefix: record.remoteOutputS3Prefix,
      image: record.remoteWorkerImage ?? config.workerImage,
      namespace: config.namespace,
      userId: cloudConfig.userId,
      apiBase: cloudConfig.baseUrl,
      gpuRequired: false,
      ...config.cpuWorker,
      jobSuffix: Number(stage.current_attempt ?? 1) > 1
        ? `retry-${stage.current_attempt}` : "",
    });
    outcomes.push({ episodeId: record.episodeId, status: "cpu-worker-launched", stageId });
  }
  return outcomes;
}

async function main() {
  const config = JSON.parse(await readFile(
    join(repoRoot, "config", "cloud-episode-production.json"),
    "utf8",
  ));
  if (config?.schemaVersion !== 2 ||
      !["cpu-gpu-batch-cpu@1", "cpu-gpu-streaming-checkpoints@1"]
        .includes(config?.executionProfile)) {
    throw new Error("GPU dispatcher requires Cloud Episode production config v2.");
  }
  if (process.env.WORLDKIT_CLOUD_WORKER_IMAGE) {
    config.workerImage = process.env.WORLDKIT_CLOUD_WORKER_IMAGE;
  }
  if (!/^[a-z0-9][a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(config.workerImage ?? "")) {
    throw new Error("GPU dispatcher requires one digest-pinned Worker image.");
  }
  const queueS3Prefix = config.gpuBatch.queueS3Prefix;
  const cloudConfig = await materializeCloudWorkerLwdpConfig({
    repoRoot,
    environment: process.env,
  });
  delete process.env.LWDP_GENERATION_API_TOKEN;
  const runIndexRecords = await listCloudEpisodeRunIndexRecords({
    repoRoot,
    outputS3Root: config.outputS3Root,
  });
  await reconcileCloudEpisodeCpuStages({
    records: runIndexRecords,
    config,
    cloudConfig,
    persistRecord: (record) => writeCloudEpisodeRunIndexRecord(record, {
      repoRoot,
      outputS3Root: config.outputS3Root,
    }),
  });
  const temporaryRoot = await mkdtemp(join(tmpdir(), "worldkit-gpu-dispatch-"));
  try {
    const batchObjects = await listS3Objects(joinS3Uri(queueS3Prefix, "batches"));
    const resultBatchIds = new Set(batchObjects
      .filter((item) => /\/result\.json$/.test(item.key))
      .map((item) => /\/batches\/([^/]+)\/result\.json$/.exec(item.key)?.[1])
      .filter(Boolean));
    const unfinishedManifests = batchObjects
      .filter((item) => /\/manifest\.json$/.test(item.key))
      .filter((item) => {
        const batchId = /\/batches\/([^/]+)\/manifest\.json$/.exec(item.key)?.[1];
        return batchId && !resultBatchIds.has(batchId);
      });
    for (const unfinishedManifest of unfinishedManifests) {
      const localPath = join(temporaryRoot, "unfinished-batch.json");
      await downloadS3FileAtomic(unfinishedManifest.s3Uri, localPath);
      const batch = parseGpuCaptureBatchManifest(await readFile(localPath, "utf8"));
      const actionable = await unfinishedGpuBatchIsActionable(
        batch,
        (executionId) => getCloudExecution(executionId, { config: cloudConfig }),
      );
      if (!actionable) {
        process.stdout.write(`${JSON.stringify({
          status: "stale-unfinished-batch-skipped",
          batchId: batch.batchId,
          taskCount: batch.taskCount,
        })}\n`);
        continue;
      }
      const launched = await launchCloudGpuCaptureBatchJob({
        batchId: batch.batchId,
        batchManifestS3Uri: unfinishedManifest.s3Uri,
        queueS3Prefix,
        taskCount: batch.taskCount,
        minimumBatchSize: batch.minimumBatchSize,
        dispatchReason: batch.dispatchReason,
        drainEvidence: batch.drainEvidence ?? null,
        image: batch.workerImage,
        namespace: config.namespace,
        userId: cloudConfig.userId,
        apiBase: cloudConfig.baseUrl,
        gpuResourceName: config.gpuResourceName,
        gpuCount: config.gpuCount,
        nodeSelector: config.nodeSelector,
        tolerations: config.tolerations,
        taskLeaseSeconds: config.gpuBatch.taskLeaseSeconds,
        ephemeralStorageRequest: config.gpuBatch.ephemeralStorageRequest,
        ephemeralStorageLimit: config.gpuBatch.ephemeralStorageLimit,
        caseConcurrency: batch.workerImage === config.workerImage
          ? config.gpuBatch.caseConcurrency : 1,
      });
      process.stdout.write(`${JSON.stringify({ status: "reconciled", batch, launched })}\n`);
      return;
    }

    const pendingObjects = (await listS3Objects(joinS3Uri(queueS3Prefix, "pending")))
      .filter((item) => item.key.endsWith(".json"));
    const entries = (await mapWithConcurrency(pendingObjects, 16, async (object, index) => {
      const localPath = join(temporaryRoot, "pending", `${String(index).padStart(5, "0")}.json`);
      await mkdir(join(temporaryRoot, "pending"), { recursive: true });
      await downloadS3FileAtomic(object.s3Uri, localPath);
      const entry = parseGpuCaptureQueueEntry(await readFile(localPath, "utf8"));
      if (entry.queueEntryS3Uri !== object.s3Uri) {
        throw new Error(`GPU queue entry URI mismatch: ${object.s3Uri}`);
      }
      return entry;
    })).filter(Boolean);
    const result = await dispatchGpuCaptureBatch({
      entries,
      minimumBatchSize: config.gpuBatch.minimumBatchSize,
      maximumBatchSize: config.gpuBatch.maximumBatchSize,
      episodeRecords: runIndexRecords,
      defaultWorkerImage: config.workerImage,
      tailIdleSeconds: config.gpuBatch.tailFlushIdleSeconds,
      // Every parsed queue entry is still bound to its admitted Episode record
      // and live Cloud Execution below. Preserve immediate dispatch across a
      // deployment: in-flight Episodes intentionally retain their frozen,
      // digest-pinned Worker image instead of being starved until every newer
      // producer has finished.
      immediateWorkerImages: immediateGpuCaptureWorkerImages(
        entries,
        config.workerImage,
        config.gpuBatch.dispatchReadyImmediately,
      ),
      inspectExecution: (executionId) => getCloudExecution(executionId, {
        config: cloudConfig,
      }),
      publishManifest: async (batch) => {
        const localPath = join(temporaryRoot, `${batch.batchId}.json`);
        await writeFile(localPath, `${JSON.stringify(batch, null, 2)}\n`, { mode: 0o600 });
        const s3Uri = joinS3Uri(queueS3Prefix, "batches", batch.batchId, "manifest.json");
        await uploadS3File(localPath, s3Uri);
        return { s3Uri };
      },
      launchBatch: (batch, published) => launchCloudGpuCaptureBatchJob({
        batchId: batch.batchId,
        batchManifestS3Uri: published.s3Uri,
        queueS3Prefix,
        taskCount: batch.taskCount,
        minimumBatchSize: batch.minimumBatchSize,
        dispatchReason: batch.dispatchReason,
        drainEvidence: batch.drainEvidence ?? null,
        image: batch.workerImage,
        namespace: config.namespace,
        userId: cloudConfig.userId,
        apiBase: cloudConfig.baseUrl,
        gpuResourceName: config.gpuResourceName,
        gpuCount: config.gpuCount,
        nodeSelector: config.nodeSelector,
        tolerations: config.tolerations,
        taskLeaseSeconds: config.gpuBatch.taskLeaseSeconds,
        ephemeralStorageRequest: config.gpuBatch.ephemeralStorageRequest,
        ephemeralStorageLimit: config.gpuBatch.ephemeralStorageLimit,
        caseConcurrency: batch.workerImage === config.workerImage
          ? config.gpuBatch.caseConcurrency : 1,
      }),
    });
    const staleQueueCleanup = await cleanStaleQueueEntries(
      result.staleQueueEntryUris,
    );
    process.stdout.write(`${JSON.stringify({ ...result, staleQueueCleanup })}\n`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
