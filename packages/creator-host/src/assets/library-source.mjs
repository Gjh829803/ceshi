import path from 'node:path';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {composeAssetCatalog} from '@worldkit/preset-content/assets/host-adapter';

const prepared=new Map();
let registryModule;
export function assetRegistryUrl(){return process.env.ASSET_REGISTRY_URL||null;}
function registry(){if(!registryModule)fail('THREE_ASSET_LIBRARY_NOT_PREPARED');return registryModule;}
const catalogPath='dist/whitebox/asset-catalog.json';
const prefix='asset-library/';
const fail=(code,detail='')=>{throw new Error(code+(detail?': '+detail:''));};
export function assetLibraryRoot(repositoryRoot){return path.resolve(process.env.ASSET_LIBRARY_ROOT||path.join(repositoryRoot,'asset-library'));}
export function assetLibraryUrl(){
  const configured=process.env.ASSET_LIBRARY_URL;if(!configured)return null;
  const url=new URL(configured.endsWith('/')?configured:configured+'/');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)fail('THREE_ASSET_LIBRARY_URL_INVALID');
  return url.href;
}
function relativePath(value){
  if(typeof value!=='string'||!value.startsWith(prefix))fail('THREE_ASSET_SOURCE_ESCAPE');
  const relative=value.slice(prefix.length);
  if(!relative||/[\\:%?#\0]/.test(relative)||relative.split('/').some(p=>!p||p==='.'||p==='..'))fail('THREE_ASSET_SOURCE_ESCAPE');
  return relative;
}
function validateCatalog(value){
  if(value?.schemaVersion!==1||!Array.isArray(value.assets))fail('THREE_CATALOG_INVALID');
  const ids=new Set();for(const entry of value.assets){
    if(!entry||typeof entry.id!=='string'||ids.has(entry.id))fail('THREE_CATALOG_INVALID');ids.add(entry.id);
    for(const resource of [entry,...entry.resources||[]])relativePath(resource.sourcePath);
  }
  return composeAssetCatalog(value.assets);
}
function containedSync(root,relative){
  const absolute=path.resolve(root,relative);if(!absolute.startsWith(path.resolve(root)+path.sep))fail('THREE_ASSET_SOURCE_ESCAPE');
  if(lstatSync(root).isSymbolicLink())fail('THREE_ASSET_SOURCE_ESCAPE');
  let cursor=root;for(const part of relative.split('/')){cursor=path.join(cursor,part);if(lstatSync(cursor).isSymbolicLink())fail('THREE_ASSET_SOURCE_ESCAPE');}
  if(realpathSync(absolute)!==absolute||!lstatSync(absolute).isFile())fail('THREE_ASSET_SOURCE_ESCAPE');return absolute;
}
async function contained(root,relative){
  const absolute=path.resolve(root,relative);if(!absolute.startsWith(path.resolve(root)+path.sep))fail('THREE_ASSET_SOURCE_ESCAPE');
  if((await lstat(root)).isSymbolicLink())fail('THREE_ASSET_SOURCE_ESCAPE');
  let cursor=root;for(const part of relative.split('/')){cursor=path.join(cursor,part);if((await lstat(cursor)).isSymbolicLink())fail('THREE_ASSET_SOURCE_ESCAPE');}
  if(await realpath(absolute)!==absolute||!(await lstat(absolute)).isFile())fail('THREE_ASSET_SOURCE_ESCAPE');return absolute;
}
async function remoteBytes(base,relative){
  const url=new URL(relative,base);if(!url.href.startsWith(base))fail('THREE_ASSET_SOURCE_ESCAPE');
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)fail('THREE_ASSET_LIBRARY_HTTP',String(response.status));return Buffer.from(await response.arrayBuffer());
}
/** Prepare the selected HTTP catalog before creating synchronous policy owners. */
export async function prepareAssetLibrary(repositoryRoot,options={}){
  if(assetRegistryUrl()){
    if(process.env.ASSET_LIBRARY_URL)fail('THREE_ASSET_SOURCE_AMBIGUOUS');
    registryModule=await import('./registry-source.mjs');return registryModule.prepareRegistry(repositoryRoot,options);
  }
  const url=assetLibraryUrl();if(!url)return readLibraryCatalogSync(repositoryRoot);
  const entries=validateCatalog(JSON.parse((await remoteBytes(url,catalogPath)).toString('utf8')));prepared.set(url,structuredClone(entries));return structuredClone(entries);
}
export async function readLibraryCatalog(repositoryRoot,options){return prepareAssetLibrary(repositoryRoot,options);}
export function readLibraryCatalogSync(repositoryRoot){
  if(assetRegistryUrl())return registry().registryCatalog(repositoryRoot);
  const url=assetLibraryUrl();
  if(url){const entries=prepared.get(url);if(!entries)fail('THREE_ASSET_LIBRARY_NOT_PREPARED','await prepareAssetLibrary before constructing Creator');return structuredClone(entries);}
  const root=assetLibraryRoot(repositoryRoot);
  return validateCatalog(JSON.parse(readFileSync(containedSync(root,catalogPath),'utf8')));
}
export async function readLibraryResource(repositoryRoot,resource){
  if(assetRegistryUrl())return registry().registryResource(repositoryRoot,resource);
  const relative=relativePath(resource.sourcePath),url=assetLibraryUrl();
  const bytes=url?await remoteBytes(url,relative):await readFile(await contained(assetLibraryRoot(repositoryRoot),relative));
  if(bytes.length!==resource.byteLength||createHash('sha256').update(bytes).digest('hex')!==resource.sha256)fail('THREE_ASSET_HASH_MISMATCH');return bytes;
}
export function readLibraryDeniedHashes(repositoryRoot,allowedIds){return assetRegistryUrl()?registry().registryDeniedHashes(repositoryRoot,allowedIds):[];}
export async function resolveLibrarySelection(repositoryRoot,ids,options){return ids.length&&assetRegistryUrl()?registry().registrySelection(repositoryRoot,ids,options):null;}
export async function materializeLibrarySelection(repositoryRoot,lock,options){return registry().materializeRegistrySelection(repositoryRoot,lock,options);}
