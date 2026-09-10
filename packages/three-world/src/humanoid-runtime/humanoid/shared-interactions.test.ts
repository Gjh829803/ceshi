import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import {Vector3} from 'three';
import {EnvironmentQueries,initEnvironmentQueries} from '../environment/queries';
import type {EnvironmentDefinition} from '../environment/types';
import {HumanoidController} from './controller';
import {ACTION_CLIP_IDS} from './action-schema';
import {Simulation} from '../simulation';
import {readInteractionTargets} from './render-state';

const controllers:HumanoidController[]=[],environments:EnvironmentQueries[]=[];
const map:EnvironmentDefinition={id:'shared-targets',name:'Shared targets',description:'',bounds:{min:[-10,-5,-10],max:[10,10,10]},
  boxes:[{id:'floor',position:[0,-.5,0],size:[20,1,20]},{id:'table',position:[0,.4145,.65],size:[1.8,.829,.68]}],
  water:[],regions:[],spawns:[],playerSpawn:[-2,.04,0],looseCrates:[{id:'loose-box',position:[5,2,0],size:.5}],
  interactions:[{id:'cup',label:'Cup',kind:'pickup',position:[.051,.894,.363],approach:[0,0,0],yaw:0,size:[.13,.13,.13],massKg:.3},
    {id:'seat',label:'Seat',kind:'seat',position:[3,.5,1],approach:[3,.03,0],yaw:0}]};
beforeAll(initEnvironmentQueries);
afterEach(()=>{for(const controller of controllers.splice(0))controller.dispose();for(const environment of environments.splice(0))environment.dispose();});
function setup(){const q=new EnvironmentQueries(map);environments.push(q);return q;}
function actor(q:EnvironmentQueries,x:number){const actor=new HumanoidController(q);controllers.push(actor);actor.resetAt(new Vector3(x,.04,0),0);actor.setAvailableClips(new Set(ACTION_CLIP_IDS),[]);return actor;}
function step(q:EnvironmentQueries,actors:HumanoidController[],ticks:number){for(let i=0;i<ticks;i++){for(const actor of actors)actor.step(new Vector3(),false,false,false);q.stepPhysics(1/60);}}

it('restores world interactions and crates at the simulation reset entry',()=>{
  const q=setup(),simulation=new Simulation(q,[],{id:'player'});controllers.push(simulation.controlledActor.controller);
  const target=q.interactions.targets.get('cup')!;
  target.state='placed';target.position.set(5,2,4);q.colliderForId('cup')!.parent()!.setTranslation(target.position,true);
  const crate=q.looseCrates[0]!;crate.body.setTranslation({x:6,y:4,z:2},true);
  simulation.reset();
  expect(target.state).toBe('available');expect(target.position.toArray()).toEqual(map.interactions![0]!.position);
  expect(crate.body.translation()).toMatchObject({x:5,y:2,z:0});
});

it('keeps another actor holding its target during actor relocation, and clears every owner on world reset',()=>{
  const q=setup(),simulation=new Simulation(q,[],{id:'player'}),holder=simulation.addActor('holder',new Vector3(0,.04,0));
  controllers.push(simulation.controlledActor.controller,holder.controller);holder.controller.setAvailableClips(new Set(ACTION_CLIP_IDS),[]);simulation.controlledActor.controller.setAvailableClips(new Set(ACTION_CLIP_IDS),[]);
  for(let n=0;n<30;n++)simulation.step(1/60);
  expect(holder.controller.skills.request({requestId:'hold',action:'pickup',targetId:'cup'}).status).toBe('running');
  for(let n=0;n<120;n++)simulation.step(1/60);
  const body=q.colliderForId('cup')!.parent()!;
  expect(holder.controller.skills.carrying).toBe('cup');
  expect(simulation.controlledActor.prepareCharacter(new Vector3(-3,.04,0),0)).toBe(true);
  expect(holder.controller.skills.carrying).toBe('cup');expect(q.colliderForId('cup')!.parent()!.handle).toBe(body!.handle);
  expect(q.interactions.unavailable('cup')).toBe(true);
  simulation.reset();expect(holder.controller.skills.carrying).toBeNull();expect(q.interactions.targets.get('cup')!.state).toBe('available');
});

