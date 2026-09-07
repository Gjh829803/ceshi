import path from 'node:path';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createCloudClient} from './cloud.mjs';
import {runEpisodeWorkflow} from './workflow.ts';
import {loadLwdpGenerationConfig,lwdpRequest} from '../lib/lwdp-generation-client.mjs';
const args=process.argv.slice(2),allowed=new Set(['--source-manifest','--output-root','--episode-id','--checkpoint-s3','--publish-s3','--cohort']);
for(let i=0;i<args.length;i++){if(args[i]==='--stop-before-seedance'||args[i]==='--user-resume')continue;if(!allowed.has(args[i])||!args[++i])throw Error('EPISODE_RESUME_ARGUMENT_INVALID');}
if([...allowed].some(flag=>!args.includes(flag)))throw Error('EPISODE_RESUME_REQUIRED_ARGUMENT_MISSING');
if(!args.includes('--stop-before-seedance')||!args.includes('--user-resume'))throw Error('EPISODE_USER_RESUME_REQUIRED');
const value=f=>args[args.indexOf(f)+1],repo=process.cwd(),outputRoot=path.resolve(value('--output-root'));
if(!outputRoot.startsWith(repo+'/output/'))throw Error('EPISODE_RESUME_OUTPUT_INVALID');
const sourceManifestPath=path.resolve(value('--source-manifest')),episodeId=value('--episode-id'),cohort=value('--cohort');
await createCloudClient().hydrateDirectory(value('--checkpoint-s3'),outputRoot);
const runtimeFile=path.join(repo,'.codex-tmp/three-episode-runtime.json'),runtime=JSON.parse(await readFile(runtimeFile,'utf8'));runtime.captureCohortId=cohort;
const visualConfigFile=path.join(repo,'config/episode-style-variants.json');
const visualConfig=JSON.parse(await readFile(visualConfigFile,'utf8'));Object.assign(visualConfig,{visualConcurrency:2,reviewConcurrency:2,geminiConcurrency:1});await writeFile(visualConfigFile,JSON.stringify(visualConfig));
const apiConfig=await loadLwdpGenerationConfig();const terminal=new Set(['succeeded','completed','failed','submit_failed','cancelled','stopped']);
const records=[],tasksRoot=path.join(outputRoot,'visuals/tasks');
for(const dir of await readdir(tasksRoot,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return[];throw e;})){
 if(!dir.isDirectory())continue;const stageRoot=path.join(tasksRoot,dir.name),cloudRoot=path.join(stageRoot,'.cloud');
 let stage;try{stage=JSON.parse(await readFile(path.join(stageRoot,'stage.json'),'utf8'));}catch{continue;}
 if(stage.status==='completed')continue;
 const entries=[];
 for(const name of await readdir(cloudRoot).catch(()=>[])){
  const file=path.join(cloudRoot,name,'state.json');let s;try{s=JSON.parse(await readFile(file,'utf8'));}catch{continue;}
  if(!['codex','t2i'].includes(s.pipeline))continue;entries.push({file,name,state:s});
 }
 if(entries.length)records.push({logicalTaskId:'three-episode-'+dir.name,entries});
}
const pending=records.flatMap(r=>r.entries).filter(e=>e.state.jobId&&e.state.status!=='delivered'&&!e.state.isTerminal);let cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<pending.length){const e=pending[cursor++];try{
 const d=await lwdpRequest('/api/v1/generation/jobs/'+e.state.jobId,{config:apiConfig,maxAttempts:1,fetchImplementation:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(10000)})});const status=(d.job??d).status;
 if(terminal.has(status)){Object.assign(e.state,{status,isTerminal:true,resumeReconciledAt:new Date().toISOString()});await writeFile(e.file,JSON.stringify(e.state));}
 }catch(error){console.log(JSON.stringify({kind:'resume-exact-job-unresolved',jobId:e.state.jobId,error:error.message}));}}}));
const authorized=[];
for(const r of records){
 if(r.entries.some(e=>!e.state.isTerminal||!['failed','submit_failed','completed','cancelled','stopped'].includes(e.state.status)))continue;
 const pipeline=r.entries[0].state.pipeline;if(r.entries.some(e=>e.state.pipeline!==pipeline))continue;
 const maximum=Math.max(0,...r.entries.map(e=>Number(/-retry-(\d+)$/.exec(e.name)?.[1]??0)));if(maximum>=2)continue;
 const key=pipeline==='t2i'?'imageRetryAttempts':'codexRetryAttempts',cancelKey=pipeline==='t2i'?'imageRetryCancelledJobs':'codexRetryCancelledJobs';
 runtime[key]??={};runtime[key][r.logicalTaskId]=maximum+1;
 runtime[cancelKey]=[...new Set([...(runtime[cancelKey]??[]),...r.entries.filter(e=>['cancelled','stopped'].includes(e.state.status)).map(e=>e.state.jobId)])];
 authorized.push({taskId:r.logicalTaskId,pipeline,retry:maximum+1,predecessors:r.entries.map(e=>({jobId:e.state.jobId,status:e.state.status}))});
}
await writeFile(runtimeFile,JSON.stringify(runtime));await writeFile(path.join(outputRoot,'user-resume-recovery.json'),JSON.stringify({at:new Date().toISOString(),reason:'User explicitly resumed cases 05–09 after pausing; continue existing jobs and retry terminal failures at most once in this resume',authorized},null,2));
console.log(JSON.stringify({kind:'user-resume-reconciled',episodeId,authorizedRetries:authorized.length,stillActiveOrUnknown:pending.filter(e=>!e.state.isTerminal).length}));
await runEpisodeWorkflow({sourceManifestPath,outputRoot,episodeId,runtimeConfig:runtime,publishS3Prefix:value('--publish-s3'),stopBeforeSeedance:true});
