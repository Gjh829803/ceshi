import test from 'node:test';
import assert from 'node:assert/strict';
import {createBatchStore,cohortName,GLOBAL_QUEUE} from './batch-store.mjs';
import {createBatchQueue,claimBatch,reconcileBatches} from './batch-controller.mjs';
import {runBatchWorker} from './batch-worker.mjs';
import {captureBatchJob} from './batch-jobs.mjs';
import {selectBatch} from './batch-state.mjs';
const image=`registry/image@sha256:${'a'.repeat(64)}`;
export function memoryStore(){
 const maps=new Map(),jobs=new Map();let version=0,creates=0;
 const request=async(args,input)=>{
  if(args[0]==='get'&&args[1]==='configmaps')return {items:[...maps.values()].map(v=>structuredClone(v))};
  if(args[0]==='get'&&args[1]==='configmap')return structuredClone(maps.get(args[2])??null);
  if(args[0]==='get'&&args[1]==='pods')return {items:[]};
  if(args[0]==='get'&&args[1]==='job')return structuredClone(jobs.get(args[2])??null);
  if(args[0]==='delete'&&args[1]==='job'){const job=jobs.get(args[2]);jobs.delete(args[2]);return job;}
  if(['create','replace'].includes(args[0])){
   if(input.kind==='Job'){creates++;if(jobs.has(input.metadata.name))throw Object.assign(Error('exists'),{code:'CONFLICT'});const j={...structuredClone(input),metadata:{...input.metadata,uid:`job-${version++}`}};jobs.set(input.metadata.name,j);return structuredClone(j);}
   const old=maps.get(input.metadata.name);
   if(args[0]==='create'?!!old:old?.metadata.resourceVersion!==input.metadata.resourceVersion)throw Object.assign(Error('conflict'),{code:'CONFLICT'});
   const next=structuredClone(input);next.metadata.resourceVersion=String(++version);maps.set(next.metadata.name,next);return structuredClone(next);
  }
  throw Error(`unexpected ${args}`);
 };
 const store=createBatchStore({request});return {store,maps,jobs,get creates(){return creates;}};
}
function input(n){return {id:`capture-${n}`,caseId:`case-${n}`,recipeHash:n.toString(16).padEnd(64,'0'),workerImage:image,sourceArchiveS3Uri:'s3://bucket/source.tar.gz',sourceArchiveSha256:'e'.repeat(64),planS3Uri:'s3://bucket/plan.json',planHash:'d'.repeat(64),inputS3Uri:'s3://bucket/input.json',inputHash:'b'.repeat(64),outputS3Prefix:`s3://bucket/out/${n}`,worldBuildHash:'c'.repeat(64),sourceManifestRelativePath:'inputs/source/source.json',createdAt:'2026-09-06T00:00:00Z'};}
async function seed(n,total=n){const fixture=memoryStore(),q=createBatchQueue({store:fixture.store});await q.register('cohort-one',Array.from({length:total},(_,i)=>`case-${i}`));for(let i=0;i<n;i++)await q.enqueue('cohort-one',input(i));return {...fixture,fixture,q};}
test('competing dispatcher CAS admits only one global owner',async()=>{const {store}=await seed(100,101);const results=await Promise.all([claimBatch(store),claimBatch(store)]);assert.equal(results.filter(Boolean).length,1);assert.equal((await store.state(GLOBAL_QUEUE)).active.batch.taskCount,100);});
test('producer registration is immutable and unknown cases cannot enter queue',async()=>{const {q}=await seed(1);await assert.rejects(q.register('cohort-one',['other-case']),/CONFLICT/);await assert.rejects(q.enqueue('cohort-one',input(99)),/NOT_REGISTERED/);});
test('one worker runs an admitted tail sequentially and writes every receipt',async()=>{const {store,q}=await seed(3);const a=await claimBatch(store);const order=[];let concurrent=0;
 await runBatchWorker({store,batchId:a.batch.batchId,verifyPlacement:false,runCapture:async t=>{assert.equal(++concurrent,1);order.push(t.caseId);concurrent--;}});
 assert.deepEqual(order,['case-0','case-1','case-2']);for(let i=0;i<3;i++)assert.equal((await q.task('cohort-one',`capture-${i}`)).receipt.status,'capture-succeeded');
});
test('failed case does not re-record earlier cases or stop the batch',async()=>{const {store,q}=await seed(3);const a=await claimBatch(store);let count=0;await runBatchWorker({store,batchId:a.batch.batchId,verifyPlacement:false,runCapture:async t=>{count++;if(t.caseId==='case-1')throw Error('bad case');}});assert.equal(count,3);assert.equal((await q.task('cohort-one','capture-1')).receipt.status,'capture-failed');assert.equal((await q.task('cohort-one','capture-2')).receipt.status,'capture-succeeded');});
test('cancelled cohort cannot be run by a stale worker',async()=>{const {store,q}=await seed(2);const a=await claimBatch(store);await q.cancel('cohort-one');let invoked=false;await assert.rejects(runBatchWorker({store,batchId:a.batch.batchId,verifyPlacement:false,runCapture:async()=>{invoked=true;}}),/CANCELLED/);assert.equal(invoked,false);});
test('render profile pins one L4 and exposes no model credentials',async()=>{const {store}=await seed(1);const a=await claimBatch(store);const j=captureBatchJob({...a});assert.equal(j.spec.parallelism,1);assert.equal(j.spec.completions,1);assert.equal(j.spec.template.spec.containers[0].resources.requests['nvidia.com/gpu'],1);assert.equal(j.spec.template.spec.nodeSelector['karpenter.sh/nodepool'],'worldkit-episode-graphics');assert(!JSON.stringify(j).includes('lwdp-generation-token'));});
test('reconcile restarts with the same persisted Job, never a duplicate',async()=>{const {store,fixture}=await seed(1);await reconcileBatches(store);await reconcileBatches(store);assert.equal(fixture.creates,1);});
test('unready queue creates no Job',async()=>{const {store,fixture}=await seed(99,100);await reconcileBatches(store);assert.equal(fixture.creates,0);});
test('receipt-before-ACK survives worker restart without recapture',async()=>{const {store}=await seed(2);const a=await claimBatch(store);await store.change(cohortName('cohort-one'),s=>{s.tasks['capture-0'].receipt={executionId:'capture-0',status:'capture-succeeded'};s.tasks['capture-0'].status='completed';});const calls=[];await runBatchWorker({store,batchId:a.batch.batchId,verifyPlacement:false,runCapture:async t=>calls.push(t.id)});assert.deepEqual(calls,['capture-1']);});
test('a known failed Pod retries only twice and never holds an unbounded recovery loop',async()=>{
 const {store,fixture,q}=await seed(1);
 await reconcileBatches(store);
 let active=(await store.state(GLOBAL_QUEUE)).active;
 fixture.jobs.get(active.jobName).status={conditions:[{type:'Failed',status:'True'}]};
 await reconcileBatches(store);
 active=(await store.state(GLOBAL_QUEUE)).active;
 assert.equal(fixture.creates,2);assert.equal((await q.task('cohort-one','capture-0')).attempts,2);
 fixture.jobs.get(active.jobName).status={conditions:[{type:'Failed',status:'True'}]};
 await reconcileBatches(store);
 assert.equal((await store.state(GLOBAL_QUEUE)).active,null);assert.equal(fixture.creates,2);assert.equal((await q.task('cohort-one','capture-0')).receipt.status,'capture-failed');
});
test('stale worker cannot commit or continue after ownership changes to a new physical Job',async()=>{
 const {store}=await seed(1);const a=await claimBatch(store);
 let called=false;
 await assert.rejects(runBatchWorker({store,batchId:a.batch.batchId,verifyPlacement:false,runCapture:async()=>{called=true;await store.change(GLOBAL_QUEUE,s=>{s.active.jobName='replacement-job';});}}),/CANCELLED/);
 assert(called);assert.equal((await store.state(cohortName('cohort-one'))).tasks['capture-0'].receipt,undefined);
});

