import { expect, it } from 'vitest';
import { CameraCollisionSolver, type CameraCollisionProbe, type CameraCollisionRequest } from './camera-collision-solver';

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
