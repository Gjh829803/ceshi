import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  normalizeAuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileCanonicalWorldV1 } from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import {
  createGameplayBootstrapResourceLockEntryV1,
} from "@whitebox-world/gameplay-contracts";
import type { BabylonRuntimeProjectionV1 } from "@whitebox-world/runtime-babylon";
import type {
  CameraViewInputV1,
  ControlCaptureRequestV1,
  CanonicalSceneExecutionPlanV1,
  FixedInputV1,
  RuntimeControlCaptureFrameV1,
  WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import type { PublishWorldReplacementResultV1 } from "@whitebox-world/runtime-host";
import { isNil } from "lodash-es";

import {
  createValidAuthoringSpecV4,
} from "@whitebox-world/authoring/testing";

import {
  BabylonWorldAdapter,
  PhysicalKeyboardActionTracker,
  activeActionForControlledSubject,
  featureInspections,
} from "./babylon-world-adapter";

expectTypeOf<Parameters<typeof featureInspections>[0]>()
  .toEqualTypeOf<CanonicalSceneExecutionPlanV1>();
expectTypeOf<Parameters<typeof activeActionForControlledSubject>[0]>()
  .toEqualTypeOf<BabylonRuntimeProjectionV1>();

function gameplayEntityDescriptors(
  normalizedWorldIr: NormalizedWorldIRV4,
) {
  return normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalizedWorldIr.resources.subjectDefinitions.find(
        (candidate) =>
          candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      if (isNil(definition)) {
        throw new Error(
          `Adapter fixture Subject Definition missing: ${node.subjectDefinitionRef}`,
        );
      }
      return {
        id: node.id,
        entityDefinitionRef: node.subjectDefinitionRef,
        capabilityRefs: definition.capabilityRefs,
      };
    });
}

function createLockedCanonicalWorldV1() {
  const normalized = normalizeAuthoringSpecV4(createValidAuthoringSpecV4());
  if (
    !normalized.ok ||
    isNil(normalized.value) ||
    isNil(normalized.normalizedWorldIrHash)
  ) {
    throw new Error(
      `Adapter fixture normalization failed: ${JSON.stringify(normalized.diagnostics)}`,
    );
  }
  const gameplayBootstrap = createCoreGameplayBootstrapV1({
    worldId: normalized.value.id,
    worldSeed: normalized.value.seed,
    entityDescriptors: gameplayEntityDescriptors(normalized.value),
    initialRelationshipStates: normalized.value.relationships.map(
      (relationship) => ({ ...relationship, establishedSimulationTick: 0 }),
    ),
  });
  const compiled = compileCanonicalWorldV1({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap,
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  });
  if (!compiled.ok || isNil(compiled.canonicalSceneExecutionPlan)) {
    throw new Error(
      `Adapter fixture compilation failed: ${JSON.stringify(compiled.diagnostics)}`,
    );
  }
  return {
    executionPlan: compiled.canonicalSceneExecutionPlan,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
    gameplayBootstrap,
  };
}

const LOCKED_CANONICAL_WORLD = createLockedCanonicalWorldV1();
const LOCKED_EXECUTION_PLAN_V5 = LOCKED_CANONICAL_WORLD.executionPlan;
const LOCKED_WORLD_RUNTIME_BOOTSTRAP =
  LOCKED_CANONICAL_WORLD.worldRuntimeBootstrap;

interface RuntimeProbe {
  runFixedInput: ReturnType<typeof vi.fn<(input: FixedInputV1) => Promise<BabylonRuntimeProjectionV1>>>;
  renderFrame: ReturnType<typeof vi.fn<(interpolationAlphaRatio?: number) => void>>;
  reset: ReturnType<typeof vi.fn<() => BabylonRuntimeProjectionV1>>;
  adjustCameraView(input: CameraViewInputV1): BabylonRuntimeProjectionV1;
  getControlCaptureCapabilities: ReturnType<typeof vi.fn>;
  waitForRenderReady: ReturnType<typeof vi.fn>;
  captureControlFrame: ReturnType<typeof vi.fn>;
  captureArtifactView: ReturnType<typeof vi.fn>;
  snapshot(): BabylonRuntimeProjectionV1;
}

