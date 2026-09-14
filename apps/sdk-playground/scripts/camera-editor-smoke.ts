import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { launchChromiumWithSystemFallback } from "@worldkit/browser-capture/browser";
const output = "output/playwright/camera-editor";
await mkdir(output, { recursive: true });
const path = "apps/sdk-playground/config/camera.json",
  original = await readFile(path),
  diagnostics: unknown[] = [];
const browser = await launchChromiumWithSystemFallback(),
  page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
page.on("pageerror", (e) =>
  diagnostics.push({ kind: "pageerror", text: e.message }),
);
page.on("console", (m) => diagnostics.push({ kind: m.type(), text: m.text() }));
await page.addInitScript(() =>
  window.addEventListener("error", (e) => {
    (window as any).__cameraWindowErrors ??= [];
    (window as any).__cameraWindowErrors.push(e.message);
  }),
);
const state = () => page.evaluate(() => (window as any).playground.getState());
const capture = () =>
  page.evaluate(async () => {
    const frame =
      await window.__WORLDKIT_EVAL__!.presentation!.modelInput.captureFrame();
    try {
      const canvas = document.createElement("canvas");
      canvas.width = frame.image.width;
      canvas.height = frame.image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(frame.image, 0, 0);
      let hash = 2166136261;
      for (const value of context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data)
        hash = Math.imul(hash ^ value, 16777619);
      return {
        hash: hash >>> 0,
        tick: frame.source.simulationTick,
        revision: (window as any).playground.getState().cameraOwnership,
      };
    } finally {
      frame.image.close();
    }
  });
