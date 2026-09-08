import { CameraCollisionSolver } from '@whitebox-world/camera-collision';
import {describe,it,expect,vi,beforeAll} from 'vitest';
import {Group,PerspectiveCamera,Quaternion,Vector2,Vector3,type WebGLRenderer} from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {WorldEngine} from '../engine';
import type {WorldObservation} from '../contracts';
import {createWorld} from '../world';
import {ThreePhysics} from '../physics';
import {emptyInput} from './simulation';
import {Simulation} from './simulation';
import type {MapDefinition} from './environment/types';
import type {VehicleSpec} from './config';
import {WorldKeyboard} from '../input';
import {DEFAULT_KEY_BINDINGS,createKeyBindings,controlHints} from './input';
import {ACTION_TUNING} from './humanoid/action-schema';
import type {TrainingControl} from './control-tuning';
const map:MapDefinition={id:'test',name:'Test',description:'',bounds:{min:[-100,-10,-100],max:[100,50,100]},boxes:[{id:'ground',position:[0,-.5,0],size:[200,1,200]},{id:'wall',position:[0,2,10],size:[30,4,1]}],water:[],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[100,100],color:'#aaa',modes:['wheeled']}],spawns:[{id:'car',name:'Car',vehicleId:'car',position:[-20,.03,0],yaw:0,regionId:'road'}],playerSpawn:[0,.03,0]};
const spec:VehicleSpec={id:'car',name:'Car',en:'CAR',mode:'wheeled',kernel:'test',color:'#fff',spawn:[-20,.03,0],yaw:0,speed:28,accel:10,grip:11,steer:1,radius:1.65,seat:[0,1,0],camera:8,hint:'',archetype:'rover',envelope:{kind:'box',halfExtents:[1.35,1.15,2.15],offset:[0,1.15,0]}};
async function fixture(renderer?:WebGLRenderer){return createWorld({...(renderer?{renderer}:{}),camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map,character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'car-1',assetId:'car',spec,object:new Group()},{instanceId:'car-2',assetId:'car',spec:{...spec,spawn:[-40,.03,0]},object:new Group()}]}});}
describe('SDK training runtime',()=>{
 it('uses a fresh sprint+crouch edge for slide and remaps movement, HUD and action admission together',()=>{
  const keyboard=new WorldKeyboard(()=>0,()=>{throw new Error('unexpected reset');});keyboard.setTrainingMode(()=>false);keyboard.enabled=true;
  keyboard.keyDown('KeyC');keyboard.keyDown('ShiftLeft');expect(keyboard.sample().training?.humanoid).toEqual({toggleCrouch:true});
  expect(keyboard.sample().training?.humanoid).toEqual({});keyboard.keyUp('KeyC');keyboard.keyDown('KeyC');expect(keyboard.sample().training?.humanoid).toEqual({slide:true});
  keyboard.keyDown('KeyC',true);expect(keyboard.sample().training?.humanoid).toEqual({});keyboard.clear();
  keyboard.keyDown('ControlLeft');expect(keyboard.sample().training).toMatchObject({slow:false,humanoid:{toggleCrouch:true}});
  keyboard.setKeyBindings({forward:['KeyI'],crouch:['KeyB']});expect(keyboard.sample().training?.humanoid).toEqual({});
  keyboard.keyDown('KeyW');keyboard.keyDown('KeyC');expect(keyboard.sample().training?.forward).toBe(0);
  keyboard.keyDown('KeyI');keyboard.keyDown('ShiftRight');keyboard.keyDown('KeyB');expect(keyboard.sample().training).toMatchObject({forward:1,boost:true,humanoid:{slide:true}});
  expect(controlHints(keyboard.getKeyBindings())).toContainEqual(['B','蹲伏 / 站立；攀爬时松手']);
  expect(()=>createKeyBindings({crouch:['KeyW']})).toThrow('KEY_BINDING_CONFLICT');expect(()=>createKeyBindings({roll:['Escape']})).toThrow('KEY_BINDINGS_INVALID');
  expect(DEFAULT_KEY_BINDINGS.roll).toEqual(['KeyQ']);
 });
 it('probes and prepares near-table starts with the same humanoid capsule used for movement',async()=>{
  const world=await fixture();try{const runtime=world.training!;
   runtime.switchMap({...map,boxes:[map.boxes[0]!,{id:'table',position:[0,.45,.835],size:[2,.9,1]}]});
   const start={positionWorldMetersXYZ:[0,.02,0] as const,facingYawRadians:Math.PI};
   const before=world.getEntityState('player').positionWorldMetersXYZ;
   expect(runtime.probeEpisodeStart(start).isValid).toBe(true);expect(world.getEntityState('player').positionWorldMetersXYZ).toEqual(before);
   expect(()=>runtime.prepareEpisodeStart(start)).not.toThrow();world.step({},30);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeCloseTo(0,2);
   expect(runtime.probeEpisodeStart({...start,positionWorldMetersXYZ:[0,.02,.1]}).isValid).toBe(false);
  }finally{world.dispose();}
 });
 it('keeps a physical slide low under a ceiling until continued movement clears the exit',async()=>{
  const world=await fixture();try{const runtime=world.training!;
   runtime.switchMap({...map,boxes:[map.boxes[0]!,{id:'low-roof',position:[0,1.35,5.5],size:[4,.3,5]}]});
   runtime.simulation.setHumanoidAssets(new Set(['slide-start','slide-loop','slide-exit']),[]);world.step({},30);world.step({training:{...emptyInput(),forward:1,boost:true}},30);
   const start=await world.execute({type:'training.action',request:{requestId:'tunnel-slide',action:'slide'}});if(start.status!=='accepted')throw new Error('Slide was not accepted');
   world.step({},180);expect(world.operations.get(start.operationId).status).toBe('running');expect(runtime.simulation.humanoid!.capsuleHeight).toBeCloseTo(ACTION_TUNING.slideHeightMeters);
   const stopped=world.getEntityState('player').positionWorldMetersXYZ[2];world.step({},30);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeCloseTo(stopped);
   world.step({training:{...emptyInput(),forward:1}},420);expect(world.operations.get(start.operationId).status).toBe('succeeded');expect(runtime.simulation.humanoid!.capsuleHeight).toBeCloseTo(ACTION_TUNING.standingHeightMeters);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(8.25);
  }finally{world.dispose();}
 });
 it('rejects mounted skills immediately and shares rejection conditions with the capability query',async()=>{
  const world=await fixture();try{const runtime=world.training!;runtime.simulation.setHumanoidAssets(new Set(['roll','slide-start','slide-loop','slide-exit']),[]);world.step({},30);
   expect(runtime.characterCapabilities().find(c=>c.id==='slide')).toMatchObject({eligible:false,reason:'SPEED_TOO_LOW',parameters:{minimumSpeedMetersPerSecond:ACTION_TUNING.slideMinimumSpeedMetersPerSecond}});
   expect(runtime.approach('car-1')).toBe(true);expect(runtime.enter('car-1')).toBe(true);
   const request={requestId:'mounted-roll',action:'roll' as const};
   expect(runtime.characterCapabilities().find(c=>c.id==='roll')).toMatchObject({eligible:false,reason:'TRAINING_TRANSITION_ACTIVE'});
   expect(await world.execute({type:'training.action',request})).toMatchObject({status:'rejected',error:{code:'TRAINING_TRANSITION_ACTIVE'}});
   expect(runtime.simulation.humanoid!.skills.status(request.requestId)).toBeNull();world.step({},60);
   const result=await world.execute({type:'training.action',request});
   expect(result).toMatchObject({status:'rejected',error:{code:'MOUNTED'}});expect(runtime.characterCapabilities().find(c=>c.id==='roll')).toMatchObject({eligible:false,reason:'MOUNTED'});
   world.step({},180);expect(world.snapshot().training?.character.activeAction).toBeNull();
  }finally{world.dispose();}
 });
 it('returns authored approach anchors and exactly the eligibility used by target execution',async()=>{
  const world=await fixture();try{const runtime=world.training!;
   runtime.switchMap({...map,interactions:[{id:'seat',label:'Seat',kind:'seat',position:[5,.5,5],approach:[5,.03,4],yaw:.4}]});
   runtime.simulation.setHumanoidAssets(new Set(['sit-enter','sit-idle']),[]);world.step({},30);
   const before=world.getEntityState('player').positionWorldMetersXYZ,target=runtime.snapshot().interactionTargets[0]!;
   expect(target).toMatchObject({id:'seat',approachPositionWorldMetersXYZ:[5,.03,4],facingYawRadians:.4,eligible:false,reason:'OUT_OF_REACH'});
   const result=await world.execute({type:'training.action',request:{requestId:'distant-seat',action:'sit',targetId:'seat'}});
   expect(result).toMatchObject({status:'rejected',error:{code:target.reason}});expect(world.getEntityState('player').positionWorldMetersXYZ).toEqual(before);
   (target.approachPositionWorldMetersXYZ as unknown as number[])[0]=100;expect(runtime.snapshot().interactionTargets[0]!.approachPositionWorldMetersXYZ[0]).toBe(5);
  }finally{world.dispose();}
 });
 it('uses E to enter a collider-backed climb, Space to attempt the top and crouch to release',async()=>{
  const world=await fixture();try{const runtime=world.training!;
   runtime.switchMap({...map,boxes:[map.boxes[0]!,{id:'climb-wall',position:[0,1.5,1],size:[3,3,1]}],climbSurfaces:[{id:'face',colliderId:'climb-wall',kind:'wall',center:[0,1.5,.5],normal:[0,0,-1],width:3,minY:0,maxY:3}]});
   runtime.simulation.setHumanoidAssets(new Set(['hang-enter','hang-exit','hang-idle','hang-left','hang-right','climb-up','climb-down']),[]);world.step({},30);
   expect(runtime.characterCapabilities().find(c=>c.id==='climb')).toMatchObject({eligible:true});
   world.step({training:{...emptyInput(),humanoid:{interact:true}}},1);expect(runtime.snapshot().surface).toMatchObject({mode:'climbing',surfaceId:'face'});
   world.step({},180);world.step({training:{...emptyInput(),jump:true}},1);expect(runtime.snapshot().surface.mode).toBe('climbing');
   world.step({training:{...emptyInput(),humanoid:{toggleCrouch:true}}},1);expect(runtime.snapshot().surface.mode).toBe('none');
  }finally{world.dispose();}
 });
 it('consumes Space as standing up from crouch before allowing another jump',async()=>{
  const world=await fixture();try{world.step({},30);world.step({training:{...emptyInput(),humanoid:{toggleCrouch:true}}},1);expect(world.snapshot().training?.character.stance).toBe('crouch');
   world.step({training:{...emptyInput(),jump:true}},1);expect(world.snapshot().training?.character.stance).toBe('stand');expect(world.training!.simulation.humanoid!.vertical).toBe(0);
   world.step({training:{...emptyInput(),jump:true}},1);expect(world.training!.simulation.humanoid!.vertical).toBeGreaterThan(0);
  }finally{world.dispose();}
 });

 it.each(['plane','sub','space','mount','dragon'] as const)('uses configured %s handling in the physical solver',async(mode)=>{
  const speeds=[];
  for(const stronger of [false,true]){
   const sceneMap:MapDefinition={...map,boxes:[map.boxes[0]!],water:mode==='sub'?[{id:'pool',min:[-90,-5,-90],max:[90,40,90],surface:40}]:[],regions:[{...map.regions[0]!,modes:[mode]}],spawns:[]};
   const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map:sceneMap,character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:'craft',assetId:'craft',spec:{...spec,mode,spawn:[-20,mode==='mount'?.03:25,-20]},object:new Group()}]}});
   try{const r=world.training!;const tuning:Partial<TrainingControl>=mode==='plane'?{drag:stronger?5:0,dragQuadratic:0}:mode==='sub'?{verticalAcceleration:stronger?12:2}:mode==='space'?{grip:0,brakeDamping:stronger?8:0}:mode==='dragon'?{groundDeceleration:stronger?8:1}:{coastDeceleration:stronger?8:1};
    r.applyProfile({vehicles:{craft:tuning}});r.simulation.active=0;r.simulation.transition=0;const v=r.simulation.vehicle!;v.position.set(-20,mode==='mount'||mode==='dragon'?.03:25,-20);v.velocity.set(0,0,mode==='sub'?0:20);v.speed=v.velocity.length();v.grounded=mode==='mount'||mode==='dragon';
    world.step({training:{...emptyInput(),lift:mode==='sub'?1:0,boost:mode==='space'}},30);speeds.push(mode==='sub'?v.velocity.y:v.velocity.z);
    expect(r.snapshot().controls.vehicles.craft).toMatchObject(tuning);
   }finally{world.dispose();}
  }
  if(mode==='sub')expect(speeds[1]!-speeds[0]!).toBeGreaterThan(3);else expect(speeds[0]!-speeds[1]!).toBeGreaterThan(2);
 });
 it('tunes release deceleration independently per instance and preserves it through reset',async()=>{
  const world=await fixture();try{const r=world.training!;
   r.applyProfile({vehicles:{'car-1':{coastDeceleration:1},'car-2':{coastDeceleration:8}}});
   r.applyProfile({vehicles:{'car-1':{directionChangeDeceleration:4,groundDeceleration:3}}});
   const velocities=[];
   for(const id of ['car-1','car-2']){r.simulation.active=id==='car-1'?0:1;r.simulation.transition=0;const v=r.simulation.vehicle!;v.velocity.set(0,0,10);world.step({training:emptyInput()},30);velocities.push(v.velocity.z);}
   expect(velocities[0]).toBeCloseTo(9.5,1);expect(velocities[1]).toBeCloseTo(6,1);
   expect(r.exportProfile().vehicles?.['car-1']?.accel).toBe(10);
   await world.reset();expect(r.exportProfile().vehicles?.['car-1']?.coastDeceleration).toBe(1);
  }finally{world.dispose();}
 });
 it('configures independent boosted speed, steering response and character stopping acceleration atomically',async()=>{
  const world=await fixture();try{const r=world.training!;
   r.applyProfile({vehicles:{'car-1':{speed:4,maxSpeed:7,reverseSpeed:2,steeringResponse:3,steeringReturn:20}},character:{coastDeceleration:1}});
   const before=r.exportProfile();expect(()=>r.applyProfile({vehicles:{'car-1':{coastDeceleration:-1}},character:{speed:99}})).toThrow();expect(r.exportProfile()).toEqual(before);
   r.simulation.active=0;r.simulation.transition=0;world.step({training:{...emptyInput(),forward:1}},90);expect(r.simulation.vehicle!.velocity.z).toBeCloseTo(4,1);
   world.step({training:{...emptyInput(),forward:1,boost:true}},60);expect(r.simulation.vehicle!.velocity.z).toBeCloseTo(7,1);
   r.simulation.active=-1;r.prepareCharacter([0,.03,-20]);world.step({moveZRatio:-1},60);const speed=r.simulation.player.velocity.length();world.step({},30);expect(r.simulation.player.velocity.length()).toBeGreaterThan(speed-.7);
   r.switchMap({...map,id:'tuning-map'});expect(r.exportProfile().vehicles?.['car-1']?.maxSpeed).toBe(7);
  }finally{world.dispose();}
 });
 it('rejects invalid authored vehicle tuning during world creation',async()=>{
  await expect(createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},training:{map,character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'car-1',assetId:'car',spec:{...spec,coastDeceleration:-1},object:new Group()}]}})).rejects.toThrow('TRAINING_CONTROL_INVALID: coastDeceleration');
 });
 it.each([
  {name:'thin pillar',position:[0,2,-2],size:[.06,4,.2]},
  {name:'head above low wall',position:[0,1.125,-2],size:[6,2.25,.2]},
  {name:'feet below overhang',position:[0,3,-2],size:[6,3,.2]},
  {name:'right capsule edge',position:[-2.1,2,-2],size:[4.4,4,.2]},
  {name:'left capsule edge',position:[2.1,2,-2],size:[4.4,4,.2]},
 ])('keeps full framing when only the $name blocks the centre ray',async({position,size})=>{
  const world=await fixture();try{const r=world.training!;
   r.switchMap({...map,id:'partial',boxes:[map.boxes[0]!,{id:'occluder',position:position as [number,number,number],size:size as [number,number,number]}]});
   world.step({},1);expect(r.followCamera.distance).toBeCloseTo(8.8);expect(r.followCamera.collisionLimited).toBe(false);
   const eye=world.camera.position.clone();
   world.render();expect(world.camera.position.distanceTo(eye)).toBeLessThan(1e-9);
   expect(r.followCamera.presentationTarget.distanceTo(world.camera.position)).toBeCloseTo(8.8);
   world.step({},90);world.render();expect(world.camera.position.distanceTo(eye)).toBeLessThan(.03);
  }finally{world.dispose();}
 });
 it('still keeps the camera sphere out of geometry when the capsule is partly visible',async()=>{
  const world=await fixture();try{const r=world.training!;
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
   const r=world.training!,engine=(world as unknown as {engine:WorldEngine}).engine;
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
  const world=await fixture();try{const r=world.training!,c=r.followCamera;
   r.switchMap({...map,id:'orbit-wall',boxes:[map.boxes[0]!,{id:'eye-post',position:[0,3,-8],size:[.1,6,2]}]});world.step({},1);
   c.yaw=-.3;c.initialized=false;c.update(r.simulation,1/60);expect(world.camera.position.x).toBeGreaterThan(2);
   c.yaw=.3;c.update(r.simulation,1/60);expect(world.camera.position.x).toBeGreaterThan(.2);
  }finally{world.dispose();}
 });
 it('preserves pointer orbit direction, character pitch limits and manual recenter grace',async()=>{
  const world=await fixture();try{world.step({},1);const r=world.training!,c=r.followCamera;
   r.advance({},1/60,{yawDeltaRadians:-.4,pitchDeltaRadians:.2});
   expect(c.yaw).toBeCloseTo(-.4);expect(c.pitch).toBeCloseTo(.55);expect(c.lastOrbit).toBeCloseTo(1/60);
   r.advance({},1/60,{pitchDeltaRadians:-5});expect(c.pitch).toBe(.12);
   r.advance({cameraPitchRatio:-1},1/60);expect(c.pitch).toBe(.12);
   expect(r.approach('car-1')).toBe(true);expect(r.enter('car-1')).toBe(true);world.step({},1);
   const yaw=c.yaw;r.advance({},1/60,{yawDeltaRadians:-.4,pitchDeltaRadians:.2});
   expect(c.yaw).toBeCloseTo(yaw-.4);expect(c.pitch).toBeCloseTo(.45);
  }finally{world.dispose();}
 });
 it('inherits character translation without stretching the follow arm or changing FOV',async()=>{
  const world=await fixture();try{world.step({},30);const r=world.training!,c=r.followCamera;
   const relative=world.camera.position.clone().sub(r.simulation.player.position),fov=c.camera.fov;
   world.step({moveZRatio:1},90);
   expect(world.camera.position.clone().sub(r.simulation.player.position).distanceTo(relative)).toBeLessThan(.015);
   expect(c.camera.fov).toBe(fov);expect(c.desiredPosition.distanceTo(c.target)).toBeCloseTo(8.8);
   world.step({moveZRatio:-1},90);
   expect(world.camera.position.clone().sub(r.simulation.player.position).distanceTo(relative)).toBeLessThan(.015);
  }finally{world.dispose();}
 });
 it('clips a shoulder offset before it enters a narrow wall, while still retracting for a real obstruction',async()=>{
  const world=await fixture();try{const r=world.training!;
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
  const world=await fixture();try{const runtime=world.training!;runtime.simulation.setHumanoidAssets(new Set(['roll']),[]);world.step({},30);
   const receipt=await world.execute({type:'training.action',request:{requestId:'map-roll',action:'roll'}});if(receipt.status!=='accepted')throw new Error('roll unavailable');
   const cancel=vi.spyOn(runtime.simulation.humanoid!.skills,'cancel').mockReturnValue({requestId:'map-roll',action:'roll',status:'running',code:'HEADROOM_BLOCKED',message:'cannot cancel safely'});
   expect(()=>world.operations.cancel(receipt.operationId)).toThrow('cannot cancel safely');expect(world.operations.get(receipt.operationId).status).toBe('running');await world.reset();expect(world.operations.get(receipt.operationId).status).toBe('cancelled');cancel.mockRestore();
   world.step({},30);const next=await world.execute({type:'training.action',request:{requestId:'replace-roll',action:'roll'}});if(next.status!=='accepted')throw new Error('roll unavailable');runtime.switchMap({...map,id:'new-map'});expect(world.operations.get(next.operationId).status).toBe('cancelled');expect(world.snapshot().training?.character.activeAction).toBeNull();
  }finally{world.dispose();}
 });
 it('observes source surface progress and map interaction targets without mutable references',async()=>{
  const world=await fixture();try{const runtime=world.training!;runtime.switchMap({...map,interactions:[{id:'parcel',label:'Parcel',kind:'pickup',position:[5,.5,5],approach:[5,.03,4],yaw:0,size:[.5,.5,.5]}]});runtime.simulation.setHumanoidAssets(new Set(['prone-enter','prone-exit','prone-idle','prone-forward']),[]);world.step({},30);world.step({training:{...emptyInput(),humanoid:{prone:true}}},1);
   const snapshot=runtime.snapshot();expect(snapshot.surface.mode).toBe('prone');expect(snapshot.surface.pose?.actionId).toBe('prone-enter');expect(snapshot.interactionTargets[0]).toMatchObject({id:'parcel',state:'available',positionWorldMetersXYZ:[5,.5,5]});expect(snapshot.traversal).toBeNull();expect(snapshot.vehicleDynamics[0]?.launched).toBe(false);
   world.step({},180);expect(snapshot.surface.pose?.actionId).toBe('prone-enter');expect(runtime.snapshot().surface.pose?.actionId).toBe('prone-idle');await world.reset();expect(runtime.snapshot().surface.mode).toBe('none');
  }finally{world.dispose();}
 });
 it('keeps the original simulation alive when later map staging fails',async()=>{
  const world=await fixture();try{const runtime=world.training!,environment=runtime.environment,humanoid=runtime.simulation.humanoid!,dispose=vi.spyOn(humanoid,'dispose');world.step({},2);const before=world.snapshot();
   const prepare=vi.spyOn(Simulation.prototype,'setHumanoidAssets').mockImplementationOnce(()=>{throw new Error('staged assets failed');});
   expect(()=>runtime.switchMap({...map,id:'replacement'})).toThrow('staged assets failed');prepare.mockRestore();expect(dispose).not.toHaveBeenCalled();expect(runtime.environment).toBe(environment);expect(world.snapshot()).toEqual(before);world.step({moveZRatio:-1},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(1);
  }finally{world.dispose();}
 });
 it('does not let a stale UI input lease release a newer model override',async()=>{
  const world=await fixture();try{const runtime=world.training!,releaseUI=runtime.setInput({...emptyInput(),forward:1});
   expect((await world.execute({type:'training.input',input:{...emptyInput(),forward:-1}})).status).toBe('applied');releaseUI();world.step({},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeLessThan(-1);
   const releaseCurrent=runtime.setInput({...emptyInput(),forward:1});releaseCurrent();world.step({moveZRatio:1},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeLessThan(-3);
  }finally{world.dispose();}
 });
 it('projects camera snapshots onto canonical tuning fields and rejects distance as tuning',async()=>{
  const world=await fixture();try{const runtime=world.training!;Object.assign(runtime.followCamera.tuning,{distance:9});runtime.applyProfile({character:{speed:4}});
   expect(runtime.exportProfile().camera).not.toHaveProperty('distance');expect(runtime.followCamera.tuning).not.toHaveProperty('distance');await expect(world.reset()).resolves.toBeUndefined();
   const before=runtime.exportProfile();expect(()=>runtime.applyProfile({camera:{distance:9} as never,character:{speed:7}})).toThrow('TRAINING_PROFILE_INVALID');expect(runtime.exportProfile()).toEqual(before);
  }finally{world.dispose();}
 });
 it('rejects invalid map and profile updates without disposing the live controller',async()=>{
  const world=await fixture();try{const runtime=world.training!,original=runtime.environment,humanoid=runtime.simulation.humanoid!,dispose=vi.spyOn(humanoid,'dispose');world.step({},2);const before=world.snapshot();
   expect(()=>runtime.switchMap({...map,id:'invalid',interactions:[null] as never})).toThrow();expect(dispose).not.toHaveBeenCalled();expect(runtime.environment).toBe(original);expect(world.snapshot()).toEqual(before);
   const profile=runtime.exportProfile();expect(()=>runtime.applyProfile({character:{speed:8},camera:{baseFovDegrees:Infinity}})).toThrow();expect(runtime.exportProfile()).toEqual(profile);expect(runtime.simulation.characterControl.speed).toBe(profile.character!.speed);
   world.step({moveZRatio:-1},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(1);
  }finally{world.dispose();}
 });
 beforeAll(async()=>{const world=await fixture();world.dispose();});
 it('uses the Episode lease, frame metadata and fixed solver for mounted recordings',async()=>{
  const win=new EventTarget(),doc=Object.assign(new EventTarget(),{defaultView:win,activeElement:null,body:{},documentElement:{},hidden:false});Object.assign(win,{document:doc});vi.stubGlobal('window',win);vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const canvas=Object.assign(new EventTarget(),{width:800,height:600,ownerDocument:doc,getAttribute:()=>null,removeAttribute:()=>{},setAttribute:()=>{},style:{getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty:()=>{},removeProperty:()=>{}},toDataURL:()=> 'data:image/png;base64,dGVzdA=='});let ratio=1;const size=new Vector2(800,600);
  const renderer={domElement:canvas,render:vi.fn(),getSize:(out:Vector2)=>out.copy(size),getPixelRatio:()=>ratio,setPixelRatio:(r:number)=>{ratio=r;},setSize:(x:number,y:number)=>{size.set(x,y);canvas.width=x*ratio;canvas.height=y*ratio;}} as unknown as WebGLRenderer;
  const world=await fixture(renderer);try{await world.start();const port=(win as unknown as {__WORLDKIT_EVAL__:WorldObservation}).__WORLDKIT_EVAL__.episode!;
   const start={positionWorldMetersXYZ:[-20,.03,-20] as const,facingYawRadians:Math.PI,training:{vehicleInstanceId:'car-1',mounted:true,cameraMode:2 as const,velocityWorldMetersPerSecondXYZ:[0,0,4] as const}};
   expect(port.capabilities().training?.vehicles).toHaveLength(2);expect(port.probeStart(start).isValid).toBe(true);await port.prepareSegment(start,{widthPixels:640,heightPixels:360});
   const runtime=world.training!,ownedSnapshot=world.snapshot();
   for(const mutate of [()=>runtime.enter('car-1'),()=>runtime.exit(),()=>runtime.command({type:'training.input',input:emptyInput()}),()=>runtime.command({type:'training.action',request:{requestId:'external-roll',action:'roll'}}),()=>runtime.setInput(emptyInput()),()=>runtime.clearInput(),()=>runtime.prepareCharacter([0,.03,0]),()=>runtime.prepare('car-1',map.spawns[0]!),()=>runtime.approach('car-1'),()=>runtime.switchMap(map),()=>runtime.applyProfile({}),()=>runtime.advance({},1/60),()=>runtime.reset(),()=>runtime.prepareEpisodeStart(start),()=>runtime.useAuthoredCamera(),()=>runtime.setCameraMode(1)]){
    expect(mutate).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');expect(world.snapshot()).toEqual(ownedSnapshot);
   }
   expect(world.snapshot().training?.mountedInstanceId).toBe('car-1');expect(world.isRunning).toBe(false);expect(()=>world.step({},1)).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');
   const collisionBefore=runtime.followCamera.collisionState;
   const repeatedCollisionFrame=port.frame('image/png');expect(port.frame('image/png')).toEqual(repeatedCollisionFrame);
   expect(runtime.followCamera.collisionState).toEqual(collisionBefore);
   const frame=port.advance({training:{...emptyInput(),forward:1}},60);expect(frame.entities.find(e=>e.id==='car-1')!.positionWorldMetersXYZ[2]).toBeGreaterThan(-16);expect(port.frame('image/png').snapshot.training?.cameraMode).toBe(2);expect(canvas.width).toBe(640);
   port.advance({training:{...emptyInput(),brake:true}},120);
   expect(await port.execute({type:'training.exit'})).toMatchObject({status:'applied'});port.advance({},120);
   expect(await port.execute({type:'training.enter',instanceId:'car-1'})).toMatchObject({status:'applied'});port.advance({},120);
   expect(world.snapshot().training?.mountedInstanceId).toBe('car-1');port.release();
   world.training!.simulation.setHumanoidAssets(new Set(['roll']),[]);
   await port.prepareSegment({positionWorldMetersXYZ:[0,.03,0],facingYawRadians:Math.PI},{widthPixels:640,heightPixels:360});port.advance({},30);
   const ticks=world.simulationTick;
   expect(await world.execute({type:'training.input',input:emptyInput()})).toMatchObject({status:'rejected',error:{code:'EPISODE_CAPTURE_OWNS_CLOCK'}});
   expect(await world.execute({type:'actor.stop',entityId:'player'})).toMatchObject({status:'rejected',error:{code:'EPISODE_CAPTURE_OWNS_CLOCK'}});
   expect(await port.execute({type:'training.profile',profile:{character:{speed:99}}} as never)).toMatchObject({status:'rejected',error:{code:'EPISODE_COMMAND_UNSUPPORTED'}});
   expect(await port.execute({type:'training.input',input:{...emptyInput(),humanoid:{unknown:true}}} as never)).toMatchObject({status:'rejected',error:{code:'TRAINING_INPUT_INVALID'}});
   const action=await port.execute({type:'training.action',request:{requestId:'episode-roll',action:'roll'}});if(action.status!=='accepted')throw new Error('Episode action rejected');
   expect(world.simulationTick).toBe(ticks);expect(port.operation(action.operationId).status).toBe('running');
   const stepPhysics=vi.spyOn(world.training!.environment,'stepPhysics');port.advance({},120);expect(stepPhysics).toHaveBeenCalledTimes(120);expect(port.operation(action.operationId).status).toBe('succeeded');
   const cancelled=await port.execute({type:'training.action',request:{requestId:'episode-cancel',action:'roll'}});if(cancelled.status!=='accepted')throw new Error('Episode action rejected');
   await port.execute({type:'training.input',input:{...emptyInput(),humanoid:{cancel:true}}});port.advance({},1);expect(port.operation(cancelled.operationId).status).toBe('cancelled');
   await port.execute({type:'training.input',input:null});port.advance({},30);
   const resetAction=await port.execute({type:'training.action',request:{requestId:'episode-reset',action:'roll'}});if(resetAction.status!=='accepted')throw new Error('Episode action rejected');
   await port.prepareSegment({positionWorldMetersXYZ:[0,.03,0],facingYawRadians:Math.PI},{widthPixels:640,heightPixels:360});expect(port.operation(resetAction.operationId).status).toBe('cancelled');
   port.advance({},30);const releaseAction=await port.execute({type:'training.action',request:{requestId:'episode-release',action:'roll'}});if(releaseAction.status!=='accepted')throw new Error('Episode action rejected');
   port.release();expect(world.operations.get(releaseAction.operationId).status).toBe('cancelled');expect(()=>port.execute({type:'training.input',input:null})).toThrow('EPISODE_SEGMENT_NOT_PREPARED');
   await port.prepareSegment(start,{widthPixels:640,heightPixels:360});
   const interactions=vi.spyOn(runtime.simulation,'interact');port.advance({interact:true},1);
   expect(interactions).toHaveBeenCalledTimes(1);expect(()=>world.stop()).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');
   port.advance({interact:true},1);expect(interactions).toHaveBeenCalledTimes(1);
   const visual=vi.fn();runtime.onVisualUpdate(visual);port.advance({},1);
   const captured=port.frame('image/png');expect(port.frame('image/png').snapshot).toEqual(captured.snapshot);expect(visual).toHaveBeenCalledTimes(1);
   world.dispose();expect(()=>runtime.advance({},1/60)).toThrow('TRAINING_DISPOSED');
  }finally{world.dispose();vi.unstubAllGlobals();}
 });
 it('tracks a physical character action through terminal operation status and clears it on reset',async()=>{
  const world=await fixture();try{const runtime=world.training!;runtime.simulation.setHumanoidAssets(new Set(['roll']),[]);world.step({},30);
   const receipt=await world.execute({type:'training.action',request:{requestId:'roll-1',action:'roll'}});expect(receipt.status).toBe('accepted');
   if(receipt.status!=='accepted')throw new Error('action was not accepted');expect(world.snapshot().training?.character.activeAction?.requestId).toBe('roll-1');
   world.step({},120);expect(world.operations.get(receipt.operationId).status).toBe('succeeded');expect(world.snapshot().training?.character.activeAction).toBeNull();
   const next=await world.execute({type:'training.action',request:{requestId:'roll-2',action:'roll'}});expect(next.status).toBe('accepted');await world.reset();if(next.status==='accepted')expect(world.operations.get(next.operationId).status).toBe('cancelled');expect(world.snapshot().training?.character.activeAction).toBeNull();
  }finally{world.dispose();}
 });
 it('applies humanoid profiles to physical motion, merges edits and preserves configuration across reset',async()=>{
  const world=await fixture();try{world.step({moveZRatio:-1},60);const baseline=world.getEntityState('player').positionWorldMetersXYZ[2];await world.reset();const runtime=world.training!;
   runtime.applyProfile({character:{speed:7.6},vehicles:{'car-1':{speed:12}}});runtime.applyProfile({camera:{baseFovDegrees:65},cameraDistanceMeters:9});
   expect(runtime.exportProfile().vehicles?.['car-1']?.speed).toBe(12);world.step({moveZRatio:-1},60);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(baseline*1.5);
   await world.reset();expect(runtime.simulation.humanoid!.movementTuning.speedScale).toBe(2);expect(runtime.camera.fov).toBe(65);expect(runtime.followCamera.tuning.baseFovDegrees).toBe(65);expect(runtime.followCamera.baseDistance).toBe(9);expect(runtime.simulation.vehicles[0]!.spec.speed).toBe(12);
  }finally{world.dispose();}
 });
 it('routes all training keys through SDK input and consumes action edges once',()=>{
  let mounted=false;const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.setTrainingMode(()=>mounted);keyboard.enabled=true;
  keyboard.keyDown('KeyW');keyboard.keyDown('KeyE');keyboard.keyDown('KeyF');keyboard.keyDown('Space');
  const first=keyboard.sample();expect(first.training?.forward).toBe(1);expect(first.training?.humanoid?.interact).toBe(true);expect(first.interactPressed).toBe(true);expect(first.training?.jump).toBe(true);
  const next=keyboard.sample();expect(next.training?.forward).toBe(1);expect(next.training?.humanoid?.interact).toBeUndefined();expect(next.interactPressed).toBe(false);
  mounted=true;expect(keyboard.sample().training).toMatchObject({roll:1,lift:1,brake:true,jump:false});keyboard.clear();expect(keyboard.sample().training?.forward).toBe(0);
 });
 it('executes closed commands with deduplication and reports failed physical requests',async()=>{
  const world=await fixture();try{
   const first=await world.execute({type:'training.camera',mode:2},{commandId:'camera'});expect(first.status).toBe('applied');expect(await world.execute({type:'training.camera',mode:2},{commandId:'camera'})).toEqual(first);
   expect((await world.execute({type:'training.camera',mode:0},{commandId:'camera'})).status).toBe('rejected');
   expect((await world.execute({type:'training.enter',instanceId:'car-1'})).status).toBe('rejected');
   expect((await world.execute({type:'training.approach',instanceId:'car-1'})).status).toBe('applied');expect((await world.execute({type:'training.enter',instanceId:'car-1'})).status).toBe('applied');
   expect(world.snapshot().training?.mountedInstanceId).toBe('car-1');expect((await world.execute({type:'actor.move-to',entityId:'car-1',targetPositionWorldMetersXYZ:[0,0,0]})).status).toBe('rejected');
  }finally{world.dispose();}
 });
 it('initializes real vehicle Episode state and then advances solely through input',async()=>{
  const world=await fixture();try{const runtime=world.training!,start={positionWorldMetersXYZ:[-20,.03,-20] as const,facingYawRadians:Math.PI,training:{vehicleInstanceId:'car-1',mounted:true,cameraMode:1 as const,velocityWorldMetersPerSecondXYZ:[0,0,4] as const,throttle:.6}};
   expect(runtime.probeEpisodeStart(start).isValid).toBe(true);runtime.prepareEpisodeStart(start);expect(runtime.snapshot().mountedInstanceId).toBe('car-1');expect(runtime.simulation.vehicle!.velocity.z).toBe(4);expect(runtime.simulation.vehicle!.throttle).toBe(.6);
   world.step({training:{...emptyInput(),forward:1}},60);expect(world.getEntityState('car-1').positionWorldMetersXYZ[2]).toBeGreaterThan(-16);expect(runtime.episodeCapabilities().vehicles).toHaveLength(2);
   expect(runtime.probeEpisodeStart({...start,positionWorldMetersXYZ:[0,1,10]}).isValid).toBe(false);
  }finally{world.dispose();}
 });
 it('selects one physics owner and keeps observations on actual collided movement',async()=>{
  const create=vi.spyOn(ThreePhysics,'create');const world=await fixture();
  try{expect(create).not.toHaveBeenCalled();const physics=vi.spyOn(world.training!.environment,'stepPhysics');world.step({moveZRatio:-1},240);expect(physics).toHaveBeenCalledTimes(240);const p=world.getEntityState('player');expect(p.positionWorldMetersXYZ[2]).toBeGreaterThan(3);expect(p.positionWorldMetersXYZ[2]).toBeLessThan(9.3);expect(p.motion?.isGrounded).toBe(true);expect(world.simulationTick).toBe(240);}finally{world.dispose();create.mockRestore();}
 });
 it('keeps duplicate asset instances independent and supports physical driving, cameras and complete reset',async()=>{
  const world=await fixture();try{const runtime=world.training!,second=runtime.simulation.vehicles[1]!.position.clone();expect(runtime.approach('car-1')).toBe(true);expect(runtime.enter('car-1')).toBe(true);runtime.setInput({...emptyInput(),forward:1});world.step({},120);expect(runtime.simulation.vehicles[0]!.velocity.length()).toBeGreaterThan(1);expect(runtime.simulation.vehicles[1]!.position.distanceTo(second)).toBeLessThan(.1);for(const mode of [0,1,2] as const){runtime.setCameraMode(mode);world.step({},1);expect(world.snapshot().camera.mode).toBe('follow');expect(world.camera.position.toArray().every(Number.isFinite)).toBe(true);}await world.reset();expect(world.simulationTick).toBe(0);expect(runtime.simulation.active).toBe(-1);expect(runtime.simulation.vehicles.every(v=>v.velocity.length()===0)).toBe(true);expect(runtime.followCamera.mode).toBe(0);world.step({},1);expect(runtime.simulation.vehicles[0]!.speed).toBe(0);}finally{world.dispose();}
 });
 it('resets the active map and rejects unsupported clock rates',async()=>{
  const world=await fixture();try{world.training!.switchMap({...map,id:'second',playerSpawn:[20,.03,20]});world.step({moveZRatio:-1},10);await world.reset();expect(world.training!.environment.map.id).toBe('second');expect(world.getEntityState('player').positionWorldMetersXYZ[0]).toBeCloseTo(20);}finally{world.dispose();}
  await expect(createWorld({training:{map,vehicles:[],character:{instanceId:'p',object:new Group()}},fixedTimeStepSeconds:1/30})).rejects.toThrow('TRAINING_REQUIRES_60HZ');
 });
});

it('keeps humanoid collision recovery independent of display frequency and other worlds',async()=>{
 const worlds=await Promise.all([fixture(),fixture(),fixture()]);
 try {
  const distances:number[]=[];
  for(const [index,world] of worlds.entries()){
   const r=world.training!,engine=(world as unknown as {engine:WorldEngine}).engine;
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
  const peer=worlds[1]!.training!.followCamera.collisionState;
  await worlds[0]!.reset();worlds[0]!.step({},1);
  expect(worlds[1]!.training!.followCamera.collisionState).toEqual(peer);
 }finally{worlds.forEach(world=>world.dispose());}
});

it('uses a committed fallback so an emergency display is independent of earlier render alphas',async()=>{
 const world=await fixture();
 try {
  const r=world.training!,c=r.followCamera;
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
