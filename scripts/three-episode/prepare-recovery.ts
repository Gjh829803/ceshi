import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createCloudClient} from './cloud.mjs';
import {createBatchQueue} from './batch-controller.mjs';
import {upstreamComplete} from './batch-state.mjs';
import {createBatchStore,GLOBAL_QUEUE,cohortName} from './batch-store.mjs';
import {runEpisodeWorkflow} from './workflow.js';
const plan=JSON.parse(await readFile(process.argv[2]??'inputs/production-plan.json','utf8'));
if(plan.stopBeforeSeedance!==true||!process.argv.includes('--stop-before-seedance')||plan.concurrency!==2||!plan.recovery?.producerJobName)throw Error('EPISODE_RECOVERY_PLAN_INVALID');
const store=createBatchStore(),queue=createBatchQueue({store});
console.log(JSON.stringify({kind:'episode-recovery-wait',producerJob:plan.recovery.producerJobName}));
for(;;){const job=await store.request(['get','job',plan.recovery.producerJobName,'-n',store.namespace,'--ignore-not-found','-o','json']);if(!job)throw Error('EPISODE_PREDECESSOR_JOB_UNKNOWN');if(job.status?.conditions?.some((c:any)=>['Complete','Failed'].includes(c.type)&&c.status==='True'))break;await delay(30_000);}
await queue.cancel(plan.recovery.cohortId);
const results:any[]=[];let next=0;
await Promise.all(Array.from({length:2},async()=>{
 while(next<plan.cases.length){const c=plan.cases[next++];
  try{
   if(!/^inputs\/cases\/[a-z0-9-]+\/source.json$/.test(c.sourceManifest)||!/^output\/[a-z0-9-]+$/.test(c.outputRoot))throw Error('EPISODE_RECOVERY_PATH_INVALID');
   const outputRoot=path.resolve(c.outputRoot);
   await createCloudClient().hydrateDirectory(c.checkpointS3Uri,outputRoot);
   const previous=JSON.parse(await readFile(path.join(outputRoot,'episode.json'),'utf8'));
   if(previous.episodeId!==c.episodeId||!['failed','paused-capture-queue'].includes(previous.status))throw Error('EPISODE_RECOVERY_CHECKPOINT_INVALID');
   // Preserve exact plans and provider journals; the new cohort owns new queue identities.
   const state=await runEpisodeWorkflow({sourceManifestPath:path.resolve(c.sourceManifest),outputRoot,episodeId:c.episodeId,stopBeforeSeedance:true,until:'pre-seedance',publishS3Prefix:c.publishS3Prefix});
   results.push({episodeId:c.episodeId,status:state.status});
  }catch(error:any){results.push({episodeId:c.episodeId,status:'failed',error:String(error.message).slice(0,1500)});}
 }
}));
await writeFile('prepare-recovery-result.json',JSON.stringify({cohortId:plan.cohortId,results},null,2));
const cohort=await store.state(cohortName(plan.cohortId));
if(!cohort.cancelled&&upstreamComplete(cohort)&&Object.values(cohort.tasks).some((task:any)=>task.status==='ready'))await store.change(GLOBAL_QUEUE,s=>{if(s.active)throw Error('EPISODE_RECOVERY_GPU_ALREADY_ACTIVE');s.paused=false;});
else process.exitCode=1;
console.log(JSON.stringify({kind:'episode-recovery-result',cohortId:plan.cohortId,results}));
