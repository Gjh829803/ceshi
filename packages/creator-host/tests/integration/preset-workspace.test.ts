import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Group,PerspectiveCamera,Quaternion,Scene,Vector3} from 'three';
import {createCapsuleDebug,createCollisionDebug} from '@worldkit/preset-content/humanoid/capsule-debug';
import {createWorld,humanoid} from '@worldkit/three';
import {getDefaultProfile,loadAssetProfile,saveAssetProfile} from '@worldkit/preset-content/platform/profiles';
import {applyControlProfile,readEditableProfile} from '@worldkit/preset-content/platform/profile-runtime';
import {getMap} from '@worldkit/preset-content/environment/maps';
import {GRAND_PRIX} from '@worldkit/preset-content/environment/grand-prix';
import {SPECS} from '@worldkit/preset-content/config';
import {defaultRegion,prepareCourse} from '@worldkit/preset-content/platform/scenarios';
import {composeContentSpec,composeAssetCatalog} from '@worldkit/preset-content/assets/host-adapter';

describe('player workspace configuration',()=>{
 it('keeps composed engine tuning and content geometry stable when SDK factory defaults change',async()=>{
  const bindings=JSON.parse(readFileSync(new URL('../../../../packages/preset-content/config/integrations/whitebox.json',import.meta.url),'utf8'));
  const authored=(id:string)=>{
   const version=bindings.assets['vehicle.'+id].asset_version;
   const source=new URL(`../../../../asset-library/subjects/vehicles/vehicle.${id}/${version}/facts/physical.json`,import.meta.url);
   const spec=composeContentSpec('vehicle.'+id,{asset_version:version,parameters:JSON.parse(readFileSync(source,'utf8')).parameters}) as Record<string,unknown>;
   for(const key of humanoid.controlKeys)delete spec[key];
   delete spec.aircraftFlight;delete spec.controlProfileId;
   return spec;
  };
  vi.resetModules();
  vi.doMock('@worldkit/three',async()=>{
   const actual=await vi.importActual<typeof import('@worldkit/three')>('@worldkit/three');
   return {...actual,humanoid:{...actual.humanoid,createRoadVehicleSpec:(kind:'car'|'motorcycle')=>{
    const spec=actual.humanoid.createRoadVehicleSpec(kind);
    if(kind==='car'){spec.wheelPhysics.mass=1617;spec.wheelPhysics.powertrain.idleRpm=867;}
    return spec;
   }}};
  });
  try{
   const sdk=await import('@worldkit/three');
   const changedDefaults=sdk.humanoid.createRoadVehicleSpec('car').wheelPhysics;
   expect(changedDefaults.mass).toBe(1617);expect(changedDefaults.powertrain.idleRpm).toBe(867);
   const {SPECS:specs}=await import('@worldkit/preset-content/config');
   const rover=specs.find(s=>s.id==='rover')!.wheelPhysics!;
   const supercar=specs.find(s=>s.id==='supercar')!.wheelPhysics!;
   for(const id of ['rover','supercar','kart']){
    const spec=structuredClone(specs.find(s=>s.id===id)!) as unknown as Record<string,unknown>;
    for(const key of humanoid.controlKeys)delete spec[key];
    delete spec.aircraftFlight;delete spec.controlProfileId;
    const {spawn,yaw,color,...parameters}=spec;
    expect(parameters).toEqual(authored(id));
    const profile=getDefaultProfile(id)!;
    expect(profile.profileId).toBe(`preset.${id}`);
    const resolvedSpec=humanoid.createVehicle(specs.find(s=>s.id===id)!).spec;
    expect(profile.control).toEqual(humanoid.readMovementSettings(resolvedSpec));
   }
   expect(rover.mass).not.toBe(changedDefaults.mass);
   expect(rover.powertrain!.idleRpm).not.toBe(changedDefaults.powertrain.idleRpm);
   expect(supercar.powertrain!.idleRpm).not.toBe(changedDefaults.powertrain.idleRpm);
   expect(supercar.wheels).toEqual([-1.02,1.02].flatMap(x=>[-1.5,1.5].map(z=>({x,z,steering:z>0,driven:true}))));
   expect(specs.find(s=>s.id==='kart')!.wheelPhysics!.wheels).toEqual([-.78,.78].flatMap(x=>[-.89,.85].map(z=>({x,z,steering:z>0,driven:z<0}))));
  }finally{vi.doUnmock('@worldkit/three');vi.resetModules();}
 });

 it('exports the explicit bus brake profile without replacing it with family defaults',()=>{
  const catalog=JSON.parse(readFileSync(new URL('@worldkit/asset-library/catalog',import.meta.url),'utf8'));
  const exported=composeAssetCatalog(catalog.assets).find((asset:{id:string})=>asset.id==='vehicle.bus')!.vehicle!.spec;
  const profile=getDefaultProfile('bus')!;
  expect(exported.brakeDamping).toBeGreaterThan(0);
  expect(exported.brakeDamping).toBe(profile.control.brakeDamping);
  expect(exported.brakeDeceleration).toBe(profile.control.brakeDeceleration);
 });
 it.each(SPECS.filter(spec=>!!spec.wheelPhysics).map(spec=>spec.id))('prepares, drives, brakes and resets the %s with its own profile and collision envelope',async(id)=>{
  const spec=SPECS.find(s=>s.id===id);expect(spec).toBeDefined();
  const profile=getDefaultProfile(id);expect(profile).toBeDefined();
  // These presets use wheel forces rather than the optional brake-drift controller.
  expect(spec!.wheelPhysics).toBeDefined();expect(spec!.brakeDrift).not.toBe(true);
  expect(profile!.control.brakeDeceleration).toBeGreaterThan(0);expect(profile!.control.brakeDamping).toBeGreaterThan(0);
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:SPECS.map(s=>({instanceId:s.id,assetId:s.id,spec:s,object:new Group()}))}});
  try{
   const runtime=world.humanoid!;let sim=runtime.simulation;runtime.onSimulationReplaced(()=>{sim=runtime.simulation;});
   for(const mapId of ['campus','grand-prix']){
    const map=getMap(mapId);runtime.switchMap(map);
    expect(runtime.approach(id)).toBe(true);expect(runtime.enter(id)).toBe(true);world.step({},40);expect(runtime.exit()).toBe(true);
    prepareCourse(sim,map,mapId==='grand-prix'?'gp-straight':'staging',id);
    expect(runtime.enter(id)).toBe(true);applyControlProfile(runtime,profile!);
    const origin=sim.controlledActor.vehicle!.position.clone();
    // Torque curves and gear changes give each preset a different launch time.
    // Keep the same distance requirement, with a bounded six-second driving window.
    for(let frame=0;frame<360&&sim.controlledActor.vehicle!.position.distanceTo(origin)<=15;frame++)world.step({humanoid:{...humanoid.emptyInput(),forward:1}},1);
    expect(sim.controlledActor.vehicle!.position.distanceTo(origin)).toBeGreaterThan(15);
    expect(sim.controlledActor.vehicle!.motion.wheelPhysics!.wheels.some(w=>w.contact&&w.load>0)).toBe(true);
    // Space remains a brake at parking speed; S intentionally becomes reverse below 1 m/s.
    const speed=sim.controlledActor.vehicle!.speed;world.step({humanoid:{...humanoid.emptyInput(),brake:true}},30);
    expect(Math.abs(sim.controlledActor.vehicle!.speed)).toBeLessThan(speed);
    expect(sim.controlledActor.vehicle!.grounded).toBe(true);
    expect(runtime.environment.safeSpawn(sim.controlledActor.vehicle!.position,humanoid.vehicleBody(spec!),sim.controlledActor.vehicle!.rotation)).not.toBeNull();
    const edited=structuredClone(profile!);edited.control.speed=17;applyControlProfile(runtime,edited);
    expect(runtime.exportProfile().vehicles?.[id]?.speed).toBe(17);
    await world.reset();expect(sim.controlledActor.vehicle).toBeFalsy();
   }
   runtime.switchMap(getMap('campus'));
   const others=sim.vehicles.filter(v=>v.spec.id!==id).map(v=>v.position.clone());
   prepareCourse(sim,getMap('campus'),'grades',id);
   const staged=sim.vehicles.find(v=>v.spec.id===id)!;
   expect(staged.position.x).toBeCloseTo(27);expect(staged.position.z).toBeCloseTo(139);
   expect(sim.vehicles.filter(v=>v.spec.id!==id).map(v=>v.position.clone())).toEqual(others);
   expect(runtime.enter(id)).toBe(true);
   for(let frame=0;frame<360&&sim.controlledActor.vehicle!.position.z<150;frame++)world.step({humanoid:{...humanoid.emptyInput(),forward:1}},1);
   expect(sim.controlledActor.vehicle!.position.z).toBeGreaterThanOrEqual(150);
   expect(sim.controlledActor.vehicle!.position.y).toBeGreaterThan(.1);
  }finally{world.dispose();}
 // This fixture initializes all vehicle families and replaces two full maps.
 // Its wall-clock budget is independent of the bounded simulated drive above.
 },15_000);
 it('prepares every circuit driving section on supported clear ground and drives past the old campus boundary',async()=>{
  const map=getMap('grand-prix'),spec=SPECS.find(s=>s.id==='racer')!;
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:'racer',assetId:'racer',spec,object:new Group()}]}});
  try{
   const runtime=world.humanoid!;let sim=runtime.simulation;runtime.onSimulationReplaced(()=>{sim=runtime.simulation;});
   // Catch barriers cutting into the visual road, unsupported joins and pinched
   // turns across the entire loop, including the width of the driven car.
   for(const {position,tangent,normal} of GRAND_PRIX.samples){
    const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.atan2(tangent.x,tangent.z));
    // Both bypass lanes stay flat; intentional centre-line ramps are not flat road.
    const onRamp=map.boxes.some(box=>box.id.startsWith('gp-stunt-')&&Math.abs(position.x-box.position[0])<box.size[0]/2+3&&Math.abs(position.z-box.position[2])<box.size[2]/2+3);
    for(const offset of onRamp?[-7,7]:[-7,0,7]){
     const p=position.clone().addScaledVector(normal,offset);p.y=.03;
     expect(runtime.environment.support(p)?.height).toBeCloseTo(0,2);
     expect(runtime.environment.safeSpawn(p,humanoid.vehicleBody(spec),rotation),`blocked road at ${p.toArray()}`).not.toBeNull();
    }
   }
   for(const region of map.regions){
    prepareCourse(sim,map,region.id,'racer');
    const vehicle=sim.vehicles[0]!;
    expect(runtime.environment.support(vehicle.position)?.height).toBeCloseTo(0,2);
    expect(runtime.environment.safeSpawn(vehicle.position,humanoid.vehicleBody(spec),vehicle.rotation)).not.toBeNull();
   }
   prepareCourse(sim,map,'gp-straight','racer');
   expect(runtime.enter('racer')).toBe(true);
   const before=sim.controlledActor.vehicle!.position.clone();
   for(let i=0;i<300;i++)world.step({humanoid:{forward:1,steer:0,lift:0,roll:0,pitch:0,strafe:0,boost:false,brake:false,slow:false,jump:false}},1);
   expect(sim.controlledActor.vehicle!.position.z-before.z).toBeGreaterThan(40);
   expect(sim.controlledActor.vehicle!.position.x).toBeLessThan(-500);
   expect(Math.abs(sim.controlledActor.vehicle!.position.y)).toBeLessThan(.15);
   await world.reset();expect(sim.controlledActor.vehicle).toBeFalsy();
   runtime.switchMap(getMap('campus'));runtime.switchMap(map);
   expect(runtime.environment.support(new Vector3(...map.playerSpawn))?.height).toBeCloseTo(0,2);
  }finally{world.dispose();}
 });
 it('shows the live collider pose and dimensions, hiding disabled colliders and releasing its scene object',async()=>{
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:[]}});
  const scene=new Scene(),debug=createCapsuleDebug(scene);
  try{const h=world.humanoid!.simulation.controlledActor.controller!,c=h.capsule;
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
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:[]}});
  const scene=new Scene(),debug=createCollisionDebug(scene,handle=>world.humanoid!.environment.colliderId(handle));
  try{const h=world.humanoid!.simulation.controlledActor.controller!,spy=vi.spyOn(h.world,'debugRender');
   debug.update(h,'off');expect(spy).not.toHaveBeenCalled();expect(scene.children.every(o=>!o.visible)).toBe(true);
   debug.update(h,'person');expect(spy).not.toHaveBeenCalled();expect(debug.person.mesh.visible).toBe(true);expect(debug.all.visible).toBe(false);
   debug.update(h,'all');expect(debug.person.mesh.visible).toBe(false);expect(debug.all.visible).toBe(true);
   expect(Array.from(debug.all.geometry.getAttribute('position').array)).toEqual(Array.from(h.world.debugRender().vertices));
   expect(debug.all.geometry.getAttribute('position').count).toBeGreaterThan(100);
   world.humanoid!.switchMap(getMap('indoor-lab'));const next=world.humanoid!.simulation.controlledActor.controller!;
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
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:new Group()},vehicles:[]}});
  const scene=new Scene(),debug=createCollisionDebug(scene,handle=>world.humanoid!.environment.colliderId(handle));
  try{const h=world.humanoid!.simulation.controlledActor.controller!,count=h.world.colliders.len();
   debug.update(h,'all',map.boxes);
   const ground=new Set<number>();h.world.forEachCollider(c=>{if(c.translation().y===-2.5)ground.add(c.handle);});
   const expected=h.world.debugRender(undefined,c=>!ground.has(c.handle));
   expect(Array.from(debug.all.geometry.getAttribute('position').array)).toEqual(Array.from(expected.vertices));
   expect(expected.vertices.length).toBeGreaterThan(0);
   expect(expected.vertices.length).toBeLessThan(h.world.debugRender().vertices.length);
   debug.update(h,'all',map.boxes,true);
   expect(Array.from(debug.all.geometry.getAttribute('position').array)).toEqual(Array.from(h.world.debugRender().vertices));
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
 it('reads live SDK movement tuning without asset camera authority',async()=>{
  const rover=SPECS.find(spec=>spec.id==='rover')!,world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:'rover',assetId:'rover',spec:rover,object:new Group()}]}});
  try{const runtime=world.humanoid!,cached=getDefaultProfile('rover')!;runtime.applyProfile({vehicles:{rover:{coastDeceleration:2}}});
   const effective=readEditableProfile(runtime,cached);expect(effective.control.coastDeceleration).toBe(2);
   applyControlProfile(runtime,effective);expect(runtime.exportProfile().vehicles?.rover?.coastDeceleration).toBe(2);
   world.useAuthoredCamera();const editable=readEditableProfile(runtime,effective);expect(editable).not.toHaveProperty("camera");expect(runtime.inspectConfiguration().effective).not.toHaveProperty('camera');
  }finally{world.dispose();}
 });

 it('authors every configured campus spawn and approaches the actual patrol boat in water without moving it',async()=>{
  const map=getMap('campus');
  expect(map.spawns.filter(s=>s.vehicleId)).toHaveLength(SPECS.length);
  for(const spec of SPECS){
   const spawns=map.spawns.filter(s=>s.vehicleId===spec.id);
   expect(spawns).toHaveLength(1);expect(spawns[0]?.position).toEqual(spec.spawn);
  }
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:new Group()},vehicles:SPECS.map(spec=>({instanceId:spec.id,assetId:spec.id,spec,object:new Group()}))}});
  try{const r=world.humanoid!,boat=r.simulation.vehicles.find(v=>v.spec.id==='patrol-boat')!;
   const before=boat.position.clone();expect(r.environment.waterAt(before)).not.toBeNull();
   expect(r.approach('patrol-boat')).toBe(true);expect(boat.position.equals(before)).toBe(true);
   expect(r.environment.waterAt(r.simulation.controlledActor.player.position)).not.toBeNull();expect(r.simulation.controlledActor.player.position.distanceTo(before)).toBeLessThan(4);
  }finally{world.dispose();}
 });
 it('opens the character workshop at its authored action entrance, not the vehicle parking area',async()=>{
  const map=getMap('character-workshop');expect(defaultRegion(map,'person').id).toBe('cw-actions');
  expect(defaultRegion(map,'rover').id).toBe('cw-staging');expect(defaultRegion(getMap('campus'),'patrol-boat').id).toBe('water');
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:new Group()},vehicles:[]}});
  try{world.step({},1);world.humanoid!.advance({},1/60,{yawDeltaRadians:.7});
   prepareCourse(world.humanoid!.simulation,map,defaultRegion(map,'person').id,'person');world.step({},1);
   const p=world.humanoid!.simulation.controlledActor.player;expect(p.position.x).toBeCloseTo(-32);expect(p.position.z).toBeCloseTo(23);expect(Math.cos(p.yaw)).toBeCloseTo(-1);
   const pose=world.inspectCamera().current!;
   const backward=(pose.positionWorldMetersXYZ[0]-p.position.x)*Math.sin(p.yaw)+(pose.positionWorldMetersXYZ[2]-p.position.z)*Math.cos(p.yaw);
   expect(backward).toBeLessThan(-7); // Compare physical arm against actor forward, not incompatible yaw conventions.
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

});


