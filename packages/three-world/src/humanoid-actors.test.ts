import {readFile} from 'node:fs/promises';
import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {Raw} from '@recast-navigation/core';
import type RAPIER from '@dimforge/rapier3d-compat';
import contentCatalog from '../../../asset-library/dist/whitebox/asset-catalog.json';
import {composeAssetCatalog} from '@worldkit/preset-content/assets/host-adapter';
const catalog={...contentCatalog,assets:composeAssetCatalog(contentCatalog.assets)};
import {createHumanoidWorld} from './humanoid';
import type {ThreeWorld} from './world';
import {emptyInput} from './humanoid-runtime/simulation';
import {createRoadVehicleSpec} from './humanoid-runtime/road-vehicle';
import {Character} from './humanoid-runtime/character';
import type {AssetDefinition} from './engine-contracts';
import type {EnvironmentDefinition} from './humanoid-runtime/environment/types';
import type {CameraFollowOptions} from './contracts';
import {SPECS} from '@worldkit/preset-content/config';

const worlds:ThreeWorld[]=[];

afterEach(()=>{for(const world of worlds.splice(0))world.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
const map:EnvironmentDefinition={id:'three-actors',name:'Three actors',description:'',bounds:{min:[-20,-5,-20],max:[20,10,20]},boxes:[{id:'floor',position:[0,-.5,0],size:[40,1,40]}],water:[],regions:[],spawns:[],playerSpawn:[-4,.04,0]};
async function setup(renderer?:THREE.WebGLRenderer,options:Partial<Parameters<typeof createHumanoidWorld>[0]>={}){
  const paths=new Map(catalog.assets.find(a=>a.id==='humanoid.uefn-mannequin')!.resources!.map(r=>[r.path,r.sourcePath]));
  vi.stubGlobal('ProgressEvent',class extends Event{constructor(type:string,init:object){super(type);Object.assign(this,init);}});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const uri=typeof input==='string'?input:input instanceof URL?input.href:input.url;const path=paths.get(decodeURIComponent(new URL(uri,'https://actors.test/').pathname.slice(1)))??catalog.assets.find(asset=>uri.includes(asset.sha256))?.sourcePath;if(!path)throw new Error(uri);return new Response(await readFile(path));});
  const world=await createHumanoidWorld({map,...options,...(renderer?{renderer}:{}),resourceUrl:path=>`https://actors.test/${path}`});worlds.push(world);return world;
}

function rendererFixture(){
  const win=new EventTarget(),doc=Object.assign(new EventTarget(),{defaultView:win,activeElement:null,body:{},documentElement:{},hidden:false});
  Object.assign(win,{document:doc,performance:globalThis.performance});vi.stubGlobal('window',win);vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const canvas=Object.assign(new EventTarget(),{width:800,height:600,ownerDocument:doc,getAttribute:()=>null,removeAttribute:()=>{},setAttribute:()=>{},style:{getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty:()=>{},removeProperty:()=>{}},toDataURL:()=> 'data:image/png;base64,dGVzdA=='});
  let ratio=1;const size=new THREE.Vector2(800,600);
  const renderer={shadowMap:{enabled:false,type:THREE.PCFShadowMap,needsUpdate:false},domElement:canvas,render:vi.fn(),getSize:(out:THREE.Vector2)=>out.copy(size),getPixelRatio:()=>ratio,setPixelRatio:(value:number)=>{ratio=value;},setSize:(x:number,y:number)=>{size.set(x,y);canvas.width=x*ratio;canvas.height=y*ratio;}} as unknown as THREE.WebGLRenderer;
  return {win,renderer};
}

it('keeps aircraft commands and cancellation scoped to their driver alongside another actor input',async()=>{
  const spec=SPECS.find(v=>v.id==='plane')!;
  const world=await setup(undefined,{map:{...map,playerSpawn:[-12,.04,0],regions:[{id:'flight',name:'Flight',description:'',center:[0,0,0],size:[40,40],color:'#aaa',modes:['plane','character']}],spawns:[{id:'plane-slot',name:'Plane',vehicleId:spec.id,position:[0,0,0],yaw:0,regionId:'flight'}]},vehicles:[{instanceId:spec.id,assetId:'vehicle.plane',spec,object:new THREE.Group()}]});
  const runtime=world.humanoid!,npc=await runtime.createCharacter();npc.root.position.set(8,.04,0);world.addCharacter({id:'npc',humanoid:npc});
  runtime.simulation.controlledActor.vehicleIndex=0;runtime.simulation.controlledActor.transition=0;
  await world.execute({type:'humanoid.set-input',actorId:'npc',input:{...emptyInput(),forward:.4}});
  const cancel=runtime.setAircraftActions([{action:'increaseThrottle'}],2);
  world.step({},1);
  expect(runtime.inspectControls().lastApplied?.source).toBe('aircraft-actions');
  expect(runtime.inspectControls('npc').override?.input.forward).toBe(.4);
  expect(runtime.inspectControls('npc').lastApplied?.input.forward).toBe(.4);
  expect(()=>runtime.setInput({...emptyInput(),forward:Number.NaN})).toThrow();
  expect(runtime.inspectAircraftActionExecution().active).toBe(true);
  cancel();world.step({},1);
  expect(runtime.inspectAircraftActionExecution().active).toBe(false);
  expect(runtime.inspectControls('npc').lastApplied?.input.forward).toBe(.4);
  runtime.setAircraftActions([{action:'increaseThrottle'}],2);await world.execute({type:'entity.despawn',entityId:'npc'});world.step({},1);
  expect(runtime.inspectAircraftActionExecution().active).toBe(true);
});

it('binds three full rigs, routes explicit actor input and preserves independent mixer ownership',async()=>{
  const world=await setup(),runtime=world.humanoid!;
  const a=await runtime.createCharacter(),b=await runtime.createCharacter();
  a.root.position.set(0,.04,0);b.root.position.set(4,.04,0);
  world.addCharacter({id:'a',humanoid:a});world.addCharacter({id:'b',humanoid:b});
  const ma=vi.spyOn(a.sourceCharacter!.mixer,'update'),mb=vi.spyOn(b.sourceCharacter!.mixer,'update');
  const first=runtime.environment.physicsStepSequence;
  expect((await world.execute({type:'humanoid.set-input',actorId:'a',input:{...emptyInput(),forward:1}})).status).toBe('applied');
  expect((await world.execute({type:'humanoid.set-input',actorId:'b',input:{...emptyInput(),forward:-1}})).status).toBe('applied');
  world.step({},60);
  expect(world.getEntityState('a').positionWorldMetersXYZ[2]).toBeGreaterThan(1);expect(world.getEntityState('b').positionWorldMetersXYZ[2]).toBeLessThan(-1);
  expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeCloseTo(0);
  expect(runtime.environment.physicsStepSequence-first).toBe(60);expect(ma).toHaveBeenCalledTimes(60);expect(mb).toHaveBeenCalledTimes(60);
  expect(a.sourceCharacter!.bones.root).not.toBe(b.sourceCharacter!.bones.root);
  await world.reset();expect(world.getEntityState('a').positionWorldMetersXYZ[2]).toBeCloseTo(0);world.step({},10);expect(world.getEntityState('a').positionWorldMetersXYZ[2]).toBeCloseTo(0);
});

it('switches input independently of camera targeting and pins an action to its accepting actor',async()=>{
  const world=await setup(),runtime=world.humanoid!,a=await runtime.createCharacter();a.root.position.set(0,.04,0);world.addCharacter({id:'a',humanoid:a});
  world.step({},30);
  const action=await world.execute({type:'humanoid.perform-action',actorId:'a',request:{requestId:'roll-a',action:'roll'}});
  expect(action.status).toBe('accepted');
  world.setControlledEntity('a');world.step({moveZRatio:-1},180);
  expect(world.getEntityState('a').positionWorldMetersXYZ[2]).toBeGreaterThan(.5);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeCloseTo(0);
  if(action.status==='accepted')expect(world.operations.get(action.operationId).status).toBe('succeeded');
  expect(runtime.cameraTargetId).toBe('player');
  world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'a'},activation:'on-input',transition:{durationSeconds:0},views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'look-at'},position:{distanceMeters:4,armHalfLifeSeconds:0},zoom:{range:{kind:'unbounded'},halfLifeSeconds:0}}}}}});expect(runtime.cameraTargetId).toBe('a');
  world.setControlledEntity('player');expect(runtime.cameraTargetId).toBe('a');
});

it('navigates a complete NPC using map collision even without rendered terrain',async()=>{
  const world=await setup(),a=await world.humanoid!.createCharacter();a.root.position.set(0,.04,0);world.addCharacter({id:'a',humanoid:a});
  world.step({},30);
  const receipt=await world.execute({type:'actor.move-to',entityId:'a',targetPositionWorldMetersXYZ:[0,0,5]});
  world.step({},1);
  expect(receipt.status,JSON.stringify(receipt)).toBe('accepted');
  world.step({},240);
  expect(world.getEntityState('a').positionWorldMetersXYZ[2]).toBeCloseTo(5,0);
  if(receipt.status==='accepted')expect(world.operations.get(receipt.operationId).status).toBe('succeeded');
});

it('arbitrates navigation and humanoid actions before either can take the same actor resources',async()=>{
 const world=await setup(),character=await world.humanoid!.createCharacter();character.root.position.set(0,.04,0);world.addCharacter({id:'npc',humanoid:character});world.step({},30);
 const move=await world.execute({type:'actor.move-to',entityId:'npc',targetPositionWorldMetersXYZ:[0,0,10]});expect(move.status).toBe('accepted');world.step({},1);
 const rejected=await world.execute({type:'humanoid.perform-action',actorId:'npc',request:{requestId:'nav-conflict',action:'roll'}});
 expect(rejected).toMatchObject({status:'rejected',error:{code:'ACTOR_RESOURCE_BUSY'}});
 expect(await world.execute({type:'humanoid.set-input',actorId:'npc',input:emptyInput()})).toMatchObject({status:'rejected',error:{code:'ACTOR_RESOURCE_BUSY'}});
 if(move.status==='accepted')expect(world.operations.get(move.operationId).status).toBe('running');
 await world.execute({type:'actor.stop',entityId:'npc'});
 const roll=await world.execute({type:'humanoid.perform-action',actorId:'npc',request:{requestId:'roll-owner',action:'roll'}});expect(roll.status).toBe('accepted');
 expect(await world.execute({type:'actor.move-to',entityId:'npc',targetPositionWorldMetersXYZ:[0,0,10]})).toMatchObject({status:'rejected',error:{code:'ACTOR_RESOURCE_BUSY'}});
 expect(world.getEntityState('npc').controlOwners).toContainEqual({channel:'locomotion',ownerKind:'action',ownerId:'roll-owner'});
 world.step({},90);if(roll.status==='accepted')expect(world.operations.get(roll.operationId).status).toBe('succeeded');
 expect((await world.execute({type:'actor.move-to',entityId:'npc',targetPositionWorldMetersXYZ:[0,0,10]})).status).toBe('accepted');
 await world.reset();expect(world.getEntityState('npc').controlOwners.some(owner=>owner.ownerKind==='action')).toBe(false);
 expect((await world.execute({type:'humanoid.set-input',actorId:'npc',input:emptyInput()})).status).toBe('applied');
 expect(await world.execute({type:'actor.move-to',entityId:'npc',targetPositionWorldMetersXYZ:[0,0,10]})).toMatchObject({status:'rejected',error:{code:'ACTOR_INPUT_OVERRIDE_ACTIVE'}});
 await world.execute({type:'humanoid.set-input',actorId:'npc',input:null});
 expect((await world.execute({type:'actor.move-to',entityId:'npc',targetPositionWorldMetersXYZ:[0,0,10]})).status).toBe('accepted');
});

it('keeps the surface posture owner after its input pulse ends until exit or reset',async()=>{
 const world=await setup(),character=await world.humanoid!.createCharacter();character.root.position.set(0,.04,0);world.addCharacter({id:'npc',humanoid:character});world.step({},30);
 await world.execute({type:'humanoid.set-input',actorId:'npc',input:{...emptyInput(),actions:{prone:true}}});world.step({},1);
 await world.execute({type:'humanoid.set-input',actorId:'npc',input:null});
 expect(world.humanoid!.snapshot('npc').surface.mode).toBe('prone');
 expect(await world.execute({type:'actor.move-to',entityId:'npc',targetPositionWorldMetersXYZ:[0,0,5]})).toMatchObject({status:'rejected',error:{code:'ACTOR_RESOURCE_BUSY'}});
 world.step({},150);expect(world.getEntityState('npc').positionWorldMetersXYZ[1]).toBeGreaterThanOrEqual(0);expect(world.getEntityState('npc').controlOwners).toContainEqual({channel:'pose',ownerKind:'action',ownerId:'prone'});
 await world.execute({type:'humanoid.set-input',actorId:'npc',input:{...emptyInput(),actions:{prone:true}}});world.step({},1);await world.execute({type:'humanoid.set-input',actorId:'npc',input:null});world.step({},150);
 expect(world.humanoid!.snapshot('npc').surface.mode,JSON.stringify({surface:world.humanoid!.snapshot('npc').surface,position:world.getEntityState('npc').positionWorldMetersXYZ,prone:world.humanoid!.snapshot('npc').characterCapabilities.find(value=>value.id==='prone')})).toBe('none');expect(world.getEntityState('npc').controlOwners.some(owner=>owner.ownerKind==='action')).toBe(false);
 expect((await world.execute({type:'actor.move-to',entityId:'npc',targetPositionWorldMetersXYZ:[0,0,5]})).status).toBe('accepted');
 await world.reset();expect(world.getEntityState('npc').controlOwners.some(owner=>owner.ownerKind==='action')).toBe(false);
});

