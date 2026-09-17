import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';

// Real keyboard/clock/physics flow; no teleports, state edits or extra world steps.
const base=process.argv[2]??'http://127.0.0.1:5188';
const output=path.resolve(process.argv[3]??'.codex-tmp/wingsuit-smoke');
await mkdir(output,{recursive:true});
const browser=await launchChromiumWithSystemFallback();
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors:string[]=[],observations:unknown[]=[];
page.on('pageerror',error=>errors.push(error.message));
const state=()=>page.evaluate(()=>(window as any).playground.getState());
const advance=async(seconds:number)=>{
  const time=(await state()).simulationTime;
  await page.waitForFunction(({time,seconds})=>(window as any).playground.getState().simulationTime>=time+seconds,{time,seconds},{timeout:30000});
};
const hold=async(key:string,seconds:number)=>{
  await page.keyboard.down(key);try{await advance(seconds);}finally{await page.keyboard.up(key);}
};
const wearing=()=>page.waitForFunction(()=>{
  const s=(window as any).playground.getState();return s.activeVehicle==='wingsuit'&&s.flight.wearable.groundLocomotion;
});
try{
  await page.goto(new URL('/#/scenes/aircraft-training',base).href);
  await page.waitForFunction(()=>(window as any).playground?.getState().ready,{},{timeout:60000});
  await page.evaluate(()=>(window as any).playground.selectVehicle('wingsuit'));
  await page.locator('[data-worldkit-surface]').click();await advance(.7);
  assert((await page.locator('#interaction').innerText()).includes('穿戴'));
  await page.keyboard.press('f');await wearing();
  await page.waitForFunction(()=>document.querySelector('#interaction')?.textContent?.includes('自由走动'));
  const start=await state();
  for(const key of ['w','s','a','d']){
    const before=await state();await hold(key,.7);const after=await state();
    assert(Math.hypot(after.position[0]-before.position[0],after.position[2]-before.position[2])>1,`${key}: no walking movement`);
    assert(after.flight.wearable.groundLocomotion);await advance(.3);
  }
  await hold('Space',2);const jumped=await state();
  assert(jumped.flight.wearable.groundLocomotion);assert(!jumped.flight.wearable.hadFlight);assert.equal(jumped.flight.canopy,0);
  await advance(.5);await page.keyboard.press('f');
  await page.waitForFunction(()=>(window as any).playground.getState().activeVehicle===null);
  await advance(1);await page.keyboard.press('f');await wearing();
  await page.screenshot({path:path.join(output,'walking.png')});
  observations.push({stage:'walking-and-manual-reequip',start,state:await state()});
  console.log('Wingsuit: four directions, ordinary jump and F equip/unequip passed');

  // Walk toward the authored launch edge (deck ends at z=-732), respecting the
  // live camera-relative movement basis while the trailing camera turns.
  const deadline=Date.now()+90000;
  while((await state()).flight.wearable.groundLocomotion&&Date.now()<deadline){
    const s=await state(),dx=150-s.position[0],dz=-725-s.position[2],basis=s.camera.controlForwardWorldXYZ;
    const forward=dx*basis[0]+dz*basis[2],right=-dx*basis[2]+dz*basis[0];
    await hold(Math.abs(forward)>=Math.abs(right)?(forward>0?'w':'s'):(right>0?'d':'a'),.25);
  }
  const flying=await state();assert(!flying.flight.wearable.groundLocomotion,'did not leave the high platform');
  assert(flying.flight.wearable.hadFlight);assert.equal(flying.flight.canopy,0);
  await page.waitForFunction(()=>document.querySelector('#shortcutFooter')?.textContent?.includes('开伞'));
  await page.screenshot({path:path.join(output,'flight.png')});
  observations.push({stage:'airborne',state:flying});console.log('Wingsuit: walking handed off to flight, canopy stayed closed');
  await page.keyboard.down('Space');
  try{
    await page.waitForFunction(()=>(window as any).playground.getState().flight?.canopy>.8,{},{timeout:30000});
    for(let n=0;n<90&&(await state()).activeVehicle;n++){
      await advance(1);if(n%10===0)console.log(`Wingsuit: descent ${JSON.stringify((await state()).position)}`);
    }
  }finally{await page.keyboard.up('Space');}
  const landed=await state();assert.equal(landed.activeVehicle,null,'landing must automatically unequip');
  assert(landed.position[1]<2,'landing must stay on the lower ground');
  await advance(1);await page.screenshot({path:path.join(output,'landed.png')});
  await page.keyboard.press('f');await wearing();await advance(1);
  const reworn=await state();assert(!reworn.flight.wearable.hadFlight);assert.equal(reworn.flight.canopy,0);
  assert(reworn.position[1]<2,'re-equipping must not teleport to the launch platform');
  await hold('w',.7);assert((await state()).flight.wearable.groundLocomotion);
  await page.screenshot({path:path.join(output,'ground-reequipped.png')});
  observations.push({stage:'landing-and-level-ground-reequip',landed,reworn});assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'result.json'),JSON.stringify({observations,errors},null,2));
  console.log('Wingsuit: full keyboard walking/flight/landing/automatic drop/level-ground re-equip flow passed');
}catch(error){
  await page.screenshot({path:path.join(output,'failure.png')});
  await writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error),state:await state().catch(()=>null),observations,errors},null,2));throw error;
}finally{await browser.close();}
