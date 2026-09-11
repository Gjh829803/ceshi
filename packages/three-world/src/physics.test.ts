import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { ThreePhysics } from './physics.js';
import {physicsHost} from './physics-host';
import { extractWorldTriangles, geometrySignature, setEntityBoundary } from './geometry.js';
import type { CharacterDrive, PhysicsOptions } from './engine-contracts.js';

const retained: ThreePhysics[] = [];
const dt = 1 / 60;

it('retains explicit dynamic rotation locks across rebuild, interaction suspension and release',async()=>{
 const physics=await create({gravityMetersPerSecondSquared:[0,0,0]}),object=box(0,2,0,.2,.2,.2);
 physics.addRigid('locked',object,{kind:'dynamic',shape:'box',massKilograms:1,lockRotations:true});
 const native=physics as unknown as {entries:Map<string,{body:RAPIER.RigidBody}>};
 const spin=()=>{native.entries.get('locked')!.body.applyTorqueImpulse({x:1,y:1,z:1},true);ticks(physics,20);};
 spin();expect(object.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-5);
 object.scale.setScalar(2);physics.refresh('locked');ticks(physics,1);spin();
 expect(object.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-5);
 const control=physicsHost(physics).interactionBody('locked'),owner={};expect(control.hold(owner)).toBe(true);
 expect(control.release(owner,{reason:'place',position:new THREE.Vector3(0,2,0)})).toBe(true);
 spin();expect(object.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-5);
 physics.addRigid('free',box(2,2,0,.2,.2,.2),{kind:'dynamic',shape:'box',massKilograms:1});
 native.entries.get('free')!.body.applyTorqueImpulse({x:1,y:1,z:1},true);ticks(physics,20);
 expect(new THREE.Quaternion().copy(native.entries.get('free')!.body.rotation()).angleTo(new THREE.Quaternion())).toBeGreaterThan(.1);
});
async function create(options?: PhysicsOptions) { const physics = await ThreePhysics.create(options); retained.push(physics); return physics; }
function box(x: number, y: number, z: number, width: number, height: number, depth: number) { const object = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth)); object.position.set(x, y, z); return object; }
function floor(width = 120, depth = 100) { return new THREE.Mesh(new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2)); }
function actor(x = 0, z = 0, y = .04) { const object = new THREE.Group(); object.position.set(x, y, z); return object; }
function ticks(physics: ThreePhysics, count: number, drives: Readonly<Record<string, CharacterDrive>> = {}) { for (let i = 0; i < count; i++) physics.step(dt, drives); }
afterEach(() => { for (const physics of retained.splice(0)) physics.dispose(); vi.restoreAllMocks(); });

describe('actionable collision budget failures',()=>{
  it.each([
    {shape:'trimesh' as const,limits:{maximumTriangleCount:64},code:'PHYSICS_TRIANGLE_BUDGET_EXCEEDED',measurement:/availableTriangleBudget=64/},
    {shape:'box' as const,limits:{maximumColliderCount:63},code:'PHYSICS_COLLIDER_BUDGET_EXCEEDED',measurement:/requiredColliderCount=64.*maximumColliderCount=63/},
  ])('identifies $shape subdivision without changing rejection or leaving a body behind',async({shape,limits,code,measurement})=>{
    const physics=await create(limits),ground=box(0,-.5,0,30,1,30),before=physics.audit();
    let error:unknown;try{physics.addRigid('wide-floor',ground,{kind:'fixed',shape});}catch(caught){error=caught;}
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({code,category:'content',phase:'physics',entityIds:['wide-floor'],
      message:expect.stringMatching(measurement),suggestedAction:expect.stringContaining('convex-hull')});
    expect((error as Error).message).not.toContain('use the default triangle mesh representation');
    if(shape==='trimesh')expect((error as Error).message).toMatch(/at least.*maximumEdgeMeters=4/);
    if(shape==='box')expect((error as Error).message).toContain('sizeMetersXYZ=[30,1,30]');
    expect(physics.audit()).toEqual(before);expect(physics.state('wide-floor')).toBeUndefined();
    // This authored object is a closed convex box; the hull is its intended volume.
    physics.addRigid('wide-floor',ground,{kind:'fixed',shape:'convex-hull'});
    expect(physics.audit().colliderCount).toBe(1);
    expect(physics.castCameraArm([0,4,0],[0,-4,0],.1).colliderEntityId).toBe('wide-floor');
  });

  it('reports world totals and changed candidates while retaining the original live body',async()=>{
    const physics=await create({maximumTriangleCount:20}),ground=box(0,-.5,0,1,1,1);
    physics.addRigid('existing',ground,{kind:'fixed',shape:'box'});const before=physics.audit(),state=physics.state('existing');
    let error:unknown;try{physics.validateBatch([{kind:'rigid',id:'new-floor',object:box(3,-.5,0,1,1,1),options:{kind:'fixed',shape:'box'}}]);}catch(caught){error=caught;}
    expect(error).toMatchObject({code:'PHYSICS_TRIANGLE_BUDGET_EXCEEDED',entityIds:['new-floor'],
      message:expect.stringMatching(/plannedTriangleCount=24.*retainedTriangleCount=12.*maximumTriangleCount=20/)});
    expect(physics.audit()).toEqual(before);expect(physics.state('existing')).toEqual(state);
    expect(()=>physics.validateBatch([{kind:'rigid',id:'new-floor',object:box(3,-.5,0,1,1,1),options:{kind:'fixed',shape:'box'}}],['existing'])).not.toThrow();
  });

  it('keeps the existing entity identity on a rejected geometry refresh',async()=>{
    const physics=await create({maximumColliderCount:63}),ground=box(0,-.5,0,1,1,1);
    physics.addRigid('resized-floor',ground,{kind:'fixed',shape:'box'});const before=physics.audit();
    ground.scale.set(30,1,30);
    let error:unknown;try{physics.refresh('resized-floor');}catch(caught){error=caught;}
    expect(error).toMatchObject({code:'PHYSICS_COLLIDER_BUDGET_EXCEEDED',entityIds:['resized-floor']});
    expect(physics.audit()).toEqual(before);
  });

  it('keeps invalid instance counts diagnostic without invoking author formatting',async()=>{
    const physics=await create(),format=vi.fn(()=>{throw new Error('author formatting must not run');});
    for(const count of [Symbol('invalid'),{toString:format}]){
      const object=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial(),1);
      object.count=count as unknown as number;
      let error:unknown;try{physics.addRigid('invalid-instances',object,{kind:'fixed',shape:'convex-hull'});}catch(caught){error=caught;}
      expect(error).toMatchObject({code:'PHYSICS_COLLIDER_BUDGET_EXCEEDED',entityIds:['invalid-instances']});
      expect(format).not.toHaveBeenCalled();expect(physics.audit().entityCount).toBe(0);
    }
  });
});

