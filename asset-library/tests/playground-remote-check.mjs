import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {ROOT,write,sha256} from '../tools/core.mjs';
const require=createRequire(path.join(path.resolve(process.argv[2]),'package.json')),{chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],failed=[],delivered=[];
const base='http://127.0.0.1:5199/',library='http://127.0.0.1:3188/';
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});if(r.url().startsWith(base+'assets/')&&/\.(glb|png)(\?|$)/.test(r.url()))delivered.push({url:r.url(),status:r.status()});});
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>!!window.playground?.inspectCamera,undefined,{timeout:60000});
 await page.waitForTimeout(1000);const body=await page.locator('body').innerText();assert.ok(!body.includes('资源加载失败'));
 const catalog=await(await fetch(library+'dist/whitebox/asset-catalog.json')).json();
 const definitions=await(await fetch(base+'asset-definitions.json')).json();
 const checked=[];
 for(const id of ['humanoid.uefn-mannequin','creature.horse','creature.dragon.d01']){
  const source=catalog.assets.find(a=>a.id===id),asset=definitions.assets.find(a=>a.id===id);assert.ok(asset,id);assert.equal(asset.sha256,source.sha256);
  const urls=[asset,...asset.resources??[]].map(r=>new URL(r.uri,base).href);
  assert.ok(delivered.some(r=>urls.includes(r.url)),id+' loads through verified delivery');
  const bytes=Buffer.from(await(await fetch(new URL(asset.uri,base))).arrayBuffer());assert.equal(sha256(bytes),source.sha256);checked.push({id,sha256:source.sha256,bytes:bytes.length});
 }
 await page.goto(base+'?dragon=D02#/scenes/flying-creature-training',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.playground?.getState().dragonVariant==='D02'&&window.playground.getState().ready,undefined,{timeout:60000});
 const d02=definitions.assets.find(a=>a.id==='creature.dragon.d02');
 const d02Model=d02.resources.find(r=>r.path===d02.integrationMetadata.visual.modelResource);
 assert.ok(delivered.some(r=>r.url===new URL(d02Model.uri,base).href),'D02 uses its catalog model');
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 const camera=await page.evaluate(()=>window.playground.inspectCamera());await page.screenshot({path:path.join(ROOT,'tests/evidence/playground-remote.png')});
 write(path.join(ROOT,'tests/evidence/playground-remote.json'),{passed:true,checked_at:new Date().toISOString(),library,delivery_mode:'Host reads selected HTTP library, verifies hashes, then serves immutable browser payloads',delivered_resources:delivered,checked,errors,failed,camera,scope:'Playground initial scene with remote source selection; gameplay quality not revalidated.'});
 console.log(JSON.stringify({passed:true,deliveredResources:delivered.length,verifiedModels:checked.length,pageErrors:errors.length,httpErrors:failed.length}));
}catch(e){write(path.join(ROOT,'tests/evidence/playground-remote-failure.json'),{passed:false,message:e.message,errors,failed,delivered});throw e;}finally{await browser.close();}
