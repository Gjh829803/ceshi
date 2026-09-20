import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {expect,it} from 'vitest';
import {flyingCreatureCatalogEntries} from './register-flying-creatures';
import {readCatalogSources,syncAssetCatalog} from '@worldkit/creator-host/catalog-sources';
import {readLibraryResource} from '@worldkit/creator-host/library-source';

it('registers all eleven measured flying creatures with packaged visual resources and explicit controller ownership',async()=>{
  const root=path.resolve('.'),sources=await readCatalogSources(root),generated=await flyingCreatureCatalogEntries(root);
  const policy=JSON.parse(await readFile(path.join(root,'packages/creator-host/config/asset-policy.json'),'utf8'));
  const variantResource=sources.find(source=>source.id==='creature.dragon.d01')!.resources.find((resource:{path:string})=>resource.path==='flying-creatures/variants.json');
  const trainingVariants=JSON.parse((await readLibraryResource(root,variantResource)).toString('utf8'));
  expect(trainingVariants.map((v:{id:string})=>v.id)).toEqual(Array.from({length:11},(_,n)=>`D${String(n+1).padStart(2,'0')}`));
  expect(generated.map(asset=>asset.id)).toEqual(Array.from({length:11},(_,n)=>`creature.dragon.d${String(n+1).padStart(2,'0')}`));
  for(const asset of generated){
    expect(sources.find(source=>source.id===asset.id)).toEqual(asset);
    expect(policy.allowedAssetIds).toContain(asset.id);
    expect(asset.integrationMetadata).toMatchObject({classification:'flying-mount',exampleTopic:'mounted-interaction',exampleVariant:'flying-creature',documentation:'assets/animals/flying-mounts.md',requiredAssetIds:['humanoid.uefn-mannequin',asset.id]});
    const visual=asset.integrationMetadata.visual;
    expect(visual.modelResource).toBe(`flying-creatures/${visual.animationPrefix}/model.glb`);
    expect(asset.resources.some(resource=>resource.path===visual.flameResource)).toBe(true);
    expect(asset.resources.some(resource=>resource.sourcePath.endsWith('/rider.glb'))).toBe(false);
    expect(asset.actions).toEqual({});expect(asset.vehicle.spec.mode).toBe('dragon');
    expect(asset.vehicle.spec.flyingCreatureGround?.probes).toHaveLength(12);
    expect(asset.vehicle.spec.flyingCreatureCollision).toHaveLength(12);
    const bytes=await readLibraryResource(root,asset),document=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    const clips=document.animations.map((clip:{name:string})=>clip.name) as string[];
    expect(clips).toContain(`${visual.animationPrefix}_Ground_Idle`);
    expect(clips.some(clip=>clip.startsWith(`${visual.animationPrefix}_Flight_`))).toBe(true);
  }
  expect(sources.find(source=>source.id==='creature.dragon-evolved')?.sourcePath).toBe('asset-library/subjects/fantastical/creature.dragon-evolved/0.1.0/model/dragon.glb');
  await syncAssetCatalog(root,true);
});

it('exports procedural source bytes only to an explicit intake output',async()=>{
  const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');
  const {mkdtemp,mkdir}=await import('node:fs/promises');
  const run=promisify(execFile),root=path.resolve('.');
  const exporter=path.join(root,'packages/creator-host/scripts/assets/export-ski.ts');
  await expect(run(process.execPath,['--import','tsx',exporter],{cwd:root})).rejects.toThrow('Required: --output');
  await expect(run(process.execPath,['--import','tsx',exporter,'--output',path.join(root,'assets','retired-check.glb')],{cwd:root})).rejects.toThrow('EXPORT_REQUIRES_INTAKE_OUTPUT');
  await mkdir(path.join(root,'.codex-tmp'),{recursive:true});
  const temp=await mkdtemp(path.join(root,'.codex-tmp/asset-export-')),output=path.join(temp,'ski.glb');
  await run(process.execPath,['--import','tsx',exporter,'--output',output],{cwd:root});
  const bytes=await readFile(output),details=JSON.parse(await readFile(output+'.intake.json','utf8'));
  expect(bytes.subarray(0,4).toString()).toBe('glTF');
  const document=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  expect(document.nodes.some((node:{name:string})=>node.name==='seat.driver')).toBe(true);
  expect(details.asset.id).toBe('vehicle.ski');
  expect(details.next_step).toContain('asset-library/tools/ingest.mjs');
  await expect(run(process.execPath,['--import','tsx',exporter,'--output',output],{cwd:root})).rejects.toThrow();
},30000);
