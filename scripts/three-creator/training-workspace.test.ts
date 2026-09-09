import {describe,it,expect,vi} from 'vitest';
import {Group,PerspectiveCamera,Quaternion,Scene,Vector3} from 'three';
import {createCapsuleDebug,createCollisionDebug} from '../../examples/three-creator/sdk-capabilities/humanoid/capsule-debug';
import {createWorld,training} from '@worldkit/three';
import {getDefaultProfile,loadAssetProfile,saveAssetProfile} from '../../examples/three-creator/sdk-capabilities/platform/profiles';
import {applyCameraProfile,applyControlProfile,readEffectiveProfile} from '../../examples/three-creator/sdk-capabilities/platform/profile-runtime';
import {getMap} from '../../examples/three-creator/sdk-capabilities/environment/maps';
import {GRAND_PRIX} from '../../examples/three-creator/sdk-capabilities/environment/grand-prix';
import {SPECS} from '../../examples/three-creator/sdk-capabilities/config';
import {defaultRegion,prepareCourse} from '../../examples/three-creator/sdk-capabilities/platform/scenarios';

describe('training workspace configuration',()=>{
 it.each(['supercar','kart'])('prepares, drives, brakes and resets the %s with its own profile and collision envelope',async(id)=>{
  const spec=SPECS.find(s=>s.id===id);expect(spec).toBeDefined();
  const profile=getDefaultProfile(id);expect(profile).toBeDefined();
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:SPECS.map(s=>({instanceId:s.id,assetId:s.id,spec:s,object:new Group()}))}});
  try{
   const runtime=world.training!,sim=runtime.simulation;
   for(const mapId of ['campus','grand-prix']){
    const map=getMap(mapId);runtime.switchMap(map);
    expect(runtime.approach(id)).toBe(true);expect(runtime.enter(id)).toBe(true);world.step({},40);expect(runtime.exit()).toBe(true);
    prepareCourse(sim,map,mapId==='grand-prix'?'gp-straight':'staging',id);
    expect(runtime.enter(id)).toBe(true);applyControlProfile(runtime,profile!);
    const origin=sim.vehicle!.position.clone();world.step({training:{...training.emptyInput(),forward:1}},180);
    expect(sim.vehicle!.position.distanceTo(origin)).toBeGreaterThan(15);
    const speed=sim.vehicle!.speed;world.step({training:{...training.emptyInput(),forward:-1}},30);
    expect(Math.abs(sim.vehicle!.speed)).toBeLessThan(speed);
    expect(sim.vehicle!.grounded).toBe(true);
    expect(runtime.environment.safeSpawn(sim.vehicle!.position,training.vehicleBody(spec!),sim.vehicle!.rotation)).not.toBeNull();
    const edited=structuredClone(profile!);edited.control.speed=17;applyControlProfile(runtime,edited);
    expect(runtime.exportProfile().vehicles?.[id]?.speed).toBe(17);
    await world.reset();expect(sim.vehicle).toBeFalsy();
   }
  }finally{world.dispose();}
 });
 it('prepares every circuit driving section on supported clear ground and drives past the old campus boundary',async()=>{
  const map=getMap('grand-prix'),spec=SPECS.find(s=>s.id==='racer')!;
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map,character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:'racer',assetId:'racer',spec,object:new Group()}]}});
  try{
   const runtime=world.training!,sim=runtime.simulation;
   // Catch barriers cutting into the visual road, unsupported joins and pinched
   // turns across the entire loop, including the width of the driven car.
   for(const {position,tangent,normal} of GRAND_PRIX.samples){
    const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.atan2(tangent.x,tangent.z));
    for(const offset of [-7,0,7]){
     const p=position.clone().addScaledVector(normal,offset);p.y=.03;
     expect(runtime.environment.support(p)?.height).toBeCloseTo(0,2);
     expect(runtime.environment.safeSpawn(p,training.vehicleBody(spec),rotation),`blocked road at ${p.toArray()}`).not.toBeNull();
    }
   }
   for(const region of map.regions){
    prepareCourse(sim,map,region.id,'racer');
    const vehicle=sim.vehicles[0]!;
    expect(runtime.environment.support(vehicle.position)?.height).toBeCloseTo(0,2);
    expect(runtime.environment.safeSpawn(vehicle.position,training.vehicleBody(spec),vehicle.rotation)).not.toBeNull();
   }
   prepareCourse(sim,map,'gp-straight','racer');
   expect(runtime.enter('racer')).toBe(true);
   const before=sim.vehicle!.position.clone();
   for(let i=0;i<300;i++)world.step({training:{forward:1,steer:0,lift:0,roll:0,pitch:0,strafe:0,boost:false,brake:false,slow:false,jump:false}},1);
   expect(sim.vehicle!.position.z-before.z).toBeGreaterThan(40);
   expect(sim.vehicle!.position.x).toBeLessThan(-500);
   expect(Math.abs(sim.vehicle!.position.y)).toBeLessThan(.15);
   await world.reset();expect(sim.vehicle).toBeFalsy();
   runtime.switchMap(getMap('campus'));runtime.switchMap(map);
   expect(runtime.environment.support(new Vector3(...map.playerSpawn))?.height).toBeCloseTo(0,2);
  }finally{world.dispose();}
 });
 it('shows the live collider pose and dimensions, hiding disabled colliders and releasing its scene object',async()=>{
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:[]}});
  const scene=new Scene(),debug=createCapsuleDebug(scene);
  try{const h=world.training!.simulation.humanoid!,c=h.capsule;
   debug.update(c,false);expect(debug.mesh.visible).toBe(false);
   debug.update(c,true);expect(debug.mesh.visible).toBe(true);
   expect(debug.mesh.geometry.parameters.radius).toBe(c.radius());
   expect(debug.mesh.geometry.parameters.height).toBe(c.halfHeight()*2);
   const geometry=debug.mesh.geometry;debug.update(c,true);expect(debug.mesh.geometry).toBe(geometry);
   // Read back a changed real Rapier shape, rather than testing authored constants.
   c.setHalfHeight(.31);c.setRadius(.22);
   h.body.setTranslation({x:4,y:3,z:2},true);h.world.propagateModifiedBodyPositionsToColliders();
   debug.update(c,true);expect(debug.mesh.geometry.parameters.height).toBeCloseTo(.62);
   expect(debug.mesh.geometry.parameters.radius).toBeCloseTo(.22);
   expect(debug.mesh.position.toArray()).toEqual([c.translation().x,c.translation().y,c.translation().z]);
   c.setEnabled(false);debug.update(c,true);expect(debug.mesh.visible).toBe(false);
   c.setEnabled(true);debug.update(c,true);expect(debug.mesh.visible).toBe(true);
   debug.update(undefined,true);expect(debug.mesh.visible).toBe(false);
  }finally{debug.dispose();world.dispose();}
  expect(scene.children).toHaveLength(0);
 });
 it('renders all live Rapier shapes only in all mode and follows map replacement',async()=>{
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:[]}});
  const scene=new Scene(),debug=createCollisionDebug(scene);
  try{const h=world.training!.simulation.humanoid!,spy=vi.spyOn(h.world,'debugRender');
   debug.update(h,'off');expect(spy).not.toHaveBeenCalled();expect(scene.children.every(o=>!o.visible)).toBe(true);
   debug.update(h,'person');expect(spy).not.toHaveBeenCalled();expect(debug.person.mesh.visible).toBe(true);expect(debug.all.visible).toBe(false);
   debug.update(h,'all');expect(debug.person.mesh.visible).toBe(false);expect(debug.all.visible).toBe(true);
   expect(Array.from(debug.all.geometry.getAttribute('position').array)).toEqual(Array.from(h.world.debugRender().vertices));
   expect(debug.all.geometry.getAttribute('position').count).toBeGreaterThan(100);
   world.training!.switchMap(getMap('indoor-lab'));const next=world.training!.simulation.humanoid!;
   debug.update(next,'all');expect(Array.from(debug.all.geometry.getAttribute('position').array)).toEqual(Array.from(next.world.debugRender().vertices));
   debug.update(next,'off');expect(scene.children.every(o=>!o.visible)).toBe(true);
  }finally{debug.dispose();world.dispose();}
  expect(scene.children).toHaveLength(0);
 });
 it('hides every ground tile without disabling physics or hiding raised floors and ramps',async()=>{
  const map={...getMap('indoor-lab'),boxes:[
   {id:'lab-ground',position:[0,-2.5,0] as const,size:[130,5,150] as const},
   {id:'raised-floor',position:[0,4,0] as const,size:[30,1,30] as const},
   {id:'ramp',position:[15,1,0] as const,size:[4,1,8] as const,rotation:[.3,0,0] as const},
  ]};
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map,character:{instanceId:'person',object:new Group()},vehicles:[]}});
  const scene=new Scene(),debug=createCollisionDebug(scene);
  try{const h=world.training!.simulation.humanoid!,count=h.world.colliders.len();
   debug.update(h,'all',map.boxes);
   const ground=new Set<number>();h.world.forEachCollider(c=>{if(c.translation().y===-2.5)ground.add(c.handle);});
   const expected=h.world.debugRender(undefined,c=>!ground.has(c.handle));
   expect(Array.from(debug.all.geometry.getAttribute('position').array)).toEqual(Array.from(expected.vertices));
   expect(expected.vertices.length).toBeGreaterThan(0);
   expect(expected.vertices.length).toBeLessThan(h.world.debugRender().vertices.length);
   expect(h.world.colliders.len()).toBe(count);
   h.world.forEachCollider(c=>expect(c.isEnabled()).toBe(true));
  }finally{debug.dispose();world.dispose();}
 });
 it('round trips complete current profiles and rejects incomplete or old migrated forms',()=>{
  const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  const profile=getDefaultProfile('rover')!;
  const control=profile.control;control.coastDeceleration=2;control.maxSpeed=40;control.brakeDeceleration=30;
  saveAssetProfile(storage,profile);expect(loadAssetProfile(storage,'rover')?.control).toMatchObject({coastDeceleration:2,maxSpeed:40,brakeDeceleration:30});
  expect(()=>saveAssetProfile(storage,{...profile,control:{...control,coastDeceleration:NaN}})).toThrow();
  expect(()=>saveAssetProfile(storage,{...profile,control:{speed:10,accel:3,grip:4,steer:1}})).toThrow();
  expect(()=>saveAssetProfile(storage,{...profile,defaultsRevision:2})).toThrow();
 });
 it('reads live SDK movement tuning before a camera-only edit',async()=>{
  const rover=SPECS.find(spec=>spec.id==='rover')!,world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:'rover',assetId:'rover',spec:rover,object:new Group()}]}});
  try{const runtime=world.training!,cached=getDefaultProfile('rover')!;runtime.applyProfile({vehicles:{rover:{coastDeceleration:2}}});
   const effective=readEffectiveProfile(runtime,cached);expect(effective.control.coastDeceleration).toBe(2);
   effective.camera.distance=10;applyCameraProfile(runtime,effective);expect(runtime.exportProfile().vehicles?.rover?.coastDeceleration).toBe(2);
  }finally{world.dispose();}
 });
 it('uses the authored indoor camera default while keeping explicit distance edits across maps',async()=>{
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:[]}});
  try{const r=world.training!,profile=getDefaultProfile('person')!;applyCameraProfile(r,profile);world.step({},1);expect(r.followCamera.distance).toBe(8.8);
   r.switchMap(getMap('indoor-lab'));world.step({},1);expect(r.followCamera.distance).toBe(5.6);
   profile.camera.distance=10;applyCameraProfile(r,profile);await world.reset();world.step({},1);expect(r.followCamera.distance).toBe(10);
   r.switchMap(getMap('campus'));world.step({},1);expect(r.followCamera.distance).toBe(10);
  }finally{world.dispose();}
 });
 it('authors every configured campus spawn and approaches the actual patrol boat in water without moving it',async()=>{
  const map=getMap('campus');
  expect(map.spawns.filter(s=>s.vehicleId)).toHaveLength(SPECS.length);
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


it('uses complete current camera values and never backfills old camera shapes',()=>{
 expect(()=>training.parseCameraTuning({recenterDelaySeconds:1,followResponsePerSecond:8,baseFovDegrees:55})).toThrow();
 const profile=getDefaultProfile('person')!;
 expect(profile.control).toEqual(training.defaultTrainingControl('character',{speed:3.1,accel:14,grip:5,steer:8}));
});

it('installs the calibrated Playground movement before any profile call and restores it after reset',async()=>{
 const create=()=>createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:[]}});
 const world=await create(),reference=await create();
 try{
  // Captured pre-refactor Playground values and its existing calibration formula.
  const baseline={speed:3.1,accel:14,grip:5,steer:8};
  reference.training!.applyProfile({character:training.defaultTrainingControl('character',baseline)});
  const actual=world.training!.simulation.humanoid!.movementTuning;
  expect(actual).toMatchObject({speedScale:3.1/3.8,accelerationScale:14/12,airControlScale:5/3,turnScale:8/14,maxSpeed:5.8*3.1/3.8});
  expect(actual).toEqual(reference.training!.simulation.humanoid!.movementTuning);
  world.step({moveZRatio:-1},90);reference.step({moveZRatio:-1},90);
  expect(world.getEntityState('person').positionWorldMetersXYZ).toEqual(reference.getEntityState('person').positionWorldMetersXYZ);
  await world.reset();
  expect(world.training!.simulation.humanoid!.movementTuning).toEqual(actual);
 }finally{world.dispose();reference.dispose();}
});
