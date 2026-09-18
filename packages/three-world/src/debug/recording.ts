import {Euler,Vector3,Quaternion} from 'three';
import type {ThreeWorld,RuntimeSample,CameraDocument} from '../index.js';
import {type DebugArtifactStore,type DebugSourceIdentity} from './storage.js';

type InputSample=Extract<RuntimeSample,{kind:'fixed-input'}>;
type FrameSample=Extract<RuntimeSample,{kind:'rendered-frame'}>;
type State={position:readonly number[];cameraPosition:readonly number[];cameraQuaternion:readonly number[];mountedInstanceId:string|null;characterState:string};
type Event={sample:RuntimeSample;state?:State};
type Start={mapId:string;actorId:string;position:readonly[number,number,number];facingYawRadians:number;document:CameraDocument;viewId:string;orbit:{yawRadians:number;pitchRadians:number;distanceMeters?:number};profile:ReturnType<NonNullable<ThreeWorld['humanoid']>['exportProfile']>};
export interface DebugRecording {kind:'playground-input-recording';schemaVersion:1;id:string;source:DebugSourceIdentity;start:Start;firstTick:number;maximumSeconds:number;inputTicks:number;events:Event[];status:'recording'|'stopped'|'limit-reached'|'captured';invalidReason:string|null}
export interface DebugRecordingPort {
 world:ThreeWorld;canvas:HTMLCanvasElement;ready():boolean;mapId():string;
 pause():void|Promise<void>;reset():Promise<unknown>;clearInput():void;render(alpha?:number):void;onStateChange?(enabled:boolean):void;
}
const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(...a.map((n,i)=>n-b[i]!));
const failure=(error:unknown)=>({status:'failed',error:error instanceof Error?error.message:String(error)});
const schema=(properties:Record<string,unknown>={},required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
export function createDebugRecording(port:DebugRecordingPort,files:DebugArtifactStore){
 const world=port.world,canvas=port.canvas.ownerDocument.createElement('canvas'),context=canvas.getContext('2d');
 let enabled=false,disposed=false,busy=false,replaying=false,cancelled=false,lastError:string|null=null;
 let source:DebugSourceIdentity|undefined,recording:DebugRecording|undefined;
 let savedRecording:{recordingId:string;bundleId:string;replayable:boolean;inputTicks:number}|null=null;
 let replayOperation:{id:string;status:string;advancedTicks:number;result?:unknown}|undefined;
 let unsubscribe=()=>{};let observing=false;
 const recent:InputSample[]=[];
 let latest:{frame:FrameSample;snapshot:ReturnType<ThreeWorld['snapshot']>;camera:ReturnType<ThreeWorld['inspectCamera']>}|undefined;
 const ready=()=>{if(disposed||!port.ready())throw Error('DEBUG_WORLD_NOT_READY');};
 const reachLimit=()=>{
  recording!.status='limit-reached';
  void Promise.resolve().then(()=>port.pause()).catch(error=>{lastError=String(error);});
 };
 const state=():State=>{
  const snapshot=world.snapshot(),id=snapshot.controlledEntityId;
  if(!id)throw Error('DEBUG_CONTROLLED_ENTITY_REQUIRED');
  return {position:world.getEntityState(id).positionWorldMetersXYZ,cameraPosition:world.camera.getWorldPosition(new Vector3()).toArray(),cameraQuaternion:world.camera.getWorldQuaternion(new Quaternion()).toArray(),mountedInstanceId:snapshot.humanoid?.mountedInstanceId??null,characterState:JSON.stringify([snapshot.humanoid?.character.state,snapshot.humanoid?.character.stance,snapshot.humanoid?.surface.mode,snapshot.humanoid?.character.carrying,snapshot.humanoid?.character.seated])};
 };
 const observe=(sample:RuntimeSample)=>{
  if(disposed)return;
  try{
   if(sample.kind==='fixed-input'){
    if(enabled){if(sample.simulationTick<=(recent.at(-1)?.simulationTick??-1))recent.length=0;recent.push(sample);if(recent.length>600)recent.shift();}
    if(recording?.status==='recording'&&!replaying){
     if(sample.simulationTick!==recording.firstTick+recording.inputTicks+1)recording.invalidReason='simulation-tick-discontinuity';
     if(sample.controlledEntityId!==recording.start.actorId)recording.invalidReason='controlled-entity-changed';
     recording.events.push({sample,state:state()});recording.inputTicks++;
     if(recording.inputTicks*sample.deltaSeconds>=recording.maximumSeconds||recording.events.length>=20000)reachLimit();
    }
   }else{
    if(sample.simulationTick<(recent.at(-1)?.simulationTick??-1))recent.length=0;
    if(recording?.status==='recording'&&!replaying&&sample.simulationTick!==recording.firstTick+recording.inputTicks)recording.invalidReason='simulation-tick-discontinuity';
    if(enabled&&context&&sample.widthPixels>0&&sample.heightPixels>0){
     const ratio=Math.min(1,1600/sample.widthPixels,1600/sample.heightPixels),width=Math.max(1,Math.round(sample.widthPixels*ratio)),height=Math.max(1,Math.round(sample.heightPixels*ratio));
     if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
     context.drawImage(port.canvas,0,0,width,height);
     latest={frame:sample,snapshot:world.snapshot(),camera:world.inspectCamera()};
    }
    if(recording?.status==='recording'&&!replaying){
     recording.events.push({sample});
     if(recording.events.length>=20000)reachLimit();
    }
   }
  }catch(error){lastError=error instanceof Error?error.message:String(error);enabled=false;if(recording)recording.invalidReason=lastError;}
 };
 const ensureObservation=()=>{if(!observing){unsubscribe=world.onRuntimeSample(observe);observing=true;}};
 const inspect=()=>({enabled,busy,replaying,lastError,savedRecording:savedRecording?{...savedRecording}:null,replayOperation:replayOperation?structuredClone(replayOperation):null,recentInputTicks:recent.length,
  frame:latest?{frameId:latest.frame.frameId,simulationTick:latest.frame.simulationTick,widthPixels:canvas.width,heightPixels:canvas.height}:null,
  recording:recording?{id:recording.id,status:recording.status,events:recording.events.length,inputTicks:recording.inputTicks,
   elapsedSeconds:recording.inputTicks?recording.inputTicks*(recording.events.find(e=>e.sample.kind==='fixed-input')!.sample as InputSample).deltaSeconds:0,
   maximumSeconds:recording.maximumSeconds,invalidReason:recording.invalidReason,source:recording.source}:null});
 const run=async<T>(work:()=>Promise<T>)=>{
  if(busy)return failure(Error('DEBUG_RECORDING_BUSY'));busy=true;cancelled=false;
  try{ready();return await work();}catch(error){return failure(error);}finally{busy=false;port.onStateChange?.(enabled);}
 };
 const setHistory=(value:unknown)=>run(async()=>{
  const input=value as {enabled?:unknown};if(typeof input?.enabled!=='boolean')throw Error('DEBUG_INPUT_INVALID');
  if(input.enabled){source=await files.identity();enabled=true;ensureObservation();lastError=null;}
  else{enabled=false;latest=undefined;recent.length=0;if(recording?.status!=='recording'){unsubscribe();observing=false;}}
  return {status:'applied',...inspect(),busy:false};
 });
 const makeStart=():Start=>{
  const snapshot=world.snapshot(),camera=world.inspectCamera(),actor=snapshot.entities.find(entity=>entity.id===snapshot.controlledEntityId);
  if(!actor||!world.humanoid||snapshot.humanoid?.character.instanceId!==actor.id||snapshot.humanoid.mountedInstanceId||snapshot.humanoid.transition.remainingSeconds>0)throw Error('DEBUG_RECORDING_REQUIRES_ON_FOOT');
  if(camera.mode!=='follow'||!camera.document||!camera.intent||!camera.current)throw Error('DEBUG_RECORDING_REQUIRES_FOLLOW');
  const facing=new Vector3(0,0,1).applyEuler(new Euler(...actor.rotationLocalRadiansXYZ));
  return {mapId:port.mapId(),actorId:actor.id,position:[...actor.positionWorldMetersXYZ],facingYawRadians:Math.atan2(-facing.x,-facing.z),document:structuredClone(camera.document),viewId:camera.current.viewId,
   orbit:{yawRadians:camera.intent.yawRadians,pitchRadians:camera.intent.pitchRadians,...(camera.resolved?.kind==='first-person'?{}:{distanceMeters:camera.intent.distanceMeters})},profile:world.humanoid.exportProfile()};
 };
 const prepare=async(start:Start)=>{
  if(port.mapId()!==start.mapId)throw Error('DEBUG_RECORDING_MAP_MISMATCH');
  await port.pause();port.clearInput();await port.reset();await port.pause();port.clearInput();
  if(world.snapshot().controlledEntityId!==start.actorId)world.setControlledEntity(start.actorId);
  world.humanoid!.applyProfile(start.profile);
  if(!world.humanoid!.prepareCharacter(start.position,start.facingYawRadians+Math.PI))throw Error('DEBUG_RECORDING_START_BLOCKED');
  world.setCameraFollow({configuration:start.document});world.setCameraView(start.viewId);world.setCameraOrbit(start.orbit);port.render();
 };
 const start=(value:unknown)=>run(async()=>{
  const input=value as {maximumSeconds?:number};const seconds=input?.maximumSeconds??30;
  if(!Number.isFinite(seconds)||seconds<1||seconds>120)throw Error('DEBUG_RECORDING_DURATION_INVALID');
  const initial=makeStart(),identity=await files.identity();
  recording=undefined;await prepare(initial);
  const after=await files.identity();if(after.sourceHash!==identity.sourceHash)throw Error('DEBUG_SOURCE_CHANGED_DURING_PREPARATION');
  source=after;enabled=true;ensureObservation();recent.length=0;latest=undefined;
  recording={kind:'playground-input-recording',schemaVersion:1,id:crypto.randomUUID(),source:after,start:initial,firstTick:world.simulationTick,maximumSeconds:seconds,inputTicks:0,events:[],status:'recording',invalidReason:null};
  port.render();return {status:'prepared',...inspect(),busy:false,next:'Resume gameplay or use explicit debug steps. Start reset the scene baseline and leaves it paused.'};
 });
 const freezeBundle=(label:string,withImage:boolean)=>{
  if(withImage&&!latest)throw Error('DEBUG_FRAME_UNAVAILABLE: enable history and render a frame before capturing; capture never re-renders the scene.');
  const screenshotDataUrl=withImage?canvas.toDataURL('image/png'):undefined;
  const captured=withImage?structuredClone(latest):undefined;
  const trace=recording?structuredClone(recording):undefined;
  if(trace){
   if(trace.status==='recording')trace.status='captured';
   if(captured){
    const end=trace.events.findLastIndex(event=>event.sample.kind==='rendered-frame'&&event.sample.frameId===captured.frame.frameId);
    if(end>=0){trace.events=trace.events.slice(0,end+1);trace.inputTicks=trace.events.filter(event=>event.sample.kind==='fixed-input').length;trace.status='captured';}
   }
  }
  const metadata={kind:'playground-debug-incident',schemaVersion:1,label,createdAt:new Date().toISOString(),source:source?{...source}:null,mapId:port.mapId(),captureSurface:'world-renderer-canvas',
   frame:captured?.frame??null,image:captured?{widthPixels:canvas.width,heightPixels:canvas.height}:null,
   fixedSnapshot:captured?.snapshot??world.snapshot(),cameraInspection:captured?.camera??world.inspectCamera(),
   recentInputs:structuredClone(recent),recordingId:trace?.id??null,replayOperation:replayOperation?structuredClone(replayOperation):null,
   recordingCoversFrame:!!(trace&&captured&&trace.source.sourceHash===source?.sourceHash&&trace.events.some(event=>event.sample.kind==='rendered-frame'&&event.sample.frameId===captured.frame.frameId)),
   limits:['Fixed snapshot and interpolated displayed pose are separate fields.','This is not an arbitrary physics checkpoint. Replay restores the declared baseline and applies recorded SDK inputs.']};
  return {metadata,...(screenshotDataUrl?{screenshotDataUrl}:{}),...(trace?{recording:trace}:{})};
 };
 const saveFrozen=async(bundle:ReturnType<typeof freezeBundle>)=>{
  const identity=await files.identity();
  if(bundle.metadata.source&&identity.sourceHash!==bundle.metadata.source.sourceHash)throw Error('DEBUG_SOURCE_CHANGED');
  return files.save({...bundle,metadata:{...bundle.metadata,source:identity}});
 };

 const stop=()=>run(async()=>{
  if(!recording)throw Error('DEBUG_RECORDING_UNAVAILABLE');await port.pause();if(recording.status==='recording')recording.status='stopped';
  const bundle=freezeBundle('input recording',!!latest),saved=await saveFrozen(bundle);
  const trace=bundle.recording!;
  // Trace replayability is separate from whether it reproduces the cached screenshot.
  const replayable=!trace.invalidReason&&(trace.inputTicks>0||trace.events.some(e=>e.sample.kind==='rendered-frame'));
  savedRecording={recordingId:trace.id,bundleId:saved.id,replayable,inputTicks:trace.inputTicks};
  return {status:'saved',...saved,replayable,recording:inspect().recording};
 });
 const capture=(value:unknown)=>run(async()=>{
  const input=value as {label?:string;pause?:boolean};
  if(input?.label!==undefined&&(typeof input.label!=='string'||input.label.length>200)||input?.pause!==undefined&&typeof input.pause!=='boolean')throw Error('DEBUG_INPUT_INVALID');
  if(!enabled||!latest)throw Error('DEBUG_FRAME_UNAVAILABLE: enable debug history before reproducing.');
  const bundle=freezeBundle(input.label??'World issue',true);
  if(input.pause!==false)await port.pause();
  return {status:'saved',replayable:bundle.metadata.recordingCoversFrame&&!bundle.recording?.invalidReason,...await saveFrozen(bundle)};
 });
 const replay=async(value:unknown={})=>{
  if(busy)return failure(Error('DEBUG_RECORDING_BUSY'));busy=true;cancelled=false;
  try{ready();
  const input=value as {bundleId?:string;allowSourceChange?:boolean};
  if(input.allowSourceChange!==undefined&&typeof input.allowSourceChange!=='boolean')throw Error('DEBUG_INPUT_INVALID');
  if(input?.bundleId!==undefined){
   const loaded=await files.load(input.bundleId) as DebugRecording;
   if(loaded?.kind!=='playground-input-recording'||!['recording','stopped','limit-reached','captured'].includes(loaded.status)||loaded.schemaVersion!==1||!Number.isFinite(loaded.maximumSeconds)||loaded.maximumSeconds<1||loaded.maximumSeconds>120||!Array.isArray(loaded.events)||loaded.events.length>20000||!loaded.start||!loaded.source)throw Error('DEBUG_RECORDING_FILE_INVALID');
   const vector=(value:unknown,length:number)=>Array.isArray(value)&&value.length===length&&value.every(n=>typeof n==='number'&&Number.isFinite(n));
   if(!vector(loaded.start.position,3)||!Number.isFinite(loaded.start.facingYawRadians)||!Number.isInteger(loaded.firstTick))throw Error('DEBUG_RECORDING_START_INVALID');
   let ticks=0;
   for(const event of loaded.events){
    const sample=event?.sample;
    if(sample?.kind==='fixed-input'){
     ticks++;
     if(sample.simulationTick!==loaded.firstTick+ticks||!Number.isFinite(sample.deltaSeconds)||sample.deltaSeconds<=0||sample.deltaSeconds>.2||ticks*sample.deltaSeconds>loaded.maximumSeconds+.2||!sample.input||typeof sample.input!=='object'||!event.state||!vector(event.state.position,3)||!vector(event.state.cameraPosition,3)||!vector(event.state.cameraQuaternion,4))throw Error('DEBUG_RECORDING_INPUT_INVALID');
     const ratios=['moveXRatio','moveYRatio','moveZRatio','cameraYawRatio','cameraPitchRatio'];
     const deltas=['cameraYawDeltaRadians','cameraPitchDeltaRadians','cameraDistanceDeltaMeters'];
     for(const key of [...ratios,...deltas]){const number=(sample.input as Record<string,unknown>)[key];if(number!==undefined&&(typeof number!=='number'||!Number.isFinite(number)||ratios.includes(key)&&Math.abs(number)>1))throw Error('DEBUG_RECORDING_INPUT_INVALID');}
     for(const key of ['run','jump','jumpPressed','interact','interactPressed','cameraTogglePressed']){const flag=(sample.input as Record<string,unknown>)[key];if(flag!==undefined&&typeof flag!=='boolean')throw Error('DEBUG_RECORDING_INPUT_INVALID');}
     if(sample.input.humanoid)world.humanoid!.validateInput(sample.input.humanoid);
    }else if(sample?.kind==='rendered-frame'){
     if(!Number.isFinite(sample.interpolationAlpha)||sample.interpolationAlpha<0||sample.interpolationAlpha>1||!sample.camera||!vector(sample.camera.positionWorldMetersXYZ,3)||!vector(sample.camera.quaternionWorldXYZW,4))throw Error('DEBUG_RECORDING_FRAME_INVALID');
    }else throw Error('DEBUG_RECORDING_EVENT_INVALID');
   }
   if(ticks!==loaded.inputTicks||(!ticks&&!loaded.events.some(event=>event.sample.kind==='rendered-frame')))throw Error('DEBUG_RECORDING_INPUT_INVALID');
   recording=loaded;
  }
  if(!recording||recording.status==='recording'||recording.invalidReason)throw Error('DEBUG_RECORDING_NOT_REPLAYABLE');
  const identity=await files.identity();
  const sourceComparison={recordedSourceHash:recording.source.sourceHash,currentSourceHash:identity.sourceHash,mode:identity.sourceHash===recording.source.sourceHash?'same-source':'cross-version-check'};
  if(sourceComparison.mode!=='same-source'&&!input.allowSourceChange)throw Error('DEBUG_RECORDING_SOURCE_MISMATCH');
  const trace=structuredClone(recording);source=identity;enabled=true;ensureObservation();recent.length=0;replaying=true;
  const operation={id:crypto.randomUUID(),status:'running',advancedTicks:0} as NonNullable<typeof replayOperation>;replayOperation=operation;
  const execute=async()=>{let ticks=0;if(cancelled)return {status:'cancelled',advancedTicks:0};

   await prepare(trace.start);const startTick=world.simulationTick;
   for(const [index,event] of trace.events.entries()){
    if(cancelled)return {status:'cancelled',advancedTicks:ticks};
    if(event.sample.kind==='fixed-input'){
     port.clearInput();world.step(event.sample.input,1);ticks++;replayOperation!.advancedTicks=ticks;
     if(world.simulationTick!==startTick+ticks)throw Error('DEBUG_REPLAY_TICK_DIVERGED');
     const actual=state(),expected=event.state!;
     if(distance(actual.position,expected.position)>.02||distance(actual.cameraPosition,expected.cameraPosition)>.03||1-Math.abs(new Quaternion().fromArray(actual.cameraQuaternion).dot(new Quaternion().fromArray(expected.cameraQuaternion)))>1e-5||actual.mountedInstanceId!==expected.mountedInstanceId||actual.characterState!==expected.characterState)
      return {status:'diverged',inputTick:ticks,expected,actual};
    }else {
     port.render(event.sample.interpolationAlpha);const actual=latest?.frame,expected=event.sample;
     if(!actual||distance(actual.camera.positionWorldMetersXYZ,expected.camera.positionWorldMetersXYZ)>.03||1-Math.abs(new Quaternion().fromArray(actual.camera.quaternionWorldXYZW).dot(new Quaternion().fromArray(expected.camera.quaternionWorldXYZW)))>1e-5)
      return {status:'diverged',stage:'rendered-frame',inputTick:ticks,expected,actual:actual??null};
    }
    if(index%12===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
   return {status:'replayed',advancedTicks:ticks,recordingId:trace.id,errors:world.snapshot().errors};

  };
  void(async()=>{
    let result:Awaited<ReturnType<typeof execute>>|ReturnType<typeof failure>;
    try{result=await execute();}catch(error){result=failure(error);}
    try{if(!disposed)await port.pause();}catch(error){result=failure(error);}
    replaying=false;busy=false;operation.result={...result,sourceComparison};operation.status=result.status;
    if(!disposed)port.onStateChange?.(enabled);
  })();
  port.onStateChange?.(enabled);
  return {status:'started',replayId:operation.id,sourceComparison,next:'Poll inspect_debug_recording.replayOperation for completion; cancel_debug_replay interrupts it.'};
  }catch(error){busy=false;replaying=false;return failure(error);}
 };

 const tools=[
  {name:'inspect_debug_recording',description:'Read recording/history status without stepping or rendering.',inputSchema:schema(),annotations:{readOnlyHint:true},execute:inspect},
  {name:'set_debug_history',description:'Enable/disable bounded recent input history (600 ticks) and the latest displayed frame. Opt in before reproducing; captures may add diagnostic rendering-copy overhead.',inputSchema:schema({enabled:{type:'boolean'}},['enabled']),annotations:{readOnlyHint:false},execute:setHistory},
  {name:'capture_debug_incident',description:'Save the cached displayed frame, same-frame fixed state, source identity and recent consumed inputs through the host artifact store. Requires enabled history. Optionally pause (default true). Never re-renders or resets.',inputSchema:schema({label:{type:'string',maxLength:200},pause:{type:'boolean'}}),annotations:{readOnlyHint:false},execute:capture},
  {name:'start_debug_recording',description:'RESET the current scene baseline, reapply the current on-foot position, profile and follow-camera setup, and prepare a bounded reproducible input recording. Leaves paused; resume or step. This clears prior world progress.',inputSchema:schema({maximumSeconds:{type:'number',minimum:1,maximum:120,default:30}}),annotations:{readOnlyHint:false},execute:start},
  {name:'stop_debug_recording',description:'Pause, stop the current input recording and save its trace plus the latest captured frame through the host artifact store.',inputSchema:schema(),annotations:{readOnlyHint:false},execute:stop},
  {name:'replay_debug_recording',description:'RESET and replay the last stopped recording from its recorded baseline using real SDK input and recorded render interpolation. Returns a replayId immediately; poll inspect_debug_recording.replayOperation. Reject changed map and, by default, changed source; allowSourceChange explicitly runs a cross-version comparison retaining both identities. Report per-tick divergence and leave paused.',inputSchema:schema({bundleId:{type:'string',description:'Optional ID returned when saving a local recording; omit to replay the in-memory recording.'},allowSourceChange:{type:'boolean',default:false,description:'Explicitly compare saved inputs against changed code; retain both identities and report divergence, without inheriting original acceptance.'}}),annotations:{readOnlyHint:false},execute:replay},
  {name:'cancel_debug_replay',description:'Request cancellation of the current bounded replay; leaves paused at its last completed tick.',inputSchema:schema(),annotations:{readOnlyHint:false},execute:()=>{cancelled=true;return {status:'cancellation-requested'};}},
 ];
 return {inspect,setHistory,start,stop,capture,replay,tools,dispose:()=>{disposed=true;cancelled=true;unsubscribe();enabled=false;recent.length=0;latest=undefined;canvas.width=canvas.height=0;}};
}
