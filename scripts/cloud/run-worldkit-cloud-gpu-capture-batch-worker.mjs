#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { parseGpuCaptureBatchManifest } from "../lib/cloud-production-run.mjs";
import {
  cloudExecutionRecord,
  getCloudExecution,
} from "../lib/lwdp-cloud-execution-client.mjs";
import {
  downloadS3FileAtomic,
  joinS3Uri,
  uploadS3File,
} from "../lib/lwdp-generation-client.mjs";
import { launchCloudEpisodeWorkerJob } from "./launch-worldkit-cloud-episode-worker-job.mjs";
import { materializeCloudWorkerLwdpConfig } from "./run-worldkit-cloud-scene-worker.mjs";
import { sha256File } from "../lib/worldkit-cloud-artifacts.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value after ${argument}.`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function runChild(command, arguments_, { cwd = repoRoot, env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      env,
      stdio: "inherit",
      detached: false,
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolvePromise({ code, signal }));
  });
}

async function deleteS3Object(s3Uri) {
  const result = await runChild("aws", ["s3", "rm", "--only-show-errors", s3Uri]);
  if (result.code !== 0) throw new Error(`Failed to remove completed queue entry: ${s3Uri}`);
}

async function loadProductionConfig() {
  const value = JSON.parse(await readFile(
    join(repoRoot, "config", "cloud-episode-production.json"),
    "utf8",
  ));
  if (value?.schemaVersion !== 2 || value?.executionProfile !== "cpu-gpu-batch-cpu@1") {
    throw new Error("GPU Batch Worker requires Cloud Episode production config v2.");
  }
  return value;
}

