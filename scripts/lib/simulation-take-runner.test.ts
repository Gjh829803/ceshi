import { describe, expect, it, vi } from "vitest";

import {
  compileSimulationTakeV1,
  type SimulationTakeV1,
} from "@whitebox-world/control-capture";
import type {
  ControlCapturePassPayloadV1,
  RuntimeControlCaptureFrameV1,
  WorldRuntimeSnapshotV3,
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

function snapshot(tick: number): WorldRuntimeSnapshotV3 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 3,
    runtimeBackend: "babylon-havok",
    tick,
    ready: true,
    controlledEntityId: "player",
    controllersById: {
      "controller-primary": { id: "controller-primary", controlledEntityId: "player" },
    },
    subjectStatesByEntityId: {
      player: {
        entityId: "player",
        subjectDefinitionRef: "worldkit://subject-definition/test@1",
        subjectDefinitionHash: WORLD_HASH,
        positionMetersXYZ: [0, 0, 0],
        velocityMetersPerSecondXYZ: [0, 0, 0],
        movementMedium: "ground",
        activeActionId: "idle",
      },
    },
    physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
    camera: {
      entityId: "camera-main",
      targetEntityId: "player",
      positionMetersXYZ: [0, 2, 4],
    },
    resources: { meshes: 1, bodies: 1, terrainSamples: 4 },
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

function driverFixture(): SimulationTakeBrowserDriverV1 & {
  readonly fixedInputs: Array<{ actions: readonly string[]; ticks: number }>;
  readonly cameraInputs: Array<Record<string, number>>;
} {
  let tick = 0;
  const fixedInputs: Array<{ actions: readonly string[]; ticks: number }> = [];
  const cameraInputs: Array<Record<string, number>> = [];
  return {
    fixedInputs,
    cameraInputs,
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
    setPaused: () => snapshot(tick),
    reset: () => {
      tick = 0;
      return snapshot(tick);
    },
    bindControl: (request) => ({
      kind: "worldkit-control-binding-receipt",
      schemaVersion: 2,
      status: "committed",
      controllerId: request.controllerId,
      previousControlledEntityId: "player",
      controlledEntityId: request.controlledEntityId,
    }),
    runFixedInput: async (steps) => {
      for (const step of steps) {
        fixedInputs.push(step);
        tick += step.ticks;
      }
      return snapshot(tick);
    },
    adjustCameraView: (input) => {
      cameraInputs.push(input as Record<string, number>);
      return snapshot(tick);
    },
    waitForSimulationTick: async (expectedSimulationTick) => {
      if (tick !== expectedSimulationTick) throw new Error("wrong tick");
      return snapshot(tick);
    },
    waitForRenderReady: async (expectedSimulationTick) => ({
      kind: "worldkit-render-ready-receipt",
      schemaVersion: 1,
      id: `receipt-${expectedSimulationTick}`,
      runtimeSessionId: "runtime-session-test",
      simulationTick: expectedSimulationTick,
      renderFrameIndex: expectedSimulationTick,
    }),
    captureControlFrame: async (request) =>
      frame(request.captureFrameIndex, request.expectedSimulationTick),
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