describe('Three/Rapier character movement', () => {
  it('resolves the same first-tick Episode pose when geometry is published in a fresh or previously stepped world',async()=>{
    const physics=await create(),publish=()=>{physics.addRigid('ground',box(0,-.1,0,24,.2,24),{kind:'fixed'});
      physics.addCharacter('fox',actor(0,0,.03),{heightMeters:1.15,radiusMeters:.45});};publish();
    const start=[0,.03,0] as const,cold=physics.probeCharacterStart('fox',start);
    expect(cold.isValid).toBe(true);const before=physics.state('fox');
    expect(physics.probeCharacterStart('fox',start)).toEqual(cold);expect(physics.state('fox')).toEqual(before);
    physics.teleport('fox',cold.resolvedPositionWorldMetersXYZ);ticks(physics,1);const first=physics.state('fox')!.positionMetersXYZ;
    physics.remove('fox');physics.remove('ground');publish();
    const warm=physics.probeCharacterStart('fox',start);expect(warm).toEqual(cold);
    physics.teleport('fox',warm.resolvedPositionWorldMetersXYZ);ticks(physics,1);
    expect(physics.state('fox')!.positionMetersXYZ).toEqual(first);
  });
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
    physics.setEnabled('wall', false); expect(wall.visible).toBe(true); ticks(physics, 100, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeGreaterThan(6);
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

  it('retains physical child geometry when its rendered child becomes invisible', async () => {
    const physics = await create(); const group = new THREE.Group(), child = box(4, 1, 0, 1, 2, 3); group.add(child); physics.addRigid('group', group, { kind: 'fixed' });
    child.visible = false;
    expect(() => physics.step(dt, {})).not.toThrow(); expect(physics.audit().colliderCount).toBe(1); expect(physics.state('group')).toBeDefined();
    expect(extractWorldTriangles(group).triangleCount).toBeGreaterThan(0);
    child.visible = true; physics.step(dt, {}); expect(physics.audit().colliderCount).toBe(1);
  });

  it('keeps physical activation separate from raw visual visibility', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); const wall = box(4, 1.5, 0, .2, 3, 20); physics.addRigid('wall', wall, { kind: 'fixed' }); physics.addCharacter('player', actor()); ticks(physics, 20);
    wall.visible = false; ticks(physics, 180, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(3.6);
    physics.setEnabled('wall', false); wall.visible = true; ticks(physics, 120, { player: { velocityMetersPerSecondXZ: [2, 0] } }); expect(physics.state('player')!.positionMetersXYZ[0]).toBeGreaterThan(7);
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
    ownWall.visible = false; physics.setEnabled('parent', false); ticks(physics, 120, { player: { velocityMetersPerSecondXZ: [4, 0] } });
    expect(physics.audit().entities.find(entry => entry.id === 'parent')!.colliderCount).toBe(1);
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


describe('simultaneous character collisions', () => {
  it('does not inject the moving player velocity into a stationary NPC at a side contact', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addCharacter('player', actor()); physics.addCharacter('npc', actor(0, -3)); ticks(physics, 30);
    const initial = physics.state('npc')!.positionMetersXYZ; let contacted = false;
    for (let i = 0; i < 600; i++) {
      physics.step(dt, { player: { velocityMetersPerSecondXZ: [0, -4.8] } }); const npc = physics.state('npc')!, player = physics.state('player')!;
      expect(Math.hypot(npc.velocityMetersPerSecondXYZ[0], npc.velocityMetersPerSecondXYZ[2])).toBeLessThan(.01);
      expect(Math.hypot(npc.positionMetersXYZ[0] - initial[0], npc.positionMetersXYZ[2] - initial[2])).toBeLessThan(.002);
      expect(player.isGrounded).toBe(true); expect(npc.isGrounded).toBe(true);
      expect(Math.abs(player.positionMetersXYZ[1] - npc.positionMetersXYZ[1])).toBeLessThan(.035);
      expect(Math.hypot(player.positionMetersXYZ[0] - npc.positionMetersXYZ[0], player.positionMetersXYZ[2] - npc.positionMetersXYZ[2])).toBeGreaterThan(.699);
      contacted ||= player.collisionEntityIds.includes('npc') && npc.collisionEntityIds.includes('player');
    }
    expect(contacted).toBe(true);
  });

  it('limits overtaking to the moving NPC speed without alternating previous-tick velocities', async () => {
    // Isolate actor carry from triangulated-ground edge noise; this visible box
    // has the same exact solid box collider, while separate tests exercise mesh ground.
    const physics = await create(); physics.addRigid('ground', box(0, -.5, 0, 120, 1, 100), { kind: 'fixed', shape: 'box' }); physics.addCharacter('player', actor()); physics.addCharacter('npc', actor(0, -3)); ticks(physics, 30);
    let contactTicks = 0, wasFollowingContact = false;
    for (let i = 0; i < 240; i++) {
      physics.step(dt, { player: { velocityMetersPerSecondXZ: [0, -4.8] }, npc: { velocityMetersPerSecondXZ: [0, -2.2] } });
      const p = physics.state('player')!, n = physics.state('npc')!; expect(Math.abs(n.velocityMetersPerSecondXYZ[2])).toBeLessThan(2.25);
      const followingContact = p.collisionEntityIds.includes('npc') && Math.abs(p.positionMetersXYZ[0] - n.positionMetersXYZ[0]) < .02;
      // First impact may occur partway through the tick; only settled following
      // contacts must match the NPC’s actual same-tick physical speed; a floor
      // seam may briefly limit both, without either inheriting stale velocity.
      if (wasFollowingContact && followingContact) { contactTicks++; expect(p.velocityMetersPerSecondXYZ[2]).toBeCloseTo(n.velocityMetersPerSecondXYZ[2], 1); }
      wasFollowingContact = followingContact;
    }
    expect(contactTicks).toBeGreaterThan(15);
  });

  it('keeps both simultaneously approaching capsules separated and allows a diagonal graze', async () => {
    for (const reverse of [false, true]) {
      const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' });
      for (const id of reverse ? ['npc', 'player'] : ['player', 'npc']) physics.addCharacter(id, actor(0, id === 'npc' ? -3 : 0)); ticks(physics, 30);
      let contacted = false;
      for (let i = 0; i < 180; i++) { physics.step(dt, { player: { velocityMetersPerSecondXZ: [0, -4.8] }, npc: { velocityMetersPerSecondXZ: [0, 4.8] } }); const p = physics.state('player')!, n = physics.state('npc')!;
        expect(Math.hypot(p.positionMetersXYZ[0] - n.positionMetersXYZ[0], p.positionMetersXYZ[2] - n.positionMetersXYZ[2])).toBeGreaterThan(.699);
        expect(Math.hypot(p.velocityMetersPerSecondXYZ[0], p.velocityMetersPerSecondXYZ[2])).toBeLessThan(4.9); expect(Math.hypot(n.velocityMetersPerSecondXYZ[0], n.velocityMetersPerSecondXYZ[2])).toBeLessThan(4.9);
        expect(p.isGrounded && n.isGrounded).toBe(true); contacted ||= p.collisionEntityIds.includes('npc');
      } expect(contacted).toBe(true);
    }
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addCharacter('player', actor(.35)); physics.addCharacter('npc', actor(0, -3)); ticks(physics, 30);
    ticks(physics, 180, { player: { velocityMetersPerSecondXZ: [0, -4.8] } }); expect(physics.state('player')!.positionMetersXYZ[2]).toBeLessThan(-10); expect(physics.state('npc')!.positionMetersXYZ[2]).toBeCloseTo(-3, 2);
  });

  it('keeps pair projection out of a nearby wall while multiple actors converge', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addRigid('wall', box(.9, 1.5, 0, .2, 3, 12), { kind: 'fixed', shape: 'box' });
    physics.addCharacter('player', actor(-2, -3)); physics.addCharacter('npc', actor(0, 0)); physics.addCharacter('third', actor(-2, 3)); ticks(physics, 30);
    for (let i = 0; i < 300; i++) {
      physics.step(dt, { player: { velocityMetersPerSecondXZ: [2.66, 3.99] }, third: { velocityMetersPerSecondXZ: [2.66, -3.99] } });
      const entries = (physics as unknown as { entries: Map<string, { colliders: { contactCollider(other: unknown, distance: number): { distance: number } | null }[] }> }).entries;
      for (const id of ['player', 'npc', 'third']) { const contact = entries.get(id)!.colliders[0]!.contactCollider(entries.get('wall')!.colliders[0], .001); expect(contact?.distance ?? 0).toBeGreaterThan(-.001); expect(physics.state(id)!.isGrounded).toBe(true); }
      for (const [a, b] of [['player', 'npc'], ['player', 'third'], ['npc', 'third']]) { const contact = entries.get(a!)!.colliders[0]!.contactCollider(entries.get(b!)!.colliders[0], .001); expect(contact?.distance ?? 0).toBeGreaterThan(-.001); }
    }
  });
});

describe('camera arm physical shape probes', () => {
  it('returns world-space contact normals and verified separation for rotated dirty and committed walls', async () => {
    const physics = await ThreePhysics.create(); const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 4, .2));
    wall.rotation.y = .4; wall.position.set(0, 1.3, 3); physics.addRigid('wall', wall, { kind: 'fixed', shape: 'box' });
    try {
      for (const committed of [false, true]) {
        if (committed) physics.step(1 / 60, {});
        const hit = physics.castCameraArm([0, 1.3, 0], [0, 1.3, 6], .2);
        expect(hit.normalWorldXYZ![0]).toBeCloseTo(-Math.sin(.4), 3); expect(hit.normalWorldXYZ![2]).toBeCloseTo(-Math.cos(.4), 3);
        const overlap = physics.castCameraArm([0, 1.3, 3], [0, 1.3, 6], .2);
        expect(overlap.startedOverlapping).toBe(true); expect(overlap.penetrationDepthMeters).toBeCloseTo(.3, 4);
        const separated = new THREE.Vector3(0, 1.3, 3).addScaledVector(new THREE.Vector3(...overlap.normalWorldXYZ!), overlap.penetrationDepthMeters! + .02);
        expect(physics.castCameraArm(separated.toArray() as [number, number, number], separated.toArray() as [number, number, number], .2).startedOverlapping).not.toBe(true);
      }
    } finally { physics.dispose(); wall.geometry.dispose(); }
  });
  it('uses each collider source mesh visibility for box, hull, triangle and instanced obstacles without disabling physics', async () => {
    for (const shape of ['box', 'convex-hull', 'trimesh'] as const) {
      const physics = await create(), root = new THREE.Group(), hidden = box(0, 1, 2, 4, 4, .2), visible = box(0, 1, 5, 4, 4, .2); root.add(hidden, visible);
      physics.addRigid('walls', root, { kind: 'fixed', shape });
      expect(physics.castCameraArm([0, 1, 0], [0, 1, 8], .2).distanceMeters).toBeCloseTo(1.7, 2);
      hidden.visible = false;
      expect(physics.castCameraArm([0, 1, 0], [0, 1, 8], .2).distanceMeters).toBeCloseTo(4.7, 2);
      expect(physics.probe([0, 1, 0], [0, 0, 1], 8)?.distanceMeters).toBeCloseTo(1.9, 2);
      hidden.visible = true; expect(physics.castCameraArm([0, 1, 0], [0, 1, 8], .2).distanceMeters).toBeCloseTo(1.7, 2);
      root.visible = false; expect(physics.castCameraArm([0, 1, 0], [0, 1, 8], .2)).toEqual({ distanceMeters: 8 }); expect(physics.audit().colliderCount).toBe(2);
      const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 4, .2), new THREE.MeshBasicMaterial(), 2);
      instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 1, 3)); instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 1, 6)); const parent = new THREE.Group(); parent.add(instances);
      physics.addRigid('instances', parent, { kind: 'fixed', shape }); expect(physics.castCameraArm([0, 1, 0], [0, 1, 8], .2).distanceMeters).toBeCloseTo(2.7, 2);
      instances.visible = false; expect(physics.castCameraArm([0, 1, 0], [0, 1, 8], .2)).toEqual({ distanceMeters: 8 }); expect(physics.audit().colliderCount).toBe(4);
    }
  });
  it('casts a sphere against actual solids, excludes characters and hidden bodies, and returns zero for initial overlap', async () => {
    const physics = await create(); const wall = box(0, 1.3, 3, 4, 4, .2); physics.addRigid('wall', wall, { kind: 'fixed', shape: 'box' }); physics.addCharacter('npc', actor(0, 1)); physics.step(dt, {});
    const hit = physics.castCameraArm([0, 1.3, 0], [0, 1.3, 6], .2); expect(hit.colliderEntityId).toBe('wall'); expect(hit.distanceMeters).toBeCloseTo(2.7, 4);
    expect(physics.castCameraArm([0, 1.3, 3], [0, 1.3, 6], .2)).toMatchObject({ distanceMeters: 0, colliderEntityId: 'wall', startedOverlapping: true });
    physics.setEnabled('wall', false); expect(physics.castCameraArm([0, 1.3, 0], [0, 1.3, 6], .2)).toEqual({ distanceMeters: 6 });
    physics.setEnabled('wall', true); const reverse = physics.castCameraArm([0, 1.3, 6], [0, 1.3, 0], .2); expect(reverse.colliderEntityId).toBe('wall'); expect(reverse.distanceMeters).toBeCloseTo(2.7, 4);
    expect(() => physics.castCameraArm([0, 1.3, 0], [0, 1.3, 6], 0)).toThrow('PHYSICS_OPTION_INVALID');
  });

  it('blocks camera volume at a triangle edge even where a center ray misses, from either face', async () => {
    const physics = await create(); const wall = new THREE.Mesh(new THREE.PlaneGeometry(2, 4)); wall.position.set(0, 1.3, 3); physics.addRigid('wall', wall, { kind: 'fixed' }); physics.step(dt, {});
    const rayMiss = physics.castCameraArm([1.1, 1.3, 0], [1.1, 1.3, 6], .01); expect(rayMiss).toEqual({ distanceMeters: 6 });
    for (const [a, b] of [[0, 6], [6, 0]]) { const hit = physics.castCameraArm([1.1, 1.3, a!], [1.1, 1.3, b!], .2); expect(hit.colliderEntityId).toBe('wall'); expect(hit.distanceMeters).toBeGreaterThan(2.8); expect(hit.distanceMeters).toBeLessThan(3); }
  });
});

