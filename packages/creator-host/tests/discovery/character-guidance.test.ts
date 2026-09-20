import {mkdtemp,rm,writeFile as writeFixtureFile,readFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const writeFile:typeof writeFixtureFile=async(file,data,options)=>{await mkdir(path.dirname(String(file)),{recursive:true});return writeFixtureFile(file,data,options);};
import {afterEach,expect,it} from 'vitest';
import {ThreeCreatorTools} from '../../src/tools/tools';
import {executeThreeCreatorTool} from '../../src/cli/mcp';
import {createAssetPolicySnapshot,assetPolicyHash} from '../../src/assets/asset-policy.mjs';
import contentCatalog from '../../../../asset-library/dist/whitebox/asset-catalog.json';
import {composeAssetCatalog} from '@worldkit/preset-content/assets/host-adapter';
const catalog={...contentCatalog,assets:composeAssetCatalog(contentCatalog.assets)};
import Ajv from 'ajv';
import {EPISODE_SCHEMA} from '../../src/contracts';
import {Group,PerspectiveCamera,Vector3} from 'three';
import {createWorld,humanoid} from '@worldkit/three';
import {map} from '../../../../examples/three-creator/character-actions/map';
const roots:string[]=[];
async function root(){const dir=await mkdtemp(path.join(os.tmpdir(),'character-guide-'));roots.push(dir);return dir;}
afterEach(async()=>{await Promise.all(roots.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});

it.each(['放下','坐下','起身','蹲伏','切换泳姿'])('discovers the actual control or skill %s',async query=>{
 const service=new ThreeCreatorTools(await root(),'three-sdk');
 try{expect((await service.assets(query)).assets.map(asset=>asset.id)).toContain('humanoid.uefn-mannequin');}
 finally{await service.close();}
});

it('discovers the full kit by Chinese skill names and exposes actual skill conditions',async()=>{
 const service=new ThreeCreatorTools(await root(),'three-sdk');
 try{
  const found:any=await executeThreeCreatorTool(service,'assets_search',{query:'滑铲'});
  expect(found.assets.map((asset:any)=>asset.id)).toContain('humanoid.uefn-mannequin');
  const detail:any=await executeThreeCreatorTool(service,'assets_describe',{assetId:'humanoid.uefn-mannequin'});
  const usage=detail.characterUsage[0];
  expect(usage.clipCount).toBe(48);expect(usage.skillRequests).toHaveLength(6);
  expect(usage.skillRequests.find((skill:any)=>skill.id==='slide').requires).toContain('speed>=2.5m/s');
  expect(usage.controlBindings.roll.code).toBe('KeyQ');
  expect(usage.schemaTopic).toBe('character-actions');expect(usage.exampleTopic).toBe('getting-started');
 }finally{await service.close();}
});

it('provides a character-only example and the actual interaction/input contracts',async()=>{
 const service=new ThreeCreatorTools(await root(),'three-sdk');
 try{
  const schema:any=await executeThreeCreatorTool(service,'creator_get_authoring_schema',{topic:'character-actions',sections:['guide','humanoid']});
  expect(schema.humanoidSourceContracts['humanoid-runtime/humanoid/action-schema.ts']).toContain('interface SkillRequest');
  expect(schema.humanoidSourceContracts['humanoid-runtime/environment/types.ts']).toContain('interface MapClimbSurface');
  expect(schema.humanoidSourceContracts['humanoid-runtime/environment/types.ts']).toContain('rigidGroup?');
  expect(schema.sdkGuide).toContain('EnvironmentBox.rigidGroup');
  expect(schema.sdkGuide).toContain('propBoxPose(id)');
  const example:any=await service.examples('character-actions');
  expect(JSON.parse(example.files['project.json']).assetIds).toEqual(['humanoid.uefn-mannequin']);
  const checkEpisode=new Ajv({strict:false}).compile(EPISODE_SCHEMA);
  expect(checkEpisode(JSON.parse(example.files['episode.json'])),JSON.stringify(checkEpisode.errors)).toBe(true);
  for(const [file,content]of Object.entries(example.files))await writeFile(path.join(service.workspace,file),String(content));
  const candidate=await service.compiler.prepare();
  const definitions=JSON.parse(await readFile(path.join(candidate.playableRoot,'asset-definitions.json'),'utf8'));
  expect(definitions.assets).toHaveLength(1);expect(definitions.assets[0].animationClips).toHaveLength(48);
 }finally{await service.close();}
});

it('keeps raw model discovery explicit about implementing its own controller',async()=>{
 const raw=new ThreeCreatorTools(await root(),'three-raw');
 try{
  const detail:any=await raw.assets('','humanoid.uefn-mannequin');
  expect(detail.characterUsage[0].schemaTopic).toBeUndefined();
  expect(detail.characterUsage[0].skillRequests).toBeUndefined();
  expect(detail.characterUsage[0].integration).toBe('three-model-and-clips');
 }finally{await raw.close();}
});

it('lets the character push the example furniture while preserving support, assembly and reset',async()=>{
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},
  humanoid:{map,character:{instanceId:'person',object:new Group()},vehicles:[]}});
 try{
  const runtime=world.humanoid!,q=runtime.simulation.environment;
  const initialProps=map.boxes.filter(box=>box.rigidGroup).map(box=>({id:box.id,pose:q.propBoxPose(box.id)}));
  const seat=q.colliderForId('seat')!,back=q.colliderForId('seat-back')!;
  const body=seat.parent();expect(body?.isDynamic()).toBe(true);
  expect(back.parent()!.handle).toBe(body!.handle);expect(body!.mass()).toBeCloseTo(8);
  world.step({},180);
  // Legs must support the surfaces at their interaction heights under gravity.
  expect(seat.translation().y).toBeCloseTo(.41,2);
  expect(q.colliderForId('pickup-table')!.translation().y).toBeCloseTo(.799,2);
  expect(world.snapshot().humanoid!.interactionTargets.find(t=>t.id==='parcel')!.positionWorldMetersXYZ[1]).toBeGreaterThan(.88);
  const origin=new Vector3().copy(seat.translation());
  const spacing=origin.distanceTo(new Vector3().copy(back.translation()));
  expect(runtime.prepareCharacter([1,.02,-6.7],0)).toBe(true);
  runtime.setInput({...humanoid.emptyInput(),forward:1});world.step({},120);runtime.clearInput();
  expect(new Vector3().copy(seat.translation()).distanceTo(origin)).toBeGreaterThan(.25);
  expect(new Vector3().copy(seat.translation()).distanceTo(new Vector3().copy(back.translation()))).toBeCloseTo(spacing,4);
  expect(q.colliderForId('wall')!.translation()).toEqual({x:-16,y:1.5,z:-7});
  await world.reset();
  // World reset may replace the simulation: read the current owner again.
  for(const prop of initialProps){
   expect(runtime.simulation.environment.propBoxPose(prop.id)).toEqual(prop.pose);
  }
 }finally{world.dispose();}
});
