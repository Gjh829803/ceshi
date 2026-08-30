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
      throw new Error(`Hosted Runtime failed to become ready: ${errors.join(" | ")}`, {
        cause: error,
      });
    }
    const frame = page.frames().find(({ url }) => url().startsWith(runtimeOrigin));
    assert.ok(frame !== undefined, "dedicated-origin Runtime frame missing");
    assert.notEqual(new URL(frame.url()).origin, shellOrigin);
    const isolation = await frame.evaluate(async () => {
      let parentDom = "unexpected-access";
      let parentStorage = "unexpected-access";
      let externalNetwork = "unexpected-access";
      let topNavigation = "unexpected-access";
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
    assert.equal(isolation.topNavigation, "blocked");
    assert.equal(isolation.cookie, "");
    assert.equal(isolation.credentialless, true);

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
    assert.deepEqual(errors, []);
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
