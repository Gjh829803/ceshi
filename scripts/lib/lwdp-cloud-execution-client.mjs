import {
  loadLwdpGenerationConfig,
  lwdpRequest,
} from "./lwdp-generation-client.mjs";

const TERMINAL_EXECUTION_STATUSES = new Set([
  "succeeded",
  "failed",
  "interrupted",
  "cancelled",
]);

function requiredId(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

export function cloudExecutionRecord(payload) {
  const record = payload?.execution ?? payload;
  if (typeof record?.execution_id !== "string" || record.execution_id.length === 0) {
    throw new Error("LWDP Cloud Execution response omitted execution_id.");
  }
  return record;
}

export async function findCloudExecutionByRequestId(requestId, {
  kind = "scene",
  ...options
} = {}) {
  requiredId(requestId, "request_id");
  requiredId(kind, "kind");
  return lwdpRequest(
    `/api/v1/cloud-executions/by-request-id/${encodeURIComponent(requestId)}` +
      `?kind=${encodeURIComponent(kind)}`,
    options,
  );
}

export async function createCloudExecution(payload, {
  recoveryAttempts = 3,
  recoveryDelayMs = 1_000,
  ...options
} = {}) {
  requiredId(payload?.request_id, "request_id");
  requiredId(payload?.kind, "kind");
  try {
    return await lwdpRequest("/api/v1/cloud-executions", {
      ...options,
      method: "POST",
      body: payload,
      maxAttempts: 1,
    });
  } catch (submissionError) {
    if (
      submissionError?.status !== undefined &&
      ![429, 502, 503, 504].includes(submissionError.status)
    ) throw submissionError;
    let lookupError;
    for (let attempt = 1; attempt <= recoveryAttempts; attempt += 1) {
      try {
        const recovered = await findCloudExecutionByRequestId(payload.request_id, {
          ...options,
          kind: payload.kind,
          maxAttempts: 1,
        });
        return { ...recovered, recovered_by_request_id: true };
      } catch (error) {
        lookupError = error;
        if (error?.status !== 404 && error?.status !== undefined) break;
      }
      if (attempt < recoveryAttempts) {
        await new Promise((resolve) => setTimeout(resolve, recoveryDelayMs));
      }
    }
    const detail = lookupError instanceof Error
      ? ` Exact request lookup failed: ${lookupError.message}`
      : "";
    throw new Error(
      `LWDP Cloud Execution submission outcome is unknown.${detail}`,
      { cause: submissionError },
    );
  }
}

export async function getCloudExecution(executionId, options = {}) {
  return lwdpRequest(
    `/api/v1/cloud-executions/${encodeURIComponent(requiredId(executionId, "execution_id"))}`,
    options,
  );
}

export async function getCloudExecutionStages(executionId, options = {}) {
  return lwdpRequest(
    `/api/v1/cloud-executions/${encodeURIComponent(requiredId(executionId, "execution_id"))}/stages`,
    options,
  );
}

export async function dispatchCloudExecution(executionId, options = {}) {
  return lwdpRequest(
    `/api/v1/cloud-executions/${encodeURIComponent(requiredId(executionId, "execution_id"))}/dispatch`,
    { ...options, method: "POST", body: {} },
  );
}

export async function claimCloudExecutionStage(executionId, stageId, input, options = {}) {
  requiredId(input?.worker_id, "worker_id");
  return lwdpRequest(
    `/api/v1/cloud-executions/${encodeURIComponent(requiredId(executionId, "execution_id"))}` +
      `/stages/${encodeURIComponent(requiredId(stageId, "stage_id"))}/claim`,
    { ...options, method: "POST", body: input },
  );
}

export async function reportCloudExecutionStageProgress(
  executionId,
  stageId,
  input,
  options = {},
) {
  requiredId(input?.lease_id, "lease_id");
  return lwdpRequest(
    `/api/v1/cloud-executions/${encodeURIComponent(requiredId(executionId, "execution_id"))}` +
      `/stages/${encodeURIComponent(requiredId(stageId, "stage_id"))}/progress`,
    { ...options, method: "PUT", body: input },
  );
}

export async function retryCloudExecutionStage(executionId, input, options = {}) {
  requiredId(input?.stage_id, "stage_id");
  requiredId(input?.retry_request_id, "retry_request_id");
  return lwdpRequest(
    `/api/v1/cloud-executions/${encodeURIComponent(requiredId(executionId, "execution_id"))}/retry`,
    { ...options, method: "POST", body: input },
  );
}

export async function cancelCloudExecution(executionId, options = {}) {
  return lwdpRequest(
    `/api/v1/cloud-executions/${encodeURIComponent(requiredId(executionId, "execution_id"))}/cancel`,
    { ...options, method: "POST" },
  );
}

export async function getCloudExecutionCapacity(options = {}) {
  return lwdpRequest("/api/v1/cloud-executions/capacity", options);
}

export async function pollCloudExecution(executionId, {
  config,
  fetchImplementation = fetch,
  intervalMs = Number(process.env.WORLDKIT_CLOUD_EXECUTION_POLL_INTERVAL_MS || 10_000),
  timeoutMs = Number(process.env.WORLDKIT_CLOUD_EXECUTION_TIMEOUT_MS || 6 * 60 * 60_000),
  onProgress = () => undefined,
} = {}) {
  const resolvedConfig = config ?? await loadLwdpGenerationConfig();
  const startedAt = Date.now();
  let lastSignature = "";
  for (;;) {
    const payload = await getCloudExecution(executionId, {
      config: resolvedConfig,
      fetchImplementation,
    });
    const execution = cloudExecutionRecord(payload);
    const signature = JSON.stringify({
      status: execution.status,
      current_stage_id: execution.current_stage_id,
      last_heartbeat: execution.last_heartbeat,
      error: execution.error,
      active_attempts: execution.diagnostics?.active_attempts,
      blocked_stages: execution.diagnostics?.blocked_stages,
    });
    if (signature !== lastSignature) {
      lastSignature = signature;
      await onProgress(execution);
    }
    if (TERMINAL_EXECUTION_STATUSES.has(String(execution.status))) return execution;
    if (Date.now() - startedAt >= timeoutMs) {
      const error = new Error(
        `LWDP Cloud Execution ${executionId} remained non-terminal after ${timeoutMs}ms.`,
      );
      error.code = "LWDP_CLOUD_EXECUTION_PENDING";
      error.execution = execution;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(100, intervalMs)));
  }
}

export function assertSuccessfulCloudExecution(execution) {
  if (execution?.status !== "succeeded") {
    throw new Error(
      `LWDP Cloud Execution ${execution?.execution_id ?? "<unknown>"} ended as ` +
        `${execution?.status ?? "<unknown>"}: ${execution?.error ?? "no error detail"}`,
    );
  }
  return execution;
}
