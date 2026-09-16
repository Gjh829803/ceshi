import {afterEach,expect,it} from 'vitest';
import {mkdtemp,writeFile,readFile,rm,realpath,symlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {playgroundDiagnosticsPlugin,saveDebugBundle,readDebugRecording} from './diagnostics';
const cleanup:(()=>Promise<unknown>)[]=[];
afterEach(async()=>{for(const work of cleanup.splice(0).reverse())await work();});
async function directory(){const root=await realpath(await mkdtemp(path.join(tmpdir(),'playground-incident-')));cleanup.push(()=>rm(root,{recursive:true,force:true}));return root;}
it('saves immutable local artifacts with actual content hashes and reloads recordings by generated ID',async()=>{
 const root=await directory(),recording={kind:'playground-input-recording',events:[]};
 const result=await saveDebugBundle(root,{metadata:{frameId:3},recording});
 expect(result.directory.startsWith(path.join(root,'.codex-tmp','playground-incidents'))).toBe(true);
 const bytes=await readFile(result.files['incident.json']!.path);
 expect(result.files['incident.json']!.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
 expect(await readDebugRecording(root,result.id)).toEqual(recording);
 const second=await saveDebugBundle(root,{metadata:{frameId:3}});expect(second.id).not.toBe(result.id);
 await expect(readDebugRecording(root,'../../etc/passwd')).rejects.toThrow('DEBUG_BUNDLE_ID_INVALID');
 await expect(saveDebugBundle(root,{metadata:{},directory:'/tmp/arbitrary'})).rejects.toThrow('DEBUG_BUNDLE_INVALID');
 await expect(saveDebugBundle(root,{metadata:{},screenshotDataUrl:'data:text/html;base64,AAAA'})).rejects.toThrow('DEBUG_SCREENSHOT_INVALID');
});
it('rejects symlink output roots before writing an artifact',async()=>{
 const root=await directory(),outside=await directory();await symlink(outside,path.join(root,'.codex-tmp'));
 await expect(saveDebugBundle(root,{metadata:{}})).rejects.toThrow('DEBUG_OUTPUT_SYMLINK');
});
it('requires loopback origin and a scoped session for identity and artifact access',async()=>{
 const root=await directory();execFileSync('git',['init','-q'],{cwd:root});
 execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-qm','fixture'],{cwd:root});
 await writeFile(path.join(root,'index.html'),'<html>fixture</html>');
 const server=await createServer({configFile:false,root,plugins:[playgroundDiagnosticsPlugin(root)],server:{host:'127.0.0.1',port:0}});cleanup.push(()=>server.close());await server.listen();
 const address=server.httpServer!.address();if(!address||typeof address==='string')throw Error('address');const origin=`http://127.0.0.1:${address.port}`;
 const call=(route:string,value:unknown,session='',from=origin)=>fetch(origin+'/__playground-diagnostics/'+route,{method:'POST',headers:{Origin:from,'Content-Type':'application/json','X-Debug-Session':session},body:JSON.stringify(value)});
 expect((await call('session',{},'','https://example.com')).status).toBe(403);
 expect((await call('save',{metadata:{}})).status).toBe(403);
 const session=(await(await call('session',{})).json()).session;
 const identity=await(await call('identity',{},session)).json();expect(identity.sourceHash).toMatch(/^[a-f0-9]{64}$/);expect(identity.head).toMatch(/^[a-f0-9]{40}$/);
 const saved=await(await call('save',{metadata:{source:identity},recording:{kind:'example'}},session)).json();
 expect(await(await call('load',{id:saved.id},session)).json()).toEqual({kind:'example'});
 expect((await call('load',{id:saved.id},'wrong')).status).toBe(403);
});
