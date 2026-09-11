import test from 'node:test';
import assert from 'node:assert/strict';
import {requestSlot} from '../../src/seedance/seedance-slot.mjs';
const hash='a'.repeat(64),token='test-token-value-only',metadata={attempt:'attempt-01',taskId:'real-task'};
const config={url:'http://127.0.0.1:53871',token};

test('slot sends an authenticated exact attempt and refuses redirect forwarding',async()=>{
 let call;
 const result=await requestSlot('enter',hash,hash,metadata,{...config,request:async(...args)=>{call=args;return new Response('{"ok":true}');}});
 assert.deepEqual(result,{ok:true});assert.equal(call[0],`${config.url}/enter`);
 assert.equal(call[1].headers.Authorization,`Bearer ${token}`);assert.equal(call[1].redirect,'error');
 assert.deepEqual(JSON.parse(call[1].body),{key:hash,...metadata});
});

test('lost acknowledgement retries only the same identity and terminal denial stops',async()=>{
 const bodies=[];let time=0;
 await requestSlot('leave',hash,hash,metadata,{...config,now:()=>time,sleep:async ms=>{time+=ms;},request:async(_url,options)=>{
  bodies.push(options.body);if(bodies.length===1)throw Error('connection lost');return new Response('{"ok":true}');
 }});
 assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);
 let calls=0;
 await assert.rejects(requestSlot('enter',hash,hash,metadata,{...config,request:async()=>{calls++;return new Response('{"error":"SEEDANCE_PRODUCTION_BUDGET_EXHAUSTED"}',{status:400});}}),/BUDGET_EXHAUSTED/);
 assert.equal(calls,1);
});

test('invalid identity, missing credentials and cleartext remote URLs fail before transport',async()=>{
 let called=false;const request=async()=>{called=true;};
 await assert.rejects(requestSlot('enter',hash,'b'.repeat(64),metadata,{...config,request}),/IDENTITY_INVALID/);
 await assert.rejects(requestSlot('enter',hash,hash,metadata,{...config,token:'',request}),/TOKEN_REQUIRED/);
 await assert.rejects(requestSlot('enter',hash,hash,metadata,{...config,url:'http://admission.example.test',request}),/URL_INVALID/);
 await assert.rejects(requestSlot('enter',hash,hash,metadata,{...config,url:'https://user:secret@example.test',request}),/URL_INVALID/);
 assert.equal(called,false);
});
