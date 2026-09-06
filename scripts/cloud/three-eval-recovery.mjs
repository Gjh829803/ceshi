// Host-owned artifact continuation. No author code is executed here.
import {copyFile,mkdir,readFile,realpath,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256,writeJson,fileSha256} from './three-eval-runtime.mjs';
import {terminalJobHasStopped,assessOwnedJob} from './three-eval-policy.mjs';
import {readVerifiedThreeArtifact} from './three-eval-checkpoints.mjs';
import {withAdmissionDirectoryLock} from './three-eval-admission.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const HASH=/^[a-f0-9]{64}$/;
export const MAXIMUM_MODEL_ATTEMPTS=2;
export async function recoveryJson(file) {try {if(await realpath(file)!==path.resolve(file))throw Error('THREE_RECOVERY_LINK_REJECTED');const info=await stat(file);if(!info.isFile()||info.nlink!==1||info.size>8*1024*1024)throw Error('THREE_RECOVERY_FILE_INVALID');return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export function continuationLineage(manifest) {
  return {kind:'artifact-continuation',parentRunId:manifest.parent.runId,parentJobId:manifest.parent.jobId,parentRequestId:manifest.parent.requestId,attemptNumber:manifest.attemptNumber,maximumModelAttempts:manifest.maximumModelAttempts,sourceKind:manifest.source.kind,sourceHash:manifest.source.sourceHash,...(manifest.fallback?{fallbackSourceHash:manifest.fallback.sourceHash}:{})};
}
export function recoveryDecision(state,job) {
  if(state?.phase==='delivered')return {action:'none',reason:'already-delivered'};
  if(state?.launcherStatus==='delivered')return {action:'retrieve',reason:'launcher-delivered'};
  if(state?.phase==='delivery-pending')return {action:'retrieve',reason:'delivery-only'};
  if(state?.phase!=='failed'||!state.jobId)return {action:'reconcile',reason:'execution-not-confirmed-failed'};
  if(state.continuation?.attemptNumber>=MAXIMUM_MODEL_ATTEMPTS)return {action:'none',reason:'model-attempt-limit'};
  if(!job)return {action:'reconcile',reason:'provider-confirmation-required'};
  if((job.job_id??job.id)!==state.jobId||job.request_id!==state.requestId||job.output_s3_prefix!==state.outputS3Prefix||job.pipeline!=='codex')throw Error('THREE_RECOVERY_PARENT_IDENTITY_MISMATCH');
  if(['cancelled','stopped'].includes(job.status))return {action:'none',reason:'execution-was-cancelled'};
  if(job.progress?.summary?.ray_cleanup_pending===true||job.counters?.running>0)return {action:'reconcile',reason:'execution-cleanup-pending'};
  if(!terminalJobHasStopped(job))return {action:'reconcile',reason:'execution-still-active'};
  // LWDP completed is a finished aggregate, including failed items. It is not
  // proof that this Creator delivered; failed item+launcher may need source continuation.
  if(['succeeded','completed'].includes(job.status) && !(state.itemStatus==='failed' && state.launcherStatus==='failed'))return {action:'retrieve',reason:'provider-completed'};
  const guard=assessOwnedJob(job,{requestId:state.requestId,outputS3Prefix:state.outputS3Prefix,submittedAt:state.submittedAt,maximumTaskSeconds:2700});
  if(guard.action!=='finished'||state.failure?.category==='execution-guard')return {action:'none',reason:'execution-guard'};
  // Same SDK/input identity cannot repair missing infrastructure or tampered
  // receipts. No automatic retries for deterministic Host boundary failures.
  if(['event-evidence','model-cli-version'].includes(state.failure?.category)||/THREE_SOURCE_(?:SYMLINK|PATH_ESCAPE)|THREE_(?:IMPORT_PATH_ESCAPE|PREBUILT_|INSTALLED_)|IDENTITY_MISMATCH|CLOSURE_|CREATOR_EFFECTIVE_CONFIG/.test(state.failure?.message??''))return {action:'none',reason:'host-contract-failure'};
  return {action:'continue',reason:'terminal-incomplete-world'};
}
export async function assertContinuationParent({parentRoot,taskId,manifest,lock,readJob}) {
  if(await recoveryJson(path.join(parentRoot,'halt.json')))throw Error('THREE_RECOVERY_PARENT_HALTED');
  const state=await recoveryJson(path.join(parentRoot,taskId,'state.json'));
  const plan=await recoveryJson(path.join(parentRoot,'evaluation-plan.json'));
  const task=plan?.cases?.find(row=>row.taskId===taskId);
  if(!state||!task||!plan.selectedTaskIds.includes(taskId)||plan.runId!==manifest.parent.runId||plan.runtimeHash!==lock.runtimeHash||task.caseHash!==manifest.caseHash||state.caseHash!==manifest.caseHash||state.runtimeHash!==lock.runtimeHash||state.jobId!==manifest.parent.jobId||state.requestId!==manifest.parent.requestId)throw Error('THREE_RECOVERY_PARENT_IDENTITY_MISMATCH');
  const job=await readJob(state.jobId);
  if(recoveryDecision(state,job).action!=='continue')throw Error('THREE_RECOVERY_PARENT_NOT_STOPPED_AND_RECOVERABLE');
  return state;
}
const artifactRef=value=>({kind:value.kind,receiptFile:'creator-'+value.kind+'.json',archiveFile:'creator-'+value.kind+'.tar.gz',archiveSha256:value.receipt.archiveSha256,sourceHash:value.receipt.sourceHash});
export async function prepareContinuationAssets({parentRoot,caseRoot,taskId,caseHash,lock},{readArtifact=readVerifiedThreeArtifact}={}) {
  const parentPlan=await recoveryJson(path.join(parentRoot,'evaluation-plan.json'));
  const location=continuationLocation(parentRoot,parentPlan?.runId,taskId);
  if(caseRoot!==path.join(location.root,taskId))throw Error('THREE_RECOVERY_CHILD_LOCATION_INVALID');
  const parentCaseRoot=path.join(parentRoot,taskId),state=await recoveryJson(path.join(parentCaseRoot,'state.json'));
  const parentInput=await recoveryJson(path.join(parentCaseRoot,'case-input.json'));
  if(!state||!parentInput||!parentPlan||state.phase!=='failed'||parentPlan.runtimeHash!==lock.runtimeHash||state.runtimeHash!==lock.runtimeHash||state.caseHash!==caseHash||sha256(JSON.stringify(parentInput))!==caseHash||parentInput.taskId!==taskId||parentInput.runtimeHash!==lock.runtimeHash||!/^gen_[a-f0-9]{8,64}$/.test(state.jobId??'')||state.continuation?.attemptNumber>=MAXIMUM_MODEL_ATTEMPTS)throw Error('THREE_RECOVERY_PARENT_IDENTITY_MISMATCH');
  const directory=path.join(caseRoot,'continuation-inputs'),manifestFile=path.join(directory,'creator-continuation.json');
  const prior=await recoveryJson(manifestFile);
  if(prior) {
    if(prior.parent.runId!==parentPlan.runId||prior.parent.jobId!==state.jobId||prior.parent.requestId!==state.requestId||prior.caseHash!==caseHash||prior.creatorRuntimeLockHash!==lock.runtimeHash)throw Error('THREE_RECOVERY_FROZEN_INPUT_CHANGED');
    const files=[manifestFile];
    for(const value of [prior.source,prior.fallback].filter(Boolean)) {
      const prefix='creator-'+value.kind;
      if(!['progress','checkpoint'].includes(value.kind)||value.archiveFile!==prefix+'.tar.gz'||value.receiptFile!==prefix+'.json'||!HASH.test(value.archiveSha256))throw Error('THREE_RECOVERY_FROZEN_INPUT_INVALID');
      const archive=path.join(directory,value.archiveFile),receipt=path.join(directory,value.receiptFile);
      if(await fileSha256(archive)!==value.archiveSha256||(await recoveryJson(receipt))?.archiveSha256!==value.archiveSha256)throw Error('THREE_RECOVERY_FROZEN_INPUT_CHANGED');
      files.push(receipt,archive);
    }
    return {manifest:prior,files,directory};
  }
  const expected={caseId:parentInput.caseId,taskId,profile:parentInput.profile,creatorRuntimeLockHash:lock.runtimeHash,runtimeHash:lock.prebuiltRuntimes[parentInput.profile].runtimeHash};
  const found={},failures=[];
  for(const kind of ['progress','checkpoint'])try{found[kind]=await readArtifact(kind,{caseRoot:parentCaseRoot,expected,jobId:state.jobId});}catch{failures.push(kind);}
  // Keep latest work even if it does not compile. The previous runnable source
  // is separate fallback context, never silently substituted for the WIP.
  const source=found.progress??found.checkpoint;
  if(!source)return {unavailable:true,reason:failures.length?'saved-artifact-invalid':'no-saved-source'};
  const fallback=found.progress&&found.checkpoint?found.checkpoint:null;
  await mkdir(directory,{recursive:true});
  if(await realpath(directory)!==directory)throw Error('THREE_RECOVERY_LINK_REJECTED');
  const files=[];
  for(const value of [source,fallback].filter(Boolean)) {
    const ref=artifactRef(value);
    for(const [from,name] of [[value.archivePath,ref.archiveFile],[value.receiptPath,ref.receiptFile]]){const target=path.join(directory,name);await copyFile(from,target);files.push(target);}
  }
  const manifest={kind:'three-creator-continuation',schemaVersion:1,caseId:parentInput.caseId,taskId,profile:parentInput.profile,creatorRuntimeLockHash:lock.runtimeHash,runtimeHash:expected.runtimeHash,caseHash,
    parent:{runId:parentPlan.runId,jobId:state.jobId,requestId:state.requestId},attemptNumber:2,maximumModelAttempts:MAXIMUM_MODEL_ATTEMPTS,maximumCumulativeModelSeconds:MAXIMUM_MODEL_ATTEMPTS*lock.maximumTaskSeconds,
    source:artifactRef(source),fallback:fallback?artifactRef(fallback):null,
    failure:{category:['timeout','account-usage','model-capacity','mcp-startup','runtime-browser','world-validation','transport','output-omission','unclassified'].includes(state.failure?.category)?state.failure.category:'unclassified',code:'PREVIOUS_ATTEMPT_INCOMPLETE'},
    remainingWork:['Continue the restored world and original user requirements; inspect the current files before editing.', 'Reuse existing planning images and assets unless a concrete defect requires changing them.', 'Inspect the actual opening Preview, repair observed errors, and complete world_submit with fresh tool receipts.', 'If latest work is broken, inspect the preserved runnable fallback and repair or selectively reuse it; do not discard later work without inspection.']};
  await writeJson(manifestFile,manifest);files.unshift(manifestFile);
  return {manifest,files,directory};
}
export function continuationLocation(parentRoot,parentRunId,taskId) {
  const runId='wk3-continue-'+sha256(parentRunId+':'+taskId).slice(0,20)+'-a2';
  return {runId,relativeDirectory:'continuations/'+runId,root:path.join(parentRoot,'continuations',runId)};
}
export async function registerContinuationRun(parentRoot,child) {
  await withAdmissionDirectoryLock(path.join(parentRoot,'.recovery-locks'),'index',async()=>{
    const indexFile=path.join(parentRoot,'recovery-runs.json');
    const previous=await recoveryJson(indexFile)??{kind:'three-creator-recovery-runs',schemaVersion:1,runs:[]};
    if(previous.kind!=='three-creator-recovery-runs'||previous.schemaVersion!==1||!Array.isArray(previous.runs)||previous.runs.length>10)throw Error('THREE_RECOVERY_INDEX_INVALID');
    const existing=previous.runs.find(row=>row.runId===child.runId);
    if(existing&&existing.relativeDirectory!==child.relativeDirectory)throw Error('THREE_RECOVERY_INDEX_IDENTITY_MISMATCH');
    if(!existing){previous.runs.push({runId:child.runId,relativeDirectory:child.relativeDirectory});await writeJson(indexFile,previous);}
  },{waitMilliseconds:10000});
}
export function runRecoveryCoordinator(args,{runner=path.join(here,'three-eval-runner.mjs'),env=process.env}={}) {
  return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[runner,...args],{env,stdio:'inherit'});child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
}
