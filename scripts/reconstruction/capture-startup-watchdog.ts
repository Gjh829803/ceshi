import type { FormalCaptureStartupDiagnosticV1 } from "@whitebox-world/runtime-babylon";
import type { Page } from "playwright";
import { isPlainObject } from "lodash-es";

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

// This is Host diagnostic history, not Runtime state, a receipt, or retry authority.
// Match the old recorder's event retention; no strings from Browser/provider errors.
const MAXIMUM_TRACE_ENTRIES = 200;
const STARTUP_STAGES = {
  package: true, module: true, admission: true, bridge: true,
  "host-resolver": true, "module-import": true, "viewer-source-load": true,
  "runtime-create": true, "visual-targets-configure": true, "adapter-mount": true,
  "first-render": true, "page-setup": true,
  "runtime-engine": true, "runtime-scene": true, "runtime-havok": true,
  "runtime-terrain": true, "runtime-native-scene": true, "runtime-subjects": true,
  "runtime-camera": true, "runtime-ready": true,
} satisfies Record<FormalCaptureStartupDiagnosticV1["stage"], true>;
const FAILURE_CODES = {
  failed: "FAILED", stalled: "STALLED", "hard-timeout": "HARD_TIMEOUT", aborted: "ABORTED",
} as const;
type StartupFailureV1 = keyof typeof FAILURE_CODES;
interface CaptureStartupTraceEntryV1 {
  readonly sequence: number;
  readonly elapsedMilliseconds: number;
  readonly type: "probe" | "transient-navigation";
  readonly runtime: FormalCaptureStartupDiagnosticV1 | null;
}
export interface CaptureStartupTraceV1 {
  readonly kind: "capture-startup-trace";
  readonly schemaVersion: 1;
  readonly outcome: StartupFailureV1;
  readonly budget: CaptureStartupBudgetV1;
  readonly droppedEntryCount: number;
  readonly entries: readonly CaptureStartupTraceEntryV1[];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}
function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key));
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}
function projectStartup(value: unknown): FormalCaptureStartupDiagnosticV1 | null {
  if (!isRecord(value) || !["loading", "ready", "error"].includes(value.phase as string) ||
    typeof value.stage !== "string" || !Object.hasOwn(STARTUP_STAGES, value.stage) || !count(value.revision)) return null;
  return Object.freeze({ phase: value.phase as FormalCaptureStartupDiagnosticV1["phase"],
    stage: value.stage as FormalCaptureStartupDiagnosticV1["stage"], revision: value.revision });
}

/** Strict decoding for exported diagnostics only; never gates Browser startup. */
export function parseCaptureStartupTraceV1(value: unknown): CaptureStartupTraceV1 {
  const invalid = (): never => { throw new TypeError("WORLDKIT_CAPTURE_STARTUP_TRACE_INVALID"); };
  if (!isRecord(value) || !exactFields(value, ["kind", "schemaVersion", "outcome", "budget", "droppedEntryCount", "entries"]) ||
    value.kind !== "capture-startup-trace" || value.schemaVersion !== 1 ||
    typeof value.outcome !== "string" || !Object.hasOwn(FAILURE_CODES, value.outcome) ||
    !count(value.droppedEntryCount) || !Array.isArray(value.entries) || value.entries.length > MAXIMUM_TRACE_ENTRIES ||
    (value.droppedEntryCount > 0 && value.entries.length !== MAXIMUM_TRACE_ENTRIES)) return invalid();
  const budget = value.budget;
  if (!isRecord(budget) || !exactFields(budget, ["hardTimeoutMilliseconds", "stallTimeoutMilliseconds", "pollIntervalMilliseconds"]) ||
    !Object.values(budget).every((n) => count(n) && n > 0)) return invalid();
  let priorElapsedMilliseconds = 0;
  const droppedEntryCount = value.droppedEntryCount;
  const entries = Array.from(value.entries, (entry: unknown, index: number): CaptureStartupTraceEntryV1 => {
    if (!isRecord(entry) || !exactFields(entry, ["sequence", "elapsedMilliseconds", "type", "runtime"]) ||
      !count(entry.sequence) || entry.sequence !== droppedEntryCount + index + 1 ||
      typeof entry.elapsedMilliseconds !== "number" || !Number.isFinite(entry.elapsedMilliseconds) ||
      entry.elapsedMilliseconds < priorElapsedMilliseconds || Object.is(entry.elapsedMilliseconds, -0) ||
      (entry.type !== "probe" && entry.type !== "transient-navigation")) return invalid();
    const runtime = entry.runtime === null ? null : projectStartup(entry.runtime);
    if (entry.runtime !== null && (runtime === null || !isRecord(entry.runtime) ||
      !exactFields(entry.runtime, ["phase", "stage", "revision"]))) return invalid();
    if (entry.type === "transient-navigation" && runtime !== null) return invalid();
    priorElapsedMilliseconds = entry.elapsedMilliseconds;
    return Object.freeze({ sequence: entry.sequence, elapsedMilliseconds: entry.elapsedMilliseconds,
      type: entry.type, runtime });
  });
  return Object.freeze({ kind: "capture-startup-trace", schemaVersion: 1,
    outcome: value.outcome as StartupFailureV1, droppedEntryCount, entries: Object.freeze(entries),
    budget: Object.freeze({ hardTimeoutMilliseconds: budget.hardTimeoutMilliseconds as number,
      stallTimeoutMilliseconds: budget.stallTimeoutMilliseconds as number,
      pollIntervalMilliseconds: budget.pollIntervalMilliseconds as number }) });
}

