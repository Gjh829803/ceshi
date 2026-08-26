import { describe, expect, it, vi } from "vitest";

import {
  compileSimulationTakeV1,
  type SimulationTakeV1,
} from "@whitebox-world/control-capture";
import type {
  ControlCapturePassPayloadV1,
  RuntimeActivityReceiptV1,
  RuntimeControlCaptureFrameV1,
  WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";

import {
  runCompiledSimulationTakeV1,
  type SimulationTakeBrowserDriverV1,
} from "./simulation-take-runner";

const WORLD_HASH = `sha256:${"a".repeat(64)}` as const;

function takeFixture(): SimulationTakeV1 {
  return {
    kind: "worldkit-simulation-take",
    schemaVersion: 1,
    id: "runner-test",
    worldPackageRef: "worldkit://world-package/runner-test@1",
    worldPackageRootHash: WORLD_HASH,
    seed: 1,
    simulationTickRate: { numeratorTicks: 60, denominatorSeconds: 1 },
    startTick: 0,
    endTickExclusive: 5,
    controllers: [{
      id: "controller-primary",
      kind: "scripted",
      controlledEntityId: "player",
      controlProfileRef: "worldkit://control/character-relative-camera@1",
      initialSequence: 0,
    }],
    tracks: [{
      id: "movement",
      kind: "control-intent",
      controllerId: "controller-primary",
      interpolation: "step",
      keyframes: [{
        tick: 0,
        moveAxesXZ: [0, 1],
        runEnabled: false,
        jumpPressed: false,
      }, {
        tick: 2,
        moveAxesXZ: [1, 0],
        runEnabled: true,
        jumpPressed: true,
      }],
    }, {
      id: "camera",
      kind: "camera-rig",
      cameraEntityId: "camera-main",
      cameraRigRef: "worldkit://camera-rig/third-person-orbit@1",
      interpolation: "step",
      keyframes: [{
        tick: 0,
        viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0,
        viewDistanceOffsetMeters: 0,
      }, {
        tick: 3,
        viewYawOffsetRadians: 0.5,
        viewPitchOffsetRadians: -0.1,
        viewDistanceOffsetMeters: 0.25,
      }],
    }],
    captureSchedule: {
      kind: "explicit-ticks",
      captureTicks: [0, 2, 4],
      renderInterpolation: { kind: "none" },
    },
    captureProfileRef: "worldkit://capture/profile/control-video@1",
    captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1",
  };
}

function snapshot(
  tick: number,
  options: {
    readonly worldSessionId?: string;
    readonly possessedEntityId?: string;
  } = {},
): WorldRuntimeSnapshotV4 {
  const worldSessionId = options.worldSessionId ?? "world-session-test";
  const possessedEntityId = options.possessedEntityId;
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: "runtime-session-test",
    worldSessionId,
    world: {
      publicationEpoch: 1,
      simulationTick: tick,
      worldStateRef: `world-state:${worldSessionId}:${tick}`,
      worldStateHash: WORLD_HASH,
      subjectStatesByEntityId: {
        player: {
          entityState: {
            id: "player",
            kind: "spatial-entity-state",
            entityDefinitionRef: "worldkit://subject-definition/test@1",
            entityDefinitionHash: WORLD_HASH,
            semanticClassId: "subject.player",
            lifecycleMode: "active",
            positionMetersXYZ: [0, 0, 0],
            rotationQuaternionXYZW: [0, 0, 0, 1],
            scaleRatioXYZ: [1, 1, 1],
            linearVelocityMetersPerSecondXYZ: [0, 0, 0],
          },
          capabilityStatesById: {},
        },
      },
      gameplayInspection: {
        kind: "worldkit-gameplay-inspection-snapshot",
        schemaVersion: 1,
        projection: "inspection",
        id: `gameplay-inspection:${worldSessionId}:${tick}`,
        runtimeSessionId: "runtime-session-test",
        worldSessionId,
        gameplayModeRef: "worldkit://gameplay-mode/outdoor.default@1",
        phase: "ready",
        simulationTick: tick,
        participantStatesById: {
          "participant-primary": { id: "participant-primary", mode: "active" },
        },
        controllerStatesById: {
          "controller-primary": {
            id: "controller-primary",
            participantId: "participant-primary",
          },
        },
        relationshipStatesById: possessedEntityId === undefined
          ? {}
          : {
              "possessed-by-primary": {
                id: "possessed-by-primary",
                type: "possessedBy",
                schemaVersion: 1,
                controlledEntityId: possessedEntityId,
                controllerEntityId: "controller-primary",
                establishedSimulationTick: tick,
              },
            },
        activeActionStatesById: {},
        activatedGameplayFeatureRefs: [],
        lastEventSequence: 0,
      },
    },
    view: {
      viewStateRevision: tick,
      camera: {
        mode: "tracking",
        id: "camera-main",
        targetEntityId: "player",
        positionMetersXYZ: [0, 2, 4],
        activeCameraProfileRef: "worldkit://camera-profile/test@1",
        activeCameraRigRef: "worldkit://camera-rig/test@1",
        activeCameraModifierRefs: [],
        safeFallbackActive: false,
        viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0,
        viewDistanceOffsetMeters: 0,
        fixedStepDeltaSeconds: 1 / 60,
      },
    },
    runtime: {
      phase: "ready",
      isPaused: true,
      fixedTimeStepSeconds: 1 / 60,
    },
    resources: {
      phase: "ready",
      meshCount: 1,
      physicsBodyCount: 1,
      terrainSampleCount: 4,
    },
  };
}

