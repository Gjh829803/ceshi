import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,cp,symlink,chmod,rm,realpath} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {THREE_LAUNCHER_FILES,readRuntimeLock,fileSha256} from './three-eval-runtime.mjs';
import {admissionIsClosed} from './three-eval-admission.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const baselineLock=path.resolve(here,'../../docs/evaluations/gpt6-three/known-good-baseline/runtime-lock.json');

test('direct launcher entry uses pinned Node even when PATH offers a conflicting Node',async t=>{
 const temporary=await mkdtemp(path.join(tmpdir(),'selected-launcher-'));t.after(()=>rm(temporary,{recursive:true,force:true}));
 const root=await realpath(temporary),launcherRoot=path.join(root,'launcher'),nodeRoot=path.join(root,'toolkit/runtime/bin'),poisonRoot=path.join(root,'wrong-path');
 for(const directory of [launcherRoot,nodeRoot,poisonRoot])await mkdir(directory,{recursive:true});
 for(const name of THREE_LAUNCHER_FILES)await cp(path.join(here,name),path.join(launcherRoot,name));
 await symlink(process.execPath,path.join(nodeRoot,'node'));
 await writeFile(path.join(poisonRoot,'node'),'#!/bin/sh\nexit 88\n');await chmod(path.join(poisonRoot,'node'),0o755);
 const lock={...JSON.parse(await readFile(baselineLock,'utf8')),nodeBinary:path.join(nodeRoot,'node'),launcherFilesSha256:Object.fromEntries(await Promise.all(THREE_LAUNCHER_FILES.map(async name=>[name,await fileSha256(path.join(launcherRoot,name))])))};
 await writeFile(path.join(launcherRoot,'runtime-lock.json'),JSON.stringify(lock));
 const launcher=path.join(launcherRoot,'three-eval-launcher.mjs');await chmod(launcher,0o755);
 const result=spawnSync(launcher,['--worldkit-runtime-probe'],{env:{PATH:poisonRoot+':/usr/bin:/bin'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout);
 assert.equal(report.kind,'three-creator-launcher-probe');assert.equal(await realpath(report.nodeBinary),await realpath(process.execPath));assert.equal(report.modelCalls,0);
 await rm(path.join(nodeRoot,'node'));
 const missing=spawnSync(launcher,['--worldkit-runtime-probe'],{env:{PATH:poisonRoot+':/usr/bin:/bin'},encoding:'utf8'});
 assert.notEqual(missing.status,0);assert.notEqual(missing.status,88,'missing pinned Node must not fall back to PATH');
});

test('historical locks remain readable while the new launcher requires the complete restore closure',async()=>{
 assert.equal((await readRuntimeLock(baselineLock)).kind,'three-creator-runtime-lock');
 await assert.rejects(readRuntimeLock(baselineLock,{requireCurrentLauncher:true}),/THREE_LAUNCHER_CLOSURE_INVALID/);
 assert(THREE_LAUNCHER_FILES.includes('three-checkpoint-unpack.py'));
 assert(THREE_LAUNCHER_FILES.includes('three-progress-unpack.py'));
});

test('terminal execution releases admission before artifact retrieval, cancellation waits for cleanup',()=>{
 for(const providerStatus of ['succeeded','completed','failed','submit_failed'])for(const phase of ['running','delivery-pending','failed'])assert.equal(admissionIsClosed({providerStatus,phase,jobId:'gen_12345678',hasSubmissionIntent:true}),true);
 for(const providerStatus of ['cancelled','stopped']){
   assert.equal(admissionIsClosed({providerStatus,phase:'failed',rayCleanupConfirmed:false}),false);
   assert.equal(admissionIsClosed({providerStatus,phase:'stop-pending',rayCleanupConfirmed:true}),true);
 }
 for(const phase of ['submission-unknown','submitted','remote-pending','running'])assert.equal(admissionIsClosed({phase,jobId:'gen_12345678',hasSubmissionIntent:true}),false);
 assert.equal(admissionIsClosed({phase:'failed',jobId:null,hasSubmissionIntent:false}),true);
});