it('releases post-baseline actor instances through 50 spawn/despawn cycles while preserving the player source',async()=>{
  const world=await setup(),runtime=world.humanoid!;world.step({},1);const count=runtime.environment.colliderCount,allocate=vi.spyOn(Raw.Detour,'allocCrowd'),free=vi.spyOn(Raw.Detour,'freeCrowd');
  for(let n=0;n<50;n++){
    const actor=await runtime.createCharacter();actor.root.position.set(3,.04,0);
    const dispose=vi.spyOn(actor,'dispose'),uncache=vi.spyOn(actor.sourceCharacter!.mixer,'uncacheRoot');
    world.addCharacter({id:'temporary',humanoid:actor});expect((await world.execute({type:'actor.move-to',entityId:'temporary',targetPositionWorldMetersXYZ:[3,0,1]})).status).toBe('accepted');world.step({},1);
    const receipt=await world.execute({type:'entity.despawn',entityId:'temporary'});
    expect(receipt.status,JSON.stringify(receipt)).toBe('applied');expect(dispose).toHaveBeenCalledOnce();expect(uncache).toHaveBeenCalledOnce();expect(runtime.environment.colliderCount).toBe(count);
    dispose.mockRestore();uncache.mockRestore();
  }
  expect(runtime.options.character.animation!.loaded).toBe(true);world.step({},1);world.dispose();expect(allocate).toHaveBeenCalledTimes(50);expect(free).toHaveBeenCalledTimes(50);
},30000);

it('rejects binding a live character into another world without damaging its owner',async()=>{
  const first=await setup(),second=await setup(),actor=await first.humanoid!.createCharacter();actor.root.position.set(3,.04,0);first.addCharacter({id:'a',humanoid:actor});
  const parent=actor.root.parent,pose=actor.root.position.clone();
  expect(()=>second.addCharacter({id:'b',humanoid:actor})).toThrow('HUMANOID_CHARACTER_ALREADY_OWNED');
  await expect(createHumanoidWorld({map,character:actor})).rejects.toThrow('HUMANOID_CHARACTER_ALREADY_OWNED');
  expect(actor.loaded).toBe(true);expect(actor.root.parent).toBe(parent);expect(actor.root.position.equals(pose)).toBe(true);first.step({},1);
  second.dispose();first.step({},1);expect(actor.loaded).toBe(true);
});

it.each(['parent-position','parent-rotation','manual-matrix','tilted-root'])('rejects an unsupported actor root before binding: %s',async transform=>{
  const world=await setup(),actor=await world.humanoid!.createCharacter();actor.root.position.set(3,.04,0);
  if(transform.startsWith('parent')){const parent=new THREE.Scene();parent.add(actor.root);if(transform==='parent-position')parent.position.x=2;else parent.rotation.y=.5;}
  if(transform==='manual-matrix'){actor.root.updateMatrix();actor.root.matrixAutoUpdate=false;}
  if(transform==='tilted-root')actor.root.rotation.x=.2;
  const before=world.humanoid!.environment.colliderCount;
  try{expect(()=>world.addCharacter({id:'a',humanoid:actor})).toThrow('HUMANOID_CHARACTER_TRANSFORM_INVALID');expect(world.humanoid!.environment.colliderCount).toBe(before);}finally{actor.dispose();}
});

it('can relocate a rebound NPC before the first world step',async()=>{
  const world=await setup(),actor=await world.humanoid!.createCharacter();actor.root.position.set(3,.04,0);world.addCharacter({id:'a',humanoid:actor});world.setControlledEntity('a');world.step({},0);
  await world.reset();world.humanoid!.prepareEpisodeStart({positionWorldMetersXYZ:[3,.03,5],facingYawRadians:0});world.step({},1);
  expect(world.getEntityState('a').positionWorldMetersXYZ[2]).toBeCloseTo(5);
});

it('consumes per-actor ground speed and rejects unsupported movement before binding',async()=>{
  const world=await setup(),a=await world.humanoid!.createCharacter();a.root.position.set(3,.04,0);
  expect(()=>world.addCharacter({id:'a',humanoid:a,movement:{kind:'custom',movementId:'unused'}} as unknown as Parameters<ThreeWorld['addCharacter']>[0])).toThrow('Full humanoids accept ground');
  world.addCharacter({id:'a',humanoid:a,movement:{kind:'ground',walkSpeedMetersPerSecond:1,runSpeedMetersPerSecond:2}});
  await world.execute({type:'humanoid.set-input',actorId:'a',input:{...emptyInput(),forward:1}});world.step({},120);
  const z=world.getEntityState('a').positionWorldMetersXYZ[2];expect(z).toBeGreaterThan(1.8);expect(z).toBeLessThan(2.1);
});

it('keeps an NPC at the wheel after input returns to another actor and rejects a second driver',async()=>{
  const spec=createRoadVehicleSpec('car'),world=await setup(undefined,{map:{...map,spawns:[{id:'car-spawn',name:'Car',vehicleId:'car',position:[0,.1,0],yaw:0,regionId:'road'}],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[40,40],color:'#fff',modes:['wheeled']}]},vehicles:[{instanceId:'car',assetId:'custom.car',spec,object:new THREE.Group()}]});
  const npc=await world.humanoid!.createCharacter();npc.root.position.set(7,.04,0);world.addCharacter({id:'driver',humanoid:npc});
  const approach=await world.execute({type:'vehicle.approach',instanceId:'car',actorId:'driver'});expect(approach.status,JSON.stringify(approach)).toBe('applied');expect(approach).toMatchObject({result:{entityId:'driver'}});
  expect((await world.execute({type:'vehicle.enter',instanceId:'car',actorId:'driver'})).status).toBe('applied');world.step({},35);
  const before=world.getEntityState('car').positionWorldMetersXYZ,player=world.getEntityState('player').positionWorldMetersXYZ;
  world.setControlledEntity('player');
  expect((await world.execute({type:'vehicle.enter',instanceId:'car'})).status).toBe('rejected');
  expect((await world.execute({type:'vehicle.prepare',instanceId:'car',spawn:{id:'move-car',name:'Move occupied car',position:[10,.1,0],yaw:0,regionId:'road'}})).status).toBe('rejected');
  expect(world.getEntityState('car').positionWorldMetersXYZ).toEqual(before);
  await world.execute({type:'humanoid.set-input',actorId:'driver',input:{...emptyInput(),forward:1}});world.step({},60);
  expect(world.humanoid!.simulation.actor('driver').vehicle?.spec.id).toBe('car');expect(world.humanoid!.simulation.actor('player').vehicle).toBeUndefined();
  expect(world.getEntityState('car').positionWorldMetersXYZ[2]-before[2]).toBeGreaterThan(.5);
  expect(Math.hypot(...world.getEntityState('player').positionWorldMetersXYZ.map((v,i)=>v-player[i]!))).toBeLessThan(.05);
  await world.reset();expect(world.humanoid!.simulation.actor('driver').vehicle).toBeUndefined();expect(world.humanoid!.simulation.actor('player').vehicle).toBeUndefined();
});

it('despawns and restores the initial actor through the same lifecycle as later actors',async()=>{
  const world=await setup(),other=await world.humanoid!.createCharacter();other.root.position.set(3,.04,0);world.addCharacter({id:'other',humanoid:other});world.setControlledEntity('other');world.step({},0);
  const initial=world.humanoid!.simulation.actor('player').controller.body;
  expect((await world.execute({type:'entity.despawn',entityId:'player'})).status).toBe('applied');expect(initial.isValid()).toBe(false);expect(world.humanoid!.hasActor('player')).toBe(false);
  world.step({},1);await world.reset();expect(world.humanoid!.hasActor('player')).toBe(true);expect(world.humanoid!.simulation.actors.size).toBe(2);expect(world.snapshot().entities.map(entity=>entity.id).sort()).toEqual(['other','player']);world.step({},1);
});

it('creates from the default content after the initial instance is removed before baseline sealing',async()=>{
  const world=await setup(),initial=world.humanoid!.options.character.animation!,other=await world.humanoid!.createCharacter();other.root.position.set(3,.04,0);world.addCharacter({id:'other',humanoid:other});world.setControlledEntity('other');
  expect((await world.execute({type:'entity.despawn',entityId:'player'})).status).toBe('applied');expect(initial.loaded).toBe(false);
  const created=await world.humanoid!.createCharacter();expect(created.loaded).toBe(true);created.dispose();world.step({},1);
});

it('releases an asynchronously created instance when reset invalidates its request',async()=>{
  const create=Character.prototype.createFactory;
  let resolve!:()=>void;const gate=new Promise<void>(done=>{resolve=done;});let dispose:ReturnType<typeof vi.spyOn>|undefined;
  vi.spyOn(Character.prototype,'createFactory').mockImplementation(function(this:Character){const factory=create.call(this);return factory?async()=>{await gate;const instance=await factory();dispose=vi.spyOn(instance,'dispose');return instance;}:undefined;});
  const world=await setup(),pending=world.humanoid!.createCharacter();await world.reset();resolve();
  await expect(pending).rejects.toThrow('HUMANOID_ACTOR_LOAD_STALE');expect(dispose).toHaveBeenCalledOnce();
});

it('spawns complete humanoids from a prepared prototype after its original source instance is released',async()=>{
  const world=await setup(),seed=await world.humanoid!.createCharacter();
  await world.registerPrototype({id:'guide',description:'Full humanoid',template:{kind:'character',options:{humanoid:seed}}});seed.dispose();
  world.step({},0);
  const receipt=await world.execute({type:'entity.spawn',prototypeId:'guide',entityId:'generated',positionWorldMetersXYZ:[3,.04,0]});
  expect(receipt.status,JSON.stringify(receipt)).toBe('applied');
  await world.execute({type:'humanoid.set-input',actorId:'generated',input:{...emptyInput(),forward:1}});world.step({},60);
  expect(world.getEntityState('generated').positionWorldMetersXYZ[2]).toBeGreaterThan(1);expect(world.getEntityState('generated').animation?.actionId).toBeTruthy();
  expect((await world.execute({type:'entity.despawn',entityId:'generated'})).status).toBe('applied');
  const again=await world.execute({type:'entity.spawn',prototypeId:'guide',entityId:'generated',positionWorldMetersXYZ:[3,.04,0]});expect(again.status).toBe('applied');
});

it('releases a prepared full character when its Episode command lease expires after cloning',async()=>{
 const {win,renderer}=rendererFixture(),world=await setup(renderer),seed=await world.humanoid!.createCharacter();
 await world.registerPrototype({id:'guide',description:'Full humanoid',template:{kind:'character',options:{humanoid:seed}}});seed.dispose();await world.start();
 const port=(win as unknown as {__WORLDKIT_EVAL__:import('./contracts').WorldObservation}).__WORLDKIT_EVAL__.episode!;
 await port.prepareSegment({positionWorldMetersXYZ:[-4,.04,0],facingYawRadians:0},{widthPixels:640,heightPixels:360});
 type Lease={state:'preparing'|'prepared';restoreViewport:()=>void};
 const internals=world as unknown as {episodeLease:Lease;prototypes:Map<string,{template:{create:()=>Promise<Character>}}>;
  executePlan(commands:import('./contracts').WorldCommand[],options:object,lease:Lease):Promise<import('./contracts').CommandReceipt>};
 const template=internals.prototypes.get('guide')!.template,create=template.create;let released:ReturnType<typeof vi.spyOn>|undefined;
 template.create=async()=>{const clone=await create();released=vi.spyOn(clone,'dispose');port.release();return clone;};
 const result=await internals.executePlan([{type:'entity.spawn',prototypeId:'guide',entityId:'late',positionWorldMetersXYZ:[3,.04,0]}],{},internals.episodeLease);
 expect(result).toMatchObject({status:'rejected',error:{code:'EPISODE_CAPTURE_OWNS_CLOCK'}});
 expect(released).toHaveBeenCalledOnce();expect(world.snapshot().entities.some(entity=>entity.id==='late')).toBe(false);
});

it('rejects colliding prototype actors without publishing either instance',async()=>{
  const world=await setup(),seed=await world.humanoid!.createCharacter();
  await world.registerPrototype({id:'guide',description:'Full humanoid',template:{kind:'character',options:{humanoid:seed}}});seed.dispose();
  world.registerAction({id:'pair',description:'Two actors',inputSchema:{type:'object',properties:{},required:[],additionalProperties:false},writes:[{kind:'prototype',prototypeId:'guide'}],plan:()=>[
    {type:'entity.spawn',prototypeId:'guide',entityId:'one',positionWorldMetersXYZ:[3,.04,0]},
    {type:'entity.spawn',prototypeId:'guide',entityId:'two',positionWorldMetersXYZ:[3,.04,0]},
  ]});
  const before=world.humanoid!.environment.colliderCount;
  const result=await world.execute({type:'action.invoke',actionId:'pair',arguments:{}});
  expect(result.status,JSON.stringify(result)).toBe('rejected');expect(world.snapshot().entities.map(entity=>entity.id)).toEqual(['player']);expect(world.humanoid!.environment.colliderCount).toBe(before);
});

