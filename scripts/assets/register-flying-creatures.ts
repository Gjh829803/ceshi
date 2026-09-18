/** Verify maintained flying-creature resources and regenerate derived library catalogs. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {type CatalogSource,readCatalogSources,syncAssetCatalog} from '@worldkit/creator-host/catalog-sources';
import {type LibraryResource,readLibraryResource} from '@worldkit/creator-host/library-source';
const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

export async function flyingCreatureCatalogEntries(root=repositoryRoot){
  const entries=(await readCatalogSources(root)).filter(asset=>/^creature\.dragon\.d\d{2}$/.test(asset.id)) as Array<CatalogSource&LibraryResource&{resources:LibraryResource[]}>;
  for(const entry of entries){
    for(const resource of [entry,...entry.resources??[]])await readLibraryResource(root,resource);
  }
  return entries;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const entries=await flyingCreatureCatalogEntries();
  await syncAssetCatalog(repositoryRoot,process.argv.includes('--check'));
  console.log(JSON.stringify({assets:entries.map(entry=>entry.id),mode:process.argv.includes('--check')?'verified':'generated'}));
}