try {
  await page.goto(process.argv[2] ?? "http://127.0.0.1:5196");
  await page.waitForFunction(
    () => !!(window as any).playground,
    {},
    { timeout: 90000 },
  );
  await page.evaluate(() => window.__WORLDKIT_EVAL__!.stopLive());
  const beforeEditorErrors = await page.evaluate(
    () => (window as any).__cameraWindowErrors ?? [],
  );
  await page.getByRole("tab", { name: "相机模式", exact: true }).click();
  const panel = page.getByRole("region", { name: "项目相机编辑器" }); // section with accessible name
  await panel
    .getByRole("button", { name: "重新绑定预览", exact: true })
    .click();
  await panel.getByRole("combobox", { name: "相机编辑作用域" }).click();
  await page.getByRole("option", { name: "项目视图", exact: true }).click();
  const fov = panel.getByRole("textbox", {
    name: "lens.verticalFovDegrees",
    exact: true,
  });
  await fov.fill("61");
  await fov.blur();
  await panel.getByRole("button", { name: "应用草稿", exact: true }).click();
  assert.equal(
    (await state()).cameraEditor.inspection.resolved.values.lens
      .verticalFovDegrees,
    61,
  );
  const slider = panel.getByRole("slider", {
    name: "lens.verticalFovDegrees 滑块",
    exact: true,
  });
  await slider.scrollIntoViewIfNeeded();
  const sliderBox = await slider.boundingBox();
  assert(sliderBox);
  await page.mouse.move(
    sliderBox.x + sliderBox.width / 2,
    sliderBox.y + sliderBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(sliderBox.x + 80, sliderBox.y + sliderBox.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
  assert.notEqual(
    (await state()).cameraEditor.draft.views["third-person"].overrides.lens
      .verticalFovDegrees,
    61,
  );
  await panel.getByRole("button", { name: "撤销草稿", exact: true }).click();
  assert.equal(
    (await state()).cameraEditor.draft.views["third-person"].overrides.lens
      .verticalFovDegrees,
    61,
  );
  const before = await capture();
  await fov.fill("invalid");
  await fov.blur();
  assert.deepEqual(await capture(), before);
  await panel.getByRole("button", { name: "撤销草稿", exact: true }).click();
  await panel
    .getByRole("button", { name: "独立自由预览", exact: true })
    .click();
  const preview = panel.getByLabel("独立相机预览");
  const box = await preview.boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + 140, { steps: 4 });
  await page.mouse.up();
  assert.deepEqual(await capture(), before);
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/independent-preview.png` });
  await panel
    .getByRole("button", { name: "保存项目文件", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      (window as any).playground.getState().cameraEditor.saveStatus === "saved",
  );
  const saved = await readFile(path),
    sha = createHash("sha256").update(saved).digest("hex");
  assert.notDeepEqual(saved, original);
  await page.waitForFunction(
    (sha) =>
      (window as any).playground.getState().cameraEditor.importedFileSha256 ===
      sha,
    sha,
  );
  assert.equal((await state()).cameraEditor.baselineRevision, undefined);
  assert.equal(
    (await state()).cameraEditor.inspection.resolved.values.lens
      .verticalFovDegrees,
    61,
  );
  await page.screenshot({ path: `${output}/saved-hmr.png` });
  await page.reload();
  await page.waitForFunction(
    () => !!(window as any).playground,
    {},
    { timeout: 90000 },
  );
  await page.evaluate(() => window.__WORLDKIT_EVAL__!.stopLive());
  assert.equal((await state()).cameraEditor.importedFileSha256, sha);
  await page.getByRole("tab", { name: "相机模式", exact: true }).click();
  await page.getByRole("button", { name: "重新绑定预览", exact: true }).click();
  assert.equal(
    (await state()).cameraEditor.inspection.resolved.values.lens
      .verticalFovDegrees,
    61,
  );
  await page.getByRole("combobox", { name: "相机编辑作用域" }).click();
  await page.getByRole("option", { name: "项目视图", exact: true }).click();
  await page
    .getByRole("textbox", { name: "lens.verticalFovDegrees", exact: true })
    .fill("62");
  await page
    .getByRole("textbox", { name: "lens.verticalFovDegrees", exact: true })
    .blur();
  await page
    .getByRole("button", { name: "操控参数与配置文件", exact: true })
    .click();
  await page
    .getByRole("button", { name: "3C 调试与配置", exact: true })
    .click();
  const shared = page
    .getByRole("dialog")
    .getByRole("region", { name: "项目相机编辑器" });
  assert(await shared.isVisible());
  await shared.getByRole("combobox", { name: "相机编辑作用域" }).click();
  await page.getByRole("option", { name: "项目视图", exact: true }).click();
  assert.equal(
    await shared
      .getByRole("textbox", { name: "lens.verticalFovDegrees", exact: true })
      .inputValue(),
    "62",
  );
  await shared
    .getByRole("button", { name: "重新绑定预览", exact: true })
    .click();
  assert.equal(
    (await state()).cameraEditor.inspection.resolved.values.lens
      .verticalFovDegrees,
    61,
  );
  await page.screenshot({ path: `${output}/workbench-shared.png` });
  const finalInspection = (await state()).cameraEditor.inspection;
  const build = execFileSync("pnpm", ["build:editor"], { stdio: "pipe" });
  await writeFile(`${output}/build.log`, build);
  const server = spawn(
    "python3",
    [
      "-m",
      "http.server",
      "5197",
      "--bind",
      "127.0.0.1",
      "--directory",
      ".codex-tmp/react-playground-dist",
    ],
    { stdio: "ignore" },
  );
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        if ((await fetch("http://127.0.0.1:5197")).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const staticPage = await browser.newPage({
      viewport: { width: 1600, height: 1050 },
    });
    staticPage.on("pageerror", (e) =>
      diagnostics.push({ kind: "static-pageerror", text: e.message }),
    );
    staticPage.on("console", (m) =>
      diagnostics.push({ kind: `static-${m.type()}`, text: m.text() }),
    );
    await staticPage.goto("http://127.0.0.1:5197");
    await staticPage.waitForFunction(
      () => !!(window as any).playground,
      {},
      { timeout: 90000 },
    );
    await staticPage
      .getByRole("tab", { name: "相机模式", exact: true })
      .click();
    await staticPage
      .getByRole("button", { name: "重新绑定预览", exact: true })
      .click();
    const built = await staticPage.evaluate(
      () => (window as any).playground.getState().cameraEditor,
    );
    assert.equal(built.importedFileSha256, sha);
    assert.equal(built.inspection.resolved.values.lens.verticalFovDegrees, 61);
    assert(
      await staticPage
        .getByRole("button", { name: "保存项目文件", exact: true })
        .isDisabled(),
    );
    await staticPage.screenshot({ path: `${output}/static-adopted.png` });
  } finally {
    server.kill();
  }

  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        savedSha: sha,
        inspection: finalInspection,
        diagnostics,
        beforeEditorErrors,
        windowErrors: await page.evaluate(
          () => (window as any).__cameraWindowErrors,
        ),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      savedSha: sha,
      checks:
        "apply, invalid, capture, independent preview, save, HMR identity, reload effective, shared Workbench, rebuilt static effective + exact import SHA + no file capability",
      diagnostics: diagnostics.length,
    }),
  );
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  await writeFile(
    `${output}/failure-dom.txt`,
    await page.locator("body").innerText(),
  );
  throw error;
} finally {
  await writeFile(path, original);
  await writeFile(
    `${output}/diagnostics.json`,
    JSON.stringify(diagnostics, null, 2),
  );
  await browser.close();
}
