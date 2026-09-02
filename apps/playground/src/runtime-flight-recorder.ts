import type {
  PlaygroundRuntimeLoopDiagnosticSnapshotV1,
  PlaygroundRuntimeFailureAttemptV1,
  WorldSnapshot,
} from "./playground-world.js";

export type RuntimeHealthCodeV1 =
  | "healthy"
  | "paused"
  | "degraded-fps"
  | "main-thread-stalled"
  | "runtime-phase-stalled"
  | "render-stalled"
  | "simulation-stalled"
  | "runtime-failed";

export interface RuntimeHealthV1 {
  readonly code: RuntimeHealthCodeV1;
  readonly severity: "info" | "warning" | "error";
  readonly detail: string;
}

export interface RuntimeLongTaskDiagnosticV1 {
  readonly startedAtMonotonicMilliseconds: number;
  readonly durationMilliseconds: number;
}

export interface RuntimeDiagnosticSampleInputV1 {
  readonly capturedAtUnixMilliseconds: number;
  readonly heartbeatDelayMilliseconds: number;
  readonly visibilityState: DocumentVisibilityState;
  readonly domNodeCount: number;
  readonly featureRowCount: number;
  readonly javascriptHeapUsedBytes: number | null;
  readonly snapshot: WorldSnapshot;
  readonly loop: PlaygroundRuntimeLoopDiagnosticSnapshotV1;
  readonly longTask: RuntimeLongTaskDiagnosticV1 | null;
}

export interface RuntimeDiagnosticSampleV1 {
  readonly sequence: number;
  readonly capturedAtUnixMilliseconds: number;
  readonly health: RuntimeHealthV1;
  readonly heartbeatDelayMilliseconds: number;
  readonly visibilityState: DocumentVisibilityState;
  readonly domNodeCount: number;
  readonly featureRowCount: number;
  readonly javascriptHeapUsedBytes: number | null;
  readonly runtime: Readonly<{
    adapter: string;
    frame: number;
    tick: number;
    paused: boolean;
    fps: number;
    triangles: number;
    drawCalls: number;
    player: WorldSnapshot["player"];
    camera: WorldSnapshot["camera"];
  }>;
  readonly loop: PlaygroundRuntimeLoopDiagnosticSnapshotV1;
  readonly longTask: RuntimeLongTaskDiagnosticV1 | null;
}

export interface RuntimeDiagnosticEventV1 {
  readonly sequence: number;
  readonly capturedAtUnixMilliseconds: number;
  readonly severity: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly sampleSequence: number | null;
}

export interface RuntimeDiagnosticReportV1 {
  readonly kind: "worldkit-runtime-diagnostic-report";
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly worldId: string;
  readonly startedAtUnixMilliseconds: number;
  readonly updatedAtUnixMilliseconds: number;
  readonly samples: readonly RuntimeDiagnosticSampleV1[];
  readonly events: readonly RuntimeDiagnosticEventV1[];
}

export interface RuntimeDiagnosticTimelineOptionsV1 {
  readonly sessionId: string;
  readonly worldId: string;
  readonly startedAtUnixMilliseconds: number;
  readonly maximumSamples?: number;
  readonly maximumEvents?: number;
}

const MAIN_THREAD_STALL_MILLISECONDS = 750;
const RUNTIME_PHASE_STALL_MILLISECONDS = 2_000;
const PROGRESS_STALL_MILLISECONDS = 2_000;

function boundedPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("WORLDKIT_RUNTIME_DIAGNOSTIC_LIMIT_INVALID");
  }
  return value;
}

function freezeHealth(
  code: RuntimeHealthCodeV1,
  severity: RuntimeHealthV1["severity"],
  detail: string,
): RuntimeHealthV1 {
  return Object.freeze({ code, severity, detail });
}

function finiteNonNegative(value: number, code: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(code);
}

