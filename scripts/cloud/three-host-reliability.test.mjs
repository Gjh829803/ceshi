import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {selectCreatorAccount,assertCreatorAccountSelection,actualCreatorAccountEvidence} from './three-account-routing.mjs';
import {admissionIsClosed} from './three-eval-admission.mjs';
import {selectThreeLiveHead} from './three-eval-live.mjs';
import {retrieveThreeDeliveryArtifacts} from './three-eval-delivery-recovery.mjs';
import {resolveCreatorSubmission} from './three-eval-runtime.mjs';
import {runWithExecutionSlots} from './three-execution-slots.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const policy={schemaVersion:1,scope:'worldkit-creator',preferred:['A','B'].map(label=>({label,identitySha256:hash(label)})),denied:[{label:'D',identitySha256:hash('D')}],allowUnratedFallback:false};
const inventory=['A','B','D','unrated'].map(codexAccountId=>({codexAccountId,eligible:true,healthStatus:'active'}));
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
