const INFRASTRUCTURE = [
  /\bray\b(?: job| dashboard| cluster| submission| infrastructure)?/i,
  /no available agent to submit/i,
  /selected model is at capacity|model capacity/i,
  /dns|coredns|getaddrinfo|eai_again|name or service not known/i,
  /connection (?:refused|reset|closed)|socket hang up|network is unreachable/i,
  /timed? out|timeout|deadline exceeded/i,
  /\b(?:429|502|503|504)\b/,
  /slowdown|throttl|rate.?limit/i,
  /(?:s3|sts).*?(?:unavailable|timeout|connection|transport)/i,
  /worker[-_ ]lease[-_ ]expired|pod (?:evicted|lost)|node.*?(?:lost|not ready)/i,
];

const RECONCILE = [
  /submission outcome is unknown/i,
  /unknown submission/i,
  /remained non-terminal/i,
  /remote-pending/i,
  /broken (?:connection|pipe).*after submission/i,
];

const CONTENT_REPAIR = [
  /self-check/i,
  /needs[-_ ]repair/i,
  /minimum[-_ ]capture[-_ ]health[-_ ]failed/i,
  /visual[-_ ]review[-_ ]did[-_ ]not[-_ ]pass/i,
  /style[-_ ]variant[-_ ]production[-_ ]incomplete/i,
];

function collectFailureText(value, seen = new Set()) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return [value.name, value.message, collectFailureText(value.cause, seen)]
      .filter(Boolean).join("\n");
  }
  if (typeof value !== "object" || seen.has(value)) return String(value);
  seen.add(value);
  const selected = [
    value.error,
    value.message,
    value.reason,
    value.status,
    value.diagnostics,
    value.stages,
  ];
  return selected.map((item) => collectFailureText(item, seen)).filter(Boolean).join("\n");
}

export function classifyCloudProductionFailure(value) {
  const text = collectFailureText(value);
  if (/cancelled|stopped by (?:the )?user/i.test(text)) {
    return Object.freeze({
      pool: "cancelled",
      retryable: false,
      consumesContentAttempt: false,
      code: "USER_CANCELLED",
    });
  }
  if (RECONCILE.some((pattern) => pattern.test(text))) {
    return Object.freeze({
      pool: "provider-reconcile",
      retryable: true,
      consumesContentAttempt: false,
      code: "REMOTE_OUTCOME_UNKNOWN",
    });
  }
  if (INFRASTRUCTURE.some((pattern) => pattern.test(text))) {
    return Object.freeze({
      pool: "infrastructure",
      retryable: true,
      consumesContentAttempt: false,
      code: "CLOUD_INFRASTRUCTURE_UNAVAILABLE",
    });
  }
  if (CONTENT_REPAIR.some((pattern) => pattern.test(text))) {
    return Object.freeze({
      pool: "content-repair",
      retryable: true,
      consumesContentAttempt: true,
      code: "CONTENT_REPAIR_REQUIRED",
    });
  }
  return Object.freeze({
    pool: "manual-engineering",
    retryable: false,
    consumesContentAttempt: false,
    code: "UNCLASSIFIED_ENGINEERING_FAILURE",
  });
}

export function cloudInfrastructureRetryDelayMs(attempt, {
  baseMs = 30_000,
  maximumMs = 10 * 60_000,
  jitterRatio = 0.2,
  random = Math.random,
} = {}) {
  const normalizedAttempt = Math.max(1, Number.isSafeInteger(attempt) ? attempt : 1);
  const raw = Math.min(maximumMs, baseMs * 2 ** Math.min(8, normalizedAttempt - 1));
  const jitter = raw * Math.max(0, Math.min(1, jitterRatio));
  return Math.max(1_000, Math.round(raw - jitter + random() * jitter * 2));
}

export function evaluateCloudProductionCircuit(samples, {
  minimumSamples,
  openFailureRatio,
} = {}) {
  const admitted = Array.isArray(samples)
    ? samples.filter((sample) => ["succeeded", "infrastructure"].includes(sample))
    : [];
  const failures = admitted.filter((sample) => sample === "infrastructure").length;
  const ratio = admitted.length === 0 ? 0 : failures / admitted.length;
  return Object.freeze({
    sampleCount: admitted.length,
    infrastructureFailures: failures,
    failureRatio: ratio,
    state: admitted.length >= minimumSamples && ratio >= openFailureRatio
      ? "open"
      : "closed",
  });
}
