import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchChromiumWithSystemFallback } from '@worldkit/browser-capture/browser';

const url = process.argv[2] ?? 'http://127.0.0.1:5178';
const output = path.resolve(process.argv[3] ?? 'E:/loopit/.codex-tmp/aircraft-inspector-smoke');
await mkdir(output, { recursive: true });
const browser = await launchChromiumWithSystemFallback();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));

const state = () => page.evaluate(() => (window as any).playground.getState());
const active = async () => page.waitForFunction(() => (window as any).playground.getState().activeVehicle === 'plane');

async function prepare(gain: number) {
  await page.evaluate(async () => { await (window as any).playground.reset(); });
  await page.waitForFunction(() => (window as any).playground.getState().activeVehicle === null);
  await page.evaluate(() => (window as any).playground.selectVehicle('plane'));
  await page.locator('[data-worldkit-surface]').click();
  await page.keyboard.press('f');
  await active();

  const field = page.locator('[data-aircraft-field="pitchGain"] input[type="number"]');
  if (!(await field.isVisible())) {
    await page.locator('#debugButton').click();
  }
  try {
    await field.waitFor({ state: 'visible', timeout: 5000 });
  } catch (error) {
    await page.screenshot({ path: path.join(output, `panel-${gain}-failure.png`) });
    throw new Error(`aircraft field unavailable; active=${(await state()).activeVehicle}; panel=${await page.locator('#inspectorHost').innerText()}`, { cause: error });
  }
  await page.getByText('飞行数据', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('动压', { exact: true }).waitFor({ state: 'visible' });
  await field.fill(String(gain));
  await page.waitForFunction(expected => {
    const input = document.querySelector('[data-aircraft-field="pitchGain"] input[type="number"]') as HTMLInputElement | null;
    return input?.value === String(expected);
  }, gain);
  await page.locator('#inspectorClose').click();
  await page.locator('[data-worldkit-surface]').click();
}

async function run(gain: number) {
  await prepare(gain);
  await page.keyboard.down('w');
  await page.keyboard.down('e');
  await page.waitForFunction(() => (window as any).playground.getState().speed > 27, {}, { timeout: 30000 });
  await page.waitForTimeout(1800);
  const result = await state();
  await page.keyboard.up('e');
  await page.keyboard.up('w');
  return result;
}

try {
  await page.goto(url);
  await page.waitForFunction(() => !!(window as any).playground?.getState().ready, {}, { timeout: 60000 });
  await page.locator('#mapSelect').click();
  await page.getByRole('option', { name: '飞机 · 起降训练场', exact: true }).click();
  await page.waitForFunction(() => (window as any).playground.getState().mapId === 'aircraft-training');

  const low = await run(2);
  const high = await run(18);
  const lowAltitude = low.position[1];
  const highAltitude = high.position[1];
  assert(highAltitude > lowAltitude + 1, `pitchGain did not change altitude: low=${lowAltitude}, high=${highAltitude}`);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ low, high, errors }, null, 2));
  console.log(JSON.stringify({
    panelApplied: true,
    lowPitchGain: 2,
    highPitchGain: 18,
    lowAltitude,
    highAltitude,
    trajectoryChanged: true,
    errors,
  }));
} finally {
  await browser.close();
}
