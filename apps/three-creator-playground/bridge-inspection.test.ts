import * as THREE from 'three';
import {afterEach,expect,it,vi} from 'vitest';
import {createWorld,DEFAULT_KEY_BINDINGS,type ThreeWorld} from '@worldkit/three';
import type {WorldDescription,WorldObservation} from '@worldkit/three';

const worlds:ThreeWorld[]=[];
afterEach(()=>{for(const world of worlds.splice(0))world.dispose();vi.unstubAllGlobals();vi.restoreAllMocks();});

async function fixture(){
 // Only the rendering/browser boundary is stubbed; registry, physics, observer,
 // description queries and snapshots are the actual SDK implementation.
 const renderer={domElement:{width:800,height:600},render(){},info:{memory:{geometries:0,textures:0},render:{calls:0}}} as unknown as THREE.WebGLRenderer;
 const world=await createWorld({scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),renderer,navigation:false});worlds.push(world);
 for(const id of ['hero','npc']){const object=new THREE.Group();object.position.set(id==='hero'?0:4,1,0);world.addCharacter({id,object,body:{heightMeters:1.8,radiusMeters:.3}});}
 world.setControlledEntity('hero');
 for(const id of ['hero','npc'])world.defineParameter({id:`${id}.visible`,description:`${id} visibility`,schema:{type:'boolean'},initialValue:true,writes:[{kind:'entity',entityId:id,channels:['visibility']}],plan:value=>[{type:'entity.set-visible',entityId:id,isVisible:value}]});
 vi.stubGlobal('window',new EventTarget());vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
 await world.start();world.stop();
 const observer=window.__WORLDKIT_EVAL__!;
 vi.resetModules();await import('./bridge.js');
 const host=window.__THREE_CREATOR_HOST__!;
 return {world,observer,host};
}

it('publishes SDK observer entity filters to remove unrelated entities and parameter contracts',async()=>{
 const {observer}=await fixture();
 const description=observer.capabilities!({entityIds:['npc']});
 expect(description.entities.map(entity=>entity.state.id)).toEqual(['npc']);
 expect(description.parameters.map(parameter=>parameter.id)).toEqual(['npc.visible']);
});

it('reads a snapshot without hierarchy traversal or optional diagnostics and leaves runtime state unchanged',async()=>{
 const {world,observer,host}=await fixture(),before=world.snapshot();
 observer.inspect=()=>{throw new Error('Optional diagnostics must not run');};
 vi.spyOn(observer.scene,'traverse').mockImplementation(()=>{throw new Error('Hierarchy must not be traversed');});
 const result=host.inspect({sections:['snapshot']});
 expect(result.snapshot).toEqual(before);
 expect(result.sample).toMatchObject({worldRevision:before.worldRevision,simulationTick:0,simulationSeconds:0,isRunning:false});
 expect(result.characterContinuity).toMatchObject({status:'not-applicable'});
 expect(result).not.toHaveProperty('objects');expect(result).not.toHaveProperty('diagnostics');expect(result).not.toHaveProperty('description');
 expect(world.snapshot()).toEqual(before);
});

it('preserves descriptor-text search while applying entity filters to the real SDK description',async()=>{
 const {host}=await fixture();
 const result=host.inspect({entityIds:['npc'],query:'actor.move-to',sections:['description']});
 expect(result.description!.entities.map(entity=>entity.state.id)).toEqual(['npc']);
 expect(result.description!.parameters.map(parameter=>parameter.id)).toEqual(['npc.visible']);
 expect(result).not.toHaveProperty('snapshot');expect(result).not.toHaveProperty('diagnostics');expect(result).not.toHaveProperty('objects');
});

it('keeps the omitted-sections full response and empty entity selection compatible',async()=>{
 const {host}=await fixture(),result=host.inspect({entityIds:[]});
 expect(result.description!.entities.map(entity=>entity.state.id)).toEqual(['hero','npc']);
 for(const key of ['player','camera','targets','snapshot','characterContinuity','description','commandsSupported','diagnostics','objects','renderer'])expect(result).toHaveProperty(key);
 expect((result.diagnostics as {snapshot:unknown}).snapshot).toEqual(result.snapshot);
});

it('filters legacy callbacks that ignore query arguments and reports unavailable raw samples as null',async()=>{
 const {observer,host}=await fixture(),description=observer.capabilities!();
 const {snapshot:_snapshot,inspect:_inspect,...legacy}=observer;
 const raw:WorldObservation={...legacy,capabilities:()=>description};
 window.__WORLDKIT_EVAL__=raw;
 const result=host.inspect({entityIds:['npc'],sections:['snapshot','description','diagnostics']});
 expect(result.description!.entities.map(entity=>entity.state.id)).toEqual(['npc']);
 expect(result.description!.parameters.map(parameter=>parameter.id)).toEqual(['npc.visible']);
 expect(result.sample).toEqual({worldRevision:null,simulationTick:null,simulationSeconds:null,isRunning:null});
 expect(result.snapshot).toBeNull();expect(result.diagnostics).toBeNull();
 expect(result.characterContinuity).toMatchObject({status:'unavailable'});
});

it('retains only related boarding observations for selected entities without altering legacy full output',async()=>{
 const {observer,host}=await fixture();
 const description:WorldDescription={...observer.capabilities!(),training:{
  inputGuide:{family:'character',fields:{}},controlState:{override:null,lastApplied:null,livePaused:true,clockOwner:'live'},characterCapabilities:[],keyBindings:DEFAULT_KEY_BINDINGS,
  boarding:{hero:{approachPositionWorldMetersXYZ:[0,0,0],eligible:true,reason:'ready',message:'Ready'},npc:{approachPositionWorldMetersXYZ:[4,0,0],eligible:false,reason:'out-of-reach',message:'Too far'}},
 }};
 // Legacy observer callbacks may return complete descriptions regardless of query.
 observer.capabilities=()=>description;
 expect(Object.keys(host.inspect().description!.training!.boarding)).toEqual(['hero','npc']);
 const selected=host.inspect({entityIds:['npc'],sections:['description']});
 expect(selected.description!.training!.boarding).toEqual({npc:{approachPositionWorldMetersXYZ:[4,0,0],eligible:false,reason:'out-of-reach',message:'Too far'}});
 expect(Object.keys(description.training!.boarding)).toEqual(['hero','npc']);
});

it('keeps absent boarding telemetry unknown when inspecting an older v2 runtime with an empty query',async()=>{
 const {observer,host}=await fixture();
 // Older workspace SDK v2 runtimes expose Training without boarding/controlState.
 const legacyDescription={...observer.capabilities!(),training:{inputGuide:{family:'character',fields:{}},characterCapabilities:[],keyBindings:DEFAULT_KEY_BINDINGS}} as unknown as WorldDescription;
 observer.capabilities=()=>legacyDescription;
 const result=host.inspect({});
 expect(result.description!.entities.map(entity=>entity.state.id)).toEqual(['hero','npc']);
 expect(result.description!.training).not.toHaveProperty('boarding');
 expect(result.description!.parameters.map(parameter=>parameter.id)).toEqual(['hero.visible','npc.visible']);
});
