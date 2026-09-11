import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,it} from 'vitest';
import {flyingCreatureCatalogEntries} from './register-flying-creatures';
import {readCatalogSources,syncAssetCatalog} from '../three-creator/catalog-sources';
import {readCatalogResource} from '../three-creator/asset-resources';

it('registers all eleven measured flying creatures with packaged visual resources and explicit controller ownership',async()=>{
  const root=path.resolve('.'),sources=await readCatalogSources(root),generated=await flyingCreatureCatalogEntries(root);
  const policy=JSON.parse(await readFile(path.join(root,'config/three-creator/asset-policy.json'),'utf8'));
  expect(generated.map(asset=>asset.id)).toEqual(Array.from({length:11},(_,n)=>`creature.dragon.d${String(n+1).padStart(2,'0')}`));
  for(const asset of generated){
    expect(sources.find(source=>source.id===asset.id)).toEqual(asset);
    expect(policy.allowedAssetIds).toContain(asset.id);
    expect(asset.integrationMetadata).toMatchObject({classification:'flying-mount',exampleTopic:'flying-creature',requiredAssetIds:['humanoid.source-101',asset.id]});
    const visual=asset.integrationMetadata.visual;
    expect(visual.modelResource).toBe(`flying-creatures/${visual.animationPrefix}/model.glb`);
    expect(asset.resources.some(resource=>resource.path===visual.flameResource)).toBe(true);
    expect(asset.resources.some(resource=>resource.sourcePath.endsWith('/rider.glb'))).toBe(false);
    expect(asset.actions).toEqual({});expect(asset.vehicle.spec.mode).toBe('dragon');
    expect(asset.vehicle.spec.flyingCreatureGround?.probes).toHaveLength(12);
    expect(asset.vehicle.spec.flyingCreatureCollision).toHaveLength(12);
    const bytes=await readCatalogResource(root,asset),document=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    const clips=document.animations.map((clip:{name:string})=>clip.name) as string[];
    expect(clips).toContain(`${visual.animationPrefix}_Ground_Idle`);
    expect(clips.some(clip=>clip.startsWith(`${visual.animationPrefix}_Flight_`))).toBe(true);
  }
  expect(sources.find(source=>source.id==='creature.dragon')?.sourcePath).toBe('assets/three-creator/presets/creatures/dragon.glb');
  await syncAssetCatalog(root,true);
});
