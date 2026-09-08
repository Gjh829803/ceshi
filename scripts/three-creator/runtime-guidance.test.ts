import {afterEach,expect,it} from 'vitest';
import {mkdtemp,readFile,writeFile,rm,access,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ThreeCreatorTools} from './tools';
import {executeThreeCreatorTool} from './mcp';

const services:ThreeCreatorTools[]=[];
const roots:string[]=[];
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'runtime-guidance-'));roots.push(root);
 await writeFile(path.join(root,'index.html'),'<html><head></head><body><script type="module" src="./main.ts"></script></body></html>');
 await writeFile(path.join(root,'main.ts'),'document.title="Runtime guidance fixture";');
 const service=new ThreeCreatorTools(root,'three-sdk');services.push(service);
 await service.materializeRuntime();return service;
}
const call=(service:ThreeCreatorTools,name:string,args:Record<string,unknown>={})=>executeThreeCreatorTool(service,name,args) as Promise<any>;
afterEach(async()=>{await Promise.all(services.splice(0).map(s=>s.close()));await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

it('reads the current workspace declarations and refreshes their source identity after each edit',async()=>{
 const service=await fixture(),file=path.join(service.workspace,'sdk/three-world/src/contracts.ts');
 const before=await call(service,'creator_get_authoring_schema',{topic:'all',sections:['contracts']});
 await writeFile(file,(await readFile(file,'utf8'))+'\nexport interface RuntimeGuidanceMarker {minimum:5}\n');
 const after=await call(service,'creator_get_authoring_schema',{topic:'all',sections:['contracts']});
 expect(after.sdkContracts).toContain('RuntimeGuidanceMarker');
 expect(after.runtimeGuidance.runtimeSourceHash).not.toBe(before.runtimeGuidance.runtimeSourceHash);
 expect(after.runtimeGuidance.kind).toBe('workspace-sdk-source');
 expect((await service.validate()).runtimeSourceHash).toBe(after.runtimeGuidance.runtimeSourceHash);
});

it('exposes edited skill definitions as source and never advertises host thresholds as active workspace capabilities',async()=>{
 const service=await fixture(),file=path.join(service.workspace,'sdk/three-world/src/training/humanoid/action-schema.ts');
 await writeFile(file,(await readFile(file,'utf8')).replace('slideMinimumSpeedMetersPerSecond:2.5','slideMinimumSpeedMetersPerSecond:5'));
 const detail=await call(service,'assets_describe',{assetId:'humanoid.source-101'});
 expect(detail.characterUsage[0]).not.toHaveProperty('skillRequests');
 expect(detail.characterUsage[0].runtimeAuthority).toBe('workspace-sdk-source');
 expect(detail.runtimeDefinitions['training/humanoid/action-schema.ts']).toContain('slideMinimumSpeedMetersPerSecond:5');
 const schema=await call(service,'creator_get_authoring_schema',{topic:'character-actions',sections:['commands']});
 expect(schema).not.toHaveProperty('characterCapabilities');expect(schema).not.toHaveProperty('controlBindings');
 expect(schema.worldCommandSchema).toBeDefined(); // Host transport remains fixed.
 expect(schema.runtimeDefinitions['training/humanoid/action-schema.ts']).toContain('slideMinimumSpeedMetersPerSecond:5');
 const guide=await call(service,'creator_get_authoring_schema',{topic:'character-actions'});
 expect(guide.sdkGuide).not.toContain('2.5');
 const search=await call(service,'assets_search',{query:'滑铲'});
 expect(search.assets.map((asset:any)=>asset.id)).toContain('humanoid.source-101');
 expect(search.runtimeGuidance.kind).toBe('workspace-sdk-source');
 const example=await call(service,'creator_get_examples');
 expect(example.exampleAuthority).toBe('host-baseline');
});

it('reads edited vehicle input guidance from the workspace instead of advertising the Host baseline',async()=>{
 const service=await fixture(),file=path.join(service.workspace,'sdk/three-world/src/training/input-guidance.ts');
 await writeFile(file,(await readFile(file,'utf8')).replace('Brakes velocity through damping','Workspace-specific braking'));
 const schema=await call(service,'creator_get_authoring_schema',{topic:'control',sections:['training']});
 expect(schema).not.toHaveProperty('trainingInputGuides');
 expect(schema.runtimeDefinitions['training/input-guidance.ts']).toContain('Workspace-specific braking');
});

it('keeps older workspace discovery available when the optional input guide is absent',async()=>{
 const service=await fixture();await rm(path.join(service.workspace,'sdk/three-world/src/training/input-guidance.ts'));
 const schema=await call(service,'creator_get_authoring_schema',{topic:'control',sections:['training']});
 expect(schema.runtimeDefinitions['training/input-guidance.ts']).toContain('unavailable in this workspace SDK');
 expect(schema).not.toHaveProperty('trainingInputGuides');
 expect((await call(service,'assets_describe',{assetId:'humanoid.source-101'})).characterUsage[0].runtimeAuthority).toBe('workspace-sdk-source');
});

it('parses authored source without executing initializers and never silently falls back to Host files',async()=>{
 const service=await fixture(),marker=path.join(service.workspace,'host-executed');
 const file=path.join(service.workspace,'sdk/three-world/src/training/humanoid/action-schema.ts');
 await writeFile(file,(await readFile(file,'utf8'))+`\nexport const SIDE_EFFECT=(()=>{throw new Error(${JSON.stringify(marker)});})();\n`);
 await expect(call(service,'assets_describe',{assetId:'humanoid.source-101'})).resolves.toHaveProperty('runtimeDefinitions');
 await expect(access(marker)).rejects.toThrow();
 await rm(file);
 await expect(call(service,'creator_get_authoring_schema',{topic:'character-actions',sections:['training']})).rejects.toThrow('THREE_RUNTIME_GUIDANCE_SOURCE_MISSING');
 await symlink('/etc/hosts',file);
 await expect(call(service,'assets_search',{query:'horse'})).rejects.toThrow('THREE_RUNTIME_SOURCE_SYMLINK');
});

it('binds live inspection to the same workspace source and its changed action condition',async()=>{
 const service=await fixture(),file=path.join(service.workspace,'sdk/three-world/src/training/humanoid/action-schema.ts');
 await writeFile(file,(await readFile(file,'utf8')).replace('slideMinimumSpeedMetersPerSecond:2.5','slideMinimumSpeedMetersPerSecond:5'));
 await writeFile(path.join(service.workspace,'main.ts'),`
import {Group,PerspectiveCamera,Scene} from 'three';
import {createWorld} from '@worldkit/three';
const canvas=document.createElement('canvas');document.body.append(canvas);
const world=await createWorld({scene:new Scene(),canvas,camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{
 map:{id:'audit',name:'Audit',description:'',bounds:{min:[-100,-10,-100],max:[100,50,100]},boxes:[{id:'ground',position:[0,-.5,0],size:[200,1,200]}],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]},
 character:{instanceId:'person',object:new Group()},vehicles:[]}});
world.training.simulation.setHumanoidAssets(new Set(['slide-start','slide-loop','slide-exit']),[]);
await world.start();world.stop();world.step({moveZRatio:-1},120);
`);
 const schema=await call(service,'creator_get_authoring_schema',{topic:'character-actions',sections:['training']});
 const inspected=await service.inspect();
 expect(inspected.runtimeSourceHash).toBe(schema.runtimeGuidance.runtimeSourceHash);
 const snapshot=inspected.observation.snapshot;
 const player=snapshot.entities.find((entity:any)=>entity.id==='person');
 const speed=Math.hypot(...player.motion.velocityWorldMetersPerSecondXYZ);
 expect(speed).toBeGreaterThan(2.5);expect(speed).toBeLessThan(5);
 expect(snapshot.training.characterCapabilities.find((card:any)=>card.id==='slide')).toMatchObject({eligible:false,reason:'SPEED_TOO_LOW'});
 expect(inspected.pageErrors).toEqual([]);expect(inspected.blockedNetworkRequests).toEqual([]);
},20000);

it('does not relabel the synthetic Host factory signature as a workspace contract',async()=>{
 const service=await fixture(),file=path.join(service.workspace,'sdk/three-world/src/world.ts');
 await writeFile(file,(await readFile(file,'utf8')).replace('createWorld(options:WorldOptions={})','createWorld(options:WorldOptions & {auditFactoryOption?:boolean}={})'));
 const schema=await call(service,'creator_get_authoring_schema',{sections:['contracts']});
 expect(schema.sdkContracts).not.toContain('export declare function createWorld(');
 expect(schema.runtimeDefinitions['world.ts']).toContain('auditFactoryOption');
});
