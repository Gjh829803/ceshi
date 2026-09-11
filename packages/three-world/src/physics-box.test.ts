import RAPIER from '@dimforge/rapier3d-compat';
import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import {Box3,Group,Quaternion,Vector3} from 'three';
import {FixedBoxColliderFactory,contactColliderVolume} from './physics-box';
import {ThreePhysics} from './physics';
import {readNavigationGeometry} from './physics-navigation';
import {EnvironmentQueries,initEnvironmentQueries} from './humanoid-runtime/environment/queries';
import {HumanoidController} from './humanoid-runtime/humanoid/controller';
import {probeHumanoidCamera} from './humanoid-runtime/camera-queries';

beforeAll(initEnvironmentQueries);
afterEach(()=>vi.restoreAllMocks());
const rotation={x:0,y:0,z:0,w:1};
const ground=(side:number,fraction=0)=>({id:'precise-ground',name:'Ground',description:'',bounds:{min:[-1000,-10,-1000] as const,max:[1000,10,1000] as const},boxes:[{id:'floor',position:[0,-.5,0] as const,size:[side,1,side] as const}],water:[],spawns:[],regions:[],playerSpawn:[side*fraction,.03,side*fraction] as const});

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
