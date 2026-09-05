#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lwdpRequest,cancelGenerationJob,findGenerationJobByRequestId,submittedJobId} from '../lib/lwdp-generation-client.mjs';
import {writeJson} from './three-eval-runtime.mjs';
import {terminalJobHasStopped} from './three-eval-policy.mjs';
const boundedFetch=(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(30000)});
const requestOptions={fetchImplementation:boundedFetch,maxAttempts:1};
export async function stopOwnedThreeJob({jobId,requestId,outputS3Prefix,evidenceRoot,reason,waitMilliseconds=120000,readJob=async id=>{const data=await lwdpRequest(`/api/v1/generation/jobs/${id}`,requestOptions);return data.job??data;},cancelJob=id=>cancelGenerationJob(id,requestOptions)}) {
  if(!/^gen_[a-f0-9]+$/.test(jobId)||!requestId.startsWith('wk3-')||!outputS3Prefix.startsWith('s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk/three-creator/'))throw new Error('THREE_STOP_SCOPE_INVALID');
  const owned=job=>job.job_id===jobId&&job.request_id===requestId&&job.output_s3_prefix===outputS3Prefix&&job.pipeline==='codex';
  let job=await readJob(jobId);if(!owned(job))throw new Error('THREE_STOP_FOREIGN_IDENTITY');
  const report={kind:'three-creator-controlled-stop',jobId,requestId,outputS3Prefix,reason,requestedAt:new Date().toISOString(),status:'requested',apiStopRequested:false,rayCleanupConfirmed:false};
  await mkdir(evidenceRoot,{recursive:true});const reportPath=path.join(evidenceRoot,'stop-report.json');
  if(terminalJobHasStopped(job)){Object.assign(report,{status:'confirmed-terminal',providerStatus:job.status,rayCleanupConfirmed:true});await writeJson(reportPath,report);return report;}
  const intentFile=path.join(evidenceRoot,'stop-intent.json');let existing=false;
  try{const intent=JSON.parse(await readFile(intentFile,'utf8'));if(intent.jobId!==jobId||intent.requestId!==requestId)throw new Error('THREE_STOP_INTENT_IDENTITY');existing=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!existing){await writeFile(intentFile,JSON.stringify({jobId,requestId,reason,at:report.requestedAt})+'\n',{flag:'wx'});try{await cancelJob(jobId);report.apiStopRequested=true;}catch(error){report.cancelTransportError=error.message;}}
  else report.reconciledExistingStop=true;
  const deadline=Date.now()+waitMilliseconds;
  for(;;){
    try{job=await readJob(jobId);if(!owned(job))throw new Error('THREE_STOP_FOREIGN_IDENTITY');report.providerStatus=job.status;report.rayCleanup={checked:job.progress?.summary?.ray_cleanup_checked??null,pending:job.progress?.summary?.ray_cleanup_pending??null,stopRequested:job.progress?.summary?.ray_stop_requested??null};if(terminalJobHasStopped(job)){report.status='confirmed-terminal';report.rayCleanupConfirmed=true;break;}}
    catch(error){report.lookupError=error.message;}
    if(Date.now()>=deadline){report.status='stop-pending';break;}
    await new Promise(resolve=>setTimeout(resolve,Math.min(5000,deadline-Date.now())));
  }
  report.finishedAt=new Date().toISOString();await writeJson(reportPath,report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!['--case-root','--reason'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Use --case-root <existing Three task> --reason <reason>');options[args[i]]=args[i+1];}
 if(!options['--case-root']||!options['--reason'])throw new Error('case-root and reason are required');
 const root=path.resolve(options['--case-root']);const state=JSON.parse(await readFile(path.join(root,'state.json'),'utf8'));
 const jobId=state.jobId??submittedJobId(await findGenerationJobByRequestId(state.requestId,requestOptions));
 const report=await stopOwnedThreeJob({jobId,requestId:state.requestId,outputS3Prefix:state.outputS3Prefix,evidenceRoot:root,reason:options['--reason']});
 console.log(JSON.stringify(report));if(!report.rayCleanupConfirmed)process.exitCode=1;
}
