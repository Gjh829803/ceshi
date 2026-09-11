import { describe, expect, it } from 'vitest';
import type { Vec3, WorldSnapshot } from '@worldkit/three';
import type { EpisodeSegmentPlan } from '../../src/contracts.js';
import { playerBehaviorFeedback, PlayerCaptureController } from '../../src/planning/player-controller.js';
import { RouteController, routeDirectionInput } from '../../src/planning/route-controller.js';

const movement = { kind: 'ground', walkSpeedMetersPerSecond: 4, runSpeedMetersPerSecond: 7, heightMeters: 1.8, radiusMeters: 0.3, jumpSpeedMetersPerSecond: 5 };
function snapshot(position: Vec3, grounded = true): WorldSnapshot {
  return { schemaVersion: 2, worldRevision: 0, simulationTick: 1, simulationSeconds: 0, isRunning: false, controlledEntityId: 'actor',
    camera: { mode: 'follow', positionWorldMetersXYZ: [0, 3, 5], orientationWorldQuaternionXYZW: [0, 0, 0, 1], desiredPositionWorldMetersXYZ: [0, 3, 5], desiredYawRadians: 0, desiredPitchRadians: 0 },
    entities: [{ id: 'actor', generation: 0, geometryVersion: 0, name: 'actor', tags: [], role: 'actor', appearancePrompt: '', positionWorldMetersXYZ: position, rotationLocalRadiansXYZ: [0, 0, 0], scaleLocalXYZ: [1, 1, 1], isVisibleLocal: true, isVisibleEffective: true, controlOwners: [], motion: { phase: grounded ? 'grounded' : 'falling', isGrounded: grounded, velocityWorldMetersPerSecondXYZ: [0, 0, 0], collisionEntityIds: ['pillar-east'] } }], errors: [] };
}
const segment = (overrides: Partial<EpisodeSegmentPlan> = {}): EpisodeSegmentPlan => ({ id: 'segment-00', start: { positionWorldMetersXYZ: [0, 0, 0], facingYawRadians: 0 }, waypoints: [{ positionWorldMetersXYZ: [0, 0, -20], gait: 'walk' }], endBehavior: 'stop', purpose: 'travel', ...overrides });

