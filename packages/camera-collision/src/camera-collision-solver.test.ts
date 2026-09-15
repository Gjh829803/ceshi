import { expect, it } from 'vitest';
import { CameraCollisionSolver, type CameraCollisionProbe, type CameraCollisionProbeResult, type CameraCollisionRequest } from './camera-collision-solver';

const request: CameraCollisionRequest = { target: [0,0,0], eye: [0,0,8], current: [0,0,8], radius: .2 };
const timing = (tick: number, dt=1/60) => ({ authorityTick: tick, deltaSeconds: dt, clearHoldSeconds: .12, recoveryHalfLifeSeconds: .2, maximumRecoveryMetersPerSecond: 3 });
const length = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v,i) => v-b[i]!));

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

it('separates a penetrating pivot through query normals and rechecks the geometry', () => {
  const probe: CameraCollisionProbe = (a,b) => a[0]<.1
    ? {distanceMeters:0,startedOverlapping:true,colliderEntityId:'corner',normalWorldXYZ:[1,0,0],penetrationDepthMeters:.1-a[0]}
    : {distanceMeters:length(a,b)};
  const result=new CameraCollisionSolver(probe).project(request);
  expect(result.target[0]).toBeCloseTo(.12);
  expect(result.position).toEqual(request.eye);
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

it('rolls back when a swept contact cannot be separated into a safe sphere', () => {
  const probe: CameraCollisionProbe = (from, to) => {
    if (length(from, to) === 0 && from[0] > -1.1 && from[0] < -1)
      return {distanceMeters:0, colliderEntityId:'corner', startedOverlapping:true};
    if (from[0] === -2 && to[0] === 2)
      return {distanceMeters:1, colliderEntityId:'wall', normalWorldXYZ:[-1,0,0]};
    return {distanceMeters:length(from,to)};
  };
  const solver = new CameraCollisionSolver(probe);
  const before = solver.captureTransactionState();
  const moving: CameraCollisionRequest = {target:[2,2,0], eye:[2,1,0],
    current:[-2,1,0], sweepFrom:[-2,1,0], radius:.2};
  expect(() => solver.solve(moving, timing(1))).toThrow('CAMERA_COLLISION_NO_SAFE_POSE');
  expect(solver.captureTransactionState()).toEqual(before);
  expect(() => solver.project(moving)).toThrow('CAMERA_COLLISION_NO_SAFE_POSE');
  expect(solver.captureTransactionState()).toEqual(before);
});

type Vec3 = readonly [number,number,number];
type Box = {id:string;minimum:Vec3;maximum:Vec3};
/** Conservative sphere/box casts: exact faces, square expanded corners. */
function boxProbe(boxes:readonly Box[]):CameraCollisionProbe {
  return (from,to,radius)=>{
    const travel=length(from,to),direction=from.map((value,index)=>to[index]!-value);
    let closest:CameraCollisionProbeResult={distanceMeters:travel};
    for(const box of boxes){
      const minimum=box.minimum.map(value=>value-radius),maximum=box.maximum.map(value=>value+radius);
      if(from.every((value,index)=>value>minimum[index]!&&value<maximum[index]!)){
        let depth=Infinity,axis=0,sign=0;
        for(let index=0;index<3;index++)for(const side of [-1,1]){
          const distance=side<0?from[index]!-minimum[index]!:maximum[index]!-from[index]!;
          if(distance<depth){depth=distance;axis=index;sign=side;}
        }
        const normal:[number,number,number]=[0,0,0];normal[axis]=sign;
        return {distanceMeters:0,colliderEntityId:box.id,normalWorldXYZ:normal,startedOverlapping:true,penetrationDepthMeters:depth};
      }
      let entry=0,exit=1,normal:[number,number,number]=[0,0,0],intersects=travel>0;
      for(let axis=0;axis<3&&intersects;axis++){
        const delta=direction[axis]!;
        if(Math.abs(delta)<1e-12){if(from[axis]!<minimum[axis]!||from[axis]!>maximum[axis]!)intersects=false;continue;}
        const a=(minimum[axis]!-from[axis]!)/delta,b=(maximum[axis]!-from[axis]!)/delta;
        const near=Math.min(a,b),far=Math.max(a,b);
        if(near>entry){entry=near;normal=[0,0,0];normal[axis]=delta>0?-1:1;}
        exit=Math.min(exit,far);if(entry>exit)intersects=false;
      }
      if(intersects&&entry>=0&&entry<=1&&exit>=0&&Math.hypot(...normal)>.5&&entry*travel<closest.distanceMeters){
        closest={distanceMeters:entry*travel,colliderEntityId:box.id,normalWorldXYZ:normal};
      }
    }
    return closest;
  };
}

const wing:Box={id:'wing',minimum:[-4,2.22,-4],maximum:[4,2.42,4]};
const walkingTiming=(tick:number)=>({authorityTick:tick,deltaSeconds:1/60,clearHoldSeconds:0,
  recoveryHalfLifeSeconds:Math.LN2/5,maximumRecoveryMetersPerSecond:'unlimited' as const,resetWhenClear:false});

it('continues following below a wing when partial-subject visibility permits the free arm',()=>{
  const probe=boxProbe([wing]),solver=new CameraCollisionSolver(probe);
  let current:Vec3=[0,2,0],afterSettling:Vec3|undefined;
  const nominalLength=Math.hypot(10.2,1.58);
  for(let tick=0;tick<=600;tick++){
    const x=-8-tick/60,target:Vec3=[x,1.1,0],eye:Vec3=[x+10.2,2.68,0];
    const input:CameraCollisionRequest={target,eye,current,sweepFrom:current,radius:.2,armClearance:.04,pivotClearance:.02,
      // The native capsule visibility provider can accept an obstructed arm
      // when another part of the person is visible from the clear desired eye.
      canIgnoreArmObstruction:()=>true};
    const result=solver.solve(input,walkingTiming(tick));current=result.position;
    expect(probe(current,current,.2).startedOverlapping).not.toBe(true);
    expect(result.effectiveDistance).toBeLessThanOrEqual(nominalLength+.001);
    if(tick===120)afterSettling=current;
    if(tick===240){expect(current[0]-afterSettling![0]).toBeCloseTo(-2,2);expect(result.phase).toBe('constrained');}
    if(tick===600){expect(result.phase).toBe('clear');expect(length(current,eye)).toBeLessThan(.001);}
  }
});

it('sweeps each slide at a two-wall corner without crossing either wall',()=>{
  const boxes:Box[]=[{id:'wall-x',minimum:[0,0,-10],maximum:[1,3,10]},
    {id:'wall-z',minimum:[-10,0,0],maximum:[10,3,1]}];
  const probe=boxProbe(boxes),solver=new CameraCollisionSolver(probe);
  const input:CameraCollisionRequest={target:[2,5,2],eye:[2,1,2],current:[-1,1,-1],sweepFrom:[-1,1,-1],radius:.2};
  const result=solver.solve(input,walkingTiming(1));
  expect(result.phase).toBe('constrained');
  expect(result.position[0]).toBeLessThan(-.2);expect(result.position[2]).toBeLessThan(-.2);
  expect(result.position[0]).toBeGreaterThan(-1);expect(result.position[2]).toBeGreaterThan(-1);
  expect(probe(result.position,result.position,.2).startedOverlapping).not.toBe(true);
});

it('stops safely when a sweep normal is unavailable and rejects invalid normals transactionally',()=>{
  const raw=boxProbe([wing]);let invalid=false;
  const probe:CameraCollisionProbe=(...args)=>{
    const hit=raw(...args);if(!hit.colliderEntityId)return hit;
    const {normalWorldXYZ:_normal,...withoutNormal}=hit;
    return {...withoutNormal,...(invalid?{normalWorldXYZ:[Number.MAX_VALUE,Number.MAX_VALUE,0] as Vec3}:{})};
  };
  const solver=new CameraCollisionSolver(probe);
  const input:CameraCollisionRequest={target:[-8,1.1,0],eye:[2.2,2.68,0],current:[0,2,0],sweepFrom:[0,2,0],radius:.2,canIgnoreArmObstruction:()=>true};
  const result=solver.solve(input,walkingTiming(1));
  expect(result.phase).toBe('constrained');expect(result.position[0]).toBeLessThan(.1);
  expect(raw(result.position,result.position,.2).startedOverlapping).not.toBe(true);
  const before=solver.captureTransactionState();invalid=true;
  expect(()=>solver.solve(input,walkingTiming(2))).toThrow('CAMERA_COLLISION_PROBE_INVALID');
  expect(solver.captureTransactionState()).toEqual(before);
  expect(()=>solver.project(input)).toThrow('CAMERA_COLLISION_PROBE_INVALID');
  expect(solver.captureTransactionState()).toEqual(before);
});

it('keeps slide projection independent of committed recovery and records the actual swept eye',()=>{
  const probe=boxProbe([wing]),solver=new CameraCollisionSolver(probe),control=new CameraCollisionSolver(probe);
  const input:CameraCollisionRequest={target:[-8,1.1,0],eye:[2.2,2.68,0],current:[0,2,0],sweepFrom:[0,2,0],radius:.2,canIgnoreArmObstruction:()=>true};
  const first=solver.solve(input,walkingTiming(1));expect(control.solve(input,walkingTiming(1))).toEqual(first);
  const before=solver.captureTransactionState();
  expect(before.lastSafePositionMetersXYZ).toEqual(first.position);
  expect(before.constrainedArmLengthMeters).toBeCloseTo(first.effectiveDistance,10);
  const next={...input,current:first.position,sweepFrom:first.position,target:[-9,1.1,0] as Vec3,eye:[1.2,2.68,0] as Vec3};
  const projected=solver.project(next);
  for(let i=0;i<10;i++)expect(solver.project(next)).toEqual(projected);
  expect(solver.captureTransactionState()).toEqual(before);
  expect(solver.solve(next,walkingTiming(2))).toEqual(control.solve(next,walkingTiming(2)));
});

it('retains immediate radial correction instead of sliding when the arm itself is obstructed',()=>{
  const probe=boxProbe([wing]);
  const input:CameraCollisionRequest={target:[-8,1.1,0],eye:[2.2,2.68,0],current:[0,2,0],sweepFrom:[0,2,0],radius:.2};
  const withSweep=new CameraCollisionSolver(probe).solve(input,walkingTiming(1));
  const {sweepFrom:_sweepFrom,...radialInput}=input;
  const withoutSweep=new CameraCollisionSolver(probe).solve(radialInput,walkingTiming(1));
  expect(withSweep).toEqual(withoutSweep);expect(withSweep.entityId).toBe('wing');
  expect(withSweep.effectiveDistance).toBeLessThan(length(input.target,input.eye));
});

it('rolls back a failed tangent query without committing a partial slide',()=>{
  const raw=boxProbe([wing]);let fail=false,failedTangent=false;
  const probe:CameraCollisionProbe=(from,to,radius)=>{
    if(fail&&length(from,to)>.1&&Math.abs(from[1]-to[1])<1e-8){failedTangent=true;throw new Error('SLIDE_QUERY_FAILURE');}
    return raw(from,to,radius);
  };
  const solver=new CameraCollisionSolver(probe);
  const input:CameraCollisionRequest={target:[-8,1.1,0],eye:[2.2,2.68,0],current:[0,2,0],sweepFrom:[0,2,0],radius:.2,canIgnoreArmObstruction:()=>true};
  const first=solver.solve(input,walkingTiming(1)),before=solver.captureTransactionState();
  const next={...input,current:first.position,sweepFrom:first.position,target:[-9,1.1,0] as Vec3,eye:[1.2,2.68,0] as Vec3};
  fail=true;
  expect(()=>solver.solve(next,walkingTiming(2))).toThrow('SLIDE_QUERY_FAILURE');expect(failedTangent).toBe(true);
  expect(solver.captureTransactionState()).toEqual(before);
  expect(()=>solver.project(next)).toThrow('SLIDE_QUERY_FAILURE');expect(solver.captureTransactionState()).toEqual(before);
});

it('anticipates loss of usable subject visibility once, while display only projects hard safety',()=>{
  let ratio=1,calls=0;
  const probe:CameraCollisionProbe=(from,to,radius)=>{
    const travel=length(from,to);
    return travel>2?{distanceMeters:2,colliderEntityId:'roof',normalWorldXYZ:[0,0,-1]}:{distanceMeters:travel};
  };
  const solver=new CameraCollisionSolver(probe);
  const input:CameraCollisionRequest={...request,canIgnoreArmObstruction:()=>true,
    subjectVisibilityClearance:{marginMeters:.6,measureRatio:()=>{calls++;return ratio;}}};
  expect(solver.solve(input,timing(1)).position).toEqual(request.eye);
  ratio=.5;
  const fixed=solver.solve(input,timing(2));
  expect(fixed.effectiveDistance).toBeGreaterThan(2);expect(fixed.effectiveDistance).toBeLessThan(8);
  expect(fixed.entityId).toBe('roof');
  const before=solver.captureTransactionState(),count=calls;
  const displayed={...input,eye:fixed.position,current:fixed.position};
  for(let i=0;i<4;i++)expect(solver.project(displayed).position).toEqual(fixed.position);
  expect(calls).toBe(count);expect(solver.captureTransactionState()).toEqual(before);
});

it('does not treat an already narrow space as an approaching visibility edge',()=>{
  let calls=0;
  const solver=new CameraCollisionSolver((from,to,radius)=>radius>.2
    ?{distanceMeters:0,startedOverlapping:true,colliderEntityId:'corridor'}
    :{distanceMeters:length(from,to)});
  const input:CameraCollisionRequest={...request,subjectVisibilityClearance:{marginMeters:.6,measureRatio:()=>{calls++;return 0;}}};
  expect(solver.solve(input,timing(1)).position).toEqual(request.eye);expect(calls).toBe(0);
});

it('converts a grazing visibility contact along the arm instead of subtracting metres of valid framing',()=>{
  const probe=boxProbe([{id:'wall',minimum:[1,-10,-20],maximum:[1.2,10,20]}]);
  const input:CameraCollisionRequest={target:[0,0,0],eye:[.9,0,8],current:[0,0,8],radius:.2};
  const hard=new CameraCollisionSolver(probe).solve(input,timing(1));
  const anticipated=new CameraCollisionSolver(probe).solve({...input,
    subjectVisibilityClearance:{marginMeters:.6,measureRatio:()=>0}},timing(1));
  // The perpendicular radius difference is divided by the incidence cosine.
  // Adding .6 directly used to turn this >7m safe arm into a <3m arm.
  expect(hard.effectiveDistance).toBeGreaterThan(7);
  expect(anticipated.effectiveDistance).toBeCloseTo(hard.effectiveDistance,8);
  expect(probe(anticipated.position,anticipated.position,.2).startedOverlapping).not.toBe(true);
});

it('rejects occupied intermediate soft framing and falls back to the clear radial segment',()=>{
  const probe:CameraCollisionProbe=(from,to,radius)=>{
    const travel=length(from,to);
    if(travel===0)return {distanceMeters:0,startedOverlapping:from[2]>3&&from[2]<6};
    return travel>2?{distanceMeters:2,colliderEntityId:'roof',normalWorldXYZ:[0,0,-1]}:{distanceMeters:travel};
  };
  const solver=new CameraCollisionSolver(probe);
  const result=solver.solve({...request,canIgnoreArmObstruction:()=>true,
    subjectVisibilityClearance:{marginMeters:.6,measureRatio:()=>.5}},timing(1));
  expect(result.position[2]).toBeCloseTo(1.98);
  expect(probe(result.position,result.position,.2).startedOverlapping).not.toBe(true);
});

it('rolls back failed visibility-clearance measurements without altering the committed camera',()=>{
  let ratio=1;
  const solver=new CameraCollisionSolver((from,to)=>({distanceMeters:Math.min(2,length(from,to)),colliderEntityId:'edge'}));
  const input:CameraCollisionRequest={...request,canIgnoreArmObstruction:()=>true,
    subjectVisibilityClearance:{marginMeters:.6,measureRatio:()=>ratio}};
  solver.solve(input,timing(1));const before=solver.captureTransactionState();
  for(const invalid of [NaN,-.1,1.1]){ratio=invalid;expect(()=>solver.solve(input,timing(2))).toThrow('CAMERA_COLLISION_PROBE_INVALID');expect(solver.captureTransactionState()).toEqual(before);}
});
