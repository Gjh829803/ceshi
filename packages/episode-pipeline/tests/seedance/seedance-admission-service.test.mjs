import{test}from'node:test';import assert from'node:assert/strict';import{createAdmissionBatch,createSeedanceJournalAccess,startAdmissionService}from'../../src/seedance/seedance-admission-service.mjs';import{initializeProductionBudget as init,productionBudgetStats as stats}from'../../src/seedance/seedance-production-budget.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const baseline=state=>init(state,{limitUnits:4000,sourceProof:'test-baseline'}),meta={units:2,attempt:'attempt-01',preparingOnly:true};
test('100 parallel clip leases use one CAS; overflow waits for release and preserves external leases',async()=>{let calls=0;const state=baseline({maximumActive:100,active:{external:{}}});const store={async change(_name,fn){calls++;return{result:fn(state)}}};const gate=createAdmissionBatch({store,name:'test-budget',maximumActive:100});const admitted=[];const promises=Array.from({length:105},(_,i)=>gate.enter(String(i),meta).then(()=>admitted.push(i)));await gate.flush();await Promise.resolve();assert.equal(calls,1);assert.equal(admitted.length,99);assert.equal(Object.keys(state.active).length,100);assert(state.active.external);const released=Array.from({length:6},(_,i)=>gate.leave(String(i),{status:'unsubmitted',units:2,attempt:'attempt-01'}));await gate.flush();await Promise.all([...promises,...released]);assert.equal(calls,2);assert.equal(Object.keys(state.active).length,100);assert.equal(gate.health().pending,0);});
test('CAS failure never acknowledges admission and is retried without duplicate slots',async()=>{let fail=true;const state=baseline({maximumActive:160,active:{}});const gate=createAdmissionBatch({name:'test-budget',maximumActive:160,store:{async change(_name,fn){if(fail)throw Error('temporary');return{result:fn(state)}}}});let admitted=false;const wait=gate.enter('x',meta).then(()=>admitted=true);await gate.flush();assert.equal(admitted,false);assert.equal(gate.health().pending,1);fail=false;await gate.flush();await wait;assert.equal(admitted,true);assert.equal(Object.keys(state.active).length,1);});

test('one CAS enforces total budget across parallel half lanes',async()=>{
 const state=init({maximumActive:160,active:{}},{limitUnits:4000,sourceProof:'near-cap',generated:[...Array.from({length:1999},(_,i)=>({taskId:'t'+i,inputHash:'h'+i,units:2})),{taskId:'half',inputHash:'oldhalf',units:1}]});
 const gate=createAdmissionBatch({name:'test-budget',maximumActive:160,store:{async change(_name,fn){return{result:fn(state)}}}});
 const a=gate.enter('newhalf-A',{...meta,units:1});const rejected=assert.rejects(gate.enter('newhalf-B',{...meta,units:1}),/BUDGET_EXHAUSTED/);
 await gate.flush();await a;await rejected;assert.equal(stats(state).committedUnits,4000);assert.equal(Object.keys(state.active).length,1);
 const leave=gate.leave('newhalf-A',{status:'generated',taskId:'done-half',units:1,attempt:'attempt-01',qualityVerdict:'failed'});await gate.flush();await leave;assert.equal(stats(state).committedUnits,4000);assert.equal(stats(state).reservedUnits,0);
});

async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'seedance-admission-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const inputHash='a'.repeat(64),id='style-01-segment-00',attempt='attempt-01';
 const manifestPath=path.join(root,'seedance-requests.json'),statePath=path.join(root,id,attempt,'seedance-state.json');
 const manifest={caseId:'case-a',authorization:{seedanceSubmission:true},requests:[{id,inputHash}]};
 const state={id,inputHash,attempt,status:'preparing',taskId:null,providerSubmitted:false};
 await mkdir(path.dirname(statePath),{recursive:true});
 const save=()=>Promise.all([writeFile(manifestPath,JSON.stringify(manifest)),writeFile(statePath,JSON.stringify(state))]);await save();
 return{root,inputHash,id,attempt,manifestPath,statePath,manifest,state,save};
}

