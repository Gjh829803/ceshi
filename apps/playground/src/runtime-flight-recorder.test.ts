import { describe, expect, it } from "vitest";

import {
  RuntimeDiagnosticTimelineV1,
  parseRuntimeDiagnosticReportV1,
  type RuntimeDiagnosticSampleInputV1,
} from "./runtime-flight-recorder.js";

function sample(
  capturedAtUnixMilliseconds: number,
  frame: number,
  tick: number,
  overrides: Partial<RuntimeDiagnosticSampleInputV1> = {},
): RuntimeDiagnosticSampleInputV1 {
  return {
    capturedAtUnixMilliseconds,
    heartbeatDelayMilliseconds: 0,
    visibilityState: "visible",
    domNodeCount: 900,
    featureRowCount: 14,
    javascriptHeapUsedBytes: 64_000_000,
    snapshot: {
      adapter: "babylon-havok/test-world",
      frame,
      tick,
      paused: false,
      player: {
        entityId: "player",
        action: "idle",
        grounded: true,
        position: [0, 0.5, 0],
        rotationY: 0,
      },
      camera: {
        position: [0, 2, 5],
        yaw: 0,
        pitch: 0.18,
        distance: 5,
      },
      features: [],
      performance: { fps: 60, triangles: 100, drawCalls: 10 },
    },
    loop: {
      phase: "idle",
      phaseAgeMilliseconds: 0,
      animationFrameRequested: true,
      animationPending: false,
      lastAnimationFrameGapMilliseconds: 16.7,
      lastFixedTickBatchSize: 1,
      lastSimulationDurationMilliseconds: 2,
      lastRenderDurationMilliseconds: 4,
      lastEmitDurationMilliseconds: 1,
      pressedKeyCodes: [],
      cameraInputActions: [],
      captureReserved: false,
      supportObservation: null,
      frameLoopDiagnostic: null,
      runtimeFailure: null,
    },
    longTask: null,
    ...overrides,
  };
}

