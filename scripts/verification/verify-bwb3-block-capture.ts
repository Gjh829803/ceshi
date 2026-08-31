import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Browser, Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

import { launchChromiumWithSystemFallback } from
  "../lib/playwright-browser-launch";
import {
  inspectBabylonNativeBlockRenderedCapturesV1,
  type BabylonNativeBlockRenderedCaptureViewIdV1,
} from "./bwb3-block-capture-evidence.js";

const VIEW_IDS = Object.freeze([
  "opening",
  "top-down",
  "side",
] as const satisfies readonly BabylonNativeBlockRenderedCaptureViewIdV1[]);
const OUTPUT_DIRECTORY = path.resolve(
  process.env.WORLDKIT_BWB3_CAPTURE_OUTPUT_DIRECTORY ??
    "examples/evidence/native-block-capture",
);

async function closeBestEffort(
  page: Page | undefined,
  browser: Browser | undefined,
  server: ViteDevServer | undefined,
): Promise<void> {
  await Promise.allSettled([
    ...(page === undefined ? [] : [page.close()]),
    ...(browser === undefined ? [] : [browser.close()]),
    ...(server === undefined ? [] : [server.close()]),
  ]);
}

async function main(): Promise<void> {
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  let page: Page | undefined;
  try {
    server = await createServer({
      root: path.resolve("scripts/verification/bwb3-block-capture"),
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: false },
    });
    await server.listen();
    const url = server.resolvedUrls?.local[0];
    assert.ok(url !== undefined, "BWB-3 fixture URL was not published.");

    browser = await launchChromiumWithSystemFallback();
    page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const browserErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      () => window.__WORLDKIT_BWB3_CAPTURE__?.ready === true,
      undefined,
      { timeout: 60_000 },
    );

    const structure = await page.evaluate(() => {
      const probe = window.__WORLDKIT_BWB3_CAPTURE__!;
      return {
        checkOutcome: probe.checkOutcome,
        kind: probe.capture.kind,
        scope: probe.capture.scope,
        viewIds: probe.capture.views.map(({ id }) => id),
        visualGroupIdsByView: probe.capture.views.map((view) => ({
          viewId: view.id,
          visualGroupIds: view.visualGroupRegions.map(
            ({ visualGroupId }) => visualGroupId,
          ),
        })),
      };
    });
    assert.deepEqual(structure, {
      checkOutcome: "passed",
      kind: "babylon-native-block-authoring-capture",
      scope: "build-epoch-local",
      viewIds: VIEW_IDS,
      visualGroupIdsByView: VIEW_IDS.map((viewId) => ({
        viewId,
        visualGroupIds: ["cliff-mass", "ridge-gate", "route-spine"],
      })),
    });

    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    const captures = [];
    const canvas = page.locator("canvas");
    for (const viewId of VIEW_IDS) {
      await page.evaluate((id) => {
        window.__WORLDKIT_BWB3_CAPTURE__!.showView(id);
      }, viewId);
      const outputPath = path.join(OUTPUT_DIRECTORY, `${viewId}.png`);
      await canvas.screenshot({ path: outputPath });
      captures.push({ viewId, pngBytes: await readFile(outputPath) });
    }
    const evidence = await inspectBabylonNativeBlockRenderedCapturesV1(captures);
    assert.deepEqual(browserErrors, []);
    await writeFile(
      path.join(OUTPUT_DIRECTORY, "evidence.json"),
      `${JSON.stringify({ ...evidence, structure }, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`${JSON.stringify({
      ok: true,
      outputDirectory: OUTPUT_DIRECTORY,
      evidence,
    }, null, 2)}\n`);
  } finally {
    await closeBestEffort(page, browser, server);
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
