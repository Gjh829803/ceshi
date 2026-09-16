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
  {id:'plane',present:['增加油门 / 减少油门','低头 / 抬头','地面刹车'],absent:['横滚','有限跟随']},
  {id:'pusher-plane',present:['增加油门 / 减少油门','低头 / 抬头','辅助增加油门'],absent:['W / S 俯仰','低头 / 拉起','横滚','有限跟随']},
  {id:'helicopter',present:['向前飞行 / 向后飞行','水平减速（不降低升力）','50% 悬停','侧倾侧移左'],absent:['辅助增加油门','加 / 减油门','抬头 / 低头']},
  {id:'multirotor',present:['侧倾侧移左','50% 悬停'],absent:['抬头 / 低头','横滚']},
  {id:'tiltrotor',present:['侧倾侧移左','向前飞行 / 向后飞行'],absent:['抬头 / 低头','横滚']},
  {id:'glider',present:['提高目标空速 / 降低目标空速'],absent:['抬头 / 低头','横滚']},
  {id:'paraglider',present:['提高目标空速 / 降低目标空速','伞下降落制动'],absent:['抬头 / 低头','横滚']},
  {id:'wingsuit',present:['前进 / 后退','向左移动 / 向右移动','跳跃','脱下翼装'],absent:['抬头 / 低头','横滚','开伞']},
  {id:'balloon',present:['加热上升','放热下降','镜头向上 / 镜头向下'],absent:['辅助增加油门','抬头 / 低头','横滚']},
  {id:'observation-submarine',present:['上浮 / 下潜','减速制动','抬头 / 低头'],absent:['惯性制动','横滚']},
  {id:'tank',present:['炮塔左转 / 炮塔右转','镜头向上 / 镜头向下'],absent:['炮管抬高','炮管降低']},
  {id:'hovercraft',present:['向左侧移 / 向右侧移'],absent:['抬头 / 低头']},
  {id:'spacecraft',present:['抬头 / 低头','向左横滚 / 向右横滚','反推制动'],absent:['有限跟随']},
  {id:'dragon',present:['抬头 / 低头','闪避'],absent:['喷火','有限跟随']},
] as const;
const observations:unknown[]=[];
try{
  await page.goto(base);
  await page.waitForFunction(()=>(window as any).playground?.getState().ready,{},{timeout:60000});
  const footKeys=await page.locator('#shortcutFooter kbd').allTextContents();
  assert(footKeys.includes('V'));assert(!footKeys.includes('T'));assert(!footKeys.includes('G'));
  for(const item of cases){
    const mapId=['plane','pusher-plane','helicopter','multirotor','tiltrotor','glider','paraglider','wingsuit','balloon'].includes(item.id)?'aircraft-training':item.id==='dragon'?'flying-creature-training':'campus';
    if((await state()).mapId!==mapId){
      await page.goto(new URL(`/#/scenes/${mapId}`,base).href);
      await page.waitForFunction(mapId=>{const s=(window as any).playground?.getState();return s?.ready&&s.mapId===mapId;},mapId,{timeout:60000});
    }
    await page.evaluate(id=>(window as any).playground.selectVehicle(id),item.id);
    await page.locator('[data-worldkit-surface]').click();
    if(item.id==='dragon'){
      await page.keyboard.press('h');
      await page.waitForFunction(()=>(window as any).playground.getState().dragon.state.summon?.phase==='arrived',{},{timeout:90000});
      const deadline=Date.now()+30000;
      while(Date.now()<deadline){
        const current=await state();if(current.dragon.boarding.eligible)break;
        const target=current.dragon.boarding.approachPositionWorldMetersXYZ;assert(target);
        const dx=target[0]-current.position[0],dz=target[2]-current.position[2],basis=current.camera.controlForwardWorldXYZ;
        const forward=dx*basis[0]+dz*basis[2],right=-dx*basis[2]+dz*basis[0];
        const key=Math.abs(forward)>=Math.abs(right)?(forward>0?'w':'s'):(right>0?'d':'a');
        await page.keyboard.down(key);await page.waitForTimeout(120);await page.keyboard.up(key);
      }
      assert((await state()).dragon.boarding.eligible);
    }
    await page.keyboard.press('f');
    await page.waitForFunction(id=>{const s=(window as any).playground.getState();return s.activeVehicle===id&&s.transitionSeconds===0;},item.id,{timeout:30000});
    // Vehicle selection retains the previous view: explicitly test the user's
    // third-person scenario instead of inheriting the preceding V cycle.
    for(let n=0;n<3&&(await state()).camera.viewKind!=='third-person';n++)await page.keyboard.press('v');
    assert.equal((await state()).camera.viewKind,'third-person');
    if(item.id==='dragon'){
      await page.waitForFunction(()=>document.querySelector('#interaction')?.textContent?.includes('Q 起飞'));
      await page.keyboard.press('q');await page.waitForFunction(()=>(window as any).playground.getState().flyingCreature.groundPhase==='airborne',{},{timeout:20000});
    }
    await page.waitForFunction(label=>document.querySelector('#shortcutFooter')?.textContent?.includes(label),item.present[0]);
    const footer=await page.locator('#shortcutFooter').innerText(),keys=await page.locator('#shortcutFooter kbd').allTextContents(),prompt=await page.locator('#interaction').innerText();
    for(const text of item.present)assert(footer.includes(text),`${item.id}: missing ${text}`);
    for(const text of item.absent)assert(!footer.includes(text),`${item.id}: stale ${text}`);
    assert.equal(keys.filter(key=>key==='V').length,1);assert(!keys.includes('T'));assert(keys.includes('Backspace'));
    assert(footer.includes('镜头向上 / 镜头向下'));
    const press=async(held:string[],expected:Record<string,unknown>,seconds=.15)=>{
      const time=(await state()).simulationTime;
      for(const key of held)await page.keyboard.down(key);
      try{
        await page.waitForFunction(({time,seconds})=>(window as any).playground.getState().simulationTime>time+seconds,{time,seconds});
        const sample=await state();for(const [field,value] of Object.entries(expected))assert(sample.inputState.lastApplied.input[field]===value,`${item.id}: ${held} ${field}: expected ${value}, got ${sample.inputState.lastApplied.input[field]}`);
        return sample;
      }finally{for(const key of held)await page.keyboard.up(key);}
    };
    const fixed=['plane','pusher-plane'].includes(item.id);
    const pitch=['observation-submarine','spacecraft','dragon'].includes(item.id);
    const vertical=['helicopter','multirotor','tiltrotor','balloon','observation-submarine','spacecraft','dragon'].includes(item.id);
    const roll=['helicopter','multirotor','tiltrotor','tank','hovercraft','spacecraft'].includes(item.id);
    const cameraBefore=(await state()).camera.pitch;
    const observed=await press(['ArrowUp'],{pitch:0,roll:0},3);
    assert(observed.camera.pitch<cameraBefore-10*Math.PI/180,`${item.id}: old camera cap remains`);
    if(item.id==='helicopter'){
      const offset=await press(['ArrowRight'],{pitch:0,roll:0},1);
      await page.waitForFunction(time=>(window as any).playground.getState().simulationTime>time+8,offset.simulationTime);
      const centered=await state();
      assert(Math.abs(centered.speed)<.8,'recenter must work below the old speed threshold');
      assert(Math.abs(centered.camera.pitch-.2)<.02,'idle pitch must return to the calibrated view');
      const [x,y,z,w]=centered.vehicleRotation;
      const heading=Math.atan2(2*(x*z+w*y),1-2*(x*x+y*y));
      const delta=centered.camera.yaw-heading-Math.PI;
      assert(Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta)))<.02,'idle yaw must return behind the vehicle');
      observations.push({id:item.id,restRecenter:{offset,centered}});
    }
    await press(['ArrowDown','c'],{pitch:pitch?1:0,roll:0});
    await press(['Space'],{pitch:pitch?-1:0,roll:0,...(fixed?{brake:true}:{})});
    await press(['c','Space'],{pitch:0,roll:0});
    await press(['q'],{pitch:fixed?1:0,roll:0,lift:vertical?1:0});
    await press(['e'],{pitch:fixed?-1:0,roll:0,lift:vertical?-1:0});
    await press(['q','e'],{pitch:0,roll:0,lift:0});
    await press(['z'],{pitch:0,roll:roll?-1:0,...(item.id==='dragon'?{secondary:true}:{})});
    await press(['x'],{pitch:0,roll:roll?1:0});
    if(!vertical&&!fixed)assert(!keys.includes('Q')&&!keys.includes('E'));
    if(['helicopter','multirotor','tiltrotor','balloon'].includes(item.id))assert(!keys.includes('Space')&&!keys.includes('C'));
    if(!roll&&item.id!=='dragon')assert(!keys.includes('Z')&&!keys.includes('X'));
    await page.keyboard.press('v');
    if(item.id==='pusher-plane'){
      assert(prompt.includes('W / S 增加油门 / 减少油门'));assert(!prompt.includes('Shift'));
      await page.keyboard.down('w');await page.waitForFunction(()=>(window as any).playground.getState().flight.throttle>.08);await page.keyboard.up('w');
      await page.keyboard.down('Control');await page.waitForFunction(()=>(window as any).playground.getState().flight.throttle===0);await page.keyboard.up('Control');
      await page.screenshot({path:path.join(output,'pusher-hud.png')});
    }
    if(item.id==='balloon')assert(!keys.includes('Shift')&&!keys.includes('Ctrl'));
    observations.push({id:item.id,footer,prompt,keys,state:await state()});
    console.log(`${item.id}: keyboard, camera and HUD passed`);
  }
  // Switching back must restore fixed-wing wording, not cached tank controls.
  await page.goto(new URL('/#/scenes/aircraft-training',base).href);
  await page.waitForFunction(()=>(window as any).playground?.getState().ready,{},{timeout:60000});
  await page.evaluate(()=>(window as any).playground.selectVehicle('pusher-plane'));
  await page.locator('[data-worldkit-surface]').click();await page.keyboard.press('f');
  await page.waitForFunction(()=>document.querySelector('#shortcutFooter')?.textContent?.includes('增加油门 / 减少油门'));
  await page.setViewportSize({width:1280,height:720});
  await page.screenshot({path:path.join(output,'pusher-hud-1280.png')});
  const bounds=await page.locator('#shortcutFooter').boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=1281&&bounds.y+bounds.height<=721);
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'result.json'),JSON.stringify({observations,errors},null,2));
  console.log(JSON.stringify({vehicles:cases.map(item=>item.id),decouplingVerified:true,restRecenterVerified:true,oldCameraCapRemoved:true,pusherThrottleVerified:true,viewportVerified:true,errors}));
}catch(error){
  await page.screenshot({path:path.join(output,'failure.png')});
  await writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error),state:await state().catch(()=>null),observations,errors},null,2));
  throw error;
}finally{await browser.close();}
