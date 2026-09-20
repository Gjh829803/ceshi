import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {expect,it} from 'vitest';
import {Group} from 'three';
import {createWorld,createHumanoidCameraDocument,parseCameraDocument,resolveCameraConfiguration} from '@worldkit/three';
import {executeThreeCreatorTool} from '../../src/cli/mcp';
import {ThreeCreatorTools} from '../../src/tools/tools';
import {cameraPresetSnapshots} from '../../src/discovery/camera-presets';
import contentCatalog from '../../../../asset-library/dist/whitebox/asset-catalog.json';
import {composeAssetCatalog} from '@worldkit/preset-content/assets/host-adapter';
const catalog={...contentCatalog,assets:composeAssetCatalog(contentCatalog.assets)};
it('returns a complete human camera snapshot with on-foot calibration and an unrestricted authored opening',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'human-camera-example-')),service=new ThreeCreatorTools(root,'three-sdk');
 try{
  const example=await executeThreeCreatorTool(service,'creator_get_examples',{topic:'getting-started'}) as {files:Record<string,string>};
  const document=parseCameraDocument(JSON.parse(example.files['config/camera.json']!));
  const native=createHumanoidCameraDocument(document.binding.targetEntityId);
  expect(document.presets).toEqual(native.presets);
  expect(document.binding).toEqual(native.binding);
  expect(document.input).toEqual(native.input);
  for(const view of ['first-person','shoulder'])expect(document.views[view]).toEqual(native.views[view]);
  const context={subjectId:document.binding.targetEntityId,subjectGeneration:1,subjectKind:'humanoid',availableAnchors:['eye','follow-pivot','shoulder-eye'] as const,headingAvailable:true,openingDistanceMeters:28};
  const human=resolveCameraConfiguration(document,context);
  expect(human.values.orientation).toMatchObject({referenceFrame:'world-up',recenter:{enabled:false},pitchLimitsRadians:{kind:'unbounded'}});
  expect(human.kind).toBe('third-person');
  if(human.kind==='third-person')expect(human.values.zoom.range).toEqual({kind:'unbounded'});
  expect(human.fields['orientation.recenter.enabled']?.source).toBe('subject-preset');
  const vehicle=resolveCameraConfiguration(document,{...context,subjectId:'scooter',subjectKind:'vehicle'});
  expect(vehicle.values.orientation.recenter.enabled).toBe(true);
  const nonhuman=await executeThreeCreatorTool(service,'creator_get_examples',{topic:'nonhuman-subject'}) as {files:Record<string,string>};
  const ordinary=parseCameraDocument(JSON.parse(nonhuman.files['config/camera.json']!));
  expect(ordinary.presets).toBeUndefined();
  expect(resolveCameraConfiguration(ordinary,{...context,subjectId:'actor',subjectKind:'ordinary'}).values.orientation).toMatchObject({referenceFrame:'world-up',recenter:{enabled:false}});
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
});
it('keeps native human calibration when the multiple-actor fixture follows any declared human',async()=>{
 const document=parseCameraDocument(JSON.parse(await readFile('examples/three-creator/multiple-actors/config/camera.json','utf8')));
 for(const subjectId of ['person','npc-left','npc-right']){
  const resolved=resolveCameraConfiguration(document,{subjectId,subjectGeneration:1,subjectKind:'humanoid',availableAnchors:['eye','follow-pivot','shoulder-eye'],headingAvailable:true,openingDistanceMeters:28});
  expect(resolved.values.orientation).toMatchObject({referenceFrame:'world-up',recenter:{enabled:false}});
  expect(resolved.fields['orientation.recenter.enabled']?.source).toBe('subject-preset');
 }
});
it('exposes selected creature snapshots that bind to the actual mounted runtime',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'camera-content-')),service=new ThreeCreatorTools(root,'three-sdk');
 const asset=catalog.assets.find(value=>value.id==='creature.horse')!;
 const world=await createWorld({navigation:false,assetDefinitions:{},humanoid:{map:{id:'content',name:'Content',description:'',bounds:{min:[-50,-5,-50],max:[50,50,50]},boxes:[{id:'floor',position:[0,-.5,0],size:[100,1,100]}],water:[],regions:[],spawns:[],playerSpawn:[0,.025,0]},character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:'horse',assetId:asset.id,object:new Group(),spec:asset.vehicle!.spec as never}]}});
 try{
  const description=await service.describeAsset(asset.id),selected=description.cameraPresetSnapshots;
  expect(selected.status).toBe('available');if(selected.status!=='available')throw new Error('snapshot unavailable');
  const initial=createHumanoidCameraDocument('horse'),document={...initial,presets:{...initial.presets,...selected.presets},binding:{targetEntityId:'horse',subjectOverrides:{horse:{views:Object.fromEntries(Object.keys(selected.presets).map(presetId=>[selected.presets[presetId]!.kind,{presetId}]))}}}};
  world.setCameraFollow({configuration:document});world.step({},0);
  expect(world.inspectCamera().resolved?.values.position).toHaveProperty('distanceMeters',8);
  expect(world.inspectCamera().resolved?.fields['position.distanceMeters']?.source).toBe('subject-preset');
  const baseline=structuredClone(world.inspectCamera().resolved!.values);
  const snapshots=structuredClone(selected.presets);
  const presetId=Object.keys(selected.presets).find(id=>selected.presets[id]!.kind==='third-person')!;
  world.setCameraFollow({configuration:parseCameraDocument({...document,views:{...document.views,
   'close-ride':{kind:'third-person',presetId,overrides:{position:{distanceMeters:6}}},
  }})});
  world.setCameraView('close-ride');world.step({},0);
  const customized=world.inspectCamera().resolved!;
  expect(customized.values).toEqual({...baseline,position:{...baseline.position,distanceMeters:6}});
  expect(customized.fields['position.distanceMeters']?.source).toBe('project-view');
  expect(customized.fields['orientation.initialPitchRadians']?.source).toBe('view-preset');
  world.setCameraView('third-person');
  expect(world.inspectCamera().resolved!.values).toEqual(baseline);
  expect(selected.presets).toEqual(snapshots);
  expect(selected).not.toHaveProperty('kind');expect(asset.vehicle!.spec).not.toHaveProperty('camera');
  await service.materializeRuntime();expect((await service.describeAsset(asset.id)).cameraPresetSnapshots).toMatchObject({compatibility:'unverified-workspace-runtime'});
 }finally{world.dispose();await service.close();await rm(root,{recursive:true,force:true});}
});
it('reports missing and incompatible snapshot references without inventing defaults',()=>{
 expect(cameraPresetSnapshots(undefined,false)).toMatchObject({status:'unavailable'});
 expect(cameraPresetSnapshots([{presetId:'x',source:'presets',key:'missing',viewId:'third-person'}],false)).toMatchObject({status:'unavailable'});
 expect(cameraPresetSnapshots([{presetId:'x',source:'presets',key:'horse.first-person',viewId:'third-person'}],false)).toMatchObject({status:'unavailable'});
 const variant=cameraPresetSnapshots([{presetId:'d01.third',source:'dragon-variants',key:'D01',viewId:'third-person'}],true);
 expect(variant).toMatchObject({status:'available',compatibility:'unverified-workspace-runtime'});
 if(variant.status==='available')expect(variant.presets['d01.third']?.values.position).toHaveProperty('distanceMeters',32);
});
it('preserves arbitrary preset IDs as own data and never resolves inherited source keys',()=>{
 const selected=cameraPresetSnapshots([{presetId:'__proto__',source:'presets',key:'horse.third-person',viewId:'third-person'}],false);
 expect(selected.status).toBe('available');if(selected.status!=='available')throw new Error('unavailable');
 expect(Object.hasOwn(selected.presets,'__proto__')).toBe(true);expect(Object.getPrototypeOf(selected.presets)).toBe(Object.prototype);
 expect(JSON.parse(JSON.stringify(selected)).presets).toHaveProperty('__proto__');
 expect(cameraPresetSnapshots([{presetId:'x',source:'presets',key:'__proto__',viewId:'third-person'}],false)).toMatchObject({status:'unavailable'});
});
