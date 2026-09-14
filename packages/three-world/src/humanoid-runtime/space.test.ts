import {createHumanoidCameraDocument} from '../config/camera/index';
import {createSpaceTrainingMap} from '@worldkit/preset-content/environment/space-training';
import {getMap} from '@worldkit/preset-content/environment/maps';
import {readFile} from 'node:fs/promises';
import {AnimationClip,Box3,SkinnedMesh} from 'three';
import {parseFixtureGlb} from './textured-glb-fixture';
import {Character as SourceCharacter} from './humanoid/source-character';
import {Character} from './character';
import {beforeAll,describe,expect,it} from 'vitest';
import {Group,PerspectiveCamera,Quaternion,Vector3} from 'three';
import {createWorld} from '../world';
import {createVehicle,emptyInput,stepVehicle,type Input} from './simulation';
import {EnvironmentQueries,initEnvironmentQueries} from './environment/queries';
import type {EnvironmentDefinition} from './environment/types';
import type {VehicleSpec} from './config';
import {SPACE_FLIGHT_PRESETS} from './motion-families/space/config';
import {setSpaceDriveMode,requestSpaceDock,spaceTelemetry} from './motion-families/space/commands';
import {resetRigidState} from './motion-families/space/physics-state';
import {spaceFamily} from './motion-families/space/family';
import {SPECS} from '@worldkit/preset-content/config';
import {buildSpaceModel} from '@worldkit/preset-content/space-model';

