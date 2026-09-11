import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createWorld, type WorldEngine} from './engine.js';
import {ThreePhysics} from './physics.js';
import {ThreeNavigation} from './navigation.js';
import {HumanoidRuntime, type HumanoidRuntimeOptions} from './humanoid-runtime/runtime.js';
import {compileBoundaryBoxes, type BoundaryDefinition} from './boundaries.js';
import {createWorld as createPublicWorld, type WorldObservation} from './index.js';

const worlds: WorldEngine[] = [], physicsInstances: ThreePhysics[] = [];
const rectangle: BoundaryDefinition = {id: 'yard', shape: 'rectangle', minimumXZ: [-3, -3], maximumXZ: [3, 3], bottomMeters: -1, topMeters: 4, thicknessMeters: .2};
const wall: BoundaryDefinition = {id: 'divider', shape: 'polyline', pointsXZ: [[2, -4], [2, 4]], bottomMeters: -1, topMeters: 3, thicknessMeters: .4};
function box(position: readonly [number, number, number], size: readonly [number, number, number]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial()); mesh.position.fromArray(position); return mesh;
}
function actor(position: readonly [number, number, number]) { const object = new THREE.Group(); object.position.fromArray(position); return object; }
async function world(options: Parameters<typeof createWorld>[0]) { const value = await createWorld(options); worlds.push(value); return value; }
afterEach(() => { for (const value of worlds.splice(0)) value.dispose(); for (const value of physicsInstances.splice(0)) value.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('generic world physical boundaries', () => {
  it('forwards public createWorld boundaries without enlarging Episode bounds or exposing capture targets', async () => {
    const windowTarget = new EventTarget();
    const documentTarget = Object.assign(new EventTarget(), {defaultView: windowTarget, activeElement: null, body: {}, documentElement: {}, hidden: false});
    Object.assign(windowTarget, {document: documentTarget}); vi.stubGlobal('window', windowTarget);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const canvas = Object.assign(new EventTarget(), {width: 320, height: 180, ownerDocument: documentTarget,
      getAttribute: () => null, removeAttribute: () => {}, setAttribute: () => {},
      style: {getPropertyValue: () => '', getPropertyPriority: () => '', setProperty: () => {}, removeProperty: () => {}}});
    const renderer = {domElement: canvas, render: vi.fn(), shadowMap: {enabled: false, type: THREE.PCFShadowMap, needsUpdate: false}} as unknown as THREE.WebGLRenderer;
    const value = await createPublicWorld({renderer, navigation: false, assetDefinitions: {},
      boundaries: [{...rectangle, minimumXZ: [-20, -20], maximumXZ: [20, 20]}]});
    try {
      value.addEntity({id: 'floor', role: 'terrain', object: box([0, -.1, 0], [4, .2, 4]), physics: {kind: 'fixed', shape: 'box'}});
      value.addCharacter({id: 'player', object: actor([0, .04, 0]), body: {heightMeters: 1.8, radiusMeters: .35}});
      value.setControlledEntity('player'); value.setCaptureTargets(['player']); await value.start();
      const observation = (windowTarget as unknown as {__WORLDKIT_EVAL__: WorldObservation}).__WORLDKIT_EVAL__;
      expect(observation.ready).toBe(true); expect(Object.keys(observation.targets)).toEqual(['player']);
      expect(observation.snapshot!().entities.map(entity => entity.id)).toEqual(['floor', 'player']);
      const inspected = observation.inspect!() as {physics: {entities: {id: string}[]}};
      expect(inspected.physics.entities.filter(entity => entity.id.startsWith('yard:segment-'))).toHaveLength(4);
      for (const axis of [0, 2]) {
        expect(observation.episode!.capabilities().worldBounds.minimumWorldMetersXYZ[axis]).toBeCloseTo(-2);
        expect(observation.episode!.capabilities().worldBounds.maximumWorldMetersXYZ[axis]).toBeCloseTo(2);
      }
      expect(value.scene.children).toHaveLength(2);
      await value.reset(); expect(Object.keys(observation.targets)).toEqual(['player']);
      expect((observation.inspect!() as {physics: {entities: {id: string}[]}}).physics.entities.filter(entity => entity.id.startsWith('yard:segment-'))).toHaveLength(4);
    } finally { value.dispose(); }
  });

  it('blocks the controlled actor, another actor and a dynamic body without adding visible entities, and survives reset', async () => {
    const value = await world({navigation: false, boundaries: [rectangle]});
    expect(value.scene.children).toHaveLength(0); expect(value.snapshot().entities).toEqual([]);
    expect(new THREE.Box3().setFromObject(value.scene).isEmpty()).toBe(true);
    expect(value.physics.audit()).toMatchObject({entityCount: 4, triangleCount: 0});
    value.addEntity({id: 'floor', object: box([0, -.1, 0], [14, .2, 14]), role: 'terrain', physics: {kind: 'fixed', shape: 'box'}});
    value.addCharacter({id: 'player', object: actor([-1, .04, -1])});
    value.addCharacter({id: 'npc', object: actor([-1, .04, 1])});
    value.addEntity({id: 'crate', object: box([-1, .4, 0], [.6, .6, .6]), physics: {kind: 'dynamic', shape: 'box', frictionRatio: 0}});
    value.setControlledEntity('player');
    value.setDriveProvider(() => ({drive: {velocityMetersPerSecondXZ: [3, 0]}}));
    value.physics.applyImpulse('crate', [10, 0, 0]); value.step({}, 180);
    for (const id of ['player', 'npc', 'crate']) {
      const state = value.physics.state(id)!;
      expect(state.positionMetersXYZ[0]).toBeGreaterThan(2.2);
      expect(state.positionMetersXYZ[0]).toBeLessThan(2.8);
      expect(state.positionMetersXYZ[1]).toBeGreaterThan(-.05);
    }
    expect(value.physics.state('player')!.collisionEntityIds).toContain('yard:segment-1');
    expect(value.physics.state('npc')!.collisionEntityIds).toContain('yard:segment-1');
    expect(value.scene.children).toHaveLength(4);
    expect(value.snapshot().entities.map(entity => entity.id)).toEqual(['floor', 'player', 'npc', 'crate']);
    const colliderCount = value.physics.audit().colliderCount;
    for (let i = 0; i < 3; i++) {
      value.reset(); expect(value.physics.audit().colliderCount).toBe(colliderCount);
      expect(value.physics.state('player')!.positionMetersXYZ[0]).toBeCloseTo(-1);
      value.step({}, 120);
      expect(value.physics.state('player')!.positionMetersXYZ[0]).toBeLessThan(2.8);
    }
    value.dispose(); expect(() => value.physics.audit()).toThrow('PHYSICS_DISPOSED');
    expect(() => value.dispose()).not.toThrow();
  });

  it.each([false, true])('keeps boundary collision independent of invisible geometry and blocksCamera=%s through query lifecycle', async blocksCamera => {
    const value = await world({navigation: false, boundaries: [{...wall, blocksCamera}]});
    const verify = () => {
      expect(value.physics.probe([0, 1, 0], [1, 0, 0], 6)?.entityId).toBe('divider:segment-0');
      const hit = value.physics.castCameraArm([0, 1, 0], [6, 1, 0], .1);
      if (blocksCamera) {
        expect(hit.colliderEntityId).toBe('divider:segment-0'); expect(hit.distanceMeters).toBeCloseTo(1.7, 2);
      } else expect(hit).toEqual({distanceMeters: 6});
      expect(value.scene.children).toEqual([]); expect(value.snapshot().entities).toEqual([]);
    };
    verify(); value.step(); verify(); value.physics.reset(); verify(); value.step(); verify(); value.reset(); verify();
    if (!blocksCamera) {
      const ordinary = box([4, 1, 0], [1, 2, 2]); value.addEntity({id: 'ordinary', object: ordinary, role: 'obstacle', physics: {kind: 'fixed', shape: 'box'}});
      expect(value.physics.castCameraArm([0, 1, 0], [6, 1, 0], .1).colliderEntityId).toBe('ordinary');
      ordinary.visible = false;
      expect(value.physics.castCameraArm([0, 1, 0], [6, 1, 0], .1)).toEqual({distanceMeters: 6});
      expect(value.physics.probe([0, 1, 0], [1, 0, 0], 6)?.entityId).toBe('divider:segment-0');
    }
  });

  it('uses the compiled Euler pose for a diagonal boundary and keeps it through physics reset', async () => {
    const compiled = compileBoundaryBoxes([{...wall, pointsXZ: [[-2, -2], [2, 2]], blocksCamera: true}]);
    const physics = await ThreePhysics.create({}, compiled); physicsInstances.push(physics);
    const verify = () => {
      const hit = physics.probe([1.5, 1, -.5], [-1, 0, 1], 4)!;
      expect(hit.entityId).toBe('divider:segment-0'); expect(hit.distanceMeters).toBeCloseTo(Math.sqrt(2) - .2, 3);
      expect(Math.abs(hit.normalWorldXYZ[0])).toBeCloseTo(Math.SQRT1_2, 3);
      expect(Math.abs(hit.normalWorldXYZ[2])).toBeCloseTo(Math.SQRT1_2, 3);
    };
    verify(); physics.step(1 / 60, {}); verify(); physics.reset(); verify();
    expect(physics.audit().triangleCount).toBe(0);
  });

  it('keeps native boundary ownership on an entity id conflict and releases a failed initialization', async () => {
    const value = await world({navigation: false, boundaries: [wall]});
    const collision = value.physics.probe([0, 1, 0], [1, 0, 0], 6);
    const object = box([0, 1, 0], [1, 1, 1]);
    expect(() => value.addEntity({id: 'divider:segment-0', object, role: 'obstacle'})).toThrow('WORLD_ENTITY_DUPLICATE');
    expect(object.parent).toBeNull(); expect(value.physics.probe([0, 1, 0], [1, 0, 0], 6)).toEqual(collision);
    const dispose = vi.spyOn(ThreePhysics.prototype, 'dispose');
    await expect(createWorld({navigation: false, boundaries: [wall], physics: {maximumColliderCount: 1}})).rejects.toThrow('PHYSICS_COLLIDER_BUDGET_EXCEEDED');
    expect(dispose).toHaveBeenCalledTimes(1);
    await expect(createWorld({boundaries: null as unknown as BoundaryDefinition[]})).rejects.toThrow('BOUNDARY_INVALID');
  });

  it('rejects top-level boundaries with Humanoid before creating a second physics owner', async () => {
    const createHumanoid = vi.spyOn(HumanoidRuntime, 'create');
    await expect(createWorld({humanoid: {} as HumanoidRuntimeOptions, boundaries: []})).rejects.toThrow('WORLD_HUMANOID_BOUNDARIES_LOCATION');
    expect(createHumanoid).not.toHaveBeenCalled();
  });

  it('plans and executes an NPC route around the same invisible boundary, without retaining navigation meshes', async () => {
    const value = await world({boundaries: [{...wall, pointsXZ: [[0, -3], [0, 3]]}]});
    value.addEntity({id: 'floor', object: box([0, -.2, 0], [14, .4, 14]), role: 'terrain', physics: {kind: 'fixed', shape: 'box'}});
    value.addCharacter({id: 'npc', object: actor([-4, .04, 0])}); value.step({}, 30);
    const rebuild = vi.spyOn(ThreeNavigation.prototype, 'rebuild');
    expect(value.execute({type: 'actor.move-to', entityId: 'npc', targetPositionMetersXYZ: [4, 0, 0], run: true}).status).toBe('applied');
    let detour = 0;
    for (let i = 0; i < 450; i++) { value.step(); detour = Math.max(detour, Math.abs(value.physics.state('npc')!.positionMetersXYZ[2])); }
    expect(detour).toBeGreaterThan(3.3);
    expect(new THREE.Vector3(...value.physics.state('npc')!.positionMetersXYZ).distanceTo(new THREE.Vector3(4, 0, 0))).toBeLessThan(.6);
    expect(rebuild).toHaveBeenCalledTimes(1); expect(rebuild.mock.calls[0]![0]).toHaveLength(2);
    expect(value.scene.children).toHaveLength(2); expect(value.snapshot().errors).toEqual([]);
  });

  it('disposes temporary boundary navigation geometry and material when a rebuild fails', async () => {
    const value = await world({boundaries: [rectangle]});
    value.addEntity({id: 'floor', object: box([0, -.2, 0], [14, .4, 14]), role: 'terrain', physics: {kind: 'fixed', shape: 'box'}});
    value.addCharacter({id: 'npc', object: actor([0, .04, 0])}); value.step({}, 30);
    vi.spyOn(ThreeNavigation.prototype, 'rebuild').mockImplementationOnce(() => { throw new Error('TEST_NAVIGATION_BUILD_FAILED'); });
    const geometryDispose = vi.spyOn(THREE.BoxGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.MeshBasicMaterial.prototype, 'dispose');
    expect(value.execute({type: 'actor.move-to', entityId: 'npc', targetPositionMetersXYZ: [1, 0, 0]})).toMatchObject({status: 'rejected', error: {message: 'TEST_NAVIGATION_BUILD_FAILED'}});
    expect(geometryDispose).toHaveBeenCalledTimes(4); expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(value.scene.children).toHaveLength(2);
    expect(value.physics.probe([0, 1, .5], [1, 0, 0], 5, 'npc')?.entityId).toBe('yard:segment-1');
  });
});
