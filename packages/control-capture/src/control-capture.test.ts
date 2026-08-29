import { describe, expect, it } from "vitest";

import {
  CONTROL_CAPTURE_PASS_IDS_V1,
  CONTROL_CAPTURE_PROFILE_V1,
  compileSimulationTakeV1,
  hashSimulationTakeV1,
  validateSimulationTakeV1,
} from "./index";

const WORLD_HASH = `sha256:${"a".repeat(64)}`;

function validTake(): Record<string, unknown> {
  return {
    kind: "worldkit-simulation-take",
    schemaVersion: 1,
    id: "coastal-walk-opening",
    worldPackageRef: `package://coastal-world@${WORLD_HASH}`,
    worldPackageRootHash: WORLD_HASH,
    worldBuildIdentityHash: WORLD_HASH,
    seed: 731_991,
    simulationTickRate: {
      numeratorTicks: 60,
      denominatorSeconds: 1,
    },
    startTick: 0,
    endTickExclusive: 600,
    controllers: [
      {
        id: "hero-controller",
        kind: "scripted",
        controlledEntityId: "player",
        controlProfileRef: "worldkit://control/character-relative-camera@1",
        initialSequence: 0,
      },
    ],
    tracks: [
      {
        id: "hero-movement",
        kind: "control-intent",
        controllerId: "hero-controller",
        interpolation: "step",
        keyframes: [
          {
            tick: 0,
            moveAxesXZ: [0, 1],
            runEnabled: false,
            jumpPressed: false,
          },
          {
            tick: 180,
            moveAxesXZ: [0.25, 1],
            runEnabled: true,
            jumpPressed: false,
          },
        ],
      },
      {
        id: "opening-camera",
        kind: "camera-rig",
        cameraEntityId: "camera-main",
        cameraRigRef: "worldkit://camera-rig/third-person-orbit@1",
        interpolation: "step",
        keyframes: [
          {
            tick: 0,
            viewYawOffsetRadians: 0,
            viewPitchOffsetRadians: 0,
            viewDistanceOffsetMeters: 0,
          },
          {
            tick: 300,
            viewYawOffsetRadians: 0.5,
            viewPitchOffsetRadians: -0.1,
            viewDistanceOffsetMeters: 0.25,
          },
        ],
      },
    ],
    captureSchedule: {
      kind: "constant-frame-rate",
      captureFrameRate: {
        numeratorFrames: 24,
        denominatorSeconds: 1,
      },
      firstCaptureTick: 0,
      lastCaptureTickInclusive: 599,
      renderInterpolation: { kind: "none" },
    },
    captureProfileRef: "worldkit://capture/profile/control-video@1",
    captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1",
  };
}

