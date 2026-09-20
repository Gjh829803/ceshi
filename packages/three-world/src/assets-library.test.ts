import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, BoxGeometry, Mesh, MeshStandardMaterial, Vector3, type DataTexture, type SkinnedMesh } from 'three';
import contentCatalog from '@worldkit/asset-library/catalog';
import {composeAssetCatalog} from '@worldkit/preset-content/assets/host-adapter';
const catalog={...contentCatalog,assets:composeAssetCatalog(contentCatalog.assets)};
import { WorldAssets } from './assets-library.js';
import type { AssetInstance } from './contracts.js';
import type { AssetDefinition } from './engine-contracts.js';

const definitions = Object.fromEntries(catalog.assets.map(row => [row.id, row])) as unknown as Record<string, AssetDefinition>;
const humanoid = definitions['humanoid.uefn-mannequin']!;
const libraries: WorldAssets[] = [];
let sequence = 0;
function fixture(source: Record<string, AssetDefinition> = definitions) {
  const fetchBytes = vi.fn(async (uri: string) => {
    const row = catalog.assets.find(asset => uri.includes(asset.sha256));
    if (!row) throw new Error(`Unexpected fixture URI: ${uri}`);
    return new Response(await readFile(resolve(row.sourcePath)));
  });
  vi.stubGlobal('fetch', fetchBytes);
  const library = new WorldAssets({ definitions: source, baseUri: `https://assets.test/case-${++sequence}/` }); libraries.push(library);
  return { library, fetchBytes };
}
function meshOf(instance: AssetInstance): SkinnedMesh {
  let selected: SkinnedMesh | undefined;
  instance.object.traverse(node => { if ((node as SkinnedMesh).isSkinnedMesh && !selected) selected = node as SkinnedMesh; });
  return selected!;
}
afterEach(() => { for (const library of libraries.splice(0)) library.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('WorldAssets', () => {
  it('forwards Node texture opt-in and keeps the default whitebox instance independent', async () => {
    const { library } = fixture();
    const textured=await library.load('humanoid.uefn-mannequin',{loadTextures:true});
    expect(((meshOf(textured).material as MeshStandardMaterial).map as DataTexture).image.width).toBeGreaterThan(0);
    expect(library.owns(textured)).toBe(true);
    const instance = await library.load('humanoid.uefn-mannequin');
    expect((meshOf(instance).material as MeshStandardMaterial).map).toBeNull();
    expect(library.owns(instance)).toBe(true);
  });

  it('publishes only grounded catalog metadata and does not infer movement from clips', async () => {
    const { library, fetchBytes } = fixture();
    const subject = library.search('uefn-mannequin')[0]!;
    expect(subject.recommendedBody).toEqual({heightMeters:1.8,radiusMeters:.35});
    expect(subject.actionIds).toEqual(['idle','walk','run','jump','fall']);
    expect(subject.locomotionBindingIds).toEqual(['locomotion.ground','locomotion.humanoid']);
    const diagnostic = library.search('quadruped')[0]!;
    expect(diagnostic.recommendedBody).toBeNull(); expect(diagnostic.locomotionBindingIds).toEqual([]);
    expect(library.search('fox')).toEqual([]); expect(fetchBytes).not.toHaveBeenCalled();
    expect(Object.isFrozen(subject)).toBe(true); expect(Object.isFrozen(subject.actionIds)).toBe(true);
  });

  it('returns a minimal owned public instance with idle already evaluated at time zero', async () => {
    const { library, fetchBytes } = fixture(); const instance = await library.load('humanoid.uefn-mannequin');
    expect(Object.keys(instance).sort()).toEqual(['actionIds', 'assetId', 'object', 'recommendedBody']);
    expect(instance.assetId).toBe('humanoid.uefn-mannequin'); expect(library.owns(instance)).toBe(true);
    expect(instance.recommendedBody).toEqual({ heightMeters: 1.8, radiusMeters: .35 });
    const engine = library.internal(instance);
    expect(engine.currentActionId).toBe('idle'); expect(engine.timeSeconds).toBe(0); expect(engine.isActionComplete).toBe(false);
    expect(engine.mixer.existingAction(engine.clips.find(clip => clip.name === 'idle')!)?.isRunning()).toBe(true);
    const bounds = new Box3().setFromObject(instance.object, true);
    expect(bounds.getSize(new Vector3()).y).toBeGreaterThan(1.5); expect(bounds.getSize(new Vector3()).y).toBeLessThan(2);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    engine.dispose(); expect(library.owns(instance)).toBe(false);
    expect(() => library.internal(instance)).toThrow('ASSET_INSTANCE_RELEASED'); expect(() => library.release(instance)).not.toThrow();
  });

  it('clones authored roots, materials and attachments without stealing the source or sharing mutable state', async () => {
    const { library } = fixture(); const source = await library.load('humanoid.uefn-mannequin');
    source.object.position.set(4, 0, 3); source.object.scale.setScalar(2);
    const sourceMesh = meshOf(source); (sourceMesh.material as MeshStandardMaterial).color.setHex(0xff0066);
    const decorationGeometry = new BoxGeometry(.2, .3, .4), decorationMaterial = new MeshStandardMaterial({ color: 0x2288ff });
    const decoration = new Mesh(decorationGeometry, decorationMaterial); decoration.name = 'authored-pack'; decoration.position.set(1, 2, 3); source.object.add(decoration);
    library.internal(source).play('jump'); library.internal(source).update(.4);
    const clone = await library.clone(source); const clonedMesh = meshOf(clone); const clonedDecoration = clone.object.getObjectByName('authored-pack') as Mesh;
    try {
      expect(clone.object).not.toBe(source.object); expect(source.object.parent).toBeNull();
      expect(clone.object.position.toArray()).toEqual([4, 0, 3]); expect(clone.object.scale.toArray()).toEqual([2, 2, 2]);
      expect(clonedMesh.geometry).toBe(sourceMesh.geometry); expect(clonedMesh.skeleton).not.toBe(sourceMesh.skeleton);
      expect(clonedMesh.skeleton.bones[0]).not.toBe(sourceMesh.skeleton.bones[0]);
      expect(clonedMesh.material).not.toBe(sourceMesh.material); expect((clonedMesh.material as MeshStandardMaterial).color.getHex()).toBe(0xff0066);
      expect(clonedDecoration.geometry).not.toBe(decoration.geometry); expect(clonedDecoration.position.toArray()).toEqual([1, 2, 3]);
      expect(clonedDecoration.material).not.toBe(decoration.material);
      (sourceMesh.material as MeshStandardMaterial).color.setHex(0); decoration.position.x = 9;
      expect((clonedMesh.material as MeshStandardMaterial).color.getHex()).toBe(0xff0066); expect(clonedDecoration.position.x).toBe(1);
      expect(library.internal(clone).currentActionId).toBe('idle'); expect(library.internal(clone).timeSeconds).toBe(0);
      const disposed = vi.fn(); sourceMesh.geometry.addEventListener('dispose', disposed);
      library.release(source); expect(disposed).not.toHaveBeenCalled();
      library.internal(clone).play('walk'); library.internal(clone).update(.3); expect(library.internal(clone).timeSeconds).toBeCloseTo(.3*humanoid.actions.walk!.timeScale);
      library.release(clone); expect(disposed).toHaveBeenCalledTimes(1);
    } finally { decorationGeometry.dispose(); decorationMaterial.dispose(); }
  });

  it('rejects forged and foreign instances while keeping their original owners live', async () => {
    const { library } = fixture(); const source = await library.load('humanoid.uefn-mannequin');
    const other = new WorldAssets({ definitions }); libraries.push(other);
    expect(other.owns(source)).toBe(false); expect(() => other.internal(source)).toThrow('ASSET_INSTANCE_UNOWNED');
    await expect(other.clone(source)).rejects.toThrow('ASSET_INSTANCE_UNOWNED');
    expect(() => other.release(source)).toThrow('ASSET_INSTANCE_UNOWNED');
    expect(() => library.internal({ ...source })).toThrow('ASSET_INSTANCE_UNOWNED');
    expect(library.owns(source)).toBe(true);
    await expect(library.load('toString')).rejects.toThrow('ASSET_NOT_FOUND');
  });

  it('snapshots catalog inputs and rejects invalid declared body/binding metadata before loading', async () => {
    const mutable = structuredClone(definitions); const { library } = fixture(mutable);
    (mutable['humanoid.uefn-mannequin']!.actions.idle as { clipName: string }).clipName = 'absent';
    const instance = await library.load('humanoid.uefn-mannequin'); expect(library.internal(instance).currentActionId).toBe('idle');
    expect(() => new WorldAssets({ definitions: { [humanoid.id]: { ...humanoid, recommendedBody: { heightMeters: 1, radiusMeters: 2 } } } })).toThrow('ASSET_RECOMMENDED_BODY_INVALID');
    const animal = definitions['creature.quadruped-static-diagnostic']!;
    expect(() => new WorldAssets({ definitions: { [animal.id]: { ...animal, locomotionBindingIds: ['locomotion.ground'] } } })).toThrow('ASSET_LOCOMOTION_ACTION_MISSING');
    expect(() => new WorldAssets({ definitions: { alias: humanoid } })).toThrow('ASSET_CATALOG_ID_INVALID');
  });

  it('releases a pending load after disposal without resurrecting a public handle', async () => {
    const { library, fetchBytes } = fixture();
    let finish!: (value: Response) => void;
    fetchBytes.mockImplementationOnce(() => new Promise<Response>(resolvePromise => { finish = resolvePromise; }));
    const pending = library.load('humanoid.uefn-mannequin'); const rejected = expect(pending).rejects.toThrow('ASSET_LIBRARY_DISPOSED');
    library.dispose(); finish(new Response(await readFile(resolve(catalog.assets.find(asset => asset.id === 'humanoid.uefn-mannequin')!.sourcePath)))); await rejected;
    expect(() => library.search('')).toThrow('ASSET_LIBRARY_DISPOSED');
    await expect(library.load('humanoid.uefn-mannequin')).rejects.toThrow('ASSET_LIBRARY_DISPOSED');
  });

  it('releases a clone whose owning World is disposed before preparation finishes', async () => {
    const { library } = fixture(); const source = await library.load('humanoid.uefn-mannequin');
    const disposed = vi.fn(); meshOf(source).geometry.addEventListener('dispose', disposed);
    const pending = library.clone(source); const rejected = expect(pending).rejects.toThrow('ASSET_LIBRARY_DISPOSED');
    library.dispose(); await rejected;
    expect(disposed).toHaveBeenCalledTimes(1); expect(library.owns(source)).toBe(false);
  });

  it('disposes every owned instance even when a material listener throws', async () => {
    const { library } = fixture(); const source = await library.load('humanoid.uefn-mannequin'); const clone = await library.clone(source);
    const sourceMesh = meshOf(source), cloneMesh = meshOf(clone); const disposed = vi.fn(); sourceMesh.geometry.addEventListener('dispose', disposed);
    (sourceMesh.material as MeshStandardMaterial).addEventListener('dispose', () => { throw new Error('disposal-listener'); });
    const cloneDisposed = vi.fn(); (cloneMesh.material as MeshStandardMaterial).addEventListener('dispose', cloneDisposed);
    expect(() => library.dispose()).toThrow('disposal-listener'); expect(cloneDisposed).toHaveBeenCalledTimes(1); expect(disposed).toHaveBeenCalledTimes(1);
    expect(library.owns(source)).toBe(false); expect(library.owns(clone)).toBe(false); expect(() => library.dispose()).not.toThrow();
  });

  it('keeps an unknown-body static asset usable without inventing idle or motion bindings', async () => {
    const { library } = fixture(); const instance = await library.load('creature.quadruped-static-diagnostic');
    expect(instance.recommendedBody).toBeNull(); expect(instance.actionIds).toEqual([]);
    expect(library.internal(instance).currentActionId).toBeUndefined(); expect(library.internal(instance).timeSeconds).toBe(0);
  });
});


it.each([undefined,null])('preserves a falsy first disposal error %s while releasing all shared instances',async firstError=>{
 const {library}=fixture();const first=await library.load(humanoid.id),second=await library.clone(first);
 const material=meshOf(first).material as MeshStandardMaterial;
 material.addEventListener('dispose',()=>{throw firstError;});
 const secondDisposed=vi.fn(()=>{throw new Error('LATER_DISPOSAL_FAILURE');});(meshOf(second).material as MeshStandardMaterial).addEventListener('dispose',secondDisposed);
 let failed=false,caught:unknown;
 try{library.dispose();}catch(error){failed=true;caught=error;}
 expect(failed).toBe(true);expect(caught).toBe(firstError);expect(secondDisposed).toHaveBeenCalledOnce();
 expect(library.owns(first)).toBe(false);expect(library.owns(second)).toBe(false);expect(()=>library.dispose()).not.toThrow();
});
