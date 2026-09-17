import {beforeAll,expect,it,vi} from 'vitest';
vi.mock('@worldkit/preset-content/assets/resources',()=>({definitions:{},resolvePresetResource:()=>{throw new Error('UNEXPECTED_RESOURCE');}}));
import {Group,PerspectiveCamera,Vector3} from 'three';
import {SPECS} from '@worldkit/preset-content/config';
import {getMap} from '@worldkit/preset-content/environment/maps';
import {createWorld} from '../world';
import {initEnvironmentQueries} from './environment/queries';
import {emptyInput,type Input} from './simulation';

beforeAll(initEnvironmentQueries);
async function fixture(height=0,wall=false){
  const spec={...SPECS.find(s=>s.id==='wingsuit')!,spawn:[0,height,0] as [number,number,number],yaw:0};
  const map={...getMap('aircraft-training'),lifts:[],playerSpawn:[2,height+.025,0] as [number,number,number],
    boxes:[{id:'floor',position:[0,-.5,0] as [number,number,number],size:[1000,1,1000] as [number,number,number]},
      ...(height?[{id:'platform',position:[0,height-.5,0] as [number,number,number],size:[12,1,12] as [number,number,number]}]:[]),
      ...(wall?[{id:'wall',position:[2,2,4] as [number,number,number],size:[10,4,.3] as [number,number,number]}]:[])],
    spawns:[{id:'suit',name:'翼装',vehicleId:spec.id,position:spec.spawn,yaw:0,regionId:'airfield'}]};
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:spec.id,assetId:spec.id,spec,object:new Group()}]}});
  const sim=world.humanoid!.simulation,actor=sim.controlledActor,v=sim.vehicles[0]!;
  const step=(input:Partial<Input>={},ticks=1)=>{for(let n=0;n<ticks;n++)sim.step(1/60,new Map([[actor.id,{input:{...emptyInput(),...input,...(n?{jump:false}:{})},yaw:0}]]));};
  step({},30);expect(actor.enter(v.spec.id),actor.message).toBe(true);step({},2);
  return {world,sim,actor,v,step};
}

it('wears on level ground, walks in four directions and does not fly from a normal jump',async()=>{
  const f=await fixture();try{
    const {actor,v,step}=f;expect(actor.wingsuitGroundControl).toBe(true);expect(actor.controller.isMounted).toBe(false);
    expect(actor.controller.capsule.isEnabled()).toBe(true);
    for(const input of [{forward:1},{forward:-1},{steer:1},{steer:-1}]){
      step({},60);const start=v.position.clone();step(input,60);
      expect(v.position.distanceTo(start)).toBeGreaterThan(2);expect(v.position.distanceTo(actor.controller.position)).toBeLessThan(1e-8);
    }
    step({},60);step({jump:true},1);step({},120);
    expect(actor.wingsuitGroundControl).toBe(true);expect(v.motion.aircraft!.wearable!.hadFlight).toBe(false);
    expect(v.motion.aircraft!.canopy).toBe(0);expect(v.motion.aircraft!.towSeconds).toBe(0);expect(v.grounded).toBe(true);
  }finally{f.world.dispose();}
});

it('uses normal sprint/slow walking and the existing wall collision',async()=>{
  const f=await fixture(0,true);try{
    const {v,step}=f;step({forward:1,boost:true,slow:true},60);expect(v.speed).toBeLessThan(1.6);
    step({forward:1,boost:true},120);expect(v.position.z).toBeLessThan(3.8);expect(v.grounded).toBe(true);
    expect(v.motion.aircraft!.towSeconds).toBe(0);
  }finally{f.world.dispose();}
});

it('F unequips at the current position and repeated wearing clears completed-flight state',async()=>{
  const f=await fixture();try{
    const {actor,v,step}=f;step({forward:1},90);step({},60);const dropped=v.position.clone();
    expect(actor.interact(),actor.message).toBe(true);step({},45);expect(actor.vehicle).toBeUndefined();
    expect(v.position.distanceTo(dropped)).toBeLessThan(.2);
    Object.assign(v.motion.aircraft!.wearable!,{hadFlight:true,phase:'stowed',landingSeconds:3});
    v.motion.aircraft!.towSeconds=8;v.motion.aircraft!.canopy=1;
    expect(actor.interact(),actor.message).toBe(true);step({},120);
    expect(actor.vehicle).toBe(v);expect(actor.wingsuitGroundControl).toBe(true);
    expect(v.motion.aircraft!.wearable!.hadFlight).toBe(false);expect(v.motion.aircraft!.canopy).toBe(0);expect(v.motion.aircraft!.towSeconds).toBe(0);
  }finally{f.world.dispose();}
});

it('hands off once after a real platform departure, lands, drops flat and can be worn again',async()=>{
  const f=await fixture(35);try{
    const {actor,v,step}=f;
    for(let n=0;n<300&&actor.wingsuitGroundControl;n++)step({forward:1});
    expect(actor.wingsuitGroundControl).toBe(false);expect(actor.vehicle).toBe(v);
    expect(actor.controller.isMounted).toBe(true);expect(actor.controller.capsule.isEnabled()).toBe(false);
    expect(v.grounded).toBe(false);expect(v.velocity.y).toBeLessThan(0);expect(v.motion.aircraft!.canopy).toBe(0);
    const start=v.position.clone();step({forward:1},1);expect(v.position.distanceTo(start)).toBeLessThan(1);
    for(let n=0;n<3600&&actor.vehicle;n++)step({brake:true});
    expect(actor.vehicle,actor.message).toBeUndefined();expect(actor.controller.capsule.isEnabled()).toBe(true);
    expect(v.position.y).toBeLessThan(.2);expect(v.pitch).toBeCloseTo(0);expect(v.roll).toBeCloseTo(0);
    step({},60);expect(actor.interact(),actor.message).toBe(true);step({},120);expect(actor.wingsuitGroundControl).toBe(true);
  }finally{f.world.dispose();}
});

it('character preparation and reset release walking equipment without leaving a second controller',async()=>{
  const f=await fixture();try{
    const {actor,v,sim,step}=f;expect(actor.prepareCharacter(new Vector3(20,.025,0),0)).toBe(true);
    step({},30);expect(actor.vehicle).toBeUndefined();expect(v.motion.aircraft!.wearable!.groundLocomotion).toBe(false);
    sim.reset();step({},30);expect(v.motion.aircraft!.wearable!.hadFlight).toBe(false);
  }finally{f.world.dispose();}
});

it('public World input moves the equipped character, exposes walking semantics and preserves the mounted relationship',async()=>{
  const f=await fixture();try{
    const {world,actor,v}=f;const start=v.position.clone();
    world.step({humanoid:{...emptyInput(),forward:1,slow:true}},60);
    expect(v.position.distanceTo(start)).toBeGreaterThan(.7);expect(v.speed).toBeLessThan(1.6);
    expect(world.humanoid!.inputGuide().family).toBe('character');
    expect(world.humanoid!.inputGuide().fields.actions).toBeUndefined();
    expect(world.humanoid!.snapshot().vehicleDynamics[0]!.physicsOwner).toBe('controller');
    expect(actor.vehicle).toBe(v);expect(actor.controller.isMounted).toBe(false);
    world.step({humanoid:emptyInput()},60);world.step({interactPressed:true});world.step({},60);
    expect(actor.vehicle).toBeUndefined();world.step({interactPressed:true});world.step({},60);
    expect(actor.vehicle).toBe(v);expect(actor.wingsuitGroundControl).toBe(true);
  }finally{f.world.dispose();}
});