describe('movement extension intent adapter', () => {
  it('uses XYZ intent in the same KCC, colliding with walls and ceilings without gravity or snap', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addRigid('wall', box(4, 2, 0, .2, 4, 8), { kind: 'fixed', shape: 'box' }); physics.addRigid('ceiling', box(0, 4.1, 0, 20, .2, 20), { kind: 'fixed', shape: 'box' });
    physics.addCharacter('player', actor(0, 0, .2));
    const hover = { player: { velocityWorldMetersPerSecondXYZ: [0, 0, 0] as const, applyGravity: false } };
    ticks(physics, 30, hover); expect(physics.state('player')!.positionMetersXYZ[1]).toBeCloseTo(.2, 5); expect(physics.state('player')!.isGrounded).toBe(false);
    ticks(physics, 150, { player: { velocityWorldMetersPerSecondXYZ: [2, .5, 0], applyGravity: false } });
    expect(physics.state('player')!.positionMetersXYZ[0]).toBeGreaterThan(3.4); expect(physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(3.6); expect(physics.state('player')!.collisionEntityIds).toContain('wall');
    ticks(physics, 120, { player: { velocityWorldMetersPerSecondXYZ: [0, 2, 0], applyGravity: false } });
    const state = physics.state('player')!; expect(state.positionMetersXYZ[1]).toBeGreaterThan(2.1); expect(state.positionMetersXYZ[1]).toBeLessThan(2.21); expect(state.collisionEntityIds).toContain('ceiling'); expect(state.isGrounded).toBe(false);
  });

  it('adds real gravity to intent Y and clears vertical history when switching drive modes', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addCharacter('player', actor(0, 0, 20));
    ticks(physics, 60); expect(physics.state('player')!.velocityMetersPerSecondXYZ[1]).toBeLessThan(-9);
    physics.step(dt, { player: { velocityWorldMetersPerSecondXYZ: [0, 1, 0], applyGravity: false } }); expect(physics.state('player')!.velocityMetersPerSecondXYZ[1]).toBeCloseTo(1, 3);
    const hoveringAt = physics.state('player')!.positionMetersXYZ[1]; ticks(physics, 30, { player: { velocityWorldMetersPerSecondXYZ: [0, 0, 0], applyGravity: false } }); expect(physics.state('player')!.positionMetersXYZ[1]).toBeCloseTo(hoveringAt, 5);
    physics.step(dt, { player: { velocityWorldMetersPerSecondXYZ: [0, 3, 0], applyGravity: true } }); expect(physics.state('player')!.velocityMetersPerSecondXYZ[1]).toBeCloseTo(3 - 9.81 * dt, 3);
    physics.step(dt, { player: { velocityWorldMetersPerSecondXYZ: [0, 3, 0], applyGravity: true } }); expect(physics.state('player')!.velocityMetersPerSecondXYZ[1]).toBeCloseTo(3 - 9.81 * dt * 2, 3);
    physics.step(dt, { player: { velocityMetersPerSecondXZ: [0, 0] } }); expect(physics.state('player')!.velocityMetersPerSecondXYZ[1]).toBeCloseTo(-9.81 * dt, 3);
  });

  it('retains actor pair collision and one world solve when mixing ground and spatial drive', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); physics.addCharacter('player', actor()); physics.addCharacter('npc', actor(0, -3)); ticks(physics, 30);
    const engineStep = vi.spyOn((physics as unknown as { world: { step(): void } }).world, 'step'); let touched = false;
    for (let i = 0; i < 180; i++) {
      physics.step(dt, { player: { velocityWorldMetersPerSecondXYZ: [0, 0, -4.8], applyGravity: true }, npc: { velocityMetersPerSecondXZ: [0, 4.8] } });
      const p = physics.state('player')!, n = physics.state('npc')!; expect(Math.hypot(p.positionMetersXYZ[0] - n.positionMetersXYZ[0], p.positionMetersXYZ[2] - n.positionMetersXYZ[2])).toBeGreaterThan(.699); touched ||= p.collisionEntityIds.includes('npc');
    }
    expect(touched).toBe(true); expect(engineStep).toHaveBeenCalledTimes(180);
  });

  it('rejects malformed or mixed drive intents before moving any actor', async () => {
    const physics = await create(); physics.addCharacter('player', actor()); physics.addCharacter('npc', actor(3)); const before = [physics.state('player'), physics.state('npc')];
    for (const invalid of [{ velocityWorldMetersPerSecondXYZ: [0, NaN, 0], applyGravity: false }, { velocityWorldMetersPerSecondXYZ: [0, 0, 0] }, { velocityMetersPerSecondXZ: [0, 0], velocityWorldMetersPerSecondXYZ: [0, 0, 0], applyGravity: false }]) {
      expect(() => physics.step(dt, { player: { velocityMetersPerSecondXZ: [4, 0] }, npc: invalid as CharacterDrive })).toThrow('PHYSICS_DRIVE_INVALID'); expect([physics.state('player'), physics.state('npc')]).toEqual(before);
    }
  });

  it('reads newly created, moved, resized, re-enabled and reset colliders before the next solve', async () => {
    const physics = await create(); const wall = box(0, 1, 3, 4, 4, .2);
    const step = vi.spyOn((physics as unknown as { world: { step(): void } }).world, 'step');
    const query = (z: number) => {
      const probe = physics.probe([0, 1, 0], [0, 0, 1], 20); expect(probe?.entityId).toBe('wall'); expect(probe?.distanceMeters).toBeCloseTo(z - .1, 4);
      const camera = physics.castCameraArm([0, 1, 0], [0, 1, 20], .2); expect(camera.colliderEntityId).toBe('wall'); expect(camera.distanceMeters).toBeCloseTo(z - .3, 3);
    };
    physics.addRigid('wall', wall, { kind: 'fixed', shape: 'box' }); query(3);
    physics.teleport('wall', [0, 1, 9]); query(9); expect(step).not.toHaveBeenCalled();
    physics.step(dt, {}); expect(step).toHaveBeenCalledTimes(1);
    physics.teleport('wall', [0, 1, 1]); query(1);
    expect(physics.castCameraArm([0, 1, 1], [0, 1, 5], .2)).toMatchObject({ distanceMeters: 0, colliderEntityId: 'wall', startedOverlapping: true });
    wall.scale.z = 3; physics.refresh('wall'); expect(physics.probe([0, 1, 0], [0, 0, 1], 20)?.distanceMeters).toBeCloseTo(.7, 4);
    physics.setEnabled('wall', false); expect(physics.probe([0, 1, 0], [0, 0, 1], 20)).toBeNull(); physics.step(dt, {});
    physics.setEnabled('wall', true); expect(physics.castCameraArm([0, 1, 0], [0, 1, 20], .2).distanceMeters).toBeCloseTo(.5, 3);
    physics.reset(); query(3); expect(step).toHaveBeenCalledTimes(2);
    physics.remove('wall'); expect(physics.probe([0, 1, 0], [0, 0, 1], 20)).toBeNull(); expect(physics.castCameraArm([0, 1, 0], [0, 1, 20], .2)).toEqual({ distanceMeters: 20 });
  });

  it('probes real active colliders without treating the ray as character support', async () => {
    const physics = await create(); const wall = box(4, 1.5, 0, .2, 3, 4); physics.addRigid('wall', wall, { kind: 'fixed', shape: 'box' }); physics.addCharacter('player', actor()); physics.step(dt, {});
    expect(physics.probe([0, 1, 0], [1, 0, 0], 10)?.entityId).toBe('player');
    const hit = physics.probe([0, 1, 0], [2, 0, 0], 10, 'player'); expect(hit?.entityId).toBe('wall'); expect(hit?.distanceMeters).toBeCloseTo(3.9, 4); expect(hit?.normalWorldXYZ).toEqual([-1, 0, 0]);
    wall.visible = false; expect(physics.probe([0, 1, 0], [1, 0, 0], 10, 'player')?.entityId).toBe('wall'); expect(physics.castCameraArm([0, 1, 0], [10, 1, 0], .2)).toEqual({ distanceMeters: 10 });
    physics.setEnabled('wall', false); expect(physics.probe([0, 1, 0], [1, 0, 0], 10, 'player')).toBeNull();
    expect(() => physics.probe([0, 1, 0], [0, 0, 0], 10)).toThrow('PHYSICS_PROBE_INVALID');
  });
});

