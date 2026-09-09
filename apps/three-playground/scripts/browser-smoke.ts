import {launchChromiumWithSystemFallback} from '../../../scripts/lib/playwright-browser-launch';
import assert from 'node:assert/strict';
const browser=await launchChromiumWithSystemFallback();const page=await browser.newPage({viewport:{width:1500,height:950}});const errors:string[]=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
await page.goto(process.argv[2]??'http://127.0.0.1:5178');await page.waitForFunction(()=>!!(window as any).trainingGround,{},{timeout:60000});
const state=()=>page.evaluate(()=>(window as any).trainingGround.getState());
await page.locator('#colliderSelect').click();await page.getByRole('listbox').waitFor();await page.keyboard.press('Escape');assert.equal((await state()).paused,false);
assert.equal(await page.locator('select:visible').count(),0);
await page.locator('#mapSelect').click();await page.getByRole('option',{name:'大奖赛 · 驾驶测试赛道',exact:true}).click();await page.waitForFunction(()=>(window as any).trainingGround.getState().mapId==='grand-prix');
await page.mouse.click(650,450);await page.keyboard.press('f');await page.waitForFunction(()=>(window as any).trainingGround.getState().activeVehicle==='supercar');
const before=await state();await page.keyboard.down('w');await page.waitForFunction(()=>(window as any).trainingGround.getState().speed>1);await page.keyboard.up('w');const driven=await state();assert.notDeepEqual(driven.position,before.position);
await page.locator('#resetButton').click();await page.waitForFunction(()=>(window as any).trainingGround.getState().activeVehicle===null);
const speedInput=page.locator('[data-control-field="speed"] input[type="number"]');await speedInput.fill('4');await speedInput.dispatchEvent('input');await page.waitForFunction(()=>(window as any).trainingGround.getState().movement.control.speed===4);
const position=(await state()).position;await page.keyboard.down('w');await page.waitForTimeout(300);await page.keyboard.up('w');const still=(await state()).position;assert(Math.hypot(still[0]-position[0],still[2]-position[2])<.01);
await page.locator('#libraryButton').click();await page.waitForSelector('.asset-library');await page.screenshot({path:'output/playwright/react-editor-library.png'});await page.keyboard.press('Escape');
await page.locator('#equipmentButton').click();await page.waitForSelector('.equipment-panel[role="dialog"][data-state="open"]');await page.screenshot({path:'output/playwright/react-editor-equipment.png'});assert.equal((await state()).paused,false); // UI modal pauses SDK but preserves user pause state.
await page.getByRole('button',{name:'关闭人物装备'}).click();await page.waitForSelector('.equipment-panel[role=dialog]',{state:'detached'});
await page.locator('#scenesButton').click();await page.waitForSelector('.workbench[role="dialog"][data-state="open"]');await page.keyboard.press('Escape');
await page.locator('#pauseButton').click();assert.equal((await state()).paused,true);await page.locator('#resumeButton').click();assert.equal((await state()).paused,false);
await page.screenshot({path:'output/playwright/react-editor-race.png'});
await page.setViewportSize({width:820,height:740});await page.locator('#equipmentButton').click();await page.waitForSelector('.equipment-panel[role="dialog"][data-state="open"]');const footer=await page.locator('.equipment-footer').boundingBox();assert(footer&&footer.y+footer.height<=740);await page.screenshot({path:'output/playwright/react-editor-small.png'});await page.getByRole('button',{name:'关闭人物装备'}).click();
console.log({map:(await state()).mapId,drivingDistanceMeters:Math.hypot(driven.position[0]-before.position[0],driven.position[2]-before.position[2]),formInputIsolated:true,modalResume:true,smallScreenFooterVisible:true,errors});assert.deepEqual(errors,[]);
}finally{await browser.close();}
