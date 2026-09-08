import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import catalog from '../../assets/three-creator/asset-catalog.json';
import { trainingImportDetails } from './training-import-catalog';

it.each([
  ['horse', ['creatures/horse.glb']],
  ['carriage', ['creatures/horse.glb']],
  ['dragon', ['creatures/dragon.glb']],
  ['rover', []],
] as const)('imports only the model dependencies required by %s', (id, expected) => {
  const details = trainingImportDetails({ id, seat: [0, 1, 0] });
  expect(details.dependencyPaths.filter(file => file.endsWith('.glb'))).toEqual(expected);
  if (expected.length) expect(details.dependencyPaths).toEqual(expect.arrayContaining([
    'creatures/manifest.json', 'creatures/LICENSE-ANIMALS.txt', 'creatures/LICENSE-MONSTERS.txt',
  ]));
});

it.each(['horse', 'dragon', 'carriage', 'rover'])('regenerated %s sockets match its actual imported or exported GLB', async id => {
  const asset = catalog.assets.find(asset => asset.id === `training.${id}`)!;
  const details = trainingImportDetails({ id, seat: [0, 1, 0] });
  const bytes = await readFile(new URL(`../../${asset.sourcePath}`, import.meta.url));
  const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as { nodes: { name?: string }[] };
  for (const socket of details.sockets) expect(document.nodes.some(node => node.name === socket.node)).toBe(true);
  expect(details.sockets).toHaveLength(id === 'horse' || id === 'dragon' ? 0 : 1);
});

it('keeps curated horse guidance through repeated imports without retaining stale resource declarations', () => {
  const previous = catalog.assets.find(asset => asset.id === 'training.horse')!;
  const details = trainingImportDetails({ id: 'horse', seat: [0, 1.65, 0] }, previous);
  expect(details.limitations).toEqual(previous.limitations);
  expect(details.integrationMetadata).toEqual(previous.integrationMetadata);
  expect(details.integrationMetadata?.requiredAssetIds).toEqual(['humanoid.source-101', 'training.horse']);
  expect(details).not.toHaveProperty('resources');
  expect(details).not.toHaveProperty('sha256');
  const repeated = trainingImportDetails({ id: 'horse', seat: [0, 1.65, 0] }, details);
  expect(repeated).toEqual(details);
  expect(details.integrationMetadata).not.toBe(previous.integrationMetadata);
});
