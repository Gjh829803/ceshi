import {test} from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir,writeFile,readFile,rm}from'node:fs/promises';import os from'node:os';import path from'node:path';import{serveEpisodePreview}from'./preview-server.mjs';
test('human feedback persists concurrently and cannot attach to replaced images or cross-origin requests',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'episode-review-test-'));await mkdir(path.join(root,'human-ten'));const file=path.join(root,'human-ten/status.json');
 const status={cases:[{id:'human-ten-01',styles:[{id:'style-00',anchor:'https://assets.example/'+ 'a'.repeat(64)+'.png?signature=one'},{id:'style-01',anchor:'https://assets.example/'+'b'.repeat(64)+'.png'}]}]};await writeFile(file,JSON.stringify(status));const server=await serveEpisodePreview({root,port:0});const base='http://127.0.0.1:'+server.address().port;
 const post=(styleId,sha,note,origin=base)=>fetch(base+'/human-ten/api/reviews',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({caseId:'human-ten-01',styleId,imageSha256:sha.repeat(64),verdict:'needs-work',note})});
 try{
  const responses=await Promise.all([post('style-00','a','人物比例不对'),post('style-01','b','颜色太暗')]);assert(responses.every(r=>r.status===200));
  const saved=JSON.parse(await readFile(path.join(root,'human-ten/human-reviews.json'),'utf8'));assert.equal(Object.keys(saved.reviews).length,2);assert.equal(saved.history.length,2);assert(Object.values(saved.reviews).every(r=>r.scope==='candidate-feedback-only'));
  assert.equal((await post('style-00','a','bad','https://unrelated.example')).status,403);
  status.cases[0].styles[0].anchor='https://assets.example/'+'c'.repeat(64)+'.png';await writeFile(file,JSON.stringify(status));assert.equal((await post('style-00','a','stale')).status,409);
  const restored=await(await fetch(base+'/human-ten/api/reviews')).json();assert.equal(restored.reviews['human-ten-01/style-00/'+'a'.repeat(64)].note,'人物比例不对');assert.equal(restored.history.length,2);
 }finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
