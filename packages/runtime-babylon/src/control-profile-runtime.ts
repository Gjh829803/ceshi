import type {
  ExecutionControlProfileV1,
  SemanticInputActionV1,
  Vec3,
} from "@whitebox-world/runtime-contracts";

export type MotionCommandV1 =
  | {
      kind: "planar-vector";
      directionMetersXZ: readonly [x: number, z: number];
      runRequested: boolean;
      jumpRequested: boolean;
    }
  | {
      kind: "throttle-steer";
      throttle: number;
      steering: number;
      brakeRequested: boolean;
      jumpRequested: boolean;
    }
  | {
      kind: "flight-attitude";
      pitch: number;
      yaw: number;
      roll: number;
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
  return Math.max(-1, Math.min(1, value));
}

export function compileMotionCommandV1(
  profile: ExecutionControlProfileV1,
  actions: readonly SemanticInputActionV1[],
  cameraForwardXYZ: Vec3,
): MotionCommandV1 {
  if (profile.commandKind === "none" || profile.inputSpace === "none") {
    return { kind: "none" };
  }
  const longitudinal =
    (hasAction(actions, "move-forward") ? 1 : 0) -
    (hasAction(actions, "move-backward") ? 1 : 0);
  const lateral =
    (hasAction(actions, "move-right") ? 1 : 0) -
    (hasAction(actions, "move-left") ? 1 : 0);

  if (profile.commandKind === "planar-vector") {
    const forwardLength = Math.hypot(cameraForwardXYZ[0], cameraForwardXYZ[2]);
    const forwardX = forwardLength <= 0.000001 ? 0 : cameraForwardXYZ[0] / forwardLength;
    const forwardZ = forwardLength <= 0.000001 ? -1 : cameraForwardXYZ[2] / forwardLength;
    const rightX = -forwardZ;
    const rightZ = forwardX;
    const rawX = forwardX * longitudinal + rightX * lateral;
    const rawZ = forwardZ * longitudinal + rightZ * lateral;
    const length = Math.hypot(rawX, rawZ);
    return {
      kind: "planar-vector",
      directionMetersXZ:
        length > 1 ? [rawX / length, rawZ / length] : [rawX, rawZ],
      runRequested: hasAction(actions, "run"),
      jumpRequested: hasAction(actions, "jump"),
    };
  }
  if (profile.commandKind === "throttle-steer") {
    return {
      kind: "throttle-steer",
      throttle: clampUnit(longitudinal),
      steering: clampUnit(lateral),
      brakeRequested:
        longitudinal === 0 && hasAction(actions, "move-backward"),
      jumpRequested: hasAction(actions, "jump"),
    };
  }
  return {
    kind: "flight-attitude",
    pitch: clampUnit(-longitudinal),
    yaw: clampUnit(lateral),
    roll: clampUnit(lateral),
    actionRequested: hasAction(actions, "jump") || hasAction(actions, "run"),
  };
}
