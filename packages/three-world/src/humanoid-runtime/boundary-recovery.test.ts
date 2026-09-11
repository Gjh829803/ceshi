import {Group,PerspectiveCamera,Vector3} from 'three';
import {describe,expect,it,vi} from 'vitest';
import {createWorld} from '../world';
import {humanoidHost} from './host-access';
import {CENTER,type Probe} from './humanoid/controller';
import type {EnvironmentDefinition} from './environment/types';
import type {VehicleSpec} from './config';
import {emptyInput} from './simulation';
import {createMountedFixture} from './mounted-test-fixture';

const map:EnvironmentDefinition={id:'recovery-test',name:'Recovery',description:'',bounds:{min:[-50,-10,-50],max:[50,40,50]},
  boxes:[{id:'floor',position:[0,-.5,0],size:[100,1,100]}],water:[],
  regions:[{id:'ground',name:'Ground',description:'',center:[0,0,0],size:[100,100],color:'#fff',modes:['wheeled','plane']}],
  spawns:[{id:'car-spawn',name:'Car',vehicleId:'car',position:[-20,.025,0],yaw:0,regionId:'ground'}],playerSpawn:[0,.025,0],
  recovery:{fallBelowY:-3,checkpoint:{position:[-10,.025,-10],yaw:Math.PI/2}}};
const car:VehicleSpec={id:'car',name:'Car',en:'CAR',mode:'wheeled',kernel:'test',color:'#fff',spawn:[-20,.025,0],yaw:0,
  speed:12,accel:5,grip:10,steer:1,radius:1.2,seat:[0,1,0],camera:6,hint:'',archetype:'rover',
  envelope:{kind:'box',halfExtents:[1,1,2],offset:[0,1,0]}};
async function fixture(options:{map?:EnvironmentDefinition;vehicles?:VehicleSpec[]}={}){
  const selected=options.map??map;
  const spawns=[...selected.spawns,...(options.vehicles??[]).filter(v=>!selected.spawns.some(s=>s.vehicleId===v.id)).map(v=>({id:`spawn-${v.id}`,name:v.name,vehicleId:v.id,position:v.spawn,yaw:v.yaw,regionId:'ground'}))];
  return createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:{...selected,spawns},
    character:{instanceId:'person',object:new Group()},vehicles:(options.vehicles??[]).map(spec=>({instanceId:spec.id,assetId:spec.id,spec,object:new Group()}))}});
}
function displaceCharacter(world:Awaited<ReturnType<typeof fixture>>,position:Vector3){
  const h=world.humanoid!.simulation.controlledActor.controller,center=position.clone().add(new Vector3(0,h.capsuleCenter,0));
  h.position.copy(position);h.body.setTranslation(center,true);h.body.setNextKinematicTranslation(center);h.commitPose();
}

