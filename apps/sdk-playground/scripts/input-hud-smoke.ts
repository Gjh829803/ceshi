import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';

const base=process.argv[2]??'http://127.0.0.1:5178';
const output=path.resolve(process.argv[3]??'.codex-tmp/input-hud-smoke');
await mkdir(output,{recursive:true});
const browser=await launchChromiumWithSystemFallback();
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
const state=()=>page.evaluate(()=>(window as any).playground.getState());
const cases=[
  {id:'pusher-plane',present:['增加油门 / 减少油门','抬头 / 低头（镜头有限跟随）','辅助增加油门'],absent:['W / S 俯仰','低头 / 拉起']},
  {id:'helicopter',present:['向前飞行 / 向后飞行','水平减速（不降低升力）','50% 悬停'],absent:['辅助增加油门','加 / 减油门']},
  {id:'balloon',present:['加热上升','放热下降','镜头向上 / 镜头向下'],absent:['辅助增加油门','抬头 / 低头','横滚']},
  {id:'observation-submarine',present:['上浮 / 下潜','减速制动'],absent:['惯性制动']},
  {id:'tank',present:['炮塔左转 / 炮塔右转','镜头向上 / 镜头向下'],absent:['炮管抬高','炮管降低']},
] as const;
const observations:unknown[]=[];
try{
  await page.goto(base);
  await page.waitForFunction(()=>(window as any).playground?.getState().ready,{},{timeout:60000});
  const footKeys=await page.locator('#shortcutFooter kbd').allTextContents();
  assert(footKeys.includes('V'));assert(!footKeys.includes('T'));assert(!footKeys.includes('G'));
  for(const item of cases){
    await page.evaluate(id=>(window as any).playground.selectVehicle(id),item.id);
    await page.locator('[data-worldkit-surface]').click();await page.keyboard.press('f');
    await page.waitForFunction(id=>{const s=(window as any).playground.getState();return s.activeVehicle===id&&s.transitionSeconds===0;},item.id,{timeout:30000});
    await page.waitForFunction(label=>document.querySelector('#shortcutFooter')?.textContent?.includes(label),item.present[0]);
    const footer=await page.locator('#shortcutFooter').innerText(),keys=await page.locator('#shortcutFooter kbd').allTextContents(),prompt=await page.locator('#interaction').innerText();
    for(const text of item.present)assert(footer.includes(text),`${item.id}: missing ${text}`);
    for(const text of item.absent)assert(!footer.includes(text),`${item.id}: stale ${text}`);
    assert.equal(keys.filter(key=>key==='V').length,1);assert(!keys.includes('T'));assert(keys.includes('Backspace'));
    if(item.id==='pusher-plane'){
      assert(prompt.includes('W / S 增加油门 / 减少油门'));assert(!prompt.includes('Shift'));
      await page.keyboard.down('w');await page.waitForFunction(()=>(window as any).playground.getState().flight.throttle>.08);await page.keyboard.up('w');
      await page.keyboard.down('Control');await page.waitForFunction(()=>(window as any).playground.getState().flight.throttle===0);await page.keyboard.up('Control');
      await page.screenshot({path:path.join(output,'pusher-hud.png')});
    }
    if(item.id==='balloon')assert(!keys.includes('Shift')&&!keys.includes('Ctrl'));
    observations.push({id:item.id,footer,prompt,keys,state:await state()});
  }
  // Switching back must restore fixed-wing wording, not cached tank controls.
  await page.evaluate(()=>(window as any).playground.selectVehicle('pusher-plane'));
  await page.locator('[data-worldkit-surface]').click();await page.keyboard.press('f');
  await page.waitForFunction(()=>document.querySelector('#shortcutFooter')?.textContent?.includes('增加油门 / 减少油门'));
  await page.setViewportSize({width:1280,height:720});
  await page.screenshot({path:path.join(output,'pusher-hud-1280.png')});
  const bounds=await page.locator('#shortcutFooter').boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=1281&&bounds.y+bounds.height<=721);
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'result.json'),JSON.stringify({observations,errors},null,2));
  console.log(JSON.stringify({vehicles:cases.map(item=>item.id),pusherThrottleVerified:true,viewportVerified:true,errors}));
}catch(error){
  await page.screenshot({path:path.join(output,'failure.png')});
  await writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error),state:await state().catch(()=>null),observations,errors},null,2));
  throw error;
}finally{await browser.close();}
