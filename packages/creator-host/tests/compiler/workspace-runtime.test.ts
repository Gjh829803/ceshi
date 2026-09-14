import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,rm,symlink,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ThreeCompiler,REPOSITORY_ROOT} from '../../src/compiler/compiler';
import {ThreeCreatorTools} from '../../src/tools/tools';
import {executeThreeCreatorTool} from '../../src/cli/mcp';
const roots:string[]=[];
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'workspace-sdk-'));roots.push(root);
 await writeFile(path.join(root,'index.html'),'<html><script type="module" src="./main.ts"></script></html>');
 await writeFile(path.join(root,'main.ts'),"import {createWorld} from '@worldkit/three'; window.createWorld=createWorld;");return root;}
afterEach(async()=>{vi.unstubAllEnvs();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

it('materializes only runtime sources, compiles edits and packages the exact source identity',async()=>{
 const root=await fixture(),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const result:any=await executeThreeCreatorTool(service,'creator_materialize_runtime',{});
  expect(result).toMatchObject({directory:'sdk',created:true});
  expect(result.runtimeSourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(result).not.toHaveProperty('sourceHash');
  const sources=await service.compiler.sourceFiles();
  expect(sources.has('sdk/three-world/src/world.ts')).toBe(true);
  expect(sources.has('sdk/camera-collision/src/index.ts')).toBe(true);
  expect([...sources.keys()].some(name=>name.includes('.test.')||name.includes('apps/creator-cloud')||name.includes('auth.json'))).toBe(false);
  const first=await service.compiler.prepare();expect(first.runtimeSourceHash).toBe(result.runtimeSourceHash);
  const index=path.join(root,'sdk/three-world/src/index.ts');await writeFile(index,(await readFile(index,'utf8'))+'\nconsole.info("WORKSPACE_RUNTIME_EDIT");\n');
  const next=await service.compiler.prepare();
  expect(next.runtimeHash).not.toBe(first.runtimeHash);expect(next.runtimeSourceHash).not.toBe(first.runtimeSourceHash);
  expect(next.worldBuildHash).not.toBe(first.worldBuildHash);
  expect(await readFile(path.join(next.playableRoot,'runtime/worldkit-three.js'),'utf8')).toContain('WORKSPACE_RUNTIME_EDIT');
  expect(await readFile(path.join(next.sourceRoot,'sdk/three-world/src/index.ts'),'utf8')).toContain('WORKSPACE_RUNTIME_EDIT');
  const existing=await service.compiler.materializeRuntime();
  expect(existing).toMatchObject({created:false,runtimeSourceHash:next.runtimeSourceHash});
  expect(existing).not.toHaveProperty('sourceHash');
 }finally{await service.close();}
});

it('uses explicit workspace SDK source despite an unrelated host prebuilt cache and never runs author configuration',async()=>{
 const root=await fixture(),compiler=new ThreeCompiler(root,'three-sdk');await compiler.materializeRuntime();
 vi.stubEnv('WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT','/not-a-runtime-cache');
 await writeFile(path.join(root,'esbuild.config.js'),"throw new Error('AUTHOR_CONFIG_EXECUTED');");
 await writeFile(path.join(root,'sdk/package.json'),JSON.stringify({scripts:{build:'touch unwanted-host-file'},main:'../../outside.js'}));
 await expect(compiler.prepare()).resolves.toHaveProperty('runtimeSourceHash');
});

it.each(["import fs from 'node:fs'; console.log(fs);", "import x from '../../../main.ts'; console.log(x);", "import x from 'unlisted-package'; console.log(x);"])(
 'rejects out-of-bound workspace SDK imports: %s',async source=>{
 const root=await fixture(),compiler=new ThreeCompiler(root,'three-sdk');await compiler.materializeRuntime();
 await writeFile(path.join(root,'sdk/three-world/src/index.ts'),source+'\nexport const createWorld=()=>{};');
 await expect(compiler.prepare()).rejects.toThrow(/THREE_RUNTIME_IMPORT/);
});
it('rejects changed dependency pins and symlinked SDK source',async()=>{
 const root=await fixture(),compiler=new ThreeCompiler(root,'three-sdk');await compiler.materializeRuntime();
 const manifest=path.join(root,'sdk/runtime.json'),bytes=await readFile(manifest);const value=JSON.parse(bytes.toString());value.dependencyIdentity='0'.repeat(64);await writeFile(manifest,JSON.stringify(value));
 await expect(compiler.prepare()).rejects.toThrow('THREE_RUNTIME_DEPENDENCY_IDENTITY_MISMATCH');
 await writeFile(manifest,bytes);await symlink(path.join(REPOSITORY_ROOT,'package.json'),path.join(root,'sdk/linked.json'));
 await expect(compiler.prepare()).rejects.toThrow(/SYMLINK/);
});
it('does not allow sdk root symlinks or direct author imports that duplicate runtime ownership',async()=>{
 const root=await fixture(),compiler=new ThreeCompiler(root,'three-sdk');await compiler.materializeRuntime();
 await writeFile(path.join(root,'main.ts'),"import {createWorld} from './sdk/three-world/src/index'; window.createWorld=createWorld;");
 await expect(compiler.prepare()).rejects.toThrow('THREE_RUNTIME_IMPORT_USE_PUBLIC_PACKAGE');
 const linked=await fixture();await symlink(path.join(root,'sdk'),path.join(linked,'sdk'));
 await expect(new ThreeCompiler(linked,'three-sdk').materializeRuntime()).rejects.toThrow('THREE_RUNTIME_SOURCE_SYMLINK');
});
it('requires the SDK profile before materialization',async()=>{
 const compiler=new ThreeCompiler(await fixture(),'three-raw');await expect(compiler.materializeRuntime()).rejects.toThrow('THREE_RUNTIME_SOURCE_REQUIRES_SDK');
});

it('builds identical browser bytes from the same workspace SDK source in separate directories',async()=>{
 const first=await fixture(),second=await fixture(),a=new ThreeCompiler(first,'three-sdk'),b=new ThreeCompiler(second,'three-sdk');
 await a.materializeRuntime();await cp(path.join(first,'sdk'),path.join(second,'sdk'),{recursive:true});
 const one=await a.prepare(),two=await b.prepare();
 expect(two.runtimeSourceHash).toBe(one.runtimeSourceHash);expect(two.runtimeHash).toBe(one.runtimeHash);
 const browser=await readFile(path.join(one.playableRoot,'runtime/worldkit-three.js'),'utf8');expect(browser).not.toContain(first);
});

it('includes the actual migrated camera snapshot bytes in Creator source and build identity',async()=>{
 const root=await fixture(),compiler=new ThreeCompiler(root,'three-sdk');
 await mkdir(path.join(root,'config'));
 const cameraBytes=await readFile(path.join(REPOSITORY_ROOT,'apps/sdk-playground/config/camera.json'),'utf8');
 await writeFile(path.join(root,'config/camera.json'),cameraBytes);
 await writeFile(path.join(root,'main.ts'),"import {parseCameraDocument} from '@worldkit/three'; import cameraData from './config/camera.json'; window.cameraDocument=parseCameraDocument(cameraData);");
 const first=await compiler.prepare();
 expect(await readFile(path.join(first.sourceRoot,'config/camera.json'),'utf8')).toBe(cameraBytes);
 const changed=JSON.parse(cameraBytes);changed.presets['person.third-person'].values.position.distanceMeters=9;
 await writeFile(path.join(root,'config/camera.json'),JSON.stringify(changed));
 const next=await compiler.prepare();expect(next.sourceHash).not.toBe(first.sourceHash);expect(next.worldBuildHash).not.toBe(first.worldBuildHash);
});
