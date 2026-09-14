import {getMap} from '@worldkit/preset-content/environment/maps';
import {createWorld} from '../world';
import type {WorldEngine} from '../engine';
import {beforeAll,it,expect,vi} from 'vitest';
import {Euler,Quaternion,Vector3,Group,Mesh,BoxGeometry,MeshStandardMaterial,PerspectiveCamera} from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {SPECS} from '@worldkit/preset-content/config';
import {buildBusModel} from '@worldkit/preset-content/bus-model';
import {EnvironmentQueries,initEnvironmentQueries,vehicleBody} from './environment/queries';
import type {EnvironmentDefinition} from './environment/types';
import {Simulation,createVehicle,stepVehicle,emptyInput,type Input} from './simulation';
import {VehicleCameraQueries} from './vehicle-camera-queries';
import cameraPresets from '@worldkit/preset-content/cameras/presets.json';
import {CameraController} from '../camera/controller';
import {parseCameraDocument} from '../config/camera/index';
import type {CameraSubjectFacts} from '../camera/subject';
import {probeHumanoidCamera} from './camera-queries';
import {readControls} from './input';
import {advancePaddleStroke,kayakPaddlePose,paddleBlade,paddleRiderBody} from './motion-families/surface-vessel/paddling';
const flat:EnvironmentDefinition={id:'regression',name:'Regression',description:'',bounds:{min:[-150,-30,-150],max:[150,200,150]},boxes:[{id:'floor',position:[0,-.5,0],size:[300,1,300]}],water:[],regions:[],spawns:[],playerSpawn:[100,0,100]};
const pool:EnvironmentDefinition={...flat,boxes:[{id:'bottom',position:[0,-20,0],size:[300,1,300]}],water:[{id:'water',min:[-149,-20,-149],max:[149,0,149],surface:0}]};
function fixture(id:string,map=flat,yaw=0){const q=new EnvironmentQueries(structuredClone(map)),v=createVehicle({...SPECS.find(s=>s.id===id)!,spawn:[0,.2,0],yaw});let time=0;return {q,v,run:(frames:number,input:Partial<Input>={})=>{for(let n=0;n<frames;n++){stepVehicle(v,{...emptyInput(),...input},1/60,time,q);q.stepPhysics(1/60);time+=1/60;}}};}
function cameraSubject(v:ReturnType<typeof createVehicle>):CameraSubjectFacts {
 const rotation=v.rotation.clone().normalize(),seat=new Vector3(...v.spec.seat).applyQuaternion(rotation).add(v.position);
 return {id:v.spec.id,generation:1,kind:'vehicle',positionWorldMetersXYZ:v.position.toArray(),geometryQuaternionWorldXYZW:rotation.toArray(),geometryScaleXYZ:[1,1,1],semanticQuaternionWorldXYZW:rotation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI)).toArray(),speedMetersPerSecond:v.velocity.length(),body:{minimumHeightMeters:v.spec.envelope.offset[1]-v.spec.envelope.halfExtents[1],maximumHeightMeters:v.spec.envelope.offset[1]+v.spec.envelope.halfExtents[1]},seatWorldMetersXYZ:seat.toArray(),eyeWorldMetersXYZ:seat.clone().add(new Vector3(0,.72,.08).applyQuaternion(rotation)).toArray(),...(v.motion.aircraft?{continuousHeadingSeedRadians:v.yaw+Math.PI}:{})};
}
function cameraController(v:ReturnType<typeof createVehicle>,q:EnvironmentQueries){
 const filter=q.cameraFilter(new Set([v.spec.id]));
 return new CameraController({sampleSubject:()=>cameraSubject(v),geometry:()=>({probe:(from,to,radius)=>probeHumanoidCamera(q.borrowPhysics().world,from,to,radius,undefined,filter)})});
}
beforeAll(initEnvironmentQueries);
it('rover pushes the empty rescue hovercraft, backs away and collides again',()=>{
 const specs=['rover','rescue-hovercraft'].map(id=>SPECS.find(s=>s.id===id)!),map=structuredClone(flat);
 map.regions=[{id:'test',name:'Test',description:'',center:[0,0,0],size:[300,300],color:'#ccc',modes:['wheeled','hover']}];
 map.spawns=specs.map((s,n)=>({id:s.id,name:s.name,vehicleId:s.id,regionId:'test',position:[0,n?1.3:0,n?8:0],yaw:0}));
 const q=new EnvironmentQueries(map),sim=new Simulation(q,specs,{id:'driver',position:new Vector3(50,2,50)}),actor=sim.controlledActor;
 const car=sim.vehicles.find(v=>v.spec.id==='rover')!,hover=sim.vehicles.find(v=>v.spec.id==='rescue-hovercraft')!;
 const run=(frames:number,forward=0)=>{for(let n=0;n<frames;n++)sim.step(1/60,new Map([['driver',{input:{...emptyInput(),forward},yaw:0}]]));};
 try{
  actor.vehicleIndex=sim.vehicles.indexOf(car);actor.controller.setMounted(true);actor.transition=0;
  run(180);const start=hover.position.clone();
  expect(Math.abs(start.y-1.3)).toBeLessThan(.03);
  const world=q.borrowPhysics().world,created=vi.spyOn(world,'createRigidBody');
  try{
   run(150,1);expect(hover.position.z-start.z,'first vehicle impact').toBeGreaterThan(.25);
   const carZ=car.position.z;run(180,-1);expect(car.position.z-carZ,'reverse away').toBeLessThan(-1);
   run(120);const second=hover.position.z;
   run(360,1);expect(hover.position.z-second,'second vehicle impact').toBeGreaterThan(.25);
   expect(created).not.toHaveBeenCalled();
   expect(Math.abs(hover.position.y-1.3)).toBeLessThan(.5);
  }finally{created.mockRestore();}
 }finally{sim.dispose();q.dispose();}
});
it.each([false,true])('empty hovercraft holds height without horizontal propulsion, water=%s',water=>{
 const spec=SPECS.find(s=>s.id==='rescue-hovercraft')!,map=structuredClone(water?pool:flat);
 map.regions=[{id:'test',name:'Test',description:'',center:[0,0,0],size:[300,300],color:'#ccc',modes:['hover']}];
 map.spawns=[{id:spec.id,name:spec.name,vehicleId:spec.id,regionId:'test',position:[0,1.3,0],yaw:.7}];
 const q=new EnvironmentQueries(map),sim=new Simulation(q,[spec]);
 try{for(let n=0;n<1200;n++)sim.step(1/60);const v=sim.vehicles[0]!;expect(Math.abs(v.position.y-1.3)).toBeLessThan(.03);expect(Math.hypot(v.position.x,v.position.z)).toBeLessThan(.001);expect(v.velocity.length()).toBeLessThan(.03);}
 finally{sim.dispose();q.dispose();}
});
it.each(['horse','boat','submarine','patrol-boat','plane','glider','spacecraft','trainer-plane','hovercraft','rescue-hovercraft'])('%s remains a movable native body without a rider',id=>{
 const spec=SPECS.find(s=>s.id===id)!,water=['boat','submarine','patrol-boat'].includes(id),map=structuredClone(water?pool:flat);
 map.regions=[{id:'test',name:'Test',description:'',center:[0,0,0],size:[300,300],color:'#ccc',modes:[spec.mode]}];
 map.spawns=[{id:'vehicle',name:'Vehicle',vehicleId:id,regionId:'test',position:[0,water?(id==='submarine'?-3:.1):.1,0],yaw:0}];
 const q=new EnvironmentQueries(map),sim=new Simulation(q,[spec]);
 try{
  for(let n=0;n<120;n++)sim.step(1/60);
  const bodies:RAPIER.RigidBody[]=[];q.borrowPhysics().world.forEachRigidBody(b=>{if(b.isDynamic())bodies.push(b);});
  expect(bodies,id+': no unoccupied dynamic body').toHaveLength(1);
  const body=bodies[0]!,v=sim.vehicles[0]!,start=v.position.clone(),handle=body.handle;
  const striker=q.borrowPhysics().world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x-spec.envelope.halfExtents[0]-2,start.y+spec.envelope.offset[1],start.z).setGravityScale(0).setLinvel(8,0,0).setCcdEnabled(true));
  q.borrowPhysics().world.createCollider(RAPIER.ColliderDesc.ball(.7).setMass(body.mass()*2).setCollisionGroups(0x00020013),striker);
  for(let n=0;n<60;n++)sim.step(1/60);
  expect(v.position.x-start.x,id+': collision did not move the vehicle').toBeGreaterThan(.03);
  expect(q.borrowPhysics().world.getRigidBody(handle).handle).toBe(handle);
  expect(v.position.distanceTo(new Vector3().copy(body.translation()))).toBeLessThan(.001);
 }finally{sim.dispose();q.dispose();}
});
it.each(['boat','patrol-boat'])('%s turns in place with A/D without creating propulsion, and retains moving rudder direction',id=>{
 for(const key of ['KeyA','KeyD'])for(const travel of ['stationary','forward','reverse']){
  const f=fixture(id,pool),direction=key==='KeyA'?1:-1;
  try{
   f.run(60);
   const keys=new Set([key,...(travel==='forward'?['KeyW']:travel==='reverse'?['KeyS']:[])]);
   const input=readControls(keys,true,false,{},undefined,'boat');
   const yaw=f.v.yaw,position=f.v.position.clone();f.run(120,input);
   expect((f.v.yaw-yaw)*direction*(travel==='reverse'?-1:1),key+':'+travel).toBeGreaterThan(.4);
   if(travel==='stationary'){
    expect(Math.hypot(f.v.position.x-position.x,f.v.position.z-position.z)).toBeLessThan(1e-6);
    expect(Math.hypot(f.v.velocity.x,f.v.velocity.z)).toBeLessThan(1e-6);
    f.run(120);const releasedYaw=f.v.yaw;f.run(60);expect(Math.abs(f.v.yaw-releasedYaw)).toBeLessThan(.001);
   }else expect(Math.hypot(f.v.position.x-position.x,f.v.position.z-position.z)).toBeGreaterThan(1);
  }finally{f.q.dispose();}
 }
});
it.each(['horse','boat','patrol-boat','submarine','hovercraft','rescue-hovercraft'])('%s accepts repeated collisions, wakes again, and stays pushable after mounting',id=>{
 const spec=SPECS.find(s=>s.id===id)!,map=structuredClone(['boat','patrol-boat','submarine'].includes(id)?pool:flat);
 map.regions=[{id:'test',name:'Test',description:'',center:[0,0,0],size:[300,300],color:'#ccc',modes:[spec.mode]}];
 map.spawns=[{id:'vehicle',name:'Vehicle',vehicleId:id,regionId:'test',position:[0,id==='submarine'?-3:.1,0],yaw:0}];
 const q=new EnvironmentQueries(map),sim=new Simulation(q,[spec]),v=sim.vehicles[0]!;
 const run=(n:number)=>{for(let i=0;i<n;i++)sim.step(1/60);};
 const native=()=>{let found:RAPIER.RigidBody|undefined;q.borrowPhysics().world.forEachRigidBody(b=>{if(b.isDynamic())found=b;});return found!;};
 const strike=(continuous=false)=>{
  const target=native(),start=v.position.x,center=target.collider(0).translation(),handle=target.handle;
  target.sleep();
  const p=q.borrowPhysics().world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(center.x-spec.envelope.halfExtents[0]-2,center.y,center.z).setGravityScale(0).setLinvel(8,0,0).setCcdEnabled(true));
  q.borrowPhysics().world.createCollider(RAPIER.ColliderDesc.ball(.8).setMass(target.mass()*2).setCollisionGroups(0x00020013),p);
  let first=0;
  for(let n=0;n<(continuous?240:90);n++){if(continuous)p.setLinvel({x:3,y:0,z:0},true);run(1);if(n===90)first=v.position.x;}
  expect(v.position.x-start,id+': subsequent collision').toBeGreaterThan(.03);
  if(continuous)expect(v.position.x-first,id+': sustained push').toBeGreaterThan(.05);
  expect(q.borrowPhysics().world.getRigidBody(handle).handle).toBe(handle);q.borrowPhysics().world.removeRigidBody(p);run(90);
 };
 try{
  run(180);strike();strike();strike();strike(true);
  // 空载转为驾驶时移交原控制器；下车后再建立空载实体，不留下重叠碰撞壳。
  const actor=sim.addActor('driver',new Vector3(50,2,50));
  actor.vehicleIndex=0;actor.controller.setMounted(true);actor.transition=0;run(1);
  let count=0;q.borrowPhysics().world.forEachRigidBody(b=>{if(b.isDynamic())count++;});expect(count).toBe(0);
  actor.controller.commitDismount(new Vector3(50,2,50),0,new Vector3());actor.vehicleIndex=-1;run(1);
  count=0;q.borrowPhysics().world.forEachRigidBody(b=>{if(b.isDynamic())count++;});expect(count).toBe(1);
  strike();
 }finally{sim.dispose();q.dispose();}
});
it.each(['horse','boat','patrol-boat','submarine','hovercraft','rescue-hovercraft'])('%s hands off through public enter/exit and keeps idle rigid handles stable',id=>{
 const spec=SPECS.find(s=>s.id===id)!,map=structuredClone(['boat','patrol-boat','submarine'].includes(id)?pool:flat);
 map.regions=[{id:'test',name:'Test',description:'',center:[0,0,0],size:[300,300],color:'#ccc',modes:[spec.mode]}];
 map.spawns=[{id:'vehicle',name:'Vehicle',vehicleId:id,regionId:'test',position:[0,id==='submarine'?-3:.1,0],yaw:0}];
 const q=new EnvironmentQueries(map),sim=new Simulation(q,[spec],{id:'driver',position:new Vector3(50,2,50)}),actor=sim.controlledActor;
 const run=(n:number)=>{for(let i=0;i<n;i++)sim.step(1/60);};
 try{
  run(180);expect(actor.approach(id),actor.message).toBe(true);run(30);
  expect(actor.enter(id),actor.message).toBe(true);run(60);expect(actor.vehicle?.spec.id).toBe(id);
  expect(actor.exit(),actor.message).toBe(true);run(60);expect(actor.vehicle).toBeUndefined();
  const physics=q.borrowPhysics().world,create=vi.spyOn(physics,'createRigidBody');
  try{run(600);expect(create).not.toHaveBeenCalled();}finally{create.mockRestore();}
  let count=0;physics.forEachRigidBody(b=>{if(b.isDynamic())count++;});expect(count).toBe(1);
  sim.reset();run(2);count=0;physics.forEachRigidBody(b=>{if(b.isDynamic())count++;});expect(count).toBe(1);
 }finally{sim.dispose();q.dispose();}
});
it.each(['plane','trainer-plane','glider'])('%s does not rebuild rigid camera geometry during flight',id=>{
 const f=fixture(id),root=new Group(),mesh=new Mesh(new BoxGeometry(2,1,3),new MeshStandardMaterial());root.add(mesh);
 const query=new VehicleCameraQueries([{instanceId:id,object:root}]),spy=vi.spyOn(RAPIER.TriMesh.prototype,'intoRaw');
 try{for(let n=0;n<600;n++){f.run(1,{forward:-1,boost:true});root.position.copy(f.v.position);root.quaternion.copy(f.v.rotation);query.sync();}expect(f.v.position.y).toBeGreaterThan(2);expect(spy).toHaveBeenCalledTimes(2);expect(f.v.rotation.lengthSq()).toBeCloseTo(1,12);}
 finally{spy.mockRestore();query.dispose();mesh.geometry.dispose();mesh.material.dispose();f.q.dispose();}
});
it.each(['tank','sled','ski','unicycle','horse','skateboard'])('%s follows both cross slopes with real support',id=>{
 for(const sign of [-1,1]){const slope={...flat,boxes:[{id:'slope',position:[0,-.5,0] as const,size:[100,1,100] as const,rotation:[-sign*Math.PI/15,0,0] as const}]};const f=fixture(id,slope,Math.PI/2);
 try{f.v.position.y=1;f.run(240,{brake:true});const normal=f.q.support(f.v.position,3,.2)!.normal;expect(new Vector3(0,1,0).applyQuaternion(f.v.rotation).dot(normal)).toBeGreaterThan(.999);expect(f.v.grounded).toBe(true);}
 finally{f.q.dispose();}}
});
it('unicycle reverses away from a wall without requiring input release',()=>{
 const f=fixture('unicycle',{...flat,boxes:[...flat.boxes,{id:'wall',position:[0,2,5],size:[10,4,.5]}]});
 try{f.run(480,{forward:1});const z=f.v.position.z;expect(f.v.motion.unicycle!.blockedSeconds).toBeGreaterThan(.25);f.run(240,{forward:-1});expect(f.v.position.z).toBeLessThan(z-1);expect(f.v.velocity.z).toBeLessThan(-.5);}finally{f.q.dispose();}
});
it.each(['kayak','canoe','raft'])('%s occupied rider stops at a low ceiling and clears when unoccupied',id=>{
 const f=fixture(id,{...pool,boxes:[...pool.boxes,{id:'roof',position:[0,1.3,6],size:[200,.3,2]}]});
 try{f.v.motion.kayak!.riderMounted=true;f.run(240);f.v.position.z=4.6;f.v.velocity.z=2;
  for(let n=0;n<240;n++){f.run(1,{forward:1});expect(f.q.overlaps(f.v.position,paddleRiderBody(f.v.spec.seat),f.v.rotation)).toBe(false);}expect(f.v.position.z).toBeLessThan(5.1);
  const rig=f.q.vehicleRig(f.v.spec.id,f.v.motion.body!,f.v.position,f.v.rotation,1,1,1,1,1);expect(rig.colliders[1]!.isEnabled()).toBe(true);
  f.v.motion.kayak!.riderMounted=false;f.run(1);expect(rig.colliders[1]!.isEnabled()).toBe(false);
 }finally{f.q.dispose();}
});
it.each(['rover','racer','trail-rover'])('%s upper cabin stops before the suspended wall and can reverse',id=>{
 const f=fixture(id,{...flat,boxes:[...flat.boxes,{id:'wall',position:[0,2.1,15],size:[20,1.8,.5]}]});
 try{f.run(360,{forward:1});expect(f.v.position.z).toBeLessThan(13.9);const z=f.v.position.z;f.run(180,{forward:-1});expect(f.v.position.z).toBeLessThan(z-1);}finally{f.q.dispose();}
});
it('bus opaque geometry casts shadows but transparent windows do not',()=>{
 const bus=buildBusModel();let opaque=0;bus.root.traverse(node=>{if(node instanceof Mesh){const mats=Array.isArray(node.material)?node.material:[node.material];const solid=mats.every(m=>!m.transparent);if(solid){opaque++;expect(node.castShadow).toBe(true);expect(node.receiveShadow).toBe(true);}node.geometry.dispose();for(const m of mats)m.dispose();}});expect(opaque).toBeGreaterThan(80);
});
it('aircraft third and shoulder views remain continuous through a complete loop and mode switches',()=>{
 const f=fixture('plane'),controller=cameraController(f.v,f.q),identity=f.v.rotation.clone();
 const frame=(simulationTick:number)=>({lifecycleGeneration:0,simulationTick,aspect:1});
 try{
  f.v.position.y=40;f.v.velocity.z=25;
  // This regression explicitly requests an upright orbit in both named views.
  // Shoulder supports subject-up too; that configuration intentionally follows a loop.
  controller.install(parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',activation:'immediate',binding:{targetEntityId:f.v.spec.id},presets:cameraPresets,views:{'third-person':{kind:'third-person',presetId:'plane.third-person'},shoulder:{kind:'shoulder',presetId:'plane.shoulder',overrides:{orientation:{referenceFrame:'world-up'}}}}}),frame(0));
  let tick=0;
  for(const view of ['third-person','shoulder']){controller.setView(view,frame(tick));let prior:Vector3|undefined;
   for(let deg=0;deg<=360;deg++){
    f.v.rotation.setFromEuler(new Euler(-deg*Math.PI/180,0,0,'YXZ'));f.v.yaw=new Euler().setFromQuaternion(f.v.rotation,'YXZ').y;
    controller.prepareInput({},1/60,frame(++tick));controller.evaluateAndCommit(frame(tick));
    const pose=controller.inspect().current!,direction=new Vector3(0,0,-1).applyQuaternion(new Quaternion(...pose.quaternionWorldXYZW));
    if(prior)expect(direction.angleTo(prior)).toBeLessThan(.12);prior=direction;
    const yaw=controller.inspect().intent!.yawRadians-Math.PI;expect(Math.abs(Math.atan2(Math.sin(yaw),Math.cos(yaw)))).toBeLessThan(.01);
    expect(new Vector3(1,0,0).applyQuaternion(new Quaternion(...pose.quaternionWorldXYZW)).y).toBeCloseTo(0,8);
   }
  }
  expect(f.v.rotation.angleTo(identity)).toBeLessThan(1e-6);
 }finally{controller.dispose();f.q.dispose();}
});

it.each(['kayak','canoe','raft'])('%s retracts a paddle stroke at a solid bank instead of pushing through it',id=>{
 const f=fixture(id,pool);let bank:EnvironmentQueries|undefined;
 try{const k=f.v.motion.kayak!;f.v.position.set(0,0,0);Object.assign(k,{phase:.4,effort:1,side:-1,sideBlend:-1,reverse:1});
  const pose=kayakPaddlePose(k),blade=paddleBlade(k).applyQuaternion(pose.rotation).add(pose.position);
  bank=new EnvironmentQueries({...pool,boxes:[...pool.boxes,{id:'bank',position:blade.toArray() as [number,number,number],size:[.12,.12,.12]}]});
  advancePaddleStroke(f.v,{...emptyInput(),forward:1},1/60,bank,1.55);
  expect(k.blocked).toBe(true);expect(k.phase).toBe(.4);
  advancePaddleStroke(f.v,{...emptyInput(),forward:1},1/60,bank,1.55);expect(k.phase).toBeLessThan(.4);
  for(let n=0;n<45;n++)advancePaddleStroke(f.v,{...emptyInput(),forward:1},1/60,f.q,1.55);
  expect(k.blocked).toBe(false);expect(k.phase).toBeGreaterThan(.01);
 }finally{bank?.dispose();f.q.dispose();}
});

it.each([[5,5],[12,27],[22,49]])('horse crosses the %s degree ramp without launching the body or shaking the camera',async(degrees,x)=>{
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:structuredClone(getMap('campus')),character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:'horse',assetId:'horse',spec:SPECS.find(s=>s.id==='horse')!,object:new Group()}]}});
 try{
  const h=world.humanoid!;h.prepareEpisodeStart({positionWorldMetersXYZ:[x,.04,138],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'horse',mounted:true}});
  world.setCameraFollow({configuration:parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',activation:'immediate',binding:{targetEntityId:'person'},presets:cameraPresets,views:{'third-person':{kind:'third-person',presetId:'horse.third-person'}}})});
  const v=h.simulation.controlledActor.vehicle!;let previousY=v.position.y,previousCameraY=world.camera.position.y,maxRise=0,maxCameraRise=0,maxDrop=0,maxCameraDrop=0,frames=0;
  while(v.position.z<170&&frames++<900){
   world.step({humanoid:{...emptyInput(),forward:1}},1);
   expect(h.environment.overlaps(v.position,vehicleBody(v.spec),v.rotation)).toBe(false);
   maxRise=Math.max(maxRise,v.position.y-previousY);maxCameraRise=Math.max(maxCameraRise,world.camera.position.y-previousCameraY);
   maxDrop=Math.max(maxDrop,previousY-v.position.y);maxCameraDrop=Math.max(maxCameraDrop,previousCameraY-world.camera.position.y);
   previousY=v.position.y;previousCameraY=world.camera.position.y;
  }
  expect(v.position.z).toBeGreaterThan(170);expect(maxRise).toBeLessThan(.09);expect(maxCameraRise).toBeLessThan(.09);expect(maxDrop).toBeLessThan(.05);expect(maxCameraDrop).toBeLessThan(.05);
  world.step({humanoid:{...emptyInput(),brake:true}},90);const stopped=v.position.clone();
  world.step({humanoid:{...emptyInput(),brake:true}},120);expect(v.position.distanceTo(stopped)).toBeLessThan(.002);expect(v.grounded).toBe(true);
  world.step({humanoid:{...emptyInput(),forward:-1}},240);expect(v.position.z).toBeLessThan(stopped.z-1);
  let fallingFrames=0,minFallSpeed=0;frames=0;
  while(v.position.z<200&&frames++<1200){
   world.step({humanoid:{...emptyInput(),forward:1}},1);
   if(v.position.z>186&&!v.grounded){fallingFrames++;minFallSpeed=Math.min(minFallSpeed,v.velocity.y);}
  }
  expect(v.position.z).toBeGreaterThan(200);expect(fallingFrames).toBeGreaterThan(3);expect(minFallSpeed).toBeLessThan(-2);
  expect(degrees).toBeGreaterThan(0);
 }finally{world.dispose();}
});

