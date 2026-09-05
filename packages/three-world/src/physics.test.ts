import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreePhysics } from './physics.js';
import { extractWorldTriangles, geometrySignature, setEntityBoundary } from './geometry.js';
import type { CharacterDrive, PhysicsOptions } from './contracts.js';

const retained: ThreePhysics[] = [];
const dt = 1 / 60;
async function create(options?: PhysicsOptions) { const physics = await ThreePhysics.create(options); retained.push(physics); return physics; }
function box(x: number, y: number, z: number, width: number, height: number, depth: number) { const object = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth)); object.position.set(x, y, z); return object; }
function floor(width = 120, depth = 100) { return new THREE.Mesh(new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2)); }
function actor(x = 0, z = 0, y = .04) { const object = new THREE.Group(); object.position.set(x, y, z); return object; }
function ticks(physics: ThreePhysics, count: number, drives: Readonly<Record<string, CharacterDrive>> = {}) { for (let i = 0; i < count; i++) physics.step(dt, drives); }
afterEach(() => { for (const physics of retained.splice(0)) physics.dispose(); vi.restoreAllMocks(); });

describe('Three/Rapier character movement', () => {
  it('runs five simulated minutes on the actual coarse Three surface after exact collision subdivision', async () => {
    const physics = await create(); const ground = floor(); const player = actor();
    physics.addRigid('ground', ground, { kind: 'fixed' }); physics.addCharacter('player', player);
    // The authored surface is still exactly two triangles. Physics refines the same plane.
    expect(ground.geometry.index!.count).toBe(6); expect(physics.audit().triangleCount).toBeGreaterThan(2);
    ticks(physics, 20);
    let previous = physics.state('player')!.positionMetersXYZ[0], travelled = 0, stagnant = 0, maximumStagnant = 0;
    for (let i = 0; i < 18_000; i++) {
      physics.step(dt, { player: { velocityMetersPerSecondXZ: [Math.floor(i / 600) % 2 ? -4 : 4, 0] } });
      const state = physics.state('player')!, movement = Math.abs(state.positionMetersXYZ[0] - previous);
      travelled += movement; previous = state.positionMetersXYZ[0]; stagnant = movement < .0001 ? stagnant + 1 : 0; maximumStagnant = Math.max(maximumStagnant, stagnant);
      expect(state.positionMetersXYZ.every(Number.isFinite)).toBe(true);
      expect(state.positionMetersXYZ[1]).toBeGreaterThan(-.01);
      expect(state.positionMetersXYZ[1]).toBeLessThan(.05);
    }
    expect(travelled).toBeGreaterThan(1188); // >=99% of requested 1200m; the recorded coarse-mesh spike fails this.
    expect(maximumStagnant).toBeLessThanOrEqual(1);
    expect(physics.state('player')!.isGrounded).toBe(true);
    expect(player.position.toArray()).toEqual(physics.state('player')!.positionMetersXYZ);
  }, 30_000);

  it('climbs stairs and snaps down their real geometry', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addCharacter('player', actor());
    for (let i = 0; i < 4; i++) physics.addRigid(`up-${i}`, box(2 + i, .1 * (i + 1), 0, 1, .2 * (i + 1), 3), { kind: 'fixed' });
    for (let i = 0; i < 4; i++) physics.addRigid(`down-${i}`, box(6 + i, .1 * (4 - i), 0, 1, .2 * (4 - i), 3), { kind: 'fixed' });
    ticks(physics, 20); let highest = 0;
    for (let i = 0; i < 340; i++) { physics.step(dt, { player: { velocityMetersPerSecondXZ: [2, 0] } }); highest = Math.max(highest, physics.state('player')!.positionMetersXYZ[1]); }
    expect(highest).toBeGreaterThan(.78); expect(physics.state('player')!.positionMetersXYZ[0]).toBeGreaterThan(10); expect(physics.state('player')!.positionMetersXYZ[1]).toBeLessThan(.05);
  });

  it('walks uphill/downhill on a non-axis-aligned triangle ramp and reports real wall collisions', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addCharacter('player', actor());
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([2, 0, -2, 10, 2, -2, 2, 0, 2, 10, 2, 2], 3)); geometry.setIndex([0, 2, 1, 1, 2, 3]);
    physics.addRigid('ramp', new THREE.Mesh(geometry), { kind: 'fixed' }); ticks(physics, 20);
    ticks(physics, 260, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[1]).toBeGreaterThan(1.4);
    ticks(physics, 280, { player: { velocityMetersPerSecondXZ: [-2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[1]).toBeLessThan(.05);
    physics.teleport('player', [0, .04, 10]); physics.addRigid('wall', box(4, 1.5, 10, .2, 3, 20), { kind: 'fixed' }); ticks(physics, 20);
    ticks(physics, 180, { player: { velocityMetersPerSecondXZ: [2, 1] } }); const state = physics.state('player')!;
    expect(state.positionMetersXYZ[0]).toBeGreaterThan(3.4); expect(state.positionMetersXYZ[0]).toBeLessThan(3.6); expect(state.positionMetersXYZ[2]).toBeGreaterThan(12.8); expect(state.collisionEntityIds).toContain('wall');
  });

  it('owns gravity and accepts resolved jump press edges only when physically grounded', async () => {
    const physics = await create(); physics.addRigid('platform', box(0, -.5, 0, 4, 1, 4), { kind: 'fixed' }); physics.addCharacter('player', actor()); ticks(physics, 20);
    const jumping = { player: { velocityMetersPerSecondXZ: [0, 0] as const, jumpPressed: true } }; let airborneTicks = 0;
    physics.step(dt, jumping);
    expect(physics.state('player')!.velocityMetersPerSecondXYZ[1]).toBeGreaterThan(4);
    // A later edge in midair cannot create a second jump; no held-input latch belongs in Physics.
    for (let i = 0; i < 240; i++) { physics.step(dt, i === 20 ? jumping : {}); if (!physics.state('player')!.isGrounded) airborneTicks++; }
    expect(airborneTicks).toBeGreaterThan(20); expect(airborneTicks).toBeLessThan(100); expect(physics.state('player')!.isGrounded).toBe(true);
    physics.step(dt, jumping);
    expect(physics.state('player')!.velocityMetersPerSecondXYZ[1]).toBeGreaterThan(4);
    ticks(physics, 180); ticks(physics, 120, { player: { velocityMetersPerSecondXZ: [4, 0] } });
    expect(physics.state('player')!.isGrounded).toBe(false); expect(physics.state('player')!.positionMetersXYZ[1]).toBeLessThan(-2);
  });

  it('advances two actors and a dynamic body with one and only one world step per input tick', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addCharacter('left', actor(0, -2)); physics.addCharacter('right', actor(0, 2));
    const falling = box(20, 4, 0, 1, 1, 1); physics.addRigid('falling', falling, { kind: 'dynamic', shape: 'box' });
    const engineStep = vi.spyOn((physics as unknown as { world: { step(): void } }).world, 'step');
    physics.step(dt, { left: { velocityMetersPerSecondXZ: [2, 0] }, right: { velocityMetersPerSecondXZ: [2, 0] } });
    expect(engineStep).toHaveBeenCalledTimes(1); expect(physics.state('falling')!.velocityMetersPerSecondXYZ[1]).toBeCloseTo(-9.81 * dt, 4);
    expect(physics.state('left')!.positionMetersXYZ[0]).toBeCloseTo(physics.state('right')!.positionMetersXYZ[0], 6);
    ticks(physics, 20);
    ticks(physics, 120, { left: { velocityMetersPerSecondXZ: [2, 0] }, right: { velocityMetersPerSecondXZ: [2, 0] } });
    expect(engineStep).toHaveBeenCalledTimes(141); expect(physics.state('left')!.positionMetersXYZ[0]).toBeGreaterThan(3.8); expect(physics.state('right')!.positionMetersXYZ[0]).toBeGreaterThan(3.8);
  });
});

