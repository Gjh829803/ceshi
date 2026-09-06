import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,realpath,symlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {retrieveThreeCheckpoint,installThreeCheckpoint,refreshTerminalThreeCheckpoint,THREE_CHECKPOINT_OUTPUTS} from './three-eval-checkpoints.mjs';
const exec=promisify(execFile),here=path.dirname(fileURLToPath(import.meta.url));
async function fixture(t){
 const temporary=await mkdtemp(path.join(os.tmpdir(),'checkpoint-retrieval-'));t.after(()=>rm(temporary,{recursive:true,force:true}));const root=await realpath(temporary);
 const script="import importlib.util,json,sys;spec=importlib.util.spec_from_file_location('fixture',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);print(json.dumps(m.checkpoint_fixture(sys.argv[2])))";
 const {stdout}=await exec('python3',['-c',script,path.join(here,'three-checkpoint-unpack.test.py'),root]);const f=JSON.parse(stdout);
 return{root,...f};
}
test('live fixed-output retrieval verifies a checkpoint and retains it across partial or unavailable updates',async t=>{
 const f=await fixture(t),archive=await readFile(f.archive),jobId='gen_12345678';
 const args={jobId,taskId:f.expected.taskId,workDirectory:`/fsx/pipeline/lwdp_generation/${jobId}`,caseRoot:f.root,expected:f.expected};
 const response=Buffer.concat([Buffer.from(JSON.stringify({receipt:f.metadata})+'\n'),archive]);
 let requests=0;
 const transport=async(binary,values)=>{requests++;assert.equal(binary,'kubectl');assert.equal(values.at(-3),'-c');const request=JSON.parse(values.at(-1));assert.equal(request.workDirectory,args.workDirectory);assert.equal(request.taskId,args.taskId);return{stdout:response};};
 const installed=await retrieveThreeCheckpoint(args,{pod:'fixture-head',transport});assert.equal(installed.status,'runnable');assert.equal(installed.jobId,jobId);assert.equal(requests,1);
 assert.match(await readFile(path.join(f.root,installed.verifiedDirectory,'payload/playable/index.html'),'utf8'),/LOCAL FIXTURE runnable/);
 const before=await readFile(path.join(f.root,'checkpoint-latest.json'));
 await assert.rejects(retrieveThreeCheckpoint(args,{pod:'fixture-head',transport:async()=>({stdout:response.subarray(0,response.length-20)})}),/PAIR_MISMATCH/);
 assert.deepEqual(await readFile(path.join(f.root,'checkpoint-latest.json')),before);
 const retained=await retrieveThreeCheckpoint(args,{pod:'fixture-head',transport:async()=>({stdout:Buffer.from('{"unavailable":true}\n')})});assert.deepEqual(retained,installed);
 const same=await retrieveThreeCheckpoint(args,{pod:'fixture-head',transport:async()=>({stdout:Buffer.from('{"unchanged":true}\n')})});assert.deepEqual(same,installed);
});
test('terminal artifact installation checks expected runtime identity and never overwrites the prior verified pointer',async t=>{
 const f=await fixture(t),args={archivePath:f.archive,receiptPath:f.receipt,caseRoot:f.root,expected:f.expected,jobId:'gen_12345678'};
 const installed=await installThreeCheckpoint(args);assert.equal(installed.worldBuildHash,'d'.repeat(64));
 const before=await readFile(path.join(f.root,'checkpoint-latest.json'));
 await assert.rejects(installThreeCheckpoint({...args,expected:{...f.expected,creatorRuntimeLockHash:'e'.repeat(64)}}),/IDENTITY_MISMATCH/);
 assert.deepEqual(await readFile(path.join(f.root,'checkpoint-latest.json')),before);
 assert.ok(THREE_CHECKPOINT_OUTPUTS.every(output=>output.required===false));
});
test('bad job/workspace identity is rejected before transport or filesystem traversal',async()=>{
 let calls=0;await assert.rejects(retrieveThreeCheckpoint({jobId:'gen_12345678',taskId:'local-case--three-sdk',workDirectory:'/fsx/pipeline/other-job',caseRoot:'/does-not-exist',expected:{taskId:'local-case--three-sdk'}},{pod:'fixture-head',transport:async()=>{calls++;}}),/IDENTITY_INVALID/);assert.equal(calls,0);
});
test('linked checkpoint pointers are rejected before reading target contents or contacting the server',async t=>{
 const f=await fixture(t);await symlink(f.receipt,path.join(f.root,'checkpoint-latest.json'));let calls=0;
 await assert.rejects(retrieveThreeCheckpoint({jobId:'gen_12345678',taskId:f.expected.taskId,workDirectory:'/fsx/pipeline/lwdp_generation/gen_12345678',caseRoot:f.root,expected:f.expected},{pod:'fixture-head',transport:async()=>{calls++;}}),/PATH_INVALID/);assert.equal(calls,0);
});
test('terminal resume fetches optional artifacts without changing failed/delivered execution or admission state',async t=>{
 for(const phase of ['failed','delivered']){
  const f=await fixture(t),jobId='gen_12345678';
  const state={phase,jobId,taskId:f.expected.taskId,caseId:f.expected.caseId,profile:f.expected.profile,runtimeHash:f.expected.creatorRuntimeLockHash,requestId:'request-fixture',caseHash:'e'.repeat(64),submittedAt:'2026-09-06T00:00:00Z',updatedAt:'2026-09-06T00:45:00Z',failure:phase==='failed'?{message:'CREATOR_TASK_TIMEOUT'}:null,artifacts:{'existing-delivery.json':{sha256:'f'.repeat(64)}},checkpointObservationWarning:'THREE_CHECKPOINT_NOT_REFRESHED'};
  await writeFile(path.join(f.root,'state.json'),JSON.stringify(state));
  const admission=Buffer.from('LOCAL FIXTURE immutable terminal admission');await writeFile(path.join(f.root,'admission-fixture.json'),admission);
  const archive=await readFile(f.archive),response=Buffer.concat([Buffer.from(JSON.stringify({receipt:f.metadata})+'\n'),archive]);let fetches=0;
  const result=await refreshTerminalThreeCheckpoint({mode:'resume',state,caseRoot:f.root,expected:f.expected,requestId:state.requestId,caseHash:state.caseHash},{retrievalOptions:{pod:'fixture-head',transport:async(binary,args)=>{fetches++;assert.equal(binary,'kubectl');assert(args.includes('exec'));return{stdout:response};}}});
  assert.equal(result.changed,true);assert.equal(fetches,1);
  const saved=JSON.parse(await readFile(path.join(f.root,'state.json'),'utf8')),expectedState={...state,checkpoint:result.checkpoint};delete expectedState.checkpointObservationWarning;
  assert.deepEqual(saved,expectedState);assert.equal(saved.phase,phase);assert.deepEqual(await readFile(path.join(f.root,'admission-fixture.json')),admission);
  assert.equal(saved.checkpoint.status,'runnable');assert.equal(saved.checkpointObservationWarning,undefined);
 }
});
test('terminal resume with no checkpoint or a transient fetch error leaves state bytes unchanged',async t=>{
 const f=await fixture(t),state={phase:'failed',jobId:'gen_12345678',taskId:f.expected.taskId,caseId:f.expected.caseId,profile:f.expected.profile,runtimeHash:f.expected.creatorRuntimeLockHash,requestId:'request-fixture',caseHash:'e'.repeat(64),failure:{message:'CREATOR_TASK_TIMEOUT'},checkpointObservationWarning:'THREE_CHECKPOINT_NOT_REFRESHED'};
 const bytes=Buffer.from(JSON.stringify(state));await writeFile(path.join(f.root,'state.json'),bytes);
 const args={mode:'resume',state,caseRoot:f.root,expected:f.expected,requestId:state.requestId,caseHash:state.caseHash};let calls=0;
 const absent=await refreshTerminalThreeCheckpoint(args,{retrieve:async()=>{calls++;return null;}});assert.equal(absent.changed,false);assert.equal(calls,1);assert.deepEqual(await readFile(path.join(f.root,'state.json')),bytes);
 const failed=await refreshTerminalThreeCheckpoint(args,{retrieve:async()=>{throw new Error('fixture transport error');}});assert.equal(failed.changed,false);assert.deepEqual(await readFile(path.join(f.root,'state.json')),bytes);
 const skipped=await refreshTerminalThreeCheckpoint({...args,mode:'run'},{retrieve:async()=>{calls++;throw new Error('must not fetch');}});assert.equal(skipped.changed,false);assert.equal(calls,1);
});

