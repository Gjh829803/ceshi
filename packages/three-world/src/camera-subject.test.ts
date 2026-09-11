import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CameraCollisionRequest } from '@worldkit/camera-collision';
import { ThreeCameraRig } from './camera.js';
import type { CameraSubjectAdapter, CameraSubjectSample } from './camera-subject.js';
import type { Vec3 } from './engine-contracts.js';

const distance = (a: Vec3, b: Vec3) => new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
const clear = (from: Vec3, to: Vec3) => ({ distanceMeters: distance(from, to) });
const worldPose = (camera: THREE.Camera) => ({
  position: camera.getWorldPosition(new THREE.Vector3()), quaternion: camera.getWorldQuaternion(new THREE.Quaternion()),
});
function expectPose(camera: THREE.Camera, pose: ReturnType<typeof worldPose>): void {
  expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(pose.position)).toBeLessThan(1e-8);
  expect(camera.getWorldQuaternion(new THREE.Quaternion()).angleTo(pose.quaternion)).toBeLessThan(1e-7);
}

describe('camera subject adapter contract', () => {
  it.each([true, false])('translates parented framing to the new subject while retaining orbit and lens (pending=%s)', (pending) => {
    const parent = new THREE.Group(); parent.position.set(3, 8, -4); parent.rotation.set(.1, .7, -.2);
    const camera = new THREE.PerspectiveCamera(38, 1.8, .07, 3000); parent.add(camera);
    camera.position.set(5, 7, 13); camera.rotation.set(.25, -.3, .12); camera.zoom = 1.4;
    camera.setViewOffset(1920, 1080, 90, 40, 1600, 900); parent.updateMatrixWorld(true);
    const projection = camera.projectionMatrix.clone();
    let vehiclePosition: Vec3 = [4, 1, -3];
    const adapter: CameraSubjectAdapter = { sample: (id) => ({ id,
      positionWorldMetersXYZ: id === 'person' ? [0, 0, 0] : vehiclePosition,
      body: { heightMeters: id === 'person' ? 1.8 : 3, radiusMeters: .4 },
    }) };
    const rig = new ThreeCameraRig(camera, clear, adapter);
    rig.setFollow({ targetEntityId: 'person', activateOnInput: pending, followHalfLifeSeconds: 0 });
    rig.sealInitialState();
    if (!pending) { rig.updateDesired({ yawDeltaRadians: .35, pitchDeltaRadians: -.1, distanceDeltaMeters: 1 }, 0); rig.update(5); }
    const before = worldPose(camera);
    const orbit=rig.snapshot(),transfer=new THREE.Vector3(4,1+(3-1.8)*.65,-3);
    const transferred={position:before.position.clone().add(transfer),quaternion:before.quaternion};
    rig.retarget('vehicle'); expectPose(camera, pending?transferred:before);
    expect(rig.mode).toBe(pending ? 'follow-pending' : 'follow');
    rig.updateDesired({ activate: true }, 0); rig.update(0); expectPose(camera, transferred);
    expect(rig.snapshot().desiredArmDistanceMeters).toBeCloseTo(orbit.desiredArmDistanceMeters!,8);
    expect(rig.snapshot().desiredYawRadians).toBeCloseTo(orbit.desiredYawRadians!,8);
    expect(rig.snapshot().desiredPitchRadians).toBeCloseTo(orbit.desiredPitchRadians!,8);
    expect(rig.snapshot().targetPositionWorldMetersXYZ).toEqual([4, 2.95, -3]);
    const delta = new THREE.Vector3(1, .2, -2); vehiclePosition = new THREE.Vector3(...vehiclePosition).add(delta).toArray();
    rig.update(1 / 60); expectPose(camera, { position: transferred.position.clone().add(delta), quaternion: before.quaternion });
    expect(camera.fov).toBe(38); expect(camera.near).toBe(.07); expect(camera.far).toBe(3000);
    expect(camera.projectionMatrix.equals(projection)).toBe(true);
    rig.retarget('person'); rig.update(0); expectPose(camera, before);
    rig.reset(); expect(rig.targetEntityId).toBe('person'); expect(rig.mode).toBe(pending ? 'follow-pending' : 'follow');
    expect(camera.projectionMatrix.equals(projection)).toBe(true);
  });

  it('accepts a logical controlled target whose actual mounted subject changes', () => {
    const camera = new THREE.PerspectiveCamera(41); camera.position.set(4, 3, 9); camera.lookAt(-2, 2, 0);
    let sample: CameraSubjectSample = { id: 'person', positionWorldMetersXYZ: [0, 0, 0], body: { heightMeters: 1.8, radiusMeters: .35 } };
    const rig = new ThreeCameraRig(camera, clear, { sample: () => sample });
    rig.setFollow({ targetEntityId: 'controlled', framingMode: 'preserve-opening', activateOnInput: false, targetHeightMeters: 1.1 });
    rig.updateDesired({ yawDeltaRadians: .4 }, 0); rig.update(0); const before = worldPose(camera),orbit=rig.snapshot();
    sample = { id: 'horse', positionWorldMetersXYZ: [1, .5, 0], body: { heightMeters: 3, radiusMeters: .6 } };
    rig.retarget('controlled'); expectPose(camera, before); rig.update(0); expectPose(camera, before);
    expect(rig.snapshot().desiredArmDistanceMeters).toBe(orbit.desiredArmDistanceMeters);
    rig.update(5);expectPose(camera,{position:before.position.clone().add(new THREE.Vector3(1,.5,0)),quaternion:before.quaternion});
    expect(rig.snapshot().targetPositionWorldMetersXYZ).toEqual([1, 2.45, 0]);
  });

  it.each(['third-person','first-person'] as const)('retains user orbit and lens across target-framed subject changes: %s',perspective=>{
    const camera=new THREE.PerspectiveCamera(43);camera.position.set(0,3,8);camera.lookAt(0,1,0);
    const rig=new ThreeCameraRig(camera,clear,{sample:id=>({id,positionWorldMetersXYZ:id==='person'?[0,0,0]:[2,1,0]})});
    rig.setFollow({targetEntityId:'person',framingMode:'target',distanceMeters:8,pitchRadians:.3,activateOnInput:false,transitionSeconds:.3,
      view:{eyeOffsetLocalMetersXYZ:[0,1.6,0],defaultPerspective:perspective}});
    rig.sealInitialState();rig.updateDesired({yawDeltaRadians:.4,pitchDeltaRadians:.2,distanceDeltaMeters:1},0);rig.update(1);
    const state=rig.snapshot(),before=worldPose(camera);
    rig.retarget('horse');expectPose(camera,before);
    if(perspective==='third-person'){rig.update(0);expectPose(camera,before);}
    rig.update(1);
    expect(rig.snapshot().desiredYawRadians).toBeCloseTo(state.desiredYawRadians!,10);
    expect(rig.snapshot().desiredPitchRadians).toBeCloseTo(state.desiredPitchRadians!,10);
    expect(rig.snapshot().desiredArmDistanceMeters).toBe(state.desiredArmDistanceMeters);
    expect(camera.fov).toBe(43);
    rig.reset();expect(rig.targetEntityId).toBe('person');
  });

  it('rejects missing follow and invalid samples without replacing the current follow state', () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 3, 8);
    const rig = new ThreeCameraRig(camera, clear, { sample: (id) => ({ id, positionWorldMetersXYZ: id === 'invalid' ? [NaN, 0, 0] : [0, 0, 0] }) });
    expect(() => rig.retarget('person')).toThrow('WORLD_CAMERA_FOLLOW_REQUIRED');
    rig.setFollow({ targetEntityId: 'person' }); const before = rig.snapshot();
    expect(() => rig.retarget('invalid')).toThrow('WORLD_CAMERA_TARGET_INVALID'); expect(rig.snapshot()).toEqual(before);
    expect(() => rig.retarget('')).toThrow('WORLD_CAMERA_TARGET_REQUIRED'); expect(rig.snapshot()).toEqual(before);
  });

  it('uses the same subject collision policy for fixed and display poses without committing display state', () => {
    const camera = new THREE.PerspectiveCamera(44); camera.position.set(0, 1.3, 8); camera.lookAt(0, 1.3, 0);
    const requests: string[] = [];
    const adapter: CameraSubjectAdapter = {
      sample: (id) => ({ id, positionWorldMetersXYZ: [0, 0, 0] }),
      collisionRequest: (request, sample) => { requests.push(sample.id); return { ...request, canIgnoreArmObstruction: () => sample.id === 'partly-visible' }; },
    };
    const rig = new ThreeCameraRig(camera, (from, to) => distance(from, to) > 2 ? { distanceMeters: 2, colliderEntityId: 'pillar' } : clear(from, to), adapter);
    rig.setFollow({ targetEntityId: 'partly-visible', activateOnInput: false }); rig.update(1 / 60);
    expect(camera.position.z).toBeCloseTo(8); const before = rig.snapshot(); const pose = worldPose(camera);
    const request: CameraCollisionRequest = { target: [0, 1.3, 0], eye: [0, 1.3, 8], current: [0, 1.3, 8], radius: .2 };
    expect(rig.projectCollision(request).position[2]).toBe(8);
    expect(rig.projectCollision(request, { id: 'hidden', positionWorldMetersXYZ: [0, 0, 0] }).position[2]).toBeCloseTo(1.98);
    expect(requests).toEqual(['partly-visible', 'partly-visible', 'hidden']);
    expect(rig.snapshot()).toEqual(before); expectPose(camera, pose);
  });

  it('display projections cannot advance collision recovery relative to a rig with no display reads', () => {
    let blocked = true;
    const build = () => {
      const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 8); camera.lookAt(0, 1.3, 0);
      const rig = new ThreeCameraRig(camera, (from, to) => blocked && distance(from, to) > 2 ? { distanceMeters: 2, colliderEntityId: 'wall' } : clear(from, to),
        { sample: (id) => ({ id, positionWorldMetersXYZ: [0, 0, 0] }) });
      rig.setFollow({ targetEntityId: 'person', activateOnInput: false }); rig.update(1 / 60); return rig;
    };
    const withDisplay = build(), fixedOnly = build(); blocked = false;
    for (let tick = 0; tick < 30; tick++) {
      for (let frame = 0; frame < 5; frame++) withDisplay.projectCollision({ target: [0, 1.3, 0], eye: [0, 1.3, 8], current: withDisplay.snapshot().positionWorldMetersXYZ, radius: .2 });
      withDisplay.update(1 / 60); fixedOnly.update(1 / 60);
      expect(withDisplay.snapshot()).toEqual(fixedOnly.snapshot());
    }
  });
});
