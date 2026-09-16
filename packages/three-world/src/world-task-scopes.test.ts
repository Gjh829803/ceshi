import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {createWorld} from './world';
import * as assetModule from './assets';
import type {WorldAssets} from './assets-library';
import type {AssetDefinition,AssetInstance as RawAsset} from './engine-contracts';
import type {EnvironmentDefinition} from './humanoid-runtime/environment/types';
import catalog from '../../../assets/three-creator/asset-catalog.json';

// Public-world regressions: preserve cancellation timing and real asset ownership.
describe('task scopes: stop',()=>{
afterEach(()=>vi.unstubAllGlobals());
it.each(['stop','repeat-stop','restart-stop'])('ordinary task completes after %s without aborting or advancing simulation',async action=>{
 let id=0;const frames=new Map<number,FrameRequestCallback>();
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++id,cb);return id;});
 vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key));
 const world=await createWorld({navigation:false,assetDefinitions:{}});
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 let signal:AbortSignal|undefined,aborted=0,completed=false;
 try{
  const score=world.state.define('score',0);world.addEntity({id:'marker',object:new THREE.Group(),role:'decoration'});
  await world.start();expect(frames.size).toBe(1);const tick=world.simulationTick;
  const task=world.runTask(async scope=>{
   signal=scope.signal;scope.signal.addEventListener('abort',()=>aborted++);await gate;
   scope.setState(score,7);scope.addEntity({id:'late',object:new THREE.Group(),role:'decoration'});
   const receipt=await scope.execute({type:'entity.set-visible',entityId:'marker',isVisible:false});
   expect(receipt.status).toBe('applied');completed=true;return 'task-finished';
  });
  world.stop();if(action==='repeat-stop')world.stop();if(action==='restart-stop'){await world.start();world.stop();}
  expect(signal).toBeDefined();expect(signal!.aborted).toBe(false);expect(aborted).toBe(0);expect(completed).toBe(false);expect(score.value).toBe(0);
  expect(world.isRunning).toBe(false);expect(frames.size).toBe(0);
  release();await expect(task).resolves.toBe('task-finished');
  expect(score.value).toBe(7);expect(world.getEntityState('late')).toBeDefined();expect(world.getEntityState('marker').isVisibleLocal).toBe(false);
  expect(signal!.aborted).toBe(false);expect(aborted).toBe(0);expect(world.isRunning).toBe(false);expect(world.simulationTick).toBe(tick);expect(frames.size).toBe(0);expect(world.snapshot().errors).toEqual([]);
 }finally{release();world.dispose();}
});
});

