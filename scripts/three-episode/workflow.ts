import { caseRuntimeConfig } from './case-config.js';
import { PLAYER_CAPTURE_VERSION } from './playback-policy.mjs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEpisodeSource } from './source.js';
import { canonicalHash, PRE_SEEDANCE_PROFILE, assertPreSeedanceProfile, validateEpisodePlan, type EpisodePlan, type EpisodeSourceManifest } from './contracts.js';
import { runCaptureSegments, normalizeCaptureForVisuals, type CaptureSummary } from './capture.js';
import { createCloudClient, type CloudClient } from './cloud.mjs';
import { createBatchQueue, recordCpuReceipt } from './batch-controller.mjs';
import { createBatchStore } from './batch-store.mjs';
import { createCaptureDispatcher } from './capture-cloud.mjs';
import { runThreeEpisodeVisuals } from './visuals.mjs';
import { enqueueDeliveredWorld } from './outbox.mjs';
import { renderEpisodeReport } from './report.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
async function json(file: string): Promise<any> { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error: any) { if (error.code === 'ENOENT') return null; throw error; } }
async function save(file: string, value: unknown) { await mkdir(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.part`; await writeFile(temporary, JSON.stringify(value, null, 2) + '\n'); await rename(temporary, file); }
type Cloud = CloudClient;
export function isRepairableRouteFailure(code: string): boolean {
  if (/^EPISODE_ACTION_(?:REJECTED|TARGET_MISSING|TARGET_APPROACH_MISSING|APPROACH_TOO_FAR|CLIMB_REQUIRED|WATER_REQUIRED|TIMEOUT|INCOMPLETE|DISPLACEMENT_SHORT)$/.test(code)) return true;
  return /^(?:ROUTE_(?:BLOCKED|BACKTRACK_BLOCKED|VERTICAL_MISMATCH)|EPISODE_(?:START_INVALID|ROUTE_TOO_SHORT|MOVEMENT_BLOCKED|SUBJECT_STATIONARY|UNSUPPORTED_GROUND|CAPTURE_HEALTH))$/.test(code);
}
export interface EpisodeWorkflowOptions {
  sourceManifestPath: string; outputRoot: string; episodeId?: string;
  until?: 'plan' | 'capture' | 'pre-seedance'; stopBeforeSeedance: true;
  runtimeConfig?: Record<string, any>; cloud?: Cloud;
  capture?: (options: { sourceManifestPath: string; planPath: string; outputRoot: string; worldBuildHash: string; segmentIds?: string[]; caseId?: string; cohortId?: string; continuation?: any }) => Promise<CaptureSummary>;
  batchQueue?: ReturnType<typeof createBatchQueue>;
  onProgress?: (state: any) => void | Promise<void>; publishS3Prefix?: string;
}
export async function runEpisodeWorkflow(options: EpisodeWorkflowOptions) {
  if (options.stopBeforeSeedance !== true || !['plan', 'capture', 'pre-seedance'].includes(options.until ?? 'pre-seedance')) throw new Error('EPISODE_VIDEO_NOT_AUTHORIZED');
  const source = await loadEpisodeSource(options.sourceManifestPath), output = path.resolve(options.outputRoot);
  const episodeId = options.episodeId ?? `episode-${source.worldId.slice(0, 60)}-${canonicalHash({ worldBuildHash: source.worldBuildHash, profile: PRE_SEEDANCE_PROFILE }).slice(0, 12)}`;
  const conf = caseRuntimeConfig(options.runtimeConfig ?? await json(path.join(REPO, '.codex-tmp/three-episode-runtime.json')) ?? {}, options.sourceManifestPath, REPO, digest(await readFile(options.sourceManifestPath)));
  if(process.env.WORLDKIT_SOURCE_ARCHIVE_SHA256)conf.sourceArchiveSha256=process.env.WORLDKIT_SOURCE_ARCHIVE_SHA256;
  const queue=options.batchQueue??(conf.captureCohortId?createBatchQueue({store:createBatchStore({namespace:conf.namespace??'lwdp'})}):undefined);
  const assertActive=async()=>{if(conf.captureCohortId)await queue!.assertActive(conf.captureCohortId);};
  const cloud: Cloud = options.cloud ?? createCloudClient({ assertActive, trackRemote:async(remote:any)=>{if(conf.captureCohortId)await queue!.trackRemote(conf.captureCohortId,episodeId,remote);}, onProgress: (event: any) => process.stdout.write(JSON.stringify({kind:'episode-cloud-progress',...event})+'\n') });
  await mkdir(output, { recursive: true });
  const statePath = path.join(output, 'episode.json'), prior = await json(statePath);
  if (prior && (prior.worldBuildHash !== source.worldBuildHash || prior.episodeId !== episodeId)) throw new Error('EPISODE_RESUME_SOURCE_CHANGED');
  if (prior) assertPreSeedanceProfile(prior.profile);
  const state: any = prior ?? { kind: 'three-episode-run', schemaVersion: 1, episodeId, worldId: source.worldId, worldBuildHash: source.worldBuildHash,
    sourceWorldBuildHash: source.sourceWorldBuildHash, runtimeHash: source.runtimeHash, profile: PRE_SEEDANCE_PROFILE,
    status: 'queued', stage: 'planning', createdAt: new Date().toISOString(), segments: [], providerVideoSubmissionCount: 0, planRepairsBySegment: {} };
  let stateWrites = Promise.resolve();
  const update = (stage: string, extra: Record<string, unknown> = {}) => {
    stateWrites = stateWrites.then(async () => { Object.assign(state, extra, { stage, updatedAt: new Date().toISOString() }); await save(statePath, state);
      await renderEpisodeReport({ outputRoot: output, state }); await options.onProgress?.(structuredClone(state));
      process.stdout.write(JSON.stringify({kind:'three-episode-progress',episodeId,status:state.status,stage,segments:state.segments?.map((s:any)=>({id:s.segmentId,status:s.status})),providerVideoSubmissionCount:0})+'\n'); });
    return stateWrites;
  };
  await enqueueDeliveredWorld({outboxRoot:path.join(output,'.outbox'),worldBuildHash:source.worldBuildHash,profileHash:canonicalHash(PRE_SEEDANCE_PROFILE),sourceManifestPath:path.resolve(options.sourceManifestPath),sourceManifestSha256:digest(await readFile(options.sourceManifestPath)),episodeId});
  const plannerPrompt = await readFile(path.join(REPO, 'scripts/three-episode/planner.prompt.md'), 'utf8');
  const plannerBase = { worldId: source.worldId, worldBuildHash: source.worldBuildHash, sourceHash: source.sourceHash, runtimeHash: source.runtimeHash,
    sourceFiles: Object.keys(source.sourceFiles), targets: source.targets.map(t => ({id:t.id,name:t.name,role:t.role,appearancePrompt:t.appearancePrompt??null})), profile: PRE_SEEDANCE_PROFILE };
  async function planWorld(repair?: {previousPlan:EpisodePlan;failedSegmentIds:string[];failures:any[]}) {
    const routeCandidate = !repair ? conf?.routePlanCandidate : null;
    if(routeCandidate && (routeCandidate.sourceHash!==source.sourceHash || digest(await readFile(routeCandidate.path))!==routeCandidate.sha256))throw new Error('EPISODE_ROUTE_CANDIDATE_SOURCE_MISMATCH');
    const input = {...plannerBase,promptHash:digest(plannerPrompt),repair:repair??null,...(routeCandidate?{routeCandidate:{sha256:routeCandidate.sha256,sourceHash:routeCandidate.sourceHash}}:{})}, inputHash=canonicalHash(input);
    const taskRoot=path.join(output,'planner',inputHash), planPath=path.join(taskRoot,'plan.json'), evidencePath=path.join(taskRoot,'planner-tool-evidence.json');
    await mkdir(taskRoot,{recursive:true}); await save(path.join(taskRoot,'context.json'),input);
    const previous=await json(path.join(taskRoot,'result.json'));
    if(previous?.inputHash===inputHash){ const bytes=await readFile(planPath);const ev=await readFile(evidencePath); if(digest(bytes)===previous.planSha256&&digest(ev)===previous.evidenceSha256)return {plan:validateEpisodePlan(JSON.parse(bytes.toString()),{worldBuildHash:source.worldBuildHash}),planPath}; }
    const planningManifest=conf?.planningSourceManifest ?? path.resolve(options.sourceManifestPath);
    const planningManifestSha256=conf?.planningSourceManifestSha256 ?? digest(await readFile(options.sourceManifestPath));
    const assets:any[]=[{id:'episode-context',path:path.join(taskRoot,'context.json'),attachAs:'file'},{id:'world-opening',path:source.opening.path,attachAs:'image'}];
    if(routeCandidate)assets.push({id:'prior-route-plan',path:routeCandidate.path,attachAs:'file'});
    for(const [relative,hash]of Object.entries(source.sourceFiles))if(/\.(ts|js|mjs|html|json|css)$/i.test(relative))assets.push({id:`source-${canonicalHash({relative,hash}).slice(0,20)}`,path:path.join(source.sourceRoot,relative),attachAs:'file'});
    if(source.worldPlan)assets.push({id:'world-plan',path:source.worldPlan.path,attachAs:'image'});
    let repairPath:string|undefined,remoteRepairPath:string|undefined,remoteRepairHash:string|undefined;
    if(repair){repairPath=path.join(taskRoot,'repair-input.json');await save(repairPath,repair);assets.push({id:'repair-input',path:repairPath,attachAs:'file'});
      // The launcher can resolve this declared task asset without shared writable FSx.
      remoteRepairPath='task-asset:repair-input';remoteRepairHash=digest(await readFile(repairPath));}
    const provider=await cloud.runCodex({taskId:`ep-plan-${inputHash.slice(0,32)}`,instruction:`${plannerPrompt}\n\nFrozen task context is attached. Exact worldBuildHash: ${source.worldBuildHash}. Deliver plan.json and planner-tool-evidence.json through episode_submit_plan.${routeCandidate?' A prior cloud Agent route plan is attached. The author source is byte-identical; the SDK was revised to fix animation reset. Reuse those route intentions when supported, validate against this runtime as needed, and submit through the real tool with the CURRENT worldBuildHash. The prior world hash is not valid for this new runtime.':''}`,assets,
      outputs:[{path:planPath,required:true,contentType:'application/json'},{path:evidencePath,required:true,contentType:'application/json'}],model:'gpt-6-astra',reasoningEffort:'xhigh',outputRoot:taskRoot,
      episodeSourceManifest:planningManifest,episodeSourceManifestSha256:planningManifestSha256,
      ...(remoteRepairPath?{episodeRepairInput:remoteRepairPath,episodeRepairInputSha256:remoteRepairHash}:{}),});
    const plan=validateEpisodePlan(await json(planPath),{worldBuildHash:source.worldBuildHash}), evidence=await json(evidencePath);
    if(evidence?.status!=='submitted'||evidence.worldBuildHash!==source.worldBuildHash||evidence.planHash!==canonicalHash(plan)||!evidence.calls?.some((call:any)=>call.tool==='episode_submit_plan'&&call.status==='succeeded'))throw new Error('EPISODE_PLANNER_TOOL_RECEIPT_REQUIRED');
    if(repair)for(const segment of plan.segments)if(!repair.failedSegmentIds.includes(segment.id)&&canonicalHash(segment)!==canonicalHash(repair.previousPlan.segments.find(s=>s.id===segment.id)))throw new Error('EPISODE_REPAIR_CHANGED_PASSING_SEGMENT');
    await save(path.join(taskRoot,'result.json'),{inputHash,planSha256:digest(await readFile(planPath)),evidenceSha256:digest(await readFile(evidencePath)),provider});return{plan,planPath};
  }
  let pendingCapture: any = null;
  let primaryError:any;
  if(!options.capture && !options.publishS3Prefix) throw new Error('EPISODE_BATCH_CHECKPOINT_REQUIRED');
  try {
    await assertActive();
    await update('planning',{status:'running',error:null});
    let plan:EpisodePlan,planPath:string;
    if(state.planPath){planPath=state.planPath;plan=validateEpisodePlan(await json(planPath),{worldBuildHash:source.worldBuildHash});if(canonicalHash(plan)!==state.planHash)throw new Error('EPISODE_PLAN_CHANGED');}
    else{({plan,planPath}=await planWorld());await update('planned',{planPath,planHash:canonicalHash(plan)});}
    if(options.until==='plan'){await update('planned',{status:'paused-before-capture'});return state;}
    const capture=options.capture??createCaptureDispatcher({runtimeConfig:conf,cloud,...(options.batchQueue?{queue:options.batchQueue}:{}),onProgress:(event:any)=>process.stdout.write(JSON.stringify({kind:'episode-capture-cloud',...event})+'\n')}).run;
    let summary:CaptureSummary; let segmentIds:string[]|undefined=state.pendingSegmentIds;
    const admittedCapture = state.segments?.length===6 && state.segments.every((segment:any)=>segment.status==='completed')
      ? await json(path.join(output,'capture','capture-summary.local.json')) as CaptureSummary|null : null;
    if(admittedCapture?.playerCaptureVersion===PLAYER_CAPTURE_VERSION){
      await normalizeCaptureForVisuals(admittedCapture,{worldBuildHash:source.worldBuildHash,runtimeHash:source.runtimeHash});
      summary=admittedCapture;
      await update('whitebox-capture',{status:'running',segments:summary.segments,captureReused:true});
    }else for(;;){
      await update('whitebox-capture',{status:'running'});
      let continuation:any;
      if(!options.capture&&options.publishS3Prefix){
        const checkpointS3Uri=`${options.publishS3Prefix}/capture-checkpoints/${canonicalHash(plan)}`;
        await cloud.publishDirectory(output,checkpointS3Uri);
        continuation={stopBeforeSeedance:true,outputRoot:path.relative(REPO,output),checkpointS3Uri,publishS3Uri:options.publishS3Prefix,...(options.until?{until:options.until}:{}),...(process.env.WORLDKIT_EPISODE_HOST_JOB?{producerJobName:process.env.WORLDKIT_EPISODE_HOST_JOB}:{})};
      }
      await assertActive();
      summary=await capture({sourceManifestPath:path.resolve(options.sourceManifestPath),planPath,outputRoot:path.join(output,'capture'),worldBuildHash:source.worldBuildHash,caseId:episodeId,cohortId:conf?.captureCohortId,continuation,...(segmentIds?{segmentIds}:{})});
      await update('whitebox-capture',{segments:summary.segments});
      if(summary.status==='completed')break;
      const failures=summary.segments.filter(s=>s.status==='failed');
      if(!failures.length)throw new Error('EPISODE_CAPTURE_INCOMPLETE');
      if(failures.some(s=>!isRepairableRouteFailure(s.failure?.code??'')))throw new Error(`EPISODE_RUNTIME_REPAIR_REQUIRED: ${JSON.stringify(failures.map(s=>({id:s.segmentId,failure:s.failure})))}`);
      for(const failure of failures){const count=state.planRepairsBySegment[failure.segmentId]??0;if(count>=PRE_SEEDANCE_PROFILE.maximumPlanRepairsPerSegment)throw new Error('EPISODE_PLAN_REPAIR_BUDGET_EXHAUSTED');state.planRepairsBySegment[failure.segmentId]=count+1;}
      segmentIds=failures.map(s=>s.segmentId);
      const reports=await Promise.all(failures.map(async failure=>({segmentId:failure.segmentId,failure:failure.failure,health:await json(path.join(failure.outputRoot,'health.json')),startProbe:await json(path.join(failure.outputRoot,'start-probe.json'))})));
      await update('route-repair',{failedSegmentIds:segmentIds});
      const previousPlan=plan;({plan,planPath}=await planWorld({previousPlan,failedSegmentIds:segmentIds,failures:reports}));
      if(canonicalHash(plan)===canonicalHash(previousPlan))throw new Error('EPISODE_REPAIR_DID_NOT_CHANGE_FAILED_PLAN');
      await update('route-repaired',{planPath,planHash:canonicalHash(plan),pendingSegmentIds:segmentIds});
    }
    const captureInput=await normalizeCaptureForVisuals(summary!,{worldBuildHash:source.worldBuildHash,runtimeHash:source.runtimeHash});
    await save(path.join(output,'capture-input.json'),captureInput);
    if(options.until==='capture'){await update('whitebox-completed',{status:'paused-before-visuals'});return state;}
    await assertActive();
    await update('style-planning');
    let publishedPreparedCount=0;
    const visuals=await runThreeEpisodeVisuals({source,capture:captureInput,episodeId,outputRoot:path.join(output,'visuals'),cloud,stopBeforeSeedance:true,...(options.publishS3Prefix?{publishS3Prefix:options.publishS3Prefix}:{}),
      ...(conf?.anchorContinuation?{anchorContinuation:conf.anchorContinuation}:{}),
      ...(conf?.referenceStyleVariantId?{referenceStyleVariantId:conf.referenceStyleVariantId}:{}),
      ...(conf?.stylePlanCandidate?{stylePlanCandidate:conf.stylePlanCandidate}:{}),
      onProgress:async(visualState:any)=>{
        const preparedRequestCount=visualState.preparedRequestCount??0;
        await update(visualState.stage==='planning'?'style-planning':visualState.stage,{visualState,preparedRequestCount});
        if(options.publishS3Prefix&&preparedRequestCount>publishedPreparedCount){
          await cloud.publishDirectory(output,options.publishS3Prefix);
          publishedPreparedCount=preparedRequestCount;
        }
      }});
    const expected=visuals.expectedRequestCount??60;
    if(visuals.status!=='pre-seedance-ready'||!Number.isInteger(expected)||expected<0||expected>60||visuals.preparedRequestCount!==expected||visuals.providerVideoSubmissionCount!==0)throw new Error('EPISODE_PRE_SEEDANCE_CLOSURE_INVALID');
    await update('pre-seedance-ready',{status:expected?'prepared':'excluded-by-user',preparedRequestCount:expected,expectedRequestCount:expected,visualManifestPath:path.join(output,'visuals/pre-seedance-manifest.json'),finishedAt:new Date().toISOString()});
    return state;
  }catch(error:any){
    if(error.code==='EPISODE_CAPTURE_BATCH_PENDING'){
      pendingCapture=error;await update('whitebox-capture',{status:'paused-capture-queue',captureTaskId:error.taskId,cohortId:error.cohortId});return state;
    }
    primaryError=error;
    // Persist the original failure before fallible reporting or producer cleanup.
    await stateWrites.catch(()=>{});stateWrites=Promise.resolve();
    Object.assign(state,{status:error.code==='EPISODE_COHORT_CANCELLED'?'cancelled':'failed',error:{code:error.code??/^[A-Z_]+/.exec(error.message)?.[0]??'EPISODE_FAILED',message:String(error.message).slice(0,6000),jobId:error.jobId??error.state?.jobId??null}});
    try{await save(statePath,state);}catch(cleanupError:any){process.stderr.write(`episode failure persistence: ${cleanupError.message}\n`);}
    if(conf.captureCohortId&&!/PENDING|UNKNOWN/.test(error.code??error.message??'')){
      try{await queue!.failPendingProducer(conf.captureCohortId,episodeId);}
      catch(cleanupError:any){state.cleanupError=String(cleanupError.message).slice(0,1500);await save(statePath,state).catch(()=>{});}
    }
    throw error;
  }finally{
    try{
      await stateWrites;
      if(options.publishS3Prefix){
        await cloud.publishDirectory(output,options.publishS3Prefix);
        if(process.env.WORLDKIT_CPU_TASK&&process.env.WORLDKIT_CPU_COHORT&&process.env.WORLDKIT_EPISODE_HOST_JOB){
          const succeeded=!primaryError&&['prepared','paused-before-visuals','excluded-by-user'].includes(state.status);
          const retryable=state.status==='failed'&&/PENDING|UNKNOWN|ETIMEDOUT|ECONNRESET|HTTP_5|transport|network|timeout/i.test((state.error?.code??'')+' '+(state.error?.message??''));
          await recordCpuReceipt(queue?.store??createBatchStore({namespace:conf.namespace??'lwdp'}),process.env.WORLDKIT_CPU_COHORT,process.env.WORLDKIT_CPU_TASK,{jobName:process.env.WORLDKIT_EPISODE_HOST_JOB,status:succeeded?'succeeded':state.status==='cancelled'?'cancelled':'failed',retryable,checkpointS3Uri:options.publishS3Prefix,stage:state.stage,error:state.error??null,finishedAt:new Date().toISOString()});
        }
        if(pendingCapture&&options.capture)await (queue??createBatchQueue({store:createBatchStore({namespace:conf.namespace??'lwdp'})})).checkpointReady(pendingCapture.cohortId,pendingCapture.taskId,{stopBeforeSeedance:true,outputRoot:path.relative(REPO,output),checkpointS3Uri:options.publishS3Prefix,publishS3Uri:options.publishS3Prefix});
      }
    }catch(cleanupError:any){
      // eslint-disable-next-line no-unsafe-finally -- Publication failure invalidates success but never replaces a primary error.
      if(!primaryError)throw cleanupError;
      process.stderr.write(`episode cleanup failed after ${state.error?.code}: ${cleanupError.message}\n`);
    }
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2), switches=new Set(['--stop-before-seedance','--capture-only']),valued=new Set(['--source-manifest','--output-root','--episode-id','--until','--plan-s3','--plan','--publish-s3','--segment-ids','--checkpoint-s3','--cohort']);
  for(let i=0;i<args.length;i++){if(switches.has(args[i]!))continue;if(!valued.has(args[i]!)||!args[++i])throw new Error('EPISODE_CLI_ARGUMENT_INVALID');}
  const value=(flag:string)=>{const index=args.indexOf(flag);return index<0?undefined:args[index+1];};
  if(!args.includes('--stop-before-seedance'))throw new Error('EPISODE_REQUIRES_PRE_SEEDANCE_STOP');
  const planS3=value('--plan-s3'),publishS3Prefix=value('--publish-s3'),until=value('--until') as NonNullable<EpisodeWorkflowOptions['until']>|undefined;
  const sourceManifestPath=path.resolve(value('--source-manifest')??''),outputRoot=path.resolve(value('--output-root')??'output/episode'),cloud=createCloudClient();
  if(args.includes('--capture-only')){
    const source=await loadEpisodeSource(sourceManifestPath);await mkdir(outputRoot,{recursive:true});
    const planPath=value('--plan')??path.join(outputRoot,'input-plan.json');if(planS3)await cloud.downloadArtifact(planS3,planPath);
    const plan=validateEpisodePlan(await json(planPath),{worldBuildHash:source.worldBuildHash});
    let summary:CaptureSummary|undefined;
    try{summary=await runCaptureSegments({playableRoot:source.playableRoot,plan,outputRoot,runtimeHash:source.runtimeHash,...(value('--segment-ids')?{segmentIds:value('--segment-ids')!.split(',')}:{}),onProgress:async event=>{process.stdout.write(JSON.stringify(event)+'\n');if(publishS3Prefix&&['completed','failed','cached'].includes(event.status))await cloud.publishDirectory(outputRoot,publishS3Prefix);}});}
    finally{if(publishS3Prefix)await cloud.publishDirectory(outputRoot,publishS3Prefix);}
    if(summary?.status!=='completed')process.exitCode=2;
  }else { const checkpoint=value('--checkpoint-s3');if(checkpoint)await cloud.hydrateDirectory(checkpoint,outputRoot);
    const runtimeConfig=await json(path.join(REPO,'.codex-tmp/three-episode-runtime.json'));
    if(value('--cohort'))runtimeConfig.captureCohortId=value('--cohort');
    await runEpisodeWorkflow({sourceManifestPath,outputRoot,runtimeConfig,stopBeforeSeedance:true,...(value('--episode-id')?{episodeId:value('--episode-id')!}:{}),...(until?{until}:{}),...(publishS3Prefix?{publishS3Prefix}:{})});
  }
}
