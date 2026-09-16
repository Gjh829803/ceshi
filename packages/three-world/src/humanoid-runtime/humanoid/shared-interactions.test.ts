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
  boxes:[{id:'floor',position:[0,-.5,0],size:[20,1,20]},{id:'table',position:[0,.4145,.65],size:[1.8,.829,.68]},{id:'seat-shape',position:[3,.41,-.49],size:[.56,.1,.38]}],
  water:[],regions:[],spawns:[],playerSpawn:[-2,.04,0],looseCrates:[{id:'loose-box',position:[5,2,0],size:.5}],
  interactions:[{id:'cup',label:'Cup',kind:'pickup',slotId:'pickup',position:[.051,.894,.363],approach:[0,0,0],yaw:0,size:[.13,.13,.13],massKg:.3},
    {id:'seat',label:'Seat',kind:'seat',slotId:'seat',position:[3,.46,-.49],approach:[3,.03,0],yaw:0,colliderIds:['seat-shape']}]};
beforeAll(initEnvironmentQueries);
afterEach(()=>{for(const controller of controllers.splice(0))controller.dispose();for(const environment of environments.splice(0))environment.dispose();});
function setup(){const q=new EnvironmentQueries(map);environments.push(q);return q;}
function actor(q:EnvironmentQueries,x:number,id?:string){const actor=new HumanoidController(q,id);controllers.push(actor);actor.resetAt(new Vector3(x,.04,0),0);actor.setAvailableClips(new Set(ACTION_CLIP_IDS),[]);return actor;}
function step(q:EnvironmentQueries,actors:HumanoidController[],ticks:number){for(let i=0;i<ticks;i++){for(const actor of actors)actor.step(new Vector3(),false,false,false);q.stepPhysics(1/60);}}

it('never reserves a target after actor admission fails and retains hands only while held',()=>{
 const q=setup(),a=actor(q,0,'a'),registry=q.interactions,resources=registry.actorResources,nav={};step(q,[a],30);
 resources.acquire(nav,[{actorId:'a',channel:'locomotion'}],{kind:'navigation',id:'nav'});
 expect(a.skills.request({requestId:'busy-actor',action:'pickup',targetId:'cup'}).code).toBe('ACTOR_RESOURCE_BUSY');
 expect(registry.claimState(registry.target('cup')!)).toBeNull();expect(resources.inspect('a')).toHaveLength(1);
 resources.release(nav);const other={};expect(registry.reserve(registry.target('cup')!,other,'other')).toBe(true);
 expect(a.skills.request({requestId:'busy-target',action:'pickup',targetId:'cup'}).code).toBe('TARGET_UNAVAILABLE');expect(resources.inspect('a')).toEqual([]);
 registry.releaseOwner(other);expect(a.skills.request({requestId:'take',action:'pickup',targetId:'cup'}).status).toBe('running');
 expect(resources.inspect('a')).toHaveLength(5);step(q,[a],90);
 expect(a.skills.carrying).toBe('cup');expect(resources.inspect('a').map(claim=>claim.channel)).toEqual(['left-hand','right-hand']);
 expect(resources.acquire(nav,[{actorId:'a',channel:'locomotion'},{actorId:'a',channel:'animation'}],{kind:'navigation',id:'carry'})).toBe(true);
 resources.release(nav);expect(a.skills.request({requestId:'place',action:'putDown'}).status).toBe('completed');expect(resources.inspect('a')).toEqual([]);
});

it('routes the shared interaction command to put down while carrying',()=>{
 const q=setup(),a=actor(q,0,'a');step(q,[a],30);
 expect(a.skills.request({requestId:'take-for-interaction',action:'pickup',targetId:'cup'}).status).toBe('running');step(q,[a],90);
 expect(a.skills.carrying).toBe('cup');a.skills.step(new Vector3(),false,{interact:true});expect(a.skills.carrying).toBeNull();
});

