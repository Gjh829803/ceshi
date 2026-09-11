import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {rayStopEvidence} from './three-ray-cleanup.mjs';
import {stopOwnedThreeJob} from './three-eval-stop.mjs';

const job={job_id:'gen_123abc',pipeline:'codex',request_id:'wk3-stop-check',output_s3_prefix:'s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk/three-creator/test',status:'cancelled',attempt:1,ray_submission_id:'lwdp_gen_123abc',progress:{summary:{ray_cleanup_checked:false,ray_cleanup_pending:true}}};
const now='2026-09-08T04:10:00.000Z';
const ray={submission_id:job.ray_submission_id,status:'STOPPED',end_time:Date.parse(now)-1000};

test('Ray proof closes only the exact known single submission after its terminal timestamp',()=>{
  for(const status of ['STOPPED','SUCCEEDED','FAILED'])assert.equal(rayStopEvidence(job,{...ray,status},now).jobId,job.job_id);
  for(const changed of [{status:'running'},{pipeline:'video'},{attempt:2},{attempt:undefined},{ray_submission_id:'lwdp_gen_other'}])assert.equal(rayStopEvidence({...job,...changed},ray,now),null);
  for(const changed of [{status:'RUNNING'},{submission_id:'lwdp_gen_other'},{end_time:null},{end_time:Date.parse(now)+120000}])assert.equal(rayStopEvidence(job,{...ray,...changed},now),null);
});

test('controlled stop retains provider lag and records distinct authoritative Host evidence',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'three-ray-stop-'));
  try{
    const proof=rayStopEvidence(job,ray,now);let cancels=0;
    const report=await stopOwnedThreeJob({jobId:job.job_id,requestId:job.request_id,outputS3Prefix:job.output_s3_prefix,evidenceRoot:root,reason:'replace blocked attempt',waitMilliseconds:0,readJob:async()=>job,cancelJob:async()=>{cancels++;},probeRayCleanup:async actual=>{assert.equal(actual.job_id,job.job_id);return proof;}});
    assert.equal(cancels,1);assert.equal(report.status,'confirmed-terminal');assert.equal(report.rayCleanupConfirmed,true);assert.equal(report.rayCleanup.checked,false);assert.equal(report.rayCleanup.pending,true);assert.deepEqual(report.hostRayCleanup,proof);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('unconfirmed Ray state never closes a cancelled request',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'three-ray-stop-'));
  try{
    const report=await stopOwnedThreeJob({jobId:job.job_id,requestId:job.request_id,outputS3Prefix:job.output_s3_prefix,evidenceRoot:root,reason:'replace blocked attempt',waitMilliseconds:0,readJob:async()=>job,cancelJob:async()=>{},probeRayCleanup:async()=>null});
    assert.equal(report.status,'stop-pending');assert.equal(report.rayCleanupConfirmed,false);
  }finally{await rm(root,{recursive:true,force:true});}
});
