import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { launchChromiumWithSystemFallback } from '../../../scripts/lib/playwright-browser-launch.js';

// Real WebGL/DOM/MediaStream and SDK physics; no model provider or fake simulation.
describe('independent UI and clean model input',()=>{
 let browser:Browser;let page:Page;let script:string;
 beforeAll(async()=>{
  const result=await build({entryPoints:['packages/three-world/test-fixtures/presentation.ts'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',logLevel:'silent'});
  script=result.outputFiles[0]!.text;browser=await launchChromiumWithSystemFallback();
 },60000);
 beforeEach(async()=>{
  page=await browser.newPage({viewport:{width:1000,height:780}});
  await page.route('http://worldkit.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('http://worldkit.test/');
  const failure=new Promise<never>((_,reject)=>page.once('pageerror',reject));
  await page.addScriptTag({content:script});
  await Promise.race([failure,page.waitForFunction('!!window.presentationFixture',{},{timeout:15000})]);
 });
 afterEach(async()=>{if(page){await page.evaluate('window.presentationFixture?.dispose()');await page.close();}});
 afterAll(async()=>{await browser?.close();});
 const evaluate=(source:string):Promise<any>=>page.evaluate(`(async()=>{const f=window.presentationFixture;${source}})()`);
 it('exposes the same live presentation to the host and follows dispose/recreation without stale handles',async()=>{
  const result=await evaluate(`const observer=window.__WORLDKIT_EVAL__;const same=observer.presentation===f.presentation;
   f.presentation.dispose();const absent=observer.presentation===undefined;const replacement=f.recreate();
   return {same,absent,replaced:observer.presentation===replacement};`);
  expect(result).toEqual({same:true,absent:true,replaced:true});
 });
 it('captures clean pixels on HTTP, without UI or displayed model feedback, and never advances the tick',async()=>{
  const data=await evaluate(`f.world.stop();const tick=f.world.simulationTick;const packet=await f.capture();
   const read=image=>{const c=document.createElement('canvas');c.width=800;c.height=450;const x=c.getContext('2d');x.drawImage(image,0,0);const a=x.getImageData(30,30,1,1).data;return [...a];};
   const before=read(packet.image);f.presentation.output.presentFrame({image:f.output,source:packet.source});const next=await f.capture();
   return {tick,after:f.world.simulationTick,before,next:read(next.image),status:f.presentation.status(),keys:Object.keys(packet),sourceKeys:Object.keys(packet.source)};`);
  expect(data.after).toBe(data.tick);expect(data.before).toEqual(data.next);expect(data.before.slice(0,3)).toEqual([108,154,172]);
  expect(data.status).toMatchObject({mode:'frame',synchronization:'mapped'});expect(data.keys.sort()).toEqual(['image','source']);expect(data.sourceKeys).not.toContain('values');
  expect(await page.locator('#hud').isVisible()).toBe(true);
  const evidence=process.env.WORLDKIT_UI_EVIDENCE_DIR;
  if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,'model-output-with-ui.png')});
   const png=await evaluate(`const c=document.createElement('canvas');c.width=800;c.height=450;c.getContext('2d').drawImage(f.packets[0].image,0,0);return c.toDataURL();`);
   await writeFile(path.join(evidence,'clean-world-input.png'),Buffer.from(png.split(',')[1],'base64'));
   await evaluate('f.presentation.output.showWorld();');await page.screenshot({path:path.join(evidence,'world-with-ui.png')});}
 });
 it('records Episode PNG/JPEG only from the original world renderer while DOM UI, a first UI canvas and model output are visible',async()=>{
  const data=await evaluate(`f.world.stop();const episode=window.__WORLDKIT_EVAL__.episode;
   await episode.prepareSegment({positionWorldMetersXYZ:[2,0,2],facingYawRadians:.4},{widthPixels:800,heightPixels:450});
   const tick=f.world.simulationTick;const cleanPng=episode.frame('image/png');const cleanJpeg=episode.frame('image/jpeg');
   const overlay=document.createElement('canvas');overlay.id='independent-ui-canvas';overlay.width=220;overlay.height=80;
   overlay.style.cssText='position:fixed;left:10px;top:10px;width:220px;height:80px;z-index:99999';
   const ctx=overlay.getContext('2d');ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,220,80);ctx.fillStyle='#000';ctx.font='bold 18px sans-serif';ctx.fillText('UI CANVAS ONLY',20,50);document.body.prepend(overlay);
   const packet=await f.capture();f.presentation.output.presentFrame({image:f.output,source:packet.source});
   const png=episode.frame('image/png'),jpeg=episode.frame('image/jpeg');const status=f.presentation.status();
   return {tick,after:f.world.simulationTick,cleanPng:cleanPng.imageDataUrl,cleanJpeg:cleanJpeg.imageDataUrl,png:png.imageDataUrl,jpeg:jpeg.imageDataUrl,
    pngSurface:png.captureSurface,jpegSurface:jpeg.captureSurface,status,firstCanvasIsUI:document.querySelector('canvas')===overlay,
    inputCanvasIsOriginal:window.__WORLDKIT_EVAL__.renderer.domElement===f.canvas};`);
  expect(data.png).toBe(data.cleanPng);expect(data.jpeg).toBe(data.cleanJpeg);expect(data.after).toBe(data.tick);
  expect(data.pngSurface).toBe('world-renderer-canvas');expect(data.jpegSurface).toBe('world-renderer-canvas');expect(data.firstCanvasIsUI).toBe(true);expect(data.inputCanvasIsOriginal).toBe(true);
  expect(data.status).toMatchObject({mode:'frame',synchronization:'mapped'});expect(await page.locator('#hud').isVisible()).toBe(true);
  const pageImage=await page.screenshot();const uiPixel=await sharp(pageImage).extract({left:20,top:20,width:1,height:1}).removeAlpha().raw().toBuffer();expect([...uiPixel]).toEqual([255,0,255]);
  const png=Buffer.from(data.png.split(',')[1],'base64'),jpeg=Buffer.from(data.jpeg.split(',')[1],'base64');
  const pngMetadata=await sharp(png).metadata(),jpegMetadata=await sharp(jpeg).metadata();expect([pngMetadata.width,pngMetadata.height,jpegMetadata.width,jpegMetadata.height]).toEqual([800,450,800,450]);
  const evidence=process.env.WORLDKIT_UI_EVIDENCE_DIR;
  if(evidence){await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,'episode-page-with-dom-ui-canvas-and-model-output.png'),pageImage);
   await writeFile(path.join(evidence,'episode-clean-world.png'),png);await writeFile(path.join(evidence,'episode-clean-world.jpg'),jpeg);
   await writeFile(path.join(evidence,'episode-clean-capture-evidence.json'),JSON.stringify({captureSurface:data.pngSurface,simulationTick:data.tick,afterTick:data.after,
    cleanPngEqualsEpisodePng:data.png===data.cleanPng,cleanJpegEqualsEpisodeJpeg:data.jpeg===data.cleanJpeg,firstCanvasIsUI:data.firstCanvasIsUI,inputCanvasIsOriginal:data.inputCanvasIsOriginal,uiPixel:[...uiPixel],status:data.status,
    pngSha256:createHash('sha256').update(png).digest('hex'),jpegSha256:createHash('sha256').update(jpeg).digest('hex')},null,2));}
  await evaluate('window.__WORLDKIT_EVAL__.episode.release();');
 });
 it('displays captured HUD/anchor state while immediate controls read current state, and rejects missing or stale frames',async()=>{
  const result=await evaluate(`f.world.stop();const a=await f.capture();const anchor=f.anchor.style.left;f.health.set(60);
   await f.world.execute({type:'entity.set-position',entityId:'hero',positionWorldMetersXYZ:[3,0,0]});f.world.render();
   f.presentation.output.presentFrame({source:a.source,image:f.output});await Promise.resolve();
   const captured={hud:f.hud.textContent,live:f.live.textContent,anchor:f.anchor.style.left,expectedAnchor:anchor};
   const wrong=document.createElement('canvas');wrong.width=400;wrong.height=400;let aspect='';try{f.presentation.output.presentFrame({source:a.source,image:wrong})}catch(e){aspect=e.message}
   const b=await f.capture();f.presentation.output.presentFrame({source:b.source,image:f.output});
   let old='';try{f.presentation.output.presentFrame({source:a.source,image:f.output})}catch(e){old=e.message}
   const c=await f.capture();const d=await f.capture();let expired='';try{f.presentation.output.presentFrame({source:a.source,image:f.output})}catch(e){expired=e.message}
   const count=f.presentation.status().historyFrames;await f.world.reset();let reset='';try{f.presentation.output.presentFrame({source:d.source,image:f.output})}catch(e){reset=e.message}
   return {captured,aspect,old,expired,count,reset,status:f.presentation.status(),hud:f.hud.textContent};`);
  expect(result.captured).toMatchObject({hud:'生命 100 · UI ONLY',live:'即时状态 60'});expect(result.captured.anchor).toBe(result.captured.expectedAnchor);
  expect(result.aspect).toContain('ASPECT');
  expect(result.old).toContain('STALE');expect(result.expired).toContain('STALE');expect(result.reset).toContain('STALE');expect(result.count).toBe(3);
  expect(result.status).toMatchObject({mode:'world',synchronization:'live',epoch:1,historyFrames:0});expect(result.hud).toBe('生命 100 · UI ONLY');
 });
 it('streams only raw canvas pixels, keeps simulation live behind video, and preserves external track ownership',async()=>{
  await evaluate(`f.streamStartTick=f.world.simulationTick;f.sourceStream=f.presentation.modelInput.createStream({framesPerSecond:30});
   f.external=f.makeOutputStream();f.presentation.output.attachStream(f.external);`);
  await page.waitForFunction(`document.querySelector('[data-worldkit-output="video"]').readyState>=2`);
  await expect.poll(()=>evaluate('return f.world.simulationTick>f.streamStartTick;')).toBe(true);
  const data=await evaluate(`const v=document.createElement('video');v.muted=true;v.srcObject=f.sourceStream.stream;await v.play();
   const c=document.createElement('canvas');c.width=800;c.height=450;const ctx=c.getContext('2d');ctx.drawImage(v,0,0);const pixel=[...ctx.getImageData(30,30,1,1).data];
   const running=f.world.isRunning&&f.world.simulationTick>f.streamStartTick;v.pause();v.srcObject=null;
   const state={status:f.presentation.status(),hidden:f.hud.hidden,anchorHidden:f.anchor.hidden,liveHidden:f.live.hidden};
   f.presentation.dispose();return {pixel,running,state,inputTrack:f.sourceStream.stream.getTracks()[0].readyState,externalTrack:f.external.getTracks()[0].readyState};`);
  expect(data.pixel.slice(0,3)).toEqual([108,154,172]);expect(data.pixel.slice(0,3)).not.toEqual([21,55,92]);expect(data.running).toBe(true);
  expect(data.state).toMatchObject({status:{mode:'video',synchronization:'unmapped'},hidden:true,anchorHidden:true,liveHidden:false});
  expect(data.inputTrack).toBe('ended');expect(data.externalTrack).toBe('live');await evaluate('f.external.getTracks().forEach(t=>t.stop());');
 });
 it('uses explicit service mappings for video and hides newly bound or unmapped UI instead of using newest world state',async()=>{
  await evaluate(`f.world.stop();const packet=await f.capture();f.health.set(7);f.external=f.makeOutputStream();
   f.mapping=packet.source;f.presentation.output.attachStream(f.external,{resolveSourceFrame:()=>f.mapping});`);
  await expect.poll(()=>evaluate('return f.presentation.status().synchronization;')).toBe('mapped');
  expect(await page.locator('#hud').textContent()).toBe('生命 100 · UI ONLY');
  await evaluate(`f.mapping=null;f.output.getContext('2d').fillRect(0,0,1,1);`);
  await expect.poll(()=>evaluate('return f.hud.hidden;')).toBe(true);
  await evaluate('f.external.getTracks().forEach(t=>t.stop());');
 });
 it('routes controls through video, releases held movement on prompt focus, and restores original DOM/lifetimes',async()=>{
  await page.locator('#stream').click();await page.locator('[data-worldkit-surface]').click({position:{x:650,y:300}});
  await page.keyboard.down('w');await page.keyboard.down('Shift');
  const start=await evaluate('return f.world.getEntityState("hero").positionWorldMetersXYZ;');
  await expect.poll(()=>evaluate('return f.world.getEntityState("hero").positionWorldMetersXYZ;')).not.toEqual(start);
  await page.locator('#prompt').focus();await page.keyboard.up('w');await page.keyboard.up('Shift');
  await page.keyboard.type('wasdr');expect(await page.locator('#prompt').inputValue()).toBe('wasdr');
  const result=await evaluate(`f.world.stop();const p=f.world.getEntityState('hero').positionWorldMetersXYZ;const before=f.world.simulationTick;
   f.world.step({},1);const clean=f.presentation.modelInput.createStream();const parent=f.canvas.parentElement;f.presentation.dispose();f.presentation.dispose();
   const presentation=f.world.createPresentation();presentation.dispose();return {position:p,epoch:f.presentation.status().epoch,stages:document.querySelectorAll('[data-worldkit-presentation]').length,parentSame:f.canvas.parentElement===parent,fit:f.canvas.style.objectFit,track:clean.stream.getTracks()[0].readyState};`);
  expect(result).toMatchObject({epoch:0,stages:0,parentSame:true,fit:'',track:'ended'});
 });
 it('isolates throwing UI callbacks, freezes asynchronous captures across reset, and projects anchors into letterboxed space',async()=>{
  const data=await evaluate(`f.world.stop();const element=document.createElement('span');f.presentation.ui.bind({id:'bad',element,read:()=>{throw new Error('UI_ONLY_FAILURE')},render:()=>{}});
   const before=f.world.snapshot().errors;f.world.render();const pending=f.capture();await f.world.reset();let stale='';try{await pending}catch(e){stale=e.message}
   f.canvas.style.height='600px';f.canvas.parentElement.style.height='600px';f.world.render();
   const rect=f.canvas.getBoundingClientRect();const top=parseFloat(f.anchor.style.top);const projected=f.hero.localToWorld(new THREE.Vector3(0,2.1,0)).project(f.camera);
   return {before,errors:f.world.snapshot().errors,hidden:element.hidden,stale,top,expected:75+(1-projected.y)/2*450,lastError:f.presentation.status().lastError};` .replace('new THREE.Vector3(0,2.1,0)','f.hero.position.clone().set(0,2.1,0)'));
  expect(data.errors).toEqual(data.before);expect(data.hidden).toBe(true);expect(data.stale).toContain('STALE_CAPTURE');expect(data.top).toBeCloseTo(data.expected,3);expect(data.lastError).toBe('UI_ONLY_FAILURE');
 });
});