it('restores world interactions and crates at the simulation reset entry',()=>{
  const q=setup(),simulation=new Simulation(q,[],{id:'player'});controllers.push(simulation.controlledActor.controller);
  const target=q.interactions.target('cup')!;
  target.state='placed';target.position.set(5,2,4);q.colliderForId('cup')!.parent()!.setTranslation(target.position,true);
  const crate=q.looseCrates[0]!;crate.body.setTranslation({x:6,y:4,z:2},true);
  simulation.reset();
  expect(target.state).toBe('removed');expect(q.interactions.isCurrent(target)).toBe(false);expect(q.interactions.target('cup')!.position.toArray()).toEqual(map.interactions![0]!.position);
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
  expect(q.interactions.unavailable(q.interactions.target('cup')!)).toBe(true);
  simulation.reset();expect(holder.controller.skills.carrying).toBeNull();expect(q.interactions.target('cup')!.state).toBe('available');
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
  expect(q.colliderCount-count).toBe(1);expect(a.skills.interactions.targets).toBe(b.skills.interactions.targets);expect(a.crates).toBe(b.crates);
  const target=a.skills.interactions.target('cup')!,body=q.colliderForId('cup')!.parent()!,crate=a.crates[0]!.body;
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
  expect(body.isValid()).toBe(true);expect(body.isEnabled()).toBe(true);expect(b.skills.interactions.target('cup')!.state).toBe('dropped');
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
  step(q,[a,b],90);expect(a.skills.seated).toBeNull();expect(b.skills.interactions.target('seat')!.state).toBe('available');
  expect(a.teleportTo(new Vector3(0,.04,-2),0)).toBe(true);
  expect(b.skills.request({requestId:'next-seat',action:'sit',targetId:'seat'}).status).toBe('running');
});

it('cancels a seated entry by completing a safe exit before releasing the seat',()=>{
  const q=setup(),a=actor(q,3);step(q,[a],30);
  expect(a.skills.request({requestId:'sit-cancel',action:'sit',targetId:'seat'}).status).toBe('running');step(q,[a],20);
  expect(a.skills.cancel('sit-cancel')).toMatchObject({status:'running',code:'CANCELLING'});
  step(q,[a],75);expect(a.skills.status('sit-cancel')?.status).toBe('running');expect(q.interactions.unavailable(q.interactions.target('seat')!)).toBe(true);
  step(q,[a],90);expect(a.skills.status('sit-cancel')).toMatchObject({status:'cancelled',action:'sit'});
  expect(a.skills.seated).toBeNull();expect(q.interactions.unavailable(q.interactions.target('seat')!)).toBe(false);expect(a.capsuleHeight).toBeCloseTo(1.68);
});

it('preserves a gripped item when cancelling the rest of its pickup animation',()=>{
  const q=setup(),a=actor(q,0);step(q,[a],30);
  expect(a.skills.request({requestId:'gripped',action:'pickup',targetId:'cup'}).status).toBe('running');step(q,[a],25);
  expect(a.skills.carrying).toBe('cup');expect(a.skills.cancel('gripped')?.status).toBe('cancelled');
  expect(a.skills.carrying).toBe('cup');expect(q.interactions.unavailable(q.interactions.target('cup')!)).toBe(true);expect(q.interactions.target('cup')!.physical!.read().collisionEnabled).toBe(false);expect(q.colliderForId('cup')!.parent()!.isKinematic()).toBe(true);
});

it('finishes a stand-up exit before acknowledging its cancellation',()=>{
  const q=setup(),a=actor(q,3);step(q,[a],30);a.skills.request({requestId:'sit',action:'sit',targetId:'seat'});step(q,[a],180);
  expect(a.skills.request({requestId:'exit',action:'standUp'}).status).toBe('running');step(q,[a],15);
  expect(a.skills.cancel('exit')?.status).toBe('running');expect(a.skills.seated).toBe('seat');
  step(q,[a],90);expect(a.skills.status('exit')).toMatchObject({status:'cancelled',action:'standUp'});expect(a.skills.seated).toBeNull();expect(q.interactions.unavailable(q.interactions.target('seat')!)).toBe(false);
});


it('synchronizes physical targets even when the world has no actors',()=>{
 const q=setup(),target=q.interactions.target('cup')!;q.colliderForId('cup')!.parent()!.setTranslation({x:7,y:3,z:4},true);
 q.stepPhysics(1/60);expect(target.position.x).toBeCloseTo(7);expect(target.position.z).toBeCloseTo(4);expect(target.position.y).toBeLessThan(3);
});

it('does not reread every target body for every actor',()=>{
 const measure=(count:number)=>{
  const q=setup(),simulation=new Simulation(q,[],{id:'player'});
  try{
   for(let n=1;n<count;n++)simulation.addActor(`npc-${n}`,new Vector3(n*4,.04,0));
   for(let n=0;n<30;n++)simulation.step(1/60);
   const body=q.interactions.target('cup')!.physical!,read=vi.spyOn(body,'read');
   simulation.step(1/60);const reads=read.mock.calls.length;read.mockRestore();return reads;
  }finally{simulation.dispose();}
 };
 const one=measure(1),three=measure(3);expect(one).toBeGreaterThan(0);expect(three).toBe(one);
});

