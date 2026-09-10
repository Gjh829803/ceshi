import { Euler,Quaternion,Vector3 } from 'three';
import { vehicleImpactMass } from '../../config';
import { EnvironmentQueries,vehicleBody } from '../../environment/queries';
import { groundVehiclePose } from '../../environment/vehicle-pose';
import type { Input,VehicleState } from '../../simulation';
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const forward = new Vector3(), right = new Vector3(), up = new Vector3();
function stepVehicleControls(v: VehicleState, i: Input, dt: number, _time: number, _q: EnvironmentQueries) {
    const s = v.spec;
    v.steering = damp(v.steering, i.steer, Math.abs(i.steer) > 0 ? s.steeringResponse : s.steeringReturn, dt);
    {
        const angular = new Quaternion().setFromEuler(new Euler(i.pitch * s.steer * dt, -v.steering * s.steer * dt, i.roll * s.steer * dt, 'YXZ'));
        v.rotation.multiply(angular).normalize();
        forward.set(0, 0, 1).applyQuaternion(v.rotation);
        right.set(-1, 0, 0).applyQuaternion(v.rotation);
        up.set(0, 1, 0).applyQuaternion(v.rotation);
        // Stabilize only uncommanded local axes: turning redirects momentum while
        // an actively driven axis can still reach its configured maximum speed.
        const attenuation = 1 - Math.exp(-s.grip * dt);
        if (Math.abs(i.forward) < .01)
            v.velocity.addScaledVector(forward, -v.velocity.dot(forward) * attenuation);
        if (Math.abs(i.strafe) < .01)
            v.velocity.addScaledVector(right, -v.velocity.dot(right) * attenuation);
        if (Math.abs(i.lift) < .01)
            v.velocity.addScaledVector(up, -v.velocity.dot(up) * attenuation);
        v.velocity.addScaledVector(forward, i.forward * s.accel * dt).addScaledVector(right, i.strafe * s.accel * dt).addScaledVector(up, i.lift * s.accel * dt);
        if (i.boost)
            v.velocity.multiplyScalar(Math.exp(-s.brakeDamping * dt));
        v.velocity.clampLength(0, s.speed);
        v.position.addScaledVector(v.velocity, dt);
        v.yaw = Math.atan2(forward.x, forward.z);
        v.grounded = false;
    }
    v.speed = v.velocity.length();
}
function stopIntoNormals(velocity: Vector3, normals: Vector3[]) {
    for (const n of normals) {
        const d = velocity.dot(n);
        if (d < 0)
            velocity.addScaledVector(n, -d);
    }
}
export function stepFamilyIntent(v: VehicleState, i: Input, dt: number, time: number, q: EnvironmentQueries) {
    const old = v.position.clone(), oldRotation = v.rotation.clone(), oldYaw = v.yaw, oldPitch = v.pitch, oldRoll = v.roll;
    stepVehicleControls(v, i, dt, time, q);
    const body = vehicleBody(v.spec), mode = v.spec.mode;
    const ground = ['wheeled', 'bus', 'tank', 'motorcycle', 'unicycle', 'skateboard', 'sled', 'ski'].includes(mode);
    // Low-speed taxiing rests on wheels too; airborne attitude keeps its original
    // oriented hull and lift path, including the transition into takeoff.
    const taxi = mode === 'plane' && v.grounded && v.speed <= 14 && v.velocity.y <= 0;
    const supported = ground || taxi;
    const delta = v.position.clone().sub(old), motionOrigin = old.clone();
    // Runners and ATV tyres must follow the slope. Inflating a pitched hull into a level box
    // suspends the sled above snow by half its length times the grade.
    const snowHull = v.spec.archetype === 'atv';
    const levelHull = supported && !snowHull;
    let pose = levelHull ? groundVehiclePose(body, v.rotation, v.yaw) : { body, rotation: v.rotation };
    const previousPose = levelHull ? groundVehiclePose(body, oldRotation, oldYaw) : { body, rotation: oldRotation };
    // Ground lean changes hull clearance, not steering authority. Lift only to the
    // local support and sweep that lift with the old hull to retain roof clearance.
    const clear = supported && (!snowHull || q.overlaps(old, pose.body, pose.rotation)) ? q.safeSpawn(old, pose.body, pose.rotation) : null;
    if (q.overlaps(old, pose.body, pose.rotation) || (clear && clear.y > old.y + 1e-6)) {
        const raised = clear && q.move(old, clear.clone().sub(old), previousPose.body, previousPose.rotation);
        if (clear && raised && raised.position.distanceToSquared(clear) < 1e-6)
            motionOrigin.copy(clear);
        else {
            v.rotation.copy(oldRotation);
            v.yaw = oldYaw;
            v.pitch = oldPitch;
            v.roll = oldRoll;
            pose = previousPose;
        }
    }
    if (supported && delta.y >= 0)
        delta.y -= .02;
    // Sweep driving separately from resting gravity. A diagonal grazing cast can
    // otherwise report spurious lateral normals from a large flat floor.
    const push = { massKg: vehicleImpactMass(v.spec), dt };
    const horizontal = supported ? q.move(motionOrigin, new Vector3(delta.x, 0, delta.z), pose.body, pose.rotation, ground ? .45 : 0, push) : null;
    const vertical = q.move(horizontal?.position ?? motionOrigin, horizontal ? new Vector3(0, delta.y, 0) : delta, pose.body, pose.rotation, 0, push);
    const hit = horizontal ? { ...vertical, grounded: horizontal.grounded || vertical.grounded, blocked: horizontal.blocked || vertical.blocked, normals: [...horizontal.normals, ...vertical.normals] } : vertical;
    if (snowHull && hit.normals.some(normal => normal.y >= .5))
        hit.grounded = true;
    // Large floor colliders can leave a sub-centimetre overlap after Rapier's
    // resting cast. Recover only through a checked upward sweep, never through a
    // wall or ceiling; retain the last clear pose if recovery cannot fit.
    if (supported && (q.overlaps(hit.position, pose.body, pose.rotation) || q.overlaps(hit.position, body, v.rotation))) {
        const clearEnd = q.safeSpawn(hit.position, pose.body, pose.rotation);
        const recovery = clearEnd && q.move(hit.position, clearEnd.clone().sub(hit.position), pose.body, pose.rotation);
        if (clearEnd && recovery && recovery.position.distanceToSquared(clearEnd) < 1e-6 && !q.overlaps(clearEnd, body, v.rotation))
            hit.position.copy(clearEnd);
        else {
            hit.position.copy(motionOrigin);
            v.velocity.set(0, 0, 0);
            hit.blocked = true;
        }
    }
    v.position.copy(hit.position);
    // The controller climbs slopes up to 60 degrees; projecting drive onto their
    // normals every tick would erase speed while holding the vehicle on the ramp.
    stopIntoNormals(v.velocity, horizontal ? horizontal.normals.filter(n => n.y < .5) : hit.normals);
    if (horizontal) {
        if (hit.grounded)
            v.velocity.y = 0;
        if (vertical.normals.some(n => n.y < -.25))
            v.velocity.y = Math.min(0, v.velocity.y);
    }
    if (ground)
        v.grounded = hit.grounded;

    if (hit.blocked)
        v.speed = Math.min(v.speed, v.velocity.length());
}
