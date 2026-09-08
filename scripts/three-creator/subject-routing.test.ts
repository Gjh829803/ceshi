import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {afterEach,expect,it} from 'vitest';
import {ThreeCreatorTools} from './tools';
import {executeThreeCreatorTool} from './mcp';
import {openEpisodeBrowser} from '../three-episode/browser';

const services:ThreeCreatorTools[]=[],roots:string[]=[];
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'subject-routing-'));roots.push(root);
 const service=new ThreeCreatorTools(root,'three-sdk');services.push(service);return service;
}
afterEach(async()=>{for(const s of services.splice(0))await s.close();for(const r of roots.splice(0))await rm(r,{recursive:true,force:true});});
const call=(service:ThreeCreatorTools,name:string,args:Record<string,unknown>={})=>executeThreeCreatorTool(service,name,args) as Promise<any>;

it('offers subject-specific existing entry points without adding project fields or extra tool steps',async()=>{
 const service=await fixture(),environment=await call(service,'creator_describe_environment');
 expect(environment.subjectAuthoring.routes.map((r:any)=>r.id)).toEqual(['humanoid','mounted','nonhuman']);
 const starter=await call(service,'creator_get_authoring_schema');
 expect(starter.entryPoint.name).toBe('createWorld');
 const animal=await call(service,'creator_get_authoring_schema',{topic:'nonhuman-subject',sections:['guide','contracts','project']});
 expect(animal.entryPoint.name).toBe('createWorld');expect(animal.exampleTopic).toBe('nonhuman-subject');
 expect(animal.sdkContracts).toContain('setControlledEntity(');
 expect(animal.sdkContracts).toContain('registerMovement');
 expect(animal.humanAuthoring).toBeUndefined();expect(animal.characterCapabilities).toBeUndefined();
 expect(animal.project.required).not.toContain('subjectType');
 const human=await call(service,'creator_get_authoring_schema',{topic:'character-actions'});
 expect(human.entryPoint.name).toBe('createHumanoidWorld');
 const mounted=await call(service,'creator_get_authoring_schema',{topic:'mounted-interaction'});
 expect(mounted.entryPoint.name).toBe('createHumanoidWorld');
});

it('uses current workspace contracts for the nonhuman route and retains raw guidance boundaries',async()=>{
 const service=await fixture();await service.materializeRuntime();
 const file=path.join(service.workspace,'sdk/three-world/src/contracts.ts');
 await writeFile(file,(await readFile(file,'utf8')).replace('readonly jumpSpeedMetersPerSecond?:number;','readonly jumpSpeedMetersPerSecond?:number; readonly subjectProbe?:boolean;'));
 const schema=await call(service,'creator_get_authoring_schema',{topic:'nonhuman-subject',sections:['contracts']});
 expect(schema.sdkContracts).toContain('subjectProbe');
 expect(schema.runtimeGuidance.kind).toBe('workspace-sdk-source');
 expect(schema.runtimeDefinitions['training/humanoid/action-schema.ts']).toBeUndefined();
 const rawRoot=await mkdtemp(path.join(os.tmpdir(),'raw-subject-'));roots.push(rawRoot);
 const raw=new ThreeCreatorTools(rawRoot,'three-raw');services.push(raw);
 const env=await call(raw,'creator_describe_environment');expect(env.subjectAuthoring.routes).toEqual([]);
});

it('runs a nonhuman subject with no humanoid assets, collides, resets and captures through Episode',async()=>{
 const service=await fixture(),example=await call(service,'creator_get_examples',{topic:'nonhuman-subject'});
 expect(JSON.parse(example.files['project.json']).assetIds).toEqual([]);
 for(const [name,value]of Object.entries(example.files))await writeFile(path.join(service.workspace,name),String(value));
 const candidate=await service.compiler.prepare();
 const definitions=JSON.parse(await readFile(path.join(candidate.playableRoot,'asset-definitions.json'),'utf8'));
 expect(definitions.assets).toEqual([]);
 const inspected=await service.inspect();
 expect(inspected.observation.snapshot.controlledEntityId).toBe('fox');
 expect(inspected.observation.snapshot.training).toBeUndefined();
 expect(inspected.observation.snapshot.entities.filter((e:any)=>e.role==='actor').map((e:any)=>e.id)).toEqual(['fox']);
 expect(inspected.feedback.characterContinuity).toMatchObject({status:'not-applicable',issues:[]});
 expect(inspected.pageErrors).toEqual([]);expect(inspected.blockedNetworkRequests).toEqual([]);
 const episode=await openEpisodeBrowser({playableRoot:candidate.playableRoot});
 try{
  const start={positionWorldMetersXYZ:[0,.03,0] as const,facingYawRadians:0};
  await episode.prepareSegment(start,{widthPixels:640,heightPixels:360});
  const first=await episode.frame('image/png'),again=await episode.frame('image/png');expect(again).toEqual(first);
  const moved=await episode.advance({moveZRatio:-1},180),fox=moved.entities.find(e=>e.id==='fox')!;
  expect(fox.positionWorldMetersXYZ[2]).toBeLessThan(-1);
  expect(fox.positionWorldMetersXYZ[2]).toBeGreaterThan(-4);
  expect(moved.training).toBeUndefined();
  await episode.release();await episode.prepareSegment(start,{widthPixels:640,heightPixels:360});
  expect((await episode.frame('image/png')).imageDataUrl).toBe(first.imageDataUrl);
  expect(episode.errors).toEqual([]);
 }finally{await episode.close();}
},30000);
