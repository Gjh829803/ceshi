import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,cp,readdir,rm,realpath} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {recoveryDecision,continuationLocation,assertContinuationParent} from './three-eval-recovery.mjs';
import {sha256,THREE_LAUNCHER_FILES,CODEX_BINARY_SHA256} from './three-eval-runtime.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const state={phase:'failed',jobId:'gen_12345678',requestId:'wk3-fixture',outputS3Prefix:'s3://fixture',failure:{category:'timeout',message:'CREATOR_TASK_TIMEOUT'}};
const job={job_id:state.jobId,request_id:state.requestId,output_s3_prefix:state.outputS3Prefix,pipeline:'codex',status:'failed'};
test('recovery requires failed stopped original execution, distinct artifact recovery, and bounded attempts',()=>{
 assert.equal(recoveryDecision(state,job).action,'continue');
 assert.equal(recoveryDecision({...state,itemStatus:'failed',launcherStatus:'failed'},{...job,status:'completed'}).action,'continue');
 assert.equal(recoveryDecision({...state,itemStatus:'succeeded'},{...job,status:'completed'}).action,'retrieve');
 for(const phase of ['running','remote-pending','submission-unknown','not-started','stop-pending'])assert.equal(recoveryDecision({...state,phase},job).action,'reconcile');
 for(const status of ['running','pending','submitted'])assert.equal(recoveryDecision(state,{...job,status}).action,'reconcile');
 for(const status of ['cancelled','stopped'])assert.equal(recoveryDecision(state,{...job,status,progress:{summary:{ray_cleanup_checked:true,ray_cleanup_pending:false}}}).action,'none');
 assert.equal(recoveryDecision({...state,continuation:{attemptNumber:2}},job).reason,'model-attempt-limit');
 assert.equal(recoveryDecision(state,{...job,counters:{running:1}}).action,'reconcile');
 assert.equal(recoveryDecision(state,{...job,progress:{summary:{ray_cleanup_pending:true}}}).action,'reconcile');
 assert.equal(recoveryDecision({...state,launcherStatus:'delivered'},job).action,'retrieve');
 assert.equal(recoveryDecision({...state,phase:'delivery-pending'},job).action,'retrieve');
 for(const key of ['job_id','request_id','pipeline','output_s3_prefix'])assert.throws(()=>recoveryDecision(state,{...job,[key]:'foreign'}),/IDENTITY/);
 for(const category of ['event-evidence','model-cli-version','execution-guard'])assert.equal(recoveryDecision({...state,failure:{category}},job).action,'none');
});
async function fixture(t){
 await mkdir(path.join(repo,'.codex-tmp'),{recursive:true});const directory=await mkdtemp(path.join(repo,'.codex-tmp/continuation-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));const isolated=await realpath(directory),cloud=path.join(isolated,'scripts/cloud');await mkdir(cloud,{recursive:true});await mkdir(path.join(isolated,'scripts/lib'));
 for(const name of await readdir(here))if(/^(?:three-|creator-eval-(?:diagnostics|runtime))/.test(name)&&/\.(?:mjs|py|md)$/.test(name))await cp(path.join(here,name),path.join(cloud,name));
 // Only cloud transports are replaced. Actual runner, source writer, Python
 // verification, restore, lineage, admission and durable intents are exercised.
 await writeFile(path.join(cloud,'creator-eval-diagnostics.mjs'),'export async function recoverFailedCreatorDiagnostics(){return {files:{}};}');
 let retrieval=await readFile(path.join(cloud,'three-eval-checkpoints.mjs'),'utf8');retrieval=retrieval.replace("export const retrieveThreeCheckpoint=(args,options)=>retrieveThreeArtifact('checkpoint',args,options);","export const retrieveThreeCheckpoint=async()=>null;").replace("export const retrieveThreeProgress=(args,options)=>retrieveThreeArtifact('progress',args,options);","export const retrieveThreeProgress=async()=>null;");retrieval=retrieval.replace('export async function retrieveThreeDeliveryArtifacts(', 'async function disabledDeliveryRecovery(')+'\nexport async function retrieveThreeDeliveryArtifacts(){return {};}';await writeFile(path.join(cloud,'three-eval-checkpoints.mjs'),retrieval);
 const pin=sha256('synthetic fixture'),runtime={status:'ready',kind:'three-creator-runtime-lock',schemaVersion:1,engine:'three@0.185.1',profiles:['three-raw','three-sdk'],launcherPath:'/fsx/pipeline/worldkit-three-creator-experiments/fixture/launcher/three-eval-launcher.mjs',toolkitRoot:'/fsx/pipeline/worldkit-three-creator-experiments/fixture/toolkit/sdk',nodeBinary:process.execPath,hostCacheRoot:'/fsx/pipeline/worldkit-three-creator-experiments/fixture/host-cache',codexBinary:'/fsx/pinned/codex',codexBinarySha256:CODEX_BINARY_SHA256,browserRoot:'/fsx/pinned/browser',maximumTaskSeconds:300,launcherFilesSha256:Object.fromEntries(THREE_LAUNCHER_FILES.map(name=>[name,pin])),prebuiltRuntimes:Object.fromEntries(['three-raw','three-sdk'].map(profile=>[profile,{root:'/fsx/pipeline/worldkit-three-creator-experiments/fixture/toolkit/prebuilt/'+profile,manifestSha256:pin,runtimeHash:pin}]))};
 for(const key of ['toolkitArchiveSha256','toolkitSourceHash','toolkitContentSha256','browserArchiveSha256','browserContentSha256'])runtime[key]=pin;
 const lock=path.join(isolated,'runtime-lock.json');await writeFile(lock,JSON.stringify(runtime));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlX8AAAAASUVORK5CYII=','base64');
 await writeFile(path.join(isolated,'reference.png'),png);await writeFile(path.join(isolated,'prompt.txt'),'Keep this world and reuse its map.');
 const cases=Array.from({length:5},(_,i)=>({id:'gpt6-fixture-'+i,title:'Fixture '+i,referenceImage:{path:path.join(isolated,'reference.png'),contentSha256:sha256(png)},effectiveUserPromptFile:{path:path.join(isolated,'prompt.txt'),contentSha256:sha256('Keep this world and reuse its map.')},effectiveUserPrompt:'Keep this world and reuse its map.'}));
 await writeFile(path.join(isolated,'manifest.json'),JSON.stringify({cases}));
 await mkdir(path.join(isolated,'.codex-tmp/runtime-config'),{recursive:true});for(const name of ['aws-config','aws-credentials'])await writeFile(path.join(isolated,'.codex-tmp/runtime-config',name),'SYNTHETIC TEST ONLY');
 const stub=`import {appendFile,mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {restoreThreeContinuation} from '../cloud/three-eval-restore.mjs';
const root=${JSON.stringify(isolated)},sha=x=>createHash('sha256').update(x).digest('hex'),ledger=path.join(root,'provider.jsonl'),s3=path.join(root,'s3');
async function calls(){try{return (await readFile(ledger,'utf8')).trim().split('\\n').filter(Boolean).map(JSON.parse);}catch{return [];}}
async function lookup(id){return (await calls()).find(x=>x.job_id===id);}
export async function loadLwdpGenerationConfig(){return {};}
export async function uploadS3File(file,uri){await mkdir(s3,{recursive:true});await copyFile(file,path.join(s3,sha(uri)));}
export async function downloadS3FileAtomic(uri,file){await mkdir(path.dirname(file),{recursive:true});await copyFile(path.join(s3,sha(uri)),file);}
export async function findGenerationJobByRequestId(requestId){return (await calls()).find(x=>x.payload.request_id===requestId);}
export const submittedJobId=x=>x?.job_id;
export async function submitCodexGenerationJob(payload){
 const rows=await calls(),id='gen_'+String(rows.length+1).padStart(16,'0'),task=payload.tasks[0],work=path.join(root,'cloud',id,'tasks',task.id);await mkdir(path.join(work,'inputs'),{recursive:true});await mkdir(path.join(work,'outputs'));
 for(const asset of task.assets)await copyFile(path.join(s3,sha(asset.s3_uri)),path.join(work,'inputs',asset.name));
 const input=JSON.parse(await readFile(path.join(work,'inputs/case-input.json'),'utf8')),rawLock=await readFile(path.join(root,'runtime-lock.json'),'utf8'),lock={...JSON.parse(rawLock),runtimeHash:sha(rawLock)};
 const restored=await restoreThreeContinuation({layout:{workspace:work,outputs:path.join(work,'outputs'),caseId:input.caseId,taskId:task.id,profile:input.profile},lock});
 if(restored){if(await readFile(path.join(work,'main.ts'),'utf8')!=='const preservedWorld = 123; // unfinished')throw Error('LOST SOURCE');if(await readFile(path.join(work,'planning/world-plan.md'),'utf8')!=='Reuse this existing connected world map.')throw Error('LOST MAP');}
 else {await writeFile(path.join(work,'main.ts'),'const preservedWorld = 123; // unfinished');await mkdir(path.join(work,'planning'));await writeFile(path.join(work,'planning/world-plan.md'),'Reuse this existing connected world map.');}
 const identity={caseId:input.caseId,taskId:task.id,profile:input.profile,runtimeHash:lock.prebuiltRuntimes[input.profile].runtimeHash,creatorRuntimeLockHash:lock.runtimeHash};
 execFileSync(process.execPath,['--import',${JSON.stringify(path.join(repo,'node_modules/tsx/dist/loader.mjs'))},'--input-type=module','-e','import {CreatorProgress} from '+JSON.stringify(${JSON.stringify(path.join(repo,'scripts/three-creator/progress.ts'))})+'; await new CreatorProgress('+JSON.stringify(work)+','+JSON.stringify(identity)+').save();']);
 const launcher={kind:'three-creator-launcher-report',status:'failed',error:'CREATOR_TASK_TIMEOUT',runtimeHash:lock.runtimeHash,caseId:input.caseId,taskId:task.id,profile:input.profile,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString()};
 await writeFile(path.join(work,'outputs/creator-launcher-report.json'),JSON.stringify(launcher));await writeFile(path.join(work,'outputs/creator-events.jsonl'),'');
 for(const name of await readdir(path.join(work,'outputs')))await uploadS3File(path.join(work,'outputs',name),payload.output_s3_prefix+'/tasks/'+task.id+'/'+name);
 const call={job_id:id,payload,workDirectory:path.dirname(path.dirname(work)),restored:restored?.continuation??null};await appendFile(ledger,JSON.stringify(call)+'\\n');return call;
}
async function final(call){let override={};try{override=JSON.parse(await readFile(path.join(root,'provider-state.json'),'utf8'));}catch{}return {job_id:call.job_id,request_id:call.payload.request_id,output_s3_prefix:call.payload.output_s3_prefix,pipeline:'codex',status:'failed',error:'CREATOR_TASK_TIMEOUT',counters:{total:1,failed:1,running:0},...override};}
export async function lwdpRequest(url){const parts=url.split('/'),id=parts[5],call=await lookup(id);if(!call)throw Error('unknown '+url);if(parts[6]==='config')return {config:{request_id:call.payload.request_id,options:{...call.payload.defaults,...call.payload.options,work_dir:call.workDirectory}}};return final(call);}
export async function pollGenerationJob(id){return final(await lookup(id));}
export async function fetchGenerationItems(id){const call=await lookup(id);return {items:[{item_id:call.payload.tasks[0].id,status:'failed',error:'CREATOR_TASK_TIMEOUT'}]};}
export async function cancelGenerationJob(){throw Error('unexpected cancel');}
`;
 await writeFile(path.join(isolated,'scripts/lib/lwdp-generation-client.mjs'),stub);
 const outputRoot=path.join(isolated,'run'),args=['--run-id','continuation-fixture','--output-root',outputRoot,'--runtime-lock',lock,'--manifest',path.join(isolated,'manifest.json'),'--case-id',cases[0].id];
 const invoke=(mode,extra=[])=>spawnSync(process.execPath,[path.join(cloud,'three-eval-runner.mjs'),'--mode',mode,...args,...extra],{cwd:isolated,encoding:'utf8',timeout:30000});
 const calls=async()=>{try{return (await readFile(path.join(isolated,'provider.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);}catch{return [];}};
 return {root:isolated,outputRoot,args,invoke,calls,taskId:cases[0].id+'--three-sdk',cloud,lock};
}
test('real coordinator restores actual WIP archive, reuses original prompt/map and stops after one continuation',async t=>{
 const f=await fixture(t),first=f.invoke('run');assert.equal(first.status,1,first.stderr);const calls=await f.calls();assert.equal(calls.length,2,first.stdout+first.stderr);
 assert(calls[1].restored);assert.equal(calls[1].restored.parentJobId,calls[0].job_id);assert.equal(calls[1].restored.sourceKind,'progress');assert.notEqual(calls[0].payload.request_id,calls[1].payload.request_id);assert.equal(calls[0].payload.tasks[0].instruction,calls[1].payload.tasks[0].instruction);
 const summary=JSON.parse(await readFile(path.join(f.outputRoot,'summary.json'),'utf8'));assert.equal(summary.cases[0].continuation.attemptNumber,2);assert.equal(summary.cases[0].jobId,calls[1].job_id);
 for(const mode of ['run','resume','continue']){const retried=f.invoke(mode);assert.equal(retried.status,1,retried.stderr);assert.equal((await f.calls()).length,2,retried.stdout+retried.stderr);}
 // A changed SDK/instruction file cannot silently change an existing request.
 await writeFile(path.join(f.cloud,'three-eval-instructions.md'),'Changed generic policy must not replace frozen prompt');const repeated=f.invoke('run');assert.equal((await f.calls()).length,2,repeated.stderr);
 const child=continuationLocation(f.outputRoot,'continuation-fixture',f.taskId);
 const malicious=spawnSync(process.execPath,[path.join(f.cloud,'three-eval-runner.mjs'),'--mode','prepare','--run-id','another-second-attempt','--output-root',path.join(f.root,'unbounded-retry'),'--runtime-lock',f.lock,'--continue-from',f.outputRoot,'--case-id','gpt6-fixture-0'],{cwd:f.root,encoding:'utf8',timeout:10000});assert.notEqual(malicious.status,0);assert.match(malicious.stderr,/CHILD_LOCATION_INVALID/);assert.equal((await f.calls()).length,2);
 assert.equal(JSON.parse(await readFile(path.join(child.root,f.taskId,'state.json'),'utf8')).phase,'failed');
});

test('durable prepared continuation survives restart before first POST; resume reads only and continue dispatches once',async t=>{
 const f=await fixture(t),first=f.invoke('run',['--auto-continue','false']);assert.equal((await f.calls()).length,1,first.stdout+first.stderr);
 const child=continuationLocation(f.outputRoot,'continuation-fixture',f.taskId),childArgs=['--run-id',child.runId,'--output-root',child.root,'--runtime-lock',f.lock,'--continue-from',f.outputRoot,'--case-id','gpt6-fixture-0','--profile','three-sdk','--auto-continue','false','--max-concurrency','1','--account-concurrency','5'];
 const prepared=spawnSync(process.execPath,[path.join(f.cloud,'three-eval-runner.mjs'),'--mode','prepare',...childArgs],{cwd:f.root,encoding:'utf8',timeout:10000});assert.equal(prepared.status,0,prepared.stderr);
 await writeFile(path.join(f.outputRoot,'recovery-runs.json'),JSON.stringify({kind:'three-creator-recovery-runs',schemaVersion:1,runs:[{runId:child.runId,relativeDirectory:child.relativeDirectory}]}));
 const resumed=f.invoke('resume');assert.equal((await f.calls()).length,1,resumed.stdout+resumed.stderr);
 const continued=f.invoke('continue');assert.equal((await f.calls()).length,2,continued.stdout+continued.stderr);
 const again=f.invoke('continue');assert.equal((await f.calls()).length,2,again.stdout+again.stderr);
});
test('parent halt written after prepare prevents any new child model POST',async t=>{
 const f=await fixture(t);f.invoke('run',['--auto-continue','false']);const child=continuationLocation(f.outputRoot,'continuation-fixture',f.taskId);
 const args=['--run-id',child.runId,'--output-root',child.root,'--runtime-lock',f.lock,'--continue-from',f.outputRoot,'--case-id','gpt6-fixture-0','--auto-continue','false'];
 const prepared=spawnSync(process.execPath,[path.join(f.cloud,'three-eval-runner.mjs'),'--mode','prepare',...args],{cwd:f.root,encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
 await writeFile(path.join(f.outputRoot,'halt.json'),JSON.stringify({reason:'test operator stop'}));
 const ran=spawnSync(process.execPath,[path.join(f.cloud,'three-eval-runner.mjs'),'--mode','run',...args],{cwd:f.root,encoding:'utf8',timeout:10000});assert.notEqual(ran.status,0);assert.equal((await f.calls()).length,1,ran.stdout+ran.stderr);
 const childState=JSON.parse(await readFile(path.join(child.root,f.taskId,'state.json'),'utf8'));assert.match(childState.failure.message,/PARENT_HALTED/);
});
test('failed provider with completed verified transport delivery finishes through same-job artifact recovery',async t=>{
 const f=await fixture(t);f.invoke('run',['--auto-continue','false']);const [call]=await f.calls(),work=path.join(call.workDirectory,'tasks',f.taskId),caseRoot=path.join(f.outputRoot,f.taskId);
 const lockBytes=await readFile(f.lock),lock=JSON.parse(lockBytes),sourceHash=sha256('synthetic source'),runtimeHash=lock.prebuiltRuntimes['three-sdk'].runtimeHash,tar=Buffer.from('SYNTHETIC transport fixture, browser/closed archive publication is tested separately'),png=await readFile(path.join(f.root,'reference.png'));
 const result={kind:'three-creator-delivery',schemaVersion:1,toolVersion:'0.2.0-experimental',sdkVersion:'0.2.0-experimental',engine:'three@0.185.1',profile:'three-sdk',status:'ready-for-independent-review',technicalStatus:'passed',semanticStatus:'unreviewed',browserObservationContract:'WorldObservation-v2',actualWallSeconds:180,inputWallSeconds:180,activePlaySeconds:180,videoMetadata:{durationSeconds:180,frameCount:181,widthPixels:960,heightPixels:540},captureTiming:{clock:'browser-performance',initialFrameRequestedAtMilliseconds:0,finalFrameRequestedAtMilliseconds:180100,recorderStoppedAtMilliseconds:181000,framePeriodSeconds:1,requestedFrames:182,postrollSeconds:1},episodeHash:sha256('episode fixture'),sourceHash,runtimeHash,creatorRuntimeLockHash:sha256(lockBytes),worldBuildHash:sha256(JSON.stringify({sourceHash,runtimeHash,profile:'three-sdk'})),previewEvidenceSha256:sha256('preview fixture'),deliveryManifestSha256:sha256('manifest fixture'),archivePath:work+'/creator-delivery.tar.gz',archiveSha256:sha256(tar),archiveByteLength:tar.length};
 const event=(tool,body,extra=[])=>({type:'item.completed',item:{type:'mcp_tool_call',server:'worldkit_three_creator',tool,result:{content:[{type:'text',text:JSON.stringify(body)},...extra]}}});
 const events=Buffer.from([event('world_preview',{operationId:'opening',status:'queued'}),event('operations_get',{id:'opening',type:'world.preview',status:'succeeded',result:{view:'opening',profile:'three-sdk',sourceHash,worldBuildHash:result.worldBuildHash,image:{sha256:sha256(png)}}},[{type:'image',mimeType:'image/png',data:png.toString('base64')}]),event('world_submit',{operationId:'submit',status:'queued'}),event('operations_get',{id:'submit',type:'world.submit',status:'succeeded',result})].map(JSON.stringify).join('\n'));
 const receipt=Buffer.from(JSON.stringify(result)),artifacts={'creator-result.json':{bytes:receipt.length,sha256:sha256(receipt)},'creator-delivery.tar.gz':{bytes:tar.length,sha256:sha256(tar)}};
 const launcher={kind:'three-creator-launcher-report',status:'delivered',runtimeHash:sha256(lockBytes),caseId:'gpt6-fixture-0',taskId:f.taskId,profile:'three-sdk',engine:'three@0.185.1',workspace:work,model:'gpt-6-astra',reasoningEffort:'xhigh',eventsTransportSha256:sha256(events),eventsSha256:sha256(events),artifacts};
 for(const [name,bytes] of Object.entries({'creator-result.json':receipt,'creator-delivery.tar.gz':tar,'creator-events.jsonl':events,'creator-launcher-report.json':Buffer.from(JSON.stringify(launcher))}))await writeFile(path.join(f.root,'s3',sha256(call.payload.output_s3_prefix+'/tasks/'+f.taskId+'/'+name)),bytes);
 const admission=path.join(f.root,'.codex-tmp/three-creator-eval/admissions',f.taskId+'.json'),newOwner={requestId:'newer-explicit-run',phase:'running',jobId:'gen_abcdef12',providerStatus:'running',hasSubmissionIntent:true};await writeFile(admission,JSON.stringify(newOwner));
 const resumed=f.invoke('resume');assert.equal(resumed.status,0,resumed.stdout+resumed.stderr);assert.equal((await f.calls()).length,1);assert.deepEqual(JSON.parse(await readFile(admission,'utf8')),newOwner);
 const state=JSON.parse(await readFile(path.join(caseRoot,'state.json'),'utf8'));assert.equal(state.phase,'delivered');assert.equal(state.providerStatus,'failed');assert.equal(state.deliveryRecovery.kind,'artifact-only');assert(state.submitReceipt);
});

test('confirmed cancellation remains cancelled with saved progress and cannot trigger a continuation',async t=>{
 const f=await fixture(t);
 await writeFile(path.join(f.root,'provider-state.json'),JSON.stringify({status:'cancelled',progress:{summary:{ray_cleanup_checked:true,ray_cleanup_pending:false}}}));
 const run=f.invoke('run');assert.equal(run.status,1,run.stdout+run.stderr);
 assert.equal((await f.calls()).length,1);
 const before=JSON.parse(await readFile(path.join(f.outputRoot,f.taskId,'state.json'),'utf8'));
 assert.equal(before.phase,'cancelled');assert.equal(before.rayCleanupConfirmed,true);assert.equal(before.progress.status,'unverified');
 f.invoke('continue');assert.equal((await f.calls()).length,1);
});
