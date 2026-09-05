import { Engine } from "@babylonjs/core/Engines/engine.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { BabylonWorldRuntime } from "@whitebox-world/runtime-babylon";
import { bindRuntimeTestPossession } from "@whitebox-world/runtime-babylon/testing";
import { runtimeWorldConfigurationFromVerifiedWorldPackageV1 } from "@whitebox-world/runtime-host";
import { peekBabylonNativeBlockLiveHandleRegistryV1 } from
  "@whitebox-world/native-babylon-block-profile/host";
import { prepareBudgetRuntimeFixture } from "./package-fixture.js";

declare global { interface Window {
  __NATIVE_BUDGET_MEASUREMENT__?: {
    status: "running" | "ready" | "failed"; stage: string; result?: unknown; error?: string;
    measureFrames?: () => Promise<unknown>;
  };
} }

const probe = window.__NATIVE_BUDGET_MEASUREMENT__ = {
  status: "running" as "running" | "ready" | "failed", stage: "admission",
} as NonNullable<Window["__NATIVE_BUDGET_MEASUREMENT__"]>;

async function start() {
  const count = Number(new URLSearchParams(location.search).get("blocks"));
  const fixture = await prepareBudgetRuntimeFixture(count);
  probe.stage = "runtime";
  const configuration = runtimeWorldConfigurationFromVerifiedWorldPackageV1(fixture.verified);
  if (configuration.sceneSource.kind !== "babylon-native-scene") throw new Error("Expected Native source");
  const canvas = document.querySelector("canvas")!;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  engine.setSize(1280, 720);
  const started = performance.now();
  const stages: { stage: string; elapsedMilliseconds: number }[] = [];
  const runtime = await BabylonWorldRuntime.create({
    sceneSource: {
      kind: "babylon-native-scene", verifiedWorldPackage: fixture.verified,
      descriptor: {
        runtimeSessionId: "runtime.budget", worldSessionId: "world-session.budget",
        worldBuildIdentity: configuration.worldBuildIdentity,
        gameplayBootstrap: configuration.gameplayBootstrap,
        worldRuntimeBootstrap: configuration.worldRuntimeBootstrap,
        sceneSource: configuration.sceneSource,
      },
      moduleLoader: { async load() { return fixture.module; } },
    },
    worldRuntimeBootstrap: fixture.verified.worldRuntimeBootstrap,
    gameplayBootstrap: fixture.verified.gameplayBootstrap,
    runtimeSessionId: "runtime.budget", engineFactory: () => engine,
    autoStartRenderLoop: false,
    subjectAssetResolver: { async resolveSubjectAsset() {
      const response = await fetch("/budget-g-bot.glb");
      if (!response.ok) throw new Error("Budget fixture G Bot fetch failed");
      return { bytes: new Uint8Array(await response.arrayBuffer()), sourceLabel: "budget-fixture:g-bot" };
    } },
    onInitializationStage(stage) { probe.stage = stage; stages.push({ stage, elapsedMilliseconds: performance.now() - started }); },
  });
  await bindRuntimeTestPossession(runtime, fixture.verified.worldRuntimeBootstrap.initialControlledEntityId);
  const scene = (runtime as unknown as { scene: Scene }).scene;
  const nativeHandles = peekBabylonNativeBlockLiveHandleRegistryV1(scene);
  await runtime.renderFrameWhenReady();
  const runtimeReadyMilliseconds = performance.now() - started;
  // Test-only seam; the product still owns ticking, Havok, Camera and rendering.
  probe.measureFrames = async () => {
    const ticks: number[] = [], frames: number[] = [];
    for (let tick = 0; tick < 90; tick += 1) {
      const beginTick = performance.now();
      await runtime.runFixedInput({ actions: [], ticks: 1 });
      const endTick = performance.now();
      runtime.renderFrame();
      // Finish submitted GPU work so this is not merely CPU command submission.
      const gl = engine._gl;
      gl.finish();
      const endFrame = performance.now();
      if (tick >= 30) { ticks.push(endTick - beginTick); frames.push(endFrame - endTick); }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return { fixedTickMilliseconds: ticks, renderAndGpuFinishMilliseconds: frames,
      finalSubject: runtime.snapshot().subjectStatesByEntityId[fixture.verified.worldRuntimeBootstrap.initialControlledEntityId],
      resources: runtime.snapshot().resources };
  };
  probe.result = { ...fixture.measurement, runtimeReadyMilliseconds, stages,
    visualRealization: nativeHandles?.realization,
    meshCount: scene.meshes.length, geometryCount: scene.geometries.length,
    gpu: engine.getGlInfo(), viewport: { width: 1280, height: 720 },
  };
  probe.status = "ready"; probe.stage = "ready";
  window.addEventListener("pagehide", () => { void runtime.dispose(); }, { once: true });
}

void start().catch((error: unknown) => {
  probe.status = "failed"; probe.error = error instanceof Error ? error.stack ?? error.message : String(error);
});
