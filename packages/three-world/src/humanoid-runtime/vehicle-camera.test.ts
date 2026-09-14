import {buildAtvModel} from '@worldkit/preset-content/atv-model';
import {buildBusModel} from '@worldkit/preset-content/bus-model';
import {createDragonTrainingMap} from '@worldkit/preset-content/environment/dragon-training';
import {createFlyingCreatureSpec} from './motion-families/flying-creature/controller';
import {describe,it,expect,beforeAll,afterEach,vi} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import {Box3,BoxGeometry,CapsuleGeometry,CylinderGeometry,SphereGeometry,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,PerspectiveCamera,Quaternion,Vector3} from 'three';
import * as geometryQueries from '../geometry';
import {createWorld} from '../world';
import type {VehicleSpec} from './config';
import type {EnvironmentDefinition} from './environment/types';
import {initEnvironmentQueries} from './environment/queries';
import {VehicleCameraQueries} from './vehicle-camera-queries';
import {HumanoidCameraGeometry} from './camera-host';
import {EnvironmentQueries} from './environment/queries';
import {Simulation} from './simulation';
import type {CameraSubjectFacts} from '../camera/subject';
import * as cameraKernel from './camera-queries';
import {markCameraVisualEffect} from './camera-visual-effects';
const queries=new Set<VehicleCameraQueries>();
function trackQuery(vehicles:ConstructorParameters<typeof VehicleCameraQueries>[0]){const query=new VehicleCameraQueries(vehicles);queries.add(query);return query;}
afterEach(()=>{for(const query of queries)query.dispose();queries.clear();});

