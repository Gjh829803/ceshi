import { Euler,Vector3 } from 'three';
import type { EnvironmentQueries } from '../../environment/queries';
import type { Input,VehicleState } from '../../simulation';
export type MotionIntent = (v: VehicleState, input: Input, dt: number, time: number, q: EnvironmentQueries) => void;
const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n));
/** Existing flight, hover and creature controls supply intent to the shared
 * dynamic chassis. Only Rapier integrates the real position and momentum. */
export function motionForces(v: VehicleState, input: Input, h: number, time: number, q: EnvironmentQueries, mass: number, intent: MotionIntent) {
    const s = v.spec, mode = s.mode;
    const draft: VehicleState = { ...v, position: v.position.clone(), rotation: v.rotation.clone(), velocity: v.velocity.clone(), motion: { ...v.motion, ...(v.motion.creature ? { creature: { ...v.motion.creature, leadPosition: v.motion.creature.leadPosition?.clone() } } : {}) } as VehicleState['motion'] };
    const driven = v.motion.body!.riderMounted || [input.forward, input.steer, input.lift, input.roll, input.pitch, input.strafe].some(n => Math.abs(n) > .01) || input.boost || input.jump;
    q.withoutContactImpulses(() => intent(draft, input, h, time, q));
    const force = new Vector3(), torque = new Vector3(), water = q.waterAt(v.position);
    const limit = Math.max(2, s.accel, s.brakeDeceleration, s.grip * v.velocity.length(), 0);
    if (driven) {
        force.x = mass * clamp((draft.velocity.x - v.velocity.x) / h, limit);
        force.z = mass * clamp((draft.velocity.z - v.velocity.z) / h, limit);
    }
    else {
        // Unoccupied actors coast and exchange momentum; never pin them to a pose.
        const drag = mode === 'skateboard' ? .12 : v.grounded ? .6 : .04;
        force.x = -mass * v.velocity.x * drag;
        force.z = -mass * v.velocity.z * drag;
    }
    if (mode === 'hover') {
        const floor = q.support(v.position, 120, .45)?.height ?? q.map.bounds.min[1];
        const target = Math.max(floor, water?.surface ?? -Infinity) + 1.3;
        force.y = mass * (9.81 + clamp((target - v.position.y) * 28 - v.velocity.y * 8, 35));
    }
    else if (v.motion.creature && driven && draft.grounded && draft.position.y > v.position.y + .001) {
        // The existing hoof-step/headroom query verifies the climb. Supply lift to
        // the same body instead of teleporting it onto the tread.
        force.y = mass * (9.81 + clamp((draft.position.y - v.position.y) * 160 - v.velocity.y * 16, 35));
    }
    else if (input.jump && draft.velocity.y > v.velocity.y) {
        force.y = mass * (draft.velocity.y - v.velocity.y) / h;
    }
    // Upright assistance is torque-limited, so impacts still rotate the chassis.
    if (driven || v.grounded || mode === 'hover') {
        const target = draft.rotation.clone();
        if (!driven) {
            const angles = new Euler().setFromQuaternion(v.rotation, 'YXZ');
            target.setFromEuler(new Euler(0, angles.y, 0, 'YXZ'));
        }
        const error = target.multiply(v.rotation.clone().invert());
        if (error.w < 0)
            error.set(-error.x, -error.y, -error.z, -error.w);
        const localError = new Vector3(error.x, error.y, error.z).multiplyScalar(2).applyQuaternion(v.rotation.clone().invert());
        const omega = v.motion.body!.angularVelocity.clone().applyQuaternion(v.rotation.clone().invert());
        const e = s.envelope.halfExtents, j = new Vector3(mass * (4 * e[2] ** 2 + 1) / 12, mass * (4 * e[0] ** 2 + 4 * e[2] ** 2) / 12, mass * (4 * e[0] ** 2 + 1) / 12);
        // The intent yaw is one slice ahead. Feed its angular velocity to the PD
        // controller instead of accumulating a second authoritative orientation.
        const targetYaw = driven ? Math.atan2(Math.sin(draft.yaw - v.yaw), Math.cos(draft.yaw - v.yaw)) / h : 0;
        const rate = driven ? 1 / h : 4;
        torque.set(j.x * clamp((localError.x * rate - omega.x) * 24, 60), j.y * clamp((targetYaw - omega.y) * 24, 60), j.z * clamp((localError.z * rate - omega.z) * 24, 60)).applyQuaternion(v.rotation);
    }
    v.steering = draft.steering;
    v.throttle = driven ? (Math.max(...[input.forward, input.steer, input.lift, input.roll, input.pitch, input.strafe].map(Math.abs))) : 0;
    v.launched = draft.launched;
    v.submerged = draft.submerged;
    if (draft.motion.creature)
        v.motion.creature = draft.motion.creature;
    return { force, torque, draftPosition: draft.position, draftRotation: draft.rotation, draftYaw: draft.yaw };
}
