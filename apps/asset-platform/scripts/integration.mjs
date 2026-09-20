import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {RegistryClient} from '@worldkit/asset-client';

const source=fileURLToPath(new URL('../dist/standalone',import.meta.url));
const published=process.env.ASSET_PUBLICATION_ROOT;
assert.ok(published&&path.isAbsolute(published),'Set ASSET_PUBLICATION_ROOT to a real publication');
const temp=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'atlas-standalone-'));
let child,logs='';
async function start(root) {
 const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 child=spawn(process.execPath,[path.join(temp,'start.mjs')],{cwd:temp,env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port),ASSET_PUBLICATION_ROOT:root,ASSET_PUBLIC_URL:`http://127.0.0.1:${port}/`},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',chunk=>{logs+=chunk;});child.stderr.on('data',chunk=>{logs+=chunk;});
 const base=`http://127.0.0.1:${port}/`;
 for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(logs);try{const response=await fetch(base);if(response.ok)return base;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 throw Error('Startup timeout: '+logs);
}
async function stop(){if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}child=undefined;}
try {
 await fs.cp(source,temp,{recursive:true,verbatimSymlinks:true});
 // All package symlinks must remain inside the relocatable artifact.
 async function check(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())assert.ok((await fs.realpath(file)).startsWith(temp+path.sep),file);else if(entry.isDirectory())await check(file);}}
 await check(temp);
 const base=await start(published),client=new RegistryClient({registryUrl:base});
 const html=await(await fetch(base)).text();assert.match(html,/Worldkit Atlas/);
 const script=html.match(/src="([^"\s]+\.js[^"\s]*)"/);assert.ok(script);assert.equal((await fetch(new URL(script[1],base))).status,200);
 const redirect=await fetch(base+'viewer/index.html?asset=creature.horse',{redirect:'manual'});assert.equal(redirect.status,307);assert.equal(new URL(redirect.headers.get('location'),base).pathname,'/');assert.match(redirect.headers.get('location'),/asset=creature.horse/);
 const descriptor=await client.descriptor(),page=await client.searchAssets({limit:20});assert.equal(page.items.length,20);assert.ok(page.next_cursor);
 const second=await client.searchAssets({limit:20,cursor:page.next_cursor});assert.ok(second.items.length);assert.equal(second.items.some(b=>page.items.some(a=>a.asset_id===b.asset_id)),false);
 const selection=(await client.searchAssets({asset_ids:['creature.horse'],limit:1})).items[0];assert.ok(selection);
 const manifest=await client.fetchManifest({asset_id:selection.asset_id,version:selection.version,manifest_path:selection.manifest_path,manifest_digest:selection.manifest_digest}),model=manifest.resources.find(r=>r.resource_id===manifest.model_resource_id);assert.ok(model);
 const bytes=await client.fetchArtifact(model);assert.equal(bytes.length,model.byte_length);
 const endpoint=base+model.storage_path,head=await fetch(endpoint,{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),model.byte_length);assert.equal((await head.arrayBuffer()).byteLength,0);
 const range=await fetch(endpoint,{headers:{range:'bytes=0-11'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,12);
 const cached=await fetch(endpoint,{headers:{'if-none-match':head.headers.get('etag')}});assert.equal(cached.status,304);
 const location=await client.locateArtifact(model.artifact_id);assert.equal(new URL(location.url).origin,new URL(base).origin);
 const lock=await client.resolveAssembly({assets:[{asset_id:selection.asset_id,version:selection.version}],purpose:'preview',runtime:null});assert.equal(lock.snapshot_id,descriptor.snapshot_id);assert.ok(lock.artifacts.length);
 for(const route of ['subjects/test/asset.json','shared/model.glb','catalog/index.json','tools/core.mjs','client/viewer-files.json','api/registry/subjects/test/asset.json'])assert.equal((await fetch(base+route)).status,404,route);
 const bad=await fetch(base+'v1/assemblies/resolve',{method:'POST',headers:{'content-type':'application/json'},body:'{'});assert.equal(bad.status,400);assert.equal((await bad.json()).error.code,'ASSET_JSON_INVALID');
 const large=await fetch(base+'v1/assemblies/resolve',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(1024*1024+1)});assert.equal(large.status,413);
 assert.equal((await fetch(base+'v1/assets?limit=abc')).status,400);
 assert.equal((await fetch(base+'v1/assets',{method:'POST'})).status,404);
 assert.equal((await fetch(base+'v1/assets',{method:'OPTIONS'})).status,204);
 await stop();const unavailable=await start(path.join(temp,'missing-data'));
 const failure=await fetch(unavailable+'registry.json');assert.equal(failure.status,503);assert.equal((await failure.json()).error.code,'ASSET_REGISTRY_UNAVAILABLE');
 console.log(JSON.stringify({standalone_relocated:true,snapshot_id:descriptor.snapshot_id,pagination:true,verified_model_bytes:bytes.length,head_range_etag:true,resolve_post:true,request_limits:true,source_paths_private:true,missing_data_503:true}));
}finally{await stop();await fs.rm(temp,{recursive:true,force:true});}
