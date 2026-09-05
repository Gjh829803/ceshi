import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, LoopOnce, LoopRepeat, Vector3, type Mesh, type MeshStandardMaterial, type SkinnedMesh } from 'three';
import catalog from '../../../scripts/three-creator/asset-catalog.json';
import { loadAsset } from './assets';
import type { AssetDefinition, AssetInstance } from './engine-contracts';

const assets = catalog.assets as unknown as readonly (AssetDefinition & { sourcePath: string })[];
const humanoid = assets.find((asset) => asset.id === 'humanoid.g-bot')!;
const animal = assets.find((asset) => asset.id === 'quadruped.animal.large-static')!;
const instances: AssetInstance[] = [];
const readBytes = (definition: typeof humanoid) => () => readFile(resolve(definition.sourcePath));
const load = async (definition: AssetDefinition = humanoid, source = humanoid) => {
  const instance = await loadAsset(definition, { fetchBytes: readBytes(source) });
  instances.push(instance);
  return instance;
};
const meshes = (asset: AssetInstance) => {
  const result: Mesh[] = [];
  asset.object.traverse((object) => { if ((object as Mesh).isMesh) result.push(object as Mesh); });
  return result;
};
const pose = (asset: AssetInstance) => {
  asset.object.updateMatrixWorld(true);
  return new Box3().setFromObject(asset.object, true);
};

afterEach(() => { for (const instance of instances.splice(0)) instance.dispose(); });

