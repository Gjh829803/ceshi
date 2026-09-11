import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import catalog from '../../../../assets/three-creator/asset-catalog.json';
import { presetImportDetails, presetImportIdentity } from '../../src/assets/preset-import-catalog';
import { SPECS } from '@worldkit/preset-content/config';
import { assetIdForPreset } from '@worldkit/preset-content/platform/catalog';

it.each([
  ['horse', ['creatures/horse.glb']],
  ['carriage', ['creatures/horse.glb']],
  ['dragon', ['creatures/dragon.glb']],
  ['rover', []],
] as const)('imports only the model dependencies required by %s', (id, expected) => {
  const details = presetImportDetails({ id, seat: [0, 1, 0] });
  expect(details.dependencyPaths.filter(file => file.endsWith('.glb'))).toEqual(expected);
  if (expected.length) expect(details.dependencyPaths).toEqual(expect.arrayContaining([
    'creatures/manifest.json', 'creatures/LICENSE-ANIMALS.txt', 'creatures/LICENSE-MONSTERS.txt',
  ]));
});

it.each(['horse', 'dragon', 'carriage', 'rover'])('regenerated %s sockets match its actual imported or exported GLB', async id => {
  const asset = catalog.assets.find(asset => asset.id === presetImportIdentity(id).assetId)!;
  const details = presetImportDetails({ id, seat: [0, 1, 0] });
  const bytes = await readFile(new URL(`../../../../${asset.sourcePath}`, import.meta.url));
  const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as { nodes: { name?: string }[] };
  for (const socket of details.sockets) expect(document.nodes.some(node => node.name === socket.node)).toBe(true);
  expect(details.sockets).toHaveLength(id === 'horse' || id === 'dragon' ? 0 : 1);
});

it('keeps curated horse guidance through repeated imports without retaining stale resource declarations', () => {
  const previous = catalog.assets.find(asset => asset.id === 'creature.horse')!;
  const details = presetImportDetails({ id: 'horse', seat: [0, 1.65, 0] }, previous);
  expect(details.limitations).toEqual(previous.limitations);
  expect(details.integrationMetadata).toEqual(previous.integrationMetadata);
  expect(details.integrationMetadata?.requiredAssetIds).toEqual(['humanoid.uefn-mannequin', 'creature.horse']);
  expect(details).not.toHaveProperty('resources');
  expect(details).not.toHaveProperty('sha256');
  const repeated = presetImportDetails({ id: 'horse', seat: [0, 1.65, 0] }, details);
  expect(repeated).toEqual(details);
  expect(details.integrationMetadata).not.toBe(previous.integrationMetadata);
});

it.each([
  ['bike', 'vehicle.motorcycle', 'motorcycle'],
  ['slide', 'vehicle.skateboard', 'skateboard'],
  ['sub', 'vehicle.submarine', 'submarine'],
  ['space', 'vehicle.spacecraft', 'spacecraft'],
  ['dragon', 'creature.dragon-evolved', 'dragon-evolved'],
] as const)('maps pinned donor %s before publishing its catalog identity', (sourceId, assetId, specId) => {
  expect(presetImportIdentity(sourceId)).toEqual({assetId, specId});
});

it('preserves curated discovery terms independently through repeated imports', () => {
  const previous={recommendedFor:['flying mount'],limitations:[]};
  const first=presetImportDetails({id:'dragon',seat:[0,1,0]},previous);
  expect(first.recommendedFor).toEqual(previous.recommendedFor);
  expect(first.recommendedFor).not.toBe(previous.recommendedFor);
  expect(presetImportDetails({id:'dragon',seat:[0,1,0]},first)).toEqual(first);
});

it('resolves maintained Playground presets and selected flying variants to their real catalog identities', () => {
  for (const id of ['motorcycle','touring-motorcycle','skateboard','hovercraft','rescue-hovercraft','submarine','observation-submarine','spacecraft','survey-spacecraft']) {
    const spec=SPECS.find(row=>row.id===id)!;
    expect(spec, id).toBeDefined();
    const asset=catalog.assets.find(row=>row.id===assetIdForPreset(spec));
    expect(asset?.vehicle?.spec.id).toBe(id);
  }
  expect(assetIdForPreset(SPECS.find(spec=>spec.id==='dragon')!)).toBe('creature.dragon-evolved');
  expect(assetIdForPreset({id:'dragon',mode:'dragon'},'D02')).toBe('creature.dragon.d02');
});
