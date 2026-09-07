import { describe, it, expect } from 'vitest';
import { catalogResources, publicCatalogValue, readCatalogResource } from './asset-resources.js';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
