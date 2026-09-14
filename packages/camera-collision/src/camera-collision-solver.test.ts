import { expect, it } from 'vitest';
import { CameraCollisionSolver, type CameraCollisionProbe, type CameraCollisionRequest, type CameraCollisionTiming } from './camera-collision-solver';

const request: CameraCollisionRequest = { target: [0,0,0], eye: [0,0,8], current: [0,0,8], radius: .2 };
const timing = (tick: number, dt=1/60) => ({ authorityTick: tick, deltaSeconds: dt, clearHoldSeconds: .12, recoveryHalfLifeSeconds: .2, maximumRecoveryMetersPerSecond: 3 });
const length = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v,i) => v-b[i]!));

type Point = readonly [number,number,number];
// Exact swept-sphere queries against solid spheres: the rounded corner fixture
// catches abrupt arm changes without returning request-specific canned hits.
function sphereGeometry(obstacles: {center:Point;radius:number;id:string}[]):CameraCollisionProbe {
  return (from,to,radius)=>{
    const travel=length(from,to),direction=from.map((v,i)=>(to[i]!-v)/(travel||1));
    let nearest:ReturnType<CameraCollisionProbe>={distanceMeters:travel};
    for(const obstacle of obstacles){
      const offset=from.map((v,i)=>v-obstacle.center[i]!),combined=radius+obstacle.radius;
      const originDistance=Math.hypot(...offset),dot=offset.reduce((sum,v,i)=>sum+v*direction[i]!,0);
      const discriminant=dot*dot-originDistance*originDistance+combined*combined;
      const overlapping=originDistance<combined;
      const hitDistance=overlapping?0:discriminant>=0?-dot-Math.sqrt(discriminant):Infinity;
      if(hitDistance<0||hitDistance>nearest.distanceMeters)continue;
      const normal=originDistance===0?[0,0,-1]:offset.map((v,i)=>v+direction[i]!*hitDistance),magnitude=Math.hypot(...normal)||1;
      nearest={distanceMeters:hitDistance,colliderEntityId:obstacle.id,startedOverlapping:overlapping,
        normalWorldXYZ:normal.map(v=>v/magnitude) as unknown as Point,penetrationDepthMeters:Math.max(0,combined-originDistance)};
    }
    return nearest;
  };
}

const retractionTiming=(tick:number,dt=1/60):CameraCollisionTiming=>({
  ...timing(tick,dt),retractionHalfLifeSeconds:.08,maximumRetractionMetersPerSecond:12,
});

it('retracts continuously around a rounded wall corner while keeping every applied arm and travel clear',()=>{
  const probe=sphereGeometry([{center:[1.2,1,2],radius:.98,id:'wall-corner'}]);
  const solver=new CameraCollisionSolver(probe),target:Point=[0,1,0],initial:Point=[0,1,8];
  const desired:Point=[.2,1,8];
  let current=solver.solve({...request,target,eye:initial,current:initial},timing(0)).position;
  const hard=solver.project({...request,target,eye:desired,current});
  expect(hard.effectiveDistance).toBeLessThan(3);
  for(let tick=1;tick<=180;tick++){
    const next=solver.solve({...request,target,eye:desired,current,sweepFrom:current},retractionTiming(tick));
    expect(length(next.position,current)).toBeLessThanOrEqual(.200001);
    expect(probe(next.position,next.position,.2).startedOverlapping).not.toBe(true);
    expect(probe(target,next.position,.2).distanceMeters).toBeCloseTo(length(target,next.position),6);
    expect(probe(current,next.position,.2).distanceMeters).toBeCloseTo(length(current,next.position),6);
    expect(solver.captureTransactionState().lastSafePositionMetersXYZ).toEqual(next.position);
    expect(solver.captureTransactionState().constrainedArmLengthMeters).toBeCloseTo(next.effectiveDistance,10);
    current=next.position;
  }
  expect(length(current,hard.position)).toBeLessThan(.001);
});

it('uses retraction half-life without a speed cap and keeps cut and projection spatially exact',()=>{
  const probe=sphereGeometry([{center:[1.2,1,2],radius:.98,id:'wall-corner'}]);
  const solver=new CameraCollisionSolver(probe);
  const input={...request,target:[0,1,0] as const,eye:[.2,1,8] as const,current:[0,1,8] as const};
  const hard=solver.project(input);
  const eased=solver.solve(input,{...retractionTiming(0,.08),maximumRetractionMetersPerSecond:'unlimited'});
  expect(eased.position).toEqual(input.current.map((v,i)=>(v+hard.position[i]!)/2));
  const committed=solver.captureTransactionState();
  expect(solver.project(input).position).toEqual(hard.position);
  expect(solver.captureTransactionState()).toEqual(committed);
  solver.reset();
  expect(length(solver.solve(input,retractionTiming(1,0)).position,hard.position)).toBeLessThan(1e-12);
});

