import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeProductionBudget as initialize, admitProductionBudget as admit, settleProductionBudget as settle, productionBudgetStats as stats } from '../../src/seedance/seedance-production-budget.mjs';
const init = (generated = [], outstanding = []) => initialize({ active: { untouched: true } }, { generated, outstanding, limitUnits:4000, plannedMix:{normal30s:1000,half15s:2000}, sourceProof: { sha256: 'verified-baseline' } });
const full = () => init(Array.from({ length: 2000 }, (_, i) => ({ taskId: `task-${i}`, inputHash: `input-${i}`, units: 2 })));
const throws = (f, code) => assert.throws(f, e => e.code === `SEEDANCE_PRODUCTION_BUDGET_${code}`);

test('integer half units and immutable state', () => {
 const a=init(), b=admit(a,'a',{units:1}), c=admit(b,'b',{units:2});
 assert.equal(stats(a).committedUnits,0); assert.equal(stats(c).reservedEquivalent,1.5); assert.deepEqual(c.active,a.active);
 assert.deepEqual(c.productionBudget.plannedMix,{normal30s:1000,half15s:2000});
});
test('multi-lane CAS reapplication cannot pass the shared total boundary', () => {
 let state=full(); state.productionBudget.generatedByTaskId['task-0'].units=1; // 3999 actual units.
 const laneA=admit(state,'half-A',{units:1}); const laneBStale=admit(state,'half-B',{units:1});
 assert.equal(stats(laneA).committedUnits,4000); assert.equal(stats(laneBStale).committedUnits,4000);
 // Only one CAS can win. The losing lane must evaluate admission again against that state.
 throws(()=>admit(laneA,'half-B',{units:1}),'EXHAUSTED'); throws(()=>admit(state,'normal',{units:2}),'EXHAUSTED');
});
test('unknown attempt retains budget indefinitely and cannot admit the same input', () => {
 const a=admit(init(),'input',{units:2}), b=settle(a,'input',{status:'unknown'});
 assert.equal(stats(b).reservedUnits,2); throws(()=>admit(b,'input',{units:2}),'INPUT_ALREADY_RESERVED');
 const c=settle(b,'input',{status:'unknown'}); assert.deepEqual(c,b);
});
test('quality-bad generated output still counts and duplicate settlements are idempotent', () => {
 const a=admit(init(),'input',{units:2});
 const b=settle(a,'input',{status:'generated',taskId:'bad-quality-video',qualityVerdict:'failed'});
 assert.equal(stats(b).generatedEquivalent,1); assert.equal(stats(b).reservedUnits,0);
 assert.deepEqual(settle(b,'input',{status:'generated',taskId:'bad-quality-video'}),b);
 throws(()=>settle(b,'input',{status:'not-generated',taskId:'bad-quality-video'}),'GENERATED_CANNOT_RELEASE');
 throws(()=>admit(b,'input',{units:2}),'INPUT_ALREADY_GENERATED');
});
test('confirmed failed-no-video and confirmed unsubmitted release only their reservation', () => {
 let s=admit(init(),'a',{units:2}); s=settle(s,'a',{status:'running',taskId:'t'});
 throws(()=>settle(s,'a',{status:'not-generated'}),'TASK_ID_REQUIRED');
 throws(()=>settle(s,'a',{status:'unsubmitted',taskId:'t'}),'SUBMITTED_CANNOT_UNSUBMIT');
 s=settle(s,'a',{status:'not-generated',taskId:'t'}); assert.equal(stats(s).committedUnits,0);
 assert.deepEqual(settle(s,'a',{status:'not-generated',taskId:'t'}),s);
 s=admit(s,'b',{units:1}); s=settle(s,'b',{status:'unknown'}); s=settle(s,'b',{status:'unsubmitted'});
 assert.equal(stats(s).committedUnits,0);
});
test('existing real task can poll when full and is conservatively charged above cap', () => {
 const a=full(), b=admit(a,'outstanding',{units:1,existingTaskId:'real-task'});
 assert.equal(stats(b).overBudgetUnits,1); assert.equal(stats(b).remainingUnits,0);
 assert.deepEqual(admit(b,'outstanding',{units:1,existingTaskId:'real-task'}),b);
 throws(()=>admit(b,'new',{units:1}),'EXHAUSTED');
 const c=settle(b,'outstanding',{status:'generated',taskId:'real-task'});
 assert.equal(stats(c).generatedUnits,4001); assert.equal(stats(c).reservedUnits,0);
 assert.deepEqual(admit(c,'outstanding',{units:1,existingTaskId:'real-task'}),c);
});
test('missing budget, invalid units, malformed maps and identity conflicts fail closed', () => {
 throws(()=>admit({},'a',{units:1}),'MISSING');
 for(const units of [0,0.5,3,NaN,'1',null]) throws(()=>admit(init(),'a',{units}),'INVALID_UNITS');
 const s=admit(init(),'a',{units:1,existingTaskId:'t'});
 throws(()=>admit(s,'a',{units:2,existingTaskId:'t'}),'IDENTITY_CONFLICT');
 throws(()=>admit(s,'b',{units:1,existingTaskId:'t'}),'IDENTITY_CONFLICT');
 throws(()=>settle(s,'a',{status:'generated',taskId:'other'}),'IDENTITY_CONFLICT');
 throws(()=>settle(s,'wrong',{status:'not-generated',taskId:'t'}),'IDENTITY_CONFLICT');
 throws(()=>settle(s,'a',{status:'generated'}),'TASK_ID_REQUIRED');
 throws(()=>admit(init(),'__proto__',{units:1}),'INVALID_ID');
 const bad=init();bad.productionBudget.reservationsByInputHash=[];throws(()=>stats(bad),'INVALID_STATE');
});
test('initialization merges evidence and cannot reset existing unknown reservations', () => {
 const a=init([{taskId:'done',inputHash:'done-hash',units:2}],[{inputHash:'unknown',units:1,status:'unknown'}]);
 const b=initialize(a,{generated:[{taskId:'done',inputHash:'done-hash',units:2}],sourceProof:'more-proof'});
 assert.equal(stats(b).committedUnits,3);assert.deepEqual(b,a);
 throws(()=>initialize(a,{generated:[{taskId:'done',inputHash:'wrong',units:2}],sourceProof:'proof'}),'IDENTITY_CONFLICT');
});
test('actual distinct historical tasks with one input are both counted; new claims are blocked', () => {
 const s=init([{taskId:'one',inputHash:'same',units:2},{taskId:'two',inputHash:'same',units:2}]);
 assert.equal(stats(s).generatedUnits,4);throws(()=>admit(s,'same',{units:2}),'INPUT_ALREADY_GENERATED');
 const withRunning=admit(s,'same',{units:2,existingTaskId:'third'});
 assert.equal(stats(withRunning).committedUnits,6);
 // A late duplicate settlement for task one must not remove task three's reservation.
 assert.deepEqual(settle(withRunning,'same',{status:'generated',taskId:'one'}),withRunning);
});
test('initial generated and outstanding evidence of the same task counts once', () => {
 const s=init([{taskId:'t',inputHash:'h',units:1}],[{taskId:'t',inputHash:'h',units:1,status:'running'}]);
 assert.equal(stats(s).generatedUnits,1);assert.equal(stats(s).reservedUnits,0);
});

