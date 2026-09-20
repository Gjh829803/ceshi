import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {register} from 'tsx/esm/api';
import {fixture} from '../../../../asset-library/tools/publication-fixture.mjs';
import {read,write,sha256} from '../../../../asset-library/tools/core.mjs';
import {publishLibrary} from '../../../../asset-library/tools/publish.mjs';
import {createRegistryServer} from '../../../../asset-library/tools/registry-server.mjs';
import {prepareAssetLibrary,readLibraryDeniedHashes,resolveLibrarySelection} from '../../src/assets/library-source.mjs';
import {createAssetPolicySnapshot,assetPolicyHash} from '../../src/assets/asset-policy.mjs';
import {materializeAssets} from '@worldkit/asset-client/materialize';

const unregister=register();
after(unregister);
const {ThreeCompiler,REPOSITORY_ROOT,hashTree}=await import('../../src/compiler/compiler.ts');
const human='humanoid.uefn-mannequin',subject='creature.quadruped-static-diagnostic';
const allowed=[human,subject];
const requirement={contract_id:'module.host.subject',version:'1.0.0'};

// Tiny registered bytes exercise delivery integrity; these fixtures make no rendering claim.
function addSubject(f,id,version,dependencies=[],{extra=false,incompatible=false}={}){
  const base=f.add(id,version,dependencies),relative=`subjects/objects/${id}/${version}`;
  const model=`shared/${id}-${version}.glb`,bytes=Buffer.from(`${id}@${version} model bytes`);
  write(path.join(f.root,model),bytes);
  const files=[{path:model,sha256:sha256(bytes),byte_length:bytes.length,format:'glb',role:'model'}];
  if(extra){
    const payload=Buffer.from('{"runtime":"unaliased dependency"}');
    write(path.join(f.root,'shared/extra.json'),payload);
    files.push({path:'shared/extra.json',sha256:sha256(payload),byte_length:payload.length,format:'json',role:'runtime'});
  }
  write(path.join(base,'resources.json'),{model,preview:null,animations:[],files});
  const asset=read(path.join(base,'asset.json'));
  asset.runtime_requirements=[requirement];
  write(path.join(base,'asset.json'),asset);
  write(path.join(base,'bindings/whitebox.json'),{schema_version:'1.0',...(id===human?{
    locomotionBindingIds:['locomotion.ground'],recommendedBody:{heightMeters:1.8,radiusMeters:.3},
  }:{})});
  write(path.join(base,'bindings/rig.json'),{});
  write(path.join(base,'bindings/actions.json'),{slots:id===human?Object.fromEntries(['idle','walk','run','jump'].map(name=>[name,{clipName:name}])):{}});
  write(path.join(base,'bindings/sockets.json'),{schema_version:'1.0',sockets:[]});
  write(path.join(base,'collision/collision.json'),{schema_version:'1.0',shapes:[],verification:'not_run'});
  const assembly=read(path.join(base,'assemblies/default.json'));
  assembly.bindings={rig:relative+'/bindings/rig.json',animations:relative+'/bindings/actions.json',sockets:relative+'/bindings/sockets.json'};
  write(path.join(base,'assemblies/default.json'),assembly);
  if(incompatible)write(path.join(base,'validation/latest.json'),{runtime:'incompatible',evidence:[]});
}

