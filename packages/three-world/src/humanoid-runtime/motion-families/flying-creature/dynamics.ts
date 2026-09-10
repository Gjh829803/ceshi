import { Quaternion,Vector3 } from 'three';
import { vehicleBody,type EnvironmentQueries } from '../../environment/queries';
import type { Input,VehicleState } from '../../simulation';
import { readRigidBody } from '../shared/rigid-body';
import { motionForces,type MotionIntent } from './motion-forces';
export function stepBodyVehicle(v: VehicleState, input: Input, dt: number, time: number, q: EnvironmentQueries, intent?: MotionIntent): void {
    if(v.motion.family!=='flying-creature'||!["dragon"].includes(v.spec.mode))throw Error('MOTION_PHYSICS_OWNER_MISMATCH');
    if (dt <= 0)
        return;
    const c = v.spec.bodyPhysics!, state = v.motion.body!, e = v.spec.envelope;
    const parts: {
        body: ReturnType<typeof vehicleBody>;
        rotation?: Quaternion;
    }[] = [{ body: vehicleBody(v.spec) }];
    const rig = q.vehicleRig(v.spec.id, state, v.position, v.rotation, state.mass, e.halfExtents[0], e.halfExtents[2], e.offset[1] + e.halfExtents[1], c.centerOfMassHeight, parts, c.friction ?? .02, c.restitution ?? .08), body = rig.body;
    // Synchronise explicit reset/teleport once; substeps below only read the solver.
    body.setTranslation(v.position, true);
    body.setRotation(v.rotation, true);
    body.setLinvel(v.velocity, true);
    body.setAngvel(state.angularVelocity, true);
    let h = dt, advanced = 0, leadOffset: Vector3 | undefined, leadAngle = 0;
    rig.beforeStep = step => {
        h = step;
        {
            if (!intent)
                throw new Error('VEHICLE_MOTION_INTENT_MISSING');
            const result = motionForces(v, input, h, time - dt + advanced, q, state.mass, intent);
            if (v.motion.creature?.leadPosition) {
                const inverse = result.draftRotation.clone().invert();
                leadOffset = v.motion.creature.leadPosition.clone().sub(result.draftPosition).applyQuaternion(inverse);
                leadAngle = v.motion.creature.leadYaw! - result.draftYaw;
                const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), leadAngle);
                rig.colliders[1]!.setTranslationWrtParent(new Vector3(0, 1.65, 0).applyQuaternion(rotation).add(leadOffset));
                rig.colliders[1]!.setRotationWrtParent(rotation);
            }
            body.resetForces(true);
            body.resetTorques(true);
            body.addForce(result.force, true);
            body.addTorque(result.torque, true);
            state.effort = Math.abs(v.throttle);
            return;
        }
    };
    rig.afterStep = () => {
        // Normalize at the physics boundary so float32 roundoff cannot deform the
        // visual hierarchy or invalidate rigid camera geometry every fixed step.
        const { velocity } = readRigidBody(v, state, rig);
        v.speed = Math.hypot(velocity.x, velocity.z);
        if (v.motion.creature?.leadPosition && leadOffset) {
            v.motion.creature.leadPosition.copy(leadOffset).applyQuaternion(v.rotation).add(v.position);
            v.motion.creature.leadYaw = v.yaw + leadAngle;
        }
        const normals = q.vehicleContactNormals(rig);
        v.grounded = normals.some(n => n.y > .45);
        state.contactCount = normals.length;
        state.elapsed += h;
        advanced += h;
    };
}