describe('explicit Humanoid boundary recovery',()=>{
  it.each(['fall','outside-map'] as const)('recovers %s once without resetting props, task time or camera mode',async trigger=>{
    const world=await fixture({map:{...map,looseCrates:[{id:'loose',position:[5,1,5],size:1}]}});
    try{
      const r=world.humanoid!,s=r.simulation,h=s.controlledActor.controller;r.setCameraMode(2);world.step({},30);
      const crate=h.crates[0]!;crate.body.setTranslation({x:8,y:.51,z:8},true);crate.body.setLinvel({x:0,y:0,z:0},true);
      const props=vi.spyOn(r.environment,'resetContents'),reset=vi.spyOn(h,'reset');const before=s.time,revision=s.controlledActor.teleportRevision;
      r.setInput({...emptyInput(),forward:1});
      displaceCharacter(world,new Vector3(trigger==='fall'?0:60,trigger==='fall'?-4:.025,0));world.step({});
      const snapshot=world.snapshot().humanoid!;
      expect(snapshot.recovery).toMatchObject({sequence:1,status:'recovered',trigger,reason:'SAFE_CHECKPOINT',subjectInstanceId:'person'});
      expect(h.position.distanceTo(new Vector3(-10,.025,-10))).toBeLessThan(1e-5);expect(h.velocity.length()).toBe(0);expect(h.vertical).toBe(0);
      expect(snapshot.teleportRevision).toBe(revision+1);expect(snapshot.cameraMode).toBe(2);expect(s.time).toBeGreaterThan(before);
      expect(props).not.toHaveBeenCalled();expect(reset).not.toHaveBeenCalled();expect(crate.body.translation().x).toBeCloseTo(8);
      expect(r.inspectControls().override).toBeNull();expect(world.camera.position.toArray().every(Number.isFinite)).toBe(true);
      world.step({},5);world.render();expect(r.snapshot().recovery?.sequence).toBe(1);expect(r.options.character.object.position.distanceTo(h.position)).toBeLessThan(.05);
    }finally{world.dispose();}
  });

  it('retains the mounted vehicle instance and excludes parked actors from recovery',async()=>{
    const world=await fixture({vehicles:[car,{...car,id:'parked',spawn:[25,.025,0]}]});
    try{
      const r=world.humanoid!,s=r.simulation;r.approach('car');expect(r.enter('car')).toBe(true);r.setCameraMode(1);world.step({},31);
      const v=s.controlledActor.vehicle!,other=s.vehicles[1]!,otherPosition=other.position.clone();v.position.set(2,-4,3);v.velocity.set(5,-5,3);v.pitch=.7;v.roll=.4;
      world.step({});expect(s.controlledActor.vehicle).toBe(v);expect(r.snapshot()).toMatchObject({mountedInstanceId:'car',cameraMode:1,recovery:{status:'recovered',subjectInstanceId:'car'}});
      expect(v.position.distanceTo(new Vector3(-10,.025,-10))).toBeLessThan(1e-5);expect(v.velocity.length()).toBe(0);expect([v.speed,v.steering,v.throttle,v.pitch,v.roll]).toEqual([0,0,0,0,0]);
      expect(other.position.distanceTo(otherPosition)).toBeLessThan(.05);expect(s.controlledActor.controller.isMounted).toBe(true);
    }finally{world.dispose();}
  });

  it('recovers a mounted horse to its own prepared spawn when checkpoint is omitted',async()=>{
    const world=await createMountedFixture();
    try{
      const r=world.humanoid!;r.switchMap({...r.options.map,recovery:{fallBelowY:-3}});r.approach('horse-1');expect(r.enter('horse-1')).toBe(true);world.step({},31);
      const horse=r.simulation.controlledActor.vehicle!;horse.position.y=-4;world.step({});
      expect(r.snapshot()).toMatchObject({mountedInstanceId:'horse-1',recovery:{status:'recovered',subjectInstanceId:'horse-1'}});
      expect(horse.position.x).toBeCloseTo(0);expect(horse.position.z).toBeCloseTo(0);expect(horse.motion.creature?.flying).toBe(false);
      expect(r.simulation.controlledActor.player.position.y).toBeCloseTo(horse.position.y+horse.spec.seat[1]);
    }finally{world.dispose();}
  });

  it.each(['missing-floor','low-roof','occupied'] as const)('leaves an unsafe %s checkpoint unchanged and reports one failed incident',async failure=>{
    const boxes:EnvironmentDefinition['boxes']=failure==='missing-floor'?[{id:'floor',position:[10,-.5,10],size:[8,1,8]}]:
      [...map.boxes,...(failure==='low-roof'?[{id:'roof',position:[-10,1.3,-10] as const,size:[4,.2,4] as const}]:[])];
    const world=await fixture({map:{...map,boxes,playerSpawn:failure==='missing-floor'?[10,.025,10]:map.playerSpawn},
      vehicles:failure==='occupied'?[{...car,id:'obstacle',spawn:[-10,.025,-10]}]:[]});
    try{
      const r=world.humanoid!,h=r.simulation.controlledActor.controller,teleport=vi.spyOn(h,'recoverTo');world.step({},2);
      displaceCharacter(world,new Vector3(10,-4,10));world.step({});
      expect(r.snapshot().recovery).toMatchObject({sequence:1,status:'blocked',to:null,reason:failure==='missing-floor'?'NO_STABLE_SUPPORT':'BODY_CLEARANCE_BLOCKED'});
      expect(teleport).not.toHaveBeenCalled();world.step({},30);expect(r.snapshot().recovery?.sequence).toBe(1);expect(teleport).not.toHaveBeenCalled();
    }finally{world.dispose();}
  });

  it('preserves carried-target state while restoring the actor capsule and animation state',async()=>{
    const world=await fixture({map:{...map,boxes:[...map.boxes,{id:'table',position:[0,.4125,.835],size:[2,.825,1]}],
      interactions:[{id:'parcel',slotId:'pickup',label:'Parcel',kind:'pickup',position:[.051,.9,.363],approach:[0,.025,0],yaw:0,size:[.13,.13,.13]}]}});
    try{
      const r=world.humanoid!,h=r.simulation.controlledActor.controller;h.setAvailableClips(new Set(['pickup','carry-walk']),[]);world.step({},30);
      const receipt=await world.execute({type:'humanoid.perform-action',request:{requestId:'pickup',action:'pickup',targetId:'parcel'}});expect(receipt.status,JSON.stringify(receipt)).toBe('accepted');
      world.step({},70);expect(h.skills.carrying).toBe('parcel');const target=h.skills.carriedTarget!,body=target.physical;
      displaceCharacter(world,new Vector3(0,-4,0));world.step({});
      expect(r.snapshot().recovery?.status).toBe('recovered');expect(h.skills.carrying).toBe('parcel');expect(target.state).toBe('carried');expect(target.physical).toBe(body);
      expect(target.position.x).toBeCloseTo(-10+.123);expect(target.position.z).toBeCloseTo(-10);expect(h.capsuleHeight).toBeCloseTo(CENTER*2);expect(h.state).toBe('idle');
    }finally{world.dispose();}
  });

  it('keeps unconfigured recovery behavior and reports unsupported mounted modes explicitly',async()=>{
    const {recovery:_,...legacy}=map;const world=await fixture({map:legacy});
    try{const h=world.humanoid!.simulation.controlledActor.controller,reset=vi.spyOn(h,'reset');displaceCharacter(world,new Vector3(60,.025,0));world.step({});expect(reset).toHaveBeenCalled();expect(world.humanoid!.snapshot().recovery).toBeNull();}finally{world.dispose();}
    const plane={...car,id:'plane',mode:'plane' as const,archetype:'plane' as const};const flight=await fixture({vehicles:[plane]});
    try{const r=flight.humanoid!;r.approach('plane');expect(r.enter('plane')).toBe(true);r.simulation.controlledActor.vehicle!.position.y=-4;flight.step({});expect(r.snapshot().recovery).toMatchObject({status:'blocked',reason:'UNSUPPORTED_RECOVERY_MODE'});}finally{flight.dispose();}
  });

  it('uses the same recovery state during Episode-owned fixed steps',async()=>{
    const world=await fixture();
    try{const r=world.humanoid!,host=humanoidHost(r);world.step({});host.setEpisodeOwned(true);displaceCharacter(world,new Vector3(0,-4,0));host.advance({},1/60,{});
      expect(world.snapshot().humanoid?.recovery).toMatchObject({status:'recovered',subjectInstanceId:'person'});expect(r.snapshot().teleportRevision).toBe(r.simulation.controlledActor.teleportRevision);
      host.setEpisodeOwned(false);
    }finally{world.dispose();}
  });

  it('blocks traversal at an air wall and rejects a forged actionable probe without mounting hints',async()=>{
    const world=await fixture({map:{...map,boundaries:[{id:'edge',shape:'polyline',pointsXZ:[[-5,1],[5,1]],bottomMeters:-1,topMeters:1,thicknessMeters:1}]}});
    try{const r=world.humanoid!,h=r.simulation.controlledActor.controller;world.step({},2);const probe=h.detect(new Vector3(0,0,1));
      expect(probe).toMatchObject({kind:'blocked',reason:'场地空气边界不可翻越或攀爬'});expect(r.environment.isBoundaryCollider(probe!.collider)).toBe(true);
      expect(h.begin({...probe!,kind:'vault'} as Probe)).toBe(false);expect(h.lastResult).not.toContain(' F ');world.step({humanoid:{...emptyInput(),forward:1}},90);expect(h.position.z).toBeLessThan(.3);
    }finally{world.dispose();}
  });
});