it('uses declared crate identities independent of array order',()=>{
  const q=setup(),crate=q.looseCrates[0]!;
  expect(q.colliderId(crate.body.collider(0).handle)).toBe('loose-box');
  expect(q.colliderForId('loose-box')?.handle).toBe(crate.body.collider(0).handle);
});

it('rejects ambiguous shared physical identities before allocating a world',()=>{
  for(const id of ['floor','cup'])expect(()=>new EnvironmentQueries({...map,looseCrates:[{id,position:[0,2,0],size:1}]})).toThrow('HUMANOID_PHYSICS_ID_CONFLICT');
  expect(()=>new EnvironmentQueries({...map,interactions:[map.interactions![0]!,map.interactions![0]!]})).toThrow('HUMANOID_PHYSICS_ID_CONFLICT');
});

it('creates one set of interaction bodies for multiple controllers and keeps it alive after one leaves',()=>{
  const q=setup(),a=actor(q,-2),count=q.colliderCount,b=actor(q,2);
  expect(q.colliderCount-count).toBe(1);expect(a.skills.targets).toBe(b.skills.targets);expect(a.crates).toBe(b.crates);
  const target=a.skills.targets.get('cup')!,body=q.colliderForId('cup')!.parent()!,crate=a.crates[0]!.body;
  body.setTranslation({x:3,y:1,z:0},true);crate.setTranslation({x:5,y:3,z:0},true);
  b.resetAt(new Vector3(2,.04,0));expect(body.translation().x).toBe(3);expect(crate.translation().y).toBe(3);
  a.dispose();expect(body.isValid()).toBe(true);expect(crate.isValid()).toBe(true);
  step(q,[b],30);expect(b.body.isValid()).toBe(true);
});

it('reserves a shared pickup before contact and keeps ownership after the operation completes',()=>{
  const q=setup(),a=actor(q,-.7),b=actor(q,.7);step(q,[a,b],30);
  const first=a.skills.request({requestId:'a-pickup',action:'pickup',targetId:'cup'});
  expect(first.status,JSON.stringify(first)).toBe('running');
  const second=b.skills.request({requestId:'b-pickup',action:'pickup',targetId:'cup'});
  expect(second.status,JSON.stringify(second)).toBe('rejected');expect(second.code).toBe('TARGET_UNAVAILABLE');
  step(q,[a,b],120);expect(a.skills.status('a-pickup')?.status).toBe('completed');expect(a.skills.carrying).toBe('cup');
  expect(b.skills.eligibility('pickup','cup').reason).toBe('TARGET_UNAVAILABLE');
  const body=q.colliderForId('cup')!.parent()!;a.dispose();
  expect(body.isValid()).toBe(true);expect(body.isEnabled()).toBe(true);expect(b.skills.targets.get('cup')!.state).toBe('dropped');
});

it('releases a reservation on cancellation before grip without recreating the target',()=>{
  const q=setup(),a=actor(q,-.7),b=actor(q,.7);step(q,[a,b],30);
  const body=q.colliderForId('cup')!.parent()!;
  expect(a.skills.request({requestId:'cancel-me',action:'pickup',targetId:'cup'}).status).toBe('running');
  expect(a.skills.cancel('cancel-me')?.status).toBe('cancelled');
  expect(b.skills.request({requestId:'next',action:'pickup',targetId:'cup'}).status).toBe('running');
  expect(q.colliderForId('cup')!.parent()!.handle).toBe(body!.handle);
});

it('keeps a seat occupied until its owner stands up, including an explicit stand-up target',()=>{
  const q=setup(),a=actor(q,2.3),b=actor(q,3.7);step(q,[a,b],30);
  const first=a.skills.request({requestId:'sit-a',action:'sit',targetId:'seat'});expect(first.status,JSON.stringify(first)).toBe('running');
  expect(b.skills.request({requestId:'sit-b',action:'sit',targetId:'seat'}).code).toBe('TARGET_UNAVAILABLE');
  step(q,[a,b],180);expect(a.skills.status('sit-a')?.status).toBe('completed');expect(a.skills.seated).toBe('seat');
  expect(b.skills.eligibility('sit','seat').reason).toBe('TARGET_UNAVAILABLE');
  expect(a.skills.request({requestId:'stand',action:'standUp',targetId:'seat'}).status).toBe('running');
  step(q,[a,b],90);expect(a.skills.seated).toBeNull();expect(b.skills.targets.get('seat')!.state).toBe('available');
  expect(a.teleportTo(new Vector3(0,.04,-2),0)).toBe(true);
  expect(b.skills.request({requestId:'next-seat',action:'sit',targetId:'seat'}).status).toBe('running');
});

