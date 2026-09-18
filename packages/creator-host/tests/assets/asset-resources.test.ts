import { describe, it, expect, vi } from 'vitest';
import { catalogResources, publicCatalogValue, readCatalogResource } from '../../src/assets/asset-resources.js';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile } from 'node:fs/promises';
import {createServer} from 'node:http';
import {prepareAssetLibrary,readLibraryCatalogSync} from '../../src/assets/library-source.mjs';
import os from 'node:os';
import path from 'node:path';
import catalog from '../../../../asset-library/dist/whitebox/asset-catalog.json';

describe('catalog dependency closure', () => {
  const sha256 = 'a'.repeat(64);
  const resource = { uri: `./assets/resources/${sha256}.json`, sha256, byteLength: 10, sourcePath: 'private/path.json' };
  it('removes private source paths at every depth without removing provenance', () => {
    expect(publicCatalogValue({ ...resource, provenance: { author: 'Original author' }, resources: [resource] }))
      .toEqual({ uri: resource.uri, sha256, byteLength: 10, provenance: { author: 'Original author' }, resources: [{ uri: resource.uri, sha256, byteLength: 10 }] });
  });
  it('deduplicates shared dependencies and rejects unsealed output paths', () => {
    expect(catalogResources({ ...resource, resources: [resource] })).toHaveLength(1);
    for (const uri of ['./runtime/bridge.js', './assets/resources/arbitrary.json', `./assets/resources/${'b'.repeat(64)}.json`]) {
      expect(() => catalogResources({ ...resource, uri })).toThrow('THREE_ASSET_RESOURCE_INVALID');
    }
  });
  it('verifies dependency bytes, size and repository containment', async () => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'three-resources-')));
    try {
      await mkdir(path.join(root,'asset-library'));
      await writeFile(path.join(root, 'asset-library/clip.json'), '{}');
      const entry = { ...resource, sourcePath: 'asset-library/clip.json', byteLength: 2, sha256: createHash('sha256').update('{}').digest('hex') };
      expect((await readCatalogResource(root, entry)).toString()).toBe('{}');
      await expect(readCatalogResource(root, { ...entry, byteLength: 3 })).rejects.toThrow('THREE_ASSET_HASH_MISMATCH');
      await expect(readCatalogResource(root, { ...entry, sourcePath: '../clip.json' })).rejects.toThrow('THREE_ASSET_SOURCE_ESCAPE');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects a readable resource outside the sole asset-library namespace', async () => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'unique-library-')));
    try {
      await writeFile(path.join(root, 'old-model.json'), '{}');
      const entry = {...resource, sourcePath:'old-model.json', byteLength:2, sha256:createHash('sha256').update('{}').digest('hex')};
      await expect(readCatalogResource(root, entry)).rejects.toThrow('THREE_ASSET_SOURCE_ESCAPE');
    } finally { await rm(root,{recursive:true,force:true}); }
  });
  it('reads a relocated library root without any original asset folder',async()=>{
    const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'relocated-library-'))),external=path.join(root,'external');
    try {await mkdir(external);await writeFile(path.join(external,'clip.json'),'{}');vi.stubEnv('ASSET_LIBRARY_ROOT',external);vi.stubEnv('ASSET_LIBRARY_URL','');
      const entry={...resource,sourcePath:'asset-library/clip.json',byteLength:2,sha256:createHash('sha256').update('{}').digest('hex')};
      expect((await readCatalogResource(path.join(root,'missing-project'),entry)).toString()).toBe('{}');
    }finally{vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});}
  });
  it('prepares one remote catalog, verifies remote bytes, and never falls back to local data',async()=>{
    const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'remote-library-')));
    const hash=createHash('sha256').update('{}').digest('hex'),entry={...resource,id:'remote.subject',uri:`./assets/subjects/${hash}.json`,sourcePath:'asset-library/clip.json',byteLength:2,sha256:hash};
    let unavailable=false,corrupt=false;
    const server=createServer((req,res)=>{if(req.url==='/dist/whitebox/asset-catalog.json'){res.setHeader('content-type','application/json');res.end(JSON.stringify({schemaVersion:1,assets:[entry]}));}else if(unavailable){res.writeHead(503);res.end();}else res.end(corrupt?'wrong':'{}');});
    try {await mkdir(path.join(root,'asset-library'));await writeFile(path.join(root,'asset-library/clip.json'),'{}');await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
      vi.stubEnv('ASSET_LIBRARY_URL',`http://127.0.0.1:${(server.address() as any).port}/`);
      expect(()=>readLibraryCatalogSync(root)).toThrow('THREE_ASSET_LIBRARY_NOT_PREPARED');await prepareAssetLibrary(root);expect(readLibraryCatalogSync(root)[0]?.id).toBe('remote.subject');
      expect((await readCatalogResource(root,entry)).toString()).toBe('{}');corrupt=true;await expect(readCatalogResource(root,entry)).rejects.toThrow('THREE_ASSET_HASH_MISMATCH');unavailable=true;
      await expect(readCatalogResource(root,entry)).rejects.toThrow('THREE_ASSET_LIBRARY_HTTP: 503');
    }finally{vi.unstubAllEnvs();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
  });
});

describe('committed player resource declarations', () => {
  it('stores portable POSIX source paths for Linux resource staging', async () => {
    for (const asset of catalog.assets) {
      for (const resource of catalogResources(asset)) {
        expect(resource.sourcePath, asset.id).toMatch(/^asset-library\//);
        expect(resource.sourcePath, asset.id).not.toContain('\\');
        expect(path.posix.normalize(resource.sourcePath), asset.id).toBe(resource.sourcePath);
      }
    }
    const archive=JSON.parse(await readFile(new URL('../../../../asset-library/migrations/legacy-source-records.json',import.meta.url),'utf8'));
    const provenance=JSON.parse(archive.records.find((r:any)=>r.original_path.endsWith('/humanoid/source-101/provenance.json')).content);
    for (const source of provenance.sources) expect(source.path).not.toContain('\\');
  });
  it.each([
    ['creature.horse', ['creatures/horse.glb']],
    ['vehicle.carriage', ['creatures/horse.glb']],
    ['creature.dragon-evolved', ['creatures/dragon.glb']],
  ] as const)('%s ships only the creature models its loader uses', (id, expected) => {
    const asset = catalog.assets.find(asset => asset.id === id)!;
    const models = asset.resources?.filter(resource => resource.path.endsWith('.glb')).map(resource => resource.path);
    expect(models).toEqual(expected);
  });

  it('every declared socket exists in the actual primary GLB', async () => {
    const missing: string[] = [];
    for (const asset of catalog.assets) {
      if (!('sockets' in asset) || !asset.sockets?.length) continue;
      const bytes = await readFile(new URL(`../../../../${asset.sourcePath}`, import.meta.url));
      const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as { nodes: { name?: string }[] };
      const names = new Set(document.nodes.map(node => node.name));
      for (const socket of asset.sockets) if (!names.has(socket.node)) missing.push(`${asset.id}:${socket.node}`);
    }
    expect(missing).toEqual([]);
  });
});