describe('Pure candidate physics validation', () => {
  it('rejects candidate actor overlaps against live or other candidate provider shapes, while allowing exact ground contact', async () => {
    const physics = await create(); physics.addRigid('ground', box(0, -.5, 0, 100, 1, 100), { kind: 'fixed', shape: 'box' }); physics.addCharacter('player', actor());
    const before = physics.audit();
    const wall = { kind: 'rigid' as const, id: 'wall', object: box(.3, 1, 0, .2, 2, 4), options: { kind: 'fixed' as const, shape: 'box' as const } };
    expect(() => physics.validateBatch([wall])).toThrow('PHYSICS_CHARACTER_OVERLAP');
    expect(() => physics.validateBatch([{ kind: 'character', id: 'npc', object: actor(.3) }])).toThrow('PHYSICS_CHARACTER_OVERLAP');
    expect(() => physics.validateBatch([{ kind: 'character', id: 'player', object: actor(4) }, { ...wall, object: box(4, 1, 0, .2, 2, 4) }])).toThrow('PHYSICS_CHARACTER_OVERLAP');
    expect(() => physics.validateBatch([{ kind: 'character', id: 'npc', object: actor(4, 0, 0) }])).not.toThrow();
    expect(() => physics.validateBatch([wall], ['player'])).not.toThrow(); expect(physics.audit()).toEqual(before);
  });
  it('validates candidate and combined budgets without allocating or changing live physics', async () => {
    const physics = await create({ maximumColliderCount: 2 }); const original = box(0, 1, 0, 1, 1, 1); physics.addRigid('existing', original, { kind: 'fixed', shape: 'box' });
    const world = (physics as unknown as { world: { createRigidBody(): void; createCollider(): void; step(): void } }).world;
    const bodies = vi.spyOn(world, 'createRigidBody'), colliders = vi.spyOn(world, 'createCollider'), step = vi.spyOn(world, 'step');
    const before = physics.audit(), state = physics.state('existing');
    const first = { kind: 'character' as const, id: 'a', object: actor(3) }, second = { kind: 'character' as const, id: 'b', object: actor(5) };
    expect(() => physics.validateBatch([first])).not.toThrow(); expect(() => physics.validateBatch([second])).not.toThrow();
    expect(() => physics.validateBatch([first, second])).toThrow('PHYSICS_COLLIDER_BUDGET_EXCEEDED');
    expect(() => physics.validateBatch([first, second], ['existing'])).not.toThrow();
    expect(() => physics.validateBatch([{ ...first, id: 'existing' }, second])).not.toThrow();
    expect(physics.audit()).toEqual(before); expect(physics.state('existing')).toEqual(state); expect(bodies).not.toHaveBeenCalled(); expect(colliders).not.toHaveBeenCalled(); expect(step).not.toHaveBeenCalled();
  });

  it('rejects invalid later shapes, duplicate identities and combined triangle counts', async () => {
    const physics = await create({ maximumTriangleCount: 20 }); const live = box(0, 1, 0, 1, 1, 1); physics.addRigid('live', live, { kind: 'fixed', shape: 'box' });
    const first = { kind: 'rigid' as const, id: 'new', object: box(3, 1, 0, 1, 1, 1), options: { kind: 'fixed' as const, shape: 'box' as const } };
    expect(() => physics.validateBatch([first])).toThrow('PHYSICS_TRIANGLE_BUDGET_EXCEEDED');
    expect(() => physics.validateBatch([first], ['live'])).not.toThrow();
    const invalid = { kind: 'character' as const, id: 'bad', object: actor(), options: { heightMeters: .5, radiusMeters: 1 } };
    expect(() => physics.validateBatch([first, invalid], ['live'])).toThrow('PHYSICS_CHARACTER_SHAPE_INVALID');
    expect(() => physics.validateBatch([first, first])).toThrow('PHYSICS_CANDIDATE_BATCH_INVALID');
    expect(() => physics.validateBatch([{ ...first, id: 'live' }], ['live'])).toThrow('PHYSICS_CANDIDATE_BATCH_INVALID');
    expect(() => physics.validateBatch([{ ...first, object: live }])).toThrow('PHYSICS_OBJECT_INVALID');
    expect(() => physics.validateBatch([], ['unknown'])).toThrow('PHYSICS_ENTITY_UNKNOWN');
    expect(physics.audit().entityCount).toBe(1); expect(physics.state('live')!.positionMetersXYZ).toEqual([0, 1, 0]);
  });
});

