import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {ROOT,write} from '../tools/core.mjs';
import {AssetLibrary} from '../client/asset-library.mjs';

const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const require=createRequire(path.join(option('--dependencies',path.join(ROOT,'..')),'package.json')),{chromium}=require('playwright');
const base=option('--url','http://127.0.0.1:3188/'),library=new AssetLibrary(base),subjects=[];
let cursor;
do{const page=await library.search('',{limit:20,...(cursor?{cursor}:{})});subjects.push(...page.items);cursor=page.next_cursor;}while(cursor);
const manifests=[];for(const subject of subjects)manifests.push(await library.describe(subject.asset_id,{version:subject.version}));
const models=manifests.filter(m=>m.model_resource_id);
assert.equal(models.length,Number(option('--expected-models','54')));
const evidence=path.resolve(option('--evidence',path.join(ROOT,'tests/evidence')));fs.mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],responses=[],warnings=[],requests=[];
const report={checked_at:new Date().toISOString(),source:'published Registry / real Chrome / verified Three.js preview',snapshot_id:(await library.client.descriptor()).snapshot_id,models:[],interactions:{},page_errors:errors,http_errors:responses};
try{
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['warning','error'].includes(message.type()))warnings.push(message.text());});page.on('response',response=>{if(response.status()>=400)responses.push({url:response.url(),status:response.status()});});page.on('request',request=>requests.push(request.url()));
  await page.goto(base);await page.waitForSelector('.card');assert.equal(await page.locator('.card').count(),20);
  assert.equal(await page.locator('#loadMore').isVisible(),true);await page.locator('#loadMore').click();await page.waitForFunction(()=>document.querySelectorAll('.card').length===40);report.interactions.pagination=true;
  await page.locator('#search').fill('creature.horse');await page.waitForFunction(()=>document.querySelectorAll('.card').length===1&&document.querySelector('.card').dataset.id==='creature.horse');
  await page.locator('#search').fill('');await page.locator('[data-group=robots]').click();await page.waitForFunction(()=>document.querySelectorAll('.card').length===2);await page.locator('[data-group=all]').click();await page.waitForFunction(()=>document.querySelectorAll('.card').length===20);
  const modelHashes=new Set(models.map(m=>m.resources.find(r=>r.resource_id===m.model_resource_id).sha256));
  assert.equal(requests.some(url=>new URL(url).pathname.startsWith('/artifacts/')&&modelHashes.has(new URL(url).pathname.split('/').at(-1))),false,'browsing metadata must not download model bytes');report.interactions.metadata_without_models=true;
  for(const manifest of models){
    await page.evaluate(id=>window.assetPreview.open(id),manifest.asset_id);await page.waitForFunction(()=>window.assetPreview.ready||window.assetPreview.error);
    const stats=await page.evaluate(()=>window.assetPreview.stats());assert.equal(stats.error,null,manifest.asset_id);assert.ok(stats.meshes>0,manifest.asset_id+' no meshes');report.models.push({...stats,clipNames:undefined});
    if(report.models.length%8===0)console.log(`Previewed ${report.models.length} / ${models.length}`);
  }
  await page.evaluate(()=>window.assetPreview.open('creature.horse'));await page.locator('#skeleton').check();assert.equal((await page.evaluate(()=>window.assetPreview.stats())).skeleton,true);
  const walkIndex=await page.locator('#clipSelect option').evaluateAll(options=>options.findIndex(option=>/^Walk /.test(option.textContent)));assert.ok(walkIndex>=0);await page.locator('#clipSelect').selectOption(String(walkIndex));await page.waitForTimeout(350);const first=(await page.evaluate(()=>window.assetPreview.stats())).time;await page.waitForTimeout(350);assert.notEqual((await page.evaluate(()=>window.assetPreview.stats())).time,first);report.interactions.animation_advances=true;
  await page.locator('#playPause').click();const paused=(await page.evaluate(()=>window.assetPreview.stats())).time;await page.waitForTimeout(150);assert.equal((await page.evaluate(()=>window.assetPreview.stats())).time,paused);report.interactions.pause=true;
  await page.locator('#timeline').fill('0.2');assert.ok(Math.abs((await page.evaluate(()=>window.assetPreview.stats())).time-.2)<.01);report.interactions.scrub=true;report.interactions.skeleton=true;
  await page.locator('[data-tab=rig]').click();assert.ok(await page.locator('[data-bone]').count()>0);await page.locator('[data-bone]').first().click();await page.screenshot({path:path.join(evidence,'registry-horse-skeleton.png')});
  await page.locator('[data-tab=engine]').click();assert.match(await page.locator('#inspectorContent').innerText(),/未连接/);assert.match(await page.locator('#inspectorContent').innerText(),/引擎/);report.interactions.engine_ownership=true;await page.screenshot({path:path.join(evidence,'registry-engine-disconnected.png')});
  await page.evaluate(()=>window.assetPreview.open('humanoid.uefn-mannequin'));const external=await page.locator('#clipSelect option').evaluateAll(options=>options.findIndex(option=>option.textContent.includes('独立资源')&&option.textContent.startsWith('roll ')));assert.ok(external>=0);await page.locator('#clipSelect').selectOption(String(external));await page.waitForFunction(()=>!document.getElementById('playbackNote').textContent.includes('正在读取'));assert.ok(!(await page.locator('#playbackNote').innerText()).includes('失败'));report.interactions.external_clip=true;await page.screenshot({path:path.join(evidence,'registry-humanoid-animation.png')});
  await page.evaluate(()=>window.assetPreview.open('creature.dragon.d01'));await page.screenshot({path:path.join(evidence,'registry-dragon-preview.png')});
  await page.evaluate(()=>window.assetPreview.open('robot.dog-placeholder'));assert.equal((await page.evaluate(()=>window.assetPreview.stats())).meshes,0);assert.ok(await page.locator('#clipSelect').isDisabled());report.interactions.placeholder=true;
  await page.locator('#closeDetail').click();await page.reload();await page.waitForSelector('.card');
  const thumbnailCount=subjects.slice(0,20).filter(s=>s.preview?.mime_type.startsWith('image/')).length;
  await page.waitForFunction(count=>document.querySelectorAll('.card img').length===count&&[...document.querySelectorAll('.card img')].every(image=>image.complete&&image.naturalWidth>0),thumbnailCount);report.interactions.verified_thumbnails=true;
  await page.screenshot({path:path.join(evidence,'registry-dashboard-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(evidence,'registry-dashboard-mobile.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);report.interactions.mobile_no_overflow=true;
  assert.equal(requests.some(url=>/\/(subjects|shared|catalog|dist)\//.test(new URL(url).pathname)),false,'viewer must not request authoring paths');
  assert.ok(requests.filter(url=>new URL(url).pathname==='/v1/assets').every(url=>Number(new URL(url).searchParams.get('limit'))<=20));
  report.warnings=[...new Set(warnings)];write(path.join(evidence,'browser-registry.json'),report);assert.deepEqual(errors,[]);assert.deepEqual(responses,[]);console.log(JSON.stringify({models:report.models.length,interactions:report.interactions,errors:errors.length,http_errors:responses.length,warnings:report.warnings.length}));
}catch(error){write(path.join(evidence,'browser-registry-failure.json'),{message:error.message,errors,responses,warnings:[...new Set(warnings)],models:report.models});throw error;}finally{await browser.close();}
