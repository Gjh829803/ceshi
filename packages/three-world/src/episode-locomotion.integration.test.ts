import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWorld } from './engine.js';
import type { AssetInstance, Vec3 } from './engine-contracts.js';

type World = Awaited<ReturnType<typeof createWorld>>;

// Substitute animation loading only. Episode relocation, camera control,
// fixed stepping, support, gravity and jumping use the real engine and Rapier.
function animatedActor(world: World, id: string, position: Vec3, frontYawRadians = 0) {
  const object = new THREE.Group();
  object.position.set(...position);
  let action = 'idle';
  let timeSeconds = 0;
  const asset: AssetInstance = {
    object, clips: [], mixer: new THREE.AnimationMixer(object),
    actionIds: ['idle', 'walk', 'run', 'jump', 'fall'], isActionComplete: false,
    get currentActionId() { return action; },
    get timeSeconds() { return timeSeconds; },
    play(next) { if (next !== action) timeSeconds = 0; action = next; },
    update(dt) { timeSeconds += dt; },
    dispose() { this.mixer.stopAllAction(); },
  };
  world.addCharacter({ id, object, asset, frontYawRadians, character: {
    walkSpeedMetersPerSecond: 1.65, runSpeedMetersPerSecond: 2.4,
    jumpSpeedMetersPerSecond: 7, snapToGroundDistanceMeters: 0,
  } });
  return asset;
}

async function fixture(hz = 60, parentedCamera = false, followCamera = false) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, .05, 100);
  camera.position.set(3, 4, 6); camera.lookAt(0, 1, 0);
  const world = await createWorld({ scene, camera, navigation: false, fixedTimeStepSeconds: 1 / hz });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(80, 1, 40));
  floor.position.y = -.5;
  world.addEntity({ id: 'floor', object: floor, role: 'terrain' });
  const asset = animatedActor(world, 'player', [0, .04, 0], .4);
  asset.object.rotation.y = .3;
  if (parentedCamera) asset.object.attach(camera);
  world.setControlledEntity('player');
  if (followCamera) world.setCameraFollow({ targetEntityId: 'player' });
  world.step({}, hz / 2);
  expect(world.physics.state('player')!.isGrounded).toBe(true);
  return { world, asset, camera };
}

