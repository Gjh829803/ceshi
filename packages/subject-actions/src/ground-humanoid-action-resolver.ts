import type {
  GroundHumanoidActionIdV1,
  GroundHumanoidActionInputV1,
} from "./types.js";

export function resolveGroundHumanoidAction(
  input: GroundHumanoidActionInputV1,
): GroundHumanoidActionIdV1 {
  if (
    !Number.isFinite(input.horizontalSpeedMetersPerSecond) ||
    input.horizontalSpeedMetersPerSecond < 0
  ) {
    throw new RangeError(
      "horizontalSpeedMetersPerSecond must be finite and non-negative.",
    );
  }
  if (input.movementMedium === "air") return "jump";
  if (input.horizontalSpeedMetersPerSecond <= 0.08) return "idle";

  // Water intentionally uses the ground movement action table as the S1b fallback.
  return input.runRequested ? "run" : "walk";
}
