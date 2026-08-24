import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CameraViewInputV1,
  ControlCaptureRequestV1,
  ExecutionPlanV4,
  FixedInputV1,
  RuntimeControlCaptureFrameV1,
  WorldRuntimeSnapshotV3,
  WorldRuntimeSnapshotV4,
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
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  runtimeDiagnostics(): ReturnType<BabylonWorldAdapter["runtimeDiagnostics"]>;
  resetRuntime(): Promise<WorldRuntimeSnapshotV4>;
  runWorldkitFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV4>;
  render(): void;
  waitForSimulationTick(expectedSimulationTick: number): Promise<WorldRuntimeSnapshotV4>;
  waitForRenderReady(expectedSimulationTick: number): Promise<unknown>;
  captureControlFrame(request: ControlCaptureRequestV1): Promise<RuntimeControlCaptureFrameV1>;
}

function publicRuntimeSnapshot(
  legacySnapshot: WorldRuntimeSnapshotV3,
  paused = false,
): WorldRuntimeSnapshotV4 {
  const subject = legacySnapshot.subjectStatesByEntityId.player!;
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: "runtime-session-test",
    worldSessionId: "world-session-test",
    world: {
      publicationEpoch: legacySnapshot.tick + 1,
      simulationTick: legacySnapshot.tick,
      worldStateRef: `worldkit://world-state/world-state:${"a".repeat(64)}`,
      worldStateHash: `sha256:${"a".repeat(64)}`,
      subjectStatesByEntityId: {
        player: {
          entityState: {
            id: "player",
            kind: "spatial-entity-state",
            entityDefinitionRef: subject.subjectDefinitionRef,
            entityDefinitionHash: subject.subjectDefinitionHash,
            semanticClassId: "subject.humanoid",
            lifecycleMode: "active",
            positionMetersXYZ: subject.positionMetersXYZ,
            rotationQuaternionXYZW: [0, 0, 0, 1],
            scaleRatioXYZ: [1, 1, 1],
            linearVelocityMetersPerSecondXYZ:
              subject.velocityMetersPerSecondXYZ,
          },
          capabilityStatesById: {},
        },
      },
      gameplayInspection: {
        kind: "gameplay-inspection-snapshot",
        schemaVersion: 1,
        runtimeSessionId: "runtime-session-test",
        worldSessionId: "world-session-test",
        simulationTick: legacySnapshot.tick,
        participantStatesById: {},
        controllerStatesById: {},
        possessedByRelationshipsById: {
          "possession.primary": {
            id: "possession.primary",
            type: "possessedBy",
            controllerEntityId: "controller-primary",
            controlledEntityId: "player",
          },
        },
        featureStatesById: {},
        pendingTransactionsById: {},
      },
    },
    view: {
      viewStateRevision: legacySnapshot.tick,
      camera: {
        mode: "tracking",
        id: legacySnapshot.camera.entityId,
        targetEntityId: "player",
        positionMetersXYZ: legacySnapshot.camera.positionMetersXYZ,
        activeCameraProfileRef: "worldkit://camera-profile/test@1",
        activeCameraRigRef: "worldkit://camera-rig/test@1",
        activeCameraModifierRefs: [],
        safeFallbackActive: false,
        viewYawOffsetRadians:
          legacySnapshot.camera.viewYawOffsetRadians ?? 0,
        viewPitchOffsetRadians:
          legacySnapshot.camera.viewPitchOffsetRadians ?? 0,
        viewDistanceOffsetMeters:
          legacySnapshot.camera.viewDistanceOffsetMeters ?? 0,
      },
    },
    runtime: {
      phase: "ready",
      isPaused: paused,
      fixedTimeStepSeconds: 1 / 60,
    },
    resources: {
      phase: "ready",
      meshCount: legacySnapshot.resources.meshes,
      physicsBodyCount: legacySnapshot.resources.bodies,
      terrainSampleCount: legacySnapshot.resources.terrainSamples,
    },
  } as unknown as WorldRuntimeSnapshotV4;
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
  acquireRuntimeActivity: ReturnType<typeof vi.fn>;
  releaseRuntimeActivity: ReturnType<typeof vi.fn>;
  setCoordinatorPaused: ReturnType<typeof vi.fn>;
  coordinatorSnapshot: ReturnType<typeof vi.fn>;
} {
  let tick = 0;
  let paused = false;
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
  const canvas = {} as HTMLCanvasElement;
  const acquireRuntimeActivity = vi.fn(
    (request: { id: string; activityKind: string }) => ({
      kind: "worldkit-runtime-activity-receipt",
      schemaVersion: 1,
      requestId: request.id,
      activityKind: request.activityKind,
      worldSessionId: "world-session-test",
      runtimeActivityEpoch: 1,
      status: "active",
    }),
  );
  const releaseRuntimeActivity = vi.fn(
    (request: { id: string; activityKind: string }) => ({
      kind: "worldkit-runtime-activity-receipt",
      schemaVersion: 1,
      requestId: request.id,
      activityKind: request.activityKind,
      worldSessionId: "world-session-test",
      runtimeActivityEpoch: 1,
      status: "released",
    }),
  );
  const setCoordinatorPaused = vi.fn((nextPaused: boolean) => {
    paused = nextPaused;
    return publicRuntimeSnapshot(runtime.snapshot(), paused);
  });
  const coordinatorSnapshot = vi.fn(() =>
    publicRuntimeSnapshot(runtime.snapshot(), paused)
  );
  const coordinator = {
    activeRuntime: () => runtime,
    activeCanvas: () => canvas,
    snapshot: coordinatorSnapshot,
    runFixedInput: async (input: FixedInputV1) => {
      await runtime.runFixedInput(input);
      return publicRuntimeSnapshot(runtime.snapshot(), paused);
    },
    resetWithInitialControlBinding: async () => {
      runtime.reset();
      return publicRuntimeSnapshot(runtime.snapshot(), paused);
    },
    setPaused: setCoordinatorPaused,
    acquireRuntimeActivity,
    releaseRuntimeActivity,
  };
  const adapter = Object.assign(Object.create(BabylonWorldAdapter.prototype), {
    executionPlan,
    coordinator,
    keyboardInput: new PhysicalKeyboardActionTracker(),
    cameraInput: new Set<string>(),
    inspections: [],
    listeners: new Set(),
    disposed: false,
    paused: false,
    animationPending: false,
    animationFrameId: null,
    frame: 0,
    captureActivitySequence: 0,
    previousAnimationTimestampMilliseconds: 0,
    fixedStepAccumulatorSeconds: 0,
    displayFramesPerSecond: 0,
  }) as unknown as AdapterProbe;
  const requestFrame = vi.fn(() => 1);
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  return {
    adapter,
    runtime,
    requestFrame,
    acquireRuntimeActivity,
    releaseRuntimeActivity,
    setCoordinatorPaused,
    coordinatorSnapshot,
  };
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
    expect(consoleError).toHaveBeenCalledWith(
      "WORLDKIT_RUNTIME_FRAME_FAILED",
      expect.objectContaining({ message: "private provider failure" }),
    );
    expect(requestFrame).toHaveBeenCalledOnce();
  });

  it("maps left and right camera actions to the matching screen-look direction", async () => {
    const leftProbe = createAdapterProbe();
    leftProbe.adapter.cameraInput.add("cameraLeft");

    await leftProbe.adapter.animate(17);

    expect(leftProbe.adapter.snapshot().camera.yaw).toBeGreaterThan(0);

    const rightProbe = createAdapterProbe();
    rightProbe.adapter.cameraInput.add("cameraRight");

    await rightProbe.adapter.animate(17);

    expect(rightProbe.adapter.snapshot().camera.yaw).toBeLessThan(0);
  });

  it("clears held movement and camera input across a protocol reset", async () => {
    const { adapter, runtime } = createAdapterProbe();
    adapter.keyboardInput.press("KeyW");
    adapter.cameraInput.add("cameraLeft");

    await adapter.resetRuntime();
    await adapter.animate(0);
    await adapter.animate(17);

    expect(runtime.runFixedInput).toHaveBeenLastCalledWith({ actions: [], ticks: 1 });
    expect(adapter.snapshot().camera.yaw).toBe(0);
  });

  it.each([
    { initiallyPaused: false },
    { initiallyPaused: true },
  ])(
    "restores pause state after Browser Fixed Input fails (initiallyPaused=$initiallyPaused)",
    async ({ initiallyPaused }) => {
      const { adapter, runtime, setCoordinatorPaused } = createAdapterProbe();
      adapter.setPaused(initiallyPaused);
      setCoordinatorPaused.mockClear();
      runtime.runFixedInput.mockRejectedValueOnce(new Error("fixed input failed"));

      await expect(adapter.runWorldkitFixedInput([{
        actions: ["move-forward"],
        ticks: 1,
      }])).rejects.toThrow("fixed input failed");

      expect(adapter.isPaused()).toBe(initiallyPaused);
      expect(setCoordinatorPaused.mock.calls).toEqual([
        [true],
        [initiallyPaused],
      ]);
    },
  );

  it("restores pause state when the initial Browser Fixed Input snapshot fails", async () => {
    const { adapter, coordinatorSnapshot, setCoordinatorPaused } = createAdapterProbe();
    coordinatorSnapshot.mockImplementationOnce(() => {
      throw new Error("snapshot failed");
    });

    await expect(adapter.runWorldkitFixedInput([])).rejects.toThrow("snapshot failed");

    expect(adapter.isPaused()).toBe(false);
    expect(setCoordinatorPaused.mock.calls).toEqual([[true], [false]]);
  });

  it("requires an exact Simulation Tick and freezes adapter simulation during capture", async () => {
    const {
      adapter,
      runtime,
      acquireRuntimeActivity,
      releaseRuntimeActivity,
    } = createAdapterProbe();
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
    await expect(adapter.waitForSimulationTick(0)).resolves.toMatchObject({
      world: { simulationTick: 0 },
    });

    await adapter.waitForRenderReady(0);
    adapter.render();
    expect(runtime.renderFrame).not.toHaveBeenCalled();
    const capture = adapter.captureControlFrame(request);
    expect(adapter.isPaused()).toBe(true);
    await expect(capture).resolves.toMatchObject({
      snapshot: { schemaVersion: 4 },
    });
    expect(adapter.isPaused()).toBe(false);
    expect(runtime.captureControlFrame).toHaveBeenCalledWith(request);
    expect(acquireRuntimeActivity).toHaveBeenCalledOnce();
    expect(releaseRuntimeActivity).toHaveBeenCalledWith(
      acquireRuntimeActivity.mock.calls[0]![0],
    );
    adapter.render();
    expect(runtime.renderFrame).toHaveBeenCalledOnce();
  });
});
