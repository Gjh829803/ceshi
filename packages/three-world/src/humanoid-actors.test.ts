import {readFile} from 'node:fs/promises';
import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import catalog from '../../../assets/three-creator/asset-catalog.json';
import {createHumanoidWorld} from './humanoid';
import type {ThreeWorld} from './world';
import {emptyInput} from './humanoid-runtime/simulation';
import type {EnvironmentDefinition} from './humanoid-runtime/environment/types';

const worlds:ThreeWorld[]=[];
afterEach(()=>{for(const world of worlds.splice(0))world.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
const map:EnvironmentDefinition={id:'three-actors',name:'Three actors',description:'',bounds:{min:[-20,-5,-20],max:[20,10,20]},boxes:[{id:'floor',position:[0,-.5,0],size:[40,1,40]}],water:[],regions:[],spawns:[],playerSpawn:[-4,.04,0]};
async function setup(renderer?:THREE.WebGLRenderer){
  const paths=new Map(catalog.assets.find(a=>a.id==='humanoid.source-101')!.resources!.map(r=>[r.path,r.sourcePath]));
  vi.stubGlobal('ProgressEvent',class extends Event{constructor(type:string,init:object){super(type);Object.assign(this,init);}});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const uri=typeof input==='string'?input:input instanceof URL?input.href:input.url;const path=paths.get(decodeURIComponent(new URL(uri).pathname.slice(1)));if(!path)throw new Error(uri);return new Response(await readFile(path));});
  const world=await createHumanoidWorld({map,...(renderer?{renderer}:{}),resourceUrl:path=>`https://actors.test/${path}`});worlds.push(world);return world;
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
  const world=await setup(),runtime=world.humanoid!;world.step({},1);const count=runtime.environment.colliderCount;
  for(let n=0;n<50;n++){
    const actor=await runtime.createCharacter();actor.root.position.set(3,.04,0);
    const dispose=vi.spyOn(actor,'dispose'),uncache=vi.spyOn(actor.sourceCharacter!.mixer,'uncacheRoot');
    world.addCharacter({id:'temporary',humanoid:actor});world.step({},1);
    const receipt=await world.execute({type:'entity.despawn',entityId:'temporary'});
    expect(receipt.status,JSON.stringify(receipt)).toBe('applied');expect(dispose).toHaveBeenCalledOnce();expect(uncache).toHaveBeenCalledOnce();expect(runtime.environment.colliderCount).toBe(count);
    dispose.mockRestore();uncache.mockRestore();
  }
  expect(runtime.options.character.animation!.loaded).toBe(true);world.step({},1);
},30000);

it('rejects binding a live character into another world without damaging its owner',async()=>{
  const first=await setup(),second=await setup(),actor=await first.humanoid!.createCharacter();actor.root.position.set(3,.04,0);first.addCharacter({id:'a',humanoid:actor});
  const parent=actor.root.parent,pose=actor.root.position.clone();
  expect(()=>second.addCharacter({id:'b',humanoid:actor})).toThrow('HUMANOID_CHARACTER_ALREADY_OWNED');
  await expect(createHumanoidWorld({map,character:actor})).rejects.toThrow('HUMANOID_CHARACTER_ALREADY_OWNED');
  expect(actor.loaded).toBe(true);expect(actor.root.parent).toBe(parent);expect(actor.root.position.equals(pose)).toBe(true);first.step({},1);
  second.dispose();first.step({},1);expect(actor.loaded).toBe(true);
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

it('releases an asynchronously created instance when reset invalidates its request',async()=>{
  const world=await setup(),source=world.humanoid!.options.character.animation!,create=source.createInstance.bind(source);
  let resolve!:()=>void;const gate=new Promise<void>(done=>{resolve=done;});let dispose:ReturnType<typeof vi.spyOn>|undefined;
  vi.spyOn(source,'createInstance').mockImplementation(async()=>{await gate;const instance=await create();dispose=vi.spyOn(instance,'dispose');return instance;});
  const pending=world.humanoid!.createCharacter();await world.reset();resolve();
  await expect(pending).rejects.toThrow('HUMANOID_ACTOR_LOAD_STALE');expect(dispose).toHaveBeenCalledOnce();
});

it('prepares Episode on the selected NPC and keeps the original player at its baseline',async()=>{
  const win=new EventTarget(),doc=Object.assign(new EventTarget(),{defaultView:win,activeElement:null,body:{},documentElement:{},hidden:false});
  Object.assign(win,{document:doc,performance:globalThis.performance});vi.stubGlobal('window',win);vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const canvas=Object.assign(new EventTarget(),{width:800,height:600,ownerDocument:doc,getAttribute:()=>null,removeAttribute:()=>{},setAttribute:()=>{},style:{getPropertyValue:()=>'',getPropertyPriority:()=>'',setProperty:()=>{},removeProperty:()=>{}},toDataURL:()=> 'data:image/png;base64,dGVzdA=='});
  let ratio=1;const size=new THREE.Vector2(800,600);
  const renderer={shadowMap:{enabled:false,type:THREE.PCFShadowMap,needsUpdate:false},domElement:canvas,render:vi.fn(),getSize:(out:THREE.Vector2)=>out.copy(size),getPixelRatio:()=>ratio,setPixelRatio:(value:number)=>{ratio=value;},setSize:(x:number,y:number)=>{size.set(x,y);canvas.width=x*ratio;canvas.height=y*ratio;}} as unknown as THREE.WebGLRenderer;
  const world=await setup(renderer),actor=await world.humanoid!.createCharacter();actor.root.position.set(3,.04,0);world.addCharacter({id:'a',humanoid:actor});world.setControlledEntity('a');world.setCameraFollow({targetEntityId:'a'});world.step({},0);
  await world.start();world.stop();
  const episode=(win as unknown as {__WORLDKIT_EVAL__:import('./contracts').WorldObservation}).__WORLDKIT_EVAL__.episode!;
  await episode.prepareSegment({positionWorldMetersXYZ:[3,.03,5],facingYawRadians:0},{widthPixels:640,heightPixels:360});
  expect(world.getEntityState('a').positionWorldMetersXYZ[2]).toBeCloseTo(5);expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeCloseTo(0);
  expect(world.humanoid!.cameraTargetId).toBe('a');episode.advance({moveZRatio:-1},30);expect(world.getEntityState('a').positionWorldMetersXYZ[2]).toBeLessThan(5);
  episode.release();await world.reset();expect(world.humanoid!.cameraTargetId).toBe('a');
});
