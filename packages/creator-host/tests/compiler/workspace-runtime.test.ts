import {afterEach,expect,it,vi,type TestContext} from 'vitest';
import {AsyncLocalStorage} from 'node:async_hooks';
import {WorkspaceTestFiles} from './workspace-test-files';
import {writeFile,readFile,symlink,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
import {ThreeCompiler,REPOSITORY_ROOT} from '../../src/compiler/compiler';
import {ThreeCreatorTools} from '../../src/tools/tools';
import {executeThreeCreatorTool} from '../../src/cli/mcp';
const scopes=new AsyncLocalStorage<WorkspaceTestFiles>();
type Stage = {stage:string;elapsedMs:number};
type TestRecord = {files:WorkspaceTestFiles;started:number;stages:Stage[];beforeCleanup?:{elapsedMs:number;stages:Stage[]}};
const testFiles=new Map<string,TestRecord>();
function mark(record:TestRecord,stage:string){record.stages.push({stage,elapsedMs:performance.now()-record.started});}
function runWorkspaceTest(context:TestContext,work:(mark:(stage:string)=>void)=>Promise<void>){
 const files=new WorkspaceTestFiles(),record:TestRecord={files,started:performance.now(),stages:[]};
 testFiles.set(context.task.id,record);
 const stage=(name:string)=>mark(record,name);
 context.onTestFailed(()=>{
  process.stderr.write('CREATOR_WORKSPACE_TEST_STAGES '+JSON.stringify({test:context.task.name,elapsedMs:performance.now()-record.started,beforeCleanup:record.beforeCleanup,stages:record.stages})+'\n');
 });
 return scopes.run(files,()=>files.run(async()=>{
  stage('work:start');try{await work(stage);}finally{stage('work:settled');}
 }));
}
function workspaceTest(name:string,work:(mark:(stage:string)=>void)=>Promise<void>){it(name,context=>runWorkspaceTest(context,work));}
async function fixture(){const files=scopes.getStore();if(!files)throw Error('WORKSPACE_TEST_SCOPE_REQUIRED');const root=await files.createRoot();
 await writeFile(path.join(root,'index.html'),'<html><script type="module" src="./main.ts"></script></html>');
 await writeFile(path.join(root,'main.ts'),"import {createWorld} from '@worldkit/three'; window.createWorld=createWorld;");return root;}
afterEach(async context=>{
 const record=testFiles.get(context.task.id);
 try{
  if(record){
   // onTestFailed runs after cleanup. Preserve the state when the runner stopped
   // waiting, before pending work can settle during the cleanup grace period.
   record.beforeCleanup={elapsedMs:performance.now()-record.started,stages:record.stages.map(stage=>({...stage}))};
   mark(record,'cleanup:start');
   try{await record.files.cleanup();mark(record,'cleanup:complete');}
   catch(error){mark(record,'cleanup:failed');throw error;}
  }
 }finally{testFiles.delete(context.task.id);vi.unstubAllEnvs();}
});

workspaceTest('materializes only runtime sources, compiles edits and packages the exact source identity',async(mark)=>{
 mark('fixture:start');
 const root=await fixture(),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  mark('materialize:start');
  const result:any=await executeThreeCreatorTool(service,'creator_materialize_runtime',{});
  mark('materialize:complete');
  expect(result).toMatchObject({directory:'sdk',created:true});
  expect(result.runtimeSourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(result).not.toHaveProperty('sourceHash');
  mark('source-files:start');
  const sources=await service.compiler.sourceFiles();mark('source-files:complete');
  expect(sources.has('sdk/three-world/src/world.ts')).toBe(true);
  expect(sources.has('sdk/camera-collision/src/index.ts')).toBe(true);
  expect(sources.has('sdk/three-world/src/config/camera/discovery.generated.json')).toBe(true);
  expect([...sources.keys()].some(name=>name.includes('test-fixtures/')||name.endsWith('/main-native-trajectories.json'))).toBe(false);
  expect([...sources.keys()].some(name=>name.includes('.test.')||name.includes('apps/creator-cloud')||name.includes('auth.json'))).toBe(false);
  mark('compile-original:start');
  const first=await service.compiler.prepare();mark('compile-original:complete');expect(first.runtimeSourceHash).toBe(result.runtimeSourceHash);
  mark('edit-source:start');
  const index=path.join(root,'sdk/three-world/src/index.ts');await writeFile(index,(await readFile(index,'utf8'))+'\nconsole.info("WORKSPACE_RUNTIME_EDIT");\n');
  mark('edit-source:complete');mark('compile-edited:start');
  const next=await service.compiler.prepare();mark('compile-edited:complete');
  expect(next.runtimeHash).not.toBe(first.runtimeHash);expect(next.runtimeSourceHash).not.toBe(first.runtimeSourceHash);
  expect(next.worldBuildHash).not.toBe(first.worldBuildHash);
  expect(await readFile(path.join(next.playableRoot,'runtime/worldkit-three.js'),'utf8')).toContain('WORKSPACE_RUNTIME_EDIT');
  expect(await readFile(path.join(next.sourceRoot,'sdk/three-world/src/index.ts'),'utf8')).toContain('WORKSPACE_RUNTIME_EDIT');
  mark('materialize-existing:start');
  const existing=await service.compiler.materializeRuntime();mark('materialize-existing:complete');
  expect(existing).toMatchObject({created:false,runtimeSourceHash:next.runtimeSourceHash});
  expect(existing).not.toHaveProperty('sourceHash');
 }finally{mark('service-close:start');await service.close();mark('service-close:complete');}
});

workspaceTest('uses explicit workspace SDK source despite an unrelated host prebuilt cache and never runs author configuration',async(mark)=>{
 mark('fixture:start');
 const root=await fixture(),compiler=new ThreeCompiler(root,'three-sdk');mark('materialize:start');await compiler.materializeRuntime();mark('materialize:complete');
 vi.stubEnv('WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT','/not-a-runtime-cache');
 await writeFile(path.join(root,'esbuild.config.js'),"throw new Error('AUTHOR_CONFIG_EXECUTED');");
 await writeFile(path.join(root,'sdk/package.json'),JSON.stringify({scripts:{build:'touch unwanted-host-file'},main:'../../outside.js'}));
 mark('compile-check:start');
 await expect(compiler.prepare()).resolves.toHaveProperty('runtimeSourceHash');
});

for(const source of ["import fs from 'node:fs'; console.log(fs);", "import x from '../../../main.ts'; console.log(x);", "import x from 'unlisted-package'; console.log(x);"]){
 workspaceTest(`rejects out-of-bound workspace SDK imports: ${source}`,async(mark)=>{
 mark('fixture:start');
 const root=await fixture(),compiler=new ThreeCompiler(root,'three-sdk');mark('materialize:start');await compiler.materializeRuntime();mark('materialize:complete');
 await writeFile(path.join(root,'sdk/three-world/src/index.ts'),source+'\nexport const createWorld=()=>{};');
 mark('compile-check:start');
 await expect(compiler.prepare()).rejects.toThrow(/THREE_RUNTIME_IMPORT/);
 });
}
workspaceTest('rejects changed dependency pins and symlinked SDK source',async(mark)=>{
 mark('fixture:start');
 const root=await fixture(),compiler=new ThreeCompiler(root,'three-sdk');mark('materialize:start');await compiler.materializeRuntime();mark('materialize:complete');
 const manifest=path.join(root,'sdk/runtime.json'),bytes=await readFile(manifest);const value=JSON.parse(bytes.toString());value.dependencyIdentity='0'.repeat(64);await writeFile(manifest,JSON.stringify(value));
 mark('compile-check:start');
 await expect(compiler.prepare()).rejects.toThrow('THREE_RUNTIME_DEPENDENCY_IDENTITY_MISMATCH');
 await writeFile(manifest,bytes);await symlink(path.join(REPOSITORY_ROOT,'package.json'),path.join(root,'sdk/linked.json'));
 mark('compile-check:start');
 await expect(compiler.prepare()).rejects.toThrow(/SYMLINK/);
});
workspaceTest('does not allow sdk root symlinks or direct author imports that duplicate runtime ownership',async(mark)=>{
 mark('fixture:start');
 const root=await fixture(),compiler=new ThreeCompiler(root,'three-sdk');mark('materialize:start');await compiler.materializeRuntime();mark('materialize:complete');
 await writeFile(path.join(root,'main.ts'),"import {createWorld} from './sdk/three-world/src/index'; window.createWorld=createWorld;");
 mark('compile-check:start');
 await expect(compiler.prepare()).rejects.toThrow('THREE_RUNTIME_IMPORT_USE_PUBLIC_PACKAGE');
 mark('linked-fixture:start');
 const linked=await fixture();await symlink(path.join(root,'sdk'),path.join(linked,'sdk'));
 await expect(new ThreeCompiler(linked,'three-sdk').materializeRuntime()).rejects.toThrow('THREE_RUNTIME_SOURCE_SYMLINK');
});
workspaceTest('requires the SDK profile before materialization',async(mark)=>{
 mark('profile-check:start');
 const compiler=new ThreeCompiler(await fixture(),'three-raw');await expect(compiler.materializeRuntime()).rejects.toThrow('THREE_RUNTIME_SOURCE_REQUIRES_SDK');
});

workspaceTest('builds identical browser bytes from the same workspace SDK source in separate directories',async(mark)=>{
 mark('fixtures:start');
 const first=await fixture(),second=await fixture(),a=new ThreeCompiler(first,'three-sdk'),b=new ThreeCompiler(second,'three-sdk');
 mark('materialize:start');await a.materializeRuntime();mark('materialize:complete');
 mark('copy-sdk:start');await cp(path.join(first,'sdk'),path.join(second,'sdk'),{recursive:true});mark('copy-sdk:complete');
 mark('compile-first:start');const one=await a.prepare();mark('compile-first:complete');
 mark('compile-second:start');const two=await b.prepare();mark('compile-second:complete');
 expect(two.runtimeSourceHash).toBe(one.runtimeSourceHash);expect(two.runtimeHash).toBe(one.runtimeHash);
 const browser=await readFile(path.join(one.playableRoot,'runtime/worldkit-three.js'),'utf8');expect(browser).not.toContain(first);
});

workspaceTest('includes the actual migrated camera snapshot bytes in Creator source and build identity',async(mark)=>{
 mark('fixture:start');
 const root=await fixture(),compiler=new ThreeCompiler(root,'three-sdk');
 await mkdir(path.join(root,'config'));
 const cameraBytes=await readFile(path.join(REPOSITORY_ROOT,'apps/sdk-playground/config/camera.json'),'utf8');
 await writeFile(path.join(root,'config/camera.json'),cameraBytes);
 await writeFile(path.join(root,'main.ts'),"import {parseCameraDocument} from '@worldkit/three'; import cameraData from './config/camera.json'; window.cameraDocument=parseCameraDocument(cameraData);");
 mark('compile-original:start');const first=await compiler.prepare();mark('compile-original:complete');
 expect(await readFile(path.join(first.sourceRoot,'config/camera.json'),'utf8')).toBe(cameraBytes);
 const changed=JSON.parse(cameraBytes);changed.presets['person.third-person'].values.position.distanceMeters=9;
 await writeFile(path.join(root,'config/camera.json'),JSON.stringify(changed));
 mark('compile-edited:start');const next=await compiler.prepare();mark('compile-edited:complete');expect(next.sourceHash).not.toBe(first.sourceHash);expect(next.worldBuildHash).not.toBe(first.worldBuildHash);
});