it('cancels a seated entry by completing a safe exit before releasing the seat',()=>{
  const q=setup(),a=actor(q,3);step(q,[a],30);
  expect(a.skills.request({requestId:'sit-cancel',action:'sit',targetId:'seat'}).status).toBe('running');step(q,[a],20);
  expect(a.skills.cancel('sit-cancel')).toMatchObject({status:'running',code:'CANCELLING'});
  step(q,[a],75);expect(a.skills.status('sit-cancel')?.status).toBe('running');expect(q.interactions.unavailable('seat')).toBe(true);
  step(q,[a],90);expect(a.skills.status('sit-cancel')).toMatchObject({status:'cancelled',action:'sit'});
  expect(a.skills.seated).toBeNull();expect(q.interactions.unavailable('seat')).toBe(false);expect(a.capsuleHeight).toBeCloseTo(1.68);
});

it('preserves a gripped item when cancelling the rest of its pickup animation',()=>{
  const q=setup(),a=actor(q,0);step(q,[a],30);
  expect(a.skills.request({requestId:'gripped',action:'pickup',targetId:'cup'}).status).toBe('running');step(q,[a],25);
  expect(a.skills.carrying).toBe('cup');expect(a.skills.cancel('gripped')?.status).toBe('cancelled');
  expect(a.skills.carrying).toBe('cup');expect(q.interactions.unavailable('cup')).toBe(true);expect(q.interactions.targets.get('cup')!.physical!.read().enabled).toBe(false);expect(q.colliderForId('cup')!.parent()!.isKinematic()).toBe(true);
});

it('finishes a stand-up exit before acknowledging its cancellation',()=>{
  const q=setup(),a=actor(q,3);step(q,[a],30);a.skills.request({requestId:'sit',action:'sit',targetId:'seat'});step(q,[a],180);
  expect(a.skills.request({requestId:'exit',action:'standUp'}).status).toBe('running');step(q,[a],15);
  expect(a.skills.cancel('exit')?.status).toBe('running');expect(a.skills.seated).toBe('seat');
  step(q,[a],90);expect(a.skills.status('exit')).toMatchObject({status:'cancelled',action:'standUp'});expect(a.skills.seated).toBeNull();expect(q.interactions.unavailable('seat')).toBe(false);
});


it('synchronizes physical targets even when the world has no actors',()=>{
 const q=setup(),target=q.interactions.targets.get('cup')!;q.colliderForId('cup')!.parent()!.setTranslation({x:7,y:3,z:4},true);
 q.stepPhysics(1/60);expect(target.position.x).toBeCloseTo(7);expect(target.position.z).toBeCloseTo(4);expect(target.position.y).toBeLessThan(3);
});

it('does not reread every target body for every actor',()=>{
 const measure=(count:number)=>{
  const q=setup(),simulation=new Simulation(q,[],{id:'player'});
  try{
   for(let n=1;n<count;n++)simulation.addActor(`npc-${n}`,new Vector3(n*4,.04,0));
   for(let n=0;n<30;n++)simulation.step(1/60);
   const body=q.interactions.targets.get('cup')!.physical!,read=vi.spyOn(body,'read');
   simulation.step(1/60);const reads=read.mock.calls.length;read.mockRestore();return reads;
  }finally{simulation.dispose();}
 };
 const one=measure(1),three=measure(3);expect(one).toBeGreaterThan(0);expect(three).toBe(one);
});

