import { CameraCollisionSolver } from '@whitebox-world/camera-collision';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { createMountedFixture } from './mounted-test-fixture';
import { describe, expect, it, vi } from 'vitest';
import { createWorld } from '../world';
import { humanoidHost } from './host-access';
import { emptyInput } from './simulation';
import type { EnvironmentDefinition } from './environment/types';

const map: EnvironmentDefinition = {
  id: 'opening', name: 'Opening', description: '',
  bounds: { min: [-50, -10, -50], max: [50, 50, 50] },
  boxes: [{ id: 'floor', position: [0, -.5, 0], size: [100, 1, 100] }],
  water: [], regions: [], spawns: [], playerSpawn: [0, .03, 0],
};
async function fixture(boxes: EnvironmentDefinition['boxes'] = map.boxes) {
  const world = await createWorld({ camera: new PerspectiveCamera(), navigation: false, assetDefinitions: {},
    humanoid: { map: { ...map, boxes }, character: { instanceId: 'person', object: new Group() }, vehicles: [] } });
  world.useAuthoredCamera();
  const camera = world.camera as PerspectiveCamera;
  camera.position.set(0, 2.15, -5.4); camera.lookAt(0, -3.5, 90); camera.rotateZ(.09);
  camera.fov = 48; camera.near = .12; camera.far = 830; camera.updateProjectionMatrix();
  return world;
}

