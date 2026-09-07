import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,realpath,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {buildThreeRunProgress} from './three-eval-progress.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const taskId='new-reference--three-sdk',caseId='new-reference',runtimeHash=hash('runtime'),caseHash=hash('case');
const submittedAt='2026-09-05T09:30:00.000Z',startedAt='2026-09-05T09:31:00.000Z',observedAt='2026-09-05T09:40:00.000Z';
const now=Date.parse(observedAt);
async function json(file,value){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value));}
async function fixture(runId='run-main',jobId='gen_0000000000000001',root) {
  const container=root??await realpath(await mkdtemp(path.join(tmpdir(),'three-progress-')));
  const runRoot=path.join(container,runId),requestId=`request-${runId}`;
  const plan={schemaVersion:1,kind:'three-creator-sdk-plan',runId,runtimeHash,selectedTaskIds:[taskId],cases:[{caseId,taskId,profile:'three-sdk',caseHash,requestId}]};
  await json(path.join(runRoot,'evaluation-plan.json'),plan);
  const state={caseId,taskId,profile:'three-sdk',caseHash,requestId,runtimeHash,jobId,phase:'submitted',providerStatus:'running',submittedAt,lastObservedAt:observedAt,updatedAt:observedAt,model:'gpt-6-astra',reasoningEffort:'xhigh'};
  const live={runId,caseId,taskId,caseHash,requestId,runtimeHash,jobId,phase:'submitted',providerStatus:'running',submittedAt,observedAt,cliActivityObserved:true,
    launcher:{status:'running',startedAt,finishedAt:null,runtimeHash},events:{completedMcpCalls:{world_preview:2,operations_get:4},latestTool:{name:'operations_get',status:'completed',timestamp:null},latestOperation:{id:'op-preview',type:'world.preview',status:'succeeded',createdAt:startedAt,updatedAt:observedAt},imageResponses:2}};
  const launcher={kind:'three-creator-launcher-report',caseId,taskId,profile:'three-sdk',runtimeHash,status:'running',startedAt,workspace:`/fsx/pipeline/lwdp_generation/${jobId}/tasks/${taskId}`};
  const caseRoot=path.join(runRoot,taskId);
  return {container,runRoot,caseRoot,plan,state,live,launcher,async saveState(){await json(path.join(caseRoot,'state.json'),state);}};
}
const snapshot=(...attempts)=>({kind:'three-creator-safe-live-status',schemaVersion:1,observedAt,attempts});

test('real CLI activity and current MCP stage override queued API items/counters',async()=>{
 const f=await fixture();try{
  await f.saveState();await json(path.join(f.caseRoot,'job-final.json'),{job_id:f.state.jobId,request_id:f.state.requestId,status:'running',counters:{total:1,queued:1,running:0}});
  await json(path.join(f.caseRoot,'items.json'),{items:[{item_id:taskId,status:'queued'}]});
  const queued=await buildThreeRunProgress({runRoot:f.runRoot,now});assert.equal(queued.cases[0].phase,'queued');assert.equal(queued.cases[0].startedAt,null);
  const running=await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now}),row=running.cases[0];
  assert.equal(row.phase,'running');assert.equal(row.stage,'preview');assert.equal(row.hostPhase,'submitted');assert.equal(row.itemStatus,'queued');assert.equal(row.providerQueueIsStale,true);
  assert.equal(row.startedAt,startedAt);assert.equal(row.queueSeconds,60);assert.equal(row.elapsedSeconds,600);assert.equal(row.completedAt,null);
  assert.equal(row.toolSummary.counts.world_preview,2);assert.equal(row.toolSummary.latestTool,'operations_get');assert(row.events.every(event=>typeof event.stage==='string'));
  f.live.events.latestTool={name:'world_playtest',status:'running',timestamp:null};
  const newer=await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now});assert.equal(newer.cases[0].stage,'playtest');
  assert.equal(newer.cases[0].events.find(event=>event.tool==='world_playtest').at,null,'observation time is not a fabricated event time');
 }finally{await rm(f.container,{recursive:true,force:true});}
});

