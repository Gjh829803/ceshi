import type { Vec3, WorldInput, WorldSnapshot } from '@worldkit/three';
import type { EpisodeSegmentPlan } from '../contracts.js';

export const ROUTE_CONTROLLER_VERSION = 'worldkit-three-route-controller-2';
export interface RouteMovement {
  readonly kind: string; readonly walkSpeedMetersPerSecond: number; readonly runSpeedMetersPerSecond: number;
  readonly jumpSpeedMetersPerSecond?: number; readonly heightMeters: number; readonly radiusMeters: number;
}
export interface RouteDecision {
  readonly input: WorldInput;
  readonly waypointIndex: number;
  readonly mode: 'travel' | 'backtrack' | 'finished' | 'failed' | 'action';
  readonly positionWorldMetersXYZ: Vec3;
  readonly targetPositionWorldMetersXYZ?: Vec3;
  readonly distanceToTargetMeters?: number;
  readonly diagnostic?: { readonly code: string; readonly message: string; readonly collisionEntityIds: readonly string[] };
}

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Uses the SDK's input basis, which can differ from a still-blending rendered
 * camera. This controller never moves the actor, queries a map or changes a route. */
export function routeDirectionInput(position: Vec3, target: Vec3, forward: Vec3, run: boolean): WorldInput {
  const length = Math.hypot(target[0] - position[0], target[2] - position[2]);
  const forwardLength = Math.hypot(forward[0], forward[2]);
  if (length < 1e-8) return {};
  if (!Number.isFinite(forwardLength) || forwardLength < 1e-8) throw new Error('EPISODE_CONTROL_BASIS_INVALID');
  const dx = (target[0] - position[0]) / length, dz = (target[2] - position[2]) / length;
  const fx = forward[0] / forwardLength, fz = forward[2] / forwardLength;
  return { moveXRatio: Math.max(-1, Math.min(1, dx * -fz + dz * fx)),
    moveZRatio: Math.max(-1, Math.min(1, -(dx * fx + dz * fz))), run };
}

export interface RouteCursor {readonly waypointIndex:number;readonly direction:number;readonly finished:boolean}
export class RouteController {
  private readonly route: { positionWorldMetersXYZ: Vec3; gait: 'walk' | 'run' }[];
  private index = 0;
  private direction = 1;
  private arrived = false;
  private stationarySince: number | undefined;
  private anchor: Vec3 | undefined;
  private recoveryTarget: Vec3 | undefined;
  private recoverySince = 0;
  private recoveredAtWaypoint = false;
  private jumpAttempted = false;
  private readonly breadcrumbs: Vec3[] = [];
  private failure: RouteDecision['diagnostic'];
  private waypointHold: { waypointIndex: number; radiusMeters: number } | undefined;
  get cursor():RouteCursor{return {waypointIndex:this.index-(this.segment.endBehavior==='reverse'?1:0),direction:this.direction,finished:this.arrived};}
  seekCursor(cursor:RouteCursor){
    this.index=cursor.waypointIndex+(this.segment.endBehavior==='reverse'?1:0);this.direction=cursor.direction;this.arrived=cursor.finished;
    this.anchor=undefined;this.stationarySince=undefined;this.recoveryTarget=undefined;this.recoveredAtWaypoint=false;this.jumpAttempted=false;this.failure=undefined;
  }
  holdWaypoint(trigger: { waypointIndex: number; radiusMeters: number } | undefined) { this.waypointHold = trigger; }
  completeHeldWaypoint(index: number) {
    if (Math.max(0, this.index - (this.segment.endBehavior === 'reverse' ? 1 : 0)) !== index) throw new Error('EPISODE_ACTION_ROUTE_INDEX_CHANGED');
    this.anchor = undefined; this.stationarySince = undefined; this.recoveredAtWaypoint = false; this.jumpAttempted = false;
    const next = this.index + this.direction;
    if (next >= 0 && next < this.route.length) this.index = next;
    else if (this.segment.endBehavior === 'loop') this.index = 0;
    else if (this.segment.endBehavior === 'reverse') { this.direction *= -1; this.index = Math.max(0, Math.min(this.route.length - 1, this.index + this.direction)); }
    else this.arrived = true;
  }
  constructor(private readonly segment: EpisodeSegmentPlan, private readonly movement: RouteMovement) {
    this.route = segment.waypoints.map(waypoint => ({ ...waypoint }));
    if (segment.endBehavior === 'reverse') {
      this.route.unshift({ positionWorldMetersXYZ: segment.start.positionWorldMetersXYZ, gait: this.route[0]!.gait });
      this.index = 1;
    }
  }