export async function runGpuCaptureBatch({
  manifest,
  queueS3Prefix,
  taskLeaseSeconds,
  temporaryRoot,
  runCaptureImplementation,
  launchRenderImplementation,
  publishTaskReceiptImplementation,
  deleteQueueEntryImplementation = deleteS3Object,
  writeOutput = (value) => process.stdout.write(value),
  priorReceipts = new Map(),
  inspectTaskImplementation = async () => null,
}) {
  const batch = parseGpuCaptureBatchManifest(manifest);
  const root = temporaryRoot ?? await mkdtemp(join(tmpdir(), "worldkit-gpu-capture-batch-"));
  const results = [];
  try {
    for (let index = 0; index < batch.tasks.length; index += 1) {
      const task = batch.tasks[index];
      const prior = priorReceipts.get(task.executionId);
      if (prior?.status === "capture-succeeded") {
        results.push(prior);
        writeOutput(
          `WORLDKIT_GPU_BATCH_TASK ${batch.batchId} ${index + 1}/${batch.taskCount} ` +
            `${task.executionId} resumed\n`,
        );
        continue;
      }
      const startedAt = new Date().toISOString();
      writeOutput(
        `WORLDKIT_GPU_BATCH_TASK ${batch.batchId} ${index + 1}/${batch.taskCount} ` +
          `${task.executionId} running\n`,
      );
      let result;
      try {
        const execution = await inspectTaskImplementation(task);
        const captureStage = execution?.stages?.find?.((stage) =>
          stage?.stage_id === "whitebox-capture");
        const captureAlreadySucceeded = execution?.status === "succeeded" ||
          captureStage?.status === "succeeded" ||
          execution?.current_stage_id === "episode-render";
        if (execution?.status === "cancelled") {
          result = {
            executionId: task.executionId,
            sceneId: task.sceneId,
            episodeId: task.episodeId,
            status: "capture-cancelled",
            startedAt,
            finishedAt: new Date().toISOString(),
            error: null,
          };
        } else {
          if (!captureAlreadySucceeded) {
            await runCaptureImplementation(task, { taskLeaseSeconds, execution });
          }
          if (execution?.status !== "succeeded") await launchRenderImplementation(task);
          result = {
            executionId: task.executionId,
            sceneId: task.sceneId,
            episodeId: task.episodeId,
            status: "capture-succeeded",
            startedAt,
            finishedAt: new Date().toISOString(),
            error: null,
          };
        }
        if (task.queueEntryS3Uri && result.status !== "capture-failed") {
          await deleteQueueEntryImplementation(task.queueEntryS3Uri);
        }
      } catch (error) {
        result = {
          executionId: task.executionId,
          sceneId: task.sceneId,
          episodeId: task.episodeId,
          status: "capture-failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        };
      }
      results.push(result);
      await publishTaskReceiptImplementation(result, index);
      writeOutput(
        `WORLDKIT_GPU_BATCH_TASK ${batch.batchId} ${index + 1}/${batch.taskCount} ` +
          `${task.executionId} ${result.status}\n`,
      );
    }
    return Object.freeze({
      kind: "worldkit-gpu-capture-batch-result",
      schemaVersion: 1,
      batchId: batch.batchId,
      batchHash: batch.batchHash,
      taskCount: batch.taskCount,
      succeededCount: results.filter((result) => result.status === "capture-succeeded").length,
      failedCount: results.filter((result) => result.status === "capture-failed").length,
      cancelledCount: results.filter((result) => result.status === "capture-cancelled").length,
      finishedAt: new Date().toISOString(),
      tasks: Object.freeze(results),
      queueS3Prefix,
    });
  } finally {
    if (!temporaryRoot) await rm(root, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const batchManifestS3Uri = options["batch-manifest-s3-uri"];
  const queueS3Prefix = options["queue-s3-prefix"];
  const taskLeaseSeconds = Number(options["task-lease-seconds"] ?? 43_200);
  if (!Number.isSafeInteger(taskLeaseSeconds) || taskLeaseSeconds < 900) {
    throw new Error("task-lease-seconds must be at least 900.");
  }
  const temporaryRoot = await mkdtemp(join(tmpdir(), "worldkit-gpu-capture-batch-main-"));
  try {
    const manifestPath = join(temporaryRoot, "batch-manifest.json");
    await downloadS3FileAtomic(batchManifestS3Uri, manifestPath);
    const manifest = parseGpuCaptureBatchManifest(await readFile(manifestPath, "utf8"));
    if (process.env.WORLDKIT_CLOUD_WORKER_IMAGE !== manifest.workerImage) {
      throw new Error("GPU Batch Worker image differs from the frozen Batch image.");
    }
    const productionConfig = await loadProductionConfig();
    const cloudConfig = await materializeCloudWorkerLwdpConfig({
      repoRoot,
      environment: process.env,
    });
    const batchS3Prefix = joinS3Uri(queueS3Prefix, "batches", manifest.batchId);
    const priorReceipts = new Map();
    for (let index = 0; index < manifest.tasks.length; index += 1) {
      const task = manifest.tasks[index];
      const localPath = join(temporaryRoot, "prior-receipts", `${task.executionId}.json`);
      await mkdir(dirname(localPath), { recursive: true });
      const downloaded = await downloadS3FileAtomic(
        joinS3Uri(batchS3Prefix, "tasks", `${task.executionId}.json`),
        localPath,
      ).then(() => true).catch(() => false);
      if (!downloaded) continue;
      const receipt = JSON.parse(await readFile(localPath, "utf8"));
      if (
        receipt?.kind === "worldkit-gpu-capture-batch-task-receipt" &&
        receipt?.batchId === manifest.batchId &&
        receipt?.batchHash === manifest.batchHash &&
        receipt?.executionId === task.executionId &&
        receipt?.status === "capture-succeeded"
      ) priorReceipts.set(task.executionId, receipt);
    }
    const publishTaskReceipt = async (result, index) => {
      const receiptPath = join(temporaryRoot, `task-${String(index).padStart(3, "0")}.json`);
      await writeFile(receiptPath, `${JSON.stringify({
        kind: "worldkit-gpu-capture-batch-task-receipt",
        schemaVersion: 1,
        batchId: manifest.batchId,
        batchHash: manifest.batchHash,
        ...result,
      }, null, 2)}\n`, { mode: 0o600 });
      await uploadS3File(
        receiptPath,
        joinS3Uri(batchS3Prefix, "tasks", `${result.executionId}.json`),
      );
    };
    const result = await runGpuCaptureBatch({
      manifest,
      queueS3Prefix,
      taskLeaseSeconds,
      temporaryRoot,
      priorReceipts,
      inspectTaskImplementation: async (task) => cloudExecutionRecord(
        await getCloudExecution(task.executionId, { config: cloudConfig }),
      ),
      runCaptureImplementation: async (task, { execution }) => {
        try {
          const declaredArtifacts = [
            ...(execution?.artifacts ?? []),
            ...(execution?.stages ?? []).flatMap((stage) => stage?.artifacts ?? []),
          ];
          const declaredPrepareManifest = declaredArtifacts.find((artifact) =>
            artifact?.role === "worldkit-cloud-artifact-manifest" &&
            artifact?.stage_id === "episode-prepare");
          if (declaredPrepareManifest &&
              declaredPrepareManifest.s3_uri !== task.prepareManifestS3Uri) {
            throw new Error("GPU queue entry differs from the LWDP prepare manifest.");
          }
          const prepareManifestPath = join(
            temporaryRoot,
            "prepare-manifests",
            `${task.executionId}.json`,
          );
          await mkdir(dirname(prepareManifestPath), { recursive: true });
          await downloadS3FileAtomic(task.prepareManifestS3Uri, prepareManifestPath);
          if (await sha256File(prepareManifestPath) !== task.prepareManifestHash) {
            throw new Error("GPU queue prepare manifest hash is invalid.");
          }
          const childResult = await runChild("node", [
            "scripts/cloud/run-worldkit-cloud-episode-worker.mjs",
            "--execution-id", task.executionId,
            "--stage-id", "whitebox-capture",
            "--execution-part", "capture",
            "--request-s3-uri", task.requestS3Uri,
            "--output-s3-prefix", task.outputS3Prefix,
            "--worker-id", `${manifest.batchId}-${task.executionId}`,
            "--lease-seconds", String(taskLeaseSeconds),
          ]);
          if (childResult.code !== 0) {
            throw new Error(
              `Capture Worker exited ${childResult.code ?? `by ${childResult.signal}`}.`,
            );
          }
        } finally {
          await Promise.all([
            rm(join(repoRoot, "artifacts", "episodes", task.episodeId), {
              recursive: true, force: true,
            }),
            rm(join(repoRoot, "artifacts", "scenes", task.sceneId), {
              recursive: true, force: true,
            }),
            rm(join(
              repoRoot,
              "apps", "playground", "public", "scene-plans", task.sceneId,
            ), { recursive: true, force: true }),
          ]);
        }
      },
      launchRenderImplementation: async (task) => launchCloudEpisodeWorkerJob({
        executionId: task.executionId,
        stageId: "episode-render",
        executionPart: "render",
        requestS3Uri: task.requestS3Uri,
        outputS3Prefix: task.outputS3Prefix,
        image: task.workerImage,
        namespace: productionConfig.namespace,
        userId: process.env.LWDP_USER_ID ?? "worldkit-studio",
        gpuRequired: false,
        ...productionConfig.cpuWorker,
      }),
      publishTaskReceiptImplementation: publishTaskReceipt,
    });
    const resultPath = join(temporaryRoot, "batch-result.json");
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    await uploadS3File(resultPath, joinS3Uri(batchS3Prefix, "result.json"));
    process.stdout.write(
      `WORLDKIT_GPU_BATCH_COMPLETE ${manifest.batchId} ` +
        `succeeded=${result.succeededCount} failed=${result.failedCount}\n`,
    );
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
