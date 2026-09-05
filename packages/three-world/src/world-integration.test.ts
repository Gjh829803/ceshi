import * as THREE from 'three';
import { expect,it } from 'vitest';
import {createWorld} from './world.js';

it('accepts a declared ground movement profile and applies its speed through real physics',async()=>{
 const world=await createWorld({navigation:false});
 try{
  const ground=new THREE.Mesh(new THREE.BoxGeometry(30,1,30));ground.position.y=-.5;
  world.addEntity({id:'ground',object:ground,role:'terrain'});
  world.addCharacter({id:'hero',object:new THREE.Group(),body:{heightMeters:1.8,radiusMeters:.3},movement:{kind:'ground',walkSpeedMetersPerSecond:2.2,runSpeedMetersPerSecond:5.1}});
  world.setControlledEntity('hero');world.camera.position.set(0,3,6);world.camera.lookAt(0,1,0);
  await world.start();world.stop();world.step({},30);
  const start=world.getEntityState('hero').positionWorldMetersXYZ;
  world.step({moveZRatio:-1},60);
  expect(start[2]-world.getEntityState('hero').positionWorldMetersXYZ[2]).toBeCloseTo(2.2,2);
  const previous=world.getEntityState('hero').positionWorldMetersXYZ;
  world.step({moveZRatio:-1,run:true},60);
  expect(previous[2]-world.getEntityState('hero').positionWorldMetersXYZ[2]).toBeCloseTo(5.1,2);
 }finally{world.dispose();}
});

it('rejects a queued command whose observed world revision changed before its commit',async()=>{
 const world=await createWorld({navigation:false});
 try{
  world.addEntity({id:'object',object:new THREE.Group(),role:'decoration'});
  await world.start();
  const revision=world.describe().worldRevision;
  const pending=world.execute({type:'entity.set-position',entityId:'object',positionWorldMetersXYZ:[9,0,0]},{expectedWorldRevision:revision});
  await Promise.resolve();await Promise.resolve();
  world.addEntity({id:'another',object:new THREE.Group(),role:'decoration'});
  world.step();const receipt=await pending;
  expect(receipt.status).toBe('rejected');expect(world.getEntityState('object').positionWorldMetersXYZ).toEqual([0,0,0]);
 }finally{world.dispose();}
});

it('does not publish a ready or running world when an initial effect fails',async()=>{
 const world=await createWorld({navigation:false});
 try{
  world.defineParameter({id:'sky',description:'Sky',schema:{type:'boolean'},initialValue:true,writes:[{kind:'visual',channelId:'sky'}],effect:()=>{throw new Error('BROKEN_INITIAL_SKY');}});
  await expect(world.start()).rejects.toMatchObject({message:'BROKEN_INITIAL_SKY'});
  expect(world.isRunning).toBe(false);expect(world.snapshot().errors.length).toBeGreaterThan(0);
 }finally{world.dispose();}
});

it('finishes a follow operation immediately when its target is removed while paused',async()=>{
 const world=await createWorld();
 try{
  const floor=new THREE.Mesh(new THREE.BoxGeometry(30,1,30));floor.position.y=-.5;world.addEntity({id:'floor',object:floor,role:'terrain'});
  const npc=new THREE.Group();npc.position.set(0,.05,0);world.addCharacter({id:'npc',object:npc,body:{heightMeters:1.8,radiusMeters:.3}});
  const target=new THREE.Group();target.position.set(5,.05,0);world.addEntity({id:'target',object:target,role:'decoration'});
  await world.start();world.stop();
  const receipt=await world.execute({type:'actor.follow',entityId:'npc',targetEntityId:'target'});
  expect(receipt.status).toBe('accepted');if(receipt.status!=='accepted')throw new Error('Follow was not accepted');
  const completion=world.operations.wait(receipt.operationId);
  expect((await world.execute({type:'entity.despawn',entityId:'target'})).status).toBe('applied');
  const finished=await completion;expect(finished.status).toBe('failed');expect(finished.error?.code).toBe('FOLLOW_TARGET_REMOVED');
  expect(world.simulationTick).toBe(0);
 }finally{world.dispose();}
});

it('spawns prepared objects at world coordinates under a translated and rotated scene',async()=>{
 const scene=new THREE.Scene();scene.position.set(10,0,3);scene.rotation.y=Math.PI/2;
 const world=await createWorld({scene,navigation:false});
 try{
  await world.registerPrototype({id:'marker',description:'marker',template:{kind:'entity',options:{role:'decoration',object:new THREE.Group()}}});
  expect((await world.execute({type:'entity.spawn',prototypeId:'marker',entityId:'spawned',positionWorldMetersXYZ:[2,1,0]})).status).toBe('applied');
  const point=world.getEntityState('spawned').positionWorldMetersXYZ;
  expect(point[0]).toBeCloseTo(2);expect(point[1]).toBeCloseTo(1);expect(point[2]).toBeCloseTo(0);
 }finally{world.dispose();}
});
