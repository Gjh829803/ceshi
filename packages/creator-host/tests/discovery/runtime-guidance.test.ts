import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,readFile,writeFile,rm,access,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import ts from 'typescript';
import {ThreeCreatorTools} from '../../src/tools/tools';
import {RuntimeGuidance} from '../../src/discovery/runtime-guidance';
import {executeThreeCreatorTool} from '../../src/cli/mcp';

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

it('finds native diving and exposes its current-source input and water observation contracts',async()=>{
 const service=await fixture();
 const search=await call(service,'assets_search',{query:'潜水'});
 expect(search.assets.map((asset:any)=>asset.id)).toContain('humanoid.uefn-mannequin');
 const schema=await call(service,'creator_get_authoring_schema',{topic:'character-actions',sections:['humanoid','commands']});
 expect(schema.runtimeDefinitions['humanoid-runtime/input-guidance.ts']).toContain('positive ascends, negative dives');
 expect(schema.humanoidSourceContracts['humanoid-runtime/runtime.ts']).toContain('swimmingMode');
});
afterEach(async()=>{await Promise.all(services.splice(0).map(s=>s.close()));await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

it('publishes a valid optional method parameter from the edited workspace runtime',async()=>{
 const service=await fixture(),file=path.join(service.workspace,'sdk/three-world/src/humanoid-runtime/runtime.ts');
 const before=await call(service,'creator_get_authoring_schema',{topic:'humanoid',sections:['humanoid']});
 const original=await readFile(file,'utf8');
 await writeFile(file,original.replace('prepareCharacter(position:Vec3,yaw=0):boolean','prepareCharacter(position:Vec3,yaw:0|1=0):boolean'));
 const result=await call(service,'creator_get_authoring_schema',{topic:'humanoid',sections:['humanoid']});
 expect(result.runtimeGuidance.runtimeSourceHash).not.toBe(before.runtimeGuidance.runtimeSourceHash);
 const declarations=ts.createSourceFile('runtime.ts',result.humanoidSourceContracts['humanoid-runtime/runtime.ts'],ts.ScriptTarget.Latest,true);
 const runtime=declarations.statements.find((node):node is ts.InterfaceDeclaration=>ts.isInterfaceDeclaration(node)&&node.name.text==='HumanoidRuntime');
 const method=runtime?.members.find(node=>node.name?.getText(declarations)==='prepareCharacter');
 if(!method)throw new Error('Missing public prepareCharacter declaration');
 const filename=path.join(service.workspace,'declaration-consumer.ts');
 const source=`type Vec3=readonly [number,number,number];\ninterface Runtime {${method.getText(declarations)}}\ndeclare const runtime:Runtime;\nruntime.prepareCharacter([0,0,0]);\nruntime.prepareCharacter([0,0,0],1);\n// @ts-expect-error The workspace narrowed this parameter to 0 or 1.\nruntime.prepareCharacter([0,0,0],2);\n`;
 const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,strict:true,skipLibCheck:true,noEmit:true,types:[]};
 const host=ts.createCompilerHost(options),readSource=host.getSourceFile.bind(host);
 host.getSourceFile=(name,version,onError,fresh)=>path.normalize(name)===path.normalize(filename)?ts.createSourceFile(name,source,version,true):readSource(name,version,onError,fresh);
 const program=ts.createProgram([filename],options,host),consumer=program.getSourceFile(filename);
 if(!consumer)throw new Error('Missing declaration consumer');
 expect(ts.getPreEmitDiagnostics(program,consumer).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'))).toEqual([]);
},20_000);

it.each(['Math.PI','DEFAULT_YAW'])('keeps guides available with the valid workspace default %s',async initializer=>{
 const service=await fixture(),file=path.join(service.workspace,'sdk/three-world/src/humanoid-runtime/runtime.ts');
 const before=await call(service,'creator_get_authoring_schema',{topic:'humanoid'});
 const imported=initializer==='DEFAULT_YAW';
 if(imported)await writeFile(path.join(path.dirname(file),'guidance-default.ts'),'export const DEFAULT_YAW=0;');
 const source=(await readFile(file,'utf8')).replace('prepareCharacter(position:Vec3,yaw=0):boolean',`prepareCharacter(position:Vec3,yaw=${initializer}):boolean`);
 await writeFile(file,(imported?"import {DEFAULT_YAW} from './guidance-default';\n":'')+source);
 const guide=await call(service,'creator_get_authoring_schema',{topic:'humanoid',sections:['guide']});
 expect(guide.sdkGuide).toEqual(expect.any(String));
 expect(guide.runtimeGuidance.runtimeSourceHash).not.toBe(before.runtimeGuidance.runtimeSourceHash);
 const detail=await call(service,'creator_get_authoring_schema',{topic:'humanoid',sections:['humanoid']});
 expect(detail.runtimeGuidance.runtimeSourceHash).toBe(guide.runtimeGuidance.runtimeSourceHash);
 const sourceFile=ts.createSourceFile('runtime.ts',detail.humanoidSourceContracts['humanoid-runtime/runtime.ts'],ts.ScriptTarget.Latest,true);
 const runtime=sourceFile.statements.find((node):node is ts.InterfaceDeclaration=>ts.isInterfaceDeclaration(node)&&node.name.text==='HumanoidRuntime');
 expect(runtime?.members.some(node=>node.name?.getText(sourceFile)==='setInput')).toBe(true);
 const method=runtime?.members.find((node):node is ts.MethodSignature=>ts.isMethodSignature(node)&&node.name.getText(sourceFile)==='prepareCharacter');
 if(imported){
  expect(method).toBeUndefined();
  expect(detail.humanoidSourceContracts['humanoid-runtime/runtime.ts']).toContain('Declaration unavailable for prepareCharacter');
 }else{
  expect(method?.parameters[1]?.initializer).toBeUndefined();
  expect(method?.parameters[1]?.type?.kind).toBe(ts.SyntaxKind.NumberKeyword);
  expect(method?.parameters[1]?.questionToken).toBeDefined();
 }
},20_000);

it('publishes the current project shadow defaults through presentation discovery',async()=>{
 const service=await fixture(),file=path.join(service.workspace,'sdk/three-world/src/config/presentation.ts');
 await writeFile(file,(await readFile(file,'utf8')).replace('coverageMeters:60','coverageMeters:96'));
 const result=await call(service,'creator_get_authoring_schema',{topic:'presentation',sections:['contracts','humanoid']});
 expect(result.runtimeDefinitions['config/presentation.ts']).toContain('coverageMeters:96');
 expect(result.sdkContracts).toContain('configureShadowLight');
 expect(result.sdkContracts).toContain('interface ShadowSettings');
});

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
 const service=await fixture(),file=path.join(service.workspace,'sdk/three-world/src/config/actions.ts');
 await writeFile(file,(await readFile(file,'utf8')).replace('slideMinimumSpeedMetersPerSecond:2.5','slideMinimumSpeedMetersPerSecond:5'));
 const detail=await call(service,'assets_describe',{assetId:'humanoid.uefn-mannequin'});
 expect(detail.characterUsage[0]).not.toHaveProperty('skillRequests');
 expect(detail.characterUsage[0].runtimeAuthority).toBe('workspace-sdk-source');
 expect(detail.runtimeDefinitions['config/actions.ts']).toContain('slideMinimumSpeedMetersPerSecond:5');
 const schema=await call(service,'creator_get_authoring_schema',{topic:'character-actions',sections:['commands']});
 expect(schema).not.toHaveProperty('characterCapabilities');expect(schema).not.toHaveProperty('controlBindings');
 expect(schema.worldCommandSchema).toBeDefined(); // Host transport remains fixed.
 expect(schema.runtimeDefinitions['config/actions.ts']).toContain('slideMinimumSpeedMetersPerSecond:5');
 const guide=await call(service,'creator_get_authoring_schema',{topic:'character-actions'});
 expect(guide.sdkGuide).not.toContain('2.5');
 const search=await call(service,'assets_search',{query:'滑铲'});
 expect(search.assets.map((asset:any)=>asset.id)).toContain('humanoid.uefn-mannequin');
 expect(search.runtimeGuidance.kind).toBe('workspace-sdk-source');
 const example=await call(service,'creator_get_examples');
 expect(example.exampleAuthority).toBe('host-baseline');
});