const spec:VehicleSpec={...SPECS.find(s=>s.id==='spacecraft')!,spawn:[0,20,0],spaceFlight:{...SPACE_FLIGHT_PRESETS.shuttle,driveMode:'inertial',dockingPorts:[{id:'bay',name:'Bay',positionMetersXYZ:[0,20,4],rotationXYZW:[0,0,0,1]}]}};
const map:EnvironmentDefinition={id:'space-test',name:'Space',description:'',bounds:{min:[-500,-100,-500],max:[500,500,500]},boxes:[{id:'floor',position:[0,-2,0],size:[1000,1,1000]}],water:[],regions:[{id:'flight',name:'Flight',description:'',center:[0,0,0],size:[1000,1000],color:'#ddd',modes:['spacecraft','wheeled','plane','dragon']}],spawns:[{id:'bay',name:'Bay',vehicleId:'space',position:[0,20,0],yaw:0,regionId:'flight'}],playerSpawn:[4,.025,0]};
beforeAll(initEnvironmentQueries);
function fixture(overrides:Partial<VehicleSpec>={},scene=map){
 const v=createVehicle({...spec,...overrides}),q=new EnvironmentQueries(scene);
 if(v.motion.family!=='space')throw Error('wrong fixture');v.motion.body.riderMounted=true;
 return {v,q,step(input:Partial<Input>,frames=60){for(let n=0;n<frames;n++){stepVehicle(v,{...emptyInput(),...input},1/60,n/60,q);q.stepPhysics(1/60);}},dispose(){q.dispose();}};
}
describe('native space family',()=>{
 it('uses Newton thrust and fixed mass in the one Rapier world',()=>{
  const f=fixture();try{f.step({forward:1},60);const t=spaceTelemetry(f.v)!;
   expect(t).not.toHaveProperty('fuelKilograms');expect(f.v.motion).not.toHaveProperty('fuelKilograms');
   expect(t.massKilograms).toBe(2160);expect(f.v.velocity.z).toBeGreaterThan(28000/2160*.99);expect(f.v.velocity.z).toBeLessThan(28000/2150*1.01);
   expect(f.v.position.y).toBeCloseTo(20,4);expect(t.thrustNewtonsXYZ).toEqual([0,0,28000]);
  }finally{f.dispose();}
 });
 it('coasts without drag or a hard speed cap; Shift brakes with counter-thrust',()=>{
  const f=fixture();try{f.step({forward:1},240);expect(f.v.speed).toBeGreaterThan(spec.speed);
   const velocity=f.v.velocity.clone();f.step({},240);
   expect(f.v.velocity.distanceTo(velocity)).toBeLessThan(1e-4);expect(spaceTelemetry(f.v)!.massKilograms).toBe(2160);
   f.step({boost:true},240);expect(f.v.speed).toBeLessThan(velocity.length()*.65);expect(spaceTelemetry(f.v)!.massKilograms).toBe(2160);
  }finally{f.dispose();}
 });
 it.each([-1,1])('keeps A/D and arrow strafe directions at signed input %s',direction=>{
  const f=fixture();try{f.step({steer:direction},30);const front=new Vector3(0,0,1).applyQuaternion(f.v.rotation);
   expect(front.x*direction).toBeLessThan(0);expect(f.v.velocity.length()).toBeCloseTo(0,5);
   resetRigidState(f.v);f.v.rotation.identity();f.v.velocity.set(0,0,0);f.step({strafe:direction},30);expect(f.v.velocity.x*direction).toBeLessThan(0);
  }finally{f.dispose();}
 });
 it('rotates local lift with the ship; pitch and roll use torque',()=>{
  const f=fixture();try{f.v.rotation.setFromAxisAngle(new Vector3(0,0,1),Math.PI/2);f.step({lift:1},30);expect(f.v.velocity.x).toBeLessThan(-3);expect(Math.abs(f.v.velocity.y)).toBeLessThan(.001);
   f.step({pitch:1,roll:1},30);expect(spaceTelemetry(f.v)!.massKilograms).toBe(2160);expect(f.v.rotation.length()).toBeCloseTo(1,6);
  }finally{f.dispose();}
 });
 it('can keep accelerating, braking and turning indefinitely without losing mass or propulsion',()=>{
  const f=fixture();try{
   for(let n=0;n<100;n++){f.step({forward:1,steer:1},60);f.step({boost:true},120);}
   expect(spaceTelemetry(f.v)!.massKilograms).toBe(2160);expect(f.v.speed).toBeLessThan(.2);
   f.step({forward:1},60);expect(f.v.speed).toBeGreaterThan(10);
   setSpaceDriveMode(f.v,'assisted');f.step({},180);expect(f.v.speed).toBeLessThan(.1);
  }finally{f.dispose();}
 });
 it('preserves very small drift with no control input',()=>{
  const f=fixture();try{f.v.velocity.set(.001,0,0);f.step({},300);expect(f.v.velocity.x).toBeCloseTo(.001,7);}finally{f.dispose();}
 });
 it('applies optional central gravity to unoccupied ships',()=>{
  const f=fixture({spawn:[100,20,0],spaceFlight:{...spec.spaceFlight!,gravity:{centerMetersXYZ:[0,20,0],muMetersCubedPerSecondSquared:10000,radiusMeters:10}}});try{
   if(f.v.motion.family!=='space')throw Error();f.v.motion.body.riderMounted=false;f.step({},60);expect(f.v.velocity.x).toBeCloseTo(-1,1);expect(spaceTelemetry(f.v)!.massKilograms).toBe(2160);
  }finally{f.dispose();}
 });
 it('collides with a real static wall without tunneling',()=>{
  const f=fixture({}, {...map,boxes:[...map.boxes,{id:'wall',position:[0,20,12],size:[30,30,1]}]});try{f.step({forward:1},180);expect(f.v.position.z).toBeLessThan(8);expect(f.v.position.z).toBeGreaterThan(5);
  }finally{f.dispose();}
 });
 it('keeps each hull/config/mode independent and resets its own state',()=>{
  const f=fixture(),saucer=createVehicle(SPECS.find(s=>s.id==='survey-spacecraft')!);try{const before=spaceTelemetry(saucer)!;f.step({forward:1},60);setSpaceDriveMode(f.v,'assisted');expect(spaceTelemetry(saucer)).toEqual(before);
   f.v.spec.spaceFlight!.massKilograms=1234;expect(SPACE_FLIGHT_PRESETS.shuttle.massKilograms).toBe(2160);
   resetRigidState(f.v);expect(spaceTelemetry(f.v)).toMatchObject({driveMode:'inertial',docking:null});
   const other=createVehicle(SPECS.find(s=>s.id==='rover')!);expect(()=>spaceFamily.step!(other,emptyInput(),1/60,0,f.q)).toThrow('MOTION_PHYSICS_OWNER_MISMATCH');expect(()=>setSpaceDriveMode(other,'inertial')).toThrow('SPACE_VEHICLE_NOT_MOUNTED');
  }finally{f.dispose();}
 });
 it('flies the heavier circular saucer with its own inertia and collider',()=>{
  const f=fixture({...SPECS.find(s=>s.id==='survey-spacecraft')!,spawn:[0,20,0]});try{f.step({forward:1},60);expect(f.v.velocity.z).toBeGreaterThan(6);expect(f.v.velocity.z).toBeLessThan(8);f.step({steer:1},120);expect(f.v.rotation.angleTo(new Quaternion())).toBeGreaterThan(.2);
  }finally{f.dispose();}
 });
 it('approaches a configured bay, latches, holds, then releases for manual flight',()=>{
  const f=fixture();try{requestSpaceDock(f.v,'bay');f.step({},1200);expect(spaceTelemetry(f.v)!.docking?.status).toBe('docked');expect(f.v.position.distanceTo(new Vector3(0,20,4))).toBeLessThan(.15);
   const position=f.v.position.clone();f.step({},120);expect(f.v.position.distanceTo(position)).toBeLessThan(.001);expect(spaceTelemetry(f.v)!.massKilograms).toBe(2160);
   requestSpaceDock(f.v,null);f.step({forward:1},60);expect(spaceTelemetry(f.v)!.docking).toBeNull();expect(f.v.position.z).toBeGreaterThan(position.z+1);
  }finally{f.dispose();}
 });
 it('manual input cancels docking and invalid ports are rejected',()=>{
  const f=fixture();try{expect(()=>requestSpaceDock(f.v,'missing')).toThrow('SPACE_DOCK_PORT_UNKNOWN');requestSpaceDock(f.v,'bay');f.step({lift:1},1);expect(spaceTelemetry(f.v)!.docking).toBeNull();
   expect(()=>requestSpaceDock(f.v,'bay')).not.toThrow();
  }finally{f.dispose();}
 });
 it('rejects invalid family configs before body creation',()=>{
  expect(()=>createVehicle({...spec,spaceFlight:{...spec.spaceFlight!,massKilograms:-1}})).toThrow('SPACE_FLIGHT_CONFIG_INVALID');
  expect(()=>createVehicle({...spec,spaceFlight:{...spec.spaceFlight!,hull:'disc'}})).toThrow('SPACE_DISC_SHAPE_INVALID');
  expect(()=>createVehicle({...spec,bodyPhysics:{kind:'motion',mass:1,centerOfMassHeight:1}})).toThrow('SPACE_PHYSICS_OWNER_CONFLICT');
 });
 it('reuses mounted SDK input, all three camera modes, runtime commands and reset',async()=>{
  const model=buildSpaceModel(spec),world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:'space',assetId:'space',spec,object:model.root}]}});
  try{world.setCameraFollow({configuration:{...createHumanoidCameraDocument('person'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});const r=world.humanoid!;r.prepareEpisodeStart({positionWorldMetersXYZ:[0,20,0],facingYawRadians:-Math.PI,humanoid:{vehicleInstanceId:'space',mounted:true,}});
   world.setCameraFollow({configuration:{...world.inspectCamera().document!,input:{cycleViewIds:['third-person','first-person','shoulder']}}});r.command({type:'space.set-drive-mode',mode:'assisted'});world.step({humanoid:{...emptyInput(),forward:1}},60);const speed=r.simulation.controlledActor.vehicle!.speed;world.step({humanoid:emptyInput()},120);expect(r.simulation.controlledActor.vehicle!.speed).toBeLessThan(speed*.1);
   for(const mode of [1,2,0]){world.step({cameraTogglePressed:true},1);expect(world.snapshot().camera.viewKind).toBe(['third-person','first-person','shoulder'][mode]);world.step({},1);}
   const rotation=r.simulation.controlledActor.vehicle!.rotation.clone();world.step({cameraYawRatio:1,cameraPitchRatio:1},30);expect(r.simulation.controlledActor.vehicle!.rotation.angleTo(rotation)).toBeLessThan(.001);
   expect(r.snapshot().vehicles[0]!.spaceFlight).not.toHaveProperty('fuelKilograms');r.snapshot().vehicles[0]!.spaceFlight!.thrustNewtonsXYZ[0]=999;expect(r.snapshot().vehicles[0]!.spaceFlight!.thrustNewtonsXYZ[0]).not.toBe(999);
   r.reset();expect(r.snapshot().vehicles[0]!.spaceFlight).toMatchObject({driveMode:'inertial'});expect(()=>r.command({type:'space.set-drive-mode',mode:'assisted'})).toThrow('SPACE_VEHICLE_NOT_MOUNTED');
  }finally{world.dispose();}
  expect(()=>world.humanoid!.command({type:'space.set-drive-mode',mode:'assisted'})).toThrow();
 });
});

