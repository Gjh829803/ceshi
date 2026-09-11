import {launchChromiumWithSystemFallback} from '@worldkit/browser-capture/browser';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';

const output = process.argv[3] ?? '.codex-tmp/npc-playground';
await mkdir(output, {recursive: true});
const browser = await launchChromiumWithSystemFallback();
const page = await browser.newPage({viewport: {width: 1500, height: 950}});
const errors: string[] = [];
page.on('pageerror', error => errors.push(String(error)));
const state = () => page.evaluate(() => (window as any).playground.getState());
const waitStatus = async (text: string) => {
  await page.waitForFunction(text => {const npc = (window as any).playground.getState().npc; return npc.status.includes(text) || (!npc.busy && npc.status.startsWith('Error:'));}, text, {timeout: 90000});
  assert((await state()).npc.status.includes(text), (await state()).npc.status);
};
try {
  await page.goto(`${process.argv[2] ?? 'http://127.0.0.1:5191'}/#/scenes/npc-workshop`);
  await page.waitForFunction(() => (window as any).playground?.getState().npc.ready, {}, {timeout: 90000});
  const initial = await state(); assert.equal(initial.mapId, 'npc-workshop'); assert.equal(initial.npc.actors.length, 2);
  await page.waitForFunction(before => (window as any).playground.getState().npc.actors.every((actor: any, i: number) => Math.hypot(actor.positionWorldMetersXYZ[0] - before[i][0], actor.positionWorldMetersXYZ[2] - before[i][2]) > 1), initial.npc.actors.map((actor: any) => actor.positionWorldMetersXYZ), {timeout: 30000});
  await page.screenshot({path: `${output}/patrol.png`});
  await page.getByRole('button', {name: '操控NPC A', exact: true}).click();
  assert.equal((await state()).controlledEntityId, 'npc-left');
  await page.waitForFunction(() => {const state = (window as any).playground.getState(); return Math.abs(state.camera.target[0] - state.position[0]) < .5;});
  const controlled = await state();
  await page.keyboard.down('w');
  await page.waitForFunction(before => { const position = (window as any).playground.getState().position; return Math.hypot(position[0] - before[0], position[2] - before[2]) > .5; }, controlled.position);
  await page.keyboard.up('w');
  await page.getByRole('button', {name: '接近并争用物品', exact: true}).click();
  await waitStatus('拾取成功');
  const pickup = await state(); assert.equal(pickup.npc.actors.filter((actor: any) => actor.character.carrying === 'parcel').length, 1);
  await page.screenshot({path: `${output}/pickup.png`});
  await page.getByRole('button', {name: '搬运并放下', exact: true}).click(); await waitStatus('搬运并放下完成');
  await page.getByRole('button', {name: '分别就座', exact: true}).click(); await waitStatus('已分别就座');
  const seated = await state();
  assert.deepEqual(seated.npc.actors.map((actor: any) => actor.character.seated), ['bench-left', 'bench-right']);
  await page.screenshot({path: `${output}/seated.png`});
  await page.getByRole('button', {name: '起身', exact: true}).click(); await waitStatus('已起身');
  await page.getByRole('button', {name: '操控NPC B', exact: true}).click();
  await page.locator('#resetButton').click();
  await page.waitForFunction(() => {const state = (window as any).playground.getState();return state.npc.ready && state.controlledEntityId === 'person';});
  assert.equal((await state()).npc.actors.length, 2);
  await page.getByRole('button', {name: '操控NPC A', exact: true}).click();
  await page.locator('#mapSelect').click(); await page.getByRole('option', {name: '室内专项实验室', exact: true}).click();
  await page.waitForFunction(() => {const state = (window as any).playground.getState(); return state.mapId === 'indoor-lab' && !state.entityIds.includes('npc-left') && !state.entityIds.includes('npc-right');});
  assert.equal((await state()).controlledEntityId, 'person');
  await page.locator('#resetButton').click();
  assert.equal((await state()).npc.actors.length, 0);
  await page.locator('#mapSelect').click(); await page.getByRole('option', {name: 'NPC 交互试验场', exact: true}).click();
  await page.waitForFunction(() => (window as any).playground.getState().npc.ready);
  assert.equal((await state()).npc.actors.length, 2);
  // Cancel in the same browser task while SDK commands are still queued for its next tick.
  await page.evaluate(() => {
    const panel = document.querySelector('.npc-playground')!;
    const buttons = [...panel.querySelectorAll('button')];
    buttons.find(button => button.textContent === '接近并争用物品')!.click();
    buttons.find(button => button.textContent === '取消操作')!.click();
  });
  await page.waitForFunction(() => !(window as any).playground.getState().npc.busy);
  await page.waitForTimeout(500);
  assert.equal((await state()).npc.status, '已取消操作');
  // A reset during a pending behavior must also retire the old async continuation.
  await page.getByRole('button', {name: '接近并争用物品', exact: true}).click();
  await page.locator('#resetButton').click();
  await page.waitForFunction(() => (window as any).playground.getState().npc.ready);
  assert.equal((await state()).npc.actors.length, 2);
  await page.setViewportSize({width: 820, height: 740}); await page.screenshot({path: `${output}/small.png`});
  assert.deepEqual((await state()).worldErrors, []);
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({initial, pickup, seated, final: await state(), errors, passed: true}, null, 2));
  console.log('NPC Playground: patrol, input transfer, pickup contention, carry/place, seats, reset and map cleanup passed.');
} catch (error) {
  await page.screenshot({path: `${output}/failure.png`});
  await writeFile(`${output}/failure.json`, JSON.stringify({error: String(error), state: await state().catch(() => null), errors}, null, 2));
  throw error;
} finally { await browser.close(); }
