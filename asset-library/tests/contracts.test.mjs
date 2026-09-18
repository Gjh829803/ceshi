import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT,read,write,inside,collect,sha256,walk,latest} from '../tools/core.mjs';
import {validate,build,materialize} from '../tools/library.mjs';
import {createServer,copyViewer} from '../tools/serve.mjs';
import {publishLibrary} from '../tools/publish.mjs';
import {AssetLibrary} from '../client/asset-library.mjs';

test('all schemas, references and bytes agree; every broad class has an entry',()=>{
 const r=validate();assert.equal(r.passed,true,r.errors.join('\n'));const all=collect();assert.deepEqual(new Set(all.map(s=>s.asset.browse_group)),new Set(['characters','animals','vehicles','robots','fantastical','objects']));assert.equal(all.filter(s=>s.asset.placeholder).length>=6,true);
});
test('relative resource resolution cannot escape library',()=>{
 for(const p of ['../outside.glb','D:/secret','/absolute.glb','model\\bad.glb','https://example.com/model.glb'])assert.throws(()=>inside(ROOT,p));
 const c=new AssetLibrary('http://localhost:9000/nested/library/');assert.equal(c.url('subjects/test/model.glb'),'http://localhost:9000/nested/library/subjects/test/model.glb');for(const p of ['../outside','http://example.com','/outside','x\\y'])assert.throws(()=>c.url(p));
});
test('default version selection compares numeric versions and keeps stable IDs',()=>{const rows=[{asset_id:'a',asset_version:'1.2.0'},{asset_id:'a',asset_version:'1.10.0'},{asset_id:'a',asset_version:'1.3.9'},{asset_id:'b',asset_version:'0.1.0'}];assert.deepEqual(latest(rows).map(s=>[s.asset_id,s.asset_version]),[['a','1.10.0'],['b','0.1.0']]);});
test('authoring export detects corruption; published transport verifies bytes and reports readiness',async t=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'whitebox-library-test-')),dest=path.join(parent,'relocated');
 materialize(ROOT,['creature.horse','animal.animalia-brown-bear-male','robot.dog-placeholder'],dest);
 assert.equal(validate(dest).passed,true);
 const published=path.join(parent,'published');await publishLibrary(ROOT,{output:published});copyViewer(ROOT,published);
 const server=createServer(published);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/`,client=new AssetLibrary(base);
 const result=await client.search('horse');assert.ok(result.items.some(item=>item.asset_id==='creature.horse'));const horse=await client.describe('creature.horse');
 const model=horse.resources.find(f=>f.resource_id===horse.model_resource_id),bytes=Buffer.from(await client.bytes(model));assert.equal(sha256(bytes),model.sha256);
 const lock=await client.resolve('creature.horse');assert.equal(lock.roots.length,1);assert.equal(lock.compatibility.status,'unknown');
 assert.deepEqual((await client.search('',{runtime_ready:true})).items,[]);
 const placeholderLock=await client.resolve('robot.dog-placeholder');assert.equal(placeholderLock.compatibility.status,'unknown');assert.equal(placeholderLock.artifacts.length,0);await assert.rejects(()=>client.describe('nonexistent'),/ASSET_NOT_FOUND/);
 const missing=await fetch(base+'v1/assets/nonexistent');assert.equal(missing.status,404);const mutation=await fetch(base+'v1/assets',{method:'POST'});assert.equal(mutation.status,404);
 const request=await fetch(base+model.storage_path,{headers:{Range:'bytes=0-11'}});assert.equal(request.status,206);assert.equal((await request.arrayBuffer()).byteLength,12);
 for(const url of ['viewer/index.html','viewer/app.mjs','viewer/vendor/three/build/three.module.js','client/asset-library.mjs'])assert.equal((await fetch(base+url)).status,200,url);
 for(const url of ['catalog/index.json','dist/assembly.lock.json','tools/core.mjs'])assert.equal((await fetch(base+url)).status,404,url);
 const subject=collect(dest).find(s=>s.asset.asset_id==='creature.horse'),modelPath=inside(dest,subject.resources.model);fs.appendFileSync(modelPath,'bad');assert.equal(validate(dest).passed,false);fs.writeFileSync(modelPath,bytes);
 const placeholder=collect(dest).find(s=>s.asset.asset_id==='robot.dog-placeholder');placeholder.validation.runtime='verified';write(path.join(placeholder.base,'validation/latest.json'),placeholder.validation);assert.ok(validate(dest).errors.some(e=>e.includes('FALSE_PLACEHOLDER_RUNTIME')));
 // Only remove the exact fresh test directory beneath the platform temp root.
 t.after(()=>{assert.ok(parent.startsWith(path.join(os.tmpdir(),'whitebox-library-test-')));fs.rmSync(parent,{recursive:true,force:true});});
});
test('published lock contains every registered resource and preserves source identities',()=>{
 const lock=read(path.join(ROOT,'dist/assembly.lock.json')),files=new Map(lock.files.map(f=>[f.path,f]));for(const s of collect())for(const f of s.resources.files)assert.equal(files.get(f.path)?.sha256,f.sha256,f.path);
 const migration=read(path.join(ROOT,'migrations/whitebox-map.json'));assert.equal(migration.subject_count,43);for(const f of migration.files)assert.equal(sha256(fs.readFileSync(inside(ROOT,f.path))),f.sha256);
});

test('legacy removal evidence retains all original bytes without legacy folders',()=>{
 const coverage=read(path.join(ROOT,'migrations/legacy-removal-coverage.json'));
 const records=read(path.join(ROOT,'migrations/legacy-source-records.json')).records;
 assert.equal(coverage.all_bytes_retained,true);
 assert.equal(coverage.files.length,coverage.source_count);
 assert.equal(coverage.files.reduce((n,f)=>n+f.byte_length,0),coverage.source_bytes);
 for(const row of coverage.files){
  const [relative,index]=row.retained.split('#');
  const bytes=index===undefined?fs.readFileSync(inside(ROOT,relative)):Buffer.from(records[Number(index)].content);
  assert.equal(bytes.length,row.byte_length,row.source_path);
  assert.equal(sha256(bytes),row.sha256,row.source_path);
 }
});
