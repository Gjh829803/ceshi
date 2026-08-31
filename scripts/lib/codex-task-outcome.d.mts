export type CodexTaskOutcomeCodeV1 =
  | "completed"
  | "task-timeout"
  | "task-rejected"
  | "creation-outcome-unknown"
  | "request-found"
  | "request-missing";

export interface CodexTaskOutcomeEnvelopeV1 {
  readonly kind: "worldkit-codex-task-outcome";
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly outcome: CodexTaskOutcomeCodeV1;
}

export const CODEX_TASK_OUTCOME_PREFIX: "WORLDKIT_CODEX_TASK_OUTCOME ";

export class CodexTaskOutcomeError extends Error {
  readonly outcomeCode: CodexTaskOutcomeCodeV1;
  constructor(
    outcomeCode: CodexTaskOutcomeCodeV1,
    message: string,
    options?: ErrorOptions,
  );
}

export function parseCodexTaskOutcomeEnvelopeV1(
  input: unknown,
): CodexTaskOutcomeEnvelopeV1;

export function serializeCodexTaskOutcomeEnvelopeV1(
  input: unknown,
): string;
