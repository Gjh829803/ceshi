import { Vector3 } from 'three';
import { vehicleBody, type EnvironmentQueries } from './environment/queries';
import { vehicleDriveTelemetry } from './vehicle-dynamics';
import type { Input, VehicleState } from './simulation';

export type VehicleCondition = 'normal' | 'flipped' | 'stuck' | 'airborne' | 'not-applicable';
export type VehicleRecoveryReason = 'flipped' | 'blocked' | 'flipped-and-blocked' | null;

export interface VehicleConditionObservation {
  condition: VehicleCondition;
  recoveryReason: VehicleRecoveryReason;
  recoveryAvailable: boolean;
}

interface VehicleConditionMemory {
  lastPosition: Vector3;
  blockedSeconds: number;
}

const UP = new Vector3(0, 1, 0);
const RECOVERY_MODES = new Set<VehicleState['spec']['mode']>([
  'wheeled', 'bus', 'tank', 'motorcycle', 'unicycle', 'skateboard', 'sled', 'ski', 'hover',
  'plane', 'glider',
]);
const BLOCKED_SECONDS = .45;
const BLOCKED_DECAY = .25;

export function supportsVehicleRecovery(v: VehicleState): boolean {
  return RECOVERY_MODES.has(v.spec.mode);
}

function verticalBounds(v: VehicleState): { bottom: number; extent: number } {
  const body = vehicleBody(v.spec);
  if (body.kind === 'capsule') {
    const axis = new Vector3(0, body.height / 2 - body.radius, 0).applyQuaternion(v.rotation);
    const extent = Math.abs(axis.y) + body.radius;
    const offset = new Vector3(...body.offset).applyQuaternion(v.rotation).y;
    return { bottom: v.position.y + offset - extent, extent };
  }
  const extentVector = new Vector3();
  body.halfExtents.forEach((half, axis) => {
    const component = new Vector3().setComponent(axis, half).applyQuaternion(v.rotation);
    extentVector.add(new Vector3(Math.abs(component.x), Math.abs(component.y), Math.abs(component.z)));
  });
  return {
    bottom: v.position.y + new Vector3(...body.offset).applyQuaternion(v.rotation).y - extentVector.y,
    extent: extentVector.y,
  };
}

function surfaceEvidence(v: VehicleState, q: EnvironmentQueries): { supported: boolean; normal: Vector3 } {
  const support = q.support(v.position, 6, .75);
  const bounds = verticalBounds(v);
  const supportClearance = Math.max(.85, Math.min(1.35, bounds.extent * .65));
  const nearSupport = !!support && support.height - bounds.bottom <= supportClearance && support.height - bounds.bottom >= -.2;
  const wheelContact = !!v.motion.wheelPhysics?.wheels.some(wheel => wheel.contact)
    || !!v.motion.aircraft?.wheels.some(wheel => wheel.contact);
  const bodyContact = (v.motion.body?.contactCount ?? 0) > 0;
  const embedded = q.overlaps(v.position, vehicleBody(v.spec), v.rotation);
  return {
    supported: v.grounded || nearSupport || wheelContact || bodyContact || embedded,
    normal: support?.normal.clone() ?? UP.clone(),
  };
}

function isFlightCapable(v: VehicleState): boolean {
  return v.motion.family === 'aircraft' || v.motion.family === 'flying-creature' || v.spec.mode === 'spacecraft';
}

function isAirborne(v: VehicleState, evidence: ReturnType<typeof surfaceEvidence>): boolean {
  if (v.motion.flyingCreature) return v.motion.flyingCreature.groundPhase !== 'grounded' && !evidence.supported;
  if (v.motion.family === 'aircraft') return !evidence.supported && (v.launched || !v.grounded);
  if (v.motion.family === 'ground-vehicle') return !evidence.supported;
  return isFlightCapable(v) && !evidence.supported;
}

