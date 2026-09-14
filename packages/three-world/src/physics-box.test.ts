import RAPIER from '@dimforge/rapier3d-compat';
import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import {Box3,Group,Quaternion,Vector3} from 'three';
import {FixedBoxColliderFactory,contactColliderVolume} from './physics-box';
import {ThreePhysics} from './physics';
import {readNavigationGeometry} from './physics-navigation';
import {EnvironmentQueries,initEnvironmentQueries} from './humanoid-runtime/environment/queries';
import {HumanoidController} from './humanoid-runtime/humanoid/controller';
import {probeHumanoidCamera} from './humanoid-runtime/camera-queries';
import {CameraCollisionSolver} from '@worldkit/camera-collision';

beforeAll(initEnvironmentQueries);
afterEach(()=>vi.restoreAllMocks());
const rotation={x:0,y:0,z:0,w:1};
const ground=(side:number,fraction=0)=>({id:'precise-ground',name:'Ground',description:'',bounds:{min:[-1000,-10,-1000] as const,max:[1000,10,1000] as const},boxes:[{id:'floor',position:[0,-.5,0] as const,size:[side,1,side] as const}],water:[],spawns:[],regions:[],playerSpawn:[side*fraction,.03,side*fraction] as const});

const cameraContactCases=[0,90,1000,10000].flatMap(offset=>[0,.35,Math.PI/2,Math.PI].flatMap(angle=>[.05,.25].flatMap(radius=>[0,.02].flatMap(clearance=>[false,true].map(preserve=>({offset,angle,radius,clearance,preserve}))))));
it.each(cameraContactCases)('keeps camera contact continuous at offset $offset angle $angle radius $radius clearance $clearance preserve $preserve',({offset,angle,radius,clearance,preserve})=>{
 const world=new RAPIER.World({x:0,y:0,z:0}),factory=new FixedBoxColliderFactory(world);
 const rotation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),angle),translation=new Vector3(offset,0,offset);
 const point=(x:number,y:number,z:number)=>new Vector3(x,y,z).applyQuaternion(rotation).add(translation).toArray();
 try{
  const center=point(0,-.25,0);factory.create([165,.25,165],desc=>desc.setTranslation(...center).setRotation(rotation));factory.dispose();world.updateSceneQueries();
  const solver=new CameraCollisionSolver((from,to,radius)=>probeHumanoidCamera(world,from,to,radius));
  let current:readonly[number,number,number]=point(0,4.8,-99);
  for(let tick=0;tick<40;tick++){
   const z=-90+tick*.116,eye=point(0,4.8,z-9);
   const request={target:point(0,.025,z),eye,current,pivotOrigin:point(0,1.675,z),radius,pivotClearance:clearance,armClearance:0,...(preserve?{canIgnoreArmObstruction:()=>true}:{})};
   const fixed=solver.solve(request,{authorityTick:tick,deltaSeconds:1/60,clearHoldSeconds:0,recoveryHalfLifeSeconds:0,maximumRecoveryMetersPerSecond:'unlimited'});
   expect(new Vector3(...fixed.position).distanceTo(new Vector3(...eye)),`fixed camera tick ${tick}`).toBeLessThan(1e-6);
   const before=solver.captureTransactionState(),displayEye=point(0,4.8,z-9-.058);
   const projected=solver.project({...request,target:point(0,.025,z-.058),eye:displayEye,pivotOrigin:point(0,1.675,z-.058),current:fixed.position});
   expect(new Vector3(...projected.position).distanceTo(new Vector3(...displayEye)),`display camera tick ${tick}`).toBeLessThan(1e-6);
   expect(solver.captureTransactionState()).toEqual(before);
   current=fixed.position;
  }
 }finally{factory.dispose();world.free();}
});

it('separates a tangent cast origin without requiring a separate body pivot',()=>{
 const world=new RAPIER.World({x:0,y:0,z:0}),factory=new FixedBoxColliderFactory(world);
 try{
  factory.create([165,.25,165],desc=>desc.setTranslation(0,-.25,0));factory.dispose();world.updateSceneQueries();
  const solver=new CameraCollisionSolver((from,to,radius)=>probeHumanoidCamera(world,from,to,radius));
  const request={target:[0,.25000004768371586,-90] as const,eye:[0,4.8,-99] as const,current:[0,4.8,-99] as const,radius:.25,pivotClearance:0,armClearance:0};
  const result=solver.solve(request,{authorityTick:0,deltaSeconds:1/60,clearHoldSeconds:0,recoveryHalfLifeSeconds:0,maximumRecoveryMetersPerSecond:'unlimited'});
  expect(result.position).toEqual(request.eye);
  expect(solver.project(request).position).toEqual(request.eye);
 }finally{factory.dispose();world.free();}
});

