import { Euler,Vector3 } from 'three';
import { VEHICLE_ATTITUDE } from '../../../config/vehicle';
import { vehicleImpactMass } from '../../config';
import { EnvironmentQueries,vehicleBody } from '../../environment/queries';
import { groundVehiclePose } from '../../environment/vehicle-pose';
import { coastSpeed,roadYawRate } from '../../handling';
import type { Input,VehicleState } from '../../simulation';
import { finishJetSkiStep,stepJetSki } from './jetski';
import { stepKayak } from './paddling';
import { finishRaftContact,stepRaft } from './raft';
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const forward = new Vector3(), right = new Vector3(), scratch = new Vector3();
const euler = new Euler(0, 0, 0, 'YXZ');
function stepVehicleControls(v: VehicleState, i: Input, dt: number, time: number, q: EnvironmentQueries) {
    const sample = (x: number, z: number, afloat = false) => { const p = new Vector3(x, v.position.y, z), floor = q.support(p, 120, .45)?.height ?? q.map.bounds.min[1]; const w = q.waterAt(p); return afloat && w ? Math.max(floor, w.surface) : floor; };
    const surfaceHeight = (x: number, z: number) => sample(x, z);
    const wetHeight = (x: number, z: number) => { const water = q.waterAt(new Vector3(x, v.position.y, z)); return !!water && v.position.y < water.surface - .1; };
    const footprintWet = (x: number, z: number, radius: number) => q.waterContains(new Vector3(x, 0, z), radius);
    const waterSurface = q.waterAt(v.position)?.surface ?? v.position.y;
    const s = v.spec, mode = s.mode, old = v.position.clone();
    const road = mode === 'motorcycle';
    v.steering = damp(v.steering, i.steer, Math.abs(i.steer) > 0 ? s.steeringResponse : s.steeringReturn, dt);
    if (s.archetype === 'raft') {
        stepRaft(v, i, dt, q);
        return;
    }
    if (s.archetype === 'jetski') {
        stepJetSki(v, i, dt, q);
        return;
    }
    if (mode === 'paddled_boat') {
        stepKayak(v, i, dt, q);
        return;
    }
    {
        forward.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
        right.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
        let speed = v.velocity.dot(forward), side = v.velocity.dot(right);
        const max = i.boost ? s.maxSpeed : s.speed, water = wetHeight(v.position.x, v.position.z);
        const driveDisabled = water && mode !== 'boat';
        const braking = i.forward < 0 && speed > 1;
        // Slip itself carries the recovery: no second integrator or hidden timer.
        const driftSpeed = clamp((speed - 2.5) / 3.5, 0, 1);
        const driftEnabled = road && s.brakeDrift === true;
        const initiatingDrift = driftEnabled && (braking || i.brake) && Math.abs(v.steering) > .12;
        const existingSlip = clamp((Math.abs(side) / Math.max(Math.abs(speed), 1) - .2) / .35, 0, 1);
        const drift = driftEnabled ? driftSpeed * (initiatingDrift ? 1 : existingSlip * .85) : 0;
        const acceleration = braking ? -s.brakeDeceleration * (1 - drift * .3) : i.forward * s.accel;
        speed += driveDisabled ? 0 : acceleration * dt;
        if (Math.abs(i.forward) < .01)
            speed = coastSpeed(speed, s.coastDeceleration, dt);
        if (i.brake)
            speed *= Math.exp(-s.brakeDamping * (1 - drift * .3) * dt);
        speed = clamp(speed, -s.reverseSpeed, max);
        if (driveDisabled)
            speed *= Math.exp(-2.5 * dt);
        // 动力船保留静止转向辅助；A/D 不产生前进推力，倒船时沿用原有反向舵效。
        const yawRate = road ? roadYawRate(speed, s.steer) : s.steer * (mode === 'boat' ? Math.max(.35, Math.min(Math.abs(speed) / 4, 1)) * (speed < -.05 ? -1 : 1) : 1);
        v.yaw -= v.steering * yawRate * dt * (driftEnabled ? 1 + drift * .35 : 1);
        const newF = scratch.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
        {
            side *= Math.exp(-s.grip * dt);
            v.velocity.x = newF.x * speed + Math.cos(v.yaw) * side;
            v.velocity.z = newF.z * speed - Math.sin(v.yaw) * side;
        }
        v.position.addScaledVector(v.velocity, dt);
        if (mode === 'boat') {
            if (!footprintWet(v.position.x, v.position.z, s.radius)) {
                v.position.copy(old);
                v.velocity.x = 0;
                v.velocity.z = 0;
            }
            v.position.y = waterSurface + .1 + Math.sin(time * 1.8 + v.position.z * .07) * .12;
            v.pitch = Math.sin(time * 1.3) * .025 + Math.abs(speed) * .003;
            v.roll = damp(v.roll, v.steering * speed * VEHICLE_ATTITUDE.boat.rollRadiansPerSteeringSpeed, VEHICLE_ATTITUDE.boat.rollResponsePerSecond, dt);
        }
        else {
            const actualFloor = surfaceHeight(v.position.x, v.position.z);
            v.velocity.y -= 18 * dt;
            if (v.position.y <= actualFloor + .12) {
                v.position.y = actualFloor;
                v.velocity.y = 0;
                v.grounded = true;
            }
            else
                v.grounded = false;
            const ahead = surfaceHeight(v.position.x + newF.x * 1.2, v.position.z + newF.z * 1.2), behind = surfaceHeight(v.position.x - newF.x * 1.2, v.position.z - newF.z * 1.2);
            const targetPitch = v.grounded && Math.abs(ahead - behind) < 3 ? Math.atan2(ahead - behind, 2.4) : 0;
            const attitude = VEHICLE_ATTITUDE.ground;
            v.pitch = damp(v.pitch, targetPitch, 12, dt);
            v.roll = damp(v.roll, clamp(v.steering * speed * attitude.rollRadiansPerSteeringSpeed, -attitude.maximumRollRadians, attitude.maximumRollRadians), attitude.rollResponsePerSecond, dt);
        }
        v.rotation.setFromEuler(euler.set(-v.pitch, v.yaw, v.roll, 'YXZ'));
        v.submerged = driveDisabled;
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
    const incoming = v.velocity.clone();
    const body = vehicleBody(v.spec), mode = v.spec.mode;
    const ground = !!v.motion.raft;
    // Low-speed taxiing rests on wheels too; airborne attitude keeps its original
    // oriented hull and lift path, including the transition into takeoff.
    const taxi = mode === 'plane' && v.grounded && v.speed <= 14 && v.velocity.y <= 0;
    const supported = ground || taxi;
    const delta = v.position.clone().sub(old), motionOrigin = old.clone();
    // Runners and ATV tyres must follow the slope. Inflating a pitched hull into a level box
    // suspends the sled above snow by half its length times the grade.
    const snowHull = !!v.motion.raft;
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
    if (supported && delta.y >= 0 && (!v.motion.raft || v.grounded))
        delta.y -= .02;
    // Sweep driving separately from resting gravity. A diagonal grazing cast can
    // otherwise report spurious lateral normals from a large flat floor.
    const push = { massKg: vehicleImpactMass(v.spec), dt };
    const horizontal = supported ? q.move(motionOrigin, new Vector3(delta.x, 0, delta.z), pose.body, pose.rotation, v.motion.raft ? 0 : ground ? .45 : 0, push) : null;
    const vertical = q.move(horizontal?.position ?? motionOrigin, horizontal ? new Vector3(0, delta.y, 0) : delta, pose.body, pose.rotation, 0, push);
    const hit = horizontal ? { ...vertical, grounded: horizontal.grounded || vertical.grounded, blocked: horizontal.blocked || vertical.blocked, normals: [...horizontal.normals, ...vertical.normals] } : vertical;
    if (snowHull && hit.normals.some(normal => normal.y >= .5))
        hit.grounded = true;
    if (v.motion.raft)
        hit.grounded = hit.normals.some(normal => normal.y >= .5) && delta.y <= 0;
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
    if (ground || mode === 'paddled_boat' || v.motion.jetski)
        v.grounded = hit.grounded;
    if (v.motion.raft)
        finishRaftContact(v, incoming, hit.normals);

    if (v.motion.jetski)
        finishJetSkiStep(v, old, dt, time);
    if (hit.blocked)
        v.speed = Math.min(v.speed, v.velocity.length());
    if (!v.motion.jetski && (mode === 'boat') && !q.waterContains(v.position, v.spec.radius)) {
        v.position.copy(old);
        v.velocity.set(0, 0, 0);
        v.speed = 0;
    }
}
