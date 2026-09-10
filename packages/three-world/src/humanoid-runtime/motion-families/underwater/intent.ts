import { Euler,Vector3 } from 'three';
import { vehicleImpactMass } from '../../config';
import { EnvironmentQueries,vehicleBody } from '../../environment/queries';
import { groundVehiclePose } from '../../environment/vehicle-pose';
import type { Input,VehicleState } from '../../simulation';
import { finishSubmersibleStep,stepSubmersible } from './submersible';
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const forward = new Vector3(), right = new Vector3();
const euler = new Euler(0, 0, 0, 'YXZ');
function stepVehicleControls(v: VehicleState, i: Input, dt: number, _time: number, q: EnvironmentQueries) {
    const sample = (x: number, z: number, afloat = false) => { const p = new Vector3(x, v.position.y, z), floor = q.support(p, 120, .45)?.height ?? q.map.bounds.min[1]; const w = q.waterAt(p); return afloat && w ? Math.max(floor, w.surface) : floor; };
    const supportHeight = (x: number, z: number, _radius: number, afloat = false) => sample(x, z, afloat);
    const footprintWet = (x: number, z: number, radius: number) => q.waterContains(new Vector3(x, 0, z), radius);
    const waterSurface = q.waterAt(v.position)?.surface ?? v.position.y;
    const s = v.spec, old = v.position.clone();
    v.steering = damp(v.steering, i.steer, Math.abs(i.steer) > 0 ? s.steeringResponse : s.steeringReturn, dt);
    if (v.motion.submersible) {
        stepSubmersible(v, i, dt, q);
        return;
    }
    {
        v.yaw -= v.steering * s.steer * dt;
        v.roll += i.roll * dt;
        v.pitch = damp(v.pitch, i.lift * .25, s.pitchResponse, dt);
        forward.set(Math.sin(v.yaw) * Math.cos(v.pitch), Math.sin(v.pitch), Math.cos(v.yaw) * Math.cos(v.pitch));
        v.velocity.addScaledVector(forward, i.forward * s.accel * dt);
        v.velocity.y += i.lift * s.verticalAcceleration * dt;
        right.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
        v.velocity.addScaledVector(right, -v.velocity.dot(right) * (1 - Math.exp(-s.grip * dt)));
        v.velocity.x *= Math.exp(-(Math.abs(i.forward) < .01 ? s.linearDamping : s.drag) * dt);
        v.velocity.z *= Math.exp(-(Math.abs(i.forward) < .01 ? s.linearDamping : s.drag) * dt);
        v.velocity.y *= Math.exp(-(Math.abs(i.lift) < .01 ? s.verticalDamping : .35) * dt);
        if (i.boost)
            v.velocity.multiplyScalar(Math.exp(-s.brakeDamping * dt));
        v.velocity.clampLength(0, s.speed);
        v.position.addScaledVector(v.velocity, dt);
        if (!footprintWet(v.position.x, v.position.z, s.radius)) {
            v.position.x = old.x;
            v.position.z = old.z;
            v.velocity.x = 0;
            v.velocity.z = 0;
        }
        const bottom = supportHeight(v.position.x, v.position.z, s.radius) + 2;
        v.position.y = clamp(v.position.y, bottom, waterSurface - 1.0);
        if ((v.position.y <= bottom && v.velocity.y < 0) || (v.position.y >= waterSurface - 1 && v.velocity.y > 0))
            v.velocity.y = 0;
        v.rotation.setFromEuler(euler.set(-v.pitch, v.yaw, v.roll, 'YXZ'));
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
    if (ground || v.motion.submersible)
        v.grounded = hit.grounded;

    if (v.motion.submersible)
        finishSubmersibleStep(v, dt, time);
    if (hit.blocked)
        v.speed = Math.min(v.speed, v.velocity.length());
    if (!v.motion.submersible && !q.waterContains(v.position, v.spec.radius)) {
        v.position.copy(old);
        v.velocity.set(0, 0, 0);
        v.speed = 0;
    }
}
