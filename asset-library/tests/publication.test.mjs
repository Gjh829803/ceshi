import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {write,sha256,read} from '../tools/core.mjs';
import {publishLibrary} from '../tools/publish.mjs';
import {RegistryStore} from '../tools/registry.mjs';
import {fixture} from '../tools/publication-fixture.mjs';

test('publication deterministic, content addressed, immutable and source excluded',async t=>{
 const f=fixture(t),d=await publishLibrary(f.root,{output:f.output});
 assert.deepEqual(await publishLibrary(f.root,{output:f.output}),d);
 const store=new RegistryStore(f.output),lock=store.resolveAssembly({assets:[{asset_id:'object.b',version:'latest'}],purpose:'runtime',runtime:null});
 assert.equal(lock.assets.length,2);assert.equal(lock.artifacts.length,1);assert.equal(lock.compatibility.status,'unknown');
 assert.equal(store.searchAssets({}).items.length,2);assert.equal(fs.existsSync(path.join(f.output,'intake')),false);
 const p=path.join(f.root,'subjects/objects/object.a/1.0.0/asset.json'),a=read(p);a.description='mutation';write(p,a);
 await assert.rejects(()=>publishLibrary(f.root,{output:f.output}),/IMMUTABLE/);
 assert.deepEqual(read(path.join(f.output,'registry.json')),d);
});
test('historical snapshots and graph rejection',async t=>{
 const f=fixture(t),first=await publishLibrary(f.root,{output:f.output});f.add('object.a','1.1.0');
 await publishLibrary(f.root,{output:f.output});const store=new RegistryStore(f.output);
 assert.equal(store.describeAsset('object.a').version,'1.1.0');assert.equal(store.describeAsset('object.a',{snapshotId:first.snapshot_id}).version,'1.0.0');
 assert.throws(()=>store.resolveAssembly({assets:[{asset_id:'object.b',version:'latest'},{asset_id:'object.a',version:'1.1.0'}],purpose:'runtime',runtime:null}),/VERSION_CONFLICT/);
 f.add('object.a','1.0.0',[{asset_id:'object.b',version:'1.0.0'}]);
 await assert.rejects(()=>publishLibrary(f.root,{output:path.join(f.root,'cycle')}),/CYCLE/);
});
test('public publication requires explicit redistribution rights',async t=>{
 const f=fixture(t);await assert.rejects(()=>publishLibrary(f.root,{output:f.output,audience:'public'}),/RIGHTS/);assert.equal(fs.existsSync(path.join(f.output,'registry.json')),false);
});
test('placeholder FBX samples are preview-only; bad hashes and paths fail closed',async t=>{
 const f=fixture(t),base=f.add('object.sample'),asset=read(path.join(base,'asset.json'));asset.placeholder=true;asset.lifecycle='placeholder';write(path.join(base,'asset.json'),asset);
 const bytes=Buffer.from('tiny preview FBX');write(path.join(f.root,'shared/sample.fbx'),bytes);
 write(path.join(base,'resources.json'),{model:'shared/sample.fbx',preview:null,animations:[],files:[{path:'shared/sample.fbx',sha256:sha256(bytes),byte_length:bytes.length,format:'fbx',role:'source_sample'}]});
 await publishLibrary(f.root,{output:f.output});const store=new RegistryStore(f.output),request={assets:[{asset_id:'object.sample',version:'1.0.0'}],runtime:null};
 assert.equal(store.describeAsset('object.sample').resources[0].role,'preview');assert.equal(store.resolveAssembly({...request,purpose:'runtime'}).artifacts.length,0);assert.equal(store.resolveAssembly({...request,purpose:'preview'}).artifacts.length,1);
 const before=read(path.join(f.output,'registry.json'));write(path.join(f.root,'shared/sample.fbx'),'changed bytes');await assert.rejects(()=>publishLibrary(f.root,{output:f.output}),/HASH_MISMATCH/);assert.deepEqual(read(path.join(f.output,'registry.json')),before);
 write(path.join(f.root,'shared/sample.fbx'),bytes);const resource=read(path.join(base,'resources.json'));resource.files[0].path='../escape.fbx';write(path.join(base,'resources.json'),resource);await assert.rejects(()=>publishLibrary(f.root,{output:f.output}),/PATH_INVALID/);
});
test('publication rejects symlink output components and concurrent writer locks',async t=>{
 const f=fixture(t);fs.mkdirSync(f.output);write(path.join(f.output,'.publish.lock'),'another writer');await assert.rejects(()=>publishLibrary(f.root,{output:f.output}),/PUBLICATION_BUSY/);fs.unlinkSync(path.join(f.output,'.publish.lock'));
 const external=path.join(f.root,'elsewhere');fs.mkdirSync(external);fs.symlinkSync(external,path.join(f.output,'artifacts'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(()=>publishLibrary(f.root,{output:f.output}),/PATH_SYMLINK/);assert.equal(fs.existsSync(path.join(f.output,'registry.json')),false);assert.deepEqual(fs.readdirSync(external),[]);
});
test('module requirements are portable contracts and shared artifact metadata must agree',async t=>{
 const f=fixture(t),assemblyPath=path.join(f.root,'subjects/objects/object.a/1.0.0/assemblies/default.json'),assembly=read(assemblyPath);
 assembly.modules=[{asset_id:'module.fixture',version:'2.0.0'}];write(assemblyPath,assembly);
 await publishLibrary(f.root,{output:f.output});const store=new RegistryStore(f.output),manifest=store.describeAsset('object.a');
 assert.deepEqual(manifest.runtime_requirements,[{contract_id:'module.fixture',version:'2.0.0'}]);assert.deepEqual(manifest.sections.assembly.modules,assembly.modules);
 const runtime={runtime_id:'test',runtime_version:'1',adapter_id:'test',adapter_version:'1.0.0',preset_digest:'a'.repeat(64),overrides_digest:null,supported_contracts:[]},request={assets:[{asset_id:'object.a',version:'1.0.0'}],runtime};
 assert.equal(store.checkCompatibility(request).status,'adapter_required');runtime.supported_contracts=manifest.runtime_requirements;assert.equal(store.checkCompatibility(request).status,'unknown');
 const resourcePath=path.join(f.root,'subjects/objects/object.b/1.0.0/resources.json'),resources=read(resourcePath);resources.files[0].format='png';write(resourcePath,resources);
 await assert.rejects(()=>publishLibrary(f.root,{output:path.join(f.root,'conflict')}),/ARTIFACT_METADATA_CONFLICT/);
});
test('non-Whitebox physical profiles and collision facts are portable, owned and immutable',async t=>{
 const f=fixture(t),base=path.join(f.root,'subjects/objects/object.a/1.0.0'),assembly=read(path.join(base,'assemblies/default.json'));
 assembly.facts={physical:'subjects/objects/object.a/1.0.0/facts/physical.json'};write(path.join(base,'assemblies/default.json'),assembly);
 const profile={schema_version:'1.0',parameters:{seat:[0,1,0],radius:2},body:{envelope:{kind:'capsule',radius:.3,halfHeight:.5,offset:[0,0,0]}},presentation:{id:'fixture',name:'Fixture',fields:['seat']}};
 const profilePath=path.join(base,'facts/physical.json');write(profilePath,profile);const collision={schema_version:'1.0',shapes:[{kind:'box',halfExtents:[1,2,3],offset:[0,1,0]}],verification:'not_run'};write(path.join(base,'collision/collision.json'),collision);
 await publishLibrary(f.root,{output:f.output});const manifest=new RegistryStore(f.output).describeAsset('object.a');
 assert.deepEqual(manifest.extensions,{});assert.deepEqual(manifest.sections.facts.content_profile.parameters.seat,[0,1,0]);assert.deepEqual(manifest.sections.facts.content_profile.control_profile,profile.body);assert.deepEqual(manifest.sections.facts.collision,collision);
 profile.parameters.seat=[0,99,0];write(profilePath,profile);await assert.rejects(()=>publishLibrary(f.root,{output:f.output}),/IMMUTABLE_VERSION/);
 profile.parameters.speed=999;write(profilePath,profile);await assert.rejects(()=>publishLibrary(f.root,{output:path.join(f.root,'unsafe-tuning')}),/CONTENT_FACTS_INVALID/);
});
