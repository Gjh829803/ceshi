import { execFile } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const terminalStatuses = new Set([
  "succeeded", "completed", "failed", "submit_failed", "cancelled", "stopped",
]);

const defaultJobTimeoutMsByStage = Object.freeze({
  planner: 45 * 60_000,
  builder: 120 * 60_000,
  "coding-agent": 120 * 60_000,
  "visual-reconstruction": 120 * 60_000,
});

const timeoutEnvironmentKeyByStage = Object.freeze({
  planner: "WORLDKIT_LWDP_PLANNER_TIMEOUT_MS",
  builder: "WORLDKIT_LWDP_BUILDER_TIMEOUT_MS",
  "coding-agent": "WORLDKIT_LWDP_BUILDER_TIMEOUT_MS",
  "visual-reconstruction": "WORLDKIT_LWDP_VISUAL_TIMEOUT_MS",
});

function positiveSafeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
}

export function resolveLwdpJobTimeoutMs(stage, environment = process.env) {
  const normalizedStage = String(stage ?? "");
  const stageKey = timeoutEnvironmentKeyByStage[normalizedStage];
  const configured = stageKey === undefined ? undefined : environment[stageKey];
  if (configured !== undefined && configured !== "") {
    return positiveSafeInteger(configured, stageKey);
  }
  const globalConfigured = environment.WORLDKIT_LWDP_JOB_TIMEOUT_MS;
  if (globalConfigured !== undefined && globalConfigured !== "") {
    return positiveSafeInteger(globalConfigured, "WORLDKIT_LWDP_JOB_TIMEOUT_MS");
  }
  return defaultJobTimeoutMsByStage[normalizedStage] ?? 120 * 60_000;
}

export class LwdpJobPendingError extends Error {
  constructor(jobId, timeoutMs, lastJob, { cause, reason = "timeout" } = {}) {
    super(
      reason === "transport"
        ? `LWDP job ${jobId} outcome became unknown after a polling transport failure.`
        : `LWDP job ${jobId} remained non-terminal after ${timeoutMs}ms.`,
      cause === undefined ? undefined : { cause },
    );
    this.name = "LwdpJobPendingError";
    this.code = "LWDP_JOB_PENDING";
    this.jobId = jobId;
    this.timeoutMs = timeoutMs;
    this.lastJob = lastJob;
    this.reason = reason;
  }
}

function errorDiagnosticText(error) {
  const values = [];
  const visited = new Set();
  let current = error;
  while (current !== null && current !== undefined && !visited.has(current)) {
    visited.add(current);
    for (const value of [current?.name, current?.code, current?.message]) {
      if (typeof value === "string" && value.length > 0) values.push(value);
    }
    current = current?.cause;
  }
  if (values.length === 0) values.push(String(error ?? ""));
  return values.join("; ");
}

export function classifyCodexTaskFailureForRetry(error) {
  if (error instanceof LwdpJobPendingError || error?.code === "LWDP_JOB_PENDING") return null;
  const message = errorDiagnosticText(error);
  if (/BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED/i.test(message)) return null;
  if (
    /(?:401\s+Unauthorized|token_expired|access token|refresh token|auth_failed)/i.test(message)
  ) return "auth";
  if (
    /(?:model.{0,160}not supported when using Codex with a ChatGPT account|ChatGPT account.{0,160}(?:does not support|is not eligible for).{0,80}model)/i.test(
      message,
    )
  ) return "account-model-compatibility";
  if (
    /Selected model is at capacity|model capacity|No available agent to submit job, please try again later/i
      .test(message)
  ) return "capacity";
  if (/codex timeout after\s+[0-9]+s/i.test(message)) return "task-timeout";
  if (/missing required outputs:\s*\S/i.test(message)) return "output-omission";
  if (
    /Ray job FAILED.{0,200}failed to get job supervisor|Job supervisor actor died|actor's node (?:has died|was terminated)|Raylet could not connect to Runtime Env Agent|LWDP job did not succeed:\s*timed out/i.test(
      message,
    )
  ) return "transport";
  if (
    /(?:websocket|connection).{0,80}(?:reset|closed|failed|refused)|Remote end closed connection without response|(?:reset|closed) by peer|HTTP\s+(?:429|502|503|504)|ERR_(?:SSL|TLS|NETWORK|SOCKET|CONNECTION)|ssl\/tls alert handshake failure|ECONN(?:RESET|REFUSED|ABORTED)|ENET(?:UNREACH|DOWN)|EHOSTUNREACH/i.test(
      message,
    )
  ) return "transport";
  return null;
}

