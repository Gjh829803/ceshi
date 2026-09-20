import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture} from '../tools/publication-fixture.mjs';
import {publishLibrary} from '../tools/publish.mjs';
import {ROOT} from '../tools/core.mjs';
import {createServer} from '../tools/serve.mjs';
import {AssetLibrary} from '../client/asset-library.mjs';
import {materializeAssets} from '../client/materialize.mjs';

test('standalone facade consumes paginated published Registry without source access',async t=>{
  const f=fixture(t);for(let i=0;i<22;i++)f.add('object.extra-'+i);
  await publishLibrary(f.root,{output:f.output});
  fs.renameSync(path.join(f.root,'subjects'),path.join(f.root,'removed-subjects'));fs.renameSync(path.join(f.root,'shared'),path.join(f.root,'removed-shared'));
  const server=createServer(f.output);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/`,requests=[];
  const library=new AssetLibrary(base,{fetch:(url,options)=>{requests.push(url);return fetch(url,options);}});
  const first=await library.search();assert.equal(first.items.length,20);assert.ok(first.next_cursor);assert.equal(first.total,24);
  const second=await library.search('',{cursor:first.next_cursor});assert.equal(second.items.length,4);
  const manifest=await library.describe('object.b',{version:'1.0.0'});assert.equal(manifest.dependencies[0].asset_id,'object.a');
  const lock=await library.resolve('object.b');assert.equal(lock.assets.length,2);
  assert.equal(requests.some(url=>new URL(url).pathname.startsWith('/artifacts/')),false);
  const materialized=await materializeAssets(lock,{client:library.client,cacheRoot:path.join(f.root,'cache')});
  assert.equal(Object.keys(materialized.files).length,1);
  const bytes=await library.bytes(manifest.resources[0]);assert.equal(new TextDecoder().decode(bytes),'tiny model bytes');
  for(const route of ['viewer/index.html','viewer/app.mjs','client/asset-library.mjs','subjects/object.a/asset.json','shared/model.glb','intake/private.fbx','catalog/index.json','tools/core.mjs','client/materialize.mjs','client/viewer-files.json'])assert.equal((await fetch(base+route)).status,404,route);
});

test('editable libraries are not accepted as serving roots',t=>{
  const f=fixture(t);assert.throws(()=>createServer(f.root),/ASSET_PUBLICATION_REQUIRED/);
});
