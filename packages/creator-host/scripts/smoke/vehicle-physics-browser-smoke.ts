import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';

const output=path.resolve('.codex-tmp/vehicle-physics-browser');await mkdir(output,{recursive:true});
const browser=await launchChromiumWithSystemFallback({headless:true,args:['--enable-unsafe-swiftshader']});
const results:unknown[]=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]??'http://127.0.0.1:5178/');await page.waitForFunction(()=>Boolean((window as any).playground?.getState().ready),{},{timeout:60000});
  const state=()=>page.evaluate(()=>(window as any).playground.getState());
  const elapsed=async(seconds:number)=>{const t=(await state()).simulationTime;await page.waitForFunction(({t,seconds})=>(window as any).playground.getState().simulationTime>=t+seconds,{t,seconds},{timeout:60000});};
  for(const id of ['atv','bus','tank','unicycle','sled','ski','kayak','canoe','raft','jetski','observation-submarine']){
    await page.evaluate(async id=>{await (window as any).playground.reset();(window as any).playground.selectVehicle(id);},id);
    await page.locator('[data-worldkit-surface]').click({position:{x:650,y:450}});await elapsed(1.5);await page.keyboard.press('f');await elapsed(.8);
    const mounted=await state();assert.equal(mounted.activeVehicle,id,JSON.stringify(mounted));
    const hud=page.locator('.powertrain-hud');await hud.waitFor({state:'visible'});const idle=await hud.innerText();
    await page.keyboard.down('w');await elapsed(2);await page.keyboard.up('w');const moving=await state();const text=await hud.innerText();
    assert(moving.speed>.15,JSON.stringify({id,moving}));
    const snapshot=await page.evaluate(()=>(window as any).__WORLDKIT_EVAL__.snapshot());const dynamics=snapshot.humanoid.vehicleDynamics.find((v:any)=>v.instanceId===id);
    assert.equal(dynamics.physicsOwner,'rigid-body');assert(dynamics.drive);
    if(['atv','bus','tank','jetski','observation-submarine'].includes(id)){assert.equal(moving.driveTelemetry.kind,'engine');assert(moving.powertrain.rpm>850);assert(text.includes('RPM'));}
    else{assert.notEqual(moving.driveTelemetry.kind,'engine');assert(!text.includes('RPM'));}
    await page.screenshot({path:path.join(output,`${id}.png`)});
    results.push({id,idle,moving,text,dynamics});console.log(JSON.stringify({id,speed:moving.speed,hud:text}));
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'report.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({status:'passed',count:results.length,output}));
}finally{await writeFile(path.join(output,'partial-report.json'),JSON.stringify(results,null,2));await browser.close();}
