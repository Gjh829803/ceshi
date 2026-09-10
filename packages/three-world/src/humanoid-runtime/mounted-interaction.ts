import { Quaternion, Vector3 } from "three";
import {
  vehicleBody,
  type BodyPose,
  type BodyQueryFilter,
  type EnvironmentQueries,
} from "./environment/queries";
import type { HumanoidController } from "./humanoid/controller";
import type { VehicleState } from "./simulation";
export type MountFailureCode =
  | "HUMANOID_TARGET_UNAVAILABLE"
  | "HUMANOID_ALREADY_MOUNTED"
  | "HUMANOID_NOT_MOUNTED"
  | "HUMANOID_TRANSITION_ACTIVE"
  | "HUMANOID_CHARACTER_BUSY"
  | "VEHICLE_MOUNT_TOO_FAST"
  | "VEHICLE_MOUNT_SIDE_REQUIRED"
  | "VEHICLE_MOUNT_OUT_OF_REACH"
  | "VEHICLE_MOUNT_OBSTRUCTED"
  | "VEHICLE_MOUNT_SPACE_BLOCKED"
  | "VEHICLE_MOUNT_GROUND_REQUIRED"
  | "VEHICLE_DISMOUNT_NO_SAFE_POINT";
export type MountDecision =
  | { ok: false; code: MountFailureCode; message: string }
  | {
      ok: true;
      instanceId: string;
      position: Vector3;
      yaw: number;
      velocity: Vector3;
    };
