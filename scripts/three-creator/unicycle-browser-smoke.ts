import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {launchChromiumWithSystemFallback} from '../lib/playwright-browser-launch';

const output=path.resolve('.codex-tmp/unicycle-browser');await mkdir(output,{recursive:true});
const browser=await launchChromiumWithSystemFallback({headless:true,args:['--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.argv[2]??'http://127.0.0.1:5178/');
  await page.waitForFunction(()=>Boolean((window as any).playground?.getState().ready),{},{timeout:60000});
  const snapshot=()=>page.evaluate(()=>(window as any).__WORLDKIT_EVAL__.snapshot());
  const state=()=>page.evaluate(()=>(window as any).playground.getState());
  const elapsed=async(seconds:number)=>{const t=(await state()).simulationTime;await page.waitForFunction(({t,seconds})=>(window as any).playground.getState().simulationTime>=t+seconds,{t,seconds},{timeout:60000});};
  const dynamics=(s:any)=>s.humanoid.vehicleDynamics.find((v:any)=>v.instanceId==='unicycle').unicycle;
  await elapsed(.6);
  await page.locator('#libraryButton').click();await page.getByRole('searchbox',{name:'搜索资产'}).fill('独轮车');
  await page.getByRole('button',{name:'查看独轮车',exact:true}).click();await page.getByRole('button',{name:'前往资产',exact:true}).click();
  assert((await state()).position[0]<-50,'Library approach must reach the unicycle');
  await page.screenshot({path:path.join(output,'approach.png')});
  await page.mouse.click(700,500);
  await page.evaluate(()=>{
    const stream=(document.querySelector('#viewport') as HTMLCanvasElement).captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks:Blob[]=[];
    recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
    (window as any).finishUnicycleVideo=()=>new Promise<string>(resolve=>{recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>{stream.getTracks().forEach(t=>t.stop());resolve(String(reader.result).split(',')[1]!);};reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};recorder.stop();});
  });
  await page.keyboard.press('f');await elapsed(.8);const mounted=await snapshot();assert.equal(mounted.humanoid.mountedInstanceId,'unicycle',JSON.stringify({message:mounted.humanoid.message,state:await state()}));assert.equal(dynamics(mounted).phase,'supported');
  await page.mouse.move(700,500);await page.mouse.down();await page.mouse.move(1070,490,{steps:20});await page.mouse.up();await elapsed(.3);
  await page.screenshot({path:path.join(output,'supported.png')});
  await page.keyboard.down('w');await elapsed(.18);const lifting=await snapshot();assert.equal(dynamics(lifting).phase,'lifting');
  await page.screenshot({path:path.join(output,'lifting.png')});await elapsed(1.8);const riding=await snapshot();assert.equal(dynamics(riding).phase,'riding');assert((await state()).speed>1);
  await page.screenshot({path:path.join(output,'riding.png')});await page.keyboard.down('a');await elapsed(.7);await page.keyboard.up('a');await page.keyboard.up('w');
  await elapsed(3);const stopped=await snapshot();assert.equal(stopped.humanoid.mountedInstanceId,'unicycle');assert.equal(dynamics(stopped).phase,'supported');
  await page.screenshot({path:path.join(output,'stopped.png')});
  await page.keyboard.down('w');await elapsed(.18);const restart=await snapshot();assert.equal(dynamics(restart).phase,'lifting');await page.screenshot({path:path.join(output,'restart.png')});await elapsed(1);await page.keyboard.up('w');
  await page.keyboard.down('Space');await elapsed(1.5);await page.keyboard.up('Space');assert.equal(dynamics(await snapshot()).phase,'supported');
  await page.keyboard.down('s');await elapsed(1.5);await page.keyboard.up('s');await elapsed(2);const reverse=await snapshot();assert.equal(dynamics(reverse).phase,'supported');
  for(let n=0;n<3;n++){await page.keyboard.press('t');await elapsed(.25);}
  await page.keyboard.press('f');await elapsed(.5);const exited=await snapshot();assert.equal(exited.humanoid.mountedInstanceId,null);
  const before=await state();await page.keyboard.down('w');await elapsed(.6);await page.keyboard.up('w');const walked=await state();assert(Math.hypot(...walked.position.map((v:number,i:number)=>v-before.position[i]))>.15);
  const video=await page.evaluate(()=>(window as any).finishUnicycleVideo());await writeFile(path.join(output,'unicycle-input.webm'),Buffer.from(video,'base64'));
  await page.evaluate(()=>(window as any).playground.reset());const reset=await snapshot();assert.equal(reset.humanoid.mountedInstanceId,null);assert.equal(dynamics(reset).wheelAngle,0);assert.deepEqual(errors,[]);
  const report={mounted,lifting,riding,stopped,restart,reverse,exited,reset,errors};
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:'passed',output,errors}));
}finally{await browser.close();}
