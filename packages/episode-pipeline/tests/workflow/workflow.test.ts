import {writeFixtureAssetPolicy} from '../fixtures/asset-policy';
import {hashTree} from '@worldkit/creator-host/compiler';
import {describe,expect,it,vi} from 'vitest';
import {RouteController} from '../../src/planning/route-controller.js';
import {isRepairableRouteFailure} from '../../src/workflow/workflow.js';
import type {WorldSnapshot} from '@worldkit/three';

describe('Episode capture failure handoff',()=>{
 it('returns actual blocked controller failures to the route planner, instead of declaring an SDK repair',()=>{
  const controller=new RouteController({id:'segment-00',start:{positionWorldMetersXYZ:[0,0,0],facingYawRadians:0},waypoints:[{positionWorldMetersXYZ:[0,0,-20],gait:'walk'}],endBehavior:'stop',purpose:'real controller failure handoff'},
   {kind:'ground',walkSpeedMetersPerSecond:2,runSpeedMetersPerSecond:4,heightMeters:1.8,radiusMeters:.3});
  const snapshot={controlledEntityId:'actor',entities:[{id:'actor',positionWorldMetersXYZ:[0,0,0],motion:{isGrounded:true,collisionEntityIds:['wall']}}]} as unknown as WorldSnapshot;
  controller.step(snapshot,[0,0,-1],0);const result=controller.step(snapshot,[0,0,-1],3);
  expect(result.mode).toBe('failed');expect(isRepairableRouteFailure(result.diagnostic!.code)).toBe(true);
 });
 it('keeps runtime, browser, encoding and service failures out of route content repairs',()=>{
  for(const code of ['EPISODE_RUNTIME_ERROR','EPISODE_BROWSER_ERROR','EPISODE_VIDEO_CONTRACT_FAILED','EPISODE_CAPTURE_JOB_FAILED','EPISODE_RELEASE_FAILED'])expect(isRepairableRouteFailure(code)).toBe(false);
  for(const code of ['EPISODE_START_INVALID','EPISODE_ROUTE_TOO_SHORT','ROUTE_VERTICAL_MISMATCH','ROUTE_BACKTRACK_BLOCKED'])expect(isRepairableRouteFailure(code)).toBe(true);
 });
});

import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runEpisodeWorkflow} from '../../src/workflow/workflow.js';
import {canonicalHash,PRE_SEEDANCE_PROFILE} from '../../src/contracts.js';
import {createBatchQueue} from '../../src/batch/batch-controller.mjs';

it.each(['downstream','producer-cleanup','publication','transient'])('preserves original failure through %s and never writes a success receipt',async mode=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'episode-workflow-failure-')));
 const old={...process.env};
 try{
  const hash='a'.repeat(64), output=path.join(root,'out'), sourceManifestPath=path.join(root,'source.json');
  await mkdir(path.join(root,'source'));await mkdir(path.join(root,'playable'));await mkdir(output);
  await writeFile(path.join(root,'opening.png'),'fixture');
  const image={path:'opening.png',sha256:createHash('sha256').update('fixture').digest('hex')};
  const assetPolicySha256=await writeFixtureAssetPolicy(path.join(root,'playable'));
  await writeFile(sourceManifestPath,JSON.stringify({assetPolicySha256,kind:'three-episode-source',schemaVersion:1,worldId:'world-one',worldBuildHash:hash,sourceHash:hash,runtimeHash:hash,sourceRoot:'source',sourceFiles:{},playableRoot:'playable',playableFiles:await hashTree(path.join(root,'playable')),opening:image,targets:[{id:'target-one',whiteboxTriview:image}]}));
  const plan={kind:'worldkit-three-episode-plan',schemaVersion:2,worldBuildHash:hash,segments:Array.from({length:6},(_,i)=>({id:`segment-0${i}`,start:{positionWorldMetersXYZ:[i,0,0],facingYawRadians:0},waypoints:[{positionWorldMetersXYZ:[i,0,-20],gait:'walk'}],endBehavior:'stop',purpose:'fixture'}))};
  const planPath=path.join(output,'plan.json');await writeFile(planPath,JSON.stringify(plan));
  await writeFile(path.join(output,'episode.json'),JSON.stringify({episodeId:'case-one',worldBuildHash:hash,profile:PRE_SEEDANCE_PROFILE,planPath,planHash:canonicalHash(plan),segments:[],planRepairsBySegment:{},status:'running'}));
  const queueState:any={cases:{'case-one':{status:'succeeded'}},tasks:{'capture-one':{continuationJob:'cpu-one'}}};
  const store:any={state:async()=>queueState,change:async(_name:string,fn:any)=>({state:queueState,result:fn(queueState)})};
  const queue=createBatchQueue({store});let published:any;
  if(mode==='producer-cleanup')queue.failPendingProducer=async()=>{throw Error('cleanup unavailable');};
  Object.assign(process.env,{WORLDKIT_CPU_TASK:'capture-one',WORLDKIT_CPU_COHORT:'cohort-one',WORLDKIT_EPISODE_HOST_JOB:'cpu-one'});
  const failure=Object.assign(Error('output unavailable'),{code:mode==='transient'?'ETIMEDOUT':'EPISODE_CAPTURE_OUTPUT_UNAVAILABLE'});
  await expect(runEpisodeWorkflow({sourceManifestPath,outputRoot:output,episodeId:'case-one',stopBeforeSeedance:true,runtimeConfig:{captureCohortId:'cohort-one'},batchQueue:queue,capture:async()=>{throw failure;},publishS3Prefix:'s3://bucket/latest',cloud:{publishDirectory:async()=>{published=JSON.parse(await readFile(path.join(output,'episode.json'),'utf8'));if(mode==='publication')throw Error('publish unavailable');}} as any})).rejects.toBe(failure);
  expect(published.status).toBe('failed');expect(published.error.code).toBe(failure.code);
  expect(queueState.cases['case-one'].status).toBe('succeeded');
  if(mode==='publication')expect(queueState.tasks['capture-one'].cpuReceipt).toBeUndefined();
  else{expect(queueState.tasks['capture-one'].cpuReceipt.status).toBe('failed');expect(queueState.tasks['capture-one'].cpuReceipt.retryable).toBe(mode==='transient');}
 }finally{for(const key of ['WORLDKIT_CPU_TASK','WORLDKIT_CPU_COHORT','WORLDKIT_EPISODE_HOST_JOB']){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}await rm(root,{recursive:true,force:true});}
});

