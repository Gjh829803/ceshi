import {expect,it} from 'vitest';
import {build} from 'esbuild';
import path from 'node:path';

it('keeps optional diagnostics out of the core browser bundle and supports the public debug entry',async()=>{
 const bundle=async(entry:string)=>build({stdin:{contents:`export * from '${entry}';`,resolveDir:path.resolve('packages/three-world')},bundle:true,write:false,metafile:true,platform:'browser',format:'esm',external:['three'],plugins:entry.endsWith('/debug')?[{name:'core-exact-only',setup(plugin){plugin.onResolve({filter:/^@worldkit\/three$/},()=>({path:'@worldkit/three',external:true}));}}]:[],logLevel:'silent'});
 const core=await bundle('@worldkit/three');
 expect(Object.keys(core.metafile!.inputs).filter(name=>name.includes('/src/debug/'))).toEqual([]);
 expect(core.outputFiles[0]!.text).not.toContain('DEBUG_RECORDING_SOURCE_MISMATCH');
 const debug=await bundle('@worldkit/three/debug');
 expect(Object.keys(debug.metafile!.inputs).some(name=>name.endsWith('/src/debug/recording.ts'))).toBe(true);
 expect(Object.keys(debug.metafile!.inputs).some(name=>name.includes('apps/sdk-playground'))).toBe(false);
 expect(Object.keys(debug.metafile!.inputs).some(name=>name.endsWith('/src/engine.ts'))).toBe(false);
 expect(debug.outputFiles[0]!.text).not.toContain('/__playground-diagnostics/');
 const exports=Object.values(debug.metafile!.outputs).flatMap(output=>output.exports);
 expect(exports).toEqual(expect.arrayContaining(['inspectDebugCamera','createDebugControls','createDebugRecording','mountDebugPanel','createCollisionOverlay']));
});