describe('Episode relocation and locomotion history with real Rapier', () => {
  it.each([30, 60, 120])('discards an accepted jump at a new Episode start at %s Hz', async hz => {
    const { world, asset } = await fixture(hz);
    try {
      world.step({ jump: true });
      expect(world.physics.state('player')!.isGrounded).toBe(false);
      expect(world.physics.state('player')!.velocityMetersPerSecondXYZ[1]).toBeGreaterThan(4);
      expect(asset.currentActionId).toBe('jump');
      const tick = world.simulationTick;
      world.prepareEpisodeStart([8, 3, 0], 0);
      expect(world.simulationTick).toBe(tick);
      expect(world.physics.state('player')!.isGrounded).toBe(false);
      world.step({});
      expect(world.physics.state('player')!.velocityMetersPerSecondXYZ[1]).toBeLessThan(0);
      expect(asset.currentActionId, 'a previous segment jump must not survive teleport').toBe('idle');
      world.step({}, Math.ceil(.46 * hz));
      expect(world.physics.state('player')!.isGrounded).toBe(false);
      expect(asset.currentActionId).toBe('fall');
      expect(world.snapshot().errors).toEqual([]);
    } finally { world.dispose(); }
  });

  it.each([30, 60, 120])('discards a latched fall before the next Episode opening at %s Hz', async hz => {
    const { world, asset } = await fixture(hz);
    try {
      world.prepareEpisodeStart([0, 8, 0], 0);
      world.step({}, Math.ceil(.5 * hz));
      expect(world.physics.state('player')!.isGrounded).toBe(false);
      expect(asset.currentActionId).toBe('fall');

      world.prepareEpisodeStart([8, .24, 0], 0);
      const airborneActions: string[] = [];
      for (let tick = 0; tick < hz / 2; tick++) {
        world.step({ moveXRatio: 1 });
        const state = world.physics.state('player')!;
        if (!state.isGrounded) airborneActions.push(asset.currentActionId!);
      }
      expect(airborneActions.length, 'the new opening must include actual unsupported ticks').toBeGreaterThan(0);
      expect(airborneActions.every(action => action === 'walk')).toBe(true);
      expect(world.physics.state('player')!.isGrounded).toBe(true);
      expect(asset.currentActionId).toBe('walk');
      expect(world.snapshot().errors).toEqual([]);
    } finally { world.dispose(); }
  });

  it('clears only the relocated actor history and preserves another actor already falling', async () => {
    const { world, asset } = await fixture();
    try {
      const other = animatedActor(world, 'other', [12, 8, 0]);
      world.prepareEpisodeStart([0, 8, 0], 0);
      world.step({}, 30);
      expect(asset.currentActionId).toBe('fall');
      expect(other.currentActionId).toBe('fall');
      const otherBefore = world.physics.state('other');

      world.prepareEpisodeStart([8, .24, 0], 0);
      expect(world.physics.state('other')).toEqual(otherBefore);
      world.step({ moveXRatio: 1 });
      expect(world.physics.state('player')!.isGrounded).toBe(false);
      expect(asset.currentActionId).toBe('walk');
      expect(world.physics.state('other')!.isGrounded).toBe(false);
      expect(other.currentActionId).toBe('fall');
    } finally { world.dispose(); }
  });

  it('uses run intent below the old absolute 3 m/s threshold after preparing an Episode start', async () => {
    const { world, asset } = await fixture();
    try {
      world.prepareEpisodeStart([8, .04, 0], 0);
      world.step({}, 30);
      world.step({ moveXRatio: 1, run: true }, 10);
      const velocity = world.physics.state('player')!.velocityMetersPerSecondXYZ;
      expect(Math.hypot(velocity[0], velocity[2])).toBeGreaterThan(2);
      expect(Math.hypot(velocity[0], velocity[2])).toBeLessThan(3);
      expect(asset.currentActionId).toBe('run');
      world.step({ moveXRatio: 1 });
      expect(asset.currentActionId).toBe('walk');
      world.step({});
      expect(asset.currentActionId).toBe('idle');
    } finally { world.dispose(); }
  });

  it.each([false, true].flatMap(parentedCamera => [false, true].map(followCamera => ({ parentedCamera, followCamera }))))(
    'preserves camera relocation, control basis and the fixed clock (parented=$parentedCamera, follow=$followCamera)',
    async ({ parentedCamera, followCamera }) => {
      const { world, asset, camera } = await fixture(60, parentedCamera, followCamera);
      try {
        const updates: { deltaSeconds: number; simulationTick: number }[] = [];
        world.onUpdate(({ deltaSeconds, simulationTick }) => updates.push({ deltaSeconds, simulationTick }));
        world.step({ jump: true });
        const before = world.snapshot();
        const actorBefore = asset.object.getWorldPosition(new THREE.Vector3());
        const eyeBefore = camera.getWorldPosition(new THREE.Vector3());
        const orientationBefore = camera.getWorldQuaternion(new THREE.Quaternion());
        const controlBefore = new THREE.Vector3(...world.controlForwardWorldXYZ());
        const frontBefore = new THREE.Vector3(0, 0, -1)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), .4)
          .applyQuaternion(asset.object.getWorldQuaternion(new THREE.Quaternion()));
        const previousYaw = Math.atan2(-frontBefore.x, -frontBefore.z);
        const yaw = -1.1;
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw - previousYaw);
        const start: Vec3 = [8, .24, -3];
        const count = updates.length;
        const animationTime = asset.timeSeconds;

        world.prepareEpisodeStart(start, yaw);
        expect(world.simulationTick).toBe(before.simulationTick);
        expect(world.snapshot().simulationSeconds).toBe(before.simulationSeconds);
        expect(updates).toHaveLength(count);
        expect(asset.timeSeconds).toBe(animationTime);
        expect(world.controlledEntityId).toBe('player');
        expect(asset.object.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...start))).toBeLessThan(1e-6);
        const eyeExpected = eyeBefore.sub(actorBefore).applyQuaternion(rotation).add(new THREE.Vector3(...start));
        expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(eyeExpected)).toBeLessThan(1e-6);
        expect(camera.getWorldQuaternion(new THREE.Quaternion()).angleTo(orientationBefore.premultiply(rotation))).toBeLessThan(1e-6);
        const controlExpected = controlBefore.applyQuaternion(rotation).normalize();
        expect(new THREE.Vector3(...world.controlForwardWorldXYZ()).distanceTo(controlExpected)).toBeLessThan(1e-6);
        const front = new THREE.Vector3(0, 0, -1)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), .4)
          .applyQuaternion(asset.object.getWorldQuaternion(new THREE.Quaternion()));
        expect(front.distanceTo(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)))).toBeLessThan(1e-6);

        expect(world.step({}, 0).simulationTick).toBe(before.simulationTick);
        world.step({ moveZRatio: -1 });
        const moved = asset.object.getWorldPosition(new THREE.Vector3()).sub(new THREE.Vector3(...start)); moved.y = 0;
        expect(moved.length()).toBeGreaterThan(.02);
        expect(moved.normalize().distanceTo(controlExpected)).toBeLessThan(1e-5);
        world.step({ moveZRatio: -1 }, 2);
        expect(updates.slice(count)).toEqual([1, 2, 3].map(offset => ({ deltaSeconds: 1 / 60, simulationTick: before.simulationTick + offset })));
        expect(asset.currentActionId).toBe('walk');
        expect(world.snapshot().errors).toEqual([]);
      } finally { world.dispose(); }
    },
  );
});
