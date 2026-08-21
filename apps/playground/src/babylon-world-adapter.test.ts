import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CameraViewInputV1,
  ControlCaptureRequestV1,
  ExecutionPlanV4,
  FixedInputV1,
  RuntimeControlCaptureFrameV1,
  WorldRuntimeSnapshotV3,
} from "@whitebox-world/runtime-contracts";

import {
  BabylonWorldAdapter,
  PhysicalKeyboardActionTracker,
} from "./babylon-world-adapter";

interface RuntimeProbe {
  runFixedInput: ReturnType<typeof vi.fn<(input: FixedInputV1) => Promise<WorldRuntimeSnapshotV3>>>;
  renderFrame: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn<() => WorldRuntimeSnapshotV3>>;
  adjustCameraView(input: CameraViewInputV1): WorldRuntimeSnapshotV3;
  getControlCaptureCapabilities: ReturnType<typeof vi.fn>;
  waitForRenderReady: ReturnType<typeof vi.fn>;
  captureControlFrame: ReturnType<typeof vi.fn>;
  snapshot(): WorldRuntimeSnapshotV3;
}

interface AdapterProbe {
  animate(timestampMilliseconds: number): Promise<void>;
  keyboardInput: PhysicalKeyboardActionTracker;
  cameraInput: Set<string>;
  previousAnimationTimestampMilliseconds: number | null;
  fixedStepAccumulatorSeconds: number;
  displayFramesPerSecond: number;
  snapshot(): ReturnType<BabylonWorldAdapter["snapshot"]>;
  isPaused(): boolean;
  runtimeDiagnostics(): ReturnType<BabylonWorldAdapter["runtimeDiagnostics"]>;
  resetRuntime(): WorldRuntimeSnapshotV3;
  render(): void;
  waitForSimulationTick(expectedSimulationTick: number): Promise<WorldRuntimeSnapshotV3>;
  waitForRenderReady(expectedSimulationTick: number): Promise<unknown>;
  captureControlFrame(request: ControlCaptureRequestV1): Promise<RuntimeControlCaptureFrameV1>;
}

function runtimeSnapshot(
  tick = 0,
  cameraView: {
    yawRadians: number;
    pitchRadians: number;
    distanceMeters: number;
  } = { yawRadians: 0, pitchRadians: 0, distanceMeters: 0 },
): WorldRuntimeSnapshotV3 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 3,
    runtimeBackend: "babylon-havok",
    tick,
    ready: true,
    controlledEntityId: "player",
    controllersById: {},
    subjectStatesByEntityId: {
      player: {
        entityId: "player",
        subjectDefinitionRef: "worldkit://subject-definition/test@1",
        subjectDefinitionHash: `sha256:${"1".repeat(64)}`,
        positionMetersXYZ: [0, 0, 0],
        velocityMetersPerSecondXYZ: [0, 0, 0],
        movementMedium: "ground",
        activeActionId: "idle",
        forwardXYZ: [0, 0, -1],
      },
    },
    physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
    camera: {
      entityId: "camera-main",
      targetEntityId: "player",
      positionMetersXYZ: [0, 2, 4],
      viewYawOffsetRadians: cameraView.yawRadians,
      viewPitchOffsetRadians: cameraView.pitchRadians,
      viewDistanceOffsetMeters: cameraView.distanceMeters,
    },
    resources: { meshes: 1, bodies: 1, terrainSamples: 4 },
  };
}

