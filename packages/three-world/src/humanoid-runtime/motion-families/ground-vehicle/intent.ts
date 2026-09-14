import {skateboardSupport,skateboardRoll} from './skateboard';
import { Euler,Vector3 } from 'three';
import { VEHICLE_ATTITUDE } from '../../../config/vehicle';
import { vehicleImpactMass } from '../../config';
import { EnvironmentQueries,vehicleBody } from '../../environment/queries';
import { groundVehiclePose } from '../../environment/vehicle-pose';
import { coastSpeed,roadYawRate } from '../../handling';
import type { Input,VehicleState } from '../../simulation';
import { finishAtvStep,stepAtv } from './atv';
import { stepBus } from './bus';
import { stepSled } from './sled';
import { finishTankStep,stepTank } from './tank';
import { finishUnicycleStep,stepUnicycle } from './unicycle';
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const forward = new Vector3(), right = new Vector3(), scratch = new Vector3();
const euler = new Euler(0, 0, 0, 'YXZ');
function stepVehicleControls(v: VehicleState, i: Input, dt: number, _time: number, q: EnvironmentQueries) {
    const sample = (x: number, z: number, afloat = false) => { const p = new Vector3(x, v.position.y, z), floor = q.support(p, 120, .45)?.height ?? q.map.bounds.min[1]; const w = q.waterAt(p); return afloat && w ? Math.max(floor, w.surface) : floor; };
    const groundHeight = (x: number, z: number) => sample(x, z);
    const surfaceHeight = (x: number, z: number) => sample(x, z);
    const supportHeight = (x: number, z: number, _radius: number, afloat = false) => sample(x, z, afloat);
    const wetHeight = (x: number, z: number) => { const water = q.waterAt(new Vector3(x, v.position.y, z)); return !!water && v.position.y < water.surface - .1; };
    const s = v.spec, mode = s.mode, old = v.position.clone();
    const road = mode === 'wheeled' || mode === 'motorcycle';
    v.steering = damp(v.steering, i.steer, Math.abs(i.steer) > 0 ? s.steeringResponse : s.steeringReturn, dt);
    if (v.motion.unicycle) {
        stepUnicycle(v, i, dt, q);
        return;
    }
    if (s.archetype === 'atv') {
        stepAtv(v, i, dt, q);
        return;
    }
    if (mode === 'tank') {
        stepTank(v, i, dt, q);
        return;
    }
    if (mode === 'bus') {
        stepBus(v, i, dt, q);
        return;
    }
    if (mode === 'sled' || mode === 'ski') {
        stepSled(v, i, dt, q);
        return;
    }
    {
        forward.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
        right.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
        let speed = v.velocity.dot(forward), side = v.velocity.dot(right);
        const max = i.boost ? s.maxSpeed : s.speed, water = wetHeight(v.position.x, v.position.z);
        const driveDisabled = water && mode !== 'hover';
        const braking = i.forward < 0 && speed > 1;
        // Slip itself carries the recovery: no second integrator or hidden timer.
        const driftSpeed = clamp((speed - 2.5) / 3.5, 0, 1);
        const driftEnabled = road && s.brakeDrift === true;
        const initiatingDrift = driftEnabled && (braking || i.brake) && Math.abs(v.steering) > .12;
        const existingSlip = clamp((Math.abs(side) / Math.max(Math.abs(speed), 1) - .2) / .35, 0, 1);
        const drift = driftEnabled ? driftSpeed * (initiatingDrift ? 1 : existingSlip * .85) : 0;
        const lateralDrift = driftEnabled ? driftSpeed * (initiatingDrift ? 1 : existingSlip * .9) : 0;
        const acceleration = braking ? -s.brakeDeceleration * (1 - drift * .3) : i.forward * s.accel;
        speed += driveDisabled ? 0 : acceleration * dt;
        if (Math.abs(i.forward) < .01)
            speed = coastSpeed(speed, s.coastDeceleration, dt);
        if (i.brake)
            speed *= Math.exp(-s.brakeDamping * (1 - drift * .3) * dt);
        speed = clamp(speed, -s.reverseSpeed, max);
        if (driveDisabled)
            speed *= Math.exp(-2.5 * dt);
        const yawRate = road ? roadYawRate(speed, s.steer) : s.steer * (1);
        v.yaw -= v.steering * yawRate * dt * (driftEnabled ? 1 + drift * .35 : i.brake && mode === 'wheeled' ? 1.25 : 1);
        if (mode === 'hover')
            side -= i.roll * s.accel * dt;
        const newF = scratch.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
        if (mode === 'wheeled' || mode === 'skateboard' || (mode === 'motorcycle' && drift > 0)) {
            // Integrate drive along the old forward axis, then remove lateral slip
            // relative to the new heading. Repeatedly scaling the WHOLE velocity by
            // its forward projection caused low-grip turns to bleed speed every tick.
            v.velocity.x = forward.x * speed + right.x * side;
            v.velocity.z = forward.z * speed + right.z * side;
            const sideAfterTurn = v.velocity.x * Math.cos(v.yaw) - v.velocity.z * Math.sin(v.yaw);
            const removed = sideAfterTurn * (1 - Math.exp(-s.grip * (driftEnabled ? 1 - lateralDrift * (i.brake ? .98 : .96) : i.brake && mode === 'wheeled' ? .18 : 1) * dt));
            v.velocity.x -= Math.cos(v.yaw) * removed;
            v.velocity.z += Math.sin(v.yaw) * removed;
        }
        else {
            side *= Math.exp(-s.grip * dt);
            v.velocity.x = newF.x * speed + Math.cos(v.yaw) * side;
            v.velocity.z = newF.z * speed - Math.sin(v.yaw) * side;
        }
        if (mode === 'skateboard') {
            const sx = (groundHeight(old.x + .3, old.z) - groundHeight(old.x - .3, old.z)) / .6, sz = (groundHeight(old.x, old.z + .3) - groundHeight(old.x, old.z - .3)) / .6;
            if (Math.abs(sx) < 2)
                v.velocity.x -= sx * 9.8 * dt;
            if (Math.abs(sz) < 2)
                v.velocity.z -= sz * 9.8 * dt;
        }
        v.position.addScaledVector(v.velocity, dt);
        if (mode === 'hover') {
            const floor = supportHeight(v.position.x, v.position.z, s.radius, true), oldFloor = supportHeight(old.x, old.z, s.radius, true), target = floor + 1.3;
            // Follow the rate of terrain ascent, then enforce hull clearance independently of the spring.
            const surfaceRate = clamp((floor - oldFloor) / dt, -18, 18);
            v.velocity.y += ((target - v.position.y) * 28 + (surfaceRate - v.velocity.y) * 8) * dt;
            if (v.position.y < floor + .55) {
                v.position.y = floor + .55;
                v.velocity.y = Math.max(v.velocity.y, surfaceRate, 0);
            }
            const ahead = surfaceHeight(v.position.x + newF.x, v.position.z + newF.z), behind = surfaceHeight(v.position.x - newF.x, v.position.z - newF.z);
            const slope = Math.abs(ahead - behind) < 1.5 ? Math.atan2(ahead - behind, 2) : 0;
            v.pitch = damp(v.pitch, slope - i.forward * .04, 6, dt);
            v.roll = damp(v.roll, v.steering * VEHICLE_ATTITUDE.hover.rollRadiansPerSteering, VEHICLE_ATTITUDE.hover.rollResponsePerSecond, dt);
            v.grounded = false;
        }
        else {
            const actualFloor = surfaceHeight(v.position.x, v.position.z);
            v.velocity.y -= 18 * dt;
            if (mode==='skateboard'?skateboardSupport(v.position.y,actualFloor,v.grounded):v.position.y <= actualFloor + .12) {
                v.position.y = actualFloor;
                v.velocity.y = 0;
                v.grounded = true;
            }
            else
                v.grounded = false;
            const ahead = surfaceHeight(v.position.x + newF.x * 1.2, v.position.z + newF.z * 1.2), behind = surfaceHeight(v.position.x - newF.x * 1.2, v.position.z - newF.z * 1.2);
            const targetPitch = v.grounded && Math.abs(ahead - behind) < 3 ? Math.atan2(ahead - behind, 2.4) : 0;
            const attitude = mode === 'motorcycle' ? VEHICLE_ATTITUDE.motorcycle : VEHICLE_ATTITUDE.ground;
            v.pitch = damp(v.pitch, targetPitch, 12, dt);
            if(mode==='skateboard'&&v.grounded){const normal=q.support(v.position,1,.2)?.normal;if(normal)v.roll=damp(v.roll,skateboardRoll(normal,newF),12,dt);}
            else v.roll = damp(v.roll, clamp(v.steering * speed * attitude.rollRadiansPerSteeringSpeed, -attitude.maximumRollRadians, attitude.maximumRollRadians), attitude.rollResponsePerSecond, dt);
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
    const previousTank = v.motion.tank ? { ...v, position: old.clone(), rotation: oldRotation.clone(), velocity: v.velocity.clone(), motion: { ...v.motion, tank: { ...v.motion.tank } } } : null;
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
    const snowHull = mode === 'skateboard' || mode === 'sled' || mode === 'ski' || v.spec.archetype === 'atv';
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
    const horizontal = supported ? q.move(motionOrigin, new Vector3(delta.x, 0, delta.z), pose.body, pose.rotation, (mode === 'sled' || mode === 'ski') ? .08 : ground ? .45 : 0, push) : null;
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
    if (previousTank)
        finishTankStep(v, previousTank, q);
    if (v.motion.atv)
        finishAtvStep(v, old, oldYaw, q);
    if (v.motion.unicycle)
        finishUnicycleStep(v, old, i, dt, q);
    if (hit.blocked)
        v.speed = Math.min(v.speed, v.velocity.length());
}
