import path from 'node:path';

export function validateProviderWorkspace({jobId,taskId,workDirectory,workspace}) {
  if(!/^gen_[a-f0-9]{8,64}$/.test(jobId??'')||!/^[a-z0-9][a-z0-9-]{2,159}$/.test(taskId??'')||workDirectory!==`/fsx/pipeline/lwdp_generation/${jobId}`)throw Error('THREE_PROVIDER_WORKSPACE_SCOPE_INVALID');
  const direct=`${workDirectory}/tasks/${taskId}`;
  if(typeof workspace!=='string'||path.posix.normalize(workspace)!==workspace||workspace.includes('\\')||workspace.includes('\0'))throw Error('THREE_PROVIDER_WORKSPACE_PATH_INVALID');
  const parent=path.posix.dirname(workspace),attemptName=path.posix.basename(parent);
  if(workspace!==direct&&(path.posix.basename(workspace)!==taskId||path.posix.dirname(parent)!==`${workDirectory}/tasks/account_attempts`||!attemptName.startsWith(taskId+'_')||!/^[A-Za-z0-9_-]{4,64}$/.test(attemptName.slice(taskId.length+1))))throw Error('THREE_PROVIDER_WORKSPACE_PATH_INVALID');
  return workspace;
}

/** Host provider metadata selects a path; the launcher independently binds its identity. */
export function resolveProviderWorkspace({jobId,taskId,workDirectory=`/fsx/pipeline/lwdp_generation/${jobId}`,runtimeHash,providerItem,providerAttempt,live}) {
  if(!/^[a-f0-9]{64}$/.test(runtimeHash??''))throw Error('THREE_PROVIDER_WORKSPACE_RUNTIME_INVALID');
  const candidates=[];
  const add=(workspace,source)=>candidates.push({workspace:validateProviderWorkspace({jobId,taskId,workDirectory,workspace}),source});
  if(providerItem){
    if((providerItem.item_id??providerItem.id)!==taskId)throw Error('THREE_PROVIDER_ITEM_IDENTITY_INVALID');
    const log=providerItem.metadata?.log_path;
    if(log!==undefined){
      if(typeof log!=='string'||!log.endsWith('/logs/codex_attempt.json'))throw Error('THREE_PROVIDER_ATTEMPT_LOG_INVALID');
      add(log.slice(0,-'/logs/codex_attempt.json'.length),'provider-item-log-path');
    }
  }
  if(providerAttempt){
    if((providerAttempt.item_id??providerAttempt.task_id)!==taskId)throw Error('THREE_PROVIDER_ATTEMPT_IDENTITY_INVALID');
    add(providerAttempt.workdir,'provider-codex-attempt');
  }
  if(live?.launcher){
    if(live.observationError||live.jobId!==jobId||live.taskId!==taskId||live.workDir!==workDirectory||live.launcher.runtimeHash!==runtimeHash)throw Error('THREE_PROVIDER_LIVE_IDENTITY_INVALID');
    add(live.resolvedWorkspace,'verified-live-launcher');
  }
  if(new Set(candidates.map(row=>row.workspace)).size>1)throw Error('THREE_PROVIDER_WORKSPACE_CONFLICT');
  const selected=candidates[0]??{workspace:validateProviderWorkspace({jobId,taskId,workDirectory,workspace:`${workDirectory}/tasks/${taskId}`}),source:'configured-task-workspace'};
  return {schemaVersion:1,jobId,taskId,workDirectory,runtimeHash,...selected};
}

export function validateProviderLauncher(binding,launcher) {
  validateProviderWorkspace(binding);
  if(!/^[a-f0-9]{64}$/.test(binding.runtimeHash??'')||launcher?.kind!=='three-creator-launcher-report'||launcher.taskId!==binding.taskId||launcher.workspace!==binding.workspace||launcher.runtimeHash!==binding.runtimeHash)throw Error('THREE_PROVIDER_LAUNCHER_IDENTITY_INVALID');
  return binding.workspace;
}