import {caseRuntimeConfig} from '../../src/workflow/case-config.js';
it('isolates each shared-capsule case in planner and capture continuation config',()=>{
 const base={planningSourceRoot:'/fsx/frozen',sourceManifestRelativePath:'inputs/old/source.json',planningSourceManifest:'/fsx/old/source.json'};
 const a=caseRuntimeConfig(base,'/episode/inputs/case-a/source.json','/episode','a'.repeat(64));
 const b=caseRuntimeConfig(base,'/episode/inputs/case-b/source.json','/episode','b'.repeat(64));
 expect(a.planningSourceManifest).toBe(path.join('/fsx/frozen','inputs/case-a/source.json'));expect(a.sourceManifestRelativePath).toBe('inputs/case-a/source.json');
 expect(b.planningSourceManifest).toBe(path.join('/fsx/frozen','inputs/case-b/source.json'));expect(b.planningSourceManifestSha256).not.toBe(a.planningSourceManifestSha256);
 expect(base.sourceManifestRelativePath).toBe('inputs/old/source.json');expect(()=>caseRuntimeConfig(base,'/outside/source.json','/episode','a'.repeat(64))).toThrow('OUTSIDE_CAPSULE');
});

it('rejects an unsupported frozen camera protocol before dispatching a planning job',async()=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'episode-camera-admission-')));try{
  await mkdir(path.join(root,'source'));await mkdir(path.join(root,'playable'));await writeFile(path.join(root,'opening.png'),'fixture');
  const hash='a'.repeat(64),image={path:'opening.png',sha256:createHash('sha256').update('fixture').digest('hex')};
  const assetPolicySha256=await writeFixtureAssetPolicy(path.join(root,'playable'));
  const sourceManifestPath=path.join(root,'source.json');await writeFile(sourceManifestPath,JSON.stringify({assetPolicySha256,kind:'three-episode-source',schemaVersion:1,worldId:'protocol-test',worldBuildHash:hash,sourceHash:hash,runtimeHash:hash,sourceRoot:'source',sourceFiles:{},playableRoot:'playable',playableFiles:await hashTree(path.join(root,'playable')),opening:image,targets:[{id:'one',whiteboxTriview:image}]}));
  const runCodex=vi.fn(async()=>{throw new Error('PLANNER_DISPATCHED');});
  const openBrowser=vi.fn(async()=>({capabilities:async()=>({schemaVersion:1}),close:async()=>{}}));
  await expect(runEpisodeWorkflow({sourceManifestPath,outputRoot:path.join(root,'out'),until:'plan',stopBeforeSeedance:true,capture:async()=>{throw Error('unexpected capture');},cloud:{runCodex} as any,openBrowser:openBrowser as any})).rejects.toThrow('EPISODE_CAMERA_PROTOCOL_UNSUPPORTED');
  expect(runCodex).not.toHaveBeenCalled();
 }finally{await rm(root,{recursive:true,force:true});}
});

