import { launchChromiumWithSystemFallback } from '../lib/playwright-browser-launch';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('outputs/training-migration/browser');await mkdir(output,{recursive:true});
const selected=process.argv[3]?.split(',');
const browser=await launchChromiumWithSystemFallback({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(process.argv[2]??'http://127.0.0.1:5175/');
  await page.waitForFunction(()=>Boolean((window as any).trainingGround?.getState().ready),{},{timeout:60000});
  await page.screenshot({path:path.join(output,'workspace.png')});
  const initial=await page.evaluate(()=>(window as any).trainingGround.getState());
  await page.evaluate(()=>{(window as any).keyEvidence=[];for(const capture of [true,false])document.addEventListener('keydown',e=>(window as any).keyEvidence.push({code:e.code,repeat:e.repeat,capture,target:(e.target as HTMLElement).outerHTML.slice(0,200)}),capture);});
  await page.mouse.click(640,500);await page.keyboard.down('w');await page.waitForTimeout(800);await page.keyboard.up('w');
  const moved=await page.evaluate(()=>(window as any).trainingGround.getState());
  const distance=Math.hypot(...moved.position.map((n:number,i:number)=>n-initial.position[i]));
  if(distance<.1){console.log(JSON.stringify(await page.evaluate(()=>({state:(window as any).trainingGround.getState(),errors:(window as any).__WORLDKIT_EVAL__.snapshot().errors,keyEvidence:(window as any).keyEvidence,input:(window as any).__WORLDKIT_EVAL__.inspect().inputTranscript,focus:document.activeElement?.id})),null,2));throw new Error(`TRAINING_KEYBOARD_DID_NOT_MOVE: ${distance}`);}
  const results=[];
  for(const id of ['tank','rover','racer','bike','slide','bus','sled','ski','hover','boat','sub','glider','plane','space','trail-rover','touring-bike','rescue-hover','patrol-boat','trainer-plane','survey-space','horse','carriage','dragon']){
    if(selected&&!selected.includes(id))continue;
    await page.evaluate(id=>(window as any).trainingGround.selectVehicle(id),id);
    await page.keyboard.press('f');await page.waitForTimeout(650);
    const mounted=await page.evaluate(()=>(window as any).trainingGround.getState());
    const cameraModes=[];for(let n=0;n<3;n++){await page.locator('#cameraButton').click();cameraModes.push(await page.evaluate(()=>(window as any).trainingGround.getState().camera.mode));}
    await page.keyboard.press('f');await page.waitForTimeout(450);
    const exited=await page.evaluate(()=>(window as any).trainingGround.getState().activeVehicle===null);
    await page.evaluate(id=>(window as any).trainingGround.selectVehicle(id),id);await page.keyboard.press('f');
    const before=await page.evaluate(()=>(window as any).trainingGround.getState());
    const driveKey=['plane','glider','trainer-plane'].includes(id)?'Shift':'w';
    await page.keyboard.down(driveKey);await page.waitForTimeout(900);await page.keyboard.up(driveKey);
    const after=await page.evaluate(()=>(window as any).trainingGround.getState());
    const movedMeters=Math.hypot(...after.position.map((n:number,i:number)=>n-before.position[i]));
    await page.evaluate(()=>(window as any).trainingGround.reset());
    const reset=await page.evaluate(()=>(window as any).trainingGround.getState().activeVehicle===null);
    results.push({id,mounted:mounted.activeVehicle===id,exited,reset,movedMeters,cameraModes,mode:mounted.mode});
  }
  for(const id of ['indoor-lab','character-workshop','campus']){await page.locator('#mapSelect').selectOption(id);await page.waitForTimeout(300);}
  const final=await page.evaluate(()=>(window as any).trainingGround.getState());
  await page.mouse.click(640,500);await page.keyboard.down('w');await page.waitForTimeout(100);
  const reset=await page.evaluate(()=>(window as any).trainingGround.reset());await page.waitForTimeout(350);await page.keyboard.up('w');
  const idle=await page.evaluate(()=>(window as any).trainingGround.getState());
  const driftAfterHeldReset=Math.hypot(idle.position[0]-reset.position[0],idle.position[2]-reset.position[2]);
  const commandStart=await page.evaluate(()=>(window as any).trainingGround.getState());
  const receipt=await page.evaluate(()=>(window as any).__WORLDKIT_EVAL__.execute({type:'training.input',input:{forward:1,steer:0,roll:0,lift:0,pitch:0,strafe:0,boost:false,brake:false,slow:false,jump:false}}));
  await page.waitForTimeout(500);
  await page.evaluate(()=>(window as any).__WORLDKIT_EVAL__.execute({type:'training.input',input:null}));
  const commandEnd=await page.evaluate(()=>(window as any).trainingGround.getState());
  const modelInputMeters=Math.hypot(...commandEnd.position.map((n:number,i:number)=>n-commandStart.position[i]));
  await writeFile(path.join(output,selected?'report-selected.json':'report.json'),JSON.stringify({initial,distance,vehicles:results,final,driftAfterHeldReset,modelInputMeters,errors},null,2));
  console.log(JSON.stringify({distance,vehicles:results,finalMap:final.mapId,driftAfterHeldReset,modelInputMeters,errors,output}));
  if(errors.length||driftAfterHeldReset>.1||receipt.status!=='applied'||modelInputMeters<.1||results.some(r=>!r.mounted||!r.exited||!r.reset||r.movedMeters<.05||new Set(r.cameraModes).size!==3))process.exitCode=1;
}finally{await browser.close();}
