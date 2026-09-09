import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

// Focused regression for camera gestures and authored map/asset destinations.
const output=path.resolve('outputs/training-camera-fix/browser');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
const state=()=>page.evaluate(()=>(window as any).trainingGround.getState());
const snapshot=()=>page.evaluate(()=>(window as any).__WORLDKIT_EVAL__.snapshot());
const settle=async()=>{const t=(await state()).simulationTime;await page.waitForFunction(t=>(window as any).trainingGround.getState().simulationTime>t+.15,t);};
try{
 await page.goto(process.argv[2]??'http://127.0.0.1:5178/');
 await page.waitForFunction(()=>Boolean((window as any).trainingGround?.getState().ready),{},{timeout:60000});
 await settle();
 const canvas=page.locator('canvas').first(),box=await canvas.boundingBox();assert(box);
 const x=box.x+box.width*.55,y=box.y+box.height*.55;
 const before=await state();await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y+40,{steps:10});await page.mouse.up();await settle();
 const drag=await state();assert(Math.abs(drag.camera.yaw-before.camera.yaw+.4)<.015,'right drag must decrease source orbit yaw');
 assert(Math.abs(drag.camera.pitch-before.camera.pitch-.16)<.015,'down drag must preserve source character pitch');
 await page.locator('#resetButton').click();await settle();
 const walkingStart=await state();await page.mouse.click(x,y);await page.keyboard.down('s');
 await page.waitForFunction(t=>(window as any).trainingGround.getState().simulationTime>t+1,walkingStart.simulationTime);
 await page.keyboard.up('s');const walkingEnd=await state();
 const relative=(s:any)=>s.camera.position.map((n:number,i:number)=>n-s.position[i]);
 const armDrift=Math.hypot(...relative(walkingEnd).map((n:number,i:number)=>n-relative(walkingStart)[i]));
 assert(armDrift<.03,`follow translation stretched the arm: ${armDrift}`);
 await page.locator('#mapSelect').click();await page.getByRole('option').filter({hasText:'人物 · 综合动作工坊'}).click();await settle();
 const workshop=await state();assert(Math.abs(workshop.position[0]+32)<.1&&Math.abs(workshop.position[2]-23)<.1,'map entry must be the action workshop');
 assert(Math.cos(workshop.camera.yaw)<-.99,'map entry must face the actions');
 await page.screenshot({path:path.join(output,'character-workshop.png')});
 await page.locator('#mapSelect').click();await page.getByRole('option').filter({hasText:'室内'}).click();await settle();
 const indoor=await state();assert(Math.abs(indoor.position[0])<.1&&Math.abs(indoor.position[2]+31)<.1);assert.equal(indoor.camera.distance,5.6);
 await page.locator('#mapSelect').click();await page.getByRole('option').filter({hasText:'VECTOR 综合训练园区'}).click();await settle();
 const boatBefore=(await snapshot()).entities.find((e:any)=>e.id==='patrol-boat').positionWorldMetersXYZ;
 await page.locator('#libraryButton').click();await page.getByRole('searchbox',{name:'搜索资产'}).fill('巡逻艇');
 await page.getByRole('button',{name:'查看水域巡逻艇',exact:true}).click();await page.getByRole('button',{name:'前往资产',exact:true}).click();await settle();
 const patrol=await state(),boatAfter=(await snapshot()).entities.find((e:any)=>e.id==='patrol-boat').positionWorldMetersXYZ;
 assert(patrol.position[0]>200&&patrol.position[0]<215&&Math.abs(patrol.position[2]-24)<4,'library approach must reach the water patrol berth');
 assert(Math.hypot(boatBefore[0]-boatAfter[0],boatBefore[2]-boatAfter[2])<.02,'approach must not reset or relocate the vehicle');
 await page.keyboard.press('f');await settle();assert.equal((await state()).activeVehicle,'patrol-boat');
 await page.screenshot({path:path.join(output,'patrol-boat.png')});
 const modes=[];for(let i=0;i<3;i++){await page.locator('#cameraButton').click();await settle();modes.push((await state()).camera.mode);}
 assert.equal(new Set(modes).size,3);assert.deepEqual(errors,[]);
 const report={dragYawRadians:drag.camera.yaw-before.camera.yaw,dragPitchRadians:drag.camera.pitch-before.camera.pitch,armDriftMeters:armDrift,workshop,indoor,patrol,boatBefore,boatAfter,modes,errors};
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,...report}));
}finally{await browser.close();}
