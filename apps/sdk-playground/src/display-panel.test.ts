import {build} from 'esbuild';
import {createServer} from 'vite';
import tailwind from '@tailwindcss/vite';
import type {Browser,Page} from 'playwright';
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';

describe('Display picture and inspector controls',()=>{
 let browser:Browser,page:Page,script:string,css:string;
 beforeAll(async()=>{
  const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
   import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
   import {DisplayPanel} from './apps/sdk-playground/src/display-panel.tsx';
   import {defaultDisplaySettings} from './apps/sdk-playground/src/display-settings.ts';
   import './apps/sdk-playground/src/styles/workspace.css';
   const rows=[{id:'hero',name:'测试人物',type:'person',available:true,hasCollider:true},{id:'wall',name:'测试墙体',type:'environment',available:true,hasCollider:true},{id:'step',parentId:'wall',name:'附属台阶',type:'environment',available:true,hasCollider:false}];
   window.escaped=0;document.addEventListener('keydown',e=>{if(e.key==='Escape')window.escaped++;});
   function Harness(){const [s,set]=useState(defaultDisplaySettings()),[open,setOpen]=useState(false),[pinned,setPinned]=useState(false),[objectRows,setRows]=useState(rows),[available,setAvailable]=useState({physics:true,anchors:true,climbSurfaces:false,water:false,unmappedColliders:2});window.displayTest={state:()=>s,set,setRows,setAvailable};return <DisplayPanel settings={s} change={set} open={open} onOpenChange={setOpen} pinned={pinned} onPinnedChange={setPinned} rows={objectRows} available={available}/>;}
   createRoot(document.getElementById('root')).render(<Harness/>);
  `,loader:'tsx'},nodePaths:[`${process.cwd()}/apps/sdk-playground/node_modules`],bundle:true,jsx:'automatic',write:false,outdir:'display-test',format:'iife',platform:'browser',logLevel:'silent'});
  script=bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text;
  // Compile the actual global styles through the same Tailwind plugin as the app.
  // Raw workspace CSS alone misses Dialog's translate utilities and overlay stacking.
  const stylesServer=await createServer({configFile:false,root:`${process.cwd()}/apps/sdk-playground`,plugins:[tailwind()],server:{middlewareMode:true},logLevel:'silent'});
  try {const globalStyles=await stylesServer.transformRequest('/src/styles.css?direct');if(!globalStyles)throw new Error('Global styles did not compile');css=globalStyles.code+'\n'+bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text;}finally{await stylesServer.close();}
  browser=await launchChromiumWithSystemFallback();
 },60000);
 beforeEach(async()=>{page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(3000);await page.setContent('<div id="root" style="position:absolute;top:30px;right:350px;display:flex"></div><div id="displayInspectorHost" style="display:block;position:absolute;right:0;top:80px;width:340px;height:780px"></div>');await page.addStyleTag({content:css});await page.addScriptTag({content:script});});
 afterEach(async()=>{await page?.close();});afterAll(async()=>{await browser?.close();});
 const state=()=>page.evaluate(()=>(window as any).displayTest.state());
 const patch=async(value:Record<string,unknown>)=>{await page.evaluate(value=>{const t=(window as any).displayTest;t.set({...t.state(),...value});},value);};
 it('exposes six single-choice modes with their purpose and depth controls',async()=>{
  await page.getByRole('button',{name:'画面设置',exact:true}).click();
  expect(await page.getByRole('radio').count()).toBe(6);
  expect(await page.getByText('排除材质干扰，检查形状与比例',{exact:true}).isVisible()).toBe(true);
  await page.getByRole('radio',{name:'深度图',exact:true}).check();
  expect(await page.getByText('近黑远白，距离沿相机视线方向计算，单位为米；超出范围的数值截断显示。',{exact:true}).isVisible()).toBe(true);
  await page.getByRole('spinbutton',{name:'深度远端 / 米'}).fill('25');
  expect(await state()).toMatchObject({mode:'depth',depthFar:25});
  await page.keyboard.press('Escape');expect(await page.locator('.display-picture-panel').count()).toBe(0);expect(await page.evaluate(()=>(window as any).escaped)).toBe(0);
 });
 it('distinguishes selection from visibility, groups children and restores isolation',async()=>{
  await page.getByRole('button',{name:'显示检查',exact:true}).click();
  expect(await page.getByRole('radio',{name:'选中对象',exact:true}).isDisabled()).toBe(true);
  await page.getByRole('button',{name:'展开环境对象',exact:true}).click();
  await page.getByRole('checkbox',{name:'选择 测试墙体',exact:true}).check();
  expect(await state()).toMatchObject({selectedIds:['wall'],hiddenIds:[]});
  expect(await page.locator('[data-object-id="step"]').getAttribute('data-parent-id')).toBe('wall');
  await page.getByRole('button',{name:'收起 测试墙体子对象',exact:true}).click();expect(await page.getByRole('checkbox',{name:'选择 附属台阶',exact:true}).count()).toBe(0);
  await page.getByRole('button',{name:'展开 测试墙体子对象',exact:true}).click();expect(await page.getByRole('checkbox',{name:'选择 附属台阶',exact:true}).count()).toBe(1);
  await page.getByRole('button',{name:'隐藏 测试墙体',exact:true}).click();
  expect(await state()).toMatchObject({selectedIds:['wall'],hiddenIds:['wall']});
  expect(await page.getByRole('button',{name:'显示 附属台阶',exact:true}).isVisible()).toBe(true);
  await page.getByRole('button',{name:'显示 附属台阶',exact:true}).click();expect((await state()).hiddenIds).toEqual([]);
  await page.getByRole('button',{name:'隐藏 测试墙体',exact:true}).click();
  await page.getByRole('button',{name:'隔离选中对象',exact:true}).click();
  expect(await state()).toMatchObject({scope:'selected',hiddenIds:[]});
  await page.getByRole('button',{name:'退出隔离',exact:true}).click();
  expect(await state()).toMatchObject({scope:'all',hiddenIds:['wall']});
  await page.getByRole('searchbox',{name:'搜索对象'}).fill('附属');expect(await page.getByRole('checkbox',{name:'选择 测试人物',exact:true}).count()).toBe(0);
 });
 it('resets each section independently and exits helper-only to the original base',async()=>{
  await patch({mode:'clay',scope:'subject',selectedIds:['hero'],hiddenIds:['wall'],anchors:true,wireframe:true});
  await page.getByRole('button',{name:'显示检查',exact:true}).click();await page.getByRole('tab',{name:'辅助 Helpers'}).click();
  await page.getByRole('button',{name:'仅看碰撞体',exact:true}).click();expect(await state()).toMatchObject({mode:'clay',helperOnly:'collision',anchors:true,wireframe:true});
  await page.getByRole('button',{name:'退出仅看辅助',exact:true}).click();expect(await state()).toMatchObject({mode:'clay',helperOnly:'none',anchors:true,wireframe:true});
  await page.getByRole('button',{name:'重置辅助',exact:true}).click();expect(await state()).toMatchObject({mode:'clay',scope:'subject',hiddenIds:['wall'],anchors:false,wireframe:false});
  await patch({anchors:true});await page.getByRole('tab',{name:'对象 Objects'}).click();await page.getByRole('button',{name:'重置对象',exact:true}).click();expect(await state()).toMatchObject({mode:'clay',scope:'all',hiddenIds:[],selectedIds:[],anchors:true});
  await page.getByRole('button',{name:'关闭显示检查',exact:true}).click();await page.getByRole('button',{name:'画面设置',exact:true}).click();await page.getByRole('button',{name:'重置画面',exact:true}).click();expect(await state()).toMatchObject({mode:'material',anchors:true});
 });
 it('shows helper purposes, unsupported causes and effective presets',async()=>{
  await page.getByRole('button',{name:'显示检查',exact:true}).click();await page.getByRole('tab',{name:'辅助 Helpers'}).click();
  expect(await page.getByRole('checkbox',{name:'攀爬面',exact:true}).isDisabled()).toBe(true);expect(await page.getByText('当前检查范围未绑定攀爬面。',{exact:true}).isVisible()).toBe(true);
  await page.getByRole('checkbox',{name:'碰撞体',exact:true}).check();expect(await page.getByRole('combobox',{name:'碰撞体范围',exact:true}).isVisible()).toBe(true);
  await page.getByText('快捷检查',{exact:false}).click();await page.getByRole('button',{name:'对照碰撞范围',exact:true}).click();expect(await state()).toMatchObject({mode:'material',scope:'subject',colliders:'all',colliderScope:'nearby'});
  expect(await page.getByRole('status',{name:'当前显示摘要'}).innerText()).toContain('碰撞体');
 });
 it('toggles camera geometry and its range without observer controls',async()=>{
  await page.getByRole('button',{name:'显示检查',exact:true}).click();await page.getByRole('tab',{name:'辅助 Helpers'}).click();
  await page.getByRole('checkbox',{name:'摄像机和取景范围',exact:true}).check();expect((await state()).cameras).toBe(true);
  await page.getByRole('spinbutton',{name:'取景范围显示距离 / 米'}).fill('15');expect(await state()).toMatchObject({cameras:true,cameraRange:15});
  await page.getByRole('button',{name:'重置辅助',exact:true}).click();expect(await state()).toMatchObject({cameras:false,cameraRange:10});
 });
 it('pins into the dedicated host and keeps picture independent',async()=>{
  await page.getByRole('button',{name:'显示检查',exact:true}).click();await page.getByRole('button',{name:'固定到右侧',exact:true}).click();
  expect(await page.locator('#displayInspectorHost .display-panel').count()).toBe(1);
  await page.getByRole('button',{name:'画面设置',exact:true}).click();expect(await page.locator('#displayInspectorHost .display-panel').count()).toBe(1);await page.getByRole('radio',{name:'白模',exact:true}).check();expect((await state()).mode).toBe('clay');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'关闭显示检查',exact:true}).click();expect(await page.locator('#displayInspectorHost .display-panel').count()).toBe(0);
  await page.getByRole('button',{name:'显示检查',exact:true}).click();expect(await page.getByRole('button',{name:'固定到右侧',exact:true}).count()).toBe(1);
 });
 it('allows clearing stored unavailable helpers and explains wireframe restrictions',async()=>{
  await patch({mode:'depth',wireframe:true,water:true});await page.getByRole('button',{name:'显示检查',exact:true}).click();await page.getByRole('tab',{name:'辅助 Helpers'}).click();
  expect(await page.getByText('当前画面模式不支持叠加网格线框；可使用上方“仅看线框”。',{exact:false}).isVisible()).toBe(true);
  await page.getByRole('checkbox',{name:'网格线框',exact:true}).uncheck();expect((await state()).wireframe).toBe(false);expect(await page.getByRole('checkbox',{name:'网格线框',exact:true}).isDisabled()).toBe(true);
  await page.getByRole('checkbox',{name:'水体',exact:true}).uncheck();expect((await state()).water).toBe(false);
  await page.getByRole('button',{name:'仅看线框',exact:true}).click();expect(await state()).toMatchObject({mode:'depth',helperOnly:'wireframe'});await page.getByRole('button',{name:'退出仅看辅助',exact:true}).click();expect(await state()).toMatchObject({mode:'depth',helperOnly:'none'});
 });
 it('folds large catalogs and scrolls pinned rows without moving scope',async()=>{
  await page.evaluate(()=>(window as any).displayTest.setRows(Array.from({length:30},(_,i)=>({id:`car-${i}`,name:`测试载具 ${i}`,type:'vehicle',available:true,hasCollider:true}))));
  await page.getByRole('button',{name:'显示检查',exact:true}).click();await page.getByRole('button',{name:'固定到右侧',exact:true}).click();
  expect(await page.getByRole('checkbox',{name:'选择 测试载具 0',exact:true}).count()).toBe(0);await page.getByRole('button',{name:'展开载具对象',exact:true}).click();
  const scope=page.getByRole('radiogroup',{name:'检查范围'}),before=await scope.boundingBox();
  const scroll=await page.locator('.display-object-list').evaluate(node=>{node.scrollTop=node.scrollHeight;return {height:node.clientHeight,content:node.scrollHeight,top:node.scrollTop};});
  expect(scroll.content).toBeGreaterThan(scroll.height);expect(scroll.top).toBeGreaterThan(0);expect((await scope.boundingBox())!.y).toBe(before!.y);
  await page.getByRole('searchbox',{name:'搜索对象'}).fill('测试载具 0');expect(await page.getByRole('checkbox',{name:'选择 测试载具 0',exact:true}).isVisible()).toBe(true);
 });
 it('distinguishes scope availability from a whole-scene interaction preset',async()=>{
  await patch({scope:'selected',selectedIds:['wall'],colliders:'all'});
  await page.evaluate(()=>(window as any).displayTest.setAvailable({physics:true,anchors:false,climbSurfaces:false,water:false,unmappedColliders:2,scopedColliders:0,scene:{anchors:true,climbSurfaces:false,water:false}}));
  await page.getByRole('button',{name:'显示检查',exact:true}).click();await page.getByRole('tab',{name:'辅助 Helpers'}).click();
  expect(await page.getByRole('checkbox',{name:'交互锚点',exact:true}).isDisabled()).toBe(true);expect(await page.getByText('当前检查范围没有关联碰撞体；可切换到附近或全场景碰撞体。',{exact:true}).isVisible()).toBe(true);
  await page.getByText('快捷检查',{exact:false}).click();await page.getByRole('button',{name:'检查交互位置',exact:true}).click();expect(await state()).toMatchObject({scope:'all',anchors:true,climbSurfaces:false,water:false});
 });
 it('uses a bounded mobile drawer with shared scope, keyboard tabs and close',async()=>{
  await page.setViewportSize({width:390,height:760});await page.locator('#root').evaluate(node=>{(node as HTMLElement).style.right='10px';});
  await page.getByRole('button',{name:'显示检查',exact:true}).click();const dialog=page.getByRole('dialog',{name:'显示检查',exact:true});expect(await dialog.isVisible()).toBe(true);
  const box=await dialog.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.width).toBeLessThanOrEqual(390);expect(box!.y+box!.height).toBeLessThanOrEqual(761);
  await page.getByRole('tab',{name:'辅助 Helpers'}).click();expect(await page.getByRole('checkbox',{name:'碰撞体',exact:true}).isVisible()).toBe(true);await page.getByRole('tab',{name:'对象 Objects'}).click();
  await page.getByRole('tab',{name:'对象 Objects'}).focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>page.getByRole('tab',{name:'辅助 Helpers'}).getAttribute('aria-selected')).toBe('true');expect(await page.getByRole('radio',{name:'全场景',exact:true}).isVisible()).toBe(true);
  await page.getByRole('button',{name:'关闭显示检查',exact:true}).click();expect(await dialog.count()).toBe(0);
 });
});
