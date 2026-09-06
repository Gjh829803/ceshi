import { isPlainObject } from "lodash-es";

const MAXIMUM_SAMPLES = 300;
export const RUNTIME_FLIGHT_REPORT_MAXIMUM_JSON_BYTES_V1 = 256_000;
const INTERVAL_MILLISECONDS = 1000;
const HEALTH = ["healthy", "paused", "degraded-fps", "main-thread-stalled",
  "render-stalled", "simulation-stalled", "runtime-failed", "observation-unavailable"] as const;
type Health = typeof HEALTH[number];
interface Metrics {
  readonly frame: number | null;
  readonly tick: number;
  readonly paused: boolean;
  readonly fps: number | null;
  readonly triangleCount: number | null;
  readonly drawCallCount: number | null;
  readonly progressMode: "continuous" | "on-demand";
}
interface Sample {
  readonly sequence: number;
  /** Observation epoch, not a second Runtime/Reset counter. */
  readonly epoch: number;
  readonly elapsedMilliseconds: number;
  readonly heartbeatDelayMilliseconds: number;
  readonly visibilityState: "visible" | "hidden";
  readonly health: Health;
  readonly metrics: Metrics | null;
}
export interface RuntimeFlightReportV1 {
  readonly kind: "runtime-flight-report";
  readonly schemaVersion: 1;
  readonly diagnosticSessionId: string;
  readonly droppedSampleCount: number;
  readonly samples: readonly Sample[];
}
export interface RuntimeFlightBundleV1 {
  readonly kind: "runtime-flight-bundle";
  readonly schemaVersion: 1;
  readonly worldId: string | null;
  readonly currentSession: RuntimeFlightReportV1;
  readonly previousSession: RuntimeFlightReportV1 | null;
}
export interface RuntimeFlightSourceV1 {
  read(): Readonly<{
    worldSessionId: string;
    snapshot: Readonly<{ frame: number | null; tick: number; paused: boolean;
      performance: Readonly<{ fps: number | null; triangles: number | null; drawCalls: number | null }> }>;
    hasRuntimeFailure: boolean;
    progressMode: Metrics["progressMode"];
  }>;
}
interface RuntimeFlightReaderV1 {
  report(): RuntimeFlightReportV1;
  bundle(): RuntimeFlightBundleV1;
  exportJson(): string;
  exportBundleJson(): string;
}
interface RuntimeFlightHistoryV1 {
  readonly worldId: string;
  readonly storage: () => Pick<Storage, "getItem" | "setItem">;
  readonly events?: Readonly<{
    window: Pick<EventTarget, "addEventListener" | "removeEventListener">;
    document: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  }>;
}
declare global {
  interface Window { __WORLDKIT_RUNTIME_DIAGNOSTICS__?: RuntimeFlightReaderV1 }
}
function record(value: unknown): value is Record<string, unknown> { return isPlainObject(value); }
function fields(value: Record<string, unknown>, names: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === names.length && keys.every((key) => names.includes(key));
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && !Object.is(value, -0);
}
function count(value: unknown): value is number { return finite(value) && Number.isSafeInteger(value); }
function metrics(value: unknown): Metrics | null {
  if (!record(value) || !fields(value, ["frame", "tick", "paused", "fps", "triangleCount", "drawCallCount", "progressMode"]) ||
    (value.frame !== null && !count(value.frame)) || !count(value.tick) || typeof value.paused !== "boolean" ||
    (value.fps !== null && !finite(value.fps)) || (value.triangleCount !== null && !count(value.triangleCount)) ||
    (value.drawCallCount !== null && !count(value.drawCallCount)) ||
    (value.progressMode !== "continuous" && value.progressMode !== "on-demand")) return null;
  return Object.freeze({ frame: value.frame, tick: value.tick, paused: value.paused,
    fps: value.fps, triangleCount: value.triangleCount, drawCallCount: value.drawCallCount, progressMode: value.progressMode });
}

