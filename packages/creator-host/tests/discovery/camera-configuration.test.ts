import {afterEach,expect,it} from 'vitest';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ThreeCreatorTools} from '../../src/tools/tools';
import {executeThreeCreatorTool} from '../../src/cli/mcp';
const services:ThreeCreatorTools[]=[];
afterEach(async()=>{for(const service of services.splice(0)){await service.close();await rm(service.workspace,{recursive:true,force:true});}});
it('discovers the camera document and ordinary eye capability from the actual SDK, and invalidates stale metadata',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'camera-discovery-')),service=new ThreeCreatorTools(root,'three-sdk');services.push(service);
 await service.materializeRuntime();
 const discover=()=>executeThreeCreatorTool(service,'creator_get_authoring_schema',{topic:'nonhuman-subject',sections:['contracts']}) as Promise<any>;
 const before=await discover();
 expect(before.cameraConfiguration.status).toBe('available');
 expect(before.cameraConfiguration.schema.properties.schemaVersion).toBeDefined();
 const help=before.cameraConfiguration.fields.find((field:any)=>field.kind==='third-person'&&field.path==='orientation.recenter.yawTarget');
 expect(help.schema.description).toContain('movement-direction');
 expect(help.schema.oneOf.map((branch:any)=>branch.properties.kind.const)).toEqual(['subject-forward','movement-direction','world-forward']);
 expect(before.cameraConfiguration.fields.find((field:any)=>field.kind==='third-person'&&field.path==='orientation.recenter.yawHalfLifeSeconds').schema.description).toContain('误差减半');
 expect(before.sdkContracts).not.toContain('headingFollow');
 expect(before.sdkContracts).toContain('eyePositionLocalMetersXYZ');
 expect(before.sdkContracts).toContain('setCameraView');
 expect(before.cameraSourceContracts['config/camera/humanoid.ts']).toContain('createHumanoidCameraDocument');
 expect(before.cameraSourceContracts['config/camera/serialization.ts']).toContain('parseCameraDocument');
 const file=path.join(root,'sdk/three-world/src/config/camera/fields.ts');
 await writeFile(file,(await readFile(file,'utf8'))+'\nexport interface ChangedCameraContract { marker: true }\nexport const UNSAFE=(()=>{throw new Error("DO_NOT_EXECUTE");})();\n');
 const after=await discover();
 expect(after.runtimeGuidance.runtimeSourceHash).not.toBe(before.runtimeGuidance.runtimeSourceHash);
 expect(after.cameraConfiguration).toMatchObject({status:'unavailable',reason:'source-mismatch'});
 expect(after.cameraSourceContracts['config/camera/fields.ts']).toContain('ChangedCameraContract');
 expect(after.cameraConfiguration).not.toHaveProperty('schema');
 await rm(path.join(root,'sdk/three-world/src/config/camera/discovery.generated.json'));
 expect((await discover()).cameraConfiguration).toMatchObject({status:'unavailable',reason:'artifact-missing-or-invalid'});
});

