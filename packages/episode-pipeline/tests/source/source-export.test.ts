import {writeFixtureAssetPolicy} from '../fixtures/asset-policy';
import {hashTree} from '@worldkit/creator-host/compiler';
import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { copyEpisodeSourceBundle, loadEpisodeSource, saveEpisodeSource } from '../../src/source/source.js';
import type { EpisodeSourceManifest } from '../../src/contracts.js';
import { workspaceRuntimeSourceHash } from '@worldkit/creator-host/workspace-runtime';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'episode-source-export-'))); roots.push(root);
  const input = path.join(root, 'input');
  const bodies = { 'source/main.ts': 'author', 'playable/index.html': 'playable',
    'captures/opening.png': 'opening', 'captures/triview.png': 'triview',
    'references/original.png': 'original', 'plans/world.png': 'plan', 'context/brief.txt': 'context' };
  for (const [name, body] of Object.entries(bodies)) {
    await mkdir(path.dirname(path.join(input, name)), { recursive: true }); await writeFile(path.join(input, name), body);
  }
  const image = (name: keyof typeof bodies) => ({ path: path.join(input, name), sha256: sha(bodies[name]) });
  const assetPolicySha256=await writeFixtureAssetPolicy(path.join(input,'playable'));
  const source: EpisodeSourceManifest = {
    assetPolicySha256,
    kind: 'three-episode-source', schemaVersion: 1, worldId: 'fixture', sourceHash: 'a'.repeat(64),
    worldBuildHash: 'b'.repeat(64), runtimeHash: 'c'.repeat(64), sourceWorldBuildHash: 'd'.repeat(64),
    sourceRuntimeHash: 'e'.repeat(64), sourceDeliveryManifestSha256: 'f'.repeat(64),
    sourceRoot: path.join(input, 'source'), playableRoot: path.join(input, 'playable'),
    sourceFiles: { 'main.ts': sha('author') }, playableFiles: await hashTree(path.join(input,'playable')),
    opening: image('captures/opening.png'), referenceImage: image('references/original.png'),
    worldPlan: image('plans/world.png'), contextPath: path.join(input, 'context/brief.txt'),
    targets: [{ id: 'actor', name: 'actor', role: 'primary-subject', whiteboxTriview: image('captures/triview.png') }],
  };
  const manifest = path.join(input, 'source.json'); await saveEpisodeSource(manifest, source);
  return { root, input, manifest, source };
}

it('rejects a declared context that is missing from the received bundle', async () => {
  const { manifest, source } = await fixture(); await rm(source.contextPath!);
  await expect(loadEpisodeSource(manifest)).rejects.toThrow();
});

it('exports every manifest dependency and loads after relocation without the original source', async () => {
  const { root, input, manifest, source } = await fixture();
  const output = path.join(root, 'copied'), relocated = path.join(root, 'received');
  await writeFile(path.join(input, 'human-reviews.json'), 'private review, not a source dependency');
  await copyEpisodeSourceBundle(manifest, output);
  await rename(output, relocated); await rm(input, { recursive: true });
  const received = await loadEpisodeSource(path.join(relocated, 'source.json'));
  expect(received.worldBuildHash).toBe(source.worldBuildHash);
  expect(received.runtimeHash).toBe(source.runtimeHash);
  expect(await readFile(received.referenceImage!.path, 'utf8')).toBe('original');
  expect(await readFile(received.worldPlan!.path, 'utf8')).toBe('plan');
  expect(await readFile(received.contextPath!, 'utf8')).toBe('context');
  await expect(readFile(path.join(relocated, 'human-reviews.json'))).rejects.toThrow();
  const header = JSON.parse(await readFile(path.join(relocated, 'source.json'), 'utf8'));
  expect(header.referenceImage.path).toBe('references/original.png');
  expect(header.worldPlan.path).toBe('plans/world.png');
  expect(header.contextPath).toBe('context/brief.txt');
});

it.each(['references/original.png', 'plans/world.png', 'context/brief.txt'])('rejects transport that drops %s', async missing => {
  const { root, manifest } = await fixture(); const output = path.join(root, 'received');
  await copyEpisodeSourceBundle(manifest, output); await rm(path.join(output, missing));
  await expect(loadEpisodeSource(path.join(output, 'source.json'))).rejects.toThrow();
});

it('rejects a symlink context, corrupted references and output overlap before copying', async () => {
  const { root, input, manifest, source } = await fixture();
  await rm(source.contextPath!); await symlink(source.referenceImage!.path, source.contextPath!);
  await expect(copyEpisodeSourceBundle(manifest, path.join(root, 'symlink-output'))).rejects.toThrow('EPISODE_SOURCE_FILE_CHANGED');
  await rm(source.contextPath!); await writeFile(source.contextPath!, 'context');
  await writeFile(source.referenceImage!.path, 'corrupted');
  await expect(copyEpisodeSourceBundle(manifest, path.join(root, 'corrupt-output'))).rejects.toThrow('EPISODE_SOURCE_FILE_CHANGED');
  await writeFile(source.referenceImage!.path, 'original');
  await expect(copyEpisodeSourceBundle(manifest, path.join(input, 'nested-output'))).rejects.toThrow('EPISODE_SOURCE_OUTPUT_OVERLAP');
  await expect(copyEpisodeSourceBundle(manifest, input)).rejects.toThrow('EPISODE_SOURCE_OUTPUT_OVERLAP');
});

it('does not replace existing output contents', async () => {
  const { root, manifest } = await fixture(); const output = path.join(root, 'existing'); await mkdir(output);
  await writeFile(path.join(output, 'keep.txt'), 'keep');
  await expect(copyEpisodeSourceBundle(manifest, output)).rejects.toThrow('EPISODE_SOURCE_OUTPUT_NOT_EMPTY');
  expect(await readFile(path.join(output, 'keep.txt'), 'utf8')).toBe('keep');
});

it('transports authored SDK source byte-for-byte and verifies its separate identity', async () => {
  const { root, manifest, source } = await fixture();
  const files = { 'runtime.json': Buffer.from('{"schemaVersion":1}'), 'three-world/src/index.ts': Buffer.from('export const customSlideDistance = 3;') };
  for (const [name, bytes] of Object.entries(files)) {
    const file = path.join(source.sourceRoot, 'sdk', name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes);
    source.sourceFiles[`sdk/${name}`] = createHash('sha256').update(bytes).digest('hex');
  }
  source.runtimeSourceHash = workspaceRuntimeSourceHash(files);
  await saveEpisodeSource(manifest, source);
  const copied = await copyEpisodeSourceBundle(manifest, path.join(root, 'sdk-copy'));
  expect(copied.runtimeSourceHash).toBe(source.runtimeSourceHash);
  expect(await readFile(path.join(copied.sourceRoot, 'sdk/three-world/src/index.ts'))).toEqual(files['three-world/src/index.ts']);
  source.runtimeSourceHash = 'a'.repeat(64); await saveEpisodeSource(manifest, source);
  await expect(loadEpisodeSource(manifest)).rejects.toThrow('RUNTIME_SOURCE_CHANGED');
});
