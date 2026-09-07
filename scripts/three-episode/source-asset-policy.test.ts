import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ThreeCompiler, hashTree } from '../three-creator/compiler.js';
import { canonicalHash, type EpisodeSourceManifest } from './contracts.js';
import { copyEpisodeSourceBundle, loadEpisodeSource, prepareEpisodeSource, saveEpisodeSource } from './source.js';

vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>() }));
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const model = 'synthetic allowed humanoid model', denied = 'synthetic forbidden model';
const asset = { id: 'humanoid.allowed', displayName: 'Allowed fixture humanoid',
  uri: `./assets/subjects/${sha(model)}.glb`, sha256: sha(model), byteLength: Buffer.byteLength(model),
  recommendedBody: { heightMeters: 1.8, radiusMeters: 0.3 },
  locomotionBindingIds: ['ground.standard'],
  actions: Object.fromEntries(['idle', 'walk', 'run', 'jump', 'fall'].map(name => [name, { clipName: name }])) };
const snapshot = { kind: 'three-creator-asset-policy-snapshot', schemaVersion: 1,
  policy: { schemaVersion: 1, allowedAssetIds: [asset.id], defaultHumanoidAssetId: asset.id, allowCustomAssets: true },
  allowedAssets: [asset], deniedResourceSha256: [sha(denied)] };