async function loadSpaceDriver(){
 const assetRoot=new URL('../../../../assets/three-creator/presets/humanoid/source/',import.meta.url);
 const entries=await Promise.all(['idle-loop','walk-loop','run-loop','climb-2m5'].map(async id=>{const gltf=await parseFixtureGlb(await readFile(new URL(`gasp-research/${id}.experimental.glb`,assetRoot)));return {id,clip:gltf.animations[0]!,model:gltf.scene};}));
 const gltf=await parseFixtureGlb(await readFile(new URL('uefn-mannequin-lod1.glb',assetRoot)));
 const seated=AnimationClip.parse(JSON.parse(await readFile(new URL('actions/sit-idle.clip.json',assetRoot),'utf8')));
 return new Character(new SourceCharacter(gltf.scene,[...entries,{id:'sit-idle',clip:seated}]));
}

// 实际可见人物、骨架与驾驶动作；只替代 Node 中的纹理解码。
it.each(['spacecraft','survey-spacecraft'])('keeps the fixed Source101 driver supported in %s through thrust and bank, with an eye camera',async id=>{
 const character=await loadSpaceDriver();
 const config={...SPECS.find(s=>s.id===id)!,spawn:[0,20,0] as [number,number,number]},model=buildSpaceModel(config);
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:character.root,animation:character},vehicles:[{instanceId:'craft',assetId:id,spec:config,object:model.root}]}});
 try{
  world.setCameraFollow({configuration:{...createHumanoidCameraDocument('person'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});const r=world.humanoid!;r.prepareEpisodeStart({positionWorldMetersXYZ:[0,20,0],facingYawRadians:-Math.PI,humanoid:{vehicleInstanceId:'craft',mounted:true,}});
  const fixedBones=new Map<string,number[]>();
  for(const input of [{},{forward:1,steer:-1},{forward:-1,steer:1,roll:1}]){
   world.step({humanoid:{...emptyInput(),...input}},30);model.root.updateMatrixWorld(true);character.root.updateMatrixWorld(true);
   const inverse=model.root.matrixWorld.clone().invert(),points:Vector3[]=[],pelvis=new Box3();
   character.root.traverse(o=>{if(!(o instanceof SkinnedMesh))return;const indices=o.geometry.getAttribute('skinIndex'),weights=o.geometry.getAttribute('skinWeight');
    for(let n=0;n<o.geometry.getAttribute('position').count;n++){const p=o.getVertexPosition(n,new Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse);points.push(p);for(let j=0;j<4;j++)if(weights.getComponent(n,j)>.5&&o.skeleton.bones[indices.getComponent(n,j)]?.name==='pelvis'){pelvis.expandByPoint(p);break;}}
   });
   const cushion=model.root.getObjectByName('seat-cushion')!;const top=cushion.position.y+.065;
   const floor=points.reduce((min,p)=>Math.min(min,p.y),Infinity);
   expect(pelvis.min.y-top).toBeGreaterThanOrEqual(0);expect(pelvis.min.y-top).toBeLessThan(.04);
   expect(floor).toBeGreaterThanOrEqual(.69);
   for(const x of [-.16,.16]){const sole=Math.min(...points.filter(p=>Math.abs(p.x-x)<.09&&Math.abs(p.z-.5)<.15).map(p=>p.y));expect(sole-.7025).toBeGreaterThanOrEqual(0);expect(sole-.7025).toBeLessThan(.01);}
   character.actor.traverse(n=>{if(n.type==='Bone'){n.updateMatrix();const values=n.matrix.toArray();if(!fixedBones.has(n.name))fixedBones.set(n.name,values);else values.forEach((v,k)=>expect(v,`${id}/${n.name} fixed pose`).toBeCloseTo(fixedBones.get(n.name)![k]!,5));}});
   world.setCameraView('first-person');const cameraDocument=world.inspectCamera().document!;world.setCameraFollow({configuration:{...cameraDocument,views:{...cameraDocument.views,'first-person':{kind:'first-person',overrides:{position:{subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0}}}}}});world.step({},1);const eye=new Vector3();expect(character.eyePosition(eye)).toBe(true);expect(world.camera.position.distanceTo(eye)).toBeLessThan(.003);world.setCameraView('third-person');
  }
 }finally{world.dispose();}
},30000);

