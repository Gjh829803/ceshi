import type { FormalCaptureStartupDiagnosticV1 } from "@whitebox-world/runtime-babylon";

export interface CaptureStartupProbeV1 {
  readonly isReady: boolean;
  readonly isTerminal: boolean;
  readonly runtime?: FormalCaptureStartupDiagnosticV1;
}
export interface CaptureStartupBudgetV1 {
  readonly hardTimeoutMilliseconds: number;
  readonly stallTimeoutMilliseconds: number;
  readonly pollIntervalMilliseconds: number;
}
// Same budgets as the successful legacy capture startup watchdog.
export const CAPTURE_STARTUP_BUDGET_V1: CaptureStartupBudgetV1 = Object.freeze({
  hardTimeoutMilliseconds: 180_000, stallTimeoutMilliseconds: 45_000, pollIntervalMilliseconds: 250,
});

/** No raw provider messages, URLs, paths, or arbitrary stage strings in diagnostics. */
export async function waitForCaptureStartupV1(input: {
  readonly probe: () => Promise<CaptureStartupProbeV1>;
  readonly budget?: CaptureStartupBudgetV1;
  readonly signal: AbortSignal;
}): Promise<void> {
  const budget = input.budget ?? CAPTURE_STARTUP_BUDGET_V1;
  if (!Object.values(budget).every((n) => Number.isSafeInteger(n) && n > 0)) {
    throw new Error("WORLDKIT_CAPTURE_STARTUP_BUDGET_INVALID");
  }
  let lastRevision = -1;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectDeadline!: (error: Error) => void;
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const fail = (code: string) => rejectDeadline(new Error(`WORLDKIT_CAPTURE_STARTUP_${code}`));
  const abort = () => fail("ABORTED");
  const resetStall = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => fail("STALLED"), budget.stallTimeoutMilliseconds);
  };
  input.signal.addEventListener("abort", abort, { once: true });
  hardTimer = setTimeout(() => fail("HARD_TIMEOUT"), budget.hardTimeoutMilliseconds);
  resetStall();
  try {
    if (input.signal.aborted) throw new Error("WORLDKIT_CAPTURE_STARTUP_ABORTED");
    for (;;) {
      let probe: CaptureStartupProbeV1;
      try { probe = await Promise.race([input.probe(), deadline]); }
      catch (error) {
        // A context replaced during bootstrap is transient, but never progress.
        // Closed Browser/page errors remain terminal and are NOT retried.
        if (!(error instanceof Error) || !/(?:^|:\s)Execution context was destroyed(?:, most likely because of a navigation)?(?:\.|$)/i.test(error.message)) throw error;
        await Promise.race([new Promise<void>((resolve) => { pollTimer = setTimeout(resolve, budget.pollIntervalMilliseconds); }), deadline]);
        continue;
      }
      if (probe.isTerminal || probe.runtime?.phase === "error") throw new Error("WORLDKIT_CAPTURE_STARTUP_FAILED");
      if (probe.isReady) return;
      const revision = probe.runtime?.revision;
      if (Number.isSafeInteger(revision) && revision! >= 0 && revision! <= 12 && revision! > lastRevision) {
        lastRevision = revision!;
        resetStall();
      }
      await Promise.race([new Promise<void>((resolve) => { pollTimer = setTimeout(resolve, budget.pollIntervalMilliseconds); }), deadline]);
    }
  } finally {
    clearTimeout(hardTimer); clearTimeout(stallTimer); clearTimeout(pollTimer);
    input.signal.removeEventListener("abort", abort);
  }
}
