import RAPIER from '@dimforge/rapier3d-compat';
import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {EnvironmentQueries,initEnvironmentQueries,type BodyPose} from './queries';
const map={id:'body-query-broadphase',name:'Query',description:'',bounds:{min:[-120,-20,-120],max:[120,40,120]},boxes:[],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]} as const;
const pose=(x:number,z=0):BodyPose=>({position:new Vector3(x,1,z),rotation:new Quaternion(),body:{kind:'box',halfExtents:[.2,.2,.2],offset:[0,0,0]}});
beforeAll(initEnvironmentQueries);afterEach(()=>vi.restoreAllMocks());
it('bounds exact contacts and casts to the path vicinity and refreshes only once',()=>{
 const q=new EnvironmentQueries(map),world=q.borrowPhysics().world;
 try{
  for(let i=0;i<200;i++)world.createCollider(RAPIER.ColliderDesc.ball(.25).setTranslation(30+i%20,1,30+Math.floor(i/20)));
  const contacts=vi.spyOn(RAPIER.Collider.prototype,'contactShape'),casts=vi.spyOn(RAPIER.Collider.prototype,'castShape'),refresh=vi.spyOn(world,'updateSceneQueries'),step=vi.spyOn(world,'step');
  const count=q.colliderCount,sequence=q.physicsStepSequence;
  expect(q.bodyPathBlocked([pose(-2),pose(0),pose(2)])).toBe(false);
  expect(contacts).not.toHaveBeenCalled();expect(casts).not.toHaveBeenCalled();expect(refresh).toHaveBeenCalledTimes(1);
  expect(step).not.toHaveBeenCalled();expect(q.physicsStepSequence).toBe(sequence);expect(q.colliderCount).toBe(count);
 }finally{q.dispose();}
});
it('sees current insertion, body movement, disable/re-enable and removal before a physics step',()=>{
 const q=new EnvironmentQueries(map),world=q.borrowPhysics().world;
 try{
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(40,1,0).setLinvel(1,2,3));
  const c=world.createCollider(RAPIER.ColliderDesc.cuboid(.3,.3,.3),body);
  expect(q.bodyOverlap(pose(0))).toBe(false);
  body.setTranslation({x:0,y:1,z:0},true);expect(q.bodyOverlap(pose(0))).toBe(true);
  expect(body.linvel()).toEqual({x:1,y:2,z:3});expect(q.physicsStepSequence).toBe(0);
  body.setEnabled(false);expect(q.bodyOverlap(pose(0))).toBe(false);
  c.setEnabled(false);body.setEnabled(true);expect(q.bodyOverlap(pose(0))).toBe(false);
  c.setEnabled(true);expect(q.bodyOverlap(pose(0))).toBe(true);
  c.setSensor(true);expect(q.bodyPathBlocked([pose(-2),pose(2)])).toBe(false);
  c.setSensor(false);expect(q.bodyPathBlocked([pose(-2),pose(2)])).toBe(true);
  expect(q.bodyPathBlocked([pose(-2),pose(2)],{excludedColliderHandles:new Set([c.handle])})).toBe(false);
  world.removeRigidBody(body);expect(q.bodyPathBlocked([pose(-2),pose(2)])).toBe(false);
  world.createCollider(RAPIER.ColliderDesc.ball(.3).setTranslation(0,1,0));expect(q.bodyPathBlocked([pose(-2),pose(2)])).toBe(true);
  expect(q.physicsStepSequence).toBe(0);
 }finally{q.dispose();}
});
it('includes rotated body offsets and intermediate blockers with clear endpoints',()=>{
 const q=new EnvironmentQueries(map),world=q.borrowPhysics().world;
 try{
  world.createCollider(RAPIER.ColliderDesc.cuboid(.05,.1,.1).setTranslation(0,4,0));
  const rotated=(x:number):BodyPose=>({position:new Vector3(x,2,0),rotation:new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2),body:{kind:'box',halfExtents:[.2,1.2,.3],offset:[2,0,0]}});
  expect(q.bodyOverlap(rotated(-3))).toBe(false);expect(q.bodyOverlap(rotated(3))).toBe(false);
  expect(q.bodyPathBlocked([rotated(-3),rotated(3)])).toBe(true);
 }finally{q.dispose();}
});
it('retains the existing cast clearance for a thin wall just outside the geometric swept bounds',()=>{
 const q=new EnvironmentQueries(map),world=q.borrowPhysics().world;
 try{
  world.createCollider(RAPIER.ColliderDesc.cuboid(.1,.5,.005).setTranslation(0,1,.21));
  expect(q.bodyOverlap(pose(-2))).toBe(false);expect(q.bodyOverlap(pose(2))).toBe(false);
  expect(q.bodyPathBlocked([pose(-2),pose(2)])).toBe(true);
 }finally{q.dispose();}
});
it('rejects stale query owners before accessing the freed native index',()=>{
 const q=new EnvironmentQueries(map);q.dispose();
 expect(()=>q.bodyOverlap(pose(0))).toThrow('Environment queries disposed');
 expect(()=>q.bodyPathBlocked([pose(-1),pose(1)])).toThrow('Environment queries disposed');
});
it('preserves direct-query enable semantics through settled parent toggles',()=>{
 const q=new EnvironmentQueries(map),world=q.borrowPhysics().world;
 try{
  const parent=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,1,0));
  const c=world.createCollider(RAPIER.ColliderDesc.cuboid(.3,.3,.3),parent);
  world.step();parent.setEnabled(false);world.step();expect(q.bodyOverlap(pose(0))).toBe(false);
  parent.setEnabled(true);expect(q.bodyOverlap(pose(0))).toBe(false);
  // Direct queries retain the existing collider flag until the ordinary step.
  world.step();expect(q.bodyOverlap(pose(0))).toBe(true);
  c.setEnabled(false);world.step();parent.setEnabled(false);world.step();parent.setEnabled(true);
  expect(q.bodyOverlap(pose(0))).toBe(false);
 }finally{q.dispose();}
});
