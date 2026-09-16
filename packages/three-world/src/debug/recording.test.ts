import {afterEach,expect,it,vi} from 'vitest';
import {Group,type WebGLRenderer} from 'three';
import {createWorld,createHumanoidCameraDocument} from '@worldkit/three';
import {createDebugRecording,type DebugRecording} from '@worldkit/three/debug';
const cleanups:(()=>void)[]=[];
afterEach(()=>{for(const work of cleanups.splice(0).reverse())work();});
async function fixture(withRenderer=false){
 const renderer=withRenderer?{domElement:{width:320,height:240},shadowMap:{enabled:false,type:0},render:vi.fn()}:undefined;
 const world=await createWorld({...(renderer?{renderer:renderer as unknown as WebGLRenderer}:{}),navigation:false,assetDefinitions:{},humanoid:{map:{id:'test',name:'test',description:'',bounds:{min:[-20,-5,-20],max:[20,20,20]},boxes:[{id:'floor',position:[0,-.5,0],size:[40,1,40]}],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]},character:{instanceId:'person',object:new Group()},vehicles:[]}});
 cleanups.push(()=>world.dispose());world.setCameraFollow({configuration:createHumanoidCameraDocument('person')});world.step({},1);
 const source={head:'a'.repeat(40),sourceHash:'b'.repeat(64),serverId:'test',revision:1};let saved:DebugRecording|undefined;
 const files={identity:vi.fn(async()=>({...source})),save:vi.fn(async(bundle:{recording?:unknown})=>{saved=structuredClone(bundle.recording) as DebugRecording;return {id:'saved',directory:'/test',files:{}};}),load:vi.fn(async()=>saved)};
 const canvas={ownerDocument:{createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>'data:image/png;base64,AAAA',width:0,height:0})}} as unknown as HTMLCanvasElement;
 const pause=vi.fn(()=>world.stop());
 const recorder=createDebugRecording({world,canvas,ready:()=>true,mapId:()=> 'test',pause,reset:()=>world.reset(),clearInput:()=>world.humanoid!.clearInput(),render:alpha=>world.render(alpha)},files);
 cleanups.push(()=>recorder.dispose());return {world,recorder,files,source,pause,saved:()=>saved};
}
it('records and replays native movement plus camera deltas from a declared reset start',async()=>{
 const f=await fixture();expect(await f.recorder.start({maximumSeconds:10})).toMatchObject({status:'prepared'});
 f.world.step({moveXRatio:1,cameraYawDeltaRadians:.4,cameraPitchRatio:.2},20);f.world.render(.4);
 f.world.step({moveZRatio:-1,cameraYawRatio:-.4},20);f.world.render(.6);
 const end=f.world.getEntityState('person').positionWorldMetersXYZ;
 expect(await f.recorder.stop()).toMatchObject({status:'saved'});expect(f.saved()?.inputTicks).toBe(40);
 expect(await f.recorder.replay()).toMatchObject({status:'started'});
 await vi.waitFor(()=>expect(f.recorder.inspect().replayOperation?.result).toMatchObject({status:'replayed',advancedTicks:40}));
 await vi.waitFor(()=>expect(f.recorder.inspect().busy).toBe(false));
 expect(f.world.getEntityState('person').positionWorldMetersXYZ).toEqual(end);
 expect(await f.recorder.replay({bundleId:'saved'})).toMatchObject({status:'started'});
 await vi.waitFor(()=>expect(f.recorder.inspect().replayOperation?.result).toMatchObject({status:'replayed',advancedTicks:40}));
 await vi.waitFor(()=>expect(f.recorder.inspect().busy).toBe(false));
 expect(f.files.load).toHaveBeenCalledWith('saved');
});
it('rejects changed source before resetting the current world and refuses unavailable frames without rendering',async()=>{
 const f=await fixture();await f.recorder.start({maximumSeconds:1});f.world.step({moveXRatio:1},2);await f.recorder.stop();
 f.source.sourceHash='c'.repeat(64);const before=f.world.snapshot();
 expect(await f.recorder.replay()).toMatchObject({status:'failed',error:'DEBUG_RECORDING_SOURCE_MISMATCH'});expect(f.world.snapshot()).toEqual(before);
 expect(await f.recorder.replay({allowSourceChange:true})).toMatchObject({status:'started',sourceComparison:{mode:'cross-version-check'}});
 await vi.waitFor(()=>expect(f.recorder.inspect().replayOperation?.result).toMatchObject({status:'replayed',sourceComparison:{recordedSourceHash:'b'.repeat(64),currentSourceHash:'c'.repeat(64)}}));
 await vi.waitFor(()=>expect(f.recorder.inspect().busy).toBe(false));
 const render=vi.spyOn(f.world,'render');
 expect(await f.recorder.capture({})).toMatchObject({status:'failed'});expect(render).not.toHaveBeenCalled();
});
it('detects discontinuous clocks and invalid stored inputs instead of falsely replaying',async()=>{
 const f=await fixture(true);await f.recorder.start({maximumSeconds:1});f.world.step({},2);await f.world.reset();
 expect(f.recorder.inspect().recording?.invalidReason).toBe('simulation-tick-discontinuity');f.world.step({},1);
 expect(f.recorder.inspect().recording?.invalidReason).toBe('simulation-tick-discontinuity');
 await f.recorder.stop();expect(await f.recorder.replay()).toMatchObject({status:'failed',error:'DEBUG_RECORDING_NOT_REPLAYABLE'});
 const data=f.saved()!;data.invalidReason=null;(data.events.find(event=>event.sample.kind==='fixed-input')!.sample as {simulationTick:number}).simulationTick=999;
 f.files.load.mockResolvedValue(data);const before=f.world.snapshot();
 expect(await f.recorder.replay({bundleId:'saved'})).toMatchObject({status:'failed',error:'DEBUG_RECORDING_INPUT_INVALID'});expect(f.world.snapshot()).toEqual(before);
});