it.each([false,true])('validates the final wall pose before publishing a full actor (clear=%s)',async clear=>{
  const world=await setup(),seed=await world.humanoid!.createCharacter();
  await world.registerPrototype({id:'guide',description:'Full humanoid',template:{kind:'character',options:{humanoid:seed}}});seed.dispose();
  const wall=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial());wall.position.set(clear?3:8,1,0);
  world.addEntity({id:'wall',object:wall,role:'obstacle',physics:{kind:'kinematic',shape:'box'}});
  world.registerAction({id:'scene-change',description:'Prepare wall and actor',inputSchema:{type:'object',properties:{},required:[],additionalProperties:false},writes:[{kind:'prototype',prototypeId:'guide'},{kind:'entity',entityId:'wall',channels:['position']}],plan:()=>clear?[
    {type:'entity.spawn',prototypeId:'guide',entityId:'new-actor',positionWorldMetersXYZ:[3,.04,0]},
    {type:'entity.set-position',entityId:'wall',positionWorldMetersXYZ:[8,1,0]},
  ]:[
    {type:'entity.set-position',entityId:'wall',positionWorldMetersXYZ:[3,1,0]},
    {type:'entity.spawn',prototypeId:'guide',entityId:'new-actor',positionWorldMetersXYZ:[3,.04,0]},
  ]});
  const result=await world.execute({type:'action.invoke',actionId:'scene-change',arguments:{}});
  expect(result.status,JSON.stringify(result)).toBe(clear?'applied':'rejected');expect(world.getEntityState('wall').positionWorldMetersXYZ[0]).toBe(8);
  expect(world.snapshot().entities.some(entity=>entity.id==='new-actor')).toBe(clear);
  wall.geometry.dispose();wall.material.dispose();
});

it('rejects an unsupported transform of a newly spawned humanoid before publication',async()=>{
  const world=await setup(),seed=await world.humanoid!.createCharacter();
  await world.registerPrototype({id:'guide',description:'Full humanoid',template:{kind:'character',options:{humanoid:seed}}});seed.dispose();
  world.registerAction({id:'scaled',description:'Invalid character scale',inputSchema:{type:'object',properties:{},required:[],additionalProperties:false},writes:[{kind:'prototype',prototypeId:'guide'}],plan:()=>[
    {type:'entity.spawn',prototypeId:'guide',entityId:'one',positionWorldMetersXYZ:[3,.04,0]},
    {type:'entity.set-scale',entityId:'one',scaleLocalXYZ:[2,2,2]},
  ]});
  expect((await world.execute({type:'action.invoke',actionId:'scaled',arguments:{}})).status).toBe('rejected');expect(world.snapshot().entities.map(entity=>entity.id)).toEqual(['player']);
});

it('does not spawn into a wall that only starts moving away when the plan commits',async()=>{
  const world=await setup(),seed=await world.humanoid!.createCharacter();
  await world.registerPrototype({id:'guide',description:'Full humanoid',template:{kind:'character',options:{humanoid:seed}}});seed.dispose();
  const wall=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial());wall.position.set(3,1,0);
  world.addEntity({id:'wall',object:wall,role:'obstacle',physics:{kind:'kinematic',shape:'box'}});
  world.registerAction({id:'clear-and-spawn',description:'Timed wall move',inputSchema:{type:'object',properties:{},required:[],additionalProperties:false},writes:[{kind:'prototype',prototypeId:'guide'},{kind:'entity',entityId:'wall',channels:['position']}],plan:()=>[
    {type:'entity.set-position',entityId:'wall',positionWorldMetersXYZ:[8,1,0],durationSeconds:1},
    {type:'entity.spawn',prototypeId:'guide',entityId:'one',positionWorldMetersXYZ:[3,.04,0]},
  ]});
  const result=await world.execute({type:'action.invoke',actionId:'clear-and-spawn',arguments:{}});
  expect(result.status,JSON.stringify(result)).toBe('rejected');expect(world.getEntityState('wall').positionWorldMetersXYZ[0]).toBe(3);
  expect(world.snapshot().entities.some(entity=>entity.id==='one')).toBe(false);
  wall.geometry.dispose();wall.material.dispose();
});

it('prepares Episode on the selected NPC and keeps the original player at its baseline',async()=>{
  const {win,renderer}=rendererFixture();
  const world=await setup(renderer,{vehicles:[{instanceId:'car',assetId:'custom.car',spec:createRoadVehicleSpec('car'),object:new THREE.Group()}]}),actor=await world.humanoid!.createCharacter();actor.root.position.set(3,.04,0);world.addCharacter({id:'a',humanoid:actor});world.setControlledEntity('a');world.camera.position.set(3,2,-5);world.camera.lookAt(3,1,0);world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'a'},activation:'on-input',transition:{durationSeconds:0},views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'look-at'},position:{distanceMeters:4,armHalfLifeSeconds:0},zoom:{range:{kind:'unbounded'},halfLifeSeconds:0}}}}}});world.step({},0);
  await world.start();world.stop();
  const episode=(win as unknown as {__WORLDKIT_EVAL__:import('./contracts').WorldObservation}).__WORLDKIT_EVAL__.episode!;
  expect(episode.capabilities()).toMatchObject({controlledEntityId:'a',worldBounds:{minimumWorldMetersXYZ:map.bounds.min,maximumWorldMetersXYZ:map.bounds.max}});
  await episode.prepareSegment({positionWorldMetersXYZ:[3,.03,5],facingYawRadians:0,cameraViewId:'third-person',humanoid:{}},{widthPixels:640,heightPixels:360});
  expect(world.getEntityState('a').positionWorldMetersXYZ[2]).toBeCloseTo(5);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeCloseTo(0);
  expect(world.humanoid!.cameraTargetId).toBe('a');episode.advance({moveZRatio:-1},30);expect(world.getEntityState('a').positionWorldMetersXYZ[2]).toBeLessThan(5);
  episode.release();await world.reset();expect(world.humanoid!.cameraTargetId).toBe('a');
});

it('keeps prepared humanoid prototypes without retaining a hidden model lease',async()=>{
  const world=await setup(),seed=new Character();await seed.load(path=>`https://prototype-source.test/${path}`);
  let geometry:THREE.BufferGeometry|undefined;seed.sourceCharacter!.root.traverse(node=>{if(!geometry&&(node as THREE.SkinnedMesh).isSkinnedMesh)geometry=(node as THREE.SkinnedMesh).geometry;});
  const disposed=vi.spyOn(geometry!,'dispose');
  try{for(let n=0;n<3;n++)await world.registerPrototype({id:`variant-${n}`,description:'Independent source factory',template:{kind:'character',options:{humanoid:seed}}});}finally{seed.dispose();}
  expect(disposed).toHaveBeenCalledOnce();
  const result=await world.execute({type:'entity.spawn',prototypeId:'variant-1',entityId:'guide',positionWorldMetersXYZ:[3,.04,0]});
  expect(result.status,JSON.stringify(result)).toBe('applied');expect(world.getEntityState('guide').animation?.actionId).toBeTruthy();
});

it('retires a removed actor action immediately without another simulation tick',async()=>{
  const world=await setup(),a=await world.humanoid!.createCharacter();a.root.position.set(0,.04,0);world.addCharacter({id:'temporary',humanoid:a});world.step({},30);
  const result=await world.execute({type:'humanoid.perform-action',actorId:'temporary',request:{requestId:'remove-running',action:'roll'}});if(result.status!=='accepted')throw new Error(JSON.stringify(result));
  const tick=world.simulationTick;expect((await world.execute({type:'entity.despawn',entityId:'temporary'})).status).toBe('applied');
  expect(world.simulationTick).toBe(tick);expect(world.operations.get(result.operationId)).toMatchObject({status:'cancelled',phase:'actor-removed'});
});

it.each([false,true])('ends only the mounting actor navigation and requires vehicle input (group=%s)',async group=>{
  const spec=createRoadVehicleSpec('car'),world=await setup(undefined,{map:{...map,spawns:[{id:'car-spawn',name:'Car',vehicleId:'car',position:[0,.1,0],yaw:0,regionId:'road'}],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[40,40],color:'#fff',modes:['wheeled']}]},vehicles:[{instanceId:'car',assetId:'custom.car',spec,object:new THREE.Group()}]});
  const npc=await world.humanoid!.createCharacter();npc.root.position.set(7,.04,0);world.addCharacter({id:'driver',humanoid:npc});
  expect((await world.execute({type:'vehicle.approach',instanceId:'car',actorId:'driver'})).status).toBe('applied');
  world.setAutonomy('driver',{kind:'patrol',waypointPositionsWorldMetersXYZ:[[10,0,8]]});
  if(group){const walker=await world.humanoid!.createCharacter();walker.root.position.set(-10,.04,0);world.addCharacter({id:'walker',humanoid:walker});world.registerAction({id:'both',description:'Two navigation requests',inputSchema:{type:'object',properties:{},required:[],additionalProperties:false},writes:[{kind:'entity',entityId:'driver',channels:['locomotion']},{kind:'entity',entityId:'walker',channels:['locomotion']}],plan:()=>[{type:'actor.move-to',entityId:'driver',targetPositionWorldMetersXYZ:[10,0,8]},{type:'actor.move-to',entityId:'walker',targetPositionWorldMetersXYZ:[-10,0,8]}]});}
  const goal=await world.execute(group?{type:'action.invoke',actionId:'both',arguments:{}}:{type:'actor.move-to',entityId:'driver',targetPositionWorldMetersXYZ:[10,0,8]});if(goal.status!=='accepted')throw new Error(JSON.stringify(goal));
  expect((await world.execute({type:'vehicle.enter',instanceId:'car',actorId:'driver'})).status).toBe('applied');
  expect(world.operations.get(goal.operationId).status).toBe(group?'running':'cancelled');
  expect(await world.execute({type:'actor.move-to',entityId:'driver',targetPositionWorldMetersXYZ:[10,0,8]})).toMatchObject({status:'rejected',error:{code:'MOUNTED_ACTOR_NAVIGATION_UNSUPPORTED'}});
  const before=world.getEntityState('car').positionWorldMetersXYZ;world.step({},360);const stationary=world.getEntityState('car').positionWorldMetersXYZ;
  expect(Math.hypot(stationary[0]-before[0],stationary[2]-before[2])).toBeLessThan(.1);
  if(group){expect(world.getEntityState('walker').positionWorldMetersXYZ[2]).toBeGreaterThan(7.5);expect(world.operations.get(goal.operationId)).toMatchObject({status:'cancelled',steps:[{status:'cancelled'},{status:'succeeded'}]});}
  await world.execute({type:'humanoid.set-input',actorId:'driver',input:{...emptyInput(),forward:1}});world.step({},120);
  expect(world.getEntityState('car').positionWorldMetersXYZ[2]-stationary[2]).toBeGreaterThan(1);
});

it('preserves a completed navigation step when that actor receives a new goal',async()=>{
  const world=await setup();for(const [id,x] of [['a',0],['b',6]] as const){const actor=await world.humanoid!.createCharacter();actor.root.position.set(x,.04,0);world.addCharacter({id,humanoid:actor});}
  world.registerAction({id:'staggered',description:'Independent distances',inputSchema:{type:'object',properties:{},required:[],additionalProperties:false},writes:[{kind:'entity',entityId:'a',channels:['locomotion']},{kind:'entity',entityId:'b',channels:['locomotion']}],plan:()=>[{type:'actor.move-to',entityId:'a',targetPositionWorldMetersXYZ:[0,0,1]},{type:'actor.move-to',entityId:'b',targetPositionWorldMetersXYZ:[6,0,8]}]});
  const group=await world.execute({type:'action.invoke',actionId:'staggered',arguments:{}});if(group.status!=='accepted')throw new Error(JSON.stringify(group));
  world.step({},90);expect(world.operations.get(group.operationId)).toMatchObject({status:'running',steps:[{status:'succeeded'},{status:'running'}]});
  expect((await world.execute({type:'actor.move-to',entityId:'a',targetPositionWorldMetersXYZ:[0,0,3]})).status).toBe('accepted');
  expect(world.operations.get(group.operationId).steps![0]!.status).toBe('succeeded');world.step({},360);
  expect(world.operations.get(group.operationId)).toMatchObject({status:'succeeded',steps:[{status:'succeeded'},{status:'succeeded'}]});
});