it('horse gravity state stays per-instance and resets with the mount while carriage state is unchanged',()=>{
 const f=fixture('horse'),other=fixture('horse'),cart=fixture('carriage');
 try{
  f.v.position.y=8;f.v.grounded=false;f.run(30);expect(f.v.motion.creature!.mountFallSpeed).toBeLessThan(-5);expect(f.v.velocity.y).toBeLessThan(-5);
  other.run(60,{brake:true});cart.run(60,{brake:true});expect(other.v.motion.creature!.mountFallSpeed).toBe(0);expect(cart.v.motion.creature).not.toHaveProperty('mountFallSpeed');
  const fresh=createVehicle(f.v.spec);expect(fresh.motion.creature?.mountFallSpeed).toBeUndefined();
 }finally{f.q.dispose();other.q.dispose();cart.q.dispose();}
});


it.each([[0,.3],[Math.PI/2,.3],[0,.02],[Math.PI/2,.02]])('horse third-person view stays continuous at yaw %s and pitch %s during render interpolation',async(yaw,pitch)=>{
 const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:structuredClone(getMap('campus')),character:{instanceId:'person',object:new Group()},vehicles:[{instanceId:'horse',assetId:'horse',spec:SPECS.find(s=>s.id==='horse')!,object:new Group()}]}});
 try{
  const h=world.humanoid!,engine=(world as unknown as {engine:WorldEngine}).engine;
  h.prepareEpisodeStart({positionWorldMetersXYZ:[49,.04,138],facingYawRadians:Math.PI,humanoid:{vehicleInstanceId:'horse',mounted:true}});
  world.setCameraFollow({configuration:parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',activation:'immediate',binding:{targetEntityId:'person'},presets:cameraPresets,views:{'third-person':{kind:'third-person',presetId:'horse.third-person',overrides:{orientation:{initialPitchRadians:pitch,recenter:{enabled:false}}}}}})});
  const delta=Math.atan2(Math.sin(yaw+Math.PI-world.inspectCamera().intent!.yawRadians),Math.cos(yaw+Math.PI-world.inspectCamera().intent!.yawRadians));
  if(Math.abs(delta)>1e-9){const rate=world.inspectCamera().resolved!.input.orbitRateRadiansPerSecond,steps=Math.ceil(Math.abs(delta)*60/rate);world.step({cameraYawRatio:delta/(steps/60*rate)},steps);}
  expect(Math.atan2(Math.sin(world.inspectCamera().intent!.yawRadians-yaw-Math.PI),Math.cos(world.inspectCamera().intent!.yawRadians-yaw-Math.PI))).toBeCloseTo(0,8);
  // 先完成主动观察角度切换，再测上坡产生的非输入抖动。
  world.step({humanoid:emptyInput()},120);
  const samples:{y:number;rotation:Quaternion;tick:number;position:number[];diagnostics:unknown}[]=[];
  Object.defineProperty(engine,'renderer',{value:{render(){samples.push({y:world.camera.position.y,rotation:world.camera.quaternion.clone(),tick:world.simulationTick,position:world.camera.position.toArray(),diagnostics:world.inspectCamera().diagnostics});},dispose(){}}});
  for(let n=0;n<310;n++){
   world.step({humanoid:{...emptyInput(),forward:1}},1);
   engine.render(.5);engine.render(1);
  }
  let maxDrop=0,maxTurn=0,maxTurnIndex=0;
  for(let n=4;n<samples.length;n++){
   maxDrop=Math.max(maxDrop,samples[n-1]!.y-samples[n]!.y);
   const turn=samples[n-1]!.rotation.angleTo(samples[n]!.rotation);if(turn>maxTurn){maxTurn=turn;maxTurnIndex=n;}
  }
  expect(maxDrop).toBeLessThan(.025);expect(maxTurn,JSON.stringify(samples.slice(maxTurnIndex-2,maxTurnIndex+2))).toBeLessThan(.01);
  expect(h.simulation.controlledActor.vehicle!.position.z).toBeGreaterThan(165);
 }finally{world.dispose();}
});