it('escapes immediately when a dynamic obstacle makes the previous eye or its focus arm unsafe',()=>{
  const obstacles:{center:Point;radius:number;id:string}[]=[];
  const probe=sphereGeometry(obstacles),solver=new CameraCollisionSolver(probe);
  const input={...request,target:[0,1,0] as const,eye:[0,1,8] as const,current:[0,1,8] as const,sweepFrom:[0,1,8] as const};
  solver.solve(input,retractionTiming(0));
  obstacles.push({center:[0,1,4],radius:.8,id:'moving-wall'});
  const result=solver.solve(input,retractionTiming(1));
  expect(result.position[2]).toBeCloseTo(2.98);
  expect(probe(input.target,result.position,.2).distanceMeters).toBeCloseTo(result.effectiveDistance,6);
  obstacles[0]!.center=[0,1,8];
  solver.reset();
  const occupied=solver.solve(input,retractionTiming(2));
  expect(occupied.position[2]).toBeCloseTo(6.98);
  expect(probe(occupied.position,occupied.position,.2).startedOverlapping).not.toBe(true);
});

it('escapes a penetrating previous eye even when the desired focus arm is already clear',()=>{
  const probe=sphereGeometry([{center:[0,0,7.9],radius:1,id:'occupied-old-eye'}]);
  const solver=new CameraCollisionSolver(probe);
  const input={...request,eye:[8,0,0] as const,sweepFrom:request.current};
  expect(probe(input.current,input.current,input.radius).startedOverlapping).toBe(true);
  expect(probe(input.target,input.eye,input.radius).distanceMeters).toBe(8);
  const result=solver.solve(input,retractionTiming(0));
  expect(result.position).toEqual(input.eye);
  expect(probe(result.position,result.position,input.radius).startedOverlapping).not.toBe(true);
  const before=solver.captureTransactionState();
  expect(solver.project(input).position).toEqual(input.eye);
  expect(solver.captureTransactionState()).toEqual(before);
});

it('sweeps an obstructed arm transition without accepting a clipped pose hidden behind an obstacle',()=>{
  const probe=sphereGeometry([
    {center:[0,1,4],radius:.8,id:'arm-wall'},
    {center:[-2,1,5.5],radius:.4,id:'trajectory-wall'},
  ]);
  const solver=new CameraCollisionSolver(probe);
  const input={...request,target:[0,1,0] as const,eye:[0,1,8] as const,current:[-4,1,8] as const,sweepFrom:[-4,1,8] as const};
  const result=solver.solve(input,timing(0));
  expect(result.position).toEqual(input.current);
  expect(probe(input.target,result.position,.2).distanceMeters).toBeCloseTo(result.effectiveDistance,6);
});

it('retains a reachable sphere-safe eye and reports occlusion when the focus moves across a static wall',()=>{
  const probe=sphereGeometry([{center:[0,1,3],radius:1.4,id:'static-wall'}]);
  const solver=new CameraCollisionSolver(probe);
  const input={...request,target:[2,1,0] as const,eye:[2,1,4] as const,current:[-2,1,4] as const,sweepFrom:[-2,1,4] as const,visibilityTarget:[2,1,0] as const};
  for(const dt of [0,1/60]){
    const result=solver.solve(input,retractionTiming(0,dt));
    expect(result.position[0]).toBeLessThan(0);
    expect(result.phase).toBe('constrained');
    expect(result.visibility?.status).toBe('occluded');
    expect(probe(input.current,result.position,.2).distanceMeters).toBeCloseTo(length(input.current,result.position),6);
    const before=solver.captureTransactionState();
    expect(solver.project(input).position).toEqual(result.position);
    expect(solver.captureTransactionState()).toEqual(before);
    solver.reset();
  }
});

it('keeps a sweep-clipped pose on an obstructed arm when the new focus arm remains clear',()=>{
  const probe=sphereGeometry([
    {center:[0,1,4],radius:.8,id:'arm-wall'},
    {center:[-2.8,1,1.5],radius:.4,id:'trajectory-wall'},
  ]);
  const solver=new CameraCollisionSolver(probe);
  const input={...request,target:[0,1,0] as const,eye:[0,1,8] as const,current:[-4,1,0] as const,sweepFrom:[-4,1,0] as const};
  const result=solver.solve(input,timing(0));
  expect(result.entityId).toBe('trajectory-wall');
  expect(result.position[0]).toBeLessThan(-1);
  expect(probe(input.target,result.position,.2).distanceMeters).toBeCloseTo(result.effectiveDistance,6);
  expect(probe(input.current,result.position,.2).distanceMeters).toBeCloseTo(length(input.current,result.position),6);
});

