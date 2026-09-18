/** Verify and rebuild the generated dragon delivery closure from the asset library. */
import path from 'node:path';
import {syncAssetCatalog} from '@worldkit/creator-host/catalog-sources';
import {readLibraryResource} from '@worldkit/creator-host/library-source';
const root=path.resolve(import.meta.dirname,'../../..');
const assets=await syncAssetCatalog(root,process.argv.includes('--check'));
const dragons=assets.filter(asset=>/^creature\.dragon\.d\d{2}$/.test(asset.id));
for(const asset of dragons)for(const resource of [asset,...asset.resources??[]])await readLibraryResource(root,resource);
console.log(JSON.stringify({library:'asset-library',verifiedDragons:dragons.length,mode:process.argv.includes('--check')?'verified':'generated'}));
