import {cp,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

/** Explicit isolated test closure; no ambient checkout node_modules resolution. */
export async function installFixtureLibraryClosure(repositoryRoot,toolkitRoot){
 const copy=async(relative,target=relative)=>{await mkdir(path.dirname(path.join(toolkitRoot,target)),{recursive:true});await cp(path.join(repositoryRoot,relative),path.join(toolkitRoot,target),{recursive:true,dereference:true});};
 await copy('packages/creator-host/src/assets/library-source.mjs');
 await copy('packages/creator-host/src/assets/registry-source.mjs');
 for(const file of ['package.json','src/assets/host-adapter.mjs','config'])await copy('packages/preset-content/'+file,'node_modules/@worldkit/preset-content/'+file);
 for(const file of ['package.json','src'])await copy('packages/asset-client/'+file,'node_modules/@worldkit/asset-client/'+file);
 for(const file of ['package.json','index.mjs','validate.mjs','schemas'])await copy('packages/asset-contracts/'+file,'node_modules/@worldkit/asset-contracts/'+file);
 const require=createRequire(pathToFileURL(path.join(repositoryRoot,'package.json')));
 const ajvPackage=require.resolve('ajv/package.json'),ajvRequire=createRequire(ajvPackage);
 for(const name of ['ajv','fast-deep-equal','fast-uri','json-schema-traverse','require-from-string']){
  const manifest=(name==='ajv'?require:ajvRequire).resolve(name+'/package.json');
  await mkdir(path.join(toolkitRoot,'node_modules'),{recursive:true});
  await cp(path.dirname(manifest),path.join(toolkitRoot,'node_modules',name),{recursive:true,dereference:true});
 }
}
