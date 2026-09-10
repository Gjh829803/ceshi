import {describe,it,expect} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Ajv from 'ajv';
import {openEpisodeBrowser} from '../three-episode/browser';
import {readExampleFiles} from './example-files.js';
import {ThreeCreatorTools} from './tools.js';
import {executeThreeCreatorTool} from './mcp.js';
import {EPISODE_SCHEMA} from './contracts.js';
import {createAssetPolicySnapshot, assetPolicyHash} from './asset-policy.mjs';
import catalog from '../../assets/three-creator/asset-catalog.json';
describe('modular player example discovery',()=>{
 const root=path.resolve('shared/preset-content');
 it('lists nested dependencies instead of pretending four files are complete',async()=>{
  const result=await readExampleFiles(root,'preset-assets');expect(result.fileManifest.some(f=>f.path==='environment/maps.ts')).toBe(true);
  expect(result.fileManifest.some(f=>f.path==='ui/workspace.ts')).toBe(false);
  expect(Object.keys(result.files)).toEqual(['config.ts','models.ts','assets/resources.ts','creatures/specs.ts','creatures/manifest.ts']);
 });
 it('reads topic modules and rejects arbitrary paths',async()=>{
  const presentation=await readExampleFiles(root,'extensions',['presentation.json']);
  expect(JSON.parse(presentation.files['presentation.json']!)).toEqual({shadows:{}});
  expect((await readExampleFiles(root,'environment-maps')).files['environment/maps.ts']).toContain('campus');
  await expect(readExampleFiles(root,'extensions',['../../package.json'])).rejects.toThrow('THREE_EXAMPLE_FILE_UNKNOWN');
 });
});

it('serves scene HUD code through the presentation-ui MCP topic',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'presentation-ui-example-'));
 const service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const result=await executeThreeCreatorTool(service,'creator_get_examples',{topic:'presentation-ui'}) as {files:Record<string,string>};
  expect(result.files['main.ts']).toContain('world.createPresentation()');
  expect(result.files['main.ts']).toContain('presentation.ui.mount(hud)');
  expect(JSON.parse(result.files['project.json']!).assetIds).toEqual(['humanoid.source-101']);
  for(const [name,source] of Object.entries(result.files))await writeFile(path.join(root,name),source);
  expect((await service.compiler.prepare()).project.assetIds).toEqual(['humanoid.source-101']);
  await expect(executeThreeCreatorTool(service,'creator_get_examples',{topic:'playground-ui'})).rejects.toThrow();
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
});

describe('vehicle-camera example discovery', () => {
 it('serves a complete compilable example when only the preset human is allowed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vehicle-camera-example-'));
  const snapshot = createAssetPolicySnapshot({schemaVersion: 1,
   allowedAssetIds: ['humanoid.source-101'],
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
   expect(JSON.parse(result.files['project.json']!).assetIds).toEqual(['humanoid.source-101']);
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
   expect(candidate.project.assetIds).toEqual(['humanoid.source-101']);
   expect(await readFile(path.join(candidate.sourceRoot, 'whitebox-materials.ts'), 'utf8')).toBe(result.files['whitebox-materials.ts']);
   const assets = JSON.parse(await readFile(path.join(candidate.playableRoot, 'asset-definitions.json'), 'utf8'));
   expect(assets.assets.map((asset: {id: string}) => asset.id).sort()).toEqual(['humanoid.source-101']);
  } finally { await service.close(); await rm(root, {recursive: true, force: true}); }
 }, 30000);
});

 it('discovers model-free road configurations and compiles the self-drawn motorcycle example',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'vehicle-drift-discovery-'));
  const service=new ThreeCreatorTools(root,'three-sdk');
  try{
   const schema=await executeThreeCreatorTool(service,'creator_get_authoring_schema',{topic:'humanoid',sections:['guide','humanoid']}) as unknown as {sdkGuide:string;humanoidSourceContracts:Record<string,string>};
   expect(schema.sdkGuide).toContain('createRoadVehicleSpec');
   expect(schema.sdkGuide).toContain("topic:'custom-vehicle'");
   expect(schema.sdkGuide).toContain('brakeDeceleration');
   expect(schema.humanoidSourceContracts['humanoid-runtime/config.ts']).toContain('brakeDrift?: boolean');
   const example=await executeThreeCreatorTool(service,'creator_get_examples',{topic:'custom-vehicle'}) as {files:Record<string,string>};
   expect(example.files['main.ts']).toContain("createRoadVehicleSpec('motorcycle')");
   expect(example.files['main.ts']).toContain('sample.vehicles[0]');
   expect(example.files['main.ts']).not.toContain('brakeDrift:true');
   for(const [name,source]of Object.entries(example.files))await writeFile(path.join(root,name),source);
   const candidate=await service.compiler.prepare();
   expect(candidate.worldBuildHash).toBeTruthy();
  }finally{await service.close();await rm(root,{recursive:true,force:true});}
 });


it.each([['custom-vehicle','custom-bike'],['vehicle-camera','rover']] as const)('records the self-drawn %s through the independent Episode clock and wheel display',async(topic,instanceId)=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'road-episode-')),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const example=await service.examples(topic);
  for(const [file,source] of Object.entries(example.files))await writeFile(path.join(root,file),source);
  const candidate=await service.compiler.prepare();
  const episode=await openEpisodeBrowser({playableRoot:candidate.playableRoot});
  try{
   const start={positionWorldMetersXYZ:[0,.03,0] as const,facingYawRadians:Math.PI,
    humanoid:{vehicleInstanceId:instanceId,mounted:true,cameraMode:0 as const}};
   const before=await episode.prepareSegment(start,{widthPixels:640,heightPixels:360});
   const after=await episode.advance({humanoid:{forward:1,steer:.1,roll:0,lift:0,pitch:0,strafe:0,boost:false,brake:false,slow:false,jump:false}},180);
   expect(after.humanoid!.mountedInstanceId).toBe(instanceId);
   expect(after.simulationTick-before.simulationTick).toBe(180);
   const vehicle=after.entities.find(v=>v.id===instanceId)!;
   expect(Math.hypot(vehicle.positionWorldMetersXYZ[0],vehicle.positionWorldMetersXYZ[2])).toBeGreaterThan(2);
   const first=await episode.frame('image/png'),second=await episode.frame('image/png');
   expect(second).toEqual(first);
   const angle=await episode.page.evaluate(id=>window.__WORLDKIT_EVAL__!.targets[id]!.getObjectByName('wheel.0.spin')!.rotation.x,instanceId);
   expect(Math.abs(angle)).toBeGreaterThan(.1);
   await episode.release();
   const reset=await episode.prepareSegment(start,{widthPixels:640,heightPixels:360});
   expect(reset.entities.find(v=>v.id===instanceId)!.positionWorldMetersXYZ).toEqual(before.entities.find(v=>v.id===instanceId)!.positionWorldMetersXYZ);
   expect(episode.errors).toEqual([]);
  }finally{await episode.close();}
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},30000);