test('whole-task watchdog also bounds a stalled download before frame recording',async()=>{
 const {store,fixture}=await seed(1);await reconcileBatches(store);
 const active=(await store.state(GLOBAL_QUEUE)).active;
 await store.change(GLOBAL_QUEUE,s=>{s.active.task={id:'capture-0',startedAt:'2000-01-01T00:00:00Z'};});
 assert.equal((await reconcileBatches(store)).status,'cancelling');assert(!fixture.jobs.has(active.jobName));
});
test('CPU postprocessing has a separate two-slot cap and does not retain a GPU slot',async()=>{
 const {reconcileContinuations}=await import('./batch-controller.mjs');
 const {store,q,fixture}=await seed(4);
 await store.change(cohortName('cohort-one'),s=>{for(const t of Object.values(s.tasks)){t.status='completed';t.receipt={status:'capture-succeeded'};}});
 for(let i=0;i<4;i++)await q.checkpointReady('cohort-one',`capture-${i}`,{stopBeforeSeedance:true,outputRoot:'output/episode',checkpointS3Uri:`s3://bucket/checkpoint/${i}`,publishS3Uri:`s3://bucket/output/${i}`});
 assert.equal((await reconcileContinuations(store)).length,2);
 assert.equal((await reconcileContinuations(store)).length,0);
 assert.equal((await store.state(GLOBAL_QUEUE)).active,null);
 const [first]=fixture.jobs.values();first.status={conditions:[{type:'Complete',status:'True'}]};
 assert.equal((await reconcileContinuations(store)).length,1);
 for(const job of fixture.jobs.values()){assert.equal(job.spec.template.spec.containers[0].resources.requests['nvidia.com/gpu'],undefined);assert(job.spec.template.spec.containers[0].args.includes('--stop-before-seedance'));}
});
test('completed CPU Jobs removed by TTL release slots using their durable receipt',async()=>{
 const {reconcileContinuations}=await import('./batch-controller.mjs');const {store,q,fixture}=await seed(3);
 await store.change(cohortName('cohort-one'),s=>{for(const t of Object.values(s.tasks)){t.status='completed';t.receipt={status:'capture-succeeded'};}});
 for(let i=0;i<3;i++)await q.checkpointReady('cohort-one',`capture-${i}`,{stopBeforeSeedance:true,outputRoot:'output/episode',checkpointS3Uri:`s3://bucket/checkpoint/${i}`,publishS3Uri:`s3://bucket/output/${i}`});
 await reconcileContinuations(store);
 await store.change(cohortName('cohort-one'),s=>{for(let i=0;i<2;i++){const t=s.tasks[`capture-${i}`];t.cpuReceipt={jobName:t.continuationJob,status:'succeeded',checkpointS3Uri:t.continuation.publishS3Uri};}});
 fixture.jobs.clear();assert.equal((await reconcileContinuations(store)).length,1);
});
test('failed CPU stage retries from the latest durable checkpoint, with a new bounded attempt',async()=>{
 const {reconcileContinuations}=await import('./batch-controller.mjs');const {store,q,fixture}=await seed(1);
 await store.change(cohortName('cohort-one'),s=>{s.tasks['capture-0'].receipt={status:'capture-succeeded'};});
 await q.checkpointReady('cohort-one','capture-0',{stopBeforeSeedance:true,outputRoot:'output/episode',checkpointS3Uri:'s3://bucket/before',publishS3Uri:'s3://bucket/latest'});
 await reconcileContinuations(store);const first=[...fixture.jobs.values()][0];first.status={conditions:[{type:'Failed',status:'True'}]};
 await store.change(cohortName('cohort-one'),s=>{s.tasks['capture-0'].cpuReceipt={jobName:first.metadata.name,status:'failed',retryable:true,checkpointS3Uri:'s3://bucket/latest'};});
 const next=await reconcileContinuations(store);assert.equal(next.length,1);assert.notEqual(next[0],first.metadata.name);
 assert(fixture.jobs.get(next[0]).spec.template.spec.containers[0].args.includes('s3://bucket/latest'));
});
test('stale ready snapshot is rejected before any GPU Job can be created',async()=>{
 const {store}=await seed(1);const change=store.change;let injected=false;
 store.change=async(name,f,initial)=>{if(name===GLOBAL_QUEUE&&!injected){injected=true;await change(cohortName('cohort-one'),s=>{s.tasks['capture-0'].receipt={status:'capture-succeeded'};s.tasks['capture-0'].status='completed';});}return change(name,f,initial);};
 assert.equal(await claimBatch(store),null);
});
test('missing acknowledged CPU Job releases capacity but never invents success or unsafe retry',async()=>{
 const {reconcileContinuations}=await import('./batch-controller.mjs');const {store,q,fixture}=await seed(3);
 await store.change(cohortName('cohort-one'),s=>{for(const t of Object.values(s.tasks))t.receipt={status:'capture-succeeded'};});
 for(let i=0;i<3;i++)await q.checkpointReady('cohort-one',`capture-${i}`,{stopBeforeSeedance:true,outputRoot:'output/episode',checkpointS3Uri:'s3://bucket/checkpoint',publishS3Uri:'s3://bucket/output'});
 await reconcileContinuations(store);fixture.jobs.clear();assert.equal((await reconcileContinuations(store)).length,1);
 const first=await q.task('cohort-one','capture-0');assert.equal(first.cpuReceipt.status,'unknown');assert.equal(first.cpuReceipt.retryable,false);assert(first.cpuReceipt.attentionRequired);
});

