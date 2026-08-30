import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer as createHttpServer, type Server as HttpServer } from
  "node:http";
import path from "node:path";

import type { Browser, Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

import { launchChromiumWithSystemFallback } from
  "../lib/playwright-browser-launch";

const shellPort = 5274;
const runtimePort = 5275;
const attackerPort = 5276;
const shellOrigin = `http://127.0.0.1:${shellPort}`;
const runtimeOrigin = `http://127.0.0.1:${runtimePort}`;
const attackerOrigin = `http://127.0.0.1:${attackerPort}`;

async function closeAll(
  page: Page | undefined,
  browser: Browser | undefined,
  servers: readonly ViteDevServer[],
  attackerServer: HttpServer | undefined,
): Promise<void> {
  await Promise.allSettled([
    ...(page === undefined ? [] : [page.close()]),
    ...(browser === undefined ? [] : [browser.close()]),
    ...servers.map((server) => server.close()),
    ...(attackerServer === undefined
      ? []
      : [new Promise<void>((resolve, reject) => {
          attackerServer.close((error) => {
            if (error === undefined) resolve();
            else reject(error);
          });
        })]),
  ]);
}

async function main(): Promise<void> {
  process.env.WORLDKIT_HOSTED_RUNTIME_ORIGIN = runtimeOrigin;
  process.env.WORLDKIT_HOSTED_SHELL_ORIGIN = shellOrigin;
  const root = path.resolve("apps/native-scene-playground");
  const servers: ViteDevServer[] = [];
  let attackerServer: HttpServer | undefined;
  let browser: Browser | undefined;
  let page: Page | undefined;
  const errors: string[] = [];
  try {
    for (const port of [shellPort, runtimePort]) {
      const server = await createServer({
        root,
        cacheDir: path.join(
          root,
          "node_modules",
          `.vite-hosted-browser-verifier-${port}`,
        ),
        optimizeDeps: {
          include: ["@babylonjs/core/Lights/pointLight.js"],
        },
        server: {
          host: "127.0.0.1",
          port,
          strictPort: true,
          hmr: false,
        },
      });
      await server.listen();
      servers.push(server);
    }
    attackerServer = createHttpServer((request, response) => {
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      if (request.url?.startsWith("/embed-runtime") === true) {
        response.end(`<!doctype html><title>attacker embed</title><iframe id="attacker-frame" src="${runtimeOrigin}/?hosted-runtime-frame=1&runtimeSessionId=runtime.attacker.001&sessionNonce=nonce.attacker.001"></iframe>`);
        return;
      }
      response.end("<!doctype html><title>attacker runtime</title>");
    });
    await new Promise<void>((resolve, reject) => {
      attackerServer?.once("error", reject);
      attackerServer?.listen(attackerPort, "127.0.0.1", () => resolve());
    });

    const runtimeResponse = await fetch(runtimeOrigin);
    const runtimeContentSecurityPolicy = runtimeResponse.headers.get(
      "content-security-policy",
    );
    const runtimeFrameAncestors = runtimeContentSecurityPolicy
      ?.split(";")
      .map((directive) => directive.trim())
      .filter((directive) => directive.startsWith("frame-ancestors "));
    assert.deepEqual(
      runtimeFrameAncestors,
      [`frame-ancestors ${shellOrigin}`],
      "Runtime response must admit only the Host-configured shell origin",
    );
    for (const unexpectedPublicPath of [
      "/scene-plans/green-sahara-caravan/world-plan.png",
      "/subject-assets/xier120/aerial-cockpit/v1/aerial-cockpit.glb",
      "/subject-assets/humanoid/g-bot/v2/g-bot.glb",
    ]) {
      const unexpectedResponse = await fetch(
        new URL(unexpectedPublicPath, runtimeOrigin),
        { redirect: "manual" },
      );
      assert.equal(
        unexpectedResponse.status,
        404,
        `Runtime origin must not expose unrelated public asset ${unexpectedPublicPath}`,
      );
    }
    const gBotContentHash =
      "sha256:4bcf3fabdba1e083ef54bf172fd962ca740e0f2fabdb9cddaae45d5ea208718f";
    const admittedSubjectAssetUrl = new URL(
      "/subject-assets/humanoid/g-bot/v2/g-bot.glb",
      runtimeOrigin,
    );
    admittedSubjectAssetUrl.searchParams.set(
      "worldkit-content-hash",
      gBotContentHash,
    );
    const admittedSubjectAssetResponse = await fetch(admittedSubjectAssetUrl);
    assert.equal(admittedSubjectAssetResponse.status, 200);
    assert.equal(
      `sha256:${createHash("sha256").update(Buffer.from(
        await admittedSubjectAssetResponse.arrayBuffer(),
      )).digest("hex")}`,
      gBotContentHash,
      "Runtime origin must serve the exact content-addressed Subject asset",
    );

    browser = await launchChromiumWithSystemFallback();
    const context = await browser.newContext({
      storageState: {
        cookies: [{
          name: "worldkit-hosted-cookie-probe",
          value: "must-not-cross",
          domain: "127.0.0.1",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        }],
        origins: [{
          origin: runtimeOrigin,
          localStorage: [{
            name: "worldkit-hosted-storage-probe",
            value: "must-not-cross",
          }],
        }],
      },
    });
    page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    const attackerEmbedPage = await context.newPage();
    await attackerEmbedPage.goto(`${attackerOrigin}/embed-runtime`, {
      waitUntil: "domcontentloaded",
    });
    await attackerEmbedPage.waitForTimeout(250);
    const attackerFrame = attackerEmbedPage.frames().find((candidate) =>
      candidate !== attackerEmbedPage.mainFrame());
    assert.ok(
      attackerFrame === undefined || attackerFrame.url() === "chrome-error://chromewebdata/",
      "third-party origin must not embed the dedicated Runtime",
    );
    await attackerEmbedPage.close();

    await page.goto(
      `${shellOrigin}/?hosted=1&runtimeOrigin=${encodeURIComponent(attackerOrigin)}`,
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
    assert.equal(
      new URL(frame.url()).origin,
      runtimeOrigin,
      "attacker runtimeOrigin query must not override deployment configuration",
    );
    assert.equal(
      new URL(frame.url()).searchParams.has("shellOrigin"),
      false,
      "shell origin must not be serialized as a Runtime URL query dialect",
    );
    assert.notEqual(new URL(frame.url()).origin, shellOrigin);
    const framePolicy = await page.evaluate(() => {
      const frame = window.__WORLDKIT_HOSTED_RUNTIME__?.frame;
      return {
        credentialless: frame !== undefined && "credentialless" in frame
          ? (frame as HTMLIFrameElement & { credentialless: boolean })
            .credentialless
          : false,
        sandbox: frame?.getAttribute("sandbox") ?? null,
      };
    });
    assert.equal(framePolicy.credentialless, true);
    assert.equal(framePolicy.sandbox, "allow-scripts allow-same-origin");
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
        localStorageProbe: localStorage.getItem(
          "worldkit-hosted-storage-probe",
        ),
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
    assert.equal(isolation.localStorageProbe, null);

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
        attackerRuntimeOriginRejected: true,
        thirdPartyEmbedBlocked: true,
        unrelatedPublicAssetsBlocked: true,
        subjectAssetContentHashRequired: true,
        runtimeFrameAncestors: runtimeContentSecurityPolicy,
        containerSecurityClaimed: false,
      },
    }, null, 2));
  } finally {
    await closeAll(page, browser, servers, attackerServer);
  }
}

await main();
