import fs from 'node:fs';
import {publicationPath} from './publication-path.mjs';
import path from 'node:path';
import {read,inside,sha256,walk} from './core.mjs';
import {canonicalJson,compareVersions,satisfiesVersion,protocolError,assertSafePath} from '../client/contracts/index.mjs';
import {assertValid} from '../client/contracts/validate.mjs';

const lexical=(a,b)=>a<b?-1:a>b?1:0;
const refOf=a=>({asset_id:a.asset_id,version:a.version});
const manifestRef=a=>({...refOf(a),manifest_digest:a.manifest_digest,manifest_path:a.manifest_path});
const artifactOf=({resource_id,logical_paths,...a})=>a;
const error=(code,status=400)=>{throw protocolError(code,code,status);};
const digestPattern=/^[a-f0-9]{64}$/;
/** Reading old v1 metadata never upgrades an incomplete or malformed proof to verified. */
function matchingRuntimeEvidence(manifest,runtime){
 const validation=manifest.sections.validation;
 if(validation.runtime!=='verified'||!Array.isArray(validation.evidence))return undefined;
 return validation.evidence.find(evidence=>{
  try{assertValid('RuntimeEvidence',evidence);}catch(error){
   if(error.code==='ASSET_CONTRACT_INVALID')return false;
   throw error;
  }
  return evidence.asset_id===manifest.asset_id&&evidence.version===manifest.version&&
   evidence.runtime_id===runtime.runtime_id&&evidence.runtime_version===runtime.runtime_version&&
   evidence.runtime_digest===runtime.runtime_digest&&evidence.adapter_id===runtime.adapter_id&&
   evidence.adapter_version===runtime.adapter_version&&evidence.preset_digest===runtime.preset_digest&&
   evidence.overrides_digest===runtime.overrides_digest;
 });
}
/** Published-only registry. No dependency on editable library descriptors or binaries. */
export class RegistryStore{
 constructor(root,{artifactBaseUrl}={}){this.root=path.resolve(root);this.artifactBaseUrl=artifactBaseUrl;}
 descriptor({snapshotId,snapshot_id}={}){
  const id=snapshotId||snapshot_id;if(id&&!digestPattern.test(id))error('ASSET_SNAPSHOT_INVALID');
  const relative=id?`releases/${id}/registry.json`:'registry.json';
  const file=publicationPath(this.root,relative);if(!fs.existsSync(file))error('ASSET_SNAPSHOT_NOT_FOUND',404);
  const d=read(file);assertValid('Registry',d);if(id&&d.snapshot_id!==id)error('ASSET_SNAPSHOT_CORRUPT',500);return d;
 }
 index(snapshotId){const d=this.descriptor({snapshotId});const bytes=fs.readFileSync(publicationPath(this.root,d.index_path));if(sha256(bytes)!==d.index_digest||d.index_digest!==d.snapshot_id)error('ASSET_INDEX_CORRUPT',500);return {descriptor:d,index:JSON.parse(bytes)};}
 select(index,id,selector='latest'){
  const a=index.assets.filter(a=>a.asset_id===id&&satisfiesVersion(a.version,selector)).sort((a,b)=>compareVersions(b.version,a.version))[0];
  if(!a)error('ASSET_VERSION_NOT_FOUND',404);return a;
 }
 manifest(summary){assertSafePath(summary.manifest_path);const bytes=fs.readFileSync(publicationPath(this.root,summary.manifest_path));if(sha256(bytes)!==summary.manifest_digest)error('ASSET_MANIFEST_CORRUPT',500);const m=JSON.parse(bytes);assertValid('Manifest',m);if(m.asset_id!==summary.asset_id||m.version!==summary.version)error('ASSET_MANIFEST_CORRUPT',500);return m;}
 describeAsset(id,{version='latest',snapshotId,snapshot_id}={}){const {index}=this.index(snapshotId||snapshot_id);return this.manifest(this.select(index,id,version));}
 describe(id,options){return this.describeAsset(id,options);}
 searchAssets(request={}){
  assertValid('SearchRequest',request);let offset=0,snapshot=request.snapshot_id;
  const filters={...request};delete filters.cursor;delete filters.snapshot_id;const fingerprint=sha256(canonicalJson(filters));
  if(request.cursor){let cursor;try{cursor=JSON.parse(Buffer.from(request.cursor,'base64url').toString());}catch{error('ASSET_CURSOR_INVALID');}
   if(!cursor||cursor.fingerprint!==fingerprint||!digestPattern.test(cursor.snapshot_id)||!Number.isSafeInteger(cursor.offset)||cursor.offset<0||snapshot&&snapshot!==cursor.snapshot_id)error('ASSET_CURSOR_INVALID');offset=cursor.offset;snapshot=cursor.snapshot_id;
  }
  const {descriptor,index}=this.index(snapshot),latest=new Map();for(const a of index.assets){const previous=latest.get(a.asset_id);if(!previous||compareVersions(a.version,previous.version)>0)latest.set(a.asset_id,a);}
  const tokens=(request.query||'').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const rows=[...latest.values()].filter(a=>tokens.every(q=>JSON.stringify([a.asset_id,a.display_name,a.description,a.morphology,a.movement,a.capabilities]).toLowerCase().includes(q))&&(!request.asset_ids||request.asset_ids.includes(a.asset_id))&&(!request.group||a.group===request.group)&&(!request.stage||a.stage===request.stage)&&['morphology','movement','capabilities'].every(key=>!request[key]||request[key].every(v=>a[key].includes(v)))&&(request.previewable===undefined||a.readiness.previewable===request.previewable)).map(a=>{
   if(!request.runtime)return a;const compatibility=this.checkCompatibility({assets:[refOf(a)],runtime:request.runtime,snapshot_id:descriptor.snapshot_id});return {...a,readiness:{...a.readiness,runtime:compatibility.status==='compatible'?'verified':compatibility.status}};
  }).filter(a=>request.runtime_ready===undefined||(a.readiness.runtime==='verified')===request.runtime_ready).sort((a,b)=>lexical(a.asset_id,b.asset_id));
  const limit=request.limit??10,items=rows.slice(offset,offset+limit),next_cursor=offset+limit<rows.length?Buffer.from(canonicalJson({snapshot_id:descriptor.snapshot_id,offset:offset+limit,fingerprint})).toString('base64url'):null;
  return assertValid('SearchResponse',{contract_version:'1.0.0',registry_id:descriptor.registry_id,snapshot_id:descriptor.snapshot_id,items,next_cursor,total:rows.length});
 }
 search(request){return this.searchAssets(request);}
 checkCompatibility(request){
  assertValid('CompatibilityRequest',request);const {index}=this.index(request.snapshot_id),reasons=[],evidence=[],states=[];
  for(const ref of request.assets){const summary=this.select(index,ref.asset_id,ref.version),m=this.manifest(summary),runtime=request.runtime;let status='unknown';
   if(m.sections.validation.runtime==='incompatible'){status='incompatible';reasons.push({code:'CONTENT_INCOMPATIBLE',message:'Content explicitly marked incompatible',asset_id:m.asset_id});}
   else if(runtime&&m.runtime_requirements.some(r=>!runtime.supported_contracts.some(s=>s.contract_id===r.contract_id&&s.version===r.version))){status='adapter_required';reasons.push({code:'CONTRACT_UNSUPPORTED',message:'Required content contract is not supported by this adapter',asset_id:m.asset_id});}
   else if(runtime&&!m.placeholder){const e=matchingRuntimeEvidence(m,runtime);
    if(e){status='compatible';evidence.push({asset_id:m.asset_id,version:m.version,manifest_digest:summary.manifest_digest,evidence_id:e.evidence_id,runtime_digest:e.runtime_digest,adapter_version:e.adapter_version,preset_digest:e.preset_digest});}
   }
   if(status==='unknown')reasons.push({code:'RUNTIME_EVIDENCE_MISSING',message:'No matching content, runtime, adapter and preset validation evidence',asset_id:m.asset_id});states.push(status);
  }
  const status=['incompatible','adapter_required','unknown'].find(s=>states.includes(s))||(states.length?'compatible':'unknown');
  return assertValid('CompatibilityResult',{contract_version:'1.0.0',status,assets:request.assets,runtime:request.runtime,reasons,evidence});
 }
 resolveAssembly(request){
  assertValid('ResolveRequest',request);const {descriptor,index}=this.index(request.snapshot_id),selected=new Map(),active=new Set(),artifacts=new Map(),roots=new Map(),assemblies=[];
  const visit=summary=>{const id=summary.asset_id;if(active.has(id))error('ASSET_DEPENDENCY_CYCLE',409);if(selected.has(id)){if(selected.get(id).version!==summary.version)error('ASSET_VERSION_CONFLICT',409);return;}active.add(id);selected.set(id,summary);const m=this.manifest(summary);
   for(const dependency of m.dependencies)visit(this.select(index,dependency.asset_id,dependency.version));
   for(const r of m.resources)if(request.purpose==='preview'||r.role==='runtime'){const previous=artifacts.get(r.artifact_id),artifact=artifactOf(r);if(previous&&(previous.sha256!==r.sha256||previous.byte_length!==r.byte_length||previous.format!==r.format||previous.mime_type!==r.mime_type||previous.storage_path!==r.storage_path))error('ASSET_ARTIFACT_CONFLICT',409);if(!previous||r.role==='runtime')artifacts.set(r.artifact_id,artifact);}
   active.delete(id);
  };
  const root=ref=>{const summary=this.select(index,ref.asset_id,ref.version);visit(summary);roots.set(summary.asset_id,refOf(summary));};
  request.assets.forEach(root);
  for(const ref of request.assemblies||[]){const assembly=index.assemblies.find(a=>a.assembly_id===ref.assembly_id&&a.version===ref.version);if(!assembly)error('ASSET_ASSEMBLY_NOT_FOUND',404);if(assembly.stage==='incomplete')error('ASSET_ASSEMBLY_INCOMPLETE',409);Object.values(assembly.roles).forEach(root);assemblies.push({assembly_id:assembly.assembly_id,version:assembly.version,manifest_digest:assembly.manifest_digest});}
  const assetRefs=[...selected.values()].sort((a,b)=>lexical(a.asset_id,b.asset_id));
  const compatibility=this.checkCompatibility({assets:assetRefs.map(refOf),runtime:request.runtime,snapshot_id:descriptor.snapshot_id});
  if(request.runtime&&compatibility.status!=='incompatible')for(const ref of assemblies){const assembly=index.assemblies.find(a=>a.assembly_id===ref.assembly_id&&a.version===ref.version);if(assembly.contract_id&&!request.runtime.supported_contracts.some(c=>c.contract_id===assembly.contract_id&&c.version===assembly.contract_version)){compatibility.status='adapter_required';compatibility.reasons.push({code:'ASSEMBLY_CONTRACT_UNSUPPORTED',message:'Composite assembly requires unsupported contract '+assembly.contract_id});}}
  if(assemblies.length&&compatibility.status==='compatible'){compatibility.status='unknown';compatibility.reasons.push({code:'ASSEMBLY_EVIDENCE_MISSING',message:'Component evidence does not establish composite assembly compatibility'});}
  const lock={kind:'asset-lock',contract_version:'1.0.0',registry_id:descriptor.registry_id,snapshot_id:descriptor.snapshot_id,taxonomy_version:descriptor.taxonomy_version,purpose:request.purpose,roots:[...roots.values()].sort((a,b)=>lexical(a.asset_id,b.asset_id)),assets:assetRefs.map(manifestRef),artifacts:[...artifacts.values()].sort((a,b)=>lexical(a.artifact_id,b.artifact_id)),assemblies:assemblies.sort((a,b)=>lexical(a.assembly_id,b.assembly_id)),runtime:request.runtime,compatibility};
  return assertValid('ProjectLock',{...lock,lock_digest:sha256(canonicalJson(lock))});
 }
 resolve(request){return this.resolveAssembly(request);}
 resourceScope(request){
  assertValid('ResourceScopeRequest',request);const {descriptor,index}=this.index(request.snapshot_id),allowedIds=[...new Set(request.allowed_asset_ids)].sort(),allowed=new Set(),denied=new Set();
  const latest=new Map();for(const summary of index.assets){const previous=latest.get(summary.asset_id);if(!previous||compareVersions(summary.version,previous.version)>0)latest.set(summary.asset_id,summary);}
  for(const summary of index.assets){
   const manifest=this.manifest(summary),extension=manifest.extensions.whitebox;if(!extension)continue;
   const resources=new Map(manifest.resources.map(r=>[r.resource_id,r]));
   for(const id of [extension.resource_id,...(extension.resources||[]).map(r=>r.resource_id)]){const resource=resources.get(id);if(!resource)error('ASSET_RESOURCE_REFERENCE_INVALID',500);denied.add(resource.sha256);if(allowedIds.includes(summary.asset_id)&&latest.get(summary.asset_id).version===summary.version)allowed.add(resource.sha256);}
  }
  const denied_resource_sha256=[...denied].filter(hash=>!allowed.has(hash)).sort();
  const scope_digest=sha256(canonicalJson({registry_id:descriptor.registry_id,snapshot_id:descriptor.snapshot_id,allowed_asset_ids:allowedIds,denied_resource_sha256}));
  return assertValid('ResourceScope',{contract_version:'1.0.0',registry_id:descriptor.registry_id,snapshot_id:descriptor.snapshot_id,denied_resource_sha256,scope_digest});
 }
 publishedFiles(){
  const files=new Map([['registry.json',{mime_type:'application/json',mutable:true}]]);
  for(const file of walk(path.join(this.root,'releases')).filter(f=>path.basename(f)==='registry.json')){const id=path.basename(path.dirname(file));if(!digestPattern.test(id))continue;const {descriptor,index}=this.index(id);files.set(`releases/${id}/registry.json`,{mime_type:'application/json'});files.set(descriptor.index_path,{mime_type:'application/json'});
   for(const summary of index.assets){files.set(summary.manifest_path,{mime_type:'application/json',sha256:summary.manifest_digest});for(const r of this.manifest(summary).resources)files.set(r.storage_path,r);}
  }return files;
 }
 locateArtifact(artifactId,{baseUrl}={}){const hash=artifactId.replace(/^sha256:/,'');if(!digestPattern.test(hash))error('ASSET_ARTIFACT_INVALID');const relative=`artifacts/sha256/${hash.slice(0,2)}/${hash}`;if(!this.publishedFiles().has(relative))error('ASSET_ARTIFACT_NOT_FOUND',404);const base=this.artifactBaseUrl||baseUrl;if(!base)error('ASSET_ARTIFACT_BASE_URL_REQUIRED');const url=new URL(relative,base.endsWith('/')?base:base+'/');if(!['http:','https:'].includes(url.protocol)||url.username||url.password)error('ASSET_ARTIFACT_URL_INVALID');return assertValid('ArtifactLocation',{contract_version:'1.0.0',artifact_id:'sha256:'+hash,url:url.href,expires_at:null});}
}