describe('task scopes: reset',()=>{
const cases=['state','entity','command'].flatMap(kind=>[1,2].map(resets=>({kind,resets})));
it.each(cases)('rejects late $kind write after $resets reset(s) while a fresh task succeeds',async({kind,resets})=>{
 const world=await createWorld({navigation:false,assetDefinitions:{}});
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 let oldSignal:AbortSignal|undefined,abortCount=0,resetCallbacks=0,oldSettled=false;
 try{
  const score=world.state.define('score',0);world.addEntity({id:'marker',object:new THREE.Group(),role:'decoration'});
  await world.start();world.stop();
  const old=world.runTask(async scope=>{
   oldSignal=scope.signal;scope.signal.addEventListener('abort',()=>abortCount++);await gate;
   if(kind==='state')scope.setState(score,99);
   if(kind==='entity')scope.addEntity({id:'late',object:new THREE.Group(),role:'decoration'});
   if(kind==='command')await scope.execute({type:'entity.set-visible',entityId:'marker',isVisible:false});
   return 'unexpected-success';
  }).then(value=>{oldSettled=true;return {ok:true,value};},error=>{oldSettled=true;return {ok:false,error};});
  world.onReset(()=>{resetCallbacks++;expect(oldSignal!.aborted).toBe(true);expect(abortCount).toBe(1);});
  for(let i=0;i<resets;i++){
   const resetting=world.reset();expect(oldSignal!.aborted).toBe(true);expect(abortCount).toBe(1);await resetting;
   expect(world.simulationTick).toBe(0);expect(world.isRunning).toBe(false);expect(oldSettled).toBe(false);
  }
  expect(resetCallbacks).toBe(resets);expect(score.value).toBe(0);
  let freshSignal:AbortSignal|undefined;
  await expect(world.runTask(async scope=>{
   freshSignal=scope.signal;expect(scope.signal.aborted).toBe(false);await Promise.resolve();
   scope.setState(score,11);scope.addEntity({id:'fresh',object:new THREE.Group(),role:'decoration'});
   const receipt=await scope.execute({type:'entity.set-position',entityId:'marker',positionWorldMetersXYZ:[2,0,0]});expect(receipt.status).toBe('applied');return 'fresh-completed';
  })).resolves.toBe('fresh-completed');
  release();expect(await old).toMatchObject({ok:false,error:{code:'STALE_TASK'}});
  expect(abortCount).toBe(1);expect(freshSignal!.aborted).toBe(false);expect(score.value).toBe(11);
  expect(world.getEntityState('marker').isVisibleLocal).toBe(true);expect(world.getEntityState('marker').positionWorldMetersXYZ).toEqual([2,0,0]);
  expect(world.getEntityState('fresh')).toBeDefined();expect(world.snapshot().entities.some(e=>e.id==='late')).toBe(false);
  expect(world.simulationTick).toBe(0);expect(world.isRunning).toBe(false);expect(world.snapshot().errors).toEqual([]);
 }finally{release();world.dispose();}
});
});

