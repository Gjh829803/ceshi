import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createWorld,type ThreeWorld} from './world.js';
import type {WorldObservation} from './contracts.js';

const worlds:ThreeWorld[]=[];
afterEach(()=>{for(const world of worlds.splice(0))world.dispose();vi.unstubAllGlobals();});

async function fixture() {
 // Headless renderer stub only: these tests exercise the real registry/observer/reset,
 // not rendered pixels. Browser isolation is verified separately by the capture adapter.
 const renderer={render:vi.fn()} as unknown as THREE.WebGLRenderer;
 const world=await createWorld({scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),renderer,navigation:false});worlds.push(world);
 const trees=new THREE.Group(),tree=new THREE.Group(),lamps=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),3);trees.add(tree,lamps);
 world.addEntity({id:'trees',object:trees,role:'decoration'});
 const tower=new THREE.Group();world.addEntity({id:'tower',object:tower,role:'decoration'});
 const hero=new THREE.Group(),npc=new THREE.Group();hero.position.set(0,1,0);npc.position.set(4,1,0);
 world.addCharacter({id:'hero',object:hero,body:{heightMeters:1.8,radiusMeters:.3}});
 world.addCharacter({id:'npc',object:npc,body:{heightMeters:1.8,radiusMeters:.3}});world.setControlledEntity('hero');
 vi.stubGlobal('window',{});vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
 const start=async()=>{await world.start();world.stop();return (window as unknown as {__WORLDKIT_EVAL__:WorldObservation}).__WORLDKIT_EVAL__;};
 return {world,trees,tree,tower,lamps,hero,npc,start};
}
function rejects(callback:()=>unknown,code:string) {let failure:unknown;try{callback();}catch(error){failure=error;}expect(failure).toMatchObject({code});}

describe('capture selection on the real World lifecycle',()=>{
 it('publishes default subject-only selection, then live author priority independently from registration',async()=>{
  const {world,start,hero,tree}=await fixture(),observer=await start();
  expect(observer.captureTargetIds).toEqual(['hero']);expect(observer.targets).toEqual({hero});
  world.setCaptureTargets(['tower',{entityId:'trees',representative:{kind:'object',object:tree}}]);
  expect(observer.captureTargetIds).toEqual(['hero','tower','trees']);expect(observer.targetRepresentativesById!.trees!.object).toBe(tree);
  expect(world.snapshot().entities.map(entity=>entity.id)).toEqual(['trees','tower','hero','npc']);
  world.setCaptureTargets([]);expect(observer.captureTargetIds).toEqual(['hero']);
 });

 it('restores the baseline selection and live roots after selected entity despawn/reset',async()=>{
  const {world,start,trees,tree}=await fixture();world.setCaptureTargets([{entityId:'trees',representative:{kind:'object',object:tree}},'tower']);
  const observer=await start();expect((await world.execute({type:'entity.despawn',entityId:'trees'})).status).toBe('applied');
  expect(observer.captureTargetIds).toEqual(['hero','tower']);
  await world.reset();expect(observer.captureTargetIds).toEqual(['hero','trees','tower']);
  expect(observer.targets.trees).toBe(trees);expect(observer.targetRepresentativesById!.trees!.object).toBe(tree);
 });

 it('prunes a removed registered child representative without expanding to the remaining collection, then restores it on reset',async()=>{
  const {world,start,trees,tree}=await fixture();world.addEntity({id:'tree-representative',object:tree,role:'decoration'});
  world.setCaptureTargets([{entityId:'trees',representative:{kind:'object',object:tree}},'tower']);const observer=await start();
  expect((await world.execute({type:'entity.despawn',entityId:'tree-representative'})).status).toBe('applied');
  expect(observer.captureTargetIds).toEqual(['hero','tower']);expect(observer.targets).not.toHaveProperty('trees');
  expect(world.snapshot().entities.some(entity=>entity.id==='trees')).toBe(true);
  await world.reset();expect(observer.captureTargetIds).toEqual(['hero','trees','tower']);
  expect(observer.targets.trees).toBe(trees);expect(observer.targetRepresentativesById!.trees!.object).toBe(tree);expect(tree.parent).toBe(trees);
 });

 it('rejects stale live representatives and validates them after reset hooks',async()=>{
  const {world,start,tree,trees}=await fixture();world.setCaptureTargets([{entityId:'trees',representative:{kind:'object',object:tree}}]);const observer=await start();
  tree.removeFromParent();rejects(()=>observer.targetRepresentativesById,'CAPTURE_REPRESENTATIVE_FOREIGN');
  await expect(world.reset()).rejects.toMatchObject({code:'CAPTURE_REPRESENTATIVE_FOREIGN'});
  world.onReset(()=>trees.add(tree));await world.reset();expect(observer.targetRepresentativesById!.trees!.object).toBe(tree);
 });

 it('revalidates instance count and permits reset hooks to restore the selected instance',async()=>{
  const {world,start,lamps}=await fixture();world.setCaptureTargets([{entityId:'trees',representative:{kind:'instance',object:lamps,instanceIndex:2}}]);const observer=await start();
  lamps.count=1;rejects(()=>observer.captureTargetIds,'CAPTURE_INSTANCE_INVALID');
  await expect(world.reset()).rejects.toMatchObject({code:'CAPTURE_INSTANCE_INVALID'});
  world.onReset(()=>{lamps.count=3;});await world.reset();expect(observer.captureTargetIds).toEqual(['hero','trees']);
 });

 it('promotes an otherwise valid control switch to complete-subject capture without blocking gameplay',async()=>{
  const {world,start,npc}=await fixture();world.setCaptureTargets([{entityId:'npc',representative:{kind:'object',object:npc}}]);const observer=await start();
  rejects(()=>world.setCaptureTargets(['missing']),'CAPTURE_ENTITY_MISSING');expect(observer.captureTargetIds).toEqual(['hero','npc']);
  world.setControlledEntity('npc');expect(world.snapshot().controlledEntityId).toBe('npc');expect(observer.captureTargetIds).toEqual(['npc']);
  expect(observer.targetRepresentativesById).toEqual({});
  rejects(()=>world.setCaptureTargets([{entityId:'npc',representative:{kind:'object',object:npc}}]),'CAPTURE_SUBJECT_MUST_BE_COMPLETE');
  expect(observer.captureTargetIds).toEqual(['npc']);
  await world.reset();expect(world.snapshot().controlledEntityId).toBe('hero');expect(observer.captureTargetIds).toEqual(['hero','npc']);
  expect(observer.targetRepresentativesById!.npc).toEqual({kind:'object',object:npc});
 });

 it('preserves capture selection when the engine rejects an invalid control switch',async()=>{
  const {world,start,tower}=await fixture();world.setCaptureTargets([{entityId:'tower',representative:{kind:'object',object:tower}}]);const observer=await start();
  expect(()=>world.setControlledEntity('tower')).toThrow('WORLD_CONTROL_REQUIRES_CHARACTER');
  expect(world.snapshot().controlledEntityId).toBe('hero');expect(observer.captureTargetIds).toEqual(['hero','tower']);
  expect(observer.targetRepresentativesById!.tower).toEqual({kind:'object',object:tower});
 });
});
