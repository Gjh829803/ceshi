import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,realpath,mkdir,writeFile,symlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {selectCreatorAccount,assertCreatorAccountSelection,actualCreatorAccountEvidence,creatorAccountRoot,validateCreatorAccountPolicy} from './three-account-routing.mjs';
import {admissionIsClosed} from './three-eval-admission.mjs';
import {selectThreeLiveHead,threeLiveReaderPython} from './three-eval-live.mjs';
import {retrieveThreeDeliveryArtifacts,DELIVERY_READ_PYTHON} from './three-eval-delivery-recovery.mjs';
import {resolveProviderWorkspace,validateProviderLauncher} from './three-eval-workspace.mjs';
import {resolveCreatorSubmission} from './three-eval-runtime.mjs';
import {runWithExecutionSlots} from './three-execution-slots.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const policy={schemaVersion:1,scope:'worldkit-creator',preferred:['A','B'].map(label=>({label,identitySha256:hash(label)})),denied:[{label:'D',identitySha256:hash('D')}],allowUnratedFallback:false};
const inventory=['A','B','D','unrated'].map(codexAccountId=>({codexAccountId,eligible:true,healthStatus:'active'}));
test('submission endpoint override accepts only an explicit loopback HTTP port',()=>{
 assert.equal(validateCreatorAccountPolicy(policy),policy);
 for(const port of [1,18465,65535])assert.equal(validateCreatorAccountPolicy({...policy,submissionApiBase:'http://127.0.0.1:'+port}).submissionApiBase,'http://127.0.0.1:'+port);
 for(const submissionApiBase of [null,'','http://127.0.0.1','http://127.0.0.1:0','http://127.0.0.1:65536','http://127.0.0.1:018465','https://127.0.0.1:18465','http://localhost:18465','http://127.0.0.1.example:18465','http://user:secret@127.0.0.1:18465','http://127.0.0.1:18465/','http://127.0.0.1:18465?token=x','http://[::1]:18465'])assert.throws(()=>validateCreatorAccountPolicy({...policy,submissionApiBase}),/SUBMISSION_API_BASE_INVALID/);
});
test('optional account roots are scoped to project experiments and bind exactly one selected identity',()=>{
 const root='/fsx/pipeline/worldkit-three-creator-experiments/owned-account-pools',restricted={...policy,codexAccountRoot:root};
 assert.equal(creatorAccountRoot(['A'],policy),undefined);
 assert.equal(creatorAccountRoot(['A'],restricted),root+'/'+hash('A'));
 assert.throws(()=>creatorAccountRoot(['A','B'],restricted),/REQUIRES_SINGLE_ID/);assert.throws(()=>creatorAccountRoot(['D'],restricted),/DENIED/);
 for(const codexAccountRoot of [null,'','relative','/var/run/lwdp/secrets/codex-accounts/current','/fsx/pipeline/worldkit-three-creator-experiments','/fsx/pipeline/worldkit-three-creator-experiments/','/fsx/pipeline/worldkit-three-creator-experiments/../outside',root+'/',root+'//child',root+'/./child',root+'/../child',root+'/%2e%2e',root+'/link\\escape',root+'\0'])assert.throws(()=>validateCreatorAccountPolicy({...policy,codexAccountRoot}),/ROOT_INVALID/);
});
test('pool selection requests the whole eligible preferred cohort and accepts only its actual members',()=>{
 const root='/fsx/pipeline/worldkit-three-creator-experiments/shared-known-pool',pool={...policy,selection:'pool',codexAccountRoot:root};
 const ids=selectCreatorAccount({policy:pool,inventory,slot:100});assert.deepEqual(ids,['A','B']);assert.equal(creatorAccountRoot(ids,pool),root);
 assert.deepEqual(selectCreatorAccount({policy:pool,inventory:inventory.map(row=>({...row,eligible:row.codexAccountId==='B'}))}),['B']);
 assert.deepEqual(selectCreatorAccount({policy:pool,inventory,requestedIds:['B','A']}),['B','A']);
 assert.equal(actualCreatorAccountEvidence(ids,'B',pool).verified,true);assert.equal(actualCreatorAccountEvidence(ids,'unrated',pool).verified,false);assert.equal(actualCreatorAccountEvidence(ids,'D',pool).denied,true);
 assert.throws(()=>selectCreatorAccount({policy:pool,inventory,requestedIds:['unrated']}),/POOL_SELECTION_INVALID/);
 assert.throws(()=>validateCreatorAccountPolicy({...pool,codexAccountRoot:undefined}),/POOL_POLICY_INVALID/);
 assert.throws(()=>validateCreatorAccountPolicy({...pool,selection:'all'}),/SELECTION_MODE_INVALID/);
 const sixtyFour=Array.from({length:64},(_,index)=>'account-'+index),wide={...pool,preferred:sixtyFour.map(label=>({label,identitySha256:hash(label)}))};
 assert.equal(selectCreatorAccount({policy:wide,inventory:sixtyFour.map(codexAccountId=>({codexAccountId,eligible:true,healthStatus:'active'}))}).length,64);
 assert.throws(()=>validateCreatorAccountPolicy({...wide,preferred:[...wide.preferred,{label:'extra',identitySha256:hash('extra')}]}),/POOL_POLICY_INVALID/);
});
test('probation accounts require explicit selection and never become automatic fallback',()=>{
 const trial={...policy,probation:[{label:'U01',identitySha256:hash('unrated')}]};
 assert.deepEqual(selectCreatorAccount({policy:trial,inventory,requestedIds:['unrated']}),['unrated']);
 assert.deepEqual(selectCreatorAccount({policy:trial,inventory}),['A']);
 assert.throws(()=>selectCreatorAccount({policy:trial,inventory:inventory.map(r=>({...r,eligible:r.codexAccountId==='unrated'}))}),/PREFERRED_ACCOUNTS_UNAVAILABLE/);
 assert.throws(()=>selectCreatorAccount({policy:trial,inventory:inventory.map(r=>({...r,eligible:false})),requestedIds:['unrated']}),/NOT_PREFERRED/);
 assert.equal(actualCreatorAccountEvidence(['unrated'],'unrated',trial).label,'U01');
});
test('expanded execution slots admit up to 64 while enforcing the configured bound',async()=>{
 let active=0,peak=0;
 await runWithExecutionSlots(Array.from({length:90}),37,async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;});
 assert.equal(peak,37);
 await assert.rejects(()=>runWithExecutionSlots([],65,async()=>{}),/CAPACITY_INVALID/);
});
test('new cases distribute across approved healthy accounts and never fall back to denied or unrated accounts',()=>{
 assert.deepEqual(Array.from({length:10},(_,slot)=>selectCreatorAccount({policy,inventory,slot})[0]),['A','B','A','B','A','B','A','B','A','B']);
 assert.throws(()=>selectCreatorAccount({policy,inventory,requestedIds:['D']}),/DENIED/);
 assert.throws(()=>selectCreatorAccount({policy,inventory,requestedIds:['unrated']}),/NOT_PREFERRED/);
 assert.throws(()=>selectCreatorAccount({policy,inventory:inventory.map(r=>({...r,eligible:r.codexAccountId==='D'}))}),/PREFERRED_ACCOUNTS_UNAVAILABLE/);
 assert.deepEqual(selectCreatorAccount({policy,inventory,requestedIds:['B']}),['B']);
});
test('fixed account routing and actual execution evidence remain distinct',()=>{
 assert.deepEqual(assertCreatorAccountSelection(['A'],policy),['A']);
 assert.equal(actualCreatorAccountEvidence(['A'],null,policy).verified,false);
 assert.equal(actualCreatorAccountEvidence(['A'],'B',policy).verified,false);
 assert.equal(actualCreatorAccountEvidence(['A'],'A',policy).verified,true);
 assert.equal(actualCreatorAccountEvidence(['A'],'D',policy).denied,true);
});
test('terminal execution frees admission during downloads while unknown and unconfirmed cancellation retain it',()=>{
 for(const providerStatus of ['succeeded','completed','failed','submit_failed'])assert.equal(admissionIsClosed({providerStatus,phase:'delivery-pending',jobId:'gen_1234'}),true);
 assert.equal(admissionIsClosed({providerStatus:'running',phase:'remote-pending',jobId:'gen_1234'}),false);
 assert.equal(admissionIsClosed({phase:'submission-unknown',hasSubmissionIntent:true}),false);
 assert.equal(admissionIsClosed({providerStatus:'cancelled',phase:'failed',rayCleanupConfirmed:false}),false);
 assert.equal(admissionIsClosed({providerStatus:'cancelled',rayCleanupConfirmed:true}),true);
});
test('replacement head selection ignores terminating nodes and refuses ambiguous/unready infrastructure',()=>{
 const ready=name=>({metadata:{name},spec:{containers:[{name:'ray-head'}]},status:{phase:'Running',conditions:[{type:'Ready',status:'True'}]}});
 assert.equal(selectThreeLiveHead({items:[{...ready('old'),metadata:{name:'old',deletionTimestamp:'now'}},ready('replacement')]}),'replacement');
 assert.throws(()=>selectThreeLiveHead({items:[ready('a'),ready('b')]}),/UNAVAILABLE/);
 assert.throws(()=>selectThreeLiveHead({items:[]}),/UNAVAILABLE/);
});
test('safe live reads only identity-bound direct or provider attempt outputs and rejects ambiguous paths',async()=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'three-live-attempt-'))),task='current-case--three-sdk',runtimeHash=hash('runtime');
 const row={jobId:'gen_123abc',taskId:task,requestId:'request-current',workDir:root,runtimeHash};
 const direct=path.join(root,'tasks',task),attempt=suffix=>path.join(root,'tasks/account_attempts',task+'_'+suffix,task);
 const read=overrides=>JSON.parse(execFileSync('python3',['-c',threeLiveReaderPython,JSON.stringify([{...row,...overrides}])],{encoding:'utf8'})).jobs[0];
 const write=async(workspace,status='running',overrides={})=>{
  await mkdir(path.join(workspace,'outputs'),{recursive:true});
  await writeFile(path.join(workspace,'outputs/creator-launcher-report.json'),JSON.stringify({taskId:task,workspace,runtimeHash,status,...overrides}));
  await writeFile(path.join(workspace,'outputs/creator-events.jsonl'),[{type:'thread.started'},{type:'turn.started'},{type:'error',message:'Selected model is at capacity.'}].map(JSON.stringify).join('\n'));
 };
 try{
  await write(direct);let result=read();assert.equal(result.cliActivityObserved,true);assert.equal(result.resolvedWorkspace,direct);assert.equal(result.outputPathSource,'task-workspace');
  await rm(direct,{recursive:true});const first=attempt('abcdefgh');await write(first);
  await symlink(root,path.join(first,'scratch'));
  result=read();assert.equal(result.cliActivityObserved,true);assert.equal(result.resolvedWorkspace,first);assert.equal(result.outputPathSource,'provider-account-attempt');assert.deepEqual(result.failureFacts,[{layer:'model-service',code:'MODEL_CAPACITY'}]);
  await write(first,'running',{runtimeHash:hash('foreign')});assert.equal(read().observationError,'LIVE_REPORT_IDENTITY_CHANGED');
  await write(first,'running',{workspace:direct});assert.equal(read().observationError,'LIVE_REPORT_IDENTITY_CHANGED');await write(first);
  const second=attempt('ijklmnop');await write(second);assert.equal(read().observationError,'LIVE_ATTEMPT_AMBIGUOUS');
  result=read({providerWorkspace:first});assert.equal(result.resolvedWorkspace,first);assert.equal(result.cliActivityObserved,true);
  assert.equal(read({providerWorkspace:root}).observationError,'LIVE_PROVIDER_WORKSPACE_INVALID');
  await write(first,'failed');result=read();assert.equal(result.resolvedWorkspace,second);
  await rm(path.join(second,'outputs/creator-launcher-report.json'));await rm(first,{recursive:true});
  result=read();assert.equal(result.observationPending,'launcher-identity-pending');assert.equal(result.cliActivityObserved,undefined);assert.equal(result.events,undefined);
  await write(second);await rm(path.join(second,'outputs/creator-launcher-report.json'));await symlink(path.join(second,'outputs/creator-events.jsonl'),path.join(second,'outputs/creator-launcher-report.json'));
  assert.equal(read().observationError,'LIVE_PATH_CHANGED');
  await rm(path.join(root,'tasks/account_attempts'),{recursive:true});await symlink(root,path.join(root,'tasks/account_attempts'));assert.equal(read().observationError,'LIVE_ATTEMPT_PATH_CHANGED');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('unknown submission resumes by exact identity without another create call',async()=>{
 let creates=0,reads=0;
 const input={hasDurableIntent:true,mode:'run',findExisting:async()=>{reads++;return 'gen_12345678';},createIntentAndSubmit:async()=>{creates++;throw Error('must not create');}};
 assert.equal(await resolveCreatorSubmission(input),'gen_12345678');assert.equal(creates,0);assert.equal(reads,1);
 await assert.rejects(resolveCreatorSubmission({...input,findExisting:async()=>{throw Error('lookup temporarily unavailable');}}));assert.equal(creates,0);
});
test('confirmed absence permits one identical idempotency replay, while lookup outages do not',async()=>{
 let reads=0,replays=0,creates=0;
 const input={hasDurableIntent:true,mode:'run',wait:async()=>{},createIntentAndSubmit:async()=>{creates++;},findExisting:async()=>{reads++;throw Object.assign(Error('not found'),{status:404});},replayIntentAndSubmit:async()=>{replays++;return 'gen_12345678';}};
 assert.equal(await resolveCreatorSubmission(input),'gen_12345678');assert.equal(reads,3);assert.equal(replays,1);assert.equal(creates,0);
 await assert.rejects(resolveCreatorSubmission({...input,findExisting:async()=>{throw Object.assign(Error('gateway'),{status:503});}}));assert.equal(replays,1);
 let delayedReads=0;
 assert.equal(await resolveCreatorSubmission({...input,findExisting:async()=>{if(++delayedReads===1)throw Object.assign(Error('not found'),{status:404});return 'gen_87654321';}}),'gen_87654321');assert.equal(replays,1);
});
test('same-job artifact recovery survives a transport retry without model submission and validates received bytes',async()=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'three-delivery-retry-')));let attempts=0;
 const body=Buffer.from('{"status":"delivered"}');
 const transport=async(_command,args)=>{
  assert(args.includes('gen_12345678')===false); // job identity is passed in the closed JSON row
  const row=JSON.parse(args.at(-1));assert.equal(row.jobId,'gen_12345678');assert.equal(row.taskId,'case-example--three-sdk');
  if(++attempts===1)throw Error('head connection lost');
  return {stdout:Buffer.concat([Buffer.from(JSON.stringify({name:row.name,sha256:hash(body),bytes:body.length,jobId:row.jobId,taskId:row.taskId,workspace:row.workspace,runtimeHash:row.runtimeHash,sourcePath:row.workspace+'/outputs/'+row.name,launcherSha256:hash('launcher'),pathResolution:'directory-fd-no-follow'})+'\n'),body])};
 };
 try {
  const input={jobId:'gen_12345678',taskId:'case-example--three-sdk',caseRoot:root,names:['creator-result.json'],workspaceBinding:resolveProviderWorkspace({jobId:'gen_12345678',taskId:'case-example--three-sdk',runtimeHash:hash('runtime')})};
  await assert.rejects(retrieveThreeDeliveryArtifacts(input,{pod:'replacement',transport}));
  const result=await retrieveThreeDeliveryArtifacts(input,{pod:'replacement',transport});assert.equal(result['creator-result.json'].sha256,hash(body));assert.deepEqual(await readFile(path.join(root,'creator-result.json')),body);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('provider workspace binding requires matching job, task, runtime and unambiguous provider evidence',()=>{
 const jobId='gen_12345678',taskId='case-example--three-sdk',runtimeHash=hash('runtime'),workDirectory='/fsx/pipeline/lwdp_generation/'+jobId;
 const workspace=workDirectory+'/tasks/account_attempts/'+taskId+'_abcdefgh/'+taskId;
 const providerItem={item_id:taskId,metadata:{log_path:workspace+'/logs/codex_attempt.json'}},providerAttempt={item_id:taskId,workdir:workspace};
 const input={jobId,taskId,runtimeHash,providerItem,providerAttempt},binding=resolveProviderWorkspace(input),launcher={kind:'three-creator-launcher-report',taskId,workspace,runtimeHash};
 assert.equal(binding.workspace,workspace);assert.equal(validateProviderLauncher(binding,launcher),workspace);
 for(const change of [{jobId:'gen_87654321'},{taskId:'different-task'},{workDirectory:workDirectory+'/..'},{providerAttempt:{...providerAttempt,workdir:workDirectory+'/tasks/'+taskId}},{providerAttempt:{...providerAttempt,item_id:'another-task'}}])assert.throws(()=>resolveProviderWorkspace({...input,...change}),/WORKSPACE|IDENTITY/);
 for(const change of [{taskId:'other-task'},{runtimeHash:hash('foreign')},{workspace:workDirectory+'/tasks/'+taskId},{kind:'author-created-report'}])assert.throws(()=>validateProviderLauncher(binding,{...launcher,...change}),/IDENTITY/);
 const live={jobId,taskId,workDir:workDirectory,resolvedWorkspace:workspace,launcher:{runtimeHash}};
 assert.equal(resolveProviderWorkspace({jobId,taskId,runtimeHash,live}).workspace,workspace);
 assert.throws(()=>resolveProviderWorkspace({jobId,taskId,runtimeHash,live:{...live,jobId:'gen_87654321'}}),/IDENTITY/);
 assert.throws(()=>resolveProviderWorkspace({jobId,taskId,runtimeHash,live:{...live,launcher:{runtimeHash:hash('foreign')}}}),/IDENTITY/);
});
test('closed delivery reader transports six bound attempt files and rejects swapped archives, identities and links',async()=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'three-provider-files-'))),jobId='gen_12345678',taskId='case-example--three-sdk',runtimeHash=hash('runtime');
 const workspace=path.join(root,jobId,'tasks/account_attempts',taskId+'_abcdefgh',taskId),out=path.join(workspace,'outputs');
 // A temporary fixture mount substitutes the fixed FSx prefix; the complete
 // production reader still performs its directory-fd, identity and hash checks.
 const reader=DELIVERY_READ_PYTHON.replace("'/fsx/pipeline/lwdp_generation/'",JSON.stringify(root+'/'));
 const files={'creator-result.json':Buffer.from('{"actual":"receipt"}'),'creator-delivery.tar.gz':Buffer.from('archive bytes'),'creator-events.jsonl':Buffer.from('{"type":"turn.started"}\n'),'creator-stderr.log':Buffer.from(''),'creator-mcp-stderr.log':Buffer.from('')};
 let launcher={kind:'three-creator-launcher-report',status:'delivered',taskId,workspace,runtimeHash,eventsSha256:hash(files['creator-events.jsonl']),stderrSha256:hash(''),artifacts:Object.fromEntries(['creator-result.json','creator-delivery.tar.gz'].map(name=>[name,{sha256:hash(files[name]),bytes:files[name].length}]))};
 const writeLauncher=()=>writeFile(path.join(out,'creator-launcher-report.json'),JSON.stringify(launcher));
 const read=(name,extra={})=>{const bytes=execFileSync('python3',['-c',reader,JSON.stringify({jobId,taskId,workspace,runtimeHash,name,...extra})],{stdio:'pipe'});const at=bytes.indexOf(10);return {header:JSON.parse(bytes.subarray(0,at)),body:bytes.subarray(at+1)};};
 try{
  await mkdir(out,{recursive:true});for(const [name,bytes] of Object.entries(files))await writeFile(path.join(out,name),bytes);await writeLauncher();
  for(const name of [...Object.keys(files),'creator-launcher-report.json']){const result=read(name);assert.equal(result.header.workspace,workspace);assert.equal(result.header.runtimeHash,runtimeHash);assert.equal(result.header.sha256,hash(result.body));assert.equal(result.header.pathResolution,'directory-fd-no-follow');assert.deepEqual(result.body,await readFile(path.join(out,name)));}
  await writeFile(path.join(out,'creator-delivery.tar.gz'),'different archive');assert.equal(read('creator-delivery.tar.gz').header.unavailable,true);
  launcher={...launcher,runtimeHash:hash('foreign')};await writeLauncher();assert.equal(read('creator-events.jsonl').header.unavailable,true);
  launcher={...launcher,runtimeHash,taskId:'foreign-task'};await writeLauncher();assert.equal(read('creator-launcher-report.json').header.unavailable,true);
  assert.throws(()=>read('creator-events.jsonl',{jobId:'gen_87654321'}));
  await rm(out,{recursive:true});await mkdir(path.join(root,'other'));await symlink(path.join(root,'other'),out);assert.equal(read('creator-events.jsonl').header.unavailable,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('slow downloads do not hold model slots, but completion still waits for their artifacts',async()=>{
 let finishDownloads,downloadsDone=false,active=0,peak=0;const started=[];
 const gate=new Promise(resolve=>{finishDownloads=()=>{downloadsDone=true;resolve();};});
 const complete=runWithExecutionSlots([1,2,3],1,async(plan,release)=>{
  active++;peak=Math.max(peak,active);started.push(plan);await Promise.resolve();active--;release();release();
  if(plan===3)finishDownloads();await gate;
 });
 await complete;assert.deepEqual(started,[1,2,3]);assert.equal(peak,1);assert.equal(downloadsDone,true);
});