async function cpuFixture(){
 const f=await seed(1);
 await f.store.change(cohortName('cohort-one'),s=>{s.tasks['capture-0'].receipt={status:'capture-succeeded'};});
 await f.q.checkpointReady('cohort-one','capture-0',{stopBeforeSeedance:true,outputRoot:'output/episode',checkpointS3Uri:'s3://bucket/before',publishS3Uri:'s3://bucket/latest'});
 return f;
}
test('cancel stops active CPU even while dispatch is paused and keeps slot until Pods end',async()=>{
 const {reconcileContinuations}=await import('./batch-controller.mjs');const f=await cpuFixture();
 const [name]=await reconcileContinuations(f.store);await f.q.cancel('cohort-one');
 await f.store.change(GLOBAL_QUEUE,s=>{s.paused=true;});
 const request=f.store.request;let live=true;
 f.store.request=(args,input)=>args[1]==='pods'?Promise.resolve({items:live?[{status:{phase:'Running'}}]:[]}):request(args,input);
 await reconcileContinuations(f.store);assert(!f.fixture.jobs.has(name));assert((await f.store.state(GLOBAL_QUEUE)).cpuSlots.includes(name));
 live=false;await reconcileContinuations(f.store);
 assert.deepEqual((await f.store.state(GLOBAL_QUEUE)).cpuSlots,[]);
 assert.equal((await f.q.task('cohort-one','capture-0')).cpuReceipt.status,'cancelled');
});
test('success written against pending create survives missing ACK and Job TTL',async()=>{
 const {reconcileContinuations,recordCpuReceipt}=await import('./batch-controller.mjs');const f=await cpuFixture();
 const [name]=await reconcileContinuations(f.store);
 await f.store.change(cohortName('cohort-one'),s=>{const t=s.tasks['capture-0'];t.cpuPending={jobName:name,attempt:1,checkpoint:'s3://bucket/before'};delete t.continuationJob;delete t.cpuAttempt;});
 await recordCpuReceipt(f.store,'cohort-one','capture-0',{jobName:name,status:'succeeded',retryable:false,checkpointS3Uri:'s3://bucket/latest'});
 f.fixture.jobs.clear();const before=f.fixture.creates;
 assert.deepEqual(await reconcileContinuations(f.store),[]);assert.equal(f.fixture.creates,before);
 assert.deepEqual((await f.store.state(GLOBAL_QUEUE)).cpuSlots,[]);
});
test('remote cancellation retries exact owned identities while paused',async()=>{
 const {reconcileContinuations}=await import('./batch-controller.mjs');const f=await cpuFixture();
 await f.q.trackRemote('cohort-one','case-0',{pipeline:'t2i',requestId:'owned-request',status:'submitting'});
 await f.q.cancel('cohort-one');await f.store.change(GLOBAL_QUEUE,s=>{s.paused=true;},{active:null,cpuSlots:[]});
 await assert.rejects(f.q.trackRemote('cohort-one','case-0',{pipeline:'t2i',requestId:'new-request'}),/CANCELLED/);
 const seen=[];let fail=true;const cloud={cancelTrackedJob:async r=>{seen.push(r.requestId);if(fail)throw Error('transport');return {jobId:'owned-job',status:'cancelled',isTerminal:true};}};
 await reconcileContinuations(f.store,{cloud});fail=false;await reconcileContinuations(f.store,{cloud});await reconcileContinuations(f.store,{cloud});
 assert.deepEqual(seen,['owned-request','owned-request']);assert.equal(f.fixture.creates,0);
});
test('cancel racing with Job creation deletes the late Job and never dispatches another',async()=>{
 const {reconcileContinuations}=await import('./batch-controller.mjs');const f=await cpuFixture(),request=f.store.request;
 f.store.request=async(args,input)=>{const result=await request(args,input);if(args[0]==='create'&&input.kind==='Job')await f.q.cancel('cohort-one');return result;};
 assert.deepEqual(await reconcileContinuations(f.store),[]);assert.equal(f.fixture.jobs.size,0);
 await reconcileContinuations(f.store);assert.equal(f.fixture.creates,1);
});
test('failed pending attempt retries from its latest receipt and rejects late previous receipt',async()=>{
 const {reconcileContinuations,recordCpuReceipt}=await import('./batch-controller.mjs');const f=await cpuFixture();
 const [name]=await reconcileContinuations(f.store);
 await f.store.change(cohortName('cohort-one'),s=>{const t=s.tasks['capture-0'];t.cpuPending={jobName:name,attempt:1,checkpoint:'s3://bucket/before'};delete t.continuationJob;});
 await recordCpuReceipt(f.store,'cohort-one','capture-0',{jobName:name,status:'failed',retryable:true,checkpointS3Uri:'s3://bucket/latest'});f.fixture.jobs.clear();
 const [retry]=await reconcileContinuations(f.store);assert(retry.endsWith('-2'));assert(f.fixture.jobs.get(retry).spec.template.spec.containers[0].args.includes('s3://bucket/latest'));
 await assert.rejects(recordCpuReceipt(f.store,'cohort-one','capture-0',{jobName:name,status:'succeeded'}),/STALE/);
});
test('cancel between slot reservation and intent does not leak a CPU slot',async()=>{
 const {reconcileContinuations}=await import('./batch-controller.mjs');const f=await cpuFixture(),change=f.store.change;let cancelled=false;
 f.store.change=async(name,fn,initial)=>{const result=await change(name,fn,initial);if(name===GLOBAL_QUEUE&&result.state.cpuSlots?.length&&!cancelled){cancelled=true;await f.q.cancel('cohort-one');}return result;};
 assert.deepEqual(await reconcileContinuations(f.store),[]);assert.deepEqual((await f.store.state(GLOBAL_QUEUE)).cpuSlots,[]);assert.equal(f.fixture.creates,0);
});
test('receipt arriving during Job lookup fences a stale create decision',async()=>{
 const {reconcileContinuations,recordCpuReceipt}=await import('./batch-controller.mjs');const f=await cpuFixture(),request=f.store.request;let wrote=false;
 f.store.request=async(args,input)=>{const result=await request(args,input);if(args[0]==='get'&&args[1]==='job'&&args[2].startsWith('three-post-')&&!wrote){wrote=true;await recordCpuReceipt(f.store,'cohort-one','capture-0',{jobName:args[2],status:'succeeded',retryable:false});}return result;};
 assert.deepEqual(await reconcileContinuations(f.store),[]);assert.equal(f.fixture.creates,0);
 await reconcileContinuations(f.store);assert.deepEqual((await f.store.state(GLOBAL_QUEUE)).cpuSlots,[]);
});
test('completed remote history does not grow the cohort ConfigMap',async()=>{
 const f=await cpuFixture();
 for(let i=0;i<150;i++){
  await f.q.trackRemote('cohort-one','case-0',{pipeline:'t2i',requestId:`request-${i}`,status:'submitting'});
  await f.q.trackRemote('cohort-one','case-0',{pipeline:'t2i',requestId:`request-${i}`,jobId:`job-${i}`,status:'succeeded',isTerminal:true});
 }
 assert.deepEqual((await f.store.state(cohortName('cohort-one'))).cases['case-0'].remoteJobs,{});
});

