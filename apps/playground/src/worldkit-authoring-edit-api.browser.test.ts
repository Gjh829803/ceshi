import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { launchChromiumWithSystemFallback } from "../../../scripts/lib/playwright-browser-launch";

const BROWSER_V5_KEYS = [
  "acquireRuntimeActivity",
  "adjustCameraView",
  "applyCameraPreview",
  "applySubjectPresetTuning",
  "captureControlFrame",
  "captureScreenshot",
  "executeCameraViewCommand",
  "executeGameplayCommand",
  "getCameraPreviewState",
  "getCameraSnapshot",
  "getControlCaptureCapabilities",
  "getDiagnostics",
  "getGameplayInspectionSnapshot",
  "getRouteOverlay",
  "getRoutePathReceipt",
  "getRouteRuntimeProbeReceipt",
  "getRouteSummary",
  "getSnapshot",
  "getSubjectPresetBaseline",
  "getSubjectSnapshot",
  "getWorldSessionEvents",
  "getWorldStateSnapshot",
  "listCompatibleProfiles",
  "listMotionKernels",
  "listSubjectDefinitions",
  "ready",
  "releaseRuntimeActivity",
  "reset",
  "resetCameraView",
  "runFixedInput",
  "runHarness",
  "setIntent",
  "setMotionProfile",
  "setPaused",
  "validateSubjectPackage",
  "version",
  "waitForRenderReady",
  "waitForSimulationTick",
] as const;

const AUTHORING_EDIT_KEYS = [
  "applyWorldChange",
  "diffWorldChange",
  "dryRunWorldChange",
  "explainWorldChange",
  "getWorldChangeCleanupReport",
  "getWorldChangeReceipt",
  "projectAiSchema",
  "searchRegistry",
  "validateWorldChange",
  "version",
] as const;

async function availableLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected a numeric loopback port.");
  }
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
  });
  return address.port;
}