describe('task scopes: dispose',()=>{
const row=catalog.assets.find(a=>a.id==='humanoid.uefn-mannequin')!;let serial=0;
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(yes=>{resolve=yes;});return {promise,resolve};}
function fixture(gate=Promise.resolve()){
 const def={...row,uri:`https://local-acceptance.test/${++serial}/${row.sha256}.glb`} as unknown as AssetDefinition;
 const fetchBytes=vi.fn(async()=>{await gate;return new Response(await readFile(resolve(row.sourcePath)));});vi.stubGlobal('fetch',fetchBytes);
 return {definitions:{[def.id]:def},fetchBytes};
}
function observe(raw:RawAsset){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),skeletons=new Set<THREE.Skeleton>();
 raw.object.traverse(obj=>{const mesh=obj as THREE.SkinnedMesh;if(mesh.isMesh){geometries.add(mesh.geometry);for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(m);}if(mesh.isSkinnedMesh)skeletons.add(mesh.skeleton);});
 const geometryCalls=[...geometries].map(g=>{const event=vi.fn();g.addEventListener('dispose',event);return event;}),materialCalls=[...materials].map(m=>vi.spyOn(m,'dispose')),skeletonCalls=[...skeletons].map(s=>vi.spyOn(s,'dispose'));
 return {geometries,geometryCalls,materialCalls,skeletonCalls,dispose:vi.spyOn(raw,'dispose')};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('late real model load after world disposal is rejected and releases its instance and final source lease',async()=>{
 const gate=deferred(),{definitions,fetchBytes}=fixture(gate.promise);const world=await createWorld({navigation:false,assetDefinitions:definitions});
 const original=assetModule.loadAsset;let raw:RawAsset|undefined,observed:ReturnType<typeof observe>|undefined;
 vi.spyOn(assetModule,'loadAsset').mockImplementation(async(...args)=>{raw=await original(...args);observed=observe(raw);return raw;});
 let signal:AbortSignal|undefined,continued=false;
 const task=world.runTask(async scope=>{signal=scope.signal;const asset=await scope.assets.load(row.id);continued=true;scope.addCharacter({id:'late',asset});}).then(()=>({ok:true}),error=>({ok:false,error}));
 try{
  await vi.waitFor(()=>expect(fetchBytes).toHaveBeenCalledTimes(1));world.dispose();world.dispose();expect(signal!.aborted).toBe(true);
  gate.resolve();expect(await task).toMatchObject({ok:false,error:{message:'ASSET_LIBRARY_DISPOSED'}});
  expect(continued).toBe(false);expect(raw).toBeDefined();expect(observed!.geometryCalls.length).toBeGreaterThan(0);expect(observed!.materialCalls.length).toBeGreaterThan(0);expect(observed!.skeletonCalls.length).toBeGreaterThan(0);
  expect(observed!.dispose).toHaveBeenCalledTimes(1);for(const spy of [...observed!.geometryCalls,...observed!.materialCalls,...observed!.skeletonCalls])expect(spy).toHaveBeenCalledTimes(1);
  expect(world.scene.getObjectByName(row.id)).toBeUndefined();await expect(world.start()).rejects.toThrow('WORLD_DISPOSED');
 }finally{gate.resolve();await task;world.dispose();}
});
it('disposal and task finally do not double-release an already loaded temporary asset or destroy a surviving shared instance',async()=>{
 const {definitions}=fixture();const world=await createWorld({navigation:false,assetDefinitions:definitions}),other=await createWorld({navigation:false,assetDefinitions:definitions});
 const gate=deferred(),loaded=deferred();let temp:any,raw:RawAsset|undefined,observed:ReturnType<typeof observe>|undefined,signal:AbortSignal|undefined;
 const task=world.runTask(async scope=>{signal=scope.signal;temp=await scope.assets.load(row.id);raw=(world.assets as WorldAssets).internal(temp);observed=observe(raw);loaded.resolve();await gate.promise;scope.addEntity({id:'late',object:new THREE.Group(),role:'decoration'});}).then(()=>({ok:true}),error=>({ok:false,error}));
 try{
  await loaded.promise;const survivor=await other.assets.load(row.id),survivorRaw=(other.assets as WorldAssets).internal(survivor);const survivorObserved=observe(survivorRaw);
  expect([...survivorObserved.geometries][0]).toBe([...observed!.geometries][0]);
  world.dispose();expect(signal!.aborted).toBe(true);gate.resolve();expect(await task).toMatchObject({ok:false,error:{code:'STALE_TASK'}});
  expect(observed!.dispose).toHaveBeenCalledTimes(1);for(const spy of [...observed!.materialCalls,...observed!.skeletonCalls])expect(spy).toHaveBeenCalledTimes(1);
  for(const spy of observed!.geometryCalls)expect(spy).not.toHaveBeenCalled();expect((world.assets as WorldAssets).owns(temp)).toBe(false);
  expect((other.assets as WorldAssets).owns(survivor)).toBe(true);expect(survivorObserved.dispose).not.toHaveBeenCalled();survivorRaw.play('walk');survivorRaw.update(.25);expect(survivorRaw.timeSeconds).toBeGreaterThan(0);
  other.dispose();expect(survivorObserved.dispose).toHaveBeenCalledTimes(1);for(const spy of observed!.geometryCalls)expect(spy).toHaveBeenCalledTimes(1);
 }finally{gate.resolve();await task;world.dispose();other.dispose();}
});
it('successful task transfers the asset to its character until world disposal',async()=>{
 const {definitions}=fixture();const world=await createWorld({navigation:false,assetDefinitions:definitions});let asset:any,observed:ReturnType<typeof observe>|undefined;
 try{
  await world.runTask(async scope=>{asset=await scope.assets.load(row.id);observed=observe((world.assets as WorldAssets).internal(asset));scope.addCharacter({id:'actor',asset});});
  expect((world.assets as WorldAssets).owns(asset)).toBe(true);expect(world.getEntityState('actor')).toBeDefined();expect(observed!.dispose).not.toHaveBeenCalled();world.step({},1);
  world.dispose();world.dispose();expect(observed!.dispose).toHaveBeenCalledTimes(1);for(const spy of [...observed!.geometryCalls,...observed!.materialCalls,...observed!.skeletonCalls])expect(spy).toHaveBeenCalledTimes(1);
 }finally{world.dispose();}
});
});

