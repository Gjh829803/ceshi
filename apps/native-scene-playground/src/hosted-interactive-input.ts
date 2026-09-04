import { FIXED_TIME_STEP_SECONDS } from "@whitebox-world/runtime-babylon";
import type {
  FixedInputV1,
  SemanticInputActionV1,
} from "@whitebox-world/runtime-contracts";

const MAXIMUM_FIXED_TICKS_PER_FRAME = 5;

function semanticActionsForCodes(
  pressedCodes: ReadonlySet<string>,
): readonly SemanticInputActionV1[] {
  const actions: SemanticInputActionV1[] = [];
  if (pressedCodes.has("KeyW")) actions.push("move-forward");
  if (pressedCodes.has("KeyS")) actions.push("move-backward");
  if (pressedCodes.has("KeyA")) actions.push("move-left");
  if (pressedCodes.has("KeyD")) actions.push("move-right");
  if (
    pressedCodes.has("ShiftLeft") ||
    pressedCodes.has("ShiftRight")
  ) actions.push("run");
  if (pressedCodes.has("Space")) actions.push("jump");
  return Object.freeze(actions);
}

export function consumeHostedInteractiveInputV1(input: Readonly<{
  accumulatedSeconds: number;
  pressedCodes: ReadonlySet<string>;
}>): Readonly<{
  remainingSeconds: number;
  input?: FixedInputV1;
}> {
  const ticks = Math.min(
    MAXIMUM_FIXED_TICKS_PER_FRAME,
    Math.floor(input.accumulatedSeconds / FIXED_TIME_STEP_SECONDS),
  );
  if (ticks <= 0) {
    return Object.freeze({
      remainingSeconds: input.accumulatedSeconds,
    });
  }
  return Object.freeze({
    remainingSeconds:
      input.accumulatedSeconds - ticks * FIXED_TIME_STEP_SECONDS,
    input: Object.freeze({
      actions: semanticActionsForCodes(input.pressedCodes),
      ticks,
    }),
  });
}