async function waitForHttpOk(url: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`Unexpected Vite response ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw lastError ?? new Error("Vite did not become ready.");
}

async function stopVite(vite: ReturnType<typeof spawn>): Promise<void> {
  if (vite.exitCode === null && vite.signalCode === null) {
    vite.kill();
    await once(vite, "exit");
  }
}

describe("WorldKit authoring edit browser installation", () => {
  it("keeps one fixed Host Viewer authoritative and keeps Edit separate from V5", async () => {
    const port = await availableLoopbackPort();
    const worktreeRoot = resolve(import.meta.dirname, "../../..");
    const vite = spawn(
      process.execPath,
      [
        resolve(worktreeRoot, "node_modules/vite/bin/vite.js"),
        "--config",
        "vite.config.mjs",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: resolve(worktreeRoot, "apps/playground"),
        env: {
          ...process.env,
          WORLDKIT_AUTHORING_SPEC_PATH: resolve(
            worktreeRoot,
            "examples/authoring/basic-world.json",
          ),
        },
        stdio: "pipe",
      },
    );
    let browser: Awaited<ReturnType<typeof launchChromiumWithSystemFallback>> | undefined;
    try {
      await waitForHttpOk(`http://127.0.0.1:${port}/`);
      browser = await launchChromiumWithSystemFallback();

      const authoringPage = await browser.newPage();
      await authoringPage.goto(`http://127.0.0.1:${port}/`, {
        waitUntil: "domcontentloaded",
      });
      await authoringPage.waitForFunction(
        () => window.__WORLDKIT_AUTHORING_EDIT__?.version === 1 &&
          window.__WORLDKIT__?.version === 5,
        undefined,
        { timeout: 90_000 },
      );
      const authoringSurfaces = await authoringPage.evaluate(() => ({
        editKeys: Object.keys(window.__WORLDKIT_AUTHORING_EDIT__ ?? {}).sort(),
        runtimeKeys: Object.keys(window.__WORLDKIT__ ?? {}).sort(),
        runtimeHasEdit: Object.prototype.hasOwnProperty.call(
          window.__WORLDKIT__ ?? {},
          "validateWorldChange",
        ),
      }));
      expect(authoringSurfaces.editKeys).toEqual([...AUTHORING_EDIT_KEYS]);
      expect(authoringSurfaces.runtimeKeys).toEqual([...BROWSER_V5_KEYS]);
      expect(authoringSurfaces.runtimeHasEdit).toBe(false);
      await authoringPage.close();

      const substitutionPage = await browser.newPage();
      await substitutionPage.goto(
        `http://127.0.0.1:${port}/?scene=action-lab`,
        {
          waitUntil: "domcontentloaded",
        },
      );
      await substitutionPage.waitForFunction(
        () => window.__WORLDKIT_AUTHORING_EDIT__?.version === 1 &&
          window.__WORLDKIT__?.version === 5,
        undefined,
        { timeout: 90_000 },
      );
      const fixedHostSurfaces = await substitutionPage.evaluate(() => ({
        adapterName: document.querySelector("#adapter-name")?.textContent,
        editKeys: Object.keys(window.__WORLDKIT_AUTHORING_EDIT__ ?? {}).sort(),
        runtimeKeys: Object.keys(window.__WORLDKIT__ ?? {}).sort(),
        scenePickerHidden: document.querySelector("#scene-picker")?.hasAttribute("hidden"),
      }));
      expect(fixedHostSurfaces.adapterName).toBe("babylon-havok/basic-world");
      expect(fixedHostSurfaces.editKeys).toEqual([...AUTHORING_EDIT_KEYS]);
      expect(fixedHostSurfaces.runtimeKeys).toEqual([...BROWSER_V5_KEYS]);
      expect(fixedHostSurfaces.scenePickerHidden).toBe(true);
      await substitutionPage.close();

      const artifactSubstitutionPage = await browser.newPage();
      await artifactSubstitutionPage.goto(
        `http://127.0.0.1:${port}/?artifact=1&scene=canyon`,
        { waitUntil: "domcontentloaded" },
      );
      await artifactSubstitutionPage.waitForFunction(
        () => document.documentElement.dataset.worldkitStatus === "error",
        undefined,
        { timeout: 30_000 },
      );
      const artifactSubstitution = await artifactSubstitutionPage.evaluate(() => ({
        adapterName: document.querySelector("#adapter-name")?.textContent,
        inspectionText: document.querySelector("#inspection")?.textContent,
        worldkitApiExposed: Object.hasOwn(window, "__WORLDKIT__"),
        playgroundApiExposed: Object.hasOwn(window, "__WHITEBOX_PLAYGROUND__"),
      }));
      expect(artifactSubstitution.adapterName).toBe("route-error");
      expect(artifactSubstitution.inspectionText).toContain(
        "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
      );
      expect(artifactSubstitution.worldkitApiExposed).toBe(false);
      expect(artifactSubstitution.playgroundApiExposed).toBe(false);

      const worldSubstitutionPage = await browser.newPage();
      await worldSubstitutionPage.goto(
        `http://127.0.0.1:${port}/?world=studio-world`,
        { waitUntil: "domcontentloaded" },
      );
      await worldSubstitutionPage.waitForFunction(
        () => document.documentElement.dataset.worldkitStatus === "error",
        undefined,
        { timeout: 30_000 },
      );
      const worldSubstitution = await worldSubstitutionPage.evaluate(() => ({
        adapterName: document.querySelector("#adapter-name")?.textContent,
        inspectionText: document.querySelector("#inspection")?.textContent,
        worldkitApiExposed: Object.hasOwn(window, "__WORLDKIT__"),
      }));
      expect(worldSubstitution.adapterName).toBe("route-error");
      expect(worldSubstitution.inspectionText).toContain(
        "PLAYGROUND_RUNTIME_ROUTE_REMOVED",
      );
      expect(worldSubstitution.worldkitApiExposed).toBe(false);
    } finally {
      await browser?.close();
      await stopVite(vite);
    }
  }, 180_000);

  it("rejects Browser world selection before any Studio-owned Viewer source loads", async () => {
    const port = await availableLoopbackPort();
    const worktreeRoot = resolve(import.meta.dirname, "../../..");
    const vite = spawn(
      process.execPath,
      [
        resolve(worktreeRoot, "node_modules/vite/bin/vite.js"),
        "--config",
        "vite.config.mjs",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: resolve(worktreeRoot, "apps/playground"),
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => key !== "WORLDKIT_AUTHORING_SPEC_PATH",
          ),
        ),
        stdio: "pipe",
      },
    );
    let browser: Awaited<ReturnType<typeof launchChromiumWithSystemFallback>> | undefined;
    try {
      await waitForHttpOk(`http://127.0.0.1:${port}/`);
      browser = await launchChromiumWithSystemFallback();
      const page = await browser.newPage();
      await page.goto(
        `http://127.0.0.1:${port}/?world=studio-world&artifact=1&scene=canyon`,
        { waitUntil: "domcontentloaded" },
      );
      await page.waitForFunction(
        () => document.documentElement.dataset.worldkitStatus === "error",
        undefined,
        { timeout: 30_000 },
      );
      const result = await page.evaluate(() => ({
        adapterName: document.querySelector("#adapter-name")?.textContent,
        inspectionText: document.querySelector("#inspection")?.textContent,
        worldkitApiExposed: Object.hasOwn(window, "__WORLDKIT__"),
        playgroundApiExposed: Object.hasOwn(window, "__WHITEBOX_PLAYGROUND__"),
      }));
      expect(result.adapterName).toBe("route-error");
      expect(result.inspectionText).toContain("PLAYGROUND_RUNTIME_ROUTE_REMOVED");
      expect(result.worldkitApiExposed).toBe(false);
      expect(result.playgroundApiExposed).toBe(false);
    } finally {
      await browser?.close();
      await stopVite(vite);
    }
  }, 180_000);
});
