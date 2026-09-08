import {describe,expect,it} from 'vitest';
import {RouteController} from './route-controller.js';
import {isRepairableRouteFailure} from './workflow.js';
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
import {runEpisodeWorkflow} from './workflow.js';
import {canonicalHash,PRE_SEEDANCE_PROFILE} from './contracts.js';
import {createBatchQueue} from './batch-controller.mjs';

it.each(['downstream','producer-cleanup','publication','transient'])('preserves original failure through %s and never writes a success receipt',async mode=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'episode-workflow-failure-')));
 const old={...process.env};
 try{
  const hash='a'.repeat(64), output=path.join(root,'out'), sourceManifestPath=path.join(root,'source.json');
  await mkdir(path.join(root,'source'));await mkdir(path.join(root,'playable'));await mkdir(output);
  await writeFile(path.join(root,'opening.png'),'fixture');
  const image={path:'opening.png',sha256:createHash('sha256').update('fixture').digest('hex')};
  await writeFile(sourceManifestPath,JSON.stringify({kind:'three-episode-source',schemaVersion:1,worldId:'world-one',worldBuildHash:hash,sourceHash:hash,runtimeHash:hash,sourceRoot:'source',sourceFiles:{},playableRoot:'playable',playableFiles:{},opening:image,targets:[{id:'target-one',whiteboxTriview:image}]}));
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

import {caseRuntimeConfig} from './case-config.js';
it('isolates each shared-capsule case in planner and capture continuation config',()=>{
 const base={planningSourceRoot:'/fsx/frozen',sourceManifestRelativePath:'inputs/old/source.json',planningSourceManifest:'/fsx/old/source.json'};
 const a=caseRuntimeConfig(base,'/episode/inputs/case-a/source.json','/episode','a'.repeat(64));
 const b=caseRuntimeConfig(base,'/episode/inputs/case-b/source.json','/episode','b'.repeat(64));
 expect(a.planningSourceManifest).toBe(path.join('/fsx/frozen','inputs/case-a/source.json'));expect(a.sourceManifestRelativePath).toBe('inputs/case-a/source.json');
 expect(b.planningSourceManifest).toBe(path.join('/fsx/frozen','inputs/case-b/source.json'));expect(b.planningSourceManifestSha256).not.toBe(a.planningSourceManifestSha256);
 expect(base.sourceManifestRelativePath).toBe('inputs/old/source.json');expect(()=>caseRuntimeConfig(base,'/outside/source.json','/episode','a'.repeat(64))).toThrow('OUTSIDE_CAPSULE');
});

import {customMovementAdapter} from './custom-movement.js';
it('never admits another or changed custom movement through the arborist compatibility adapter',async()=>{
 expect(await customMovementAdapter('/unused','unrelated-movement')).toBeUndefined();
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'custom-movement-')));
 try{await mkdir(path.join(root,'world'));await writeFile(path.join(root,'world/movement.ts'),'changed');await expect(customMovementAdapter(root,'arborist.ground-with-steps')).rejects.toThrow('SOURCE_CHANGED');}finally{await rm(root,{recursive:true,force:true});}
});
