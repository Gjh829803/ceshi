import {cp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import type {WorldSnapshot,WorldInput,WorldObservation,EpisodeStart} from '@worldkit/three';
import {ThreeCreatorTools} from './tools.js';
import {prepareEpisodeSource} from '../three-episode/source.js';
import {openEpisodeBrowser,type BrowserSession} from '../three-episode/browser.js';
import {frameSimulationTick} from '../three-episode/capture.js';
import {createRenderedFrameEncoder,inspectRenderedVideo} from '../lib/rendered-frame-encoder.js';

const exec=promisify(execFile);
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const imageBytes=(data:string)=>Buffer.from(data.split(',')[1]!,'base64');
const viewport={widthPixels:1280,heightPixels:720};
const start:EpisodeStart={positionWorldMetersXYZ:[0,.03,0],facingYawRadians:0,training:{vehicleInstanceId:'horse-1',mounted:true,cameraMode:0}};
const creatorMilestones={'creator-approach.png':1.5,'creator-entry.png':4,'creator-turn.png':8,'creator-post-exit-walk.png':20,'creator-reset.png':22};
type CreatorReport=Awaited<ReturnType<ThreeCreatorTools['playtest']>>;
type TrainingSnapshot=NonNullable<WorldSnapshot['training']>;
interface TraceSample {wallSeconds:number;positionMetersXYZ:number[];velocityMetersPerSecondXYZ:number[];training:TrainingSnapshot|null}
interface CreatorTrace {samples:TraceSample[]}
interface Posture {mountedInstanceId:string|null;pelvisErrorMeters:number|null;logicalRootScales:number[][];loaded:boolean[]}
interface EpisodeTraceFrame {frameIndex:number;simulationTick:number;snapshot:WorldSnapshot;input:WorldInput;posture:Posture;imageSha256:string}
interface CaptureResult {image:string;panelOrder:string[];frontDirectionWorldXYZ:number[];frontYawRadians:number;bounds:unknown}
interface AcceptanceWindow {
 __WORLDKIT_EVAL__?:WorldObservation;
 __MOUNTED_DIAGNOSTICS__:()=>Posture;
 __THREE_CREATOR_HOST__:{capture(view:'entity-triview',ids:string[],yaw:number):CaptureResult};
}
interface Output {root:string;json(name:string,value:unknown):Promise<void>}
function option(name:string){const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];}
async function createOutput(root:string):Promise<Output>{
 await mkdir(root,{recursive:true});if((await readdir(root)).length)throw new Error('MOUNTED_OUTPUT_NOT_EMPTY');
 return {root,json:async(name,value)=>{await writeFile(path.join(root,name),JSON.stringify(value,null,2)+'\n');}};
}
function progress(output:Output,stage:string,details:object={}){console.log(JSON.stringify({stage,...details,output:output.root}));}

