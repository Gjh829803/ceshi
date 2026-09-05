import {mkdir,rmdir} from 'node:fs/promises';
import path from 'node:path';

// Account/model compatibility survives SDK releases. Source runtime identity is
// retained as provenance; artifact publication still requires its exact runtime.
export function validateSuccessfulAccountRoutingEvidence({state,items,configEcho,launcherReport}, {expectedCodexBinarySha256}={}) {
  const requireEvidence=(valid,reason)=>{if(!valid)throw new Error(`THREE_ACCOUNT_ROUTING_INVALID_EVIDENCE: ${reason}`);};
  const model='gpt-6-astra',effort='xhigh';
  requireEvidence(state?.phase==='delivered'&&['succeeded','completed'].includes(state.providerStatus),'source-not-delivered');
  requireEvidence(/^gen_[a-z0-9]+$/.test(state.jobId??'')&&typeof state.requestId==='string'&&state.requestId.length>0,'source-job-identity');
  requireEvidence(/^[a-z0-9][a-z0-9-]{2,79}$/.test(state.caseId??'')&&['three-raw','three-sdk'].includes(state.profile)&&state.taskId===`${state.caseId}--${state.profile}`,'source-task-identity');
  requireEvidence(/^[a-f0-9]{64}$/.test(state.runtimeHash??''),'source-runtime-provenance');
  requireEvidence(state.model===model&&state.reasoningEffort===effort,'source-model-or-effort');
  const config=configEcho?.config,effective=config?.options;
  requireEvidence(configEcho?.job_id===state.jobId&&config?.job_id===state.jobId&&config.request_id===state.requestId&&config.pipeline==='codex','service-job-identity');
  requireEvidence(effective?.model===model&&effective.reasoning_effort===effort,'service-model-or-effort');
  const tasks=config.items?.filter(item=>item.id===state.taskId);
  requireEvidence(tasks?.length===1&&(!tasks[0].task_id||tasks[0].task_id===state.taskId),'service-task-identity');
  requireEvidence((!tasks[0].model||tasks[0].model===model)&&(!tasks[0].reasoning_effort||tasks[0].reasoning_effort===effort),'service-task-model-or-effort');
  const matched=items?.items?.filter(item=>item.item_id===state.taskId);
  requireEvidence(matched?.length===1&&matched[0].status==='succeeded','service-item-not-succeeded');
  const metadata=matched[0].metadata;
  requireEvidence(metadata?.model===model&&metadata.reasoning_effort===effort,'item-model-or-effort');
  const accountId=metadata.codex_account_id;
  requireEvidence(typeof accountId==='string'&&accountId.trim().length>0&&accountId.length<=256&&accountId!=='.'&&accountId!=='..'&&!/[\\/\x00-\x1f]/.test(accountId),'account-metadata-id');
  requireEvidence(launcherReport?.kind==='three-creator-launcher-report'&&launcherReport.status==='delivered'&&launcherReport.caseId===state.caseId&&launcherReport.taskId===state.taskId&&launcherReport.profile===state.profile&&launcherReport.runtimeHash===state.runtimeHash,'launcher-source-identity');
  requireEvidence(launcherReport.model===model&&launcherReport.reasoningEffort===effort,'launcher-model-or-effort');
  requireEvidence(/^[a-f0-9]{64}$/.test(expectedCodexBinarySha256??'')&&launcherReport.codexBinarySha256===expectedCodexBinarySha256,'pinned-codex-binary');
  return {accountId,jobId:state.jobId,taskId:state.taskId,sourceRuntimeHash:state.runtimeHash,codexBinarySha256:launcherReport.codexBinarySha256,model,reasoningEffort:effort};
}

// Capacity reservations are serialized across processes. Brief filesystem-lock
// contention is not the business condition "four requests are still active".
// A crashed coordinator's lock is never guessed stale and removed here.
export async function withAdmissionDirectoryLock(root,key,work,{waitMilliseconds=0}={}) {
  await mkdir(root,{recursive:true});
  const directory=path.join(root,`${key}.lock`),deadline=Date.now()+waitMilliseconds;
  for(;;){
    try{await mkdir(directory);break;}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      if(Date.now()>=deadline)throw new Error(`CREATOR_CASE_ADMISSION_BUSY: ${key}; another coordinator holds this lock`);
      await new Promise(resolve=>setTimeout(resolve,25));
    }
  }
  try{return await work(path.join(root,`${key}.json`));}
  finally{await rmdir(directory);}
}
