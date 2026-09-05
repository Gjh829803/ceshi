import type { FormalCaptureStartupDiagnosticV1 } from "@whitebox-world/runtime-babylon";
import type { Page } from "playwright";

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

/** Legacy capture navigation recovery; actual Host transport closure still aborts its signal. */
export function isTransientCaptureNavigationError(error: unknown): boolean {
  return /Execution context was destroyed|most likely because of a navigation|Target page, context or browser has been closed/i
    .test(error instanceof Error ? error.message : String(error));
}

/** Canonical CLI uses the same startup owner as the Native Host. */
export async function waitForWorldkitCaptureStartupV1(
  page: Pick<Page, "evaluate">,
  budget?: CaptureStartupBudgetV1,
): Promise<void> {
  await waitForCaptureStartupV1({
    signal: new AbortController().signal,
    ...(budget === undefined ? {} : { budget }),
    probe: () => page.evaluate(() => {
      const runtime = window.__WORLDKIT_FORMAL_CAPTURE_STARTUP__;
      return {
        isReady: window.__WORLDKIT__ !== undefined && runtime?.phase === "ready",
        isTerminal: runtime?.phase === "error",
        ...(runtime === undefined ? {} : { runtime }),
      };
    }),
  });
}

/** One outer navigation retry, distinct from the existing visible-frame retries. */
export async function captureWithNavigationRetryV1<T>(
  capture: () => Promise<T>,
  waitForStartup: () => Promise<void>,
): Promise<T> {
  try { return await capture(); }
  catch (error) {
    if (!isTransientCaptureNavigationError(error)) throw error;
    await waitForStartup();
    return capture();
  }
}

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
  let lastStage: FormalCaptureStartupDiagnosticV1["stage"] | undefined;
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
        if (!isTransientCaptureNavigationError(error)) throw error;
        resetStall();
        await Promise.race([new Promise<void>((resolve) => { pollTimer = setTimeout(resolve, budget.pollIntervalMilliseconds); }), deadline]);
        continue;
      }
      if (probe.isTerminal || probe.runtime?.phase === "error") throw new Error("WORLDKIT_CAPTURE_STARTUP_FAILED");
      if (probe.isReady) return;
      const revision = Number.isSafeInteger(probe.runtime?.revision) ? probe.runtime!.revision : lastRevision;
      const stage = probe.runtime?.stage ?? lastStage;
      if (revision > lastRevision || stage !== lastStage) resetStall();
      lastRevision = Math.max(lastRevision, revision);
      lastStage = stage;
      await Promise.race([new Promise<void>((resolve) => { pollTimer = setTimeout(resolve, budget.pollIntervalMilliseconds); }), deadline]);
    }
  } finally {
    clearTimeout(hardTimer); clearTimeout(stallTimer); clearTimeout(pollTimer);
    input.signal.removeEventListener("abort", abort);
  }
}
