import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createWorld, type ThreeWorld} from './world';
import type {WorldEngine} from './engine';
import type {WorldAssets} from './assets-library';
import type {AssetDefinition} from './engine-contracts';
import type {AssetInstance, CommandReceipt, WorldCommand} from './contracts';
import catalog from '../../../assets/three-creator/asset-catalog.json';

// Observe existing owners only. No production lifecycle API or second clock.
function engineOf(world: ThreeWorld) {return (world as unknown as {engine: WorldEngine}).engine;}
function queueLength(world: ThreeWorld) {return (world as unknown as {queued: unknown[]}).queued.length;}
function nativeCounts(world: ThreeWorld) {
  const native = (engineOf(world).physics as unknown as {world: RAPIER.World}).world;
  return {bodies: native.bodies.len(), colliders: native.colliders.len()};
}
const row = catalog.assets.find(asset => asset.id === 'humanoid.uefn-mannequin')!;
let serial = 0;
async function assetWorld() {
  const definition = {...row, uri: `https://entity-boundary.test/${++serial}/${row.sha256}.glb`} as unknown as AssetDefinition;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(await readFile(resolve(row.sourcePath)))));
  return createWorld({navigation: false, assetDefinitions: {[definition.id]: definition}});
}
function meshOf(asset: AssetInstance): THREE.SkinnedMesh {
  let mesh: THREE.SkinnedMesh | undefined;
  asset.object.traverse(node => {if (!mesh && (node as THREE.SkinnedMesh).isSkinnedMesh) mesh = node as THREE.SkinnedMesh;});
  if (!mesh) throw new Error('Expected real GLB skinned mesh');
  return mesh;
}
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

describe('entity registration rollback', () => {
  it.each(['rigid', 'asset-character'].flatMap(kind => [false, true].map(parented => ({kind, parented}))))(
    'restores both registries and native allocations after $kind binding fails, parented=$parented', async ({kind, parented}) => {
      const world = await assetWorld(), engine = engineOf(world);
      const asset = kind === 'asset-character' ? await world.assets.load(row.id) : undefined;
      const object = asset?.object ?? new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      object.position.set(4, 2, 3);
      const parent = new THREE.Group(); if (parented) {world.scene.add(parent); parent.add(object);}
      const originalParent = object.parent, originalPose = object.position.toArray();
      const sourceMesh = asset ? meshOf(asset) : object as THREE.Mesh;
      const material = vi.spyOn(sourceMesh.material as THREE.Material, 'dispose');
      const geometry = vi.spyOn(sourceMesh.geometry, 'dispose');
      const baseline = world.snapshot(), baselinePhysics = engine.physics.audit(), baselineNative = nativeCounts(world);
      const refresh = engine.physics.refreshMany.bind(engine.physics);
      let allocated: ReturnType<typeof nativeCounts> | undefined;
      const fault = new Error('AFTER_PHYSICS_BINDING');
      const injection = vi.spyOn(engine.physics, 'refreshMany').mockImplementationOnce(ids => {
        refresh(ids); allocated = nativeCounts(world); throw fault;
      });
      const register = () => asset
        ? world.addCharacter({id: 'candidate', asset})
        : world.addEntity({id: 'candidate', object, role: 'obstacle', physics: {kind: 'fixed', shape: 'box'}});
      try {
        expect(register).toThrow(fault);
        expect(allocated!.bodies).toBeGreaterThan(baselineNative.bodies);
        expect(allocated!.colliders).toBeGreaterThan(baselineNative.colliders);
        expect(world.snapshot()).toEqual(baseline);
        expect(engine.snapshot().entities).toEqual([]);
        expect(engine.physics.audit()).toEqual(baselinePhysics); expect(nativeCounts(world)).toEqual(baselineNative);
        expect(object.parent).toBe(originalParent); expect(object.position.toArray()).toEqual(originalPose);
        expect(material).not.toHaveBeenCalled(); expect(geometry).not.toHaveBeenCalled();
        if (asset) expect((world.assets as WorldAssets).owns(asset)).toBe(true);
        injection.mockRestore(); expect(register()).toBe(object);
        expect(world.snapshot().entities.filter(entity => entity.id === 'candidate')).toHaveLength(1);
        expect(engine.snapshot().entities.filter(entity => entity.id === 'candidate')).toHaveLength(1);
        expect(nativeCounts(world)).toEqual(allocated);
        expect(object.parent).toBe(parented ? parent : world.scene);
        world.dispose(); world.dispose();
        if (asset) {expect(material).toHaveBeenCalledOnce(); expect(geometry).toHaveBeenCalledOnce();}
        else {expect(material).not.toHaveBeenCalled(); expect(geometry).not.toHaveBeenCalled();}
      } finally {
        injection.mockRestore(); world.dispose();
        if (!asset) {sourceMesh.geometry.dispose(); (sourceMesh.material as THREE.Material).dispose();}
      }
    });
});

