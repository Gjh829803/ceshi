import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture} from '../tools/publication-fixture.mjs';
import {publishLibrary} from '../tools/publish.mjs';
import {RegistryStore} from '../tools/registry.mjs';
import {createRegistryServer} from '../tools/registry-server.mjs';
import {sha256,write,read} from '../tools/core.mjs';
import {canonicalJson} from '../client/contracts/index.mjs';
import {RegistryClient} from '../client/registry-client.mjs';
import {materializeAssets} from '../client/materialize.mjs';

async function server(t,root,options){const server=createRegistryServer(root,options);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));return 'http://127.0.0.1:'+server.address().port;}
test('HTTP metadata, snapshot pagination, exact bytes, CDN location and range delivery',async t=>{
 const f=fixture(t),first=await publishLibrary(f.root,{output:f.output});const url=await server(t,f.output);
 let response=await fetch(url+'/v1/assets?limit=1');assert.equal(response.status,200);const page=await response.json();assert.equal(page.items.length,1);assert.ok(page.next_cursor);
 f.add('object.c');await publishLibrary(f.root,{output:f.output});
 const next=await (await fetch(url+'/v1/assets?limit=1&cursor='+page.next_cursor)).json();assert.equal(next.snapshot_id,first.snapshot_id);assert.equal(next.items[0].asset_id,'object.b');assert.equal(next.next_cursor,null);
 response=await fetch(url+'/v1/assets/object.a/versions/1.0.0');const bytes=Buffer.from(await response.arrayBuffer());assert.equal(sha256(bytes),page.items[0].manifest_digest);
 const manifest=JSON.parse(bytes),artifact=manifest.resources[0];response=await fetch(url+'/'+artifact.storage_path,{headers:{Range:'bytes=1-4'}});assert.equal(response.status,206);assert.equal(await response.text(),'iny ');assert.match(response.headers.get('cache-control'),/immutable/);
 response=await fetch(url+'/'+artifact.storage_path,{method:'HEAD'});assert.equal(response.headers.get('content-length'),String(artifact.byte_length));assert.equal((await response.arrayBuffer()).byteLength,0);
 response=await fetch(url+'/'+artifact.storage_path,{headers:{Range:'bytes=999-1000'}});assert.equal(response.status,416);
 const cdn=await server(t,f.output,{artifactBaseUrl:'https://cdn.example/assets/'});const location=await(await fetch(cdn+'/v1/artifacts/'+artifact.sha256)).json();assert.equal(location.url,'https://cdn.example/assets/'+artifact.storage_path);
 write(path.join(f.output,'secret.txt'),'not published');assert.equal((await fetch(url+'/secret.txt')).status,404);assert.equal((await fetch(url+'/intake/private.fbx')).status,404);assert.equal((await fetch(url+'/v1/assets/object.a/versions/9.0.0')).status,404);
 // Published API remains usable without authoring source directories.
 fs.renameSync(path.join(f.root,'subjects'),path.join(f.root,'removed-subjects'));fs.renameSync(path.join(f.root,'shared'),path.join(f.root,'removed-shared'));
 assert.equal((await fetch(url+'/v1/assets/object.a')).status,200);
});
test('composite roles, transitive lock, version conflict and truthful compatibility',async t=>{
 const f=fixture(t);write(path.join(f.root,'assemblies/test/assembly.json'),{assembly_id:'assembly.test',version:'1.0.0',roles:{actor:{asset_id:'object.a',version:'1.0.0'},target:{asset_id:'object.b',version:'1.0.0'}},stage:'planned'});
 const runtime={runtime_id:'test',runtime_version:'1',runtime_digest:'a'.repeat(64),adapter_id:'test',adapter_version:'1.0.0',preset_digest:'b'.repeat(64),overrides_digest:null,supported_contracts:[]};
 const p=path.join(f.root,'subjects/objects/object.a/1.0.0/asset.json'),a=read(p);a.runtime_requirements=[{contract_id:'contract.test',version:'1.0.0'}];write(p,a);
 await publishLibrary(f.root,{output:f.output});const store=new RegistryStore(f.output),request={assets:[],assemblies:[{assembly_id:'assembly.test',version:'1.0.0'}],purpose:'runtime',runtime};
 const lock=store.resolveAssembly(request);assert.equal(lock.assets.length,2);assert.equal(lock.artifacts.length,1);assert.equal(lock.assemblies.length,1);assert.equal(lock.compatibility.status,'adapter_required');
 const {lock_digest,...body}=lock;assert.equal(lock_digest,sha256(canonicalJson(body)));
 runtime.supported_contracts=a.runtime_requirements;assert.equal(store.resolveAssembly(request).compatibility.status,'unknown');
 const url=await server(t,f.output);assert.equal((await fetch(url+'/v1/assemblies/resolve',{method:'POST',body:JSON.stringify(request)})).status,200);
 assert.equal((await fetch(url+'/v1/assets?limit=21')).status,400);assert.equal((await fetch(url+'/v1/assets?cursor=bad')).status,400);
 const assemblyPath=path.join(f.root,'assemblies/test/assembly.json'),assembly=read(assemblyPath);assembly.stage='verified';write(assemblyPath,assembly);
 await assert.rejects(()=>publishLibrary(f.root,{output:f.output}),/IMMUTABLE_ASSEMBLY/);
});
test('resource policy scope retains denied hashes and permits shared resources',async t=>{
 const f=fixture(t);
 for(const id of ['object.a','object.b']){const base=path.join(f.root,'subjects/objects',id,'1.0.0'),assembly=read(path.join(base,'assemblies/default.json'));
  write(path.join(base,'bindings/whitebox.json'),{schema_version:'1.0',integrationMetadata:{documentation:'assets/animals/flying-mounts.md'}});write(path.join(base,'bindings/rig.json'),{});write(path.join(base,'bindings/actions.json'),{slots:{}});write(path.join(base,'bindings/sockets.json'),{schema_version:'1.0',sockets:[]});write(path.join(base,'collision/collision.json'),{schema_version:'1.0',shapes:[],verification:'not_run'});
  assembly.bindings={rig:`subjects/objects/${id}/1.0.0/bindings/rig.json`,animations:`subjects/objects/${id}/1.0.0/bindings/actions.json`,sockets:`subjects/objects/${id}/1.0.0/bindings/sockets.json`};write(path.join(base,'assemblies/default.json'),assembly);
 }
 const unique=Buffer.from('denied unique content'),resourcePath='shared/unique.glb';write(path.join(f.root,resourcePath),unique);
 const file=path.join(f.root,'subjects/objects/object.b/1.0.0/resources.json'),resources=read(file);resources.files.push({path:resourcePath,sha256:sha256(unique),byte_length:unique.length,format:'glb',role:'runtime',logical_paths:['models/unique.glb']});write(file,resources);
 await publishLibrary(f.root,{output:f.output});const store=new RegistryStore(f.output),scope=store.resourceScope({allowed_asset_ids:['object.a']});
 assert.equal(store.describeAsset('object.a').extensions.whitebox.integrationMetadata.documentation,'assets/animals/flying-mounts.md');
 assert.deepEqual(scope.denied_resource_sha256,[sha256(unique)]);assert.equal(store.resourceScope({allowed_asset_ids:['object.a','object.b']}).denied_resource_sha256.length,0);
 assert.equal(scope.scope_digest,sha256(canonicalJson({registry_id:scope.registry_id,snapshot_id:scope.snapshot_id,allowed_asset_ids:['object.a'],denied_resource_sha256:scope.denied_resource_sha256})));
 const url=await server(t,f.output);assert.equal((await fetch(url+'/v1/policies/resource-scope',{method:'POST',body:JSON.stringify({allowed_asset_ids:['object.a']})})).status,200);
 // A version rollover must not turn still-served forbidden bytes into unrelated custom content.
 const oldBase=path.join(f.root,'subjects/objects/object.b/1.0.0'),newBase=path.join(f.root,'subjects/objects/object.b/2.0.0');fs.cpSync(oldBase,newBase,{recursive:true});
 const newerAsset=read(path.join(newBase,'asset.json'));newerAsset.asset_version='2.0.0';write(path.join(newBase,'asset.json'),newerAsset);
 const newerAssembly=read(path.join(newBase,'assemblies/default.json'));newerAssembly.subject.version='2.0.0';for(const key of Object.keys(newerAssembly.bindings))newerAssembly.bindings[key]=newerAssembly.bindings[key].replace('/1.0.0/','/2.0.0/');write(path.join(newBase,'assemblies/default.json'),newerAssembly);
 const newerResources=read(path.join(newBase,'resources.json')),newerBytes=Buffer.from('new denied version');write(path.join(f.root,'shared/unique-v2.glb'),newerBytes);const changed=newerResources.files.find(r=>r.path==='shared/unique.glb');Object.assign(changed,{path:'shared/unique-v2.glb',sha256:sha256(newerBytes),byte_length:newerBytes.length});write(path.join(newBase,'resources.json'),newerResources);
 await publishLibrary(f.root,{output:f.output});assert.deepEqual(store.resourceScope({allowed_asset_ids:['object.a']}).denied_resource_sha256,[sha256(unique),sha256(newerBytes)].sort());
 assert(fs.existsSync(path.join(f.output,`artifacts/sha256/${sha256(unique).slice(0,2)}/${sha256(unique)}`)));
 assert.deepEqual(store.resourceScope({allowed_asset_ids:['object.a','object.b']}).denied_resource_sha256,[sha256(unique)]);
});
test('assembly contract version and descriptor contents are locked and evaluated',async t=>{
 const f=fixture(t),contractPath=path.join(f.root,'shared/contract.json'),contract={asset_id:'contract.fixture',version:'2.0.0',required_anchors:['seat']};write(contractPath,contract);
 write(path.join(f.root,'assemblies/test/assembly.json'),{assembly_id:'assembly.test',version:'1.0.0',roles:{actor:{asset_id:'object.a',version:'1.0.0'}},contract:'shared/contract.json',stage:'planned'});
 await publishLibrary(f.root,{output:f.output});const store=new RegistryStore(f.output),runtime={runtime_id:'test',runtime_version:'1',runtime_digest:'a'.repeat(64),adapter_id:'test',adapter_version:'1.0.0',preset_digest:'b'.repeat(64),overrides_digest:null,supported_contracts:[{contract_id:'contract.fixture',version:'1.0.0'}]};
 const request={assets:[],assemblies:[{assembly_id:'assembly.test',version:'1.0.0'}],purpose:'runtime',runtime};
 assert.equal(store.resolveAssembly(request).compatibility.status,'adapter_required');
 runtime.supported_contracts[0].version='2.0.0';assert.equal(store.resolveAssembly(request).compatibility.status,'unknown');
 contract.required_anchors.push('exit');write(contractPath,contract);await assert.rejects(()=>publishLibrary(f.root,{output:f.output}),/IMMUTABLE_ASSEMBLY/);
 contract.required_anchors.pop();write(contractPath,contract);write(path.join(f.root,'shared/other-contract.json'),{...contract,asset_id:'contract.other'});
 const assemblyPath=path.join(f.root,'assemblies/test/assembly.json'),assembly=read(assemblyPath);assembly.contract='shared/other-contract.json';write(assemblyPath,assembly);await assert.rejects(()=>publishLibrary(f.root,{output:f.output}),/IMMUTABLE_ASSEMBLY/);
});
test('publisher and real client agree on shared artifact identity before materialization',async t=>{
 const f=fixture(t);await publishLibrary(f.root,{output:f.output});const url=await server(t,f.output),client=new RegistryClient({registryUrl:url});
 const lock=await client.resolveAssembly({assets:[{asset_id:'object.b',version:'1.0.0'}],purpose:'runtime',runtime:null});
 const result=await materializeAssets(lock,{client,cacheRoot:path.join(f.root,'cache')});assert.equal(Object.keys(result.files).length,1);
 const before=read(path.join(f.output,'registry.json')),resourceFile=path.join(f.root,'subjects/objects/object.b/1.0.0/resources.json'),resources=read(resourceFile);resources.files[0].format='json';write(resourceFile,resources);
 await assert.rejects(()=>publishLibrary(f.root,{output:f.output}),/ARTIFACT_METADATA_CONFLICT/);assert.deepEqual(read(path.join(f.output,'registry.json')),before);
 assert.equal((await client.resolveAssembly({assets:[{asset_id:'object.b',version:'1.0.0'}],purpose:'runtime',runtime:null})).lock_digest,lock.lock_digest);
});
test('compatibility requires precise verified evidence and rejects stale preset evidence',async t=>{
 const f=fixture(t),runtime={runtime_id:'test',runtime_version:'1',runtime_digest:'a'.repeat(64),adapter_id:'test',adapter_version:'1.0.0',preset_digest:'b'.repeat(64),overrides_digest:null,supported_contracts:[]};
 const validation={runtime:'verified',evidence:[{status:'verified',asset_id:'object.a',version:'1.0.0',evidence_id:'test-evidence',...runtime}]};
 write(path.join(f.root,'subjects/objects/object.a/1.0.0/validation/latest.json'),validation);
 await publishLibrary(f.root,{output:f.output});const store=new RegistryStore(f.output),request={assets:[{asset_id:'object.a',version:'1.0.0'}],runtime};
 assert.equal(store.checkCompatibility(request).status,'compatible');assert.equal(store.searchAssets({}).items[0].readiness.runtime,'unknown');
 assert.equal(store.checkCompatibility({...request,runtime:{...runtime,preset_digest:'c'.repeat(64)}}).status,'unknown');
 assert.equal(store.checkCompatibility({...request,runtime:{...runtime,adapter_id:'other'}}).status,'unknown');
});