describe("Simulation Take V1", () => {
  it("compiles 60 Hz simulation into an exact deterministic 24 fps schedule", () => {
    const first = compileSimulationTakeV1(validTake());
    const second = compileSimulationTakeV1(structuredClone(validTake()));

    expect(first.captureSchedulePlan.entries).toHaveLength(240);
    expect(first.captureSchedulePlan.entries.slice(0, 6)).toEqual([
      { captureFrameIndex: 0, simulationTick: 0 },
      { captureFrameIndex: 1, simulationTick: 2 },
      { captureFrameIndex: 2, simulationTick: 5 },
      { captureFrameIndex: 3, simulationTick: 7 },
      { captureFrameIndex: 4, simulationTick: 10 },
      { captureFrameIndex: 5, simulationTick: 12 },
    ]);
    expect(first.captureSchedulePlan.entries.at(-1)).toEqual({
      captureFrameIndex: 239,
      simulationTick: 597,
    });
    expect(first).toEqual(second);
  });

  it("compiles explicit capture ticks without silently sorting or deduplicating", () => {
    const take = validTake();
    take.captureSchedule = {
      kind: "explicit-ticks",
      captureTicks: [0, 17, 599],
      renderInterpolation: { kind: "none" },
    };

    expect(compileSimulationTakeV1(take).captureSchedulePlan.entries).toEqual([
      { captureFrameIndex: 0, simulationTick: 0 },
      { captureFrameIndex: 1, simulationTick: 17 },
      { captureFrameIndex: 2, simulationTick: 599 },
    ]);

    take.captureSchedule = {
      kind: "explicit-ticks",
      captureTicks: [0, 17, 17],
      renderInterpolation: { kind: "none" },
    };
    expect(validateSimulationTakeV1(take).diagnostics).toContainEqual(
      expect.objectContaining({ code: "TAKE_CAPTURE_TICKS_NOT_STRICTLY_INCREASING" }),
    );
  });

  it("rejects unknown fields, malformed hashes, duplicate ids, and conflicting tracks", () => {
    const take = validTake();
    take.runtimeSessionId = "forbidden-runtime-state";
    take.worldPackageRootHash = "sha256:not-a-hash";
    take.controllers = [
      ...(take.controllers as unknown[]),
      structuredClone((take.controllers as unknown[])[0]),
    ];
    take.tracks = [
      ...(take.tracks as unknown[]),
      {
        id: "conflicting-movement",
        kind: "control-intent",
        controllerId: "hero-controller",
        interpolation: "step",
        keyframes: [{ tick: 0, moveAxesXZ: [0, 0], runEnabled: false, jumpPressed: false }],
      },
    ];

    const result = validateSimulationTakeV1(take);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "TAKE_FIELD_UNKNOWN",
        "TAKE_HASH_INVALID",
        "TAKE_ID_DUPLICATE",
        "TAKE_TRACK_CHANNEL_CONFLICT",
      ]),
    );
  });

  it("requires World Build identity and rejects generic Plan identity", () => {
    const removedPlanHashField = ["execution", "Plan", "Hash"].join("");
    const take = validTake();
    delete take.worldBuildIdentityHash;
    take[removedPlanHashField] = WORLD_HASH;

    const result = validateSimulationTakeV1(take);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "TAKE_FIELD_UNKNOWN", path: `/${removedPlanHashField}` }),
      expect.objectContaining({ code: "TAKE_HASH_INVALID", path: "/worldBuildIdentityHash" }),
    ]));
  });

  it("rejects unsupported rates, invalid ranges, invalid axes, and non-increasing keyframes", () => {
    const take = validTake();
    take.simulationTickRate = { numeratorTicks: 120, denominatorSeconds: 1 };
    take.startTick = 20;
    take.endTickExclusive = 20;
    const track = (take.tracks as Array<Record<string, unknown>>)[0]!;
    track.keyframes = [
      { tick: 0, moveAxesXZ: [2, 0], runEnabled: false, jumpPressed: false },
      { tick: 0, moveAxesXZ: [0, 0], runEnabled: false, jumpPressed: false },
    ];

    const codes = validateSimulationTakeV1(take).diagnostics.map(({ code }) => code);
    expect(codes).toEqual(expect.arrayContaining([
      "TAKE_TICK_RATE_UNSUPPORTED",
      "TAKE_TICK_RANGE_INVALID",
      "TAKE_MOVE_AXES_INVALID",
      "TAKE_KEYFRAMES_NOT_STRICTLY_INCREASING",
      "TAKE_KEYFRAME_TICK_OUT_OF_RANGE",
    ]));
  });

  it("hashes only a validated immutable Take and changes on control or camera intent", () => {
    const original = validTake();
    const same = structuredClone(original);
    const changedControl = structuredClone(original);
    const changedCamera = structuredClone(original);
    (((changedControl.tracks as Array<Record<string, unknown>>)[0]!.keyframes as Array<Record<string, unknown>>)[0]!)
      .runEnabled = true;
    (((changedCamera.tracks as Array<Record<string, unknown>>)[1]!.keyframes as Array<Record<string, unknown>>)[1]!)
      .viewYawOffsetRadians = 0.75;

    expect(hashSimulationTakeV1(original)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashSimulationTakeV1(original)).toBe(hashSimulationTakeV1(same));
    expect(hashSimulationTakeV1(changedControl)).not.toBe(hashSimulationTakeV1(original));
    expect(hashSimulationTakeV1(changedCamera)).not.toBe(hashSimulationTakeV1(original));

    const invalid = { ...original, sessionId: "runtime-state" };
    expect(() => hashSimulationTakeV1(invalid)).toThrow("TAKE_INVALID");
  });

  it("freezes the five required pass meanings and explicit Web V1 encodings", () => {
    expect(CONTROL_CAPTURE_PASS_IDS_V1).toEqual([
      "neutral-color",
      "linear-depth-meters",
      "semantic-class-id",
      "instance-id",
      "world-normal",
    ]);
    expect(CONTROL_CAPTURE_PROFILE_V1).toMatchObject({
      kind: "worldkit-control-capture-profile",
      schemaVersion: 1,
      resourceRef: "worldkit://capture/profile/control-video@1",
      requiredPassIds: CONTROL_CAPTURE_PASS_IDS_V1,
      encodingProfile: {
        resourceRef: "worldkit://capture/encoding/web-v1@1",
        pixelOrigin: "top-left",
        passesById: {
          "neutral-color": { mediaType: "image/png", encoding: "png-rgba8-srgb" },
          "linear-depth-meters": { mediaType: "application/octet-stream", encoding: "float32-le", noHitMeters: 0 },
          "semantic-class-id": { mediaType: "application/octet-stream", encoding: "uint32-le", backgroundId: 0 },
          "instance-id": { mediaType: "application/octet-stream", encoding: "uint32-le", backgroundId: 0 },
          "world-normal": { mediaType: "application/octet-stream", encoding: "float32x3-le", coordinateSpace: "world" },
        },
      },
    });
  });
});