describe('stale entity identity at command commit', () => {
  it.each(['position', 'visibility', 'despawn'] as const)('rejects an old queued %s command after the ID is reused, while a fresh command works', async kind => {
    const world = await createWorld({navigation: false, assetDefinitions: {}});
    const original = new THREE.Group(), replacement = new THREE.Group(); replacement.position.set(7, 2, 4);
    world.addEntity({id: 'target', object: original, role: 'decoration'});
    const command: WorldCommand = kind === 'position'
      ? {type: 'entity.set-position', entityId: 'target', positionWorldMetersXYZ: [99, 0, 0]}
      : kind === 'visibility' ? {type: 'entity.set-visible', entityId: 'target', isVisible: false}
      : {type: 'entity.despawn', entityId: 'target'};
    try {
      await world.start();
      const old = world.execute(command);
      await vi.waitFor(() => expect(queueLength(world)).toBe(1));
      expect(world.simulationTick).toBe(0);
      world.stop();
      expect((await world.execute({type: 'entity.despawn', entityId: 'target'})).status).toBe('applied');
      world.addEntity({id: 'target', object: replacement, role: 'decoration'});
      const before = world.getEntityState('target');
      world.step({}, 1);
      expect(await old).toMatchObject({status: 'rejected', error: {code: 'STALE_ENTITY'}});
      expect(world.getEntityState('target')).toEqual(before); expect(original.parent).toBeNull(); expect(replacement.parent).toBe(world.scene);
      expect(queueLength(world)).toBe(0); expect(world.simulationTick).toBe(1); expect(world.isRunning).toBe(false);
      expect(world.snapshot().errors).toEqual([]);
      expect((await world.execute({type: 'entity.set-position', entityId: 'target', positionWorldMetersXYZ: [3, 2, 1]})).status).toBe('applied');
      expect(replacement.position.toArray()).toEqual([3, 2, 1]); expect(original.position.toArray()).toEqual([0, 0, 0]);
    } finally {world.dispose();}
  });

  it('releases only an abandoned GLB spawn when a new character takes its ID during asynchronous preparation', async () => {
    const world = await assetWorld(), library = world.assets as WorldAssets;
    let unblock!: () => void; const gate = new Promise<void>(resolveGate => {unblock = resolveGate;});
    let temporary: AssetInstance | undefined;
    let pendingWork: Promise<CommandReceipt> | undefined;
    try {
      const source = await library.load(row.id);
      await world.registerPrototype({id: 'actor-template', description: 'real GLB fixture', template: {kind: 'character', options: {asset: source}}});
      await world.start();
      const clone = library.clone.bind(library);
      const deferred = vi.spyOn(library, 'clone').mockImplementationOnce(async asset => {
        temporary = await clone(asset); await gate; return temporary;
      });
      const pending = pendingWork = world.execute({type: 'entity.spawn', prototypeId: 'actor-template', entityId: 'spawned', positionWorldMetersXYZ: [8, 1, 0]});
      await vi.waitFor(() => expect(temporary).toBeDefined());
      const abandonedMesh = meshOf(temporary!), abandonedMaterial = vi.spyOn(abandonedMesh.material as THREE.Material, 'dispose');
      const replacement = await clone(source), liveMesh = meshOf(replacement);
      const liveMaterial = vi.spyOn(liveMesh.material as THREE.Material, 'dispose'), shared = vi.spyOn(liveMesh.geometry, 'dispose');
      replacement.object.position.set(4, 1, 0); world.addCharacter({id: 'spawned', asset: replacement});
      const before = world.getEntityState('spawned');
      unblock();
      // Preparation may reject before queueing; wait for either real outcome.
      let settled = false; const receipt = pending.then(value => {settled = true; return value;});
      await vi.waitFor(() => expect(settled || queueLength(world) === 1).toBe(true));
      if (!settled) world.step({}, 1);
      const result = await receipt; expect(result).toMatchObject({status: 'rejected'});
      if (result.status !== 'rejected') throw new Error('Expected conflicting spawn rejection');
      expect(result.error.message).toContain('WORLD_ENTITY_DUPLICATE');
      expect(abandonedMaterial).toHaveBeenCalledOnce(); expect(library.owns(temporary!)).toBe(false);
      expect(library.owns(replacement)).toBe(true); expect(liveMaterial).not.toHaveBeenCalled(); expect(shared).not.toHaveBeenCalled();
      // Use position/identity rather than a full snapshot: a deliberate step can apply gravity.
      expect(world.getEntityState('spawned').id).toBe(before.id); expect(replacement.object.parent).toBe(world.scene);
      expect(replacement.object.position.x).toBe(4); expect(engineOf(world).snapshot().entities.filter(entity => entity.id === 'spawned')).toHaveLength(1);
      expect(engineOf(world).physics.audit().entities.filter(entity => entity.id === 'spawned')).toHaveLength(1);
      deferred.mockRestore(); world.stop(); world.dispose();
      expect(liveMaterial).toHaveBeenCalledOnce(); expect(shared).toHaveBeenCalledOnce(); expect(abandonedMaterial).toHaveBeenCalledOnce();
    } finally {unblock(); world.dispose(); await pendingWork;}
  });
});