function createAdapterProbe(): {
  adapter: AdapterProbe;
  runtime: RuntimeProbe;
  requestFrame: ReturnType<typeof vi.fn>;
} {
  let tick = 0;
  let cameraView = { yawRadians: 0, pitchRadians: 0, distanceMeters: 0 };
  const runtime: RuntimeProbe = {
    runFixedInput: vi.fn(async (input) => {
      tick += input.ticks;
      return runtimeSnapshot(tick, cameraView);
    }),
    renderFrame: vi.fn(),
    reset: vi.fn(() => {
      tick = 0;
      cameraView = { yawRadians: 0, pitchRadians: 0, distanceMeters: 0 };
      return runtimeSnapshot(0, cameraView);
    }),
    adjustCameraView: (input) => {
      cameraView = {
        yawRadians: cameraView.yawRadians + (input.yawDeltaRadians ?? 0),
        pitchRadians: cameraView.pitchRadians + (input.pitchDeltaRadians ?? 0),
        distanceMeters: cameraView.distanceMeters + (input.zoomDeltaMeters ?? 0),
      };
      return runtimeSnapshot(tick, cameraView);
    },
    getControlCaptureCapabilities: vi.fn(() => ({
      available: true,
    })),
    waitForRenderReady: vi.fn((expectedSimulationTick: number) => ({
      kind: "worldkit-render-ready-receipt",
      schemaVersion: 1,
      id: `render-ready:test:${expectedSimulationTick}`,
      runtimeSessionId: "runtime-session-test",
      simulationTick: expectedSimulationTick,
      renderFrameIndex: 0,
    })),
    captureControlFrame: vi.fn(async () =>
      undefined as unknown as RuntimeControlCaptureFrameV1
    ),
    snapshot: () => runtimeSnapshot(tick, cameraView),
  };
  const executionPlan = {
    id: "adapter-test",
    camera: {
      pitchRadians: 0.2,
      distanceMeters: 4,
    },
    layout: { layoutAssertions: [], layoutSolveReportHash: `sha256:${"2".repeat(64)}` },
    resourceUsage: { triangles: 2 },
  } as unknown as ExecutionPlanV4;
  const adapter = Object.assign(Object.create(BabylonWorldAdapter.prototype), {
    executionPlan,
    runtime,
    keyboardInput: new PhysicalKeyboardActionTracker(),
    cameraInput: new Set<string>(),
    inspections: [],
    listeners: new Set(),
    disposed: false,
    paused: false,
    animationPending: false,
    animationFrameId: null,
    frame: 0,
    previousAnimationTimestampMilliseconds: 0,
    fixedStepAccumulatorSeconds: 0,
    displayFramesPerSecond: 0,
  }) as unknown as AdapterProbe;
  const requestFrame = vi.fn(() => 1);
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  return { adapter, runtime, requestFrame };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BabylonWorldAdapter frame loop", () => {
  it("accumulates fixed simulation ticks independently from display frames", async () => {
    const { adapter, runtime } = createAdapterProbe();

    await adapter.animate(8);
    expect(runtime.runFixedInput).not.toHaveBeenCalled();
    expect(adapter.snapshot().performance.fps).toBe(125);

    await adapter.animate(17);
    await adapter.animate(51);
    expect(runtime.runFixedInput.mock.calls.map(([input]) => input.ticks)).toEqual([1, 2]);
  });

  it("caps catch-up work after a suspended display frame", async () => {
    const { adapter, runtime } = createAdapterProbe();

    await adapter.animate(10_000);

    expect(runtime.runFixedInput).toHaveBeenCalledOnce();
    expect(runtime.runFixedInput).toHaveBeenCalledWith({ actions: [], ticks: 5 });
  });

  it("pauses and publishes a safe diagnostic when a simulation frame fails", async () => {
    const { adapter, runtime, requestFrame } = createAdapterProbe();
    runtime.runFixedInput.mockRejectedValueOnce(new Error("private provider failure"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(adapter.animate(17)).resolves.toBeUndefined();

    expect(adapter.isPaused()).toBe(true);
    expect(adapter.runtimeDiagnostics()).toContainEqual({
      severity: "error",
      code: "WORLDKIT_RUNTIME_FRAME_FAILED",
      instancePath: "",
      message: "The runtime was paused after a simulation frame failed.",
    });
    expect(JSON.stringify(adapter.runtimeDiagnostics())).not.toContain("private provider");
    expect(consoleError).toHaveBeenCalledWith("WORLDKIT_RUNTIME_FRAME_FAILED");
    expect(requestFrame).toHaveBeenCalledOnce();
  });

  it("clears held movement and camera input across a protocol reset", async () => {
    const { adapter, runtime } = createAdapterProbe();
    adapter.keyboardInput.press("KeyW");
    adapter.cameraInput.add("cameraLeft");

    adapter.resetRuntime();
    await adapter.animate(0);
    await adapter.animate(17);

    expect(runtime.runFixedInput).toHaveBeenLastCalledWith({ actions: [], ticks: 1 });
    expect(adapter.snapshot().camera.yaw).toBe(0);
  });

  it("requires an exact Simulation Tick and freezes adapter simulation during capture", async () => {
    const { adapter, runtime } = createAdapterProbe();
    const request = {
      captureFrameIndex: 0,
      expectedSimulationTick: 0,
      renderReadyReceiptId: "render-ready:test:0",
      widthPixels: 16,
      heightPixels: 9,
    } as const;

    await expect(adapter.waitForSimulationTick(1)).rejects.toThrow(
      "CONTROL_CAPTURE_SIMULATION_TICK_MISMATCH",
    );
    await expect(adapter.waitForSimulationTick(0)).resolves.toMatchObject({ tick: 0 });

    await adapter.waitForRenderReady(0);
    adapter.render();
    expect(runtime.renderFrame).not.toHaveBeenCalled();
    const capture = adapter.captureControlFrame(request);
    expect(adapter.isPaused()).toBe(true);
    await expect(capture).resolves.toBeUndefined();
    expect(adapter.isPaused()).toBe(false);
    expect(runtime.captureControlFrame).toHaveBeenCalledWith(request);
    adapter.render();
    expect(runtime.renderFrame).toHaveBeenCalledOnce();
  });
});
