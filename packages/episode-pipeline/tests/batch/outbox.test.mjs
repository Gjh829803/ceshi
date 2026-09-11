import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {enqueueDeliveredWorld,readDeliveryEvents} from '../../src/batch/outbox.mjs';

test('concurrent delivered notifications create one durable independent Episode event',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'episode-outbox-'));
 try{const input={outboxRoot:root,worldBuildHash:'a'.repeat(64),profileHash:'b'.repeat(64),sourceManifestSha256:'c'.repeat(64),sourceManifestPath:'/frozen/source.json',episodeId:'episode-dunes'};
 const results=await Promise.all(Array.from({length:12},()=>enqueueDeliveredWorld(input)));
 assert.equal(results.filter(x=>x.created).length,1); assert.equal((await readDeliveryEvents(root)).length,1);
 const retry=await enqueueDeliveredWorld(input);assert.equal(retry.created,false);assert.equal(retry.event.stopBeforeSeedance,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
