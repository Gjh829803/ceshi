import type {
  ControlInputAxesV2,
  RuntimeControlProfileV1,
  SemanticInputActionV1,
  ViewControlFrameV1,
} from "@whitebox-world/runtime-contracts";

export type MotionCommandV1 =
  | {
      kind: "planar-vector";
      directionMetersXZ: readonly [x: number, z: number];
      runRequested: boolean;
      jumpRequested: boolean;
      aimRequested: boolean;
      facingDirectionMetersXZ: readonly [x: number, z: number];
    }
  | {
      kind: "throttle-steer";
      throttle: number;
      steering: number;
      brakeRequested: boolean;
      brakeRatio: number;
      handbrakeRequested: boolean;
      jumpRequested: boolean;
      boostRequested: boolean;
    }
  | {
      kind: "flight-attitude";
      pitch: number;
      yaw: number;
      roll: number;
      vertical: number;
      actionRequested: boolean;
    }
  | { kind: "none" };

function hasAction(
  actions: readonly SemanticInputActionV1[],
  action: SemanticInputActionV1,
): boolean {
  return actions.includes(action);
}

function clampUnit(value: number): number {
  const finiteValue = Number.isFinite(value) ? value : 0;
  return Math.max(-1, Math.min(1, finiteValue));
}

function clampRatio(value: number): number {
  const finiteValue = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, finiteValue));
}

export function hasForwardControlIntentV1(
  profile: RuntimeControlProfileV1,
  moveResponseExponent: number,
  actions: readonly SemanticInputActionV1[],
  axes: Readonly<ControlInputAxesV2> = {},
): boolean {
  if (profile.commandKind === "none" || profile.inputSpace === "none") return false;
  const { longitudinal } = resolveControlAxesV1(
    profile,
    moveResponseExponent,
    actions,
    axes,
  );
  if (profile.commandKind === "throttle-steer") {
    return resolveThrottleV1(longitudinal, axes) > 0.000001;
  }
  return longitudinal > 0.000001;
}

function normalizedAxis(
  value: number,
  deadzoneRatio: number,
  responseExponent: number,
): number {
  const clamped = clampUnit(Number.isFinite(value) ? value : 0);
  const magnitude = Math.abs(clamped);
  if (magnitude <= deadzoneRatio) return 0;
  const normalized = (magnitude - deadzoneRatio) / Math.max(0.000001, 1 - deadzoneRatio);
  return Math.sign(clamped) * Math.pow(normalized, responseExponent);
}

function resolveControlAxesV1(
  profile: RuntimeControlProfileV1,
  moveResponseExponent: number,
  actions: readonly SemanticInputActionV1[],
  axes: Readonly<ControlInputAxesV2>,
): { longitudinal: number; lateral: number } {
  const digitalLongitudinal =
    (hasAction(actions, "move-forward") ? 1 : 0) -
    (hasAction(actions, "move-backward") ? 1 : 0);
  const digitalLateral =
    (hasAction(actions, "move-right") ? 1 : 0) -
    (hasAction(actions, "move-left") ? 1 : 0);
  const { moveDeadzoneRatio } = profile;
  return {
    longitudinal: axes.moveYRatio === undefined
      ? digitalLongitudinal
      : normalizedAxis(axes.moveYRatio, moveDeadzoneRatio, moveResponseExponent),
    lateral: axes.moveXRatio === undefined
      ? digitalLateral
      : normalizedAxis(axes.moveXRatio, moveDeadzoneRatio, moveResponseExponent),
  };
}

function resolveThrottleV1(
  longitudinal: number,
  axes: Readonly<ControlInputAxesV2>,
): number {
  return axes.throttleRatio === undefined
    ? clampUnit(longitudinal)
    : clampUnit(axes.throttleRatio - Math.max(0, -longitudinal));
}

export function compileMotionCommandV1(
  profile: RuntimeControlProfileV1,
  moveResponseExponent: number,
  actions: readonly SemanticInputActionV1[],
  viewControlFrame: ViewControlFrameV1,
  axes: Readonly<ControlInputAxesV2> = {},
): MotionCommandV1 {
  if (profile.commandKind === "none" || profile.inputSpace === "none") {
    return { kind: "none" };
  }
  const { longitudinal, lateral } = resolveControlAxesV1(
    profile,
    moveResponseExponent,
    actions,
    axes,
  );

  if (profile.commandKind === "planar-vector") {
    const planarLateral = profile.lateralMovementPolicy === "allowed" ? lateral : 0;
    const cameraForwardXYZ = viewControlFrame.forwardXYZ;
    const cameraRightXYZ = viewControlFrame.rightXYZ;
    const forwardLength = Math.hypot(cameraForwardXYZ[0], cameraForwardXYZ[2]);
    const forwardX = forwardLength <= 0.000001 ? 0 : cameraForwardXYZ[0] / forwardLength;
    const forwardZ = forwardLength <= 0.000001 ? -1 : cameraForwardXYZ[2] / forwardLength;
    const rightLength = Math.hypot(cameraRightXYZ[0], cameraRightXYZ[2]);
    const rightX = rightLength <= 0.000001
      ? -forwardZ
      : cameraRightXYZ[0] / rightLength;
    const rightZ = rightLength <= 0.000001
      ? forwardX
      : cameraRightXYZ[2] / rightLength;
    const rawX = forwardX * longitudinal + rightX * planarLateral;
    const rawZ = forwardZ * longitudinal + rightZ * planarLateral;
    const length = Math.hypot(rawX, rawZ);
    return {
      kind: "planar-vector",
      directionMetersXZ:
        length > 1 ? [rawX / length, rawZ / length] : [rawX, rawZ],
      runRequested: hasAction(actions, "run") || hasAction(actions, "boost"),
      jumpRequested: hasAction(actions, "jump"),
      aimRequested:
        profile.facingPolicy === "align-to-view" || hasAction(actions, "aim"),
      facingDirectionMetersXZ: [forwardX, forwardZ],
    };
  }
  if (profile.commandKind === "throttle-steer") {
    return {
      kind: "throttle-steer",
      throttle: resolveThrottleV1(longitudinal, axes),
      steering: clampUnit(lateral),
      brakeRequested: hasAction(actions, "brake"),
      brakeRatio: Math.max(
        hasAction(actions, "brake") ? 1 : 0,
        clampRatio(axes.brakeRatio ?? 0),
      ),
      handbrakeRequested: hasAction(actions, "handbrake"),
      jumpRequested: hasAction(actions, "jump"),
      boostRequested: hasAction(actions, "boost") || hasAction(actions, "run"),
    };
  }
  return {
    kind: "flight-attitude",
    pitch: clampUnit(-longitudinal),
    yaw: clampUnit(lateral),
    roll: clampUnit(lateral),
    vertical: hasAction(actions, "jump") || hasAction(actions, "boost")
      ? 1
      : hasAction(actions, "brake") ? -1 : 0,
    actionRequested:
      hasAction(actions, "primary-action") ||
      hasAction(actions, "secondary-action") ||
      hasAction(actions, "jump") ||
      hasAction(actions, "run") ||
      hasAction(actions, "boost"),
  };
}
