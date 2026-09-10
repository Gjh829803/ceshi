import {readFile} from 'node:fs/promises';
import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {Raw} from '@recast-navigation/core';
import type RAPIER from '@dimforge/rapier3d-compat';
import catalog from '../../../assets/three-creator/asset-catalog.json';
import {createHumanoidWorld} from './humanoid';
import type {ThreeWorld} from './world';
import {emptyInput} from './humanoid-runtime/simulation';
import {createRoadVehicleSpec} from './humanoid-runtime/road-vehicle';
import {Character} from './humanoid-runtime/character';
import type {AssetDefinition} from './engine-contracts';
import type {EnvironmentDefinition} from './humanoid-runtime/environment/types';

const worlds:ThreeWorld[]=[];
afterEach(()=>{for(const world of worlds.splice(0))world.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
const map:EnvironmentDefinition={id:'three-actors',name:'Three actors',description:'',bounds:{min:[-20,-5,-20],max:[20,10,20]},boxes:[{id:'floor',position:[0,-.5,0],size:[40,1,40]}],water:[],regions:[],spawns:[],playerSpawn:[-4,.04,0]};
async function setup(renderer?:THREE.WebGLRenderer,options:Partial<Parameters<typeof createHumanoidWorld>[0]>={}){
  const paths=new Map(catalog.assets.find(a=>a.id==='humanoid.source-101')!.resources!.map(r=>[r.path,r.sourcePath]));
  vi.stubGlobal('ProgressEvent',class extends Event{constructor(type:string,init:object){super(type);Object.assign(this,init);}});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const uri=typeof input==='string'?input:input instanceof URL?input.href:input.url;const path=paths.get(decodeURIComponent(new URL(uri,'https://actors.test/').pathname.slice(1)))??catalog.assets.find(asset=>uri.includes(asset.sha256))?.sourcePath;if(!path)throw new Error(uri);return new Response(await readFile(path));});
  const world=await createHumanoidWorld({map,...options,...(renderer?{renderer}:{}),resourceUrl:path=>`https://actors.test/${path}`});worlds.push(world);return world;
}

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
  world.setCameraFollow({targetEntityId:'a'});expect(runtime.cameraTargetId).toBe('a');
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
  const win=new EventTarget(),doc=Object.assign(new EventTarget(),{defaultView:win,activeElement:null,body:{},documentElement:{},hidden:false});
  Object.assign(win,{document:doc,performance:globalThis.performance});vi.stubGlobal('window',win);vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const canvas=Object.assign(new EventTarget(),{width:800,height:600,ownerDocument:doc,getAttribute:()=>null,removeAttribute:()=>{},setAttribute:()=>{},style:{getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty:()=>{},removeProperty:()=>{}},toDataURL:()=> 'data:image/png;base64,dGVzdA=='});
  let ratio=1;const size=new THREE.Vector2(800,600);
  const renderer={shadowMap:{enabled:false,type:THREE.PCFShadowMap,needsUpdate:false},domElement:canvas,render:vi.fn(),getSize:(out:THREE.Vector2)=>out.copy(size),getPixelRatio:()=>ratio,setPixelRatio:(value:number)=>{ratio=value;},setSize:(x:number,y:number)=>{size.set(x,y);canvas.width=x*ratio;canvas.height=y*ratio;}} as unknown as THREE.WebGLRenderer;
  const world=await setup(renderer,{vehicles:[{instanceId:'car',assetId:'custom.car',spec:createRoadVehicleSpec('car'),object:new THREE.Group()}]}),actor=await world.humanoid!.createCharacter();actor.root.position.set(3,.04,0);world.addCharacter({id:'a',humanoid:actor});world.setControlledEntity('a');world.setCameraFollow({targetEntityId:'a'});world.step({},0);
  await world.start();world.stop();
  const episode=(win as unknown as {__WORLDKIT_EVAL__:import('./contracts').WorldObservation}).__WORLDKIT_EVAL__.episode!;
  expect(episode.capabilities()).toMatchObject({controlledEntityId:'a',worldBounds:{minimumWorldMetersXYZ:map.bounds.min,maximumWorldMetersXYZ:map.bounds.max}});
  await episode.prepareSegment({positionWorldMetersXYZ:[3,.03,5],facingYawRadians:0},{widthPixels:640,heightPixels:360});
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
  const definition=catalog.assets.find(asset=>asset.id==='humanoid.source-101')! as unknown as AssetDefinition;
  const world=await setup(undefined,{assetDefinitions:{[definition.id]:definition}}),asset=await world.assets.load(definition.id);asset.object.position.set(5,.04,0);
  world.addCharacter({id:'asset-actor',asset});await world.start();world.stop();
  const move=await world.execute({type:'actor.move-to',entityId:'asset-actor',targetPositionWorldMetersXYZ:[5,0,5]});expect(move.status).toBe('accepted');world.step({},60);
  expect(world.getEntityState('asset-actor').positionWorldMetersXYZ[2],JSON.stringify({move,state:world.getEntityState('asset-actor'),operation:move.status==='accepted'?world.operations.get(move.operationId):null})).toBeGreaterThan(1);expect(world.getEntityState('asset-actor').animation).toMatchObject({actionId:'walk'});expect(world.getEntityState('asset-actor').animation!.timeSeconds).toBeGreaterThan(.1);
  await world.execute({type:'actor.stop',entityId:'asset-actor'});expect((await world.execute({type:'entity.play-action',entityId:'asset-actor',actionId:'jump',playback:'once'})).status).toBe('applied');world.step({},10);
  expect(world.getEntityState('asset-actor').animation?.actionId).toBe('jump');await world.reset();expect(world.getEntityState('asset-actor').animation).toMatchObject({actionId:'idle',timeSeconds:0});
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
