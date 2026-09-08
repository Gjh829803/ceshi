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
import {retrieveThreeDeliveryArtifacts} from './three-eval-delivery-recovery.mjs';
import {resolveCreatorSubmission} from './three-eval-runtime.mjs';
import {runWithExecutionSlots} from './three-execution-slots.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const policy={schemaVersion:1,scope:'worldkit-creator',preferred:['A','B'].map(label=>({label,identitySha256:hash(label)})),denied:[{label:'D',identitySha256:hash('D')}],allowUnratedFallback:false};
const inventory=['A','B','D','unrated'].map(codexAccountId=>({codexAccountId,eligible:true,healthStatus:'active'}));
test('optional account roots are scoped to project experiments and bind exactly one selected identity',()=>{
 const root='/fsx/pipeline/worldkit-three-creator-experiments/owned-account-pools',restricted={...policy,codexAccountRoot:root};
 assert.equal(creatorAccountRoot(['A'],policy),undefined);
 assert.equal(creatorAccountRoot(['A'],restricted),root+'/'+hash('A'));
 assert.throws(()=>creatorAccountRoot(['A','B'],restricted),/REQUIRES_SINGLE_ID/);assert.throws(()=>creatorAccountRoot(['D'],restricted),/DENIED/);
 for(const codexAccountRoot of [null,'','relative','/var/run/lwdp/secrets/codex-accounts/current','/fsx/pipeline/worldkit-three-creator-experiments','/fsx/pipeline/worldkit-three-creator-experiments/','/fsx/pipeline/worldkit-three-creator-experiments/../outside',root+'/',root+'//child',root+'/./child',root+'/../child',root+'/%2e%2e',root+'/link\\escape',root+'\0'])assert.throws(()=>validateCreatorAccountPolicy({...policy,codexAccountRoot}),/ROOT_INVALID/);
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
  return {stdout:Buffer.concat([Buffer.from(JSON.stringify({name:row.name,sha256:hash(body),bytes:body.length})+'\n'),body])};
 };
 try {
  const input={jobId:'gen_12345678',taskId:'case-example--three-sdk',caseRoot:root,names:['creator-result.json']};
  await assert.rejects(retrieveThreeDeliveryArtifacts(input,{pod:'replacement',transport}));
  const result=await retrieveThreeDeliveryArtifacts(input,{pod:'replacement',transport});assert.equal(result['creator-result.json'].sha256,hash(body));assert.deepEqual(await readFile(path.join(root,'creator-result.json')),body);
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