it('reads edited vehicle input guidance from the workspace instead of advertising the Host baseline',async()=>{
 const service=await fixture(),file=path.join(service.workspace,'sdk/three-world/src/humanoid-runtime/input-guidance.ts');
 const original=await readFile(file,'utf8'),needle='Brakes velocity; wheeled vehicles also loosen lateral grip for handbrake turns.';
 expect(original).toContain(needle);
 await writeFile(file,original.replace(needle,'Workspace-specific braking'));
 const schema=await call(service,'creator_get_authoring_schema',{topic:'control',sections:['humanoid']});
 expect(schema).not.toHaveProperty('humanoidInputGuides');
 expect(schema.runtimeDefinitions['humanoid-runtime/input-guidance.ts']).toContain('Workspace-specific braking');
});

it('parses authored source without executing initializers and never silently falls back to Host files',async()=>{
 const service=await fixture(),marker=path.join(service.workspace,'host-executed');
 const file=path.join(service.workspace,'sdk/three-world/src/config/actions.ts');
 await writeFile(file,(await readFile(file,'utf8'))+`\nexport const SIDE_EFFECT=(()=>{throw new Error(${JSON.stringify(marker)});})();\n`);
 await expect(call(service,'assets_describe',{assetId:'humanoid.uefn-mannequin'})).resolves.toHaveProperty('runtimeDefinitions');
 await expect(access(marker)).rejects.toThrow();
 await rm(file);
 await expect(call(service,'creator_get_authoring_schema',{topic:'character-actions',sections:['humanoid']})).rejects.toThrow('THREE_RUNTIME_GUIDANCE_SOURCE_MISSING');
 await symlink('/etc/hosts',file);
 await expect(call(service,'assets_search',{query:'horse'})).rejects.toThrow('THREE_RUNTIME_SOURCE_SYMLINK');
});