describe("RuntimeDiagnosticTimelineV1", () => {
  it("distinguishes a main-thread delay, Runtime simulation stall, and render stall", () => {
    const mainThread = new RuntimeDiagnosticTimelineV1({
      sessionId: "session-main-thread",
      worldId: "test-world",
      startedAtUnixMilliseconds: 1_000,
    });
    expect(mainThread.record(sample(1_000, 1, 1)).health.code).toBe("healthy");
    expect(mainThread.record(sample(2_500, 2, 2, {
      heartbeatDelayMilliseconds: 1_200,
    })).health.code).toBe("main-thread-stalled");

    const simulation = new RuntimeDiagnosticTimelineV1({
      sessionId: "session-simulation",
      worldId: "test-world",
      startedAtUnixMilliseconds: 1_000,
    });
    simulation.record(sample(1_000, 1, 10));
    simulation.record(sample(2_100, 2, 10));
    expect(simulation.record(sample(3_200, 3, 10)).health.code)
      .toBe("simulation-stalled");

    const render = new RuntimeDiagnosticTimelineV1({
      sessionId: "session-render",
      worldId: "test-world",
      startedAtUnixMilliseconds: 1_000,
    });
    render.record(sample(1_000, 5, 5));
    render.record(sample(2_100, 5, 5));
    expect(render.record(sample(3_200, 5, 5)).health.code)
      .toBe("render-stalled");
  });

  it("reports an in-flight Runtime phase before generic tick/render symptoms", () => {
    const timeline = new RuntimeDiagnosticTimelineV1({
      sessionId: "session-runtime",
      worldId: "test-world",
      startedAtUnixMilliseconds: 1_000,
    });
    timeline.record(sample(1_000, 1, 1));
    const result = timeline.record(sample(3_500, 1, 1, {
      loop: {
        ...sample(3_500, 1, 1).loop,
        phase: "simulation",
        phaseAgeMilliseconds: 2_500,
        animationPending: true,
      },
    }));
    expect(result.health).toMatchObject({
      code: "runtime-phase-stalled",
      severity: "error",
      detail: "simulation",
    });
  });

  it("does not report background-tab timer throttling as a main-thread stall", () => {
    const timeline = new RuntimeDiagnosticTimelineV1({
      sessionId: "session-hidden",
      worldId: "test-world",
      startedAtUnixMilliseconds: 1_000,
    });
    const result = timeline.record(sample(10_000, 1, 1, {
      visibilityState: "hidden",
      heartbeatDelayMilliseconds: 8_000,
    }));
    expect(result.health.code).toBe("healthy");
  });

  it("keeps a bounded trace, records health transitions, and parses its persisted report", () => {
    const timeline = new RuntimeDiagnosticTimelineV1({
      sessionId: "session-bounded",
      worldId: "test-world",
      startedAtUnixMilliseconds: 1_000,
      maximumSamples: 3,
      maximumEvents: 4,
    });
    timeline.record(sample(1_000, 1, 1));
    timeline.record(sample(2_000, 2, 2));
    timeline.record(sample(3_000, 3, 3, { heartbeatDelayMilliseconds: 900 }));
    timeline.record(sample(4_000, 4, 4));

    const report = timeline.report();
    expect(report.samples.map(({ sequence }) => sequence)).toEqual([2, 3, 4]);
    expect(report.events.some(({ code }) => code === "main-thread-stalled")).toBe(true);
    expect(parseRuntimeDiagnosticReportV1(JSON.stringify(report))).toEqual(report);
    expect(parseRuntimeDiagnosticReportV1("{}" )).toBeNull();
  });

  it("persists the sanitized fixed-input cause and recovery context", () => {
    const timeline = new RuntimeDiagnosticTimelineV1({
      sessionId: "session-fixed-input-failure",
      worldId: "test-world",
      startedAtUnixMilliseconds: 1_000,
    });
    timeline.record(sample(1_000, 1, 1));
    const failed = timeline.record(sample(2_000, 2, 1, {
      loop: {
        ...sample(2_000, 2, 1).loop,
        frameLoopDiagnostic: {
          severity: "error",
          code: "WORLDKIT_RUNTIME_FRAME_FAILED",
          message: "The runtime was paused after a simulation frame failed.",
        },
        runtimeFailure: {
          initial: {
            schemaVersion: 1,
            stage: "prepare",
            tick: 2,
            actions: ["move-right"],
            errorName: "RangeError",
            errorCode: "3C_INPUT_INVALID",
            errorMessage: "native velocity violates the active contact cone.",
            controlledSubject: {
              entityId: "player",
              positionMetersXYZ: [43.19, 21.09, -3.7],
              velocityMetersPerSecondXYZ: [0, 0, 0],
              activeActionId: "run",
              grounded: true,
            },
          },
          recovery: null,
        },
      },
    }));

    expect(failed.loop.runtimeFailure?.initial).toMatchObject({
      tick: 2,
      errorCode: "3C_INPUT_INVALID",
      actions: ["move-right"],
    });
    expect(timeline.report().events).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "runtime-fixed-input-failed",
      message: expect.stringContaining("native velocity violates"),
    }));
  });

  it("records a nonfatal provider support observation with raw evidence", () => {
    const timeline = new RuntimeDiagnosticTimelineV1({
      sessionId: "session-provider-support",
      worldId: "test-world",
      startedAtUnixMilliseconds: 1_000,
    });
    const base = sample(1_000, 1, 2);
    const result = timeline.record(sample(1_000, 1, 2, {
      loop: {
        ...base.loop,
        supportObservation: {
          schemaVersion: 1,
          tick: 2,
          rawMode: "supported",
          rawNormalWorldXYZ: [0, 0, 0],
          contactCount: 0,
          supportingContactCount: 0,
          upwardSupportDepartureActive: false,
          resolution: "unsupported-provider-incoherent",
        },
      },
    }));

    expect(result.health.code).toBe("healthy");
    expect(result.loop.supportObservation).toEqual({
      schemaVersion: 1,
      tick: 2,
      rawMode: "supported",
      rawNormalWorldXYZ: [0, 0, 0],
      contactCount: 0,
      supportingContactCount: 0,
      upwardSupportDepartureActive: false,
      resolution: "unsupported-provider-incoherent",
    });
    expect(Object.isFrozen(result.loop.supportObservation)).toBe(true);
    expect(Object.isFrozen(
      result.loop.supportObservation?.rawNormalWorldXYZ,
    )).toBe(true);
    expect(timeline.report().events).toContainEqual(expect.objectContaining({
      severity: "warning",
      code: "provider-support-observation-incoherent",
      message: expect.stringContaining(
        "resolution=unsupported-provider-incoherent",
      ),
    }));
  });
});