function parseEnv(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export async function loadLwdpGenerationConfig(environment = null) {
  const envFile = join(projectRoot, ".codex-tmp", "runtime-config", "lwdp.env");
  let fromFile = {};
  try {
    fromFile = parseEnv(await readFile(envFile, "utf8"));
  } catch {
    // Environment-only configuration is supported in CI and containers.
  }
  const explicitEnvironment = environment ?? {};
  const token = explicitEnvironment.LWDP_GENERATION_API_TOKEN ||
    fromFile.LWDP_GENERATION_API_TOKEN || "";
  if (!token) {
    throw new Error(
      "LWDP_GENERATION_API_TOKEN is unavailable. Configure the project-local .codex-tmp/runtime-config/lwdp.env file.",
    );
  }
  return {
    baseUrl: String(explicitEnvironment.LWDP_API_BASE || fromFile.LWDP_API_BASE || "https://lwdp.loopit.me")
      .replace(/\/$/, ""),
    token,
    userId: String(explicitEnvironment.LWDP_USER_ID || fromFile.LWDP_USER_ID || "worldkit-studio"),
  };
}

async function responseJson(response) {
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { message: text.slice(0, 1_000) };
  }
  if (!response.ok) {
    const detail = typeof parsed?.detail === "string"
      ? parsed.detail
      : parsed?.detail === undefined ? "" : JSON.stringify(parsed.detail);
    const message = parsed?.error || parsed?.message || detail || `HTTP ${response.status}`;
    const error = new Error(`LWDP request failed (${response.status}): ${message}`);
    error.status = response.status;
    error.payload = parsed;
    throw error;
  }
  return parsed;
}

