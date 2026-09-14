import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {expect,it} from 'vitest';
import {Group} from 'three';
import {createWorld,createHumanoidCameraDocument} from '@worldkit/three';
import {ThreeCreatorTools} from '../../src/tools/tools';
import {cameraPresetSnapshots} from '../../src/discovery/camera-presets';
import catalog from '../../../../assets/three-creator/asset-catalog.json';
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