interface AdapterProbe {
  animate(timestampMilliseconds: number): Promise<void>;
  clearPhysicalInputState(reason: "blur" | "simulation-reset"): void;
  runFixedInput(
    steps: Parameters<BabylonWorldAdapter["runFixedInput"]>[0],
  ): ReturnType<BabylonWorldAdapter["runFixedInput"]>;
  keyboardInput: PhysicalKeyboardActionTracker;
  cameraInput: Set<string>;
  previousAnimationTimestampMilliseconds: number | null;
  fixedStepAccumulatorSeconds: number;
  displayFramesPerSecond: number;
  snapshot(): ReturnType<BabylonWorldAdapter["snapshot"]>;
  subscribe(
    listener: (snapshot: ReturnType<BabylonWorldAdapter["snapshot"]>) => void,
  ): () => void;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  runtimeDiagnostics(): ReturnType<BabylonWorldAdapter["runtimeDiagnostics"]>;
  getArrowInputDiagnosticSnapshot(): Readonly<{
    maximumYawRadiansPerFixedTick: number;
    maximumPitchRadiansPerFixedTick: number;
    keyboardAccelerationSeconds: number;
    keyboardDecelerationSeconds: number;
    yawRadiansPerFixedTick: number;
    pitchRadiansPerFixedTick: number;
    lastClearReason: "startup" | "blur" | "simulation-reset" | "possession-unbound" | "possession-rebind";
  }>;
  resetRuntime(): Promise<WorldRuntimeSnapshotV4>;
  runWorldkitFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV4>;
  render(): void;
  waitForSimulationTick(expectedSimulationTick: number): Promise<WorldRuntimeSnapshotV4>;
  waitForRenderReady(expectedSimulationTick: number): Promise<unknown>;
  captureControlFrame(request: ControlCaptureRequestV1): Promise<RuntimeControlCaptureFrameV1>;
  configureVisualCaptureGroups(
    targets: readonly import("@whitebox-world/runtime-contracts").VisualCaptureGroupV1[],
  ): readonly import("@whitebox-world/runtime-contracts").VisualCaptureGroupV1[];
  listVisualCaptureGroups(): readonly import("@whitebox-world/runtime-contracts").VisualCaptureGroupV1[];
  captureRuntimeWhiteboxTriview(
    visualTargetId: string,
  ): import("@whitebox-world/runtime-contracts").WhiteboxTriviewCaptureV1;
}

