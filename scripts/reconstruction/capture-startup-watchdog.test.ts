import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAPTURE_STARTUP_BUDGET_V1, captureWithNavigationRetryV1,
  waitForCaptureStartupV1, waitForWorldkitCaptureStartupV1,
} from "./capture-startup-watchdog.js";
import { createFormalCaptureStartupReporterV1 } from "@whitebox-world/runtime-babylon";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
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
