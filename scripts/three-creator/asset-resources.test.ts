import { describe, it, expect } from 'vitest';
import { catalogResources, publicCatalogValue, readCatalogResource } from './asset-resources.js';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, realpath, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import catalog from '../../assets/three-creator/asset-catalog.json';

describe('catalog dependency closure', () => {
  const sha256 = 'a'.repeat(64);
  const resource = { uri: `./assets/resources/${sha256}.json`, sha256, byteLength: 10, sourcePath: 'private/path.json' };
  it('removes private source paths at every depth without removing provenance', () => {
    expect(publicCatalogValue({ ...resource, provenance: { author: 'Original author' }, resources: [resource] }))
      .toEqual({ uri: resource.uri, sha256, byteLength: 10, provenance: { author: 'Original author' }, resources: [{ uri: resource.uri, sha256, byteLength: 10 }] });
  });
  it('deduplicates shared dependencies and rejects unsealed output paths', () => {
    expect(catalogResources({ ...resource, resources: [resource] })).toHaveLength(1);
    for (const uri of ['./assets/../runtime/bridge.js', './assets/resources/arbitrary.json', `./assets/resources/${'b'.repeat(64)}.json`]) {
      expect(() => catalogResources({ ...resource, uri })).toThrow('THREE_ASSET_RESOURCE_INVALID');
    }
  });
  it('verifies dependency bytes, size and repository containment', async () => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'three-resources-')));
    try {
      await writeFile(path.join(root, 'clip.json'), '{}');
      const entry = { ...resource, sourcePath: 'clip.json', byteLength: 2, sha256: createHash('sha256').update('{}').digest('hex') };
      expect((await readCatalogResource(root, entry)).toString()).toBe('{}');
      await expect(readCatalogResource(root, { ...entry, byteLength: 3 })).rejects.toThrow('THREE_ASSET_HASH_MISMATCH');
      await expect(readCatalogResource(root, { ...entry, sourcePath: '../clip.json' })).rejects.toThrow('THREE_ASSET_SOURCE_ESCAPE');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('committed player resource declarations', () => {
  it('stores portable POSIX source paths for Linux resource staging', async () => {
    for (const asset of catalog.assets) {
      for (const resource of catalogResources(asset)) {
        expect(resource.sourcePath, asset.id).toMatch(/^assets\//);
        expect(resource.sourcePath, asset.id).not.toContain('\\');
        expect(path.posix.normalize(resource.sourcePath), asset.id).toBe(resource.sourcePath);
      }
    }
    const provenance = JSON.parse(await readFile(new URL('../../assets/three-creator/humanoid/source-101/provenance.json', import.meta.url), 'utf8'));
    for (const source of provenance.sources) expect(source.path).not.toContain('\\');
  });
  it.each([
    ['creature.horse', ['creatures/horse.glb']],
    ['vehicle.carriage', ['creatures/horse.glb']],
    ['creature.dragon', ['creatures/dragon.glb']],
  ] as const)('%s ships only the creature models its loader uses', (id, expected) => {
    const asset = catalog.assets.find(asset => asset.id === id)!;
    const models = asset.resources?.filter(resource => resource.path.endsWith('.glb')).map(resource => resource.path);
    expect(models).toEqual(expected);
  });

  it('every declared socket exists in the actual primary GLB', async () => {
    const missing: string[] = [];
    for (const asset of catalog.assets) {
      if (!('sockets' in asset) || !asset.sockets?.length) continue;
      const bytes = await readFile(new URL(`../../${asset.sourcePath}`, import.meta.url));
      const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as { nodes: { name?: string }[] };
      const names = new Set(document.nodes.map(node => node.name));
      for (const socket of asset.sockets) if (!names.has(socket.node)) missing.push(`${asset.id}:${socket.node}`);
    }
    expect(missing).toEqual([]);
  });
});
