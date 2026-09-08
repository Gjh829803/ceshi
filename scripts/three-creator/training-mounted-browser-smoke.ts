import {cp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {ThreeCreatorTools} from './tools.js';
import {prepareEpisodeSource} from '../three-episode/source.js';
import {openEpisodeBrowser} from '../three-episode/browser.js';
import {frameSimulationTick} from '../three-episode/capture.js';
import {createRenderedFrameEncoder,inspectRenderedVideo} from '../lib/rendered-frame-encoder.js';
const exec=promisify(execFile),hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const option=(name:string)=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
const output=path.resolve(option('--output')??'.codex-tmp/mounted-acceptance');
await mkdir(output,{recursive:true});if((await readdir(output)).length)throw new Error('MOUNTED_OUTPUT_NOT_EMPTY');
const json=async(name:string,value:unknown)=>writeFile(path.join(output,name),JSON.stringify(value,null,2)+'\n');
const workspace=path.join(output,'author');await cp('examples/three-creator/horse-riding',workspace,{recursive:true});
const gitSha=(await exec('git',['rev-parse','HEAD'])).stdout.trim();
const service=new ThreeCreatorTools(workspace,'three-sdk');
try{
 const candidate=await service.compiler.prepare();
 await json('manifest.json',{gitSha,sourceHash:candidate.sourceHash,worldBuildHash:candidate.worldBuildHash,runtimeHash:candidate.runtimeHash,assetIds:['humanoid.source-101','training.horse'],loadedClipNames:['Idle','Walk','Gallop'],inputPlanHash:hash(await readFile(path.join(workspace,'episode.json'))),providerSubmissions:0});
 const inspected=await service.inspect();await json('opening-inspect.json',inspected);
 if(inspected.pageErrors.length||inspected.blockedNetworkRequests.length)throw new Error('MOUNTED_START_FAILED');
 const debug=option('--debug-seconds');
 const operation=service.start('world.playtest',id=>service.playtest(id,debug?Number(debug):undefined));
 let report:any;
 for(;;){const status=await service.getOperation(operation.operationId,25);console.log(JSON.stringify({stage:'creator',status:status.status,progress:status.progress,output}));
  if(status.status==='failed')throw new Error(status.error);
  if(status.status==='succeeded'){report=status.result;break;}}
 await json('creator-playtest.json',report);
 const tracePath=path.join(path.dirname(report.videoPath),'trace.json');const trace=JSON.parse(await readFile(tracePath,'utf8'));
 await json('creator-trace.json',trace);
 for(const [name,seconds]of Object.entries({side:1.5,front:4,turning:8,exit:21,reset:183})){
  if(seconds>=report.actualWallSeconds)continue;
  await exec('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(seconds),'-i',report.videoPath,'-frames:v','1',path.join(output,`${name}.png`)]);
 }
 console.log(JSON.stringify({stage:'creator-artifacts',output,video:report.videoPath}));
 if(debug){if(report.pageErrors.length||report.runtimeErrors.length)throw new Error('MOUNTED_DEBUG_ERRORS');returnDebug();}
 else {
  if(report.status!=='passed')throw new Error(report.failure??'MOUNTED_PLAYTEST_FAILED');
  const samples=trace.samples;
  const mounted=samples.filter((s:any)=>s.training?.mountedInstanceId==='horse-1');
  if(!mounted.length||!samples.some((s:any)=>s.training?.transition.kind==='enter')||!samples.some((s:any)=>s.training?.transition.kind==='exit')||!mounted.some((s:any)=>s.training.vehicleDynamics.some((v:any)=>v.instanceId==='horse-1'&&v.creature?.gait==='gallop')))throw new Error('MOUNTED_ROUTE_NOT_OBSERVED');
  const lastMounted=mounted.at(-1).wallSeconds;
  const walking=samples.filter((s:any)=>s.wallSeconds>lastMounted&&s.training?.mountedInstanceId===null);
  if(!walking.some((s:any)=>Math.hypot(...s.velocityMetersPerSecondXYZ)>1))throw new Error('POST_EXIT_WALK_NOT_OBSERVED');
  if(!report.hostActionEvents.some((e:any)=>e.type==='lifecycle'&&e.action==='reset'))throw new Error('RESET_NOT_OBSERVED');
  await json('creator-mount-summary.json',samples.map((s:any)=>({time:s.wallSeconds,position:s.positionMetersXYZ,training:s.snapshot?.training??s.training})));
  await service.triviews();const receipt=await service.submit();await json('creator-receipt.json',receipt);await service.close();
  const unpacked=path.join(output,'unpacked');await mkdir(unpacked);await exec('tar',['-xzf',receipt.archivePath,'-C',unpacked]);
  const source=await prepareEpisodeSource({payloadRoot:path.join(unpacked,'payload'),outputRoot:path.join(output,'episode-source'),worldId:'mounted-horse-local-acceptance'});
  const session=await openEpisodeBrowser({playableRoot:source.playableRoot});
  let encoder:ReturnType<typeof createRenderedFrameEncoder>|undefined;
  try {
   const start={positionWorldMetersXYZ:[0,.03,0] as const,facingYawRadians:0,training:{vehicleInstanceId:'horse-1',mounted:true,cameraMode:0 as const}};
   const probe=await session.probeStart(start);if(!probe.isValid)throw new Error(JSON.stringify(probe));
   const before=await session.prepareSegment(start,{widthPixels:1280,heightPixels:720});
   const first=await session.frame('image/png'),repeat=await session.frame('image/png');
   if(first.snapshot.isRunning||first.imageDataUrl!==repeat.imageDataUrl||first.snapshot.simulationTick!==repeat.snapshot.simulationTick)throw new Error('EPISODE_REPEAT_CHANGED');
   await writeFile(path.join(output,'episode-first.png'),Buffer.from(first.imageDataUrl.split(',')[1]!,'base64'));
   const lease=await session.page.evaluate(async()=>{const observer=(window as any).__WORLDKIT_EVAL__;return {receipt:await observer.execute({type:'training.exit'}),snapshot:observer.snapshot()};});
   await json('episode-lease.json',lease);
   if(lease.receipt.status!=='rejected')throw new Error('EPISODE_LEASE_BYPASSED');
   for(const [name,eye]of Object.entries({side:[7,3,0],front:[0,3,-7]})){
    const observed=await session.observe({cameraPositionWorldMetersXYZ:eye as [number,number,number],lookAtWorldMetersXYZ:[0,1.5,0]});
    await writeFile(path.join(output,`mounted-${name}.png`),Buffer.from(observed.imageDataUrl.split(',')[1]!,'base64'));
   }
   console.log(JSON.stringify({stage:'mounted-views',output}));
   const capabilities=await session.capabilities(),frames:any[]=[];
   encoder=createRenderedFrameEncoder({outputPath:path.join(output,'episode.mp4'),frameRate:24,frameCount:720});
   let terminal=before;
   for(let index=0;index<720;index++){
    const frame=await session.frame('image/jpeg'),tick=before.simulationTick+frameSimulationTick(index,capabilities.fixedTimeStepSeconds);
    if(frame.snapshot.simulationTick!==tick||frame.snapshot.errors.length||session.errors.length)throw new Error('EPISODE_CLOCK_OR_RUNTIME_ERROR');
    const input={training:{forward:index<600?1:0,steer:index>=240&&index<360?.2:0,roll:0,lift:0,pitch:0,strafe:0,boost:index>=360&&index<600,brake:index>=600,slow:false,jump:false}};
    const posture=await session.page.evaluate(()=>(window as any).__MOUNTED_DIAGNOSTICS__());
    if(posture.pelvisErrorMeters===null||posture.pelvisErrorMeters>1e-5||posture.logicalRootScales.some((scale:number[])=>scale.some(v=>v!==1)))throw new Error('MOUNTED_POSTURE_DRIFT');
    frames.push({posture,frameIndex:index,simulationTick:tick,snapshot:frame.snapshot,input,imageSha256:hash(Buffer.from(frame.imageDataUrl.split(',')[1]!,'base64'))});
    await encoder.write(Buffer.from(frame.imageDataUrl.split(',')[1]!,'base64'));
    terminal=await session.advance(input,frameSimulationTick(index+1,capabilities.fixedTimeStepSeconds)-frameSimulationTick(index,capabilities.fixedTimeStepSeconds));
    if(index%120===0)console.log(JSON.stringify({stage:'episode',frame:index,output}));
   }
   await encoder.finish();encoder=undefined;
   const second=await session.prepareSegment(start,{widthPixels:1280,heightPixels:720});
   const secondFrame=await session.frame('image/png');
   if(second.training?.transition.remainingSeconds!==0||second.training?.mountedInstanceId!=='horse-1'||secondFrame.imageDataUrl!==first.imageDataUrl)throw new Error('EPISODE_SECOND_PREPARE_CHANGED');
   await json('episode-trace.json',{kind:'three-episode-trace',schemaVersion:1,worldBuildHash:source.worldBuildHash,before,terminal,second,frames});
   await json('episode-health.json',{media:await inspectRenderedVideo(path.join(output,'episode.mp4')),repeatedFrameIdentity:hash(first.imageDataUrl),simulationTicks:terminal.simulationTick-before.simulationTick,errors:session.errors,lease,reinitialized:true});
  }finally{await encoder?.abort();await session.release().catch(()=>undefined);await session.close();}
 }
}finally{await service.close();}
function returnDebug(){console.log(JSON.stringify({stage:'debug-complete',output}));}
