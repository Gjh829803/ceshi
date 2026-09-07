#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createBatchStore,cohortName,GLOBAL_QUEUE} from './batch-store.mjs';
import {createBatchQueue,reconcileBatches,reconcileContinuations} from './batch-controller.mjs';
import {reconcileResourceClosures} from './batch-resources.mjs';
import {runBatchWorker} from './batch-worker.mjs';
import {materializeThreeEpisodeConfig} from '../cloud/three-episode-host.mjs';
export async function reconcileAll(store,operations=[()=>reconcileBatches(store),()=>reconcileContinuations(store),()=>reconcileResourceClosures(store)]){const names=['batch','continuations','resources'];return Object.fromEntries((await Promise.allSettled(operations.map(fn=>fn()))).map((r,i)=>[names[i],r.status==='fulfilled'?r.value:{status:'error',error:r.reason.message}]));}
export async function main(argv){
 const [command,...args]=argv;const flags={};for(let i=0;i<args.length;i+=2){if(!['--cohort','--cases-file','--case','--status','--namespace','--batch'].includes(args[i])||!args[i+1])throw Error('EPISODE_BATCH_ARGUMENT_INVALID');flags[args[i].slice(2)]=args[i+1];}
 const store=createBatchStore({namespace:flags.namespace??'lwdp'}),queue=createBatchQueue({store});
 switch(command){
  case 'register':return queue.register(flags.cohort,JSON.parse(await readFile(flags['cases-file'],'utf8')));
  case 'terminal':return queue.terminal(flags.cohort,flags.case,flags.status);
  case 'cancel':return queue.cancel(flags.cohort);
  case 'status':return flags.cohort?store.state(cohortName(flags.cohort)):store.state(GLOBAL_QUEUE);
  case 'pause':return store.change(GLOBAL_QUEUE,s=>{s.paused=true;},{paused:true,active:null,closures:[]});
  case 'resume':return store.change(GLOBAL_QUEUE,s=>{s.paused=false;});
  case 'reconcile':return reconcileAll(store);
  case 'resources':return reconcileResourceClosures(store);
  case 'worker':await materializeThreeEpisodeConfig({repoRoot:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),captureOnly:true});return runBatchWorker({store,batchId:flags.batch});
  default:throw Error('Usage: batch-cli.mjs register|terminal|cancel|status|pause|resume|reconcile|worker [--cohort ID] [--cases-file JSON] [--namespace NS]');
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(await main(process.argv.slice(2)))+'\n');