describe('First movement tick after geometry publication', () => {
  it('adds voluntary walking to a moving platform and reads final native support after vertical or rotating motion', async () => {
    for (const motion of ['horizontal-walk', 'up', 'down', 'rotate'] as const) {
      const physics = await create(), platform = box(0, -.5, 0, 8, 1, 8); physics.addRigid('platform', platform, { kind: 'kinematic', shape: 'box' }); physics.addCharacter('player', actor(motion === 'rotate' ? 2 : 0, 0, 0), { heightMeters: 1.8, radiusMeters: .3 }); ticks(physics, 30);
      for (let i = 0; i < 60; i++) {
        if (motion === 'horizontal-walk') platform.position.x += dt;
        else if (motion === 'rotate') platform.rotation.y += Math.PI / 4 * dt;
        else platform.position.y += (motion === 'up' ? .5 : -.5) * dt;
        physics.step(dt, { player: { velocityMetersPerSecondXZ: [0, motion === 'horizontal-walk' ? -2.2 : 0] } }); expect(physics.state('player')!.isGrounded, motion).toBe(true);
      }
      const state = physics.state('player')!;
      if (motion === 'horizontal-walk') { expect(state.positionMetersXYZ[0]).toBeCloseTo(1, 1); expect(state.positionMetersXYZ[2]).toBeCloseTo(-2.2, 1); }
      else if (motion === 'rotate') expect(new THREE.Vector3(...state.positionMetersXYZ).setY(0).distanceTo(new THREE.Vector3(Math.SQRT2, 0, -Math.SQRT2))).toBeLessThan(.05);
      else expect(state.positionMetersXYZ[1]).toBeCloseTo(platform.position.y + .5 + .015, 1);
    }
  });

  it('does not apply support carry at a side contact with a moving kinematic wall', async () => {
    const physics = await create(); physics.addRigid('ground', floor(), { kind: 'fixed' }); const wall = box(.5, 1.5, 0, .2, 3, 6); physics.addRigid('wall', wall, { kind: 'kinematic', shape: 'box' }); physics.addCharacter('player', actor()); ticks(physics, 30);
    const before = physics.state('player')!.positionMetersXYZ;
    for (let i = 0; i < 60; i++) { wall.position.z += dt; physics.step(dt, {}); }
    const after = physics.state('player')!; expect(Math.hypot(after.positionMetersXYZ[0] - before[0], after.positionMetersXYZ[2] - before[2])).toBeLessThan(.005); expect(after.isGrounded).toBe(true);
  });

  it('restores kinematic type, velocity and next pose after a failed query before any world solve', async () => {
    const physics = await create(), platform = box(0, -.5, 0, 8, 1, 8); physics.addRigid('platform', platform, { kind: 'kinematic', shape: 'box' }); physics.addCharacter('player', actor(0, 0, 0)); ticks(physics, 30);
    platform.position.x = .1; physics.step(dt, {});
    const native = physics as unknown as { entries: Map<string, { body: RAPIER.RigidBody; colliders: RAPIER.Collider[] }>; world: RAPIER.World; computeEnvironmentMotion(value: unknown): void };
    const entry = native.entries.get('platform')!, body = entry.body, handles = entry.colliders.map(collider => collider.handle), before = { translation: body.translation(), rotation: body.rotation(), velocity: body.linvel(), angularVelocity: body.angvel(), sleeping: body.isSleeping(), enabled: body.isEnabled() };
    platform.position.x = .2; platform.rotation.y = .1;
    const step = vi.spyOn(native.world, 'step'); vi.spyOn(native, 'computeEnvironmentMotion').mockImplementation(() => { expect(body.bodyType()).toBe(RAPIER.RigidBodyType.Fixed); throw new Error('injected query failure'); });
    expect(() => physics.step(dt, {})).toThrow('injected query failure'); expect(step).not.toHaveBeenCalled();
    expect(body.bodyType()).toBe(RAPIER.RigidBodyType.KinematicPositionBased); expect(body.translation()).toEqual(before.translation); expect(body.rotation()).toEqual(before.rotation); expect(body.linvel()).toEqual(before.velocity); expect(body.angvel()).toEqual(before.angularVelocity);
    expect(body.nextTranslation().x).toBeCloseTo(.2, 6); expect(body.nextRotation().y).toBeCloseTo(Math.sin(.05), 6); expect(body.isSleeping()).toBe(before.sleeping); expect(body.isEnabled()).toBe(before.enabled); expect(entry.colliders.map(collider => collider.handle)).toEqual(handles);
  });
  it('partitions a large explicit fixed or kinematic box into exact small cuboids without changing visible geometry', async () => {
    for (const kind of ['fixed', 'kinematic'] as const) for (const radius of [.3, .35]) for (const y of [0, .015, .04]) {
      const physics = await create(), ground = box(0, -.5, 0, 30, 1, 30); physics.addRigid('ground', ground, { kind, shape: 'box' }); physics.addCharacter('player', actor(0, 0, y), { heightMeters: 1.8, radiusMeters: radius });
      expect(ground.geometry.index!.count).toBe(36); expect(physics.audit().entities.find(entry => entry.id === 'ground')!.colliderCount).toBe(64);
      ticks(physics, 30); const start = physics.state('player')!.positionMetersXYZ[2]; let stopped = 0;
      for (let i = 0; i < 120; i++) {
        physics.step(dt, { player: { velocityMetersPerSecondXZ: [0, -2.2] } }); const state = physics.state('player')!;
        expect(state.positionMetersXYZ[1]).toBeGreaterThan(-.001); expect(state.isGrounded).toBe(true); if (Math.abs(state.velocityMetersPerSecondXYZ[2]) < .1) stopped++;
      }
      expect(start - physics.state('player')!.positionMetersXYZ[2]).toBeGreaterThan(4.35); expect(stopped).toBeLessThanOrEqual(1);
      expect(physics.castCameraArm([0, 3, 0], [0, -3, 0], .2).colliderEntityId).toBe('ground'); ground.visible = false;
      expect(physics.castCameraArm([0, 3, 0], [0, -3, 0], .2)).toEqual({ distanceMeters: 6 }); expect(physics.probe([0, 3, 0], [0, -1, 0], 6, 'player')?.entityId).toBe('ground');
    }
    const limited = await create({ maximumColliderCount: 63 });
    expect(() => limited.addRigid('ground', box(0, -.5, 0, 30, 1, 30), { kind: 'fixed', shape: 'box' })).toThrow('PHYSICS_COLLIDER_BUDGET_EXCEEDED'); expect(limited.audit().entityCount).toBe(0);
  });
  it('prepares exact foot-on-surface spawns, resets and teleports using capsule clearance instead of requiring an authored Y offset', async () => {
    const physics = await create(); physics.addRigid('ground', box(0, -.5, 0, 30, 1, 30), { kind: 'fixed' }); physics.addCharacter('player', actor(0, 0, 0), { heightMeters: 1.8, radiusMeters: .3 });
    for (const cycle of ['initial', 'reset', 'teleport'] as const) {
      if (cycle === 'reset') physics.reset(); if (cycle === 'teleport') physics.teleport('player', [0, 0, 0]);
      const engine = physics as unknown as { prepareCharacterClearance(): void }; const prepare = engine.prepareCharacterClearance.bind(engine);
      const spy = vi.spyOn(engine, 'prepareCharacterClearance').mockImplementation(() => { prepare(); expect(physics.state('player')!.positionMetersXYZ[1]).toBeLessThanOrEqual(.015001); });
      physics.step(dt, {}); spy.mockRestore(); expect(physics.state('player')!.positionMetersXYZ[1]).toBeGreaterThan(0);
      ticks(physics, 29); const start = physics.state('player')!.positionMetersXYZ[2]; ticks(physics, 60, { player: { velocityMetersPerSecondXZ: [0, -2.2] } });
      expect(start - physics.state('player')!.positionMetersXYZ[2], cycle).toBeCloseTo(2.2, 2); expect(physics.state('player')!.isGrounded).toBe(true);
    }
  });

  it('does not pull an airborne spawn toward the ground and validates clearance against a low ceiling before publication', async () => {
    const physics = await create(); physics.addRigid('ground', box(0, -.5, 0, 30, 1, 30), { kind: 'fixed' }); physics.addCharacter('hover', actor(0, 0, .2), { heightMeters: 1.8, radiusMeters: .3 });
    physics.step(dt, { hover: { velocityWorldMetersPerSecondXYZ: [0, 0, 0], applyGravity: false } }); expect(physics.state('hover')!.positionMetersXYZ[1]).toBeCloseTo(.2, 5);
    const ceiling = box(4, 1.805 + .1, 0, 2, .2, 2); physics.addRigid('ceiling', ceiling, { kind: 'fixed', shape: 'box' });
    const candidate = { kind: 'character' as const, id: 'short-room', object: actor(4, 0, 0), options: { heightMeters: 1.8, radiusMeters: .3 } };
    const before = physics.audit(); expect(() => physics.validateBatch([candidate])).toThrow('PHYSICS_SPAWN_CLEARANCE_BLOCKED'); expect(physics.audit()).toEqual(before);
    physics.addCharacter(candidate.id, candidate.object, candidate.options); const state = physics.state(candidate.id);
    expect(() => physics.step(dt, {})).toThrow('PHYSICS_SPAWN_CLEARANCE_BLOCKED'); expect(physics.state(candidate.id)).toEqual(state);
  });
  it('does not repeatedly freeze motion by mistaking provider float precision for authored fixed-body edits', async () => {
    const physics = await create(), ground = box(33.3, -.5, 66.6, 100, 1, 100); ground.rotation.y = .4;
    physics.addRigid('ground', ground, { kind: 'fixed', shape: 'box' }); physics.addCharacter('player', actor(33.3, 66.6)); ticks(physics, 20);
    const initialX = physics.state('player')!.positionMetersXYZ[0]; ticks(physics, 100, { player: { velocityMetersPerSecondXZ: [4.8, 0] } });
    expect(physics.state('player')!.positionMetersXYZ[0] - initialX).toBeGreaterThan(7.9); expect(physics.state('player')!.isGrounded).toBe(true);
  });
  it('diagnoses direct initial overlaps before a physics solve instead of leaving a playable but trapped character', async () => {
    for (const otherKind of ['wall', 'character'] as const) {
      const physics = await create(); physics.addCharacter('player', actor());
      if (otherKind === 'wall') physics.addRigid('wall', box(0, 1, 0, 1, 2, 2), { kind: 'fixed', shape: 'box' }); else physics.addCharacter('npc', actor(.3));
      const before = physics.state('player'), step = vi.spyOn((physics as unknown as { world: { step(): void } }).world, 'step');
      expect(() => physics.step(dt, {})).toThrow('PHYSICS_CHARACTER_OVERLAP'); expect(step).not.toHaveBeenCalled(); expect(physics.state('player')).toEqual(before);
    }
  });
  it('does not enter a just spawned, moved, rebuilt or re-enabled solid while the native broad phase catches up', async () => {
    for (const mode of ['spawn', 'teleport', 'rebuild', 'reactivate', 'authored-position'] as const) {
      const physics = await create(); physics.addRigid('ground', box(0, -.5, 0, 100, 1, 100), { kind: 'fixed', shape: 'box' }); physics.addCharacter('player', actor());
      const wall = box(15, 1.5, 0, .2, 3, 4);
      if (mode !== 'spawn') physics.addRigid('wall', wall, { kind: 'fixed', shape: 'box' });
      if (mode === 'reactivate') physics.setEnabled('wall', false);
      ticks(physics, 20);
      if (mode === 'spawn') { wall.position.x = .48; physics.addRigid('wall', wall, { kind: 'fixed', shape: 'box' }); }
      else if (mode === 'rebuild') { wall.position.x = .48; wall.scale.z = 2; physics.refresh('wall'); }
      else if (mode === 'authored-position') wall.position.x = .48;
      else { physics.teleport('wall', [.48, 1.5, 0]); if (mode === 'reactivate') physics.setEnabled('wall', true); }
      const native = (physics as unknown as { world: { step(): void }; entries: Map<string, { colliders: { contactCollider(other: unknown, prediction: number): { distance: number } | null }[] }> });
      const step = vi.spyOn(native.world, 'step');
      for (let i = 0; i < 10; i++) {
        physics.step(dt, { player: { velocityMetersPerSecondXZ: [4.8, 0] } });
        expect(physics.state('player')!.positionMetersXYZ[0], mode).toBeLessThan(.031);
        const contact = native.entries.get('player')!.colliders[0]!.contactCollider(native.entries.get('wall')!.colliders[0]!, .03);
        expect(contact?.distance ?? 1, mode).toBeGreaterThan(-.001);
        expect(physics.state('player')!.isGrounded, mode).toBe(true);
      }
      expect(step, mode).toHaveBeenCalledTimes(10); expect(physics.state('player')!.collisionEntityIds).toContain('wall');
    }
  });

  it('lands on an actual newly published thin triangle bridge without crossing it for one tick', async () => {
    const physics = await create(); physics.addCharacter('player', actor(0, 0, 1)); ticks(physics, 18);
    const bridgeY = physics.state('player')!.positionMetersXYZ[1] - .01, bridge = floor(4, 4); bridge.position.y = bridgeY; physics.addRigid('bridge', bridge, { kind: 'fixed' });
    physics.step(dt, {});
    expect(physics.state('player')!.positionMetersXYZ[1]).toBeGreaterThanOrEqual(bridgeY - .001); expect(physics.state('player')!.isGrounded).toBe(true);
    ticks(physics, 30); expect(physics.state('player')!.positionMetersXYZ[1]).toBeGreaterThanOrEqual(bridgeY - .001); expect(physics.state('player')!.isGrounded).toBe(true);
  });
});


