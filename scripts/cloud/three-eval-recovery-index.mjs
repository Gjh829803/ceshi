#!/usr/bin/env node
// Host-only discovery shared by progress, live observation and site publication.
import {constants} from 'node:fs';
import {open,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const slug=/^[a-z0-9][a-z0-9-]{1,159}$/,hash=/^[a-f0-9]{64}$/,job=/^gen_[a-f0-9]{8,64}$/,request=/^[a-z0-9][a-z0-9-]{2,239}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=code=>{throw Error(`THREE_RECOVERY_INDEX_${code}`);};
const matches=(pattern,value)=>typeof value==='string'&&pattern.test(value);
const MAX_RUNS=16,MAX_DEPTH=4,MAX_BYTES=8*1024*1024;
async function rootPath(value){const root=path.resolve(value);if(await realpath(root)!==root)fail('PATH_INVALID');return root;}
async function read(file,optional=false){
 try{
  if(await realpath(file)!==file)fail('PATH_INVALID');
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const info=await handle.stat();if(!info.isFile()||info.nlink!==1||info.size>MAX_BYTES)fail('FILE_INVALID');const bytes=await handle.readFile();if(bytes.length>MAX_BYTES)fail('FILE_INVALID');try{return JSON.parse(bytes);}catch{fail('JSON_INVALID');}}
  finally{await handle.close();}
 }catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
}
function planTasks(plan){
 if(!object(plan)||plan.schemaVersion!==1||!['three-creator-sdk-plan','three-creator-paired-plan'].includes(plan.kind)||!matches(slug,plan.runId)||!matches(hash,plan.runtimeHash)||!Array.isArray(plan.cases)||plan.cases.length>10||!Array.isArray(plan.selectedTaskIds)||!plan.selectedTaskIds.length||plan.selectedTaskIds.length>10||new Set(plan.selectedTaskIds).size!==plan.selectedTaskIds.length)fail('PLAN_INVALID');
 const tasks=new Map();
 for(const row of plan.cases){if(!object(row)||!matches(slug,row.caseId)||!['three-sdk','three-raw'].includes(row.profile)||row.taskId!==`${row.caseId}--${row.profile}`||!matches(slug,row.taskId)||!matches(hash,row.caseHash)||tasks.has(row.taskId))fail('PLAN_INVALID');tasks.set(row.taskId,row);}
 if(plan.selectedTaskIds.some(id=>!tasks.has(id)))fail('PLAN_INVALID');return tasks;
}
export function publicThreeContinuation(value){
 if(!object(value)||value.kind!=='artifact-continuation'||!matches(slug,value.parentRunId)||!matches(job,value.parentJobId)||!matches(request,value.parentRequestId)||!Number.isSafeInteger(value.attemptNumber)||value.attemptNumber<2||!Number.isSafeInteger(value.maximumModelAttempts)||value.maximumModelAttempts<value.attemptNumber||value.maximumModelAttempts>MAX_RUNS||!['progress','checkpoint'].includes(value.sourceKind)||!matches(hash,value.sourceHash)||(value.fallbackSourceHash!==undefined&&!matches(hash,value.fallbackSourceHash)))fail('CONTINUATION_INVALID');
 return Object.fromEntries(['kind','parentRunId','parentJobId','parentRequestId','attemptNumber','maximumModelAttempts','sourceKind','sourceHash','fallbackSourceHash'].filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
}
async function validateLink(child,parent){
 if(child.plan.runtimeHash!==parent.plan.runtimeHash)fail('IDENTITY_MISMATCH');
 for(const id of child.plan.selectedTaskIds){
  const task=child.tasks.get(id),previous=parent.tasks.get(id);
  if(!parent.plan.selectedTaskIds.includes(id)||!previous||['caseId','profile','caseHash'].some(key=>task[key]!==previous[key])||!matches(request,task.requestId)||task.requestId===previous.requestId)fail('IDENTITY_MISMATCH');
  const [state,prior]=await Promise.all([read(path.join(child.root,id,'state.json')),read(path.join(parent.root,id,'state.json'))]);
  const continuation=publicThreeContinuation(state?.continuation);
  for(const [value,planned,run] of [[state,task,child],[prior,previous,parent]])if(!object(value)||['taskId','caseId','profile','caseHash','requestId'].some(key=>value[key]!==planned[key])||value.runtimeHash!==run.plan.runtimeHash)fail('IDENTITY_MISMATCH');
  if(prior.phase!=='failed'||continuation.parentRunId!==parent.plan.runId||continuation.parentJobId!==prior.jobId||continuation.parentRequestId!==prior.requestId||continuation.attemptNumber!==(prior.continuation?.attemptNumber??1)+1||(prior.continuation&&continuation.maximumModelAttempts!==publicThreeContinuation(prior.continuation).maximumModelAttempts))fail('PARENT_MISMATCH');
 }
}

/** Results are parent-before-child; explicit historical retry roots stay supported. */
export async function discoverThreeAttemptRuns({runRoot,attemptRunRoots=[]}){
 if(!Array.isArray(attemptRunRoots)||attemptRunRoots.length>=MAX_RUNS)fail('LIMIT_EXCEEDED');
 const initial=await Promise.all([runRoot,...attemptRunRoots].map(rootPath));
 if(new Set(initial).size!==initial.length)fail('DUPLICATE_RUN');
 const found=[],byRoot=new Map(),byId=new Map();
 async function visit(root,parent=null,depth=0,expectedRunId=null){
  if(depth>MAX_DEPTH)fail('LIMIT_EXCEEDED');
  if(byRoot.has(root)){const known=byRoot.get(root);if(parent&&known.parentRoot!==parent.root)fail('PARENT_MISMATCH');return;}
  if(found.length>=MAX_RUNS)fail('LIMIT_EXCEEDED');
  const plan=await read(path.join(root,'evaluation-plan.json')),tasks=planTasks(plan);
  if(expectedRunId&&plan.runId!==expectedRunId||byId.has(plan.runId))fail('IDENTITY_MISMATCH');
  const run={root,plan,tasks,parentRoot:parent?.root??null};
  if(parent)await validateLink(run,parent);
  found.push(run);byRoot.set(root,run);byId.set(plan.runId,run);
  const index=await read(path.join(root,'recovery-runs.json'),true);if(index===null)return;
  if(!object(index)||Object.keys(index).some(key=>!['kind','schemaVersion','runs'].includes(key))||index.kind!=='three-creator-recovery-runs'||index.schemaVersion!==1||!Array.isArray(index.runs)||index.runs.length>=MAX_RUNS)fail('INDEX_INVALID');
  const seen=new Set(),continuedTasks=new Set();
  for(const item of index.runs){
   if(!object(item)||Object.keys(item).some(key=>!['runId','relativeDirectory'].includes(key))||!matches(slug,item.runId)||typeof item.relativeDirectory!=='string'||item.relativeDirectory.length>400||!/^continuations\/[a-z0-9][a-z0-9-]{1,159}$/.test(item.relativeDirectory)||seen.has(item.runId))fail('PATH_INVALID');
   seen.add(item.runId);const childRoot=await rootPath(path.join(root,item.relativeDirectory));await visit(childRoot,run,depth+1,item.runId);
   for(const id of byRoot.get(childRoot).plan.selectedTaskIds){if(continuedTasks.has(id))fail('PARENT_MISMATCH');continuedTasks.add(id);}
  }
 }
 for(const root of initial)await visit(root);
 const primary=found[0];
 for(const run of found.slice(1)){
  if(run.plan.runtimeHash!==primary.plan.runtimeHash)fail('RETRY_IDENTITY_MISMATCH');
  for(const id of run.plan.selectedTaskIds){const base=primary.tasks.get(id),task=run.tasks.get(id);if(!primary.plan.selectedTaskIds.includes(id)||!base||['caseId','caseHash','profile'].some(key=>task[key]!==base[key]))fail('RETRY_IDENTITY_MISMATCH');}
 }
 return found;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={attemptRunRoots:[]};
 for(let i=0;i<args.length;i+=2){if(!args[i+1])fail('ARGUMENT_INVALID');if(args[i]==='--run-root'&&!options.runRoot)options.runRoot=args[i+1];else if(args[i]==='--attempt-run-root')options.attemptRunRoots.push(args[i+1]);else fail('ARGUMENT_INVALID');}
 if(!options.runRoot)fail('ARGUMENT_INVALID');
 discoverThreeAttemptRuns(options).then(runs=>process.stdout.write(JSON.stringify(runs.map(({root,plan,parentRoot})=>({root,plan,parentRoot})))+'\n')).catch(error=>{process.stderr.write((/^THREE_RECOVERY_INDEX_[A-Z_]+$/.test(error.message)?error.message:'THREE_RECOVERY_INDEX_FAILED')+'\n');process.exitCode=1;});
}
