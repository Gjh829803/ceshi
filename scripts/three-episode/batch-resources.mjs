import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {GLOBAL_QUEUE} from './batch-store.mjs';
const execute=promisify(execFile);
/** Read-only verification; shared nodes are never terminated by an Episode worker. */
export function resourceInspector({repoRoot=process.cwd(),run=execute}={}){
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('AWS_')));
 Object.assign(env,{AWS_SHARED_CREDENTIALS_FILE:path.join(repoRoot,'.codex-tmp/runtime-config/aws-credentials'),AWS_CONFIG_FILE:path.join(repoRoot,'.codex-tmp/runtime-config/aws-config'),AWS_PROFILE:'default'});
 return async (providerId, prior={})=>{
  const id=/\/(i-[a-f0-9]+)$/.exec(providerId??'')?.[1];if(!id)throw Error('EPISODE_INSTANCE_ID_UNKNOWN');
  const {stdout}=await run('aws',['ec2','describe-instances','--region','us-east-2','--instance-ids',id,'--output','json'],{env,maxBuffer:2*1024*1024,timeout:12000});
  const response=JSON.parse(stdout),instance=response.Reservations?.flatMap(r=>r.Instances).find(i=>i.InstanceId===id);
  if(!instance)throw Error('EPISODE_INSTANCE_NOT_FOUND');
  const result={instanceId:id,instanceState:instance.State.Name,spotClosed:!instance.SpotInstanceRequestId,volumesClosed:false};
  if(instance.SpotInstanceRequestId){const r=await run('aws',['ec2','describe-spot-instance-requests','--region','us-east-2','--spot-instance-request-ids',instance.SpotInstanceRequestId,'--output','json'],{env,timeout:12000});const spot=JSON.parse(r.stdout).SpotInstanceRequests?.[0];result.spotClosed=!!spot&&['closed','cancelled','failed'].includes(spot.State);}
  const volumeIds=[...new Set([...(prior.volumeIds??[]),...(instance.BlockDeviceMappings??[]).map(m=>m.Ebs?.VolumeId).filter(Boolean)])];
  const deleted=await Promise.all(volumeIds.map(async volumeId=>{
    try{await run('aws',['ec2','describe-volumes','--region','us-east-2','--volume-ids',volumeId,'--output','json'],{env,timeout:12000});return false;}
    catch(e){if(/InvalidVolume\.NotFound/.test(String(e.stderr??e.message)))return true;throw e;}
  }));
  // An absent mapping is missing evidence, not proof that a detached volume was deleted.
  result.volumeIds=volumeIds;result.volumesClosed=volumeIds.length>0&&deleted.every(Boolean);
  return result;
 };
}
export async function reconcileResourceClosures(store,inspect=resourceInspector()){
 let global;try{global=await store.state(GLOBAL_QUEUE);}catch(e){if(e.message==='EPISODE_QUEUE_NOT_REGISTERED')return [];throw e;}
 const updates=[];
 for(const closure of global.closures??[]){
  if(closure.status==='resource-closed')continue;
  const next={...closure,checkedAt:new Date().toISOString()};
  try{if(!closure.nodes.length)throw Error('EPISODE_NODE_EVIDENCE_MISSING');next.instances=await Promise.all(closure.nodes.map(n=>inspect(n.providerId,closure.instances?.find(i=>n.providerId?.endsWith('/'+i.instanceId))??n)));next.status=next.instances.every(i=>i.instanceState==='terminated'&&i.spotClosed&&i.volumesClosed)?'resource-closed':'cleanup-pending';delete next.error;}catch(e){next.status='cleanup-pending';next.error=String(e.message).slice(0,500);}
  next.attentionRequired=next.status!=='resource-closed'&&Date.now()-Date.parse(next.finishedAt??next.checkedAt)>600000;
  updates.push(next);
 }
 if(updates.length)await store.change(GLOBAL_QUEUE,s=>{for(const next of updates){const index=s.closures.findIndex(c=>c.jobName===next.jobName);if(index>=0)s.closures[index]=next;}});
 return updates;
}
