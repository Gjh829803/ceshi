import {createHumanoidCameraDocument} from '../config/camera/index';
import {createRoadVehicleSpec} from './road-vehicle';
import { CameraCollisionSolver } from '@worldkit/camera-collision';
import {describe,it,expect,vi,beforeAll} from 'vitest';
import {Group,PerspectiveCamera,Vector2,Vector3,Quaternion,Euler,Bone,BufferGeometry,Float32BufferAttribute,Uint16BufferAttribute,SkinnedMesh,Skeleton,PCFShadowMap,type WebGLRenderer} from 'three';
import {createMountedFixture} from './mounted-test-fixture';
import {FirstPersonBody} from './first-person-body';
import RAPIER from '@dimforge/rapier3d-compat';
import type {WorldEngine} from '../engine';
import type {WorldObservation} from '../contracts';
import {createWorld} from '../world';
import {ThreePhysics} from '../physics';
import {emptyInput} from './simulation';
import {Simulation} from './simulation';
import {createRoadPhysicsProfile} from './motion-families/ground-vehicle/wheel-physics';
import {VehicleConditionTracker} from './vehicle-condition';
import type {EnvironmentDefinition} from './environment/types';
import {EnvironmentQueries} from './environment/queries';
import type {VehicleSpec} from './config';
import {WorldKeyboard} from '../input';
import {MOUNTED_CAMERA_PITCH_RATIO,DEFAULT_KEY_BINDINGS,createKeyBindings,controlHints,readControls,vehicleKeyboardAxes,cameraKeyboardPitchRatio,type MountedInputContext} from './input';
import {AIRCRAFT_SUBTYPES} from '../config/aircraft';
import {ACTION_TUNING} from './humanoid/action-schema';
import {createFlyingCreatureSpec} from './motion-families/flying-creature/controller';
import type {MovementSettings} from '../config/control';
const map:EnvironmentDefinition={id:'test',name:'Test',description:'',bounds:{min:[-100,-10,-100],max:[100,50,100]},boxes:[{id:'ground',position:[0,-.5,0],size:[200,1,200]},{id:'wall',position:[0,2,10],size:[30,4,1]}],water:[],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[100,100],color:'#aaa',modes:['wheeled']}],spawns:[{id:'car',name:'Car',vehicleId:'car',position:[-20,.03,0],yaw:0,regionId:'road'}],playerSpawn:[0,.03,0]};
const spec:VehicleSpec={id:'car',name:'Car',en:'CAR',mode:'wheeled',kernel:'test',color:'#fff',spawn:[-20,.03,0],yaw:0,speed:28,accel:10,grip:11,steer:1,radius:1.65,seat:[0,1,0],hint:'',archetype:'rover',envelope:{kind:'box',halfExtents:[1.35,1.15,2.15],offset:[0,1.15,0]}};
async function fixture(renderer?:WebGLRenderer){return createWorld({...(renderer?{renderer}:{}),camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'car-1',assetId:'car',spec,object:new Group()},{instanceId:'car-2',assetId:'car',spec:{...spec,spawn:[-40,.03,0]},object:new Group()}]}});}
describe('SDK humanoid runtime',()=>{
 const contexts:MountedInputContext[]=[...(['wheeled','bus','tank','motorcycle','unicycle','skateboard','sled','ski','hover','paddled_boat','boat','submarine','glider','spacecraft','mount','carriage','dragon'] as const).map(mode=>({mode})),{mode:'plane'},...AIRCRAFT_SUBTYPES.map(aircraftSubtype=>({mode:'plane' as const,aircraftSubtype}))];
 it.each(contexts)('decouples default and rebound posture/observation for $mode $aircraftSubtype',context=>{
  const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidContext(()=>context);keyboard.enabled=true;
  const pitch=['dragon','submarine','spacecraft'].includes(context.mode)||context.mode==='plane'&&[undefined,'fixed-wing','pusher'].includes(context.aircraftSubtype);
  const roll=['tank','hover','spacecraft'].includes(context.mode)||context.mode==='plane'&&['helicopter','multirotor','tiltrotor'].includes(context.aircraftSubtype??'');
  const fixed=context.mode==='plane'&&[undefined,'fixed-wing','pusher'].includes(context.aircraftSubtype);
  expect(vehicleKeyboardAxes(context).pitch).toBe(pitch);
  for(const rebound of [false,true]){
   keyboard.setKeyBindings(rebound?{pitchDown:['KeyI'],pitchUp:['KeyK'],fixedWingPitchDown:['KeyI'],fixedWingPitchUp:['KeyK'],rollLeft:['KeyJ'],rollRight:['KeyL'],cameraUp:['KeyU'],cameraDown:['KeyO']}:{});
   const [down,up,left,right,lookUp,lookDown]=rebound?['KeyI','KeyK','KeyJ','KeyL','KeyU','KeyO']:[fixed?'KeyQ':'KeyC',fixed?'KeyE':'Space','KeyZ','KeyX','ArrowUp','ArrowDown'];
   keyboard.keyDown(down!);expect(keyboard.sample()).toMatchObject({cameraPitchRatio:0,humanoid:{pitch:pitch?1:0,roll:0}});
   keyboard.keyDown(up!);expect(keyboard.sample().humanoid?.pitch).toBe(0);
   keyboard.keyUp(down!);keyboard.keyDown(lookDown!);
   expect(keyboard.sample()).toMatchObject({cameraPitchRatio:cameraKeyboardPitchRatio(context),humanoid:{pitch:pitch?-1:0,roll:0}});
   keyboard.keyUp(up!);keyboard.keyDown(lookUp!);expect(keyboard.sample()).toMatchObject({cameraPitchRatio:0,humanoid:{pitch:0}});
   keyboard.clear();keyboard.keyDown(left!);
   expect(keyboard.sample().humanoid).toMatchObject({pitch:0,roll:roll?-1:0,...(context.mode==='dragon'?{secondary:true}:{})});
   keyboard.keyDown(right!);expect(keyboard.sample().humanoid?.roll).toBe(0);
   keyboard.keyUp(left!);expect(keyboard.sample().humanoid?.roll).toBe(roll?1:0);
   keyboard.clear();expect(keyboard.sample()).toMatchObject({cameraPitchRatio:0,humanoid:{pitch:0,roll:0}});
  }
 });
 it('keeps foot Q/Z actions separate and clears posture keys on rebinding and dismount',()=>{
  let context:MountedInputContext|undefined={mode:'spacecraft'};
  const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidContext(()=>context);keyboard.enabled=true;
  keyboard.keyDown('KeyC');keyboard.keyDown('KeyZ');expect(keyboard.sample().humanoid).toMatchObject({pitch:1,roll:-1});
  context=undefined;expect(keyboard.sample().humanoid).toMatchObject({pitch:0,roll:0,actions:{}});
  keyboard.keyDown('KeyQ');keyboard.keyDown('KeyZ');expect(keyboard.sample().humanoid?.actions).toMatchObject({roll:true,prone:true});
  expect(keyboard.sample().humanoid?.actions).toEqual({});
  context={mode:'spacecraft'};keyboard.keyDown('KeyC');keyboard.setKeyBindings({pitchDown:[],rollLeft:[]});
  expect(keyboard.sample().humanoid).toMatchObject({pitch:0,roll:0});keyboard.keyDown('KeyC');keyboard.keyDown('KeyZ');expect(keyboard.held.size).toBe(0);
  keyboard.keyDown('Space');keyboard.keyDown('KeyX');expect(keyboard.sample().humanoid).toMatchObject({pitch:-1,roll:1});
 });
 it('preserves a released Q takeoff edge for dragons without changing other vehicle controls',()=>{
  const released=new Set<string>();
  expect(readControls(released,true,true,{},DEFAULT_KEY_BINDINGS,{mode:'dragon'})).toMatchObject({jump:true,brake:false});
  expect(readControls(released,true,false,{},DEFAULT_KEY_BINDINGS,{mode:'dragon'}).jump).toBe(false);
  for(const mode of ['plane','wheeled'] as const)expect(readControls(released,true,true,{},DEFAULT_KEY_BINDINGS,{mode}).jump).toBe(false);
 });
 it('allows disjoint key reuse and rejects conflicts in every active context',()=>{
  expect(createKeyBindings().slow).toEqual(['ControlLeft','ControlRight']);
  expect(()=>createKeyBindings({ascend:['KeyQ'],roll:['KeyQ'],rollLeft:['KeyZ'],prone:['KeyZ']})).not.toThrow();
  expect(()=>createKeyBindings({descend:['KeyZ']})).toThrow('KEY_BINDING_CONFLICT');
  expect(()=>createKeyBindings({descend:['KeyQ']})).toThrow('KEY_BINDING_CONFLICT');
  expect(()=>createKeyBindings({pitchUp:['ArrowUp']})).toThrow('KEY_BINDING_CONFLICT');
  expect(()=>createKeyBindings({pitchUp:['KeyX']})).toThrow('KEY_BINDING_CONFLICT');
  expect(()=>createKeyBindings({rollRight:['KeyF']})).toThrow('KEY_BINDING_CONFLICT');
  const bindings=createKeyBindings();expect(Object.isFrozen(bindings.descend)).toBe(true);
 });
 it.each([{mode:'dragon'},{mode:'submarine'},{mode:'spacecraft'},...['helicopter','multirotor','tiltrotor','balloon'].map(aircraftSubtype=>({mode:'plane',aircraftSubtype}))] as MountedInputContext[])('uses Q/E lift independently of pitch, including rebound and released takeoff edges: $mode $aircraftSubtype',context=>{
  const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidContext(()=>context);keyboard.enabled=true;
  for(const rebound of [false,true]){
   keyboard.setKeyBindings(rebound?{ascend:['KeyI'],descend:['KeyK']}:{});
   const up=rebound?'KeyI':'KeyQ',down=rebound?'KeyK':'KeyE';
   keyboard.keyDown(up);expect(keyboard.sample().humanoid).toMatchObject({lift:1,pitch:0,jump:context.mode==='dragon'});
   expect(keyboard.sample().humanoid).toMatchObject({lift:1,jump:false});
   keyboard.keyDown(down);expect(keyboard.sample().humanoid?.lift).toBe(0);
   keyboard.keyUp(up);expect(keyboard.sample().humanoid?.lift).toBe(-1);keyboard.clear();
   keyboard.keyDown(up);keyboard.keyUp(up);expect(keyboard.sample().humanoid).toMatchObject({lift:0,jump:context.mode==='dragon'});
   expect(keyboard.sample().humanoid?.jump).toBe(false);
   keyboard.keyDown('Space');expect(keyboard.sample().humanoid).toMatchObject({lift:0,jump:false,pitch:vehicleKeyboardAxes(context).pitch?-1:0});keyboard.clear();
  }
 });
 it('separates mounted brake, lift, unused keys and camera by subtype',()=>{
  const read=(mode:VehicleSpec['mode'],keys:string[],aircraftSubtype?:VehicleSpec['aircraftSubtype'])=>readControls(new Set(keys),true,false,{},undefined,{mode,aircraftSubtype});
  expect(read('wheeled',['ControlLeft','KeyC','KeyQ','KeyE'])).toMatchObject({slow:true,brake:false,lift:0,roll:0});
  expect(read('submarine',['ControlLeft','Space','ArrowUp','KeyQ','KeyX'])).toMatchObject({slow:true,brake:false,lift:1,pitch:-1,roll:0});
  expect(read('plane',['KeyW','KeyS','KeyA','KeyD','ShiftLeft','KeyQ','ControlLeft','Space','ArrowUp'],'balloon')).toMatchObject({forward:0,steer:0,boost:false,slow:false,roll:0,lift:1,pitch:0});
  expect(read('plane',['KeyC'],'fixed-wing')).toMatchObject({lift:0,slow:false,pitch:0,brake:false});
  expect(read('plane',['KeyQ'],'fixed-wing')).toMatchObject({pitch:1,lift:0});
  expect(read('plane',['KeyE'],'fixed-wing')).toMatchObject({pitch:-1,lift:0});
  expect(read('plane',['Space','KeyQ','KeyE'],'pusher')).toMatchObject({pitch:0,lift:0,brake:true});
  expect(read('plane',['Space','KeyC'],'helicopter')).toMatchObject({pitch:0,lift:0,brake:false});
  expect(read('plane',['KeyC'],'glider')).toMatchObject({lift:-1,slow:false});
  expect(read('plane',['Space','KeyC','KeyQ','KeyE'],'wingsuit')).toMatchObject({pitch:0,lift:-1,brake:false});
  const airbrake=createKeyBindings({airbrake:['KeyB']});
  expect(readControls(new Set(['KeyC']),true,false,{},airbrake,{mode:'glider'}).lift).toBeCloseTo(0);
  expect(readControls(new Set(['KeyB']),true,false,{},airbrake,{mode:'glider'}).lift).toBe(-1);
  expect(read('spacecraft',['ShiftLeft','ArrowRight','Space'])).toMatchObject({boost:false,strafe:0,lift:0,pitch:-1,brake:false});
  expect(read('dragon',['KeyE','KeyQ'])).toMatchObject({secondary:false,roll:0,pitch:0});
  expect(read('dragon',['KeyZ'])).toMatchObject({secondary:true,roll:0,pitch:0});
  expect(read('dragon',['KeyE']).primary).toBeUndefined();
 });
 it('keeps wingsuit walking jump separate from a new canopy press and allows sustained canopy braking',()=>{
  let context:MountedInputContext={mode:'plane',aircraftSubtype:'wingsuit',instanceId:'suit',groundLocomotion:true};
  const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidContext(()=>context);keyboard.enabled=true;
  keyboard.keyDown('KeyW');keyboard.keyDown('Space');keyboard.keyDown('ShiftLeft');
  expect(keyboard.sample().humanoid).toMatchObject({forward:1,jump:true,brake:false,boost:true});
  context={...context,groundLocomotion:false};
  expect(keyboard.sample().humanoid).toMatchObject({forward:1,jump:false,brake:false,boost:false});
  keyboard.keyUp('Space');keyboard.keyDown('Space');expect(keyboard.sample().humanoid?.brake).toBe(true);
  expect(keyboard.sample().humanoid?.brake).toBe(false);
  context={...context,canopyDeployed:true};expect(keyboard.sample().humanoid?.brake).toBe(true);
  keyboard.keyUp('Space');expect(keyboard.sample().humanoid?.brake).toBe(false);
 });
 it('counts reset hold only on fixed ticks and cancels it on release or context change',()=>{
  let resets=0,mounted=true;const keyboard=new WorldKeyboard(()=>0,()=>resets++);
  keyboard.setHumanoidContext(()=>mounted?{mode:'wheeled'}:undefined);keyboard.enabled=true;
  keyboard.keyDown('Backspace');for(let n=0;n<200;n++)keyboard.sample();expect(resets).toBe(0);
  for(let n=0;n<47;n++)expect(keyboard.advanceReset(1/60)).toBe(false);
  expect(keyboard.advanceReset(1/60)).toBe(true);expect(resets).toBe(1);
  keyboard.keyDown('Backspace',true);for(let n=0;n<60;n++)keyboard.advanceReset(1/60);expect(resets).toBe(1);
  keyboard.keyUp('Backspace');keyboard.keyDown('Backspace');keyboard.advanceReset(.7);keyboard.keyUp('Backspace');keyboard.keyDown('Backspace');keyboard.advanceReset(.2);expect(resets).toBe(1);
  mounted=false;keyboard.keyDown('Backspace');expect(keyboard.advanceReset(.7)).toBe(false);expect(keyboard.advanceReset(.1)).toBe(true);expect(resets).toBe(2);
  keyboard.keyDown('Backspace');keyboard.advanceReset(.7);keyboard.clear();keyboard.advanceReset(.2);expect(resets).toBe(2);
 });
 it('clears held movement and reset when switching between two instances of the same mode',()=>{
  let instanceId='car-1',resets=0;const keyboard=new WorldKeyboard(()=>0,()=>resets++);
  keyboard.setHumanoidContext(()=>({mode:'wheeled',instanceId}));keyboard.enabled=true;
  keyboard.keyDown('KeyW');keyboard.keyDown('Backspace');keyboard.advanceReset(.7);
  instanceId='car-2';expect(keyboard.sample().humanoid?.forward).toBe(0);keyboard.advanceReset(.2);expect(resets).toBe(0);
  keyboard.keyDown('KeyW',true);expect(keyboard.sample().humanoid?.forward).toBe(0);
  keyboard.keyUp('KeyW');keyboard.keyDown('KeyW');expect(keyboard.sample().humanoid?.forward).toBe(1);
 });
 it('sends F to one interaction owner and does not fire or reboard on a held key',async()=>{
  const world=await fixture();try{
   const engine=(world as unknown as {engine:WorldEngine}).engine,r=world.humanoid!,actor=r.simulation.controlledActor;
   r.approach('car-1');const interact=vi.spyOn(actor.controller,'setMounted');engine.keyboard.enabled=true;
   engine.keyboard.keyDown('KeyF');engine.advance(1/60);expect(r.snapshot().mountedInstanceId).toBe('car-1');expect(interact).toHaveBeenCalledTimes(1);
   engine.advance(.25);engine.keyboard.keyDown('KeyF',true);engine.advance(.25);expect(interact).toHaveBeenCalledTimes(1);
   engine.keyboard.keyUp('KeyF');engine.keyboard.keyDown('KeyF');engine.advance(1/60);expect(r.snapshot().mountedInstanceId).toBeNull();expect(interact).toHaveBeenCalledTimes(2);
  }finally{world.dispose();}
 });
 it('prioritizes vehicle recovery on F before enter and exit',async()=>{
  const world=await fixture();try{
   const engine=(world as unknown as {engine:WorldEngine}).engine,r=world.humanoid!,v=r.simulation.vehicles[0]!;
   r.approach('car-1');v.rotation.setFromAxisAngle(new Vector3(0,0,1),Math.PI);v.grounded=false;
   expect(r.snapshot().vehicleDynamics[0]).toMatchObject({condition:'flipped',recoveryAvailable:true});
   engine.keyboard.enabled=true;engine.keyboard.keyDown('KeyF');engine.advance(1/60);
   expect(r.snapshot().mountedInstanceId).toBeNull();expect(r.snapshot().vehicleDynamics[0]?.recoveryAvailable).toBe(false);
   engine.keyboard.keyUp('KeyF');engine.keyboard.keyDown('KeyF');engine.advance(1/60);
   expect(r.snapshot().mountedInstanceId).toBe('car-1');
   r.simulation.controlledActor.transition=0;engine.keyboard.keyUp('KeyF');engine.keyboard.keyDown('KeyF');engine.advance(1/60);
   expect(r.snapshot().mountedInstanceId).toBeNull();
   expect(r.snapshot().vehicleDynamics[0]?.recoveryAvailable).toBe(false);
   v.rotation.setFromAxisAngle(new Vector3(0,0,1),Math.PI);v.grounded=false;
   engine.keyboard.keyUp('KeyF');engine.keyboard.keyDown('KeyF');engine.advance(1/60);
   expect(r.snapshot().mountedInstanceId).toBeNull();expect(r.snapshot().vehicleDynamics[0]?.recoveryAvailable).toBe(false);
  }finally{world.dispose();}
 });
 it('reports sustained wall obstruction as stuck but leaves a parked vehicle normal',async()=>{
  const world=await fixture();try{
   const r=world.humanoid!,v=r.simulation.vehicles[0]!;
   expect(r.snapshot().vehicleDynamics[0]).toMatchObject({condition:'normal',recoveryAvailable:false});
   r.approach('car-1');expect(r.enter('car-1')).toBe(true);v.position.set(0,.03,8.5);v.rotation.identity();r.simulation.syncActorBodies();
   world.step({humanoid:{...emptyInput(),forward:1}},60);
   expect(r.snapshot().vehicleDynamics[0]).toMatchObject({condition:'stuck',recoveryReason:'blocked',recoveryAvailable:true});
   world.step({humanoid:emptyInput()},1);
   expect(r.snapshot().vehicleDynamics[0]).toMatchObject({condition:'stuck',recoveryAvailable:true});
  }finally{world.dispose();}
 });
 it('treats a partially fallen motorcycle as flipped but keeps an airborne one airborne',()=>{
  const q=new EnvironmentQueries({...map,regions:[{...map.regions[0]!,modes:['wheeled','motorcycle']}]});
  const sim=new Simulation(q,[{...spec,id:'motorcycle',mode:'motorcycle',archetype:'motorcycle',wheelPhysics:createRoadPhysicsProfile('motorcycle')}],{id:'player'});try{
   const v=sim.vehicles[0]!;v.position.set(0,.6,0);v.grounded=true;v.rotation.setFromAxisAngle(new Vector3(0,0,1),.6);
   expect(sim.vehicleCondition(v)).toMatchObject({condition:'flipped',recoveryAvailable:true});
   v.position.y=8;v.grounded=false;expect(sim.vehicleCondition(v)).toMatchObject({condition:'airborne',recoveryAvailable:false});
  }finally{sim.dispose();q.dispose();}
 });
 it('offers recovery for an aircraft that is airborne on paper but remains immobile under input',()=>{
  const q=new EnvironmentQueries({...map,regions:[{...map.regions[0]!,modes:['plane']}],spawns:[{...map.spawns[0]!,vehicleId:'plane',position:[0,8,0]}]});
  const sim=new Simulation(q,[{...spec,id:'plane',mode:'plane',archetype:'plane',spawn:[0,8,0]}],{id:'player'});try{
   const v=sim.vehicles[0]!;v.position.set(0,8,0);v.grounded=false;v.launched=true;v.velocity.set(0,0,0);
   const tracker=new VehicleConditionTracker();
   for(let i=0;i<6;i++)tracker.update(v,{...emptyInput(),forward:1},.1,q);
   expect(tracker.inspect(v,q)).toMatchObject({condition:'stuck',recoveryReason:'blocked',recoveryAvailable:true});
   tracker.reset(v);expect(tracker.inspect(v,q)).toMatchObject({condition:'airborne',recoveryAvailable:false});
  }finally{sim.dispose();q.dispose();}
 });
 it('commits the reset hold only after live fixed ticks, not observations or explicit Episode-style input',async()=>{
  const world=await fixture();try{
   const engine=(world as unknown as {engine:WorldEngine}).engine,r=world.humanoid!;
   r.approach('car-1');expect(r.enter('car-1')).toBe(true);engine.keyboard.enabled=true;
   const ticks:number[]=[];engine.setResetHandler(()=>ticks.push(world.simulationTick));
   engine.keyboard.keyDown('Backspace');const before=world.simulationTick;
   for(let n=0;n<100;n++){world.snapshot();engine.advance(0);}
   expect(ticks).toEqual([]);
   for(let n=0;n<48;n++)engine.advance(1/60,{});
   expect(ticks).toEqual([]);
   for(let n=0;n<47;n++)engine.advance(1/60);
   expect(ticks).toEqual([]);engine.advance(1/60);
   expect(ticks).toEqual([before+96]);
   for(let n=0;n<60;n++)engine.advance(1/60);
   expect(ticks).toHaveLength(1);
  }finally{world.dispose();}
 });
 it('does not fall through from a rejected scene interaction to a nearby vehicle on F',async()=>{
  const world=await fixture();try{
   const r=world.humanoid!;r.approach('car-1');
   const p=r.simulation.controlledActor.player.position.toArray();
   r.switchMap({...map,interactions:[{id:'seat',label:'Seat',kind:'seat',slotId:'seat',position:[p[0],p[1]+.5,p[2]],approach:p,yaw:0}]});r.approach('car-1');
   const actor=r.simulation.controlledActor;actor.controller.setAvailableClips(new Set(),[]);
   expect(actor.nearest()).toBeGreaterThanOrEqual(0);expect(actor.controller.skills.nearest()).not.toBeNull();
   const enter=vi.spyOn(actor,'interact');world.step({interactPressed:true},1);
   expect(enter).not.toHaveBeenCalled();expect(r.snapshot().mountedInstanceId).toBeNull();
   expect(r.inspectControls().lastApplied?.input.actions?.interact).toBe(true);
  }finally{world.dispose();}
 });
 it('invalidates measured wheel evidence on reset while retaining the world physics sequence',async()=>{
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,
   character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'road',assetId:'custom.car',spec:createRoadVehicleSpec('car'),object:new Group()}]}});
  try{
   expect(world.inspectVehicles({detail:'wheels'}).vehicles[0]).toMatchObject({sample:{status:'unmeasured'},wheels:null});
   world.step({},3);const measured=world.inspectVehicles({detail:'wheels'});
   expect(measured.physicsStepSequence).toBe(6);expect(measured.vehicles[0]!.sample).toMatchObject({status:'sampled',solver:{physicsStepSequence:6,phase:'pre-integration',deltaSeconds:1/120}});
   await world.reset();expect(world.inspectVehicles({detail:'wheels'}).vehicles[0]).toMatchObject({sample:{status:'unmeasured'},wheels:null});
  }finally{world.dispose();}
 });

 it('filters opt-in vehicle observations and preserves pause, reset and returned copies',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{
   const before=world.snapshot();
   expect(world.inspectVehicles({entityIds:[]}).vehicles).toEqual([]);
   expect(world.inspectVehicles({query:'car-2'}).vehicles.map(v=>v.instanceId)).toEqual(['car-2']);
   const result=world.inspectVehicles({entityIds:['car-1'],detail:'wheels'});
   expect(result.vehicles).toHaveLength(1);expect(result.vehicles[0]!.wheels).toBeNull();
   result.vehicles[0]!.instanceId='changed';
   expect(world.inspectVehicles({entityIds:['car-1']}).vehicles[0]!.instanceId).toBe('car-1');
   expect(world.snapshot()).toEqual(before);
   world.step({},2);expect(world.inspectVehicles().simulationTick).toBe(2);
   await world.reset();expect(world.inspectVehicles()).toMatchObject({simulationTick:0,isRunning:false});
  }finally{world.dispose();}
 });

 it('rejects the old nested action field and exposes the new action contract',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{
   const runtime=world.humanoid!;
   expect(()=>runtime.setInput({...emptyInput(),humanoid:{prone:true}} as never)).toThrow('HUMANOID_INPUT_INVALID');
   expect(runtime.inputGuide().fields).toHaveProperty('actions');
   expect(runtime.episodeCapabilities().inputAxes).toContain('actions');
   expect(runtime.episodeCapabilities().inputAxes).not.toContain('humanoid');
  }finally{world.dispose();}
 });
 it('exposes in-place recovery through the command path without changing driver or camera mode',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!;
   expect(()=>runtime.command({type:'vehicle.recover'})).toThrow('HUMANOID_COMMAND_BLOCKED');
   runtime.approach('car-1');expect(runtime.enter('car-1')).toBe(true);world.setCameraView('shoulder');
   const v=runtime.simulation.controlledActor.vehicle!;v.position.set(-20,2,-20);v.rotation.setFromAxisAngle(new Vector3(0,0,1),Math.PI);v.velocity.set(2,0,3);
   runtime.command({type:'vehicle.recover'});expect(v.position.x).toBe(-20);expect(v.position.z).toBe(-20);expect(v.velocity.length()).toBe(0);
   expect(runtime.snapshot().mountedInstanceId).toBe('car-1');expect(world.snapshot().camera.viewKind).toBe('shoulder');
  }finally{world.dispose();}
 });
 it('reports a real boarding approach and the same enter eligibility without moving or clearing failure state',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const r=world.humanoid!,s=r.simulation;
   world.step({});const before=world.getEntityState('player');const time=s.time;s.controlledActor.message='preserve observation state';
   const far=r.inspectBoarding('car-1');expect(far).toMatchObject({eligible:false,reason:'VEHICLE_MOUNT_OUT_OF_REACH'});expect(far.approachPositionWorldMetersXYZ).not.toBeNull();
   expect(world.getEntityState('player')).toEqual(before);expect(s.time).toBe(time);expect(s.controlledActor.message).toBe('preserve observation state');
   r.approach('car-1');expect(world.getEntityState('player').positionWorldMetersXYZ).toEqual(far.approachPositionWorldMetersXYZ);
   expect(r.inspectBoarding('car-1').eligible).toBe(true);expect(r.enter('car-1')).toBe(true);
   expect(r.inspectBoarding('car-2')).toMatchObject({eligible:false,reason:'HUMANOID_TRANSITION_ACTIVE'});
   world.step({},31);expect(r.inspectBoarding('car-2')).toMatchObject({eligible:false,reason:'HUMANOID_ALREADY_MOUNTED'});
  }finally{world.dispose();}
 });

 it('shares mounted boarding eligibility with execution and keeps the query read-only',async()=>{
  const world=await createMountedFixture();try{const r=world.humanoid!,s=r.simulation;
   expect(r.inspectBoarding('horse-1').eligible).toBe(true);
   s.controlledActor.controller.position.set(0,.025,2.4);const before=world.snapshot();
   expect(r.inspectBoarding('horse-1')).toMatchObject({eligible:false,reason:'VEHICLE_MOUNT_SIDE_REQUIRED'});
   expect(world.snapshot()).toEqual(before);expect(r.enter('horse-1')).toBe(false);expect(s.controlledActor.failureCode).toBe('VEHICLE_MOUNT_SIDE_REQUIRED');
  }finally{world.dispose();}
 });


 it('preserves humanoid and vehicle camera defaults after unrelated profiles, distance, reset and map replacement',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const r=world.humanoid!;world.step({});expect(r.camera.fov).toBe(58);
   r.applyProfile({character:{speed:5}});world.step({});expect(r.camera.fov).toBe(58);
   await world.reset();expect(r.camera.fov).toBe(58);r.switchMap(map);expect(r.camera.fov).toBe(58);
   r.approach('car-1');r.enter('car-1');world.step({},180);expect(r.camera.fov).toBeCloseTo(58,2);
  }finally{world.dispose();}
 });
 it('observes input precedence, consumed one-shots and source time without advancing or exposing mutable inputs',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const r=world.humanoid!;
   expect(r.inspectControls()).toEqual({override:null,lastApplied:null});
   const release=r.setInput({...emptyInput(),forward:.4,jump:true,actions:{toggleCrouch:true}}) as ()=>void;
   r.command({type:'humanoid.set-input',input:{...emptyInput(),forward:.8,jump:true,actions:{toggleCrouch:true}}});release();
   expect(r.inspectControls().override).toMatchObject({source:'humanoid.set-input',input:{forward:.8,jump:true}});
   const before=world.snapshot();r.inspectControls();expect(world.snapshot()).toEqual(before);
   world.step({humanoid:{...emptyInput(),forward:-1}});
   const observed=r.inspectControls();expect(observed.lastApplied).toMatchObject({source:'humanoid.set-input',simulationSeconds:1/60,input:{forward:.8,jump:true,actions:{toggleCrouch:true}}});
   expect(observed.override).toMatchObject({input:{forward:.8,jump:false,actions:{}}});
   observed.override!.input.forward=-1;observed.lastApplied!.input.actions!.toggleCrouch=false;
   expect(r.inspectControls().override!.input.forward).toBe(.8);expect(r.inspectControls().lastApplied!.input.actions!.toggleCrouch).toBe(true);
   r.command({type:'humanoid.set-input',input:null});expect(r.inspectControls()).toEqual({override:null,lastApplied:null});
   world.step({humanoid:{...emptyInput(),forward:-.3}});expect(r.inspectControls().lastApplied).toMatchObject({source:'world.humanoid',input:{forward:-.3}});
   world.step({moveZRatio:-.5});expect(r.inspectControls().lastApplied).toMatchObject({source:'world-input',input:{forward:.5}});
   r.clearInput();expect(r.inspectControls()).toEqual({override:null,lastApplied:null});
   const releaseCurrent=r.setInput({...emptyInput(),steer:.6}) as ()=>void;world.step({});expect(r.inspectControls().lastApplied!.source).toBe('setInput');releaseCurrent();expect(r.inspectControls()).toEqual({override:null,lastApplied:null});
   r.setInput(emptyInput());world.step({});await world.reset();expect(r.inspectControls()).toEqual({override:null,lastApplied:null});
   world.step({});r.switchMap(map);expect(r.inspectControls()).toEqual({override:null,lastApplied:null});
  }finally{world.dispose();}
 });

 it('describes the active input family without advancing or mutating the simulation',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const r=world.humanoid!,before=world.snapshot();
   expect(world.describe().humanoid!.inputGuide).toMatchObject({family:'character',fields:{boost:expect.stringContaining('sprint')}});
   expect(world.snapshot()).toEqual(before);
   r.approach('car-1');r.enter('car-1');
   expect(world.describe().humanoid!.inputGuide).toMatchObject({family:'wheeled',fields:{boost:expect.stringContaining('maxSpeed')}});
   const guide=r.inputGuide();(guide.fields as Record<string,string>).boost='changed';expect(r.inputGuide().fields.boost).toContain('maxSpeed');
   const schema=r.commandDescriptors('player').find(c=>c.type==='humanoid.set-input')!.schema as any;
   expect(schema.properties.input.anyOf[0].properties.pitch.description).toContain('Ignored');
   expect(schema.properties.input.anyOf[0].properties.boost.description).toContain('maxSpeed');
   world.step({},90);expect(r.exit()).toBe(true);expect(r.inputGuide().family).toBe('character');
  }finally{world.dispose();}
 });


 it('returns truthful relocation feedback and replays approach receipts without moving twice',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{
   const receipt=await world.execute({type:'vehicle.approach',instanceId:'car-1'},{commandId:'approach-once'});
   expect(receipt).toMatchObject({status:'applied',result:{kind:'relocation',entityId:'player',vehicleInstanceId:'car-1',positionWorldMetersXYZ:world.getEntityState('player').positionWorldMetersXYZ}});
   const before=world.snapshot();expect(await world.execute({type:'vehicle.approach',instanceId:'car-1'},{commandId:'approach-once'})).toEqual(receipt);expect(world.snapshot()).toEqual(before);
   expect(await world.execute({type:'vehicle.approach',instanceId:'missing'})).toMatchObject({status:'rejected'});
  }finally{world.dispose();}
 });

 it('persists the configured default view while keyboard permission leaves programmatic modes available',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{
   world.setCameraView('first-person');const initial=world.inspectCamera().document!;world.setCameraFollow({configuration:{...initial,defaultViewId:'first-person'}});world.step({},0);
   world.step({cameraTogglePressed:true},3);expect(world.inspectCamera().resolved?.kind).toBe('shoulder');
   world.setCameraFollow({configuration:{...world.inspectCamera().document!,input:{cycleViewIds:[]}}});world.step({cameraTogglePressed:true});expect(world.inspectCamera().resolved?.kind).toBe('shoulder');
   world.setCameraView('third-person');expect(world.inspectCamera().resolved?.kind).toBe('third-person');await world.reset();expect(world.inspectCamera().resolved?.kind).toBe('first-person');
  }finally{world.dispose();}
 });
 it('keeps camera toggle edges across short frames and consumes them once in multi-tick frames',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const r=world.humanoid!,engine=(world as unknown as {engine:WorldEngine}).engine;
   world.setCameraFollow({configuration:{...world.inspectCamera().document!,input:{cycleViewIds:['third-person','first-person','shoulder']}}});
   engine.advance(1/120,{cameraTogglePressed:true});expect(world.snapshot().camera.viewKind).toBe('third-person');
   engine.advance(1/120,{});expect(world.snapshot().camera.viewKind).toBe('first-person');
   engine.advance(3/60,{cameraTogglePressed:true});expect(world.snapshot().camera.viewKind).toBe('shoulder');
   engine.advance(1/60,{cameraTogglePressed:true});expect(world.snapshot().camera.viewKind).toBe('third-person');
   engine.advance(1/120,{cameraTogglePressed:true});world.stop();world.step({});expect(world.snapshot().camera.viewKind).toBe('third-person');
   world.useAuthoredCamera();world.step({cameraTogglePressed:true});expect(r.cameraMode).toBe('authored');
  }finally{world.dispose();}
 });
 it('maps one configurable camera key edge without toggling on repeat or after clearing',()=>{
  const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidContext(()=>undefined);keyboard.enabled=true;
  keyboard.keyDown('KeyV');expect(keyboard.sample().cameraTogglePressed).toBe(true);
  keyboard.keyDown('KeyV',true);expect(keyboard.sample().cameraTogglePressed).toBe(false);
  keyboard.keyUp('KeyV');keyboard.keyDown('KeyV');keyboard.clear();expect(keyboard.sample().cameraTogglePressed).toBe(false);
  keyboard.setKeyBindings({cameraToggle:['KeyT']});keyboard.keyDown('KeyV');expect(keyboard.sample().cameraTogglePressed).toBe(false);
  keyboard.keyDown('KeyT');expect(keyboard.sample().cameraTogglePressed).toBe(true);
 });
 it.each([false,true])('cycles V through all three views once per press while mounted=%s',async mounted=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const r=world.humanoid!;
   world.setCameraFollow({configuration:{...world.inspectCamera().document!,input:{cycleViewIds:['third-person','first-person','shoulder']}}});
   if(mounted){r.approach('car-1');expect(r.enter('car-1')).toBe(true);world.step({},31);}
   const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidContext(()=>mounted?{mode:'wheeled'}:undefined);keyboard.enabled=true;
   for(const expected of [1,2,0,1]){
    keyboard.keyDown('KeyV');world.step(keyboard.sample(),3);expect(world.snapshot().camera.viewKind).toBe(['third-person','first-person','shoulder'][expected]);
    keyboard.keyDown('KeyV',true);world.step(keyboard.sample());expect(world.snapshot().camera.viewKind).toBe(['third-person','first-person','shoulder'][expected]);
    keyboard.keyUp('KeyV');
   }
  }finally{world.dispose();}
 });
 it('preserves authored camera ownership across map replacement and reset with a saved first-person preference',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const r=world.humanoid!;
   world.setCameraFollow({configuration:{...world.inspectCamera().document!,defaultViewId:'first-person',input:{cycleViewIds:['third-person','first-person','shoulder']}}});world.useAuthoredCamera();
   r.switchMap(map);expect(r.cameraMode).toBe('authored');
   world.step({cameraTogglePressed:true});expect(r.cameraMode).toBe('authored');
   await world.reset();expect(r.cameraMode).toBe('authored');
   expect(world.inspectCamera().document?.defaultViewId).toBe('first-person');
  }finally{world.dispose();}
 });
 it('uses a fresh sprint+crouch edge for slide and remaps movement, HUD and action admission together',()=>{
  const keyboard=new WorldKeyboard(()=>0,()=>{throw new Error('unexpected reset');});keyboard.setHumanoidContext(()=>undefined);keyboard.enabled=true;
  keyboard.keyDown('KeyC');keyboard.keyDown('ShiftLeft');expect(keyboard.sample().humanoid?.actions).toEqual({toggleCrouch:true});
  expect(keyboard.sample().humanoid?.actions).toEqual({});keyboard.keyUp('KeyC');keyboard.keyDown('KeyC');expect(keyboard.sample().humanoid?.actions).toEqual({slide:true});
  keyboard.keyDown('KeyC',true);expect(keyboard.sample().humanoid?.actions).toEqual({});keyboard.clear();
  keyboard.keyDown('ControlLeft');expect(keyboard.sample().humanoid).toMatchObject({slow:true,actions:{}});
  keyboard.setKeyBindings({forward:['KeyI'],crouch:['KeyB']});expect(keyboard.sample().humanoid?.actions).toEqual({});
  keyboard.keyDown('KeyW');keyboard.keyDown('KeyC');expect(keyboard.sample().humanoid?.forward).toBe(0);
  keyboard.keyDown('KeyI');keyboard.keyDown('ShiftRight');keyboard.keyDown('KeyB');expect(keyboard.sample().humanoid).toMatchObject({forward:1,boost:true,actions:{slide:true}});
  expect(controlHints(keyboard.getKeyBindings())).toContainEqual(['B','蹲伏 / 站立；冲刺时滑铲；攀爬时松手；游泳时按住下潜']);
  expect(()=>createKeyBindings({crouch:['KeyW']})).toThrow('KEY_BINDING_CONFLICT');expect(()=>createKeyBindings({roll:['Escape']})).toThrow('KEY_BINDINGS_INVALID');
  expect(DEFAULT_KEY_BINDINGS.roll).toEqual(['KeyQ']);
 });
 it.each(['ControlLeft','ControlRight'])('uses held %s with every movement direction, never a crouch/slide edge',control=>{
  const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidContext(()=>undefined);keyboard.enabled=true;
  for(const [key,forward,steer] of [['KeyW',1,0],['KeyS',-1,0],['KeyA',0,-1],['KeyD',0,1]] as const){
   keyboard.clear();keyboard.keyDown(control);keyboard.keyDown(key);
   expect(keyboard.sample().humanoid).toMatchObject({forward,steer,slow:true,boost:false,actions:{}});
   keyboard.keyDown('ShiftLeft');expect(keyboard.sample().humanoid).toMatchObject({slow:true,boost:true,actions:{}});
   keyboard.keyDown(control,true);expect(keyboard.sample().humanoid?.actions).toEqual({});
   keyboard.keyUp(control);expect(keyboard.sample().humanoid).toMatchObject({slow:false,boost:true,actions:{}});
  }
  keyboard.clear();keyboard.keyDown(control);expect(keyboard.sample().humanoid).toMatchObject({forward:0,steer:0,slow:true,actions:{}});
  keyboard.setKeyBindings({slow:['KeyB']});expect(keyboard.sample().humanoid?.slow).toBe(false);
  keyboard.keyDown(control);expect(keyboard.sample().humanoid?.slow).toBe(false);keyboard.keyDown('KeyB');expect(keyboard.sample().humanoid?.slow).toBe(true);
  expect(()=>createKeyBindings({slow:['KeyC']})).toThrow('KEY_BINDING_CONFLICT');
 });
 it('walks upright through real input, prioritizes Ctrl over Shift and restores speed on release',async()=>{
  const world=await fixture();try{
   const runtime=world.humanoid!,controller=runtime.simulation.controlledActor.controller;
   runtime.prepareCharacter([-50,.03,-50],0);world.step({},30);
   const e=(world as unknown as {engine:WorldEngine}).engine;e.keyboard.enabled=true;
   const advance=()=>{for(let n=0;n<60;n++)e.advance(1/60);};
   const normalSpeed=3.1*controller.movementTuning.speedScale;
   e.keyboard.keyDown('KeyW');advance();expect(controller.speed).toBeCloseTo(normalSpeed,1);
   const height=(controller.capsule.shape as RAPIER.Capsule).halfHeight;
   e.keyboard.keyDown('ControlLeft');advance();expect(controller.speed).toBeCloseTo(controller.movementTuning.slowSpeed,1);
   expect(controller.stance).toBe('stand');expect(controller.state).toBe('walk');expect((controller.capsule.shape as RAPIER.Capsule).halfHeight).toBe(height);
   e.keyboard.keyDown('ShiftLeft');advance();expect(controller.speed).toBeCloseTo(controller.movementTuning.slowSpeed,1);expect(controller.skills.active).toBeNull();
   e.keyboard.keyUp('ControlLeft');advance();expect(controller.speed).toBeCloseTo(controller.movementTuning.maxSpeed,1);expect(controller.state).toBe('sprint');
   e.keyboard.keyUp('ShiftLeft');advance();expect(controller.speed).toBeCloseTo(normalSpeed,1);
   e.keyboard.keyUp('KeyW');e.keyboard.keyDown('ControlRight');advance();expect(controller.speed).toBeLessThan(.01);expect(controller.stance).toBe('stand');
   e.keyboard.keyUp('ControlRight');e.keyboard.keyDown('KeyC');advance();expect(controller.stance).toBe('crouch');
   e.keyboard.keyUp('KeyC');e.keyboard.keyDown('KeyC');advance();expect(controller.stance).toBe('stand');
  }finally{world.dispose();}
 });
 it('probes and prepares near-table starts with the same humanoid capsule used for movement',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!;
   runtime.switchMap({...map,boxes:[map.boxes[0]!,{id:'table',position:[0,.45,.835],size:[2,.9,1]}]});
   const start={positionWorldMetersXYZ:[0,.02,0] as const,facingYawRadians:Math.PI};
   const before=world.getEntityState('player').positionWorldMetersXYZ;
   expect(runtime.probeEpisodeStart(start).isValid).toBe(true);expect(world.getEntityState('player').positionWorldMetersXYZ).toEqual(before);
   expect(()=>runtime.prepareEpisodeStart(start)).not.toThrow();world.step({},30);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeCloseTo(0,2);
   expect(runtime.probeEpisodeStart({...start,positionWorldMetersXYZ:[0,.02,.1]}).isValid).toBe(false);
  }finally{world.dispose();}
 });
 it('keeps a physical slide low under a ceiling until continued movement clears the exit',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!;
   runtime.switchMap({...map,boxes:[map.boxes[0]!,{id:'low-roof',position:[0,1.35,5.5],size:[4,.3,5]}]});
   runtime.simulation.controlledActor.controller.setAvailableClips(new Set(['slide-start','slide-loop','slide-exit']),[]);world.step({},30);world.step({humanoid:{...emptyInput(),forward:1,boost:true}},30);
   const start=await world.execute({type:'humanoid.perform-action',request:{requestId:'tunnel-slide',action:'slide'}});if(start.status!=='accepted')throw new Error('Slide was not accepted');
   world.step({},180);expect(world.operations.get(start.operationId).status).toBe('running');expect(runtime.simulation.controlledActor.controller!.capsuleHeight).toBeCloseTo(ACTION_TUNING.slideHeightMeters);
   const stopped=world.getEntityState('player').positionWorldMetersXYZ[2];world.step({},30);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeCloseTo(stopped);
   world.step({humanoid:{...emptyInput(),forward:1}},420);expect(world.operations.get(start.operationId).status).toBe('succeeded');expect(runtime.simulation.controlledActor.controller!.capsuleHeight).toBeCloseTo(ACTION_TUNING.standingHeightMeters);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(8.25);
  }finally{world.dispose();}
 });
 it('keeps cancelled slide operations pending under a low roof and resolves only after safe exit',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!;
   runtime.switchMap({...map,boxes:[map.boxes[0]!,{id:'low-roof',position:[0,1.35,5.5],size:[4,.3,5]}]});
   const controller=runtime.simulation.controlledActor.controller;controller.setAvailableClips(new Set(['slide-start','slide-loop','slide-exit']),[]);
   world.step({},30);world.step({humanoid:{...emptyInput(),forward:1,boost:true}},30);
   const start=await world.execute({type:'humanoid.perform-action',request:{requestId:'cancel-slide',action:'slide'}});if(start.status!=='accepted')throw new Error('Slide was not accepted');
   world.step({},180);let resolved=false;const wait=world.operations.wait(start.operationId).then(result=>{resolved=true;return result;});
   expect(()=>world.operations.cancel(start.operationId)).not.toThrow();expect(world.operations.get(start.operationId)).toMatchObject({status:'running',phase:'cancelling'});
   const tick=world.simulationTick;world.operations.cancel(start.operationId);world.snapshot();await Promise.resolve();expect(resolved).toBe(false);expect(world.simulationTick).toBe(tick);
   world.step({},60);expect(controller.capsuleHeight).toBeCloseTo(ACTION_TUNING.slideHeightMeters);expect(world.operations.get(start.operationId).status).toBe('running');
   world.step({humanoid:{...emptyInput(),forward:1}},420);expect(await wait).toMatchObject({status:'cancelled'});expect(controller.capsuleHeight).toBeCloseTo(ACTION_TUNING.standingHeightMeters);
  }finally{world.dispose();}
 });
 it('rechecks slide exit clearance when a ceiling enters after cancellation started',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!,controller=runtime.simulation.controlledActor.controller;
   controller.setAvailableClips(new Set(['slide-start','slide-loop','slide-exit']),[]);world.step({},30);world.step({humanoid:{...emptyInput(),forward:1,boost:true}},30);
   const result=await world.execute({type:'humanoid.perform-action',request:{requestId:'moving-roof',action:'slide'}});if(result.status!=='accepted')throw new Error('Slide unavailable');
   world.operations.cancel(result.operationId);world.step({},1);expect(controller.skills.active?.phase).toBe('exit');
   const p=controller.position,physics=runtime.environment.borrowPhysics().world,roof=physics.createCollider(RAPIER.ColliderDesc.cuboid(2,.15,2).setTranslation(p.x,p.y+1.35,p.z));physics.updateSceneQueries();
   world.step({},90);expect(world.operations.get(result.operationId).status).toBe('running');expect(controller.capsuleHeight).toBeCloseTo(ACTION_TUNING.slideHeightMeters);
   physics.removeCollider(roof,true);world.step({},90);expect(world.operations.get(result.operationId).status).toBe('cancelled');expect(controller.capsuleHeight).toBeCloseTo(ACTION_TUNING.standingHeightMeters);
  }finally{world.dispose();}
 });
 it('allows stale input leases to release after world disposal',async()=>{
  const world=await fixture(),release=world.humanoid!.setInput({...emptyInput(),forward:1});world.dispose();expect(()=>release()).not.toThrow();expect(()=>release()).not.toThrow();
 });
 it('rejects mounted skills immediately and shares rejection conditions with the capability query',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!;runtime.simulation.controlledActor.controller.setAvailableClips(new Set(['roll','slide-start','slide-loop','slide-exit']),[]);world.step({},30);
   expect(runtime.characterCapabilities().find(c=>c.id==='slide')).toMatchObject({eligible:false,reason:'SPEED_TOO_LOW',parameters:{minimumSpeedMetersPerSecond:ACTION_TUNING.slideMinimumSpeedMetersPerSecond}});
   expect(runtime.approach('car-1')).toBe(true);expect(runtime.enter('car-1')).toBe(true);
   const request={requestId:'mounted-roll',action:'roll' as const};
   expect(runtime.characterCapabilities().find(c=>c.id==='roll')).toMatchObject({eligible:false,reason:'HUMANOID_TRANSITION_ACTIVE'});
   expect(await world.execute({type:'humanoid.perform-action',request})).toMatchObject({status:'rejected',error:{code:'HUMANOID_TRANSITION_ACTIVE'}});
   expect(runtime.simulation.controlledActor.controller!.skills.status(request.requestId)).toBeNull();world.step({},60);
   const result=await world.execute({type:'humanoid.perform-action',request});
   expect(result).toMatchObject({status:'rejected',error:{code:'MOUNTED'}});expect(runtime.characterCapabilities().find(c=>c.id==='roll')).toMatchObject({eligible:false,reason:'MOUNTED'});
   world.step({},180);expect(world.snapshot().humanoid?.character.activeAction).toBeNull();
  }finally{world.dispose();}
 });
 it('returns authored approach anchors and exactly the eligibility used by target execution',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!;
   runtime.switchMap({...map,interactions:[{id:'seat',label:'Seat',kind:'seat',slotId:'seat',position:[5,.5,5],approach:[5,.03,4],yaw:.4}]});
   runtime.simulation.controlledActor.controller.setAvailableClips(new Set(['sit-enter','sit-idle','sit-exit']),[]);world.step({},30);
   const before=world.getEntityState('player').positionWorldMetersXYZ,target=runtime.snapshot().interactionTargets[0]!;
   expect(target).toMatchObject({id:'seat',approachPositionWorldMetersXYZ:[5,.03,4],facingYawRadians:.4,eligible:false,reason:'OUT_OF_REACH'});
   const result=await world.execute({type:'humanoid.perform-action',request:{requestId:'distant-seat',action:'sit',targetId:'seat'}});
   expect(result).toMatchObject({status:'rejected',error:{code:target.reason}});expect(world.getEntityState('player').positionWorldMetersXYZ).toEqual(before);
   (target.approachPositionWorldMetersXYZ as unknown as number[])[0]=100;expect(runtime.snapshot().interactionTargets[0]!.approachPositionWorldMetersXYZ[0]).toBe(5);
  }finally{world.dispose();}
 });
 it('moves seat anchors with a compound prop and rejects a toppled seat',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const r=world.humanoid!;
   r.switchMap({...map,boxes:[map.boxes[0]!,{id:'chair-shape',position:[5,.5,5],size:[1,1,1],rigidGroup:{id:'chair',massKg:8}}],interactions:[{id:'chair-seat',label:'Seat',kind:'seat',slotId:'seat',position:[5,1,5],approach:[5,0,4],yaw:0,colliderIds:['chair-shape']}]});
   r.simulation.controlledActor.controller.setAvailableClips(new Set(['sit-enter','sit-idle','sit-exit']),[]);world.step({},30);
   const body=r.environment.colliderForId('chair-shape')!.parent()!;body.setTranslation({x:8,y:.5,z:5},true);body.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2),true);world.step({},1);
   const target=r.snapshot().interactionTargets[0]!;expect(target.positionWorldMetersXYZ[0]).toBeGreaterThan(7);expect(target.reason).toBe('SEAT_UNSTABLE');
   r.environment.resetRigidGroups();world.step({},1);expect(r.snapshot().interactionTargets[0]!.positionWorldMetersXYZ[0]).toBeCloseTo(5,2);
  }finally{world.dispose();}
 });
 it('uses E to enter a collider-backed climb, Space to attempt the top and crouch to release',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!;
   runtime.switchMap({...map,boxes:[map.boxes[0]!,{id:'climb-wall',position:[0,1.5,1],size:[3,3,1]}],climbSurfaces:[{id:'face',colliderId:'climb-wall',kind:'wall',center:[0,1.5,.5],normal:[0,0,-1],width:3,minY:0,maxY:3}]});
   runtime.simulation.controlledActor.controller.setAvailableClips(new Set(['hang-enter','hang-exit','hang-idle','hang-left','hang-right','climb-up','climb-down']),[]);world.step({},30);
   expect(runtime.characterCapabilities().find(c=>c.id==='climb')).toMatchObject({eligible:true});
   world.step({humanoid:{...emptyInput(),actions:{interact:true}}},1);expect(runtime.snapshot().surface).toMatchObject({mode:'climbing',surfaceId:'face'});
   world.step({},180);world.step({humanoid:{...emptyInput(),jump:true}},1);expect(runtime.snapshot().surface.mode).toBe('climbing');
   world.step({humanoid:{...emptyInput(),actions:{toggleCrouch:true}}},1);expect(runtime.snapshot().surface.mode).toBe('none');
  }finally{world.dispose();}
 });
 it('consumes Space as standing up from crouch before allowing another jump',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{world.step({},30);world.step({humanoid:{...emptyInput(),actions:{toggleCrouch:true}}},1);expect(world.snapshot().humanoid?.character.stance).toBe('crouch');
   world.step({humanoid:{...emptyInput(),jump:true}},1);expect(world.snapshot().humanoid?.character.stance).toBe('stand');expect(world.humanoid!.simulation.controlledActor.controller!.vertical).toBe(0);
   world.step({humanoid:{...emptyInput(),jump:true}},1);expect(world.humanoid!.simulation.controlledActor.controller!.vertical).toBeGreaterThan(0);
  }finally{world.dispose();}
 });


 it('clips only local head triangles, preserving shared geometry, material groups and bone transforms',()=>{
  const root=new Group(),pelvis=new Bone(),head=new Bone();pelvis.name='pelvis';head.name='head';pelvis.add(head);
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(new Array(18).fill(0),3));
  geometry.setAttribute('skinIndex',new Uint16BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));
  geometry.setAttribute('skinWeight',new Float32BufferAttribute(Array.from({length:6},()=>[1,0,0,0]).flat(),4));geometry.setIndex([0,1,2,3,4,5]);geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);
  const mesh=new SkinnedMesh(geometry);mesh.add(pelvis);mesh.bind(new Skeleton([pelvis,head]));root.add(mesh);
  const body=new FirstPersonBody(root);body.setActive(true);
  expect(mesh.geometry.index!.count).toBe(3);expect(geometry.index!.count).toBe(6);expect(mesh.geometry.groups[1]!.count).toBe(0);expect(head.scale.toArray()).toEqual([1,1,1]);
  body.setActive(false);expect(mesh.geometry).toBe(geometry);body.setActive(true);body.dispose();expect(mesh.geometry).toBe(geometry);geometry.dispose();mesh.skeleton.dispose();
 });


 it.each(['plane','submarine','spacecraft','mount','dragon'] as const)('uses configured %s handling in the physical solver',async(mode)=>{
  const speeds=[];
  for(const stronger of [false,true]){
   const sceneMap:EnvironmentDefinition={...map,boxes:[map.boxes[0]!],water:mode==='submarine'?[{id:'pool',min:[-90,-5,-90],max:[90,40,90],surface:40}]:[],regions:[{...map.regions[0]!,modes:[mode]}],spawns:[]};
   const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:sceneMap,character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:'craft',assetId:'craft',spec:{...spec,mode,spawn:[-20,mode==='mount'?.03:25,-20]},object:new Group()}]}});
   try{const r=world.humanoid!;const tuning:Partial<MovementSettings>=mode==='plane'?{drag:stronger?5:0,dragQuadratic:0}:mode==='submarine'?{verticalAcceleration:stronger?12:2}:mode==='spacecraft'?{grip:0,brakeDamping:stronger?8:0}:mode==='dragon'?{groundDeceleration:stronger?8:1}:{coastDeceleration:stronger?8:1};
    r.applyProfile({vehicles:{craft:tuning}});r.simulation.controlledActor.vehicleIndex=0;r.simulation.controlledActor.transition=0;const v=r.simulation.controlledActor.vehicle!;v.position.set(-20,mode==='mount'||mode==='dragon'?.03:25,-20);v.velocity.set(0,0,mode==='submarine'?0:20);v.speed=v.velocity.length();v.grounded=mode==='mount'||mode==='dragon';
    world.step({humanoid:{...emptyInput(),lift:mode==='submarine'?1:0,slow:mode==='spacecraft'}},30);speeds.push(mode==='submarine'?v.velocity.y:v.velocity.z);
    expect(r.snapshot().controls.vehicles.craft).toMatchObject(tuning);
   }finally{world.dispose();}
  }
  if(mode==='submarine')expect(speeds[1]!-speeds[0]!).toBeGreaterThan(3);else expect(speeds[0]!-speeds[1]!).toBeGreaterThan(2);
 });
 it('tunes release deceleration independently per instance and preserves it through reset',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const r=world.humanoid!;
   r.applyProfile({vehicles:{'car-1':{coastDeceleration:1},'car-2':{coastDeceleration:8}}});
   r.applyProfile({vehicles:{'car-1':{directionChangeDeceleration:4,groundDeceleration:3}}});
   const velocities=[];
   for(const id of ['car-1','car-2']){r.simulation.controlledActor.vehicleIndex=id==='car-1'?0:1;r.simulation.controlledActor.transition=0;const v=r.simulation.controlledActor.vehicle!;v.velocity.set(0,0,10);world.step({humanoid:emptyInput()},30);velocities.push(v.velocity.z);}
   expect(velocities[0]).toBeCloseTo(9.5,1);expect(velocities[1]).toBeCloseTo(6,1);
   expect(r.exportProfile().vehicles?.['car-1']?.accel).toBe(10);
   await world.reset();expect(r.exportProfile().vehicles?.['car-1']?.coastDeceleration).toBe(1);
  }finally{world.dispose();}
 });
 it('configures independent boosted speed, steering response and character stopping acceleration atomically',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const r=world.humanoid!;
   r.applyProfile({vehicles:{'car-1':{speed:4,maxSpeed:7,reverseSpeed:2,steeringResponse:3,steeringReturn:20}},character:{coastDeceleration:1}});
   const before=r.exportProfile();expect(()=>r.applyProfile({vehicles:{'car-1':{coastDeceleration:-1}},character:{speed:99}})).toThrow();expect(r.exportProfile()).toEqual(before);
   r.simulation.controlledActor.vehicleIndex=0;r.simulation.controlledActor.transition=0;world.step({humanoid:{...emptyInput(),forward:1}},90);expect(r.simulation.controlledActor.vehicle!.velocity.z).toBeCloseTo(4,1);
   world.step({humanoid:{...emptyInput(),forward:1,boost:true}},60);expect(r.simulation.controlledActor.vehicle!.velocity.z).toBeCloseTo(7,1);
   r.simulation.controlledActor.vehicleIndex=-1;r.prepareCharacter([0,.03,-20]);world.step({moveZRatio:-1},60);const speed=r.simulation.controlledActor.player.velocity.length();world.step({},30);expect(r.simulation.controlledActor.player.velocity.length()).toBeGreaterThan(speed-.7);
   r.switchMap({...map,id:'tuning-map'});expect(r.exportProfile().vehicles?.['car-1']?.maxSpeed).toBe(7);
  }finally{world.dispose();}
 });
 it('rejects invalid authored vehicle tuning during world creation',async()=>{
  await expect(createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'car-1',assetId:'car',spec:{...spec,coastDeceleration:-1},object:new Group()}]}})).rejects.toThrow('HUMANOID_CONTROL_INVALID: coastDeceleration');
 });


 it('retires map-owned operations on replacement and keeps safe cancellation pending until reset',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!;runtime.simulation.controlledActor.controller.setAvailableClips(new Set(['roll']),[]);world.step({},30);
   const receipt=await world.execute({type:'humanoid.perform-action',request:{requestId:'map-roll',action:'roll'}});if(receipt.status!=='accepted')throw new Error('roll unavailable');
   const cancel=vi.spyOn(runtime.simulation.controlledActor.controller!.skills,'cancel').mockReturnValue({requestId:'map-roll',action:'roll',status:'running',code:'HEADROOM_BLOCKED',message:'cannot cancel safely'});
   expect(()=>world.operations.cancel(receipt.operationId)).not.toThrow();expect(world.operations.get(receipt.operationId)).toMatchObject({status:'running',phase:'cancelling'});await world.reset();expect(world.operations.get(receipt.operationId).status).toBe('cancelled');cancel.mockRestore();runtime.simulation.controlledActor.controller.setAvailableClips(new Set(['roll']),[]);
   world.step({},30);const next=await world.execute({type:'humanoid.perform-action',request:{requestId:'replace-roll',action:'roll'}});if(next.status!=='accepted')throw new Error('roll unavailable');runtime.switchMap({...map,id:'new-map'});expect(world.operations.get(next.operationId).status).toBe('cancelled');expect(world.snapshot().humanoid?.character.activeAction).toBeNull();
  }finally{world.dispose();}
 });
 it('observes source surface progress and map interaction targets without mutable references',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!;runtime.switchMap({...map,interactions:[{id:'parcel',label:'Parcel',kind:'pickup',slotId:'pickup',position:[5,.5,5],approach:[5,.03,4],yaw:0,size:[.5,.5,.5]}]});runtime.simulation.controlledActor.controller.setAvailableClips(new Set(['prone-enter','prone-exit','prone-idle','prone-forward']),[]);world.step({},30);world.step({humanoid:{...emptyInput(),actions:{prone:true}}},1);
   const snapshot=runtime.snapshot();expect(snapshot.surface.mode).toBe('prone');expect(snapshot.surface.pose?.actionId).toBe('prone-enter');expect(snapshot.interactionTargets[0]).toMatchObject({id:'parcel',state:'available',positionWorldMetersXYZ:[5,.5,5]});expect(snapshot.traversal).toBeNull();expect(snapshot.vehicleDynamics[0]?.launched).toBe(false);
   world.step({},180);expect(snapshot.surface.pose?.actionId).toBe('prone-enter');expect(runtime.snapshot().surface.pose?.actionId).toBe('prone-idle');await world.reset();expect(runtime.snapshot().surface.mode).toBe('none');
  }finally{world.dispose();}
 });
 it('keeps the original simulation alive when later map staging fails',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!,environment=runtime.environment,humanoid=runtime.simulation.controlledActor.controller!,dispose=vi.spyOn(humanoid,'dispose');world.step({},2);const before=world.snapshot();
   const prepare=vi.spyOn(Simulation.prototype,'addActor').mockImplementationOnce(()=>{throw new Error('staged assets failed');});
   expect(()=>runtime.switchMap({...map,id:'replacement'})).toThrow('staged assets failed');prepare.mockRestore();expect(dispose).not.toHaveBeenCalled();expect(runtime.environment).toBe(environment);expect(world.snapshot()).toEqual(before);world.step({moveZRatio:-1},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(1);
  }finally{world.dispose();}
 });
 it('does not let a stale UI input lease release a newer model override',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!,releaseUI=runtime.setInput({...emptyInput(),forward:1});
   expect((await world.execute({type:'humanoid.set-input',input:{...emptyInput(),forward:-1}})).status).toBe('applied');releaseUI();world.step({},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeLessThan(-1);
   const releaseCurrent=runtime.setInput({...emptyInput(),forward:1});releaseCurrent();world.step({moveZRatio:1},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeLessThan(-3);
  }finally{world.dispose();}
 });

 it('rejects invalid map and profile updates without disposing the live controller',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!,original=runtime.environment,humanoid=runtime.simulation.controlledActor.controller!,dispose=vi.spyOn(humanoid,'dispose');world.step({},2);const before=world.snapshot();
   expect(()=>runtime.switchMap({...map,id:'invalid',interactions:[null] as never})).toThrow();expect(dispose).not.toHaveBeenCalled();expect(runtime.environment).toBe(original);expect(world.snapshot()).toEqual(before);
   const profile=runtime.exportProfile();expect(()=>runtime.applyProfile({character:{speed:Infinity}})).toThrow();expect(runtime.exportProfile()).toEqual(profile);expect(runtime.simulation.characterControl.speed).toBe(profile.character!.speed);
   world.step({moveZRatio:-1},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(1);
  }finally{world.dispose();}
 });
 beforeAll(async()=>{const world=await fixture();world.dispose();});
 it.each([false,true])('uses the Episode lease, frame metadata and fixed solver for mounted recordings, automatic=%s',async automatic=>{
  const win=new EventTarget(),doc=Object.assign(new EventTarget(),{defaultView:win,activeElement:null,body:{},documentElement:{},hidden:false});Object.assign(win,{document:doc});vi.stubGlobal('window',win);vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const canvas=Object.assign(new EventTarget(),{width:800,height:600,ownerDocument:doc,getAttribute:()=>null,removeAttribute:()=>{},setAttribute:()=>{},style:{getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty:()=>{},removeProperty:()=>{}},toDataURL:()=> 'data:image/png;base64,dGVzdA=='});let ratio=1;const size=new Vector2(800,600);
  const renderer={shadowMap:{enabled:false,type:PCFShadowMap,needsUpdate:false},domElement:canvas,render:vi.fn(),getSize:(out:Vector2)=>out.copy(size),getPixelRatio:()=>ratio,setPixelRatio:(r:number)=>{ratio=r;},setSize:(x:number,y:number)=>{size.set(x,y);canvas.width=x*ratio;canvas.height=y*ratio;}} as unknown as WebGLRenderer;
  const world=await fixture(renderer);try{
   if(automatic)world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),viewSelection:{rules:[]}}});
   await world.start();const port=(win as unknown as {__WORLDKIT_EVAL__:WorldObservation}).__WORLDKIT_EVAL__.episode!;
   const start={positionWorldMetersXYZ:[-20,.03,-20] as const,facingYawRadians:Math.PI,cameraViewId:'shoulder',humanoid:{vehicleInstanceId:'car-1',mounted:true,velocityWorldMetersPerSecondXYZ:[0,0,4] as const}};
   expect(port.capabilities().humanoid?.vehicles).toHaveLength(2);expect(port.probeStart(start).isValid).toBe(true);
   const {cameraViewId,...automaticStart}=start;
   await port.prepareSegment(automatic?{...automaticStart,cameraViewSelection:'automatic'}:start,{widthPixels:640,heightPixels:360});
   if(automatic){
    expect(await port.execute({type:'camera.set-view',viewId:'missing'})).toMatchObject({status:'rejected'});
    expect(world.inspectCamera().viewSelection?.suspendedBy).toBeUndefined();
    expect(await port.execute({type:'camera.set-view',viewId:cameraViewId})).toMatchObject({status:'applied'});
   }
   const runtime=world.humanoid!,ownedSnapshot=world.snapshot();
   for(const mutate of [()=>runtime.enter('car-1'),()=>runtime.exit(),()=>runtime.command({type:'humanoid.set-input',input:emptyInput()}),()=>runtime.command({type:'humanoid.perform-action',request:{requestId:'external-roll',action:'roll'}}),()=>runtime.setInput(emptyInput()),()=>runtime.clearInput(),()=>runtime.prepareCharacter([0,.03,0]),()=>runtime.prepare('car-1',map.spawns[0]!),()=>runtime.approach('car-1'),()=>runtime.switchMap(map),()=>runtime.applyProfile({}),()=>runtime.advance({},1/60),()=>runtime.reset(),()=>runtime.prepareEpisodeStart(start),()=>runtime.useAuthoredCamera(),()=>world.setCameraView('first-person')]){
    expect(mutate).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');expect(world.snapshot()).toEqual(ownedSnapshot);
   }
   expect(world.snapshot().humanoid?.mountedInstanceId).toBe('car-1');expect(world.isRunning).toBe(false);expect(()=>world.step({},1)).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');
   const collisionBefore=world.inspectCamera().diagnostics;
   const repeatedCollisionFrame=port.frame('image/png');expect(port.frame('image/png')).toEqual(repeatedCollisionFrame);
   expect(world.inspectCamera().diagnostics).toEqual(collisionBefore);
   const frame=port.advance({humanoid:{...emptyInput(),forward:1}},60);expect(frame.entities.find(e=>e.id==='car-1')!.positionWorldMetersXYZ[2]).toBeGreaterThan(-16);expect(port.frame('image/png').snapshot.camera.viewKind).toBe('shoulder');expect(canvas.width).toBe(640);
   port.advance({humanoid:{...emptyInput(),brake:true}},120);
   expect(await port.execute({type:'vehicle.exit'})).toMatchObject({status:'applied'});port.advance({},120);
   expect(world.snapshot().camera.viewId).toBe('shoulder');
   expect(await port.execute({type:'vehicle.enter',instanceId:'car-1'})).toMatchObject({status:'applied'});port.advance({},120);
   expect(world.snapshot().humanoid?.mountedInstanceId).toBe('car-1');
   expect(world.snapshot().camera.viewId).toBe('shoulder');port.release();
   world.humanoid!.simulation.controlledActor.controller.setAvailableClips(new Set(['roll']),[]);
   await port.prepareSegment({positionWorldMetersXYZ:[0,.03,0],facingYawRadians:Math.PI},{widthPixels:640,heightPixels:360});world.humanoid!.simulation.controlledActor.controller.setAvailableClips(new Set(['roll']),[]);port.advance({},30);
   const ticks=world.simulationTick;
   expect(await world.execute({type:'humanoid.set-input',input:emptyInput()})).toMatchObject({status:'rejected',error:{code:'EPISODE_CAPTURE_OWNS_CLOCK'}});
   expect(await world.execute({type:'actor.stop',entityId:'player'})).toMatchObject({status:'rejected',error:{code:'EPISODE_CAPTURE_OWNS_CLOCK'}});
   expect(await port.execute({type:'humanoid.apply-profile',profile:{character:{speed:99}}} as never)).toMatchObject({status:'rejected',error:{code:'EPISODE_COMMAND_UNSUPPORTED'}});
   expect(await port.execute({type:'humanoid.set-input',input:{...emptyInput(),humanoid:{unknown:true}}} as never)).toMatchObject({status:'rejected',error:{code:'HUMANOID_INPUT_INVALID'}});
   const action=await port.execute({type:'humanoid.perform-action',request:{requestId:'episode-roll',action:'roll'}});if(action.status!=='accepted')throw new Error('Episode action rejected');
   expect(world.simulationTick).toBe(ticks);expect(port.operation(action.operationId).status).toBe('running');
   const stepPhysics=vi.spyOn(world.humanoid!.environment,'stepPhysics');port.advance({},120);expect(stepPhysics).toHaveBeenCalledTimes(120);expect(port.operation(action.operationId).status).toBe('succeeded');
   const cancelled=await port.execute({type:'humanoid.perform-action',request:{requestId:'episode-cancel',action:'roll'}});if(cancelled.status!=='accepted')throw new Error('Episode action rejected');
   await port.execute({type:'humanoid.set-input',input:{...emptyInput(),actions:{cancel:true}}});port.advance({},1);expect(port.operation(cancelled.operationId).status).toBe('cancelled');
   await port.execute({type:'humanoid.set-input',input:null});port.advance({},30);
   const resetAction=await port.execute({type:'humanoid.perform-action',request:{requestId:'episode-reset',action:'roll'}});if(resetAction.status!=='accepted')throw new Error('Episode action rejected');
   await port.prepareSegment({positionWorldMetersXYZ:[0,.03,0],facingYawRadians:Math.PI},{widthPixels:640,heightPixels:360});expect(port.operation(resetAction.operationId).status).toBe('cancelled');world.humanoid!.simulation.controlledActor.controller.setAvailableClips(new Set(['roll']),[]);
   port.advance({},30);const releaseAction=await port.execute({type:'humanoid.perform-action',request:{requestId:'episode-release',action:'roll'}});if(releaseAction.status!=='accepted')throw new Error('Episode action rejected');
   port.release();expect(world.operations.get(releaseAction.operationId).status).toBe('cancelled');expect(()=>port.execute({type:'humanoid.set-input',input:null})).toThrow('EPISODE_SEGMENT_NOT_PREPARED');
   await port.prepareSegment(start,{widthPixels:640,heightPixels:360});
   const interactions=vi.spyOn(runtime.simulation.controlledActor,'interact');port.advance({interact:true},1);
   expect(interactions).toHaveBeenCalledTimes(1);expect(()=>world.stop()).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');
   port.advance({interact:true},1);expect(interactions).toHaveBeenCalledTimes(1);
   const visual=vi.fn();runtime.onVisualUpdate(visual);port.advance({},1);
   const captured=port.frame('image/png');expect(port.frame('image/png').snapshot).toEqual(captured.snapshot);expect(visual).toHaveBeenCalledTimes(1);
   world.dispose();expect(()=>runtime.advance({},1/60)).toThrow('HUMANOID_DISPOSED');
  }finally{world.dispose();vi.unstubAllGlobals();}
 });
 it('tracks a physical character action through terminal operation status and clears it on reset',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!;runtime.simulation.controlledActor.controller.setAvailableClips(new Set(['roll']),[]);world.step({},30);
   const receipt=await world.execute({type:'humanoid.perform-action',request:{requestId:'roll-1',action:'roll'}});expect(receipt.status).toBe('accepted');
   if(receipt.status!=='accepted')throw new Error('action was not accepted');expect(world.snapshot().humanoid?.character.activeAction?.requestId).toBe('roll-1');
   world.step({},120);expect(world.operations.get(receipt.operationId).status).toBe('succeeded');expect(world.snapshot().humanoid?.character.activeAction).toBeNull();
   const next=await world.execute({type:'humanoid.perform-action',request:{requestId:'roll-2',action:'roll'}});expect(next.status).toBe('accepted');await world.reset();if(next.status==='accepted')expect(world.operations.get(next.operationId).status).toBe('cancelled');expect(world.snapshot().humanoid?.character.activeAction).toBeNull();
  }finally{world.dispose();}
 });
 it('applies humanoid profiles to physical motion, merges edits and preserves configuration across reset',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{world.step({moveZRatio:-1},60);const baseline=world.getEntityState('player').positionWorldMetersXYZ[2];await world.reset();const runtime=world.humanoid!;
   runtime.applyProfile({character:{speed:7.6},vehicles:{'car-1':{speed:12}}});
   expect(runtime.exportProfile().vehicles?.['car-1']?.speed).toBe(12);world.step({moveZRatio:-1},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(baseline*1.5);
   await world.reset();expect(runtime.simulation.controlledActor.controller!.movementTuning.speedScale).toBe(2);expect(runtime.simulation.vehicles[0]!.spec.speed).toBe(12);
  }finally{world.dispose();}
 });
 it.each(['wheeled','motorcycle','mount','dragon','plane','glider','boat','submarine','tank','spacecraft'] as const)('routes mounted observation keys only to camera: %s',mode=>{
  let current:typeof mode|undefined=mode;
  const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidContext(()=>current?{mode:current}:undefined);keyboard.enabled=true;
  keyboard.setKeyBindings({cameraLeft:['KeyJ'],cameraRight:['KeyL'],cameraUp:['KeyI'],cameraDown:['KeyK']});
  keyboard.keyDown('KeyJ');keyboard.keyDown('KeyI');
  const sample=keyboard.sample(),pitch=['dragon','plane','glider','submarine','spacecraft'].includes(mode);
  expect(sample).toMatchObject({cameraYawRatio:1,humanoid:{pitch:0,strafe:0,forward:0,steer:0}});
  expect(sample.cameraPitchRatio).toBeCloseTo(pitch?-MOUNTED_CAMERA_PITCH_RATIO:-1);
  current=undefined;expect(keyboard.sample()).toMatchObject({cameraYawRatio:0,cameraPitchRatio:0,humanoid:{pitch:0,strafe:0}});
  current=mode;keyboard.keyDown('KeyJ');keyboard.keyDown('KeyI');expect(keyboard.sample()).toEqual(sample);
  keyboard.clear();expect(keyboard.sample()).toMatchObject({cameraYawRatio:0,cameraPitchRatio:0,humanoid:{pitch:0,strafe:0}});
 });
 it('routes all player keys through SDK input and consumes action edges once',()=>{
  let mounted=false;const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidContext(()=>mounted?{mode:'wheeled'}:undefined);keyboard.enabled=true;
  keyboard.keyDown('KeyW');keyboard.keyDown('KeyE');keyboard.keyDown('KeyF');keyboard.keyDown('Space');
  const first=keyboard.sample();expect(first.humanoid?.forward).toBe(1);expect(first.humanoid?.actions?.interact).toBeUndefined();expect(first.interactPressed).toBe(true);expect(first.humanoid?.jump).toBe(true);
  const next=keyboard.sample();expect(next.humanoid?.forward).toBe(1);expect(next.humanoid?.actions?.interact).toBeUndefined();expect(next.interactPressed).toBe(false);
  mounted=true;expect(keyboard.sample().humanoid).toMatchObject({roll:0,lift:0,brake:false,jump:false});keyboard.keyDown('Space');expect(keyboard.sample().humanoid).toMatchObject({brake:true,lift:0});keyboard.clear();expect(keyboard.sample().humanoid?.forward).toBe(0);
 });
 it('lets observation pass the old flight cap up to document limits without pitching the vehicle',async()=>{
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:{...map,regions:[{...map.regions[0]!,modes:['dragon']}],spawns:[],bounds:{min:[-100,-10,-100],max:[100,200,100]}},character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'dragon',assetId:'dragon',spec:createFlyingCreatureSpec('dragon'),object:new Group()}]}});
  try{
   world.setCameraFollow({configuration:createHumanoidCameraDocument('player')});
   world.humanoid!.prepareEpisodeStart({positionWorldMetersXYZ:[0,80,0],facingYawRadians:0,humanoid:{vehicleInstanceId:'dragon',mounted:true}});
   const e=(world as unknown as {engine:WorldEngine}).engine,oldLimit=10*Math.PI/180;
   for(const view of ['third-person','first-person','shoulder']){
    world.setCameraView(view);const center=world.inspectCamera().resolved!.values.orientation.initialPitchRadians;
    e.keyboard.enabled=true;e.keyboard.keyDown('ArrowUp');
    for(let n=0;n<600;n++)e.advance(1/60);
    const up=world.inspectCamera().intent!.pitchRadians;
    expect(up).toBeLessThan(center-oldLimit);
    expect(world.humanoid!.inspectControls().lastApplied!.input.pitch).toBe(0);
    for(let n=0;n<60;n++)e.advance(1/60);
    expect(world.inspectCamera().intent!.pitchRadians).toBeCloseTo(up);
    e.keyboard.keyUp('ArrowUp');e.keyboard.keyDown('ArrowDown');
    for(let n=0;n<1200;n++)e.advance(1/60);
    const down=world.inspectCamera().intent!.pitchRadians;
    expect(down).toBeGreaterThan(center+oldLimit);
    expect(world.humanoid!.inspectControls().lastApplied!.input.pitch).toBe(0);
    for(let n=0;n<60;n++)e.advance(1/60);
    expect(world.inspectCamera().intent!.pitchRadians).toBeCloseTo(down);
    e.keyboard.keyUp('ArrowDown');e.keyboard.keyDown('Space');e.advance(1/60);
    expect(world.inspectCamera().intent!.pitchRadians).toBeCloseTo(down);
    expect(world.humanoid!.inspectControls().lastApplied!.input.pitch).toBe(-1);e.keyboard.keyUp('Space');
   }
  }finally{world.dispose();}
 });
 it('uses F for interaction and no longer admits G as a default action key',()=>{
  const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidContext(()=>undefined);keyboard.enabled=true;
  keyboard.keyDown('KeyF');expect(keyboard.sample().interactPressed).toBe(true);
  keyboard.keyDown('KeyG');expect(keyboard.sample().humanoid?.actions?.putDown).toBeUndefined();expect(keyboard.held.has('KeyG')).toBe(false);
 });
 it('executes closed commands with deduplication and reports failed physical requests',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{
   const first=await world.execute({type:'humanoid.apply-profile',profile:{character:{speed:4}}},{commandId:'camera'});expect(first.status).toBe('applied');expect(await world.execute({type:'humanoid.apply-profile',profile:{character:{speed:4}}},{commandId:'camera'})).toEqual(first);
   expect((await world.execute({type:'humanoid.apply-profile',profile:{character:{speed:5}}},{commandId:'camera'})).status).toBe('rejected');
   expect((await world.execute({type:'vehicle.enter',instanceId:'car-1'})).status).toBe('rejected');
   expect((await world.execute({type:'vehicle.approach',instanceId:'car-1'})).status).toBe('applied');expect((await world.execute({type:'vehicle.enter',instanceId:'car-1'})).status).toBe('applied');
   expect(world.snapshot().humanoid?.mountedInstanceId).toBe('car-1');expect((await world.execute({type:'actor.move-to',entityId:'car-1',targetPositionWorldMetersXYZ:[0,0,0]})).status).toBe('rejected');
  }finally{world.dispose();}
 });
 it('initializes real native vehicle placement and then advances solely through input',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!,start={positionWorldMetersXYZ:[-20,.03,-20] as const,facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'car-1',mounted:true,velocityWorldMetersPerSecondXYZ:[0,0,4] as const,throttle:.6}};
   expect(runtime.probeEpisodeStart(start).isValid).toBe(true);runtime.prepareEpisodeStart(start);expect(runtime.snapshot().mountedInstanceId).toBe('car-1');expect(runtime.simulation.controlledActor.vehicle!.velocity.z).toBe(4);expect(runtime.simulation.controlledActor.vehicle!.throttle).toBe(.6);
   world.step({humanoid:{...emptyInput(),forward:1}},60);expect(world.getEntityState('car-1').positionWorldMetersXYZ[2]).toBeGreaterThan(-16);expect(runtime.episodeCapabilities().vehicles).toHaveLength(2);
   expect(runtime.probeEpisodeStart({...start,positionWorldMetersXYZ:[0,1,10]}).isValid).toBe(false);
  }finally{world.dispose();}
 });
 it('selects one physics owner and keeps observations on actual collided movement',async()=>{
  const create=vi.spyOn(ThreePhysics,'create');const world=await fixture();
  try{expect(create).not.toHaveBeenCalled();const physics=vi.spyOn(world.humanoid!.environment,'stepPhysics');world.step({moveZRatio:-1},240);expect(physics).toHaveBeenCalledTimes(240);const p=world.getEntityState('player');expect(p.positionWorldMetersXYZ[2]).toBeGreaterThan(3);expect(p.positionWorldMetersXYZ[2]).toBeLessThan(9.3);expect(p.motion?.isGrounded).toBe(true);expect(world.simulationTick).toBe(240);}finally{world.dispose();create.mockRestore();}
 });
 it('keeps duplicate asset instances independent and supports physical driving, cameras and complete reset',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{const runtime=world.humanoid!,second=runtime.simulation.vehicles[1]!.position.clone();expect(runtime.approach('car-1')).toBe(true);expect(runtime.enter('car-1')).toBe(true);runtime.setInput({...emptyInput(),forward:1});world.step({},120);expect(runtime.simulation.vehicles[0]!.velocity.length()).toBeGreaterThan(1);expect(runtime.simulation.vehicles[1]!.position.distanceTo(second)).toBeLessThan(.1);for(const mode of [0,1,2] as const){world.setCameraView(['third-person','first-person','shoulder'][mode]!);world.step({},1);expect(world.snapshot().camera.mode).toBe('follow');expect(world.camera.position.toArray().every(Number.isFinite)).toBe(true);}await world.reset();expect(world.simulationTick).toBe(0);expect(runtime.simulation.controlledActor.vehicleIndex).toBe(-1);expect(runtime.simulation.vehicles.every(v=>v.velocity.length()===0)).toBe(true);expect(world.cameraMode).toBe('follow');world.step({},1);expect(runtime.simulation.vehicles[0]!.speed).toBe(0);}finally{world.dispose();}
 });
 it('resets the active map and rejects unsupported clock rates',async()=>{
  const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{world.humanoid!.switchMap({...map,id:'second',playerSpawn:[20,.03,20]});world.step({moveZRatio:-1},10);await world.reset();expect(world.humanoid!.environment.map.id).toBe('second');expect(world.getEntityState('player').positionWorldMetersXYZ[0]).toBeCloseTo(20);}finally{world.dispose();}
  await expect(createWorld({humanoid:{map,vehicles:[],character:{instanceId:'p',object:new Group()}},fixedTimeStepSeconds:1/30})).rejects.toThrow('HUMANOID_REQUIRES_60HZ');
 });
});


