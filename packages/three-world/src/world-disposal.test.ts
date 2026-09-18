import {ThreeNavigation} from './navigation';
import {ThreePhysics} from './physics';
import {WorldAssets} from './assets-library';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createWorld, type ThreeWorld} from './world';
import {setObjectColor} from './object-color';
import {createWorld as createEngine, WorldEngine} from './engine';
import type {AssetDefinition} from './engine-contracts';
import type {AssetInstance} from './contracts';
import catalog from '../../../assets/three-creator/asset-catalog.json';

// Only the GPU boundary is replaced. Geometry, GLB decoding, asset ownership,
// Rapier, camera disposal and lifecycle scheduling use the real implementation.
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return {...actual, WebGLRenderer: vi.fn()};
});
const renderer = () => ({dispose: vi.fn(), render: vi.fn()});
beforeEach(() => vi.mocked(THREE.WebGLRenderer).mockImplementation(function () {
  return renderer() as unknown as THREE.WebGLRenderer;
}));
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

// Internal observation only: no production API is added for test access.
function engineOf(world: ThreeWorld): WorldEngine {
  return (world as unknown as {engine: WorldEngine}).engine;
}
function frameClock() {
  let next = 0;
  const pending = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {pending.set(++next, callback); return next;});
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
  return pending;
}
async function ownedGeometry(world: ThreeWorld, id = 'shape') {
  const source = new THREE.BoxGeometry();
  const clone = vi.spyOn(source, 'clone');
  await world.registerGeometry({id, description: 'disposal fixture', geometry: source});
  const owned = clone.mock.results[0]!.value as THREE.BufferGeometry;
  clone.mockRestore();
  return {source, owned};
}
const row = catalog.assets.find(asset => asset.id === 'humanoid.uefn-mannequin')!;
let assetSequence = 0;
async function assetWorld() {
  const definition = {...row, uri: `https://disposal.test/${++assetSequence}/${row.sha256}.glb`} as unknown as AssetDefinition;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(await readFile(resolve(row.sourcePath)))));
  return createWorld({navigation: false, assetDefinitions: {[definition.id]: definition}});
}
function meshOf(instance: AssetInstance): THREE.SkinnedMesh {
  let mesh: THREE.SkinnedMesh | undefined;
  instance.object.traverse(node => {if (!mesh && (node as THREE.SkinnedMesh).isSkinnedMesh) mesh = node as THREE.SkinnedMesh;});
  if (!mesh) throw new Error('Expected a real skinned GLB mesh');
  return mesh;
}

