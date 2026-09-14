import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { launchChromiumWithSystemFallback } from "@worldkit/browser-capture/browser";
const output = "output/playwright/camera-editor-recovery";
await mkdir(output, { recursive: true });
const original = await readFile("apps/sdk-playground/config/camera.json");
const browser = await launchChromiumWithSystemFallback(),
  page = await browser.newPage({ viewport: { width: 1600, height: 1050 } }),
  diagnostics: unknown[] = [];
page.on("console", (message) =>
  diagnostics.push({ kind: message.type(), text: message.text() }),
);
page.on("pageerror", (error) =>
  diagnostics.push({ kind: "pageerror", text: error.message }),
);
await page.addInitScript(() => {
  (window as any).__errors = [];
  window.addEventListener("error", (event) =>
    (window as any).__errors.push(event.message),
  );
});
const state = () => page.evaluate(() => (window as any).playground.getState());
const raw = '{ "opening": unfinished';
try {
  await page.goto(process.argv[2] ?? "http://127.0.0.1:5196");
  await page.waitForFunction(
    () => !!(window as any).playground,
    {},
    { timeout: 90000 },
  );
  await page.waitForFunction(
    () => (window as any).playground.getState().simulationTime > 0,
  );
  await page.evaluate(() => window.__WORLDKIT_EVAL__!.stopLive());
  await page.getByRole("tab", { name: "相机模式", exact: true }).click();
  const inspector = page.getByRole("region", { name: "项目相机编辑器" });
  await inspector
    .getByRole("button", { name: "重新绑定预览", exact: true })
    .click();
  const valid = (await state()).cameraOwnership;
  await inspector
    .locator("summary")
    .filter({ hasText: "完整文档 / 开场 / 输入 / 过渡" })
    .click();
  await inspector.getByRole("textbox", { name: "完整相机文档" }).fill(raw);
  await inspector
    .getByRole("button", { name: "应用草稿", exact: true })
    .click();
  assert.deepEqual((await state()).cameraOwnership, valid);
  await page
    .getByRole("button", { name: "操控参数与配置文件", exact: true })
    .click();
  await page
    .getByRole("button", { name: "3C 调试与配置", exact: true })
    .click();
  const workbench = page
    .getByRole("dialog")
    .getByRole("region", { name: "项目相机编辑器" });
  await workbench
    .locator("summary")
    .filter({ hasText: "完整文档 / 开场 / 输入 / 过渡" })
    .click();
  assert.equal(
    await workbench.getByRole("textbox", { name: "完整相机文档" }).inputValue(),
    raw,
  );
  await workbench
    .getByRole("button", { name: "保存项目文件", exact: true })
    .click();
  assert.equal((await state()).cameraEditor.saveStatus, "idle");
  await page.screenshot({
    path: `output/playwright/camera-editor-recovery/shared-invalid.png`,
  });
  await page.reload();
  await page.waitForFunction(
    () => !!(window as any).playground,
    {},
    { timeout: 90000 },
  );
  await page.waitForFunction(
    () => (window as any).playground.getState().simulationTime > 0,
  );
  await page.evaluate(() => window.__WORLDKIT_EVAL__!.stopLive());
  await page.getByRole("tab", { name: "相机模式", exact: true }).click();
  const recovered = page.getByRole("region", { name: "项目相机编辑器" });
  await recovered
    .locator("summary")
    .filter({ hasText: "完整文档 / 开场 / 输入 / 过渡" })
    .click();
  assert.equal(
    await recovered.getByRole("textbox", { name: "完整相机文档" }).inputValue(),
    raw,
  );
  await recovered
    .getByRole("button", { name: "重新绑定预览", exact: true })
    .click();
  const afterReload = (await state()).cameraOwnership;
  await recovered
    .getByRole("textbox", { name: "lens.verticalFovDegrees", exact: true })
    .fill("62");
  await recovered
    .getByRole("textbox", { name: "lens.verticalFovDegrees", exact: true })
    .blur();
  assert.equal(
    await recovered.getByRole("textbox", { name: "完整相机文档" }).inputValue(),
    raw,
  );
  await recovered
    .getByRole("button", { name: "应用草稿", exact: true })
    .click();
  await recovered
    .getByRole("button", { name: "保存项目文件", exact: true })
    .click();
  assert.deepEqual((await state()).cameraOwnership, afterReload);
  assert.equal((await state()).cameraEditor.saveStatus, "idle");
  assert((await state()).cameraEditor.documentInput.error);
  assert.deepEqual(
    await readFile("apps/sdk-playground/config/camera.json"),
    original,
  );
  await page.screenshot({ path: `${output}/recovered-invalid.png` });
  await recovered
    .getByRole("button", { name: "放弃完整文档输入", exact: true })
    .click();
  assert.equal((await state()).cameraEditor.documentInput, undefined);
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        checks:
          "shared textarea, remount/reload raw text, retained invalidity through visual edit, apply/save blocked, runtime and file unchanged, explicit discard",
        diagnostics,
        windowErrors: await page.evaluate(() => (window as any).__errors),
      },
      null,
      2,
    ),
  );
  console.log("PASS: shared full-document recovery and blocked apply/save");
} finally {
  await writeFile(
    `${output}/diagnostics.json`,
    JSON.stringify(diagnostics, null, 2),
  );
  await browser.close();
}
