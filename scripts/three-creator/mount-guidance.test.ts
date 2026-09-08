import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {ThreeCreatorTools} from './tools';
import {executeThreeCreatorTool} from './mcp';
import {createAssetPolicySnapshot,assetPolicyHash} from './asset-policy.mjs';
import catalog from '../../assets/three-creator/asset-catalog.json';
import Ajv from 'ajv';
import {EPISODE_SCHEMA} from './contracts';
const roots:string[]=[];
async function root(){const dir=await mkdtemp(path.join(os.tmpdir(),'mount-guide-'));roots.push(dir);return dir;}
afterEach(async()=>{await Promise.all(roots.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
it('discovers horse integration and only its required example assets',async()=>{
 const service=new ThreeCreatorTools(await root(),'three-sdk');
 try {
  const found:any=await executeThreeCreatorTool(service,'assets_search',{query:'骑马'});
  expect(found.assets.map((asset:any)=>asset.id)).toContain('training.horse');
  expect(found.mountUsage[0].integrationReady).toBe(true);
  const example:any=await executeThreeCreatorTool(service,'creator_get_examples',{topic:'mounted-interaction'});
  const ids=JSON.parse(example.files['project.json']).assetIds;
  expect(ids).toEqual(['humanoid.source-101','training.horse']);
  expect(found.mountUsage[0].requiredAssetIds).toEqual(ids);
  expect(example.files['main.ts']).toContain('TrainingHorse');
  expect(example.files['main.ts']).not.toContain('training.approach');
  const validate=new Ajv({strict:false}).compile(EPISODE_SCHEMA);
  expect(validate(JSON.parse(example.files['episode.json'])),JSON.stringify(validate.errors)).toBe(true);
  expect(validate({schemaVersion:1,steps:[{keysDown:['F'],keysUp:['f'],durationSeconds:1}],targets:[]})).toBe(true);
  expect(validate({schemaVersion:1,steps:[{keysDown:['Bogus'],durationSeconds:1}],targets:[]})).toBe(false);
  for(const [file,content]of Object.entries(example.files))await writeFile(path.join(service.workspace,file),String(content));
  const candidate=await service.compiler.prepare();
  const definitions=JSON.parse(await readFile(path.join(candidate.playableRoot,'asset-definitions.json'),'utf8'));
  expect(definitions.assets.map((a:any)=>a.id)).toEqual(ids);
  expect(definitions.assets.flatMap((a:any)=>a.resources??[]).map((r:any)=>r.path)).not.toContain('creatures/dragon.glb');
  const schema:any=await service.schema('mounted-interaction' as any);
  expect(schema.trainingSourceContracts['horse.ts']).toContain('class TrainingHorse');
  expect(schema.trainingSourceContracts['horse.ts']).toContain('load(resolve: TrainingResourceResolver): Promise<void>');
  expect(schema.trainingSourceContracts['horse.ts']).not.toContain('mixer');
  expect(schema.trainingSourceContracts['runtime.ts']).toContain('interface TrainingOptions');
  expect(schema.sdkGuide).toContain('Imported horse');
 }finally{await service.close();}
});
it.each(['training.horse','humanoid.source-101'])('reports missing %s without offering executable mounted guidance',async missing=>{
 const allowed=['humanoid.preset-101','humanoid.source-101','training.horse'].filter(id=>id!==missing);
 const snapshot=createAssetPolicySnapshot({schemaVersion:1,allowedAssetIds:allowed,defaultHumanoidAssetId:'humanoid.preset-101',allowCustomAssets:true},catalog.assets);
 const file=path.join(await root(),'policy.json');await writeFile(file,JSON.stringify(snapshot));
 const service=new ThreeCreatorTools(await root(),'three-sdk',{assetPolicySnapshotPath:file,assetPolicySha256:assetPolicyHash(snapshot)});
 try {
  await expect(service.examples('mounted-interaction' as any)).rejects.toThrow(missing);
  const schema:any=await service.schema('mounted-interaction' as any);
  expect(schema.trainingExampleTopic).toBeUndefined();expect(schema.sdkGuide).not.toContain('new TrainingHorse');
  const detail:any=await service.assets('','training.horse');
  if(missing==='humanoid.source-101'){expect(detail.assets).toHaveLength(1);expect(detail.mountUsage[0].missingAssetIds).toEqual([missing]);expect(detail.mountUsage[0].exampleTopic).toBeUndefined();}
 }finally{await service.close();}
});
it('keeps raw horse discovery truthful',async()=>{
 const service=new ThreeCreatorTools(await root(),'three-raw');
 try {const detail:any=await service.assets('','training.horse');expect(detail.mountUsage[0].integrationReady).toBe(false);expect(detail.mountUsage[0].schemaTopic).toBeUndefined();expect(detail.mountUsage[0].limitations.join(' ')).toContain('no Training');}finally{await service.close();}
});
