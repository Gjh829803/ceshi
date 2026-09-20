import {describe,it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp,copyFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readCatalogSources,syncAssetCatalog} from '../../src/assets/catalog-sources.js';

const repository=path.resolve('.'),library=path.join(repository,'asset-library'),subject='subjects/animals/creature.horse/0.1.0';
async function fixture(run:(root:string)=>Promise<void>){
  const root=await mkdtemp(path.join(os.tmpdir(),'subject-catalog-'));
  try{
    await mkdir(path.join(root,'asset-library/tools'),{recursive:true});
    for(const file of ['core.mjs','whitebox.mjs'])await copyFile(path.join(library,'tools',file),path.join(root,'asset-library/tools',file));
    for(const file of ['tools/vendor/ajv.cjs','schemas/content-parameters.schema.json']){
      const target=path.join(root,'asset-library',file);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(library,file),target);
    }
    await cp(path.join(library,subject),path.join(root,'asset-library',subject),{recursive:true});
    const resources=JSON.parse(await readFile(path.join(library,subject,'resources.json'),'utf8'));
    for(const file of resources.files){const to=path.join(root,'asset-library',file.path);await mkdir(path.dirname(to),{recursive:true});await copyFile(path.join(library,file.path),to);}
    await run(root);
  }finally{await rm(root,{recursive:true,force:true});}
}
describe('subject metadata is the only catalog source',()=>{
  it('keeps generated Host and preset exports derived from library records',async()=>{
    await syncAssetCatalog(repository,true);
    const entries=await readCatalogSources(repository);
    expect(entries.length).toBeGreaterThan(40);
    expect(entries.every(entry=>entry.sourcePath.startsWith('asset-library/'))).toBe(true);
  },15_000);
  it('reflects identity and capability changes without an old catalog or source folder',async()=>fixture(async root=>{
    const file=path.join(root,'asset-library',subject,'asset.json'),value=JSON.parse(await readFile(file,'utf8'));
    value.display_name='Horse from authoritative subject';await writeFile(file,JSON.stringify(value));
    const entries=await readCatalogSources(root);expect(entries).toHaveLength(1);expect(entries[0]?.displayName).toBe(value.display_name);
    await expect(readFile(path.join(root,'assets/three-creator/asset-catalog.json'))).rejects.toThrow();
  }));
  it('rejects duplicate subject identities instead of producing ambiguous adapters',async()=>fixture(async root=>{
    await cp(path.join(root,'asset-library',subject),path.join(root,'asset-library/subjects/animals/duplicate/0.1.0'),{recursive:true});
    await expect(readCatalogSources(root)).rejects.toThrow('THREE_CATALOG_DUPLICATE');
  }));
  it('rejects bad resource identities before exposing a generated catalog',async()=>fixture(async root=>{
    const file=path.join(root,'asset-library',subject,'resources.json'),value=JSON.parse(await readFile(file,'utf8'));value.files.find((f:any)=>f.path===value.model).sha256='0'.repeat(64);await writeFile(file,JSON.stringify(value));
    await expect(readCatalogSources(root)).rejects.toThrow('WHITEBOX_RESOURCE_HASH_MISMATCH');
  }));
});
