import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWorld } from './engine.js';
import type { AssetInstance } from './engine-contracts.js';

type World = Awaited<ReturnType<typeof createWorld>>;

function box(x: number, y: number, z: number, width: number, height: number, depth: number) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));
  object.position.set(x, y, z);
  return object;
}

// Only animation loading is substituted. Support, motion, gravity, jumping and
// collision all run through the actual WorldEngine and Rapier world.
function animatedActor(world: World, id: string, height: number, z = 0, x = 0) {
  const object = new THREE.Group();
  object.position.set(x, height + .04, z);
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
  world.addCharacter({ id, object, asset, character: { walkSpeedMetersPerSecond: 1.65, snapToGroundDistanceMeters: 0 } });
  return asset;
}

async function fixture(height: number, hz = 60) {
  const camera = new THREE.PerspectiveCamera(50, 1, .05, 100);
  camera.position.set(0, 4, 6); camera.lookAt(0, 1, 0);
  const world = await createWorld({ scene: new THREE.Scene(), camera, navigation: false, fixedTimeStepSeconds: 1 / hz });
  world.addEntity({ id: 'ground', object: box(0, -.5, 0, 100, 1, 40), role: 'terrain' });
  world.addEntity({ id: 'platform', object: box(0, height - .5, 0, 4, 1, 4), role: 'terrain' });
  const asset = animatedActor(world, 'player', height);
  world.setControlledEntity('player'); world.step({}, hz / 2);
  expect(world.physics.state('player')!.isGrounded).toBe(true);
  return { world, asset };
}

function traverse(world: World, asset: AssetInstance, seconds: number, id = 'player') {
  const samples = [];
  for (let tick = 0; tick < Math.ceil(seconds / world.fixedTimeStepSeconds); tick++) {
    world.step({ moveXRatio: 1 });
    const state = world.physics.state(id)!;
    samples.push({ grounded: state.isGrounded, action: asset.currentActionId, position: [...state.positionMetersXYZ] });
  }
  return samples;
}

describe('locomotion animation on real Rapier support transitions', () => {
  it.each([30, 60, 120].flatMap(hz => [.1, .2, .3].map(height => ({ hz, height }))))(
    'keeps walking across a $height m step at $hz Hz while physical support is briefly absent',
    async ({ height, hz }) => {
      const { world, asset } = await fixture(height, hz);
      try {
        const samples = traverse(world, asset, 4);
        const airborne = samples.filter(sample => !sample.grounded);
        expect(airborne.length, 'fixture must exercise actual unsupported motion, not a snapped step').toBeGreaterThan(0);
        expect(samples.at(-1)!.position[0]).toBeGreaterThan(4);
        expect(samples.at(-1)!.grounded).toBe(true);
        expect(airborne.every(sample => sample.action === 'walk'), 'a small step must keep the walking animation').toBe(true);
        expect(samples.some(sample => sample.action === 'fall')).toBe(false);
        expect(world.snapshot().errors).toEqual([]);
      } finally { world.dispose(); }
    },
  );

  it.each([30, 60, 120])('enters fall within 0.4 seconds of leaving a 1.5 m ledge at %s Hz and retains it until landing', async hz => {
    const { world, asset } = await fixture(1.5, hz);
    try {
      const samples = traverse(world, asset, 4);
      const firstAirborne = samples.findIndex(sample => !sample.grounded);
      const firstFall = samples.findIndex((sample, index) => index >= firstAirborne && sample.action === 'fall');
      const landing = samples.findIndex((sample, index) => index > firstAirborne && sample.grounded);
      expect(firstAirborne).toBeGreaterThanOrEqual(0);
      expect(firstFall).toBeGreaterThanOrEqual(firstAirborne);
      expect((firstFall - firstAirborne + 1) / hz).toBeLessThanOrEqual(.4);
      expect(landing).toBeGreaterThan(firstFall);
      expect(samples.slice(firstFall, landing).every(sample => sample.action === 'fall')).toBe(true);
      expect(samples[landing]!.action).toBe('walk');
      expect(world.snapshot().errors).toEqual([]);
    } finally { world.dispose(); }
  });

  it('shows an intentional jump on the same tick that Rapier accepts the jump', async () => {
    const { world, asset } = await fixture(.2);
    try {
      world.step({ jumpPressed: true });
      expect(world.physics.state('player')!.isGrounded).toBe(false);
      expect(world.physics.state('player')!.velocityMetersPerSecondXYZ[1]).toBeGreaterThan(4);
      expect(asset.currentActionId).toBe('jump');
    } finally { world.dispose(); }
  });

  it('keeps a second character independent from a character already falling', async () => {
    const { world, asset: first } = await fixture(1.5);
    try {
      world.addEntity({ id: 'small-platform', object: box(0, -.3, 8, 4, 1, 4), role: 'terrain' });
      const second = animatedActor(world, 'second', .2, 8, 1.5);
      world.step({}, 30);
      let reachedFall = false;
      for (let tick = 0; tick < 180 && !reachedFall; tick++) {
        world.step({ moveXRatio: 1 });
        expect(second.currentActionId).toBe('idle');
        reachedFall = first.currentActionId === 'fall';
      }
      expect(reachedFall).toBe(true);
      expect(world.physics.state('player')!.isGrounded).toBe(false);
      world.setControlledEntity('second');
      const samples = traverse(world, second, 2, 'second');
      expect(samples.some(sample => !sample.grounded)).toBe(true);
      expect(samples.some(sample => sample.action === 'fall')).toBe(false);
      expect(samples.at(-1)!.grounded).toBe(true);
    } finally { world.dispose(); }
  });

  it('clears an in-flight transition on reset and reproduces the same small-step trajectory', async () => {
    const { world, asset } = await fixture(.3);
    try {
      const before = traverse(world, asset, 4);
      world.reset(); world.step({}, 30);
      // Stop in the unsupported interval so reset must discard transient state.
      for (let tick = 0; tick < 180; tick++) {
        world.step({ moveXRatio: 1 });
        if (!world.physics.state('player')!.isGrounded) break;
      }
      expect(world.physics.state('player')!.isGrounded).toBe(false);
      world.reset(); world.step({}, 30);
      const after = traverse(world, asset, 4);
      expect(after).toEqual(before);
      expect(after.some(sample => sample.action === 'fall')).toBe(false);
    } finally { world.dispose(); }
  });

  it('restarts support history after a teleport back onto the platform', async () => {
    const { world, asset } = await fixture(.3);
    try {
      const initial = traverse(world, asset, 4);
      expect(world.execute({ type: 'entity.set-position', entityId: 'player', positionMetersXYZ: [0, .34, 0] }).status).toBe('applied');
      world.step({}, 30);
      expect(world.physics.state('player')!.isGrounded).toBe(true);
      const replay = traverse(world, asset, 4);
      expect(initial.some(sample => !sample.grounded)).toBe(true);
      expect(replay.some(sample => !sample.grounded)).toBe(true);
      expect(replay.some(sample => sample.action === 'fall')).toBe(false);
      expect(replay.at(-1)!.grounded).toBe(true);
    } finally { world.dispose(); }
  });
});