describe('disposal ownership and ordering baseline', () => {
  it('stops frames and input before callbacks, isolates callback errors, and leaves a borrowed renderer usable', async () => {
    const frames = frameClock(), borrowed = renderer();
    const engine = await createEngine({navigation: false, renderer: borrowed as unknown as THREE.WebGLRenderer});
    const order: string[] = [];
    const cameraDispose = engine.cameraController.dispose.bind(engine.cameraController);
    const physicsDispose = engine.physics.dispose.bind(engine.physics);
    const camera = vi.spyOn(engine.cameraController, 'dispose').mockImplementation(() => {order.push('camera'); cameraDispose();});
    const physics = vi.spyOn(engine.physics, 'dispose').mockImplementation(() => {order.push('physics'); physicsDispose();});
    engine.onDispose(() => {
      expect(engine.isRunning).toBe(false); expect(engine.keyboard.enabled).toBe(false); expect(frames.size).toBe(0);
      order.push('first callback'); engine.dispose(); throw new Error('CALLBACK_FAILURE');
    });
    engine.onDispose(() => order.push('second callback'));
    try {
      engine.start(); engine.keyboard.keyDown('KeyW'); const stale = [...frames.values()][0]!;
      engine.dispose(); engine.dispose(); stale(1000);
      expect(order).toEqual(['first callback', 'second callback', 'camera', 'physics']);
      expect(camera).toHaveBeenCalledOnce(); expect(physics).toHaveBeenCalledOnce(); expect(frames.size).toBe(0);
      expect(engine.keyboard.sample().moveZRatio).toBe(0); expect(engine.simulationTick).toBe(0);
      expect(borrowed.dispose).not.toHaveBeenCalled(); borrowed.render(); expect(borrowed.render).toHaveBeenCalledOnce();
      expect(engine.snapshot().errors).toEqual(expect.arrayContaining([expect.objectContaining({code: 'WORLD_DISPOSE_FAILED'})]));
    } finally {engine.dispose(); borrowed.dispose();}
  });

  it('releases an engine-created renderer once, after physics', async () => {
    const engine = await createEngine({navigation: false, canvas: {} as HTMLCanvasElement});
    const order: string[] = [];
    const physicsDispose = engine.physics.dispose.bind(engine.physics);
    vi.spyOn(engine.physics, 'dispose').mockImplementation(() => {order.push('physics'); physicsDispose();});
    const gpuDispose = vi.mocked(engine.renderer!.dispose).mockImplementation(() => {order.push('renderer');});
    try {
      expect(THREE.WebGLRenderer).toHaveBeenCalledWith(expect.objectContaining({preserveDrawingBuffer: true}));
      engine.dispose(); engine.dispose();
      expect(order).toEqual(['physics', 'renderer']); expect(gpuDispose).toHaveBeenCalledOnce();
    } finally {engine.dispose();}
  });

  it('releases the engine before the asset library and owned geometry, then invokes public callbacks', async () => {
    const world = await createWorld({navigation: false, assetDefinitions: {}}), engine = engineOf(world);
    const {source, owned} = await ownedGeometry(world), sourceDispose = vi.spyOn(source, 'dispose');
    const order: string[] = [];
    const physicsDispose = engine.physics.dispose.bind(engine.physics), assetsDispose = world.assets.dispose.bind(world.assets);
    vi.spyOn(engine.physics, 'dispose').mockImplementation(() => {order.push('physics'); physicsDispose();});
    vi.spyOn(world.assets, 'dispose').mockImplementation(() => {order.push('asset library'); assetsDispose();});
    engine.onDispose(() => order.push('engine callback'));
    owned.addEventListener('dispose', () => {order.push('owned geometry');});
    world.onDispose(() => {order.push('public callback'); world.dispose();});
    try {
      world.dispose(); world.dispose();
      expect(order).toEqual(['engine callback', 'physics', 'asset library', 'owned geometry', 'public callback']);
      expect(sourceDispose).not.toHaveBeenCalled();
    } finally {world.dispose(); source.dispose();}
  });

  it('keeps a despawned baseline asset available for reset and frees shared GLB resources only after the last owner', async () => {
    const world = await assetWorld();
    try {
      const original = await world.assets.load(row.id), clone = await world.assets.clone(original);
      const originalMesh = meshOf(original), cloneMesh = meshOf(clone);
      expect(cloneMesh.geometry).toBe(originalMesh.geometry); expect(cloneMesh.material).not.toBe(originalMesh.material);
      const geometry = vi.spyOn(originalMesh.geometry, 'dispose');
      const firstMaterial = vi.spyOn(originalMesh.material as THREE.Material, 'dispose');
      const secondMaterial = vi.spyOn(cloneMesh.material as THREE.Material, 'dispose');
      const firstSkeleton = vi.spyOn(originalMesh.skeleton, 'dispose');
      const secondSkeleton = vi.spyOn(cloneMesh.skeleton, 'dispose');
      world.addCharacter({id: 'original', asset: original}); world.addCharacter({id: 'clone', asset: clone});
      await world.start(); world.stop();
      expect((await world.execute({type: 'entity.despawn', entityId: 'original'})).status).toBe('applied');
      expect(original.object.parent).toBeNull(); expect(geometry).not.toHaveBeenCalled(); expect(firstMaterial).not.toHaveBeenCalled();
      await world.reset(); expect(original.object.parent).not.toBeNull(); expect(world.getEntityState('original')).toBeDefined();
      expect((await world.execute({type: 'entity.despawn', entityId: 'original'})).status).toBe('applied');
      const library = world.assets as WorldAssets, secondManaged = library.internal(clone), secondRelease = secondManaged.dispose.bind(secondManaged);
      const sharedReleaseCounts: number[] = [];
      vi.spyOn(secondManaged, 'dispose').mockImplementation(() => {secondRelease(); sharedReleaseCounts.push(geometry.mock.calls.length);});
      world.dispose(); world.dispose(); world.assets.release(original); world.assets.release(clone);
      expect(sharedReleaseCounts).toEqual([0]);
      expect(geometry).toHaveBeenCalledOnce(); expect(firstMaterial).toHaveBeenCalledOnce(); expect(secondMaterial).toHaveBeenCalledOnce();
      expect(firstSkeleton).toHaveBeenCalledOnce(); expect(secondSkeleton).toHaveBeenCalledOnce();
      expect(library.owns(original)).toBe(false); expect(library.owns(clone)).toBe(false);
    } finally {world.dispose();}
  });

  it('continues through throwing owned resources and public callbacks without freeing borrowed geometry', async () => {
    const world = await createWorld({navigation: false, assetDefinitions: {}});
    const a = await ownedGeometry(world, 'a'), b = await ownedGeometry(world, 'b');
    const sourceA = vi.spyOn(a.source, 'dispose'), sourceB = vi.spyOn(b.source, 'dispose');
    const order: string[] = [];
    a.owned.addEventListener('dispose', () => {order.push('a'); throw new Error('GEOMETRY_FAILURE');});
    b.owned.addEventListener('dispose', () => {order.push('b');});
    world.onDispose(() => {order.push('callback a'); throw new Error('PUBLIC_CALLBACK_FAILURE');});
    world.onDispose(() => order.push('callback b'));
    try {
      expect(() => world.dispose()).not.toThrow(); world.dispose();
      expect(order).toEqual(['a', 'b', 'callback a', 'callback b']);
      expect(sourceA).not.toHaveBeenCalled(); expect(sourceB).not.toHaveBeenCalled();
    } finally {world.dispose(); a.source.dispose(); b.source.dispose();}
  });
});