test('journal admission rechecks exact manifest identity and uncertain attempts cannot re-POST',async t=>{
 const f=await fixture(t);let checks=0;
 const access=createSeedanceJournalAccess({manifestPaths:[f.manifestPath],verifyRequest:async(file,id)=>{
  checks++;assert.equal(file,f.manifestPath);assert.equal(id,f.id);return{passed:true,inputHash:f.inputHash,requestId:f.id,durationSeconds:30};
 }});
 assert.equal((await access.verifyAdmission(f.inputHash,{attempt:f.attempt})).preparingOnly,true);assert.equal(checks,1);
 f.state.status='submission-unknown';f.state.submissionStartedAt='now';await f.save();
 await assert.rejects(access.verifyAdmission(f.inputHash,{attempt:f.attempt}),/REQUIRES_RECONCILIATION/);
 assert.equal((await access.resolveSettlement(f.inputHash,{attempt:f.attempt})).status,'unknown');
 f.state.taskId='paid-task';f.state.status='remote-pending';await f.save();
 assert.equal((await access.verifyAdmission(f.inputHash,{attempt:f.attempt,taskId:'paid-task'})).existingTaskId,'paid-task');assert.equal(checks,1);
 await assert.rejects(access.verifyAdmission(f.inputHash,{attempt:f.attempt,taskId:'wrong-task'}),/TASK_ID_MISMATCH/);
 f.state.providerStatus='succeeded';await f.save();
 assert.equal((await access.resolveSettlement(f.inputHash,{attempt:f.attempt})).status,'generated');
 f.manifest.requests.push({...f.manifest.requests[0]});await f.save();
 await assert.rejects(access.verifyAdmission(f.inputHash,{attempt:f.attempt}),/OWNER_AMBIGUOUS/);
 assert.equal((await access.resolveSettlement(f.inputHash,{attempt:f.attempt})).status,'unknown');
});

test('failed preflight cannot reserve and source failure does not orphan an existing provider task',async t=>{
 const f=await fixture(t),access=createSeedanceJournalAccess({manifestPaths:[f.manifestPath],verifyRequest:async()=>({passed:true})});
 await assert.rejects(access.verifyAdmission(f.inputHash,{attempt:f.attempt}),/PREFLIGHT_FAILED/);
 f.state.status='preflight-blocked';await f.save();
 assert.equal((await access.resolveSettlement(f.inputHash,{attempt:f.attempt})).status,'unsubmitted');
 f.state.submissionStartedAt='unknown-post';await f.save();
 assert.equal((await access.resolveSettlement(f.inputHash,{attempt:f.attempt})).status,'unknown');
 delete f.state.submissionStartedAt;
 f.state.taskId='paid-task';f.state.status='failed-provider';f.state.providerStatus='failed';await f.save();
 assert.equal((await access.resolveSettlement(f.inputHash,{attempt:f.attempt})).status,'not-generated');
 f.state.providerStatus='unknown';await f.save();
 assert.equal((await access.resolveSettlement(f.inputHash,{attempt:f.attempt})).status,'running');
 f.state.providerStatus='canceled';await f.save();
 assert.equal((await access.resolveSettlement(f.inputHash,{attempt:f.attempt})).status,'not-generated');
});

test('retry admission requires the exact authorized preceding failed journal and excludes content failures',async t=>{
 const f=await fixture(t),payloadIdentitySha256='b'.repeat(64),attempt='attempt-02';
 f.state.status='failed-provider';f.state.providerStatus='failed';f.state.taskId='paid-task';f.state.payloadIdentitySha256=payloadIdentitySha256;
 f.manifest.authorization.retry={attempt,priorAttempt:f.attempt,priorTaskId:'paid-task'};await f.save();
 const nextPath=path.join(f.root,f.id,attempt,'seedance-state.json');await mkdir(path.dirname(nextPath),{recursive:true});
 await writeFile(nextPath,JSON.stringify({id:f.id,inputHash:f.inputHash,attempt,status:'preparing',payloadIdentitySha256}));
 const access=createSeedanceJournalAccess({manifestPaths:[f.manifestPath],verifyRequest:async()=>({passed:true,inputHash:f.inputHash,requestId:f.id,durationSeconds:30})});
 assert.equal((await access.verifyAdmission(f.inputHash,{attempt})).authorizedRetryTaskId,'paid-task');
 f.state.providerErrorCode='OutputVideoSensitiveContentDetected';await f.save();
 await assert.rejects(access.verifyAdmission(f.inputHash,{attempt}),/RETRY_NOT_PERMITTED/);
 delete f.state.providerErrorCode;f.state.error={code:'ContentFilter'};await f.save();
 await assert.rejects(access.verifyAdmission(f.inputHash,{attempt}),/RETRY_NOT_PERMITTED/);
 delete f.state.error;f.state.providerStatus='succeeded';await f.save();
 await assert.rejects(access.verifyAdmission(f.inputHash,{attempt}),/RETRY_NOT_FAILED/);
 f.state.providerStatus='failed';f.state.payloadIdentitySha256='c'.repeat(64);await f.save();
 await assert.rejects(access.verifyAdmission(f.inputHash,{attempt}),/RETRY_PAYLOAD_CHANGED/);
 f.state.payloadIdentitySha256=payloadIdentitySha256;f.manifest.authorization.retry.priorTaskId='wrong-task';await f.save();
 await assert.rejects(access.verifyAdmission(f.inputHash,{attempt}),/RETRY_OWNER_MISMATCH/);
});

