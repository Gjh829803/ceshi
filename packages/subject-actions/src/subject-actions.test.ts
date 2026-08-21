import { describe, expect, it } from "vitest";
import { resolveGroundHumanoidAction } from "./index.js";

describe("resolveGroundHumanoidAction", () => {
  it.each([
    [{ movementMedium: "ground", horizontalSpeedMetersPerSecond: 0, runRequested: false }, "idle"],
    [{ movementMedium: "ground", horizontalSpeedMetersPerSecond: 0, runRequested: true }, "idle"],
    [{ movementMedium: "ground", horizontalSpeedMetersPerSecond: 0.08, runRequested: false }, "idle"],
    [{ movementMedium: "ground", horizontalSpeedMetersPerSecond: 0.08, runRequested: true }, "idle"],
    [{ movementMedium: "ground", horizontalSpeedMetersPerSecond: 0.081, runRequested: false }, "walk"],
    [{ movementMedium: "ground", horizontalSpeedMetersPerSecond: 0.081, runRequested: true }, "run"],
    [{ movementMedium: "air", horizontalSpeedMetersPerSecond: 0, runRequested: false }, "jump"],
    [{ movementMedium: "air", horizontalSpeedMetersPerSecond: 0, runRequested: true }, "jump"],
    [{ movementMedium: "air", horizontalSpeedMetersPerSecond: 2.4, runRequested: false }, "jump"],
    [{ movementMedium: "air", horizontalSpeedMetersPerSecond: 2.4, runRequested: true }, "jump"],
  ] as const)("maps %j to %s", (input, expected) => {
    expect(resolveGroundHumanoidAction(input)).toBe(expected);
  });

  it.each([
    ["negative", -0.001],
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
  ] as const)("rejects %s speed before resolving the air action", (_label, speed) => {
    expect(() => resolveGroundHumanoidAction({
      movementMedium: "air",
      horizontalSpeedMetersPerSecond: speed,
      runRequested: true,
    })).toThrow(RangeError);
  });
});
