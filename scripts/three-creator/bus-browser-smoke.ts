import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchChromiumWithSystemFallback} from '../lib/playwright-browser-launch';
const output=path.resolve('outputs/bus/browser');await mkdir(output,{recursive:true});
const browser=await launchChromiumWithSystemFallback({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>(window as any).trainingGround.getState());
const elapsed=async(seconds:number)=>{const t=(await state()).simulationTime;await page.waitForFunction(({t,seconds})=>(window as any).trainingGround.getState().simulationTime>=t+seconds,{t,seconds},{timeout:60000});};
const hold=async(key:string,seconds:number)=>{await page.keyboard.down(key);await elapsed(seconds);await page.keyboard.up(key);};
try{
 await page.goto(process.argv[2]??'http://127.0.0.1:5175/');
 await page.waitForFunction(()=>Boolean((window as any).trainingGround?.getState().ready),{},{timeout:60000});
 const runtimeBytes=await(await page.request.get(new URL('/runtime/worldkit-three.js',page.url()).href)).body();
 await page.locator('#libraryButton').click();await page.getByRole('searchbox',{name:'搜索资产'}).fill('巴士');
 await page.getByRole('button',{name:'查看复古小巴',exact:true}).click();await page.screenshot({path:path.join(output,'library.png')});
 await page.getByRole('button',{name:'前往资产',exact:true}).click();await elapsed(.3);
 await page.mouse.click(700,500);await page.keyboard.press('f');await elapsed(.6);assert.equal((await state()).activeVehicle,'bus');
 await page.evaluate(()=>{
  const stream=(document.querySelector('#viewport') as HTMLCanvasElement).captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks:Blob[]=[];
  recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
  (window as any).finishBusVideo=()=>new Promise<string>(resolve=>{recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>{stream.getTracks().forEach(t=>t.stop());resolve(String(reader.result).split(',')[1]!);};reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};recorder.stop();});
 });
 const start=await state();await page.screenshot({path:path.join(output,'third-person.png')});
 await page.keyboard.press('t');await elapsed(.5);const first=await state();assert.equal(first.camera.mode,1);
 await page.screenshot({path:path.join(output,'first-person.png')});
 await hold('w',5);const forward=await state();assert(forward.speed>3);
 await hold('s',.3);const braking=await state();assert(braking.speed<forward.speed);
 await hold('s',7);const reverse=await state();assert(reverse.movement.velocity[2]<-1);
 await hold(' ',2);const stopped=await state();assert(stopped.speed<.1);
 await page.keyboard.press('t');await elapsed(.3);await page.screenshot({path:path.join(output,'shoulder.png')});
 await page.keyboard.press('t');await elapsed(.3);
 await page.keyboard.down('w');await hold('a',3);await page.keyboard.up('w');const turn=await state();assert(Math.abs(turn.position[0]-stopped.position[0])>.2);
 await hold(' ',2);
 await page.mouse.move(700,500);await page.mouse.down();await page.mouse.move(1220,460,{steps:20});await page.mouse.up();await elapsed(.4);
 await page.screenshot({path:path.join(output,'front-quarter.png')});
 await page.keyboard.press('f');await elapsed(.5);assert.equal((await state()).activeVehicle,null);
 const video=await page.evaluate(()=>(window as any).finishBusVideo());await writeFile(path.join(output,'bus-input.webm'),Buffer.from(video,'base64'));
 const snow=[];
 for(const id of ['sled','ski']){
  await page.evaluate(id=>(window as any).trainingGround.selectVehicle(id),id);await page.mouse.click(700,500);await page.keyboard.press('f');await elapsed(.5);assert.equal((await state()).activeVehicle,id);
  const cameras=[];for(let n=0;n<3;n++){await page.keyboard.press('t');await elapsed(.25);cameras.push((await state()).camera.mode);await page.screenshot({path:path.join(output,`${id}-camera-${n}.png`)});}assert.equal(new Set(cameras).size,3);
  const before=await state();await hold('w',2);const after=await state();assert(after.speed>.2);
  await hold('s',2);assert((await state()).speed<.1);await page.keyboard.press('f');await elapsed(.3);assert.equal((await state()).activeVehicle,null);snow.push({id,cameras,before,after});
 }
 await page.evaluate(()=>(window as any).trainingGround.reset());assert.equal((await state()).activeVehicle,null);assert.deepEqual(errors,[]);
 const report={runtimeSha256:createHash('sha256').update(runtimeBytes).digest('hex'),runtimeBytes:runtimeBytes.length,start,first,forward,braking,reverse,stopped,turn,snow,errors};
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,forward:forward.speed,reverse:reverse.speed,stopped:stopped.speed,snow:snow.map(s=>({id:s.id,cameras:s.cameras})),errors}));
}catch(error){console.log(JSON.stringify(await state()));await page.screenshot({path:path.join(output,'failure.png')});throw error;}finally{await browser.close();}