test('service authenticates before reading or writing shared budget and reconciles paid success',async t=>{
 let state;
 const store={async state(){return structuredClone(state);},async change(_name,transform,initial){
  const next=structuredClone(state??initial),result=transform(next);state=next;return{state:next,result};
 }};
 let verified=0,outcome={status:'unknown',attempt:'attempt-01',units:2};
 const token='unit-test-token-value';
 const {server,reconcile}=await startAdmissionService({name:'test-budget',maximumActive:2,limitUnits:4,sourceProof:'test',port:0,token,store,flushMs:2,reconcileMs:60000,
  verifyAdmission:async()=>{verified++;return{units:2,attempt:'attempt-01',preparingOnly:true};},resolveSettlement:async()=>outcome});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url=`http://127.0.0.1:${server.address().port}`,body=JSON.stringify({key:'a'.repeat(64),attempt:'attempt-01'});
 assert.equal((await fetch(`${url}/enter`,{method:'POST',body})).status,401);assert.equal(verified,0);
 assert.equal((await fetch(`${url}/health`)).status,401);
 const response=await fetch(`${url}/enter`,{method:'POST',body,headers:{Authorization:`Bearer ${token}`}});
 assert.equal(response.status,200);assert.equal(stats(state).reservedUnits,2);assert.equal(verified,2);
 outcome={...outcome,status:'generated',taskId:'real-task'};await reconcile();
 assert.equal(stats(state).generatedUnits,2);assert.equal(stats(state).reservedUnits,0);assert.equal(Object.keys(state.active).length,0);
});
test('same preparing owner can recover lost ack; late leave and unknown never free another reservation',async()=>{
 const state=baseline({maximumActive:160,active:{}}),gate=createAdmissionBatch({name:'test-budget',maximumActive:160,store:{async change(_name,fn){return{result:fn(state)}}}});
 let p=gate.enter('x',meta);await gate.flush();await p;p=gate.enter('x',meta);await gate.flush();await p;assert.equal(stats(state).reservedUnits,2);
 p=gate.leave('x',{status:'unsubmitted',units:2,attempt:'attempt-02'});await gate.flush();await p;assert.equal(stats(state).reservedUnits,2);assert(state.active.x);
 p=gate.leave('x',{status:'unknown',units:2,attempt:'attempt-01'});await gate.flush();await p;assert.equal(stats(state).reservedUnits,2);assert(state.active.x);
 const reject=assert.rejects(gate.enter('x',meta),/INPUT_ALREADY_RESERVED/);await gate.flush();await reject;
});

test('a terminal settlement arriving during CAS is not acknowledged or lost with the older snapshot',async()=>{
 let release,pause=false;
 const state=baseline({maximumActive:2,active:{}}),gate=createAdmissionBatch({name:'test-budget',maximumActive:2,store:{async change(_name,fn){
  const result=fn(state);if(pause)await new Promise(resolve=>{release=resolve;});return{result};
 }}});
 const entered=gate.enter('x',meta);await gate.flush();await entered;
 const unknown=gate.leave('x',{...meta,status:'unknown'});pause=true;const flushing=gate.flush();
 let acknowledged=false;const generated=gate.leave('x',{...meta,status:'generated',taskId:'real-task'}).then(()=>{acknowledged=true;});
 release();await flushing;await unknown;assert.equal(acknowledged,false);assert.equal(stats(state).generatedUnits,0);
 pause=false;await gate.flush();await generated;assert.equal(stats(state).generatedUnits,2);assert.equal(stats(state).reservedUnits,0);
});

test('CAS retry admission carries the verified prior task and lost acknowledgements retain its identity',async()=>{
 const state=baseline({maximumActive:2,active:{}});
 state.productionBudget.submittedByTaskId['old-task']={inputHash:'input',units:2,outcome:'not-generated'};
 const gate=createAdmissionBatch({name:'test-budget',maximumActive:2,store:{async change(_name,fn){return{result:fn(state)};}}});
 const proof={...meta,attempt:'attempt-02',authorizedRetryTaskId:'old-task'};
 let wait=gate.enter('input',proof);await gate.flush();await wait;
 wait=gate.enter('input',proof);await gate.flush();await wait;assert.equal(stats(state).reservedUnits,2);
 const changed=assert.rejects(gate.enter('input',{...proof,authorizedRetryTaskId:'other-task'}),/IDENTITY_CONFLICT/);
 await gate.flush();await changed;assert.equal(state.productionBudget.reservationsByInputHash.input.authorizedRetryTaskId,'old-task');
});
