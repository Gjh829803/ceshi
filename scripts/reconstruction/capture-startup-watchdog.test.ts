import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForCaptureStartupV1 } from "./capture-startup-watchdog.js";
import { createFormalCaptureStartupReporterV1 } from "../../apps/native-scene-playground/src/formal-capture-startup.js";

afterEach(() => vi.useRealTimers());
describe("CF-02 bounded progress-aware capture startup", () => {
  const budget = { hardTimeoutMilliseconds: 180, stallTimeoutMilliseconds: 45, pollIntervalMilliseconds: 10 };
  const waiting = { isReady: false, isTerminal: false };
  it("waits beyond the old fixed 30s while real stages advance", async () => {
    vi.useFakeTimers();
    let count = 0;
    const run = waitForCaptureStartupV1({ signal: new AbortController().signal, budget,
      probe: async () => ({ ...waiting, isReady: ++count === 9, runtime: { phase: "loading", stage: "package", revision: Math.floor(count / 3) } }) });
    await vi.advanceTimersByTimeAsync(90);
    await expect(run).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["unchanged", "navigation", "hung", "invalid-revision"])("terminates %s at the stall budget", async (kind) => {
    vi.useFakeTimers();
    const run = waitForCaptureStartupV1({ signal: new AbortController().signal, budget, probe: async () => {
      if (kind === "navigation") throw new Error("page.evaluate: Execution context was destroyed, most likely because of a navigation.");
      if (kind === "hung") return new Promise(() => undefined);
      return { ...waiting, runtime: { phase: "loading", stage: "package", revision: kind === "invalid-revision" ? Infinity : 0 } };
    } });
    const assertion = expect(run).rejects.toThrow("STARTUP_STALLED");
    await vi.advanceTimersByTimeAsync(50); await assertion;
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
  it("cancels timers and pending probes when transport closes", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const run = waitForCaptureStartupV1({ signal: controller.signal, budget, probe: () => new Promise(() => undefined) });
    const assertion = expect(run).rejects.toThrow("ABORTED");
    controller.abort(); await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not count repeated/revisited stages as new progress", () => {
    const publish = vi.fn();
    const reporter = createFormalCaptureStartupReporterV1(publish);
    reporter.progress("module"); reporter.progress("package"); reporter.progress("module");
    reporter.finish("error"); reporter.finish("ready"); reporter.progress("bridge");
    expect(publish.mock.calls.map(([v]) => v)).toEqual([
      { phase: "loading", stage: "package", revision: 0 },
      { phase: "loading", stage: "module", revision: 1 },
      { phase: "error", stage: "module", revision: 2 },
    ]);
  });
});
