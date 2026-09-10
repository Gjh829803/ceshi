import {beforeAll,expect,it} from 'vitest';
import {Group,PerspectiveCamera,Vector3} from 'three';
import {createWorld} from '../index';
import {EnvironmentQueries,initEnvironmentQueries} from './environment/queries';
import {createVehicle,emptyInput,stepVehicle} from './simulation';
import {vehicleDriveTelemetry} from './vehicle-dynamics';
import {SPECS} from '../../../../shared/preset-content/config';
import type {EnvironmentDefinition} from './environment/types';
import {paddleRiderBody} from './kayak';

const added=['atv','bus','tank','unicycle','sled','ski','kayak','canoe','raft','jetski','observation-sub'];
const map:EnvironmentDefinition={id:'native-vehicles',name:'Native vehicles',description:'',bounds:{min:[-500,-50,-500],max:[500,100,500]},boxes:[{id:'floor',position:[0,-21,0],size:[1000,2,1000]}],water:[{id:'water',min:[-500,-20,-500],max:[500,0,500],surface:0}],regions:[],spawns:[],playerSpawn:[20,0,20]};
beforeAll(initEnvironmentQueries);
function fixture(id:string,wall=false){
  const source=SPECS.find(v=>v.id===id)!;const aquatic=!!source.bodyPhysics?.water;
  const q=new EnvironmentQueries({...map,water:aquatic?map.water:[],boxes:[{...map.boxes[0]!,position:[0,aquatic?-21:-1,0]},...(wall?[{id:'wall',position:[0,10,12] as const,size:[100,60,.2] as const}]:[])]});
  const v=createVehicle({...source,spawn:[0,.05,0],yaw:0});let tick=0;
  const run=(n:number,input=emptyInput())=>{for(let i=0;i<n;i++){stepVehicle(v,input,1/60,++tick/60,q);q.stepPhysics(1/60);}};
  return {q,v,run};
}
it.each(added)('%s submits intent to the one physics clock, drives and exposes immutable telemetry',id=>{
  const {q,v,run}=fixture(id);try{
    expect(Number(!!v.wheelPhysics)+Number(!!v.bodyPhysics)).toBe(1);
    const p=v.position.clone();stepVehicle(v,{...emptyInput(),forward:1},1/60,1/60,q);expect(v.position).toEqual(p);
    run(180);const settled=v.position.clone();run(240,{...emptyInput(),forward:1});
    expect(v.position.distanceTo(settled)).toBeGreaterThan(1);
    expect([...v.position.toArray(),...v.rotation.toArray(),v.speed]).toSatisfy(values=>values.every(Number.isFinite));
    const state=JSON.stringify(v),sample=vehicleDriveTelemetry(v)!;
    expect(sample.speed).toBe(v.speed);for(let n=0;n<10;n++)expect(vehicleDriveTelemetry(v)).toEqual(sample);expect(JSON.stringify(v)).toBe(state);
    if(['atv','bus','tank','jetski','observation-sub'].includes(id)){expect(sample.kind).toBe('engine');expect(sample.rpm).toBeGreaterThan(850);expect(sample.effort).toBeGreaterThan(.9);}
    else {expect(sample.kind).not.toBe('engine');expect(sample.rpm).toBe(0);}
  }finally{q.dispose();}
});
it.each(added)('%s is stopped by the shared rigid body collision solver',id=>{
  const {q,v,run}=fixture(id,true);try{
    run(120);v.velocity.set(0,0,15);run(300,{...emptyInput(),forward:1});
    expect(v.position.z+v.spec.envelope.halfExtents[2]*.5).toBeLessThan(12.2);
    expect(v.position.y).toBeGreaterThan(-22);
  }finally{q.dispose();}
});
it('native bodies exchange collision impulses, retain one owner, and release/reset through the runtime',async()=>{
  const spec=SPECS.find(v=>v.id==='unicycle')!;
  const world=await createWorld({assetDefinitions:{},camera:new PerspectiveCamera(),humanoid:{map:{...map,boxes:[{...map.boxes[0]!,position:[0,-1,0]}],water:[],spawns:[{id:'a',name:'A',vehicleId:'a',position:[0,.05,0],yaw:0,regionId:'road'},{id:'b',name:'B',vehicleId:'b',position:[0,.05,2],yaw:0,regionId:'road'}],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[100,100],color:'#fff',modes:['character','bike']}]},vehicles:['a','b'].map(instanceId=>({instanceId,assetId:'vehicle.unicycle',spec,object:new Group()})),character:{instanceId:'person',object:new Group()}}});
  try{
    world.step({},60);const [a,b]=world.humanoid!.simulation.vehicles;const before=b!.position.clone();a!.velocity.z=6;world.step({},30);
    expect(b!.position.distanceTo(before)).toBeGreaterThan(.05);
    const snap=world.humanoid!.snapshot();expect(snap.vehicleDynamics.every(v=>v.physicsOwner==='rigid-body')).toBe(true);
    const state=JSON.stringify(world.humanoid!.simulation.vehicles);world.humanoid!.snapshot();world.step({},0);expect(JSON.stringify(world.humanoid!.simulation.vehicles)).toBe(state);
    const token=a!.bodyPhysics;await world.reset();expect(world.humanoid!.simulation.vehicles[0]!.bodyPhysics).not.toBe(token);expect(world.humanoid!.simulation.vehicles[0]!.bodyPhysics!.elapsed).toBe(0);
    world.step({},30);expect(world.humanoid!.snapshot().vehicleDynamics[0]!.drive!.kind).toBe('pedal');
  }finally{world.dispose();}
});
it('rejects two physics owners and invalid force profiles before creating a vehicle',()=>{
  const car=SPECS.find(v=>v.id==='atv')!,uni=SPECS.find(v=>v.id==='unicycle')!;
  expect(()=>createVehicle({...car,bodyPhysics:uni.bodyPhysics!})).toThrow('VEHICLE_PHYSICS_OWNER_CONFLICT');
  expect(()=>createVehicle({...uni,bodyPhysics:{...uni.bodyPhysics!,mass:NaN}})).toThrow('VEHICLE_BODY_PHYSICS_CONFIG_INVALID');
});
it('keeps the tracked hull stable across adjoining ground slabs without changing the terrain solver',()=>{
  const q=new EnvironmentQueries({...map,water:[],boxes:[{id:'floor',position:[0,-1,0],size:[400,2,400]}]}),v=createVehicle({...SPECS.find(s=>s.id==='tank')!,spawn:[0,.05,0],yaw:0});
  try{for(let n=0;n<720;n++){stepVehicle(v,{...emptyInput(),forward:1},1/60,n/60,q);q.stepPhysics(1/60);expect(v.position.y).toBeLessThan(.08);expect(Math.abs(v.roll)).toBeLessThan(.02);expect(Math.abs(v.yaw)).toBeLessThan(.02);}expect(v.position.z).toBeGreaterThan(80);}finally{q.dispose();}
});

