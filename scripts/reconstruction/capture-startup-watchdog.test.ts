import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAPTURE_STARTUP_BUDGET_V1, captureWithNavigationRetryV1,
  waitForCaptureStartupV1, waitForWorldkitCaptureStartupV1,
  CaptureStartupErrorV1, parseCaptureStartupTraceV1,
} from "./capture-startup-watchdog.js";
import { createFormalCaptureStartupReporterV1 } from "@whitebox-world/runtime-babylon";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("CF-05 startup failure flight evidence", () => {
  const budget = { hardTimeoutMilliseconds: 3000, stallTimeoutMilliseconds: 45, pollIntervalMilliseconds: 10 };
  it("retains bounded immutable redacted progress and navigation evidence without changing deadlines", async () => {
    vi.useFakeTimers();
    let count = 0;
    const run = waitForCaptureStartupV1({ signal: new AbortController().signal, budget,
      probe: async () => {
        count++;
        if (count % 2 === 0) throw new Error("Execution context was destroyed https://provider.invalid/?token=SECRET");
        return { isReady: false, isTerminal: false, runtime: {
          phase: "loading", stage: "package", revision: count, token: "SECRET",
        } as any };
      } });
    const failure = run.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(3000);
    const error = await failure as CaptureStartupErrorV1;
    expect(error).toBeInstanceOf(CaptureStartupErrorV1);
    expect(error.message).toBe("WORLDKIT_CAPTURE_STARTUP_HARD_TIMEOUT");
    expect(error.trace.outcome).toBe("hard-timeout");
    expect(error.trace.entries).toHaveLength(200);
    expect(error.trace.droppedEntryCount).toBe(100);
    expect(error.trace.entries[0]?.sequence).toBe(101);
    expect(error.trace.entries.at(-1)?.type).toBe("transient-navigation");
    expect(JSON.stringify(error.trace)).not.toMatch(/SECRET|provider.invalid|token/);
    expect(Object.isFrozen(error.trace.entries[0]?.runtime)).toBe(true);
    expect(Object.isFrozen(error.trace.entries)).toBe(true);
    expect(parseCaptureStartupTraceV1(JSON.parse(JSON.stringify(error.trace)))).toEqual(error.trace);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps sessions isolated and snapshots probe objects before callers mutate them", async () => {
    vi.useFakeTimers();
    const runtime = { phase: "loading", stage: "module", revision: 7 } as const;
    const first = waitForCaptureStartupV1({ signal: new AbortController().signal, budget,
      probe: async () => ({ isReady: false, isTerminal: false, runtime }) }).catch((e) => e);
    const second = waitForCaptureStartupV1({ signal: new AbortController().signal, budget,
      probe: async () => ({ isReady: false, isTerminal: true }) }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(45);
    const a = await first as CaptureStartupErrorV1;
    const b = await second as CaptureStartupErrorV1;
    (runtime as any).stage = "SECRET";
    expect(a.trace.outcome).toBe("stalled");
    expect(a.trace.entries[0]?.runtime?.stage).toBe("module");
    expect(b.trace.outcome).toBe("failed");
    expect(b.trace.entries).toHaveLength(1);
    expect(b.trace.entries[0]?.runtime).toBeNull();
    for (const bad of [
      { ...a.trace, provider: "SECRET" },
      { ...a.trace, droppedEntryCount: -1 },
      { ...a.trace, entries: [...a.trace.entries, { ...a.trace.entries[0], sequence: 1 }] },
      { ...a.trace, entries: [{ ...a.trace.entries[0], runtime: { ...runtime, stage: "SECRET" } }] },
      { ...a.trace, budget: { ...budget, pollIntervalMilliseconds: 0 } },
      { ...a.trace, entries: new Array(1) },
      { ...a.trace, entries: Array.from({ length: 201 }, () => a.trace.entries[0]) },
      { ...a.trace, entries: [{ ...a.trace.entries[0], elapsedMilliseconds: -1 }] },
      { ...a.trace, entries: [{ ...a.trace.entries[0], runtime: { ...a.trace.entries[0]?.runtime, token: "SECRET" } }] },
    ]) expect(() => parseCaptureStartupTraceV1(bad)).toThrow("CAPTURE_STARTUP_TRACE_INVALID");
  });
  it("retains a hung probe's preceding stage on abort and never records a late result", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let finish!: (value: { isReady: boolean; isTerminal: boolean }) => void;
    let probes = 0;
    const result = waitForCaptureStartupV1({ signal: controller.signal, budget,
      probe: async () => ++probes === 1
        ? { isReady: false, isTerminal: false, runtime: { phase: "loading", stage: "runtime-havok", revision: 5 } }
        : new Promise((resolve) => { finish = resolve; }),
    }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    const error = await result as CaptureStartupErrorV1;
    expect(error.message).toBe("WORLDKIT_CAPTURE_STARTUP_ABORTED");
    expect(error.trace.entries).toHaveLength(1);
    expect(error.trace.entries[0]?.runtime?.stage).toBe("runtime-havok");
    const before = JSON.stringify(error.trace);
    finish({ isReady: true, isTerminal: false });
    await vi.advanceTimersByTimeAsync(100);
    expect(JSON.stringify(error.trace)).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("redacts invalid browser fields without adding a startup rejection or retry", async () => {
    const runtime = { phase: "loading", stage: "https://provider/SECRET", revision: Infinity } as any;
    await expect(waitForCaptureStartupV1({ signal: new AbortController().signal,
      probe: async () => ({ isReady: true, isTerminal: false, runtime }) })).resolves.toBeUndefined();
    const failure = await waitForCaptureStartupV1({ signal: new AbortController().signal,
      probe: async () => ({ isReady: false, isTerminal: true, runtime }) }).catch((e) => e);
    expect(failure.trace.entries[0].runtime).toBeNull();
    const original = new Error("ordinary non-navigation probe error");
    await expect(waitForCaptureStartupV1({ signal: new AbortController().signal,
      probe: async () => { throw original; } })).rejects.toBe(original);
  });
});
describe("CF-02 bounded progress-aware capture startup", () => {
  const budget = { hardTimeoutMilliseconds: 180, stallTimeoutMilliseconds: 45, pollIntervalMilliseconds: 10 };
  const waiting = { isReady: false, isTerminal: false };
  it("waits beyond 30s while real stages advance", async () => {
    vi.useFakeTimers();
    let count = 0;
    const run = waitForCaptureStartupV1({ signal: new AbortController().signal, budget,
      probe: async () => ({ ...waiting, isReady: ++count === 9, runtime: { phase: "loading", stage: "package", revision: Math.floor(count / 3) } }) });
    await vi.advanceTimersByTimeAsync(90);
    await expect(run).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the legacy production budgets", () => {
    expect(CAPTURE_STARTUP_BUDGET_V1).toEqual({
      hardTimeoutMilliseconds: 180_000, stallTimeoutMilliseconds: 45_000, pollIntervalMilliseconds: 250,
    });
  });
  it.each(["unchanged", "hung", "invalid-revision"])("terminates %s at the stall budget", async (kind) => {
    vi.useFakeTimers();
    const run = waitForCaptureStartupV1({ signal: new AbortController().signal, budget, probe: async () => {
      if (kind === "hung") return new Promise(() => undefined);
      return { ...waiting, runtime: { phase: "loading", stage: "package", revision: kind === "invalid-revision" ? Infinity : 0 } };
    } });
    const assertion = expect(run).rejects.toThrow("STARTUP_STALLED");
    await vi.advanceTimersByTimeAsync(50); await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    "page.evaluate: Execution context was destroyed, most likely because of a navigation.",
    "most likely because of a navigation",
    "Target page, context or browser has been closed",
  ])("counts legacy transient navigation as progress without extending the hard deadline: %s", async (message) => {
    vi.useFakeTimers();
    const run = waitForCaptureStartupV1({ signal: new AbortController().signal, budget,
      probe: async () => { throw new Error(message); } });
    const assertion = expect(run).rejects.toThrow("HARD_TIMEOUT");
    await vi.advanceTimersByTimeAsync(180); await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["stage", "revision"])("accepts continuing %s progress without a revision ceiling", async (kind) => {
    vi.useFakeTimers();
    let count = 0;
    const run = waitForCaptureStartupV1({ signal: new AbortController().signal, budget, probe: async () => {
      count++;
      return { ...waiting, isReady: count === 12, runtime: {
        phase: "loading", stage: kind === "stage" && count % 2 === 0 ? "module" : "package",
        revision: kind === "revision" ? 100 + count : 0,
      } };
    } });
    await vi.advanceTimersByTimeAsync(120);
    await expect(run).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retains the hard deadline even with continuing progress", async () => {
    vi.useFakeTimers();
    let revision = 0;
    const run = waitForCaptureStartupV1({ signal: new AbortController().signal,
      budget: { ...budget, pollIntervalMilliseconds: 20 }, probe: async () => ({ ...waiting, runtime: { phase: "loading", stage: "package", revision: revision++ } }) });
    const assertion = expect(run).rejects.toThrow("HARD_TIMEOUT");
    await vi.advanceTimersByTimeAsync(180); await assertion;
  });
  it("fails terminal startup immediately without leaking raw errors", async () => {
    await expect(waitForCaptureStartupV1({ signal: new AbortController().signal, budget, probe: async () => ({ ...waiting, isTerminal: true }) })).rejects.toThrow("STARTUP_FAILED");
  });
  it("does not let an API ready signal override the startup error phase", async () => {
    await expect(waitForCaptureStartupV1({ signal: new AbortController().signal, budget,
      probe: async () => ({ isReady: true, isTerminal: false,
        runtime: { phase: "error", stage: "page-setup", revision: 20 } }),
    })).rejects.toThrow("STARTUP_FAILED");
  });
  it("cancels timers and pending probes when transport closes", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const run = waitForCaptureStartupV1({ signal: controller.signal, budget, probe: () => new Promise(() => undefined) });
    const assertion = expect(run).rejects.toThrow("ABORTED");
    controller.abort(); await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("publishes repeated/revisited work as progress like the legacy reporter, but never reopens terminal startup", () => {
    const publish = vi.fn();
    const reporter = createFormalCaptureStartupReporterV1(publish);
    reporter.progress("module"); reporter.progress("package"); reporter.progress("module");
    reporter.finish("error"); reporter.finish("ready"); reporter.progress("bridge");
    expect(publish.mock.calls.map(([v]) => v)).toEqual([
      { phase: "loading", stage: "package", revision: 0 },
      { phase: "loading", stage: "module", revision: 1 },
      { phase: "loading", stage: "package", revision: 2 },
      { phase: "loading", stage: "module", revision: 3 },
      { phase: "error", stage: "module", revision: 4 },
    ]);
  });
  it("uses the single reporter for Canonical page setup and waits for both API and ready phase", async () => {
    vi.useFakeTimers();
    const browserWindow: Record<string, unknown> = {};
    vi.stubGlobal("window", browserWindow);
    const reporter = createFormalCaptureStartupReporterV1(
      (value) => { browserWindow.__WORLDKIT_FORMAL_CAPTURE_STARTUP__ = value; }, "host-resolver",
    );
    const evaluate = vi.fn(async (callback: () => unknown) => {
      // Playwright callbacks cannot depend on Node closures.
      return new Function(`return (${callback.toString()})();`)();
    });
    let settled = false;
    const run = waitForWorldkitCaptureStartupV1({ evaluate }, budget).then(() => { settled = true; });
    browserWindow.__WORLDKIT__ = {};
    await vi.advanceTimersByTimeAsync(30);
    expect(settled).toBe(false);
    reporter.progress("first-render");
    await vi.advanceTimersByTimeAsync(30);
    expect(settled).toBe(false);
    reporter.finish("ready", "page-setup");
    delete browserWindow.__WORLDKIT__;
    await vi.advanceTimersByTimeAsync(10);
    expect(settled).toBe(false);
    browserWindow.__WORLDKIT__ = {};
    await vi.advanceTimersByTimeAsync(10);
    await run;
    expect(browserWindow.__WORLDKIT_FORMAL_CAPTURE_STARTUP__).toEqual({ phase: "ready", stage: "page-setup", revision: 2 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("waits for startup before the single outer capture retry", async () => {
    const calls: string[] = [];
    const capture = vi.fn(async () => {
      calls.push("capture");
      if (calls.length === 1) throw new Error("Execution context was destroyed");
      return "frame";
    });
    await expect(captureWithNavigationRetryV1(capture, async () => { calls.push("startup"); })).resolves.toBe("frame");
    expect(calls).toEqual(["capture", "startup", "capture"]);
  });
  it("does not recapture if navigation recovery startup fails", async () => {
    const capture = vi.fn(async () => { throw new Error("Execution context was destroyed"); });
    await expect(captureWithNavigationRetryV1(capture, async () => {
      throw new Error("WORLDKIT_CAPTURE_STARTUP_FAILED");
    })).rejects.toThrow("STARTUP_FAILED");
    expect(capture).toHaveBeenCalledTimes(1);
  });
  it.each(["Execution context was destroyed", "WORLDKIT_CAPTURE_VISIBLE_WORLD_MISSING"])("does not add capture retries beyond legacy scope: %s", async (message) => {
    const error = new Error(message);
    const capture = vi.fn(async () => { throw error; });
    const wait = vi.fn(async () => {});
    await expect(captureWithNavigationRetryV1(capture, wait)).rejects.toBe(error);
    const transient = message === "Execution context was destroyed";
    expect(capture).toHaveBeenCalledTimes(transient ? 2 : 1);
    expect(wait).toHaveBeenCalledTimes(transient ? 1 : 0);
  });
});
