import { Euler,Quaternion,Vector3 } from 'three';
import { vehicleImpactMass } from '../../config';
import { creatureBodies } from '../../creatures/controller';
import { vehicleBody,type EnvironmentQueries,type MoveResult,type QueryBody } from '../../environment/queries';
import type { Input,VehicleState } from '../../simulation';
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const approach = (a: number, b: number, amount: number) => a + clamp(b - a, -amount, amount);
const heading = (yaw: number) => new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
const rotationAt = (yaw: number,pitch=0) => new Quaternion().setFromEuler(new Euler(-pitch,yaw,0,'YXZ'));
function bodyBounds(position: Vector3, body: QueryBody, rotation: Quaternion) {
    const center = new Vector3(...body.offset).applyQuaternion(rotation).add(position), extent = new Vector3();
    if (body.kind === 'capsule')
        extent.set(body.radius, body.height / 2, body.radius);
    else
        for (let axis = 0; axis < 3; axis++) {
            const side = new Vector3().setComponent(axis, body.halfExtents[axis]!).applyQuaternion(rotation);
            extent.add(new Vector3(Math.abs(side.x), Math.abs(side.y), Math.abs(side.z)));
        }
    return { center, extent };
}
function clearBody(position: Vector3, body: QueryBody, rotation: Quaternion, q: EnvironmentQueries) {
    const { center, extent } = bodyBounds(position, body, rotation);
    for (let axis = 0; axis < 3; axis++)
        if (center.getComponent(axis) - extent.getComponent(axis) < q.map.bounds.min[axis]! - 1e-5 || center.getComponent(axis) + extent.getComponent(axis) > q.map.bounds.max[axis]! + 1e-5)
            return false;
    return !q.overlaps(position, body, rotation);
}
function touchesWater(v: VehicleState, q: EnvironmentQueries) {
    return q.map.water.length > 0 && creatureBodies(v).some(part => {
        const { center, extent } = bodyBounds(part.position, part.body, part.rotation), bottom = center.y - extent.y;
        return q.map.water.some(w => bottom < w.surface - .01 && center.y + extent.y > w.min[1] &&
            center.x + extent.x > w.min[0] && center.x - extent.x < w.max[0] && center.z + extent.z > w.min[2] && center.z - extent.z < w.max[2]);
    });
}
function stopInWater(v: VehicleState) {
    v.submerged = true;
    v.velocity.set(0, 0, 0);
    v.speed = 0;
    v.throttle = 0;
    v.steering = 0;
    v.launched = false;
    v.grounded = false;
    v.motion.creature!.flying = false;
    v.motion.creature!.gait = 'rest';
}
/** Sweep attitude as well as translation; pitch cannot rotate the hull through a wall. */
function turnIsClear(position: Vector3, body: QueryBody, from: Quaternion, to: Quaternion, q: EnvironmentQueries) {
    const samples = Math.max(1, Math.ceil(from.angleTo(to) / .02));
    for (let n = 1; n <= samples; n++)
        if (!clearBody(position, body, from.clone().slerp(to,n/samples), q))
            return false;
    return true;
}
function moveBody(position: Vector3, delta: Vector3, body: QueryBody, rotation: Quaternion, walking: boolean, q: EnvironmentQueries, push: {
    massKg: number;
    dt: number;
}): MoveResult {
    if (!walking)
        return q.move(position, delta, body, rotation, 0, push);
    // Separate floor support from horizontal control: combined diagonal sweeps can
    // slowly sink a long, yawed box into a flat floor through Rapier's contact tolerance.
    const horizontal = new Vector3(delta.x, 0, delta.z);
    const distance = (p: Vector3) => Math.hypot(p.x - position.x - delta.x, p.z - position.z - delta.z);
    let across = q.move(position, horizontal, body, rotation, 0, push);
    if (distance(across.position) > 1e-5) {
        const stepped = q.move(position, horizontal, body, rotation, .45);
        if (distance(stepped.position) < distance(across.position))
            across = stepped;
    }
    let down = q.move(across.position, new Vector3(0, delta.y, 0), body, rotation);
    if (distance(across.position) > 1e-5 && horizontal.lengthSq() > 1e-8 && q.support(position, .5, .02)) {
        const raised = q.move(position, new Vector3(0, .45, 0), body, rotation);
        if (raised.position.y - position.y > .449) {
            // A few millimetres of travel can stop in the collision skin before
            // autostep finds a tread. Probe one hoof-step ahead, then sweep only the
            // requested distance at that verified step height (including headroom).
            const look = horizontal.clone().setLength(Math.max(.12, horizontal.length()));
            const ahead = q.move(raised.position, look, body, rotation);
            const settled = q.move(ahead.position, new Vector3(0, -.51, 0), body, rotation);
            const complete = Math.hypot(ahead.position.x - raised.position.x - look.x, ahead.position.z - raised.position.z - look.z) < 1e-5;
            const rise = settled.position.y - position.y;
            if (complete && settled.grounded && rise > .01 && rise <= .45) {
                const lifted = q.move(position, new Vector3(0, rise, 0), body, rotation);
                const stepped = q.move(lifted.position, horizontal, body, rotation);
                if (distance(stepped.position) < distance(across.position) && clearBody(stepped.position, body, rotation, q)) {
                    across = stepped;
                    down = { ...stepped, grounded: true };
                }
            }
        }
    }
    const result = { ...down, grounded: across.grounded || down.grounded, normals: [...across.normals, ...down.normals] };
    const clearance = q.safeSpawn(result.position, body, rotation);
    if (clearance && clearance.y > result.position.y + 1e-5 && clearance.y - result.position.y < .08) {
        const lifted = q.move(result.position, clearance.clone().sub(result.position), body, rotation);
        if (lifted.position.distanceToSquared(clearance) < 1e-8 && !q.overlaps(clearance, body, rotation))
            result.position.copy(clearance);
    }
    const exact = result.position.clone();
    exact.x = position.x + delta.x;
    exact.z = position.z + delta.z;
    // Floor normals have small X/Z roundoff; preserve the requested horizontal travel.
    if (distance(result.position) < .005 && result.normals.every(normal => normal.y > .25) && clearBody(exact, body, rotation, q))
        result.position.copy(exact);
    result.blocked = result.position.clone().sub(position).distanceToSquared(delta) > 1e-6;
    return result;
}
function desiredSpeed(v:VehicleState,i:Input,dt:number,airborne=false){const spec=v.spec,speed=v.velocity.dot(heading(v.yaw));const maximum=airborne?(i.boost?spec.maxSpeed:spec.speed):spec.groundSpeed;const target=i.slow?0:clamp(i.forward,0,1)*maximum;const acceleration=i.slow||i.forward<0?spec.brakeDeceleration:Math.abs(i.forward)<.01?(!airborne?spec.groundDeceleration:spec.coastDeceleration):spec.accel;return approach(speed,target,acceleration*dt);}
function updateGait(v: VehicleState, dt: number) {
    const state = v.motion.creature!, speed = Math.hypot(v.velocity.x, v.velocity.z);
    state.gait = state.flying ? (Math.abs(v.velocity.y) < .6 && speed > 10 ? 'glide' : 'flap') : speed > .12 ? 'walk' : 'rest';
    const rate = state.gait === 'flap' ? Math.PI * 3.4 : state.gait === 'glide' ? .8 : Math.max(.65, speed * 2.5);
    state.phase += rate * dt;
    v.speed = v.velocity.length();
    v.launched = state.flying;
}
function stepDragon(v: VehicleState, i: Input, dt: number, q: EnvironmentQueries) {
    const state = v.motion.creature!, body = vehicleBody(v.spec), old = v.position.clone();
    // Space/C is independent from longitudinal braking and arrow-key pitch.
    const lift = clamp(i.lift || (i.jump ? 1 : 0), -1, 1);
    if (lift > 0 || !v.grounded)
        state.flying = true;
    const speed = desiredSpeed(v, i, dt, state.flying), turn = v.spec.steer * (state.flying ? 1 : .35);
    const yaw = v.yaw - v.steering * turn * dt * (speed < -.1 ? -1 : 1);
    const pitch=v.pitch+((state.flying?-i.pitch*.6:0)-v.pitch)*(1-Math.exp(-v.spec.pitchResponse*dt));
    const rotation=rotationAt(yaw,pitch);
    if (turnIsClear(old, body, v.rotation, rotation, q)) {
        v.yaw = yaw;v.pitch=pitch;v.rotation.copy(rotation);
    }
    const vertical = state.flying ? approach(v.velocity.y, lift * (i.boost ? 10 : 7)+Math.sin(v.pitch)*speed, 18 * dt) : v.grounded ? -1 : v.velocity.y - 18 * dt;
    v.velocity.copy(heading(v.yaw)).multiplyScalar(speed);
    v.velocity.y = vertical;
    const moved = moveBody(old, v.velocity.clone().multiplyScalar(dt), body, v.rotation, !state.flying, q, { massKg: vehicleImpactMass(v.spec), dt });
    if (clearBody(moved.position, body, v.rotation, q))
        v.position.copy(moved.position);
    v.velocity.copy(v.position).sub(old).divideScalar(dt);
    v.grounded = moved.grounded;
    if (v.grounded && lift <= 0) {
        state.flying = false;
        v.velocity.y = 0;
    }
    else if (lift > 0 && v.velocity.y > 0)
        v.grounded = false;
    v.roll = 0;
}
export function stepGroundedFlight(v: VehicleState, i: Input, dt: number, q: EnvironmentQueries) {
    if (!Number.isFinite(dt) || dt <= 0)
        return;
    if(v.motion.family!=='flying-creature')throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
    // These creatures stop on water contact until reset.
    if (v.submerged || touchesWater(v, q)) {
        stopInWater(v);
        return;
    }
    const duration = Math.min(dt, .25), steps = Math.max(1, Math.ceil(duration * 60)), slice = duration / steps;
    for (let n = 0; n < steps; n++) {
        const previous = { position: v.position.clone(), rotation: v.rotation.clone(), yaw: v.yaw, pitch: v.pitch, roll: v.roll };
        v.steering += (clamp(i.steer, -1, 1) - v.steering) * (1 - Math.exp(-(Math.abs(i.steer) > .01 ? v.spec.steeringResponse : v.spec.steeringReturn) * slice));
        v.throttle = i.forward;
        stepDragon(v, i, slice, q);
        if (touchesWater(v, q)) {
            // Cancel only the boundary-crossing advance. Keeping the last clear pose
            // avoids a teleport to shore.
            v.position.copy(previous.position);
            v.rotation.copy(previous.rotation);
            v.yaw = previous.yaw;
            v.pitch = previous.pitch;
            v.roll = previous.roll;
            stopInWater(v);
            return;
        }
        updateGait(v, slice);
    }
}
