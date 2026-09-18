import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';
const selectionOnly=process.argv.includes('--selection-only');
const base=process.argv[2]??'http://127.0.0.1:5178',output=path.resolve(process.argv[3]??'.codex-tmp/dragon-native-smoke');
await mkdir(output,{recursive:true});const browser=await launchChromiumWithSystemFallback();
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors:string[]=[],requests=new Set<string>();
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.add(r.url()));
const state=()=>page.evaluate(()=>(window as any).playground.getState());
const approachSamples:unknown[]=[];
function sampleApproach(current:any){approachSamples.push({simulationTime:current.simulationTime,person:current.position,dragon:current.dragon.position,boarding:current.dragon.boarding,cameraYaw:current.camera.yaw,ground:current.dragon.state.groundPhase,input:current.inputState});}
async function waitMap(id:string){await page.waitForFunction(id=>(window as any).playground?.getState().mapId===id,id,{timeout:60000});}
async function choose(name:string){await page.locator('#mapSelect').click();await page.getByRole('option',{name,exact:true}).click();}
async function summonAndBoard(){
  await page.locator('[data-worldkit-surface]').click();await page.keyboard.press('h');
  await page.waitForFunction(()=>{const dragon=(window as any).playground.getState().dragon;return dragon.state.summon?.phase==='arrived'||dragon.state.summon?.phase==='blocked';},{},{timeout:90000});
  assert.equal((await state()).dragon.state.summon.phase,'arrived');
  sampleApproach(await state());
  const deadline=Date.now()+30000;let nextSample=Date.now()+2000;
  while(Date.now()<deadline){
    const current=await state();if(Date.now()>=nextSample){sampleApproach(current);nextSample=Date.now()+2000;}if(current.dragon.boarding.eligible)break;
    const target=current.dragon.boarding.approachPositionWorldMetersXYZ;
    assert(target,current.dragon.boarding.message);
    const dx=target[0]-current.position[0],dz=target[2]-current.position[2],basis=current.camera.controlForwardWorldXYZ;
    const forward=dx*basis[0]+dz*basis[2],right=-dx*basis[2]+dz*basis[0];
    const key=Math.abs(forward)>=Math.abs(right)?(forward>0?'w':'s'):(right>0?'d':'a');
    await page.keyboard.down(key);await page.waitForTimeout(120);await page.keyboard.up(key);
  }
  assert((await state()).dragon.boarding.eligible,(await state()).dragon.boarding.message);
  await page.keyboard.press('f');await page.waitForFunction(()=>{const s=(window as any).playground.getState();return s.activeVehicle==='dragon'&&s.transitionSeconds===0;},{},{timeout:15000});
  await page.keyboard.press('q');await page.waitForFunction(()=>(window as any).playground.getState().flyingCreature.groundPhase==='airborne',{},{timeout:20000});
}
try{
  await page.goto(base);await waitMap('campus');
  await page.waitForFunction(()=>(window as any).playground.getState().ready);
  if(selectionOnly){
    const selected=await page.evaluate(()=>(window as any).playground.selectVehicle('dragon'));
    assert.equal(selected.mapId,'flying-creature-training');assert.equal(selected.activeVehicle,null);assert.equal(selected.camera.viewKind,'third-person');
    for(let i=0;i<2;i++){
      const reset=await page.evaluate(()=>(window as any).playground.reset());
      assert.equal(reset.mapId,'flying-creature-training');assert.equal(reset.activeVehicle,null);assert.equal(reset.camera.viewId,selected.camera.viewId);assert.equal(reset.camera.viewKind,'third-person');
      assert(reset.camera.position.every(Number.isFinite));
    }
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(output,'selection-reset.png')});
    await writeFile(path.join(output,'selection-reset.json'),JSON.stringify({selected,reset:await state(),errors},null,2));
  }else{
  await choose('飞龙 · 空中训练场');await waitMap('flying-creature-training');
  const initial=await state();assert.equal(initial.activeVehicle,null);assert.equal(initial.controlledEntityId,'person');assert.equal(page.frames().length,1);
  assert(await page.evaluate(()=>{let textured=false;window.__WORLDKIT_EVAL__!.scene.traverse((node:any)=>{if(node.isSkinnedMesh){const materials=Array.isArray(node.material)?node.material:[node.material];if(materials.some((m:any)=>m.map&&m.normalMap)&&node.skeleton?.bones.some((b:any)=>b.name==='Seat'))textured=true;}});return textured;}),'training dragon retains its color and normal textures');
  await summonAndBoard();
  const flightStart=await state();
  await page.locator('[data-worldkit-surface]').click();await page.keyboard.down('w');await page.keyboard.down('d');
  await page.waitForFunction(yaw=>{const delta=(window as any).playground.getState().flyingCreature.yawRadians-yaw;return Math.atan2(Math.sin(delta),Math.cos(delta))<-.3;},flightStart.flyingCreature.yawRadians);
  await page.keyboard.up('d');await page.keyboard.up('w');const turned=await state(),yaw=flightStart.flyingCreature.yawRadians;
  assert(-(turned.position[0]-flightStart.position[0])*Math.cos(yaw)+(turned.position[2]-flightStart.position[2])*Math.sin(yaw)>0,'D must move to the initial flight heading right');
  await page.keyboard.down('Control');await page.waitForFunction(()=>(window as any).playground.getState().speed===0);await page.keyboard.up('Control');
  await page.waitForTimeout(250);assert.equal((await state()).speed,0);
  await page.keyboard.down('Shift');await page.waitForFunction(()=>(window as any).playground.getState().speed>12);await page.keyboard.up('Shift');
  await page.waitForFunction(()=>(window as any).playground.getState().speed===0,{},{timeout:15000});
  // Shooting bindings are deferred: E descends, but must never emit flame.
  await page.keyboard.down('e');await page.waitForTimeout(300);await page.keyboard.up('e');
  const idle=await state();assert.equal(idle.speed,0);assert.equal(idle.flyingCreature.flamePhase,'off');assert.equal(idle.dragonVisual.flameParticles,0);
  assert(Math.hypot(...idle.riderHip.map((v:number,i:number)=>v-idle.dragonSeat[12+i]))<.001);
  await page.screenshot({path:path.join(output,'native-hover.png')});
  await page.keyboard.press('v');await page.waitForFunction(()=>(window as any).playground.getState().camera.viewKind==='first-person');await page.screenshot({path:path.join(output,'native-first-person.png')});
  await page.keyboard.press('v');await page.waitForFunction(()=>(window as any).playground.getState().camera.viewKind==='shoulder');
  await choose('飞机 · 起降训练场');await waitMap('aircraft-training');await choose('飞龙 · 空中训练场');await waitMap('flying-creature-training');
  const reset=await state();assert.equal(reset.activeVehicle,null);assert.equal(reset.dragon.state.flamePhase,'off');assert.equal(reset.dragonVisual.flameParticles,0);assert.equal(reset.camera.viewKind,'third-person');
  assert.equal(new URL(page.url()).hash,'#/scenes/flying-creature-training');
  await page.reload();await waitMap('flying-creature-training');assert.equal((await state()).activeVehicle,null);
  await choose('飞机 · 起降训练场');await waitMap('aircraft-training');
  await page.goBack();await waitMap('flying-creature-training');assert.equal((await state()).activeVehicle,null);
  await page.goForward();await waitMap('aircraft-training');
  await page.goto(new URL('/#/scenes/flying-creature-training',base).href);await waitMap('flying-creature-training');assert.equal((await state()).activeVehicle,null);
  await choose('飞机 · 起降训练场');await waitMap('aircraft-training');await page.reload();await waitMap('aircraft-training');
  await page.goto(new URL('/?dragon=D02#/scenes/flying-creature-training',base).href);await waitMap('flying-creature-training');
  assert.equal((await state()).dragonVariant,'D02');assert.equal((await state()).activeVehicle,null);
  const definitions=await (await page.request.get(new URL('/asset-definitions.json',base).href)).json();
  const variant=definitions.assets.find((asset:{id:string})=>asset.id==='creature.dragon.d02');
  assert(variant,'D02 must be present in the delivered library catalog');
  const model=variant.resources.find((resource:{path:string})=>resource.path===variant.integrationMetadata.visual.modelResource);
  assert(model,'D02 model alias must resolve through the delivered catalog');
  assert(requests.has(new URL(model.uri,base).href),'D02 must request its catalog-declared model bytes');
  assert.equal(page.frames().length,1);assert(![...requests].some(url=>/Havok|babylon|:5186|:5191/.test(url)));
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'result.json'),JSON.stringify({initial,idle,reset,approachSamples,errors,requests:[...requests]},null,2));
  }
}catch(error){
  await page.screenshot({path:path.join(output,'failure.png')});
  await writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error),state:await state().catch(()=>null),approachSamples,errors},null,2));throw error;
}finally{await browser.close();}