it('binds live inspection to the same workspace source and its changed action condition',async()=>{
 const service=await fixture(),file=path.join(service.workspace,'sdk/three-world/src/config/actions.ts');
 await writeFile(file,(await readFile(file,'utf8')).replace('slideMinimumSpeedMetersPerSecond:2.5','slideMinimumSpeedMetersPerSecond:5'));
 await writeFile(path.join(service.workspace,'main.ts'),`
import {Group,PerspectiveCamera,Scene} from 'three';
import {createWorld} from '@worldkit/three';
const canvas=document.createElement('canvas');document.body.append(canvas);
const world=await createWorld({scene:new Scene(),canvas,camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{
 map:{id:'audit',name:'Audit',description:'',bounds:{min:[-100,-10,-100],max:[100,50,100]},boxes:[{id:'ground',position:[0,-.5,0],size:[200,1,200]}],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]},
 character:{instanceId:'person',object:new Group()},vehicles:[]}});
world.humanoid.actorController('person').setAvailableClips(new Set(['slide-start','slide-loop','slide-exit']),[]);
await world.start();world.stop();world.step({moveZRatio:-1},120);
`);
 const schema=await call(service,'creator_get_authoring_schema',{topic:'character-actions',sections:['humanoid']});
 const inspected=await service.inspect();
 expect(inspected.runtimeSourceHash).toBe(schema.runtimeGuidance.runtimeSourceHash);
 const snapshot=inspected.observation.snapshot;
 const player=snapshot.entities.find((entity:any)=>entity.id==='person');
 const speed=Math.hypot(...player.motion.velocityWorldMetersPerSecondXYZ);
 expect(speed).toBeGreaterThan(2.5);expect(speed).toBeLessThan(5);
 expect(snapshot.humanoid.characterCapabilities.find((card:any)=>card.id==='slide')).toMatchObject({eligible:false,reason:'SPEED_TOO_LOW'});
 expect(inspected.pageErrors).toEqual([]);expect(inspected.blockedNetworkRequests).toEqual([]);
},20000);

it('does not relabel the synthetic Host factory signature as a workspace contract',async()=>{
 const service=await fixture(),file=path.join(service.workspace,'sdk/three-world/src/world.ts');
 await writeFile(file,(await readFile(file,'utf8')).replace('createWorld(options:WorldOptions={})','createWorld(options:WorldOptions & {auditFactoryOption?:boolean}={})'));
 const schema=await call(service,'creator_get_authoring_schema',{sections:['contracts']});
 expect(schema.sdkContracts).not.toContain('export declare function createWorld(');
 expect(schema.runtimeDefinitions['world.ts']).toContain('auditFactoryOption');
});

it('keeps workspace provenance in guide-only reads without parsing unrequested declarations',async()=>{
 const service=await fixture();
 const source=vi.spyOn(RuntimeGuidance.prototype,'source'),definitions=vi.spyOn(RuntimeGuidance.prototype,'definitions');
 try {
  const guide=await call(service,'creator_get_authoring_schema',{topic:'humanoid',sections:['guide']});
  expect(guide.runtimeGuidance.kind).toBe('workspace-sdk-source');
  expect(guide.sdkGuide).toContain('workspace SDK source');
  expect(source).not.toHaveBeenCalled();expect(definitions).not.toHaveBeenCalled();
  const detail=await call(service,'creator_get_authoring_schema',{topic:'humanoid',sections:['humanoid']});
  expect(definitions).toHaveBeenCalled();
  expect(detail.runtimeGuidance).toEqual(guide.runtimeGuidance);
  expect(detail.availableSections).toEqual(guide.availableSections);
 } finally {source.mockRestore();definitions.mockRestore();}
});
