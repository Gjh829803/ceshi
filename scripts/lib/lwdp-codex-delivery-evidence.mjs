import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  downloadS3FileAtomic,
  joinS3Uri,
} from "./lwdp-generation-client.mjs";

const TASK_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const RAY_DASHBOARD_HOST = "ray-cluster-head-svc.ray.svc.cluster.local";
const RAY_INFRASTRUCTURE_FAILURE =
  /Job supervisor actor died|actor's node (?:has died|was terminated)|Raylet could not connect to Runtime Env Agent|failed to get job supervisor|received SIGTERM/i;
const DETERMINISTIC_AGENT_STOP = /\b(BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED)\b/;

function exactSuccessfulCounters(counters) {
  return counters?.total === 1 &&
    counters?.succeeded === 1 &&
    ["queued", "running", "failed", "skipped", "rejected"]
      .every((key) => Number(counters?.[key] ?? 0) === 0);
}

function exactOutputUris(outputS3Prefix, taskId, expectedOutputPaths, outputUris) {
  if (
    !Array.isArray(expectedOutputPaths) || expectedOutputPaths.length < 1 ||
    expectedOutputPaths.some((value) =>
      typeof value !== "string" || !value || value.startsWith("/") ||
      value.split("/").includes("..")) ||
    new Set(expectedOutputPaths).size !== expectedOutputPaths.length ||
    !Array.isArray(outputUris) || outputUris.length !== expectedOutputPaths.length ||
    new Set(outputUris).size !== outputUris.length
  ) return false;
  const expected = expectedOutputPaths.map((outputPath) =>
    joinS3Uri(outputS3Prefix, "tasks", taskId, outputPath));
  return expected.every((uri, index) => outputUris[index] === uri);
}

export async function probeCodexDeliveryEvidence({
  outputS3Prefix,
  taskId,
  expectedOutputPaths,
  stagingRoot,
  downloadImplementation = downloadS3FileAtomic,
}) {
  if (!TASK_ID.test(String(taskId ?? ""))) {
    throw new Error("Codex delivery evidence task id is invalid.");
  }
  const reportPath = path.join(stagingRoot, `${taskId}-delivery-report.json`);
  const manifestPath = path.join(stagingRoot, `${taskId}-task-manifest.jsonl`);
  try {
    await downloadImplementation(
      joinS3Uri(outputS3Prefix, "reports", "codex_delivery_report.json"),
      reportPath,
    );
    await downloadImplementation(
      joinS3Uri(outputS3Prefix, "codex_task_manifest.jsonl"),
      manifestPath,
    );
  } catch {
    return null;
  }
  const [reportMetadata, manifestMetadata] = await Promise.all([
    stat(reportPath),
    stat(manifestPath),
  ]);
  if (
    reportMetadata.size < 2 || reportMetadata.size > 1024 * 1024 ||
    manifestMetadata.size < 2 || manifestMetadata.size > 4 * 1024 * 1024
  ) return null;
  let report;
  let rows;
  try {
    report = JSON.parse(await readFile(reportPath, "utf8"));
    rows = (await readFile(manifestPath, "utf8"))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return null;
  }
  if (!exactSuccessfulCounters(report?.counters) || rows.length !== 1) return null;
  const row = rows[0];
  if (
    row?.id !== taskId || row?.status !== "succeeded" ||
    !exactOutputUris(
      outputS3Prefix,
      taskId,
      expectedOutputPaths,
      row?.metadata?.output_uris,
    )
  ) return null;
  return Object.freeze({
    kind: "worldkit-lwdp-codex-delivery-evidence",
    schemaVersion: 1,
    taskId,
    itemsPayload: Object.freeze({
      items: Object.freeze([Object.freeze({
        item_id: taskId,
        status: "succeeded",
        error: "",
        metadata: Object.freeze({
          output_uris: Object.freeze([...row.metadata.output_uris]),
        }),
      })]),
    }),
  });
}

export async function probeCodexRayInfrastructureFailure(job, {
  fetchImplementation = fetch,
  timeoutMs = 10_000,
} = {}) {
  if (
    typeof job?.ray_dashboard_url !== "string" ||
    typeof job?.ray_submission_id !== "string" ||
    !job.ray_submission_id
  ) return null;
  let dashboard;
  try {
    dashboard = new URL(job.ray_dashboard_url);
  } catch {
    return null;
  }
  if (
    dashboard.protocol !== "http:" ||
    dashboard.hostname !== RAY_DASHBOARD_HOST ||
    !["", "8265"].includes(dashboard.port) ||
    dashboard.pathname !== "/" || dashboard.search || dashboard.hash
  ) return null;
  try {
    const response = await fetchImplementation(
      new URL(`/api/jobs/${encodeURIComponent(job.ray_submission_id)}`, dashboard),
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!response.ok) return null;
    const value = await response.json();
    const message = String(value?.message ?? "");
    if (value?.status !== "FAILED" || !RAY_INFRASTRUCTURE_FAILURE.test(message)) {
      return null;
    }
    return Object.freeze({
      kind: "worldkit-lwdp-ray-infrastructure-failure-evidence",
      schemaVersion: 1,
      submissionId: job.ray_submission_id,
      message: message.slice(0, 4_000),
    });
  } catch {
    return null;
  }
}

export async function probeCodexDeterministicAgentStop({
  itemsPayload,
  outputS3Prefix,
  taskId,
  stagingRoot,
  downloadImplementation = downloadS3FileAtomic,
}) {
  if (!TASK_ID.test(String(taskId ?? ""))) return null;
  const items = itemsPayload?.items ?? itemsPayload?.data ?? [];
  if (!Array.isArray(items) || items.length !== 1) return null;
  const item = items[0];
  if (
    item?.item_id !== taskId || item?.status !== "failed" ||
    !/missing required outputs:/i.test(String(item?.error ?? ""))
  ) return null;
  const expectedLogUri = joinS3Uri(
    outputS3Prefix,
    "tasks",
    taskId,
    "logs",
    "codex_attempt.json",
  );
  if (item?.metadata?.log_uri !== expectedLogUri) return null;
  const logPath = path.join(stagingRoot, `${taskId}-codex-attempt.json`);
  try {
    await downloadImplementation(expectedLogUri, logPath);
    const metadata = await stat(logPath);
    if (metadata.size < 2 || metadata.size > 1024 * 1024) return null;
    const value = JSON.parse(await readFile(logPath, "utf8"));
    if (value?.item_id !== taskId || value?.status !== "missing_outputs") return null;
    const diagnosticText = `${value.stdout_tail ?? ""}\n${value.stderr_tail ?? ""}`;
    const match = DETERMINISTIC_AGENT_STOP.exec(diagnosticText);
    if (!match) return null;
    return Object.freeze({
      kind: "worldkit-lwdp-codex-deterministic-agent-stop",
      schemaVersion: 1,
      taskId,
      code: match[1],
      message: diagnosticText.slice(-4_000),
    });
  } catch {
    return null;
  }
}
