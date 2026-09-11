import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {createBatchStore,kube} from '../batch/batch-store.mjs';
import {admitProductionBudget,settleProductionBudget,productionBudgetStats,initializeProductionBudget} from './seedance-production-budget.mjs';
import{writeFile,mkdir,rename,readFile}from'node:fs/promises';
// Batch clients into one Kubernetes CAS instead of one writer per clip.
export function createAdmissionBatch({store,name,maximumActive}={}){
 if(!store||typeof name!=='string'||!name||!Number.isSafeInteger(maximumActive)||maximumActive<1)throw Error('SEEDANCE_ADMISSION_CONFIG_REQUIRED');
 const pending=new Map(),departing=new Map();let running=false,lastError=null,lastSuccessAt=null,lastBudget=null;
 function enqueue(map,key,metadata){return new Promise((resolve,reject)=>{
  const previous=map.get(key);
  if(previous?.metadata?.attempt&&metadata?.attempt&&previous.metadata.attempt!==metadata.attempt){reject(Error('SEEDANCE_ADMISSION_OWNER_CONFLICT'));return;}
  if(previous?.metadata?.units!==undefined&&metadata?.units!==undefined&&previous.metadata.units!==metadata.units){reject(Error('SEEDANCE_ADMISSION_UNITS_CONFLICT'));return;}
  // A request arriving during an awaited CAS belongs to the next flush. Reusing
  // the snapshot item would acknowledge a newer settlement before storing it.
  map.set(key,{metadata,waiters:[...(previous?.waiters??[]),{resolve,reject}]});
 });}
 async function flush(){
  if(running||(!pending.size&&!departing.size))return;running=true;
  const joins=new Map(pending),leaves=new Map(departing);
  try{
   const {result}=await store.change(name,state=>{
    if(state.maximumActive!==maximumActive)throw Error('SEEDANCE_CONCURRENCY_CHANGED');
    productionBudgetStats(state);let next=structuredClone(state);next.active??={};
    const accepted=[],released=[],rejected=[];
    for(const [key,item]of leaves){
     const active=next.active[key],reservation=next.productionBudget.reservationsByInputHash[key],outcome=item.metadata??{status:'unknown'};
     // Late releases from an older attempt cannot release a newer owner's slot.
     const owner=active?.attempt??reservation?.attempt;
     if(owner&&outcome.attempt!==owner){released.push(key);continue;}
     if(!active&&!reservation&&outcome.status==='unknown'){released.push(key);continue;}
     try{
      next=settleProductionBudget(next,key,{...outcome,units:outcome.units??reservation?.units??active?.units});
      if(['generated','not-generated','unsubmitted'].includes(outcome.status))delete next.active[key];
      else if(next.productionBudget.reservationsByInputHash[key])next.productionBudget.reservationsByInputHash[key].attempt=outcome.attempt??active?.attempt;
      released.push(key);
     }catch(error){rejected.push({key,map:'leave',error:error.code??error.message});}
    }
    for(const [key,item]of joins){
     const meta=item.metadata,active=next.active[key];
     if(active&&active.attempt!==meta.attempt)continue;
     if(!active&&Object.keys(next.active).length>=next.maximumActive)continue;
     try{
      const reservation=next.productionBudget.reservationsByInputHash[key];
      const samePrepost=active&&reservation?.status==='reserved'&&!reservation.taskId&&active.attempt===meta.attempt&&meta.preparingOnly===true;
      if(!samePrepost)next=admitProductionBudget(next,key,{units:meta.units,existingTaskId:meta.existingTaskId,authorizedRetryTaskId:meta.authorizedRetryTaskId,attempt:meta.attempt});
      else if(reservation.units!==meta.units||reservation.authorizedRetryTaskId!==meta.authorizedRetryTaskId)throw Error('SEEDANCE_PRODUCTION_BUDGET_IDENTITY_CONFLICT');
      next.active[key]={...active,...meta,createdAt:active?.createdAt??new Date().toISOString(),posting:false};
      if(next.productionBudget.reservationsByInputHash[key])next.productionBudget.reservationsByInputHash[key].attempt=meta.attempt;
      accepted.push(key);
     }catch(error){rejected.push({key,map:'enter',error:error.code??error.message});}
    }
    next.peakActive=Math.max(next.peakActive??0,Object.keys(next.active).length);Object.assign(state,next);
    return{accepted,released,rejected,budget:productionBudgetStats(next)};
   });
   function finish(map,snapshot,key,error){const item=snapshot.get(key);if(!item)return;if(map.get(key)===item)map.delete(key);for(const w of item.waiters)error?w.reject(Error(error)):w.resolve();}
   for(const key of result.released)finish(departing,leaves,key);
   for(const key of result.accepted)finish(pending,joins,key);
   for(const rejection of result.rejected)finish(rejection.map==='enter'?pending:departing,rejection.map==='enter'?joins:leaves,rejection.key,rejection.error);
   lastBudget=result.budget;lastError=null;lastSuccessAt=new Date().toISOString();
  }catch(e){lastError=String(e.message).slice(0,500);}finally{running=false;}
 }
 return{enter:(key,metadata)=>enqueue(pending,key,metadata),leave:(key,outcome)=>enqueue(departing,key,outcome),flush,
  observeBudget:state=>{lastBudget=productionBudgetStats(state);},
  health:()=>({pending:pending.size,departing:departing.size,running,lastError,lastSuccessAt,maximumActive,productionBudget:lastBudget})};
}

