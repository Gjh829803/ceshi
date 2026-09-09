import { Euler, Vector3 } from 'three';
import type { EnvironmentQueries } from './environment/queries';
import type { Input, VehicleState } from './simulation';

/** Fixed-step state; reset with the vehicle, never advanced by presentation. */
export interface SledState { phase: number; push: number; brake: number; steer: number }
export const SLED_PUSH_PERIOD_SECONDS = .85;
const gravity = 9.81;

/** Unpowered runners on packed snow. The shared environment solver owns contacts.
 * groundSpeed caps human pushing, speed caps downhill travel. Friction is m/s²,
 * lateral grip is 1/s, dragQuadratic is 1/m. S and Space drag feet; neither reverses.
 */
export function stepSled(v: VehicleState, input: Input, dt: number, q: EnvironmentQueries): void {
  const s = v.spec, state = v.sled!;
  const support = q.support(v.position, 1, .15);
  const contact = !!support && v.grounded && v.position.y - support.height < .85;
  const wet = !!q.waterAt(v.position) && v.position.y < q.waterAt(v.position)!.surface;
  const f = new Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
  const speed = Math.hypot(v.velocity.x, v.velocity.z);
  const braking = input.brake || input.forward < 0;
  state.brake = contact && braking ? 1 : 0;
  state.steer = contact ? v.steering : 0;
  const pushing = contact && !wet && !braking && input.forward > 0 && speed < s.groundSpeed;
  state.phase = pushing ? (state.phase + dt / SLED_PUSH_PERIOD_SECONDS) % 1 : 0;
  state.push = pushing ? Math.max(0, Math.sin(state.phase * Math.PI * 2)) : 0;

  if (contact && !wet) {
    // Speed-dependent differential foot drag: no spinning about a stationary seat.
    const signedSpeed = v.velocity.dot(f);
    v.yaw -= v.steering * s.steer * Math.min(speed / 4, 1) * Math.sign(signedSpeed) * dt;
    f.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    const n = support.normal;
    // Tangential gravity, including crossfall. Sampling the normal avoids cliff
    // height differences being mistaken for enormous downhill acceleration.
    v.velocity.x += gravity * n.x * n.y * dt;
    v.velocity.z += gravity * n.z * n.y * dt;
    const push = Math.min(s.accel * state.push * input.forward * dt, Math.max(0, s.groundSpeed - speed));
    v.velocity.addScaledVector(f, push);
    const side = new Vector3(f.z, 0, -f.x);
    v.velocity.addScaledVector(side, -v.velocity.dot(side) * (1 - Math.exp(-s.grip * dt)));
    const horizontalSpeed = Math.hypot(v.velocity.x, v.velocity.z);
    // Braking always removes momentum, even while sliding backwards or sideways.
    const decel = s.coastDeceleration + s.dragQuadratic * horizontalSpeed ** 2
      + (braking ? s.brakeDeceleration : Math.abs(v.steering) * s.brakeDeceleration * .08);
    const remaining = Math.max(0, Math.min(s.speed, horizontalSpeed - decel * dt));
    const ratio = horizontalSpeed > 0 ? remaining / horizontalSpeed : 0;
    v.velocity.x *= ratio; v.velocity.z *= ratio;
    const pitch = Math.atan2(-(n.x * f.x + n.z * f.z), n.y);
    // YXZ: local +Y is (-sin(roll), cos(pitch)cos(roll), -sin(pitch)cos(roll)).
    const roll = -Math.asin(Math.max(-1,Math.min(1,n.x * f.z - n.z * f.x)));
    v.pitch += (pitch - v.pitch) * (1 - Math.exp(-s.pitchResponse * dt));
    v.roll += (roll - v.roll) * (1 - Math.exp(-s.rollResponse * dt));
  }
  if (wet) { v.velocity.x *= Math.exp(-5 * dt); v.velocity.z *= Math.exp(-5 * dt); }
  v.velocity.y -= gravity * dt;
  v.position.addScaledVector(v.velocity, dt);
  v.rotation.setFromEuler(new Euler(-v.pitch, v.yaw, v.roll, 'YXZ'));
  v.submerged = wet; v.speed = Math.hypot(v.velocity.x, v.velocity.z);
}