it('moves inward around a blocking column instead of permanently holding a clear old arm during recovery',()=>{
  const probe=sphereGeometry([{center:[0,0,7],radius:1.4,id:'column'}]);
  const solver=new CameraCollisionSolver(probe),desired:Point=[4,0,8];
  let current:Point=[-4,0,8];
  for(let tick=0;tick<360;tick++){
    const result=solver.solve({...request,eye:desired,current,sweepFrom:current},retractionTiming(tick));
    if(tick===0){
      expect(length(result.position,current)).toBeGreaterThan(.01);
      expect(length(result.position,current)).toBeLessThanOrEqual(.200001);
      expect(result.effectiveDistance).toBeLessThan(length(request.target,current));
    }
    expect(probe(current,result.position,.2).distanceMeters).toBeCloseTo(length(current,result.position),6);
    expect(probe(request.target,result.position,.2).distanceMeters).toBeCloseTo(result.effectiveDistance,6);
    current=result.position;
  }
  expect(length(current,desired)).toBeLessThan(.01);
});

it('bounds collision angle catch-up and reaches a continuously rotating proposal before releasing recovery',()=>{
  const probe=sphereGeometry([{center:[0,0,7],radius:1.4,id:'column'}]);
  const solver=new CameraCollisionSolver(probe),radius=Math.sqrt(80);
  let current:Point=[-4,0,8],recoveredWhileMoving=false,sawRecovering=false;
  for(let tick=0;tick<600;tick++){
    const angle=Math.atan2(4,8)+tick*.002;
    const desired:Point=[Math.sin(angle)*radius,0,Math.cos(angle)*radius];
    const input={...request,eye:desired,current,sweepFrom:current};
    const result=solver.solve(input,retractionTiming(tick));
    expect(length(current,result.position)).toBeLessThanOrEqual(.200001);
    expect(probe(current,result.position,.2).distanceMeters).toBeCloseTo(length(current,result.position),6);
    expect(probe(request.target,result.position,.2).distanceMeters).toBeCloseTo(result.effectiveDistance,6);
    sawRecovering ||= result.phase==='recovering';
    if(tick>0&&result.phase==='clear'){
      recoveredWhileMoving=true;
      expect(length(result.position,desired)).toBeLessThan(1e-6);
    }
    const before=solver.captureTransactionState();
    expect(length(solver.project({...request,eye:result.position,current:result.position}).position,result.position)).toBeLessThan(1e-10);
    expect(solver.captureTransactionState()).toEqual(before);
    current=result.position;
  }
  expect(sawRecovering).toBe(true);
  expect(recoveredWhileMoving).toBe(true);
  expect(solver.captureTransactionState().phase).toBe('clear');
});

it('keeps fast free orbit exact and preserves the existing radial recovery owner with retraction limits enabled',()=>{
  const obstacles:{center:Point;radius:number;id:string}[]=[];
  const probe=sphereGeometry(obstacles),solver=new CameraCollisionSolver(probe);
  expect(solver.solve({...request,eye:[8,0,0],sweepFrom:request.current},retractionTiming(0)).position).toEqual([8,0,0]);
  solver.reset();
  obstacles.push({center:[0,0,4],radius:.8,id:'wall'});
  const fixed=solver.solve(request,{...retractionTiming(0),clearHoldSeconds:0});
  obstacles.length=0;
  const recovered=solver.solve({...request,current:fixed.position},{...retractionTiming(1,1),clearHoldSeconds:0,recoveryHalfLifeSeconds:1,maximumRecoveryMetersPerSecond:'unlimited',maximumRetractionMetersPerSecond:.1});
  expect(recovered.position[2]).toBeCloseTo((fixed.position[2]+8)/2,10);
});

it('rejects invalid retraction timing without changing committed memory',()=>{
  const solver=new CameraCollisionSolver((a,b)=>({distanceMeters:length(a,b)}));
  solver.solve(request,timing(0));
  const before=solver.captureTransactionState();
  for(const invalid of [{retractionHalfLifeSeconds:NaN},{retractionHalfLifeSeconds:-1},{maximumRetractionMetersPerSecond:Infinity},{maximumRetractionMetersPerSecond:-1},{maximumRetractionMetersPerSecond:0}]){
    expect(()=>solver.solve(request,{...retractionTiming(1),...invalid})).toThrow();
    expect(solver.captureTransactionState()).toEqual(before);
  }
});