describe('Three episode route controller', () => {
  it('converts a world direction through the actual SDK input basis after camera rotation', () => {
    expect(routeDirectionInput([0, 0, 0], [0, 0, -10], [0, 0, -1], true)).toEqual({ moveXRatio: 0, moveZRatio: -1, run: true });
    const rotated = routeDirectionInput([0, 0, 0], [0, 0, -10], [-1, 0, 0], false);
    expect(rotated.moveXRatio).toBe(1); expect(rotated.moveZRatio).toBeCloseTo(0);
    expect(() => routeDirectionInput([0, 0, 0], [0, 0, -10], [0, 1, 0], false)).toThrow('BASIS_INVALID');
  });
  it('does not accept an XZ arrival on another floor', () => {
    const controller = new RouteController(segment({ waypoints: [{ positionWorldMetersXYZ: [0, 5, 0], gait: 'walk' }] }), movement);
    expect(controller.step(snapshot([0, 0, 0]), [0, 0, -1], 0).mode).toBe('travel');
    expect(controller.step(snapshot([0, 0, 0]), [0, 0, -1], 1.2).diagnostic?.code).toBe('ROUTE_VERTICAL_MISMATCH');
  });
  it('makes one supported jump attempt, then returns a bounded blocked diagnostic with collider identity', () => {
    const controller = new RouteController(segment(), movement);
    controller.step(snapshot([0, 0, 0]), [0, 0, -1], 0);
    expect(controller.step(snapshot([0, 0, 0]), [0, 0, -1], 1.1).input.jumpPressed).toBe(true);
    expect(controller.step(snapshot([0, 0, 0], false), [0, 0, -1], 1.2).input.jumpPressed).toBeUndefined();
    expect(controller.step(snapshot([0, 0, 0]), [0, 0, -1], 2.6).diagnostic).toMatchObject({ code: 'ROUTE_BLOCKED', collisionEntityIds: ['pillar-east'] });
  });
  it('backs up only along an actually traversed supported path and fails if that return is blocked', () => {
    const controller = new RouteController(segment(), { ...movement, jumpSpeedMetersPerSecond: 0 });
    controller.step(snapshot([0, 0, 0]), [0, 0, -1], 0);
    controller.step(snapshot([0, 0, -1]), [0, 0, -1], 0.5);
    const back = controller.step(snapshot([0, 0, -1]), [0, 0, -1], 3.1);
    expect(back.mode).toBe('backtrack'); expect(back.targetPositionWorldMetersXYZ).toEqual([0, 0, 0]); expect(back.input.moveZRatio).toBe(1);
    expect(controller.step(snapshot([0, 0, -1]), [0, 0, -1], 5.2).diagnostic?.code).toBe('ROUTE_BACKTRACK_BLOCKED');
  });
  it('physically returns to the original start when a reverse route has one waypoint', () => {
    const controller = new RouteController(segment({ endBehavior: 'reverse' }), movement);
    const reverse = controller.step(snapshot([0, 0, -20]), [0, 0, -1], 5);
    expect(reverse.mode).toBe('travel'); expect(reverse.targetPositionWorldMetersXYZ).toEqual([0, 0, 0]); expect(reverse.input.moveZRatio).toBe(1);
    const forward = controller.step(snapshot([0, 0, 0]), [0, 0, -1], 10);
    expect(forward.targetPositionWorldMetersXYZ).toEqual([0, 0, -20]); expect(forward.input.moveZRatio).toBe(-1);
  });
  it('stops only on three-dimensional arrival and never infers world connectivity', () => {
    const controller = new RouteController(segment(), movement);
    expect(controller.step(snapshot([0.1, 0.1, -20.1]), [0, 0, -1], 5).mode).toBe('finished');
  });
});

// Regression: unobstructed travel used to contain neither observation nor a normal jump.
it('includes visible looking and a deliberate jump during healthy traversal', async () => {
  const controller = new PlayerCaptureController(segment({ waypoints: [{positionWorldMetersXYZ: [0,0,-200], gait: 'walk'}] }), movement, 'follow', async start => ({isValid: true, requestedPositionWorldMetersXYZ: start.positionWorldMetersXYZ, resolvedPositionWorldMetersXYZ: start.positionWorldMetersXYZ, diagnostics: []}));
  const decisions = [];
  for (let i = 0; i < 720; i++) decisions.push(await controller.step(snapshot([0,0,-i/24*2]), [0,0,-1], i/24));
  expect(decisions.some(d => Math.abs(d.input.cameraYawRatio ?? 0) >= 0.01)).toBe(true);
  expect(decisions.some(d => d.input.jumpPressed)).toBe(true);
  expect(decisions.some(d => d.input.run)).toBe(false);
});

it('does not jump on rejected local support, and skips camera commands for an authored camera', async () => {
  const probe = async (start: {positionWorldMetersXYZ: Vec3}) => ({isValid: false, requestedPositionWorldMetersXYZ: start.positionWorldMetersXYZ, resolvedPositionWorldMetersXYZ: start.positionWorldMetersXYZ, diagnostics: [{code:'NO_SUPPORT',message:'edge'}]});
  const controller = new PlayerCaptureController(segment({waypoints:[{positionWorldMetersXYZ:[0,0,-200],gait:'run'}]}), movement, 'authored', probe);
  const decisions = [];
  for (let i = 0; i < 720; i++) decisions.push(await controller.step(snapshot([0,0,-i/24*2]), [0,0,-1], i/24));
  expect(decisions.some(d => d.input.jumpPressed)).toBe(false);
  expect(decisions.every(d => !d.input.cameraYawRatio && !d.input.cameraPitchRatio)).toBe(true);
  expect(decisions.at(-1)?.behavior.plannedJump).toBe('deferred');
});

