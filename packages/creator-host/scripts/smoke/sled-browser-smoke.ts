import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';

const output=path.resolve('outputs/sled/browser');await mkdir(output,{recursive:true});
const browser=await launchChromiumWithSystemFallback({headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
const state=()=>page.evaluate(()=>(window as any).trainingGround.getState());
const elapsed=async(seconds:number)=>{const t=(await state()).simulationTime;await page.waitForFunction(({t,seconds})=>(window as any).trainingGround.getState().simulationTime>=t+seconds,{t,seconds},{timeout:30000});};
const hold=async(key:string,seconds:number)=>{await page.keyboard.down(key);await elapsed(seconds);await page.keyboard.up(key);};
try{
  await page.goto(process.argv[2]??'http://127.0.0.1:5175/');
  const runtimeBytes=await (await page.request.get(new URL('/runtime/worldkit-three.js',page.url()).href)).body();
  const runtimeSha256=createHash('sha256').update(runtimeBytes).digest('hex');
  await page.waitForFunction(()=>Boolean((window as any).trainingGround?.getState().ready),{},{timeout:60000});
  await page.locator('#libraryButton').click();
  await page.getByRole('searchbox',{name:'搜索资产'}).fill('雪橇');
  await page.getByRole('button',{name:'查看木座雪橇',exact:true}).click();
  await page.screenshot({path:path.join(output,'library.png')});
  await page.getByRole('button',{name:'前往资产',exact:true}).click();await elapsed(.3);
  await page.keyboard.press('f');await elapsed(.7);assert.equal((await state()).activeVehicle,'sled');
  // Orbit around the occupied asset for a low side view, preserving normal input ownership.
  const box=await page.locator('#viewport').boundingBox();assert(box);
  const x=box.x+box.width*.5,y=box.y+box.height*.5;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+360,y-90,{steps:16});await page.mouse.up();await elapsed(.25);
  await page.screenshot({path:path.join(output,'rider-side.png')});
  await page.keyboard.press('f');await elapsed(.6);assert.equal((await state()).activeVehicle,null);
  await page.locator('#scenesButton').click();await page.getByLabel('测试主体',{exact:true}).selectOption('sled');
  await page.locator('.wb-scene').filter({hasText:/11 \/ .*雪橇坡道/}).getByRole('button',{name:'准备 木座雪橇 →'}).click();
  await elapsed(.2);await page.mouse.click(x,y);await page.keyboard.press('f');await elapsed(.7);
  const start=await state();assert.equal(start.activeVehicle,'sled');assert(start.position[1]>16);
  // Record the renderer's pure pixels during real keyboard input, not UI composites.
  await page.evaluate(()=>{
    const stream=(document.querySelector('#viewport') as HTMLCanvasElement).captureStream(30);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks:Blob[]=[];
    recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
    (window as any).finishSledVideo=()=>new Promise<string>(resolve=>{recorder.onstop=()=>{
      const reader=new FileReader();reader.onload=()=>{stream.getTracks().forEach(t=>t.stop());resolve(String(reader.result).split(',')[1]!);};reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));
    };recorder.stop();});
  });
  await hold('w',5);const pushed=await state();
  await elapsed(3);const coast=await state();assert(coast.speed>pushed.speed+.5,'gravity must accelerate after W is released');
  await page.screenshot({path:path.join(output,'downhill.png')});
  await hold('a',.55);const turn=await state();
  assert(Math.abs(turn.position[0]-coast.position[0])>.08,'foot steering must change the trajectory');
  await hold(' ',3);const stopped=await state();assert(stopped.speed<.1,'drag braking must stop on the slope');
  await page.keyboard.down(' ');await elapsed(.3);await page.screenshot({path:path.join(output,'braking.png')});await page.keyboard.up(' ');
  await page.keyboard.press('f');await elapsed(.6);const exit=await state();assert.equal(exit.activeVehicle,null);
  const video=await page.evaluate(()=>(window as any).finishSledVideo());await writeFile(path.join(output,'sled-input.webm'),Buffer.from(video,'base64'));
  await page.locator('#resetButton').click();await elapsed(.3);assert.equal((await state()).activeVehicle,null);
  assert.deepEqual(errors,[]);
  const report={runtimeSha256,runtimeBytes:runtimeBytes.length,start,pushed,coast,turn,stopped,exit,errors};await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({output,pushSpeed:pushed.speed,coastSpeed:coast.speed,stoppedSpeed:stopped.speed,errors}));
}catch(error){console.log(JSON.stringify({state:await state(),text:await page.locator('body').innerText()}));await page.screenshot({path:path.join(output,'failure.png')});throw error;}finally{await browser.close();}
