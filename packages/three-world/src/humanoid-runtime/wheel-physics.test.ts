import * as publicHumanoid from './public';
import {getMap} from '@worldkit/preset-content/environment/maps';
import {SPECS as playgroundVehicles} from '@worldkit/preset-content/config';
import {createRoadPhysicsProfile} from './motion-families/ground-vehicle/wheel-physics';
import {beforeAll,describe,it,expect,vi} from 'vitest';
import {Vector3,Group,Quaternion,Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {WorldKeyboard} from '../input';
import {VehicleCameraQueries} from './vehicle-camera-queries';
import {initEnvironmentQueries,EnvironmentQueries} from './environment/queries';
import type {EnvironmentDefinition} from './environment/types';
import type {VehicleSpec} from './config';
import {createVehicle,emptyInput,stepVehicle,Simulation} from './simulation';
import {PresentationState} from './presentation';
import {updateVehicleWheels} from './vehicle-animation';
import {buildVehicle} from '@worldkit/preset-content/models';
// 程序化汽车不加载生物资源目录；测试中禁止无关浏览器资源请求。
vi.mock('@worldkit/preset-content/assets/resources',()=>({definitions:{},resolvePresetResource:()=>{throw new Error('UNEXPECTED_CREATURE_RESOURCE');}}));
const map:EnvironmentDefinition={id:'wheel-test',name:'Wheel test',description:'',bounds:{min:[-200,-30,-200],max:[200,80,200]},boxes:[{id:'floor',position:[0,-.5,0],size:[400,1,400]}],water:[],regions:[],spawns:[],playerSpawn:[20,0,20]};
const spec:VehicleSpec={id:'car',name:'Car',en:'CAR',mode:'wheeled',kernel:'test',color:'#fff',spawn:[0,0,0],yaw:0,speed:28,accel:10,grip:11,steer:1,radius:1.65,seat:[0,.91,.1],hint:'',archetype:'rover',envelope:{kind:'box',halfExtents:[1.35,.99,2.15],offset:[0,1.31,0]},wheelPhysics:{mass:1600,radius:.52,hubHeight:.52,halfTrack:1.1,halfWheelbase:1.27}};
beforeAll(initEnvironmentQueries);
function fixture(extra:EnvironmentDefinition['boxes']=[],floorSize=400){return {q:new EnvironmentQueries({...map,boxes:[{...map.boxes[0]!,size:[floorSize,1,floorSize]},...extra]}),v:createVehicle(spec)};}
function run(f:ReturnType<typeof fixture>,n:number,input=emptyInput()){for(let i=0;i<n;i++){stepVehicle(f.v,input,1/60,i/60,f.q);f.q.stepPhysics(1/60);}}
describe('per-wheel road vehicle',()=>{
 it.each(['rover','trail-rover'])('covers %s visible body vertices with persistent solver colliders',id=>{
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({beginPath(){},roundRect(){},fill(){},fillText(){}})})});
  const selected=playgroundVehicles.find(v=>v.id===id)!,visual=buildVehicle(selected),f=fixture();
  f.v=createVehicle({...selected,spawn:[0,0,0],yaw:.7});
  try{
   run(f,120);visual.root.position.copy(f.v.position);visual.root.quaternion.copy(f.v.rotation);visual.root.updateMatrixWorld(true);
   const rig=f.q.vehicleRig(f.v.spec.id,f.v.motion.wheelPhysics!,f.v.position,f.v.rotation,1,1,1,1,1),uncovered:string[]=[];
   let samples=0;
   visual.root.traverse(node=>{
    if(!(node instanceof Mesh))return;
    for(let parent:typeof node.parent=node;parent;parent=parent.parent)if(visual.wheelRigs.some(w=>w.steering===parent))return;
    const vertices=node.geometry.getAttribute('position');
    for(let n=0;n<vertices.count;n++){
     const point=new Vector3().fromBufferAttribute(vertices,n).applyMatrix4(node.matrixWorld);
     const gap=Math.min(...rig.colliders.map(c=>point.distanceTo(new Vector3().copy(c.projectPoint(point,true)!.point))));
     if(gap>.002)uncovered.push(`${node.name||node.geometry.type}: ${point.toArray()} gap=${gap}`);
     samples++;
    }
   });
   expect(samples).toBeGreaterThan(300);expect(uncovered).toEqual([]);
   const handles=rig.colliders.map(c=>c.handle),setShape=vi.spyOn(RAPIER.Collider.prototype,'setShape');
   try{run(f,180,{...emptyInput(),forward:1});expect(rig.colliders.map(c=>c.handle)).toEqual(handles);expect(setShape).not.toHaveBeenCalled();}finally{setShape.mockRestore();}
  }finally{f.q.dispose();visual.root.traverse(n=>{if(n instanceof Mesh)n.geometry.dispose();});vi.unstubAllGlobals();}
 });
 it.each([['trail-rover',1,1.22,1.75],['trail-rover',-1,1.70,1.40],['rover',1,1.22,1.75],['rover',-1,1.27,1.65]] as const)('%s body stops at an elevated obstacle in direction %s', (id,direction,height,reach)=>{
  const f=fixture([{id:'body-bar',position:[0,height,direction*7],size:[20,.08,.2]}]);
  f.v=createVehicle({...playgroundVehicles.find(v=>v.id===id)!,spawn:[0,0,0],yaw:0});
  try{
   run(f,120);run(f,360,{...emptyInput(),forward:direction});
   expect(direction*f.v.position.z).toBeLessThan(6.9-reach+.06);
   expect(direction*f.v.position.z).toBeGreaterThan(3);
   const before=f.v.position.z;run(f,240,{...emptyInput(),forward:-direction});
   expect(direction*(f.v.position.z-before)).toBeLessThan(-1);
  }finally{f.q.dispose();}
 });
 it.each(['rover','racer','trail-rover','atv','bus'])('holds S to brake into reverse, then W to drive forward again: %s',id=>{
  const f=fixture([],4000);f.v=createVehicle({...playgroundVehicles.find(v=>v.id===id)!,spawn:[0,0,0],yaw:0});
  const keyboard=new WorldKeyboard(()=>0,()=>{});keyboard.enabled=true;keyboard.setHumanoidMode(()=>f.v.spec.mode);
  const held=(frames:number)=>{for(let n=0;n<frames;n++)run(f,1,keyboard.sample().humanoid!);};
  try{
   held(180);keyboard.keyDown('KeyW');held(180);keyboard.keyUp('KeyW');const speed=f.v.velocity.z;
   expect(speed).toBeGreaterThan(4);keyboard.keyDown('KeyS');held(1);expect(f.v.motion.wheelPhysics!.powertrain.directionBraking).toBe(true);
   held(59);expect(f.v.velocity.z).toBeLessThan(speed*.75);held(300);
   expect(f.v.motion.wheelPhysics!.powertrain.gear).toBe(-1);expect(f.v.velocity.z).toBeLessThan(-1);const position=f.v.position.z;
   held(60);expect(f.v.position.z).toBeLessThan(position-1);expect(f.v.speed).toBeLessThan(f.v.spec.reverseSpeed+.3);
   keyboard.keyUp('KeyS');keyboard.keyDown('KeyW');held(300);expect(f.v.motion.wheelPhysics!.powertrain.targetGear).toBeGreaterThan(0);expect(f.v.velocity.z).toBeGreaterThan(1);
  }finally{keyboard.clear();f.q.dispose();}
 });
 it.each([true,false])('crosses the campus low obstacles without launching, dynamic=%s',dynamic=>{
  for(const id of ['rover','racer','trail-rover'])for(const offset of [-.7,0,.7])for(const boost of [false,true]){
   const terrain=structuredClone(getMap('campus'));
   if(!dynamic)for(const box of terrain.boxes)if(box.id.startsWith('suspension-'))delete box.rigidGroup;
   const f={q:new EnvironmentQueries(terrain),v:createVehicle({...playgroundVehicles.find(v=>v.id===id)!,spawn:[-24+offset,0,64],yaw:0})};
   try{
    run(f,180);let height=0,up=1;
    for(let n=0;n<480;n++){run(f,1,{...emptyInput(),forward:1,boost});height=Math.max(height,f.v.position.y);up=Math.min(up,new Vector3(0,1,0).applyQuaternion(f.v.rotation).y);}
    const sample=JSON.stringify({id,offset,boost,dynamic,height,up});
    expect(height,sample).toBeLessThan(.45);expect(up,sample).toBeGreaterThan(.9);expect(f.v.position.z,sample).toBeGreaterThan(110);
    // 压坎后仍能制动倒车，不能以离地或翻倒后的轮胎空转掩盖失去驱动。
    run(f,480,{...emptyInput(),forward:-1});expect(f.v.motion.wheelPhysics!.powertrain.gear,sample).toBe(-1);
    expect(f.v.velocity.dot(new Vector3(0,0,1).applyQuaternion(f.v.rotation)),sample).toBeLessThan(-1);
   }finally{f.q.dispose();}
  }
 });
 it('keeps car camera collision meshes cached during sustained physical rotation',()=>{
  const f=fixture(),root=new Group(),panel=new Mesh(new BoxGeometry(2,1,3),new MeshStandardMaterial());
  panel.scale.set(1,1.1,.9);root.add(panel);f.v.rotation.setFromAxisAngle(new Vector3(0,1,0),.7);
  const query=new VehicleCameraQueries([{instanceId:'car',object:root}]),build=vi.spyOn(RAPIER.TriMesh.prototype,'intoRaw');
  const probe=()=>query.probe(new Vector3(4,0,0).applyQuaternion(root.quaternion).add(root.position).toArray(),root.position.toArray(),.1);
  try{
   root.quaternion.copy(f.v.rotation);query.sync();const built=build.mock.calls.length;expect(built).toBe(2);
   for(let n=0;n<180;n++){run(f,1,{...emptyInput(),forward:1,steer:.4});root.position.copy(f.v.position);root.quaternion.copy(f.v.rotation);query.sync();expect(probe().distanceMeters).toBeCloseTo(2.9,4);}
   expect(build.mock.calls.length).toBe(built);
   panel.scale.x=2;query.sync();expect(build.mock.calls.length).toBe(built);
   expect(probe().distanceMeters).toBeCloseTo(1.9,4);expect(build.mock.calls.length).toBeGreaterThan(built);
  }finally{query.dispose();build.mockRestore();panel.geometry.dispose();panel.material.dispose();f.q.dispose();}
 });
 it.each(['rover','racer','trail-rover','supercar','kart'])('keeps turning rather than translating sideways during boosted countersteering: %s',id=>{
  for(const kmh of [100,200]){
   const f=fixture([],4000);f.v=createVehicle({...playgroundVehicles.find(v=>v.id===id)!,spawn:[0,0,0],yaw:0});
   try{
    run(f,180);const speed=Math.min(kmh/3.6,f.v.spec.maxSpeed);
    f.v.velocity.set(0,0,speed);for(const w of f.v.motion.wheelPhysics!.wheels)w.omega=speed/f.v.spec.wheelPhysics!.radius;
    run(f,180,{...emptyInput(),forward:1,boost:true,steer:1});
    for(const sign of [-1,1,-1]){
     run(f,36,{...emptyInput(),forward:1,boost:true,steer:sign});
     // After the steering crossover, yaw must retain useful authority, not merely have the correct sign.
     expect(-sign*f.v.motion.wheelPhysics!.angularVelocity.y).toBeGreaterThan(.12);
     const forward=new Vector3(0,0,1).applyQuaternion(f.v.rotation),right=new Vector3(1,0,0).applyQuaternion(f.v.rotation);
     expect(Math.abs(Math.atan2(f.v.velocity.dot(right),f.v.velocity.dot(forward)))).toBeLessThan(.15);
     run(f,144,{...emptyInput(),forward:1,boost:true,steer:sign});
     expect(-sign*f.v.motion.wheelPhysics!.angularVelocity.y).toBeGreaterThan(.08);
     expect(new Vector3(0,1,0).applyQuaternion(f.v.rotation).y).toBeGreaterThan(.9);
    }
   }finally{f.q.dispose();}
  }
 });
 it.each([12,22])('keeps front axle load and turns after entering the authored %s degree ramp',degrees=>{
  for(const sign of [-1,1]){const x=degrees===12?27:49,q=new EnvironmentQueries(getMap('campus')),v=createVehicle({...playgroundVehicles.find(v=>v.id==='racer')!,spawn:[x,0,139],yaw:0}),f={q,v};
   try{run(f,120,{...emptyInput(),brake:true});v.velocity.set(0,0,20/3.6);for(const w of v.motion.wheelPhysics!.wheels)w.omega=(20/3.6)/v.spec.wheelPhysics!.radius;
    for(let n=0;n<240&&v.position.z<150;n++)run(f,1,{...emptyInput(),forward:1,boost:true});expect(v.position.z).toBeGreaterThanOrEqual(150);const yaw=v.yaw,origin=v.position.clone();let axleLoad=0;
    for(let n=0;n<30;n++){run(f,1,{...emptyInput(),forward:1,boost:true,steer:sign});axleLoad+=v.motion.wheelPhysics!.wheels[1]!.load+v.motion.wheelPhysics!.wheels[3]!.load;}
    expect(axleLoad/30).toBeGreaterThan(1000);expect(-sign*(v.yaw-yaw)).toBeGreaterThan(.06);expect(-sign*(v.position.x-origin.x)).toBeGreaterThan(.1);expect(v.position.y).toBeGreaterThan(origin.y);
   }finally{q.dispose();}
  }
 });
 it.each(['rover','racer','supercar'])('bends the actual velocity and trajectory under high-speed full throttle: %s',id=>{
  for(const sign of [-1,1]){const f=fixture([],4000);f.v=createVehicle({...playgroundVehicles.find(v=>v.id===id)!,spawn:[0,0,0],yaw:0});
   try{run(f,180);f.v.velocity.set(0,0,160/3.6);for(const w of f.v.motion.wheelPhysics!.wheels)w.omega=(160/3.6)/f.v.spec.wheelPhysics!.radius;
    run(f,240,{...emptyInput(),forward:1,boost:true,steer:sign});
    expect(-sign*f.v.position.x).toBeGreaterThan(50);expect(-sign*Math.atan2(f.v.velocity.x,f.v.velocity.z)).toBeGreaterThan(.7);expect(f.v.speed).toBeGreaterThan(30);
    expect(new Vector3(0,1,0).applyQuaternion(f.v.rotation).y).toBeGreaterThan(.9);
   }finally{f.q.dispose();}
  }
 });
 it('keeps the same physical and displayed full-lock angles at low and high speed',()=>{
  const angles:number[][]=[];
  for(const speed of [0,160/3.6]){const f=fixture();try{run(f,180);f.v.velocity.set(0,0,speed);f.v.steering=1;for(const w of f.v.motion.wheelPhysics!.wheels)w.omega=speed/spec.wheelPhysics!.radius;run(f,1,{...emptyInput(),steer:1});
   const wheels=f.v.motion.wheelPhysics!.wheels,visual={wheelRigs:wheels.map(()=>({steering:new Group(),spin:new Group(),radius:.52})),steering:[]};
   updateVehicleWheels(visual,{position:f.v.position,rotation:f.v.rotation,steering:1,wheels},{grounded:true,dt:1/60,revision:0});
   angles.push(wheels.map((w,i)=>{expect(visual.wheelRigs[i]!.steering.rotation.y).toBe(w.steer);return w.steer;}));
  }finally{f.q.dispose();}}
  for(let i=0;i<4;i++)expect(angles[0]![i]).toBeCloseTo(angles[1]![i]!,8);expect(Math.abs(angles[1]![1]!)).toBeGreaterThan(.5);
 });
 it.each(['rover','racer','trail-rover','supercar','kart'])('retains wheel authority and reverses yaw repeatedly at speed: %s',id=>{
  for(const kmh of [60,100,160,200]){const f=fixture([],4000);f.v=createVehicle({...playgroundVehicles.find(v=>v.id===id)!,spawn:[0,0,0],yaw:0});
   try{run(f,180);f.v.velocity.set(0,0,kmh/3.6);for(const w of f.v.motion.wheelPhysics!.wheels)w.omega=kmh/3.6/f.v.spec.wheelPhysics!.radius;
    for(const sign of [1,-1,1,-1]){let responded=false;
     // 持续转向测试保持油门；松油门收停另有独立回归，不能要求已经停下的车继续产生偏航。
     for(let n=0;n<90;n++){run(f,1,{...emptyInput(),forward:1,steer:sign});if(n<30&&f.v.motion.wheelPhysics!.angularVelocity.y*sign<-.02)responded=true;expect(new Vector3(0,1,0).applyQuaternion(f.v.rotation).y).toBeGreaterThan(.9);}
     expect(responded).toBe(true);expect(f.v.motion.wheelPhysics!.angularVelocity.y*sign).toBeLessThan(-.02);
     const front=f.v.motion.wheelPhysics!.wheels.filter(w=>Math.abs(w.steer)>0);expect(front.length).toBeGreaterThan(0);for(const w of front){expect(w.steer*sign).toBeLessThan(-.07);}
    }
   }finally{f.q.dispose();}
  }
 });
 it.each(['rover','racer','trail-rover','supercar','kart'])('keeps %s steerable during sustained and reversing high-speed turns',id=>{
  for(const kmh of [60,100,160])for(const reverse of [false,true]){
   const f=fixture([],4000);f.v=createVehicle({...playgroundVehicles.find(v=>v.id===id)!,spawn:[0,0,0],yaw:0});
   try{run(f,180);f.v.velocity.set(0,0,kmh/3.6);for(const w of f.v.motion.wheelPhysics!.wheels)w.omega=kmh/3.6/f.v.spec.wheelPhysics!.radius;
    let minUp=1,maxX=0;for(let n=0;n<360;n++){run(f,1,{...emptyInput(),steer:reverse&&n>=120?-1:1});minUp=Math.min(minUp,new Vector3(0,1,0).applyQuaternion(f.v.rotation).y);maxX=Math.max(maxX,Math.abs(f.v.position.x));}
    expect(minUp).toBeGreaterThan(.9);expect(maxX).toBeGreaterThan(2);expect(f.v.position.toArray().every(Number.isFinite)).toBe(true);
   }finally{f.q.dispose();}
  }
 });
 it('does not suppress airborne car roll momentum',()=>{
  const f=fixture();try{f.v.position.y=20;f.v.motion.wheelPhysics!.angularVelocity.z=2;run(f,30);expect(f.v.motion.wheelPhysics!.wheels.every(w=>!w.contact)).toBe(true);expect(Math.abs(f.v.roll)).toBeGreaterThan(.5);}finally{f.q.dispose();}
 });
 it.each(['supercar','kart'])('keeps the merged %s supported and controllable with its authored wheel geometry',id=>{
  const f=fixture(),authored=playgroundVehicles.find(v=>v.id===id)!;f.v=createVehicle({...authored,spawn:[0,0,0]});
  try{run(f,180);expect(f.v.motion.wheelPhysics!.wheels.every(w=>w.contact)).toBe(true);expect(Math.abs(f.v.position.y)).toBeLessThan(.1);run(f,150,{...emptyInput(),forward:1});expect(f.v.speed).toBeGreaterThan(3);expect(Math.abs(f.v.roll)).toBeLessThan(.1);run(f,360,{...emptyInput(),brake:true});expect(f.v.speed).toBeLessThan(.5);}
  finally{f.q.dispose();}
 });
 it('does not use motorcycle balance to right the body in the air',()=>{
  const a=fixture(),b=fixture();
  for(const [f,balanceAssist] of [[a,true],[b,false]] as const){f.v=createVehicle({...spec,mode:'motorcycle',wheelPhysics:createRoadPhysicsProfile('motorcycle',{balanceAssist})});f.v.position.y=8;f.v.rotation.setFromAxisAngle(new Vector3(0,0,1),.4);}
  try{run(a,15);run(b,15);expect(a.v.motion.wheelPhysics!.wheels.every(w=>!w.contact)).toBe(true);expect(a.v.rotation.angleTo(b.v.rotation)).toBeLessThan(.001);expect(a.v.velocity.y).toBeLessThan(-1);}
  finally{a.q.dispose();b.q.dispose();}
 });
 it('supports a two-wheel rear-driven motorcycle with grounded balance and braking',()=>{
  const f=fixture();f.v=createVehicle({...spec,mode:'motorcycle',envelope:{kind:'box',halfExtents:[.65,1.2,1.65],offset:[0,1.2,0]},wheelPhysics:createRoadPhysicsProfile('motorcycle')});
  try{run(f,180);expect(f.v.motion.wheelPhysics!.wheels).toHaveLength(2);expect(f.v.motion.wheelPhysics!.wheels.every(w=>w.contact)).toBe(true);expect(Math.abs(f.v.roll)).toBeLessThan(.05);run(f,180,{...emptyInput(),forward:1});expect(f.v.position.z).toBeGreaterThan(8);expect(f.v.speed).toBeGreaterThan(5);run(f,100,{...emptyInput(),forward:1,steer:.3});expect(f.v.position.x).toBeLessThan(-.2);expect(Math.abs(f.v.roll)).toBeLessThan(.8);run(f,300,{...emptyInput(),brake:true});expect(f.v.speed).toBeLessThan(.5);}
  finally{f.q.dispose();}
 });
 it('supports six configured wheels without changing the solver',()=>{
  const f=fixture();f.v=createVehicle({...spec,wheelPhysics:createRoadPhysicsProfile('car',{wheels:[-1.1,1.1].flatMap(x=>[-1.27,0,1.27].map(z=>({x,z,steering:z>0,driven:z<=0})))})});
  try{run(f,180);expect(f.v.motion.wheelPhysics!.wheels).toHaveLength(6);expect(f.v.motion.wheelPhysics!.wheels.every(w=>w.contact)).toBe(true);run(f,120,{...emptyInput(),forward:1});expect(f.v.speed).toBeGreaterThan(5);}
  finally{f.q.dispose();}
 });
 it.each(['motorcycle','skateboard','hover'] as const)('lets a %s push dynamic furniture while fixed walls still stop it',mode=>{
  const f=fixture([{id:'prop',position:[0,1.5,6],size:[1.2,3,.6],rigidGroup:{id:'prop',massKg:8}},{id:'wall',position:[0,3,18],size:[30,6,.5]}]);
  const {wheelPhysics,...controllerSpec}=spec;f.v=createVehicle({...controllerSpec,mode});
  try{for(let n=0;n<360;n++){f.q.syncActorBodies([{id:"controller-proxy",actorId:f.v.spec.id,physical:true,position:f.v.position,rotation:f.v.rotation,body:spec.envelope}]);run(f,1,{...emptyInput(),forward:1});}expect(f.q.colliderForId('prop')!.translation().z).toBeGreaterThan(7);expect(f.v.position.z).toBeGreaterThan(6);expect(f.v.position.z).toBeLessThan(16);expect(f.q.colliderForId('wall')!.translation().z).toBe(18);}
  finally{f.q.dispose();}
 });
 it('pushes a light compound prop as one rigid body and resets it without moving fixed scenery',()=>{
  const group={id:'chair',massKg:8},f=fixture([{id:'seat',position:[0,.5,6],size:[.8,.15,.7],rigidGroup:group},{id:'back',position:[0,.9,6.3],size:[.8,.8,.1],rigidGroup:group}]);
  try{const seat=f.q.colliderForId('seat')!,back=f.q.colliderForId('back')!,body=seat.parent()!;expect(body.isDynamic()).toBe(true);expect(body.handle).toBe(back.parent()!.handle);expect(body.mass()).toBeCloseTo(8);const origin=body.translation(),spacing=new Vector3().copy(seat.translation()).distanceTo(new Vector3().copy(back.translation()));
   for(let n=0;n<180;n++){f.q.syncActorBodies([{id:'car-proxy',actorId:'car',physical:true,position:f.v.position,rotation:f.v.rotation,body:spec.envelope!}]);run(f,1,{...emptyInput(),forward:1});}expect(new Vector3().copy(body.translation()).distanceTo(new Vector3().copy(origin))).toBeGreaterThan(2);expect(new Vector3().copy(seat.translation()).distanceTo(new Vector3().copy(back.translation()))).toBeCloseTo(spacing,4);expect(f.q.colliderForId('floor')!.translation().y).toBe(-.5);
   f.q.resetRigidGroups();expect(body.translation()).toEqual(origin);expect(body.linvel()).toEqual({x:0,y:0,z:0});
  }finally{f.q.dispose();}
 });
 it('brakes after landing on the compression stops of a short-travel suspension',()=>{
  const f=fixture();f.v=createVehicle({...spec,wheelPhysics:{...spec.wheelPhysics!,maxRaise:.025,maxDrop:.025}});
  try{f.v.position.y=3;f.v.velocity.set(0,-3,12);let bottomed=false;
   for(let n=0;n<300;n++){run(f,1,{...emptyInput(),brake:true});bottomed ||= f.v.motion.wheelPhysics!.wheels.some(w=>w.contact&&w.length<=.225001);}
   expect(bottomed).toBe(true);expect(f.v.speed).toBeLessThan(.2);expect(Math.abs(f.v.position.y)).toBeLessThan(.05);expect(new Vector3(0,1,0).applyQuaternion(f.v.rotation).y).toBeGreaterThan(.999);
  }finally{f.q.dispose();}
 });
 it('does not trip a short-travel racer over successive low wheel obstacles',()=>{
  const f=fixture([{id:'left',position:[-1.1,.06,5],size:[.9,.12,1.1]},{id:'right',position:[1.1,.06,11],size:[.9,.12,1.1]},{id:'axle',position:[0,.075,17],size:[3.2,.15,1.1]}]);
  f.v=createVehicle({...spec,wheelPhysics:{...spec.wheelPhysics!,mass:1250,radius:.39,hubHeight:.39,maxRaise:.06,maxDrop:.07,wheelWidth:.32}});
  try{let maxHeight=0;for(let n=0;n<300;n++){run(f,1,{...emptyInput(),forward:1});maxHeight=Math.max(maxHeight,f.v.position.y);}expect(maxHeight).toBeLessThan(.45);expect(f.v.position.z).toBeGreaterThan(20);expect(new Vector3(0,1,0).applyQuaternion(f.v.rotation).y).toBeGreaterThan(.9);}
  finally{f.q.dispose();}
 });
 it('detects a low obstacle with the tyre footprint before the axle ray reaches its edge',()=>{
  const f=fixture([{id:'brick',position:[0,.06,.4],size:[.4,.12,.3]}]);try{
   const origin=new Vector3(0,.77,0),down=new Vector3(0,-1,0),rotation=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2);
   const ray=f.q.raycast(origin,down,1)!,sweep=f.q.wheelSweep(origin,rotation,down,.52,.4,.35)!;
   expect(ray.distance-.52).toBeCloseTo(.25,4);expect(sweep.distance).toBeLessThan(.23);expect(sweep.normal.y).toBeGreaterThan(.7);
  }finally{f.q.dispose();}
 });
 it('limits wheel travel and transfers a raised obstacle to chassis motion',()=>{
  const f=fixture([{id:'bar',position:[0,.15,5],size:[8,.3,1]}]);try{
   let maxHeight=0;for(let n=0;n<240;n++){run(f,1,{...emptyInput(),forward:1});maxHeight=Math.max(maxHeight,f.v.position.y);for(const w of f.v.motion.wheelPhysics!.wheels){expect(w.length).toBeGreaterThanOrEqual(.15-1e-6);expect(w.length).toBeLessThanOrEqual(.35+1e-6);}}
   // 车身抬升须超过悬架单侧上压行程，但不要求旧阻尼产生额外弹跳。
   expect(maxHeight).toBeGreaterThan(.1);expect(maxHeight).toBeLessThan(.45);expect(f.v.position.z).toBeGreaterThan(7);expect(f.v.position.toArray().every(Number.isFinite)).toBe(true);
  }finally{f.q.dispose();}
 });
 it('moves off a split-height ledge and remains supported after recovery',()=>{
  const q=new EnvironmentQueries({...map,boxes:[...map.boxes,{id:'ledge',position:[3,.35,0],size:[6,.7,30]}],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[100,100],color:'#fff',modes:['wheeled']}]});
  const sim=new Simulation(q,[spec],{id:'player'});try{sim.controlledActor.vehicleIndex=0;sim.controlledActor.controller.setMounted(true);const v=sim.controlledActor.vehicle!;
   v.position.set(-.2,.1,0);v.rotation.setFromAxisAngle(new Vector3(0,0,1),.3);
   expect(sim.controlledActor.recoverVehicle()).toBe(true);expect(sim.controlledActor.message).toContain('附近安全地面');expect(v.position.x).toBeLessThan(-1.6);
   for(let n=0;n<180;n++)sim.step(1/60,new Map([['player',{input:{...emptyInput(),brake:true},yaw:0}]]));
   expect(v.motion.wheelPhysics!.wheels.every(w=>w.contact)).toBe(true);expect(Math.abs(v.roll)).toBeLessThan(.01);
   const before=v.position.clone();for(let n=0;n<120;n++)sim.step(1/60,new Map([['player',{input:{...emptyInput(),forward:1},yaw:0}]]));expect(v.position.distanceTo(before)).toBeGreaterThan(3);
  }finally{sim.dispose();q.dispose();}
 });
 it.each([90,180,270])('recovers a %s degree rollover in place and can drive again',degrees=>{
  const q=new EnvironmentQueries({...map,regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[100,100],color:'#fff',modes:['wheeled']}]});
  const sim=new Simulation(q,[spec],{id:'player'});try{
   sim.controlledActor.vehicleIndex=0;sim.controlledActor.controller.setMounted(true);const v=sim.controlledActor.vehicle!;v.position.set(10,2,15);v.rotation.setFromAxisAngle(new Vector3(0,0,1),degrees*Math.PI/180);v.velocity.set(3,1,4);v.motion.wheelPhysics!.angularVelocity.set(2,1,3);
   const oldWheelState=v.motion.wheelPhysics;expect(sim.controlledActor.recoverVehicle()).toBe(true);expect(sim.controlledActor.vehicleIndex).toBe(0);
   expect(v.position.x).toBe(10);expect(v.position.z).toBe(15);expect(new Vector3(0,1,0).applyQuaternion(v.rotation).y).toBeCloseTo(1);
   expect(v.velocity.length()).toBe(0);expect(v.motion.wheelPhysics).not.toBe(oldWheelState);expect(v.motion.wheelPhysics!.angularVelocity.length()).toBe(0);
   for(let n=0;n<120;n++)sim.step(1/60,new Map([['player',{input:{...emptyInput(),forward:1},yaw:0}]]));expect(v.position.z).toBeGreaterThan(17);expect(v.grounded).toBe(true);
  }finally{sim.dispose();q.dispose();}
 });
 it('rejects recovery with no driver, no ground or blocked headroom without changing the car',()=>{
  const q=new EnvironmentQueries({...map,boxes:[...map.boxes,{id:'roof',position:[10,1.8,15],size:[30,.3,30]}]});const sim=new Simulation(q,[spec],{id:'player'});
  try{expect(sim.controlledActor.recoverVehicle()).toBe(false);sim.controlledActor.vehicleIndex=0;sim.controlledActor.controller.setMounted(true);const v=sim.controlledActor.vehicle!;v.position.set(0,20,0);expect(sim.controlledActor.recoverVehicle()).toBe(false);expect(v.position.y).toBe(20);
   v.position.set(10,.2,15);v.rotation.setFromAxisAngle(new Vector3(0,0,1),Math.PI/2);const before=v.rotation.clone();expect(sim.controlledActor.recoverVehicle()).toBe(false);expect(v.position.toArray()).toEqual([10,.2,15]);expect(v.rotation.equals(before)).toBe(true);
  }finally{sim.dispose();q.dispose();}
 });
 it.each([1,-1])('continues rotating after a fast nose contact (%s) and loses sliding speed',sign=>{
  const f=fixture();try{
   f.v.position.set(0,4.5,0);f.v.rotation.setFromAxisAngle(new Vector3(1,0,0),sign*80*Math.PI/180);
   f.v.motion.wheelPhysics!.angularVelocity.x=sign;f.v.velocity.set(0,-1,sign*8);
   let crossedVertical=false,maxSpeed=0;
   // 较低重心会改变翻滚后轮子重新接地的时刻；允许自然滑行收敛，随后仍单独验证制动。
   for(let n=0;n<1200;n++){run(f,1);const up=new Vector3(0,1,0).applyQuaternion(f.v.rotation);crossedVertical ||= up.y<0;maxSpeed=Math.max(maxSpeed,f.v.speed);}
   expect(crossedVertical).toBe(true);expect(maxSpeed).toBeLessThan(20);expect(f.v.speed).toBeLessThan(.5);run(f,180,{...emptyInput(),brake:true});expect(f.v.speed).toBeLessThan(.1);
   expect(Math.abs(new Vector3(0,1,0).applyQuaternion(f.v.rotation).y)).toBeGreaterThan(.9);
  }finally{f.q.dispose();}
 });
 it('uses vehicle gravity and does not advance a paused world',()=>{const f=fixture();try{
  f.v.position.y=100;run(f,15);expect(f.v.velocity.y).toBeCloseTo(-9.81*.25,3);
  const position=f.v.position.clone(),rotation=f.v.rotation.clone();f.q.stepPhysics(0);
  expect(f.v.position.equals(position)).toBe(true);expect(f.v.rotation.equals(rotation)).toBe(true);
 }finally{f.q.dispose();}});
 it('shares collision impulses between two dynamic chassis and releases old reset bodies',()=>{
  const f=fixture(),other=createVehicle({...spec,id:'other'});other.position.z=7;f.v.velocity.z=12;
  try{for(let n=0;n<60;n++){stepVehicle(f.v,emptyInput(),1/60,0,f.q);stepVehicle(other,emptyInput(),1/60,0,f.q);f.q.stepPhysics(1/60);}
   expect(other.position.z).toBeGreaterThan(7.2);expect(f.v.position.z).toBeLessThan(other.position.z-2);
   f.q.releaseVehicleRig('car');const position=f.v.position.clone();for(let n=0;n<10;n++)f.q.stepPhysics(1/60);expect(f.v.position.equals(position)).toBe(true);
   Object.assign(f.v,createVehicle(spec));run(f,60);expect(f.v.position.y).toBeCloseTo(0,1);
  }finally{f.q.dispose();}
 });
 it.each([['x',40],['x',-40],['x',55],['x',-55],['x',70],['x',-70],['z',40],['z',-40],['z',55],['z',-55]] as const)('settles after chassis-first landing around %s at %s degrees',(axis,degrees)=>{
  const f=fixture();try{f.v.position.y=4.5;f.v.rotation.setFromAxisAngle(axis==='x'?new Vector3(1,0,0):new Vector3(0,0,1),degrees*Math.PI/180);run(f,600);run(f,240,{...emptyInput(),brake:true});
   expect(new Vector3(0,1,0).applyQuaternion(f.v.rotation).y).toBeGreaterThan(.999);expect(f.v.motion.wheelPhysics!.wheels.every(w=>w.contact)).toBe(true);expect(f.v.speed).toBeLessThan(.1);expect(f.v.motion.wheelPhysics!.angularVelocity.length()).toBeLessThan(.02);
  }finally{f.q.dispose();}
 });
 it('does not level the chassis in mid-air or forcibly unflip a roof landing',()=>{const f=fixture();try{
  f.v.position.y=10;f.v.rotation.setFromAxisAngle(new Vector3(0,0,1),.7);const initial=f.v.rotation.clone();run(f,10);expect(f.v.rotation.angleTo(initial)).toBeLessThan(1e-6);
  f.v.position.y=5;f.v.velocity.set(0,0,0);f.v.rotation.setFromAxisAngle(new Vector3(0,0,1),Math.PI);run(f,300);expect(new Vector3(0,1,0).applyQuaternion(f.v.rotation).y).toBeLessThan(-.9);expect(f.v.position.y).toBeGreaterThan(2);expect(f.v.position.toArray().every(Number.isFinite)).toBe(true);
 }finally{f.q.dispose();}});
 it('returns world-space chassis contact points on the ground',()=>{const f=fixture();try{
  const result=f.q.move(new Vector3(0,2,0),new Vector3(0,-4,0),{kind:'box',halfExtents:[1,.5,1],offset:[0,0,0]});expect(result.contacts!.length).toBeGreaterThan(0);for(const contact of result.contacts!){expect(Math.abs(contact.point.y)).toBeLessThan(.01);expect(contact.normal.y).toBeGreaterThan(.99);}
 }finally{f.q.dispose();}});
 it('shifts from wheel feedback and resets all drivetrain state',()=>{const f=fixture();try{
  let interrupted=false,maxGear=1;for(let n=0;n<480;n++){run(f,1,{...emptyInput(),forward:1});const p=f.v.motion.wheelPhysics!.powertrain;maxGear=Math.max(maxGear,p.gear);if(p.shiftRemaining>0){interrupted=true;expect(p.axleTorque).toBe(0);}}
  expect(maxGear).toBeGreaterThanOrEqual(2);expect(interrupted).toBe(true);expect(f.v.speed).toBeGreaterThan(15);
  run(f,360,{...emptyInput(),forward:-1});expect(f.v.motion.wheelPhysics!.powertrain.gear).toBe(-1);expect(f.v.velocity.z).toBeLessThan(-1);expect(f.v.speed).toBeLessThan(f.v.spec.reverseSpeed+.3);
  const reset=createVehicle(f.v.spec);expect(reset.motion.wheelPhysics!.powertrain).toMatchObject({rpm:850,gear:1,targetGear:1,shiftRemaining:0,axleTorque:0});
 }finally{f.q.dispose();}});
 it('climbs more slowly than flat ground and accelerates faster downhill under equal throttle',()=>{
  const grade=(angle:number)=>{const f={q:new EnvironmentQueries({...map,boxes:[{id:'grade',position:[0,-Math.cos(angle)*.15,Math.sin(angle)*.15],size:[40,.3,160],rotation:[-angle,0,0]}]}),v:createVehicle(spec)};f.v.rotation.setFromAxisAngle(new Vector3(1,0,0),-angle);return f;};
  const flat=grade(0),up=grade(.21),down=grade(-.21);
  try{for(const f of [flat,up,down]){run(f,120,{...emptyInput(),brake:true});run(f,180,{...emptyInput(),forward:1});}expect(up.v.speed).toBeLessThan(flat.v.speed*.85);expect(down.v.speed).toBeGreaterThan(flat.v.speed*1.1);expect(up.v.position.y).toBeGreaterThan(1);}
  finally{for(const f of [flat,up,down])f.q.dispose();}
 });
 it('rolls downhill without throttle and brakes on the slope',()=>{
  const a=.21,f={q:new EnvironmentQueries({...map,boxes:[{id:'grade',position:[0,-Math.cos(a)*.15,Math.sin(a)*.15],size:[40,.3,160],rotation:[-a,0,0]}]}),v:createVehicle(spec)};f.v.rotation.setFromAxisAngle(new Vector3(1,0,0),-a);
  try{run(f,120,{...emptyInput(),brake:true});run(f,180);expect(f.v.velocity.z).toBeLessThan(-.5);run(f,240,{...emptyInput(),brake:true});expect(f.v.speed).toBeLessThan(.2);}
  finally{f.q.dispose();}
 });
 it('reads road friction and produces less acceleration on a slippery surface',()=>{const a=fixture([],40),b=fixture([],40);try{b.q.colliderForId('floor')!.setFriction(.08);run(a,90,{...emptyInput(),forward:1});run(b,90,{...emptyInput(),forward:1});expect(a.v.position.z).toBeGreaterThan(b.v.position.z*2);}finally{a.q.dispose();b.q.dispose();}});
 it('interpolates wheel state at the body timestamp without mutating physics',()=>{const f=fixture();const sim=new Simulation(f.q,[spec],{id:'player'});try{const p=new PresentationState(sim);sim.vehicles[0]!.motion.wheelPhysics!.wheels[0]!.angle=2;sim.vehicles[0]!.motion.wheelPhysics!.wheels[0]!.length=.1;p.afterStep(sim);const middle=p.sample(.5,0,0,1);expect(middle.vehicles[0]!.wheels![0]!.angle).toBe(1);expect(middle.vehicles[0]!.wheels![0]!.length).toBeCloseTo(.175);p.sample(.9,0,0,1);expect(sim.vehicles[0]!.motion.wheelPhysics!.wheels[0]!.angle).toBe(2);}finally{sim.dispose();f.q.dispose();}});
 it('supports chassis weight, remains still and recreates clean wheel state on reset',()=>{const f=fixture();try{run(f,180);expect(f.v.position.y).toBeCloseTo(0,1);expect(f.v.velocity.length()).toBeLessThan(.05);expect(f.v.motion.wheelPhysics!.wheels.every(w=>w.contact)).toBe(true);expect(f.v.motion.wheelPhysics!.wheels.reduce((s,w)=>s+w.load,0)).toBeCloseTo(1600*9.81,0);const clean=createVehicle(spec);expect(clean.motion.wheelPhysics!.wheels.every(w=>w.angle===0)).toBe(true);}finally{f.q.dispose();}});
 it('drives using tyre forces, steers left and brakes without reversing',()=>{const f=fixture();try{run(f,120,{...emptyInput(),forward:1});expect(f.v.position.z).toBeGreaterThan(5);expect(f.v.speed).toBeGreaterThan(5);run(f,90,{...emptyInput(),forward:1,steer:1});expect(f.v.yaw).toBeLessThan(-.1);expect(f.v.position.x).toBeLessThan(-1);run(f,240,{...emptyInput(),brake:true});expect(f.v.speed).toBeLessThan(.5);expect(f.v.position.toArray().every(Number.isFinite)).toBe(true);}finally{f.q.dispose();}});
 it('compresses one side independently on a raised wheel contact',()=>{const f=fixture([{id:'bump',position:[-1.1,.06,1.27],size:[.6,.12,.6]}]);try{run(f,1);const w=f.v.motion.wheelPhysics!.wheels;expect(w[1]!.length).toBeLessThan(w[3]!.length-.05);expect(w[1]!.load).toBeGreaterThan(w[3]!.load);run(f,60);expect(Math.abs(f.v.roll)).toBeGreaterThan(.005);}finally{f.q.dispose();}});
 it('has no tyre drive in air, falls and settles after landing',()=>{const f=fixture();try{f.v.position.y=3;run(f,8,{...emptyInput(),forward:1});expect(f.v.motion.wheelPhysics!.wheels.every(w=>!w.contact&&w.force===0)).toBe(true);expect(f.v.velocity.z).toBeCloseTo(0);expect(f.v.velocity.y).toBeLessThan(0);expect(f.v.motion.wheelPhysics!.wheels[0]!.omega).toBeGreaterThan(0);run(f,240);expect(f.v.grounded).toBe(true);expect(Math.abs(f.v.position.y)).toBeLessThan(.1);}finally{f.q.dispose();}});
 it('cannot drive through a wall',()=>{const f=fixture([{id:'wall',position:[0,2,9],size:[15,4,.3]}]);try{run(f,240,{...emptyInput(),forward:1});expect(f.v.position.z).toBeLessThan(6.8);}finally{f.q.dispose();}});
 it('renders the supplied suspension and wheel angle without integrating a second clock',()=>{const steering=new Group(),spin=new Group();const visual={wheelRigs:[{steering,spin,radius:.52}],steering:[steering]};const pose={position:new Vector3(),rotation:new Quaternion(),steering:0,wheels:[{length:.15,angle:4.2,steer:.2}]};for(const dt of [0,.016,.1,0])updateVehicleWheels(visual,pose,{grounded:true,dt,revision:0});expect(spin.rotation.x).toBe(4.2);expect(steering.position.y).toBeCloseTo(.62);expect(steering.rotation.y).toBe(.2);});
});