function classify(v: VehicleState, q: EnvironmentQueries, blockedSeconds: number): VehicleConditionObservation {
  if (!supportsVehicleRecovery(v)) return { condition: isAirborne(v, surfaceEvidence(v, q)) ? 'airborne' : 'not-applicable', recoveryReason: null, recoveryAvailable: false };
  const evidence = surfaceEvidence(v, q);
  const localUp = UP.clone().applyQuaternion(v.rotation);
  const alignment = localUp.dot(evidence.normal);
  // Do not wait for a vehicle to be fully upside-down.  Two-wheel vehicles become
  // unusable well before 90 degrees; compare against the support plane so a steep
  // but correctly aligned ramp remains normal while a side-fallen motorcycle is
  // immediately recoverable.
  const staticMotorcycleLean = v.spec.mode === 'motorcycle' && v.velocity.length() < .75 && alignment < .9;
  const flipped = evidence.supported && (alignment < .72 || staticMotorcycleLean);
  // Do not require support evidence for a trapped aircraft.  A model can
  // penetrate a building while its collision/query proxy remains outside, so
  // the aircraft is technically airborne even though it cannot move.  The
  // tracker only reaches this branch after sustained input + near-zero motion.
  const stuck = blockedSeconds >= BLOCKED_SECONDS;
  if (flipped) {
    return {
      condition: 'flipped',
      recoveryReason: stuck ? 'flipped-and-blocked' : 'flipped',
      recoveryAvailable: true,
    };
  }
  if (stuck) return { condition: 'stuck', recoveryReason: 'blocked', recoveryAvailable: true };
  if (isAirborne(v, evidence)) return { condition: 'airborne', recoveryReason: null, recoveryAvailable: false };
  return { condition: 'normal', recoveryReason: null, recoveryAvailable: false };
}

/** Fixed-step memory for obstruction detection; reads do not advance it. */
export class VehicleConditionTracker {
  private readonly memory = new Map<string, VehicleConditionMemory>();

  update(v: VehicleState, input: Input, dt: number, q: EnvironmentQueries): void {
    const previous = this.memory.get(v.spec.id);
    const current = previous ?? { lastPosition: v.position.clone(), blockedSeconds: 0 };
    const movement = previous ? current.lastPosition.distanceTo(v.position) / Math.max(dt, 1e-6) : Infinity;
    const evidence = surfaceEvidence(v, q);
    const intent = Math.abs(input.forward) > .25 || Math.abs(input.steer) > .35 || input.boost;
    const drive = vehicleDriveTelemetry(v);
    const power = drive ? drive.effort > .05 : intent;
    // Aircraft may be visually/physically embedded without a matching support
    // hit.  Their zero-motion + sustained-control signal is still enough to
    // offer脱困; a genuinely flying aircraft keeps moving and never accumulates
    // this timer.
    const canBeAirborneBlocked = v.motion.family === 'aircraft';
    const blocked = supportsVehicleRecovery(v) && (evidence.supported || canBeAirborneBlocked) && intent && power
      && movement < .025 && v.velocity.length() < .35;
    // Keep a confirmed obstruction visible briefly after the driver releases
    // W/S/A/D to press F.  Without hysteresis the input edge itself clears the
    // state before the recovery-priority branch observes it.
    current.blockedSeconds = blocked
      ? current.blockedSeconds + Math.max(0, dt)
      : Math.max(0, current.blockedSeconds - Math.max(0, dt) * BLOCKED_DECAY);
    current.lastPosition.copy(v.position);
    this.memory.set(v.spec.id, current);
  }

  inspect(v: VehicleState, q: EnvironmentQueries): VehicleConditionObservation {
    return classify(v, q, this.memory.get(v.spec.id)?.blockedSeconds ?? 0);
  }

  clear(): void {
    this.memory.clear();
  }
}

export function vehicleCondition(v: VehicleState, q: EnvironmentQueries): VehicleConditionObservation {
  return classify(v, q, 0);
}
