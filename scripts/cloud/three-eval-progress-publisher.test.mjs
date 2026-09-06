import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,realpath,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {startThreeProgressPublisher} from './three-eval-progress-publisher.mjs';
const exec=promisify(execFile),repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const lock={nodeBinary:process.execPath,toolkitRoot:repository,runtimeHash:'b'.repeat(64),prebuiltRuntimes:{'three-sdk':{runtimeHash:'a'.repeat(64)}}};
const layout={workspace:'/local-fixture',outputs:'/local-fixture/outputs',profile:'three-sdk',caseId:'local-case',taskId:'local-case--three-sdk'};
test('publisher uses provided clean environment, pinned Node/toolkit and excludes authentication or hook injection',async()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();let request;
 child.stdin.on('finish',()=>child.emit('close',0));child.kill=()=>{};
 const publisher=startThreeProgressPublisher({layout,lock,env:{PATH:'/bin',HOME:'/clean/home',CODEX_HOME:'/forbidden',OPENAI_API_KEY:'placeholder',NODE_OPTIONS:'--import bad',UNRELATED_SAFE:'preserved'}},{spawnProcess:(...args)=>{request=args;return child;}});
 assert.equal(request[0],lock.nodeBinary);assert(request[1].includes(path.join(repository,'scripts/three-creator/progress-worker.ts')));assert.equal(request[2].cwd,repository);
 assert.deepEqual(request[2].env,{PATH:'/bin',HOME:'/clean/home',UNRELATED_SAFE:'preserved',TSX_DISABLE_CACHE:'1',TSX_TSCONFIG_PATH:path.join(repository,'tsconfig.json')});
 const stop=publisher.stop();assert.equal(publisher.stop(),stop);await stop;
});
test('spawn failure and bounded shutdown never reject or wait for a stuck optional worker',async()=>{
 await startThreeProgressPublisher({layout,lock,env:{}},{spawnProcess:()=>{throw new Error('fixture unavailable');}}).stop();
 const child=new EventEmitter();child.stdin=new PassThrough();let killed=false;child.kill=signal=>{assert.equal(signal,'SIGKILL');killed=true;};
 const publisher=startThreeProgressPublisher({layout,lock,env:{}},{spawnProcess:()=>child,stopTimeoutMilliseconds:20});await publisher.stop();assert(killed);
});
test('real bundled-TS worker publishes partial source and flushes the latest edits on stop',async t=>{
 const temporary=await mkdtemp(path.join(os.tmpdir(),'progress-worker-'));t.after(()=>rm(temporary,{recursive:true,force:true}));const workspace=await realpath(temporary);
 await mkdir(path.join(workspace,'outputs'));await writeFile(path.join(workspace,'plan.md'),'# First plan');
 const publisher=startThreeProgressPublisher({layout:{...layout,workspace,outputs:path.join(workspace,'outputs')},lock,env:{PATH:process.env.PATH,HOME:workspace,TMPDIR:workspace}},{intervalMilliseconds:100});
 t.after(()=>publisher.stop());
 let initial;for(let n=0;n<100;n++){try{initial=JSON.parse(await readFile(path.join(workspace,'outputs/creator-progress.json'),'utf8'));break;}catch{await new Promise(resolve=>setTimeout(resolve,50));}}
 assert.equal(initial?.status,'unverified');
 await writeFile(path.join(workspace,'plan.md'),'# Completed top-down plan\nPreserve this final edit.');await writeFile(path.join(workspace,'world.ts'),'const incomplete =');
 await publisher.stop();
 const final=JSON.parse(await readFile(path.join(workspace,'outputs/creator-progress.json'),'utf8'));assert.notEqual(initial.sourceHash,final.sourceHash);
 const output=path.join(workspace,'verified');await exec('python3',[path.join(repository,'scripts/cloud/three-progress-unpack.py'),'--archive',path.join(workspace,'outputs/creator-progress.tar.gz'),'--receipt',path.join(workspace,'outputs/creator-progress.json'),'--output',output]);
 assert.equal(await readFile(path.join(output,'payload/source/world.ts'),'utf8'),'const incomplete =');assert.match(await readFile(path.join(output,'payload/source/plan.md'),'utf8'),/final edit/);
});
test('progress verifier adversarial and byte-roundtrip suite',async()=>{
 const result=await exec('python3',[path.join(repository,'scripts/cloud/three-progress-unpack.test.py')]);assert.match(result.stderr,/OK/);
});
