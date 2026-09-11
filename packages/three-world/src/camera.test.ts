import {readCameraWorldPose} from './camera-observation';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ThreeCameraRig } from './camera.js';
import { ThreePhysics } from './physics.js';
import { createWorld } from './world.js';
import type { Vec3 } from './engine-contracts.js';
import type {WorldEngine} from './engine.js';

const distance = (a: Vec3, b: Vec3) => new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
const unobstructed = (target: Vec3, eye: Vec3) => ({ distanceMeters: distance(target, eye) });
function fixture() {
  const camera = new THREE.PerspectiveCamera(47, 1.7, .05, 500);
  camera.position.set(3, 4, 8); camera.lookAt(0, 1.3, 0);
  const rig = new ThreeCameraRig(camera, unobstructed, () => [0, 0, 0]);
  return { camera, rig };
}

describe('ThreeCameraRig', () => {
  it('moves a pending opening with the newly mounted subject before first movement',()=>{
    const camera=new THREE.PerspectiveCamera();camera.position.set(0,2.2,3.55);camera.lookAt(0,1.49,0);
    let position:Vec3=[0,0,0];const rig=new ThreeCameraRig(camera,unobstructed,()=>position);
    rig.setFollow({targetEntityId:'player'});const baseline=rig.snapshot(),opening=camera.clone();
    position=[4,1,-6];rig.retarget('car');rig.update(0);
    expect(rig.mode).toBe('follow-pending');
    expect(camera.position.distanceTo(opening.position.clone().add(new THREE.Vector3(...position)))).toBeLessThan(1e-7);
    rig.updateDesired({activate:true},1/60);rig.update(1/60);
    expect(rig.snapshot().desiredArmDistanceMeters).toBeCloseTo(baseline.desiredArmDistanceMeters!,7);
    expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
  });
  it.each([false,true])('keeps a dismounted actor in frame without adopting the obstructed vehicle camera (obstructed %s)',obstructed=>{
    const camera=new THREE.PerspectiveCamera(50,1.6,.05,1000);
    camera.position.set(0,2.2,3.55);camera.lookAt(0,1.49,0);
    let sample={id:'player',positionWorldMetersXYZ:[0,0,0] as Vec3,body:{heightMeters:1.68,radiusMeters:.3}},blocked=false;
    const rig=new ThreeCameraRig(camera,(target,eye)=>({distanceMeters:blocked?Math.min(.8,distance(target,eye)):distance(target,eye)}),{sample:()=>sample});
    rig.setFollow({targetEntityId:'player',activateOnInput:false});rig.update(1/60);
    const baseline=rig.snapshot();
    sample={id:'car',positionWorldMetersXYZ:[0,1.35,0],body:{heightMeters:2.3,radiusMeters:1.5}};
    rig.retarget('player');blocked=obstructed;for(let i=0;i<90;i++)rig.update(1/60);
    sample={id:'player',positionWorldMetersXYZ:[4.5,0,-.5],body:{heightMeters:1.68,radiusMeters:.3}};
    blocked=false;rig.retarget('player');for(let i=0;i<180;i++)rig.update(1/60);
    camera.updateMatrixWorld(true);
    for(const height of [.05,.84,1.63]){
      const projected=new THREE.Vector3(4.5,height,-.5).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(.95);expect(Math.abs(projected.y)).toBeLessThan(.95);
      expect(projected.z).toBeGreaterThan(-1);expect(projected.z).toBeLessThan(1);
    }
    expect(rig.snapshot().desiredArmDistanceMeters).toBeCloseTo(baseline.desiredArmDistanceMeters!,7);
    expect(rig.snapshot().desiredYawRadians).toBeCloseTo(baseline.desiredYawRadians!,7);
    expect(rig.snapshot().desiredPitchRadians).toBeCloseTo(baseline.desiredPitchRadians!,7);
  });
  it.each([0,.21])('keeps authored horizon roll through mount retargeting and pitch orbit (roll %s)',roll=>{
    const camera=new THREE.PerspectiveCamera();
    camera.position.set(0,2.2,18.55);camera.lookAt(0,1.49,15);camera.rotateZ(roll);
    let subject:Vec3=[0,0,15];
    const rig=new ThreeCameraRig(camera,unobstructed,()=>subject);
    rig.setFollow({targetEntityId:'player',activateOnInput:false});rig.sealInitialState();
    const opening=camera.quaternion.clone();
    const horizonRoll=()=>new THREE.Euler().setFromQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()),'YXZ').z;
    const expectRoll=()=>expect(horizonRoll()).toBeCloseTo(roll,7);
    for(const [id,position] of [['car',[8,0,.2]],['player',[10,0,.2]]] as const){
      const before=camera.clone();subject=position;rig.retarget(id);rig.update(0);
      expect(camera.quaternion.angleTo(before.quaternion)).toBeLessThan(1e-7);
      expect(camera.position.distanceTo(before.position)).toBeLessThan(1e-7);
      for(const pitch of [.35,.5,-.8]){
        rig.updateDesired({yawDeltaRadians:.4,pitchDeltaRadians:pitch},1/60);rig.update(1/60);expectRoll();
      }
    }
    rig.reset();expect(camera.quaternion.angleTo(opening)).toBeLessThan(1e-7);expectRoll();
  });
  it('keeps a rolled zero-arm declarative opening under a transformed camera parent',()=>{
    const parent=new THREE.Group();parent.position.set(3,2,5);parent.rotation.y=.4;
    const camera=new THREE.PerspectiveCamera();parent.add(camera);parent.updateMatrixWorld(true);
    const rig=new ThreeCameraRig(camera,unobstructed,()=>[0,0,0]);
    const opening={positionWorldMetersXYZ:[0,1.3,0],lookAtWorldMetersXYZ:[3,1.3,0],upWorldXYZ:[0,.8,.6],fovDegrees:41} as const;
    rig.setFollow({targetEntityId:'hero',opening,targetHeightMeters:1.3});
    const reference=new THREE.PerspectiveCamera();reference.position.fromArray(opening.positionWorldMetersXYZ);reference.up.fromArray(opening.upWorldXYZ);reference.lookAt(...opening.lookAtWorldMetersXYZ);
    rig.sealInitialState();rig.updateDesired({activate:true},1/60);rig.update(1/60);
    expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(reference.position)).toBeLessThan(1e-8);
    expect(camera.getWorldQuaternion(new THREE.Quaternion()).angleTo(reference.quaternion)).toBeLessThan(1e-7);
    expect(camera.up.toArray()).toEqual(opening.upWorldXYZ);expect(camera.fov).toBe(41);
    rig.reset();expect(camera.getWorldQuaternion(new THREE.Quaternion()).angleTo(reference.quaternion)).toBeLessThan(1e-7);
  });
  it('applies declarative framing once, preserves first input and smoothly recenters after manual orbit',()=>{
    const camera=new THREE.PerspectiveCamera(),position=new THREE.Vector3(),heading={backYawRadians:Math.PI/2,speedMetersPerSecond:4,recenterDelaySeconds:.1,recenterResponsePerSecond:2};
    const rig=new ThreeCameraRig(camera,unobstructed,{sample:()=>({id:'ride',positionWorldMetersXYZ:position.toArray(),heading})});
    const opening={positionWorldMetersXYZ:[0,3,8],lookAtWorldMetersXYZ:[0,1,0],fovDegrees:43} as const;
    rig.setFollow({targetEntityId:'person',opening,headingFollow:'vehicle',followHalfLifeSeconds:0});rig.sealInitialState();
    const pose=camera.clone();rig.updateDesired({activate:true},1/60);rig.update(1/60);
    expect(camera.position.distanceTo(pose.position)).toBeLessThan(1e-8);expect(camera.quaternion.angleTo(pose.quaternion)).toBeLessThan(1e-7);expect(camera.fov).toBe(43);
    for(let i=0;i<90;i++){rig.updateDesired({},1/60);rig.update(1/60);}
    expect(rig.desiredYawRadians).toBeGreaterThan(1);expect(rig.desiredYawRadians).toBeLessThan(Math.PI/2);
    rig.updateDesired({yawDeltaRadians:-.5},1/60);const manual=rig.desiredYawRadians;rig.update(1/60);expect(rig.desiredYawRadians).toBeCloseTo(manual);
    for(let i=0;i<90;i++){rig.updateDesired({},1/60);rig.update(1/60);}expect(rig.desiredYawRadians).toBeGreaterThan(manual);
    const before=camera.clone();expect(()=>rig.setFollow({targetEntityId:'person',opening:{...opening,fovDegrees:0}})).toThrow('WORLD_CAMERA_OPENING_INVALID');
    expect(camera.position.equals(before.position)).toBe(true);expect(camera.fov).toBe(43);
    rig.reset();expect(camera.position.distanceTo(pose.position)).toBeLessThan(1e-8);expect(camera.quaternion.angleTo(pose.quaternion)).toBeLessThan(1e-7);expect(rig.mode).toBe('follow-pending');
  });
  it('marks follow-only diagnostics not applicable after returning to authored camera',()=>{
    const {camera,rig}=fixture();rig.setFollow({targetEntityId:'hero',distanceMeters:6,activateOnInput:false});rig.update(1/60);rig.useAuthoredCamera();
    const pose=camera.position.clone(),rotation=camera.quaternion.clone();
    expect(rig.snapshot()).toMatchObject({mode:'authored',desiredPositionWorldMetersXYZ:null,desiredYawRadians:null,desiredPitchRadians:null});
    expect(rig.snapshot()).not.toHaveProperty('collisionPhase');expect(rig.snapshot()).not.toHaveProperty('desiredArmDistanceMeters');
    expect(camera.position).toEqual(pose);expect(camera.quaternion.equals(rotation)).toBe(true);
  });
  it('activates pending follow from the same jump edge used by locomotion',async()=>{
    const world=await createWorld({navigation:false});try{
      const ground=new THREE.Mesh(new THREE.BoxGeometry(20,1,20));ground.position.y=-.5;
      world.addEntity({id:'ground',object:ground,role:'terrain'});
      world.addCharacter({id:'hero',object:new THREE.Group(),body:{heightMeters:1.8,radiusMeters:.3}});
      world.setControlledEntity('hero');world.setCameraFollow({activateOnInput:true});world.step({},60);
      expect(world.cameraMode).toBe('follow-pending');
      world.step({jump:true,jumpPressed:false});expect(world.cameraMode).toBe('follow-pending');
      world.step({jumpPressed:true});expect(world.cameraMode).toBe('follow');
      expect(world.getEntityState('hero').motion!.velocityWorldMetersPerSecondXYZ[1]).toBeGreaterThan(0);
    }finally{world.dispose();}
  });

  it('restores only the near plane owned by first person and keeps pending author edits',()=>{
    const {camera,rig}=fixture();rig.setFollow({targetEntityId:'wolf'});camera.near=.7;
    rig.useAuthoredCamera();expect(camera.near).toBe(.7);
    rig.setFollow({targetEntityId:'wolf',view:{eyeOffsetLocalMetersXYZ:[0,1,0]}});camera.near=.4;
    rig.setPerspective('first-person');expect(camera.near).toBe(.035);
    rig.setPerspective('third-person');expect(camera.near).toBe(.4);
  });
  it('does not seal a temporary pre-start perspective as the configured reset default',()=>{
    const {rig}=fixture();rig.setFollow({targetEntityId:'wolf',view:{eyeOffsetLocalMetersXYZ:[0,1,0],defaultPerspective:'third-person'}});
    rig.setPerspective('first-person');rig.sealInitialState();rig.reset();
    expect(rig.snapshot()).toMatchObject({perspective:'third-person',view:{defaultPerspective:'third-person'}});
  });
  it('uses a local nonhuman eye, preserves third-person distance and resets the configured default',()=>{
    const {camera}=fixture(),subject=new THREE.Group();subject.position.set(4,2,3);subject.rotation.y=Math.PI/2;subject.scale.setScalar(2);subject.updateMatrixWorld(true);
    const rig=new ThreeCameraRig(camera,unobstructed,()=>subject.position.toArray(),()=>({heightMeters:2,radiusMeters:.5}),()=>({matrixWorld:subject.matrixWorld,frontYawRadians:0}));
    const eye:[number,number,number]=[0,.8,-.3];
    rig.setFollow({targetEntityId:'wolf',distanceMeters:5,activateOnInput:false,transitionSeconds:0,view:{eyeOffsetLocalMetersXYZ:eye,defaultPerspective:'first-person',keyboardToggleEnabled:true}});
    expect(camera.position.distanceTo(subject.localToWorld(new THREE.Vector3(...eye)))).toBeLessThan(1e-8);
    expect(camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(-1,0,0))).toBeLessThan(1e-8);
    rig.sealInitialState();eye[1]=99;
    rig.updateDesired({distanceDeltaMeters:20,yawDeltaRadians:.2},0);rig.update(0);
    expect(rig.snapshot().desiredArmDistanceMeters).toBe(0);
    rig.setPerspective('third-person');expect(camera.near).toBe(.05);expect(rig.snapshot().desiredArmDistanceMeters).toBe(5);
    rig.reset();expect(rig.snapshot()).toMatchObject({perspective:'first-person',view:{defaultPerspective:'first-person',keyboardToggleEnabled:true,eyeOffsetLocalMetersXYZ:[0,.8,-.3]}});
    const state=rig.snapshot();expect(rig.snapshot()).toEqual(state);
  });

  it('allows programmatic nonhuman perspectives with shortcut disabled and preserves authored ownership',async()=>{
    const camera=new THREE.PerspectiveCamera(50,1,.1,200),world=await createWorld({camera,navigation:false});
    try{
      world.addCharacter({id:'wolf',object:new THREE.Group(),body:{heightMeters:1.2,radiusMeters:.4}});world.setControlledEntity('wolf');
      world.setCameraFollow({view:{eyeOffsetLocalMetersXYZ:[0,1,0],defaultPerspective:'first-person'}});
      world.step({cameraTogglePressed:true},3);expect(world.snapshot().camera.perspective).toBe('first-person');
      world.setCameraPerspective('third-person');expect(world.snapshot().camera.perspective).toBe('third-person');
      world.setCameraFollow({view:{eyeOffsetLocalMetersXYZ:[0,1,0],keyboardToggleEnabled:true},activateOnInput:false});
      world.step({cameraTogglePressed:true},3);expect(world.snapshot().camera.perspective).toBe('first-person');
      world.useAuthoredCamera();world.step({cameraTogglePressed:true});expect(world.cameraMode).toBe('authored');
    }finally{world.dispose();}
  });
  it('retains ordinary camera key edges between fixed ticks and drops them on stop',async()=>{
    const world=await createWorld({camera:new THREE.PerspectiveCamera(),navigation:false});
    try{
      world.addCharacter({id:'fox',object:new THREE.Group(),body:{heightMeters:1.2,radiusMeters:.4}});world.setControlledEntity('fox');
      world.setCameraFollow({view:{eyeOffsetLocalMetersXYZ:[0,.8,0],keyboardToggleEnabled:true}});
      const engine=(world as unknown as {engine:WorldEngine}).engine;
      engine.advance(1/120,{cameraTogglePressed:true});expect(world.snapshot().camera.perspective).toBe('third-person');
      engine.advance(1/120,{});expect(world.snapshot().camera.perspective).toBe('first-person');
      engine.advance(3/60,{cameraTogglePressed:true});expect(world.snapshot().camera.perspective).toBe('third-person');
      engine.advance(1/120,{cameraTogglePressed:true});world.stop();world.step({});expect(world.snapshot().camera.perspective).toBe('third-person');
    }finally{world.dispose();}
  });
  it('keeps the nonhuman eye on the safe side of a real thin wall',async()=>{
    const physics=await ThreePhysics.create(),camera=new THREE.PerspectiveCamera(),wall=new THREE.Mesh(new THREE.BoxGeometry(8,5,.2));wall.position.set(0,2,-1.5);
    try{
      physics.addRigid('wall',wall,{kind:'fixed',shape:'box'});physics.step(1/60,{});
      const rig=new ThreeCameraRig(camera,physics.castCameraArm.bind(physics),()=>[0,0,0],()=>({heightMeters:1.2,radiusMeters:.4}));
      rig.setFollow({targetEntityId:'wolf',view:{eyeOffsetLocalMetersXYZ:[0,.9,-3],defaultPerspective:'first-person'}});
      for(let i=0;i<20;i++)rig.update(1/60);
      expect(camera.position.z).toBeGreaterThan(-1.4);expect(rig.snapshot().obstructionEntityId).toBe('wall');
      expect(rig.snapshot().perspective).toBe('first-person');
    }finally{physics.dispose();wall.geometry.dispose();}
  });
  it('inherits the final authored pose when camera composition changes while follow is pending', () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 3, 8); camera.lookAt(0, 1.3, 0);
    const rig = new ThreeCameraRig(camera, unobstructed, () => [0, 0, 0]); rig.setFollow({ targetEntityId: 'hero' });
    camera.position.set(12, 4, 6); camera.lookAt(-3, 7, -12); const opening = camera.clone();
    rig.updateDesired({ activate: true }, 1 / 60); for (let i = 0; i < 120; i++) rig.update(1 / 60);
    expect(camera.position.distanceTo(opening.position)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
  });

  it('keeps running after a legal short teleport across close parallel walls', async () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(-.8, 1.3, 8); camera.lookAt(-.8, 1.3, 0);
    const world = await createWorld({ scene: new THREE.Scene(), camera });
    try {
      const floor = new THREE.Mesh(new THREE.BoxGeometry(10, .2, 10)); floor.position.y = -.1;
      world.addEntity({ id: 'floor', object: floor, role: 'terrain', physics: { kind: 'fixed', shape: 'box' } });
      for (const [id, x] of [['west', -.19], ['east', .19]] as const) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(.2, 4, 5)); wall.position.set(x, 2, 0);
        world.addEntity({ id, object: wall, role: 'obstacle', physics: { kind: 'fixed', shape: 'box' } });
      }
      const player = new THREE.Group(); player.position.set(-.8, .04, 0);
      world.addCharacter({ id: 'player', object: player, body: { heightMeters: 1.8, radiusMeters: .35 } });
      world.setControlledEntity('player'); world.setCameraFollow({ activateOnInput: false, transitionSeconds: 0 }); world.step({}, 20);
      const result = await world.execute({ type: 'entity.set-position', entityId: 'player', positionWorldMetersXYZ: [.8, .04, 0] });
      expect(result.status).toBe('applied');
      expect(() => world.step({}, 120)).not.toThrow();
      expect(world.snapshot().errors).toEqual([]);
      expect(world.snapshot().camera.positionWorldMetersXYZ.every(Number.isFinite)).toBe(true);
    } finally { world.dispose(); }
  });

  it('adopts an off-center opening pose without requiring a second orbit configuration', () => {
    const camera = new THREE.PerspectiveCamera(39, 1.8, .1, 2000);
    camera.position.set(17, 28, 210); camera.lookAt(-60, 74, -120);
    const opening = camera.clone(); let target: Vec3 = [0, 0, 0];
    const rig = new ThreeCameraRig(camera, unobstructed, () => target, () => ({ heightMeters: 2.4, radiusMeters: .4 }));
    rig.setFollow({ targetEntityId: 'hero' });
    rig.updateDesired({ activate: true }, 1 / 60);
    for (let i = 0; i < 60; i++) rig.update(1 / 60);
    expect(camera.position.distanceTo(opening.position)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
    expect(rig.snapshot().framingMode).toBe('preserve-opening');
    target = [0, 0, -1]; for (let i = 0; i < 180; i++) rig.update(1 / 60);
    expect(camera.position.distanceTo(opening.position.clone().add(new THREE.Vector3(0, 0, -1)))).toBeLessThan(1e-7);
    expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
    expect(camera.fov).toBe(39);
  });

  it('keeps the subject framing when a tall visual target is retracted by real scenery', async () => {
    const physics = await ThreePhysics.create();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 8, .3)); wall.position.set(0, 3, 8);
    const camera = new THREE.PerspectiveCamera(52, 1.8, .1, 200);
    camera.position.set(0, 4.2, 16); camera.lookAt(0, 5, 0);
    const rig = new ThreeCameraRig(camera, physics.castCameraArm.bind(physics), () => [0, 0, 0], () => ({ heightMeters: 1.8, radiusMeters: .35 }));
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 16, targetHeightMeters: 5, pitchRadians: -.05, activateOnInput: false, transitionSeconds: 0 });
    try {
      rig.update(1 / 60); const centerBefore = new THREE.Vector3(0, .9, 0).project(camera);
      physics.addRigid('wall', wall, { kind: 'fixed', shape: 'box' }); physics.step(1 / 60, {}); rig.update(1 / 60);
      const state = rig.snapshot(), centerAfter = new THREE.Vector3(0, .9, 0).project(camera);
      expect(state.obstructionEntityId).toBe('wall'); expect(state.actualArmDistanceMeters).toBeLessThan(9);
      expect(centerAfter.x).toBeCloseTo(centerBefore.x, 6); expect(centerAfter.y).toBeCloseTo(centerBefore.y, 6);
      expect(new THREE.Vector3(0, 0, 0).project(camera).y).toBeGreaterThan(-1);
      expect(new THREE.Vector3(0, 1.8, 0).project(camera).y).toBeLessThan(1);
      const safe = physics.castCameraArm(state.targetPositionWorldMetersXYZ!, state.positionWorldMetersXYZ, .2);
      expect(safe.startedOverlapping).not.toBe(true); expect(safe.distanceMeters).toBeCloseTo(state.actualArmDistanceMeters!, 5);
    } finally { physics.dispose(); wall.geometry.dispose(); }
  });

  it('uses separate smoothing memory per rig and restores it on reset', () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 3, 8); camera.lookAt(0, 1, 0);
    let target: Vec3 = [0, 0, 0]; const rig = new ThreeCameraRig(camera, unobstructed, () => target);
    rig.setFollow({ targetEntityId: 'hero', activateOnInput: false, transitionSeconds: 0 }); rig.sealInitialState();
    target = [0, 1, 0]; rig.update(1 / 60);
    expect(camera.position.y).toBeGreaterThan(3); expect(camera.position.y).toBeLessThan(3.2);
    const moved = rig.snapshot(); target = [0, 0, 0]; rig.reset(); target = [0, 1, 0]; rig.update(1 / 60);
    expect(rig.snapshot()).toEqual(moved);
  });

  it('rotates throughout an authored handoff instead of snapping on the final tick', () => {
    const camera = new THREE.PerspectiveCamera(52, 1.8, .1, 650);
    camera.position.set(0, 3.35, 18); camera.lookAt(-1, 27, -85);
    const opening = camera.quaternion.clone(), previous = opening.clone();
    const rig = new ThreeCameraRig(camera, unobstructed, () => [0, .22, 0]);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 16, targetHeightMeters: 5, pitchRadians: -.05, transitionSeconds: 1.6 });
    rig.updateDesired({ activate: true }, 1 / 60);
    let maximumAngle = 0, midpointAngle = 0;
    for (let tick = 1; tick <= 100; tick++) {
      rig.update(1 / 60); maximumAngle = Math.max(maximumAngle, previous.angleTo(camera.quaternion));
      if (tick === 48) midpointAngle = opening.angleTo(camera.quaternion);
      previous.copy(camera.quaternion);
    }
    expect(midpointAngle).toBeGreaterThan(.01);
    expect(maximumAngle).toBeLessThan(.02);
  });

  it('bounds a long camera arm recovery in meters per second', () => {
    let blocked = true;
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 16); camera.lookAt(0, 1.3, 0);
    const rig = new ThreeCameraRig(camera, (target, eye) => blocked && distance(target, eye) > 2
      ? { distanceMeters: 2, colliderEntityId: 'wall' } : unobstructed(target, eye), () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 16, pitchRadians: 0, activateOnInput: false, transitionSeconds: 0 });
    rig.update(1 / 60); blocked = false;
    let previous = rig.snapshot().actualArmDistanceMeters!;
    for (let i = 0; i < 120; i++) {
      rig.update(1 / 60); const actual = rig.snapshot().actualArmDistanceMeters!;
      expect((actual - previous) * 60).toBeLessThanOrEqual(3 + 1e-8); previous = actual;
    }
    expect(previous).toBeGreaterThan(6);
  });

  it('preserves the exact authored opening until first input and transitions on that same camera', () => {
    const { camera, rig } = fixture(); const opening = camera.clone();
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 4, pitchRadians: .25, transitionSeconds: .4 });
    for (let tick = 0; tick < 30; tick++) { rig.updateDesired({}, 1 / 60); rig.update(1 / 60); }
    expect(rig.mode).toBe('follow-pending'); expect(camera.position.equals(opening.position)).toBe(true);
    expect(camera.quaternion.equals(opening.quaternion)).toBe(true);
    rig.updateDesired({ activate: true }, 1 / 60); rig.update(1 / 60);
    expect(rig.mode).toBe('follow'); expect(camera.position.distanceTo(opening.position)).toBeGreaterThan(0);
    expect(camera.position.distanceTo(opening.position)).toBeLessThan(.1);
    for (let tick = 1; tick < 24; tick++) rig.update(1 / 60);
    expect(distance(rig.snapshot().positionWorldMetersXYZ, [0, 1.3, 0])).toBeCloseTo(4, 8);
    expect(camera.fov).toBe(47); expect(rig.useAuthoredCamera()).toBe(camera);
  });

  it('updates the desired movement basis before changing the rendered pose', () => {
    const { camera, rig } = fixture(); const before = camera.quaternion.clone();
    rig.setFollow({ targetEntityId: 'hero', rotationSpeedRadiansPerSecond: 2 });
    const yaw = rig.desiredYawRadians, initialPitch = rig.snapshot().desiredPitchRadians;
    rig.updateDesired({ cameraYawRatio: 1, cameraPitchRatio: -.5, yawDeltaRadians: .1 }, .25);
    expect(rig.desiredYawRadians).toBeCloseTo(yaw + .6, 10);
    expect(camera.quaternion.equals(before)).toBe(true);
    expect(initialPitch).not.toBeNull();expect(rig.snapshot().desiredPitchRadians).toBeCloseTo(initialPitch! - .25, 10);
  });

  it('does not consume orbit or zoom in authored mode and reacquires from the current pose', () => {
    const { camera, rig } = fixture();
    rig.setFollow({ targetEntityId: 'hero', activateOnInput: false, transitionSeconds: 0 }); rig.update(1 / 60);
    rig.useAuthoredCamera(); camera.position.set(-7, 6, 2); camera.lookAt(2, 1, 0); const authored = camera.clone();
    rig.updateDesired({ cameraYawRatio: 1, yawDeltaRadians: 2, distanceDeltaMeters: 10, activate: true }, 1);
    rig.update(1); expect(camera.position.equals(authored.position)).toBe(true); expect(camera.quaternion.equals(authored.quaternion)).toBe(true);
    rig.setFollow({ targetEntityId: 'hero', transitionSeconds: .5 });
    rig.updateDesired({ activate: true }, 1 / 60); rig.update(1 / 60);
    expect(camera.position.distanceTo(authored.position)).toBeLessThan(.1);
  });

  it('uses a real volume probe at a wall corner and retracts without a minimum unsafe arm', async () => {
    const physics = await ThreePhysics.create();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 4, .2)); wall.position.set(0, 1.3, 3);
    try {
      physics.addRigid('wall', wall, { kind: 'fixed' }); physics.step(1 / 60, {});
      const camera = new THREE.PerspectiveCamera(); camera.position.set(1.1, 1.3, 6); camera.lookAt(1.1, 1.3, 0);
      const target: Vec3 = [1.1, 0, 0];
      const rig = new ThreeCameraRig(camera, physics.castCameraArm.bind(physics), () => target);
      rig.setFollow({ targetEntityId: 'hero', distanceMeters: 6, pitchRadians: 0, collisionRadiusMeters: .2, activateOnInput: false, transitionSeconds: 0 });
      rig.update(1 / 60); const state = rig.snapshot();
      expect(state.obstructionEntityId).toBe('wall'); expect(state.actualArmDistanceMeters).toBeLessThan(3);
      const safe = physics.castCameraArm([1.1, 1.3, 0], state.positionWorldMetersXYZ, .2);
      expect(safe.distanceMeters).toBeCloseTo(state.actualArmDistanceMeters!, 5);
      physics.teleport('wall', [0, 1.3, 0]); physics.step(1 / 60, {}); rig.update(1 / 60);
      const escaped = rig.snapshot();
      expect(escaped.collisionPhase).toBe('emergency-inside'); expect(escaped.actualArmDistanceMeters).toBeGreaterThan(0);
      const escapeProbe = physics.castCameraArm(escaped.targetPositionWorldMetersXYZ!, escaped.positionWorldMetersXYZ, .2);
      expect(escapeProbe.startedOverlapping).not.toBe(true); expect(escapeProbe.distanceMeters).toBeCloseTo(escaped.actualArmDistanceMeters!, 5);
    } finally { physics.dispose(); wall.geometry.dispose(); }
  });

  it('prioritizes immediate safety over the first-frame transition', () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(5, 5, 8); camera.lookAt(0, 1.3, 0);
    const rig = new ThreeCameraRig(camera, (target, eye) => ({ distanceMeters: Math.min(1.2, distance(target, eye)), colliderEntityId: 'wall' }), () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero', transitionSeconds: 1 }); rig.updateDesired({ activate: true }, 1 / 60); rig.update(1 / 60);
    expect(rig.snapshot().actualArmDistanceMeters).toBeLessThanOrEqual(1.2);
    expect(rig.snapshot().positionWorldMetersXYZ.every(Number.isFinite)).toBe(true);
  });

  it('holds small obstruction-edge changes, then smoothly recovers after release', () => {
    let clearance = 2;
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 6); camera.lookAt(0, 1.3, 0);
    const rig = new ThreeCameraRig(camera, (target, eye) => {
      const requested = distance(target, eye);
      return clearance < requested ? { distanceMeters: clearance, colliderEntityId: 'wall' } : { distanceMeters: requested };
    }, () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 6, pitchRadians: 0, activateOnInput: false, transitionSeconds: 0, recoveryHalfLifeSeconds: .2 });
    rig.update(1 / 60); const blocked = rig.snapshot().actualArmDistanceMeters!;
    for (let i = 0; i < 90; i++) { clearance = 2 + (i % 2 ? .005 : 0); rig.update(1 / 60); }
    expect(rig.snapshot().actualArmDistanceMeters).toBeCloseTo(blocked, 8);
    clearance = Infinity; rig.update(1 / 60); const firstClear = rig.snapshot().actualArmDistanceMeters!;
    expect(firstClear).toBeLessThan(3);
    let previous = firstClear;
    for (let i = 0; i < 150; i++) { rig.update(1 / 60); const actual = rig.snapshot().actualArmDistanceMeters!; expect(actual).toBeGreaterThanOrEqual(previous); expect(actual - previous).toBeLessThan(.3); previous = actual; }
    expect(previous).toBeGreaterThan(5.98);
  });

  it('smooths zoom changes separately from an obstruction safety contraction', () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 6); camera.lookAt(0, 1.3, 0);
    const rig = new ThreeCameraRig(camera, unobstructed, () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 6, pitchRadians: 0, activateOnInput: false, transitionSeconds: 0 }); rig.update(1 / 60);
    rig.updateDesired({ distanceDeltaMeters: -3 }, 1 / 60); rig.update(1 / 60);
    expect(rig.snapshot().desiredArmDistanceMeters).toBe(3);
    expect(rig.snapshot().actualArmDistanceMeters).toBeGreaterThan(3); expect(rig.snapshot().actualArmDistanceMeters).toBeLessThan(6);
  });

  it('has the same fixed-tick result under 30, 60 and 120 Hz render schedules', () => {
    const run = (hz: number) => {
      const { rig } = fixture(); rig.setFollow({ targetEntityId: 'hero', transitionSeconds: .3 });
      let accumulator = 0;
      for (let frame = 0; frame < hz * 2; frame++) {
        accumulator += 1 / hz;
        while (accumulator >= 1 / 60 - 1e-12) { rig.updateDesired({ cameraYawRatio: .5, cameraPitchRatio: -.1 }, 1 / 60); rig.update(1 / 60); accumulator -= 1 / 60; }
      }
      return rig.snapshot();
    };
    expect(run(30)).toEqual(run(60)); expect(run(120)).toEqual(run(60));
  });

  it('keeps wall-release recovery consistent across elapsed-time step sizes', () => {
    const run = (hz: number) => {
      let blocked = true;
      const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 6); camera.lookAt(0, 1.3, 0);
      const rig = new ThreeCameraRig(camera, (target, eye) => blocked && distance(target, eye) > 2
        ? { distanceMeters: 2, colliderEntityId: 'wall' } : unobstructed(target, eye), () => [0, 0, 0]);
      rig.setFollow({ targetEntityId: 'hero', distanceMeters: 6, pitchRadians: 0, activateOnInput: false, transitionSeconds: 0, recoveryHalfLifeSeconds: .3 });
      rig.update(1 / hz); blocked = false;
      for (let frame = 0; frame < hz; frame++) rig.update(1 / hz);
      return rig.snapshot().actualArmDistanceMeters!;
    };
    expect(run(30)).toBeCloseTo(run(60), 10); expect(run(120)).toBeCloseTo(run(60), 10);
  });

  it('immediately handles a suddenly appearing wall without sharing state between rigs', () => {
    let clearance = Infinity;
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 6); camera.lookAt(0, 1.3, 0);
    const rig = new ThreeCameraRig(camera, (target, eye) => clearance < distance(target, eye)
      ? { distanceMeters: clearance, colliderEntityId: 'moving-wall' } : unobstructed(target, eye), () => [0, 0, 0]);
    const independent = fixture(); independent.rig.setFollow({ targetEntityId: 'hero' }); const independentBefore = independent.rig.snapshot();
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 6, pitchRadians: 0, activateOnInput: false, transitionSeconds: 0 }); rig.update(1 / 60);
    clearance = .1; rig.update(1 / 60);
    expect(rig.snapshot().actualArmDistanceMeters).toBeLessThanOrEqual(.1);
    expect(rig.snapshot().obstructionEntityId).toBe('moving-wall');
    expect(independent.rig.snapshot()).toEqual(independentBefore);
  });

  it('restores projection, camera parent, mode, options, and pending state on reset', () => {
    const { camera, rig } = fixture(); const parent = new THREE.Group(); parent.rotation.y = .4; parent.add(camera); parent.updateMatrixWorld(true);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 7, transitionSeconds: .4 }); rig.sealInitialState();
    const initial = rig.snapshot(); const matrix = camera.matrix.clone();
    rig.updateDesired({ activate: true, cameraYawRatio: 1, distanceDeltaMeters: -5 }, .2); rig.update(.2);
    rig.useAuthoredCamera(); camera.removeFromParent(); camera.fov = 80; camera.aspect = 2; camera.updateProjectionMatrix(); camera.position.set(19, 12, 3);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 2, activateOnInput: false }); rig.update(.1);
    rig.reset(); expect(camera.parent).toBe(parent); expect(camera.fov).toBe(47); expect(camera.aspect).toBe(1.7);
    expect(camera.matrix.equals(matrix)).toBe(true); expect(rig.snapshot()).toEqual(initial);
    rig.updateDesired({ activate: true }, 1 / 60); rig.update(1 / 60); const firstRun = rig.snapshot();
    rig.reset(); rig.updateDesired({ activate: true }, 1 / 60); rig.update(1 / 60); expect(rig.snapshot()).toEqual(firstRun);
  });

  it('supports manually managed camera matrices under a rotated parent', () => {
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, .1, 100); camera.position.set(0, 3, 8); camera.lookAt(0, 1, 0); camera.updateMatrix(); camera.matrixAutoUpdate = false;
    const parent = new THREE.Group(); parent.position.set(2, 0, -3); parent.rotation.y = .4; parent.add(camera); parent.updateMatrixWorld(true);
    const rig = new ThreeCameraRig(camera, unobstructed, () => [2, 0, -3]);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 5, pitchRadians: .2, activateOnInput: false, transitionSeconds: 0 }); rig.update(1 / 60);
    expect(distance(rig.snapshot().positionWorldMetersXYZ, [2, 1.3, -3])).toBeCloseTo(5, 8);
    expect(camera.getWorldDirection(new THREE.Vector3()).angleTo(new THREE.Vector3(2, 1.3, -3).sub(camera.getWorldPosition(new THREE.Vector3())))).toBeCloseTo(0, 8);
    expect(camera.matrixAutoUpdate).toBe(false); expect(camera.left).toBe(-4);
  });

  it('rejects invalid options and inputs without mutating the prior camera or rig state', () => {
    const { rig } = fixture(); rig.setFollow({ targetEntityId: 'hero' }); const before = rig.snapshot();
    expect(() => rig.setFollow({ targetEntityId: 'hero', collisionRadiusMeters: 0 })).toThrow('WORLD_CAMERA_OPTION_INVALID');
    expect(() => rig.updateDesired({ cameraYawRatio: 2, activate: true }, 1 / 60)).toThrow('WORLD_CAMERA_INPUT_INVALID');
    expect(() => rig.updateDesired({ activate: true }, -1)).toThrow('WORLD_CAMERA_TIMESTEP_INVALID');
    expect(rig.snapshot()).toEqual(before);
  });

  it('reacquires setup-time pose and projection edits when pending follow activates', () => {
    const { camera, rig } = fixture(); rig.setFollow({ targetEntityId: 'hero' });
    camera.position.set(-9, 18, 34); camera.lookAt(8, 25, -80);
    camera.fov = 38; camera.setViewOffset(1800, 1000, 100, 120, 1200, 800); camera.updateProjectionMatrix();
    const opening = camera.clone(); rig.updateDesired({ activate: true }, 1 / 60);
    for (let i = 0; i < 120; i++) { rig.updateDesired({}, 1 / 60); rig.update(1 / 60); }
    expect(camera.position.distanceTo(opening.position)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
    expect(camera.projectionMatrix.equals(opening.projectionMatrix)).toBe(true);
    expect(camera.view).toEqual(opening.view);
  });

  it('smooths ordinary target translation without inheriting subject rotation or changing orientation', () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(4, 6, 14); camera.lookAt(-6, 8, -5);
    const opening = camera.clone(); let target: Vec3 = [0, 0, 0];
    const rig = new ThreeCameraRig(camera, unobstructed, () => target);
    rig.setFollow({ targetEntityId: 'hero', activateOnInput: false });
    target = [2, 1, -3]; rig.update(.08);
    expect(camera.position.distanceTo(opening.position.clone().add(new THREE.Vector3(1, .5, -1.5)))).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
    rig.update(.08);
    expect(camera.position.distanceTo(opening.position.clone().add(new THREE.Vector3(1.5, .75, -2.25)))).toBeLessThan(1e-8);
  });

  it('allows zero follow damping and preserves translated subject screen composition', () => {
    const camera = new THREE.PerspectiveCamera(44, 1.8, .1, 500); camera.position.set(3, 5, 12); camera.lookAt(-4, 8, -30);
    const opening = camera.clone(); let target: Vec3 = [0, 0, 0];
    const rig = new ThreeCameraRig(camera, unobstructed, () => target);
    rig.setFollow({ targetEntityId: 'hero', followHalfLifeSeconds: 0, activateOnInput: false });
    const before = new THREE.Vector3(0, 1, 0).project(camera);
    target = [2, 1, -3]; rig.update(1 / 60);
    expect(camera.position.distanceTo(opening.position.clone().add(new THREE.Vector3(...target)))).toBeLessThan(1e-8);
    const after = new THREE.Vector3(2, 2, -3).project(camera);
    expect(after.x).toBeCloseTo(before.x, 9); expect(after.y).toBeCloseTo(before.y, 9);
    expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
  });

  it('uses the intended off-center view for movement and keeps user orbit after input ends', () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(3, 4, 8); camera.lookAt(-7, 9, -30); camera.rotateZ(.2);
    const opening = camera.clone(); let target: Vec3 = [0, 0, 0];
    const rig = new ThreeCameraRig(camera, unobstructed, () => target);
    rig.setFollow({ targetEntityId: 'hero', followHalfLifeSeconds: 0, activateOnInput: false });
    const openingDirection = camera.getWorldDirection(new THREE.Vector3());
    expect(rig.desiredYawRadians).toBeCloseTo(Math.atan2(-openingDirection.x, -openingDirection.z), 9);
    expect(Math.abs(rig.desiredYawRadians - Math.atan2(3, 8))).toBeGreaterThan(.05);
    rig.updateDesired({ yawDeltaRadians: .6 }, 1 / 60);
    const expectedRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .6).multiply(opening.quaternion);
    const expectedDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(expectedRotation);
    expect(rig.desiredYawRadians).toBeCloseTo(Math.atan2(-expectedDirection.x, -expectedDirection.z), 9);
    expect(camera.quaternion.equals(opening.quaternion)).toBe(true);
    rig.update(1 / 60); const orbited = camera.clone();
    expect(camera.quaternion.angleTo(expectedRotation)).toBeLessThan(1e-7);
    for (let i = 0; i < 120; i++) { rig.updateDesired({}, 1 / 60); rig.update(1 / 60); }
    expect(camera.position.distanceTo(orbited.position)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(orbited.quaternion)).toBeLessThan(1e-7);
    target = [1, 0, 2]; rig.update(1 / 60);
    expect(camera.position.distanceTo(orbited.position.clone().add(new THREE.Vector3(...target)))).toBeLessThan(1e-8);
  });

  it('preserves distant and polar authored arms on empty input and allows deliberate zoom', () => {
    for (const point of [[17, 28, 210], [17, 28, 20_210], [0, 31.3, 0], [0, -28.7, 0]] as const) {
      const camera = new THREE.PerspectiveCamera(); camera.position.set(point[0], point[1], point[2]); camera.lookAt(-3, 1, -5);
      const opening = camera.clone();
      const rig = new ThreeCameraRig(camera, unobstructed, () => [0, 0, 0]);
      rig.setFollow({ targetEntityId: 'hero', activateOnInput: false });
      for (let i = 0; i < 120; i++) { rig.updateDesired({}, 1 / 60); rig.update(1 / 60); }
      expect(camera.position.distanceTo(opening.position)).toBeLessThan(1e-8);
      expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
      const distanceBefore = rig.snapshot().desiredArmDistanceMeters!;
      rig.updateDesired({ distanceDeltaMeters: -5 }, 1 / 60);
      expect(rig.snapshot().desiredArmDistanceMeters).toBeCloseTo(distanceBefore - 5, 8);
      for (let i = 0; i < 240; i++) rig.update(1 / 60);
      expect(rig.snapshot().actualArmDistanceMeters).toBeCloseTo(distanceBefore - 5, 5);
      expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
    }
  });

  it('does not jump to legacy pitch limits when the first orbit input reaches an authored pole', () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 31.3, 0); camera.lookAt(-3, 1, -5);
    const rig = new ThreeCameraRig(camera, unobstructed, () => [0, 0, 0]); rig.setFollow({ targetEntityId: 'hero', activateOnInput: false });
    const opening = camera.clone(); rig.updateDesired({ pitchDeltaRadians: .01 }, 1 / 60); rig.update(1 / 60);
    expect(rig.snapshot().desiredPitchRadians).toBeCloseTo(Math.PI / 2, 9);
    expect(camera.position.distanceTo(opening.position)).toBeLessThan(1e-8);
    rig.updateDesired({ pitchDeltaRadians: -.02 }, 1 / 60); rig.update(1 / 60);
    expect(rig.snapshot().desiredPitchRadians).toBeCloseTo(Math.PI / 2 - .02, 9);
  });

  it('preserves a zero-length authored arm without forcing an offset or invalid orientation', () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 0); camera.lookAt(-5, 3, -10);
    const opening = camera.clone(); const rig = new ThreeCameraRig(camera, unobstructed, () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero' }); rig.updateDesired({ activate: true }, 1 / 60); rig.update(1 / 60);
    expect(camera.position.equals(opening.position)).toBe(true);
    expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
    expect(rig.snapshot().desiredArmDistanceMeters).toBe(0);
  });

  it('retains explicit legacy target intent and allows a distinct preservation pivot', () => {
    for (const options of [{ distanceMeters: 7 }, { pitchRadians: .4 }, { targetHeightMeters: 4 }, { framingMode: 'target' as const }]) {
      const { rig } = fixture(); rig.setFollow({ targetEntityId: 'hero', ...options, activateOnInput: false, transitionSeconds: 0 }); rig.update(1 / 60);
      expect(rig.snapshot().desiredArmDistanceMeters).toBe(options.distanceMeters ?? 4);
      expect(rig.snapshot().desiredPitchRadians).toBe(options.pitchRadians ?? .25);
    }
    const { camera, rig } = fixture(); const opening = camera.clone();
    rig.setFollow({ targetEntityId: 'hero', framingMode: 'preserve-opening', targetHeightMeters: 5, activateOnInput: false }); rig.update(1 / 60);
    expect(camera.position.distanceTo(opening.position)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
    expect(rig.snapshot().desiredArmDistanceMeters).toBeCloseTo(opening.position.distanceTo(new THREE.Vector3(0, 5, 0)), 8);
  });

  it('keeps angular framing during real-wall retraction without changing the baseline probe policy', async () => {
    const physics = await ThreePhysics.create(), camera = new THREE.PerspectiveCamera(44, 1.8, .1, 500);
    camera.position.set(2, 3, 10); camera.lookAt(-5, 7, -20); const opening = camera.clone();
    camera.updateMatrixWorld(true);
    const target: Vec3 = [0, 1.3, 0], before = new THREE.Vector3(...target).project(camera);
    const rig = new ThreeCameraRig(camera, physics.castCameraArm.bind(physics), () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero', activateOnInput: false }); rig.update(1 / 60);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 10, .2)); wall.position.set(0, 3, 6);
    try {
      physics.addRigid('wall', wall, { kind: 'fixed', shape: 'box' }); physics.step(1 / 60, {}); rig.update(1 / 60);
      const state = rig.snapshot(), after = new THREE.Vector3(...target).project(camera);
      expect(state.obstructionEntityId).toBe('wall'); expect(state.actualArmDistanceMeters).toBeLessThan(7);
      expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
      expect(after.x).toBeCloseTo(before.x, 8); expect(after.y).toBeCloseTo(before.y, 8);
      expect(physics.castCameraArm(target, state.positionWorldMetersXYZ, .2).distanceMeters).toBeCloseTo(state.actualArmDistanceMeters!, 5);
    } finally { physics.dispose(); wall.geometry.dispose(); }
  });

  it('discards damping when a legal target teleport crosses a wall or a corner', async () => {
    for (const corner of [false, true]) {
      const physics = await ThreePhysics.create(), camera = new THREE.PerspectiveCamera();
      const walls = [new THREE.Mesh(new THREE.BoxGeometry(.2, 4, 20))]; walls[0]!.position.y = 2;
      if (corner) { const cross = new THREE.Mesh(new THREE.BoxGeometry(20, 4, .2)); cross.position.y = 2; walls.push(cross); }
      let target: Vec3 = [-.8, 0, corner ? -.8 : 0];
      camera.position.set(-.8, 1.3, corner ? -6.8 : 6); camera.lookAt(target[0], 1.3, target[2]);
      const rig = new ThreeCameraRig(camera, physics.castCameraArm.bind(physics), () => target);
      try {
        walls.forEach((wall, i) => physics.addRigid('wall' + i, wall, { kind: 'fixed', shape: 'box' })); physics.step(1 / 60, {});
        rig.setFollow({ targetEntityId: 'hero', activateOnInput: false }); rig.update(1 / 60);
        target = [.8, 0, corner ? .8 : 0]; rig.update(1 / 60);
        expect(camera.position.x).toBeCloseTo(.8, 7);
        const pivot: Vec3 = [target[0], 1.3, target[2]], state = rig.snapshot();
        expect(physics.castCameraArm(pivot, state.positionWorldMetersXYZ, .2).distanceMeters).toBeCloseTo(distance(pivot, state.positionWorldMetersXYZ), 5);
        expect(state.positionWorldMetersXYZ.every(Number.isFinite)).toBe(true);
      } finally { physics.dispose(); walls.forEach(wall => wall.geometry.dispose()); }
    }
  });

  it('resets pending preserve-follow under a rotated scaled parent and reacquires another target', () => {
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, .1, 100); camera.position.set(0, 3, 8); camera.lookAt(-3, 5, -20);
    camera.updateMatrix(); camera.matrixAutoUpdate = false;
    const parent = new THREE.Group(); parent.position.set(2, 0, -3); parent.rotation.set(.1, .4, -.2); parent.scale.setScalar(2); parent.add(camera); parent.updateMatrixWorld(true);
    let target: Vec3 = [0, 0, 0]; const rig = new ThreeCameraRig(camera, unobstructed, () => target);
    rig.setFollow({ targetEntityId: 'hero', followHalfLifeSeconds: 0 }); rig.sealInitialState();
    const openingPosition = camera.getWorldPosition(new THREE.Vector3()), openingRotation = camera.getWorldQuaternion(new THREE.Quaternion());
    const initial = rig.snapshot(); rig.updateDesired({ activate: true }, 1 / 60); target = [2, 1, -3]; rig.update(1 / 60);
    expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(openingPosition.clone().add(new THREE.Vector3(...target)))).toBeLessThan(1e-8);
    expect(camera.getWorldQuaternion(new THREE.Quaternion()).angleTo(openingRotation)).toBeLessThan(1e-7);
    target = [0, 0, 0]; rig.reset(); expect(rig.snapshot()).toEqual(initial); expect(camera.matrixAutoUpdate).toBe(false);
    rig.updateDesired({ activate: true }, 1 / 60); target = [2, 1, -3]; rig.update(1 / 60);
    const rebound = camera.clone(), reboundPosition = camera.getWorldPosition(new THREE.Vector3());
    rig.setFollow({ targetEntityId: 'other', followHalfLifeSeconds: 0, activateOnInput: false }); rig.update(1 / 60);
    expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(reboundPosition)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(rebound.quaternion)).toBeLessThan(1e-7);
  });

  it('rejects conflicting preservation options and invalid pending poses before authority changes', () => {
    const { camera, rig } = fixture(); rig.setFollow({ targetEntityId: 'hero' }); const before = rig.snapshot();
    for (const options of [{ framingMode: 'preserve-opening' as const, distanceMeters: 5 }, { framingMode: 'preserve-opening' as const, pitchRadians: .2 }, { followHalfLifeSeconds: -.1 }, { followHalfLifeSeconds: Infinity }]) {
      expect(() => rig.setFollow({ targetEntityId: 'hero', ...options })).toThrow('WORLD_CAMERA_OPTION_INVALID');
      expect(rig.snapshot()).toEqual(before);
    }
    const position = camera.position.clone(); camera.position.x = NaN;
    expect(() => rig.updateDesired({ activate: true }, 1 / 60)).toThrow('WORLD_CAMERA_POSE_INVALID');
    expect(rig.mode).toBe('follow-pending'); camera.position.copy(position); camera.updateMatrixWorld(true);
    expect(rig.snapshot()).toEqual(before);
  });

  it('has equivalent follow damping across elapsed-time steps without advancing on zero time', () => {
    const run = (hz: number) => {
      const camera = new THREE.PerspectiveCamera(); camera.position.set(3, 4, 8); camera.lookAt(-3, 7, -10);
      let target: Vec3 = [0, 0, 0]; const rig = new ThreeCameraRig(camera, unobstructed, () => target);
      rig.setFollow({ targetEntityId: 'hero', activateOnInput: false }); const opening = camera.position.clone();
      target = [3, 2, -7]; rig.update(0); expect(camera.position.distanceTo(opening)).toBeLessThan(1e-8);
      for (let i = 0; i < hz; i++) rig.update(1 / hz);
      return rig.snapshot().positionWorldMetersXYZ;
    };
    for (const hz of [30, 120]) expect(distance(run(hz), run(60))).toBeLessThan(1e-8);
  });

  it('keeps target damping isolated between rigs and restores its initial memory', () => {
    const first = fixture(), second = fixture(); let target: Vec3 = [0, 0, 0];
    const rig = new ThreeCameraRig(first.camera, unobstructed, () => target);
    rig.setFollow({ targetEntityId: 'hero', activateOnInput: false }); rig.sealInitialState();
    second.rig.setFollow({ targetEntityId: 'other', activateOnInput: false }); const independent = second.rig.snapshot();
    target = [4, 2, -3]; rig.update(.08); const firstRun = rig.snapshot();
    expect(second.rig.snapshot()).toEqual(independent);
    target = [0, 0, 0]; rig.reset(); target = [4, 2, -3]; rig.update(.08);
    expect(rig.snapshot()).toEqual(firstRun);
  });

  it('rotates throughout a legacy authored transition instead of snapping on its final tick', () => {
    const camera = new THREE.PerspectiveCamera(52, 1.8, .1, 650); camera.position.set(0, 3.35, 18); camera.lookAt(-1, 27, -85);
    const opening = camera.quaternion.clone(), previous = opening.clone();
    const rig = new ThreeCameraRig(camera, unobstructed, () => [0, .22, 0]);
    rig.setFollow({ targetEntityId: 'hero', distanceMeters: 16, targetHeightMeters: 5, pitchRadians: -.05, transitionSeconds: 1.6 });
    rig.updateDesired({ activate: true }, 1 / 60); let maximumAngle = 0, midpointAngle = 0;
    for (let tick = 1; tick <= 100; tick++) { rig.update(1 / 60); maximumAngle = Math.max(maximumAngle, previous.angleTo(camera.quaternion)); if (tick === 48) midpointAngle = opening.angleTo(camera.quaternion); previous.copy(camera.quaternion); }
    expect(midpointAngle).toBeGreaterThan(.01); expect(maximumAngle).toBeLessThan(.02);
  });

  it('inherits an off-center authored opening without a push-in when follow activates', () => {
    const camera = new THREE.PerspectiveCamera(39, 1.8, .1, 2000);
    camera.position.set(17, 28, 210); camera.lookAt(-60, 74, -120);
    const opening = camera.clone();
    const rig = new ThreeCameraRig(camera, unobstructed, () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero' });
    rig.updateDesired({ activate: true }, 1 / 60);
    for (let i = 0; i < 120; i++) rig.update(1 / 60);
    expect(camera.position.distanceTo(opening.position)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
    expect(camera.projectionMatrix.equals(opening.projectionMatrix)).toBe(true);
  });

  it('uses independent damping settings for preserving the opening and targeting the subject', () => {
    const variants = [
      { options: {}, halfLife: .08 },
      { options: { targetHalfLifeSeconds: .2 }, halfLife: .08 },
      { options: { targetHalfLifeSeconds: .2, followHalfLifeSeconds: .04 }, halfLife: .04 },
    ];
    for (const { options, halfLife } of variants) {
      const camera = new THREE.PerspectiveCamera(); camera.position.set(3, 4, 8); camera.lookAt(-3, 7, -10);
      const opening = camera.clone(); let subject: Vec3 = [0, 0, 0];
      const rig = new ThreeCameraRig(camera, unobstructed, () => subject);
      rig.setFollow({ targetEntityId: 'hero', activateOnInput: false, ...options });
      subject = [2, 1, -3]; rig.update(halfLife);
      expect(camera.position.distanceTo(opening.position.clone().add(new THREE.Vector3(1, .5, -1.5)))).toBeLessThan(1e-8);
      expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
    }
  });

  it('keeps target framing on its own damping default and explicit target override', () => {
    for (const targetHalfLifeSeconds of [undefined, .2]) {
      const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.3, 4); camera.lookAt(0, 1.3, 0);
      let subject: Vec3 = [0, 0, 0]; const rig = new ThreeCameraRig(camera, unobstructed, () => subject);
      rig.setFollow({ targetEntityId: 'hero', framingMode: 'target', pitchRadians: 0, activateOnInput: false, transitionSeconds: 0,
        followHalfLifeSeconds: .01, ...(targetHalfLifeSeconds === undefined ? {} : { targetHalfLifeSeconds }) });
      subject = [2, 0, -2]; rig.update(targetHalfLifeSeconds ?? .1);
      expect(distance(rig.snapshot().positionWorldMetersXYZ, [1, 1.3, 3])).toBeLessThan(1e-8);
    }
  });

  it('retains authored roll after camera.up changes and applies orbit in the same world-up frame', () => {
    const camera = new THREE.PerspectiveCamera(); camera.up.set(1, 1, 0).normalize(); camera.position.set(3, 4, 8);
    camera.lookAt(-7, 9, -30); camera.rotateZ(.27); const opening = camera.clone();
    const rig = new ThreeCameraRig(camera, unobstructed, () => [0, 0, 0]);
    rig.setFollow({ targetEntityId: 'hero', activateOnInput: false });
    camera.up.set(0, 0, 1); rig.update(1 / 60);
    expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
    expect(camera.position.distanceTo(opening.position)).toBeLessThan(1e-8);
    rig.updateDesired({ yawDeltaRadians: .6 }, 1 / 60); rig.update(1 / 60);
    const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .6).multiply(opening.quaternion);
    expect(camera.quaternion.angleTo(expected)).toBeLessThan(1e-7);
    expect(camera.up.toArray()).toEqual([0, 0, 1]);
  });

  it('preserves orientation while the shared decollider retracts from the body pivot of a tall visual target', () => {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(2, 3, 10); camera.lookAt(-5, 7, -20); camera.rotateZ(.2);
    const opening = camera.clone();
    const rig = new ThreeCameraRig(camera, (target, eye) => ({ distanceMeters: Math.min(3, distance(target, eye)), colliderEntityId: 'wall' }),
      () => [0, 0, 0], () => ({ heightMeters: 2, radiusMeters: .4 }));
    rig.setFollow({ targetEntityId: 'hero', framingMode: 'preserve-opening', targetHeightMeters: 5, activateOnInput: false });
    rig.update(1 / 60); const state = rig.snapshot();
    expect(state.targetPositionWorldMetersXYZ).toEqual([0, 1.3, 0]);
    expect(state.actualArmDistanceMeters).toBeLessThanOrEqual(3);
    expect(state.obstructionEntityId).toBe('wall'); expect(state.collisionPhase).toBe('constrained');
    expect(camera.quaternion.angleTo(opening.quaternion)).toBeLessThan(1e-7);
    expect(new THREE.Quaternion(...state.orientationWorldQuaternionXYZW).angleTo(camera.getWorldQuaternion(new THREE.Quaternion()))).toBeLessThan(1e-7);
  });
});

it('observes manual local/world camera matrices without mutating them',()=>{
 const parent=new THREE.Group(),camera=new THREE.PerspectiveCamera();parent.add(camera);
 parent.matrixAutoUpdate=false;parent.matrix.makeTranslation(7,8,9);
 camera.matrixAutoUpdate=false;camera.matrix.makeTranslation(1,2,3);
 expect(readCameraWorldPose(camera).position.toArray()).toEqual([8,10,12]);
 expect(camera.matrixWorld.elements).toEqual(new THREE.Matrix4().elements);
 camera.matrixWorldAutoUpdate=false;camera.matrixWorld.makeTranslation(20,30,40);
 expect(readCameraWorldPose(camera).position.toArray()).toEqual([20,30,40]);
 expect(camera.matrix.elements).toEqual(new THREE.Matrix4().makeTranslation(1,2,3).elements);
});