it('sweeps past a touching support to the intervening wall instead of crossing it',()=>{
 const world=new RAPIER.World({x:0,y:0,z:0});
 try{
  world.createCollider(RAPIER.ColliderDesc.cuboid(10,.5,10).setTranslation(0,-.5,0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(.1,2,2).setTranslation(0,2,0));world.updateSceneQueries();
  const probe=(from:readonly[number,number,number],to:readonly[number,number,number],radius:number)=>probeHumanoidCamera(world,from,to,radius);
  const solver=new CameraCollisionSolver(probe),timing={authorityTick:0,deltaSeconds:1/60,clearHoldSeconds:0,recoveryHalfLifeSeconds:0,maximumRecoveryMetersPerSecond:'unlimited' as const};
  const first=solver.solve({target:[-2,2,0],eye:[-2,-1,0],current:[-2,1,0],radius:.25,pivotClearance:0,armClearance:0},timing);
  for(const origin of [first.position,[-2,.25,0] as const]){
   const request={target:[2,2,0] as const,eye:[2,1,0] as const,current:origin,sweepFrom:origin,radius:.25,pivotClearance:0,armClearance:0};
   const result=solver.solve(request,{...timing,authorityTick:1});
   expect(result.position[0]).toBeLessThan(-.34999);
   expect(result.phase).toBe('constrained');
   expect(probe(result.position,result.position,.25).startedOverlapping).not.toBe(true);
   const before=solver.captureTransactionState();expect(solver.project(request).position).toEqual(result.position);expect(solver.captureTransactionState()).toEqual(before);
  }
 }finally{world.free();}
});

it.each([12,40,200].flatMap(side=>[0,.13,.37].map(fraction=>({side,fraction}))))('keeps actual prone support and standing exit on a $side m slab at $fraction',({side,fraction})=>{
 const q=new EnvironmentQueries(ground(side,fraction)),actor=new HumanoidController(q,'person');
 actor.surface.availableClips=new Set(['prone-enter','prone-exit','prone-idle','prone-forward']);
 try{
  let minimumY=Infinity;
  for(let tick=0;tick<510;tick++){actor.step(new Vector3(),false,false,false,tick===30?{prone:true}:{});q.stepPhysics(1/60);minimumY=Math.min(minimumY,actor.position.y);}
  expect(minimumY).toBeGreaterThan(-.001);expect(actor.surface.eligibility('prone').eligible).toBe(true);
  for(let tick=0;tick<150;tick++){actor.step(new Vector3(),false,false,false,tick===0?{prone:true}:{});q.stepPhysics(1/60);}
  expect(actor.surface.mode).toBe('none');expect(actor.position.y).toBeGreaterThan(-.001);
 }finally{actor.dispose();q.dispose();}
});

it('shares immutable native box volumes without a hidden template or a source lifetime dependency',()=>{
 const world=new RAPIER.World({x:0,y:0,z:0}),factory=new FixedBoxColliderFactory(world);
 try{
  const first=factory.create([20,.5,20],desc=>desc.setTranslation(0,-.5,0));
  const second=factory.create([20,.5,20],desc=>desc.setTranslation(80,-.5,0));
  factory.dispose();expect(world.colliders.len()).toBe(2);expect(second.shape).toBe(first.shape);
  const shape=second.shape as RAPIER.Voxels,data=shape.data,original=data[0];data[0]=50;
  expect(shape.data[0]).toBe(original);expect(()=>{shape.voxelSize.x=50;}).toThrow();
  expect(()=>{shape.data=new Int32Array();}).toThrow();
  world.removeCollider(first,true);world.updateSceneQueries();
  expect(second.containsPoint({x:80,y:-.5,z:0})).toBe(true);
  expect(second.projectPoint({x:80,y:-.5,z:0},true)?.isInside).toBe(true);
  const capsule=new RAPIER.Capsule(.1,.1),center={x:80,y:-.5,z:0};
  expect(world.intersectionWithShape(center,rotation,capsule)?.handle).toBe(second.handle);
  expect(contactColliderVolume(second,capsule,center,rotation,0)!.distance).toBeLessThan(-.2);
  expect(world.castShape(center,rotation,{x:0,y:1,z:0},capsule,0,1,true)?.time_of_impact).toBe(0);
  expect(world.castRay(new RAPIER.Ray({x:80,y:2,z:0},{x:0,y:-1,z:0}),5,true)?.timeOfImpact).toBeCloseTo(2,5);
  expect(world.castRay(new RAPIER.Ray({x:80,y:-2,z:0},{x:0,y:1,z:0}),5,true)?.timeOfImpact).toBeCloseTo(1,5);
 }finally{factory.dispose();world.free();}
});

it('exports the exact physical outer box for navigation and retires the proof on shape replacement',()=>{
 const world=new RAPIER.World({x:0,y:0,z:0}),factory=new FixedBoxColliderFactory(world);
 try{
  const pose=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.3),position=new Vector3(20,3,10);
  const collider=factory.create([20,.5,20],desc=>desc.setTranslation(position.x,position.y,position.z).setRotation(pose));factory.dispose();world.updateSceneQueries();
  const geometry=readNavigationGeometry(world,()=>true),bounds=new Box3();
  for(const x of [-20,20])for(const y of [-.5,.5])for(const z of [-20,20])bounds.expandByPoint(new Vector3(x,y,z).applyQuaternion(pose).add(position));
  expect(geometry.indices.length/3).toBe(12);expect(geometry.positions.length/3).toBe(8);
  const actual=new Box3().setFromArray(geometry.positions);
  expect(actual.min.distanceTo(bounds.min)).toBeLessThan(1e-5);expect(actual.max.distanceTo(bounds.max)).toBeLessThan(1e-5);
  collider.setShape(new RAPIER.Compound([new RAPIER.Cuboid(1,1,1),new RAPIER.Cuboid(1,1,1)],[{x:-5,y:0,z:0},{x:5,y:0,z:0}],[rotation,rotation]));
  expect(()=>readNavigationGeometry(world,()=>true)).toThrow('NAVIGATION_COLLIDER_UNSUPPORTED');
 }finally{factory.dispose();world.free();}
});

