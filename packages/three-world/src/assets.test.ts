import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, LoopOnce, LoopRepeat, Vector3, type DataTexture, type Mesh, type MeshStandardMaterial, type SkinnedMesh } from 'three';
import contentCatalog from '../../../asset-library/dist/whitebox/asset-catalog.json';
import {composeAssetCatalog} from '@worldkit/preset-content/assets/host-adapter';
const catalog={...contentCatalog,assets:composeAssetCatalog(contentCatalog.assets)};
import { loadAsset } from './assets';
import type { AssetDefinition, AssetInstance } from './engine-contracts';

const assets = catalog.assets as unknown as readonly (AssetDefinition & { sourcePath: string })[];
const humanoid = assets.find((asset) => asset.id === 'humanoid.uefn-mannequin')!;
const animal = assets.find((asset) => asset.id === 'creature.quadruped-static-diagnostic')!;
const helicopter = assets.find((asset) => asset.id === 'vehicle.helicopter')!;
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

afterEach(() => { for (const instance of instances.splice(0)) instance.dispose(); vi.restoreAllMocks(); });

describe('Three asset loader against original project GLBs', () => {
  it('retains both original helicopter rotor pivot names and their authored local axes', async () => {
    const instance = await load(helicopter, helicopter);
    const exactRuntimeName = instance.object.getObjectsByProperty('name', 'aircraft-rotor');
    expect(exactRuntimeName).toHaveLength(1);
    const rotors: typeof exactRuntimeName = [];
    instance.object.traverse(node => {
      const sourceName = node.userData.name ?? node.name;
      if (sourceName === 'aircraft-rotor') rotors.push(node);
    });
    expect(rotors.map(node => node.name)).toEqual(['aircraft-rotor', 'aircraft-rotor_1']);
    expect(rotors.map(node => node.userData.name)).toEqual(['aircraft-rotor', 'aircraft-rotor']);
    const tailParent = rotors[1]!.parent!;
    const authoredTailOrientation = tailParent.quaternion.clone();
    expect(tailParent.rotation.z).toBeCloseTo(Math.PI / 2);
    const applyRotorPhases = (phases: readonly number[]) => rotors.forEach((rotor, index) => {
      const phase = phases[index] ?? 0;
      rotor.rotation.y = Number.isFinite(phase) ? phase : 0;
    });
    applyRotorPhases([]);
    instance.object.updateMatrixWorld(true);
    expect(rotors.map(rotor => rotor.rotation.y)).toEqual([0, 0]);
    expect(rotors.every(rotor => rotor.matrixWorld.elements.every(Number.isFinite))).toBe(true);
    const phases = [.75, -1.25];
    applyRotorPhases(phases);
    expect(rotors.map(rotor => rotor.rotation.y)).toEqual(phases);
    expect(tailParent.quaternion.equals(authoredTailOrientation)).toBe(true);
    applyRotorPhases([]);
    instance.object.updateMatrixWorld(true);
    expect(rotors.map(rotor => rotor.rotation.y)).toEqual([0, 0]);
    expect(rotors.every(rotor => rotor.matrixWorld.elements.every(Number.isFinite))).toBe(true);
  });

  it('skips images by default and isolates decoded Node textures from live whitebox assets', async () => {
    const fetchBytes = vi.fn(readBytes(humanoid));
    const objectURL = vi.spyOn(URL, 'createObjectURL');
    const first = await loadAsset(humanoid, { fetchBytes }); instances.push(first);
    const material = meshes(first)[0]!.material as MeshStandardMaterial;
    expect(material.map).toBeNull(); expect(material.normalMap).toBeNull();
    expect(material.color.getHex()).toBe(0xffffff);
    expect(objectURL).not.toHaveBeenCalled();
    const textured=await loadAsset(humanoid,{fetchBytes,loadTextures:true});instances.push(textured);
    const texturedMaterial=meshes(textured)[0]!.material as MeshStandardMaterial;
    expect((texturedMaterial.map as DataTexture).image.width).toBeGreaterThan(0);expect((texturedMaterial.normalMap as DataTexture).image.width).toBeGreaterThan(0);
    expect(material.map).toBeNull();expect(objectURL).not.toHaveBeenCalled();
    const second = await loadAsset(humanoid, { fetchBytes, loadTextures: false }); instances.push(second);
    expect(meshes(second)[0]!.geometry).toBe(meshes(first)[0]!.geometry);
    expect(fetchBytes).toHaveBeenCalledTimes(2);
    second.play('walk'); second.update(.2);
    expect(Number.isFinite(pose(second).max.y)).toBe(true);
  });

  it('rejects an invalid texture policy before fetching model bytes', async () => {
    const fetchBytes = vi.fn(readBytes(humanoid));
    await expect(loadAsset(humanoid, { fetchBytes, loadTextures: 'false' as never })).rejects.toThrow('MODEL_LOAD_TEXTURES_INVALID');
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('restores the exact idle pose immediately after stopping a different locomotion clip',async()=>{
    const instance=await load();instance.play('idle');instance.update(0);const expected=pose(instance).clone();
    for(const action of ['walk','run','walk','run','walk']){
      instance.play(action);instance.update(.5);instance.mixer.stopAllAction();instance.play('idle');instance.update(0);
      const current=pose(instance);expect(current.min.distanceTo(expected.min)).toBeLessThan(1e-7);expect(current.max.distanceTo(expected.max)).toBeLessThan(1e-7);
    }
  });
  it('still blends from a scheduled clamped one-shot final pose',async()=>{
    const instance=await load();instance.play('jump',{playback:'once'});const jump=instance.mixer.clipAction(instance.clips.find(c=>c.name===instance.currentClipName)!);instance.update(3);
    expect(jump.isScheduled()).toBe(true);expect(jump.isRunning()).toBe(false);
    instance.play('idle');instance.update(0);const idle=instance.mixer.clipAction(instance.clips.find(c=>c.name===instance.currentClipName)!);
    expect(idle.getEffectiveWeight()).toBe(0);expect(jump.getEffectiveWeight()).toBeGreaterThan(0);
    instance.update(.5);expect(idle.getEffectiveWeight()).toBe(1);
  });

  it('binds source humanoid clips to its metric skeleton without root drift', async () => {
    const instance=await load();
    // The UEFN LOD1 replacement is one textured skin on the preserved skeleton.
    expect(meshes(instance)).toHaveLength(1);
    expect(instance.clips.map(clip=>clip.name).sort()).toEqual(Object.keys(humanoid.actions).sort());
    const mesh=meshes(instance)[0] as SkinnedMesh;
    expect(mesh.name).toBe('UEFN_Mannequin_BlackJoints_LOD1_Medium');
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      expect(material.transparent).toBe(false);expect(material.depthWrite).toBe(true);
    }
    expect(mesh.skeleton.bones).toHaveLength(101);
    instance.play('idle');instance.update(0);
    const idle=pose(instance);expect(idle.min.y).toBeGreaterThan(-.12);expect(idle.max.y).toBeGreaterThan(1.6);
    const calf=instance.object.getObjectByName('calf_l')!,before=calf.quaternion.clone();
    instance.play('jump');instance.update(.3);
    expect(calf.quaternion.angleTo(before)).toBeGreaterThan(.01);
    expect(instance.object.getObjectByName('root')!.position.length()).toBeLessThan(1e-6);
    expect(instance.object.position.toArray()).toEqual([0,0,0]);
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
    second.play('idle');second.update(0);const still=pose(second).clone();
    first.play('jump'); first.update(0.6);
    expect(second.mixer.time).toBe(0);
    expect(pose(second).min.distanceTo(still.min)).toBeLessThan(1e-6);
    expect(pose(first).max.distanceTo(still.max)).toBeGreaterThan(.01);
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
    expect(walk.time).toBeCloseTo(.5*humanoid.actions.walk!.timeScale);
    expect(instance.currentActionId).toBe('walk');
    expect(instance.currentClipName).toBe('walk');
    instance.play('run'); instance.update(humanoid.actions.run!.blendSeconds/2);
    const run = instance.mixer.existingAction(instance.clips.find((clip) => clip.name === 'run')!)!;
    expect(run.getEffectiveWeight()).toBeCloseTo(0.5);
    expect(walk.getEffectiveWeight()).toBeCloseTo(0.5);
    instance.play('jump'); instance.update(10);
    const jumpAction = instance.mixer.existingAction(instance.clips.find((clip) => clip.name === 'jump')!)!;
    expect(jumpAction.loop).toBe(LoopOnce);
    expect(jumpAction.clampWhenFinished).toBe(true);
    expect(jumpAction.paused).toBe(true);
    expect(jumpAction.time).toBeCloseTo(jumpAction.getClip().duration);
  });

  it('honors an explicit playback change while the same clip is already running', async () => {
    const instance = await load(); instance.play('walk'); instance.update(.3);
    instance.play('walk', { playback: 'once' });
    const action = instance.mixer.existingAction(instance.clips.find(clip => clip.name === 'walk')!)!;
    expect(action.loop).toBe(LoopOnce); expect(instance.timeSeconds).toBe(0);
    instance.update(action.getClip().duration/humanoid.actions.walk!.timeScale+.1); expect(instance.isActionComplete).toBe(true);
    instance.play('walk', { playback: 'loop' }); instance.update(2);
    expect(action.loop).toBe(LoopRepeat); expect(instance.isActionComplete).toBe(false);
  });

  it('reports real one-shot completion rather than interpreting a pause as completion', async () => {
    const instance = await load(); expect(instance.isActionComplete).toBe(false);
    instance.play('jump'); instance.update(.2);
    const action = instance.mixer.existingAction(instance.clips.find(clip => clip.name === 'jump')!)!;
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
    expect(instance.clips).toHaveLength(5);
  });

  it('fails missing clips, unknown/duplicate selections and invalid time without breaking live assets', async () => {
    const live = await load();
    await expect(loadAsset({ ...humanoid, actions: { bad: { clipName: 'absent', loop: true, blendSeconds: 0, timeScale: 1 } } }))
      .rejects.toThrow('ASSET_CLIP_NOT_FOUND');
    await expect(loadAsset({ ...humanoid, selectedNodeIndices: [103] }))
      .rejects.toThrow('ASSET_SKINNED_NODE_SELECTION_UNSUPPORTED');
    await expect(loadAsset({ ...animal, selectedNodeIndices: [999] }, { fetchBytes: readBytes(animal) }))
      .rejects.toThrow('ASSET_NODE_NOT_FOUND');
    await expect(loadAsset({ ...animal, selectedNodeIndices: [2, 2] }, { fetchBytes: readBytes(animal) }))
      .rejects.toThrow('ASSET_NODE_SELECTION_INVALID');
    expect(() => live.update(-1)).toThrow('ASSET_DELTA_INVALID');
    expect(() => live.update(NaN)).toThrow('ASSET_DELTA_INVALID');
    live.play('run'); live.update(0.5);
    expect(live.object.getObjectByName('root')!.position.length()).toBeLessThan(1e-6);
    expect(Number.isFinite(pose(live).min.y)).toBe(true);
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
