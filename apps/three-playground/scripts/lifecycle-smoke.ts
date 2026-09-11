import assert from 'node:assert/strict';
import {launchChromiumWithSystemFallback} from '../../../scripts/lib/playwright-browser-launch';

const browser = await launchChromiumWithSystemFallback();
const page = await browser.newPage();
const browserErrors: string[] = [];
page.on('pageerror', error => browserErrors.push(error.message));
await page.addInitScript(`
  window.__registeredToolSignals = [];
  Object.defineProperty(document, 'modelContext', {value: {
    registerTool(tool, options) { window.__registeredToolSignals.push(options.signal); }
  }});
`);
try {
  await page.goto(`${process.argv[2] ?? 'http://127.0.0.1:5191'}/#/scenes/npc-workshop`);
  await page.waitForFunction(() => (window as any).playground?.getState().npc.ready, {}, {timeout: 60000});
  const result = await page.evaluate(() => {
    const errors: string[] = [];
    window.addEventListener('error', event => {errors.push(event.message); event.preventDefault();});
    // Navigation/reload may deliver visibility and focus events after pagehide cleanup.
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    window.dispatchEvent(new Event('blur'));
    Object.defineProperty(document, 'hidden', {configurable: true, value: true});
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('focusin'));
    window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Escape'}));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return {errors, toolCount: (window as any).__registeredToolSignals.length, toolsAborted: (window as any).__registeredToolSignals.every((signal: AbortSignal) => signal.aborted)};
  });
  assert.deepEqual(result.errors, [], 'retired page callbacks must not access the disposed runtime');
  assert(result.toolCount > 0 && result.toolsAborted, 'page disposal must revoke its tool registrations');
  await page.reload();
  await page.waitForFunction(() => (window as any).playground?.getState().npc.ready, {}, {timeout: 60000});
  await page.getByRole('button', {name: '操控玩家', exact: true}).click();
  const before = await page.evaluate(() => (window as any).playground.getState().position);
  await page.keyboard.down('w');
  await page.waitForFunction(before => {
    const position = (window as any).playground.getState().position;
    return Math.hypot(position[0] - before[0], position[2] - before[2]) > .5;
  }, before);
  await page.keyboard.up('w');
  assert.deepEqual(browserErrors, []);

  console.log('Playground pagehide followed by focus, visibility, resize, keyboard and route events, tool revocation and real keyboard input after reload: passed.');
} finally { await browser.close(); }