it('releases a staged native world when map collider construction fails partway',()=>{
 const original=RAPIER.World.prototype.createCollider,free=vi.spyOn(RAPIER.World.prototype,'free');let calls=0;
 vi.spyOn(RAPIER.World.prototype,'createCollider').mockImplementation(function(this:RAPIER.World,...args:Parameters<typeof original>){if(++calls===2)throw new Error('injected collider failure');return original.apply(this,args);});
 expect(()=>new EnvironmentQueries(ground(200))).toThrow('injected collider failure');expect(free).toHaveBeenCalledOnce();
});

it('queries committed shared boxes without rebuilding their native subshapes',()=>{
 const q=new EnvironmentQueries(ground(200)),physics=ThreePhysics.borrow(q.borrowPhysics());
  const rebuild=vi.spyOn(RAPIER.Voxels.prototype,'intoRaw');
 try{
  const body={kind:'capsule' as const,height:1.68,radius:.28,offset:[0,.84,0] as const},pose={position:new Vector3(0,.03,0),rotation:new Quaternion(),body};
  expect(q.bodyOverlap(pose)).toBe(false);
  expect(q.bodyPathBlocked([pose,{...pose,position:new Vector3(5,.03,0)}])).toBe(false);
  expect(q.bodyOverlap({...pose,position:new Vector3(0,-.2,0)})).toBe(true);
  const actor=new Group();actor.position.set(0,.03,0);
  expect(()=>physics.validateBatch([{id:'npc',kind:'character',object:actor,options:{heightMeters:1.68,radiusMeters:.28}}])).not.toThrow();
  expect(rebuild).not.toHaveBeenCalled();
 }finally{physics.dispose();q.dispose();}
});

it('preserves the box volume and camera penetration after arbitrary rotation and translation',()=>{
 const world=new RAPIER.World({x:0,y:0,z:0}),factory=new FixedBoxColliderFactory(world);
 try{
  const at=new Vector3(3,5,7),turn=new Quaternion().setFromAxisAngle(new Vector3(1,2,3).normalize(),.4),half=[4.3,.57,7.15] as const;
  const collider=factory.create(half,desc=>desc.setTranslation(at.x,at.y,at.z).setRotation(turn));factory.dispose();world.updateSceneQueries();
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
   const direction=new Vector3().setComponent(axis,sign).applyQuaternion(turn),start=at.clone().addScaledVector(direction,half[axis]!+1);
   const hit=collider.castRay(new RAPIER.Ray(start,direction.clone().negate()),2,true);expect(hit).toBeCloseTo(1,5);
  }
  const camera=probeHumanoidCamera(world,[at.x,at.y,at.z],[at.x+1,at.y,at.z],.1);
  expect(camera.startedOverlapping).toBe(true);expect(camera.penetrationDepthMeters).toBeGreaterThan(.5);
  const capsule=new RAPIER.Capsule(.1,.1),contact=contactColliderVolume(collider,capsule,at,turn,0);
  expect(world.intersectionWithShape(at,turn,capsule)?.handle).toBe(collider.handle);expect(contact!.distance).toBeLessThan(-.5);
 }finally{factory.dispose();world.free();}
});