test('30-second and 15-second lanes preserve the authorized production mix', () => {
 const normalFull=init(Array.from({length:1000},(_,i)=>({taskId:'n'+i,inputHash:'n'+i,units:2})));
 throws(()=>admit(normalFull,'overflow-normal',{units:2}),'DURATION_EXHAUSTED');
 const half=admit(normalFull,'next-half',{units:1});
 assert.equal(stats(half).byDuration['30'].remainingRequests,0);
 assert.equal(stats(half).byDuration['15'].remainingRequests,1999);
 const halfFull=init(Array.from({length:2000},(_,i)=>({taskId:'h'+i,inputHash:'h'+i,units:1})));
 throws(()=>admit(halfFull,'overflow-half',{units:1}),'DURATION_EXHAUSTED');
 assert.equal(stats(admit(halfFull,'next-normal',{units:2})).byDuration['30'].remainingRequests,999);
 // Paid tasks still reconcile even if their duration allocation was already full.
 assert.equal(stats(admit(normalFull,'paid-normal',{units:2,existingTaskId:'already-paid'})).reservedUnits,2);
});

test('run limits are explicit and cannot be reset by a service restart', () => {
 throws(()=>initialize({}, {sourceProof:'new-run'}),'INVALID_LIMIT');
 const state=initialize({}, {sourceProof:'new-run',limitUnits:3});
 const full=admit(admit(state,'full',{units:2}),'half',{units:1});
 assert.equal(stats(full).remainingUnits,0);
 throws(()=>initialize(full,{sourceProof:'restart',limitUnits:4}),'LIMIT_CHANGED');
 throws(()=>initialize(full,{sourceProof:'restart',plannedMix:{normal30s:2,half15s:3}}),'MIX_CHANGED');
 assert.deepEqual(initialize(full,{sourceProof:'restart',limitUnits:3}),full);
 for(const value of [0,-1,1.5,'3',NaN,Number.MAX_SAFE_INTEGER+1])throws(()=>initialize({}, {sourceProof:'new-run',limitUnits:value}),'INVALID_LIMIT');
});