function immutableLoop(
  value: PlaygroundRuntimeLoopDiagnosticSnapshotV1,
): PlaygroundRuntimeLoopDiagnosticSnapshotV1 {
  const immutableFailureAttempt = (
    attempt: PlaygroundRuntimeFailureAttemptV1,
  ) => Object.freeze({
    ...attempt,
    actions: Object.freeze([...attempt.actions]),
    ...(attempt.controlledSubject === undefined
      ? {}
      : {
          controlledSubject: Object.freeze({
            ...attempt.controlledSubject,
            positionMetersXYZ: Object.freeze([
              ...attempt.controlledSubject.positionMetersXYZ,
            ]) as readonly [number, number, number],
            velocityMetersPerSecondXYZ: Object.freeze([
              ...attempt.controlledSubject.velocityMetersPerSecondXYZ,
            ]) as readonly [number, number, number],
          }),
        }),
  });
  return Object.freeze({
    ...value,
    pressedKeyCodes: Object.freeze([...value.pressedKeyCodes]),
    cameraInputActions: Object.freeze([...value.cameraInputActions]),
    supportObservation: value.supportObservation === null
      ? null
      : Object.freeze({
          ...value.supportObservation,
          rawNormalWorldXYZ: Object.freeze([
            ...value.supportObservation.rawNormalWorldXYZ,
          ]) as readonly [number, number, number],
        }),
    frameLoopDiagnostic: value.frameLoopDiagnostic === null
      ? null
      : Object.freeze({ ...value.frameLoopDiagnostic }),
    runtimeFailure: value.runtimeFailure === null
      ? null
      : Object.freeze({
          initial: value.runtimeFailure.initial === null
            ? null
            : immutableFailureAttempt(value.runtimeFailure.initial),
          recovery: value.runtimeFailure.recovery === null
            ? null
            : immutableFailureAttempt(value.runtimeFailure.recovery),
        }),
  });
}

function healthForSample(input: Readonly<{
  sample: RuntimeDiagnosticSampleInputV1;
  frameUnchangedMilliseconds: number;
  tickUnchangedMilliseconds: number;
}>): RuntimeHealthV1 {
  const { sample } = input;
  if (sample.loop.frameLoopDiagnostic?.severity === "error") {
    return freezeHealth(
      "runtime-failed",
      "error",
      sample.loop.frameLoopDiagnostic.code,
    );
  }
  if (
    sample.visibilityState === "visible" &&
    sample.heartbeatDelayMilliseconds >= MAIN_THREAD_STALL_MILLISECONDS
  ) {
    return freezeHealth(
      "main-thread-stalled",
      "error",
      `${Math.round(sample.heartbeatDelayMilliseconds)} ms heartbeat delay`,
    );
  }
  if (
    sample.loop.phase !== "idle" &&
    sample.loop.phaseAgeMilliseconds >= RUNTIME_PHASE_STALL_MILLISECONDS
  ) {
    return freezeHealth(
      "runtime-phase-stalled",
      "error",
      sample.loop.phase,
    );
  }
  if (sample.snapshot.paused) return freezeHealth("paused", "info", "paused");
  if (sample.visibilityState === "visible") {
    if (input.frameUnchangedMilliseconds >= PROGRESS_STALL_MILLISECONDS) {
      return freezeHealth(
        "render-stalled",
        "error",
        `${Math.round(input.frameUnchangedMilliseconds)} ms without a rendered frame`,
      );
    }
    if (input.tickUnchangedMilliseconds >= PROGRESS_STALL_MILLISECONDS) {
      return freezeHealth(
        "simulation-stalled",
        "error",
        `${Math.round(input.tickUnchangedMilliseconds)} ms without a fixed Tick`,
      );
    }
  }
  if (sample.snapshot.performance.fps > 0 && sample.snapshot.performance.fps < 15) {
    return freezeHealth(
      "degraded-fps",
      "warning",
      `${sample.snapshot.performance.fps} FPS`,
    );
  }
  return freezeHealth("healthy", "info", "healthy");
}

