import { createHash } from "node:crypto";
import { CodexTaskOutcomeError } from "../lib/codex-task-outcome.mjs";

// Frozen 9e35ab53 Cloud policy. This counts provider tasks, never Scene repair Attempts.
const maximumKeys = Object.freeze({
  planner: "WORLDKIT_LWDP_PLANNER_MAX_ATTEMPTS",
  builder: "WORLDKIT_LWDP_BUILDER_MAX_ATTEMPTS",
  "coding-agent": "WORLDKIT_LWDP_BUILDER_MAX_ATTEMPTS",
  "visual-reconstruction": "WORLDKIT_VISUAL_RECONSTRUCTION_MAX_ATTEMPTS",
  "playthrough-planner": "WORLDKIT_LWDP_EPISODE_CODEX_MAX_ATTEMPTS",
  "episode-visual": "WORLDKIT_LWDP_EPISODE_CODEX_MAX_ATTEMPTS",
  "episode-opening-review": "WORLDKIT_LWDP_EPISODE_CODEX_MAX_ATTEMPTS",
});
const priorKeys = Object.freeze({
  planner: "WORLDKIT_LWDP_PLANNER_PRIOR_ATTEMPTS",
  builder: "WORLDKIT_LWDP_BUILDER_PRIOR_ATTEMPTS",
  "coding-agent": "WORLDKIT_LWDP_BUILDER_PRIOR_ATTEMPTS",
  "visual-reconstruction": "WORLDKIT_LWDP_VISUAL_PRIOR_ATTEMPTS",
});
export const TERMINAL_TASK_RETRY_CLASSES = Object.freeze([
  "auth", "account-model-compatibility", "capacity", "task-timeout", "output-omission", "transport",
]);
const terminalEvidence = new WeakMap();

function integer(value, minimum, maximum, label) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${label} must be an integer in [${minimum}, ${maximum}].`);
  }
  return result;
}

export function resolveTerminalTaskRetryPolicy(stage, explicitAttempts, environment = process.env) {
  const maximumAttempts = integer(explicitAttempts ?? environment[maximumKeys[stage]] ??
    (Object.hasOwn(maximumKeys, stage) ? 3 : 1), 1, 3, "--task-attempts");
  if (!Object.hasOwn(maximumKeys, stage) && maximumAttempts !== 1) {
    throw new Error("Only formal Scene and Episode Codex stages support terminal-failure task attempts.");
  }
  const priorAttempts = integer(environment[priorKeys[stage]] || 0, 0, Number.MAX_SAFE_INTEGER,
    priorKeys[stage] ?? "prior task attempts");
  const baseDelayMs = integer(environment.WORLDKIT_LWDP_STAGE_RETRY_BASE_DELAY_MS ??
    (stage === "visual-reconstruction" ? environment.WORLDKIT_VISUAL_RECONSTRUCTION_RETRY_DELAY_MS : undefined) ??
    30_000, 0, 300_000, "WORLDKIT_LWDP_STAGE_RETRY_BASE_DELAY_MS");
  return Object.freeze({ stage, maximumAttempts, priorAttempts, baseDelayMs });
}

export function terminalTaskRetryDelayMs(policy, failedAttempt) {
  return Math.min(300_000, policy.baseDelayMs * 4 ** Math.max(0, failedAttempt - 1));
}

export function canRetryTerminalTask(policy, attempt, retryClass) {
  if (!TERMINAL_TASK_RETRY_CLASSES.includes(retryClass)) return false;
  const limit = retryClass === "task-timeout" ? Math.min(2, policy.maximumAttempts) : policy.maximumAttempts;
  return policy.priorAttempts + attempt < limit;
}

function classifyTerminalDiagnostics(job, items, deterministicStop) {
  if (deterministicStop || [job, ...items].some((item) =>
    ["cancelled", "stopped"].includes(item?.status))) return null;
  const message = [job, ...items].map((item) => `${item?.error_code ?? ""} ${item?.error ?? ""}`).join("\n");
  if (/BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED/i.test(message)) return null;
  if (/(?:401\s+Unauthorized|token_expired|access token|refresh token|auth_failed)/i.test(message)) return "auth";
  if (/(?:model.{0,160}not supported when using Codex with a ChatGPT account|ChatGPT account.{0,160}(?:does not support|is not eligible for).{0,80}model)/i.test(message)) return "account-model-compatibility";
  if (/Selected model is at capacity|model capacity|No available agent to submit job, please try again later/i.test(message)) return "capacity";
  if (/\b(?:task_timeout|codex_timeout)\b|codex timeout after\s+[0-9]+s/i.test(message)) return "task-timeout";
  if (/missing required outputs:\s*\S/i.test(message)) return "output-omission";
  if (/Ray job FAILED.{0,200}failed to get job supervisor|Job supervisor actor died|actor's node (?:has died|was terminated)|Raylet could not connect to Runtime Env Agent|^\s*timed out\s*$/im.test(message)) return "transport";
  if (/(?:websocket|connection).{0,80}(?:reset|closed|failed|refused)|Remote end closed connection without response|(?:reset|closed) by peer|HTTP\s+(?:429|502|503|504)|ERR_(?:SSL|TLS|NETWORK|SOCKET|CONNECTION)|ssl\/tls alert handshake failure|ECONN(?:RESET|REFUSED|ABORTED)|ENET(?:UNREACH|DOWN)|EHOSTUNREACH/i.test(message)) return "transport";
  return null;
}

// Only the provider adapter calls this after canonical same-ID reconciliation. Text is
// interpreted at that boundary; callers never retry an arbitrary Error's message.
export function confirmedTerminalTaskFailure({ job, itemsPayload, requestId, taskId, outputS3Prefix,
  deterministicStop = false, cause }) {
  const jobId = job?.job_id ?? job?.id;
  if (typeof jobId !== "string" || !jobId || job?.request_id !== requestId ||
      !["failed", "submit_failed", "cancelled", "stopped", "succeeded", "completed"].includes(job?.status) ||
      (job.output_s3_prefix !== undefined && job.output_s3_prefix.replace(/\/$/, "") !== outputS3Prefix.replace(/\/$/, ""))) {
    throw new Error("Cannot classify a task without confirmed terminal request identity.");
  }
  const items = itemsPayload?.items ?? itemsPayload?.data ?? [];
  if (!Array.isArray(items) || items.some((item) => (item?.item_id ?? item?.id) !== taskId)) {
    throw new Error("Terminal task evidence contains a foreign task identity.");
  }
  const retryClass = classifyTerminalDiagnostics(job, items, deterministicStop);
  const outcomeCode = retryClass === "task-timeout" ? "task-timeout" : "task-rejected";
  const evidence = Object.freeze({ requestId, taskId, jobId, outputS3Prefix,
    status: job.status, retryClass, outcomeCode, deterministicStop,
    evidenceSha256: createHash("sha256").update(JSON.stringify({ job, itemsPayload, deterministicStop })).digest("hex") });
  const error = new CodexTaskOutcomeError(outcomeCode,
    `LWDP terminal task failed (${retryClass ?? "non-retryable"}); request ${requestId}, job ${jobId}.`, { cause });
  terminalEvidence.set(error, evidence);
  return error;
}

export function terminalTaskFailureEvidence(error) {
  return terminalEvidence.get(error) ?? null;
}