function payload(
  passId: ControlCapturePassPayloadV1["passId"],
  encoding: ControlCapturePassPayloadV1["encoding"],
  byteLength: number,
): ControlCapturePassPayloadV1 {
  return {
    passId,
    mediaType: passId === "neutral-color" ? "image/png" : "application/octet-stream",
    encoding,
    byteLength,
    contentHash: WORLD_HASH,
    bytesBase64: "AA==",
  };
}

function frame(captureFrameIndex: number, simulationTick: number): RuntimeControlCaptureFrameV1 {
  return {
    kind: "worldkit-control-capture-frame",
    schemaVersion: 1,
    runtimeSessionId: "runtime-session-test",
    captureFrameIndex,
    simulationTick,
    renderFrameIndex: simulationTick,
    renderReadyReceiptId: `receipt-${simulationTick}`,
    widthPixels: 2,
    heightPixels: 1,
    camera: {
      cameraEntityId: "camera-main",
      cameraRigRef: "worldkit://camera-rig/third-person-orbit@1",
      positionMetersXYZ: [0, 2, 4],
      forwardXYZ: [0, 0, -1],
      upXYZ: [0, 1, 0],
      verticalFovRadians: 1,
      nearClipMeters: 0.05,
      farClipMeters: 1_000,
      viewMatrixColumnMajor: Array.from({ length: 16 }, (_, index) => index),
      projectionMatrixColumnMajor: Array.from({ length: 16 }, (_, index) => index),
    },
    snapshot: snapshot(simulationTick),
    semanticClasses: [{ numericId: 1, semanticClassId: "actor.player" }],
    instances: [{ numericId: 1, entityId: "player", semanticClassId: "actor.player" }],
    passesById: {
      "neutral-color": payload("neutral-color", "png-rgba8-srgb", 1),
      "linear-depth-meters": payload("linear-depth-meters", "float32-le", 8),
      "semantic-class-id": payload("semantic-class-id", "uint32-le", 8),
      "instance-id": payload("instance-id", "uint32-le", 8),
      "world-normal": payload("world-normal", "float32x3-le", 24),
    },
  };
}

