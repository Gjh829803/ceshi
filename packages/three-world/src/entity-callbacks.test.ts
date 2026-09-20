import {readFile} from 'node:fs/promises';
import catalog from '../../../asset-library/dist/whitebox/asset-catalog.json';
import {Character} from './humanoid-runtime/character';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Group,PerspectiveCamera} from 'three';
import {createWorld,type World,type ThreeWorld} from './index';
import {createRoadVehicleSpec} from './humanoid-runtime/road-vehicle';
import type {EnvironmentDefinition} from './humanoid-runtime/environment/types';
const worlds:ThreeWorld[]=[];
afterEach(()=>{for(const world of worlds.splice(0))world.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function fixture(){const world=await createWorld({navigation:false,assetDefinitions:{}});worlds.push(world);world.addEntity({id:'asset',role:'decoration',object:new Group()});return world;}
async function nativeFixture(){
 const map:EnvironmentDefinition={id:'callback-map',name:'Map',description:'',bounds:{min:[-80,-5,-80],max:[80,40,80]},boxes:[{id:'floor',position:[0,-.5,0],size:[160,1,160]}],water:[],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[160,160],color:'#fff',modes:['wheeled']}],spawns:[{id:'car-spawn',name:'Car',vehicleId:'car',position:[0,.1,0],yaw:0,regionId:'road'}],playerSpawn:[-4,.03,0]};
  const world=await createWorld({navigation:false,assetDefinitions:{},camera:new PerspectiveCamera(),humanoid:{map,character:{instanceId:'rider',object:new Group()},vehicles:[{instanceId:'car',assetId:'car',spec:createRoadVehicleSpec('car'),object:new Group()}]}});worlds.push(world);return world;
}
const hooks=(events:string[])=>({onInit:()=>{events.push('init');},onEnable:()=>{events.push('enable');},onDisable:()=>{events.push('disable');},onReset:()=>{events.push('reset');},onDispose:()=>{events.push('dispose');}});