describe('Humanoid authored opening integration', () => {
  it('preserves target-framed orbit and zoom through actual boarding and exit',async()=>{
    const world=await createMountedFixture();
    try{
      world.camera.position.set(0,3,8);world.camera.lookAt(0,1,0);
      world.setCameraFollow({targetEntityId:'person',framingMode:'target',distanceMeters:8,pitchRadians:.25,activateOnInput:false,transitionSeconds:0});
      world.step({},0);const baseline=world.snapshot().camera;
      humanoidHost(world.humanoid!).advance({},1/60,{yawDeltaRadians:.45,pitchDeltaRadians:.3,distanceDeltaMeters:1});
      const orbit=world.snapshot().camera;
      const check=()=>{const state=world.snapshot().camera;expect(state.desiredYawRadians).toBeCloseTo(orbit.desiredYawRadians!,8);expect(state.desiredPitchRadians).toBeCloseTo(orbit.desiredPitchRadians!,8);expect(state.desiredArmDistanceMeters).toBe(orbit.desiredArmDistanceMeters);};
      expect(world.humanoid!.enter('horse-1')).toBe(true);world.step({},90);check();
      expect(world.snapshot().camera.subjectEntityId).toBe('horse-1');
      expect(world.humanoid!.exit()).toBe(true);world.step({},90);check();
      expect(world.snapshot().camera.subjectEntityId).toBe('person');
      await world.reset();const reset=world.snapshot().camera;
      expect(reset.desiredYawRadians).toBeCloseTo(baseline.desiredYawRadians!,8);
      expect(reset.desiredPitchRadians).toBe(baseline.desiredPitchRadians);
      expect(reset.desiredArmDistanceMeters).toBe(baseline.desiredArmDistanceMeters);
      expect(world.snapshot().humanoid!.mountedInstanceId).toBeNull();
    }finally{world.dispose();}
  });
  it('keeps the legacy first-key mode-zero handoff pending until real controls, including override input', async () => {
    const world = await fixture();
    try {
      const opening = world.camera.clone(), camera = world.camera as PerspectiveCamera;
      world.step({}, 0);
      world.humanoid!.setCameraMode(0);
      expect(world.cameraMode).toBe('follow-pending');
      expect(camera.position.toArray()).toEqual(opening.position.toArray());
      expect(camera.projectionMatrix.elements).toEqual(opening.projectionMatrix.elements);
      world.step({}, 20);
      expect(world.cameraMode).toBe('follow-pending');
      world.humanoid!.setInput({ ...emptyInput(), forward: 1 });
      world.step({});
      expect(world.cameraMode).toBe('follow');
      expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
      expect(camera.fov).toBe(48);
      expect(world.humanoid!.inspectControls().lastApplied?.source).toBe('setInput');
      await world.reset();
      expect(world.cameraMode).toBe('authored');
      expect(camera.position.toArray()).toEqual(opening.position.toArray());
      expect(camera.projectionMatrix.elements).toEqual(opening.projectionMatrix.elements);
    } finally { world.dispose(); }
  });

  it('shares fixed state with presentation without letting captures change the next simulation result', async () => {
    const world = await fixture(), reference = await fixture();
    try {
      for (const value of [world, reference]) { value.setCameraFollow({ followHalfLifeSeconds: 0 }); value.step({ moveZRatio: -1 }, 12); }
      const runtime = world.humanoid!, host = humanoidHost(runtime), tick = world.simulationTick;
      for(const value of [world,reference])value.camera.matrixAutoUpdate=false;
      const solve = vi.spyOn(CameraCollisionSolver.prototype, 'solve'), project = vi.spyOn(CameraCollisionSolver.prototype, 'project');
      try {
        for (const alpha of [.25, .25, .5, .75]) {
          const restore = host.present(alpha, tick); restore();
          expect(world.camera.getWorldPosition(new Vector3()).distanceTo(world.camera.position)).toBeLessThan(1e-9);
          expect(world.simulationTick).toBe(tick);
          expect(runtime.simulation.time).toBe(reference.humanoid!.simulation.time);
        }
        expect(project).toHaveBeenCalled();
        expect(solve).not.toHaveBeenCalled();
      } finally { solve.mockRestore(); project.mockRestore(); }
      for(const value of [world,reference]){(value.camera as PerspectiveCamera).aspect=1.7;(value.camera as PerspectiveCamera).updateProjectionMatrix();}
      world.step({ moveZRatio: -1 }); reference.step({ moveZRatio: -1 });
      expect((world.camera as PerspectiveCamera).aspect).toBe(1.7);
      expect(world.snapshot().camera).toEqual(reference.snapshot().camera);
      expect(world.getEntityState('person')).toEqual(reference.getEntityState('person'));
    } finally { world.dispose(); reference.dispose(); }
  });

  it('starts display interpolation from the final authored frame when the first tick activates follow', async () => {
    const world = await fixture();
    try {
      world.setCameraFollow({ followHalfLifeSeconds: 0 });
      const camera = world.camera as PerspectiveCamera;
      camera.position.set(8, 7, 11); camera.lookAt(-2, 3, -10); camera.rotateZ(.1);
      camera.fov = 37; camera.updateProjectionMatrix();
      const opening = camera.clone(), subject = new Vector3(...world.getEntityState('person').positionWorldMetersXYZ);
      world.step({ moveZRatio: -1 });
      const movement = new Vector3(...world.getEntityState('person').positionWorldMetersXYZ).sub(subject);
      const restore = humanoidHost(world.humanoid!).present(.5, world.simulationTick);
      try {
        expect(camera.position.distanceTo(opening.position)).toBeLessThanOrEqual(movement.length() + 1e-7);
        expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
        expect(camera.fov).toBe(37);
      } finally { restore(); }
      expect(world.humanoid!.inspectConfiguration().effective.camera.settingsApplied).toBe(false);
      world.humanoid!.setCameraMode(2);
      expect(world.humanoid!.inspectConfiguration().effective.camera.settingsApplied).toBe(true);
    } finally { world.dispose(); }
  });

  it('uses capsule visibility for an inherited opening behind a narrow obstruction', async () => {
    const world = await fixture([...map.boxes, { id: 'pole', position: [0, 1.2, -3], size: [.08, 2.4, .08] }]);
    try {
      const camera = world.camera as PerspectiveCamera;
      camera.position.set(0, 1.4, -6); camera.lookAt(0, 1.1, 0);
      const opening = camera.clone();
      world.setCameraFollow({ activateOnInput: false, followHalfLifeSeconds: 0 });
      world.step({});
      expect(camera.position.z).toBeCloseTo(opening.position.z, 5);
      expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
      expect(camera.fov).toBe(48);
    } finally { world.dispose(); }
  });

  it('translates inherited framing on a same-subject relocation and restores the sealed pending opening', async () => {
    const world = await fixture();
    try {
      const camera = world.camera as PerspectiveCamera, opening = camera.clone();
      world.setCameraFollow({ followHalfLifeSeconds: 0 }); world.step({ moveZRatio: -1 }, 12);
      const before = camera.clone(), oldPosition = new Vector3(...world.getEntityState('person').positionWorldMetersXYZ);
      expect(world.humanoid!.prepareCharacter([7, .03, 8])).toBe(true);
      const displacement = new Vector3(...world.getEntityState('person').positionWorldMetersXYZ).sub(oldPosition);
      expect(camera.position.distanceTo(before.position.clone().add(displacement))).toBeLessThan(1e-7);
      expect(camera.quaternion.angleTo(before.quaternion)).toBeLessThan(1e-7);
      await world.reset();
      expect(world.cameraMode).toBe('follow-pending');
      expect(camera.position.toArray()).toEqual(opening.position.toArray());
      expect(camera.projectionMatrix.elements).toEqual(opening.projectionMatrix.elements);
    } finally { world.dispose(); }
  });

  it('activates pending follow from pointer zoom input', async () => {
    const world = await fixture();
    try {
      world.setCameraFollow();
      expect(world.cameraMode).toBe('follow-pending');
      humanoidHost(world.humanoid!).advance({}, 1 / 60, { distanceDeltaMeters: -.4 });
      expect(world.cameraMode).toBe('follow');
      expect((world.camera as PerspectiveCamera).fov).toBe(48);
    } finally { world.dispose(); }
  });

  it('excludes the actual follow subject when its vehicle is not mounted', async () => {
    const world = await createMountedFixture();
    const geometry = new BoxGeometry(1.4, 3, 3), material = new MeshBasicMaterial();
    try {
      const mesh = new Mesh(geometry, material); mesh.position.y = 1.5;
      world.humanoid!.options.vehicles[0]!.object.add(mesh);
      world.setCameraFollow({ targetEntityId: 'horse-1',
        view: { eyeOffsetLocalMetersXYZ: [0, 1.3, 0], defaultPerspective: 'first-person' } });
      const subject = new Vector3(...world.getEntityState('horse-1').positionWorldMetersXYZ);
      expect(world.camera.position.distanceTo(subject.add(new Vector3(0, 1.3, 0)))).toBeLessThan(1e-7);
      expect(world.snapshot().camera.obstructionEntityId).toBeUndefined();
    } finally { world.dispose(); geometry.dispose(); material.dispose(); }
  });

  it('honors explicit eye and toggle options without letting profile shortcuts override them', async () => {
    const world = await fixture();
    try {
      const runtime = world.humanoid!;
      runtime.applyProfile({ view: { keyboardToggleEnabled: true } });
      world.setCameraFollow({ activateOnInput: false, view: { eyeOffsetLocalMetersXYZ: [0, 1.23, 0], keyboardToggleEnabled: false } });
      world.step({ cameraTogglePressed: true });
      expect(world.snapshot().camera.perspective).toBe('third-person');
      runtime.setCameraPerspective('first-person');
      expect(world.snapshot().camera.perspective).toBe('first-person');
      const subject = new Vector3(...world.getEntityState('person').positionWorldMetersXYZ);
      expect(world.camera.position.distanceTo(subject.add(new Vector3(0, 1.23, 0)))).toBeLessThan(1e-7);
      runtime.setCameraPerspective('third-person');
      world.humanoid!.setCameraMode(2);
      expect(world.humanoid!.snapshot().cameraMode).toBe(2);
      expect(world.snapshot().camera.framingMode).toBeUndefined();
    } finally { world.dispose(); }
  });
});