async function bridgeFixture(id:string,bottom=1,mounted=true){
 const spec=SPECS.find(s=>s.id===id)!,pool:EnvironmentDefinition={...map,
  boxes:[...map.boxes,{id:'bridge',position:[0,bottom+1,8],size:[80,2,6]}],
  regions:[{id:'pool',name:'Pool',description:'',center:[0,0,0],size:[200,200],color:'#aaa',modes:['kayak']}],
  spawns:[{id:'boat',name:'Boat',vehicleId:'boat',position:[0,.1,0],yaw:0,regionId:'pool'}]};
 const world=await createWorld({assetDefinitions:{},camera:new PerspectiveCamera(),humanoid:{map:pool,vehicles:[{instanceId:'boat',assetId:`vehicle.${id}`,spec,object:new Group()}],character:{instanceId:'person',object:new Group()}}});
 if(mounted)world.humanoid!.prepareEpisodeStart({positionWorldMetersXYZ:[0,.1,0],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'boat',mounted:true}});
 return world;
}
it.each(['canoe','raft','kayak'])('%s stops its seated rider below a low bridge and keeps every camera mode outside',async id=>{
 const world=await bridgeFixture(id);try{
  const r=world.humanoid!,v=r.simulation.vehicles[0]!,q=r.environment;
  world.step({},120);
  for(let n=0;n<600;n++){
   world.step({humanoid:{...emptyInput(),forward:1}},1);
   expect(q.bodyOverlap({position:v.position,rotation:v.rotation,body:paddleRiderBody(v.spec.seat)},{excludedActorIds:new Set(['boat']),excludedColliderHandles:new Set([r.simulation.humanoid.capsule.handle])})).toBe(false);
  }
  expect(v.bodyPhysics!.riderMounted).toBe(true);expect(v.position.z).toBeGreaterThan(3);expect(v.position.z).toBeLessThan(5.5);
  for(const mode of [0,1,2] as const){r.setCameraMode(mode);world.step({humanoid:{...emptyInput(),forward:1}},60);
   const eye=world.camera.position.toArray();expect(q.cameraProbe(eye,eye,.1,q.cameraFilter(new Set(['boat']))).startedOverlapping).not.toBe(true);
  }
  const token=v.bodyPhysics;expect(r.exit()).toBe(true);world.step({},1);expect(v.bodyPhysics).toBe(token);expect(v.bodyPhysics!.riderMounted).toBe(false);
  v.velocity.z=8;world.step({},180);expect(v.position.z).toBeGreaterThan(6);
  await world.reset();world.step({},1);expect(r.simulation.vehicles[0]!.bodyPhysics).not.toBe(token);expect(r.simulation.vehicles[0]!.bodyPhysics!.riderMounted).toBe(false);
 }finally{world.dispose();}
});
it.each(['canoe','raft','kayak'])('%s clears a tall bridge and an empty hull clears the low bridge',async id=>{
 for(const mounted of [false,true]){
  const world=await bridgeFixture(id,mounted?2.3:1,mounted);try{
   const v=world.humanoid!.simulation.vehicles[0]!;world.step({},120);
   if(!mounted)v.position.z=4;
   v.velocity.z=8;
   world.step(mounted?{humanoid:{...emptyInput(),forward:1}}:{},240);
   expect(v.position.z).toBeGreaterThan(6);expect(v.bodyPhysics!.riderMounted).toBe(mounted);
  }finally{world.dispose();}
 }
});
it('rejects keyboard boarding and mounted Episode starts under an occupied head space',async()=>{
 const world=await bridgeFixture('canoe',1,false);try{
  const r=world.humanoid!,s=r.simulation,v=s.vehicles[0]!;world.step({},120);
  v.position.z=8;s.player.position.copy(v.position).add(new Vector3(2,0,0));
  expect(s.interact()).toBe(false);expect(s.failureCode).toBe('VEHICLE_MOUNT_SPACE_BLOCKED');
  expect(r.probeEpisodeStart({positionWorldMetersXYZ:v.position.toArray(),facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'boat',mounted:true}}).isValid).toBe(false);
 }finally{world.dispose();}
});
