import assert from "node:assert/strict";
import path from "node:path";

import type { Browser, Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

import { launchChromiumWithSystemFallback } from
  "../lib/playwright-browser-launch";

const shellPort = 5274;
const runtimePort = 5275;
const shellOrigin = `http://127.0.0.1:${shellPort}`;
const runtimeOrigin = `http://127.0.0.1:${runtimePort}`;

async function closeAll(
  page: Page | undefined,
  browser: Browser | undefined,
  servers: readonly ViteDevServer[],
): Promise<void> {
  await Promise.allSettled([
    ...(page === undefined ? [] : [page.close()]),
    ...(browser === undefined ? [] : [browser.close()]),
    ...servers.map((server) => server.close()),
  ]);
}

async function main(): Promise<void> {
  process.env.WORLDKIT_HOSTED_RUNTIME_ORIGIN = runtimeOrigin;
  const root = path.resolve("apps/native-scene-playground");
  const servers: ViteDevServer[] = [];
  let browser: Browser | undefined;
  let page: Page | undefined;
  const errors: string[] = [];
  try {
    for (const port of [shellPort, runtimePort]) {
      const server = await createServer({
        root,
        server: { host: "127.0.0.1", port, strictPort: true, hmr: false },
      });
      await server.listen();
      servers.push(server);
    }
    browser = await launchChromiumWithSystemFallback();
    page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(
      `${shellOrigin}/?hosted=1&runtimeOrigin=${encodeURIComponent(runtimeOrigin)}`,
      { waitUntil: "domcontentloaded" },
    );
    try {
      await page.waitForFunction(
        () => window.__WORLDKIT_HOSTED_RUNTIME__?.phase() === "ready",
        undefined,
        { timeout: 30_000 },
      );
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        phase: window.__WORLDKIT_HOSTED_RUNTIME__?.phase() ?? "missing",
        state: document.querySelector("[data-state]")?.textContent ?? "missing",
        bodyText: document.body.textContent?.trim().slice(0, 1_000) ?? "",
        frameSource: window.__WORLDKIT_HOSTED_RUNTIME__?.frame.src ?? "missing",
      }));
      const frameDiagnostics = await Promise.all(page.frames().map(async (candidate) => ({
        url: candidate.url(),
        bodyText: await candidate.locator("body").textContent().catch(() => "unavailable"),
      })));
      throw new Error(`Hosted Runtime failed to become ready: ${JSON.stringify({
        errors,
        diagnostic,
        frameDiagnostics,
      })}`, {
        cause: error,
      });
    }
    const frame = page.frames().find((candidate) =>
      candidate.url().startsWith(runtimeOrigin));
    assert.ok(frame !== undefined, "dedicated-origin Runtime frame missing");
    assert.notEqual(new URL(frame.url()).origin, shellOrigin);
    const isolation = await frame.evaluate(async () => {
      let parentDom = "unexpected-access";
      let parentStorage = "unexpected-access";
      let externalNetwork = "unexpected-access";
      let topNavigation = "attempted";
      try { parentDom = window.parent.document.title; } catch { parentDom = "blocked"; }
      try { parentStorage = window.parent.localStorage.length.toString(); } catch { parentStorage = "blocked"; }
      try {
        await fetch("https://example.com/worldkit-browser-isolation-probe");
      } catch {
        externalNetwork = "blocked";
      }
      try {
        window.parent.location.href = "https://example.com/worldkit-top-navigation-probe";
      } catch {
        topNavigation = "blocked";
      }
      return {
        parentDom,
        parentStorage,
        externalNetwork,
        topNavigation,
        cookie: document.cookie,
        credentialless: window.frameElement === null,
      };
    });
    assert.equal(isolation.parentDom, "blocked");
    assert.equal(isolation.parentStorage, "blocked");
    assert.equal(isolation.externalNetwork, "blocked");
    assert.ok(
      isolation.topNavigation === "blocked" ||
      isolation.topNavigation === "attempted",
    );
    assert.equal(new URL(page.url()).origin, shellOrigin);
    assert.equal(isolation.cookie, "");
    assert.equal(isolation.credentialless, true);

    const beforePhysicalInput = await page.evaluate(async () => {
      const probe = window.__WORLDKIT_HOSTED_RUNTIME__!;
      const runtimeSessionId = new URL(probe.frame.src).searchParams.get(
        "runtimeSessionId",
      )!;
      return probe.submit({
        kind: "worldkit-runtime-session-request",
        schemaVersion: 1,
        id: "request.browser.physical.before.001",
        runtimeSessionId,
        type: "snapshot.get",
      });
    }) as { snapshot: {
      world: {
        simulationTick: number;
        subjectStatesByEntityId: Record<string, {
          entityState: { positionMetersXYZ: readonly number[] };
        }>;
      };
    } };
    await page.keyboard.down("w");
    await page.waitForTimeout(250);
    await page.keyboard.up("w");
    await page.waitForTimeout(100);
    const afterPhysicalInput = await page.evaluate(async () => {
      const probe = window.__WORLDKIT_HOSTED_RUNTIME__!;
      const runtimeSessionId = new URL(probe.frame.src).searchParams.get(
        "runtimeSessionId",
      )!;
      return probe.submit({
        kind: "worldkit-runtime-session-request",
        schemaVersion: 1,
        id: "request.browser.physical.after.001",
        runtimeSessionId,
        type: "snapshot.get",
      });
    }) as typeof beforePhysicalInput;
    assert.ok(
      afterPhysicalInput.snapshot.world.simulationTick >
      beforePhysicalInput.snapshot.world.simulationTick,
    );
    assert.notDeepEqual(
      afterPhysicalInput.snapshot.world.subjectStatesByEntityId["g-bot-primary"]
        ?.entityState.positionMetersXYZ,
      beforePhysicalInput.snapshot.world.subjectStatesByEntityId["g-bot-primary"]
        ?.entityState.positionMetersXYZ,
    );

    const receipt = await page.evaluate(async () =>
      window.__WORLDKIT_HOSTED_RUNTIME__!.submit({
        kind: "worldkit-runtime-session-request",
        schemaVersion: 1,
        id: "request.browser.fixed.001",
        runtimeSessionId: new URL(
          window.__WORLDKIT_HOSTED_RUNTIME__!.frame.src,
        ).searchParams.get("runtimeSessionId")!,
        type: "fixed-input.run",
        input: { actions: ["move-forward"], ticks: 3 },
      })
    ) as { status: string; requestType: string };
    assert.equal(receipt.status, "succeeded");
    assert.equal(receipt.requestType, "fixed-input.run");
    await page.evaluate(async () => {
      const probe = window.__WORLDKIT_HOSTED_RUNTIME__!;
      const runtimeSessionId = new URL(probe.frame.src).searchParams.get(
        "runtimeSessionId",
      )!;
      await probe.submit({
        kind: "worldkit-runtime-session-request",
        schemaVersion: 1,
        id: "request.browser.close.001",
        runtimeSessionId,
        type: "session.close",
      });
    });
    await page.waitForFunction(
      () => document.querySelector("iframe") === null,
      undefined,
      { timeout: 10_000 },
    );
    const expectedPolicyBlocks = errors.filter((message) =>
      message.includes("worldkit-browser-isolation-probe") ||
      message.includes("allow-top-navigation") ||
      message.includes("Creating a worker from 'blob:")
    );
    assert.ok(expectedPolicyBlocks.some((message) =>
      message.includes("worldkit-browser-isolation-probe")));
    assert.ok(expectedPolicyBlocks.some((message) =>
      message.includes("allow-top-navigation")));
    assert.deepEqual(
      errors.filter((message) => !expectedPolicyBlocks.includes(message)),
      [],
    );
    console.log(JSON.stringify({
      ok: true,
      evidence: {
        kind: "dedicated-origin-browser-policy",
        shellOrigin,
        runtimeOrigin,
        containerSecurityClaimed: false,
      },
    }, null, 2));
  } finally {
    await closeAll(page, browser, servers);
  }
}

await main();
