import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launchChromiumWithSystemFallback} from '../../../scripts/lib/playwright-browser-launch';
const base=process.argv[2]??'http://127.0.0.1:5194',output=path.resolve(process.argv[3]??'D:/CodexData/Artifacts/dragon-native-smoke');
await mkdir(output,{recursive:true});const browser=await launchChromiumWithSystemFallback();
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors:string[]=[],requests=new Set<string>();
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.add(r.url()));
const state=()=>page.evaluate(()=>(window as any).playground.getState());
async function waitMap(id:string){await page.waitForFunction(id=>(window as any).playground?.getState().mapId===id,id,{timeout:60000});}
async function choose(name:string){await page.locator('#mapSelect').click();await page.getByRole('option',{name,exact:true}).click();}
try{
  await page.goto(base);await waitMap('campus');await choose('飞龙 · 空中训练场');await waitMap('flying-creature-training');
  const initial=await state();assert.equal(initial.activeVehicle,'dragon');assert.equal(initial.speed,0);assert.equal(page.frames().length,1);
  await page.locator('[data-worldkit-surface]').click();await page.keyboard.down('d');
  await page.waitForFunction(()=>(window as any).playground.getState().flyingCreature.yawRadians<-.3);
  await page.keyboard.up('d');assert((await state()).position[0]<0,'D must move toward camera right (-X)');
  await page.keyboard.down('Control');await page.waitForFunction(()=>(window as any).playground.getState().speed===0);await page.keyboard.up('Control');
  await page.waitForTimeout(250);assert.equal((await state()).speed,0);
  await page.keyboard.down('Shift');await page.waitForFunction(()=>(window as any).playground.getState().speed>12);await page.keyboard.up('Shift');
  await page.waitForFunction(()=>(window as any).playground.getState().speed===0,{},{timeout:15000});
  await page.keyboard.down('e');await page.waitForFunction(()=>(window as any).playground.getState().flyingCreature.flamePhase==='loop');
  const flame=await state();assert.equal(flame.speed,0);assert(flame.dragonVisual.flameParticles>0);
  assert(Math.hypot(...flame.riderHip.map((v:number,i:number)=>v-flame.dragonSeat[12+i]))<.001);
  await page.screenshot({path:path.join(output,'native-flame.png')});await page.keyboard.up('e');
  await page.keyboard.press('t');await page.waitForFunction(()=>(window as any).playground.getState().camera.mode===1);await page.screenshot({path:path.join(output,'native-first-person.png')});
  await page.keyboard.press('t');await page.waitForFunction(()=>(window as any).playground.getState().camera.mode===2);
  await choose('飞机 · 起降训练场');await waitMap('aircraft-training');await choose('飞龙 · 空中训练场');await waitMap('flying-creature-training');
  const reset=await state();assert.equal(reset.speed,0);assert.equal(reset.flyingCreature.flamePhase,'off');assert.equal(reset.dragonVisual.flameParticles,0);assert.equal(reset.camera.mode,0);
  assert.equal(new URL(page.url()).hash,'#/scenes/flying-creature-training');
  await page.reload();await waitMap('flying-creature-training');assert.equal((await state()).activeVehicle,'dragon');
  await choose('飞机 · 起降训练场');await waitMap('aircraft-training');
  await page.goBack();await waitMap('flying-creature-training');assert.equal((await state()).activeVehicle,'dragon');
  await page.goForward();await waitMap('aircraft-training');
  await page.goto(new URL('/?map=flying-creature-training',base).href);await waitMap('flying-creature-training');assert.equal((await state()).activeVehicle,'dragon');
  await choose('飞机 · 起降训练场');await waitMap('aircraft-training');await page.reload();await waitMap('aircraft-training');
  assert.equal(page.frames().length,1);assert(![...requests].some(url=>/Havok|babylon|:5186|:5191/.test(url)));
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'result.json'),JSON.stringify({initial,flame,reset,errors,requests:[...requests]},null,2));
}finally{await browser.close();}