function immutableSample(
  sequence: number,
  input: RuntimeDiagnosticSampleInputV1,
  health: RuntimeHealthV1,
): RuntimeDiagnosticSampleV1 {
  return Object.freeze({
    sequence,
    capturedAtUnixMilliseconds: input.capturedAtUnixMilliseconds,
    health,
    heartbeatDelayMilliseconds: input.heartbeatDelayMilliseconds,
    visibilityState: input.visibilityState,
    domNodeCount: input.domNodeCount,
    featureRowCount: input.featureRowCount,
    javascriptHeapUsedBytes: input.javascriptHeapUsedBytes,
    runtime: Object.freeze({
      adapter: input.snapshot.adapter,
      frame: input.snapshot.frame,
      tick: input.snapshot.tick,
      paused: input.snapshot.paused,
      fps: input.snapshot.performance.fps,
      triangles: input.snapshot.performance.triangles,
      drawCalls: input.snapshot.performance.drawCalls,
      player: Object.freeze({
        ...input.snapshot.player,
        position: Object.freeze([...input.snapshot.player.position]) as readonly [
          number,
          number,
          number,
        ],
      }),
      camera: Object.freeze({
        ...input.snapshot.camera,
        position: Object.freeze([...input.snapshot.camera.position]) as readonly [
          number,
          number,
          number,
        ],
      }),
    }),
    loop: immutableLoop(input.loop),
    longTask: input.longTask === null ? null : Object.freeze({ ...input.longTask }),
  });
}

function immutableEvent(
  value: RuntimeDiagnosticEventV1,
): RuntimeDiagnosticEventV1 {
  return Object.freeze({ ...value });
}

export class RuntimeDiagnosticTimelineV1 {
  readonly #sessionId: string;
  readonly #worldId: string;
  readonly #startedAtUnixMilliseconds: number;
  readonly #maximumSamples: number;
  readonly #maximumEvents: number;
  readonly #samples: RuntimeDiagnosticSampleV1[] = [];
  readonly #events: RuntimeDiagnosticEventV1[] = [];
  #sampleSequence = 0;
  #eventSequence = 0;
  #lastFrame: number | undefined;
  #lastTick: number | undefined;
  #lastFrameChangedAtUnixMilliseconds: number;
  #lastTickChangedAtUnixMilliseconds: number;
  #lastHealthCode: RuntimeHealthCodeV1 | undefined;
  #lastRuntimeFailureFingerprint: string | undefined;
  #lastSupportObservationFingerprint: string | undefined;

  constructor(options: RuntimeDiagnosticTimelineOptionsV1) {
    if (options.sessionId.length === 0 || options.worldId.length === 0) {
      throw new RangeError("WORLDKIT_RUNTIME_DIAGNOSTIC_ID_INVALID");
    }
    finiteNonNegative(
      options.startedAtUnixMilliseconds,
      "WORLDKIT_RUNTIME_DIAGNOSTIC_TIME_INVALID",
    );
    this.#sessionId = options.sessionId;
    this.#worldId = options.worldId;
    this.#startedAtUnixMilliseconds = options.startedAtUnixMilliseconds;
    this.#lastFrameChangedAtUnixMilliseconds = options.startedAtUnixMilliseconds;
    this.#lastTickChangedAtUnixMilliseconds = options.startedAtUnixMilliseconds;
    this.#maximumSamples = boundedPositiveInteger(options.maximumSamples, 300);
    this.#maximumEvents = boundedPositiveInteger(options.maximumEvents, 200);
  }