it('keeps a seat attached to declared static collision eligible',()=>{
 const q=new EnvironmentQueries({...map,boxes:map.boxes.map(box=>box.id==='seat-shape'?{...box,id:'chair'}:box),interactions:[{...map.interactions![1]!,colliderIds:['chair']}]});environments.push(q);
 const seated=actor(q,3);step(q,[seated],30);
 expect(seated.skills.eligibility('sit','seat')).toMatchObject({eligible:true,reason:'READY'});
});

it('keeps pickup capabilities alive when only rigid groups are reset',()=>{
 const q=setup(),simulation=new Simulation(q,[],{id:'player'});
 try{const physical=q.interactions.target('cup')!.physical!;q.resetRigidGroups();expect(physical.isValid).toBe(true);expect(()=>simulation.step(1/60)).not.toThrow();}
 finally{simulation.dispose();}
});


it('rejects content reset before mutating a live held relationship',()=>{
 const q=setup(),a=actor(q,0);step(q,[a],30);
 expect(a.skills.request({requestId:'hold-reset',action:'pickup',targetId:'cup'}).status).toBe('running');step(q,[a],120);
 const physical=q.interactions.target('cup')!.physical!,body=q.colliderForId('cup')!.parent()!;
 expect(physical.isHeld).toBe(true);
 expect(()=>q.resetContents()).toThrow('INTERACTION_RESET_REQUIRES_RELEASE');
 expect(physical.isValid).toBe(true);expect(physical.isHeld).toBe(true);expect(q.colliderForId('cup')!.parent()).toBe(body);
 q.resetRigidGroups();expect(physical.isHeld).toBe(true);expect(a.skills.carrying).toBe('cup');
 a.resetAt(new Vector3(0,.04,0));q.resetContents();
 expect(physical.isValid).toBe(false);expect(q.interactions.target('cup')!.physical!.isValid).toBe(true);
 expect(()=>step(q,[a],1)).not.toThrow();
});