const spec:VehicleSpec={id:'rover',name:'Rover',en:'ROVER',mode:'wheeled',kernel:'K03',color:'#fff',spawn:[0,0,0],yaw:0,speed:12,accel:5,grip:11,steer:1.1,radius:1.65,seat:[0,.91,.1],hint:'',archetype:'rover',envelope:{kind:'box',halfExtents:[1.35,1.15,2.15],offset:[0,1.15,0]}};
const map:EnvironmentDefinition={id:'camera-rover',name:'Camera rover',description:'',bounds:{min:[-50,-5,-50],max:[50,30,50]},boxes:[{id:'ground',position:[0,-.5,0],size:[100,1,100]}],water:[],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[100,100],color:'#aaa',modes:['wheeled']}],spawns:[{id:'rover-start',name:'Rover',vehicleId:'rover',position:[0,0,0],yaw:0,regionId:'road'}],playerSpawn:[2.7,.04,0]};
function block(root:Group,size:[number,number,number],position:[number,number,number]):Mesh<BoxGeometry,MeshStandardMaterial|MeshStandardMaterial[]>{
 const mesh=new Mesh(new BoxGeometry(...size),new MeshStandardMaterial());mesh.position.set(...position);root.add(mesh);return mesh;
}
function openCabin(){
 const root=new Group();block(root,[2,.25,3.8],[0,.62,0]);
 for(const x of [-.93,.93])for(const z of [-.65,.75])block(root,[.1,.95,.1],[x,1.7,z]);
 for(const x of [-.93,.93])block(root,[.1,.1,1.5],[x,2.18,0]);
 return root;
}
async function fixture(object=openCabin()){
 const parkedSpec={...spec};
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'rover',assetId:'rover',spec:parkedSpec,object}]}});

 return world;
}
function approachAndOrbit(world:Awaited<ReturnType<typeof fixture>>){
 world.step({},5);world.step({moveXRatio:1},100);
 const contact=world.getEntityState('player'),vehicleX=world.humanoid!.simulation.vehicles[0]!.position.x;world.step({},30);
 world.useAuthoredCamera();world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',input:{orbitRateRadiansPerSecond:1.2},activation:'immediate',binding:{targetEntityId:'player'},views:{'third-person':{kind:'third-person',overrides:{position:{distanceMeters:11,anchor:{kind:'subject-local',positionMetersXYZ:[0,1.7,0]},armHalfLifeSeconds:0},orientation:{initialPitchRadians:0,recenter:{enabled:false}},constraints:{visibility:'require-line-of-sight',collision:{radiusMeters:.25}}}}}}});
 world.step({cameraYawRatio:(Math.PI*1.5-world.inspectCamera().intent!.yawRadians)/(1.2*3)},180);world.step({},180);
 return {...contact,vehicleX};
}
describe('vehicle camera geometry',()=>{
 beforeAll(initEnvironmentQueries);
 it('keeps the third-person view through an open cabin while the envelope still stops walking',async()=>{
  const world=await fixture();try{
   const contact=approachAndOrbit(world);
   expect(contact.positionWorldMetersXYZ[0]-contact.vehicleX).toBeGreaterThan(1.60);expect(contact.positionWorldMetersXYZ[0]-contact.vehicleX).toBeLessThan(1.75);
   expect(contact.motion?.collisionEntityIds).toContain('rover');
   expect(world.snapshot().camera.actualArmDistanceMeters).toBeGreaterThan(10.9);
   world.step({},180);expect(world.snapshot().camera.actualArmDistanceMeters).toBeGreaterThan(10.9);
  }finally{world.dispose();}
 });
 it('still retracts against a solid vehicle panel across the same viewing path',async()=>{
  const object=new Group();block(object,[.2,4,5],[0,2,0]);const world=await fixture(object);try{
   approachAndOrbit(world);const camera=world.snapshot().camera;
   expect(camera.actualArmDistanceMeters).toBeGreaterThan(.5);
   expect(camera.actualArmDistanceMeters).toBeLessThan(1.7);
   expect(camera.desiredArmDistanceMeters).toBeCloseTo(11,5);
   expect(camera.positionWorldMetersXYZ[0]-world.humanoid!.simulation.vehicles[0]!.position.x).toBeGreaterThan(.34);
  }finally{world.dispose();}
 });

 it.each([false,true])('reports a lens that starts inside a closed vehicle part (material array: %s)',array=>{
  const root=new Group(),mesh=block(root,[2,2,2],[0,1,0]);if(array)mesh.material=Array.from({length:6},()=>new MeshStandardMaterial());const query=trackQuery([{instanceId:'body',object:root}]);query.sync();
  const hit=query.probe([0,1,0],[0,1,0],.2);
  expect(hit.startedOverlapping).toBe(true);expect(hit.penetrationDepthMeters).toBeGreaterThan(.9);
 });
 it('keeps glass solid for the lens but transparent to the visibility test, including material arrays',()=>{
  const root=new Group(),glass=block(root,[.1,3,4],[0,1.5,0]);
  glass.material=Array.from({length:6},()=>new MeshStandardMaterial({transparent:true,opacity:.25}));
  const query=trackQuery([{instanceId:'glass',object:root}]);query.sync();
  expect(query.visibleBetween([2,1,0],[-2,1,0])).toBe(true);
  expect(query.probe([2,1,0],[-2,1,0],0).distanceMeters).toBe(4);
  expect(query.probe([2,1,0],[-2,1,0],.2).distanceMeters).toBeCloseTo(1.75,4);
  glass.material[0]!.transparent=false;glass.material[0]!.opacity=1;query.sync();
  expect(query.visibleBetween([2,1,0],[-2,1,0])).toBe(false);
  expect(query.probe([2,1,0],[-2,1,0],0).distanceMeters).toBeCloseTo(1.95,5);
  glass.material[0]!.visible=false;query.sync();expect(query.visibleBetween([2,1,0],[-2,1,0])).toBe(true);
 });
 it('returns world-space distances and normals under rotated, scaled parents',()=>{
  const root=new Group(),parent=new Group();parent.position.set(10,0,20);parent.rotation.y=Math.PI/2;parent.scale.set(2,1,1);parent.add(root);
  block(root,[.2,3,4],[0,1.5,0]);const query=trackQuery([{instanceId:'panel',object:root}]);query.sync();
  const hit=query.probe([10,1,18],[10,1,22],.1);
  expect(hit.distanceMeters).toBeCloseTo(1.7,4);expect(hit.normalWorldXYZ![2]).toBeLessThan(-.99);
  parent.position.z=30;query.sync();expect(query.probe([10,1,18],[10,1,22],.1).colliderEntityId).toBeUndefined();
 });
 it('refreshes broad-phase bounds for distant overhangs, edited geometry and manual parent matrices',()=>{
  const parent=new Group(),root=new Group();parent.add(root);parent.matrixAutoUpdate=false;parent.matrix.makeTranslation(20,0,0);
  const panel=block(root,[.2,3,4],[-20,1.5,0]),query=trackQuery([{instanceId:'overhang',object:root}]);query.sync();
  expect(query.probe([2,1,0],[-2,1,0],.1).distanceMeters).toBeCloseTo(1.8,4);
  expect(query.visibleBetween([2,1,0],[-2,1,0])).toBe(false);
  expect(query.visibleBetween([2,1,0],[-2,1,0],'overhang')).toBe(true);
  parent.matrix.makeTranslation(40,0,0);query.sync();
  expect(query.probe([2,1,0],[-2,1,0],.1).colliderEntityId).toBeUndefined();
  expect(query.visibleBetween([2,1,0],[-2,1,0])).toBe(true);
  panel.geometry.translate(-20,0,0);query.sync();
  expect(query.probe([2,1,0],[-2,1,0],.1).distanceMeters).toBeCloseTo(1.8,4);
  expect(query.probe([0,1,0],[0,1,0],.1).startedOverlapping).toBe(true);
 });
 it.each([['sphere',()=>new SphereGeometry(1,32,16)],['cylinder',()=>new CylinderGeometry(1,1,2,32)],['capsule',()=>new CapsuleGeometry(1,2,8,16)]] as const)('detects an interior lens despite a primitive numerical seam (%s)',(_name,make)=>{
  const geometry=make();
  const root=new Group();root.add(new Mesh(geometry,new MeshStandardMaterial({transparent:true,opacity:.25})));
  const query=trackQuery([{instanceId:'solid',object:root}]);query.sync();
  expect(query.probe([0,0,0],[0,0,0],.2).startedOverlapping).toBe(true);
 });
 it('does not recreate native triangle meshes for repeated obstruction and visibility queries',()=>{
  const root=new Group(),mesh=new Mesh(new BoxGeometry(.2,4,5,20,20,20),new MeshStandardMaterial());root.add(mesh);
  const build=vi.spyOn(RAPIER.TriMesh.prototype,'intoRaw');
  try{
   const query=trackQuery([{instanceId:'detailed-panel',object:root}]);query.sync();
   query.probe([2,0,0],[-2,0,0],.2);query.visibleBetween([2,0,0],[-2,0,0]);const built=build.mock.calls.length;
   const oldFree=build.mock.results.map(result=>vi.spyOn(result.value as ReturnType<RAPIER.TriMesh['intoRaw']>,'free'));
   expect(built).toBeGreaterThan(0);
   for(let n=0;n<5;n++){query.sync();query.probe([2,0,0],[-2,0,0],.2);query.visibleBetween([2,0,0],[-2,0,0]);}
   expect(build.mock.calls.length).toBe(built);
   mesh.geometry.translate(0,.1,0);query.sync();expect(build.mock.calls.length).toBeGreaterThan(built);
   for(const free of oldFree){expect(free).toHaveBeenCalledTimes(1);free.mockRestore();}
   const currentFree=build.mock.results.slice(built).map(result=>vi.spyOn(result.value as ReturnType<RAPIER.TriMesh['intoRaw']>,'free'));
   query.dispose();query.dispose();for(const free of currentFree){expect(free).toHaveBeenCalledTimes(1);free.mockRestore();}
  }finally{build.mockRestore();}
 });
 it.each([['ATV',buildAtvModel],['Bus',()=>buildBusModel().root]] as const)('keeps real %s instanced parts solid through deferred affine sampling',(_name,build)=>{
  const root=build(),query=trackQuery([{instanceId:'model',object:root}]);query.sync();
  const batch=geometryQueries.collisionMeshes(root).find(mesh=>(mesh as InstancedMesh).isInstancedMesh) as InstancedMesh;
  expect(batch).toBeDefined();
  // Isolate the actual instanced part so overlapping fenders cannot satisfy the hit.
  for(const mesh of geometryQueries.collisionMeshes(root))if(mesh!==batch)mesh.visible=false;
  root.position.set(10,2,0);root.scale.set(1.1,.9,1.2);root.rotation.y=.25;query.sync();
  const instance=new Matrix4();batch.getMatrixAt(0,instance);const point=new Vector3().applyMatrix4(instance).applyMatrix4(batch.matrixWorld).toArray();
  expect(query.probe(point,point,.001)).toMatchObject({colliderEntityId:'model',startedOverlapping:true});
  const materials=Array.isArray(batch.material)?batch.material:[batch.material];materials.forEach(material=>{material.visible=false;});
  expect(query.probe(point,point,.001).startedOverlapping).not.toBe(true);
 });
 it.each([0,20])('samples a directly moved native proxy before stepping (x=%s)',x=>{
  const q=new EnvironmentQueries(map),sim=new Simulation(q,[]),root=new Group();block(root,[.2,3,4],[100,1,0]);
  q.syncActorBodies([{id:'proxy',actorId:'vehicle',position:new Vector3(x===0?20:0,0,0),rotation:new Quaternion(),body:spec.envelope}]);q.borrowPhysics().world.updateSceneQueries();
  const host=new HumanoidCameraGeometry([{instanceId:'vehicle',object:root}]),subject={id:'observer'} as CameraSubjectFacts;
  try{
   host.bind(q,sim,subject);root.rotation.y=.1;
   q.borrowPhysics().world.forEachCollider(c=>{if(q.colliderId(c.handle)==='vehicle')c.setTranslation({x,y:1.15,z:0});});
   const sequence=q.physicsStepSequence;
   expect(q.cameraFallbackBounds().get('vehicle')!.getCenter(new Vector3()).x).toBeCloseTo(x,5);
   expect(host.bind(q,sim,subject).probe([2,1,0],[-2,1,0],.1).colliderEntityId).toBeUndefined();
   expect(q.physicsStepSequence).toBe(sequence);
  }finally{host.dispose();sim.dispose();q.dispose();}
 });
 it('reads detached fallback bounds from native box and capsule poses without stepping',()=>{
  const q=new EnvironmentQueries(map);
  try{
   q.syncActorBodies([{id:'box',actorId:'vehicle',position:new Vector3(10,2,0),rotation:new Quaternion(),body:{kind:'box',halfExtents:[1,2,3],offset:[0,0,0]}},
    {id:'capsule',actorId:'vehicle',position:new Vector3(-10,2,0),rotation:new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2),body:{kind:'capsule',radius:.5,height:4,offset:[0,0,0]}}]);
   const initial=q.cameraFallbackBounds().get('vehicle')!;
   expect(initial.min.x).toBeCloseTo(-12,4);expect(initial.max.x).toBeCloseTo(11,4);
   const tick=q.physicsStepSequence;
   q.borrowPhysics().world.forEachCollider(c=>{if(q.colliderId(c.handle)==='vehicle'&&c.translation().x>0)c.setTranslation({x:30,y:2,z:0});});
   initial.makeEmpty();const changed=q.cameraFallbackBounds().get('vehicle')!;
   expect(changed.min.x).toBeCloseTo(-12,4);expect(changed.max.x).toBeCloseTo(31,4);expect(q.physicsStepSequence).toBe(tick);
  }finally{q.dispose();}
 });
 it('refreshes expanded source and instance bounds without trusting geometry boundingBox',()=>{
  const root=new Group(),geometry=new BoxGeometry(.2,3,4),mesh=new Mesh(geometry,new MeshStandardMaterial());root.position.x=20;root.add(mesh);
  const query=trackQuery([{instanceId:'source',object:root}]);query.sync();
  geometry.boundingBox=new Box3(new Vector3(100,100,100),new Vector3(101,101,101));geometry.translate(-20,0,0);query.sync();
  expect(query.probe([2,0,0],[-2,0,0],.1).colliderEntityId).toBe('source');
  const instances=new InstancedMesh(new BoxGeometry(.2,3,4),new MeshStandardMaterial(),2),group=new Group();group.add(instances);
  instances.setMatrixAt(0,new Matrix4().makeTranslation(20,0,0));instances.setMatrixAt(1,new Matrix4().makeTranslation(40,0,0));instances.instanceMatrix.needsUpdate=true;
  const instanced=trackQuery([{instanceId:'instances',object:group}]);instanced.sync();expect(instanced.visibleBetween([2,0,0],[-2,0,0])).toBe(true);
  instances.setMatrixAt(1,new Matrix4());instances.instanceMatrix.needsUpdate=true;instanced.sync();
  expect(instanced.probe([2,0,0],[-2,0,0],.1).colliderEntityId).toBe('instances');
 });
 it.each(['vertices','instances','groups','morph'] as const)('keeps the published %s source until the next sync',change=>{
  const root=new Group(),geometry=new BoxGeometry(.2,3,4),material=new MeshStandardMaterial();
  const mesh=change==='instances'?new InstancedMesh(geometry,material,1):new Mesh(geometry,change==='groups'?[material]:material);
  if(mesh instanceof InstancedMesh)mesh.setMatrixAt(0,new Matrix4());
  if(change==='groups')geometry.groups.forEach(group=>{group.materialIndex=0;});
  if(change==='morph')mesh.morphTargetInfluences=[0];
  root.add(mesh);const query=trackQuery([{instanceId:'published',object:root}]);query.sync();
  mesh.scale.x=2;query.sync();
  if(change==='vertices')geometry.translate(10,0,0);
  if(mesh instanceof InstancedMesh){mesh.setMatrixAt(0,new Matrix4().makeTranslation(10,0,0));mesh.instanceMatrix.needsUpdate=true;}
  if(change==='groups')geometry.clearGroups();
  if(change==='morph')mesh.morphTargetInfluences![0]=1;
  expect(query.probe([2,0,0],[-2,0,0],.1).colliderEntityId).toBe('published');
  query.sync();expect(query.probe([2,0,0],[-2,0,0],.1).colliderEntityId).toBeUndefined();
 });
 it('keeps reused quantized shapes inside fresh broad-phase bounds',()=>{
  const root=new Group(),mesh=block(root,[2e6,2,2],[0,0,0]);mesh.scale.set(.000100004,.001,.001);
  const query=trackQuery([{instanceId:'quantized',object:root}]);query.sync();
  mesh.scale.x=.000099996;query.sync();
  expect(query.visibleBetween([100.002,-.01,0],[100.002,.01,0])).toBe(false);
 });
 it('does not let deferred parent-mesh extraction overwrite descendant matrices',()=>{
  const root=new Group(),parent=block(root,[.2,3,4],[0,0,0]),child=new Mesh(new BoxGeometry(.2,3,4),new MeshStandardMaterial());child.position.z=4;parent.add(child);
  const query=trackQuery([{instanceId:'subtree',object:root}]);query.sync();
  root.position.x=10;parent.scale.x=2;query.sync();
  root.position.x=100;root.updateWorldMatrix(true,true);
  const objects=[root,parent,child],before=objects.map(o=>({matrix:o.matrix.clone(),world:o.matrixWorld.clone(),dirty:o.matrixWorldNeedsUpdate,auto:o.matrixWorldAutoUpdate}));
  expect(query.probe([12,0,0],[8,0,0],.1).colliderEntityId).toBe('subtree');
  objects.forEach((o,i)=>{expect(o.matrix.equals(before[i]!.matrix)).toBe(true);expect(o.matrixWorld.equals(before[i]!.world)).toBe(true);expect(o.matrixWorldNeedsUpdate).toBe(before[i]!.dirty);expect(o.matrixWorldAutoUpdate).toBe(before[i]!.auto);});
 });
 it('prepares the published affine pose and restores later visual matrix edits',()=>{
  const root=new Group(),mesh=block(root,[.2,3,4],[0,0,0]),query=trackQuery([{instanceId:'sample',object:root}]);query.sync();
  root.position.x=10;root.scale.x=2;root.rotation.y=.2;query.sync();
  root.position.x=100;root.updateWorldMatrix(true,true);const later=mesh.matrixWorld.clone(),auto=mesh.matrixWorldAutoUpdate;
  expect(query.probe([12,0,0],[8,0,0],.1).colliderEntityId).toBe('sample');
  expect(mesh.matrixWorld.equals(later)).toBe(true);expect(mesh.matrixWorldAutoUpdate).toBe(auto);
  query.sync();expect(query.probe([12,0,0],[8,0,0],.1).colliderEntityId).toBeUndefined();
 });
 it('defers unchanged-source pose preparation until a vehicle is a query candidate',()=>{
  const near=new Group(),far=new Group();block(near,[.2,3,4],[0,0,0]);block(far,[.2,3,4],[0,0,0]);far.position.x=100;
  const query=trackQuery([{instanceId:'near',object:near},{instanceId:'far',object:far}]);query.sync();
  near.rotation.y=.1;far.rotation.y=.1;
  const poses=vi.spyOn(geometryQueries,'poseFromWorldMatrix');
  try{
   query.sync();expect(poses).not.toHaveBeenCalled();
   expect(query.probe([2,0,0],[-2,0,0],.1).colliderEntityId).toBe('near');
   expect(poses).toHaveBeenCalledTimes(1);
   expect(query.visibleBetween([102,0,0],[98,0,0])).toBe(false);
   expect(poses).toHaveBeenCalledTimes(2);
  }finally{poses.mockRestore();}
 });
 it.each([false,true])('prepares visual or fallback candidates and retains whole-vehicle failure (invalid=%s)',invalid=>{
  const q=new EnvironmentQueries(map),sim=new Simulation(q,[]),root=new Group();
  block(root,[.2,3,4],[20,1,0]);const remote=block(root,[1,1,1],[100,1,0]);
  q.syncActorBodies([{id:'proxy',actorId:'vehicle',position:new Vector3(),rotation:new Quaternion(),body:spec.envelope}]);q.borrowPhysics().world.updateSceneQueries();
  const host=new HumanoidCameraGeometry([{instanceId:'vehicle',object:root}]),subject={id:'observer'} as CameraSubjectFacts;
  try{
   host.bind(q,sim,subject);root.rotation.y=.1;if(invalid)remote.scale.setScalar(0);
   const binding=host.bind(q,sim,subject),raw=vi.spyOn(cameraKernel,'probeHumanoidCamera');
   try{
    const hit=binding.probe([2,1,0],[-2,1,0],.1);
    expect(raw).toHaveBeenCalledTimes(1);
    if(invalid){expect(hit.colliderEntityId).toBe('vehicle');expect(hit.distanceMeters).toBeLessThan(.7);}
    else expect(hit.colliderEntityId).toBeUndefined();
   }finally{raw.mockRestore();}
   if(invalid){remote.scale.setScalar(1);root.rotation.y=.2;expect(host.bind(q,sim,subject).probe([2,1,0],[-2,1,0],.1).colliderEntityId).toBeUndefined();}
  }finally{host.dispose();sim.dispose();q.dispose();}
 });
 it('prepares a later vehicle in the same binding before filtering its coarse collider',()=>{
  const q=new EnvironmentQueries(map),sim=new Simulation(q,[]),first=new Group(),second=new Group();
  block(first,[.2,3,4],[0,1,0]);block(second,[.2,3,4],[0,1,0]);second.position.z=10;
  q.syncActorBodies([first,second].map((root,i)=>({id:`proxy-${i}`,actorId:`vehicle-${i}`,position:root.position.clone(),rotation:new Quaternion(),body:spec.envelope})));q.borrowPhysics().world.updateSceneQueries();
  const host=new HumanoidCameraGeometry([first,second].map((object,i)=>({instanceId:`vehicle-${i}`,object}))),subject={id:'observer'} as CameraSubjectFacts;
  try{
   host.bind(q,sim,subject);first.rotation.y=.1;second.rotation.y=.1;const binding=host.bind(q,sim,subject),filters=vi.spyOn(q,'cameraFilter');
   const a=binding.probe([2,1,0],[-2,1,0],.1),b=binding.probe([2,1,10],[-2,1,10],.1);
   expect(a.colliderEntityId).toBe('vehicle-0');expect(a.distanceMeters).toBeGreaterThan(1.7);
   expect(b.colliderEntityId).toBe('vehicle-1');expect(b.distanceMeters).toBeGreaterThan(1.7);
   expect(filters).toHaveBeenCalledTimes(2);binding.probe([2,1,10],[-2,1,10],.1);expect(filters).toHaveBeenCalledTimes(2);filters.mockRestore();
  }finally{host.dispose();sim.dispose();q.dispose();}
 });
 it('checks shared geometry once per sample and observes later same-tick edits on every instance',()=>{
  const geometry=new BoxGeometry(.2,3,4),material=new MeshStandardMaterial(),left=new Mesh(geometry,material),right=new Mesh(geometry,material);
  const root=new Group();right.position.z=10;root.add(left,right);
  const query=trackQuery([{instanceId:'shared-panels',object:root}]);query.sync();
  const attribute=vi.spyOn(geometry,'getAttribute');
  try{
   query.sync();
   expect(attribute.mock.calls.filter(([name])=>name==='position')).toHaveLength(1);
   expect(query.probe([2,0,0],[-2,0,0],.1).distanceMeters).toBeCloseTo(1.8,4);
   expect(query.probe([2,0,10],[-2,0,10],.1).distanceMeters).toBeCloseTo(1.8,4);
   geometry.translate(3,0,0);query.sync();
   expect(query.probe([2,0,0],[-2,0,0],.1).colliderEntityId).toBeUndefined();
   expect(query.probe([2,0,10],[-2,0,10],.1).colliderEntityId).toBeUndefined();
   geometry.translate(-3,0,0);right.position.z=20;query.sync();
   expect(query.probe([2,0,0],[-2,0,0],.1).distanceMeters).toBeCloseTo(1.8,4);
   expect(query.probe([2,0,10],[-2,0,10],.1).colliderEntityId).toBeUndefined();
   expect(query.probe([2,0,20],[-2,0,20],.1).distanceMeters).toBeCloseTo(1.8,4);
   root.remove(left);query.sync();
   expect(query.probe([2,0,0],[-2,0,0],.1).colliderEntityId).toBeUndefined();
   expect(query.probe([2,0,20],[-2,0,20],.1).distanceMeters).toBeCloseTo(1.8,4);
  }finally{attribute.mockRestore();}
 });
 it('does not rebuild single-material geometry for unused draw-group edits',()=>{
  const root=new Group(),mesh=block(root,[.2,3,4],[0,0,0]);
  const query=trackQuery([{instanceId:'single-material',object:root}]),build=vi.spyOn(RAPIER.TriMesh.prototype,'intoRaw');
  try{
   query.sync();const built=build.mock.calls.length;expect(built).toBeGreaterThan(0);
   mesh.geometry.clearGroups();query.sync();
   expect(build.mock.calls.length).toBe(built);
   expect(query.probe([2,0,0],[-2,0,0],.1).distanceMeters).toBeCloseTo(1.8,4);
   mesh.material=[new MeshStandardMaterial()];mesh.geometry.addGroup(0,mesh.geometry.index!.count,0);query.sync();
   expect(build.mock.calls.length).toBeGreaterThan(built);
   mesh.geometry.clearGroups();query.sync();
   expect(query.probe([2,0,0],[-2,0,0],.1).colliderEntityId).toBeUndefined();
  }finally{build.mockRestore();}
 });
 it('keeps shared geometry groups separate from each mesh material revision',()=>{
  const geometry=new BoxGeometry(.2,3,4),solid=new MeshStandardMaterial(),hidden=new MeshStandardMaterial({visible:false});
  const root=new Group(),single=new Mesh(geometry,solid),grouped=new Mesh<BoxGeometry,MeshStandardMaterial|MeshStandardMaterial[]>(geometry,[solid,hidden]);grouped.position.z=10;root.add(single,grouped);
  const query=trackQuery([{instanceId:'shared-materials',object:root}]);query.sync();
  geometry.groups.forEach(group=>{group.materialIndex=0;});query.sync();
  expect(query.visibleBetween([2,0,0],[-2,0,0])).toBe(false);
  expect(query.visibleBetween([2,0,10],[-2,0,10])).toBe(false);
  geometry.groups.forEach(group=>{group.materialIndex=1;});query.sync();
  expect(query.visibleBetween([2,0,0],[-2,0,0])).toBe(false);
  expect(query.visibleBetween([2,0,10],[-2,0,10])).toBe(true);
  grouped.material=solid;query.sync();
  expect(query.visibleBetween([2,0,10],[-2,0,10])).toBe(false);
  geometry.setDrawRange(0,0);query.sync();
  expect(query.visibleBetween([2,0,0],[-2,0,0])).toBe(true);
  expect(query.visibleBetween([2,0,10],[-2,0,10])).toBe(true);
 });
 it('ignores moving SDK water effects while keeping the vehicle hull solid',()=>{
  const root=new Group(),fx=new Group();root.add(fx);markCameraVisualEffect(fx);
  block(root,[.2,3,4],[0,0,0]);const drop=block(fx,[1,1,1],[3,0,0]);
  const query=trackQuery([{instanceId:'boat',object:root}]);query.sync();
  expect(query.probe([3,0,0],[3,0,0],.2).startedOverlapping).not.toBe(true);
  expect(query.probe([4,0,0],[-4,0,0],.2).distanceMeters).toBeCloseTo(3.7,4);
  drop.scale.setScalar(0);query.sync();
  expect(query.refinedActorIds.has('boat')).toBe(true);
  expect(query.probe([4,0,0],[-4,0,0],.2).distanceMeters).toBeCloseTo(3.7,4);
 });
 it('does not decompose unchanged parked parts but observes live material changes',()=>{
  const root=new Group(),mesh=block(root,[.2,3,4],[0,1.5,0]),query=trackQuery([{instanceId:'parked',object:root}]);
  const signature=vi.spyOn(geometryQueries,'poseFromWorldMatrix');
  try{
   query.sync();const calls=signature.mock.calls.length;expect(calls).toBeGreaterThan(0);
   for(let n=0;n<60;n++)query.sync();expect(signature.mock.calls.length).toBe(calls);
   const material=mesh.material as MeshStandardMaterial;material.transparent=true;material.opacity=.3;query.sync();
   expect(query.visibleBetween([2,1,0],[-2,1,0])).toBe(true);
   expect(query.probe([2,1,0],[-2,1,0],.1).distanceMeters).toBeCloseTo(1.8,4);
   expect(signature.mock.calls.length).toBe(calls);
  }finally{signature.mockRestore();}
 });
 it('invalidates parked geometry for attribute replacement, in-place edits, draw ranges and material groups',()=>{
  const root=new Group(),mesh=block(root,[.2,3,4],[0,1.5,0]),query=trackQuery([{instanceId:'editable',object:root}]);query.sync();
  const positions=mesh.geometry.getAttribute('position').clone();
  for(let n=0;n<positions.count;n++)positions.setX(n,positions.getX(n)+10);
  mesh.geometry.setAttribute('position',positions);query.sync();
  expect(query.probe([2,1,0],[-2,1,0],.1).colliderEntityId).toBeUndefined();
  for(let n=0;n<positions.count;n++)positions.setX(n,positions.getX(n)-10);positions.needsUpdate=true;query.sync();
  expect(query.probe([2,1,0],[-2,1,0],.1).distanceMeters).toBeCloseTo(1.8,4);
  mesh.geometry.setDrawRange(0,0);query.sync();expect(query.refinedActorIds.size).toBe(0);
  mesh.geometry.setDrawRange(0,Infinity);query.sync();expect(query.refinedActorIds.has('editable')).toBe(true);
  mesh.material=[new MeshStandardMaterial(),new MeshStandardMaterial({visible:false})];
  mesh.geometry.clearGroups();mesh.geometry.addGroup(0,mesh.geometry.index!.count,0);query.sync();
  expect(query.visibleBetween([2,1,0],[-2,1,0])).toBe(false);
  mesh.geometry.groups[0]!.materialIndex=1;query.sync();expect(query.visibleBetween([2,1,0],[-2,1,0])).toBe(true);
 });
 it('observes instance matrix versions and counts when the mesh world pose stays unchanged',()=>{
  const mesh=new InstancedMesh(new BoxGeometry(1,2,2),new MeshStandardMaterial(),1),query=trackQuery([{instanceId:'instances',object:mesh}]);
  mesh.setMatrixAt(0,new Matrix4().makeTranslation(10,0,0));mesh.instanceMatrix.needsUpdate=true;query.sync();
  expect(query.probe([2,0,0],[-2,0,0],.1).colliderEntityId).toBeUndefined();
  mesh.setMatrixAt(0,new Matrix4());mesh.instanceMatrix.needsUpdate=true;query.sync();
  expect(query.probe([2,0,0],[-2,0,0],.1).distanceMeters).toBeCloseTo(1.4,4);
  mesh.count=0;query.sync();expect(query.refinedActorIds.size).toBe(0);
  mesh.count=1;query.sync();expect(query.probe([2,0,0],[-2,0,0],.1).distanceMeters).toBeCloseTo(1.4,4);
 });
 it('reuses rigid part shapes while child meshes rotate, and releases removed parts',()=>{
  const root=new Group(),arm=new Group();root.add(arm);
  const panel=block(arm,[.2,3,4],[0,0,0]);
  const child=new Mesh(new BoxGeometry(.2,.2,.2),new MeshStandardMaterial());child.position.y=4;panel.add(child);
  const build=vi.spyOn(RAPIER.TriMesh.prototype,'intoRaw');
  try{
   const query=trackQuery([{instanceId:'animated',object:root}]);query.sync();
   expect(build).toHaveBeenCalledTimes(4);
   const frees=build.mock.results.map(result=>vi.spyOn(result.value as ReturnType<RAPIER.TriMesh['intoRaw']>,'free'));
   for(let n=0;n<30;n++){arm.rotation.y=n*.03;query.sync();expect(query.probe(new Vector3(2,0,0).applyMatrix4(panel.matrixWorld).toArray(),[0,0,0],.1).distanceMeters).toBeCloseTo(1.8,4);}
   expect(build).toHaveBeenCalledTimes(4);
   arm.rotation.y=Math.PI/2;query.sync();
   expect(query.probe([0,0,-3],[0,0,3],.1).distanceMeters).toBeCloseTo(2.8,4);
   expect(query.visibleBetween([0,0,-3],[0,0,3])).toBe(false);
   root.remove(arm);query.sync();
   expect(query.probe([0,0,-3],[0,0,3],.1).colliderEntityId).toBeUndefined();
   expect(query.refinedActorIds.size).toBe(0);
   for(const free of frees){expect(free).toHaveBeenCalledTimes(1);free.mockRestore();}
  }finally{build.mockRestore();}
 });
 it('keeps an intentionally open cylinder hollow when welding only numerical seams',()=>{
  const root=new Group();root.add(new Mesh(new CylinderGeometry(1,1,2,32,1,true),new MeshStandardMaterial({transparent:true,opacity:.25})));
  const query=trackQuery([{instanceId:'open-shell',object:root}]);query.sync();
  expect(query.probe([0,0,0],[0,0,0],.2).startedOverlapping).not.toBe(true);
  expect(query.probe([0,0,0],[0,3,0],.2).colliderEntityId).toBeUndefined();
  expect(query.probe([0,0,0],[2,0,0],.2).distanceMeters).toBeLessThan(.9);
 });
});