function verifyCreatorRoute(trace:CreatorTrace,report:CreatorReport){
 const samples=trace.samples,mounted=samples.filter(s=>s.training?.mountedInstanceId==='horse-1');
 const gallop=mounted.filter(s=>s.training?.vehicleDynamics.some(v=>v.instanceId==='horse-1'&&v.creature?.gait==='gallop'));
 if(!mounted.length||!samples.some(s=>s.training?.transition.kind==='enter')||!samples.some(s=>s.training?.transition.kind==='exit')||!gallop.length)throw new Error('MOUNTED_ROUTE_NOT_OBSERVED');
 const gallopSeconds=gallop.at(-1)!.wallSeconds-gallop[0]!.wallSeconds;
 if(gallopSeconds<3)throw new Error('SUSTAINED_GALLOP_NOT_OBSERVED');
 const lastMounted=mounted.at(-1)!.wallSeconds;
 if(!samples.some(s=>s.wallSeconds>lastMounted&&s.training?.mountedInstanceId===null&&Math.hypot(...s.velocityMetersPerSecondXYZ)>1))throw new Error('POST_EXIT_WALK_NOT_OBSERVED');
 if(!report.hostActionEvents.some(event=>event.type==='lifecycle'&&event.action==='reset'))throw new Error('RESET_NOT_OBSERVED');
 return {firstMountedSeconds:mounted[0]!.wallSeconds,lastMountedSeconds:lastMounted,gallopSeconds,gallopSampleCount:gallop.length};
}
async function extractCreatorMilestones(output:Output,report:CreatorReport){
 if(!report.videoPath)throw new Error('CREATOR_VIDEO_MISSING');
 const saved:Record<string,number>={};
 for(const [filename,seconds]of Object.entries(creatorMilestones)){
  if(seconds>=report.actualWallSeconds)continue;
  await exec('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(seconds),'-i',report.videoPath,'-frames:v','1',path.join(output.root,filename)]);
  saved[filename]=seconds;
 }
 await output.json('creator-milestones.json',{kind:'follow-camera-milestones',videoPath:report.videoPath,wallSecondsByFile:saved});
}
async function captureCreator(output:Output,debugSeconds?:number){
 const workspace=path.join(output.root,'author');await cp('examples/three-creator/horse-riding',workspace,{recursive:true});
 const service=new ThreeCreatorTools(workspace,'three-sdk');
 try{
  const candidate=await service.compiler.prepare();
  await output.json('manifest.json',{gitSha:(await exec('git',['rev-parse','HEAD'])).stdout.trim(),sourceHash:candidate.sourceHash,worldBuildHash:candidate.worldBuildHash,runtimeHash:candidate.runtimeHash,assetIds:['humanoid.source-101','training.horse'],requiredHorseClipNames:['Idle','Walk','Gallop'],clipEvidence:'Required names enforced by TrainingHorse.load; not a measured runtime clip inventory.',inputPlanHash:hash(await readFile(path.join(workspace,'episode.json'))),providerSubmissions:0});
  const inspected=await service.inspect();await output.json('opening-inspect.json',inspected);
  if(inspected.pageErrors.length||inspected.blockedNetworkRequests.length)throw new Error('MOUNTED_START_FAILED');
  const operation=service.start('world.playtest',id=>service.playtest(id,debugSeconds));
  let report:CreatorReport;
  for(;;){
   const status=await service.getOperation(operation.operationId,25);
   progress(output,'creator',{status:status.status,progress:status.progress});
   if(status.status==='failed')throw new Error(status.error);
   if(status.status==='succeeded'){report=status.result as CreatorReport;break;}
  }
  await output.json('creator-playtest.json',report);
  if(!report.videoPath)throw new Error('CREATOR_VIDEO_MISSING');
  const trace=JSON.parse(await readFile(path.join(path.dirname(report.videoPath),'trace.json'),'utf8')) as CreatorTrace;
  await output.json('creator-trace.json',trace);await extractCreatorMilestones(output,report);
  if(debugSeconds!==undefined){if(report.pageErrors.length||report.runtimeErrors.length)throw new Error('MOUNTED_DEBUG_ERRORS');return null;}
  if(report.status!=='passed')throw new Error(report.failure??'MOUNTED_PLAYTEST_FAILED');
  await output.json('creator-mount-summary.json',verifyCreatorRoute(trace,report));
  await service.triviews();const receipt=await service.submit();await output.json('creator-receipt.json',receipt);
  progress(output,'creator-artifacts',{video:report.videoPath,inputSeconds:report.inputWallSeconds});
  return receipt;
 }finally{await service.close();}
}

/** Existing bridge capture performs one presentation transaction, with no simulation advance. */
async function captureMountedViews(session:BrowserSession,output:Output){
 const result=await session.page.evaluate(async()=>{
  const browser=window as unknown as AcceptanceWindow,observer=browser.__WORLDKIT_EVAL__!;
  const before=observer.snapshot!(),horse=before.entities.find(entity=>entity.id==='horse-1');
  if(before.training?.mountedInstanceId!=='horse-1'||before.isRunning||!horse)throw new Error('MOUNTED_CAPTURE_STATE_INVALID');
  const THREE=await import('three');
  // Snapshot uses canonical local Euler XYZ. The assembly remains unit identity.
  const rotation=new THREE.Euler(...horse.rotationLocalRadiansXYZ,'XYZ');
  const front=new THREE.Vector3(0,0,1).applyEuler(rotation).normalize();
  const assembly=observer.targets['horse-rider-assembly'];
  if(!assembly)throw new Error('MOUNTED_ASSEMBLY_MISSING');
  assembly.updateWorldMatrix(true,false);
  const assemblyRotation=assembly.getWorldQuaternion(new THREE.Quaternion());
  const localFront=front.clone().applyQuaternion(assemblyRotation.invert());
  const frontYawRadians=Math.atan2(-localFront.x,-localFront.z);
  const capture=browser.__THREE_CREATOR_HOST__.capture('entity-triview',['horse-rider-assembly'],frontYawRadians);
  const after=observer.snapshot!();
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('MOUNTED_CAPTURE_ADVANCED_STATE');
  if(capture.panelOrder.join(',')!=='front,right,back'||new THREE.Vector3(...capture.frontDirectionWorldXYZ).distanceTo(front)>1e-6)throw new Error('MOUNTED_CAPTURE_FRONT_MISMATCH');
  return {capture,before,after,canonicalHorse:horse,canonicalFrontDirection:front.toArray()};
 });
 await writeFile(path.join(output.root,'mounted-assembly-triview.png'),imageBytes(result.capture.image));
 const {image,...captureMetadata}=result.capture;
 await output.json('mounted-assembly-triview.json',{kind:'supplemental-mounted-capture',image:'mounted-assembly-triview.png',imageSha256:hash(imageBytes(image)),...captureMetadata,before:result.before,after:result.after,canonicalHorse:result.canonicalHorse,canonicalFrontDirection:result.canonicalFrontDirection,episodeStart:start});
 progress(output,'mounted-views',{image:'mounted-assembly-triview.png'});
}
function episodeInput(index:number):WorldInput{return {training:{forward:index<600?1:0,steer:index>=240&&index<360?.2:0,roll:0,lift:0,pitch:0,strafe:0,boost:index>=360&&index<600,brake:index>=600,slow:false,jump:false}};}
async function recordEpisodeFrames(session:BrowserSession,output:Output,before:WorldSnapshot){
 const capabilities=await session.capabilities(),frames:EpisodeTraceFrame[]=[];
 const encoder=createRenderedFrameEncoder({outputPath:path.join(output.root,'episode.mp4'),frameRate:24,frameCount:720});
 let terminal=before,finished=false;
 try{
  for(let index=0;index<720;index++){
   const frame=await session.frame('image/jpeg');
   const tick=before.simulationTick+frameSimulationTick(index,capabilities.fixedTimeStepSeconds);
   if(frame.snapshot.simulationTick!==tick||frame.snapshot.errors.length||session.errors.length)throw new Error('EPISODE_CLOCK_OR_RUNTIME_ERROR');
   const input=episodeInput(index);
   const posture=await session.page.evaluate(()=>(window as unknown as AcceptanceWindow).__MOUNTED_DIAGNOSTICS__());
   if(posture.pelvisErrorMeters===null||posture.pelvisErrorMeters>1e-5||posture.logicalRootScales.some(scale=>scale.some(value=>value!==1)))throw new Error('MOUNTED_POSTURE_DRIFT');
   const bytes=imageBytes(frame.imageDataUrl);
   frames.push({posture,frameIndex:index,simulationTick:tick,snapshot:frame.snapshot,input,imageSha256:hash(bytes)});
   await encoder.write(bytes);
   terminal=await session.advance(input,frameSimulationTick(index+1,capabilities.fixedTimeStepSeconds)-frameSimulationTick(index,capabilities.fixedTimeStepSeconds));
   if(index%120===0)progress(output,'episode',{frame:index});
  }
  await encoder.finish();finished=true;return {frames,terminal};
 }finally{if(!finished)await encoder.abort();}
}
async function captureEpisode(output:Output,source:Awaited<ReturnType<typeof prepareEpisodeSource>>){
 const session=await openEpisodeBrowser({playableRoot:source.playableRoot});
 try{
  const probe=await session.probeStart(start);if(!probe.isValid)throw new Error(JSON.stringify(probe));
  const before=await session.prepareSegment(start,viewport);
  const first=await session.frame('image/png'),repeat=await session.frame('image/png');
  if(first.snapshot.isRunning||first.imageDataUrl!==repeat.imageDataUrl||first.snapshot.simulationTick!==repeat.snapshot.simulationTick)throw new Error('EPISODE_REPEAT_CHANGED');
  await writeFile(path.join(output.root,'episode-first.png'),imageBytes(first.imageDataUrl));
  const lease=await session.page.evaluate(async()=>{
   const observer=(window as unknown as AcceptanceWindow).__WORLDKIT_EVAL__!;
   return {receipt:await observer.execute!({type:'training.exit'}),snapshot:observer.snapshot!()};
  });
  await output.json('episode-lease.json',lease);if(lease.receipt.status!=='rejected'||lease.receipt.error.code!=='EPISODE_CAPTURE_OWNS_CLOCK')throw new Error('EPISODE_LEASE_BYPASSED');
  await captureMountedViews(session,output);
  const {frames,terminal}=await recordEpisodeFrames(session,output,before);
  const second=await session.prepareSegment(start,viewport),secondFrame=await session.frame('image/png');
  if(second.training?.transition.remainingSeconds!==0||second.training?.mountedInstanceId!=='horse-1'||secondFrame.imageDataUrl!==first.imageDataUrl)throw new Error('EPISODE_SECOND_PREPARE_CHANGED');
  // No training override: stale controller input would remain observable through this path.
  const settled=await session.advance({},60);
  if(settled.training?.vehicles.some(vehicle=>vehicle.speedMetersPerSecond>.01)||settled.training?.transition.remainingSeconds!==0)throw new Error('EPISODE_OLD_INPUT_RETAINED');
  await output.json('episode-trace.json',{kind:'three-episode-trace',schemaVersion:1,worldBuildHash:source.worldBuildHash,before,terminal,second,settled,frames});
  await output.json('episode-health.json',{media:await inspectRenderedVideo(path.join(output.root,'episode.mp4')),repeatedFrameIdentity:hash(first.imageDataUrl),simulationTicks:terminal.simulationTick-before.simulationTick,errors:session.errors,lease,reinitialized:true,postResetProbeInput:{},maximumPelvisErrorMeters:Math.max(...frames.map(frame=>frame.posture.pelvisErrorMeters!))});
 }finally{try{await session.release();}finally{await session.close();}}
}
async function main(){
 const output=await createOutput(path.resolve(option('--output')??'.codex-tmp/mounted-acceptance'));
 const debug=option('--debug-seconds'),receipt=await captureCreator(output,debug===undefined?undefined:Number(debug));
 if(!receipt)return;
 const unpacked=path.join(output.root,'unpacked');await mkdir(unpacked);await exec('tar',['-xzf',receipt.archivePath,'-C',unpacked]);
 const source=await prepareEpisodeSource({payloadRoot:path.join(unpacked,'payload'),outputRoot:path.join(output.root,'episode-source'),worldId:'mounted-horse-local-acceptance'});
 await captureEpisode(output,source);progress(output,'complete');
}
await main();