it('reads world target poses without actors and without advancing the physical owner',()=>{
 const q=setup(),simulation=new Simulation(q,[]);
 try{
  const target=q.interactions.target('cup')!,pose=target.position.toArray(),time=simulation.time;
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
 const physical=q.interactions.target('cup')!.physical!,collider=q.colliderForId('cup')!,body=collider.parent()!;
 if(change==='moved')body.setTranslation({x:5,y:1,z:0},true);
 if(change==='disabled')collider.setEnabled(false);
 if(change==='mass')collider.setMass(100);
 step(q,[a],40);
 expect(a.skills.status('late-change')).toMatchObject({status:'cancelled',code:change==='moved'?'GRASP_OUT_OF_REACH':change==='disabled'?'TARGET_DISABLED':'TOO_HEAVY'});
 expect(a.skills.carrying).toBeNull();expect(physical.isHeld).toBe(false);expect(q.interactions.claimState(q.interactions.target('cup')!)).toBeNull();
 if(change==='disabled')expect(collider.isEnabled()).toBe(false);
});

it('does not acquire a native-disabled map body or collider through its physical capability',()=>{
 const q=setup(),physical=q.interactions.target('cup')!.physical!,collider=q.colliderForId('cup')!,body=collider.parent()!;
 collider.setEnabled(false);expect(physical.hold({})).toBe(false);collider.setEnabled(true);
 body.setEnabled(false);expect(physical.hold({})).toBe(false);
});

it('binds independent local slots to one existing physical entity and arbitrates whole-entity pickup',async()=>{
 const {ThreePhysics}=await import('../../physics'),{physicsHost}=await import('../../physics-host'),{Group,Mesh,BoxGeometry,MeshBasicMaterial}=await import('three');
 const q=setup(),physics=ThreePhysics.borrow(q.borrowPhysics()),root=new Group(),geometry=new BoxGeometry(2,.3,1),material=new MeshBasicMaterial();root.add(new Mesh(geometry,material));root.position.set(5,2,3);root.rotation.y=Math.PI/2;
 try{
  physics.addRigid('bench',root,{kind:'dynamic',shape:'box',massKilograms:3});const physical=physicsHost(physics).interactionBody('bench'),count=q.colliderCount;
  q.interactions.registerEntity('bench',[
   {slotId:'left',kind:'seat',label:'Left',positionLocalMetersXYZ:[-.6,.2,0],approachLocalMetersXYZ:[-.6,-2,-.5],rotationLocalRadiansXYZ:[0,0,0],capacity:1},
   {slotId:'right',kind:'seat',label:'Right',positionLocalMetersXYZ:[.6,.2,0],approachLocalMetersXYZ:[.6,-2,-.5],rotationLocalRadiansXYZ:[0,0,0],capacity:1},
   {slotId:'grip',kind:'pickup',label:'Grip',positionLocalMetersXYZ:[.3,0,0],approachLocalMetersXYZ:[0,-2,-.4],rotationLocalRadiansXYZ:[0,0,0],capacity:1},
  ],()=>physical);
  q.interactions.syncPhysicalState();const left=q.interactions.target('bench','left')!,right=q.interactions.target('bench','right')!,grip=q.interactions.target('bench','grip')!;
  expect(left.position.distanceTo(new Vector3(5,2.2,3.6))).toBeLessThan(1e-6);expect(q.colliderCount).toBe(count);
  const a={},b={};expect(q.interactions.reserve(left,a,'sit-a')).toBe(true);expect(q.interactions.reserve(right,b,'sit-b')).toBe(true);
  expect(q.interactions.reserve(grip,{},'pickup')).toBe(false);expect(q.interactions.commit(left,a,'sit-a','occupied')).toBe(true);q.interactions.finish(a,'sit-a');
  expect(q.interactions.unavailable(left)).toBe(true);q.interactions.releaseOwner(a);q.interactions.releaseOwner(b);
  expect(q.interactions.reserve(grip,a,'pickup-2')).toBe(true);expect(q.interactions.reserve(left,b,'sit-c')).toBe(false);
  expect(q.interactions.commit(grip,a,'pickup-2','held')).toBe(true);q.interactions.finish(a,'pickup-2');
  expect(physical.isHeld).toBe(true);expect(q.interactions.moveHeld(grip,a,new Vector3(7,4,2))).toBe(true);
  expect(root.getWorldPosition(new Vector3()).distanceTo(new Vector3(7,4,2))).toBeCloseTo(.3);
  q.interactions.unregisterEntity('bench');expect(physical.isHeld).toBe(false);expect(q.interactions.isCurrent(grip)).toBe(false);
 }finally{physics.dispose();geometry.dispose();material.dispose();}
});

it('expires only short reservations on simulation time, never on observation or after occupancy',()=>{
 const q=setup(),target=q.interactions.target('cup')!,owner={};expect(q.interactions.reserve(target,owner,'lease')).toBe(true);
 const claim=q.interactions.claimState(target);for(let i=0;i<100;i++)readInteractionTargets(q);expect(q.interactions.claimState(target)).toEqual(claim);
 for(let i=0;i<301;i++)q.stepPhysics(1/60);expect(q.interactions.claimState(target)).toBeNull();expect(q.interactions.commit(target,owner,'lease','held')).toBe(false);
 const seat=q.interactions.target('seat')!;expect(q.interactions.reserve(seat,owner,'occupy')).toBe(true);expect(q.interactions.commit(seat,owner,'occupy','occupied')).toBe(true);
 for(let i=0;i<400;i++)q.stepPhysics(1/60);expect(q.interactions.claimState(seat)?.state).toBe('occupied');q.interactions.releaseOwner(owner);
});

it('invalidates removed reservations without allowing an old reference to acquire a reset target',()=>{
 const q=setup(),a=actor(q,0);step(q,[a],30);const target=q.interactions.target('cup')!;
 expect(a.skills.request({requestId:'remove-before-grip',action:'pickup',targetId:'cup'}).status).toBe('running');q.interactions.unregisterEntity('cup');
 expect(a.skills.status('remove-before-grip')).toMatchObject({status:'cancelled',code:'TARGET_REMOVED'});expect(a.skills.carrying).toBeNull();
 q.resetContents();const replacement=q.interactions.target('cup')!;expect(replacement.generation).toBeGreaterThan(target.generation);
 expect(q.interactions.commit(target,a.skills,'remove-before-grip','held')).toBe(false);expect(replacement.physical!.isHeld).toBe(false);
});

it('keeps a safe low capsule after an occupied target disappears under a ceiling',async()=>{
 const {default:RAPIER}=await import('@dimforge/rapier3d-compat');const q=setup(),a=actor(q,3,'low-seat');step(q,[a],30);
 expect(a.skills.request({requestId:'seat-removal',action:'sit',targetId:'seat'}).status).toBe('running');step(q,[a],100);expect(a.skills.seated).toBe('seat');
 const roof=a.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(a.position.x,1.65,a.position.z));a.world.createCollider(RAPIER.ColliderDesc.cuboid(2,.2,2),roof);a.world.updateSceneQueries();
 q.interactions.unregisterEntity('seat');expect(a.skills.seated).toBeNull();step(q,[a],30);
 expect(q.interactions.actorResources.inspect('low-seat').map(claim=>claim.channel)).toEqual(['locomotion','animation','pose']);
 expect(a.skills.active?.phase).toBe('target-exit');expect(a.capsuleHalf).toBeCloseTo((1.4-.56)/2);expect(a.skills.status('seat-removal')?.status).toBe('completed');
 a.world.removeRigidBody(roof);a.world.updateSceneQueries();step(q,[a],3);expect(a.skills.active).toBeNull();expect(a.capsuleHalf).toBeCloseTo((1.68-.56)/2);
 expect(q.interactions.actorResources.inspect('low-seat')).toEqual([]);
});

