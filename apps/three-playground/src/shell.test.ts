import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import type {Browser,Page} from 'playwright';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {launchChromiumWithSystemFallback} from '../../../scripts/lib/playwright-browser-launch';

describe('Shell render isolation',()=>{
 let browser:Browser,page:Page,script:string;
 beforeAll(async()=>{
  const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
   import {mountShell} from './apps/three-playground/src/shell.tsx';
   window.shellRenderCount=0;
   window.shellTest=mountShell(document.body);
  `},plugins:[{name:'count-shell-renders',setup(builder){
   // Count the actual component invocation, not DOM mutations (React can render
   // without changing the DOM). Instrument only this test bundle.
   builder.onLoad({filter:/[\\/]shell\.tsx$/},async({path})=>({
    contents:(await readFile(path,'utf8')).replace('function Shell() {','function Shell() { window.shellRenderCount++;'),loader:'tsx',
   }));
  }}],nodePaths:[`${process.cwd()}/apps/three-playground/node_modules`],bundle:true,jsx:'automatic',write:false,outdir:'shell-test',format:'iife',platform:'browser',logLevel:'silent'});
  script=bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text;
  browser=await launchChromiumWithSystemFallback();
 },60000);
 beforeEach(async()=>{
  page=await browser.newPage();await page.setContent('<html><body></body></html>');
  await page.addScriptTag({content:script});
  await page.waitForFunction(()=>(window as any).shellRenderCount>0);
  await page.evaluate(()=>{const s=(window as any).shellTest;s.attachViewport({ui:{mount:(node:HTMLElement)=>document.body.append(node)}});s.update({controls:[['W','Forward']],system:[['Esc','Pause']]});s.flush();});
 });
 afterEach(async()=>{await page?.evaluate(()=>(window as any).shellTest?.dispose());await page?.close();});
 afterAll(async()=>{await browser?.close();});
 it('keeps the layout idle for fresh equal shortcut arrays while telemetry still renders',async()=>{
  const counts=await page.evaluate(async()=>{
   const w=window as any,before=w.shellRenderCount;
   for(let n=1;n<=10;n++){
    w.shellTest.update({controls:[['W','Forward']],system:[['Esc','Pause']],drivetrain:{kind:'engine',gear:'D',rpm:1000+n,maxRpm:6000,cadence:0,speed:n,throttle:n,shifting:false}});
    w.shellTest.text('stateValue',`Moving ${n}`);w.shellTest.text('fpsReadout',`FPS ${n}`);
    await new Promise(resolve=>setTimeout(resolve,130));
   }
   return {before,after:w.shellRenderCount};
  });
  expect(await page.locator('.powertrain-hud').innerText()).toContain('10 km/h');
  expect(await page.locator('#fpsReadout').innerText()).toBe('FPS 10');
  expect(await page.locator('.stage-bar').innerText()).toContain('Moving 10');
  expect(counts.after).toBe(counts.before);
 });
 it('refreshes real key, label, order and length edits, including reused input arrays',async()=>{
  const counts=await page.evaluate(()=>{
   const w=window as any,s=w.shellTest,counts=[w.shellRenderCount];
   const controls=[['ArrowUp','Forward'],['S','Reverse']];
   s.update({controls});s.flush();counts.push(w.shellRenderCount);
   controls[0]![1]='Go';s.update({controls});s.flush();counts.push(w.shellRenderCount);
   controls.reverse();s.update({controls});s.flush();counts.push(w.shellRenderCount);
   controls.pop();s.update({controls});s.flush();counts.push(w.shellRenderCount);
   s.update({system:[['Escape','Pause now']]});s.flush();counts.push(w.shellRenderCount);
   return counts;
  });
  for(let n=1;n<counts.length;n++)expect(counts[n]).toBeGreaterThan(counts[n-1]!);
  expect(await page.locator('body').innerText()).toContain('Pause now');
 });
});