it('steers two full NPCs past each other and reproduces their route after reset',async()=>{
  const world=await setup();for(const [id,x] of [['left',-3],['right',3]] as const){const actor=await world.humanoid!.createCharacter();actor.root.position.set(x,.04,0);world.addCharacter({id,humanoid:actor});}
  await world.start();world.stop();const traces:number[][][]=[];
  for(let run=0;run<2;run++){
    if(run)await world.reset();
    const receipts=[];for(const [id,x] of [['left',3],['right',-3]] as const)receipts.push(await world.execute({type:'actor.move-to',entityId:id,targetPositionWorldMetersXYZ:[x,0,0]}));
    expect(receipts.map(result=>result.status)).toEqual(['accepted','accepted']);
    const sequence=world.humanoid!.environment.physicsStepSequence;const trace:number[][]=[];let minDistance=Infinity,maxLateral=0;
    for(let tick=0;tick<720;tick++){
      world.step({},1);const a=world.getEntityState('left').positionWorldMetersXYZ,b=world.getEntityState('right').positionWorldMetersXYZ;
      minDistance=Math.min(minDistance,Math.hypot(a[0]-b[0],a[2]-b[2]));maxLateral=Math.max(maxLateral,Math.abs(a[2]),Math.abs(b[2]));
      if(tick%30===0)trace.push([...a,...b].map(value=>Math.round(value*1000)/1000));
    }
    expect(world.humanoid!.environment.physicsStepSequence-sequence).toBe(720);
    for(const receipt of receipts)if(receipt.status==='accepted')expect(world.operations.get(receipt.operationId).status).toBe('succeeded');
    expect(minDistance).toBeGreaterThan(.62);expect(maxLateral).toBeGreaterThan(.3);expect(world.snapshot().errors).toEqual([]);traces.push(trace);
  }
  expect(traces[1]).toEqual(traces[0]);
});

it('shares ordinary Mesh NPC bodies and navigation with the full humanoid world',async()=>{
  const world=await setup(),object=new THREE.Group();object.position.set(0,.04,0);
  world.addCharacter({id:'plain',object,body:{heightMeters:1.2,radiusMeters:.4},movement:{kind:'ground',walkSpeedMetersPerSecond:2}});
  expect(world.humanoid!.characterSettings('plain')).toMatchObject({heightMeters:1.2,radiusMeters:.4,walkSpeedMetersPerSecond:2});
  await world.start();world.stop();const sequence=world.humanoid!.environment.physicsStepSequence,player=world.getEntityState('player').positionWorldMetersXYZ;
  const goal=await world.execute({type:'actor.move-to',entityId:'plain',targetPositionWorldMetersXYZ:[0,0,4]});if(goal.status!=='accepted')throw new Error(JSON.stringify(goal));
  world.step({},240);expect(world.operations.get(goal.operationId).status,JSON.stringify({operation:world.operations.get(goal.operationId),state:world.getEntityState('plain'),errors:world.snapshot().errors})).toBe('succeeded');expect(world.getEntityState('plain').positionWorldMetersXYZ[2]).toBeCloseTo(4,1);
  expect(world.humanoid!.environment.physicsStepSequence-sequence).toBe(240);expect(world.getEntityState('player').positionWorldMetersXYZ[0]).toBeCloseTo(player[0]);
  expect(()=>world.describe()).not.toThrow();await world.reset();expect(world.getEntityState('plain').positionWorldMetersXYZ[2]).toBeCloseTo(0);
  expect(world.humanoid!.characterSettings('plain')).toMatchObject({heightMeters:1.2,radiusMeters:.4});
  world.humanoid!.switchMap({...map,id:'second-map'});expect(world.humanoid!.characterSettings('plain')).toMatchObject({heightMeters:1.2,radiusMeters:.4});world.step({},10);expect(world.snapshot().errors).toEqual([]);
});
it('runs custom three-dimensional NPC intent once per shared world tick',async()=>{
  const world=await setup(),object=new THREE.Group();object.position.set(3,.04,0);let calls=0;
  world.registerMovement({id:'float',version:1,description:'Controlled spatial velocity',initialState:0,update:({state})=>{calls++;return {state:state+1,velocityWorldMetersPerSecondXYZ:[0,1,1],applyGravity:false};}});
  world.addCharacter({id:'floating',object,body:{heightMeters:.8,radiusMeters:.3},movement:{kind:'custom',movementId:'float'}});
  await world.start();world.stop();world.step({},60);expect(calls).toBe(60);expect(world.getEntityState('floating').positionWorldMetersXYZ[1]).toBeGreaterThan(.9);expect(world.getEntityState('floating').positionWorldMetersXYZ[2]).toBeGreaterThan(.9);
  await world.reset();expect(world.getEntityState('floating').positionWorldMetersXYZ).toEqual([3,.04,0]);world.step({},60);expect(calls).toBe(120);expect(world.snapshot().errors).toEqual([]);
});
it('advances a separately loaded AssetInstance mixer beside the full humanoid controller',async()=>{
  const definition=catalog.assets.find(asset=>asset.id==='humanoid.uefn-mannequin')! as unknown as AssetDefinition;
  const world=await setup(undefined,{assetDefinitions:{[definition.id]:definition}}),asset=await world.assets.load(definition.id);asset.object.position.set(5,.04,0);
  world.addCharacter({id:'asset-actor',asset});await world.start();world.stop();
  const move=await world.execute({type:'actor.move-to',entityId:'asset-actor',targetPositionWorldMetersXYZ:[5,0,5]});expect(move.status).toBe('accepted');world.step({},60);
  expect(await world.execute({type:'entity.play-action',entityId:'asset-actor',actionId:'jump',playback:'once'})).toMatchObject({status:'rejected',error:{code:'ACTOR_RESOURCE_BUSY'}});
  expect(world.getEntityState('asset-actor').positionWorldMetersXYZ[2],JSON.stringify({move,state:world.getEntityState('asset-actor'),operation:move.status==='accepted'?world.operations.get(move.operationId):null})).toBeGreaterThan(1);expect(world.getEntityState('asset-actor').animation).toMatchObject({actionId:'walk'});expect(world.getEntityState('asset-actor').animation!.timeSeconds).toBeGreaterThan(.1);
  await world.execute({type:'actor.stop',entityId:'asset-actor'});expect((await world.execute({type:'entity.play-action',entityId:'asset-actor',actionId:'jump',playback:'once'})).status).toBe('applied');world.step({},10);
  expect(await world.execute({type:'actor.move-to',entityId:'asset-actor',targetPositionWorldMetersXYZ:[5,0,5]})).toMatchObject({status:'rejected',error:{code:'ACTOR_RESOURCE_BUSY'}});
  expect(world.getEntityState('asset-actor').animation?.actionId).toBe('jump');await world.reset();expect(world.getEntityState('asset-actor').animation).toMatchObject({actionId:'idle',timeSeconds:0});
});

it('prevalidates resource changes in a plan without leaving a partially started animation',async()=>{
 const definition=catalog.assets.find(asset=>asset.id==='humanoid.uefn-mannequin')! as unknown as AssetDefinition;
 const world=await setup(undefined,{assetDefinitions:{[definition.id]:definition}}),asset=await world.assets.load(definition.id);asset.object.position.set(5,.04,0);world.addCharacter({id:'actor',asset});
 const register=(id:string,plan:()=>import('./contracts').PrimitiveCommand[])=>world.registerAction({id,description:id,inputSchema:{type:'object',properties:{},required:[],additionalProperties:false},writes:[{kind:'entity',entityId:'actor',channels:['locomotion','animation']}],plan});
 register('conflict',()=>[{type:'entity.play-action',entityId:'actor',actionId:'jump',playback:'loop'},{type:'actor.move-to',entityId:'actor',targetPositionWorldMetersXYZ:[5,0,5]}]);
 register('nav-to-animation',()=>[{type:'actor.stop',entityId:'actor'},{type:'entity.play-action',entityId:'actor',actionId:'jump',playback:'loop'}]);
 register('animation-to-nav',()=>[{type:'entity.stop-action',entityId:'actor'},{type:'actor.move-to',entityId:'actor',targetPositionWorldMetersXYZ:[5,0,5]}]);
 world.step({},30);const before=world.getEntityState('actor');
 expect(await world.execute({type:'action.invoke',actionId:'conflict',arguments:{}})).toMatchObject({status:'rejected',error:{code:'ACTOR_RESOURCE_BUSY'}});
 const unchanged=world.getEntityState('actor');expect(unchanged.animation).toEqual(before.animation);expect(unchanged.controlOwners).toEqual(before.controlOwners);expect(unchanged.positionWorldMetersXYZ).toEqual(before.positionWorldMetersXYZ);
 unchanged.rotationLocalRadiansXYZ.forEach((value,index)=>expect(value).toBeCloseTo(before.rotationLocalRadiansXYZ[index]!,12));
 expect((await world.execute({type:'actor.move-to',entityId:'actor',targetPositionWorldMetersXYZ:[5,0,5]})).status).toBe('accepted');
 expect((await world.execute({type:'action.invoke',actionId:'nav-to-animation',arguments:{}})).status).toBe('applied');
 expect(world.getEntityState('actor').controlOwners).toContainEqual({channel:'animation',ownerKind:'animation',ownerId:'jump'});
 expect((await world.execute({type:'action.invoke',actionId:'animation-to-nav',arguments:{}})).status).toBe('accepted');
 expect(world.getEntityState('actor').controlOwners.some(owner=>owner.ownerKind==='animation')).toBe(false);
});

it('keeps moving ordinary and full humanoid capsules separated without navigation',async()=>{
  const world=await setup(undefined,{navigation:false}),object=new THREE.Group();object.position.set(-4,.04,2);
  world.registerMovement({id:'toward-player',version:1,description:'Direct walking velocity',initialState:null,update:()=>({state:null,velocityWorldMetersPerSecondXYZ:[0,0,-2],applyGravity:true})});
  world.addCharacter({id:'plain',object,body:{heightMeters:1.2,radiusMeters:.4},movement:{kind:'custom',movementId:'toward-player'}});
  const q=world.humanoid!.environment,player=world.humanoid!.actorController('player');let collider:RAPIER.Collider|undefined;
  q.borrowPhysics().world.colliders.forEach(value=>{if(q.colliderId(value.handle)==='plain')collider=value;});expect(collider).toBeDefined();
  let penetration=0;
  for(let tick=0;tick<180;tick++){world.step({humanoid:{...emptyInput(),forward:1}},1);const contact=player.capsule.contactCollider(collider!,.1);penetration=Math.max(penetration,-(contact?.distance??0));}
  expect(penetration).toBeLessThan(.003);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeLessThan(world.getEntityState('plain').positionWorldMetersXYZ[2]);
});

it('hands input between ordinary and full actors without redirecting NPC commands or camera ownership',async()=>{
 const world=await setup(),runtime=world.humanoid!,object=new THREE.Group();object.position.set(3,.04,0);
 world.addCharacter({id:'ordinary',object,body:{heightMeters:1.2,radiusMeters:.3},eyePositionLocalMetersXYZ:[0,1,0]});
 world.setControlledEntity('ordinary');world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'ordinary'},activation:'on-input',views:{'third-person':{kind:'third-person'},'first-person':{kind:'first-person'}}}});world.step({},0);
 const player=world.getEntityState('player').positionWorldMetersXYZ;
 world.step({moveZRatio:-1},60);
 expect(world.snapshot().humanoid).toBeUndefined();expect(world.describe().humanoid).toBeUndefined();
 expect(()=>runtime.snapshot()).toThrow('HUMANOID_INPUT_ACTOR_REQUIRED');expect(runtime.snapshot('player').character.instanceId).toBe('player');
 expect((await world.execute({type:'humanoid.set-input',input:{...emptyInput(),forward:1}})).status).toBe('rejected');
 expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeCloseTo(player[2]);
 expect(Math.abs(world.getEntityState('ordinary').positionWorldMetersXYZ[2])).toBeGreaterThan(1);
 expect((await world.execute({type:'humanoid.set-input',actorId:'player',input:{...emptyInput(),forward:1}})).status).toBe('applied');
 world.step({},30);expect(runtime.inspectControls('player').lastApplied?.input.forward).toBe(1);
 world.setControlledEntity('player');expect(world.snapshot().humanoid?.character.instanceId).toBe('player');
 world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'player'},activation:'on-input',transition:{durationSeconds:0},views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'look-at'},position:{distanceMeters:4,armHalfLifeSeconds:0},zoom:{range:{kind:'unbounded'},halfLifeSeconds:0}}}}}});world.step({},1);
 await world.reset();expect(world.snapshot().controlledEntityId).toBe('ordinary');expect(world.snapshot().humanoid).toBeUndefined();world.step({},1);
});

it('shares authored follow options with complete humanoids and rejects invalid input atomically',async()=>{
 const world=await setup(),runtime=world.humanoid!,npc=await runtime.createCharacter();npc.root.position.set(3,.04,0);world.addCharacter({id:'guide',humanoid:npc});
 const object=new THREE.Group();object.position.set(6,.04,0);world.addCharacter({id:'ordinary',object,body:{heightMeters:1.2,radiusMeters:.3},eyePositionLocalMetersXYZ:[0,1,0]});
 const state=()=>({camera:world.snapshot().camera,target:runtime.cameraTargetId,mode:runtime.cameraMode,profile:runtime.exportProfile(),position:world.camera.position.toArray(),quaternion:world.camera.quaternion.toArray(),revision:world.snapshot().worldRevision});
 for(const owner of ['ordinary','player']){
  world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:owner},activation:'on-input',views:{'third-person':{kind:'third-person'},'first-person':{kind:'first-person'}}}});world.setCameraView('first-person');
  const before=state();
  for(const radius of [NaN,-1]){
   expect(()=>world.setCameraFollow({configuration:{...world.inspectCamera().document!,views:{'third-person':{kind:'third-person',overrides:{constraints:{collision:{radiusMeters:radius}}}}}}})).toThrow();expect(state()).toEqual(before);
  }
 }
 world.useAuthoredCamera();const opening=world.camera.clone();
 expect(()=>world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'guide'},activation:'on-input',transition:{durationSeconds:0},views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'preserve-opening'},position:{subjectTranslationHalfLifeSeconds:.2,armHalfLifeSeconds:0},zoom:{range:{kind:'unbounded'},halfLifeSeconds:0},constraints:{collision:{radiusMeters:.2}}}}}}})).toThrow('CAMERA_OPENING_REFERENCE_REQUIRED');
 world.setCameraFollow({configuration:{...world.inspectCamera().document!,binding:{targetEntityId:'guide'},activation:'on-input'}});
 expect(runtime.cameraTargetId).toBe('guide');expect(world.cameraMode).toBe('follow-pending');
 expect(world.camera.position.toArray().every(Number.isFinite)).toBe(true);
 world.step({moveZRatio:-1},1);expect(world.cameraMode).toBe('follow');
 expect(world.describe().humanoid!.configuration.effective).not.toHaveProperty('camera');
 world.setCameraView('first-person');expect(world.inspectCamera().resolved?.kind).toBe('first-person');
});

