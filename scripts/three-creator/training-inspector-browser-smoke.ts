import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launchChromiumWithSystemFallback} from '../lib/playwright-browser-launch.js';

const output=path.resolve(process.argv[3]??'outputs/training-inspector/browser');await mkdir(output,{recursive:true});
const browser=await launchChromiumWithSystemFallback();
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
const state=()=>page.evaluate(()=>(window as any).trainingGround.getState());
const advance=async(seconds=.2)=>{const t=(await state()).simulationTime;await page.waitForFunction(v=>(window as any).trainingGround.getState().simulationTime>v.t+v.seconds,{t,seconds});};
const number=(key:string)=>page.locator(`[data-control-field="${key}"] input[type=number]`);
try{
 await page.goto(process.argv[2]??'http://127.0.0.1:5175/');await page.waitForFunction(()=>(window as any).trainingGround?.getState().ready,null,{timeout:60000});await advance();
 if(await page.locator('#workspace').evaluate(e=>e.classList.contains('inspector-closed')))await page.locator('#debugButton').click();
 assert.equal(await page.getByRole('tab',{name:'运动属性'}).getAttribute('aria-selected'),'true');
 const surface=page.locator('[data-worldkit-surface]').first();
 const focusWorld=()=>surface.click({position:{x:450,y:350}});
 await number('speed').fill('0');assert.equal((await state()).movement.control.speed,0);
 await focusWorld();await advance();const stopped=await state();await page.keyboard.down('s');await advance(.5);await page.keyboard.up('s');const zero=await state();
 assert(Math.hypot(zero.position[0]-stopped.position[0],zero.position[2]-stopped.position[2])<.08);
 await number('speed').fill('6');assert.equal((await state()).movement.control.speed,6);await focusWorld();
 const start=await state();await page.keyboard.down('s');await advance(.7);const moving=await state();await page.keyboard.up('s');
 const distance=Math.hypot(moving.position[0]-start.position[0],moving.position[2]-start.position[2]);assert(distance>.2,'character speed change must affect physical movement');
 await page.getByRole('tab',{name:'相机模式'}).click();await page.locator('[data-camera-field="distance"] input[type=number]').fill('10');
 await page.getByRole('tab',{name:'运动属性'}).click();await page.getByRole('button',{name:'恢复运动默认'}).click();await advance();
 assert.equal((await state()).movement.control.speed,3.1);
 // The physical camera arm damps toward the configured distance.
 await page.waitForFunction(()=>Math.abs((window as any).trainingGround.getState().camera.distance-10)<.01);
 await page.getByRole('tab',{name:'相机模式'}).click();assert.equal(await page.locator('[data-camera-field="distance"] input[type=number]').inputValue(),'10');
 await page.getByRole('tab',{name:'运动属性'}).click();
 await page.screenshot({path:path.join(output,'character-motion.png')});
 const vehicles=[];
 for(const id of ['rover','patrol-boat','glider']){
  await page.evaluate(id=>(window as any).trainingGround.selectVehicle(id),id);await focusWorld();await page.keyboard.press('f');await advance();
  assert.equal((await state()).activeVehicle,id);
  const original=(await state()).movement.control.speed;await number('speed').fill('12');assert.equal((await state()).movement.control.speed,12);
  if(id==='rover'){
   await number('coastDeceleration').fill('2');await number('maxSpeed').fill('24');await number('brakeDeceleration').fill('30');
   await focusWorld();await page.keyboard.down('w');await advance(.6);await page.keyboard.up('w');
   const start=await state();await advance(.3);const end=await state();
   const measured=(start.speed-end.speed)/(end.simulationTime-start.simulationTime);
   assert(Math.abs(measured-2)<.15,`expected independent release deceleration 2 m/s², got ${measured}`);
   await number('coastDeceleration').fill('20');await focusWorld();await advance(.5);assert((await state()).speed<.2);
   await number('coastDeceleration').fill('2');
  }
  if(id==='glider'){assert(await number('accel').isDisabled());assert(await number('grip').isDisabled());}
  vehicles.push({id,original,modified:(await state()).movement});await page.getByRole('button',{name:'保存到本地'}).click();
  const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`vehicle-training-ground.profile.v1.${id}`)!),id);assert.equal(saved.control.speed,12);
  if(id==='rover')assert.deepEqual([saved.control.coastDeceleration,saved.control.maxSpeed,saved.control.brakeDeceleration],[2,24,30]);
  await page.screenshot({path:path.join(output,`${id}-motion.png`)});
  await page.getByRole('tab',{name:'相机模式'}).click();await page.getByRole('button',{name:'沉浸越肩',exact:true}).click();assert.equal((await state()).camera.mode,2);
  await page.getByRole('tab',{name:'运动属性'}).click();
 }
 assert.deepEqual(errors,[]);await page.setViewportSize({width:390,height:844});
 if(!await page.getByRole('tab',{name:'运动属性'}).isVisible())await page.locator('#debugButton').click();
 assert(await page.getByRole('tab',{name:'运动属性'}).isVisible());await page.screenshot({path:path.join(output,'mobile.png')});
 await writeFile(path.join(output,'report.json'),JSON.stringify({physicalCharacterDistance:distance,vehicles,errors},null,2));
 console.log(JSON.stringify({output,physicalCharacterDistance:distance,vehicles:vehicles.map(v=>v.id),errors}));
}catch(error){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