test('missing local/live evidence leaves unknown time, model and no fabricated attempts',async()=>{
 const f=await fixture();try{
  const result=await buildThreeRunProgress({runRoot:f.runRoot,now}),row=result.cases[0];
  assert.equal(row.phase,'unknown');assert.equal(row.stage,'unknown');assert.equal(result.model,null);assert.equal(result.effort,null);
  for(const key of ['submittedAt','startedAt','completedAt','lastObservedAt','queueSeconds','elapsedSeconds'])assert.equal(row[key],null);
  assert.deepEqual(row.attempts,[]);assert.deepEqual(row.events,[]);assert.deepEqual(row.toolSummary.counts,{});
 }finally{await rm(f.container,{recursive:true,force:true});}
});

test('keeps a genuine capacity failure and retry distinct, rejecting changed input/runtime identity',async()=>{
 const f=await fixture();try{
  f.state.phase='failed';f.state.failure={category:'unclassified',message:'Selected model is at capacity. PRIVATE_TOKEN'};await f.saveState();
  f.launcher.status='failed';f.launcher.finishedAt='2026-09-05T09:32:00.000Z';f.launcher.childExitCode=1;await json(path.join(f.caseRoot,'creator-launcher-report.json'),f.launcher);
  const retry=await fixture('run-retry','gen_0000000000000002',f.container);retry.state.submittedAt='2026-09-05T09:35:00.000Z';retry.state.providerStatus='queued';await retry.saveState();
  const options={runRoot:f.runRoot,attemptRunRoots:[retry.runRoot],now};
  const result=await buildThreeRunProgress(options),row=result.cases[0];assert.equal(row.phase,'queued');assert.equal(row.attempts.length,2);
  assert.equal(row.attempts[0].failure.code,'MODEL_AT_CAPACITY');assert.equal(row.attempts[0].completedAt,f.launcher.finishedAt);assert.equal(row.attempts[1].jobId,retry.state.jobId);
  assert(!JSON.stringify(result).includes('PRIVATE_TOKEN'));assert(row.events.some(event=>event.code==='MODEL_AT_CAPACITY'));
  retry.plan.cases[0].caseHash=hash('different input');await json(path.join(retry.runRoot,'evaluation-plan.json'),retry.plan);
  await assert.rejects(buildThreeRunProgress(options),/RETRY_IDENTITY_MISMATCH/);
  retry.plan.cases[0].caseHash=caseHash;retry.plan.runtimeHash=hash('different runtime');await json(path.join(retry.runRoot,'evaluation-plan.json'),retry.plan);
  await assert.rejects(buildThreeRunProgress(options),/RETRY_IDENTITY_MISMATCH/);
 }finally{await rm(f.container,{recursive:true,force:true});}
});

test('never projects credentials, commands, reasoning, private paths or arbitrary provider errors',async()=>{
 const f=await fixture();try{
  await f.saveState();await json(path.join(f.caseRoot,'creator-launcher-report.json'),f.launcher);
  await json(path.join(f.caseRoot,'config-echo.json'),{job_id:f.state.jobId,config:{request_id:f.state.requestId,options:{model:'gpt-6-astra',reasoning_effort:'xhigh',token:'PRIVATE_TOKEN'},runtime_env:{credentials:'PRIVATE_TOKEN'}}});
  const events=[{type:'thread.started'}, {type:'item.completed',item:{id:'reasoning',type:'reasoning',text:'PRIVATE_REASONING'}},
   {type:'item.started',item:{id:'cmd',type:'command_execution',command:'cat /Users/private/PRIVATE_SOURCE'}},
   {type:'item.completed',item:{id:'call',type:'mcp_tool_call',server:'worldkit_three_creator',tool:'operations_get',arguments:{secret:'PRIVATE_ARGUMENT'},result:{content:[{type:'text',text:JSON.stringify({id:'op',type:'world.playtest',status:'running',createdAt:startedAt,updatedAt:observedAt,progress:{stepIndex:3,elapsedSeconds:42,requestedSeconds:180,currentState:{raw:'PRIVATE_STATE'}}})},{type:'image',data:'PRIVATE_IMAGE'}]}}}];
  await writeFile(path.join(f.caseRoot,'creator-events.jsonl'),events.map(JSON.stringify).join('\n')+'\n');
  const result=await buildThreeRunProgress({runRoot:f.runRoot,now}),text=JSON.stringify(result),row=result.cases[0];
  assert.equal(row.stage,'playtest');assert.equal(row.toolSummary.counts.operations_get,1);assert.deepEqual(row.toolSummary.latestOperation.progress,{stepIndex:3,elapsedSeconds:42,requestedSeconds:180});
  for(const secret of ['PRIVATE_','/Users/','codex_home','command_execution','runtime_env'])assert(!text.includes(secret),secret);
  for(const [error,code] of [['THREE_SOURCE_SYMLINK: /scratch/codex_home/PRIVATE_SOURCE','THREE_SOURCE_SYMLINK'],['THREE_BROWSER_STARTUP_FAILED: PRIVATE_SOURCE','BROWSER_STARTUP_FAILED'],['PHYSICS_BOX_DEGENERATE: PRIVATE_SOURCE','PHYSICS_BOX_DEGENERATE'],['unrecognized PRIVATE_PROVIDER_ERROR','EXECUTION_FAILED']]){
   f.state.phase='failed';f.state.failure={message:error};await f.saveState();const failed=await buildThreeRunProgress({runRoot:f.runRoot,now});assert.equal(failed.cases[0].failure.code,code);assert(!JSON.stringify(failed).includes('PRIVATE_'));
  }
 }finally{await rm(f.container,{recursive:true,force:true});}
});

