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
import catalog from '@worldkit/asset-library/catalog';

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
  it.each(['position', 'visibility', 'despawn', 'destroy'] as const)('rejects an old queued %s command after the ID is reused, while a fresh command works', async kind => {
    const world = await createWorld({navigation: false, assetDefinitions: {}});
    const original = new THREE.Group(), replacement = new THREE.Group(); replacement.position.set(7, 2, 4);
    world.addEntity({id: 'target', object: original, role: 'decoration'});
    const command: WorldCommand = kind === 'position'
      ? {type: 'entity.set-position', entityId: 'target', positionWorldMetersXYZ: [99, 0, 0]}
      : kind === 'visibility' ? {type: 'entity.set-visible', entityId: 'target', isVisible: false}
      : {type: kind === 'destroy' ? 'entity.destroy' : 'entity.despawn', entityId: 'target'};
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


describe('explicit instance destruction', () => {
  it('releases only the destroyed GLB instance and its collider, preserves its peer and the ordinary reset path', async () => {
    const world = await assetWorld();
    try {
      const first = await world.assets.load(row.id), second = await world.assets.load(row.id);
      const firstMesh = meshOf(first), secondMesh = meshOf(second);
      const firstMaterial = vi.spyOn(firstMesh.material as THREE.Material, 'dispose');
      const secondMaterial = vi.spyOn(secondMesh.material as THREE.Material, 'dispose');
      const geometry = vi.spyOn(firstMesh.geometry, 'dispose');
      expect(firstMesh.geometry).toBe(secondMesh.geometry);
      first.object.position.x = -3; second.object.position.x = 3;
      world.addCharacter({id:'first',asset:first});
      world.addCharacter({id:'second',asset:second});
      await world.start(); world.stop(); const counts=nativeCounts(world);
      expect((await world.execute({type:'entity.destroy',entityId:'first'})).status).toBe('applied');
      expect(world.assets.owns(first)).toBe(false); expect(world.assets.owns(second)).toBe(true);
      expect(firstMaterial).toHaveBeenCalledOnce(); expect(secondMaterial).not.toHaveBeenCalled(); expect(geometry).not.toHaveBeenCalled();
      expect(nativeCounts(world)).toEqual({bodies:counts.bodies-1,colliders:counts.colliders-1});
      expect((await world.execute({type:'entity.despawn',entityId:'second'})).status).toBe('applied');
      await world.reset(); expect(world.snapshot().entities.map(e=>e.id)).toEqual(['second']);
      expect(second.object.parent).toBe(world.scene); expect(first.object.parent).toBeNull();
      expect((await world.execute({type:'entity.destroy',entityId:'first'})).status).toBe('rejected');
      expect((await world.execute({type:'entity.destroy',entityId:'second'})).status).toBe('applied');
      expect(secondMaterial).toHaveBeenCalledOnce(); expect(geometry).toHaveBeenCalledOnce();
      await world.reset(); expect(world.snapshot().entities).toEqual([]);
      const fresh=await world.assets.load(row.id);expect(meshOf(fresh).geometry).not.toBe(firstMesh.geometry);
      world.dispose(); expect(firstMaterial).toHaveBeenCalledOnce();expect(secondMaterial).toHaveBeenCalledOnce();expect(geometry).toHaveBeenCalledOnce();
    } finally {world.dispose();}
  });

  it('destroys an asset character without breaking a cloned prototype or its next spawn', async () => {
    const world=await assetWorld();
    try {
      const asset=await world.assets.load(row.id);world.addCharacter({id:'npc',asset});
      await world.registerPrototype({id:'npc-template',description:'independent asset lease',template:{kind:'character',options:{asset}}});
      await world.start();world.stop();
      expect((await world.execute({type:'entity.destroy',entityId:'npc'})).status).toBe('applied');
      await world.reset();expect(world.snapshot().entities).toEqual([]);
      expect((await world.execute({type:'entity.spawn',prototypeId:'npc-template',entityId:'fresh',positionWorldMetersXYZ:[0,2,0]})).status).toBe('applied');
      expect(world.getEntityState('fresh').animation?.actionId).toBe('idle');world.step({},2);expect(world.snapshot().errors).toEqual([]);
    } finally {world.dispose();}
  });

  it('transfers task-loaded decoration ownership, removes descendants and cancels their pending transitions', async () => {
    const world=await assetWorld();let asset!:AssetInstance;
    try {
      await world.runTask(async scope=>{asset=await scope.assets.load(row.id);scope.addEntity({id:'model',object:asset.object,role:'decoration'});});
      expect(world.assets.owns(asset)).toBe(true);
      const parent=new THREE.Group();world.addEntity({id:'parent',object:parent,role:'decoration'});
      await world.execute({type:'entity.attach',childEntityId:'model',parentEntityId:'parent',positionLocalMetersXYZ:[0,0,0]});
      const move=await world.execute({type:'entity.set-position',entityId:'model',positionWorldMetersXYZ:[5,0,0],durationSeconds:3});
      expect(move.status).toBe('accepted');
      expect((await world.execute({type:'entity.destroy',entityId:'parent'})).status).toBe('applied');
      expect(world.assets.owns(asset)).toBe(false);expect(world.snapshot().entities).toEqual([]);
      world.step({},5);expect(world.snapshot().errors).toEqual([]);
      if(move.status==='accepted')expect(world.operations.get(move.operationId)?.status).toBe('cancelled');
    } finally {world.dispose();}
  });

  it('rejects destruction of a controlled subtree without releasing assets', async () => {
    const world=await assetWorld();
    try {
      const asset=await world.assets.load(row.id);const parent=new THREE.Group();parent.add(asset.object);
      world.addEntity({id:'parent',object:parent,role:'decoration'});world.addCharacter({id:'player',asset});world.setControlledEntity('player');
      expect(await world.execute({type:'entity.destroy',entityId:'parent'})).toMatchObject({status:'rejected',error:{code:'CONTROLLED_ENTITY_CANNOT_DESPAWN'}});
      expect(world.assets.owns(asset)).toBe(true);expect(world.snapshot().entities).toHaveLength(2);
    } finally {world.dispose();}
  });

  it('finishes sibling cleanup after a disposer throws and reports the committed failure', async () => {
    const world=await assetWorld();
    try {
      const a=await world.assets.load(row.id),b=await world.assets.load(row.id),parent=new THREE.Group();parent.add(a.object,b.object);
      world.addEntity({id:'parent',object:parent,role:'decoration'});
      const geometry=vi.spyOn(meshOf(a).geometry,'dispose');
      (meshOf(a).material as THREE.Material).addEventListener('dispose',()=>{throw Error('DISPOSE_LISTENER_FIXTURE');});
      const result=await world.execute({type:'entity.destroy',entityId:'parent'});
      expect(result.status).toBe('accepted');if(result.status==='accepted')expect(world.operations.get(result.operationId)).toMatchObject({status:'failed'});
      expect(world.assets.owns(a)).toBe(false);expect(world.assets.owns(b)).toBe(false);expect(geometry).toHaveBeenCalledOnce();
      expect(world.snapshot().entities).toEqual([]);await world.reset();expect(world.snapshot().entities).toEqual([]);
    } finally {world.dispose();}
  });
});


it('keeps an asset-backed entity prototype lease after source destruction and releases each spawned instance independently', async () => {
 const world=await assetWorld();
 try {
  const source=await world.assets.load(row.id,{loadTextures:true});const mesh=meshOf(source),geometry=vi.spyOn(mesh.geometry,'dispose');
  const texture=(mesh.material as THREE.MeshStandardMaterial).map!;expect(texture).toBeTruthy();const textureDispose=vi.spyOn(texture,'dispose');
  world.addEntity({id:'source',role:'decoration',object:source.object});
  await world.registerPrototype({id:'visual-template',description:'asset visual',template:{kind:'entity',options:{role:'decoration',object:source.object}}});
  expect((await world.execute({type:'entity.destroy',entityId:'source'})).status).toBe('applied');
  expect(textureDispose).not.toHaveBeenCalled();expect(geometry).not.toHaveBeenCalled();
  for(const id of ['one','two'])expect((await world.execute({type:'entity.spawn',prototypeId:'visual-template',entityId:id,positionWorldMetersXYZ:[0,0,0]})).status).toBe('applied');
  const [one]=world.assets.within(world.scene).filter(asset=>asset.object!==source.object);expect(one).toBeDefined();
  expect((await world.execute({type:'entity.destroy',entityId:'one'})).status).toBe('applied');
  expect(textureDispose).not.toHaveBeenCalled();expect(world.snapshot().entities.map(e=>e.id)).toEqual(['two']);
  world.dispose();expect(textureDispose).toHaveBeenCalledOnce();expect(geometry).toHaveBeenCalledOnce();
 } finally {world.dispose();}
});


it('suspends one real actor input, animation and collider while its peer advances, then resumes without duplicate bodies',async()=>{
 const world=await assetWorld();const floor=new THREE.Mesh(new THREE.BoxGeometry(30,1,30),new THREE.MeshBasicMaterial());floor.position.y=-.5;
 try{
  world.addEntity({id:'floor',object:floor,role:'terrain'});
  const a=await world.assets.load(row.id),b=await world.assets.load(row.id);b.object.position.x=4;
  world.addCharacter({id:'a',asset:a});world.addCharacter({id:'b',asset:b});world.setControlledEntity('a');
  world.camera.position.set(0,6,8);world.camera.lookAt(0,1,0);world.step({},40);
  await world.execute({type:'entity.play-action',entityId:'b',actionId:'walk',playback:'loop'});
  world.step({moveZRatio:-1,run:true},20);expect(world.getEntityState('a').positionWorldMetersXYZ[2]).toBeLessThan(-.2);
  const allocations=nativeCounts(world);const updateA=vi.spyOn(world.assets.internal(a),'update');
  expect((await world.execute({type:'entity.set-active',entityId:'a',isActive:false})).status).toBe('applied');
  const frozen=world.getEntityState('a'),peerTime=world.getEntityState('b').animation!.timeSeconds;updateA.mockClear();
  world.step({moveZRatio:-1,run:true,jump:true},30);
  expect(world.getEntityState('a').isActive).toBe(false);expect(world.getEntityState('a').positionWorldMetersXYZ).toEqual(frozen.positionWorldMetersXYZ);
  expect(world.getEntityState('a').animation).toEqual(frozen.animation);expect(updateA).not.toHaveBeenCalled();
  expect(world.getEntityState('b').animation!.timeSeconds).not.toBe(peerTime);expect(nativeCounts(world)).toEqual(allocations);
  expect(await world.execute({type:'entity.play-action',entityId:'a',actionId:'walk'})).toMatchObject({status:'rejected',error:{code:'ENTITY_INACTIVE'}});
  for(let i=0;i<4;i++){await world.execute({type:'entity.set-active',entityId:'a',isActive:true});await world.execute({type:'entity.set-active',entityId:'a',isActive:false});}
  await world.execute({type:'entity.set-active',entityId:'a',isActive:true});world.step({moveZRatio:-1},30);
  expect(world.getEntityState('a').isActive).toBe(true);expect(world.getEntityState('a').positionWorldMetersXYZ[2]).toBeLessThan(frozen.positionWorldMetersXYZ[2]-.3);expect(nativeCounts(world)).toEqual(allocations);
  world.clearControlledEntity();expect((await world.execute({type:'entity.destroy',entityId:'a'})).status).toBe('applied');
  expect(world.assets.owns(a)).toBe(false);expect(world.assets.owns(b)).toBe(true);world.step({},2);expect(world.snapshot().errors).toEqual([]);
 }finally{world.dispose();floor.geometry.dispose();(floor.material as THREE.Material).dispose();}
});

it('freezes subtree transitions, respects a separately disabled child and restores activation from the reset baseline',async()=>{
 const world=await createWorld({navigation:false,assetDefinitions:{}});const parent=new THREE.Group(),child=new THREE.Group();parent.add(child);
 try{
  world.addEntity({id:'p',object:parent,role:'decoration'});world.addEntity({id:'c',object:child,role:'decoration'});
  await world.execute({type:'entity.set-active',entityId:'c',isActive:false});await world.start();world.stop();
  await world.execute({type:'entity.set-active',entityId:'p',isActive:false});await world.execute({type:'entity.set-active',entityId:'p',isActive:true});expect(world.getEntityState('c').isActive).toBe(false);
  await world.execute({type:'entity.set-active',entityId:'c',isActive:true});const move=await world.execute({type:'entity.set-position',entityId:'c',positionWorldMetersXYZ:[3,0,0],durationSeconds:2});expect(move.status).toBe('accepted');world.step({},5);
  await world.execute({type:'entity.set-active',entityId:'p',isActive:false});const at=world.getEntityState('c').positionWorldMetersXYZ;world.step({},15);expect(world.getEntityState('c').positionWorldMetersXYZ).toEqual(at);
  await world.execute({type:'entity.set-active',entityId:'p',isActive:true});world.step({},10);expect(world.getEntityState('c').positionWorldMetersXYZ[0]).toBeGreaterThan(at[0]);
  await world.reset();expect(world.getEntityState('p').isActive).toBe(true);expect(world.getEntityState('c').isActive).toBe(false);
 }finally{world.dispose();}
});


it('removes disabled collision from real character movement and queries without interrupting another controlled actor',async()=>{
 const world=await assetWorld(),floor=new THREE.Mesh(new THREE.BoxGeometry(30,1,30),new THREE.MeshBasicMaterial()),wall=new THREE.Mesh(new THREE.BoxGeometry(12,2,1),new THREE.MeshBasicMaterial());
 floor.position.y=-.5;wall.position.y=1;
 try{
  world.addEntity({id:'floor',object:floor,role:'terrain'});world.addEntity({id:'wall',object:wall,role:'obstacle',physics:{kind:'fixed',shape:'box'}});
  const asset=await world.assets.load(row.id);asset.object.position.z=4;world.addCharacter({id:'actor',asset});world.setControlledEntity('actor');
  world.camera.position.set(0,6,8);world.camera.lookAt(0,1,0);world.step({},30);world.step({moveZRatio:-1,run:true},80);
  expect(world.getEntityState('actor').positionWorldMetersXYZ[2]).toBeGreaterThan(.5);
  const engine=engineOf(world),clear=vi.spyOn(engine,'clearInput'),probe=()=>engine.physics.probe([2,1,4],[0,0,-1],10);
  expect(probe()?.entityId).toBe('wall');
  await world.execute({type:'entity.set-active',entityId:'wall',isActive:false});expect(probe()).toBeNull();expect(clear).not.toHaveBeenCalled();
  world.step({moveZRatio:-1,run:true},40);expect(world.getEntityState('actor').positionWorldMetersXYZ[2]).toBeLessThan(-1);
  await world.execute({type:'entity.set-active',entityId:'wall',isActive:true});expect(probe()?.entityId).toBe('wall');expect(clear).not.toHaveBeenCalled();
  await world.execute({type:'entity.set-active',entityId:'actor',isActive:false});expect(clear).toHaveBeenCalledOnce();
  await world.execute({type:'entity.set-active',entityId:'actor',isActive:false});expect(clear).toHaveBeenCalledOnce();
 }finally{world.dispose();for(const mesh of [floor,wall]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}}
});
