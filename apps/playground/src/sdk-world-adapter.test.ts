import { describe, expect, it, vi } from "vitest";

import type { PhysicsSystem } from "@whitebox-world/physics";
import type { HumanoidVisual } from "@whitebox-world/subjects";
import { defineOutdoorScene } from "@whitebox-world/world";

import { SdkWorldAdapter } from "./sdk-world-adapter.js";

const constructionFailureScene = defineOutdoorScene({
  id: "artifact-construction-failure",
  build(world) {
    const terrain = world.terrain.rolling({
      id: "terrain",
      size: [20, 20],
      segments: [2, 2],
      relief: "flat",
      amplitude: 0,
      frequency: 0.1,
    });
    world.player.spawn({ terrain, at: [0, 0] });
  },
});

describe("SdkWorldAdapter artifact boundary", () => {
  it("does not expose Gameplay, Input, or fixed-simulation methods", () => {
    const prototype = SdkWorldAdapter.prototype as unknown as Record<string, unknown>;

    expect(prototype).toHaveProperty("mount");
    expect(prototype).toHaveProperty("render");
    expect(prototype).toHaveProperty("restoreOpeningView");
    expect(prototype).toHaveProperty("captureScreenshot");
    expect(prototype).toHaveProperty("inspectFeatures");
    expect(prototype).toHaveProperty("dispose");
    expect(prototype).not.toHaveProperty("setPaused");
    expect(prototype).not.toHaveProperty("isPaused");
    expect(prototype).not.toHaveProperty("reset");
    expect(prototype).not.toHaveProperty("runFixedInput");
    expect(prototype).not.toHaveProperty("snapshot");
    expect(prototype).not.toHaveProperty("subscribe");
  });

  it("releases Physics when Visual loading fails", async () => {
    const physicsDispose = vi.fn();
    const physics = { dispose: physicsDispose } as unknown as PhysicsSystem;

    await expect(SdkWorldAdapter.createArtifactRenderer(
      constructionFailureScene,
      {
        createPhysics: async () => physics,
        loadVisual: async () => {
          throw new Error("visual loading failed");
        },
      },
    )).rejects.toThrow("visual loading failed");

    expect(physicsDispose).toHaveBeenCalledOnce();
  });

  it("releases Physics and the loaded Visual when Renderer construction fails", async () => {
    const physicsDispose = vi.fn();
    const visualDispose = vi.fn();
    const physics = { dispose: physicsDispose } as unknown as PhysicsSystem;
    const visual = { dispose: visualDispose } as unknown as HumanoidVisual;

    await expect(SdkWorldAdapter.createArtifactRenderer(
      constructionFailureScene,
      {
        createPhysics: async () => physics,
        loadVisual: async () => ({
          visual,
          status: { source: "placeholder", limitations: [] },
        }),
        createRenderer() {
          throw new Error("renderer construction failed");
        },
      },
    )).rejects.toThrow("renderer construction failed");

    expect(physicsDispose).toHaveBeenCalledOnce();
    expect(visualDispose).toHaveBeenCalledOnce();
  });

  it("continues sibling cleanup and stays idempotent when one disposer throws", () => {
    const canvasRemove = vi.fn();
    const worldDispose = vi.fn();
    const subjectDispose = vi.fn();
    const physicsDispose = vi.fn();
    const rendererDispose = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const adapter = Object.assign(Object.create(SdkWorldAdapter.prototype), {
      disposed: false,
      resizeObserver: {
        disconnect() {
          throw new Error("private observer failure");
        },
      },
      canvas: { remove: canvasRemove },
      world: { dispose: worldDispose },
      subject: { dispose: subjectDispose },
      physics: { dispose: physicsDispose },
      waterMaterials: new Set(["water"]),
      renderer: { dispose: rendererDispose },
    }) as SdkWorldAdapter;

    adapter.dispose();
    adapter.dispose();

    expect(canvasRemove).toHaveBeenCalledOnce();
    expect(worldDispose).toHaveBeenCalledOnce();
    expect(subjectDispose).toHaveBeenCalledOnce();
    expect(physicsDispose).toHaveBeenCalledOnce();
    expect(rendererDispose).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith("SDK_ARTIFACT_DISPOSE_FAILED");
  });
});