  step(snapshot: WorldSnapshot, controlForwardWorldXYZ: Vec3, elapsedSeconds: number): RouteDecision {
    const actor = snapshot.entities.find(entity => entity.id === snapshot.controlledEntityId);
    if (!actor) throw new Error('EPISODE_CONTROLLED_ENTITY_MISSING');
    const position = actor.positionWorldMetersXYZ;
    const collisionEntityIds = actor.motion?.collisionEntityIds ?? [];
    const isGrounded = actor.motion?.isGrounded ?? false;
    const waypointIndex = () => Math.max(0, this.index - (this.segment.endBehavior === 'reverse' ? 1 : 0));
    const base = { waypointIndex: waypointIndex(), positionWorldMetersXYZ: position };
    if (this.failure) return { ...base, mode: 'failed', input: {}, diagnostic: this.failure };
    const fail = (code: string, message: string): RouteDecision => {
      this.failure = { code, message, collisionEntityIds };
      return { ...base, mode: 'failed', input: {}, diagnostic: this.failure };
    };
    if (isGrounded && (!this.breadcrumbs.length || distance(position, this.breadcrumbs.at(-1)!) >= 0.4)) {
      this.breadcrumbs.push(position); if (this.breadcrumbs.length > 150) this.breadcrumbs.shift();
    }
    const target = this.recoveryTarget ?? this.route[this.index]?.positionWorldMetersXYZ;
    if (!target || this.arrived) return { ...base, mode: 'finished', input: {} };
    const distanceToTargetMeters = distance(position, target);
    const horizontalDistance = Math.hypot(position[0] - target[0], position[2] - target[2]);
    const speed = this.route[this.index]?.gait === 'run' ? this.movement.runSpeedMetersPerSecond : this.movement.walkSpeedMetersPerSecond;
    // One rendered interval of forward motion plus a small body-relative radius.
    // Height is checked independently; another floor is never reached in XZ only.
    const held = this.waypointHold?.waypointIndex === waypointIndex() ? this.waypointHold : undefined;
    const horizontalTolerance = held?.radiusMeters ?? Math.max(0.3, Math.min(0.8, this.movement.radiusMeters + speed / 24));
    const verticalTolerance = Math.max(0.3, Math.min(0.7, this.movement.heightMeters * 0.25));
    if (held && !this.recoveryTarget && horizontalDistance <= horizontalTolerance && Math.abs(position[1] - target[1]) <= verticalTolerance) {
      this.anchor = position; this.stationarySince = elapsedSeconds;
      return { ...base, mode: 'action', input: {}, targetPositionWorldMetersXYZ: target, distanceToTargetMeters };
    }
    if (horizontalDistance <= horizontalTolerance && Math.abs(position[1] - target[1]) <= verticalTolerance) {
      this.anchor = position; this.stationarySince = elapsedSeconds;
      if (this.recoveryTarget) { this.recoveryTarget = undefined; }
      else {
        this.recoveredAtWaypoint = false; this.jumpAttempted = false;
        const next = this.index + this.direction;
        if (next >= 0 && next < this.route.length) this.index = next;
        else if (this.segment.endBehavior === 'loop') this.index = 0;
        else if (this.segment.endBehavior === 'reverse') {
          this.direction *= -1;
          this.index = Math.max(0, Math.min(this.route.length - 1, this.index + this.direction));
        } else { this.arrived = true; return { ...base, mode: 'finished', input: {} }; }
      }
      const updated = this.recoveryTarget ?? this.route[this.index]?.positionWorldMetersXYZ;
      return { waypointIndex: waypointIndex(), positionWorldMetersXYZ: position, mode: 'travel', input: updated ? routeDirectionInput(position, updated, controlForwardWorldXYZ, this.route[this.index]?.gait === 'run') : {}, ...(updated ? { targetPositionWorldMetersXYZ: updated, distanceToTargetMeters: distance(position, updated) } : {}) };
    }
    if (!this.anchor || distance(position, this.anchor) >= 0.2) { this.anchor = position; this.stationarySince = elapsedSeconds; }
    const stationarySeconds = elapsedSeconds - (this.stationarySince ?? elapsedSeconds);
    if (this.recoveryTarget && elapsedSeconds - this.recoverySince > 2) return fail('ROUTE_BACKTRACK_BLOCKED', 'Could not return along the recently traversed supported path within two seconds.');
    if (horizontalDistance <= horizontalTolerance && Math.abs(position[1] - target[1]) > verticalTolerance && isGrounded && stationarySeconds > 1) {
      return fail('ROUTE_VERTICAL_MISMATCH', 'The actor reached the waypoint XZ coordinates on a different elevation; provide a route to the intended floor.');
    }
    if(this.movement.kind==='custom'&&stationarySeconds>=2.5)return fail('ROUTE_BLOCKED','The custom movement input made no progress toward the actual target.');
    if (stationarySeconds >= 2.5) {
      if (this.recoveredAtWaypoint || this.recoveryTarget) return fail('ROUTE_BLOCKED', 'Movement toward the requested waypoint remains blocked after bounded recovery.');
      const previous = [...this.breadcrumbs].reverse().find(point => distance(position, point) >= 0.8 && distance(position, point) <= 2);
      if (!previous) return fail('ROUTE_BLOCKED', 'The actor cannot progress toward the waypoint and no recent supported path is available for bounded backtracking.');
      this.recoveryTarget = previous; this.recoverySince = elapsedSeconds; this.recoveredAtWaypoint = true;
      this.anchor = position; this.stationarySince = elapsedSeconds;
    }
    const requestedTarget = this.recoveryTarget ?? target;
    const input = routeDirectionInput(position, requestedTarget, controlForwardWorldXYZ, !this.recoveryTarget && this.route[this.index]?.gait === 'run');
    if (this.movement.kind!=='custom' && !this.recoveryTarget && stationarySeconds > 1 && !this.jumpAttempted && isGrounded && (this.movement.jumpSpeedMetersPerSecond ?? 0) > 0 && horizontalDistance > horizontalTolerance) {
      this.jumpAttempted = true;
      return { ...base, targetPositionWorldMetersXYZ: requestedTarget, distanceToTargetMeters, mode: 'travel', input: { ...input, jumpPressed: true } };
    }
    return { ...base, targetPositionWorldMetersXYZ: requestedTarget, distanceToTargetMeters, mode: this.recoveryTarget ? 'backtrack' : 'travel', input };
  }
}
