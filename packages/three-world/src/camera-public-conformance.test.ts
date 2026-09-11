import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWorld, type ThreeWorld } from './world';
import { createMountedFixture } from './humanoid-runtime/mounted-test-fixture';
import type { EnvironmentDefinition } from './humanoid-runtime/environment/types';

const map: EnvironmentDefinition = {
  id: 'camera-contract', name: 'Camera contract', description: 'Unobstructed floor',
  bounds: { min: [-50, -10, -50], max: [50, 50, 50] },
  boxes: [{ id: 'ground', position: [0, -.5, 0], size: [100, 1, 100] }],
  water: [], regions: [], spawns: [], playerSpawn: [0, .03, 0],
};

type SubjectFixture = { world: ThreeWorld; subjectId: string };
const obstruction = { id: 'occluder', position: [4, 8, 5], size: [20, 16, .4] } as const;
const fixtures: ReadonlyArray<{ name: string; create: (occluded?: boolean) => Promise<SubjectFixture> }> = [
  { name: 'authored nonhuman Mesh', async create(occluded) {
    const world = await createWorld({ camera: new THREE.PerspectiveCamera(), navigation: false });
    world.registerMovement({ id: 'hover', version: 1, description: 'Supported custom subject', initialState: null,
      update: ({ input }) => ({ state: null, applyGravity: false,
        velocityWorldMetersPerSecondXYZ: [(input.moveXRatio ?? 0) * 3, 0, (input.moveZRatio ?? 0) * 3] }) });
    const object = new THREE.Mesh(new THREE.BoxGeometry(.6, 1, .6), new THREE.MeshBasicMaterial());
    object.position.y = 1;
    world.addCharacter({ id: 'subject', object, body: { heightMeters: 1, radiusMeters: .3 }, movement: { kind: 'custom', movementId: 'hover' } });
    world.onDispose(() => { object.geometry.dispose(); object.material.dispose(); });
    if (occluded) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(...obstruction.size), new THREE.MeshBasicMaterial());
      wall.position.fromArray(obstruction.position);
      world.addEntity({ id: obstruction.id, object: wall, role: 'obstacle' });
      world.onDispose(() => { wall.geometry.dispose(); wall.material.dispose(); });
    }
    world.setControlledEntity('subject');
    return { world, subjectId: 'subject' };
  } },
  { name: 'Humanoid', async create(occluded) {
    const world = await createWorld({ camera: new THREE.PerspectiveCamera(), navigation: false, assetDefinitions: {},
      humanoid: { map: { ...map, boxes: [...map.boxes, ...(occluded ? [obstruction] : [])] }, character: { instanceId: 'subject', object: new THREE.Group() }, vehicles: [] } });
    return { world, subjectId: 'subject' };
  } },
  { name: 'mounted horse', async create(occluded) {
    const world = await createMountedFixture({ boxes: occluded ? [obstruction] : [] });
    if (occluded) expect(world.humanoid!.prepare('horse-1', { ...world.humanoid!.options.map.spawns[0]!, yaw: Math.PI / 2 })).toBe(true);
    expect(world.humanoid!.enter('horse-1')).toBe(true);
    return { world, subjectId: 'horse-1' };
  } },
];

function authoredOpening(world: ThreeWorld, variant = 0): THREE.PerspectiveCamera {
  world.useAuthoredCamera();
  const camera = world.camera as THREE.PerspectiveCamera;
  camera.position.set(9 + variant, 6, 13 - variant);
  camera.lookAt(-4, 3, -11);
  camera.rotateZ(.17);
  camera.fov = 41 + variant;
  camera.near = .12; camera.far = 700;
  camera.updateProjectionMatrix();
  return camera.clone();
}
function subjectPosition({ world, subjectId }: SubjectFixture): THREE.Vector3 {
  return new THREE.Vector3(...world.getEntityState(subjectId).positionWorldMetersXYZ);
}
function expectPose(world: ThreeWorld, reference: THREE.PerspectiveCamera, displacement = new THREE.Vector3()): void {
  expect(world.camera.position.distanceTo(reference.position.clone().add(displacement))).toBeLessThan(2e-5);
  expect(world.camera.quaternion.angleTo(reference.quaternion)).toBeLessThan(2e-7);
  expect((world.camera as THREE.PerspectiveCamera).fov).toBe(reference.fov);
  expect(world.camera.projectionMatrix.elements).toEqual(reference.projectionMatrix.elements);
}

