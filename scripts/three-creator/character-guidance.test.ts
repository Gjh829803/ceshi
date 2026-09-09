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
async function root(){const dir=await mkdtemp(path.join(os.tmpdir(),'character-guide-'));roots.push(dir);return dir;}
afterEach(async()=>{await Promise.all(roots.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});

it.each(['放下','坐下','起身','蹲伏','切换泳姿'])('discovers the actual control or skill %s',async query=>{
 const service=new ThreeCreatorTools(await root(),'three-sdk');
 try{expect((await service.assets(query)).assets.map(asset=>asset.id)).toContain('humanoid.source-101');}
 finally{await service.close();}
});

it('discovers the full kit by Chinese skill names and exposes actual skill conditions',async()=>{
 const service=new ThreeCreatorTools(await root(),'three-sdk');
 try{
  const found:any=await executeThreeCreatorTool(service,'assets_search',{query:'滑铲'});
  expect(found.assets.map((asset:any)=>asset.id)).toContain('humanoid.source-101');
  const detail:any=await executeThreeCreatorTool(service,'assets_describe',{assetId:'humanoid.source-101'});
  const usage=detail.characterUsage[0];
  expect(usage.clipCount).toBe(48);expect(usage.skillRequests).toHaveLength(6);
  expect(usage.skillRequests.find((skill:any)=>skill.id==='slide').requires).toContain('speed>=2.5m/s');
  expect(usage.controlBindings.roll.code).toBe('KeyQ');
  expect(usage.schemaTopic).toBe('character-actions');expect(usage.exampleTopic).toBe('character-actions');
 }finally{await service.close();}
});

it('provides a character-only example and the actual interaction/input contracts',async()=>{
 const service=new ThreeCreatorTools(await root(),'three-sdk');
 try{
  const schema:any=await executeThreeCreatorTool(service,'creator_get_authoring_schema',{topic:'character-actions',sections:['training']});
  expect(schema.trainingSourceContracts['training/humanoid/action-schema.ts']).toContain('interface SkillRequest');
  expect(schema.trainingSourceContracts['training/environment/types.ts']).toContain('interface MapClimbSurface');
  const example:any=await executeThreeCreatorTool(service,'creator_get_examples',{topic:'character-actions'});
  expect(JSON.parse(example.files['project.json']).assetIds).toEqual(['humanoid.source-101']);
  const checkEpisode=new Ajv({strict:false}).compile(EPISODE_SCHEMA);
  expect(checkEpisode(JSON.parse(example.files['episode.json'])),JSON.stringify(checkEpisode.errors)).toBe(true);
  for(const [file,content]of Object.entries(example.files))await writeFile(path.join(service.workspace,file),String(content));
  const candidate=await service.compiler.prepare();
  const definitions=JSON.parse(await readFile(path.join(candidate.playableRoot,'asset-definitions.json'),'utf8'));
  expect(definitions.assets).toHaveLength(1);expect(definitions.assets[0].runtimeActions).toHaveLength(48);
 }finally{await service.close();}
});

it('keeps raw model discovery explicit about implementing its own controller',async()=>{
 const raw=new ThreeCreatorTools(await root(),'three-raw');
 try{
  const detail:any=await raw.assets('','humanoid.source-101');
  expect(detail.characterUsage[0].schemaTopic).toBeUndefined();
  expect(detail.characterUsage[0].skillRequests).toBeUndefined();
  expect(detail.characterUsage[0].integration).toBe('three-model-and-clips');
 }finally{await raw.close();}
});