export async function lwdpRequest(pathname, {
  config,
  method = "GET",
  body,
  fetchImplementation = fetch,
  maxAttempts = 4,
  retryDelayMs = 1_000,
} = {}) {
  const resolvedConfig = config ?? await loadLwdpGenerationConfig();
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImplementation(`${resolvedConfig.baseUrl}${pathname}`, {
        method,
        headers: {
          "X-LWDP-Token": resolvedConfig.token,
          "X-LWDP-User-Id": resolvedConfig.userId,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (![429, 502, 503, 504].includes(response.status) || attempt === maxAttempts) {
        return responseJson(response);
      }
      lastError = new Error(`LWDP transient HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) throw error;
    }
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, retryDelayMs * (2 ** (attempt - 1))));
  }
  throw lastError ?? new Error("LWDP request failed without a response.");
}

export async function findGenerationJobByRequestId(requestId, {
  pipeline = "codex",
  ...options
} = {}) {
  if (typeof requestId !== "string" || requestId.length === 0) {
    throw new Error("request_id is required for exact LWDP job recovery.");
  }
  const query = pipeline ? `?pipeline=${encodeURIComponent(pipeline)}` : "";
  return lwdpRequest(
    `/api/v1/generation/jobs/by-request-id/${encodeURIComponent(requestId)}${query}`,
    options,
  );
}

export async function submitCodexGenerationJob(payload, {
  recoveryAttempts = 3,
  recoveryDelayMs = 1_000,
  recoveryConfig,
  ...options
} = {}) {
  if (typeof payload?.request_id !== "string" || payload.request_id.length === 0) {
    throw new Error("Generic Codex jobs require a stable request_id.");
  }
  try {
    return await lwdpRequest("/api/v1/generation/codex/jobs", {
      ...options,
      maxAttempts: 1,
      method: "POST",
      body: payload,
    });
  } catch (submissionError) {
    if (
      submissionError?.status !== undefined &&
      ![429, 502, 503, 504].includes(submissionError.status)
    ) {
      throw submissionError;
    }
    let lastLookupError = null;
    for (let attempt = 1; attempt <= recoveryAttempts; attempt += 1) {
      try {
        const recovered = await findGenerationJobByRequestId(payload.request_id, {
          ...options,
          ...(recoveryConfig===undefined?{}:{config:recoveryConfig}),
          pipeline: "codex",
          maxAttempts: 1,
        });
        return { ...recovered, recovered_by_request_id: true };
      } catch (lookupError) {
        lastLookupError = lookupError;
        if (lookupError?.status !== 404 && lookupError?.status !== undefined) break;
      }
      if (attempt < recoveryAttempts) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, recoveryDelayMs));
      }
    }
    const recoveryDetail = lastLookupError instanceof Error
      ? ` Exact request lookup also failed: ${lastLookupError.message}`
      : "";
    throw new Error(
      `LWDP Codex submission outcome is unknown and no existing job was recovered.${recoveryDetail}`,
      { cause: submissionError },
    );
  }
}

export async function submitGenerationJob(payload, options = {}) {
  return lwdpRequest("/api/v1/generation/jobs", {
    ...options,
    method: "POST",
    body: payload,
  });
}

export async function cancelGenerationJob(jobId, options = {}) {
  return lwdpRequest(
    `/api/v1/generation/jobs/${encodeURIComponent(jobId)}/cancel`,
    { ...options, method: "POST" },
  );
}

export function submittedJobId(payload) {
  const jobId = payload?.job?.job_id ?? payload?.job_id;
  if (typeof jobId !== "string" || !jobId) throw new Error("LWDP response omitted job.job_id.");
  return jobId;
}

export async function pollGenerationJob(jobId, {
  config,
  fetchImplementation = fetch,
  intervalMs = Number(process.env.WORLDKIT_LWDP_POLL_INTERVAL_MS || 10_000),
  timeoutMs = resolveLwdpJobTimeoutMs("other"),
  requestMaxAttempts = 4,
  requestRetryDelayMs = 1_000,
  nonTerminalCompletionProbe,
  nonTerminalFailureProbe,
  completionProbeIntervalMs = 60_000,
  onProgress = () => undefined,
} = {}) {
  const startedAt = Date.now();
  let lastSignature = "";
  let lastJob = null;
  let lastCompletionProbeAt = Number.NEGATIVE_INFINITY;
  let lastFailureProbeAt = Number.NEGATIVE_INFINITY;
  for (;;) {
    let payload;
    try {
      payload = await lwdpRequest(`/api/v1/generation/jobs/${encodeURIComponent(jobId)}`, {
        config,
        fetchImplementation,
        maxAttempts: requestMaxAttempts,
        retryDelayMs: requestRetryDelayMs,
      });
    } catch (error) {
      if (classifyCodexTaskFailureForRetry(error) === "transport") {
        throw new LwdpJobPendingError(jobId, timeoutMs, lastJob, {
          cause: error,
          reason: "transport",
        });
      }
      throw error;
    }
    const job = payload?.job ?? payload;
    lastJob = job;
    const signature = JSON.stringify({ status: job?.status, counters: job?.counters, error: job?.error });
    if (signature !== lastSignature) {
      lastSignature = signature;
      onProgress(job);
    }
    if (terminalStatuses.has(String(job?.status))) return job;
    if (
      typeof nonTerminalCompletionProbe === "function" &&
      Date.now() - lastCompletionProbeAt >= Math.max(1_000, completionProbeIntervalMs)
    ) {
      lastCompletionProbeAt = Date.now();
      const deliveryEvidence = await nonTerminalCompletionProbe(job);
      if (deliveryEvidence !== null && deliveryEvidence !== undefined) {
        const recovered = {
          ...job,
          status: "succeeded",
          counters: {
            total: 1,
            queued: 0,
            running: 0,
            succeeded: 1,
            failed: 0,
            skipped: 0,
            rejected: 0,
          },
          delivery_evidence: deliveryEvidence,
        };
        onProgress(recovered);
        return recovered;
      }
    }
    if (
      typeof nonTerminalFailureProbe === "function" &&
      Date.now() - lastFailureProbeAt >= Math.max(1_000, completionProbeIntervalMs)
    ) {
      lastFailureProbeAt = Date.now();
      const failureEvidence = await nonTerminalFailureProbe(job);
      if (failureEvidence !== null && failureEvidence !== undefined) {
        const recovered = {
          ...job,
          status: "failed",
          error: `Ray infrastructure failure: ${failureEvidence.message}`,
          ray_failure_evidence: failureEvidence,
        };
        onProgress(recovered);
        return recovered;
      }
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new LwdpJobPendingError(jobId, timeoutMs, lastJob);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.max(100, intervalMs)));
  }
}

export async function fetchGenerationItems(jobId, options = {}) {
  return lwdpRequest(
    `/api/v1/generation/jobs/${encodeURIComponent(jobId)}/items?size=1000`,
    options,
  );
}

export function assertSuccessfulJob(job, itemsPayload, expectedItemIds = []) {
  const jobStatus = String(job?.status ?? "");
  if (["failed", "submit_failed", "cancelled", "stopped"].includes(jobStatus)) {
    throw new Error(`LWDP job did not succeed: ${job?.error || jobStatus}`);
  }
  const items = itemsPayload?.items ?? itemsPayload?.data ?? [];
  const failed = Array.isArray(items)
    ? items.filter((item) =>
      ["failed", "rejected", "cancelled", "stopped"].includes(String(item?.status)))
    : [];
  if (failed.length > 0) {
    throw new Error(`LWDP task failures: ${failed.map((item) =>
      `${item.item_id || item.id}: ${item.error || item.status}`).join("; ")}`);
  }
  const succeeded = new Set(
    Array.isArray(items)
      ? items.filter((item) => item?.status === "succeeded").map((item) => item.item_id || item.id)
      : [],
  );
  if (expectedItemIds.length > 0 && succeeded.size > 0) {
    const missing = expectedItemIds.filter((id) => !succeeded.has(id));
    if (missing.length > 0) throw new Error(`LWDP job omitted successful tasks: ${missing.join(", ")}`);
  }
}

export function salvageableGenerationItemIds(itemsPayload) {
  const items = itemsPayload?.items ?? itemsPayload?.data ?? [];
  return new Set(
    (Array.isArray(items) ? items : [])
      .filter((item) =>
        item?.status === "failed" &&
        /ray shard timed out before returning/i.test(String(item?.error || "")) &&
        /salvaged generated files from work_dir/i.test(String(item?.error || "")))
      .map((item) => item.item_id || item.id)
      .filter((itemId) => typeof itemId === "string" && itemId.length > 0),
  );
}

function execFilePromise(command, args, { execFileImplementation = execFile, cwd } = {}) {
  return new Promise((resolvePromise, reject) => {
    execFileImplementation(command, args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} failed: ${String(stderr || error.message).trim()}`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

export function assertS3Uri(uri) {
  if (!/^s3:\/\/[a-z0-9][a-z0-9.-]*\/.+/.test(String(uri))) {
    throw new Error(`Invalid S3 URI: ${uri}`);
  }
  return String(uri).replace(/\/$/, "");
}

export function joinS3Uri(prefix, ...parts) {
  return `${assertS3Uri(prefix)}/${parts.map((part) =>
    String(part).replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;
}

export async function uploadS3File(localPath, s3Uri, options = {}) {
  const metadata = await stat(localPath);
  if (!metadata.isFile() || metadata.size === 0) throw new Error(`Upload input is not a non-empty file: ${localPath}`);
  await execFilePromise("aws", ["s3", "cp", "--only-show-errors", localPath, assertS3Uri(s3Uri)], options);
  return { localPath, s3Uri, size: metadata.size };
}

export async function downloadS3FileAtomic(s3Uri, localPath, options = {}) {
  const destination = resolve(localPath);
  await mkdir(dirname(destination), { recursive: true });
  const temporaryPath = join(
    dirname(destination),
    `.${basename(destination)}.lwdp-${process.pid}-${Math.random().toString(16).slice(2)}.part`,
  );
  try {
    await execFilePromise("aws", ["s3", "cp", "--only-show-errors", assertS3Uri(s3Uri), temporaryPath], options);
    const metadata = await stat(temporaryPath);
    if (!metadata.isFile() || metadata.size === 0) throw new Error(`Downloaded output is empty: ${s3Uri}`);
    await rename(temporaryPath, destination);
    return { s3Uri, localPath: destination, size: metadata.size };
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