describe('Three hierarchy and physical lifecycle', () => {
  it('extracts world triangles from groups and mirrored InstancedMesh transforms without modifying source geometry', () => {
    const parent = new THREE.Group(); parent.position.set(5, 1, -3); parent.rotation.y = .4;
    const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 2, 3), new THREE.MeshBasicMaterial(), 2);
    const a = new THREE.Matrix4().compose(new THREE.Vector3(2, 0, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .3), new THREE.Vector3(-2, 1, 1));
    instances.setMatrixAt(0, a); instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(-3, 1, 2)); instances.instanceMatrix.needsUpdate = true; parent.add(instances);
    const before = Array.from(instances.geometry.getAttribute('position').array), geometry = extractWorldTriangles(parent, { subdivide: false });
    expect(geometry.triangleCount).toBe(24); expect(Array.from(instances.geometry.getAttribute('position').array)).toEqual(before);
    const bounds = new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(geometry.positions, 3)), expected = new THREE.Box3();
    // Box3.setFromObject conservatively transforms the union of instance AABBs;
    // use the actual eight box corners for the independent expected world bounds.
    for (const instance of [a, new THREE.Matrix4().makeTranslation(-3, 1, 2)]) for (const x of [-.5, .5]) for (const y of [-1, 1]) for (const z of [-1.5, 1.5]) expected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(parent.matrixWorld.clone().multiply(instance)));
    expect(bounds.min.distanceTo(expected.min)).toBeLessThan(1e-5); expect(bounds.max.distanceTo(expected.max)).toBeLessThan(1e-5);
    const first = new THREE.Vector3().fromArray(geometry.positions, geometry.indices[0]! * 3), second = new THREE.Vector3().fromArray(geometry.positions, geometry.indices[1]! * 3), third = new THREE.Vector3().fromArray(geometry.positions, geometry.indices[2]! * 3);
    const normal = second.clone().sub(first).cross(third.clone().sub(first)), centroid = first.clone().add(second).add(third).multiplyScalar(1 / 3), center = new THREE.Vector3().setFromMatrixPosition(parent.matrixWorld.clone().multiply(a));
    expect(normal.dot(centroid.sub(center))).toBeGreaterThan(0);
  });

  it('keeps hide, move, resize and removal synchronized with actual collision', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addCharacter('player', actor()); const wall = box(4, 1.5, 0, .2, 3, 20); physics.addRigid('wall', wall, { kind: 'fixed' }); ticks(physics, 20);
    ticks(physics, 180, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(3.6);
    physics.setEnabled('wall', false); expect(wall.visible).toBe(false); ticks(physics, 100, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeGreaterThan(6);
    physics.teleport('wall', [10, 1.5, 0]); wall.scale.set(4, 1, 1); physics.refresh('wall'); physics.setEnabled('wall', true);
    ticks(physics, 160, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(9.3); expect(physics.state('wall')!.positionMetersXYZ).toEqual([10, 1.5, 0]);
    physics.remove('wall'); ticks(physics, 80, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeGreaterThan(11); expect(physics.state('wall')).toBeUndefined();
    expect(wall.geometry.getAttribute('position').count).toBe(24); // Removing physics never disposes author-owned/shared Three resources.
  });

  it('synchronizes a moved kinematic body and a moved child inside a fixed group', async () => {
    const physics = await create(); const platform = box(0, -.5, 0, 8, 1, 8); physics.addRigid('platform', platform, { kind: 'kinematic' }); physics.addCharacter('player', actor()); ticks(physics, 20);
    platform.position.x = 5; physics.step(dt, {}); expect(physics.state('platform')!.positionMetersXYZ[0]).toBeCloseTo(5, 5);
    platform.position.x = -20; physics.step(dt, {});
    const group = new THREE.Group(), wall = box(4, 1, 0, 1, 2, 4); group.add(wall); physics.addRigid('group', group, { kind: 'fixed' });
    const originalTriangles = physics.audit().entities.find(row => row.id === 'group')!.triangleCount;
    wall.position.x = 12; physics.step(dt, {}); expect(physics.audit().entities.find(row => row.id === 'group')!.triangleCount).toBe(originalTriangles);
    physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.teleport('player', [8, .04, 0]); ticks(physics, 20); ticks(physics, 150, { player: { velocityMetersPerSecondXZ: [2, 0] } });
    expect(physics.state('player')!.positionMetersXYZ[0]).toBeGreaterThan(11); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(11.3);
  });

  it('keeps a supported character on a continuously moving kinematic platform', async () => {
    const physics = await create(); const platform = box(0, -.5, 0, 4, 1, 4); physics.addRigid('platform', platform, { kind: 'kinematic' }); physics.addCharacter('player', actor()); ticks(physics, 20);
    for (let i = 0; i < 180; i++) { platform.position.x += .01; physics.step(dt, {}); }
    const state = physics.state('player')!;
    expect(state.isGrounded).toBe(true); expect(state.positionMetersXYZ[1]).toBeGreaterThan(-.03); expect(state.positionMetersXYZ[1]).toBeLessThan(.05);
    expect(state.positionMetersXYZ[0]).toBeGreaterThan(1.5); expect(state.positionMetersXYZ[0]).toBeLessThan(2.1);
  });

  it('updates InstancedMesh collider placements when the instance buffer changes', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addCharacter('player', actor());
    const obstacles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 3, 4), new THREE.MeshBasicMaterial(), 2);
    obstacles.setMatrixAt(0, new THREE.Matrix4().makeTranslation(4, 1.5, 0)); obstacles.setMatrixAt(1, new THREE.Matrix4().makeTranslation(8, 1.5, 8)); obstacles.instanceMatrix.needsUpdate = true;
    physics.addRigid('instances', obstacles, { kind: 'fixed' }); ticks(physics, 20); ticks(physics, 180, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(3.2);
    obstacles.setMatrixAt(0, new THREE.Matrix4().makeTranslation(10, 1.5, 0)); obstacles.instanceMatrix.needsUpdate = true;
    ticks(physics, 240, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeGreaterThan(9); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(9.2);
    expect(physics.audit().colliderCount).toBe(4);
  });

  it('supports dynamic impulses and restores registered poses, shapes, visibility and velocities on reset', async () => {
    const physics = await create(); const ground = floor(); physics.addRigid('ground', ground, { kind: 'fixed' }); const player = actor(); physics.addCharacter('player', player); const dynamic = box(5, 4, 0, 1, 1, 1); physics.addRigid('crate', dynamic, { kind: 'dynamic', shape: 'box', massKilograms: 2 }); ticks(physics, 150);
    expect(dynamic.position.y).toBeGreaterThan(.45); expect(dynamic.position.y).toBeLessThan(.6);
    physics.applyImpulse('crate', [2, 4, 0]); expect(physics.state('crate')!.velocityMetersPerSecondXYZ[0]).toBeCloseTo(1, 4); ticks(physics, 30, { player: { velocityMetersPerSecondXZ: [2, 0], jumpPressed: true } });
    physics.setEnabled('crate', false); player.scale.setScalar(2); physics.refresh('player'); physics.reset();
    expect(physics.state('crate')!.positionMetersXYZ).toEqual([5, 4, 0]); expect(physics.state('crate')!.velocityMetersPerSecondXYZ).toEqual([0, 0, 0]); expect(dynamic.visible).toBe(true);
    expect(player.scale.toArray()).toEqual([1, 1, 1]); expect(player.position.y).toBeCloseTo(.04, 6); ticks(physics, 20); expect(physics.state('player')!.isGrounded).toBe(true);
    const first = physics.state('player')!.positionMetersXYZ; ticks(physics, 30, { player: { velocityMetersPerSecondXZ: [2, 0] } }); const moved = physics.state('player')!.positionMetersXYZ;
    physics.reset(); ticks(physics, 20); expect(physics.state('player')!.positionMetersXYZ[0]).toBeCloseTo(first[0], 5); ticks(physics, 30, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeCloseTo(moved[0], 4);
  });

  it('rejects invalid batches, shape refreshes and budgets without mutating live physics', async () => {
    const physics = await create({ maximumColliderCount: 2 }); physics.addRigid('ground', floor(), { kind: 'fixed' }); const player = actor(); physics.addCharacter('player', player); ticks(physics, 20);
    const before = physics.state('player'), audit = physics.audit();
    expect(() => physics.step(dt, { player: { velocityMetersPerSecondXZ: [2, 0] }, missing: { velocityMetersPerSecondXZ: [0, 0] } })).toThrow(/PHYSICS_ENTITY_UNKNOWN/);
    expect(() => physics.step(dt, { player: { velocityMetersPerSecondXZ: [NaN, 0] } })).toThrow(/PHYSICS_DRIVE_INVALID/);
    expect(() => physics.addRigid('extra', box(4, 1, 0, 1, 2, 2), { kind: 'fixed' })).toThrow(/PHYSICS_COLLIDER_BUDGET_EXCEEDED/);
    player.scale.set(0, 1, 1); expect(() => physics.refresh('player')).toThrow(/PHYSICS_TRANSFORM_INVALID/); player.scale.set(1, 1, 1); // ThreeWorld rolls back its tentative authored edit.
    expect(() => physics.teleport('player', [Infinity, 0, 0])).toThrow(/PHYSICS_VECTOR_INVALID/);
    expect(() => physics.applyImpulse('player', [1, 0, 0])).toThrow(/PHYSICS_IMPULSE_REQUIRES_DYNAMIC/);
    expect(physics.state('player')).toEqual(before); expect(physics.audit()).toEqual(audit);
  });

  it('cleans partial provider allocations before a failed replacement can affect the original body', async () => {
    const physics = await create(); const object = new THREE.Group(); object.add(box(1, 1, 0, 1, 2, 2), box(-1, 1, 0, 1, 2, 2)); physics.addRigid('compound', object, { kind: 'fixed' });
    const world = (physics as unknown as { world: { createCollider(...args: any[]): unknown; colliders: { len(): number }; bodies: { len(): number } } }).world;
    const createCollider = world.createCollider.bind(world), before = physics.audit(), bodyCount = world.bodies.len(), colliderCount = world.colliders.len(); let creations = 0;
    vi.spyOn(world, 'createCollider').mockImplementation((...args) => { if (++creations === 2) throw new Error('fixture provider allocation failure'); return createCollider(...args); });
    object.scale.setScalar(2); expect(() => physics.refresh('compound')).toThrow('fixture provider allocation failure'); object.scale.setScalar(1);
    expect(world.bodies.len()).toBe(bodyCount); expect(world.colliders.len()).toBe(colliderCount); expect(physics.audit()).toEqual(before); expect(physics.state('compound')!.positionMetersXYZ).toEqual([0, 0, 0]);
  });

  it('preserves author-managed matrices through teleport and reset', async () => {
    const physics = await create(); const object = box(0, 0, 0, 1, 2, 1); object.matrixAutoUpdate = false; object.matrix.makeScale(2, 1, 1).setPosition(new THREE.Vector3(3, 1, 0));
    const initial = object.matrix.clone(); physics.addRigid('matrix-object', object, { kind: 'fixed', massKilograms: 0 }); expect(physics.state('matrix-object')!.positionMetersXYZ).toEqual([3, 1, 0]);
    physics.teleport('matrix-object', [8, 1, 0]); expect(object.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([8, 1, 0]); expect(object.matrix.elements[0]).toBe(2);
    physics.reset(); expect(object.matrix.equals(initial)).toBe(true); expect(object.matrixAutoUpdate).toBe(false); expect(physics.state('matrix-object')!.positionMetersXYZ).toEqual([3, 1, 0]);
  });

  it('allows a registered hierarchy to hide all its mesh children and later restores their collision', async () => {
    const physics = await create(); const group = new THREE.Group(), child = box(4, 1, 0, 1, 2, 3); group.add(child); physics.addRigid('group', group, { kind: 'fixed' });
    child.visible = false;
    expect(() => physics.step(dt, {})).not.toThrow(); expect(physics.audit().colliderCount).toBe(0); expect(physics.state('group')).toBeDefined();
    expect(extractWorldTriangles(group).triangleCount).toBe(0);
    child.visible = true; physics.step(dt, {}); expect(physics.audit().colliderCount).toBe(1);
  });

  it('uses raw visible as the sole visibility authority after an SDK hide command', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); const wall = box(4, 1.5, 0, .2, 3, 20); physics.addRigid('wall', wall, { kind: 'fixed' }); physics.addCharacter('player', actor()); ticks(physics, 20);
    physics.setEnabled('wall', false); wall.visible = true;
    ticks(physics, 180, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(3.6);
  });

  it('validates all descendants before atomically publishing a refresh batch', async () => {
    const physics = await create(); const parent = new THREE.Group(), rigid = box(3, 1, 0, 1, 2, 2), player = actor(); parent.add(rigid, player);
    physics.addRigid('rigid', rigid, { kind: 'fixed' }); physics.addCharacter('player', player);
    const before = [physics.state('rigid'), physics.state('player')], beforeAudit = physics.audit();
    parent.scale.set(4, 1, 4); expect(() => physics.refreshMany(['rigid', 'player'])).toThrow(/PHYSICS_CHARACTER_SCALE_INVALID/);
    expect([physics.state('rigid'), physics.state('player')]).toEqual(before); expect(physics.audit()).toEqual(beforeAudit);
    parent.scale.setScalar(2); physics.refreshMany(['rigid', 'player']); expect(physics.state('rigid')!.positionMetersXYZ).toEqual([6, 2, 0]); expect(physics.state('player')!.positionMetersXYZ[1]).toBeCloseTo(.08, 6);
  });

  it('rolls back allocations across a whole refresh batch when a later body cannot be constructed', async () => {
    const physics = await create(); const first = box(1, 1, 0, 1, 2, 2), second = box(4, 1, 0, 1, 2, 2); physics.addRigid('first', first, { kind: 'fixed' }); physics.addRigid('second', second, { kind: 'fixed' });
    const world = (physics as unknown as { world: { createCollider(...args: any[]): unknown; colliders: { len(): number }; bodies: { len(): number } } }).world;
    const createCollider = world.createCollider.bind(world), before = physics.audit(), bodyCount = world.bodies.len(), colliderCount = world.colliders.len(); let calls = 0;
    vi.spyOn(world, 'createCollider').mockImplementation((...args) => { if (++calls === 2) throw new Error('later allocation rejected'); return createCollider(...args); });
    first.position.x = 11; second.position.x = 14;
    expect(() => physics.refreshMany(['first', 'second'])).toThrow('later allocation rejected'); expect(physics.audit()).toEqual(before);
    expect(physics.state('first')!.positionMetersXYZ).toEqual([1, 1, 0]); expect(physics.state('second')!.positionMetersXYZ).toEqual([4, 1, 0]); expect(world.bodies.len()).toBe(bodyCount); expect(world.colliders.len()).toBe(colliderCount);
  });

  it('refreshes edited InterleavedBufferAttribute positions when their shared buffer version changes', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addCharacter('player', actor());
    const wall = box(4, 1.5, 0, 1, 3, 4), original = wall.geometry.getAttribute('position'); const data = new Float32Array(original.count * 4);
    for (let i = 0; i < original.count; i++) { data[i * 4] = original.getX(i); data[i * 4 + 1] = original.getY(i); data[i * 4 + 2] = original.getZ(i); data[i * 4 + 3] = 123; }
    const position = new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(data, 4), 3, 0); wall.geometry.setAttribute('position', position); physics.addRigid('wall', wall, { kind: 'fixed' }); ticks(physics, 20);
    ticks(physics, 180, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(3.2);
    for (let i = 0; i < position.count; i++) position.setX(i, position.getX(i) + 6); position.needsUpdate = true;
    ticks(physics, 240, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeGreaterThan(9); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(9.2);
  });
  it('refreshes replacement vertex attributes even when vertex count and version are unchanged', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addCharacter('player', actor());
    const wall = box(4, 1.5, 0, 1, 3, 8); physics.addRigid('wall', wall, { kind: 'fixed' }); ticks(physics, 20);
    ticks(physics, 120, { player: { velocityMetersPerSecondXZ: [4, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(3.2);
    const old = wall.geometry.getAttribute('position') as THREE.BufferAttribute, replacement = old.clone();
    for (let i = 0; i < replacement.count; i++) replacement.setZ(i, replacement.getZ(i) + 12);
    expect(replacement.version).toBe(old.version); expect(replacement.count).toBe(old.count);
    wall.geometry.setAttribute('position', replacement);
    ticks(physics, 120, { player: { velocityMetersPerSecondXZ: [4, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeGreaterThan(9);
  });

  it('excludes independently registered skinned decorations and child bodies from the parent collision subtree', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addCharacter('player', actor());
    const parent = new THREE.Group(), ownWall = box(4, 1.5, 0, 1, 3, 8), childWall = box(10, 1.5, 0, 1, 3, 8);
    const decoration = new THREE.SkinnedMesh(new THREE.BoxGeometry(100, 100, 100)); parent.add(ownWall, childWall, decoration);
    setEntityBoundary(parent, true); setEntityBoundary(childWall, true); setEntityBoundary(decoration, true);
    physics.addRigid('parent', parent, { kind: 'fixed' }); physics.addRigid('child-wall', childWall, { kind: 'fixed' });
    expect(physics.audit().entities.find(entry => entry.id === 'parent')!.colliderCount).toBe(1);
    expect(physics.audit().entities.find(entry => entry.id === 'child-wall')!.colliderCount).toBe(1);
    expect(extractWorldTriangles(parent, { subdivide: false }).triangleCount).toBe(12);
    expect(extractWorldTriangles(childWall, { subdivide: false }).triangleCount).toBe(12);
    ticks(physics, 20); ticks(physics, 120, { player: { velocityMetersPerSecondXZ: [4, 0] } });
    expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(3.2); expect(physics.state('player')!.collisionEntityIds).toContain('parent');
    ownWall.visible = false; ticks(physics, 120, { player: { velocityMetersPerSecondXZ: [4, 0] } });
    expect(physics.audit().entities.find(entry => entry.id === 'parent')!.colliderCount).toBe(0);
    expect(physics.state('player')!.positionMetersXYZ[0]).toBeGreaterThan(9); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(9.2); expect(physics.state('player')!.collisionEntityIds).toContain('child-wall');
    // Explicitly extracting the boundary root itself still validates its own geometry.
    expect(() => extractWorldTriangles(decoration)).toThrow('PHYSICS_SKINNED_MESH_UNSUPPORTED');
  });

  it('refreshes signature and actual collision when an independent child boundary is toggled under a Mesh root', async () => {
    const physics = await create(); physics.addCharacter('player', actor());
    const parent = floor(), childWall = box(4, 1.5, 0, 1, 3, 8); parent.add(childWall); physics.addRigid('parent', parent, { kind: 'fixed' });
    ticks(physics, 20); ticks(physics, 120, { player: { velocityMetersPerSecondXZ: [4, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(3.2);
    const before = geometrySignature(parent); setEntityBoundary(childWall, true); expect(geometrySignature(parent)).not.toBe(before);
    ticks(physics, 120, { player: { velocityMetersPerSecondXZ: [4, 0] } }); expect(physics.audit().entities[1]!.colliderCount).toBe(1); expect(physics.state('player')!.positionMetersXYZ[0]).toBeGreaterThan(9);
    setEntityBoundary(childWall, false); expect(geometrySignature(parent)).toBe(before); physics.teleport('player', [0, .04, 0]);
    ticks(physics, 20); ticks(physics, 120, { player: { velocityMetersPerSecondXZ: [4, 0] } }); expect(physics.audit().entities[1]!.colliderCount).toBe(2); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(3.2);
  });

});