async function registryFixture(t,{historical=false,incompatible=false}={}){
  const f=fixture(t);
  addSubject(f,human,'0.1.0');
  if(historical)addSubject(f,human,'0.0.1');
  addSubject(f,subject,'0.1.0',[{asset_id:human,version:historical?'0.0.1':'0.1.0'}],{extra:true,incompatible});
  await publishLibrary(f.root,{output:f.output});
  const requests=[],server=createRegistryServer(f.output);
  server.on('request',request=>requests.push(request.url));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const environmentKeys=['ASSET_REGISTRY_URL','ASSET_ARTIFACT_BASE_URL','ASSET_LIBRARY_URL','ASSET_CACHE_ROOT'];
  const previous=Object.fromEntries(environmentKeys.map(key=>[key,process.env[key]]));
  t.after(()=>{for(const key of environmentKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
  process.env.ASSET_REGISTRY_URL=`http://127.0.0.1:${server.address().port}`;
  process.env.ASSET_CACHE_ROOT=path.join(f.root,'cache');
  delete process.env.ASSET_ARTIFACT_BASE_URL;
  delete process.env.ASSET_LIBRARY_URL;
  const catalog=await prepareAssetLibrary(REPOSITORY_ROOT,{assetIds:allowed,policyAssetIds:allowed});
  assert.equal(requests.some(url=>url.startsWith('/artifacts/')),false);
  return {...f,catalog,requests,cacheRoot:process.env.ASSET_CACHE_ROOT};
}

test('raw compiler delivers the full locked closure and retains truthful runtime status for offline replay',async t=>{
  const f=await registryFixture(t);
  const snapshot=createAssetPolicySnapshot({schemaVersion:1,allowedAssetIds:allowed,defaultHumanoidAssetId:human,allowCustomAssets:true},f.catalog,readLibraryDeniedHashes(REPOSITORY_ROOT,allowed));
  const policyPath=path.join(f.root,'policy.json');write(policyPath,snapshot);
  // Keep esbuild author resolution within the repository rather than the OS user profile.
  const scratch=path.join(REPOSITORY_ROOT,'.codex-tmp');fs.mkdirSync(scratch,{recursive:true});
  const workspace=fs.mkdtempSync(path.join(scratch,'registry-compiler-review-'));
  t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}));
  write(path.join(workspace,'package.json'),{type:'module'});
  write(path.join(workspace,'index.html'),'<html><head></head><body><script type="module" src="./main.js"></script></body></html>');
  write(path.join(workspace,'main.js'),'document.title="registry closure";');
  write(path.join(workspace,'project.json'),{schemaVersion:1,assetIds:[subject]});
  const compiler=new ThreeCompiler(workspace,'three-raw',{assetPolicySnapshotPath:policyPath,assetPolicySha256:assetPolicyHash(snapshot)});
  const candidate=await compiler.prepare();
  const lock=read(path.join(candidate.playableRoot,'project.assets.lock.json'));
  assert.deepEqual(lock.assets.map(ref=>ref.asset_id),[subject,human]);
  assert.equal(lock.artifacts.length,3);
  for(const artifact of lock.artifacts){
    const bytes=fs.readFileSync(path.join(candidate.playableRoot,artifact.storage_path));
    assert.equal(sha256(bytes),artifact.sha256);
    assert.equal(bytes.length,artifact.byte_length);
  }
  assert.equal(lock.runtime.runtime_id,'three');
  assert.equal(lock.runtime.runtime_version,read(path.join(REPOSITORY_ROOT,'package.json')).dependencies.three);
  assert.equal(lock.runtime.runtime_digest,candidate.runtimeHash);
  assert.deepEqual(lock.runtime.supported_contracts,[]);
  assert.equal(lock.compatibility.status,'adapter_required');
  assert.equal(fs.existsSync(path.join(candidate.sourceRoot,'project.assets.lock.json')),false);
  assert.deepEqual(Object.keys(await hashTree(path.join(candidate.playableRoot,'runtime'))),['bridge.js','three.js']);
  const requestsBefore=f.requests.length;
  const replay=await materializeAssets(lock,{cacheRoot:f.cacheRoot,outputRoot:path.join(f.root,'offline-replay'),offline:true});
  assert.equal(f.requests.length,requestsBefore);
  for(const artifact of lock.artifacts)assert.equal(sha256(fs.readFileSync(replay.files[artifact.artifact_id])),artifact.sha256);
  await compiler.verifyCandidatePolicy(candidate);
});

test('an allowed dependency ID cannot substitute a historical version for the prepared policy-bound content',async t=>{
  await registryFixture(t,{historical:true});
  await assert.rejects(()=>resolveLibrarySelection(REPOSITORY_ROOT,[subject],{allowedAssetIds:allowed}),/THREE_ASSET_POLICY_VERSION_DENIED/);
});

test('explicit incompatibility remains rejected for both SDK and author-supplied raw runtime',async t=>{
  await registryFixture(t,{incompatible:true});
  await assert.rejects(()=>resolveLibrarySelection(REPOSITORY_ROOT,[subject],{allowedAssetIds:allowed}),/THREE_ASSET_RUNTIME_INCOMPATIBLE/);
  await assert.rejects(()=>resolveLibrarySelection(REPOSITORY_ROOT,[subject],{allowedAssetIds:allowed,authorRuntime:true,runtimeId:'three',runtimeVersion:'0.185.1'}),/THREE_ASSET_RUNTIME_INCOMPATIBLE/);
});