it('keeps one camera writer when following ordinary or full actors and when authoring the camera',async()=>{
 const world=await setup(),runtime=world.humanoid!,object=new THREE.Group();object.position.set(4,.04,0);
 world.addCharacter({id:'ordinary',object,body:{heightMeters:1.2,radiusMeters:.3},eyePositionLocalMetersXYZ:[0,1,0]});
 world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'ordinary'},activation:'on-input',views:{'third-person':{kind:'third-person'},'first-person':{kind:'first-person'}}}});
 const before=world.inspectCamera();
 runtime.applyProfile({character:{speed:5}});expect(world.inspectCamera()).toEqual(before);
 world.step({},30);world.render();expect(world.inspectCamera().current?.resolvedSubjectId).toBe('ordinary');
 world.setCameraView('first-person');expect(world.snapshot().camera.viewKind).toBe('first-person');
 world.setCameraView('third-person');world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'player'},activation:'immediate',transition:{durationSeconds:0},views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'look-at'},position:{distanceMeters:4,armHalfLifeSeconds:0},zoom:{range:{kind:'unbounded'},halfLifeSeconds:0}}}}}});world.step({},10);expect(world.cameraMode).toBe('follow');
 world.useAuthoredCamera();const camera=world.camera.matrix.clone();world.step({},10);expect(world.camera.matrix.equals(camera)).toBe(true);
});


it.each([false,true])('records an ordinary controlled actor alongside full humanoids through Episode (custom=%s)',async(custom)=>{
 const {win,renderer}=rendererFixture(),world=await setup(renderer),object=new THREE.Group();object.position.set(3,.04,0);
 if(custom)world.registerMovement({id:'flight',version:1,description:'Independent vertical flight',initialState:null,
  update:({input,state})=>({state,velocityWorldMetersPerSecondXYZ:[0,(input.moveYRatio??0)*2,0],applyGravity:false}),
  episode:{startSupport:'free',input:()=>({moveYRatio:1})}});
 world.addCharacter({id:'ordinary',object,body:{heightMeters:1.2,radiusMeters:.3},eyePositionLocalMetersXYZ:[0,1,0],...(custom?{movement:{kind:'custom' as const,movementId:'flight'}}:{})});
 world.setControlledEntity('ordinary');world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'ordinary'},activation:'on-input',views:{'third-person':{kind:'third-person'},'first-person':{kind:'first-person'}}}});
 await world.start();world.stop();const episode=(win as unknown as {__WORLDKIT_EVAL__:import('./contracts').WorldObservation}).__WORLDKIT_EVAL__.episode!;
 expect(episode.probeStart({positionWorldMetersXYZ:[-4,custom ? .2 : 1.73,0],facingYawRadians:0}).isValid).toBe(false);
 expect(episode.capabilities().humanoid).toBeUndefined();expect(episode.capabilities().movement).toMatchObject({episodeInput:custom?'custom':'ground',heightMeters:1.2,radiusMeters:.3});
 const start={positionWorldMetersXYZ:[3,custom?3:.03,5] as const,facingYawRadians:0,cameraViewId:'first-person' as const};
 expect(episode.probeStart({...start,humanoid:{vehicleInstanceId:'missing'}})).toMatchObject({isValid:false,diagnostics:[{code:'EPISODE_HUMANOID_START_UNSUPPORTED'}]});
 const before=await episode.prepareSegment(start,{widthPixels:640,heightPixels:360}),player=before.entities.find(entity=>entity.id==='player')!;
 const input=custom?episode.routeInput!({targetPositionWorldMetersXYZ:[3,8,5],gait:'walk'}):{moveZRatio:-1};
 const after=episode.advance(input,60),moving=after.entities.find(entity=>entity.id==='ordinary')!;
 expect(after.humanoid).toBeUndefined();expect(after.camera.viewKind).toBe('first-person');
 expect(()=>world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'player'},activation:'on-input',transition:{durationSeconds:0},views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'look-at'},position:{distanceMeters:4,armHalfLifeSeconds:0},zoom:{range:{kind:'unbounded'},halfLifeSeconds:0}}}}}})).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');expect(world.snapshot().camera.viewKind).toBe('first-person');
 expect(()=>world.setControlledEntity('player')).toThrow('EPISODE_CAPTURE_OWNS_CLOCK');
 if(custom)expect(moving.positionWorldMetersXYZ[1]).toBeGreaterThan(4);else expect(moving.positionWorldMetersXYZ[2]).toBeLessThan(4);
 expect(after.entities.find(entity=>entity.id==='player')!.positionWorldMetersXYZ[2]).toBeCloseTo(player.positionWorldMetersXYZ[2]);
 expect(episode.frame('image/png').snapshot.errors).toEqual([]);
 expect((await episode.execute({type:'camera.set-view',viewId:'third-person'})).status).toBe('applied');
 episode.release();await world.reset();expect(world.snapshot().controlledEntityId).toBe('ordinary');world.step({},1);
});


it('rejects a missing full camera target without poisoning the remaining ordinary world',async()=>{
 const world=await setup(),object=new THREE.Group();object.position.set(3,.04,0);
 world.addCharacter({id:'ordinary',object,body:{heightMeters:1.2,radiusMeters:.3},eyePositionLocalMetersXYZ:[0,1,0]});world.setControlledEntity('ordinary');world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'ordinary'},activation:'on-input',transition:{durationSeconds:0},views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'look-at'},position:{distanceMeters:4,armHalfLifeSeconds:0},zoom:{range:{kind:'unbounded'},halfLifeSeconds:0}}}}}});world.step({},0);
 expect((await world.execute({type:'entity.despawn',entityId:'player'})).status).toBe('applied');
 const before=world.camera.matrix.clone();expect(()=>world.setCameraView('first-person')).toThrow();
 expect((await world.execute({type:'humanoid.apply-profile',profile:{character:{speed:5}}})).status).toBe('applied');
 expect(world.camera.matrix.equals(before)).toBe(true);expect(()=>world.step({moveXRatio:1},60)).not.toThrow();expect(world.snapshot().errors).toEqual([]);
 world.humanoid!.switchMap({...map,id:'ordinary-only-map'});world.step({},1);await world.reset();expect(world.snapshot().controlledEntityId).toBe('ordinary');expect(world.snapshot().humanoid).toBeUndefined();expect(world.humanoid!.hasActor('player')).toBe(true);world.step({},1);
});

it('continues observation after deleting a camera NPC and preserves ownership after rejected follow options',async()=>{
 const world=await setup(),runtime=world.humanoid!,npc=await runtime.createCharacter();npc.root.position.set(3,.04,0);world.addCharacter({id:'npc',humanoid:npc});
 const object=new THREE.Group();object.position.set(6,.04,0);world.addCharacter({id:'ordinary',object,body:{heightMeters:1.2,radiusMeters:.3},eyePositionLocalMetersXYZ:[0,1,0]});
 const before=world.snapshot().camera;expect(()=>world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'ordinary'},activation:'on-input',transition:{durationSeconds:0},views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'look-at'},position:{distanceMeters:4,armHalfLifeSeconds:0},zoom:{range:{kind:'unbounded'},halfLifeSeconds:0},constraints:{collision:{radiusMeters:0}}}}}}})).toThrow();expect(world.snapshot().camera).toEqual(before);
 world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'npc'},activation:'on-input',transition:{durationSeconds:0},views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'look-at'},position:{distanceMeters:4,armHalfLifeSeconds:0},zoom:{range:{kind:'unbounded'},halfLifeSeconds:0}}}}}});expect((await world.execute({type:'entity.despawn',entityId:'npc'})).status).toBe('applied');
 expect(world.inspectCamera().mode).toBe('authored');world.step({},1);
});

it('recovers only the displaced actor while retaining another actor input and shared world time',async()=>{
 const world=await setup(undefined,{map:{...map,recovery:{fallBelowY:-3,checkpoint:{position:[-8,.03,0],yaw:0}}}}),runtime=world.humanoid!;
 const npc=await runtime.createCharacter();npc.root.position.set(4,.04,0);world.addCharacter({id:'recovering',humanoid:npc});world.step({},1);
 await world.execute({type:'humanoid.set-input',actorId:'player',input:{...emptyInput(),forward:1}});
 await world.execute({type:'humanoid.set-input',actorId:'recovering',input:{...emptyInput(),forward:1}});
 const controller=runtime.actorController('recovering'),before=world.simulationTick,playerBefore=world.getEntityState('player').positionWorldMetersXYZ;
 controller.position.set(4,-4,0);const center=controller.position.clone().add(new THREE.Vector3(0,controller.capsuleCenter,0));controller.body.setTranslation(center,true);controller.body.setNextKinematicTranslation(center);controller.commitPose();
 world.step({},1);
 expect(runtime.snapshot('recovering').recovery).toMatchObject({status:'recovered',subjectInstanceId:'recovering'});
 expect(runtime.snapshot('player').recovery).toBeNull();expect(runtime.inspectControls('recovering').override).toBeNull();expect(runtime.inspectControls('player').override).not.toBeNull();
 expect(world.simulationTick).toBe(before+1);expect(controller.position.x).toBeCloseTo(-8);
 expect(world.getEntityState('player').positionWorldMetersXYZ[0]).toBeCloseTo(playerBefore[0]);
 world.step({},30);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(playerBefore[2]);
});

it('forwards explicit character model texture options through createHumanoidWorld',async()=>{
  const world=await setup(undefined,{characterLoadOptions:{loadTextures:true}});
  const clone=await world.humanoid!.createCharacter();
  try{let maps=0;clone.root.traverse(node=>{if(node instanceof THREE.Mesh)for(const material of Array.isArray(node.material)?node.material:[node.material]){if(material.map instanceof THREE.DataTexture){maps++;expect(material.map.image.width).toBeGreaterThan(0);}}});expect(maps).toBeGreaterThan(0);}
  finally{clone.dispose();}
});


it('destroys a native actor through its visual parent using the native cleanup owner',async()=>{
 const world=await setup(),runtime=world.humanoid!,npc=await runtime.createCharacter();npc.root.position.set(5,.04,0);
 const parent=new THREE.Group();world.addEntity({id:'parent',object:parent,role:'decoration'});world.addCharacter({id:'npc',humanoid:npc});world.step({},1);
 parent.add(npc.root);const dispose=vi.spyOn(npc,'dispose');
 expect(await world.execute({type:'entity.set-active',entityId:'parent',isActive:false})).toMatchObject({status:'applied'});
 expect(await world.execute({type:'entity.destroy',entityId:'parent'})).toMatchObject({status:'applied'});
 expect(dispose).toHaveBeenCalledOnce();expect(runtime.hasActor('npc')).toBe(false);expect(npc.root.parent).toBeNull();
 await world.reset();expect(world.snapshot().entities.some(e=>e.id==='npc'||e.id==='parent')).toBe(false);world.step({},2);expect(world.snapshot().errors).toEqual([]);
});


it('freezes a real native character while another actor continues, clears stale input and restores the reset baseline',async()=>{
 const world=await setup(),runtime=world.humanoid!,peer=await runtime.createCharacter();peer.root.position.set(4,.04,0);world.addCharacter({id:'peer',humanoid:peer});world.step({},30);
 await world.execute({type:'humanoid.set-input',actorId:'player',input:{...emptyInput(),forward:1}});
 await world.execute({type:'humanoid.set-input',actorId:'peer',input:{...emptyInput(),forward:1}});world.step({},10);
 const frozen=world.getEntityState('player'),peerBefore=world.getEntityState('peer'),bodies=runtime.environment.borrowPhysics().world.bodies.len();
 expect(await world.execute({type:'entity.set-active',entityId:'player',isActive:false})).toMatchObject({status:'applied'});
 const controller=vi.spyOn(runtime.actorController('player'),'step');world.step({moveZRatio:-1,run:true,jump:true},20);
 expect(controller).not.toHaveBeenCalled();expect(world.getEntityState('player').positionWorldMetersXYZ).toEqual(frozen.positionWorldMetersXYZ);expect(world.getEntityState('player').animation).toEqual(frozen.animation);
 expect(world.getEntityState('peer').positionWorldMetersXYZ).not.toEqual(peerBefore.positionWorldMetersXYZ);expect(runtime.actorController('player').body.isEnabled()).toBe(false);
 expect(await world.execute({type:'humanoid.set-input',actorId:'player',input:emptyInput()})).toMatchObject({status:'rejected',error:{code:'ENTITY_INACTIVE'}});
 expect(await world.execute({type:'entity.set-active',entityId:'player',isActive:true})).toMatchObject({status:'applied'});expect(runtime.inspectControls('player').override).toBeNull();
 world.step({moveZRatio:-1},10);expect(controller).toHaveBeenCalled();expect(runtime.environment.borrowPhysics().world.bodies.len()).toBe(bodies);
 await world.execute({type:'entity.set-active',entityId:'player',isActive:false});await world.reset();expect(world.getEntityState('player').isActive).toBe(true);expect(runtime.actorController('player').body.isEnabled()).toBe(true);
});