it('retains a terminal cancellation result and releases the replay lock',async()=>{
 const f=await fixture();await f.recorder.start({maximumSeconds:3});f.world.step({moveXRatio:1},120);await f.recorder.stop();
 expect(await f.recorder.replay()).toMatchObject({status:'started'});
 f.recorder.tools.find(tool=>tool.name==='cancel_debug_replay')!.execute({});
 await vi.waitFor(()=>expect(f.recorder.inspect().replayOperation?.status).toBe('cancelled'));
 expect(f.recorder.inspect().busy).toBe(false);expect(f.world.snapshot().isRunning).toBe(false);
});
it('bounds the recorded prefix when a caller advances more than its duration limit',async()=>{
 const f=await fixture();await f.recorder.start({maximumSeconds:1});f.world.step({moveXRatio:1},120);
 await vi.waitFor(()=>expect(f.recorder.inspect().recording?.status).toBe('limit-reached'));
 expect(f.recorder.inspect().recording?.inputTicks).toBe(60);
 await f.recorder.stop();expect(f.saved()?.inputTicks).toBe(60);
});

it('checks rendered camera samples as well as fixed simulation state',async()=>{
 const f=await fixture(true);await f.recorder.start({maximumSeconds:2});f.world.step({cameraYawRatio:.5},12);f.world.render(.3);await f.recorder.stop();
 const data=f.saved()!;const frame=data.events.filter(event=>event.sample.kind==='rendered-frame').at(-1)!.sample;
 if(frame.kind!=='rendered-frame')throw Error('fixture');
 (frame.camera.positionWorldMetersXYZ as unknown as number[])[0]!+=1;
 f.files.load.mockResolvedValue(data);expect(await f.recorder.replay({bundleId:'saved'})).toMatchObject({status:'started'});
 await vi.waitFor(()=>expect(f.recorder.inspect().replayOperation?.result).toMatchObject({status:'diverged',stage:'rendered-frame'}));
 expect(f.recorder.inspect().busy).toBe(false);
});

it('saves a replayable prefix ending at the captured frame, without re-rendering newer ticks',async()=>{
 const f=await fixture(true);await f.recorder.start({maximumSeconds:2});f.world.step({moveXRatio:1},12);f.world.render(.5);f.world.step({moveXRatio:1},2);
 const render=vi.spyOn(f.world,'render');
 expect(await f.recorder.capture({pause:true})).toMatchObject({status:'saved',replayable:true});expect(render).not.toHaveBeenCalled();
 expect(f.saved()).toMatchObject({status:'captured',inputTicks:12});expect(f.recorder.inspect().recording?.inputTicks).toBe(14);
 expect(f.files.save.mock.calls.at(-1)![0]).toMatchObject({metadata:{frame:{simulationTick:12},fixedSnapshot:{simulationTick:12},recordingCoversFrame:true}});
 expect(await f.recorder.replay({bundleId:'saved'})).toMatchObject({status:'started'});
 await vi.waitFor(()=>expect(f.recorder.inspect().replayOperation?.result).toMatchObject({status:'replayed',advancedTicks:12}));
});