test('rejects foreign live job/request/launcher identity and linked evidence paths',async()=>{
 const f=await fixture();try{
  await f.saveState();
  for(const edit of [{jobId:'gen_ffffffffffffffff'},{requestId:'another-request'},{runtimeHash:hash('foreign')},{caseHash:hash('foreign')}])await assert.rejects(buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot({...f.live,...edit}),now}),/IDENTITY_MISMATCH/);
  const foreign={...f.launcher,workspace:'/fsx/pipeline/lwdp_generation/gen_ffffffffffffffff/tasks/'+taskId};await json(path.join(f.caseRoot,'creator-launcher-report.json'),foreign);
  await assert.rejects(buildThreeRunProgress({runRoot:f.runRoot,now}),/IDENTITY_MISMATCH/);
  await rm(path.join(f.caseRoot,'creator-launcher-report.json'));await rm(path.join(f.caseRoot,'state.json'));
  const target=path.join(f.container,'private.json');await json(target,{token:'PRIVATE_TOKEN'});await symlink(target,path.join(f.caseRoot,'state.json'));
  await assert.rejects(buildThreeRunProgress({runRoot:f.runRoot,now}),/PATH_INVALID/);
 }finally{await rm(f.container,{recursive:true,force:true});}
});

test('tool failures and a finished CLI do not become a completed Host delivery',async()=>{
 const f=await fixture();try{
  await f.saveState();f.live.events.latestOperation.status='failed';f.live.events.latestOperation.error='THREE_BROWSER_STARTUP_FAILED: PRIVATE_DETAILS';
  let result=await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now});assert.equal(result.cases[0].phase,'running');assert.equal(result.cases[0].failure,undefined);assert(result.cases[0].events.some(event=>event.status==='failed'));
  f.state.phase='failed';f.state.failure={message:'Private diagnostics retained.'};await f.saveState();
  result=await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now});assert.equal(result.cases[0].failure.code,'BROWSER_STARTUP_FAILED');assert.equal(result.cases[0].failure.evidence,'latest-failed-operation');assert(!JSON.stringify(result).includes('PRIVATE_DETAILS'));
  f.live.events.latestOperation.error='THREE_SOURCE_SYMLINK: /scratch/codex_home/PRIVATE_DETAILS';
  result=await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now});assert.equal(result.cases[0].failure.code,'THREE_SOURCE_SYMLINK');assert.equal(result.cases[0].failure.category,'tool-input-boundary');
  f.state.phase='delivery-pending';await f.saveState();f.live.launcher.status='delivered';f.live.launcher.finishedAt=observedAt;
  result=await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now});assert.equal(result.cases[0].phase,'running');assert.equal(result.cases[0].stage,'packaging');assert.equal(result.cases[0].completedAt,null);
  f.state.phase='delivered';await f.saveState();result=await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now});assert.equal(result.cases[0].stage,'delivered');assert.equal(result.cases[0].completedAt,observedAt);
 }finally{await rm(f.container,{recursive:true,force:true});}
});

