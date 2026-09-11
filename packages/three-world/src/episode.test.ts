import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreePhysics } from './physics.js';
import { createWorld } from './world.js';
import type { WorldObservation } from './contracts.js';

const root = () => new THREE.Group();
function plane(y = 0) { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40, 10, 10), new THREE.MeshBasicMaterial()); mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; return mesh; }
function box(x: number, y: number, z: number, size = [2, 2, 2]) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size as [number, number, number]), new THREE.MeshBasicMaterial()); mesh.position.set(x, y, z); return mesh; }

afterEach(() => { vi.unstubAllGlobals(); });
describe('Episode local Rapier start probes', () => {
 it('keeps free starts exact while rejecting actual capsule overlap before and after broad-phase sync',async()=>{
  const physics=await ThreePhysics.create();try{
   physics.addCharacter('player',root());physics.addRigid('floating-block',box(2,4,2),{kind:'fixed',shape:'box'});physics.addRigid('floating-shell',box(8,4,2),{kind:'fixed',shape:'trimesh'});
   for(const synchronized of [false,true]){
    if(synchronized)physics.step(1/60,{});const before=physics.state('player');
    expect(physics.probeCharacterStart('player',[-2,3,2],'free')).toMatchObject({isValid:true,resolvedPositionWorldMetersXYZ:[-2,3,2]});
    expect(physics.probeCharacterStart('player',[2,3,2],'free')).toMatchObject({isValid:false,diagnostics:[{code:'EPISODE_START_BODY_OVERLAP'}]});
    expect(physics.probeCharacterStart('player',[8,4.5,2],'free').isValid).toBe(false);
    expect(physics.probeCharacterStart('player',[8,5,2],'free').isValid).toBe(true);
    expect(physics.state('player')).toEqual(before);
   }
  }finally{physics.dispose();}
 });

 it('resolves the requested level without touching simulation or searching adjacent XZ', async () => {
  const physics = await ThreePhysics.create();
  try {
   physics.addRigid('ground', plane(), {kind:'fixed'}); physics.addRigid('upper', plane(5), {kind:'fixed'}); physics.addCharacter('player', root());
   const before = physics.state('player'), audit = physics.audit();
   const lower = physics.probeCharacterStart('player', [2, .1, 2]), upper = physics.probeCharacterStart('player', [2, 5.1, 2]);
   expect(lower.isValid).toBe(true); expect(upper.isValid).toBe(true);
   expect(lower.resolvedPositionWorldMetersXYZ[1]).toBeCloseTo(.015, 3); expect(upper.resolvedPositionWorldMetersXYZ[1]).toBeCloseTo(5.015, 3);
   expect(lower.resolvedPositionWorldMetersXYZ[0]).toBe(2); expect(lower.resolvedPositionWorldMetersXYZ[2]).toBe(2);
   expect(physics.probeCharacterStart('player', [2, 3, 2]).isValid).toBe(false);
   expect(physics.probeCharacterStart('player', [20.8, 0, 2]).isValid).toBe(false);
   expect(physics.state('player')).toEqual(before); expect(physics.audit()).toEqual(audit);
   physics.step(1/60, {});
   expect(physics.probeCharacterStart('player', [2, .1, 2]).resolvedPositionWorldMetersXYZ[1]).toBeCloseTo(lower.resolvedPositionWorldMetersXYZ[1], 4);
  } finally { physics.dispose(); }
 });
 it('rejects a body intersecting walls, a low ceiling, another actor and a steep slope', async () => {
  const physics = await ThreePhysics.create();
  try {
   physics.addRigid('ground', plane(), {kind:'fixed'}); physics.addCharacter('player', root());
   physics.addRigid('wall', box(4, 1, 0), {kind:'fixed',shape:'box'});
   physics.addRigid('ceiling', box(-4, 1.8, 0, [3, .3, 3]), {kind:'fixed'});
   const npc = root(); npc.position.set(0,0,4); physics.addCharacter('npc',npc);
   for (const point of [[4,0,0],[-4,0,0],[0,0,4]] as const) expect(physics.probeCharacterStart('player',point).isValid, JSON.stringify(point)).toBe(false);
   const slope = plane(); slope.rotation.x=-Math.PI/2+Math.PI/3; slope.position.set(0,3,-6);physics.addRigid('slope',slope,{kind:'fixed'});
   expect(physics.probeCharacterStart('player',[0,3,-6]).isValid).toBe(false);
  } finally {physics.dispose();}
 });
});

