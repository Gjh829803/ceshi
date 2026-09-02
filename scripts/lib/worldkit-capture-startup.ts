export interface CaptureStartupProbeV1 {
  readonly hasBrowserApi: boolean;
  readonly phase?: "loading" | "ready" | "error";
  readonly stage?: string;
  readonly revision?: number;
  readonly errorMessage?: string;
}

export interface CaptureStartupWatchdogStateV1 {
  readonly startedAtMilliseconds: number;
  readonly lastProgressAtMilliseconds: number;
  readonly lastRevision: number;
  readonly lastStage: string;
}

export type CaptureStartupDecisionV1 = Readonly<{
  status: "waiting" | "ready" | "failed" | "stalled" | "hard-timeout";
  state: CaptureStartupWatchdogStateV1;
  message?: string;
}>;

export function initialCaptureStartupWatchdogV1(
  nowMilliseconds: number,
): CaptureStartupWatchdogStateV1 {
  return Object.freeze({
    startedAtMilliseconds: nowMilliseconds,
    lastProgressAtMilliseconds: nowMilliseconds,
    lastRevision: -1,
    lastStage: "unknown",
  });
}

export function observeCaptureStartupV1(
  state: CaptureStartupWatchdogStateV1,
  probe: CaptureStartupProbeV1,
  nowMilliseconds: number,
  {
    hardTimeoutMilliseconds = 180_000,
    stallTimeoutMilliseconds = 45_000,
  } = {},
): CaptureStartupDecisionV1 {
  const revision = Number.isSafeInteger(probe.revision) ? probe.revision! : state.lastRevision;
  const stage = probe.stage ?? state.lastStage;
  const progressed = revision > state.lastRevision || stage !== state.lastStage;
  const next = Object.freeze({
    ...state,
    lastProgressAtMilliseconds: progressed ? nowMilliseconds : state.lastProgressAtMilliseconds,
    lastRevision: Math.max(state.lastRevision, revision),
    lastStage: stage,
  });
  if (probe.phase === "error") {
    return Object.freeze({
      status: "failed",
      state: next,
      message: `${stage}: ${probe.errorMessage ?? "Runtime startup failed."}`,
    });
  }
  if (probe.hasBrowserApi && probe.phase === "ready") {
    return Object.freeze({ status: "ready", state: next });
  }
  if (nowMilliseconds - state.startedAtMilliseconds >= hardTimeoutMilliseconds) {
    return Object.freeze({
      status: "hard-timeout",
      state: next,
      message: `Runtime startup exceeded ${hardTimeoutMilliseconds}ms at ${stage}.`,
    });
  }
  if (nowMilliseconds - next.lastProgressAtMilliseconds >= stallTimeoutMilliseconds) {
    return Object.freeze({
      status: "stalled",
      state: next,
      message: `Runtime startup made no progress for ${stallTimeoutMilliseconds}ms at ${stage}.`,
    });
  }
  return Object.freeze({ status: "waiting", state: next });
}

export function isTransientCaptureNavigationError(error: unknown): boolean {
  return /Execution context was destroyed|most likely because of a navigation|Target page, context or browser has been closed/i
    .test(error instanceof Error ? error.message : String(error));
}