test('CPU pause blocks postprocessing without pausing GPU admission',async()=>{const {reconcileContinuations}=await import('./batch-controller.mjs');const f=await cpuFixture();await f.store.change(GLOBAL_QUEUE,s=>{s.cpuPaused=true;},{active:null,paused:false,cpuSlots:[]});assert.deepEqual(await reconcileContinuations(f.store),[]);assert.equal(f.fixture.creates,0);assert.equal((await f.store.state(GLOBAL_QUEUE)).paused,false);});
test('explicit CPU capacity admits nine cases and refuses a tenth',async()=>{
 const {reconcileContinuations}=await import('./batch-controller.mjs');const {store,q,jobs}=await seed(10);
 await store.change(cohortName('cohort-one'),s=>{for(const t of Object.values(s.tasks))t.receipt={status:'capture-succeeded'};});
 for(let i=0;i<10;i++)await q.checkpointReady('cohort-one',`capture-${i}`,{stopBeforeSeedance:true,outputRoot:'output/episode',checkpointS3Uri:'s3://bucket/checkpoint',publishS3Uri:'s3://bucket/output'});
 await store.change(GLOBAL_QUEUE,s=>{s.maximumCpuSlots=9;},{active:null,paused:false,cpuSlots:[]});assert.equal((await reconcileContinuations(store)).length,9);assert.equal((await reconcileContinuations(store)).length,0);
 for(const job of jobs.values()){assert.equal(job.spec.template.spec.containers[0].resources.requests.cpu,'500m');assert.equal(job.spec.template.spec.containers[0].resources.requests['nvidia.com/gpu'],undefined);}
 await store.change(GLOBAL_QUEUE,s=>{s.maximumCpuSlots=10;});await assert.rejects(reconcileContinuations(store),/EPISODE_CPU_SLOT_LIMIT_INVALID/);
});
test('explicit operator recovery permits one third attempt but no unbounded retries',async()=>{
 const {reconcileContinuations,recordCpuReceipt}=await import('./batch-controller.mjs');const f=await cpuFixture();const [first]=await reconcileContinuations(f.store);
 await f.store.change(cohortName('cohort-one'),s=>{const t=s.tasks['capture-0'];t.cpuAttempt=2;t.operatorMaximumCpuAttempts=3;});f.fixture.jobs.clear();await recordCpuReceipt(f.store,'cohort-one','capture-0',{jobName:first,status:'failed',retryable:true,checkpointS3Uri:'s3://bucket/latest'});
 const [third]=await reconcileContinuations(f.store);assert(third.endsWith('-3'));f.fixture.jobs.clear();await recordCpuReceipt(f.store,'cohort-one','capture-0',{jobName:third,status:'failed',retryable:true,checkpointS3Uri:'s3://bucket/latest'});assert.deepEqual(await reconcileContinuations(f.store),[]);
});