it('exposes changed schema after trusted maintenance regeneration',async()=>{
 const {mkdir,copyFile,symlink}=await import('node:fs/promises');
 const {execFileSync}=await import('node:child_process');
 const root=await mkdtemp(path.join(os.tmpdir(),'camera-regeneration-')),service=new ThreeCreatorTools(root,'three-sdk');services.push(service);
 await service.materializeRuntime();
 const file=path.join(root,'sdk/three-world/src/config/camera/fields.ts');
 await writeFile(path.join(root,'sdk/three-world/src/config/camera-discovery-fixture.ts'),'export const description="Fixture schema description";');
 await writeFile(file,"import {description} from '../camera-discovery-fixture';\n"+(await readFile(file,'utf8')).replace('schemaVersion: { const: 1 }','schemaVersion: { const: 1, description }'));
 const discover=()=>executeThreeCreatorTool(service,'creator_get_authoring_schema',{topic:'nonhuman-subject',sections:['contracts']}) as Promise<any>;
 expect((await discover()).cameraConfiguration.status).toBe('unavailable');
 // This test explicitly invokes the trusted maintenance tool against known fixture
 // source. Production discovery never executes this tool or workspace TypeScript.
 await writeFile(path.join(root,'sdk/three-world/package.json'),JSON.stringify({type:'module'}));
 const scripts=path.join(root,'sdk/three-world/scripts');await mkdir(scripts);
 await copyFile('packages/three-world/scripts/generate-camera-validator.ts',path.join(scripts,'generate-camera-validator.ts'));
 await symlink(path.resolve('node_modules'),path.join(root,'node_modules'));
 execFileSync(process.execPath,['--import','tsx',path.join(scripts,'generate-camera-validator.ts')],{cwd:process.cwd(),stdio:'pipe'});
 const result=await discover();
 expect(result.cameraConfiguration.status).toBe('available');
 expect(result.cameraConfiguration.schema.properties.schemaVersion.description).toBe('Fixture schema description');
 expect(result.cameraConfiguration.sourceInventory).toHaveProperty('config/camera-discovery-fixture.ts');
 await writeFile(path.join(root,'sdk/three-world/src/config/camera-discovery-fixture.ts'),'export const description="Changed imported value";');
 expect((await discover()).cameraConfiguration).toMatchObject({status:'unavailable',reason:'source-mismatch'});
},20000);


it('routes production Agents to preset inheritance, view selection and authored camera control', async () => {
 const root=await mkdtemp(path.join(os.tmpdir(),'camera-customization-'));
 const service=new ThreeCreatorTools(root,'three-sdk');services.push(service);
 const environment=await executeThreeCreatorTool(service,'creator_describe_environment',{}) as any;
 const request=environment.cameraAuthoring.authoring;
 const result=await executeThreeCreatorTool(service,request.tool,request.arguments) as any;
 expect(result.sdkGuide).toContain('### Defaults and custom views');
 expect(result.sdkGuide).toContain('createHumanoidCameraDocument');
 expect(result.sdkGuide).toContain('shared view overrides still apply to both');
 expect(result.sdkGuide).toContain('binding.subjectOverrides[vehicleInstanceId].views[viewId].overrides');
 expect(result.sdkGuide).toContain('disabling recentering alone does not disable this inheritance');
 expect(result.sdkGuide).toContain('cameraPresetSnapshots');
 expect(result.sdkGuide).toContain('same kind does not inherit');
 expect(result.sdkGuide).toContain('does not automatically select it');
 expect(result.sdkGuide).toContain('resumeCameraViewSelection');
 expect(result.sdkGuide).toContain('### Authored camera control');
 expect(result.sdkGuide).toContain('world.useAuthoredCamera()');
 expect(result.sdkGuide).toContain("world.cameraMode === 'authored'");
 const guide=result.sdkGuide.replace(/\s+/g,' ');
 expect(guide).toContain('following, recentering and camera collision are inactive');
 expect(guide).toContain('stop authored camera writes and call `world.setCameraFollow({configuration})`');
 const schema=await executeThreeCreatorTool(service,'creator_get_authoring_schema',{topic:'getting-started',sections:['contracts']}) as any;
 expect(schema.sdkContracts).toContain('resumeCameraViewSelection');
 for(const member of ['useAuthoredCamera','cameraMode','onUpdate'])expect(schema.sdkContracts).toContain(member);
 const nonhuman=await executeThreeCreatorTool(service,'creator_get_authoring_schema',{topic:'nonhuman-subject',sections:['contracts']}) as any;
 for(const member of ['useAuthoredCamera','cameraMode','onUpdate','setCameraFollow'])expect(nonhuman.sdkContracts).toContain(member);
 expect(schema.cameraConfiguration.schema.properties.viewSelection.properties.rules.items.properties.when.properties.state.enum).toEqual(['swimming']);
});