describe('model-free road vehicle configurations',()=>{
 it.each(['car','motorcycle'] as const)('creates independent %s configurations that drive without a model asset',kind=>{
  const selected=publicHumanoid.createRoadVehicleSpec(kind);
  expect(selected.mode).toBe(kind==='car'?'wheeled':'motorcycle');
  expect(selected.archetype).toBe(kind==='car'?'rover':'motorcycle');
  expect(selected.wheelPhysics.wheels).toHaveLength(kind==='car'?4:2);
  expect(selected.wheelPhysics.powertrain.torqueCurve.length).toBeGreaterThan(1);
  expect(selected.brakeDrift).not.toBe(true);
  const f=fixture();f.v=createVehicle(selected);
  try{run(f,180);expect(f.v.motion.wheelPhysics!.wheels.some(w=>w.contact&&w.load>0)).toBe(true);
   run(f,180,{...emptyInput(),forward:1});expect(f.v.position.z).toBeGreaterThan(2);expect(f.v.speed).toBeGreaterThan(2);
  }finally{f.q.dispose();}
  selected.wheelPhysics.wheels[0]!.x=999;selected.seat[1]=999;
  const next=publicHumanoid.createRoadVehicleSpec(kind);
  expect(next.wheelPhysics.wheels[0]!.x).not.toBe(999);expect(next.seat[1]).not.toBe(999);
 });
 it('rejects an unknown handling family instead of silently selecting a car',()=>{
  expect(()=>publicHumanoid.createRoadVehicleSpec('boat' as 'car')).toThrow('VEHICLE_ROAD_KIND_INVALID');
 });
});


