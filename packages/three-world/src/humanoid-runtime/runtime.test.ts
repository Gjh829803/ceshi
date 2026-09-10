import {createRoadVehicleSpec} from './road-vehicle';
import { CameraCollisionSolver } from '@whitebox-world/camera-collision';
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
import type {EnvironmentDefinition} from './environment/types';
import type {VehicleSpec} from './config';
import {WorldKeyboard} from '../input';
import {DEFAULT_KEY_BINDINGS,createKeyBindings,controlHints} from './input';
import {ACTION_TUNING} from './humanoid/action-schema';
import type {MovementSettings} from '../config/control';
const map:EnvironmentDefinition={id:'test',name:'Test',description:'',bounds:{min:[-100,-10,-100],max:[100,50,100]},boxes:[{id:'ground',position:[0,-.5,0],size:[200,1,200]},{id:'wall',position:[0,2,10],size:[30,4,1]}],water:[],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[100,100],color:'#aaa',modes:['wheeled']}],spawns:[{id:'car',name:'Car',vehicleId:'car',position:[-20,.03,0],yaw:0,regionId:'road'}],playerSpawn:[0,.03,0]};
const spec:VehicleSpec={id:'car',name:'Car',en:'CAR',mode:'wheeled',kernel:'test',color:'#fff',spawn:[-20,.03,0],yaw:0,speed:28,accel:10,grip:11,steer:1,radius:1.65,seat:[0,1,0],camera:8,hint:'',archetype:'rover',envelope:{kind:'box',halfExtents:[1.35,1.15,2.15],offset:[0,1.15,0]}};
async function fixture(renderer?:WebGLRenderer){return createWorld({...(renderer?{renderer}:{}),camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'car-1',assetId:'car',spec,object:new Group()},{instanceId:'car-2',assetId:'car',spec:{...spec,spawn:[-40,.03,0]},object:new Group()}]}});}
describe('SDK humanoid runtime',()=>{
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
  const world=await fixture();try{
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
  const world=await fixture();try{
   const runtime=world.humanoid!;
   expect(()=>runtime.setInput({...emptyInput(),humanoid:{prone:true}} as never)).toThrow('HUMANOID_INPUT_INVALID');
   expect(runtime.inputGuide().fields).toHaveProperty('actions');
   expect(runtime.episodeCapabilities().inputAxes).toContain('actions');
   expect(runtime.episodeCapabilities().inputAxes).not.toContain('humanoid');
  }finally{world.dispose();}
 });
 it('exposes in-place recovery through the command path without changing driver or camera mode',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!;
   expect(()=>runtime.command({type:'vehicle.recover'})).toThrow('HUMANOID_COMMAND_BLOCKED');
   runtime.approach('car-1');expect(runtime.enter('car-1')).toBe(true);runtime.setCameraMode(2);
   const v=runtime.simulation.vehicle!;v.position.set(-20,2,-20);v.rotation.setFromAxisAngle(new Vector3(0,0,1),Math.PI);v.velocity.set(2,0,3);
   runtime.command({type:'vehicle.recover'});expect(v.position.x).toBe(-20);expect(v.position.z).toBe(-20);expect(v.velocity.length()).toBe(0);
   expect(runtime.snapshot().mountedInstanceId).toBe('car-1');expect(runtime.snapshot().cameraMode).toBe(2);
  }finally{world.dispose();}
 });
 it('reports a real boarding approach and the same enter eligibility without moving or clearing failure state',async()=>{
  const world=await fixture();try{const r=world.humanoid!,s=r.simulation;
   world.step({});const before=world.getEntityState('player');const time=s.time;s.message='preserve observation state';
   const far=r.inspectBoarding('car-1');expect(far).toMatchObject({eligible:false,reason:'VEHICLE_MOUNT_OUT_OF_REACH'});expect(far.approachPositionWorldMetersXYZ).not.toBeNull();
   expect(world.getEntityState('player')).toEqual(before);expect(s.time).toBe(time);expect(s.message).toBe('preserve observation state');
   r.approach('car-1');expect(world.getEntityState('player').positionWorldMetersXYZ).toEqual(far.approachPositionWorldMetersXYZ);
   expect(r.inspectBoarding('car-1').eligible).toBe(true);expect(r.enter('car-1')).toBe(true);
   expect(r.inspectBoarding('car-2')).toMatchObject({eligible:false,reason:'HUMANOID_TRANSITION_ACTIVE'});
   world.step({},31);expect(r.inspectBoarding('car-2')).toMatchObject({eligible:false,reason:'HUMANOID_ALREADY_MOUNTED'});
  }finally{world.dispose();}
 });

 it('shares mounted boarding eligibility with execution and keeps the query read-only',async()=>{
  const world=await createMountedFixture();try{const r=world.humanoid!,s=r.simulation;
   expect(r.inspectBoarding('horse-1').eligible).toBe(true);
   s.humanoid.position.set(0,.025,2.4);const before=world.snapshot();
   expect(r.inspectBoarding('horse-1')).toMatchObject({eligible:false,reason:'VEHICLE_MOUNT_SIDE_REQUIRED'});
   expect(world.snapshot()).toEqual(before);expect(r.enter('horse-1')).toBe(false);expect(s.failureCode).toBe('VEHICLE_MOUNT_SIDE_REQUIRED');
  }finally{world.dispose();}
 });
 it('applies explicit humanoid response and collision radius independently of distance',async()=>{
  const world=await fixture();try{const r=world.humanoid!,c=r.followCamera;
   world.step({});c.reset(r.simulation);c.update(r.simulation,0);const target=c.target.y;
   r.applyProfile({camera:{targetHeightOffset:.5,followResponsePerSecond:11}});c.update(r.simulation,.1);
   expect(c.target.y-target).toBeCloseTo(.5*(1-Math.exp(-1.1)),8);
   r.applyProfile({camera:{targetHeightOffset:0,collisionRadiusMeters:.7}});
   r.switchMap({...map,boxes:[map.boxes[0]!,{id:'eye-block',position:[0,2.5,-8],size:[1,5,1]}]});world.step({});
   const h=r.simulation.humanoid!;
   expect(h.world.intersectionWithShape(c.camera.position,new Quaternion(),new RAPIER.Ball(.69),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,h.capsule)).toBeNull();
  }finally{world.dispose();}
 });
 it.each([80,55])('applies explicit humanoid FOV %s without a distance override and preserves it across reset/map',async fov=>{
  const world=await fixture();try{const r=world.humanoid!;
   r.applyProfile({camera:{baseFovDegrees:fov}});world.step({});expect(r.camera.fov).toBe(fov);
   expect(r.followCamera.baseDistance).toBeUndefined();
   r.applyProfile({character:{speed:5}});await world.reset();expect(r.camera.fov).toBe(fov);
   r.switchMap(map);expect(r.camera.fov).toBe(fov);
  }finally{world.dispose();}
 });
 it('preserves humanoid and vehicle camera defaults after unrelated profiles, distance, reset and map replacement',async()=>{
  const world=await fixture();try{const r=world.humanoid!;world.step({});expect(r.camera.fov).toBe(58);
   r.applyProfile({character:{speed:5},cameraDistanceMeters:9});world.step({});expect(r.camera.fov).toBe(58);
   await world.reset();expect(r.camera.fov).toBe(58);r.switchMap(map);expect(r.camera.fov).toBe(58);
   r.approach('car-1');r.enter('car-1');world.step({},180);expect(r.camera.fov).toBeCloseTo(55,2);
  }finally{world.dispose();}
 });
 it('observes input precedence, consumed one-shots and source time without advancing or exposing mutable inputs',async()=>{
  const world=await fixture();try{const r=world.humanoid!;
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
  const world=await fixture();try{const r=world.humanoid!,before=world.snapshot();
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

 it.each([0,1,2] as const)('uses radians for pointer pitch in camera mode %s on foot and mounted',async mode=>{
  const world=await fixture();try{const r=world.humanoid!;
   for(const mounted of [false,true]){
    if(mounted){r.approach('car-1');r.enter('car-1');}
    r.setCameraMode(mode);r.advance({},1/60);const before=r.followCamera.pitch;
    r.advance({},1/60,{pitchDeltaRadians:.1});expect(r.followCamera.pitch-before).toBeCloseTo(.1,8);
   }
  }finally{world.dispose();}
 });
 it('keeps a configured zero vehicle arm finite for canonical and legacy zoom',async()=>{
  const world=await fixture();try{const r=world.humanoid!;r.applyProfile({vehicles:{'car-1':{camera:0}}});r.approach('car-1');r.enter('car-1');r.advance({},1/60);
   r.advance({},1/60,{distanceDeltaMeters:1});expect(r.followCamera.zoom).toBe(1);
   r.followCamera.scroll(100,r.simulation);expect(r.followCamera.zoom).toBeCloseTo(1.07);
  }finally{world.dispose();}
 });
 it('uses meters for the mounted nominal arm distance',async()=>{
  const world=await fixture();try{const r=world.humanoid!;r.approach('car-1');r.enter('car-1');r.advance({},1/60);
   const before=r.followCamera.zoom*spec.camera;r.advance({},1/60,{distanceDeltaMeters:1});
   expect(r.followCamera.zoom*spec.camera-before).toBeCloseTo(1,8);
  }finally{world.dispose();}
 });
 it('returns truthful relocation feedback and replays approach receipts without moving twice',async()=>{
  const world=await fixture();try{
   const receipt=await world.execute({type:'vehicle.approach',instanceId:'car-1'},{commandId:'approach-once'});
   expect(receipt).toMatchObject({status:'applied',result:{kind:'relocation',entityId:'player',vehicleInstanceId:'car-1',positionWorldMetersXYZ:world.getEntityState('player').positionWorldMetersXYZ}});
   const before=world.snapshot();expect(await world.execute({type:'vehicle.approach',instanceId:'car-1'},{commandId:'approach-once'})).toEqual(receipt);expect(world.snapshot()).toEqual(before);
   expect(await world.execute({type:'vehicle.approach',instanceId:'missing'})).toMatchObject({status:'rejected'});
  }finally{world.dispose();}
 });

 it('persists the configured default view while keyboard permission leaves programmatic modes available',async()=>{
  const world=await fixture();try{const r=world.humanoid!;
   r.applyProfile({view:{defaultPerspective:'first-person',keyboardToggleEnabled:true}});
   expect(r.snapshot()).toMatchObject({cameraMode:1,view:{defaultPerspective:'first-person',keyboardToggleEnabled:true}});
   world.step({cameraTogglePressed:true},3);expect(r.snapshot().cameraMode).toBe(2);
   r.applyProfile({view:{keyboardToggleEnabled:false}});
   world.step({cameraTogglePressed:true});expect(r.snapshot().cameraMode).toBe(2);
   r.setCameraMode(2);expect(r.snapshot().cameraMode).toBe(2);
   await world.reset();expect(r.snapshot().cameraMode).toBe(1);
   expect(r.exportProfile().view).toEqual({defaultPerspective:'first-person',keyboardToggleEnabled:false});
   r.setCameraMode(0);r.switchMap(map);expect(r.snapshot().cameraMode).toBe(1);
   r.prepareEpisodeStart({positionWorldMetersXYZ:[0,.03,0],facingYawRadians:0});expect(r.snapshot().cameraMode).toBe(1);
   r.prepareEpisodeStart({positionWorldMetersXYZ:[0,.03,0],facingYawRadians:0,humanoid:{cameraMode:0}});expect(r.snapshot().cameraMode).toBe(0);
   expect(r.exportProfile().view?.defaultPerspective).toBe('first-person');
  }finally{world.dispose();}
 });
 it('keeps camera toggle edges across short frames and consumes them once in multi-tick frames',async()=>{
  const world=await fixture();try{const r=world.humanoid!,engine=(world as unknown as {engine:WorldEngine}).engine;
   r.applyProfile({view:{keyboardToggleEnabled:true}});
   engine.advance(1/120,{cameraTogglePressed:true});expect(r.snapshot().cameraMode).toBe(0);
   engine.advance(1/120,{});expect(r.snapshot().cameraMode).toBe(1);
   engine.advance(3/60,{cameraTogglePressed:true});expect(r.snapshot().cameraMode).toBe(2);
   engine.advance(1/60,{cameraTogglePressed:true});expect(r.snapshot().cameraMode).toBe(0);
   engine.advance(1/120,{cameraTogglePressed:true});world.stop();world.step({});expect(r.snapshot().cameraMode).toBe(0);
   world.useAuthoredCamera();world.step({cameraTogglePressed:true});expect(r.cameraMode).toBe('authored');
  }finally{world.dispose();}
 });
 it('maps one configurable camera key edge without toggling on repeat or after clearing',()=>{
  const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidMode(()=>false);keyboard.enabled=true;
  keyboard.keyDown('KeyT');expect(keyboard.sample().cameraTogglePressed).toBe(true);
  keyboard.keyDown('KeyT',true);expect(keyboard.sample().cameraTogglePressed).toBe(false);
  keyboard.keyUp('KeyT');keyboard.keyDown('KeyT');keyboard.clear();expect(keyboard.sample().cameraTogglePressed).toBe(false);
  keyboard.setKeyBindings({cameraToggle:['KeyV']});keyboard.keyDown('KeyT');expect(keyboard.sample().cameraTogglePressed).toBe(false);
  keyboard.keyDown('KeyV');expect(keyboard.sample().cameraTogglePressed).toBe(true);
 });
 it.each([false,true])('cycles T through all three views once per press while mounted=%s',async mounted=>{
  const world=await fixture();try{const r=world.humanoid!;
   r.applyProfile({view:{keyboardToggleEnabled:true}});
   if(mounted){r.approach('car-1');expect(r.enter('car-1')).toBe(true);world.step({},31);}
   const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidMode(()=>mounted);keyboard.enabled=true;
   for(const expected of [1,2,0,1]){
    keyboard.keyDown('KeyT');world.step(keyboard.sample(),3);expect(r.snapshot().cameraMode).toBe(expected);
    keyboard.keyDown('KeyT',true);world.step(keyboard.sample());expect(r.snapshot().cameraMode).toBe(expected);
    keyboard.keyUp('KeyT');
   }
  }finally{world.dispose();}
 });
 it('preserves authored camera ownership across map replacement and reset with a saved first-person preference',async()=>{
  const world=await fixture();try{const r=world.humanoid!;
   r.applyProfile({view:{defaultPerspective:'first-person',keyboardToggleEnabled:true}});world.useAuthoredCamera();
   r.switchMap(map);expect(r.cameraMode).toBe('authored');
   world.step({cameraTogglePressed:true});expect(r.cameraMode).toBe('authored');
   await world.reset();expect(r.cameraMode).toBe('authored');
   expect(r.exportProfile().view?.defaultPerspective).toBe('first-person');
  }finally{world.dispose();}
 });
 it('uses a fresh sprint+crouch edge for slide and remaps movement, HUD and action admission together',()=>{
  const keyboard=new WorldKeyboard(()=>0,()=>{throw new Error('unexpected reset');});keyboard.setHumanoidMode(()=>false);keyboard.enabled=true;
  keyboard.keyDown('KeyC');keyboard.keyDown('ShiftLeft');expect(keyboard.sample().humanoid?.actions).toEqual({toggleCrouch:true});
  expect(keyboard.sample().humanoid?.actions).toEqual({});keyboard.keyUp('KeyC');keyboard.keyDown('KeyC');expect(keyboard.sample().humanoid?.actions).toEqual({slide:true});
  keyboard.keyDown('KeyC',true);expect(keyboard.sample().humanoid?.actions).toEqual({});keyboard.clear();
  keyboard.keyDown('ControlLeft');expect(keyboard.sample().humanoid).toMatchObject({slow:false,actions:{toggleCrouch:true}});
  keyboard.setKeyBindings({forward:['KeyI'],crouch:['KeyB']});expect(keyboard.sample().humanoid?.actions).toEqual({});
  keyboard.keyDown('KeyW');keyboard.keyDown('KeyC');expect(keyboard.sample().humanoid?.forward).toBe(0);
  keyboard.keyDown('KeyI');keyboard.keyDown('ShiftRight');keyboard.keyDown('KeyB');expect(keyboard.sample().humanoid).toMatchObject({forward:1,boost:true,actions:{slide:true}});
  expect(controlHints(keyboard.getKeyBindings())).toContainEqual(['B','蹲伏 / 站立；攀爬时松手']);
  expect(()=>createKeyBindings({crouch:['KeyW']})).toThrow('KEY_BINDING_CONFLICT');expect(()=>createKeyBindings({roll:['Escape']})).toThrow('KEY_BINDINGS_INVALID');
  expect(DEFAULT_KEY_BINDINGS.roll).toEqual(['KeyQ']);
 });
 it('probes and prepares near-table starts with the same humanoid capsule used for movement',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!;
   runtime.switchMap({...map,boxes:[map.boxes[0]!,{id:'table',position:[0,.45,.835],size:[2,.9,1]}]});
   const start={positionWorldMetersXYZ:[0,.02,0] as const,facingYawRadians:Math.PI};
   const before=world.getEntityState('player').positionWorldMetersXYZ;
   expect(runtime.probeEpisodeStart(start).isValid).toBe(true);expect(world.getEntityState('player').positionWorldMetersXYZ).toEqual(before);
   expect(()=>runtime.prepareEpisodeStart(start)).not.toThrow();world.step({},30);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeCloseTo(0,2);
   expect(runtime.probeEpisodeStart({...start,positionWorldMetersXYZ:[0,.02,.1]}).isValid).toBe(false);
  }finally{world.dispose();}
 });
 it('keeps a physical slide low under a ceiling until continued movement clears the exit',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!;
   runtime.switchMap({...map,boxes:[map.boxes[0]!,{id:'low-roof',position:[0,1.35,5.5],size:[4,.3,5]}]});
   runtime.simulation.setHumanoidAssets(new Set(['slide-start','slide-loop','slide-exit']),[]);world.step({},30);world.step({humanoid:{...emptyInput(),forward:1,boost:true}},30);
   const start=await world.execute({type:'humanoid.perform-action',request:{requestId:'tunnel-slide',action:'slide'}});if(start.status!=='accepted')throw new Error('Slide was not accepted');
   world.step({},180);expect(world.operations.get(start.operationId).status).toBe('running');expect(runtime.simulation.humanoid!.capsuleHeight).toBeCloseTo(ACTION_TUNING.slideHeightMeters);
   const stopped=world.getEntityState('player').positionWorldMetersXYZ[2];world.step({},30);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeCloseTo(stopped);
   world.step({humanoid:{...emptyInput(),forward:1}},420);expect(world.operations.get(start.operationId).status).toBe('succeeded');expect(runtime.simulation.humanoid!.capsuleHeight).toBeCloseTo(ACTION_TUNING.standingHeightMeters);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(8.25);
  }finally{world.dispose();}
 });
 it('rejects mounted skills immediately and shares rejection conditions with the capability query',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!;runtime.simulation.setHumanoidAssets(new Set(['roll','slide-start','slide-loop','slide-exit']),[]);world.step({},30);
   expect(runtime.characterCapabilities().find(c=>c.id==='slide')).toMatchObject({eligible:false,reason:'SPEED_TOO_LOW',parameters:{minimumSpeedMetersPerSecond:ACTION_TUNING.slideMinimumSpeedMetersPerSecond}});
   expect(runtime.approach('car-1')).toBe(true);expect(runtime.enter('car-1')).toBe(true);
   const request={requestId:'mounted-roll',action:'roll' as const};
   expect(runtime.characterCapabilities().find(c=>c.id==='roll')).toMatchObject({eligible:false,reason:'HUMANOID_TRANSITION_ACTIVE'});
   expect(await world.execute({type:'humanoid.perform-action',request})).toMatchObject({status:'rejected',error:{code:'HUMANOID_TRANSITION_ACTIVE'}});
   expect(runtime.simulation.humanoid!.skills.status(request.requestId)).toBeNull();world.step({},60);
   const result=await world.execute({type:'humanoid.perform-action',request});
   expect(result).toMatchObject({status:'rejected',error:{code:'MOUNTED'}});expect(runtime.characterCapabilities().find(c=>c.id==='roll')).toMatchObject({eligible:false,reason:'MOUNTED'});
   world.step({},180);expect(world.snapshot().humanoid?.character.activeAction).toBeNull();
  }finally{world.dispose();}
 });
 it('returns authored approach anchors and exactly the eligibility used by target execution',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!;
   runtime.switchMap({...map,interactions:[{id:'seat',label:'Seat',kind:'seat',position:[5,.5,5],approach:[5,.03,4],yaw:.4}]});
   runtime.simulation.setHumanoidAssets(new Set(['sit-enter','sit-idle']),[]);world.step({},30);
   const before=world.getEntityState('player').positionWorldMetersXYZ,target=runtime.snapshot().interactionTargets[0]!;
   expect(target).toMatchObject({id:'seat',approachPositionWorldMetersXYZ:[5,.03,4],facingYawRadians:.4,eligible:false,reason:'OUT_OF_REACH'});
   const result=await world.execute({type:'humanoid.perform-action',request:{requestId:'distant-seat',action:'sit',targetId:'seat'}});
   expect(result).toMatchObject({status:'rejected',error:{code:target.reason}});expect(world.getEntityState('player').positionWorldMetersXYZ).toEqual(before);
   (target.approachPositionWorldMetersXYZ as unknown as number[])[0]=100;expect(runtime.snapshot().interactionTargets[0]!.approachPositionWorldMetersXYZ[0]).toBe(5);
  }finally{world.dispose();}
 });
 it('moves seat anchors with a compound prop and rejects a toppled seat',async()=>{
  const world=await fixture();try{const r=world.humanoid!;
   r.switchMap({...map,boxes:[map.boxes[0]!,{id:'chair-shape',position:[5,.5,5],size:[1,1,1],rigidGroup:{id:'chair',massKg:8}}],interactions:[{id:'chair-seat',label:'Seat',kind:'seat',position:[5,1,5],approach:[5,0,4],yaw:0,colliderIds:['chair-shape']}]});
   r.simulation.setHumanoidAssets(new Set(['sit-enter','sit-idle']),[]);world.step({},30);
   const body=r.environment.colliderForId('chair-shape')!.parent()!;body.setTranslation({x:8,y:.5,z:5},true);body.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2),true);world.step({},1);
   const target=r.snapshot().interactionTargets[0]!;expect(target.positionWorldMetersXYZ[0]).toBeGreaterThan(7);expect(target.reason).toBe('SEAT_UNSTABLE');
   r.environment.resetProps();world.step({},1);expect(r.snapshot().interactionTargets[0]!.positionWorldMetersXYZ[0]).toBeCloseTo(5,2);
  }finally{world.dispose();}
 });
 it('uses E to enter a collider-backed climb, Space to attempt the top and crouch to release',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!;
   runtime.switchMap({...map,boxes:[map.boxes[0]!,{id:'climb-wall',position:[0,1.5,1],size:[3,3,1]}],climbSurfaces:[{id:'face',colliderId:'climb-wall',kind:'wall',center:[0,1.5,.5],normal:[0,0,-1],width:3,minY:0,maxY:3}]});
   runtime.simulation.setHumanoidAssets(new Set(['hang-enter','hang-exit','hang-idle','hang-left','hang-right','climb-up','climb-down']),[]);world.step({},30);
   expect(runtime.characterCapabilities().find(c=>c.id==='climb')).toMatchObject({eligible:true});
   world.step({humanoid:{...emptyInput(),actions:{interact:true}}},1);expect(runtime.snapshot().surface).toMatchObject({mode:'climbing',surfaceId:'face'});
   world.step({},180);world.step({humanoid:{...emptyInput(),jump:true}},1);expect(runtime.snapshot().surface.mode).toBe('climbing');
   world.step({humanoid:{...emptyInput(),actions:{toggleCrouch:true}}},1);expect(runtime.snapshot().surface.mode).toBe('none');
  }finally{world.dispose();}
 });
 it('consumes Space as standing up from crouch before allowing another jump',async()=>{
  const world=await fixture();try{world.step({},30);world.step({humanoid:{...emptyInput(),actions:{toggleCrouch:true}}},1);expect(world.snapshot().humanoid?.character.stance).toBe('crouch');
   world.step({humanoid:{...emptyInput(),jump:true}},1);expect(world.snapshot().humanoid?.character.stance).toBe('stand');expect(world.humanoid!.simulation.humanoid!.vertical).toBe(0);
   world.step({humanoid:{...emptyInput(),jump:true}},1);expect(world.humanoid!.simulation.humanoid!.vertical).toBeGreaterThan(0);
  }finally{world.dispose();}
 });

 it('replaces overview with a near right-shoulder camera, keeps actor translation and recovers speed framing',async()=>{
  const world=await fixture();try{
   const r=world.humanoid!,s=r.simulation,c=r.followCamera;for(let i=0;i<20;i++)r.advance({},1/60);
   r.setCameraMode(2);expect(c.distance).toBeCloseTo(2);expect(c.camera.position.x).toBeLessThan(s.player.position.x-.3);
   expect(c.camera.position.distanceTo(s.player.position)).toBeLessThan(3);
   const relative=c.camera.position.clone().sub(s.player.position);
   s.player.position.x+=4;c.update(s,1/60);expect(c.camera.position.clone().sub(s.player.position).distanceTo(relative)).toBeLessThan(.01);
   s.player.velocity.set(0,0,5.8);for(let i=0;i<120;i++)c.update(s,1/60);
   expect(c.distance).toBeGreaterThan(2.25);expect(c.camera.fov).toBeCloseTo(c.tuning.baseFovDegrees+4,1);
   s.player.velocity.set(0,0,0);for(let i=0;i<120;i++)c.update(s,1/60);expect(c.distance).toBeCloseTo(2,1);expect(c.camera.fov).toBeCloseTo(c.tuning.baseFovDegrees,1);
   c.scroll(-10000,s);c.update(s,1/60);expect(c.distance).toBeCloseTo(1.3);
   r.setCameraMode(1);expect(c.distance).toBe(0);r.setCameraMode(0);expect(c.distance).toBeGreaterThan(3);
  }finally{world.dispose();}
 });
 it.each([false,true])('reports shoulder offset framing while preserving configured camera behavior (mounted=%s)',async mounted=>{
  const world=await fixture();try{
   const r=world.humanoid!,s=r.simulation,c=r.followCamera;world.step({},60);
   if(mounted){expect(r.approach('car-1')).toBe(true);expect(r.enter('car-1')).toBe(true);world.step({},60);}
   const baseline=[0,1,2].map(mode=>{r.setCameraMode(mode as 0|1|2);return {eye:c.camera.position.clone(),target:c.target.clone(),distance:c.distance};});
   expect(r.inspectConfiguration().effective.camera.framing.issues).toEqual([]);
   r.applyProfile({cameraDistanceMeters:11,camera:{targetHeightOffset:1.1}});r.setCameraMode(2);
   expect(c.camera.position.y-baseline[2]!.eye.y).toBeCloseTo(1.1);expect(c.distance).toBeCloseTo(2);
   const snapshot=world.snapshot(),state=c.collisionState,matrices=[c.camera.matrix.clone(),c.camera.matrixWorld.clone(),c.camera.matrixWorldInverse.clone()];
   const framing=world.describe().humanoid!.configuration.effective.camera.framing;
   expect(framing).toMatchObject({advisory:true,status:'observed',issues:[{code:'SHOULDER_FRAMING_OFFSET_REVIEW'}]});
   expect(framing.headScreenPositionNormalizedXY![1]).toBeGreaterThan(.9);
   expect(world.snapshot()).toEqual(snapshot);expect(c.collisionState).toEqual(state);expect([c.camera.matrix,c.camera.matrixWorld,c.camera.matrixWorldInverse]).toEqual(matrices);
   r.setCameraMode(1);expect(c.camera.position.distanceTo(baseline[1]!.eye)).toBeLessThan(1e-6);
   expect(r.inspectConfiguration().effective.camera.framing).toMatchObject({status:'not-applicable',reason:'first-person',headInFrame:null,issues:[]});
   r.setCameraMode(0);expect(c.target.y-baseline[0]!.target.y).toBeCloseTo(1.1);expect(c.distance).toBeCloseTo(11);
   expect(r.exportProfile()).toMatchObject({cameraDistanceMeters:11,camera:{targetHeightOffset:1.1}});
   r.setCameraMode(2);r.applyProfile({camera:{targetHeightOffset:0}});
   expect(r.inspectConfiguration().effective.camera.framing).toMatchObject({status:'observed',offsetsPending:true,sampledOffsets:{targetHeightOffset:1.1,horizontalOffset:0},issues:[{code:'SHOULDER_FRAMING_OFFSET_REVIEW'}]});
   r.setCameraMode(2);expect(r.inspectConfiguration().effective.camera.framing.offsetsPending).toBe(false);
   expect(c.camera.position.distanceTo(baseline[2]!.eye)).toBeLessThan(1e-6);expect(r.inspectConfiguration().effective.camera.framing.issues).toEqual([]);
   await world.reset();r.setCameraMode(2);expect(r.inspectConfiguration().effective.camera.framing.headScreenPositionNormalizedXY![1]).toBeCloseTo(.5);
   world.useAuthoredCamera();expect(r.inspectConfiguration().effective.camera.framing).toMatchObject({status:'not-applicable',reason:'authored-camera',issues:[]});
  }finally{world.dispose();}
 });
 it('samples framing from the displayed camera time without changing collision recovery',async()=>{
  const world=await fixture();try{const r=world.humanoid!,c=r.followCamera,s=r.simulation;
   r.setCameraMode(2);c.capturePresentationPose(s,true);c.beforeFixedUpdate();
   s.time+=1/60;s.player.position.x+=1;c.update(s,1/60);c.capturePresentationPose(s);
   const state=c.collisionState;
   for(const alpha of [.25,.8,1]){
    c.present({position:new Vector3(alpha,s.player.position.y,0),rotation:new Quaternion(),velocity:new Vector3(),yaw:0,speed:0,steering:0},alpha);
    const framing=r.inspectConfiguration().effective.camera.framing;
    expect(framing.sampleSimulationSeconds).toBeCloseTo(alpha/60);expect(framing.headPositionWorldMetersXYZ![0]).toBeCloseTo(alpha);
    expect(framing.headScreenPositionNormalizedXY![1]).toBeCloseTo(.5);expect(framing.issues).toEqual([]);expect(c.collisionState).toEqual(state);
   }
   const leaked=c.framingSample!;leaked.position.set(99,99,99);expect(c.framingSample!.position.x).toBeCloseTo(1);
  }finally{world.dispose();}
 });
 it('does not treat deliberate shoulder offsets as invalid configuration or a passed visual review',async()=>{
  const world=await fixture();try{const r=world.humanoid!,c=r.followCamera;
   r.applyProfile({camera:{targetHeightOffset:.1,horizontalOffset:.1}});r.setCameraMode(2);
   expect(r.inspectConfiguration().effective.camera.framing).toMatchObject({status:'observed',headInFrame:true,issues:[]});
   r.applyProfile({camera:{horizontalOffset:3}});r.setCameraMode(2);
   expect(r.inspectConfiguration().effective.camera.framing).toMatchObject({status:'observed',headInFrame:false,issues:[{code:'SHOULDER_FRAMING_OFFSET_REVIEW'}]});
   expect(r.exportProfile().camera!.horizontalOffset).toBe(3);
   c.camera.quaternion.setFromAxisAngle(new Vector3(0,1,0),0);
   expect(r.inspectConfiguration().effective.camera.framing).toMatchObject({status:'observed',headScreenPositionNormalizedXY:null,headInFrame:false});
   c.camera.projectionMatrix.elements[0]=NaN;
   expect(r.inspectConfiguration().effective.camera.framing).toMatchObject({status:'unavailable',reason:'invalid-projection',headInFrame:null,issues:[]});
  }finally{world.dispose();}
 });
 it('uses the swimming posture eye for shoulder framing after real water entry',async()=>{
  const world=await fixture();try{const r=world.humanoid!,s=r.simulation,c=r.followCamera;
   r.switchMap({...map,water:[{id:'pool',min:[-10,-2,-10],max:[10,4,10],surface:2}]});world.step({},120);
   expect(s.humanoid!.swimming).toBe(true);r.applyProfile({camera:{targetHeightOffset:1}});r.setCameraMode(2);
   const framing=r.inspectConfiguration().effective.camera.framing;
   expect(framing.headPositionWorldMetersXYZ![1]-s.player.position.y).toBeCloseTo(1.35);
   c.camera.updateMatrixWorld(true);const head=s.player.position.clone().add(new Vector3(0,1.35,0)).project(c.camera);
   expect(framing.headScreenPositionNormalizedXY![1]).toBeCloseTo((1-head.y)/2);
   expect(framing.issues).toEqual([expect.objectContaining({code:'SHOULDER_FRAMING_OFFSET_REVIEW'})]);
  }finally{world.dispose();}
 });
 it('retracts the shoulder arm against a wall and restores it after leaving',async()=>{
  const world=await fixture();try{
   const r=world.humanoid!,s=r.simulation,c=r.followCamera;
   s.player.position.set(0,0,8);s.player.yaw=Math.PI;r.setCameraMode(2);
   expect(c.collisionLimited).toBe(true);expect(c.camera.position.z).toBeLessThan(9.5);expect(c.distance).toBeLessThan(1.5);
   s.player.position.z=5;for(let i=0;i<120;i++)c.update(s,1/60);
   expect(c.camera.position.z).toBeLessThan(9.5);expect(c.distance).toBeCloseTo(2,1);
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
 it('uses a zero-arm posture eye for first person and restores third person on reset',async()=>{
  const world=await fixture();try{
   const r=world.humanoid!,c=r.followCamera,s=r.simulation;
   for(let i=0;i<20;i++)r.advance({},1/60);
   r.setCameraMode(1);expect(c.distance).toBe(0);expect(c.camera.near).toBe(.035);
   expect(c.camera.position.y-s.player.position.y).toBeCloseTo(s.humanoid!.capsuleHeight-.12);
   const standing=c.camera.position.y;c.orbit(100,70,s.time,s);c.update(s,0);
   expect(c.yaw).toBeCloseTo(-.4);expect(c.pitch).toBeCloseTo(.28);
   for(let i=0;i<45;i++)r.advance({humanoid:{...emptyInput(),actions:i===0?{toggleCrouch:true}:{}}},1/60);
   expect(c.camera.position.y).toBeLessThan(standing-.2);
   c.scroll(900,s);expect(c.distance).toBe(0);
   r.setCameraMode(0);expect(c.distance).toBeGreaterThan(3);expect(c.camera.near).toBe(.08);
   r.setCameraMode(1);await world.reset();expect(c.mode).toBe(0);expect(c.distance).toBeGreaterThan(3);
  }finally{world.dispose();}
 });
 it('keeps seat look independent of steering and inherits vehicle rotation exactly once',async()=>{
  const world=await fixture();try{
   const r=world.humanoid!,s=r.simulation,c=r.followCamera;
   expect(r.approach('car-1')).toBe(true);expect(r.enter('car-1')).toBe(true);r.setCameraMode(1);const v=s.vehicle!;
   c.orbit(100,0,s.time,s);c.update(s,0);const initialYaw=v.yaw;
   v.yaw+=.7;v.rotation.setFromEuler(new Euler(-.2,v.yaw,.3,'YXZ'));c.update(s,0);
   const actual=c.camera.getWorldDirection(new Vector3());
   const expected=new Vector3(0,0,1).applyQuaternion(new Quaternion().setFromEuler(new Euler(0,-.4,0,'YXZ'))).applyQuaternion(v.rotation);
   expect(actual.distanceTo(expected)).toBeLessThan(1e-6);expect(c.yaw).toBeCloseTo(initialYaw+.3);
   expect(v.steering).toBe(0);expect(v.throttle).toBe(0);
   c.orbit(1e5,-1e5,s.time,s);c.update(s,0);expect(c.pitch).toBeCloseTo(-1.35);expect(Math.abs(c.yaw-v.yaw)).toBeCloseTo(Math.PI*5/6);
  }finally{world.dispose();}
 });
 it.each(['plane','submarine','spacecraft','mount','dragon'] as const)('uses configured %s handling in the physical solver',async(mode)=>{
  const speeds=[];
  for(const stronger of [false,true]){
   const sceneMap:EnvironmentDefinition={...map,boxes:[map.boxes[0]!],water:mode==='submarine'?[{id:'pool',min:[-90,-5,-90],max:[90,40,90],surface:40}]:[],regions:[{...map.regions[0]!,modes:[mode]}],spawns:[]};
   const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:sceneMap,character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:'craft',assetId:'craft',spec:{...spec,mode,spawn:[-20,mode==='mount'?.03:25,-20]},object:new Group()}]}});
   try{const r=world.humanoid!;const tuning:Partial<MovementSettings>=mode==='plane'?{drag:stronger?5:0,dragQuadratic:0}:mode==='submarine'?{verticalAcceleration:stronger?12:2}:mode==='spacecraft'?{grip:0,brakeDamping:stronger?8:0}:mode==='dragon'?{groundDeceleration:stronger?8:1}:{coastDeceleration:stronger?8:1};
    r.applyProfile({vehicles:{craft:tuning}});r.simulation.active=0;r.simulation.transition=0;const v=r.simulation.vehicle!;v.position.set(-20,mode==='mount'||mode==='dragon'?.03:25,-20);v.velocity.set(0,0,mode==='submarine'?0:20);v.speed=v.velocity.length();v.grounded=mode==='mount'||mode==='dragon';
    world.step({humanoid:{...emptyInput(),lift:mode==='submarine'?1:0,boost:mode==='spacecraft'}},30);speeds.push(mode==='submarine'?v.velocity.y:v.velocity.z);
    expect(r.snapshot().controls.vehicles.craft).toMatchObject(tuning);
   }finally{world.dispose();}
  }
  if(mode==='submarine')expect(speeds[1]!-speeds[0]!).toBeGreaterThan(3);else expect(speeds[0]!-speeds[1]!).toBeGreaterThan(2);
 });
 it('tunes release deceleration independently per instance and preserves it through reset',async()=>{
  const world=await fixture();try{const r=world.humanoid!;
   r.applyProfile({vehicles:{'car-1':{coastDeceleration:1},'car-2':{coastDeceleration:8}}});
   r.applyProfile({vehicles:{'car-1':{directionChangeDeceleration:4,groundDeceleration:3}}});
   const velocities=[];
   for(const id of ['car-1','car-2']){r.simulation.active=id==='car-1'?0:1;r.simulation.transition=0;const v=r.simulation.vehicle!;v.velocity.set(0,0,10);world.step({humanoid:emptyInput()},30);velocities.push(v.velocity.z);}
   expect(velocities[0]).toBeCloseTo(9.5,1);expect(velocities[1]).toBeCloseTo(6,1);
   expect(r.exportProfile().vehicles?.['car-1']?.accel).toBe(10);
   await world.reset();expect(r.exportProfile().vehicles?.['car-1']?.coastDeceleration).toBe(1);
  }finally{world.dispose();}
 });
 it('configures independent boosted speed, steering response and character stopping acceleration atomically',async()=>{
  const world=await fixture();try{const r=world.humanoid!;
   r.applyProfile({vehicles:{'car-1':{speed:4,maxSpeed:7,reverseSpeed:2,steeringResponse:3,steeringReturn:20}},character:{coastDeceleration:1}});
   const before=r.exportProfile();expect(()=>r.applyProfile({vehicles:{'car-1':{coastDeceleration:-1}},character:{speed:99}})).toThrow();expect(r.exportProfile()).toEqual(before);
   r.simulation.active=0;r.simulation.transition=0;world.step({humanoid:{...emptyInput(),forward:1}},90);expect(r.simulation.vehicle!.velocity.z).toBeCloseTo(4,1);
   world.step({humanoid:{...emptyInput(),forward:1,boost:true}},60);expect(r.simulation.vehicle!.velocity.z).toBeCloseTo(7,1);
   r.simulation.active=-1;r.prepareCharacter([0,.03,-20]);world.step({moveZRatio:-1},60);const speed=r.simulation.player.velocity.length();world.step({},30);expect(r.simulation.player.velocity.length()).toBeGreaterThan(speed-.7);
   r.switchMap({...map,id:'tuning-map'});expect(r.exportProfile().vehicles?.['car-1']?.maxSpeed).toBe(7);
  }finally{world.dispose();}
 });
 it('rejects invalid authored vehicle tuning during world creation',async()=>{
  await expect(createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'car-1',assetId:'car',spec:{...spec,coastDeceleration:-1},object:new Group()}]}})).rejects.toThrow('HUMANOID_CONTROL_INVALID: coastDeceleration');
 });
 it.each([
  {name:'thin pillar',position:[0,2,-2],size:[.06,4,.2]},
  {name:'head above low wall',position:[0,1.125,-2],size:[6,2.25,.2]},
  {name:'feet below overhang',position:[0,3,-2],size:[6,3,.2]},
  {name:'right capsule edge',position:[-2.1,2,-2],size:[4.4,4,.2]},
  {name:'left capsule edge',position:[2.1,2,-2],size:[4.4,4,.2]},
 ])('keeps full framing when only the $name blocks the centre ray',async({position,size})=>{
  const world=await fixture();try{const r=world.humanoid!;
   r.switchMap({...map,id:'partial',boxes:[map.boxes[0]!,{id:'occluder',position:position as [number,number,number],size:size as [number,number,number]}]});
   world.step({},1);expect(r.followCamera.distance).toBeCloseTo(8.8);expect(r.followCamera.collisionLimited).toBe(false);
   const eye=world.camera.position.clone();
   world.render();expect(world.camera.position.distanceTo(eye)).toBeLessThan(1e-9);
   expect(r.followCamera.presentationTarget.distanceTo(world.camera.position)).toBeCloseTo(8.8);
   world.step({},90);world.render();expect(world.camera.position.distanceTo(eye)).toBeLessThan(.03);
  }finally{world.dispose();}
 });
 it('still keeps the camera sphere out of geometry when the capsule is partly visible',async()=>{
  const world=await fixture();try{const r=world.humanoid!;
   r.switchMap({...map,id:'eye-wall',boxes:[map.boxes[0]!,{id:'eye-post',position:[0,4,-8.25],size:[.1,6,.4]}]});world.step({},1);
   expect(world.camera.position.z).toBeGreaterThan(-7.9);expect(r.followCamera.collisionLimited).toBe(true);
   const eye=world.camera.position.clone();world.render();expect(world.camera.position.distanceTo(eye)).toBeLessThan(1e-9);
   const h=r.simulation.humanoid!;
   expect(h.world.intersectionWithShape(world.camera.position,new Quaternion(),new RAPIER.Ball(.2),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,h.capsule)).toBeNull();
  }finally{world.dispose();}
 });
 it.each([
  {name:'partial thin pole',position:[0,2,-2],size:[.06,4,.2],blocked:false},
  {name:'full wall',position:[0,2,-2],size:[6,4,.2],blocked:true},
  {name:'eye collision',position:[0,4,-8.25],size:[.1,6,.4],blocked:true},
 ])('uses the same camera collision policy for interpolated $name and exact capture',async({position,size,blocked})=>{
  const world=await fixture();try{
   const r=world.humanoid!,engine=(world as unknown as {engine:WorldEngine}).engine;
   r.switchMap({...map,id:'render-policy',boxes:[map.boxes[0]!,{id:'occluder',position:position as [number,number,number],size:size as [number,number,number]}]});
   world.step({},2);
   const canonical=world.camera.position.clone(),c=r.followCamera;
   const controls={yaw:c.yaw,pitch:c.pitch,distance:c.distance,lastOrbit:c.lastOrbit,target:c.target.clone()};
   engine.render(.5);
   const distance=c.presentationTarget.distanceTo(world.camera.position);
   if(blocked)expect(distance).toBeLessThan(8.6);else expect(distance).toBeCloseTo(8.8);
   const h=r.simulation.humanoid!;
   expect(h.world.intersectionWithShape(world.camera.position,new Quaternion(),new RAPIER.Ball(.2),RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,h.capsule)).toBeNull();
   expect({yaw:c.yaw,pitch:c.pitch,distance:c.distance,lastOrbit:c.lastOrbit,target:c.target}).toEqual(controls);
   world.render();expect(world.camera.position.distanceTo(canonical)).toBeLessThan(1e-9);
  }finally{world.dispose();}
 });
 it('sweeps the actual camera trajectory instead of teleporting through a pillar during orbit',async()=>{
  const world=await fixture();try{const r=world.humanoid!,c=r.followCamera;
   r.switchMap({...map,id:'orbit-wall',boxes:[map.boxes[0]!,{id:'eye-post',position:[0,3,-8],size:[.1,6,2]}]});world.step({},1);
   c.yaw=-.3;c.initialized=false;c.update(r.simulation,1/60);expect(world.camera.position.x).toBeGreaterThan(2);
   c.yaw=.3;c.update(r.simulation,1/60);expect(world.camera.position.x).toBeGreaterThan(.2);
  }finally{world.dispose();}
 });
 it('preserves pointer orbit direction, character pitch limits and manual recenter grace',async()=>{
  const world=await fixture();try{world.step({},1);const r=world.humanoid!,c=r.followCamera;
   r.advance({},1/60,{yawDeltaRadians:-.4,pitchDeltaRadians:.2});
   expect(c.yaw).toBeCloseTo(-.4);expect(c.pitch).toBeCloseTo(.55);expect(c.lastOrbit).toBeCloseTo(1/60);
   r.advance({},1/60,{pitchDeltaRadians:-5});expect(c.pitch).toBe(.12);
   r.advance({cameraPitchRatio:-1},1/60);expect(c.pitch).toBe(.12);
   expect(r.approach('car-1')).toBe(true);expect(r.enter('car-1')).toBe(true);world.step({},1);
   const yaw=c.yaw;r.advance({},1/60,{yawDeltaRadians:-.4,pitchDeltaRadians:.2});
   expect(c.yaw).toBeCloseTo(yaw-.4);expect(c.pitch).toBeCloseTo(.5);
  }finally{world.dispose();}
 });
 it('inherits character translation without stretching the follow arm or changing FOV',async()=>{
  const world=await fixture();try{world.step({},30);const r=world.humanoid!,c=r.followCamera;
   const relative=world.camera.position.clone().sub(r.simulation.player.position),fov=c.camera.fov;
   world.step({moveZRatio:1},90);
   expect(world.camera.position.clone().sub(r.simulation.player.position).distanceTo(relative)).toBeLessThan(.015);
   expect(c.camera.fov).toBe(fov);expect(c.desiredPosition.distanceTo(c.target)).toBeCloseTo(8.8);
   world.step({moveZRatio:-1},90);
   expect(world.camera.position.clone().sub(r.simulation.player.position).distanceTo(relative)).toBeLessThan(.015);
  }finally{world.dispose();}
 });
 it('clips a shoulder offset before it enters a narrow wall, while still retracting for a real obstruction',async()=>{
  const world=await fixture();try{const r=world.humanoid!;
   r.switchMap({...map,id:'narrow',boxes:[map.boxes[0]!,{id:'side',position:[.8,1,-3],size:[.2,2,20]}]});
   r.applyProfile({camera:{horizontalOffset:.8},cameraDistanceMeters:8.8});world.step({},30);
   expect(r.followCamera.distance).toBeGreaterThan(8);expect(r.followCamera.target.x).toBeLessThan(.51);
   r.switchMap({...map,id:'blocked',boxes:[map.boxes[0]!,{id:'back',position:[0,2,-2],size:[10,4,.2]}]});
   r.applyProfile({camera:{horizontalOffset:0}});world.step({},30);
   expect(r.followCamera.collisionLimited).toBe(true);expect(r.followCamera.distance).toBeLessThan(2);
   expect(world.camera.position.z).toBeGreaterThan(-1.7);
  }finally{world.dispose();}
 });
 it('retires map-owned operations on replacement and preserves a refused cancellation until reset',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!;runtime.simulation.setHumanoidAssets(new Set(['roll']),[]);world.step({},30);
   const receipt=await world.execute({type:'humanoid.perform-action',request:{requestId:'map-roll',action:'roll'}});if(receipt.status!=='accepted')throw new Error('roll unavailable');
   const cancel=vi.spyOn(runtime.simulation.humanoid!.skills,'cancel').mockReturnValue({requestId:'map-roll',action:'roll',status:'running',code:'HEADROOM_BLOCKED',message:'cannot cancel safely'});
   expect(()=>world.operations.cancel(receipt.operationId)).toThrow('cannot cancel safely');expect(world.operations.get(receipt.operationId).status).toBe('running');await world.reset();expect(world.operations.get(receipt.operationId).status).toBe('cancelled');cancel.mockRestore();
   world.step({},30);const next=await world.execute({type:'humanoid.perform-action',request:{requestId:'replace-roll',action:'roll'}});if(next.status!=='accepted')throw new Error('roll unavailable');runtime.switchMap({...map,id:'new-map'});expect(world.operations.get(next.operationId).status).toBe('cancelled');expect(world.snapshot().humanoid?.character.activeAction).toBeNull();
  }finally{world.dispose();}
 });
 it('observes source surface progress and map interaction targets without mutable references',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!;runtime.switchMap({...map,interactions:[{id:'parcel',label:'Parcel',kind:'pickup',position:[5,.5,5],approach:[5,.03,4],yaw:0,size:[.5,.5,.5]}]});runtime.simulation.setHumanoidAssets(new Set(['prone-enter','prone-exit','prone-idle','prone-forward']),[]);world.step({},30);world.step({humanoid:{...emptyInput(),actions:{prone:true}}},1);
   const snapshot=runtime.snapshot();expect(snapshot.surface.mode).toBe('prone');expect(snapshot.surface.pose?.actionId).toBe('prone-enter');expect(snapshot.interactionTargets[0]).toMatchObject({id:'parcel',state:'available',positionWorldMetersXYZ:[5,.5,5]});expect(snapshot.traversal).toBeNull();expect(snapshot.vehicleDynamics[0]?.launched).toBe(false);
   world.step({},180);expect(snapshot.surface.pose?.actionId).toBe('prone-enter');expect(runtime.snapshot().surface.pose?.actionId).toBe('prone-idle');await world.reset();expect(runtime.snapshot().surface.mode).toBe('none');
  }finally{world.dispose();}
 });
 it('keeps the original simulation alive when later map staging fails',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!,environment=runtime.environment,humanoid=runtime.simulation.humanoid!,dispose=vi.spyOn(humanoid,'dispose');world.step({},2);const before=world.snapshot();
   const prepare=vi.spyOn(Simulation.prototype,'setHumanoidAssets').mockImplementationOnce(()=>{throw new Error('staged assets failed');});
   expect(()=>runtime.switchMap({...map,id:'replacement'})).toThrow('staged assets failed');prepare.mockRestore();expect(dispose).not.toHaveBeenCalled();expect(runtime.environment).toBe(environment);expect(world.snapshot()).toEqual(before);world.step({moveZRatio:-1},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(1);
  }finally{world.dispose();}
 });
 it('does not let a stale UI input lease release a newer model override',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!,releaseUI=runtime.setInput({...emptyInput(),forward:1});
   expect((await world.execute({type:'humanoid.set-input',input:{...emptyInput(),forward:-1}})).status).toBe('applied');releaseUI();world.step({},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeLessThan(-1);
   const releaseCurrent=runtime.setInput({...emptyInput(),forward:1});releaseCurrent();world.step({moveZRatio:1},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeLessThan(-3);
  }finally{world.dispose();}
 });
 it('projects camera snapshots onto canonical tuning fields and rejects distance as tuning',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!;Object.assign(runtime.followCamera.tuning,{distance:9});runtime.applyProfile({character:{speed:4}});
   expect(runtime.exportProfile().camera).not.toHaveProperty('distance');expect(runtime.followCamera.tuning).not.toHaveProperty('distance');await expect(world.reset()).resolves.toBeUndefined();
   const before=runtime.exportProfile();expect(()=>runtime.applyProfile({camera:{distance:9} as never,character:{speed:7}})).toThrow('HUMANOID_PROFILE_INVALID');expect(runtime.exportProfile()).toEqual(before);
  }finally{world.dispose();}
 });
 it('rejects invalid map and profile updates without disposing the live controller',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!,original=runtime.environment,humanoid=runtime.simulation.humanoid!,dispose=vi.spyOn(humanoid,'dispose');world.step({},2);const before=world.snapshot();
   expect(()=>runtime.switchMap({...map,id:'invalid',interactions:[null] as never})).toThrow();expect(dispose).not.toHaveBeenCalled();expect(runtime.environment).toBe(original);expect(world.snapshot()).toEqual(before);
   const profile=runtime.exportProfile();expect(()=>runtime.applyProfile({character:{speed:8},camera:{baseFovDegrees:Infinity}})).toThrow();expect(runtime.exportProfile()).toEqual(profile);expect(runtime.simulation.characterControl.speed).toBe(profile.character!.speed);
   world.step({moveZRatio:-1},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(1);
  }finally{world.dispose();}
 });
 beforeAll(async()=>{const world=await fixture();world.dispose();});
 it('uses the Episode lease, frame metadata and fixed solver for mounted recordings',async()=>{
  const win=new EventTarget(),doc=Object.assign(new EventTarget(),{defaultView:win,activeElement:null,body:{},documentElement:{},hidden:false});Object.assign(win,{document:doc});vi.stubGlobal('window',win);vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const canvas=Object.assign(new EventTarget(),{width:800,height:600,ownerDocument:doc,getAttribute:()=>null,removeAttribute:()=>{},setAttribute:()=>{},style:{getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty:()=>{},removeProperty:()=>{}},toDataURL:()=> 'data:image/png;base64,dGVzdA=='});let ratio=1;const size=new Vector2(800,600);
  const renderer={shadowMap:{enabled:false,type:PCFShadowMap,needsUpdate:false},domElement:canvas,render:vi.fn(),getSize:(out:Vector2)=>out.copy(size),getPixelRatio:()=>ratio,setPixelRatio:(r:number)=>{ratio=r;},setSize:(x:number,y:number)=>{size.set(x,y);canvas.width=x*ratio;canvas.height=y*ratio;}} as unknown as WebGLRenderer;
  const world=await fixture(renderer);try{await world.start();const port=(win as unknown as {__WORLDKIT_EVAL__:WorldObservation}).__WORLDKIT_EVAL__.episode!;
   const start={positionWorldMetersXYZ:[-20,.03,-20] as const,facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'car-1',mounted:true,cameraMode:2 as const,velocityWorldMetersPerSecondXYZ:[0,0,4] as const}};
   expect(port.capabilities().humanoid?.vehicles).toHaveLength(2);expect(port.probeStart(start).isValid).toBe(true);await port.prepareSegment(start,{widthPixels:640,heightPixels:360});
   const runtime=world.humanoid!,ownedSnapshot=world.snapshot();
   for(const mutate of [()=>runtime.enter('car-1'),()=>runtime.exit(),()=>runtime.command({type:'humanoid.set-input',input:emptyInput()}),()=>runtime.command({type:'humanoid.perform-action',request:{requestId:'external-roll',action:'roll'}}),()=>runtime.setInput(emptyInput()),()=>runtime.clearInput(),()=>runtime.prepareCharacter([0,.03,0]),()=>runtime.prepare('car-1',map.spawns[0]!),()=>runtime.approach('car-1'),()=>runtime.switchMap(map),()=>runtime.applyProfile({}),()=>runtime.advance({},1/60),()=>runtime.reset(),()=>runtime.prepareEpisodeStart(start),()=>runtime.useAuthoredCamera(),()=>runtime.setCameraMode(1)]){
    expect(mutate).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');expect(world.snapshot()).toEqual(ownedSnapshot);
   }
   expect(world.snapshot().humanoid?.mountedInstanceId).toBe('car-1');expect(world.isRunning).toBe(false);expect(()=>world.step({},1)).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');
   const collisionBefore=runtime.followCamera.collisionState;
   const repeatedCollisionFrame=port.frame('image/png');expect(port.frame('image/png')).toEqual(repeatedCollisionFrame);
   expect(runtime.followCamera.collisionState).toEqual(collisionBefore);
   const frame=port.advance({humanoid:{...emptyInput(),forward:1}},60);expect(frame.entities.find(e=>e.id==='car-1')!.positionWorldMetersXYZ[2]).toBeGreaterThan(-16);expect(port.frame('image/png').snapshot.humanoid?.cameraMode).toBe(2);expect(canvas.width).toBe(640);
   port.advance({humanoid:{...emptyInput(),brake:true}},120);
   expect(await port.execute({type:'vehicle.exit'})).toMatchObject({status:'applied'});port.advance({},120);
   expect(await port.execute({type:'vehicle.enter',instanceId:'car-1'})).toMatchObject({status:'applied'});port.advance({},120);
   expect(world.snapshot().humanoid?.mountedInstanceId).toBe('car-1');port.release();
   world.humanoid!.simulation.setHumanoidAssets(new Set(['roll']),[]);
   await port.prepareSegment({positionWorldMetersXYZ:[0,.03,0],facingYawRadians:Math.PI},{widthPixels:640,heightPixels:360});port.advance({},30);
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
   await port.prepareSegment({positionWorldMetersXYZ:[0,.03,0],facingYawRadians:Math.PI},{widthPixels:640,heightPixels:360});expect(port.operation(resetAction.operationId).status).toBe('cancelled');
   port.advance({},30);const releaseAction=await port.execute({type:'humanoid.perform-action',request:{requestId:'episode-release',action:'roll'}});if(releaseAction.status!=='accepted')throw new Error('Episode action rejected');
   port.release();expect(world.operations.get(releaseAction.operationId).status).toBe('cancelled');expect(()=>port.execute({type:'humanoid.set-input',input:null})).toThrow('EPISODE_SEGMENT_NOT_PREPARED');
   await port.prepareSegment(start,{widthPixels:640,heightPixels:360});
   const interactions=vi.spyOn(runtime.simulation,'interact');port.advance({interact:true},1);
   expect(interactions).toHaveBeenCalledTimes(1);expect(()=>world.stop()).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');
   port.advance({interact:true},1);expect(interactions).toHaveBeenCalledTimes(1);
   const visual=vi.fn();runtime.onVisualUpdate(visual);port.advance({},1);
   const captured=port.frame('image/png');expect(port.frame('image/png').snapshot).toEqual(captured.snapshot);expect(visual).toHaveBeenCalledTimes(1);
   world.dispose();expect(()=>runtime.advance({},1/60)).toThrow('HUMANOID_DISPOSED');
  }finally{world.dispose();vi.unstubAllGlobals();}
 });
 it('tracks a physical character action through terminal operation status and clears it on reset',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!;runtime.simulation.setHumanoidAssets(new Set(['roll']),[]);world.step({},30);
   const receipt=await world.execute({type:'humanoid.perform-action',request:{requestId:'roll-1',action:'roll'}});expect(receipt.status).toBe('accepted');
   if(receipt.status!=='accepted')throw new Error('action was not accepted');expect(world.snapshot().humanoid?.character.activeAction?.requestId).toBe('roll-1');
   world.step({},120);expect(world.operations.get(receipt.operationId).status).toBe('succeeded');expect(world.snapshot().humanoid?.character.activeAction).toBeNull();
   const next=await world.execute({type:'humanoid.perform-action',request:{requestId:'roll-2',action:'roll'}});expect(next.status).toBe('accepted');await world.reset();if(next.status==='accepted')expect(world.operations.get(next.operationId).status).toBe('cancelled');expect(world.snapshot().humanoid?.character.activeAction).toBeNull();
  }finally{world.dispose();}
 });
 it('applies humanoid profiles to physical motion, merges edits and preserves configuration across reset',async()=>{
  const world=await fixture();try{world.step({moveZRatio:-1},60);const baseline=world.getEntityState('player').positionWorldMetersXYZ[2];await world.reset();const runtime=world.humanoid!;
   runtime.applyProfile({character:{speed:7.6},vehicles:{'car-1':{speed:12}}});runtime.applyProfile({camera:{baseFovDegrees:65},cameraDistanceMeters:9});
   expect(runtime.exportProfile().vehicles?.['car-1']?.speed).toBe(12);world.step({moveZRatio:-1},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(baseline*1.5);
   await world.reset();expect(runtime.simulation.humanoid!.movementTuning.speedScale).toBe(2);expect(runtime.camera.fov).toBe(65);expect(runtime.followCamera.tuning.baseFovDegrees).toBe(65);expect(runtime.followCamera.baseDistance).toBe(9);expect(runtime.simulation.vehicles[0]!.spec.speed).toBe(12);
  }finally{world.dispose();}
 });
 it('routes all player keys through SDK input and consumes action edges once',()=>{
  let mounted=false;const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setHumanoidMode(()=>mounted);keyboard.enabled=true;
  keyboard.keyDown('KeyW');keyboard.keyDown('KeyE');keyboard.keyDown('KeyF');keyboard.keyDown('Space');
  const first=keyboard.sample();expect(first.humanoid?.forward).toBe(1);expect(first.humanoid?.actions?.interact).toBe(true);expect(first.interactPressed).toBe(true);expect(first.humanoid?.jump).toBe(true);
  const next=keyboard.sample();expect(next.humanoid?.forward).toBe(1);expect(next.humanoid?.actions?.interact).toBeUndefined();expect(next.interactPressed).toBe(false);
  mounted=true;expect(keyboard.sample().humanoid).toMatchObject({roll:1,lift:1,brake:true,jump:false});keyboard.clear();expect(keyboard.sample().humanoid?.forward).toBe(0);
 });
 it('executes closed commands with deduplication and reports failed physical requests',async()=>{
  const world=await fixture();try{
   const first=await world.execute({type:'humanoid.set-camera-mode',mode:2},{commandId:'camera'});expect(first.status).toBe('applied');expect(await world.execute({type:'humanoid.set-camera-mode',mode:2},{commandId:'camera'})).toEqual(first);
   expect((await world.execute({type:'humanoid.set-camera-mode',mode:0},{commandId:'camera'})).status).toBe('rejected');
   expect((await world.execute({type:'vehicle.enter',instanceId:'car-1'})).status).toBe('rejected');
   expect((await world.execute({type:'vehicle.approach',instanceId:'car-1'})).status).toBe('applied');expect((await world.execute({type:'vehicle.enter',instanceId:'car-1'})).status).toBe('applied');
   expect(world.snapshot().humanoid?.mountedInstanceId).toBe('car-1');expect((await world.execute({type:'actor.move-to',entityId:'car-1',targetPositionWorldMetersXYZ:[0,0,0]})).status).toBe('rejected');
  }finally{world.dispose();}
 });
 it('initializes real vehicle Episode state and then advances solely through input',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!,start={positionWorldMetersXYZ:[-20,.03,-20] as const,facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'car-1',mounted:true,cameraMode:1 as const,velocityWorldMetersPerSecondXYZ:[0,0,4] as const,throttle:.6}};
   expect(runtime.probeEpisodeStart(start).isValid).toBe(true);runtime.prepareEpisodeStart(start);expect(runtime.snapshot().mountedInstanceId).toBe('car-1');expect(runtime.simulation.vehicle!.velocity.z).toBe(4);expect(runtime.simulation.vehicle!.throttle).toBe(.6);
   world.step({humanoid:{...emptyInput(),forward:1}},60);expect(world.getEntityState('car-1').positionWorldMetersXYZ[2]).toBeGreaterThan(-16);expect(runtime.episodeCapabilities().vehicles).toHaveLength(2);
   expect(runtime.probeEpisodeStart({...start,positionWorldMetersXYZ:[0,1,10]}).isValid).toBe(false);
  }finally{world.dispose();}
 });
 it('selects one physics owner and keeps observations on actual collided movement',async()=>{
  const create=vi.spyOn(ThreePhysics,'create');const world=await fixture();
  try{expect(create).not.toHaveBeenCalled();const physics=vi.spyOn(world.humanoid!.environment,'stepPhysics');world.step({moveZRatio:-1},240);expect(physics).toHaveBeenCalledTimes(240);const p=world.getEntityState('player');expect(p.positionWorldMetersXYZ[2]).toBeGreaterThan(3);expect(p.positionWorldMetersXYZ[2]).toBeLessThan(9.3);expect(p.motion?.isGrounded).toBe(true);expect(world.simulationTick).toBe(240);}finally{world.dispose();create.mockRestore();}
 });
 it('keeps duplicate asset instances independent and supports physical driving, cameras and complete reset',async()=>{
  const world=await fixture();try{const runtime=world.humanoid!,second=runtime.simulation.vehicles[1]!.position.clone();expect(runtime.approach('car-1')).toBe(true);expect(runtime.enter('car-1')).toBe(true);runtime.setInput({...emptyInput(),forward:1});world.step({},120);expect(runtime.simulation.vehicles[0]!.velocity.length()).toBeGreaterThan(1);expect(runtime.simulation.vehicles[1]!.position.distanceTo(second)).toBeLessThan(.1);for(const mode of [0,1,2] as const){runtime.setCameraMode(mode);world.step({},1);expect(world.snapshot().camera.mode).toBe('follow');expect(world.camera.position.toArray().every(Number.isFinite)).toBe(true);}await world.reset();expect(world.simulationTick).toBe(0);expect(runtime.simulation.active).toBe(-1);expect(runtime.simulation.vehicles.every(v=>v.velocity.length()===0)).toBe(true);expect(runtime.followCamera.mode).toBe(0);world.step({},1);expect(runtime.simulation.vehicles[0]!.speed).toBe(0);}finally{world.dispose();}
 });
 it('resets the active map and rejects unsupported clock rates',async()=>{
  const world=await fixture();try{world.humanoid!.switchMap({...map,id:'second',playerSpawn:[20,.03,20]});world.step({moveZRatio:-1},10);await world.reset();expect(world.humanoid!.environment.map.id).toBe('second');expect(world.getEntityState('player').positionWorldMetersXYZ[0]).toBeCloseTo(20);}finally{world.dispose();}
  await expect(createWorld({humanoid:{map,vehicles:[],character:{instanceId:'p',object:new Group()}},fixedTimeStepSeconds:1/30})).rejects.toThrow('HUMANOID_REQUIRES_60HZ');
 });
});

