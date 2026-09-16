import {afterEach,expect,it,vi} from 'vitest';
import {Group,Vector3,type WebGLRenderer} from 'three';
import {createWorld,createHumanoidCameraDocument,emptyHumanoidInput,type RuntimeSample,type ThreeWorld} from './index';

const worlds:ThreeWorld[]=[];
afterEach(()=>{for(const world of worlds.splice(0))world.dispose();vi.restoreAllMocks();});
async function fixture(withRenderer=false){
 const renderer=withRenderer?{domElement:{width:320,height:240},shadowMap:{enabled:false,type:0},render:vi.fn()}:undefined;
 const world=await createWorld({...(renderer?{renderer:renderer as unknown as WebGLRenderer}:{}),navigation:false,assetDefinitions:{},humanoid:{
  map:{id:'observations',name:'Observations',description:'',bounds:{min:[-20,-5,-20],max:[20,20,20]},boxes:[{id:'floor',position:[0,-.5,0],size:[40,1,40]}],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]},
  character:{instanceId:'person',object:new Group()},vehicles:[],
 }});worlds.push(world);world.setCameraFollow({configuration:createHumanoidCameraDocument('person')});world.step({},1);return world;
}
it('records consumed native overrides and one-shot pointer deltas without changing the clock',async()=>{
 const world=await fixture(),samples:RuntimeSample[]=[],before=world.snapshot();
 const release=world.onRuntimeSample(sample=>samples.push(sample));
 expect(world.snapshot()).toEqual(before);
 world.humanoid!.setInput({...emptyHumanoidInput(),forward:1});
 world.step({cameraYawDeltaRadians:.2,cameraPitchDeltaRadians:.1,cameraDistanceDeltaMeters:-.4},3);
 const inputs=samples.filter(sample=>sample.kind==='fixed-input');
 expect(inputs).toHaveLength(3);expect(inputs.map(sample=>sample.simulationTick)).toEqual([2,3,4]);
 expect(inputs.map(sample=>sample.input.cameraYawDeltaRadians)).toEqual([.2,0,0]);
 expect(inputs[0]!.input).toMatchObject({cameraPitchDeltaRadians:.1,cameraDistanceDeltaMeters:-.4,humanoid:{forward:1}});
 release();world.step({},1);expect(samples).toHaveLength(3);
});
it('replays exact consumed inputs through the same SDK owner from the same reset start',async()=>{
 const world=await fixture(),samples:Extract<RuntimeSample,{kind:'fixed-input'}>[]=[];
 const release=world.onRuntimeSample(sample=>{if(sample.kind==='fixed-input')samples.push(sample);});
 world.step({moveXRatio:1,cameraYawDeltaRadians:.5,cameraPitchRatio:.4},15);
 world.step({moveZRatio:-1,cameraYawRatio:-.3},15);
 const expected=world.snapshot(),camera=world.inspectCamera().current;release();
 await world.reset();world.step({},1);
 for(const sample of samples)world.step(sample.input,1);
 expect(world.snapshot().simulationTick).toBe(expected.simulationTick);
 const position=world.getEntityState('person').positionWorldMetersXYZ;
 const end=expected.entities.find(entity=>entity.id==='person')!.positionWorldMetersXYZ;
 expect(Math.hypot(...position.map((n,i)=>n-end[i]!))).toBeLessThan(1e-5);
 expect(new Vector3(...world.inspectCamera().current!.positionWorldMetersXYZ).distanceTo(new Vector3(...camera!.positionWorldMetersXYZ))).toBeLessThan(1e-10);
});
it('isolates observer payloads and failures and captures rendered camera transforms without stepping',async()=>{
 const world=await fixture(true),warnings=vi.spyOn(console,'warn').mockImplementation(()=>{}),samples:RuntimeSample[]=[];
 world.onRuntimeSample(()=>{throw Error('diagnostic failure');});
 world.onRuntimeSample(sample=>{if(sample.kind==='fixed-input')(sample.input as {cameraYawDeltaRadians:number}).cameraYawDeltaRadians=99;});
 world.onRuntimeSample(sample=>samples.push(sample));
 world.step({cameraYawDeltaRadians:.2},1);world.step({},1);
 expect(warnings).toHaveBeenCalledTimes(1);expect(world.snapshot().errors).toEqual([]);
 expect(samples[0]).toMatchObject({kind:'fixed-input',input:{cameraYawDeltaRadians:.2}});
 const before=world.snapshot(),pose=world.camera.getWorldPosition(new Vector3()).toArray();world.render();
 expect(world.snapshot()).toEqual(before);
 expect(samples.at(-1)).toMatchObject({kind:'rendered-frame',simulationTick:before.simulationTick,camera:{positionWorldMetersXYZ:pose}});
});
it('rejects nonfinite deltas before any simulation state changes',async()=>{
 const world=await fixture(),before=world.snapshot();
 expect(()=>world.step({cameraYawDeltaRadians:Infinity})).toThrow('WORLD_INPUT_INVALID');
 expect(()=>world.step({cameraDistanceDeltaMeters:NaN})).toThrow('WORLD_INPUT_INVALID');
 expect(world.snapshot()).toEqual(before);
});
