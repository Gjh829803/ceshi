import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {RegistryClient} from '@worldkit/asset-client';
import {readArtifact,materializeAssets} from '@worldkit/asset-client/materialize';
import {composeAssetCatalog,runtimeAssetContext} from '@worldkit/preset-content/assets/host-adapter';

const sessions=new Map();
const key=root=>JSON.stringify([path.resolve(root),process.env.ASSET_REGISTRY_URL,process.env.ASSET_ARTIFACT_BASE_URL||null]);
const scopeKey=ids=>JSON.stringify([...new Set(ids)].sort());
const fail=(code,id='')=>{throw Error(`${code}${id?': '+id:''}`);};
function session(root){const value=sessions.get(key(root));if(!value)fail('THREE_ASSET_LIBRARY_NOT_PREPARED');return value;}
function cacheRoot(root){return path.resolve(process.env.ASSET_CACHE_ROOT||path.join(root,'.asset-cache'));}
function projection(manifest){
 const entry=structuredClone(manifest.extensions.whitebox);
 if(!entry||entry.id!==manifest.asset_id||entry.contentVersion!==manifest.version)fail('THREE_ASSET_ADAPTER_REQUIRED',manifest.asset_id);
 function resource(id,kind,alias){
  const source=manifest.resources.find(r=>r.resource_id===id);
  if(!source||source.role!=='runtime')fail('THREE_ASSET_RUNTIME_RESOURCE_REQUIRED',id);
  if(!/^[a-z0-9]+$/.test(source.format))fail('THREE_ASSET_RESOURCE_FORMAT',id);
  return {uri:`./assets/${kind}/${source.sha256}.${source.format}`,sourcePath:'asset-registry:'+source.sha256,sha256:source.sha256,byteLength:source.byte_length,...(alias?{path:alias}:{})};
 }
 const {resource_id,resources,...metadata}=entry;
 return {...metadata,...resource(resource_id,'subjects'),...(resources?{resources:resources.map(r=>resource(r.resource_id,'resources',r.path))}:{})};
}
/** Load only requested Whitebox manifests. Policy scope is separate from the selection. */
export async function prepareRegistry(root,{assetIds,policySnapshotPath,policyAssetIds}={}){
 const policy=JSON.parse(await readFile(policySnapshotPath||path.join(root,'packages/creator-host/config/asset-policy.json'),'utf8'));
 const allowedIds=policyAssetIds||(policy.policy||policy).allowedAssetIds;
 let current=sessions.get(key(root));
 if(!current){current={client:new RegistryClient({registryUrl:process.env.ASSET_REGISTRY_URL,artifactBaseUrl:process.env.ASSET_ARTIFACT_BASE_URL}),entries:new Map(),refs:new Map(),artifacts:new Map(),scopes:new Map()};sessions.set(key(root),current);}
 const ids=[...new Set(assetIds||allowedIds)];
 for(const id of ids){
  if(current.entries.has(id))continue;
  const page=await current.client.searchAssets({asset_ids:[id],limit:1});
  const summary=page.items.find(item=>item.asset_id===id);if(!summary)fail('THREE_ASSET_UNKNOWN',id);
  const {asset_id,version,manifest_digest,manifest_path}=summary,ref={asset_id,version,manifest_digest,manifest_path};
  const manifest=await current.client.fetchManifest(ref);
  const entry=composeAssetCatalog([projection(manifest)])[0];
  current.refs.set(id,ref);current.entries.set(id,entry);
  for(const resource of manifest.resources)current.artifacts.set(resource.sha256,resource);
 }
 const scopeId=scopeKey(allowedIds);
 if(!current.scopes.has(scopeId))current.scopes.set(scopeId,(await current.client.resourceScope({allowed_asset_ids:allowedIds})).denied_resource_sha256);
 return ids.map(id=>structuredClone(current.entries.get(id)));
}
export function registryCatalog(root){return structuredClone([...session(root).entries.values()]);}
export function registryDeniedHashes(root,ids){const hashes=session(root).scopes.get(scopeKey(ids));if(!hashes)fail('THREE_ASSET_POLICY_SCOPE_NOT_PREPARED');return [...hashes];}
export async function registryResource(root,resource){
 const current=session(root),artifact=current.artifacts.get(resource.sha256);
 if(!artifact||resource.sourcePath!=='asset-registry:'+artifact.sha256||resource.byteLength!==artifact.byte_length)fail('THREE_ASSET_SOURCE_ESCAPE');
 const {resource_id,logical_paths,...transport}=artifact;
 return readArtifact(transport,{client:current.client,cacheRoot:cacheRoot(root)});
}
export async function registrySelection(root,ids,{runtimeDigest,overridesDigest,allowedAssetIds,runtimeId,runtimeVersion,authorRuntime=false}={}){
 const current=session(root);
 const assets=ids.map(id=>{const ref=current.refs.get(id);if(!ref)fail('THREE_ASSET_UNKNOWN',id);return {asset_id:id,version:ref.version};});
 const runtime={...runtimeAssetContext(ids),...(runtimeId?{runtime_id:runtimeId}:{}),...(runtimeVersion?{runtime_version:runtimeVersion}:{}),...(runtimeDigest?{runtime_digest:runtimeDigest}:{}),...(overridesDigest?{overrides_digest:overridesDigest}:{}),...(authorRuntime?{supported_contracts:[]}:{})};
 const request={assets,purpose:'runtime',runtime};
 const lock=await current.client.resolveAssembly(request);
 if(allowedAssetIds&&lock.assets.some(ref=>!allowedAssetIds.includes(ref.asset_id)))fail('THREE_ASSET_POLICY_DENIED');
 if(allowedAssetIds&&lock.assets.some(ref=>{const pinned=current.refs.get(ref.asset_id);return !pinned||['version','manifest_digest','manifest_path'].some(field=>ref[field]!==pinned[field]);}))fail('THREE_ASSET_POLICY_VERSION_DENIED');
 if(lock.compatibility.status==='incompatible'||lock.compatibility.status==='adapter_required'&&!authorRuntime)fail('THREE_ASSET_RUNTIME_INCOMPATIBLE');
 return {manifest:{...request,snapshot_id:lock.snapshot_id},lock};
}
export async function materializeRegistrySelection(root,lock,options={}){return materializeAssets(lock,{client:session(root).client,cacheRoot:cacheRoot(root),...options});}
