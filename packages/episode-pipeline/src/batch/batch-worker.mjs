import {episodeNodeArguments} from '../cloud/frozen-entrypoints.mjs';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,rm,readdir,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runGpuCaptureBatch} from './gpu-capture-batch.mjs';
import {createCloudClient} from '../cloud/cloud.mjs';
import {materializeThreeEpisodeConfig} from '../cloud/cloud-host.mjs';
import {GLOBAL_QUEUE,createBatchStore} from './batch-store.mjs';
import {completeCapture} from './batch-state.mjs';
import {claimBatch} from './batch-controller.mjs';
const exec=promisify(execFile);
const sha=b=>createHash('sha256').update(b).digest('hex');
async function execute(command,args,{cwd,timeout=900_000,onTick=async()=>{}}={}){
  const child=spawn(command,args,{cwd,env:{...process.env,WORLDKIT_CAPTURE_GPU:'1'},stdio:'inherit',detached:true});
  let fault;const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}};
  const timer=setTimeout(()=>{fault=Error('EPISODE_CAPTURE_DEADLINE');kill();},timeout);
  let checking=false;const interval=setInterval(async()=>{if(checking)return;checking=true;try{await onTick();}catch(e){fault=e;kill();}finally{checking=false;}},10_000);
  const stop=()=>{fault=Error('EPISODE_CAPTURE_INTERRUPTED');kill();};process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});if(fault)throw fault;return code;}finally{clearTimeout(timer);clearInterval(interval);process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}
export async function runCaptureInput(input,{root='/episode-batch',guard=async()=>{},resumeCapture=false}={}){
  if(!/^[a-f0-9]{64}$/.test(input.sourceArchiveSha256??''))throw Error('EPISODE_SOURCE_ARCHIVE_HASH_REQUIRED');
  const cacheRoot=path.join(root,'capsules');await mkdir(cacheRoot,{recursive:true});
  for(const name of await readdir(cacheRoot))if(/^[a-f0-9]{64}$/.test(name)&&name!==input.sourceArchiveSha256)await rm(path.join(cacheRoot,name),{recursive:true,force:true});
  const workspace=path.join(cacheRoot,input.sourceArchiveSha256),marker=path.join(workspace,'.batch-capsule-ready');
  let cached=false;try{cached=(await readFile(marker,'utf8'))===input.sourceArchiveSha256;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!cached){await rm(workspace,{recursive:true,force:true});await mkdir(workspace,{recursive:true});}
  try{
    const io=createCloudClient();const archive=path.join(workspace,'source.tar.gz');
    if(!cached){await io.downloadArtifact(input.sourceArchiveS3Uri,archive);
    if((await lstat(archive)).size>1024**3)throw Error('EPISODE_CAPSULE_COMPRESSED_SIZE_LIMIT');
    if(sha(await readFile(archive))!==input.sourceArchiveSha256)throw Error('EPISODE_SOURCE_ARCHIVE_CHANGED');
    // Capsules are trusted, hash-locked build artifacts, not model-uploaded archives.
    if(await execute('tar',['-xzf',archive,'-C',workspace],{timeout:120_000,onTick:guard})!==0)throw Error('EPISODE_CAPSULE_UNPACK_FAILED');
    await rm(archive);const usage=await exec('du',['-sk',workspace]);if(Number(usage.stdout.split(/\s+/)[0])*1024>4*1024**3)throw Error('EPISODE_CAPSULE_CACHE_SIZE_LIMIT');await writeFile(marker,input.sourceArchiveSha256);}
    await materializeThreeEpisodeConfig({repoRoot:workspace,captureOnly:true});
    const cloud=createCloudClient({repoRoot:workspace});
    const planFile=path.join(workspace,'batch-plan.json');await cloud.downloadArtifact(input.planS3Uri,planFile);
    if(sha(await readFile(planFile))!==input.planHash)throw Error('EPISODE_PLAN_CHANGED');
    const outputRoot='/episode/output/capture';await rm(outputRoot,{recursive:true,force:true});
    if(resumeCapture){try{await cloud.hydrateDirectory(input.outputS3Prefix,outputRoot);}catch(e){if(!/NoSuchKey|Not Found|404/.test(e.message))throw e;}}
    const args=episodeNodeArguments('workflow',['--capture-only','--source-manifest',input.sourceManifestRelativePath,'--plan',planFile,'--output-root',outputRoot,'--publish-s3',input.outputS3Prefix,'--stop-before-seedance']);
    if(input.segmentIds)args.push('--segment-ids',input.segmentIds.join(','));
    const exit=await execute(process.execPath,args,{cwd:workspace,onTick:guard});
    if(exit!==0&&exit!==2)throw Error(`EPISODE_CAPTURE_EXIT_${exit}`);
    // Verify the published manifest against local bytes. CPU admission downloads and verifies the media;
    // the GPU need not download a second copy of its own recordings.
    const publication=path.join(workspace,'batch-published-manifest.json');await cloud.downloadArtifact(`${input.outputS3Prefix}/artifact-manifest.json`,publication);
    await verifyCapturePublication(outputRoot,JSON.parse(await readFile(publication,'utf8')));
    const summary=JSON.parse(await readFile(path.join(outputRoot,'capture-summary.json'),'utf8'));
    if(summary.worldBuildHash!==input.worldBuildHash)throw Error('EPISODE_CAPTURE_OUTPUT_IDENTITY');
    return summary;
  }catch(e){if(!cached)await rm(workspace,{recursive:true,force:true});throw e;}
}
export async function verifyCapturePublication(root,manifest){
 if(manifest.kind!=='three-episode-artifact-manifest'||!manifest.files?.length)throw Error('EPISODE_CAPTURE_PUBLICATION_INVALID');
 for(const entry of manifest.files){const file=path.resolve(root,entry.path),relative=path.relative(root,file);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('EPISODE_CAPTURE_PUBLICATION_PATH');const bytes=await readFile(file);if(sha(bytes)!==entry.sha256||bytes.length!==entry.byteLength)throw Error('EPISODE_CAPTURE_PUBLICATION_HASH');}
}