describe('task scopes: isolation',()=>{
const row=catalog.assets.find(a=>a.id==='humanoid.uefn-mannequin')!;let serial=0;
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(yes=>{resolve=yes;});return {promise,resolve};}
function observe(raw:RawAsset){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),skeletons=new Set<THREE.Skeleton>();
 raw.object.traverse(obj=>{const mesh=obj as THREE.SkinnedMesh;if(mesh.isMesh){geometries.add(mesh.geometry);for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(m);}if(mesh.isSkinnedMesh)skeletons.add(mesh.skeleton);});
 const geometryEvents=[...geometries].map(g=>{const event=vi.fn();g.addEventListener('dispose',event);return event;});
 return {geometries,geometryEvents,ownedCalls:[...materials].map(m=>vi.spyOn(m,'dispose')).concat([...skeletons].map(s=>vi.spyOn(s,'dispose'))),dispose:vi.spyOn(raw,'dispose')};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it.each(['success','failure'])('task A %s cleans only A while task B remains valid and keeps its shared model alive',async outcome=>{
 const def={...row,uri:`https://local-acceptance.test/isolation-${++serial}/${row.sha256}.glb`} as unknown as AssetDefinition;
 const fetchBytes=vi.fn(async()=>new Response(await readFile(resolve(row.sourcePath))));vi.stubGlobal('fetch',fetchBytes);
 const world=await createWorld({navigation:false,assetDefinitions:{[def.id]:def}}),library=world.assets as WorldAssets;
 const gateA=deferred(),gateB=deferred();let a:any,b:any,aRaw:RawAsset|undefined,bRaw:RawAsset|undefined,aSeen:ReturnType<typeof observe>|undefined,bSeen:ReturnType<typeof observe>|undefined;
 let signalA:AbortSignal|undefined,signalB:AbortSignal|undefined,abortA=0,abortB=0,bSettled=false;
 const proof=world.state.define('proof',0);
 const taskA=world.runTask(async scope=>{
  signalA=scope.signal;signalA.addEventListener('abort',()=>abortA++);a=await scope.assets.load(row.id);aRaw=library.internal(a);aSeen=observe(aRaw);await gateA.promise;
  if(outcome==='failure')throw new Error('TASK_A_INTENTIONAL_FAILURE');return 'A-finished';
 }).then(value=>({ok:true,value}),error=>({ok:false,error}));
 const taskB=world.runTask(async scope=>{
  signalB=scope.signal;signalB.addEventListener('abort',()=>abortB++);b=await scope.assets.load(row.id);bRaw=library.internal(b);bSeen=observe(bRaw);await gateB.promise;
  scope.setState(proof,42);scope.addEntity({id:'from-b',object:new THREE.Group(),role:'decoration'});return 'B-finished';
 }).then(value=>{bSettled=true;return {ok:true,value};},error=>{bSettled=true;return {ok:false,error};});
 try{
  await vi.waitFor(()=>{expect(aSeen).toBeDefined();expect(bSeen).toBeDefined();});
  expect(fetchBytes).toHaveBeenCalledTimes(1);expect(a.object).not.toBe(b.object);expect(signalA).not.toBe(signalB);expect([...aSeen!.geometries]).toEqual([...bSeen!.geometries]);
  expect(aSeen!.ownedCalls.length).toBeGreaterThan(0);expect(aSeen!.geometryEvents.length).toBeGreaterThan(0);
  gateA.resolve();const resultA=await taskA;
  if(outcome==='failure')expect(resultA).toMatchObject({ok:false,error:{message:'TASK_A_INTENTIONAL_FAILURE'}});else expect(resultA).toEqual({ok:true,value:'A-finished'});
  expect(library.owns(a)).toBe(false);expect(aSeen!.dispose).toHaveBeenCalledTimes(1);for(const spy of aSeen!.ownedCalls)expect(spy).toHaveBeenCalledTimes(1);
  expect(bSettled).toBe(false);expect(signalB!.aborted).toBe(false);expect(abortB).toBe(0);expect(library.owns(b)).toBe(true);
  expect(bSeen!.dispose).not.toHaveBeenCalled();for(const spy of bSeen!.ownedCalls)expect(spy).not.toHaveBeenCalled();for(const event of aSeen!.geometryEvents)expect(event).not.toHaveBeenCalled();
  bRaw!.play('walk');bRaw!.update(.25);expect(bRaw!.timeSeconds).toBeGreaterThan(0);expect(proof.value).toBe(0);
  gateB.resolve();expect(await taskB).toEqual({ok:true,value:'B-finished'});expect(proof.value).toBe(42);expect(world.getEntityState('from-b')).toBeDefined();
  expect(library.owns(b)).toBe(false);expect(bSeen!.dispose).toHaveBeenCalledTimes(1);for(const spy of bSeen!.ownedCalls)expect(spy).toHaveBeenCalledTimes(1);
  for(const event of [...aSeen!.geometryEvents,...bSeen!.geometryEvents])expect(event).toHaveBeenCalledTimes(1);
  expect(abortA).toBe(0);expect(abortB).toBe(0);expect(world.simulationTick).toBe(0);expect(world.isRunning).toBe(false);
  world.dispose();expect(abortA).toBe(0);expect(abortB).toBe(0);expect(aSeen!.dispose).toHaveBeenCalledTimes(1);expect(bSeen!.dispose).toHaveBeenCalledTimes(1);
 }finally{gateA.resolve();gateB.resolve();await Promise.all([taskA,taskB]);world.dispose();}
});
});