it('holds a dragon camera arm across a brief clear gap and recovers without a pop',async()=>{
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:createDragonTrainingMap(),
    character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'dragon',assetId:'dragon',spec:createFlyingCreatureSpec('dragon'),object:new Group()}]}});
  try{
    const r=world.humanoid!;r.prepareEpisodeStart({positionWorldMetersXYZ:[0,40,0],facingYawRadians:0,humanoid:{mounted:true,vehicleInstanceId:'dragon'}});
    const wall=new Mesh(new BoxGeometry(100,100,1));wall.position.set(0,40,10);world.addEntity({id:'camera-wall',object:wall,role:'obstacle',physics:{kind:'fixed',shape:'box'}});
    world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',activation:'immediate',binding:{targetEntityId:'dragon'},views:{orbit:{kind:'third-person',overrides:{zoom:{range:{kind:'unbounded'}},position:{anchor:{kind:'origin'},distanceMeters:32,armHalfLifeSeconds:0},orientation:{initialPitchRadians:0,recenter:{enabled:false}},constraints:{visibility:'require-line-of-sight',recovery:{clearHoldSeconds:.12,halfLifeSeconds:.18,speedLimit:{kind:'limited',maximumSpeedMetersPerSecond:12}}}}}}}});
    const arm=()=>world.snapshot().camera.actualArmDistanceMeters!;
    // The semantic aircraft forward is -Z; place this wall along the selected arm.
    world.step({},1);const constrained=arm();expect(constrained).toBeLessThan(11);
    await world.execute({type:'entity.despawn',entityId:'camera-wall'});world.step({},1);expect(arm()).toBeLessThanOrEqual(constrained+.001);
    let previous=arm();for(let n=0;n<240;n++){world.step({},1);expect(arm()-previous).toBeLessThanOrEqual(12/60+.002);previous=arm();}
    expect(arm()).toBeGreaterThan(31);
  }finally{world.dispose();}
});