function driverFixture(options: {
  readonly resetPossessedEntityId?: string;
} = {}): SimulationTakeBrowserDriverV1 & {
  readonly fixedInputs: Array<{ actions: readonly string[]; ticks: number }>;
  readonly cameraInputs: Array<Record<string, number>>;
  readonly operationOrder: string[];
  readonly gameplayCommands: unknown[];
  readonly activityRequests: unknown[];
} {
  let tick = 0;
  let worldSessionId = "world-session-before-reset";
  const fixedInputs: Array<{ actions: readonly string[]; ticks: number }> = [];
  const cameraInputs: Array<Record<string, number>> = [];
  const operationOrder: string[] = [];
  const gameplayCommands: unknown[] = [];
  const activityRequests: unknown[] = [];
  return {
    fixedInputs,
    cameraInputs,
    operationOrder,
    gameplayCommands,
    activityRequests,
    getControlCaptureCapabilities: () => ({
      kind: "worldkit-control-capture-capabilities",
      schemaVersion: 1,
      available: true,
      captureProfileRef: "worldkit://capture/profile/control-video@1",
      captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1",
      requiredPassIds: [
        "neutral-color", "linear-depth-meters", "semantic-class-id", "instance-id", "world-normal",
      ],
      maximumWidthPixels: 64,
      maximumHeightPixels: 64,
      diagnostics: [],
    }),
    setPaused: () => snapshot(tick, { worldSessionId }),
    reset: async () => {
      operationOrder.push("reset");
      tick = 0;
      worldSessionId = "world-session-after-reset";
      return snapshot(tick, options.resetPossessedEntityId === undefined
        ? { worldSessionId }
        : { worldSessionId, possessedEntityId: options.resetPossessedEntityId });
    },
    acquireRuntimeActivity: (request) => {
      operationOrder.push("acquire");
      activityRequests.push(request);
      return {
        kind: "worldkit-runtime-activity-receipt",
        schemaVersion: 1,
        requestId: request.id,
        activityKind: request.activityKind,
        worldSessionId,
        runtimeActivityEpoch: 1,
        status: "active",
      };
    },
    releaseRuntimeActivity: (request) => {
      operationOrder.push("release");
      activityRequests.push(request);
      return {
        kind: "worldkit-runtime-activity-receipt",
        schemaVersion: 1,
        requestId: request.id,
        activityKind: request.activityKind,
        worldSessionId,
        runtimeActivityEpoch: 2,
        status: "released",
      };
    },
    executeGameplayCommand: async (command) => {
      operationOrder.push("bind");
      gameplayCommands.push(command);
      return {
        kind: "worldkit-gameplay-command-receipt",
        schemaVersion: 1,
        id: "receipt:simulation-take:control.bind",
        runtimeSessionId: command.runtimeSessionId,
        worldSessionId: command.worldSessionId,
        commandId: command.id,
        commandHash: WORLD_HASH,
        commandType: command.type,
        simulationTick: tick,
        status: "committed",
        eventIds: ["gameplay-event:world-session-after-reset:1"],
        worldStateAfterRef: "world-state:world-session-after-reset:0",
        worldStateAfterHash: WORLD_HASH,
      };
    },
    runFixedInput: async (steps) => {
      operationOrder.push("input");
      for (const step of steps) {
        fixedInputs.push(step);
        tick += step.ticks;
      }
      return snapshot(tick, { worldSessionId, possessedEntityId: "player" });
    },
    adjustCameraView: (input) => {
      cameraInputs.push(input as Record<string, number>);
      return snapshot(tick, { worldSessionId, possessedEntityId: "player" });
    },
    waitForSimulationTick: async (expectedSimulationTick) => {
      if (tick !== expectedSimulationTick) throw new Error("wrong tick");
      return snapshot(tick, { worldSessionId, possessedEntityId: "player" });
    },
    waitForRenderReady: async (expectedSimulationTick) => ({
      kind: "worldkit-render-ready-receipt",
      schemaVersion: 1,
      id: `receipt-${expectedSimulationTick}`,
      runtimeSessionId: "runtime-session-test",
      simulationTick: expectedSimulationTick,
      renderFrameIndex: expectedSimulationTick,
    }),
    captureControlFrame: async (request) => {
      operationOrder.push("capture");
      return frame(request.captureFrameIndex, request.expectedSimulationTick);
    },
  };
}

