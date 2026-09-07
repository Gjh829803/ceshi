import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { copyEpisodeSourceBundle, loadEpisodeSource, saveEpisodeSource } from './source.js';
import type { EpisodeSourceManifest } from './contracts.js';

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
  const source: EpisodeSourceManifest = {
    kind: 'three-episode-source', schemaVersion: 1, worldId: 'fixture', sourceHash: 'a'.repeat(64),
    worldBuildHash: 'b'.repeat(64), runtimeHash: 'c'.repeat(64), sourceWorldBuildHash: 'd'.repeat(64),
    sourceRuntimeHash: 'e'.repeat(64), sourceDeliveryManifestSha256: 'f'.repeat(64),
    sourceRoot: path.join(input, 'source'), playableRoot: path.join(input, 'playable'),
    sourceFiles: { 'main.ts': sha('author') }, playableFiles: { 'index.html': sha('playable') },
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
