import schemas from './schemas/v1.schema.json' with {type:'json'};
export {schemas};
export const CONTRACT_VERSION='1.0.0';
const versionPattern=/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
export function protocolError(code,message=code,status=400,details={}){
 const error=new Error(message===code?code:code+': '+message);Object.assign(error,{code,status,retryable:status===429||status>=500,details});return error;
}
export function assertContractVersion(value){
 if(value!==CONTRACT_VERSION)throw protocolError('ASSET_CONTRACT_VERSION_UNSUPPORTED','Unsupported asset contract version',409,{actual:value,supported:CONTRACT_VERSION});
}
export function assertSafePath(value){
 if(typeof value!=='string'||!value||/[\\:%?#\0]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'))
  throw protocolError('ASSET_PATH_INVALID');
}
export function canonicalJson(value){
 const visit=(v)=>{
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(Array.isArray(v))return v.map(visit);
  if(v&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v))){
   return Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,visit(v[k])]));
  }
  throw protocolError('ASSET_JSON_INVALID','Canonical metadata must contain finite JSON values');
 };
 return JSON.stringify(visit(value));
}
export function isVersion(value){return typeof value==='string'&&versionPattern.test(value)&&value.split('.').every(n=>Number.isSafeInteger(Number(n)));}
export function compareVersions(a,b){
 if(!isVersion(a)||!isVersion(b))throw protocolError('ASSET_VERSION_INVALID');
 const av=a.split('.').map(Number),bv=b.split('.').map(Number);
 for(let i=0;i<3;i++)if(av[i]!==bv[i])return av[i]>bv[i]?1:-1;return 0;
}
export function satisfiesVersion(version,selector){
 if(!isVersion(version))throw protocolError('ASSET_VERSION_INVALID');
 if(selector==='latest')return true;
 if(typeof selector!=='string')throw protocolError('ASSET_VERSION_SELECTOR_INVALID');
 const prefix=/^[~^]/.test(selector)?selector[0]:'',base=prefix?selector.slice(1):selector;
 if(!isVersion(base))throw protocolError('ASSET_VERSION_SELECTOR_INVALID');
 if(!prefix)return version===base;
 if(compareVersions(version,base)<0)return false;
 const [major,minor,patch]=base.split('.').map(Number);
 const upper=prefix==='~'?[major,minor+1,0]:major>0?[major+1,0,0]:minor>0?[0,minor+1,0]:[0,0,patch+1];
 return compareVersions(version,upper.join('.'))<0;
}
