import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, Page } from "playwright";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import { expect, it } from "vitest";

import { launchChromiumWithSystemFallback } from "../../../scripts/lib/playwright-browser-launch.js";
import type { CreatorHarnessConfigV1 } from "./browser-contract.js";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

async function smokeInputsPlugin(): Promise<Plugin> {
  const readFixture = async (name: string) => JSON.parse(await readFile(
    path.join(REPOSITORY_ROOT, "apps/native-scene-playground/src", name), "utf8",
  ));
  const runtime = await readFixture("cloud-ridge-world-runtime-bootstrap.json");
  const gameplay = await readFixture("cloud-ridge-gameplay-bootstrap.json");
  const config: CreatorHarnessConfigV1 = {
    sceneId: "creator-harness-smoke",
    inputHash: "experimental-smoke-input",
    worldBounds: { centerMetersXZ: [0, -20], sizeMetersXZ: [160, 160], heightRangeMeters: [-30, 120] },
    admissionBudget: {
      maximumStaticColliderCount: 10,
      maximumStaticColliderVertexCount: 10_000,
      maximumStaticColliderTriangleCount: 10_000,
    },
  };
  const values = {
    runtimeBootstrap: runtime,
    gameplayBootstrap: gameplay,
    nativeBootstrap: {
      kind: "babylon-native-scene-bootstrap",
      schemaVersion: 1,
      id: "creator-harness-smoke",
      sceneModuleRef: "worldkit://native-scene/cloud-ridge@1",
      nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
      nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox.standard@1",
      gameplayBootstrapRef: gameplay.resourceRef,
      initialControlledEntityId: runtime.initialControlledEntityId,
      gravityMetersPerSecondSquaredXYZ: runtime.gravityMetersPerSecondSquaredXYZ,
      initialCamera: {
        mode: "third-person",
        pitchRadians: runtime.initialCamera.pitchRadians,
        distanceMeters: runtime.initialCamera.distanceMeters,
        fovDegrees: runtime.initialCamera.fovDegrees,
        targetHeightMeters: runtime.initialCamera.targetHeightMeters,
      },
      seed: 0x5eed_c10d,
      spawnMarkerId: "player-spawn",
    },
    assetUrls: {
      "worldkit://subject-asset/actor.humanoid.g-bot@2": "./subject-assets/humanoid/g-bot/v2/g-bot.glb",
    },
    creatorConfig: config,
  };
  return {
    name: "creator-harness-test-inputs",
    resolveId(id) { return id.startsWith("virtual:creator-") ? `\0${id}` : undefined; },
    load(id) {
      if (id === "\0virtual:creator-config") {
        return Object.entries(values).map(([name, value]) => `export const ${name}=${JSON.stringify(value)};`).join("\n");
      }
      if (id === "\0virtual:creator-scene") {
        const scenePath = path.join(REPOSITORY_ROOT, "apps/native-scene-playground/src/cloud-ridge-scene.ts");
        return `import {createCloudRidgeNativeSceneControllerV1} from ${JSON.stringify(scenePath)}; export default createCloudRidgeNativeSceneControllerV1().module;`;
      }
      return undefined;
    },
  };
}

