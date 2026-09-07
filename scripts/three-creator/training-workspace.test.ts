import {describe,it,expect} from 'vitest';
import {Group,PerspectiveCamera} from 'three';
import {createWorld} from '@worldkit/three';
import {getDefaultProfile,loadAssetProfile,saveAssetProfile} from '../../examples/three-creator/sdk-capabilities/platform/profiles';
import {applyCameraProfile,applyControlProfile} from '../../examples/three-creator/sdk-capabilities/platform/profile-runtime';
import {getMap} from '../../examples/three-creator/sdk-capabilities/environment/maps';
import {SPECS} from '../../examples/three-creator/sdk-capabilities/config';
import {defaultRegion,prepareCourse} from '../../examples/three-creator/sdk-capabilities/platform/scenarios';

describe('training workspace configuration',()=>{
 it('uses the authored indoor camera default while keeping explicit distance edits across maps',async()=>{
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:[]}});
  try{const r=world.training!,profile=getDefaultProfile('person')!;applyCameraProfile(r,profile);world.step({},1);expect(r.followCamera.distance).toBe(8.8);
   r.switchMap(getMap('indoor-lab'));world.step({},1);expect(r.followCamera.distance).toBe(5.6);
   profile.camera.distance=10;applyCameraProfile(r,profile);await world.reset();world.step({},1);expect(r.followCamera.distance).toBe(10);
   r.switchMap(getMap('campus'));world.step({},1);expect(r.followCamera.distance).toBe(10);
  }finally{world.dispose();}
 });
 it('authors all 19 campus spawns and approaches the actual patrol boat in water without moving it',async()=>{
  const map=getMap('campus');
  expect(map.spawns.filter(s=>s.vehicleId)).toHaveLength(19);
  for(const spec of SPECS)expect(map.spawns.find(s=>s.vehicleId===spec.id)?.position).toEqual(spec.spawn);
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map,character:{instanceId:'person',object:new Group()},vehicles:SPECS.map(spec=>({instanceId:spec.id,assetId:spec.id,spec,object:new Group()}))}});
  try{const r=world.training!,boat=r.simulation.vehicles.find(v=>v.spec.id==='patrol-boat')!;
   const before=boat.position.clone();expect(r.environment.waterAt(before)).not.toBeNull();
   expect(r.approach('patrol-boat')).toBe(true);expect(boat.position.equals(before)).toBe(true);
   expect(r.environment.waterAt(r.simulation.player.position)).not.toBeNull();expect(r.simulation.player.position.distanceTo(before)).toBeLessThan(4);
  }finally{world.dispose();}
 });
 it('opens the character workshop at its authored action entrance, not the vehicle parking area',async()=>{
  const map=getMap('character-workshop');expect(defaultRegion(map,'person').id).toBe('cw-actions');
  expect(defaultRegion(map,'rover').id).toBe('cw-staging');expect(defaultRegion(getMap('campus'),'patrol-boat').id).toBe('water');
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map,character:{instanceId:'person',object:new Group()},vehicles:[]}});
  try{world.step({},1);world.training!.advance({},1/60,{yawDeltaRadians:.7});
   prepareCourse(world.training!.simulation,map,defaultRegion(map,'person').id,'person');world.step({},1);
   const p=world.training!.simulation.player;expect(p.position.x).toBeCloseTo(-32);expect(p.position.z).toBeCloseTo(23);expect(Math.cos(p.yaw)).toBeCloseTo(-1);
   expect(Math.cos(world.training!.followCamera.yaw)).toBeCloseTo(-1);
  }finally{world.dispose();}
 });
 it('does not replace delivered configuration with nonexistent or corrupt local overrides',()=>{
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  const project=getDefaultProfile('person')!;project.control.speed=10;
  expect((loadAssetProfile(storage,'person')??project).control.speed).toBe(10);
  saveAssetProfile(storage,{...project,control:{...project.control,speed:12}});
  expect(loadAssetProfile(storage,'person')?.control.speed).toBe(12);
  for(const key of values.keys())values.set(key,'corrupt');
  expect((loadAssetProfile(storage,'person')??project).control.speed).toBe(10);
 });
 it('keeps camera distance outside camera tuning across profile edits and reset',async()=>{
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{
   map:{id:'test',name:'Test',description:'',bounds:{min:[-50,-5,-50],max:[50,50,50]},boxes:[{id:'floor',position:[0,-.5,0],size:[100,1,100]}],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]},
   character:{instanceId:'person',object:new Group()},vehicles:[]}});
  try{const profile=getDefaultProfile('person')!;profile.camera.distance=12;
   applyCameraProfile(world.training!,profile);applyControlProfile(world.training!,profile);
   expect(world.training!.exportProfile().camera).not.toHaveProperty('distance');
   await world.reset();expect(world.training!.followCamera.baseDistance).toBe(12);
  }finally{world.dispose();}
 });
});