describe('interaction physical ownership',()=>{
 it('holds the original rigid body across ticks and releases it through its own physics owner',async()=>{
  const physics=await create(),object=box(0,2,0,.2,.2,.2);physics.addRigid('parcel',object,{kind:'dynamic',shape:'box',massKilograms:2,frictionRatio:.23});
  const before=physics.audit(),binding=physicsHost(physics).interactionBody('parcel'),owner={};
  expect(binding.hold(owner)).toBe(true);expect(binding.hold({})).toBe(false);
  expect(binding.moveHeld(owner,new THREE.Vector3(2,3,1))).toBe(true);physics.setEnabled('parcel',false);physics.setEnabled('parcel',true);ticks(physics,120);
  expect(physics.probe([2,5,1],[0,-1,0],5)).toBeNull();
  expect(physics.audit()).toEqual(before);expect(physics.state('parcel')!.positionMetersXYZ).toEqual([2,3,1]);expect(object.position.toArray()).toEqual([2,3,1]);
  expect(binding.read()).toMatchObject({collisionEnabled:false,entityEnabled:true,massKg:2});expect(binding.release({}, {reason:'place',position:new THREE.Vector3(2,3,1)})).toBe(false);
  expect(binding.release(owner,{reason:'water',position:new THREE.Vector3(2,3,1),velocity:new THREE.Vector3()})).toBe(true);expect(physics.probe([2,5,1],[0,-1,0],5)?.entityId).toBe('parcel');ticks(physics,30);
  expect(physics.state('parcel')!.positionMetersXYZ[1]).toBeLessThan(2);expect(binding.read().massKg).toBeCloseTo(2);expect(binding.isHeld).toBe(false);
 });
 it('does not let an old physical capability acquire a later entity with the same id',async()=>{
  const physics=await create();physics.addRigid('parcel',box(0,2,0,.2,.2,.2),{kind:'dynamic',shape:'box'});
  const binding=physicsHost(physics).interactionBody('parcel'),owner={};expect(binding.hold(owner)).toBe(true);physics.remove('parcel');
  physics.addRigid('parcel',box(4,3,0,.2,.2,.2),{kind:'dynamic',shape:'box'});
  expect(binding.isValid).toBe(false);expect(binding.hold(owner)).toBe(false);expect(binding.moveHeld(owner,new THREE.Vector3())).toBe(false);expect(binding.release(owner,{reason:'drop',position:new THREE.Vector3()})).toBe(false);
  expect(physics.state('parcel')!.positionMetersXYZ).toEqual([4,3,0]);
 });
 it('refreshes actual dimensions without replacing entity identity and rejects held body rebuilds',async()=>{
  const physics=await create(),object=box(0,2,0,.2,.2,.2);physics.addRigid('parcel',object,{kind:'dynamic',shape:'box'});
  const binding=physicsHost(physics).interactionBody('parcel'),owner={};object.scale.setScalar(2);physics.refresh('parcel');
  expect(binding.isValid).toBe(true);expect(binding.read().sizeMetersXYZ[0]).toBeCloseTo(.4);
  expect(binding.hold(owner)).toBe(true);expect(()=>physics.teleport('parcel',[9,9,9])).toThrow('PHYSICS_ENTITY_HELD');expect(()=>physics.applyImpulse('parcel',[1,0,0])).toThrow('PHYSICS_ENTITY_HELD');object.scale.setScalar(3);expect(()=>physics.refresh('parcel')).toThrow('PHYSICS_ENTITY_HELD');object.scale.setScalar(2);
  expect(binding.isHeld).toBe(true);expect(binding.read().sizeMetersXYZ[0]).toBeCloseTo(.4);
 });
});


