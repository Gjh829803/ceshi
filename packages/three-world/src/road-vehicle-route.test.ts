import {describe,it,expect} from 'vitest';
import {Group,PerspectiveCamera} from 'three';
import {createWorld,humanoid,RoadVehicleRouteController,roadVehicleRouteInput,type RoadVehicleRouteMotion,type Vec3,type EnvironmentDefinition} from './index.js';

const pose=(position:Vec3=[0,0,0],velocity:Vec3=[0,0,0]):RoadVehicleRouteMotion=>({positionWorldMetersXYZ:position,rotationWorldRadiansXYZ:[0,0,0],velocityWorldMetersPerSecondXYZ:velocity});
describe('road route decisions',()=>{
 it('brakes before the endpoint and steers by the body heading',()=>{
  expect(roadVehicleRouteInput(pose([0,0,0],[0,0,8]),{positionWorldMetersXYZ:[0,0,5]}).humanoid).toMatchObject({forward:0,brake:true});
  expect(roadVehicleRouteInput(pose(),{positionWorldMetersXYZ:[10,0,10]}).humanoid!.steer).toBeLessThan(0);
 });
 it('requires measured stop dwell; repeated reads cannot complete it',()=>{
  const c=new RoadVehicleRouteController({positionWorldMetersXYZ:[0,0,0]});
  expect(c.step(pose([0,0,0],[0,0,3]),0).status).toBe('stopping');
  expect(c.step(pose(),1).status).toBe('stopping');
  for(let n=0;n<10;n++)expect(c.step(pose(),1).status).toBe('stopping');
  expect(c.step(pose(),1.5).status).toBe('arrived');
 });
 it('does not count an unobserved gap as a confirmed stop and can pass intermediate points',()=>{
  const c=new RoadVehicleRouteController({positionWorldMetersXYZ:[0,0,0]});
  expect(c.step(pose(),0).status).toBe('stopping');
  expect(c.step(pose(),5).status).toBe('stopping');
  expect(c.step(pose(),5.5).status).toBe('arrived');
  const pass=new RoadVehicleRouteController({positionWorldMetersXYZ:[0,0,0],stopAtTarget:false});
  expect(pass.step(pose([0,0,0],[0,0,3]),0)).toMatchObject({status:'arrived',input:{humanoid:{brake:false}}});
 });
 it('rejects a different floor, stale clocks and sustained lack of progress',()=>{
  const c=new RoadVehicleRouteController({positionWorldMetersXYZ:[0,5,0]});
  expect(c.step(pose(),0).status).toBe('driving');
  expect(c.step(pose(),7)).toMatchObject({status:'failed',errorCode:'ROAD_ROUTE_BLOCKED'});
  const reset=new RoadVehicleRouteController({positionWorldMetersXYZ:[0,0,10]});
  reset.step(pose(),10);expect(reset.step(pose(),0).errorCode).toBe('ROAD_ROUTE_CLOCK_CHANGED');
  expect(()=>new RoadVehicleRouteController({positionWorldMetersXYZ:[0,NaN,0]})).toThrow('ROAD_ROUTE_TARGET_INVALID');
 });
 it('accepts sustained progress at a low requested speed while still detecting a stop',()=>{
  const target={positionWorldMetersXYZ:[0,0,10] as const,maximumSpeedMetersPerSecond:.02};
  const moving=new RoadVehicleRouteController(target),blocked=new RoadVehicleRouteController(target);
  for(let tick=0;tick<=120;tick++) {
   const seconds=tick/10;
   expect(moving.step(pose([0,0,seconds*.02],[0,0,.02]),seconds).status).toBe('driving');
  }
  blocked.step(pose(),0);
  expect(blocked.step(pose(),6.1)).toMatchObject({status:'failed',errorCode:'ROAD_ROUTE_BLOCKED'});
 });
});

for(const family of ['car','motorcycle'] as const)for(const ticks of [1,6])it(`${family}: follows bends and stops using real physics at ${60/ticks} Hz input`,async()=>{
 const spec=humanoid.createRoadVehicleSpec(family);spec.spawn=[0,0,0];spec.yaw=0;
 const map:EnvironmentDefinition={id:'route',name:'Route',description:'',bounds:{min:[-100,-10,-100],max:[100,20,100]},boxes:[{id:'floor',position:[0,-.5,0],size:[200,1,200]}],water:[],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[200,200],color:'#fff',modes:[spec.mode]}],spawns:[{id:'parking',name:'Parking',vehicleId:'vehicle',position:[0,0,0],yaw:0,regionId:'road'}],playerSpawn:[-5,0,0]};
 const world=await createWorld({camera:new PerspectiveCamera(),humanoid:{map,vehicles:[{instanceId:'vehicle',assetId:'custom.vehicle',spec,object:new Group()}],character:{instanceId:'player',object:new Group()}}});
 try{
  world.humanoid!.prepareEpisodeStart({positionWorldMetersXYZ:[0,0,0],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'vehicle',mounted:true}});
  const targets:Vec3[]=[[0,0,15],[12,0,28],[24,0,18],[0,0,0]];
  let seconds=0;
  for(const target of targets){
   const controller=new RoadVehicleRouteController({positionWorldMetersXYZ:target,maximumSpeedMetersPerSecond:4});let arrived=false;
   for(let n=0;n<3600/ticks;n++){
    const snapshot=world.snapshot(),entity=snapshot.entities.find(e=>e.id==='vehicle')!;
    const d=controller.step({positionWorldMetersXYZ:entity.positionWorldMetersXYZ,rotationWorldRadiansXYZ:entity.rotationLocalRadiansXYZ,velocityWorldMetersPerSecondXYZ:entity.motion!.velocityWorldMetersPerSecondXYZ},seconds);
    expect(d.status,JSON.stringify({target,position:entity.positionWorldMetersXYZ,d})).not.toBe('failed');
    if(d.status==='arrived'){expect(d.speedMetersPerSecond).toBeLessThanOrEqual(.25);arrived=true;break;}
    world.step(d.input,ticks);seconds+=ticks/60;
   }
   expect(arrived,JSON.stringify({target,position:world.getEntityState('vehicle').positionWorldMetersXYZ})).toBe(true);
  }
  expect(world.snapshot().errors).toEqual([]);
 }finally{world.dispose();}
},30000);