async function fixture(parentedCamera = false,custom=false,npcNavigation=false) {
 const windowTarget = new EventTarget();const documentTarget=Object.assign(new EventTarget(),{defaultView:windowTarget,activeElement:null,body:{},documentElement:{},hidden:false});Object.assign(windowTarget,{document:documentTarget});vi.stubGlobal('window',windowTarget);
 const frames:FrameRequestCallback[]=[];vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.push(fn);return frames.length;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const canvas=Object.assign(new EventTarget(),{width:800,height:600,ownerDocument:documentTarget,getAttribute:()=>null,removeAttribute:()=>{},setAttribute:()=>{},style:{getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty:()=>{},removeProperty:()=>{}},toDataURL:vi.fn(()=> 'data:image/png;base64,dGVzdA==')});
 let ratio=2;const size=new THREE.Vector2(400,300);
 const renderer={shadowMap:{enabled:false,type:THREE.PCFShadowMap,needsUpdate:false},domElement:canvas,render:vi.fn(),getSize:(out:THREE.Vector2)=>out.copy(size),getPixelRatio:()=>ratio,setPixelRatio:(value:number)=>{ratio=value;},setSize:(x:number,y:number)=>{size.set(x,y);canvas.width=x*ratio;canvas.height=y*ratio;}} as unknown as THREE.WebGLRenderer;
 const camera=new THREE.PerspectiveCamera(50,4/3,.1,500),scene=new THREE.Scene();camera.position.set(3,3,6);camera.lookAt(0,1,0);
 const world=await createWorld({scene,camera,renderer,navigation:npcNavigation,assetDefinitions:{}});
 world.addEntity({id:'floor',object:plane(),role:'terrain'});
 const actor=root();actor.rotation.y=.3;
 if(parentedCamera){actor.add(camera);camera.position.set(3,3,6);camera.lookAt(0,1,0);}
 if(custom)world.registerMovement({id:'flight',version:1,description:'Direct flight',initialState:null,update:({input,state})=>({state,velocityWorldMetersPerSecondXYZ:[0,(input.moveYRatio??0)*3,0],applyGravity:false}),episode:{startSupport:'free',input:({body,targetPositionWorldMetersXYZ})=>({moveYRatio:Math.max(-1,Math.min(1,targetPositionWorldMetersXYZ[1]-body.positionWorldMetersXYZ[1]))})}});
 world.addCharacter({id:'player',object:actor,...(custom?{movement:{kind:'custom' as const,movementId:'flight'}}:{}),body:{heightMeters:1.8,radiusMeters:.35},frontYawRadians:.4});
 if(npcNavigation){const npc=root();npc.position.set(3,0,0);world.addCharacter({id:'npc',object:npc,body:{heightMeters:1.8,radiusMeters:.35}});}
 world.setControlledEntity('player');world.setCameraFollow({targetEntityId:'player'});await world.start();
 const observer=(windowTarget as unknown as {__WORLDKIT_EVAL__:WorldObservation}).__WORLDKIT_EVAL__;
 expect(observer.controlledObject).toBe(actor);
 expect(observer).not.toHaveProperty('player');
 expect(world.humanoid).toBeUndefined();
 return {world,actor,camera,renderer,canvas,frames,observer,port:observer.episode!};
}
describe('Episode observer ownership and relative opening',()=>{
 it('dispatches NPC navigation through the existing command owner and invalidates a released lease',async()=>{
  const {world,port}=await fixture(false,false,true);try{
   await port.prepareSegment({positionWorldMetersXYZ:[0,0,0],facingYawRadians:0},{widthPixels:640,heightPixels:360});
   expect(await port.execute({type:'actor.move-to',entityId:'player',targetPositionWorldMetersXYZ:[0,0,2]})).toMatchObject({status:'rejected',error:{code:'PLAYER_INPUT_OWNS_ACTOR'}});
   const before=world.getEntityState('npc').positionWorldMetersXYZ;
   expect(await port.execute({type:'actor.move-to',entityId:'npc',targetPositionWorldMetersXYZ:[3,0,3]})).toMatchObject({status:'accepted'});
   expect(world.getEntityState('npc').positionWorldMetersXYZ).toEqual(before);
   port.advance({},60);expect(world.getEntityState('npc').positionWorldMetersXYZ[2]).toBeGreaterThan(1);
   const pending=port.execute({type:'actor.stop',entityId:'npc'});port.release();
   expect(await pending).toMatchObject({status:'rejected',error:{code:'EPISODE_CAPTURE_OWNS_CLOCK'}});
  }finally{world.dispose();}
 });
 it('records custom flight through a pure input adapter and admits free starts',async()=>{
  const {world,port}=await fixture(false,true);try{
   expect(port.capabilities().movement.episodeInput).toBe('custom');
   expect(port.probeStart({positionWorldMetersXYZ:[0,3,0],facingYawRadians:0}).isValid).toBe(true);
   await port.prepareSegment({positionWorldMetersXYZ:[0,3,0],facingYawRadians:0},{widthPixels:320,heightPixels:180});
   const before=world.snapshot(),request={targetPositionWorldMetersXYZ:[0,6,0] as const,gait:'walk' as const};
   const input=port.routeInput!(request);expect(input).toEqual({moveYRatio:1});expect(world.snapshot()).toEqual(before);
   port.advance(input,30);expect(world.getEntityState('player').positionWorldMetersXYZ[1]).toBeGreaterThan(4);
   await expect(port.execute({type:'camera.set-perspective',perspective:'third-person'})).resolves.toMatchObject({status:'applied'});
   port.release();expect(()=>port.routeInput!(request)).toThrow('EPISODE_SEGMENT_NOT_PREPARED');
  }finally{world.dispose();}
 });

 it('installs automatically and keeps fixed time, actor facing and camera memory at each new start',async()=>{
  const {world,port,actor,camera,frames,canvas}=await fixture();
  try{
   const sun=new THREE.DirectionalLight();world.configureShadowLight(sun);world.scene.add(sun);
   const shadowState=()=>({enabled:world.renderer!.shadowMap.enabled,type:world.renderer!.shadowMap.type,settings:world.shadowSettings,cast:sun.castShadow,map:sun.shadow.mapSize.toArray()});
   const initialShadows=shadowState();
   expect(port.schemaVersion).toBe(1);expect(port.capabilities().movement.kind).toBe('ground');
   const sky=new THREE.Mesh(new THREE.SphereGeometry(1000),new THREE.MeshBasicMaterial());world.scene.add(sky);
   expect(port.capabilities().worldBounds.minimumWorldMetersXYZ[0]).toBeCloseTo(-20);expect(port.capabilities().worldBounds.maximumWorldMetersXYZ[0]).toBeCloseTo(20);
   const oldCamera=camera.getWorldPosition(new THREE.Vector3()),oldRotation=camera.getWorldQuaternion(new THREE.Quaternion());
   const prepared=await port.prepareSegment({positionWorldMetersXYZ:[8,0,4],facingYawRadians:Math.PI/2},{widthPixels:640,heightPixels:360});
   expect(prepared.simulationTick).toBe(1);expect(prepared.isRunning).toBe(false);expect(canvas.width).toBe(640);expect(canvas.height).toBe(360);
   const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2-.7);
   const expected=oldCamera.clone().applyQuaternion(rotation).add(new THREE.Vector3(8,.015,4));
   expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(.003);
   expect(camera.getWorldQuaternion(new THREE.Quaternion()).angleTo(oldRotation.premultiply(rotation))).toBeLessThan(.001);
   const front=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),.4).applyQuaternion(actor.getWorldQuaternion(new THREE.Quaternion()));expect(front.x).toBeCloseTo(-1,5);
   const before=world.snapshot();frames[0]!(100);expect(world.snapshot()).toEqual(before);
   await expect(world.start()).rejects.toMatchObject({code:'EPISODE_CAPTURE_OWNS_CLOCK'});await expect(world.reset()).rejects.toMatchObject({code:'EPISODE_CAPTURE_OWNS_CLOCK'});
   expect(()=>world.step({},2)).toThrow();const capture=port.frame('image/png');expect(capture.captureSurface).toBe('world-renderer-canvas');expect(capture.snapshot.simulationTick).toBe(1);expect(capture.camera.projectionMatrix).toHaveLength(16);expect(capture.camera.controlForwardWorldXYZ).toHaveLength(3);
   const initialEye=camera.getWorldPosition(new THREE.Vector3());port.advance({moveZRatio:-1},1);expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(initialEye)).toBeLessThan(.05);
   const first=port.advance({moveZRatio:-1,run:true},60);expect(first.simulationTick).toBe(62);expect(new THREE.Vector3(...first.entities.find(e=>e.id==='player')!.positionWorldMetersXYZ).distanceTo(new THREE.Vector3(8,0,4))).toBeGreaterThan(3);
   await port.prepareSegment({positionWorldMetersXYZ:[-8,0,4],facingYawRadians:-Math.PI/2},{widthPixels:640,heightPixels:360});
   expect(new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),.4).applyQuaternion(actor.getWorldQuaternion(new THREE.Quaternion())).x).toBeCloseTo(1,5);
   port.advance({moveZRatio:-1},1);expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(-8,0,4))).toBeLessThan(10);
   port.release();expect(canvas.width).toBe(800);expect(canvas.height).toBe(600);expect(()=>port.advance({},1)).toThrow();await world.start();expect(world.isRunning).toBe(true);expect(()=>port.advance({},1)).toThrow();
   expect(shadowState()).toEqual(initialShadows);
  }finally{world.dispose();}
 });
 it('does not double-transform a camera parented beneath the actor and resets to the original world',async()=>{
  const {world,port,camera,actor}=await fixture(true);
  try{
   const before=camera.getWorldPosition(new THREE.Vector3()),actorBefore=actor.getWorldPosition(new THREE.Vector3());
   await port.prepareSegment({positionWorldMetersXYZ:[10,0,-4],facingYawRadians:.7},{widthPixels:640,heightPixels:360});
   expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(before.clone().sub(actorBefore).add(new THREE.Vector3(10,.015,-4)))).toBeLessThan(.01);
   port.release();await world.reset();expect(actor.getWorldPosition(new THREE.Vector3()).length()).toBe(0);expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeLessThan(.001);
  }finally{world.dispose();}
 });
 it('rejects concurrent preparation, permits cancellation and restores viewport after invalid starts',async()=>{
  const {world,port,canvas}=await fixture();
  try{
   const pending=port.prepareSegment({positionWorldMetersXYZ:[5,0,5],facingYawRadians:0},{widthPixels:640,heightPixels:360});
   await expect(port.prepareSegment({positionWorldMetersXYZ:[5,0,5],facingYawRadians:0},{widthPixels:640,heightPixels:360})).rejects.toMatchObject({code:'EPISODE_PREPARATION_IN_PROGRESS'});await pending;
   const cancelled=port.prepareSegment({positionWorldMetersXYZ:[5,0,5],facingYawRadians:0},{widthPixels:640,heightPixels:360});port.release();await expect(cancelled).rejects.toMatchObject({code:'EPISODE_PREPARATION_CANCELLED'});
   await expect(port.prepareSegment({positionWorldMetersXYZ:[100,0,5],facingYawRadians:0},{widthPixels:640,heightPixels:360})).rejects.toMatchObject({code:'EPISODE_START_UNSUPPORTED'});
   expect(canvas.width).toBe(800);expect(canvas.height).toBe(600);await world.start();expect(world.isRunning).toBe(true);
  }finally{world.dispose();}
 });
 it('isolates a live user world from another recording instance and invalidates disposed ports',async()=>{
  const user=await fixture(),recording=await fixture();
  try{
   const before=user.world.snapshot();
   await recording.port.prepareSegment({positionWorldMetersXYZ:[8,0,3],facingYawRadians:1},{widthPixels:640,heightPixels:360});
   recording.port.advance({moveZRatio:-1},20);
   expect(user.world.snapshot()).toEqual(before);expect(user.world.isRunning).toBe(true);expect(user.canvas.width).toBe(800);
   const tick=recording.world.simulationTick;expect(()=>recording.port.advance({},-1)).toThrow();expect(recording.world.simulationTick).toBe(tick);
   expect(recording.port.advance({},0).simulationTick).toBe(tick);
   recording.world.dispose();expect(()=>recording.port.frame('image/png')).toThrow();expect(()=>recording.port.capabilities()).toThrow();recording.port.release();
  }finally{user.world.dispose();recording.world.dispose();}
 });
});
