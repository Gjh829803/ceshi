import {describe,it,expect} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile as writeFixtureFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const writeFile:typeof writeFixtureFile=async(file,data,options)=>{await mkdir(path.dirname(String(file)),{recursive:true});return writeFixtureFile(file,data,options);};
import Ajv from 'ajv';
import {openEpisodeBrowser} from '@worldkit/episode-pipeline/browser';
import {readExampleFiles} from '../../src/discovery/example-files.js';
import {ThreeCreatorTools} from '../../src/tools/tools.js';
import {executeThreeCreatorTool} from '../../src/cli/mcp.js';
import {EPISODE_SCHEMA} from '../../src/contracts.js';
import {createAssetPolicySnapshot, assetPolicyHash} from '../../src/assets/asset-policy.mjs';
import contentCatalog from '../../../../asset-library/dist/whitebox/asset-catalog.json';
import {composeAssetCatalog} from '@worldkit/preset-content/assets/host-adapter';
const catalog={...contentCatalog,assets:composeAssetCatalog(contentCatalog.assets)};
describe('example source selection',()=>{
 const root=path.resolve('examples/three-creator/vehicle-camera');
 it('lists dependencies and reads selected files without allowing arbitrary paths',async()=>{
  const result=await readExampleFiles(root,'vehicle-camera');
  expect(result.fileManifest.some(f=>f.path==='config/camera.json')).toBe(true);
  const selected=await readExampleFiles(root,'vehicle-camera',['config/camera.json']);
  expect(selected.files['config/camera.json']).toContain('world-camera');
  await expect(readExampleFiles(root,'vehicle-camera',['../../package.json'])).rejects.toThrow('THREE_EXAMPLE_FILE_UNKNOWN');
 });
});

it('compiles scene HUD in the internal custom vehicle fixture',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'presentation-ui-example-'));
 const service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const result=await service.examples('custom-vehicle') as {files:Record<string,string>};
  expect(result.files['main.ts']).toContain('world.createPresentation()');
  expect(result.files['main.ts']).toContain('presentation.ui.mount(hud)');
  expect(JSON.parse(result.files['project.json']!).assetIds).toEqual(['humanoid.uefn-mannequin']);
  for(const [name,source] of Object.entries(result.files))await writeFile(path.join(root,name),source);
  expect((await service.compiler.prepare()).project.assetIds).toEqual(['humanoid.uefn-mannequin']);
  await expect(executeThreeCreatorTool(service,'creator_get_examples',{topic:'playground-ui'})).rejects.toThrow();
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
});

describe('vehicle-camera example discovery', () => {
 it('serves a complete compilable example when only the preset human is allowed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vehicle-camera-example-'));
  const snapshot = createAssetPolicySnapshot({schemaVersion: 1,
   allowedAssetIds: ['humanoid.uefn-mannequin'],
   defaultHumanoidAssetId: 'humanoid.uefn-mannequin', allowCustomAssets: false}, catalog.assets);
  const policyFile = path.join(root, '.policy.json');
  await writeFile(policyFile, JSON.stringify(snapshot));
  const workspace = path.join(root, 'author'); await mkdir(workspace);
  const service = new ThreeCreatorTools(workspace, 'three-sdk', {
   assetPolicySnapshotPath: policyFile, assetPolicySha256: assetPolicyHash(snapshot),
  });
  try {
   const result = await service.examples('custom-vehicle',undefined,'car') as {
    topic: string; files: Record<string, string>; fileManifest: {path: string; sha256: string; byteLength: number}[];
   };
   expect(result.topic).toBe('custom-vehicle');
   expect(Object.keys(result.files).sort()).toEqual(['config/camera.json', 'episode.json', 'index.html', 'main.ts', 'project.json', 'whitebox-materials.ts']);
   expect(JSON.parse(result.files['project.json']!).assetIds).toEqual(['humanoid.uefn-mannequin']);
   const selected = await service.examples('custom-vehicle', ['whitebox-materials.ts', 'README.md'],'car') as {files: Record<string, string>};
   expect(selected.files['whitebox-materials.ts']).toBe(result.files['whitebox-materials.ts']);
   expect(result.fileManifest.find(file => file.path === 'whitebox-materials.ts')).toMatchObject({
    byteLength: Buffer.byteLength(result.files['whitebox-materials.ts']!), sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
   });
   const checkEpisode = new Ajv({strict: false}).compile(EPISODE_SCHEMA);
   expect(checkEpisode(JSON.parse(result.files['episode.json']!)), JSON.stringify(checkEpisode.errors)).toBe(true);
   for (const [name, content] of Object.entries(result.files)) await writeFile(path.join(workspace, name), content);
   const candidate = await service.compiler.prepare();
   expect(candidate.profile).toBe('three-sdk');
   expect(candidate.project.assetIds).toEqual(['humanoid.uefn-mannequin']);
   expect(await readFile(path.join(candidate.sourceRoot, 'whitebox-materials.ts'), 'utf8')).toBe(result.files['whitebox-materials.ts']);
   const assets = JSON.parse(await readFile(path.join(candidate.playableRoot, 'asset-definitions.json'), 'utf8'));
   expect(assets.assets.map((asset: {id: string}) => asset.id).sort()).toEqual(['humanoid.uefn-mannequin']);
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
   const example=await service.examples('custom-vehicle') as {files:Record<string,string>};
   expect(example.files['main.ts']).toContain("createRoadVehicleSpec('motorcycle')");
   expect(example.files['main.ts']).toContain('sample.vehicles[0]');
   expect(example.files['main.ts']).not.toContain('brakeDrift:true');
   for(const [name,source]of Object.entries(example.files))await writeFile(path.join(root,name),source);
   const candidate=await service.compiler.prepare();
   expect(candidate.worldBuildHash).toBeTruthy();
  }finally{await service.close();await rm(root,{recursive:true,force:true});}
 });