export interface MountContext {
  readonly environment: EnvironmentQueries;
  readonly humanoid: HumanoidController;
  readonly vehicles: readonly VehicleState[];
  readonly available: (vehicle: VehicleState) => boolean;
  readonly transitionSeconds: number;
  readonly mountedInstanceId: string | null;
}
// Existing movement/spawn conventions: 27 cm KCC autostep, 2.5 cm rest
// clearance, and 8 cm support contact band. Riding uses the actual rider slope.
const STANDING_STEP_METERS = 0.27;
const STANDING_CLEARANCE_METERS = 0.025;
const SUPPORT_CONTACT_METERS = 0.08;
const ENTER_SPEED_LIMIT = 3;
const EXIT_SPEED_LIMIT = 5;
const MAXIMUM_REACH_METERS = 5.3;
function finiteVehicle(v: VehicleState): boolean {
  return (
    [
      ...v.position.toArray(),
      ...v.velocity.toArray(),
      ...v.rotation.toArray(),
      v.yaw,
    ].every(Number.isFinite) && Math.abs(v.rotation.lengthSq() - 1) < 1e-5
  );
}
const up = new Vector3(0, 1, 0);
const fail = (code: MountFailureCode, message: string): MountDecision => ({
  ok: false,
  code,
  message,
});
function riderFilter(c: MountContext, target?: VehicleState): BodyQueryFilter {
  return {
    excludedColliderHandles: new Set([c.humanoid.capsule.handle]),
    ...(target ? { excludedActorIds: new Set([target.spec.id]) } : {}),
  };
}
function pose(c: MountContext, position: Vector3): BodyPose {
  return {
    position,
    rotation: new Quaternion(),
    body: c.humanoid.standingQueryBody,
  };
}
function grounded(c: MountContext, v: VehicleState) {
  const support = c.environment.standingSupport(
      v.position,
      SUPPORT_CONTACT_METERS,
      c.humanoid.controller.maxSlopeClimbAngle(),
    ),
    water = c.environment.waterAt(v.position);
  return (
    v.grounded &&
    !v.submerged &&
    !!support &&
    Math.abs(v.position.y - support.height) <= SUPPORT_CONTACT_METERS &&
    (!water || water.surface <= v.position.y)
  );
}
function standing(
  c: MountContext,
  v: VehicleState,
  side: number,
): Vector3 | null {
  const body = vehicleBody(v.spec),
    human = c.humanoid.standingQueryBody;
  if (body.kind !== "box" || human.kind !== "capsule") return null;
  const p = new Vector3(
    side *
      (body.halfExtents[0] + human.radius + 2 * c.humanoid.controller.offset()),
    0,
    0,
  )
    .applyAxisAngle(up, v.yaw)
    .add(v.position);
  const support = c.environment.standingSupport(
    p.clone().addScaledVector(up, STANDING_STEP_METERS),
    2 * STANDING_STEP_METERS,
    c.humanoid.controller.maxSlopeClimbAngle(),
  );
  if (!support) return null;
  p.y = support.height + STANDING_CLEARANCE_METERS;
  const water = c.environment.waterAt(p);
  if (water && water.surface > p.y) return null;
  return c.environment.bodyOverlap(
    pose(c, p),
    riderFilter(c),
    c.humanoid.controller.offset(),
  )
    ? null
    : p;
}
function seat(v: VehicleState) {
  return new Vector3(...v.spec.seat)
    .applyQuaternion(v.rotation)
    .add(v.position);
}
function attachment(
  c: MountContext,
  v: VehicleState,
  p: Vector3,
  exiting = false,
) {
  // The attachment capsule centre rises to seat height before translating inward.
  // It represents geometric access, not a second standing rider above the saddle.
  const centre = seat(v),
    body = c.humanoid.standingQueryBody;
  const attachedFeet = centre.clone().sub(new Vector3(...body.offset));
  const raised = p.clone();
  raised.y = attachedFeet.y;
  const path = [pose(c, p), pose(c, raised), pose(c, attachedFeet)];
  return !c.environment.bodyPathBlocked(
    exiting ? path.reverse() : path,
    riderFilter(c, v),
  );
}
export function evaluateMount(
  c: MountContext,
  targetId: string,
): MountDecision {
  if (c.transitionSeconds > 0)
    return fail("HUMANOID_TRANSITION_ACTIVE", "骑乘切换尚未完成");
  if (c.mountedInstanceId)
    return fail("HUMANOID_ALREADY_MOUNTED", "人物已经骑乘");
  const v = c.vehicles.find((v) => v.spec.id === targetId);
  if (
    !v ||
    !c.available(v) ||
    !finiteVehicle(v) ||
    !c.humanoid.position.toArray().every(Number.isFinite)
  )
    return fail("HUMANOID_TARGET_UNAVAILABLE", "目标不可用");
  if (!c.humanoid.canBoard)
    return fail("HUMANOID_CHARACTER_BUSY", c.humanoid.boardingReason);
  if (v.velocity.length() >= ENTER_SPEED_LIMIT)
    return fail("VEHICLE_MOUNT_TOO_FAST", "坐骑速度过快");
  if (!grounded(c, v))
    return fail("VEHICLE_MOUNT_GROUND_REQUIRED", "需要已落地且不在水中的坐骑");
  const p = c.humanoid.position,
    body = vehicleBody(v.spec),
    local = p.clone().sub(v.position).applyAxisAngle(up, -v.yaw);
  if (
    p.distanceTo(v.position) >
    Math.max(
      MAXIMUM_REACH_METERS,
      body.kind === "box" ? body.halfExtents[0] + 2 : 0,
    )
  )
    return fail("VEHICLE_MOUNT_OUT_OF_REACH", "坐骑超出登乘距离");
  if (
    body.kind !== "box" ||
    Math.abs(local.x) < body.halfExtents[0] ||
    Math.abs(local.z) > body.halfExtents[2]
  )
    return fail("VEHICLE_MOUNT_SIDE_REQUIRED", "请从坐骑侧面登乘");
  const support = c.environment.standingSupport(
      p,
      SUPPORT_CONTACT_METERS,
      c.humanoid.controller.maxSlopeClimbAngle(),
    ),
    water = c.environment.waterAt(p);
  if (!support || c.humanoid.vertical > 0 || (water && water.surface > p.y))
    return fail("VEHICLE_MOUNT_GROUND_REQUIRED", "人物需要站在有效地面");
  if (
    c.environment.bodyOverlap(
      pose(c, p),
      riderFilter(c),
      c.humanoid.controller.offset(),
    )
  )
    return fail("VEHICLE_MOUNT_SPACE_BLOCKED", "人物当前位置被占用");
  if (
    c.environment.bodyOverlap(
      { position: v.position, rotation: v.rotation, body },
      riderFilter(c, v),
      c.humanoid.controller.offset(),
    )
  )
    return fail("VEHICLE_MOUNT_SPACE_BLOCKED", "骑乘组合空间不足");
  const candidate = standing(c, v, Math.sign(local.x));
  if (!candidate)
    return fail("VEHICLE_MOUNT_SPACE_BLOCKED", "登乘侧没有有效站立空间");
  if (
    c.environment.bodyPathBlocked(
      [pose(c, p), pose(c, candidate)],
      riderFilter(c),
    ) ||
    !attachment(c, v, candidate)
  )
    return fail("VEHICLE_MOUNT_OBSTRUCTED", "登乘路径被阻挡");
  return {
    ok: true,
    instanceId: v.spec.id,
    position: seat(v),
    yaw: v.yaw,
    velocity: new Vector3(),
  };
}
export function evaluateDismount(c: MountContext): MountDecision {
  if (c.transitionSeconds > 0)
    return fail("HUMANOID_TRANSITION_ACTIVE", "骑乘切换尚未完成");
  const v = c.vehicles.find((v) => v.spec.id === c.mountedInstanceId);
  if (!v) return fail("HUMANOID_NOT_MOUNTED", "人物未骑乘");
  if (!finiteVehicle(v))
    return fail("HUMANOID_TARGET_UNAVAILABLE", "目标状态无效");
  if (v.velocity.length() > EXIT_SPEED_LIMIT)
    return fail("VEHICLE_MOUNT_TOO_FAST", "请先减速再下马");
  if (!grounded(c, v))
    return fail("VEHICLE_MOUNT_GROUND_REQUIRED", "需要已落地且不在水中的坐骑");
  if (
    c.environment.bodyOverlap(
      { position: v.position, rotation: v.rotation, body: vehicleBody(v.spec) },
      riderFilter(c, v),
      c.humanoid.controller.offset(),
    )
  )
    return fail("VEHICLE_DISMOUNT_NO_SAFE_POINT", "骑乘空间被占用");
  for (const side of [1, -1]) {
    const p = standing(c, v, side);
    if (p && attachment(c, v, p, true))
      return {
        ok: true,
        instanceId: v.spec.id,
        position: p,
        yaw: v.yaw,
        velocity: v.velocity.clone(),
      };
  }
  return fail("VEHICLE_DISMOUNT_NO_SAFE_POINT", "两侧没有安全下马路径和落点");
}
