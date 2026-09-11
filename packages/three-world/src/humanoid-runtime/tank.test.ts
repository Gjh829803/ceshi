import {beforeAll,expect,it,vi} from 'vitest';
import {Box3,Group,Mesh,SkinnedMesh,Vector3} from 'three';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createVehicle,emptyInput,stepVehicle as prepareVehicle,type Input} from './simulation';
import {EnvironmentQueries,initEnvironmentQueries,vehicleBody} from './environment/queries';
import {tankBarrel,TANK_CONTROLS} from './motion-families/ground-vehicle/tank';
import {sampleTankVisual} from './tank-visual';
import {Character} from './character';
import {TANK_SPEC,TANK_SOCKETS} from '../../../../shared/preset-content/tank';
import {buildTankModel} from '../../../../shared/preset-content/tank-model';
beforeAll(initEnvironmentQueries);
function fixture(wall=false){
 const q=new EnvironmentQueries({id:'tank-test',name:'Tank',description:'',bounds:{min:[-2000,-10,-2000],max:[2000,100,2000]},
  boxes:[{id:'ground',position:[0,-1,0],size:[4000,2,4000]},...(wall?[{id:'wall',position:[0,3,18] as const,size:[80,6,.12] as const}]:[])],water:[],regions:[],spawns:[],playerSpawn:[-20,0,0]});
 const v=createVehicle({...TANK_SPEC,spawn:[0,.035,0]});
 const run=(seconds:number,input:Partial<Input>={})=>{for(let i=0;i<Math.round(seconds*60);i++)stepVehicle(v,{...emptyInput(),...input},1/60,i/60,q);};
 return {q,v,run};
}
it('accelerates, boosts, brakes before reversing and holds still with no input',()=>{
 const {q,v,run}=fixture();try{
  run(1);expect(v.speed).toBeLessThan(.01);
  run(12,{forward:1});expect(v.speed).toBeGreaterThan(10);expect(v.speed).toBeLessThan(12);
  run(10,{forward:1,boost:true});expect(v.speed).toBeGreaterThan(16);
  run(.4,{forward:-1});expect(v.velocity.z).toBeGreaterThan(0);
  run(5,{forward:-1});expect(v.velocity.z).toBeLessThan(-1);expect(v.speed).toBeLessThanOrEqual(4.01);
  run(2,{brake:true});expect(v.speed).toBeLessThan(.01);const p=v.position.clone();run(2);expect(v.position.distanceTo(p)).toBeLessThan(.01);
 }finally{q.dispose();}
});
it('counter-rotates tracks during a pivot, while turret and elevation have independent inputs and stops',()=>{
 const {q,v,run}=fixture();try{
  run(1,{steer:1});expect(v.position.length()).toBeLessThan(.1);expect(v.yaw).toBeLessThan(-.3);
  expect(v.motion.tank!.leftTravel).toBeGreaterThan(.5);expect(v.motion.tank!.rightTravel).toBeLessThan(-.5);
  run(.5);const yaw=v.yaw;run(2,{roll:1,pitch:-1});expect(Math.abs(v.yaw-yaw)).toBeLessThan(.06);
  expect(v.motion.tank!.turretYaw).toBeCloseTo(-1.3,3);expect(v.motion.tank!.gunElevation).toBe(TANK_CONTROLS.maximumGunRadians);
  const turret=v.motion.tank!.turretYaw;run(1);expect(v.motion.tank!.turretYaw).toBe(turret);
  run(3,{pitch:1});expect(v.motion.tank!.gunElevation).toBe(TANK_CONTROLS.minimumGunRadians);
  const model=buildTankModel();sampleTankVisual(model,v.motion.tank!);const locals=model.children.map(n=>n.quaternion.clone());sampleTankVisual(model,v.motion.tank!);
  model.children.forEach((n,i)=>expect(n.quaternion.angleTo(locals[i]!)).toBeLessThan(1e-7));
  sampleTankVisual(model,createVehicle(TANK_SPEC).motion.tank!);expect(model.getObjectByName('tank.turret')!.rotation.y).toBe(0);
 }finally{q.dispose();}
});
it('sweeps the barrel before the hull reaches a wall, and rejects obstructed turret rotation',()=>{
 const {q,v,run}=fixture(true);try{
  run(5,{forward:1,boost:true});expect(v.position.z).toBeLessThan(13);expect(v.speed).toBeLessThan(.1);
  const barrel=tankBarrel(v);expect(q.overlaps(barrel.position,barrel.body,barrel.rotation)).toBe(false);
  expect(q.overlaps(v.position,vehicleBody(v.spec),v.rotation)).toBe(false);
 }finally{q.dispose();}
 const side=fixture();try{
  // Additional test wall outside the hull, inside the turret's swept radius.
  const obstacle=new EnvironmentQueries({...side.q.map,boxes:[...side.q.map.boxes,{id:'side',position:[5.1,3.5,-1],size:[.15,3,14]}]});
  try{for(let i=0;i<180;i++)stepVehicle(side.v,{...emptyInput(),roll:-1},1/60,i/60,obstacle);
   expect(side.v.motion.tank!.turretYaw).toBeLessThan(Math.PI/2);expect(side.v.motion.tank!.articulationBlocked).toBe(true);
  }finally{obstacle.dispose();}
 }finally{side.q.dispose();}
});
it('keeps the full original rider inside the cabin with fixed hand/foot contact, including zero-time entry',async()=>{
 const transport=vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>{const b=await readFile(fileURLToPath(url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');});
 const fetchTransport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(await readFile(fileURLToPath(String(input)))));
 const rider=new Character(),model=buildTankModel();
 try{
  await rider.load(p=>new URL(`../../../../assets/three-creator/presets/${p}`,import.meta.url).href);
  const identities=new Map<SkinnedMesh,unknown>();rider.root.traverse(n=>{if(n instanceof SkinnedMesh)identities.set(n,n.geometry);});
  const samples=[];
  for(const dt of [0,1/60,1/120,1/30,0]){
   rider.root.position.set(...TANK_SPEC.seat);
   rider.update(dt,{position:new Vector3(),facing:new Vector3(0,0,1),motionSerial:0,traversal:null,completedMotion:null,speed:0,vertical:0,grounded:true,animationGrounded:true,stance:'stand',swimming:false,swimStyle:'freestyle',animationEvent:null,surface:null,skills:null,mounted:'tank'});
   // SkinnedMesh.updateMatrixWorld refreshes bindMatrixInverse, as the renderer does.
   rider.root.updateMatrixWorld(true);model.updateMatrixWorld(true);
   const bounds=new Box3(),p=new Vector3(),localPoint=new Vector3();
   const wallMeshes:Mesh[]=[];model.traverse(n=>{if(n instanceof Mesh&&/^(hull\.|cabin\.)/.test(n.name)){n.geometry.computeBoundingBox();wallMeshes.push(n);}});
   const walls=wallMeshes.map(wall=>({name:wall.name,inverse:wall.matrixWorld.clone().invert(),bounds:wall.geometry.boundingBox!.clone().expandByScalar(-.001)}));
   const intersections=new Set<string>();
   for(const [mesh,geometry] of identities){expect(mesh.geometry).toBe(geometry);expect(mesh.visible).toBe(true);mesh.skeleton.update();
    for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){
     mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(p);
     for(const wall of walls)if(wall.bounds.containsPoint(localPoint.copy(p).applyMatrix4(wall.inverse)))intersections.add(wall.name);
    }
   }
   expect([...intersections]).toEqual([]);
   expect(bounds.min.y).toBeGreaterThan(.88);expect(bounds.max.y).toBeLessThan(2.5);expect(bounds.min.z).toBeGreaterThan(1.9);expect(bounds.max.z).toBeLessThan(3);
   for(const [bone,socket] of [['hand_l','control.hand.left'],['hand_r','control.hand.right'],['ball_l','control.foot.left'],['ball_r','control.foot.right']] as const){
    const point=rider.root.getObjectByName(bone)!.getWorldPosition(new Vector3());expect(point.distanceTo(new Vector3(...TANK_SOCKETS[socket]))).toBeLessThan(.002);
   }
   expect(rider.root.scale.toArray()).toEqual([1,1,1]);samples.push({dt,min:bounds.min.toArray(),max:bounds.max.toArray()});
  }
  console.log('TANK_CABIN_CLEARANCE',JSON.stringify(samples));
 }finally{rider.dispose();transport.mockRestore();fetchTransport.mockRestore();}
},15_000);

function stepVehicle(...args:Parameters<typeof prepareVehicle>){prepareVehicle(...args);if(args[0].motion.wheelPhysics||args[0].motion.body)args[4].stepPhysics(args[2]);}
