import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';
const output='D:/CodexData/Artifacts/aircraft-dynamics-20260910/fit';await mkdir(output,{recursive:true});
const browser=await launchChromiumWithSystemFallback(),page=await browser.newPage({viewport:{width:1440,height:960}});
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>(window as any).playground.getState());
async function orbit(yaw:number,pitch:number){
 for(let n=0;n<4;n++){const c=(await state()).camera;const dx=Math.max(-500,Math.min(500,-(yaw-c.yaw)/.004)),dy=(pitch-c.pitch)/.004;if(Math.abs(dx)+Math.abs(dy)<1)break;
 await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(720+dx,450+dy,{steps:12});await page.mouse.up();await page.waitForTimeout(180);}
}
async function shot(name:string){await page.locator('#viewport').screenshot({path:`${output}/${name}.png`,style:'[data-worldkit-ui], [role=status], [data-sonner-toaster], .toast {visibility:hidden!important}'});}
try{
 await page.goto('http://127.0.0.1:5190');await page.waitForFunction(()=>!!(window as any).playground?.getState().ready,{},{timeout:60000});
 await page.locator('#mapSelect').click();await page.getByRole('option',{name:'飞机 · 起降训练场',exact:true}).click();
 await page.waitForFunction(()=>(window as any).playground.getState().mapId==='aircraft-training');
 await page.locator('#inspectorClose').click();
 for(const id of ['plane','trainer-plane']){
 await page.evaluate(id=>(window as any).playground.selectVehicle(id),id);await page.waitForTimeout(300);
 await page.locator('[data-worldkit-surface]').click();await page.keyboard.press('f');await page.waitForFunction(id=>(window as any).playground.getState().activeVehicle===id,id);
 while((await state()).camera.viewKind!=='third-person'){await page.keyboard.press('v');await page.waitForTimeout(200);}await page.waitForTimeout(500);await page.mouse.move(720,450);await page.mouse.wheel(0,-350);await page.waitForTimeout(400);
 await orbit(Math.PI/2,.10);await shot(id+'-side');await orbit(Math.PI,.15);await shot(id+'-front');await orbit(0,.23);await shot(id+'-rear');await orbit(1.0,.20);await shot(id+'-oblique');
 await page.keyboard.press('v');await page.waitForTimeout(350);await orbit((await state()).camera.yaw,.85);await shot(id+'-contacts');
 await page.keyboard.press('f');await page.waitForFunction(()=>(window as any).playground.getState().activeVehicle===null);while((await state()).camera.viewKind!=='third-person'){await page.keyboard.press('v');await page.waitForTimeout(150);}await page.waitForTimeout(800);await shot(id+'-exit');
 }
 assert.deepEqual(errors,[]);await writeFile(output+'/fit-browser.json',JSON.stringify({vehicles:['plane','trainer-plane'],views:['side','front','rear','oblique','contacts','exit'],errors},null,2));
}finally{await browser.close();}
