import Ajv from '../../tools/vendor/ajv.cjs';
import {schemas,assertSafePath,assertContractVersion,protocolError} from './index.mjs';
const ajv=new Ajv({allErrors:true,strict:false});ajv.addSchema(schemas);
const validators=new Map();
/** New authoring and publication require exact runtime evidence; v1 readers keep opaque metadata. */
export function assertValidationEvidence(asset,validation){
 assertValid('RuntimeValidation',validation);
 for(const evidence of validation.evidence){
  if(typeof evidence==='string')continue; // File references document format/visual checks only.
  if(evidence.asset_id!==asset.asset_id||evidence.version!==asset.version)
   throw protocolError('ASSET_VALIDATION_IDENTITY_MISMATCH');
 }
 return validation;
}
export function assertValid(name,value){
 if(!Object.hasOwn(schemas.$defs,name))throw protocolError('ASSET_CONTRACT_UNKNOWN_TYPE',name);
 let validate=validators.get(name);
 if(!validate){validate=ajv.compile({$ref:schemas.$id+'#/$defs/'+name});validators.set(name,validate);}
 if(!validate(value))throw protocolError('ASSET_CONTRACT_INVALID',ajv.errorsText(validate.errors),400,{type:name});
 if(value.contract_version!==undefined)assertContractVersion(value.contract_version);
 function artifact(a){
  assertSafePath(a.storage_path);
  if(a.artifact_id!=='sha256:'+a.sha256||a.storage_path!=='artifacts/sha256/'+a.sha256.slice(0,2)+'/'+a.sha256)
   throw protocolError('ASSET_CONTRACT_ARTIFACT_IDENTITY');
 }
 if(name==='Artifact'||name==='Resource')artifact(value);
 if(name==='Summary'&&value.preview!==null)artifact(value.preview);
 if(name==='SearchResponse')for(const item of value.items)if(item.preview!==null)artifact(item.preview);
 if(name==='Manifest'){
  const resources=new Map();for(const r of value.resources){artifact(r);if(resources.has(r.resource_id))throw protocolError('ASSET_CONTRACT_DUPLICATE_RESOURCE');resources.set(r.resource_id,r);}
  for(const key of ['model_resource_id','preview_resource_id'])if(value[key]!==null&&!resources.has(value[key]))throw protocolError('ASSET_CONTRACT_RESOURCE_MISSING',key);
 }
 if(name==='ProjectLock'){
  const ids=new Set();for(const a of value.artifacts){artifact(a);if(ids.has(a.artifact_id))throw protocolError('ASSET_CONTRACT_DUPLICATE_ARTIFACT');ids.add(a.artifact_id);}
  const assets=new Set();for(const a of value.assets){assertSafePath(a.manifest_path);if(assets.has(a.asset_id))throw protocolError('ASSET_CONTRACT_DUPLICATE_ASSET');assets.add(a.asset_id);}
 }
 if(name==='ManifestRef')assertSafePath(value.manifest_path);
 return value;
}
