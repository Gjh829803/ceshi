#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cloudExecutionRecord,
  getCloudExecution,
  getCloudExecutionStages,
} from "../lib/lwdp-cloud-execution-client.mjs";
import { joinS3Uri, uploadS3File } from "../lib/lwdp-generation-client.mjs";

const terminalStatuses = new Set(["succeeded", "failed", "interrupted", "cancelled"]);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--once") {
      options.once = true;
      continue;
    }
    if (argument === "--") continue;
    const value = argv[index + 1];
    if (!argument.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Invalid option: ${argument}`);
    }
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

async function inspectCase(caseRecord, options) {
  if (!caseRecord.executionId) return caseRecord;
  try {
    const execution = cloudExecutionRecord(await getCloudExecution(caseRecord.executionId, options));
    const activeStage = Array.isArray(execution.stages)
      ? execution.stages.find((stage) => stage.stage_id === "scene-production")
      : null;
    Object.assign(caseRecord, {
      status: execution.status,
      currentStageId: execution.current_stage_id ?? null,
      lastHeartbeat: execution.last_heartbeat ?? null,
      error: execution.error ?? null,
      diagnostics: execution.diagnostics ?? null,
      stageDiagnostics: activeStage?.diagnostics ?? null,
      whiteboxOutcome: activeStage?.diagnostics?.whitebox_outcome ?? null,
      generationJobId: execution.generation_job_id ?? null,
      raySubmissionId: execution.ray_submission_id ?? null,
      observedAt: new Date().toISOString(),
    });
    if (["failed", "interrupted"].includes(execution.status)) {
      caseRecord.stages = await getCloudExecutionStages(caseRecord.executionId, options);
    }
  } catch (error) {
    caseRecord.monitorError = error instanceof Error ? error.message : String(error);
  }
  return caseRecord;
}

export async function monitorCloudSceneBatch({
  manifestPath,
  once = false,
  intervalMs = 30_000,
  cloudConfig,
  fetchImplementation,
  uploadOptions = {},
  onSnapshot = () => undefined,
}) {
  const absoluteManifestPath = resolve(manifestPath);
  for (;;) {
    const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
    await Promise.all(manifest.cases.map((caseRecord) => inspectCase(caseRecord, {
      config: cloudConfig,
      fetchImplementation,
    })));
    manifest.updatedAt = new Date().toISOString();
    const counts = {};
    for (const caseRecord of manifest.cases) {
      counts[caseRecord.status] = (counts[caseRecord.status] ?? 0) + 1;
    }
    counts.whitebox_ready = manifest.cases.filter(
      (caseRecord) => caseRecord.whiteboxOutcome === "passed",
    ).length;
    manifest.summary = counts;
    await writeFile(absoluteManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    const batchManifestS3Uri = joinS3Uri(manifest.outputS3Prefix, "batch-manifest.json");
    await uploadS3File(absoluteManifestPath, batchManifestS3Uri, uploadOptions);
    onSnapshot({ manifest, counts, batchManifestS3Uri });
    const allTerminal = manifest.cases.every((caseRecord) =>
      terminalStatuses.has(caseRecord.status) || caseRecord.status === "submit-failed");
    if (once || allTerminal) return { manifest, counts, batchManifestS3Uri };
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await monitorCloudSceneBatch({
    manifestPath: options.manifest,
    once: options.once,
    intervalMs: Number(options["interval-ms"] ?? 30_000),
    onSnapshot: ({ counts }) => process.stdout.write(
      `WORLDKIT_CLOUD_BATCH ${new Date().toISOString()} ${JSON.stringify(counts)}\n`,
    ),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