async function plannerRetryFixture(){
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'episode-planner-retry-')));
 await mkdir(path.join(root,'source'));await mkdir(path.join(root,'playable'));await writeFile(path.join(root,'opening.png'),'fixture');
 const hash='a'.repeat(64),image={path:'opening.png',sha256:createHash('sha256').update('fixture').digest('hex')};
 const assetPolicySha256=await writeFixtureAssetPolicy(path.join(root,'playable'));
 const sourceManifestPath=path.join(root,'source.json');await writeFile(sourceManifestPath,JSON.stringify({assetPolicySha256,kind:'three-episode-source',schemaVersion:1,worldId:'retry-test',worldBuildHash:hash,sourceHash:hash,runtimeHash:hash,sourceRoot:'source',sourceFiles:{},playableRoot:'playable',playableFiles:await hashTree(path.join(root,'playable')),opening:image,targets:[{id:'one',whiteboxTriview:image}]}));
 let observation=0;
 const openBrowser=vi.fn(async()=>({capabilities:async()=>({schemaVersion:2,camera:{mode:'authored',baselineMode:'authored',documentHash:null,views:[],defaultViewId:null,current:{mode:'authored',viewId:null,viewKind:null,documentHash:null,configurationRevision:0,cameraCommitRevision:++observation,lifecycleGeneration:1,subjectGeneration:null,logicalTargetId:null,resolvedSubjectId:null,positionWorldMetersXYZ:[observation,0,0],transition:{kind:'none',configuredDurationSeconds:0,effectiveDurationSeconds:0}}}}),close:async()=>{}}));
 const options={sourceManifestPath,outputRoot:path.join(root,'out'),until:'plan' as const,stopBeforeSeedance:true as const,runtimeConfig:{},capture:async()=>{throw Error('unexpected capture');},openBrowser:openBrowser as any};
 return {root,hash,options,openBrowser};
}
it('reconciles an unknown planner retry using the first context bytes despite a changed camera sample',async()=>{
 const f=await plannerRetryFixture();try{
  const requests:{taskId:string;outputRoot:string;context:string;contextPath:string}[]=[];
  const runCodex=vi.fn(async(request:any)=>{
   const contextPath=request.assets.find((asset:any)=>asset.id==='episode-context').path;
   requests.push({taskId:request.taskId,outputRoot:request.outputRoot,context:await readFile(contextPath,'utf8'),contextPath});
   if(requests.length===1)throw Error('EPISODE_REQUEST_UNKNOWN');
   const plan={kind:'worldkit-three-episode-plan',schemaVersion:2,worldBuildHash:f.hash,segments:Array.from({length:6},(_,i)=>({id:`segment-0${i}`,start:{positionWorldMetersXYZ:[i,0,0],facingYawRadians:0},waypoints:[{positionWorldMetersXYZ:[i,0,-20],gait:'walk'}],endBehavior:'stop',purpose:'fixture'}))};
   await writeFile(request.outputs[0].path,JSON.stringify(plan));await writeFile(request.outputs[1].path,JSON.stringify({status:'submitted',worldBuildHash:f.hash,planHash:canonicalHash(plan),calls:[{tool:'episode_submit_plan',status:'succeeded'}]}));return {status:'reconciled'};
  });
  const options={...f.options,cloud:{runCodex} as any};
  await expect(runEpisodeWorkflow(options)).rejects.toThrow('EPISODE_REQUEST_UNKNOWN');
  await runEpisodeWorkflow(options);
  expect(f.openBrowser).toHaveBeenCalledTimes(2);expect(requests[1]).toEqual(requests[0]);
  const evidence=await readFile(path.join(requests[0]!.outputRoot,'result.json'),'utf8');
  await runEpisodeWorkflow(options);expect(runCodex).toHaveBeenCalledTimes(2);
  expect(await readFile(requests[0]!.contextPath,'utf8')).toBe(requests[0]!.context);expect(await readFile(path.join(requests[0]!.outputRoot,'result.json'),'utf8')).toBe(evidence);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
it.each(['bytes','identity'])('rejects a changed frozen planner context %s before retry dispatch',async corruption=>{
 const f=await plannerRetryFixture();try{
  let contextPath='';const runCodex=vi.fn(async(request:any)=>{contextPath=request.assets.find((asset:any)=>asset.id==='episode-context').path;throw Error('EPISODE_REQUEST_UNKNOWN');});
  const options={...f.options,cloud:{runCodex} as any};await expect(runEpisodeWorkflow(options)).rejects.toThrow('EPISODE_REQUEST_UNKNOWN');
  if(corruption==='bytes')await writeFile(contextPath,(await readFile(contextPath,'utf8'))+' ');
  else {const context=JSON.parse(await readFile(contextPath,'utf8'));context.worldBuildHash='b'.repeat(64);const bytes=JSON.stringify(context);await writeFile(contextPath,bytes);const receiptPath=path.join(path.dirname(contextPath),'context-receipt.json'),receipt=JSON.parse(await readFile(receiptPath,'utf8'));receipt.contextSha256=createHash('sha256').update(bytes).digest('hex');receipt.inputHash=canonicalHash(context);await writeFile(receiptPath,JSON.stringify(receipt));}
  await expect(runEpisodeWorkflow(options)).rejects.toThrow('EPISODE_PLANNER_CONTEXT_CHANGED');expect(runCodex).toHaveBeenCalledTimes(1);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