it('registers a separate space training map with safe real berths and no foreign vehicle family',async()=>{
 const training=createSpaceTrainingMap();expect(getMap('space-training').name).toBe('太空 · 飞行训练场');
 const vehicles=SPECS.map(spec=>({instanceId:spec.id,assetId:spec.id,spec,object:new Group()}));
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:training,character:{instanceId:'person',object:new Group()},vehicles}});
 try{const r=world.humanoid!,sim=r.simulation;expect(sim.vehicles.filter(v=>sim.available(v)).map(v=>v.spec.id)).toEqual(['spacecraft','survey-spacecraft']);
  for(const id of ['spacecraft','survey-spacecraft']){
   const v=sim.vehicles.find(v=>v.spec.id===id)!,spawn=training.spawns.find(s=>s.vehicleId===id)!;
   expect(r.prepare(id,spawn)).toBe(true);expect(r.enter(id)).toBe(true);world.step({},60);
   expect(v.position.y).toBeCloseTo(.8,3);r.command({type:'space.dock',portId:'home'});world.step({},60);expect(spaceTelemetry(v)!.docking?.status).toBe('docked');
   expect(r.exit()).toBe(true);world.step({},60);expect(sim.controlledActor.player.position.y).toBeGreaterThan(-.1);
  }
  r.switchMap(getMap('campus'));expect(r.snapshot().mapId).toBe('campus');expect(r.simulation.vehicles.some(v=>v.spec.mode==='plane'&&r.simulation.available(v))).toBe(true);
 }finally{world.dispose();}
});