it('lets two actors occupy separate seats of one authored entity and releases only the selected seat',async()=>{
 const {ThreePhysics}=await import('../../physics'),{physicsHost}=await import('../../physics-host'),{Mesh,BoxGeometry,MeshBasicMaterial}=await import('three');
 const q=setup(),physics=ThreePhysics.borrow(q.borrowPhysics()),geometry=new BoxGeometry(2.2,.1,.38),material=new MeshBasicMaterial(),bench=new Mesh(geometry,material);bench.position.set(6,.41,0);
 try{
  physics.addRigid('bench',bench,{kind:'fixed',shape:'box'});q.interactions.registerEntity('bench',[-.65,.65].map((x,index)=>({slotId:index?'right':'left',label:'Seat',kind:'seat',capacity:1,positionLocalMetersXYZ:[x,.05,0],approachLocalMetersXYZ:[x,-.39,-.49],rotationLocalRadiansXYZ:[0,Math.PI,0]})),()=>physicsHost(physics).interactionBody('bench'));
  const a=new HumanoidController(q,'a'),b=new HumanoidController(q,'b');controllers.push(a,b);for(const [actor,x] of [[a,5.35],[b,6.65]] as const){actor.resetAt(new Vector3(x,.04,-.49),Math.PI);actor.setAvailableClips(new Set(ACTION_CLIP_IDS),[]);}step(q,[a,b],30);
  const {characterCapabilities}=await import('../character-capabilities');
  expect(characterCapabilities(a).find(card=>card.id==='sit')).toMatchObject({eligible:true,targetId:'bench',slotId:'left'});
  expect(characterCapabilities(b).find(card=>card.id==='sit')).toMatchObject({eligible:true,targetId:'bench',slotId:'right'});
  expect(a.skills.request({requestId:'ambiguous',action:'sit',targetId:'bench'}).code).toBe('SLOT_REQUIRED');
  expect(a.skills.request({requestId:'left',action:'sit',targetId:'bench',slotId:'left'}).status).toBe('running');
  expect(b.skills.request({requestId:'conflict',action:'sit',targetId:'bench',slotId:'left'}).code).toBe('TARGET_UNAVAILABLE');
  expect(b.skills.request({requestId:'right',action:'sit',targetId:'bench',slotId:'right'}).status).toBe('running');step(q,[a,b],110);
  expect(a.skills.seated).toBe('bench');expect(b.skills.seated).toBe('bench');expect(q.interactions.claimState(q.interactions.target('bench','left')!)).toMatchObject({actorId:'a',state:'occupied'});expect(q.interactions.claimState(q.interactions.target('bench','right')!)).toMatchObject({actorId:'b',state:'occupied'});
  expect(a.skills.request({requestId:'wrong-exit',action:'standUp',targetId:'bench',slotId:'right'}).code).toBe('TARGET_MISMATCH');
  expect(a.skills.request({requestId:'exit',action:'standUp',targetId:'bench'}).status).toBe('running');step(q,[a,b],90);
  expect(a.skills.seated).toBeNull();expect(b.skills.seated).toBe('bench');expect(q.interactions.claimState(q.interactions.target('bench','left')!)).toBeNull();
 }finally{physics.dispose();geometry.dispose();material.dispose();}
});