it("runs a paused real Native/G Bot world, captures three views and serializes input, reset and disposal", async () => {
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  let page: Page | undefined;
  try {
    server = await createServer({
      root: path.join(REPOSITORY_ROOT, "apps/creator-playground"),
      base: "/nested/creator/",
      configFile: false,
      publicDir: path.join(REPOSITORY_ROOT, "apps/playground/public"),
      plugins: [await smokeInputsPlugin()],
      logLevel: "error",
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    browser = await launchChromiumWithSystemFallback();
    page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const browserErrors: string[] = [];
    const assetRequestPaths: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.endsWith("/g-bot.glb")) assetRequestPaths.push(pathname);
    });
    await page.goto(server.resolvedUrls!.local[0]!, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__WORLDKIT_CREATOR__?.ready ||
      window.__WORLDKIT_CREATOR_STATUS__?.phase === "failed", undefined, { timeout: 90_000 });

    const evidence = await page.evaluate(async () => {
      const api = window.__WORLDKIT_CREATOR__;
      if (api === undefined) throw new Error(JSON.stringify(window.__WORLDKIT_CREATOR_STATUS__));
      const initial = api.snapshot();
      const captures = [];
      captures.push(await api.capture({ view: "opening", widthPixels: 640, heightPixels: 360 }));
      captures.push(await api.capture({ view: "top-down", widthPixels: 512, heightPixels: 512 }));
      captures.push(await api.capture({ view: "entity-triview", entityIds: ["g-bot-primary"], widthPixels: 768, heightPixels: 256 }));
      const afterCapture = api.snapshot();
      const moved = await api.runFixedInput({ actions: ["move-forward"], ticks: 30 });
      await api.adjustCamera({ yawRadiansDelta: 0.2 });
      const [reset, afterQueuedInput] = await Promise.all([
        api.reset(),
        api.runFixedInput({ actions: [], ticks: 10 }),
      ]);
      await api.startLive();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await api.stopLive();
      const stoppedTick = api.snapshot().tick;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const stillStoppedTick = api.snapshot().tick;
      const originalRequestFrame = window.requestAnimationFrame;
      const originalCancelFrame = window.cancelAnimationFrame;
      const scheduledFrames = new Map<number, FrameRequestCallback>();
      let nextFrameId = 0;
      let restartedLoopCount = 0;
      try {
        window.requestAnimationFrame = (callback) => {
          const id = ++nextFrameId;
          scheduledFrames.set(id, callback);
          return id;
        };
        window.cancelAnimationFrame = (id) => { scheduledFrames.delete(id); };
        await api.startLive();
        const staleFrame = [...scheduledFrames.values()][0]!;
        await api.stopLive();
        await api.startLive();
        // A callback already in flight may finish after a rapid stop/start.
        staleFrame(performance.now());
        await api.runFixedInput({ actions: [], ticks: 0 });
        restartedLoopCount = scheduledFrames.size;
        await api.stopLive();
      } finally {
        window.requestAnimationFrame = originalRequestFrame;
        window.cancelAnimationFrame = originalCancelFrame;
      }
      const audit = api.audit();
      await api.dispose();
      return {
        initial,
        afterCapture,
        moved,
        reset,
        afterQueuedInput,
        stoppedTick,
        stillStoppedTick,
        restartedLoopCount,
        audit,
        disposed: window.__WORLDKIT_CREATOR__ === undefined && window.__WORLDKIT_CREATOR_STATUS__?.phase === "disposed",
        captures: captures.map((capture) => ({
          width: capture.widthPixels,
          height: capture.heightPixels,
          isPng: capture.dataUrl.startsWith("data:image/png;base64,"),
          dataLength: capture.dataUrl.length,
        })),
      };
    });
    const subject = "g-bot-primary";
    expect(evidence.initial.subjectStatesByEntityId[subject]!.movementMedium).toBe("ground");
    expect(evidence.initial.subjectStatesByEntityId[subject]!.positionMetersXYZ[1]).toBeLessThan(0.1);
    expect(evidence.afterCapture.tick).toBe(evidence.initial.tick);
    expect(evidence.afterCapture.camera).toEqual(evidence.initial.camera);
    expect(evidence.moved.tick).toBe(evidence.initial.tick + 30);
    expect(evidence.moved.subjectStatesByEntityId[subject]!.positionMetersXYZ[2])
      .toBeLessThan(evidence.initial.subjectStatesByEntityId[subject]!.positionMetersXYZ[2] - 0.5);
    expect(evidence.reset.subjectStatesByEntityId[subject]!.positionMetersXYZ)
      .toEqual(evidence.initial.subjectStatesByEntityId[subject]!.positionMetersXYZ);
    expect(evidence.afterQueuedInput.tick).toBe(evidence.reset.tick + 10);
    expect(evidence.stillStoppedTick).toBe(evidence.stoppedTick);
    expect(evidence.restartedLoopCount).toBe(1);
    expect(evidence.audit).toMatchObject({ kind: "experimental-native-creator-audit", errors: [], isLive: false });
    expect(evidence.captures.map(({ width, height }) => [width, height])).toEqual([[640, 360], [512, 512], [768, 256]]);
    expect(evidence.captures.every(({ isPng, dataLength }) => isPng && dataLength > 1000)).toBe(true);
    expect(evidence.disposed).toBe(true);
    expect(assetRequestPaths).toContain("/nested/creator/subject-assets/humanoid/g-bot/v2/g-bot.glb");
    await page.goto(`${server.resolvedUrls!.local[0]!}?play=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__WORLDKIT_CREATOR__?.audit().isLive === true,
      undefined, { timeout: 90_000 });
    await page.evaluate(() => window.__WORLDKIT_CREATOR__!.dispose());
    expect(browserErrors).toEqual([]);
  } finally {
    await page?.close();
    await browser?.close();
    await server?.close();
  }
}, 120_000);