// Cleanup failures remain visible, but must not strand independent owners.
describe('disposal failure recovery', () => {
  it.each(['camera', 'physics'] as const)('a thrown %s cleanup still releases later owners once and reports the original failure', async stage => {
    const world = await createWorld({navigation: false, assetDefinitions: {}}), engine = engineOf(world);
    const {source, owned} = await ownedGeometry(world), released = vi.fn(); owned.addEventListener('dispose', released);
    const assets = vi.spyOn(world.assets, 'dispose'), callback = vi.fn(); world.onDispose(callback);
    const target = stage === 'camera' ? engine.cameraController : engine.physics;
    const fault = new Error(`${stage.toUpperCase()}_CLEANUP_FAILURE`);
    const broken = vi.spyOn(target, 'dispose').mockImplementation(() => {throw fault;});
    const physics = stage === 'camera' ? vi.spyOn(engine.physics, 'dispose') : undefined;
    try {
      expect(() => world.dispose()).toThrow(fault); expect(engine.isRunning).toBe(false);
      expect(() => world.dispose()).not.toThrow(); expect(broken).toHaveBeenCalledOnce();
      if (physics) expect(physics).toHaveBeenCalledOnce();
      expect(assets).toHaveBeenCalledOnce(); expect(released).toHaveBeenCalledOnce(); expect(callback).toHaveBeenCalledOnce();
      expect(engine.snapshot().entities).toEqual([]);
      expect(() => engine.start()).toThrow('WORLD_DISPOSED');
    } finally {
      // Release the deliberately broken subsystem itself after removing the fault.
      broken.mockRestore(); if (stage === 'camera') engine.cameraController.dispose();
      if (stage === 'physics') engine.physics.dispose(); world.assets.dispose(); source.dispose();
    }
  });

  it('an unmounted GLB material failure drains both the asset library and later world cleanup', async () => {
    const world = await assetWorld(), engine = engineOf(world);
    const {source, owned} = await ownedGeometry(world), ownedReleased = vi.fn(); owned.addEventListener('dispose', ownedReleased);
    const first = await world.assets.load(row.id), second = await world.assets.clone(first);
    const firstMesh = meshOf(first), secondMesh = meshOf(second);
    const shared = vi.spyOn(firstMesh.geometry, 'dispose'), secondMaterial = vi.spyOn(secondMesh.material as THREE.Material, 'dispose');
    const fail = () => {throw new Error('UNMOUNTED_MATERIAL_FAILURE');};
    (firstMesh.material as THREE.Material).addEventListener('dispose', fail);
    const physics = vi.spyOn(engine.physics, 'dispose'), callback = vi.fn(); world.onDispose(callback);
    try {
      expect(() => world.dispose()).toThrow('UNMOUNTED_MATERIAL_FAILURE');
      expect(physics).toHaveBeenCalledOnce(); expect(shared).toHaveBeenCalledOnce(); expect(secondMaterial).toHaveBeenCalledOnce();
      expect((world.assets as WorldAssets).owns(first)).toBe(false); expect((world.assets as WorldAssets).owns(second)).toBe(false);
      expect(() => world.dispose()).not.toThrow(); expect(ownedReleased).toHaveBeenCalledOnce(); expect(callback).toHaveBeenCalledOnce();
    } finally {
      (firstMesh.material as THREE.Material).removeEventListener('dispose', fail);
      world.dispose(); world.assets.dispose(); source.dispose();
    }
  });

  it.each([new Error('FIRST_CLEANUP_FAILURE'), undefined, null, 0])('preserves first thrown value %s when multiple owners fail, after all remaining cleanup', async first => {
    const world = await createWorld({navigation: false, assetDefinitions: {}}), engine = engineOf(world);
    const frames = frameClock(), order: string[] = [];
    world.addEntity({id:'marker',object:new THREE.Group(),role:'decoration'});
    const cameraDispose = engine.cameraController.dispose.bind(engine.cameraController);
    const physicsDispose = engine.physics.dispose.bind(engine.physics);
    const assetsDispose = world.assets.dispose.bind(world.assets);
    vi.spyOn(engine.cameraController, 'dispose').mockImplementation(() => {cameraDispose(); order.push('camera'); throw first;});
    vi.spyOn(engine.physics, 'dispose').mockImplementation(() => {physicsDispose(); order.push('physics'); throw new Error('SECOND_CLEANUP_FAILURE');});
    vi.spyOn(world.assets, 'dispose').mockImplementation(() => {assetsDispose(); order.push('assets'); throw new Error('THIRD_CLEANUP_FAILURE');});
    world.onDispose(() => {order.push('callback');});
    try {
      await world.start(); const stale = [...frames.values()][0]!;
      let caught = false, thrown: unknown;
      try {world.dispose();} catch (error) {caught = true; thrown = error;}
      expect(caught).toBe(true); expect(thrown).toBe(first);
      expect(order).toEqual(['camera', 'physics', 'assets', 'callback']);
      expect(engine.snapshot().entities).toEqual([]); expect(frames.size).toBe(0);
      expect(engine.snapshot().errors.filter(error => error.code === 'WORLD_DISPOSE_FAILED')).toHaveLength(2);
      world.dispose(); stale(1000); expect(frames.size).toBe(0); expect(world.simulationTick).toBe(0);
      expect(order).toEqual(['camera', 'physics', 'assets', 'callback']);
    } finally {world.dispose();}
  });

  it('finishes entity bookkeeping after an owned renderer throws and never retries the renderer', async () => {
    const engine = await createEngine({navigation: false, canvas: {} as HTMLCanvasElement});
    engine.addEntity({id: 'marker', object: new THREE.Group()});
    const fault = new Error('RENDERER_CLEANUP_FAILURE');
    const dispose = vi.mocked(engine.renderer!.dispose).mockImplementation(() => {throw fault;});
    const physics = vi.spyOn(engine.physics, 'dispose');
    try {
      expect(() => engine.dispose()).toThrow(fault);
      expect(physics).toHaveBeenCalledOnce(); expect(engine.snapshot().entities).toEqual([]);
      expect(() => engine.dispose()).not.toThrow(); expect(dispose).toHaveBeenCalledOnce();
    } finally {engine.dispose();}
  });
});

