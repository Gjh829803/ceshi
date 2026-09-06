import { describe, expect, it, vi } from "vitest";
import { installRuntimeFlightRecorderV1, parseRuntimeFlightReportV1, type RuntimeFlightSourceV1 } from "./runtime-flight-recorder.js";

function harness(id = "00000000-0000-4000-8000-000000000001",
  history?: Parameters<typeof installRuntimeFlightRecorderV1>[0]["history"]) {
  let time = 0;
  let callback!: () => void;
  let visible: "visible" | "hidden" = "visible";
  const value = { worldSessionId: "private-world-session", hasRuntimeFailure: false, progressMode: "continuous" as const,
    snapshot: { frame: 0, tick: 0, paused: false,
      performance: { fps: 60, triangles: 100, drawCalls: 4 }, provider: "secret-provider-url" } };
  const source: RuntimeFlightSourceV1 = { read: vi.fn(() => value) };
  const target: Parameters<typeof installRuntimeFlightRecorderV1>[0]["target"] = {
    performance: { now: () => time } as Performance,
    setInterval: vi.fn((fn: TimerHandler, milliseconds?: number) => {
      expect(milliseconds).toBe(1000); callback = fn as () => void; return 1;
    }),
    clearInterval: vi.fn(),
  };
  const controller = installRuntimeFlightRecorderV1({ source, target, visibilityState: () => visible, diagnosticSessionId: id,
    ...(history === undefined ? {} : { history }) });
  return { value, source, target, controller,
    setVisibility: (state: "visible" | "hidden") => { visible = state; },
    step: (milliseconds = 1000) => { time += milliseconds; callback(); },
  };
}
function historyHarness() {
  const saved = new Map<string, string>();
  const storage = { getItem: vi.fn((key: string) => saved.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { saved.set(key, value); }) };
  const events = { window: new EventTarget(), document: new EventTarget() };
  return { saved, storage, events, history: { worldId: "world/a", storage: () => storage, events } };
}
describe("CF-05 read-only Runtime flight observer", () => {
  it("bounds persisted history and prevents an old observer from overwriting its replacement", () => {
    const p = historyHarness();
    const h = harness(undefined, p.history);
    for (let i = 0; i < 305; i++) { h.value.snapshot.frame++; h.value.snapshot.tick++; h.step(); }
    const persisted = JSON.parse([...p.saved.values()][0]!);
    expect(persisted.samples).toHaveLength(300);
    expect(persisted.droppedSampleCount).toBe(5);
    const replacement = installRuntimeFlightRecorderV1({ target: h.target, source: h.source,
      diagnosticSessionId: "00000000-0000-4000-8000-000000000002", visibilityState: () => "visible", history: p.history });
    expect(replacement.bundle().previousSession).toEqual(persisted);
    for (let i = 0; i < 4; i++) replacement.sampleNow();
    const latest = [...p.saved.values()][0];
    expect(JSON.parse(latest!).diagnosticSessionId).toBe("00000000-0000-4000-8000-000000000002");
    h.controller.dispose();
    expect([...p.saved.values()][0]).toBe(latest);
    expect(h.target.__WORLDKIT_RUNTIME_DIAGNOSTICS__!.bundle().currentSession).toEqual(replacement.report());
    replacement.dispose();
  });
  it("persists every five samples and on errors/dispose, recovering only the previous world session", () => {
    const p = historyHarness();
    const h = harness(undefined, p.history);
    for (let i = 1; i < 5; i++) {
      expect(p.storage.setItem).toHaveBeenCalledTimes(0);
      h.value.snapshot.frame++; h.value.snapshot.tick++; h.step();
    }
    expect(p.storage.setItem).toHaveBeenCalledTimes(1);
    expect(parseRuntimeFlightReportV1(JSON.parse([...p.saved.values()][0]!)).samples).toHaveLength(5);
    h.value.hasRuntimeFailure = true; h.step();
    expect(p.storage.setItem).toHaveBeenCalledTimes(2);
    h.controller.dispose();
    expect(p.storage.setItem).toHaveBeenCalledTimes(3);
    const previous = h.controller.report();
    const next = harness("00000000-0000-4000-8000-000000000002", p.history);
    expect(next.controller.bundle()).toEqual({ kind: "runtime-flight-bundle", schemaVersion: 1,
      worldId: "world/a", currentSession: next.controller.report(), previousSession: previous });
    next.value.snapshot.frame++; next.value.snapshot.tick++; next.step();
    expect(next.controller.bundle().previousSession).toEqual(previous);
    expect(Object.isFrozen(next.controller.bundle().previousSession?.samples)).toBe(true);
    expect(JSON.parse(next.target.__WORLDKIT_RUNTIME_DIAGNOSTICS__!.exportBundleJson())).toEqual(next.controller.bundle());
    expect(JSON.parse(next.target.__WORLDKIT_RUNTIME_DIAGNOSTICS__!.exportJson())).toEqual(next.controller.report());
    const other = harness("00000000-0000-4000-8000-000000000003", { ...p.history, worldId: "world/b" });
    expect(other.controller.bundle().previousSession).toBeNull();
    other.controller.dispose();
    expect(p.saved.size).toBe(2);
    expect(next.controller.bundle().previousSession).toEqual(previous);
    next.controller.dispose();
  });
  it("samples visibility changes, flushes browser errors without retaining their contents, and removes listeners", () => {
    const p = historyHarness();
    const h = harness(undefined, p.history);
    h.setVisibility("hidden");
    p.events.document.dispatchEvent(new Event("visibilitychange"));
    expect(h.controller.report().samples.at(-1)?.visibilityState).toBe("hidden");
    for (const type of ["error", "unhandledrejection"]) {
      p.events.window.dispatchEvent(Object.assign(new Event(type), { reason: new Error("private-provider-token") }));
    }
    expect(p.storage.setItem).toHaveBeenCalledTimes(2);
    expect([...p.saved.values()].join()).not.toContain("private-provider-token");
    const report = h.controller.report();
    h.controller.dispose();
    const writes = p.storage.setItem.mock.calls.length;
    p.events.document.dispatchEvent(new Event("visibilitychange"));
    p.events.window.dispatchEvent(new Event("error"));
    h.step(); h.controller.dispose();
    expect(h.controller.report()).toEqual(report);
    expect(p.storage.setItem).toHaveBeenCalledTimes(writes);
  });
  it.each(["getter", "read", "write", "malformed", "oversized"])("keeps memory diagnostics usable when history is %s", (mode) => {
    const p = historyHarness();
    if (mode === "read") p.storage.getItem.mockImplementation(() => { throw new Error("storage denied"); });
    if (mode === "write") p.storage.setItem.mockImplementation(() => { throw new Error("quota exceeded"); });
    if (mode === "malformed") p.storage.getItem.mockReturnValue('{"provider":"secret"}');
    if (mode === "oversized") p.storage.getItem.mockReturnValue("x".repeat(256001));
    const h = harness(undefined, { ...p.history, storage: mode === "getter"
      ? () => { throw new Error("localStorage denied"); } : p.history.storage });
    expect(h.controller.bundle().previousSession).toBeNull();
    expect(() => { for (let i = 0; i < 10; i++) h.step(); h.controller.dispose(); }).not.toThrow();
    expect(h.controller.report().samples).toHaveLength(11);
    expect(JSON.stringify(h.controller.bundle())).not.toMatch(/provider|quota|storage denied/);
  });
  it("cleans its timer if the diagnostic export surface cannot be installed", () => {
    const target: Parameters<typeof installRuntimeFlightRecorderV1>[0]["target"] = {
      performance: { now: () => 0 } as Performance, setInterval: vi.fn(() => 9), clearInterval: vi.fn(),
    };
    Object.defineProperty(target, "__WORLDKIT_RUNTIME_DIAGNOSTICS__", { set() { throw new Error("diagnostic surface unavailable"); } });
    const read = vi.fn(() => { throw new Error("must not read"); });
    expect(() => installRuntimeFlightRecorderV1({ target, source: { read }, visibilityState: () => "visible",
      diagnosticSessionId: "00000000-0000-4000-8000-000000000001" })).toThrow("diagnostic surface unavailable");
    expect(target.clearInterval).toHaveBeenCalledExactlyOnceWith(9);
    expect(read).not.toHaveBeenCalled();
  });
  it("keeps the old interval, retention and progress thresholds with immutable redacted export", () => {
    const h = harness();
    const first = h.controller.report();
    for (let i = 1; i <= 305; i++) {
      h.value.snapshot.frame = i;
      h.value.snapshot.tick = i;
      h.step();
    }
    const report = h.controller.report();
    expect(report.samples).toHaveLength(300);
    expect(report.droppedSampleCount).toBe(6);
    expect(report.samples[0]?.sequence).toBe(7);
    expect(first.samples[0]?.metrics?.tick).toBe(0);
    expect(Object.isFrozen(report.samples.at(-1)?.metrics)).toBe(true);
    const json = h.target.__WORLDKIT_RUNTIME_DIAGNOSTICS__!.exportJson();
    expect(json).not.toMatch(/private-world-session|secret-provider-url|provider/);
    expect(parseRuntimeFlightReportV1(JSON.parse(json))).toEqual(report);
  });
  it("reports stalls, paused/hidden states and existing owner failures without issuing recovery", () => {
    const h = harness();
    const health = () => h.controller.report().samples.at(-1)?.health;
    h.step(); expect(health()).toBe("healthy");
    h.step(); expect(health()).toBe("render-stalled");
    h.value.snapshot.frame++; h.step(); expect(health()).toBe("simulation-stalled");
    h.value.snapshot.paused = true; h.step(); expect(health()).toBe("paused");
    h.value.snapshot.paused = false; h.setVisibility("hidden"); h.step(); expect(health()).toBe("healthy");
    h.setVisibility("visible"); h.step(1750); expect(health()).toBe("main-thread-stalled");
    h.value.snapshot.frame++; h.value.snapshot.tick++; h.value.snapshot.performance.fps = 14;
    h.step(); expect(health()).toBe("degraded-fps");
    h.value.hasRuntimeFailure = true; h.step(); expect(health()).toBe("runtime-failed");
    expect(Object.keys(h.source)).toEqual(["read"]);
  });
  it("separates Reset/world replacement and replay counter regression without mutating owner state", () => {
    const h = harness();
    h.value.snapshot.tick = 120; h.value.snapshot.frame = 60; h.step();
    h.value.worldSessionId = "replacement-world";
    h.value.snapshot.tick = 0; h.value.snapshot.frame = 0;
    const before = structuredClone(h.value);
    h.step();
    expect(h.value).toEqual(before);
    expect(h.controller.report().samples.at(-1)).toMatchObject({ epoch: 1, health: "healthy" });
    h.value.snapshot.tick = 5; h.value.snapshot.frame = 5; h.step();
    h.value.snapshot.tick = 2; h.step();
    expect(h.controller.report().samples.at(-1)?.epoch).toBe(2);
    const other = harness("00000000-0000-4000-8000-000000000002");
    expect(other.controller.report().samples).toHaveLength(1);
    expect(other.controller.report().samples[0]?.epoch).toBe(0);
    h.controller.dispose();
    expect(other.target.__WORLDKIT_RUNTIME_DIAGNOSTICS__).toBeDefined();
    expect(h.target.__WORLDKIT_RUNTIME_DIAGNOSTICS__).toBeUndefined();
    const closed = h.controller.report();
    h.step(); h.controller.sampleNow(); h.controller.dispose();
    expect(h.controller.report()).toEqual(closed);
    expect(h.target.clearInterval).toHaveBeenCalledTimes(1);
  });
  it("contains observation errors and rejects malformed or secret-bearing serialized reports", () => {
    const h = harness();
    vi.mocked(h.source.read).mockImplementationOnce(() => { throw new Error("provider bearer secret"); });
    expect(() => h.step()).not.toThrow();
    const report = h.controller.report();
    expect(report.samples.at(-1)).toMatchObject({ health: "observation-unavailable", metrics: null });
    expect(JSON.stringify(report)).not.toContain("secret");
    for (const value of [
      { ...report, token: "secret" }, { ...report, samples: new Array(1) },
      { ...report, droppedSampleCount: 1 },
      { ...report, samples: [{ ...report.samples[0], sequence: 2 }] },
      { ...report, samples: [{ ...report.samples[0], elapsedMilliseconds: Infinity }] },
      { ...report, samples: [{ ...report.samples[0], metrics: { ...report.samples[0]?.metrics, provider: "secret" } }] },
      { ...report, samples: [{ ...report.samples[0], health: "observation-unavailable", metrics: { provider: "secret" } }] },
    ]) expect(() => parseRuntimeFlightReportV1(value)).toThrow("RUNTIME_FLIGHT_REPORT_INVALID");
  });
});
