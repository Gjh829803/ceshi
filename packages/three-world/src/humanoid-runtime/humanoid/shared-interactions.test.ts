import {afterEach,beforeAll,expect,it} from 'vitest';
import {Vector3} from 'three';
import {EnvironmentQueries,initEnvironmentQueries} from '../environment/queries';
import type {EnvironmentDefinition} from '../environment/types';
import {HumanoidController} from './controller';
import {ACTION_CLIP_IDS} from './action-schema';
import {Simulation} from '../simulation';

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
  target.state='placed';target.position.set(5,2,4);target.body!.setTranslation(target.position,true);
  const crate=q.interactions.crates[0]!;crate.body.setTranslation({x:6,y:4,z:2},true);
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
  const body=q.interactions.targets.get('cup')!.body;
  expect(holder.controller.skills.carrying).toBe('cup');
  expect(simulation.controlledActor.prepareCharacter(new Vector3(-3,.04,0),0)).toBe(true);
  expect(holder.controller.skills.carrying).toBe('cup');expect(q.interactions.targets.get('cup')!.body).toBe(body);
  expect(q.interactions.unavailable('cup')).toBe(true);
  simulation.reset();expect(holder.controller.skills.carrying).toBeNull();expect(q.interactions.targets.get('cup')!.state).toBe('available');
});

it('uses declared crate identities independent of array order',()=>{
  const q=setup(),crate=q.interactions.crates[0]!;
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
  const target=a.skills.targets.get('cup')!,body=target.body!,crate=a.crates[0]!.body;
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
  const body=a.skills.targets.get('cup')!.body!;a.dispose();
  expect(body.isValid()).toBe(true);expect(body.isEnabled()).toBe(true);expect(b.skills.targets.get('cup')!.state).toBe('dropped');
});

it('releases a reservation on cancellation before grip without recreating the target',()=>{
  const q=setup(),a=actor(q,-.7),b=actor(q,.7);step(q,[a,b],30);
  const body=a.skills.targets.get('cup')!.body!;
  expect(a.skills.request({requestId:'cancel-me',action:'pickup',targetId:'cup'}).status).toBe('running');
  expect(a.skills.cancel('cancel-me')?.status).toBe('cancelled');
  expect(b.skills.request({requestId:'next',action:'pickup',targetId:'cup'}).status).toBe('running');
  expect(b.skills.targets.get('cup')!.body).toBe(body);
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