it.each(['horse','rover','tank','motorcycle'])('%s camera retracts at a ramp edge and limits outward recovery independently of vehicle physics',id=>{
 const q=new EnvironmentQueries(structuredClone(getMap('campus'))),v=createVehicle(SPECS.find(s=>s.id===id)!);
 const controller=cameraController(v,q),frame=(simulationTick:number)=>({lifecycleGeneration:0,simulationTick,aspect:1});
 try{
  v.velocity.set(0,0,0);v.rotation.identity();v.yaw=0;v.position.set(49,4.6,157);
  controller.install(parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',activation:'immediate',binding:{targetEntityId:id},presets:cameraPresets,views:{'third-person':{kind:'third-person',presetId:id+'.third-person',overrides:{orientation:{initialPitchRadians:-.3,recenter:{enabled:false}}}}}}),frame(0));
  expect(controller.inspect().resolved!.values.constraints.recovery.speedLimit).toEqual({kind:'limited',maximumSpeedMetersPerSecond:6});
  let previousArm=0,maxRecovery=0,hit=false;
  for(let n=0;n<240;n++){
   // Identical known continuous path isolates camera recovery from chassis and gait.
   v.position.set(49,(11+n*.04)*Math.tan(22*Math.PI/180)+.15,157+n*.04);
   controller.prepareInput({orbitDeltaRadiansXY:[n===0?0:.035,0]},1/60,frame(n+1));controller.evaluateAndCommit(frame(n+1));
   const inspected=controller.inspect(),pose=inspected.current!;
   const arm=new Vector3(...pose.positionWorldMetersXYZ).distanceTo(new Vector3(...pose.pivotWorldMetersXYZ));
   if(hit&&n>30)maxRecovery=Math.max(maxRecovery,arm-previousArm);
   hit ||= inspected.diagnostics?.status==='measured'&&inspected.diagnostics.limited;previousArm=arm;
  }
  expect(hit).toBe(true);expect(maxRecovery).toBeLessThan(.101);
 }finally{controller.dispose();q.dispose();}
});
