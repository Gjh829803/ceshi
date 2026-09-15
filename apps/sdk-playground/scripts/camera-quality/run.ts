import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { launchChromiumWithSystemFallback } from '@worldkit/browser-capture/browser';
import { CAMERA_ROUTES } from './routes';
import { compareCameraRoute, type CameraRouteFrame } from './report';
import {cameraRouteSourceIdentity} from './identity';

const {values}=parseArgs({options:{url:{type:'string',default:'http://127.0.0.1:5190'},output:{type:'string',default:'output/playwright/camera-quality/routes'},baseline:{type:'string'},profiling:{type:'boolean',default:false},route:{type:'string'}}});
const output=path.resolve(values.output!);await mkdir(output,{recursive:true});
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const source=await cameraRouteSourceIdentity();
const harnessHash=hash(Buffer.concat(await Promise.all(['run.ts','routes.ts','report.ts','identity.ts'].map(name=>readFile(new URL(name,import.meta.url))))));
const baseline=values.baseline?JSON.parse(await readFile(values.baseline,'utf8')):undefined;
if(baseline)assert.equal(baseline.harnessHash,harnessHash,'Baseline must use the same harness');
const results: {id:string;inputHash:string;frames:CameraRouteFrame[];performance:unknown;comparison?:ReturnType<typeof compareCameraRoute>;advanceP95Milliseconds:number}[]=[];
const browser=await launchChromiumWithSystemFallback();
try {
  for(const route of CAMERA_ROUTES.filter(route=>!values.route||values.route.split(',').includes(route.id))) {
    console.log(`Camera route: ${route.id}`);
    const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    try {
      await page.goto(`${values.url}/#/scenes/${route.scene}`);
      await page.waitForFunction(()=>!!(window as any).playground?.getState().ready,{},{timeout:90000});
      if(values.profiling){
        await page.getByRole('tab',{name:'相机模式',exact:true}).click();
        await page.getByText('相机性能采样',{exact:true}).first().click();
        await page.getByRole('checkbox',{name:'相机性能采样',exact:true}).check();
        await page.waitForFunction(()=>window.__WORLDKIT_EVAL__?.inspectCamera?.().performance?.status==='measured');
      }
      await page.evaluate(async start=>{
        const observer=window.__WORLDKIT_EVAL__!;observer.stopLive();
        const probe=observer.episode!.probeStart(start);if(!probe.isValid)throw Error(JSON.stringify(probe));
        await observer.episode!.prepareSegment(start,{widthPixels:960,heightPixels:600});
      },route.start);
      const frames:CameraRouteFrame[]=[],costs:number[]=[];
      let tick=0;
      const segments=route.exitVehicle?[...route.segments,{ticks:120,input:{moveZRatio:1}}]:route.segments;
      for(const [segmentIndex,segment] of segments.entries()){
        if(segmentIndex===route.segments.length){
          await page.evaluate(async()=>{const receipt=await window.__WORLDKIT_EVAL__!.episode!.execute({type:'vehicle.exit'});if(receipt.status==='rejected')throw Error(JSON.stringify(receipt));});
        }
        for(let remaining=segment.ticks;remaining>0;){
          const count=Math.min(6,remaining);remaining-=count;tick+=count;
          const result=await page.evaluate(({input,count,tick})=>{
            const port=window.__WORLDKIT_EVAL__!.episode!;
            const started=performance.now();const snapshot=port.advance(input,count);const advanceMilliseconds=performance.now()-started;
            if(snapshot.errors.length)throw Error(JSON.stringify(snapshot.errors));
            const frame=port.frame('image/jpeg');
            const entity=snapshot.entities.find(entity=>entity.id===snapshot.controlledEntityId)!;
            return {advanceMilliseconds,image:frame.imageDataUrl,frame:{tick,collisionPhase:snapshot.camera.collisionPhase??null,position:snapshot.camera.positionWorldMetersXYZ,quaternion:snapshot.camera.orientationWorldQuaternionXYZW,actor:entity.positionWorldMetersXYZ,viewId:snapshot.camera.viewId,verticalFovDegrees:2*Math.atan(1/frame.camera.projectionMatrix[5]!)*180/Math.PI,controlForward:frame.camera.controlForwardWorldXYZ}};
          },{input:segment.input,count,tick});
          frames.push(result.frame);costs.push(result.advanceMilliseconds/count);
          const directory=path.join(output,route.id);await mkdir(directory,{recursive:true});
          await writeFile(path.join(directory,`frame-${String(frames.length).padStart(4,'0')}.jpg`),Buffer.from(result.image.split(',')[1]!,'base64'));
        }
      }
      if(route.id === "indoor-wall-orbit")assert(frames.some(frame => frame.collisionPhase && frame.collisionPhase !== "clear"), "Wall route did not exercise constraints");
      if(route.exitVehicle){
        const mounted=await page.evaluate(()=>{
          const observer=window.__WORLDKIT_EVAL__;
          if(!observer?.snapshot)throw Error('CAMERA_ROUTE_SNAPSHOT_UNAVAILABLE');
          const humanoid=observer.snapshot().humanoid;
          if(!humanoid)throw Error('CAMERA_ROUTE_HUMANOID_UNAVAILABLE');
          return humanoid.mountedInstanceId;
        });
        assert(!mounted,'CAMERA_ROUTE_DID_NOT_DISMOUNT');
        await writeFile(path.join(output,route.id,'after-exit.jpg'),await readFile(path.join(output,route.id,`frame-${String(frames.length).padStart(4,'0')}.jpg`)));
      }
      const performanceReading=await page.evaluate(()=>window.__WORLDKIT_EVAL__!.inspectCamera?.().performance??null);
      await page.evaluate(()=>window.__WORLDKIT_EVAL__!.episode!.release());
      assert.deepEqual(errors,[]);
      const inputHash=hash(JSON.stringify(route)),previous=baseline?.routes.find((entry:{id:string})=>entry.id===route.id);
      if(baseline)assert(previous,`Missing baseline ${route.id}`);
      if(previous)assert.equal(previous.inputHash,inputHash,'Baseline must use the same route');
      const comparison=previous?compareCameraRoute(frames,previous.frames):undefined;
      if(comparison){assert(comparison.maximumPositionErrorMeters<2e-5);assert(comparison.maximumActorErrorMeters<2e-5);assert(comparison.maximumOrientationErrorRadians<2e-7);assert(comparison.maximumControlDirectionError<2e-7);assert(comparison.maximumFovErrorDegrees<2e-7);}
      costs.sort((a,b)=>a-b);
      results.push({id:route.id,inputHash,frames,performance:performanceReading,...(comparison?{comparison}:{}),advanceP95Milliseconds:costs[Math.ceil(costs.length*.95)-1]!});
      await writeFile(path.join(output,'report.json'),JSON.stringify({kind:'camera-maintenance-routes',harnessHash,source,url:values.url,profiling:values.profiling,sampleFrequencyHertz:10,routes:results},null,2));
      console.log(`${route.id}: ${frames.length} frames; ${comparison?'baseline matched':'recorded'}`);
    }finally{await context.close();}
  }
  assert(results.length,'No routes selected');assert.deepEqual(await cameraRouteSourceIdentity(),source,'Source changed during capture');
}finally{await browser.close();}
