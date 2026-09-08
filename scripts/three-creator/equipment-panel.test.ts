import {build} from 'esbuild';
import type {Browser, Page} from 'playwright';
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {launchChromiumWithSystemFallback} from '../lib/playwright-browser-launch.js';

// Real DOM/WebGL and skeleton clones. The small rig isolates preview lifecycle
// from asset transport; horse.test.ts separately exercises the actual Source101.
describe('equipment preview ownership and lifecycle', () => {
  let browser: Browser, page: Page, script: string, css: string;
  beforeAll(async () => {
    const bundle = await build({stdin: {resolveDir: process.cwd(), contents: `
      import * as T from 'three';
      import {TrainingCharacter} from '@worldkit/three';
      import {mountEquipmentPanel} from './examples/three-creator/sdk-capabilities/humanoid/equipment-panel.ts';
      import {createAccessoryPreview} from './examples/three-creator/sdk-capabilities/humanoid/accessories.ts';
      const root=new T.Group();
      const names=['head','spine_05','hand_l','hand_r','foot_l','foot_r'];
      const bones=names.map((name,i)=>{const b=new T.Bone();b.name=name;b.position.set(i%2?.2:-.2,1.5-i*.23,0);root.add(b);return b;});
      root.updateMatrixWorld(true);
      const geometry=new T.BoxGeometry(.3,.3,.3),material=new T.MeshStandardMaterial();
      const count=geometry.attributes.position.count;
      geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(count*4),4));
      geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(Array.from({length:count*4},(_,i)=>i%4===0?1:0),4));
      const skeleton=new T.Skeleton(bones),mesh=new T.SkinnedMesh(geometry,material);root.add(mesh);mesh.bind(skeleton);
      skeleton.computeBoneTexture();const sourceBoneTexture=skeleton.boneTexture;
      let disposals=0,draws=0;
      for(const resource of [geometry,material,sourceBoneTexture])resource.addEventListener('dispose',()=>disposals++);
      const draw=WebGL2RenderingContext.prototype.drawElements;
      WebGL2RenderingContext.prototype.drawElements=function(...args){draws++;return draw.apply(this,args);};
      const source={root,actions:{},dispose(){geometry.dispose();material.dispose();skeleton.dispose();root.removeFromParent();}};
      const character=new TrainingCharacter(source),accessories=createAccessoryPreview(character),events=[];
      const panel=mountEquipmentPanel(document.body,character,accessories,open=>events.push(open));
      const open=document.createElement('button');open.textContent='打开装备';open.onclick=()=>panel.open();document.body.append(open);
      window.equipmentTest={
        open:()=>panel.open(),
        state:()=>({events:[...events],disposals,draws,equipment:accessories.snapshot(),
          bones:bones.map(b=>b.matrixWorld.toArray()),root:root.matrixWorld.toArray(),
          sourceBoneTextureRetained:skeleton.boneTexture===sourceBoneTexture}),
        disposePanel:()=>panel.dispose(),
        dispose(){panel.dispose();accessories.dispose();character.dispose();},
      };
    `}, bundle: true, write: false, outdir: 'equipment-test', format: 'iife', platform: 'browser', logLevel: 'silent',
      loader: {'.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl'}});
    script = bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text;
    css = bundle.outputFiles.find(file => file.path.endsWith('.css'))!.text;
    browser = await launchChromiumWithSystemFallback();
  }, 60000);
  beforeEach(async () => {
    page = await browser.newPage({viewport: {width: 1280, height: 720}});
    page.setDefaultTimeout(3000);
    await page.setContent('<style>*{box-sizing:border-box}body{margin:0;font-family:sans-serif}</style>');
    await page.addStyleTag({content: css});
    await page.addScriptTag({content: script});
  });
  afterEach(async () => {await page?.evaluate(() => (window as any).equipmentTest?.dispose()); await page?.close();});
  afterAll(async () => {await browser?.close();});
  const state = () => page.evaluate(() => (window as any).equipmentTest.state());
  const open = () => page.getByRole('button', {name: '打开装备', exact: true}).click();
  const canvas = () => page.getByLabel('可旋转缩放的人物装备模型');

  it('borrows source resources without changing live bones and retains equipment across reopening', async () => {
    const before = await state();
    await open();
    for (const part of ['头部','背部','左手','右手','左脚','右脚']) {
      await page.getByRole('button', {name: `选择${part}挂点`, exact: true}).click();
      await page.getByRole('button', {name: '穿戴装备', exact: true}).click();
    }
    expect(Object.values((await state()).equipment).every(Boolean)).toBe(true);
    await page.getByRole('button', {name: '关闭人物装备'}).click();
    await open();
    expect(await page.getByText('已装备 6 / 6', {exact: true}).isVisible()).toBe(true);
    await page.getByRole('button', {name: '卸下全部', exact: true}).click();
    await page.getByRole('button', {name: '关闭人物装备'}).click();
    await expect.poll(async () => (await state()).events).toEqual([true,false,true,false]);
    await page.evaluate(() => (window as any).equipmentTest.disposePanel());
    const after = await state();
    expect(after.bones).toEqual(before.bones);
    expect(after.root).toEqual(before.root);
    expect(after.disposals).toBe(0);
    expect(after.sourceBoneTextureRetained).toBe(true);
    expect(after.events).toEqual([true,false,true,false]);
    expect(Object.values(after.equipment).every(value => !value)).toBe(true);
  });

  it('keeps footer actions reachable in a short desktop window', async () => {
    await page.setViewportSize({width: 1280, height: 500});
    await open();
    const clear = page.getByRole('button', {name: '卸下全部', exact: true});
    await clear.scrollIntoViewIfNeeded();
    const rect = await clear.boundingBox();
    const dialog = await page.getByRole('dialog', {name: '人物装备', exact: true}).boundingBox();
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(dialog!.y + dialog!.height);
    await clear.click();
  });

  it('supports keyboard orbit and restores focus when the dialog closes', async () => {
    await open();
    await canvas().focus();
    const pins = () => page.locator('.equipment-pin').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).style.left));
    const before = await pins();
    await canvas().press('Shift+ArrowLeft');
    expect(await pins()).not.toEqual(before);
    await canvas().press('Escape');
    await expect.poll(() => page.getByRole('button', {name:'打开装备',exact:true}).evaluate(node => node === document.activeElement)).toBe(true);
  });

  it('recovers from preview renderer creation failure without trapping the dialog lifecycle', async () => {
    const errors: Error[] = [];
    page.on('pageerror', error => errors.push(error));
    await page.evaluate(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      (window as any).restoreGetContext = () => {HTMLCanvasElement.prototype.getContext = getContext;};
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: any[]) {
        if (this.closest('.equipment-stage')) return null;
        return (getContext as any).apply(this,args);
      } as any;
    });
    await open();
    expect(await page.getByText('人物预览暂时无法显示，请关闭后重试。', {exact:true}).isVisible()).toBe(true);
    expect(await page.getByRole('button',{name:'穿戴装备',exact:true}).isDisabled()).toBe(true);
    await page.getByRole('button', {name:'关闭人物装备'}).click();
    await expect.poll(async () => (await state()).events).toEqual([true,false]);
    await page.evaluate(() => (window as any).restoreGetContext());
    await open();
    expect((await state()).draws).toBeGreaterThan(0);
    expect(await page.getByRole('button',{name:'穿戴装备',exact:true}).isEnabled()).toBe(true);
    expect(errors).toEqual([]);
  });

  it('ignores a stale close event when the equipment dialog has already reopened', async () => {
    await open();
    await page.evaluate(async () => {
      document.querySelector<HTMLDialogElement>('.equipment-panel')!.close();
      (window as any).equipmentTest.open();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    expect(await page.getByRole('dialog',{name:'人物装备',exact:true}).isVisible()).toBe(true);
    expect((await state()).events.at(-1)).toBe(true);
  });

  it('redraws after a real WebGL context loss and restoration without user input', async () => {
    await open();
    await canvas().evaluate(async node => {
      const gl = (node as HTMLCanvasElement).getContext('webgl2')!;
      const extension = gl.getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('WEBGL_lose_context unavailable');
      (window as any).restoreEquipmentContext = () => extension.restoreContext();
      const lost = new Promise(resolve => node.addEventListener('webglcontextlost', resolve, {once:true}));
      extension.loseContext();
      await lost;
    });
    const draws = (await state()).draws;
    await page.evaluate(async () => {
      const node = document.querySelector('.equipment-stage canvas')!;
      const restored = new Promise(resolve => node.addEventListener('webglcontextrestored', resolve, {once:true}));
      (window as any).restoreEquipmentContext();
      await restored;
    });
    await expect.poll(async () => (await state()).draws).toBeGreaterThan(draws);
  }, 15000);
});
