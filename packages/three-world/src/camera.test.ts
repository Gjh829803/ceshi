import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ThreeCameraRig } from './camera.js';
import { ThreePhysics } from './physics.js';
import type { Vec3 } from './engine-contracts.js';

const distance = (a: Vec3, b: Vec3) => new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
const unobstructed = (target: Vec3, eye: Vec3) => ({ distanceMeters: distance(target, eye) });
function fixture() {
  const camera = new THREE.PerspectiveCamera(47, 1.7, .05, 500);
  camera.position.set(3, 4, 8); camera.lookAt(0, 1.3, 0);
  const rig = new ThreeCameraRig(camera, unobstructed, () => [0, 0, 0]);
  return { camera, rig };
}

describe('ThreeCameraRig', () => {
  it('retains historical follow defaults without inheriting authored framing', () => {
    const camera = new THREE.PerspectiveCamera(39, 1.8, .1, 2000);
    camera.position.set(17, 28, 210); camera.lookAt(-60, 74, -120);
    const opening = camera.clone();
    const rig = new ThreeCameraRig(camera, unobstructed, () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero' }); rig.update(1);
    expect(camera.position.equals(opening.position)).toBe(true);
    expect(camera.quaternion.equals(opening.quaternion)).toBe(true);
    expect(rig.snapshot()).toMatchObject({ mode: 'follow-pending', desiredArmDistanceMeters: 4, desiredPitchRadians: .25, targetPositionWorldMetersXYZ: [0, 1.3, 0] });
    rig.updateDesired({ activate: true }, 1 / 60);
    for (let i = 0; i < 60; i++) rig.update(1 / 60);
    expect(rig.snapshot().actualArmDistanceMeters).toBeCloseTo(4, 8);
    expect(camera.fov).toBe(39);
  });

  it('restores collision recovery memory exactly when resetting a constrained rig', () => {
    let blocked = true;
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 16); camera.lookAt(0, 1.3, 0);
    const rig = new ThreeCameraRig(camera, (target, eye) => blocked && distance(target, eye) > 2
      ? { distanceMeters: 2, colliderEntityId: 'wall' } : unobstructed(target, eye), () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 16, pitchRadians: 0, activateOnInput: false, transitionSeconds: 0 });
    rig.update(1 / 60); rig.sealInitialState(); const initial = rig.snapshot();
    blocked = false; for (let i = 0; i < 60; i++) rig.update(1 / 60); const first = rig.snapshot();
    rig.reset(); expect(rig.snapshot()).toEqual(initial);
    for (let i = 0; i < 60; i++) rig.update(1 / 60);
    expect(rig.snapshot()).toEqual(first);
  });

  it('limits long-arm release recovery at 30, 60 and 120 Hz', () => {
    const run = (hz: number) => {
      let blocked = true;
      const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 16); camera.lookAt(0, 1.3, 0);
      const rig = new ThreeCameraRig(camera, (target, eye) => blocked && distance(target, eye) > 2
        ? { distanceMeters: 2, colliderEntityId: 'wall' } : unobstructed(target, eye), () => [0, 0, 0]);
      rig.setFollow({ targetEntityId: 'hero', distanceMeters: 16, pitchRadians: 0, activateOnInput: false, transitionSeconds: 0, maximumRecoveryMetersPerSecond: 2 });
      rig.update(1 / hz); blocked = false; let previous = rig.snapshot().actualArmDistanceMeters!;
      for (let i = 0; i < hz * 2; i++) {
        rig.update(1 / hz); const actual = rig.snapshot().actualArmDistanceMeters!;
        expect((actual - previous) * hz).toBeLessThanOrEqual(2 + 1e-8); previous = actual;
      }
      return previous;
    };
    expect(run(30)).toBeCloseTo(run(60), 8); expect(run(120)).toBeCloseTo(run(60), 8);
  });

  it('bounds a long camera arm recovery in meters per second', () => {
    let blocked = true;
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 16); camera.lookAt(0, 1.3, 0);
    const rig = new ThreeCameraRig(camera, (target, eye) => blocked && distance(target, eye) > 2
      ? { distanceMeters: 2, colliderEntityId: 'wall' } : unobstructed(target, eye), () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 16, pitchRadians: 0, activateOnInput: false, transitionSeconds: 0 });
    rig.update(1 / 60); blocked = false;
    let previous = rig.snapshot().actualArmDistanceMeters!;
    for (let i = 0; i < 120; i++) {
      rig.update(1 / 60); const actual = rig.snapshot().actualArmDistanceMeters!;
      expect((actual - previous) * 60).toBeLessThanOrEqual(3 + 1e-8); previous = actual;
    }
    expect(previous).toBeGreaterThan(6);
  });


  it('rotates throughout an authored handoff instead of snapping on the final tick', () => {
    const camera = new THREE.PerspectiveCamera(52, 1.8, .1, 650);
    camera.position.set(0, 3.35, 18); camera.lookAt(-1, 27, -85);
    const opening = camera.quaternion.clone(), previous = opening.clone();
    const rig = new ThreeCameraRig(camera, unobstructed, () => [0, .22, 0]);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 16, targetHeightMeters: 5, pitchRadians: -.05, transitionSeconds: 1.6 });
    rig.updateDesired({ activate: true }, 1 / 60);
    let maximumAngle = 0, midpointAngle = 0;
    for (let tick = 1; tick <= 100; tick++) {
      rig.update(1 / 60); maximumAngle = Math.max(maximumAngle, previous.angleTo(camera.quaternion));
      if (tick === 48) midpointAngle = opening.angleTo(camera.quaternion);
      previous.copy(camera.quaternion);
    }
    expect(midpointAngle).toBeGreaterThan(.01);
    expect(maximumAngle).toBeLessThan(.02);
  });

  it('preserves the exact authored opening until first input and transitions on that same camera', () => {
    const { camera, rig } = fixture(); const opening = camera.clone();
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 4, pitchRadians: .25, transitionSeconds: .4 });
    for (let tick = 0; tick < 30; tick++) { rig.updateDesired({}, 1 / 60); rig.update(1 / 60); }
    expect(rig.mode).toBe('follow-pending'); expect(camera.position.equals(opening.position)).toBe(true);
    expect(camera.quaternion.equals(opening.quaternion)).toBe(true);
    rig.updateDesired({ activate: true }, 1 / 60); rig.update(1 / 60);
    expect(rig.mode).toBe('follow'); expect(camera.position.distanceTo(opening.position)).toBeGreaterThan(0);
    expect(camera.position.distanceTo(opening.position)).toBeLessThan(.1);
    for (let tick = 1; tick < 24; tick++) rig.update(1 / 60);
    expect(distance(rig.snapshot().positionWorldMetersXYZ, [0, 1.3, 0])).toBeCloseTo(4, 8);
    expect(camera.fov).toBe(47); expect(rig.useAuthoredCamera()).toBe(camera);
  });

  it('updates the desired movement basis before changing the rendered pose', () => {
    const { camera, rig } = fixture(); const before = camera.quaternion.clone();
    rig.setFollow({ targetEntityId: 'hero', rotationSpeedRadiansPerSecond: 2 });
    const yaw = rig.desiredYawRadians;
    rig.updateDesired({ cameraYawRatio: 1, cameraPitchRatio: -.5, yawDeltaRadians: .1 }, .25);
    expect(rig.desiredYawRadians).toBeCloseTo(yaw + .6, 10);
    expect(camera.quaternion.equals(before)).toBe(true);
    expect(rig.snapshot().desiredPitchRadians).toBeCloseTo(0, 10);
  });

  it('does not consume orbit or zoom in authored mode and reacquires from the current pose', () => {
    const { camera, rig } = fixture();
    rig.setFollow({ targetEntityId: 'hero', activateOnInput: false, transitionSeconds: 0 }); rig.update(1 / 60);
    rig.useAuthoredCamera(); camera.position.set(-7, 6, 2); camera.lookAt(2, 1, 0); const authored = camera.clone();
    rig.updateDesired({ cameraYawRatio: 1, yawDeltaRadians: 2, distanceDeltaMeters: 10, activate: true }, 1);
    rig.update(1); expect(camera.position.equals(authored.position)).toBe(true); expect(camera.quaternion.equals(authored.quaternion)).toBe(true);
    rig.setFollow({ targetEntityId: 'hero', transitionSeconds: .5 });
    rig.updateDesired({ activate: true }, 1 / 60); rig.update(1 / 60);
    expect(camera.position.distanceTo(authored.position)).toBeLessThan(.1);
  });

  it('uses a real volume probe at a wall corner and retracts without a minimum unsafe arm', async () => {
    const physics = await ThreePhysics.create();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 4, .2)); wall.position.set(0, 1.3, 3);
    try {
      physics.addRigid('wall', wall, { kind: 'fixed' }); physics.step(1 / 60, {});
      const camera = new THREE.PerspectiveCamera(); camera.position.set(1.1, 1.3, 6); camera.lookAt(1.1, 1.3, 0);
      const target: Vec3 = [1.1, 0, 0];
      const rig = new ThreeCameraRig(camera, physics.castCameraArm.bind(physics), () => target);
      rig.setFollow({ targetEntityId: 'hero', distanceMeters: 6, pitchRadians: 0, collisionRadiusMeters: .2, activateOnInput: false, transitionSeconds: 0 });
      rig.update(1 / 60); const state = rig.snapshot();
      expect(state.obstructionEntityId).toBe('wall'); expect(state.actualArmDistanceMeters).toBeLessThan(3);
      const safe = physics.castCameraArm([1.1, 1.3, 0], state.positionWorldMetersXYZ, .2);
      expect(safe.distanceMeters).toBeCloseTo(state.actualArmDistanceMeters!, 5);
      physics.teleport('wall', [0, 1.3, 0]); physics.step(1 / 60, {}); rig.update(1 / 60);
      const escaped = rig.snapshot();
      expect(escaped.collisionPhase).toBe('emergency-inside'); expect(escaped.actualArmDistanceMeters).toBeGreaterThan(0);
      const escapeProbe = physics.castCameraArm(escaped.targetPositionWorldMetersXYZ!, escaped.positionWorldMetersXYZ, .2);
      expect(escapeProbe.startedOverlapping).not.toBe(true); expect(escapeProbe.distanceMeters).toBeCloseTo(escaped.actualArmDistanceMeters!, 5);
    } finally { physics.dispose(); wall.geometry.dispose(); }
  });

  it('prioritizes immediate safety over the first-frame transition', () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(5, 5, 8); camera.lookAt(0, 1.3, 0);
    const rig = new ThreeCameraRig(camera, (target, eye) => ({ distanceMeters: Math.min(1.2, distance(target, eye)), colliderEntityId: 'wall' }), () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero', transitionSeconds: 1 }); rig.updateDesired({ activate: true }, 1 / 60); rig.update(1 / 60);
    expect(rig.snapshot().actualArmDistanceMeters).toBeLessThanOrEqual(1.2);
    expect(rig.snapshot().positionWorldMetersXYZ.every(Number.isFinite)).toBe(true);
  });

  it('holds small obstruction-edge changes, then smoothly recovers after release', () => {
    let clearance = 2;
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 6); camera.lookAt(0, 1.3, 0);
    const rig = new ThreeCameraRig(camera, (target, eye) => {
      const requested = distance(target, eye);
      return clearance < requested ? { distanceMeters: clearance, colliderEntityId: 'wall' } : { distanceMeters: requested };
    }, () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 6, pitchRadians: 0, activateOnInput: false, transitionSeconds: 0, recoveryHalfLifeSeconds: .2 });
    rig.update(1 / 60); const blocked = rig.snapshot().actualArmDistanceMeters!;
    for (let i = 0; i < 90; i++) { clearance = 2 + (i % 2 ? .005 : 0); rig.update(1 / 60); }
    expect(rig.snapshot().actualArmDistanceMeters).toBeCloseTo(blocked, 8);
    clearance = Infinity; rig.update(1 / 60); const firstClear = rig.snapshot().actualArmDistanceMeters!;
    expect(firstClear).toBeLessThan(3);
    let previous = firstClear;
    for (let i = 0; i < 150; i++) { rig.update(1 / 60); const actual = rig.snapshot().actualArmDistanceMeters!; expect(actual).toBeGreaterThanOrEqual(previous); expect(actual - previous).toBeLessThan(.3); previous = actual; }
    expect(previous).toBeGreaterThan(5.98);
  });

  it('smooths zoom changes separately from an obstruction safety contraction', () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 6); camera.lookAt(0, 1.3, 0);
    const rig = new ThreeCameraRig(camera, unobstructed, () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 6, pitchRadians: 0, activateOnInput: false, transitionSeconds: 0 }); rig.update(1 / 60);
    rig.updateDesired({ distanceDeltaMeters: -3 }, 1 / 60); rig.update(1 / 60);
    expect(rig.snapshot().desiredArmDistanceMeters).toBe(3);
    expect(rig.snapshot().actualArmDistanceMeters).toBeGreaterThan(3); expect(rig.snapshot().actualArmDistanceMeters).toBeLessThan(6);
  });

  it('has the same fixed-tick result under 30, 60 and 120 Hz render schedules', () => {
    const run = (hz: number) => {
      const { rig } = fixture(); rig.setFollow({ targetEntityId: 'hero', transitionSeconds: .3 });
      let accumulator = 0;
      for (let frame = 0; frame < hz * 2; frame++) {
        accumulator += 1 / hz;
        while (accumulator >= 1 / 60 - 1e-12) { rig.updateDesired({ cameraYawRatio: .5, cameraPitchRatio: -.1 }, 1 / 60); rig.update(1 / 60); accumulator -= 1 / 60; }
      }
      return rig.snapshot();
    };
    expect(run(30)).toEqual(run(60)); expect(run(120)).toEqual(run(60));
  });

  it('keeps wall-release recovery consistent across elapsed-time step sizes', () => {
    const run = (hz: number) => {
      let blocked = true;
      const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 6); camera.lookAt(0, 1.3, 0);
      const rig = new ThreeCameraRig(camera, (target, eye) => blocked && distance(target, eye) > 2
        ? { distanceMeters: 2, colliderEntityId: 'wall' } : unobstructed(target, eye), () => [0, 0, 0]);
      rig.setFollow({ targetEntityId: 'hero', distanceMeters: 6, pitchRadians: 0, activateOnInput: false, transitionSeconds: 0, recoveryHalfLifeSeconds: .3 });
      rig.update(1 / hz); blocked = false;
      for (let frame = 0; frame < hz; frame++) rig.update(1 / hz);
      return rig.snapshot().actualArmDistanceMeters!;
    };
    expect(run(30)).toBeCloseTo(run(60), 10); expect(run(120)).toBeCloseTo(run(60), 10);
  });

  it('immediately handles a suddenly appearing wall without sharing state between rigs', () => {
    let clearance = Infinity;
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 6); camera.lookAt(0, 1.3, 0);
    const rig = new ThreeCameraRig(camera, (target, eye) => clearance < distance(target, eye)
      ? { distanceMeters: clearance, colliderEntityId: 'moving-wall' } : unobstructed(target, eye), () => [0, 0, 0]);
    const independent = fixture(); independent.rig.setFollow({ targetEntityId: 'hero' }); const independentBefore = independent.rig.snapshot();
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 6, pitchRadians: 0, activateOnInput: false, transitionSeconds: 0 }); rig.update(1 / 60);
    clearance = .1; rig.update(1 / 60);
    expect(rig.snapshot().actualArmDistanceMeters).toBeLessThanOrEqual(.1);
    expect(rig.snapshot().obstructionEntityId).toBe('moving-wall');
    expect(independent.rig.snapshot()).toEqual(independentBefore);
  });

  it('restores projection, camera parent, mode, options, and pending state on reset', () => {
    const { camera, rig } = fixture(); const parent = new THREE.Group(); parent.rotation.y = .4; parent.add(camera); parent.updateMatrixWorld(true);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 7, transitionSeconds: .4 }); rig.sealInitialState();
    const initial = rig.snapshot(); const matrix = camera.matrix.clone();
    rig.updateDesired({ activate: true, cameraYawRatio: 1, distanceDeltaMeters: -5 }, .2); rig.update(.2);
    rig.useAuthoredCamera(); camera.removeFromParent(); camera.fov = 80; camera.aspect = 2; camera.updateProjectionMatrix(); camera.position.set(19, 12, 3);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 2, activateOnInput: false }); rig.update(.1);
    rig.reset(); expect(camera.parent).toBe(parent); expect(camera.fov).toBe(47); expect(camera.aspect).toBe(1.7);
    expect(camera.matrix.equals(matrix)).toBe(true); expect(rig.snapshot()).toEqual(initial);
    rig.updateDesired({ activate: true }, 1 / 60); rig.update(1 / 60); const firstRun = rig.snapshot();
    rig.reset(); rig.updateDesired({ activate: true }, 1 / 60); rig.update(1 / 60); expect(rig.snapshot()).toEqual(firstRun);
  });

  it('supports manually managed camera matrices under a rotated parent', () => {
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, .1, 100); camera.position.set(0, 3, 8); camera.lookAt(0, 1, 0); camera.updateMatrix(); camera.matrixAutoUpdate = false;
    const parent = new THREE.Group(); parent.position.set(2, 0, -3); parent.rotation.y = .4; parent.add(camera); parent.updateMatrixWorld(true);
    const rig = new ThreeCameraRig(camera, unobstructed, () => [2, 0, -3]);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 5, pitchRadians: .2, activateOnInput: false, transitionSeconds: 0 }); rig.update(1 / 60);
    expect(distance(rig.snapshot().positionWorldMetersXYZ, [2, 1.3, -3])).toBeCloseTo(5, 8);
    expect(camera.getWorldDirection(new THREE.Vector3()).angleTo(new THREE.Vector3(2, 1.3, -3).sub(camera.getWorldPosition(new THREE.Vector3())))).toBeCloseTo(0, 8);
    expect(camera.matrixAutoUpdate).toBe(false); expect(camera.left).toBe(-4);
  });

  it('rejects invalid options and inputs without mutating the prior camera or rig state', () => {
    const { rig } = fixture(); rig.setFollow({ targetEntityId: 'hero' }); const before = rig.snapshot();
    expect(() => rig.setFollow({ targetEntityId: 'hero', collisionRadiusMeters: 0 })).toThrow('WORLD_CAMERA_OPTION_INVALID');
    expect(() => rig.setFollow({ targetEntityId: 'hero', maximumRecoveryMetersPerSecond: 0 })).toThrow('WORLD_CAMERA_OPTION_INVALID');
    expect(() => rig.updateDesired({ cameraYawRatio: 2, activate: true }, 1 / 60)).toThrow('WORLD_CAMERA_INPUT_INVALID');
    expect(() => rig.updateDesired({ activate: true }, -1)).toThrow('WORLD_CAMERA_TIMESTEP_INVALID');
    expect(rig.snapshot()).toEqual(before);
  });
});
