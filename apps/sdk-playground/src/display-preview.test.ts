import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromiumWithSystemFallback } from '@worldkit/browser-capture/browser';

describe('diagnostic preview and clean source pixels', () => {
  let browser: Browser, script: string;
  beforeAll(async () => {
    script = (await build({ stdin: { resolveDir: process.cwd(), contents: `
      import * as T from 'three';
      import { createDisplayPreview } from './apps/sdk-playground/src/display-preview';
      import { defaultDisplaySettings } from './apps/sdk-playground/src/display-settings';
      import { ThreePresentation } from './packages/three-world/src/presentation';
      const mount=document.createElement('div');mount.style.cssText='position:relative;width:128px;height:128px';document.body.append(mount);
      const source=new T.WebGLRenderer({preserveDrawingBuffer:true});source.setPixelRatio(window.testPixelRatio??1);source.setSize(128,128);mount.append(source.domElement);
      const scene=new T.Scene(),camera=window.testOrthographic?new T.OrthographicCamera(-2,2,2,-2,.1,100):new T.PerspectiveCamera(50,1,.1,100);camera.position.z=5;
      const glass=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({color:0x00ffff,transparent:true,opacity:.3,depthWrite:false}));glass.position.z=1;glass.visible=false;scene.add(glass);
      const mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial({color:0xff0000}));scene.add(mesh);
      const holeTexture=new T.DataTexture(new Uint8Array([0,255,0,0]),1,1);holeTexture.needsUpdate=true;
      const hole=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({map:holeTexture,transparent:true,depthWrite:false}));hole.position.z=2;scene.add(hole);
      const originalMaterial=mesh.material, before=camera.position.toArray();
      const renderListeners=new Set();let sourceHidden=false,displayX=null,observedX=null;
      function withSubjectSample(work){const x=mesh.position.x;if(displayX!==null)mesh.position.x=displayX;try{return work();}finally{mesh.position.x=x;mesh.updateMatrixWorld(true);}}
      function renderSource(){const visible=mesh.visible;if(sourceHidden)mesh.visible=false;try{withSubjectSample(()=>source.render(scene,camera));}finally{mesh.visible=visible;}for(const callback of renderListeners)callback(.5);}
      const presentation=new ThreePresentation({canvas:source.domElement,camera,render:()=>renderSource(),stamp:()=>({simulationTick:7,worldRevision:3}),object:()=>mesh,onRender:()=>()=>{},onChange:()=>()=>{},bindInput:()=>()=>{},focus:()=>{},released:()=>{}},{});
      const preview=createDisplayPreview({scene,camera,source,mount,withPresentation:withSubjectSample,onRender:callback=>{renderListeners.add(callback);return ()=>renderListeners.delete(callback);},inputSurface:presentation.inputSurface,collisionDiagnostics:()=>({sampleId:1,source:'fixed',simulationTick:7,probes:[{from:[0,0,5],to:[0,0,0],radius:.2,hit:{distanceMeters:2,colliderEntityId:'wall',normalWorldXYZ:[0,0,1],hitPositionWorldMetersXYZ:[0,0,2.8]}}],droppedProbes:0}),context:()=>({roots:[{object:mesh,type:'person'}],subjects:[mesh]}),onError:e=>{throw e;}});
      function pixel(canvas){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0,128,128);return [...ctx.getImageData(64,64,1,1).data];}
      // Host resamples through the SDK after source-only clipping is restored.
      // In the fixture only the subject transform is interpolated.
      window.testPreview={
        rangeFrame(range){
          let helperFar;scene.onBeforeRender=()=>{const root=scene.getObjectByName('display-camera');root?.traverse(node=>{if(node instanceof T.CameraHelper)helperFar=node.camera.far;});};
          const before={far:camera.far,fov:camera.fov,projection:camera.projectionMatrix.toArray()};
          preview.setSettings({...defaultDisplaySettings(),cameras:true,cameraRange:range});renderSource();
          return {monitor:pixel(mount.querySelector('[data-camera-monitor-frame]')),source:pixel(source.domElement),helperFar,before,after:{far:camera.far,fov:camera.fov,projection:camera.projectionMatrix.toArray()}};
        },
        interpolatedFrame(x){displayX=x;mesh.position.x=Math.ceil(x);camera.position.x=x;scene.onBeforeRender=(renderer)=>{if(renderer!==source)observedX=mesh.position.x;};renderSource();return {displayX,observedX,committedX:mesh.position.x,world:preview.worldCamera.position.toArray()};},
        foreground(){glass.visible=true;preview.setSettings({...defaultDisplaySettings(),mode:'semantic'});renderSource();const result=pixel(preview.canvas);glass.visible=false;return result;},
        async draw(mode){preview.setSettings({...defaultDisplaySettings(),mode:mode==='collision'||mode==='wireframe'?'material':mode,helperOnly:mode==='collision'||mode==='wireframe'?mode:'none',depthFar:10});renderSource();const p=preview.canvas;const frame=await presentation.modelInput.captureFrame();const captured=pixel(frame.image);frame.image.close();return {source:pixel(source.domElement),preview:p?pixel(p):null,captured,tick:frame.source.simulationTick,materialRestored:mesh.material===originalMaterial,camera:camera.position.toArray(),before,visible:mesh.visible};},
        async cameraDisplay(addOther=false,showProbes=false,hideSubject=false){
          sourceHidden=hideSubject;
          if(addOther&&!scene.getObjectByName('scene-camera')){const other=new T.PerspectiveCamera(45,1,.1,12);other.name='scene-camera';other.position.set(1.5,1,1);other.lookAt(0,0,0);scene.add(other);}
          const initial={position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),projection:camera.projectionMatrix.toArray(),far:camera.far};
          let audit=[],probeVertices=0,observerSubjectVisible=false;
          scene.onBeforeRender=(renderer,scene,view)=>{const root=scene.getObjectByName('display-camera');if(root)observerSubjectVisible=mesh.visible;const probes=root?.getObjectByName('camera-collision-probes');if(probes?.visible)probeVertices=probes.geometry.getAttribute('position').count;if(root)audit=root.children.filter(group=>group.getObjectByName('camera-model')).map(group=>({visible:group.visible,viewUnchanged:view===camera,position:group.getObjectByName('camera-model').position.toArray()}));};
          preview.setSettings({...defaultDisplaySettings(),cameras:true,cameraRange:6,colliders:showProbes?'all':'off'});renderSource();
          const frame=await presentation.modelInput.captureFrame();const captured=pixel(frame.image);frame.image.close();
          sourceHidden=false;return {observerSubjectVisible,probeVertices,monitor:pixel(mount.querySelector("[data-camera-monitor-frame]")),world:preview.worldCamera.position.toArray(),worldDistance:preview.worldCamera.position.distanceTo(camera.position),audit,previewDiff:preview.canvas.toDataURL()!==source.domElement.toDataURL(),source:pixel(source.domElement),captured,tick:frame.source.simulationTick,helperLeaked:!!scene.getObjectByName('display-camera'),initial,after:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),projection:camera.projectionMatrix.toArray(),far:camera.far}};
        },
        moveRig(dx,rotate=0){camera.position.x+=dx;mesh.position.x+=dx;camera.rotation.y+=rotate;renderSource();return this.readView();},
        turnRig(angle,x,z,distance=5){mesh.position.set(x,0,z);mesh.rotation.y=angle;camera.position.set(x+Math.sin(angle)*distance,0,z+Math.cos(angle)*distance);camera.lookAt(mesh.position);renderSource();return this.readView();},
        readView(){return {world:preview.worldCamera.position.toArray(),orientation:preview.worldCamera.quaternion.toArray(),source:camera.position.toArray()};},
        moveOther(){scene.getObjectByName('scene-camera').position.x=2.5;},
        removeOther(){scene.getObjectByName('scene-camera').removeFromParent();},
        disableCamera(){preview.setSettings(defaultDisplaySettings());renderSource();return {previewHidden:preview.canvas.hidden};},
        dispose(){preview.dispose();renderSource();return {listeners:renderListeners.size,canvases:mount.querySelectorAll('[data-display-preview]').length,source:pixel(source.domElement)};}
      };
    ` }, bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent' })).outputFiles[0]!.text;
    browser = await launchChromiumWithSystemFallback();
  }, 60000);
  afterAll(async () => { await browser?.close(); });
  it.each([{orthographic:false,pixelRatio:1},{orthographic:false,pixelRatio:1.5},{orthographic:true,pixelRatio:2}])('clips the monitor at the helper range without changing the source: %j',async options=>{
    const page=await browser.newPage();
    try{
      await page.setContent('<body></body>');
      await page.evaluate(({orthographic,pixelRatio})=>{(window as any).testOrthographic=orthographic;(window as any).testPixelRatio=pixelRatio;},options);
      await page.addScriptTag({content:script});
      const read=(range:number)=>page.evaluate(range=>(window as any).testPreview.rangeFrame(range),range);
      const far=await read(6),near=await read(3),restored=await read(6);
      expect(far.monitor).toEqual([255,0,0,255]);
      expect(near.monitor.slice(0,3)).toEqual([0,0,0]);
      expect(restored.monitor).toEqual(far.monitor);
      for(const result of [far,near,restored]){expect(result.source).toEqual([255,0,0,255]);expect(result.after).toEqual(result.before);}
      expect([far.helperFar,near.helperFar,restored.helperFar]).toEqual([6,3,6]);
      await page.evaluate(()=>(window as any).testPreview.dispose());
    }finally{await page.close();}
  },30000);
  it('follows subject translation without copying camera orbit, recentering or distance changes during turns',async()=>{
    const page=await browser.newPage();
    try{
      await page.setContent('<body></body>');await page.addScriptTag({content:script});
      await page.evaluate(()=>(window as any).testPreview.cameraDisplay());
      const initial=await page.evaluate(()=>(window as any).testPreview.readView());
      const following=page.getByRole('switch',{name:'跟随位置',exact:true});
      await following.evaluate((el:HTMLButtonElement)=>el.click());
      for(let step=1;step<=12;step++){
        const x=step*.2,z=step*.1,angle=step*Math.PI/12;
        const view=await page.evaluate(({angle,x,z})=>(window as any).testPreview.turnRig(angle,x,z),{angle,x,z});
        expect(view.world[0]-initial.world[0]).toBeCloseTo(x,8);
        expect(view.world[2]-initial.world[2]).toBeCloseTo(z,8);
        view.orientation.forEach((n:number,i:number)=>expect(n).toBeCloseTo(initial.orientation[i],8));
      }
      const before=await page.evaluate(()=>(window as any).testPreview.readView());
      // Camera-only movement (orbit, first-person switch or collision pull-in)
      // must not move a stationary subject around the observer's screen.
      const view=await page.evaluate(()=>(window as any).testPreview.turnRig(-.8,2.4,1.2,.5));
      view.world.forEach((n:number,i:number)=>expect(n).toBeCloseTo(before.world[i],8));
      await following.evaluate((el:HTMLButtonElement)=>el.click());
      const stopped=await page.evaluate(()=>(window as any).testPreview.turnRig(1,3,2));
      expect(stopped.world).toEqual(view.world);
      await page.evaluate(()=>(window as any).testPreview.dispose());
    }finally{await page.close();}
  },30000);
  it('keeps moving subjects and the following world view on the same displayed sample',async()=>{
    const page=await browser.newPage();
    try {
      await page.setContent('<body></body>');await page.addScriptTag({content:script});
      await page.evaluate(()=>(window as any).testPreview.cameraDisplay());
      await page.getByRole('switch',{name:'跟随位置',exact:true}).evaluate((el:HTMLButtonElement)=>el.click());
      const offsets:number[]=[];
      for(const x of [.2,.7,1.2,1.7,2.2]){
        const frame=await page.evaluate(x=>(window as any).testPreview.interpolatedFrame(x),x);
        expect(frame.observedX).toBeCloseTo(x,8);
        expect(frame.committedX).toBe(Math.ceil(x));
        offsets.push(frame.observedX-frame.world[0]);
      }
      expect(Math.max(...offsets)-Math.min(...offsets)).toBeLessThan(1e-8);
      await page.getByRole('button',{name:'定位摄像机',exact:true}).evaluate((el:HTMLButtonElement)=>el.click());
      await page.evaluate(()=>(window as any).testPreview.dispose());
    }finally{await page.close();}
  },30000);
  it('switches to a world viewport while retaining the real gameplay camera and clean capture',async()=>{
    const page=await browser.newPage();
    try {
      await page.setContent('<body></body>');await page.addScriptTag({content:script});
      const result=await page.evaluate(()=>(window as any).testPreview.cameraDisplay(true,true));
      expect(result.audit).toEqual(expect.arrayContaining([{visible:true,viewUnchanged:false,position:[1.5,1,1]},{visible:true,viewUnchanged:false,position:[0,0,5]}]));
      expect(result.probeVertices).toBeGreaterThan(100);expect(result.worldDistance).toBeLessThan(16);expect(result.previewDiff).toBe(true);expect(result.after).toEqual(result.initial);expect(result.helperLeaked).toBe(false);
      expect(result.captured).toEqual(result.source);expect(result.monitor).toEqual(result.source);
      expect(await page.locator('[data-camera-display]').count()).toBe(0);
      expect(await page.locator('[data-display-preview]').evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
      const viewport=page.locator('[data-world-camera-view]');expect(await viewport.isVisible()).toBe(true);
      const box=(await viewport.boundingBox())!;await page.mouse.move(box.x+40,box.y+40);await page.mouse.down();await page.mouse.move(box.x+80,box.y+55,{steps:4});await page.mouse.up();
      const orbit=await page.evaluate(()=>(window as any).testPreview.cameraDisplay());expect(orbit.world).not.toEqual(result.world);expect(orbit.after).toEqual(result.initial);expect(orbit.captured).toEqual(result.source);
      await page.evaluate(()=>(window as any).testPreview.moveOther());
      const moved=await page.evaluate(()=>(window as any).testPreview.cameraDisplay());
      expect(moved.audit.find((entry:any)=>entry.position[0]===2.5).position).toEqual([2.5,1,1]);
      await page.evaluate(()=>(window as any).testPreview.removeOther());
      const removed=await page.evaluate(()=>(window as any).testPreview.cameraDisplay());expect(removed.audit).toEqual([{visible:true,viewUnchanged:false,position:[0,0,5]}]);expect(removed.helperLeaked).toBe(false);
      const restoredBody=await page.evaluate(()=>(window as any).testPreview.cameraDisplay(false,true,true));
      expect(restoredBody.observerSubjectVisible).toBe(true);expect(restoredBody.after).toEqual(restoredBody.initial);
      expect(restoredBody.monitor).toEqual(restoredBody.source);expect(restoredBody.source).not.toEqual([255,0,0,255]);
      const read=()=>page.evaluate(()=>(window as any).testPreview.readView());const fixed=await read();
      const far=await page.evaluate(()=>(window as any).testPreview.moveRig(300));expect(far.world).toEqual(fixed.world);
      await page.getByRole('button',{name:'定位摄像机',exact:true}).evaluate((el:HTMLButtonElement)=>el.click());
      const located=await read();expect(located.source).toEqual(far.source);expect(Math.hypot(...located.world.map((v:number,i:number)=>v-located.source[i]))).toBeLessThan(16);
      const following=page.getByRole('switch',{name:'跟随位置',exact:true});expect(await following.getAttribute('aria-checked')).toBe('false');
      await following.evaluate((el:HTMLButtonElement)=>el.click());
      const movedRig=await page.evaluate(()=>(window as any).testPreview.moveRig(20,.7));expect(movedRig.world[0]-located.world[0]).toBeCloseTo(20,8);expect(movedRig.orientation).toEqual(located.orientation);
      await following.evaluate((el:HTMLButtonElement)=>el.click());
      const stopped=await page.evaluate(()=>(window as any).testPreview.moveRig(20));expect(stopped.world).toEqual(movedRig.world);
      await page.evaluate(()=>(window as any).testPreview.dispose());
    }finally{await page.close();}
  },30000);
  it('renders diagnostic pixels without changing captures, object identity or the camera', async () => {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    try {
      await page.setContent('<body></body>'); await page.addScriptTag({ content: script });
      for (const mode of ['clay', 'unlit', 'depth', 'normal', 'semantic', 'wireframe', 'collision', 'material']) {
        const result = await page.evaluate(mode => (window as any).testPreview.draw(mode), mode);
        expect(result.source).toEqual([255, 0, 0, 255]); expect(result.captured).toEqual(result.source);
        expect(result.tick).toBe(7); expect(result.materialRestored).toBe(true); expect(result.visible).toBe(true); expect(result.camera).toEqual(result.before);
        if (mode === 'depth') { expect(result.preview[0]).toBeGreaterThan(108); expect(result.preview[0]).toBeLessThan(122); expect(result.preview[0]).toBe(result.preview[1]); }
        if (mode === 'semantic') expect(result.preview.slice(0, 3)).toEqual([244, 184, 96]);
      }
      expect(await page.evaluate(() => (window as any).testPreview.foreground())).toEqual([231,133,153,255]);
      const cameraResult=await page.evaluate(()=>(window as any).testPreview.cameraDisplay());
      expect(cameraResult.source).toEqual([255,0,0,255]);expect(cameraResult.captured).toEqual(cameraResult.source);
      expect(cameraResult.tick).toBe(7);expect(cameraResult.after).toEqual(cameraResult.initial);expect(cameraResult.helperLeaked).toBe(false);
      expect(await page.evaluate(()=>(window as any).testPreview.disableCamera())).toEqual({previewHidden:true});
      expect(await page.evaluate(() => (window as any).testPreview.dispose())).toEqual({listeners:0,canvases: 0, source: [255, 0, 0, 255]});
      expect(await page.locator('[data-camera-display],[data-camera-monitor]').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 30000);
});