it('routes space commands and descriptors to the named mounted actor without changing the selected driver',async()=>{
 const training=createSpaceTrainingMap(),vehicles=SPECS.filter(spec=>spec.mode==='spacecraft').map(spec=>({instanceId:spec.id,assetId:spec.id,spec,object:new Group()}));
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:training,character:{instanceId:'player',object:new Group()},vehicles}});
 try{
  const runtime=world.humanoid!,character=await loadSpaceDriver();character.root.position.set(30,.04,0);world.addCharacter({id:'npc',humanoid:character});
  for(const [actorId,instanceId] of [['player','spacecraft'],['npc','survey-spacecraft']] as const){
   const spawn=training.spawns.find(spawn=>spawn.vehicleId===instanceId)!;
   runtime.command({type:'vehicle.prepare',actorId,instanceId,spawn});runtime.command({type:'vehicle.enter',actorId,instanceId});
  }
  world.step({},60);
  const playerShip=runtime.simulation.actor('player').vehicle!,npcShip=runtime.simulation.actor('npc').vehicle!;
  const originalPlayer=spaceTelemetry(playerShip),camera=world.camera.matrixWorld.clone();
  for(const type of ['space.set-drive-mode','space.dock'])expect(runtime.commandDescriptors('npc').find(command=>command.type===type)?.schema).toMatchObject({properties:{actorId:{const:'npc'}},required:expect.arrayContaining(['actorId'])});
  expect((await world.execute({type:'space.set-drive-mode',actorId:'npc',mode:'assisted'})).status).toBe('applied');
  expect(spaceTelemetry(npcShip)!.driveMode).toBe('assisted');expect(spaceTelemetry(playerShip)).toEqual(originalPlayer);
  expect((await world.execute({type:'space.dock',actorId:'npc',portId:'home'})).status).toBe('applied');
  expect(spaceTelemetry(npcShip)!.docking).toMatchObject({portId:'home'});expect(spaceTelemetry(playerShip)).toEqual(originalPlayer);
  expect(runtime.simulation.controlledActorId).toBe('player');expect(world.camera.matrixWorld.equals(camera)).toBe(true);
  const beforeInvalid=spaceTelemetry(npcShip);
  for(const command of [{type:'space.set-drive-mode',mode:'inertial'},{type:'space.dock',portId:null}] as const)expect((await world.execute({...command,actorId:'missing'})).status).toBe('rejected');
  expect(spaceTelemetry(npcShip)).toEqual(beforeInvalid);expect(spaceTelemetry(playerShip)).toEqual(originalPlayer);
  runtime.command({type:'vehicle.exit',actorId:'npc'});world.step({},60);
  const afterExit=spaceTelemetry(npcShip),playerAfterExit=spaceTelemetry(playerShip);
  for(const command of [{type:'space.set-drive-mode',mode:'inertial'},{type:'space.dock',portId:null}] as const)expect((await world.execute({...command,actorId:'npc'})).status).toBe('rejected');
  expect(spaceTelemetry(npcShip)).toEqual(afterExit);expect(spaceTelemetry(playerShip)).toEqual(playerAfterExit);
 }finally{world.dispose();}
});