describe.each(fixtures)('public camera subject contract: $name', ({ create }) => {
  it('keeps final Agent edits while pending and activates without a preset pose or FOV', async () => {
    const fixture = await create(), { world } = fixture;
    try {
      authoredOpening(world);
      world.setCameraFollow();
      // An Agent may finish the composition after registering the input handoff.
      const camera = world.camera as THREE.PerspectiveCamera;
      camera.position.x += 2; camera.rotateZ(-.08); camera.fov = 37; camera.updateProjectionMatrix();
      const opening = camera.clone();
      world.step({}, 30);
      expect(world.cameraMode).toBe('follow-pending');
      expectPose(world, opening);
      const before = subjectPosition(fixture);
      world.step({ moveXRatio: .3, moveZRatio: -1 });
      expect(world.cameraMode).toBe('follow');
      // Default translation damping may follow a fraction of the real movement.
      expect(world.camera.position.distanceTo(opening.position)).toBeLessThanOrEqual(subjectPosition(fixture).distanceTo(before) + 2e-5);
      expect(world.camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(2e-7);
      expect(camera.fov).toBe(37);
      expect(world.snapshot().errors).toEqual([]);
    } finally { world.dispose(); }
  });

  it('forwards follow settings, retains free orbit, and resets the authored baseline', async () => {
    const fixture = await create(), { world } = fixture;
    try {
      const opening = authoredOpening(world);
      world.setCameraFollow({ followHalfLifeSeconds: 0, transitionSeconds: 0 });
      world.step({}, 30);
      expectPose(world, opening);
      const start = subjectPosition(fixture);
      for (let tick = 0; tick < 20; tick++) {
        world.step({ moveXRatio: .3, moveZRatio: -1 });
        expectPose(world, opening, subjectPosition(fixture).sub(start));
      }
      expect(subjectPosition(fixture).distanceTo(start)).toBeGreaterThan(.01);
      world.step({}, 120);
      const beforeOrbit = world.camera.quaternion.clone();
      world.step({ cameraYawRatio: .6, cameraPitchRatio: .2 }, 12);
      const rotated = world.camera.quaternion.clone();
      expect(rotated.angleTo(beforeOrbit)).toBeGreaterThan(.05);
      world.step({}, 120);
      expect(world.camera.quaternion.angleTo(rotated)).toBeLessThan(2e-7);
      expect((world.camera as THREE.PerspectiveCamera).fov).toBe(opening.fov);
      await world.reset();
      expect(world.simulationTick).toBe(0);
      expect(world.cameraMode).toBe('follow-pending');
      expectPose(world, opening);
      expect(world.snapshot().errors).toEqual([]);
    } finally { world.dispose(); }
  });

  it('uses real obstruction safety and recovers the authored framing when the subject reaches open space', async () => {
    const fixture = await create(true), { world, subjectId } = fixture;
    try {
      const opening = authoredOpening(world), start = subjectPosition(fixture);
      world.setCameraFollow({ activateOnInput: false, followHalfLifeSeconds: 0, transitionSeconds: 0 });
      world.step({}, 30);
      expect(world.camera.position.distanceTo(opening.position)).toBeGreaterThan(2);
      expect(world.camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(2e-7);
      expect((world.camera as THREE.PerspectiveCamera).fov).toBe(opening.fov);
      const destination: [number, number, number] = [30, start.y, 0];
      if (world.humanoid) {
        if (world.humanoid.snapshot().mountedInstanceId) {
          // Ride sideways past the wall while remaining on the same subject.
          world.step({ moveZRatio: -1 }, 240);
        } else expect(world.humanoid.prepareCharacter(destination)).toBe(true);
      } else expect(await world.execute({ type: 'entity.set-position', entityId: subjectId, positionWorldMetersXYZ: destination })).toMatchObject({ status: 'applied' });
      world.step({}, 600);
      expectPose(world, opening, subjectPosition(fixture).sub(start));
      expect(world.snapshot().errors).toEqual([]);
    } finally { world.dispose(); }
  });
});

it('rebases ordinary follow on a newly controlled subject without moving the camera', async () => {
  const { world } = await fixtures[0]!.create();
  try {
    const other = new THREE.Group(); other.position.set(8, 1, -4);
    world.addCharacter({ id: 'other', object: other, body: { heightMeters: 1.2, radiusMeters: .3 }, movement: { kind: 'custom', movementId: 'hover' } });
    authoredOpening(world);
    world.setCameraFollow({ activateOnInput: false, followHalfLifeSeconds: 0, transitionSeconds: 0 });
    world.step({ cameraYawRatio: .3 }, 12);
    const before = (world.camera as THREE.PerspectiveCamera).clone();
    world.setControlledEntity('other');
    world.setCameraFollow({ activateOnInput: false, followHalfLifeSeconds: 0, transitionSeconds: 0 });
    world.step({});
    expectPose(world, before);
    const start = new THREE.Vector3(...world.getEntityState('other').positionWorldMetersXYZ);
    world.step({ moveXRatio: 1 }, 10);
    expectPose(world, before, new THREE.Vector3(...world.getEntityState('other').positionWorldMetersXYZ).sub(start));
  } finally { world.dispose(); }
});

it('translates the current framing to the subject when boarding and leaving with zero follow damping', async () => {
  const world = await createMountedFixture();
  try {
    authoredOpening(world);
    world.setCameraFollow({ activateOnInput: false, followHalfLifeSeconds: 0, transitionSeconds: 0 });
    world.step({}, 30);
    for (const transition of [() => world.humanoid!.enter('horse-1'), () => world.humanoid!.exit()]) {
      const before = (world.camera as THREE.PerspectiveCamera).clone();
      const previous=world.snapshot().camera;
      expect(transition()).toBe(true);
      const switched=world.snapshot().camera;
      const displacement=new THREE.Vector3(...switched.targetPositionWorldMetersXYZ!).sub(new THREE.Vector3(...previous.targetPositionWorldMetersXYZ!));
      expectPose(world, before, displacement);
      expect(switched.desiredArmDistanceMeters).toBe(previous.desiredArmDistanceMeters);
      expect(switched.desiredYawRadians).toBe(previous.desiredYawRadians);
      expect(switched.desiredPitchRadians).toBe(previous.desiredPitchRadians);
      const subjectId = world.humanoid!.snapshot().mountedInstanceId ?? 'person';
      const switchedSubject = { world, subjectId };
      const start = subjectPosition(switchedSubject);
      world.step({});
      expectPose(world, before, displacement.add(subjectPosition(switchedSubject).sub(start)));
      world.step({}, 60);
      expect(world.camera.quaternion.angleTo(before.quaternion)).toBeLessThan(2e-7);
      expect((world.camera as THREE.PerspectiveCamera).fov).toBe(before.fov);
    }
    expect(world.snapshot().errors).toEqual([]);
  } finally { world.dispose(); }
});

it('restores an ordinary subject opening follow in a world that also owns a full humanoid',async()=>{
 const world=await createWorld({camera:new THREE.PerspectiveCamera(),navigation:false,assetDefinitions:{},
  humanoid:{map,character:{instanceId:'person',object:new THREE.Group()},vehicles:[]}});
 try{
  const object=new THREE.Group();object.position.set(8,.03,0);
  world.addCharacter({id:'other',object,body:{heightMeters:1.2,radiusMeters:.3}});
  world.setControlledEntity('other');const opening=authoredOpening(world);
  world.setCameraFollow({activateOnInput:true,followHalfLifeSeconds:0});world.step({},0);
  world.step({moveZRatio:-1},20);expect(world.cameraMode).toBe('follow');
  await world.reset();expect(world.cameraMode).toBe('follow-pending');expectPose(world,opening);
  const before=world.getEntityState('other').positionWorldMetersXYZ;world.step({moveZRatio:-1});
  expect(world.cameraMode).toBe('follow');expectPose(world,opening,new THREE.Vector3(...world.getEntityState('other').positionWorldMetersXYZ).sub(new THREE.Vector3(...before)));
 }finally{world.dispose();}
});
