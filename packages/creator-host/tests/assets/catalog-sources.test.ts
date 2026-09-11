import {describe,it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {writeCatalogSources,readCatalogSources,syncAssetCatalog} from '../../src/assets/catalog-sources.js';

async function fixture(run:(root:string)=>Promise<void>) {
  const root=await mkdtemp(path.join(os.tmpdir(),'asset-sources-'));
  try {await mkdir(path.join(root,'assets/three-creator/catalog'),{recursive:true});await run(root);}
  finally {await rm(root,{recursive:true,force:true});}
}
describe('independent asset catalog sources',()=>{
  it('keeps the real Host catalog derived from its independent sources',async()=>{
    await syncAssetCatalog(path.resolve('.'),true);
  });
  it('updates one asset without rewriting unrelated sources and derives deterministic output',async()=>fixture(async root=>{
    await writeCatalogSources(root,[{id:'one',displayName:'One'},{id:'two',displayName:'Two'}]);
    const second=await readFile(path.join(root,'assets/three-creator/catalog/two.json'),'utf8');
    await writeCatalogSources(root,[{id:'one',displayName:'Changed'}]);
    expect(await readFile(path.join(root,'assets/three-creator/catalog/two.json'),'utf8')).toBe(second);
    await syncAssetCatalog(root);
    const generated=await readFile(path.join(root,'assets/three-creator/asset-catalog.json'),'utf8');
    expect(JSON.parse(generated).assets.map((a:any)=>a.id)).toEqual(['one','two']);
    await syncAssetCatalog(root,true);
    await writeFile(path.join(root,'assets/three-creator/asset-catalog.json'),'{}');
    await expect(syncAssetCatalog(root,true)).rejects.toThrow('THREE_CATALOG_GENERATED_DRIFT');
  }));
  it('rejects duplicate IDs, mismatched filenames and symlink sources',async()=>fixture(async root=>{
    await expect(writeCatalogSources(root,[{id:'same'},{id:'same'}])).rejects.toThrow('THREE_CATALOG_DUPLICATE');
    await expect(writeCatalogSources(root,[{id:'../escape'}])).rejects.toThrow('THREE_CATALOG_ID_INVALID');
    const dir=path.join(root,'assets/three-creator/catalog');
    await writeFile(path.join(dir,'wrong.json'),'{"id":"right"}');
    await expect(readCatalogSources(root)).rejects.toThrow('THREE_CATALOG_SOURCE_ID');
    await rm(path.join(dir,'wrong.json'));await writeFile(path.join(root,'outside.json'),'{"id":"outside"}');
    await symlink(path.join(root,'outside.json'),path.join(dir,'outside.json'));
    await expect(readCatalogSources(root)).rejects.toThrow('THREE_CATALOG_SOURCE_SYMLINK');
  }));
});
