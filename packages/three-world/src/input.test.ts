import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { launchChromiumWithSystemFallback } from '../../../scripts/lib/playwright-browser-launch.js';
import type { WorldInput } from './engine-contracts.js';
import type { CameraRigInput } from './camera.js';

type TestWorld = {
  sample(): WorldInput;
  events: CameraRigInput[];
  releases: number;
  resets: number;
  running: boolean;
  canZoom: boolean;
  firstPerson: boolean;
  focus(): void;
  bind(id: string): number;
  release(index: number): void;
  dispose(): void;
};
declare global { interface Window { inputTest: { worlds: TestWorld[]; shadowInput: HTMLInputElement } } }

describe('world input follows the presented surface and UI focus', () => {
  let browser: Browser;
  let page: Page;
  let script: string;
  beforeAll(async () => {
    const result = await build({
      stdin: { resolveDir: process.cwd(), contents: `
        import { WorldKeyboard, WorldInputRouter } from './packages/three-world/src/input.ts';
        const worlds = [0, 1].map(index => {
          const state = { events: [], releases: 0, resets: 0, running: true, canZoom: true, firstPerson: false };
          const keyboard = new WorldKeyboard(() => 0, () => state.resets++);
          keyboard.enabled = true;
          keyboard.attach(window);
          const router = new WorldInputRouter(keyboard, {
            isRunning: () => state.running, canZoom: () => state.canZoom,
            wantsPointerLock: () => state.firstPerson,
            onPointer: input => state.events.push(input), onRelease: () => state.releases++
          });
          const releases = [router.bind(document.getElementById('world' + index), document.getElementById('ui' + index))];
          return Object.assign(state, {
            sample: () => keyboard.sample(), focus: () => router.focus(),
            bind: id => releases.push(router.bind(document.getElementById(id))) - 1,
            release: index => releases[index](),
            dispose: () => { router.dispose(); keyboard.detach(); }
          });
        });
        const shadow = document.getElementById('shadow').attachShadow({ mode: 'open' });
        shadow.innerHTML = '<input aria-label="shadow prompt">';
        window.inputTest = { worlds, shadowInput: shadow.querySelector('input') };
      ` }, bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
    });
    script = result.outputFiles[0]!.text;
    browser = await launchChromiumWithSystemFallback();
  });
  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
    await page.setContent(`<style>
      .world { width: 240px; height: 180px; position: absolute; top: 20px; background: #789; }
      #world0 { left:20px; } #world1 { left:300px; }
      .ui { position:absolute; top:0; left:0; } #temporary { position:absolute; top:240px; width:240px; height:160px; }
    </style>
    <div id="world0" class="world"><div id="ui0" class="ui"><button id="button">Menu</button><input id="prompt"><div id="shadow"></div></div></div>
    <div id="world1" class="world"><div id="ui1" class="ui"><button>Other menu</button></div></div>
    <div id="temporary" tabindex="3" style="touch-action:pan-y"></div><div id="next"></div>`);
    await page.addScriptTag({ content: script });
  });
  afterEach(async () => { await page.close(); });
  afterAll(async () => { await browser?.close(); });

  it('locks first-person look on click, uses relative movement and clears held input on release',async()=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.evaluate(()=>{window.inputTest.worlds[0]!.firstPerson=true;});
    await page.mouse.click(150,155);
    await page.waitForFunction(()=>document.pointerLockElement?.id==='world0');
    await page.mouse.click(150,155);expect(errors).toEqual([]);
    await page.keyboard.down('w');
    await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:20,movementY:10})));
    const result=await page.evaluate(()=>({events:window.inputTest.worlds[0]!.events,input:window.inputTest.worlds[0]!.sample()}));
    expect(result.events.at(-1)).toMatchObject({yawDeltaRadians:-.08,pitchDeltaRadians:.04});
    expect(result.input.moveZRatio).toBe(-1);
    const releases=await page.evaluate(()=>window.inputTest.worlds[0]!.releases);
    await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(n=>!document.pointerLockElement&&window.inputTest.worlds[0]!.releases>n,releases);
    expect((await page.evaluate(()=>window.inputTest.worlds[0]!.sample())).moveZRatio).toBe(0);
    await page.keyboard.up('w');
    await page.evaluate(()=>{window.inputTest.worlds[0]!.firstPerson=false;});
    await page.mouse.click(150,155);expect(await page.evaluate(()=>!!document.pointerLockElement)).toBe(false);
  });

  it('keeps Shift held and arrows independent, then releases all movement when UI takes focus', async () => {
    await page.mouse.click(120, 140);
    await page.keyboard.press('r');
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.resets)).toBe(0);
    await page.keyboard.down('w'); await page.keyboard.down('Shift'); await page.keyboard.down('ArrowLeft');
    for (let i = 0; i < 3; i++) {
      expect(await page.evaluate(() => window.inputTest.worlds[0]!.sample())).toMatchObject({ moveZRatio: -1, run: true, cameraYawRatio: 1, moveXRatio: 0 });
    }
    await page.locator('#prompt').focus();
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.sample())).toMatchObject({ moveZRatio: 0, run: false, cameraYawRatio: 0 });
    await page.keyboard.type('wasdr');
    expect(await page.evaluate(() => [window.inputTest.worlds[0]!.sample().moveZRatio, window.inputTest.worlds[0]!.resets])).toEqual([0, 0]);
    await page.keyboard.up('w'); await page.keyboard.up('Shift'); await page.keyboard.up('ArrowLeft');
    await page.mouse.click(120, 140); await page.keyboard.down('w');
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.sample().moveZRatio)).toBe(-1);
  });

  it('clears held keys and pointer capture for Shadow DOM input and any focused UI control', async () => {
    await page.mouse.move(120, 140); await page.mouse.down(); await page.keyboard.down('w');
    await page.evaluate(() => window.inputTest.shadowInput.focus());
    await page.mouse.move(140, 150);
    expect(await page.evaluate(() => ({ input: window.inputTest.worlds[0]!.sample(), events: window.inputTest.worlds[0]!.events }))).toMatchObject({ input: { moveZRatio: 0 }, events: [] });
    await page.keyboard.press('r');
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.resets)).toBe(0);
    await page.mouse.up(); await page.keyboard.up('w');
    await page.locator('#button').focus(); await page.keyboard.down('ArrowRight');
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.sample().cameraYawRatio)).toBe(0);
  });

  it('sends keys to one world and clears held movement when another surface activates', async () => {
    await page.keyboard.down('w');
    expect(await page.evaluate(() => window.inputTest.worlds.map(world => world.sample().moveZRatio))).toEqual([-1, 0]);
    await page.mouse.click(420, 140); await page.keyboard.up('w'); await page.keyboard.down('d');
    expect(await page.evaluate(() => window.inputTest.worlds.map(world => world.sample().moveXRatio))).toEqual([0, 1]);
    await page.evaluate(() => window.inputTest.worlds[0]!.focus());
    expect(await page.evaluate(() => window.inputTest.worlds.map(world => world.sample().moveXRatio))).toEqual([0, 0]);
  });

  it('routes incremental drag and wheel but ignores UI gestures and releases cancelled pointers', async () => {
    await page.mouse.move(120, 140); await page.mouse.down(); await page.keyboard.down('Shift');
    await page.mouse.move(140, 150); await page.mouse.move(150, 155); await page.mouse.up();
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.sample().run)).toBe(true);
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.events)).toEqual([
      { yawDeltaRadians: -.08, pitchDeltaRadians: .04, activate: true },
      { yawDeltaRadians: -.04, pitchDeltaRadians: .02, activate: true },
    ]);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => page.evaluate(() => window.inputTest.worlds[0]!.events.length)).toBe(3);
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.events[2])).toEqual({ distanceDeltaMeters: .5, activate: true });
    await page.locator('#button').click(); await page.mouse.wheel(0, 100);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.events.length)).toBe(3);
  });

  it('restores the prior live binding and original surface attributes without resurrecting a released binding', async () => {
    await page.evaluate(() => window.inputTest.worlds[0]!.bind('temporary'));
    expect(await page.locator('#temporary').getAttribute('tabindex')).toBe('3');
    expect(await page.locator('#temporary').evaluate(element => (element as HTMLElement).style.touchAction)).toBe('none');
    await page.evaluate(() => window.inputTest.worlds[0]!.release(1));
    expect(await page.locator('#temporary').evaluate(element => (element as HTMLElement).style.touchAction)).toBe('pan-y');
    await page.mouse.click(120, 140); await page.keyboard.down('w');
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.sample().moveZRatio)).toBe(-1);
    await page.evaluate(() => { const world = window.inputTest.worlds[0]!; world.bind('temporary'); world.release(0); world.release(2); world.release(2); });
    expect(await page.locator('#world0').getAttribute('tabindex')).toBeNull();
    await page.keyboard.up('w'); await page.keyboard.down('w');
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.sample().moveZRatio)).toBe(0);
  });

  it('keeps an already focused prompt blocking zoom when presentation binds or restores', async () => {
    await page.locator('#prompt').focus();
    await page.evaluate(() => window.inputTest.worlds[0]!.bind('temporary'));
    await page.mouse.move(100, 300); await page.mouse.wheel(0, 100);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => ({ focus: document.activeElement?.id, events: window.inputTest.worlds[0]!.events }))).toEqual({ focus: 'prompt', events: [] });
    await page.evaluate(() => { document.getElementById('prompt')!.remove(); window.inputTest.worlds[0]!.release(1); });
    await page.mouse.move(100, 140); await page.mouse.wheel(0, 100);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.events)).toEqual([]);
    await page.evaluate(() => window.inputTest.worlds[0]!.focus());
    await page.mouse.wheel(0, 100);
    await expect.poll(() => page.evaluate(() => window.inputTest.worlds[0]!.events)).toEqual([{ distanceDeltaMeters: .5, activate: true }]);
  });

  it('cancels held state on browser blur and blocks paused drag or authored-camera zoom', async () => {
    await page.mouse.move(120, 140); await page.mouse.down(); await page.keyboard.down('Shift');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.mouse.move(140, 150);
    expect(await page.evaluate(() => ({ input: window.inputTest.worlds[0]!.sample(), count: window.inputTest.worlds[0]!.events.length }))).toMatchObject({ input: { run: false }, count: 0 });
    await page.mouse.up(); await page.keyboard.up('Shift');
    await page.evaluate(() => { window.inputTest.worlds[0]!.running = false; });
    await page.mouse.move(120, 140); await page.mouse.down(); await page.mouse.move(140, 150); await page.mouse.up();
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.events.length)).toBe(0);
    await page.evaluate(() => { window.inputTest.worlds[0]!.running = true; window.inputTest.worlds[0]!.canZoom = false; });
    await page.mouse.wheel(0, 100);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => window.inputTest.worlds[0]!.events.length)).toBe(0);
  });

  it('releases pointer capture and held movement on cancellation, hidden document and disposal', async () => {
    await page.evaluate(() => document.getElementById('world0')!.addEventListener('pointerdown', event => {
      (event.currentTarget as HTMLElement).dataset.pointerId = String((event as PointerEvent).pointerId);
    }));
    await page.mouse.move(120, 140); await page.mouse.down(); await page.keyboard.down('w');
    await page.evaluate(() => {
      const surface = document.getElementById('world0')! as HTMLElement;
      surface.dispatchEvent(new PointerEvent('pointercancel', { pointerId: Number(surface.dataset.pointerId), bubbles: true }));
    });
    await page.mouse.move(140, 150);
    expect(await page.evaluate(() => ({ move: window.inputTest.worlds[0]!.sample().moveZRatio, count: window.inputTest.worlds[0]!.events.length }))).toEqual({ move: 0, count: 0 });
    await page.mouse.up(); await page.keyboard.up('w'); await page.mouse.down(); await page.keyboard.down('w');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.mouse.move(150, 160);
    expect(await page.evaluate(() => ({ move: window.inputTest.worlds[0]!.sample().moveZRatio, count: window.inputTest.worlds[0]!.events.length }))).toEqual({ move: 0, count: 0 });
    await page.evaluate(() => { window.inputTest.worlds[0]!.dispose(); window.inputTest.worlds[0]!.dispose(); });
    expect(await page.locator('#world0').getAttribute('tabindex')).toBeNull();
    expect(await page.locator('#world0').evaluate(element => (element as HTMLElement).style.touchAction)).toBe('');
  });
});
