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
  "executeGameplayCommand",
  "getCameraPreviewState",
  "getCameraSnapshot",
  "getControlCaptureCapabilities",
  "getDiagnostics",
  "getGameplayEvents",
  "getGameplayInspectionSnapshot",
  "getRouteOverlay",
  "getRoutePathReceipt",
  "getRouteRuntimeProbeReceipt",
  "getRouteSummary",
  "getSnapshot",
  "getSubjectPresetBaseline",
  "getSubjectSnapshot",
  "getWorldStateSnapshot",
  "listCompatibleProfiles",
  "listMotionKernels",
  "listSubjectDefinitions",
  "ready",
  "releaseRuntimeActivity",
  "requestCameraProfile",
  "reset",
  "resetCameraProfile",
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
  it("installs Edit API only on the trusted authoring page and keeps V5 at 39 keys", async () => {
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
      await waitForHttpOk(`http://127.0.0.1:${port}/?authoring=1`);
      browser = await launchChromiumWithSystemFallback();

      const authoringPage = await browser.newPage();
      await authoringPage.goto(`http://127.0.0.1:${port}/?authoring=1`, {
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

      const catalogPage = await browser.newPage();
      await catalogPage.goto(`http://127.0.0.1:${port}/?scene=grassland`, {
        waitUntil: "domcontentloaded",
      });
      await catalogPage.waitForFunction(
        () => window.__WORLDKIT__?.version === 5,
        undefined,
        { timeout: 90_000 },
      );
      const catalogSurfaces = await catalogPage.evaluate(() => ({
        edit: window.__WORLDKIT_AUTHORING_EDIT__,
        runtimeKeys: Object.keys(window.__WORLDKIT__ ?? {}).sort(),
      }));
      expect(catalogSurfaces.edit).toBeUndefined();
      expect(catalogSurfaces.runtimeKeys).toEqual([...BROWSER_V5_KEYS]);
    } finally {
      await browser?.close();
      await stopVite(vite);
    }
  }, 180_000);
});
