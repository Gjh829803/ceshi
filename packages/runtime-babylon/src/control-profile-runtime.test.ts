import { describe, expect, it } from "vitest";

import type { ExecutionControlProfileV1 } from "@whitebox-world/runtime-contracts";

import { compileMotionCommandV1 } from "./control-profile-runtime";

const DEFAULT_VIEW_FRAME = {
  forwardXYZ: [0, 0, -1],
  rightXYZ: [1, 0, 0],
  committedTick: 0,
} as const;

function profile(
  commandKind: ExecutionControlProfileV1["commandKind"],
  inputSpace: ExecutionControlProfileV1["inputSpace"],
): ExecutionControlProfileV1 {
  return {
    resourceRef: `worldkit://control-profile/test.${commandKind}@1`,
    commandKind,
    inputSpace,
    facingPolicy:
      commandKind === "planar-vector"
        ? "align-to-move"
        : commandKind === "flight-attitude"
          ? "flight-derived"
          : commandKind === "none"
            ? "fixed"
            : "steering-derived",
    lateralMovementPolicy: commandKind === "planar-vector" ? "allowed" : "forbidden",
    inputTuning: {
      moveDeadzoneRatio: 0,
      lookDeadzoneRatio: 0,
      responseExponent: 1,
      lookSensitivityXRatio: 1,
      lookSensitivityYRatio: 1,
      invertLookX: false,
      invertLookY: false,
    },
  };
}

describe("compileMotionCommandV1", () => {
  it("turns camera-relative planar intent into a normalized world-space direction", () => {
    const command = compileMotionCommandV1(
        profile("planar-vector", "camera-relative"),
        ["move-forward", "move-right", "run", "jump"],
        { forwardXYZ: [1, 0, 0], rightXYZ: [0, 0, 1], committedTick: 12 },
      );
    expect(command).toMatchObject({
      kind: "planar-vector",
      runRequested: true,
      jumpRequested: true,
    });
    expect(command.kind).toBe("planar-vector");
    if (command.kind === "planar-vector") {
      expect(command.directionMetersXZ[0]).toBeCloseTo(Math.SQRT1_2, 12);
      expect(command.directionMetersXZ[1]).toBeCloseTo(Math.SQRT1_2, 12);
    }
  });

  it("uses one throttle-steer command contract for forward-steer, wheeled, slide and water kernels", () => {
    expect(
      compileMotionCommandV1(
        profile("throttle-steer", "subject-local"),
        ["move-forward", "move-left"],
        DEFAULT_VIEW_FRAME,
      ),
    ).toEqual({
      kind: "throttle-steer",
      throttle: 1,
      steering: -1,
      brakeRequested: false,
      jumpRequested: false,
      boostRequested: false,
      brakeRatio: 0,
      handbrakeRequested: false,
    });
  });

  it("keeps boost, brake and capability actions distinct for throttle-steer subjects", () => {
    expect(
      compileMotionCommandV1(
        profile("throttle-steer", "subject-local"),
        ["move-forward", "boost", "brake", "primary-action"],
        DEFAULT_VIEW_FRAME,
      ),
    ).toMatchObject({
      kind: "throttle-steer",
      throttle: 1,
      brakeRequested: true,
      jumpRequested: false,
      boostRequested: true,
      brakeRatio: 1,
    });
  });

  it("maps flight intent to attitude without exposing physics parameters", () => {
    expect(
      compileMotionCommandV1(
        profile("flight-attitude", "flight-frame"),
        ["move-forward", "move-right", "jump"],
        DEFAULT_VIEW_FRAME,
      ),
    ).toEqual({
      kind: "flight-attitude",
      pitch: -1,
      yaw: 1,
      roll: 1,
      actionRequested: true,
    });
  });

  it("suppresses all active movement in the safe-none profile", () => {
    expect(
      compileMotionCommandV1(
        profile("none", "none"),
        ["move-forward", "run", "jump"],
        DEFAULT_VIEW_FRAME,
      ),
    ).toEqual({ kind: "none" });
  });

  it("applies device-neutral deadzones and response curves before producing motion", () => {
    const analogProfile = profile("throttle-steer", "subject-local");
    analogProfile.inputTuning = {
      ...analogProfile.inputTuning,
      moveDeadzoneRatio: 0.2,
      responseExponent: 2,
    };
    const command = compileMotionCommandV1(
      analogProfile,
      [],
      DEFAULT_VIEW_FRAME,
      { moveXRatio: 0.1, moveYRatio: 0.6 },
    );
    expect(command).toMatchObject({ kind: "throttle-steer", steering: 0 });
    expect(command.kind).toBe("throttle-steer");
    if (command.kind === "throttle-steer") expect(command.throttle).toBeCloseTo(0.25, 12);
  });

  it("keeps skills, aim, boost, brake and handbrake as independent semantic actions", () => {
    expect(
      compileMotionCommandV1(
        profile("throttle-steer", "subject-local"),
        ["boost", "brake", "handbrake", "primary-action"],
        DEFAULT_VIEW_FRAME,
      ),
    ).toMatchObject({
      kind: "throttle-steer",
      boostRequested: true,
      brakeRequested: true,
      brakeRatio: 1,
      handbrakeRequested: true,
      jumpRequested: false,
    });
    expect(
      compileMotionCommandV1(
        profile("flight-attitude", "flight-frame"),
        ["boost"],
        DEFAULT_VIEW_FRAME,
      ),
    ).toMatchObject({ kind: "flight-attitude", actionRequested: true });
    expect(
      compileMotionCommandV1(
        profile("planar-vector", "camera-relative"),
        ["aim"],
        { forwardXYZ: [1, 0, 0], rightXYZ: [0, 0, 1], committedTick: 2 },
      ),
    ).toMatchObject({
      kind: "planar-vector",
      aimRequested: true,
      facingDirectionMetersXZ: [1, 0],
    });
  });
});
