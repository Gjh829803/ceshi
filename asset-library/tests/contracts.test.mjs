import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT,read,write,inside,collect,sha256,walk,latest} from '../tools/core.mjs';
import {validate,build,materialize} from '../tools/library.mjs';
import {createServer} from '../tools/serve.mjs';
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
 const published=path.join(parent,'published');await publishLibrary(ROOT,{output:published});
 const server=createServer(published);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/`,client=new AssetLibrary(base);
 const result=await client.search('horse');assert.ok(result.items.some(item=>item.asset_id==='creature.horse'));const horse=await client.describe('creature.horse');
 const model=horse.resources.find(f=>f.resource_id===horse.model_resource_id),bytes=Buffer.from(await client.bytes(model));assert.equal(sha256(bytes),model.sha256);
 const lock=await client.resolve('creature.horse');assert.equal(lock.roots.length,1);assert.equal(lock.compatibility.status,'unknown');
 assert.deepEqual((await client.search('',{runtime_ready:true})).items,[]);
 const placeholderLock=await client.resolve('robot.dog-placeholder');assert.equal(placeholderLock.compatibility.status,'unknown');assert.equal(placeholderLock.artifacts.length,0);await assert.rejects(()=>client.describe('nonexistent'),/ASSET_NOT_FOUND/);
 const missing=await fetch(base+'v1/assets/nonexistent');assert.equal(missing.status,404);const mutation=await fetch(base+'v1/assets',{method:'POST'});assert.equal(mutation.status,404);
 const request=await fetch(base+model.storage_path,{headers:{Range:'bytes=0-11'}});assert.equal(request.status,206);assert.equal((await request.arrayBuffer()).byteLength,12);
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

// Exercise authoring validation and the actual publisher/Registry together.
import {subjectFixture} from '../tools/publication-fixture.mjs';
import {RegistryStore} from '../tools/registry.mjs';
import {ingestAsset} from '../tools/ingest.mjs';
import {buildWhiteboxCatalog} from '../tools/whitebox.mjs';

test('runtime evidence survives authoring validation and publication with exact identity',async t=>{
 const f=subjectFixture(t,ROOT),p=path.join(f.base,'validation/latest.json');
 const ref={asset_id:f.asset.asset_id,version:f.asset.asset_version};
 const runtime={runtime_id:'test',runtime_version:'1',runtime_digest:'a'.repeat(64),adapter_id:'test',adapter_version:'1.0.0',preset_digest:'b'.repeat(64),overrides_digest:null,supported_contracts:read(path.join(f.base,'assemblies/default.json')).modules.map(m=>({contract_id:m.asset_id,version:m.version}))};
 const original=read(p),record={status:'verified',...ref,evidence_id:'case-1',...runtime};
 write(p,{...original,runtime:'verified',evidence:['format-report.json',record]});
 assert.equal(validate(f.root).passed,true);
 await publishLibrary(f.root,{output:f.output});const registry=new RegistryStore(f.output);
 assert.equal(registry.checkCompatibility({assets:[ref],runtime}).status,'compatible');
 for(const field of ['runtime_digest','preset_digest','overrides_digest'])assert.equal(registry.checkCompatibility({assets:[ref],runtime:{...runtime,[field]:'c'.repeat(64)}}).status,'unknown',field);
 for(const evidence of [['format-report.json'],[{...record,version:'9.0.0'}],[{...record,runtime_digest:'bad'}],[{...record,evidence_id:''}]]){
  write(p,{...original,runtime:'verified',evidence});
  assert.equal(validate(f.root).passed,false,JSON.stringify(evidence));
  await assert.rejects(()=>publishLibrary(f.root,{output:path.join(f.root,'invalid')}),/ASSET_CONTRACT_INVALID|ASSET_VALIDATION_IDENTITY_MISMATCH/);
 }
 write(p,{...original,runtime:'incompatible',evidence:['failed-case.json']});
 assert.equal(validate(f.root).passed,true);await publishLibrary(f.root,{output:path.join(f.root,'incompatible')});
 assert.equal(new RegistryStore(path.join(f.root,'incompatible')).checkCompatibility({assets:[ref],runtime}).status,'incompatible');
});

test('invalid physical facts cannot pass authoring, publication or Whitebox adaptation',async t=>{
 const f=subjectFixture(t,ROOT),file=path.join(f.base,'facts/physical.json'),original=read(file);
 for(const patch of [{radius:'bad'},{radius:0},{seat:[0,false,0]},{seat:[0,1]},{envelope:{kind:'box',halfExtents:[-1,1,1],offset:[0,0,0]}},{wheelPhysics:{radius:-1}},{flyingCreatureCollision:[{id:'probe',center:[0,0,0],radius:0}]}]){
  write(file,{...original,parameters:{...original.parameters,...patch}});
  assert.equal(validate(f.root).passed,false,JSON.stringify(patch));
  assert.throws(()=>buildWhiteboxCatalog(f.root),/CONTENT_FACTS_INVALID/);
  await assert.rejects(()=>publishLibrary(f.root,{output:f.output}),/CONTENT_FACTS_INVALID/);
  assert.equal(fs.existsSync(path.join(f.output,'registry.json')),false);
 }
 write(file,original);assert.equal(validate(f.root).passed,true);
});

test('model ingestion declares only observed rig and animation components, with no assumed runtime',async t=>{
 const f=subjectFixture(t,ROOT),input=inside(f.root,read(path.join(f.base,'resources.json')).model);
 await ingestAsset({root:f.root,input,id:'object.new-static',group:'objects',name:'Static model'});
 const base=path.join(f.root,'subjects/objects/object.new-static/0.1.0');
 const assembly=read(path.join(base,'assemblies/default.json'));
 for(const field of ['bindings','facts','modules','authority'])assert.equal(assembly[field],undefined,field);
 for(const folder of ['bindings','facts','profiles','collision'])assert.equal(fs.existsSync(path.join(base,folder)),false,folder);
 assert.equal(validate(f.root).passed,true);
 // Optional bindings remain optional even when the model is explicitly selected for Whitebox.
 write(path.join(base,'bindings/whitebox.json'),{schema_version:'1.0'});
 const entry=buildWhiteboxCatalog(f.root).assets.find(a=>a.id==='object.new-static');
 assert.deepEqual(entry.actions,{});assert.equal(entry.vehicle,undefined);
 await publishLibrary(f.root,{output:f.output});const manifest=new RegistryStore(f.output).describeAsset('object.new-static');
 assert.deepEqual(manifest.runtime_requirements,[]);assert.deepEqual(manifest.sections.bindings,{});
 // A reference that IS declared must never silently fall back to an empty binding.
 assembly.bindings={rig:'subjects/missing.json'};write(path.join(base,'assemblies/default.json'),assembly);
 assert.equal(validate(f.root).passed,false);await assert.rejects(()=>publishLibrary(f.root,{output:path.join(f.root,'missing')}),/ENOENT/);
});

test('animated model ingestion preserves actual rig and clips without declaring motor or camera support',async t=>{
 const f=subjectFixture(t,ROOT,'creature.horse'),input=inside(f.root,read(path.join(f.base,'resources.json')).model);
 await ingestAsset({root:f.root,input,id:'animal.new-animated',group:'animals',name:'Animated model'});
 const base=path.join(f.root,'subjects/animals/animal.new-animated/0.1.0');
 const assembly=read(path.join(base,'assemblies/default.json')),resources=read(path.join(base,'resources.json'));
 assert.ok(resources.inspection.bones.length>0);assert.ok(resources.animations.length>0);
 assert.ok(assembly.bindings.rig);assert.ok(assembly.bindings.animations);
 assert.equal(assembly.bindings.sockets,undefined);assert.equal(assembly.modules,undefined);assert.equal(assembly.authority,undefined);
 assert.equal(validate(f.root).passed,true);await publishLibrary(f.root,{output:f.output});
 const manifest=new RegistryStore(f.output).describeAsset('animal.new-animated');
 assert.ok(manifest.sections.bindings.rig.bones.length>0);assert.deepEqual(manifest.runtime_requirements,[]);
 assert.equal(manifest.sections.validation.runtime,'not_run');
});

test('model facts, sockets and collision are validated before catalog generation or publication',async t=>{
 const f=subjectFixture(t,ROOT,'vehicle.atv');
 const cases=[
  ['facts/model.json',m=>{m.roadCushion={center:[0,0,0],size:['bad',1,1]};},/ASSET_CONTENT_FACTS_INVALID/],
  ['facts/model.json',m=>{m.roadCushion={center:[0,0,0],size:[1,-1,1]};},/ASSET_CONTENT_FACTS_INVALID/],
  ['facts/model.json',m=>{m.socket_ids=['missing.socket'];},/ASSET_MODEL_SOCKET_MISSING/],
  ['bindings/sockets.json',s=>{s.sockets[0].positionMetersXYZ=[false,1,2];},/ASSET_CONTENT_FACTS_INVALID/],
  ['bindings/sockets.json',s=>{s.sockets[0].positionMetersXYZ=[1,2];},/ASSET_CONTENT_FACTS_INVALID/],
  ['bindings/sockets.json',s=>{s.sockets.push({...s.sockets[0],positionMetersXYZ:[1,2,3]});},/ASSET_SOCKET_ID_DUPLICATE/],
  ['collision/collision.json',c=>{c.shapes=[{kind:'box',halfExtents:[-1,1,1],offset:[0,0,0]}];},/ASSET_CONTENT_FACTS_INVALID/],
  ['collision/collision.json',c=>{c.shapes=[{kind:'box',halfExtents:[1,1,1],offset:[false,0,0]}];},/ASSET_CONTENT_FACTS_INVALID/],
 ];
 assert.equal(validate(f.root).passed,true);
 for(const [relative,mutate,error] of cases){
  const file=path.join(f.base,relative),original=read(file),invalid=structuredClone(original);mutate(invalid);write(file,invalid);
  assert.equal(validate(f.root).passed,false,relative);
  assert.throws(()=>buildWhiteboxCatalog(f.root),error);
  await assert.rejects(()=>publishLibrary(f.root,{output:f.output}),error);
  assert.equal(fs.existsSync(path.join(f.output,'registry.json')),false);
  write(file,original);
 }
 assert.equal(validate(f.root).passed,true);await publishLibrary(f.root,{output:f.output});
});