test('a failed submitted task keeps its identity fence after releasing capacity',()=>{
 let state=admit(init(),'input',{units:2});
 state=settle(state,'input',{status:'running',taskId:'paid-task'});
 state=settle(state,'input',{status:'not-generated',taskId:'paid-task'});
 assert.equal(stats(state).reservedUnits,0);
 throws(()=>admit(state,'input',{units:2}),'INPUT_ALREADY_SUBMITTED');
 const recovered=admit(state,'input',{units:2,existingTaskId:'paid-task'});
 assert.equal(stats(recovered).reservedUnits,2);
 throws(()=>admit(state,'different-input',{units:2,existingTaskId:'paid-task'}),'IDENTITY_CONFLICT');
});

test('an exact settled failure permits one explicitly authorized retry and never reuses the grant',()=>{
 let state=settle(admit(init(),'input',{units:2}),'input',{status:'running',taskId:'task-1'});
 throws(()=>admit(state,'input',{units:2,authorizedRetryTaskId:'task-1',attempt:'attempt-02'}),'RETRY_NOT_SETTLED');
 state=settle(state,'input',{status:'not-generated',taskId:'task-1'});
 throws(()=>admit(state,'input',{units:2,authorizedRetryTaskId:'wrong-task',attempt:'attempt-02'}),'RETRY_NOT_SETTLED');
 const auth={units:2,authorizedRetryTaskId:'task-1',attempt:'attempt-02'};
 state=admit(state,'input',auth);assert.equal(stats(state).reservedUnits,2);
 state=settle(state,'input',{status:'unsubmitted'});
 throws(()=>admit(state,'input',{...auth,attempt:'attempt-03'}),'RETRY_ALREADY_USED');
 state=admit(state,'input',auth); // Same attempt may recover a proven pre-POST failure.
 state=settle(state,'input',{status:'running',taskId:'task-2'});
 state=settle(state,'input',{status:'not-generated',taskId:'task-2'});
 throws(()=>admit(state,'input',auth),'RETRY_ALREADY_USED');
 assert.equal(state.productionBudget.submittedByTaskId['task-1'].retryTaskId,'task-2');
 state=admit(state,'input',{units:2,existingTaskId:'task-2'});
 assert.equal(stats(state).reservedUnits,2); // Existing task recovery remains possible.
});
