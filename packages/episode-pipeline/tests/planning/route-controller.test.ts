import { describe, expect, it } from 'vitest';
import {createWorld, type CameraDocument, type Vec3, type WorldSnapshot} from '@worldkit/three';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,Vector3} from 'three';
import type { EpisodeSegmentPlan } from '../../src/contracts.js';
import { playerBehaviorFeedback, PlayerCaptureController } from '../../src/planning/player-controller.js';
import { RouteController, routeDirectionInput } from '../../src/planning/route-controller.js';

const movement = { kind: 'ground', walkSpeedMetersPerSecond: 4, runSpeedMetersPerSecond: 7, heightMeters: 1.8, radiusMeters: 0.3, jumpSpeedMetersPerSecond: 5 };
function snapshot(position: Vec3, grounded = true): WorldSnapshot {
  return { schemaVersion: 2, worldRevision: 0, simulationTick: 1, simulationSeconds: 0, isRunning: false, controlledEntityId: 'actor',
    camera: {viewId:'explore',viewKind:'third-person',documentHash:'fixture-camera',configurationRevision:1,cameraCommitRevision:1,lifecycleGeneration:1,logicalTargetId:'actor',resolvedSubjectId:'actor',subjectGeneration:1,transition:{kind:'none',configuredDurationSeconds:0,effectiveDurationSeconds:0}, mode: 'follow', positionWorldMetersXYZ: [0, 3, 5], orientationWorldQuaternionXYZW: [0, 0, 0, 1], desiredPositionWorldMetersXYZ: [0, 3, 5], desiredYawRadians: 0, desiredPitchRadians: 0 },
    entities: [{ id: 'actor', generation: 0, geometryVersion: 0, name: 'actor', tags: [], role: 'actor', appearancePrompt: '', positionWorldMetersXYZ: position, rotationLocalRadiansXYZ: [0, 0, 0], scaleLocalXYZ: [1, 1, 1], isActive: true, isVisibleLocal: true, isVisibleEffective: true, controlOwners: [], motion: { phase: grounded ? 'grounded' : 'falling', isGrounded: grounded, velocityWorldMetersPerSecondXYZ: [0, 0, 0], collisionEntityIds: ['pillar-east'] } }], errors: [] };
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

const noProbe = async () => { throw new Error('Unexpected jump probe'); };
async function cameraWorld(referenceFrame:'world-up'|'subject-heading'='world-up',armHalfLifeSeconds=0) {
  const world=await createWorld({navigation:false});
  const geometry=new BoxGeometry(200,1,200),material=new MeshBasicMaterial(),ground=new Mesh(geometry,material);
  ground.position.y=-.5;world.addEntity({id:'floor',object:ground,role:'terrain'});
  world.onDispose(()=>{geometry.dispose();material.dispose();});
  let heading=0;
  world.registerMovement({id:'heading-fixture',version:1,description:'Physical support with externally chosen facing intent',initialState:null,
    update:()=>({state:null,velocityWorldMetersPerSecondXYZ:[0,0,0],applyGravity:true,facingDirectionWorldXYZ:[-Math.sin(heading),0,-Math.cos(heading)]})});
  world.addCharacter({id:'actor',object:new Group(),body:{heightMeters:1.8,radiusMeters:.3},movement:{kind:'custom',movementId:'heading-fixture'}});
  world.setControlledEntity('actor');
  const view=(pitch:number)=>({kind:'third-person' as const,overrides:{position:{subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0,armHalfLifeSeconds},
    orientation:{initialPitchRadians:pitch,referenceFrame,inheritSubjectYaw:true,recenter:{enabled:false}},constraints:{collision:{enabled:false}}}});
  const document:CameraDocument={kind:'world-camera',schemaVersion:1,defaultViewId:'explore',activation:'immediate',binding:{targetEntityId:'actor'},
    transition:{durationSeconds:.25},views:{explore:view(.2),aim:view(.8)}};
  world.setCameraFollow({configuration:document});world.step({},30);
  return {world,document,face:(yaw:number)=>{heading=yaw;world.step({},1);},forward:()=>world.camera.getWorldDirection(new Vector3()).toArray()};
}

it('waits for the destination view before rebasing and restores the reset camera baseline',async()=>{
  const {world,forward}=await cameraWorld();
  const controller=new PlayerCaptureController(segment({id:'segment-01'}),{...movement,jumpSpeedMetersPerSecond:0},'follow',noProbe);
  try {
    await controller.step(world.snapshot(),forward(),0);
    controller.pause(.05);world.setCameraView('aim');
    expect(world.snapshot().camera.transition.kind).toBe('blend');
    for(let tick=0;tick<20;tick++){
      const decision=await controller.step(world.snapshot(),forward(),.1+tick/60);
      expect(decision.input.cameraYawRatio??0).toBe(0);
      expect(decision.input.cameraPitchRatio??0).toBe(0);
      world.step({},1);
    }
    expect(world.snapshot().camera.transition.kind).toBe('none');
    expect(world.snapshot().camera.desiredPitchRadians).toBe(.8);
    controller.pause(.5);await world.reset();world.step({},30);
    const restored=await controller.step(world.snapshot(),forward(),.6);
    expect(world.snapshot().camera.desiredPitchRadians).toBe(.2);
    expect(restored.input.cameraPitchRatio).toBe(0);
  } finally {world.dispose();}
});

it('retains the look baseline across an ordinary pause and per-frame camera commits',async()=>{
  const {world,forward}=await cameraWorld();
  const controller=new PlayerCaptureController(segment({id:'segment-01'}),{...movement,jumpSpeedMetersPerSecond:0},'follow',noProbe);
  try {
    await controller.step(world.snapshot(),forward(),0);
    controller.pause(.1);world.step({cameraPitchRatio:1},12);
    const resumed=await controller.step(world.snapshot(),forward(),.3);
    expect(world.snapshot().camera.desiredPitchRadians).toBeGreaterThan(.3);
    expect(resumed.input.cameraPitchRatio).toBeLessThan(0);
  } finally {world.dispose();}
});

it('observes a complete A to B to A view sequence while route input is paused',async()=>{
  const {world,forward}=await cameraWorld();
  const controller=new PlayerCaptureController(segment({id:'segment-01'}),{...movement,jumpSpeedMetersPerSecond:0},'follow',noProbe);
  try {
    world.step({cameraPitchRatio:1},12);
    await controller.step(world.snapshot(),forward(),0);
    expect(world.snapshot().camera.desiredPitchRadians).toBeGreaterThan(.3);
    for(const [index,viewId] of ['aim','explore'].entries()){
      world.setCameraView(viewId);
      for(let tick=0;tick<20;tick++){
        controller.pause(.1+index*.4+tick/60,world.snapshot());
        world.step({},1);
      }
    }
    expect(world.snapshot().camera.viewId).toBe('explore');
    expect(world.snapshot().camera.desiredPitchRadians).toBe(.2);
    const resumed=await controller.step(world.snapshot(),forward(),1);
    expect(resumed.input.cameraPitchRatio).toBe(0);
  }finally{world.dispose();}
});

it.each(['documentHash','configurationRevision','viewId','resolvedSubjectId','subjectGeneration','lifecycleGeneration','clock-reset'] as const)(
  'discards cached camera response and framing after %s changes',async field=>{
    const create=()=>new PlayerCaptureController(segment({id:'segment-01'}),{...movement,jumpSpeedMetersPerSecond:0},'follow',noProbe);
    const controller=create(),first=snapshot([0,0,0]);
    await controller.step({...first,simulationSeconds:5},[0,0,-1],5);
    await controller.step({...first,simulationSeconds:5.1,camera:{...first.camera,desiredYawRadians:-.002,desiredPitchRadians:.001}},[0,0,-1],5.1);
    const changed={...first,simulationSeconds:field==='clock-reset'?0:5.2,camera:{...first.camera,desiredYawRadians:1,desiredPitchRadians:.8,
      ...(field==='clock-reset'?{}:{[field]:typeof first.camera[field]==='number'?2:'changed'})}};
    const resumed=await controller.step(changed,[-Math.sin(1),0,-Math.cos(1)],5.2);
    const fresh=await create().step(changed,[-Math.sin(1),0,-Math.cos(1)],5.2);
    expect(resumed.input.cameraPitchRatio).toBe(fresh.input.cameraPitchRatio);
    expect(resumed.input.cameraYawRatio).toBe(fresh.input.cameraYawRatio);
  });

it.each(['world-up','subject-heading'] as const)('compares route heading in world space with a %s camera',async referenceFrame=>{
  const {world,forward,face}=await cameraWorld(referenceFrame),heading=.4;
  const controller=new PlayerCaptureController(segment({id:'segment-01',waypoints:[{positionWorldMetersXYZ:[-20*Math.sin(heading),0,-20*Math.cos(heading)],gait:'walk'}]}),
    {...movement,kind:'custom',jumpSpeedMetersPerSecond:0},'follow',noProbe);
  try {
    await controller.step(world.snapshot(),forward(),0);
    face(heading);
    const decision=await controller.step(world.snapshot(),forward(),2);
    if(referenceFrame==='subject-heading'){
      expect(Math.atan2(-forward()[0],-forward()[2])).toBeCloseTo(heading);
      expect(world.snapshot().camera.desiredYawRadians).toBeCloseTo(0);
      expect(decision.input.cameraYawRatio).toBeCloseTo(0);
    }else expect(decision.input.cameraYawRatio).toBeGreaterThan(0);
  }finally{world.dispose();}
});

it.each(['authored','follow-pending','blend'] as const)('leaves a mounted %s camera to its current owner or transition',async state=>{
  const initial=snapshot([0,0,0]);
  const mounted={...initial,humanoid:{mountedInstanceId:'vehicle',vehicles:[{instanceId:'vehicle',mode:'wheeled'}]},
    entities:[...initial.entities,{...initial.entities[0]!,id:'vehicle'}],camera:{...initial.camera,
      mode:state==='blend'?'follow':state,
      ...(state==='blend'?{transition:{kind:'blend',targetViewId:'explore',elapsedSeconds:.1,durationSeconds:.5,configuredDurationSeconds:.5,effectiveDurationSeconds:.5}}:{})}} as unknown as WorldSnapshot;
  const controller=new PlayerCaptureController(segment(),movement,'follow',noProbe);
  const decision=await controller.step(mounted,[0,0,-1],2);
  expect(decision.input.humanoid).toBeDefined();
  expect(decision.input.cameraYawRatio).toBeUndefined();
  expect(decision.input.cameraPitchRatio).toBeUndefined();
  expect(decision.behavior.cameraSupported).toBe(state!=='authored');
});

it.each([0,Math.PI])('keeps optional yaw input from diverging under a subject-up opening with roll %s',async roll=>{
  const world=await createWorld({navigation:false}),object=new Group();object.position.y=3;object.rotation.z=roll;
  world.registerMovement({id:'still',version:1,description:'Stationary orbit probe',initialState:null,
    update:()=>({state:null,velocityWorldMetersPerSecondXYZ:[0,0,0],applyGravity:false})});
  world.addCharacter({id:'actor',object,body:{heightMeters:1.8,radiusMeters:.3},movement:{kind:'custom',movementId:'still'}});world.setControlledEntity('actor');
  const view={kind:'third-person' as const,opening:{positionWorldMetersXYZ:[0,4,8] as const,lookAtWorldMetersXYZ:[0,3,0] as const,fovDegrees:55},overrides:{
    framing:{kind:'preserve-opening' as const},position:{anchor:{kind:'origin' as const},subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0,armHalfLifeSeconds:0},
    orientation:{referenceFrame:'subject-up' as const,inheritSubjectYaw:true,pitchLimitsRadians:{kind:'unbounded' as const},recenter:{enabled:false}},
    zoom:{range:{kind:'unbounded' as const},halfLifeSeconds:0},constraints:{collision:{enabled:false}}}};
  world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,activation:'immediate',defaultViewId:'explore',binding:{targetEntityId:'actor'},transition:{durationSeconds:0},views:{explore:view,other:view}}});
  const controller=new PlayerCaptureController(segment(),{...movement,kind:'custom',jumpSpeedMetersPerSecond:0},'follow',noProbe);
  const forward=()=>world.camera.getWorldDirection(new Vector3()).toArray();
  try {
    const decisions=[];
    for(let index=0;index<12;index++){
      const decision=await controller.step(world.snapshot(),forward(),5+index*.05);decisions.push(decision);
      // Isolate yaw response while preserving the legal rolled subject pose.
      world.step({cameraYawRatio:decision.input.cameraYawRatio??0},3);
    }
    expect(decisions[0]!.input.cameraYawRatio).toBeGreaterThan(0);
    if(roll){
      expect(decisions.slice(1).every(decision=>decision.input.cameraYawRatio===0)).toBe(true);
      expect(decisions[1]!.behavior.cameraYawUnavailableReason).toBe('opposed-world-response');
      expect(Math.abs(Math.atan2(-forward()[0],-forward()[2]))).toBeLessThan(.002);
      expect(decisions[1]!.input.cameraPitchRatio).toBeGreaterThan(0);
      expect(Math.abs(decisions[1]!.input.moveZRatio??0)).toBeGreaterThan(0);
      const feedback=playerBehaviorFeedback([{snapshot:world.snapshot(),camera:{cameraToWorldMatrix:world.camera.matrixWorld.toArray()} as any,decision:decisions[1]!}],{camera:{mode:'follow'}} as any,true);
      expect(feedback.diagnostics).toEqual([expect.objectContaining({code:'CAMERA_YAW_ASSIST_UNAVAILABLE'})]);
      world.setCameraView('other');
      const rebased=await controller.step(world.snapshot(),forward(),5.7);
      expect(rebased.behavior.cameraYawUnavailableReason).toBeUndefined();
      expect(rebased.input.cameraYawRatio).toBeGreaterThan(0);
    }else{
      expect(decisions.every(decision=>decision.behavior.cameraYawUnavailableReason===undefined)).toBe(true);
      expect(Math.atan2(-forward()[0],-forward()[2])).toBeGreaterThan(.01);
    }
  }finally{world.dispose();}
});