it('does not overwrite a held pose produced after ordinary physics preparation',async()=>{
 await RAPIER.init();const world=new RAPIER.World({x:0,y:-9.81,z:0}),physics=ThreePhysics.borrow({world});
 try{
  physics.addRigid('parcel',box(0,2,0,.2,.2,.2),{kind:'dynamic',shape:'box'});const host=physicsHost(physics),binding=host.interactionBody('parcel'),owner={};
  expect(binding.hold(owner)).toBe(true);host.prepareStep(dt,{});expect(binding.moveHeld(owner,new THREE.Vector3(2,3,1))).toBe(true);
  host.prepareSubstep(1);world.timestep=dt;world.step();host.finishStep();expect(physics.state('parcel')!.positionMetersXYZ).toEqual([2,3,1]);
 }finally{physics.dispose();world.free();}
});

it('retains a non-executable capability while an existing rigid group temporarily has no collision geometry',async()=>{
 const physics=await create(),root=new THREE.Group(),mesh=box(0,0,0,.2,.2,.2);root.position.y=2;root.add(mesh);physics.addRigid('prop',root,{kind:'dynamic',shape:'box'});
 const body=physicsHost(physics).interactionBody('prop');root.remove(mesh);physics.step(dt,{});
 expect(body.isValid).toBe(true);expect(body.read()).toMatchObject({entityEnabled:false,collisionEnabled:false});expect(body.hold({})).toBe(false);
 root.add(mesh);physics.step(dt,{});expect(body.isValid).toBe(true);expect(body.read()).toMatchObject({entityEnabled:true,collisionEnabled:true});
});
