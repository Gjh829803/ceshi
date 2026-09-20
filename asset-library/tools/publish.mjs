import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT,collect,read,sha256,inside,walk} from './core.mjs';
import {canonicalJson,assertSafePath,protocolError} from '../client/contracts/index.mjs';
import {assertValid} from '../client/contracts/validate.mjs';
import {buildWhiteboxCatalog} from './whitebox.mjs';
import {publicationPath} from './publication-path.mjs';
import {readPhysicalFacts} from './content-facts.mjs';

const lexical=(a,b)=>a<b?-1:a>b?1:0;
const bytesOf=value=>Buffer.from(canonicalJson(value)+'\n');
const fail=(code,message)=>{throw protocolError(code,message,409);};
const mime={glb:'model/gltf-binary',gltf:'model/gltf+json',json:'application/json','three-clip-json':'application/json',webp:'image/webp',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',txt:'text/plain',fbx:'application/octet-stream'};
const artifactOf=({resource_id,logical_paths,...artifact})=>artifact;
function physicalFacts(root,subject){
 const facts={scale:subject.asset.scale||{},inspection:subject.resources.inspection||{}};
 const profile=readPhysicalFacts(root,subject);
 if(profile){
  // Preserve the published v1 representation and immutable asset identities.
  facts.content_profile=clean({schema_version:profile.schema_version,parameters:profile.parameters||{},...(profile.body?{control_profile:profile.body}:{}),...(profile.presentation?{presentation:profile.presentation}:{})});
 }
 const collisionPath=path.join(subject.base,'collision/collision.json');
 if(fs.existsSync(collisionPath)){
  const collision=read(collisionPath),physicalKeys=new Set(['kind','halfExtents','offset','radius','halfHeight','height','center','rotation','points','vertices','indices']);
  if(!Array.isArray(collision.shapes)||collision.shapes.some(shape=>!shape||typeof shape!=='object'||Object.keys(shape).some(key=>!physicalKeys.has(key))))fail('ASSET_CONTENT_FIELD_OWNERSHIP',subject.asset.asset_id);
  facts.collision=clean({schema_version:collision.schema_version,shapes:collision.shapes,verification:collision.verification});
 }
 return clean(facts);
}
function clean(value){
 if(Array.isArray(value))return value.map(clean).filter(v=>v!==undefined);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['source_path','sourcePath','uri','original','profile','profiles','cameraPresetReferences','default_assembly','license_files','conversion_pipeline','checked_at'].includes(key)).map(([key,v])=>[key,clean(v)]).filter(([,v])=>v!==undefined));
 if(typeof value==='string'&&(/^(?:subjects|shared|intake|migrations|tests|assets)\//.test(value)||/^(?:[a-zA-Z]:[\\/]|\/|\\\\)/.test(value)))return undefined;
 return value;
}
function portableWhitebox(entry,byPath){
 if(!entry)return undefined;
 const resourceId=file=>{const relative=file.sourcePath?.replace(/^asset-library\//,'');const resource=byPath.get(relative);if(!resource||resource.role!=='runtime')fail('ASSET_WHITEBOX_RESOURCE_MISSING');return resource.resource_id;};
 const {uri,sourcePath,sha256,byteLength,resources,...content}=entry;
 const portable=clean(content);
 const documentation=entry.integrationMetadata?.documentation;
 if(documentation!==undefined){assertSafePath(documentation);portable.integrationMetadata={...portable.integrationMetadata,documentation};}
 return {...portable,resource_id:resourceId(entry),...(resources?{resources:resources.map(r=>({path:r.path,resource_id:resourceId(r)}))}:{})};
}
function assertGraph(manifests){
 const all=new Map(manifests.map(m=>[m.asset_id+'@'+m.version,m]));
 for(const root of manifests){const active=new Set(),done=new Set(),selected=new Map();
  const visit=m=>{const key=m.asset_id+'@'+m.version;if(active.has(key))fail('ASSET_DEPENDENCY_CYCLE');if(selected.has(m.asset_id)&&selected.get(m.asset_id)!==m.version)fail('ASSET_VERSION_CONFLICT');selected.set(m.asset_id,m.version);if(done.has(key))return;active.add(key);
   for(const ref of m.dependencies){const dep=all.get(ref.asset_id+'@'+ref.version);if(!dep)fail('ASSET_DEPENDENCY_MISSING');visit(dep);}active.delete(key);done.add(key);};visit(root);
 }
}
/** Export only explicitly registered delivery resources; never copy authoring directories. */
async function buildPublication(root=ROOT,{output=path.join(root,'dist/published'),audience='internal'}={}){
 if(!['internal','public'].includes(audience))fail('ASSET_AUDIENCE_INVALID');
 root=path.resolve(root);output=path.resolve(output);
 const manifests=[],assets=[],planned=new Map(),identities=new Set(),artifactMetadata=new Map();
 const whiteboxEntries=new Map(buildWhiteboxCatalog(root,{allVersions:true}).assets.map(a=>[a.id+'@'+a.contentVersion,a]));
 for(const s of collect(root)){
  const a=s.asset,key=a.asset_id+'@'+a.asset_version;if(identities.has(key))fail('ASSET_DUPLICATE_VERSION');identities.add(key);
  assertValid('AssetRef',{asset_id:a.asset_id,version:a.asset_version});
  if(audience==='public'&&!(s.provenance.license?.redistribution==='allowed'&&s.provenance.license?.commercial_use==='allowed'))fail('ASSET_PUBLIC_RIGHTS_REQUIRED',a.asset_id);
  const resources=[],byPath=new Map(),aliases=new Set();
  for(const f of s.resources.files){
   assertSafePath(f.path);
   const logical=[...(f.logical_paths||[])].sort();logical.forEach(alias=>{assertSafePath(alias);if(aliases.has(alias))fail('ASSET_DUPLICATE_LOGICAL_PATH');aliases.add(alias);});
   // Declared aliases are legacy delivery dependencies, including notices and JSON clips.
   let role=f.role==='preview'||f.role==='rendered_preview'||f.path===s.resources.preview?'preview':null;
   if(a.placeholder&&f.role==='source_sample'&&f.path===s.resources.model)role='preview';
   if(f.role==='runtime'||f.role==='model'||logical.length)role=a.placeholder?'preview':'runtime';
   if(['source_reference','source','license'].includes(f.role)&&!logical.length)role=null;
   if(!role)continue;
   assertSafePath(f.path);const source=inside(root,f.path);const bytes=fs.readFileSync(source);
   if(bytes.length!==f.byte_length||sha256(bytes)!==f.sha256)fail('ASSET_RESOURCE_HASH_MISMATCH',a.asset_id);
   const resource_id=f.resource_id||logical[0]||(f.path===s.resources.model?'model':f.path===s.resources.preview?'preview':f.path.replace('/'+a.asset_version+'/','/'));
   const resource={resource_id,logical_paths:logical,artifact_id:'sha256:'+f.sha256,sha256:f.sha256,byte_length:f.byte_length,mime_type:mime[f.format]||'application/octet-stream',format:f.format,role,storage_path:`artifacts/sha256/${f.sha256.slice(0,2)}/${f.sha256}`};
   assertValid('Resource',resource);
   const metadata=canonicalJson({sha256:resource.sha256,byte_length:resource.byte_length,mime_type:resource.mime_type,format:resource.format,storage_path:resource.storage_path});
   if(artifactMetadata.has(resource.artifact_id)&&artifactMetadata.get(resource.artifact_id)!==metadata)fail('ASSET_ARTIFACT_METADATA_CONFLICT',resource.artifact_id);
   artifactMetadata.set(resource.artifact_id,metadata);resources.push(resource);byPath.set(f.path,resource);planned.set(resource.storage_path,bytes);
  }
  const bindings={};for(const [name,file]of Object.entries(s.assembly.bindings||{}))bindings[name]=clean(read(inside(root,file)));
  const wb=portableWhitebox(whiteboxEntries.get(key),byPath),facts=physicalFacts(root,s);
  const contracts=new Map();
  for(const requirement of [...(s.asset.runtime_requirements||[]),...(s.assembly.runtime_requirements||[]),...(s.assembly.modules||[]).map(module=>({contract_id:module.asset_id,version:module.version}))]){
   assertValid('Requirement',requirement);if(contracts.has(requirement.contract_id)&&contracts.get(requirement.contract_id).version!==requirement.version)fail('ASSET_CONTRACT_VERSION_CONFLICT');contracts.set(requirement.contract_id,requirement);
  }
  const requirements=[...contracts.values()].sort((a,b)=>lexical(a.contract_id,b.contract_id));
  const manifest={kind:'asset-manifest',contract_version:'1.0.0',asset_id:a.asset_id,version:a.asset_version,taxonomy_version:'1.0.0',display_name:a.display_name,description:a.description||'',group:a.browse_group,placeholder:!!a.placeholder,model_resource_id:byPath.get(s.resources.model)?.resource_id||null,preview_resource_id:byPath.get(s.resources.preview)?.resource_id||null,resources:resources.sort((a,b)=>lexical(a.resource_id,b.resource_id)),dependencies:[...(a.dependencies||[])].sort((a,b)=>lexical(a.asset_id,b.asset_id)),runtime_requirements:requirements,sections:{asset:clean(a),capabilities:clean(s.capabilities),bindings,facts,animations:(s.resources.animations||[]).filter(a=>byPath.has(a.resource)).map(({resource,...animation})=>({...clean(animation),resource_id:byPath.get(resource).resource_id})),provenance:clean(s.provenance),validation:clean(s.validation),assembly:clean({assembly_id:s.assembly.assembly_id,subject:s.assembly.subject,modules:s.assembly.modules||[],stage:s.assembly.stage,runtime_ready:false})},extensions:wb?{whitebox:wb}:{}};
  assertValid('Manifest',manifest);manifests.push(manifest);
  const manifest_path=`manifests/${a.asset_id}/${a.asset_version}/manifest.json`,bytes=bytesOf(manifest);planned.set(manifest_path,bytes);
  const preview=resources.find(r=>r.resource_id===manifest.preview_resource_id)||resources.find(r=>r.resource_id===manifest.model_resource_id);
  const summary={asset_id:a.asset_id,version:a.asset_version,manifest_digest:sha256(bytes),manifest_path,display_name:a.display_name,description:a.description||'',group:a.browse_group,stage:a.lifecycle||'unknown',license_status:s.provenance.license?.status||'unknown',license_id:s.provenance.license?.license_id||null,placeholder:!!a.placeholder,preview:preview?artifactOf(preview):null,morphology:a.morphology?.profiles||[],movement:[...new Set((s.capabilities.movement_modes||[]).flatMap(m=>[m.id,m.environment,m.propulsion].filter(Boolean)))].sort(),capabilities:[...new Set((s.capabilities.interactions||[]).map(c=>c.id).filter(Boolean))].sort(),readiness:{previewable:!!preview,runtime:'unknown'},requirements};
  assertValid('Summary',summary);assets.push(summary);
 }
 assertGraph(manifests);
 const assemblies=walk(path.join(root,'assemblies')).filter(p=>path.basename(p)==='assembly.json').map(file=>{
  const a=read(file),contract=a.contract?read(inside(root,a.contract)):{};
  const roles=Object.fromEntries(Object.entries(a.roles||{}).filter(([,v])=>v));for(const ref of Object.values(roles)){assertValid('AssetRef',ref);if(!identities.has(ref.asset_id+'@'+ref.version))fail('ASSET_ASSEMBLY_REFERENCE_MISSING');}
  if(a.contract)assertValid('Requirement',{contract_id:contract.asset_id,version:contract.version});
  return {assembly_id:a.assembly_id,version:a.version,manifest_digest:sha256(bytesOf({assembly:clean(a),contract:clean(contract)})),roles,contract_id:contract.asset_id||'',contract_version:contract.version||null,stage:Object.values(a.roles||{}).some(v=>!v)?'incomplete':a.stage||'unknown'};
 }).sort((a,b)=>lexical(a.assembly_id,b.assembly_id)||lexical(a.version,b.version));
 assertGraph([...manifests,...assemblies.map(a=>({asset_id:a.assembly_id,version:a.version,dependencies:Object.values(a.roles)}))]);
 for(const file of walk(path.join(output,'releases')).filter(file=>path.basename(file)==='registry.json')){
  const historical=read(file),index=read(publicationPath(output,historical.index_path));
  for(const assembly of assemblies){const old=index.assemblies.find(a=>a.assembly_id===assembly.assembly_id&&a.version===assembly.version);if(old&&old.manifest_digest!==assembly.manifest_digest)fail('ASSET_IMMUTABLE_ASSEMBLY',assembly.assembly_id);}
 }
 assets.sort((a,b)=>lexical(a.asset_id,b.asset_id)||lexical(a.version,b.version));
 const index={contract_version:'1.0.0',registry_id:'whitebox-assets',taxonomy_version:'1.0.0',audience,assets,assemblies},indexBytes=bytesOf(index),snapshot_id=sha256(indexBytes);
 const descriptor={kind:'asset-registry',contract_version:'1.0.0',registry_id:'whitebox-assets',snapshot_id,taxonomy_version:'1.0.0',audience,index_path:`indexes/${snapshot_id}.json`,index_digest:snapshot_id,endpoints:{search:'v1/assets',describe:'v1/assets',compatibility:'v1/compatibility/check',resolve:'v1/assemblies/resolve',artifacts:'v1/artifacts',resource_scope:'v1/policies/resource-scope'}};
 assertValid('Registry',descriptor);planned.set(descriptor.index_path,indexBytes);planned.set(`releases/${snapshot_id}/registry.json`,bytesOf(descriptor));
 // Preflight every immutable object before writing any publication data.
 for(const [relative,bytes]of planned){const file=publicationPath(output,relative);if(fs.existsSync(file)&&!fs.readFileSync(file).equals(bytes))fail('ASSET_IMMUTABLE_VERSION',relative);}
 fs.mkdirSync(output,{recursive:true});
 const atomic=(relative,bytes)=>{const file=publicationPath(output,relative);fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.'+process.pid+'.tmp';try{fs.writeFileSync(temporary,bytes,{flag:'wx'});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}};
 for(const [relative,bytes]of planned)if(!fs.existsSync(publicationPath(output,relative)))atomic(relative,bytes);
 atomic('registry.json',bytesOf(descriptor));return descriptor;
}
export async function publishLibrary(root=ROOT,options={}){
 const output=path.resolve(options.output||path.join(root,'dist/published'));fs.mkdirSync(output,{recursive:true});
 const lock=publicationPath(output,'.publish.lock');let fd;
 try{fd=fs.openSync(lock,'wx');}catch(error){if(error.code==='EEXIST')fail('ASSET_PUBLICATION_BUSY');throw error;}
 try{return await buildPublication(root,{...options,output});}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const args=process.argv.slice(2),opt=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;publishLibrary(path.resolve(opt('--root',ROOT)),{output:path.resolve(opt('--output',path.join(ROOT,'dist/published'))),audience:opt('--audience','internal')}).then(d=>console.log(JSON.stringify(d,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});}
