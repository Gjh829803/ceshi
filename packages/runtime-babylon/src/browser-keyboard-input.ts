import type { SemanticInputActionV1 } from "@whitebox-world/runtime-contracts";
import { FIXED_TIME_STEP_SECONDS } from "./physics";

// Physical input normalization shared by Host browser adapters, not Gameplay state.
const KEY_ACTION_MAP: Readonly<Record<string, readonly SemanticInputActionV1[]>> = {
  KeyW: ["move-forward"],
  KeyS: ["move-backward"],
  KeyA: ["move-left"],
  KeyD: ["move-right"],
  ControlLeft: ["brake"],
  ControlRight: ["brake"],
  AltLeft: ["handbrake"],
  AltRight: ["handbrake"],
  KeyE: ["primary-action"],
  KeyQ: ["secondary-action"],
  KeyF: ["aim"],
  KeyR: ["camera-recenter"],
  KeyC: ["camera-look-back"],
  KeyV: ["camera-shoulder-swap"],
};

export type CameraInputAction = "cameraLeft" | "cameraRight" | "cameraUp" | "cameraDown";
export const CAMERA_KEY_ACTION_MAP: Readonly<Partial<Record<string, CameraInputAction>>> = {
  KeyJ: "cameraLeft", KeyL: "cameraRight", KeyI: "cameraUp", KeyK: "cameraDown",
  ArrowLeft: "cameraLeft", ArrowRight: "cameraRight", ArrowUp: "cameraUp", ArrowDown: "cameraDown",
};

export const CAMERA_YAW_RADIANS_PER_TICK = 0.025;
export const CAMERA_PITCH_RADIANS_PER_TICK = 0.015;
export const CAMERA_KEYBOARD_ACCELERATION_SECONDS = 0.20;
export const CAMERA_KEYBOARD_RELEASE_DECELERATION_SECONDS = 0.15;

const CONTEXTUAL_KEY_CODES = new Set(["ShiftLeft", "ShiftRight", "Space"]);
function moveTowards(
  current: number,
  target: number,
  maximumDelta: number,
): number {
  if (Math.abs(target - current) <= maximumDelta) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

export function advanceKeyboardCameraRadiansPerTick(
  currentRadiansPerTick: number,
  inputDirection: number,
  maximumRadiansPerTick: number,
): number {
  const transitionSeconds = inputDirection === 0
    ? CAMERA_KEYBOARD_RELEASE_DECELERATION_SECONDS
    : CAMERA_KEYBOARD_ACCELERATION_SECONDS;
  return moveTowards(
    currentRadiansPerTick,
    inputDirection * maximumRadiansPerTick,
    maximumRadiansPerTick * FIXED_TIME_STEP_SECONDS / transitionSeconds,
  );
}

export const SEMANTIC_INPUT_ACTION_ORDER: readonly SemanticInputActionV1[] = [
  "move-forward",
  "move-backward",
  "move-left",
  "move-right",
  "jump",
  "run",
  "boost",
  "brake",
  "handbrake",
  "primary-action",
  "secondary-action",
  "aim",
  "camera-recenter",
  "camera-look-back",
  "camera-shoulder-swap",
];

export function isPhysicalGameplayKeyV1(code: string): boolean {
  return KEY_ACTION_MAP[code] !== undefined || CONTEXTUAL_KEY_CODES.has(code);
}

export function semanticActionsForPhysicalCodesV1(
  pressedCodes: ReadonlySet<string>,
  motionKernelRef = "worldkit://motion-kernel/free-ground@1",
): readonly SemanticInputActionV1[] {
  const active = new Set<SemanticInputActionV1>();
  for (const code of pressedCodes) {
    for (const action of KEY_ACTION_MAP[code] ?? []) active.add(action);
    if (code === "ShiftLeft" || code === "ShiftRight") {
      active.add(
        motionKernelRef.endsWith("/free-ground@1") ||
            motionKernelRef.endsWith("/forward-steer@1")
          ? "run"
          : "boost",
      );
    }
    if (code === "Space") {
      if (
        motionKernelRef.endsWith("/free-ground@1") ||
        motionKernelRef.endsWith("/forward-steer@1")
      ) active.add("jump");
      else if (motionKernelRef.endsWith("/unpowered-glide@1")) {
        active.add("primary-action");
      } else active.add("brake");
    }
  }
  return SEMANTIC_INPUT_ACTION_ORDER.filter(action => active.has(action));
}
