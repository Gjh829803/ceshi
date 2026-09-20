import test from 'node:test';
import assert from 'node:assert/strict';
const api=()=>import('../index.mjs');
const validator=()=>import('../validate.mjs');
const hash='a'.repeat(64);
const artifact={artifact_id:'sha256:'+hash,sha256:hash,byte_length:12,mime_type:'model/gltf-binary',format:'glb',role:'runtime',storage_path:'artifacts/sha256/aa/'+hash};
const resource={...artifact,resource_id:'model',logical_paths:['models/horse.glb','legacy/creatures/horse/model.glb']};
const summary={asset_id:'creature.horse',version:'1.0.0',manifest_digest:hash,manifest_path:'manifests/creature.horse/1.0.0/manifest.json',display_name:'Horse',description:'',group:'creature',placeholder:false,preview:null,morphology:['quadruped'],movement:['walk'],capabilities:['be_ridden'],readiness:{previewable:false,runtime:'unknown'},requirements:[],stage:'production',license_status:'approved',license_id:'CC0-1.0'};
const manifest={kind:'asset-manifest',contract_version:'1.0.0',asset_id:'creature.horse',version:'1.0.0',taxonomy_version:'1.0.0',display_name:'Horse',description:'',group:'creature',placeholder:false,model_resource_id:'model',preview_resource_id:null,resources:[resource],dependencies:[],runtime_requirements:[],sections:{asset:{},capabilities:{},bindings:{},facts:{},animations:[],provenance:{},validation:{runtime:'not_run',evidence:[]},assembly:{}},extensions:{}};
test('canonical JSON gives one identity despite object insertion order and rejects nonfinite values',async()=>{
 const {canonicalJson}=await api();
 assert.equal(canonicalJson({z:1,a:{b:2,a:3}}),canonicalJson({a:{a:3,b:2},z:1}));
 assert.throws(()=>canonicalJson({x:Infinity}),/JSON/);
});
test('artifact contract checks identity, size, roles and confined content addresses',async()=>{
 const {assertValid}=await validator();assert.equal(assertValid('Artifact',artifact),artifact);
 for(const changes of [{byte_length:-1},{sha256:'bad'},{artifact_id:'sha256:'+'b'.repeat(64)},{role:'source'},{storage_path:'../secret'},{storage_path:'artifacts/sha256/aa/%2e%2e'}])
  assert.throws(()=>assertValid('Artifact',{...artifact,...changes}),/CONTRACT/);
});
test('summary and search response previews enforce artifact identity semantics',async()=>{
 const {assertValid}=await validator();
 for(const invalidPreview of [{...artifact,artifact_id:'sha256:'+'b'.repeat(64)},{...artifact,storage_path:'private/preview.glb'}]){
  assert.throws(()=>assertValid('Summary',{...summary,preview:invalidPreview}),/ASSET_CONTRACT_ARTIFACT_IDENTITY/);
  assert.throws(()=>assertValid('SearchResponse',{contract_version:'1.0.0',registry_id:'main',snapshot_id:hash,items:[{...summary,preview:invalidPreview}],next_cursor:null}),/ASSET_CONTRACT_ARTIFACT_IDENTITY/);
 }
});
test('resource logical paths accept confined aliases and reject unsafe paths directly and in manifests',async()=>{
 const {assertValid}=await validator();
 assert.equal(assertValid('Resource',resource),resource);assert.equal(assertValid('Manifest',manifest),manifest);
 for(const logicalPath of ['../outside.glb','/absolute.glb','https://other.example/model.glb','legacy\\model.glb','legacy/%2e%2e/model.glb']){
  const invalidResource={...resource,logical_paths:[logicalPath]};
  assert.throws(()=>assertValid('Resource',invalidResource),/ASSET_CONTRACT_INVALID/);
  assert.throws(()=>assertValid('Manifest',{...manifest,resources:[invalidResource]}),/ASSET_CONTRACT_INVALID/);
 }
});
test('asset requests require explicit selectors; pagination is bounded and unsafe paths fail',async()=>{
 const {assertValid}=await validator(),{assertSafePath}=await api();
 assertValid('SearchRequest',{query:'horse',limit:20,capabilities:['be_ridden']});
 for(const request of [{limit:21},{limit:0},{limit:1,unknown:true}])assert.throws(()=>assertValid('SearchRequest',request),/CONTRACT/);
 assert.throws(()=>assertValid('ResolveRequest',{assets:[{asset_id:'creature.horse'}],purpose:'runtime',runtime:null}),/CONTRACT/);
 for(const value of ['../x','/x','https://host/x','a\\b','a/%2e%2e/x','a//b'])assert.throws(()=>assertSafePath(value),/PATH/);
});
test('version selectors resolve caret zero-major ranges correctly and reject unknown wire versions',async()=>{
 const {satisfiesVersion,assertContractVersion}=await api();
 assert.equal(satisfiesVersion('1.8.0','^1.2.0'),true);assert.equal(satisfiesVersion('2.0.0','^1.2.0'),false);
 assert.equal(satisfiesVersion('0.1.9','^0.1.0'),true);assert.equal(satisfiesVersion('0.2.0','^0.1.0'),false);
 assert.equal(satisfiesVersion('0.0.2','^0.0.1'),false);assert.equal(satisfiesVersion('1.3.0','~1.2.0'),false);
 assert.throws(()=>assertContractVersion('2.0.0'),/CONTRACT_VERSION/);
});
