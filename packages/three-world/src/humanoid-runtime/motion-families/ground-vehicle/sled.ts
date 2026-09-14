import { Euler,Vector3 } from 'three';
import type { EnvironmentQueries } from '../../environment/queries';
import type { Input,VehicleState } from '../../simulation';

/** Fixed-step state; reset with the vehicle, never advanced by presentation. */
export interface SledState { phase: number; push: number; brake: number; steer: number }
export const SLED_PUSH_PERIOD_SECONDS = .85;
const gravity = 9.81;

/** 木座雪橇允许蹬地倒退；滑雪板继续沿用负向输入仅制动的规则。 */
export function sledDriveControl(s:VehicleState['spec'],input:Input,speed:number) {
  const reverse=s.mode==='sled',direction=reverse?Math.sign(input.forward):Math.max(0,Math.sign(input.forward));
  return {direction,brake:input.brake||(reverse?input.forward*speed<-.08:input.forward<-.01),
    limit:direction<0?s.reverseSpeed:s.groundSpeed};
}
/** 雪橇静止时允许用脚调整朝向；滑雪板仍要求滑行，倒滑保留反向舵效。 */
export function sledYawRate(s:VehicleState['spec'],steer:number,speed:number,magnitude=Math.abs(speed)):number {
  const assistance=s.mode==='sled';
  return -steer*s.steer*Math.max(assistance?.45:0,Math.min(magnitude/4,1))*(assistance?(speed<-.08?-1:1):Math.sign(speed));
}

/** Unpowered runners on packed snow. The shared environment solver owns contacts.
 * groundSpeed caps human pushing, speed caps downhill travel. Friction is m/s²,
 * lateral grip is 1/s, dragQuadratic is 1/m. S brakes then reverses the sled;
 * Space only brakes. Ski controls retain their independent no-reverse behavior.
 */
export function stepSled(v: VehicleState, input: Input, dt: number, q: EnvironmentQueries): void {
  const s = v.spec, state = v.motion.sled!;
  const support = q.support(v.position, 1, .15);
  const contact = !!support && v.grounded && v.position.y - support.height < .85;
  const wet = !!q.waterAt(v.position) && v.position.y < q.waterAt(v.position)!.surface;
  const f = new Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
  const speed = Math.hypot(v.velocity.x, v.velocity.z);
  const control=sledDriveControl(s,input,v.velocity.dot(f)),braking=control.brake;
  state.brake = contact && braking ? 1 : 0;
  state.steer = contact ? v.steering : 0;
  const pushing = contact && !wet && !braking && control.direction!==0 && speed < control.limit;
  state.phase = pushing ? (state.phase + dt / SLED_PUSH_PERIOD_SECONDS) % 1 : 0;
  state.push = pushing ? Math.max(0, Math.sin(state.phase * Math.PI * 2)) : 0;

  if (contact && !wet) {
    const signedSpeed = v.velocity.dot(f);
    v.yaw += sledYawRate(s,v.steering,signedSpeed,speed)*dt;
    f.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    const n = support.normal;
    // Tangential gravity, including crossfall. Sampling the normal avoids cliff
    // height differences being mistaken for enormous downhill acceleration.
    v.velocity.x += gravity * n.x * n.y * dt;
    v.velocity.z += gravity * n.z * n.y * dt;
    const push = control.direction*Math.min(s.accel * state.push * Math.abs(input.forward) * dt, Math.max(0, control.limit - speed));
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

/** 横坡支撑法线转换为此小类的 YXZ 侧倾目标。 */
export function sledSupportRoll(normal:{x:number;y:number;z:number},forward:{x:number;z:number}):number {
  return Math.atan2(normal.z*forward.x-normal.x*forward.z,normal.y);
}
