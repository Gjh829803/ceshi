import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchChromiumWithSystemFallback } from "../../../scripts/lib/playwright-browser-launch";

const base = process.argv[2] ?? "http://127.0.0.1:5190";
const output = path.resolve(process.argv[3] ?? "D:/CodexData/Artifacts/dragon-training-integration");
await mkdir(output, { recursive: true });
const browser = await launchChromiumWithSystemFallback();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors: string[] = [], requests = new Set<string>();
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => requests.add(request.url()));
async function choose(name: string) {
  await page.locator("#mapSelect").click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function waitMap(mapId: string) {
  await page.waitForFunction((id) => {
    const state = (window as any).playground?.getState();
    return state?.ready && state.mapId === id;
  }, mapId, { timeout: 60000 });
}
async function flightFrame() {
  const handle = await page.locator('iframe[title="飞龙训练场"]').elementHandle({ timeout: 60000 });
  const frame = await handle!.contentFrame();
  assert(frame);
  await frame.waitForFunction(() => !!(window as any).__CREATURE_DEV__, {}, { timeout: 60000 });
  return frame;
}
try {
  await page.goto(base);
  await waitMap("campus");
  await page.locator("#mapSelect").click();
  await page.screenshot({ path: path.join(output, "training-menu.png") });
  await page.getByRole("option", { name: "飞龙 · 空中训练场", exact: true }).click();
  await page.waitForURL("**/dragon-training.html");
  const frame = await flightFrame();
  const initial = await frame.evaluate(() => (window as any).__CREATURE_DEV__.snapshot());
  assert.equal(initial.mode, "hover");
  await frame.locator("#flight-canvas").click();
  await page.keyboard.down("Shift");
  await frame.waitForFunction(() => (window as any).__CREATURE_DEV__.snapshot().speedMetersPerSecond > 9);
  await page.keyboard.up("Shift");
  const accelerated = await frame.evaluate(() => (window as any).__CREATURE_DEV__.snapshot());
  await page.keyboard.down("Control");
  await frame.waitForFunction(() => (window as any).__CREATURE_DEV__.snapshot().mode === "hover");
  await page.keyboard.up("Control");
  await page.keyboard.press("t");
  await frame.waitForFunction(() => (window as any).__CREATURE_DEV__.snapshot().camera.perspective === "first-person");
  await page.keyboard.down("e");
  await frame.waitForFunction(() => (window as any).__CREATURE_DEV__.snapshot().flamePhase === "loop");
  const breathing = await frame.evaluate(() => (window as any).__CREATURE_DEV__.snapshot());
  assert.equal(breathing.speedMetersPerSecond, 0);
  assert(breathing.flame.particleCount > 0);
  await page.screenshot({ path: path.join(output, "dragon-first-person.png") });
  await page.keyboard.up("e");
  await page.keyboard.press("t");
  await frame.waitForFunction(() => (window as any).__CREATURE_DEV__.snapshot().camera.perspective === "third-person");
  await page.screenshot({ path: path.join(output, "dragon-training.png") });
  await choose("飞机 · 起降训练场");
  await waitMap("aircraft-training");
  assert.equal(page.frames().length, 1, "切回地图必须释放飞龙子页面");
  await choose("飞龙 · 空中训练场");
  await page.waitForURL("**/dragon-training.html");
  const reentered = await (await flightFrame()).evaluate(() => (window as any).__CREATURE_DEV__.snapshot());
  assert.equal(reentered.speedMetersPerSecond, 0);
  assert.equal(reentered.flame.particleCount, 0);
  assert.equal(reentered.camera.perspective, "third-person");
  await choose("VECTOR 综合训练园区");
  await waitMap("campus");
  assert.equal(page.frames().length, 1);
  assert([...requests].every((url) => !/^https?:/.test(url) || new URL(url).origin === new URL(base).origin), "训练场不能依赖另一个端口或外部资产服务");
  await page.route("**/flying-creature/bundle.json", (route) => route.fulfill({ status: 404, body: "missing" }));
  await choose("飞龙 · 空中训练场");
  await page.getByText("飞龙训练场暂时不可用", { exact: true }).waitFor();
  await page.getByRole("link", { name: "返回综合园区" }).click();
  await waitMap("campus");
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "verification.json"), JSON.stringify({ ok: true, base, initial, accelerated, breathing, reentered, errors, requestOrigins: [...new Set([...requests].filter((url) => /^https?:/.test(url)).map((url) => new URL(url).origin))] }, null, 2));
  console.log("DRAGON_TRAINING_INTEGRATION_VERIFIED " + output);
} finally { await browser.close(); }