it('does not disable yaw assistance when a body turn opposes a camera probe',async()=>{
  const {world,forward,face}=await cameraWorld('subject-heading');
  const controller=new PlayerCaptureController(segment(),{...movement,kind:'custom',jumpSpeedMetersPerSecond:0},'follow',noProbe);
  try{
    const first=await controller.step(world.snapshot(),forward(),5);
    world.step({cameraYawRatio:first.input.cameraYawRatio??0},3);face(-.2);
    const next=await controller.step(world.snapshot(),forward(),5.05);
    expect(Math.atan2(-forward()[0],-forward()[2])).toBeLessThan(0);
    expect(next.behavior.cameraYawUnavailableReason).toBeUndefined();
    expect(next.input.cameraYawRatio).toBeGreaterThan(0);
  }finally{world.dispose();}
});

it('retains a confirmed upright yaw response through damping after an input reversal',async()=>{
  const {world,forward}=await cameraWorld('world-up',.35);
  const controller=new PlayerCaptureController(segment(),{...movement,kind:'custom',jumpSpeedMetersPerSecond:0},'follow',noProbe);
  let sawOpposingLag=false;
  try{
    for(let index=0;index<120;index++){
      const before=Math.atan2(-forward()[0],-forward()[2]);
      const decision=await controller.step(world.snapshot(),forward(),4.6+index/60);
      expect(decision.behavior.cameraYawUnavailableReason).toBeUndefined();
      world.step({cameraYawRatio:decision.input.cameraYawRatio??0},1);
      const delta=Math.atan2(-forward()[0],-forward()[2])-before;
      if(Math.abs(delta)>1e-5&&delta*(decision.input.cameraYawRatio??0)<0)sawOpposingLag=true;
    }
    expect(sawOpposingLag).toBe(true);
  }finally{world.dispose();}
});