describe('Humanoid opening facing', () => {
  it.each([[0,2,6],[6,3,0],[-4,2,-6]])('faces away from the final camera without changing its framing (%j)', async (x,y,z) => {
    const world=await fixture();
    try {
      world.camera.position.set(x,y,z);world.camera.lookAt(0,1,0);
      const opening=world.camera.clone();world.setCameraFollow({activateOnInput:true});world.step({},0);
      const runtime=world.humanoid!,expected=runtime.simulation.controlledActor.player.position.clone().sub(opening.position).setY(0).normalize();
      expect(runtime.simulation.controlledActor.controller.facing.dot(expected)).toBeCloseTo(1,8);
      const yaw=runtime.simulation.controlledActor.player.yaw;
      const restore=humanoidHost(runtime).present(.5,world.simulationTick);restore();
      expect(runtime.simulation.controlledActor.player.yaw).toBe(yaw);
      expect(world.camera.position.toArray()).toEqual(opening.position.toArray());
      expect(world.camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
      world.step({moveXRatio:1},30);
      await world.reset();
      expect(runtime.simulation.controlledActor.player.yaw).toBe(yaw);
      expect(world.camera.position.toArray()).toEqual(opening.position.toArray());
      // Episode chooses a segment's facing independently; reset still restores the opening.
      humanoidHost(runtime).prepareEpisodeStart({positionWorldMetersXYZ:[2,.03,2],facingYawRadians:Math.PI/2});
      expect(runtime.simulation.controlledActor.controller.facing.x).toBeCloseTo(-1,8);
      await world.reset();expect(runtime.simulation.controlledActor.player.yaw).toBe(yaw);
    } finally {world.dispose();}
  });

  it('preserves an explicit public facing across camera edits and reset', async () => {
    const camera=new PerspectiveCamera();camera.position.set(0,2,6);camera.lookAt(0,1,0);
    const world=await createWorld({camera,navigation:false,assetDefinitions:{},humanoid:{map,vehicles:[],character:{instanceId:'person',object:new Group(),facingYawRadians:Math.PI/2}}});
    try {
      expect(world.humanoid!.simulation.controlledActor.controller.facing.x).toBeCloseTo(-1,8);
      camera.position.set(-6,3,2);world.useAuthoredCamera();world.step({},0);
      expect(world.humanoid!.simulation.controlledActor.controller.facing.x).toBeCloseTo(-1,8);
      world.step({moveZRatio:1},30);await world.reset();
      expect(world.humanoid!.simulation.controlledActor.controller.facing.x).toBeCloseTo(-1,8);
    } finally {world.dispose();}
  });

  it('keeps an explicitly prepared heading and handles a vertical camera deterministically', async () => {
    const world=await fixture();
    try {
      world.camera.position.set(0,10,0);world.camera.lookAt(0,0,0);world.step({},0);
      expect(Number.isFinite(world.humanoid!.simulation.controlledActor.player.yaw)).toBe(true);
    } finally {world.dispose();}
    const prepared=await fixture();
    try {
      prepared.humanoid!.prepareCharacter([0,.03,0],.7);prepared.step({},0);
      expect(prepared.humanoid!.simulation.controlledActor.player.yaw).toBeCloseTo(.7,8);
      await prepared.reset();expect(prepared.humanoid!.simulation.controlledActor.player.yaw).toBeCloseTo(.7,8);
    } finally {prepared.dispose();}
  });
});