const policyHash = canonicalHash(snapshot);
async function put(root: string, name: string, value: string | object) {
  const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
}
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'episode-policy-'))); roots.push(root);
  const input = path.join(root, 'input');
  for (const [name, value] of Object.entries({
    'source/main.js': 'author source', 'source/project.json': { schemaVersion: 1, assetIds: [asset.id] },
    'playable/index.html': '<html><head></head><body></body></html>',
    'playable/asset-policy.json': snapshot, 'playable/asset-definitions.json': { schemaVersion: 1, assets: [asset] },
    [`playable/${asset.uri.slice(2)}`]: model, 'playable/runtime/worldkit-three.js': 'old runtime',
    'captures/opening.png': 'fixture image',
    'captures/captures.json': { images: [{ view: 'opening', image: { path: 'opening.png', sha256: sha('fixture image') } },
      { view: 'entity-triview', entityIds: ['player'], image: { path: 'opening.png', sha256: sha('fixture image') } }] },
  })) await put(input, name, value);
  const source: EpisodeSourceManifest = {
    kind: 'three-episode-source', schemaVersion: 1, worldId: 'policy-fixture', sourceHash: 'a'.repeat(64),
    worldBuildHash: 'b'.repeat(64), runtimeHash: 'c'.repeat(64), sourceWorldBuildHash: 'd'.repeat(64),
    sourceRuntimeHash: 'e'.repeat(64), sourceDeliveryManifestSha256: 'f'.repeat(64), assetPolicySha256: policyHash,
    sourceRoot: path.join(input, 'source'), playableRoot: path.join(input, 'playable'),
    sourceFiles: await hashTree(path.join(input, 'source')), playableFiles: await hashTree(path.join(input, 'playable')),
    opening: { path: path.join(input, 'captures/opening.png'), sha256: sha('fixture image') },
    targets: [{ id: 'player', name: 'player', role: 'primary-subject',
      whiteboxTriview: { path: path.join(input, 'captures/opening.png'), sha256: sha('fixture image') } }],
  };
  const manifest = path.join(input, 'source.json');
  const save = async () => { source.sourceFiles = await hashTree(source.sourceRoot); source.playableFiles = await hashTree(source.playableRoot); await saveEpisodeSource(manifest, source); };
  const delivery = async () => {
    await put(input, 'delivery.json', { kind: 'three-creator-delivery', schemaVersion: 2, profile: 'three-sdk',
      status: 'ready', technicalStatus: 'passed', sourceHash: source.sourceHash, runtimeHash: source.runtimeHash,
      worldBuildHash: source.worldBuildHash, ...(source.assetPolicySha256 === undefined ? {} : { assetPolicySha256: source.assetPolicySha256 }),
      files: Object.fromEntries(Object.entries(await hashTree(input)).filter(([name]) => /^(source|playable|captures)\//.test(name))) });
  };
  await save();
  return { root, input, manifest, source, save, delivery };
}
// Runtime bundling is independently tested; the adapter must preserve policy while replacing its files.
function lightweightRuntime() {
  vi.spyOn(ThreeCompiler.prototype, 'prepareRuntime').mockImplementation(async function (this: ThreeCompiler) {
    const root = path.join(this.workspace, 'runtime'); await put(root, 'worldkit-three.js', 'new runtime');
    return { root, hash: canonicalHash(await hashTree(root)), hit: false, cacheIdentity: 'fixture' };
  });
}

it('preserves the pinned policy through runtime derivation, export and relocation', async () => {
  const f = await fixture(); await f.delivery(); lightweightRuntime();
  const output = path.join(f.root, 'derived');
  const derived = await prepareEpisodeSource({ payloadRoot: f.input, outputRoot: output, worldId: 'derived' });
  expect(derived).toHaveProperty('assetPolicySha256', policyHash);
  expect(derived.runtimeHash).not.toBe(f.source.runtimeHash);
  const transported = path.join(f.root, 'transported'); await copyEpisodeSourceBundle(path.join(output, 'source.json'), transported);
  const received = path.join(f.root, 'received'); await rename(transported, received);
  await rm(f.input, { recursive: true }); await rm(output, { recursive: true });
  const loaded = await loadEpisodeSource(path.join(received, 'source.json'));
  expect(loaded).toHaveProperty('assetPolicySha256', policyHash);
  expect(JSON.parse(await readFile(path.join(loaded.playableRoot, 'asset-policy.json'), 'utf8'))).toEqual(snapshot);
});

it.each(['hash', 'snapshot', 'inventory'])('rejects delivery with missing policy %s before copying', async missing => {
  const f = await fixture();
  if (missing === 'hash') delete f.source.assetPolicySha256;
  if (missing === 'snapshot') await rm(path.join(f.source.playableRoot, 'asset-policy.json'));
  await f.delivery();
  if (missing === 'inventory') {
    const header = JSON.parse(await readFile(path.join(f.input, 'delivery.json'), 'utf8'));
    delete header.files['playable/asset-policy.json']; await put(f.input, 'delivery.json', header);
  }
  lightweightRuntime();
  await expect(prepareEpisodeSource({ payloadRoot: f.input, outputRoot: path.join(f.root, 'derived'), worldId: 'bad' })).rejects.toThrow(/ASSET_POLICY/);
  await expect(readFile(path.join(f.root, 'derived/source/main.js'))).rejects.toThrow();
});

it.each(['source', 'playable'])('rejects renamed forbidden bytes in %s even with rewritten delivery file hashes', async tree => {
  const f = await fixture(); await put(f.input, `${tree}/renamed-character.glb`, denied); await f.delivery(); lightweightRuntime();
  await expect(prepareEpisodeSource({ payloadRoot: f.input, outputRoot: path.join(f.root, 'derived'), worldId: 'bad' })).rejects.toThrow(/ASSET_POLICY/);
});

it('rejects a rewritten snapshot at import even when its delivery file hash is updated', async () => {
  const f = await fixture();
  await put(f.input, 'playable/asset-policy.json', { ...snapshot, deniedResourceSha256: [] });
  await f.delivery(); lightweightRuntime();
  await expect(prepareEpisodeSource({ payloadRoot: f.input, outputRoot: path.join(f.root, 'derived'), worldId: 'bad' })).rejects.toThrow('ASSET_POLICY_HASH_MISMATCH');
});

it('rejects an undeclared source resource instead of losing it during import', async () => {
  const f = await fixture(); await f.delivery();
  await put(f.input, 'source/omitted.glb', denied); lightweightRuntime();
  await expect(prepareEpisodeSource({ payloadRoot: f.input, outputRoot: path.join(f.root, 'derived'), worldId: 'bad' })).rejects.toThrow('ASSET_POLICY_INVENTORY_CHANGED');
});

it.each(['snapshot', 'renamed-source', 'renamed-playable', 'definitions', 'model'])('rechecks transported %s despite rewritten file inventory hashes', async mutation => {
  const f = await fixture();
  if (mutation === 'snapshot') await put(f.input, 'playable/asset-policy.json', { ...snapshot, policy: { ...snapshot.policy, allowCustomAssets: false } });
  if (mutation === 'renamed-source') await put(f.input, 'source/renamed.glb', denied);
  if (mutation === 'renamed-playable') await put(f.input, 'playable/renamed.glb', denied);
  if (mutation === 'definitions') await put(f.input, 'playable/asset-definitions.json', { schemaVersion: 1, assets: [{ ...asset, id: 'humanoid.forbidden' }] });
  if (mutation === 'model') await put(f.input, `playable/${asset.uri.slice(2)}`, 'corrupted model');
  await f.save();
  await expect(loadEpisodeSource(f.manifest)).rejects.toThrow(/ASSET_POLICY/);
});

it.each(['hash', 'snapshot'])('rejects transport missing policy %s after hashes are rewritten', async missing => {
  const f = await fixture();
  if (missing === 'hash') delete f.source.assetPolicySha256;
  else await rm(path.join(f.source.playableRoot, 'asset-policy.json'));
  await f.save(); await expect(loadEpisodeSource(f.manifest)).rejects.toThrow(/ASSET_POLICY/);
});

it('requires delivered asset definitions for a policy-aware source', async () => {
  const f = await fixture(); await rm(path.join(f.source.playableRoot, 'asset-definitions.json'));
  await f.save(); await expect(loadEpisodeSource(f.manifest)).rejects.toThrow('ASSET_POLICY_DEFINITIONS_MISSING');
});

it('rejects an unlisted resource added to the received source tree', async () => {
  const f = await fixture(); await put(f.input, 'source/unlisted.glb', denied);
  await expect(loadEpisodeSource(f.manifest)).rejects.toThrow('ASSET_POLICY_INVENTORY_CHANGED');
});

it('keeps historical policy-less deliveries compatible without applying current Host policy', async () => {
  const f = await fixture(); delete f.source.assetPolicySha256;
  await rm(path.join(f.source.playableRoot, 'asset-policy.json'));
  await put(f.input, 'source/historical-character.glb', denied);
  await f.delivery(); lightweightRuntime();
  const output = path.join(f.root, 'legacy');
  const source = await prepareEpisodeSource({ payloadRoot: f.input, outputRoot: output, worldId: 'legacy' });
  expect(source).not.toHaveProperty('assetPolicySha256');
  await expect(loadEpisodeSource(path.join(output, 'source.json'))).resolves.toMatchObject({ worldId: 'legacy' });
});

it.each([true, false])('derives policy-aware=%s inputs while current Host policy and catalog are unavailable', async policyAware => {
  const f = await fixture();
  if (!policyAware) { delete f.source.assetPolicySha256; await rm(path.join(f.source.playableRoot, 'asset-policy.json')); }
  await f.delivery(); lightweightRuntime();
  const read = fs.readFileSync;
  vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => {
    if (/three-creator\/asset-(policy|catalog)\.json$/.test(String(file))) throw new Error('CURRENT_HOST_ASSET_CONFIG_UNAVAILABLE');
    return read(file, options as any);
  });
  await expect(prepareEpisodeSource({ payloadRoot: f.input, outputRoot: path.join(f.root, 'derived'), worldId: 'no-host-config' }))
    .resolves.toMatchObject({ worldId: 'no-host-config' });
});
