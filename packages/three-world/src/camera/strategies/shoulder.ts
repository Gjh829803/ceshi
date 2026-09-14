import { evaluateStrategy } from "./evaluation";
import type { CameraStrategyInput, CameraStrategyResult } from "./types";

export function evaluateShoulder(
  input: CameraStrategyInput<"shoulder">,
): CameraStrategyResult<"shoulder"> {
  return evaluateStrategy(input);
}
