import { Euler,Quaternion,Vector3 } from 'three';
import { vehicleBody,type EnvironmentQueries } from '../../environment/queries';
import { stepPowertrain } from '../../powertrain';
import type { Input,VehicleState } from '../../simulation';
import { TANK_CONTROLS,TANK_GEOMETRY,tankBarrel,tankSupportRoll } from './tank';
import { finishUnicycleStep,unicycleSupportRoll,UNICYCLE_GEOMETRY } from './unicycle';
import { sledSupportRoll,sledDriveControl,sledYawRate } from './sled';
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const blend = (a: number, b: number, k: number, h: number) => a + (b - a) * (1 - Math.exp(-k * h));
export function stepBodyVehicle(v: VehicleState, input: Input, dt: number, _time: number, q: EnvironmentQueries): void {
    if (v.motion.family !== 'ground-vehicle')
        throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
    if (dt <= 0)
        return;
    const c = v.spec.bodyPhysics!, state = v.motion.body!, e = v.spec.envelope;
    const parts: {
        body: ReturnType<typeof vehicleBody>;
        rotation?: Quaternion;
    }[] = [{ body: vehicleBody(v.spec) }];
    if (v.motion.tank) {
        const barrel = tankBarrel({ ...v, position: new Vector3(), rotation: new Quaternion() });
        parts.push({ body: { ...barrel.body, offset: new Vector3(...barrel.body.offset).applyQuaternion(barrel.rotation).add(barrel.position).toArray() }, rotation: barrel.rotation });
    }
    const rig = q.vehicleRig(v.spec.id, state, v.position, v.rotation, state.mass, e.halfExtents[0], e.halfExtents[2], e.offset[1] + e.halfExtents[1], c.centerOfMassHeight, parts, c.friction ?? .02, c.restitution ?? .08), body = rig.body;
    // Synchronise explicit reset/teleport once; substeps below only read the solver.
    const prior = body.translation();
    let relocated = new Vector3(prior.x, prior.y, prior.z).distanceToSquared(v.position) > .01;
    body.setTranslation(v.position, true);
    body.setRotation(v.rotation, true);
    body.setLinvel(v.velocity, true);
    body.setAngvel(state.angularVelocity, true);
    let h = dt, advanced = 0, old = v.position.clone(), oldYaw = v.yaw;
    const inertia = (mass: number) => new Vector3(mass * (4 * e.halfExtents[2] ** 2 + 1) / 12, mass * (4 * e.halfExtents[0] ** 2 + 4 * e.halfExtents[2] ** 2) / 12, mass * (4 * e.halfExtents[0] ** 2 + 1) / 12);
    rig.beforeStep = step => {
        h = step;
        old = v.position.clone();
        oldYaw = v.yaw;
        const s = v.spec, f = new Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw)), right = new Vector3(f.z, 0, -f.x);
        const speed = v.velocity.dot(f), water = q.waterAt(v.position);
        const normals = relocated ? [] : q.vehicleContactNormals(rig), contactNormal = normals.filter(n => n.y > .45).sort((a, b) => b.y - a.y)[0];
        const normal = contactNormal ? (q.support(v.position, 3, .15)?.normal ?? contactNormal) : undefined;
        v.grounded = !!normal;
        state.contactCount = normals.length;
        v.steering = blend(v.steering, input.steer, Math.abs(input.steer) > .01 ? s.steeringResponse : s.steeringReturn, h);
        const force = new Vector3(), torque = new Vector3();
        let immersion = 0, wet = 0, buoyancy = 0, mass = c.mass, pitch = 0, roll = 0, yawTarget = 0;
        if (c.water) {
            for (const x of [-e.halfExtents[0] * .65, e.halfExtents[0] * .65])
                for (const z of [-e.halfExtents[2] * .6, e.halfExtents[2] * .6]) {
                    const p = new Vector3(x, 0, z).applyQuaternion(v.rotation).add(v.position), w = q.waterAt(p);
                    if (w) {
                        wet++;
                        immersion += clamp((w.surface - p.y + c.water.bottom) / c.water.depth, 0, 1) / 4;
                    }
                }
            buoyancy = 9.81 * 1000 * c.water.displacement * immersion / mass;
            force.y += mass * (buoyancy - (c.water.damping) * immersion * v.velocity.y);
        }
        if (Math.abs(state.mass - mass) > 1e-6) {
            state.mass = mass;
            const j = inertia(mass);
            body.setAdditionalMassProperties(mass, { x: 0, y: c.centerOfMassHeight, z: 0 }, j, new Quaternion(), true);
        }
        const afloat = wet >= 2 && immersion > .08 && !v.grounded;
        v.submerged = !!water && v.position.y < water.surface - (.4);
        const dryGround = v.grounded && !(water && v.position.y < water.surface - .05);
        const engineActive = c.kind === 'tracks' ? dryGround : afloat;
        let driveForce = 0;
        if (state.powertrain && c.powertrain) {
            const pivot = c.kind === 'tracks' && Math.abs(input.forward) < .01 ? Math.abs(input.steer) : 0;
            const roadOmega = (speed + pivot * Math.abs(state.angularVelocity.y) * TANK_GEOMETRY.trackHalfSpacing) / (c.driveRadius!);
            stepPowertrain(state.powertrain, c.powertrain, { pedal: engineActive ? (pivot || input.forward) : 0, brake: input.brake, boost: input.boost, speed, wheelOmega: roadOmega, roadWheelOmega: roadOmega, grounded: engineActive, slipping: false, speedLimit: input.forward < 0 ? s.reverseSpeed : input.boost ? s.maxSpeed : s.speed }, h);
            driveForce = engineActive ? state.powertrain.axleTorque / c.driveRadius! : 0;
            if (pivot)
                driveForce = 0;
            v.throttle = state.powertrain.throttle * Math.sign(input.forward);
            state.effort = engineActive ? state.powertrain.throttle : 0;
        }
        else {
            state.effort = 0;
            v.throttle = 0;
        }
        const resist = (deceleration: number) => -Math.sign(speed) * Math.min(Math.abs(speed) / h, Math.max(0, deceleration)) * mass;
        let lateral = c.water ? immersion > 0 ? s.grip : v.grounded ? 7 : 0 : dryGround ? s.grip : 0;
        if (c.kind === 'unicycle') {
            const u = v.motion.unicycle!, resting = u.footDown > 0 || u.blockedSeconds > .25, brake = input.brake || input.forward * speed < -.08;
            if (dryGround) {
                driveForce = resting || brake ? resist(s.brakeDeceleration) : Math.abs(input.forward) > .01 ? mass * input.forward * s.accel : resist(s.coastDeceleration);
                state.effort = !resting && !brake ? Math.abs(input.forward) : 0;
                v.throttle = Math.sign(input.forward) * state.effort;
                yawTarget = -v.steering * s.steer * Math.min(Math.abs(speed) / 1.5, 1) * Math.sign(speed);
                roll = clamp(v.steering * speed * .025, -.14, .14);
            }
            state.cadence = v.grounded ? Math.abs(speed) / UNICYCLE_GEOMETRY.wheelRadius * 60 / (2 * Math.PI) : 0;
        }
        else if (c.kind === 'sled') {
            const k = v.motion.sled!, control=sledDriveControl(s,input,speed),brake=control.brake,
                push = dryGround && !brake && control.direction!==0 && Math.abs(speed) < control.limit;
            k.push = blend(k.push, push ? 1 : 0, 10, h);
            k.brake = blend(k.brake, brake ? 1 : 0, 10, h);
            k.steer = v.steering;
            if (k.push > .01)
                k.phase += h / .85;
            const pulse = push ? Math.max(0, Math.sin(k.phase * Math.PI * 2)) : 0;
            if (dryGround) {
                driveForce = mass * s.accel * pulse * control.direction + resist(s.coastDeceleration + s.dragQuadratic * speed * speed + (brake ? s.brakeDeceleration : 0) + Math.abs(v.steering) * .15);
                yawTarget = sledYawRate(s,v.steering,speed);
            }
            state.effort = pulse;
            state.cadence = push ? 60 / .85 : 0;
            v.throttle = pulse * control.direction;
        }
        else if (c.kind === 'tracks') {
            if (dryGround) {
                driveForce += resist(input.brake || state.powertrain!.directionBraking ? s.brakeDeceleration : 9.81 * c.powertrain!.rollingResistance + .5 * 1.225 * c.powertrain!.dragArea * speed * speed / mass);
                yawTarget = input.brake ? 0 : -v.steering * s.steer / (1 + Math.abs(speed) / 14);
            }
            const t = v.motion.tank!, previous = { ...t };
            t.turretYaw -= input.roll * TANK_CONTROLS.turretRadiansPerSecond * h;
            t.gunElevation = clamp(t.gunElevation - input.pitch * TANK_CONTROLS.gunRadiansPerSecond * h, TANK_CONTROLS.minimumGunRadians, TANK_CONTROLS.maximumGunRadians);
            const barrel = tankBarrel(v);
            t.articulationBlocked = q.overlaps(barrel.position, barrel.body, barrel.rotation);
            if (t.articulationBlocked) {
                t.turretYaw = previous.turretYaw;
                t.gunElevation = previous.gunElevation;
            }
            const local = tankBarrel({ ...v, position: new Vector3(), rotation: new Quaternion() });
            rig.colliders[1]!.setTranslationWrtParent(new Vector3(...local.body.offset).applyQuaternion(local.rotation).add(local.position));
            rig.colliders[1]!.setRotationWrtParent(local.rotation);
        }
        // Propulsion is limited, never velocity-clamped: collisions, falls and downhill
        // motion remain the shared rigid body's result.
        const limit = speed < 0 ? s.reverseSpeed : input.boost ? s.maxSpeed : s.speed;
        if (Math.abs(speed) > limit && Math.sign(driveForce) === Math.sign(speed))
            driveForce = 0;
        const tangent = f.clone(), side = right.clone();
        if (normal) {
            tangent.addScaledVector(normal, -tangent.dot(normal)).normalize();
            side.addScaledVector(normal, -side.dot(normal)).normalize();
        }
        force.addScaledVector(tangent, driveForce).addScaledVector(side, -mass * v.velocity.dot(side) * Math.min(lateral, 1 / h));
        const holding = input.brake || c.kind === 'sled' && input.forward < 0 || !!v.motion.unicycle && (v.motion.unicycle.footDown > 0 || Math.abs(input.forward) < .01);
        if (normal && holding && Math.abs(speed) < .15) {
            const gravityTangent = new Vector3(0, -9.81, 0).addScaledVector(normal, 9.81 * normal.y);
            force.addScaledVector(gravityTangent, -mass);
        }
        if (normal) {
            const n = q.support(v.position, 3, .15)?.normal ?? normal;
            pitch += Math.atan2(-(n.x * f.x + n.z * f.z), n.y);
            roll += c.kind === 'unicycle' ? unicycleSupportRoll(n, f) : c.kind === 'tracks' ? tankSupportRoll(n, f) : c.kind === 'sled' ? sledSupportRoll(n, f) : Math.atan2(n.x * f.z - n.z * f.x, n.y);
        }
        if (v.grounded || immersion > .05) {
            const desired = new Quaternion().setFromEuler(new Euler(-pitch, v.yaw, roll, 'YXZ')), error = desired.multiply(v.rotation.clone().invert());
            if (error.w < 0)
                error.set(-error.x, -error.y, -error.z, -error.w);
            const j = inertia(mass), omega = state.angularVelocity;
            // Force/torque balance assist, without writing rotation or angular velocity.
            const localError = new Vector3(error.x, error.y, error.z).multiplyScalar(2).applyQuaternion(v.rotation.clone().invert()), localOmega = omega.clone().applyQuaternion(v.rotation.clone().invert());
            const localTorque = new Vector3(j.x * (localError.x * 12 * s.pitchResponse - localOmega.x * 12), 0, j.z * (localError.z * 12 * s.rollResponse - localOmega.z * 12));
            torque.add(localTorque.applyQuaternion(v.rotation));
            torque.y += j.y * ((yawTarget - omega.y) * 6);
        }
        body.resetForces(true);
        body.resetTorques(true);
        body.addForce(force, true);
        body.addTorque(torque, true);
    };
    rig.afterStep = () => {
        const p = body.translation(), r = body.rotation(), velocity = body.linvel(), angular = body.angvel();
        v.position.set(p.x, p.y, p.z);
        // 单精度刚体姿态回写保持单位长度，避免视觉矩阵与相机碰撞缓存出现虚假缩放。
        v.rotation.set(r.x, r.y, r.z, r.w).normalize();
        v.velocity.set(velocity.x, velocity.y, velocity.z);
        state.angularVelocity.set(angular.x, angular.y, angular.z);
        const angles = new Euler().setFromQuaternion(v.rotation, 'YXZ');
        v.pitch = -angles.x;
        v.yaw = angles.y;
        v.roll = angles.z;
        v.speed = Math.hypot(velocity.x, velocity.z);
        const normals = q.vehicleContactNormals(rig);
        v.grounded = normals.some(n => n.y > .45);
        state.contactCount = normals.length;
        state.elapsed += h;
        if (v.motion.unicycle)
            finishUnicycleStep(v, old, input, h, q);
        advanced += h;
        relocated = false;
        if (v.motion.tank && v.grounded) {
            const yaw = Math.atan2(Math.sin(v.yaw - oldYaw), Math.cos(v.yaw - oldYaw)), travel = v.position.clone().sub(old).dot(new Vector3(Math.sin(oldYaw + yaw / 2), 0, Math.cos(oldYaw + yaw / 2)));
            v.motion.tank.leftTravel += travel - yaw * TANK_GEOMETRY.trackHalfSpacing;
            v.motion.tank.rightTravel += travel + yaw * TANK_GEOMETRY.trackHalfSpacing;
        }
    };
}