describe('World-owned callback lifetime', () => {
  it.each(['world', 'engine'] as const)('rejects subscriptions to a disposed %s and keeps old unsubscriptions safe', async kind => {
    const world = await createWorld({navigation: false, assetDefinitions: {}}), engine = engineOf(world);
    const owner = kind === 'world' ? world : engine;
    const subscribe = [() => owner.onUpdate(() => {}), () => owner.onReset(() => {}), () => owner.onDispose(() => {}),
      () => owner.onRender(() => {}), () => owner.onRuntimeSample(() => {}), () => owner.onFrameTiming(() => {})];
    const releases = subscribe.map(register => register());
    world.dispose();
    for (const register of subscribe) expect(register).toThrow('WORLD_DISPOSED');
    for (const release of releases) {expect(release).not.toThrow(); expect(release).not.toThrow();}
    if (kind === 'engine') expect(() => engine.onAfterUpdate(() => {})).toThrow('WORLD_DISPOSED');
  });
  it('drains public callback captures, including when a dispose callback fails', async () => {
    const world = await createWorld({navigation: false, assetDefinitions: {}});
    world.onUpdate(() => {}); world.onReset(() => {});
    const forbidden = vi.fn(), second = vi.fn();
    world.onDispose(() => {
      try {world.onDispose(forbidden);} catch { /* Registration must be rejected after invalidation. */ }
      throw new Error('MODULE_CLEANUP_FAILURE');
    });
    world.onDispose(second); world.dispose();
    expect(forbidden).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledOnce();
    // Observe retained registrations directly, without nondeterministic GC timing.
    const registrations = world as unknown as {updating: Set<unknown>; resets: Set<unknown>; disposals: Set<unknown>};
    expect([registrations.updating.size, registrations.resets.size, registrations.disposals.size]).toEqual([0,0,0]);
  });
  it('keeps existing init/update/reset/dispose ownership for a real material binding', async () => {
    const world = await createWorld({navigation: false, assetDefinitions: {}});
    const original = new THREE.MeshStandardMaterial({color: '#ffffff'}), geometry = new THREE.BoxGeometry();
    const mesh = new THREE.Mesh(geometry, original); world.addEntity({id:'colored', object:mesh, role:'decoration'});
    const coloring = setObjectColor(mesh, '#ff0000'), installed = mesh.material;
    const released = vi.spyOn(installed, 'dispose');
    const releaseUpdate = world.onUpdate(() => coloring.setColor('#0000ff'));
    const releaseReset = world.onReset(() => coloring.setColor('#ff0000'));
    const releaseDispose = world.onDispose(() => {releaseUpdate(); releaseReset(); coloring.dispose(); releaseDispose();});
    try {
      await world.start(); world.stop();
      expect(coloring.color).toBe('#ff0000');
      world.step({}, 1); expect(coloring.color).toBe('#0000ff');
      await world.reset(); expect(coloring.color).toBe('#ff0000');
      releaseUpdate(); world.step({}, 1); expect(coloring.color).toBe('#ff0000');
      world.dispose(); expect(mesh.material).toBe(original); expect(released).toHaveBeenCalledOnce();
      world.dispose(); expect(released).toHaveBeenCalledOnce();
    } finally {world.dispose(); coloring.dispose(); released.mockRestore(); original.dispose(); geometry.dispose();}
  });
});


