import {spawn} from 'node:child_process';
import path from 'node:path';

/** Optional durability helper; failures never revoke a completed technical delivery. */
export function startThreeProgressPublisher({layout,lock,env}, {spawnProcess=spawn,intervalMilliseconds=30000,stopTimeoutMilliseconds=15000}={}) {
  if(!Number.isSafeInteger(intervalMilliseconds)||intervalMilliseconds<100||intervalMilliseconds>60000||!Number.isSafeInteger(stopTimeoutMilliseconds)||stopTimeoutMilliseconds<1||stopTimeoutMilliseconds>15000)throw new Error('THREE_PROGRESS_PUBLISHER_LIMIT_INVALID');
  // The caller provides executionEnvironment(..., includeAuthentication:false).
  // No implicit process.env inheritance and no author-selected Node hooks.
  const workerEnvironment=Object.fromEntries(Object.entries(env).filter(([name])=>!/^(?:CODEX_HOME|NODE_OPTIONS|NODE_PATH|TSX_TSCONFIG_PATH|TSX_DISABLE_CACHE)$/.test(name)&&!/(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY|ACCESS_KEY|AUTH)/i.test(name)));
  Object.assign(workerEnvironment,{TSX_DISABLE_CACHE:'1',TSX_TSCONFIG_PATH:path.join(lock.toolkitRoot,'tsconfig.json')});
  const args=['--no-preserve-symlinks','--no-preserve-symlinks-main','--import',path.join(lock.toolkitRoot,'node_modules/tsx/dist/loader.mjs'),path.join(lock.toolkitRoot,'scripts/three-creator/progress-worker.ts'),
    '--workspace',layout.workspace,'--profile',layout.profile,'--case-id',layout.caseId,'--task-id',layout.taskId,
    '--runtime-hash',lock.prebuiltRuntimes[layout.profile].runtimeHash,'--creator-runtime-lock-hash',lock.runtimeHash,'--interval-ms',String(intervalMilliseconds)];
  let child,done=false;
  try {child=spawnProcess(lock.nodeBinary,args,{cwd:lock.toolkitRoot,env:workerEnvironment,stdio:['pipe','ignore','ignore']});}
  catch {return{stop:async()=>{}};}
  const closed=new Promise(resolve=>{
    const finish=()=>{done=true;resolve();};
    child.once('error',finish);child.once('close',finish);child.stdin?.on('error',()=>{});
  });
  let stopping;
  return {stop() {
    if(stopping)return stopping;
    stopping=(async()=>{
      if(done)return;
      try{child.stdin?.end('stop\n');}catch{}
      let timeout;
      await Promise.race([closed,new Promise(resolve=>{timeout=setTimeout(()=>{try{child.kill('SIGKILL');}catch{}resolve();},stopTimeoutMilliseconds);})]);
      clearTimeout(timeout);
    })();return stopping;
  }};
}
