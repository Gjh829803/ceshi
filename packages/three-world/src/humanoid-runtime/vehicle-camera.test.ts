import {describe,it,expect,beforeAll,afterEach,vi} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import {BoxGeometry,CapsuleGeometry,CylinderGeometry,SphereGeometry,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,PerspectiveCamera,Quaternion,Vector3} from 'three';
import * as geometryQueries from '../geometry';
import {createWorld} from '../world';
import type {VehicleSpec} from './config';
import type {EnvironmentDefinition} from './environment/types';
import {initEnvironmentQueries} from './environment/queries';
import {VehicleCameraQueries} from './vehicle-camera-queries';
import {markCameraVisualEffect} from './camera-visual-effects';
const queries=new Set<VehicleCameraQueries>();
function trackQuery(vehicles:ConstructorParameters<typeof VehicleCameraQueries>[0]){const query=new VehicleCameraQueries(vehicles);queries.add(query);return query;}
afterEach(()=>{for(const query of queries)query.dispose();queries.clear();});

const spec:VehicleSpec={id:'rover',name:'Rover',en:'ROVER',mode:'wheeled',kernel:'K03',color:'#fff',spawn:[0,0,0],yaw:0,speed:12,accel:5,grip:11,steer:1.1,radius:1.65,seat:[0,.91,.1],camera:11,hint:'',archetype:'rover',envelope:{kind:'box',halfExtents:[1.35,1.15,2.15],offset:[0,1.15,0]}};
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
 const parkedSpec={...spec,bodyPhysics:{kind:'motion' as const,mass:1600,centerOfMassHeight:.6,friction:1}};
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map,character:{instanceId:'player',object:new Group()},vehicles:[{instanceId:'rover',assetId:'rover',spec:parkedSpec,object}]}});
 world.humanoid!.applyProfile({cameraDistanceMeters:11,camera:{targetHeightOffset:1.1,collisionRadiusMeters:.25}});
 return world;
}
function approachAndOrbit(world:Awaited<ReturnType<typeof fixture>>){
 world.step({},5);world.step({moveXRatio:1},100);
 const contact=world.getEntityState('player'),vehicleX=world.humanoid!.simulation.vehicles[0]!.position.x;world.step({},30);
 world.step({cameraPitchRatio:-1},25);world.step({cameraYawRatio:1},78);
 return {...contact,vehicleX};
}
describe('vehicle camera geometry',()=>{
 beforeAll(initEnvironmentQueries);
 it('keeps the third-person view through an open cabin while the envelope still stops walking',async()=>{
  const world=await fixture();try{
   const contact=approachAndOrbit(world);
   expect(contact.positionWorldMetersXYZ[0]-contact.vehicleX).toBeGreaterThan(1.60);expect(contact.positionWorldMetersXYZ[0]-contact.vehicleX).toBeLessThan(1.75);
   expect(contact.motion?.collisionEntityIds).toContain('rover:0');
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
 it('discovers a vehicle model attached after runtime initialization and keeps display projection deterministic',async()=>{
  const root=new Group(),world=await fixture(root);try{
   root.add(openCabin());approachAndOrbit(world);
   const r=world.humanoid!,c=r.followCamera,state=c.collisionState;
   const pose={position:r.simulation.player.position.clone(),rotation:new Quaternion(),velocity:new Vector3(),yaw:r.simulation.player.yaw,speed:0,steering:0,cameraHeight:1.68*.655};
   c.present(pose,.75);const eye=world.camera.position.clone();c.present(pose,.25);c.present(pose,.75);
   expect(world.camera.position.distanceTo(eye)).toBeLessThan(1e-8);expect(c.collisionState).toEqual(state);
   expect(world.camera.position.distanceTo(c.presentationTarget)).toBeGreaterThan(10.9);
   await world.reset();approachAndOrbit(world);expect(world.snapshot().camera.actualArmDistanceMeters).toBeGreaterThan(10.9);
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
  expect(query.probe([2,1,0],[-2,1,0],.2).distanceMeters).toBeCloseTo(1.75,4);
  glass.material[0]!.transparent=false;glass.material[0]!.opacity=1;query.sync();
  expect(query.visibleBetween([2,1,0],[-2,1,0])).toBe(false);
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
   for(let n=0;n<30;n++){arm.rotation.y=n*.03;query.sync();}
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
