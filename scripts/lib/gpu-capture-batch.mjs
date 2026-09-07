import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseGpuCaptureBatchManifest } from "./cloud-production-run.mjs";

// Hosts own capture, continuation, durable receipts and queue IO.
export async function runGpuCaptureBatch({
  manifest,
  queueS3Prefix,
  taskLeaseSeconds,
  temporaryRoot,
  runCaptureImplementation,
  launchRenderImplementation,
  publishTaskReceiptImplementation,
  deleteQueueEntryImplementation,
  writeOutput = (value) => process.stdout.write(value),
  priorReceipts = new Map(),
  inspectTaskImplementation = async () => null,
  taskIndexes = null,
}) {
  for (const [name, implementation] of Object.entries({runCaptureImplementation, launchRenderImplementation, publishTaskReceiptImplementation, deleteQueueEntryImplementation})) {
    if (typeof implementation !== "function") throw new TypeError(`${name} must be explicitly provided.`);
  }
  const batch = parseGpuCaptureBatchManifest(manifest);
  const selectedIndexes = taskIndexes === null
    ? batch.tasks.map((_, index) => index)
    : [...taskIndexes];
  if (
    selectedIndexes.length === 0 ||
    new Set(selectedIndexes).size !== selectedIndexes.length ||
    selectedIndexes.some((index) =>
      !Number.isSafeInteger(index) || index < 0 || index >= batch.tasks.length)
  ) throw new Error("GPU Batch taskIndexes are invalid.");
  const root = temporaryRoot ?? await mkdtemp(join(tmpdir(), "worldkit-gpu-capture-batch-"));
  const results = [];
  try {
    for (const index of selectedIndexes) {
      const task = batch.tasks[index];
      const prior = priorReceipts.get(task.executionId);
      if (["capture-succeeded", "capture-failed", "capture-cancelled"].includes(prior?.status)) {
        results.push(prior);
        writeOutput(
          `WORLDKIT_GPU_BATCH_TASK ${batch.batchId} ${index + 1}/${batch.taskCount} ` +
          `${task.executionId} resumed status=${prior.status}\n`,
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
          try {
            await deleteQueueEntryImplementation(task.queueEntryS3Uri);
          } catch (error) {
            writeOutput(
              `WORLDKIT_GPU_QUEUE_CLEANUP_RETAINED ${task.executionId} ` +
                `${error instanceof Error ? error.message : String(error)}\n`,
            );
          }
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
      taskCount: results.length,
      batchTaskCount: batch.taskCount,
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
