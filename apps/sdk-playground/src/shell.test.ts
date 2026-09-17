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
   import {controlsFor,systemControlsFor} from '@worldkit/preset-content/ui/shortcuts';
   import {humanoid,createWorld} from '@worldkit/three';
   import {WebGLRenderer} from 'three';
   window.shellRenderCount=0;
   window.shellTest=mountShell(document.body);
   window.mountShellPresentation=async()=>{
    window.shellRenderer=new WebGLRenderer({canvas:document.getElementById('viewport')});
    window.shellWorld=await createWorld({renderer:window.shellRenderer,navigation:false,assetDefinitions:{}});
    window.shellTest.attachViewport(window.shellWorld.createPresentation());
   };
   window.showControls=(subject,overrides={})=>{const bindings=humanoid.createKeyBindings(overrides),controls=controlsFor(subject,bindings);window.shellTest.update({controls,controlGroups:[{title:subject?'载具操作':'人物操作',rows:controls}],system:systemControlsFor(subject,bindings)});window.shellTest.flush();};
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
 afterEach(async()=>{await page?.evaluate(()=>{const w=window as any;w.shellWorld?.dispose();w.shellRenderer?.dispose();w.shellTest?.dispose();});await page?.close();});
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
    w.shellTest.text('stateValue',`Moving ${n}`);
    await new Promise(resolve=>setTimeout(resolve,130));
   }
   return {before,after:w.shellRenderCount};
  });
  expect(await page.locator('.powertrain-hud').innerText()).toContain('10 km/h');
  expect(await page.locator('#fpsReadout').count()).toBe(0);
  expect(await page.getByLabel('场景状态与操作提示',{exact:true}).innerText()).toContain('Moving 10');
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
 it('renders subtype-aware HUD controls and refreshes remapped keys without stale T or F aliases',async()=>{
  await page.evaluate(()=>(window as any).showControls(undefined));
  const onFoot=await page.locator('#shortcutFooter').innerText();
  expect(onFoot).toContain('慢走（不蹲伏）');expect(onFoot).not.toContain('C / Ctrl');
  await page.evaluate(()=>(window as any).showControls({mode:'plane',aircraftSubtype:'pusher'}));
  const footer=page.locator('#shortcutFooter');
  expect(await footer.innerText()).toContain('增加油门 / 减少油门');
  expect(await footer.innerText()).toContain('低头 / 抬头');
  expect(await footer.innerText()).toContain('镜头向上 / 镜头向下');
  expect(await footer.locator('kbd').allTextContents()).not.toEqual(expect.arrayContaining(['Z','X']));
  expect(await footer.locator('kbd').allTextContents()).toContain('V');
  expect(await footer.locator('kbd').allTextContents()).not.toContain('T');
  await page.evaluate(()=>(window as any).showControls({mode:'plane',aircraftSubtype:'pusher'},{forward:['KeyI'],backward:['KeyK'],interact:['KeyJ'],cameraToggle:['KeyT']}));
  const keys=await footer.locator('kbd').allTextContents();
  expect(keys).toEqual(expect.arrayContaining(['I','K','J','T']));
  expect(keys).not.toEqual(expect.arrayContaining(['W','S','F','V']));
  await page.evaluate(()=>(window as any).showControls({mode:'plane',aircraftSubtype:'balloon'}));
  expect(await footer.innerText()).toContain('放热下降');
  expect(await footer.innerText()).not.toContain('增加油门');
 });
 it('renders separate recording and snapshot controls, reset confirmation and isolated timer updates',async()=>{
  page.setDefaultTimeout(4000);
  // The fixture bundles JS only; use the same hit-testing rule as workspace.css.
  await page.addStyleTag({content:'.recording-tools {pointer-events:auto}'});
  await page.evaluate(()=>{
   const w=window as any,s=w.shellTest;w.recordingActions=[];
   s.update({debugRecording:{busy:false,confirmStart:false,recordLabel:'开始录制',recording:false,saved:false,elapsedSeconds:0,maximumSeconds:120,status:'完整录制包含起点和操作轨迹',error:'',historyEnabled:false,hasFrame:false}});
   for(const id of ['debugRecordButton','debugRecordingStart','debugRecordingCancel','debugSnapshotButton'])s.on(id,()=>{w.recordingActions.push(id);if(id==='debugRecordButton')s.update({debugRecording:{...s.get().debugRecording,confirmStart:true}});if(id==='debugRecordingCancel')s.update({debugRecording:{...s.get().debugRecording,confirmStart:false}});});s.flush();
  });
  expect(await page.getByRole('button',{name:'开启快照缓存',exact:true}).isEnabled()).toBe(true);
  expect(await page.getByLabel('录制状态').count()).toBe(0);
  await page.getByRole('button',{name:'开始录制',exact:true}).click();
  expect(await page.getByRole('dialog').innerText()).toContain('将重置场景中的车辆和物件');
  await page.getByRole('button',{name:'取消',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).recordingActions)).toEqual(['debugRecordButton','debugRecordingCancel']);
  const counts=await page.evaluate(()=>{
   const w=window as any,s=w.shellTest,before=w.shellRenderCount;
   s.update({debugRecording:{...s.get().debugRecording,recordLabel:'停止并保存',recording:true,elapsedSeconds:61,historyEnabled:true,hasFrame:false}});s.flush();
   return {before,after:w.shellRenderCount};
  });
  expect(counts.after).toBe(counts.before);expect(await page.getByLabel('录制状态').innerText()).toContain('01:01 / 02:00');
  expect(await page.getByRole('button',{name:'停止并保存',exact:true}).isEnabled()).toBe(true);
  expect(await page.getByRole('button',{name:'保存现场快照',exact:true}).isEnabled()).toBe(false);
  await page.addStyleTag({content:'.workspace-pause-status {pointer-events:auto}'});
  await page.evaluate(()=>{
   const s=(window as any).shellTest;s.flag('loading',false);s.flag('paused',true);
   s.on('resumeButton',()=>s.flag('paused',false));s.flush();
  });
  expect(await page.getByLabel('场景暂停提示').innerText()).toContain('场景已暂停');
  expect(await page.getByRole('dialog').count()).toBe(0);
  await page.getByLabel('场景暂停提示').getByRole('button',{name:'继续游玩',exact:true}).click();
  expect(await page.getByLabel('场景暂停提示').count()).toBe(0);
 });
 it.each(['floating','pinned','collapsed'])('keeps pause controls inside the real canvas with %s shortcuts in a short viewport',async controlsLayout=>{
  page.setDefaultTimeout(4000);
  await page.setViewportSize({width:720,height:500});
  await page.addStyleTag({path:'apps/sdk-playground/src/styles/workspace.css'});
  await page.evaluate(async layout=>{
   const w=window as any,s=w.shellTest;
   w.showControls(undefined);s.update({controlsLayout:layout});
   s.flag('loading',false);s.flag('paused',true);s.flag('inspectorClosed',true);
   s.on('resumeButton',()=>s.flag('paused',false));s.flush();
   const footer=document.getElementById('shortcutFooter')!;
   document.documentElement.style.setProperty('--footer',`${footer.offsetHeight}px`);
   // Use the SDK's actual clipped presentation and canvas-relative UI mount.
   await w.mountShellPresentation();
  },controlsLayout);
  const bounds=await page.evaluate(()=>{
   const stage=document.getElementById('stage')!.getBoundingClientRect();
   const footer=document.getElementById('shortcutFooter')!;
   const pause=document.querySelector('.workspace-pause-status')!.getBoundingClientRect();
   return {stage:stage.toJSON(),pause:pause.toJSON(),bottomLimit:footer.offsetHeight?footer.getBoundingClientRect().top:stage.bottom};
  });
  expect(bounds.pause.top).toBeGreaterThanOrEqual(bounds.stage.top);
  expect(bounds.pause.bottom).toBeLessThanOrEqual(bounds.stage.bottom);
  expect(bounds.bottomLimit-bounds.pause.bottom).toBeGreaterThanOrEqual(8);
  expect(bounds.bottomLimit-bounds.pause.bottom).toBeLessThanOrEqual(32);
  await page.getByLabel('场景暂停提示').getByRole('button',{name:'继续游玩',exact:true}).click();
  expect(await page.getByLabel('场景暂停提示').count()).toBe(0);
 });
});