it('suspends and resumes a mounted driver and native car as one group without advancing their physics or animation',async()=>{
 const spec=createRoadVehicleSpec('car'),world=await setup(undefined,{map:{...map,spawns:[{id:'car-spawn',name:'Car',vehicleId:'car',position:[0,.1,0],yaw:0,regionId:'road'}],regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[40,40],color:'#fff',modes:['wheeled']}]},vehicles:[{instanceId:'car',assetId:'custom.car',spec,object:new THREE.Group()}]});
 const runtime=world.humanoid!;expect(runtime.approach('car')).toBe(true);expect(runtime.enter('car')).toBe(true);world.step({},40);world.step({moveZRatio:-1},15);
 const sim=runtime.simulation,car=sim.vehicles[0]!,pose=car.position.clone(),wheels=structuredClone(car.motion.wheelPhysics?.wheels),before=world.simulationTick,animation=world.getEntityState('player').animation;
 expect(await world.execute({type:'entity.set-active',entityId:'car',isActive:false})).toMatchObject({status:'applied'});
 expect(world.getEntityState('car').isActive).toBe(false);expect(world.getEntityState('player').isActive).toBe(false);
 const chassis:import('@dimforge/rapier3d-compat').RigidBody[]=[];runtime.environment.borrowPhysics().world.colliders.forEach(c=>{if(runtime.environment.colliderId(c.handle)==='car'&&c.parent())chassis.push(c.parent()!);});expect(chassis.length).toBeGreaterThan(0);expect(chassis.every(body=>!body.isEnabled())).toBe(true);
 world.step({moveZRatio:-1,run:true},45);expect(car.position.toArray()).toEqual(pose.toArray());expect(car.motion.wheelPhysics?.wheels).toEqual(wheels);expect(world.getEntityState('player').animation).toEqual(animation);expect(world.simulationTick).toBe(before+45);expect(sim.actor('player').vehicle).toBe(car);
 expect(await world.execute({type:'vehicle.exit'})).toMatchObject({status:'rejected',error:{code:'ENTITY_INACTIVE'}});
 expect(await world.execute({type:'entity.set-active',entityId:'player',isActive:true})).toMatchObject({status:'applied'});
 expect(world.getEntityState('car').isActive).toBe(true);world.step({moveZRatio:-1},15);expect(car.position.toArray()).not.toEqual(pose.toArray());expect(world.snapshot().errors).toEqual([]);
 const parent=new THREE.Group();world.addEntity({id:'holder',object:parent,role:'decoration'});parent.add(runtime.options.character.object);
 expect(await world.execute({type:'entity.set-active',entityId:'holder',isActive:false})).toMatchObject({status:'applied'});
 expect(await world.execute({type:'entity.set-active',entityId:'car',isActive:true})).toMatchObject({status:'rejected',error:{code:'MOUNT_GROUP_INACTIVE_ANCESTOR'}});expect(world.getEntityState('car').isActive).toBe(false);
 expect(await world.execute({type:'entity.set-active',entityId:'holder',isActive:true})).toMatchObject({status:'applied'});expect(world.getEntityState('player').isActive).toBe(true);expect(world.getEntityState('car').isActive).toBe(true);world.scene.add(runtime.options.character.object);

});


it.each(['rover','plane','boat','submarine','horse','dragon','spacecraft'])('keeps the inactive %s family state frozen and resettable',async id=>{
 const spec=structuredClone(SPECS.find(s=>s.id===id)!);spec.spawn=[0,.1,0];
 const world=await setup(undefined,{map:{...map,playerSpawn:[-25,.04,0],bounds:{min:[-60,-15,-60],max:[60,80,60]},boxes:[{id:'floor',position:[0,-.5,0],size:[120,1,120]}],spawns:[{id:'spawn',name:'fixture',vehicleId:id,position:[0,.1,0],yaw:0,regionId:'fixture'}],regions:[{id:'fixture',name:'fixture',description:'',center:[0,0,0],size:[120,120],color:'#aaa',modes:[spec.mode]}]},vehicles:[{instanceId:id,assetId:'test.'+id,spec,object:new THREE.Group()}]});
 world.step({},5);const r=world.humanoid!,v=r.simulation.vehicles[0]!,pose=v.position.clone(),rotation=v.rotation.clone();
 expect(await world.execute({type:'entity.set-active',entityId:id,isActive:false})).toMatchObject({status:'applied'});const dynamics=r.snapshot().vehicleDynamics[0];world.step({},12);
 expect(v.position.toArray()).toEqual(pose.toArray());expect(v.rotation.toArray()).toEqual(rotation.toArray());expect(r.snapshot().vehicleDynamics[0]).toEqual(dynamics);
 expect(await world.execute({type:'entity.set-active',entityId:id,isActive:true})).toMatchObject({status:'applied'});world.step({},2);expect(world.snapshot().errors).toEqual([]);
 await world.execute({type:'entity.set-active',entityId:id,isActive:false});await world.reset();expect(world.getEntityState(id).isActive).toBe(true);world.step({},2);expect(world.snapshot().errors).toEqual([]);
});

it('preserves native inactivity through map replacement and refuses activation changes during an in-progress interaction',async()=>{
 const world=await setup(),runtime=world.humanoid!;
 await world.execute({type:'entity.set-active',entityId:'player',isActive:false});runtime.switchMap({...map,id:'replacement'});const before=world.getEntityState('player').positionWorldMetersXYZ;world.step({moveZRatio:-1},10);expect(world.getEntityState('player').positionWorldMetersXYZ).toEqual(before);expect(runtime.actorController('player').body.isEnabled()).toBe(false);
 await world.execute({type:'entity.set-active',entityId:'player',isActive:true});const actor=runtime.simulation.actor('player');actor.transition=.3;
 expect(await world.execute({type:'entity.set-active',entityId:'player',isActive:false})).toMatchObject({status:'rejected',error:{code:'HUMANOID_TRANSITION_ACTIVE'}});expect(world.getEntityState('player').isActive).toBe(true);
});


it('does not inherit native inactivity when a removed id is reused by a new character',async()=>{
 const world=await setup(),r=world.humanoid!,first=await r.createCharacter();first.root.position.set(4,.04,0);world.addCharacter({id:'reused',humanoid:first});
 await world.execute({type:'entity.set-active',entityId:'reused',isActive:false});expect((await world.execute({type:'entity.despawn',entityId:'reused'})).status).toBe('applied');
 const second=await r.createCharacter();second.root.position.set(6,.04,0);world.addCharacter({id:'reused',humanoid:second});const update=vi.spyOn(second,'update');world.step({},3);expect(world.getEntityState('reused').isActive).toBe(true);expect(r.simulation.isActive('reused')).toBe(true);expect(update).toHaveBeenCalled();
});


it('does not snap another moving native actor presentation when toggling an unrelated character',async()=>{
 const {renderer}=rendererFixture(),world=await setup(renderer),runtime=world.humanoid!,peer=await runtime.createCharacter();peer.root.position.set(4,.04,0);world.addCharacter({id:'peer',humanoid:peer});
 await world.execute({type:'humanoid.set-input',actorId:'peer',input:{...emptyInput(),forward:1}});world.step({},20);
 const engine=(world as unknown as {engine:import('./engine').WorldEngine}).engine;let displayed:number[]=[];vi.mocked(renderer.render).mockImplementation(()=>{displayed=peer.root.position.toArray();});await world.start();engine.render(1);const before=peer.root.position.clone();
 const pending=world.execute({type:'entity.set-active',entityId:'player',isActive:false});await vi.waitFor(()=>expect((world as unknown as {queued:unknown[]}).queued.length).toBe(1));world.step({},1);expect(await pending).toMatchObject({status:'applied'});const after=peer.root.position.clone();engine.render(.25);expect(new THREE.Vector3(...displayed).distanceTo(before.lerp(after,.25))).toBeLessThan(1e-8);world.stop();
});


it('destroys a sealed native actor independently and excludes it from reset and map replacement',async()=>{
 const world=await setup(),r=world.humanoid!,victim=await r.createCharacter(),peer=await r.createCharacter();victim.root.position.set(1,.04,0);peer.root.position.set(6,.04,0);
 world.addCharacter({id:'victim',humanoid:victim});const handle=r.actorController('victim').body;world.addCharacter({id:'peer',humanoid:peer});world.step({},30);
 const physics=r.environment.borrowPhysics().world,bodies=physics.bodies.len(),colliders=r.environment.colliderCount;
 const mixer=victim.sourceCharacter!.mixer,uncache=vi.spyOn(mixer,'uncacheRoot'),dispose=vi.spyOn(victim,'dispose'),update=vi.spyOn(victim,'update');
 await world.execute({type:'humanoid.set-input',actorId:'victim',input:{...emptyInput(),forward:1}});
 await world.execute({type:'entity.set-active',entityId:'victim',isActive:false});
 const before=world.getEntityState('peer').animation!.timeSeconds;
 expect(await world.execute({type:'entity.destroy',entityId:'victim'})).toMatchObject({status:'applied'});
 expect(handle.isValid()).toBe(false);expect(r.hasActor('victim')).toBe(false);expect(victim.loaded).toBe(false);expect(physics.bodies.len()).toBe(bodies-1);expect(r.environment.colliderCount).toBe(colliders-1);
 expect(dispose).toHaveBeenCalledOnce();expect(uncache).toHaveBeenCalledOnce();update.mockClear();world.step({},20);expect(update).not.toHaveBeenCalled();expect(world.getEntityState('peer').animation!.timeSeconds).toBeGreaterThan(before);
 expect(await world.execute({type:'entity.destroy',entityId:'victim'})).toMatchObject({status:'rejected',error:{code:'ENTITY_NOT_FOUND'}});
 await world.reset();expect(r.hasActor('victim')).toBe(false);r.switchMap({...map,id:'after-destroy'});world.step({},2);expect(r.hasActor('victim')).toBe(false);expect(world.snapshot().errors).toEqual([]);
 const fresh=await r.createCharacter();fresh.root.position.set(1,.04,0);world.addCharacter({id:'victim',humanoid:fresh});const replacement=r.actorController('victim').body;expect(replacement.isValid()).toBe(true);expect(fresh).not.toBe(victim);world.step({},2);expect(fresh.loaded).toBe(true);
 world.dispose();expect(dispose).toHaveBeenCalledOnce();expect(fresh.loaded).toBe(false);
});

it('destroys the original source actor after control transfer without breaking its factory or peer',async()=>{
 const world=await setup(),r=world.humanoid!,original=r.options.character.animation!,peer=await r.createCharacter();peer.root.position.set(5,.04,0);world.addCharacter({id:'peer',humanoid:peer});world.step({},2);
 expect(await world.execute({type:'entity.destroy',entityId:'player'})).toMatchObject({status:'rejected',error:{code:'CONTROLLED_ENTITY_CANNOT_DESPAWN'}});
 world.setControlledEntity('peer');expect(await world.execute({type:'entity.destroy',entityId:'player'})).toMatchObject({status:'applied'});expect(original.loaded).toBe(false);
 const fresh=await r.createCharacter();fresh.root.position.set(8,.04,0);world.addCharacter({id:'fresh',humanoid:fresh});world.step({},2);expect(peer.loaded).toBe(true);
 await world.reset();expect(world.snapshot().entities.some(e=>e.id==='player')).toBe(false);expect(r.hasActor('player')).toBe(false);world.setControlledEntity('peer');world.step({moveZRatio:-1},2);expect(world.snapshot().errors).toEqual([]);
});

it('rejects destroying a mounted native rider before changing any state',async()=>{
 const spec=createRoadVehicleSpec('car'),world=await setup(undefined,{map:{...map,regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[40,40],color:'#fff',modes:['wheeled']}],spawns:[{id:'slot',name:'Car',vehicleId:'car',position:[0,.1,0],yaw:0,regionId:'road'}]},vehicles:[{instanceId:'car',assetId:'car',spec,object:new THREE.Group()}]});
 const r=world.humanoid!,peer=await r.createCharacter();peer.root.position.set(6,.04,0);world.addCharacter({id:'peer',humanoid:peer});expect(r.approach('car')).toBe(true);expect(r.enter('car')).toBe(true);world.step({},40);world.setControlledEntity('peer');
 const bodyCount=r.environment.borrowPhysics().world.bodies.len(),vehicle=r.simulation.actor('player').vehicle;
 expect(await world.execute({type:'entity.destroy',entityId:'player'})).toMatchObject({status:'rejected',error:{code:'HUMANOID_MOUNT_ACTIVE'}});expect(r.hasActor('player')).toBe(true);expect(r.simulation.actor('player').vehicle).toBe(vehicle);expect(r.environment.borrowPhysics().world.bodies.len()).toBe(bodyCount);world.step({},2);
});