test('legacy v1 snapshots stay readable and materializable without treating incomplete proofs as compatible',async t=>{
 const runtime={runtime_id:'test',runtime_version:'1',runtime_digest:'a'.repeat(64),adapter_id:'test',adapter_version:'1.0.0',preset_digest:'b'.repeat(64),overrides_digest:null,supported_contracts:[]};
 const proof={status:'verified',asset_id:'object.a',version:'1.0.0',evidence_id:'old-evidence',...runtime};
 const cases=[{},{runtime:'unknown'},{runtime:'verified',evidence:['old-report.json']},{runtime:'verified',evidence:null},{runtime:'verified',evidence:{}},{runtime:'verified',evidence:[{...proof,runtime_digest:'bad'}]},{runtime:'verified',evidence:[{...proof,asset_id:'object.b'}]}];
 for(const validation of cases){
  const f=fixture(t);const original=await publishLibrary(f.root,{output:f.output});
  // Build a sealed historical fixture with the opaque metadata accepted by the old v1 publisher.
  // Nothing is served until its manifest/index/snapshot hashes have been recomputed.
  const index=read(path.join(f.output,original.index_path)),summary=index.assets.find(a=>a.asset_id==='object.a');
  const file=path.join(f.output,summary.manifest_path),manifest=read(file);manifest.sections.validation=validation;
  const bytes=Buffer.from(canonicalJson(manifest)+'\n');write(file,bytes);summary.manifest_digest=sha256(bytes);
  const indexBytes=Buffer.from(canonicalJson(index)+'\n'),snapshot=sha256(indexBytes);
  const descriptor={...original,snapshot_id:snapshot,index_path:`indexes/${snapshot}.json`,index_digest:snapshot};
  fs.unlinkSync(path.join(f.output,'releases',original.snapshot_id,'registry.json'));
  write(path.join(f.output,descriptor.index_path),indexBytes);write(path.join(f.output,'releases',snapshot,'registry.json'),descriptor);write(path.join(f.output,'registry.json'),descriptor);
  const store=new RegistryStore(f.output),request={assets:[{asset_id:'object.a',version:'1.0.0'}],runtime};
  assert.equal(store.checkCompatibility(request).status,'unknown');
  assert.equal(store.searchAssets({runtime,runtime_ready:true}).items.length,0);
  const url=await server(t,f.output),client=new RegistryClient({registryUrl:url});
  assert.deepEqual((await client.describeAsset('object.a')).sections.validation,validation);
  const lock=await client.resolveAssembly({...request,purpose:'runtime'});
  assert.equal(lock.compatibility.status,'unknown');assert.equal(lock.assets[0].manifest_digest,summary.manifest_digest);
  const cacheRoot=path.join(f.root,'cache');await materializeAssets(lock,{client,cacheRoot});
  const replay=await materializeAssets(lock,{cacheRoot,offline:true});
  assert.deepEqual(replay.manifests[0].sections.validation,validation);
  assert.deepEqual(fs.readFileSync(file),bytes,'historical publication must not be rewritten');
  // Read compatibility does not weaken the new authoring/publication contract.
  write(path.join(f.root,'subjects/objects/object.a/1.0.0/validation/latest.json'),validation);
  await assert.rejects(()=>publishLibrary(f.root,{output:path.join(f.root,'new-publication')}),/ASSET_CONTRACT_INVALID|ASSET_VALIDATION_IDENTITY_MISMATCH/);
 }
});