describe('task scopes: map',()=>{
const map:EnvironmentDefinition={id:'acceptance-map',name:'Acceptance',description:'',bounds:{min:[-30,-5,-30],max:[30,20,30]},boxes:[{id:'floor',position:[0,-.5,0],size:[60,1,60]}],water:[],regions:[],spawns:[],playerSpawn:[0,.04,0]};
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(yes=>{resolve=yes;});return {promise,resolve};}
async function setup(){const world=await createWorld({navigation:false,assetDefinitions:{},humanoid:{map,vehicles:[],character:{instanceId:'player',object:new THREE.Group()}}});world.addEntity({id:'marker',object:new THREE.Group(),role:'decoration'});world.step();return world;}
afterEach(()=>vi.restoreAllMocks());
it('three successful map replacements invalidate old tasks once before notification while fresh tasks remain usable',async()=>{
 const world=await setup(),runtime=world.humanoid!,proof=world.state.define('proof',0),tick=world.simulationTick;
 const gates:ReturnType<typeof deferred>[]=[],tasks:Promise<any>[]=[],signals:AbortSignal[]=[],aborts:number[]=[];const order:string[]=[];
 const unsubscribe=runtime.onSimulationReplaced(reason=>{order.push('notice:'+reason);expect(signals.every(s=>s.aborted)).toBe(true);});
 try{
  for(let i=0;i<3;i++){
   const gate=deferred();gates.push(gate);aborts.push(0);
   const task=world.runTask(async scope=>{signals.push(scope.signal);scope.signal.addEventListener('abort',()=>{aborts[i]=(aborts[i]??0)+1;order.push('abort:'+i);});await gate.promise;scope.setState(proof,999);scope.addEntity({id:'stale-'+i,object:new THREE.Group(),role:'decoration'});}).then(()=>({ok:true}),error=>({ok:false,error}));tasks.push(task);
   const previous=runtime.environment,release=vi.spyOn(previous,'dispose');runtime.switchMap({...map,id:'replacement-'+i});
   expect(runtime.environment).not.toBe(previous);expect(runtime.environment.map.id).toBe('replacement-'+i);expect(release).toHaveBeenCalledTimes(1);expect(aborts).toEqual(Array(i+1).fill(1));expect(order.slice(-2)).toEqual(['abort:'+i,'notice:map']);expect(world.simulationTick).toBe(tick);
   await expect(world.runTask(async scope=>{expect(scope.signal.aborted).toBe(false);await Promise.resolve();scope.setState(proof,i+1);scope.addEntity({id:'fresh-'+i,object:new THREE.Group(),role:'decoration'});const receipt=await scope.execute({type:'entity.set-position',entityId:'marker',positionWorldMetersXYZ:[i+1,0,0]});expect(receipt.status).toBe('applied');return 'fresh';})).resolves.toBe('fresh');
  }
  gates.forEach(g=>g.resolve());for(const result of await Promise.all(tasks))expect(result).toMatchObject({ok:false,error:{code:'STALE_TASK'}});
  expect(aborts).toEqual([1,1,1]);expect(proof.value).toBe(3);expect(world.getEntityState('marker').positionWorldMetersXYZ).toEqual([3,0,0]);
  for(let i=0;i<3;i++){expect(world.getEntityState('fresh-'+i)).toBeDefined();expect(world.snapshot().entities.some(e=>e.id==='stale-'+i)).toBe(false);}
  expect(world.simulationTick).toBe(tick);expect(world.snapshot().errors).toEqual([]);
 }finally{gates.forEach(g=>g.resolve());await Promise.all(tasks);unsubscribe();world.dispose();}
});
it.each(['duplicate-map-id','registered-entity-conflict'])('failed map validation (%s) preserves environment, task and an active movement operation',async failure=>{
 const world=await setup(),runtime=world.humanoid!,gate=deferred(),proof=world.state.define('proof',0);let signal:AbortSignal|undefined,aborts=0,notices=0;
 const unsubscribe=runtime.onSimulationReplaced(()=>notices++);
 const task=world.runTask(async scope=>{signal=scope.signal;scope.signal.addEventListener('abort',()=>aborts++);await gate.promise;scope.setState(proof,7);scope.addEntity({id:'valid-late',object:new THREE.Group(),role:'decoration'});return 'continued';}).then(value=>({ok:true,value}),error=>({ok:false,error}));
 try{
  // An independently registered collider supplies a real SDK/map identity conflict.
  const object=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());object.position.set(8,1,0);
  world.addEntity({id:'crate',object,role:'obstacle',physics:{kind:'fixed',shape:'box'}});
  try{
   const receipt=await world.execute({type:'entity.set-position',entityId:'marker',positionWorldMetersXYZ:[1,0,0],durationSeconds:.1});expect(receipt.status).toBe('accepted');if(receipt.status!=='accepted')throw Error('OPERATION_NOT_ACCEPTED');
   const before=world.snapshot(),environment=runtime.environment,release=vi.spyOn(environment,'dispose');
   const invalid=failure==='duplicate-map-id'?{...map,id:'invalid',boxes:[map.boxes[0]!,map.boxes[0]!]}:{...map,id:'invalid',boxes:[...map.boxes,{id:'crate',position:[10,1,0] as [number,number,number],size:[1,1,1] as [number,number,number]}]};
   expect(()=>runtime.switchMap(invalid)).toThrow();expect(runtime.environment).toBe(environment);expect(release).not.toHaveBeenCalled();expect(world.snapshot()).toEqual(before);
   expect(signal!.aborted).toBe(false);expect(aborts).toBe(0);expect(notices).toBe(0);expect(world.operations.get(receipt.operationId).status).toBe('running');
   gate.resolve();expect(await task).toEqual({ok:true,value:'continued'});expect(proof.value).toBe(7);expect(world.getEntityState('valid-late')).toBeDefined();
   world.step({},10);expect(world.operations.get(receipt.operationId).status).toBe('succeeded');expect(world.getEntityState('marker').positionWorldMetersXYZ).toEqual([1,0,0]);expect(world.snapshot().errors).toEqual([]);
  }finally{world.dispose();object.geometry.dispose();(object.material as THREE.Material).dispose();}
 }finally{gate.resolve();await task;unsubscribe();world.dispose();}
});
});
