import {isEqual} from 'lodash-es';
import {buildGpuCaptureQueueEntry,selectGpuCaptureBatch,cloudProductionContentHash} from '../lib/cloud-production-run.mjs';
const id = value => {if(!/^[a-z0-9][a-z0-9-]{2,119}$/.test(value??''))throw Error('EPISODE_BATCH_ID_INVALID');return value;};
export function newCohort(cohortId,caseIds){
  id(cohortId);if(!Array.isArray(caseIds)||!caseIds.length||caseIds.length>250||new Set(caseIds).size!==caseIds.length)throw Error('EPISODE_COHORT_CASES_INVALID');
  return {schemaVersion:1,cohortId,sealed:true,cancelled:false,cases:Object.fromEntries(caseIds.map(c=>[id(c),{status:'pending'}])),tasks:{}};
}
export function closeProducer(state,caseId,status){
  if(!['failed-final','cancelled-final'].includes(status)||!state.cases[caseId])throw Error('EPISODE_PRODUCER_STATUS_INVALID');
  const prior=state.cases[caseId];if(prior.status!=='pending'&&prior.status!==status)throw Error('EPISODE_PRODUCER_TERMINAL');prior.status=status;
}
export function enqueueCapture(state,task){
  if(state.cancelled)throw Error('EPISODE_COHORT_CANCELLED');
  id(task.id);if(!state.cases[task.caseId])throw Error('EPISODE_CASE_NOT_REGISTERED');
  if(['failed-final','cancelled-final'].includes(state.cases[task.caseId].status))throw Error('EPISODE_PRODUCER_TERMINAL');
  const prior=state.tasks[task.id];
  if(prior){if(!isEqual(prior.input,task))throw Error('EPISODE_TASK_CONFLICT');return;}
  // New recipes for the same case are repair work only after its prior capture ended.
  const previous=Object.values(state.tasks).filter(t=>t.input.caseId===task.caseId);
  if(previous.some(t=>!t.receipt))throw Error('EPISODE_CASE_ALREADY_QUEUED');
  state.tasks[task.id]={input:task,status:'ready',...(previous.length?{repairOf:previous.at(-1).input.id}:{} )};
  state.cases[task.caseId].status='succeeded';
}
export function upstreamComplete(state){return state.sealed && Object.values(state.cases).every(c=>['succeeded','failed-final','cancelled-final'].includes(c.status));}
function queueEntry(t){return buildGpuCaptureQueueEntry({executionId:t.id,sceneId:`three-${t.worldBuildHash.slice(0,24)}`,episodeId:t.caseId,stageId:'whitebox-capture',stageAttempt:1,workerImage:t.workerImage,prepareManifestS3Uri:t.inputS3Uri,prepareManifestHash:`sha256:${t.inputHash}`,inputIdentityHash:`sha256:${t.recipeHash}`,requestS3Uri:t.inputS3Uri,outputS3Prefix:t.outputS3Prefix,createdAt:t.createdAt});}
export function selectBatch(state){
  if(state.cancelled)return null;
  const ready=Object.values(state.tasks).filter(t=>t.status==='ready');
  if(!ready.length)return null;
  const entries=ready.map(t=>queueEntry(t.input));
  try{return selectGpuCaptureBatch(entries,{maximumBatchSize:100});}catch(e){if(e.code!=='GPU_CAPTURE_BATCH_NOT_READY')throw e;}
  const closed=upstreamComplete(state);
  const candidates=closed?ready:ready.filter(t=>t.repairOf||t.admittedBatchId);
  if(!candidates.length)return null;
  const oldest=candidates.sort((a,b)=>a.input.createdAt.localeCompare(b.input.createdAt)||a.input.id.localeCompare(b.input.id))[0];
  const tasks=candidates.filter(t=>t.input.workerImage===oldest.input.workerImage).slice(0,100).map(t=>queueEntry(t.input));
  const producerClosure={cohortId:state.cohortId,caseListHash:cloudProductionContentHash(Object.keys(state.cases).sort()),registered:Object.keys(state.cases).length,terminal:Object.values(state.cases).filter(c=>c.status!=='pending').length,sealed:state.sealed,repairTaskIds:closed?[]:tasks.map(t=>t.executionId)};
  const identity={workerImage:tasks[0].workerImage,dispatchReason:'producer-complete',executionIds:tasks.map(t=>t.executionId),entryHashes:tasks.map(cloudProductionContentHash),producerClosure};
  const batchHash=cloudProductionContentHash(identity);
  return {kind:'worldkit-gpu-capture-batch-manifest',schemaVersion:1,batchId:`gpu-capture-${batchHash.slice(7,31)}`,batchHash,workerImage:identity.workerImage,minimumBatchSize:100,taskCount:tasks.length,createdAt:new Date().toISOString(),dispatchReason:identity.dispatchReason,producerClosure,tasks};
}
export function completeCapture(state,taskId,receipt){
  const t=state.tasks[taskId];if(!t)throw Error('EPISODE_TASK_MISSING');
  if(t.receipt){if(!isEqual(t.receipt,receipt))throw Error('EPISODE_RECEIPT_CONFLICT');return;}
  if(!['capture-succeeded','capture-failed','capture-cancelled'].includes(receipt.status))throw Error('EPISODE_RECEIPT_INVALID');
  t.receipt=receipt;t.status='completed';
}