test('retained archive supports continuation but later tampering cannot reuse a verified pointer',async t=>{
 const f=await fixture(t),jobId='gen_12345678',args={archivePath:f.archive,receiptPath:f.receipt,caseRoot:f.root,expected:f.expected,jobId};
 const installed=await installThreeCheckpoint(args);const {readVerifiedThreeArtifact}=await import('./three-eval-checkpoints.mjs');
 const value=await readVerifiedThreeArtifact('checkpoint',{caseRoot:f.root,expected:f.expected,jobId});assert.deepEqual(await readFile(value.archivePath),await readFile(f.archive));
 await writeFile(value.archivePath,'changed after verification');
 await assert.rejects(readVerifiedThreeArtifact('checkpoint',{caseRoot:f.root,expected:f.expected,jobId}),/PAIR_MISMATCH/);
 assert.equal(JSON.parse(await readFile(path.join(f.root,'checkpoint-latest.json'),'utf8')).archiveSha256,installed.archiveSha256);
});
test('fixed delivery recovery copies actual declared files only and rejects corrupted transport',async t=>{
 const f=await fixture(t),{retrieveThreeDeliveryArtifacts}=await import('./three-eval-checkpoints.mjs');let calls=0;
 const args={jobId:'gen_12345678',taskId:f.expected.taskId,caseRoot:f.root,names:['creator-result.json']},data=Buffer.from('LOCAL FIXTURE source receipt');
 const {createHash}=await import('node:crypto');const receipt={name:'creator-result.json',bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')},response=Buffer.concat([Buffer.from(JSON.stringify(receipt)+'\n'),data]);
 const result=await retrieveThreeDeliveryArtifacts(args,{pod:'fixture',transport:async()=>{calls++;return {stdout:response};}});assert.equal(result['creator-result.json'].bytes,data.length);assert.deepEqual(await readFile(path.join(f.root,'creator-result.json')),data);
 await assert.rejects(retrieveThreeDeliveryArtifacts({...args,names:['../auth.json']},{pod:'fixture',transport:async()=>{calls++;}}),/SCOPE/);assert.equal(calls,1);
 await assert.rejects(retrieveThreeDeliveryArtifacts(args,{pod:'fixture',transport:async()=>({stdout:response.subarray(0,response.length-1)})}),/HASH/);assert.deepEqual(await readFile(path.join(f.root,'creator-result.json')),data);
});
