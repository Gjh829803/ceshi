#!/usr/bin/env node
// Continuous read-only progress projection; does not POST, cancel, or message agents.
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeJson} from './three-eval-runtime.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2), options={};
for(let i=0;i<args.length;i+=2){if(!['--run-roots','--output','--interval-seconds'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Invalid watcher arguments');options[args[i]]=args[i+1];}
const roots=(options['--run-roots']??'').split(',').filter(Boolean).map(x=>path.resolve(x)),output=path.resolve(options['--output']??'');
if(!roots.length||roots.some(x=>!x.startsWith(path.join(repo,'.codex-tmp/three-creator-eval/runs/')))||!output.startsWith(repo+'/'))throw Error('Use explicit task-owned local roots/output');
const seconds=Number(options['--interval-seconds']??15);if(!Number.isFinite(seconds)||seconds<10||seconds>60)throw Error('Watcher interval must be within [10,60]');
async function optional(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
while(true){
  const attempts=[];
  for(const runRoot of roots){const plan=await optional(path.join(runRoot,'evaluation-plan.json'));if(!plan)continue;
    for(const entry of plan.cases){if(!plan.selectedTaskIds.includes(entry.taskId))continue;const state=await optional(path.join(runRoot,entry.taskId,'state.json'));if(!state?.jobId)continue;
      attempts.push({runId:plan.runId,runRoot,caseId:entry.caseId,taskId:entry.taskId,jobId:state.jobId,requestId:state.requestId,caseHash:state.caseHash,runtimeHash:state.runtimeHash,phase:state.phase,providerStatus:state.providerStatus,submittedAt:state.submittedAt??null,retryOf:state.retryOf??null,workDir:`/fsx/pipeline/lwdp_generation/${state.jobId}`});
    }
  }
  try {const parserUrl=new URL('./three-eval-live.mjs',import.meta.url);parserUrl.searchParams.set('revision',String((await stat(fileURLToPath(new URL('./three-eval-live.mjs',import.meta.url)))).mtimeMs));const {readThreeLiveStatus}=await import(parserUrl.href);const live=await readThreeLiveStatus(attempts,{cacheMilliseconds:12000});
    const result={kind:'three-creator-safe-live-status',schemaVersion:1,observedAt:live.observedAt,source:'Host-only fixed output metadata and actual CLI/MCP events',containsReasoningOrCommands:false,attempts:attempts.map(item=>({...item,...live.jobs.find(x=>x.jobId===item.jobId)}))};
    await writeJson(output,result);
    if(attempts.length&&attempts.every(item=>['delivered','failed'].includes(item.phase)))break;
  }catch(error){process.stderr.write(`THREE_LIVE_OBSERVATION_PENDING ${error.name}\n`);}
  await new Promise(resolve=>setTimeout(resolve,seconds*1000));
}
