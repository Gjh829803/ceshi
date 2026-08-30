import assert from "node:assert/strict";
import path from "node:path";

import type { Browser, Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

import { launchChromiumWithSystemFallback } from
  "../lib/playwright-browser-launch";

const CONTROLLED_ENTITY_ID = "g-bot-primary";
const EXPECTED_NATIVE_CONTRIBUTION_HASH =
  "sha256:bb339a494526ee6bb51a40ec351777bfcb77dcc0bc08a9fa2886a63c9215d984";
const EXPECTED_COLLIDER_SUBSHAPE_IDS = Object.freeze([
  "collider-subshape:5af935abea0d5d3da0e32a9e5c1121f3d88f5174c3c0cd32414ea4740b13dc89",
  "collider-subshape:0069b3ff456288eb8ea99f6a7ff396f9886725df6dd89e8626cd14150b71dbcc",
  "collider-subshape:c31d374e9b1f86c1eec231de6db07cf966100a57700ab344f41e64a1c53429bc",
]);

interface NativeSubjectProjectionV1 {
  readonly positionMetersXYZ: readonly [number, number, number];
  readonly movementMedium: string;
  readonly activeActionId: string;
}

interface NativeSceneProjectionV1 {
  readonly tick: number;
  readonly subjectStatesByEntityId: Readonly<
    Record<string, NativeSubjectProjectionV1>
  >;
  readonly camera: {
    readonly viewYawOffsetRadians: number;
    readonly viewPitchOffsetRadians: number;
    readonly viewDistanceOffsetMeters: number;
  };
  readonly resources: {
    readonly bodies: number;
  };
}

interface NativeSceneAuditV1 {
  readonly contributionHash: string;
  readonly worldSessionId: string;
  readonly successfulRuntimeCreateCount: number;
  readonly spawnMarkerId: string;
  readonly colliderIds: readonly string[];
  readonly colliderSubshapeIds: readonly string[];
}

function controlledSubject(
  projection: NativeSceneProjectionV1,
): NativeSubjectProjectionV1 {
  const subject = projection.subjectStatesByEntityId[CONTROLLED_ENTITY_ID];
  assert.ok(subject !== undefined, "Native controlled Subject is missing.");
  return subject;
}

async function readProjection(page: Page): Promise<NativeSceneProjectionV1> {
  return page.evaluate(() => window.__WORLDKIT_NATIVE_SPIKE__!.snapshot());
}

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
      root: path.resolve("apps/native-scene-playground"),
      logLevel: "silent",
      server: {
        host: "127.0.0.1",
        port: 0,
        strictPort: false,
      },
    });
    await server.listen();
    const url = server.resolvedUrls?.local[0];
    assert.ok(url !== undefined, "Native Playground URL was not published.");

    browser = await launchChromiumWithSystemFallback();
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const browserErrors: string[] = [];
    const browserWarnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
      if (message.type() === "warning") browserWarnings.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    try {
      await page.waitForFunction(
        () => window.__WORLDKIT_NATIVE_SPIKE__?.ready === true,
        undefined,
        { timeout: 90_000 },
      );
    } catch (error) {
      const pageState = await page.evaluate(() => ({
        state: document.querySelector("[data-state]")?.textContent ?? "",
        loadingStage:
          document.querySelector("[data-loading-stage]")?.textContent ?? "",
        errorText: document.querySelector("[data-error]")?.textContent ?? "",
      }));
      throw new Error(
        `Native Playground did not become ready: ${JSON.stringify({
          browserErrors,
          browserWarnings,
          pageState,
        })}`,
        { cause: error },
      );
    }

    const initialAudit = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_SPIKE__!.audit(),
    ) as NativeSceneAuditV1;
    assert.equal(
      initialAudit.contributionHash,
      EXPECTED_NATIVE_CONTRIBUTION_HASH,
    );
    assert.equal(initialAudit.spawnMarkerId, "player-spawn");
    assert.equal(initialAudit.successfulRuntimeCreateCount, 1);
    assert.deepEqual(initialAudit.colliderIds, [
      "foreground-platform",
      "gate-platform",
      "primary-path",
    ]);
    assert.deepEqual(
      initialAudit.colliderSubshapeIds,
      EXPECTED_COLLIDER_SUBSHAPE_IDS,
    );
    const renderedScreenshotPath =
      process.env.WORLDKIT_NATIVE_VERIFIER_SCREENSHOT;
    if (renderedScreenshotPath !== undefined) {
      await page.screenshot({ path: renderedScreenshotPath });
    }

    const initial = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_SPIKE__!.reset(),
    );
    const firstResetAudit = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_SPIKE__!.audit(),
    ) as NativeSceneAuditV1;
    assert.notEqual(firstResetAudit.worldSessionId, initialAudit.worldSessionId);
    assert.equal(firstResetAudit.successfulRuntimeCreateCount, 2);
    assert.equal(Object.keys(initial.subjectStatesByEntityId).length, 1);
    assert.equal(initial.resources.bodies, 4);
    assert.deepEqual(controlledSubject(initial).positionMetersXYZ, [
      0,
      0,
      18,
    ]);

    const takeoff = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_SPIKE__!.runFixedInput({
        actions: ["jump"],
        ticks: 1,
      }),
    );
    const airborne = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_SPIKE__!.runFixedInput({
        actions: [],
        ticks: 15,
      }),
    );
    const landed = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_SPIKE__!.runFixedInput({
        actions: [],
        ticks: 120,
      }),
    );
    assert.equal(controlledSubject(takeoff).movementMedium, "air");
    assert.equal(controlledSubject(airborne).activeActionId, "jump");
    assert.ok(
      controlledSubject(airborne).positionMetersXYZ[1] >
        controlledSubject(takeoff).positionMetersXYZ[1],
    );
    assert.equal(controlledSubject(landed).movementMedium, "ground");
    assert.equal(controlledSubject(landed).activeActionId, "idle");

    const canvas = page.locator("canvas");
    const bounds = await canvas.boundingBox();
    assert.ok(bounds !== null && bounds.width > 0 && bounds.height > 0);
    const beforeOrbit = await readProjection(page);
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 80,
      bounds.y + bounds.height / 2 + 25,
    );
    await page.mouse.up();
    const afterOrbit = await readProjection(page);
    assert.notEqual(
      afterOrbit.camera.viewYawOffsetRadians,
      beforeOrbit.camera.viewYawOffsetRadians,
    );
    const afterReset = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_SPIKE__!.reset(),
    );
    const cameraResetAudit = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_SPIKE__!.audit(),
    ) as NativeSceneAuditV1;
    assert.notEqual(
      cameraResetAudit.worldSessionId,
      firstResetAudit.worldSessionId,
    );
    assert.equal(cameraResetAudit.successfulRuntimeCreateCount, 3);
    assert.equal(afterReset.camera.viewYawOffsetRadians, 0);

    const pathButton = page.locator("[data-path-check]");
    await pathButton.click();
    await assert.doesNotReject(
      pathButton.waitFor({ state: "visible", timeout: 30_000 }),
    );
    await page.waitForFunction(
      () => document.querySelector("[data-path-check]")?.textContent !==
        "正在沿主路径前进…",
      undefined,
      { timeout: 30_000 },
    );
    assert.equal(await pathButton.textContent(), "主路径通过 ✓");
    const reached = await readProjection(page);
    const reachedSubject = controlledSubject(reached);
    assert.equal(reachedSubject.movementMedium, "ground");
    assert.ok(reachedSubject.positionMetersXYZ[1] > 12);
    assert.ok(reachedSubject.positionMetersXYZ[2] < -29);
    const finalAudit = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_SPIKE__!.audit(),
    ) as NativeSceneAuditV1;
    assert.equal(finalAudit.contributionHash, initialAudit.contributionHash);
    assert.notEqual(finalAudit.worldSessionId, cameraResetAudit.worldSessionId);
    assert.equal(finalAudit.successfulRuntimeCreateCount, 4);
    assert.deepEqual(finalAudit.colliderIds, initialAudit.colliderIds);
    const errorUi = await page.locator("[data-error]").evaluate((element) => ({
      hidden: (element as HTMLElement).hidden,
      text: element.textContent ?? "",
    }));
    assert.deepEqual(errorUi, { hidden: true, text: "" });
    assert.deepEqual(browserErrors, []);
    const allowedPlatformWarnings = browserWarnings.filter((warning) =>
      /GL Driver Message .*GPU stall due to ReadPixels/.test(warning)
    );
    const unexpectedBrowserWarnings = browserWarnings.filter((warning) =>
      !/GL Driver Message .*GPU stall due to ReadPixels/.test(warning)
    );
    assert.deepEqual(unexpectedBrowserWarnings, []);

    process.stdout.write(`${JSON.stringify({
      ok: true,
      initialTick: initial.tick,
      landedTick: landed.tick,
      reachedTick: reached.tick,
      reachedPositionMetersXYZ: reachedSubject.positionMetersXYZ,
      subjectCount: Object.keys(reached.subjectStatesByEntityId).length,
      physicsBodyCount: reached.resources.bodies,
      cameraOrbitChanged: true,
      cameraResetRestored: true,
      jumpAndLandingPassed: true,
      mainPathPassed: true,
      spawnMarkerId: finalAudit.spawnMarkerId,
      colliderIds: finalAudit.colliderIds,
      colliderSubshapeIds: finalAudit.colliderSubshapeIds,
      contributionHash: finalAudit.contributionHash,
      successfulRuntimeCreateCount:
        finalAudit.successfulRuntimeCreateCount,
      ...(renderedScreenshotPath === undefined
        ? {}
        : { renderedScreenshotPath }),
      errorUi,
      browserErrors,
      allowedPlatformWarnings,
      unexpectedBrowserWarnings,
    }, null, 2)}\n`);
  } finally {
    await closeBestEffort(page, browser, server);
  }
}

await main();