export class CaptureStartupErrorV1 extends Error {
  readonly trace: CaptureStartupTraceV1;
  constructor(trace: CaptureStartupTraceV1) {
    const parsed = parseCaptureStartupTraceV1(trace);
    super(`WORLDKIT_CAPTURE_STARTUP_${FAILURE_CODES[parsed.outcome]}`);
    this.name = "CaptureStartupErrorV1";
    this.trace = parsed;
  }
}

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
  const traceBudget = Object.freeze({ hardTimeoutMilliseconds: budget.hardTimeoutMilliseconds,
    stallTimeoutMilliseconds: budget.stallTimeoutMilliseconds, pollIntervalMilliseconds: budget.pollIntervalMilliseconds });
  const startedAt = performance.now();
  const entries: CaptureStartupTraceEntryV1[] = [];
  let entryCount = 0;
  const record = (type: CaptureStartupTraceEntryV1["type"], runtime?: unknown) => {
    entries.push(Object.freeze({ sequence: ++entryCount,
      elapsedMilliseconds: Math.max(0, performance.now() - startedAt), type,
      runtime: type === "probe" ? projectStartup(runtime) : null }));
    if (entries.length > MAXIMUM_TRACE_ENTRIES) entries.shift();
  };
  const failure = (outcome: StartupFailureV1) => new CaptureStartupErrorV1({
    kind: "capture-startup-trace", schemaVersion: 1, outcome, budget: traceBudget,
    droppedEntryCount: entryCount - entries.length, entries,
  });
  let lastRevision = -1;
  let lastStage: FormalCaptureStartupDiagnosticV1["stage"] | undefined;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectDeadline!: (error: Error) => void;
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const fail = (outcome: StartupFailureV1) => rejectDeadline(failure(outcome));
  const abort = () => fail("aborted");
  const resetStall = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => fail("stalled"), budget.stallTimeoutMilliseconds);
  };
  input.signal.addEventListener("abort", abort, { once: true });
  hardTimer = setTimeout(() => fail("hard-timeout"), budget.hardTimeoutMilliseconds);
  resetStall();
  try {
    if (input.signal.aborted) throw failure("aborted");
    for (;;) {
      let probe: CaptureStartupProbeV1;
      try { probe = await Promise.race([input.probe(), deadline]); }
      catch (error) {
        if (!isTransientCaptureNavigationError(error)) throw error;
        record("transient-navigation");
        resetStall();
        await Promise.race([new Promise<void>((resolve) => { pollTimer = setTimeout(resolve, budget.pollIntervalMilliseconds); }), deadline]);
        continue;
      }
      record("probe", probe.runtime);
      if (probe.isTerminal || probe.runtime?.phase === "error") throw failure("failed");
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