  record(input: RuntimeDiagnosticSampleInputV1): RuntimeDiagnosticSampleV1 {
    finiteNonNegative(
      input.capturedAtUnixMilliseconds,
      "WORLDKIT_RUNTIME_DIAGNOSTIC_TIME_INVALID",
    );
    finiteNonNegative(
      input.heartbeatDelayMilliseconds,
      "WORLDKIT_RUNTIME_DIAGNOSTIC_HEARTBEAT_INVALID",
    );
    if (
      input.capturedAtUnixMilliseconds < this.#startedAtUnixMilliseconds ||
      (this.#samples.at(-1)?.capturedAtUnixMilliseconds ?? -1) >
        input.capturedAtUnixMilliseconds
    ) throw new RangeError("WORLDKIT_RUNTIME_DIAGNOSTIC_TIME_REVERSED");

    if (this.#lastFrame === undefined || input.snapshot.frame !== this.#lastFrame) {
      this.#lastFrame = input.snapshot.frame;
      this.#lastFrameChangedAtUnixMilliseconds = input.capturedAtUnixMilliseconds;
    }
    if (this.#lastTick === undefined || input.snapshot.tick !== this.#lastTick) {
      this.#lastTick = input.snapshot.tick;
      this.#lastTickChangedAtUnixMilliseconds = input.capturedAtUnixMilliseconds;
    }
    const health = healthForSample({
      sample: input,
      frameUnchangedMilliseconds: input.capturedAtUnixMilliseconds -
        this.#lastFrameChangedAtUnixMilliseconds,
      tickUnchangedMilliseconds: input.capturedAtUnixMilliseconds -
        this.#lastTickChangedAtUnixMilliseconds,
    });
    this.#sampleSequence += 1;
    const sample = immutableSample(this.#sampleSequence, input, health);
    this.#samples.push(sample);
    if (this.#samples.length > this.#maximumSamples) this.#samples.shift();

    if (this.#lastHealthCode !== undefined && this.#lastHealthCode !== health.code) {
      this.recordEvent({
        capturedAtUnixMilliseconds: input.capturedAtUnixMilliseconds,
        severity: health.code === "healthy" ? "info" : health.severity,
        code: health.code === "healthy" ? "runtime-recovered" : health.code,
        message: health.code === "healthy"
          ? `Runtime recovered from ${this.#lastHealthCode}.`
          : health.detail,
        sampleSequence: sample.sequence,
      });
    }
    const runtimeFailure = sample.loop.runtimeFailure;
    const latestFailure = runtimeFailure?.recovery ?? runtimeFailure?.initial;
    if (latestFailure !== null && latestFailure !== undefined) {
      const fingerprint = [
        latestFailure.stage,
        latestFailure.tick,
        latestFailure.errorCode,
        latestFailure.rollbackErrorCode ?? "",
      ].join(":");
      if (fingerprint !== this.#lastRuntimeFailureFingerprint) {
        const recoverySucceeded = runtimeFailure?.recovery === null &&
          sample.loop.frameLoopDiagnostic?.code ===
            "WORLDKIT_RUNTIME_FRAME_RECOVERED";
        this.recordEvent({
          capturedAtUnixMilliseconds: input.capturedAtUnixMilliseconds,
          severity: recoverySucceeded ? "warning" : "error",
          code: recoverySucceeded
            ? "runtime-frame-recovered"
            : "runtime-fixed-input-failed",
          message: [
            `${latestFailure.errorCode}: ${latestFailure.errorMessage}`,
            `stage=${latestFailure.stage} tick=${latestFailure.tick}`,
            `actions=${latestFailure.actions.join(",") || "none"}`,
            ...(latestFailure.rollbackErrorCode === undefined
              ? []
              : [
                  `rollback=${latestFailure.rollbackErrorCode}: ${latestFailure.rollbackErrorMessage ?? "unknown"}`,
                ]),
          ].join(" · "),
          sampleSequence: sample.sequence,
        });
        this.#lastRuntimeFailureFingerprint = fingerprint;
      }
    }
    const supportObservation = sample.loop.supportObservation;
    const observationIsIncoherent = supportObservation !== null &&
      (supportObservation.resolution === "contact-derived-normal" ||
        supportObservation.resolution === "unsupported-provider-incoherent");
    if (observationIsIncoherent) {
      const fingerprint = [
        supportObservation.rawMode,
        supportObservation.rawNormalWorldXYZ.join(","),
        supportObservation.contactCount,
        supportObservation.supportingContactCount,
        supportObservation.upwardSupportDepartureActive,
        supportObservation.resolution,
      ].join(":");
      if (fingerprint !== this.#lastSupportObservationFingerprint) {
        this.recordEvent({
          capturedAtUnixMilliseconds: input.capturedAtUnixMilliseconds,
          severity: "warning",
          code: "provider-support-observation-incoherent",
          message: [
            `tick=${supportObservation.tick}`,
            `rawMode=${supportObservation.rawMode}`,
            `rawNormal=${supportObservation.rawNormalWorldXYZ.join(",")}`,
            `contacts=${supportObservation.contactCount}`,
            `supportingContacts=${supportObservation.supportingContactCount}`,
            `upwardDeparture=${supportObservation.upwardSupportDepartureActive}`,
            `resolution=${supportObservation.resolution}`,
          ].join(" · "),
          sampleSequence: sample.sequence,
        });
      }
      this.#lastSupportObservationFingerprint = fingerprint;
    } else {
      this.#lastSupportObservationFingerprint = undefined;
    }
    this.#lastHealthCode = health.code;
    return sample;
  }

  recordEvent(input: Omit<RuntimeDiagnosticEventV1, "sequence">): void {
    this.#eventSequence += 1;
    this.#events.push(immutableEvent({ sequence: this.#eventSequence, ...input }));
    if (this.#events.length > this.#maximumEvents) this.#events.shift();
  }

  report(): RuntimeDiagnosticReportV1 {
    const updatedAtUnixMilliseconds = this.#samples.at(-1)
      ?.capturedAtUnixMilliseconds ?? this.#startedAtUnixMilliseconds;
    return Object.freeze({
      kind: "worldkit-runtime-diagnostic-report",
      schemaVersion: 1,
      sessionId: this.#sessionId,
      worldId: this.#worldId,
      startedAtUnixMilliseconds: this.#startedAtUnixMilliseconds,
      updatedAtUnixMilliseconds,
      samples: Object.freeze([...this.#samples]),
      events: Object.freeze([...this.#events]),
    });
  }
}

export function parseRuntimeDiagnosticReportV1(
  value: string,
): RuntimeDiagnosticReportV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (
    record.kind !== "worldkit-runtime-diagnostic-report" ||
    record.schemaVersion !== 1 ||
    typeof record.sessionId !== "string" ||
    typeof record.worldId !== "string" ||
    !Number.isFinite(record.startedAtUnixMilliseconds) ||
    !Number.isFinite(record.updatedAtUnixMilliseconds) ||
    !Array.isArray(record.samples) ||
    !Array.isArray(record.events)
  ) return null;
  return parsed as RuntimeDiagnosticReportV1;
}

export interface RuntimeDiagnosticBundleV1 {
  readonly kind: "worldkit-runtime-diagnostic-bundle";
  readonly schemaVersion: 1;
  readonly exportedAtUnixMilliseconds: number;
  readonly sourceRevision: string | null;
  readonly currentSession: RuntimeDiagnosticReportV1;
  readonly previousSession: RuntimeDiagnosticReportV1 | null;
}

export interface RuntimeFlightRecorderStatusV1 {
  readonly latestSample: RuntimeDiagnosticSampleV1;
  readonly eventCount: number;
  readonly previousSessionAvailable: boolean;
}

export interface RuntimeFlightRecorderControllerV1 {
  readonly previousSession: RuntimeDiagnosticReportV1 | null;
  sampleNow(): RuntimeDiagnosticSampleV1;
  report(): RuntimeDiagnosticReportV1;
  bundle(): RuntimeDiagnosticBundleV1;
  summary(): string;
  mark(message?: string): RuntimeDiagnosticSampleV1;
  download(): string;
  copySummary(): Promise<void>;
  dispose(): void;
}

interface RuntimeFlightRecorderSourceV1 {
  snapshot(): WorldSnapshot;
  getRuntimeLoopDiagnosticSnapshot(): PlaygroundRuntimeLoopDiagnosticSnapshotV1;
}

interface PerformanceMemoryV1 {
  readonly usedJSHeapSize: number;
}

function diagnosticStorageKey(worldId: string): string {
  return `worldkit.runtime-diagnostics.v1.${encodeURIComponent(worldId)}`;
}

function diagnosticFilenameSegment(worldId: string): string {
  const sanitized = worldId.replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized.length === 0 ? "worldkit-world" : sanitized;
}

function usedJavascriptHeapBytes(performanceTarget: Performance): number | null {
  const memory = (performanceTarget as Performance & {
    readonly memory?: PerformanceMemoryV1;
  }).memory;
  return memory !== undefined && Number.isFinite(memory.usedJSHeapSize)
    ? memory.usedJSHeapSize
    : null;
}

function safeStorageRead(
  storage: Storage,
  key: string,
): RuntimeDiagnosticReportV1 | null {
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : parseRuntimeDiagnosticReportV1(raw);
  } catch {
    return null;
  }
}

function safeStorageWrite(
  storage: Storage,
  key: string,
  report: RuntimeDiagnosticReportV1,
): void {
  try {
    storage.setItem(key, JSON.stringify(report));
  } catch {
    // Diagnostics must never interfere with Runtime behavior.
  }
}

function errorDescription(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function reportSummary(
  report: RuntimeDiagnosticReportV1,
  previousSessionAvailable: boolean,
): string {
  const sample = report.samples.at(-1);
  if (sample === undefined) return "WorldKit runtime diagnostics: no sample";
  const lastEvents = report.events.slice(-8).map((event) =>
    `${new Date(event.capturedAtUnixMilliseconds).toISOString()} ${event.severity.toUpperCase()} ${event.code}: ${event.message}`
  );
  return [
    `WorldKit Runtime Diagnostics · ${report.worldId}`,
    `session=${report.sessionId}`,
    `health=${sample.health.code} (${sample.health.detail})`,
    `frame=${sample.runtime.frame} tick=${sample.runtime.tick} fps=${sample.runtime.fps}`,
    `phase=${sample.loop.phase} phaseAgeMs=${Math.round(sample.loop.phaseAgeMilliseconds)}`,
    `heartbeatDelayMs=${Math.round(sample.heartbeatDelayMilliseconds)} frameGapMs=${sample.loop.lastAnimationFrameGapMilliseconds?.toFixed(1) ?? "n/a"}`,
    `simulationMs=${sample.loop.lastSimulationDurationMilliseconds?.toFixed(1) ?? "n/a"} renderMs=${sample.loop.lastRenderDurationMilliseconds?.toFixed(1) ?? "n/a"} emitMs=${sample.loop.lastEmitDurationMilliseconds?.toFixed(1) ?? "n/a"}`,
    `player=${sample.runtime.player.position.join(",")} action=${sample.runtime.player.action} grounded=${sample.runtime.player.grounded}`,
    `keys=${sample.loop.pressedKeyCodes.join(",") || "none"} cameraKeys=${sample.loop.cameraInputActions.join(",") || "none"}`,
    `domNodes=${sample.domNodeCount} featureRows=${sample.featureRowCount} heapBytes=${sample.javascriptHeapUsedBytes ?? "unavailable"}`,
    `previousSessionAvailable=${previousSessionAvailable}`,
    ...(sample.loop.runtimeFailure === null
      ? []
      : [
          `runtimeFailure=${JSON.stringify(sample.loop.runtimeFailure)}`,
        ]),
    ...(lastEvents.length === 0 ? ["events=none"] : ["events:", ...lastEvents]),
  ].join("\n");
}

export function installRuntimeFlightRecorderV1(input: Readonly<{
  worldId: string;
  sourceRevision?: string | null;
  source: RuntimeFlightRecorderSourceV1;
  onStatus: (status: RuntimeFlightRecorderStatusV1) => void;
  targetWindow?: Window;
  targetDocument?: Document;
  storage?: Storage;
  performanceTarget?: Performance;
  sampleIntervalMilliseconds?: number;
  persistEverySamples?: number;
}>): RuntimeFlightRecorderControllerV1 {
  const targetWindow = input.targetWindow ?? window;
  const targetDocument = input.targetDocument ?? document;
  const storage = input.storage ?? targetWindow.localStorage;
  const performanceTarget = input.performanceTarget ?? targetWindow.performance;
  const sampleIntervalMilliseconds = input.sampleIntervalMilliseconds ?? 1_000;
  const persistEverySamples = input.persistEverySamples ?? 5;
  if (
    !Number.isSafeInteger(sampleIntervalMilliseconds) ||
    sampleIntervalMilliseconds < 250 ||
    !Number.isSafeInteger(persistEverySamples) ||
    persistEverySamples <= 0
  ) throw new RangeError("WORLDKIT_RUNTIME_FLIGHT_RECORDER_INTERVAL_INVALID");
  if (
    input.sourceRevision !== undefined && input.sourceRevision !== null &&
    !/^[a-f0-9]{40}$/.test(input.sourceRevision)
  ) throw new RangeError("WORLDKIT_RUNTIME_DIAGNOSTIC_SOURCE_REVISION_INVALID");

  const storageKey = diagnosticStorageKey(input.worldId);
  const previousSession = safeStorageRead(storage, storageKey);
  const startedAtUnixMilliseconds = Date.now();
  const timeline = new RuntimeDiagnosticTimelineV1({
    sessionId: crypto.randomUUID(),
    worldId: input.worldId,
    startedAtUnixMilliseconds,
  });
  if (previousSession !== null) {
    timeline.recordEvent({
      capturedAtUnixMilliseconds: startedAtUnixMilliseconds,
      severity: "info",
      code: "previous-session-recovered",
      message: `Recovered ${previousSession.samples.length} samples and ${previousSession.events.length} events from the previous page session.`,
      sampleSequence: null,
    });
  }

  let disposed = false;
  let samplesSincePersist = 0;
  let expectedHeartbeatAtMonotonicMilliseconds =
    performanceTarget.now() + sampleIntervalMilliseconds;
  let pendingHeartbeatDelayMilliseconds = 0;
  let latestLongTask: RuntimeLongTaskDiagnosticV1 | null = null;

  const persist = (): void => {
    safeStorageWrite(storage, storageKey, timeline.report());
    samplesSincePersist = 0;
  };

  const sampleNow = (): RuntimeDiagnosticSampleV1 => {
    const sample = timeline.record({
      capturedAtUnixMilliseconds: Date.now(),
      heartbeatDelayMilliseconds: pendingHeartbeatDelayMilliseconds,
      visibilityState: targetDocument.visibilityState,
      domNodeCount: targetDocument.getElementsByTagName("*").length,
      featureRowCount: targetDocument.querySelectorAll(".feature-item").length,
      javascriptHeapUsedBytes: usedJavascriptHeapBytes(performanceTarget),
      snapshot: input.source.snapshot(),
      loop: input.source.getRuntimeLoopDiagnosticSnapshot(),
      longTask: latestLongTask,
    });
    pendingHeartbeatDelayMilliseconds = 0;
    latestLongTask = null;
    samplesSincePersist += 1;
    const eventCount = timeline.report().events.length;
    if (samplesSincePersist >= persistEverySamples || sample.health.severity === "error") {
      persist();
    }
    input.onStatus({
      latestSample: sample,
      eventCount,
      previousSessionAvailable: previousSession !== null,
    });
    return sample;
  };

  const heartbeatTimer = targetWindow.setInterval(() => {
    const now = performanceTarget.now();
    pendingHeartbeatDelayMilliseconds = Math.max(
      0,
      now - expectedHeartbeatAtMonotonicMilliseconds,
    );
    expectedHeartbeatAtMonotonicMilliseconds = now + sampleIntervalMilliseconds;
    sampleNow();
  }, sampleIntervalMilliseconds);

  const onVisibilityChange = (): void => {
    if (!disposed) sampleNow();
  };
  targetDocument.addEventListener("visibilitychange", onVisibilityChange);

  const recordBrowserError = (code: string, error: unknown): void => {
    timeline.recordEvent({
      capturedAtUnixMilliseconds: Date.now(),
      severity: "error",
      code,
      message: errorDescription(error),
      sampleSequence: timeline.report().samples.at(-1)?.sequence ?? null,
    });
    persist();
  };
  const onError = (event: ErrorEvent): void => {
    recordBrowserError("browser-error", event.error ?? event.message);
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    recordBrowserError("unhandled-rejection", event.reason);
  };
  targetWindow.addEventListener("error", onError);
  targetWindow.addEventListener("unhandledrejection", onUnhandledRejection);

  let longTaskObserver: PerformanceObserver | null = null;
  if (typeof PerformanceObserver !== "undefined") {
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < 200) continue;
          latestLongTask = Object.freeze({
            startedAtMonotonicMilliseconds: entry.startTime,
            durationMilliseconds: entry.duration,
          });
          timeline.recordEvent({
            capturedAtUnixMilliseconds: Date.now(),
            severity: entry.duration >= MAIN_THREAD_STALL_MILLISECONDS
              ? "error"
              : "warning",
            code: "browser-long-task",
            message: `${Math.round(entry.duration)} ms main-thread task`,
            sampleSequence: timeline.report().samples.at(-1)?.sequence ?? null,
          });
        }
      });
      longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch {
      longTaskObserver = null;
    }
  }

  const controller: RuntimeFlightRecorderControllerV1 = {
    previousSession,
    sampleNow,
    report: () => timeline.report(),
    bundle: () => Object.freeze({
      kind: "worldkit-runtime-diagnostic-bundle",
      schemaVersion: 1,
      exportedAtUnixMilliseconds: Date.now(),
      sourceRevision: input.sourceRevision ?? null,
      currentSession: timeline.report(),
      previousSession,
    }),
    summary: () => reportSummary(timeline.report(), previousSession !== null),
    mark: (message = "Manual runtime checkpoint.") => {
      timeline.recordEvent({
        capturedAtUnixMilliseconds: Date.now(),
        severity: "info",
        code: "manual-checkpoint",
        message,
        sampleSequence: timeline.report().samples.at(-1)?.sequence ?? null,
      });
      const sample = sampleNow();
      persist();
      return sample;
    },
    download: () => {
      const filename = `${diagnosticFilenameSegment(input.worldId)}-runtime-diagnostics-${new Date().toISOString().replaceAll(":", "-")}.json`;
      const url = URL.createObjectURL(new Blob(
        [JSON.stringify(controller.bundle(), null, 2)],
        { type: "application/json" },
      ));
      const link = targetDocument.createElement("a");
      link.download = filename;
      link.href = url;
      link.hidden = true;
      targetDocument.body.append(link);
      link.click();
      link.remove();
      targetWindow.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return filename;
    },
    copySummary: async () => {
      await targetWindow.navigator.clipboard.writeText(controller.summary());
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      targetWindow.clearInterval(heartbeatTimer);
      targetDocument.removeEventListener("visibilitychange", onVisibilityChange);
      targetWindow.removeEventListener("error", onError);
      targetWindow.removeEventListener("unhandledrejection", onUnhandledRejection);
      longTaskObserver?.disconnect();
      persist();
    },
  };
  sampleNow();
  return Object.freeze(controller);
}
