import {afterEach,expect,it} from 'vitest';
import * as THREE from 'three';
import {createWorld,type ThreeWorld} from './world';
import type {EnvironmentDefinition} from './humanoid-runtime/environment/types';
import {createRoadVehicleSpec} from './humanoid-runtime/road-vehicle';
import {emptyInput} from './humanoid-runtime/simulation';

const worlds:ThreeWorld[]=[];
const meshes:THREE.Mesh[]=[];
const map:EnvironmentDefinition={id:'shared',name:'Shared',description:'',bounds:{min:[-30,-5,-30],max:[30,20,30]},
  boxes:[{id:'floor',position:[0,-.5,0],size:[60,1,60]}],water:[],regions:[],spawns:[],playerSpawn:[0,.04,0]};
afterEach(()=>{for(const world of worlds.splice(0))world.dispose();for(const mesh of meshes.splice(0)){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}});
async function setup() {
  const world=await createWorld({navigation:false,humanoid:{map,vehicles:[],character:{instanceId:'player',object:new THREE.Group()}}});
  worlds.push(world);return world;
}
function box(x:number,y:number,z:number) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());mesh.position.set(x,y,z);meshes.push(mesh);return mesh;
}
it('drops ordinary dynamic bodies onto the humanoid map with ordinary gravity and shared steps',async()=>{
  const world=await setup(),crate=box(3,5,0);
  world.addEntity({id:'crate',object:crate,role:'obstacle',physics:{kind:'dynamic',shape:'box',massKilograms:2}});
  const before=world.humanoid!.environment.physicsStepSequence;
  world.step({},30);
  expect(world.humanoid!.environment.physicsStepSequence-before).toBe(30);
  expect(world.getEntityState('crate').positionWorldMetersXYZ[1]).toBeCloseTo(5-9.81*.5*.5/2,1);
  world.step({},120);
  expect(world.getEntityState('crate').positionWorldMetersXYZ[1]).toBeCloseTo(.5,1);
  expect(world.snapshot().errors).toEqual([]);
});
it('keeps baseline bodies through reset and removes a dynamic body without removing the humanoid',async()=>{
  const world=await setup(),crate=box(3,5,0);
  world.addEntity({id:'crate',object:crate,role:'obstacle',physics:{kind:'dynamic',shape:'box',massKilograms:2}});
  world.step({},120);await world.reset();
  expect(world.getEntityState('crate').positionWorldMetersXYZ[1]).toBeCloseTo(5,4);
  world.step({},120);expect(world.getEntityState('crate').positionWorldMetersXYZ[1]).toBeCloseTo(.5,1);
  expect((await world.execute({type:'entity.despawn',entityId:'crate'})).status).toBe('applied');
  world.step({moveXRatio:1},60);
  const position=world.getEntityState('player').positionWorldMetersXYZ;
  expect(Math.hypot(position[0],position[2])).toBeGreaterThan(1);
  expect(world.snapshot().errors).toEqual([]);
});
it('queries an ordinary obstacle immediately after registration, mutation and deletion without ticking',async()=>{
  const world=await setup(),wall=box(0,1,3);
  world.addEntity({id:'wall',object:wall,role:'obstacle',physics:{kind:'fixed',shape:'box'}});
  const tick=world.snapshot().simulationTick;
  expect(world.humanoid!.probe([0,1,0],[0,0,1],10)?.entityId).toBe('wall');
  const cameraHit=world.humanoid!.castCameraArm([0,1,0],[0,1,5],.1);
  expect(cameraHit.colliderEntityId).toBe('wall');expect(cameraHit.distanceMeters).toBeLessThan(2.5);
  expect((await world.execute({type:'entity.set-position',entityId:'wall',positionWorldMetersXYZ:[4,1,3]})).status).toBe('applied');
  expect(world.humanoid!.probe([0,1,0],[0,0,1],10)).toBeNull();
  expect(world.humanoid!.probe([4,1,0],[0,0,1],10)?.entityId).toBe('wall');
  expect((await world.execute({type:'entity.despawn',entityId:'wall'})).status).toBe('applied');
  expect(world.humanoid!.probe([4,1,0],[0,0,1],10)).toBeNull();
  expect(world.snapshot().simulationTick).toBe(tick);
});
it('preserves ordinary dynamic pose and velocity when replacing the map',async()=>{
  const world=await setup(),crate=box(3,5,0);
  world.addEntity({id:'crate',object:crate,role:'obstacle',physics:{kind:'dynamic',shape:'box',massKilograms:2}});
  world.step({},20);const before=world.getEntityState('crate');
  world.humanoid!.switchMap({...map,id:'replacement'});
  const after=world.getEntityState('crate');
  expect(after.positionWorldMetersXYZ).toEqual(before.positionWorldMetersXYZ);
  expect(after.motion?.velocityWorldMetersPerSecondXYZ).toEqual(before.motion?.velocityWorldMetersPerSecondXYZ);
  world.step({},120);expect(world.getEntityState('crate').positionWorldMetersXYZ[1]).toBeCloseTo(.5,1);
});
it('rejects map identity conflicts during batch validation and preserves the old world on failed replacement',async()=>{
  const world=await setup(),crate=box(3,5,0);
  expect(()=>world.humanoid!.validateBatch([{kind:'rigid',id:'floor',object:crate,options:{kind:'fixed',shape:'box'}}])).toThrow('HUMANOID_PHYSICS_ID_CONFLICT');
  world.addEntity({id:'crate',object:crate,role:'obstacle',physics:{kind:'dynamic',shape:'box',massKilograms:2}});
  world.step({},20);const before=world.getEntityState('crate'),environment=world.humanoid!.environment;
  expect(()=>world.humanoid!.switchMap({...map,id:'conflict',boxes:[...map.boxes,{id:'crate',position:[10,1,0],size:[1,1,1]}]})).toThrow('HUMANOID_PHYSICS_ID_CONFLICT');
  expect(world.humanoid!.environment).toBe(environment);expect(world.getEntityState('crate')).toEqual(before);
  world.step({},120);expect(world.getEntityState('crate').positionWorldMetersXYZ[1]).toBeCloseTo(.5,1);
});
it('preserves kinematic velocity over the two vehicle substeps in one SDK tick',async()=>{
  const spec=createRoadVehicleSpec('car');spec.id='car';
  const vehicleMap:EnvironmentDefinition={...map,regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[50,50],color:'#fff',modes:['wheeled']}],
    spawns:[{id:'car-spawn',vehicleId:'car',name:'Car',position:[10,0,0],yaw:0,regionId:'road'}]};
  const world=await createWorld({navigation:false,humanoid:{map:vehicleMap,character:{instanceId:'player',object:new THREE.Group()},
    vehicles:[{instanceId:'car',assetId:'custom.car',object:new THREE.Group(),spec}]}});worlds.push(world);
  const platform=box(0,3,5);world.addEntity({id:'platform',object:platform,role:'obstacle',physics:{kind:'kinematic',shape:'box'}});
  world.step({},1);const before=world.humanoid!.environment.physicsStepSequence;
  platform.position.x=.1;world.step({},1);
  expect(world.humanoid!.environment.physicsStepSequence-before).toBe(2);
  expect(world.humanoid!.state('platform')?.velocityMetersPerSecondXYZ[0]).toBeCloseTo(6,3);
});
it('rejects standing into a newly registered low ceiling without a refresh tick',async()=>{
  const world=await setup();world.step({},30);
  world.step({humanoid:{...emptyInput(),actions:{toggleCrouch:true}}},1);
  const ceiling=box(0,1.9,0);world.addEntity({id:'ceiling',object:ceiling,role:'obstacle',physics:{kind:'fixed',shape:'box'}});
  const tick=world.snapshot().simulationTick;
  expect(world.humanoid!.simulation.humanoid.crouchEligibility().eligible).toBe(false);
  expect(world.snapshot().simulationTick).toBe(tick);
});
it('contacts the real vehicle chassis without colliding with its fixed query proxies',async()=>{
  const spec=createRoadVehicleSpec('car');spec.id='car';
  const vehicleMap:EnvironmentDefinition={...map,regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[50,50],color:'#fff',modes:['wheeled']}],
    spawns:[{id:'car-spawn',vehicleId:'car',name:'Car',position:[10,0,0],yaw:0,regionId:'road'}]};
  const world=await createWorld({navigation:false,humanoid:{map:vehicleMap,character:{instanceId:'player',object:new THREE.Group()},
    vehicles:[{instanceId:'car',assetId:'custom.car',object:new THREE.Group(),spec}]}});worlds.push(world);
  const crate=box(10,1,1.8);world.addEntity({id:'crate',object:crate,role:'obstacle',physics:{kind:'dynamic',shape:'box',massKilograms:2}});
  const environment=world.humanoid!.environment,physics=environment.borrowPhysics().world,contacts:number[]=[];
  for(let tick=0;tick<10;tick++){
    world.step({},1);
    physics.forEachCollider(collider=>{if(environment.colliderBindings.owner(collider.handle)==='crate')physics.contactPairsWith(collider,other=>contacts.push(other.collisionGroups()>>>16));});
  }
  expect(contacts).toContain(2);expect(contacts).not.toContain(4);expect(contacts).not.toContain(16);
});