it('does not treat the deliberate observation pause as a blocked route', async () => {
  const controller = new PlayerCaptureController(segment({waypoints:[{positionWorldMetersXYZ:[0,0,-200],gait:'walk'}]}), {...movement,jumpSpeedMetersPerSecond:0}, 'follow', async start => ({isValid:true, requestedPositionWorldMetersXYZ:start.positionWorldMetersXYZ,resolvedPositionWorldMetersXYZ:start.positionWorldMetersXYZ,diagnostics:[]}));
  let z = 0;
  for (let i = 0; i < 240; i++) {
    const decision = await controller.step(snapshot([0,0,z]), [0,0,-1], i/24);
    expect(decision.mode).toBe('travel'); expect(decision.input.jumpPressed).not.toBe(true);
    z += (decision.input.moveZRatio ?? 0)*2/24;
  }
});

it('keeps optional camera and generated jump evidence advisory',()=>{
 expect(playerBehaviorFeedback([], {camera:{mode:'follow'},movement:{walkSpeedMetersPerSecond:2,runSpeedMetersPerSecond:5}} as any).diagnostics).toEqual([expect.objectContaining({code:'CAMERA_VARIATION_LOW'})]);
});

it('passes the requested gait to custom vertical movement independently of ground input axes',async()=>{
 const requests:any[]=[];
 const controller=new PlayerCaptureController(segment({waypoints:[{positionWorldMetersXYZ:[0,6,0],gait:'run'}]}),{...movement,kind:'custom'},'authored',async start=>({isValid:true,requestedPositionWorldMetersXYZ:start.positionWorldMetersXYZ,resolvedPositionWorldMetersXYZ:start.positionWorldMetersXYZ,diagnostics:[]}),async request=>{requests.push(request);return {moveYRatio:1};});
 const decision=await controller.step(snapshot([0,3,0]),[0,0,-1],0);
 expect(requests[0]).toMatchObject({targetPositionWorldMetersXYZ:[0,6,0],gait:'run'});expect(decision.input.moveYRatio).toBe(1);
});

it('resumes custom route progress timing after an action pause',async()=>{
 const controller=new PlayerCaptureController(segment({waypoints:[{positionWorldMetersXYZ:[0,6,0],gait:'walk'}]}),{...movement,kind:'custom'},'authored',async start=>({isValid:true,requestedPositionWorldMetersXYZ:start.positionWorldMetersXYZ,resolvedPositionWorldMetersXYZ:start.positionWorldMetersXYZ,diagnostics:[]}),async()=>({moveYRatio:1}));
 controller.pause(1);let decision;
 for(let time=1;time<=6;time+=.25)decision=await controller.step(snapshot([0,3,0]),[0,0,-1],time);
 expect(decision?.mode).toBe('failed');
});

it('skips follow intent after the live snapshot switches to authored mode',async()=>{
 const controller=new PlayerCaptureController(segment({waypoints:[{positionWorldMetersXYZ:[0,0,-200],gait:'walk'}]}),movement,'follow',async start=>({isValid:true,requestedPositionWorldMetersXYZ:start.positionWorldMetersXYZ,resolvedPositionWorldMetersXYZ:start.positionWorldMetersXYZ,diagnostics:[]}));
 for(let i=0;i<360;i++) {
  const initial=snapshot([0,0,-i/12]);
  const state:WorldSnapshot={...initial,camera:{...initial.camera,mode:'authored',desiredPositionWorldMetersXYZ:null,desiredYawRadians:null,desiredPitchRadians:null}};
  const decision=await controller.step(state,[0,0,-1],i/24);
  expect(decision.input.cameraYawRatio??0).toBe(0);
  expect(decision.input.cameraPitchRatio??0).toBe(0);
 }
});