it('keeps humanoid collision recovery independent of display frequency and other worlds',async()=>{
 const worlds=await Promise.all([fixture(),fixture(),fixture()]);
 try {
  const distances:number[]=[];
  for(const [index,world] of worlds.entries()){
   const r=world.humanoid!,engine=(world as unknown as {engine:WorldEngine}).engine;
   r.switchMap({...map,id:'recovery',boxes:[map.boxes[0]!,{id:'wall',position:[0,2,-2],size:[6,4,.2]}]});
   world.step({},2);expect(r.followCamera.distance).toBeLessThan(2);
   const state=r.followCamera.collisionState;
   for(let frame=0;frame<index*3;frame++)engine.render(.5);
   expect(r.followCamera.collisionState).toEqual(state);
   // Orbit out from behind the obstruction without resetting collision memory.
   r.followCamera.yaw=Math.PI/2;
   for(let tick=0;tick<30;tick++){
    world.step({},1);
    for(let frame=0;frame<index*2;frame++)engine.render(.5);
   }
   world.render();distances.push(r.followCamera.distance);
   expect(r.followCamera.collisionState.authorityTick).toBeGreaterThan(0);
  }
  expect(distances[1]).toBeCloseTo(distances[0]!,10);expect(distances[2]).toBeCloseTo(distances[0]!,10);
  const peer=worlds[1]!.humanoid!.followCamera.collisionState;
  await worlds[0]!.reset();worlds[0]!.step({},1);
  expect(worlds[1]!.humanoid!.followCamera.collisionState).toEqual(peer);
 }finally{worlds.forEach(world=>world.dispose());}
});