const json=async file=>JSON.parse(await readFile(file,'utf8'));
const assert=(ok,code)=>{if(!ok)throw Error(`SEEDANCE_ADMISSION_${code}`);};
function attemptName(value){
 assert(typeof value==='string'&&/^attempt-\d{2,}$/.test(value),'ATTEMPT_REQUIRED');
 const number=Number(value.slice(8));assert(Number.isSafeInteger(number)&&number>0&&value===`attempt-${String(number).padStart(2,'0')}`,'ATTEMPT_INVALID');
 return value;
}

/** Read only explicitly registered manifests and their immutable attempt journals. */
export function createSeedanceJournalAccess({manifestPaths,verifyRequest}={}){
 assert(Array.isArray(manifestPaths)&&manifestPaths.length>0&&manifestPaths.every(file=>typeof file==='string'&&path.isAbsolute(file)),'MANIFEST_PATHS_REQUIRED');
 assert(new Set(manifestPaths.map(file=>path.resolve(file))).size===manifestPaths.length,'DUPLICATE_MANIFEST');
 assert(typeof verifyRequest==='function','PREFLIGHT_REQUIRED');
 const files=manifestPaths.map(file=>path.resolve(file));
 async function locate(inputHash,options){
  assert(/^[a-f0-9]{64}$/.test(inputHash),'INVALID_INPUT_HASH');
  const attempt=attemptName(options.attempt),matches=[];
  for(const manifestPath of files){
   const manifest=await json(manifestPath);
   assert(Array.isArray(manifest.requests),'REQUESTS_REQUIRED');
   for(const request of manifest.requests)if(request.inputHash===inputHash)matches.push({manifest,request,manifestPath});
  }
  assert(matches.length===1,matches.length?'REQUEST_OWNER_AMBIGUOUS':'REQUEST_NOT_REGISTERED');
  const found=matches[0],{request,manifest,manifestPath}=found;
  assert(manifest.authorization?.seedanceSubmission===true,'SUBMISSION_AUTHORIZATION_REQUIRED');
  assert(typeof request.id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(request.id),'REQUEST_ID_INVALID');
  assert(typeof manifest.caseId==='string'&&manifest.caseId.length>0,'CASE_ID_REQUIRED');
  const duration=request.durationSeconds??30;assert(duration===15||duration===30,'DURATION_INVALID');
  const state=await json(path.join(path.dirname(manifestPath),request.id,attempt,'seedance-state.json'));
  assert(state.inputHash===inputHash&&state.id===request.id&&state.attempt===attempt,'STATE_OWNER_MISMATCH');
  assert(state.caseId===undefined||state.caseId===manifest.caseId,'STATE_CASE_MISMATCH');
  assert(options.taskId===undefined||options.taskId===null||options.taskId===state.taskId,'TASK_ID_MISMATCH');
  assert(!state.taskId||(typeof state.taskId==='string'&&state.taskId.trim().length>0),'TASK_ID_INVALID');
  const preparingOnly=state.status==='preparing'&&!state.taskId&&!state.submissionStartedAt&&!state.submittedAt&&!state.providerSubmitted;
  return {...found,state,metadata:{inputHash,attempt,units:duration/15,caseId:manifest.caseId,requestId:request.id,preparingOnly,
   ...(state.taskId?{taskId:state.taskId,existingTaskId:state.taskId}:{})}};
 }
 async function verifyAdmission(inputHash,options={}){
  const {manifestPath,manifest,request,state,metadata}=await locate(inputHash,options);
  // Existing task IDs authorize recovery only. A changed SDK must not orphan paid work.
  if(state.taskId)return metadata;
  assert(metadata.preparingOnly,'ATTEMPT_REQUIRES_RECONCILIATION');
  const proof=await verifyRequest(manifestPath,request.id);
  assert(proof?.passed===true&&proof.inputHash===inputHash&&proof.requestId===request.id,'PREFLIGHT_FAILED');
  assert(proof.durationSeconds===metadata.units*15,'PREFLIGHT_DURATION_MISMATCH');
  if(metadata.attempt!=='attempt-01'){
   const retry=manifest.authorization.retry;
   assert(manifest.requests.length===1&&retry?.attempt===metadata.attempt&&typeof retry.priorTaskId==='string'&&retry.priorTaskId.length>0,'RETRY_AUTHORIZATION_REQUIRED');
   const priorAttempt=attemptName(retry.priorAttempt);
   assert(Number(priorAttempt.slice(8))+1===Number(metadata.attempt.slice(8)),'RETRY_ATTEMPT_INVALID');
   const prior=await json(path.join(path.dirname(manifestPath),request.id,priorAttempt,'seedance-state.json'));
   assert(prior.attempt===priorAttempt&&prior.id===request.id&&prior.inputHash===inputHash&&prior.taskId===retry.priorTaskId,'RETRY_OWNER_MISMATCH');
   assert(typeof state.payloadIdentitySha256==='string'&&/^[a-f0-9]{64}$/.test(state.payloadIdentitySha256)&&prior.payloadIdentitySha256===state.payloadIdentitySha256,'RETRY_PAYLOAD_CHANGED');
   assert(prior.status==='failed-provider'&&prior.providerStatus==='failed'&&!prior.providerGenerated&&!prior.output&&!prior.nativeOutput&&!prior.normalizedOutput&&!prior.deliveryQueueS3Uri,'RETRY_NOT_FAILED');
   assert(!/Sensitive|Safety|ContentFilter|Moderation/i.test(`${prior.providerErrorCode??''} ${JSON.stringify(prior.error??'')}`),'RETRY_NOT_PERMITTED');
   metadata.authorizedRetryTaskId=prior.taskId;
  }
  return metadata;
 }
 async function resolveSettlement(inputHash,options={}){
  let found;
  try{found=await locate(inputHash,options);}catch{return {status:'unknown',attempt:options.attempt};}
  const {state,metadata}=found,result=status=>({...metadata,status});
  // Success counts even if download, quality checks or delivery later failed.
  if(state.taskId&&(state.providerStatus==='succeeded'||state.providerGenerated===true))return result('generated');
  if(state.output||state.nativeOutput||state.normalizedOutput||state.deliveryQueueS3Uri)return result('unknown');
  if(state.status==='failed-provider'&&state.taskId&&['failed','canceled','cancelled','expired'].includes(state.providerStatus))return result('not-generated');
  if(state.status==='rejected'&&!state.taskId)return result('not-generated');
  if(['submitting','submission-unknown','unknown'].includes(state.status))return result('unknown');
  if(state.taskId)return result('running');
  if(/^(human-rejected|blocked(?:-.+)?|preflight-blocked|preparation-failed|style-rejected|style-opening-rejected|sdk-rejected|waiting-new-sdk-capture)$/.test(state.status??'')&&
   !state.submissionStartedAt&&!state.submittedAt&&!state.providerSubmitted)return result('unsubmitted');
  return result('unknown');
 }
 return{verifyAdmission,resolveSettlement};
}

