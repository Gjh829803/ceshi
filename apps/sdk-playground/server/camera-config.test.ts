import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer, build, preview } from 'vite';
import { cameraConfigPlugin, cameraDocumentPlugin } from './camera-config';
import { createCameraFileClient } from '../src/camera/file-client';
const source = await readFile(new URL('../config/camera.json', import.meta.url), 'utf8');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture(host = '127.0.0.1', initialCamera?:string) {
 const root = await realpath(await mkdtemp(path.join(tmpdir(), 'camera-file-'))); cleanups.push(() => rm(root, {recursive:true,force:true}));
 await mkdir(path.join(root,'config/cameras'),{recursive:true});
 if(initialCamera!==undefined)await writeFile(path.join(root,'config/camera.json'),initialCamera);
 let watchReady=Promise.resolve();
 const server = await createServer({configFile:false,root,plugins:[cameraConfigPlugin(root),{name:'test-watch-ready',configureServer(server){watchReady=new Promise<void>(resolve=>server.watcher.once('ready',resolve));}}],server:{host,port:0}});
 cleanups.push(()=>server.close());await server.listen();
 const address=server.httpServer!.address(); if(!address||typeof address==='string')throw Error('address');
 const origin=`http://127.0.0.1:${address.port}`;
 const request=(route:string, body:unknown, session?:string, from=origin)=>fetch(origin+'/__camera-config/'+route,{method:'POST',headers:{Origin:from,'Content-Type':'application/json',...(session?{'X-Camera-Session':session}:{})},body:JSON.stringify(body)});
 const sessionResponse=await request('session',{});const session= sessionResponse.ok ? (await sessionResponse.json()).session : '';
 return {root,server,origin,request,session,watchReady};
}
describe('local camera file HTTP service',()=>{
 it('reads missing, creates only if absent, updates by SHA and returns current conflict',async()=>{
  const f=await fixture();const send=(route:string,body:unknown)=>f.request(route,body,f.session);
  expect(await (await send('read',{configurationId:'campus'})).json()).toEqual({status:'missing'});
  const created=await (await send('save',{configurationId:'campus',expectedFileSha256:null,document:JSON.parse(source)})).json();
  expect(created.status).toBe('saved');expect(created.fileSha256).toBe(sha(await readFile(path.join(f.root,'config/camera.json'),'utf8')));
  expect((await send('save',{configurationId:'campus',expectedFileSha256:null,document:created.document})).status).toBe(409);
  const changed={...created.document,defaultViewId:'shoulder'};
  // A valid edit is conditionally saved and returned canonically.
  const updated=await send('save',{configurationId:'campus',expectedFileSha256:created.fileSha256,document:changed});expect(updated.status).toBe(200);expect((await updated.json()).document.defaultViewId).toBe('shoulder');
  await writeFile(path.join(f.root,'config/camera.json'),source+'\n');
  const conflict=await send('save',{configurationId:'campus',expectedFileSha256:created.fileSha256,document:created.document});
  expect(conflict.status).toBe(409);expect((await conflict.json()).current.fileSha256).toBe(sha(source+'\n'));
 });
 it('serializes simultaneous creates so exactly one wins',async()=>{
  const f=await fixture();const requests=await Promise.all([1,2].map(()=>f.request('save',{configurationId:'campus',expectedFileSha256:null,document:JSON.parse(source)},f.session)));
  expect(requests.map(r=>r.status).sort()).toEqual([200,409]);
 });
 it('serializes competing updates with the same expected SHA',async()=>{
  const f=await fixture();await writeFile(path.join(f.root,'config/camera.json'),source);
  const requests=await Promise.all([1,2].map(()=>f.request('save',{configurationId:'campus',expectedFileSha256:sha(source),document:JSON.parse(source)},f.session)));
  expect(requests.map(r=>r.status).sort()).toEqual([200,409]);
 });
 it('rejects malformed existing JSON without overwriting it',async()=>{
  const f=await fixture();await writeFile(path.join(f.root,'config/camera.json'),'{bad');
  expect((await f.request('save',{configurationId:'campus',expectedFileSha256:sha('{bad'),document:JSON.parse(source)},f.session)).status).toBe(400);
  expect(await readFile(path.join(f.root,'config/camera.json'),'utf8')).toBe('{bad');
 });
 it('preview serves static output with no file service',async()=>{
  const f=await fixture();await mkdir(path.join(f.root,'dist'));await writeFile(path.join(f.root,'dist/index.html'),'static');
  const service=await preview({configFile:false,root:f.root,plugins:[cameraConfigPlugin(f.root)],preview:{host:'127.0.0.1',port:0}});
  cleanups.push(()=>new Promise<void>((resolve,reject)=>service.httpServer.close(error=>error?reject(error):resolve())));
  const address=service.httpServer.address();if(!address||typeof address==='string')throw Error('address');
  const origin=`http://127.0.0.1:${address.port}`;
  const response=await fetch(origin+'/__camera-config/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  expect(response.status).toBe(404);expect(await (await fetch(origin)).text()).toBe('static');
 });
 it('rejects foreign origin, missing or wrong session, unknown IDs and malformed documents',async()=>{
  const f=await fixture();
  expect((await f.request('session',{},undefined,'https://evil.example')).status).toBe(403);
  for(const token of [undefined,'wrong'])expect((await f.request('read',{configurationId:'campus'},token)).status).toBe(403);
  expect((await f.request('read',{configurationId:'../camera.json'},f.session)).status).toBe(400);
  expect((await f.request('save',{configurationId:'campus',expectedFileSha256:null,document:{}},f.session)).status).toBe(400);
  expect((await f.request('read',{configurationId:'campus',path:'elsewhere'},f.session)).status).toBe(400);
 });
 it('rejects symlink files and symlink parent directories',async()=>{
  const f=await fixture();await writeFile(path.join(f.root,'outside.json'),source);await symlink('../outside.json',path.join(f.root,'config/camera.json'));
  expect((await f.request('read',{configurationId:'campus'},f.session)).status).toBe(403);
  await rm(path.join(f.root,'config/cameras'),{recursive:true});await symlink('..',path.join(f.root,'config/cameras'));
  expect((await f.request('save',{configurationId:'indoor-lab',expectedFileSha256:null,document:JSON.parse(source)},f.session)).status).toBe(403);
 });
 it('disables the endpoint on a network-bound dev server while serving static pages',async()=>{
  const f=await fixture('0.0.0.0');await writeFile(path.join(f.root,'hello.txt'),'hello');
  expect((await f.request('session',{})).status).toBe(404);expect(await (await fetch(f.origin+'/hello.txt')).text()).toBe('hello');
 });
 it('static browser client does not probe a write service',async()=>{
  vi.stubEnv('PROD',true);const transport=vi.fn();
  expect(await createCameraFileClient(transport)).toBeNull();expect(transport).not.toHaveBeenCalled();
 });
 it('browser client uses session and preserves structured conflicts',async()=>{
  const f=await fixture();const transport:typeof fetch=(input,init)=>fetch(new URL(String(input),f.origin),{...init,headers:{...init?.headers,Origin:f.origin}});
  const client=await createCameraFileClient(transport);expect(client).not.toBeNull();
  expect(await client!.read('campus')).toEqual({status:'missing'});
  expect((await client!.save('campus',null,JSON.parse(source))).status).toBe('saved');
  expect((await client!.save('campus',null,JSON.parse(source))).status).toBe('conflict');
 });
});
describe('Vite exact imported camera bytes',()=>{
 it('rejects an unregistered file in a static bundle',async()=>{
  const f=await fixture();await writeFile(path.join(f.root,'config/unregistered.json'),source);
  await writeFile(path.join(f.root,'entry.js'),`export {default} from './config/unregistered.json?camera-document';`);
  await expect(build({configFile:false,root:f.root,logLevel:'silent',plugins:[cameraDocumentPlugin(f.root)],build:{write:false,minify:false,lib:{entry:path.join(f.root,'entry.js'),formats:['es']}}})).rejects.toThrow('CAMERA_IMPORT_UNKNOWN');
 });
 it('application adapter fails explicitly when a runner lacks its loader',async()=>{
  const {loadCameraProject}=await import('../src/camera-project');
  expect(()=>loadCameraProject('campus','D01')).toThrow('CAMERA_IMPORT_IDENTITY_UNAVAILABLE');
 });
 it('actual application adapter carries all imported file identities under the read-only Vite loader',async()=>{
  const root=path.resolve(import.meta.dirname,'..');
  const server=await createServer({configFile:false,root,plugins:[cameraDocumentPlugin(root)],server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]},ssr:{noExternal:['@worldkit/three','@worldkit/preset-content','@worldkit/camera-collision']}});
  cleanups.push(()=>server.close());
  const {loadCameraProject}=await server.ssrLoadModule('/src/camera-project.ts');
  for(const [id,file] of [['campus','config/camera.json'],['indoor-lab','config/cameras/indoor-lab.json'],['npc-workshop','config/cameras/npc-workshop.json']]){
   const bytes=await readFile(path.join(root,file!),'utf8');const state=loadCameraProject(id,'D01');
   expect(state.importedFileSha256).toBe(sha(bytes));expect(state.savedDocument).toEqual(JSON.parse(bytes));
  }
 });
 it('binds actual dev module bytes and invalidates on changed JSON bytes',async()=>{
  // Seed before watcher startup and await its initial scan: creating and immediately editing can coalesce into add.
  const f=await fixture('127.0.0.1',source);const file=path.join(f.root,'config/camera.json');await f.watchReady;
  const first=await f.server.transformRequest('/config/camera.json?camera-document');expect(first!.code).toContain(sha(source));
  const changed=source+'\n ';await writeFile(file,changed);
  // waitFor releases its polling timer on success and failure; a timeout must not keep probing a closed server.
  await vi.waitFor(()=>expect(f.server.moduleGraph.getModuleById(file.split(path.sep).join('/')+'?camera-document')?.transformResult).toBeNull(),{timeout:4000,interval:20});
  const second=await f.server.transformRequest('/config/camera.json?camera-document');expect(second!.code).toContain(sha(changed));expect(second!.code).not.toContain(sha(source));
 });
 it.each(['config/camera.json','config/cameras/indoor-lab.json','config/cameras/npc-workshop.json'])('static bundle pairs exact input bytes for %s, not a later disk read',async(relativeFile)=>{
  const f=await fixture();const file=path.join(f.root,relativeFile);await writeFile(file,source);
  await writeFile(path.join(f.root,'entry.js'),`export {default as document,fileSha256} from './${relativeFile}?camera-document';`);
  const result=await build({configFile:false,root:f.root,plugins:[cameraDocumentPlugin(f.root),{name:'later-disk-edit',transform(code,id){if(id.endsWith('?camera-document'))return writeFile(file,source+'\n').then(()=>code);}}],build:{write:false,minify:false,lib:{entry:path.join(f.root,'entry.js'),formats:['es']}}});
  const output=(Array.isArray(result)?result[0]:result) as {output:{type:string;code?:string}[]};const code=output.output.find(o=>o.type==='chunk')!.code!;
  const adopted=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));expect(adopted.fileSha256).toBe(sha(source));expect(adopted.document).toEqual(JSON.parse(source));expect(sha(await readFile(file,'utf8'))).not.toBe(adopted.fileSha256);
 });
});