describe('Three asset loader against original project GLBs', () => {
  it('binds all 25 original clips and drives real bones in metric coordinates', async () => {
    const instance = await load();
    expect(meshes(instance)).toHaveLength(2);
    expect(instance.clips.map((clip) => clip.name).sort()).toEqual(Object.keys(humanoid.actions).sort());
    expect(pose(instance).getSize(new Vector3()).y).toBeCloseTo(1.809, 2);
    expect(instance.object.children[0]!.rotation.y).toBe(Math.PI);
    const sourceArmature = instance.object.getObjectByName('Armature')!;
    expect(sourceArmature.scale.x).toBeCloseTo(0.01);
    instance.play('idle');
    instance.update(0.5);
    const idle = pose(instance);
    instance.play('jump');
    instance.update(0.5);
    const jump = pose(instance);
    expect(jump.min.y - idle.min.y).toBeGreaterThan(0.2);
    expect(jump.max.y).toBeLessThan(idle.max.y);
    // These original clips actually contain a key starting at 1/30 s.
    expect(instance.clips.find((clip) => clip.name === 'walk')!.duration).toBe(1);
    expect(instance.object.position.toArray()).toEqual([0, 0, 0]);
  });

  it('keeps skeletons, animation time, materials and clips independent with shared geometry', async () => {
    const fetchBytes = vi.fn(readBytes(humanoid));
    const [first, second] = await Promise.all([
      loadAsset(humanoid, { fetchBytes }), loadAsset(humanoid, { fetchBytes }),
    ]);
    instances.push(first, second);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    const a = meshes(first)[0]! as SkinnedMesh;
    const b = meshes(second)[0]! as SkinnedMesh;
    expect(a.geometry).toBe(b.geometry);
    expect(a.skeleton).not.toBe(b.skeleton);
    expect(a.skeleton.bones[0]).not.toBe(b.skeleton.bones[0]);
    expect(a.material).not.toBe(b.material);
    expect(first.clips[0]).not.toBe(second.clips[0]);
    const bColor = (b.material as MeshStandardMaterial).color.getHex();
    (a.material as MeshStandardMaterial).color.setHex(0xff0055);
    expect((b.material as MeshStandardMaterial).color.getHex()).toBe(bColor);
    first.play('jump'); first.update(0.6);
    expect(second.mixer.time).toBe(0);
    expect(pose(second).min.y).toBeCloseTo(-0.00035, 4);
    expect(pose(first).min.y).toBeGreaterThan(0.2);
    const geometryDisposed = vi.fn();
    a.geometry.addEventListener('dispose', geometryDisposed);
    first.dispose(); first.dispose();
    expect(geometryDisposed).not.toHaveBeenCalled();
    second.play('walk'); second.update(0.5);
    expect(Number.isFinite(pose(second).max.y)).toBe(true);
    second.dispose();
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(() => first.update(0.1)).toThrow('ASSET_DISPOSED');
  });

  it('obeys looping, once/clamp and blending without restarting repeated locomotion selection', async () => {
    const instance = await load();
    expect(instance.currentActionId).toBeUndefined();
    expect(instance.currentClipName).toBeUndefined();
    instance.play('walk'); instance.update(0.3);
    const walk = instance.mixer.existingAction(instance.clips.find((clip) => clip.name === 'walk')!)!;
    expect(walk.loop).toBe(LoopRepeat);
    instance.play('walk'); instance.update(0.2);
    expect(walk.time).toBeCloseTo(0.5);
    expect(instance.currentActionId).toBe('walk');
    expect(instance.currentClipName).toBe('walk');
    instance.play('run'); instance.update(0.06);
    const run = instance.mixer.existingAction(instance.clips.find((clip) => clip.name === 'run')!)!;
    expect(run.getEffectiveWeight()).toBeCloseTo(0.5);
    expect(walk.getEffectiveWeight()).toBeCloseTo(0.5);
    instance.play('emote.salute'); instance.update(10);
    const salute = instance.mixer.existingAction(instance.clips.find((clip) => clip.name === 'emote.salute')!)!;
    expect(salute.loop).toBe(LoopOnce);
    expect(salute.clampWhenFinished).toBe(true);
    expect(salute.paused).toBe(true);
    expect(salute.time).toBeCloseTo(salute.getClip().duration);
  });

  it('honors an explicit playback change while the same clip is already running', async () => {
    const instance = await load(); instance.play('walk'); instance.update(.3);
    instance.play('walk', { playback: 'once' });
    const action = instance.mixer.existingAction(instance.clips.find(clip => clip.name === 'walk')!)!;
    expect(action.loop).toBe(LoopOnce); expect(instance.timeSeconds).toBe(0);
    instance.update(2); expect(instance.isActionComplete).toBe(true);
    instance.play('walk', { playback: 'loop' }); instance.update(2);
    expect(action.loop).toBe(LoopRepeat); expect(instance.isActionComplete).toBe(false);
  });

  it('reports real one-shot completion rather than interpreting a pause as completion', async () => {
    const instance = await load(); expect(instance.isActionComplete).toBe(false);
    instance.play('emote.salute'); instance.update(.2);
    const action = instance.mixer.existingAction(instance.clips.find(clip => clip.name === 'emote.salute')!)!;
    action.paused = true; instance.update(1); expect(instance.isActionComplete).toBe(false);
    action.paused = false; instance.update(10); expect(instance.isActionComplete).toBe(true);
    instance.play('idle'); instance.mixer.stopAllAction(); expect(instance.isActionComplete).toBe(false);
    expect(() => instance.play('idle', { playback: 'invalid' } as never)).toThrow('ASSET_PLAYBACK_INVALID');
  });

  it('selects exactly one six-mesh quadruped without modifying the source GLB', async () => {
    const instance = await load(animal, animal);
    expect(meshes(instance)).toHaveLength(6);
    expect(instance.clips).toHaveLength(0);
    const box = pose(instance);
    expect(box.getSize(new Vector3()).toArray()).toEqual([
      0.5373704433441162, 1.5794458389282227, 2.082836151123047,
    ]);
    expect(box.getCenter(new Vector3()).x).toBeCloseTo(0, 10);
    expect(box.min.y).toBe(0);
    expect(() => instance.play('walk')).toThrow('ASSET_ACTION_UNAVAILABLE');
    expect(() => instance.play('toString')).toThrow('ASSET_ACTION_UNAVAILABLE');
    expect((await readBytes(animal)()).byteLength).toBe(animal.byteLength);
  });

  it('validates byte length/hash before parsing and can retry after a failed fetch', async () => {
    await expect(loadAsset({ ...humanoid, byteLength: humanoid.byteLength + 1 }, { fetchBytes: readBytes(humanoid) }))
      .rejects.toThrow('ASSET_LENGTH_MISMATCH');
    await expect(loadAsset({ ...humanoid, sha256: '0'.repeat(64) }, { fetchBytes: readBytes(humanoid) }))
      .rejects.toThrow('ASSET_HASH_MISMATCH');
    await expect(loadAsset(humanoid, { fetchBytes: async () => { throw new Error('fetch failure'); } }))
      .rejects.toThrow('fetch failure');
    const instance = await load();
    expect(instance.clips).toHaveLength(25);
  });

  it('fails missing clips, unknown/duplicate selections and invalid time without breaking live assets', async () => {
    const live = await load();
    await expect(loadAsset({ ...humanoid, actions: { bad: { clipName: 'absent', loop: true, blendSeconds: 0, timeScale: 1 } } }))
      .rejects.toThrow('ASSET_CLIP_NOT_FOUND');
    await expect(loadAsset({ ...humanoid, selectedNodeIndices: [65] }))
      .rejects.toThrow('ASSET_SKINNED_NODE_SELECTION_UNSUPPORTED');
    await expect(loadAsset({ ...animal, selectedNodeIndices: [999] }, { fetchBytes: readBytes(animal) }))
      .rejects.toThrow('ASSET_NODE_NOT_FOUND');
    await expect(loadAsset({ ...animal, selectedNodeIndices: [2, 2] }, { fetchBytes: readBytes(animal) }))
      .rejects.toThrow('ASSET_NODE_SELECTION_INVALID');
    expect(() => live.update(-1)).toThrow('ASSET_DELTA_INVALID');
    expect(() => live.update(NaN)).toThrow('ASSET_DELTA_INVALID');
    live.play('run'); live.update(0.5);
    expect(pose(live).min.y).toBeGreaterThan(0.1);
  });

  it('resolves browser asset URIs relative to the manifest base URI', async () => {
    const fetchBytes = vi.fn(readBytes(animal));
    const instance = await loadAsset(animal, { baseUri: 'http://localhost:4173/cases/example/', fetchBytes });
    instances.push(instance);
    expect(fetchBytes).toHaveBeenCalledWith(`http://localhost:4173/cases/example/assets/subjects/${animal.sha256}.glb`);
  });

  it('releases all shared resources even when an owned material disposal listener throws', async () => {
    const instance = await load();
    const parts = meshes(instance);
    const disposals = parts.map((part) => {
      const listener = vi.fn();
      part.geometry.addEventListener('dispose', listener);
      return listener;
    });
    (parts[0]!.material as MeshStandardMaterial).addEventListener('dispose', () => {
      throw new Error('consumer disposal listener');
    });
    expect(() => instance.dispose()).toThrow('consumer disposal listener');
    expect(disposals.every((listener) => listener.mock.calls.length === 1)).toBe(true);
    expect(() => instance.dispose()).not.toThrow();
    // The failed listener cannot leave a stale cache entry for the next load.
    const next = await load();
    expect(meshes(next)[0]!.geometry).not.toBe(parts[0]!.geometry);
  });

  it('samples the same pose after equal elapsed time at 30 and 120 updates per second', async () => {
    const slow = await load();
    const fast = await load();
    slow.play('run'); fast.play('run');
    for (let step = 0; step < 15; step += 1) slow.update(1 / 30);
    for (let step = 0; step < 60; step += 1) fast.update(1 / 120);
    const a = pose(slow);
    const b = pose(fast);
    // Source tracks are Float32; require agreement to one micrometer.
    expect(a.min.distanceTo(b.min)).toBeLessThan(1e-6);
    expect(a.max.distanceTo(b.max)).toBeLessThan(1e-6);
  });
});