describe("runCompiledSimulationTakeV1", () => {
  it("applies step intents on exact ticks, fires jump once, and captures only scheduled ticks", async () => {
    const driver = driverFixture();
    const onFrame = vi.fn();

    const result = await runCompiledSimulationTakeV1({
      compiledTake: compileSimulationTakeV1(takeFixture()),
      driver,
      widthPixels: 2,
      heightPixels: 1,
      onFrame,
    });

    expect(driver.fixedInputs).toEqual([
      { actions: ["move-forward"], ticks: 1 },
      { actions: ["move-forward"], ticks: 1 },
      { actions: ["move-right", "jump", "run"], ticks: 1 },
      { actions: ["move-right", "run"], ticks: 1 },
      { actions: ["move-right", "run"], ticks: 1 },
    ]);
    expect(driver.cameraInputs).toEqual([
      { yawDeltaRadians: 0, pitchDeltaRadians: 0, zoomDeltaMeters: 0 },
      { yawDeltaRadians: 0.5, pitchDeltaRadians: -0.1, zoomDeltaMeters: 0.25 },
    ]);
    expect(onFrame.mock.calls.map(([captured]) => captured.simulationTick)).toEqual([0, 2, 4]);
    expect(result).toEqual({
      capturedFrameCount: 3,
      runtimeSessionId: "runtime-session-test",
      semanticClasses: [{ numericId: 1, semanticClassId: "actor.player" }],
      instances: [{ numericId: 1, entityId: "player", semanticClassId: "actor.player" }],
    });
    expect(driver.operationOrder[0]).toBe("reset");
    expect(driver.operationOrder[1]).toBe("acquire");
    expect(driver.operationOrder[2]).toBe("bind");
    expect(driver.operationOrder.at(-1)).toBe("release");
    expect(driver.operationOrder.indexOf("capture")).toBeGreaterThan(
      driver.operationOrder.indexOf("acquire"),
    );
    expect(driver.operationOrder.lastIndexOf("capture")).toBeLessThan(
      driver.operationOrder.indexOf("release"),
    );
    expect(driver.activityRequests).toEqual([
      {
        schemaVersion: 1,
        id: "activity:simulation-take:runner-test:world-session-after-reset",
        activityKind: "simulation-take",
        expectedWorldSessionId: "world-session-after-reset",
      },
      {
        schemaVersion: 1,
        id: "activity:simulation-take:runner-test:world-session-after-reset",
        activityKind: "simulation-take",
        expectedWorldSessionId: "world-session-after-reset",
      },
    ]);
    expect(driver.gameplayCommands).toEqual([{
      schemaVersion: 1,
      id: "command:simulation-take:runner-test:world-session-after-reset:control.bind",
      type: "control.bind",
      runtimeSessionId: "runtime-session-test",
      worldSessionId: "world-session-after-reset",
      controllerEntityId: "controller-primary",
      controlledEntityId: "player",
      expectedPossession: { mode: "unbound" },
    }]);
  });

  it("derives the bind precondition from the authoritative possession relationship", async () => {
    const driver = driverFixture({
      resetPossessedEntityId: "former-player",
    });

    await runCompiledSimulationTakeV1({
      compiledTake: compileSimulationTakeV1(takeFixture()),
      driver,
      widthPixels: 2,
      heightPixels: 1,
      onFrame: async () => undefined,
    });

    expect(driver.gameplayCommands[0]).toMatchObject({
      expectedPossession: {
        mode: "possessed",
        controlledEntityId: "former-player",
      },
    });
  });

  it("keeps the reset binding when the controller already possesses the requested entity", async () => {
    const driver = driverFixture({
      resetPossessedEntityId: "player",
    });

    await runCompiledSimulationTakeV1({
      compiledTake: compileSimulationTakeV1(takeFixture()),
      driver,
      widthPixels: 2,
      heightPixels: 1,
      onFrame: async () => undefined,
    });

    expect(driver.gameplayCommands).toEqual([]);
    expect(driver.operationOrder).not.toContain("bind");
    expect(driver.operationOrder).toContain("capture");
    expect(driver.operationOrder.at(-1)).toBe("release");
  });

  it("fails closed on rejected Activity acquisition before bind, input, or capture", async () => {
    const driver = driverFixture();
    driver.acquireRuntimeActivity = (request) => ({
      kind: "worldkit-runtime-activity-receipt",
      schemaVersion: 1,
      requestId: request.id,
      activityKind: request.activityKind,
      worldSessionId: request.expectedWorldSessionId,
      runtimeActivityEpoch: 1,
      status: "rejected",
      diagnostic: {
        code: "WORLD_SESSION_STALE",
        message: "The expected World Session is stale.",
      },
    });

    await expect(runCompiledSimulationTakeV1({
      compiledTake: compileSimulationTakeV1(takeFixture()),
      driver,
      widthPixels: 2,
      heightPixels: 1,
      onFrame: async () => undefined,
    })).rejects.toThrow("SIMULATION_TAKE_ACTIVITY_ACQUIRE_REJECTED");
    expect(driver.gameplayCommands).toEqual([]);
    expect(driver.fixedInputs).toEqual([]);
    expect(driver.operationOrder).not.toContain("capture");
    expect(driver.operationOrder).not.toContain("release");
  });

  it("fails closed on a stale bind receipt and releases the outer Activity", async () => {
    const driver = driverFixture();
    driver.executeGameplayCommand = async (command) => ({
      kind: "worldkit-gameplay-command-receipt",
      schemaVersion: 1,
      id: "receipt:simulation-take:control.bind:rejected",
      runtimeSessionId: command.runtimeSessionId,
      worldSessionId: command.worldSessionId,
      commandId: command.id,
      commandHash: WORLD_HASH,
      commandType: command.type,
      simulationTick: 0,
      status: "rejected",
      eventIds: [],
      diagnostic: {
        code: "CONTROL_POSSESSION_STALE",
        message: "The possession precondition is stale.",
      },
    });

    await expect(runCompiledSimulationTakeV1({
      compiledTake: compileSimulationTakeV1(takeFixture()),
      driver,
      widthPixels: 2,
      heightPixels: 1,
      onFrame: async () => undefined,
    })).rejects.toThrow("SIMULATION_TAKE_CONTROL_BINDING_REJECTED");
    expect(driver.fixedInputs).toEqual([]);
    expect(driver.operationOrder.at(-1)).toBe("release");
  });

  it("does not let a rejected late release replace the primary capture failure", async () => {
    const driver = driverFixture();
    driver.captureControlFrame = async () => {
      throw new Error("CAPTURE_PRIMARY_FAILURE");
    };
    driver.releaseRuntimeActivity = (request) => ({
      kind: "worldkit-runtime-activity-receipt",
      schemaVersion: 1,
      requestId: request.id,
      activityKind: request.activityKind,
      worldSessionId: request.expectedWorldSessionId,
      runtimeActivityEpoch: 2,
      status: "rejected",
      diagnostic: {
        code: "RUNTIME_ACTIVITY_ID_CONFLICT",
        message: "The retained request differs.",
      },
    } satisfies RuntimeActivityReceiptV1);

    await expect(runCompiledSimulationTakeV1({
      compiledTake: compileSimulationTakeV1(takeFixture()),
      driver,
      widthPixels: 2,
      heightPixels: 1,
      onFrame: async () => undefined,
    })).rejects.toThrow("CAPTURE_PRIMARY_FAILURE");
  });

  it("fails closed when release is rejected after an otherwise successful Take", async () => {
    const driver = driverFixture();
    driver.releaseRuntimeActivity = (request) => ({
      kind: "worldkit-runtime-activity-receipt",
      schemaVersion: 1,
      requestId: request.id,
      activityKind: request.activityKind,
      worldSessionId: request.expectedWorldSessionId,
      runtimeActivityEpoch: 2,
      status: "rejected",
      diagnostic: {
        code: "RUNTIME_ACTIVITY_ID_CONFLICT",
        message: "The retained request differs.",
      },
    });

    await expect(runCompiledSimulationTakeV1({
      compiledTake: compileSimulationTakeV1(takeFixture()),
      driver,
      widthPixels: 2,
      heightPixels: 1,
      onFrame: async () => undefined,
    })).rejects.toThrow("SIMULATION_TAKE_ACTIVITY_RELEASE_REJECTED");
  });

  it("rejects unavailable capture capabilities before mutating the session", async () => {
    const driver = driverFixture();
    const capabilities = await driver.getControlCaptureCapabilities();
    driver.getControlCaptureCapabilities = () => ({
      ...capabilities,
      available: false,
    });

    await expect(runCompiledSimulationTakeV1({
      compiledTake: compileSimulationTakeV1(takeFixture()),
      driver,
      widthPixels: 2,
      heightPixels: 1,
      onFrame: async () => undefined,
    })).rejects.toThrow("CONTROL_CAPTURE_CAPABILITY_UNAVAILABLE");
    expect(driver.fixedInputs).toEqual([]);
  });
});
