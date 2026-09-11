import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileResourceClosures} from '../../src/batch/batch-resources.mjs';
test('resource closure remains pending for running, unknown or retained storage',async()=>{
 for(const observation of [{instanceState:'running',spotClosed:true,volumesClosed:true},{instanceState:'terminated',spotClosed:false,volumesClosed:true},{instanceState:'terminated',spotClosed:true,volumesClosed:false},null]){
  let state={closures:[{jobName:'job-one',status:'cleanup-pending',nodes:[{providerId:'aws:///zone/i-123'}]}]};
  await reconcileResourceClosures({state:async()=>structuredClone(state),change:async(_,f)=>f(state)},async()=>{if(!observation)throw Error('AccessDenied');return observation;});
  assert.equal(state.closures[0].status,'cleanup-pending');
 }
});
test('only complete instance, spot and storage evidence closes a resource',async()=>{
 const state={closures:[{jobName:'job-one',status:'cleanup-pending',nodes:[{providerId:'aws:///zone/i-123'}]}]};
 await reconcileResourceClosures({state:async()=>structuredClone(state),change:async(_,f)=>f(state)},async()=>({instanceState:'terminated',spotClosed:true,volumesClosed:true}));
 assert.equal(state.closures[0].status,'resource-closed');
});
test('EC2 inspection requires actual volume deletion evidence, not an empty attachment list',async()=>{
 const {resourceInspector}=await import('../../src/batch/batch-resources.mjs');
 for(const mode of ['missing-inventory','retained','deleted']){
  const inspect=resourceInspector({run:async(_cmd,args)=>{
   if(args[1]==='describe-instances')return {stdout:JSON.stringify({Reservations:[{Instances:[{InstanceId:'i-123',State:{Name:'terminated'},BlockDeviceMappings:mode==='missing-inventory'?[]:[{Ebs:{VolumeId:'vol-123',DeleteOnTermination:true}}]}]}]})};
   assert.equal(args[1],'describe-volumes');assert(args.includes('vol-123'));
   if(mode==='deleted')throw Object.assign(Error('missing'),{stderr:'InvalidVolume.NotFound'});
   return {stdout:JSON.stringify({Volumes:[{VolumeId:'vol-123',State:'available'}]})};
  }});
  assert.equal((await inspect('aws:///us-east-2a/i-123')).volumesClosed,mode==='deleted');
 }
});
test('resource reconciliation runs even when both dispatchers fail',async()=>{
 const {reconcileAll}=await import('../../src/cli/batch-cli.mjs');let cleaned=false;
 const result=await reconcileAll({},[async()=>{throw Error('bad batch');},async()=>{throw Error('bad CPU');},async()=>{cleaned=true;return [];}]);
 assert(cleaned);assert.equal(result.batch.status,'error');assert.deepEqual(result.resources,[]);
});