/** Closed exported diagnostics, never a Runtime/Capture admission parser. */
export function parseRuntimeFlightReportV1(value: unknown): RuntimeFlightReportV1 {
  const invalid = (): never => { throw new TypeError("WORLDKIT_RUNTIME_FLIGHT_REPORT_INVALID"); };
  if (!record(value) || !fields(value, ["kind", "schemaVersion", "diagnosticSessionId", "droppedSampleCount", "samples"]) ||
    value.kind !== "runtime-flight-report" || value.schemaVersion !== 1 ||
    typeof value.diagnosticSessionId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.diagnosticSessionId) ||
    !count(value.droppedSampleCount) || !Array.isArray(value.samples) || value.samples.length > MAXIMUM_SAMPLES ||
    (value.droppedSampleCount > 0 && value.samples.length !== MAXIMUM_SAMPLES)) return invalid();
  const droppedSampleCount = value.droppedSampleCount;
  let previousElapsed = 0;
  let previousEpoch = 0;
  const samples = Array.from(value.samples, (sample: unknown, index: number): Sample => {
    if (!record(sample) || !fields(sample, ["sequence", "epoch", "elapsedMilliseconds", "heartbeatDelayMilliseconds", "visibilityState", "health", "metrics"]) ||
      sample.sequence !== droppedSampleCount + index + 1 || !count(sample.sequence) ||
      !count(sample.epoch) || sample.epoch < previousEpoch ||
      !finite(sample.elapsedMilliseconds) || sample.elapsedMilliseconds < previousElapsed ||
      !finite(sample.heartbeatDelayMilliseconds) ||
      (sample.visibilityState !== "visible" && sample.visibilityState !== "hidden") ||
      !HEALTH.includes(sample.health as Health)) return invalid();
    const projected = sample.metrics === null ? null : metrics(sample.metrics);
    if (sample.metrics !== null && projected === null) return invalid();
    if ((projected === null) !== (sample.health === "observation-unavailable")) return invalid();
    previousElapsed = sample.elapsedMilliseconds;
    previousEpoch = sample.epoch;
    return Object.freeze({ sequence: sample.sequence, epoch: sample.epoch,
      elapsedMilliseconds: sample.elapsedMilliseconds, heartbeatDelayMilliseconds: sample.heartbeatDelayMilliseconds,
      visibilityState: sample.visibilityState, health: sample.health as Health, metrics: projected });
  });
  return Object.freeze({ kind: "runtime-flight-report", schemaVersion: 1,
    diagnosticSessionId: value.diagnosticSessionId, droppedSampleCount, samples: Object.freeze(samples) });
}

