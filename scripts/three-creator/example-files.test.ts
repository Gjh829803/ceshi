import {describe,it,expect} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Ajv from 'ajv';
import {readExampleFiles} from './example-files.js';
import {ThreeCreatorTools} from './tools.js';
import {executeThreeCreatorTool} from './mcp.js';
import {EPISODE_SCHEMA} from './contracts.js';
import {createAssetPolicySnapshot, assetPolicyHash} from './asset-policy.mjs';
import catalog from '../../assets/three-creator/asset-catalog.json';
describe('modular training example discovery',()=>{
 const root=path.resolve('examples/three-creator/sdk-capabilities');
 it('lists nested dependencies instead of pretending four files are complete',async()=>{
  const result=await readExampleFiles(root,'extensions');expect(result.fileManifest.some(f=>f.path==='environment/maps.ts')).toBe(true);
  expect(result.fileManifest.some(f=>f.path==='ui/phosphor/Phosphor.woff2'&&!f.readable)).toBe(true);
  expect(Object.keys(result.files)).toEqual(['index.html','main.ts','project.json','episode.json']);
 });
 it('reads topic modules and rejects arbitrary paths',async()=>{
  const presentation=await readExampleFiles(root,'extensions',['presentation.json']);
  expect(JSON.parse(presentation.files['presentation.json']!)).toEqual({shadows:{}});
  expect((await readExampleFiles(root,'training-maps')).files['environment/maps.ts']).toContain('campus');
  await expect(readExampleFiles(root,'extensions',['../../package.json'])).rejects.toThrow('THREE_EXAMPLE_FILE_UNKNOWN');
 });
});

describe('vehicle-camera example discovery', () => {
 it('serves a complete compilable example when only its two preset assets are allowed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vehicle-camera-example-'));
  const snapshot = createAssetPolicySnapshot({schemaVersion: 1,
   allowedAssetIds: ['humanoid.source-101', 'training.rover'],
   defaultHumanoidAssetId: 'humanoid.source-101', allowCustomAssets: false}, catalog.assets);
  const policyFile = path.join(root, '.policy.json');
  await writeFile(policyFile, JSON.stringify(snapshot));
  const workspace = path.join(root, 'author'); await mkdir(workspace);
  const service = new ThreeCreatorTools(workspace, 'three-sdk', {
   assetPolicySnapshotPath: policyFile, assetPolicySha256: assetPolicyHash(snapshot),
  });
  try {
   const result = await executeThreeCreatorTool(service, 'creator_get_examples', {topic: 'vehicle-camera'}) as {
    topic: string; files: Record<string, string>; fileManifest: {path: string; sha256: string; byteLength: number}[];
   };
   expect(result.topic).toBe('vehicle-camera');
   expect(Object.keys(result.files).sort()).toEqual(['episode.json', 'index.html', 'main.ts', 'project.json', 'whitebox-materials.ts']);
   expect(JSON.parse(result.files['project.json']!).assetIds).toEqual(['humanoid.source-101', 'training.rover']);
   const selected = await service.examples('vehicle-camera', ['whitebox-materials.ts', 'README.md']) as {files: Record<string, string>};
   expect(selected.files['whitebox-materials.ts']).toBe(result.files['whitebox-materials.ts']);
   expect(result.fileManifest.find(file => file.path === 'whitebox-materials.ts')).toMatchObject({
    byteLength: Buffer.byteLength(result.files['whitebox-materials.ts']!), sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
   });
   const checkEpisode = new Ajv({strict: false}).compile(EPISODE_SCHEMA);
   expect(checkEpisode(JSON.parse(result.files['episode.json']!)), JSON.stringify(checkEpisode.errors)).toBe(true);
   for (const [name, content] of Object.entries(result.files)) await writeFile(path.join(workspace, name), content);
   const candidate = await service.compiler.prepare();
   expect(candidate.profile).toBe('three-sdk');
   expect(candidate.project.assetIds).toEqual(['humanoid.source-101', 'training.rover']);
   expect(await readFile(path.join(candidate.sourceRoot, 'whitebox-materials.ts'), 'utf8')).toBe(result.files['whitebox-materials.ts']);
   const assets = JSON.parse(await readFile(path.join(candidate.playableRoot, 'asset-definitions.json'), 'utf8'));
   expect(assets.assets.map((asset: {id: string}) => asset.id).sort()).toEqual(['humanoid.source-101', 'training.rover']);
  } finally { await service.close(); await rm(root, {recursive: true, force: true}); }
 }, 30000);
});
