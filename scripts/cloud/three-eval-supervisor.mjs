#!/usr/bin/env node
// Durable Host orchestration only: unchanged prepared input and idempotency keys.
import {spawn} from 'node:child_process';
import {readFile,writeFile,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readThreeLiveStatus} from './three-eval-live.mjs';
import {writeJson} from './three-eval-runtime.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const index=process.argv.indexOf('--run-root');
if(index<0||!process.argv[index+1])throw Error('Provide --run-root for a prepared run');
const root=path.resolve(process.argv[index+1]);
if(!root.startsWith(path.join(repo,'.codex-tmp/three-creator-eval/runs')+path.sep))throw Error('CREATOR_SUPERVISOR_SCOPE_INVALID');
const read=async file=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}};
const plan=await read(path.join(root,'evaluation-plan.json'));
if(!plan?.runtimeLockPath||plan.selectedTaskIds.length<1)throw Error('CREATOR_SUPERVISOR_PLAN_INVALID');
const leasePath=path.join(root,'supervisor-owner.json');
let lease;
try{lease=await open(leasePath,'wx');}
catch(error){
  if(error.code!=='EEXIST')throw error;
  const owner=await read(leasePath);
  if(!Number.isSafeInteger(owner?.pid)||owner.pid<1)throw Error('CREATOR_SUPERVISOR_OWNER_UNCONFIRMED');
  let gone=false;
  try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')gone=true;else throw error;}
  if(!gone)throw Error('CREATOR_SUPERVISOR_ALREADY_ACTIVE');
  await unlink(leasePath);lease=await open(leasePath,'wx');
}
await lease.writeFile(JSON.stringify({pid:process.pid,runId:plan.runId,startedAt:new Date().toISOString()}));await lease.close();
const terminal=new Set(['delivered','failed','cancelled','stopped']);
let observing=false;
const observe=async()=>{
  if(observing)return;
  observing=true;
  try {
    const attempts=[];
    for(const taskId of plan.selectedTaskIds){
      const state=await read(path.join(root,taskId,'state.json'));if(!state?.jobId)continue;
      attempts.push({runId:plan.runId,runRoot:root,caseId:state.caseId,taskId,jobId:state.jobId,requestId:state.requestId,caseHash:state.caseHash,runtimeHash:state.runtimeHash,phase:state.phase,providerStatus:state.providerStatus,submittedAt:state.submittedAt,workDir:`/fsx/pipeline/lwdp_generation/${state.jobId}`});
    }
    const live=await readThreeLiveStatus(attempts.filter(row=>!terminal.has(row.phase)),{cacheMilliseconds:0});
    await writeJson(path.join(root,'live-status.json'),{kind:'three-creator-safe-live-status',schemaVersion:1,observedAt:live.observedAt,source:'Host supervisor',containsReasoningOrCommands:false,attempts:attempts.map(row=>({...row,...live.jobs.find(job=>job.jobId===row.jobId)}))});
  }catch(error){await writeJson(path.join(root,'host-observation-warning.json'),{at:new Date().toISOString(),code:'HOST_OBSERVATION_PENDING'});}
  finally{observing=false;}
};
await writeFile(path.join(root,'supervisor.pid'),String(process.pid));
const args=['scripts/cloud/three-eval-runner.mjs','--mode','run','--run-id',plan.runId,'--manifest',plan.manifestPath,'--runtime-lock',plan.runtimeLockPath,'--output-root',root,'--suite',plan.suite,'--experiment-revision',plan.experimentRevision,'--reasoning-effort',plan.reasoningEffort,'--case-limit',String(plan.selectedTaskIds.length),'--max-concurrency',String(plan.maxConcurrency),'--account-concurrency',String(plan.accountConcurrency),'--account-policy-file',plan.accountPolicyPath,'--account-inventory-file',plan.accountInventoryPath];
const deadline=Date.now()+(plan.safetyPolicy.maximumTotalWallSeconds+1800)*1000;
const timer=setInterval(()=>{void observe();},15000);
try{
  for(let cycle=1;;cycle++){
    const log=await open(path.join(root,'supervisor-runner.log'),'a');
    let exit;
    try{
      const child=spawn(process.execPath,args,{cwd:repo,stdio:['ignore',log.fd,log.fd]});
      exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
    }finally{await log.close();}
    await observe();
    const states=await Promise.all(plan.selectedTaskIds.map(id=>read(path.join(root,id,'state.json'))));
    const complete=states.every(state=>state&&terminal.has(state.phase));
    const status={runId:plan.runId,updatedAt:new Date().toISOString(),cycle,runnerExitCode:exit,status:complete?'completed':'reconciling',cases:states.map((s,i)=>({taskId:plan.selectedTaskIds[i],jobId:s?.jobId??null,phase:s?.phase??'not-started'}))};
    await writeJson(path.join(root,'supervisor-status.json'),status);
    if(complete){await writeJson(path.join(root,'supervisor-complete.json'),status);break;}
    if(Date.now()>deadline){await writeJson(path.join(root,'supervisor-attention.json'),{...status,reason:'Host reconciliation window exhausted; preserve existing job IDs for resume.'});process.exitCode=1;break;}
    await new Promise(resolve=>setTimeout(resolve,Math.min(60000,10000*cycle)));
  }
}finally{clearInterval(timer);const owner=await read(leasePath);if(owner?.pid===process.pid)await unlink(leasePath);}