export async function runBatchWorker({store=createBatchStore(),batchId,runCapture=runCaptureInput,verifyPlacement=true}={}){
  let active=(await store.state(GLOBAL_QUEUE)).active;
  if(active?.batch.batchId!==batchId)throw Error('EPISODE_BATCH_NOT_OWNED');
  if(verifyPlacement){
    const pod=await store.request(['get','pod',process.env.WORLDKIT_BATCH_POD,'-n',store.namespace,'-o','json']);
    if(!pod.metadata.ownerReferences?.some(r=>r.kind==='Job'&&r.name===active.jobName))throw Error('EPISODE_WORKER_JOB_MISMATCH');
    const node=await store.request(['get','node',pod.spec.nodeName,'-o','json']);
    if(node.metadata.labels['node.kubernetes.io/instance-type']!=='g6.2xlarge'||node.metadata.labels['karpenter.sh/nodepool']!=='worldkit-episode-graphics')throw Error('EPISODE_GPU_PLACEMENT_FORBIDDEN');
    const nodeRef={nodeName:pod.spec.nodeName,providerId:node.spec.providerID};
    await store.change(GLOBAL_QUEUE,s=>{if(s.active?.batch.batchId!==batchId)throw Error('EPISODE_BATCH_OWNER_CHANGED');s.active.node=nodeRef;});active.node=nodeRef;
  }
  for(;;){
    const current=active;
    async function guard(){const global=await store.state(GLOBAL_QUEUE);const cohort=await store.state(current.cohortName);if(global.paused||global.active?.batch.batchId!==current.batch.batchId||global.active?.jobName!==current.jobName||cohort.cancelled)throw Error('EPISODE_BATCH_CANCELLED');}
    const state=await store.state(current.cohortName);
    const prior=new Map(Object.values(state.tasks).filter(t=>t.receipt).map(t=>[t.input.id,t.receipt]));
    await runGpuCaptureBatch({manifest:current.batch,queueS3Prefix:'s3://unused/metadata-only',taskLeaseSeconds:900,priorReceipts:prior,
      inspectTaskImplementation:async()=>{await guard();return null;},
      runCaptureImplementation:async task=>{await guard();await store.change(GLOBAL_QUEUE,s=>{if(s.active?.jobName!==current.jobName)throw Error('EPISODE_BATCH_OWNER_CHANGED');s.active.task={id:task.executionId,startedAt:new Date().toISOString()};});if(task.prepareManifestHash!==`sha256:${state.tasks[task.executionId].input.inputHash}`||task.inputIdentityHash!==`sha256:${state.tasks[task.executionId].input.recipeHash}`)throw Error('EPISODE_BATCH_INPUT_CHANGED');await runCapture(state.tasks[task.executionId].input,{guard,resumeCapture:state.tasks[task.executionId].attempts>1});},
      launchRenderImplementation:async()=>{}, // CPU reconciler owns the durable continuation; never launch the legacy Seedance pipeline.
      publishTaskReceiptImplementation:async receipt=>{await guard();await store.change(current.cohortName,s=>completeCapture(s,receipt.executionId,receipt));await store.change(GLOBAL_QUEUE,s=>{if(s.active?.jobName===current.jobName)s.active.task=null;});},
      deleteQueueEntryImplementation:async()=>{},
    });
    await guard();
    // Reuse the same Pod only while the original absolute deadline has room for another admitted batch.
    active=await claimBatch(store,{previous:current,image:current.batch.workerImage,deadlineAt:current.deadlineAt});
    if(!active)return {status:'drained',jobName:current.jobName};
  }
}
