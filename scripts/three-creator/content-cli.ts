import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {syncAssetCatalog} from './catalog-sources.js';
import {catalogResources,readCatalogResource} from './asset-resources.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),check=args.includes('--check');
const assetIds=args.flatMap((value,index)=>value==='--asset'?[args[index+1]!]:[]);
if(assetIds.some(id=>!id || id.startsWith('--')))throw new Error('Pass an asset ID after --asset');
const entries=await syncAssetCatalog(root,check);
const policy=JSON.parse(await readFile(path.join(root,'config/three-creator/asset-policy.json'),'utf8'));
const selected=assetIds.length?assetIds.map(id=>{const entry=entries.find(e=>e.id===id);if(!entry)throw new Error(`THREE_ASSET_UNKNOWN: ${id}`);return entry;}):[];
const results=[];
for(const entry of selected) {
  try {
    for(const resource of catalogResources(entry as any))await readCatalogResource(root,resource);
    results.push({id:entry.id,registered:true,policyAllowed:policy.allowedAssetIds.includes(entry.id),resources:'verified',
      behavior:'not-checked',visual:'not-reviewed',release:'not-checked'});
  } catch(error) {process.exitCode=1;results.push({id:entry.id,resources:'failed',error:String(error)});}
}
console.log(JSON.stringify({catalog:check?'matches-sources':'updated',assetCount:entries.length,results},null,2));
