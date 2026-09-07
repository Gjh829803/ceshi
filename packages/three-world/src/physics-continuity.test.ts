import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreePhysics } from './physics.js';
import type { CharacterDrive } from './engine-contracts.js';

const retained: ThreePhysics[] = [];
const dt = 1 / 60;
const speed = 1.65;
const box = (x: number, y: number, z: number, width: number, height: number, depth: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));
  mesh.position.set(x, y, z);
  return mesh;
};
async function fixture(shape: 'trimesh' | 'box' = 'trimesh', ledge = false) {
  const physics = await ThreePhysics.create();
  retained.push(physics);
  // The delivered case's unobstructed sidewalk reproduces the failure without
  // its decorative geometry, animations, input sampling or kinematic bus door.
  physics.addRigid('ground', ledge ? box(0, .025, -2, 5.9, .15, 8) : box(-1.15, .025, -24, 5.9, .15, 150), { kind: 'fixed', shape });
  const actor = new THREE.Group();
  actor.position.y = .13;
  physics.addCharacter('actor', actor, { maximumStepHeightMeters: .25 });
  return physics;
}
function tick(physics: ThreePhysics, drive: CharacterDrive = { velocityMetersPerSecondXZ: [0, -speed] }) {
  physics.step(dt, { actor: drive });
  return physics.state('actor')!;
}
afterEach(() => { for (const physics of retained.splice(0)) physics.dispose(); vi.restoreAllMocks(); });

describe('planar KCC contact continuity', () => {
  it.each(['trimesh', 'box'] as const)('keeps every unobstructed %s walking tick above 95% of requested speed', async shape => {
    const physics = await fixture(shape);
    const native = (physics as unknown as { world: { step(): void } }).world;
    const step = vi.spyOn(native, 'step');
    let minimumSpeed = Infinity;
    for (let i = 0; i < 3600; i++) {
      const state = tick(physics, { velocityMetersPerSecondXZ: [0, Math.floor(i / 1200) % 2 ? speed : -speed] });
      if (i < 16) continue;
      minimumSpeed = Math.min(minimumSpeed, Math.hypot(state.velocityMetersPerSecondXYZ[0], state.velocityMetersPerSecondXYZ[2]));
      expect(state.isGrounded).toBe(true);
      expect(state.positionMetersXYZ[1]).toBeGreaterThan(.11);
      expect(state.positionMetersXYZ[1]).toBeLessThan(.12);
    }
    expect(minimumSpeed).toBeGreaterThan(speed * .95);
    expect(step).toHaveBeenCalledTimes(3600);
  });

  it('still stops against a real wall after uninterrupted walking', async () => {
    const physics = await fixture();
    physics.addRigid('wall', box(0, 1.3, -6, 5, 2.4, .2), { kind: 'fixed' });
    let last = physics.state('actor')!;
    for (let i = 0; i < 1200; i++) {
      last = tick(physics);
      expect(last.positionMetersXYZ[2]).toBeGreaterThan(-5.536);
    }
    expect(last.positionMetersXYZ[2]).toBeLessThan(-5.53);
    expect(Math.abs(last.velocityMetersPerSecondXYZ[2])).toBeLessThan(.01);
    expect(last.collisionEntityIds).toContain('wall');
    expect(last.isGrounded).toBe(true);
  });

  it('preserves real ledge departure and does not grant a midair jump', async () => {
    const physics = await fixture('trimesh', true);
    let airborneTick = -1;
    for (let i = 0; i < 360; i++) {
      const state = tick(physics, { velocityMetersPerSecondXZ: [0, -speed], jumpPressed: i === 300 });
      if (!state.isGrounded && airborneTick < 0) airborneTick = i;
      if (i >= 300) expect(state.velocityMetersPerSecondXYZ[1]).toBeLessThan(0);
    }
    expect(airborneTick).toBeGreaterThan(220);
    expect(airborneTick).toBeLessThan(250);
    expect(physics.state('actor')!.positionMetersXYZ[1]).toBeLessThan(-10);
  });

  it('preserves commanded jump height and airborne duration', async () => {
    const physics = await fixture();
    let peak = 0, airborneTicks = 0;
    for (let i = 0; i < 360; i++) {
      const state = tick(physics, { velocityMetersPerSecondXZ: [0, -speed], jumpPressed: i === 120 });
      peak = Math.max(peak, state.positionMetersXYZ[1]);
      if (!state.isGrounded) airborneTicks++;
    }
    expect(peak).toBeCloseTo(1.4313, 3);
    expect(airborneTicks).toBe(61);
    expect(physics.state('actor')!.isGrounded).toBe(true);
  });

  it.each(['step', 'ramp'] as const)('retains the actual %s surface and support while traversing', async kind => {
    const physics = await fixture();
    const raised = kind === 'step' ? box(0, .20, -5, 4, .20, 3) : box(0, .4, -5, 4, .15, 4);
    if (kind === 'ramp') raised.rotation.x = .2;
    physics.addRigid(kind, raised, { kind: 'fixed' });
    let peak = 0;
    for (let i = 0; i < 1200; i++) {
      const state = tick(physics);
      peak = Math.max(peak, state.positionMetersXYZ[1]);
      expect(state.isGrounded).toBe(true);
    }
    expect(peak).toBeCloseTo(kind === 'step' ? .3157 : .88649, 3);
    expect(physics.state('actor')!.positionMetersXYZ[2]).toBeLessThan(-32.7);
  });

  it('does not bypass the climb limit on a real steep slope', async () => {
    const physics = await fixture();
    const ramp = box(0, .4, -5, 4, .15, 4);
    ramp.rotation.x = .9;
    physics.addRigid('ramp', ramp, { kind: 'fixed' });
    let peak = 0;
    for (let i = 0; i < 1200; i++) {
      const state = tick(physics);
      peak = Math.max(peak, state.positionMetersXYZ[1]);
      expect(state.positionMetersXYZ[2]).toBeGreaterThan(-4.55);
    }
    expect(peak).toBeLessThan(.2);
    expect(physics.state('actor')!.collisionEntityIds).toContain('ramp');
  });
});
