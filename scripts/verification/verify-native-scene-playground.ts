import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import type { Browser, Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

import { launchChromiumWithSystemFallback } from
  "../lib/playwright-browser-launch";
import { createOwnedNativePackageFixtureV1 } from
  "../native-scene/owned-native-package-fixture";

const CONTROLLED_ENTITY_ID = "g-bot-primary";
const EXPECTED_NATIVE_CONTRIBUTION_HASH =
  "sha256:2c314ef28e8916c3eb1b0f8e0aea732daeb4c510ae451d6c27d25b0b0abc3b11";
const EXPECTED_COLLIDER_SUBSHAPE_IDS = Object.freeze([
  "collider-subshape:dd81c7ac9572e9671adb05d95e796ee1f507bdb2480e068d13c89c9d44b4be2e",
  "collider-subshape:c45f8d800af8550ee7326d587f07f50a53be3408e090abae615b74b36710273c",
  "collider-subshape:e525e03a86b17577bde81d0c5b646a865081ec7916c46c2291b2ed6bd23998c4",
]);
const NATIVE_ENVIRONMENT_NAMES = Object.freeze([
  "WORLDKIT_NATIVE_PACKAGE_PATH",
  "WORLDKIT_AUTHORING_SERVER_NONCE",
  "WORLDKIT_NATIVE_SERVER_ROLE",
  "WORLDKIT_NATIVE_SERVER_INSTANCE_ID",
  "WORLDKIT_NATIVE_VITE_CACHE_ROOT",
  "WORLDKIT_NATIVE_VERIFIER_PROBE",
  "WORLDKIT_HOSTED_SHELL_ORIGIN",
  "WORLDKIT_HOSTED_RUNTIME_ORIGIN",
] as const);

function preserveNativeEnvironment(): () => void {
  const original = new Map(NATIVE_ENVIRONMENT_NAMES.map((name) =>
    [name, process.env[name]] as const));
  return () => {
    for (const [name, value] of original) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

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
  return page.evaluate(() => window.__WORLDKIT_NATIVE_VERIFIER__!.snapshot());
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

async function findFreeLoopbackPort(): Promise<number> {
  const server = createHttpServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
  return address.port;
}

async function main(): Promise<void> {
  const fixture = await createOwnedNativePackageFixtureV1({
    fixtureDirectoryPath: path.resolve(
      "apps/playground/public/world-packages/cloud-ridge",
    ),
  });
  const restoreEnvironment = preserveNativeEnvironment();
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  let page: Page | undefined;
  try {
    const shellPort = await findFreeLoopbackPort();
    const runtimePort = shellPort === 65_535 ? shellPort - 1 : shellPort + 1;
    process.env.WORLDKIT_HOSTED_SHELL_ORIGIN =
      `http://127.0.0.1:${shellPort}`;
    process.env.WORLDKIT_HOSTED_RUNTIME_ORIGIN =
      `http://127.0.0.1:${runtimePort}`;
    process.env.WORLDKIT_NATIVE_PACKAGE_PATH = fixture.packageDirectoryPath;
    process.env.WORLDKIT_AUTHORING_SERVER_NONCE =
      `native-playground-verifier-${process.pid}`;
    process.env.WORLDKIT_NATIVE_SERVER_ROLE = "shell";
    process.env.WORLDKIT_NATIVE_SERVER_INSTANCE_ID =
      `00000000-0000-4000-8000-${process.pid.toString().padStart(12, "0")}`;
    process.env.WORLDKIT_NATIVE_VITE_CACHE_ROOT = path.dirname(
      fixture.packageDirectoryPath,
    );
    process.env.WORLDKIT_NATIVE_VERIFIER_PROBE = "enabled";
    server = await createServer({
      root: path.resolve("apps/native-scene-playground"),
      logLevel: "silent",
      server: {
        host: "127.0.0.1",
        port: shellPort,
        strictPort: true,
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
    await page.waitForFunction(
      () => document.querySelector("[data-error]")?.textContent?.includes(
        "WORLDKIT_NATIVE_HARNESS_MODE_REQUIRED",
      ) === true,
      undefined,
      { timeout: 5_000 },
    );
    assert.equal(
      await page.evaluate(() => window.__WORLDKIT_NATIVE_VERIFIER__),
      undefined,
      "An unqualified top-level URL must not create a single-Origin Runtime",
    );
    await page.goto(new URL("?verifier-native-package=1", url).href, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    try {
      await page.waitForFunction(
        () => window.__WORLDKIT_NATIVE_VERIFIER__?.ready === true,
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
      () => window.__WORLDKIT_NATIVE_VERIFIER__!.audit(),
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
      () => window.__WORLDKIT_NATIVE_VERIFIER__!.reset(),
    );
    const firstResetAudit = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_VERIFIER__!.audit(),
    ) as NativeSceneAuditV1;
    assert.notEqual(firstResetAudit.worldSessionId, initialAudit.worldSessionId);
    assert.equal(firstResetAudit.successfulRuntimeCreateCount, 2);
    assert.equal(Object.keys(initial.subjectStatesByEntityId).length, 1);
    assert.ok(
      initial.resources.bodies > initialAudit.colliderIds.length,
      "The Runtime must own the Subject body and any derived safety bodies in addition to declared static Colliders",
    );
    assert.deepEqual(controlledSubject(initial).positionMetersXYZ, [
      0,
      0,
      18,
    ]);

    const takeoff = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_VERIFIER__!.runFixedInput({
        actions: ["jump"],
        ticks: 1,
      }),
    );
    const airborne = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_VERIFIER__!.runFixedInput({
        actions: [],
        ticks: 15,
      }),
    );
    const landed = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_VERIFIER__!.runFixedInput({
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
      () => window.__WORLDKIT_NATIVE_VERIFIER__!.reset(),
    );
    const cameraResetAudit = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_VERIFIER__!.audit(),
    ) as NativeSceneAuditV1;
    assert.notEqual(
      cameraResetAudit.worldSessionId,
      firstResetAudit.worldSessionId,
    );
    assert.equal(cameraResetAudit.successfulRuntimeCreateCount, 3);
    assert.equal(afterReset.camera.viewYawOffsetRadians, 0);

    const reached = await page.evaluate(async () => {
      const probe = window.__WORLDKIT_NATIVE_VERIFIER__!;
      await probe.reset();
      return probe.runFixedInput({
        actions: ["move-forward", "run"],
        ticks: 1_700,
      });
    });
    const reachedSubject = controlledSubject(reached);
    assert.equal(reachedSubject.movementMedium, "ground");
    assert.ok(
      reached.resources.bodies >= initial.resources.bodies,
      "Traversal may load bounded resident safety bodies but must retain the admitted baseline",
    );
    assert.ok(reachedSubject.positionMetersXYZ[1] > 12);
    assert.ok(reachedSubject.positionMetersXYZ[2] < -29);
    const finalAudit = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_VERIFIER__!.audit(),
    ) as NativeSceneAuditV1;
    assert.equal(finalAudit.contributionHash, initialAudit.contributionHash);
    assert.notEqual(finalAudit.worldSessionId, cameraResetAudit.worldSessionId);
    assert.equal(finalAudit.successfulRuntimeCreateCount, 4);
    assert.deepEqual(finalAudit.colliderIds, initialAudit.colliderIds);
    const residencyReset = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_VERIFIER__!.reset(),
    );
    const residencyResetAudit = await page.evaluate(
      () => window.__WORLDKIT_NATIVE_VERIFIER__!.audit(),
    ) as NativeSceneAuditV1;
    assert.equal(
      residencyReset.resources.bodies,
      initial.resources.bodies,
      "Reset must dispose traversal-loaded bodies and restore the initial Runtime resource baseline",
    );
    assert.equal(residencyResetAudit.successfulRuntimeCreateCount, 5);
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
        residencyResetAudit.successfulRuntimeCreateCount,
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
    try {
      await fixture.dispose();
    } finally {
      restoreEnvironment();
    }
  }
}

await main();
