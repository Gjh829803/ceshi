import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {lstat,readdir,realpath} from 'node:fs/promises';
import {assetLibraryRoot,assetLibraryUrl} from './library-source.mjs';
import {composeAssetCatalog,presetAuthoringContext} from '@worldkit/preset-content/assets/host-adapter';

export type CatalogSource=Record<string,any>&{id:string};
async function authoringModule(root:string,name:string){
  if(assetLibraryUrl())throw new Error('THREE_ASSET_LIBRARY_READ_ONLY: edit the source library and publish it');
  const libraryRoot=assetLibraryRoot(root),file=path.join(libraryRoot,'tools',name);
  if((await lstat(libraryRoot)).isSymbolicLink()||(await lstat(file)).isSymbolicLink()||await realpath(file)!==file)throw new Error('THREE_CATALOG_SOURCE_SYMLINK');
  return import(pathToFileURL(file).href);
}
/** Build descriptors from subject metadata; no independently authored catalog exists. */
export async function readCatalogSources(root:string):Promise<CatalogSource[]>{
  const generator=await authoringModule(root,'whitebox.mjs');
  async function rejectLinks(directory:string):Promise<void>{for(const name of await readdir(directory)){const file=path.join(directory,name),stat=await lstat(file);if(stat.isSymbolicLink())throw new Error('THREE_CATALOG_SOURCE_SYMLINK');if(stat.isDirectory())await rejectLinks(file);}}
  await rejectLinks(path.join(assetLibraryRoot(root),'subjects'));
  const entries:CatalogSource[]=(await generator.buildWhiteboxCatalog(assetLibraryRoot(root))).assets,ids=new Set<string>();
  for(const entry of entries){if(typeof entry.id!=='string'||!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(entry.id))throw new Error('THREE_CATALOG_ID_INVALID');if(ids.has(entry.id))throw new Error('THREE_CATALOG_DUPLICATE: '+entry.id);ids.add(entry.id);}
  return composeAssetCatalog(entries);
}
/** Maintainer operation: derive host metadata and compile-time content snapshots. */
export async function syncAssetCatalog(root:string,check=false):Promise<CatalogSource[]>{
  const generator=await authoringModule(root,'whitebox.mjs');
  await generator.syncWhiteboxCatalog(assetLibraryRoot(root),check);
  const presets=await authoringModule(root,'presets.mjs');
  await presets.syncContentOwnership(assetLibraryRoot(root),path.join(root,'packages/preset-content'),check);
  await presets.syncPresetContent(assetLibraryRoot(root),path.join(root,'packages/preset-content'),check,presetAuthoringContext());
  return readCatalogSources(root);
}
