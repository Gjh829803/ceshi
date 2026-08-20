import { describe, expect, it } from "vitest";

import type { ExecutionControlProfileV1 } from "@whitebox-world/runtime-contracts";

import { compileMotionCommandV1 } from "./control-profile-runtime";

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
  };
}

describe("compileMotionCommandV1", () => {
  it("turns camera-relative planar intent into a normalized world-space direction", () => {
    const command = compileMotionCommandV1(
        profile("planar-vector", "camera-relative"),
        ["move-forward", "move-right", "run", "jump"],
        [1, 0, 0],
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
        [0, 0, -1],
      ),
    ).toEqual({
      kind: "throttle-steer",
      throttle: 1,
      steering: -1,
      brakeRequested: false,
      jumpRequested: false,
      boostRequested: false,
    });
  });

  it("keeps Shift and Space as capability requests for throttle-steer subjects", () => {
    expect(
      compileMotionCommandV1(
        profile("throttle-steer", "subject-local"),
        ["move-forward", "run", "jump"],
        [0, 0, -1],
      ),
    ).toMatchObject({
      kind: "throttle-steer",
      throttle: 1,
      brakeRequested: true,
      jumpRequested: true,
      boostRequested: true,
    });
  });

  it("maps flight intent to attitude without exposing physics parameters", () => {
    expect(
      compileMotionCommandV1(
        profile("flight-attitude", "flight-frame"),
        ["move-forward", "move-right", "jump"],
        [0, 0, -1],
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
        [0, 0, -1],
      ),
    ).toEqual({ kind: "none" });
  });
});