it('uses a committed fallback so an emergency display is independent of earlier render alphas',async()=>{
 const world=await fixture();
 try {
  const r=world.humanoid!,c=r.followCamera;
  // Deterministic query seam: the second half of the interpolation has an
  // inseparable pivot; either committed eye remains physically clear.
  Object.defineProperty(c,'collision',{value:new CameraCollisionSolver((a,b)=>a[0]>1&&a[2]>-5?
   {distanceMeters:0,startedOverlapping:true,normalWorldXYZ:[1,0,0],penetrationDepthMeters:.01,colliderEntityId:'narrow-gap'}:
   {distanceMeters:Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])})});
  r.simulation.player.position.set(0,0,0);c.target.set(0,1,0);c.camera.position.set(0,3,-8);c.capturePresentationPose(r.simulation,true);c.beforeFixedUpdate();
  r.simulation.player.position.set(2,0,0);c.target.set(2,1,0);c.camera.position.set(2,3,-8);c.capturePresentationPose(r.simulation);
  const pose=(alpha:number)=>({position:new Vector3(2*alpha,0,0),rotation:new Quaternion(),velocity:new Vector3(),yaw:0,speed:0,steering:0,cameraHeight:1});
  c.present(pose(.8),.8);const direct=c.camera.position.clone(),state=c.collisionState;
  c.present(pose(.2),.2);expect(c.camera.position.distanceTo(direct)).toBeGreaterThan(.1);
  c.present(pose(.8),.8);expect(c.camera.position).toEqual(direct);expect(c.collisionState).toEqual(state);
 }finally{world.dispose();}
});


