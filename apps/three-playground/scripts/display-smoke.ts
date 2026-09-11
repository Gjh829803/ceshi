import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {launchChromiumWithSystemFallback} from '../../../scripts/lib/playwright-browser-launch';
const browser=await launchChromiumWithSystemFallback();
const page=await browser.newPage({viewport:{width:1500,height:950}}),errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.setDefaultTimeout(10000);
try {
  await mkdir('.codex-tmp/display-evidence',{recursive:true});
  // Observe the real app's catalog work without adding production instrumentation.
  await page.route('**/src/main.ts*',async route=>{
    const response=await route.fetch(),body=await response.text(),marker='function readDisplayCatalog() {';
    assert(body.includes(marker),'display catalog instrumentation is available');
    await route.fulfill({response,body:body.replace(marker,marker+' window.__displayCatalogReads=(window.__displayCatalogReads??0)+1;')
      .replace('function readDisplayTargets() {','function readDisplayTargets() { window.__displayTargetReads=(window.__displayTargetReads??0)+1;')});
  });
  await page.goto(process.argv[2]??'http://127.0.0.1:5186');
  await page.waitForFunction(()=>!!(window as any).playground,{}, {timeout:60000});
  // Let the initial presentation complete before freezing the source-pixel baseline.
  await page.waitForFunction(()=>(window as any).playground.getState().simulationTime>0);
  const idle=await page.evaluate(()=>({reads:(window as any).__displayCatalogReads,time:(window as any).playground.getState().simulationTime}));
  await page.waitForFunction(time=>(window as any).playground.getState().simulationTime>time+.25,idle.time);
  assert.equal(await page.evaluate(()=>(window as any).__displayCatalogReads),idle.reads,'closed/default display must not rebuild its catalog while playing');
  await page.evaluate(()=>window.__WORLDKIT_EVAL__!.stopLive());
  const settings=()=>page.evaluate(()=>(window as any).playground.getState().display);
  const state=()=>page.evaluate(()=>{const s=(window as any).playground.getState();return {position:s.position,time:s.simulationTime,camera:s.camera};});
  const capture=()=>page.evaluate(async()=>{
    const frame=await window.__WORLDKIT_EVAL__!.presentation!.modelInput.captureFrame();
    try{const canvas=document.createElement('canvas');canvas.width=frame.image.width;canvas.height=frame.image.height;
      const ctx=canvas.getContext('2d')!;ctx.drawImage(frame.image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let hash=2166136261;for(const value of data)hash=Math.imul(hash^value,16777619);return {hash:hash>>>0,tick:frame.source.simulationTick};
    }finally{frame.image.close();}
  });
  const baseline=await capture(),before=await state();
  await page.getByRole('button',{name:'画面设置',exact:true}).click();
  for(const [label,mode] of [['白模','clay'],['深度图','depth'],['类型着色','semantic'],['法线方向','normal'],['无光照','unlit'],['正常材质','material']] as const){
    const targetReads=await page.evaluate(()=>(window as any).__displayTargetReads??0);
    await page.getByRole('radio',{name:label,exact:true}).check();assert.equal((await settings()).mode,mode);
    assert((await page.evaluate(()=>(window as any).__displayTargetReads??0))-targetReads<=1,'picture-only rendering must not resample helper anchors beyond the settings metadata refresh');
    assert.deepEqual(await capture(),baseline);assert.deepEqual(await state(),before);
  }
  await page.getByRole('radio',{name:'白模',exact:true}).check();
  await page.screenshot({path:'.codex-tmp/display-evidence/picture-explanations.png'});
  await page.getByRole('button',{name:'关闭画面设置'}).click();
  await page.getByRole('button',{name:'显示检查',exact:true}).click();
  await page.getByRole('searchbox',{name:'搜索对象'}).fill('越野车');
  await page.getByRole('checkbox',{name:'选择 越野车',exact:true}).check();
  await page.getByRole('button',{name:'隔离选中对象'}).click();
  assert.equal((await settings()).scope,'selected');assert.deepEqual((await settings()).selectedIds,['rover']);
  await page.getByRole('button',{name:'隐藏 越野车',exact:true}).click();
  assert((await settings()).hiddenIds.includes('rover'));assert.deepEqual(await capture(),baseline);
  await page.getByRole('button',{name:'显示 越野车',exact:true}).click();
  await page.getByRole('tab',{name:/辅助/}).click();
  await page.getByRole('checkbox',{name:'碰撞体',exact:true}).check();
  await page.getByRole('checkbox',{name:'交互锚点',exact:true}).check();
  const vertices=()=>page.evaluate(()=>(window.__WORLDKIT_EVAL__!.scene.getObjectByName('playground-all-colliders') as any).geometry.getAttribute('position').count);
  const scoped=await vertices();assert(scoped>0);
  assert(await page.evaluate(()=>!!window.__WORLDKIT_EVAL__!.scene.getObjectByName('anchor:vehicle-seat:rover')?.visible));
  await page.getByRole('combobox',{name:'碰撞体范围'}).click();await page.getByRole('option',{name:'全场景碰撞体',exact:true}).click();
  const all=await vertices();assert(all>scoped);
  await page.getByRole('checkbox',{name:'包含地面碰撞体'}).uncheck();assert((await vertices())<all);
  for(const [label,only] of [['仅看碰撞体','collision'],['仅看线框','wireframe']] as const){
    await page.getByRole('button',{name:label,exact:true}).click();assert.equal((await settings()).helperOnly,only);assert.equal((await settings()).mode,'clay');
    assert.deepEqual(await capture(),baseline);assert.deepEqual(await state(),before);
    await page.getByRole('button',{name:'退出仅看辅助',exact:true}).click();
  }
  await page.getByRole('button',{name:'重置辅助',exact:true}).click();assert.equal((await settings()).mode,'clay');assert.equal((await settings()).scope,'selected');
  await page.getByRole('tab',{name:/对象/}).click();await page.getByRole('button',{name:'退出隔离',exact:true}).click();assert.equal((await settings()).scope,'all');
  await page.getByRole('button',{name:'固定到右侧',exact:true}).click();
  assert(await page.locator('#displayInspectorHost .display-docked-panel').isVisible());
  await page.screenshot({path:'.codex-tmp/display-evidence/view-inspector-pinned.png'});
  await page.getByRole('button',{name:'关闭显示检查',exact:true}).click();
  assert(!await page.locator('#displayInspectorHost').isVisible());
  await page.evaluate(()=>window.__WORLDKIT_EVAL__!.startLive());
  await page.locator('#mapSelect').click();await page.getByRole('option',{name:'大奖赛 · 驾驶测试赛道',exact:true}).click();
  await page.waitForFunction(()=>(window as any).playground.getState().mapId==='grand-prix');
  await page.locator('#resetButton').click();assert.equal((await settings()).mode,'clay');
  await page.setViewportSize({width:390,height:760});
  await page.getByRole('button',{name:'显示检查',exact:true}).click();
  await page.getByRole('tab',{name:/辅助/}).click();
  await page.screenshot({path:'.codex-tmp/display-evidence/view-inspector-mobile.png'});
  const box=await page.locator('.display-mobile-drawer').boundingBox();assert(box&&box.x>=0&&box.x+box.width<=391&&box.y>=0&&box.y+box.height<=761,JSON.stringify(box));
  await page.getByRole('button',{name:'关闭显示检查',exact:true}).click();assert.equal(await page.locator('.display-mobile-drawer').count(),0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pictureModes:6,helperOnlyModes:2,cleanSource:true,scopeAndOwnership:true,isolationRestore:true,groundFilter:true,independentReset:true,pinned:true,mapReset:true,mobile:true,errors}));
}catch(error){await page.screenshot({path:'.codex-tmp/display-evidence/view-inspector-failure.png'});console.log(JSON.stringify(await page.evaluate(()=>({width:innerWidth,dialogs:[...document.querySelectorAll('[role=dialog]')].map(el=>({class:el.className,text:el.textContent?.slice(0,140),rect:el.getBoundingClientRect().toJSON()}))}))));throw error;}finally{await browser.close();}