test('bounds the public timeline and writes only an atomic progress.json from the CLI',async()=>{
 const f=await fixture();try{
  await f.saveState();await json(path.join(f.caseRoot,'creator-launcher-report.json'),f.launcher);
  const events=Array.from({length:140},(_,i)=>JSON.stringify({type:'item.completed',item:{id:'item-'+i,type:'file_change',changes:[{path:'PRIVATE_PATH'}]}}));
  await writeFile(path.join(f.caseRoot,'creator-events.jsonl'),events.join('\n')+'\n{"partial":');
  const result=await buildThreeRunProgress({runRoot:f.runRoot,now});assert.equal(result.cases[0].events.length,100);assert(!JSON.stringify(result).includes('PRIVATE_PATH'));
  const output=path.join(f.container,'progress.json');execFileSync(process.execPath,['scripts/cloud/three-eval-progress.mjs','--run-root',f.runRoot,'--output',output]);
  const published=JSON.parse(await readFile(output,'utf8'));assert.equal(published.kind,'three-creator-run-progress');assert.equal(published.runId,f.plan.runId);
 }finally{await rm(f.container,{recursive:true,force:true});}
});

test('retains verified Host failure facts with fixed priority and private diagnostics excluded',async()=>{
 const f=await fixture();try{
  await f.saveState();
  f.live.failureFacts=[{layer:'author-geometry',code:'PHYSICS_BOX_DEGENERATE',message:'PRIVATE_GEOMETRY'},
   {layer:'browser-startup',code:'THREE_BROWSER_STARTUP_FAILED',cause:'PRIVATE_CAUSE'},
   {layer:'host-integration',code:'PLATFORM_SCRATCH_SCANNED_AS_SOURCE',message:'/scratch/codex_home/PRIVATE_SOURCE'},
   {layer:'unknown',code:'PRIVATE_CODE'},{layer:'wrong-layer',code:'MODEL_CAPACITY'}];
  let row=(await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now})).cases[0];
  assert.equal(row.phase,'running');assert.equal(row.failure,undefined);assert.equal(row.failureFacts.length,3);
  f.state.phase='failed';f.state.failure={message:'Private diagnostics retained.'};await f.saveState();
  row=(await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now})).cases[0];
  assert.equal(row.failure.code,'PLATFORM_SCRATCH_SCANNED_AS_SOURCE');assert.equal(row.failure.evidence,'verified-host-fact');
  assert.equal(row.failureFacts.find(fact=>fact.layer==='browser-startup').cause,'not-identified');
  assert.equal(row.attempts[0].failureFacts.length,3);assert(!JSON.stringify(row).includes('PRIVATE_'));assert(!JSON.stringify(row).includes('codex_home'));
  f.live.failureFacts=[{layer:'model-service',code:'MODEL_CAPACITY'}];
  row=(await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now})).cases[0];assert.equal(row.failure.code,'MODEL_AT_CAPACITY');
 }finally{await rm(f.container,{recursive:true,force:true});}
});