it('separates the saved profile from active resolved camera settings without mutating runtime state',async()=>{
 const world=await fixture();try{
  const r=world.humanoid!;r.applyProfile({camera:{baseFovDegrees:70}});
  const before=world.snapshot();
  const config=r.inspectConfiguration();
  expect(config.profile.camera).toEqual({baseFovDegrees:70});
  expect(config.effective.camera.settings).toMatchObject({baseFovDegrees:70,followResponsePerSecond:7,collisionRadiusMeters:.2});
  expect(config.effective.control).toHaveProperty('coastDeceleration');
  expect(config.effective.control).not.toHaveProperty('rollResponse');
  expect(world.snapshot()).toEqual(before);
  r.setCameraMode(1);
  expect(r.inspectConfiguration().effective.camera.settings.followResponsePerSecond).toBe(7);
  r.approach('car-1');r.enter('car-1');world.step({},31);
  expect(r.inspectConfiguration().effective.camera.settings).toMatchObject({baseFovDegrees:70,followResponsePerSecond:8,collisionRadiusMeters:.25});
  config.profile.character!.speed=999;config.effective.control.speed=999;
  expect(r.exportProfile().character!.speed).not.toBe(999);
 }finally{world.dispose();}
});

 it.each(['wheeled','motorcycle'] as const)('%s opts into brake-turn slip, retains momentum and recovers without affecting low-speed steering',async(mode)=>{
  const trial=async(drift:boolean,speed:number,brake:boolean)=>{const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:{...map,regions:[{...map.regions[0]!,modes:[mode]}],bounds:{min:[-500,-10,-500],max:[500,50,500]},boxes:[{id:'ground',position:[0,-.5,0],size:[1000,1,1000]}]},character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'car-1',assetId:'car',object:new Group(),spec:{...spec,mode,brakeDrift:drift,brakeDeceleration:8,coastDeceleration:1.5,brakeDamping:.65}}]}});try{
   const r=world.humanoid!,sim=r.simulation;sim.active=0;sim.transition=0;
   const v=sim.vehicle!;v.position.set(-30,.03,-50);v.velocity.set(0,0,speed);v.spec.brakeDrift=drift;v.spec.brakeDeceleration=8;v.spec.coastDeceleration=1.5;v.spec.brakeDamping=.65;
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
