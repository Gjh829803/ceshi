import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {runEpisodeWorkflow} from './workflow.js';
import {createBatchQueue} from './batch-controller.mjs';
import {createBatchStore} from './batch-store.mjs';

// The immutable capsule owns this list; two CPU lanes prepare the cohort before GPU admission.
const plan=JSON.parse(await readFile(process.argv[2]??'inputs/production-plan.json','utf8'));
if(plan.stopBeforeSeedance!==true||plan.concurrency!==2||!Array.isArray(plan.cases)||!plan.cases.length)throw Error('EPISODE_PREPARE_BATCH_INVALID');
const queue=createBatchQueue({store:createBatchStore({namespace:'lwdp'})});
const results:any[]=[];let next=0;
await Promise.all(Array.from({length:2},async()=>{
 while(next<plan.cases.length){const c=plan.cases[next++];
  try{
   if(!/^inputs\/cases\/[a-z0-9-]+\/source.json$/.test(c.sourceManifest)||!/^output\/[a-z0-9-]+$/.test(c.outputRoot))throw Error('EPISODE_PREPARE_CASE_PATH_INVALID');
   const state=await runEpisodeWorkflow({sourceManifestPath:path.resolve(c.sourceManifest),outputRoot:path.resolve(c.outputRoot),episodeId:c.episodeId,stopBeforeSeedance:true,until:'pre-seedance',publishS3Prefix:c.publishS3Prefix});
   results.push({episodeId:c.episodeId,status:state.status});
  }catch(error:any){
   results.push({episodeId:c.episodeId,status:'failed',error:String(error.message).slice(0,1500)});
   // Unknown remote submission is still an open producer, never a fabricated terminal closure.
   if(!/PENDING|UNKNOWN|RECONCILIATION/.test(error.code??error.message??''))await queue.failPendingProducer(plan.cohortId,c.episodeId);
  }
 }
}));
await writeFile('prepare-batch-result.json',JSON.stringify({cohortId:plan.cohortId,results},null,2));
console.log(JSON.stringify({kind:'episode-prepare-batch-result',cohortId:plan.cohortId,results}));
if(results.some(r=>r.status==='failed'))process.exitCode=1;