test('projects actual operation history once per identity in timestamp order with honest failure status',async()=>{
 const f=await fixture();try{
  await f.saveState();
  f.live.events.operations=[
   {id:'op-second',type:'world.preview',status:'failed',createdAt:'2026-09-05T09:33:00Z',updatedAt:'2026-09-05T09:34:00Z',errorCode:'THREE_BROWSER_STARTUP_FAILED',error:'PRIVATE_ERROR'},
   {id:'op-first',type:'world.validate',status:'succeeded',createdAt:startedAt,updatedAt:'2026-09-05T09:32:00Z'},
   {id:'op-first',type:'world.validate',status:'running',createdAt:startedAt,updatedAt:startedAt},
   {id:'op-live',type:'world.playtest',status:'running',createdAt:'2026-09-05T09:35:00Z',updatedAt:'2026-09-05T09:36:00Z',progress:{elapsedSeconds:60,requestedSeconds:180,privateState:'PRIVATE_STATE'}},
   {id:'op-hidden',type:'PRIVATE_TYPE',status:'failed',updatedAt:observedAt},
  ];
  f.live.events.latestOperation={...f.live.events.operations[3],updatedAt:observedAt,progress:{elapsedSeconds:90,requestedSeconds:180}};
  const row=(await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now})).cases[0];
  const operations=row.events.filter(event=>event.type==='operation');
  assert.equal(operations.length,3);assert.deepEqual(operations.map(event=>event.stage),['authoring','preview','playtest']);
  assert.deepEqual(operations.map(event=>event.status),['succeeded','failed','running']);
  assert.equal(operations[1].code,'BROWSER_STARTUP_FAILED');assert.equal(operations[2].at,observedAt);assert.equal(operations[2].progress.elapsedSeconds,90);
  assert.equal(row.attempts[0].events.filter(event=>event.type==='operation').length,3);assert.equal(row.phase,'running');assert(!JSON.stringify(row).includes('PRIVATE_'));
  f.live.events.latestOperation={id:'queued-untyped-operation',status:'queued'};
  const pending=(await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now})).cases[0];
  assert.equal(pending.stage,'playtest');assert.equal(pending.stageLabel,'等待工具返回');assert.equal(pending.awaitingToolResult,true);assert.equal(pending.events.filter(event=>event.type==='operation').length,3);
  f.live.events.operations[0].updatedAt=null;f.live.events.operations[0].createdAt=null;
  const missing=(await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now})).cases[0].events.find(event=>event.type==='operation'&&event.stage==='preview');assert.equal(missing.at,null);
 }finally{await rm(f.container,{recursive:true,force:true});}
});

test('separates call execution from checks and never calls short or under-duration playtests passed',async()=>{
 const f=await fixture();try{
  await f.saveState();
  const full={status:'passed',isCompleteEpisode:true,capturedInput:true,activePlaySeconds:181,inputWallSeconds:182,actualWallSeconds:185,videoMetadata:{durationSeconds:184,frameCount:182,widthPixels:960,heightPixels:540,path:'PRIVATE_VIDEO'}};
  const cases=[
   {result:{...full,status:'failed',failure:'THREE_EPISODE_OPERATION_FAILED',privateDetails:'PRIVATE_DETAILS'},status:'failed',resultStatus:'failed',detail:'调用已完成，检查结果失败。'},
   {result:{...full,isCompleteEpisode:false},status:'succeeded',resultStatus:'passed',adequacy:'short-test',detail:'调用已完成，仅完成短测，未完成整段自测。'},
   {result:{...full,activePlaySeconds:126.2},status:'succeeded',resultStatus:'passed',adequacy:'duration-insufficient',detail:'调用已完成，自测时长不足 180 秒。'},
   {result:{status:'passed'},status:'succeeded',resultStatus:'passed',adequacy:'unverified',detail:'调用已完成，完整自测证据尚不足。'},
   {result:full,status:'succeeded',resultStatus:'passed',adequacy:'complete',detail:'检查结果通过。'},
   {result:undefined,status:'succeeded',resultStatus:null,detail:'工具调用已完成，检查结果尚未确认。'},
  ];
  for(const expected of cases) {
   f.live.events.latestOperation={id:'op-check',type:'world.playtest',status:'succeeded',createdAt:startedAt,updatedAt:observedAt,resultSummary:expected.result};
   const row=(await buildThreeRunProgress({runRoot:f.runRoot,liveStatus:snapshot(f.live),now})).cases[0],event=row.events.find(event=>event.type==='operation');
   assert.equal(row.phase,'running');assert.equal(event.executionStatus,'succeeded');assert.equal(event.status,expected.status);assert.equal(event.resultStatus,expected.resultStatus);assert.equal(event.detail,expected.detail);
   if(expected.adequacy)assert.equal(event.playtestAdequacy,expected.adequacy);
   assert.equal(row.toolSummary.latestOperation.executionStatus,'succeeded');assert.equal(row.toolSummary.latestOperation.resultStatus,expected.resultStatus);assert.equal(row.attempts[0].toolSummary.latestOperation.resultStatus,expected.resultStatus);assert(!JSON.stringify(row).includes('PRIVATE_'));
  }
 }finally{await rm(f.container,{recursive:true,force:true});}
});
