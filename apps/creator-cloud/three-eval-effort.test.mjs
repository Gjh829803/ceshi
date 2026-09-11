import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseCloudLayout} from './three-eval-runtime.mjs';
import {effectiveConfigMatches} from './three-eval-policy.mjs';

test('Service echo cannot drop or replace a fixed account or change ultra effort',()=>{
 const payload={request_id:'fixed-ultra',options:{codex_bin:'/isolated/launcher',codex_account_ids:['fixture-account']},defaults:{model:'gpt-6-astra',reasoning_effort:'ultra',sandbox:'workspace-write',timeout_seconds:2820,account_concurrency:5,pod_concurrency:1}};
 const config={request_id:payload.request_id,options:{...payload.options,...payload.defaults}};
 assert(effectiveConfigMatches(config,payload));
 for(const change of [{codex_account_ids:undefined},{codex_account_ids:['another-account']},{reasoning_effort:'xhigh'}])assert.equal(effectiveConfigMatches({...config,options:{...config.options,...change}},payload),false);
});

test('Cloud launcher admits exact ultra while rejecting mixed effort and silent defaults',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'three-ultra-'));
 try {
  const work=path.join(root,'gpt6-eval-forest-lookout--three-sdk');
  await mkdir(path.join(work,'outputs'),{recursive:true});
  const args=['exec','-C',work,'--output-last-message',path.join(work,'outputs','last.md'),'--add-dir',path.join(work,'outputs'),'--model','gpt-6-astra','--sandbox','workspace-write','-c','model_reasoning_effort="ultra"','prompt'];
  assert.equal((await parseCloudLayout(args)).reasoningEffort,'ultra');
  assert.equal((await parseCloudLayout(args.map(x=>x==='model_reasoning_effort="ultra"'?'model_reasoning_effort="xhigh"':x))).reasoningEffort,'xhigh');
  await assert.rejects(parseCloudLayout([...args.slice(0,-1),'-c','model_reasoning_effort="xhigh"','prompt']));
  await assert.rejects(parseCloudLayout(args.map(x=>x==='model_reasoning_effort="ultra"'?'model_reasoning_effort="max"':x)));
  await assert.rejects(parseCloudLayout(args.filter(x=>x!=='-c'&&x!=='model_reasoning_effort="ultra"')));
 } finally {await rm(root,{recursive:true,force:true});}
});