function validToken(provided,expected){
 const candidate=Buffer.from(provided??''),actual=Buffer.from(`Bearer ${expected}`);
 return candidate.length===actual.length&&timingSafeEqual(candidate,actual);
}

export async function startAdmissionService({name,maximumActive,limitUnits,plannedMix,sourceProof,namespace='lwdp',port=53871,host='127.0.0.1',
 token=process.env.SEEDANCE_ADMISSION_TOKEN,verifyAdmission,resolveSettlement,snapshotPath,
 store=createBatchStore({namespace,request:(args,input)=>kube(['--request-timeout=8s',...args],input)}),flushMs=500,reconcileMs=30000}={}){
 assert(typeof token==='string'&&token.length>=16,'TOKEN_REQUIRED');
 assert(typeof verifyAdmission==='function'&&typeof resolveSettlement==='function','VERIFIERS_REQUIRED');
 assert(typeof name==='string'&&/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)&&name.length<=253,'STORE_NAME_REQUIRED');
 assert(Number.isSafeInteger(maximumActive)&&maximumActive>0,'CONCURRENCY_REQUIRED');
 assert(Number.isSafeInteger(limitUnits)&&limitUnits>0&&sourceProof!=null&&sourceProof!=='','BUDGET_CONFIG_REQUIRED');
 await store.change(name,state=>{
  assert(state.maximumActive===maximumActive,'CONCURRENCY_CHANGED');
  Object.assign(state,initializeProductionBudget(state,{limitUnits,plannedMix,sourceProof}));
 },{maximumActive,active:{}});
 const batch=createAdmissionBatch({store,name,maximumActive});batch.observeBudget(await store.state(name));
 const timer=setInterval(()=>void batch.flush(),flushMs);let reconciling=false,reconciliationError=null,lastReconciliationAt=null;
 const reconcile=async()=>{
  if(reconciling)return;reconciling=true;
  try{
   const state=await store.state(name),keys=new Set([...Object.keys(state.active??{}),...Object.keys(state.productionBudget.reservationsByInputHash)]),settlements=[];
   for(const key of keys){
    const active=state.active?.[key],reservation=state.productionBudget.reservationsByInputHash[key];
    const outcome=await resolveSettlement(key,{attempt:active?.attempt??reservation?.attempt,taskId:reservation?.taskId});
    if(!outcome.preparingOnly)settlements.push(batch.leave(key,outcome));
   }
   if(settlements.length){const settled=Promise.allSettled(settlements);await batch.flush();await settled;}
   const latest=await store.state(name);batch.observeBudget(latest);
   if(snapshotPath){
    const file=path.resolve(snapshotPath);await mkdir(path.dirname(file),{recursive:true});
    await writeFile(file+'.part',JSON.stringify({updatedAt:new Date().toISOString(),...productionBudgetStats(latest),active:latest.active??{},state:latest.productionBudget}),{mode:0o600});await rename(file+'.part',file);
   }
   reconciliationError=null;lastReconciliationAt=new Date().toISOString();
  }catch{reconciliationError='SEEDANCE_RECONCILIATION_FAILED';}finally{reconciling=false;}
 };
 const reconciliationTimer=setInterval(()=>void reconcile(),reconcileMs);
 const server=createServer(async(req,res)=>{
  const send=(status,value)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(!validToken(req.headers.authorization,token)){send(401,{error:'SEEDANCE_ADMISSION_UNAUTHORIZED'});return;}
  if(req.headers.origin){send(403,{error:'SEEDANCE_SERVICE_CLIENT_REQUIRED'});return;}
  if(req.method==='GET'&&req.url==='/health'){send(200,{...batch.health(),reconciliationError,lastReconciliationAt});return;}
  if(req.method!=='POST'||!['/enter','/leave'].includes(req.url)){send(404,{});return;}
  try{
   let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>4096)throw Error('SEEDANCE_ADMISSION_TOO_LARGE');}
   const value=JSON.parse(raw);assert(/^[a-f0-9]{64}$/.test(value.key),'INVALID_LEASE_KEY');attemptName(value.attempt);
   const options={attempt:value.attempt,taskId:value.taskId??undefined};
   if(req.url==='/enter'){
    const proof=await verifyAdmission(value.key,options);assert(proof.attempt===value.attempt,'ATTEMPT_MISMATCH');
    await batch.enter(value.key,{pipeline:'seedance',inputHash:value.key,owner:'three-episode',units:proof.units,attempt:proof.attempt,preparingOnly:proof.preparingOnly===true,
     ...(proof.existingTaskId?{existingTaskId:proof.existingTaskId}:{}),...(proof.authorizedRetryTaskId?{authorizedRetryTaskId:proof.authorizedRetryTaskId}:{})});
    try{await verifyAdmission(value.key,options);}catch(error){await batch.leave(value.key,await resolveSettlement(value.key,options));throw error;}
   }else await batch.leave(value.key,await resolveSettlement(value.key,options));
   send(200,{ok:true});
  }catch(error){send(400,{error:/^SEEDANCE_[A-Z_]+$/.test(error.message)?error.message:'SEEDANCE_ADMISSION_FAILED'});}
 });
 server.requestTimeout=0;server.timeout=0;
 const cleanup=()=>{clearInterval(timer);clearInterval(reconciliationTimer);};server.once('close',cleanup);
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});}catch(error){cleanup();throw error;}
 void reconcile();return{server,batch,reconcile};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 assert(process.argv.length===4&&process.argv[2]==='--config','CONFIG_REQUIRED');
 const config=await json(path.resolve(process.argv[3]));
 assert(!('token'in config),'TOKEN_MUST_USE_ENV');
 const {verifySeedanceRequest}=await import('./seedance-preflight.mjs');
 const access=createSeedanceJournalAccess({manifestPaths:config.manifestPaths,verifyRequest:verifySeedanceRequest});
 const {server}=await startAdmissionService({...config,...access});
 console.log(JSON.stringify({pid:process.pid,address:server.address()}));
}