it('uses complete current camera values and never backfills old camera shapes',()=>{
 expect(humanoid).not.toHaveProperty('parseCameraTuning');
 const profile=getDefaultProfile('person')!;
 expect(profile.control).toEqual(humanoid.defaultMovementSettings('character',{speed:3.1,accel:14,grip:5,steer:8}));
});

it('installs the calibrated Playground movement before any profile call and restores it after reset',async()=>{
 const create=()=>createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:[]}});
 const world=await create(),reference=await create();
 try{
  // Captured pre-refactor Playground values and its existing calibration formula.
  const baseline={speed:3.1,accel:14,grip:5,steer:8};
  reference.humanoid!.applyProfile({character:humanoid.defaultMovementSettings('character',baseline)});
  const actual=world.humanoid!.simulation.controlledActor.controller!.movementTuning;
  expect(actual).toMatchObject({speedScale:3.1/3.8,accelerationScale:14/12,airControlScale:5/3,turnScale:8/14,maxSpeed:5.8*3.1/3.8});
  expect(actual).toEqual(reference.humanoid!.simulation.controlledActor.controller!.movementTuning);
  world.step({moveZRatio:-1},90);reference.step({moveZRatio:-1},90);
  expect(world.getEntityState('person').positionWorldMetersXYZ).toEqual(reference.getEntityState('person').positionWorldMetersXYZ);
  await world.reset();
  expect(world.humanoid!.simulation.controlledActor.controller!.movementTuning).toEqual(actual);
 }finally{world.dispose();reference.dispose();}
});
