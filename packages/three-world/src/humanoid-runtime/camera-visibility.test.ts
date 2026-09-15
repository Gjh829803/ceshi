import {beforeAll,expect,it,vi} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import type {CameraCollisionProbe,CameraCollisionProbeResult} from '@worldkit/camera-collision';
import type {Vec3} from '../contracts';
import {measureSubjectVisibilityClearanceRatio} from './camera-visibility';
import {probeHumanoidCamera} from './camera-queries';

const capsule={positionWorldMetersXYZ:[0,0,0] as Vec3,heightMeters:1.8,radiusMeters:.3};
const eye:Vec3=[0,1.6,5];
const travel=(from:Vec3,to:Vec3)=>Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]);
const measure=(query:CameraCollisionProbe)=>measureSubjectVisibilityClearanceRatio(eye,capsule,.2,.6,query);
beforeAll(async()=>{await RAPIER.init();});

it('accepts a fully clear sight line with one maximum-radius query',()=>{
 const query=vi.fn<CameraCollisionProbe>((from,to)=>({distanceMeters:travel(from,to)}));
 expect(measure(query)).toBe(1);expect(query).toHaveBeenCalledTimes(1);
 expect(query.mock.calls[0]).toEqual([eye,[0,1.799,0],.6]);
});

it('rejects all blocked centre lines without binary searches or zero-radius probes',()=>{
 const query=vi.fn<CameraCollisionProbe>(()=>({distanceMeters:0,startedOverlapping:true}));
 expect(measure(query)).toBe(0);expect(query).toHaveBeenCalledTimes(18);
 expect(query.mock.calls.every(call=>call[2]>=.2)).toBe(true);
 expect(new Set(query.mock.calls.map(call=>call[1][1])).size).toBe(9);
 expect(query.mock.calls.every(call=>call[1][0]===0&&call[1][2]===0)).toBe(true);
});

it('skips searches for body points that cannot improve the best measured clearance',()=>{
 const query=vi.fn<CameraCollisionProbe>((from,to,radius)=>({distanceMeters:radius<(to[1]>1.79?.45:.25)?travel(from,to):0}));
 expect(measure(query)).toBeCloseTo((.45-.2)/(.6-.2),2);
 expect(query).toHaveBeenCalledTimes(26);
});

it('bounds the worst case to ten queries per body point',()=>{
 const heights:number[]=[];
 const query=vi.fn<CameraCollisionProbe>((from,to,radius)=>{
  if(!heights.includes(to[1]))heights.push(to[1]);
  const clearance=.24+.04*heights.indexOf(to[1]);
  return {distanceMeters:radius<clearance?travel(from,to):0};
 });
 expect(measure(query)).toBeCloseTo(.9,2);expect(query).toHaveBeenCalledTimes(90);
});

it.each([
 {distanceMeters:NaN},{distanceMeters:Infinity},{distanceMeters:-1},
 {distanceMeters:5,normalWorldXYZ:[NaN,1,0]},{distanceMeters:5,normalWorldXYZ:[0,0,0]},
] as CameraCollisionProbeResult[])('rejects invalid query evidence %j',hit=>{
 expect(()=>measure(()=>hit)).toThrow('CAMERA_COLLISION_PROBE_INVALID');
});

it('returns the same measurements without mutating frozen subject data or query results',()=>{
 const frozenEye=Object.freeze([...eye]) as Vec3;
 const frozenCapsule=Object.freeze({...capsule,positionWorldMetersXYZ:Object.freeze([...capsule.positionWorldMetersXYZ]) as Vec3});
 const query:CameraCollisionProbe=(from,to,radius)=>Object.freeze({distanceMeters:radius<.4?travel(from,to):0});
 const values=Array.from({length:3},()=>measureSubjectVisibilityClearanceRatio(frozenEye,frozenCapsule,.2,.6,query));
 expect(values[0]).toBeGreaterThan(0);expect(values).toEqual([values[0],values[0],values[0]]);
 expect(frozenEye).toEqual(eye);expect(frozenCapsule).toEqual(capsule);
});

function geometry(boxes:readonly {position:Vec3;halfExtents:Vec3}[]){
 const world=new RAPIER.World({x:0,y:0,z:0});
 for(const box of boxes)world.createCollider(RAPIER.ColliderDesc.cuboid(...box.halfExtents).setTranslation(...box.position));
 world.step();
 const query:CameraCollisionProbe=(from,to,radius)=>probeHumanoidCamera(world,from,to,radius);
 return {world,query};
}

it('uses another visible body height when a narrow suspended post blocks the top sight line',()=>{
 const {world,query}=geometry([{position:[0,1.7,2.5],halfExtents:[.08,.15,.1]}]);
 try{
  const top:Vec3=[0,1.799,0];expect(query(eye,top,0).distanceMeters).toBeLessThan(travel(eye,top));
  expect(measure(query)).toBe(1);
 }finally{world.free();}
});

it('measures a continuous clearance change across a low roof edge',()=>{
 const {world,query}=geometry([{position:[-5,2.1,0],halfExtents:[5,.1,10]}]);
 try{
  const values:number[]=[];
  for(let index=0;index<=40;index++){
   const x=.7-index*.02;
   const value=measureSubjectVisibilityClearanceRatio([x,4,5],{...capsule,positionWorldMetersXYZ:[x,0,0]},.2,.6,query);
   const expected=Math.max(0,Math.min(1,(x-.2)/.4));
   expect(Math.abs(value-expected)).toBeLessThan(.005);values.push(value);
  }
  expect(values[0]).toBe(1);expect(values.at(-1)).toBe(0);
  for(let index=1;index<values.length;index++){
   expect(values[index]!).toBeLessThanOrEqual(values[index-1]!+.005);
   expect(values[index-1]!-values[index]!).toBeLessThan(.06);
  }
 }finally{world.free();}
});

it('reports limited corridor clearance without claiming the still-visible subject is fully occluded',()=>{
 const {world,query}=geometry([
  {position:[-.5,2,0],halfExtents:[.1,2,10]},
  {position:[.5,2,0],halfExtents:[.1,2,10]},
 ]);
 try{
  expect(measure(query)).toBeCloseTo(.5,2);
  const target:Vec3=[0,.9,0];expect(query(eye,target,0).distanceMeters).toBeCloseTo(travel(eye,target),6);
 }finally{world.free();}
});