it.each([['motorcycle','custom-bike'],['car','rover']] as const)('records the self-drawn %s through the independent Episode clock and wheel display',async(topic,instanceId)=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'road-episode-')),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const example=await service.examples('custom-vehicle',undefined,topic);
  for(const [file,source] of Object.entries(example.files))await writeFile(path.join(root,file),source);
  const candidate=await service.compiler.prepare();
  const episode=await openEpisodeBrowser({playableRoot:candidate.playableRoot});
  try{
   const start={positionWorldMetersXYZ:[0,.03,0] as const,facingYawRadians:Math.PI,
    humanoid:{vehicleInstanceId:instanceId,mounted:true,}};
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

it('discovers, compiles and flies a self-drawn fixed wing using the Episode owner',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'plane-episode-')),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const example=await service.examples('custom-aircraft');
  for(const [file,source] of Object.entries(example.files))await writeFile(path.join(root,file),source);
  const candidate=await service.compiler.prepare();
  const episode=await openEpisodeBrowser({playableRoot:candidate.playableRoot});
  try{
   await episode.prepareSegment({positionWorldMetersXYZ:[0,0,0],facingYawRadians:0,cameraViewId:'third-person',humanoid:{vehicleInstanceId:'custom-plane',mounted:true,}},{widthPixels:640,heightPixels:360});
   await episode.advance({humanoid:{forward:0,steer:0,roll:0,lift:0,pitch:0,strafe:0,boost:true,brake:false,slow:false,jump:false}},600);
   const after=await episode.advance({humanoid:{forward:-.3,steer:0,roll:0,lift:0,pitch:0,strafe:0,boost:false,brake:false,slow:false,jump:false}},180);
   expect(after.entities.find(e=>e.id==='custom-plane')!.positionWorldMetersXYZ[1]).toBeGreaterThan(2);
   await episode.frame('image/png');
   const wheels=await episode.page.evaluate(()=>{
    const observer=(window as any).__WORLDKIT_EVAL__,report=observer.inspectVehicles({entityIds:['custom-plane'],detail:'wheels'});
    const root=observer.targets['custom-plane'];
    return {sample:report.vehicles[0].sample,actual:report.vehicles[0].wheels,visual:[0,1,2].map(i=>({y:root.getObjectByName(`wheel.${i}.steer`).position.y,steer:root.getObjectByName(`wheel.${i}.steer`).rotation.y,angle:root.getObjectByName(`wheel.${i}.spin`).rotation.x}))};
   });
   expect(wheels.sample.status).toBe('sampled');
   for(const [i,w] of wheels.actual.entries()){
    expect(wheels.visual[i]!.y).toBeCloseTo((i===2?.26:.32)+w.compressionMeters);
    expect(wheels.visual[i]!.steer).toBeCloseTo(w.steeringRadians);expect(wheels.visual[i]!.angle).toBeCloseTo(w.rotationRadians);
   }

  }finally{await episode.close();}
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},60000);


it('routes a selected flying mount through animal documents and a minimal binding with its own resources',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'flying-mount-binding-')),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const category=await service.readAuthoringDocument('assets/animals/README.md');
  expect(category.navigation.children.map(child=>child.document)).toContain('assets/animals/flying-mounts.md');
  const search=await service.searchAssets('飞龙',20);const selectedAsset=search.assets.find(asset=>asset.id==='creature.dragon.d11')!;expect(selectedAsset).toBeDefined();
  const details=await service.describeAsset(selectedAsset.id);
  expect(details.documentation.arguments.document).toBe('assets/animals/flying-mounts.md');
  const page=await executeThreeCreatorTool(service,details.documentation.tool,details.documentation.arguments) as {assetIndex:{id:string}[];navigation:{parent:{document:string}}};
  expect(page.navigation.parent.document).toBe('assets/animals/README.md');expect(page.assetIndex).toHaveLength(11);expect(page.assetIndex.every(asset=>asset.id.startsWith('creature.dragon.d'))).toBe(true);
  const binding=details.bindingExample!;
  const snippet=await executeThreeCreatorTool(service,binding.tool,binding.arguments) as {exampleKind:string;source:string;files:Record<string,string>};
  expect(snippet.exampleKind).toBe('binding-snippet');expect(Object.keys(snippet.files)).toEqual(['main.ts']);
  expect(snippet.source).toBe('packages/creator-host/docs/agent/assets/animals/flying-mounts.ts');
  expect(snippet.files['main.ts']).toContain('FlyingCreatureVisual');expect(snippet.files['main.ts']).not.toMatch(/BoxGeometry|playerSpawn|\.spawn\s*=|createElement|durationSeconds/);
  await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:['humanoid.uefn-mannequin','creature.dragon.d11']}));
  await writeFile(path.join(root,'index.html'),'<script type="module" src="./main.ts"></script>');
  await writeFile(path.join(root,'main.ts'),snippet.files['main.ts']!);
  const candidate=await service.compiler.prepare();
  const catalog=JSON.parse(await readFile(path.join(candidate.playableRoot,'asset-definitions.json'),'utf8'));
  const dragon=catalog.assets.find((asset:{id:string})=>asset.id==='creature.dragon.d11');
  expect(dragon.integrationMetadata.visual.animationPrefix).toBe('D11');
  for(const logicalPath of [dragon.integrationMetadata.visual.modelResource,dragon.integrationMetadata.visual.flameResource]){
   const resource=dragon.resources.find((value:{path:string})=>value.path===logicalPath);expect(resource).toBeDefined();
   expect((await readFile(path.join(candidate.playableRoot,resource.uri))).length).toBe(resource.byteLength);
  }
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
},30000);