it('keeps a seat attached to declared static collision eligible',()=>{
 const q=new EnvironmentQueries({...map,boxes:[...map.boxes,{id:'chair',position:[3,.25,1],size:[1,.5,1]}],interactions:[{...map.interactions![1]!,colliderIds:['chair']}]});environments.push(q);
 const seated=actor(q,3);step(q,[seated],30);
 expect(seated.skills.eligibility('sit','seat')).toMatchObject({eligible:true,reason:'READY'});
});

it('keeps pickup capabilities alive when only rigid groups are reset',()=>{
 const q=setup(),simulation=new Simulation(q,[],{id:'player'});
 try{const physical=q.interactions.targets.get('cup')!.physical!;q.resetRigidGroups();expect(physical.isValid).toBe(true);expect(()=>simulation.step(1/60)).not.toThrow();}
 finally{simulation.dispose();}
});


it('rejects content reset before mutating a live held relationship',()=>{
 const q=setup(),a=actor(q,0);step(q,[a],30);
 expect(a.skills.request({requestId:'hold-reset',action:'pickup',targetId:'cup'}).status).toBe('running');step(q,[a],120);
 const physical=q.interactions.targets.get('cup')!.physical!,body=q.colliderForId('cup')!.parent()!;
 expect(physical.isHeld).toBe(true);
 expect(()=>q.resetContents()).toThrow('INTERACTION_RESET_REQUIRES_RELEASE');
 expect(physical.isValid).toBe(true);expect(physical.isHeld).toBe(true);expect(q.colliderForId('cup')!.parent()).toBe(body);
 q.resetRigidGroups();expect(physical.isHeld).toBe(true);expect(a.skills.carrying).toBe('cup');
 a.resetAt(new Vector3(0,.04,0));q.resetContents();
 expect(physical.isValid).toBe(false);expect(q.interactions.targets.get('cup')!.physical!.isValid).toBe(true);
 expect(()=>step(q,[a],1)).not.toThrow();
});


it('reads world target poses without actors and without advancing the physical owner',()=>{
 const q=setup(),simulation=new Simulation(q,[]);
 try{
  const target=q.interactions.targets.get('cup')!,pose=target.position.toArray(),time=simulation.time;
  const read=()=>readInteractionTargets(q);
  expect(read().map(target=>target.id)).toEqual(['cup','seat','loose-box']);
  const values=read();values[0]!.position.set(100,100,100);values[0]!.rotation!.set(1,0,0,0);
  expect(target.position.toArray()).toEqual(pose);expect(read()[0]!.rotation!.w).toBe(1);expect(simulation.time).toBe(time);
 }finally{simulation.dispose();}
});

it.each(['moved','disabled','mass'] as const)('revalidates the actual pickup body at contact after reservation: %s',change=>{
 const q=setup(),a=actor(q,0);step(q,[a],30);
 expect(a.skills.request({requestId:'late-change',action:'pickup',targetId:'cup'}).status).toBe('running');
 for(let n=0;n<30&&a.skills.active?.phase==='align';n++)step(q,[a],1);
 expect(a.skills.active?.phase).toBe('play');expect(a.skills.carrying).toBeNull();
 const physical=q.interactions.targets.get('cup')!.physical!,collider=q.colliderForId('cup')!,body=collider.parent()!;
 if(change==='moved')body.setTranslation({x:5,y:1,z:0},true);
 if(change==='disabled')collider.setEnabled(false);
 if(change==='mass')collider.setMass(100);
 step(q,[a],40);
 expect(a.skills.status('late-change')).toMatchObject({status:'cancelled',code:change==='moved'?'GRASP_OUT_OF_REACH':change==='disabled'?'TARGET_DISABLED':'TOO_HEAVY'});
 expect(a.skills.carrying).toBeNull();expect(physical.isHeld).toBe(false);expect(q.interactions.unavailable('cup')).toBe(false);
 if(change==='disabled')expect(collider.isEnabled()).toBe(false);
});

it('does not acquire a native-disabled map body or collider through its physical capability',()=>{
 const q=setup(),physical=q.interactions.targets.get('cup')!.physical!,collider=q.colliderForId('cup')!,body=collider.parent()!;
 collider.setEnabled(false);expect(physical.hold({})).toBe(false);collider.setEnabled(true);
 body.setEnabled(false);expect(physical.hold({})).toBe(false);
});