it('separates a zero-depth touching pivot at zero clearance without holding a clear moving eye', () => {
  const radius=.25;
  const probe:CameraCollisionProbe=(from,to)=>Math.fround(from[1])<=radius
    ? {distanceMeters:0,colliderEntityId:'floor',startedOverlapping:true,normalWorldXYZ:[0,1,0],penetrationDepthMeters:Math.max(0,radius-Math.fround(from[1]))}
    : {distanceMeters:length(from,to)};
  const solver=new CameraCollisionSolver(probe);
  const input:CameraCollisionRequest={target:[0,radius,0],eye:[0,4,9],current:[0,4,8],radius,pivotClearance:0,armClearance:0};
  const fixed=solver.solve(input,timing(1));
  expect(fixed.position).toEqual(input.eye);
  expect(fixed.target[1]).toBeGreaterThan(radius);
  const before=solver.captureTransactionState();
  expect(solver.project(input).position).toEqual(input.eye);
  expect(solver.captureTransactionState()).toEqual(before);
});

it('retracts immediately and shares bounded temporal recovery without advancing on projection', () => {
  let wall = true;
  const probe: CameraCollisionProbe = (a,b) => wall && length(a,b)>2
    ? { distanceMeters: 2, colliderEntityId: 'wall', normalWorldXYZ: [0,0,-1] }
    : { distanceMeters: length(a,b) };
  const solver = new CameraCollisionSolver(probe);
  const first = solver.solve(request,timing(1));
  expect(first.position[2]).toBeCloseTo(1.98);
  wall=false;
  const before=solver.captureTransactionState();
  for(let i=0;i<10;i++)solver.project(request);
  expect(solver.captureTransactionState()).toEqual(before);
  const held=solver.solve(request,timing(2,.1));
  expect(held.position).toEqual(first.position);
  const recovered=solver.solve(request,timing(3,.1));
  expect(recovered.position[2]).toBeGreaterThan(held.position[2]);
  expect(recovered.position[2]-held.position[2]).toBeLessThanOrEqual(.3);
  const other=new CameraCollisionSolver(probe);
  expect(other.solve(request,timing(1)).position).toEqual(request.eye);
  solver.reset();expect(solver.solve(request,timing(1)).position).toEqual(request.eye);
});

it('keeps partial-subject framing but never ignores an occupied eye', () => {
  let eyeBlocked=false;
  const probe: CameraCollisionProbe = (a,b) => length(a,b)===0
    ? {distanceMeters:0,startedOverlapping:eyeBlocked && a[2]===8,normalWorldXYZ:[0,0,-1],penetrationDepthMeters:.1}
    : {distanceMeters:2,colliderEntityId:'pole',normalWorldXYZ:[0,0,-1]};
  const solver=new CameraCollisionSolver(probe);
  const visible={...request,canIgnoreArmObstruction:()=>true};
  expect(solver.project(visible).position).toEqual(request.eye);
  eyeBlocked=true;expect(solver.project(visible).position[2]).toBeCloseTo(1.98);
});

it('separates a penetrating pivot and final eye through query normals', () => {
  const probe: CameraCollisionProbe = (a,b) => a[0]<.1
    ? {distanceMeters:0,startedOverlapping:true,colliderEntityId:'corner',normalWorldXYZ:[1,0,0],penetrationDepthMeters:.1-a[0]}
    : {distanceMeters:length(a,b)};
  const result=new CameraCollisionSolver(probe).project(request);
  expect(result.target[0]).toBeCloseTo(.12);
  expect(result.position[0]).toBeCloseTo(.12);
  expect(result.position.slice(1)).toEqual(request.eye.slice(1));
  expect(probe(result.position,result.position,request.radius).startedOverlapping).not.toBe(true);
});

it('rolls back when a swept origin or final eye cannot be separated',()=>{
 let occupied: 'none'|'origin'|'eye'='none';
 const probe:CameraCollisionProbe=(a,b)=>length(a,b)===0&&((occupied==='origin'&&a[0]<0)||(occupied==='eye'&&a[0]>0))
   ? {distanceMeters:0,colliderEntityId:'sealed-space',startedOverlapping:true}
   : {distanceMeters:length(a,b)};
 const solver=new CameraCollisionSolver(probe);
 solver.solve(request,timing(1));
 const before=solver.captureTransactionState(),move={...request,current:[-2,0,8] as const,sweepFrom:[-2,0,8] as const,eye:[2,0,8] as const};
 for(const blocked of ['origin','eye'] as const){
  occupied=blocked;
  expect(()=>solver.solve(move,timing(2))).toThrow('CAMERA_COLLISION_NO_SAFE_POSE');
  expect(solver.captureTransactionState()).toEqual(before);
  expect(()=>solver.project(move)).toThrow('CAMERA_COLLISION_NO_SAFE_POSE');
  expect(solver.captureTransactionState()).toEqual(before);
 }
});