it('reports a committed native cleanup failure but still releases sibling characters and reset entries',async()=>{
 const world=await setup(),r=world.humanoid!,a=await r.createCharacter(),b=await r.createCharacter();a.root.position.set(2,.04,0);b.root.position.set(6,.04,0);
 const parent=new THREE.Group();world.addEntity({id:'group',role:'decoration',object:parent});world.addCharacter({id:'a',humanoid:a});world.addCharacter({id:'b',humanoid:b});world.step({},1);parent.add(a.root,b.root);
 const actual=a.dispose.bind(a);vi.spyOn(a,'dispose').mockImplementation(()=>{actual();throw Error('injected cleanup failure');});const second=vi.spyOn(b,'dispose');
 const receipt=await world.execute({type:'entity.destroy',entityId:'group'});expect(receipt.status).toBe('accepted');if(receipt.status==='accepted')expect(world.operations.get(receipt.operationId)).toMatchObject({status:'failed'});expect(second).toHaveBeenCalledOnce();expect(r.hasActor('a')).toBe(false);expect(r.hasActor('b')).toBe(false);expect(world.snapshot().entities.some(e=>['a','b','group'].includes(e.id))).toBe(false);
 await world.reset();expect(r.hasActor('a')).toBe(false);expect(r.hasActor('b')).toBe(false);
});


it('automatically dismounts safely before destroying a native car and never restores it on reset',async()=>{
 const spec=createRoadVehicleSpec('car'),object=new THREE.Group(),world=await setup(undefined,{initialMountId:'car',map:{...map,regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[40,40],color:'#fff',modes:['wheeled']}],spawns:[{id:'slot',name:'Car',vehicleId:'car',position:[0,.1,0],yaw:0,regionId:'road'}]},vehicles:[{instanceId:'car',assetId:'car',spec,object}]});
 const r=world.humanoid!,peer=await r.createCharacter();peer.root.position.set(8,.04,0);world.addCharacter({id:'peer',humanoid:peer});world.step({},30);
 const physics=r.environment.borrowPhysics().world,count=physics.bodies.len(),peerBody=r.actorController('peer').body;
 const receipt=await world.execute({type:'entity.destroy',entityId:'car'});expect(receipt,JSON.stringify(receipt)).toMatchObject({status:'applied'});
 expect(r.simulation.actor('player').vehicle).toBeUndefined();expect(r.actorController('player').isMounted).toBe(false);expect(r.actorController('player').capsule.isEnabled()).toBe(true);
 expect(r.simulation.vehicles).toHaveLength(0);expect(r.options.vehicles).toHaveLength(0);expect(object.parent).toBeNull();expect(physics.bodies.len()).toBeLessThan(count);expect(r.actorController('peer').body).toBe(peerBody);
 world.step({},40);expect(r.snapshot().vehicles).toEqual([]);expect(r.actorController('player').grounded).toBe(true);expect(world.inspectCamera().mode).toBe('follow');expect(world.snapshot().errors).toEqual([]);
 await world.reset();world.step({},2);expect(world.inspectCamera().mode).toBe('follow');expect(r.simulation.vehicles).toEqual([]);expect(r.simulation.actor('player').vehicle).toBeUndefined();r.switchMap({...map,id:'without-car'});world.step({},2);expect(world.snapshot().entities.some(e=>e.id==='car')).toBe(false);expect(world.snapshot().errors).toEqual([]);
});

it('preserves later vehicle and driver identities when deleting an earlier unoccupied vehicle slot',async()=>{
 const spec=createRoadVehicleSpec('car'),vehicles=['first','second'].map(id=>({instanceId:id,assetId:id,spec,object:new THREE.Group()})),world=await setup(undefined,{initialMountId:'second',vehicles,map:{...map,regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[40,40],color:'#fff',modes:['wheeled']}],spawns:vehicles.map((v,n)=>({id:v.instanceId,name:v.instanceId,vehicleId:v.instanceId,position:[n*10,.1,0] as [number,number,number],yaw:0,regionId:'road'}))}});
 const r=world.humanoid!;world.step({},30);const survivor=r.simulation.vehicles[1]!,root=vehicles[1]!.object,pose=survivor.position.clone();
 expect(await world.execute({type:'entity.destroy',entityId:'first'})).toMatchObject({status:'applied'});
 expect(vehicles).toHaveLength(2);expect(r.simulation.vehicles[0]).toBe(survivor);expect(r.simulation.actor('player').vehicle).toBe(survivor);expect(r.simulation.actor('player').vehicleIndex).toBe(0);expect(r.options.vehicles[0]!.object).toBe(root);expect(survivor.position.equals(pose)).toBe(true);
 world.step({moveZRatio:-1},15);expect(survivor.position.distanceTo(pose)).toBeGreaterThan(.01);expect(r.snapshot().vehicles).toHaveLength(1);await world.reset();expect(r.simulation.actor('player').vehicle?.spec.id).toBe('second');expect(r.simulation.vehicles).toHaveLength(1);expect(world.snapshot().errors).toEqual([]);
});

it('rejects unsafe occupied-vehicle destruction without dismounting or deleting anything',async()=>{
 const spec=createRoadVehicleSpec('car'),world=await setup(undefined,{initialMountId:'car',map:{...map,regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[40,40],color:'#fff',modes:['wheeled']}],spawns:[{id:'slot',name:'Car',vehicleId:'car',position:[0,.1,0],yaw:0,regionId:'road'}]},vehicles:[{instanceId:'car',assetId:'car',spec,object:new THREE.Group()}]});
 const r=world.humanoid!;world.step({},30);const v=r.simulation.vehicles[0]!,count=r.environment.colliderCount;
 v.velocity.set(0,0,6);expect(await world.execute({type:'entity.destroy',entityId:'car'})).toMatchObject({status:'rejected',error:{code:'VEHICLE_MOUNT_TOO_FAST'}});expect(r.simulation.actor('player').vehicle).toBe(v);expect(r.environment.colliderCount).toBe(count);
 v.velocity.set(0,0,0);v.position.y=10;expect(await world.execute({type:'entity.destroy',entityId:'car'})).toMatchObject({status:'rejected',error:{code:'VEHICLE_DISMOUNT_NO_SAFE_POINT'}});expect(r.simulation.actor('player').vehicle).toBe(v);expect(world.snapshot().entities.some(e=>e.id==='car')).toBe(true);expect(r.environment.colliderCount).toBe(count);
});


it.each(['rover','plane','boat','submarine','horse','dragon','spacecraft'])('destroys an unoccupied %s without retaining its physical queries or reset entry',async id=>{
 const spec=structuredClone(SPECS.find(s=>s.id===id)!),object=new THREE.Group();
 const world=await setup(undefined,{map:{...map,playerSpawn:[-25,.04,0],bounds:{min:[-60,-15,-60],max:[60,80,60]},boxes:[{id:'floor',position:[0,-.5,0],size:[120,1,120]}],spawns:[{id:'spawn',name:'fixture',vehicleId:id,position:[0,.1,0],yaw:0,regionId:'fixture'}],regions:[{id:'fixture',name:'fixture',description:'',center:[0,0,0],size:[120,120],color:'#aaa',modes:[spec.mode]}]},vehicles:[{instanceId:id,assetId:'test.'+id,spec,object}]});
 world.step({},5);const r=world.humanoid!,parent=new THREE.Group();world.addEntity({id:'holder',role:'decoration',object:parent});parent.add(object);
 expect(await world.execute({type:'entity.despawn',entityId:'holder'})).toMatchObject({status:'rejected',error:{code:'HUMANOID_USE_RUNTIME_COMMANDS'}});
 expect(await world.execute({type:'entity.set-active',entityId:id,isActive:false})).toMatchObject({status:'applied'});
 expect(await world.execute({type:'entity.destroy',entityId:'holder'})).toMatchObject({status:'applied'});
 expect(r.audit().entities.some(e=>e.id===id)).toBe(false);expect(r.simulation.preparedVehicleSpawns.has(id)).toBe(false);expect(r.options.vehicles).toHaveLength(0);expect(r.simulation.vehicles).toHaveLength(0);expect(r.exportProfile().vehicles?.[id]).toBeUndefined();expect(r.exportProfile().aircraftFlight?.[id]).toBeUndefined();
 expect([...r.environment.cameraFallbackBounds().keys()].some(key=>key===id)).toBe(false);world.step({},3);await world.reset();world.step({},3);expect(r.simulation.vehicles).toHaveLength(0);expect(world.snapshot().errors).toEqual([]);
});


it('preserves peer interpolation when deleting a different native vehicle',async()=>{
 const spec=createRoadVehicleSpec('car'),{renderer}=rendererFixture(),world=await setup(renderer,{map:{...map,regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[40,40],color:'#fff',modes:['wheeled']}],spawns:[{id:'slot',name:'Car',vehicleId:'car',position:[0,.1,0],yaw:0,regionId:'road'}]},vehicles:[{instanceId:'car',assetId:'car',spec,object:new THREE.Group()}]});
 const r=world.humanoid!,peer=await r.createCharacter();peer.root.position.set(7,.04,0);world.addCharacter({id:'peer',humanoid:peer});await world.execute({type:'humanoid.set-input',actorId:'peer',input:{...emptyInput(),forward:1}});world.step({},20);
 const engine=(world as unknown as {engine:import('./engine').WorldEngine}).engine;let displayed:number[]=[];vi.mocked(renderer.render).mockImplementation(()=>{displayed=peer.root.position.toArray();});await world.start();engine.render(1);const before=peer.root.position.clone();
 const pending=world.execute({type:'entity.destroy',entityId:'car'});await vi.waitFor(()=>expect((world as unknown as {queued:unknown[]}).queued.length).toBe(1));world.step({},1);expect(await pending).toMatchObject({status:'applied'});const after=peer.root.position.clone();engine.render(.25);expect(new THREE.Vector3(...displayed).distanceTo(before.lerp(after,.25))).toBeLessThan(1e-8);world.stop();
});

it('rejects occupied vehicle destruction if the same subtree also deletes its exit support',async()=>{
 const spec=createRoadVehicleSpec('car'),object=new THREE.Group(),world=await setup(undefined,{initialMountId:'car',map:{...map,regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[40,40],color:'#fff',modes:['wheeled']}],spawns:[{id:'slot',name:'Car',vehicleId:'car',position:[0,.1,0],yaw:0,regionId:'road'}]},vehicles:[{instanceId:'car',assetId:'car',spec,object}]});
 const r=world.humanoid!;world.step({},30);const group=new THREE.Group(),platform=new THREE.Mesh(new THREE.BoxGeometry(14,.2,14));platform.position.y=.1;
 world.addEntity({id:'platform',object:platform,role:'terrain',physics:{kind:'fixed'}});world.addEntity({id:'holder',object:group,role:'decoration'});group.add(platform,object);
 const receipt=await world.execute({type:'entity.destroy',entityId:'holder'});expect(receipt,JSON.stringify(receipt)).toMatchObject({status:'rejected',error:{code:'VEHICLE_DISMOUNT_NO_SAFE_POINT'}});expect(r.simulation.actor('player').vehicle?.spec.id).toBe('car');expect(world.snapshot().entities.some(e=>e.id==='platform')).toBe(true);
 platform.geometry.dispose();(platform.material as THREE.Material).dispose();
});


