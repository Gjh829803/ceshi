// Experiment policy is Host-owned. Neither retries nor absent billing data can
// turn an unknown request into permission for another model invocation.
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
export const MAXIMUM_QUEUE_SECONDS = 1800;
export const STOP_DRAIN_SECONDS = 180;
export function creativePromptFromSource(original) {
  return original.split('【本轮新版评测策略')[0].trimEnd()
    .replaceAll('方块白膜世界', '白膜世界')
    .replaceAll('严格居中的正后方可玩视角', '与参考图一致的首帧相机视角');
}
export function terminalJobHasStopped(job) {
  if (['succeeded','completed','failed','submit_failed'].includes(job?.status)) return true;
  return ['cancelled','stopped'].includes(job?.status) && job.progress?.summary?.ray_cleanup_checked === true && job.progress.summary.ray_cleanup_pending === false;
}
export function assessOwnedJob(job,{requestId,outputS3Prefix,submittedAt,maximumTaskSeconds,hasObservedCliActivity=false,now=Date.now()}) {
  if (job.request_id !== requestId || job.output_s3_prefix !== outputS3Prefix || job.pipeline !== 'codex') return {action:'halt-unowned',reason:'unexpected-job-identity'};
  if (job.attempt !== undefined && (!Number.isSafeInteger(job.attempt) || job.attempt < 0 || job.attempt > 1)) return {action:'stop',reason:'unexpected-provider-reattempt'};
  if (job.counters?.total !== undefined && (!Number.isSafeInteger(job.counters.total) || job.counters.total < 0 || job.counters.total > 1)) return {action:'stop',reason:'unexpected-task-fanout'};
  if (terminalJobHasStopped(job)) return {action:'finished'};
  const start=Date.parse(submittedAt);
  if (!Number.isFinite(start)||start>now+60000) return {action:'stop',reason:'invalid-durable-start-time'};
  const elapsedSeconds=(now-start)/1000;
  if (elapsedSeconds>MAXIMUM_QUEUE_SECONDS+maximumTaskSeconds+STOP_DRAIN_SECONDS) return {action:'stop',reason:'total-wall-deadline',elapsedSeconds};
  if (!hasObservedCliActivity && elapsedSeconds>MAXIMUM_QUEUE_SECONDS && job.counters?.queued===1 && job.counters?.running===0 && job.counters?.succeeded===0 && job.counters?.failed===0) return {action:'stop',reason:'queue-deadline',elapsedSeconds};
  if (['cancelled','stopped'].includes(job.status)) return {action:'stop-pending',reason:'ray-cleanup-unconfirmed',elapsedSeconds};
  return {action:'continue',elapsedSeconds};
}
export function effectiveConfigMatches(config,payload) {
  if(config?.request_id!==payload.request_id||config?.options?.codex_bin!==payload.options.codex_bin)return false;
  return ['model','reasoning_effort','sandbox','timeout_seconds','account_concurrency','pod_concurrency'].every(key=>config.options[key]===payload.defaults[key]);
}
export async function reportedTokenUsage(file) {
  const turns=[];
  try {for await(const line of createInterface({input:createReadStream(file),crlfDelay:Infinity})){
    let event;try{event=JSON.parse(line);}catch{continue;}
    if(event.type!=='turn.completed'||!event.usage||typeof event.usage!=='object')continue;
    const values=Object.fromEntries(['input_tokens','cached_input_tokens','output_tokens'].filter(key=>Number.isSafeInteger(event.usage[key])&&event.usage[key]>=0).map(key=>[key,event.usage[key]]));
    if(Object.keys(values).length)turns.push(values);
  }}catch(error){if(error.code!=='ENOENT')throw error;}
  return {authority:'CLI reported counters in the retained event stream',available:turns.length>0,completedTurns:turns,monetaryCost:null,monetaryCostReason:'No per-job billing ledger is exposed; token counts are not currency charges.'};
}