it('sweeps a free eye trajectory without changing its subject visibility rule', () => {
  const probe: CameraCollisionProbe=(a,b)=>a[0]===-2 && b[0]===2
    ? {distanceMeters:1,colliderEntityId:'side-wall',normalWorldXYZ:[-1,0,0]}
    : {distanceMeters:length(a,b)};
  const solver=new CameraCollisionSolver(probe);
  const moved={...request,current:[-2,0,8] as const,eye:[2,0,8] as const,sweepFrom:[-2,0,8] as const};
  const result=solver.solve(moved,timing(1));
  expect(result.position[0]).toBeLessThan(-1);
  expect(result.phase).toBe('constrained');
  expect(result.entityId).toBe('side-wall');
  expect(solver.captureTransactionState().lastSafePositionMetersXYZ).toEqual(result.position);
});

it('keeps committed collision memory when a solve fails validation', () => {
  const solver=new CameraCollisionSolver((a,b)=>({distanceMeters:length(a,b)}));
  solver.solve(request,timing(1));
  const before=solver.captureTransactionState();
  expect(()=>solver.solve(request,timing(2,NaN))).toThrow();
  expect(solver.captureTransactionState()).toEqual(before);
});

it('holds the same clear eye for fixed and display poses when the pivot cannot separate', () => {
  const probe:CameraCollisionProbe=(a,b)=>a[2]===8&&b[2]===8?{distanceMeters:0}:
    {distanceMeters:0,colliderEntityId:'deep-wall',startedOverlapping:true,normalWorldXYZ:[1,0,0],penetrationDepthMeters:.1};
  const solver=new CameraCollisionSolver(probe);
  const fixed=solver.solve(request,timing(1));
  expect(fixed.position).toEqual(request.current);
  expect(solver.project(request).position).toEqual(fixed.position);
});

it('expresses unlimited recovery explicitly while retaining half-life and zero-time semantics', () => {
  let wall = true;
  const solver = new CameraCollisionSolver((a,b) => wall
    ? {distanceMeters: 2, colliderEntityId:'wall'}
    : {distanceMeters:length(a,b)});
  const unlimited = {authorityTick:0,deltaSeconds:0,clearHoldSeconds:0,recoveryHalfLifeSeconds:1,maximumRecoveryMetersPerSecond:'unlimited' as const};
  const retracted=solver.solve(request,unlimited);
  wall=false;
  expect(solver.solve(request,{...unlimited,authorityTick:1}).position).toEqual(retracted.position);
  const recovered=solver.solve(request,{...unlimited,authorityTick:2,deltaSeconds:1});
  expect(recovered.position[2]).toBeCloseTo((retracted.position[2]+8)/2);
  const snap=solver.solve(request,{...unlimited,authorityTick:3,deltaSeconds:.001,recoveryHalfLifeSeconds:0});
  expect(snap.position).toEqual(request.eye);
  expect(()=>solver.solve(request,{...unlimited,authorityTick:4,maximumRecoveryMetersPerSecond:Infinity})).toThrow();
});


it('checks visibility at the solved eye and rolls back temporal state when that query fails',()=>{
 let fail=false;
 const solver=new CameraCollisionSolver((a,b)=>{
  if(b[0]===4){if(fail)throw new Error('VISIBILITY_QUERY_FAILURE');return {distanceMeters:length(a,b)};}
  return {distanceMeters:Math.min(2,length(a,b)),...(length(a,b)>2?{colliderEntityId:'arm-wall'}:{})};
 });
 const visible={...request,visibilityTarget:[4,0,0] as const};
 const first=solver.solve(visible,timing(0));
 expect(first.position[2]).toBeCloseTo(1.98);
 expect(first.visibility).toMatchObject({status:'clear',eyeWorldMetersXYZ:first.position,targetWorldMetersXYZ:[4,0,0],probeRadiusMeters:0});
 const before=solver.captureTransactionState();fail=true;
 expect(()=>solver.solve(visible,timing(1))).toThrow('VISIBILITY_QUERY_FAILURE');expect(solver.captureTransactionState()).toEqual(before);
 expect(()=>solver.project(visible)).toThrow('VISIBILITY_QUERY_FAILURE');expect(solver.captureTransactionState()).toEqual(before);
});