it('reuses rigid part shapes through root and rotor motion, but rebuilds edited geometry',()=>{
 const root=new Group(),pivot=new Group();root.add(pivot);const rotor=new Mesh(new BoxGeometry(4,.15,.2),new MeshStandardMaterial());pivot.add(rotor);block(root,[1,1,2],[0,-2,0]);
 const build=vi.spyOn(RAPIER.TriMesh.prototype,'intoRaw');
 try{const query=trackQuery([{instanceId:'rotor',object:root}]);query.sync();const count=build.mock.calls.length;
 for(let n=0;n<60;n++){root.position.set(n*.2,1,n*.3);root.rotation.y=n*.02;pivot.rotation.y=n*.1;query.sync();expect(query.probe(new Vector3(0,0,3).applyMatrix4(rotor.matrixWorld).toArray(),root.position.toArray(),.1).distanceMeters).toBeCloseTo(2.8,4);}
 expect(build.mock.calls.length).toBe(count);
 root.position.set(0,0,0);root.rotation.set(0,0,0);pivot.rotation.y=Math.PI/2;query.sync();expect(query.probe([3,0,0],[-3,0,0],.1).distanceMeters).toBeCloseTo(2.8,3);
 rotor.geometry.scale(2,1,1);query.sync();expect(build.mock.calls.length).toBeGreaterThan(count);
 root.remove(pivot);query.sync();expect(query.probe([3,0,0],[-3,0,0],.1).colliderEntityId).toBeUndefined();
 }finally{build.mockRestore();}
});