describe('failed construction ownership',()=>{
  it.each([new Error('INITIAL_CREATE_FAILED'),null,undefined])('releases independent engine owners and preserves the original creation failure %s',async original=>{
    const order:string[]=[],navDispose=ThreeNavigation.prototype.dispose,physicsDispose=ThreePhysics.prototype.dispose;
    const navigation=vi.spyOn(ThreeNavigation.prototype,'dispose').mockImplementation(function(this:ThreeNavigation){order.push('navigation');navDispose.call(this);throw Error('NAV_CLEANUP_FAILED');});
    const physics=vi.spyOn(ThreePhysics.prototype,'dispose').mockImplementation(function(this:ThreePhysics){order.push('physics');physicsDispose.call(this);throw Error('PHYSICS_CLEANUP_FAILED');});
    vi.mocked(THREE.WebGLRenderer).mockImplementation(function(){throw original;});
    vi.spyOn(console,'warn').mockImplementation(()=>{});
    await expect(createEngine({canvas:{} as HTMLCanvasElement})).rejects.toBe(original);
    expect(order).toEqual(['navigation','physics']);expect(navigation).toHaveBeenCalledOnce();expect(physics).toHaveBeenCalledOnce();
  });
  it('keeps a catalog preparation error when engine rollback also fails',async()=>{
    const original=Error('CATALOG_READ_FAILED'),dispose=WorldEngine.prototype.dispose;
    const cleanup=vi.spyOn(WorldEngine.prototype,'dispose').mockImplementation(function(this:WorldEngine){dispose.call(this);throw Error('ENGINE_CLEANUP_FAILED');});
    vi.spyOn(console,'warn').mockImplementation(()=>{});
    await expect(createWorld({navigation:false,get assetDefinitions():never{throw original;}})).rejects.toBe(original);
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it('rolls back the constructed world and asset owner when final rendering setup fails',async()=>{
    const original=Error('SHADOW_SETUP_FAILED'),borrowed=renderer();
    Object.defineProperty(borrowed,'shadowMap',{get(){throw original;}});
    const assets=vi.spyOn(WorldAssets.prototype,'dispose'),engine=vi.spyOn(WorldEngine.prototype,'dispose');
    await expect(createWorld({navigation:false,assetDefinitions:{},renderer:borrowed as unknown as THREE.WebGLRenderer})).rejects.toBe(original);
    expect(engine).toHaveBeenCalledOnce();expect(assets).toHaveBeenCalledOnce();expect(borrowed.dispose).not.toHaveBeenCalled();
  });
});
