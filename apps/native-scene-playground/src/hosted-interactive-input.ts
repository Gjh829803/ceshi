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
  const accumulatedSeconds = Math.min(
    input.accumulatedSeconds,
    MAXIMUM_FIXED_TICKS_PER_FRAME * FIXED_TIME_STEP_SECONDS,
  );
  const ticks = Math.min(
    MAXIMUM_FIXED_TICKS_PER_FRAME,
    Math.floor((accumulatedSeconds + 1e-12) / FIXED_TIME_STEP_SECONDS),
  );
  if (ticks <= 0) {
    return Object.freeze({
      remainingSeconds: accumulatedSeconds,
    });
  }
  return Object.freeze({
    remainingSeconds:
      Math.max(0, accumulatedSeconds - ticks * FIXED_TIME_STEP_SECONDS),
    input: Object.freeze({
      actions: semanticActionsForCodes(input.pressedCodes),
      ticks,
    }),
  });
}

/** Display scheduling only; fixed input and interpolated poses remain Runtime-owned. */
export async function renderHostedInteractiveFrameV1(input: Readonly<{
  accumulatedSeconds: number;
  pressedCodes: ReadonlySet<string>;
  runFixedInput(input: FixedInputV1): Promise<void>;
  renderFrame(interpolationAlphaRatio: number): void;
  isDisposed(): boolean;
}>): Promise<number> {
  if (input.isDisposed()) return 0;
  const consumed = consumeHostedInteractiveInputV1(input);
  if (consumed.input !== undefined) await input.runFixedInput(consumed.input);
  if (!input.isDisposed()) input.renderFrame(Math.min(1, Math.max(
    0, consumed.remainingSeconds / FIXED_TIME_STEP_SECONDS,
  )));
  return consumed.remainingSeconds;
}