describe('opt-in training car response',()=>{
 it.each(['rover','racer','trail-rover','supercar','kart'])('coasts to rest, stays stopped and drives again: %s',id=>{
  const f=fixture([],4000);f.v=createVehicle({...structuredClone(playgroundVehicles.find(v=>v.id===id)!),spawn:[0,.04,0],yaw:0});
  try{
   run(f,120);let frames=0;
   while(f.v.velocity.z<60/3.6&&frames++<1800)run(f,1,{...emptyInput(),forward:1});
   expect(f.v.velocity.z).toBeGreaterThanOrEqual(60/3.6);
   let stopFrame=0,slowFrame=0;
   for(let n=1;n<=900;n++){run(f,1);expect(f.v.velocity.z).toBeGreaterThan(-.02);if(!slowFrame&&f.v.speed<5/3.6)slowFrame=n;if(f.v.speed<.1){stopFrame=n;break;}}
   expect(stopFrame/60).toBeGreaterThan(6);expect(stopFrame/60).toBeLessThan(12);
   expect((stopFrame-slowFrame)/60).toBeLessThan(2);
   run(f,120);const parked=f.v.position.clone();run(f,180);expect(f.v.position.distanceTo(parked)).toBeLessThan(.02);
   run(f,120,{...emptyInput(),forward:1});expect(f.v.velocity.z).toBeGreaterThan(5);
  }finally{f.q.dispose();}
 });
 it('coasts in reverse without changing direction or preventing the next W input',()=>{
  const f=fixture();f.v=createVehicle({...structuredClone(playgroundVehicles.find(v=>v.id==='rover')!),spawn:[0,.04,0],yaw:0});
  try{run(f,120);run(f,240,{...emptyInput(),forward:-1});expect(f.v.velocity.z).toBeLessThan(-2);
   for(let n=0;n<600;n++){run(f,1);expect(f.v.velocity.z).toBeLessThan(.02);}
   expect(f.v.speed).toBeLessThan(.1);run(f,180,{...emptyInput(),forward:1});expect(f.v.velocity.z).toBeGreaterThan(5);
  }finally{f.q.dispose();}
 });
 it.each(['throttle','S','Space','air'] as const)('does not add braking during %s',mode=>{
  const a=fixture([],4000),b=fixture([],4000);
  const selected=structuredClone(playgroundVehicles.find(v=>v.id==='rover')!);
  a.v=createVehicle({...selected,spawn:[0,.04,0],yaw:0});
  const disabled=structuredClone(selected);disabled.wheelPhysics!.coastBrakeDeceleration=0;b.v=createVehicle({...disabled,spawn:[0,.04,0],yaw:0});
  try{
   for(const f of [a,b]){run(f,120);run(f,180,{...emptyInput(),forward:1});if(mode==='air')f.v.position.y=40;
    run(f,60,{...emptyInput(),forward:mode==='throttle'?1:mode==='S'?-1:0,brake:mode==='Space'});}
   expect(a.v.position.distanceTo(b.v.position)).toBeLessThan(1e-6);expect(a.v.velocity.distanceTo(b.v.velocity)).toBeLessThan(1e-6);
  }finally{a.q.dispose();b.q.dispose();}
 });
 it.each([-1,6,NaN,Infinity])('rejects invalid coast deceleration %s',value=>{
  expect(()=>createRoadPhysicsProfile('car',{coastBrakeDeceleration:value})).toThrow('VEHICLE_WHEEL_CONFIG_INVALID:coastBrakeDeceleration');
 });
 it('leaves other presets and model-free defaults opted out',()=>{
  for(const v of playgroundVehicles.filter(v=>!['rover','racer','trail-rover','supercar','kart'].includes(v.id)))expect(v.wheelPhysics?.coastBrakeDeceleration).toBeUndefined();
  for(const kind of ['car','motorcycle'] as const)expect(publicHumanoid.createRoadVehicleSpec(kind).wheelPhysics.coastBrakeDeceleration).toBeUndefined();
 });
});
