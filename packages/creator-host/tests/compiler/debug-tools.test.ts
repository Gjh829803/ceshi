import {afterEach,expect,it} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ThreeCompiler} from '../../src/compiler/compiler';
import {ThreeCreatorTools} from '../../src/tools/tools';
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'worldkit-debug-build-'));roots.push(root);
 await writeFile(path.join(root,'index.html'),'<html><body><script type="module" src="./main.ts"></script></body></html>');
 await writeFile(path.join(root,'main.ts'),"import {createWorld} from '@worldkit/three'; console.log(createWorld);");return root;}
it('uses identical core bytes, isolates optional debug bundles and binds automatic mounting to exact build identity',async()=>{
 const root=await fixture(),production=await new ThreeCompiler(root,'three-sdk').prepare(),debug=await new ThreeCompiler(root,'three-sdk',{debugTools:true}).prepare();
 expect(debug.runtimeHash).not.toBe(production.runtimeHash);
 expect(debug.files['playable/runtime/worldkit-three.js']).toBe(production.files['playable/runtime/worldkit-three.js']);
 expect(Object.keys(production.files).some(name=>name.includes('worldkit-debug')||name.includes('debug-tools.js'))).toBe(false);
 const prodHtml=await readFile(path.join(production.playableRoot,'index.html'),'utf8'),debugHtml=await readFile(path.join(debug.playableRoot,'index.html'),'utf8');
 expect(prodHtml).not.toContain('worldkit-debug-identity');expect(debugHtml).toContain(debug.worldBuildHash);expect(debugHtml).toContain('./runtime/debug-tools.js');
 const bundle=await readFile(path.join(debug.playableRoot,'runtime/worldkit-debug.js'),'utf8');
 expect(bundle).toContain('mountDebugPanel');expect(bundle).toContain('@worldkit/three');expect(bundle).not.toContain('class WorldEngine');expect(bundle).not.toContain('/__playground-diagnostics');
 const service=new ThreeCreatorTools(root,'three-sdk',{debugTools:true});try{await expect(service.submit()).rejects.toThrow('THREE_DEBUG_BUILD_NOT_DELIVERABLE');}finally{await service.close();}
},30000);
it('builds debug tools from materialized runtime bytes and rejects author imports in production',async()=>{
 const root=await fixture(),compiler=new ThreeCompiler(root,'three-sdk',{debugTools:true});await compiler.materializeRuntime();
 const entry=path.join(root,'sdk/three-world/src/debug/index.ts');await writeFile(entry,(await readFile(entry,'utf8'))+'\nexport const debugFixtureIdentity="PROJECT_OWNED_DEBUG";');
 const result=await compiler.prepare();expect(result.runtimeSourceHash).toMatch(/^[a-f0-9]{64}$/);
 expect(await readFile(path.join(result.playableRoot,'runtime/worldkit-debug.js'),'utf8')).toContain('PROJECT_OWNED_DEBUG');
 await writeFile(path.join(root,'main.ts'),"import {mountDebugPanel} from '@worldkit/three/debug'; console.log(mountDebugPanel);");
 await expect(new ThreeCompiler(root,'three-sdk').prepare()).rejects.toThrow('THREE_IMPORT_NOT_ALLOWED');
 await writeFile(entry,'export const missingDebugCapabilities=true;');
 await expect(new ThreeCompiler(root,'three-sdk',{debugTools:true}).prepare()).rejects.toThrow('THREE_DEBUG_RUNTIME_CAPABILITY_MISSING');
},30000);
