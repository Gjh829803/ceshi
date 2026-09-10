import {mkdir,readFile,readdir,lstat,writeFile,rm,realpath} from 'node:fs/promises';
import path from 'node:path';

export type CatalogSource = Record<string,any> & {id:string};
const sourceDirectory=(root:string)=>path.join(root,'assets/three-creator/catalog');
function validate(entries:readonly CatalogSource[]) {
  const ids=new Set<string>();
  for(const entry of entries) {
    if(!entry || typeof entry.id!=='string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(entry.id))throw new Error('THREE_CATALOG_ID_INVALID');
    if(ids.has(entry.id))throw new Error(`THREE_CATALOG_DUPLICATE: ${entry.id}`);ids.add(entry.id);
  }
}
export async function readCatalogSources(root:string):Promise<CatalogSource[]> {
  const directory=sourceDirectory(await realpath(root)),entries:CatalogSource[]=[];
  if((await lstat(directory)).isSymbolicLink() || await realpath(directory)!==directory)throw new Error('THREE_CATALOG_SOURCE_SYMLINK');
  for(const name of (await readdir(directory)).sort()) {
    if(!name.endsWith('.json'))continue;
    const file=path.join(directory,name),stat=await lstat(file);
    if(stat.isSymbolicLink() || await realpath(file)!==file)throw new Error('THREE_CATALOG_SOURCE_SYMLINK');
    if(!stat.isFile())throw new Error('THREE_CATALOG_SOURCE_INVALID');
    const entry=JSON.parse(await readFile(file,'utf8')) as CatalogSource;validate([entry]);
    if(name!==`${entry.id}.json`)throw new Error(`THREE_CATALOG_SOURCE_ID: ${name}`);
    entries.push(entry);
  }
  validate(entries);return entries.sort((a,b)=>a.id.localeCompare(b.id));
}
/** Import/export scripts write owned entries. Full replacement is explicit. */
export async function writeCatalogSources(root:string,entries:readonly CatalogSource[],replace=false):Promise<void> {
  validate(entries);const directory=sourceDirectory(await realpath(root));await mkdir(directory,{recursive:true});
  if((await lstat(directory)).isSymbolicLink() || await realpath(directory)!==directory)throw new Error('THREE_CATALOG_SOURCE_SYMLINK');
  // Check all existing paths before a write; never follow an author-controlled link.
  const existing=await readCatalogSources(root);
  for(const entry of entries) {
    const previous=existing.find(value=>value.id===entry.id);
    if(previous && JSON.stringify(previous)===JSON.stringify(entry))continue;
    await writeFile(path.join(directory,`${entry.id}.json`),`${JSON.stringify(entry,null,2)}\n`);
  }
  if(replace)for(const entry of existing)if(!entries.some(next=>next.id===entry.id))await rm(path.join(directory,`${entry.id}.json`));
}
/** The existing Host catalog is a derived compatibility view, not a second source. */
export async function syncAssetCatalog(root:string,check=false) {
  const entries=await readCatalogSources(root),file=path.join(root,'assets/three-creator/asset-catalog.json');
  const text=`${JSON.stringify({schemaVersion:1,assets:entries},null,2)}\n`;
  if(check) {if(await readFile(file,'utf8')!==text)throw new Error('THREE_CATALOG_GENERATED_DRIFT: run pnpm content:sync');}
  else await writeFile(file,text);
  return entries;
}