describe('public entity lifecycle callback registration',()=>{
 it('initializes once, updates on the existing fixed clock and distinguishes world pause from entity disable',async()=>{
  const world=await fixture(),events:string[]=[],updates:number[]=[];const api:World=world;
  api.registerEntityLifecycle('asset',{...hooks(events),onUpdate:c=>{updates.push(c.simulationTick);expect(c.deltaSeconds).toBe(1/60);}});
  expect(events).toEqual(['init','enable']);world.step({},2);expect(updates).toHaveLength(2);
  await world.start();world.stop();world.render();await Promise.resolve();expect(updates).toHaveLength(2);expect(events).toEqual(['init','enable']);
  await world.execute({type:'entity.set-active',entityId:'asset',isActive:false});world.step({},3);expect(updates).toHaveLength(2);
  await world.execute({type:'entity.set-active',entityId:'asset',isActive:false});expect(events).toEqual(['init','enable','disable']);
  await world.execute({type:'entity.set-active',entityId:'asset',isActive:true});world.step();expect(updates).toHaveLength(3);expect(events).toEqual(['init','enable','disable','enable']);
 });
 it('initializes an inactive registration without enabling it and does not treat visibility as activation',async()=>{
  const world=await fixture(),events:string[]=[];
  await world.execute({type:'entity.set-active',entityId:'asset',isActive:false});world.registerEntityLifecycle('asset',hooks(events));expect(events).toEqual(['init']);
  await world.execute({type:'entity.set-active',entityId:'asset',isActive:true});await world.execute({type:'entity.set-visible',entityId:'asset',isVisible:false});expect(events).toEqual(['init','enable']);
 });
 it('uses effective parent activation without bypassing existing attachment restrictions',async()=>{
  const world=await fixture(),events:string[]=[];world.addEntity({id:'parent',role:'decoration',object:new Group()});
  await world.execute({type:'entity.set-active',entityId:'parent',isActive:false});world.registerEntityLifecycle('asset',hooks(events));
  const attach={type:'entity.attach' as const,childEntityId:'asset',parentEntityId:'parent',positionLocalMetersXYZ:[0,0,0] as const};
  expect(await world.execute(attach)).toMatchObject({status:'rejected',error:{code:'ENTITY_INACTIVE'}});expect(events).toEqual(['init','enable']);
  await world.execute({type:'entity.set-active',entityId:'parent',isActive:true});expect(await world.execute(attach)).toMatchObject({status:'applied'});
  await world.execute({type:'entity.set-active',entityId:'parent',isActive:false});expect(events).toEqual(['init','enable','disable']);
  await world.execute({type:'entity.set-active',entityId:'parent',isActive:true});expect(events.at(-1)).toBe('enable');
 });
 it('retains baseline callbacks across despawn/reset, without reinitializing or reviving an explicit unsubscribe',async()=>{
  const world=await fixture(),events:string[]=[];const off=world.registerEntityLifecycle('asset',hooks(events));world.step();
  await world.execute({type:'entity.despawn',entityId:'asset'});expect(events).toEqual(['init','enable','disable']);
  await world.reset();expect(events).toEqual(['init','enable','disable','reset','enable']);
  off();off();await world.reset();expect(events.slice(-2)).toEqual(['disable','dispose']);expect(events.filter(e=>e==='init')).toHaveLength(1);
 });
 it('destroys callbacks for post-baseline entities on reset and retains diagnostics from cleanup failures',async()=>{
  const world=await fixture();world.step();const events:string[]=[];world.addEntity({id:'temporary',object:new Group(),role:'decoration'});
  world.registerEntityLifecycle('temporary',{...hooks(events),onDispose:()=>{events.push('dispose');throw Error('TEMP_CLEANUP');}});
  await world.reset();expect(events).toEqual(['init','enable','disable','dispose']);expect(world.snapshot().errors.some(e=>e.message.includes('TEMP_CLEANUP'))).toBe(true);
  await world.reset();expect(events.filter(e=>e==='dispose')).toHaveLength(1);
 });
 it('releases a destroyed subtree once and never attaches its callbacks to a reused ID',async()=>{
  const world=await fixture(),events:string[]=[],update=vi.fn();const off=world.registerEntityLifecycle('asset',{...hooks(events),onUpdate:update});
  const child=new Group(),childDisposed=vi.fn();world.addEntity({id:'child',object:child,role:'decoration'});
  expect(await world.execute({type:'entity.attach',childEntityId:'child',parentEntityId:'asset',positionLocalMetersXYZ:[0,0,0]})).toMatchObject({status:'applied'});
  world.registerEntityLifecycle('child',{onDispose:childDisposed});world.step();
  await world.execute({type:'entity.destroy',entityId:'asset'});expect(events).toEqual(['init','enable','disable','dispose']);
  expect(childDisposed).toHaveBeenCalledOnce();world.addEntity({id:'asset',role:'decoration',object:new Group()});world.step();off();expect(update).toHaveBeenCalledOnce();expect(events.filter(e=>e==='dispose')).toHaveLength(1);
 });
 it('allows self-unsubscribe during an update without skipping other registrations',async()=>{
  const world=await fixture(),events:string[]=[],other=vi.fn();let off=()=>{};
  off=world.registerEntityLifecycle('asset',{...hooks(events),onUpdate:()=>off()});world.registerEntityLifecycle('asset',{onUpdate:other});world.step({},3);
  expect(events).toEqual(['init','enable','disable','dispose']);expect(other).toHaveBeenCalledTimes(3);
 });
 it('releases registrations on world disposal, continues sibling cleanup after errors and is idempotent',async()=>{
  const world=await fixture(),order:string[]=[];
  world.registerEntityLifecycle('asset',{onDisable:()=>{order.push('disable');throw Error('DISABLE_FAILED');},onDispose:()=>{order.push('dispose');throw Error('DISPOSE_FAILED');}});
  const off=world.registerEntityLifecycle('asset',{onDispose:()=>{order.push('sibling');}});world.dispose();world.dispose();off();expect(order).toEqual(['disable','dispose','sibling']);
  expect(()=>world.registerEntityLifecycle('asset',{})).toThrow();
 });
 it.each([Error('INIT_FAILED'),null,undefined])('cleans partial initialization and preserves an original thrown value %s',async cause=>{
  const world=await fixture(),dispose=vi.fn(),update=vi.fn();let failed=false,caught:unknown;
  try{world.registerEntityLifecycle('asset',{onInit:()=>{throw cause;},onDispose:dispose,onUpdate:update});}catch(error){failed=true;caught=error;}
  expect(failed).toBe(true);expect(caught).toBe(cause);expect(dispose).toHaveBeenCalledOnce();world.step();expect(update).not.toHaveBeenCalled();
 });
 it('detaches a faulty update, reports it and preserves other callbacks and the simulation',async()=>{
  const world=await fixture(),failed=vi.fn(()=>{throw Error('BEHAVIOR_FAILED');}),dispose=vi.fn(),other=vi.fn();
  world.registerEntityLifecycle('asset',{onUpdate:failed,onDispose:dispose});world.registerEntityLifecycle('asset',{onUpdate:other});world.step({},3);
  expect(failed).toHaveBeenCalledOnce();expect(dispose).toHaveBeenCalledOnce();expect(other).toHaveBeenCalledTimes(3);expect(world.simulationTick).toBe(3);
  expect(world.snapshot().errors.some(e=>e.message.includes('BEHAVIOR_FAILED'))).toBe(true);
 });
 it('rejects unknown entities, invalid hooks and async callbacks before initialization',async()=>{
  const world=await fixture(),init=vi.fn();expect(()=>world.registerEntityLifecycle('missing',{onInit:init})).toThrow();
  expect(()=>world.registerEntityLifecycle('asset',{onUpdate:3} as never)).toThrow();
  expect(()=>world.registerEntityLifecycle('asset',{onInit:init,onUpdate:async()=>{}})).toThrow(expect.objectContaining({code:'WORLD_ASYNC_CALLBACK_UNSUPPORTED'}));expect(init).not.toHaveBeenCalled();
 });
 it('keeps the existing managed-root write guard for new hooks',async()=>{
  const world=await fixture(),dispose=vi.fn(),object=new Group();world.addEntity({id:'guarded',object,role:'decoration'});
  world.registerEntityLifecycle('guarded',{onUpdate:()=>{object.position.x=1;},onDispose:dispose});
  world.step();expect(dispose).toHaveBeenCalledOnce();expect(world.snapshot().errors.some(e=>e.code==='MANAGED_CHANNEL_WRITE')).toBe(true);
 });
 it('orders existing world callbacks before entity updates and resets local behavior state',async()=>{
  const world=await fixture(),events:string[]=[];let elapsed=0;
  world.onUpdate(()=>{events.push('world');});world.onReset(()=>{events.push('world-reset');});
  world.registerEntityLifecycle('asset',{onUpdate:({deltaSeconds})=>{events.push('entity');elapsed+=deltaSeconds;},onReset:()=>{events.push('entity-reset');elapsed=0;}});
  world.step({},2);expect(events).toEqual(['world','entity','world','entity']);expect(elapsed).toBeCloseTo(2/60);
  world.render();world.snapshot();world.describe();expect(events).toHaveLength(4);
  await world.reset();expect(events.slice(-2)).toEqual(['world-reset','entity-reset']);expect(elapsed).toBe(0);
 });
 it('isolates enable and reset failures with exactly one disable and dispose',async()=>{
  const world=await fixture(),events:string[]=[];await world.execute({type:'entity.set-active',entityId:'asset',isActive:false});
  world.registerEntityLifecycle('asset',{...hooks(events),onEnable:()=>{events.push('enable');throw Error('ENABLE_FAILED');}});
  await world.execute({type:'entity.set-active',entityId:'asset',isActive:true});expect(events).toEqual(['init','enable','disable','dispose']);
  const disposed=vi.fn(),reset=vi.fn();world.registerEntityLifecycle('asset',{onReset:()=>{throw Error('RESET_FAILED');},onDispose:disposed});world.registerEntityLifecycle('asset',{onReset:reset});world.step();
  await world.reset();await world.reset();expect(disposed).toHaveBeenCalledOnce();expect(reset).toHaveBeenCalledTimes(2);
 });
 it('rejects lifecycle reentry without destroying or adding a second update loop',async()=>{
  const world=await fixture(),disposed=vi.fn();
  world.registerEntityLifecycle('asset',{onUpdate:()=>{world.dispose();},onDispose:disposed});world.step({},2);
  expect(world.simulationTick).toBe(2);expect(disposed).toHaveBeenCalledOnce();expect(world.snapshot().errors.some(e=>e.code==='WORLD_TRANSACTION_REENTRY')).toBe(true);
  expect(()=>world.registerEntityLifecycle('asset',{onInit:()=>{world.step();}})).toThrow();expect(world.simulationTick).toBe(2);
 });
 it('copies installed callbacks and rejects promises returned by an ordinary function',async()=>{
  const world=await fixture(),original=vi.fn(),replacement=vi.fn(),disposed=vi.fn();const callbacks={onUpdate:original};world.registerEntityLifecycle('asset',callbacks);callbacks.onUpdate=replacement;
  world.registerEntityLifecycle('asset',{onUpdate:()=>Promise.reject(Error('async rejection')),onDispose:disposed});world.step({},2);await Promise.resolve();
  expect(original).toHaveBeenCalledTimes(2);expect(replacement).not.toHaveBeenCalled();expect(disposed).toHaveBeenCalledOnce();expect(world.snapshot().errors.some(e=>e.code==='WORLD_ASYNC_CALLBACK_UNSUPPORTED')).toBe(true);
 });
 it.each(['despawn','destroy','reset','world-dispose'] as const)('cleans callback resources before a real temporary humanoid is released by %s',async removal=>{
  const definition=catalog.assets.find(asset=>asset.id==='humanoid.uefn-mannequin')!;
  const paths=new Map(definition.resources!.map(resource=>[resource.path,resource.sourcePath]));
  vi.stubGlobal('ProgressEvent',class extends Event{constructor(type:string,init:object){super(type);Object.assign(this,init);}});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const uri=typeof input==='string'?input:input instanceof URL?input.href:input.url;const path=paths.get(decodeURIComponent(new URL(uri).pathname.slice(1)));if(!path)throw Error(uri);return new Response(await readFile(path));});
  const world=await nativeFixture();world.step();const character=new Character();
  try{
   await character.load(path=>`https://callback-resources.test/${path}`);character.root.position.set(15,.04,0);world.addCharacter({id:'guest',humanoid:character});
   const order:string[]=[],release=vi.spyOn(character,'dispose');world.registerEntityLifecycle('guest',{onDisable:()=>{order.push('disable');},onDispose:()=>{order.push(release.mock.calls.length===0?'callback':'callback-too-late');}});
   if(removal==='reset')await world.reset();else if(removal==='world-dispose')world.dispose();else expect(await world.execute({type:removal==='despawn'?'entity.despawn':'entity.destroy',entityId:'guest'})).toMatchObject({status:'applied'});
   expect(order).toEqual(['disable','callback']);expect(release).toHaveBeenCalledOnce();
  }finally{character.dispose();}
 });
 it('uses the same mounted group activation for rider and vehicle callbacks',async()=>{
  const world=await nativeFixture();
  expect(world.humanoid!.approach('car')).toBe(true);expect(world.humanoid!.enter('car')).toBe(true);world.step({},40);
  const rider:string[]=[],car:string[]=[];world.registerEntityLifecycle('rider',hooks(rider));world.registerEntityLifecycle('car',hooks(car));
  await world.execute({type:'entity.set-active',entityId:'car',isActive:false});expect(rider.at(-1)).toBe('disable');expect(car.at(-1)).toBe('disable');
  await world.execute({type:'entity.set-active',entityId:'rider',isActive:true});expect(rider.at(-1)).toBe('enable');expect(car.at(-1)).toBe('enable');expect(world.snapshot().humanoid?.mountedInstanceId).toBe('car');
 });
});
