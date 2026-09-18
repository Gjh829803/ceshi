import {episodeNodeArguments} from '../cloud/frozen-entrypoints.mjs';
import {applyStreamingOverlay} from '../cloud/streaming-overlay.mjs';
import {applyCpuRouting} from '../cloud/cpu-routing.mjs';
import isEqual from 'lodash-es/isEqual.js';
import {createCloudClient} from '../cloud/cloud.mjs';
import {cohortName,GLOBAL_QUEUE,createBatchStore} from './batch-store.mjs';
import {newCohort,enqueueCapture,closeProducer,selectBatch,completeCapture} from './batch-state.mjs';
import {captureBatchJob} from './batch-jobs.mjs';
import {threeEpisodeHostJob} from '../cloud/cloud-host.mjs';
export const jobEnded=job=>job?.status?.conditions?.some(c=>['Complete','Failed'].includes(c.type)&&c.status==='True');
export function createBatchQueue({store=createBatchStore()}={}){
  return {store,
    async register(cohortId,caseIds){const initial=newCohort(cohortId,caseIds);return store.change(cohortName(cohortId),s=>{if(!isEqual(Object.keys(s.cases).sort(),[...caseIds].sort()))throw Error('EPISODE_COHORT_CONFLICT');},initial);},
    async enqueue(cohortId,task,continuation){return store.change(cohortName(cohortId),s=>{enqueueCapture(s,task);if(continuation){const t=s.tasks[task.id];if(t.continuation&&!isEqual(t.continuation,continuation))throw Error('EPISODE_CONTINUATION_CONFLICT');t.continuation=continuation;}});},
    async task(cohortId,taskId){return (await store.state(cohortName(cohortId))).tasks[taskId]??null;},
    async checkpointReady(cohortId,taskId,continuation){return store.change(cohortName(cohortId),s=>{const t=s.tasks[taskId];if(!t)throw Error('EPISODE_TASK_MISSING');if(t.continuation&&!isEqual(t.continuation,continuation))throw Error('EPISODE_CONTINUATION_CONFLICT');t.continuation=continuation;});},
    async terminal(cohortId,caseId,status){return store.change(cohortName(cohortId),s=>closeProducer(s,caseId,status));},
    async failPendingProducer(cohortId,caseId){return store.change(cohortName(cohortId),s=>{if(s.cases[caseId]?.status==='pending')closeProducer(s,caseId,'failed-final');});},
    async assertActive(cohortId){if((await store.state(cohortName(cohortId))).cancelled)throw Object.assign(Error('EPISODE_COHORT_CANCELLED'),{code:'EPISODE_COHORT_CANCELLED'});},
    async trackRemote(cohortId,caseId,remote){return store.change(cohortName(cohortId),s=>{
      const c=s.cases[caseId];if(!c)throw Error('EPISODE_CASE_NOT_REGISTERED');
      c.remoteJobs??={};const key=`${remote.pipeline}:${remote.requestId}`,prior=c.remoteJobs[key];
      if(!prior&&s.cancelled)throw Object.assign(Error('EPISODE_COHORT_CANCELLED'),{code:'EPISODE_COHORT_CANCELLED'});
      if(prior?.jobId&&remote.jobId&&prior.jobId!==remote.jobId)throw Error('EPISODE_REMOTE_IDENTITY_CHANGED');
      // Local/S3 journals retain history; the cohort only owns outstanding calls.
      if(remote.isTerminal){delete c.remoteJobs[key];return;}
      c.remoteJobs[key]={...prior,...remote};
    });},
    async cancel(cohortId){return store.change(cohortName(cohortId),s=>{s.cancelled=true;});}
  };
}
async function findNext(store,image){
  for(const c of (await store.list()).sort((a,b)=>a.state.cohortId.localeCompare(b.state.cohortId))){
    const batch=selectBatch(c.state);if(batch&&(!image||batch.workerImage===image))return {cohortId:c.state.cohortId,cohortName:c.name,batch};
  }return null;
}
async function reserveTasks(store,active){
  await store.change(active.cohortName,s=>{
    if(s.cancelled)throw Error('EPISODE_BATCH_STALE');
    const owned=active.batch.tasks.every(task=>{const t=s.tasks[task.executionId];return t?.lastExecutionId===active.jobName&&(t.status==='reserved'||t.receipt);});
    if(!owned && selectBatch(s)?.batchHash!==active.batch.batchHash)throw Error('EPISODE_BATCH_STALE');
    if(active.batch.tasks.every(task=>s.tasks[task.executionId]?.receipt))throw Error('EPISODE_BATCH_STALE');
    for(const task of active.batch.tasks){const t=s.tasks[task.executionId];if(t.receipt)continue;if(t.lastExecutionId!==active.jobName){t.attempts=(t.attempts??0)+1;t.admittedBatchId=active.batch.batchId;t.lastExecutionId=active.jobName;}t.status='reserved';}
  });
  active.ready=true;
  await store.change(GLOBAL_QUEUE,s=>{if(s.active?.jobName!==active.jobName||s.active?.batch.batchId!==active.batch.batchId)throw Error('EPISODE_BATCH_OWNER_CHANGED');s.active.ready=true;});
}
/** A global CAS slot is never reclaimed on a timer: old Pods must be proven gone. */
export async function claimBatch(store,{previous=null,image=null,deadlineAt=null}={}){
  const next=await findNext(store,image);if(!next)return null;
  const now=Date.now();const job=captureBatchJob({...next,namespace:store.namespace});
  if(deadlineAt&&Date.parse(deadlineAt)-now<600_000+next.batch.taskCount*900_000)return null;
  const active={...next,jobName:previous?.jobName??job.metadata.name,jobHash:previous?.jobHash??next.batch.batchHash,startedAt:previous?.startedAt??new Date(now).toISOString(),deadlineAt:deadlineAt??new Date(now+job.spec.activeDeadlineSeconds*1000).toISOString(),node:previous?.node??null,jobUid:previous?.jobUid??null};
  const update=await store.change(GLOBAL_QUEUE,s=>{if(s.paused||(s.active?.batch.batchId!==(previous?.batch.batchId)||s.active?.jobName!==previous?.jobName))return false;if(!previous){s.attempt=(s.attempt??0)+1;active.jobName=`three-${next.batch.batchId}-${s.attempt}`;}s.active=active;return true;},{active:null,paused:false,closures:[]});
  if(!update.result)return null;
  try{await reserveTasks(store,active);}catch(e){if(e.message!=='EPISODE_BATCH_STALE')throw e;await store.change(GLOBAL_QUEUE,s=>{if(s.active?.jobName===active.jobName&&s.active?.batch.batchId===active.batch.batchId)s.active=previous;});return null;}return active;
}
async function podsForJob(store,name){return (await store.request(['get','pods','-n',store.namespace,'-l',`job-name=${name}`,'-o','json'])).items;}
async function ensureJob(store,job,beforeCreate=async()=>true){
  const name=job.metadata.name;
  let found=await store.request(['get','job',name,'-n',store.namespace,'--ignore-not-found','-o','json']);
  if(!found){if(!await beforeCreate())return null;try{return await store.request(['create','-f','-','-o','json'],job);}catch(error){found=await store.request(['get','job',name,'-n',store.namespace,'--ignore-not-found','-o','json']);if(!found)throw error;}}
  if(found.metadata.annotations?.['worldkit.seedleap.dev/batch-hash']!==job.metadata.annotations?.['worldkit.seedleap.dev/batch-hash'])throw Error('EPISODE_JOB_IDENTITY_MISMATCH');return found;
}
export async function reconcileBatches(store=createBatchStore()){
  let global;try{global=await store.state(GLOBAL_QUEUE);}catch(e){if(e.message!=='EPISODE_QUEUE_NOT_REGISTERED')throw e;global={active:null};}
  let active=global.active;
  if(active){
    if(!active.ready){try{await reserveTasks(store,active);}catch(e){if(e.message!=='EPISODE_BATCH_STALE')throw e;await store.change(GLOBAL_QUEUE,s=>{if(s.active?.jobName===active.jobName)s.active=null;});return {status:'stale-batch-rejected'};}}
    const state=await store.state(active.cohortName);
    let job=await store.request(['get','job',active.jobName,'-n',store.namespace,'--ignore-not-found','-o','json']);
    const pods=await podsForJob(store,active.jobName);
    const taskTimedOut=active.task&&Date.now()-Date.parse(active.task.startedAt)>900_000;
    if((state.cancelled||global.paused||taskTimedOut)&&job&&!jobEnded(job)){
      await store.request(['delete','job',active.jobName,'-n',store.namespace,'--wait=false','-o','json']);return {status:'cancelling'};
    }
    if(!job&&!pods.length&&!state.cancelled&&!global.paused&&!active.jobUid&&!active.batch.tasks.every(t=>state.tasks[t.executionId]?.receipt)){
      // Reconcile exactly the persisted name after an unknown create. Never pick a new batch.
      job=await ensureJob(store,{...captureBatchJob({batch:active.batch,cohortId:active.cohortId,namespace:store.namespace}),metadata:{name:active.jobName,namespace:store.namespace,annotations:{'worldkit.seedleap.dev/batch-hash':active.jobHash}}});
    }
    if(job&&!active.jobUid)await store.change(GLOBAL_QUEUE,s=>{if(s.active?.batch.batchId===active.batch.batchId)s.active.jobUid=job.metadata.uid;});
    if(pods.some(p=>!['Succeeded','Failed'].includes(p.status.phase))||job&&!jobEnded(job))return {status:'running',jobName:active.jobName};
    await store.change(active.cohortName,s=>{for(const task of active.batch.tasks){const t=s.tasks[task.executionId];if(!t.receipt&&(s.cancelled||t.attempts>=2))completeCapture(s,task.executionId,{executionId:task.executionId,status:s.cancelled?'capture-cancelled':'capture-failed',error:'CAPTURE_JOB_ENDED_WITHOUT_RECEIPT'});else if(!t.receipt)t.status='ready';}});
    const nodes=[...new Set(pods.map(p=>p.spec.nodeName).filter(Boolean))];
    const nodeRefs=[];for(const nodeName of nodes){const node=await store.request(['get','node',nodeName,'--ignore-not-found','-o','json']);nodeRefs.push({nodeName,providerId:node?.spec.providerID??active.node?.providerId??null});}
    await store.change(GLOBAL_QUEUE,s=>{if(s.active?.batch.batchId!==active.batch.batchId||s.active?.jobName!==active.jobName)throw Error('EPISODE_BATCH_OWNER_CHANGED');s.closures.push({jobName:active.jobName,status:'cleanup-pending',finishedAt:new Date().toISOString(),nodes:nodeRefs.length?nodeRefs:active.node?[active.node]:[]});s.closures=s.closures.filter(c=>c.status!=='resource-closed').concat(s.closures.filter(c=>c.status==='resource-closed').slice(-100));s.active=null;});
  }
  active=await claimBatch(store);if(active){const job=captureBatchJob({...active,namespace:store.namespace});job.metadata.name=active.jobName;const created=await ensureJob(store,job);await store.change(GLOBAL_QUEUE,s=>{if(s.active?.jobName===active.jobName)s.active.jobUid=created.metadata.uid;});}
  return {status:active?'submitted':'waiting',batchId:active?.batch.batchId??null};
}
/** Durable CPU attempt receipts survive Kubernetes TTL and fence bounded retries. */
export async function recordCpuReceipt(store,cohortId,taskId,receipt){
 await store.change(cohortName(cohortId),s=>{const t=s.tasks[taskId];if(!t||(t.cpuPending?.jobName??t.continuationJob)!==receipt.jobName)throw Error('EPISODE_CPU_RECEIPT_STALE');if(t.cpuReceipt?.jobName===receipt.jobName&&['succeeded','cancelled'].includes(t.cpuReceipt.status)){if(!isEqual(t.cpuReceipt,receipt))throw Error('EPISODE_CPU_RECEIPT_CONFLICT');return;}t.cpuReceipt=receipt;});
}
export async function reconcileContinuations(store=createBatchStore(),{cloud=createCloudClient()}={}){
  const results=[];
  const global=(await store.change(GLOBAL_QUEUE,()=>{},{active:null,paused:false,closures:[],cpuSlots:[]})).state;
  const cohorts=await store.list();
  const owns=(t,slot)=>t.cpuPending?.jobName===slot||t.continuationJob===slot;
  for(const slot of global.cpuSlots??[]){
    const owner=cohorts.find(c=>Object.values(c.state.tasks).some(t=>owns(t,slot)));
    const task=owner&&Object.values(owner.state.tasks).find(t=>owns(t,slot));
    const job=await store.request(['get','job',slot,'-n',store.namespace,'--ignore-not-found','-o','json']);
    const pods=await podsForJob(store,slot);
    if(owner?.state.cancelled&&job&&!jobEnded(job)){
      if(job.metadata.annotations?.['worldkit.seedleap.dev/batch-hash']!==task.input.recipeHash)throw Error('EPISODE_JOB_IDENTITY_MISMATCH');
      await store.request(['delete','job',slot,'-n',store.namespace,'--wait=false','-o','json']);
      continue;
    }
    const receipt=task?.cpuReceipt?.jobName===slot?task.cpuReceipt:null;
    const acknowledged=task?.continuationJob===slot;
    const livePods=pods.some(p=>!['Succeeded','Failed'].includes(p.status.phase));
    if(!livePods&&(jobEnded(job)||!job&&(receipt||acknowledged||owner?.state.cancelled))){
      if(task&&!receipt)await store.change(owner.name,s=>{const t=s.tasks[task.input.id];if(!t.cpuReceipt||t.cpuReceipt.jobName!==slot)t.cpuReceipt={jobName:slot,status:s.cancelled?'cancelled':'unknown',retryable:false,attentionRequired:!s.cancelled,error:s.cancelled?'EPISODE_COHORT_CANCELLED':'CPU_JOB_TERMINAL_WITHOUT_SAFE_CHECKPOINT'};});
      await store.change(GLOBAL_QUEUE,s=>{s.cpuSlots=(s.cpuSlots??[]).filter(name=>name!==slot);});
    }
  }
  // Cancellation cleanup remains enabled even when admission is paused.
  const cancellations=(await store.list()).filter(c=>c.state.cancelled).flatMap(({name,state})=>
    Object.entries(state.cases).flatMap(([caseId,c])=>Object.entries(c.remoteJobs??{}).filter(([,r])=>!r.isTerminal&&!r.attentionRequired).map(([key,remote])=>({name,caseId,key,remote}))))
    .sort((a,b)=>(a.remote.cancellationAttemptAt??'').localeCompare(b.remote.cancellationAttemptAt??'')).slice(0,3);
  for(const {name,caseId,key,remote} of cancellations){
    const claim=await store.change(name,s=>{const r=s.cases[caseId].remoteJobs[key];if(!r)return false;r.cancellationAttemptAt=new Date().toISOString();return true;});
    if(!claim.result)continue;
    try{
      const result=await cloud.cancelTrackedJob(remote);
      await store.change(name,s=>{const c=s.cases[caseId];if(!c.remoteJobs[key])return;if(result.isTerminal){delete c.remoteJobs[key];c.lastRemoteCancellation={...result,requestId:remote.requestId};}else Object.assign(c.remoteJobs[key],result);});
    }catch(error){await store.change(name,s=>{const r=s.cases[caseId].remoteJobs[key];if(r)r.cancellationError=String(error.message).slice(0,500);});}
  }
  if(global.paused||global.cpuPaused)return results;
  for(const {name,state} of await store.list()){
    if(state.cancelled)continue;
    for(const t of Object.values(state.tasks)){
      if(!t.receipt||!t.continuation)continue;
      const c=t.continuation,r=t.cpuReceipt;
      const current=t.cpuPending?.jobName??t.continuationJob;
      const attemptNumber=t.cpuPending?.attempt??t.cpuAttempt??1;
      const maximumAttempts=t.operatorMaximumCpuAttempts??2;
      if(!Number.isInteger(maximumAttempts)||maximumAttempts<1||maximumAttempts>3)throw Error('EPISODE_CPU_ATTEMPT_LIMIT_INVALID');
      const matchingReceipt=r?.jobName===current?r:null;
      if(matchingReceipt&&!(r.status==='failed'&&r.retryable&&attemptNumber<maximumAttempts))continue;
      if(t.continuationJob&&!t.cpuPending&&!matchingReceipt)continue;
      if(matchingReceipt&&(await store.state(GLOBAL_QUEUE)).cpuSlots?.includes(current))continue;
      if(c.producerJobName){const producer=await store.request(['get','job',c.producerJobName,'-n',store.namespace,'--ignore-not-found','-o','json']);if(producer&&!jobEnded(producer))continue;}
      if(!/^output\/[a-zA-Z0-9_/-]+$/.test(c.outputRoot)||c.outputRoot.split('/').includes('..'))throw Error('EPISODE_CONTINUATION_PATH_INVALID');
      if(c.stopBeforeSeedance!==true)throw Error('EPISODE_CONTINUATION_NOT_AUTHORIZED');
      const attempt=matchingReceipt?attemptNumber+1:t.cpuPending?.attempt??1;
      const jobName=`three-post-${t.input.recipeHash.slice(0,32)}-${attempt}`;
      const checkpoint=matchingReceipt?.retryable?r.checkpointS3Uri:t.cpuPending?.checkpoint??c.checkpointS3Uri;
      if(!checkpoint)throw Error('EPISODE_CPU_RETRY_CHECKPOINT_REQUIRED');
      const args=episodeNodeArguments('workflow',['--source-manifest',t.input.sourceManifestRelativePath,'--output-root',c.outputRoot,'--episode-id',t.input.caseId,'--checkpoint-s3',checkpoint,'--publish-s3',c.publishS3Uri,'--cohort',state.cohortId,'--stop-before-seedance']);
      if(c.until){if(!['capture','pre-seedance'].includes(c.until))throw Error('EPISODE_CONTINUATION_STAGE_INVALID');args.push('--until',c.until);}
      const job=threeEpisodeHostJob({jobId:jobName,image:t.input.workerImage,sourceArchiveS3Uri:t.input.sourceArchiveS3Uri,sourceArchiveSha256:t.input.sourceArchiveSha256,runArgs:args,namespace:store.namespace,cpu:'500m'});job.metadata.annotations={'worldkit.seedleap.dev/batch-hash':t.input.recipeHash};
      job.spec.template.spec.containers[0].env.push({name:'WORLDKIT_CPU_COHORT',value:state.cohortId},{name:'WORLDKIT_CPU_TASK',value:t.input.id});
      applyCpuRouting(job,(await store.state(GLOBAL_QUEUE)).cpuRouting);
      applyStreamingOverlay(job,(await store.state(GLOBAL_QUEUE)).streamingOverlay);
      const reserved=await store.change(GLOBAL_QUEUE,s=>{s.cpuSlots??=[];if(s.paused)return false;if(s.cpuSlots.includes(jobName))return true;const limit=s.maximumCpuSlots??2;if(!Number.isSafeInteger(limit)||limit<1||limit>9)throw Error('EPISODE_CPU_SLOT_LIMIT_INVALID');if(s.cpuSlots.length>=limit)return false;s.cpuSlots.push(jobName);return true;});
      if(!reserved.result)continue;
      // Record intent before create; a lost create response retries exactly this attempt name.
      const intent=await store.change(name,s=>{const task=s.tasks[t.input.id];
        if(s.cancelled||task.cpuReceipt?.jobName===jobName)return false;
        if(task.cpuPending&&task.cpuPending.jobName!==jobName&&!(task.cpuPending.jobName===current&&task.cpuReceipt?.jobName===current&&task.cpuReceipt.status==='failed'&&task.cpuReceipt.retryable))return false;
        task.cpuPending={jobName,attempt,checkpoint};return true;
      });
      if(!intent.result){
        if(!owns(intent.state.tasks[t.input.id],jobName))await store.change(GLOBAL_QUEUE,s=>{s.cpuSlots=s.cpuSlots.filter(slot=>slot!==jobName);});
        continue;
      }
      const created=await ensureJob(store,job,async()=>{
        const latest=await store.state(name),task=latest.tasks[t.input.id];
        return !latest.cancelled&&task.cpuPending?.jobName===jobName&&task.cpuReceipt?.jobName!==jobName;
      });
      if(!created)continue;
      const ack=await store.change(name,s=>{const task=s.tasks[t.input.id];
        if(task.cpuPending?.jobName!==jobName&&task.continuationJob!==jobName)throw Error('EPISODE_CPU_ATTEMPT_STALE');
        task.continuationJob=jobName;task.cpuAttempt=attempt;task.cpuJobUid=created.metadata.uid;delete task.cpuPending;
        if(task.cpuReceipt?.jobName!==jobName)delete task.cpuReceipt;return !s.cancelled;
      });
      if(!ack.result){await store.request(['delete','job',jobName,'-n',store.namespace,'--wait=false','-o','json']);continue;}
      results.push(jobName);
    }
  }return results;
}