const nativeCreationMap:EnvironmentDefinition={...map,regions:[{id:'road',name:'Road',description:'',center:[0,0,0],size:[40,40],color:'#aaa',modes:['wheeled']}]};
function nativeCar(instanceId='created-car',x=4,z=0){return {instanceId,assetId:'custom.car',spec:{...createRoadVehicleSpec('car'),spawn:[x,.1,z] as [number,number,number],yaw:0},object:new THREE.Group()};}
it('creates a drivable native car inside the existing physics world and removes its complete runtime on reset',async()=>{
 const world=await setup(undefined,{map:nativeCreationMap}),r=world.humanoid!;world.step({},1);
 const physics=r.environment.borrowPhysics().world,bodies=physics.bodies.len(),car=nativeCar();world.addVehicle(car);
 expect(r.environment.borrowPhysics().world).toBe(physics);expect(world.getEntityState(car.instanceId).positionWorldMetersXYZ[0]).toBe(4);expect(r.options.vehicles).toHaveLength(1);
 expect(r.approach(car.instanceId)).toBe(true);expect(r.enter(car.instanceId)).toBe(true);world.step({},40);const before=r.simulation.vehicles[0]!.position.clone();world.step({moveZRatio:-1},45);
 expect(r.simulation.vehicles[0]!.position.distanceTo(before)).toBeGreaterThan(.2);expect(physics.bodies.len()).toBeGreaterThan(bodies);
 await world.reset();expect(world.snapshot().entities.some(e=>e.id===car.instanceId)).toBe(false);expect(r.options.vehicles).toHaveLength(0);expect(r.simulation.vehicles).toHaveLength(0);expect(r.simulation.actor('player').vehicle).toBeUndefined();expect(car.object.parent).toBeNull();expect(r.environment.borrowPhysics().world.bodies.len()).toBe(bodies);world.step({},2);expect(world.snapshot().errors).toEqual([]);
});
it.each(['boarding','mounted','inactive'] as const)('reset retires the %s rider before removing its post-baseline vehicle',async phase=>{
 const world=await setup(undefined,{map:nativeCreationMap}),r=world.humanoid!;world.step({},1);
 const car=nativeCar();world.addVehicle(car);expect(r.approach(car.instanceId)).toBe(true);expect(r.enter(car.instanceId)).toBe(true);
 if(phase!=='boarding')world.step({},40);
 const previous=r.simulation,rider=previous.actor('player');expect(rider.vehicle?.spec.id).toBe(car.instanceId);
 if(phase==='boarding')expect(rider.transition).toBeGreaterThan(0);
 if(phase==='inactive')expect(await world.execute({type:'entity.set-active',entityId:car.instanceId,isActive:false})).toMatchObject({status:'applied'});
 // Occupied removal must still reject outside reset; reset must retire actors first.
 expect(()=>previous.removeVehicle(car.instanceId)).toThrow('HUMANOID_MOUNT_ACTIVE');
 const dispose=vi.spyOn(rider,'dispose'),remove=previous.removeVehicle.bind(previous);
 const observed=vi.spyOn(previous,'removeVehicle').mockImplementation(id=>{
  expect(previous.actors.size).toBe(0);expect(dispose).toHaveBeenCalledTimes(1);return remove(id);
 });
 await world.reset();expect(observed).toHaveBeenCalledWith(car.instanceId);expect(r.simulation).not.toBe(previous);
 expect(r.simulation.actor('player').vehicle).toBeUndefined();expect(r.simulation.actor('player')).not.toBe(rider);
 expect(world.snapshot().entities.some(e=>e.id===car.instanceId)).toBe(false);expect(r.options.vehicles).toHaveLength(0);expect(car.object.parent).toBeNull();
 world.step({},2);expect(world.snapshot().errors).toEqual([]);world.dispose();expect(dispose).toHaveBeenCalledTimes(1);
});
it('recreates a destroyed initial vehicle id without restoring its old mount, inactive state or reset baseline',async()=>{
 const first=nativeCar('car',0),world=await setup(undefined,{map:{...nativeCreationMap,spawns:[{id:'slot',name:'Car',vehicleId:'car',position:[0,.1,0],yaw:0,regionId:'road'}]},vehicles:[first],initialMountId:'car'}),r=world.humanoid!;world.step({},2);
 await world.execute({type:'entity.set-active',entityId:'car',isActive:false});expect(await world.execute({type:'entity.destroy',entityId:'car'})).toMatchObject({status:'applied'});
 const replacement=nativeCar('car',8);world.addVehicle(replacement);expect(world.getEntityState('car').isActive).toBe(true);expect(r.simulation.actor('player').vehicle).toBeUndefined();expect(r.simulation.vehicles[0]!.position.x).toBe(8);expect(r.actorController('player').body.isEnabled()).toBe(false);expect(await world.execute({type:'entity.set-active',entityId:'player',isActive:true})).toMatchObject({status:'applied'});world.step({},35);
 expect(r.approach('car')).toBe(true);expect(r.enter('car')).toBe(true);world.step({},40);await world.reset();expect(r.simulation.vehicles).toHaveLength(0);expect(r.simulation.actor('player').vehicle).toBeUndefined();expect(world.snapshot().entities.some(e=>e.id==='car')).toBe(false);
});
it('preserves a pre-baseline native creation at its explicit spawn through reset and map replacement',async()=>{
 const world=await setup(undefined,{map:nativeCreationMap}),r=world.humanoid!,car=nativeCar();world.addVehicle(car);world.step({},1);await world.reset();
 expect(r.simulation.vehicles).toHaveLength(1);expect(r.simulation.vehicles[0]!.position.x).toBe(4);expect(r.simulation.preparedVehicleSpawns.get(car.instanceId)!.position[0]).toBe(4);
 r.switchMap({...nativeCreationMap});expect(r.simulation.vehicles[0]!.position.x).toBe(4);world.step({},2);expect(world.snapshot().errors).toEqual([]);
});
it('rejects native creation conflicts and blocked placements before taking model ownership or leaking physics',async()=>{
 const world=await setup(undefined,{map:nativeCreationMap}),r=world.humanoid!,physics=r.environment.borrowPhysics().world;
 const bodies=physics.bodies.len(),colliders=physics.colliders.len(),count=world.snapshot().entities.length;
 for(const car of [nativeCar('player'),nativeCar('floor'),nativeCar('outside',100),nativeCar('on-player',-4),{...nativeCar('invalid'),spec:{...nativeCar().spec,yaw:NaN}}]){
  expect(()=>world.addVehicle(car)).toThrow();expect(car.object.parent).toBeNull();expect(r.options.vehicles).toHaveLength(0);expect(physics.bodies.len()).toBe(bodies);expect(physics.colliders.len()).toBe(colliders);expect(world.snapshot().entities).toHaveLength(count);
 }
 world.addVehicle(nativeCar());expect(()=>world.addVehicle(nativeCar('overlap'))).toThrow('HUMANOID_VEHICLE_SPAWN_BLOCKED');expect(r.options.vehicles).toHaveLength(1);
});
it('rolls back native staging when world registration fails, without disposing supplied visuals',async()=>{
 const world=await setup(undefined,{map:nativeCreationMap}),r=world.humanoid!,car=nativeCar(),engine=(world as unknown as {engine:import('./engine').WorldEngine}).engine;
 const before=car.object.position.clone(),physics=r.environment.borrowPhysics().world,colliders=physics.colliders.len();const register=vi.spyOn(engine,'addCharacter').mockImplementationOnce(()=>{throw Error('injected-registration-failure');});
 expect(()=>world.addVehicle(car)).toThrow('injected-registration-failure');expect(car.object.position).toEqual(before);expect(car.object.parent).toBeNull();expect(r.options.vehicles).toHaveLength(0);expect(r.simulation.preparedVehicleSpawns.size).toBe(0);expect(physics.colliders.len()).toBe(colliders);register.mockRestore();world.addVehicle(car);world.step({},1);expect(world.snapshot().errors).toEqual([]);
});
it('repeatedly creates and destroys native cars without retaining rigs, profiles or stale display samples',async()=>{
 const world=await setup(undefined,{map:nativeCreationMap}),r=world.humanoid!;world.step({},1);const physics=r.environment.borrowPhysics().world,bodies=physics.bodies.len(),colliders=physics.colliders.len();
 for(let n=0;n<20;n++){
  world.addVehicle(nativeCar());world.step({},2);expect(await world.execute({type:'entity.destroy',entityId:'created-car'})).toMatchObject({status:'applied'});
  expect(r.simulation.vehicles).toHaveLength(0);expect(r.options.vehicles).toHaveLength(0);expect(r.exportProfile().vehicles?.['created-car']).toBeUndefined();expect(physics.bodies.len()).toBe(bodies);expect(physics.colliders.len()).toBe(colliders);
 }
 world.step({},2);expect(world.snapshot().errors).toEqual([]);
});

it.each(['rover','plane','boat','submarine','horse','dragon','spacecraft'])('creates and releases %s using its existing native motion family',async preset=>{
 const spec=structuredClone(SPECS.find(v=>v.id===preset)!);spec.spawn=[8,.1,0];spec.yaw=0;
 const world=await setup(undefined,{map:{...nativeCreationMap,bounds:{min:[-100,-20,-100],max:[100,100,100]},regions:[{...nativeCreationMap.regions[0]!,modes:[spec.mode]}]}}),r=world.humanoid!;world.step({},1);const physics=r.environment.borrowPhysics().world,bodies=physics.bodies.len();
 world.addVehicle({instanceId:'new-vehicle',assetId:preset,spec,object:new THREE.Group()});expect(r.simulation.vehicles[0]!.spec.mode).toBe(spec.mode);world.step({},3);
 expect(await world.execute({type:'entity.destroy',entityId:'new-vehicle'})).toMatchObject({status:'applied'});expect(physics.bodies.len()).toBe(bodies);expect(r.simulation.vehicles).toHaveLength(0);expect(world.snapshot().errors).toEqual([]);
});
it('preserves moving peer interpolation when adding a native vehicle',async()=>{
 const {renderer}=rendererFixture(),world=await setup(renderer,{map:nativeCreationMap}),runtime=world.humanoid!;
 await world.execute({type:'humanoid.set-input',actorId:'player',input:{...emptyInput(),forward:1}});world.step({},20);
 const engine=(world as unknown as {engine:import('./engine').WorldEngine}).engine;let displayed:number[]=[];vi.mocked(renderer.render).mockImplementation(()=>{displayed=runtime.options.character.object.position.toArray();});
 await world.start();engine.render(.4);const before=[...displayed];world.addVehicle(nativeCar());engine.render(.4);expect(displayed).toEqual(before);expect(runtime.simulation.vehicles).toHaveLength(1);world.stop();
});

it('does not retain transient native roots across repeated reset cycles',async()=>{
 const world=await setup(undefined,{map:nativeCreationMap}),r=world.humanoid!,engine=(world as unknown as {engine:{retired:Set<unknown>}}).engine;world.step({},1);
 for(let n=0;n<8;n++){world.addVehicle(nativeCar());world.step({},1);await world.reset();expect(engine.retired.size).toBe(0);expect(r.options.vehicles).toHaveLength(0);expect(r.simulation.preparedVehicleSpawns.size).toBe(0);}
});


it.each(['simulation','actor','interaction','skills'] as const)('project lifecycle teardown continues independent native owners after a %s failure',async stage=>{
 const world=await setup(),r=world.humanoid!,peer=await r.createCharacter();peer.root.position.set(5,.04,0);world.addCharacter({id:'peer',humanoid:peer});world.step({},1);
 const first=r.simulation.actor('player'),second=r.simulation.actor('peer'),physics=r.environment.borrowPhysics().world;
 const ordinary=(r as unknown as {ordinaryPhysics:import('./physics').ThreePhysics}).ordinaryPhysics;
 const ordinaryDispose=ordinary.dispose.bind(ordinary),environmentDispose=r.environment.dispose.bind(r.environment);
 const ordinarySpy=vi.spyOn(ordinary,'dispose'),peerDispose=vi.spyOn(second,'dispose'),free=vi.spyOn(physics,'free'),rigRelease=vi.spyOn(r.environment,'releaseHumanoidRig');
 const marker=Error(`INJECTED_${stage}`),events:string[]=[];world.onDispose(()=>events.push('world callback'));
 const target=stage==='simulation'?r.simulation:stage==='actor'?first:stage==='interaction'?r.environment.interactions:first.controller.skills;
 const original=target.dispose.bind(target);const injected=vi.spyOn(target,'dispose').mockImplementation(()=>{if(stage==='interaction')r.environment.dispose();original();throw marker;});
 try{
  let caught:unknown;try{world.dispose();}catch(error){caught=error;}expect(caught).toBe(marker);
  expect(peerDispose).toHaveBeenCalledOnce();expect(ordinarySpy).toHaveBeenCalledOnce();expect(free).toHaveBeenCalledOnce();expect(rigRelease).toHaveBeenCalledTimes(2);expect(events).toEqual(['world callback']);
  world.dispose();r.dispose();expect(free).toHaveBeenCalledOnce();expect(injected).toHaveBeenCalledOnce();
 }finally{injected.mockRestore();if(!free.mock.calls.length){ordinaryDispose();environmentDispose();}}
});

it.each([undefined,null])('project lifecycle preserves a falsy original disposal failure (%s) after finishing cleanup',async marker=>{
 const world=await setup(),r=world.humanoid!,physics=r.environment.borrowPhysics().world,original=r.simulation.dispose.bind(r.simulation),free=vi.spyOn(physics,'free');
 vi.spyOn(r.simulation,'dispose').mockImplementation(()=>{original();throw marker;});
 let threw=false,caught:unknown;try{world.dispose();}catch(error){threw=true;caught=error;}
 expect(threw).toBe(true);expect(caught).toBe(marker);expect(free).toHaveBeenCalledOnce();expect(()=>world.dispose()).not.toThrow();
});
it('project lifecycle retains native owner disposal order on the successful path',async()=>{
 const world=await setup(),r=world.humanoid!,peer=await r.createCharacter();peer.root.position.set(5,.04,0);world.addCharacter({id:'peer',humanoid:peer});
 const internal=r as unknown as {releaseOrdinarySubstep:()=>void;ordinaryPhysics:import('./physics').ThreePhysics},order:string[]=[];
 const track=(target:{dispose:()=>void},name:string)=>{const original=target.dispose.bind(target);vi.spyOn(target,'dispose').mockImplementation(()=>{order.push(name);original();});};
 track(r.simulation,'simulation');track(r.simulation.actor('player'),'player');track(r.simulation.actor('peer'),'peer');
 const unsubscribe=internal.releaseOrdinarySubstep;vi.spyOn(internal,'releaseOrdinarySubstep').mockImplementation(()=>{order.push('unsubscribe');unsubscribe();});
 track(internal.ordinaryPhysics,'ordinary');track(r.environment,'environment');track(r.environment.interactions,'interactions');
 const physics=r.environment.borrowPhysics().world,free=physics.free.bind(physics);vi.spyOn(physics,'free').mockImplementation(()=>{order.push('free');free();});world.dispose();
 expect(order).toEqual(['simulation','player','peer','unsubscribe','ordinary','environment','interactions','free']);
});