/** Read-only observer. No Runtime mutation port, render callback or recovery API. */
export function installRuntimeFlightRecorderV1(input: {
  readonly source: RuntimeFlightSourceV1;
  readonly target: Pick<Window, "setInterval" | "clearInterval" | "performance" | "__WORLDKIT_RUNTIME_DIAGNOSTICS__">;
  readonly visibilityState: () => "visible" | "hidden";
  readonly diagnosticSessionId: string;
  readonly history?: RuntimeFlightHistoryV1;
}) {
  const samples: Sample[] = [];
  const diagnosticSessionId = input.diagnosticSessionId;
  // Validate the Host-generated ID before installing any timers or global API.
  parseRuntimeFlightReportV1({ kind: "runtime-flight-report", schemaVersion: 1,
    diagnosticSessionId, droppedSampleCount: 0, samples: [] });
  // Keep one previous report per world, not a growing list of page sessions.
  // Storage is optional; even accessing localStorage can throw in a Browser.
  let storage: Pick<Storage, "getItem" | "setItem"> | undefined;
  let storageKey: string | undefined;
  let previousSession: RuntimeFlightReportV1 | null = null;
  try {
    if (input.history !== undefined) {
      storageKey = `worldkit.runtime-flight.v1.${encodeURIComponent(input.history.worldId)}`;
      storage = input.history.storage();
      const raw = storage.getItem(storageKey);
      if (raw !== null && raw.length <= RUNTIME_FLIGHT_REPORT_MAXIMUM_JSON_BYTES_V1 &&
        new TextEncoder().encode(raw).byteLength <= RUNTIME_FLIGHT_REPORT_MAXIMUM_JSON_BYTES_V1) {
        previousSession = parseRuntimeFlightReportV1(JSON.parse(raw));
      }
    }
  } catch { /* Unavailable or stale diagnostics never affect Runtime startup. */ }
  const now = () => input.target.performance.now();
  const start = now();
  let nextHeartbeat = start + INTERVAL_MILLISECONDS;
  let sequence = 0;
  let epoch = 0;
  let previous: Metrics | undefined;
  let worldSessionId: string | undefined;
  let frameChangedAt = start;
  let tickChangedAt = start;
  let disposed = false;
  let samplesSincePersist = 0;
  const removeListeners: (() => void)[] = [];
  const persist = (): void => {
    try {
      // A replaced observer must not overwrite the new observer's history.
      if (storage === undefined || storageKey === undefined || input.target.__WORLDKIT_RUNTIME_DIAGNOSTICS__ !== reader) return;
      storage.setItem(storageKey, JSON.stringify(report()));
    } catch { /* Quota/security/storage errors are advisory only. */ }
    finally { samplesSincePersist = 0; }
  };
  const sampleNow = (heartbeatDelayMilliseconds = 0): void => {
    if (disposed) return;
    const time = now();
    let projected: Metrics | null = null;
    let health: Health = "observation-unavailable";
    let visibilityState: "visible" | "hidden" = "hidden";
    try {
      visibilityState = input.visibilityState();
      const value = input.source.read();
      const snapshot = value.snapshot;
      projected = metrics({ frame: snapshot.frame, tick: snapshot.tick, paused: snapshot.paused,
        fps: snapshot.performance.fps, triangleCount: snapshot.performance.triangles,
        drawCallCount: snapshot.performance.drawCalls, progressMode: value.progressMode });
      if (projected !== null) {
        if (worldSessionId !== undefined && (worldSessionId !== value.worldSessionId ||
          (previous !== undefined && (projected.tick < previous.tick ||
            (projected.frame !== null && previous.frame !== null && projected.frame < previous.frame))))) {
          epoch++;
          previous = undefined;
        }
        worldSessionId = value.worldSessionId;
        if (previous === undefined || projected.frame !== previous.frame) frameChangedAt = time;
        if (previous === undefined || projected.tick !== previous.tick) tickChangedAt = time;
        health = value.hasRuntimeFailure ? "runtime-failed"
          : visibilityState === "visible" && heartbeatDelayMilliseconds >= 750 ? "main-thread-stalled"
          : projected.paused ? "paused"
          : projected.progressMode === "continuous" && projected.frame !== null && visibilityState === "visible" && time - frameChangedAt >= 2000 ? "render-stalled"
          : projected.progressMode === "continuous" && visibilityState === "visible" && time - tickChangedAt >= 2000 ? "simulation-stalled"
          : projected.fps !== null && projected.fps > 0 && projected.fps < 15 ? "degraded-fps" : "healthy";
        previous = projected;
      }
    } catch {
      // Raw errors, provider details, entity names and positions are not exported.
      projected = null;
    }
    samples.push(Object.freeze({ sequence: ++sequence, epoch,
      elapsedMilliseconds: Math.max(0, time - start), heartbeatDelayMilliseconds,
      visibilityState, health, metrics: projected }));
    if (samples.length > MAXIMUM_SAMPLES) samples.shift();
    samplesSincePersist++;
    if (samplesSincePersist >= 5 || health === "runtime-failed" || health === "main-thread-stalled" ||
      health === "render-stalled" || health === "simulation-stalled") persist();
  };
  const report = (): RuntimeFlightReportV1 => Object.freeze({ kind: "runtime-flight-report", schemaVersion: 1,
    diagnosticSessionId, droppedSampleCount: sequence - samples.length,
    samples: Object.freeze([...samples]) });
  const bundle = (): RuntimeFlightBundleV1 => Object.freeze({ kind: "runtime-flight-bundle", schemaVersion: 1,
    worldId: input.history?.worldId ?? null, currentSession: report(), previousSession });
  const reader = Object.freeze({ report, bundle, exportJson: () => JSON.stringify(report()),
    exportBundleJson: () => JSON.stringify(bundle()) });
  const timer = input.target.setInterval(() => {
    const time = now();
    sampleNow(Math.max(0, time - nextHeartbeat));
    nextHeartbeat = time + INTERVAL_MILLISECONDS;
  }, INTERVAL_MILLISECONDS);
  try {
    input.target.__WORLDKIT_RUNTIME_DIAGNOSTICS__ = reader;
    const events = input.history?.events;
    if (events !== undefined) {
      const onVisibility = () => { if (!disposed) sampleNow(); };
      const onBrowserError = () => { if (!disposed) persist(); };
      for (const [target, type, callback] of [
        [events.document, "visibilitychange", onVisibility],
        [events.window, "error", onBrowserError],
        [events.window, "unhandledrejection", onBrowserError],
      ] as const) {
        const remove = () => { try { target.removeEventListener(type, callback); } catch { /* advisory */ } };
        try { target.addEventListener(type, callback); removeListeners.push(remove); }
        catch { remove(); }
      }
    }
    sampleNow();
  } catch (error) {
    disposed = true;
    input.target.clearInterval(timer);
    for (const remove of removeListeners) remove();
    throw error;
  }
  return Object.freeze({ ...reader, sampleNow: () => sampleNow(),
    mark() {
      if (!disposed) { sampleNow(); persist(); }
      return report();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      input.target.clearInterval(timer);
      for (const remove of removeListeners) remove();
      persist();
      if (input.target.__WORLDKIT_RUNTIME_DIAGNOSTICS__ === reader) delete input.target.__WORLDKIT_RUNTIME_DIAGNOSTICS__;
    },
  });
}
