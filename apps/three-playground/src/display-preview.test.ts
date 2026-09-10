import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromiumWithSystemFallback } from '../../../scripts/lib/playwright-browser-launch';

describe('diagnostic preview and clean source pixels', () => {
  let browser: Browser, script: string;
  beforeAll(async () => {
    script = (await build({ stdin: { resolveDir: process.cwd(), contents: `
      import * as T from 'three';
      import { createDisplayPreview } from './apps/three-playground/src/display-preview';
      import { defaultDisplaySettings } from './apps/three-playground/src/display-settings';
      import { ThreePresentation } from './packages/three-world/src/presentation';
      const mount=document.createElement('div');mount.style.cssText='position:relative;width:128px;height:128px';document.body.append(mount);
      const source=new T.WebGLRenderer({preserveDrawingBuffer:true});source.setSize(128,128);mount.append(source.domElement);
      const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1,.1,100);camera.position.z=5;
      const glass=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({color:0x00ffff,transparent:true,opacity:.3,depthWrite:false}));glass.position.z=1;glass.visible=false;scene.add(glass);
      const mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial({color:0xff0000}));scene.add(mesh);
      const holeTexture=new T.DataTexture(new Uint8Array([0,255,0,0]),1,1);holeTexture.needsUpdate=true;
      const hole=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({map:holeTexture,transparent:true,depthWrite:false}));hole.position.z=2;scene.add(hole);
      const originalMaterial=mesh.material, before=camera.position.toArray();
      const preview=createDisplayPreview({scene,camera,source,mount,context:()=>({roots:[{object:mesh,type:'person'}],subjects:[mesh]}),onError:e=>{throw e;}});
      const presentation=new ThreePresentation({canvas:source.domElement,camera,render:()=>source.render(scene,camera),stamp:()=>({simulationTick:7,worldRevision:3}),object:()=>mesh,onRender:()=>()=>{},onChange:()=>()=>{},bindInput:()=>()=>{},focus:()=>{},released:()=>{}},{});
      function pixel(canvas){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0,128,128);return [...ctx.getImageData(64,64,1,1).data];}
      window.testPreview={
        foreground(){glass.visible=true;preview.setSettings({...defaultDisplaySettings(),mode:'semantic'});source.render(scene,camera);const result=pixel(preview.canvas);glass.visible=false;return result;},
        async draw(mode){preview.setSettings({...defaultDisplaySettings(),mode:mode==='collision'||mode==='wireframe'?'material':mode,helperOnly:mode==='collision'||mode==='wireframe'?mode:'none',depthFar:10});source.render(scene,camera);const p=preview.canvas;const frame=await presentation.modelInput.captureFrame();const captured=pixel(frame.image);frame.image.close();return {source:pixel(source.domElement),preview:p?pixel(p):null,captured,tick:frame.source.simulationTick,materialRestored:mesh.material===originalMaterial,camera:camera.position.toArray(),before,visible:mesh.visible};},
        dispose(){preview.dispose();source.render(scene,camera);return {canvases:mount.querySelectorAll('[data-display-preview]').length,source:pixel(source.domElement)};}
      };
    ` }, bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent' })).outputFiles[0]!.text;
    browser = await launchChromiumWithSystemFallback();
  }, 60000);
  afterAll(async () => { await browser?.close(); });
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
      expect(await page.evaluate(() => (window as any).testPreview.dispose())).toEqual({canvases: 0, source: [255, 0, 0, 255]});
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 30000);
});
