export const CODEX_TASK_OUTCOME_PREFIX = "WORLDKIT_CODEX_TASK_OUTCOME ";

const OUTCOMES = new Set([
  "completed",
  "task-timeout",
  "task-rejected",
  "creation-outcome-unknown",
  "request-found",
  "request-missing",
]);
const REQUEST_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;

export class CodexTaskOutcomeError extends Error {
  constructor(outcomeCode, message, options) {
    super(message, options);
    this.name = "CodexTaskOutcomeError";
    this.outcomeCode = outcomeCode;
  }
}

export function parseCodexTaskOutcomeEnvelopeV1(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype) {
    throw new TypeError("Invalid Codex task outcome envelope.");
  }
  const keys = Object.keys(input);
  if (keys.length !== 4 ||
      !["kind", "schemaVersion", "requestId", "outcome"].every((key) =>
        Object.hasOwn(input, key)) ||
      input.kind !== "worldkit-codex-task-outcome" ||
      input.schemaVersion !== 1 ||
      typeof input.requestId !== "string" || !REQUEST_ID.test(input.requestId) ||
      typeof input.outcome !== "string" || !OUTCOMES.has(input.outcome)) {
    throw new TypeError("Invalid Codex task outcome envelope.");
  }
  return Object.freeze({
    kind: "worldkit-codex-task-outcome",
    schemaVersion: 1,
    requestId: input.requestId,
    outcome: input.outcome,
  });
}

export function serializeCodexTaskOutcomeEnvelopeV1(input) {
  return `${CODEX_TASK_OUTCOME_PREFIX}${JSON.stringify(
    parseCodexTaskOutcomeEnvelopeV1(input),
  )}\n`;
}
