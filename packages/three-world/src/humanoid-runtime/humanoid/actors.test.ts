import {afterEach,beforeAll,expect,it} from 'vitest';
import {Vector3} from 'three';
import {EnvironmentQueries,initEnvironmentQueries} from '../environment/queries';
import type {EnvironmentDefinition} from '../environment/types';
import {Simulation,emptyInput} from '../simulation';

const map:EnvironmentDefinition={id:'actors',name:'Actors',description:'',bounds:{min:[-20,-5,-20],max:[20,10,20]},boxes:[{id:'floor',position:[0,-.5,0],size:[40,1,40]}],water:[],regions:[],spawns:[],playerSpawn:[-4,.04,0]};
const sims:Simulation[]=[],queries:EnvironmentQueries[]=[];
beforeAll(initEnvironmentQueries);
afterEach(()=>{for(const sim of sims.splice(0))sim.dispose();for(const q of queries.splice(0))q.dispose();});
function setup(){const q=new EnvironmentQueries(map);queries.push(q);const sim=new Simulation(q,[],{id:'player'});sims.push(sim);return {q,sim};}

it('carries two actors on one lift without advancing the platform twice',()=>{
  const liftMap:EnvironmentDefinition={...map,playerSpawn:[-.7,.1,0],lifts:[{id:'lift',position:[0,0,0],height:4,speed:1}],boxes:[
    ...map.boxes,{id:'lift-floor',position:[0,-.05,0],size:[6,.3,6],liftId:'lift'},
  ]};
  const q=new EnvironmentQueries(liftMap);queries.push(q);const sim=new Simulation(q,[],{id:'player'});sims.push(sim);
  const other=sim.addActor('other',new Vector3(.7,.1,0));
  for(let n=0;n<60;n++)sim.step(1/60);
  const before=q.propBoxPose('lift-floor')!.position.y;
  for(let n=0;n<120;n++)sim.step(1/60);
  const height=q.propBoxPose('lift-floor')!.position.y;
  expect(height-before).toBeGreaterThan(1);expect(height-before).toBeLessThan(1.7);
  expect(sim.controlledActor.player.position.y).toBeCloseTo(height+.15,1);
  expect(other.player.position.y).toBeCloseTo(height+.15,1);
  expect(other.controller.grounded).toBe(true);expect(sim.controlledActor.controller.grounded).toBe(true);
});

it('steps three independent controllers on one world tick and removes only one actor rig',()=>{
  const {q,sim}=setup();
  const a=sim.addActor('a',new Vector3(0,.04,0)),b=sim.addActor('b',new Vector3(4,.04,0));
  expect(sim.actors.size).toBe(3);expect(sim.actors.get('player')?.controller).toBe(sim.controlledActor.controller);
  const initial=q.physicsStepSequence;
  for(let n=0;n<60;n++)sim.step(1/60,new Map([['a',{input:{...emptyInput(),forward:1},yaw:0}],['b',{input:{...emptyInput(),forward:-1},yaw:0}]]));
  expect(q.physicsStepSequence-initial).toBe(60);expect(a.player.position.z).toBeGreaterThan(1);expect(b.player.position.z).toBeLessThan(-1);
  expect(sim.controlledActor.player.position.z).toBeCloseTo(0);expect(a.controller).not.toBe(b.controller);
  const bBody=b.controller.body,count=q.colliderCount;sim.removeActor('a');expect(q.colliderCount).toBe(count-1);expect(bBody.isValid()).toBe(true);
  sim.step(1/60);expect(q.physicsStepSequence-initial).toBe(61);
});

it('keeps per-actor reset scoped and disposes added actors on environment replacement',()=>{
  const {q,sim}=setup(),a=sim.addActor('a',new Vector3(0,.04,0)),b=sim.addActor('b',new Vector3(4,.04,0));
  a.resetAt(new Vector3(0,.04,3),0);expect(b.player.position.x).toBe(4);
  const old=a.controller.body,replacement=new EnvironmentQueries(map);queries.push(replacement);
  sim.dispose();const next=new Simulation(replacement,[],{id:'player'});sims.push(next);expect(old.isValid()).toBe(false);expect(next.actors.size).toBe(1);expect(q.colliderCount).toBe(1);
});

it('steps after preparing an actor twice before the first physics integration',()=>{
  const {sim}=setup(),actor=sim.addActor('a',new Vector3(3,.04,0));
  actor.resetAt(new Vector3(3,.03,5),Math.PI);
  sim.step(1/60);
  expect(actor.player.position.z).toBeCloseTo(5);
});

it('keeps approaching actors separated by their real capsules',()=>{
  const {sim}=setup(),a=sim.addActor('a',new Vector3(-1,.04,0)),b=sim.addActor('b',new Vector3(1,.04,0));
  for(let n=0;n<90;n++){
    sim.step(1/60,new Map([['a',{input:{...emptyInput(),steer:-1},yaw:0}],['b',{input:{...emptyInput(),steer:1},yaw:0}]]));
    // Real contacts can slide around the other capsule; X ordering is not an invariant.
    expect(Math.hypot(b.player.position.x-a.player.position.x,b.player.position.z-a.player.position.z)).toBeGreaterThanOrEqual(.55);
    expect(a.controller.capsule.contactCollider(b.controller.capsule,1)?.distance??1).toBeGreaterThanOrEqual(-.001);
  }
});

it('rejects an occupied spawn before allocating another actor rig',()=>{
  const {sim,q}=setup();sim.addActor('a',new Vector3(1,.04,0));const count=q.colliderCount;
  expect(()=>sim.addActor('b',new Vector3(1,.04,0))).toThrow('HUMANOID_ACTOR_SPAWN_BLOCKED');expect(q.colliderCount).toBe(count);
});