it('separates the saved profile from active resolved camera settings without mutating runtime state',async()=>{
 const world=await fixture();world.setCameraFollow({configuration:{...createHumanoidCameraDocument('player'),input:{cycleViewIds:['third-person','first-person','shoulder']}}});try{
  const r=world.humanoid!;r.applyProfile({character:{speed:5}});
  const before=world.snapshot();
  const config=r.inspectConfiguration();
  expect(config.profile.character?.speed).toBe(5);
  expect(config.effective).not.toHaveProperty('camera');
  expect(config.effective.control).toHaveProperty('coastDeceleration');
  expect(config.effective.control).not.toHaveProperty('rollResponse');
  expect(world.snapshot()).toEqual(before);
  world.setCameraView('first-person');
  expect(r.inspectConfiguration().effective).not.toHaveProperty('camera');
  r.approach('car-1');r.enter('car-1');world.step({},31);
  expect(r.inspectConfiguration().effective).not.toHaveProperty('camera');
  config.profile.character!.speed=999;config.effective.control.speed=999;
  expect(r.exportProfile().character!.speed).not.toBe(999);
 }finally{world.dispose();}
});

 it.each(['wheeled','motorcycle'] as const)('%s opts into brake-turn slip, retains momentum and recovers without affecting low-speed steering',async(mode)=>{
  const trial=async(drift:boolean,speed:number,brake:boolean)=>{const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:{...map,regions:[{...map.regions[0]!,modes:[mode]}],bounds:{min:[-500,-10,-500],max:[500,50,500]},boxes:[{id:'ground',position:[0,-.5,0],size:[1000,1,1000]}]},character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'car-1',assetId:'car',object:new Group(),spec:{...spec,mode,brakeDrift:drift,brakeDeceleration:8,coastDeceleration:1.5,brakeDamping:.65}}]}});try{
   const r=world.humanoid!,sim=r.simulation;sim.controlledActor.vehicleIndex=0;sim.controlledActor.transition=0;
   const v=sim.controlledActor.vehicle!;v.position.set(-30,.03,-50);v.velocity.set(0,0,speed);v.spec.brakeDrift=drift;v.spec.brakeDeceleration=8;v.spec.coastDeceleration=1.5;v.spec.brakeDamping=.65;
   const slip=()=>Math.abs(v.velocity.x*Math.cos(v.yaw)-v.velocity.z*Math.sin(v.yaw));
   world.step({humanoid:{...emptyInput(),forward:brake?-1:0,steer:1}},36);
   const during={slip:slip(),speed:v.velocity.length(),yaw:v.yaw};
   world.step({humanoid:{...emptyInput(),forward:.3}},240);
   return {...during,recovered:slip()};
  }finally{world.dispose();}};
  const regular=await trial(false,25,true),drift=await trial(true,25,true);
  expect(drift.slip).toBeGreaterThan(regular.slip*2);expect(drift.speed).toBeGreaterThan(12);
  expect(drift.recovered).toBeLessThan(drift.slip*.15);
  expect(drift.speed).toBeLessThanOrEqual(25);
  const moderate=await trial(true,8,true);expect(moderate.slip).toBeGreaterThan(1);expect(moderate.speed).toBeGreaterThan(3);
  expect(await trial(true,2,true)).toEqual(await trial(false,2,true));
  expect(await trial(true,25,false)).toEqual(await trial(false,25,false));
 });

it('keeps native preparation independent of camera installation and named view selection',async()=>{
 const world=await fixture();try{
  const runtime=world.humanoid!,start={positionWorldMetersXYZ:[0,.03,0] as [number,number,number],facingYawRadians:0};
  expect(()=>runtime.prepareEpisodeStart({...start,cameraViewId:'first-person'} as never)).toThrow('HUMANOID_PLACEMENT_CAMERA_UNSUPPORTED');
  runtime.prepareEpisodeStart(start);expect(world.inspectCamera().document).toBeUndefined();
  expect(()=>runtime.setCameraTarget('player')).toThrow('CAMERA_FOLLOW_REQUIRED');
  world.setCameraFollow({configuration:createHumanoidCameraDocument('player')});
  runtime.prepareEpisodeStart(start);expect(world.inspectCamera().current!.viewId).toBe('third-person');
  world.setCameraView('first-person');expect(world.snapshot().camera.viewId).toBe('first-person');
 }finally{world.dispose();}
});