function publicRuntimeSnapshot(
  providerProjection: BabylonRuntimeProjectionV1,
  paused = false,
): WorldRuntimeSnapshotV4 {
  const subject = providerProjection.subjectStatesByEntityId.player!;
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: "runtime-session-test",
    worldSessionId: "world-session-test",
    world: {
      publicationEpoch: providerProjection.tick + 1,
      simulationTick: providerProjection.tick,
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
        simulationTick: providerProjection.tick,
        participantStatesById: {},
        controllerStatesById: {},
        relationshipStatesById: {
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
      viewStateRevision: providerProjection.tick,
      camera: {
        mode: "tracking",
        id: providerProjection.camera.entityId,
        targetEntityId: "player",
        positionMetersXYZ: providerProjection.camera.positionMetersXYZ,
        activeCameraProfileRef:
          providerProjection.camera.activeCameraProfileRef,
        activeCameraRigRef: providerProjection.camera.activeCameraRigRef,
        activeCameraModifierRefs:
          providerProjection.camera.activeCameraModifierRefs,
        safeFallbackActive: providerProjection.camera.safeFallbackActive,
        viewYawOffsetRadians:
          providerProjection.camera.viewYawOffsetRadians ?? 0,
        viewPitchOffsetRadians:
          providerProjection.camera.viewPitchOffsetRadians ?? 0,
        viewDistanceOffsetMeters:
          providerProjection.camera.viewDistanceOffsetMeters ?? 0,
        fixedStepDeltaSeconds:
          providerProjection.camera.fixedStepDeltaSeconds ?? 1 / 60,
      },
    },
    runtime: {
      phase: "ready",
      isPaused: paused,
      fixedTimeStepSeconds: 1 / 60,
    },
    resources: {
      phase: "ready",
      meshCount: providerProjection.resources.meshes,
      physicsBodyCount: providerProjection.resources.bodies,
      terrainSampleCount: providerProjection.resources.terrainSamples,
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
): BabylonRuntimeProjectionV1 {
  return {
    runtimeBackend: "babylon-havok",
    tick,
    ready: true,
    possessionTarget: {
      mode: "possessed",
      controlledEntityId: "player",
    },
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
        speedMetersPerSecond: 0,
        activeControlFeelProfileRef:
          "worldkit://control-feel-profile/test@1",
        activePhysicsBodyProfileRef:
          "worldkit://physics-body-profile/test@1",
        activeLocomotionProfileRef:
          "worldkit://locomotion-profile/test@1",
        locomotionMode: "idle",
        activeMotionProfileRef: "worldkit://motion-profile/test@1",
        movementOwner: "specialized-motion",
        activeMotionKernelRef: "worldkit://motion-kernel/test@1",
        motionTags: ["ground"],
        safeFallbackActive: false,
      },
    },
    physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
    camera: {
      entityId: "camera-main",
      targetEntityId: "player",
      positionMetersXYZ: [0, 2, 4],
      activeCameraProfileRef: "worldkit://camera-profile/test@1",
      activeCameraRigRef: "worldkit://camera-rig/test@1",
      activeCameraModifierRefs: [],
      safeFallbackActive: false,
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
    captureArtifactView: vi.fn(() => ({
      kind: "worldkit-runtime-artifact-capture",
      schemaVersion: 1,
      dataUrl: "data:image/png;base64,test",
      widthPixels: 639,
      heightPixels: 360,
      pixelsRgba: new Uint8ClampedArray(639 * 360 * 4),
    })),
    snapshot: () => runtimeSnapshot(tick, cameraView),
  };
  const executionPlan = LOCKED_EXECUTION_PLAN_V5;
  const canvas = { width: 640, height: 360 } as HTMLCanvasElement;
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
    worldRuntimeBootstrap: LOCKED_WORLD_RUNTIME_BOOTSTRAP,
    initialExecutionPlan: executionPlan,
    initialWorldRuntimeBootstrap: LOCKED_WORLD_RUNTIME_BOOTSTRAP,
    initialInspections: [],
    coordinator,
    keyboardInput: new PhysicalKeyboardActionTracker(),
    cameraInput: new Set<string>(),
    keyboardCameraYawRadiansPerTick: 0,
    keyboardCameraPitchRadiansPerTick: 0,
    lastArrowInputClearReason: "startup",
    lastPossessedControlledEntityId: "player",
    inspections: [],
    listeners: new Set(),
    disposed: false,
    paused: false,
    animationPending: false,
    animationFrameId: null,
    frame: 0,
    captureActivitySequence: 0,
    visualCaptureGroups: [],
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
  it("keeps grouped whitebox capture on the Adapter artifact surface", () => {
    const { adapter, runtime } = createAdapterProbe();
    const target = {
      visualTargetId: "visual-target-1",
      runtimeEntityIds: ["player"],
      role: "primary-subject",
      frontDirectionWorldXZ: [-1, 0],
      semanticClassId: "subject.player",
      identityColor: "#E85D5D",
    } as const;

    expect(adapter.listVisualCaptureGroups()).toEqual([]);
    expect(adapter.configureVisualCaptureGroups([target])).toEqual([target]);
    expect(adapter.listVisualCaptureGroups()).toEqual([target]);
    expect(() => adapter.captureRuntimeWhiteboxTriview("missing-target")).toThrow(
      "WORLDKIT_CAPTURE_TARGET_NOT_FOUND",
    );
    expect(adapter.captureRuntimeWhiteboxTriview(target.visualTargetId)).toMatchObject({
      visualTargetId: target.visualTargetId,
      runtimeEntityIds: ["player"],
      views: ["front", "right", "back"],
      imageDataUri: "data:image/png;base64,test",
    });
    expect(runtime.captureArtifactView).toHaveBeenCalledWith({
      kind: "entity-triview",
      widthPixels: 640,
      heightPixels: 360,
      entityIds: ["player"],
      identityColor: "#E85D5D",
      frontDirectionWorldXZ: [-1, 0],
      renderStyle: "runtime-lit-review",
    });
    expect(adapter.captureRuntimeWhiteboxTriview(target.visualTargetId).inspection).toMatchObject({
      widthPixels: 639, heightPixels: 360, isRenderable: false,
    });
  });

  it("fails closed instead of selecting the initial Subject when possession is unbound", () => {
    const possessedProjection = runtimeSnapshot();
    const unboundProjection: BabylonRuntimeProjectionV1 = {
      ...possessedProjection,
      possessionTarget: { mode: "unbound" },
      camera: {
        entityId: possessedProjection.camera.entityId,
        positionMetersXYZ: possessedProjection.camera.positionMetersXYZ,
        activeCameraProfileRef:
          possessedProjection.camera.activeCameraProfileRef,
        activeCameraRigRef: possessedProjection.camera.activeCameraRigRef,
        activeCameraModifierRefs:
          possessedProjection.camera.activeCameraModifierRefs,
        safeFallbackActive: possessedProjection.camera.safeFallbackActive,
        viewYawOffsetRadians:
          possessedProjection.camera.viewYawOffsetRadians,
        viewPitchOffsetRadians:
          possessedProjection.camera.viewPitchOffsetRadians,
        viewDistanceOffsetMeters:
          possessedProjection.camera.viewDistanceOffsetMeters,
      },
    };
    const { adapter, runtime } = createAdapterProbe();
    vi.spyOn(runtime, "snapshot").mockReturnValue(unboundProjection);

    expect(() => activeActionForControlledSubject(unboundProjection)).toThrow(
      "WORLDKIT_RUNTIME_CONTROL_UNBOUND",
    );
    expect(() => adapter.snapshot()).toThrow(
      "WORLDKIT_RUNTIME_CONTROL_UNBOUND",
    );
  });

  it("keeps scheduling display frames while canonical possession is unbound", async () => {
    const possessedProjection = runtimeSnapshot();
    const unboundProjection: BabylonRuntimeProjectionV1 = {
      ...possessedProjection,
      possessionTarget: { mode: "unbound" },
      camera: {
        entityId: possessedProjection.camera.entityId,
        positionMetersXYZ: possessedProjection.camera.positionMetersXYZ,
        activeCameraProfileRef:
          possessedProjection.camera.activeCameraProfileRef,
        activeCameraRigRef: possessedProjection.camera.activeCameraRigRef,
        activeCameraModifierRefs:
          possessedProjection.camera.activeCameraModifierRefs,
        safeFallbackActive: possessedProjection.camera.safeFallbackActive,
        viewYawOffsetRadians:
          possessedProjection.camera.viewYawOffsetRadians,
        viewPitchOffsetRadians:
          possessedProjection.camera.viewPitchOffsetRadians,
        viewDistanceOffsetMeters:
          possessedProjection.camera.viewDistanceOffsetMeters,
      },
    };
    const { adapter, runtime, requestFrame } = createAdapterProbe();
    vi.spyOn(runtime, "snapshot").mockReturnValue(unboundProjection);

    await expect(adapter.animate(17)).resolves.toBeUndefined();

    expect(runtime.runFixedInput).toHaveBeenCalledWith({ actions: [], ticks: 1 });
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(adapter.isPaused()).toBe(false);
  });

  it("does not apply residual keyboard camera inertia while possession is unbound", async () => {
    const { adapter, runtime } = createAdapterProbe();
    await adapter.runFixedInput([{
      actions: ["cameraLeft"],
      ticks: 12,
    }]);
    const adjustCameraView = vi.spyOn(runtime, "adjustCameraView");
    const possessedProjection = runtime.snapshot();
    vi.spyOn(runtime, "snapshot").mockReturnValue({
      ...possessedProjection,
      possessionTarget: { mode: "unbound" },
    });

    await adapter.animate(0);
    await adapter.animate(17);

    expect(adjustCameraView).not.toHaveBeenCalled();
    expect(adapter.getArrowInputDiagnosticSnapshot()).toMatchObject({
      yawRadiansPerFixedTick: 0,
      pitchRadiansPerFixedTick: 0,
      lastClearReason: "possession-unbound",
    });
  });

  it("clears held physical input and Arrow inertia before a direct possession rebind", async () => {
    const { adapter, runtime } = createAdapterProbe();
    await adapter.runFixedInput([{
      actions: ["cameraLeft", "cameraDown"],
      ticks: 12,
    }]);
    adapter.keyboardInput.press("KeyW");
    adapter.cameraInput.add("cameraLeft");
    const adjustCameraView = vi.spyOn(runtime, "adjustCameraView");
    adjustCameraView.mockClear();
    const possessedProjection = runtime.snapshot();
    const subject = possessedProjection.subjectStatesByEntityId.player!;
    vi.spyOn(runtime, "snapshot").mockReturnValue({
      ...possessedProjection,
      possessionTarget: { mode: "possessed", controlledEntityId: "player-b" },
      subjectStatesByEntityId: {
        ...possessedProjection.subjectStatesByEntityId,
        "player-b": { ...subject, entityId: "player-b" },
      },
    });

    await adapter.animate(0);
    await adapter.animate(17);

    expect(runtime.runFixedInput).toHaveBeenLastCalledWith({ actions: [], ticks: 1 });
    expect(adjustCameraView).not.toHaveBeenCalled();
    expect(adapter.keyboardInput.actions()).toEqual([]);
    expect(adapter.cameraInput).toEqual(new Set());
    expect(adapter.getArrowInputDiagnosticSnapshot()).toMatchObject({
      yawRadiansPerFixedTick: 0,
      pitchRadiansPerFixedTick: 0,
      lastClearReason: "possession-rebind",
    });
  });

  it("uses a locked Canonical Scene Plan and Runtime Bootstrap at the adapter boundary", () => {
    expect(LOCKED_EXECUTION_PLAN_V5).toMatchObject({
      kind: "worldkit-canonical-scene-execution-plan",
      schemaVersion: 1,
    });
    expect(LOCKED_WORLD_RUNTIME_BOOTSTRAP.runtimeResourceLockEntries).toContainEqual(
      expect.objectContaining({ resourceKind: "gameplay-bootstrap" }),
    );
    expect(featureInspections(
      LOCKED_EXECUTION_PLAN_V5,
      LOCKED_WORLD_RUNTIME_BOOTSTRAP,
    )).not.toHaveLength(0);
  });

  it("accumulates fixed simulation ticks independently from display frames", async () => {
    const { adapter, runtime } = createAdapterProbe();

    await adapter.animate(8);
    expect(runtime.runFixedInput).not.toHaveBeenCalled();
    expect(adapter.snapshot().performance.fps).toBe(125);

    await adapter.animate(17);
    await adapter.animate(51);
    expect(runtime.runFixedInput.mock.calls.map(([input]) => input.ticks)).toEqual([1, 2]);
  });

  it("renders live frames with accumulator alpha while explicit and paused renders stay committed", async () => {
    const { adapter, runtime } = createAdapterProbe();

    await adapter.animate(0);
    runtime.renderFrame.mockClear();
    await adapter.animate(1_000 / 120);
    expect(runtime.renderFrame).toHaveBeenLastCalledWith(0.5);

    adapter.render();
    expect(runtime.renderFrame).toHaveBeenLastCalledWith(1);

    adapter.setPaused(true);
    runtime.renderFrame.mockClear();
    await adapter.animate(1_000 / 60);
    expect(runtime.renderFrame).toHaveBeenLastCalledWith(1);
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

  it.each([
    {
      action: "cameraLeft" as const,
      component: "yaw" as const,
      direction: 1,
      maximumRadiansPerTick: 0.025,
    },
    {
      action: "cameraRight" as const,
      component: "yaw" as const,
      direction: -1,
      maximumRadiansPerTick: 0.025,
    },
    {
      action: "cameraUp" as const,
      component: "pitch" as const,
      direction: -1,
      maximumRadiansPerTick: 0.015,
    },
    {
      action: "cameraDown" as const,
      component: "pitch" as const,
      direction: 1,
      maximumRadiansPerTick: 0.015,
    },
  ])(
    "ramps $action to its existing maximum speed over 0.20 seconds",
    async ({ action, component, direction, maximumRadiansPerTick }) => {
      const { adapter } = createAdapterProbe();
      const initialValue = adapter.snapshot().camera[component];

      const firstTick = await adapter.runFixedInput([{
        actions: [action],
        ticks: 1,
      }]);
      expect(firstTick.camera[component] - initialValue).toBeCloseTo(
        direction * maximumRadiansPerTick / 12,
        10,
      );

      const accelerationComplete = await adapter.runFixedInput([{
        actions: [action],
        ticks: 11,
      }]);
      expect(accelerationComplete.camera[component] - initialValue).toBeCloseTo(
        direction * maximumRadiansPerTick * 6.5,
        10,
      );

      const atMaximumSpeed = await adapter.runFixedInput([{
        actions: [action],
        ticks: 1,
      }]);
      expect(
        direction * (
          atMaximumSpeed.camera[component] -
          accelerationComplete.camera[component]
        ),
      ).toBeCloseTo(maximumRadiansPerTick, 10);
      expect(adapter.getArrowInputDiagnosticSnapshot()).toMatchObject(
        component === "yaw"
          ? { yawRadiansPerFixedTick: direction * maximumRadiansPerTick }
          : { pitchRadiansPerFixedTick: direction * maximumRadiansPerTick },
      );
    },
  );

  it("glides for 0.15 seconds after keyboard camera input is released", async () => {
    const { adapter } = createAdapterProbe();
    const atRelease = await adapter.runFixedInput([{
      actions: ["cameraLeft"],
      ticks: 12,
    }]);

    const firstReleaseTick = await adapter.runFixedInput([{
      actions: [],
      ticks: 1,
    }]);
    expect(firstReleaseTick.camera.yaw - atRelease.camera.yaw).toBeCloseTo(
      0.025 * 8 / 9,
      10,
    );

    const stopped = await adapter.runFixedInput([{
      actions: [],
      ticks: 8,
    }]);
    expect(stopped.camera.yaw).toBeCloseTo(0.2625, 10);
    expect(adapter.getArrowInputDiagnosticSnapshot().yawRadiansPerFixedTick).toBe(0);

    const afterStopping = await adapter.runFixedInput([{
      actions: [],
      ticks: 5,
    }]);
    expect(afterStopping.camera.yaw).toBeCloseTo(stopped.camera.yaw, 10);
  });

  it("keeps a multi-tick camera step inside one fixed-input mutation batch", async () => {
    const { adapter, runtime } = createAdapterProbe();

    await adapter.runFixedInput([{
      actions: ["cameraLeft"],
      ticks: 5,
    }]);

    expect(runtime.runFixedInput).toHaveBeenCalledOnce();
    expect(runtime.runFixedInput).toHaveBeenCalledWith({ actions: [], ticks: 5 });
  });

  it("integrates the same 0.20-second ramp at 30, 60, and 120 Hz display cadence", async () => {
    const yawAfterOneSecondAt = async (displayFramesPerSecond: number) => {
      const { adapter } = createAdapterProbe();
      adapter.cameraInput.add("cameraLeft");
      for (let frame = 1; frame <= displayFramesPerSecond; frame += 1) {
        await adapter.animate(frame * 1_000 / displayFramesPerSecond);
      }
      return adapter.snapshot().camera.yaw;
    };

    await expect(yawAfterOneSecondAt(30)).resolves.toBeCloseTo(1.3625, 10);
    await expect(yawAfterOneSecondAt(60)).resolves.toBeCloseTo(1.3625, 10);
    await expect(yawAfterOneSecondAt(120)).resolves.toBeCloseTo(1.3625, 10);
  });

  it.each([
    { initiallyPaused: false },
    { initiallyPaused: true },
  ])(
    "pauses reset and publishes the restored pause state (initiallyPaused=$initiallyPaused)",
    async ({ initiallyPaused }) => {
      const { adapter, runtime, setCoordinatorPaused } = createAdapterProbe();
      let pausedWhileReplacing = false;
      runtime.reset.mockImplementation(() => {
        pausedWhileReplacing = adapter.isPaused();
        return runtimeSnapshot(0);
      });
      adapter.setPaused(initiallyPaused);
      setCoordinatorPaused.mockClear();
      const publishedPauseStates: boolean[] = [];
      const unsubscribe = adapter.subscribe((snapshot) => {
        publishedPauseStates.push(snapshot.paused);
      });
      publishedPauseStates.length = 0;

      const reset = await adapter.resetRuntime();

      expect(pausedWhileReplacing).toBe(true);
      expect(adapter.isPaused()).toBe(initiallyPaused);
      expect(reset.runtime.isPaused).toBe(initiallyPaused);
      expect(publishedPauseStates).toEqual([initiallyPaused]);
      expect(setCoordinatorPaused.mock.calls).toEqual([
        [true],
        [initiallyPaused],
      ]);
      unsubscribe();
    },
  );

  it("clears held movement and keyboard camera inertia across a protocol reset", async () => {
    const { adapter, runtime } = createAdapterProbe();
    await adapter.runFixedInput([{
      actions: ["cameraLeft"],
      ticks: 12,
    }]);
    adapter.keyboardInput.press("KeyW");
    adapter.cameraInput.add("cameraLeft");

    await adapter.resetRuntime();
    await adapter.animate(0);
    await adapter.animate(17);

    expect(runtime.runFixedInput).toHaveBeenLastCalledWith({ actions: [], ticks: 1 });
    expect(adapter.snapshot().camera.yaw).toBe(0);
    expect(adapter.getArrowInputDiagnosticSnapshot()).toMatchObject({
      yawRadiansPerFixedTick: 0,
      pitchRadiansPerFixedTick: 0,
      lastClearReason: "simulation-reset",
    });
  });

  it("clears residual keyboard camera inertia when the window loses focus", async () => {
    const { adapter } = createAdapterProbe();
    const beforeBlur = await adapter.runFixedInput([{
      actions: ["cameraLeft"],
      ticks: 12,
    }]);

    adapter.clearPhysicalInputState("blur");
    await adapter.animate(0);
    await adapter.animate(17);

    expect(adapter.snapshot().camera.yaw).toBeCloseTo(beforeBlur.camera.yaw, 10);
    expect(adapter.getArrowInputDiagnosticSnapshot()).toMatchObject({
      yawRadiansPerFixedTick: 0,
      pitchRadiansPerFixedTick: 0,
      lastClearReason: "blur",
    });
  });

  it("publishes frozen Arrow input limits and instantaneous fixed-tick velocities", async () => {
    const { adapter } = createAdapterProbe();

    const startup = adapter.getArrowInputDiagnosticSnapshot();
    expect(Object.isFrozen(startup)).toBe(true);
    expect(startup).toEqual({
      maximumYawRadiansPerFixedTick: 0.025,
      maximumPitchRadiansPerFixedTick: 0.015,
      keyboardAccelerationSeconds: 0.20,
      keyboardDecelerationSeconds: 0.15,
      yawRadiansPerFixedTick: 0,
      pitchRadiansPerFixedTick: 0,
      lastClearReason: "startup",
    });

    await adapter.runFixedInput([{ actions: ["cameraLeft", "cameraDown"], ticks: 1 }]);

    const active = adapter.getArrowInputDiagnosticSnapshot();
    expect(Object.isFrozen(active)).toBe(true);
    expect(active.yawRadiansPerFixedTick).toBeCloseTo(0.025 / 12, 12);
    expect(active.pitchRadiansPerFixedTick).toBeCloseTo(0.015 / 12, 12);
    expect(active.lastClearReason).toBe("startup");
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

function houseNorthExecutionObject(): CanonicalSceneExecutionPlanV1["objects"][number] {
  return {
    entityId: "house-north",
    prototypeId: "house-blockout",
    primitive: { kind: "box", sizeMetersXYZ: [8, 5, 10] },
    transform: {
      positionMetersXYZ: [18, 2.5, -24],
      rotationEulerRadiansXYZ: [0, 0, 0],
      scaleXYZ: [1, 1, 1],
    },
    collisionEnabled: true,
    semanticClassId: "structure.house",
  };
}

function withHouseNorth(plan: CanonicalSceneExecutionPlanV1): CanonicalSceneExecutionPlanV1 {
  return {
    ...plan,
    objects: [houseNorthExecutionObject(), ...plan.objects],
  };
}

function createFakeCanvas(id: string) {
  return {
    id,
    width: 640,
    height: 360,
    className: "",
    tabIndex: 0,
    style: {} as CSSStyleDeclaration,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    replaceWith: vi.fn(),
    focus: vi.fn(),
  };
}

function createPublicationSurfaceProbe(options: {
  readonly result: PublishWorldReplacementResultV1;
  readonly publishedPlan?: CanonicalSceneExecutionPlanV1;
}) {
  let tick = 0;
  const cameraView = { yawRadians: 0, pitchRadians: 0, distanceMeters: 0 };
  const previousCanvas = createFakeCanvas("previous-world-canvas");
  const nextCanvas = createFakeCanvas("next-world-canvas");
  let activeCanvas = previousCanvas;
  const runtime = {
    snapshot: () => runtimeSnapshot(tick, cameraView),
    resize: vi.fn(),
    renderFrameWhenReady: vi.fn(async () => ({
      kind: "worldkit-render-ready-receipt",
      schemaVersion: 1,
      id: "render-ready:replacement:0",
      runtimeSessionId: "runtime-session-test",
      simulationTick: 0,
      renderFrameIndex: 0,
    })),
    runFixedInput: vi.fn(),
    renderFrame: vi.fn(),
    reset: vi.fn(),
    adjustCameraView: vi.fn(),
  };
  const coordinator = {
    activeRuntime: () => runtime,
    activeCanvas: () => activeCanvas,
    snapshot: () => publicRuntimeSnapshot(runtime.snapshot()),
    publishWorldReplacementV1: vi.fn(async () => {
      if (options.result.status === "published") {
        activeCanvas = nextCanvas;
      }
      return options.result;
    }),
  };
  const adapter = Object.assign(Object.create(BabylonWorldAdapter.prototype), {
    executionPlan: LOCKED_EXECUTION_PLAN_V5,
    worldRuntimeBootstrap: LOCKED_WORLD_RUNTIME_BOOTSTRAP,
    initialExecutionPlan: LOCKED_EXECUTION_PLAN_V5,
    initialWorldRuntimeBootstrap: LOCKED_WORLD_RUNTIME_BOOTSTRAP,
    initialInspections: structuredClone(featureInspections(
      LOCKED_EXECUTION_PLAN_V5,
      LOCKED_WORLD_RUNTIME_BOOTSTRAP,
    )),
    coordinator,
    keyboardInput: new PhysicalKeyboardActionTracker(),
    cameraInput: new Set<string>(),
    keyboardCameraYawRadiansPerTick: 0,
    keyboardCameraPitchRadiansPerTick: 0,
    lastArrowInputClearReason: "startup",
    lastPossessedControlledEntityId: "player",
    inspections: structuredClone(featureInspections(
      LOCKED_EXECUTION_PLAN_V5,
      LOCKED_WORLD_RUNTIME_BOOTSTRAP,
    )),
    listeners: new Set(),
    disposed: false,
    paused: false,
    animationPending: false,
    animationFrameId: null,
    frame: 0,
    captureActivitySequence: 0,
    visualCaptureGroups: [],
    previousAnimationTimestampMilliseconds: 0,
    fixedStepAccumulatorSeconds: 0,
    displayFramesPerSecond: 0,
    mountedContainer: { id: "viewport" },
    handleCameraPointerDown: vi.fn(),
    handleCameraPointerMove: vi.fn(),
    handleCameraPointerUp: vi.fn(),
    handleCameraWheel: vi.fn(),
  }) as unknown as BabylonWorldAdapter;
  return {
    adapter,
    previousCanvas,
    nextCanvas,
    coordinator,
    runtime,
    publishedPlan: options.publishedPlan ?? withHouseNorth(LOCKED_EXECUTION_PLAN_V5),
  };
}

const PUBLISHED_REPLACEMENT = {
  status: "published",
  publication: {},
  previous: {
    runtimeSessionId: "runtime-session-test",
    worldSessionId: "world-session-31",
    worldPackageRootHash: `sha256:${"d".repeat(64)}`,
    simulationTick: 4,
  },
  current: {
    runtimeSessionId: "runtime-session-test",
    worldSessionId: "world-session-32",
    worldPackageRootHash: `sha256:${"e".repeat(64)}`,
    simulationTick: 0,
  },
  cleanup: {
    status: "released",
    diagnostics: [],
  },
} as unknown as PublishWorldReplacementResultV1;

describe("BabylonWorldAdapter Full Reload visible surface", () => {
  it("adopts the replacement canvas and inspections after a published world replacement", async () => {
    const { adapter, previousCanvas, nextCanvas, publishedPlan, runtime } =
      createPublicationSurfaceProbe({ result: PUBLISHED_REPLACEMENT });

    expect(adapter.inspectFeatures().some((feature) => feature.id === "house-north"))
      .toBe(false);

    const result = await adapter.publishWorldReplacementV1({
      worldConfiguration: {
        sceneSource: {
          kind: "canonical-execution-plan",
          executionPlan: publishedPlan,
        },
        worldRuntimeBootstrap: LOCKED_WORLD_RUNTIME_BOOTSTRAP,
      },
      publication: {},
      persistDurableCommit: () => undefined,
    });

    expect(result.status).toBe("published");
    expect(previousCanvas.replaceWith).toHaveBeenCalledWith(nextCanvas);
    expect(nextCanvas.focus).toHaveBeenCalledOnce();
    expect(runtime.renderFrameWhenReady).toHaveBeenCalledOnce();
    expect(adapter.inspectFeatures().some((feature) => feature.id === "house-north"))
      .toBe(true);
  });

  it("keeps the visible canvas and inspections when publication is rejected", async () => {
    const { adapter, previousCanvas, publishedPlan } = createPublicationSurfaceProbe({
      result: {
        status: "rejected",
        failureKind: "expectation-stale",
        message: "WORLD_CHANGE_RUNTIME_EXPECTATION_STALE",
      },
    });

    const result = await adapter.publishWorldReplacementV1({
      worldConfiguration: {
        sceneSource: {
          kind: "canonical-execution-plan",
          executionPlan: publishedPlan,
        },
        worldRuntimeBootstrap: LOCKED_WORLD_RUNTIME_BOOTSTRAP,
      },
      publication: {},
    });

    expect(result.status).toBe("rejected");
    expect(previousCanvas.replaceWith).not.toHaveBeenCalled();
    expect(adapter.inspectFeatures().some((feature) => feature.id === "house-north"))
      .toBe(false);
  });

  it("still swaps the visible canvas when the published plan cannot be parsed", async () => {
    const { adapter, previousCanvas, nextCanvas, runtime } = createPublicationSurfaceProbe({
      result: PUBLISHED_REPLACEMENT,
    });

    const result = await adapter.publishWorldReplacementV1({
      worldConfiguration: {
        sceneSource: {
          kind: "canonical-execution-plan",
          executionPlan: { kind: "not-an-execution-plan" },
        },
        worldRuntimeBootstrap: LOCKED_WORLD_RUNTIME_BOOTSTRAP,
      },
      publication: {},
    });

    expect(result.status).toBe("published");
    expect(previousCanvas.replaceWith).toHaveBeenCalledWith(nextCanvas);
    expect(runtime.renderFrameWhenReady).toHaveBeenCalledOnce();
    expect(adapter.inspectFeatures().some((feature) => feature.id === "house-north"))
      .toBe(false);
  });
});

describe("PhysicalKeyboardActionTracker split-jump latch", () => {
  it("preserves the Shift state from a Space press until the next fixed sample", () => {
    const tracker = new PhysicalKeyboardActionTracker();

    tracker.press("ShiftLeft");
    tracker.press("Space");
    tracker.release("Space");
    tracker.release("ShiftLeft");
    expect(tracker.actions()).toEqual(["jump", "run"]);
    expect(tracker.actions()).toEqual([]);

    tracker.press("Space");
    tracker.release("Space");
    expect(tracker.actions()).toEqual(["jump"]);
    expect(tracker.actions()).toEqual([]);

    tracker.press("KeyW");
    tracker.press("ShiftRight");
    tracker.press("Space");
    tracker.release("Space");
    tracker.release("ShiftRight");
    expect(tracker.actions()).toEqual(["move-forward", "jump", "run"]);
    expect(tracker.actions()).toEqual(["move-forward"]);
  });
});
