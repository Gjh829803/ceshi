import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchChromiumWithSystemFallback} from '../lib/playwright-browser-launch';

const output=path.resolve('.codex-tmp/tank-browser');await mkdir(output,{recursive:true});
const browser=await launchChromiumWithSystemFallback({headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.argv[2]??'http://127.0.0.1:5175/');
 await page.waitForFunction(()=>Boolean((window as any).trainingGround?.getState().ready),{},{timeout:60000});
 const snapshot=()=>page.evaluate(()=>(window as any).__WORLDKIT_EVAL__.snapshot());
 const state=()=>page.evaluate(()=>(window as any).trainingGround.getState());
 const elapsed=async(seconds:number)=>{const t=(await state()).simulationTime;await page.waitForFunction(({t,seconds})=>(window as any).trainingGround.getState().simulationTime>=t+seconds,{t,seconds},{timeout:60000});};
 const hold=async(key:string,seconds:number)=>{await page.keyboard.down(key);await elapsed(seconds);await page.keyboard.up(key);};
 const runtimeBytes=await(await page.request.get(new URL('/runtime/worldkit-three.js',page.url()).href)).body();
 await page.locator('#libraryButton').click();await page.getByRole('searchbox',{name:'搜索资产'}).fill('坦克');
 await page.getByRole('button',{name:'查看履带坦克',exact:true}).click();await page.getByRole('button',{name:'前往资产',exact:true}).click();
 await page.mouse.click(700,500);await page.keyboard.press('f');await elapsed(.5);
 const mounted=await snapshot();assert.equal(mounted.training.mountedInstanceId,'tank');
 await page.evaluate(()=>{
  const stream=(document.querySelector('#viewport') as HTMLCanvasElement).captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks:Blob[]=[];
  recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
  (window as any).finishTankVideo=()=>new Promise<string>(resolve=>{recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>{stream.getTracks().forEach(t=>t.stop());resolve(String(reader.result).split(',')[1]!);};reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};recorder.stop();});
 });
 await page.screenshot({path:path.join(output,'third-person.png')});
 await page.keyboard.press('t');await elapsed(.4);const first=await snapshot();assert.equal(first.training.cameraMode,1);
 await page.screenshot({path:path.join(output,'first-person.png')});
 await hold('w',2);const forward=await state();assert(forward.speed>2);
 await page.keyboard.down('w');await hold('Shift',1.5);await page.keyboard.up('w');const boosted=await state();assert(boosted.speed>forward.speed+1);
 await hold('s',.3);const braking=await state();assert(braking.speed<boosted.speed);
 await hold('s',3);const reverse=await state();assert(reverse.movement.velocity[2]<-1);
 await hold('Space',1);assert((await state()).speed<.1);
 await page.keyboard.press('t');await elapsed(.4);assert.equal((await snapshot()).training.cameraMode,2);await page.screenshot({path:path.join(output,'shoulder.png')});
 await page.keyboard.press('t');await elapsed(.4);
 const prePivot=await snapshot();await hold('a',1.2);await hold('d',1.2);await elapsed(1.5);const pivot=await snapshot();
 const dynamics=(s:any)=>s.training.vehicleDynamics.find((v:any)=>v.instanceId==='tank').tank;
 const b=dynamics(prePivot),a=dynamics(pivot);assert(Math.abs((a.leftTravel-b.leftTravel)-(a.rightTravel-b.rightTravel))>.02);
 await hold('q',1);await hold('ArrowUp',1);const aimed=await snapshot();assert(dynamics(aimed).turretYaw>dynamics(pivot).turretYaw+.5);assert(dynamics(aimed).gunElevation>.2);
 await hold('e',1);await hold('ArrowDown',1);await elapsed(.5);const restored=await snapshot();assert(Math.abs(dynamics(restored).turretYaw-dynamics(pivot).turretYaw)<.03);assert(Math.abs(dynamics(restored).gunElevation)<.03);
 await page.mouse.move(700,500);await page.mouse.down();await page.mouse.move(1120,490,{steps:20});await page.mouse.up();await elapsed(.5);await page.screenshot({path:path.join(output,'front-quarter.png')});
 await page.keyboard.press('f');await elapsed(.5);const exited=await snapshot();assert.equal(exited.training.mountedInstanceId,null);
 const video=await page.evaluate(()=>(window as any).finishTankVideo());await writeFile(path.join(output,'tank-input.webm'),Buffer.from(video,'base64'));
 await page.evaluate(()=>(window as any).trainingGround.reset());const reset=await snapshot();assert.equal(reset.training.mountedInstanceId,null);assert.deepEqual(dynamics(reset),{turretYaw:0,gunElevation:0,leftTravel:0,rightTravel:0,articulationBlocked:false});assert.deepEqual(errors,[]);
 const report={runtimeSha256:createHash('sha256').update(runtimeBytes).digest('hex'),runtimeBytes:runtimeBytes.length,mounted,first,forward,boosted,braking,reverse,pivot,aimed,restored,exited,reset,errors};
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:'passed',output,runtimeSha256:report.runtimeSha256,errors}));
}finally{await browser.close();}
