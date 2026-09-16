import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import type {Browser,Page} from 'playwright';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';

describe('Shell render isolation',()=>{
 let browser:Browser,page:Page,script:string;
 beforeAll(async()=>{
  const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
   import {mountShell} from './apps/sdk-playground/src/shell.tsx';
   window.shellRenderCount=0;
   window.shellTest=mountShell(document.body);
  `},plugins:[{name:'count-shell-renders',setup(builder){
   // Count the actual component invocation, not DOM mutations (React can render
   // without changing the DOM). Instrument only this test bundle.
   builder.onLoad({filter:/[\\/]shell\.tsx$/},async({path})=>({
    contents:(await readFile(path,'utf8')).replace('function Shell() {','function Shell() { window.shellRenderCount++;'),loader:'tsx',
   }));
  }}],nodePaths:[`${process.cwd()}/apps/sdk-playground/node_modules`],bundle:true,jsx:'automatic',write:false,outdir:'shell-test',format:'iife',platform:'browser',logLevel:'silent'});
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
 it('preserves other display sections through the shell while resetting helpers and picture',async()=>{
  page.setDefaultTimeout(4000);
  await page.addStyleTag({content: '.react-viewport-ui button,.react-viewport-ui input {pointer-events:auto} .display-panel {max-height:80vh;overflow:auto}'});
  await page.evaluate(()=>{const s=(window as any).shellTest;s.update({displayAvailable:{anchors:true,climbSurfaces:true,water:true,physics:true,unmappedColliders:0},displayRows:[{id:'item',name:'检查对象',type:'vehicle',available:true,hasCollider:true}]});s.on('displayChange',(value:string)=>s.update({display:JSON.parse(value)}));s.flush();});
  await page.getByRole('button',{name:'画面设置',exact:true}).click();
  await page.getByRole('radio',{name:'深度图',exact:true}).check();
  await page.getByRole('spinbutton',{name:'深度远端 / 米'}).fill('25');
  await page.getByRole('button',{name:'关闭画面设置',exact:true}).click();
  await page.getByRole('button',{name:'显示检查',exact:true}).click();
  await page.getByRole('checkbox',{name:'选择 检查对象',exact:true}).check();
  await page.getByRole('radio',{name:'选中对象',exact:true}).check();
  await page.getByRole('tab',{name:/辅助/}).click();
  await page.getByRole('checkbox',{name:'交互锚点',exact:true}).check();
  expect(await page.evaluate(()=>(window as any).shellTest.get().display)).toMatchObject({mode:'depth',depthFar:25,scope:'selected',anchors:true,selectedIds:['item']});
  await page.getByRole('button',{name:'重置辅助',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).shellTest.get().display)).toMatchObject({mode:'depth',scope:'selected',anchors:false});
  await page.getByRole('button',{name:'关闭显示检查',exact:true}).click();
  await page.getByRole('button',{name:'画面设置',exact:true}).click();
  await page.getByRole('button',{name:'重置画面',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).shellTest.get().display)).toMatchObject({mode:'material',scope:'selected',selectedIds:['item']});
 },20000);
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
  expect(await page.locator('.workspace-statusbar').innerText()).toContain('Moving 10');
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
